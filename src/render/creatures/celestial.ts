import { OUTLINE, circle, cluster, dots, drawGlow, ellipse, glowDot, limb, limb2, line, oval, poly, blob, swing } from '../draw.ts';
import { gait } from './fae.ts';
import type { CreatureArt } from './types.ts';

// ---------------------------------------------------------------------------
// Titan — guardian
// ---------------------------------------------------------------------------

const MARBLE = '#ece5d8';
const MARBLE_D = '#b8ab98';
const GOLD = '#e9c25a';
const GOLD_D = '#a8822a';

export const titan: CreatureArt = {
  height: 86,
  fly: 0,
  scale: 1,
  muzzle: [20, -50],
  body: [0, -44],
  draw(ctx, p) {
    const m = p.moving ? 1 : 0;
    const bob = -m * Math.abs(Math.sin(p.walk)) * 2.6 + Math.sin(p.t * 1.2 + p.seed * 5) * 0.6;
    const sw = swing(p.attack, p.hit);
    const raise = Math.max(0, -sw);
    const strike = Math.max(0, sw);
    const [b0, bl] = gait(p, 0, 8, 4);
    const [f0, fl] = gait(p, 1, 8, 4);
    // Halo
    ctx.strokeStyle = 'rgba(255, 230, 160, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(6, -86 + bob, 11, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawGlow(ctx, 6, -84 + bob, 18, [255, 225, 150], 0.35);
    // Back leg
    limb2(ctx, -7, -30 + bob, -10 + b0 * 0.4, -15, -7 + b0, -3 + bl, 11, 10, MARBLE_D);
    oval(ctx, -6 + b0, -3 + bl, 7.5, 3.2, GOLD_D);
    // Back arm (also slams)
    const bang = -0.9 - raise * 1.6 + strike * 1.5;
    const bsx = -12;
    const bsy = -64 + bob;
    const bex = bsx + Math.cos(bang) * 16 + 4;
    const bey = bsy + Math.sin(bang) * 16 + 10;
    limb2(ctx, bsx, bsy, bsx - 6, bsy + 12 - raise * 18, bex - 4, bey, 10, 9, MARBLE_D);
    oval(ctx, bex - 4, bey + 1, 6, 6, MARBLE_D);

    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(strike * 0.1 - raise * 0.06);
    // Golden kilt
    blob(ctx, [-15, -36, 15, -36, 17, -22, 6, -20, -6, -20, -17, -22], GOLD);
    line(ctx, -15, -33, 15, -33, 1.4, GOLD_D);
    // Torso
    blob(ctx, [-16, -34, -20, -56, -14, -72, 4, -76, 18, -68, 20, -50, 15, -34, 0, -31], MARBLE);
    // Chest plate and glowing cosmic core
    blob(ctx, [-11, -48, -12, -64, 2, -70, 14, -64, 13, -48, 1, -44], GOLD);
    drawGlow(ctx, 1, -57, 14, p.tc.rgb, 0.8);
    circle(ctx, 1, -57, 4.5, p.tc.light);
    circle(ctx, 1, -57, 2, '#ffffff');
    // Glowing veins
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-14, -40);
    ctx.lineTo(-10, -46);
    ctx.lineTo(-13, -52);
    ctx.moveTo(15, -38);
    ctx.lineTo(12, -44);
    ctx.stroke();
    // Head with radiant helm
    const hx = 8;
    const hy = -80;
    oval(ctx, hx, hy, 7.5, 8, MARBLE);
    blob(ctx, [hx - 8, hy - 1, hx - 7, hy - 8, hx, hy - 11, hx + 7, hy - 8, hx + 8, hy - 3, hx + 3, hy - 4, hx - 3, hy - 3], GOLD);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.35;
      poly(ctx, [hx + Math.cos(a - 0.08) * 9, hy - 3 + Math.sin(a - 0.08) * 9, hx + Math.cos(a) * 16, hy - 3 + Math.sin(a) * 16, hx + Math.cos(a + 0.08) * 9, hy - 3 + Math.sin(a + 0.08) * 9], GOLD, true, 0.8);
    }
    glowDot(ctx, hx + 4, hy, 1.5, '#ffe9a0', '#ffffff');
    line(ctx, hx + 1, hy + 4.5, hx + 6, hy + 4.2, 1.2, MARBLE_D);
    // Beard of stone
    blob(ctx, [hx - 2, hy + 5, hx + 6, hy + 5, hx + 4, hy + 12, hx, hy + 11], MARBLE_D);
    ctx.restore();
    // Front leg
    limb2(ctx, 7, -30 + bob, 5 + f0 * 0.4, -15, 8 + f0, -3 + fl, 11, 10, MARBLE);
    oval(ctx, 9 + f0, -3 + fl, 7.5, 3.2, GOLD);
    // Front arm with gauntlet: overhead on wind-up, slams down on impact
    const ang = -0.6 - raise * 1.9 + strike * 1.7;
    const sx = 14;
    const sy = -64 + bob;
    const ex = sx + Math.cos(ang) * 18;
    const ey = sy + Math.sin(ang) * 18 + 12;
    limb2(ctx, sx, sy, sx + 6, sy + 12 - raise * 20, ex, ey, 10, 9, MARBLE);
    oval(ctx, ex, ey + 1, 7, 7, GOLD);
    line(ctx, ex - 4, ey - 2, ex + 4, ey - 2, 1, GOLD_D);
    if (strike > 0.7) {
      drawGlow(ctx, ex + 4, -4, 26, [255, 225, 160], (strike - 0.7) * 2);
      ellipse(ctx, ex + 4, -2, 18 * strike, 4 * strike, 'rgba(255, 240, 210, 0.35)');
    }
  },
};

