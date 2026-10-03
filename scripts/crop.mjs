// Usage: node scripts/crop.mjs "<query>" x y w h [scale] [waitMs] [script]
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
const [query, x, y, w, h, scale = '3', wait = '1500', script = '', after = '700'] = process.argv.slice(2);
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = join(root, u.pathname);
  if (u.pathname === '/' || !extname(p)) p = join(root, 'index.html');
  try {
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : extname(p) === '.css' ? 'text/css' : 'text/html' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: Number(scale) });
await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`);
await new Promise((r) => setTimeout(r, Number(wait)));
if (script) {
  await page.evaluate(script);
  await new Promise((r) => setTimeout(r, Number(after)));
}
await page.screenshot({ path: 'screenshots/crop.png', clip: { x: +x, y: +y, width: +w, height: +h } });
await browser.close();
server.close();
