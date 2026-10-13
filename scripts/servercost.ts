/**
 * What one online battle costs a game server (Lens #96): bandwidth and CPU per match, measured on
 * the real lobby and match code with simulated players at a human pace (an order every ~2 s, a
 * ping every 2 s), on a fake clock so it runs faster than real time.
 *
 *   node scripts/servercost.ts [matches=20] [minutes=10] [turnTicks=2]
 *
 * Wire bytes add WebSocket framing (2–8 B per message) and TCP/IP headers (~52 B per packet,
 * one packet per message — the worst case; TLS adds ~25 B more per record on a public server).
 */
import { Lobby } from '../server/lobby.ts';
import { PROTOCOL_VERSION } from '../src/net/protocol.ts';
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts';
import { AGE_UNITS, TICK } from '../src/sim/data.ts';
import { simFingerprint } from '../src/sim/fingerprint.ts';

const matches = Number(process.argv[2] ?? 20);
const minutes = Number(process.argv[3] ?? 10);
const turnTicks = Number(process.argv[4] ?? 2);

let now = 1000;
const lobby = new Lobby({ now: () => now, countdown: 1, turnTicks });

interface Player {
  send: (m: ClientMsg) => void;
  down: number;
  downMsgs: number;
  up: number;
  upMsgs: number;
  seat: number;
  nextOrder: number;
  nextPing: number;
  seq: number;
  room: string;
  /** When its battle ended (null: still running at the end). */
  overAt: number | null;
}

const players: Player[] = [];
function player(name: string): Player {
  const p: Player = { send: () => {}, down: 0, downMsgs: 0, up: 0, upMsgs: 0, seat: -1, nextOrder: 0, nextPing: 0, seq: 0, room: '', overAt: null };
  const h = lobby.connect({
    send: (d) => {
      p.down += d.length;
      p.downMsgs++;
      const m = JSON.parse(d) as ServerMsg;
      if (m.type === 'room') p.room = m.room.code;
      if (m.type === 'start') p.seat = m.seat;
      if (m.type === 'over') p.overAt = now;
    },
    close: () => {},
  });
  p.send = (m) => {
    const text = JSON.stringify(m);
    p.up += text.length;
    p.upMsgs++;
    h.message(text);
  };
  p.send({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name });
  players.push(p);
  return p;
}

for (let i = 0; i < matches; i++) {
  const a = player(`A${i}`);
  const b = player(`B${i}`);
  a.send({ type: 'host' });
  b.send({ type: 'join', code: a.room });
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
}
// The lobby chatter before the battles isn't what we're measuring.
for (const p of players) p.down = p.downMsgs = p.up = p.upMsgs = 0;

const t0 = now;
const cpu0 = process.cpuUsage();
const wall0 = performance.now();
const units = AGE_UNITS[0];
let rnd = 7;
const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
while (now - t0 < minutes * 60_000) {
  now += 4; // the server's loop interval
  lobby.update();
  for (const p of players) {
    if (p.seat < 0 || p.overAt !== null) continue;
    if (now >= p.nextOrder) {
      p.nextOrder = now + 1000 + random() * 2000;
      p.send({ type: 'cmd', seq: ++p.seq, cmd: { type: 'train', unitId: units[Math.floor(random() * units.length)].id, lane: Math.floor(random() * 3) } as never });
    }
    if (now >= p.nextPing) {
      p.nextPing = now + 2000;
      p.send({ type: 'ping', t: now, rtt: 40 });
    }
  }
}
const cpu = process.cpuUsage(cpu0);
const wall = (performance.now() - wall0) / 1000;

const sum = (f: (p: Player) => number) => players.reduce((n, p) => n + f(p), 0);
// Rates over each player's time in battle (a battle that ended early stops counting there).
const active = sum((p) => ((p.overAt ?? now) - t0) / 1000);
const perClient = (bytes: number) => bytes / active;
const WS = 4;
const TCP = 52;
const downPayload = perClient(sum((p) => p.down));
const downWire = perClient(sum((p) => p.down + p.downMsgs * (WS + TCP)));
const upPayload = perClient(sum((p) => p.up));
const upWire = perClient(sum((p) => p.up + p.upMsgs * (WS + 6 + TCP)));
const cpuSecs = (cpu.user + cpu.system) / 1e6;
const perMatchCore = cpuSecs / (active / 2);

console.log(`${matches} matches × ${minutes} min simulated in ${wall.toFixed(1)} s (turns every ${turnTicks} ticks = ${(1 / (turnTicks * TICK)).toFixed(0)}/s); ${players.filter((p) => p.overAt !== null).length / 2} ended early`);
console.log(`per player, server → client: ${(downPayload / 1024).toFixed(2)} kB/s payload, ~${(downWire / 1024).toFixed(2)} kB/s on the wire (${(sum((p) => p.downMsgs) / active).toFixed(1)} messages/s)`);
console.log(`per player, client → server: ${(upPayload / 1024).toFixed(2)} kB/s payload, ~${(upWire / 1024).toFixed(2)} kB/s on the wire`);
const matchWire = (downWire + upWire) * 2;
console.log(`per match: ~${(matchWire / 1024).toFixed(1)} kB/s both ways = ~${((matchWire * 3600) / 1024 / 1024).toFixed(0)} MB per hour of play`);
console.log(`server CPU: ${(perMatchCore * 100).toFixed(3)}% of one core per running match (${cpuSecs.toFixed(1)} s CPU for ${(active / 2 / 60).toFixed(0)} match-minutes)`);
