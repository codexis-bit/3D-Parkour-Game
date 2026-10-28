import * as THREE from 'three';
import type { VaultConfig } from '../config/movement';
import { easeInOutSine, easeOutCubic } from '../core/math';
import { createRayHit, type PlayerBody } from '../player/PlayerBody';
import type { PlayerContext } from '../player/PlayerContext';

/** Gefundene Kante: Zielposition der Füße auf der Kante und Höhe über den aktuellen Füßen. */
export interface LedgeCandidate {
  readonly target: THREE.Vector3;
  height: number;
  /** Auf der Kante ist nur geduckt Platz. */
  crouched: boolean;
}

export function createLedgeCandidate(): LedgeCandidate {
  return { target: new THREE.Vector3(), height: 0, crouched: false };
}

/** Höhen der horizontalen Fühlerstrahlen über den Füßen. */
const PROBE_HEIGHTS = [0.55, 1.05, 1.45];

/**
 * Vault/Mantle: erkennt Kanten in Brusthöhe vor dem Spieler und zieht ihn automatisch hinauf.
 * Die Bewegung ist eine kurze, kollisionsfreie Animation (zuerst hoch, dann nach vorn),
 * deren Ziel vorher auf freien Platz geprüft wurde.
 */
export class Vault {
  /** Fortschritt der laufenden Vault-Animation (0…1). */
  progress = 0;
  height = 0;
  private cooldownTimer = 0;
  private duration = 0;
  private time = 0;
  private exitSpeed = 0;
  private crouchedTarget = false;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly hit = createRayHit();
  private readonly probe = new THREE.Vector3();

  constructor(private readonly cfg: VaultConfig) {}

  tick(dt: number): void {
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
  }

  reset(): void {
    this.cooldownTimer = 0;
    this.progress = 0;
  }

  /** Ziel der laufenden Animation geduckt? */
  get endsCrouched(): boolean {
    return this.crouchedTarget;
  }

  /**
   * Sucht vor dem Spieler (in Blickrichtung) eine erreichbare Kante.
   * Bedingungen: Vorwärts-Eingabe, nicht zu schnell steigend, Wand vor dem Spieler,
   * begehbare Oberkante im Höhenfenster und genug Platz darüber.
   */
  findLedge(ctx: PlayerContext, out: LedgeCandidate): boolean {
    const cfg = this.cfg;
    const body = ctx.body;
    if (this.cooldownTimer > 0 || ctx.input.moveY < 0.5 || ctx.velocity.y > cfg.maxUpSpeed)
      return false;
    if (body.isCrouched) return false;

    this.forward.set(-Math.sin(ctx.view.yaw), 0, -Math.cos(ctx.view.yaw));
    const reach = body.radius + cfg.reach;
    // 1. Hindernis vor dem Spieler (eine der Fühlerhöhen trifft eine steile, zugewandte Fläche).
    let wallDistance = Infinity;
    for (const h of PROBE_HEIGHTS) {
      if (h > cfg.maxHeight + 0.1) break;
      this.origin.set(body.feet.x, body.feet.y + h, body.feet.z);
      if (!body.raycast(this.origin, this.forward, reach, this.hit)) continue;
      if (Math.abs(this.hit.normal.y) > 0.5) continue;
      const facing = this.hit.normal.x * this.forward.x + this.hit.normal.z * this.forward.z;
      if (facing > -0.5) continue;
      wallDistance = Math.min(wallDistance, this.hit.distance);
    }
    if (!Number.isFinite(wallDistance)) return false;

    // 2. Oberkante: Strahl von oben, etwas hinter der Vorderkante.
    const inset = wallDistance + 0.3;
    const top = cfg.maxHeight + 0.35;
    this.origin.set(
      body.feet.x + this.forward.x * inset,
      body.feet.y + top,
      body.feet.z + this.forward.z * inset,
    );
    if (!body.raycast(this.origin, this.down, top - cfg.minHeight + 0.05, this.hit)) return false;
    if (this.hit.normal.y < body.walkableNormalY || this.hit.distance < 0.05) return false;
    const ledgeY = this.hit.point.y;
    const height = ledgeY - body.feet.y;
    if (height < cfg.minHeight || height > cfg.maxHeight) return false;

    // 3. Platz: über dem Spieler (Aufwärtsphase) und auf der Kante (Ziel).
    this.probe.set(body.feet.x, ledgeY + 0.05, body.feet.z);
    if (!body.fitsAt(this.probe, true)) return false;
    out.target.set(
      body.feet.x + this.forward.x * (wallDistance + body.radius + 0.12),
      ledgeY + 0.03,
      body.feet.z + this.forward.z * (wallDistance + body.radius + 0.12),
    );
    out.height = height;
    if (body.fitsAt(out.target, false)) out.crouched = false;
    else if (body.fitsAt(out.target, true)) out.crouched = true;
    else return false;
    return true;
  }

  /** Startet die Animation zur Kante. */
  start(ctx: PlayerContext, ledge: LedgeCandidate): void {
    const cfg = this.cfg;
    this.from.copy(ctx.body.feet);
    this.to.copy(ledge.target);
    this.height = ledge.height;
    this.crouchedTarget = ledge.crouched;
    this.duration = cfg.baseDuration + ledge.height * cfg.durationPerMeter;
    this.time = 0;
    this.progress = 0;
    const speed = Math.hypot(ctx.velocity.x, ctx.velocity.z);
    this.exitSpeed = Math.max(speed * cfg.speedKeep, cfg.minExitSpeed);
    ctx.velocity.set(0, 0, 0);
  }

  /**
   * Ein Animationsschritt. Erst geht es überwiegend nach oben, danach nach vorn auf die Kante.
   * @returns true, wenn die Animation abgeschlossen ist.
   */
  update(body: PlayerBody, dt: number): boolean {
    this.time += dt;
    const t = Math.min(1, this.time / this.duration);
    this.progress = t;
    const rise = easeOutCubic(Math.min(1, t / 0.65));
    const advance = easeInOutSine(Math.max(0, (t - 0.25) / 0.75));
    this.probe.set(
      this.from.x + (this.to.x - this.from.x) * advance,
      this.from.y + (this.to.y - this.from.y) * rise,
      this.from.z + (this.to.z - this.from.z) * advance,
    );
    body.teleport(this.probe);
    return t >= 1;
  }

  /** Nach dem Hochziehen: Schwung in Blickrichtung mitnehmen. */
  finish(ctx: PlayerContext): void {
    this.cooldownTimer = this.cfg.cooldown;
    this.progress = 0;
    this.forward.set(this.to.x - this.from.x, 0, this.to.z - this.from.z);
    if (this.forward.lengthSq() < 1e-6)
      this.forward.set(-Math.sin(ctx.view.yaw), 0, -Math.cos(ctx.view.yaw));
    this.forward.normalize();
    ctx.velocity.set(this.forward.x * this.exitSpeed, 0, this.forward.z * this.exitSpeed);
  }
}
