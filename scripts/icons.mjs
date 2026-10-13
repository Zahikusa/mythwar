// Renders public/icon.svg to PNG icons (apple-touch-icon + manifest sizes) with local Chrome.
// Also a "maskable" variant for Android launchers: full-bleed background, artwork shrunk into
// the central safe zone (launchers crop maskable icons to circles / squircles).
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { chromePath } from './chrome.ts';
const svg = await readFile('public/icon.svg', 'utf-8');
const art = svg.indexOf('<path');
const end = svg.lastIndexOf('</svg>');
const maskable =
  svg.slice(0, art).replace(' rx="96"', '') +
  '<g transform="translate(256 256) scale(0.72) translate(-256 -274)">' +
  svg.slice(art, end) +
  '</g></svg>';
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
const page = await browser.newPage();
for (const [size, name, src] of [
  [180, 'apple-touch-icon.png', svg],
  [192, 'icon-192.png', svg],
  [512, 'icon-512.png', svg],
  [192, 'icon-maskable-192.png', maskable],
  [512, 'icon-maskable-512.png', maskable],
]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: true });
}
await browser.close();