// ---------------------------------------------------------------------------
// Griffin — hunter (flying)
// ---------------------------------------------------------------------------

const EAGLE = '#f6f1e6';
const LION = '#d0a05a';
const LION_D = '#9c7036';
const FEATHER = '#b8873a';
const FEATHER_D = '#7f5a22';

export const griffin: CreatureArt = {
  height: 50,
  fly: 20,
  scale: 1,
  muzzle: [24, -28],
  body: [0, -22],
  draw(ctx, p) {
    const flap = Math.sin(p.t * 7 + p.seed * 5);
    const hover = Math.sin(p.t * 3.5 + p.seed * 4) * 2 - flap * 1.2;
    const sw = swing(p.attack, p.hit);
    const dive = Math.max(0, sw);
    const pull = Math.max(0, -sw);
    ctx.save();
    ctx.translate(dive * 6 - pull * 3, hover + dive * 6 - pull * 4);
    ctx.rotate(dive * 0.3 - pull * 0.15);
    // Far wing
    griffinWing(ctx, 0, -28, -0.2 - flap * 0.6, FEATHER_D);
    // Lion tail with tuft
    const tw = Math.sin(p.t * 4) * 0.3;
    ctx.save();
    ctx.translate(-18, -22);
    ctx.rotate(0.4 + tw);
    limb(ctx, 0, 0, -10, 6, 2.4, LION);
    ctx.restore();
    cluster(ctx, [-27 + tw * 6, -14 + tw * 4, 3], LION_D);
    // Hind legs (lion)
    limb2(ctx, -14, -18, -18, -10, -14, -5, 5.5, 4, LION_D);
    limb2(ctx, -10, -17, -12, -9, -8, -4, 5.5, 4, LION);
    // Body: lion hindquarters blending into feathered chest
    blob(ctx, [-20, -20, -16, -28, -2, -30, 10, -30, 16, -24, 12, -16, -2, -14, -16, -15], LION);
    blob(ctx, [2, -30, 12, -32, 18, -24, 14, -16, 4, -18], EAGLE);
    // Talons (front legs) — reach forward in the dive
    const tx = 10 + dive * 10;
    const ty = -10 + dive * 2 - pull * 4;
    limb2(ctx, 8, -18, 12 + dive * 4, -12, tx, ty, 4, 3, '#e8c060');
    for (let i = -1; i <= 1; i++) line(ctx, tx, ty, tx + 3 + dive * 2, ty + 2 + i * 1.5, 1.2, '#2a1a10');
    // Head (eagle)
    ctx.save();
    ctx.translate(18, -32);
    ctx.rotate(dive * 0.2);
    cluster(ctx, [0, 0, 6, -4, 3, 4], EAGLE);
    poly(ctx, [-6, -2, -11, 1, -6, 3], EAGLE);
    blob(ctx, [4, -2, 11, 0, 9, 3, 4, 3], '#f2c14a');
    poly(ctx, [9, 0, 12, 2.5, 9, 2.8], '#3a2410');
    glowDot(ctx, 2, -1.8, 1.2, p.tc.main, '#fff');
    line(ctx, -1, -4, 4, -3.4, 1.2, '#7a6a52');
    ctx.restore();
    // Near wing
    griffinWing(ctx, 2, -28, -0.1 - flap * 0.7, FEATHER);
    // Team-coloured band on the chest
    line(ctx, 6, -27, 12, -20, 1.8, p.tc.main);
    ctx.restore();
  },
};

