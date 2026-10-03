import { LANE_LENGTH, SHRINE_RADIUS, SHRINE_X, TICK } from '../sim/data.ts';
import { POWER_TIMING, spiritDragonHead } from '../sim/powers.ts';
import type { Projectile, SimEvent, Team, Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { renderBackground, renderVignette } from './background.ts';
import { drawCitadelGate, drawCitadelKeep, drawTurret } from './citadel.ts';
import { artFor } from './creatures/index.ts';
import type { CreatureArt, Pose } from './creatures/types.ts';
import { TAU, circle, drawGlow, ellipse, setLineWidth } from './draw.ts';
import { Fx } from './fx.ts';
import { artScaleOf, computeLayout, laneX } from './layout.ts';
import type { LaneGeom, Layout, LayoutMode } from './layout.ts';
import { drawProjectile, projectileImpact } from './projectiles.ts';
import { TEAM_COLORS, THEMES } from './theme.ts';

export interface ViewState {
  playerTeam: Team;
  selectedLane: number;
  hoverLane: number;
  /** Lane highlight mode while choosing a lane for a power / drag-drop. */
  targeting: 'none' | 'power' | 'summon' | 'turret';
  paused: boolean;
  /** Mouse position in stage coordinates (desktop hover labels), or null. */
  mouse?: { x: number; y: number } | null;
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
  h0: number;
  h1: number;
  lastSx: number;
  lastSy: number;
  angle: number;
  trail: number;
}

const DEATH_TIME = 0.9;
const CLASS_COLORS: Record<string, string> = { guardian: '#f2b84b', hunter: '#7ed957', mystic: '#b48cff', legend: '#ff8a3d' };
const SPAWN_TIME = 0.35;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  layout!: Layout;
  dpr = 1;
  quality: 'high' | 'low' = 'high';
  shakeEnabled = true;
  /** Stage position of the HUD gold counter (coins fly there), or null when hidden. */
  coinTarget: [number, number] | null = null;
  private bgCache = new Map<number, HTMLCanvasElement>();
  private vignette: HTMLCanvasElement | null = null;
  private theme = 0;
  private prevTheme = -1;
  private themeFade = 1;
  private vis = new Map<number, UnitVis>();
  private ghosts: Ghost[] = [];
  private projVis = new Map<number, ProjVis>();
  readonly fx = new Fx();
  private ambient: { x: number; y: number; vx: number; vy: number; p: number; s: number }[] = [];
  private time = 0;
  private shake = 0;
  private ragnarok = 0;
  private baseFlash: [number, number] = [0, 0];
  private shrinePulse = [0, 0, 0];
  private gateChips = [-1, -1, -1, -1, -1, -1];
  private laneAlert = [0, 0, 0];
  private hover: { unit: Unit; x: number; top: number; d: number } | null = null;
  private mouseRef: { x: number; y: number } | null = null;
  private sortBuf: Unit[] = [];
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
    this.layout = computeLayout(width, height, mode);
    this.bgCache.clear();
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
      return;
    }
    this.prevTheme = this.theme;
    this.theme = index;
    this.themeFade = 0;
    this.ambient = [];
  }

  reset(): void {
    this.vis.clear();
    this.ghosts = [];
    this.projVis.clear();
    this.fx.clear();
    this.ragnarok = 0;
    this.shake = 0;
    this.collapse = [-1, -1];
    this.laneAlert = [0, 0, 0];
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

  unitScreen(u: Unit, alpha: number): { x: number; y: number; s: number; art: CreatureArt } {
    const g = this.layout.lanes[u.lane];
    const xi = u.px + (u.x - u.px) * alpha;
    const v = this.vis.get(u.id);
    const art = artFor(u.def.id);
    // Hunters crowd into packs at the same spot; fan them out a little so the pack reads.
    const fan = v && u.def.cls === 'hunter' ? (v.seed - 0.5) * u.def.radius * 1.4 : 0;
    return {
      x: laneX(g, xi + fan),
      y: g.y + (v ? v.yJit : 0) * g.band,
      s: this.artScale(g) * art.scale,
      art,
    };
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
          this.fx.timedFx({ kind: 'flashAt', x: gx, y: g.y - 18 * g.s, dur: 0.45, layer: e.lane, size: 40 * g.s, rgb: tc.rgb });
          this.fx.burst(gx, g.y - 10 * g.s, { count: 10, color: tc.light, rgb: tc.rgb, speed: 60, life: 0.6, size: 2.2, shape: 'glow', layer: e.lane, gravity: -40 });
          break;
        }
        case 'hit': {
          const v = this.vis.get(e.targetId);
          if (v) v.flash = 1;
          const u = world.unitById.get(e.targetId);
          if (u && u.alive !== undefined) {
            const p = this.unitScreen(u, 1);
            const by = p.y - (p.art.body[1] * -1 + p.art.fly) * p.s;
            if (e.mult > 1) {
              this.fx.burst(p.x, by, { count: 6, color: '#ffe27a', speed: 120, life: 0.35, size: 2.2, shape: 'spark', layer: e.lane, drag: 4 });
            } else if (e.source === 'unit') {
              this.fx.burst(p.x, by, { count: 3, color: '#ffffff', speed: 70, life: 0.25, size: 1.8, shape: 'spark', layer: e.lane, drag: 4 });
            }
          }
          break;
        }
        case 'death': {
          const g = L.lanes[e.lane];
          const v = this.vis.get(e.unitId);
          const art = artFor(e.defId);
          const s = this.artScale(g) * art.scale;
          const x = laneX(g, e.x);
          const y = g.y + (v ? v.yJit : 0) * g.band;
          this.ghosts.push({ defId: e.defId, team: e.team, lane: e.lane, x, y, s, flying: e.flying, t: 0, walk: v ? v.walk : 0, seed: v ? v.seed : 0 });
          const tc = TEAM_COLORS[e.team];
          const by = y - (art.height * 0.5 + art.fly) * s;
          this.fx.burst(x, by, { count: 12, color: tc.light, rgb: tc.rgb, speed: 50, life: 1.1, size: 2.4, shape: 'glow', layer: e.lane, gravity: -60, drag: 1.5, jitter: 14 * s });
          this.fx.burst(x, y - 4, { count: 8, color: 'rgba(60,45,40,0.6)', speed: 40, life: 0.8, size: 4 * s + 2, shape: 'smoke', layer: e.lane, gravity: -10 });
          if (e.team !== view.playerTeam) {
            this.fx.text(x, by - art.height * 0.5 * s, `+${e.gold}`, '#ffd76a', 15);
            // A coin flies to the gold counter (capped so big fights don't flood the screen).
            const target = this.coinTarget;
            if (target && this.fx.timed.filter((f) => f.kind === 'coin').length < 8) {
              this.fx.timedFx({ kind: 'coin', x, y: by, x2: target[0], y2: target[1], dur: 0.75 + Math.random() * 0.2, layer: 3, size: Math.max(0.8, L.ui) });
            }
          }
          this.vis.delete(e.unitId);
          break;
        }
        case 'rebirth': {
          const g = L.lanes[e.lane];
          const x = laneX(g, e.x);
          const y = g.y - 40 * g.s;
          this.fx.burst(x, y, { count: 40, color: '#ffb347', rgb: [255, 160, 60], speed: 160, life: 1, size: 3, shape: 'glow', layer: e.lane, gravity: -80 });
          this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.7, layer: e.lane, size: 50 * g.s, color: '#ffcf70', rgb: [255, 190, 90] });
          break;
        }
        case 'impact': {
          const g = L.lanes[e.lane];
          projectileImpact(this.fx, e.kind, laneX(g, e.x), g.y, g.s, e.lane, e.splash, e.team);
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
          const x = e.team === 0 ? g.x0 - 40 * g.s : g.x1 + 40 * g.s;
          const tc = TEAM_COLORS[e.team];
          this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 1.2, layer: 3, size: 300 * g.s, color: '#fff3c4', rgb: tc.rgb });
          this.fx.burst(x, g.y - 80 * g.s, { count: 70, color: '#fff3c4', rgb: [255, 230, 160], speed: 260, life: 1.6, size: 3.2, shape: 'glow', layer: 3, gravity: 40, drag: 1.4 });
          if (e.team === view.playerTeam) {
            this.fx.flash = 0.8;
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
          this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.9, layer: e.lane, size: 90 * g.s, color: col, rgb });
          this.fx.burst(x, g.y - 30 * g.s, { count: 24, color: col, rgb, speed: 120, life: 1, size: 2.6, shape: 'glow', layer: e.lane, gravity: -30 });
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
          break;
        case 'strike':
          this.onStrike(e.kind, e.team, e.lane, e.x, e.radius);
          break;
        case 'meteor': {
          const g = L.lanes[e.lane];
          const x = laneX(g, e.x);
          const fromX = x + (e.team === 0 ? -1 : 1) * L.field.h * 0.35;
          this.fx.timedFx({ kind: 'meteor', x, y: g.y - 6 * g.s, x2: fromX, y2: -40, dur: e.fall, layer: 3, size: 9 * g.s + 4, rgb: [255, 200, 120], color: '#ffd38a' });
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
        default:
          break;
      }
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
        const x0 = left ? L.field.x : near.x1;
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
          y: g.y - Math.random() * 90 * g.s,
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
    const s = g.s;
    switch (kind) {
      case 'briar':
        this.fx.timedFx({ kind: 'vines', x, y: g.y + 2, dur: POWER_TIMING.briar.root + 0.2, layer: lane, size: Math.max(14, radius * 2.2) * s * 1.1 });
        this.fx.burst(x, g.y - 6 * s, { count: 8, color: '#4e8f3a', speed: 120, life: 0.7, size: 2.5, shape: 'leaf', layer: lane, gravity: 260 });
        break;
      case 'zeus':
        this.fx.timedFx({ kind: 'lightning', x, y: g.y - 4 * s, x2: x + (Math.random() - 0.5) * 80, y2: -20, dur: 0.35, layer: 3, size: 16 * s + 4, rgb: [170, 200, 255] });
        this.fx.timedFx({ kind: 'shockwave', x, y: g.y, dur: 0.5, layer: lane, size: 45 * s, color: '#dfe8ff', rgb: [170, 200, 255] });
        this.fx.burst(x, g.y - 6 * s, { count: 14, color: '#e8f0ff', speed: 220, life: 0.45, size: 2, shape: 'spark', layer: lane, drag: 3 });
        this.shake = Math.max(this.shake, 4);
        break;
      case 'fimbul':
        this.fx.timedFx({ kind: 'ice', x, y: g.y + 2, dur: POWER_TIMING.fimbul.freeze, layer: lane, size: Math.max(12, radius * 1.6) * s * 1.15 });
        this.fx.burst(x, g.y - 10 * s, { count: 10, color: '#d8f3ff', speed: 140, life: 0.6, size: 2.5, shape: 'shard', layer: lane, gravity: 200 });
        break;
      case 'spiritdragon':
        this.fx.burst(x, g.y - 20 * s, { count: 16, color: '#7dffcf', rgb: [110, 255, 200], speed: 160, life: 0.7, size: 2.6, shape: 'glow', layer: lane, drag: 2.5 });
        break;
      case 'starfall':
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
    this.fx.update(dt);
    this.themeFade = Math.min(1, this.themeFade + dt / 1.6);
    this.shake = Math.max(0, this.shake - dt * 18);
    for (let i = 0; i < 2; i++) {
      this.baseFlash[i] = Math.max(0, this.baseFlash[i] - dt * 4);
      this.ageFlash[i] = Math.max(0, this.ageFlash[i] - dt * 0.8);
    }
    for (let i = 0; i < 3; i++) {
      this.shrinePulse[i] = Math.max(0, this.shrinePulse[i] - dt * 1.5);
      this.laneAlert[i] = Math.max(0, this.laneAlert[i] - dt * 0.7);
    }
    this.ragnarok += ((world.ragnarokStarted ? 1 : 0) - this.ragnarok) * Math.min(1, dt * 0.8);
    this.updateCollapse(dt);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sh = this.shakeEnabled ? this.shake : 0;
    const shx = sh > 0 ? (Math.random() - 0.5) * sh : 0;
    const shy = sh > 0 ? (Math.random() - 0.5) * sh : 0;
    ctx.translate(shx, shy);

    // Backdrop (cross-fading between ages)
    if (this.prevTheme >= 0 && this.themeFade < 1) {
      ctx.drawImage(this.background(this.prevTheme), -4, -4, L.width + 8, L.height + 8);
      ctx.globalAlpha = this.themeFade;
    }
    ctx.drawImage(this.background(this.theme), -4, -4, L.width + 8, L.height + 8);
    ctx.globalAlpha = 1;
    this.drawAmbient(ctx, dt);

    const simTime = world.time - (1 - alpha) * TICK;

    // Citadel keeps (behind the lanes)
    for (const team of [0, 1] as Team[]) {
      const p = world.players[team];
      drawCitadelKeep(ctx, L, team, p.age, p.baseHp / p.baseMaxHp, this.time, this.baseFlash[team], this.ageFlash[team], Math.max(0, this.collapse[team]));
    }

    this.hover = null;
    this.mouseRef = L.mode === 'desktop' && view.targeting === 'none' ? (view.mouse ?? null) : null;

    // Lanes far → near
    for (let lane = 0; lane < L.lanes.length; lane++) {
      const g = L.lanes[lane];
      this.drawLaneHighlight(ctx, g, view);
      this.drawShrine(ctx, world, g);
      for (const team of [0, 1] as Team[]) {
        const p = world.players[team];
        const gate = this.gateScreen(team, lane);
        drawCitadelGate(ctx, L, team, lane, p.age, gate.x, gate.y, gate.s, this.baseFlash[team], this.time, Math.max(0, this.collapse[team]));
      }
      this.fx.drawTimed(ctx, lane);
      this.drawUnits(ctx, world, lane, alpha, simTime, dt);
      for (const team of [0, 1] as Team[]) {
        const slot = world.players[team].turrets[lane];
        if (slot.def) {
          const gate = this.gateScreen(team, lane);
          drawTurret(ctx, slot.def.id, team, gate.x, gate.y, g.band, gate.s, slot, simTime, laneX(g, slot.aimX));
        }
      }
      this.drawProjectiles(ctx, world, lane, alpha);
      this.fx.drawParticles(ctx, lane);
    }

    // Forget visuals of projectiles that no longer exist.
    if (this.projVis.size > world.projectiles.length) {
      const live = new Set<number>();
      for (const pr of world.projectiles) live.add(pr.id);
      for (const id of this.projVis.keys()) if (!live.has(id)) this.projVis.delete(id);
    }
    this.drawPowers(ctx, world);
    this.fx.drawTimed(ctx, 3);
    this.fx.drawParticles(ctx, 3);
    this.fx.drawTexts(ctx, Math.max(0.8, L.ui));
    const hv = this.hover as Renderer['hover'];
    if (hv) this.drawHoverLabel(ctx, hv.unit, hv.x, hv.top, view);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ragnarok > 0.01) {
      ctx.fillStyle = `rgba(150, 20, 10, ${0.16 * this.ragnarok})`;
      ctx.fillRect(0, 0, L.width, L.height);
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, L.width, L.height);
    if (this.fx.flash > 0) {
      ctx.fillStyle = `rgba(${this.fx.flashColor},${Math.min(0.85, this.fx.flash * 0.7)})`;
      ctx.fillRect(0, 0, L.width, L.height);
    }
    if (view.paused) {
      ctx.fillStyle = 'rgba(10, 6, 24, 0.35)';
      ctx.fillRect(0, 0, L.width, L.height);
    }
  }

  private drawAmbient(ctx: CanvasRenderingContext2D, dt: number): void {
    const L = this.layout;
    const theme = THEMES[this.theme];
    const want = (L.mode === 'mobile' ? 22 : 45) * (this.quality === 'low' ? 0.5 : 1);
    while (this.ambient.length < want) {
      this.ambient.push({
        x: Math.random() * L.width,
        y: L.horizon + Math.random() * (L.height - L.horizon),
        vx: 0,
        vy: 0,
        p: Math.random() * 100,
        s: 0.6 + Math.random() * 0.8,
      });
      if (theme.ambient === 'snow' || theme.ambient === 'petals') this.ambient[this.ambient.length - 1].y = Math.random() * L.height;
    }
    const t = this.time;
    for (const a of this.ambient) {
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
  }

  private drawLaneHighlight(ctx: CanvasRenderingContext2D, g: LaneGeom, view: ViewState): void {
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
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
    grad.addColorStop(0, `rgba(${col.join(',')},0)`);
    grad.addColorStop(0.5, `rgba(${col.join(',')},${a})`);
    grad.addColorStop(1, `rgba(${col.join(',')},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, h, h / 2);
    ctx.fill();
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
        v = { walk: seed * TAU, lastX: u.x, flash: 0, spawn: 0, yJit: (seed - 0.5) * 0.36, seed, hpShown: u.hp, hpAlpha: 0, frozenFx: 0 };
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
    // Shadows
    for (const u of sorted) {
      const p = this.unitScreen(u, alpha);
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
    for (const u of sorted) this.drawUnit(ctx, u, alpha, simTime, dt, g);
    // Ghosts
    for (const gh of this.ghosts) if (gh.lane === lane) this.drawGhost(ctx, gh, dt);
    if (lane === this.layout.lanes.length - 1) this.ghosts = this.ghosts.filter((gh) => gh.t < DEATH_TIME);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit, alpha: number, simTime: number, dt: number, g: LaneGeom): void {
    const v = this.vis.get(u.id)!;
    const p = this.unitScreen(u, alpha);
    const art = p.art;
    const xi = u.px + (u.x - u.px) * alpha;
    v.walk += Math.abs(xi - v.lastX) * 0.24;
    v.lastX = xi;
    v.flash = Math.max(0, v.flash - dt * 6);
    v.spawn = Math.min(1, v.spawn + dt / SPAWN_TIME);
    const tc = TEAM_COLORS[u.team];
    const animDur = u.def.windup + Math.min(0.4, Math.max(0.15, u.def.cooldown - u.def.windup));
    let attack = -1;
    if (u.attackStart >= 0) {
      const a = (simTime - u.attackStart) / animDur;
      if (a >= 0 && a < 1) attack = a;
    }
    if (u.freezeTimer > 0) attack = -1;
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
    const y = p.y - fly;
    ctx.save();
    ctx.globalAlpha = Math.min(1, spawnK * 1.5);
    ctx.translate(p.x, y);
    ctx.scale(u.team === 0 ? sc : -sc, sc);
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
    art.draw(ctx, pose);
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
  }

  /** Small name / class / health label above the creature under the mouse. */
  private drawHoverLabel(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, view: ViewState): void {
    const mine = u.team === view.playerTeam;
    const name = u.def.name;
    const hp = `${Math.ceil(u.hp)} / ${Math.ceil(u.maxHp)}`;
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    const w = Math.max(ctx.measureText(name).width, ctx.measureText(hp).width + 14) + 22;
    const h = 34;
    const bx = Math.round(x - w / 2);
    const by = Math.round(y - h);
    ctx.fillStyle = 'rgba(16, 10, 30, 0.88)';
    ctx.strokeStyle = mine ? TEAM_COLORS[0].main : TEAM_COLORS[1].main;
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
        pv = { h0: this.launchHeight(world, pr, g), h1: 0, lastSx: NaN, lastSy: NaN, angle: 0, trail: 0 };
        this.projVis.set(pr.id, pv);
      }
      const target = pr.targetId >= 0 ? world.unitById.get(pr.targetId) : undefined;
      if (target && target.alive) {
        const art = artFor(target.def.id);
        pv.h1 = (-art.body[1] + art.fly) * this.artScale(g) * art.scale;
      } else if (pr.targetId < 0) {
        pv.h1 = 40 * this.artScale(g);
      }
      const xi = pr.px + (pr.x - pr.px) * alpha;
      const span = pr.tx - pr.x0;
      const t = Math.abs(span) < 1e-3 ? 1 : Math.max(0, Math.min(1, (xi - pr.x0) / span));
      const sx = laneX(g, xi);
      const sy = g.y - (pv.h0 + (pv.h1 - pv.h0) * t) - pr.arc * this.artScale(g) * 4 * t * (1 - t);
      if (!Number.isNaN(pv.lastSx)) {
        const dx = sx - pv.lastSx;
        const dy = sy - pv.lastSy;
        if (dx * dx + dy * dy > 0.01) pv.angle = Math.atan2(dy, dx);
      } else {
        pv.angle = pr.team === 0 ? 0 : Math.PI;
      }
      const fromX = laneX(g, pr.x0);
      const fromY = g.y - pv.h0;
      drawProjectile(ctx, this.fx, pr.kind, pr.team, sx, sy, pv.angle, this.artScale(g), lane, this.time, fromX, fromY, t);
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

  private drawPowers(ctx: CanvasRenderingContext2D, world: World): void {
    for (const inst of world.powers) {
      if (inst.kind !== 'spiritdragon') continue;
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
      if (Math.random() < 0.6) this.fx.burst(hx, hy, { count: 1, color: '#9fffe0', rgb: [140, 255, 220], speed: 30, life: 0.8, size: 2.5, shape: 'glow', layer: inst.lane });
    }
    for (const inst of world.powers) {
      if (inst.kind !== 'fimbul') continue;
      const g = this.layout.lanes[inst.lane];
      const k = inst.t / POWER_TIMING.fimbul.duration;
      const a = Math.sin(Math.min(1, k) * Math.PI) * 0.4;
      const top = g.y - 90 * g.s;
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
