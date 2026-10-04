import { LANE_LENGTH } from '../sim/data.ts';
import type { SimEvent, Team } from '../sim/types.ts';

/**
 * Fully synthesized audio: WebAudio sound effects and a generative score per age.
 * No audio files are shipped. The context starts on the first user gesture.
 */

type Scale = { root: number; steps: number[]; chords: number[][]; lead: OscillatorType; bpm: number };

// Semitone offsets from the root; chords are scale-degree triads (indexes into steps).
const SCALES: Scale[] = [
  // Fae Wilds — D dorian, airy flute plucks
  { root: 62, steps: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 2, 4], [6, 1, 3], [3, 5, 0], [4, 6, 1]], lead: 'sine', bpm: 84 },
  // Olympus — C lydian harp
  { root: 60, steps: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 2, 4], [1, 3, 5], [4, 6, 1], [0, 2, 4]], lead: 'triangle', bpm: 92 },
  // Asgard — A aeolian, low horns
  { root: 57, steps: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [6, 1, 3]], lead: 'sawtooth', bpm: 76 },
  // Jade Empire — pentatonic koto
  { root: 64, steps: [0, 2, 4, 7, 9], chords: [[0, 2, 3], [1, 3, 4], [4, 1, 2], [2, 4, 0]], lead: 'triangle', bpm: 96 },
  // Celestial — E major bells
  { root: 64, steps: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], lead: 'sine', bpm: 80 },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise: AudioBuffer | null = null;
  private volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private lastPlayed = new Map<string, number>();
  private musicAge = 0;
  private musicOn = false;
  private nextBar = 0;
  private bar = 0;
  private schedTimer = 0;
  /** 0..1 battle intensity — adds percussion to the score. */
  intensity = 0;
  /** Effects volume scale (the title backdrop battle plays quietly). */
  ambience = 1;
  playerTeam: Team = 0;

  constructor() {
    const unlock = () => {
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    };
    // iOS Safari only unlocks audio inside touchend/click handlers, so listen to all of them.
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, { capture: true });
  }

  /** Silence everything while the page is hidden (the battle pauses too). */
  setHidden(hidden: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden && ctx.state === 'running') void ctx.suspend();
    else if (!hidden && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private ensure(): void {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.musicOn) this.startScheduler();
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.32, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.6, t, 0.05);
  }

  // -------------------------------------------------------------------------
  // Primitives
  // -------------------------------------------------------------------------

  /** Rate limiting so dozens of simultaneous hits don't turn into noise. */
  private allow(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(key) ?? -1;
    if (now - last < gap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private out(pan: number, vol: number): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol * this.ambience;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      g.connect(this.sfxBus);
    }
    return g;
  }

  private tone(o: { freq: number; to?: number; type?: OscillatorType; dur: number; vol: number; pan?: number; attack?: number; delay?: number; bus?: AudioNode }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(o.bus ?? this.out(o.pan ?? 0, 1));
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noiseBurst(o: { dur: number; vol: number; freq: number; q?: number; type?: BiquadFilterType; pan?: number; delay?: number; sweep?: number }): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep), t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(o.pan ?? 0, 1));
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  // -------------------------------------------------------------------------
  // Sound effects
  // -------------------------------------------------------------------------

  ui(kind: string): void {
    this.ensure();
    if (!this.ctx) return;
    const saved = this.ambience;
    this.ambience = 1;
    switch (kind) {
      case 'click':
        this.tone({ freq: 880, to: 660, dur: 0.07, vol: 0.18 });
        break;
      case 'select':
        this.tone({ freq: 620, dur: 0.06, vol: 0.12, type: 'triangle' });
        break;
      case 'summon':
        this.tone({ freq: 520, to: 780, dur: 0.14, vol: 0.16, type: 'triangle' });
        this.tone({ freq: 1040, dur: 0.18, vol: 0.06, delay: 0.05 });
        break;
      case 'error':
        this.tone({ freq: 150, to: 110, dur: 0.16, vol: 0.14, type: 'square' });
        break;
      case 'bless':
        [0, 4, 7, 12].forEach((n, i) => this.tone({ freq: midi(72 + n), dur: 0.5, vol: 0.09, delay: i * 0.06 }));
        break;
      case 'build':
        this.noiseBurst({ dur: 0.25, vol: 0.4, freq: 300, type: 'lowpass' });
        this.tone({ freq: 220, to: 330, dur: 0.2, vol: 0.12, type: 'triangle', delay: 0.05 });
        break;
      case 'sell':
        this.tone({ freq: 990, dur: 0.08, vol: 0.1 });
        this.tone({ freq: 1320, dur: 0.12, vol: 0.08, delay: 0.06 });
        break;
      case 'cancel':
        this.tone({ freq: 500, to: 350, dur: 0.1, vol: 0.1, type: 'triangle' });
        break;
      case 'power':
        this.tone({ freq: 300, to: 900, dur: 0.3, vol: 0.12, type: 'sawtooth' });
        break;
      case 'victory':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone({ freq: midi(60 + n), dur: 1.4 - i * 0.1, vol: 0.12, type: 'triangle', delay: i * 0.14 }));
        [0, 7, 12].forEach((n) => this.tone({ freq: midi(48 + n), dur: 2.2, vol: 0.1, type: 'sawtooth', attack: 0.2, delay: 0.7 }));
        break;
      case 'defeat':
        [0, 3, 7].forEach((n, i) => this.tone({ freq: midi(57 + n), to: midi(55 + n), dur: 2, vol: 0.1, type: 'triangle', delay: i * 0.25, attack: 0.1 }));
        break;
    }
    this.ambience = saved;
  }

  private panFor(x: number): number {
    return ((x / LANE_LENGTH) * 2 - 1) * 0.7;
  }

  onEvents(events: SimEvent[]): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (e.source === 'unit' && this.allow('hit', 0.07)) {
            this.noiseBurst({ dur: 0.08, vol: 0.32, freq: 900 + Math.random() * 900, q: 1.5, pan: this.panFor(e.x) });
            this.tone({ freq: 140 + Math.random() * 40, to: 70, dur: 0.1, vol: 0.18, pan: this.panFor(e.x) });
            if (e.mult > 1 && this.allow('crit', 0.15)) this.tone({ freq: 1500, to: 1100, dur: 0.08, vol: 0.06, pan: this.panFor(e.x) });
          }
          break;
        case 'projectile':
          if (e.fromTurret) {
            if (this.allow('turret', 0.12)) this.noiseBurst({ dur: 0.12, vol: 0.25, freq: 600, sweep: 200, q: 2, pan: e.team === 0 ? -0.7 : 0.7 });
          } else if (this.allow('shoot', 0.09)) {
            const fire = e.kind === 'flame' || e.kind === 'dragonfire';
            if (fire) this.noiseBurst({ dur: 0.3, vol: 0.25, freq: 500, type: 'lowpass', sweep: 1500 });
            else this.tone({ freq: e.kind === 'gaze' ? 300 : 1200 + Math.random() * 300, to: e.kind === 'gaze' ? 500 : 500, dur: 0.12, vol: 0.06, type: e.kind === 'gaze' ? 'sawtooth' : 'sine' });
          }
          break;
        case 'impact':
          if (e.splash > 0 && this.allow('boom', 0.1)) {
            this.noiseBurst({ dur: 0.4, vol: 0.35, freq: 400, type: 'lowpass', sweep: 80, pan: this.panFor(e.x) });
            this.tone({ freq: 90, to: 40, dur: 0.35, vol: 0.25, pan: this.panFor(e.x) });
          }
          break;
        case 'death':
          if (this.allow('death', 0.08)) {
            this.tone({ freq: 500 + Math.random() * 200, to: 160, dur: 0.25, vol: 0.07, type: 'triangle', pan: this.panFor(e.x) });
            if (e.team !== this.playerTeam && this.allow('coin', 0.12)) {
              this.tone({ freq: 1760, dur: 0.07, vol: 0.05, delay: 0.05 });
              this.tone({ freq: 2349, dur: 0.12, vol: 0.05, delay: 0.11 });
            }
          }
          break;
        case 'spawn':
          if (this.allow('spawn' + e.team, 0.2)) this.tone({ freq: 330, to: 660, dur: 0.18, vol: 0.06, type: 'triangle', pan: e.team === 0 ? -0.7 : 0.7 });
          break;
        case 'baseHit':
          if (this.allow('base' + e.team, 0.35)) {
            this.tone({ freq: 70, to: 45, dur: 0.3, vol: e.team === this.playerTeam ? 0.3 : 0.16, pan: e.team === 0 ? -0.8 : 0.8 });
            this.noiseBurst({ dur: 0.2, vol: 0.18, freq: 250, type: 'lowpass', pan: e.team === 0 ? -0.8 : 0.8 });
          }
          break;
        case 'ageUp': {
          const mine = e.team === this.playerTeam;
          const base = mine ? 60 : 55;
          [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone({ freq: midi(base + n), dur: 1.6, vol: mine ? 0.1 : 0.05, type: 'triangle', delay: i * 0.09, attack: 0.02 }));
          this.tone({ freq: midi(base - 12), dur: 2.4, vol: mine ? 0.14 : 0.06, type: 'sawtooth', attack: 0.3 });
          if (mine) this.setMusicAge(e.age);
          break;
        }
        case 'shrine':
          if (e.owner === this.playerTeam) [0, 7, 12].forEach((n, i) => this.tone({ freq: midi(76 + n), dur: 0.5, vol: 0.07, delay: i * 0.07 }));
          else if (e.owner !== -1) [0, 6].forEach((n, i) => this.tone({ freq: midi(52 + n), dur: 0.6, vol: 0.08, type: 'triangle', delay: i * 0.12 }));
          break;
        case 'power':
          // Enemy casts get a rising two-note warning first, so players look up.
          if (e.team !== this.playerTeam) {
            this.tone({ freq: 440, to: 660, dur: 0.18, vol: 0.12, type: 'square' });
            this.tone({ freq: 440, to: 880, dur: 0.22, vol: 0.1, type: 'square', delay: 0.2 });
          }
          this.powerSound(e.kind);
          break;
        case 'strike':
          if (e.kind === 'zeus' && this.allow('zeus', 0.05)) {
            this.noiseBurst({ dur: 0.5, vol: 0.5, freq: 3000, type: 'highpass', sweep: 600 });
            this.tone({ freq: 80, to: 35, dur: 0.6, vol: 0.3 });
          } else if (e.kind === 'starfall' && this.allow('starfall', 0.06)) {
            this.noiseBurst({ dur: 0.6, vol: 0.45, freq: 600, type: 'lowpass', sweep: 60, pan: this.panFor(e.x) });
            this.tone({ freq: 70, to: 30, dur: 0.5, vol: 0.3 });
          } else if (e.kind === 'briar' && this.allow('briar', 0.05)) {
            this.noiseBurst({ dur: 0.25, vol: 0.25, freq: 1800, q: 3, pan: this.panFor(e.x) });
          } else if (e.kind === 'fimbul' && this.allow('fimbul', 0.05)) {
            this.tone({ freq: 2000 + Math.random() * 800, dur: 0.3, vol: 0.05, pan: this.panFor(e.x) });
          } else if (e.kind === 'spiritdragon' && this.allow('sdragon', 0.08)) {
            this.tone({ freq: 900, to: 1400, dur: 0.15, vol: 0.06, pan: this.panFor(e.x) });
          }
          break;
        case 'meteor':
          if (this.allow('meteor', 0.12)) this.tone({ freq: 1800, to: 300, dur: e.fall, vol: 0.05, pan: this.panFor(e.x) });
          break;
        case 'rebirth':
          [0, 5, 9, 12].forEach((n, i) => this.tone({ freq: midi(69 + n), dur: 0.6, vol: 0.07, delay: i * 0.05 }));
          break;
        case 'ragnarok':
          this.tone({ freq: 55, to: 41, dur: 3, vol: 0.35, type: 'sawtooth', attack: 0.4 });
          this.noiseBurst({ dur: 2.5, vol: 0.4, freq: 200, type: 'lowpass', sweep: 60 });
          break;
        default:
          break;
      }
    }
  }

  private powerSound(kind: string): void {
    switch (kind) {
      case 'briar':
        this.noiseBurst({ dur: 0.9, vol: 0.35, freq: 1200, q: 0.8, sweep: 300 });
        break;
      case 'zeus':
        this.tone({ freq: 60, to: 40, dur: 1.6, vol: 0.25, type: 'sawtooth', attack: 0.2 });
        break;
      case 'fimbul':
        this.noiseBurst({ dur: 2.4, vol: 0.4, freq: 900, q: 0.6, sweep: 2400 });
        [0, 3, 7].forEach((n, i) => this.tone({ freq: midi(84 + n), dur: 1.2, vol: 0.05, delay: 0.3 + i * 0.1 }));
        break;
      case 'spiritdragon':
        this.tone({ freq: 220, to: 660, dur: 1.4, vol: 0.12, type: 'sawtooth', attack: 0.2 });
        this.noiseBurst({ dur: 2, vol: 0.3, freq: 700, q: 0.7, sweep: 2000 });
        break;
      case 'starfall':
        [0, 4, 7, 11].forEach((n, i) => this.tone({ freq: midi(84 + n), dur: 1.5, vol: 0.05, delay: i * 0.12 }));
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Generative music
  // -------------------------------------------------------------------------

  startMusic(age: number): void {
    this.musicAge = age;
    this.bar = 0;
    this.musicOn = true;
    // Don't create the AudioContext here: browsers only allow it after a user gesture. The
    // unlock listener creates it on the first tap/click/key and then starts the score.
    if (this.ctx) this.startScheduler();
  }

  setMusicAge(age: number): void {
    if (age === this.musicAge) return;
    this.musicAge = age;
    // Start the new age's progression from its first chord, right after the ascension fanfare.
    this.bar = 0;
    if (this.ctx) this.nextBar = Math.max(this.nextBar, this.ctx.currentTime + 1.4);
  }

  stopMusic(): void {
    this.musicOn = false;
  }

  private startScheduler(): void {
    if (!this.ctx || this.schedTimer) return;
    this.nextBar = this.ctx.currentTime + 0.2;
    this.schedTimer = window.setInterval(() => this.schedule(), 200);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn || ctx.state !== 'running') return;
    // After a stall (backgrounded tab, suspended context) don't replay every missed bar at once.
    if (this.nextBar < ctx.currentTime - 0.1) this.nextBar = ctx.currentTime + 0.1;
    while (this.nextBar < ctx.currentTime + 0.6) {
      this.scheduleBar(this.nextBar);
      const sc = SCALES[this.musicAge];
      this.nextBar += (60 / sc.bpm) * 4;
      this.bar++;
    }
  }

  private scheduleBar(t0: number): void {
    const ctx = this.ctx!;
    const sc = SCALES[this.musicAge];
    const beat = 60 / sc.bpm;
    const barLen = beat * 4;
    const chord = sc.chords[Math.floor(this.bar / 2) % sc.chords.length];
    const note = (deg: number, oct = 0) => {
      const n = sc.steps.length;
      const o = Math.floor(deg / n);
      return sc.root + sc.steps[((deg % n) + n) % n] + 12 * (o + oct);
    };
    // Pad: soft detuned chord swelling over two bars
    if (this.bar % 2 === 0) {
      for (const d of chord) {
        for (const det of [-6, 6]) {
          const osc = ctx.createOscillator();
          osc.type = this.musicAge === 2 ? 'sawtooth' : 'triangle';
          osc.frequency.value = midi(note(d, -1));
          osc.detune.value = det;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = this.musicAge === 2 ? 700 : 1400;
          const g = ctx.createGain();
          const dur = barLen * 2;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.35);
          g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.4);
          osc.connect(f);
          f.connect(g);
          g.connect(this.musicBus);
          osc.start(t0);
          osc.stop(t0 + dur + 0.5);
        }
      }
      // Bass
      const b = ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = midi(note(chord[0], -2));
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.linearRampToValueAtTime(0.12, t0 + 0.1);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + barLen * 2);
      b.connect(bg);
      bg.connect(this.musicBus);
      b.start(t0);
      b.stop(t0 + barLen * 2 + 0.1);
    }
    // Lead: sparse arpeggio over the chord
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      if (Math.random() < 0.45) continue;
      const deg = chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.3 ? 1 : 0);
      const t = t0 + (i * barLen) / steps;
      const osc = ctx.createOscillator();
      osc.type = sc.lead;
      osc.frequency.value = midi(note(deg, Math.random() < 0.3 ? 1 : 0));
      const g = ctx.createGain();
      const vol = sc.lead === 'sawtooth' ? 0.025 : 0.06;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.6);
      let node: AudioNode = osc;
      if (sc.lead === 'sawtooth') {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1100;
        osc.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(this.musicBus);
      osc.start(t);
      osc.stop(t + beat * 1.7);
    }
    // War drums with battle intensity
    if (this.intensity > 0.15 && this.noise) {
      for (let i = 0; i < 4; i++) {
        if (i % 2 === 1 && this.intensity < 0.5) continue;
        const t = t0 + i * beat;
        const k = ctx.createOscillator();
        k.frequency.setValueAtTime(110, t);
        k.frequency.exponentialRampToValueAtTime(45, t + 0.25);
        const kg = ctx.createGain();
        kg.gain.setValueAtTime(0.0001, t);
        kg.gain.exponentialRampToValueAtTime(0.22 * this.intensity, t + 0.01);
        kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        k.connect(kg);
        kg.connect(this.musicBus);
        k.start(t);
        k.stop(t + 0.4);
      }
    }
  }
}
