import { Rng } from '../sim/rng.ts';
import { SHRINE_X } from '../sim/data.ts';
import { laneX } from './layout.ts';
import type { Layout } from './layout.ts';
import { mix, rgba, shade } from './theme.ts';
import type { Theme } from './theme.ts';

/** Pre-renders the static battlefield backdrop for a theme into an offscreen canvas. */
export function renderBackground(layout: Layout, theme: Theme, dpr: number, themeIndex: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(layout.width * dpr));
  c.height = Math.max(1, Math.round(layout.height * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const rng = new Rng(1234 + themeIndex * 77);
  const W = layout.width;
  const H = layout.height;
  const hz = layout.horizon;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, hz + 4);
  theme.sky.forEach((col, i) => sky.addColorStop(i / (theme.sky.length - 1), col));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hz + 4);

  // Stars
  if (theme.stars > 0) {
    const n = Math.round(160 * theme.stars * (W / 1600));
    for (let i = 0; i < n; i++) {
      const x = rng.next() * W;
      const y = Math.pow(rng.next(), 1.6) * hz * 0.9;
      const r = rng.range(0.4, 1.4);
      ctx.fillStyle = `rgba(255,255,255,${(rng.range(0.25, 0.9) * (1 - y / hz)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sun / moon glow
  const sx = W * theme.sunX;
  const sy = hz - layout.field.h * 0.06;
  const glowR = Math.max(W, H) * 0.45;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  g.addColorStop(0, theme.glow);
  g.addColorStop(0.25, rgba('#ffffff', 0.05));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, hz + 4);
  ctx.fillStyle = rgba('#ffffff', theme.id === 'asgard' ? 0.85 : 0.75);
  ctx.beginPath();
  ctx.arc(sx, sy - layout.field.h * 0.07, layout.field.h * (theme.id === 'asgard' ? 0.035 : 0.05), 0, Math.PI * 2);
  ctx.fill();

  // (The aurora is drawn live by the renderer so it can shimmer — see renderAurora.)
  if (theme.id === 'celestial') drawNebula(ctx, W, hz, rng);

  // Mountains (far → near)
  const layers = theme.mountains;
  for (let li = 0; li < 3; li++) {
    const base = hz + 2;
    const amp = layout.field.h * (0.16 - li * 0.035);
    const col = layers[li];
    const pts = ridge(rng, W, base - amp * (0.55 + li * 0.08), amp, 5 + li * 2);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W, base);
    ctx.closePath();
    ctx.fill();
    if (theme.snowcaps && li < 2) drawSnowcaps(ctx, pts, amp);
    if (li === 0) drawLandmark(ctx, theme, pts, layout, rng);
    // Atmospheric haze between layers
    const haze = ctx.createLinearGradient(0, base - amp * 1.2, 0, base);
    haze.addColorStop(0, rgba(theme.sky[theme.sky.length - 2], 0));
    haze.addColorStop(1, rgba(theme.sky[theme.sky.length - 1], 0.28 - li * 0.06));
    ctx.fillStyle = haze;
    ctx.fillRect(0, base - amp * 1.2, W, amp * 1.2);
  }

  // Ground
  const ground = ctx.createLinearGradient(0, hz, 0, H);
  ground.addColorStop(0, theme.ground[0]);
  ground.addColorStop(1, theme.ground[1]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, hz, W, H - hz);

  // Soft ground patches for texture
  for (let i = 0; i < 26; i++) {
    const y = hz + Math.pow(rng.next(), 0.8) * (H - hz);
    const k = (y - hz) / (H - hz);
    const x = rng.next() * W;
    const rx = (40 + rng.next() * 160) * (0.4 + k) * (W / 1600);
    const ry = rx * (0.12 + 0.12 * k);
    ctx.fillStyle = rng.chance(0.5) ? rgba('#ffffff', 0.035) : rgba('#000000', 0.05);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fog band at the horizon
  const fog = ctx.createLinearGradient(0, hz - layout.field.h * 0.03, 0, hz + layout.field.h * 0.12);
  fog.addColorStop(0, rgba('#ffffff', 0));
  fog.addColorStop(0.35, theme.fog);
  fog.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = fog;
  ctx.fillRect(0, hz - layout.field.h * 0.03, W, layout.field.h * 0.15);

  // Lanes
  for (const lane of layout.lanes) drawLanePath(ctx, layout, lane.index, theme, rng);

  // Scattered foliage away from the lanes
  drawFoliage(ctx, layout, theme, rng);

  return c;
}

function ridge(rng: Rng, W: number, baseY: number, amp: number, waves: number): [number, number][] {
  const phases = Array.from({ length: 4 }, () => rng.next() * Math.PI * 2);
  const pts: [number, number][] = [];
  const step = Math.max(4, W / 220);
  for (let x = -step; x <= W + step; x += step) {
    const t = x / W;
    let y = 0;
    y += Math.sin(t * Math.PI * waves * 0.5 + phases[0]) * 0.45;
    y += Math.sin(t * Math.PI * waves * 1.3 + phases[1]) * 0.25;
    y += Math.sin(t * Math.PI * waves * 3.1 + phases[2]) * 0.1;
    y += Math.sin(t * Math.PI * waves * 7.7 + phases[3]) * 0.04;
    pts.push([x, baseY - y * amp * 0.6]);
  }
  return pts;
}

function drawSnowcaps(ctx: CanvasRenderingContext2D, pts: [number, number][], amp: number): void {
  let minY = Infinity;
  for (const p of pts) minY = Math.min(minY, p[1]);
  const line = minY + amp * 0.35;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], line + amp);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], line + amp);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(240, 248, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], line);
  for (let i = 0; i < pts.length; i++) {
    const [x] = pts[i];
    ctx.lineTo(x, line + Math.sin(i * 0.9) * amp * 0.04 + Math.sin(i * 0.31) * amp * 0.05);
  }
  ctx.lineTo(pts[pts.length - 1][0], minY - 10);
  ctx.lineTo(pts[0][0], minY - 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Pre-rendered aurora ribbons (transparent canvas) that the renderer sways and fades. */
export function renderAurora(layout: Layout, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(layout.width * dpr));
  c.height = Math.max(1, Math.round(layout.horizon * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawAurora(ctx, layout.width, layout.horizon, new Rng(77));
  return c;
}

function drawAurora(ctx: CanvasRenderingContext2D, W: number, hz: number, rng: Rng): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 3; b++) {
    const y0 = hz * (0.18 + b * 0.12);
    const col = b === 1 ? [120, 255, 200] : [90, 200, 255];
    for (let i = 0; i < 70; i++) {
      const x = (i / 70) * W;
      const y = y0 + Math.sin(i * 0.18 + b * 2 + rng.next() * 0.2) * hz * 0.06;
      const h = hz * (0.12 + 0.08 * Math.sin(i * 0.11 + b));
      const gr = ctx.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      gr.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},0.07)`);
      gr.addColorStop(0.8, `rgba(${col[0]},${col[1]},${col[2]},0.16)`);
      gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, W / 70 + 1, h);
    }
  }
  ctx.restore();
}

