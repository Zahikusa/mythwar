import type { Team, TurretSlot } from '../sim/types.ts';
import { TURRETS } from '../sim/data.ts';
import { OUTLINE, TAU, circle, cluster, dots, drawGlow, ellipse, line, oval, poly, rrect, setLineWidth } from './draw.ts';
import type { Layout } from './layout.ts';
import { TEAM_COLORS, shade } from './theme.ts';

interface Style {
  wall: string;
  wallDark: string;
  wallLight: string;
  roof: string;
  roofDark: string;
  trim: string;
  roofKind: 'canopy' | 'pediment' | 'steep' | 'pagoda' | 'spire';
}

export const CITADEL_STYLES: Style[] = [
  { wall: '#7d7466', wallDark: '#544c42', wallLight: '#a39a88', roof: '#4f8a3c', roofDark: '#2f5f27', trim: '#8a6236', roofKind: 'canopy' },
  { wall: '#ece4d4', wallDark: '#b8ab92', wallLight: '#fffaf0', roof: '#c06a3e', roofDark: '#8a4527', trim: '#d4a14a', roofKind: 'pediment' },
  { wall: '#6b5a48', wallDark: '#46392c', wallLight: '#8e7a62', roof: '#3d5266', roofDark: '#26364a', trim: '#c9d6e2', roofKind: 'steep' },
  { wall: '#b8382f', wallDark: '#7c2019', wallLight: '#d9584a', roof: '#2f7a62', roofDark: '#1c5444', trim: '#e2b84a', roofKind: 'pagoda' },
  { wall: '#f4efe6', wallDark: '#c9bfae', wallLight: '#ffffff', roof: '#e9c25a', roofDark: '#b88e2c', trim: '#ffe7a0', roofKind: 'spire' },
];

/** Mirror the drawing for team 1 so all citadel art can be authored for the left side. */
function withSide(ctx: CanvasRenderingContext2D, layout: Layout, team: Team, fn: () => void): void {
  ctx.save();
  if (team === 1) {
    const cx = layout.field.x + layout.field.w / 2;
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }
  fn();
  ctx.restore();
}

