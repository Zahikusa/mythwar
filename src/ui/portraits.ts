import { artFor } from '../render/creatures/index.ts';
import { setLineWidth } from '../render/draw.ts';
import { hudZoom } from '../render/layout.ts';
import { TEAM_COLORS } from '../render/theme.ts';
import type { Team } from '../sim/types.ts';

const cache = new Map<string, HTMLCanvasElement>();

/** CSS zoom the HUD/menus get on large desktop screens (see hudZoom), estimated from the window. */
function screenZoom(): number {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 1 : hudZoom(window.innerWidth, window.innerHeight, 'desktop');
}

/**
 * Renders a creature into a square canvas (CSS size `size`, crisp on high-DPI screens).
 * `zoom` is the CSS zoom the canvas will be shown under (the large-screen desktop HUD/menus).
 */
export function portrait(defId: string, size: number, team: Team = 0, t = 0.4, faceLeft = false, zoom = screenZoom()): HTMLCanvasElement {
  const dpr = Math.min(3, (window.devicePixelRatio || 1) * zoom);
  const key = `${defId}:${size}:${team}:${dpr}:${t}:${faceLeft}`;
  const hit = cache.get(key);
  if (hit) {
    const c = document.createElement('canvas');
    c.width = hit.width;
    c.height = hit.height;
    c.style.width = c.style.height = `${size}px`;
    c.getContext('2d')!.drawImage(hit, 0, 0);
    return c;
  }
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  drawPortrait(c, defId, team, t, faceLeft);
  const copy = document.createElement('canvas');
  copy.width = c.width;
  copy.height = c.height;
  copy.getContext('2d')!.drawImage(c, 0, 0);
  cache.set(key, copy);
  return c;
}

export function drawPortrait(c: HTMLCanvasElement, defId: string, team: Team, t: number, faceLeft = false): void {
  const ctx = c.getContext('2d')!;
  const art = artFor(defId);
  const size = c.width;
  ctx.clearRect(0, 0, size, size);
  const sc = (size * 0.78) / Math.max(36, art.height + 6);
  ctx.save();
  ctx.translate(size * (faceLeft ? 0.53 : 0.47), size * 0.9);
  ctx.scale(faceLeft ? -sc : sc, sc);
  setLineWidth(Math.min(1.8, 1.4 / (sc / Math.max(1, size / 64))));
  art.draw(ctx, {
    t,
    walk: 0,
    moving: false,
    attack: -1,
    hit: 0.5,
    tc: TEAM_COLORS[team],
    seed: 0.3,
    enraged: false,
    charged: false,
  });
  ctx.restore();
}
