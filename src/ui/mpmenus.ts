import type { MpClient } from '../net/client.ts';
import { CODE_LENGTH, NAME_MAX, RANKS, SIGILS, cleanCode } from '../net/protocol.ts';
import type { SeatInfo } from '../net/protocol.ts';
import { copyText, h, onTap, setText, toggle } from './dom.ts';
import { ICONS } from './icons.ts';
import { TRIALS, TRIAL_ORDER } from '../sim/data.ts';
import type { TrialId } from '../sim/data.ts';
import { AI_PROFILES, DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';

export interface MpMenuCallbacks {
  sound(kind: string): void;
  /** Leave multiplayer for the title screen. */
  exit(): void;
  rename(name: string): void;
  host(): void;
  join(code: string): void;
  ready(ready: boolean): void;
  /** This player's own handicaps for the next battle. */
  trials(trials: TrialId[]): void;
  /** Versus (null) or co-op against an AI of this difficulty. */
  coop(coop: Difficulty | null): void;
  leaveRoom(): void;
  /** The how-to (Back returns to the room): a guest who came by QR code never saw it. */
  howto(): void;
}

type ButtonFactory = (label: string, cls: string, onClick: () => void, icon?: string) => HTMLButtonElement;

/** After this long without reaching the server, explain how multiplayer is set up. */
const HELP_AFTER = 3500;
/** Room news stays on the message line at least this long (ms) before the next takes it. */
const NEWS_MIN = 2000;

/** The lobby / room message line: how long (ms), calm (news, a tip) or the alarm of an error. */
export interface FlashOptions {
  ms?: number;
  calm?: boolean;
  /** Room news: waits its turn behind other news (see NEWS_MIN). */
  news?: boolean;
}

/** Where the ready-to-run game server (release package) is downloaded. */
const SERVER_DOWNLOAD = 'https://github.com/Zahikusa/mythwar/releases/latest';

/** What each standing means (the seat's tooltip). */
const RANK_NOTE = [
  'Recruit: has not beaten a general yet',
  'Warden: has beaten Puck, the Wandering Spirit',
  'Champion: has beaten Hippolyta, Queen of the Amazons',
  'Warlord: has beaten Odin, the All-Father',
  'Conqueror: has beaten Ares, God of War',
  'Legend: three stars against every general',
];

/**
 * The multiplayer screens: the lobby (name, host, join by code, open battles on this network)
 * and the battle room (room code, invite QR code, both players' readiness).
 */
export class MpScreens {
  /** Open rooms hosted by someone already battled, as last listed (a new one chimes). */
  private friendRooms = new Set<string>();
  /** The network's Hall of champions under the open battles (Lens #86). */
  private hallEl = h('div', { class: 'mphall', role: 'note' });
  private listSeen = false;
  readonly lobby: HTMLElement;
  readonly room: HTMLElement;
  private readonly cb: MpMenuCallbacks;
  private readonly button: ButtonFactory;
  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private status!: HTMLElement;
  /** Reload, beside a status that asks for one (an installed app has no browser button for it). */
  private reloadBtn!: HTMLButtonElement;
  private help!: HTMLElement;
  private list!: HTMLElement;
  private hostBtn!: HTMLButtonElement;
  private joinBtn!: HTMLButtonElement;
  private roomCode!: HTMLElement;
  private invite!: HTMLElement;
  private qr!: HTMLElement;
  private link!: HTMLElement;
  private seats: { el: HTMLElement; name: HTMLElement; side: HTMLElement; rank: HTMLElement; state: HTMLElement; wins: HTMLElement; edit: HTMLInputElement; trials: HTMLElement }[] = [];
  /** My handicap chips in the room, and the trials they currently show. */
  private trialChips: { id: TrialId; el: HTMLButtonElement }[] = [];
  private myTrials: TrialId[] = [];
  /** Battle mode chips (versus / co-op against each AI) and the seats' "VS" / "&". */
  private modeChips: { coop: Difficulty | null; el: HTMLButtonElement }[] = [];
  private vs: HTMLElement | null = null;
  private mySeat = -1;
  private readyBtn!: HTMLButtonElement;
  private roomNote!: HTMLElement;
  private flashes: HTMLElement[] = [];
  private flashTimer = 0;
  /** Room news waiting for the line (see flash), when the last news went up, and its turn's timer. */
  private newsQueue: { text: string; o: FlashOptions }[] = [];
  private newsAt = -Infinity;
  private newsTimer = 0;
  private qrFor = '';
  private offlineSince = 0;
  private iAmReady = false;

  constructor(button: ButtonFactory, cb: MpMenuCallbacks) {
    this.button = button;
    this.cb = cb;
    this.lobby = this.buildLobby();
    this.room = this.buildRoom();
  }

  /** The name field's current value (after the player edited it). */
  get typedName(): string {
    return this.nameInput.value;
  }

  setName(name: string): void {
    this.nameInput.value = name;
  }

  /**
   * A short message on the lobby and room screens (errors such as an unknown room code; `calm`:
   * news or a tip — not the alarm colour of an error).
   */
  flash(text: string, o: FlashOptions = {}): void {
    const now = performance.now();
    // Room news within NEWS_MIN of the last waits its turn: two quick events ("Bo left", "Cy
    // joined") would otherwise cover each other before the first is read.
    if (o.news && (now - this.newsAt < NEWS_MIN || this.newsQueue.length)) {
      this.newsQueue.push({ text, o });
      if (!this.newsTimer) this.newsTimer = window.setTimeout(() => this.nextNews(), Math.max(0, this.newsAt + NEWS_MIN - now));
      return;
    }
    if (o.news) this.newsAt = now;
    else {
      // (An error or a prompt now: news still waiting would cover it — and is old by then.)
      clearTimeout(this.newsTimer);
      this.newsTimer = 0;
      this.newsQueue = [];
    }
    this.showFlash(text, o);
  }

  private showFlash(text: string, o: FlashOptions): void {
    // Only the line on the screen showing gets it: both are alerts, and a message written while
    // both are visible (a fade from the room to the lobby) would be read out twice. (Neither
    // showing — an error on the title — both keep it for whichever opens.)
    const here = this.flashes.filter((f) => f.closest('.screen')?.classList.contains('active'));
    const to = here.length === 1 ? here : this.flashes;
    for (const f of this.flashes) {
      const on = to.includes(f);
      setText(f, on ? text : '');
      f.classList.toggle('show', on);
      f.classList.toggle('calm', !!o.calm);
    }
    clearTimeout(this.flashTimer);
    // (Its time up, the line closes; news still waiting keeps its turn.)
    this.flashTimer = window.setTimeout(() => this.closeFlash(), o.ms ?? 4500);
  }

  /** The line closes — and, once it has, its words leave the accessibility tree too. */
  private closeFlash(): void {
    this.flashes.forEach((f) => f.classList.remove('show'));
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flashes.forEach((f) => f.classList.contains('show') || setText(f, '')), 300);
  }

  private nextNews(): void {
    this.newsTimer = 0;
    const next = this.newsQueue.shift();
    if (!next) return;
    this.newsAt = performance.now();
    this.showFlash(next.text, next.o);
    if (this.newsQueue.length) this.newsTimer = window.setTimeout(() => this.nextNews(), NEWS_MIN);
  }

  /** Clears the line — and news still waiting for it (it was about a room just left). */
  unflash(): void {
    clearTimeout(this.flashTimer);
    clearTimeout(this.newsTimer);
    this.newsTimer = 0;
    this.newsQueue = [];
    this.closeFlash();
  }

  /** Pre-fills the join code (from an invite link). */
  setCode(code: string): void {
    this.codeInput.value = code;
  }

  /** No game server behind this page (static hosting): the lobby only explains how to start one. */
  showNoServer(): void {
    this.lobby.classList.add('noserver');
  }

  // -------------------------------------------------------------------------

  private buildLobby(): HTMLElement {
    this.nameInput = h('input', {
      class: 'mpname',
      type: 'text',
      maxlength: NAME_MAX,
      autocomplete: 'nickname',
      spellcheck: 'false',
      'aria-label': 'Your name',
    }) as HTMLInputElement;
    const commitName = () => this.cb.rename(this.nameInput.value);
    this.nameInput.addEventListener('change', commitName);
    this.nameInput.addEventListener('keydown', (e) => {
      // Enter confirms the name (and must not also press the screen's main button).
      e.stopPropagation();
      if (e.key === 'Enter') this.nameInput.blur();
    });
    this.reloadBtn = this.button('Reload', 'ghost small hidden', () => location.reload());
    this.status = h('div', { class: 'mpstatus', role: 'status', 'aria-live': 'polite' }, h('i'), h('span'), this.reloadBtn);
    this.help = h('div', {
      class: 'mphelp hidden',
      html:
        'Multiplayer needs the <b>game server</b>: on a computer in this Wi-Fi start <b>Mythwar Server</b> (or <code>npm run lan</code>) and open the address it prints — on every device. ' +
        'Check that both devices use the same Wi-Fi (not a guest network) and that the firewall allows Node.js — on Windows also that the Wi-Fi is a <b>Private</b> network, not Public.',
    });
    this.hostBtn = this.button('Host a battle', 'primary big', () => this.cb.host(), ICONS.swords);
    this.codeInput = h('input', {
      class: 'mpcode',
      type: 'text',
      maxlength: CODE_LENGTH + 2,
      placeholder: 'CODE',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      'aria-label': 'Room code',
    }) as HTMLInputElement;
    this.codeInput.addEventListener('input', () => {
      const v = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
      if (v !== this.codeInput.value) this.codeInput.value = v;
      toggle(this.joinBtn, 'primary', !!cleanCode(v));
      this.codeInput.removeAttribute('aria-invalid');
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.tryJoin();
      }
    });
    this.joinBtn = this.button('Join', '', () => this.tryJoin(), ICONS.play);
    this.list = h('div', { class: 'mplist', role: 'list' });
    const noServer = h(
      'div',
      { class: 'mpnoserver' },
      h('b', { text: 'Start the game server on a computer in your Wi-Fi:' }),
      h('ol', {
        html:
          '<li>Download <b>Mythwar Server</b> on a Windows PC, Mac or Linux computer and start it.</li>' +
          '<li>Scan the <b>QR code</b> it shows with each phone — or open the address it prints in any browser.</li>' +
          '<li>There, choose <b>Multiplayer → Host a battle</b>; your friend joins with the room code.</li>',
      }),
      h('div', { class: 'mrow' }, this.button('Download Mythwar Server', 'primary', () => window.open(SERVER_DOWNLOAD, '_blank', 'noopener'))),
      h('div', { class: 'mnote', text: 'Battles against the AI work right here — even offline.' }),
    );
    const back = this.button('Back', 'ghost', () => this.cb.exit());
    return h(
      'div',
      { class: 'screen mp' },
      h('h2', { text: 'Multiplayer' }),
      h('div', { class: 'mpsub', text: 'Battle a friend on the same Wi-Fi — phone, tablet or computer.' }),
      h('label', { class: 'mpnamerow' }, h('span', { text: 'Your name' }), this.nameInput),
      this.status,
      this.makeFlash(),
      // Upright phones show the game rotated, but the keyboard opens upright.
      h('div', { class: 'mprotate', text: 'Tip: turn your phone sideways before typing a name or code.' }),
      this.help,
      noServer,
      h(
        'div',
        { class: 'mpactions' },
        h('div', { class: 'mpcol' }, this.hostBtn, h('div', { class: 'mnote', text: 'Get a room code to share.' })),
        h('div', { class: 'mpor', text: 'or' }),
        h('div', { class: 'mpcol' }, h('div', { class: 'mpjoin' }, this.codeInput, this.joinBtn), h('div', { class: 'mnote', text: 'Enter your friend’s room code.' })),
      ),
      h('div', { class: 'mplisthead', text: 'Open battles on this network' }),
      this.list,
      this.hallEl,
      h('div', { class: 'mrow' }, back),
    );
  }

  private makeFlash(): HTMLElement {
    const f = h('div', { class: 'mpflash', role: 'alert' });
    this.flashes.push(f);
    return f;
  }

  private tryJoin(): void {
    const code = cleanCode(this.codeInput.value);
    if (!code) {
      this.cb.sound('error');
      // (In words too — a shake and a sound say nothing to a screen reader, or to a player who
      // typed an O for a 0.)
      this.codeInput.setAttribute('aria-invalid', 'true');
      this.flash(`A room code is ${CODE_LENGTH} letters and digits, as the host's screen shows it (no O, I, L, S, Z, 0, 1, 2 or 5).`);
      this.codeInput.focus();
      this.codeInput.classList.remove('shake');
      void this.codeInput.offsetWidth;
      this.codeInput.classList.add('shake');
      return;
    }
    this.cb.join(code);
  }

  private buildRoom(): HTMLElement {
    // (Read with the visible "Room code" label beside it; an aria-label on a plain div is ignored.)
    this.roomCode = h('div', { class: 'rcode' });
    this.qr = h('div', { class: 'rqr', 'aria-hidden': 'true' });
    this.link = h('div', { class: 'rlink' });
    // On a desktop the invite is easier to paste into a chat than to read off the screen.
    const copy = this.button('Copy link', 'ghost small rcopy', () => {
      void copyText(this.qrFor).then((ok) => (copy.querySelector('span')!.textContent = ok ? 'Copied!' : 'Copy failed'));
    });
    this.invite = h(
      'div',
      { class: 'rinvite' },
      this.qr,
      h('div', { class: 'rinvtext' }, h('b', { text: 'Invite a friend' }), h('span', { text: 'Scan the code with the other phone’s camera — or open this address there and enter the room code:' }), this.link, copy),
    );
    const seatsBox = h('div', { class: 'rseats' });
    for (let i = 0; i < 2; i++) {
      const name = h('div', { class: 'sname' });
      // (No "left / right" here: in battle everyone sees their own citadel on the left.)
      // ...but each player's standing (Lens #80): how far their own journey has taken them.
      const rank = h('b', { class: 'srank' });
      const side = h('div', { class: 'sside' }, i === 0 ? 'Host' : 'Guest', rank);
      const state = h('div', { class: 'sstate' });
      const wins = h('div', { class: 'swins' });
      const trials = h('div', { class: 'strials' });
      // Your own name can be changed right here (tap it).
      const edit = h('input', { class: 'mpname sedit hidden', type: 'text', maxlength: NAME_MAX, spellcheck: 'false', 'aria-label': 'Your name' }) as HTMLInputElement;
      const done = () => {
        if (edit.classList.contains('hidden')) return;
        edit.classList.add('hidden');
        name.classList.remove('hidden');
        if (edit.value.trim() && edit.value !== this.nameInput.value) this.cb.rename(edit.value);
      };
      edit.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done();
        else if (e.key === 'Escape') {
          edit.value = this.nameInput.value;
          done();
        }
      });
      edit.addEventListener('blur', done);
      const startEdit = () => {
        if (this.mySeat !== i) return;
        // (Upright phones show the game rotated but open the keyboard upright — the lobby's tip
        // says so, and a guest who came by QR code never saw the lobby.)
        if (name.closest('#stage')?.classList.contains('rotated')) this.flash('Tip: turn your phone sideways to type — the keyboard opens upright.', { calm: true });
        edit.value = this.nameInput.value;
        name.classList.add('hidden');
        edit.classList.remove('hidden');
        edit.focus();
        edit.select();
      };
      onTap(name, startEdit);
      // (Your own name is a button for the keyboard too — see renderSeat.)
      name.addEventListener('keydown', (e) => {
        if (this.mySeat !== i || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        startEdit();
      });
      const el = h('div', { class: 'rseat' }, name, edit, side, state, wins, trials);
      this.seats.push({ el, name, side, rank, state, wins, edit, trials });
      seatsBox.appendChild(el);
      if (i === 0) {
        this.vs = h('div', { class: 'rvs', text: 'VS' });
        seatsBox.appendChild(this.vs);
      }
    }
    this.readyBtn = this.button('Ready', 'primary big', () => this.cb.ready(!this.iAmReady), ICONS.swords);
    // Battle mode: against each other, or together against an AI.
    const mode = h('div', { class: 'trials rmode' }, h('span', { class: 'tlabel', text: 'Battle:' }));
    const modeChip = (label: string, coop: Difficulty | null, title: string) => {
      const chip = h('button', { class: 'trial', title, 'aria-pressed': 'false' }, label) as HTMLButtonElement;
      onTap(chip, () => {
        this.cb.sound('select');
        this.cb.coop(coop);
      });
      this.modeChips.push({ coop, el: chip });
      mode.appendChild(chip);
    };
    modeChip('Versus', null, 'The two of you fight each other');
    mode.appendChild(h('span', { class: 'tlabel', text: 'Together vs' }));
    for (const d of DIFFICULTIES) modeChip(AI_PROFILES[d].name, d, `Co-op: share one citadel and its gold against the ${AI_PROFILES[d].name} AI`);
    // Handicaps: the stronger friend can take trials so the other has a real chance.
    const handicap = h('div', { class: 'trials rtrials' }, h('span', { class: 'tlabel', text: 'Your handicap:' }));
    for (const id of TRIAL_ORDER) {
      const chip = h('button', { class: 'trial', title: TRIALS[id].blurb, 'aria-pressed': 'false' }, TRIALS[id].name) as HTMLButtonElement;
      onTap(chip, () => {
        const set = new Set(this.myTrials);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        this.cb.sound('select');
        this.cb.trials(TRIAL_ORDER.filter((x) => set.has(x)));
      });
      this.trialChips.push({ id, el: chip });
      handicap.appendChild(chip);
    }
    // (A status: "Bo is ready — press Ready to begin!" is read out as it changes.)
    this.roomNote = h('div', { class: 'mnote rnote', role: 'status' });
    const leave = this.button('Leave room', 'ghost', () => this.cb.leaveRoom());
    const howto = this.button('How to play', 'ghost', () => this.cb.howto(), ICONS.info);
    return h(
      'div',
      { class: 'screen room' },
      h('div', { class: 'rhead' }, h('h2', { text: 'Battle room' }), h('div', { class: 'rcodebox' }, h('span', { text: 'Room code' }), this.roomCode)),
      this.invite,
      seatsBox,
      mode,
      handicap,
      this.makeFlash(),
      this.roomNote,
      h('div', { class: 'mrow' }, leave, howto, this.readyBtn),
    );
  }

  /** Refreshes both screens from the session state. `inviteUrl` = link for the other device. */
  update(c: MpClient, inviteUrl: (code: string) => string, record: (foe: string) => { w: number; l: number } | null = () => null): void {
    // Lobby: connection state.
    const now = performance.now();
    const online = c.state === 'online' && c.welcomed;
    if (online) this.offlineSince = 0;
    else if (!this.offlineSince) this.offlineSince = now;
    const stuck = !online && now - this.offlineSince > HELP_AFTER;
    const old = c.versionMismatch || c.replaced;
    this.status.className = `mpstatus ${online ? 'ok' : stuck || old ? 'bad' : 'wait'}`;
    toggle(this.reloadBtn, 'hidden', !old);
    setText(
      this.status.querySelector('span')!,
      c.replaced
        ? 'You’re playing in another tab or window now — reload here to play here'
        : old
          ? 'The game server runs another version — reload this page'
          : online
            ? 'Connected — ready to battle'
            : stuck
              ? 'Can’t reach the game server — still trying…'
              : 'Connecting to the game server…',
    );
    toggle(this.help, 'hidden', !stuck || old);
    this.hostBtn.disabled = !online;
    this.joinBtn.disabled = !online;

    // Lobby: open battles.
    // Someone you have battled before is recognised (Lens #84): listed first, warmly, with your
    // record together — and a chime when their battle appears.
    const rooms = c.openRooms
      .map((r) => {
        const rec = record(r.host);
        return { ...r, rec: rec && rec.w + rec.l > 0 ? rec : null };
      })
      .sort((a, b) => Number(!!b.rec) - Number(!!a.rec));
    // (Online or not is part of it: the empty list says "None yet…" only once connected.)
    const sig = `${online}|` + rooms.map((r) => `${r.code}${r.host}${r.rank}${r.sigil}${r.rec ? `${r.rec.w}-${r.rec.l}` : ''}`).join('|');
    if (this.list.dataset.sig !== sig || !this.list.childElementCount) {
      this.list.dataset.sig = sig;
      this.list.innerHTML = '';
      if (!rooms.length) {
        this.list.appendChild(h('div', { class: 'mpempty', text: online ? 'None yet. Host one — or wait here and your friend’s battle will appear.' : '—' }));
      }
      for (const r of rooms) {
        const join = this.button('Join', 'primary', () => this.cb.join(r.code), ICONS.play);
        // (A list of "Join, Join, Join" says nothing to a screen reader.)
        join.setAttribute('aria-label', `Join ${r.host}’s battle (room ${r.code})`);
        const meta = `${RANKS[r.rank] ?? RANKS[0]} · Room ${r.code}`;
        const host = h('div', { class: 'mphost' }, h('b', { text: r.sigil >= 0 && SIGILS[r.sigil] ? `${SIGILS[r.sigil]} ${r.host}` : r.host }), h('span', { text: r.rec ? `${meta} · you ${r.rec.w} – ${r.rec.l}` : meta }));
        this.list.appendChild(h('div', { class: `mproom${r.rec ? ' friend' : ''}`, role: 'listitem', title: r.rec ? `You have battled ${r.host} before` : '' }, h('i', { html: ICONS.swords }), host, join));
      }
      const friends = rooms.filter((r) => r.rec).map((r) => r.code);
      if (this.listSeen && friends.some((code) => !this.friendRooms.has(code))) this.cb.sound('ready');
      this.friendRooms = new Set(friends);
      this.listSeen = true;
    }

    // The Hall of champions: who has won the most battles on this server (hidden until someone has).
    const hall = c.hall.filter((e) => e.w > 0 || e.coop > 0);
    const hallText = hall.map((e) => `${e.sigil >= 0 ? `${SIGILS[e.sigil] ?? ''} ` : ''}${e.name} ${e.w}–${e.l}${e.coop ? ` (+${e.coop} co-op)` : ''}`).join(' · ');
    if (this.hallEl.dataset.text !== hallText) {
      this.hallEl.dataset.text = hallText;
      this.hallEl.innerHTML = '';
      if (hallText) this.hallEl.append(h('b', { text: 'Champions of this network: ' }), hallText);
      this.hallEl.title = hall.length ? 'Battles won and lost on this game server' : '';
    }

    // Room.
    const room = c.room;
    if (!room || c.seat === null) return;
    setText(this.roomCode, room.code);
    const me = c.seat;
    const foe = room.seats[me === 0 ? 1 : 0];
    const url = inviteUrl(room.code);
    toggle(this.invite, 'hidden', !!foe);
    if (!foe && this.qrFor !== url) {
      this.qrFor = url;
      this.qr.innerHTML = '';
      // (No QR if its code can't load — say, the server was updated under an open page: the link is there.)
      qrSvg(url).then(
        (svg) => {
          if (this.qrFor === url) this.qr.innerHTML = svg;
        },
        () => {},
      );
      setText(this.link, url.replace(/^https?:\/\//, ''));
    }
    this.mySeat = me;
    room.seats.forEach((s, i) => this.renderSeat(i, s, i === me));
    for (const m of this.modeChips) {
      const on = m.coop === room.coop;
      m.el.classList.toggle('on', on);
      m.el.setAttribute('aria-pressed', String(on));
    }
    if (this.vs) setText(this.vs, room.coop ? '&' : 'VS');
    // Your all-time record against this opponent (by name), under their seat.
    if (foe) {
      const r = record(foe.name);
      const v = this.seats[me === 0 ? 1 : 0];
      // (Co-op: the two are allies — their victories are shared, not a score between them.)
      const inRoom = room.coop ? (foe.wins ? `Victories together: ${foe.wins}` : '') : foe.wins || room.seats[me]?.wins ? `${room.seats[me]?.wins ?? 0} – ${foe.wins} here` : '';
      const ever = !room.coop && r && r.w + r.l > 0 ? `you ${r.w} – ${r.l} overall` : '';
      setText(v.wins, [inRoom, ever].filter(Boolean).join(' · '));
      // (Co-op: the shared count shows once, under the ally — not again as "2 wins" under you.)
      if (room.coop && me !== null) setText(this.seats[me].wins, '');
    }
    this.iAmReady = !!room.seats[me]?.ready;
    setText(this.readyBtn.querySelector('span')!, this.iAmReady ? 'Not ready' : 'Ready');
    toggle(this.readyBtn, 'primary', !this.iAmReady);
    this.readyBtn.disabled = !foe || !online || room.phase === 'playing';
    // (Why it can't be pressed — for a hover and for screen readers, not only the note below.)
    const why = room.phase === 'playing' ? 'The battle is under way' : !online ? 'Connecting to the game server…' : !foe ? 'Waits for a second player to join' : '';
    if (this.readyBtn.title !== why) {
      this.readyBtn.title = why;
      if (why) this.readyBtn.setAttribute('aria-description', why);
      else this.readyBtn.removeAttribute('aria-description');
    }
    let note: string;
    if (!online) note = 'Reconnecting…';
    else if (!foe) note = 'Waiting for a second player to join…';
    else if (!foe.connected) note = `${foe.name} lost the connection — waiting for them to come back.`;
    else if (this.iAmReady && foe.ready) note = 'Starting…';
    else if (this.iAmReady) note = `Waiting for ${foe.name} to get ready…`;
    else if (foe.ready) note = `${foe.name} is ready — press Ready to begin!`;
    else note = room.coop ? `Together against the ${AI_PROFILES[room.coop].name} AI: one citadel, one purse — the battle starts when both are ready.` : 'The battle starts when both players are ready.';
    setText(this.roomNote, note);
    toggle(this.roomNote, 'hot', !!foe?.ready && !this.iAmReady);
  }

  private renderSeat(i: number, s: SeatInfo | null, mine: boolean): void {
    const v = this.seats[i];
    toggle(v.el, 'empty', !s);
    toggle(v.el, 'mine', mine);
    toggle(v.el, 'ready', !!s?.ready);
    // (The sigil a player chose, as in the lobby list and on their keep.)
    const sigil = s && s.sigil >= 0 && SIGILS[s.sigil] ? `${SIGILS[s.sigil]} ` : '';
    // (A no-break space before the pencil: a long name wraps without leaving it alone on a line.)
    setText(v.name, s ? sigil + s.name + (mine ? ' (you) ✎' : '') : 'Open seat');
    v.name.title = mine ? 'Tap to change your name' : '';
    if (mine) {
      v.name.setAttribute('role', 'button');
      v.name.tabIndex = 0;
      v.name.setAttribute('aria-label', `Your name: ${s?.name ?? ''} — change it`);
    } else {
      v.name.removeAttribute('role');
      v.name.removeAttribute('tabindex');
      v.name.removeAttribute('aria-label');
    }
    setText(v.rank, s ? ` · ${RANKS[s.rank] ?? RANKS[0]}` : '');
    v.rank.dataset.rank = String(s?.rank ?? 0);
    v.side.title = s ? RANK_NOTE[s.rank] ?? '' : '';
    const ping = s?.connected && s.ping ? ` · ${s.ping} ms` : '';
    setText(v.state, (!s ? 'Waiting for a player…' : !s.connected ? 'Connecting…' : s.ready ? 'Ready!' : 'Not ready') + ping);
    // A weak link shows before the battle: amber / red ping.
    v.state.dataset.q = !s?.connected || !s.ping ? '' : s.ping > 250 ? 'bad' : s.ping > 120 ? 'ok' : 'good';
    setText(v.wins, s && s.wins ? `${s.wins} ${s.wins === 1 ? 'win' : 'wins'}` : '');
    const trials = s?.trials ?? [];
    setText(v.trials, trials.length ? `Handicap: ${trials.map((t) => TRIALS[t].name).join(', ')}` : '');
    if (mine) {
      this.myTrials = trials;
      for (const c of this.trialChips) {
        const on = trials.includes(c.id);
        c.el.classList.toggle('on', on);
        c.el.setAttribute('aria-pressed', String(on));
      }
    }
  }
}

/**
 * An SVG QR code (dark on white with a quiet zone) for `text`. The QR library (a twentieth of
 * the game's code) loads on demand: only a host waiting for a guest needs it.
 */
export async function qrSvg(text: string): Promise<string> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
}

/** Two-word fantasy names for players who haven't picked one. */
export function randomName(): string {
  const a = ['Swift', 'Bold', 'Silver', 'Golden', 'Storm', 'Iron', 'Wild', 'Moon', 'Ember', 'Frost', 'Jade', 'Star'];
  const b = ['Griffin', 'Kitsune', 'Titan', 'Valkyrie', 'Centaur', 'Phoenix', 'Fenrir', 'Oni', 'Pixie', 'Gorgon', 'Treant', 'Dragon'];
  const pick = (l: string[]) => l[Math.floor(Math.random() * l.length)];
  const name = `${pick(a)} ${pick(b)}`;
  return name.length <= NAME_MAX ? name : pick(b);
}
