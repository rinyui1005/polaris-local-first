import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const host = process.env.POLARIS_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.POLARIS_PORT || '8796', 10);
const backend = new URL(process.env.CCC_BACKEND || 'http://127.0.0.1:8795');
const staticRoot = path.resolve(process.env.POLARIS_STATIC_DIR || path.join(process.cwd(), 'dist'));
const runFile = promisify(execFile);
const tmuxBin = process.env.POLARIS_TMUX_BIN || '/usr/bin/tmux';
const tmuxSession = process.env.POLARIS_TMUX_SESSION || 'cc';
const sessionStatePath = path.resolve(
  process.env.POLARIS_SESSION_STATE || path.join(os.homedir(), '.config', 'polaris-cc', 'session.json'),
);

const modelChoices = [
  { id: 'default', label: '默认', description: 'Sonnet 5 · 推荐' },
  { id: 'sonnet', label: 'Sonnet 5', description: '日常任务更省用量' },
  { id: 'fable', label: 'Fable 5', description: '最强长任务 · 需要 usage credits' },
  { id: 'opus', label: 'Opus 5', description: '复杂任务 · 约 2× Sonnet 用量' },
  { id: 'haiku', label: 'Haiku 4.5', description: '最快，适合简短回答' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', description: '更多 · 指定旧版' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', description: '更多 · 指定旧版' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', description: '保留的旧版本' },
];
const effortChoices = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'xhigh', label: '极高' },
  { id: 'max', label: '最大' },
];
const modelIds = new Set(modelChoices.map((choice) => choice.id));
const effortIds = new Set(effortChoices.map((choice) => choice.id));
const defaultSessionState = {
  model: process.env.POLARIS_CLAUDE_MODEL || 'claude-opus-4-6',
  effort: process.env.POLARIS_CLAUDE_EFFORT || 'high',
  thinking: process.env.POLARIS_SHOW_THINKING !== 'false',
};

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function sendJson(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
}

async function readSessionState() {
  try {
    const parsed = JSON.parse(await readFile(sessionStatePath, 'utf8'));
    return {
      model: modelIds.has(parsed.model) ? parsed.model : defaultSessionState.model,
      effort: effortIds.has(parsed.effort) ? parsed.effort : defaultSessionState.effort,
      thinking: typeof parsed.thinking === 'boolean' ? parsed.thinking : defaultSessionState.thinking,
    };
  } catch {
    return { ...defaultSessionState };
  }
}

async function saveSessionState(value) {
  await mkdir(path.dirname(sessionStatePath), { recursive: true, mode: 0o700 });
  await writeFile(sessionStatePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function readJsonBody(request, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    request.on('error', reject);
  });
}

function fetchCompanionStatus(request) {
  return new Promise((resolve) => {
    const target = new URL('/chat/status', backend);
    const headers = { Accept: 'application/json' };
    const token = request.headers['x-auth-token'] || request.headers['x-auth'];
    if (token) headers['X-Auth-Token'] = token;
    const upstream = http.request(target, { method: 'GET', headers }, (upstreamResponse) => {
      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* ignored */ }
        resolve({ statusCode: upstreamResponse.statusCode || 502, body });
      });
    });
    upstream.on('error', () => resolve({ statusCode: 502, body: {} }));
    upstream.end();
  });
}

function sessionOptionsPayload(current, configurable = true, note) {
  return {
    ok: true,
    current,
    models: modelChoices,
    efforts: effortChoices,
    configurable,
    note,
  };
}

async function handleSessionOptions(request, response) {
  const companion = await fetchCompanionStatus(request);
  if (companion.statusCode === 401 || companion.statusCode === 403) {
    sendJson(response, 401, { error: 'auth required' });
    return;
  }
  if (companion.statusCode !== 200) {
    sendJson(response, 502, { error: 'CcCompanion is temporarily unavailable' });
    return;
  }

  const current = await readSessionState();
  const busy = companion.body?.typing === true;
  sendJson(response, 200, sessionOptionsPayload(
    current,
    !busy,
    busy ? '等这次回复完成后就可以切换。' : '模型和强度立即作用于当前会话；Thinking 开关只控制网页显示。',
  ));
}

