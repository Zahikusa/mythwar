import { TAU, drawGlow, glowSprite } from './draw.ts';

export type Shape = 'dot' | 'glow' | 'spark' | 'leaf' | 'shard' | 'ring' | 'smoke' | 'petal';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  size1: number;
  color: string;
  rgb: [number, number, number] | null;
  shape: Shape;
  gravity: number;
  drag: number;
  rot: number;
  vr: number;
  /** Draw layer: 0..2 = with that lane, 3 = above everything. */
  layer: number;
  alpha: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
  vy: number;
  /** Numeric amount for mergeable "+N" texts. */
  amount?: number;
}

/** Bespoke timed effects drawn with custom code. */
export interface TimedFx {
  kind: 'lightning' | 'ring' | 'meteor' | 'vines' | 'ice' | 'beam' | 'flashAt' | 'slash' | 'shockwave' | 'coin' | 'pillar' | 'scorch';
  x: number;
  y: number;
  x2: number;
  y2: number;
  t: number;
  dur: number;
  layer: number;
  size: number;
  color: string;
  rgb: [number, number, number];
  seed: number;
}

export interface BurstOpts {
  count: number;
  color: string;
  rgb?: [number, number, number];
  speed: number;
  life: number;
  size: number;
  size1?: number;
  gravity?: number;
  drag?: number;
  shape?: Shape;
  /** Direction (radians) and spread; default full circle. */
  dir?: number;
  spread?: number;
  layer?: number;
  jitter?: number;
}

/** Timed effects drawn over the creatures rather than on the ground beneath them. */
const OVER_KINDS = new Set<string>(['slash', 'flashAt', 'beam']);

