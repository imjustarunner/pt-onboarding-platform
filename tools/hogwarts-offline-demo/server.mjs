#!/usr/bin/env node
/**
 * Offline Hogwarts school portal demo server.
 * Serves frozen API JSON + the bundled web app. No internet required after unzip.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const WEB = path.join(__dirname, 'web');
const UPLOADS = path.join(__dirname, 'uploads');
const ROUTES_PATH = path.join(__dirname, 'api', 'routes.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.map': 'application/json'
};

function loadRoutes() {
  try {
    return JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

const routes = loadRoutes();

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(raw);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(404);
    res.end('Not found');
  });
  stream.pipe(res);
}

function lookupApi(method, urlPath, search) {
  const keyWithQuery = `${method} ${urlPath}${search || ''}`;
  const key = `${method} ${urlPath}`;
  if (Object.prototype.hasOwnProperty.call(routes, keyWithQuery)) return routes[keyWithQuery];
  if (Object.prototype.hasOwnProperty.call(routes, key)) return routes[key];
  return undefined;
}

function spaIndex() {
  const index = path.join(WEB, 'index.html');
  if (fs.existsSync(index)) return index;
  return path.join(__dirname, 'preview.html');
}

const server = http.createServer((req, res) => {
  const method = String(req.method || 'GET').toUpperCase();
  const parsed = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const urlPath = decodeURIComponent(parsed.pathname);

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if (urlPath.startsWith('/api/')) {
    const hit = lookupApi(method, urlPath, parsed.search);
    if (hit !== undefined) return sendJson(res, 200, hit);
    if (method !== 'GET' && method !== 'HEAD') {
      return sendJson(res, 200, { ok: true, demo: true, message: 'Demo only — changes are not saved.' });
    }
    return sendJson(res, 200, []);
  }

  if (urlPath.startsWith('/uploads/')) {
    const rel = urlPath.slice('/uploads/'.length);
    const filePath = path.join(UPLOADS, rel);
    if (filePath.startsWith(UPLOADS) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return sendFile(res, filePath);
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const webTarget = path.join(WEB, urlPath === '/' ? 'index.html' : urlPath);
  if (webTarget.startsWith(WEB) && fs.existsSync(webTarget) && fs.statSync(webTarget).isFile()) {
    return sendFile(res, webTarget);
  }

  const fallback = spaIndex();
  if (fs.existsSync(fallback)) return sendFile(res, fallback);
  res.writeHead(404);
  res.end('Demo files missing. Re-download the Hogwarts offline bundle.');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/school-onboarding/demo`;
  console.log('');
  console.log(' Hogwarts school portal demo (offline)');
  console.log(` Open: ${url}`);
  console.log(' Press Ctrl+C to stop.');
  console.log('');
  const openCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(openCmd, () => {});
});
