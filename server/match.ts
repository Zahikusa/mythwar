import { TICK } from '../src/sim/data.ts';
import type { TrialId } from '../src/sim/data.ts';
import { hashWorld } from '../src/sim/hash.ts';
import type { Team } from '../src/sim/types.ts';
import { World } from '../src/sim/world.ts';
import { AWAY_GRACE, CLAIM_AFTER, HASH_EVERY, RESUME_COUNTDOWN } from '../src/net/protocol.ts';
import type { AgeUpMark, EndReason, HistorySample, NetCommand, PauseState, ScheduledCommand, ServerMsg } from '../src/net/protocol.ts';

const TICK_MS = TICK * 1000;
/** If the server falls this far behind (stalled process), it skips ahead in wall time. */
const MAX_CATCH_UP = 30;
const SAMPLE_EVERY = 5;

export interface MatchHost {
  broadcast(msg: ServerMsg): void;
  send(seat: Team, msg: ServerMsg): void;
  /** The battle is decided (citadel fell, forfeit, timeout). */
  ended(winner: Team, reason: EndReason): void;
}

export interface MatchOptions {
  seed: number;
  names: [string, string];
  /** Countdown before the first tick, in seconds. */
  countdown: number;
  /** Ticks per turn message (lower = less delay, more packets). */
  turnTicks?: number;
  awayGrace?: number;
  /** Seconds away after which the other player may claim the win. */
  claimAfter?: number;
  /** Handicaps per seat. */
  trials?: [TrialId[], TrialId[]];
}

type MatchState = 'countdown' | 'running' | 'paused' | 'resuming' | 'over';

/**
 * One authoritative battle. Owns the clock: steps the simulation in real time, applies the
 * players' commands at the next tick and tells both clients exactly what was applied when.
 */
export class Match {
  readonly world: World;
  readonly seed: number;
  readonly names: [string, string];
  state: MatchState = 'countdown';
  /** Why the battle is paused (null while running). */
  pauseState: PauseState | null = null;
  readonly history: HistorySample[] = [];
  readonly ageUps: AgeUpMark[] = [];
  private readonly host: MatchHost;
  private readonly turnTicks: number;
  private readonly awayGrace: number;
  private readonly claimAfter: number;
  private startAt: number;
  private runFromMs = 0;
  private runFromTick = 0;
  private resumeAt = 0;
  private pending: ScheduledCommand[] = [];
  private unsent: ScheduledCommand[] = [];
  private lastSentTick = 0;
  private hash: [number, number] | undefined;
  private nextSample = 0;
  private paused = false;
  /** Who pressed pause (shown as "Paused by …"). */
  private pausedBy: Team = 0;
  /** Wall time each seat went away (null = present). */
  private awaySince: [number | null, number | null] = [null, null];

  constructor(opts: MatchOptions, now: number, host: MatchHost) {
    this.seed = opts.seed;
    this.names = opts.names;
    this.world = new World({ seed: opts.seed, trials: opts.trials });
    this.host = host;
    this.turnTicks = opts.turnTicks ?? 2;
    this.awayGrace = opts.awayGrace ?? AWAY_GRACE;
    this.claimAfter = opts.claimAfter ?? CLAIM_AFTER;
    this.startAt = now + opts.countdown * 1000;
  }

  get tick(): number {
    return this.world.tick;
  }

  /** Queues a player's command for the next tick. Ignored unless the battle is running. */
  command(seat: Team, seq: number, cmd: NetCommand): boolean {
    if (this.state !== 'running') return false;
    this.pending.push({ tick: 0, team: seat, cmd, seq });
    return true;
  }

  isAway(seat: Team): boolean {
    return this.awaySince[seat] !== null;
  }

  /** A player disconnected / put the app in the background (or came back). */
  setAway(seat: Team, away: boolean, now: number): void {
    if (this.state === 'over') return;
    if (away === this.isAway(seat)) return;
    this.awaySince[seat] = away ? now : null;
    this.refreshPause(now);
  }

  /** A player pressed pause. */
  requestPause(seat: Team, now: number): void {
    if (this.state !== 'running' && this.state !== 'resuming') return;
    this.paused = true;
    this.pausedBy = seat;
    this.pauseState = null;
    this.refreshPause(now);
  }

  /** Either player may resume a pause (after a short countdown). */
  requestResume(now: number): void {
    if (!this.paused) return;
    this.paused = false;
    this.refreshPause(now);
  }

  /** `seat` claims the win because the other player has been away long enough. */
  claim(seat: Team, now: number): boolean {
    const other = (1 - seat) as Team;
    const since = this.awaySince[other];
    if (this.state === 'over' || this.awaySince[seat] !== null || since === null || now - since < this.claimAfter * 1000) return false;
    this.finish(seat, 'timeout');
    return true;
  }

  /** The player in `seat` gives up (left the room); the other wins. */
  forfeit(seat: Team): void {
    if (this.state === 'over') return;
    this.finish((1 - seat) as Team, 'forfeit');
  }

  /** Everything a (re)connecting client needs to pick up the battle, as of wall time `now`. */
  snapshotFor(seat: Team, now: number): ServerMsg {
    this.flush();
    const held = this.state === 'paused' || this.state === 'resuming' || (this.state === 'countdown' && this.startAt === Infinity);
    let paused = held ? this.pauseState : null;
    // Timers as of now (the stored state is from when the pause began).
    if (paused?.reason === 'away' && this.awaySince[paused.seat] !== null) paused = this.awayState(paused.seat, now);
    const until = this.state === 'resuming' ? this.resumeAt : this.state === 'countdown' && this.startAt !== Infinity ? this.startAt : 0;
    return {
      type: 'snapshot',
      tick: this.world.tick,
      world: this.world.serialize(),
      seat,
      names: this.names,
      paused,
      countdown: until ? Math.max(0, (until - now) / 1000) : 0,
      history: this.history.slice(),
      ageUps: this.ageUps.slice(),
    };
  }

