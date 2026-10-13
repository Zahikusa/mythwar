/**
 * Per-frame cost budget: the game's own JavaScript per frame (simulation + AI, renderer command
 * generation, HUD update) in a heavy late-game battle on a landscape-phone viewport — 30
 * creatures on the field (more than real AI battles ever reach), both sides casting their god
 * powers. A budget phone runs JavaScript ~4-6x slower than a desktop, so the budget here is
 * 3 ms/frame (≈ 12-18 ms on such a phone, inside a 60 fps frame).
 *   npm run build && node scripts/perfcheck.ts [seconds=8]
 * Method: the frame time is the median of per-second samples (a laptop's clock speed varies with
 * load, so single readings swung 3×); a CPU profile afterwards splits it into our script and
 * native canvas calls, which in headless Chrome include software rasterization.
 * (Rasterization isn't measured: headless Chrome draws canvases on the CPU, phones on the GPU;
 * CPU throttling in DevTools mostly measures that software raster, so it isn't used here. The
 * game's automatic battery-saver mode covers phones whose GPU can't keep up.)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.ts';

const seconds = Number(process.argv[2] ?? 8);
const BUDGET_MS = 3;
const CHROME = chromePath();
const root = resolve('dist');
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  let p = join(root, u.pathname);
  if (u.pathname === '/' || !extname(p)) p = join(root, 'index.html');
  try {
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`http://127.0.0.1:${port}/?demo&ff=780&seed=5&difficulty=master`);
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  type Fn = (...args: unknown[]) => unknown;
  const a = (window as unknown as { __mythwar: Record<string, Record<string, Fn>> }).__mythwar;
  const acc: Record<string, number> = { sim: 0, render: 0, hud: 0, frames: 0 };
  (window as unknown as { __acc: typeof acc }).__acc = acc;
  const wrap = (obj: Record<string, Fn>, name: string, key: string) => {
    const f = obj[name].bind(obj);
    obj[name] = (...args: unknown[]) => {
      const t = performance.now();
      const r = f(...args);
      acc[key] += performance.now() - t;
      if (key === 'render') acc.frames++;
      return r;
    };
  };
  wrap(a.game, 'advance', 'sim');
  wrap(a.renderer, 'render', 'render');
  wrap(a.hud, 'update', 'hud');
});
// One sample per second (after a second of start-up): the cost per frame in that second and the
// creatures on the field — readings are the median, with their spread, so one slow or idle
// second (another process, a battle thinning out) doesn't decide the verdict.
const samples: { sim: number; render: number; hud: number; units: number; over: boolean }[] = [];
// A CPU profile alongside splits the time into our own script and native canvas/DOM calls: in
// headless Chrome the canvas is unaccelerated, so its calls include rasterization that a phone
// does on the GPU, off the main thread — the budget is for the script part.
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
// (Timing first, without the profiler: a profiler keeps the CPU clocked up, which on a laptop
// makes everything ~3× faster than the same page left alone. The profile afterwards only gives
// the split, which is stable.)
const PROFILE_SECS = 4;
for (let s = 0; s < seconds + 1 + PROFILE_SECS; s++) {
  if (s === seconds + 1) await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, 1000));
  const sample = await page.evaluate(() => {
    const a = (window as unknown as { __mythwar: { game: { world: { players: { powerCooldown: number }[]; lanes: { alive: boolean }[][]; winner: number | null }; command(c: unknown): void } } }).__mythwar;
    // Keep the battle busy: both sides cast their god powers whenever they can, and the field is
    // topped up to five creatures per side and lane — 30 in all, more than any of 12 measured AI
    // battles ever had at once (median 13, p99 21, max 26): a heavy human battle with held waves.
    for (const team of [0, 1]) if (a.game.world.players[team].powerCooldown <= 0) a.game.command({ type: 'power', team, lane: (Date.now() / 1000) % 3 | 0 });
    const w = a.game.world as unknown as { lanes: { alive: boolean; team: number }[][]; players: { age: number }[]; spawnUnit(team: number, lane: number, def: unknown, x: number): unknown };
    const units = Object.values((window as unknown as { __mythwarData: { UNITS: Record<string, { age: number; cls: string }> } }).__mythwarData.UNITS);
    w.lanes.forEach((lane, li) => {
      for (const team of [0, 1]) {
        const defs = units.filter((u) => u.age === w.players[team].age && u.cls !== 'legend');
        for (let n = lane.filter((u) => u.alive && u.team === team).length, k = 0; n < 5; n++, k++) w.spawnUnit(team, li, defs[(n + k) % defs.length], team === 0 ? 120 + k * 12 : 880 - k * 12);
      }
    });
    const acc = (window as unknown as { __acc: Record<string, number> }).__acc;
    const f = Math.max(1, acc.frames);
    const out = { sim: acc.sim / f, render: acc.render / f, hud: acc.hud / f, units: a.game.world.lanes.reduce((n, l) => n + l.filter((u) => u.alive).length, 0), over: a.game.world.winner !== null };
    for (const k in acc) acc[k] = 0;
    return out;
  });
  if (s > 0 && s <= seconds) samples.push(sample); // (the first second includes start-up work)
}
const median = (xs: number[]) => {
  const v = [...xs].sort((x, y) => x - y);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const { profile } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string } }[]; samples: number[] } };
const nodes = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
let script = 0;
let native = 0;
for (const id of profile.samples) {
  const f = nodes.get(id)!;
  if (f.functionName === '(idle)' || f.functionName === '(root)') continue;
  if (f.url || f.functionName === '(garbage collector)') script++;
  else native++; // canvas and DOM calls, and the engine's own '(program)' time
}
const scriptShare = script / Math.max(1, script + native);
const totals = samples.map((x) => x.sim + x.render + x.hud);
const all = median(totals);
const total = all * scriptShare;
const units = Math.round(median(samples.map((x) => x.units)));
const ended = samples.some((x) => x.over);
const ok = total <= BUDGET_MS && errors.length === 0;
console.log(
  `${ok ? 'PASS' : 'FAIL'}  ${total.toFixed(2)} ms of our script per frame (budget ${BUDGET_MS} ms) — ${Math.round(scriptShare * 100)}% of ${all.toFixed(2)} ms per frame in all (median of ${samples.length} s, range ${Math.min(...totals).toFixed(2)}–${Math.max(...totals).toFixed(2)}), the rest native canvas calls (here incl. software rasterization); by part: simulation + AI ${median(samples.map((x) => x.sim)).toFixed(2)}, renderer ${median(samples.map((x) => x.render)).toFixed(2)}, HUD ${median(samples.map((x) => x.hud)).toFixed(2)} — ~${units} creatures on the field${ended ? ' (the battle ended during the measurement: a lighter load)' : ''}${errors.length ? ` — errors: ${errors.join('; ')}` : ''}`,
);
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
