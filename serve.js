// Tiny static server for local work:  node serve.js  ->  http://localhost:8377
// (index.html also works opened straight from disk, this is just nicer.)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8377;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  let file = decodeURIComponent(req.url.split('?')[0]);
  if (file.endsWith('/')) file += 'index.html';
  const full = path.join(__dirname, path.normalize(file));
  if (!full.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(full)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log('theka on http://localhost:' + PORT));
