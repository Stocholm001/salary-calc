// tools/serve.mjs — เซิร์ฟเวอร์ทดสอบในเครื่อง (ไม่ต้องลงอะไรเพิ่ม)
// ใช้: npm start            → http://localhost:8000
//      npm start -- 3000    → เปลี่ยนพอร์ต
//
// ต่างจาก `python3 -m http.server` ตรงที่สั่งเบราว์เซอร์ไม่ให้แคช
// แก้ไฟล์แล้วรีเฟรชธรรมดาก็เห็นของใหม่ทุกไฟล์ ไม่ปนกับไฟล์เก่า

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PORT, () => {
  console.log(`กระปุกเงินเดือน (ทดสอบ): http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  จากมือถือ (Wi-Fi เดียวกัน): http://${a.address}:${PORT}`);
    }
  }
  console.log('กด Ctrl+C เพื่อหยุด');
});
