import type { NetGame } from '../net/netgame.ts';
import { fmtTime, h, onTap, setText, toggle } from './dom.ts';

/**
 * What a networked battle needs to tell the player on top of the battlefield: the countdown
 * before the first blow (and after a pause), that the opponent is away and for how long they
 * may be, and that our own connection is being restored.
 */
export class NetOverlay {
  readonly root: HTMLDivElement;
  private readonly count: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly srSub: HTMLElement;
  private readonly claimBtn: HTMLButtonElement;
  private lastCount = '';
  private fightUntil = 0;
  private countEnd = 0;
  /** Something is showing (coach tips keep out of the way). */
  get busy(): boolean {
    return this.banner.classList.contains('show') || this.count.classList.contains('show');
  }

  /** Countdown ticks and "Fight!" (sound / vibration). */
  onBeat: (final: boolean) => void = () => {};
  /** The player takes the win (the opponent has been away long enough). */
  onClaim: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.count = h('div', { class: 'ncount', 'aria-live': 'assertive' });
    this.title = h('div', { class: 'nbtitle' });
    // (The sub-line counts down every second: screen readers get a steady wording instead.)
    this.sub = h('div', { class: 'nbsub', 'aria-hidden': 'true' });
    this.srSub = h('span', { class: 'sronly' });
    this.claimBtn = h('button', { class: 'mbtn primary nclaim hidden', text: 'Claim victory' });
    onTap(this.claimBtn, () => this.onClaim());
    this.banner = h('div', { class: 'nbanner', role: 'status', 'aria-live': 'polite' }, h('i', { class: 'nspin' }), h('div', null, this.title, this.sub, this.srSub), this.claimBtn);
    this.root = h('div', { class: 'netoverlay hidden' }, this.count, this.banner);
    parent.appendChild(this.root);
  }

  update(game: NetGame | null, now: number): void {
    toggle(this.root, 'hidden', !game);
    if (!game) {
      this.lastCount = '';
      return;
    }
    // Countdown: 3, 2, 1… then "Fight!" for a moment.
    let text = '';
    if (game.countdownEnd > now && !game.over) {
      this.countEnd = game.countdownEnd;
      text = String(Math.ceil((game.countdownEnd - now) / 1000));
    } else if (this.countEnd && now >= this.countEnd && !game.paused) {
      this.fightUntil = now + 900;
      this.countEnd = 0;
    }
    if (!text && now < this.fightUntil && !game.over) text = game.world.time < 1 ? 'Fight!' : 'Go!';
    if (text !== this.lastCount) {
      this.lastCount = text;
      setText(this.count, text);
      toggle(this.count, 'show', !!text);
      toggle(this.count, 'go', !!text && !/^\d$/.test(text));
      if (text) {
        // Restart the pop animation for each number.
        this.count.classList.remove('pop');
        void this.count.offsetWidth;
        this.count.classList.add('pop');
        this.onBeat(!/^\d$/.test(text));
      }
    }

    // Status banner.
    let title = '';
    let sub = '';
    let srSub = '';
    let claim = false;
    const pause = game.netPause;
    if (game.over) {
      // nothing
    } else if (!game.online) {
      title = 'Connection lost';
      sub = 'Reconnecting to the game server…';
    } else if (game.syncing) {
      title = 'Re-syncing the battle…';
    } else if (pause?.reason === 'away' && pause.seat !== game.seat) {
      const waited = (now - game.netPauseAt) / 1000;
      const left = Math.max(0, (pause.forfeitIn ?? 0) - waited);
      title = `${game.foeName} is away`;
      // Waited long enough: no need to sit out the whole timer.
      claim = pause.claimIn !== undefined && waited >= pause.claimIn;
      sub = `Their app is in the background or lost the Wi-Fi. The battle waits — if they aren’t back in ${fmtTime(left)}, you win${claim ? ', or claim the victory now' : ''}.`;
      srSub = `Their app is in the background or lost the Wi-Fi. The battle waits — if they don’t come back in time, you win${claim ? '. You may claim the victory now' : ''}.`;
    } else if (pause?.reason === 'away') {
      title = 'Rejoining the battle…';
    }
    setText(this.title, title);
    setText(this.sub, sub);
    setText(this.srSub, srSub || sub);
    toggle(this.banner, 'show', !!title);
    toggle(this.claimBtn, 'hidden', !claim);
  }
}