function drawNebula(ctx: CanvasRenderingContext2D, W: number, hz: number, rng: Rng): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cols = ['rgba(255,120,200,0.10)', 'rgba(120,160,255,0.10)', 'rgba(255,210,140,0.08)'];
  for (let i = 0; i < 9; i++) {
    const x = rng.next() * W;
    const y = rng.next() * hz * 0.7;
    const r = (0.08 + rng.next() * 0.18) * W;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cols[i % 3]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** A themed silhouette on the farthest ridge: tree, temple, world-tree, pagoda or sky islands. */
function drawLandmark(ctx: CanvasRenderingContext2D, theme: Theme, pts: [number, number][], layout: Layout, rng: Rng): void {
  const W = layout.width;
  const fh = layout.field.h;
  const col = shade(theme.mountains[0], -0.08);
  const at = (fx: number) => {
    const x = W * fx;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
    return best;
  };
  ctx.fillStyle = col;
  if (theme.id === 'fae') {
    // Giant ancient trees and mushrooms.
    for (const fx of [0.18, 0.83]) {
      const [x, y] = at(fx);
      const h = fh * 0.2;
      ctx.fillRect(x - fh * 0.008, y - h, fh * 0.016, h + 4);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(x + (rng.next() - 0.5) * fh * 0.09, y - h + (rng.next() - 0.3) * fh * 0.05, fh * (0.04 + rng.next() * 0.03), fh * (0.03 + rng.next() * 0.02), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const [mx, my] = at(0.62);
    ctx.fillRect(mx - 2, my - fh * 0.06, 4, fh * 0.06);
    ctx.beginPath();
    ctx.ellipse(mx, my - fh * 0.06, fh * 0.03, fh * 0.015, 0, Math.PI, 0);
    ctx.fill();
  } else if (theme.id === 'olympus') {
    // A temple on the highest hill.
    let top = pts[0];
    for (const p of pts) if (p[0] > W * 0.55 && p[0] < W * 0.9 && p[1] < top[1]) top = p;
    if (top === pts[0]) top = at(0.7);
    const [x, y] = top;
    const w = fh * 0.13;
    const h = fh * 0.05;
    ctx.fillStyle = shade(theme.mountains[0], 0.15);
    ctx.fillRect(x - w / 2, y - fh * 0.008, w, fh * 0.012);
    for (let i = 0; i < 7; i++) ctx.fillRect(x - w / 2 + (i / 6) * (w - w * 0.06), y - h, w * 0.05, h);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.56, y - h);
    ctx.lineTo(x, y - h - fh * 0.03);
    ctx.lineTo(x + w * 0.56, y - h);
    ctx.closePath();
    ctx.fill();
  } else if (theme.id === 'asgard') {
    // Yggdrasil, the world tree, looming in the distance.
    const [x, y] = at(0.3);
    const h = fh * 0.32;
    ctx.fillStyle = rgba('#0b1a2e', 0.7);
    ctx.beginPath();
    ctx.moveTo(x - fh * 0.03, y + 2);
    ctx.quadraticCurveTo(x - fh * 0.01, y - h * 0.5, x - fh * 0.012, y - h);
    ctx.lineTo(x + fh * 0.012, y - h);
    ctx.quadraticCurveTo(x + fh * 0.01, y - h * 0.5, x + fh * 0.03, y + 2);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.32;
      const r = fh * (0.1 + rng.next() * 0.06);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r, y - h + Math.sin(a) * r * 0.5, fh * 0.07, fh * 0.035, a * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme.id === 'jade') {
    // Karst peaks with a pagoda.
    ctx.fillStyle = shade(theme.mountains[0], 0.08);
    for (const fx of [0.12, 0.2, 0.78, 0.9]) {
      const [x, y] = at(fx);
      const h = fh * (0.12 + rng.next() * 0.1);
      const w = fh * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - w, y + 2);
      ctx.bezierCurveTo(x - w * 0.9, y - h, x - w * 0.5, y - h * 1.05, x, y - h);
      ctx.bezierCurveTo(x + w * 0.5, y - h * 1.05, x + w * 0.9, y - h, x + w, y + 2);
      ctx.fill();
    }
    const [px, py0] = at(0.2);
    const py = py0 - fh * 0.2;
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) {
      const w = fh * (0.04 - i * 0.006);
      const yy = py - i * fh * 0.018;
      ctx.beginPath();
      ctx.moveTo(px - w, yy);
      ctx.quadraticCurveTo(px, yy - fh * 0.012, px + w, yy);
      ctx.lineTo(px + w * 0.6, yy - fh * 0.008);
      ctx.lineTo(px - w * 0.6, yy - fh * 0.008);
      ctx.fill();
      ctx.fillRect(px - w * 0.45, yy, w * 0.9, fh * 0.012);
    }
  } else if (theme.id === 'celestial') {
    // Floating islands with streams of light.
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.25 + rng.next() * 0.08);
      const y = layout.horizon - fh * (0.1 + rng.next() * 0.1);
      const w = fh * (0.05 + rng.next() * 0.05);
      ctx.fillStyle = shade(theme.mountains[1], 0.1);
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x, y - w * 0.3, x + w, y);
      ctx.quadraticCurveTo(x + w * 0.3, y + w * 0.4, x, y + w * 0.9);
      ctx.quadraticCurveTo(x - w * 0.3, y + w * 0.4, x - w, y);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.18)';
      ctx.fillRect(x - w * 0.08, y + w * 0.3, w * 0.16, fh * 0.12);
    }
  }
}

