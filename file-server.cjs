const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.FILE_SERVER_PORT || '9876', 10);
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/data/workspace';

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
  const rawPath = url.pathname.replace(/^\/files\/?/, '');

  if (!rawPath) {
    try {
      const files = listDir(WORKSPACE, '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, root: WORKSPACE, files }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  const resolved = path.resolve(WORKSPACE, rawPath);
  if (!resolved.startsWith(WORKSPACE)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'path traversal detected' }));
  }

  const segments = rawPath.split('/');
  if (segments.some(s => s.startsWith('.'))) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'hidden files not accessible' }));
  }

  try {
    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      const files = listDir(WORKSPACE, rawPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, path: rawPath, files }));
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-File-Size': String(stat.size),
      'X-File-Modified': stat.mtimeMs.toString(),
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found', path: rawPath }));
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function listDir(workspace, subpath) {
  const target = path.join(workspace, subpath);
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relPath = subpath ? `${subpath}/${entry.name}` : entry.name;
    const fullPath = path.join(workspace, relPath);
    try {
      const stat = fs.statSync(fullPath);
      results.push({
        name: entry.name,
        path: relPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtimeMs,
      });
    } catch {}
  }
  return results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 NOCTURA file server listening on 0.0.0.0:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  console.log(`   Serving: all workspace files (hidden files excluded)`);
});
