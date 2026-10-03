import { Audio } from './audio/audio.ts';
import { Game } from './game.ts';
import { DIFFICULTIES } from './ai/ai.ts';
import type { Difficulty } from './ai/ai.ts';
import { Input } from './input.ts';
import { detectMode } from './render/layout.ts';
import type { LayoutMode } from './render/layout.ts';
import { Renderer } from './render/renderer.ts';
import { Hud } from './ui/hud.ts';
import { Menus } from './ui/menus.ts';
import { loadSettings, recordResult, saveSettings } from './ui/settings.ts';
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
      sound: (k) => this.audio.ui(k),
    });
    this.input = new Input(this.canvas, this.renderer, this.hud);
    this.input.onPause = () => (this.game?.paused ? this.resume() : this.pause());
    this.menus = new Menus(this.stage, this.settings, {
      play: (d) => this.play(d),
      resume: () => this.resume(),
      restart: () => this.play(this.difficulty),
      quit: () => this.toTitle(),
      settingsChanged: (s) => this.applySettings(s),
      sound: (k) => this.audio.ui(k),
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && this.game && !this.game.paused) this.pause();
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
    const w = this.rotated ? vh : vw;
    const h = this.rotated ? vw : vh;
    this.mode = forced === 'mobile' || forced === 'desktop' ? forced : this.rotated ? 'mobile' : detectMode(w, h);
    this.width = w;
    this.height = h;
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    this.stage.style.transformOrigin = '0 0';
    this.stage.style.transform = this.rotated ? `translateX(${vw}px) rotate(90deg)` : '';
    const toStage = (cx: number, cy: number): [number, number] => (this.rotated ? [cy, vw - cx] : [cx, cy]);
    this.input.toStage = toStage;
    this.hud.toStage = toStage;
    this.renderer.quality = this.settings.lowQuality ? 'low' : 'high';
    this.renderer.resize(w, h, this.mode, this.settings.lowQuality ? 1 : 2);
    this.hud.setLayout(this.renderer.layout);
    this.stage.classList.toggle('mobile', this.mode === 'mobile');
  }

  applySettings(s: Settings): void {
    saveSettings(s);
    this.audio.setVolumes(s.master, s.music, s.sfx);
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
    this.renderer.reset();
    this.renderer.setTheme(0, true);
    const game = new Game({ difficulty, seed, demo });
    this.game = game;
    game.onEvents((ev) => {
      if (this.game !== game) return;
      this.renderer.onEvents(ev, game.world, game.view);
      this.audio.onEvents(ev);
      if (this.state === 'playing') this.hud.onEvents(ev);
      for (const e of ev) if (e.type === 'gameOver' && this.state === 'playing' && !demo) this.onGameOver();
    });
    return game;
  }

  play(difficulty: Difficulty, seed?: number): void {
    this.difficulty = difficulty;
    this.settings.difficulty = difficulty;
    saveSettings(this.settings);
    const game = this.startGame(difficulty, seed, false);
    this.state = 'playing';
    this.overTimer = -1;
    this.audio.ambience = 1;
    this.audio.startMusic(0);
    this.menus.show('none');
    this.hud.attach(game);
    this.input.attach(game);
  }

  toTitle(): void {
    this.state = 'title';
    this.overTimer = -1;
    this.hud.detach();
    this.input.attach(null);
    const demo = this.startGame('adept', (Math.random() * 1e9) | 0, true);
    // Start the backdrop battle mid-skirmish.
    demo.fastForward(40);
    this.audio.ambience = 0.2;
    this.audio.startMusic(0);
    this.menus.show('title');
  }

  pause(): void {
    if (this.state !== 'playing' || !this.game || this.game.over) return;
    this.game.paused = true;
    this.hud.cancelTargeting();
    this.hud.hideTooltip();
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
      (window as unknown as { __fps: number }).__fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    const g = this.game;
    if (g) {
      // The title backdrop restarts when its battle ends.
      if (this.state === 'title' && g.over) this.toTitleBackdrop();
      const alpha = g.advance(dt);
      this.audio.intensity = this.battleIntensity(g);
      this.renderer.render(g.world, alpha, dt, g.view);
      if (this.state === 'playing' || this.state === 'over') this.hud.update(dt);
      if (this.overTimer > 0) {
        this.overTimer -= dt;
        if (this.overTimer <= 0) {
          this.state = 'over';
          this.menus.showResults(g.world, g.playerTeam, this.difficulty);
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
    const demo = this.startGame('adept', (Math.random() * 1e9) | 0, true);
    demo.fastForward(20);
  }
}
