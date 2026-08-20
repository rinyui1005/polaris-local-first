import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const host = process.env.POLARIS_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.POLARIS_PORT || '8796', 10);
const backend = new URL(process.env.CCC_BACKEND || 'http://127.0.0.1:8795');
const staticRoot = path.resolve(process.env.POLARIS_STATIC_DIR || path.join(process.cwd(), 'dist'));

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

  if (requestUrl.pathname.startsWith('/chat/')) {
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
