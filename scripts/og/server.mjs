// Рисовалка картинки-превью для Telegram/VK (site/og-image.jpg, 1200×630).
// Запуск: node scripts/og/server.mjs, затем открыть в браузере http://localhost:4175/make — картинка сохранится сама.
// Нужен собранный сайт (npm run build:site): берём логотип, иконки героев и данные оттуда.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const SITE = fileURLToPath(new URL('../../site/', import.meta.url));
const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/save') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const base64 = Buffer.concat(chunks).toString().replace(/^data:image\/(png|jpeg);base64,/, '');
      await writeFile(join(SITE, 'og-image.jpg'), Buffer.from(base64, 'base64'));
      res.end('ok'); return;
    }
    const path = req.url === '/make' ? new URL('./make.html', import.meta.url) : join(SITE, decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(String(path))] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end(String(e)); }
}).listen(4175, () => console.log("og server 4175"));
