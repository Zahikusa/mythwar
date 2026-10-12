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
  RAGNAROK_CRUMBLE_AFTER,
  RUSH_COST,
  RUSH_XP,
  SELL_REFUND,
  TURRETS,
  UNITS,
  blessingCost,
  counterOf,
} from '../sim/data.ts';
import type { BlessingId, UnitDef } from '../sim/data.ts';
import type { SimEvent, Team } from '../sim/types.ts';
import type { Game } from '../game.ts';
import { artScaleOf } from '../render/layout.ts';
import type { Layout } from '../render/layout.ts';
import { h, fmt, fmtTime, onTap, setStyle, setText, toggle } from './dom.ts';
import { CLASS_COLOR, CLASS_ICON, CLASS_NAME, ICONS, POWER_ICONS } from './icons.ts';
import { portrait } from './portraits.ts';
import { EMOTES } from '../net/protocol.ts';
import type { EmoteId } from '../net/protocol.ts';

export const LANE_NAMES = ['Top', 'Middle', 'Bottom'];

/** Holding Enter on a focused button would click it again on every key repeat. */
const noRepeat = (e: KeyboardEvent): void => {
  if (e.repeat && e.key === 'Enter') e.preventDefault();
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface HudCallbacks {
  pause(): void;
  sound(kind: string): void;
  /** Toggle mute; returns true when now muted. */
  toggleMute(): boolean;
  isMuted(): boolean;
  /** Remember the player's preferred speed. */
  speedChanged(speed: number): void;
  /** Online: send a quick message to the opponent (false if it couldn't be sent). */
  emote?(id: EmoteId): boolean;
}

interface QueueChip {
  unitId: string;
  lane: number;
  el: HTMLButtonElement;
  prog: HTMLElement;
}

interface CardEl {
  def: UnitDef;
  el: HTMLButtonElement;
  cost: HTMLElement;
  /** Savings bar: how much of the price you already have. */
  save: HTMLElement;
}

/** The in-game heads-up display and the player's action layer (shared by mouse, touch and keys). */
export class Hud {
  readonly root: HTMLDivElement;
  private game: Game | null = null;
  /** Highest age this player has ever reached (from the settings): later ones preview as silhouettes. */
  ageSeen = 0;
  /** Mark the card that counters the selected lane (a setting: experts may prefer to read lanes themselves). */
  advice = true;
  private cb: HudCallbacks;
  private layoutInfo: Layout | null = null;
  private cards: CardEl[] = [];
  private cardAge = -1;
  private el: Record<string, HTMLElement> = {};
  private laneTabs: HTMLButtonElement[] = [];
  /** Per lane: hold the line at the shrine / advance. */
  private holdBtns: HTMLButtonElement[] = [];
  private laneBars: { bar: HTMLElement; fill: HTMLElement; count: HTMLElement }[] = [];
  private queueChips: QueueChip[] = [];
  private toastTimer = 0;
  private toastQueue: { text: string; kind: 'bad' | 'good' | 'info' | 'feat' }[] = [];
  private bannerTimer = 0;
  private panel: 'none' | 'turret' | 'bless' | 'keys' = 'none';
  private turretRows: HTMLElement[] = [];
  private blessRows: Record<string, HTMLElement> = {};
  private blessRefs: Record<string, { pips: Element[]; buy: HTMLButtonElement; cost: number; gain: HTMLElement }> = {};
  private turretBuys: HTMLButtonElement[][] = [[], [], []];
  private hpShown: [number, number] = [1, 1];
  private readyChimeAt = -100;
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
    // The quick-message picker closes on any tap outside it.
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Node | null;
        if (!this.el.emotes.classList.contains('hidden') && t && !this.el.emotes.contains(t) && !this.el.emoteBtn.contains(t)) toggle(this.el.emotes, 'hidden', true);
      },
      true,
    );
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
    E.ageL = h('div', { class: 'agebadge', title: 'Your age' });
    E.ageLn = h('div', { class: 'agename' });
    E.hpR = h('div', { class: 'hpfill' });
    E.hpRd = h('div', { class: 'hpdmg' });
    E.hpRn = h('span', { class: 'hpnum' });
    E.ageR = h('div', { class: 'agebadge', title: 'Enemy age' });
    E.ageRn = h('div', { class: 'agename' });
    E.foePow = h('i', { class: 'foepow', title: 'Enemy god power' });
    E.blessL = h('div', { class: 'blesschips' });
    E.blessR = h('div', { class: 'blesschips' });
    E.clock = h('div', { class: 'clock' });
    E.shrines = h('div', { class: 'shrines', title: 'Ley Shrines: capture them for extra gold' });
    for (let i = 0; i < LANE_COUNT; i++) E.shrines.appendChild(h('i', { html: ICONS.shrine }));
    E.rag = h('div', { class: 'ragnarok' });
    // Online battles: who you're fighting and how good the connection is.
    E.net = h('div', { class: 'netinfo hidden', role: 'status' }, h('i', { class: 'nsig', html: ICONS.wifi }), h('span', { class: 'nfoe' }), h('span', { class: 'nping' }));
    E.speed = h('button', { class: 'sysbtn speed', title: 'Game speed (F)', 'aria-label': 'Game speed', html: ICONS.fast + '<span>1×</span>' });
    E.pause = h('button', { class: 'sysbtn', title: 'Pause (Esc)', html: ICONS.pause });
    // Online: quick messages to the opponent.
    E.emoteBtn = h('button', { class: 'sysbtn emotebtn hidden', title: 'Quick message', 'aria-label': 'Send a quick message', html: ICONS.chat });
    onTap(E.emoteBtn, () => toggle(E.emotes, 'hidden', !E.emotes.classList.contains('hidden')));
    E.emotes = h('div', { class: 'emotes hidden', role: 'menu' });
    for (const [id, text] of Object.entries(EMOTES) as [EmoteId, string][]) {
      const b = h('button', { class: 'emote', role: 'menuitem', text });
      onTap(b, () => this.sendEmote(id));
      E.emotes.appendChild(b);
    }
    E.bubbleMine = h('div', { class: 'ebubble mine', 'aria-live': 'polite' });
    E.bubbleTheirs = h('div', { class: 'ebubble theirs', 'aria-live': 'polite' });
    onTap(E.speed, () => this.toggleSpeed());
    onTap(E.pause, () => this.cb.pause());
    // Sandbox: which side your orders summon for.
    E.side = h('button', { class: 'sidebtn hidden', title: 'Summon for which side (X)', 'aria-label': 'Summon for which side', text: 'For: You' });
    onTap(E.side, () => this.toggleSide());
    const top = h(
      'div',
      { class: 'topbar' },
      h('div', { class: 'side left' }, E.ageL, h('div', { class: 'hpcol' }, h('div', { class: 'hpbar' }, E.hpLd, E.hpL, E.hpLn), h('div', { class: 'agerow left' }, E.ageLn, E.blessL))),
      h('div', { class: 'mid' }, E.clock, E.shrines, E.rag, E.net, E.side),
      h('div', { class: 'side right' }, h('div', { class: 'hpcol' }, h('div', { class: 'hpbar' }, E.hpRd, E.hpR, E.hpRn), h('div', { class: 'agerow' }, E.blessR, E.foePow, E.ageRn)), E.ageR),
    );
    E.keysBtn = h('button', { class: 'sysbtn keysbtn', title: 'Controls (?)', 'aria-label': 'Controls', text: '?' });
    onTap(E.keysBtn, () => this.togglePanel('keys'));
    E.muteBtn = h('button', { class: 'sysbtn mutebtn', title: 'Mute (M)', html: ICONS.sound });
    onTap(E.muteBtn, () => this.toggleMute());
    const sys = h('div', { class: 'sys' }, E.muteBtn, E.keysBtn, E.speed, E.emoteBtn, E.pause);

    // Resources
    E.gold = h('span', { class: 'goldnum' });
    E.income = h('span', { class: 'income' });
    E.xpfill = h('div', { class: 'xpfill' });
    E.xptext = h('span', { class: 'xptext' });
    const res = h(
      'div',
      { class: 'res' },
      h('div', { class: 'goldrow', title: 'Gold — earned over time, from kills and from held shrines' }, h('i', { class: 'ico', html: ICONS.gold }), E.gold, E.income),
      h('div', { class: 'xprow', title: 'Experience — earned over time, from kills and from blows against the enemy citadel. Needed to ascend.' }, h('i', { class: 'ico', html: ICONS.xp }), h('div', { class: 'xpbar' }, E.xpfill, E.xptext)),
    );

    // Cards
    E.cards = h('div', { class: 'cards' });
    E.queue = h('div', { class: 'queue' });

    // Actions
    E.powerIcon = h('div', { class: 'picon' });
    E.powerCd = h('div', { class: 'pcd' });
    E.powerTime = h('div', { class: 'ptime' });
    E.powerName = h('div', { class: 'aname' });
    E.power = h('button', { class: 'act power', title: 'God power (Space)' }, E.powerIcon, E.powerCd, E.powerTime, E.powerName, h('span', { class: 'akey', text: 'Space' }));
    E.power.addEventListener('pointerdown', (e) => this.startDrag(e as PointerEvent, null, true));
    // Keyboard activation (Enter on the focused button; pointer taps go through startDrag).
    E.power.addEventListener('click', (e) => {
      if (e.detail === 0) this.beginPowerTargeting();
    });
    E.power.addEventListener('keydown', noRepeat);

    E.ascFill = h('div', { class: 'ascfill' });
    E.ascSub = h('div', { class: 'asub' });
    E.ascend = h('button', { class: 'act ascend', 'aria-label': 'Ascend to the next age (U)' }, E.ascFill, h('i', { class: 'aico', html: ICONS.ascend }), h('div', { class: 'aname', text: 'Ascend' }), E.ascSub, h('span', { class: 'akey', text: 'U' }));
    onTap(E.ascend, () => this.tryAscend());
    // What waits in the next age: hover, keyboard focus or a long press (right click).
    E.ascend.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse') this.showAgePreview(E.ascend);
    });
    E.ascend.addEventListener('pointerleave', () => this.hideTooltip());
    E.ascend.addEventListener('focus', () => {
      if (E.ascend.matches(':focus-visible')) this.showAgePreview(E.ascend);
    });
    E.ascend.addEventListener('blur', () => this.hideTooltip());
    E.ascend.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showAgePreview(E.ascend);
    });

    E.turretBtn = h('button', { class: 'act small turretbtn', title: 'Turrets (T)' }, h('i', { class: 'aico', html: ICONS.tower }), h('div', { class: 'aname', text: 'Turrets' }), h('span', { class: 'akey', text: 'T' }));
    onTap(E.turretBtn, () => this.togglePanel('turret'));
    E.blessBtn = h('button', { class: 'act small blessbtn', title: 'Blessings (B)' }, h('i', { class: 'aico', html: ICONS.bless }), h('div', { class: 'aname', text: 'Blessings' }), h('span', { class: 'akey', text: 'B' }));
    onTap(E.blessBtn, () => this.togglePanel('bless'));
    const acts = h('div', { class: 'acts' }, E.power, E.ascend, h('div', { class: 'actpair' }, E.turretBtn, E.blessBtn));

    // Lane tabs (near the player's gates)
    E.lanetabs = h('div', { class: 'lanetabs' });
    for (let i = 0; i < LANE_COUNT; i++) {
      const tab = h(
        'button',
        { class: 'lanetab', title: `${LANE_NAMES[i]} lane`, 'aria-label': `Select the ${LANE_NAMES[i].toLowerCase()} lane` },
        h('span', { class: 'arrow', text: '▶' }),
        h('span', { class: 'qn' }),
        h('span', { class: 'lbar', title: 'Lane strength: yours vs. the enemy' }, h('i')),
      );
      const bar = tab.querySelector('.lbar') as HTMLElement;
      this.laneBars.push({ bar, fill: bar.firstElementChild as HTMLElement, count: tab.querySelector('.qn') as HTMLElement });
      onTap(tab, () => this.selectLane(i));
      this.laneTabs.push(tab);
      E.lanetabs.appendChild(tab);
      const hold = h('button', { class: 'holdbtn', title: `Hold the ${LANE_NAMES[i].toLowerCase()} lane at its shrine (G)`, 'aria-label': `Hold the ${LANE_NAMES[i].toLowerCase()} lane at its shrine`, 'aria-pressed': 'false', html: ICONS.shield });
      onTap(hold, () => this.toggleHold(i));
      this.holdBtns.push(hold);
      E.lanetabs.appendChild(hold);
    }

    // Panels
    E.turretPanel = this.buildTurretPanel();
    E.blessPanel = this.buildBlessPanel();
    E.keysPanel = this.buildKeysPanel();

    // Screen readers announce event toasts and banners (ascensions, Ragnarök, the verdict).
    E.toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    E.banner = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'btitle' }), h('div', { class: 'bsub' }), h('div', { class: 'blore' }));
    E.hint = h('div', { class: 'hint' });
    E.tooltip = h('div', { class: 'tooltip hidden' });

    this.root.append(top, sys, E.emotes, E.bubbleMine, E.bubbleTheirs, res, E.cards, E.queue, acts, E.lanetabs, E.turretPanel, E.blessPanel, E.keysPanel, E.toast, E.banner, E.hint, E.tooltip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private buildTurretPanel(): HTMLElement {
    const panel = h('div', { class: 'panel turretpanel hidden' });
    const close = h('button', { class: 'pclose', html: ICONS.close, 'aria-label': 'Close' });
    onTap(close, () => this.togglePanel('none'));
    // Your gold, right where you spend it (on phones the panel covers the gold counter).
    this.el.pgoldT = h('span', { class: 'pgold', title: 'Your gold' });
    panel.appendChild(h('div', { class: 'ptitle' }, h('i', { html: ICONS.tower }), 'Turrets', this.el.pgoldT, close));
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

  private buildKeysPanel(): HTMLElement {
    const panel = h('div', { class: 'panel keyspanel hidden' });
    const close = h('button', { class: 'pclose', html: ICONS.close, 'aria-label': 'Close' });
    onTap(close, () => this.togglePanel('none'));
    panel.appendChild(h('div', { class: 'ptitle' }, h('i', { html: ICONS.info }), 'Controls', close));
    const rows: [string, string][] = [
      ['1 – 4', 'Summon a creature into the selected lane'],
      ['W / S  ·  ↑ / ↓  ·  Q A Z', 'Select a lane (or click it, or turn the mouse wheel)'],
      ['Drag a card', 'Summon straight into any lane'],
      ['Space', 'God power on the selected lane'],
      ['Backspace / Del', 'Cancel the last summon (refund)'],
      ['U', 'Ascend to the next age'],
      ['T  ·  B', 'Turrets  ·  Blessings'],
      ['G', 'Hold the selected lane at its shrine / advance'],
      ['F', 'Toggle 2× speed'],
      ['M', 'Mute / unmute'],
      ['Click your gate', 'Turret panel for that lane'],
      ['? · H', 'This panel'],
      ['Esc / P', 'Pause'],
      ['Right-click', 'Cancel power targeting'],
    ];
    const list = h('div', { class: 'keys' });
    for (const [k, d] of rows) list.append(h('kbd', { text: k }), h('span', { text: d }));
    panel.appendChild(list);
    return panel;
  }

  private buildBlessPanel(): HTMLElement {
    const panel = h('div', { class: 'panel blesspanel hidden' });
    const close = h('button', { class: 'pclose', html: ICONS.close, 'aria-label': 'Close' });
    onTap(close, () => this.togglePanel('none'));
    this.el.pgoldB = h('span', { class: 'pgold', title: 'Your gold' });
    panel.appendChild(h('div', { class: 'ptitle' }, h('i', { html: ICONS.bless }), 'Blessings', this.el.pgoldB, close));
    panel.appendChild(h('div', { class: 'pdesc', text: 'Permanent favours of the gods. Each rank costs more, and prices rise with every age.' }));
    this.el.foeBless = h('div', { class: 'foebless' });
    panel.appendChild(this.el.foeBless);
    for (const id of BLESSING_ORDER) {
      const b = BLESSINGS[id];
      const pips = h('div', { class: 'pips' });
      for (let i = 0; i < BLESSING_MAX_RANK; i++) pips.appendChild(h('i'));
      const buy = h('button', { class: 'buy' });
      onTap(buy, () => this.tryBless(id));
      const gain = h('div', { class: 'bgain' });
      const row = h('div', { class: `brow b-${id}` }, h('div', { class: 'bname', text: b.name }), pips, h('div', { class: 'bdesc', text: b.blurb }), gain, buy);
      this.blessRows[id] = row;
      this.blessRefs[id] = { pips: [...pips.children], buy, cost: -2, gain };
      panel.appendChild(row);
    }
    return panel;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  attach(game: Game): void {
    this.cancelDrag();
    this.game = game;
    toggle(this.el.speed, 'hidden', !!game.options.online);
    toggle(this.el.net, 'hidden', !game.options.online);
    toggle(this.el.emoteBtn, 'hidden', !game.options.online);
    toggle(this.el.side, 'hidden', !game.options.sandbox);
    setText(this.el.side, 'For: You');
    toggle(this.el.side, 'foe', false);
    toggle(this.el.emotes, 'hidden', true);
    this.foeName = '';
    this.root.classList.toggle('online', !!game.options.online);
    this.syncMute();
    setText(this.el.speed.querySelector('span')!, `${game.speed}×`);
    toggle(this.el.speed, 'on', game.speed > 1);
    this.el.speed.setAttribute('aria-pressed', String(game.speed > 1));
    toggle(this.el.ascend, 'maxed', false);
    this.cardAge = -1;
    this.hpShown = [1, 1];
    this.readyChimeAt = -100;
    this.togglePanel('none');
    this.root.classList.remove('hidden');
    setText(this.el.toast, '');
    this.el.toast.classList.remove('show');
    this.toastQueue = [];
    this.toastTimer = 0;
    this.el.banner.classList.remove('show');
    this.bannerTimer = 0;
    this.hint('');
  }

  detach(): void {
    this.cancelDrag();
    this.game = null;
    this.root.classList.add('hidden');
    this.hideTooltip();
  }

  setLayout(layout: Layout): void {
    // Card portraits depend on the layout mode and HUD zoom only; don't re-animate them on every resize.
    if (this.layoutInfo?.mode !== layout.mode || this.layoutInfo.hud !== layout.hud) this.cardAge = -1;
    this.layoutInfo = layout;
    this.root.classList.toggle('mobile', layout.mode === 'mobile');
    this.root.classList.toggle('desktop', layout.mode === 'desktop');
    setStyle(this.root, '--bottom', `${layout.insets.bottom}px`);
    // Zoomed HUD parts (zoom --hs, set on the stage) lay themselves out in unzoomed px.
    setStyle(this.root, '--bottom-z', `${layout.insets.bottom / layout.hud}px`);
    this.root.classList.toggle('two-row', layout.row2 > 0);
    setStyle(this.root, '--row2', `${layout.row2 / layout.hud}px`);
    setStyle(this.root, '--side', `${layout.insets.left}px`);
    // Phones: queue chips start just past the near lane's gate (tapping the gate opens turrets).
    setStyle(this.root, '--qx', `${Math.round(layout.lanes[LANE_COUNT - 1].x0 + 6)}px`);
    setStyle(this.root, '--ui', String(Math.max(0.72, Math.min(1.25, layout.ui))));
    // Lane tabs sit just behind the player's gates.
    for (let i = 0; i < LANE_COUNT; i++) {
      const g = layout.lanes[i];
      const s = artScaleOf(layout, g);
      const tab = this.laneTabs[i];
      // Tabs share the HUD zoom, which also scales their left/top.
      tab.style.left = `${(g.x0 - 58 * s) / layout.hud}px`;
      tab.style.top = `${(g.y - 22 * s) / layout.hud}px`;
      const hold = this.holdBtns[i];
      hold.style.left = `${(g.x0 - 58 * s) / layout.hud}px`;
      hold.style.top = `${(g.y + 10 * s) / layout.hud}px`;
    }
  }

  /** CSS zoom of the desktop HUD on large screens (1 elsewhere). */
  get zoom(): number {
    return this.layoutInfo?.hud ?? 1;
  }

  /** Stage coordinates of the gold icon (target for flying coins). */
  goldTarget(): [number, number] | null {
    if (this.root.classList.contains('hidden')) return null;
    const ico = this.el.gold.previousElementSibling as HTMLElement | null;
    if (!ico) return null;
    const r = ico.getBoundingClientRect();
    if (r.width === 0) return null;
    return this.toStage(r.left + r.width / 2, r.top + r.height / 2);
  }

  /** Little bounce on the gold counter when coins arrive. */
  pulseGold(): void {
    const row = this.el.gold.parentElement!;
    row.classList.remove('pulse');
    void row.offsetWidth;
    row.classList.add('pulse');
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

  /** Hold the line in `lane` (creatures stop just past its shrine), or march on. */
  toggleHold(lane: number = this.game?.view.selectedLane ?? -1): void {
    const g = this.game;
    if (!g || lane < 0 || lane >= LANE_COUNT) return;
    const team = g.options.sandbox && g.sandboxFoe ? 1 : g.playerTeam;
    const hold = !g.world.players[team].hold[lane];
    if (!g.command({ type: 'stance', team: g.playerTeam, lane, hold }).ok) return;
    this.cb.sound(hold ? 'build' : 'select');
    this.toast(hold ? `${LANE_NAMES[lane]} lane: holding at the shrine` : `${LANE_NAMES[lane]} lane: advance!`, 'info', true);
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
    this.cancelDrag();
    toggle(this.el.emotes, 'hidden', true);
    if (!this.game) return;
    this.game.view.targeting = 'none';
    this.hint('');
  }

  /** Drops a card/power drag in progress (Esc, pause, panels, leaving the battle). */
  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    clearTimeout(d.longPress);
    this.drag = null;
    this.ghost.classList.add('hidden');
    if (d.active && this.game) this.game.view.hoverLane = -1;
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

  toggleMute(): void {
    const muted = this.cb.toggleMute();
    this.syncMute();
    this.toast(muted ? 'Sound off (M)' : 'Sound on', 'info', true);
  }

  syncMute(): void {
    const muted = this.cb.isMuted();
    this.el.muteBtn.innerHTML = muted ? ICONS.mute : ICONS.sound;
    toggle(this.el.muteBtn, 'on', muted);
    this.el.muteBtn.setAttribute('aria-pressed', String(muted));
    this.el.muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
  }

  /** Feedback after a summon was cancelled from the keyboard. */
  onCancelled(): void {
    this.cb.sound('cancel');
  }

  private lastEmote = -Infinity;

  private sendEmote(id: EmoteId): void {
    toggle(this.el.emotes, 'hidden', true);
    const now = performance.now();
    // (The server drops messages closer together than this anyway.)
    if (now - this.lastEmote < 1600) return;
    if (!this.cb.emote?.(id)) return;
    this.lastEmote = now;
    this.cb.sound('click');
    this.showEmote('mine', EMOTES[id]);
  }

  /** A speech bubble under that side's health bar for a couple of seconds. */
  showEmote(side: 'mine' | 'theirs', text: string): void {
    const el = side === 'mine' ? this.el.bubbleMine : this.el.bubbleTheirs;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Online: the opponent's name (shown by their citadel's health bar). */
  private foeName = '';

  /** Online status line: the opponent's name, round-trip time and link quality. */
  setNet(foe: string, rtt: number, online: boolean, bufferMs = 0): void {
    const E = this.el;
    this.foeName = foe;
    setText(E.net.querySelector('.nfoe')!, `vs ${foe}`);
    setText(E.net.querySelector('.nping')!, online ? (rtt ? `${Math.round(rtt)} ms` : '') : 'offline');
    // Unsteady Wi-Fi shows up as a deeper jitter buffer (more delay) even when pings look fine.
    const q = !online ? 'off' : rtt > 250 || bufferMs > 250 ? 'bad' : rtt > 120 || bufferMs > 120 ? 'ok' : 'good';
    if (E.net.dataset.q !== q) {
      E.net.dataset.q = q;
      E.net.title = online ? `Connection to the game server: ${q === 'good' ? 'good' : q === 'ok' ? 'fair — a little delay' : 'unsteady — orders arrive late'}` : 'Reconnecting…';
    }
  }

  /** Sandbox: switch which side summons, powers, turrets and blessings are for. */
  toggleSide(): void {
    const g = this.game;
    if (!g?.options.sandbox) return;
    g.sandboxFoe = !g.sandboxFoe;
    setText(this.el.side, g.sandboxFoe ? 'For: Foe' : 'For: You');
    toggle(this.el.side, 'foe', g.sandboxFoe);
    this.cb.sound('select');
  }

  toggleSpeed(): void {
    // Online both players share one clock: no fast-forward.
    if (!this.game || this.game.options.online) return;
    this.game.speed = this.game.speed === 1 ? 2 : 1;
    this.cb.speedChanged(this.game.speed);
    setText(this.el.speed.querySelector('span')!, `${this.game.speed}×`);
    toggle(this.el.speed, 'on', this.game.speed > 1);
    this.el.speed.setAttribute('aria-pressed', String(this.game.speed > 1));
  }

  togglePanel(which: 'none' | 'turret' | 'bless' | 'keys'): void {
    toggle(this.el.emotes, 'hidden', true);
    if (this.panel === which) which = 'none';
    this.panel = which;
    toggle(this.el.turretPanel, 'hidden', which !== 'turret');
    toggle(this.el.blessPanel, 'hidden', which !== 'bless');
    toggle(this.el.keysPanel, 'hidden', which !== 'keys');
    // (Centre banners would draw over an open panel: they wait behind it.)
    this.root.classList.toggle('panelopen', which !== 'none');
    toggle(this.el.keysBtn, 'on', which === 'keys');
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

  /** True while a centre-screen banner (ascension, Ragnarök, verdict) is showing. */
  get bannerShowing(): boolean {
    return this.bannerTimer > 0;
  }

  private fail(reason: string, el?: HTMLElement): void {
    this.toast(reason, 'bad', true);
    this.cb.sound('error');
    if (el) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }

  /**
   * Shows a toast. Event toasts queue behind the current one (max 3) so simultaneous events
   * aren't lost; `immediate` (used for failed actions) replaces whatever is showing.
   */
  toast(text: string, kind: 'bad' | 'good' | 'info' | 'feat' = 'info', immediate = false): void {
    if (!immediate && this.toastTimer > 0) {
      const t = this.el.toast.textContent;
      if (t !== text && !this.toastQueue.some((q) => q.text === text) && this.toastQueue.length < 3) this.toastQueue.push({ text, kind });
      return;
    }
    this.showToast(text, kind);
  }

  private showToast(text: string, kind: 'bad' | 'good' | 'info' | 'feat'): void {
    const t = this.el.toast;
    setText(t, text);
    t.className = `toast show ${kind}`;
    this.toastTimer = kind === 'feat' ? 3.2 : this.toastQueue.length ? 1.4 : 1.8;
  }

  /** A centre-screen banner; `lore` adds a line of story (and keeps it up long enough to read). */
  banner(title: string, sub: string, kind = '', lore = ''): void {
    const b = this.el.banner;
    setText(b.querySelector('.btitle')!, title);
    setText(b.querySelector('.bsub')!, sub);
    setText(b.querySelector('.blore')!, lore);
    b.className = `banner ${kind}`;
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerTimer = lore ? 4.5 : 2.8;
  }

  /** The battle begins: who you face and what you must do (the game's essential experience). */
  opening(foe: string): void {
    const g = this.game;
    if (!g) return;
    const age = AGES[g.world.players[g.playerTeam].age];
    this.banner('Topple their citadel', `vs ${foe} · ${age.name}`, 'gold', age.lore);
    this.cb.sound('horn');
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
      if (d.unitId) this.ghost.appendChild(portrait(d.unitId, 64, 0, 0.4, false, this.zoom));
      else this.ghost.innerHTML = this.el.powerIcon.innerHTML;
      this.ghost.classList.remove('hidden');
      this.hint(d.power ? 'Drop on a lane to unleash' : 'Drop on a lane to summon');
    }
    if (d.active) {
      const [gx, gy] = this.toStage(e.clientX, e.clientY);
      const z = this.zoom;
      this.ghost.style.transform = `translate(${gx - 32 * z}px, ${gy - 56 * z}px) scale(${z})`;
      this.game.view.hoverLane = this.laneAtPoint(e.clientX, e.clientY);
    }
  }

  private onDragEnd(e: PointerEvent, cancelled = false): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    clearTimeout(d.longPress);
    this.drag = null;
    this.ghost.classList.add('hidden');
    if (!this.game) return;
    if (this.game.paused || this.game.over) cancelled = true;
    if (d.active) {
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
    // Effective numbers include the player's blessings.
    const w = this.game?.world;
    const team = this.game?.playerTeam ?? 0;
    const might = w ? w.mightMult(team) : 1;
    const vit = w ? w.vitalityMult(team) : 1;
    const dpsVal = (def.damage / def.cooldown) * might;
    const dps = dpsVal.toFixed(dpsVal < 10 ? 1 : 0);
    const boost = (m: number) => (m > 1 ? ` <em class="ttboost">+${Math.round((m - 1) * 100)}%</em>` : '');
    const counters =
      def.cls === 'legend'
        ? '<div class="ttc">Neutral against every class.</div>'
        : `<div class="ttc"><span class="good">Strong vs ${chip(strong!)}</span><span class="bad">Weak vs ${chip(weak!)}</span></div>`;
    tt.innerHTML = `
      <div class="tth"><span class="ttcls" style="color:${CLASS_COLOR[def.cls]}">${CLASS_ICON[def.cls]}</span><b>${def.name}</b><span class="ttcost">${ICONS.gold}${def.cost}</span></div>
      <div class="ttsub">${CLASS_NAME[def.cls]} · ${def.projectile ? 'Ranged' : 'Melee'}</div>
      ${counters}
      <div class="ttstats">
        <span>${ICONS.heart}${fmt(def.hp * vit)}${boost(vit)}</span>
        <span>${ICONS.swords}${dps}/s${boost(might)}</span>
        <span>Range ${def.projectile ? Math.round(def.range) : 'melee'}</span>
        <span>Speed ${Math.round(def.speed)}</span>
      </div>
      <div class="ttclassnote">${CLASS_NOTE[def.cls]}</div>
      ${def.traitText ? `<div class="tttrait">${def.traitText}</div>` : ''}
      <div class="ttblurb">${def.blurb}</div>`;
    this.placeTooltip(anchor);
  }

  /**
   * The next age's roster, power and citadel. Ages this player has never reached stay a mystery:
   * dark silhouettes and "???" — ascend to find out.
   */
  private showAgePreview(anchor: HTMLElement): void {
    const g = this.game;
    if (!g) return;
    const me = g.world.players[g.playerTeam];
    if (me.age >= MAX_AGE) return;
    const next = AGES[me.age + 1];
    const known = next.index <= this.ageSeen;
    const tt = this.el.tooltip;
    tt.innerHTML = `
      <div class="tth"><b>${next.name}</b><span class="ttage-sub">${next.subtitle}</span></div>
      <div class="ttsub">${known ? next.lore : 'Who waits in the next age? Ascend to find out.'}</div>`;
    const row = h('div', { class: 'ttages' });
    for (const def of AGE_UNITS[next.index]) {
      row.appendChild(h('div', { class: `ttage${known ? '' : ' unknown'}` }, portrait(def.id, 50, 0, 0.4, false, this.zoom), h('span', { text: known ? def.name : '???' })));
    }
    tt.append(
      row,
      h('div', { class: 'tttrait', text: `God power: ${known ? POWERS[next.power].name : '???'} · Citadel ${fmt(next.baseHp)} health` }),
      h('div', { class: 'ttsub', text: `Needs ${fmt(next.xpRequired)} XP and a tithe of ${fmt(next.ascendCost)} gold${this.layoutInfo?.mode === 'mobile' ? '' : ' (U)'} — or rush it with ${Math.round(RUSH_XP * 100)}% of the XP for a double tithe.` }),
    );
    this.placeTooltip(anchor);
  }

  private placeTooltip(anchor: HTMLElement): void {
    const tt = this.el.tooltip;
    tt.classList.remove('hidden');
    const br = anchor.getBoundingClientRect();
    const [ax, ay] = this.toStage(br.left, br.top);
    const [bx, by] = this.toStage(br.right, br.bottom);
    const r = { left: Math.min(ax, bx), right: Math.max(ax, bx), top: Math.min(ay, by), bottom: Math.max(ay, by) };
    const rw = r.right - r.left;
    const rh = r.bottom - r.top;
    const W = this.layoutInfo?.width ?? window.innerWidth;
    const H = this.layoutInfo?.height ?? window.innerHeight;
    // The tooltip shares the HUD zoom: its size is zoomed, and so are its left/top.
    const z = this.zoom;
    const tr = z !== 1 ? tt.getBoundingClientRect() : null;
    const tw = tr ? tr.width : tt.offsetWidth;
    const th = tr ? tr.height : tt.offsetHeight;
    let x: number;
    let y: number;
    if (this.layoutInfo?.mode === 'mobile') {
      // Beside the anchor, towards the middle of the screen (cards on the left, actions on the right).
      x = r.left + rw / 2 < W / 2 ? r.right + 8 : r.left - tw - 8;
      y = Math.max(8, Math.min(H - th - 8, r.top + rh / 2 - th / 2));
    } else {
      x = Math.max(8, Math.min(W - tw - 8, r.left + rw / 2 - tw / 2));
      y = r.top - th - 10 * z;
    }
    tt.style.left = `${x / z}px`;
    tt.style.top = `${y / z}px`;
  }

  hideTooltip(): void {
    this.el.tooltip.classList.add('hidden');
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
        if (e.team === me) this.banner(age.subtitle, `You ascend to ${age.name}`, 'gold', age.lore);
        else this.toast(`The enemy ascends to ${age.name}!`, 'bad');
      } else if (e.type === 'shrine') {
        const pip = this.el.shrines.children[e.lane] as HTMLElement | undefined;
        if (pip) {
          pip.classList.remove('flip');
          void pip.offsetWidth;
          pip.classList.add('flip');
        }
      }
      if (e.type === 'shrine' && e.owner !== -1) {
        this.toast(e.owner === me ? `${LANE_NAMES[e.lane]} shrine captured` : `${LANE_NAMES[e.lane]} shrine lost`, e.owner === me ? 'good' : 'bad');
      } else if (e.type === 'power' && e.team !== me) {
        this.toast(`Enemy casts ${POWERS[e.kind].name}!`, 'bad');
      } else if (e.type === 'ragnarok') {
        this.banner('Ragnarök', 'The wards fall silent — citadels crumble', 'red');
      } else if (e.type === 'crumble') {
        this.banner('The citadels crumble', 'Both are falling — the sturdier one stands last', 'red');
      } else if (e.type === 'surge') {
        const where = `${LANE_NAMES[e.lane].toLowerCase()} shrine`;
        if (e.phase === 'omen') this.toast(`A Ley Surge stirs beneath the ${where}…`, 'info');
        else if (e.phase === 'start') this.toast(`Ley Surge! Hold the ${where} for gold`, 'good');
        else {
          const mine = Math.round(e.gained[me]);
          const theirs = Math.round(e.gained[me === 0 ? 1 : 0]);
          if (mine > 0) this.toast(`The Ley Surge gave you ${mine} gold`, 'good');
          else if (theirs > 0) this.toast(`The enemy drew ${theirs} gold from the Ley Surge`, 'bad');
        }
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
    // Badges pulse when that side has the XP to ascend (the enemy's too: fair warning).
    const canAscend = (p: typeof me) => p.age < MAX_AGE && p.xp >= AGES[p.age + 1].xpRequired;
    toggle(E.ageL, 'ripe', canAscend(me));
    toggle(E.ageR, 'ripe', canAscend(foe));
    const foeTitle = canAscend(foe) ? `The enemy has the XP to ascend to ${AGES[foe.age + 1].name}!` : `Enemy age: ${AGES[foe.age].name}`;
    if (E.ageR.title !== foeTitle) E.ageR.title = foeTitle;
    setText(E.ageLn, AGES[me.age].name);
    // Online, the right-hand side says who it is.
    setText(E.ageRn, this.foeName ? `${this.foeName} · ${AGES[foe.age].name}` : AGES[foe.age].name);
    toggle(E.hpL.parentElement!, 'low', fracs[0] < 0.3);
    setText(E.clock, fmtTime(w.time));
    const pips = E.shrines.children;
    for (let i = 0; i < LANE_COUNT; i++) {
      const o = w.shrines[i].owner;
      const pip = pips[i] as HTMLElement;
      toggle(pip, 'mine', o === g.playerTeam);
      toggle(pip, 'theirs', o !== -1 && o !== g.playerTeam);
      toggle(pip, 'contested', w.shrines[i].contested);
      toggle(pip, 'omen', w.surge?.lane === i && w.time < w.surge.start);
      toggle(pip, 'surge', w.surge?.lane === i && w.time >= w.surge.start);
    }
    if (w.ragnarokStarted) {
      const crumbleIn = w.ragnarokAt + RAGNAROK_CRUMBLE_AFTER - w.time;
      setText(E.rag, crumbleIn <= 0 ? 'CITADELS CRUMBLE' : crumbleIn < 120 ? `Citadels crumble in ${fmtTime(crumbleIn)}` : 'RAGNARÖK');
    }
    else if (w.ragnarokAt - w.time < 120) setText(E.rag, `Ragnarök in ${fmtTime(w.ragnarokAt - w.time)}`);
    else setText(E.rag, '');
    toggle(E.rag, 'active', w.ragnarokStarted);

    // Resources
    setText(E.gold, fmt(g.displayGold()));
    const surging = w.surgeIncomeOf(g.playerTeam);
    setText(E.income, `+${(w.incomeOf(g.playerTeam) + surging).toFixed(1)}/s`);
    toggle(E.income, 'surging', surging > 0);
    if (me.age < MAX_AGE) {
      const next = AGES[me.age + 1];
      // Total XP against the next age's requirement — what the text says and the Ascend fill shows.
      const k = Math.min(1, me.xp / next.xpRequired);
      setStyle(E.xpfill, 'transform', `scaleX(${Math.max(0, k).toFixed(3)})`);
      // XP alone isn't enough: ascending also takes the gold tithe.
      const xpReady = me.xp >= next.xpRequired;
      setText(E.xptext, xpReady ? (me.gold >= next.ascendCost ? 'Ready to ascend' : 'XP ready') : `${fmt(me.xp)} / ${fmt(next.xpRequired)}`);
      toggle(E.xpfill, 'full', me.xp >= next.xpRequired);
    } else {
      setStyle(E.xpfill, 'transform', 'scaleX(1)');
      setText(E.xptext, `${fmt(me.xp)} — final age`);
    }

    // Cards (+ highlight the class that counters the selected lane's enemies)
    const advice = this.counterAdvice();
    const gold = g.displayGold();
    const rate = w.incomeOf(g.playerTeam) + surging;
    for (const c of this.cards) {
      const why = w.trainBlocker(g.playerTeam, c.def.id);
      const poor = why === 'Not enough gold';
      toggle(c.el, 'poor', poor);
      // What the gold is worth in time: a short savings bar and "in Ns" on a card you can't pay yet.
      setStyle(c.save, 'transform', `scaleX(${poor ? Math.max(0, Math.min(1, gold / c.def.cost)).toFixed(3) : '0'})`);
      const eta = poor && rate > 0 ? `${Math.max(1, Math.ceil((c.def.cost - gold) / rate))}s` : '';
      if (c.cost.dataset.eta !== eta) c.cost.dataset.eta = eta;
      const blocked = !!why && why !== 'Not enough gold';
      toggle(c.el, 'blocked', blocked);
      const label = blocked ? (why!.startsWith('Only') ? 'One at a time' : why === 'Summoning queue is full' ? 'Queue full' : '') : '';
      if (c.el.dataset.why !== label) c.el.dataset.why = label;
      toggle(c.el, 'advised', advice === c.def.cls);
    }

    // Queue
    this.updateQueue();

    // Lane tabs
    const counts = [0, 0, 0];
    for (const q of me.queue) counts[q.lane]++;
    for (let i = 0; i < LANE_COUNT; i++) {
      const tab = this.laneTabs[i];
      // Danger: enemies close to our gate in this lane.
      let danger = false;
      for (const u of w.lanes[i]) {
        if (u.alive && u.team !== g.playerTeam && (g.playerTeam === 0 ? u.x < 280 : u.x > 720)) danger = true;
      }
      toggle(tab, 'danger', danger);
      // Lane strength: our share of the creature value in this lane.
      let mine = 0;
      let theirs = 0;
      for (const u of w.lanes[i]) {
        if (!u.alive) continue;
        const v = u.def.cost * (u.hp / u.maxHp);
        if (u.team === g.playerTeam) mine += v;
        else theirs += v;
      }
      const { bar, fill } = this.laneBars[i];
      toggle(bar, 'show', mine > 0 && theirs > 0);
      if (mine > 0 && theirs > 0) setStyle(fill, 'width', `${((mine / (mine + theirs)) * 100).toFixed(0)}%`);
      toggle(tab, 'sel', g.view.selectedLane === i);
      const holding = me.hold[i];
      const hb = this.holdBtns[i];
      if (hb.classList.contains('on') !== holding) {
        toggle(hb, 'on', holding);
        hb.setAttribute('aria-pressed', String(holding));
      }
      toggle(tab, 'hover', g.view.hoverLane === i && g.view.targeting !== 'none');
      setText(this.laneBars[i].count, counts[i] ? String(counts[i]) : '');
    }

    // Blessing ranks for both sides (e.g. "Might II"), so upgrades are readable at a glance.
    this.updateBlessChips(E.blessL, me);
    this.updateBlessChips(E.blessR, foe);

    // Enemy god power: dim while recharging, glowing when ready (fair, visible information).
    const foePower = POWERS[AGES[foe.age].power];
    if (E.foePow.dataset.id !== foePower.id) {
      E.foePow.innerHTML = POWER_ICONS[foePower.id];
      E.foePow.dataset.id = foePower.id;
    }
    toggle(E.foePow, 'ready', foe.powerCooldown <= 0);
    const foePowTitle = foe.powerCooldown <= 0 ? `Enemy ${foePower.name} is ready!` : `Enemy ${foePower.name}: ready in ${Math.ceil(foe.powerCooldown)}s`;
    if (E.foePow.title !== foePowTitle) E.foePow.title = foePowTitle;

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
    // Trials can take powers or turrets away: their buttons show it.
    const godless = me.trials.includes('godless');
    toggle(E.power, 'ready', me.powerCooldown <= 0 && !godless);
    toggle(E.power, 'locked', godless);
    toggle(E.turretBtn, 'locked', me.trials.includes('nowalls'));
    toggle(E.power, 'targeting', g.view.targeting === 'power');

    // Ascend
    if (me.age < MAX_AGE) {
      const next = AGES[me.age + 1];
      // The fill tracks XP; once the XP is there it tracks the gold for the tithe (gold tint), so
      // saving up visibly fills the button.
      const xpK = Math.min(1, me.xp / next.xpRequired);
      const fillK = xpK >= 1 ? Math.min(1, Math.max(0, me.gold) / next.ascendCost) : xpK;
      setStyle(E.ascFill, 'transform', `scaleY(${fillK.toFixed(3)})`);
      const why = w.ageUpBlocker(g.playerTeam);
      // With the XP in hand, say exactly how much gold is still missing.
      const short = Math.ceil(next.ascendCost - me.gold);
      const compact = this.layoutInfo?.mode === 'mobile';
      const needLine = compact ? `need ${fmt(short)}g` : `${next.name} · need ${fmt(short)}g`;
      const costLine = compact ? `${fmt(next.ascendCost)}g` : `${next.name} · ${fmt(next.ascendCost)}g`;
      // Short of the XP but past the rush mark: the age can be rushed for a double tithe.
      const rushing = me.xp < next.xpRequired && me.xp >= next.xpRequired * RUSH_XP;
      const rushLine = compact ? `Rush ${fmt(next.ascendCost * RUSH_COST)}g` : `Rush · ${fmt(next.ascendCost * RUSH_COST)}g (×${RUSH_COST})`;
      setText(E.ascSub, rushing ? rushLine : me.xp >= next.xpRequired && short > 0 ? needLine : costLine);
      // Chime when ascending becomes possible (XP and gold both there) — not again within 20 s if
      // the gold hovers around the tithe. (A rush is possible but never chimed: it's a gamble.)
      const ready = !why && !rushing;
      if (ready && !E.ascend.classList.contains('ready') && g.world.time > 1 && g.world.time - this.readyChimeAt > 20) {
        this.readyChimeAt = g.world.time;
        this.cb.sound('ready');
      }
      toggle(E.ascend, 'ready', ready);
      toggle(E.ascend, 'rush', rushing && !why);
      toggle(E.ascend, 'xpready', me.xp >= next.xpRequired && !!why);
      // (The hover preview shows the details; screen readers get them from the label.)
      const label = `Ascend to ${next.name} (U): needs ${fmt(next.xpRequired)} XP and ${fmt(next.ascendCost)} gold. New creatures, turrets, god power and a stronger citadel.`;
      if (E.ascend.getAttribute('aria-label') !== label) E.ascend.setAttribute('aria-label', label);
    } else {
      setStyle(E.ascFill, 'transform', 'scaleY(1)');
      setText(E.ascSub, 'Final age');
      toggle(E.ascend, 'ready', false);
      toggle(E.ascend, 'xpready', false);
      toggle(E.ascend, 'maxed', true);
    }

    // Panels
    if (this.panel === 'turret' || this.panel === 'bless') {
      const pg = this.panel === 'turret' ? this.el.pgoldT : this.el.pgoldB;
      const txt = fmt(g.displayGold());
      if (pg.dataset.v !== txt) {
        pg.dataset.v = txt;
        pg.innerHTML = `${ICONS.gold}<b>${txt}</b>`;
      }
    }
    if (this.panel === 'turret') this.updateTurretPanel();
    if (this.panel === 'bless') this.updateBlessPanel();
    const canBless = BLESSING_ORDER.some((id) => w.blessingBlocker(g.playerTeam, id) === null);
    toggle(E.blessBtn, 'avail', canBless);
    // Nudge: a turret from an earlier age can be upgraded.
    const outdated = me.turrets.some((t) => t.def && t.def.age < me.age);
    toggle(E.turretBtn, 'outdated', outdated);

    // Timers (frozen while paused, so a message isn't used up behind the pause menu)
    const tdt = g.paused ? 0 : dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= tdt;
      if (this.toastTimer <= 0) {
        const next = this.toastQueue.shift();
        if (next) this.showToast(next.text, next.kind);
        else E.toast.classList.remove('show');
      }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= tdt;
      if (this.bannerTimer <= 0) E.banner.classList.remove('show');
    }
  }

  private updateBlessChips(el: HTMLElement, p: { blessings: Record<string, number> }): void {
    const sig = BLESSING_ORDER.map((id) => p.blessings[id]).join(',');
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.innerHTML = '';
    for (const id of BLESSING_ORDER) {
      const r = p.blessings[id];
      if (!r) continue;
      const icon = id === 'might' ? ICONS.swords : id === 'vitality' ? ICONS.heart : ICONS.tower;
      el.appendChild(h('span', { class: `bchip b-${id}`, title: `${BLESSINGS[id].name} ${ROMAN[r - 1]}: ${BLESSINGS[id].blurb}` }, h('i', { html: icon }), ROMAN[r - 1]));
    }
  }

  /** The class that best counters the enemies in the selected lane (value-weighted), if any. */
  private counterAdvice(): string | null {
    const g = this.game!;
    const lane = g.view.targeting === 'summon' && g.view.hoverLane >= 0 ? g.view.hoverLane : g.view.selectedLane;
    if (lane < 0 || !this.advice) return null;
    const weight: Record<string, number> = { guardian: 0, hunter: 0, mystic: 0, legend: 0 };
    let total = 0;
    for (const u of g.world.lanes[lane]) {
      if (!u.alive || u.team === g.playerTeam) continue;
      // Creatures nearer our gate matter more.
      const near = g.playerTeam === 0 ? 1 - u.x / 1000 : u.x / 1000;
      const v = u.def.cost * (0.5 + near);
      weight[u.def.cls] += v;
      total += v;
    }
    if (total <= 0) return null;
    let dominant = 'guardian';
    for (const c of ['hunter', 'mystic']) if (weight[c] > weight[dominant]) dominant = c;
    if (weight[dominant] < total * 0.4) return null;
    return counterOf(dominant as UnitDef['cls']);
  }

  private rebuildCards(age: number): void {
    const E = this.el;
    this.cardAge = age;
    // The HUD takes on the age's accent, like the battlefield, the music and the citadel.
    for (let i = 0; i <= MAX_AGE; i++) this.root.classList.toggle(`age-${i}`, i === age);
    E.cards.innerHTML = '';
    this.cards = [];
    const mobile = this.layoutInfo?.mode === 'mobile';
    const size = mobile ? 52 : 70;
    AGE_UNITS[age].forEach((def, i) => {
      const cost = h('div', { class: 'cost' }, h('i', { html: ICONS.gold }), String(def.cost));
      const save = h('div', { class: 'save' });
      const el = h(
        'button',
        { class: `card cls-${def.cls}`, style: `--cls:${CLASS_COLOR[def.cls]}`, 'aria-label': `Summon ${def.name} (${CLASS_NAME[def.cls]}), ${def.cost} gold` },
        h('div', { class: 'portrait' }, portrait(def.id, size, 0, 0.4, false, this.zoom)),
        h('div', { class: 'clsico', html: CLASS_ICON[def.cls] }),
        h('div', { class: 'name', text: def.name }),
        cost,
        h('div', { class: 'key', text: String(i + 1) }),
        h('div', { class: 'advice', text: 'Counter!' }),
        save,
      );
      el.style.animationDelay = `${i * 60}ms`;
      el.addEventListener('pointerdown', (e) => this.startDrag(e as PointerEvent, def.id, false));
      el.addEventListener('click', (e) => {
        if (e.detail === 0) this.tryTrain(def.id); // Enter on a keyboard-focused card
      });
      el.addEventListener('keydown', noRepeat);
      el.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType === 'mouse') this.showTooltip(def, el);
      });
      el.addEventListener('pointerleave', () => this.hideTooltip());
      // Keyboard users tabbing through the cards get the same details.
      el.addEventListener('focus', () => {
        if (el.matches(':focus-visible')) this.showTooltip(def, el);
      });
      el.addEventListener('blur', () => this.hideTooltip());
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showTooltip(def, el);
      });
      E.cards.appendChild(el);
      this.cards.push({ def, el, cost, save });
    });
    toggle(E.cards, 'four', this.cards.length > 3);
  }

  private updateQueue(): void {
    const g = this.game!;
    const me = g.world.players[g.playerTeam];
    const q = me.queue;
    const chips = this.queueChips;
    // Online, orders still on their way show as faded chips in the next free slots.
    const pending = g.pendingTrains().slice(0, Math.max(0, QUEUE_MAX - q.length));
    const sig = q.map((i) => `${i.unitId}:${i.lane}`).join(',') + '|' + pending.map((i) => i.unitId).join(',');
    if (this.el.queue.dataset.sig !== sig) {
      this.el.queue.dataset.sig = sig;
      // Reconcile instead of rebuilding, so surviving chips keep their place (no re-pop).
      const next: QueueChip[] = [];
      let k = 0;
      for (const item of q) {
        while (k < chips.length && (chips[k].unitId !== item.unitId || chips[k].lane !== item.lane)) chips[k++].el.remove();
        if (k < chips.length) next.push(chips[k++]);
        else next.push(this.makeChip(item.unitId, item.lane));
      }
      while (k < chips.length) chips[k++].el.remove();
      chips.length = 0;
      chips.push(...next);
      for (const c of chips) this.el.queue.appendChild(c.el); // keeps order; existing nodes move
      for (const slot of [...this.el.queue.querySelectorAll('.qslot')]) slot.remove();
      for (let n = q.length; n < QUEUE_MAX; n++) {
        const p = pending[n - q.length];
        this.el.queue.appendChild(p ? h('div', { class: 'qslot pending', title: `${UNITS[p.unitId].name}: on its way…` }, portrait(p.unitId, 30, 0, 0.4, false, this.zoom)) : h('div', { class: 'qslot' }));
      }
    }
    const training = g.world.trainingIndex(g.playerTeam);
    for (let n = 0; n < chips.length; n++) {
      const ready = !!q[n]?.ready;
      const prog = ready ? 1 : n === training ? Math.min(1, me.trainProgress / UNITS[q[n].unitId].trainTime) : 0;
      setStyle(chips[n].prog, 'width', `${(prog * 100).toFixed(1)}%`);
      // Gold border = trained, waiting for room at a jammed gate.
      toggle(chips[n].el, 'waiting', ready);
      const cancel = this.layoutInfo?.mode === 'mobile' ? '(tap to cancel)' : '(click to cancel)';
      const title = ready ? `${UNITS[q[n].unitId].name}: ready — waiting for room at the ${LANE_NAMES[q[n].lane].toLowerCase()} gate ${cancel}` : `${UNITS[q[n].unitId].name} → ${LANE_NAMES[q[n].lane]} lane ${cancel}`;
      if (chips[n].el.title !== title) chips[n].el.title = title;
    }
  }

  private makeChip(unitId: string, lane: number): QueueChip {
    const g = this.game!;
    const prog = h('div', { class: 'qprog' });
    const el = h(
      'button',
      {
        class: 'qchip',
        title: `${UNITS[unitId].name} → ${LANE_NAMES[lane]} lane (click to cancel)`,
        'aria-label': `Cancel ${UNITS[unitId].name} for the ${LANE_NAMES[lane].toLowerCase()} lane (refund)`,
      },
      portrait(unitId, 30, 0, 0.4, false, this.zoom),
      h('span', { class: 'ql', text: LANE_NAMES[lane][0] }),
      prog,
    );
    const chip: QueueChip = { unitId, lane, el, prog };
    onTap(el, () => {
      const index = this.queueChips.indexOf(chip);
      if (index < 0) return;
      const r = g.command({ type: 'cancel', team: g.playerTeam, index, unitId });
      if (r.ok) this.cb.sound('cancel');
    });
    return chip;
  }

  private updateTurretPanel(): void {
    const g = this.game!;
    const w = g.world;
    const me = w.players[g.playerTeam];
    const [bolt, blast] = AGE_TURRETS[me.age];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const row = this.turretRows[lane];
      const cur = me.turrets[lane].def;
      const bastion = w.defenseMult(g.playerTeam);
      const sig = `${me.age}:${cur?.id ?? '-'}:${bastion}`;
      if (row.dataset.sig !== sig) {
        row.dataset.sig = sig;
        row.innerHTML = '';
        const mk = (id: string) => {
          const def = TURRETS[id];
          // Includes the Bastion blessing, like card tooltips include Might/Vitality.
          const dps = (def.damage / def.cooldown) * bastion;
          const stats = `${dps < 10 ? dps.toFixed(1) : Math.round(dps)} dmg/s${bastion > 1 ? ` (+${Math.round((bastion - 1) * 100)}%)` : ''}${def.splash ? ' · splash' : ''}${def.slow ? ' · slows' : ''} · range ${def.range}`;
          const b = h(
            'button',
            { class: `tbuy ${def.kind}`, title: `${def.blurb} ${stats}.` },
            h('span', { class: 'tn', text: def.name }),
            h('span', { class: 'tc' }, h('i', { html: ICONS.gold }), String(def.cost)),
            h('span', { class: 'ts', text: stats }),
          );
          b.dataset.id = id;
          onTap(b, () => this.tryTurret(lane, id));
          return b;
        };
        const status = cur ? h('div', { class: 'tcur' }, h('b', { text: cur.name }), cur.age < me.age ? h('span', { class: 'old', text: 'outdated' }) : null) : h('div', { class: 'tcur empty', text: 'Empty — gate ward only' });
        const buttons = h('div', { class: 'tbtns' });
        this.turretBuys[lane] = [];
        for (const id of [bolt.id, blast.id]) {
          if (cur && cur.id === id) continue;
          const b = mk(id);
          this.turretBuys[lane].push(b);
          buttons.appendChild(b);
        }
        if (cur) {
          const sell = h('button', { class: 'tsell', title: 'Sell for half its cost' }, h('span', { class: 'tn', text: 'Sell' }), h('span', { class: 'tc', text: `+${Math.floor(cur.cost * SELL_REFUND)}` }));
          onTap(sell, () => this.trySell(lane));
          buttons.appendChild(sell);
        }
        row.append(h('div', { class: 'tlane', text: LANE_NAMES[lane] }), status, buttons);
      }
      for (const b of this.turretBuys[lane]) {
        toggle(b, 'poor', w.turretBlocker(g.playerTeam, lane, b.dataset.id!) === 'Not enough gold');
      }
    }
  }

  private updateBlessPanel(): void {
    const g = this.game!;
    const w = g.world;
    const me = w.players[g.playerTeam];
    const foe = w.players[g.playerTeam === 0 ? 1 : 0];
    const foeList = BLESSING_ORDER.filter((id) => foe.blessings[id] > 0).map((id) => `${BLESSINGS[id].name} ${ROMAN[foe.blessings[id] - 1]}`);
    setText(this.el.foeBless, foeList.length ? `Enemy blessings: ${foeList.join(', ')}` : 'The enemy has no blessings yet.');
    for (const id of BLESSING_ORDER) {
      const ref = this.blessRefs[id];
      const rank = me.blessings[id];
      ref.pips.forEach((p, i) => toggle(p, 'on', i < rank));
      const cost = rank >= BLESSING_MAX_RANK ? -1 : blessingCost(rank, me.age);
      if (cost !== ref.cost) {
        ref.cost = cost;
        ref.buy.disabled = cost < 0;
        if (cost < 0) ref.buy.textContent = 'Max';
        else ref.buy.innerHTML = `${ICONS.gold}<span>${fmt(cost)}</span>`;
        ref.buy.setAttribute('aria-label', cost < 0 ? `${BLESSINGS[id].name}: highest rank` : `Buy ${BLESSINGS[id].name} rank ${ROMAN[rank]} for ${fmt(cost)} gold`);
      }
      toggle(ref.buy, 'poor', cost >= 0 && me.gold < cost);
      setText(ref.gain, cost < 0 ? 'Highest rank reached.' : this.blessingGain(id));
    }
  }

  /** What the next rank of a blessing is worth right now, in concrete numbers. */
  private blessingGain(id: BlessingId): string {
    const g = this.game!;
    const w = g.world;
    const team = g.playerTeam;
    const p = w.players[team];
    const per = BLESSINGS[id].perRank;
    if (id === 'might') {
      let dps = 0;
      let n = 0;
      for (const lane of w.lanes) {
        for (const u of lane) {
          if (!u.alive || u.team !== team) continue;
          dps += u.def.damage / u.def.cooldown;
          n++;
        }
      }
      return n ? `Next rank: +${fmt(dps * per)} damage per second for the ${n} creature${n > 1 ? 's' : ''} on the field now — and all to come.` : 'Next rank: +10% damage for every creature you summon from now on.';
    }
    if (id === 'vitality') {
      const guardian = AGE_UNITS[p.age][0];
      return `Next rank: +${fmt(guardian.hp * per)} health for each new ${guardian.name}, and as much in proportion for every other new creature.`;
    }
    return `Next rank: +${fmt(AGES[p.age].baseHp * per)} citadel health at once (and after every ascension), +7.5% ward and turret damage.`;
  }

  get teamOf(): Team {
    return this.game?.playerTeam ?? 0;
  }
}

const CLASS_NOTE: Record<string, string> = {
  guardian: 'Sweeping blows also strike foes packed around the target.',
  hunter: 'Hunts in packs: Hunters crowd in to strike together.',
  mystic: 'Ranged: stands back and lets melee allies through.',
  legend: 'Flies over the fray.',
};

function chip(cls: string): string {
  return `<span class="clschip" style="color:${CLASS_COLOR[cls]}">${CLASS_ICON[cls]}${CLASS_NAME[cls]}</span>`;
}
