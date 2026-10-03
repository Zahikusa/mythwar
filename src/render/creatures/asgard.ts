import { OUTLINE, circle, cluster, drawGlow, ellipse, glowDot, limb, limb2, line, oval, poly, blob, swing } from '../draw.ts';
import { gait } from './fae.ts';
import { quadFoot } from './olympus.ts';
import type { CreatureArt } from './types.ts';

// ---------------------------------------------------------------------------
// Frost Jötunn — guardian
// ---------------------------------------------------------------------------

const ICE_SKIN = '#9cc4e0';
const ICE_SKIN_D = '#6f97b8';
const BEARD = '#eef4fa';
const PELT = '#8a7462';
const PELT_D = '#5f4e40';
const CRYSTAL = '#cdeeff';

export const jotunn: CreatureArt = {
  height: 74,
  fly: 0,
  scale: 1,
  muzzle: [18, -44],
  body: [0, -38],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const bob = -m * Math.abs(Math.sin(p.walk)) * 2.4 + Math.sin(p.t * 1.5 + p.seed * 6) * 0.5;
    const sw = swing(p.attack, p.hit);
    const [b0, bl] = gait(p, 0, 7, 4);
    const [f0, fl] = gait(p, 1, 7, 4);
    // Back leg
    limb2(ctx, -6, -24 + bob, -8 + b0 * 0.4, -12, -6 + b0, -2 + bl, 9, 8, ICE_SKIN_D);
    oval(ctx, -5 + b0, -2 + bl, 6, 2.6, PELT_D);
    // Back arm
    const arm = Math.sin(p.walk) * 3 * m;
    limb2(ctx, -12, -52 + bob, -18, -40 + bob, -15 - arm, -28 + bob, 8, 7, ICE_SKIN_D);
    circle(ctx, -15 - arm, -27 + bob, 4.4, ICE_SKIN_D);

    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(0.06 + Math.max(0, sw) * 0.08 - Math.max(0, -sw) * 0.06);
    // Pelt loincloth
    blob(ctx, [-13, -30, 12, -30, 14, -18, 6, -16, 0, -19, -6, -16, -14, -19], PELT);
    // Torso (hunched, massive)
    blob(ctx, [-14, -28, -18, -44, -12, -58, 2, -62, 14, -56, 17, -42, 13, -28, 0, -26], ICE_SKIN);
    // chest shading and rune scars
    ellipse(ctx, 4, -44, 8, 9, 'rgba(255,255,255,0.12)');
    ctx.strokeStyle = p.tc.main;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-2, -48);
    ctx.lineTo(2, -40);
    ctx.lineTo(6, -48);
    ctx.moveTo(2, -40);
    ctx.lineTo(2, -34);
    ctx.stroke();
    drawGlow(ctx, 2, -42, 8, p.tc.rgb, 0.35);
    // Pelt cape over shoulders
    blob(ctx, [-16, -50, -10, -60, 4, -63, 14, -58, 10, -54, -2, -56, -12, -52], PELT_D);
    // Ice crystals on the shoulder
    poly(ctx, [-12, -58, -14, -68, -9, -60], CRYSTAL);
    poly(ctx, [-8, -60, -7, -72, -4, -61], CRYSTAL);
    poly(ctx, [-4, -61, -1, -68, 0, -61], CRYSTAL);
    // Head
    const hx = 9;
    const hy = -64;
    oval(ctx, hx, hy, 7, 7, ICE_SKIN);
    // Beard and hair
    blob(ctx, [hx - 6, hy, hx - 2, hy + 6, hx + 3, hy + 13, hx + 7, hy + 9, hx + 9, hy + 3, hx + 4, hy + 2], BEARD);
    cluster(ctx, [hx - 5, hy - 5, 4, hx - 1, hy - 7, 4, hx - 8, hy, 3], BEARD);
    glowDot(ctx, hx + 4, hy - 1.5, 1.4, p.tc.main, '#fff');
    line(ctx, hx + 1, hy - 4, hx + 7, hy - 3.5, 1.6, '#567a96');
    // Frosty breath
    const br = (p.t * 0.8 + p.seed) % 1;
    ctx.globalAlpha = (1 - br) * 0.5;
    circle(ctx, hx + 10 + br * 10, hy + 2 - br * 3, 1.5 + br * 3, '#ffffff');
    ctx.globalAlpha = 1;
    ctx.restore();

    // Front leg
    limb2(ctx, 6, -24 + bob, 4 + f0 * 0.4, -12, 7 + f0, -2 + fl, 9, 8, ICE_SKIN);
    oval(ctx, 8 + f0, -2 + fl, 6, 2.6, PELT_D);

    // Front arm with a glacier club: lifted behind on wind-up, smashed down on impact
    const raise = Math.max(0, -sw);
    const strike = Math.max(0, sw);
    const ang = -0.2 - raise * 2.1 + strike * 1.4;
    const sx = 12;
    const sy = -52 + bob;
    const ex = sx + Math.cos(ang) * 14;
    const ey = sy + Math.sin(ang) * 14;
    limb(ctx, sx, sy, ex, ey, 8.5, ICE_SKIN);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang + Math.PI / 2 + 0.2);
    limb(ctx, 0, 4, 0, -12, 3.4, '#6e5a48');
    blob(ctx, [-6, -12, -8, -24, -3, -33, 4, -32, 8, -22, 6, -12], CRYSTAL);
    poly(ctx, [-3, -14, -1, -30, 2, -16], '#ffffff', false);
    poly(ctx, [-8, -22, -12, -26, -7, -18], CRYSTAL);
    poly(ctx, [7, -24, 11, -27, 8, -19], CRYSTAL);
    ctx.restore();
    circle(ctx, ex, ey, 4.6, ICE_SKIN);
    if (strike > 0.6) drawGlow(ctx, ex + 14, ey + 8, 18, [200, 240, 255], (strike - 0.6) * 1.5);
  },
};

