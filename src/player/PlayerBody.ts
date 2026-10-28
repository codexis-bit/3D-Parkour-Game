import * as THREE from 'three';
import type {
  Ball,
  Capsule,
  Collider,
  KinematicCharacterController,
  Ray,
} from '@dimforge/rapier3d-compat';
import type { PlayerShapeConfig } from '../config/movement';
import { DEG2RAD } from '../core/math';
import { IDENTITY_QUAT, type Physics, type SurfaceInfo } from '../core/Physics';

/** Ein Kontakt des Character Controllers während eines Bewegungsschritts. */
export interface Contact {
  /** Normale der getroffenen Fläche (zeigt von der Fläche zum Spieler). */
  readonly normal: THREE.Vector3;
  /** Höhe des Kontaktpunkts über den Füßen – niedrige Kontakte sind Stufenkanten. */
  height: number;
}

/** Ergebnis eines Bewegungsschritts des Character Controllers. */
export interface MoveResult {
  grounded: boolean;
  hitCeiling: boolean;
  hitWall: boolean;
  /** Normale der zuletzt getroffenen Wand (zeigt von der Wand zum Spieler). */
  readonly wallNormal: THREE.Vector3;
  wallCollider: Collider | null;
  /** Alle Kontakte dieses Schritts (für die Geschwindigkeitskorrektur). */
  readonly contacts: Contact[];
  contactCount: number;
}

export interface GroundProbe {
  hit: boolean;
  /** Abstand Füße → Boden (kann leicht negativ sein, wenn die Kapsel aufliegt). */
  distance: number;
  readonly normal: THREE.Vector3;
  readonly point: THREE.Vector3;
  collider: Collider | null;
  surface: SurfaceInfo | undefined;
}

export interface RayHit {
  distance: number;
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  collider: Collider | null;
  surface: SurfaceInfo | undefined;
}

export function createMoveResult(): MoveResult {
  return {
    grounded: false,
    hitCeiling: false,
    hitWall: false,
    wallNormal: new THREE.Vector3(),
    wallCollider: null,
    contacts: Array.from({ length: 8 }, () => ({ normal: new THREE.Vector3(), height: 0 })),
    contactCount: 0,
  };
}

export function createGroundProbe(): GroundProbe {
  return {
    hit: false,
    distance: Infinity,
    normal: new THREE.Vector3(0, 1, 0),
    point: new THREE.Vector3(),
    collider: null,
    surface: undefined,
  };
}

export function createRayHit(): RayHit {
  return {
    distance: Infinity,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    collider: null,
    surface: undefined,
  };
}

/**
 * Physischer Körper des Spielers: Kapsel-Collider + Rapier Character Controller.
 *
 * Position ist der Fußpunkt (Unterkante der Kapsel). Die Kapsel kann zwischen Steh- und Duckhöhe
 * wechseln; die Füße bleiben dabei an Ort und Stelle.
 */
export class PlayerBody {
  /** Fußpunkt in Weltkoordinaten – die maßgebliche Spielerposition. */
  readonly feet = new THREE.Vector3();
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  private readonly ray: Ray;
  private readonly probeBall: Ball;
  private readonly standTest: Capsule;
  private readonly crouchTest: Capsule;
  private readonly walkableCos: number;
  private crouched = false;
  private snapEnabled = true;

  /** Anhebung der Freiraum-Testkapseln, damit der Bodenkontakt nicht als Hindernis zählt. */
  private static readonly TEST_LIFT = 0.06;
  /** Die Bodensonde ist etwas schmaler als die Kapsel. */
  private static readonly PROBE_SCALE = 0.9;

  constructor(
    private readonly physics: Physics,
    private readonly cfg: PlayerShapeConfig,
    feet: THREE.Vector3,
  ) {
    const R = physics.rapier;
    this.feet.copy(feet);
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(this.halfHeightFor(cfg.standHeight), cfg.radius).setTranslation(
        feet.x,
        feet.y + cfg.standHeight / 2,
        feet.z,
      ),
    );

