import type { GameSave } from './game.ts';

/** Battle-in-progress persistence (phones often discard background tabs). */
const KEY = 'mythwar.battle.v1';

export function saveBattle(save: GameSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full or unavailable: the battle simply won't be resumable.
  }
}

export function loadBattle(): GameSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as GameSave;
    return save && (save.v === 1 || save.v === 2) ? save : null;
  } catch {
    return null;
  }
}

export function clearBattle(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
