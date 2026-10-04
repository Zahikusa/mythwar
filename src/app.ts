import { Audio } from './audio/audio.ts';
import { Game } from './game.ts';
import { DIFFICULTIES } from './ai/ai.ts';
import type { Difficulty } from './ai/ai.ts';
import { Input } from './input.ts';
import { detectMode } from './render/layout.ts';
import type { LayoutMode } from './render/layout.ts';
import { Renderer } from './render/renderer.ts';
import { Coach } from './ui/coach.ts';
import { Hud } from './ui/hud.ts';
import { Menus } from './ui/menus.ts';
import { loadSettings, recordResult, saveSettings } from './ui/settings.ts';
import { clearBattle, loadBattle, saveBattle } from './save.ts';
import { AGES } from './sim/data.ts';
import { fmtTime } from './ui/dom.ts';
import type { Settings } from './ui/settings.ts';

type AppState = 'title' | 'playing' | 'over';

/**
 * Top-level controller: owns the canvas, renderer, HUD, menus and the active game.
 * The title screen runs an AI-vs-AI battle in the background.
 */
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
  private coinTarget: [number, number] | null = null;
  private coinsSeen = 0;
  private lastSave = 0;
  private lastBuzz = -10;
  private slowSeconds = 0;
  private autoLowDone = false;
  private params = new URLSearchParams(location.search);

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
    this.hud = new Hud(this.stage, {
      pause: () => this.pause(),
      sound: (k) => {
        this.audio.ui(k);
        if (k === 'summon') this.buzz(8);
        else if (k === 'error') this.buzz([6, 40, 6]);
      },
      toggleMute: () => {
        this.settings.muted = !this.settings.muted;
        this.applySettings(this.settings);
        return this.settings.muted;
      },
      isMuted: () => this.settings.muted,
      speedChanged: (speed) => {
        this.settings.speed = speed;
        saveSettings(this.settings);
      },
    });
    this.input = new Input(this.canvas, this.renderer, this.hud);
    this.coach = new Coach(this.stage, this.settings);
    this.input.onPause = () => this.escape();
    this.menus = new Menus(this.stage, this.settings, {
      play: (d) => this.play(d),
      continueSaved: () => this.continueSaved(),
      resume: () => this.resume(),
      restart: () => {
        this.forfeit();
        this.play(this.difficulty);
      },
      quit: () => {
        this.forfeit();
        this.toTitle();
      },
      settingsChanged: (s) => this.applySettings(s),
      sound: (k) => this.audio.ui(k),
    });
    window.addEventListener('resize', () => this.resize());
    // Escape on the title screens (no battle input attached) steps back through the menus.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'title') this.escape();
      // Enter on a menu screen presses its main (gold) button, unless a button is focused.
      if (e.key === 'Enter' && this.menus.current !== 'none' && !(document.activeElement instanceof HTMLButtonElement)) {
        if (this.menus.pressPrimary()) e.preventDefault();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.persist();
      if (this.state === 'playing' && this.game && !this.game.paused) this.pause();
    });
    window.addEventListener('pagehide', () => this.persist());
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
    // Keep the game clear of notches / rounded corners (landscape phones).
    const safe = this.rotated ? { l: 0, r: 0, t: 0, b: 0 } : this.safeArea();
    const w = (this.rotated ? vh : vw) - safe.l - safe.r;
    const h = (this.rotated ? vw : vh) - safe.t - safe.b;
    this.mode = forced === 'mobile' || forced === 'desktop' ? forced : this.rotated ? 'mobile' : detectMode(w, h);
    this.width = w;
    this.height = h;
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    this.stage.style.transformOrigin = '0 0';
    this.stage.style.transform = this.rotated ? `translateX(${vw}px) rotate(90deg)` : `translate(${safe.l}px, ${safe.t}px)`;
    const toStage = (cx: number, cy: number): [number, number] => (this.rotated ? [cy, vw - cx] : [cx - safe.l, cy - safe.t]);
    this.input.toStage = toStage;
    this.hud.toStage = toStage;
    this.coach.toStage = toStage;
    this.renderer.quality = this.settings.lowQuality ? 'low' : 'high';
    this.renderer.resize(w, h, this.mode, this.settings.lowQuality ? 1 : 2);
    this.hud.setLayout(this.renderer.layout);
    this.stage.classList.toggle('mobile', this.mode === 'mobile');
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
    } else if (p.has('play')) {
      const d = p.get('play') as Difficulty;
      this.play(DIFFICULTIES.includes(d) ? d : 'adept', Number(p.get('seed') ?? 0) || undefined);
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

  private startGame(difficulty: Difficulty, seed: number | undefined, demo: boolean): Game {
    return this.hookGame(new Game({ difficulty, seed, demo }), demo);
  }

  /** Makes `game` the active game: resets visuals and routes its events. */
  private hookGame(game: Game, demo: boolean): Game {
    this.renderer.reset();
    this.renderer.setTheme(game.world.players[game.playerTeam].age, true);
    this.game = game;
    game.onEvents((ev) => {
      if (this.game !== game) return;
      this.renderer.onEvents(ev, game.world, game.view);
      this.audio.onEvents(ev);
      if (this.state === 'playing') {
        this.hud.onEvents(ev);
        this.coach.onEvents(ev);
        for (const e of ev) {
          if (e.type === 'ageUp' && e.team === game.playerTeam) this.buzz([30, 60, 30, 60, 60]);
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

  play(difficulty: Difficulty, seed?: number): void {
    this.difficulty = difficulty;
    this.settings.difficulty = difficulty;
    saveSettings(this.settings);
    clearBattle();
    const game = this.startGame(difficulty, seed, false);
    game.speed = this.settings.speed === 2 ? 2 : 1;
    this.enterBattle(game);
    this.menus.show('none');
  }

  private enterBattle(game: Game): void {
    this.immersive();
    this.state = 'playing';
    this.overTimer = -1;
    this.lastSave = game.world.time;
    this.audio.ambience = 1;
    this.audio.startMusic(game.world.players[game.playerTeam].age);
    this.hud.attach(game);
    this.input.attach(game);
    this.coach.attach(game);
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
    game.paused = true;
    this.menus.show('pause');
  }

  /** Autosave the battle in progress. */
  private persist(): void {
    const g = this.game;
    if (this.state !== 'playing' || !g || g.over || g.world.winner !== null || g.options.demo) return;
    saveBattle(g.toSave());
    this.lastSave = g.world.time;
  }

  toTitle(): void {
    // Leaving a battle from the menu abandons it.
    if (this.state === 'playing' && this.game && !this.game.options.demo) clearBattle();
    this.state = 'title';
    this.overTimer = -1;
    this.hud.detach();
    this.input.attach(null);
    this.coach.attach(null);
    this.startBackdrop();
    this.audio.ambience = 0.2;
    this.audio.startMusic(0);
    const save = loadBattle();
    this.menus.setContinue(save ? `${AGES[save.world.players[0].age].name} \u00b7 ${fmtTime(save.world.time)}` : null);
    this.menus.show('title');
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
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // unsupported
    }
  }

  /** Abandoning a battle that has properly started counts as a loss in the records. */
  private forfeit(): void {
    const g = this.game;
    if (this.state !== 'playing' || !g || g.over || g.options.demo || g.world.time < 60) return;
    recordResult(this.settings, this.difficulty, false, g.world.time);
  }

  /** Escape / P: leave a sub-menu, otherwise toggle pause. */
  private escape(): void {
    const m = this.menus.current;
    if (m === 'howto' || m === 'settings') this.menus.goBack();
    else if (m === 'difficulty') this.menus.show(this.state === 'over' ? 'over' : 'title');
    else if (this.state !== 'playing') return;
    else if (this.game?.paused) this.resume();
    else this.pause();
  }

  pause(): void {
    if (this.state !== 'playing' || !this.game || this.game.over) return;
    this.game.paused = true;
    this.menus.setPauseSummary(this.game.world, this.game.playerTeam, this.difficulty);
    this.hud.cancelTargeting();
    this.hud.hideTooltip();
    if (this.hud.panelOpen) this.hud.togglePanel('none');
    this.menus.show('pause');
  }

  resume(): void {
    if (!this.game) return;
    this.game.paused = false;
    this.menus.show('none');
  }

  private onGameOver(): void {
    const g = this.game!;
    const won = g.world.winner === g.playerTeam;
    recordResult(this.settings, this.difficulty, won, g.world.time);
    clearBattle();
    this.audio.ui(won ? 'victory' : 'defeat');
    this.overTimer = 2.6;
    this.hud.cancelTargeting();
    this.hud.banner(won ? 'Victory' : 'Defeat', won ? 'The enemy citadel crumbles' : 'Your citadel has fallen', won ? 'gold' : 'red');
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      const fps = Math.round(this.fpsFrames / this.fpsAcc);
      (window as unknown as { __fps: number }).__fps = fps;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.watchPerformance(fps);
    }
    const g = this.game;
    if (g) {
      // The title backdrop restarts when its battle ends.
      if (this.state === 'title' && g.over) this.toTitleBackdrop();
      this.renderer.coinTarget = this.state === 'playing' ? this.coinTarget : null;
      this.renderer.cinematic = this.state === 'title' && this.settings.shake;
      const alpha = g.advance(dt);
      if (this.state === 'playing' && !g.paused && g.world.time - this.lastSave >= 5) this.persist();
      this.audio.intensity = this.battleIntensity(g);
      // A paused battle is a true freeze-frame: effects stop too.
      this.renderer.render(g.world, alpha, g.paused ? 0 : dt, g.view);
      if (this.state === 'playing' || this.state === 'over') this.hud.update(dt);
      if (this.renderer.fx.coinsArrived !== this.coinsSeen) {
        this.coinsSeen = this.renderer.fx.coinsArrived;
        this.hud.pulseGold();
      }
      if (this.state === 'playing') this.coach.update(this.hud.panelOpen || this.hud.bannerShowing || this.menus.current !== 'none');
      if (this.overTimer > 0) {
        this.overTimer -= dt;
        if (this.overTimer <= 0) {
          this.state = 'over';
          this.menus.showResults(g.world, g.playerTeam, this.difficulty, g.history, g.ageUps);
        }
      }
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private battleIntensity(g: Game): number {
    if (this.state !== 'playing') return 0;
    const w = g.world;
    if (w.ragnarokStarted) return 1;
    let n = 0;
    for (const l of w.lanes) n += l.length;
    const me = w.players[g.playerTeam];
    const besieged = w.time - me.lastBaseHit < 3 ? 0.5 : 0;
    return Math.min(1, n / 28 + besieged);
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