function drawLanePath(ctx: CanvasRenderingContext2D, layout: Layout, index: number, theme: Theme, rng: Rng): void {
  const g = layout.lanes[index];
  const band = g.band;
  const x0 = g.x0 - band * 1.2;
  const x1 = g.x1 + band * 1.2;
  const yTop = g.y - band * 0.45;
  const yBot = g.y + band * 0.55;
  // Soft shadowed edge
  ctx.fillStyle = rgba('#000000', 0.12);
  roundedBand(ctx, x0 - 3, yTop - 1, x1 + 3, yBot + 4, band * 0.5);
  ctx.fill();
  const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
  grad.addColorStop(0, shade(theme.lane, -0.05));
  grad.addColorStop(0.5, theme.lane);
  grad.addColorStop(1, mix(theme.lane, theme.laneEdge, 0.6));
  ctx.fillStyle = grad;
  roundedBand(ctx, x0, yTop, x1, yBot, band * 0.5);
  ctx.fill();
  ctx.strokeStyle = rgba(theme.laneEdge.startsWith('#') ? theme.laneEdge : '#000000', 0.8);
  ctx.lineWidth = Math.max(1, band * 0.05);
  ctx.stroke();

  // Paving stones / pebbles
  ctx.save();
  roundedBand(ctx, x0, yTop, x1, yBot, band * 0.5);
  ctx.clip();
  const n = Math.round((x1 - x0) / (band * 0.55));
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + rng.next()) * ((x1 - x0) / n);
    const y = yTop + band * (0.15 + rng.next() * 0.8);
    const r = band * (0.08 + rng.next() * 0.12);
    ctx.fillStyle = rng.chance(0.5) ? rgba(theme.laneDetail, 0.45) : rgba(theme.laneEdge, 0.3);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Highlight along the top edge
  ctx.fillStyle = rgba('#ffffff', 0.08);
  ctx.fillRect(x0, yTop, x1 - x0, band * 0.12);
  ctx.restore();

  // Grass tufts hugging both edges of the path (skipping the citadel gates).
  const step = band * 0.32;
  for (const edge of [yTop + band * 0.02, yBot - band * 0.04]) {
    for (let x = g.x0 + band * 0.6; x < g.x1 - band * 0.6; x += step * (0.6 + rng.next())) {
      if (rng.chance(0.45)) continue;
      const k = 0.6 + rng.next() * 0.7;
      const hgt = band * 0.16 * k;
      ctx.fillStyle = theme.foliage[rng.int(theme.foliage.length)];
      for (let b = -1; b <= 1; b++) {
        const bx = x + b * band * 0.035;
        ctx.beginPath();
        ctx.moveTo(bx - band * 0.02, edge);
        ctx.quadraticCurveTo(bx + b * band * 0.02, edge - hgt * 0.6, bx + b * band * 0.05, edge - hgt * (b === 0 ? 1.2 : 0.9));
        ctx.quadraticCurveTo(bx + band * 0.005, edge - hgt * 0.4, bx + band * 0.02, edge);
        ctx.fill();
      }
    }
  }

  // Shrine dais
  const sx = laneX(g, SHRINE_X);
  const rx = band * 1.25;
  const ry = band * 0.42;
  ctx.fillStyle = rgba('#000000', 0.18);
  ctx.beginPath();
  ctx.ellipse(sx, g.y + ry * 0.35, rx * 1.08, ry * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(theme.laneEdge, -0.1);
  ctx.beginPath();
  ctx.ellipse(sx, g.y + ry * 0.2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mix(theme.lane, '#ffffff', 0.25);
  ctx.beginPath();
  ctx.ellipse(sx, g.y, rx * 0.92, ry * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(theme.laneEdge, 0.7);
  ctx.lineWidth = Math.max(1, band * 0.04);
  ctx.beginPath();
  ctx.ellipse(sx, g.y, rx * 0.6, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function roundedBand(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r);
}

function drawFoliage(ctx: CanvasRenderingContext2D, layout: Layout, theme: Theme, rng: Rng): void {
  const W = layout.width;
  const H = layout.height;
  const hz = layout.horizon;
  const count = Math.round(110 * (W / 1600));
  for (let i = 0; i < count; i++) {
    const x = rng.next() * W;
    const y = hz + layout.field.h * 0.04 + rng.next() * (H - hz);
    // Keep the lanes clear.
    let onLane = false;
    for (const g of layout.lanes) if (y > g.y - g.band * 0.7 && y < g.y + g.band * 0.9 && x > g.x0 - g.band * 1.5 && x < g.x1 + g.band * 1.5) onLane = true;
    if (onLane) continue;
    const k = (y - hz) / (H - hz);
    const s = (0.4 + k * 1.1) * layout.field.h * 0.012;
    const col = theme.foliage[rng.int(theme.foliage.length)];
    ctx.fillStyle = col;
    if (rng.chance(0.65)) {
      // grass tuft
      for (let b = 0; b < 5; b++) {
        const bx = x + (b - 2) * s * 0.6;
        const h = s * (1.6 + rng.next() * 1.4);
        ctx.beginPath();
        ctx.moveTo(bx - s * 0.25, y);
        ctx.quadraticCurveTo(bx + (b - 2) * s * 0.2, y - h * 0.6, bx + (b - 2) * s * 0.45, y - h);
        ctx.quadraticCurveTo(bx + s * 0.05, y - h * 0.4, bx + s * 0.25, y);
        ctx.fill();
      }
    } else {
      // rock / bush
      ctx.fillStyle = rng.chance(0.5) ? col : shade(theme.laneEdge, -0.2);
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.5, s * (1.2 + rng.next()), s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.12);
      ctx.beginPath();
      ctx.ellipse(x - s * 0.3, y - s * 0.8, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A soft vignette overlay. */
export function renderVignette(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const g = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(5,3,15,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}
