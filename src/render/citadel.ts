import type { Team, TurretSlot } from '../sim/types.ts';
import { TURRETS } from '../sim/data.ts';
import { OUTLINE, TAU, circle, cluster, dots, drawGlow, ellipse, line, poly, rrect, setLineWidth } from './draw.ts';
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
): void {
  const st = CITADEL_STYLES[age];
  const far = layout.lanes[0];
  const near = layout.lanes[layout.lanes.length - 1];
  const s = far.s * 1.15;
  const fx = layout.field.x;
  const baseY = far.y + far.band * 0.4;
  const keepX = fx + (far.x0 - fx) * 0.44;
  const w = Math.max(34 * s, (far.x0 - fx) * 0.5);
  const h = (baseY - layout.horizon) * 1.2 + 26 * s;
  const tc = TEAM_COLORS[team];
  withSide(ctx, layout, team, () => {
    setLineWidth(1.2);
    // Curtain wall linking gates, running down toward the near lane
    const wallTopFar = baseY - 26 * s;
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

    // Keep tower
    const kx = keepX - w / 2;
    const ky = baseY - h;
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
    windowLight(ctx, keepX, ky + h * 0.42, w * 0.2, h * 0.16, team, t, 0);
    windowLight(ctx, keepX - w * 0.25, ky + h * 0.68, w * 0.12, h * 0.1, team, t, 1.3);
    windowLight(ctx, keepX + w * 0.25, ky + h * 0.68, w * 0.12, h * 0.1, team, t, 2.1);
    if (st.roofKind !== 'pagoda' && st.roofKind !== 'canopy') crenellations(ctx, st, kx + w * 0.04, kx + w * 0.96, ky + 1, s);
    roof(ctx, st, keepX, ky, w * 1.05, s, true);

    // Banner pole
    const poleX = keepX;
    const poleTop = ky - (st.roofKind === 'spire' ? w * 1.45 : st.roofKind === 'steep' ? w * 0.95 : st.roofKind === 'pagoda' ? w * 0.95 : w * 0.7) - 18 * s;
    line(ctx, poleX, poleTop + 22 * s, poleX, poleTop, Math.max(1.2, 1.8 * s), '#3a2c22');
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
  });
}

