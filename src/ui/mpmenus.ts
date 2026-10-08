import qrcode from 'qrcode-generator';
import type { MpClient } from '../net/client.ts';
import { CODE_LENGTH, NAME_MAX, cleanCode } from '../net/protocol.ts';
import type { SeatInfo } from '../net/protocol.ts';
import { h, onTap, setText, toggle } from './dom.ts';
import { ICONS } from './icons.ts';

export interface MpMenuCallbacks {
  sound(kind: string): void;
  /** Leave multiplayer for the title screen. */
  exit(): void;
  rename(name: string): void;
  host(): void;
  join(code: string): void;
  ready(ready: boolean): void;
  leaveRoom(): void;
}

type ButtonFactory = (label: string, cls: string, onClick: () => void, icon?: string) => HTMLButtonElement;

/** After this long without reaching the server, explain how multiplayer is set up. */
const HELP_AFTER = 3500;

/** Where the ready-to-run game server (release package) is downloaded. */
const SERVER_DOWNLOAD = 'https://github.com/Zahikusa/mythwar/releases/latest';

/**
 * The multiplayer screens: the lobby (name, host, join by code, open battles on this network)
 * and the battle room (room code, invite QR code, both players' readiness).
 */
export class MpScreens {
  readonly lobby: HTMLElement;
  readonly room: HTMLElement;
  private readonly cb: MpMenuCallbacks;
  private readonly button: ButtonFactory;
  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private status!: HTMLElement;
  private help!: HTMLElement;
  private list!: HTMLElement;
  private hostBtn!: HTMLButtonElement;
  private joinBtn!: HTMLButtonElement;
  private roomCode!: HTMLElement;
  private invite!: HTMLElement;
  private qr!: HTMLElement;
  private link!: HTMLElement;
  private seats: { el: HTMLElement; name: HTMLElement; side: HTMLElement; state: HTMLElement; wins: HTMLElement; edit: HTMLInputElement }[] = [];
  private mySeat = -1;
  private readyBtn!: HTMLButtonElement;
  private roomNote!: HTMLElement;
  private flashes: HTMLElement[] = [];
  private flashTimer = 0;
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

  /** A short message on the lobby and room screens (errors such as an unknown room code). */
  flash(text: string): void {
    for (const f of this.flashes) {
      setText(f, text);
      f.classList.add('show');
    }
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flashes.forEach((f) => f.classList.remove('show')), 4500);
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
    this.status = h('div', { class: 'mpstatus', role: 'status', 'aria-live': 'polite' }, h('i'), h('span'));
    this.help = h('div', {
      class: 'mphelp hidden',
      html:
        'Multiplayer needs the <b>game server</b>: on a computer in this Wi-Fi start <b>Mythwar Server</b> (or <code>npm run lan</code>) and open the address it prints — on every device. ' +
        'Check that both devices use the same Wi-Fi (not a guest network) and that the firewall allows Node.js on private networks.',
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
      this.codeInput.focus();
      this.codeInput.classList.remove('shake');
      void this.codeInput.offsetWidth;
      this.codeInput.classList.add('shake');
      return;
    }
    this.cb.join(code);
  }

