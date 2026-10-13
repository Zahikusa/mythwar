import { DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import { TRIAL_ORDER } from '../sim/data.ts';
import { SIGILS } from '../net/protocol.ts';
import type { TrialId } from '../sim/data.ts';

export interface DifficultyRecord {
  wins: number;
  losses: number;
  /** Fastest win in seconds (0 = none). */
  best: number;
  /** Current run: +n wins in a row, -n defeats in a row (0 = none yet). */
  streak?: number;
  /** Best battle rating (0-3 stars, see battleStars). */
  stars?: number;
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
  /** Name shown to other players in multiplayer ('' = not chosen yet). */
  playerName: string;
  /** Online results per opponent name (most recent opponents only). */
  online: Record<string, { w: number; l: number }>;
  /** Show the opponent's quick messages in online battles. */
  emotes: boolean;
  /** Mark the card that counters the selected lane ("Counter!"). Off = read the lanes yourself. */
  advice: boolean;
  /** Highest age (index) this player has ever reached — later ages stay a mystery until then. */
  ageSeen: number;
  /** Feats earned (ids, see src/ui/feats.ts). */
  feats: string[];
  /** Trials chosen on the foe screen for the next battles. */
  trials: TrialId[];
  /** Quick battles (chosen on the foe screen). */
  quick: boolean;
  /** Colour-blind friendly: the foe is orange instead of red (blue vs orange reads for every
   *  common colour-vision deficiency; red turns grey for protanopes). */
  colorblind: boolean;
  /** Riddles of war solved (ids, see src/sim/puzzles.ts). */
  riddles: string[];
  /** The age battles against the AI begin in (Lens #71; only ages reached in battle). */
  startAge: number;
  /** The player's sigil (Lens #75: index into SIGILS, -1 = none). */
  sigil: number;
}

export { SIGILS } from '../net/protocol.ts';

/** "☀ Zoë", "☀", "Zoë" or '' — the player as the HUD and results show them. */
export function playerLabel(s: Settings): string {
  const sig = s.sigil >= 0 ? SIGILS[s.sigil] ?? '' : '';
  return [sig, s.playerName].filter(Boolean).join(' ');
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
  playerName: '',
  online: {},
  emotes: true,
  advice: true,
  ageSeen: 0,
  feats: [],
  trials: [],
  quick: false,
  colorblind: false,
  riddles: [],
  startAge: 0,
  sigil: -1,
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
  return { ...DEFAULTS, shake: !calm, hintsSeen: [], records: {}, online: {}, feats: [], trials: [], riddles: [] };
}

/** Stored settings may come from an older build or be hand-edited: keep only sane values. */
function sanitize(s: Settings): Settings {
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const records: Settings['records'] = {};
  const raw = s.records && typeof s.records === 'object' ? s.records : {};
  for (const d of DIFFICULTIES) {
    const r = raw[d];
    if (r && typeof r === 'object') records[d] = { wins: Number(r.wins) || 0, losses: Number(r.losses) || 0, best: Number(r.best) || 0, streak: Math.round(Number(r.streak) || 0), stars: Math.max(0, Math.min(3, Math.round(Number(r.stars) || 0))) };
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
    playerName: typeof s.playerName === 'string' ? s.playerName.slice(0, 40) : '',
    online: sanitizeOnline(s.online),
    emotes: bool(s.emotes, true),
    advice: bool(s.advice, true),
    ageSeen: Math.max(0, Math.min(4, Math.floor(Number(s.ageSeen) || 0))),
    quick: bool(s.quick, false),
    colorblind: bool(s.colorblind, false),
    startAge: Math.max(0, Math.min(4, Math.floor(Number(s.startAge) || 0))),
    sigil: Number.isInteger(s.sigil) && s.sigil >= -1 && s.sigil < SIGILS.length ? s.sigil : -1,
    riddles: Array.isArray(s.riddles) ? [...new Set(s.riddles.filter((x): x is string => typeof x === 'string'))].slice(0, 50) : [],
    trials: Array.isArray(s.trials) ? TRIAL_ORDER.filter((t) => s.trials.includes(t)) : [],
    feats: Array.isArray(s.feats) ? [...new Set(s.feats.filter((x): x is string => typeof x === 'string'))].slice(0, 100) : [],
  };
}

const ONLINE_MAX = 40;

function sanitizeOnline(raw: unknown): Settings['online'] {
  const out: Settings['online'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, r] of Object.entries(raw as Record<string, { w?: unknown; l?: unknown }>).slice(-ONLINE_MAX)) {
    if (r && typeof r === 'object') out[name.slice(0, 40)] = { w: Math.max(0, Number(r.w) || 0), l: Math.max(0, Number(r.l) || 0) };
  }
  return out;
}

/** Counts an online battle against `foe` (kept for the most recent opponents). */
export function recordOnline(s: Settings, foe: string, won: boolean): void {
  const r = s.online[foe] ?? { w: 0, l: 0 };
  delete s.online[foe]; // re-insert: most recent last
  if (won) r.w++;
  else r.l++;
  s.online[foe] = r;
  const names = Object.keys(s.online);
  for (const n of names.slice(0, Math.max(0, names.length - ONLINE_MAX))) delete s.online[n];
  saveSettings(s);
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Par time per foe for the third star (a little slower than a strong player's typical win). */
export const PAR_TIME: Record<Difficulty, number> = { novice: 8 * 60, adept: 12 * 60, master: 14 * 60, mythic: 16 * 60 };

/** The par time for the third star: quick battles are about a third shorter. */
export function parTime(d: Difficulty, quick = false): number {
  return quick ? Math.round((PAR_TIME[d] * 2) / 3 / 60) * 60 : PAR_TIME[d];
}

/**
 * The battle's rating: one star each for the victory, for keeping the citadel above half health,
 * and for winning within the foe's par time. (The last two only count with the first.)
 */
export function battleStars(won: boolean, citadelFrac: number, time: number, d: Difficulty, quick = false): { stars: number; parts: { label: string; got: boolean }[] } {
  const par = parTime(d, quick);
  const parts = [
    { label: 'Victory', got: won },
    { label: 'Citadel above half', got: won && citadelFrac > 0.5 },
    { label: `Within ${Math.round(par / 60)} minutes`, got: won && time <= par },
  ];
  return { stars: parts.filter((p) => p.got).length, parts };
}

export function recordResult(s: Settings, d: Difficulty, won: boolean, time: number, stars = 0, quick = false): void {
  const r = s.records[d] ?? { wins: 0, losses: 0, best: 0 };
  if (won) {
    r.wins++;
    // (Best times are kept for standard battles: a quick one isn't the same race.)
    if (!quick && (!r.best || time < r.best)) r.best = Math.round(time);
  } else r.losses++;
  r.stars = Math.max(r.stars ?? 0, stars);
  const run = r.streak ?? 0;
  r.streak = won ? Math.max(0, run) + 1 : Math.min(0, run) - 1;
  s.records[d] = r;
  saveSettings(s);
}
