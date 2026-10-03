import type { Difficulty } from '../ai/ai.ts';

export interface DifficultyRecord {
  wins: number;
  losses: number;
  /** Fastest win in seconds (0 = none). */
  best: number;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  shake: boolean;
  hints: boolean;
  lowQuality: boolean;
  difficulty: Difficulty;
  tutorialSeen: boolean;
  hintsSeen: string[];
  records: Partial<Record<Difficulty, DifficultyRecord>>;
}

const KEY = 'mythwar.settings.v1';

const DEFAULTS: Settings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  shake: true,
  hints: true,
  lowQuality: false,
  difficulty: 'novice',
  tutorialSeen: false,
  hintsSeen: [],
  records: {},
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed, hintsSeen: [...(parsed.hintsSeen ?? [])], records: { ...(parsed.records ?? {}) } };
    }
  } catch {
    // ignore (private mode / corrupted)
  }
  return { ...DEFAULTS, hintsSeen: [], records: {} };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function recordResult(s: Settings, d: Difficulty, won: boolean, time: number): void {
  const r = s.records[d] ?? { wins: 0, losses: 0, best: 0 };
  if (won) {
    r.wins++;
    if (!r.best || time < r.best) r.best = Math.round(time);
  } else r.losses++;
  s.records[d] = r;
  saveSettings(s);
}
