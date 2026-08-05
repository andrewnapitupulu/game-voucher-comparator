'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const searchHandler = require('./api/search');
const healthHandler = require('./api/health');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function createNodeResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  return res;
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.statusCode = 404;
      return res.end('Not found');
    }

    res.setHeader('content-type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
    if (path.extname(filePath) === '.html') res.setHeader('cache-control', 'no-cache');
    else res.setHeader('cache-control', 'public, max-age=3600');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, rawRes) => {
  const res = createNodeResponse(rawRes);
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/search') return searchHandler(req, res);
  if (pathname === '/api/health') return healthHandler(req, res);
  return serveStatic(req, res);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Game price comparator berjalan di http://localhost:${port}`);
});
