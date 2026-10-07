import { Game } from '../game.ts';
import { AGES, QUEUE_MAX, SELL_REFUND, TICK, TURRETS, UNITS, blessingCost } from '../sim/data.ts';
import { hashWorld } from '../sim/hash.ts';
import type { Command, CommandResult, Team } from '../sim/types.ts';
import { World } from '../sim/world.ts';
import type { ClientMsg, EndReason, NetCommand, PauseState, ScheduledCommand, ServerMsg } from './protocol.ts';

const TICK_MS = TICK * 1000;
/** Turn-arrival history used to size the jitter buffer. */
const CLOCK_WINDOW = 4000;
const MIN_BUFFER = 20;
const MAX_BUFFER = 500;
/** Further behind than this (ticks), the replica catches up without effects. */
const SILENT_CATCH_UP = 180;
const SAMPLE_EVERY = 5;
/** Our own orders not echoed back by the server within this many ms are forgotten. */
const MINE_TIMEOUT = 4000;

export interface NetGameInit {
  seat: Team;
  names: [string, string];
  /** New battle from this seed... */
  seed?: number;
  /** ...or join it in progress. */
  snapshot?: Extract<ServerMsg, { type: 'snapshot' }>;
  /** Seconds until the first tick (new battles). */
  countdown?: number;
  send: (msg: ClientMsg) => boolean;
  now?: () => number;
}

/**
 * A battle against another human. The server decides which commands happen at which tick;
 * this replica plays those ticks out smoothly a little behind the server (an adaptive jitter
 * buffer absorbs Wi-Fi hiccups), checks its state hash against the server's and asks for a
 * snapshot if it ever drifts or falls hopelessly behind.
 */
export class NetGame extends Game {
  readonly seat: Team;
  readonly names: [string, string];
  /** The server's verdict once the battle is decided. */
  result: { winner: Team; reason: EndReason } | null = null;
  /** Set while the server holds the battle (a player paused or is away). */
  netPause: PauseState | null = null;
  /** performance.now() when netPause arrived (forfeitIn counts from here). */
  netPauseAt = 0;
  /** performance.now() at which the current start/resume countdown ends (0 = none). */
  countdownEnd = 0;
  /** Whether our own link to the server is up (set by the owner). */
  online = true;
  /** Diagnostics: hash mismatches and snapshot resyncs so far. */
  desyncs = 0;
  resyncs = 0;
  /** Our command failed when the server applied it (raced with something else). */
  onReject: (reason: string) => void = () => {};
  /** The world was replaced by a server snapshot (renderer state should be reset). */
  onResync: () => void = () => {};
  /** Our replica disagreed with the server (count so far). Should never happen; see the log. */
  onDesync: (count: number) => void = () => {};
  private readonly send: (msg: ClientMsg) => boolean;
  private readonly now: () => number;
  private confirmed = 0;
  private cmds = new Map<number, ScheduledCommand[]>();
  private hashes = new Map<number, number>();
  /** Our commands sent but not yet applied, by sequence number (with the time sent). */
  private mine = new Map<number, { cmd: NetCommand; at: number }>();
  private seq = 0;
  private awaitingSnapshot = false;
  private samples: { at: number; off: number }[] = [];
  private bufMs = 60;
  private targetOffset: number | null = null;
  private playOffset: number | null = null;

  constructor(init: NetGameInit) {
    const world = init.snapshot ? World.deserialize(init.snapshot.world) : new World({ seed: init.seed ?? 1 });
    super({ difficulty: 'adept', online: true, team: init.seat }, world);
    this.seat = init.seat;
    this.names = init.names;
    this.send = init.send;
    this.now = init.now ?? (() => performance.now());
    if (init.snapshot) this.applySnapshot(init.snapshot, true);
    else this.countdownEnd = this.now() + (init.countdown ?? 0) * 1000;
    this.nextSample = this.world.time + SAMPLE_EVERY;
    this.syncPaused();
  }

  /** The other player's name. */
  get foeName(): string {
    return this.names[this.seat === 0 ? 1 : 0];
  }

  /** How far the replica trails the newest tick the server has sent (ms). */
  get bufferMs(): number {
    return this.bufMs;
  }

