import * as THREE from 'three';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_ENVIRONMENT, type EnvironmentSettings } from '../config/render';
import { DEG2RAD } from '../core/math';
import { Physics } from '../core/Physics';
import type { GrapplePoint } from '../mechanics/Grapple';
import { resolveStaticBoxes, toVector3, type ResolvedBox } from './shapes';
import type { LevelData } from './types';

/** Darstellung eines Grapple-Punkts (animiert, hervorhebbar). */
export interface GrapplePointVisual {
  readonly object: THREE.Object3D;
  setHighlighted(highlighted: boolean): void;
  update(time: number): void;
}

/** Erzeugt alle Meshes eines Levels – nur im Browser vorhanden, in Tests entfällt sie. */
export interface LevelVisualFactory {
  staticMeshes(boxes: readonly ResolvedBox[]): THREE.Object3D[];
  grapplePoint(point: GrapplePoint): GrapplePointVisual;
}

export interface LevelRenderContext {
  scene: THREE.Scene;
  factory: LevelVisualFactory;
}

/**
 * Laufzeit-Repräsentation eines Levels: Physik-World mit allen Collidern, optional die Meshes,
 * Spawnpunkt, Grapple-Punkte und (später) Trigger, Checkpoints und bewegliche Plattformen.
 */
export class Level {
  readonly physics: Physics;
  readonly boxes: ResolvedBox[];
  readonly spawnFeet: THREE.Vector3;
  /** Blickrichtung beim Spawn (rad). */
  readonly spawnYaw: number;
  readonly environment: EnvironmentSettings;
  readonly grapplePoints: GrapplePoint[] = [];
  private readonly root = new THREE.Group();
  private readonly grappleVisuals = new Map<number, GrapplePointVisual>();
  private highlightedGrapple: number | null = null;
  private time = 0;

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

    data.elements.forEach((element, index) => {
      if (element.type === 'grapple') {
        this.grapplePoints.push({
          id: index,
          position: toVector3(element.pos),
          mode: element.mode,
          range: element.range ?? MOVEMENT.grapple.range,
        });
      }
    });

    // Ein Schritt baut die Beschleunigungsstruktur für Ray-/Shape-Casts auf.
    this.physics.step();

    this.spawnFeet = toVector3(data.spawn.pos);
    this.spawnYaw = data.spawn.yaw * DEG2RAD;
    this.environment = { ...DEFAULT_ENVIRONMENT, ...data.environment };

    if (render) this.buildVisuals(render);
  }

  /** Fester Physik-Tick: bewegliche Teile aktualisieren (vor dem Physik-Schritt). */
  fixedUpdate(_dt: number): void {
    // Bewegliche Plattformen folgen in einem späteren Meilenstein.
  }

  /** Pro Frame: rein optische Animationen. */
  frameUpdate(dt: number, _alpha: number): void {
    this.time += dt;
    for (const visual of this.grappleVisuals.values()) visual.update(this.time);
  }

  /** Hebt den anvisierten Grapple-Punkt hervor (null = keiner). */
  setGrappleHighlight(pointId: number | null): void {
    if (pointId === this.highlightedGrapple) return;
    if (this.highlightedGrapple !== null) {
      this.grappleVisuals.get(this.highlightedGrapple)?.setHighlighted(false);
    }
    this.highlightedGrapple = pointId;
    if (pointId !== null) this.grappleVisuals.get(pointId)?.setHighlighted(true);
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

  private buildVisuals(render: LevelRenderContext): void {
    this.root.name = `level:${this.data.id}`;
    for (const object of render.factory.staticMeshes(this.boxes)) this.root.add(object);
    for (const point of this.grapplePoints) {
      const visual = render.factory.grapplePoint(point);
      this.grappleVisuals.set(point.id, visual);
      this.root.add(visual.object);
    }
    render.scene.add(this.root);
  }
}
