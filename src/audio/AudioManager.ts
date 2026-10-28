import type { EventBus } from '../core/EventBus';
import type { GameEvents, JumpKind } from '../core/events';
import { clamp } from '../core/math';
import { MoveState } from '../player/MoveState';
import { createNoiseBuffer, noiseHit, NoiseLoop, tone } from './synth';

/** Was der Sound-Manager pro Frame über den Spieler wissen muss. */
export interface AudioFrameState {
  /** Läuft gerade aktives Spiel (nicht Menü/Pause)? */
  playing: boolean;
  speed: number;
  verticalSpeed: number;
  state: MoveState;
}

/** Noten (Hz) für Jingles. */
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/**
 * Prozeduraler Sound-Manager: reagiert auf Spielereignisse (Schritte, Sprung, Landung, Slide,
 * Wall Run, Grapple, Checkpoint, Ziel …) und regelt Dauerschleifen (Wind, Slide, Wall Run) nach Tempo.
 *
 * Browser erlauben Audio erst nach einer Nutzeraktion – {@link unlock} bei Klick/Taste aufrufen.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: NoiseLoop | null = null;
  private slide: NoiseLoop | null = null;
  private wallRun: NoiseLoop | null = null;
  private volume = 0.7;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(events: EventBus<GameEvents>) {
    this.unsubscribers.push(
      events.on('footstep', ({ speed, onWall }) => this.footstep(speed, onWall)),
      events.on('jump', ({ kind }) => this.jump(kind)),
      events.on('land', ({ impactSpeed, roll }) => this.land(impactSpeed, roll)),
      events.on('slideStart', ({ boosted }) => this.slideStart(boosted)),
      events.on('wallRunStart', () => this.hit('highpass', 2600, 0.07, 0.1)),
      events.on('grappleFire', () => this.grappleFire()),
      events.on('grappleAttach', () => this.grappleAttach()),
      events.on('grappleRelease', () => this.hit('bandpass', 1200, 0.05, 0.12, 2600)),
      events.on('vault', () => this.vault()),
      events.on('jumpPad', () => this.jumpPad()),
      events.on('checkpoint', () => this.checkpoint()),
      events.on('finish', ({ newRecord }) => this.finish(newRecord)),
      events.on('death', () => this.death()),
      events.on('respawn', () =>
        this.withContext((ctx, out) => {
          tone(ctx, out, {
            type: 'sine',
            freq: 300,
            freqEnd: 620,
            peak: 0.06,
            attack: 0.01,
            decay: 0.2,
          });
        }),
      ),
      events.on('timerStart', () =>
        this.withContext((ctx, out) => {
          tone(ctx, out, { type: 'sine', freq: 880, peak: 0.05, attack: 0.003, decay: 0.07 });
        }),
      ),
    );
  }

  /** Erzeugt bzw. weckt den AudioContext – muss aus einer Nutzeraktion heraus aufgerufen werden. */
  unlock(): void {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 4;
      compressor.connect(ctx.destination);
      const master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(compressor);
      const sfx = ctx.createGain();
      sfx.connect(master);
      const ambient = ctx.createGain();
      ambient.connect(master);
      const noise = createNoiseBuffer(ctx);
      this.ctx = ctx;
      this.master = master;
      this.sfx = sfx;
      this.noise = noise;
      this.wind = new NoiseLoop(ctx, ambient, noise, 'lowpass', 400, 0.7, 0.6);
      this.slide = new NoiseLoop(ctx, ambient, noise, 'bandpass', 700, 0.9);
      this.wallRun = new NoiseLoop(ctx, ambient, noise, 'highpass', 1800, 0.7);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /** Hält den AudioContext an, solange der Tab verborgen ist (Schleifen sollen nicht weiterlaufen). */
  setSuspended(suspended: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (suspended && ctx.state === 'running') void ctx.suspend();
    else if (!suspended && ctx.state === 'suspended') void ctx.resume();
  }

  /** Dauerschleifen nachführen: Wind nach Gesamttempo, Slide/Wall Run je nach Zustand. */
  update(frame: AudioFrameState): void {
    if (!this.ctx || !this.wind || !this.slide || !this.wallRun) return;
    const total = Math.hypot(frame.speed, frame.verticalSpeed);
    const windLevel = frame.playing ? Math.pow(clamp((total - 7) / 22, 0, 1), 1.5) * 0.38 : 0;
    this.wind.set(windLevel, 280 + total * 55, 0.15);
    const sliding = frame.playing && frame.state === MoveState.Sliding;
    this.slide.set(sliding ? 0.08 + Math.min(frame.speed / 30, 0.16) : 0, 450 + frame.speed * 38);
    const wall = frame.playing && frame.state === MoveState.WallRunning;
    this.wallRun.set(wall ? 0.05 + Math.min(frame.speed / 40, 0.05) : 0, 1800 + frame.speed * 40);
  }

  /** Kurzer Klick für Menü-Buttons. */
  uiClick(): void {
    this.withContext((ctx, out) => {
      tone(ctx, out, {
        type: 'sine',
        freq: 950,
        freqEnd: 1250,
        peak: 0.05,
        attack: 0.002,
        decay: 0.05,
      });
    });
  }

  dispose(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
    this.wind?.stop();
    this.slide?.stop();
    this.wallRun?.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---------------------------------------------------------------- Sounds

  private withContext(play: (ctx: AudioContext, out: GainNode, noise: AudioBuffer) => void): void {
    const { ctx, sfx, noise } = this;
    if (!ctx || !sfx || !noise || ctx.state !== 'running') return;
    play(ctx, sfx, noise);
  }

  private hit(
    type: BiquadFilterType,
    freq: number,
    peak: number,
    decay: number,
    freqEnd?: number,
  ): void {
    this.withContext((ctx, out, noise) => {
      noiseHit(ctx, out, noise, { type, freq, freqEnd, q: 1.2, peak, attack: 0.004, decay });
    });
  }

  private footstep(speed: number, onWall: boolean): void {
    this.withContext((ctx, out, noise) => {
      const loud = 0.55 + Math.min(speed / 18, 0.6);
      const jitter = 0.85 + Math.random() * 0.3;
      if (onWall) {
        noiseHit(ctx, out, noise, {
          type: 'bandpass',
          freq: 2200 * jitter,
          q: 1.4,
          peak: 0.1 * loud,
          attack: 0.002,
          decay: 0.05,
        });
        tone(ctx, out, {
          type: 'sine',
          freq: 190 * jitter,
          freqEnd: 120,
          peak: 0.08 * loud,
          attack: 0.002,
          decay: 0.05,
        });
        return;
      }
      noiseHit(ctx, out, noise, {
        type: 'lowpass',
        freq: 1300 * jitter,
        q: 0.7,
        peak: 0.16 * loud,
        attack: 0.003,
        decay: 0.07,
      });
      tone(ctx, out, {
        type: 'sine',
        freq: 115 * jitter,
        freqEnd: 52,
        peak: 0.2 * loud,
        attack: 0.002,
        decay: 0.08,
      });
    });
  }

  private jump(kind: JumpKind): void {
    this.withContext((ctx, out, noise) => {
      noiseHit(ctx, out, noise, {
        type: 'bandpass',
        freq: 520,
        freqEnd: 1900,
        q: 1.2,
        peak: 0.12,
        attack: 0.01,
        decay: 0.18,
      });
      tone(ctx, out, {
        type: 'triangle',
        freq: 230,
        freqEnd: 420,
        peak: 0.045,
        attack: 0.005,
        decay: 0.12,
      });
      if (kind === 'wall') {
        noiseHit(ctx, out, noise, {
          type: 'highpass',
          freq: 3000,
          q: 0.7,
          peak: 0.08,
          attack: 0.002,
          decay: 0.05,
        });
      } else if (kind === 'slide') {
        tone(ctx, out, {
          type: 'sawtooth',
          freq: 110,
          freqEnd: 70,
          peak: 0.035,
          attack: 0.005,
          decay: 0.15,
        });
      }
    });
  }

  private land(impact: number, roll: boolean): void {
    if (impact < 2.5) return;
    this.withContext((ctx, out, noise) => {
      const k = clamp(impact / 20, 0.2, 1);
      tone(ctx, out, {
        type: 'sine',
        freq: 140,
        freqEnd: 40,
        peak: 0.34 * k,
        attack: 0.003,
        decay: 0.18,
      });
      noiseHit(ctx, out, noise, {
        type: 'lowpass',
        freq: 700,
        freqEnd: 180,
        q: 0.7,
        peak: 0.24 * k,
        attack: 0.003,
        decay: 0.16,
      });
      if (roll) {
        noiseHit(ctx, out, noise, {
          type: 'bandpass',
          freq: 700,
          q: 0.8,
          peak: 0.14,
          attack: 0.05,
          decay: 0.42,
          delay: 0.05,
        });
      }
    });
  }

  private slideStart(boosted: boolean): void {
    this.withContext((ctx, out, noise) => {
      noiseHit(ctx, out, noise, {
        type: 'bandpass',
        freq: 1000,
        freqEnd: 500,
        q: 0.8,
        peak: 0.14,
        attack: 0.01,
        decay: 0.25,
      });
      if (boosted) {
        tone(ctx, out, {
          type: 'sawtooth',
          freq: 95,
          freqEnd: 60,
          peak: 0.04,
          attack: 0.01,
          decay: 0.25,
        });
      }
    });
  }

  private grappleFire(): void {
    this.withContext((ctx, out, noise) => {
      noiseHit(ctx, out, noise, {
        type: 'bandpass',
        freq: 3800,
        freqEnd: 900,
        q: 2,
        peak: 0.12,
        attack: 0.004,
        decay: 0.16,
      });
      tone(ctx, out, {
        type: 'sawtooth',
        freq: 1700,
        freqEnd: 480,
        peak: 0.035,
        attack: 0.003,
        decay: 0.12,
      });
    });
  }

  private grappleAttach(): void {
    this.withContext((ctx, out, noise) => {
      for (const [freq, peak] of [
        [620, 0.08],
        [930, 0.06],
        [1470, 0.045],
      ] as const) {
        tone(ctx, out, { type: 'sine', freq, peak, attack: 0.002, decay: 0.32 });
      }
      noiseHit(ctx, out, noise, {
        type: 'highpass',
        freq: 4200,
        q: 0.7,
        peak: 0.1,
        attack: 0.001,
        decay: 0.03,
      });
    });
  }

  private vault(): void {
    this.withContext((ctx, out, noise) => {
      noiseHit(ctx, out, noise, {
        type: 'lowpass',
        freq: 600,
        q: 0.7,
        peak: 0.12,
        attack: 0.005,
        decay: 0.12,
      });
      tone(ctx, out, {
        type: 'sine',
        freq: 95,
        freqEnd: 60,
        peak: 0.12,
        attack: 0.003,
        decay: 0.1,
      });
    });
  }

  private jumpPad(): void {
    this.withContext((ctx, out, noise) => {
      tone(ctx, out, {
        type: 'sine',
        freq: 180,
        freqEnd: 720,
        peak: 0.2,
        attack: 0.01,
        decay: 0.35,
      });
      tone(ctx, out, {
        type: 'square',
        freq: 90,
        freqEnd: 260,
        peak: 0.025,
        attack: 0.01,
        decay: 0.25,
      });
      noiseHit(ctx, out, noise, {
        type: 'bandpass',
        freq: 600,
        freqEnd: 2400,
        q: 1,
        peak: 0.1,
        attack: 0.01,
        decay: 0.3,
      });
    });
  }

  private checkpoint(): void {
    this.withContext((ctx, out) => {
      [C5, E5, G5].forEach((freq, i) => {
        tone(ctx, out, {
          type: 'triangle',
          freq,
          peak: 0.11,
          attack: 0.005,
          decay: 0.35,
          delay: i * 0.07,
        });
        tone(ctx, out, {
          type: 'sine',
          freq: freq * 2,
          peak: 0.03,
          attack: 0.005,
          decay: 0.3,
          delay: i * 0.07,
        });
      });
    });
  }

  private finish(newRecord: boolean): void {
    this.withContext((ctx, out) => {
      [C5, E5, G5, C6].forEach((freq, i) => {
        tone(ctx, out, {
          type: 'triangle',
          freq,
          peak: 0.12,
          attack: 0.005,
          decay: 0.3,
          delay: i * 0.09,
        });
      });
      for (const freq of [C5, E5, G5, C6]) {
        tone(ctx, out, { type: 'sine', freq, peak: 0.05, attack: 0.05, decay: 1.3, delay: 0.4 });
      }
      if (newRecord) {
        for (let i = 0; i < 6; i++) {
          tone(ctx, out, {
            type: 'sine',
            freq: 2093 * (1 + Math.random() * 0.3),
            peak: 0.03,
            attack: 0.003,
            decay: 0.25,
            delay: 0.5 + i * 0.08,
          });
        }
      }
    });
  }

  private death(): void {
    this.withContext((ctx, out, noise) => {
      tone(ctx, out, {
        type: 'sawtooth',
        freq: 320,
        freqEnd: 60,
        peak: 0.08,
        attack: 0.005,
        decay: 0.45,
      });
      noiseHit(ctx, out, noise, {
        type: 'lowpass',
        freq: 900,
        freqEnd: 100,
        q: 0.7,
        peak: 0.2,
        attack: 0.005,
        decay: 0.4,
      });
    });
  }
}