// ---------------------------------------------------------------------------
// Fenrir Wolf — hunter
// ---------------------------------------------------------------------------

const WOLF = '#727d8f';
const WOLF_D = '#4b5263';
const WOLF_L = '#aeb6c4';

export const fenrir: CreatureArt = {
  height: 46,
  fly: 0,
  scale: 1,
  muzzle: [22, -28],
  body: [0, -24],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const sw = swing(p.attack, p.hit);
    const lunge = Math.max(0, sw) * 7 - Math.max(0, -sw) * 3;
    const stretch = m * Math.sin(p.walk) * 2;
    const bob = -m * Math.abs(Math.cos(p.walk)) * 2.6;
    // Far legs
    const [h1, h1l] = quadFoot(p, 0.3, 8, 6);
    const [f1, f1l] = quadFoot(p, Math.PI * 0.6, 8, 6);
    limb2(ctx, -13, -22 + bob, -17 + h1 * 0.4, -12, -14 + h1, -1 + h1l, 5.5, 3.8, WOLF_D);
    limb2(ctx, 9 + lunge * 0.4, -22 + bob, 11 + f1 * 0.4, -11, 11 + f1 + lunge * 0.4, -1 + f1l, 5, 3.6, WOLF_D);
    // Tail
    const tw = Math.sin(p.t * 6 + p.seed * 4) * 0.25 + m * Math.sin(p.walk) * 0.2;
    ctx.save();
    ctx.translate(-19 - stretch * 0.5, -27 + bob);
    ctx.rotate(-0.4 + tw);
    blob(ctx, [0, -3, -10, -6, -18, -3, -14, 2, -6, 3, 0, 3], WOLF);
    ctx.restore();
    // Body
    ctx.save();
    ctx.translate(lunge * 0.4, bob);
    blob(ctx, [-21 - stretch * 0.5, -24, -16, -32, -2, -34, 10, -33, 14, -26, 9, -18, -4, -17, -18, -18], WOLF);
    // Dark back ridge fur
    blob(ctx, [-18, -30, -8, -36, 4, -36, 10, -33, 0, -32, -10, -31], WOLF_D, false);
    ellipse(ctx, -4, -20, 9, 3, WOLF_L);
    // Broken chain collar
    ctx.strokeStyle = '#9aa4ae';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(8 + i * 0.6, -22 + i * 3.2 + Math.sin(p.t * 5 + i) * 0.6, 1.6, 2.2, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Head
    const bite = p.attack >= 0 ? Math.max(0, Math.sin(Math.min(1, p.attack / p.hit) * Math.PI * 0.5)) * (p.attack < p.hit ? 1 : Math.max(0, 1 - (p.attack - p.hit) * 3)) : 0;
    ctx.save();
    ctx.translate(13 + lunge, -30 + bob);
    ctx.rotate(-0.1 + Math.max(0, sw) * 0.25);
    // ears
    poly(ctx, [-4, -6, -2, -14, 2, -6], WOLF_D);
    poly(ctx, [0, -6, 4, -13, 6, -5], WOLF);
    // skull
    blob(ctx, [-6, -2, -4, -8, 4, -8, 10, -5, 15, -3, 17, 0, 12, 2, 2, 4, -4, 4], WOLF);
    // lower jaw (opens to bite)
    ctx.save();
    ctx.translate(4, 2);
    ctx.rotate(bite * 0.5);
    poly(ctx, [-2, 0, 12, 0, 10, 4, 0, 4], WOLF_D);
    poly(ctx, [4, 0, 5, -2, 6, 0, 8, 0, 9, -2, 10, 0], '#ffffff', false);
    ctx.restore();
    poly(ctx, [6, 1.6, 7, 4, 8, 1.6, 11, 1.6, 12, 3.6, 13, 1.6], '#ffffff', false);
    circle(ctx, 16.5, -1.2, 1.4, '#1b1229');
    glowDot(ctx, 6, -4, 1.3, p.tc.main, '#fff');
    ctx.restore();
    // Near legs
    const [h2, h2l] = quadFoot(p, Math.PI + 0.3, 8, 6);
    const [f2, f2l] = quadFoot(p, Math.PI * 1.6, 8, 6);
    limb2(ctx, -11, -21 + bob, -15 + h2 * 0.4, -11, -12 + h2, -1 + h2l, 6, 4, WOLF);
    limb2(ctx, 11 + lunge * 0.4, -21 + bob, 13 + f2 * 0.4, -10, 13 + f2 + lunge * 0.5, -1 + f2l, 5.5, 3.8, WOLF);
    ellipse(ctx, -11 + h2, -1 + h2l, 3, 1.5, WOLF_D);
    ellipse(ctx, 14 + f2 + lunge * 0.5, -1 + f2l, 3, 1.5, WOLF_D);
  },
};

