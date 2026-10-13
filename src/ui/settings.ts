import { DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import { TRIAL_ORDER } from '../sim/data.ts';
import { SIGILS } from '../net/protocol.ts';
import type { TrialId } from '../sim/data.ts';
import { mergeProgress, progressOf } from './progress.ts';

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

/**
 * One battle in the playtest journal (Lens #91): what a designer wants to know after a playtest,
 * kept on this device only and copied out by the player (Settings → Copy playtest journal).
 */
export interface JournalEntry {
  /** When it ended (ms since 1970). */
  at: number;
  /** 'ai' (vs a general), 'online' (vs a player), 'coop' (allies vs the AI). */
  mode: 'ai' | 'online' | 'coop';
  /** The general's difficulty (ai, coop) or the opponent's name (online). */
  foe: string;
  won: boolean;
  /** Battle length in seconds. */
  secs: number;
  /** Stars earned (ai only). */
  stars: number;
  /** The age the player ended in (0 = Fae Wilds). */
  age: number;
  /** Creatures summoned: guardians, hunters, mystics, dragons. */
  summons: [number, number, number, number];
  kills: number;
  losses: number;
  powers: number;
  /** Quick battle / later start / trials taken. */
  quick: boolean;
  startAge: number;
  trials: number;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  /** Preferred battle speed (1 or 2). */
  speed: number;
  shake: boolean;
  /** Vibration on phones that can (Android): summons, powers, the verdict. */
  haptics: boolean;
  hints: boolean;
  lowQuality: boolean;
  /** The battery saver was switched on by the game (a slow stretch), not by the player: only for that visit. */
  lowQualityAuto: boolean;
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
  /** The last battles, for playtests (Lens #91; most recent last). */
  journal: JournalEntry[];
  /** When records were last reset on this device (ms; 0 = never) — other tabs honour it. */
  resetAt: number;
  /** The title's "get the app" offer (ui/install.ts): 0 = never put away, else when it first
   *  was (ms; it comes back once, days later), -1 = put away twice (only the small button). */
  installHint: number;
  /** The full install sheet was offered after a finished battle (once). */
  installSheet: boolean;
  /** The installed app's first-launch welcome was shown. */
  appWelcome: boolean;
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
  haptics: true,
  hints: true,
  lowQuality: false,
  lowQualityAuto: false,
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
  journal: [],
  resetAt: 0,
  installHint: 0,
  installSheet: false,
  appWelcome: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // (Vibration used to share the screen-shake switch: whoever turned that off keeps it off.)
        if (typeof parsed.haptics !== 'boolean') parsed.haptics = parsed.shake !== false;
        const s = sanitize({ ...DEFAULTS, ...parsed });
        mergeStored(s, PROGRESS_KEY);
        return s;
      }
    }
  } catch {
    // ignore (private mode / corrupted)
  }
  // First run: respect the OS "reduce motion" preference.
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { ...DEFAULTS, shake: !calm, hintsSeen: [], records: {}, online: {}, feats: [], trials: [], riddles: [], journal: [] };
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
    haptics: bool(s.haptics, true),
    hints: bool(s.hints, DEFAULTS.hints),
    lowQuality: bool(s.lowQuality, false),
    lowQualityAuto: bool(s.lowQualityAuto, false),
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
    journal: sanitizeJournal(s.journal),
    resetAt: typeof s.resetAt === 'number' && Number.isFinite(s.resetAt) ? s.resetAt : 0,
    installHint: typeof s.installHint === 'number' && Number.isFinite(s.installHint) && s.installHint >= -1 ? s.installHint : 0,
    installSheet: bool(s.installSheet, false),
    appWelcome: bool(s.appWelcome, false),
  };
}

const JOURNAL_MAX = 30;

function sanitizeJournal(raw: unknown): JournalEntry[] {
  if (!Array.isArray(raw)) return [];
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .slice(-JOURNAL_MAX)
    .map((e) => {
      const sm = Array.isArray(e.summons) ? e.summons : [];
      return {
        at: n(e.at),
        mode: e.mode === 'online' || e.mode === 'coop' ? e.mode : 'ai',
        foe: typeof e.foe === 'string' ? e.foe.slice(0, 40) : '',
        won: e.won === true,
        secs: n(e.secs),
        stars: Math.min(3, n(e.stars)),
        age: Math.min(4, n(e.age)),
        summons: [n(sm[0]), n(sm[1]), n(sm[2]), n(sm[3])],
        kills: n(e.kills),
        losses: n(e.losses),
        powers: n(e.powers),
        quick: e.quick === true,
        startAge: Math.min(4, n(e.startAge)),
        trials: Math.min(3, n(e.trials)),
      };
    });
}

/** Adds a battle to the playtest journal (the last JOURNAL_MAX are kept) and saves. */
export function addJournal(s: Settings, e: JournalEntry): void {
  s.journal.push(e);
  if (s.journal.length > JOURNAL_MAX) s.journal.splice(0, s.journal.length - JOURNAL_MAX);
  saveSettings(s);
}

