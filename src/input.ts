import { AGE_UNITS, LANE_COUNT } from './sim/data.ts';
import type { Game } from './game.ts';
import { laneAt } from './render/layout.ts';
import type { Renderer } from './render/renderer.ts';
import type { Hud } from './ui/hud.ts';

/** Battlefield pointer input and keyboard shortcuts. */
export class Input {
  private game: Game | null = null;
  private readonly renderer: Renderer;
  private readonly hud: Hud;
  /** Maps client coordinates into the stage (handles the rotated portrait mode). */
  toStage: (x: number, y: number) => [number, number] = (x, y) => [x, y];
  onPause: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, renderer: Renderer, hud: Hud) {
    this.renderer = renderer;
    this.hud = hud;
    hud.laneAtPoint = (x, y) => this.laneAtClient(x, y);
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointerleave', () => {
      if (!this.game) return;
      this.game.view.mouse = null;
      if (this.game.view.targeting !== 'summon') this.game.view.hoverLane = -1;
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.hud.cancelTargeting();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  attach(game: Game | null): void {
    this.game = game;
  }

  laneAtClient(cx: number, cy: number): number {
    const [x, y] = this.toStage(cx, cy);
    return laneAt(this.renderer.layout, x, y);
  }

  /** True when the point is on the player's citadel gate for that lane (opens the turret panel). */
  private onGate(cx: number, cy: number, lane: number): boolean {
    const [x, y] = this.toStage(cx, cy);
    const L = this.renderer.layout;
    const g = L.lanes[lane];
    const s = g.s * (L.mode === 'mobile' ? 1.4 : 1.25);
    return x < g.x0 + 4 && x > g.x0 - 44 * s && y < g.y + g.band * 0.5 && y > g.y - 80 * s;
  }

  private onMove(e: PointerEvent): void {
    const g = this.game;
    if (!g) return;
    if (e.pointerType === 'mouse') {
      const [x, y] = this.toStage(e.clientX, e.clientY);
      g.view.mouse = { x, y };
    }
    if (g.view.targeting === 'summon') return;
    if (e.pointerType === 'mouse' || g.view.targeting === 'power') g.view.hoverLane = this.laneAtClient(e.clientX, e.clientY);
  }

  private onDown(e: PointerEvent): void {
    const g = this.game;
    if (!g || g.paused || g.over) return;
    if (e.button === 2) {
      this.hud.cancelTargeting();
      return;
    }
    const lane = this.laneAtClient(e.clientX, e.clientY);
    if (g.view.targeting === 'power') {
      if (lane >= 0) this.hud.tryPower(lane);
      else this.hud.cancelTargeting();
      return;
    }
    if (this.hud.panelOpen) {
      if (lane >= 0 && this.onGate(e.clientX, e.clientY, lane)) {
        this.hud.openTurretPanel(lane);
        return;
      }
      this.hud.togglePanel('none');
    }
    if (lane < 0) return;
    if (this.onGate(e.clientX, e.clientY, lane)) {
      this.hud.selectLane(lane);
      this.hud.openTurretPanel(lane);
      return;
    }
    this.hud.selectLane(lane);
    if (e.pointerType !== 'mouse') {
      g.view.hoverLane = -1;
    }
  }

  private onKey(e: KeyboardEvent): void {
    const g = this.game;
    if (!g) return;
    if (e.repeat && !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      if (g.view.targeting !== 'none') this.hud.cancelTargeting();
      else if (this.hud.panelOpen) this.hud.togglePanel('none');
      else this.onPause();
      e.preventDefault();
      return;
    }
    if (g.paused || g.over) return;
    // A HUD button clicked earlier keeps focus; don't let Space/Enter also activate it.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.closest('.hud')) active.blur();
    const me = g.world.players[g.playerTeam];
    if (k >= '1' && k <= '4') {
      const def = AGE_UNITS[me.age][Number(k) - 1];
      if (def) this.hud.tryTrain(def.id);
      e.preventDefault();
    } else if (k === 'w' || k === 'arrowup') {
      this.hud.selectLane(Math.max(0, g.view.selectedLane - 1));
      e.preventDefault();
    } else if (k === 's' || k === 'arrowdown') {
      this.hud.selectLane(Math.min(LANE_COUNT - 1, g.view.selectedLane + 1));
      e.preventDefault();
    } else if (k === 'q' || k === 'a' || k === 'z') {
      this.hud.selectLane(k === 'q' ? 0 : k === 'a' ? 1 : 2);
    } else if (k === ' ') {
      if (g.view.targeting === 'power' && g.view.hoverLane >= 0) this.hud.tryPower(g.view.hoverLane);
      else this.hud.tryPower(g.view.selectedLane);
      e.preventDefault();
    } else if (k === 'u' || k === 'e') {
      this.hud.tryAscend();
    } else if (k === 't') {
      this.hud.togglePanel('turret');
    } else if (k === 'b') {
      this.hud.togglePanel('bless');
    } else if (k === 'f') {
      this.hud.toggleSpeed();
    }
  }
}
