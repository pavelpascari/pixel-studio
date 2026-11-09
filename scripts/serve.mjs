// Zero-dependency static server for the studio and demo. `npm run studio` → http://localhost:5173/studio/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
// Local only by default. Set HOST=0.0.0.0 to serve your network (it serves every file in the repo).
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') { res.writeHead(302, { location: '/studio/' }); return res.end(); }
    // Crawlers and agents are welcome to everything served.
    if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('User-agent: *\nAllow: /\n'); }
    const file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); }
    // Never serve dotfiles or dot-folders (.git, .env, editor settings): a tunnel makes this public.
    if (file.slice(ROOT.length).split(sep).some((seg) => seg.startsWith('.'))) { res.writeHead(404); return res.end('not found'); }
    const target = (await stat(file)).isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, HOST, () => {
  console.log(`Pixel Studio  → http://localhost:${PORT}/studio/`);
  console.log(`Docs site     → http://localhost:${PORT}/site/`);
  console.log(`Demo website  → http://localhost:${PORT}/demo/`);
});
