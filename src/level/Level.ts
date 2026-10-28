import * as THREE from 'three';
import { DEFAULT_ENVIRONMENT, type EnvironmentSettings } from '../config/render';
import { DEG2RAD } from '../core/math';
import { Physics } from '../core/Physics';
import type { MaterialLibrary } from './materials';
import { resolveStaticBoxes, toVector3, type ResolvedBox } from './shapes';
import type { LevelData } from './types';

/** Optionaler Render-Kontext – ohne ihn wird nur die Physik gebaut (z. B. in Tests). */
export interface LevelRenderContext {
  scene: THREE.Scene;
  materials: MaterialLibrary;
  buildMeshes: (boxes: readonly ResolvedBox[], materials: MaterialLibrary) => THREE.Object3D[];
}

/**
 * Laufzeit-Repräsentation eines Levels: Physik-World mit allen Collidern, optional die Meshes,
 * Spawnpunkt und später Trigger, Checkpoints und bewegliche Plattformen.
 */
export class Level {
  readonly physics: Physics;
  readonly boxes: ResolvedBox[];
  readonly spawnFeet: THREE.Vector3;
  /** Blickrichtung beim Spawn (rad). */
  readonly spawnYaw: number;
  readonly environment: EnvironmentSettings;
  private readonly root = new THREE.Group();

  constructor(
    readonly data: LevelData,
    physicsHz: number,
    private readonly render?: LevelRenderContext,
  ) {
    this.physics = new Physics(1 / physicsHz);
    this.boxes = resolveStaticBoxes(data);
    for (const box of this.boxes) {
      this.physics.addStaticBox(
        box.center,
        { x: box.size.x / 2, y: box.size.y / 2, z: box.size.z / 2 },
        box.quaternion,
        { kind: box.surface, elementId: box.elementIndex, wallRunnable: box.wallRunnable },
      );
    }
    // Ein Schritt baut die Beschleunigungsstruktur für Ray-/Shape-Casts auf.
    this.physics.step();

    this.spawnFeet = toVector3(data.spawn.pos);
    this.spawnYaw = data.spawn.yaw * DEG2RAD;
    this.environment = { ...DEFAULT_ENVIRONMENT, ...data.environment };

    if (render) {
      this.root.name = `level:${data.id}`;
      for (const object of render.buildMeshes(this.boxes, render.materials)) this.root.add(object);
      render.scene.add(this.root);
    }
  }

  /** Fester Physik-Tick: bewegliche Teile aktualisieren (vor dem Physik-Schritt). */
  fixedUpdate(_dt: number): void {
    // Bewegliche Plattformen folgen in einem späteren Meilenstein.
  }

  /** Pro Frame: rein optische Animationen. */
  frameUpdate(_dt: number, _alpha: number): void {
    // Animierte Elemente folgen in späteren Meilensteinen.
  }

  dispose(): void {
    if (this.render) {
      this.render.scene.remove(this.root);
      this.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
    this.physics.dispose();
  }
}
