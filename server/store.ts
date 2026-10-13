/**
 * What the game server remembers between restarts (Lens #92): for now each network's Hall of
 * champions (#86). A deliberately small seam — the LAN server keeps it in a JSON file next to
 * itself; an internet server would put a database behind the same two calls.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
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
  /** Saves in the background (the server's loop must not wait for the disk). */
  save(state: StoredState): void;
  /** Saves before returning (shutdown). */
  saveNow?(state: StoredState): void;
}

/**
 * A store in one JSON file, written atomically (a temp file renamed over it: a crash mid-write
 * keeps the previous file). Background saves run one at a time; a newer state waiting behind a
 * write replaces any older one, and nothing written in the background lands after a saveNow().
 */
export function fileStore(path: string, log?: (line: string) => void): ServerStore & { idle(): Promise<void> } {
  let writing: Promise<void> | null = null;
  let pending: StoredState | null = null;
  let closed = false;
  let seq = 0;
  const fail = (e: unknown) => log?.(`could not save ${path}: ${(e as Error).message}`);
  const write = (state: StoredState) => {
    const tmp = `${path}.${++seq}.tmp`;
    writing = (async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(tmp, JSON.stringify(state));
        // (The rename is synchronous, on the main thread: it can't overtake — or be overtaken
        // by — a saveNow(), which also runs there. Once closed, the background write is void.)
        if (closed) await unlink(tmp).catch(() => {});
        else renameSync(tmp, path);
      } catch (e) {
        fail(e);
      }
    })().then(() => {
      writing = null;
      const next = pending;
      pending = null;
      if (next && !closed) write(next);
    });
  };
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
      if (closed) return;
      if (writing) pending = state;
      else write(state);
    },
    saveNow(state) {
      closed = true;
      pending = null;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.final.tmp`;
        writeFileSync(tmp, JSON.stringify(state));
        renameSync(tmp, path);
      } catch (e) {
        fail(e);
      }
    },
    /** Resolves once no background save is running or waiting (tests). */
    async idle() {
      while (writing) await writing;
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
