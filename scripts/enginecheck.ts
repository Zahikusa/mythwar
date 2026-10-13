/**
 * Cross-engine determinism check: the same AI-vs-AI battle in Node (V8), Chrome (V8),
 * Firefox (SpiderMonkey) and WebKit (JavaScriptCore — the engine of every iPhone browser) must
 * produce identical state hashes, or online battles between those devices would drift apart.
 *
 *   npm run build && node scripts/enginecheck.ts [minutes=12] [seeds=3]
 *
 * Firefox/WebKit come from Playwright, installed inside the project:
 *   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install webkit firefox
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serveStatic } from '../server/static.ts';
import { battleHashes } from '../src/selftest.ts';
import { findChrome } from './chrome.ts';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
const minutes = Number(process.argv[2] ?? 12);
const seeds = Number(process.argv[3] ?? 3);
type Result = { fingerprint: number; hashes: number[]; ticks: number };

async function main(): Promise<void> {
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) throw new Error('Run "npm run build" first');
  const http = createServer(serveStatic(root));
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}/?norotate`;
  const { chromium, firefox, webkit } = await import('playwright');
  const chrome = findChrome();
  const engines: [string, () => Promise<import('playwright').Browser>][] = [
    ['webkit (JavaScriptCore)', () => webkit.launch()],
    ['firefox (SpiderMonkey)', () => firefox.launch()],
  ];
  if (chrome) engines.push(['chrome (V8)', () => chromium.launch({ executablePath: chrome })]);
  let failures = 0;
  try {
    for (let s = 0; s < seeds; s++) {
      const seed = 1000 + s * 7919;
      const t0 = performance.now();
      const ref = battleHashes(seed, minutes * 60);
      console.log(`seed ${seed}: node ${ref.ticks} ticks, ${ref.hashes.length} hashes, fingerprint ${ref.fingerprint.toString(16)} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
      for (const [name, launch] of engines) {
        let browser: import('playwright').Browser | null = null;
        try {
          browser = await launch();
          const page = await browser.newPage();
          await page.goto(base, { waitUntil: 'load' });
          await page.waitForFunction(() => typeof (window as unknown as { __mythwarSelftest?: unknown }).__mythwarSelftest === 'function');
          const got = (await page.evaluate(
            async ([seed, secs]) => (await (window as unknown as { __mythwarSelftest: () => Promise<{ battleHashes: (a: number, b: number) => unknown }> }).__mythwarSelftest()).battleHashes(seed, secs),
            [seed, minutes * 60] as [number, number],
          )) as Result;
          const first = got.hashes.findIndex((h, i) => h !== ref.hashes[i]);
          const same = got.fingerprint === ref.fingerprint && got.ticks === ref.ticks && first < 0 && got.hashes.length === ref.hashes.length;
          if (!same) failures++;
          console.log(`  ${same ? 'PASS' : 'FAIL'}  ${name}${same ? '' : ` — fingerprint ${got.fingerprint.toString(16)}, first differing hash #${first} (tick ${(first + 1) * 600}), ticks ${got.ticks}`}`);
        } catch (e) {
          failures++;
          console.log(`  FAIL  ${name} — ${(e as Error).message.split('\n')[0]}`);
        } finally {
          await browser?.close();
        }
      }
    }
  } finally {
    http.close();
  }
  console.log(failures ? `\n${failures} engine run(s) differ` : '\nAll engines simulate identically');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