function roof(ctx: CanvasRenderingContext2D, st: Style, x: number, y: number, w: number, s: number, big: boolean): void {
  switch (st.roofKind) {
    case 'canopy': {
      const r = w * 0.36;
      cluster(ctx, [x - w * 0.3, y - r * 0.4, r, x + w * 0.3, y - r * 0.4, r, x, y - r * 1.1, r * 1.15, x - w * 0.55, y + r * 0.1, r * 0.6, x + w * 0.55, y + r * 0.1, r * 0.6], st.roof);
      dots(ctx, [x - w * 0.2, y - r * 1.4, r * 0.45, x + w * 0.15, y - r * 1.2, r * 0.35], shade(st.roof, 0.25));
      dots(ctx, [x - w * 0.35, y + r * 0.1, r * 0.4, x + w * 0.35, y, r * 0.38], st.roofDark);
      if (big) {
        // glowing mushrooms
        ellipse(ctx, x + w * 0.45, y + r * 0.35, r * 0.3, r * 0.15, '#e85a5a');
        circle(ctx, x + w * 0.42, y + r * 0.3, r * 0.05, '#fff');
      }
      break;
    }
    case 'pediment': {
      poly(ctx, [x - w * 0.62, y, x, y - w * 0.32, x + w * 0.62, y], st.wall);
      poly(ctx, [x - w * 0.45, y - w * 0.03, x, y - w * 0.24, x + w * 0.45, y - w * 0.03], st.wallLight, false);
      line(ctx, x - w * 0.62, y + 1, x + w * 0.62, y + 1, Math.max(1, 3 * s), st.trim);
      if (big) circle(ctx, x, y - w * 0.12, w * 0.06, st.trim);
      break;
    }
    case 'steep': {
      poly(ctx, [x - w * 0.62, y + w * 0.05, x, y - w * 0.75, x + w * 0.62, y + w * 0.05], st.roof);
      // shingle lines
      ctx.strokeStyle = st.roofDark;
      ctx.lineWidth = Math.max(1, 1.2 * s);
      for (let i = 1; i < 4; i++) {
        const k = i / 4;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.62 * (1 - k), y + w * 0.05 - w * 0.8 * k);
        ctx.lineTo(x + w * 0.62 * (1 - k), y + w * 0.05 - w * 0.8 * k);
        ctx.stroke();
      }
      // snow cap
      poly(ctx, [x - w * 0.2, y - w * 0.5, x, y - w * 0.75, x + w * 0.2, y - w * 0.5, x + w * 0.08, y - w * 0.45, x - w * 0.06, y - w * 0.52], '#eef6ff', false);
      // carved dragon-head gable ends
      line(ctx, x, y - w * 0.75, x - w * 0.1, y - w * 0.92, Math.max(1.5, 2.5 * s), st.trim);
      line(ctx, x, y - w * 0.75, x + w * 0.1, y - w * 0.92, Math.max(1.5, 2.5 * s), st.trim);
      break;
    }
    case 'pagoda': {
      const tiers = big ? 3 : 1;
      let yy = y;
      let ww = w * 0.72;
      for (let i = 0; i < tiers; i++) {
        ctx.beginPath();
        ctx.moveTo(x - ww, yy);
        ctx.quadraticCurveTo(x - ww * 0.6, yy - ww * 0.1, x - ww * 0.45, yy - ww * 0.3);
        ctx.lineTo(x + ww * 0.45, yy - ww * 0.3);
        ctx.quadraticCurveTo(x + ww * 0.6, yy - ww * 0.1, x + ww, yy);
        ctx.quadraticCurveTo(x, yy - ww * 0.12, x - ww, yy);
        ctx.closePath();
        ctx.fillStyle = st.roof;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        line(ctx, x - ww * 0.9, yy - 1, x + ww * 0.9, yy - 1, Math.max(1, 1.6 * s), st.trim);
        if (i < tiers - 1) {
          rrect(ctx, x - ww * 0.38, yy - ww * 0.3 - w * 0.2, ww * 0.76, w * 0.2, 0, st.wall);
        }
        yy -= ww * 0.3 + (i < tiers - 1 ? w * 0.2 : 0);
        ww *= 0.75;
      }
      line(ctx, x, yy, x, yy - w * 0.25, Math.max(1, 2 * s), st.trim);
      circle(ctx, x, yy - w * 0.27, Math.max(1.5, 2.5 * s), st.trim);
      break;
    }
    case 'spire': {
      poly(ctx, [x - w * 0.42, y, x, y - w * 1.3, x + w * 0.42, y], st.roof);
      poly(ctx, [x - w * 0.42, y, x, y - w * 1.3, x - w * 0.05, y], shade(st.roof, 0.2), false);
      drawGlow(ctx, x, y - w * 1.3, w * 0.6, [255, 240, 190], 0.6);
      ctx.strokeStyle = 'rgba(255, 236, 170, 0.8)';
      ctx.lineWidth = Math.max(1, 1.5 * s);
      ctx.beginPath();
      ctx.ellipse(x, y - w * 0.95, w * 0.4, w * 0.1, 0, 0, TAU);
      ctx.stroke();
      break;
    }
  }
}

function crenellations(ctx: CanvasRenderingContext2D, st: Style, x0: number, x1: number, y: number, s: number): void {
  const n = Math.max(3, Math.round((x1 - x0) / (9 * s)));
  const bw = (x1 - x0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) rrect(ctx, x0 + i * bw * 2, y - 6 * s, bw, 6 * s + 1, 1, st.wall);
}

function windowLight(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, team: Team, t: number, flicker: number): void {
  const tc = TEAM_COLORS[team];
  rrect(ctx, x - w / 2, y - h, w, h, w / 2, '#1d1426');
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3 + flicker);
  rrect(ctx, x - w * 0.32, y - h * 0.82, w * 0.64, h * 0.7, w * 0.3, tc.light, false);
  ctx.globalAlpha = 1;
  drawGlow(ctx, x, y - h * 0.5, w * 2.2, tc.rgb, 0.25);
}

/** Where the keep stands (team 0's side; team 1 mirrors it across the field). */
function keepGeom(layout: Layout): { keepX: number; baseY: number; w: number; h: number; s: number } {
  const far = layout.lanes[0];
  const s = far.s * 1.15;
  const fx = layout.field.x;
  const baseY = far.y + far.band * 0.4;
  return { keepX: fx + (far.x0 - fx) * 0.44, baseY, w: Math.max(34 * s, (far.x0 - fx) * 0.5), h: (baseY - layout.horizon) * 1.2 + 26 * s, s };
}

/**
 * Where a side's emblem hangs on the face of its keep (Lens #85: the player's sigil), in stage
 * coordinates, with its radius.
 */
export function keepEmblem(layout: Layout, team: Team, age: number): { x: number; y: number; r: number } {
  const { keepX, baseY, w, h } = keepGeom(layout);
  const temple = CITADEL_STYLES[age].roofKind === 'pediment';
  const x = team === 0 ? keepX : 2 * layout.field.x + layout.field.w - keepX;
  // Between the trim band and the great window (on the temple, above its columns' capitals).
  return { x, y: baseY - h + h * (temple ? 0.1 : 0.15), r: Math.min(w * 0.16, h * 0.07) };
}

