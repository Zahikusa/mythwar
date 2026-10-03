import { LANE_COUNT, LANE_LENGTH } from '../sim/data.ts';

export type LayoutMode = 'desktop' | 'mobile';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaneGeom {
  index: number;
  /** 0 = farthest from the camera, 1 = nearest. */
  depth: number;
  /** Feet line (screen y) for ground creatures. */
  y: number;
  /** Screen x of lane position 0 (team 0 gate) and LANE_LENGTH (team 1 gate). */
  x0: number;
  x1: number;
  /** Pixels per lane unit (also the creature drawing scale). */
  s: number;
  /** Visual thickness of the lane path. */
  band: number;
}

export interface Layout {
  mode: LayoutMode;
  width: number;
  height: number;
  /** Area where the battlefield is drawn (HUD panels excluded). */
  field: Rect;
  horizon: number;
  lanes: LaneGeom[];
  /** Overall UI scale factor (1 at a 1600x900 desktop). */
  ui: number;
  /** HUD insets reserved by DOM panels, in CSS px. */
  insets: { top: number; bottom: number; left: number; right: number };
}

const DEPTHS = [0, 0.5, 1];
const LANE_Y = [0.45, 0.655, 0.875];
const DEPTH_SCALE = [0.8, 0.9, 1];

export function detectMode(width: number, height: number): LayoutMode {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (coarse) return 'mobile';
  if (Math.min(width, height) < 520) return 'mobile';
  return 'desktop';
}

export function computeLayout(width: number, height: number, mode: LayoutMode): Layout {
  let insets: Layout['insets'];
  if (mode === 'desktop') {
    const bottom = Math.round(Math.min(150, Math.max(112, height * 0.15)));
    insets = { top: 0, bottom, left: 0, right: 0 };
  } else {
    const side = Math.round(Math.min(116, Math.max(78, width * 0.105)));
    insets = { top: 0, bottom: 0, left: side, right: side };
  }
  const field: Rect = {
    x: insets.left,
    y: insets.top,
    w: width - insets.left - insets.right,
    h: height - insets.top - insets.bottom,
  };
  const horizon = field.y + field.h * 0.25;
  // Citadels take a slice of the field on each side.
  const citadelW = Math.min(field.w * 0.13, field.h * 0.34);
  const fullLaneW = field.w - citadelW * 2;
  const cx = field.x + field.w / 2;
  const lanes: LaneGeom[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const w = fullLaneW * DEPTH_SCALE[i];
    lanes.push({
      index: i,
      depth: DEPTHS[i],
      y: field.y + field.h * LANE_Y[i],
      x0: cx - w / 2,
      x1: cx + w / 2,
      s: w / LANE_LENGTH,
      band: field.h * (0.06 + 0.035 * DEPTHS[i]),
    });
  }
  return {
    mode,
    width,
    height,
    field,
    horizon,
    lanes,
    ui: Math.min(width / 1600, height / 900),
    insets,
  };
}

/**
 * Drawing scale for creatures, gates and turrets in a lane. Follows the lane's horizontal scale,
 * but is capped by the field height so ultrawide screens don't get giant creatures.
 */
export function artScaleOf(layout: Layout, g: LaneGeom): number {
  const cap = (layout.field.h / 620) * (0.8 + 0.2 * g.depth);
  return Math.min(g.s, cap) * (layout.mode === 'mobile' ? 1.4 : 1.25);
}

/** Screen x for a lane position. */
export function laneX(g: LaneGeom, x: number): number {
  return g.x0 + (x / LANE_LENGTH) * (g.x1 - g.x0);
}

/** Lane position for a screen x (clamped). */
export function laneXInverse(g: LaneGeom, sx: number): number {
  return Math.max(0, Math.min(LANE_LENGTH, ((sx - g.x0) / (g.x1 - g.x0)) * LANE_LENGTH));
}

/** Which lane a screen point is over (by nearest feet line), or -1 when far outside. */
export function laneAt(layout: Layout, sx: number, sy: number): number {
  const f = layout.field;
  if (sx < f.x || sx > f.x + f.w || sy < layout.horizon - f.h * 0.05 || sy > f.y + f.h) return -1;
  let best = -1;
  let bestD = Infinity;
  for (const g of layout.lanes) {
    // Hit area extends upward (creatures stand above the feet line).
    const d = sy <= g.y ? (g.y - sy) * 0.6 : (sy - g.y) * 1.2;
    if (d < bestD) {
      bestD = d;
      best = g.index;
    }
  }
  return best;
}