/** A gate tower where a lane meets the citadel. Drawn in lane order (far → near). */
export function drawCitadelGate(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  team: Team,
  lane: number,
  age: number,
  gateX: number,
  laneY: number,
  s: number,
  hitFlash: number,
  t: number,
): void {
  const st = CITADEL_STYLES[age];
  const g = layout.lanes[lane];
  void gateX;
  withSide(ctx, layout, team, () => {
    // Lanes are symmetric, so in mirrored space the right gate maps onto the left one.
    const x = g.x0;
    const w = 40 * s;
    const h = 58 * s;
    const bx = x - w * 0.95;
    const by = laneY + g.band * 0.5;
    setLineWidth(1.2);
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
    const ax = bx + w * 0.62;
    const aw = w * 0.5;
    const ah = h * 0.55;
    ctx.beginPath();
    ctx.moveTo(ax - aw / 2, by);
    ctx.lineTo(ax - aw / 2, by - ah + aw / 2);
    ctx.arc(ax, by - ah + aw / 2, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw / 2, by);
    ctx.closePath();
    ctx.fillStyle = '#1a1222';
    ctx.fill();
    // Portal glow inside the arch
    const tc = TEAM_COLORS[team];
    ctx.save();
    ctx.clip();
    const pg = ctx.createLinearGradient(0, by - ah, 0, by);
    pg.addColorStop(0, `rgba(${tc.rgb.join(',')},0.15)`);
    pg.addColorStop(1, `rgba(${tc.rgb.join(',')},${0.5 + 0.15 * Math.sin(t * 3 + lane)})`);
    ctx.fillStyle = pg;
    ctx.fillRect(ax - aw / 2, by - ah, aw, ah);
    ctx.restore();
    ctx.strokeStyle = st.trim;
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    ctx.beginPath();
    ctx.moveTo(ax - aw / 2, by);
    ctx.lineTo(ax - aw / 2, by - ah + aw / 2);
    ctx.arc(ax, by - ah + aw / 2, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw / 2, by);
    ctx.stroke();
    // Top: crenellations (turret platform)
    crenellations(ctx, st, bx - 1, bx + w + 1, by - h + 1, s);
    // Ward crystal (built-in defence)
    const wy = by - h - 10 * s + Math.sin(t * 2 + lane) * 1.5 * s;
    drawGlow(ctx, bx + w * 0.2, wy, 9 * s, tc.rgb, 0.5);
    circle(ctx, bx + w * 0.2, wy, 2.4 * s, tc.light);
    // Small team pennant
    const px = bx + w * 0.08;
    line(ctx, px, by - h - 2, px, by - h - 20 * s, Math.max(1, 1.4 * s), '#3a2c22');
    poly(ctx, [px, by - h - 20 * s, px + 10 * s, by - h - 17 * s + Math.sin(t * 5 + lane) * s, px, by - h - 13 * s], tc.main, true, 1);
    if (hitFlash > 0) {
      ctx.globalAlpha = hitFlash * 0.3;
      ctx.fillStyle = '#ff6040';
      ctx.fillRect(bx, by - h, w, h);
      ctx.globalAlpha = 1;
    }
  });
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
  const recoil = since >= 0 && since < 0.25 ? (1 - since / 0.25) * 4 * s : 0;
  ctx.save();
  ctx.translate(cx, top);
  ctx.scale(dir, 1);
  setLineWidth(1.1);
  // Mount
  rrect(ctx, -10 * s, -6 * s, 20 * s, 8 * s, 2 * s, st.wallDark);
  const aim = Math.atan2(-(laneY - 20 * s - top) * 0.15, Math.abs(aimScreenX - cx) + 1) * -1;
  if (def.kind === 'bolt') {
    ctx.save();
    ctx.translate(0, -10 * s);
    ctx.rotate(Math.max(-0.5, Math.min(0.3, aim)));
    ctx.translate(-recoil, 0);
    // stock
    rrect(ctx, -10 * s, -3 * s, 22 * s, 6 * s, 2 * s, st.trim);
    // bow limbs
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.2 * s + 1;
    ctx.beginPath();
    ctx.moveTo(8 * s, -11 * s);
    ctx.quadraticCurveTo(13 * s, 0, 8 * s, 11 * s);
    ctx.stroke();
    ctx.strokeStyle = shade(st.wallDark, -0.1);
    ctx.lineWidth = 3.2 * s;
    ctx.stroke();
    line(ctx, 8 * s, -11 * s, 2 * s - recoil, 0, 0.8, '#e8e0d0');
    line(ctx, 8 * s, 11 * s, 2 * s - recoil, 0, 0.8, '#e8e0d0');
    // bolt / gem tip
    circle(ctx, 13 * s, 0, 2.6 * s, tc.main);
    if (def.age >= 2) drawGlow(ctx, 13 * s, 0, 8 * s, def.age === 4 ? [255, 230, 150] : tc.rgb, 0.5);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(0, -8 * s);
    ctx.rotate(-0.6 + Math.min(0.2, recoil * 0.05));
    rrect(ctx, -5 * s, -6 * s, 18 * s - recoil, 12 * s, 4 * s, st.trim);
    ellipse(ctx, 13 * s - recoil, 0, 3 * s, 6 * s, '#1a1222');
    const glowCol: [number, number, number] =
      def.age === 0 ? [180, 255, 120] : def.age === 1 ? [255, 150, 60] : def.age === 2 ? [170, 230, 255] : def.age === 3 ? [255, 120, 60] : [255, 230, 160];
    drawGlow(ctx, 13 * s - recoil, 0, 7 * s, glowCol, 0.6);
    ctx.restore();
    // supports
    line(ctx, -6 * s, -2 * s, -2 * s, -9 * s, 2 * s, st.wallDark);
    line(ctx, 6 * s, -2 * s, 2 * s, -9 * s, 2 * s, st.wallDark);
  }
  ctx.restore();
  void dots;
}