export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  timed: TimedFx[] = [];
  maxParticles = 1400;
  /** Global screen flash. */
  flash = 0;
  /** Coins that reached the gold counter (the HUD pulses when this grows). */
  coinsArrived = 0;
  flashColor = '255,255,255';

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.timed.length = 0;
    this.flash = 0;
  }

  burst(x: number, y: number, o: BurstOpts): void {
    const n = Math.min(o.count, this.maxParticles - this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * TAU;
      const sp = o.speed * (0.35 + Math.random() * 0.65);
      const life = o.life * (0.6 + Math.random() * 0.4);
      const j = o.jitter ?? 0;
      this.particles.push({
        x: x + (Math.random() - 0.5) * j,
        y: y + (Math.random() - 0.5) * j,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: o.size * (0.6 + Math.random() * 0.6),
        size1: o.size1 ?? 0,
        color: o.color,
        rgb: o.rgb ?? null,
        shape: o.shape ?? 'dot',
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 2,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 8,
        layer: o.layer ?? 3,
        alpha: 1,
      });
    }
  }

  add(p: Partial<Particle> & { x: number; y: number; life: number; color: string }): void {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({
      vx: 0,
      vy: 0,
      max: p.life,
      size: 3,
      size1: 0,
      rgb: null,
      shape: 'dot',
      gravity: 0,
      drag: 0,
      rot: 0,
      vr: 0,
      layer: 3,
      alpha: 1,
      ...p,
    } as Particle);
  }

  text(x: number, y: number, text: string, color: string, size = 14): void {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x, y, text, color, size, life: 1.1, max: 1.1, vy: -38 });
  }

  /** "+N" gold popup; kills close together merge into one growing number instead of a pile. */
  gold(x: number, y: number, amount: number, color: string, size = 15, radius = 60): void {
    for (const t of this.texts) {
      if (t.amount === undefined || t.color !== color || t.life < t.max - 0.45) continue;
      if (Math.abs(t.x - x) < radius && Math.abs(t.y - y) < radius) {
        t.amount += amount;
        t.text = `+${t.amount}`;
        t.life = t.max; // re-pop
        t.size = Math.min(size * 1.6, t.size + 1.5);
        return;
      }
    }
    this.text(x, y, `+${amount}`, color, size);
    this.texts[this.texts.length - 1].amount = amount;
  }

  timedFx(f: Omit<TimedFx, 't' | 'seed' | 'x2' | 'y2' | 'size' | 'color' | 'rgb'> & Partial<TimedFx>): void {
    this.timed.push({ t: 0, seed: Math.random(), x2: f.x, y2: f.y, size: 1, color: '#ffffff', rgb: [255, 255, 255], ...f } as TimedFx);
  }

  update(dt: number): void {
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ps[w++] = p;
    }
    ps.length = w;
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const f of this.timed) f.t += dt;
    for (const f of this.timed) if (f.kind === 'coin' && f.t >= f.dur) this.coinsArrived++;
    this.timed = this.timed.filter((f) => f.t < f.dur);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  drawParticles(ctx: CanvasRenderingContext2D, layer: number): void {
    for (const p of this.particles) {
      if (p.layer !== layer) continue;
      const k = p.life / p.max; // 1 → 0
      const size = p.size1 + (p.size - p.size1) * k;
      if (size <= 0.05) continue;
      const a = p.alpha * Math.min(1, k * 2.2);
      switch (p.shape) {
        case 'glow':
          drawGlow(ctx, p.x, p.y, size * 2.5, p.rgb ?? p.color, a);
          break;
        case 'spark': {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.8, size * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'leaf':
        case 'petal': {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, size, size * (p.shape === 'petal' ? 0.6 : 0.4), 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'shard': {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(-size, 0);
          ctx.lineTo(0, -size * 0.45);
          ctx.lineTo(size, 0);
          ctx.lineTo(0, size * 0.45);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'ring': {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, size * 0.15);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, size, size * 0.4, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'smoke': {
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * (2 - k), 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        default: {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  drawTexts(ctx: CanvasRenderingContext2D, ui: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      const size = Math.round(t.size * Math.max(0.75, ui) * pop);
      ctx.font = `800 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.lineWidth = Math.max(2, size * 0.22);
      ctx.strokeStyle = 'rgba(20, 10, 30, 0.85)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Draws a layer's timed effects. `pass`: 'ground' effects (rings, scorches...) go under the
   * creatures, 'over' effects (slashes, flashes, beams) on top of them.
   */
  drawTimed(ctx: CanvasRenderingContext2D, layer: number, pass: 'ground' | 'over' | 'all' = 'all'): void {
    for (const f of this.timed) {
      if (f.layer !== layer) continue;
      if (pass !== 'all' && OVER_KINDS.has(f.kind) !== (pass === 'over')) continue;
      const k = f.t / f.dur;
      switch (f.kind) {
        case 'ring': {
          const r = f.size * (0.2 + 0.8 * Math.sqrt(k));
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = Math.max(1, f.size * 0.08 * (1 - k));
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, r, r * 0.38, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'shockwave': {
          const r = f.size * (0.15 + 0.85 * Math.sqrt(k));
          drawGlow(ctx, f.x, f.y, r * 1.2, f.rgb, (1 - k) * 0.5);
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = Math.max(1.5, f.size * 0.12 * (1 - k));
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, r, r * 0.4, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'flashAt': {
          drawGlow(ctx, f.x, f.y, f.size * (0.6 + k * 0.6), f.rgb, (1 - k) * 0.9);
          break;
        }
        case 'lightning':
          drawLightning(ctx, f, k);
          break;
        case 'beam': {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = f.color;
          ctx.lineCap = 'round';
          ctx.lineWidth = f.size * (1 - k);
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = f.size * 0.35 * (1 - k);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'slash': {
          // A swift crescent; x2 holds the facing (+1 = blow travelling right).
          const dir = f.x2 >= f.x ? 1 : -1;
          const sweep = k < 0.4 ? k / 0.4 : 1;
          const a0 = dir > 0 ? -1.3 : Math.PI + 1.3;
          const a1 = a0 + dir * 2.0 * sweep;
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = f.color;
          ctx.lineCap = 'round';
          ctx.lineWidth = f.size * 0.16 * (1 - k * 0.6);
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.size, Math.min(a0, a1), Math.max(a0, a1));
          ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.5;
          ctx.lineWidth = f.size * 0.05;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.size * 0.82, Math.min(a0, a1), Math.max(a0, a1));
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'meteor':
          drawMeteor(ctx, f, k);
          break;
        case 'vines':
          drawVines(ctx, f, k);
          break;
        case 'ice':
          drawIce(ctx, f, k);
          break;
        case 'coin':
          drawCoin(ctx, f, k);
          break;
        case 'pillar':
          drawPillar(ctx, f, k);
          break;
        case 'scorch': {
          // Ground decal under heavy impacts; fades out.
          const a = (1 - k) * 0.35;
          ctx.fillStyle = `rgba(30, 18, 14, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, f.size, f.size * 0.32, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = `rgba(${f.rgb.join(',')}, ${(a * 0.6).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, f.size * 0.45, f.size * 0.14, 0, 0, TAU);
          ctx.fill();
          break;
        }
      }
    }
  }
}

function drawLightning(ctx: CanvasRenderingContext2D, f: TimedFx, k: number): void {
  const a = k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85;
  const segs = 9;
  let seed = f.seed * 1000 + Math.floor(f.t * 30);
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = f.x2 + (f.x - f.x2) * t + (i === 0 || i === segs ? 0 : (rnd() - 0.5) * f.size * 0.9);
    const y = f.y2 + (f.y - f.y2) * t;
    pts.push([x, y]);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, col] of [
    [f.size * 0.5, `rgba(${f.rgb.join(',')},${0.25 * a})`],
    [f.size * 0.18, `rgba(${f.rgb.join(',')},${0.8 * a})`],
    [f.size * 0.07, `rgba(255,255,255,${a})`],
  ] as [number, string][]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, w);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }
  ctx.restore();
  drawGlow(ctx, f.x, f.y, f.size * 2.2, f.rgb, a * 0.8);
}

function drawMeteor(ctx: CanvasRenderingContext2D, f: TimedFx, k: number): void {
  // Falls from (x2, y2) to (x, y) over the effect duration.
  const e = k * k;
  const x = f.x2 + (f.x - f.x2) * e;
  const y = f.y2 + (f.y - f.y2) * e;
  const dx = f.x - f.x2;
  const dy = f.y - f.y2;
  const len = Math.hypot(dx, dy) || 1;
  const tail = f.size * 5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x, y, x - (dx / len) * tail, y - (dy / len) * tail);
  g.addColorStop(0, `rgba(${f.rgb.join(',')},0.9)`);
  g.addColorStop(1, `rgba(${f.rgb.join(',')},0)`);
  ctx.strokeStyle = g;
  ctx.lineWidth = f.size * 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - (dx / len) * tail, y - (dy / len) * tail);
  ctx.stroke();
  ctx.restore();
  drawGlow(ctx, x, y, f.size * 2, f.rgb, 0.9);
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.arc(x, y, f.size * 0.45, 0, TAU);
  ctx.fill();
}

function drawVines(ctx: CanvasRenderingContext2D, f: TimedFx, k: number): void {
  const grow = k < 0.2 ? k / 0.2 : 1;
  const fade = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
  ctx.globalAlpha = fade;
  const s = f.size;
  for (let i = 0; i < 5; i++) {
    const ox = (i - 2) * s * 0.35 + Math.sin(f.seed * 10 + i) * s * 0.1;
    const h = s * (1 + ((i * 37 + f.seed * 100) % 10) / 10) * grow;
    const lean = (i - 2) * 0.2;
    ctx.fillStyle = i % 2 ? '#3f7d32' : '#2f6326';
    ctx.beginPath();
    ctx.moveTo(f.x + ox - s * 0.12, f.y);
    ctx.quadraticCurveTo(f.x + ox + lean * h, f.y - h * 0.6, f.x + ox + lean * h * 1.4, f.y - h);
    ctx.quadraticCurveTo(f.x + ox + lean * h * 0.5, f.y - h * 0.5, f.x + ox + s * 0.12, f.y);
    ctx.fill();
    // thorns
    ctx.fillStyle = '#c9b77a';
    ctx.beginPath();
    ctx.arc(f.x + ox + lean * h * 0.7, f.y - h * 0.55, s * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawIce(ctx: CanvasRenderingContext2D, f: TimedFx, k: number): void {
  const grow = k < 0.12 ? k / 0.12 : 1;
  const fade = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
  const s = f.size * grow;
  ctx.globalAlpha = 0.75 * fade;
  ctx.fillStyle = 'rgba(190, 235, 255, 0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(f.x - s * 0.7, f.y);
  ctx.lineTo(f.x - s * 0.8, f.y - s * 1.2);
  ctx.lineTo(f.x - s * 0.3, f.y - s * 1.9);
  ctx.lineTo(f.x + s * 0.4, f.y - s * 1.7);
  ctx.lineTo(f.x + s * 0.85, f.y - s * 1.0);
  ctx.lineTo(f.x + s * 0.7, f.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 0.6 * fade;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(f.x - s * 0.5, f.y - s * 1.3);
  ctx.lineTo(f.x - s * 0.25, f.y - s * 1.75);
  ctx.lineTo(f.x - s * 0.15, f.y - s * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A column of light from the ground (x, y) up off the top of the screen. */
function drawPillar(ctx: CanvasRenderingContext2D, f: TimedFx, k: number): void {
  const grow = k < 0.15 ? k / 0.15 : 1;
  const fade = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
  const w = f.size * (0.25 + 0.45 * grow) * (1 - k * 0.4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(f.x - w, 0, f.x + w, 0);
  const c = f.rgb.join(',');
  g.addColorStop(0, `rgba(${c},0)`);
  g.addColorStop(0.35, `rgba(${c},${0.16 * fade})`);
  g.addColorStop(0.5, `rgba(255,255,255,${0.42 * fade})`);
  g.addColorStop(0.65, `rgba(${c},${0.16 * fade})`);
  g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(f.x - w, -20, w * 2, f.y + 20);
  ctx.restore();
  drawGlow(ctx, f.x, f.y, f.size * 1.2, f.rgb, fade * 0.6);
}

/** A gold coin arcing from a slain foe to the gold counter (x2, y2). */
function drawCoin(ctx: CanvasRenderingContext2D, f: TimedFx, k: number): void {
  const e = k * k * (3 - 2 * k);
  const x = f.x + (f.x2 - f.x) * e;
  const y = f.y + (f.y2 - f.y) * e - Math.sin(k * Math.PI) * 60 * f.size;
  const r = 5 * f.size * (1 - k * 0.3);
  const spin = Math.abs(Math.cos(k * 14 + f.seed * 6));
  drawGlow(ctx, x, y, r * 3, [255, 210, 100], 0.5);
  ctx.fillStyle = '#7a4b12';
  ctx.beginPath();
  ctx.ellipse(x, y, r * Math.max(0.2, spin) + 0.8, r + 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f6c453';
  ctx.beginPath();
  ctx.ellipse(x, y, r * Math.max(0.15, spin), r, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3 * spin, y - r * 0.35, r * 0.25 * spin, r * 0.25, 0, 0, TAU);
  ctx.fill();
}

/** Shared helper so other modules can pre-warm glow sprites. */
export function warmGlows(cols: ([number, number, number] | string)[]): void {
  for (const c of cols) glowSprite(c);
}
