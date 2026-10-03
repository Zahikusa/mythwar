import { AGE_UNITS } from './sim/data.ts';
import { artFor } from './render/creatures/index.ts';
import { setLineWidth } from './render/draw.ts';
import { TEAM_COLORS } from './render/theme.ts';

/** Debug page (?gallery): every creature idle / walking / attacking, for art review. */
export function runGallery(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const units = AGE_UNITS.flat();
  const scale = Number(new URLSearchParams(location.search).get('scale') ?? 2);
  const cellW = 120 * scale;
  const cellH = 90 * scale;
  const cols = 3;
  const resize = () => {
    canvas.width = cols * cellW * 2;
    canvas.height = Math.ceil(units.length / 2) * cellH;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  };
  resize();
  document.body.style.overflow = 'auto';
  document.body.style.touchAction = 'auto';
  const start = performance.now();
  const frame = () => {
    const t = (performance.now() - start) / 1000;
    ctx.fillStyle = '#3a5a3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    units.forEach((def, i) => {
      const art = artFor(def.id);
      const col = (i % 2) * cols;
      const row = Math.floor(i / 2);
      for (let k = 0; k < cols; k++) {
        const x = (col + k) * cellW + cellW / 2;
        const y = row * cellH + cellH * 0.8;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(x, y, def.radius * scale, def.radius * scale * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(x, y - art.fly * scale);
        ctx.scale(scale, scale);
        setLineWidth(1.2 / scale * 1.6);
        const animDur = def.windup + 0.35;
        const atk = k === 2 ? ((t % (animDur + 0.4)) / animDur) : -1;
        art.draw(ctx, {
          t,
          walk: k === 1 ? t * def.speed * 0.24 : 0,
          moving: k === 1,
          attack: atk < 1 ? atk : -1,
          hit: def.windup / animDur,
          tc: TEAM_COLORS[(i % 2) as 0 | 1],
          seed: 0.3,
          enraged: false,
          charged: k === 1,
        });
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      ctx.font = `${12 * scale * 0.6}px sans-serif`;
      ctx.fillText(def.name, col * cellW + 6, row * cellH + 14 * scale * 0.6);
    });
    requestAnimationFrame(frame);
  };
  frame();
}
