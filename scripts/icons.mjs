// Renders public/icon.svg to PNG icons (apple-touch-icon + manifest sizes) with local Chrome.
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
const svg = await readFile('public/icon.svg', 'utf-8');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: true });
}
await browser.close();
