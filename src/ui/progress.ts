import { DIFFICULTIES } from '../ai/ai.ts';
import { ONLINE_MAX, onlineRecord, putOnline } from './settings.ts';
import type { Settings } from './settings.ts';
import { FEATS, MAX_STARS, PINNACLE, starTotal } from './feats.ts';
import { PUZZLES } from '../sim/puzzles.ts';

/**
 * Progress codes: a player's records, feats, discovered ages, online tallies and solved riddles
 * as one line of text, to carry from a PC to a phone (or keep as a backup when the browser's
 * storage is cleared).
 * Loading a code *merges* — nothing already earned on this device is ever lost, and loading the
 * same code twice changes nothing.
 */
const PREFIX = 'MW1:';

interface Payload {
  r: Settings['records'];
  f: string[];
  a: number;
  o: Settings['online'];
  /** Riddles solved (added later: older codes have none). */
  q?: string[];
}

export function exportProgress(s: Settings): string {
  const p: Payload = { r: s.records, f: s.feats, a: s.ageSeen, o: s.online, q: s.riddles };
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Merges a progress code into `s`. Returns false (and changes nothing) if the code is invalid. */
export function importProgress(s: Settings, code: string): boolean {
  const text = code.trim().replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) return false;
  let p: Payload;
  try {
    const b64 = text.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Payload;
    if (!p || typeof p !== 'object') return false;
  } catch {
    return false;
  }
  const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  for (const d of DIFFICULTIES) {
    const theirs = p.r?.[d];
    if (!theirs || typeof theirs !== 'object') continue;
    const mine = s.records[d] ?? { wins: 0, losses: 0, best: 0, streak: 0 };
    const best = [mine.best, num(theirs.best)].filter((x) => x > 0);
    // (Best star ratings merge too — they were dropped here before, erasing this device's own.)
    const stars = Math.max(mine.stars ?? 0, Math.min(3, num(theirs.stars)));
    s.records[d] = { wins: Math.max(mine.wins, num(theirs.wins)), losses: Math.max(mine.losses, num(theirs.losses)), best: best.length ? Math.min(...best) : 0, streak: mine.streak ?? 0, stars };
  }
  // (Only feats and riddles this game knows: a made-up code can't fill the lists with junk.)
  if (Array.isArray(p.f)) for (const f of p.f) if (FEATS.some((k) => k.id === f) && !s.feats.includes(f)) s.feats.push(f);
  if (Array.isArray(p.q)) for (const q of p.q) if (PUZZLES.some((k) => k.id === q) && !s.riddles.includes(q)) s.riddles.push(q);
  // Stars from both devices together may complete the pinnacle.
  if (starTotal(s.records) >= MAX_STARS && !s.feats.includes(PINNACLE)) s.feats.push(PINNACLE);
  s.ageSeen = Math.max(s.ageSeen, Math.min(4, num(p.a)));
  if (p.o && typeof p.o === 'object') {
    // Names new here only while there's room (the code's newest first): the list keeps the last
    // ONLINE_MAX, and this device's own opponents must not be pushed out by imported ones.
    const entries = Object.entries(p.o).filter(([name, r]) => r && typeof r === 'object' && name.length <= 40);
    let room = ONLINE_MAX - Object.keys(s.online).length;
    const admitted = new Set<string>();
    for (const [name] of [...entries].reverse()) {
      if (Object.hasOwn(s.online, name)) admitted.add(name);
      else if (room > 0) {
        admitted.add(name);
        room--;
      }
    }
    for (const [name, r] of entries) {
      if (!admitted.has(name)) continue;
      const mine = onlineRecord(s, name) ?? { w: 0, l: 0 };
      putOnline(s.online, name, { w: Math.max(mine.w, num(r.w)), l: Math.max(mine.l, num(r.l)) });
    }
  }
  return true;
}
