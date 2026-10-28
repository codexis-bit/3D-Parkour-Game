import * as THREE from 'three';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { easeInOutSine } from '../core/math';
import type { Physics, PlatformMotion } from '../core/Physics';
import type { Vec3 } from './types';

export type PathMode = 'pingpong' | 'loop';

/**
 * Position auf einem Wegpunkt-Pfad zum Zeitpunkt `time` (rein, deterministisch).
 *
 * Zwischen zwei Wegpunkten wird mit Ease-in-out interpoliert, an jedem Wegpunkt `wait` Sekunden
 * gewartet. `pingpong` läuft hin und zurück, `loop` schließt den Pfad zum ersten Punkt.
 */
export function samplePath(
  points: readonly Vec3[],
  mode: PathMode,
  speed: number,
  wait: number,
  time: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const first = points[0];
  if (!first) return out.set(0, 0, 0);
  if (points.length < 2 || speed <= 0) return out.set(first[0], first[1], first[2]);

  // Reihenfolge der angefahrenen Punkte für einen vollständigen Zyklus.
  const order: Vec3[] =
    mode === 'loop' ? [...points, first] : [...points, ...points.slice(0, -1).reverse()];
  const durations: number[] = [];
  let cycle = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i]!;
    const b = order[i + 1]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / speed;
    durations.push(d);
    cycle += d + wait;
  }
  let t = ((time % cycle) + cycle) % cycle;
  for (let i = 0; i < durations.length; i++) {
    const a = order[i]!;
    const b = order[i + 1]!;
    if (t < wait) return out.set(a[0], a[1], a[2]);
    t -= wait;
    const d = durations[i]!;
    if (t < d) {
      const u = easeInOutSine(d > 0 ? t / d : 1);
      return out.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    }
    t -= d;
  }
  return out.set(first[0], first[1], first[2]);
}

export interface MovingPlatformOptions {
  size: Vec3;
  path: readonly Vec3[];
  speed: number;
  wait: number;
  mode: PathMode;
  offset: number;
}

/**
 * Kinematische Plattform, die einem Pfad folgt. Stellt ihre Bewegung pro Tick als
 * {@link PlatformMotion} bereit, damit der Spieler mitfährt und beim Absprung Schwung erbt.
 */
export class MovingPlatform implements PlatformMotion {
  readonly delta = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly position = new THREE.Vector3();
  readonly previous = new THREE.Vector3();
  readonly size: THREE.Vector3;
  private readonly body: RigidBody;
  readonly collider: Collider;
  private time: number;
  private readonly next = new THREE.Vector3();

  constructor(
    physics: Physics,
    readonly elementId: number,
    private readonly options: MovingPlatformOptions,
  ) {
    this.time = options.offset;
    this.size = new THREE.Vector3(...options.size);
    this.sample(this.time, this.position);
    this.previous.copy(this.position);
    const created = physics.addKinematicBox(
      this.position,
      { x: this.size.x / 2, y: this.size.y / 2, z: this.size.z / 2 },
      { kind: 'moving', elementId, wallRunnable: false, platform: this },
    );
    this.body = created.body;
    this.collider = created.collider;
  }

  /** Vor dem Physik-Schritt: nächste Position setzen, Delta und Geschwindigkeit berechnen. */
  fixedUpdate(dt: number): void {
    this.time += dt;
    this.sample(this.time, this.next);
    this.previous.copy(this.position);
    this.delta.subVectors(this.next, this.position);
    this.velocity.copy(this.delta).divideScalar(dt);
    this.position.copy(this.next);
    this.body.setNextKinematicTranslation(this.position);
  }

  /** Zurück auf den Startzustand (Level-Neustart → reproduzierbares Timing für Speedruns). */
  reset(): void {
    this.time = this.options.offset;
    this.sample(this.time, this.position);
    this.previous.copy(this.position);
    this.delta.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.body.setTranslation(this.position, true);
  }

  /** Interpolierte Position für das Rendering. */
  interpolated(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.previous, this.position, alpha);
  }

  private sample(time: number, out: THREE.Vector3): THREE.Vector3 {
    const { path, mode, speed, wait } = this.options;
    return samplePath(path, mode, speed, wait, time, out);
  }
}
