import type { ProjectileKind } from '../sim/data.ts';
import type { Team } from '../sim/types.ts';
import { TAU, circle, drawGlow, line } from './draw.ts';
import type { Fx } from './fx.ts';
import { TEAM_COLORS } from './theme.ts';

type RGB = [number, number, number];

const GLOW: Partial<Record<ProjectileKind, RGB>> = {
  gaze: [140, 255, 150],
  foxfire: [140, 200, 255],
  flame: [255, 150, 50],
  dragonfire: [255, 110, 40],
  spore: [200, 255, 120],
  firepot: [255, 140, 50],
  rune: [120, 230, 255],
  iceboulder: [190, 235, 255],
  rocket: [255, 170, 80],
  sunbeam: [255, 230, 150],
  starorb: [255, 235, 170],
  spear: [255, 245, 200],
};

/** Draws a projectile in flight. `angle` is its screen-space heading. */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  fx: Fx,
  kind: ProjectileKind,
  team: Team,
  x: number,
  y: number,
  angle: number,
  s: number,
  lane: number,
  time: number,
  fromX: number,
  fromY: number,
  _t: number,
  dt: number,
): void {
  const tc = TEAM_COLORS[team];
  // Trails emit per second, not per frame (same density at 144 Hz; none while paused).
  const always = Math.random() < dt * 60;
  const emit = Math.random() < dt * 30;
  switch (kind) {
    case 'spark':
    case 'ward': {
      drawGlow(ctx, x, y, 10 * s + 3, tc.rgb, 0.85);
      circle(ctx, x, y, 2 * s + 0.6, '#ffffff');
      if (emit) fx.add({ x, y, life: 0.35, color: tc.light, size: 1.6, shape: 'glow', rgb: tc.rgb, layer: lane, vy: 10 });
      break;
    }
    case 'gaze': {
      // A sustained petrifying beam from the gorgon's eyes.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(120, 255, 140, 0.35)';
      ctx.lineWidth = 6 * s + 2;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 255, 220, 0.9)';
      ctx.lineWidth = 1.6 * s + 0.6;
      ctx.stroke();
      ctx.restore();
      drawGlow(ctx, x, y, 9 * s + 3, GLOW.gaze!, 0.9);
      break;
    }
    case 'spear': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      drawGlow(ctx, 0, 0, 14 * s, GLOW.spear!, 0.5);
      line(ctx, -14 * s, 0, 8 * s, 0, 2 * s, '#fff4c8');
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(12 * s, 0);
      ctx.lineTo(6 * s, -2.5 * s);
      ctx.lineTo(6 * s, 2.5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'foxfire': {
      const fl = Math.sin(time * 30) * 0.15 + 1;
      drawGlow(ctx, x, y, 12 * s * fl + 3, GLOW.foxfire!, 0.95);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#dff0ff';
      ctx.beginPath();
      ctx.moveTo(4 * s, 0);
      ctx.quadraticCurveTo(0, -4 * s, -8 * s * fl, 0);
      ctx.quadraticCurveTo(0, 4 * s, 4 * s, 0);
      ctx.fill();
      ctx.restore();
      if (emit) fx.add({ x, y, life: 0.4, color: '#9fd0ff', size: 2, shape: 'glow', rgb: GLOW.foxfire!, layer: lane, vy: -20 });
      break;
    }
    case 'flame':
    case 'dragonfire': {
      const big = kind === 'dragonfire' ? 2 : 1;
      drawGlow(ctx, x, y, 14 * s * big + 3, GLOW[kind]!, 0.95);
      circle(ctx, x, y, 3.2 * s * big, '#fff1b0');
      for (let i = 0; i < big + 1 && always; i++) {
        fx.add({
          x: x + (Math.random() - 0.5) * 4 * s,
          y: y + (Math.random() - 0.5) * 4 * s,
          vx: -Math.cos(angle) * 30,
          vy: -Math.sin(angle) * 30 - 20,
          life: 0.35 + Math.random() * 0.2,
          color: '#ffb347',
          size: 2.5 * big,
          shape: 'glow',
          rgb: [255, 140, 40],
          layer: lane,
        });
      }
      if (big > 1 && emit) fx.add({ x, y, life: 0.7, color: 'rgba(60,40,40,0.5)', size: 5, shape: 'smoke', layer: lane, vy: -15 });
      break;
    }
    case 'thorn': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#3f6b2a';
      ctx.beginPath();
      ctx.moveTo(7 * s, 0);
      ctx.lineTo(-4 * s, -2.2 * s);
      ctx.lineTo(-4 * s, 2.2 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'spore': {
      drawGlow(ctx, x, y, 10 * s, GLOW.spore!, 0.6);
      circle(ctx, x, y, 4.5 * s, '#a874d8');
      circle(ctx, x - 1.2 * s, y - 1.2 * s, 1.6 * s, '#e6c9ff');
      if (emit) fx.add({ x, y, life: 0.5, color: 'rgba(200,255,140,0.6)', size: 2, shape: 'dot', layer: lane, vy: 6 });
      break;
    }
    case 'bolt':
    case 'arrow': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const len = kind === 'bolt' ? 16 : 11;
      line(ctx, -len * s, 0, 4 * s, 0, kind === 'bolt' ? 2.2 * s : 1.4 * s, '#6b4a2b');
      ctx.fillStyle = '#d8dde6';
      ctx.beginPath();
      ctx.moveTo(7 * s, 0);
      ctx.lineTo(2 * s, -2.4 * s);
      ctx.lineTo(2 * s, 2.4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = kind === 'arrow' ? '#2f8a62' : tc.main;
      ctx.beginPath();
      ctx.moveTo(-len * s, 0);
      ctx.lineTo(-len * s - 3 * s, -2.5 * s);
      ctx.lineTo(-len * s + 3 * s, 0);
      ctx.lineTo(-len * s - 3 * s, 2.5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'firepot': {
      drawGlow(ctx, x, y, 12 * s, GLOW.firepot!, 0.7);
      circle(ctx, x, y, 4 * s, '#8a4a2a');
      circle(ctx, x, y - 3 * s, 2.5 * s, '#ffb347');
      if (always) fx.add({ x, y: y - 3 * s, life: 0.4, color: '#ff9b3d', size: 2.4, shape: 'glow', rgb: [255, 140, 50], layer: lane, vy: -25 });
      break;
    }
    case 'rune': {
      drawGlow(ctx, x, y, 12 * s + 2, GLOW.rune!, 0.9);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 6);
      ctx.strokeStyle = '#e8fbff';
      ctx.lineWidth = 1.4 * s + 0.4;
      ctx.beginPath();
      ctx.moveTo(0, -4 * s);
      ctx.lineTo(0, 4 * s);
      ctx.moveTo(0, -1 * s);
      ctx.lineTo(3 * s, -4 * s);
      ctx.moveTo(0, 1 * s);
      ctx.lineTo(-3 * s, 4 * s);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'iceboulder': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 4);
      ctx.fillStyle = '#cfefff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const r = (i % 2 ? 5 : 6.5) * s;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (emit) fx.add({ x, y, life: 0.5, color: '#ffffff', size: 1.4, shape: 'dot', layer: lane, vy: 10 });
      break;
    }
    case 'rocket': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#b8382f';
      ctx.fillRect(-6 * s, -1.8 * s, 10 * s, 3.6 * s);
      ctx.fillStyle = '#e2b84a';
      ctx.beginPath();
      ctx.moveTo(7 * s, 0);
      ctx.lineTo(4 * s, -2 * s);
      ctx.lineTo(4 * s, 2 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (always) fx.add({ x: x - Math.cos(angle) * 6 * s, y: y - Math.sin(angle) * 6 * s, life: 0.3, color: '#ffcf70', size: 2, shape: 'glow', rgb: [255, 190, 90], layer: lane });
      if (emit) fx.add({ x, y, life: 0.6, color: 'rgba(120,110,110,0.5)', size: 3, shape: 'smoke', layer: lane, vy: -6 });
      break;
    }
    case 'sunbeam': {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.4)';
      ctx.lineWidth = 8 * s + 2;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 250, 225, 0.95)';
      ctx.lineWidth = 2.4 * s + 0.6;
      ctx.stroke();
      ctx.restore();
      drawGlow(ctx, x, y, 14 * s, GLOW.sunbeam!, 1);
      break;
    }
    case 'starorb': {
      drawGlow(ctx, x, y, 16 * s, GLOW.starorb!, 0.95);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 3);
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const r = (i % 2 ? 2 : 5) * s;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (emit) fx.add({ x, y, life: 0.6, color: '#fff2b8', size: 2, shape: 'glow', rgb: [255, 240, 180], layer: lane });
      break;
    }
  }
}

