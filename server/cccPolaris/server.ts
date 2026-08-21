import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseClaudeTranscriptJsonl, type ClaudeTranscriptMessage } from './claudeTranscript.js';

type JsonObject = Record<string, unknown>;

const host = process.env.POLARIS_HOST?.trim() || '127.0.0.1';
const port = Number.parseInt(process.env.POLARIS_PORT || '8796', 10);
const staticRoot = path.resolve(process.env.POLARIS_STATIC_DIR || path.join(process.cwd(), 'dist'));
const cccBackend = new URL(process.env.CCC_BACKEND || 'http://127.0.0.1:8795');
const claudeProjectDir = process.env.POLARIS_CLAUDE_PROJECT_DIR?.trim() || '/home/ubuntu/las-ruinas-circulares';
const transcriptRoot = resolveTranscriptRoot();
const hostId = 'ccc-claude-code-vps';
const hostLabel = process.env.POLARIS_CCC_LABEL?.trim() || 'Claude Code · VPS';
let transcriptCache: { filePath: string; mtimeMs: number; text: string } | null = null;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function resolveTranscriptRoot() {
  const explicit = process.env.POLARIS_CLAUDE_TRANSCRIPT_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const encodedProject = claudeProjectDir.replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encodedProject);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function sendError(response: ServerResponse, statusCode: number, message: string) {
  sendJson(response, statusCode, { error: { message } });
}

function applySecurityHeaders(response: ServerResponse) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(), clipboard-read=(self), clipboard-write=(self)'
  );
  response.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; ')
  );
}

async function readJsonBody(request: IncomingMessage, limit = 1024 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('request too large');
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!isObject(value)) throw new Error('invalid json');
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === 'request too large') throw error;
    throw new Error('invalid json');
  }
}

