/**
 * Gamepads (Lens #54): any controller the browser exposes with the "standard" layout (Xbox,
 * PlayStation, Switch Pro, most Bluetooth pads — on PCs and phones alike). Polled once a frame;
 * buttons fire on press, the D-pad and left stick repeat while held.
 *
 * In battle the buttons are keyboard shortcuts in disguise (see BATTLE); in menus the D-pad
 * moves a highlight between buttons, A presses it (or the screen's main button), B goes back.
 */

/** Standard-mapping button indices. */
const A = 0;
const B = 1;
const X = 2;
const Y = 3;
const LB = 4;
const RB = 5;
const LT = 6;
const RT = 7;
const BACK = 8;
const START = 9;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

/** Battle: button → keyboard shortcut (src/input.ts). The face buttons summon the cards left to
 *  right as they sit on the pad: X, A, B — and Y the fourth (the Elder Dragon). */
export const BATTLE: Record<number, string> = {
  [X]: '1',
  [A]: '2',
  [B]: '3',
  [Y]: '4',
  [RB]: ' ',
  [LB]: 'g',
  [RT]: 'u',
  [LT]: 'backspace',
  [START]: 'escape',
  [BACK]: 'f',
  [UP]: 'arrowup',
  [DOWN]: 'arrowdown',
  [LEFT]: 't',
  [RIGHT]: 'b',
};

/** One line for the keys panel / the "controller connected" toast. */
export const PAD_HELP = 'X · A · B summon (Y: dragon) · D-pad ↑↓ lane, ← turrets, → blessings · RB god power · LB hold · RT ascend · LT undo · Start pause';

export type MenuMove = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'start';

export interface PadTarget {
  /** True while a battle has the controls (no menu open). */
  inBattle(): boolean;
  battleKey(key: string): void;
  menu(move: MenuMove): void;
  connected(name: string): void;
}

const REPEAT_DELAY = 0.4;
const REPEAT_EVERY = 0.16;

export class Pads {
  private readonly target: PadTarget;
  private prev = new Set<number>();
  private held = new Map<number, number>();
  private known = new Set<string>();

  constructor(target: PadTarget) {
    this.target = target;
  }

  update(dt: number): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const down = new Set<number>();
    for (const pad of navigator.getGamepads()) {
      if (!pad || !pad.connected) continue;
      if (!this.known.has(pad.id)) {
        this.known.add(pad.id);
        this.target.connected(pad.id);
      }
      pad.buttons.forEach((b, i) => b.pressed && down.add(i));
      // The left stick works like the D-pad.
      const [x = 0, y = 0] = pad.axes;
      if (y < -0.6) down.add(UP);
      if (y > 0.6) down.add(DOWN);
      if (x < -0.6) down.add(LEFT);
      if (x > 0.6) down.add(RIGHT);
    }
    for (const i of down) {
      const fresh = !this.prev.has(i);
      let fire = fresh;
      if (i >= UP && i <= RIGHT) {
        const t = fresh ? 0 : (this.held.get(i) ?? 0) + dt;
        this.held.set(i, t);
        if (!fresh && t >= REPEAT_DELAY && t - dt < REPEAT_DELAY) fire = true;
        else if (!fresh && t > REPEAT_DELAY && Math.floor((t - REPEAT_DELAY) / REPEAT_EVERY) !== Math.floor((t - dt - REPEAT_DELAY) / REPEAT_EVERY)) fire = true;
      }
      if (fire) this.fire(i);
    }
    for (const i of this.prev) if (!down.has(i)) this.held.delete(i);
    this.prev = down;
  }

  private fire(i: number): void {
    if (this.target.inBattle()) {
      const key = BATTLE[i];
      if (key) this.target.battleKey(key);
      return;
    }
    const move: Record<number, MenuMove> = { [UP]: 'up', [DOWN]: 'down', [LEFT]: 'left', [RIGHT]: 'right', [A]: 'confirm', [B]: 'back', [START]: 'start' };
    if (move[i]) this.target.menu(move[i]);
  }
}
