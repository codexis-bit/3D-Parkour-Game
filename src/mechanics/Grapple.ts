import * as THREE from 'three';
import type { GrappleConfig } from '../config/movement';
import { approach, DEG2RAD } from '../core/math';
import type { GrappleMode } from '../level/types';
import { createRayHit, type PlayerBody } from '../player/PlayerBody';
import type { PlayerContext } from '../player/PlayerContext';

/** Ein anvisierbarer Grapple-Punkt im Level. */
export interface GrapplePoint {
  readonly id: number;
  readonly position: THREE.Vector3;
  readonly mode: GrappleMode;
  readonly range: number;
}

/** idle → firing (Haken fliegt) → attached (Pull/Swing) → idle (mit Cooldown). */
export type GrapplePhase = 'idle' | 'firing' | 'attached';

export type HookResult = 'flying' | 'attached' | 'cancelled';
export type PullResult = 'continue' | 'arrived' | 'timeout' | 'blocked';

/** Sichtlinie gilt als frei, wenn ein Treffer höchstens so weit vor dem Punkt liegt. */
const LINE_OF_SIGHT_TOLERANCE = 0.6;

/**
 * Grappling Hook: Zielerfassung (Kegel + Sichtlinie), Hakenflug und die Physik für
 * Pull (zieht zum Punkt) und Swing (Pendel mit Seil als Abstandsbedingung).
 */
export class Grapple {
  phase: GrapplePhase = 'idle';
  /** Aktuell anvisierter Punkt (für HUD-Hervorhebung), null wenn keiner. */
  target: GrapplePoint | null = null;
  /** Punkt, an dem der Haken fliegt oder hängt. */
  active: GrapplePoint | null = null;
  /** Fortschritt des Hakenflugs (0…1). */
  hookProgress = 0;
  /** Aktuelle Seillänge im Swing-Modus. */
  ropeLength = 0;
  private targetRopeLength = 0;
  private cooldownTimer = 0;
  private hookTime = 0;
  private hookDuration = 0;
  private points: readonly GrapplePoint[] = [];
  private readonly cosCone: number;
  private readonly hit = createRayHit();
  private readonly toPoint = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly predicted = new THREE.Vector3();

  constructor(private readonly cfg: GrappleConfig) {
    this.cosCone = Math.cos(cfg.aimConeDeg * DEG2RAD);
  }

  setPoints(points: readonly GrapplePoint[]): void {
    this.points = points;
    this.reset();
  }

  get cooldown(): number {
    return this.cooldownTimer;
  }

  get mode(): GrappleMode | null {
    return this.active?.mode ?? null;
  }

  get canFire(): boolean {
    return this.phase === 'idle' && this.cooldownTimer <= 0 && this.target !== null;
  }

  tick(dt: number): void {
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
  }

  /**
   * Wählt den Punkt mit dem kleinsten Winkel zur Blickrichtung innerhalb von Reichweite und
   * Zielkegel, sofern die Sichtlinie frei ist.
   */
  updateTarget(body: PlayerBody, eye: THREE.Vector3, look: THREE.Vector3): GrapplePoint | null {
    let best: GrapplePoint | null = null;
    let bestScore = Infinity;
    for (const point of this.points) {
      this.toPoint.subVectors(point.position, eye);
      const distance = this.toPoint.length();
      if (distance > point.range || distance < this.cfg.minDistance) continue;
      const cosAngle = this.toPoint.dot(look) / distance;
      if (cosAngle < this.cosCone) continue;
      const score = Math.acos(Math.min(1, cosAngle)) + (distance / point.range) * 0.05;
      if (score >= bestScore) continue;
      this.dir.copy(this.toPoint).divideScalar(distance);
      if (body.raycast(eye, this.dir, distance - LINE_OF_SIGHT_TOLERANCE, this.hit)) continue;
      best = point;
      bestScore = score;
    }
    this.target = best;
    return best;
  }

  /** Schießt den Haken auf das aktuelle Ziel. */
  fire(eye: THREE.Vector3): GrapplePoint | null {
    if (!this.canFire || !this.target) return null;
    this.active = this.target;
    this.phase = 'firing';
    this.hookTime = 0;
    this.hookProgress = 0;
    this.hookDuration = Math.max(0.04, eye.distanceTo(this.active.position) / this.cfg.hookSpeed);
    return this.active;
  }

  /** Hakenflug: rastet nach Ablauf der Flugzeit ein; Loslassen der Taste bricht ab. */
  updateHook(dt: number, held: boolean): HookResult {
    if (this.phase !== 'firing') return 'cancelled';
    if (!held) {
      this.reset();
      return 'cancelled';
    }
    this.hookTime += dt;
    this.hookProgress = Math.min(1, this.hookTime / this.hookDuration);
    if (this.hookProgress < 1) return 'flying';
    this.phase = 'attached';
    return 'attached';
  }