  /** Waiting for the server's snapshot after a mismatch. */
  get syncing(): boolean {
    return this.awaitingSnapshot;
  }

  /** Ticks received but not yet played. */
  get backlog(): number {
    return this.confirmed - this.world.tick;
  }

  /** Sends our command to the server, after the same checks the simulation will make. */
  override command(cmd: Command): CommandResult {
    if (this.over) return { ok: false, reason: 'The battle is over' };
    if (!this.online) return { ok: false, reason: 'Reconnecting…' };
    if (this.netPause || this.awaitingSnapshot) return { ok: false, reason: 'The battle is paused' };
    if (this.now() < this.countdownEnd) return { ok: false, reason: 'Get ready…' };
    const why = this.blocker(cmd);
    if (why) return { ok: false, reason: why };
    const { team: _team, ...net } = cmd;
    const seq = ++this.seq;
    if (!this.send({ type: 'cmd', seq, cmd: net as NetCommand })) return { ok: false, reason: 'Reconnecting…' };
    this.mine.set(seq, { cmd: net as NetCommand, at: this.now() });
    return { ok: true };
  }

  /** Feeds a message from the server. `at` = performance.now() at arrival. */
  receive(msg: ServerMsg, at: number): void {
    switch (msg.type) {
      case 'turn':
        return this.onTurn(msg, at);
      case 'snapshot':
        this.applySnapshot(msg);
        this.onResync();
        return;
      case 'paused':
        this.playOutConfirmed();
        this.netPause = msg.state;
        this.netPauseAt = at;
        this.countdownEnd = 0;
        // Orders that reached the server after it paused were dropped.
        this.mine.clear();
        break;
      case 'resuming':
        this.countdownEnd = at + msg.seconds * 1000;
        break;
      case 'resumed':
        this.netPause = null;
        this.countdownEnd = 0;
        this.resetClock();
        break;
      case 'over':
        this.onOver(msg);
        break;
    }
    this.syncPaused();
  }

  override advance(dt: number): number {
    void dt;
    const now = this.now();
    this.syncPaused();
    let alpha = 1;
    if (!this.over && !this.awaitingSnapshot && !this.netPause && this.playOffset !== null && this.targetOffset !== null) {
      // Ease the playback clock toward the target (±5% speed), so buffer changes stay invisible.
      const diff = this.targetOffset - this.playOffset;
      const maxStep = Math.max(1, dt * 1000 * 0.05);
      this.playOffset += Math.abs(diff) > 400 ? diff : Math.max(-maxStep, Math.min(maxStep, diff));
      const desired = (now - this.playOffset) / TICK_MS;
      const goal = Math.min(this.confirmed, Math.floor(desired));
      if (goal - this.world.tick > SILENT_CATCH_UP) this.catchUp(goal - 2);
      let steps = 0;
      while (this.world.tick < goal && steps < 240 && !this.awaitingSnapshot) {
        this.stepOnce();
        steps++;
      }
      alpha = Math.max(0, Math.min(1, desired - this.world.tick));
    }
    this.publish();
    this.view.paused = this.paused;
    return alpha;
  }

  /** Ends our part in the battle locally (we left). */
  abandon(): void {
    this.over = true;
  }

  // -------------------------------------------------------------------------

  private stepOnce(): void {
    const w = this.world;
    const tick = w.tick + 1;
    const list = this.cmds.get(tick);
    if (list) {
      this.cmds.delete(tick);
      for (const c of list) {
        const r = w.apply({ ...c.cmd, team: c.team } as Command);
        if (c.team === this.seat && this.mine.delete(c.seq) && !r.ok) this.onReject(r.reason);
      }
    }
    w.step();
    const h = this.hashes.get(w.tick);
    if (h !== undefined) {
      this.hashes.delete(w.tick);
      const mine = hashWorld(w);
      if (mine !== h) {
        this.desyncs++;
        // A desync means this device simulated differently: worth a bug report.
        console.warn(`[mythwar] state mismatch at tick ${w.tick}: here ${mine.toString(16)}, server ${h.toString(16)} — resyncing`);
        this.requestSnapshot();
        this.onDesync(this.desyncs);
      }
    }
  }