/** The journal as plain text, one battle per line, for pasting to whoever runs the playtest. */
export function journalText(s: Settings, version = ''): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  const lines = s.journal.map((e) => {
    const d = new Date(e.at);
    const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const extras = [e.quick ? 'quick' : '', e.startAge ? `start age ${e.startAge + 1}` : '', e.trials ? `${e.trials} trial(s)` : ''].filter(Boolean).join(', ');
    return `${when} | ${e.mode} vs ${e.foe} | ${e.won ? 'WON' : 'lost'} in ${Math.floor(e.secs / 60)}:${pad(e.secs % 60)}${e.mode === 'ai' ? ` | ${e.stars}★` : ''} | age ${e.age + 1} | summons G${e.summons[0]} H${e.summons[1]} M${e.summons[2]}${e.summons[3] ? ` D${e.summons[3]}` : ''} | kills ${e.kills} lost ${e.losses} | powers ${e.powers}${extras ? ` | ${extras}` : ''}`;
  });
  return [`Mythwar playtest journal${version ? ` (v${version})` : ''} — ${s.journal.length} battle(s), oldest first`, ...lines].join('\n');
}

export const ONLINE_MAX = 40;

function sanitizeOnline(raw: unknown): Settings['online'] {
  const out: Settings['online'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, r] of Object.entries(raw as Record<string, { w?: unknown; l?: unknown }>).slice(-ONLINE_MAX)) {
    if (r && typeof r === 'object') putOnline(out, name.slice(0, 40), { w: Math.max(0, Number(r.w) || 0), l: Math.max(0, Number(r.l) || 0) });
  }
  return out;
}

/**
 * The tally against `name`, if any. Names are typed by players, so only own keys count: an
 * opponent called "constructor" or "__proto__" must not find (and bump) Object's own members.
 */
export function onlineRecord(s: Settings, name: string): { w: number; l: number } | null {
  return Object.hasOwn(s.online, name) ? s.online[name] : null;
}

/** Sets a tally — defined, not assigned: assigning "__proto__" would swap the object's prototype. */
export function putOnline(online: Settings['online'], name: string, r: { w: number; l: number }): void {
  Object.defineProperty(online, name, { value: r, enumerable: true, writable: true, configurable: true });
}

/** Counts an online battle against `foe` (kept for the most recent opponents). */
export function recordOnline(s: Settings, foe: string, won: boolean): void {
  const r = onlineRecord(s, foe) ?? { w: 0, l: 0 };
  delete s.online[foe]; // re-insert: most recent last
  if (won) r.w++;
  else r.l++;
  putOnline(s.online, foe, r);
  const names = Object.keys(s.online);
  for (const n of names.slice(0, Math.max(0, names.length - ONLINE_MAX))) delete s.online[n];
  saveSettings(s);
}

/**
 * Progress kept a second time, under a key no older build of the game writes: a tab still on an
 * older build saves settings without the fields it doesn't know (riddles, stars…) — this brings
 * them back on the next load.
 */
const PROGRESS_KEY = 'mythwar.progress.v1';

/** Merges the progress stored under `key` (settings or the progress copy) into `s`. */
function mergeStored(s: Settings, key: string): void {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return;
    mergeProgress(s, key === KEY ? { r: v.records, f: v.feats, a: v.ageSeen, o: v.online, q: v.riddles, z: v.resetAt } : v, true);
    // The playtest journal too (settings only; not from before a reset): battles by when they ended.
    if (key === KEY && (Number(v.resetAt) || 0) >= s.resetAt) {
      const seen = new Set(s.journal.map((e) => e.at));
      const theirs = sanitizeJournal(v.journal).filter((e) => !seen.has(e.at));
      if (theirs.length) s.journal = [...s.journal, ...theirs].sort((a, b) => a.at - b.at).slice(-JOURNAL_MAX);
    }
  } catch {
    // unreadable: nothing to merge
  }
}

/**
 * Saves the settings. Another tab — or an older build of the game — may have saved since this
 * one loaded: what only grows (records, feats, riddles, ages, rivals) is merged in first, so no
 * save ever undoes another's progress.
 */
export function saveSettings(s: Settings): void {
  mergeStored(s, KEY);
  mergeStored(s, PROGRESS_KEY);
  write(s);
}

function write(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressOf(s)));
  } catch {
    // ignore
  }
}

/**
 * Another tab saved (a `storage` event for `key`): its progress joins this tab's settings, so the
 * screens here show it too. True when the key was one of ours.
 */
export function mergeFromOtherTab(s: Settings, key: string | null): boolean {
  if (key !== KEY && key !== PROGRESS_KEY) return false;
  mergeStored(s, key);
  return true;
}

/** Settings → Reset records: the one save that does take progress back (no merge). */
export function resetRecords(s: Settings): void {
  s.records = {};
  s.online = {};
  s.journal = [];
  // (Other tabs still holding the old records see this and let them go — see mergeProgress.)
  s.resetAt = Date.now();
  write(s);
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