function griffinWing(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, col: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  blob(ctx, [0, 0, -8, -10, -20, -16, -34, -14, -28, -8, -32, -4, -22, -2, -24, 2, -12, 2], col);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.lineTo(-28, -12);
  ctx.moveTo(-8, -1);
  ctx.lineTo(-26, -4);
  ctx.stroke();
  blob(ctx, [0, 0, -6, -8, -14, -10, -12, -4], EAGLE, false);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Phoenix — mystic (flying)
// ---------------------------------------------------------------------------

export const phoenix: CreatureArt = {
  height: 46,
  fly: 30,
  scale: 1,
  muzzle: [16, -30],
  body: [0, -24],
  draw(ctx, p) {
    const flap = Math.sin(p.t * 5 + p.seed * 6);
    const hover = Math.sin(p.t * 2.6 + p.seed * 3) * 2.4 - flap;
    const sw = swing(p.attack, p.hit);
    const flare = Math.max(0, -sw);
    ctx.save();
    ctx.translate(0, hover);
    drawGlow(ctx, 0, -24, 30, [255, 140, 40], 0.45 + flare * 0.3);
    // Tail streamers
    for (let i = 0; i < 4; i++) {
      const wav = Math.sin(p.t * 4 + i * 0.8) * 3;
      ctx.strokeStyle = ['#ff5a1f', '#ff8a2a', '#ffc04a', '#ffe28a'][i];
      ctx.lineWidth = 3 - i * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, -22);
      ctx.bezierCurveTo(-18, -20 + wav, -26, -12 - wav + i * 2, -36 - i * 2, -8 + i * 3 + wav);
      ctx.stroke();
      circle(ctx, -36 - i * 2, -8 + i * 3 + wav, 1.6, '#ffe28a');
    }
    // Far wing
    flameWing(ctx, -2, -28, -0.9 - flap * 0.5 - flare * 0.4, 0.85, p.t);
    // Body
    blob(ctx, [-10, -22, -4, -30, 8, -30, 12, -24, 6, -18, -4, -17], '#ff6a24');
    blob(ctx, [0, -26, 8, -29, 11, -24, 6, -20], '#ffb347', false);
    // Head with crest
    const hx = 12;
    const hy = -32;
    for (let i = 0; i < 3; i++) {
      const a = -2.2 + i * 0.35 + Math.sin(p.t * 6 + i) * 0.1;
      poly(ctx, [hx - 1, hy - 2, hx + Math.cos(a) * 10, hy + Math.sin(a) * 10, hx + 1, hy - 3], ['#ffd04a', '#ff9a2a', '#ff6a24'][i], true, 0.8);
    }
    oval(ctx, hx, hy, 4.5, 4, '#ff8a2a');
    poly(ctx, [hx + 3, hy - 1, hx + 9, hy + 1, hx + 3, hy + 2], '#ffe8a0');
    glowDot(ctx, hx + 1.5, hy - 1, 1, p.tc.main, '#fff');
    if (flare > 0) {
      drawGlow(ctx, hx + 10, hy + 1, 10 + flare * 12, [255, 200, 80], 0.5 + flare * 0.5);
      circle(ctx, hx + 10, hy + 1, 1.5 + flare * 2.5, '#fff6d0');
    }
    // Near wing
    flameWing(ctx, 0, -27, -0.6 - flap * 0.6 - flare * 0.5, 1, p.t + 1);
    ctx.restore();
  },
};

