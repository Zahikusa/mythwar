/**
 * Draws the launch images of the installed app on iPhone and iPad (public/splash/): the game's
 * night-sky colour with its icon and name in the middle — what the title screen opens on, so the
 * start is one dark screen, not a white flash. Run again after a change to the icon or sizes:
 *   node scripts/splash.ts
 */
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.ts';
import { splashLinks } from './splashsizes.ts';

const icon = readFileSync('public/icon.svg', 'utf-8');
mkdirSync('public/splash', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  for (const s of splashLinks()) {
    const side = Math.min(s.w, s.h);
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>
      html, body { margin: 0; height: 100%; background: #0b0716; }
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${Math.round(side * 0.05)}px; }
      .icon { width: ${Math.round(side * 0.26)}px; height: ${Math.round(side * 0.26)}px; }
      .icon svg { width: 100%; height: 100%; display: block; }
      .name { font: 700 ${Math.round(side * 0.075)}px 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif; letter-spacing: 0.08em; color: #f2c45a; }
    </style><div class="icon">${icon}</div><div class="name">MYTHWAR</div>`);
    await page.screenshot({ path: `public/${s.file}`, type: 'png' });
    console.log(s.file);
  }
} finally {
  await browser.close();
}
