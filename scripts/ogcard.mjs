// The link-preview card (Lens #95): what a chat shows when someone pastes the game's or an
// invite's link. Renders the title screen over its live battle at 1200×630 into public/og.jpg.
// Usage: npm run build && node scripts/ogcard.mjs [waitMs]
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const [wait = '9000'] = process.argv.slice(2);
const root = resolve('dist');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = join(root, u.pathname);
  if (u.pathname === '/' || !extname(p)) p = join(root, 'index.html');
  try {
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'text/html' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  // Let the attract battle behind the title fill the field; the card shows the logo and the
  // battle, not the menu (the buttons, the ladder chips and the footer are hidden).
  await new Promise((r) => setTimeout(r, Number(wait)));
  await page.addStyleTag({ content: '.screen.title > :not(:first-child):not(.title-creatures) { visibility: hidden !important; }' });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 82 });
  console.log('public/og.jpg written');
} finally {
  await browser.close();
  server.close();
}
