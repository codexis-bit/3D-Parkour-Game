import * as THREE from 'three';
import type { WallRunConfig } from '../config/movement';
import { approach, clamp } from '../core/math';
import { createRayHit, type PlayerBody } from '../player/PlayerBody';
import type { PlayerContext } from '../player/PlayerContext';

/** Gefundene Wand: Normale (horizontal, zeigt zum Spieler), Abstand und Element-ID. */
export interface WallContact {
  readonly normal: THREE.Vector3;
  readonly point: THREE.Vector3;
  distance: number;
  elementId: number;
}

export function createWallContact(): WallContact {
  return {
    normal: new THREE.Vector3(),
    point: new THREE.Vector3(),
    distance: Infinity,
    elementId: -1,
  };
}

export type WallRunResult = 'continue' | 'timeout' | 'lost' | 'cancel' | 'slow';

/** Höhe der Wand-Sensorstrahlen über den Füßen (Brusthöhe). */
const SENSOR_HEIGHT = 1.0;
/** Wände müssen annähernd senkrecht sein. */
const MAX_WALL_NORMAL_Y = 0.35;

/**
 * Wall Run: erkennt markierte Wände seitlich des Spielers, hält ihn mit reduzierter, langsam
 * zunehmender Gravitation an der Wand und merkt sich die zuletzt benutzte Wand.
 */
export class WallRun {
  /** Normale der aktuellen Wand (horizontal, zeigt zum Spieler). */
  readonly normal = new THREE.Vector3();
  /** Element-ID der aktuellen Wand. */
  wallId = -1;
  /** Zuletzt verlassene Wand – darf nicht direkt erneut belaufen werden. */
  lastWallId: number | null = null;
  /** Restzeit, in der nach dem Ablösen noch ein Wall Jump möglich ist. */
  graceTimer = 0;
  readonly graceNormal = new THREE.Vector3();
  graceWallId = -1;

  private readonly hit = createRayHit();
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();

  constructor(private readonly cfg: WallRunConfig) {}

  tick(dt: number): void {
    this.graceTimer = Math.max(0, this.graceTimer - dt);
  }

  /** Beim Landen: Wand-Gedächtnis zurücksetzen. */
  resetMemory(): void {
    this.lastWallId = null;
    this.graceTimer = 0;
  }

  /**
   * Sucht in 8 horizontalen Richtungen (alle 45° um `yaw`) die nächste Wall-Run-Wand.
   * @param reach Reichweite über den Kapselradius hinaus.
   */
  findWall(body: PlayerBody, yaw: number, reach: number, out: WallContact): boolean {
    this.origin.set(
      body.feet.x,
      body.feet.y + Math.min(SENSOR_HEIGHT, body.height * 0.6),
      body.feet.z,
    );
    const maxDistance = body.radius + reach;
    let found = false;
    out.distance = Infinity;
    for (let i = 0; i < 8; i++) {
      const angle = yaw + (i * Math.PI) / 4;
      this.dir.set(-Math.sin(angle), 0, -Math.cos(angle));
      if (!body.raycast(this.origin, this.dir, maxDistance, this.hit)) continue;
      if (!this.hit.surface?.wallRunnable || Math.abs(this.hit.normal.y) > MAX_WALL_NORMAL_Y)
        continue;
      if (this.hit.distance >= out.distance) continue;
      found = true;
      out.distance = this.hit.distance;
      out.normal.set(this.hit.normal.x, 0, this.hit.normal.z).normalize();
      out.point.copy(this.hit.point);
      out.elementId = this.hit.surface.elementId;
    }
    return found;
  }

  /** Erfüllt der Spieler alle Bedingungen, um an `wall` loszulaufen? */
  canStart(ctx: PlayerContext, wall: WallContact): boolean {
    const v = ctx.velocity;
    const cfg = this.cfg;
    if (wall.elementId === this.lastWallId) return false;
    if (ctx.input.moveY < 0.3) return false;
    if (v.y < -cfg.maxEntryFallSpeed) return false;
    if (ctx.ground.hit && ctx.ground.distance < cfg.minHeight) return false;
    const speed = Math.hypot(v.x, v.z);
    if (speed < cfg.minSpeed) return false;
    const into = v.x * wall.normal.x + v.z * wall.normal.z;
    // Deutlich von der Wand weg bewegen → kein Andocken.
    if (into > 1.5) return false;
    const along = Math.hypot(v.x - into * wall.normal.x, v.z - into * wall.normal.z);
    return along >= cfg.minAlongSpeed;
  }

