import { COUNTERS, HOLD_PAST_SHRINE, LANE_LENGTH, SHRINE_RADIUS, SHRINE_X, TICK, UNITS, WARD, counterOf } from '../sim/data.ts';
import type { UnitDef } from '../sim/data.ts';
import { POWER_TIMING, spiritDragonHead } from '../sim/powers.ts';
import type { Projectile, SimEvent, Team, Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { renderAurora, renderBackground, renderVignette } from './background.ts';
import { drawCitadelGate, drawCitadelKeep, drawTurret, gateBounds, keepEmblem } from './citadel.ts';
import { SIGILS } from '../net/protocol.ts';
import { HeroNames } from '../ui/heroes.ts';
import { artFor } from './creatures/index.ts';
import { GESTURE_TIME, TEMPERS, gestureAt } from './creatures/tempers.ts';
import type { CreatureArt, Pose } from './creatures/types.ts';
import { TAU, circle, drawGlow, ellipse, setLineWidth } from './draw.ts';
import { Fx } from './fx.ts';
import type { FloatText } from './fx.ts';
import { artScaleOf, computeLayout, laneX } from './layout.ts';
import type { LaneGeom, Layout, LayoutMode } from './layout.ts';
import { drawProjectile, projectileImpact } from './projectiles.ts';
import { TEAM_COLORS, THEMES, setColorPerspective, setFoePalette } from './theme.ts';

export interface ViewState {
  playerTeam: Team;
  /** The title screen's attract battle (AI vs AI): no player-facing callouts. */
  demo?: boolean;
  selectedLane: number;
  hoverLane: number;
  /** Lane highlight mode while choosing a lane for a power / drag-drop. */
  targeting: 'none' | 'power' | 'summon' | 'turret';
  paused: boolean;
  /** Mouse position in stage coordinates (desktop hover labels), or null. */
  mouse?: { x: number; y: number } | null;
  /** Press-and-hold point on touch screens (shows the creature label there). */
  inspect?: { x: number; y: number } | null;
}

interface UnitVis {
  walk: number;
  lastX: number;
  flash: number;
  spawn: number;
  yJit: number;
  seed: number;
  hpShown: number;
  hpAlpha: number;
  frozenFx: number;
  /** Last seen hp and healing accumulated since the last heal sparkle. */
  lastHp: number;
  healAcc: number;
  lastSlash: number;
  /** 1 → 0 after a rebirth: the creature glows white-hot and re-forms. */
  reborn: number;
  /** The frost-tinted frozen pose, rendered once while the creature is frozen solid. */
  frozen: { canvas: HTMLCanvasElement; sc: number } | null;
  /** Where the body was last drawn (screen), for effects of the blow that kills it. */
  hx: number;
  hy: number;
  radius: number;
  /** Its temper's gesture after felling a foe: 1 → 0 while playing; not again before `gestNext`. */
  gest: number;
  gestNext: number;
  /** How long a pending gesture has waited for the current swing to end. */
  gestWait: number;
  /** Footfalls taken (half walk cycles), for the dust they kick up. */
  step: number;
}

interface Ghost {
  defId: string;
  team: Team;
  lane: number;
  x: number;
  y: number;
  s: number;
  flying: boolean;
  t: number;
  walk: number;
  seed: number;
}

interface ProjVis {
  /** The target's pack fan-out (lane units), so the shot flies at the hunter actually drawn. */
  fan: number;
  /** Fan-out where the shot starts (a bounce leaves from the foe it just struck). */
  fan0: number;
  h0: number;
  h1: number;
  lastSx: number;
  lastSy: number;
  angle: number;
  trail: number;
}

const DEATH_TIME = 0.9;
/** Seconds of warning before a creature steps out of its gate. */
const EMERGE_WARN = 1.2;
const CLASS_PLURAL: Record<string, string> = { guardian: 'Guardians', hunter: 'Hunters', mystic: 'Mystics', legend: 'Legends' };
const CLASS_COLORS: Record<string, string> = { guardian: '#f2b84b', hunter: '#7ed957', mystic: '#b48cff', legend: '#ff8a3d' };
const SPAWN_TIME = 0.35;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  layout!: Layout;
  dpr = 1;
  quality: 'high' | 'low' = 'high';
  shakeEnabled = true;
  /** Slow camera drift (title screen backdrop). */
  cinematic = false;
  /** Debug/profiling: names of render passes to skip (see scripts/perf2.mjs). */
  readonly skip = new Set<string>();
  /** Stage position of the HUD gold counter (coins fly there), or null when hidden. */
  coinTarget: [number, number] | null = null;
  /** Game speed (2 = fast-forward): effects timed by the sim (meteor fall, root, freeze) run
   *  this much faster in real time, so they stay in step with what they show. */
  speed = 1;
  /** The names veterans earned in this battle (Lens #88; the chronicle keeps the same). */
  private heroes = new HeroNames();
  /** Each side's sigil on its keep (SIGILS index, -1 = none; Lens #85). */
  sigils: [number, number] = [-1, -1];
  /** The local player is team 1: the battlefield is drawn mirrored so their citadel is on the left. */
  private mirror = false;
  private bgCache = new Map<number, HTMLCanvasElement>();
  private keepCache = new Map<string, { canvas: HTMLCanvasElement; x: number; w: number }>();
  private gradCache = new Map<string, CanvasGradient>();
  private gateCache = new Map<string, { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>();
  private aurora: HTMLCanvasElement | null = null;
  private twinkles: { x: number; y: number; p: number; s: number }[] = [];
  private vignette: HTMLCanvasElement | null = null;
  private theme = 0;
  private prevTheme = -1;
  private themeFade = 1;
  private vis = new Map<number, UnitVis>();
  private ghosts: Ghost[] = [];
  private projVis = new Map<number, ProjVis>();
  /** Where shots at a unit visibly land (height above the feet line, fan-out), by unit id. */
  private aimAt = new Map<number, { h: number; fan: number }>();
  private artBounds = new Map<string, { l: number; r: number; t: number; b: number }>();
  readonly fx = new Fx();
  /** Ambient particles (fireflies, snow, petals…); `th` = the theme they belong to. */
  private ambient: { x: number; y: number; p: number; s: number; th: number }[] = [];
  private time = 0;
  /** When each lane last showed "Effective!" / "Resisted" over the player's creatures. */
  private wordAt: [number, number][] = [[-99, -99], [-99, -99], [-99, -99]];
  /** Seconds since the previous rendered frame (0 while paused). */
  private frameDt = 0;
  private shake = 0;
  /** The far-sky traveller (Lens #74): when the next one sets off, its direction and height. */
  private traveller = { next: 12, dir: 1, y: 0.6 };
  /** The lane of the player's god power and how much of its moment is left (1 → 0). */
  private focusLane = -1;
  private focusT = 0;
  private ragnarok = 0;
  private baseFlash: [number, number] = [0, 0];
  private shrinePulse = [0, 0, 0];
  private gateChips = [-1, -1, -1, -1, -1, -1];
  private laneAlert = [0, 0, 0];
  /** An ally's lane call (co-op): a golden pulse over the lane, fading. */
  private lanePingT = [0, 0, 0];
  private shrineGlint = [0, 0, 0];
  /** Last golden mote shed by a surging shrine. */
  private surgeMote = [0, 0, 0];
  /** The local player's recent kills per lane (sim time), for "Rout!" callouts. */
  private routs: { times: number[]; xs: number[]; text: FloatText | null }[] = [0, 1, 2].map(() => ({ times: [], xs: [], text: null }));
  /** Called when the player's kills in one lane reach a rout tier (4, 6, 9 within a few seconds). */
  onRout: ((count: number) => void) | null = null;
  private winner: Team | null = null;
  private embers: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private hover: { unit: Unit; x: number; top: number; d: number } | null = null;
  private mouseRef: { x: number; y: number } | null = null;
  private sortBuf: Unit[] = [];
  private screenBuf: ReturnType<Renderer['unitScreen']>[] = [];
  private ageFlash: [number, number] = [0, 0];
  /** Citadel collapse progress per team (-1 = standing). */
  private collapse: [number, number] = [-1, -1];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(width: number, height: number, mode: LayoutMode, dprCap: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const old = this.layout;
    this.layout = computeLayout(width, height, mode);
    if (old && (old.width !== width || old.height !== height || old.mode !== mode)) {
      // Effects live in screen space: after a real layout change they'd hang in stale spots.
      this.fx.clear();
      this.ghosts = [];
    }
    this.bgCache.clear();
    this.keepCache.clear();
    this.gradCache.clear();
    this.gateCache.clear();
    this.aurora = null;
    this.twinkles = [];
    this.vignette = renderVignette(width, height, this.dpr);
    this.fx.maxParticles = mode === 'mobile' || this.quality === 'low' ? 600 : 1400;
    this.ambient = [];
  }

  setTheme(index: number, instant = false): void {
    if (index === this.theme) return;
    if (instant) {
      this.theme = index;
      this.prevTheme = -1;
      this.themeFade = 1;
      // (Old particles would keep their old theme's spread: fireflies stuck in the sky.)
      this.ambient = [];
      return;
    }
    // Cross-fade: the old age's particles fade out as the new age's fade in (drawAmbient).
    this.prevTheme = this.theme;
    this.theme = index;
    this.themeFade = 0;
  }

  /**
   * Whose eyes the battlefield is seen through: that team is drawn on the left and in blue.
   * (Team 1 online: the world is mirrored; screen positions the HUD uses stay the same.)
   */
  setPerspective(team: Team): void {
    this.mirror = team === 1;
    if (setColorPerspective(team)) this.clearTeamCaches();
  }

  /** The foe in red, or in the colour-blind friendly orange. */
  setColorblind(on: boolean): void {
    if (setFoePalette(on)) this.clearTeamCaches();
  }

  private clearTeamCaches(): void {
    this.keepCache.clear();
    this.gateCache.clear();
    this.gradCache.clear();
  }

  /** Mirrors a stage x across the battlefield's centre line (identity when not mirrored). */
  private flipX(x: number): number {
    if (!this.mirror) return x;
    const f = this.layout.field;
    return 2 * f.x + f.w - x;
  }

  /** Forgets the visuals of the battle. `resync`: the same battle continues (keep its heroes' names). */
  reset(resync = false): void {
    if (!resync) this.heroes = new HeroNames();
    for (const r of this.routs) {
      r.times = [];
      r.xs = [];
      r.text = null;
    }
    this.vis.clear();
    this.ghosts = [];
    this.projVis.clear();
    this.aimAt.clear();
    this.fx.clear();
    this.ragnarok = 0;
    this.shake = 0;
    this.collapse = [-1, -1];
    this.laneAlert = [0, 0, 0];
    this.embers = [];
  }

  /**
   * Many foes falling in one lane within a few seconds (a god power, a counter crushing a wave)
   * earns a callout that grows with the tally: Rout! → Slaughter! → Annihilation!
   */
  private countRout(lane: number, now: number, x: number, y: number): void {
    const WINDOW = 2.5;
    const r = this.routs[lane];
    while (r.times.length && now - r.times[0] > WINDOW) {
      r.times.shift();
      r.xs.shift();
    }
    r.times.push(now);
    r.xs.push(x);
    const n = r.times.length;
    if (n < 4) return;
    const label = `${n >= 9 ? 'Annihilation!' : n >= 6 ? 'Slaughter!' : 'Rout!'} ×${n}`;
    const cx = r.xs.reduce((a, b) => a + b, 0) / n;
    const size = 22 + Math.min(12, (n - 4) * 2);
    if (r.text && r.text.life > 0 && this.fx.texts.includes(r.text)) {
      r.text.text = label;
      r.text.size = size;
      r.text.life = r.text.max;
    } else {
      this.fx.text(cx, y, label, '#ffe08a', size);
      r.text = this.fx.texts[this.fx.texts.length - 1];
      r.text.life = r.text.max = 1.9;
      r.text.vy = -22;
    }
    if (n === 4 || n === 6 || n === 9) this.onRout?.(n);
  }

  private background(index: number): HTMLCanvasElement {
    let c = this.bgCache.get(index);
    if (!c) {
      c = renderBackground(this.layout, THEMES[index], this.dpr, index);
      this.bgCache.set(index, c);
      // Full-screen backdrops are big (tens of MB on 4K screens): keep only the ones in use.
      for (const k of this.bgCache.keys()) if (k !== this.theme && k !== this.prevTheme && k !== index) this.bgCache.delete(k);
    }
    return c;
  }

  /** The static part of a gate tower, pre-rendered into a small canvas. */
  private gateLayer(team: Team, lane: number, age: number): { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number } {
    const key = `g${team}:${lane}:${age}`;
    let c = this.gateCache.get(key);
    if (!c) {
      const gate = this.gateScreen(team, lane);
      const b = gateBounds(this.layout, team, lane, gate.y, gate.s);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(b.w * this.dpr));
      canvas.height = Math.max(1, Math.round(b.h * this.dpr));
      const cx = canvas.getContext('2d')!;
      cx.setTransform(this.dpr, 0, 0, this.dpr, -b.x * this.dpr, -b.y * this.dpr);
      drawCitadelGate(cx, this.layout, team, lane, age, gate.x, gate.y, gate.s, 0, 0, 0, 'static');
      c = { canvas, ...b };
      // Only the current age's layer per gate is worth keeping.
      const prefix = `g${team}:${lane}:`;
      for (const k of this.gateCache.keys()) if (k.startsWith(prefix)) this.gateCache.delete(k);
      this.gateCache.set(key, c);
    }
    return c;
  }

  /** The static part of a citadel keep and curtain wall, pre-rendered (cropped to its side). */
  private keepLayer(team: Team, age: number): { canvas: HTMLCanvasElement; x: number; w: number } {
    const key = `${team}:${age}`;
    let c = this.keepCache.get(key);
    if (!c) {
      const L = this.layout;
      const far = L.lanes[0];
      const w = Math.ceil(far.x0 + 24);
      const x = team === 0 ? 0 : L.width - w;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * this.dpr));
      canvas.height = Math.max(1, Math.round(L.height * this.dpr));
      const cx = canvas.getContext('2d')!;
      cx.setTransform(this.dpr, 0, 0, this.dpr, -x * this.dpr, 0);
      drawCitadelKeep(cx, L, team, age, 1, 0, 0, 0, 0, 'static');
      c = { canvas, x, w };
      // A full-height layer per side: keep only the current age's.
      for (const k of this.keepCache.keys()) if (k.startsWith(`${team}:`)) this.keepCache.delete(k);
      this.keepCache.set(key, c);
    }
    return c;
  }

  // -------------------------------------------------------------------------
  // Geometry helpers
  // -------------------------------------------------------------------------

  private artScale(g: LaneGeom): number {
    return artScaleOf(this.layout, g);
  }

  /** Creature body scale without the art boost (rings, health bars, hit boxes). */
  private bodyScale(g: LaneGeom): number {
    return this.artScale(g) / (this.layout.mode === 'mobile' ? 1.4 : 1.25);
  }

  /** Hunters crowd into packs at the same spot; each is drawn fanned out a little (lane units). */
  private fanOf(def: UnitDef, seed: number | undefined): number {
    return seed !== undefined && def.cls === 'hunter' ? (seed - 0.5) * def.radius * 1.4 : 0;
  }

  unitScreen(u: Unit, alpha: number): { x: number; y: number; s: number; art: CreatureArt } {
    const g = this.layout.lanes[u.lane];
    const xi = u.px + (u.x - u.px) * alpha;
    const v = this.vis.get(u.id);
    const art = artFor(u.def.id);
    return {
      x: laneX(g, xi + this.fanOf(u.def, v?.seed)),
      y: g.y + (v ? v.yJit : 0) * g.band,
      s: this.artScale(g) * art.scale,
      art,
    };
  }

  /**
   * 0..1: how soon a creature steps out of this gate (the portal flares for the last
   * EMERGE_WARN seconds of training, and glows while a trained one waits for room). Shown for
   * both sides, so attentive players can see where the enemy's next creature is coming.
   */
  private emergeAt(world: World, team: Team, lane: number): number {
    if (world.winner !== null) return 0;
    const p = world.players[team];
    let e = 0;
    const i = world.trainingIndex(team, lane);
    if (i >= 0) {
      const left = UNITS[p.queue[i].unitId].trainTime - p.trainProgress[lane];
      const k = Math.max(0, Math.min(1, 1 - left / EMERGE_WARN));
      e = k * k;
    }
    for (const q of p.queue) if (q.ready && q.lane === lane) e = Math.max(e, 0.45 + 0.15 * Math.sin(this.time * 4));
    return e;
  }

  /**
   * Frozen solid: the creature is washed in frost. The frozen pose doesn't change, so it is
   * rendered once into a sprite (cropped to the creature's measured bounds) and tinted with a
   * cheap source-atop fill — a ctx.filter on every fill was ~4 ms per creature per frame.
   * `ctx` is in the creature's art space (already scaled by sc).
   */
  private drawFrozen(ctx: CanvasRenderingContext2D, v: UnitVis, defId: string, art: CreatureArt, pose: Pose, sc: number): void {
    const b = this.artBoundsOf(defId, art, pose);
    const w = b.r - b.l;
    const hgt = b.b - b.t;
    if (!v.frozen || Math.abs(v.frozen.sc - sc) > 1e-3) {
      const k = sc * this.dpr;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(w * k));
      canvas.height = Math.max(1, Math.ceil(hgt * k));
      const cx = canvas.getContext('2d')!;
      cx.setTransform(k, 0, 0, k, -b.l * k, -b.t * k);
      setLineWidth(Math.min(1.6, 1.25 / sc));
      art.draw(cx, pose);
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalCompositeOperation = 'source-atop';
      cx.fillStyle = 'rgba(205, 238, 255, 0.62)';
      cx.fillRect(0, 0, canvas.width, canvas.height);
      v.frozen = { canvas, sc };
    }
    ctx.drawImage(v.frozen.canvas, b.l, b.t, w, hgt);
  }

  /** A creature's drawn extent around its feet (art units, facing right), measured once. */
  private artBoundsOf(defId: string, art: CreatureArt, pose: Pose): { l: number; r: number; t: number; b: number } {
    let b = this.artBounds.get(defId);
    if (b) return b;
    const h = art.height;
    // Generous fallback if the canvas can't be read back.
    b = { l: -h * 1.6 - 20, r: h * 1.6 + 20, t: -h * 1.4 - 20, b: h * 0.3 + 10 };
    try {
      const k = 2;
      const W = Math.ceil((b.r - b.l) * k);
      const H = Math.ceil((b.b - b.t) * k);
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const cx = c.getContext('2d', { willReadFrequently: true })!;
      cx.setTransform(k, 0, 0, k, -b.l * k, -b.t * k);
      setLineWidth(1);
      // Many idle phases (wing flaps, swaying), so any frozen moment fits inside the box.
      for (let i = 0; i < 10; i++) art.draw(cx, { ...pose, t: i * 0.37, walk: i * 0.9, attack: -1 });
      // …and a swing (a creature can be frozen mid-attack).
      for (const attack of [0.2, 0.45, 0.7]) art.draw(cx, { ...pose, attack });
      const data = cx.getImageData(0, 0, W, H).data;
      let x0 = W;
      let y0 = H;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] === 0) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      if (x1 >= 0) {
        const pad = 4 + h * 0.08;
        b = { l: b.l + x0 / k - pad, r: b.l + (x1 + 1) / k + pad, t: b.t + y0 / k - pad, b: b.t + (y1 + 1) / k + pad };
      }
    } catch {
      // keep the fallback box
    }
    this.artBounds.set(defId, b);
    return b;
  }

  /** Screen position of a citadel gate for a lane. */
  gateScreen(team: Team, lane: number): { x: number; y: number; s: number } {
    const g = this.layout.lanes[lane];
    return { x: team === 0 ? g.x0 : g.x1, y: g.y, s: this.artScale(g) };
  }

  // -------------------------------------------------------------------------
  // Events → effects
  // -------------------------------------------------------------------------

  onEvents(events: SimEvent[], world: World, view: ViewState): void {
    const L = this.layout;
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          const g = L.lanes[e.lane];
          const gx = e.team === 0 ? g.x0 : g.x1;
          const tc = TEAM_COLORS[e.team];
          this.fx.timedFx({ kind: 'flashAt', x: gx, y: g.y - 18 * this.bodyScale(g), dur: 0.45, layer: e.lane, size: 40 * this.bodyScale(g), rgb: tc.rgb });
          this.fx.burst(gx, g.y - 10 * this.bodyScale(g), { count: 10, color: tc.light, rgb: tc.rgb, speed: 60, life: 0.6, size: 2.2, shape: 'glow', layer: e.lane, gravity: -40 });
          if (e.defId === 'dragon') {
            // The Elder Dragon bursts out of its gate in fire (Lens #62).
            const s = this.bodyScale(g);
            this.fx.timedFx({ kind: 'shockwave', x: gx, y: g.y, dur: 1.1, layer: e.lane, size: 160 * s, color: '#ff8a3d', rgb: [255, 140, 60] });
            this.fx.timedFx({ kind: 'flashAt', x: gx, y: g.y - 40 * s, dur: 0.8, layer: e.lane, size: 130 * s, rgb: [255, 170, 80] });
            this.fx.burst(gx, g.y - 30 * s, { count: 40, color: '#ffb347', rgb: [255, 160, 70], speed: 220, life: 1.1, size: 3, shape: 'glow', layer: e.lane, gravity: -60, drag: 2 });
            this.fx.burst(gx, g.y - 10 * s, { count: 16, color: 'rgba(70,50,40,0.6)', speed: 90, life: 1.4, size: 8 * s + 3, shape: 'smoke', layer: e.lane, gravity: -30 });
            this.shake = Math.max(this.shake, e.team === view.playerTeam ? 5 : 3.5);
          }
          break;
        }
        case 'hit': {
          const v = this.vis.get(e.targetId);
          if (v) v.flash = 1;
          const u = world.unitById.get(e.targetId);
          // A killing blow's target is already gone from the world: use where it was last drawn.
          let px = NaN;
          let by = NaN;
          if (u) {
            const p = this.unitScreen(u, 1);
            px = p.x;
            by = p.y - (p.art.body[1] * -1 + p.art.fly) * p.s;
          } else if (v) {
            px = v.hx;
            by = v.hy;
          }
          if (!Number.isNaN(px)) {
            // A blow against a frozen (brittle) creature chips ice off it.
            if (u && u.freezeTimer > 0) this.fx.burst(px, by, { count: 5, color: '#d8f4ff', speed: 150, life: 0.45, size: 2.4, shape: 'shard', layer: e.lane, gravity: 260 });
            if (e.mult > 1) {
              this.fx.burst(px, by, { count: 6, color: '#ffe27a', speed: 120, life: 0.35, size: 2.2, shape: 'spark', layer: e.lane, drag: 4 });
            } else if (e.mult < 1) {
              // A countered blow glances off: a dull grey puff instead of sparks (Lens #57).
              this.fx.burst(px, by, { count: 4, color: '#8e97ab', speed: 45, life: 0.3, size: 2.6, shape: 'smoke', layer: e.lane, drag: 3 });
            } else if (e.source === 'unit') {
              this.fx.burst(px, by, { count: 3, color: '#ffffff', speed: 70, life: 0.25, size: 1.8, shape: 'spark', layer: e.lane, drag: 4 });
            }
            // Over the player's own creatures, now and then, the word for it: their blows are
            // "Effective!" (×1.5, they counter their target) or "Resisted" (×0.75, they are
            // countered) — the triangle named while it happens. Once per lane and kind every 5 s.
            if ((e.source === 'unit' || e.source === 'projectile') && e.mult !== 1 && e.team !== view.playerTeam && view.playerTeam >= 0 && !view.demo) {
              const kind = e.mult > 1 ? 0 : 1;
              const last = this.wordAt[e.lane];
              // (Never both words on top of each other in a mixed fight: 1.5 s between any two.)
              if (this.time - last[kind] > 5 && this.time - Math.max(last[0], last[1]) > 1.5) {
                last[kind] = this.time;
                this.fx.text(px, by - 26, kind === 0 ? 'Effective!' : 'Resisted', kind === 0 ? '#ffe27a' : '#a9b3c9', 13);
              }
            }
            // Melee blows ('unit' source) cut a slash across the target (one per target at a time).
            if (e.source === 'unit' && v && this.time - v.lastSlash > 0.2) {
              v.lastSlash = this.time;
              const dir = e.team === 0 ? -1 : 1; // the blow comes from the other side
              const r = (12 + v.radius * 0.6) * this.bodyScale(L.lanes[e.lane]);
              this.fx.timedFx({ kind: 'slash', x: px - dir * r * 0.2, y: by, x2: px - dir * r * 0.2 + dir, y2: by, dur: 0.22, layer: e.lane, size: r, color: e.mult > 1 ? '#ffe27a' : 'rgba(255,255,255,0.9)' });
            }
          }
          break;
        }
        case 'death': {
          const g = L.lanes[e.lane];
          const v = this.vis.get(e.unitId);
          const art = artFor(e.defId);
          const s = this.artScale(g) * art.scale;
          const x = laneX(g, e.x + this.fanOf(UNITS[e.defId], v?.seed));
          const y = g.y + (v ? v.yJit : 0) * g.band;
          this.ghosts.push({ defId: e.defId, team: e.team, lane: e.lane, x, y, s, flying: e.flying, t: 0, walk: v ? v.walk : 0, seed: v ? v.seed : 0 });
          const tc = TEAM_COLORS[e.team];
          const by = y - (art.height * 0.5 + art.fly) * s;
          this.fx.burst(x, by, { count: 12, color: tc.light, rgb: tc.rgb, speed: 50, life: 1.1, size: 2.4, shape: 'glow', layer: e.lane, gravity: -60, drag: 1.5, jitter: 14 * s });
          this.fx.burst(x, y - 4, { count: 8, color: 'rgba(60,45,40,0.6)', speed: 40, life: 0.8, size: 4 * s + 2, shape: 'smoke', layer: e.lane, gravity: -10 });
          this.deathFlourish(e.defId, x, by, e.lane, s);
          // The creature that dealt the blow shows its temper (Lens #77): the oni roars, the
          // redcap hops, the kitsune twirls — now and then, not at every kill of a long melee.
          const kv = this.vis.get(e.killer);
          if (kv && this.time >= kv.gestNext) {
            kv.gest = 1;
            kv.gestWait = 0;
            kv.gestNext = this.time + 4 + kv.seed * 3;
          }
          if (e.team !== view.playerTeam) {
            this.countRout(e.lane, world.time, x, g.y - 70 * this.bodyScale(g));
            this.fx.gold(x, by - art.height * 0.5 * s, e.gold, '#ffd76a', 15, 70 * this.bodyScale(g));
            // A coin flies to the gold counter (capped so big fights don't flood the screen).
            const target = this.coinTarget;
            if (target && this.fx.coinsInFlight < 8) {
              this.fx.coinsInFlight++;
              this.fx.timedFx({ kind: 'coin', x, y: by, x2: this.flipX(target[0]), y2: target[1], dur: 0.75 + Math.random() * 0.2, layer: 3, size: Math.max(0.8, L.ui) });
            }
          }
          this.vis.delete(e.unitId);
          break;
        }
        case 'veteran': {
          this.heroes.rise(e.team, e.defId, e.unitId);
          // A creature rises a veteran: a golden flare, and over the player's own the word for it.
          const g = L.lanes[e.lane];
          const v = this.vis.get(e.unitId);
          const x = v && !Number.isNaN(v.hx) ? v.hx : laneX(g, e.x);
          const y = v && !Number.isNaN(v.hy) ? v.hy : g.y - 30 * this.bodyScale(g);
          this.fx.timedFx({ kind: 'flashAt', x, y, dur: 0.5, layer: e.lane, size: 40 * this.bodyScale(g), rgb: [255, 215, 110] });
          this.fx.burst(x, y, { count: 14, color: '#ffd76a', rgb: [255, 215, 110], speed: 90, life: 0.8, size: 2.4, shape: 'glow', layer: e.lane, gravity: -70, drag: 2 });
          if (e.team === view.playerTeam && !view.demo) this.fx.text(x, y - 34 * this.bodyScale(g), 'Veteran!', '#ffd76a', 14);
          break;
        }
        case 'rebirth': {
          const g = L.lanes[e.lane];
          const x = laneX(g, e.x);
          const y = g.y - 40 * this.bodyScale(g);
          // A cocoon of flame flares around the bird before it bursts back to life.
          const v = this.vis.get(e.unitId);
          if (v) v.reborn = 1;
          this.fx.timedFx({ kind: 'flashAt', x, y, dur: 0.8, layer: e.lane, size: 70 * this.bodyScale(g), rgb: [255, 170, 60] });
          this.fx.burst(x, y, { count: 40, color: '#ffb347', rgb: [255, 160, 60], speed: 160, life: 1, size: 3, shape: 'glow', layer: e.lane, gravity: -80 });
          this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.7, layer: e.lane, size: 50 * this.bodyScale(g), color: '#ffcf70', rgb: [255, 190, 90] });
          break;
        }
        case 'impact': {
          const g = L.lanes[e.lane];
          projectileImpact(this.fx, e.kind, laneX(g, e.x + (this.projVis.get(e.id)?.fan ?? 0)), g.y, this.bodyScale(g), e.lane, e.splash, e.team);
          if (e.splash > 0) this.shake = Math.max(this.shake, 2);
          break;
        }
        case 'baseHit': {
          this.baseFlash[e.team] = 1;
          if (e.team === view.playerTeam) this.shake = Math.max(this.shake, 1.5);
          // Stone chips fly off the battered gate (throttled per lane).
          const key = e.team * 3 + e.lane;
          if (this.time - this.gateChips[key] > 0.25) {
            this.gateChips[key] = this.time;
            const gate = this.gateScreen(e.team, e.lane);
            const dir = e.team === 0 ? 1 : -1;
            const gy = gate.y - 18 * gate.s;
            this.fx.burst(gate.x, gy, { count: 6, color: '#cbbfae', speed: 140, life: 0.6, size: 2.6, shape: 'shard', layer: e.lane, gravity: 320, dir: dir > 0 ? -0.6 : Math.PI + 0.6, spread: 1.6 });
            this.fx.burst(gate.x, gy, { count: 3, color: 'rgba(90,80,75,0.5)', speed: 40, life: 0.8, size: 4 * gate.s + 2, shape: 'smoke', layer: e.lane, gravity: -20 });
          }
          break;
        }
        case 'ageUp': {
          this.ageFlash[e.team] = 1;
          const g = L.lanes[1];
          const x = e.team === 0 ? g.x0 - 40 * this.bodyScale(g) : g.x1 + 40 * this.bodyScale(g);
          const tc = TEAM_COLORS[e.team];
          this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 1.2, layer: 3, size: 300 * this.bodyScale(g), color: '#fff3c4', rgb: tc.rgb });
          this.fx.burst(x, g.y - 80 * this.bodyScale(g), { count: 70, color: '#fff3c4', rgb: [255, 230, 160], speed: 260, life: 1.6, size: 3.2, shape: 'glow', layer: 3, gravity: 40, drag: 1.4 });
          // A pillar of divine light rises over the keep.
          const far = L.lanes[0];
          const keepX = e.team === 0 ? L.field.x + (far.x0 - L.field.x) * 0.44 : L.field.x + L.field.w - (far.x0 - L.field.x) * 0.44;
          this.fx.timedFx({ kind: 'pillar', x: keepX, y: far.y, dur: 2.2, layer: 3, size: Math.max(40, (far.x0 - L.field.x) * 0.5), rgb: [255, 236, 180] });
          for (let i = 0; i < 24; i++) {
            this.fx.add({ x: keepX + (Math.random() - 0.5) * 40, y: far.y - Math.random() * 60, vy: -120 - Math.random() * 160, life: 1.4 + Math.random(), size: 2.2, color: '#fff6d8', rgb: [255, 240, 200], shape: 'glow', layer: 3 });
          }
          if (e.team === view.playerTeam) {
            this.fx.flash = 0.6;
            this.fx.flashColor = '255,244,214';
            this.setTheme(e.age);
          }
          break;
        }
        case 'shrine': {
          this.shrinePulse[e.lane] = 1;
          const g = L.lanes[e.lane];
          const x = laneX(g, SHRINE_X);
          const col = e.owner === -1 ? '#ffffff' : TEAM_COLORS[e.owner].light;
          const rgb: [number, number, number] = e.owner === -1 ? [255, 255, 255] : TEAM_COLORS[e.owner].rgb;
          this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.9, layer: e.lane, size: 90 * this.bodyScale(g), color: col, rgb });
          this.fx.burst(x, g.y - 30 * this.bodyScale(g), { count: 24, color: col, rgb, speed: 120, life: 1, size: 2.6, shape: 'glow', layer: e.lane, gravity: -30 });
          break;
        }
        case 'blessing': {
          // A blessing is felt on the field (Lens #58): Might and Vitality flare through every
          // creature of that side, Bastion lights its three gates. The foe's too, more softly.
          const rgb: [number, number, number] = e.blessing === 'might' ? [255, 170, 90] : e.blessing === 'vitality' ? [140, 255, 170] : [255, 230, 170];
          const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          const mine = e.team === view.playerTeam;
          const n = mine ? 12 : 6;
          if (e.blessing === 'bastion') {
            for (let lane = 0; lane < L.lanes.length; lane++) {
              const gate = this.gateScreen(e.team, lane);
              this.fx.timedFx({ kind: 'shockwave', x: gate.x, y: gate.y, dur: 0.9, layer: lane, size: (mine ? 90 : 60) * gate.s, color, rgb });
              this.fx.timedFx({ kind: 'flashAt', x: gate.x, y: gate.y - 40 * gate.s, dur: 0.7, layer: lane, size: 70 * gate.s, rgb });
              this.fx.burst(gate.x, gate.y - 40 * gate.s, { count: n * 2, color, rgb, speed: 110, life: 1.2, size: 3, shape: 'glow', layer: lane, gravity: -120, jitter: 26 * gate.s });
            }
          } else {
            let left = 40;
            for (const lane of world.lanes) {
              for (const u of lane) {
                if (!u.alive || u.team !== e.team || left-- <= 0) continue;
                const p = this.unitScreen(u, 1);
                const by = p.y - (p.art.body[1] * -1 + p.art.fly) * p.s;
                const r = (16 + u.def.radius) * p.s;
                this.fx.timedFx({ kind: 'shockwave', x: p.x, y: p.y, dur: 0.75, layer: u.lane, size: r * (mine ? 2.2 : 1.6), color, rgb });
                this.fx.timedFx({ kind: 'flashAt', x: p.x, y: by, dur: 0.5, layer: u.lane, size: r * 1.8, rgb });
                this.fx.burst(p.x, by, { count: n, color, rgb, speed: 90, life: 1.0, size: 3, shape: 'glow', layer: u.lane, gravity: -130, jitter: 12 * p.s });
              }
            }
          }
          break;
        }
        case 'turretBuilt': {
          const p = this.gateScreen(e.team, e.lane);
          this.fx.burst(p.x, p.y - 60 * p.s, { count: 18, color: '#ffe9b0', speed: 120, life: 0.7, size: 2.5, shape: 'glow', rgb: [255, 230, 170], layer: e.lane });
          this.fx.burst(p.x, p.y - 50 * p.s, { count: 10, color: 'rgba(120,100,80,0.6)', speed: 60, life: 0.8, size: 5, shape: 'smoke', layer: e.lane });
          break;
        }
        case 'power':
          this.onPowerCast(e.kind, e.team, e.lane);
          // Make it obvious which lane an enemy god power hits.
          if (e.team !== view.playerTeam) this.laneAlert[e.lane] = 1;
          // Your own cast is a god's moment: the rest of the field dims for an instant (Lens #67).
          else if (!view.demo) {
            this.focusLane = e.lane;
            this.focusT = 1;
          }
          break;
        case 'strike':
          this.onStrike(e.kind, e.team, e.lane, e.x, e.radius);
          break;
        case 'meteor': {
          const g = L.lanes[e.lane];
          const x = laneX(g, e.x);
          const fromX = x + (e.team === 0 ? -1 : 1) * L.field.h * 0.35;
          this.fx.timedFx({ kind: 'meteor', x, y: g.y - 6 * this.bodyScale(g), x2: fromX, y2: -40, dur: e.fall / this.speed, layer: 3, size: 9 * this.bodyScale(g) + 4, rgb: [255, 200, 120], color: '#ffd38a' });
          break;
        }
        case 'gameOver':
          this.collapse[e.winner === 0 ? 1 : 0] = 0;
          this.shake = 10;
          break;
        case 'ragnarok':
          this.fx.flash = 1;
          this.fx.flashColor = '255,80,40';
          this.shake = 8;
          break;
        case 'crumble':
          this.fx.flash = 0.6;
          this.fx.flashColor = '255,80,40';
          this.shake = 10;
          break;
        default:
          break;
      }
    }
  }

  /** Creature-specific debris when something dies (leaves, shards, feathers, embers...). */
  private deathFlourish(defId: string, x: number, y: number, lane: number, s: number): void {
    const B = (color: string, shape: 'leaf' | 'shard' | 'petal' | 'glow' | 'dot', count: number, gravity: number, rgb?: [number, number, number]) =>
      this.fx.burst(x, y, { count, color, rgb, speed: 110, life: 1.1, size: 3 * Math.max(0.7, s), shape, layer: lane, gravity, drag: 1.6, jitter: 10 * s });
    switch (defId) {
      case 'treant':
        B('#4f9442', 'leaf', 12, 120);
        B('#7c5836', 'shard', 5, 300);
        break;
      case 'pixie':
        B('#ffd6f0', 'glow', 14, -40, [255, 190, 240]);
        break;
      case 'redcap':
        B('#cc2b3d', 'petal', 4, 200);
        break;
      case 'minotaur':
      case 'centaur':
        B('#c8913a', 'shard', 6, 320);
        break;
      case 'gorgon':
        B('#5aa060', 'leaf', 8, 150);
        break;
      case 'jotunn':
        B('#cdeeff', 'shard', 14, 280);
        break;
      case 'fenrir':
      case 'byakko':
        B('#c9cfd8', 'dot', 10, 80);
        break;
      case 'valkyrie':
      case 'griffin':
        B('#f6f1e6', 'petal', 12, 60);
        break;
      case 'oni':
        B('#ff6a3a', 'glow', 10, -30, [255, 110, 60]);
        break;
      case 'kitsune':
        B('#bfe0ff', 'glow', 12, -60, [140, 200, 255]);
        break;
      case 'titan':
        B('#ece5d8', 'shard', 12, 300);
        B('#ffe7a0', 'glow', 8, -40, [255, 230, 160]);
        break;
      case 'phoenix':
      case 'dragon':
        B('#ffb347', 'glow', 18, -70, [255, 150, 50]);
        B('#3a3438', 'dot', 8, -20);
        break;
    }
  }

  /** The losing citadel crumbles: explosions, dust and a sinking keep. */
  private updateCollapse(dt: number): void {
    const L = this.layout;
    for (const team of [0, 1] as Team[]) {
      const c = this.collapse[team];
      if (c < 0 || c >= 1) continue;
      this.collapse[team] = Math.min(1, c + dt / 2.6);
      this.shake = Math.max(this.shake, 3 * (1 - c));
      if (Math.random() < dt * 14) {
        const far = L.lanes[0];
        const near = L.lanes[L.lanes.length - 1];
        const left = team === 0;
        // From the screen edge to the far lane's gate (the innermost one), mirrored per side.
        const x0 = left ? L.field.x : far.x1;
        const x1 = left ? far.x0 : L.field.x + L.field.w;
        const x = x0 + Math.random() * (x1 - x0);
        const y = L.horizon + Math.random() * (near.y - L.horizon);
        this.fx.burst(x, y, { count: 14, color: '#ffb35a', rgb: [255, 160, 70], speed: 200, life: 0.7, size: 3, shape: 'glow', layer: 3, gravity: 200 });
        this.fx.burst(x, y, { count: 6, color: 'rgba(70,60,60,0.6)', speed: 70, life: 1.4, size: 8, shape: 'smoke', layer: 3, gravity: -30 });
        this.fx.timedFx({ kind: 'flashAt', x, y, dur: 0.4, layer: 3, size: 70, rgb: [255, 190, 110] });
      }
    }
  }

  private onPowerCast(kind: string, team: Team, lane: number): void {
    const g = this.layout.lanes[lane];
    if (kind === 'fimbul') {
      // Blizzard sweep across the lane
      for (let i = 0; i < 70; i++) {
        this.fx.add({
          x: (team === 0 ? g.x0 : g.x1) + (Math.random() - 0.5) * 60,
          y: g.y - Math.random() * 90 * this.bodyScale(g),
          vx: (team === 0 ? 1 : -1) * (300 + Math.random() * 400),
          vy: 20 + Math.random() * 40,
          life: 1.6 + Math.random() * 1.2,
          size: 1.5 + Math.random() * 2.5,
          color: '#ffffff',
          shape: 'dot',
          layer: lane,
          drag: 0.6,
        });
      }
      this.fx.flash = 0.35;
      this.fx.flashColor = '200,235,255';
    } else if (kind === 'starfall' || kind === 'zeus') {
      this.fx.flash = 0.25;
      this.fx.flashColor = kind === 'zeus' ? '220,230,255' : '255,230,190';
    } else if (kind === 'briar') {
      this.fx.burst((g.x0 + g.x1) / 2, g.y, { count: 30, color: '#6aa84f', speed: 260, life: 1, size: 3, shape: 'leaf', layer: lane, gravity: 200, jitter: g.x1 - g.x0 });
    }
  }

  private onStrike(kind: string, _team: Team, lane: number, lx: number, radius: number): void {
    const g = this.layout.lanes[lane];
    const x = laneX(g, lx);
    const s = this.bodyScale(g);
    switch (kind) {
      case 'briar':
        this.fx.timedFx({ kind: 'vines', x, y: g.y + 2, dur: POWER_TIMING.briar.root / this.speed + 0.2, layer: lane, size: Math.max(14, radius * 2.2) * s * 1.1 });
        this.fx.burst(x, g.y - 6 * s, { count: 8, color: '#4e8f3a', speed: 120, life: 0.7, size: 2.5, shape: 'leaf', layer: lane, gravity: 260 });
        break;
      case 'zeus':
        this.fx.timedFx({ kind: 'scorch', x, y: g.y + 2, dur: 1.8, layer: lane, size: 22 * s, rgb: [170, 200, 255] });
        this.fx.timedFx({ kind: 'lightning', x, y: g.y - 4 * s, x2: x + (Math.random() - 0.5) * 80, y2: -20, dur: 0.35, layer: 3, size: 16 * s + 4, rgb: [170, 200, 255] });
        this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.5, layer: lane, size: 45 * s, color: '#dfe8ff', rgb: [170, 200, 255] });
        this.fx.burst(x, g.y - 6 * s, { count: 14, color: '#e8f0ff', speed: 220, life: 0.45, size: 2, shape: 'spark', layer: lane, drag: 3 });
        this.shake = Math.max(this.shake, 4);
        break;
      case 'fimbul':
        this.fx.timedFx({ kind: 'ice', x, y: g.y + 2, dur: POWER_TIMING.fimbul.freeze / this.speed, layer: lane, size: Math.max(12, radius * 1.6) * s * 1.15 });
        this.fx.burst(x, g.y - 10 * s, { count: 10, color: '#d8f3ff', speed: 140, life: 0.6, size: 2.5, shape: 'shard', layer: lane, gravity: 200 });
        break;
      case 'spiritdragon':
        this.fx.burst(x, g.y - 20 * s, { count: 16, color: '#7dffcf', rgb: [110, 255, 200], speed: 160, life: 0.7, size: 2.6, shape: 'glow', layer: lane, drag: 2.5 });
        break;
      case 'starfall':
        this.fx.timedFx({ kind: 'scorch', x, y: g.y + 2, dur: 2, layer: lane, size: radius * 1.6 * s, rgb: [255, 170, 90] });
        this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.6, layer: lane, size: radius * 2.4 * s, color: '#ffe3a0', rgb: [255, 200, 120] });
        this.fx.burst(x, g.y - 6 * s, { count: 26, color: '#ffcf7a', rgb: [255, 180, 90], speed: 260, life: 0.8, size: 3, shape: 'glow', layer: lane, gravity: 300, drag: 1.5 });
        this.fx.burst(x, g.y - 4 * s, { count: 10, color: 'rgba(90,60,50,0.6)', speed: 90, life: 1, size: 6 * s + 2, shape: 'smoke', layer: lane, gravity: -20 });
        this.shake = Math.max(this.shake, 6);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  render(world: World, alpha: number, dt: number, view: ViewState): void {
    const ctx = this.ctx;
    const L = this.layout;
    this.time += dt;
    this.frameDt = dt;
    this.fx.update(dt);
    this.themeFade = Math.min(1, this.themeFade + dt / 1.6);
    if (this.themeFade >= 1 && this.prevTheme >= 0) {
      // Cross-fade done: let the old full-screen backdrop go.
      this.bgCache.delete(this.prevTheme);
      this.prevTheme = -1;
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    for (let i = 0; i < 2; i++) {
      this.baseFlash[i] = Math.max(0, this.baseFlash[i] - dt * 4);
      this.ageFlash[i] = Math.max(0, this.ageFlash[i] - dt * 0.8);
    }
    for (let i = 0; i < 3; i++) {
      this.shrinePulse[i] = Math.max(0, this.shrinePulse[i] - dt * 1.5);
      this.laneAlert[i] = Math.max(0, this.laneAlert[i] - dt * 0.7);
      this.lanePingT[i] = Math.max(0, this.lanePingT[i] - dt * 0.35);
    }
    this.ragnarok += ((world.ragnarokStarted ? 1 : 0) - this.ragnarok) * Math.min(1, dt * 0.8);
    this.winner = world.winner;
    this.updateCollapse(dt);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // A paused frame is a still: no shake (it would never decay at dt = 0).
    const sh = this.shakeEnabled && dt > 0 ? this.shake : 0;
    const shx = sh > 0 ? (Math.random() - 0.5) * sh : 0;
    const shy = sh > 0 ? (Math.random() - 0.5) * sh : 0;
    ctx.translate(shx, shy);
    if (this.cinematic) {
      // Title screen: a slow, gentle camera drift (slight zoom hides the edges).
      // Zoom just enough that the drift (±10 px across, ±4 px up/down) never bares an edge.
      const z = Math.max(1.025, 1 + 24 / L.width, 1 + 10 / L.height);
      ctx.translate(L.width / 2 + Math.sin(this.time * 0.11) * 10, L.height / 2 + Math.sin(this.time * 0.083) * 4);
      ctx.scale(z, z);
      ctx.translate(-L.width / 2, -L.height / 2);
    }
    if (this.mirror) {
      ctx.translate(2 * L.field.x + L.field.w, 0);
      ctx.scale(-1, 1);
    }

    // Backdrop (cross-fading between ages)
    if (!this.skip.has('bg')) {
      // 1:1 blits (no resampling); during screen shake the few exposed edge pixels are pre-filled.
      // (Sky colour above the horizon: ground colour there flickered as a light band atop the
      // dark Asgard and Celestial skies.)
      if (sh > 0) {
        const th = THEMES[this.theme];
        ctx.fillStyle = th.sky[0];
        ctx.fillRect(-sh, -sh, L.width + sh * 2, L.horizon + sh);
        ctx.fillStyle = th.ground[1];
        ctx.fillRect(-sh, L.horizon, L.width + sh * 2, L.height - L.horizon + sh);
      }
      if (this.prevTheme >= 0 && this.themeFade < 1) {
        ctx.drawImage(this.background(this.prevTheme), 0, 0, L.width, L.height);
        ctx.globalAlpha = this.themeFade;
      }
      ctx.drawImage(this.background(this.theme), 0, 0, L.width, L.height);
      ctx.globalAlpha = 1;
    }
    if (!this.skip.has('ambient')) {
      this.drawSky(ctx);
      this.drawAmbient(ctx, dt);
    }

    const simTime = world.time - (1 - alpha) * TICK;

    // Citadel keeps (behind the lanes)
    for (const team of [0, 1] as Team[]) {
      if (this.skip.has('keep')) break;
      const p = world.players[team];
      const collapse = Math.max(0, this.collapse[team]);
      if (collapse > 0) {
        drawCitadelKeep(ctx, L, team, p.age, p.baseHp / p.baseMaxHp, this.time, this.baseFlash[team], this.ageFlash[team], collapse);
      } else {
        const c = this.keepLayer(team, p.age);
        ctx.drawImage(c.canvas, c.x, 0, c.w, L.height);
        drawCitadelKeep(ctx, L, team, p.age, p.baseHp / p.baseMaxHp, this.time, this.baseFlash[team], this.ageFlash[team], 0, 'dynamic');
        if (this.sigils[team] >= 0) this.drawSigil(ctx, team, p.age);
      }
    }

    this.hover = null;
    // Desktop: hover. Touch: press-and-hold sets view.inspect.
    const pointer = view.targeting !== 'none' ? null : (view.inspect ?? (L.mode === 'desktop' ? (view.mouse ?? null) : null));
    this.mouseRef = pointer && this.mirror ? { x: this.flipX(pointer.x), y: pointer.y } : pointer;

    // Lanes far → near
    for (let lane = 0; lane < L.lanes.length; lane++) {
      const g = L.lanes[lane];
      if (!this.skip.has('highlight')) this.drawLaneHighlight(ctx, g, view);
      if (!this.skip.has('reach')) this.drawReach(ctx, world, g);
      if (!this.skip.has('shrine')) this.drawShrine(ctx, world, g);
      for (const team of [0, 1] as Team[]) {
        if (this.skip.has('gates')) break;
        const p = world.players[team];
        const gate = this.gateScreen(team, lane);
        const collapse = Math.max(0, this.collapse[team]);
        if (collapse > 0) {
          drawCitadelGate(ctx, L, team, lane, p.age, gate.x, gate.y, gate.s, this.baseFlash[team], this.time, collapse);
        } else {
          const c = this.gateLayer(team, lane, p.age);
          ctx.drawImage(c.canvas, c.x, c.y, c.w, c.h);
          drawCitadelGate(ctx, L, team, lane, p.age, gate.x, gate.y, gate.s, this.baseFlash[team], this.time, 0, 'dynamic', this.emergeAt(world, team, lane));
        }
      }
      this.fx.drawTimed(ctx, lane, 'ground');
      this.drawUnits(ctx, world, lane, alpha, simTime, dt);
      this.fx.drawTimed(ctx, lane, 'over');
      for (const team of [0, 1] as Team[]) {
        const slot = world.players[team].turrets[lane];
        if (slot.def) {
          const gate = this.gateScreen(team, lane);
          // A crumbling citadel's turrets sink with their gate towers (same clip and drop).
          const collapse = Math.max(0, this.collapse[team]);
          if (collapse > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, -10000, L.width, gate.y + g.band * 0.5 + 10000);
            ctx.clip();
            ctx.translate(0, collapse * collapse * 60 * gate.s);
          }
          drawTurret(ctx, slot.def.id, team, gate.x, gate.y, g.band, gate.s, slot, simTime, laneX(g, slot.aimX));
          if (collapse > 0) ctx.restore();
        }
      }
      this.drawProjectiles(ctx, world, lane, alpha);
      this.fx.drawParticles(ctx, lane);
      this.drawPowers(ctx, world, lane);
      if (!this.skip.has('leysight')) this.drawLeySight(ctx, world, lane, view);
    }

    if (this.focusT > 0) this.drawFocus(ctx);

    // Forget visuals of projectiles that no longer exist.
    if (this.projVis.size > world.projectiles.length) {
      const live = new Set<number>();
      for (const pr of world.projectiles) live.add(pr.id);
      for (const id of this.projVis.keys()) if (!live.has(id)) this.projVis.delete(id);
    }
    // Landing spots are only needed for the frame a bounce leaves from them.
    if (this.aimAt.size > 64) this.aimAt.clear();
    this.fx.drawTimed(ctx, 3);
    this.fx.drawParticles(ctx, 3);
    // Writing must read left to right: on a mirrored battlefield, texts are drawn unmirrored
    // at the mirrored spot.
    if (this.mirror) {
      ctx.save();
      ctx.translate(2 * L.field.x + L.field.w, 0);
      ctx.scale(-1, 1);
    }
    this.fx.drawTexts(ctx, Math.max(0.8, L.ui), (x) => this.flipX(x));
    const hv = this.hover as Renderer['hover'];
    if (hv) this.drawHoverLabel(ctx, hv.unit, this.flipX(hv.x), hv.top, view);
    if (this.mirror) ctx.restore();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ragnarok > 0.01) {
      ctx.fillStyle = `rgba(150, 20, 10, ${0.16 * this.ragnarok})`;
      ctx.fillRect(0, 0, L.width, L.height);
      this.drawEmbers(ctx, dt);
    }
    if (this.vignette && !this.skip.has('vignette')) ctx.drawImage(this.vignette, 0, 0, L.width, L.height);
    if (this.fx.flash > 0) {
      ctx.fillStyle = `rgba(${this.fx.flashColor},${Math.min(0.85, this.fx.flash * 0.7)})`;
      ctx.fillRect(0, 0, L.width, L.height);
    }
    if (view.paused) {
      ctx.fillStyle = 'rgba(10, 6, 24, 0.35)';
      ctx.fillRect(0, 0, L.width, L.height);
    }
  }

  /** Live sky details: a shimmering aurora (Asgard) and twinkling stars on night themes. */
  private drawSky(ctx: CanvasRenderingContext2D): void {
    // During an age change the old sky's aurora and stars fade out with its backdrop.
    const fading = this.prevTheme >= 0 && this.themeFade < 1;
    if (fading) this.drawSkyOf(ctx, this.prevTheme, 1 - this.themeFade);
    this.drawSkyOf(ctx, this.theme, fading ? this.themeFade : 1);
    if (!fading && this.quality !== 'low') this.drawTraveller(ctx);
  }

  /**
   * A world bigger than the battlefield (Lens #74): now and then something crosses the far sky,
   * never touching the battle — a will-o'-wisp over the Fae Wilds, an eagle over Olympus, Odin's
   * two ravens over Asgard, a long sky dragon over the Jade Empire, a comet in the Celestial
   * realm. One every 30–55 s, 14 s to cross, alternating directions.
   */
  private drawTraveller(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const tr = this.traveller;
    if (this.time < tr.next) return;
    const k = (this.time - tr.next) / 14;
    if (k >= 1) {
      tr.next = this.time + 30 + Math.random() * 25;
      tr.dir = -tr.dir;
      tr.y = 0.5 + Math.random() * 0.3;
      return;
    }
    const x = tr.dir > 0 ? -60 + k * (L.width + 120) : L.width + 60 - k * (L.width + 120);
    const y = L.horizon * tr.y + Math.sin(k * 9) * L.horizon * 0.03;
    const s = Math.max(1, L.horizon / 150);
    const fade = Math.min(1, k * 6, (1 - k) * 6);
    const t = this.time;
    ctx.save();
    ctx.globalAlpha = 0.55 * fade;
    ctx.strokeStyle = ctx.fillStyle = 'rgba(20, 14, 30, 0.85)';
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    const bird = (bx: number, by: number, size: number, flap: number) => {
      const w = Math.sin(flap) * 0.6;
      ctx.beginPath();
      ctx.moveTo(bx - size, by - size * w);
      ctx.quadraticCurveTo(bx - size * 0.4, by - size * 0.2, bx, by);
      ctx.quadraticCurveTo(bx + size * 0.4, by - size * 0.2, bx + size, by - size * w);
      ctx.stroke();
    };
    switch (THEMES[this.theme].id) {
      case 'fae':
        ctx.globalAlpha = fade;
        drawGlow(ctx, x, y + Math.sin(t * 3) * 6 * s, 10 * s, [170, 255, 190], 0.7);
        break;
      case 'olympus':
        bird(x, y, 9 * s, t * 5);
        break;
      case 'asgard':
        bird(x, y, 6 * s, t * 7);
        bird(x - tr.dir * 16 * s, y + 7 * s, 6 * s, t * 7 + 1.3);
        break;
      case 'jade':
        for (let i = 0; i < 14; i++) {
          const px = x - tr.dir * i * 6 * s;
          const py = y + Math.sin(t * 2 + i * 0.6) * 5 * s;
          ctx.beginPath();
          ctx.arc(px, py, (3.2 - i * 0.18) * s, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      default: {
        ctx.globalAlpha = fade * 0.9;
        const g = ctx.createLinearGradient(x, y, x - tr.dir * 70 * s, y - 14 * s);
        g.addColorStop(0, 'rgba(255, 244, 210, 0.9)');
        g.addColorStop(1, 'rgba(255, 244, 210, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - tr.dir * 70 * s, y - 14 * s);
        ctx.stroke();
        drawGlow(ctx, x, y, 7 * s, [255, 240, 200], 0.9);
      }
    }
    ctx.restore();
  }

  private drawSkyOf(ctx: CanvasRenderingContext2D, themeIndex: number, vis: number): void {
    const L = this.layout;
    const theme = THEMES[themeIndex];
    if (theme.aurora) {
      this.aurora ??= renderAurora(L, Math.min(this.dpr, 1.5));
      const sway = Math.sin(this.time * 0.15) * L.width * 0.03;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = vis * (0.55 + 0.35 * Math.sin(this.time * 0.4));
      ctx.drawImage(this.aurora, sway, 0, L.width, L.horizon);
      ctx.globalAlpha = vis * (0.3 + 0.25 * Math.sin(this.time * 0.27 + 2));
      ctx.drawImage(this.aurora, -sway * 1.6 + L.width * 0.05, L.horizon * 0.06, L.width, L.horizon * 0.94);
      ctx.restore();
    }
    if (theme.stars > 0.3) {
      if (this.twinkles.length === 0) {
        for (let i = 0; i < 18; i++) this.twinkles.push({ x: Math.random() * L.width, y: Math.pow(Math.random(), 1.5) * L.horizon * 0.75, p: Math.random() * 10, s: 0.6 + Math.random() * 0.9 });
      }
      for (const st of this.twinkles) {
        const a = Math.max(0, Math.sin(this.time * (1.2 + st.s) + st.p)) ** 3 * theme.stars * vis;
        if (a < 0.02) continue;
        drawGlow(ctx, st.x, st.y, 5 * st.s, [255, 255, 255], a * 0.8);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fillRect(st.x - 0.6, st.y - 2.5 * st.s, 1.2, 5 * st.s);
        ctx.fillRect(st.x - 2.5 * st.s, st.y - 0.6, 5 * st.s, 1.2);
      }
    }
  }

  /** Ragnarök: embers drift up across the whole battlefield. */
  private drawEmbers(ctx: CanvasRenderingContext2D, dt: number): void {
    const L = this.layout;
    const want = Math.round((L.mode === 'mobile' ? 25 : 50) * this.ragnarok * (this.quality === 'low' ? 0.5 : 1));
    while (this.embers.length < want) {
      this.embers.push({ x: Math.random() * L.width, y: L.height + Math.random() * 40, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50, life: 4 + Math.random() * 4 });
    }
    for (const e of this.embers) {
      e.life -= dt;
      e.x += (e.vx + Math.sin(this.time * 2 + e.y * 0.02) * 12) * dt;
      e.y += e.vy * dt;
      const a = Math.min(1, e.life * 0.5) * this.ragnarok;
      drawGlow(ctx, e.x, e.y, 6, [255, 120, 40], 0.6 * a);
      circle(ctx, e.x, e.y, 1.3, `rgba(255, 210, 140, ${a.toFixed(3)})`);
    }
    this.embers = this.embers.filter((e) => e.life > 0 && e.y > -20);
  }

  private drawAmbient(ctx: CanvasRenderingContext2D, dt: number): void {
    const L = this.layout;
    const fading = this.prevTheme >= 0 && this.themeFade < 1;
    const want = (L.mode === 'mobile' ? 22 : 45) * (this.quality === 'low' ? 0.5 : 1);
    let current = 0;
    for (const a of this.ambient) if (a.th === this.theme) current++;
    for (; current < want; current++) {
      const falls = THEMES[this.theme].ambient === 'snow' || THEMES[this.theme].ambient === 'petals';
      this.ambient.push({
        x: Math.random() * L.width,
        y: falls ? Math.random() * L.height : L.horizon + Math.random() * (L.height - L.horizon),
        p: Math.random() * 100,
        s: 0.6 + Math.random() * 0.8,
        th: this.theme,
      });
    }
    const t = this.time;
    for (const a of this.ambient) {
      // During an age change the old age's particles fade out while the new age's fade in.
      const old = a.th !== this.theme;
      const alpha = old ? (fading ? 1 - this.themeFade : 0) : fading ? this.themeFade : 1;
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      const theme = THEMES[a.th];
      a.p += dt;
      switch (theme.ambient) {
        case 'fireflies':
          a.x += Math.sin(a.p * 0.7) * 12 * dt;
          a.y += Math.cos(a.p * 0.5) * 8 * dt;
          drawGlow(ctx, a.x, a.y, 7 * a.s, [246, 255, 158], 0.35 + 0.35 * Math.sin(a.p * 2.3));
          break;
        case 'motes':
          a.x += 6 * dt;
          a.y -= 4 * dt;
          drawGlow(ctx, a.x, a.y, 4 * a.s, [255, 243, 200], 0.25 + 0.15 * Math.sin(a.p * 1.7));
          break;
        case 'snow':
          a.x += (Math.sin(a.p * 0.8) * 14 - 10) * dt;
          a.y += 26 * a.s * dt;
          circle(ctx, a.x, a.y, 1.4 * a.s, 'rgba(255,255,255,0.8)');
          break;
        case 'petals':
          a.x += (Math.sin(a.p * 0.9) * 20 + 14) * dt;
          a.y += 18 * a.s * dt;
          ctx.save();
          ctx.translate(a.x, a.y);
          ctx.rotate(a.p * 1.5);
          ellipse(ctx, 0, 0, 3.2 * a.s, 1.8 * a.s, 'rgba(255, 190, 214, 0.85)');
          ctx.restore();
          break;
        case 'stardust':
          a.y -= 6 * dt;
          a.x += Math.sin(a.p) * 5 * dt;
          drawGlow(ctx, a.x, a.y, 5 * a.s, [255, 242, 184], 0.3 + 0.3 * Math.sin(a.p * 3 + t));
          break;
      }
      if (a.x < -20 || a.x > L.width + 20 || a.y < -20 || a.y > L.height + 20) {
        a.x = Math.random() * L.width;
        a.y = theme.ambient === 'snow' || theme.ambient === 'petals' ? -10 : L.horizon + Math.random() * (L.height - L.horizon);
      }
    }
    ctx.globalAlpha = 1;
    if (!fading && current < this.ambient.length) this.ambient = this.ambient.filter((a) => a.th === this.theme);
  }

  /** Co-op: an ally called for help in this lane. */
  pingLane(lane: number): void {
    if (lane >= 0 && lane < this.lanePingT.length) this.lanePingT[lane] = 1;
  }

  private drawLaneHighlight(ctx: CanvasRenderingContext2D, g: LaneGeom, view: ViewState): void {
    const ping = this.lanePingT[g.index];
    if (ping > 0) {
      const a = ping * (0.2 + 0.18 * Math.sin(this.time * 10));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 210, 90, ${Math.max(0, a).toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(g.x0 - g.band, g.y - g.band * 0.5, g.x1 - g.x0 + g.band * 2, g.band * 1.05, g.band * 0.5);
      ctx.fill();
      ctx.restore();
    }
    const alert = this.laneAlert[g.index];
    if (alert > 0) {
      // Pulsing red band over a lane targeted by an enemy god power.
      const a = alert * (0.25 + 0.2 * Math.sin(this.time * 18));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 70, 90, ${Math.max(0, a).toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(g.x0 - g.band, g.y - g.band * 0.5, g.x1 - g.x0 + g.band * 2, g.band * 1.05, g.band * 0.5);
      ctx.fill();
      ctx.restore();
    }
    const tc = TEAM_COLORS[view.playerTeam];
    const selected = g.index === view.selectedLane;
    const hovered = g.index === view.hoverLane;
    let a = 0;
    if (view.targeting === 'none') a = selected ? 0.22 : hovered ? 0.1 : 0;
    else a = hovered ? 0.4 : 0.14 + 0.06 * Math.sin(this.time * 5);
    if (a <= 0) return;
    const col = view.targeting === 'power' ? [255, 214, 110] : tc.rgb;
    const x0 = g.x0 - g.band;
    const x1 = g.x1 + g.band;
    const y0 = g.y - g.band * 0.5;
    const h = g.band * 1.05;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Gradients are cached per lane and colour; the pulse is applied through globalAlpha.
    const key = `${g.index}:${col.join(',')}`;
    let grad = this.gradCache.get(key);
    if (!grad) {
      grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
      grad.addColorStop(0, `rgba(${col.join(',')},0)`);
      grad.addColorStop(0.5, `rgba(${col.join(',')},1)`);
      grad.addColorStop(1, `rgba(${col.join(',')},0)`);
      this.gradCache.set(key, grad);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, h, h / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Chevrons flowing toward the enemy
    if (selected && view.targeting === 'none') {
      const dir = view.playerTeam === 0 ? 1 : -1;
      const spacing = 70 * g.s;
      const off = (this.time * 40 * g.s) % spacing;
      ctx.strokeStyle = `rgba(${col.join(',')},0.35)`;
      ctx.lineWidth = Math.max(1.5, 3 * g.s);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let x = g.x0 + off; x < g.x1; x += spacing) {
        const cx = dir === 1 ? x : g.x1 - (x - g.x0);
        const fade = Math.sin(((x - g.x0) / (g.x1 - g.x0)) * Math.PI);
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.moveTo(cx - dir * 6 * g.s, g.y - 7 * g.s);
        ctx.lineTo(cx + dir * 2 * g.s, g.y);
        ctx.lineTo(cx - dir * 6 * g.s, g.y + 7 * g.s);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Where each gate's defences reach (its ward, or a longer-ranged turret): a faint dashed line
   * across the lane in the owner's colour, brighter while foes stand inside it. Pushing past that
   * line is pushing into fire. (Wards fall silent in Ragnarök; then only turrets count.)
   */
  private drawReach(ctx: CanvasRenderingContext2D, world: World, g: LaneGeom): void {
    const lane = g.index;
    // A lane told to hold the line: a war banner planted where its creatures stop.
    for (const team of [0, 1] as Team[]) {
      if (!world.players[team].hold[lane]) continue;
      const s = this.artScale(g);
      const x = laneX(g, team === 0 ? SHRINE_X + HOLD_PAST_SHRINE : LANE_LENGTH - SHRINE_X - HOLD_PAST_SHRINE);
      const top = g.y - g.band * 0.3 - 44 * s;
      const dir = team === 0 ? 1 : -1;
      const wave = Math.sin(this.time * 4 + lane) * 3 * s;
      ctx.save();
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = Math.max(1.5, 2.2 * s);
      ctx.beginPath();
      ctx.moveTo(x, g.y - g.band * 0.3);
      ctx.lineTo(x, top);
      ctx.stroke();
      ctx.fillStyle = TEAM_COLORS[team].main;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.quadraticCurveTo(x - dir * 10 * s, top + 6 * s + wave, x - dir * 20 * s, top + 4 * s + wave);
      ctx.lineTo(x - dir * 14 * s, top + 10 * s + wave * 0.5);
      ctx.lineTo(x - dir * 20 * s, top + 16 * s + wave);
      ctx.quadraticCurveTo(x - dir * 10 * s, top + 18 * s + wave, x, top + 14 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const team of [0, 1] as Team[]) {
      const turret = world.players[team].turrets[lane].def;
      const reach = Math.max(world.ragnarokStarted ? 0 : WARD.range, turret ? turret.range : 0);
      if (reach <= 0) continue;
      let hot = false;
      for (const u of world.lanes[lane]) {
        if (!u.alive || u.team === team) continue;
        const d = team === 0 ? u.x - u.def.radius : LANE_LENGTH - (u.x + u.def.radius);
        if (d <= reach) hot = true;
      }
      const x = laneX(g, team === 0 ? reach : LANE_LENGTH - reach);
      const half = g.band * 0.38;
      ctx.save();
      ctx.globalAlpha = hot ? 0.6 + 0.2 * Math.sin(this.time * 8) : 0.3;
      ctx.strokeStyle = TEAM_COLORS[team].main;
      ctx.lineWidth = Math.max(2, 3 * this.artScale(g));
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x, g.y - half);
      ctx.lineTo(x, g.y + half);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Ley sight: holding a lane's shrine shows the foe's summons waiting for that lane — small
   * portraits above their gate, the one in training with a progress ring. Information is part of
   * what the shrine is worth.
   */
  private drawLeySight(ctx: CanvasRenderingContext2D, world: World, lane: number, view: ViewState): void {
    const me = view.playerTeam;
    if (view.playerTeam < 0 || world.shrines[lane].owner !== me) return;
    const foe: Team = me === 0 ? 1 : 0;
    const p = world.players[foe];
    const training = world.trainingIndex(foe, lane);
    const gate = this.gateScreen(foe, lane);
    const toField = foe === 0 ? 1 : -1;
    const r = Math.max(4, 15 * gate.s);
    let k = 0;
    for (let i = 0; i < p.queue.length && k < 3; i++) {
      const q = p.queue[i];
      if (q.lane !== lane) continue;
      const def = UNITS[q.unitId];
      const x = gate.x + toField * (34 + k * 2.3 * r) * gate.s;
      const y = gate.y - 40 * gate.s;
      ctx.save();
      ctx.globalAlpha = 0.9;
      circle(ctx, x, y, r, 'rgba(18, 10, 32, 0.8)');
      ctx.lineWidth = Math.max(1.5, 2 * gate.s);
      ctx.strokeStyle = 'rgba(255, 215, 106, 0.85)';
      ctx.stroke();
      if (i === training) {
        ctx.strokeStyle = TEAM_COLORS[foe].main;
        ctx.lineWidth = Math.max(2, 3 * gate.s);
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5 * gate.s, -Math.PI / 2, -Math.PI / 2 + (p.trainProgress[lane] / def.trainTime) * TAU);
        ctx.stroke();
      }
      // The creature itself (facing the player's side, whichever way the field is drawn).
      ctx.beginPath();
      ctx.arc(x, y, r - 1, 0, TAU);
      ctx.clip();
      const art = artFor(def.id);
      const sc = (r * 1.6) / Math.max(36, art.height + 6);
      ctx.translate(x, y + r * 0.75);
      ctx.scale(foe === 1 ? -sc : sc, sc);
      art.draw(ctx, { t: this.time, walk: 0, moving: false, attack: -1, hit: 0.5, tc: TEAM_COLORS[foe], seed: 0.3, enraged: false, charged: false });
      ctx.restore();
      k++;
    }
  }

  private drawShrine(ctx: CanvasRenderingContext2D, world: World, g: LaneGeom): void {
    const s = world.shrines[g.index];
    const x = laneX(g, SHRINE_X);
    const y = g.y;
    const sc = this.artScale(g);
    const owner = s.owner;
    const col: [number, number, number] = owner === -1 ? [235, 230, 255] : TEAM_COLORS[owner].rgb;
    const capCol = s.capture < 0 ? TEAM_COLORS[0] : TEAM_COLORS[1];
    const pulse = this.shrinePulse[g.index];
    const bob = Math.sin(this.time * 2 + g.index) * 2 * sc;
    // A held shrine sheds a golden glint now and then: it is paying its owner.
    if (owner !== -1 && this.time - this.shrineGlint[g.index] > 1.6) {
      this.shrineGlint[g.index] = this.time + Math.random() * 0.8;
      this.fx.add({ x: x + (Math.random() - 0.5) * 8 * sc, y: y - 44 * sc, vy: -26, life: 1.1, size: 2.4, color: '#ffd76a', rgb: [255, 215, 106], shape: 'glow', layer: g.index });
    }
    // Ley Surge: a flickering omen, then a pillar of golden light pouring out of the shrine.
    const surge = world.surge?.lane === g.index ? world.surge : null;
    if (surge) {
      const live = world.time >= surge.start;
      const k = live ? 0.75 + 0.15 * Math.sin(this.time * 5) : 0.25 + 0.2 * Math.max(0, Math.sin(this.time * 7));
      const top = y - 190 * sc;
      const bw = (live ? 16 : 9) * sc;
      const grad = ctx.createLinearGradient(0, y, 0, top);
      grad.addColorStop(0, `rgba(255,220,120,${0.55 * k})`);
      grad.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - bw, y);
      ctx.lineTo(x - bw * 0.4, top);
      ctx.lineTo(x + bw * 0.4, top);
      ctx.lineTo(x + bw, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      drawGlow(ctx, x, y - 6 * sc, 44 * sc, [255, 215, 106], 0.35 * k);
      if (live && this.time - this.surgeMote[g.index] > 0.07) {
        this.surgeMote[g.index] = this.time;
        this.fx.add({ x: x + (Math.random() - 0.5) * 40 * sc, y: y - Math.random() * 10 * sc, vy: -40 - Math.random() * 30, life: 1.4, size: 2.2, color: '#ffd76a', rgb: [255, 215, 106], shape: 'glow', layer: g.index });
      }
    }
    // Capture radius hint
    const rx = (SHRINE_RADIUS / LANE_LENGTH) * (g.x1 - g.x0);
    ctx.save();
    ctx.globalAlpha = 0.18 + (s.contested ? 0.15 * Math.sin(this.time * 10) : 0);
    ctx.strokeStyle = `rgb(${col.join(',')})`;
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, g.band * 0.42, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    // Obelisk
    const h = 34 * sc;
    const w = 7 * sc;
    drawGlow(ctx, x, y - h * 0.6 + bob, 26 * sc * (1 + pulse), col, owner === -1 ? 0.25 : 0.55 + 0.15 * Math.sin(this.time * 3));
    ctx.fillStyle = '#3d3552';
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.7, y - h * 0.75);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + w * 0.7, y - h * 0.75);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5b5277';
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.7, y - h * 0.75);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    // Floating crystal
    const cy = y - h - 9 * sc + bob;
    ctx.fillStyle = `rgb(${col.join(',')})`;
    ctx.beginPath();
    ctx.moveTo(x, cy - 7 * sc);
    ctx.lineTo(x + 4 * sc, cy);
    ctx.lineTo(x, cy + 7 * sc);
    ctx.lineTo(x - 4 * sc, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(x, cy - 7 * sc);
    ctx.lineTo(x - 4 * sc, cy);
    ctx.lineTo(x, cy);
    ctx.closePath();
    ctx.fill();
    // Rune on the obelisk
    ctx.strokeStyle = `rgba(${col.join(',')},0.9)`;
    ctx.lineWidth = Math.max(1, 1.2 * sc);
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.65);
    ctx.lineTo(x, y - h * 0.25);
    ctx.moveTo(x - 2.5 * sc, y - h * 0.55);
    ctx.lineTo(x + 2.5 * sc, y - h * 0.4);
    ctx.stroke();
    // Capture progress ring
    const prog = Math.abs(s.capture);
    if (prog > 0.01 && prog < 0.999) {
      ctx.strokeStyle = capCol.main;
      ctx.lineWidth = Math.max(2, 3 * sc);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, cy, 12 * sc, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
      ctx.stroke();
    }
  }

  private drawUnits(ctx: CanvasRenderingContext2D, world: World, lane: number, alpha: number, simTime: number, dt: number): void {
    const g = this.layout.lanes[lane];
    const list = world.lanes[lane];
    // Ensure visual state
    for (const u of list) {
      if (!u.alive) continue;
      let v = this.vis.get(u.id);
      if (!v) {
        const seed = ((u.id * 2654435761) >>> 0) / 4294967296;
        // Creatures already out on the field (a continued battle, which starts paused, or a
        // fast-forwarded one) are fully there; only fresh summons fade and grow in.
        const spawn = Math.min(1, Math.max(0, (simTime - u.bornAt) / SPAWN_TIME));
        v = { walk: seed * TAU, lastX: u.x, flash: 0, spawn, yJit: (seed - 0.5) * 0.36, seed, hpShown: u.hp, hpAlpha: 0, frozenFx: 0, lastHp: u.hp, healAcc: 0, lastSlash: -1, reborn: 0, frozen: null, hx: NaN, hy: NaN, radius: u.def.radius, gest: 0, gestNext: 0, gestWait: 0, step: Math.floor((seed * TAU) / Math.PI) };
        this.vis.set(u.id, v);
      }
    }
    // Ground creatures first, then flyers; back (smaller y) first.
    const sorted = this.sortBuf;
    sorted.length = 0;
    for (const u of list) {
      if (!u.alive) continue;
      // Sort key: flyers above ground creatures, then back-to-front by depth jitter.
      u.renderKey = (u.flying ? 10 : 0) + this.vis.get(u.id)!.yJit;
      sorted.push(u);
    }
    sorted.sort((a, b) => a.renderKey - b.renderKey);
    // Shadows (screen positions are kept for the creature pass below)
    const screens = this.screenBuf;
    screens.length = 0;
    for (const u of sorted) {
      const p = this.unitScreen(u, alpha);
      screens.push(p);
      const r = u.def.radius * this.bodyScale(g) * (u.flying ? 0.8 : 1.05);
      ellipse(ctx, p.x, p.y + 1, r, r * 0.3, u.flying ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.25)');
      const tc = TEAM_COLORS[u.team];
      ctx.strokeStyle = tc.main;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, 1.6 * this.bodyScale(g));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, r * 1.05, r * 0.32, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < sorted.length; i++) this.drawUnit(ctx, sorted[i], screens[i], alpha, simTime, dt, g);
    // Ghosts
    for (const gh of this.ghosts) if (gh.lane === lane) this.drawGhost(ctx, gh, dt);
    if (lane === this.layout.lanes.length - 1) this.ghosts = this.ghosts.filter((gh) => gh.t < DEATH_TIME);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit, p: ReturnType<Renderer['unitScreen']>, alpha: number, simTime: number, dt: number, g: LaneGeom): void {
    const v = this.vis.get(u.id)!;
    const art = p.art;
    v.hx = p.x;
    v.hy = p.y - (-art.body[1] + art.fly) * p.s;
    const xi = u.px + (u.x - u.px) * alpha;
    v.walk += Math.abs(xi - v.lastX) * 0.24;
    v.lastX = xi;
    // Footfalls (Lens #83): creatures belong to the ground they cross — guardians thud up a puff
    // of the lane's own earth (or snow, or cloud) at every step, runners a wisp of it.
    const step = Math.floor(v.walk / Math.PI);
    if (step !== v.step) {
      v.step = step;
      const heavy = u.def.cls === 'guardian';
      if (!u.flying && (heavy || u.def.cls === 'hunter') && this.quality !== 'low' && this.fx.particles.length < this.fx.maxParticles * 0.5) {
        const back = (u.team === 0 ? -1 : 1) * u.def.radius * 0.35 * p.s;
        this.fx.burst(p.x + back, p.y, { count: heavy ? 3 : 1, color: THEMES[this.theme].laneDetail, speed: heavy ? 26 : 16, life: heavy ? 0.6 : 0.45, size: (heavy ? 3 : 2.2) * p.s + 1, size1: (heavy ? 5 : 3.5) * p.s + 1, shape: 'smoke', layer: u.lane, gravity: -10, drag: 3, dir: -Math.PI / 2, spread: 2.4 });
      }
    }
    v.flash = Math.max(0, v.flash - dt * 6);
    v.spawn = Math.max(0, Math.min(1, v.spawn + dt / SPAWN_TIME));
    const tc = TEAM_COLORS[u.team];
    const animDur = u.def.windup + Math.min(0.4, Math.max(0.15, u.def.cooldown - u.def.windup));
    let attack = -1;
    if (u.attackStart >= 0) {
      const a = (simTime - u.attackStart) / animDur;
      if (a >= 0 && a < 1) attack = a;
    }
    if (u.freezeTimer > 0) attack = -1;
    // Victory: brandish weapons (the wind-up pose) in time with the celebration hop.
    if (this.winner === u.team) attack = (0.5 + 0.5 * Math.sin(this.time * 7 + v.seed * 6)) * (u.def.windup / animDur) * 0.75;
    const pose: Pose = {
      t: u.freezeTimer > 0 ? v.seed * 10 : this.time,
      walk: v.walk,
      moving: u.moving && u.freezeTimer <= 0,
      attack,
      hit: u.def.windup / animDur,
      tc,
      seed: v.seed,
      enraged: u.enraged,
      charged: u.charged,
    };
    const spawnK = v.spawn;
    const sc = p.s * (0.6 + 0.4 * spawnK);
    const fly = art.fly * p.s;
    // After the battle the victors hop in celebration.
    const cheer = this.winner === u.team ? Math.abs(Math.sin(this.time * 7 + v.seed * 6)) * 5 * p.s : 0;
    const y = p.y - fly - cheer;
    ctx.save();
    ctx.globalAlpha = Math.min(1, spawnK * 1.5);
    // Recoil: knocked back a touch when struck (visual only).
    const recoil = v.flash * v.flash * 3 * p.s * (u.team === 0 ? -1 : 1);
    ctx.translate(p.x + recoil, y);
    ctx.scale(u.team === 0 ? sc : -sc, sc);
    // Its temper's gesture after felling a foe (Lens #77), around its feet.
    // It waits for a swing in progress to end (a hop mid-blow looked like a glitch); a creature
    // that goes straight on to its next blow lets the moment pass.
    if (v.gest >= 1 && attack >= 0) {
      v.gestWait += dt;
      if (v.gestWait > 0.8) v.gest = 0;
    } else if (v.gest > 0) {
      v.gest = u.freezeTimer > 0 || this.winner !== null ? 0 : Math.max(0, v.gest - dt / GESTURE_TIME);
      const temper = TEMPERS[u.def.id];
      if (temper && v.gest > 0) {
        const gt = gestureAt(temper.gesture, 1 - v.gest);
        ctx.translate(0, gt.lift);
        ctx.rotate(gt.rot);
        ctx.scale(gt.sx, gt.sy);
      }
    }
    setLineWidth(Math.min(1.6, 1.25 / sc));
    if (u.enraged) drawGlow(ctx, 0, art.body[1], art.height * 0.7, [255, 70, 40], 0.45 + 0.15 * Math.sin(this.time * 12));
    if (u.charged && u.moving) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const yy = art.body[1] + (i - 1) * 6;
        const off = ((this.time * 120 + i * 13) % 30) - 15;
        ctx.beginPath();
        ctx.moveTo(-art.height * 0.5 - off, yy);
        ctx.lineTo(-art.height * 0.5 - off - 10, yy);
        ctx.stroke();
      }
    }
    // (The sprite is made at the full scale, so a creature frozen mid-spawn isn't re-rendered
    // every frame while it grows; the blit is in art units and follows the current scale.)
    if (u.freezeTimer > 0) this.drawFrozen(ctx, v, u.def.id, art, pose, p.s);
    else {
      v.frozen = null;
      art.draw(ctx, pose);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    const bodyY = y + art.body[1] * p.s;
    const m = this.mouseRef;
    if (m) {
      const hw = Math.max(10, u.def.radius * this.bodyScale(g) * 1.3);
      const top = y - (art.height + 4) * p.s;
      if (m.x > p.x - hw && m.x < p.x + hw && m.y > top && m.y < p.y + 4) {
        const d = Math.abs(m.x - p.x) + Math.abs(m.y - bodyY) * 0.5;
        if (!this.hover || d < this.hover.d) this.hover = { unit: u, x: p.x, top: top - 12, d };
      }
    }
    if (v.flash > 0) drawGlow(ctx, p.x, bodyY, art.height * 0.6 * p.s, [255, 255, 255], v.flash * 0.55);
    if (v.reborn > 0) {
      v.reborn = Math.max(0, v.reborn - dt * 1.2);
      drawGlow(ctx, p.x, bodyY, art.height * (0.8 + (1 - v.reborn) * 0.6) * p.s, [255, 190, 80], v.reborn);
    }
    if (u.slowTimer > 0 && u.freezeTimer <= 0) {
      for (let i = 0; i < 2; i++) {
        const a = this.time * 3 + i * Math.PI;
        circle(ctx, p.x + Math.cos(a) * 10 * p.s, bodyY + Math.sin(a) * 3 * p.s - 6 * p.s, 1.6, 'rgba(190, 200, 170, 0.8)');
      }
    }
    if (u.freezeTimer > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(190, 235, 255, 0.6)';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      const hw = u.def.radius * this.bodyScale(g) * 1.25;
      const hh = (art.height + 4) * p.s;
      ctx.beginPath();
      ctx.roundRect(p.x - hw, y - hh, hw * 2, hh + fly * 0 + 2, 3);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (u.rootTimer > 0 && !u.flying) {
      ctx.strokeStyle = '#3f7d32';
      ctx.lineWidth = Math.max(1, 2 * p.s);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x + i * 5 * p.s, p.y + 1);
        ctx.quadraticCurveTo(p.x + i * 9 * p.s, p.y - 6 * p.s, p.x + i * 3 * p.s, p.y - 10 * p.s);
        ctx.stroke();
      }
    }

    // Health bar (only once damaged)
    // Healing (regrowth, lifesteal) shows as rising green sparkles.
    if (u.hp > v.lastHp) v.healAcc += u.hp - v.lastHp;
    v.lastHp = u.hp;
    if (v.healAcc > u.maxHp * 0.05) {
      v.healAcc = 0;
      this.fx.burst(p.x, bodyY, { count: 4, color: '#9dff8a', rgb: [140, 255, 120], speed: 30, life: 0.8, size: 2, shape: 'glow', layer: u.lane, gravity: -50, jitter: u.def.radius * this.bodyScale(g) });
    }
    v.hpShown += (u.hp - v.hpShown) * Math.min(1, dt * 10);
    const damaged = u.hp < u.maxHp - 0.5;
    v.hpAlpha = Math.max(0, Math.min(1, v.hpAlpha + (damaged ? dt * 6 : -dt * 2)));
    if (v.hpAlpha > 0.02) {
      const w = Math.max(16, Math.min(60, u.def.radius * 2.1 * this.bodyScale(g)));
      const h = Math.max(3, 3.5 * Math.min(1.2, this.bodyScale(g)));
      const bx = p.x - w / 2;
      const by = y - (art.height + 6) * p.s - h;
      ctx.globalAlpha = v.hpAlpha;
      ctx.fillStyle = 'rgba(15, 8, 25, 0.75)';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      const frac = Math.max(0, Math.min(1, v.hpShown / u.maxHp));
      const realFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, w * frac, h);
      ctx.fillStyle = tc.main;
      ctx.fillRect(bx, by, w * realFrac, h);
      ctx.globalAlpha = 1;
    }
    // A veteran (Lens #81) wears a gold chevron above its head for the rest of its life.
    if (u.veteran) {
      const k = Math.max(0.8, Math.min(1.3, this.bodyScale(g)));
      const cy = y - (art.height + 6) * p.s - 9 * k;
      ctx.beginPath();
      ctx.moveTo(p.x - 6 * k, cy + 3 * k);
      ctx.lineTo(p.x, cy - 3 * k);
      ctx.lineTo(p.x + 6 * k, cy + 3 * k);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(30, 16, 8, 0.85)';
      ctx.lineWidth = 4.5 * k;
      ctx.stroke();
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2.4 * k;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    }
  }

  /**
   * A side's sigil, the emblem its player chose (Lens #85), on the face of its keep: a gold glyph
   * on a roundel of the side's colour. (Unmirrored, so it reads the same on either screen.)
   */
  private drawSigil(ctx: CanvasRenderingContext2D, team: Team, age: number): void {
    const glyph = SIGILS[this.sigils[team]];
    if (!glyph) return;
    const e = keepEmblem(this.layout, team, age);
    if (e.r < 4) return;
    const tc = TEAM_COLORS[team];
    ctx.save();
    ctx.translate(e.x, e.y);
    if (this.mirror) ctx.scale(-1, 1);
    circle(ctx, 0, 0, e.r, tc.dark);
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = Math.max(1.2, e.r * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.stroke();
    ctx.font = `700 ${Math.round(e.r * 1.25)}px "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(glyph, 0, e.r * 0.06);
    ctx.restore();
  }

  /**
   * The god's moment (Lens #67): for a breath after the player casts, everything but the struck
   * lane sinks into shadow, then the field returns. (The shadow is full at the start and eases
   * out over 1.3 s; a paused frame holds it.)
   */
  private drawFocus(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const g = L.lanes[this.focusLane];
    this.focusT = Math.max(0, this.focusT - this.frameDt / 1.3);
    if (!g) return;
    const lanes = L.lanes;
    const gap = lanes.length > 1 ? lanes[1].y - lanes[0].y : g.band * 3;
    const top = this.focusLane > 0 ? (lanes[this.focusLane - 1].y + g.y) / 2 + g.band * 0.3 : g.y - gap * 0.9;
    const bottom = this.focusLane < lanes.length - 1 ? (lanes[this.focusLane + 1].y + g.y) / 2 + g.band * 0.3 : g.y + g.band;
    const k = this.focusT * Math.sqrt(this.focusT);
    ctx.save();
    // (Particles may have left additive blending on: a shadow must darken.)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(6, 3, 16, ${(0.5 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.rect(-L.width, -L.height, L.width * 3, L.height * 3);
    ctx.rect(-L.width, top, L.width * 3, bottom - top);
    ctx.fill('evenodd');
    ctx.restore();
  }

  /** Small name / class / health label above the creature under the mouse. */
  private drawHoverLabel(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, view: ViewState): void {
    const mine = u.team === view.playerTeam;
    const name = u.veteran ? `${this.heroes.name(u.def.id, u.id)} · Veteran ${u.def.name}` : u.def.name;
    const hp = `${Math.ceil(u.hp)} / ${Math.ceil(u.maxHp)}`;
    // The counter rule, right where you look: what beats this foe / what yours is good against.
    const cls = u.def.cls;
    const rel = cls === 'legend' ? null : mine ? COUNTERS[cls] : counterOf(cls);
    const hint = rel ? `${mine ? 'Strong vs' : 'Beaten by'} ${CLASS_PLURAL[rel]}` : 'No class counters it';
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    const w = Math.max(ctx.measureText(name).width, ctx.measureText(hp).width + 14, ctx.measureText(hint).width) + 22;
    const h = 48;
    const bx = Math.round(x - w / 2);
    const by = Math.round(y - h);
    ctx.fillStyle = 'rgba(16, 10, 30, 0.88)';
    ctx.strokeStyle = TEAM_COLORS[u.team].main;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CLASS_COLORS[u.def.cls];
    ctx.beginPath();
    ctx.arc(bx + 11, by + 11, 4, 0, TAU);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4ecff';
    ctx.fillText(name, bx + 19, by + 11);
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#c9bde8';
    ctx.fillText(hp, bx + 19, by + 25);
    ctx.fillStyle = rel ? CLASS_COLORS[rel] : '#c9bde8';
    ctx.fillText(hint, bx + 19, by + 39);
  }

  private drawGhost(ctx: CanvasRenderingContext2D, gh: Ghost, dt: number): void {
    gh.t += dt;
    const k = Math.min(1, gh.t / DEATH_TIME);
    const art = artFor(gh.defId);
    const fall = gh.flying ? art.fly * gh.s * Math.min(1, k * 1.6) : 0;
    const y = gh.y - art.fly * gh.s + fall + k * 6 * gh.s;
    ctx.save();
    ctx.globalAlpha = (1 - k) * (1 - k);
    ctx.translate(gh.x, y);
    const dir = gh.team === 0 ? 1 : -1;
    ctx.rotate(-dir * k * 0.9);
    ctx.scale(dir * gh.s, gh.s * (1 - k * 0.3));
    setLineWidth(Math.min(1.6, 1.25 / gh.s));
    art.draw(ctx, { t: this.time, walk: gh.walk, moving: false, attack: -1, hit: 0.5, tc: TEAM_COLORS[gh.team], seed: gh.seed, enraged: false, charged: false });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, world: World, lane: number, alpha: number): void {
    const g = this.layout.lanes[lane];
    for (const pr of world.projectiles) {
      if (pr.lane !== lane || pr.done) continue;
      let pv = this.projVis.get(pr.id);
      if (!pv) {
        pv = { fan: 0, fan0: 0, h0: this.launchHeight(world, pr, g), h1: 0, lastSx: NaN, lastSy: NaN, angle: 0, trail: 0 };
        // A bouncing shot (Kitsune foxfire) leaves from where the last one struck its foe.
        const from = pr.bounce && pr.bounce.hit.length > 0 ? this.aimAt.get(pr.bounce.hit[pr.bounce.hit.length - 1]) : undefined;
        if (from) {
          pv.h0 = from.h;
          pv.fan0 = from.fan;
        }
        this.projVis.set(pr.id, pv);
      }
      const target = pr.targetId >= 0 ? world.unitById.get(pr.targetId) : undefined;
      if (target && target.alive) {
        const art = artFor(target.def.id);
        pv.h1 = (-art.body[1] + art.fly) * this.artScale(g) * art.scale;
        pv.fan = this.fanOf(target.def, this.vis.get(target.id)?.seed);
        if (pr.bounce) this.aimAt.set(target.id, { h: pv.h1, fan: pv.fan });
      } else if (pr.targetId < 0) {
        pv.h1 = 40 * this.artScale(g);
      }
      const xi = pr.px + (pr.x - pr.px) * alpha;
      const span = pr.tx - pr.x0;
      const t = Math.abs(span) < 1e-3 ? 1 : Math.max(0, Math.min(1, (xi - pr.x0) / span));
      const sx = laneX(g, xi + pv.fan0 * (1 - t) + pv.fan * t);
      const sy = g.y - (pv.h0 + (pv.h1 - pv.h0) * t) - pr.arc * this.artScale(g) * 4 * t * (1 - t);
      if (!Number.isNaN(pv.lastSx)) {
        const dx = sx - pv.lastSx;
        const dy = sy - pv.lastSy;
        if (dx * dx + dy * dy > 0.01) pv.angle = Math.atan2(dy, dx);
      } else {
        pv.angle = pr.team === 0 ? 0 : Math.PI;
      }
      const fromX = laneX(g, pr.x0 + pv.fan0);
      const fromY = g.y - pv.h0;
      drawProjectile(ctx, this.fx, pr.kind, pr.team, sx, sy, pv.angle, this.artScale(g), lane, this.time, fromX, fromY, t, this.frameDt);
      pv.lastSx = sx;
      pv.lastSy = sy;
    }
  }

  private launchHeight(world: World, pr: Projectile, g: LaneGeom): number {
    const s = this.artScale(g);
    // Match citadel.ts: the gate top sits at laneY + band/2 - 58s; the ward crystal floats
    // ~10s above it and turret heads (drawn 1.5x) ~19s above it.
    if (pr.fromTurret) return (pr.sourceId <= -20 ? 68 : 77) * s - g.band * 0.5;
    const src = world.unitById.get(pr.sourceId);
    if (src) {
      const art = artFor(src.def.id);
      return (-art.muzzle[1] + art.fly) * s * art.scale;
    }
    return 24 * s;
  }

  /** Power visuals in one lane (drawn with that lane, so nearer lanes stay in front). */
  private drawPowers(ctx: CanvasRenderingContext2D, world: World, lane: number): void {
    for (const inst of world.powers) {
      if (inst.kind !== 'spiritdragon' || inst.lane !== lane) continue;
      const g = this.layout.lanes[inst.lane];
      const s = this.artScale(g);
      const head = spiritDragonHead(inst.team, inst.t);
      const dir = inst.team === 0 ? 1 : -1;
      const segs = 22;
      const pts: [number, number][] = [];
      for (let i = 0; i < segs; i++) {
        const lx = head - dir * i * 14;
        const sx = laneX(g, lx);
        const sy = g.y - 40 * s - Math.sin(this.time * 6 - i * 0.5) * 12 * s;
        pts.push([sx, sy]);
      }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = segs - 1; i > 0; i--) {
        const w = (1 - i / segs) * 16 * s + 3;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(160,255,220,0.85)' : 'rgba(90,220,180,0.85)';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.stroke();
      }
      ctx.restore();
      const [hx, hy] = pts[0];
      drawGlow(ctx, hx, hy, 60 * s, [120, 255, 210], 0.7);
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(dir * s, s);
      ctx.fillStyle = '#c8fff0';
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.quadraticCurveTo(10, -12, 20, -2);
      ctx.lineTo(8, 4);
      ctx.quadraticCurveTo(0, 8, -8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff6c0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -8);
      ctx.quadraticCurveTo(-10, -20, -18, -18);
      ctx.moveTo(2, -9);
      ctx.quadraticCurveTo(-2, -22, -10, -24);
      ctx.stroke();
      circle(ctx, 8, -4, 1.8, '#ff4060');
      ctx.restore();
      if (Math.random() < this.frameDt * 36) this.fx.burst(hx, hy, { count: 1, color: '#9fffe0', rgb: [140, 255, 220], speed: 30, life: 0.8, size: 2.5, shape: 'glow', layer: inst.lane });
    }
    for (const inst of world.powers) {
      if (inst.kind !== 'fimbul' || inst.lane !== lane) continue;
      const g = this.layout.lanes[inst.lane];
      const k = inst.t / POWER_TIMING.fimbul.duration;
      const a = Math.sin(Math.min(1, k) * Math.PI) * 0.4;
      const top = g.y - 72 * this.artScale(g);
      const bot = g.y + g.band * 0.6;
      const grad = ctx.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, 'rgba(200, 235, 255, 0)');
      grad.addColorStop(0.6, `rgba(210, 240, 255, ${a})`);
      grad.addColorStop(1, `rgba(230, 248, 255, ${a * 0.6})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(g.x0 - g.band, top, g.x1 - g.x0 + g.band * 2, bot - top, g.band * 0.6);
      ctx.fill();
    }
  }
}
