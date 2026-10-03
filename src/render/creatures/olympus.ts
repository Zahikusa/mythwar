import { OUTLINE, circle, cluster, dots, drawGlow, ellipse, glowDot, limb, limb2, line, oval, poly, blob, swing } from '../draw.ts';
import { gait } from './fae.ts';
import type { CreatureArt, Pose } from './types.ts';

/** Four-legged gait: returns foot offset for a leg with the given phase offset. */
export function quadFoot(p: Pose, phase: number, stride: number, lift: number): [number, number] {
  if (!p.moving) return [0, 0];
  const a = p.walk + phase;
  return [Math.sin(a) * stride, -Math.max(0, Math.cos(a)) * lift];
}

/** A hoofed / pawed leg with a backward-bending lower joint (horse style). */
export function hindLeg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, len: number, w: number, col: string, hoof: string): void {
  const kx = hx + (fx - hx) * 0.3 - len * 0.22;
  const ky = hy + (fy - hy) * 0.5;
  limb2(ctx, hx, hy, kx, ky, fx, fy - 2, w, w * 0.65, col);
  ellipse(ctx, fx + 0.8, fy - 1, w * 0.55, w * 0.4, hoof);
}

export function foreLeg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, len: number, w: number, col: string, hoof: string): void {
  const kx = hx + (fx - hx) * 0.6 + len * 0.12;
  const ky = hy + (fy - hy) * 0.5;
  limb2(ctx, hx, hy, kx, ky, fx, fy - 2, w, w * 0.65, col);
  ellipse(ctx, fx + 0.8, fy - 1, w * 0.55, w * 0.4, hoof);
}

// ---------------------------------------------------------------------------
// Minotaur — guardian
// ---------------------------------------------------------------------------

const FUR = '#7a4b33';
const FUR_D = '#55311f';
const FUR_L = '#9c6646';
const BRONZE = '#c8913a';
const BRONZE_D = '#8c5f1e';
const HORN = '#efe2c4';

