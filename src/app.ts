import { Audio } from './audio/audio.ts';
import { Game } from './game.ts';
import { puzzleById } from './sim/puzzles.ts';
import { Chronicle } from './ui/chronicle.ts';
import { DIFFICULTIES } from './ai/ai.ts';
import type { SimEvent } from './sim/types.ts';
import type { Difficulty } from './ai/ai.ts';
import { Input } from './input.ts';
import { Pads } from './gamepad.ts';
import type { MenuMove } from './gamepad.ts';
import { detectMode } from './render/layout.ts';
import type { LayoutMode } from './render/layout.ts';
import { Renderer } from './render/renderer.ts';
import { Coach } from './ui/coach.ts';
import { Hud, RAG_WARN } from './ui/hud.ts';
import { Menus } from './ui/menus.ts';
import { addJournal, battleStars, loadSettings, mergeFromOtherTab, onlineRecord, parTime, recordOnline, recordResult, saveSettings, playerLabel } from './ui/settings.ts';
import { clearBattle, loadBattle, saveBattle } from './save.ts';
import { AGES, UNITS } from './sim/data.ts';
import { fmtTime } from './ui/dom.ts';
import type { JournalEntry, Settings } from './ui/settings.ts';
import { MpClient, hasStoredSession } from './net/client.ts';
import { hasMpServer } from './net/connection.ts';
import { NetGame } from './net/netgame.ts';
import { EMOTES, SIGILS, cleanCode, cleanName, emoteLane } from './net/protocol.ts';
import { randomName } from './ui/mpmenus.ts';
import { FeatTracker, MAX_STARS, PINNACLE, playerRank, starTotal } from './ui/feats.ts';

/** Questions the sandbox opens with: match-ups worth staging. */
const SANDBOX_PROMPTS = [
  'Can five pack-hunting Redcaps bring down a Treant Warden?',
  'How many Pixies does it take to hold a lane against Centaurs?',
  'Does a frozen army fall faster? Try Fimbulwinter, then charge',
  'Who wins: one Elder Dragon, or its gold in Griffins?',
  'Will a Phoenix outlast a Fenrir Wolf twice over?',
  'Hold a lane at its shrine, gather ten creatures, then let them loose',
  'Which turret stops a Kitsune pack: bolt or blast?',
];
import { JOURNEY, PERSONAS, tauntLine } from './ui/personas.ts';
import { Sitting } from './ui/wellbeing.ts';
import type { TauntEvent } from './ui/personas.ts';
import { NetOverlay } from './ui/netoverlay.ts';
import { emoteRoute, lostSessionPlan, roomNews, roomView } from './ui/roomnews.ts';
import type { RoomView } from './ui/roomnews.ts';

type AppState = 'title' | 'playing' | 'over';

/**
 * Top-level controller: owns the canvas, renderer, HUD, menus and the active game.
 * The title screen runs an AI-vs-AI battle in the background.
 */
/** How long the player's god power slows time (seconds, real time). */
const SLOWMO = 0.6;

/** " · 2 pauses left" for the online pause screen (Lens #87). */
function pausesNote(left: number): string {
  return left <= 0 ? ' · you have no pauses left' : ` · you have ${left} ${left === 1 ? 'pause' : 'pauses'} left`;
}

