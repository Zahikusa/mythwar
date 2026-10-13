/**
 * An AI opponent that joins multiplayer like a player would — handy for trying online play
 * alone on a phone, and for long soak tests of the server and netcode.
 *
 *   node scripts/mpbot.ts                      # hosts a room on localhost:8787, prints its code
 *   node scripts/mpbot.ts ABCD                 # joins room ABCD
 *   node scripts/mpbot.ts --url ws://192.168.1.20:8787/mp --difficulty master
 *   node scripts/mpbot.ts --vs-bot --minutes 30   # two bots fight each other (soak test)
 *
 * The bot readies up for every battle (and rematch) and logs desyncs / resyncs.
 */
import { AI_PROFILES, AiController, DIFFICULTIES } from '../src/ai/ai.ts';
import type { Difficulty } from '../src/ai/ai.ts';
import { MpClient } from '../src/net/client.ts';
import type { NetGame } from '../src/net/netgame.ts';
import type { ScheduledCommand } from '../src/net/protocol.ts';
import { battleWorld } from '../src/net/protocol.ts';
import { hashWorld } from '../src/sim/hash.ts';
import type { Command } from '../src/sim/types.ts';
import { World } from '../src/sim/world.ts';

const args = process.argv.slice(2);
// (Any other flag — --help, say — would start a bot that runs until stopped.)
const valued = new Set(['--url', '--difficulty', '--minutes']);
const unknownFlags = args.filter((a, i) => a.startsWith('-') && !valued.has(a) && a !== '--vs-bot' && a !== '--debug' && !valued.has(args[i - 1]));
if (unknownFlags.length) {
  const help = unknownFlags.every((a) => a === '--help' || a === '-h');
  if (!help) console.error(`Unknown option ${unknownFlags.join(', ')}.`);
  for (const line of [
    'node scripts/mpbot.ts                      hosts a room on localhost:8787, prints its code',
    'node scripts/mpbot.ts ABCD                 joins room ABCD',
    'node scripts/mpbot.ts --url ws://192.168.1.20:8787/mp --difficulty master',
    'node scripts/mpbot.ts --vs-bot --minutes 30   two bots fight each other (soak test)',
    '--debug: keep the command log and, on a desync, diff the replica against a clean replay',
  ])
    console.log(line);
  process.exit(help ? 0 : 1);
}
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = opt('url') ?? 'ws://127.0.0.1:8787/mp';
const difficulty = (opt('difficulty') ?? 'adept') as Difficulty;
if (!DIFFICULTIES.includes(difficulty)) throw new Error(`difficulty: ${DIFFICULTIES.join(' / ')}`);
const minutes = Number(opt('minutes') ?? 0);
const code = args.find((a) => /^[A-Za-z0-9]{4}$/.test(a));
/** --debug: keep the command log and, on a desync, diff the replica against a clean replay. */
const DEBUG = args.includes('--debug');