export const minotaur: CreatureArt = {
  height: 64,
  fly: 0,
  scale: 1,
  muzzle: [16, -36],
  body: [0, -32],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const bob = -m * Math.abs(Math.sin(p.walk)) * 2 + Math.sin(p.t * 2 + p.seed * 7) * 0.4;
    const sw = swing(p.attack, p.hit);
    const [b0, bl] = gait(p, 0, 6, 4);
    const [f0, fl] = gait(p, 1, 6, 4);
    // Back leg (digitigrade, hooved)
    limb2(ctx, -4, -20 + bob, -7 + b0 * 0.5, -10, -4 + b0, -2 + bl, 7, 5, FUR_D);
    ellipse(ctx, -3 + b0, -1.5 + bl, 4, 2, '#2b1d14');
    // Back arm (fist)
    const arm = Math.sin(p.walk) * 3 * m;
    limb2(ctx, -9, -42 + bob, -13, -32 + bob, -10 - arm, -24 + bob, 6.5, 5.5, FUR_D);
    circle(ctx, -10 - arm, -23 + bob, 3.6, FUR_D);

    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(-Math.max(0, -sw) * 0.08 + Math.max(0, sw) * 0.1);
    // Pteruges skirt
    for (let i = -3; i <= 3; i++) rrectStrip(ctx, i * 3.2 - 1.4, -24, 2.8, 9, i % 2 ? '#8a2f2f' : '#a63c3c');
    // Torso
    blob(ctx, [-12, -24, -14, -38, -8, -48, 6, -49, 13, -40, 11, -24, 0, -21], FUR);
    // Bronze breastplate
    blob(ctx, [-9, -27, -10, -40, -2, -45, 8, -43, 9, -30, 1, -26], BRONZE);
    line(ctx, -1, -44, 0, -28, 1, BRONZE_D);
    ctx.strokeStyle = BRONZE_D;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(-4, -37, 3.2, 0, Math.PI);
    ctx.arc(5, -37, 3.2, 0, Math.PI);
    ctx.stroke();
    // Team sash
    poly(ctx, [-10, -41, -8, -44, 10, -29, 8, -26], p.tc.main);
    // Head (bull)
    const hx = 7;
    const hy = -53;
    blob(ctx, [hx - 7, hy + 4, hx - 6, hy - 5, hx + 2, hy - 7, hx + 8, hy - 3, hx + 13, hy + 1, hx + 12, hy + 6, hx + 3, hy + 7], FUR_L);
    oval(ctx, hx + 10, hy + 3, 4.5, 3.6, '#c99a82');
    dots(ctx, [hx + 11.5, hy + 2, 0.8, hx + 9.5, hy + 4.5, 0.7], '#3a2018');
    // Nose ring
    ctx.strokeStyle = '#f2c45a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(hx + 11, hy + 6.5, 1.8, 0, Math.PI * 2);
    ctx.stroke();
    // Horns
    poly(ctx, [hx - 4, hy - 5, hx - 12, hy - 9, hx - 14, hy - 17, hx - 9, hy - 10, hx - 2, hy - 7], HORN);
    poly(ctx, [hx + 2, hy - 7, hx + 9, hy - 13, hx + 10, hy - 20, hx + 12, hy - 12, hx + 5, hy - 5], HORN);
    // Ear
    poly(ctx, [hx - 5, hy - 2, hx - 11, hy, hx - 5, hy + 1], FUR);
    glowDot(ctx, hx + 4, hy - 1.5, 1.2, p.tc.main, '#fff');
    line(ctx, hx + 1, hy - 4, hx + 7, hy - 3, 1.4, FUR_D);
    ctx.restore();

    // Front leg
    limb2(ctx, 4, -20 + bob, 1 + f0 * 0.5, -10, 5 + f0, -2 + fl, 7, 5, FUR);
    ellipse(ctx, 6 + f0, -1.5 + fl, 4, 2, '#2b1d14');
    // Front arm with labrys: raised overhead on wind-up, crashes down on impact
    const raise = Math.max(0, -sw);
    const strike = Math.max(0, sw);
    const ang = -0.4 - raise * 1.9 + strike * 1.5;
    const sx = 10;
    const sy = -42 + bob;
    const hxp = sx + Math.cos(ang) * 11;
    const hyp = sy + Math.sin(ang) * 11;
    limb(ctx, sx, sy, hxp, hyp, 6.5, FUR);
    ctx.save();
    ctx.translate(hxp, hyp);
    ctx.rotate(ang + Math.PI / 2);
    // shaft
    limb(ctx, 0, 6, 0, -22, 2.2, '#5a3a22');
    // double blade
    blob(ctx, [0, -16, 9, -24, 11, -16, 9, -8, 0, -15, -9, -8, -11, -16, -9, -24], '#cfd6e0');
    line(ctx, -8, -22, -9, -10, 1, '#ffffff');
    circle(ctx, 0, -16, 1.6, BRONZE);
    ctx.restore();
    circle(ctx, hxp, hyp, 3.4, FUR);
  },
};

function rrectStrip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 1);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Centaur Lancer — hunter
// ---------------------------------------------------------------------------

const HORSE = '#8c5a34';
const HORSE_D = '#643d20';
const SKIN = '#e2b088';

