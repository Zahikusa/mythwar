import { AGES, MAX_AGE, UNITS } from '../sim/data.ts';
import type { Game } from '../game.ts';
import type { SimEvent } from '../sim/types.ts';
import { h, onTap } from './dom.ts';
import type { Settings } from './settings.ts';
import { saveSettings } from './settings.ts';

interface Tip {
  id: string;
  text: string;
  /** Element the bubble points at. */
  anchor?: string;
  when: (g: Game, t: number, coach?: Coach) => boolean;
  /** Hide the tip once this becomes true (defaults to a timeout). */
  done?: (g: Game, t: number, shownAt: number) => boolean;
  minTime?: number;
}

const TIPS: Tip[] = [
  {
    id: 'summon',
    text: 'Tap a creature card to summon it into the glowing lane.',
    anchor: '.cards',
    when: () => true,
    done: (g) => g.world.players[g.playerTeam].stats.summoned + g.world.players[g.playerTeam].queue.length > 0,
  },
  {
    id: 'lanes',
    text: 'Tap any lane to send creatures there — or drag a card straight onto a lane. Every lane leads to the enemy citadel.',
    when: (g) => g.world.players[g.playerTeam].stats.summoned >= 2,
    done: (_g, t, s) => t - s > 9,
  },
  {
    id: 'counters',
    text: 'Shields beat fangs, fangs beat orbs, orbs beat shields. Summon the class that counters what marches down a lane.',
    anchor: '.cards',
    when: (g, t) => t > 25 && g.world.enemiesInLane(g.playerTeam, 0).length + g.world.enemiesInLane(g.playerTeam, 1).length + g.world.enemiesInLane(g.playerTeam, 2).length >= 3,
    done: (_g, t, s) => t - s > 10,
  },
  {
    id: 'packs',
    text: 'Your Hunters crowd into a pack and strike as one — deadly against Mystics. But a Guardian’s sweeping blow hits the whole pack.',
    when: (g) => {
      for (let lane = 0; lane < 3; lane++) {
        let n = 0;
        for (const u of g.world.lanes[lane]) if (u.alive && u.team === g.playerTeam && u.def.cls === 'hunter') n++;
        if (n >= 3) return true;
      }
      return false;
    },
    done: (_g, t, s) => t - s > 10,
  },
  {
    id: 'jammed',
    text: 'A gate is jammed by your own creatures. The waiting summon (gold border) steps out as soon as there is room — others keep coming meanwhile.',
    anchor: '.queue',
    when: (g) => g.world.players[g.playerTeam].queue.some((q) => q.ready),
    done: (g, t, s) => !g.world.players[g.playerTeam].queue.some((q) => q.ready) || t - s > 9,
  },
  {
    id: 'wards',
    text: 'Every gate is guarded by a ward (and maybe a turret). Lone creatures melt there — push with a group, or soften the gate with your god power.',
    when: (_g, _t, c) => (c?.diedAtEnemyGate ?? 0) >= 3,
    done: (_g, t, s) => t - s > 10,
  },
  {
    id: 'power',
    text: 'Your god power is ready! Tap it, then choose a lane to unleash it.',
    anchor: '.act.power',
    when: (g) => g.world.players[g.playerTeam].powerCooldown <= 0,
    done: (g) => g.world.players[g.playerTeam].stats.powersCast > 0 || g.world.players[g.playerTeam].powerCooldown > 0,
  },
  {
    id: 'shrine',
    text: 'Hold the glowing Ley Shrine in a lane’s centre to earn extra gold.',
    when: (g) => g.world.shrines.some((s) => s.owner !== -1),
    done: (_g, t, s) => t - s > 8,
  },
  {
    id: 'ascend',
    text: 'You have enough XP to Ascend! A new age brings stronger creatures and a sturdier citadel.',
    anchor: '.act.ascend',
    when: (g) => {
      const p = g.world.players[g.playerTeam];
      return p.age < MAX_AGE && p.xp >= AGES[p.age + 1].xpRequired;
    },
    done: (g, t, s) => g.world.players[g.playerTeam].age > 0 || t - s > 14,
  },
  {
    id: 'turret',
    text: 'Spare gold? Mount a turret on a gate to guard that lane.',
    anchor: '.turretbtn',
    when: (g, t) => t > 70 && g.world.players[g.playerTeam].gold > 200 && g.world.players[g.playerTeam].turrets.every((s) => !s.def),
    done: (g, t, s) => g.world.players[g.playerTeam].turrets.some((s) => !!s.def) || t - s > 10,
  },
  {
    id: 'portals',
    text: 'Watch the enemy gates: a portal flares red just before their next creature steps out — you can see which lane it is coming down.',
    when: (g, t) => {
      if (t < 50) return false;
      const foe = g.playerTeam === 0 ? 1 : 0;
      const i = g.world.trainingIndex(foe);
      if (i < 0) return false;
      const p = g.world.players[foe];
      return UNITS[p.queue[i].unitId].trainTime - p.trainProgress < 0.8;
    },
    done: (_g, t, s) => t - s > 9,
  },
  {
    id: 'bless',
    text: 'Blessings permanently strengthen your army. Worth it when gold piles up.',
    anchor: '.blessbtn',
    when: (g, t) => t > 240 && g.world.players[g.playerTeam].gold > 600,
    done: (_g, t, s) => t - s > 9,
  },
];

