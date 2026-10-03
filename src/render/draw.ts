/** Small vector drawing helpers used by all procedural art. */

export const OUTLINE = '#1b1229';
export const TAU = Math.PI * 2;

/** Outline width in local art units; the renderer sets it so outlines stay ~1.3 screen px. */
export let LW = 1.2;
export function setLineWidth(v: number): void {
  LW = v;
}

export type Ctx = CanvasRenderingContext2D;

export function circle(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
  ctx.fill();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  ctx.fill();
}

/** Filled ellipse with an outline. */
export function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0, lw = LW): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** A rounded limb segment drawn as a thick line with an outline. */
export function limb(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, fill: string, lw = LW): void {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + lw * 2;
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Two-segment limb (e.g. thigh + shin) through a joint. */
export function limb2(
  ctx: Ctx,
  x1: number,
  y1: number,
  jx: number,
  jy: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
  fill: string,
  lw = LW,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w1 + lw * 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(jx, jy);
  ctx.stroke();
  ctx.lineWidth = w2 + lw * 2;
  ctx.beginPath();
  ctx.moveTo(jx, jy);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(jx, jy);
  ctx.stroke();
  ctx.lineWidth = w2;
  ctx.beginPath();
  ctx.moveTo(jx, jy);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Polygon / path from a flat list of points with optional outline. */
export function poly(ctx: Ctx, pts: number[], fill: string, outline = true, lw = LW): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

/** Smooth closed shape through points using quadratic midpoints. */
export function blob(ctx: Ctx, pts: number[], fill: string, outline = true, lw = LW): void {
  const n = pts.length / 2;
  ctx.beginPath();
  const mx = (pts[0] + pts[(n - 1) * 2]) / 2;
  const my = (pts[1] + pts[(n - 1) * 2 + 1]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const nx = pts[((i + 1) % n) * 2];
    const ny = pts[((i + 1) % n) * 2 + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, outline = true, lw = LW): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, col: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Glowing dot (cheap: two translucent circles). */
export function glowDot(ctx: Ctx, x: number, y: number, r: number, col: string, core = '#ffffff'): void {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.35;
  circle(ctx, x, y, r * 2.2, col);
  ctx.globalAlpha = a;
  circle(ctx, x, y, r, col);
  circle(ctx, x, y, r * 0.45, core);
}

// ---------------------------------------------------------------------------
// Animation curves
// ---------------------------------------------------------------------------

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number) => t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Attack swing curve: 0 at rest, eases back to -1 (wind-up) until the impact point `hit`,
 * snaps to +1 at impact, then recovers to 0.
 */
export function swing(a: number, hit: number): number {
  if (a < 0 || a >= 1) return 0;
  if (a < hit * 0.8) return -easeOut(a / (hit * 0.8));
  if (a < hit) return lerp(-1, 1, easeIn((a - hit * 0.8) / (hit * 0.2)));
  return 1 - easeInOut((a - hit) / (1 - hit));
}

/** Pre-rendered radial glow sprites keyed by colour. */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(rgb: [number, number, number] | string): HTMLCanvasElement {
  const key = typeof rgb === 'string' ? rgb : rgb.join(',');
  let c = glowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  let col: string;
  if (typeof rgb !== 'string') col = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  else if (rgb.startsWith('#')) {
    // Accept hex too ("#rrggbb"), so a missing rgb triple can never produce an invalid colour.
    const n = parseInt(rgb.slice(1, 7), 16);
    col = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  } else col = rgb.replace(/^rgba?\(|\)$/g, '').split(',').slice(0, 3).join(',');
  g.addColorStop(0, `rgba(${col},1)`);
  g.addColorStop(0.25, `rgba(${col},0.55)`);
  g.addColorStop(0.6, `rgba(${col},0.15)`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowCache.set(key, c);
  return c;
}

export function drawGlow(ctx: Ctx, x: number, y: number, r: number, rgb: [number, number, number] | string, alpha: number): void {
  if (alpha <= 0.003 || r <= 0) return;
  const prevA = ctx.globalAlpha;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalAlpha = prevA * Math.min(1, alpha);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prevA;
  ctx.globalCompositeOperation = prevOp;
}

/**
 * Union of circles with a single outer outline (leaf canopies, clouds, fur tufts).
 * `c` is a flat list of x, y, r triplets.
 */
export function cluster(ctx: Ctx, c: number[], fill: string, lw = LW): void {
  ctx.beginPath();
  for (let i = 0; i < c.length; i += 3) {
    ctx.moveTo(c[i] + c[i + 2] + lw, c[i + 1]);
    ctx.arc(c[i], c[i + 1], c[i + 2] + lw, 0, TAU);
  }
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < c.length; i += 3) {
    ctx.moveTo(c[i] + c[i + 2], c[i + 1]);
    ctx.arc(c[i], c[i + 1], c[i + 2], 0, TAU);
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Circles without outline (highlights inside a cluster). */
export function dots(ctx: Ctx, c: number[], fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < c.length; i += 3) {
    ctx.moveTo(c[i] + c[i + 2], c[i + 1]);
    ctx.arc(c[i], c[i + 1], c[i + 2], 0, TAU);
  }
  ctx.fillStyle = fill;
  ctx.fill();
}