/** The citadel keep: tall central tower behind the far lane, plus damage smoke. */
export function drawCitadelKeep(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  team: Team,
  age: number,
  hpFrac: number,
  t: number,
  hitFlash: number,
  ageFlash: number,
  collapse = 0,
  part: 'all' | 'static' | 'dynamic' = 'all',
): void {
  // 'static' = masonry, roof, window frames, banner pole (cacheable);
  // 'dynamic' = window glow, waving banner, flashes, smoke (drawn every frame).
  const S = part !== 'dynamic';
  const D = part !== 'static';
  const st = CITADEL_STYLES[age];
  const far = layout.lanes[0];
  const near = layout.lanes[layout.lanes.length - 1];
  const fx = layout.field.x;
  const { keepX, baseY, w, h, s } = keepGeom(layout);
  const tc = TEAM_COLORS[team];
  withSide(ctx, layout, team, () => {
    setLineWidth(1.2);
    // Curtain wall linking gates, running down toward the near lane
    const wallTopFar = baseY - 26 * s;
    if (S) {
    ctx.fillStyle = st.wallDark;
    ctx.beginPath();
    ctx.moveTo(fx - 10, wallTopFar);
    ctx.lineTo(far.x0 - 4, wallTopFar);
    ctx.lineTo(near.x0 - 4, near.y - 30 * near.s);
    ctx.lineTo(near.x0 - 4, layout.height + 10);
    ctx.lineTo(fx - 10, layout.height + 10);
    ctx.closePath();
    ctx.fill();
    const wallGrad = ctx.createLinearGradient(fx, 0, near.x0, 0);
    wallGrad.addColorStop(0, shade(st.wall, -0.25));
    wallGrad.addColorStop(1, st.wall);
    ctx.fillStyle = wallGrad;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Brick courses (clipped to the wall)
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = 1;
    let row = 0;
    for (let yy = wallTopFar + 10 * s; yy < layout.height; yy += 10 * s) {
      ctx.beginPath();
      ctx.moveTo(fx - 10, yy);
      ctx.lineTo(far.x0, yy);
      for (let xx = fx + (row % 2) * 9 * s; xx < far.x0; xx += 18 * s) {
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy - 10 * s);
      }
      ctx.stroke();
      row++;
    }
    // Shadow toward the outer edge for depth
    const edge = ctx.createLinearGradient(fx, 0, near.x0, 0);
    edge.addColorStop(0, 'rgba(10,6,20,0.45)');
    edge.addColorStop(1, 'rgba(10,6,20,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(fx - 10, wallTopFar - 10, near.x0 - fx + 10, layout.height);
    ctx.restore();
    // Crenellations along the slanted top of the rampart
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = far.x0 - 4 + (near.x0 - far.x0) * k;
      const y = wallTopFar + (near.y - 30 * near.s - wallTopFar) * k;
      rrect(ctx, x - 9 * s, y - 6 * s, 7 * s, 7 * s, 1, st.wall);
    }
    for (let x = fx; x < far.x0 - 12 * s; x += 14 * s) rrect(ctx, x, wallTopFar - 6 * s, 7 * s, 7 * s, 1, st.wall);
    }

    // Keep tower (sinks and topples when the citadel falls)
    if (collapse > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx - 200, -1000, far.x0 - fx + 400, baseY + 1000);
      ctx.clip();
      const k = collapse * collapse;
      ctx.translate(keepX, baseY);
      ctx.rotate(k * 0.22 + Math.sin(t * 40) * 0.01 * (1 - k));
      ctx.translate(-keepX, -baseY + k * h * 0.95);
    }
    const kx = keepX - w / 2;
    const ky = baseY - h;
    const temple = st.roofKind === 'pediment';
    const windows: [number, number, number, number, number][] = [
      [keepX, ky + h * 0.42, w * (temple ? 0.13 : 0.2), h * 0.16, 0],
      [keepX - w * (temple ? 0.213 : 0.25), ky + h * 0.68, w * (temple ? 0.09 : 0.12), h * 0.1, 1.3],
      [keepX + w * (temple ? 0.213 : 0.25), ky + h * 0.68, w * (temple ? 0.09 : 0.12), h * 0.1, 2.1],
    ];
    const poleX = keepX;
    const poleTop = ky - (st.roofKind === 'spire' ? w * 1.45 : st.roofKind === 'steep' ? w * 0.95 : st.roofKind === 'pagoda' ? w * 0.95 : w * 0.7) - 18 * s;
    if (S) {
    const grad = ctx.createLinearGradient(kx, 0, kx + w, 0);
    grad.addColorStop(0, shade(st.wall, -0.2));
    grad.addColorStop(0.55, st.wall);
    grad.addColorStop(1, st.wallLight);
    ctx.beginPath();
    ctx.moveTo(kx, baseY);
    ctx.lineTo(kx + w * 0.06, ky);
    ctx.lineTo(kx + w * 0.94, ky);
    ctx.lineTo(kx + w, baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (st.roofKind === 'pediment') {
      // Columns
      for (let i = 0; i < 4; i++) {
        const cx = kx + w * (0.18 + i * 0.213);
        rrect(ctx, cx - w * 0.04, ky + h * 0.12, w * 0.08, h * 0.7, 2, st.wallLight);
      }
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      for (let yy = ky + 12 * s; yy < baseY; yy += 12 * s) {
        ctx.beginPath();
        ctx.moveTo(kx + w * 0.05, yy);
        ctx.lineTo(kx + w * 0.95, yy);
        ctx.stroke();
      }
    }
    // Trim band and windows
    line(ctx, kx + w * 0.04, ky + 4 * s, kx + w * 0.96, ky + 4 * s, Math.max(1.5, 3 * s), st.trim);
    for (const [wx, wy, ww, wh] of windows) rrect(ctx, wx - ww / 2, wy - wh, ww, wh, ww / 2, '#1d1426');
    if (st.roofKind !== 'pagoda' && st.roofKind !== 'canopy') crenellations(ctx, st, kx + w * 0.04, kx + w * 0.96, ky + 1, s);
    roof(ctx, st, keepX, ky, w * 1.05, s, true);
    // Banner pole
    line(ctx, poleX, poleTop + 22 * s, poleX, poleTop, Math.max(1.2, 1.8 * s), '#3a2c22');
    }
    if (!D) {
      if (collapse > 0) ctx.restore();
      return;
    }
    for (const [wx, wy, ww, wh, fl] of windows) windowLight(ctx, wx, wy, ww, wh, team, t, fl);
    ctx.fillStyle = tc.main;
    ctx.beginPath();
    ctx.moveTo(poleX, poleTop);
    const wave = Math.sin(t * 4) * 2 * s;
    ctx.quadraticCurveTo(poleX + 9 * s, poleTop + 2 * s + wave, poleX + 18 * s, poleTop + wave * 0.5);
    ctx.lineTo(poleX + 15 * s, poleTop + 6 * s + wave);
    ctx.lineTo(poleX + 18 * s, poleTop + 11 * s + wave * 0.5);
    ctx.quadraticCurveTo(poleX + 9 * s, poleTop + 12 * s - wave, poleX, poleTop + 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (hitFlash > 0) {
      ctx.globalAlpha = hitFlash * 0.25;
      ctx.fillStyle = '#ff6040';
      ctx.fillRect(kx, ky, w, h);
      ctx.globalAlpha = 1;
    }
    if (ageFlash > 0) drawGlow(ctx, keepX, ky + h * 0.4, w * 2.2 * (1.2 - ageFlash * 0.2), [255, 236, 180], ageFlash);
    // Damage: smoke and fire
    if (hpFrac < 0.6) {
      const n = hpFrac < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const sx = keepX + (i - 1) * w * 0.3;
        const sy = ky + h * (0.25 + i * 0.12);
        for (let j = 0; j < 5; j++) {
          const k = (t * 0.4 + j / 5 + i * 0.3) % 1;
          ctx.globalAlpha = (1 - k) * 0.35;
          circle(ctx, sx + Math.sin(k * 6 + i) * 6 * s, sy - k * 60 * s, (4 + k * 10) * s, '#3a3438');
        }
        ctx.globalAlpha = 1;
        if (hpFrac < 0.3) drawGlow(ctx, sx, sy, 12 * s, [255, 120, 40], 0.6 + 0.3 * Math.sin(t * 12 + i));
      }
    }
    if (collapse > 0) ctx.restore();
  });
}