function flameWing(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  const cols = ['#ff4a1a', '#ff7a2a', '#ffb347', '#ffe08a'];
  for (let i = 0; i < 4; i++) {
    const len = 26 - i * 5;
    const flick = Math.sin(t * 9 + i * 1.3) * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-len * 0.4, -10 - i * 2, -len + flick, -14 + i * 3);
    ctx.quadraticCurveTo(-len * 0.6, -4 + i, -len * 0.75, 2 + i * 1.5);
    ctx.quadraticCurveTo(-len * 0.3, 2, 0, 3);
    ctx.closePath();
    ctx.fillStyle = cols[i];
    ctx.fill();
    if (i === 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Elder Dragon — legend (flying)
// ---------------------------------------------------------------------------

const DRAGON = '#3e2c5e';
const DRAGON_L = '#5a4384';
const DRAGON_BELLY = '#d9b24a';
const MEMBRANE = '#6a3f8a';

export const dragon: CreatureArt = {
  height: 72,
  fly: 34,
  scale: 1,
  muzzle: [44, -40],
  body: [0, -30],
  draw(ctx, p) {
    const flap = Math.sin(p.t * 3 + p.seed * 4);
    const hover = Math.sin(p.t * 1.6 + p.seed * 5) * 3 - flap * 2;
    const sw = swing(p.attack, p.hit);
    const rear = Math.max(0, -sw);
    const breath = p.attack >= p.hit && p.attack < 1 ? 1 - (p.attack - p.hit) / (1 - p.hit) : 0;
    ctx.save();
    ctx.translate(0, hover);
    // Far wing
    dragonWing(ctx, -6, -40, -0.3 - flap * 0.5, 0.85, DRAGON);
    // Tail
    const tw = Math.sin(p.t * 2.2 + p.seed * 2);
    ctx.lineCap = 'round';
    const tail: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      tail.push([-18 - k * 40, -26 + k * 10 + Math.sin(p.t * 2.5 - k * 4) * 4 * k + tw * k * 3]);
    }
    for (const [w, col] of [
      [10, OUTLINE],
      [8, DRAGON],
    ] as [number, string][]) {
      ctx.strokeStyle = col;
      for (let i = 1; i < tail.length; i++) {
        ctx.lineWidth = Math.max(1.5, w * (1 - i / tail.length));
        ctx.beginPath();
        ctx.moveTo(tail[i - 1][0], tail[i - 1][1]);
        ctx.lineTo(tail[i][0], tail[i][1]);
        ctx.stroke();
      }
    }
    const tip = tail[tail.length - 1];
    poly(ctx, [tip[0], tip[1], tip[0] - 7, tip[1] - 4, tip[0] - 4, tip[1] + 4], DRAGON_BELLY);
    // Hind legs tucked
    limb2(ctx, -12, -22, -16, -14, -10, -10, 7, 5, DRAGON);
    // Body
    blob(ctx, [-22, -26, -14, -38, 4, -40, 18, -36, 24, -28, 14, -18, -4, -16, -18, -18], DRAGON);
    blob(ctx, [-14, -20, 0, -19, 16, -22, 20, -28, 10, -24, -6, -22], DRAGON_BELLY, false);
    // Spines along the back
    for (let i = 0; i < 5; i++) poly(ctx, [-14 + i * 7, -37 - (i === 2 ? 1 : 0), -11 + i * 7, -43, -9 + i * 7, -37], DRAGON_BELLY, true, 0.8);
    // Fore leg with claws
    limb2(ctx, 14, -22, 18, -14, 22, -12, 6, 4.5, DRAGON_L);
    for (let i = -1; i <= 1; i++) line(ctx, 22, -12, 25, -11 + i * 1.6, 1.2, '#f2e8c8');
    // Neck and head (rears back, then lunges with fire)
    const nx = 22 + rear * -6 + breath * 4;
    const ny = -44 - rear * 6;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(16, -32);
    ctx.quadraticCurveTo(22, -40, nx + 6, ny);
    ctx.stroke();
    ctx.strokeStyle = DRAGON;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.save();
    ctx.translate(nx + 6, ny);
    ctx.rotate(-rear * 0.4 + breath * 0.2);
    // Horns
    poly(ctx, [-2, -4, -12, -12, -4, -2], '#f2e8c8');
    poly(ctx, [2, -5, -6, -14, 3, -3], '#e6d8b0');
    // Skull and jaw
    blob(ctx, [-4, -4, 4, -7, 14, -4, 20, -1, 14, 2, 2, 3, -4, 2], DRAGON_L);
    ctx.save();
    ctx.translate(4, 2);
    ctx.rotate(0.15 + breath * 0.4 + rear * 0.1);
    poly(ctx, [-4, -1, 14, -1, 11, 3, -2, 3], DRAGON);
    ctx.restore();
    glowDot(ctx, 6, -3.5, 1.5, breath > 0 ? '#ffb347' : p.tc.main, '#fff');
    circle(ctx, 18, -1.5, 0.9, '#1b1229');
    if (breath > 0 || rear > 0.3) {
      drawGlow(ctx, 22, 2, 14 + breath * 16, [255, 140, 40], 0.4 + breath * 0.6);
    }
    ctx.restore();
    // Near wing
    dragonWing(ctx, -2, -38, -0.15 - flap * 0.6, 1, DRAGON_L);
    // Team-coloured gem on the chest
    glowDot(ctx, 12, -26, 2, p.tc.main, p.tc.light);
    ctx.restore();
    void cluster;
    void dots;
  },
};

function dragonWing(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, bone: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  const tips: [number, number][] = [
    [-14, -30],
    [-30, -30],
    [-44, -22],
    [-52, -8],
  ];
  // Membrane
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(tips[0][0], tips[0][1]);
  for (let i = 1; i < tips.length; i++) {
    const [px, py] = tips[i - 1];
    const [nx, ny] = tips[i];
    ctx.quadraticCurveTo((px + nx) / 2 + 4, (py + ny) / 2 + 8, nx, ny);
  }
  ctx.quadraticCurveTo(-30, 4, 0, 4);
  ctx.closePath();
  ctx.fillStyle = MEMBRANE;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // Bones
  for (const [tx, ty] of tips) line(ctx, -4, -2, tx, ty, 2, bone);
  limb(ctx, 0, 0, -14, -30, 3, bone);
  ctx.restore();
}
