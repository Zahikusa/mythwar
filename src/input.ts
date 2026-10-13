import { AGE_UNITS, LANE_COUNT } from './sim/data.ts';
import type { Game } from './game.ts';
import { artScaleOf, laneAt } from './render/layout.ts';
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
  private holdTimer = 0;
  private readonly canvas: HTMLCanvasElement;
  private cursorState = '';

  constructor(canvas: HTMLCanvasElement, renderer: Renderer, hud: Hud) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.hud = hud;
    hud.laneAtPoint = (x, y) => this.laneAtClient(x, y);
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    // Touch: press and hold on a creature to inspect it; release / move away to dismiss.
    let holdFrom: { id: number; x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.game) return;
      clearTimeout(this.holdTimer);
      holdFrom = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const start = this.toStage(e.clientX, e.clientY);
      this.holdTimer = window.setTimeout(() => {
        if (this.game) this.game.view.inspect = { x: start[0], y: start[1] - 18 };
      }, 380);
    });
    const endHold = () => {
      holdFrom = null;
      clearTimeout(this.holdTimer);
      if (this.game) this.game.view.inspect = null;
    };
    // A finger that moves off is swiping, not holding (touch keeps the pointer captured, so
    // pointerleave only comes on release).
    canvas.addEventListener('pointermove', (e) => {
      if (holdFrom && e.pointerId === holdFrom.id && Math.hypot(e.clientX - holdFrom.x, e.clientY - holdFrom.y) > 14) endHold();
    });
    canvas.addEventListener('pointerup', endHold);
    canvas.addEventListener('pointercancel', endHold);
    canvas.addEventListener('pointerleave', endHold);
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
    // Mouse wheel over the battlefield steps the selected lane (up = the lane above): the hand on
    // the mouse can steer summons without travelling to the lane or the keyboard.
    let wheelAcc = 0;
    canvas.addEventListener(
      'wheel',
      (e) => {
        const g = this.game;
        if (!g || g.options.demo || g.paused) return;
        e.preventDefault();
        wheelAcc += e.deltaY;
        // Trackpads send many small deltas: one lane per notch's worth.
        if (Math.abs(wheelAcc) < 40) return;
        const step = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        const lane = Math.max(0, Math.min(LANE_COUNT - 1, g.view.selectedLane + step));
        this.hud.selectLane(lane);
      },
      { passive: false },
    );
  }

  attach(game: Game | null): void {
    this.game = game;
    this.cursorState = '';
    this.canvas.style.cursor = '';
    this.canvas.title = '';
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
    const s = artScaleOf(L, g);
    return x < g.x0 + 4 && x > g.x0 - 44 * s && y < g.y + g.band * 0.5 && y > g.y - 80 * s;
  }

  private onMove(e: PointerEvent): void {
    const g = this.game;
    if (!g) return;
    if (e.pointerType === 'mouse') {
      const [x, y] = this.toStage(e.clientX, e.clientY);
      g.view.mouse = { x, y };
      // Show what's clickable: lanes select, your gates open their turret slot.
      const lane = g.options.demo || g.over || g.paused ? -1 : this.laneAtClient(e.clientX, e.clientY);
      // While aiming a god power, a click anywhere on a lane (gates included) casts it.
      const gate = lane >= 0 && g.view.targeting !== 'power' && this.onGate(e.clientX, e.clientY, lane);
      const state = lane < 0 ? '' : gate ? 'gate' : 'lane';
      if (state !== this.cursorState) {
        this.cursorState = state;
        this.canvas.style.cursor = state ? 'pointer' : '';
        this.canvas.title = state === 'gate' ? 'Your gate — click to mount or swap its turret' : '';
      }
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
    // Leave browser shortcuts alone (Ctrl+F find, Ctrl+P print, Alt+Tab...).
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat && !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    if (this.press(e.key.toLowerCase())) e.preventDefault();
  }

  /**
   * A battle shortcut by key name (lower case) — from the keyboard or a gamepad button.
   * Returns true when the key's browser default should be suppressed.
   */
  press(k: string): boolean {
    const g = this.game;
    if (!g) return false;
    if (k === 'escape' || k === 'p') {
      if (g.view.targeting !== 'none') this.hud.cancelTargeting();
      else if (this.hud.panelOpen) this.hud.togglePanel('none');
      else this.onPause();
      return true;
    }
    if (g.paused || g.over) return false;
    // A HUD button clicked earlier keeps focus; don't let Space/Enter also activate it.
    // (Buttons reached with Tab keep focus, so keyboard users can press them with Enter.)
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.closest('.hud') && !active.matches(':focus-visible')) active.blur();
    const me = g.world.players[g.playerTeam];
    // (In a riddle there is nothing to ascend to, no walls to mount, no purse to spare.)
    if (g.riddle && (k === 'u' || k === 'e' || k === 't' || k === 'b')) return false;
    if (k >= '1' && k <= '4') {
      const def = AGE_UNITS[me.age][Number(k) - 1];
      if (def) this.hud.tryTrain(def.id);
      return true;
    } else if (k === 'w' || k === 'arrowup') {
      this.hud.selectLane(Math.max(0, g.view.selectedLane - 1));
      return true;
    } else if (k === 's' || k === 'arrowdown') {
      this.hud.selectLane(Math.min(LANE_COUNT - 1, g.view.selectedLane + 1));
      return true;
    } else if (k === 'q' || k === 'a' || k === 'z') {
      this.hud.selectLane(k === 'q' ? 0 : k === 'a' ? 1 : 2);
    } else if (k === ' ') {
      if (g.view.targeting === 'power' && g.view.hoverLane >= 0) this.hud.tryPower(g.view.hoverLane);
      else this.hud.tryPower(g.view.selectedLane);
      return true;
    } else if (k === 'u' || k === 'e') {
      this.hud.tryAscend();
    } else if (k === 't') {
      this.hud.togglePanel('turret');
    } else if (k === 'b') {
      this.hud.togglePanel('bless');
    } else if (k === 'f') {
      this.hud.toggleSpeed();
    } else if (k === 'x') {
      this.hud.toggleSide();
    } else if (k === 'g') {
      this.hud.toggleHold();
    } else if (k === 'm') {
      this.hud.toggleMute();
    } else if (k === 'backspace' || k === 'delete') {
      // Undo the most recent summon (full refund).
      const last = me.queue.length - 1;
      if (last >= 0 && g.command({ type: 'cancel', team: g.playerTeam, index: last, unitId: me.queue[last].unitId }).ok) this.hud.onCancelled();
      return true;
    } else if (k === '?' || k === 'h' || k === 'f1') {
      this.hud.togglePanel('keys');
      return true;
    }
    return false;
  }
}
