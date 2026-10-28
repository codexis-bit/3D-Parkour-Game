/**
 * Bausteine für prozedurale Sounds (WebAudio): Rauschstöße durch Filter und Töne mit Hüllkurve.
 * Es werden keine Audiodateien verwendet – alles entsteht zur Laufzeit.
 */

export interface NoiseHitOptions {
  type: BiquadFilterType;
  freq: number;
  /** Zielfrequenz am Ende (exponentieller Verlauf). */
  freqEnd?: number;
  q?: number;
  peak: number;
  attack: number;
  decay: number;
  /** Abspielrate des Rauschens (< 1 = dumpfer). */
  rate?: number;
  /** Startverzögerung in Sekunden. */
  delay?: number;
}

export interface ToneOptions {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  peak: number;
  attack: number;
  decay: number;
  delay?: number;
  detune?: number;
}

/** Weißes Rauschen (mono) als wiederverwendbarer Puffer. */
export function createNoiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Gain mit Attack-Decay-Hüllkurve (exponentiell, klickfrei). */
function envelope(
  ctx: BaseAudioContext,
  destination: AudioNode,
  peak: number,
  attack: number,
  decay: number,
  start: number,
): GainNode {
  const gain = ctx.createGain();
  const safePeak = Math.max(peak, 0.0002);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(safePeak, start + Math.max(attack, 0.001));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  gain.connect(destination);
  return gain;
}

export function noiseHit(
  ctx: BaseAudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  o: NoiseHitOptions,
): void {
  const start = ctx.currentTime + (o.delay ?? 0);
  const end = start + o.attack + o.decay;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = o.rate ?? 1;
  const filter = ctx.createBiquadFilter();
  filter.type = o.type;
  filter.frequency.setValueAtTime(o.freq, start);
  if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(o.freqEnd, end);
  filter.Q.value = o.q ?? 0.8;
  source.connect(filter).connect(envelope(ctx, destination, o.peak, o.attack, o.decay, start));
  const offset = Math.random() * Math.max(0, noise.duration - (end - start) - 0.1);
  source.start(start, offset);
  source.stop(end + 0.05);
}

export function tone(ctx: BaseAudioContext, destination: AudioNode, o: ToneOptions): void {
  const start = ctx.currentTime + (o.delay ?? 0);
  const end = start + o.attack + o.decay;
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, end);
  if (o.detune) osc.detune.value = o.detune;
  osc.connect(envelope(ctx, destination, o.peak, o.attack, o.decay, start));
  osc.start(start);
  osc.stop(end + 0.05);
}

/** Dauerhaft laufende, gefilterte Rauschschleife mit regelbarer Lautstärke (Wind, Slide …). */
export class NoiseLoop {
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
  private readonly source: AudioBufferSourceNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
    noise: AudioBuffer,
    type: BiquadFilterType,
    freq: number,
    q: number,
    rate = 1,
  ) {
    this.source = ctx.createBufferSource();
    this.source.buffer = noise;
    this.source.loop = true;
    this.source.playbackRate.value = rate;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = freq;
    this.filter.Q.value = q;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.filter).connect(this.gain).connect(destination);
    this.source.start();
  }

  /** Weich zu Lautstärke und Filterfrequenz übergehen. */
  set(level: number, frequency: number, smoothing = 0.08): void {
    const now = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, now, smoothing);
    this.filter.frequency.setTargetAtTime(frequency, now, smoothing);
  }

  stop(): void {
    this.source.stop();
    this.source.disconnect();
  }
}
