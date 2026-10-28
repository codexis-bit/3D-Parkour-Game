import type * as THREE from 'three';
import type { SlideConfig } from '../config/movement';
import { wrapAngle } from '../core/math';
import { horizontalSpeed, scaleHorizontal } from './Locomotion';

/**
 * Slide-Mechanik: Start-Boost, Reibung, Hangbeschleunigung und begrenztes Lenken.
 * Der Controller kümmert sich um die State-Übergänge, diese Klasse nur um die Physik.
 */
export class Slide {
  private boostCooldown = 0;

  constructor(
    private readonly cfg: SlideConfig,
    private readonly gravity: number,
  ) {}

  /** Jeden Tick aufrufen (unabhängig vom State), damit der Boost-Cooldown abläuft. */
  tick(dt: number): void {
    this.boostCooldown = Math.max(0, this.boostCooldown - dt);
  }

  /** Reicht das Tempo für einen Slide? */
  canStart(speed: number): boolean {
    return speed >= this.cfg.minStartSpeed;
  }

  /**
   * Startet den Slide und gibt bei Bedarf den Tempo-Boost.
   * @returns true, wenn ein Boost gegeben wurde.
   */
  start(velocity: THREE.Vector3): boolean {
    const speed = horizontalSpeed(velocity);
    if (this.boostCooldown > 0 || speed >= this.cfg.boostMaxSpeed || speed < 1e-3) return false;
    const boosted = Math.min(speed + this.cfg.boost, this.cfg.boostMaxSpeed);
    scaleHorizontal(velocity, boosted / speed);
    this.boostCooldown = this.cfg.boostCooldown;
    return true;
  }

  /** Physik eines Slide-Ticks auf der Bodenfläche mit Normale `groundNormal`. */
  update(
    velocity: THREE.Vector3,
    groundNormal: THREE.Vector3,
    wish: THREE.Vector3,
    dt: number,
  ): void {
    applySlidePhysics(velocity, groundNormal, wish, this.cfg, this.gravity, dt);
  }

  get boostReady(): boolean {
    return this.boostCooldown <= 0;
  }

  reset(): void {
    this.boostCooldown = 0;
  }
}

/**
 * Reine Slide-Physik (testbar):
 * 1. Hangabtrieb: horizontaler Anteil von g·sinθ entlang der Falllinie = g·sinθ·cosθ,
 * 2. Gleitreibung,
 * 3. Lenken: Richtung dreht sich mit höchstens `steerRate` zur Eingabe (nicht bei Rückwärts-Eingabe),
 * 4. Tempo-Obergrenze.
 */
export function applySlidePhysics(
  v: THREE.Vector3,
  normal: THREE.Vector3,
  wish: THREE.Vector3,
  cfg: SlideConfig,
  gravity: number,
  dt: number,
): void {
  const ny = Math.min(1, Math.max(0, normal.y));
  const sinTheta = Math.sqrt(1 - ny * ny);
  if (sinTheta > 1e-3) {
    // (n.x, n.z) zeigt horizontal bergab und hat die Länge sinθ.
    const accel = gravity * sinTheta * ny * cfg.slopeAcceleration;
    v.x += (normal.x / sinTheta) * accel * dt;
    v.z += (normal.z / sinTheta) * accel * dt;
  }

  let speed = horizontalSpeed(v);
  if (speed > 1e-6) {
    const next = Math.max(0, speed - cfg.friction * dt);
    scaleHorizontal(v, next / speed);
    speed = next;
  }

  const wishLen = Math.hypot(wish.x, wish.z);
  if (wishLen > 1e-3 && speed > 1e-3) {
    const current = Math.atan2(v.x, v.z);
    const target = Math.atan2(wish.x, wish.z);
    const delta = wrapAngle(target - current);
    // Mehr als ~110° Abweichung (z. B. S gedrückt) lenkt nicht – sonst wäre eine Kehrtwende möglich.
    if (Math.abs(delta) < 1.9) {
      const maxStep = cfg.steerRate * dt;
      const angle = current + Math.max(-maxStep, Math.min(maxStep, delta));
      v.x = Math.sin(angle) * speed;
      v.z = Math.cos(angle) * speed;
    }
  }

  if (speed > cfg.maxSpeed) scaleHorizontal(v, cfg.maxSpeed / speed);
}
