import { AI_PROFILES, DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import { AGES, AGE_UNITS, POWERS } from '../sim/data.ts';
import type { World } from '../sim/world.ts';
import type { Team } from '../sim/types.ts';
import { h, fmt, fmtTime, onTap } from './dom.ts';
import { CLASS_COLOR, CLASS_ICON, ICONS, POWER_ICONS } from './icons.ts';
import { portrait } from './portraits.ts';
import type { Settings } from './settings.ts';
import { PAR_TIME, battleStars } from './settings.ts';
import type { HistorySample } from '../game.ts';
import { MpScreens } from './mpmenus.ts';
import { Bestiary } from './bestiary.ts';
import { FEATS } from './feats.ts';
import { exportProgress, importProgress } from './progress.ts';
import type { Feat } from './feats.ts';
import type { MpMenuCallbacks } from './mpmenus.ts';
import type { EndReason } from '../net/protocol.ts';

/** Results of a battle against another player (instead of an AI difficulty). */
export interface OnlineResult {
  foe: string;
  reason: EndReason;
  /** Wins in this room so far: [mine, theirs]. */
  score: [number, number] | null;
}

export interface MenuCallbacks {
  play(difficulty: Difficulty): void;
  /** The goal-free sandbox. */
  sandbox(): void;
  continueSaved(): void;
  resume(): void;
  restart(): void;
  quit(): void;
  settingsChanged(s: Settings): void;
  sound(kind: string): void;
  multiplayer(): void;
  mp: MpMenuCallbacks;
  /** Results of an online battle: ask for a rematch / leave the room / back to the room. */
  rematch(): void;
  leaveRoom(): void;
  toRoom(): void;
}

type Screen = 'none' | 'title' | 'difficulty' | 'howto' | 'settings' | 'bestiary' | 'feats' | 'pause' | 'over' | 'mp' | 'room';

/** Full-screen menus: title, difficulty, how-to-play, settings, pause and results. */
export class Menus {
  readonly root: HTMLDivElement;
  private cb: MenuCallbacks;
  private settings: Settings;
  private screen: Screen = 'none';
  private back: Screen = 'title';
  /** Where the difficulty screen returns to: the title, or the results it was opened from. */
  private diffBack: Screen = 'title';
  /** An autosaved battle exists (a new one from the title abandons it — the note says so). */
  private hasSave = false;
  private saveNote: HTMLElement | null = null;
  private settingsOpened: (() => void) | null = null;
  private screens: Partial<Record<Screen, HTMLElement>> = {};
  private howtoPage = 0;
  private howtoPages: HTMLElement[] = [];
  private howtoDots: HTMLElement | null = null;
  private selected: Difficulty;
  private syncers: (() => void)[] = [];
  private continueBtn: HTMLButtonElement | null = null;
  private laurels: HTMLElement | null = null;
  private pauseSummary: HTMLElement | null = null;
  private skipBtn: HTMLButtonElement | null = null;
  /** Set when the how-to is shown before a player's first battle. */
  private afterHowto: (() => void) | null = null;
  private playBtn: HTMLButtonElement | null = null;
  /** Multiplayer lobby and room screens. */
  readonly mp: MpScreens;
  private restartBtn: HTMLButtonElement | null = null;
  private pauseNote: HTMLElement | null = null;
  private pauseTitle: HTMLElement | null = null;
  private rematchBtn: HTMLButtonElement | null = null;
  private rematchNote: HTMLElement | null = null;
  private bestiary!: Bestiary;
  private pauseGoals: HTMLElement | null = null;
  /** Feats earned in the battle whose results are shown next. */
  featsEarned: Feat[] = [];
  private featList: HTMLElement | null = null;
  private featChip: HTMLButtonElement | null = null;

  constructor(parent: HTMLElement, settings: Settings, cb: MenuCallbacks) {
    this.cb = cb;
    this.settings = settings;
    this.selected = settings.difficulty;
    this.root = h('div', { class: 'menus' });
    parent.appendChild(this.root);
    this.screens.title = this.buildTitle();
    this.screens.difficulty = this.buildDifficulty();
    this.screens.howto = this.buildHowto();
    this.screens.settings = this.buildSettings();
    this.bestiary = new Bestiary(this.button('Back', 'primary', () => this.goBack()), (k) => this.cb.sound(k));
    this.screens.bestiary = this.bestiary.el;
    this.screens.feats = this.buildFeats();
    this.screens.pause = this.buildPause();
    this.screens.over = h('div', { class: 'screen over' });
    this.mp = new MpScreens((label, cls, onClick, icon) => this.button(label, cls, onClick, icon), cb.mp);
    this.screens.mp = this.mp.lobby;
    this.screens.room = this.mp.room;
    const labels: Partial<Record<Screen, string>> = {
      title: 'Main menu',
      difficulty: 'Choose your foe',
      howto: 'How to play',
      settings: 'Settings',
      bestiary: 'Bestiary',
      feats: 'Feats',
      pause: 'Paused',
      over: 'Battle results',
      mp: 'Multiplayer',
      room: 'Battle room',
    };
    for (const [k, el] of Object.entries(this.screens)) {
      el!.setAttribute('role', k === 'title' ? 'region' : 'dialog');
      el!.setAttribute('aria-label', labels[k as Screen] ?? k);
      this.root.appendChild(el!);
    }
    this.show('none');
  }

  get current(): Screen {
    return this.screen;
  }

  /** One-line battle summary shown on the pause screen. `foe`: the other player's name online. */
  setPauseSummary(world: World, me: Team, difficulty: Difficulty, online?: { foe: string; title: string }, sandbox = false): void {
    if (!this.pauseSummary) return;
    const P = world.players[me];
    const E = world.players[me === 0 ? 1 : 0];
    const foe = online ? online.foe : AI_PROFILES[difficulty].name;
    this.pauseSummary.textContent = sandbox
      ? `Sandbox · ${fmtTime(world.time)} · ${AGES[P.age].name}`
      : `vs ${foe} · ${fmtTime(world.time)} · ${AGES[P.age].name} vs ${AGES[E.age].name} · ${P.stats.kills} foes slain`;
    // Against the AI: the battle's star goals, while they can still be won.
    if (this.pauseGoals) this.pauseGoals.textContent = online || sandbox ? '' : starGoals(world, me, difficulty);
    // Online, either player may pause and either may resume; the battle can't restart.
    this.restartBtn?.classList.toggle('hidden', !!online);
    if (this.pauseTitle) this.pauseTitle.textContent = online ? online.title : 'Paused';
    if (this.pauseNote) this.pauseNote.textContent = online ? 'Leaving the battle counts as a defeat. Either player can resume.' : sandbox ? 'The sandbox keeps no score — leave or restart any time.' : 'Leaving or restarting after the first minute counts as a defeat.';
  }

  /** One laurel per difficulty the player has beaten (shown on the title screen). */
  refreshLaurels(): void {
    const el = this.laurels;
    if (!el) return;
    el.innerHTML = '';
    // Feats earned so far: a chip that opens the list.
    if (this.featChip) {
      const n = FEATS.filter((f) => this.settings.feats.includes(f.id)).length;
      this.featChip.querySelector('span')!.textContent = `Feats ${n}/${FEATS.length}`;
      el.appendChild(this.featChip);
    }
    for (const d of DIFFICULTIES) {
      const r = this.settings.records[d];
      if (!r || !r.wins) continue;
      el.appendChild(h('span', { class: `laurel l-${d}`, title: `${AI_PROFILES[d].name} defeated ${r.wins}×${r.best ? ` · fastest ${fmtTime(r.best)}` : ''}` }, h('i', { html: ICONS.crown }), AI_PROFILES[d].name));
    }
  }

  /** Shows "Continue battle" on the title screen when an autosave exists. */
  setContinue(label: string | null): void {
    this.hasSave = !!label;
    if (!this.continueBtn || !this.playBtn) return;
    this.continueBtn.classList.toggle('hidden', !label);
    this.continueBtn.querySelector('span')!.textContent = label ? `Continue \u2014 ${label}` : 'Continue battle';
    // Only one gold button at a time.
    this.playBtn.classList.toggle('primary', !label);
    this.playBtn.querySelector('span')!.textContent = label ? 'New battle' : 'Play';
  }

  /** Click the visible primary button of the current screen (keyboard Enter). */
  pressPrimary(): boolean {
    const el = this.screens[this.screen]?.querySelector<HTMLButtonElement>('.mbtn.primary:not(.hidden)');
    if (!el) return false;
    el.click();
    return true;
  }

  /** Return from how-to / settings / difficulty to whichever screen opened them. */
  goBack(): void {
    if (this.screen === 'howto' || this.screen === 'settings' || this.screen === 'bestiary' || this.screen === 'feats') this.show(this.back);
    else if (this.screen === 'difficulty') this.show(this.diffBack);
  }

  show(screen: Screen): void {
    // The first-run "how-to, then battle" hand-off only lasts while the how-to is showing
    // (Esc / Back out of it must not leave a pending battle start behind).
    if (this.screen === 'howto' && screen !== 'howto') this.afterHowto = null;
    if (screen === 'howto' || screen === 'settings' || screen === 'bestiary' || screen === 'feats') {
      if (this.screen !== 'howto' && this.screen !== 'settings' && this.screen !== 'bestiary' && this.screen !== 'feats') this.back = this.screen === 'none' ? 'title' : this.screen;
    }
    if (screen === 'difficulty' && this.screen !== 'difficulty' && this.screen !== 'howto' && this.screen !== 'settings') {
      this.diffBack = this.screen === 'over' ? 'over' : 'title';
    }
    if (screen === 'settings' && this.screen !== 'settings') this.settingsOpened?.();
    this.screen = screen;
    for (const [k, el] of Object.entries(this.screens)) el!.classList.toggle('active', k === screen);
    this.root.classList.toggle('open', screen !== 'none');
    this.root.classList.toggle('dim', screen !== 'none' && screen !== 'title');
    if (screen === 'howto') {
      this.setHowtoPage(0);
      this.skipBtn?.classList.toggle('hidden', !this.afterHowto);
    }
    if (screen === 'difficulty') {
      this.refreshDifficulty();
      this.saveNote?.classList.toggle('hidden', !(this.hasSave && this.diffBack === 'title'));
    }
    if (screen === 'title') this.refreshLaurels();
    if (screen === 'bestiary') this.bestiary.open(this.settings.ageSeen);
    if (screen === 'feats') this.refreshFeats();
    if (screen === 'settings') for (const f of this.syncers) f();
  }

  private button(label: string, cls: string, onClick: () => void, icon?: string): HTMLButtonElement {
    const b = h('button', { class: `mbtn ${cls}` }, icon ? h('i', { html: icon }) : null, h('span', { text: label }));
    onTap(b, () => {
      this.cb.sound('click');
      onClick();
    });
    return b;
  }

  // -------------------------------------------------------------------------
  // Title
  // -------------------------------------------------------------------------

  private buildTitle(): HTMLElement {
    const logo = h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-top', text: 'Ages of Legend' }),
      h('div', { class: 'logo-main', text: 'MYTHWAR' }),
      h('div', { class: 'logo-sub', text: 'Three lanes. Five mythic ages. One citadel left standing.' }),
    );
    this.continueBtn = this.button('Continue battle', 'primary big continue hidden', () => this.cb.continueSaved(), ICONS.play);
    this.playBtn = this.button('Play', 'primary big', () => this.show('difficulty'), ICONS.swords);
    const buttons = h(
      'div',
      { class: 'mbuttons' },
      this.continueBtn,
      this.playBtn,
      this.button('Multiplayer', 'mpbtn', () => this.cb.multiplayer(), ICONS.versus),
      this.button('How to Play', '', () => this.show('howto'), ICONS.info),
      this.button('Bestiary', '', () => this.show('bestiary'), ICONS.book),
      this.button('Settings', '', () => this.show('settings'), ICONS.sound),
    );
    const creatures = h('div', { class: 'title-creatures' });
    const showcase = ['treant', 'centaur', 'valkyrie', 'kitsune', 'phoenix'];
    showcase.forEach((id, i) => {
      const c = portrait(id, 84, 0, 0.4 + i);
      c.style.animationDelay = `${i * 0.25}s`;
      creatures.appendChild(c);
    });
    const foot = h('div', { class: 'title-foot', text: 'A tribute to Age of War — reimagined with gods and monsters.' });
    this.laurels = h('div', { class: 'laurels' });
    this.featChip = h('button', { class: 'laurel featchip', title: 'Your feats' }, h('i', { html: ICONS.xp }), h('span')) as HTMLButtonElement;
    onTap(this.featChip, () => {
      this.cb.sound('click');
      this.show('feats');
    });
    return h('div', { class: 'screen title' }, logo, creatures, this.laurels, buttons, foot);
  }

  // -------------------------------------------------------------------------
  // Difficulty
  // -------------------------------------------------------------------------

  private diffCards: Record<string, HTMLElement> = {};
  private recordEls: Record<string, HTMLElement> = {};

  private buildDifficulty(): HTMLElement {
    const grid = h('div', { class: 'diffs' });
    DIFFICULTIES.forEach((d, i) => {
      const p = AI_PROFILES[d];
      const skulls = h('div', { class: 'skulls' });
      for (let k = 0; k < 4; k++) skulls.appendChild(h('i', { class: k <= i ? 'on' : '', html: ICONS.skull }));
      const rec = h('div', { class: 'record' });
      this.recordEls[d] = rec;
      const reaction = p.think >= 2 ? 'Slow' : p.think >= 1.2 ? 'Steady' : p.think >= 0.5 ? 'Quick' : 'Instant';
      const counters = p.counterSkill < 0.3 ? 'Rarely' : p.counterSkill < 0.7 ? 'Sometimes' : p.counterSkill < 0.95 ? 'Usually' : 'Always';
      const chips = h(
        'div',
        { class: 'dchips' },
        h('span', { title: 'How quickly it reacts' }, h('b', { text: 'Reacts' }), reaction),
        h('span', { title: 'How often it summons the right counter' }, h('b', { text: 'Counters' }), counters),
        h('span', { title: 'Its gold over time and from shrines, compared with yours (gold from kills is the same)' }, h('b', { text: 'Income' }), `${Math.round(p.incomeMult * 100)}%`),
      );
      const card = h('button', { class: `diff d-${d}` }, h('div', { class: 'ribbon' }), h('div', { class: 'dname', text: p.name }), skulls, h('div', { class: 'dblurb', text: p.blurb }), chips, rec);
      onTap(card, (e) => {
        // Enter / Space on the card already chosen (a keyboard click: onTap only passes clicks
        // without a pointer) begins the battle, as a double-click does.
        if (e.type === 'click' && this.selected === d) {
          this.begin(d);
          return;
        }
        this.selected = d;
        this.cb.sound('select');
        this.refreshDifficulty();
      });
      card.addEventListener('dblclick', () => this.begin(d));
      this.diffCards[d] = card;
      grid.appendChild(card);
    });
    const begin = this.button('Begin Battle', 'primary big', () => this.begin(this.selected), ICONS.swords);
    const back = this.button('Back', 'ghost', () => this.goBack());
    // The toy: no foe, endless gold — play with the creatures and try match-ups.
    const sandbox = this.button('Sandbox', 'ghost', () => this.cb.sandbox());
    sandbox.title = 'No foe, endless gold: summon for either side and watch any match-up';
    this.saveNote = h('div', { class: 'dnote hidden', text: 'A new battle replaces your saved one (after its first minute, that counts as a defeat).' });
    return h('div', { class: 'screen difficulty' }, h('h2', { text: 'Choose your foe' }), grid, this.saveNote, h('div', { class: 'mrow' }, back, sandbox, begin));
  }

  /** Start a battle — first-timers see the five-page how-to first (skippable). */
  private begin(d: Difficulty): void {
    if (!this.settings.tutorialSeen) {
      this.settings.tutorialSeen = true;
      this.cb.settingsChanged(this.settings);
      this.afterHowto = () => this.cb.play(d);
      this.show('howto');
      return;
    }
    this.cb.play(d);
  }

  private refreshDifficulty(): void {
    const rec = this.settings.records;
    const next = recommendedDifficulty(rec);
    const fresh = DIFFICULTIES.every((d) => !rec[d]?.wins);
    for (const d of DIFFICULTIES) {
      this.diffCards[d].classList.toggle('sel', d === this.selected);
      // Which foe is for me? The first one not beaten yet.
      const ribbon = d === next ? (fresh ? 'Start here' : 'Next challenge') : '';
      const rb = this.diffCards[d].querySelector('.ribbon')!;
      if (rb.textContent !== ribbon) rb.textContent = ribbon;
      const r = rec[d];
      this.recordEls[d].textContent = r && (r.wins || r.losses) ? `${r.wins}W · ${r.losses}L${r.best ? ` · best ${fmtTime(r.best)}` : ''}${r.stars ? ` · ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}` : ''}` : '';
    }
  }

  // -------------------------------------------------------------------------
  // How to play
  // -------------------------------------------------------------------------

  private buildHowto(): HTMLElement {
    const pages: { title: string; body: (HTMLElement | string)[] }[] = [
      {
        title: 'Topple their citadel',
        body: [
          versusArt(),
          p('Two citadels face each other across <b>three lanes</b>. Creatures march down their lane and fight anything in their way. Reach the enemy gate and they batter the citadel.'),
          p('Bring the enemy citadel’s health to zero to win. Protect your own — it is shared by all three lanes.'),
        ],
      },
      {
        title: 'Summon creatures',
        body: [
          lanesArt(),
          p('<b>Pick a lane</b> by clicking or tapping it (or the ▶ marker at your gate), then <b>tap a creature card</b> to summon it there.'),
          p('Press and hold a creature (or hover it) to see what it is. You can also <b>drag a card onto any lane</b>. Summons wait in a short queue at your gates. Keys: <b>1–4</b> summon, <b>W/S</b> or <b>↑/↓</b> change lane.'),
        ],
      },
      {
        title: 'Counter your foe',
        body: [
          triangleArt(),
          p('Every creature belongs to a class. <b style="color:#f2b84b">Guardians</b> crush <b style="color:#7ed957">Hunters</b>, Hunters tear through <b style="color:#b48cff">Mystics</b>, and Mystics melt Guardians.'),
          p('Hunters strike as a <b>pack</b>, Guardians’ <b>sweeping</b> blows break packs, and massed Mystics melt a Guardian line. A counter deals <b>+50% damage</b> and takes 25% less in return; the card marked <b>Counter!</b> answers your selected lane (Settings can switch that advice off once you read the lanes yourself).'),
        ],
      },
      {
        title: 'Gold, shrines and ages',
        body: [
          art(['treant', 'minotaur', 'jotunn', 'oni', 'titan'], 0),
          p('Gold flows in over time and from every kill. Stand at a lane’s <b>Ley Shrine</b> with no foes nearby to capture it: it pays extra income until the enemy takes it back. Now and then a <b>Ley Surge</b> flares under one shrine: hold it while it lasts for a flood of gold.'),
          p('<b>XP</b> comes from kills, blows against the enemy citadel and the passing of time. With enough XP and a gold tithe you can <b>Ascend</b> through five mythic ages — Fae Wilds, Olympus, Asgard, the Jade Empire and the Celestial realm — each with stronger creatures and a sturdier citadel.'),
        ],
      },
      {
        title: 'Powers, turrets & blessings',
        body: [
          powersArt(),
          p('Each age grants a <b>god power</b>. Press it, then choose a lane to unleash it (on a keyboard, <b>Space</b> casts it on the selected lane). <b>Turrets</b> guard one lane each from your gates; <b>Blessings</b> permanently strengthen your army.'),
          p('At 18:00 — or 3 minutes after both sides reach the Celestial age — <b>Ragnarök</b> comes: the citadels’ wards fall silent and every blow against them grows deadlier, minute by minute.'),
        ],
      },
      {
        title: 'Tactics',
        body: [
          art(['jotunn', 'fenrir', 'valkyrie'], 0),
          p('<b>Hold the line:</b> the shield under a lane’s ▶ marker (or <b>G</b>) stops that lane’s creatures just past its shrine. Gather a wave outside the enemy gate’s reach — the dashed line in front of it — then let it loose together.'),
          p('<b>Ley sight:</b> while you hold a lane’s shrine you see the enemy’s next summons for that lane above their gate. <b>Brittle frost:</b> frozen foes take 50% more damage — strike while they are frozen.'),
        ],
      },
    ];
    this.howtoPages = pages.map((pg, i) => h('div', { class: `hpage${i === 0 ? ' active' : ''}` }, h('h3', { text: pg.title }), ...pg.body));
    const dots = h('div', { class: 'hdots' });
    pages.forEach((pg, i) => {
      const d = h('button', { class: 'hdot', 'aria-label': `Page ${i + 1}: ${pg.title}` });
      onTap(d, () => this.setHowtoPage(i));
      dots.appendChild(d);
    });
    this.howtoDots = dots;
    const finish = () => {
      // First battle: the tutorial leads straight into the fight.
      const then = this.afterHowto;
      this.afterHowto = null;
      if (then) then();
      else this.show(this.back);
    };
    const prev = this.button('Back', 'ghost', () => {
      if (this.howtoPage > 0) this.setHowtoPage(this.howtoPage - 1);
      else {
        this.afterHowto = null;
        this.show(this.back);
      }
    });
    const next = this.button('Next', 'primary', () => (this.howtoPage === pages.length - 1 ? finish() : this.setHowtoPage(this.howtoPage + 1)));
    next.classList.add('hnext');
    this.skipBtn = this.button('Skip', 'ghost hskip hidden', finish);
    return h('div', { class: 'screen howto' }, h('div', { class: 'hbook' }, ...this.howtoPages), dots, h('div', { class: 'mrow' }, prev, this.skipBtn, next));
  }

  private setHowtoPage(i: number): void {
    this.howtoPage = i;
    this.howtoPages.forEach((p, k) => {
      p.classList.toggle('active', k === i);
      // Hidden pages are only faded out: keep screen readers and Tab on the visible one.
      p.inert = k !== i;
    });
    this.howtoDots?.querySelectorAll('.hdot').forEach((d, k) => d.classList.toggle('on', k === i));
    const next = this.screens.howto?.querySelector('.hnext span');
    if (next) next.textContent = i === this.howtoPages.length - 1 ? (this.afterHowto ? 'To battle!' : 'Got it') : 'Next';
  }

  /** Beside the tip: "Face the Master →" after a win, "Face the Adept →" after a losing run. */
  private flowButton(won: boolean, difficulty: Difficulty): HTMLButtonElement | null {
    const next = flowSuggestion(won, difficulty, this.settings.records[difficulty]?.streak ?? 0);
    if (!next) return null;
    const b = this.button(`Face the ${AI_PROFILES[next].name} →`, 'vnext', () => this.cb.play(next));
    b.title = won ? 'Ready for a harder foe' : 'Three defeats in a row: sharpen your skills against an easier foe';
    return b;
  }

  // -------------------------------------------------------------------------
  // Feats
  // -------------------------------------------------------------------------

  private buildFeats(): HTMLElement {
    this.featList = h('div', { class: 'featlist' });
    return h('div', { class: 'screen feats' }, h('h2', { text: 'Feats' }), this.featList, h('div', { class: 'mrow' }, this.button('Back', 'primary', () => this.goBack())));
  }

  private refreshFeats(): void {
    const list = this.featList!;
    list.innerHTML = '';
    for (const f of FEATS) {
      const got = this.settings.feats.includes(f.id);
      list.appendChild(h('div', { class: `feat${got ? ' got' : ''}` }, h('i', { html: ICONS.xp }), h('div', null, h('b', { text: f.name }), h('span', { text: f.desc }))));
    }
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  private buildSettings(): HTMLElement {
    const s = this.settings;
    const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100) }) as HTMLInputElement;
      const val = h('span', { class: 'sval', text: `${Math.round(s[key] * 100)}%` });
      input.addEventListener('input', () => {
        s[key] = Number(input.value) / 100;
        if (key === 'master') s.muted = false;
        val.textContent = `${input.value}%`;
        this.cb.settingsChanged(s);
      });
      // Preview the new level when the slider is released.
      if (key !== 'music') input.addEventListener('change', () => this.cb.sound('summon'));
      return h('label', { class: 'srow' }, h('span', { text: label }), input, val);
    };
    const toggleRow = (label: string, key: 'shake' | 'hints' | 'advice' | 'lowQuality' | 'fullscreen' | 'emotes') => {
      const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
      input.checked = !!s[key];
      this.syncers.push(() => (input.checked = !!s[key]));
      input.addEventListener('change', () => {
        s[key] = input.checked;
        this.cb.settingsChanged(s);
      });
      return h('label', { class: 'srow check' }, h('span', { text: label }), input, h('i', { class: 'sw' }));
    };
    const back = this.button('Done', 'primary', () => this.show(this.back));
    const resetRecords = this.button('Reset records', 'ghost', () => {
      if (resetRecords.dataset.armed !== '1') {
        // Two-step to avoid accidents.
        resetRecords.dataset.armed = '1';
        resetRecords.querySelector('span')!.textContent = 'Tap again to erase W/L';
        return;
      }
      s.records = {};
      s.online = {};
      this.cb.settingsChanged(s);
      resetRecords.dataset.armed = '';
      resetRecords.querySelector('span')!.textContent = 'Records cleared';
      this.refreshLaurels();
    });
    const resetTips = this.button('Show tips again', 'ghost', () => {
      s.hintsSeen = [];
      s.hints = true;
      this.cb.settingsChanged(s);
      resetTips.querySelector('span')!.textContent = 'Tips will show again';
      for (const f of this.syncers) f();
    });
    // Progress codes: carry records and feats to another device (or keep a backup).
    const progStatus = h('span', { class: 'sprogstatus', role: 'status' });
    const progInput = h('input', { class: 'sproginput', type: 'text', placeholder: 'Paste a progress code', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Progress code' }) as HTMLInputElement;
    progInput.addEventListener('keydown', (e) => e.stopPropagation());
    const copyProg = this.button('Copy my code', 'ghost small', () => {
      const code = exportProgress(s);
      const fallback = () => {
        progInput.value = code;
        progInput.select();
        progStatus.textContent = 'Copy the code above, then paste it on the other device.';
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => (progStatus.textContent = 'Copied — paste it into Settings on the other device.'), fallback);
      else fallback();
    });
    const loadProg = this.button('Load', 'ghost small', () => {
      if (!progInput.value.trim() || progInput.value.trim() === exportProgress(s)) {
        progStatus.textContent = 'Paste a code from your other device first.';
        return;
      }
      if (!importProgress(s, progInput.value)) {
        progStatus.textContent = 'That isn’t a Mythwar progress code.';
        return;
      }
      this.cb.settingsChanged(s);
      progInput.value = '';
      progStatus.textContent = `Progress merged: ${s.feats.length} feats, ${Object.values(s.records).reduce((n, r) => n + (r?.wins ?? 0), 0)} wins.`;
    });
    const progress = h('div', { class: 'sprog' }, h('span', { class: 'sproglabel', text: 'Play on another device too? Carry your records and feats over:' }), h('div', { class: 'sprogrow' }, copyProg, progInput, loadProg), progStatus);
    // Each visit starts fresh: no half-armed "erase records" left over from last time.
    this.settingsOpened = () => {
      progStatus.textContent = '';
      progInput.value = '';
      resetRecords.dataset.armed = '';
      resetRecords.querySelector('span')!.textContent = 'Reset records';
      resetTips.querySelector('span')!.textContent = 'Show tips again';
    };
    return h(
      'div',
      { class: 'screen settings' },
      h('h2', { text: 'Settings' }),
      h(
        'div',
        { class: 'sbox' },
        slider('Master volume', 'master'),
        slider('Music', 'music'),
        slider('Effects', 'sfx'),
        toggleRow('Screen shake & vibration', 'shake'),
        toggleRow('Gameplay hints', 'hints'),
        toggleRow('“Counter!” advice on cards', 'advice'),
        toggleRow('Battery saver (lower quality)', 'lowQuality'),
        toggleRow('Fullscreen on phones', 'fullscreen'),
        toggleRow('Opponent’s quick messages', 'emotes'),
        progress,
        h(
          'div',
          { class: 'about' },
          h('b', { text: `Mythwar: Ages of Legend · v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}` }),
          h('span', { text: 'A tribute to the Flash classic Age of War. Every creature, citadel and effect is drawn in code and every sound is synthesized live — no image or audio files.' }),
        ),
      ),
      h('div', { class: 'mrow' }, resetRecords, resetTips, back),
    );
  }

  // -------------------------------------------------------------------------
  // Pause
  // -------------------------------------------------------------------------

  private buildPause(): HTMLElement {
    this.pauseSummary = h('div', { class: 'psummary' });
    this.pauseGoals = h('div', { class: 'pgoals' });
    this.pauseTitle = h('h2', { text: 'Paused' });
    this.restartBtn = this.button('Restart', '', () => this.cb.restart());
    this.pauseNote = h('div', { class: 'mnote', text: 'Leaving or restarting after the first minute counts as a defeat.' });
    return h(
      'div',
      { class: 'screen pause' },
      this.pauseTitle,
      this.pauseSummary,
      this.pauseGoals,
      h(
        'div',
        { class: 'mbuttons' },
        this.button('Resume', 'primary big', () => this.cb.resume(), ICONS.play),
        this.button('How to Play', '', () => this.show('howto'), ICONS.info),
        this.button('Bestiary', '', () => this.show('bestiary'), ICONS.book),
        this.button('Settings', '', () => this.show('settings'), ICONS.sound),
        this.restartBtn,
        this.button('Leave battle', 'ghost', () => this.cb.quit()),
        this.pauseNote,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  showResults(world: World, me: Team, difficulty: Difficulty, history: HistorySample[] = [], ageUps: { t: number; team: Team; age: number }[] = [], online?: OnlineResult): void {
    const el = this.screens.over!;
    el.innerHTML = '';
    const won = world.winner === me;
    const foeName = online ? online.foe : AI_PROFILES[difficulty].name;
    const P = world.players[me];
    const E = world.players[me === 0 ? 1 : 0];
    const row = (label: string, a: string, b: string) => h('tr', null, h('td', { text: a }), h('th', { text: label }), h('td', { text: b }));
    const table = h(
      'table',
      { class: 'stats' },
      // Against the AI, its income handicap stands by its name — the gold rows read fairly.
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('td', { class: 'you', text: 'You' }),
          h('th'),
          h('td', { class: 'foe', title: online ? '' : 'Its gold over time and from shrines, compared with yours (gold from kills is the same)' }, foeName, online || AI_PROFILES[difficulty].incomeMult === 1 ? null : h('small', { text: ` · ${Math.round(AI_PROFILES[difficulty].incomeMult * 100)}% income` })),
        ),
      ),
      h(
        'tbody',
        null,
        row('Highest age', AGES[P.age].name, AGES[E.age].name),
        row('Creatures summoned', String(P.stats.summoned), String(E.stats.summoned)),
        row('Foes slain', String(P.stats.kills), String(E.stats.kills)),
        row('Creature damage that countered', counterShare(P.stats.classDamage), counterShare(E.stats.classDamage)),
        // (Gold drawn from Ley Surges in brackets, when there was any.)
        row('Gold earned', goldLine(P.stats.goldEarned, P.stats.surgeGold), goldLine(E.stats.goldEarned, E.stats.surgeGold)),
        row('Damage to citadel', fmt(P.stats.damageToBase), fmt(E.stats.damageToBase)),
        row('God powers cast', String(P.stats.powersCast), String(E.stats.powersCast)),
      ),
    );
    // The player's signature creature: most summoned, later ages winning ties.
    let champion = AGE_UNITS[P.age][0];
    let best = -1;
    for (const age of AGE_UNITS) {
      for (const def of age) {
        const n = P.stats.summonedBy[def.id] ?? 0;
        if (n > 0 && n >= best) {
          best = n;
          champion = def;
        }
      }
    }
    const shareText = `Mythwar: ${won ? 'Victory' : 'Defeat'} vs ${foeName} in ${fmtTime(world.time)} — reached ${AGES[P.age].name}, ${P.stats.kills} foes slain.`;
    const share = this.button('Copy result', 'ghost', () => {
      const done = (ok: boolean) => (share.querySelector('span')!.textContent = ok ? 'Copied!' : 'Copy failed');
      try {
        navigator.clipboard.writeText(shareText).then(() => done(true), () => done(false));
      } catch {
        done(false);
      }
    });
    el.append(
      h(
        'div',
        { class: 'vhead' },
        h('div', { class: `verdict ${won ? 'win' : 'lose'}` }, h('div', { class: 'vt', text: won ? 'Victory' : 'Defeat' }), h('div', { class: 'vs', text: verdictLine(won, online) })),
        h('div', { class: 'vportrait' }, portrait(champion.id, 96, 0, 1.3), best > 0 ? h('div', { class: 'vcap', text: `Your champion: ${champion.name} ×${best}` }) : null),
      ),
      h('div', { class: 'vtime' }, h('span', { text: `Battle length ${fmtTime(world.time)}` }), online ? null : starsRow(battleStars(won, P.baseHp / P.baseMaxHp, world.time, difficulty).parts)),
      ...(this.featsEarned.length ? [h('div', { class: 'vfeats' }, h('i', { html: ICONS.xp }), `New feat${this.featsEarned.length > 1 ? 's' : ''}: ${this.featsEarned.map((f) => f.name).join(', ')}`)] : []),
      h(
        'div',
        { class: 'vtip' },
        h('span', { text: online && (won || online.reason !== 'citadel') ? scoreLine(online) : battleTip(world, me, difficulty, ageUps, this.settings.advice) }),
        online ? null : this.flowButton(won, difficulty),
      ),
      h('div', { class: 'vstats' }, table, history.length >= 3 ? armyChart(history, me, foeName, ageUps) : null),
      online ? this.onlineResultButtons(share) : h(
        'div',
        { class: 'mrow' },
        this.button('Main menu', 'ghost', () => this.cb.quit()),
        share,
        this.button('Change foe', '', () => this.show('difficulty')),
        this.button('Rematch', 'primary', () => this.cb.restart(), ICONS.swords),
      ),
    );
    this.show('over');
  }

  private onlineResultButtons(share: HTMLButtonElement): HTMLElement {
    this.rematchBtn = this.button('Rematch', 'primary', () => this.cb.rematch(), ICONS.swords);
    this.rematchNote = h('div', { class: 'mnote rmatch' });
    return h(
      'div',
      { class: 'vbuttons' },
      this.rematchNote,
      h('div', { class: 'mrow' }, this.button('Leave room', 'ghost', () => this.cb.leaveRoom()), share, this.rematchBtn),
    );
  }

  /**
   * Online results: whether a rematch is wanted by us / the other player, or they left.
   * `mine` / `theirs`: readiness; `theirs` null = they left the room.
   */
  updateRematch(foe: string, mine: boolean, theirs: boolean | null): void {
    const btn = this.rematchBtn;
    const note = this.rematchNote;
    if (!btn || !note) return;
    const span = btn.querySelector('span')!;
    if (theirs === null) {
      span.textContent = 'Back to room';
      note.textContent = `${foe} left the room.`;
      btn.dataset.room = '1';
    } else {
      btn.dataset.room = '';
      span.textContent = mine ? 'Cancel rematch' : theirs ? 'Accept rematch' : 'Rematch';
      note.textContent = mine ? `Waiting for ${foe}…` : theirs ? `${foe} wants a rematch!` : '';
    }
    btn.classList.toggle('primary', !mine);
    note.classList.toggle('hot', theirs === true && !mine);
  }
}

/**
 * Keeping the challenge in step with the player: after a win, the next foe up; after three
 * defeats in a row, the one below (`streak` = the current run at `difficulty`). Null: no nudge.
 */
export function flowSuggestion(won: boolean, difficulty: Difficulty, streak: number): Difficulty | null {
  const i = DIFFICULTIES.indexOf(difficulty);
  if (won) return i < DIFFICULTIES.length - 1 ? DIFFICULTIES[i + 1] : null;
  return streak <= -3 && i > 0 ? DIFFICULTIES[i - 1] : null;
}

function goldLine(earned: number, surge: number | undefined): string {
  return surge && surge >= 1 ? `${fmt(earned)} (${fmt(surge)} surge)` : fmt(earned);
}

/** Share of a side's creature damage that hit a class it beats ("64%"), or "–" with no damage. */
function counterShare(cd: [number, number, number] | undefined): string {
  return cd && cd[0] > 0 ? `${Math.round((cd[1] / cd[0]) * 100)}%` : '–';
}

/** The star goals of a battle in progress: "Stars to win: ★ Victory · ★ Citadel above half (now 72%) · ★ Within 12 minutes (3:39 left)". */
export function starGoals(world: World, me: Team, difficulty: Difficulty): string {
  const P = world.players[me];
  const frac = P.baseHp / P.baseMaxHp;
  const par = PAR_TIME[difficulty];
  const left = par - world.time;
  return [
    'Stars to win: ★ Victory',
    `${frac > 0.5 ? '★' : '☆'} Citadel above half (now ${Math.round(frac * 100)}%)`,
    left > 0 ? `★ Within ${Math.round(par / 60)} minutes (${fmtTime(left)} left)` : `☆ Within ${Math.round(par / 60)} minutes (passed)`,
  ].join(' · ');
}

/** The battle's three stars, each with what it was for. */
function starsRow(parts: { label: string; got: boolean }[]): HTMLElement {
  return h('div', { class: 'vstars', 'aria-label': `${parts.filter((p) => p.got).length} of 3 stars` }, ...parts.map((p) => h('span', { class: p.got ? 'got' : '' }, h('b', { text: p.got ? '★' : '☆' }), p.label)));
}

function verdictLine(won: boolean, online?: OnlineResult): string {
  if (online?.reason === 'forfeit') return won ? `${online.foe} left the battle.` : 'You left the battle.';
  if (online?.reason === 'timeout') return won ? `${online.foe} didn’t come back in time.` : 'You were away too long.';
  return won ? 'The enemy citadel has fallen.' : 'Your citadel lies in ruins.';
}

function scoreLine(o: OnlineResult): string {
  if (!o.score) return 'Well fought!';
  const [a, b] = o.score;
  return `Score in this room: you ${a} – ${b} ${o.foe}`;
}

/** One concrete lesson from the battle just played (or, after a win, what to try next). */
/** The foe to suggest: the easiest difficulty the player hasn't beaten yet (Mythic once all are). */
export function recommendedDifficulty(records: Settings['records']): Difficulty {
  return DIFFICULTIES.find((d) => !records[d]?.wins) ?? 'mythic';
}

export function battleTip(world: World, me: Team, difficulty: Difficulty, ageUps: { t: number; team: Team; age: number }[], advice = true): string {
  const foe: Team = me === 0 ? 1 : 0;
  const P = world.players[me];
  if (world.winner === me) {
    const i = DIFFICULTIES.indexOf(difficulty);
    return i < DIFFICULTIES.length - 1 ? `Ready for more? Try ${AI_PROFILES[DIFFICULTIES[i + 1]].name}.` : 'You have humbled a god of war. Can you win faster?';
  }
  // Fell behind in the ages?
  for (let age = 1; age < AGES.length; age++) {
    const theirs = ageUps.find((a) => a.team === foe && a.age === age);
    if (!theirs) break;
    const mine = ageUps.find((a) => a.team === me && a.age === age);
    // (Saves from older builds may lack ascension times: trust the age actually reached.)
    if (!mine && P.age >= age) continue;
    const gap = (mine ? mine.t : world.time) - theirs.t;
    if (gap > 45) {
      return `Tip: the enemy reached ${AGES[age].name} ${mine ? fmtTime(gap) + ' before you' : 'and you never did'}. Once you have the XP, save gold for the tithe — a new age outclasses extra creatures.`;
    }
  }
  if (P.stats.powersCast === 0 && world.time > 90) return 'Tip: you never cast your god power. It recharges — unleash it on the lane under the most pressure.';
  if (P.turrets.every((t) => !t.def) && world.time > 150) return 'Tip: mount turrets on your gates (click a gate or press T) — they hold a lane while you fight elsewhere.';
  // Countering is the core skill: say so when the creatures mostly hit the wrong classes.
  const cd = P.stats.classDamage ?? [0, 0, 0];
  if (cd[0] > 500 && cd[1] < cd[0] * 0.3 && cd[2] > cd[1]) {
    return `Tip: only ${Math.round((cd[1] / cd[0]) * 100)}% of your creatures’ damage hit a class they beat, and ${Math.round((cd[2] / cd[0]) * 100)}% hit one that beats them. Shields beat fangs, fangs beat orbs, orbs beat shields — answer what is in the lane.`;
  }
  const surged = [P.stats.surgeGold ?? 0, world.players[foe].stats.surgeGold ?? 0];
  if (surged[1] > Math.max(100, surged[0] * 2)) return `Tip: the enemy drew ${fmt(surged[1])} gold from Ley Surges. When a shrine starts to flicker, march on it — the surge pays whoever holds it.`;
  if (world.shrines.filter((s) => s.owner === foe).length >= 2) return 'Tip: the enemy held the Ley Shrines. Retake them when a lane is quiet — each one pays extra gold.';
  if (!advice) return 'Tip: read a lane before you summon into it — Guardians beat Hunters, Hunters beat Mystics, Mystics beat Guardians. (Settings can bring back the Counter! advice.)';
  return 'Tip: follow the Counter! badge — the card it marks beats what is coming down your selected lane.';
}

function p(html: string): HTMLElement {
  return h('p', { html });
}

function art(ids: string[], team: Team): HTMLElement {
  const box = h('div', { class: 'hart' });
  ids.forEach((id) => box.appendChild(portrait(id, 72, team)));
  return box;
}

/** Your creatures (blue) squaring up to the enemy's (red). */
function versusArt(): HTMLElement {
  const box = h('div', { class: 'hart versus' });
  const mine = [portrait('pixie', 64, 0), portrait('treant', 72, 0)];
  const theirs = [portrait('redcap', 72, 1, 0.4, true), portrait('treant', 72, 1, 1.1, true)];
  for (const c of mine) c.classList.add('tblue');
  for (const c of theirs) c.classList.add('tred');
  box.append(...mine, h('span', { class: 'vsmark', text: 'vs' }), ...theirs);
  return box;
}

function lanesArt(): HTMLElement {
  const box = h('div', { class: 'hart lanes' });
  for (let i = 0; i < 3; i++) {
    box.appendChild(h('div', { class: `hlane${i === 1 ? ' sel' : ''}` }, h('span', { text: '▶' }), i === 1 ? portrait('redcap', 36) : null));
  }
  return box;
}

function triangleArt(): HTMLElement {
  const node = (cls: string, label: string) => h('div', { class: `tri-node t-${cls}`, style: `color:${CLASS_COLOR[cls]}` }, h('i', { html: CLASS_ICON[cls] }), h('span', { text: label }));
  return h(
    'div',
    { class: 'hart triangle' },
    node('guardian', 'Guardian'),
    node('hunter', 'Hunter'),
    node('mystic', 'Mystic'),
    h('div', { class: 'tri-arrows', html: '<svg viewBox="0 0 200 120"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ffe7a6"/></marker></defs><path d="M70 28 L 132 28" stroke="#ffe7a6" stroke-width="3" marker-end="url(#ah)" fill="none"/><path d="M150 46 L 119 89" stroke="#ffe7a6" stroke-width="3" marker-end="url(#ah)" fill="none"/><path d="M88 98 L 60 58" stroke="#ffe7a6" stroke-width="3" marker-end="url(#ah)" fill="none"/></svg>' }),
  );
}

function powersArt(): HTMLElement {
  const box = h('div', { class: 'hart powers' });
  for (const a of AGES) box.appendChild(h('div', { class: 'hpow', title: POWERS[a.power].name, html: POWER_ICONS[a.power] }));
  return box;
}

/** Chart colours validated for a dark surface (dataviz palette check: band, CVD, contrast). */
const CHART_YOU = '#2196dc';
const CHART_FOE = '#e8506a';

/** "Army strength over time" line chart with direct labels, legend and a hover crosshair. */
function armyChart(history: HistorySample[], me: Team, foeName: string, ageUps: { t: number; team: Team; age: number }[] = []): HTMLElement {
  const W = 440;
  const H = 130;
  const pad = { l: 40, r: 50, t: 10, b: 20 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const tMax = Math.max(1, history[history.length - 1].t);
  let vMax = 1;
  for (const s of history) vMax = Math.max(vMax, s.army[0], s.army[1]);
  vMax = niceCeil(vMax);
  const X = (t: number) => pad.l + (t / tMax) * pw;
  const Y = (v: number) => pad.t + ph - (v / vMax) * ph;
  const foe = me === 0 ? 1 : 0;
  const path = (team: number) => history.map((s, i) => (i ? 'L' : 'M') + X(s.t).toFixed(1) + ',' + Y(s.army[team]).toFixed(1)).join('');
  const last = history[history.length - 1];
  let grid = '';
  for (const k of [0, 0.5, 1]) {
    const y = Y(vMax * k).toFixed(1);
    grid += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '" class="cg"/>';
    grid += '<text x="' + (pad.l - 6) + '" y="' + y + '" class="cy">' + fmt(vMax * k) + '</text>';
  }
  // Keep the two end labels from colliding.
  let yYou = Y(last.army[me]);
  let yFoe = Y(last.army[foe]);
  if (Math.abs(yYou - yFoe) < 12) {
    const mid = (yYou + yFoe) / 2;
    const up = yYou <= yFoe ? -6 : 6;
    yYou = mid + up;
    yFoe = mid - up;
  }
  const lx = X(last.t);
  // Ascension ticks along the top edge: yours above, the foe's below; numerals in muted ink.
  const roman = ['I', 'II', 'III', 'IV', 'V'];
  let ascents = '';
  for (const a of ageUps) {
    if (a.t > tMax) continue;
    const x = X(a.t).toFixed(1);
    const mine = a.team === me;
    const y0 = pad.t + (mine ? 0 : 7);
    ascents += '<line x1="' + x + '" x2="' + x + '" y1="' + y0 + '" y2="' + (y0 + 6) + '" stroke="' + (mine ? CHART_YOU : CHART_FOE) + '" stroke-width="2" stroke-linecap="round"/>';
    ascents += '<text x="' + (Number(x) + 3) + '" y="' + (y0 + 3) + '" class="ca">' + roman[a.age] + '</text>';
  }
  const svg =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chartsvg" role="img" aria-label="Army strength over time">' +
    grid +
    '<text x="' + pad.l + '" y="' + (H - 6) + '" class="cx">0:00</text>' +
    '<text x="' + (W - pad.r) + '" y="' + (H - 6) + '" class="cx end">' + fmtTime(tMax) + '</text>' +
    '<path d="' + path(foe) + '" class="cl" stroke="' + CHART_FOE + '"/>' +
    '<path d="' + path(me) + '" class="cl" stroke="' + CHART_YOU + '"/>' +
    '<circle cx="' + lx + '" cy="' + Y(last.army[foe]) + '" r="4" fill="' + CHART_FOE + '" class="cm"/>' +
    '<circle cx="' + lx + '" cy="' + Y(last.army[me]) + '" r="4" fill="' + CHART_YOU + '" class="cm"/>' +
    '<text x="' + (lx + 8) + '" y="' + yYou + '" class="cd">You</text>' +
    '<text x="' + (lx + 8) + '" y="' + yFoe + '" class="cd">Foe</text>' +
    ascents +
    '<line class="ch" x1="0" x2="0" y1="' + pad.t + '" y2="' + (pad.t + ph) + '" visibility="hidden"/>' +
    '</svg>';
  const legend = h(
    'div',
    { class: 'clegend' },
    h('span', null, h('i', { style: 'background:' + CHART_YOU }), 'You'),
    h('span', null, h('i', { style: 'background:' + CHART_FOE }), foeName),
    ageUps.length ? h('span', { class: 'cnote', text: 'ticks = ascensions' }) : null,
  );
  const tip = h('div', { class: 'ctip hidden' });
  const plot = h('div', { class: 'cplot', html: svg }, tip);
  const box = h('div', { class: 'chart' }, h('div', { class: 'ctitle', text: 'Army strength over time' }), legend, plot);
  // Hover: crosshair + tooltip at the nearest sample.
  const hair = plot.querySelector('.ch') as SVGLineElement;
  plot.addEventListener('pointermove', (e) => {
    const r = plot.querySelector('svg')!.getBoundingClientRect();
    // On rotated portrait phones the chart's time axis runs down the screen (the chart is wide).
    const frac = r.height > r.width ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    const sx = frac * W;
    const t = Math.max(0, Math.min(tMax, ((sx - pad.l) / pw) * tMax));
    let best = history[0];
    for (const s of history) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
    const x = X(best.t);
    hair.setAttribute('x1', String(x));
    hair.setAttribute('x2', String(x));
    hair.setAttribute('visibility', 'visible');
    tip.innerHTML =
      '<b>' + fmtTime(best.t) + '</b>' +
      '<span><i style="background:' + CHART_YOU + '"></i>You ' + fmt(best.army[me]) + '</span>' +
      '<span><i style="background:' + CHART_FOE + '"></i>' + foeName + ' ' + fmt(best.army[foe]) + '</span>';
    tip.classList.remove('hidden');
    // Place the tip in the plot's own px (unzoomed, unrotated), like its offsetWidth.
    const cw = plot.clientWidth;
    const px = (x / W) * cw;
    tip.style.left = Math.max(0, Math.min(cw - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
  });
  plot.addEventListener('pointerleave', () => {
    hair.setAttribute('visibility', 'hidden');
    tip.classList.add('hidden');
  });
  return box;
}

function niceCeil(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
