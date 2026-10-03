import { Game } from './game.ts';
import type { Difficulty } from './ai/ai.ts';
import { Input } from './input.ts';
import { detectMode } from './render/layout.ts';
import type { LayoutMode } from './render/layout.ts';
import { Renderer } from './render/renderer.ts';
import { Hud } from './ui/hud.ts';

export class App {
  readonly root: HTMLElement;
  readonly stage: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly input: Input;
  game: Game | null = null;
  mode: LayoutMode = 'desktop';
  width = 0;
  height = 0;
  private last = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private params = new URLSearchParams(location.search);

  constructor(root: HTMLElement) {
    this.root = root;
    this.stage = document.createElement('div');
    this.stage.id = 'stage';
    root.appendChild(this.stage);
    this.canvas = document.createElement('canvas');
    this.stage.appendChild(this.canvas);
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud(this.stage, {
      pause: () => this.togglePause(),
      sound: () => {},
    });
    this.input = new Input(this.canvas, this.renderer, this.hud);
    this.input.onPause = () => this.togglePause();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const forced = this.params.get('mode');
    this.mode = forced === 'mobile' || forced === 'desktop' ? forced : detectMode(w, h);
    this.width = w;
    this.height = h;
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    this.renderer.resize(w, h, this.mode, 2);
    this.hud.setLayout(this.renderer.layout);
  }

  togglePause(): void {
    if (!this.game) return;
    this.game.paused = !this.game.paused;
  }

  start(): void {
    const diff = (this.params.get('difficulty') ?? 'adept') as Difficulty;
    const seed = Number(this.params.get('seed') ?? 7);
    this.startGame(diff, seed, this.params.has('demo'));
    const ff = Number(this.params.get('ff') ?? 0);
    if (ff > 0 && this.game) {
      this.game.fastForward(ff);
      this.renderer.setTheme(this.game.world.players[0].age, true);
    }
    const theme = this.params.get('theme');
    if (theme !== null) this.renderer.setTheme(Number(theme), true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  startGame(difficulty: Difficulty, seed: number | undefined, demo: boolean): void {
    this.renderer.reset();
    this.renderer.setTheme(0, true);
    const game = new Game({ difficulty, seed, demo });
    this.game = game;
    game.onEvents((ev) => {
      this.renderer.onEvents(ev, game.world, game.view);
      this.hud.onEvents(ev);
    });
    this.hud.attach(game);
    this.input.attach(game);
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
    if (this.game) {
      const alpha = this.game.advance(dt);
      this.game.render(this.renderer, alpha, dt);
      this.hud.update(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