  /** Plays everything received so far right away (before a pause / the end). */
  private playOutConfirmed(): void {
    let n = 0;
    while (this.world.tick < this.confirmed && !this.awaitingSnapshot && n++ < 20_000) this.stepOnce();
  }

  /** Far behind (e.g. the tab was frozen): fast-forward without effects or sounds. */
  private catchUp(toTick: number): void {
    while (this.world.tick < toTick && !this.awaitingSnapshot) {
      this.stepOnce();
      if (this.world.time >= this.nextSample) {
        this.sample();
        this.nextSample = this.world.time + SAMPLE_EVERY;
      }
      const events = this.world.drainEvents();
      const kept = events.filter((e) => e.type === 'gameOver');
      this.record(events.filter((e) => e.type !== 'gameOver'));
      if (kept.length) this.emit(kept);
    }
  }

  private onTurn(msg: Extract<ServerMsg, { type: 'turn' }>, at: number): void {
    if (this.awaitingSnapshot) return;
    // Turns come in order over TCP. Orders for ticks we've already simulated would mean they
    // didn't (a broken proxy?): don't wait for the next hash check, resync at once.
    if ((msg.cmds ?? []).some((c) => c.tick <= this.world.tick)) {
      this.desyncs++;
      console.warn(`[mythwar] turn ${msg.tick} brought orders for ticks already played (at ${this.world.tick}) — resyncing`);
      this.requestSnapshot();
      this.onDesync(this.desyncs);
      return;
    }
    if (msg.tick <= this.confirmed) return;
    for (const c of msg.cmds ?? []) {
      const list = this.cmds.get(c.tick);
      if (list) list.push(c);
      else this.cmds.set(c.tick, [c]);
    }
    if (msg.hash && msg.hash[0] > this.world.tick) this.hashes.set(msg.hash[0], msg.hash[1]);
    this.confirmed = msg.tick;
    this.clockSample(at, msg.tick);
  }

  /**
   * Each turn tells us when the server produced tick N (plus network delay). The fastest
   * recent delivery is the baseline; the spread above it is the jitter we must buffer.
   */
  private clockSample(at: number, tick: number): void {
    const off = at - tick * TICK_MS;
    this.samples.push({ at, off });
    while (this.samples.length && at - this.samples[0].at > CLOCK_WINDOW) this.samples.shift();
    let base = Infinity;
    let worst = -Infinity;
    for (const s of this.samples) base = Math.min(base, s.off);
    for (const s of this.samples) worst = Math.max(worst, s.off - base);
    // Turns come every couple of ticks, so even a perfect network needs ~1 turn of buffer.
    const want = Math.max(MIN_BUFFER, Math.min(MAX_BUFFER, worst + 10));
    this.bufMs = want > this.bufMs ? want : this.bufMs + (want - this.bufMs) * 0.02;
    this.targetOffset = base + this.bufMs;
    if (this.playOffset === null) this.playOffset = this.targetOffset;
  }

  private resetClock(): void {
    this.samples = [];
    this.targetOffset = null;
    this.playOffset = null;
  }

  private onOver(msg: Extract<ServerMsg, { type: 'over' }>): void {
    this.playOutConfirmed();
    this.netPause = null;
    this.countdownEnd = 0;
    this.result = { winner: msg.winner, reason: msg.reason };
    if (this.world.winner === null || this.world.winner !== msg.winner) {
      // Forfeit / timeout (or, should replicas ever disagree, the server's word is final).
      this.world.winner = msg.winner;
      this.world.drainEvents();
      this.emit([{ type: 'gameOver', winner: msg.winner }]);
    } else this.publish();
    this.over = true;
  }

  private applySnapshot(msg: Extract<ServerMsg, { type: 'snapshot' }>, initial = false): void {
    if (!initial) {
      this.world = World.deserialize(msg.world);
      this.resyncs++;
    }
    this.confirmed = msg.tick;
    this.cmds.clear();
    this.hashes.clear();
    this.mine.clear();
    this.history.splice(0, this.history.length, ...msg.history);
    this.ageUps.splice(0, this.ageUps.length, ...msg.ageUps);
    this.nextSample = this.world.time + SAMPLE_EVERY;
    this.netPause = msg.paused;
    this.netPauseAt = this.now();
    this.countdownEnd = 0;
    this.awaitingSnapshot = false;
    this.resetClock();
  }