// ---------------------------------------------------------------------------
// Valkyrie — mystic (flying)
// ---------------------------------------------------------------------------

const SILVER = '#c9d4e2';
const SILVER_D = '#8c9aae';
const VSKIN = '#f2d2b6';
const HAIR = '#f2d27a';

export const valkyrie: CreatureArt = {
  height: 52,
  fly: 26,
  scale: 1,
  muzzle: [14, -40],
  body: [0, -28],
  draw(ctx, p) {
    const hover = Math.sin(p.t * 2.4 + p.seed * 7) * 2.5;
    const flap = Math.sin(p.t * 6 + p.seed * 5);
    const sw = swing(p.attack, p.hit);
    ctx.save();
    ctx.translate(0, hover);
    // Far wing
    wing(ctx, -4, -36, -0.5 - flap * 0.35, 0.85, '#dfe6f0');
    // Cape (team colour)
    const cw = Math.sin(p.t * 4) * 2;
    blob(ctx, [-4, -38, 2, -38, 0, -22, -8, -10 + cw, -12, -14 + cw, -8, -26], p.tc.main);
    // Legs (dangling)
    limb2(ctx, -1, -20, -2, -12, -5, -5, 3.4, 3, SILVER_D);
    limb2(ctx, 2, -20, 4, -12, 2, -4, 3.4, 3, SILVER);
    // Skirt (mail)
    blob(ctx, [-5, -24, 5, -24, 7, -16, -7, -16], SILVER_D);
    // Torso armour
    blob(ctx, [-5, -24, -6, -34, -2, -39, 5, -38, 7, -31, 5, -24], SILVER);
    line(ctx, -5, -30, 6, -30, 1, SILVER_D);
    // Back arm (shield)
    oval(ctx, -6, -30, 5, 6, '#c8913a');
    circle(ctx, -6, -30, 2, p.tc.light);
    // Head: winged helmet + braid
    const hx = 2;
    const hy = -44;
    blob(ctx, [hx - 5, hy, hx - 7, hy + 8, hx - 9, hy + 14, hx - 6, hy + 14, hx - 3, hy + 4], HAIR);
    oval(ctx, hx, hy, 4.4, 4.8, VSKIN);
    blob(ctx, [hx - 5, hy - 1, hx - 4, hy - 6, hx + 1, hy - 7.5, hx + 5, hy - 4, hx + 4.5, hy - 1.5], SILVER);
    poly(ctx, [hx - 3, hy - 5, hx - 9, hy - 11, hx - 6, hy - 4], '#ffffff');
    poly(ctx, [hx - 1, hy - 6.5, hx - 4, hy - 13, hx + 1, hy - 7], '#ffffff');
    glowDot(ctx, hx + 2.2, hy - 0.3, 0.9, p.tc.main, '#fff');
    // Near wing
    wing(ctx, -2, -35, -0.3 - flap * 0.45, 1, '#ffffff');
    // Spear arm: draws back, then hurls (the spear vanishes until the next cast)
    const back = Math.max(0, -sw);
    const thrown = p.attack >= p.hit && p.attack < 1;
    const ax = 4 - back * 8 + Math.max(0, sw) * 6;
    const ay = -38 - back * 4;
    limb2(ctx, 4, -36, 6 - back * 4, -34, ax + 4, ay, 2.8, 2.4, VSKIN);
    if (!thrown) {
      ctx.save();
      ctx.translate(ax + 4, ay);
      ctx.rotate(-0.15 - back * 0.25);
      drawGlow(ctx, 12, 0, 10, [255, 245, 200], 0.4 + back * 0.4);
      line(ctx, -12, 0, 16, 0, 1.8, '#fff4c8');
      poly(ctx, [16, -2, 22, 0, 16, 2], '#ffffff');
      ctx.restore();
    }
    ctx.restore();
  },
};

function wing(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, col: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  // One sweeping wing with a scalloped trailing edge of primaries.
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.quadraticCurveTo(-6, -14, -30, -16);
  const pts = [
    [-26, -9],
    [-27, -4],
    [-21, -2],
    [-21, 3],
    [-14, 2],
    [-12, 6],
    [-5, 4],
  ];
  let px = -30;
  let py = -16;
  for (const [nx, ny] of pts) {
    ctx.quadraticCurveTo((px + nx) / 2 - 3, (py + ny) / 2 + 3, nx, ny);
    px = nx;
    py = ny;
  }
  ctx.quadraticCurveTo(-1, 6, 2, 2);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // Feather lines and covert shading
  ctx.strokeStyle = 'rgba(120, 150, 190, 0.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.lineTo(-24, -10);
  ctx.moveTo(-6, -1);
  ctx.lineTo(-19, 0);
  ctx.moveTo(-4, 1);
  ctx.lineTo(-11, 3);
  ctx.stroke();
  blob(ctx, [0, -1, -6, -9, -16, -12, -12, -6, -4, -3], 'rgba(200, 220, 240, 0.6)', false);
  ctx.restore();
}
