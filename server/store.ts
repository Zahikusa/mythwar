/**
 * What the game server remembers between restarts (Lens #92): for now each network's Hall of
 * champions (#86). A deliberately small seam — the LAN server keeps it in a JSON file next to
 * itself; an internet server would put a database behind the same two calls.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HallEntry } from '../src/net/protocol.ts';

export interface StoredState {
  v: 1;
  /** Salt for the hashed network keys (a public IP address is never stored as such). */
  salt?: string;
  /** Hall of champions per network key ('lan', or a salted hash of a public network), most recently active last. */
  halls: Record<string, HallEntry[]>;
}

export interface ServerStore {
  /** The state saved last time, or null (none yet, or unreadable). */
  load(): StoredState | null;
  save(state: StoredState): void;
}

/** A store in one JSON file, written atomically (a crash mid-write keeps the previous file). */
export function fileStore(path: string, log?: (line: string) => void): ServerStore {
  return {
    load() {
      try {
        if (!existsSync(path)) return null;
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        return raw && raw.v === 1 && raw.halls && typeof raw.halls === 'object' ? (raw as StoredState) : null;
      } catch {
        log?.(`could not read ${path} — starting with an empty Hall of champions`);
        return null;
      }
    },
    save(state) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        writeFileSync(tmp, JSON.stringify(state));
        renameSync(tmp, path);
      } catch (e) {
        log?.(`could not save ${path}: ${(e as Error).message}`);
      }
    },
  };
}

/** A store in memory (tests). */
export function memoryStore(initial: StoredState | null = null): ServerStore & { saved: StoredState | null; saves: number } {
  const store = {
    saved: initial,
    saves: 0,
    load: () => (store.saved ? (JSON.parse(JSON.stringify(store.saved)) as StoredState) : null),
    save(state: StoredState) {
      store.saved = JSON.parse(JSON.stringify(state)) as StoredState;
      store.saves++;
    },
  };
  return store;
}