export const centaur: CreatureArt = {
  height: 60,
  fly: 0,
  scale: 1,
  muzzle: [20, -36],
  body: [-2, -30],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const gallop = m * Math.sin(p.walk * 1) * 1.6;
    const bob = -m * Math.abs(Math.sin(p.walk)) * 2.4;
    const sw = swing(p.attack, p.hit);
    const lunge = Math.max(0, sw) * 6 - Math.max(0, -sw) * 3;
    // Far legs (darker)
    const [h1, h1l] = quadFoot(p, 0, 7, 5);
    const [f1, f1l] = quadFoot(p, Math.PI * 0.5, 7, 5);
    hindLeg(ctx, -14, -24 + bob, -16 + h1, h1l, 18, 4.6, HORSE_D, '#2a1a10');
    foreLeg(ctx, 8, -24 + bob, 10 + f1, f1l, 18, 4.4, HORSE_D, '#2a1a10');
    // Tail
    const tw = Math.sin(p.t * 5 + p.seed * 3) * 2 + gallop;
    ctx.save();
    ctx.translate(-20, -28 + bob);
    ctx.rotate(0.5 + tw * 0.06);
    blob(ctx, [0, 0, -4, 4, -7, 14, -3, 18, 0, 10, 2, 3], '#3d2414');
    ctx.restore();
    // Horse body
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(-gallop * 0.02);
    blob(ctx, [-22, -26, -16, -34, 4, -34, 14, -30, 15, -22, 4, -17, -14, -17, -21, -20], HORSE);
    ellipse(ctx, -6, -21, 10, 3, 'rgba(255,255,255,0.12)');
    // Saddle cloth in team colour
    poly(ctx, [-6, -34, 6, -34, 7, -24, -5, -23], p.tc.main);
    poly(ctx, [-6, -34, 6, -34, 6, -32, -6, -32], p.tc.dark, false);
    ctx.restore();
    // Near legs
    const [h2, h2l] = quadFoot(p, Math.PI, 7, 5);
    const [f2, f2l] = quadFoot(p, Math.PI * 1.5, 7, 5);
    hindLeg(ctx, -12, -22 + bob, -13 + h2, h2l, 18, 5, HORSE, '#2a1a10');
    foreLeg(ctx, 10, -22 + bob, 12 + f2, f2l, 18, 4.8, HORSE, '#2a1a10');

    // Human torso
    ctx.save();
    ctx.translate(lunge * 0.3, bob);
    ctx.rotate(0.08 * m + lunge * 0.01);
    // back arm holding the shield (round hoplon)
    oval(ctx, 2, -40, 7.5, 7.5, '#a8742a');
    circle(ctx, 2, -40, 4.5, p.tc.main);
    circle(ctx, 2, -40, 1.6, '#f2c45a');
    blob(ctx, [3, -28, 3, -42, 8, -47, 15, -45, 16, -36, 13, -28], SKIN);
    // Cuirass
    blob(ctx, [4, -30, 4, -42, 9, -46, 15, -44, 15, -36, 13, -30], '#c8913a');
    line(ctx, 9.5, -45, 9.5, -31, 0.9, '#8c5f1e');
    // Head + Corinthian helmet with crest
    oval(ctx, 12, -52, 4.6, 5, SKIN);
    blob(ctx, [7, -52, 7.5, -58, 13, -60, 17, -56, 17, -50, 14, -51, 13, -54, 9, -54, 9.5, -49], '#c8913a');
    glowDot(ctx, 14.5, -52.5, 0.9, p.tc.main, '#fff');
    const crestWave = Math.sin(p.t * 8) * 0.8 * m;
    blob(ctx, [7, -59, 9, -64, 15, -65 + crestWave, 19, -62, 14, -61, 9, -60], '#c03030');
    // Spear arm + lance (thrusts on attack, lowered when charged)
    const lx = 15 + lunge;
    const ly = -38;
    limb2(ctx, 13, -43, 16, -38, lx, ly, 3.4, 3, SKIN);
    const tilt = p.charged ? 0.02 : -0.12;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(tilt);
    line(ctx, -16, 0, 30, 0, 2.2, '#6b4a2b');
    poly(ctx, [30, -2.4, 38, 0, 30, 2.4], '#dfe4ec');
    // pennant
    const pw = Math.sin(p.t * 10) * 1.2;
    poly(ctx, [24, 0, 18, 4 + pw, 22, 1.5], p.tc.main, false);
    ctx.restore();
    ctx.restore();
    if (p.charged && p.moving) {
      dots(ctx, [-24, -3, 2.4, -29, -2, 1.8, -33, -4, 1.4], 'rgba(220, 200, 170, 0.6)');
    }
  },
};

// ---------------------------------------------------------------------------
// Gorgon — mystic
// ---------------------------------------------------------------------------

const SCALE = '#4f9a62';
const SCALE_D = '#336b42';
const BELLY = '#d8e2a0';
const GSKIN = '#9fc48a';

