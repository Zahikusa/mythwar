import { OUTLINE, circle, cluster, dots, drawGlow, ellipse, glowDot, limb, limb2, line, oval, poly, blob, swing } from '../draw.ts';
import { gait } from './fae.ts';
import { quadFoot } from './olympus.ts';
import type { CreatureArt } from './types.ts';

// ---------------------------------------------------------------------------
// Oni Brute — guardian
// ---------------------------------------------------------------------------

const ONI = '#e0903a';
const ONI_D = '#ad6526';
const ONI_HAIR = '#f4efe6';
const TIGER = '#f2c14a';

export const oni: CreatureArt = {
  height: 70,
  fly: 0,
  scale: 1,
  muzzle: [16, -40],
  body: [0, -36],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const bob = -m * Math.abs(Math.sin(p.walk)) * 2.2 + Math.sin(p.t * 2 + p.seed * 4) * 0.5;
    const sw = swing(p.attack, p.hit);
    const [b0, bl] = gait(p, 0, 7, 4);
    const [f0, fl] = gait(p, 1, 7, 4);
    // Back leg
    limb2(ctx, -6, -22 + bob, -9 + b0 * 0.4, -11, -6 + b0, -2 + bl, 8.5, 7, ONI_D);
    ellipse(ctx, -5 + b0, -2 + bl, 5, 2.2, '#4a2a14');
    // Back arm
    const arm = Math.sin(p.walk) * 3 * m;
    limb2(ctx, -11, -48 + bob, -16, -36 + bob, -12 - arm, -26 + bob, 7.5, 6.5, ONI_D);
    circle(ctx, -12 - arm, -25 + bob, 4, ONI_D);
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(Math.max(0, sw) * 0.08 - Math.max(0, -sw) * 0.05);
    // Tiger-skin loincloth
    blob(ctx, [-12, -28, 12, -28, 13, -16, 4, -14, -2, -17, -8, -14, -13, -17], TIGER);
    ctx.strokeStyle = '#2a2a35';
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5 - 1, -27);
      ctx.quadraticCurveTo(i * 5 + 1.5, -22, i * 5, -18);
      ctx.stroke();
    }
    // Torso and belly
    blob(ctx, [-13, -26, -16, -42, -10, -56, 4, -58, 14, -50, 16, -36, 12, -26, 0, -24], ONI);
    ellipse(ctx, 4, -36, 8, 8, '#eda65a');
    // Gold armband & prayer beads
    for (let i = 0; i < 7; i++) circle(ctx, -8 + i * 2.6, -52 + Math.sin(i * 0.5) * 2, 1.4, i === 3 ? p.tc.main : '#3a2a1a');
    // Head
    const hx = 8;
    const hy = -62;
    cluster(ctx, [hx - 6, hy - 3, 5, hx - 2, hy - 6, 5, hx - 9, hy + 2, 4, hx - 7, hy + 7, 3], ONI_HAIR);
    oval(ctx, hx, hy, 7, 7.5, ONI);
    // Horns
    poly(ctx, [hx - 3, hy - 6, hx - 5, hy - 15, hx, hy - 7], '#f2e8c8');
    poly(ctx, [hx + 2, hy - 7, hx + 5, hy - 16, hx + 5, hy - 6], '#f2e8c8');
    // Fierce face
    const eyeCol = p.enraged ? '#ff5030' : p.tc.main;
    glowDot(ctx, hx + 4, hy - 1.5, p.enraged ? 1.8 : 1.3, eyeCol, '#fff');
    line(ctx, hx, hy - 4.5, hx + 7, hy - 3, 1.8, '#5a2a10');
    blob(ctx, [hx + 1, hy + 3, hx + 7, hy + 2.5, hx + 6.5, hy + 5.5, hx + 1.5, hy + 5.5], '#5a1a10');
    poly(ctx, [hx + 2, hy + 3, hx + 2.8, hy + 1, hx + 3.6, hy + 3], '#ffffff', false);
    poly(ctx, [hx + 5, hy + 3, hx + 5.8, hy + 1, hx + 6.6, hy + 3], '#ffffff', false);
    ctx.restore();
    // Front leg
    limb2(ctx, 6, -22 + bob, 4 + f0 * 0.4, -11, 7 + f0, -2 + fl, 8.5, 7, ONI);
    ellipse(ctx, 8 + f0, -2 + fl, 5, 2.2, '#4a2a14');
    // Kanabo arm
    const raise = Math.max(0, -sw);
    const strike = Math.max(0, sw);
    const ang = -0.5 - raise * 1.9 + strike * 1.6;
    const sx = 11;
    const sy = -48 + bob;
    const ex = sx + Math.cos(ang) * 12;
    const ey = sy + Math.sin(ang) * 12;
    limb(ctx, sx, sy, ex, ey, 7.5, ONI);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang + Math.PI / 2 + 0.15);
    limb(ctx, 0, 5, 0, -8, 3, '#4a3a2a');
    blob(ctx, [-3, -8, -5, -30, 0, -34, 5, -30, 3, -8], '#3e3e4e');
    for (let i = 0; i < 4; i++) {
      dots(ctx, [-4.2, -12 - i * 5, 1.1, 4.2, -14 - i * 5, 1.1, 0, -16 - i * 5, 1], '#c9ccd6');
    }
    ctx.restore();
    circle(ctx, ex, ey, 4.2, ONI);
    circle(ctx, ex, ey + 3, 2.2, '#f2c45a');
  },
};