    this.kcc = physics.world.createCharacterController(cfg.skinWidth);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(cfg.maxSlopeDeg * DEG2RAD);
    this.kcc.setMinSlopeSlideAngle((cfg.maxSlopeDeg + 5) * DEG2RAD);
    this.kcc.enableAutostep(cfg.stepHeight, cfg.radius * 0.5, false);
    this.kcc.enableSnapToGround(cfg.snapDistance);
    this.kcc.setSlideEnabled(true);
    this.kcc.setNormalNudgeFactor(cfg.normalNudge);
    this.kcc.setApplyImpulsesToDynamicBodies(false);

    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.probeBall = new R.Ball(cfg.radius * PlayerBody.PROBE_SCALE);
    const testRadius = cfg.radius - 0.02;
    const testHalf = (h: number) => Math.max(0.01, (h - PlayerBody.TEST_LIFT) / 2 - testRadius);
    this.standTest = new R.Capsule(testHalf(cfg.standHeight), testRadius);
    this.crouchTest = new R.Capsule(testHalf(cfg.crouchHeight), testRadius);
    this.walkableCos = Math.cos(cfg.maxSlopeDeg * DEG2RAD);
  }

  get radius(): number {
    return this.cfg.radius;
  }

  get height(): number {
    return this.crouched ? this.cfg.crouchHeight : this.cfg.standHeight;
  }

  get isCrouched(): boolean {
    return this.crouched;
  }

  /** Grenzwert für begehbare Böden (cos des maximalen Hangwinkels). */
  get walkableNormalY(): number {
    return this.walkableCos;
  }

  /** Kapselmitte in Weltkoordinaten. */
  center(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.feet.x, this.feet.y + this.height / 2, this.feet.z);
  }

  setSnapToGround(enabled: boolean): void {
    if (enabled === this.snapEnabled) return;
    this.snapEnabled = enabled;
    if (enabled) this.kcc.enableSnapToGround(this.cfg.snapDistance);
    else this.kcc.disableSnapToGround();
  }

  /**
   * Wechselt zwischen Steh- und Duckhöhe.
   * @returns false, wenn Aufstehen wegen fehlender Kopffreiheit nicht möglich ist.
   */
  setCrouched(crouch: boolean): boolean {
    if (crouch === this.crouched) return true;
    if (!crouch && !this.canStand()) return false;
    this.crouched = crouch;
    this.collider.setHalfHeight(this.halfHeightFor(this.height));
    this.syncCollider();
    return true;
  }

  /** Ist an der aktuellen Position genug Platz zum Stehen? */
  canStand(): boolean {
    return this.fitsAt(this.feet, false);
  }

  /** Prüft, ob die (stehende oder geduckte) Kapsel an `feet` frei von Hindernissen ist. */
  fitsAt(feet: THREE.Vector3, crouched: boolean): boolean {
    const total = crouched ? this.cfg.crouchHeight : this.cfg.standHeight;
    const shape = crouched ? this.crouchTest : this.standTest;
    const centerY = feet.y + PlayerBody.TEST_LIFT + (total - PlayerBody.TEST_LIFT) / 2;
    const hit = this.physics.world.intersectionWithShape(
      { x: feet.x, y: centerY, z: feet.z },
      IDENTITY_QUAT,
      shape,
      this.physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.collider,
    );
    return hit === null;
  }

  /**
   * Bewegt die Kapsel um `desired` (m) mit Kollisionsauflösung (Gleiten an Wänden, Stufen, Hänge).
   * Kontakte werden in `out` zusammengefasst.
   */
  move(desired: THREE.Vector3, out: MoveResult): void {
    this.kcc.computeColliderMovement(
      this.collider,
      desired,
      this.physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const m = this.kcc.computedMovement();
    const feetY = this.feet.y;
    this.feet.x += m.x;
    this.feet.y += m.y;
    this.feet.z += m.z;
    this.syncCollider();

    out.grounded = this.kcc.computedGrounded();
    out.hitCeiling = false;
    out.hitWall = false;
    out.wallCollider = null;
    out.contactCount = 0;
    const count = this.kcc.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const c = this.kcc.computedCollision(i);
      if (!c) continue;
      const n = c.normal1;
      if (out.contactCount < out.contacts.length) {
        const contact = out.contacts[out.contactCount++]!;
        contact.normal.set(n.x, n.y, n.z);
        // witness2 = Kontaktpunkt auf der Spielerkapsel; Bezug ist die Fußhöhe vor dem Schritt.
        contact.height = c.witness2.y - (feetY + c.translationDeltaApplied.y);
      }
      if (n.y >= this.walkableCos) continue;
      if (n.y <= -0.5) {
        out.hitCeiling = true;
      } else {
        out.hitWall = true;
        out.wallNormal.set(n.x, n.y, n.z);
        out.wallCollider = c.collider;
      }
    }
  }

  /** Setzt den Spieler ohne Kollisionsprüfung an eine neue Position. */
  teleport(feet: THREE.Vector3): void {
    this.feet.copy(feet);
    this.syncCollider();
  }

  /** Verschiebt den Spieler ohne Kollisionsprüfung (z. B. mit einer Plattform). */
  translate(delta: THREE.Vector3): void {
    this.feet.add(delta);
    this.syncCollider();
  }

  /** Kugel-Sonde nach unten: Bodenabstand, Normale und Collider unter den Füßen. */
  probeGround(maxDistance: number, out: GroundProbe): boolean {
    const r = this.cfg.radius;
    const ballR = r * PlayerBody.PROBE_SCALE;
    // Kugelmitte = Mitte der unteren Halbkugel; Unterkante der Sonde liegt (r - ballR) über den Füßen.
    const hit = this.physics.world.castShape(
      { x: this.feet.x, y: this.feet.y + r, z: this.feet.z },
      IDENTITY_QUAT,
      { x: 0, y: -1, z: 0 },
      this.probeBall,
      0,
      maxDistance + (r - ballR),
      true,
      this.physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.collider,
    );
    if (!hit) {
      out.hit = false;
      out.distance = Infinity;
      out.collider = null;
      out.surface = undefined;
      out.normal.set(0, 1, 0);
      return false;
    }
    out.hit = true;
    out.distance = hit.time_of_impact - (r - ballR);
    out.normal.set(hit.normal1.x, hit.normal1.y, hit.normal1.z);
    out.point.set(hit.witness1.x, hit.witness1.y, hit.witness1.z);
    out.collider = hit.collider;
    out.surface = this.physics.surfaceOf(hit.collider);
    return true;
  }

  /** Raycast, der den Spieler selbst ignoriert. `dir` muss normalisiert sein. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number, out: RayHit): boolean {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.physics.world.castRayAndGetNormal(
      this.ray,
      maxDistance,
      true,
      this.physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.collider,
    );
    if (!hit) {
      out.distance = Infinity;
      out.collider = null;
      out.surface = undefined;
      return false;
    }
    out.distance = hit.timeOfImpact;
    out.point.copy(origin).addScaledVector(dir, hit.timeOfImpact);
    out.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    out.collider = hit.collider;
    out.surface = this.physics.surfaceOf(hit.collider);
    return true;
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.kcc);
    this.physics.world.removeCollider(this.collider, false);
  }

  private halfHeightFor(totalHeight: number): number {
    return Math.max(0.01, totalHeight / 2 - this.cfg.radius);
  }

  private syncCollider(): void {
    this.collider.setTranslation({
      x: this.feet.x,
      y: this.feet.y + this.height / 2,
      z: this.feet.z,
    });
  }
}