  private buildRoom(): HTMLElement {
    this.roomCode = h('div', { class: 'rcode', 'aria-label': 'Room code' });
    this.qr = h('div', { class: 'rqr', 'aria-hidden': 'true' });
    this.link = h('div', { class: 'rlink' });
    this.invite = h(
      'div',
      { class: 'rinvite' },
      this.qr,
      h('div', { class: 'rinvtext' }, h('b', { text: 'Invite a friend' }), h('span', { text: 'Scan the code with the other phone’s camera — or open this address there and enter the room code:' }), this.link),
    );
    const seatsBox = h('div', { class: 'rseats' });
    for (let i = 0; i < 2; i++) {
      const name = h('div', { class: 'sname' });
      // (No "left / right" here: in battle everyone sees their own citadel on the left.)
      const side = h('div', { class: 'sside', text: i === 0 ? 'Host' : 'Guest' });
      const state = h('div', { class: 'sstate' });
      const wins = h('div', { class: 'swins' });
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
      onTap(name, () => {
        if (this.mySeat !== i) return;
        edit.value = this.nameInput.value;
        name.classList.add('hidden');
        edit.classList.remove('hidden');
        edit.focus();
        edit.select();
      });
      const el = h('div', { class: 'rseat' }, name, edit, side, state, wins);
      this.seats.push({ el, name, side, state, wins, edit });
      seatsBox.appendChild(el);
      if (i === 0) seatsBox.appendChild(h('div', { class: 'rvs', text: 'VS' }));
    }
    this.readyBtn = this.button('Ready', 'primary big', () => this.cb.ready(!this.iAmReady), ICONS.swords);
    this.roomNote = h('div', { class: 'mnote rnote' });
    const leave = this.button('Leave room', 'ghost', () => this.cb.leaveRoom());
    return h(
      'div',
      { class: 'screen room' },
      h('div', { class: 'rhead' }, h('h2', { text: 'Battle room' }), h('div', { class: 'rcodebox' }, h('span', { text: 'Room code' }), this.roomCode)),
      this.invite,
      seatsBox,
      this.makeFlash(),
      this.roomNote,
      h('div', { class: 'mrow' }, leave, this.readyBtn),
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
    setText(
      this.status.lastElementChild!,
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
    const rooms = c.openRooms;
    const sig = rooms.map((r) => r.code + r.host).join('|');
    if (this.list.dataset.sig !== sig || !this.list.childElementCount) {
      this.list.dataset.sig = sig;
      this.list.innerHTML = '';
      if (!rooms.length) {
        this.list.appendChild(h('div', { class: 'mpempty', text: online ? 'None yet. Host one — or wait here and your friend’s battle will appear.' : '—' }));
      }
      for (const r of rooms) {
        const join = this.button('Join', 'primary', () => this.cb.join(r.code), ICONS.play);
        this.list.appendChild(h('div', { class: 'mproom', role: 'listitem' }, h('i', { html: ICONS.swords }), h('div', { class: 'mphost' }, h('b', { text: r.host }), h('span', { text: `Room ${r.code}` })), join));
      }
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
      this.qr.innerHTML = qrSvg(url);
      setText(this.link, url.replace(/^https?:\/\//, ''));
    }
    this.mySeat = me;
    room.seats.forEach((s, i) => this.renderSeat(i, s, i === me));
    // Your all-time record against this opponent (by name), under their seat.
    if (foe) {
      const r = record(foe.name);
      const v = this.seats[me === 0 ? 1 : 0];
      const inRoom = foe.wins || room.seats[me]?.wins ? `${room.seats[me]?.wins ?? 0} – ${foe.wins} here` : '';
      const ever = r && r.w + r.l > 0 ? `you ${r.w} – ${r.l} overall` : '';
      setText(v.wins, [inRoom, ever].filter(Boolean).join(' · '));
    }
    this.iAmReady = !!room.seats[me]?.ready;
    setText(this.readyBtn.querySelector('span')!, this.iAmReady ? 'Not ready' : 'Ready');
    toggle(this.readyBtn, 'primary', !this.iAmReady);
    this.readyBtn.disabled = !foe || !online || room.phase === 'playing';
    let note: string;
    if (!online) note = 'Reconnecting…';
    else if (!foe) note = 'Waiting for a second player to join…';
    else if (!foe.connected) note = `${foe.name} lost the connection — waiting for them to come back.`;
    else if (this.iAmReady && foe.ready) note = 'Starting…';
    else if (this.iAmReady) note = `Waiting for ${foe.name} to get ready…`;
    else if (foe.ready) note = `${foe.name} is ready — press Ready to begin!`;
    else note = 'The battle starts when both players are ready.';
    setText(this.roomNote, note);
    toggle(this.roomNote, 'hot', !!foe?.ready && !this.iAmReady);
  }

  private renderSeat(i: number, s: SeatInfo | null, mine: boolean): void {
    const v = this.seats[i];
    toggle(v.el, 'empty', !s);
    toggle(v.el, 'mine', mine);
    toggle(v.el, 'ready', !!s?.ready);
    setText(v.name, s ? s.name + (mine ? ' (you) ✎' : '') : 'Open seat');
    v.name.title = mine ? 'Tap to change your name' : '';
    const ping = s?.connected && s.ping ? ` · ${s.ping} ms` : '';
    setText(v.state, (!s ? 'Waiting for a player…' : !s.connected ? 'Connecting…' : s.ready ? 'Ready!' : 'Not ready') + ping);
    // A weak link shows before the battle: amber / red ping.
    v.state.dataset.q = !s?.connected || !s.ping ? '' : s.ping > 250 ? 'bad' : s.ping > 120 ? 'ok' : 'good';
    setText(v.wins, s && s.wins ? `${s.wins} ${s.wins === 1 ? 'win' : 'wins'}` : '');
  }
}

/** An SVG QR code (dark on white with a quiet zone) for `text`. */
export function qrSvg(text: string): string {
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
