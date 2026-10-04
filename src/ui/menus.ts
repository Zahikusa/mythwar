import { AI_PROFILES, DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import { AGES, AGE_UNITS, POWERS } from '../sim/data.ts';
import type { World } from '../sim/world.ts';
import type { Team } from '../sim/types.ts';
import { h, fmt, fmtTime, onTap } from './dom.ts';
import { CLASS_COLOR, CLASS_ICON, ICONS, POWER_ICONS } from './icons.ts';
import { portrait } from './portraits.ts';
import type { Settings } from './settings.ts';
import type { HistorySample } from '../game.ts';

export interface MenuCallbacks {
  play(difficulty: Difficulty): void;
  continueSaved(): void;
  resume(): void;
  restart(): void;
  quit(): void;
  settingsChanged(s: Settings): void;
  sound(kind: string): void;
}

type Screen = 'none' | 'title' | 'difficulty' | 'howto' | 'settings' | 'pause' | 'over';

/** Full-screen menus: title, difficulty, how-to-play, settings, pause and results. */
export class Menus {
  readonly root: HTMLDivElement;
  private cb: MenuCallbacks;
  private settings: Settings;
  private screen: Screen = 'none';
  private back: Screen = 'title';
  private screens: Partial<Record<Screen, HTMLElement>> = {};
  private howtoPage = 0;
  private howtoPages: HTMLElement[] = [];
  private howtoDots: HTMLElement | null = null;
  private selected: Difficulty;
  private syncers: (() => void)[] = [];
  private continueBtn: HTMLButtonElement | null = null;
  private playBtn: HTMLButtonElement | null = null;

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
    this.screens.pause = this.buildPause();
    this.screens.over = h('div', { class: 'screen over' });
    for (const el of Object.values(this.screens)) this.root.appendChild(el!);
    this.show('none');
  }

  get current(): Screen {
    return this.screen;
  }

  /** Shows "Continue battle" on the title screen when an autosave exists. */
  setContinue(label: string | null): void {
    if (!this.continueBtn || !this.playBtn) return;
    this.continueBtn.classList.toggle('hidden', !label);
    this.continueBtn.querySelector('span')!.textContent = label ? `Continue \u2014 ${label}` : 'Continue battle';
    // Only one gold button at a time.
    this.playBtn.classList.toggle('primary', !label);
    this.playBtn.querySelector('span')!.textContent = label ? 'New battle' : 'Play';
  }

  /** Return from how-to / settings to whichever screen opened them. */
  goBack(): void {
    if (this.screen === 'howto' || this.screen === 'settings') this.show(this.back);
  }

  show(screen: Screen): void {
    if (screen === 'howto' || screen === 'settings') {
      if (this.screen !== 'howto' && this.screen !== 'settings') this.back = this.screen === 'none' ? 'title' : this.screen;
    }
    this.screen = screen;
    for (const [k, el] of Object.entries(this.screens)) el!.classList.toggle('active', k === screen);
    this.root.classList.toggle('open', screen !== 'none');
    this.root.classList.toggle('dim', screen !== 'none' && screen !== 'title');
    if (screen === 'howto') this.setHowtoPage(0);
    if (screen === 'difficulty') this.refreshDifficulty();
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
      this.button('How to Play', '', () => this.show('howto'), ICONS.info),
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
    return h('div', { class: 'screen title' }, logo, creatures, buttons, foot);
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
      const card = h('button', { class: `diff d-${d}` }, h('div', { class: 'dname', text: p.name }), skulls, h('div', { class: 'dblurb', text: p.blurb }), rec);
      onTap(card, () => {
        this.selected = d;
        this.cb.sound('select');
        this.refreshDifficulty();
      });
      card.addEventListener('dblclick', () => this.cb.play(d));
      this.diffCards[d] = card;
      grid.appendChild(card);
    });
    const begin = this.button('Begin Battle', 'primary big', () => this.cb.play(this.selected), ICONS.swords);
    const back = this.button('Back', 'ghost', () => this.show('title'));
    return h('div', { class: 'screen difficulty' }, h('h2', { text: 'Choose your foe' }), grid, h('div', { class: 'mrow' }, back, begin));
  }

  private refreshDifficulty(): void {
    const rec = this.settings.records;
    for (const d of DIFFICULTIES) {
      this.diffCards[d].classList.toggle('sel', d === this.selected);
      const r = rec[d];
      this.recordEls[d].textContent = r && (r.wins || r.losses) ? `${r.wins}W · ${r.losses}L${r.best ? ` · best ${fmtTime(r.best)}` : ''}` : '';
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
          p('You can also <b>drag a card onto any lane</b>. Summons wait in a short queue at your gates. Keys: <b>1–4</b> summon, <b>W/S</b> or <b>↑/↓</b> change lane.'),
        ],
      },
      {
        title: 'Counter your foe',
        body: [
          triangleArt(),
          p('Every creature belongs to a class. <b style="color:#f2b84b">Guardians</b> crush <b style="color:#7ed957">Hunters</b>, Hunters tear through <b style="color:#b48cff">Mystics</b>, and Mystics melt Guardians.'),
          p('Hunters strike as a <b>pack</b>, Guardians’ <b>sweeping</b> blows break packs, and massed Mystics melt a Guardian line. A counter deals <b>+50% damage</b>; the card marked <b>Counter!</b> answers your selected lane.'),
        ],
      },
      {
        title: 'Gold, shrines and ages',
        body: [
          art(['treant', 'minotaur', 'jotunn', 'oni', 'titan'], 0),
          p('Gold flows in over time and from every kill. <b>Ley Shrines</b> in the middle of each lane add income while your creatures hold them.'),
          p('Kills grant <b>XP</b>. With enough XP and a gold tithe you can <b>Ascend</b> through five mythic ages — Fae Wilds, Olympus, Asgard, the Jade Empire and the Celestial realm — each with stronger creatures and a sturdier citadel.'),
        ],
      },
      {
        title: 'Powers, turrets & blessings',
        body: [
          powersArt(),
          p('Each age grants a <b>god power</b>. Press it (or <b>Space</b>) and choose a lane to unleash it. <b>Turrets</b> guard one lane each from your gates; <b>Blessings</b> permanently strengthen your army.'),
          p('If the war drags on, <b>Ragnarök</b> comes: the citadels’ wards fall silent and every blow against them grows deadlier.'),
        ],
      },
    ];
    this.howtoPages = pages.map((pg, i) => h('div', { class: `hpage${i === 0 ? ' active' : ''}` }, h('h3', { text: pg.title }), ...pg.body));
    const dots = h('div', { class: 'hdots' });
    pages.forEach((_, i) => {
      const d = h('button', { class: 'hdot' });
      onTap(d, () => this.setHowtoPage(i));
      dots.appendChild(d);
    });
    this.howtoDots = dots;
    const prev = this.button('Back', 'ghost', () => (this.howtoPage === 0 ? this.show(this.back) : this.setHowtoPage(this.howtoPage - 1)));
    const next = this.button('Next', 'primary', () => (this.howtoPage === pages.length - 1 ? this.show(this.back) : this.setHowtoPage(this.howtoPage + 1)));
    next.classList.add('hnext');
    return h('div', { class: 'screen howto' }, h('div', { class: 'hbook' }, ...this.howtoPages), dots, h('div', { class: 'mrow' }, prev, next));
  }

  private setHowtoPage(i: number): void {
    this.howtoPage = i;
    this.howtoPages.forEach((p, k) => p.classList.toggle('active', k === i));
    this.howtoDots?.querySelectorAll('.hdot').forEach((d, k) => d.classList.toggle('on', k === i));
    const next = this.screens.howto?.querySelector('.hnext span');
    if (next) next.textContent = i === this.howtoPages.length - 1 ? 'Got it' : 'Next';
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
        val.textContent = `${input.value}%`;
        this.cb.settingsChanged(s);
      });
      // Preview the new level when the slider is released.
      if (key !== 'music') input.addEventListener('change', () => this.cb.sound('summon'));
      return h('label', { class: 'srow' }, h('span', { text: label }), input, val);
    };
    const toggleRow = (label: string, key: 'shake' | 'hints' | 'lowQuality' | 'fullscreen') => {
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
    const resetTips = this.button('Show tips again', 'ghost', () => {
      s.hintsSeen = [];
      s.hints = true;
      this.cb.settingsChanged(s);
      resetTips.querySelector('span')!.textContent = 'Tips will show again';
      for (const f of this.syncers) f();
    });
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
        toggleRow('Battery saver (lower quality)', 'lowQuality'),
        toggleRow('Fullscreen on phones', 'fullscreen'),
      ),
      h('div', { class: 'mrow' }, resetTips, back),
    );
  }

  // -------------------------------------------------------------------------
  // Pause
  // -------------------------------------------------------------------------

  private buildPause(): HTMLElement {
    return h(
      'div',
      { class: 'screen pause' },
      h('h2', { text: 'Paused' }),
      h(
        'div',
        { class: 'mbuttons' },
        this.button('Resume', 'primary big', () => this.cb.resume(), ICONS.play),
        this.button('How to Play', '', () => this.show('howto'), ICONS.info),
        this.button('Settings', '', () => this.show('settings'), ICONS.sound),
        this.button('Restart', '', () => this.cb.restart()),
        this.button('Leave battle', 'ghost', () => this.cb.quit()),
        h('div', { class: 'mnote', text: 'Leaving or restarting after the first minute counts as a defeat.' }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  showResults(world: World, me: Team, difficulty: Difficulty, history: HistorySample[] = [], ageUps: { t: number; team: Team; age: number }[] = []): void {
    const el = this.screens.over!;
    el.innerHTML = '';
    const won = world.winner === me;
    const P = world.players[me];
    const E = world.players[me === 0 ? 1 : 0];
    const row = (label: string, a: string, b: string) => h('tr', null, h('td', { text: a }), h('th', { text: label }), h('td', { text: b }));
    const table = h(
      'table',
      { class: 'stats' },
      h('thead', null, h('tr', null, h('td', { class: 'you', text: 'You' }), h('th'), h('td', { class: 'foe', text: AI_PROFILES[difficulty].name }))),
      h(
        'tbody',
        null,
        row('Highest age', AGES[P.age].name, AGES[E.age].name),
        row('Creatures summoned', String(P.stats.summoned), String(E.stats.summoned)),
        row('Foes slain', String(P.stats.kills), String(E.stats.kills)),
        row('… top / mid / bottom', P.stats.killsByLane.join(' / '), E.stats.killsByLane.join(' / ')),
        row('Gold earned', fmt(P.stats.goldEarned), fmt(E.stats.goldEarned)),
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
    el.append(
      h(
        'div',
        { class: 'vhead' },
        h('div', { class: `verdict ${won ? 'win' : 'lose'}` }, h('div', { class: 'vt', text: won ? 'Victory' : 'Defeat' }), h('div', { class: 'vs', text: won ? 'The enemy citadel has fallen.' : 'Your citadel lies in ruins.' })),
        h('div', { class: 'vportrait' }, portrait(champion.id, 96, me, 1.3), best > 0 ? h('div', { class: 'vcap', text: `Your champion: ${champion.name} ×${best}` }) : null),
      ),
      h('div', { class: 'vtime', text: `Battle length ${fmtTime(world.time)}` }),
      h('div', { class: 'vstats' }, table, history.length >= 3 ? armyChart(history, me, AI_PROFILES[difficulty].name, ageUps) : null),
      h(
        'div',
        { class: 'mrow' },
        this.button('Main menu', 'ghost', () => this.cb.quit()),
        this.button('Change foe', '', () => this.show('difficulty')),
        this.button('Rematch', 'primary', () => this.cb.restart(), ICONS.swords),
      ),
    );
    this.show('over');
  }
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
    h('div', { class: 'tri-arrows', html: '<svg viewBox="0 0 200 120"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ffe7a6"/></marker></defs><path d="M70 28 L 132 28" stroke="#ffe7a6" stroke-width="3" marker-end="url(#ah)" fill="none"/><path d="M150 46 L 112 98" stroke="#ffe7a6" stroke-width="3" marker-end="url(#ah)" fill="none"/><path d="M88 98 L 52 46" stroke="#ffe7a6" stroke-width="3" marker-end="url(#ah)" fill="none"/></svg>' }),
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
    const sx = ((e.clientX - r.left) / r.width) * W;
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
    const px = (x / W) * r.width;
    tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
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
