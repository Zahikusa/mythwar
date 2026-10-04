import { DIFFICULTIES } from '../ai/ai.ts';
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
  muted: boolean;
  /** Preferred battle speed (1 or 2). */
  speed: number;
  shake: boolean;
  hints: boolean;
  lowQuality: boolean;
  fullscreen: boolean;
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
  muted: false,
  speed: 1,
  shake: true,
  hints: true,
  lowQuality: false,
  fullscreen: true,
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
      if (parsed && typeof parsed === 'object') return sanitize({ ...DEFAULTS, ...parsed });
    }
  } catch {
    // ignore (private mode / corrupted)
  }
  // First run: respect the OS "reduce motion" preference.
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { ...DEFAULTS, shake: !calm, hintsSeen: [], records: {} };
}

/** Stored settings may come from an older build or be hand-edited: keep only sane values. */
function sanitize(s: Settings): Settings {
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const records: Settings['records'] = {};
  const raw = s.records && typeof s.records === 'object' ? s.records : {};
  for (const d of DIFFICULTIES) {
    const r = raw[d];
    if (r && typeof r === 'object') records[d] = { wins: Number(r.wins) || 0, losses: Number(r.losses) || 0, best: Number(r.best) || 0 };
  }
  return {
    master: vol(s.master, DEFAULTS.master),
    music: vol(s.music, DEFAULTS.music),
    sfx: vol(s.sfx, DEFAULTS.sfx),
    muted: bool(s.muted, false),
    speed: s.speed === 2 ? 2 : 1,
    shake: bool(s.shake, DEFAULTS.shake),
    hints: bool(s.hints, DEFAULTS.hints),
    lowQuality: bool(s.lowQuality, false),
    fullscreen: bool(s.fullscreen, DEFAULTS.fullscreen),
    difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : DEFAULTS.difficulty,
    tutorialSeen: bool(s.tutorialSeen, false),
    hintsSeen: Array.isArray(s.hintsSeen) ? s.hintsSeen.filter((x): x is string => typeof x === 'string') : [],
    records,
  };
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