/** A gate tower where a lane meets the citadel. Drawn in lane order (far → near). */
export function drawCitadelGate(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  team: Team,
  lane: number,
  age: number,
  _gateX: number,
  laneY: number,
  s: number,
  hitFlash: number,
  t: number,
  collapse = 0,
  part: 'all' | 'static' | 'dynamic' = 'all',
  emerge = 0,
): void {
  // 'static' = masonry, dark archway, trim, crenellations, pennant pole (cacheable);
  // 'dynamic' = portal glow, arch trim on top of it, ward crystal, pennant flag, hit flash.
  // `emerge` (0..1): a creature is about to step out of this gate — the portal flares.
  const S = part !== 'dynamic';
  const D = part !== 'static';
  const st = CITADEL_STYLES[age];
  const g = layout.lanes[lane];
  withSide(ctx, layout, team, () => {
    if (collapse > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.x0 - 200, -1000, 400, laneY + g.band * 0.5 + 1000);
      ctx.clip();
      ctx.translate(0, collapse * collapse * 60 * s);
    }
    // Lanes are symmetric, so in mirrored space the right gate maps onto the left one.
    const x = g.x0;
    const w = 40 * s;
    const h = 58 * s;
    const bx = x - w * 0.95;
    const by = laneY + g.band * 0.5;
    setLineWidth(1.2);
    const ax = bx + w * 0.62;
    const aw = w * 0.5;
    const ah = h * 0.55;
    const archPath = () => {
      ctx.beginPath();
      ctx.moveTo(ax - aw / 2, by);
      ctx.lineTo(ax - aw / 2, by - ah + aw / 2);
      ctx.arc(ax, by - ah + aw / 2, aw / 2, Math.PI, 0);
      ctx.lineTo(ax + aw / 2, by);
    };
    const px = bx + w * 0.08;
    const tc = TEAM_COLORS[team];
    if (S) {
    const grad = ctx.createLinearGradient(bx, 0, bx + w, 0);
    grad.addColorStop(0, shade(st.wall, -0.18));
    grad.addColorStop(1, st.wallLight);
    ctx.beginPath();
    ctx.roundRect(bx, by - h, w, h, [3 * s, 3 * s, 0, 0]);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Stone courses
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let yy = by - h + 10 * s; yy < by; yy += 9 * s) {
      ctx.beginPath();
      ctx.moveTo(bx + 2, yy);
      ctx.lineTo(bx + w - 2, yy);
      ctx.stroke();
    }
    // Archway the lane passes through (opening faces the battlefield)
    archPath();
    ctx.closePath();
    ctx.fillStyle = '#1a1222';
    ctx.fill();
    ctx.strokeStyle = st.trim;
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    archPath();
    ctx.stroke();
    // Top: crenellations (turret platform)
    crenellations(ctx, st, bx - 1, bx + w + 1, by - h + 1, s);
    line(ctx, px, by - h - 2, px, by - h - 20 * s, Math.max(1, 1.4 * s), '#3a2c22');
    }
    if (!D) {
      if (collapse > 0) ctx.restore();
      return;
    }
    // Portal glow inside the arch
    archPath();
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const pg = ctx.createLinearGradient(0, by - ah, 0, by);
    pg.addColorStop(0, `rgba(${tc.rgb.join(',')},0.15)`);
    pg.addColorStop(1, `rgba(${tc.rgb.join(',')},${Math.min(1, 0.5 + 0.15 * Math.sin(t * 3 + lane) + 0.5 * emerge)})`);
    ctx.fillStyle = pg;
    ctx.fillRect(ax - aw / 2, by - ah, aw, ah);
    if (emerge > 0) {
      // A bright core rising in the archway.
      drawGlow(ctx, ax, by - ah * 0.35, aw * (0.5 + 0.4 * emerge), [255, 255, 255], 0.55 * emerge);
    }
    ctx.restore();
    if (emerge > 0) drawGlow(ctx, ax, by - ah * 0.45, aw * 0.9 + 12 * s * emerge, tc.rgb, 0.7 * emerge);
    ctx.strokeStyle = st.trim;
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    archPath();
    ctx.stroke();
    // Ward crystal (built-in defence)
    const wy = by - h - 10 * s + Math.sin(t * 2 + lane) * 1.5 * s;
    drawGlow(ctx, bx + w * 0.2, wy, 9 * s, tc.rgb, 0.5);
    circle(ctx, bx + w * 0.2, wy, 2.4 * s, tc.light);
    // Small team pennant
    poly(ctx, [px, by - h - 20 * s, px + 10 * s, by - h - 17 * s + Math.sin(t * 5 + lane) * s, px, by - h - 13 * s], tc.main, true, 1);
    if (hitFlash > 0) {
      ctx.globalAlpha = hitFlash * 0.3;
      ctx.fillStyle = '#ff6040';
      ctx.fillRect(bx, by - h, w, h);
      ctx.globalAlpha = 1;
    }
    if (collapse > 0) ctx.restore();
  });
}

