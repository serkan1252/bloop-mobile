import http from 'node:http';
import fs from 'node:fs/promises';
import { root } from './prepare.mjs';
const html = await fs.readFile(`${root}/ios/BLOOP/Game/index.html`);
http.createServer((req, res) => {
  if (!['/', '/index.html'].includes(req.url)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}).listen(4173, '127.0.0.1', () => console.log('BLOOP: http://127.0.0.1:4173 (durdurmak için Ctrl+C)'));