// ---------------------------------------------------------------------------
// Byakko Tiger — hunter
// ---------------------------------------------------------------------------

const WHITE = '#f3f0ea';
const STRIPE = '#2a2a38';
const WHITE_D = '#cfcac4';

export const byakko: CreatureArt = {
  height: 44,
  fly: 0,
  scale: 1,
  muzzle: [22, -26],
  body: [0, -22],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const sw = swing(p.attack, p.hit);
    const lunge = Math.max(0, sw) * 5 - Math.max(0, -sw) * 2;
    const bob = -m * Math.abs(Math.cos(p.walk)) * 2.2;
    const spine = m * Math.sin(p.walk) * 1.5;
    // Spirit wisps
    for (let i = 0; i < 3; i++) {
      const k = (p.t * 0.7 + i / 3 + p.seed) % 1;
      drawGlow(ctx, -18 - k * 14, -30 + Math.sin(k * 6 + i) * 4 - k * 6, 5 * (1 - k), [150, 200, 255], (1 - k) * 0.6);
    }
    // Far legs
    const [h1, h1l] = quadFoot(p, 0, 8, 6);
    const [f1, f1l] = quadFoot(p, Math.PI * 0.5, 8, 6);
    limb2(ctx, -14, -20 + bob, -18 + h1 * 0.4, -10, -14 + h1, -1 + h1l, 6, 4, WHITE_D);
    limb2(ctx, 10, -20 + bob, 12 + f1 * 0.3, -10, 12 + f1, -1 + f1l, 5.5, 4, WHITE_D);
    // Tail (striped, swaying)
    ctx.save();
    ctx.translate(-20, -25 + bob);
    ctx.rotate(-0.6 + Math.sin(p.t * 3 + p.seed * 5) * 0.25);
    limb(ctx, 0, 0, -6, -10, 3.4, WHITE);
    limb(ctx, -6, -10, -4, -18, 3, WHITE);
    line(ctx, -2.5, -4, -4.5, -5.5, 1.4, STRIPE);
    line(ctx, -5.5, -10, -7, -12, 1.4, STRIPE);
    line(ctx, -4.5, -15, -6, -17, 1.4, STRIPE);
    ctx.restore();
    // Body
    ctx.save();
    ctx.translate(lunge * 0.3, bob);
    blob(ctx, [-22, -22, -18, -30, -4, -32 + spine, 10, -31, 15, -24, 10, -16, -6, -15, -19, -16], WHITE);
    ctx.strokeStyle = STRIPE;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = -17 + i * 5;
      ctx.beginPath();
      ctx.moveTo(x, -30.5 + (i === 5 ? 1 : 0) + spine * 0.5);
      ctx.quadraticCurveTo(x + 2, -26, x - 0.5, -22);
      ctx.stroke();
    }
    ctx.restore();
    // Head
    ctx.save();
    ctx.translate(14 + lunge, -29 + bob);
    ctx.rotate(Math.max(0, sw) * 0.15);
    cluster(ctx, [-2, 0, 6, 4, -2, 6], WHITE);
    poly(ctx, [-4, -5, -3, -11, 1, -6], WHITE);
    poly(ctx, [2, -6, 5, -11, 6, -5], WHITE);
    ellipse(ctx, 4, -8, 1, 1.6, '#f2a0b0');
    blob(ctx, [6, -1, 12, -1, 13, 3, 8, 5, 5, 3], WHITE);
    circle(ctx, 12.2, 0, 1.3, '#d07080');
    line(ctx, 0, -5, 3, -4, 1.2, STRIPE);
    line(ctx, -3, -2, -1, -1, 1.2, STRIPE);
    line(ctx, 1, 4, 4, 3, 1, STRIPE);
    glowDot(ctx, 6, -3, 1.3, p.tc.main, '#e8f6ff');
    ctx.restore();
    // Near legs; the front paw rises and swipes during an attack
    const [h2, h2l] = quadFoot(p, Math.PI, 8, 6);
    const [f2, f2l] = quadFoot(p, Math.PI * 1.5, 8, 6);
    limb2(ctx, -12, -19 + bob, -16 + h2 * 0.4, -9, -12 + h2, -1 + h2l, 6.5, 4.5, WHITE);
    const pawUp = Math.max(0, -sw) * 10;
    const pawFwd = Math.max(0, sw) * 8;
    const fx = 14 + f2 + pawFwd + lunge * 0.4;
    const fy = -1 + f2l - pawUp + Math.max(0, sw) * -4;
    limb2(ctx, 11 + lunge * 0.3, -19 + bob, 15 + lunge * 0.3, -10 - pawUp * 0.5, fx, fy, 6, 4.5, WHITE);
    ellipse(ctx, fx + 1, fy, 3.2, 2, WHITE_D);
    if (sw > 0.3) {
      ctx.strokeStyle = 'rgba(200,230,255,0.8)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(fx - 2, fy + 2, 6 + i * 2, -1.2, 0.3);
        ctx.stroke();
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Kitsune — mystic
// ---------------------------------------------------------------------------

const FOX = '#f09a48';
const FOX_D = '#c46c24';
const FOX_W = '#fff4e4';

export const kitsune: CreatureArt = {
  height: 54,
  fly: 6,
  scale: 1,
  muzzle: [12, -38],
  body: [0, -26],
  draw(ctx, p) {
    const hover = Math.sin(p.t * 2 + p.seed * 6) * 1.8;
    const sw = swing(p.attack, p.hit);
    ctx.save();
    ctx.translate(0, hover);
    // Nine... well, five visible fluffy tails fanned behind
    for (let i = 0; i < 5; i++) {
      const a = -2.35 + i * 0.32 + Math.sin(p.t * 2.2 + i * 0.9 + p.seed * 3) * 0.12;
      ctx.save();
      ctx.translate(-4, -16);
      ctx.rotate(a);
      blob(ctx, [0, -3, 12, -6, 22, -4, 27, 0, 22, 4, 12, 5, 0, 3], FOX);
      blob(ctx, [20, -3.5, 27, 0, 20, 3.5, 23, 0], FOX_W, false);
      ctx.restore();
    }
    // Foxfire orbs circling
    for (let i = 0; i < 3; i++) {
      const a = p.t * 1.6 + (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * 15;
      const y = -26 + Math.sin(a) * 5;
      drawGlow(ctx, x, y, 7, [140, 200, 255], 0.55);
      circle(ctx, x, y, 1.6, '#e8f4ff');
    }
    // Legs (digitigrade fox legs under the kimono)
    limb2(ctx, -2, -14, -4, -8, -2, -2, 3.2, 2.6, FOX_D);
    limb2(ctx, 2, -14, 4, -8, 3, -2, 3.2, 2.6, FOX);
    // Kimono: white robe with red hakama and team-coloured obi
    blob(ctx, [-6, -14, 6, -14, 8, -4, -8, -4], '#c0303a');
    blob(ctx, [-5, -15, -6, -28, -2, -33, 4, -33, 7, -27, 6, -15], FOX_W);
    poly(ctx, [-6, -19, 7, -19, 7, -16, -6, -16], p.tc.main);
    // Sleeve / back arm
    blob(ctx, [-4, -30, -10, -26, -11, -20, -6, -21, -3, -26], FOX_W);
    // Head
    const hx = 3;
    const hy = -39;
    poly(ctx, [hx - 5, hy - 3, hx - 6, hy - 13, hx - 1, hy - 6], FOX);
    poly(ctx, [hx - 4.5, hy - 5, hx - 5.2, hy - 10.5, hx - 2.5, hy - 6], '#ffd0b8', false);
    poly(ctx, [hx + 1, hy - 6, hx + 3, hy - 14, hx + 5, hy - 4], FOX);
    blob(ctx, [hx - 5, hy + 1, hx - 4, hy - 5, hx + 2, hy - 6, hx + 6, hy - 3, hx + 12, hy + 1, hx + 6, hy + 4, hx - 1, hy + 4], FOX);
    blob(ctx, [hx + 2, hy + 1, hx + 6, hy - 1, hx + 12, hy + 1, hx + 6, hy + 4], FOX_W, false);
    circle(ctx, hx + 11.6, hy + 0.6, 1, '#2a1a14');
    glowDot(ctx, hx + 3.5, hy - 2.2, 1, p.tc.main, '#ffffff');
    dots(ctx, [hx - 1, hy - 4, 0.9], '#c0303a');
    // Casting arm: paw raised, conjuring foxfire
    const charge = p.attack >= 0 && p.attack < p.hit ? p.attack / p.hit : 0;
    const ax = 9 + Math.max(0, sw) * 4;
    const ay = -30 - charge * 6;
    blob(ctx, [4, -31, ax, ay - 2, ax + 2, ay + 3, 5, -25], FOX_W);
    circle(ctx, ax + 2, ay, 1.8, FOX);
    if (charge > 0) {
      drawGlow(ctx, ax + 4, ay - 3, 8 + charge * 10, [140, 200, 255], 0.5 + charge * 0.5);
      circle(ctx, ax + 4, ay - 3, 1.5 + charge * 2, '#eaf6ff');
    }
    ctx.restore();
    void OUTLINE;
  },
};
