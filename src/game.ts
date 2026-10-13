import { AI_PROFILES, AiController, DIFFICULTIES } from './ai/ai.ts';
import type { AiSnapshot, Difficulty } from './ai/ai.ts';
import { TICK } from './sim/data.ts';
import type { TrialId } from './sim/data.ts';
import type { Command, CommandResult, SimEvent, Team } from './sim/types.ts';
import { World } from './sim/world.ts';
import type { WorldSnapshot } from './sim/world.ts';
import { puzzleById, puzzleRules, puzzleStatus, puzzleWorld } from './sim/puzzles.ts';
import type { Puzzle } from './sim/puzzles.ts';
import type { Renderer, ViewState } from './render/renderer.ts';

export interface GameOptions {
  difficulty: Difficulty;
  seed?: number;
  /** AI plays both sides (title-screen backdrop / attract mode). */
  demo?: boolean;
  /** Against another human over the network: no AI; `team` is the local player's side. */
  online?: boolean;
  team?: Team;
  /** A toy, not a battle: no foe AI, endless gold, unbreakable citadels; the player can summon
   *  for either side (`sandboxFoe`). Both sides always share an age. */
  sandbox?: boolean;
  /** Trials the (single) player chose: handicaps for a harder battle. */
  trials?: TrialId[];
  /** A quick battle (faster XP, more gold, earlier Ragnarök). */
  quick?: boolean;
  /** A riddle of war (src/sim/puzzles.ts): no foe AI, a fixed purse, one goal. */
  puzzle?: string;
  /** Both sides begin in this age (a custom start, Lens #71). */
  startAge?: number;
}

export type GameListener = (events: SimEvent[]) => void;

/** Periodic snapshot of both armies' value (gold value weighted by remaining health). */
export interface HistorySample {
  t: number;
  army: [number, number];
}

const SAMPLE_EVERY = 5;

/** A battle in progress, as stored in localStorage. */
export interface GameSave {
  v: 1;
  difficulty: Difficulty;
  savedAt: number;
  speed: number;
  world: WorldSnapshot;
  ai: AiSnapshot;
  history: HistorySample[];
  ageUps?: { t: number; team: Team; age: number }[];
  selectedLane: number;
}

/** One match: the simulation, the AI(s) and the fixed-step clock. */
export class Game {
  /** Replaced wholesale when an online battle resyncs from a server snapshot. */
  world: World;
  readonly options: GameOptions;
  readonly playerTeam: Team;
  /** The opponent AI (null online). */
  readonly ai: AiController | null;
  readonly demoAi: AiController | null;
  readonly view: ViewState;
  speed = 1;
  /** A brief slow-motion (the player's god power, Lens #67); 1 = normal. Single player only. */
  timeScale = 1;
  paused = false;
  /** Sandbox: orders go to the other side (team 1). */
  sandboxFoe = false;
  over = false;
  readonly history: HistorySample[] = [];
  /** Ascension moments for the results chart. */
  readonly ageUps: { t: number; team: Team; age: number }[] = [];
  protected nextSample = 0;
  protected acc = 0;
  private listeners: GameListener[] = [];
  /** The riddle being solved (null in a battle). */
  readonly riddle: Puzzle | null;

  constructor(opts: GameOptions, world?: World) {
    this.options = opts;
    const seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.riddle = (opts.puzzle && puzzleById(opts.puzzle)) || null;
    this.world = world ?? (this.riddle ? puzzleWorld(this.riddle) : new World({ seed, trials: [opts.trials ?? [], []], quick: opts.quick, startAge: opts.startAge }));
    this.world.endless = !!opts.sandbox;
    this.playerTeam = opts.online ? (opts.team ?? 0) : 0;
    this.ai = opts.online || opts.sandbox || this.riddle ? null : new AiController(this.world, 1, AI_PROFILES[opts.difficulty], seed ^ 0x5bd1e995);
    this.demoAi = opts.demo ? new AiController(this.world, 0, AI_PROFILES[opts.difficulty], seed ^ 0x1234567) : null;
    this.view = { playerTeam: this.playerTeam, demo: !!opts.demo, selectedLane: opts.demo ? -1 : 1, hoverLane: -1, targeting: 'none', paused: false };
  }

  /** Practice, not a battle: the sandbox or a riddle (no records, feats, autosave or taunts). */
  get practice(): boolean {
    return !!this.options.sandbox || !!this.riddle;
  }

  toSave(): GameSave {
    return {
      v: 1,
      difficulty: this.options.difficulty,
      savedAt: Date.now(),
      speed: this.speed,
      world: this.world.serialize(),
      ai: this.ai!.snapshot(),
      history: this.history.slice(),
      ageUps: this.ageUps.slice(),
      selectedLane: this.view.selectedLane,
    };
  }