/** First-battle coaching: short contextual tips, each shown once per player profile. */
export class Coach {
  private readonly el: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private game: Game | null = null;
  private current: Tip | null = null;
  private shownAt = 0;
  private settings: Settings;
  private stage: HTMLElement;
  toStage: (x: number, y: number) => [number, number] = (x, y) => [x, y];
  private zoomValue = 1;
  /** Player creatures killed close to the enemy gate this battle. */
  diedAtEnemyGate = 0;

  constructor(stage: HTMLElement, settings: Settings) {
    this.stage = stage;
    this.settings = settings;
    this.text = h('div', { class: 'ctext' });
    const close = h('button', { class: 'cclose', text: 'Got it' });
    onTap(close, () => this.finish());
    this.el = h('div', { class: 'coach' }, h('div', { class: 'cicon', text: '?' }), this.text, close);
    stage.appendChild(this.el);
  }

  /** CSS zoom matching the large-screen desktop HUD. */
  set zoom(z: number) {
    this.zoomValue = z;
    this.el.style.zoom = z === 1 ? '' : String(z);
    this.position();
  }

  attach(game: Game | null): void {
    this.game = game;
    this.diedAtEnemyGate = 0;
    this.current = null;
    this.el.classList.remove('show');
  }

  onEvents(events: SimEvent[]): void {
    const g = this.game;
    if (!g) return;
    for (const e of events) {
      if (e.type === 'death' && e.team === g.playerTeam && (g.playerTeam === 0 ? e.x > 820 : e.x < 180)) this.diedAtEnemyGate++;
    }
  }

  private finish(): void {
    if (!this.current) return;
    if (!this.settings.hintsSeen.includes(this.current.id)) this.settings.hintsSeen.push(this.current.id);
    saveSettings(this.settings);
    this.current = null;
    this.el.classList.remove('show');
  }

  /** `blocked`: a panel or menu covers the screen, so tips stay hidden for now. */
  update(blocked = false): void {
    const g = this.game;
    if (!g || !this.settings.hints || g.paused || g.over || blocked) {
      if (this.current) this.el.classList.remove('show');
      return;
    }
    const t = g.world.time;
    if (this.current) {
      const done = this.current.done ? this.current.done(g, t, this.shownAt) : t - this.shownAt > 8;
      if (done) this.finish();
      else {
        this.el.classList.add('show');
        this.position();
      }
      return;
    }
    for (const tip of TIPS) {
      if (this.settings.hintsSeen.includes(tip.id)) continue;
      if (tip.when(g, t, this)) {
        this.current = tip;
        this.shownAt = t;
        this.text.textContent = tip.text;
        this.el.classList.add('show');
        this.position();
        break;
      }
    }
  }

  private position(): void {
    const tip = this.current;
    if (!tip) return;
    const mobile = this.stage.classList.contains('mobile');
    const anchor = tip.anchor ? (this.stage.querySelector(tip.anchor) as HTMLElement | null) : null;
    this.el.classList.toggle('free', !anchor);
    if (!anchor) {
      this.el.style.left = '';
      this.el.style.top = '';
      return;
    }
    const r = anchor.getBoundingClientRect();
    const [ax, ay] = this.toStage(r.left, r.top);
    const [bx, by] = this.toStage(r.right, r.bottom);
    const left = Math.min(ax, bx);
    const right = Math.max(ax, bx);
    const top = Math.min(ay, by);
    const bottom = Math.max(ay, by);
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    // Under a zoom, measure the bubble's visual size; its left/top get zoomed too.
    const z = this.zoomValue;
    const zr = z !== 1 ? this.el.getBoundingClientRect() : null;
    const w = zr ? zr.width : this.el.offsetWidth;
    const hh = zr ? zr.height : this.el.offsetHeight;
    let x: number;
    let y: number;
    if (mobile) {
      // Beside the thumb columns
      const leftSide = left < W / 2;
      x = leftSide ? right + 10 : left - w - 10;
      y = Math.max(50, Math.min(H - hh - 8, (top + bottom) / 2 - hh / 2));
      this.el.dataset.arrow = leftSide ? 'left' : 'right';
    } else {
      x = Math.max(10, Math.min(W - w - 10, (left + right) / 2 - w / 2));
      y = top - hh - 14;
      this.el.dataset.arrow = 'down';
      this.el.style.setProperty('--ax', `${Math.max(16, Math.min(w - 16, (left + right) / 2 - x)) / z}px`);
    }
    this.el.style.left = `${x / z}px`;
    this.el.style.top = `${y / z}px`;
  }
}
