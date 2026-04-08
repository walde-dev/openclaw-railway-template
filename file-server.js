const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.FILE_SERVER_PORT || '9876', 10);
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/data/workspace';

const ALLOWED_PREFIXES = ['memory/', 'skills/'];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const auth = req.headers.authorization;
  const token = process.env.OPENCLAW_GATEWAY_TOKEN || 'lf0j6xb79e4uxrq7p8rzmyfj1vtinj99';
  if (auth !== `Bearer ${token}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const filePath = url.pathname.replace(/^\/files\//, '');

  if (!filePath) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: 'NOCTURA file server', usage: '/files/<path>' }));
  }

  const allowed = ALLOWED_PREFIXES.some(p => filePath.startsWith(p));
  if (!allowed) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'forbidden', allowed: ALLOWED_PREFIXES }));
  }

  const resolved = path.resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'path traversal detected' }));
  }

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    const stat = fs.statSync(resolved);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-File-Size': String(stat.size),
      'X-File-Modified': stat.mtimeMs.toString(),
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found', path: filePath }));
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 NOCTURA file server listening on 0.0.0.0:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  console.log(`   Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}`);
});
