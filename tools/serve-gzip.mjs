// Static server for the budget measure (QA v1.3 §7): same compression policy as GitHub Pages:
// gzip for HTML, JS, CSS, SVG and JSON; images, media and WOFF2 sent as is. No cache.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.bin': 'application/octet-stream',
};
const GZIP = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);

/** Serves `root` under `base` (e.g. /thegameshow/). Resolves with the listening server. */
export function serveGzip(root, base = '/thegameshow/', port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (!url.pathname.startsWith(base)) throw new Error('outside base');
      let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
      const path = normalize(join(root, rel));
      if (!path.startsWith(normalize(root))) throw new Error('traversal');
      const st = await stat(path).catch(() => null);
      const file = st?.isDirectory() ? join(path, 'index.html') : path;
      rel = file;
      const body = await readFile(file);
      const ext = extname(file);
      const headers = {
        'content-type': TYPES[ext] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      };
      const gz = GZIP.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
      const out = gz ? gzipSync(body, { level: 9 }) : body;
      if (gz) headers['content-encoding'] = 'gzip';
      headers['content-length'] = String(out.length);
      res.writeHead(200, headers);
      res.end(out);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
