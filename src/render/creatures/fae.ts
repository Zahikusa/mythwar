import { circle, cluster, dots, drawGlow, ellipse, glowDot, limb, limb2, line, oval, poly, blob, swing } from '../draw.ts';
import type { CreatureArt, Pose } from './types.ts';

/** Leg foot offsets for a two-legged gait. k = 0 back leg, 1 front leg. */
export function gait(p: Pose, k: number, stride: number, lift: number): [number, number] {
  if (!p.moving) return [0, 0];
  const a = p.walk + k * Math.PI;
  return [Math.sin(a) * stride, -Math.max(0, Math.cos(a)) * lift];
}

// ---------------------------------------------------------------------------
// Treant Warden — guardian
// ---------------------------------------------------------------------------

const BARK = '#7c5836';
const BARK_D = '#56391f';
const BARK_L = '#a07a4c';
const LEAF = ['#356b33', '#4f9442', '#86c95a'];

export const treant: CreatureArt = {
  height: 58,
  fly: 0,
  scale: 1,
  muzzle: [14, -28],
  body: [0, -28],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const breathe = Math.sin(p.t * 1.6 + p.seed * 9);
    const bob = -m * Math.abs(Math.sin(p.walk)) * 1.8 + breathe * 0.3;
    const sw = swing(p.attack, p.hit);
    // Legs (stumps with root feet)
    const [b0, bl] = gait(p, 0, 5, 3);
    const [f0, fl] = gait(p, 1, 5, 3);
    limb(ctx, -4, -13 + bob, -5 + b0, -3 + bl, 8, BARK_D);
    ellipse(ctx, -4 + b0, -1.5 + bl, 6, 2.2, BARK_D);

    ctx.save();
    ctx.translate(0, bob - 12);
    ctx.rotate(sw * 0.06 + m * 0.03);
    ctx.translate(0, 12);
    // Back arm (branch)
    const arm = Math.sin(p.walk) * 3 * m;
    limb2(ctx, -8, -36, -14, -25, -11 - arm, -15, 6, 4.5, BARK_D);
    line(ctx, -11 - arm, -15, -14 - arm, -12, 2, BARK_D);
    // Trunk
    blob(ctx, [-12, -10, -14, -26, -11, -40, -3, -46, 7, -45, 13, -36, 14, -22, 12, -10, 0, -7], BARK);
    line(ctx, -6, -14, -7, -31, 1.6, BARK_D);
    line(ctx, 2, -11, 3, -24, 1.6, BARK_D);
    line(ctx, 9, -16, 10, -27, 1.4, BARK_D);
    line(ctx, -9, -24, -10, -36, 1.2, BARK_L);
    // Face hollow and glowing eyes
    ellipse(ctx, 6, -34, 6.5, 3.6, '#2a1a10');
    glowDot(ctx, 3.5, -34.3, 1.3, p.tc.main, p.tc.light);
    glowDot(ctx, 8.5, -34.3, 1.3, p.tc.main, p.tc.light);
    line(ctx, 0, -37.8, 11, -38.2, 1.6, BARK_D);
    ellipse(ctx, 7, -28, 2.6, 1.3, '#2a1a10');
    // Leafy crown (sways)
    const sway = Math.sin(p.t * 1.3 + p.seed * 4) * 0.9;
    cluster(ctx, [-8 + sway, -48, 8, 0 + sway, -53, 9, 9 + sway, -49, 8, -13, -42, 6, 14, -42, 5.5, 3 + sway, -45, 8], LEAF[1]);
    dots(ctx, [-11, -41, 4, 12, -41, 3.6, -2 + sway, -44, 5], LEAF[0]);
    dots(ctx, [-5 + sway, -52, 3.2, 3 + sway, -56, 3, 10 + sway, -52, 2.5], LEAF[2]);
    // Moss on shoulders
    dots(ctx, [-11, -38, 2.2, -8, -40, 1.8, 12, -36, 1.8], '#7fb04a');
    ctx.restore();

    // Front leg
    limb(ctx, 5, -13 + bob, 5 + f0, -3 + fl, 8, BARK);
    ellipse(ctx, 6 + f0, -1.5 + fl, 6, 2.2, BARK_D);

    // Front arm with bark shield (bashes forward on attack)
    const sx = 15 + Math.max(0, sw) * 7 - Math.max(0, -sw) * 3 + arm * 0.3;
    const sy = -25 + bob - Math.max(0, -sw) * 2;
    limb2(ctx, 8, -36 + bob, 12, -28 + bob, sx - 2, sy, 6, 5, BARK);
    oval(ctx, sx, sy, 6.5, 11, '#8b6a3e');
    ctx.strokeStyle = '#5d4426';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 4.2, 7.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, sx, sy, 2.2, p.tc.main);
    circle(ctx, sx - 0.6, sy - 0.6, 0.9, p.tc.light);
  },
};

