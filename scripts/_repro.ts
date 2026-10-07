// Scratch: reproduce the bot soak desync headlessly. Not committed.
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import { Lobby } from '../server/lobby.ts';
import { NetGame } from '../src/net/netgame.ts';
import { PROTOCOL_VERSION } from '../src/net/protocol.ts';
import type { ScheduledCommand, ServerMsg } from '../src/net/protocol.ts';
import { simFingerprint } from '../src/sim/fingerprint.ts';
import { hashWorld } from '../src/sim/hash.ts';
import { World } from '../src/sim/world.ts';

let now = 0;
let seed = Number(process.argv[2] ?? 1);
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const lobby = new Lobby({ now: () => now, countdown: 1 });
const queue: { at: number; n: number; fn: () => void }[] = [];
let n = 0;
const later = (fn: () => void, lane: { last: number }) => {
  const at = Math.max(lane.last, now + 30 + rand() * 40);
  lane.last = at;
  queue.push({ at, n: n++, fn });
};
const log: ScheduledCommand[] = [];
let startSeed = 0;

type P = { name: string; game: NetGame | null; ai: AiController | null; send: (m: unknown) => void; inbox: ServerMsg[] };
function player(name: string): P {
  const up = { last: 0 };
  const down = { last: 0 };
  const p: P = { name, game: null, ai: null, send: () => {}, inbox: [] };
  const h = lobby.connect({
    send: (d) =>
      later(() => {
        const m = JSON.parse(d) as ServerMsg;
        p.inbox.push(m);
        if (m.type === 'start') {
          startSeed = m.seed;
          const g = new NetGame({ seat: m.seat, names: m.names, seed: m.seed, countdown: m.countdown, send: (x) => (p.send(x), true), now: () => now });
          p.game = g;
          const view = new Proxy({} as World, {
            get: (_, key) => {
              if (key === 'apply') return (c: never) => g.command(c);
              const v = (g.world as any)[key];
              return typeof v === 'function' ? v.bind(g.world) : v;
            },
          });
          p.ai = new AiController(view, m.seat, AI_PROFILES.master, 77 + m.seat);
          g.world.players[m.seat].incomeMult = 1;
          g.onDesync = () => {
            console.log(`${name}: DESYNC at tick ${g.world.tick}`);
            const replay = new World({ seed: startSeed });
            let i = 0;
            const sorted = [...log].sort((a, b) => a.tick - b.tick);
            while (replay.tick < g.world.tick) {
              while (i < sorted.length && sorted[i].tick === replay.tick + 1) replay.apply({ ...sorted[i++].cmd, team: sorted[i - 1].team } as never);
              replay.step();
              replay.drainEvents();
            }
            console.log('replay hash', hashWorld(replay).toString(16), 'client', hashWorld(g.world).toString(16));
            const a = JSON.stringify(replay.serialize(), null, 1).split('\n');
            const b = JSON.stringify(g.world.serialize(), null, 1).split('\n');
            let shown = 0;
            for (let k = 0; k < Math.max(a.length, b.length) && shown < 30; k++) if (a[k] !== b[k]) (console.log(k, 'replay:', a[k], '| client:', b[k]), shown++);
            process.exit(1);
          };
        } else if (m.type === 'turn' && name === 'A') for (const c of m.cmds ?? []) log.push(c);
        p.game?.receive(m, now);
      }, down),
    close: () => {},
  });
  p.send = (m) => later(() => h.message(JSON.stringify(m)), up);
  p.send({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name });
  return p;
}

const a = player('A');
const b = player('B');
const step = (ms: number) => {
  for (let t = 0; t < ms; t++) {
    now++;
    queue.sort((x, y) => x.at - y.at || x.n - y.n);
    while (queue.length && queue[0].at <= now) queue.shift()!.fn();
    if (now % 4 === 0) lobby.update();
    if (now % 16 === 0) {
      for (const p of [a, b]) {
        const g = p.game;
        if (!g) continue;
        const before = g.world.tick;
        g.advance(0.016);
        if (!g.paused && !g.over && p.ai) for (let k = before; k < g.world.tick; k++) p.ai.update(1 / 60);
      }
    }
  }
};
step(500);
a.send({ type: 'host' });
step(500);
const code = (a.inbox.find((m) => m.type === 'room') as any).room.code;
b.send({ type: 'join', code });
step(500);
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
for (let s = 0; s < 25 * 60; s++) {
  step(1000);
  if (a.game?.over) break;
  if (s % 60 === 0) console.log(`t=${s}s tick ${a.game?.world.tick} desyncs ${a.game?.desyncs}/${b.game?.desyncs}`);
}
console.log('done', a.game?.world.tick, a.game?.desyncs, b.game?.desyncs);