/** Impact flourish when a projectile lands. */
export function projectileImpact(fx: Fx, kind: ProjectileKind, x: number, laneY: number, s: number, lane: number, splash: number, team: Team): void {
  const tc = TEAM_COLORS[team];
  const y = laneY - 18 * s;
  const glow = GLOW[kind];
  if (splash > 0) {
    const r = splash * s;
    fx.timedFx({ kind: 'scorch', x, y: laneY + 2, dur: 1.6, layer: lane, size: r * 0.9, rgb: glow ?? [255, 160, 80] });
    fx.timedFx({ kind: 'shockwave', x, y: laneY, dur: 0.5, layer: lane, size: r * 1.4, color: glow ? `rgb(${glow.join(',')})` : '#ffe0a0', rgb: glow ?? [255, 220, 160] });
    fx.burst(x, laneY - 6 * s, { count: 18, color: glow ? `rgb(${glow.join(',')})` : '#ffcf8a', rgb: glow ?? [255, 200, 120], speed: 180, life: 0.6, size: 2.6, shape: 'glow', layer: lane, gravity: 260 });
    fx.burst(x, laneY - 4 * s, { count: 6, color: 'rgba(80,70,70,0.55)', speed: 60, life: 0.9, size: 5 * s + 2, shape: 'smoke', layer: lane, gravity: -15 });
    return;
  }
  switch (kind) {
    case 'spark':
    case 'ward':
      fx.burst(x, y, { count: 6, color: tc.light, rgb: tc.rgb, speed: 90, life: 0.35, size: 1.8, shape: 'glow', layer: lane });
      break;
    case 'gaze':
      fx.burst(x, y, { count: 6, color: '#b9ffb0', rgb: [140, 255, 150], speed: 60, life: 0.4, size: 2, shape: 'glow', layer: lane });
      break;
    case 'foxfire':
      fx.burst(x, y, { count: 8, color: '#bfe0ff', rgb: [140, 200, 255], speed: 110, life: 0.45, size: 2.2, shape: 'glow', layer: lane });
      break;
    case 'flame':
      fx.burst(x, y, { count: 10, color: '#ffb347', rgb: [255, 150, 50], speed: 110, life: 0.45, size: 2.4, shape: 'glow', layer: lane, gravity: -40 });
      break;
    case 'iceboulder':
    case 'rune':
      fx.burst(x, y, { count: 8, color: '#dff6ff', speed: 120, life: 0.4, size: 2.4, shape: 'shard', layer: lane, gravity: 200 });
      break;
    case 'sunbeam':
      fx.burst(x, y, { count: 10, color: '#fff2c0', rgb: [255, 230, 150], speed: 140, life: 0.4, size: 2.2, shape: 'glow', layer: lane });
      break;
    default:
      fx.burst(x, y, { count: 5, color: '#e8dccb', speed: 90, life: 0.3, size: 1.6, shape: 'spark', layer: lane, drag: 4 });
  }
}