  /** Dockt an der Wand an: Schwung wird entlang der Wand umgelenkt, Fallen abgefangen. */
  start(ctx: PlayerContext, wall: WallContact): void {
    const v = ctx.velocity;
    const cfg = this.cfg;
    this.normal.copy(wall.normal);
    this.wallId = wall.elementId;
    this.graceTimer = 0;
    const speed = Math.hypot(v.x, v.z);
    const along = this.computeTangent(v);
    const alongSpeed = Math.max(along, speed * cfg.entrySpeedKeep);
    v.x = this.tangent.x * alongSpeed - this.normal.x * cfg.stickSpeed;
    v.z = this.tangent.z * alongSpeed - this.normal.z * cfg.stickSpeed;
    v.y = clamp(v.y, -cfg.entryDownSpeedMax, cfg.entryUpSpeedMax);
  }

  /** Ein Tick an der Wand. Liefert, ob (und warum) der Wall Run endet. */
  update(ctx: PlayerContext, dt: number): WallRunResult {
    const cfg = this.cfg;
    const v = ctx.velocity;
    const body = ctx.body;

    // Ist die Wand noch da? Strahl von Brusthöhe in Richtung Wand.
    this.origin.set(body.feet.x, body.feet.y + SENSOR_HEIGHT, body.feet.z);
    this.dir.copy(this.normal).negate();
    const reach = body.radius + cfg.detectDistance + 0.25;
    if (
      !body.raycast(this.origin, this.dir, reach, this.hit) ||
      !this.hit.surface?.wallRunnable ||
      Math.abs(this.hit.normal.y) > MAX_WALL_NORMAL_Y
    ) {
      return 'lost';
    }
    this.normal.set(this.hit.normal.x, 0, this.hit.normal.z).normalize();
    this.wallId = this.hit.surface.elementId;

    // Gravitation: anfangs fast schwerelos, zum Ende hin zunehmend.
    const t = Math.min(1, ctx.timeInState / cfg.duration);
    const gravityScale =
      cfg.gravityStart + (cfg.gravityEnd - cfg.gravityStart) * Math.pow(t, cfg.gravityCurve);
    v.y = Math.max(v.y - ctx.cfg.gravity * gravityScale * dt, -cfg.maxFallSpeed);

    // Tempo entlang der Wand halten bzw. aufbauen.
    let along = this.computeTangent(v);
    if (ctx.input.moveY > 0.1) {
      along =
        along < cfg.speed
          ? approach(along, cfg.speed, cfg.acceleration * dt)
          : approach(along, cfg.speed, cfg.friction * 0.25 * dt);
    } else {
      along = Math.max(0, along - cfg.friction * dt);
    }
    v.x = this.tangent.x * along - this.normal.x * cfg.stickSpeed;
    v.z = this.tangent.z * along - this.normal.z * cfg.stickSpeed;

    if (ctx.timeInState >= cfg.duration) return 'timeout';
    if (along < cfg.minAlongSpeed * 0.75) return 'slow';
    if (ctx.input.moveY < -0.5 || ctx.input.slidePressed) return 'cancel';
    return 'continue';
  }

  /** Löst sich von der Wand: Gedächtnis setzen, Gnadenfrist für einen späten Wall Jump starten. */
  leave(velocity: THREE.Vector3, push: number): void {
    this.lastWallId = this.wallId;
    this.graceTimer = this.cfg.wallJumpGrace;
    this.graceNormal.copy(this.normal);
    this.graceWallId = this.wallId;
    velocity.x += this.normal.x * push;
    velocity.z += this.normal.z * push;
  }

  /** Nach einem Wall Jump: Diese Wand ist bis zur nächsten Landung/Wand gesperrt. */
  markJumped(wallId: number): void {
    this.lastWallId = wallId;
    this.graceTimer = 0;
  }

  /**
   * Richtung entlang der Wand in Bewegungsrichtung (in `this.tangent`).
   * @returns Tempo entlang der Wand.
   */
  private computeTangent(v: THREE.Vector3): number {
    const n = this.normal;
    const into = v.x * n.x + v.z * n.z;
    this.tangent.set(v.x - into * n.x, 0, v.z - into * n.z);
    const along = this.tangent.length();
    if (along > 1e-4) {
      this.tangent.divideScalar(along);
    } else {
      // Stillstand an der Wand: beliebige, aber stabile Richtung entlang der Wand.
      this.tangent.set(-n.z, 0, n.x);
    }
    return along;
  }
}