  /** Beim Einrasten: Seillänge für den Swing festlegen (Start = aktueller Abstand). */
  attach(center: THREE.Vector3): void {
    if (!this.active) return;
    const distance = center.distanceTo(this.active.position);
    this.ropeLength = distance;
    this.targetRopeLength = Math.min(
      this.cfg.swingMaxLength,
      Math.max(this.cfg.swingMinLength, distance * this.cfg.swingRopeShorten),
    );
  }

  /** Seil lösen, Cooldown starten. */
  detach(): void {
    this.phase = 'idle';
    this.active = null;
    this.hookProgress = 0;
    this.cooldownTimer = this.cfg.cooldown;
  }

  reset(): void {
    this.phase = 'idle';
    this.active = null;
    this.target = null;
    this.hookProgress = 0;
    this.cooldownTimer = 0;
  }

  /**
   * Pull: beschleunigt zum Punkt, dämpft Querbewegung, wenig Gravitation.
   * @param center Mittelpunkt des Spielers (Masse am Seil).
   */
  updatePull(ctx: PlayerContext, center: THREE.Vector3, dt: number): PullResult {
    const anchor = this.active?.position;
    if (!anchor) return 'arrived';
    const cfg = this.cfg;
    const v = ctx.velocity;
    this.dir.subVectors(anchor, center);
    const distance = this.dir.length();
    if (distance < cfg.pullDetachDistance) return 'arrived';
    this.dir.divideScalar(distance);

    v.addScaledVector(this.dir, cfg.pullAcceleration * dt);
    const along = v.dot(this.dir);
    // Querbewegung abbauen, damit der Zug direkt zum Punkt führt.
    this.predicted.copy(v).addScaledVector(this.dir, -along);
    v.addScaledVector(this.predicted, -Math.min(1, cfg.pullPerpDamping * dt));
    v.y -= ctx.cfg.gravity * cfg.pullGravityScale * dt;
    v.x += ctx.wish.x * 4 * dt;
    v.z += ctx.wish.z * 4 * dt;
    const speed = v.length();
    if (speed > cfg.pullMaxSpeed) v.multiplyScalar(cfg.pullMaxSpeed / speed);

    if (ctx.timeInState > cfg.pullMaxDuration) return 'timeout';
    // Hängt der Spieler an einem Hindernis fest, kommt er dem Punkt nicht mehr näher.
    if (ctx.timeInState > 0.35 && along < 1) return 'blocked';
    return 'continue';
  }

  /**
   * Swing: Pendel am Seil. Schwerkraft und „Pumpen“ per WASD wirken frei; das Seil verhindert jede
   * Bewegung nach außen, sobald es straff ist (der radiale Anteil der Geschwindigkeit wird entfernt).
   * Die Tangentialgeschwindigkeit bleibt dabei erhalten – Loslassen behält den Schwung.
   *
   * Positionsfehler (Seil wird eingeholt, numerische Drift) werden über `correction` als reine
   * Verschiebung ausgeglichen und landen bewusst nicht in der Geschwindigkeit.
   */
  updateSwing(
    ctx: PlayerContext,
    center: THREE.Vector3,
    dt: number,
    correction: THREE.Vector3,
  ): void {
    correction.set(0, 0, 0);
    const anchor = this.active?.position;
    if (!anchor) return;
    const cfg = this.cfg;
    const v = ctx.velocity;
    this.ropeLength = approach(this.ropeLength, this.targetRopeLength, cfg.swingReelSpeed * dt);

    v.y -= ctx.cfg.gravity * cfg.swingGravityScale * dt;
    v.x += ctx.wish.x * cfg.swingPumpAcceleration * dt;
    v.z += ctx.wish.z * cfg.swingPumpAcceleration * dt;
    v.multiplyScalar(Math.max(0, 1 - cfg.swingDrag * dt));

    this.toPoint.subVectors(center, anchor);
    const distance = this.toPoint.length();
    if (distance > 1e-6) {
      this.dir.copy(this.toPoint).divideScalar(distance);
      const radial = v.dot(this.dir);
      if (distance + radial * dt >= this.ropeLength) {
        // Seil straff: keine Bewegung nach außen.
        if (radial > 0) v.addScaledVector(this.dir, -radial);
        this.predicted.copy(center).addScaledVector(v, dt).sub(anchor);
        const next = this.predicted.length();
        if (next > this.ropeLength) {
          correction.copy(this.predicted).multiplyScalar(this.ropeLength / next - 1);
        }
      }
    }
    const speed = v.length();
    if (speed > cfg.swingMaxSpeed) v.multiplyScalar(cfg.swingMaxSpeed / speed);
  }
}
