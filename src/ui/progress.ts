import { DIFFICULTIES } from '../ai/ai.ts';
import type { Settings } from './settings.ts';

/**
 * Progress codes: a player's records, feats, discovered ages and online tallies as one line of
 * text, to carry from a PC to a phone (or keep as a backup when the browser's storage is cleared).
 * Loading a code *merges* — nothing already earned on this device is ever lost, and loading the
 * same code twice changes nothing.
 */
const PREFIX = 'MW1:';

interface Payload {
  r: Settings['records'];
  f: string[];
  a: number;
  o: Settings['online'];
}

export function exportProgress(s: Settings): string {
  const p: Payload = { r: s.records, f: s.feats, a: s.ageSeen, o: s.online };
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
    s.records[d] = { wins: Math.max(mine.wins, num(theirs.wins)), losses: Math.max(mine.losses, num(theirs.losses)), best: best.length ? Math.min(...best) : 0, streak: mine.streak ?? 0 };
  }
  if (Array.isArray(p.f)) for (const f of p.f) if (typeof f === 'string' && !s.feats.includes(f) && s.feats.length < 100) s.feats.push(f);
  s.ageSeen = Math.max(s.ageSeen, Math.min(4, num(p.a)));
  if (p.o && typeof p.o === 'object') {
    for (const [name, r] of Object.entries(p.o)) {
      if (!r || typeof r !== 'object' || name.length > 40) continue;
      const mine = s.online[name] ?? { w: 0, l: 0 };
      s.online[name] = { w: Math.max(mine.w, num(r.w)), l: Math.max(mine.l, num(r.l)) };
    }
  }
  return true;
}