export const gorgon: CreatureArt = {
  height: 54,
  fly: 0,
  scale: 1,
  muzzle: [9, -45],
  body: [0, -28],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const und = p.t * 3 + p.walk * 0.6;
    const sw = swing(p.attack, p.hit);
    const gazing = p.attack >= 0 ? Math.max(0, 1 - Math.abs(p.attack - p.hit) * 4) : 0;
    // Serpent tail (thick stroked curve with scales)
    const pts: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const x = 2 - k * 28;
      const y = -6 - Math.sin(k * Math.PI) * 4 + Math.sin(und - k * 5) * (1.6 + k * 2.2) * (0.5 + m * 0.5);
      pts.push([x, y]);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, col] of [
      [11, OUTLINE],
      [9, SCALE],
    ] as [number, string][]) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineWidth = Math.max(2.4, w * (1 - (i / pts.length) * 0.75));
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
      }
    }
    for (let i = 1; i < 9; i += 2) dots(ctx, [pts[i][0], pts[i][1] - 1.5, 1.4 * (1 - i / 12)], SCALE_D);
    // Coil base under the torso
    oval(ctx, 1, -6, 9, 5.5, SCALE);
    ellipse(ctx, 2, -4.5, 6, 2.6, BELLY);
    // Torso
    ctx.save();
    ctx.translate(0, Math.sin(und) * 0.8);
    blob(ctx, [-5, -8, -6, -20, -4, -32, 3, -34, 7, -28, 6, -18, 4, -8], SCALE);
    ellipse(ctx, 3, -16, 2.5, 7, BELLY);
    blob(ctx, [-5, -32, -4, -38, 2, -41, 7, -38, 7, -31, 1, -29], GSKIN);
    // Purple chiton with team trim
    blob(ctx, [-5, -27, -5, -35, 1, -38, 7, -34, 7, -27, 1, -24], '#6b3f8f');
    line(ctx, -5, -27.5, 7, -27.5, 1.4, p.tc.main);
    // Back arm reaching out
    const reach = Math.max(0, -sw) * 3 + gazing * 2;
    limb2(ctx, -3, -36, -8, -31, -10 - reach * 0.5, -26, 2.6, 2.2, GSKIN);
    // Head
    const hx = 3;
    const hy = -45;
    // Snake hair (writhing)
    for (let i = 0; i < 6; i++) {
      const a = -2.6 + i * 0.42;
      const len = 7 + (i % 2) * 2;
      const wig = Math.sin(p.t * 6 + i * 1.7 + p.seed * 9) * 0.35;
      const x1 = hx + Math.cos(a) * 3.5;
      const y1 = hy + Math.sin(a) * 3.5;
      const x2 = hx + Math.cos(a + wig) * (3.5 + len);
      const y2 = hy + Math.sin(a + wig) * (3.5 + len);
      const cx = (x1 + x2) / 2 + Math.cos(a + 1.5) * 2.5 * Math.sin(p.t * 5 + i);
      const cy = (y1 + y2) / 2 + Math.sin(a + 1.5) * 2.5 * Math.sin(p.t * 5 + i);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
      ctx.strokeStyle = i % 2 ? '#3f7a48' : '#5aa060';
      ctx.lineWidth = 2;
      ctx.stroke();
      circle(ctx, x2, y2, 1.7, i % 2 ? '#3f7a48' : '#5aa060');
      circle(ctx, x2 + 0.5, y2 - 0.3, 0.45, '#ffe066');
    }
    oval(ctx, hx, hy, 5, 5.5, GSKIN);
    // Glowing eyes (blaze when gazing)
    const eyeR = 1.1 + gazing * 1.2;
    glowDot(ctx, hx + 2.6, hy - 0.8, eyeR, gazing > 0.05 ? '#9dff9a' : p.tc.main, '#ffffff');
    if (gazing > 0.05) drawGlow(ctx, hx + 3, hy - 1, 10 + gazing * 10, [140, 255, 150], gazing * 0.7);
    line(ctx, hx + 1.5, hy + 2.6, hx + 4.2, hy + 2.4, 0.9, '#3b5a30');
    // Front arm (pointing)
    limb2(ctx, 5, -36, 9, -33, 12 + reach, -36 - reach * 0.4, 2.6, 2.2, GSKIN);
    ctx.restore();
    void cluster;
  },
};