  private awayState(seat: Team, now: number): PauseState {
    const since = this.awaySince[seat]!;
    return {
      reason: 'away',
      seat,
      forfeitIn: Math.max(0, Math.ceil((since + this.awayGrace * 1000 - now) / 1000)),
      claimIn: Math.max(0, Math.ceil((since + this.claimAfter * 1000 - now) / 1000)),
    };
  }

  /** Advances the battle to wall time `now` (ms). */
  update(now: number): void {
    switch (this.state) {
      case 'over':
      case 'paused':
        this.checkForfeits(now);
        return;
      case 'countdown':
        // Someone left during the countdown: their forfeit clock runs as in battle.
        if (this.startAt === Infinity) this.checkForfeits(now);
        if (now < this.startAt) return;
        this.state = 'running';
        this.pauseState = null;
        this.runFromMs = this.startAt;
        this.runFromTick = 0;
        // (Clears a pause from someone who was away during the countdown.)
        this.host.broadcast({ type: 'resumed', tick: 0 });
        break;
      case 'resuming':
        this.checkForfeits(now);
        if (now < this.resumeAt) return;
        this.state = 'running';
        this.pauseState = null;
        this.runFromMs = now;
        this.runFromTick = this.world.tick;
        this.host.broadcast({ type: 'resumed', tick: this.world.tick });
        break;
      case 'running':
        break;
    }
    let due = this.runFromTick + Math.floor((now - this.runFromMs) / TICK_MS);
    if (due - this.world.tick > MAX_CATCH_UP) {
      due = this.world.tick + MAX_CATCH_UP;
      this.runFromMs = now;
      this.runFromTick = due;
    }
    while (this.world.tick < due && this.state === 'running') this.step();
    if (this.state === 'running' && (this.world.tick - this.lastSentTick >= this.turnTicks || this.unsent.length)) this.flush();
  }

  private step(): void {
    const w = this.world;
    const tick = w.tick + 1;
    for (const c of this.pending) {
      c.tick = tick;
      w.apply({ ...c.cmd, team: c.team });
      this.unsent.push(c);
    }
    this.pending = [];
    w.step();
    for (const e of w.drainEvents()) if (e.type === 'ageUp') this.ageUps.push({ t: e.t, team: e.team, age: e.age });
    if (w.time >= this.nextSample || w.winner !== null) {
      const army: [number, number] = [0, 0];
      for (const lane of w.lanes) for (const u of lane) if (u.alive) army[u.team] += u.def.cost * (u.hp / u.maxHp);
      this.history.push({ t: w.time, army });
      this.nextSample = w.time + SAMPLE_EVERY;
    }
    if (w.tick % HASH_EVERY === 0) this.hash = [w.tick, hashWorld(w)];
    if (w.winner !== null) {
      this.flush();
      this.finish(w.winner, 'citadel');
    }
  }

  /** Sends everything simulated so far as one turn. */
  private flush(): void {
    if (this.world.tick === this.lastSentTick && !this.unsent.length) return;
    const msg: ServerMsg = { type: 'turn', tick: this.world.tick };
    if (this.unsent.length) msg.cmds = this.unsent;
    if (this.hash) msg.hash = this.hash;
    this.unsent = [];
    this.hash = undefined;
    this.lastSentTick = this.world.tick;
    this.host.broadcast(msg);
  }

  private finish(winner: Team, reason: EndReason): void {
    this.state = 'over';
    this.pauseState = null;
    this.host.broadcast({ type: 'over', winner, reason, tick: this.world.tick });
    this.host.ended(winner, reason);
  }

  /** Recomputes paused / resuming after someone left, came back, paused or resumed. */
  private refreshPause(now: number): void {
    if (this.state === 'over') return;
    const awaySeat = this.awaySince[0] !== null ? 0 : this.awaySince[1] !== null ? 1 : -1;
    if (awaySeat >= 0 || this.paused) {
      if (this.state === 'running') this.flush();
      // Orders not yet applied are dropped (clients forget theirs when told about the pause).
      this.pending = [];
      const seat = (awaySeat >= 0 ? awaySeat : this.pausedBy) as Team;
      const state: PauseState = awaySeat >= 0 ? this.awayState(seat, now) : { reason: 'pause', seat };
      if (this.state === 'countdown') {
        // Not started yet: the countdown restarts once everyone is back.
        this.startAt = Infinity;
      } else this.state = 'paused';
      this.pauseState = state;
      this.host.broadcast({ type: 'paused', state });
      return;
    }
    // Everyone is here and nobody wants a pause.
    if (this.state === 'countdown') {
      if (this.startAt === Infinity) {
        this.startAt = now + RESUME_COUNTDOWN * 1000;
        this.host.broadcast({ type: 'resuming', seconds: RESUME_COUNTDOWN });
      }
      return;
    }
    if (this.state === 'paused') {
      this.state = 'resuming';
      this.resumeAt = now + RESUME_COUNTDOWN * 1000;
      this.host.broadcast({ type: 'resuming', seconds: RESUME_COUNTDOWN });
    }
  }

  private checkForfeits(now: number): void {
    if (this.state === 'over') return;
    const late = ([0, 1] as Team[]).filter((s) => this.awaySince[s] !== null && now - this.awaySince[s]! >= this.awayGrace * 1000);
    if (!late.length) return;
    // Both gone for good: whoever left first loses.
    const loser = late.length === 2 ? (this.awaySince[0]! <= this.awaySince[1]! ? 0 : 1) : late[0];
    this.finish((1 - loser) as Team, 'timeout');
  }
}
