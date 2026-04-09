#!/usr/bin/env node

const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webp': 'image/webp',
  '.webm': 'video/webm',
};

const MAX_HTML_SIZE = 10 * 1024 * 1024;

const SCROLL_SYNC_SCRIPT = `
<script>
(function() {
  if (window.__bpSyncLoaded) return;
  window.__bpSyncLoaded = true;
  var syncing = false;
  var s = document.createElement('style');
  s.textContent = '::-webkit-scrollbar{display:none}html{scrollbar-width:none}';
  document.head.appendChild(s);
  var ticking = false;
  window.addEventListener('scroll', function() {
    if (syncing || ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      var maxY = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = maxY > 0 ? window.scrollY / maxY : 0;
      window.parent.postMessage({ type: 'bp-scroll', ratio: ratio }, '*');
      ticking = false;
    });
  }, { passive: true });
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'bp-scroll-set') {
      syncing = true;
      var maxY = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, e.data.ratio * maxY);
      requestAnimationFrame(function() { syncing = false; });
    }
  });
})();
</script>
`;

const rootDir = path.resolve(process.argv[2] || '.');
const startPort = parseInt(process.argv[3], 10) || 8787;
const proxyTarget = process.argv[4] || null;
const proxyBase = proxyTarget ? new URL(proxyTarget) : null;
const canonicalRoot = path.resolve(rootDir) + path.sep;

if (!fs.existsSync(rootDir)) {
  console.error(`Error: Directory does not exist: ${rootDir}`);
  process.exit(1);
}

const internalRoutes = {
  '/_preview.html': { file: path.join(rootDir, '_preview.html'), type: 'text/html' },
  '/_bp': { file: path.join(rootDir, '_preview.html'), type: 'text/html' },
  '/icon.png': { file: path.join(__dirname, 'icon.png'), type: 'image/png', cache: 'public, max-age=86400' },
};

function serve(port) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    const route = internalRoutes[parsedUrl.pathname];
    if (route) {
      fs.readFile(route.file, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const headers = { 'Content-Type': route.type };
        if (route.cache) headers['Cache-Control'] = route.cache;
        res.writeHead(200, headers);
        res.end(data);
      });
      return;
    }

    if (proxyTarget) {
      const targetUrl = new URL(req.url, proxyBase.origin);
      const headers = { ...req.headers, host: targetUrl.host, 'accept-encoding': 'identity', connection: 'keep-alive' };
      const client = targetUrl.protocol === 'https:' ? https : http;
      const proxyReq = client.request(targetUrl, { method: req.method, headers }, (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        const respHeaders = { ...proxyRes.headers };
        delete respHeaders['x-frame-options'];
        delete respHeaders['content-security-policy'];

        if (contentType.includes('text/html')) {
          const body = [];
          let size = 0;
          let aborted = false;
          proxyRes.on('data', (chunk) => {
            body.push(chunk);
            size += chunk.length;
            if (size > MAX_HTML_SIZE) {
              aborted = true;
              proxyRes.destroy();
              delete respHeaders['content-length'];
              res.writeHead(proxyRes.statusCode, respHeaders);
              res.end(Buffer.concat(body));
              return;
            }
          });
          proxyRes.on('end', () => {
            if (aborted) return;
            let html = Buffer.concat(body).toString();
            if (html.includes('</head>')) {
              html = html.replace('</head>', `${SCROLL_SYNC_SCRIPT}</head>`);
            } else {
              html += SCROLL_SYNC_SCRIPT;
            }
            delete respHeaders['content-length'];
            res.writeHead(proxyRes.statusCode, respHeaders);
            res.end(html);
          });
        } else {
          res.writeHead(proxyRes.statusCode, respHeaders);
          proxyRes.pipe(res);
        }
      });
      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Proxy error: ${err.message}`);
      });
      req.pipe(proxyReq);
      return;
    }

    let filePath = path.resolve(rootDir, decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, ''));
    const canonicalFile = path.resolve(filePath);
    if (!canonicalFile.startsWith(canonicalRoot)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'EISDIR') {
          filePath = path.join(filePath, 'index.html');
          fs.readFile(filePath, (err2, data2) => {
            if (err2) { res.writeHead(404); res.end(`404 Not Found: ${req.url}`); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          });
          return;
        }
        res.writeHead(404); res.end(`404 Not Found: ${req.url}`); return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  if (proxyTarget) {
    server.on('upgrade', (req, socket, head) => {
      const defaultPort = proxyBase.protocol === 'https:' ? 443 : 80;
      const proxy = net.connect(proxyBase.port || defaultPort, proxyBase.hostname || 'localhost', () => {
        const reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
        const hdrs = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
        proxy.write(reqLine + hdrs + '\r\n\r\n');
        if (head.length) proxy.write(head);
        socket.pipe(proxy).pipe(socket);
      });
      let closed = false;
      function cleanup() { if (closed) return; closed = true; socket.destroy(); proxy.destroy(); }
      proxy.on('error', cleanup);
      socket.on('error', cleanup);
      socket.on('close', cleanup);
      proxy.on('close', cleanup);
    });
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') serve(port + 1);
    else { console.error(`Server error: ${err.message}`); process.exit(1); }
  });

  server.listen(port, () => {
    console.log(`SERVING_PORT:${port}`);
  });
}

serve(startPort);