  private requestSnapshot(): void {
    if (this.awaitingSnapshot) return;
    this.awaitingSnapshot = true;
    this.send({ type: 'resync' });
  }

  private syncPaused(): void {
    this.paused = this.netPause !== null || !this.online || this.awaitingSnapshot || this.now() < this.countdownEnd;
  }

  /** The simulation's own blocker, counting our orders that are still on their way. */
  override pendingTrains(): { unitId: string; lane: number }[] {
    const out: { unitId: string; lane: number }[] = [];
    for (const { cmd } of this.mine.values()) if (cmd.type === 'train') out.push({ unitId: cmd.unitId, lane: cmd.lane });
    return out;
  }

  /** Gold as the player should see it: minus orders on their way to the server. */
  override displayGold(): number {
    return Math.max(0, this.world.players[this.seat].gold - this.inflight().spend);
  }

  /** What our orders still in flight will cost / take up once the server applies them. */
  private inflight(): { spend: number; trains: number; ascending: boolean; casting: boolean; blessRanks: Record<string, number> } {
    const p = this.world.players[this.seat];
    let spend = 0;
    let trains = 0;
    let ascending = false;
    let casting = false;
    const blessRanks: Record<string, number> = {};
    const now = this.now();
    for (const [seq, m] of this.mine) {
      // An order the server never scheduled (it arrived as the battle paused, say) is let go.
      if (now - m.at > MINE_TIMEOUT) {
        this.mine.delete(seq);
        continue;
      }
      const c = m.cmd;
      if (c.type === 'train') {
        spend += UNITS[c.unitId]?.cost ?? 0;
        trains++;
      } else if (c.type === 'ageUp') {
        spend += AGES[p.age + 1]?.ascendCost ?? 0;
        ascending = true;
      } else if (c.type === 'bless') {
        const rank = p.blessings[c.blessing] + (blessRanks[c.blessing] ?? 0);
        spend += blessingCost(rank, p.age);
        blessRanks[c.blessing] = (blessRanks[c.blessing] ?? 0) + 1;
      } else if (c.type === 'buildTurret') {
        const cur = p.turrets[c.lane]?.def;
        spend += (TURRETS[c.turretId]?.cost ?? 0) - (cur ? Math.floor(cur.cost * SELL_REFUND) : 0);
      } else if (c.type === 'power') casting = true;
    }
    return { spend, trains, ascending, casting, blessRanks };
  }

  private blocker(cmd: Command): string | null {
    const w = this.world;
    const team = this.seat;
    if (cmd.team !== team) return 'Not your side';
    const p = w.players[team];
    const { spend, trains, ascending, casting, blessRanks } = this.inflight();
    const gold = p.gold - spend;
    switch (cmd.type) {
      case 'train': {
        const why = w.trainBlocker(team, cmd.unitId);
        if (why) return why;
        if (p.queue.length + trains >= QUEUE_MAX) return 'Summoning queue is full';
        if (gold < UNITS[cmd.unitId].cost) return 'Not enough gold';
        return null;
      }
      case 'ageUp': {
        if (ascending) return 'Ascending…';
        const why = w.ageUpBlocker(team);
        if (why) return why;
        return gold < AGES[p.age + 1].ascendCost ? 'Not enough gold' : null;
      }
      case 'bless': {
        const why = w.blessingBlocker(team, cmd.blessing);
        if (why) return why;
        const rank = p.blessings[cmd.blessing] + (blessRanks[cmd.blessing] ?? 0);
        return gold < blessingCost(rank, p.age) ? 'Not enough gold' : null;
      }
      case 'buildTurret': {
        const why = w.turretBlocker(team, cmd.lane, cmd.turretId);
        if (why) return why;
        const cur = p.turrets[cmd.lane].def;
        return gold + (cur ? Math.floor(cur.cost * SELL_REFUND) : 0) < TURRETS[cmd.turretId].cost ? 'Not enough gold' : null;
      }
      case 'power':
        return casting ? 'God power is recharging' : w.powerBlocker(team);
      case 'sellTurret':
        return p.turrets[cmd.lane]?.def ? null : 'No turret there';
      case 'cancel':
        return p.queue.length ? null : 'Nothing to cancel';
    }
  }
}