  /** Restores a saved battle (throws if the save is invalid). */
  static fromSave(save: GameSave): Game {
    if (!save || save.v !== 1) throw new Error('Unsupported save');
    if (save.world.winner !== null) throw new Error('Battle already decided');
    if (!DIFFICULTIES.includes(save.difficulty)) throw new Error('Unknown difficulty');
    const game = new Game({ difficulty: save.difficulty }, World.deserialize(save.world));
    game.ai!.restore(save.ai);
    game.history.push(...save.history);
    game.ageUps.push(...(save.ageUps ?? []));
    game.speed = save.speed === 2 ? 2 : 1;
    game.view.selectedLane = save.selectedLane >= 0 && save.selectedLane < 3 ? save.selectedLane : 1;
    game.nextSample = game.world.time + SAMPLE_EVERY;
    return game;
  }

  onEvents(fn: GameListener): void {
    this.listeners.push(fn);
  }

  /** Summons ordered but not yet in the queue (online: on their way to the server). */
  pendingTrains(): { unitId: string; lane: number }[] {
    return [];
  }

  /** The player's gold as the HUD shows it. */
  displayGold(): number {
    return this.world.players[this.playerTeam].gold;
  }

  command(cmd: Command): CommandResult {
    if (this.options.sandbox) {
      const r = this.world.apply(this.sandboxFoe ? { ...cmd, team: 1 } : cmd);
      this.sandboxRules();
      return r;
    }
    const r = this.world.apply(cmd);
    if (this.riddle) puzzleRules(this.world, this.riddle);
    return r;
  }

  /** Sandbox: endless gold, XP and god powers; citadels can't fall; both sides in one age. */
  private sandboxRules(): void {
    const w = this.world;
    for (const p of w.players) {
      p.gold = Math.max(p.gold, 99999);
      p.xp = Math.max(p.xp, 1e9);
      p.powerCooldown = 0;
      p.baseHp = p.baseMaxHp;
    }
    const [a, b] = w.players;
    while (a.age < b.age && w.apply({ type: 'ageUp', team: 0 }).ok);
    while (b.age < a.age && w.apply({ type: 'ageUp', team: 1 }).ok);
  }

  /** A riddle: its purse and rules, and the end once it is solved or lost (the player is team 0). */
  private riddleRules(pz: Puzzle): void {
    puzzleRules(this.world, pz);
    const s = puzzleStatus(this.world, pz);
    if (s) this.world.declare(s === 'won' ? 0 : 1);
  }

  /** Advances the simulation by real time `dt` (seconds). Returns the interpolation alpha. */
  advance(dt: number): number {
    if (!this.paused && !this.over) {
      this.acc += Math.min(dt, 0.25) * this.speed * this.timeScale;
      let steps = 0;
      while (this.acc >= TICK && steps < 40) {
        this.ai?.update(TICK);
        this.demoAi?.update(TICK);
        this.world.step();
        if (this.options.sandbox) this.sandboxRules();
        if (this.riddle) this.riddleRules(this.riddle);
        this.acc -= TICK;
        steps++;
      }
      if (steps >= 40) this.acc = 0;
    }
    this.publish();
    this.view.paused = this.paused;
    return this.acc / TICK;
  }

  /** After stepping: chart samples, then the new events to everyone listening. */
  protected publish(): void {
    if (this.world.time >= this.nextSample || (this.world.winner !== null && this.history.at(-1)?.t !== this.world.time)) {
      this.sample();
      this.nextSample = this.world.time + SAMPLE_EVERY;
    }
    const events = this.world.drainEvents();
    if (events.length) this.emit(events);
  }

  protected emit(events: SimEvent[]): void {
    this.record(events);
    for (const l of this.listeners) l(events);
  }

  /** Bookkeeping every event batch needs, whether or not anyone watches it. */
  protected record(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'gameOver') this.over = true;
      else if (e.type === 'ageUp') this.ageUps.push({ t: e.t, team: e.team, age: e.age });
    }
  }

  protected sample(): void {
    const army: [number, number] = [0, 0];
    for (const lane of this.world.lanes) for (const u of lane) if (u.alive) army[u.team] += u.def.cost * (u.hp / u.maxHp);
    this.history.push({ t: this.world.time, army });
  }

  /**
   * Fast-forwards the simulation (attract mode, debug `ff=`). Effects and sounds of the skipped
   * stretch are dropped, but the chart history, ascensions and a game over are kept.
   */
  fastForward(seconds: number): void {
    const n = Math.round(seconds / TICK);
    let end: SimEvent | undefined;
    for (let i = 0; i < n && this.world.winner === null; i++) {
      this.ai?.update(TICK);
      this.demoAi?.update(TICK);
      this.world.step();
      if (this.world.time >= this.nextSample) {
        this.sample();
        this.nextSample = this.world.time + SAMPLE_EVERY;
      }
      const events = this.world.drainEvents();
      this.record(events);
      end ??= events.find((e) => e.type === 'gameOver');
    }
    if (end) for (const l of this.listeners) l([end]);
  }

  render(renderer: Renderer, alpha: number, dt: number): void {
    renderer.render(this.world, alpha, dt, this.view);
  }
}