// ---------------------------------------------------------------------------
// Redcap Raider — hunter
// ---------------------------------------------------------------------------

const GOB = '#88a85c';
const GOB_D = '#5f7a3e';
const CAP = '#cc2b3d';
const CAP_D = '#8e1626';

export const redcap: CreatureArt = {
  height: 40,
  fly: 0,
  scale: 1,
  muzzle: [12, -18],
  body: [2, -18],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const bob = -m * Math.abs(Math.sin(p.walk)) * 2.2 + Math.sin(p.t * 3 + p.seed * 7) * 0.3;
    const sw = swing(p.attack, p.hit);
    const [b0, bl] = gait(p, 0, 6, 4);
    const [f0, fl] = gait(p, 1, 6, 4);
    // Back leg
    limb2(ctx, -2, -12 + bob, 1 + b0 * 0.5, -6 + bob * 0.5, -1 + b0, -1 + bl, 3.2, 2.8, GOB_D);
    ellipse(ctx, 0.5 + b0, -1 + bl, 3, 1.4, '#3b2a1c');
    // Back arm
    const arm = -Math.sin(p.walk) * 4 * m;
    limb2(ctx, -1, -21 + bob, -4 + arm * 0.5, -16 + bob, -2 + arm, -12 + bob, 2.6, 2.4, GOB_D);

    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(0.12 * m + sw * 0.08);
    // Body + vest
    oval(ctx, 0, -17, 7, 7.5, GOB);
    blob(ctx, [-6, -22, 5, -23, 7, -15, 3, -10, -6, -11, -7, -16], '#5b4630');
    // Team-coloured scarf
    poly(ctx, [-5, -23, 6, -24, 5, -21, -4, -20], p.tc.main);
    poly(ctx, [-4, -22, -10, -18 + Math.sin(p.t * 9) * 1.2, -8, -16, -3, -20], p.tc.dark);
    // Head
    oval(ctx, 5, -29, 7, 6, GOB);
    poly(ctx, [0, -30, -10, -33, 0, -26], GOB); // ear
    poly(ctx, [10, -29, 16, -27, 10, -26], GOB); // nose
    glowDot(ctx, 8, -30.5, 1.1, p.tc.main, '#fff7c0');
    line(ctx, 6, -25, 11, -25.5, 1.2, '#2b1a14');
    dots(ctx, [7.5, -24.6, 0.6, 9.5, -24.8, 0.6], '#fff6e0');
    // Red cap with drooping tip
    const flop = Math.sin(p.t * 6 + p.seed * 5) * 1.5 * (0.4 + m);
    blob(ctx, [-2, -33, 11, -33, 7, -39, 0, -44, -7 + flop, -45, -4, -38], CAP);
    line(ctx, -2, -33.5, 11, -33.5, 2.2, CAP_D);
    circle(ctx, -7 + flop, -45, 2, '#f2e6d0');
    ctx.restore();

    // Front leg
    limb2(ctx, 3, -12 + bob, 6 + f0 * 0.5, -6 + bob * 0.5, 4 + f0, -1 + fl, 3.2, 2.8, GOB);
    ellipse(ctx, 5.5 + f0, -1 + fl, 3, 1.4, '#3b2a1c');
    // Front arm with jagged knife (stab)
    const hx = 9 + Math.max(0, sw) * 9 - Math.max(0, -sw) * 4 - arm * 0.5;
    const hy = -17 + bob - Math.max(0, -sw) * 4;
    limb2(ctx, 4, -21 + bob, 7, -16 + bob, hx, hy, 2.8, 2.6, GOB);
    const ang = -0.3 + Math.max(0, -sw) * -0.6 + Math.max(0, sw) * 0.25;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    poly(ctx, [0, -1.2, 11, -2.5, 14, 0, 11, 1, 0, 1.2], '#d4d8e2');
    line(ctx, 2, -0.5, 10, -1.2, 0.8, '#ffffff');
    poly(ctx, [-4, -1.4, 0, -1.4, 0, 1.4, -4, 1.4], '#4a3020');
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Pixie Sprite — mystic
// ---------------------------------------------------------------------------

export const pixie: CreatureArt = {
  height: 30,
  fly: 14,
  scale: 1,
  muzzle: [10, -20],
  body: [0, -16],
  draw(ctx, p) {
    const hover = Math.sin(p.t * 3.2 + p.seed * 8) * 2.2;
    const sw = swing(p.attack, p.hit);
    ctx.save();
    ctx.translate(0, hover);
    // Aura
    drawGlow(ctx, 0, -16, 20, p.tc.rgb, 0.35);
    // Wings (fast flutter)
    const flap = 0.35 + Math.abs(Math.sin(p.t * 26 + p.seed * 3)) * 0.65;
    ctx.save();
    ctx.translate(-2, -20);
    ctx.globalAlpha *= 0.75;
    ctx.scale(1, flap);
    ellipse(ctx, -8, -6, 10, 5, 'rgba(200, 240, 255, 0.55)', -0.6);
    ellipse(ctx, -7, 3, 7, 3.6, 'rgba(255, 210, 245, 0.5)', 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(-8, -6, 10, 5, -0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Dangling legs
    const kick = Math.sin(p.t * 5 + p.seed * 2) * 1.5;
    limb(ctx, -1, -10, -3 + kick, -3, 1.6, '#ffe0ec');
    limb(ctx, 1, -10, 1 - kick, -3.5, 1.6, '#ffe0ec');
    // Dress
    blob(ctx, [-3, -18, 3, -18, 6, -9, 0, -7, -6, -9], '#9a7cff');
    poly(ctx, [-5, -10, 5, -10, 6, -8.5, -6, -8.5], '#c9b8ff', false);
    // Back arm
    limb(ctx, -2, -16, -6, -12, 1.6, '#ffe0ec');
    // Head and hair
    cluster(ctx, [-2, -24, 5, -5, -22, 3, 3, -27, 3], '#ff79c6');
    oval(ctx, 1.5, -22, 4.2, 4.4, '#ffe0ec');
    dots(ctx, [-1, -25.5, 3.2, 2, -26.5, 2.4], '#ff79c6');
    circle(ctx, 3.6, -22, 0.9, p.tc.dark);
    circle(ctx, 3.9, -22.3, 0.35, '#ffffff');
    dots(ctx, [3.5, -20, 0.8], 'rgba(255,120,160,0.6)');
    // Wand arm
    const reach = Math.max(0, -sw) * 3;
    const hx = 6 + Math.max(0, sw) * 4;
    const hy = -17 - reach;
    limb(ctx, 2, -16, hx, hy, 1.6, '#ffe0ec');
    line(ctx, hx, hy, hx + 4, hy - 4, 1.1, '#f6e6a0');
    const charge = p.attack >= 0 && p.attack < p.hit ? p.attack / p.hit : 0;
    glowDot(ctx, hx + 4.5, hy - 4.5, 1.2 + charge * 2, p.tc.main, '#ffffff');
    if (charge > 0) drawGlow(ctx, hx + 4.5, hy - 4.5, 6 + charge * 8, p.tc.rgb, 0.4 + charge * 0.4);
    ctx.restore();
  },
};