async function handleSessionApply(request, response) {
  const companion = await fetchCompanionStatus(request);
  if (companion.statusCode === 401 || companion.statusCode === 403) {
    sendJson(response, 401, { error: 'auth required' });
    return;
  }
  if (companion.statusCode !== 200) {
    sendJson(response, 502, { error: 'CcCompanion is temporarily unavailable' });
    return;
  }
  if (companion.body?.typing === true) {
    sendJson(response, 409, { error: '请等这次回复完成后再切换。' });
    return;
  }

  let requested;
  try {
    requested = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }
  if (!modelIds.has(requested.model) || !effortIds.has(requested.effort) || typeof requested.thinking !== 'boolean') {
    sendJson(response, 400, { error: 'unsupported session option' });
    return;
  }

  const previous = await readSessionState();
  try {
    if (requested.model !== previous.model) {
      await runFile(tmuxBin, ['send-keys', '-t', tmuxSession, `/model ${requested.model}`, 'Enter']);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (requested.effort !== previous.effort) {
      await runFile(tmuxBin, ['send-keys', '-t', tmuxSession, `/effort ${requested.effort}`, 'Enter']);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const current = {
      model: requested.model,
      effort: requested.effort,
      thinking: requested.thinking,
    };
    await saveSessionState(current);
    sendJson(response, 200, sessionOptionsPayload(
      current,
      true,
      '模型和强度已应用到当前会话；Thinking 开关只控制网页显示。',
    ));
  } catch {
    sendJson(response, 500, { error: '无法把设置送到 Claude Code 会话。' });
  }
}

function proxyToCompanion(request, response, requestUrl) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, backend);
  const headers = { ...request.headers, host: backend.host };
  delete headers.connection;

  const upstream = http.request(target, {
    method: request.method,
    headers,
  }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders.connection;
    response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', () => {
    if (!response.headersSent) {
      sendJson(response, 502, { error: 'CcCompanion is temporarily unavailable' });
    } else {
      response.destroy();
    }
  });
  request.pipe(upstream);
}

function resolveStaticPath(pathname) {
  let decoded;
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

async function findStaticFile(pathname) {
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
    // Single-page application routes fall through to index.html below.
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

async function serveStatic(request, response, requestUrl) {
  const file = await findStaticFile(requestUrl.pathname);
  if (!file) {
    sendJson(response, 404, { error: 'not found' });
    return;
  }

  const extension = path.extname(file.filePath).toLowerCase();
  const immutableAsset = requestUrl.pathname.startsWith('/assets/');
  applySecurityHeaders(response);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': immutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
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
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === '/session/options' && request.method === 'GET') {
    void handleSessionOptions(request, response).catch(() => sendJson(response, 500, { error: 'session options error' }));
    return;
  }

  if (requestUrl.pathname === '/session/apply' && request.method === 'POST') {
    void handleSessionApply(request, response).catch(() => sendJson(response, 500, { error: 'session apply error' }));
    return;
  }

  if (
    requestUrl.pathname.startsWith('/chat/')
    || requestUrl.pathname.startsWith('/v1/')
  ) {
    proxyToCompanion(request, response, requestUrl);
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'method not allowed' });
    return;
  }

  void serveStatic(request, response, requestUrl).catch(() => {
    if (!response.headersSent) sendJson(response, 500, { error: 'static file error' });
    else response.destroy();
  });
});

server.listen(port, host, () => {
  console.log(`Polaris CC listening on http://${host}:${port}`);
  console.log(`Static files: ${staticRoot}`);
  console.log(`CcCompanion: ${backend.origin}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
