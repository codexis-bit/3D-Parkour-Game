import * as THREE from 'three';
import type { GrappleMode } from '../level/types';

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

/**
 * Head-up-Display: Fadenkreuz mit Grapple-Indikator und Markierung des anvisierten Grapple-Punkts.
 * (Timer, Tempo und Meldungen kommen mit dem UI-Meilenstein dazu.)
 */
export class HUD {
  readonly root: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly markerLabel: HTMLSpanElement;
  private readonly projected = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="crosshair"><span></span></div>
      <div class="grapple-marker" hidden><span class="grapple-marker__label"></span></div>`;
    parent.append(this.root);
    this.crosshair = this.root.querySelector('.crosshair') as HTMLDivElement;
    this.marker = this.root.querySelector('.grapple-marker') as HTMLDivElement;
    this.markerLabel = this.root.querySelector('.grapple-marker__label') as HTMLSpanElement;
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
