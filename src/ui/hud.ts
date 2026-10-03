import {
  AGES,
  AGE_TURRETS,
  AGE_UNITS,
  BLESSINGS,
  BLESSING_MAX_RANK,
  BLESSING_ORDER,
  COUNTERS,
  LANE_COUNT,
  MAX_AGE,
  POWERS,
  QUEUE_MAX,
  RAGNAROK_TIME,
  SELL_REFUND,
  TURRETS,
  UNITS,
  blessingCost,
  counterOf,
} from '../sim/data.ts';
import type { BlessingId, UnitDef } from '../sim/data.ts';
import type { SimEvent, Team } from '../sim/types.ts';
import type { Game } from '../game.ts';
import type { Layout } from '../render/layout.ts';
import { h, fmt, fmtTime, setStyle, setText, toggle } from './dom.ts';
import { CLASS_COLOR, CLASS_ICON, CLASS_NAME, ICONS, POWER_ICONS } from './icons.ts';
import { portrait } from './portraits.ts';

export const LANE_NAMES = ['Top', 'Middle', 'Bottom'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface HudCallbacks {
  pause(): void;
  sound(kind: string): void;
}

interface CardEl {
  def: UnitDef;
  el: HTMLButtonElement;
  cost: HTMLElement;
}

/** The in-game heads-up display and the player's action layer (shared by mouse, touch and keys). */
export class Hud {
  readonly root: HTMLDivElement;
  private game: Game | null = null;
  private cb: HudCallbacks;
  private layoutInfo: Layout | null = null;
  private cards: CardEl[] = [];
  private cardAge = -1;
  private el: Record<string, HTMLElement> = {};
  private laneTabs: HTMLButtonElement[] = [];
  private queueChips: HTMLElement[] = [];
  private toastTimer = 0;
  private bannerTimer = 0;
  private panel: 'none' | 'turret' | 'bless' = 'none';
  private turretRows: HTMLElement[] = [];
  private blessRows: Record<string, HTMLElement> = {};
  private hpShown: [number, number] = [1, 1];
  private tooltipFor: string | null = null;
  private drag: { unitId: string | null; power: boolean; startX: number; startY: number; active: boolean; pointerId: number; longPress: number } | null = null;
  private ghost: HTMLDivElement;
  /** Set by the input layer: maps a client point to a lane index (or -1). */
  laneAtPoint: (x: number, y: number) => number = () => -1;
  /** Maps client coordinates into stage coordinates (the stage may be rotated on phones). */
  toStage: (x: number, y: number) => [number, number] = (x, y) => [x, y];

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.cb = cb;
    this.root = h('div', { class: 'hud hidden' });
    parent.appendChild(this.root);
    this.build();
    this.ghost = h('div', { class: 'drag-ghost hidden' });
    this.root.appendChild(this.ghost);
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', (e) => this.onDragEnd(e));
    window.addEventListener('pointercancel', (e) => this.onDragEnd(e, true));
  }

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  private build(): void {
    const E = this.el;
    // Top bar
    E.hpL = h('div', { class: 'hpfill' });
    E.hpLd = h('div', { class: 'hpdmg' });
    E.hpLn = h('span', { class: 'hpnum' });
    E.ageL = h('div', { class: 'agebadge' });
    E.ageLn = h('div', { class: 'agename' });
    E.hpR = h('div', { class: 'hpfill' });
    E.hpRd = h('div', { class: 'hpdmg' });
    E.hpRn = h('span', { class: 'hpnum' });
    E.ageR = h('div', { class: 'agebadge' });
    E.ageRn = h('div', { class: 'agename' });
    E.clock = h('div', { class: 'clock' });
    E.shrines = h('div', { class: 'shrines', title: 'Ley Shrines: hold them for extra gold' });
    for (let i = 0; i < LANE_COUNT; i++) E.shrines.appendChild(h('i', { html: ICONS.shrine }));
    E.rag = h('div', { class: 'ragnarok' });
    E.speed = h('button', { class: 'sysbtn speed', title: 'Game speed (F)', html: ICONS.fast + '<span>1×</span>' });
    E.pause = h('button', { class: 'sysbtn', title: 'Pause (Esc)', html: ICONS.pause });
    E.speed.addEventListener('click', () => this.toggleSpeed());
    E.pause.addEventListener('click', () => this.cb.pause());
    const top = h(
      'div',
      { class: 'topbar' },
      h('div', { class: 'side left' }, E.ageL, h('div', { class: 'hpcol' }, h('div', { class: 'hpbar' }, E.hpLd, E.hpL, E.hpLn), E.ageLn)),
      h('div', { class: 'mid' }, E.clock, E.shrines, E.rag),
      h('div', { class: 'side right' }, h('div', { class: 'hpcol' }, h('div', { class: 'hpbar' }, E.hpRd, E.hpR, E.hpRn), E.ageRn), E.ageR),
    );
    const sys = h('div', { class: 'sys' }, E.speed, E.pause);

    // Resources
    E.gold = h('span', { class: 'goldnum' });
    E.income = h('span', { class: 'income' });
    E.xpfill = h('div', { class: 'xpfill' });
    E.xptext = h('span', { class: 'xptext' });
    const res = h(
      'div',
      { class: 'res' },
      h('div', { class: 'goldrow', title: 'Gold — earned over time, from kills and from held shrines' }, h('i', { class: 'ico', html: ICONS.gold }), E.gold, E.income),
      h('div', { class: 'xprow', title: 'Experience — earned from kills. Needed to ascend.' }, h('i', { class: 'ico', html: ICONS.xp }), h('div', { class: 'xpbar' }, E.xpfill, E.xptext)),
    );

    // Cards
    E.cards = h('div', { class: 'cards' });
    E.queue = h('div', { class: 'queue' });

    // Actions
    E.powerIcon = h('div', { class: 'picon' });
    E.powerCd = h('div', { class: 'pcd' });
    E.powerTime = h('div', { class: 'ptime' });
    E.powerName = h('div', { class: 'aname' });
    E.power = h('button', { class: 'act power', title: 'God power (Space)' }, E.powerIcon, E.powerCd, E.powerTime, E.powerName);
    E.power.addEventListener('pointerdown', (e) => this.startDrag(e as PointerEvent, null, true));

    E.ascFill = h('div', { class: 'ascfill' });
    E.ascSub = h('div', { class: 'asub' });
    E.ascend = h('button', { class: 'act ascend', title: 'Ascend to the next age (U)' }, E.ascFill, h('i', { class: 'aico', html: ICONS.ascend }), h('div', { class: 'aname', text: 'Ascend' }), E.ascSub);
    E.ascend.addEventListener('click', () => this.tryAscend());

    E.turretBtn = h('button', { class: 'act small turretbtn', title: 'Turrets (T)' }, h('i', { class: 'aico', html: ICONS.tower }), h('div', { class: 'aname', text: 'Turrets' }));
    E.turretBtn.addEventListener('click', () => this.togglePanel('turret'));
    E.blessBtn = h('button', { class: 'act small blessbtn', title: 'Blessings (B)' }, h('i', { class: 'aico', html: ICONS.bless }), h('div', { class: 'aname', text: 'Blessings' }));
    E.blessBtn.addEventListener('click', () => this.togglePanel('bless'));
    const acts = h('div', { class: 'acts' }, E.power, E.ascend, h('div', { class: 'actpair' }, E.turretBtn, E.blessBtn));

    // Lane tabs (near the player's gates)
    E.lanetabs = h('div', { class: 'lanetabs' });
    for (let i = 0; i < LANE_COUNT; i++) {
      const tab = h('button', { class: 'lanetab', title: `${LANE_NAMES[i]} lane` }, h('span', { class: 'arrow', text: '▶' }), h('span', { class: 'qn' }));
      tab.addEventListener('click', () => this.selectLane(i));
      this.laneTabs.push(tab);
      E.lanetabs.appendChild(tab);
    }

    // Panels
    E.turretPanel = this.buildTurretPanel();
    E.blessPanel = this.buildBlessPanel();

    E.toast = h('div', { class: 'toast' });
    E.banner = h('div', { class: 'banner' }, h('div', { class: 'btitle' }), h('div', { class: 'bsub' }));
    E.hint = h('div', { class: 'hint' });
    E.tooltip = h('div', { class: 'tooltip hidden' });

    this.root.append(top, sys, res, E.cards, E.queue, acts, E.lanetabs, E.turretPanel, E.blessPanel, E.toast, E.banner, E.hint, E.tooltip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private buildTurretPanel(): HTMLElement {
    const panel = h('div', { class: 'panel turretpanel hidden' });
    const close = h('button', { class: 'pclose', html: ICONS.close });
    close.addEventListener('click', () => this.togglePanel('none'));
    panel.appendChild(h('div', { class: 'ptitle' }, h('i', { html: ICONS.tower }), 'Turrets', close));
    panel.appendChild(h('div', { class: 'pdesc', text: 'One turret per lane, mounted on your gate. Bolt turrets pick off single foes; Blast turrets hit groups.' }));
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const row = h('div', { class: 'trow', 'data-lane': lane });
      row.addEventListener('pointerenter', () => this.game && (this.game.view.hoverLane = lane));
      row.addEventListener('pointerleave', () => this.game && (this.game.view.hoverLane = -1));
      this.turretRows.push(row);
      panel.appendChild(row);
    }
    return panel;
  }

  private buildBlessPanel(): HTMLElement {
    const panel = h('div', { class: 'panel blesspanel hidden' });
    const close = h('button', { class: 'pclose', html: ICONS.close });
    close.addEventListener('click', () => this.togglePanel('none'));
    panel.appendChild(h('div', { class: 'ptitle' }, h('i', { html: ICONS.bless }), 'Blessings', close));
    panel.appendChild(h('div', { class: 'pdesc', text: 'Permanent favours of the gods. Each rank costs more, and prices rise with every age.' }));
    for (const id of BLESSING_ORDER) {
      const b = BLESSINGS[id];
      const pips = h('div', { class: 'pips' });
      for (let i = 0; i < BLESSING_MAX_RANK; i++) pips.appendChild(h('i'));
      const buy = h('button', { class: 'buy' });
      buy.addEventListener('click', () => this.tryBless(id));
      const row = h('div', { class: `brow b-${id}` }, h('div', { class: 'bname', text: b.name }), pips, h('div', { class: 'bdesc', text: b.blurb }), buy);
      this.blessRows[id] = row;
      panel.appendChild(row);
    }
    return panel;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  attach(game: Game): void {
    this.game = game;
    this.cardAge = -1;
    this.hpShown = [1, 1];
    this.togglePanel('none');
    this.root.classList.remove('hidden');
    setText(this.el.toast, '');
    this.el.toast.classList.remove('show');
    this.el.banner.classList.remove('show');
    this.hint('');
  }

  detach(): void {
    this.game = null;
    this.root.classList.add('hidden');
    this.hideTooltip();
  }

  setLayout(layout: Layout): void {
    this.layoutInfo = layout;
    this.root.classList.toggle('mobile', layout.mode === 'mobile');
    this.root.classList.toggle('desktop', layout.mode === 'desktop');
    setStyle(this.root, '--bottom', `${layout.insets.bottom}px`);
    setStyle(this.root, '--side', `${layout.insets.left}px`);
    setStyle(this.root, '--ui', String(Math.max(0.72, Math.min(1.25, layout.ui))));
    // Lane tabs sit just behind the player's gates.
    for (let i = 0; i < LANE_COUNT; i++) {
      const g = layout.lanes[i];
      const s = g.s * (layout.mode === 'mobile' ? 1.4 : 1.25);
      const tab = this.laneTabs[i];
      tab.style.left = `${g.x0 - 40 * s - 4}px`;
      tab.style.top = `${g.y - 34 * s}px`;
    }
    this.cardAge = -1;
  }

  // -------------------------------------------------------------------------
  // Actions (used by cards, keyboard, drag-and-drop)
  // -------------------------------------------------------------------------

  selectLane(lane: number): void {
    if (!this.game) return;
    if (lane < 0 || lane >= LANE_COUNT) return;
    if (this.game.view.selectedLane !== lane) this.cb.sound('select');
    this.game.view.selectedLane = lane;
  }

  tryTrain(unitId: string, lane?: number): boolean {
    const g = this.game;
    if (!g) return false;
    const l = lane ?? g.view.selectedLane;
    const r = g.command({ type: 'train', team: g.playerTeam, unitId, lane: l });
    const card = this.cards.find((c) => c.def.id === unitId);
    if (r.ok) {
      this.cb.sound('summon');
      if (card) {
        card.el.classList.remove('bump');
        void card.el.offsetWidth;
        card.el.classList.add('bump');
      }
    } else {
      this.fail(r.reason, card?.el);
    }
    return r.ok;
  }

  tryPower(lane: number): boolean {
    const g = this.game;
    if (!g) return false;
    const r = g.command({ type: 'power', team: g.playerTeam, lane });
    g.view.targeting = 'none';
    this.hint('');
    if (r.ok) this.cb.sound('power');
    else this.fail(r.reason, this.el.power);
    return r.ok;
  }

  beginPowerTargeting(): void {
    const g = this.game;
    if (!g) return;
    const why = g.world.powerBlocker(g.playerTeam);
    if (why) {
      this.fail(why, this.el.power);
      return;
    }
    if (g.view.targeting === 'power') {
      this.cancelTargeting();
      return;
    }
    g.view.targeting = 'power';
    this.togglePanel('none');
    this.hint(`${POWERS[AGES[g.world.players[g.playerTeam].age].power].name}: choose a lane`);
  }

  cancelTargeting(): void {
    if (!this.game) return;
    this.game.view.targeting = 'none';
    this.hint('');
  }

  tryAscend(): boolean {
    const g = this.game;
    if (!g) return false;
    const r = g.command({ type: 'ageUp', team: g.playerTeam });
    if (!r.ok) this.fail(r.reason, this.el.ascend);
    return r.ok;
  }

  tryBless(id: BlessingId): void {
    const g = this.game;
    if (!g) return;
    const r = g.command({ type: 'bless', team: g.playerTeam, blessing: id });
    if (r.ok) this.cb.sound('bless');
    else this.fail(r.reason, this.blessRows[id]);
  }

  tryTurret(lane: number, turretId: string): void {
    const g = this.game;
    if (!g) return;
    const r = g.command({ type: 'buildTurret', team: g.playerTeam, lane, turretId });
    if (r.ok) this.cb.sound('build');
    else this.fail(r.reason, this.turretRows[lane]);
  }

  trySell(lane: number): void {
    const g = this.game;
    if (!g) return;
    const r = g.command({ type: 'sellTurret', team: g.playerTeam, lane });
    if (r.ok) this.cb.sound('sell');
    else this.fail(r.reason, this.turretRows[lane]);
  }

  toggleSpeed(): void {
    if (!this.game) return;
    this.game.speed = this.game.speed === 1 ? 2 : 1;
    setText(this.el.speed.querySelector('span')!, `${this.game.speed}×`);
    toggle(this.el.speed, 'on', this.game.speed > 1);
  }

  togglePanel(which: 'none' | 'turret' | 'bless'): void {
    if (this.panel === which) which = 'none';
    this.panel = which;
    toggle(this.el.turretPanel, 'hidden', which !== 'turret');
    toggle(this.el.blessPanel, 'hidden', which !== 'bless');
    toggle(this.el.turretBtn, 'on', which === 'turret');
    toggle(this.el.blessBtn, 'on', which === 'bless');
    if (which !== 'none') this.cancelTargeting();
  }

  openTurretPanel(lane: number): void {
    if (this.panel !== 'turret') this.togglePanel('turret');
    for (const r of this.turretRows) r.classList.remove('flash');
    const row = this.turretRows[lane];
    void row.offsetWidth;
    row.classList.add('flash');
  }

  get panelOpen(): boolean {
    return this.panel !== 'none';
  }

  private fail(reason: string, el?: HTMLElement): void {
    this.toast(reason, 'bad');
    this.cb.sound('error');
    if (el) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }

  toast(text: string, kind: 'bad' | 'good' | 'info' = 'info'): void {
    const t = this.el.toast;
    setText(t, text);
    t.className = `toast show ${kind}`;
    this.toastTimer = 1.8;
  }

  banner(title: string, sub: string, kind = ''): void {
    const b = this.el.banner;
    setText(b.querySelector('.btitle')!, title);
    setText(b.querySelector('.bsub')!, sub);
    b.className = `banner ${kind}`;
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerTimer = 2.8;
  }

  hint(text: string): void {
    setText(this.el.hint, text);
    toggle(this.el.hint, 'show', !!text);
  }

  // -------------------------------------------------------------------------
  // Drag and drop (cards → lane, power → lane)
  // -------------------------------------------------------------------------

  private startDrag(e: PointerEvent, unitId: string | null, power: boolean): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.drag = { unitId, power, startX: e.clientX, startY: e.clientY, active: false, pointerId: e.pointerId, longPress: 0 };
    if (unitId && this.layoutInfo?.mode === 'mobile') {
      const id = unitId;
      this.drag.longPress = window.setTimeout(() => {
        if (this.drag && !this.drag.active && this.drag.unitId === id) {
          const card = this.cards.find((c) => c.def.id === id);
          if (card) this.showTooltip(card.def, card.el);
          this.drag = null;
        }
      }, 420);
    }
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId || !this.game) return;
    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.active && dist > 10) {
      d.active = true;
      clearTimeout(d.longPress);
      this.hideTooltip();
      this.game.view.targeting = d.power ? 'power' : 'summon';
      this.ghost.innerHTML = '';
      if (d.unitId) this.ghost.appendChild(portrait(d.unitId, 64));
      else this.ghost.innerHTML = this.el.powerIcon.innerHTML;
      this.ghost.classList.remove('hidden');
      this.hint(d.power ? 'Drop on a lane to unleash' : 'Drop on a lane to summon');
    }
    if (d.active) {
      const [gx, gy] = this.toStage(e.clientX, e.clientY);
      this.ghost.style.transform = `translate(${gx - 32}px, ${gy - 56}px)`;
      this.game.view.hoverLane = this.laneAtPoint(e.clientX, e.clientY);
    }
  }

  private onDragEnd(e: PointerEvent, cancelled = false): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    clearTimeout(d.longPress);
    this.drag = null;
    if (!this.game) return;
    if (d.active) {
      this.ghost.classList.add('hidden');
      const lane = cancelled ? -1 : this.laneAtPoint(e.clientX, e.clientY);
      this.game.view.hoverLane = -1;
      this.game.view.targeting = 'none';
      this.hint('');
      if (lane >= 0) {
        if (d.power) this.tryPower(lane);
        else if (d.unitId) {
          this.selectLane(lane);
          this.tryTrain(d.unitId, lane);
        }
      }
      return;
    }
    if (cancelled) return;
    // A plain click / tap
    if (d.power) this.beginPowerTargeting();
    else if (d.unitId) this.tryTrain(d.unitId);
  }

  // -------------------------------------------------------------------------
  // Tooltips
  // -------------------------------------------------------------------------

  showTooltip(def: UnitDef, anchor: HTMLElement): void {
    const tt = this.el.tooltip;
    const strong = COUNTERS[def.cls];
    const weak = counterOf(def.cls);
    const dps = (def.damage / def.cooldown).toFixed(def.damage / def.cooldown < 10 ? 1 : 0);
    const counters =
      def.cls === 'legend'
        ? '<div class="ttc">Neutral against every class.</div>'
        : `<div class="ttc"><span class="good">Strong vs ${chip(strong!)}</span><span class="bad">Weak vs ${chip(weak!)}</span></div>`;
    tt.innerHTML = `
      <div class="tth"><span class="ttcls" style="color:${CLASS_COLOR[def.cls]}">${CLASS_ICON[def.cls]}</span><b>${def.name}</b><span class="ttcost">${ICONS.gold}${def.cost}</span></div>
      <div class="ttsub">${CLASS_NAME[def.cls]} · ${def.projectile ? 'Ranged' : 'Melee'}</div>
      ${counters}
      <div class="ttstats">
        <span>${ICONS.heart}${fmt(def.hp)}</span>
        <span>${ICONS.swords}${dps}/s</span>
        <span>Range ${def.projectile ? Math.round(def.range) : 'melee'}</span>
        <span>Speed ${Math.round(def.speed)}</span>
      </div>
      ${def.traitText ? `<div class="tttrait">${def.traitText}</div>` : ''}
      <div class="ttblurb">${def.blurb}</div>`;
    tt.classList.remove('hidden');
    const br = anchor.getBoundingClientRect();
    const [ax, ay] = this.toStage(br.left, br.top);
    const [bx, by] = this.toStage(br.right, br.bottom);
    const r = { left: Math.min(ax, bx), right: Math.max(ax, bx), top: Math.min(ay, by), bottom: Math.max(ay, by) };
    const rw = r.right - r.left;
    const rh = r.bottom - r.top;
    const W = this.layoutInfo?.width ?? window.innerWidth;
    const H = this.layoutInfo?.height ?? window.innerHeight;
    const tw = tt.offsetWidth;
    const th = tt.offsetHeight;
    let x: number;
    let y: number;
    if (this.layoutInfo?.mode === 'mobile') {
      x = r.right + 8;
      y = Math.max(8, Math.min(H - th - 8, r.top + rh / 2 - th / 2));
    } else {
      x = Math.max(8, Math.min(W - tw - 8, r.left + rw / 2 - tw / 2));
      y = r.top - th - 10;
    }
    tt.style.left = `${x}px`;
    tt.style.top = `${y}px`;
    this.tooltipFor = def.id;
  }

  hideTooltip(): void {
    this.el.tooltip.classList.add('hidden');
    this.tooltipFor = null;
  }

  // -------------------------------------------------------------------------
  // Events & per-frame update
  // -------------------------------------------------------------------------

  onEvents(events: SimEvent[]): void {
    const g = this.game;
    if (!g) return;
    const me = g.playerTeam;
    for (const e of events) {
      if (e.type === 'ageUp') {
        const age = AGES[e.age];
        if (e.team === me) this.banner(age.subtitle, `You ascend to ${age.name}`, 'gold');
        else this.toast(`The enemy ascends to ${age.name}!`, 'bad');
      } else if (e.type === 'shrine' && e.owner !== -1) {
        this.toast(e.owner === me ? `${LANE_NAMES[e.lane]} shrine captured` : `${LANE_NAMES[e.lane]} shrine lost`, e.owner === me ? 'good' : 'bad');
      } else if (e.type === 'power' && e.team !== me) {
        this.toast(`Enemy casts ${POWERS[e.kind].name}!`, 'bad');
      } else if (e.type === 'ragnarok') {
        this.banner('Ragnarök', 'The gods fall silent — citadels crumble', 'red');
      } else if (e.type === 'blessing' && e.team !== me) {
        this.toast(`Enemy gains ${BLESSINGS[e.blessing].name} ${ROMAN[e.rank - 1]}`, 'info');
      }
    }
  }

  update(dt: number): void {
    const g = this.game;
    if (!g) return;
    const w = g.world;
    const me = w.players[g.playerTeam];
    const foe = w.players[g.playerTeam === 0 ? 1 : 0];
    const E = this.el;

    if (this.cardAge !== me.age) this.rebuildCards(me.age);

    // Top bar
    const fracs: [number, number] = [me.baseHp / me.baseMaxHp, foe.baseHp / foe.baseMaxHp];
    for (let i = 0; i < 2; i++) {
      this.hpShown[i] += (fracs[i] - this.hpShown[i]) * Math.min(1, dt * 3);
      if (this.hpShown[i] < fracs[i]) this.hpShown[i] = fracs[i];
    }
    setStyle(E.hpL, 'width', `${(fracs[0] * 100).toFixed(2)}%`);
    setStyle(E.hpLd, 'width', `${(this.hpShown[0] * 100).toFixed(2)}%`);
    setStyle(E.hpR, 'width', `${(fracs[1] * 100).toFixed(2)}%`);
    setStyle(E.hpRd, 'width', `${(this.hpShown[1] * 100).toFixed(2)}%`);
    setText(E.hpLn, fmt(Math.ceil(me.baseHp)));
    setText(E.hpRn, fmt(Math.ceil(foe.baseHp)));
    setText(E.ageL, ROMAN[me.age]);
    setText(E.ageR, ROMAN[foe.age]);
    setText(E.ageLn, AGES[me.age].name);
    setText(E.ageRn, AGES[foe.age].name);
    toggle(E.hpL.parentElement!, 'low', fracs[0] < 0.3);
    setText(E.clock, fmtTime(w.time));
    const pips = E.shrines.children;
    for (let i = 0; i < LANE_COUNT; i++) {
      const o = w.shrines[i].owner;
      const pip = pips[i] as HTMLElement;
      toggle(pip, 'mine', o === g.playerTeam);
      toggle(pip, 'theirs', o !== -1 && o !== g.playerTeam);
      toggle(pip, 'contested', w.shrines[i].contested);
    }
    if (w.ragnarokStarted) setText(E.rag, 'RAGNARÖK');
    else if (w.ragnarokAt - w.time < 120) setText(E.rag, `Ragnarök in ${fmtTime(w.ragnarokAt - w.time)}`);
    else setText(E.rag, '');
    toggle(E.rag, 'active', w.ragnarokStarted);
    void RAGNAROK_TIME;

    // Resources
    setText(E.gold, fmt(me.gold));
    setText(E.income, `+${w.incomeOf(g.playerTeam).toFixed(1)}/s`);
    if (me.age < MAX_AGE) {
      const next = AGES[me.age + 1];
      const prev = AGES[me.age].xpRequired;
      const k = Math.min(1, (me.xp - prev) / (next.xpRequired - prev));
      setStyle(E.xpfill, 'width', `${(Math.max(0, k) * 100).toFixed(1)}%`);
      setText(E.xptext, `${fmt(me.xp)} / ${fmt(next.xpRequired)}`);
    } else {
      setStyle(E.xpfill, 'width', '100%');
      setText(E.xptext, `${fmt(me.xp)} — final age`);
    }

    // Cards
    for (const c of this.cards) {
      const why = w.trainBlocker(g.playerTeam, c.def.id);
      toggle(c.el, 'poor', why === 'Not enough gold');
      toggle(c.el, 'blocked', !!why && why !== 'Not enough gold');
    }

    // Queue
    this.updateQueue();

    // Lane tabs
    const counts = [0, 0, 0];
    for (const q of me.queue) counts[q.lane]++;
    for (let i = 0; i < LANE_COUNT; i++) {
      const tab = this.laneTabs[i];
      toggle(tab, 'sel', g.view.selectedLane === i);
      toggle(tab, 'hover', g.view.hoverLane === i && g.view.targeting !== 'none');
      setText(tab.querySelector('.qn')!, counts[i] ? String(counts[i]) : '');
    }

    // God power
    const power = POWERS[AGES[me.age].power];
    if (E.powerIcon.dataset.id !== power.id) {
      E.powerIcon.innerHTML = POWER_ICONS[power.id];
      E.powerIcon.dataset.id = power.id;
      setText(E.powerName, power.name);
      E.power.title = `${power.name} (Space) — ${power.blurb}`;
    }
    const cdFrac = me.powerCooldown > 0 ? me.powerCooldown / power.cooldown : 0;
    setStyle(E.powerCd, '--cd', `${(Math.min(1, cdFrac) * 360).toFixed(1)}deg`);
    setText(E.powerTime, me.powerCooldown > 0 ? String(Math.ceil(me.powerCooldown)) : '');
    toggle(E.power, 'ready', me.powerCooldown <= 0);
    toggle(E.power, 'targeting', g.view.targeting === 'power');

    // Ascend
    if (me.age < MAX_AGE) {
      const next = AGES[me.age + 1];
      const xpK = Math.min(1, me.xp / next.xpRequired);
      setStyle(E.ascFill, 'height', `${(xpK * 100).toFixed(1)}%`);
      setText(E.ascSub, `${next.name} · ${fmt(next.ascendCost)}g`);
      const why = w.ageUpBlocker(g.playerTeam);
      toggle(E.ascend, 'ready', !why);
      toggle(E.ascend, 'xpready', me.xp >= next.xpRequired && !!why);
      E.ascend.title = `Ascend to ${next.name} (U): needs ${fmt(next.xpRequired)} XP and ${fmt(next.ascendCost)} gold. New creatures, turrets, god power and a stronger citadel.`;
    } else {
      setStyle(E.ascFill, 'height', '100%');
      setText(E.ascSub, 'Final age');
      toggle(E.ascend, 'ready', false);
      toggle(E.ascend, 'maxed', true);
    }

    // Panels
    if (this.panel === 'turret') this.updateTurretPanel();
    if (this.panel === 'bless') this.updateBlessPanel();
    const canBless = BLESSING_ORDER.some((id) => w.blessingBlocker(g.playerTeam, id) === null);
    toggle(E.blessBtn, 'avail', canBless);

    // Timers
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) E.toast.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) E.banner.classList.remove('show');
    }
    if (this.tooltipFor && this.layoutInfo?.mode === 'mobile' && Math.random() < 0) this.hideTooltip();
  }

  private rebuildCards(age: number): void {
    const E = this.el;
    this.cardAge = age;
    E.cards.innerHTML = '';
    this.cards = [];
    const mobile = this.layoutInfo?.mode === 'mobile';
    const size = mobile ? 52 : 70;
    AGE_UNITS[age].forEach((def, i) => {
      const cost = h('div', { class: 'cost' }, h('i', { html: ICONS.gold }), String(def.cost));
      const el = h(
        'button',
        { class: `card cls-${def.cls}`, style: `--cls:${CLASS_COLOR[def.cls]}` },
        h('div', { class: 'portrait' }, portrait(def.id, size)),
        h('div', { class: 'clsico', html: CLASS_ICON[def.cls] }),
        h('div', { class: 'name', text: def.name }),
        cost,
        h('div', { class: 'key', text: String(i + 1) }),
      );
      el.style.animationDelay = `${i * 60}ms`;
      el.addEventListener('pointerdown', (e) => this.startDrag(e as PointerEvent, def.id, false));
      el.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType === 'mouse') this.showTooltip(def, el);
      });
      el.addEventListener('pointerleave', () => this.hideTooltip());
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showTooltip(def, el);
      });
      E.cards.appendChild(el);
      this.cards.push({ def, el, cost });
    });
    toggle(E.cards, 'four', this.cards.length > 3);
  }

  private updateQueue(): void {
    const g = this.game!;
    const me = g.world.players[g.playerTeam];
    const q = me.queue;
    const chips = this.queueChips;
    // Rebuild when composition changed
    const sig = q.map((i) => `${i.unitId}:${i.lane}`).join(',');
    if (this.el.queue.dataset.sig !== sig) {
      this.el.queue.dataset.sig = sig;
      this.el.queue.innerHTML = '';
      chips.length = 0;
      q.forEach((item, idx) => {
        const chip = h(
          'button',
          { class: 'qchip', title: `${UNITS[item.unitId].name} → ${LANE_NAMES[item.lane]} lane (click to cancel)` },
          portrait(item.unitId, 30),
          h('span', { class: 'ql', text: LANE_NAMES[item.lane][0] }),
          h('div', { class: 'qprog' }),
        );
        chip.addEventListener('click', () => {
          const r = g.command({ type: 'cancel', team: g.playerTeam, index: idx });
          if (r.ok) this.cb.sound('cancel');
        });
        this.el.queue.appendChild(chip);
        chips.push(chip);
      });
      for (let i = q.length; i < QUEUE_MAX; i++) this.el.queue.appendChild(h('div', { class: 'qslot' }));
    }
    if (chips.length > 0 && q.length > 0) {
      const def = UNITS[q[0].unitId];
      const k = Math.min(1, me.trainProgress / def.trainTime);
      setStyle(chips[0].querySelector('.qprog') as HTMLElement, 'width', `${(k * 100).toFixed(1)}%`);
      toggle(chips[0], 'waiting', k >= 1);
    }
  }

  private updateTurretPanel(): void {
    const g = this.game!;
    const w = g.world;
    const me = w.players[g.playerTeam];
    const [bolt, blast] = AGE_TURRETS[me.age];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const row = this.turretRows[lane];
      const cur = me.turrets[lane].def;
      const sig = `${me.age}:${cur?.id ?? '-'}`;
      if (row.dataset.sig !== sig) {
        row.dataset.sig = sig;
        row.innerHTML = '';
        const mk = (id: string) => {
          const def = TURRETS[id];
          const b = h('button', { class: `tbuy ${def.kind}`, title: `${def.blurb} Damage ${def.damage}${def.splash ? ' (splash)' : ''}, range ${def.range}.` }, h('span', { class: 'tn', text: def.name }), h('span', { class: 'tc' }, h('i', { html: ICONS.gold }), String(def.cost)));
          b.dataset.id = id;
          b.addEventListener('click', () => this.tryTurret(lane, id));
          return b;
        };
        const status = cur ? h('div', { class: 'tcur' }, h('b', { text: cur.name }), cur.age < me.age ? h('span', { class: 'old', text: 'outdated' }) : null) : h('div', { class: 'tcur empty', text: 'Empty — gate ward only' });
        const buttons = h('div', { class: 'tbtns' });
        for (const id of [bolt.id, blast.id]) if (!cur || cur.id !== id) buttons.appendChild(mk(id));
        if (cur) {
          const sell = h('button', { class: 'tsell', title: 'Sell for half its cost' }, h('span', { class: 'tn', text: 'Sell' }), h('span', { class: 'tc', text: `+${Math.floor(cur.cost * SELL_REFUND)}` }));
          sell.addEventListener('click', () => this.trySell(lane));
          buttons.appendChild(sell);
        }
        row.append(h('div', { class: 'tlane', text: LANE_NAMES[lane] }), status, buttons);
      }
      for (const b of row.querySelectorAll<HTMLButtonElement>('.tbuy')) {
        toggle(b, 'poor', w.turretBlocker(g.playerTeam, lane, b.dataset.id!) === 'Not enough gold');
      }
    }
  }

  private updateBlessPanel(): void {
    const g = this.game!;
    const w = g.world;
    const me = w.players[g.playerTeam];
    for (const id of BLESSING_ORDER) {
      const row = this.blessRows[id];
      const rank = me.blessings[id];
      const pips = row.querySelectorAll('.pips i');
      pips.forEach((p, i) => toggle(p, 'on', i < rank));
      const buy = row.querySelector('.buy') as HTMLButtonElement;
      if (rank >= BLESSING_MAX_RANK) {
        setText(buy, 'Max');
        toggle(buy, 'poor', false);
        buy.disabled = true;
      } else {
        const cost = blessingCost(rank, me.age);
        buy.disabled = false;
        buy.innerHTML = `${ICONS.gold}<span>${fmt(cost)}</span>`;
        toggle(buy, 'poor', me.gold < cost);
      }
    }
  }

  get teamOf(): Team {
    return this.game?.playerTeam ?? 0;
  }
}

function chip(cls: string): string {
  return `<span class="clschip" style="color:${CLASS_COLOR[cls]}">${CLASS_ICON[cls]}${CLASS_NAME[cls]}</span>`;
}
