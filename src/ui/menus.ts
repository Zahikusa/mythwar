import { AI_PROFILES, DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import { AGES, AGE_UNITS, POWERS, TRIALS, TRIAL_ORDER } from '../sim/data.ts';
import type { UnitDef } from '../sim/data.ts';
import type { World } from '../sim/world.ts';
import type { Team } from '../sim/types.ts';
import { h, fmt, fmtTime, onTap } from './dom.ts';
import { CLASS_COLOR, CLASS_ICON, ICONS, POWER_ICONS } from './icons.ts';
import { portrait } from './portraits.ts';
import type { Settings } from './settings.ts';
import { SIGILS, battleStars, journalText, parTime } from './settings.ts';
import type { HistorySample } from '../game.ts';
import { MpScreens } from './mpmenus.ts';
import { Bestiary, MYTHS } from './bestiary.ts';
import { JOURNEY, PERSONAS } from './personas.ts';
import { battleName, placeName } from './places.ts';
import { FEATS, MAX_STARS, PINNACLE, starTotal } from './feats.ts';
import { PUZZLES } from '../sim/puzzles.ts';
import type { Puzzle } from '../sim/puzzles.ts';
import { exportProgress, importProgress } from './progress.ts';
import type { Feat } from './feats.ts';
import type { MpMenuCallbacks } from './mpmenus.ts';
import type { EmoteId, EndReason } from '../net/protocol.ts';
import { EMOTES, cleanName } from '../net/protocol.ts';

/** Results of a battle against another player (instead of an AI difficulty). */
export interface OnlineResult {
  foe: string;
  /** Co-op: the ally who fought alongside ('' in a versus battle). */
  ally?: string;
  reason: EndReason;
  /** Wins in this room so far: [mine, theirs]. */
  score: [number, number] | null;
}

export interface MenuCallbacks {
  play(difficulty: Difficulty): void;
  /** The goal-free sandbox. */
  sandbox(): void;
  /** A riddle of war (src/sim/puzzles.ts). */
  riddle(id: string): void;
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
  /** A quick message from the online results ("Well played!"); false if it couldn't be sent. */
  emote(id: EmoteId): boolean;
}

/** Distinct ids for the results panel's tabs (a new panel each battle). */
let tabSerial = 0;

/** Quick messages offered on the online results (sportsmanship, and an invitation to go again). */
const RESULT_EMOTES: EmoteId[] = ['wp', 'gl', 'thx'];

type Screen = 'none' | 'title' | 'difficulty' | 'howto' | 'settings' | 'bestiary' | 'feats' | 'riddles' | 'pause' | 'over' | 'mp' | 'room';

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
  private emoteLine: HTMLElement | null = null;
  private emoteRow: HTMLElement | null = null;
  /** The opponent of these results has left the room (their chips stay away). */
  private emoteGone = false;
  private bestiary!: Bestiary;
  private pauseGoals: HTMLElement | null = null;
  /** Feats earned in the battle whose results are shown next. */
  featsEarned: Feat[] = [];
  /** A journey chapter closed by this battle (its first win over that general), else null. */
  epilogue: { chapter: string; close: string } | null = null;
  /** The battle's chronicle (src/ui/chronicle.ts) for the results shown next. */
  chronicle: string[] = [];
  /** Lens #98: after an hour of battles, a break suggestion in place of the results tip (or null). */
  breakNote: string | null = null;
  /** A new best star rating against this foe (0 = not a new best). */
  newBestStars = 0;
  private featList: HTMLElement | null = null;
  private riddleList: HTMLElement | null = null;
  private trialsRow: HTMLElement | null = null;
  private startSync: (() => void) | null = null;
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
    this.screens.riddles = this.buildRiddles();
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
      riddles: 'Riddles of war',
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
  setPauseSummary(world: World, me: Team, difficulty: Difficulty, online?: { foe: string; title: string }, sandbox = false, riddle: Puzzle | null = null): void {
    if (!this.pauseSummary) return;
    if (riddle) {
      this.pauseSummary.textContent = `Riddle: ${riddle.name} · ${fmtTime(world.time)} of ${fmtTime(riddle.limit)}`;
      if (this.pauseGoals) this.pauseGoals.textContent = `${riddle.brief} Clear the field before any foe reaches your citadel.`;
      this.restartBtn?.classList.remove('hidden');
      if (this.pauseTitle) this.pauseTitle.textContent = 'Paused';
      if (this.pauseNote) this.pauseNote.textContent = 'Riddles keep no score — restart or leave any time.';
      return;
    }
    const P = world.players[me];
    const E = world.players[me === 0 ? 1 : 0];
    const foe = online ? online.foe : `${PERSONAS[difficulty].name} (${AI_PROFILES[difficulty].name})`;
    this.pauseSummary.textContent = sandbox
      ? `Sandbox · ${fmtTime(world.time)} · ${AGES[P.age].name}`
      : `${battleName(world.seed)} · vs ${foe} · ${fmtTime(world.time)} · ${AGES[P.age].name} vs ${AGES[E.age].name} · ${P.stats.kills} foes slain`;
    // Against the AI: the battle's star goals, while they can still be won.
    if (this.pauseGoals) this.pauseGoals.textContent = online || sandbox || world.startAge > 0 ? '' : starGoals(world, me, difficulty);
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
    // The whole ladder, always: beaten foes crowned with their best stars, the rest dimmed with
    // empty stars — the road ahead is part of the progress (Lens #49).
    for (const d of DIFFICULTIES) {
      const r = this.settings.records[d];
      const won = !!r?.wins;
      const n = won ? (r?.stars ?? 0) : 0;
      const stars = `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
      const title = won ? `${PERSONAS[d].title} (${AI_PROFILES[d].name}) defeated ${r!.wins}×${r!.best ? ` · fastest ${fmtTime(r!.best)}` : ''} · best rating ${stars}` : `${PERSONAS[d].title} (${AI_PROFILES[d].name}) — not defeated yet`;
      el.appendChild(h('span', { class: `laurel l-${d}${won ? '' : ' dim'}`, title, 'aria-label': title }, h('i', { html: ICONS.crown }), AI_PROFILES[d].name, h('small', { class: 'lstars', text: stars })));
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
    else if (this.screen === 'riddles') this.show('difficulty');
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
    if (screen === 'riddles') this.refreshRiddles();
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
      const card = h('button', { class: `diff d-${d}` }, h('div', { class: 'ribbon' }), h('div', { class: 'dname', text: p.name }), h('div', { class: 'dchapter', text: JOURNEY[d].chapter }), h('div', { class: 'dpersona', text: PERSONAS[d].title }), skulls, h('div', { class: 'dblurb', text: p.blurb }), chips, rec);
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
    // Riddles: small hand-made battles with one question each.
    const riddles = this.button('Riddles', 'ghost', () => this.show('riddles'));
    riddles.title = 'Small battles with one question each: a fixed purse, a known foe, one answer';
    this.saveNote = h('div', { class: 'dnote hidden', text: 'A new battle replaces your saved one (after its first minute, that counts as a defeat).' });
    // Battle length, then trials: optional handicaps for players who want a harder fight.
    const trials = h('div', { class: 'trials' });
    this.trialsRow = trials;
    const quick = h('button', { class: 'trial quickchip', title: 'Quick battle: faster ages, more starting gold, an earlier Ragnarök — about two thirds of the time', 'aria-pressed': 'false' }, 'Quick battle') as HTMLButtonElement;
    const syncQuick = () => {
      quick.classList.toggle('on', this.settings.quick);
      quick.setAttribute('aria-pressed', String(this.settings.quick));
    };
    syncQuick();
    onTap(quick, () => {
      this.settings.quick = !this.settings.quick;
      this.cb.settingsChanged(this.settings);
      this.cb.sound('select');
      syncQuick();
    });
    // Freedom (Lens #71): begin in any age already reached in battle.
    const start = h('button', { class: 'trial startchip', title: 'The age both sides begin in — any age you have reached in battle (no stars for a later start)' }) as HTMLButtonElement;
    const syncStart = () => {
      const age = Math.min(this.settings.startAge, this.settings.ageSeen);
      start.textContent = `Start: ${AGES[age].name}`;
      start.classList.toggle('on', age > 0);
      start.classList.toggle('hidden', this.settings.ageSeen < 1);
    };
    syncStart();
    this.syncers.push(syncStart);
    this.startSync = syncStart;
    onTap(start, () => {
      const cur = Math.min(this.settings.startAge, this.settings.ageSeen);
      this.settings.startAge = cur >= this.settings.ageSeen ? 0 : cur + 1;
      this.cb.settingsChanged(this.settings);
      this.cb.sound('select');
      syncStart();
    });
    trials.append(quick, start, h('span', { class: 'tlabel', text: 'Trials:' }));
    for (const id of TRIAL_ORDER) {
      const t = TRIALS[id];
      const chip = h('button', { class: 'trial handicap', title: t.blurb, 'aria-pressed': 'false' }, t.name) as HTMLButtonElement;
      const sync = () => {
        const on = this.settings.trials.includes(id);
        chip.classList.toggle('on', on);
        chip.setAttribute('aria-pressed', String(on));
      };
      sync();
      this.syncers.push(sync);
      onTap(chip, () => {
        const set = new Set(this.settings.trials);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        this.settings.trials = TRIAL_ORDER.filter((x) => set.has(x));
        this.cb.settingsChanged(this.settings);
        this.cb.sound('select');
        sync();
      });
      trials.appendChild(chip);
    }
    return h('div', { class: 'screen difficulty' }, h('h2', { text: 'Choose your foe' }), grid, trials, this.saveNote, h('div', { class: 'mrow' }, back, sandbox, riddles, begin));
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
    // Trials are for a harder fight: they appear after a first victory (Lens #56) — or when some
    // are already chosen (from a progress code), so they can always be switched off again.
    this.trialsRow?.classList.toggle('notrials', fresh && this.settings.trials.length === 0);
    this.startSync?.();
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
          p('Press and hold a creature (or hover it) to see what it is. You can also <b>drag a card onto any lane</b>. Summons wait in a short queue (five in all); each gate trains its own. Tap a creature you can’t afford yet and it summons itself once the gold is there. Keys: <b>1–4</b> summon, <b>W/S</b> or <b>↑/↓</b> change lane.'),
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
          p('Gold flows in over time and from every kill — a fallen creature pays its killer three quarters of its cost, so creatures thrown away one by one feed the enemy. Stand at a lane’s <b>Ley Shrine</b> with no foes nearby to capture it: it pays extra income until the enemy takes it back. Now and then a <b>Ley Surge</b> flares under one shrine: hold it while it lasts for a flood of gold.'),
          p('<b>XP</b> comes from kills, blows against the enemy citadel and the passing of time. With enough XP and a gold tithe you can <b>Ascend</b> (or, with three quarters of the XP, <b>rush</b> it for a double tithe) through five mythic ages — Fae Wilds, Olympus, Asgard, the Jade Empire and the Celestial realm — each with stronger creatures and a sturdier citadel. The ring around each side’s age badge fills with its XP: watch the enemy’s.'),
        ],
      },
      {
        title: 'Powers, turrets & blessings',
        body: [
          powersArt(),
          p('Each age grants a <b>god power</b>. Press it, then choose a lane to unleash it (on a keyboard, <b>Space</b> casts it on the selected lane). <b>Turrets</b> guard one lane each from your gates; <b>Blessings</b> permanently strengthen your army.'),
          p('At 18:00 — or 3 minutes after both sides reach the Celestial age — <b>Ragnarök</b> comes: the citadels’ wards fall silent, their turrets falter, and every blow against them grows deadlier, minute by minute.'),
        ],
      },
      {
        title: 'Tactics',
        body: [
          art(['jotunn', 'fenrir', 'valkyrie'], 0),
          p('<b>Hold the line:</b> the shield under a lane’s ▶ marker (or <b>G</b>) stops that lane’s creatures just past its shrine. Gather a wave outside the enemy gate’s reach — the dashed line in front of it — then let it loose together.'),
          p('<b>Ley sight:</b> while you hold a lane’s shrine you see the enemy’s next summons for that lane above their gate. <b>Brittle frost:</b> frozen foes take 50% more damage — strike while they are frozen.'),
          p('<b>Veterans:</b> a creature that fells three foes rises a veteran (a gold chevron over its head): it strikes 20% harder and its wounds partly close. Keep your veterans alive.'),
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
    // The war is won (the last chapter just closed): what the game is for, in the end, is two
    // people at one table — so the way on leads to a friend (Lens #100).
    if (won && difficulty === 'mythic' && this.epilogue) {
      const b = this.button('Now bring a friend →', 'vnext', () => this.cb.multiplayer());
      b.title = 'Teach the war to someone: battle a friend on the same Wi-Fi — or fight side by side against the generals';
      return b;
    }
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

  private buildRiddles(): HTMLElement {
    this.riddleList = h('div', { class: 'riddlelist' });
    return h(
      'div',
      { class: 'screen riddles' },
      h('h2', { text: 'Riddles of war' }),
      h('div', { class: 'mnote', text: 'A fixed purse, no income, no walls — the foe already on the field. Clear it before any foe reaches your citadel.' }),
      this.riddleList,
      h('div', { class: 'mrow' }, this.button('Back', 'primary', () => this.goBack())),
    );
  }

  /** The riddles, in order; those of ages never reached in battle stay sealed (Lens #4). */
  private refreshRiddles(): void {
    const list = this.riddleList!;
    list.innerHTML = '';
    PUZZLES.forEach((pz, i) => {
      const open = pz.age <= this.settings.ageSeen;
      const solved = this.settings.riddles.includes(pz.id);
      const card = h(
        'button',
        { class: `riddle${solved ? ' solved' : ''}${open ? '' : ' sealed'}`, 'aria-label': open ? `Riddle ${i + 1}: ${pz.name}${solved ? ' (solved)' : ''}` : `Riddle ${i + 1}: sealed` },
        h('div', { class: 'rhead' }, h('b', { text: open ? `${i + 1}. ${pz.name}` : `${i + 1}. ???` }), h('span', { class: 'rage', text: open ? AGES[pz.age].name : '' }), solved ? h('span', { class: 'rsolved', text: '✓ Solved' }) : null),
        h('span', { class: 'rbrief', text: open ? pz.brief : `Reach ${AGES[pz.age].name} in battle to unseal this riddle.` }),
      ) as HTMLButtonElement;
      card.disabled = !open;
      if (open) onTap(card, () => {
        this.cb.sound('select');
        this.cb.riddle(pz.id);
      });
      list.appendChild(card);
    });
  }

  /** After a riddle: solved (on to the next) or not yet (with a hint). */
  showRiddleResult(pz: Puzzle, won: boolean): void {
    const el = this.screens.over!;
    el.innerHTML = '';
    const i = PUZZLES.indexOf(pz);
    const next = PUZZLES[i + 1];
    const nextOpen = !!next && next.age <= this.settings.ageSeen;
    const solvedAll = PUZZLES.every((p) => this.settings.riddles.includes(p.id));
    el.append(
      h(
        'div',
        { class: 'vhead' },
        h('div', { class: `verdict ${won ? 'win' : 'lose'}` }, h('div', { class: 'vt', text: won ? 'Solved' : 'Not yet' }), h('div', { class: 'vs', text: pz.name })),
        // The riddle's foe, as the battle results show your champion.
        h('div', { class: 'vportrait' }, portrait(pz.foes[0][1], 96, 1, 1.3, true), h('div', { class: 'vcap', text: `${AGES[pz.age].name} · ${pz.gold} gold` })),
      ),
      h('div', { class: 'vtip' }, h('span', { text: won ? (solvedAll ? 'Every riddle of war is solved. The rest is a real battle.' : next && !nextOpen ? `The next riddle waits in ${AGES[next.age].name} — reach it in battle.` : 'The field is clear.') : `Hint: ${pz.hint}` })),
      h(
        'div',
        { class: 'mrow' },
        this.button('Riddles', 'ghost', () => this.show('riddles')),
        this.button('Try again', won && nextOpen ? '' : 'primary', () => this.cb.riddle(pz.id)),
        won && nextOpen ? this.button(`Next: ${next.name}`, 'primary', () => this.cb.riddle(next.id), ICONS.swords) : null,
      ),
    );
    this.show('over');
  }

  private refreshFeats(): void {
    const list = this.featList!;
    list.innerHTML = '';
    // The pinnacle heads the list, with the stars that build toward it, general by general.
    const top = FEATS.find((f) => f.id === PINNACLE)!;
    const got = this.settings.feats.includes(PINNACLE);
    const n = starTotal(this.settings.records);
    list.appendChild(
      h(
        'div',
        { class: `feat pinnacle${got ? ' got' : ''}` },
        h('i', { html: ICONS.crown }),
        h(
          'div',
          null,
          h('b', { text: top.name }),
          h('span', { text: `${top.desc} ${got ? 'Achieved.' : `${n} of ${MAX_STARS} stars so far:`}` }),
          got ? null : h('span', { class: 'pstars' }, ...DIFFICULTIES.map((d) => {
            const s = Math.min(3, this.settings.records[d]?.stars ?? 0);
            return h('small', { text: `${PERSONAS[d].name} ${'★'.repeat(s)}${'☆'.repeat(3 - s)}` });
          })),
        ),
      ),
    );
    for (const f of FEATS) {
      if (f.id === PINNACLE) continue;
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
    const toggleRow = (label: string, key: 'shake' | 'hints' | 'advice' | 'lowQuality' | 'fullscreen' | 'emotes' | 'colorblind') => {
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
      s.journal = [];
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
    // Your name: by your citadel, in multiplayer rooms, and on the generals' lips (Lens #64).
    const nameInput = h('input', { class: 'sproginput sname', type: 'text', maxlength: '16', placeholder: 'Your name', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Your name' }) as HTMLInputElement;
    nameInput.value = s.playerName;
    this.syncers.push(() => (nameInput.value = s.playerName));
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    nameInput.addEventListener('change', () => {
      s.playerName = nameInput.value.trim() ? cleanName(nameInput.value) : '';
      nameInput.value = s.playerName;
      this.cb.settingsChanged(s);
    });
    const nameRow = h('label', { class: 'srow sname-row' }, h('span', { text: 'Your name' }), nameInput);
    // Your sigil (Lens #75): an emblem beside your name by your citadel and on the results.
    const sigilBtn = h('button', { class: 'mbtn ghost small ssigil', 'aria-label': 'Your sigil' }) as HTMLButtonElement;
    const syncSigil = () => (sigilBtn.textContent = s.sigil >= 0 ? SIGILS[s.sigil] : 'None');
    syncSigil();
    this.syncers.push(syncSigil);
    onTap(sigilBtn, () => {
      s.sigil = s.sigil + 1 >= SIGILS.length ? -1 : s.sigil + 1;
      syncSigil();
      this.cb.settingsChanged(s);
      this.cb.sound('select');
    });
    const sigilRow = h('div', { class: 'srow sname-row' }, h('span', { text: 'Your sigil' }), sigilBtn);
    const progress = h('div', { class: 'sprog' }, h('span', { class: 'sproglabel', text: 'Play on another device too? Carry your records and feats over:' }), h('div', { class: 'sprogrow' }, copyProg, progInput, loadProg), progStatus);
    // Playtests (Lens #91): the last battles as plain text, for whoever runs the test. Kept on
    // this device only; nothing leaves it unless the player copies it.
    const journalStatus = h('span', { class: 'sprogstatus', role: 'status' });
    const copyJournal = this.button('Copy playtest journal', 'ghost small', () => {
      if (!s.journal.length) {
        journalStatus.textContent = 'No battles noted yet — play one first.';
        return;
      }
      const text = journalText(s, typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '');
      const shown = () => (journalStatus.textContent = `${s.journal.length} battle(s) copied — paste them into a message or a document.`);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(shown, () => (journalStatus.textContent = 'Copying is blocked here — try another browser.'));
      else journalStatus.textContent = 'Copying is not available in this browser.';
    });
    const journalRow = h('div', { class: 'sprogrow sjournal' }, copyJournal, h('span', { class: 'sproglabel', text: 'For playtests: your last battles (this device only).' }));
    progress.append(journalRow, journalStatus);
    // Each visit starts fresh: no half-armed "erase records" left over from last time.
    this.settingsOpened = () => {
      journalStatus.textContent = '';
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
        toggleRow('Colour-blind friendly (foe in orange)', 'colorblind'),
        toggleRow('Battery saver (lower quality)', 'lowQuality'),
        toggleRow('Fullscreen on phones', 'fullscreen'),
        toggleRow('Opponent’s messages (AI taunts too)', 'emotes'),
        nameRow,
        sigilRow,
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
    const foeName = online ? online.foe : PERSONAS[difficulty].name;
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
          h('td', { class: 'you', text: this.settings.sigil >= 0 ? `${SIGILS[this.settings.sigil]} You` : 'You' }),
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
    const place = placeName(world.seed);
    // The first victory over Ares ends the war (Lens #100): the tip hands over to "bring a friend".
    const warWon = !online && won && difficulty === 'mythic' && !!this.epilogue;
    const story = this.chronicle;
    const shareText = `Mythwar: ${won ? 'Victory' : 'Defeat'} at ${place} vs ${foeName} in ${fmtTime(world.time)} — reached ${AGES[P.age].name}, ${P.stats.kills} foes slain.${story.length ? `\n${story.join('\n')}` : ''}`;
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
        h('div', { class: `verdict ${won ? 'win' : 'lose'}` }, h('div', { class: 'vt', text: won ? 'Victory' : 'Defeat' }), h('div', { class: 'vs', text: !online && this.epilogue ? `${this.epilogue.chapter} — ${this.epilogue.close}` : verdictLine(won, online, place) })),
        h('div', { class: 'vportrait' }, portrait(champion.id, 96, 0, 1.3), best > 0 ? h('div', { class: 'vcap', text: `Your champion: ${champion.name} ×${best}` }) : null),
      ),
      h(
        'div',
        { class: 'vtime' },
        h('span', { text: `Battle length ${fmtTime(world.time)}` }),
        online || world.startAge > 0 ? null : starsRow(battleStars(won, P.baseHp / P.baseMaxHp, world.time, difficulty, world.quick).parts),
        world.quick ? h('span', { class: 'vtrials', text: 'Quick battle' }) : null,
        world.startAge > 0 ? h('span', { class: 'vtrials', text: `Started in ${AGES[world.startAge].name} (no stars)` }) : null,
        P.trials?.length ? h('span', { class: 'vtrials', text: `Trials: ${P.trials.map((t) => TRIALS[t].name).join(', ')}` }) : null,
      ),
      // Rewards of this battle, on one line: new feats and a new best rating against this foe.
      ...(this.featsEarned.length || (!online && this.newBestStars)
        ? [
            h(
              'div',
              { class: 'vfeats' },
              h('i', { html: ICONS.xp }),
              this.featsEarned.length ? `New feat${this.featsEarned.length > 1 ? 's' : ''}: ${this.featsEarned.map((f) => f.name).join(', ')}` : null,
              !online && this.newBestStars
                ? h('span', { class: 'vbest' }, `${this.featsEarned.length ? ' · ' : ''}New best vs ${AI_PROFILES[difficulty].name}: `, h('b', { text: `${'★'.repeat(this.newBestStars)}${'☆'.repeat(3 - this.newBestStars)}` }))
                : null,
            ),
          ]
        : []),
      h(
        'div',
        { class: 'vtip' },
        h('span', { class: this.breakNote ? 'vbreak' : undefined, text: this.breakNote ?? (online && (won || online.reason !== 'citadel') ? scoreLine(online) : warWon ? 'The war is won — and a war is better shared.' : battleTip(world, me, difficulty, ageUps, this.settings.advice)) }),
        online || this.breakNote ? null : this.flowButton(won, difficulty),
      ),
      h('div', { class: 'vstats' }, table, this.storyPanel(history.length >= 3 ? armyChart(history, me, foeName, ageUps) : null, story, best > 0 ? champion : null)),
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

  /**
   * The army chart and the battle's chronicle (Lens #65) share one panel, with two small tabs;
   * a battle too short for a chart shows its chronicle straight away.
   */
  private storyPanel(chart: HTMLElement | null, story: string[], champion: UnitDef | null): HTMLElement | null {
    const panels: { label: string; title: string; el: HTMLElement }[] = [];
    if (chart) panels.push({ label: 'Armies', title: 'Army strength', el: chart });
    if (story.length) panels.push({ label: 'Chronicle', title: 'Chronicle', el: h('div', { class: 'chart chron' }, h('div', { class: 'ctitle', text: 'Chronicle of the battle' }), h('ol', { class: 'chronlist' }, ...story.map((line) => h('li', { text: line })))) });
    // What a battle leaves behind (Lens #97): the real myth behind the creature that carried it.
    const myth = champion ? MYTHS[champion.id] : undefined;
    if (champion && myth) panels.push({ label: 'Legend', title: `The legend of the ${champion.name}`, el: h('div', { class: 'chart chron legend' }, h('div', { class: 'ctitle', text: `The legend of the ${champion.name}` }), h('p', { class: 'clegend', text: myth }), h('p', { class: 'cnote', text: 'Every creature’s story is in the Bestiary.' })) });
    if (panels.length <= 1) return panels[0]?.el ?? null;
    const wrap = h('div', { class: 'storypanel' });
    // (Real tabs for assistive technology: a tablist, tabs that say which is selected, panels
    // that name their tab.)
    const tabs = h('div', { class: 'ctabs', role: 'tablist', 'aria-label': 'Battle report' });
    const uid = `vtab${++tabSerial}`;
    panels.forEach((p, i) => {
      // (Shorter titles leave room for the tabs on the same line.)
      p.el.querySelector('.ctitle')!.textContent = p.label === 'Legend' ? 'Legend' : p.title;
      if (i > 0) p.el.classList.add('hidden');
      p.el.id = `${uid}p${i}`;
      p.el.setAttribute('role', 'tabpanel');
      p.el.setAttribute('aria-labelledby', `${uid}t${i}`);
      const b = h('button', { class: `ctab${i === 0 ? ' on' : ''}`, text: p.label, role: 'tab', id: `${uid}t${i}`, 'aria-controls': p.el.id, 'aria-selected': String(i === 0) }) as HTMLButtonElement;
      onTap(b, () => {
        this.cb.sound('click');
        for (const q of panels) q.el.classList.toggle('hidden', q !== p);
        for (const t of tabs.children) {
          t.classList.toggle('on', t === b);
          t.setAttribute('aria-selected', String(t === b));
        }
      });
      tabs.appendChild(b);
    });
    wrap.append(tabs, ...panels.map((p) => p.el));
    return wrap;
  }

  private onlineResultButtons(share: HTMLButtonElement): HTMLElement {
    this.rematchBtn = this.button('Rematch', 'primary', () => this.cb.rematch(), ICONS.swords);
    this.rematchNote = h('div', { class: 'mnote rmatch' });
    // Say something after the battle (phase-1 backlog #25): a few chips, and what was said.
    this.emoteLine = h('div', { class: 'vemoteline', role: 'status' });
    const chips = RESULT_EMOTES.map((id) => {
      const chip = h('button', { class: 'trial vemote', text: EMOTES[id] }) as HTMLButtonElement;
      onTap(chip, () => {
        if (!this.cb.emote(id)) return;
        this.cb.sound('select');
        this.resultEmote(`You: ${EMOTES[id]}`);
        // (The server takes one message every 1.5 s.)
        for (const c of chips) c.disabled = true;
        window.setTimeout(() => chips.forEach((c) => (c.disabled = false)), 1600);
      });
      return chip;
    });
    this.emoteRow = h('div', { class: 'vemotes' }, ...chips, this.emoteLine);
    this.emoteGone = false;
    return h(
      'div',
      { class: 'vbuttons' },
      this.emoteRow,
      this.rematchNote,
      h('div', { class: 'mrow' }, this.button('Leave room', 'ghost', () => this.cb.leaveRoom()), share, this.rematchBtn),
    );
  }

  /** A quick message said on the online results ("Ada: Well played!"), shown by the chips. */
  resultEmote(text: string): void {
    if (!this.emoteLine) return;
    this.emoteLine.textContent = text;
    this.emoteLine.classList.remove('pop');
    void this.emoteLine.offsetWidth; // restart the pop animation
    this.emoteLine.classList.add('pop');
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
    // (Nobody to talk to once they've left — not even a stranger who takes their seat later.)
    if (theirs === null) this.emoteGone = true;
    this.emoteRow?.classList.toggle('hidden', this.emoteGone);
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
  const par = parTime(difficulty, world.quick);
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

function verdictLine(won: boolean, online?: OnlineResult, place = ''): string {
  if (online?.ally) {
    if (online.reason !== 'citadel') return won ? 'The battle is yours.' : 'You and your ally were away too long.';
    return won ? `You and ${online.ally} toppled the ${online.foe}!` : `The ${online.foe} broke your shared citadel.`;
  }
  if (online?.reason === 'forfeit') return won ? `${online.foe} left the battle.` : 'You left the battle.';
  if (online?.reason === 'timeout') return won ? `${online.foe} didn’t come back in time.` : 'You were away too long.';
  const at = place ? ` at ${place}` : '';
  return won ? `The enemy citadel has fallen${at}.` : `Your citadel lies in ruins${at}.`;
}

function scoreLine(o: OnlineResult): string {
  if (o.ally) return o.score && o.score[0] ? `Victories together in this room: ${o.score[0]}` : 'Well fought, together!';
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
    // (The next foe is offered by the button beside this tip; the tip points at the stars.)
    const par = parTime(difficulty, world.quick);
    if (P.baseHp / P.baseMaxHp <= 0.5) return 'Victory — now keep your citadel above half for the second star: turrets and Bastion help.';
    if (world.time > par) return `Victory — win within ${Math.round(par / 60)} minutes for the third star: ascend sooner, push with a held wave.`;
    if (difficulty !== 'mythic') return 'A flawless victory: all three stars.';
    return P.trials?.length === 3 ? 'You have humbled a god of war under every trial. Nothing in the nine worlds can stop you.' : 'You have humbled a god of war. For a harder fight still, take on the Trials.';
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
  // Every fallen creature pays its killer three quarters of its cost: creatures sent one by one
  // into a held lane feed the enemy (kills are over half of everyone's income).
  const fed = world.players[foe].stats.killGold ?? 0;
  if (fed > Math.max(1500, (P.stats.killGold ?? 0) * 1.5)) return `Tip: your fallen creatures paid the enemy ${fmt(fed)} gold — each pays its killer three quarters of its cost. Don’t feed a held lane one by one: gather a wave (hold the line) and strike together.`;
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