export class App {
  readonly root: HTMLElement;
  readonly stage: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly input: Input;
  readonly menus: Menus;
  readonly settings: Settings;
  readonly audio = new Audio();
  readonly coach: Coach;
  game: Game | null = null;
  state: AppState = 'title';
  mode: LayoutMode = 'desktop';
  /** True when a portrait phone screen is shown rotated into landscape. */
  rotated = false;
  width = 0;
  height = 0;
  private difficulty: Difficulty;
  private last = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private overTimer = -1;
  /** Seconds of the god power's slow-motion left. */
  private slowmo = 0;
  /** The battle's story so far (Lens #65), shown on the results. */
  private chronicle: Chronicle | null = null;
  /** Seconds to the next heartbeat while the citadel is in danger. */
  private beatIn = 0;
  /** Gamepads (Lens #54) and the menu button they have highlighted. */
  private pads: Pads;
  private padFocus: HTMLElement | null = null;
  private coinTarget: [number, number] | null = null;
  private coinsSeen = 0;
  private lastSave = 0;
  private lastBuzz = -10;
  /** Star goals already announced as slipping (citadel below half) / gone (par time passed). */
  private starWarned = { half: false, par: false };
  /** The AI general's lines: how many so far (to rotate them), when the last one was, and the
   *  one-off moments already used (losing / winning). */
  private taunts = { n: 0, at: -100, said: new Set<TauntEvent>(), heldShrine: [false, false, false] };
  /** Time in battle this sitting and the break notes said (Lens #98). */
  private readonly sitting = new Sitting();
  /** Feats earned in the current battle (null until one starts). */
  private feats: FeatTracker | null = null;
  private slowSeconds = 0;
  private autoLowDone = false;
  private params = new URLSearchParams(location.search);
  /** Multiplayer session while the player is in the multiplayer screens or an online battle. */
  mp: MpClient | null = null;
  private mpOff: (() => void) | null = null;
  readonly netOverlay: NetOverlay;
  /** Room code to join once connected (invite link). */
  private pendingJoin: string | null = null;
  /** A history entry is pushed for the phone's Back button (see the constructor). */
  private backArmed = false;
  /** Reconnecting after a reload: only show multiplayer if we turn out to be in a room. */
  private quietResume = false;
  private wakeLock: { release(): Promise<void> } | null = null;
  private wakePending = false;
  /** Whether the screen should stay awake now (a lock that arrives after this turned false is let go). */
  private wakeWanted = false;
  /** Online: the pause menu was opened just on this device (the battle was already held). */
  private netMenuLocal = false;
  /** The battle room as last seen (null: none) — room chimes, and what the other player changed. */
  private lastRoom: RoomView | null = null;
  /** When this player last changed the room's mode (their own change needs no telling). */
  private ownCoopAt = -Infinity;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    this.difficulty = this.settings.difficulty;
    this.stage = document.createElement('div');
    this.stage.id = 'stage';
    root.appendChild(this.stage);
    this.canvas = document.createElement('canvas');
    this.stage.appendChild(this.canvas);
    this.renderer = new Renderer(this.canvas);
    this.renderer.onRout = (n) => {
      if (this.state !== 'playing' || this.game?.options.demo) return;
      this.audio.ui(n >= 9 ? 'rout9' : n >= 6 ? 'rout6' : 'rout');
      this.buzz(n >= 6 ? [20, 30, 20, 30, 40] : [20, 30, 30]);
    };
    this.hud = new Hud(this.stage, {
      pause: () => this.pause(),
      sound: (k) => {
        this.audio.ui(k);
        if (k === 'summon') this.buzz(8);
        else if (k === 'power') this.buzz([20, 30, 40]);
        else if (k === 'error') this.buzz([6, 40, 6]);
      },
      toggleMute: () => {
        this.settings.muted = !this.settings.muted;
        this.applySettings(this.settings);
        return this.settings.muted;
      },
      isMuted: () => this.settings.muted,
      emote: (id) => {
        if (!this.mp?.emote(id)) return false;
        // A lane call flashes that lane here too, so the caller sees what they pointed at.
        if (emoteLane(id) >= 0) this.renderer.pingLane(emoteLane(id));
        return true;
      },
      speedChanged: (speed) => {
        this.settings.speed = speed;
        saveSettings(this.settings);
      },
    });
    this.input = new Input(this.canvas, this.renderer, this.hud);
    // Coach tips live in the HUD layer: above lane tabs, below card tooltips.
    this.coach = new Coach(this.stage, this.settings, this.hud.root);
    this.input.onPause = () => this.escape();
    this.input.menuOpen = () => this.menus.current !== 'none';
    this.pads = new Pads({
      inBattle: () => this.state === 'playing' && this.menus.current === 'none' && !this.hud.panelOpen,
      battleKey: (k) => this.input.press(k),
      menu: (m) => this.padMenu(m),
      connected: () => this.hud.toast('Controller ready: X · A · B summon, D-pad picks the lane, RB god power, Start pauses (H lists all)', 'info'),
    });
    this.menus = new Menus(this.stage, this.settings, {
      play: (d) => this.play(d),
      sandbox: () => this.play(this.settings.difficulty, undefined, true),
      riddle: (id) => this.playRiddle(id),
      continueSaved: () => this.continueSaved(),
      resume: () => this.resume(),
      restart: () => {
        this.forfeit();
        const riddle = this.game?.riddle;
        if (riddle) this.playRiddle(riddle.id);
        else this.play(this.difficulty, undefined, !!this.game?.options.sandbox);
      },
      quit: () => {
        // Online: leaving the battle forfeits it and leaves the room.
        if (this.game instanceof NetGame) return this.leaveRoom();
        this.forfeit();
        this.toTitle();
      },
      settingsChanged: (s) => this.applySettings(s),
      sound: (k) => this.audio.ui(k),
      home: () => (this.state === 'title' ? this.menus.show('title') : this.toTitle()),
      // (From the results — "Now bring a friend →" — the finished battle is put away first.)
      multiplayer: () => {
        if (this.state !== 'title') this.toTitle();
        this.openMultiplayer();
      },
      rematch: () => this.rematch(),
      leaveRoom: () => this.leaveRoom(),
      // (From the results: the finished battle is put away, the room — still seated — shows.)
      toRoom: () => {
        this.toTitle();
        this.openMultiplayer();
      },
      emote: (id) => !!this.mp && this.mp.emote(id),
      mp: {
        sound: (k) => this.audio.ui(k),
        exit: () => this.closeMultiplayer(),
        rename: (name) => {
          this.settings.playerName = cleanName(name);
          saveSettings(this.settings);
          this.menus.mp.setName(this.settings.playerName);
          this.mp?.setName(this.settings.playerName);
        },
        host: () => this.mp?.host(),
        join: (code) => this.mp?.join(code),
        howto: () => this.menus.show('howto'),
        ready: (on) => {
          // Online battles start on a message from the server, not a tap: phones go
          // fullscreen (a gesture is required) when the player says they're ready.
          if (on) this.immersive();
          this.mp?.ready(on);
        },
        trials: (t) => this.mp?.setTrials(t),
        coop: (c) => {
          this.ownCoopAt = performance.now();
          this.mp?.setCoop(c);
        },
        leaveRoom: () => this.leaveRoom(),
      },
    });
    // Battle-time network messages sit above the HUD, below the menus.
    this.netOverlay = new NetOverlay(this.stage);
    this.stage.insertBefore(this.netOverlay.root, this.menus.root);
    this.netOverlay.onClaim = () => {
      this.audio.ui('click');
      this.buzz(15);
      this.mp?.claim();
    };
    this.netOverlay.onBeat = (final) => {
      this.audio.ui(final ? 'summon' : 'select');
      if (final) this.buzz(30);
    };
    window.addEventListener('resize', () => this.resize());
    // Another tab of the game saved: its records, feats and riddles show here too (the title's
    // laurels at once; other screens the next time they open).
    window.addEventListener('storage', (e) => {
      if (mergeFromOtherTab(this.settings, e.key) && this.menus.current === 'title') this.menus.refreshLaurels();
    });
    // Moving the window to a screen with another pixel density doesn't fire 'resize'.
    const watchDpr = () => {
      if (typeof matchMedia === 'undefined') return;
      matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
        'change',
        () => {
          this.resize();
          watchDpr();
        },
        { once: true },
      );
    };
    watchDpr();
    // The phone's Back (Android's button, iOS's swipe) is the game's Esc: one step back, or the
    // menu in a battle — not off the page (a tab opened from a QR code would close, its online
    // session with it). One history entry is kept for it once the player has touched the page
    // (browsers skip entries added before that); on the bare title it isn't, so Back can leave.
    const arm = () => {
      if (this.backArmed || (this.state === 'title' && this.menus.current === 'title')) return;
      this.backArmed = true;
      history.pushState({ mythwarBack: true }, '');
    };
    window.addEventListener('pointerdown', arm, { capture: true, passive: true });
    window.addEventListener('keydown', arm, { capture: true, passive: true });
    window.addEventListener('popstate', () => {
      if (!this.backArmed) return;
      this.backArmed = false;
      this.escape(true);
      arm();
    });
    // Escape on the title screens (no battle input attached) steps back through the menus.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'title') this.escape();
      // Enter on a menu screen presses its main (gold) button, unless a button is focused.
      const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text';
      if (e.key === 'Enter' && !e.repeat && this.menus.current !== 'none' && !(document.activeElement instanceof HTMLButtonElement) && !typing) {
        if (this.menus.pressPrimary()) e.preventDefault();
      }
    });
    document.addEventListener('visibilitychange', () => {
      this.audio.setHidden(document.hidden);
      // Online the battle can't just pause: the server holds it for both players until we're back.
      if (this.mp) {
        this.mp.away(document.hidden);
        if (!document.hidden && (this.state === 'playing' || this.mp.room)) this.keepAwake(true);
      }
      if (!document.hidden) return;
      this.persist();
      if (this.state === 'playing' && this.game && !this.game.paused && !(this.game instanceof NetGame)) this.pause();
    });
    window.addEventListener('pagehide', () => {
      this.persist();
      this.mp?.away(true);
    });
    this.applySettings(this.settings);
    this.resize();
  }

  resize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const forced = this.params.get('mode');
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    // Phones held upright: rotate the whole game into landscape (side-view lanes need width).
    this.rotated = (coarse || forced === 'mobile') && vh > vw && !this.params.has('norotate');
    // Keep the game clear of notches / rounded corners / the home bar. Upright phones rotate the
    // stage 90° clockwise, so the screen's top inset becomes the stage's left, bottom → right,
    // right → top and left → bottom.
    const phys = this.safeArea();
    const safe = this.rotated ? { l: phys.t, r: phys.b, t: phys.r, b: phys.l } : phys;
    const w = (this.rotated ? vh : vw) - safe.l - safe.r;
    const h = (this.rotated ? vw : vh) - safe.t - safe.b;
    this.mode = forced === 'mobile' || forced === 'desktop' ? forced : this.rotated ? 'mobile' : detectMode(w, h);
    this.width = w;
    this.height = h;
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    this.stage.style.transformOrigin = '0 0';
    // Rotated: stage (0,0) sits at the screen's top-right corner inside the insets.
    this.stage.style.transform = this.rotated ? `translate(${vw - phys.r}px, ${phys.t}px) rotate(90deg)` : `translate(${safe.l}px, ${safe.t}px)`;
    const toStage = (cx: number, cy: number): [number, number] => (this.rotated ? [cy - phys.t, vw - phys.r - cx] : [cx - safe.l, cy - safe.t]);
    this.input.toStage = toStage;
    this.hud.toStage = toStage;
    this.coach.toStage = toStage;
    this.renderer.quality = this.settings.lowQuality ? 'low' : 'high';
    this.renderer.resize(w, h, this.mode, this.settings.lowQuality ? 1 : 2);
    // Large desktop screens zoom the HUD and menus (see hudZoom in layout.ts).
    this.stage.style.setProperty('--hs', String(this.renderer.layout.hud));
    this.hud.setLayout(this.renderer.layout);
    this.coach.zoom = this.renderer.layout.hud;
    this.stage.classList.toggle('mobile', this.mode === 'mobile');
    this.stage.classList.toggle('rotated', this.rotated);
    this.coinTarget = this.hud.goldTarget();
  }

  private safeProbe: HTMLDivElement | null = null;

  /** Safe-area insets (notches) in CSS pixels. */
  private safeArea(): { l: number; r: number; t: number; b: number } {
    if (!this.safeProbe) {
      const d = document.createElement('div');
      d.style.cssText =
        'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(d);
      this.safeProbe = d;
    }
    const cs = getComputedStyle(this.safeProbe);
    return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  }

  /** On phones, go fullscreen and lock landscape when a battle starts (needs a user gesture). */
  private immersive(): void {
    if (this.mode !== 'mobile' || !this.settings.fullscreen) return;
    // Browsers only allow this during a user gesture (not e.g. for ?play= auto-starts).
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && !ua.isActive) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (!document.fullscreenElement) {
        const p = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
        if (p && typeof (p as Promise<void>).then === 'function') {
          (p as Promise<void>)
            .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
            .catch(() => {});
        }
      }
    } catch {
      // Not supported (e.g. iPhone Safari) — the rotated layout still works.
    }
  }

  applySettings(s: Settings): void {
    saveSettings(s);
    this.audio.setVolumes(s.muted ? 0 : s.master, s.music, s.sfx);
    this.renderer.shakeEnabled = s.shake;
    this.renderer.setColorblind(s.colorblind);
    document.documentElement.classList.toggle('cbfoe', s.colorblind);
    this.hud.advice = s.advice && !this.game?.riddle;
    const q = s.lowQuality ? 'low' : 'high';
    if (this.renderer.quality !== q && this.width > 0) this.resize();
  }

  start(): void {
    const p = this.params;
    const ff = Number(p.get('ff') ?? 0);
    if (p.has('demo')) {
      // Attract / screenshot mode: AI vs AI with the HUD visible.
      const game = this.startGame((p.get('difficulty') as Difficulty) ?? 'master', Number(p.get('seed') ?? 7), true);
      game.view.selectedLane = 1;
      game.speed = Number(p.get('speed') ?? 1);
      this.state = 'playing';
      this.hud.attach(game);
    } else if (p.has('sandbox')) {
      this.play('novice', Number(p.get('seed') ?? 0) || undefined, true);
    } else if (p.has('play')) {
      const d = p.get('play') as Difficulty;
      this.play(DIFFICULTIES.includes(d) ? d : 'adept', Number(p.get('seed') ?? 0) || undefined);
    } else if (p.has('join') || p.has('mp')) {
      // Invite link (QR code): straight into the multiplayer lobby and that room.
      this.toTitle();
      this.openMultiplayer(cleanCode(p.get('join')) ?? undefined);
      // A reload shouldn't join again (the session token rejoins the room anyway).
      const url = new URL(location.href);
      url.searchParams.delete('join');
      history.replaceState(null, '', url);
    } else if (hasStoredSession()) {
      // Reloaded during an online battle or in a room: quietly reconnect and pick it up again.
      this.toTitle();
      this.quietResume = true;
      this.openMultiplayer(undefined, true);
    } else {
      this.toTitle();
      const screen = p.get('screen');
      if (screen) this.menus.show(screen as Parameters<Menus['show']>[0]);
    }
    if (ff > 0 && this.game) {
      this.game.fastForward(ff);
      this.renderer.setTheme(this.game.world.players[0].age, true);
    }
    const theme = p.get('theme');
    if (theme !== null) this.renderer.setTheme(Number(theme), true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private startGame(difficulty: Difficulty, seed: number | undefined, demo: boolean, sandbox = false): Game {
    const trials = demo || sandbox ? [] : this.settings.trials;
    const quick = !demo && !sandbox && this.settings.quick;
    // (A custom start only for ages this player has reached in battle.)
    const startAge = demo || sandbox ? 0 : Math.min(this.settings.startAge, this.settings.ageSeen);
    return this.hookGame(new Game({ difficulty, seed, demo, sandbox, trials, quick, startAge }), demo);
  }

  /**
   * Whose sigil flies on each keep (Lens #85): yours, and online your opponent's as they chose
   * it (co-op: the host's on the shared side, the same on both allies' screens). The attract
   * battle and the AI generals carry none.
   */
  private sigilsFor(game: Game): [number, number] {
    const out: [number, number] = [-1, -1];
    if (game.options.demo) return out;
    const seats = game instanceof NetGame ? this.mp?.room?.seats : null;
    if (seats && game instanceof NetGame && game.coop) return [seats[0]?.sigil ?? -1, -1];
    if (seats) return [seats[0]?.sigil ?? -1, seats[1]?.sigil ?? -1];
    out[game.playerTeam] = this.settings.sigil;
    return out;
  }

  /** Makes `game` the active game: resets visuals and routes its events. */
  private hookGame(game: Game, demo: boolean): Game {
    this.renderer.reset();
    // The local player's side is drawn on the left, in blue (online, that may be team 1).
    this.renderer.setPerspective(game.playerTeam);
    this.audio.playerTeam = game.playerTeam;
    this.renderer.setTheme(game.world.players[game.playerTeam].age, true);
    this.game = game;
    game.onEvents((ev) => {
      if (this.game !== game) return;
      this.renderer.onEvents(ev, game.world, game.view);
      this.audio.onEvents(ev);
      if (this.state === 'playing') {
        this.hud.onEvents(ev);
        this.coach.onEvents(ev);
        if (!demo && !game.practice) this.feats?.onEvents(ev, game.world);
        if (!demo && !game.practice) this.chronicle?.onEvents(ev, game.world, game instanceof NetGame ? game.result?.reason : undefined);
        if (!demo) this.tauntEvents(game, ev);
        for (const e of ev) {
          if (e.type === 'power' && e.team === game.playerTeam && !demo && !(game instanceof NetGame)) this.slowmo = SLOWMO;
          if (e.type === 'ageUp' && e.team === game.playerTeam) {
            this.buzz([30, 60, 30, 60, 60]);
            if (!demo && e.age > this.settings.ageSeen) {
              this.settings.ageSeen = this.hud.ageSeen = e.age;
              saveSettings(this.settings);
            }
          }
          else if (e.type === 'baseHit' && e.team === game.playerTeam && game.world.time - this.lastBuzz > 1.5) {
            this.lastBuzz = game.world.time;
            this.buzz(25);
          } else if (e.type === 'gameOver') this.buzz(e.winner === game.playerTeam ? [40, 60, 40, 60, 120] : [200]);
        }
      }
      for (const e of ev) if (e.type === 'gameOver' && this.state === 'playing' && !demo) this.onGameOver();
    });
    return game;
  }

  /** A new battle against the AI — or, with `sandbox`, the goal-free toy mode. */
  play(difficulty: Difficulty, seed?: number, sandbox = false): void {
    this.difficulty = difficulty;
    this.settings.difficulty = difficulty;
    saveSettings(this.settings);
    this.abandonSaved();
    const game = this.startGame(difficulty, seed, false, sandbox);
    game.speed = this.settings.speed === 2 ? 2 : 1;
    this.enterBattle(game);
    this.menus.show('none');
    if (sandbox) {
      // A question to try, each time: the sandbox is for imagining match-ups.
      const prompt = SANDBOX_PROMPTS[Math.floor(Math.random() * SANDBOX_PROMPTS.length)];
      this.hud.banner('Sandbox', 'No foe · endless gold · try anything', 'gold', `${prompt}${prompt.endsWith('?') ? '' : '.'} Summon for either side with the “For:” button (X).`);
    }
    else {
      // Facing a general not yet beaten: their chapter of the journey (Lens #68).
      this.hud.opening(PERSONAS[difficulty].title, this.settings.records[difficulty]?.wins ? undefined : JOURNEY[difficulty]);
      this.hud.setFoeName(PERSONAS[difficulty].name);
      // The general speaks once the opening banner has had its moment — at a first meeting, of
      // who they are to the others (Lens #79).
      const meet = !this.settings.records[difficulty]?.wins;
      // (Only into this battle: a restart or another battle within 3 s has its own opening.)
      window.setTimeout(() => {
        if (this.game === game && this.state === 'playing') this.taunt(meet ? 'meet' : 'start', true);
      }, 3200);
    }
  }

  /**
   * A new battle from the title abandons the autosaved one: like leaving it from the pause menu,
   * that counts as a defeat once it had properly started (the difficulty screen says so).
   * (Restart from the pause menu has already recorded its forfeit.)
   */
  private abandonSaved(): void {
    const saved = this.state === 'title' ? loadBattle() : null;
    const savedTime = saved?.world?.time;
    if (saved && typeof savedTime === 'number' && savedTime >= 60 && DIFFICULTIES.includes(saved.difficulty)) {
      recordResult(this.settings, saved.difficulty, false, savedTime);
    }
    clearBattle();
    this.menus.setContinue(null);
  }

  /** A riddle of war (Lens #52): a small hand-made battle with one question. */
  playRiddle(id: string): void {
    const pz = puzzleById(id);
    if (!pz) return;
    this.abandonSaved();
    const game = this.hookGame(new Game({ difficulty: this.settings.difficulty, puzzle: id }), false);
    this.enterBattle(game);
    this.hud.setFoeName('The riddle');
    this.menus.show('none');
    this.hud.banner(pz.name, `A riddle of war · ${pz.gold} gold${pz.power ? ' · one god power' : ''}`, 'gold', `${pz.brief} Clear the field before any foe reaches your citadel.`);
  }

  private enterBattle(game: Game): void {
    this.feats = new FeatTracker(this.settings.feats, (f) => {
      this.settings.feats.push(f.id);
      saveSettings(this.settings);
      // (Feats for the victory itself are listed on the results screen instead.)
      if (this.game?.over) return;
      this.hud.toast(`Feat: ${f.name} — ${f.desc}`, 'feat');
      this.audio.ui('bless');
    });
    this.feats.start(game.world, game.playerTeam);
    this.chronicle = new Chronicle(game.playerTeam, game instanceof NetGame ? game.foeName : PERSONAS[this.difficulty].name, game instanceof NetGame && !!game.coop);
    // (Continued or rejoined midway: the story and the battlefield pick up from where it stands.)
    if (game.world.time > 0) {
      this.chronicle.resume(game.world);
      this.renderer.adoptHeroes(game.world);
    }
    this.taunts = { n: 0, at: -100, said: new Set(), heldShrine: [false, false, false] };
    this.starWarned = { half: false, par: game.world.time > parTime(this.difficulty, game.world.quick) };
    this.immersive();
    this.state = 'playing';
    this.overTimer = -1;
    this.lastSave = game.world.time;
    this.lastBuzz = -10;
    this.audio.ambience = 1;
    this.audio.startMusic(game.world.players[game.playerTeam].age);
    this.hud.ageSeen = this.settings.ageSeen;
    this.hud.holdKnown = !this.settings.hints || this.settings.hintsSeen.includes('hold');
    // (A riddle is solved by reading the lane yourself: no "Counter!" badge there.)
    this.hud.advice = this.settings.advice && !game.riddle;
    this.hud.myName = playerLabel(this.settings);
    this.renderer.sigils = this.sigilsFor(game);
    this.hud.attach(game);
    this.input.attach(game);
    // (The sandbox is a toy: battle tips would only be used up there.)
    this.coach.attach(game.practice ? null : game);
    this.coinTarget = this.hud.goldTarget();
  }

  /** Resume the autosaved battle (starts paused so the player can get their bearings). */
  continueSaved(): void {
    const save = loadBattle();
    let game: Game | null = null;
    try {
      if (save) game = Game.fromSave(save);
    } catch {
      game = null;
    }
    if (!save || !game) {
      clearBattle();
      this.menus.setContinue(null);
      return;
    }
    this.difficulty = save.difficulty;
    this.hookGame(game, false);
    this.enterBattle(game);
    this.chronicle?.restore(save.story);
    // ("Odin · Asgard" by the foe's citadel, as when the battle began.)
    this.hud.setFoeName(PERSONAS[save.difficulty].name);
    this.pause();
  }

  /** Autosave the battle in progress. */
  private persist(): void {
    const g = this.game;
    if (this.state !== 'playing' || !g || g.over || g.world.winner !== null || g.options.demo || g.options.online || g.practice) return;
    saveBattle({ ...g.toSave(), story: this.chronicle?.moments.slice() });
    this.lastSave = g.world.time;
  }

  toTitle(): void {
    // Leaving a battle from the menu abandons it.
    if (this.state === 'playing' && this.game && !this.game.options.demo && !this.game.options.online) clearBattle();
    this.keepAwake(false);
    this.netMenuLocal = false;
    this.state = 'title';
    this.overTimer = -1;
    this.hud.detach();
    this.input.attach(null);
    this.coach.attach(null);
    this.startBackdrop();
    this.audio.ambience = 0.2;
    this.audio.startMusic(0);
    this.menus.setContinue(this.savedLabel());
    this.menus.show('title');
  }

  /** "Asgard \u00b7 7:42" for the autosave, or null. A save that doesn't make sense is dropped. */
  private savedLabel(): string | null {
    const save = loadBattle();
    if (!save) return null;
    try {
      const age = AGES[save.world.players[0].age];
      if (!age || !Number.isFinite(save.world.time) || !DIFFICULTIES.includes(save.difficulty)) throw new Error('Malformed save');
      return `${age.name} \u00b7 ${fmtTime(save.world.time)}`;
    } catch {
      clearBattle();
      return null;
    }
  }

  /**
   * Slow device? After 4 consecutive seconds under 40 fps mid-battle, switch to battery-saver
   * quality once (lower resolution, fewer particles) and say so.
   */
  private watchPerformance(fps: number): void {
    const g = this.game;
    if (this.autoLowDone || this.settings.lowQuality || this.state !== 'playing' || !g || g.paused || g.world.time < 10) {
      this.slowSeconds = 0;
      return;
    }
    this.slowSeconds = fps < 40 ? this.slowSeconds + 1 : 0;
    if (this.slowSeconds >= 4) {
      this.autoLowDone = true;
      this.settings.lowQuality = true;
      this.applySettings(this.settings);
      this.hud.toast('Battery saver on for smoother play (change in Settings)', 'info');
    }
  }

  /** Short vibration on phones (tied to the screen-shake setting). */
  private buzz(pattern: number | number[]): void {
    if (this.mode !== 'mobile' || !this.settings.shake) return;
    // Vibration (like audio) needs the user to have touched the page at least once.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // unsupported
    }
  }

  /** Abandoning a battle that has properly started counts as a loss in the records. */
  private forfeit(): void {
    const g = this.game;
    if (this.state !== 'playing' || !g || g.over || g.options.demo || g.options.online || g.practice || g.world.time < 60) return;
    recordResult(this.settings, this.difficulty, false, g.world.time);
  }

  /**
   * Gamepad in a menu or an open battle panel: the D-pad moves a highlight to the nearest button
   * that way, A presses it (or the screen's main button), B / Start go back or close the panel.
   */
  private padMenu(move: MenuMove): void {
    const panel = this.menus.current === 'none' && this.state === 'playing' ? this.hud.openPanelEl : null;
    if (move === 'back' || move === 'start') {
      if (panel) this.hud.togglePanel('none');
      else this.escape();
      return;
    }
    const scope = panel ?? (document.querySelector('.screen.active') as HTMLElement | null);
    if (!scope) return;
    const visible = (el: HTMLElement) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0;
    if (this.padFocus && (!scope.contains(this.padFocus) || !visible(this.padFocus))) this.setPadFocus(null);
    if (move === 'confirm') {
      if (this.padFocus) this.padFocus.click();
      else if (!panel) this.menus.pressPrimary();
      return;
    }
    const buttons = [...scope.querySelectorAll<HTMLElement>('button, input[type=checkbox], input[type=range]')].filter(visible);
    if (!buttons.length) return;
    const from = this.padFocus ?? scope.querySelector<HTMLElement>('.mbtn.primary:not(.hidden)') ?? null;
    if (!from || !this.padFocus) {
      this.setPadFocus(from && visible(from) ? from : buttons[0]);
      return;
    }
    // The nearest button in that direction (distance along it, off-axis distance counting double).
    const r0 = from.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[move];
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const b of buttons) {
      if (b === from) continue;
      const r = b.getBoundingClientRect();
      const ox = r.left + r.width / 2 - cx;
      const oy = r.top + r.height / 2 - cy;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;
      const score = along + 2 * Math.abs(dx ? oy : ox);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best) this.setPadFocus(best);
    this.audio.ui('select');
  }

  private setPadFocus(el: HTMLElement | null): void {
    this.padFocus?.classList.remove('padfocus');
    this.padFocus = el;
    if (el) {
      el.classList.add('padfocus');
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /** Escape / P: leave a sub-menu, otherwise toggle pause. */
  /** `back`: the phone's Back button (online it opens the menu without pausing — see pause()). */
  private escape(back = false): void {
    const m = this.menus.current;
    if (m === 'mp') this.closeMultiplayer();
    else if (m === 'room') return;
    else if (m === 'howto' || m === 'settings' || m === 'bestiary' || m === 'feats' || m === 'difficulty' || m === 'riddles') this.menus.goBack();
    else if (this.state !== 'playing') return;
    else if (this.game instanceof NetGame) {
      // Online the battle may be held for other reasons (countdown, someone away): Esc
      // toggles the menu itself.
      if (m === 'pause') this.resume();
      else this.pause(back);
    } else if (this.game?.paused) this.resume();
    else this.pause();
  }

  /**
   * `menuOnly` (online): just this device's menu, no pause for both — the phone's Back, often
   * pressed by accident (Android's edge swipe), mustn't spend one of the player's pauses.
   */
  pause(menuOnly = false): void {
    if (this.state !== 'playing' || !this.game || this.game.over) return;
    const g = this.game;
    if (g instanceof NetGame) {
      // Online: ask the server; the pause screen opens for both players when it confirms.
      const outOfPauses = g.pausesLeft[g.seat] <= 0;
      if (!menuOnly && !g.netPause && g.countdownEnd <= performance.now() && g.online && !outOfPauses) {
        this.mp?.pause();
        return;
      }
      // Already held (the other player is away, a countdown, reconnecting) — or this player's
      // pauses are used up (Lens #87) — open the menu just here, so leaving or the settings stay
      // reachable; the battle goes on.
      if (this.menus.current !== 'none') return;
      this.netMenuLocal = true;
      const running = !g.netPause && g.countdownEnd <= performance.now();
      const title = running ? (outOfPauses ? 'Menu — no pauses left, the battle goes on' : menuOnly ? 'Menu — the battle goes on' : 'Menu') : 'Menu';
      this.menus.setPauseSummary(g.world, g.playerTeam, this.difficulty, { foe: g.foeName, title });
      this.hud.cancelTargeting();
      this.hud.hideTooltip();
      if (this.hud.panelOpen) this.hud.togglePanel('none');
      this.menus.show('pause');
      return;
    }
    this.game.paused = true;
    this.menus.setPauseSummary(this.game.world, this.game.playerTeam, this.difficulty, undefined, !!this.game.options.sandbox, this.game.riddle);
    this.hud.cancelTargeting();
    this.hud.hideTooltip();
    if (this.hud.panelOpen) this.hud.togglePanel('none');
    this.menus.show('pause');
  }

  resume(): void {
    if (!this.game) return;
    if (this.game instanceof NetGame) {
      const local = this.netMenuLocal;
      this.netMenuLocal = false;
      if (local) this.menus.show('none');
      // (A menu opened while the battle was held for another reason resumes nothing.)
      if (!local || this.game.netPause?.reason === 'pause') this.mp?.resume();
      return;
    }
    this.game.paused = false;
    this.menus.show('none');
  }

  /**
   * Healthy play (Lens #98): after every full hour of battles in one sitting, the results — a
   * natural place to stop — suggest a break, once. Time in battle is counted frame by frame
   * (pauses included: it's time spent at the screen; the title and menus between battles not);
   * half an hour without a battle starts a new sitting.
   */
  private breakNote(): string | null {
    return this.sitting.note();
  }

  private onGameOver(): void {
    const g = this.game!;
    const won = g.world.winner === g.playerTeam;
    // (A battle abandoned by a server restart has no result: no feats for it either.)
    if (g.riddle) {
      // Riddles keep no records or feats — only which ones are solved.
      if (won && !this.settings.riddles.includes(g.riddle.id)) {
        this.settings.riddles.push(g.riddle.id);
        saveSettings(this.settings);
      }
      this.audio.ui(won ? 'victory' : 'defeat');
      this.overTimer = 1.8;
      this.hud.cancelTargeting();
      this.hud.banner(won ? 'Solved!' : 'Not yet', won ? 'The field is clear' : g.world.players[g.playerTeam].baseHp < g.world.players[g.playerTeam].baseMaxHp ? 'A foe reached your citadel' : 'The riddle stands', won ? 'gold' : 'red');
      return;
    }
    if (!(g instanceof NetGame) || g.result) this.feats?.onEnd(g.world, g instanceof NetGame ? null : this.difficulty, g instanceof NetGame && !!g.coop);
    this.menus.featsEarned = this.feats?.earned ?? [];
    this.menus.chronicle = this.chronicle?.lines() ?? [];
    this.menus.breakNote = this.breakNote();
    if (g instanceof NetGame) {
      // (A battle abandoned by the server restarting has no result to count.)
      // (Co-op battles are against the AI: no head-to-head tally.)
      if (g.result && !g.coop) recordOnline(this.settings, g.foeName.replace(/ \(2\)$/, ''), won);
      if (g.result) this.journal(g, won, g.coop ? 'coop' : 'online', g.coop ?? g.foeName, 0);
      this.audio.ui(won ? 'victory' : 'defeat');
      this.overTimer = 2.6;
      this.hud.cancelTargeting();
      if (this.menus.current !== 'none') this.menus.show('none');
      const reason = g.result?.reason;
      let sub = won ? 'The enemy citadel crumbles' : 'Your citadel has fallen';
      if (reason === 'forfeit' && won) sub = `${g.foeName} left the battle`;
      else if (reason === 'timeout') sub = won ? `${g.foeName} didn’t come back` : 'You were away too long';
      this.hud.banner(won ? 'Victory' : 'Defeat', sub, won ? 'gold' : 'red');
      return;
    }
    const P = g.world.players[g.playerTeam];
    const quick = g.world.quick;
    // A custom start (a later age) is not the same race: no stars or best time for it.
    const custom = g.world.startAge > 0;
    const stars = custom ? 0 : battleStars(won, P.baseHp / P.baseMaxHp, g.world.time, this.difficulty, quick).stars;
    // A better rating than ever against this foe is celebrated on the results.
    this.menus.newBestStars = stars > (this.settings.records[this.difficulty]?.stars ?? 0) ? stars : 0;
    // The first victory over a general closes their chapter of the journey (Lens #70).
    this.menus.epilogue = won && !this.settings.records[this.difficulty]?.wins ? JOURNEY[this.difficulty] : null;
    recordResult(this.settings, this.difficulty, won, g.world.time, stars, quick || custom);
    this.journal(g, won, 'ai', this.difficulty, stars);
    if (starTotal(this.settings.records) >= MAX_STARS) this.feats?.award(PINNACLE);
    clearBattle();
    this.audio.ui(won ? 'victory' : 'defeat');
    this.overTimer = 2.6;
    this.hud.cancelTargeting();
    this.hud.banner(won ? 'Victory' : 'Defeat', won ? 'The enemy citadel crumbles' : 'Your citadel has fallen', won ? 'gold' : 'red');
  }

  /** Notes the battle in the playtest journal (Lens #91; kept on this device only). */
  private journal(g: Game, won: boolean, mode: JournalEntry['mode'], foe: string, stars: number): void {
    const P = g.world.players[g.playerTeam];
    const by = P.stats.summonedBy;
    const count = (cls: string) => Object.entries(by).reduce((n, [id, c]) => n + (UNITS[id]?.cls === cls ? c : 0), 0);
    addJournal(this.settings, {
      at: Date.now(),
      mode,
      foe,
      won,
      secs: Math.round(g.world.time),
      stars,
      age: P.age,
      summons: [count('guardian'), count('hunter'), count('mystic'), count('legend')],
      kills: P.stats.kills,
      losses: P.stats.losses,
      powers: P.stats.powersCast,
      quick: g.world.quick,
      startAge: g.world.startAge,
      trials: P.trials.length,
    });
  }

  private frame(now: number): void {
    // Scheduled first, so one bad frame can't stop the loop for good.
    requestAnimationFrame((t) => this.frame(t));
    // (Never negative: `last` may come from performance.now() — set after a slow start — while
    // `now` is the frame's timestamp, which can be earlier. A negative step ran the creatures'
    // summon-in animation backwards to a negative scale: the intermittent "arc radius is
    // negative" error (open issue since run #5).)
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    this.pads.update(dt);
    // Time spent in battle this sitting (Lens #98; a hidden tab gets no frames, so it isn't counted).
    if (this.state === 'playing' && this.game && !this.game.options.demo) this.sitting.battle(now / 1000, dt);
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      const fps = Math.round(this.fpsFrames / this.fpsAcc);
      (window as unknown as { __fps: number }).__fps = fps;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.watchPerformance(fps);
    }
    // HUD buttons behind a menu can't be focused or keyed (a focused Pause button + Enter...).
    const inert = this.menus.current !== 'none';
    if (this.hud.root.inert !== inert) {
      this.hud.root.inert = inert;
      this.hud.root.classList.toggle('under-menu', inert);
    }
    const g = this.game;
    if (g) {
      // The title backdrop restarts when its battle ends.
      if (this.state === 'title' && g.over) this.toTitleBackdrop();
      this.renderer.coinTarget = this.state === 'playing' ? this.coinTarget : null;
      this.renderer.cinematic = this.state === 'title' && this.settings.shake;
      let alpha: number;
      try {
        alpha = g.advance(dt);
      } catch (e) {
        if (g.options.online) throw e;
        // A battle that can't go on (a save from another build of the game, a bug in some rare
        // state) is put away — and its save dropped, so Continue doesn't bring it back each time.
        console.error(e);
        if (!g.options.demo) clearBattle();
        if (this.state === 'title') this.toTitleBackdrop();
        else this.toTitle();
        return;
      }
      if (this.state === 'playing' && !g.paused && g.world.time - this.lastSave >= 5) this.persist();
      this.audio.intensity = this.battleIntensity(g);
      // A paused battle is a true freeze-frame: effects stop too.
      this.renderer.speed = g.speed;
      this.renderer.render(g.world, alpha, g.paused ? 0 : dt, g.view);
      if (this.state === 'playing' || this.state === 'over') this.hud.update(dt);
      if (this.renderer.fx.coinsArrived !== this.coinsSeen) {
        this.coinsSeen = this.renderer.fx.coinsArrived;
        this.hud.pulseGold();
      }
      if (this.state === 'playing') this.watchStars(g);
      // The god power's moment: time slows to a third and eases back over 0.6 s (real time).
      if (this.slowmo > 0 && !g.paused) this.slowmo = Math.max(0, this.slowmo - dt);
      g.timeScale = this.slowmo > 0 ? 1 - 0.65 * (this.slowmo / SLOWMO) : 1;
      this.heartbeat(g, dt);
      if (this.state === 'playing') this.coach.update(this.hud.panelOpen || this.hud.bannerShowing || this.menus.current !== 'none' || this.netOverlay.busy);
      if (this.overTimer > 0) {
        this.overTimer -= dt;
        if (this.overTimer <= 0) {
          this.state = 'over';
          if (g instanceof NetGame) {
            const seats = this.mp?.room?.seats;
            this.menus.showResults(g.world, g.playerTeam, this.difficulty, g.history, g.ageUps, {
              foe: g.foeName,
              ally: g.allyName,
              reason: g.result?.reason ?? 'citadel',
              // (Once the other player has left the room, there's no running score.)
              score: seats?.[g.seat === 0 ? 1 : 0] ? [seats?.[g.seat]?.wins ?? 0, seats[g.seat === 0 ? 1 : 0]!.wins] : null,
            });
            this.syncRematch();
          } else if (g.riddle) this.menus.showRiddleResult(g.riddle, g.world.winner === g.playerTeam);
          else this.menus.showResults(g.world, g.playerTeam, this.difficulty, g.history, g.ageUps);
        }
      }
      if (g instanceof NetGame) {
        this.syncNetPause(g);
        const foeSigil = SIGILS[this.renderer.sigils[g.playerTeam === 0 ? 1 : 0]];
        this.hud.setNet(foeSigil ? `${foeSigil} ${g.foeName}` : g.foeName, this.mp?.conn.rtt ?? 0, g.online, g.bufferMs, g.allyName);
      }
    }
    this.netOverlay.update(g instanceof NetGame && this.state !== 'title' ? g : null, performance.now());
    this.hud.holdBanner(this.netOverlay.noticeShowing);
  }

  // -------------------------------------------------------------------------
  // Multiplayer
  // -------------------------------------------------------------------------

  /** Opens the multiplayer lobby (connecting if needed). `join`: room code from an invite. */
  openMultiplayer(join?: string, quiet = false): void {
    if (!hasMpServer()) {
      // Static hosting (GitHub Pages): no server here — the lobby explains how to start one.
      this.menus.mp.showNoServer();
      if (!quiet) this.menus.show('mp');
      return;
    }
    if (!this.settings.playerName) {
      this.settings.playerName = randomName();
      saveSettings(this.settings);
    }
    this.menus.mp.setName(this.settings.playerName);
    this.mp?.setIdentity(playerRank(this.settings.records, this.settings.feats), this.settings.sigil);
    if (join) {
      this.pendingJoin = join;
      this.menus.mp.setCode(join);
    }
    if (!this.mp) {
      const mp = new MpClient({ name: this.settings.playerName, rank: playerRank(this.settings.records, this.settings.feats), sigil: this.settings.sigil });
      this.mp = mp;
      this.mpOff = mp.listen({
        changed: () => this.onMpChanged(),
        battle: (g) => this.onNetBattle(g),
        error: (code, message) => this.onMpError(code, message),
        emote: (seat, id) => {
          const g = this.game;
          if (!(g instanceof NetGame)) return;
          const route = emoteRoute({
            mine: seat === g.seat,
            state: this.state,
            menu: this.menus.current,
            enabled: this.settings.emotes,
            speaker: this.mp?.room?.seats[seat]?.name ?? (g.coop ? g.allyName : g.foeName),
            ally: g.coop ? g.allyName : null,
            phrase: EMOTES[id] ?? '',
          });
          if (!route) return;
          if (route.to === 'results') this.menus.resultEmote(route.text);
          else if (route.to === 'menu') this.menus.pauseSay(route.text);
          else this.hud.showEmote(route.to === 'ally' ? 'mine' : 'theirs', route.text);
          if (route.to === 'ally' && emoteLane(id) >= 0) this.renderer.pingLane(emoteLane(id));
          this.audio.ui(route.sound);
        },
      });
      mp.start();
    }
    this.mp.watchRooms(true);
    if (!quiet) {
      this.quietResume = false;
      this.menus.show(this.mp.room ? 'room' : 'mp');
      this.flushLobbyNote();
    }
    this.onMpChanged();
  }

  /** A message for the lobby that came while it wasn't on screen. */
  private lobbyNote: string | null = null;

  private flushLobbyNote(): void {
    if (!this.lobbyNote) return;
    this.menus.mp.flash(this.lobbyNote);
    this.lobbyNote = null;
  }

  /** Back from the lobby to the title: leave any room and disconnect. */
  private closeMultiplayer(): void {
    const mp = this.mp;
    if (mp) {
      if (mp.room) mp.leave();
      this.mpOff?.();
      mp.forget();
      // Let the leave message go out before the socket closes.
      setTimeout(() => mp.stop(), 150);
    }
    this.mp = null;
    this.mpOff = null;
    this.pendingJoin = null;
    this.keepAwake(false);
    this.menus.show('title');
  }

  /** Leave the room (from the room screen, the results, or the battle's pause menu). */
  private leaveRoom(): void {
    const inBattle = (this.state === 'playing' || this.state === 'over') && this.game instanceof NetGame;
    // Leaving a battle still on forfeits it ("counts as a defeat", says the menu): the opponent
    // counts a win, so this side counts the loss — and the playtest journal notes it.
    const g = this.game;
    if (inBattle && g instanceof NetGame && !g.over && !g.options.demo) {
      if (!g.coop) recordOnline(this.settings, g.foeName.replace(/ \(2\)$/, ''), false);
      this.journal(g, false, g.coop ? 'coop' : 'online', g.coop ?? g.foeName, 0);
    }
    this.mp?.leave();
    if (inBattle) this.toTitle();
    this.openMultiplayer();
  }

  /** Results screen: ask for (or withdraw) a rematch; if the other player left, back to the room. */
  private rematch(): void {
    const mp = this.mp;
    const room = mp?.room;
    if (!mp || !room || mp.seat === null) {
      this.toTitle();
      this.openMultiplayer();
      return;
    }
    if (!room.seats[mp.seat === 0 ? 1 : 0]) {
      this.toTitle();
      this.openMultiplayer();
      return;
    }
    const ready = !room.seats[mp.seat]?.ready;
    if (ready) this.immersive();
    mp.ready(ready);
  }

  private syncRematch(): void {
    const mp = this.mp;
    const g = this.game;
    if (!mp || !(g instanceof NetGame) || this.state !== 'over') return;
    const seats = mp.room?.seats;
    const foe = seats?.[g.seat === 0 ? 1 : 0] ?? null;
    this.menus.updateRematch(g.foeName, !!seats?.[g.seat]?.ready, foe ? foe.ready : null, !!foe?.connected);
  }

  private onMpChanged(): void {
    const mp = this.mp;
    if (!mp) return;
    this.menus.mp.update(mp, (code) => this.inviteUrl(code, mp.lanUrls), (name) => onlineRecord(this.settings, name.replace(/ \(2\)$/, '')));
    if (mp.welcomed && this.pendingJoin) {
      const code = this.pendingJoin;
      this.pendingJoin = null;
      if (mp.room?.code !== code) mp.join(code);
    }
    if (this.quietResume && mp.welcomed) {
      // After a reload: carry on in the room (an ongoing battle arrives as a snapshot).
      this.quietResume = false;
      if (!mp.room) {
        this.closeMultiplayer();
        return;
      }
      if (this.state === 'title') this.menus.show('room');
    }
    if (this.state === 'title') {
      const cur = this.menus.current;
      if (cur === 'mp' && mp.room) this.menus.show('room');
      else if (cur === 'room' && !mp.room) this.menus.show('mp');
    }
    const lost = mp.sessionLost;
    if (lost) {
      mp.sessionLost = null;
      const plan = lostSessionPlan(lost, this.state, this.menus.current, this.game instanceof NetGame, mp.lostRoom);
      if (plan.toLobby) {
        this.toTitle();
        this.openMultiplayer();
      }
      if (plan.rejoin) mp.join(mp.lostRoom!);
      // (Shown when the lobby is next on screen — after the results, if a battle was replayed.)
      this.lobbyNote = plan.note;
      if (this.state === 'title') this.flushLobbyNote();
    }
    if (mp.replaced && this.game instanceof NetGame && this.state !== 'title') {
      this.toTitle();
      this.openMultiplayer();
    }
    if (mp.room) this.keepAwake(true);
    // (Out of the room, on the lobby: the screen may sleep again.)
    else if (this.state === 'title') this.keepAwake(false);
    this.roomChimes(mp);
    this.syncRematch();
  }

  /** Little sounds, and a line in words, for what the other player does outside battle. */
  private roomChimes(mp: MpClient): void {
    const prev = this.lastRoom;
    const now = mp.room ? roomView(mp.room, mp.seat) : null;
    this.lastRoom = now;
    if (this.state === 'playing' || !now) return;
    const news = roomNews(prev, now, performance.now() - this.ownCoopAt <= 2000);
    if (news.chime) this.audio.ui(news.chime);
    if (news.chime === 'ready') this.buzz([20, 40, 20]);
    if (news.said && this.menus.current === 'room') this.menus.mp.flash(news.said);
  }

  private onMpError(code: string, message: string): void {
    this.audio.ui('error');
    const text = code === 'version' ? 'This page and the game server are different versions — reload the page (or restart the server).' : message;
    if (this.state === 'playing') this.hud.toast(text, 'bad');
    else this.menus.mp.flash(text);
  }

  /** An online battle starts (or is rejoined after a reload / reconnect). */
  private onNetBattle(g: NetGame): void {
    this.hookGame(g, false);
    g.onReject = (reason) => this.hud.toast(reason, 'bad');
    g.onDesync = (n) => {
      // Corrected silently each time; if it keeps happening, say so once (and the log has details).
      if (n === 3) this.hud.toast('This device keeps drifting out of sync — it is corrected automatically.', 'info');
    };
    g.onResync = () => {
      this.renderer.reset(true);
      this.renderer.setTheme(g.world.players[g.playerTeam].age, true);
    };
    this.mp?.watchRooms(false);
    this.netMenuLocal = false;
    this.enterBattle(g);
    this.menus.show('none');
    if (g.world.time < 1) this.hud.opening(g.foeName);
    this.keepAwake(true);
    // Started while this tab is in the background (both pressed Ready, then one switched away):
    // the battle must wait for this player like for any other absence.
    if (document.hidden) this.mp?.away(true);
  }

  /** The pause screen follows the server: open while a player has paused, closed otherwise. */
  private syncNetPause(g: NetGame): void {
    if (this.state !== 'playing' || g.over) return;
    const p = g.netPause;
    const want = p?.reason === 'pause' && g.countdownEnd <= performance.now();
    const cur = this.menus.current;
    if (want && (cur === 'none' || (cur === 'pause' && this.netMenuLocal))) {
      this.netMenuLocal = false;
      this.menus.setPauseSummary(g.world, g.playerTeam, this.difficulty, { foe: g.foeName, title: `Paused by ${p!.seat === g.seat ? 'you' : g.names[p!.seat]}${pausesNote(g.pausesLeft[g.seat])}` });
      this.hud.cancelTargeting();
      this.hud.hideTooltip();
      if (this.hud.panelOpen) this.hud.togglePanel('none');
      this.menus.show('pause');
    } else if (!want && !this.netMenuLocal && (cur === 'pause' || cur === 'howto' || cur === 'settings' || cur === 'bestiary')) {
      this.menus.show('none');
    }
  }

  /** The link another device opens to join `code` (the LAN address if we're on localhost). */
  private inviteUrl(code: string, lan: string[]): string {
    const host = location.hostname;
    const local = host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host.startsWith('127.');
    const base = local && lan.length ? lan[0] : location.origin + location.pathname;
    return `${base}?join=${code}`;
  }

  /** Keeps a phone's screen on while in a room or an online battle (needs https or localhost). */
  private keepAwake(on: boolean): void {
    type Lock = { release(): Promise<void>; addEventListener(type: string, fn: () => void): void };
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Lock> } };
    this.wakeWanted = on;
    if (!on) {
      const lock = this.wakeLock;
      this.wakeLock = null;
      lock?.release().catch(() => {});
      return;
    }
    if (this.wakeLock || this.wakePending || !nav.wakeLock || document.hidden) return;
    this.wakePending = true;
    nav.wakeLock
      .request('screen')
      .then((lock) => {
        this.wakePending = false;
        // (Let go meanwhile — the battle or room was left while the browser answered.)
        if (!this.wakeWanted) {
          lock.release().catch(() => {});
          return;
        }
        this.wakeLock = lock;
        // Browsers drop the lock when the page is hidden; becoming visible asks again.
        lock.addEventListener('release', () => {
          if (this.wakeLock === lock) this.wakeLock = null;
        });
      })
      .catch(() => (this.wakePending = false));
  }

  /**
   * Against the AI: the general reacts to what happens — their own ascending, casting, taking a
   * shrine, and the player's (each in their own manner, Lens #78).
   */
  private tauntEvents(g: Game, events: SimEvent[]): void {
    if (g.options.online || g.practice) return;
    const foe = g.playerTeam === 0 ? 1 : 0;
    for (const e of events) {
      if (e.type === 'ageUp' && e.team === foe) this.taunt('ageUp');
      else if (e.type === 'power' && e.team === foe) this.taunt('power');
      else if (e.type === 'ageUp' && e.team === g.playerTeam) this.taunt('foeAge');
      else if (e.type === 'power' && e.team === g.playerTeam) this.taunt('foePower');
      else if (e.type === 'gameOver') this.taunt(e.winner === foe ? 'won' : 'lost', true);
      else if (e.type === 'ragnarok') this.taunt('ragnarok', true);
      else if (e.type === 'spawn' && e.team === g.playerTeam && e.defId === PERSONAS[this.difficulty].nemesis && !this.taunts.said.has('nemesis')) {
        this.taunts.said.add('nemesis');
        this.taunt('nemesis', true);
      }
      else if (e.type === 'shrine') {
        // A shrine taken from the general (theirs → neutral → the player's) stings; a neutral
        // one the player claims first does not.
        const held = this.taunts.heldShrine;
        if (e.owner === foe) {
          held[e.lane] = true;
          this.taunt('shrine');
        } else if (e.owner === g.playerTeam) {
          if (held[e.lane]) this.taunt('foeShrine');
          held[e.lane] = false;
        }
      }
    }
    // Once per battle: when either citadel is close to falling.
    const hp = (t: number) => g.world.players[t].baseHp / g.world.players[t].baseMaxHp;
    if (!this.taunts.said.has('losing') && hp(foe) < 0.25 && hp(foe) > 0) {
      this.taunts.said.add('losing');
      this.taunt('losing', true);
    }
    if (!this.taunts.said.has('winning') && hp(g.playerTeam) < 0.25 && hp(g.playerTeam) > 0) {
      this.taunts.said.add('winning');
      this.taunt('winning', true);
    }
  }

  /** The AI general says a line by their side of the field (at most one every 25 s unless `urgent`). */
  private taunt(event: TauntEvent, urgent = false): void {
    const g = this.game;
    if (!g || g.options.online || g.practice || g.options.demo || !this.settings.emotes || this.state === 'title') return;
    const now = g.world.time;
    if (!urgent && now - this.taunts.at < 25) return;
    const line = tauntLine(this.difficulty, event, this.taunts.n++, this.settings.playerName);
    if (!line) return;
    this.taunts.at = now;
    this.hud.showEmote('theirs', line);
  }

  /**
   * Below 30% health your citadel has a heartbeat (Lens #59): the danger on the sound channel
   * (and, on phones, a soft pulse) — quickening as it falls, heard while your eyes are on a lane.
   */
  private heartbeat(g: Game, dt: number): void {
    if (this.state !== 'playing' || g.paused || g.over || g.view.demo || this.menus.current !== 'none') {
      this.beatIn = 0;
      return;
    }
    const P = g.world.players[g.playerTeam];
    const frac = P.baseHp / P.baseMaxHp;
    if (frac >= 0.3 || frac <= 0) {
      this.beatIn = 0;
      return;
    }
    this.beatIn -= dt;
    if (this.beatIn > 0) return;
    const k = 1 - frac / 0.3;
    this.beatIn = 1.5 - 0.95 * k;
    this.audio.heartbeat(k);
    this.buzz(12);
  }

  /** Against the AI: say when a star goal slips (citadel below half) or is gone (par time). */
  private watchStars(g: Game): void {
    if (g.options.online || g.practice || g.options.demo || g.over || g.world.startAge > 0) return;
    const P = g.world.players[g.playerTeam];
    const frac = P.baseHp / P.baseMaxHp;
    if (!this.starWarned.half && frac <= 0.5) {
      this.starWarned.half = true;
      this.hud.toast('Citadel below half — win back its health (ascend, Bastion) to keep the second star', 'bad');
    } else if (this.starWarned.half && frac > 0.55) this.starWarned.half = false;
    const par = parTime(this.difficulty, g.world.quick);
    if (!this.starWarned.par && g.world.time > par) {
      this.starWarned.par = true;
      this.hud.toast(`${Math.round(par / 60)} minutes have passed — the third star is out of reach`, 'info');
    }
  }

  private battleIntensity(g: Game): number {
    if (this.state !== 'playing') return 0;
    const w = g.world;
    if (w.ragnarokStarted) return 1;
    let n = 0;
    for (const l of w.lanes) n += l.length;
    const me = w.players[g.playerTeam];
    const besieged = w.time - me.lastBaseHit < 3 ? 0.5 : 0;
    // As Ragnarök nears, the war drums build whatever the lanes are doing (Lens #61).
    const left = w.ragnarokAt - w.time;
    const anticipation = left < RAG_WARN ? 0.3 + 0.4 * (1 - left / RAG_WARN) : 0;
    return Math.min(1, Math.max(anticipation, n / 28 + besieged));
  }

  private toTitleBackdrop(): void {
    this.startBackdrop();
  }

  /** The title screen's AI-vs-AI battle, dropped in at a random moment (often a later age). */
  private startBackdrop(): void {
    const demo = this.startGame(Math.random() < 0.5 ? 'adept' : 'master', (Math.random() * 1e9) | 0, true);
    const moments = [40, 40, 150, 300, 420];
    demo.fastForward(moments[Math.floor(Math.random() * moments.length)]);
    this.renderer.setTheme(demo.world.players[0].age, true);
  }
}
