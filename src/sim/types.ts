import type { BlessingId, PowerKind, ProjectileKind, TrialId, TurretDef, UnitClass, UnitDef } from './data.ts';

/** 0 = left side (the human player in single player), 1 = right side. */
export type Team = 0 | 1;

export const BASE_TARGET = -1;
export const NO_TARGET = -2;

export interface Unit {
  id: number;
  def: UnitDef;
  team: Team;
  lane: number;
  x: number; // centre position along the lane, 0..LANE_LENGTH
  px: number; // position at the start of the last tick (render interpolation)
  hp: number;
  maxHp: number;
  alive: boolean;
  flying: boolean;
  bornAt: number;
  /** Seconds until the next attack may start. */
  attackTimer: number;
  /** > 0 while an attack is winding up. */
  windupTimer: number;
  pendingTarget: number;
  /** Sim time at which the current/last attack started (-1 = never). */
  attackStart: number;
  moving: boolean;
  movedFor: number;
  charged: boolean;
  slowTimer: number;
  slowFactor: number;
  rootTimer: number;
  freezeTimer: number;
  enraged: boolean;
  rebirthUsed: boolean;
  lastHitAt: number;
  kills: number;
  /** Scratch value owned by the renderer (draw order); not used by the simulation. */
  renderKey: number;
}

export interface Projectile {
  id: number;
  team: Team;
  lane: number;
  kind: ProjectileKind;
  sourceId: number; // unit id, or -(lane+10) for turrets
  fromTurret: boolean;
  targetId: number; // unit id or BASE_TARGET
  x0: number;
  x: number;
  px: number; // position at the start of the last tick (render interpolation)
  tx: number; // last known target x
  t: number; // 0..1 progress
  dur: number;
  arc: number;
  damage: number;
  cls: UnitClass | null;
  splash: number;
  slow?: { factor: number; duration: number };
  bounce?: { count: number; falloff: number; range: number; hit: number[] };
  done: boolean;
}

export interface QueueItem {
  unitId: string;
  lane: number;
  /** Fully trained, waiting for room at its lane's gate (training moves on to the next item). */
  ready?: boolean;
}

export interface TurretSlot {
  def: TurretDef | null;
  cooldown: number;
  lastFire: number;
  aimX: number;
}

export interface TeamStats {
  summoned: number;
  /** Summons per creature id. */
  summonedBy: Record<string, number>;
  kills: number;
  /** Kills made in each lane. */
  killsByLane: number[];
  losses: number;
  goldEarned: number;
  goldSpent: number;
  damageToBase: number;
  powersCast: number;
  /** Gold drawn from Ley Surges. */
  surgeGold: number;
  /** Damage dealt by this side's creatures: [all, into a class they beat, into a class that beats them]. */
  classDamage: [number, number, number];
}

export interface PlayerState {
  team: Team;
  gold: number;
  xp: number;
  age: number;
  baseHp: number;
  baseMaxHp: number;
  queue: QueueItem[];
  trainProgress: number; // seconds trained on the front queue item
  powerCooldown: number;
  turrets: TurretSlot[]; // one per lane
  incomeMult: number;
  /** Built-in gate ward cooldown per lane. */
  wardCooldown: number[];
  blessings: Record<BlessingId, number>;
  stats: TeamStats;
  lastBaseHit: number;
  /** Per lane: hold the line at the shrine instead of marching on (the lane's stance). */
  hold: boolean[];
  /** Trials the player chose to fight under (single player): see TRIALS in data.ts. */
  trials: TrialId[];
}

export interface Shrine {
  lane: number;
  /** -1 = fully team 0, +1 = fully team 1. */
  capture: number;
  owner: Team | -1;
  contested: boolean;
}

/** A Ley Surge: foretold at `start - SURGE_OMEN`, paying the shrine's holder from `start` to `end`. */
export interface Surge {
  lane: number;
  start: number;
  end: number;
  /** Gold each team has drawn from it so far. */
  gained: [number, number];
}

export interface PowerInstance {
  id: number;
  kind: PowerKind;
  team: Team;
  lane: number;
  age: number;
  t: number;
  damage: number;
  /** Generic per-kind state. */
  fired: number;
  hit: number[];
  done: boolean;
}

export type SimEvent =
  | { type: 'spawn'; unitId: number; team: Team; lane: number; defId: string }
  | { type: 'attack'; unitId: number; team: Team; lane: number; defId: string; ranged: boolean }
  | { type: 'hit'; targetId: number; team: Team; lane: number; x: number; amount: number; mult: number; source: 'unit' | 'turret' | 'power' | 'projectile' }
  | { type: 'baseHit'; team: Team; lane: number; amount: number }
  | { type: 'death'; unitId: number; team: Team; lane: number; x: number; defId: string; flying: boolean; gold: number }
  | { type: 'rebirth'; unitId: number; team: Team; lane: number; x: number }
  | { type: 'projectile'; projId: number; team: Team; lane: number; kind: ProjectileKind; fromTurret: boolean }
  | { type: 'impact'; id: number; team: Team; lane: number; x: number; kind: ProjectileKind; splash: number }
  | { type: 'turretFire'; team: Team; lane: number }
  | { type: 'turretBuilt'; team: Team; lane: number; turretId: string | null }
  | { type: 'ageUp'; team: Team; age: number; t: number }
  | { type: 'blessing'; team: Team; blessing: BlessingId; rank: number }
  | { type: 'power'; team: Team; lane: number; kind: PowerKind; instanceId: number }
  | { type: 'strike'; team: Team; lane: number; x: number; kind: PowerKind; radius: number }
  | { type: 'meteor'; team: Team; lane: number; x: number; fall: number }
  | { type: 'shrine'; lane: number; owner: Team | -1 }
  | { type: 'surge'; lane: number; phase: 'omen' | 'start' | 'end'; gained: [number, number] }
  | { type: 'stance'; team: Team; lane: number; hold: boolean }
  | { type: 'trainStart'; team: Team }
  | { type: 'ragnarok' }
  | { type: 'crumble' }
  | { type: 'gameOver'; winner: Team };

export type Command =
  | { type: 'train'; team: Team; unitId: string; lane: number }
  /** `unitId`: the creature the player meant (guards against the queue having moved on). */
  | { type: 'cancel'; team: Team; index: number; unitId?: string }
  | { type: 'ageUp'; team: Team }
  | { type: 'buildTurret'; team: Team; lane: number; turretId: string }
  | { type: 'sellTurret'; team: Team; lane: number }
  | { type: 'power'; team: Team; lane: number }
  | { type: 'bless'; team: Team; blessing: BlessingId }
  | { type: 'stance'; team: Team; lane: number; hold: boolean };

export type CommandResult = { ok: true } | { ok: false; reason: string };
