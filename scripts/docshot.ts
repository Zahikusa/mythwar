/**
 * A README picture from a screenshot: resizes `screenshots/<scenario>.png` (from `shoot`) to a
 * JPEG in docs/, with Chrome's canvas (no image library needed).
 *
 *   node scripts/shoot.ts mobile-land && node scripts/docshot.ts mobile-land docs/mobile.jpg 1200
 *
 * The width is kept as given; the height follows the screenshot's proportions.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.ts';

const [scenario, out, width = '1200', quality = '0.86'] = process.argv.slice(2);
if (!scenario || !out) {
  console.error('Usage: node scripts/docshot.ts <scenario> <docs/name.jpg> [width=1200] [quality=0.86]');
  process.exit(2);
}
const png = readFileSync(`screenshots/${scenario}.png`);
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
try {
  const page = await browser.newPage();
  const jpg = await page.evaluate(
    async (data: string, w: number, q: number) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round((img.naturalHeight * w) / img.naturalWidth);
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return { url: c.toDataURL('image/jpeg', q), h: c.height };
    },
    `data:image/png;base64,${png.toString('base64')}`,
    Number(width),
    Number(quality),
  );
  writeFileSync(out, Buffer.from(jpg.url.split(',')[1], 'base64'));
  console.log(`${out}: ${width}×${jpg.h}`);
} finally {
  await browser.close();
}