/** Screen-space bounding box of a gate tower (for caching its static layer). */
export function gateBounds(layout: Layout, team: Team, lane: number, laneY: number, s: number): { x: number; y: number; w: number; h: number } {
  const g = layout.lanes[lane];
  const w = 40 * s;
  const h = 58 * s;
  const bx = g.x0 - w * 0.95 - 3;
  const by = laneY + g.band * 0.5;
  const top = by - h - 24 * s;
  let x = bx;
  const width = w + 6;
  if (team === 1) {
    const cx = layout.field.x + layout.field.w / 2;
    x = 2 * cx - (bx + width);
  }
  return { x: Math.floor(x), y: Math.floor(top), w: Math.ceil(width) + 1, h: Math.ceil(by - top) + 3 };
}

/** Turret mounted on top of a lane's gate tower. */
export function drawTurret(
  ctx: CanvasRenderingContext2D,
  id: string,
  team: Team,
  gateX: number,
  laneY: number,
  band: number,
  s: number,
  slot: TurretSlot,
  simTime: number,
  aimScreenX: number,
): void {
  const def = TURRETS[id];
  if (!def) return;
  const st = CITADEL_STYLES[def.age];
  const tc = TEAM_COLORS[team];
  const dir = team === 0 ? 1 : -1;
  const w = 40 * s;
  const cx = gateX - dir * w * 0.45;
  const top = laneY + band * 0.5 - 58 * s - 4 * s;
  const since = simTime - slot.lastFire;
  ctx.save();
  ctx.translate(cx, top);
  // Turret art is authored small; draw it 1.5x so it reads at a glance.
  s *= 1.5;
  ctx.scale(dir, 1);
  setLineWidth(1.1);
  const aim = Math.max(-0.5, Math.min(0.3, Math.atan2(-(laneY - 20 * s - top) * 0.15, Math.abs(aimScreenX - cx) + 1) * -1));
  const fire = since >= 0 && since < 0.35 ? 1 - since / 0.35 : 0;
  const t = simTime;
  switch (id) {
    case 'thornspitter': {
      // A briar bulb that spits thorns
      for (const a of [-0.9, 0.9]) {
        ctx.save();
        ctx.rotate(a);
        blobLeaf(ctx, 0, -2 * s, 9 * s, '#3f7d32');
        ctx.restore();
      }
      line(ctx, 0, 0, 0, -8 * s, 3 * s, '#2f5f27');
      ctx.save();
      ctx.translate(0, -13 * s);
      ctx.rotate(aim);
      ctx.scale(1 + fire * 0.15, 1 - fire * 0.12);
      oval(ctx, 0, 0, 7 * s, 6 * s, '#5aa04a');
      for (let k = -1; k <= 1; k++) poly(ctx, [-3 * s + k * 3 * s, -5 * s, -2 * s + k * 3 * s, -9 * s, -1 * s + k * 3 * s, -5 * s], '#c9b77a', true, 0.8);
      ellipse(ctx, 6 * s, 0, 2.6 * s, 2 * s + fire * 1.5 * s, '#2a1a10');
      circle(ctx, 1 * s, -2 * s, 1.4 * s, tc.main);
      ctx.restore();
      break;
    }
    case 'sporepod': {
      // Toadstool mortar
      rrect(ctx, -4 * s, -12 * s, 8 * s, 12 * s, 3 * s, '#efe4cf');
      ctx.save();
      ctx.translate(0, -12 * s);
      ctx.scale(1 + fire * 0.12, 1 - fire * 0.2);
      blobCap(ctx, 13 * s, '#c8343f');
      dots(ctx, [-6 * s, -5 * s, 1.8 * s, 0, -8 * s, 2 * s, 6 * s, -4 * s, 1.6 * s], '#fff4e4');
      ctx.restore();
      if (fire > 0.5) drawGlow(ctx, 0, -22 * s, 12 * s, [200, 255, 140], fire);
      circle(ctx, 0, -6 * s, 1.5 * s, tc.main);
      break;
    }
    case 'ballista': {
      rrect(ctx, -10 * s, -6 * s, 20 * s, 8 * s, 2 * s, st.wallDark);
      ctx.save();
      ctx.translate(0, -10 * s);
      ctx.rotate(aim);
      ctx.translate(-fire * 4 * s, 0);
      rrect(ctx, -12 * s, -2.5 * s, 26 * s, 5 * s, 2 * s, '#8a5a2b');
      bow(ctx, 8 * s, 12 * s, s, '#c8913a');
      line(ctx, 8 * s, -12 * s, (2 - fire * 4) * s, 0, 0.8, '#efe6d2');
      line(ctx, 8 * s, 12 * s, (2 - fire * 4) * s, 0, 0.8, '#efe6d2');
      if (fire < 0.5) poly(ctx, [12 * s, -1.5 * s, 18 * s, 0, 12 * s, 1.5 * s], '#d8dde6', true, 0.8);
      circle(ctx, -10 * s, 0, 2 * s, tc.main);
      ctx.restore();
      break;
    }
    case 'brazier': {
      // Bronze tripod with a bowl of Greek fire
      line(ctx, -7 * s, 0, -3 * s, -12 * s, 2.2 * s, '#8c5f1e');
      line(ctx, 7 * s, 0, 3 * s, -12 * s, 2.2 * s, '#8c5f1e');
      line(ctx, 0, 0, 0, -12 * s, 2.2 * s, '#a8742a');
      ctx.beginPath();
      ctx.moveTo(-10 * s, -13 * s);
      ctx.quadraticCurveTo(0, -4 * s, 10 * s, -13 * s);
      ctx.closePath();
      ctx.fillStyle = '#c8913a';
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      line(ctx, -10 * s, -13 * s, 10 * s, -13 * s, 1.6 * s, '#e9c25a');
      const fl = 1 + Math.sin(t * 14) * 0.15 + fire * 0.6;
      drawGlow(ctx, 0, -18 * s, 14 * s * fl, [255, 150, 50], 0.8);
      poly(ctx, [-6 * s, -13 * s, -2 * s, -22 * s * fl, 0, -15 * s, 3 * s, -25 * s * fl, 6 * s, -13 * s], '#ffb347', false);
      poly(ctx, [-3 * s, -13 * s, 0, -19 * s * fl, 3 * s, -13 * s], '#fff1b0', false);
      circle(ctx, 0, -9 * s, 1.5 * s, tc.main);
      break;
    }
    case 'runestone': {
      // Carved standing stone with glowing runes and a hovering crystal
      blobStone(ctx, s, '#7d8ea3');
      const runeA = 0.6 + 0.4 * Math.max(fire, Math.sin(t * 3) * 0.5 + 0.5);
      ctx.strokeStyle = 'rgba(140, 235, 255, ' + runeA.toFixed(3) + ')';
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.moveTo(-2 * s, -6 * s);
      ctx.lineTo(-2 * s, -18 * s);
      ctx.lineTo(2 * s, -14 * s);
      ctx.moveTo(2 * s, -6 * s);
      ctx.lineTo(2 * s, -11 * s);
      ctx.stroke();
      drawGlow(ctx, 0, -12 * s, 10 * s, [120, 230, 255], 0.3 + fire * 0.6);
      const cy = -28 * s + Math.sin(t * 2.5) * 1.5 * s;
      drawGlow(ctx, 0, cy, 9 * s, [120, 230, 255], 0.6 + fire * 0.4);
      poly(ctx, [0, cy - 5 * s, 3 * s, cy, 0, cy + 5 * s, -3 * s, cy], '#cdf6ff', true, 0.8);
      circle(ctx, 0, -3 * s, 1.4 * s, tc.main);
      break;
    }
    case 'frostcatapult': {
      // Wooden frame with a throwing arm holding a chunk of glacier ice
      rrect(ctx, -11 * s, -5 * s, 22 * s, 5 * s, 1.5 * s, '#6b5a48');
      line(ctx, -6 * s, -5 * s, 0, -12 * s, 2 * s, '#5f4e40');
      line(ctx, 6 * s, -5 * s, 0, -12 * s, 2 * s, '#5f4e40');
      const armA = -2.3 + fire * 1.6;
      ctx.save();
      ctx.translate(0, -12 * s);
      ctx.rotate(armA);
      line(ctx, -4 * s, 0, 16 * s, 0, 2.2 * s, '#8a7462');
      if (fire < 0.3) poly(ctx, [14 * s, -4 * s, 19 * s, -3 * s, 20 * s, 2 * s, 15 * s, 3 * s, 12 * s, 0], '#cdeeff', true, 0.8);
      ctx.restore();
      circle(ctx, 0, -12 * s, 1.6 * s, tc.main);
      break;
    }
    case 'repeater': {
      // Jade-lacquered repeating crossbow with a bolt magazine
      rrect(ctx, -9 * s, -6 * s, 18 * s, 7 * s, 2 * s, '#7c2019');
      ctx.save();
      ctx.translate(0, -10 * s);
      ctx.rotate(aim);
      ctx.translate(-fire * 2 * s, 0);
      rrect(ctx, -11 * s, -2.5 * s, 24 * s, 5 * s, 2 * s, '#b8382f');
      rrect(ctx, -4 * s, -10 * s, 9 * s, 8 * s, 1.5 * s, '#2f7a62');
      line(ctx, -3 * s, -6 * s, 4 * s, -6 * s, 0.8, '#e2b84a');
      bow(ctx, 9 * s, 9 * s, s, '#3a2a1a');
      line(ctx, 9 * s, -9 * s, 3 * s, 0, 0.8, '#efe6d2');
      line(ctx, 9 * s, 9 * s, 3 * s, 0, 0.8, '#efe6d2');
      circle(ctx, -9 * s, 0, 1.8 * s, tc.main);
      ctx.restore();
      break;
    }
    case 'rocketrack': {
      // Angled rack of fire-lance rockets
      rrect(ctx, -9 * s, -5 * s, 18 * s, 5 * s, 1.5 * s, '#7c2019');
      ctx.save();
      ctx.translate(0, -8 * s);
      ctx.rotate(-0.55);
      rrect(ctx, -8 * s, -7 * s, 18 * s, 14 * s, 2 * s, '#b8382f');
      for (let k = 0; k < 3; k++) {
        const y = (-4 + k * 4) * s;
        ellipse(ctx, 10 * s, y, 1.6 * s, 1.6 * s, '#1a1222');
        if (!(fire > 0.2 && k === 1)) poly(ctx, [10 * s, y - 1.2 * s, 14 * s, y, 10 * s, y + 1.2 * s], '#e2b84a', true, 0.6);
      }
      line(ctx, -8 * s, -7 * s, 10 * s, -7 * s, 1 * s, '#e2b84a');
      ctx.restore();
      if (fire > 0) drawGlow(ctx, -8 * s, -4 * s, 10 * s, [255, 170, 80], fire * 0.8);
      circle(ctx, 0, -3 * s, 1.4 * s, tc.main);
      break;
    }
    case 'sunspire': {
      // Golden spire focusing sunlight through a crystal
      poly(ctx, [-6 * s, 0, -2 * s, -20 * s, 2 * s, -20 * s, 6 * s, 0], '#e9c25a');
      poly(ctx, [-6 * s, 0, -2 * s, -20 * s, 0, -20 * s, -1 * s, 0], '#ffe7a0', false);
      const cy = -26 * s;
      ctx.save();
      ctx.translate(0, cy);
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = 'rgba(255, 236, 170, 0.8)';
      ctx.lineWidth = 1.2 * s;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6 * s, Math.sin(a) * 6 * s);
        ctx.lineTo(Math.cos(a) * (9 + fire * 4) * s, Math.sin(a) * (9 + fire * 4) * s);
        ctx.stroke();
      }
      ctx.restore();
      drawGlow(ctx, 0, cy, (14 + fire * 10) * s, [255, 230, 150], 0.8);
      circle(ctx, 0, cy, 4 * s, '#fff6d0');
      circle(ctx, 0, -8 * s, 1.5 * s, tc.main);
      break;
    }
    case 'starforge': {
      // A floating ring that cradles a fallen star
      rrect(ctx, -8 * s, -5 * s, 16 * s, 5 * s, 2 * s, '#c9bfae');
      const cy = -18 * s + Math.sin(t * 2) * 1.5 * s;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.4 * s + 1;
      ctx.beginPath();
      ctx.ellipse(0, cy, 10 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#e9c25a';
      ctx.lineWidth = 3.4 * s;
      ctx.stroke();
      drawGlow(ctx, 0, cy, (12 + fire * 10) * s, [255, 235, 170], 0.9);
      ctx.save();
      ctx.translate(0, cy);
      ctx.rotate(t * 2);
      const pts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const r = (k % 2 ? 2.4 : 5.5) * s;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      poly(ctx, pts, '#fffbe6', false);
      ctx.restore();
      circle(ctx, 0, -2.5 * s, 1.4 * s, tc.main);
      break;
    }
  }
  ctx.restore();
}

function blobLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, col: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + len * 0.5, y - len * 0.5, x, y - len);
  ctx.quadraticCurveTo(x - len * 0.5, y - len * 0.5, x, y);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function blobCap(ctx: CanvasRenderingContext2D, r: number, col: string): void {
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.quadraticCurveTo(-r, -r * 0.95, 0, -r * 0.95);
  ctx.quadraticCurveTo(r, -r * 0.95, r, 0);
  ctx.quadraticCurveTo(0, r * 0.2, -r, 0);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function blobStone(ctx: CanvasRenderingContext2D, s: number, col: string): void {
  ctx.beginPath();
  ctx.moveTo(-6 * s, 0);
  ctx.lineTo(-7 * s, -14 * s);
  ctx.quadraticCurveTo(-5 * s, -21 * s, 0, -21 * s);
  ctx.quadraticCurveTo(5 * s, -21 * s, 6 * s, -15 * s);
  ctx.lineTo(6 * s, 0);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-5 * s, -18 * s, 3 * s, 16 * s);
}

function bow(ctx: CanvasRenderingContext2D, x: number, half: number, s: number, col: string): void {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3 * s + 1;
  ctx.beginPath();
  ctx.moveTo(x, -half);
  ctx.quadraticCurveTo(x + 5 * s, 0, x, half);
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3 * s;
  ctx.stroke();
}
