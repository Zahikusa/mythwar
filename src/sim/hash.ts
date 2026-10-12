import type { World } from './world.ts';

/**
 * Exact fingerprint of everything that drives the simulation (bit-for-bit on numbers), used by
 * multiplayer to check that every client's replica of the battle matches the server's.
 * Renderer scratch fields (renderKey) and interpolation-only positions (px) are left out.
 */
export function hashWorld(w: World): number {
  const h = new Hasher();
  h.num(w.tick);
  h.num(w.time);
  h.num(w.rng.state);
  h.num(w.winner ?? -1);
  h.num(w.ragnarokAt);
  h.num(w.ragnarokStarted ? 1 : 0);
  h.num(w.quick ? 1 : 0);
  for (const p of w.players) {
    h.num(p.gold);
    h.num(p.xp);
    h.num(p.age);
    h.num(p.baseHp);
    h.num(p.baseMaxHp);
    h.num(p.trainProgress);
    h.num(p.powerCooldown);
    h.num(p.incomeMult);
    h.num(p.lastBaseHit);
    for (const held of p.hold) h.num(held ? 1 : 0);
    for (const t of p.trials) h.str(t);
    for (const q of p.queue) {
      h.str(q.unitId);
      h.num(q.lane);
      h.num(q.ready ? 1 : 0);
    }
    h.num(-1);
    for (const t of p.turrets) {
      h.str(t.def ? t.def.id : '');
      h.num(t.cooldown);
      h.num(t.lastFire);
      h.num(t.aimX);
    }
    for (const c of p.wardCooldown) h.num(c);
    h.num(p.blessings.might);
    h.num(p.blessings.vitality);
    h.num(p.blessings.bastion);
    h.num(p.stats.kills);
    h.num(p.stats.damageToBase);
  }
  for (const lane of w.lanes) {
    for (const u of lane) {
      if (!u.alive) continue;
      h.num(u.id);
      h.str(u.def.id);
      h.num(u.x);
      h.num(u.hp);
      h.num(u.maxHp);
      h.num(u.attackTimer);
      h.num(u.windupTimer);
      h.num(u.pendingTarget);
      h.num(u.movedFor);
      h.num(u.slowTimer);
      h.num(u.rootTimer);
      h.num(u.freezeTimer);
      h.num((u.charged ? 1 : 0) | (u.enraged ? 2 : 0) | (u.rebirthUsed ? 4 : 0) | (u.moving ? 8 : 0));
    }
    h.num(-1);
  }
  for (const s of w.shrines) {
    h.num(s.capture);
    h.num(s.owner);
  }
  h.num(w.nextSurgeAt);
  h.num(w.surgeRng.state);
  h.num(w.lastSurgeLane);
  if (w.surge) {
    h.num(w.surge.lane);
    h.num(w.surge.start);
    h.num(w.surge.end);
    h.num(w.surge.gained[0]);
    h.num(w.surge.gained[1]);
  }
  for (const p of w.projectiles) {
    if (p.done) continue;
    h.num(p.id);
    h.num(p.x);
    h.num(p.t);
    h.num(p.targetId);
    h.num(p.damage);
  }
  h.num(-1);
  for (const p of w.powers) {
    if (p.done) continue;
    h.num(p.id);
    h.num(p.t);
    h.num(p.fired);
    h.num(p.hit.length);
  }
  return h.value();
}

/** FNV-1a over the raw bytes of float64 values and UTF-16 code units. */
class Hasher {
  private h = 0x811c9dc5;
  private readonly f = new Float64Array(1);
  private readonly u = new Uint32Array(this.f.buffer);

  num(v: number): void {
    // NaN has many bit patterns; -0 and 0 behave the same everywhere the sim uses them.
    this.f[0] = Number.isNaN(v) ? NaN : v === 0 ? 0 : v;
    this.mix(Number.isNaN(v) ? 0x7ff80000 : this.u[0]);
    this.mix(Number.isNaN(v) ? 0 : this.u[1]);
  }

  str(s: string): void {
    for (let i = 0; i < s.length; i++) this.mix(s.charCodeAt(i));
    this.mix(0xffff);
  }

  private mix(word: number): void {
    let h = this.h;
    for (let i = 0; i < 4; i++) {
      h ^= (word >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
    this.h = h;
  }

  value(): number {
    return this.h >>> 0;
  }
}