/** One bot player: joins (or hosts), readies up, and lets the AI play its side. */
function bot(name: string, join?: string, onRoom?: (code: string) => void): MpClient {
  const mp = new MpClient({ name, url, storage: null });
  let asked = false;
  let ai: AiController | null = null;
  let game: NetGame | null = null;
  mp.listen({
    changed: () => {
      if (mp.welcomed && !asked) {
        asked = true;
        if (join) mp.join(join);
        else mp.host();
      }
      const room = mp.room;
      if (!room || mp.seat === null) return;
      onRoom?.(room.code);
      onRoom = undefined;
      const foe = room.seats[mp.seat === 0 ? 1 : 0];
      if (foe && room.phase !== 'playing' && !room.seats[mp.seat]?.ready) mp.ready(true);
    },
    battle: (g) => {
      game = g;
      // The AI reads the replica but must send its orders through the server.
      const view = new Proxy({} as World, {
        get: (_, key) => {
          if (key === 'apply') return (cmd: Parameters<World['apply']>[0]) => g.command(cmd);
          const w = g.world as unknown as Record<PropertyKey, unknown>;
          const v = w[key];
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(g.world) : v;
        },
      });
      const mult = g.world.players[g.seat].incomeMult;
      ai = new AiController(view, g.seat, AI_PROFILES[difficulty], (Math.random() * 1e9) | 0);
      g.world.players[g.seat].incomeMult = mult; // (the AI's handicap must not touch the replica)
      g.onEvents((ev) => {
        for (const e of ev) if (e.type === 'gameOver') console.log(`[${name}] battle over at ${g.world.time.toFixed(0)} s: ${e.winner === g.seat ? 'won' : 'lost'} (desyncs ${g.desyncs}, resyncs ${g.resyncs})`);
      });
      if (DEBUG) g.onDesync = () => diagnose(g);
      console.log(`[${name}] battle vs ${g.foeName}`);
    },
    error: (c, m) => console.log(`[${name}] error ${c}: ${m}`),
  });
  let lastState = '';
  mp.listen({
    changed: () => {
      if (mp.state !== lastState) console.log(`[${name}] ${new Date().toTimeString().slice(0, 8)} connection ${(lastState = mp.state)}`);
    },
  });
  // Debug: everything needed to replay the battle from its start (or the last snapshot).
  let base: World | null = null;
  let cmds: ScheduledCommand[] = [];
  if (DEBUG) {
    const orig = mp.conn.onMessage;
    mp.conn.onMessage = (m, at) => {
      if (m.type === 'start') {
        base = battleWorld(m.seed, m.trials, m.coop);
        cmds = [];
      } else if (m.type === 'snapshot') {
        base = World.deserialize(m.world);
        cmds = [];
      } else if (m.type === 'turn') cmds.push(...(m.cmds ?? []));
      orig(m, at);
    };
  }
  const diagnose = (g: NetGame) => {
    if (!base) return;
    const replay = World.deserialize(base.serialize());
    const sorted = cmds.filter((c) => c.tick > replay.tick).sort((x, y) => x.tick - y.tick);
    let i = 0;
    while (replay.tick < g.world.tick) {
      while (i < sorted.length && sorted[i].tick === replay.tick + 1) {
        const c = sorted[i++];
        replay.apply({ ...c.cmd, team: c.team } as Command);
      }
      replay.step();
      replay.drainEvents();
    }
    console.log(`[${name}] clean replay hash ${hashWorld(replay).toString(16)} vs replica ${hashWorld(g.world).toString(16)} at tick ${g.world.tick}`);
    const a = JSON.stringify(replay.serialize(), null, 1).split('\n');
    const b = JSON.stringify(g.world.serialize(), null, 1).split('\n');
    let shown = 0;
    for (let k = 0; k < Math.max(a.length, b.length) && shown < 40; k++) {
      if (a[k] !== b[k]) {
        console.log(`  line ${k}: replay ${a[k]?.trim()} | replica ${b[k]?.trim()}`);
        shown++;
      }
    }
  };
  mp.start();
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const g = game;
    if (!g) return;
    const before = g.world.tick;
    g.advance(dt);
    if (!g.paused && !g.over && ai) for (let t = before; t < g.world.tick; t++) ai.update(1 / 60);
  }, 16);
  // Progress every 30 s: proof the battle runs and both replicas agree with the server.
  setInterval(() => {
    const g = game;
    if (!g || g.over) return;
    const p = g.world.players;
    console.log(
      `[${name}] ${g.world.time.toFixed(0)} s · ages ${p[0].age}/${p[1].age} · citadels ${p[0].baseHp.toFixed(0)}/${p[1].baseHp.toFixed(0)} · summoned ${p[0].stats.summoned}/${p[1].stats.summoned} · rtt ${mp.conn.rtt.toFixed(1)} ms · desyncs ${g.desyncs} · resyncs ${g.resyncs}`,
    );
  }, 30_000);
  return mp;
}

if (args.includes('--vs-bot')) {
  bot('Bot A', undefined, (c) => bot('Bot B', c));
} else {
  bot(`${AI_PROFILES[difficulty].name} bot`, code, (c) => {
    if (!code) console.log(`Room ${c} — join it from Multiplayer (it appears under "Open battles").`);
  });
}
if (minutes > 0) setTimeout(() => process.exit(0), minutes * 60_000);
