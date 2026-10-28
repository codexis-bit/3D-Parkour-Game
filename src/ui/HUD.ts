import * as THREE from 'three';
import { clamp } from '../core/math';
import type { GrappleMode } from '../level/types';
import { formatSpeed, formatTime } from './format';

/** Zustand des Grapple-Indikators im Fadenkreuz. */
export interface GrappleIndicator {
  /** Weltposition des anvisierten Punkts, null wenn keiner in Reichweite. */
  target: THREE.Vector3 | null;
  mode: GrappleMode | null;
  /** Seil hängt gerade an einem Punkt. */
  attached: boolean;
  /** Cooldown läuft noch. */
  cooling: boolean;
}

const MODE_LABEL: Record<GrappleMode, string> = { pull: 'ZIEHEN', swing: 'SCHWINGEN' };

export type TimerState = 'waiting' | 'running' | 'finished';

/**
 * Head-up-Display: Timer (ms), Tempo, Level/Checkpoints, Fadenkreuz mit Grapple-Indikator,
 * Markierung des anvisierten Grapple-Punkts, Meldungen und Tutorial-Hinweise.
 */
export class HUD {
  readonly root: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly markerLabel: HTMLSpanElement;
  private readonly toastBox: HTMLDivElement;
  private readonly flashBox: HTMLDivElement;
  private readonly speedFx: HTMLDivElement;
  private readonly hintBox: HTMLDivElement;
  private readonly levelName: HTMLSpanElement;
  private readonly levelCheckpoints: HTMLSpanElement;
  private readonly timerTime: HTMLDivElement;
  private readonly timerSub: HTMLDivElement;
  private readonly speedValue: HTMLSpanElement;
  private readonly speedUnit: HTMLSpanElement;
  private readonly speedBar: HTMLSpanElement;
  private lastTimerText = '';
  private lastSpeedText = '';
  private readonly projected = new THREE.Vector3();
  private toastTimer = 0;
  private lastSpeedFx = -1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="speed-fx"></div>
      <div class="hud-level"><span class="hud-level__name"></span><span class="hud-level__cp"></span></div>
      <div class="hud-timer"><div class="hud-timer__time">00:00.000</div><div class="hud-timer__sub"></div></div>
      <div class="hud-speed">
        <div><span class="hud-speed__value">0</span><span class="hud-speed__unit">km/h</span></div>
        <div class="hud-speed__bar"><span></span></div>
      </div>
      <div class="crosshair"><span></span></div>
      <div class="grapple-marker" hidden><span class="grapple-marker__label"></span></div>
      <div class="toast" hidden></div>
      <div class="hint-box" hidden></div>
      <div class="flash"></div>`;
    parent.append(this.root);
    this.crosshair = this.root.querySelector('.crosshair') as HTMLDivElement;
    this.marker = this.root.querySelector('.grapple-marker') as HTMLDivElement;
    this.markerLabel = this.root.querySelector('.grapple-marker__label') as HTMLSpanElement;
    this.toastBox = this.root.querySelector('.toast') as HTMLDivElement;
    this.flashBox = this.root.querySelector('.flash') as HTMLDivElement;
    this.speedFx = this.root.querySelector('.speed-fx') as HTMLDivElement;
    this.hintBox = this.root.querySelector('.hint-box') as HTMLDivElement;
    this.levelName = this.root.querySelector('.hud-level__name') as HTMLSpanElement;
    this.levelCheckpoints = this.root.querySelector('.hud-level__cp') as HTMLSpanElement;
    this.timerTime = this.root.querySelector('.hud-timer__time') as HTMLDivElement;
    this.timerSub = this.root.querySelector('.hud-timer__sub') as HTMLDivElement;
    this.speedValue = this.root.querySelector('.hud-speed__value') as HTMLSpanElement;
    this.speedUnit = this.root.querySelector('.hud-speed__unit') as HTMLSpanElement;
    this.speedBar = this.root.querySelector('.hud-speed__bar span') as HTMLSpanElement;
  }

  /** Levelname und Referenzzeiten unter dem Timer. */
  setLevel(name: string, best: number | null, par: number | null): void {
    this.levelName.textContent = name;
    const parts: string[] = [];
    if (best !== null) parts.push(`Bestzeit ${formatTime(best)}`);
    if (par !== null) parts.push(`Richtzeit ${formatTime(par)}`);
    this.timerSub.textContent = parts.join('  ·  ');
    this.timerSub.dataset.waiting = '';
  }

  setCheckpoint(reached: number, total: number): void {
    this.levelCheckpoints.textContent = total > 0 ? `Checkpoint ${reached}/${total}` : '';
  }

  setTimer(seconds: number, state: TimerState): void {
    const text = formatTime(seconds);
    if (text !== this.lastTimerText) {
      this.timerTime.textContent = text;
      this.lastTimerText = text;
    }
    this.timerTime.dataset.state = state;
  }

  setSpeed(metersPerSecond: number, unit: 'ms' | 'kmh'): void {
    const formatted = formatSpeed(metersPerSecond, unit);
    const text = `${formatted.value}${formatted.unit}`;
    if (text !== this.lastSpeedText) {
      this.speedValue.textContent = formatted.value;
      this.speedUnit.textContent = formatted.unit;
      this.lastSpeedText = text;
    }
    const ratio = clamp(metersPerSecond / 28, 0, 1);
    this.speedBar.style.transform = `scaleX(${ratio.toFixed(3)})`;
    this.speedBar.dataset.level = ratio > 0.62 ? 'fast' : ratio > 0.33 ? 'medium' : 'slow';
  }

  /** Tempo-Vignette am Bildrand (0 = aus, 1 = volle Stärke). */
  setSpeedEffect(intensity: number): void {
    const value = Math.round(clamp(intensity, 0, 1) * 100) / 100;
    if (value === this.lastSpeedFx) return;
    this.lastSpeedFx = value;
    this.speedFx.style.opacity = value.toFixed(2);
  }

  /** Tutorial-Hinweis unten in der Bildmitte; Text in [eckigen Klammern] wird als Taste dargestellt. */
  setHint(text: string | null): void {
    if (!text) {
      this.hintBox.hidden = true;
      return;
    }
    this.hintBox.replaceChildren(...renderKeyText(text));
    this.hintBox.hidden = false;
  }

  /** Kurze Meldung oben in der Bildmitte (z. B. „Checkpoint 2/4“). */
  toast(text: string, kind: 'good' | 'info' = 'info', seconds = 1.6): void {
    this.toastBox.textContent = text;
    this.toastBox.dataset.kind = kind;
    this.toastBox.hidden = false;
    // Animation neu starten
    this.toastBox.classList.remove('toast--show');
    void this.toastBox.offsetWidth;
    this.toastBox.classList.add('toast--show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastBox.hidden = true;
    }, seconds * 1000);
  }

  /** Roter Blitz beim Tod / Respawn. */
  flash(): void {
    this.flashBox.classList.remove('flash--on');
    void this.flashBox.offsetWidth;
    this.flashBox.classList.add('flash--on');
  }

  set visible(visible: boolean) {
    this.root.hidden = !visible;
  }

  /** Projiziert den anvisierten Punkt auf den Bildschirm und färbt das Fadenkreuz. */
  updateGrapple(indicator: GrappleIndicator, camera: THREE.Camera): void {
    const { target } = indicator;
    this.crosshair.classList.toggle('crosshair--target', target !== null && !indicator.cooling);
    this.crosshair.classList.toggle('crosshair--attached', indicator.attached);
    if (!target || indicator.attached) {
      this.marker.hidden = true;
      return;
    }
    this.projected.copy(target).project(camera);
    if (this.projected.z > 1) {
      this.marker.hidden = true;
      return;
    }
    const x = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    this.marker.hidden = false;
    this.marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.marker.classList.toggle('grapple-marker--cooling', indicator.cooling);
    this.markerLabel.textContent = indicator.mode ? MODE_LABEL[indicator.mode] : '';
  }
}

/** Zerlegt „Drücke [Leertaste]“ in Text- und <kbd>-Knoten (ohne innerHTML, also XSS-sicher). */
export function renderKeyText(text: string): Node[] {
  const nodes: Node[] = [];
  const pattern = /\[([^\]]+)\]/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(document.createTextNode(text.slice(last, index)));
    const kbd = document.createElement('kbd');
    kbd.textContent = match[1] ?? '';
    nodes.push(kbd);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}