async function readRawBody(request: IncomingMessage, limit = 50 * 1024 * 1024) {
  const declaredLength = Number.parseInt(request.headers['content-length'] || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new Error('attachment too large (max 50MB)');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('attachment too large (max 50MB)');
    chunks.push(buffer);
  }
  if (size === 0) throw new Error('attachment is empty');
  return Buffer.concat(chunks);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function requestCcc(token: string, pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Auth-Token', token);
  const response = await fetch(new URL(pathname, cccBackend), { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  return { response, payload };
}

async function validateCccToken(token: string) {
  if (!token) return false;
  try {
    const { response } = await requestCcc(token, '/chat/status');
    return response.ok;
  } catch {
    return false;
  }
}

async function readLatestTranscript() {
  let entries;
  try {
    entries = await readdir(transcriptRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(async (entry) => {
        const filePath = path.join(transcriptRoot, entry.name);
        try {
          const info = await stat(filePath);
          return { filePath, mtimeMs: info.mtimeMs };
        } catch {
          return null;
        }
      })
  );
  const latest = candidates
    .filter((candidate): candidate is { filePath: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) return null;
  if (
    transcriptCache
    && transcriptCache.filePath === latest.filePath
    && transcriptCache.mtimeMs === latest.mtimeMs
  ) {
    return transcriptCache;
  }
  transcriptCache = {
    ...latest,
    text: await readFile(latest.filePath, 'utf8')
  };
  return {
    ...transcriptCache
  };
}

function parseRecordTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapCccHistory(payload: unknown): ClaudeTranscriptMessage[] {
  if (!isObject(payload) || !Array.isArray(payload.records)) return [];
  return payload.records.flatMap((record, index) => {
    if (!isObject(record)) return [];
    const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
    const content = readString(record.text);
    if (!role || !content) return [];
    const timestamp = parseRecordTimestamp(record.ts);
    const remoteId = readString(record.turn_id) || `${role}:${timestamp}:${index}:${content}`;
    return [{
      id: `ccc-${createHash('sha1').update(remoteId).digest('hex').slice(0, 20)}`,
      role,
      content,
      timestamp,
      origin: role === 'assistant' ? 'assistant-reply' : 'user-input',
      assistantName: role === 'assistant' ? 'Claude Code' : undefined
    } satisfies ClaudeTranscriptMessage];
  });
}

async function buildSnapshot(token: string) {
  const [statusResult, transcript] = await Promise.all([
    requestCcc(token, '/chat/status'),
    readLatestTranscript()
  ]);
  const historyResult = await requestCcc(
    token,
    transcript ? '/chat/history?limit=1' : '/chat/history?limit=10000'
  );
  if (!statusResult.response.ok || !historyResult.response.ok) {
    throw new Error('CcCompanion 鉴权失败或暂时不可用。');
  }
  const status = isObject(statusResult.payload) ? statusResult.payload : {};
  const active = status.typing === true || status.busy === true || status.running === true;
  const fallbackMessages = mapCccHistory(historyResult.payload);
  const transcriptMessages = transcript
    ? parseClaudeTranscriptJsonl(transcript.text, { active })
    : [];
  const messages = transcriptMessages.length > 0 ? transcriptMessages : fallbackMessages;
  const historyTimestamp = fallbackMessages.at(-1)?.timestamp ?? 0;
  const updatedAt = Math.max(transcript?.mtimeMs ?? 0, historyTimestamp, 1);
  const threadKey = transcript
    ? path.basename(transcript.filePath, '.jsonl')
    : 'ccc-history';

  return {
    hostId,
    hostLabel,
    threadKey,
    conversationTitle: 'Claude Code',
    collaboratorId: null,
    collaboratorName: 'Claude Code',
    messages,
    updatedAt
  };
}

async function handleCompanionRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) {
  if (request.method !== 'POST') {
    sendError(response, 405, 'method not allowed');
    return;
  }

  let body: JsonObject;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendError(response, 400, error instanceof Error ? error.message : 'invalid request');
    return;
  }

  if (pathname === '/api/companion/polaris/client/connect') {
    const token = readString(body.pairCode);
    if (!(await validateCccToken(token))) {
      sendError(response, 401, '访问密钥不正确，或 CcCompanion 暂时不可用。');
      return;
    }
    sendJson(response, 200, {
      hostId,
      hostLabel,
      source: 'codex',
      clientId: `ccc-${createHash('sha256').update(token).digest('hex').slice(0, 16)}`,
      clientSecret: token,
      connectedAt: Date.now()
    });
    return;
  }

  const token = readString(body.clientSecret);
  if (!(await validateCccToken(token))) {
    sendError(response, 401, '访问密钥已失效，请重新连接 Claude Code。');
    return;
  }

  if (pathname === '/api/companion/polaris/client/snapshot') {
    try {
      sendJson(response, 200, { hostLabel, snapshot: await buildSnapshot(token) });
    } catch (error) {
      sendError(response, 502, error instanceof Error ? error.message : '读取 Claude Code 会话失败。');
    }
    return;
  }

  if (pathname === '/api/companion/polaris/client/command') {
    const text = readString(body.text);
    if (!text) {
      sendError(response, 400, '消息不能为空。');
      return;
    }
    const { response: cccResponse, payload } = await requestCcc(token, '/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!cccResponse.ok) {
      const message = isObject(payload) ? readString(payload.error) : '';
      sendError(response, cccResponse.status, message || '消息没有送进 Claude Code。');
      return;
    }
    sendJson(response, 200, { ok: true, commandId: randomUUID() });
    return;
  }

  if (
    pathname === '/api/companion/polaris/client/disconnect'
    || pathname === '/api/companion/polaris/client/push-token'
    || pathname === '/api/companion/polaris/client/automation'
  ) {
    sendJson(response, 200, { ok: true, updatedAt: Date.now(), ruleCount: 0 });
    return;
  }

  sendError(response, 404, 'not found');
}

async function handleCompanionUploadRoute(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL
) {
  if (request.method !== 'POST') {
    sendError(response, 405, 'method not allowed');
    return;
  }
  const token = readString(request.headers['x-companion-client-secret']);
  if (!(await validateCccToken(token))) {
    sendError(response, 401, '访问密钥已失效，请重新连接 Claude Code。');
    return;
  }
  const filename = requestUrl.searchParams.get('filename')?.trim() || 'upload.bin';
  const text = requestUrl.searchParams.get('text')?.trim() || '';
  let bytes: Buffer;
  try {
    bytes = await readRawBody(request);
  } catch (error) {
    sendError(response, 400, error instanceof Error ? error.message : '读取附件失败。');
    return;
  }
  const params = new URLSearchParams({ filename, role: 'user' });
  if (text) params.set('text', text);
  const { response: cccResponse, payload } = await requestCcc(token, `/chat/upload?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers['content-type'] || 'application/octet-stream'
    },
    body: bytes
  });
  if (!cccResponse.ok) {
    const message = isObject(payload) ? readString(payload.error) : '';
    sendError(response, cccResponse.status, message || '附件没有送进 Claude Code。');
    return;
  }
  sendJson(response, 200, payload ?? { ok: true });
}

function proxyToCcc(request: IncomingMessage, response: ServerResponse, requestUrl: URL) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, cccBackend);
  const headers = { ...request.headers, host: cccBackend.host };
  delete headers.connection;
  const upstream = http.request(target, { method: request.method, headers }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders.connection;
    response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) sendError(response, 502, 'CcCompanion 暂时不可用。');
    else response.destroy();
  });
  request.pipe(upstream);
}

function resolveStaticPath(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(staticRoot, relative);
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${path.sep}`)) return null;
  return candidate;
}

async function findStaticFile(pathname: string) {
  const candidate = resolveStaticPath(pathname);
  if (!candidate) return null;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return { filePath: candidate, size: info.size };
    if (info.isDirectory()) {
      const indexPath = path.join(candidate, 'index.html');
      const indexInfo = await stat(indexPath);
      if (indexInfo.isFile()) return { filePath: indexPath, size: indexInfo.size };
    }
  } catch {
    // SPA routes fall through to index.html.
  }
  if (!path.extname(pathname)) {
    const indexPath = path.join(staticRoot, 'index.html');
    try {
      const indexInfo = await stat(indexPath);
      if (indexInfo.isFile()) return { filePath: indexPath, size: indexInfo.size };
    } catch {
      return null;
    }
  }
  return null;
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, requestUrl: URL) {
  const file = await findStaticFile(requestUrl.pathname);
  if (!file) {
    sendError(response, 404, 'not found');
    return;
  }
  const extension = path.extname(file.filePath).toLowerCase();
  const immutableAsset = requestUrl.pathname.startsWith('/assets/');
  applySecurityHeaders(response);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': immutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file.filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/proxy-health') {
    sendJson(response, 200, { ok: true, mode: 'polaris-native-ccc' });
    return;
  }

  if (requestUrl.pathname.startsWith('/api/companion/polaris/client/')) {
    if (requestUrl.pathname === '/api/companion/polaris/client/upload') {
      void handleCompanionUploadRoute(request, response, requestUrl).catch(() => {
        if (!response.headersSent) sendError(response, 500, 'Companion 附件上传失败。');
        else response.destroy();
      });
      return;
    }
    void handleCompanionRoute(request, response, requestUrl.pathname).catch(() => {
      if (!response.headersSent) sendError(response, 500, 'Companion 请求失败。');
      else response.destroy();
    });
    return;
  }

  if (requestUrl.pathname.startsWith('/chat/') || requestUrl.pathname.startsWith('/v1/')) {
    proxyToCcc(request, response, requestUrl);
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendError(response, 405, 'method not allowed');
    return;
  }

  void serveStatic(request, response, requestUrl).catch(() => {
    if (!response.headersSent) sendError(response, 500, 'static file error');
    else response.destroy();
  });
});

server.listen(port, host, () => {
  console.log(`Polaris native CCC listening on http://${host}:${port}`);
  console.log(`Static files: ${staticRoot}`);
  console.log(`CcCompanion: ${cccBackend.origin}`);
  console.log(`Claude transcript: ${transcriptRoot}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
