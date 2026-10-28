import type RapierModule from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';

/**
 * Dünne Schicht über der Rapier-World.
 * Hält zusätzlich zu jedem Collider eine {@link SurfaceInfo}, damit Gameplay-Code
 * (Wall Run, bewegliche Plattformen, …) weiß, worauf der Spieler gerade läuft.
 *
 * Rapier wird dynamisch nachgeladen: Das ~4 MB große Modul (WASM als Base64) landet so in
 * einem eigenen Chunk, und Menü/Ladebildschirm erscheinen, bevor die Physik fertig ist.
 */

export type Rapier = typeof RapierModule;

let rapier: Rapier | null = null;
let initPromise: Promise<Rapier> | null = null;

/** Lädt und initialisiert Rapier genau einmal (auch bei mehrfachen Aufrufen). */
export function initPhysics(): Promise<Rapier> {
  initPromise ??= import('@dimforge/rapier3d-compat').then(async (mod) => {
    await mod.default.init();
    rapier = mod.default;
    return mod.default;
  });
  return initPromise;
}

/** Zugriff auf das initialisierte Rapier-Modul. */
export function getRapier(): Rapier {
  if (!rapier) throw new Error('Rapier wurde noch nicht initialisiert (initPhysics() abwarten).');
  return rapier;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Bewegungsdaten einer Plattform, die den Spieler mitnehmen kann. */
export interface PlatformMotion {
  /** Verschiebung im letzten Physik-Tick in Metern. */
  readonly delta: Vec3Like;
  /** Aktuelle Geschwindigkeit in m/s (wird beim Absprung vererbt). */
  readonly velocity: Vec3Like;
}

export type SurfaceKind = 'solid' | 'wallrun' | 'moving' | 'jumpPad';

export interface SurfaceInfo {
  kind: SurfaceKind;
  /** Eindeutige ID des Level-Elements, z. B. für „nicht zweimal hintereinander dieselbe Wand“. */
  elementId: number;
  wallRunnable: boolean;
  platform?: PlatformMotion;
}

export const IDENTITY_QUAT: QuatLike = { x: 0, y: 0, z: 0, w: 1 };

export class Physics {
  readonly rapier: Rapier;
  readonly world: World;
  private readonly surfaces = new Map<number, SurfaceInfo>();

  constructor(timestep: number) {
    this.rapier = getRapier();
    // Schwerkraft rechnen wir selbst im Character Controller – die World braucht keine.
    this.world = new this.rapier.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = timestep;
  }

  addStaticBox(
    center: Vec3Like,
    halfExtents: Vec3Like,
    rotation: QuatLike | null,
    surface: SurfaceInfo,
  ): Collider {
    const desc = this.rapier.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setFriction(0);
    if (rotation) desc.setRotation(rotation);
    const collider = this.world.createCollider(desc);
    this.surfaces.set(collider.handle, surface);
    return collider;
  }

  /** Kinematischer Körper (z. B. bewegliche Plattform) mit Box-Collider. */
  addKinematicBox(
    center: Vec3Like,
    halfExtents: Vec3Like,
    surface: SurfaceInfo,
  ): { body: RigidBody; collider: Collider } {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
        center.x,
        center.y,
        center.z,
      ),
    );
    const collider = this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setFriction(0),
      body,
    );
    this.surfaces.set(collider.handle, surface);
    return { body, collider };
  }

  surfaceOf(collider: Collider | null | undefined): SurfaceInfo | undefined {
    return collider ? this.surfaces.get(collider.handle) : undefined;
  }

  /** Ein Simulationsschritt; aktualisiert auch die Beschleunigungsstruktur für Abfragen. */
  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.surfaces.clear();
    this.world.free();
  }
}
