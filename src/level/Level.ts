import * as THREE from 'three';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_ENVIRONMENT, type EnvironmentSettings } from '../config/render';
import { DEG2RAD } from '../core/math';
import { Physics } from '../core/Physics';
import type { GrapplePoint } from '../mechanics/Grapple';
import { resolveStaticBoxes, toVector3, type ResolvedBox } from './shapes';
import {
  aabbFromBottom,
  aabbFromCenter,
  aabbIntersects,
  createAabb,
  playerAabb,
  type Aabb,
} from './triggers';
import type { LevelData } from './types';

/** Darstellung eines Grapple-Punkts (animiert, hervorhebbar). */
export interface GrapplePointVisual {
  readonly object: THREE.Object3D;
  setHighlighted(highlighted: boolean): void;
  update(time: number): void;
}

/** Darstellung eines Checkpoints (inaktiv gelb, aktiviert grün). */
export interface CheckpointVisual {
  readonly object: THREE.Object3D;
  setActive(active: boolean): void;
  update(time: number): void;
}

/** Erzeugt alle Meshes eines Levels – nur im Browser vorhanden, in Tests entfällt sie. */
export interface LevelVisualFactory {
  staticMeshes(boxes: readonly ResolvedBox[]): THREE.Object3D[];
  grapplePoint(point: GrapplePoint): GrapplePointVisual;
  checkpoint(checkpoint: Checkpoint): CheckpointVisual;
  killZone(box: Aabb): THREE.Object3D;
  /** Pro Frame für gemeinsame Animationen (z. B. pulsierende Kill-Zonen). */
  update(time: number): void;
}

export interface LevelRenderContext {
  scene: THREE.Scene;
  factory: LevelVisualFactory;
}

export interface Checkpoint {
  /** Fortlaufende Nummer in Level-Reihenfolge (0 = erster Checkpoint). */
  readonly index: number;
  readonly respawn: THREE.Vector3;
  /** Blickrichtung beim Respawn (rad). */
  readonly yaw: number;
  readonly box: Aabb;
}

/** Ergebnis der Trigger-Prüfung eines Physik-Ticks. */
export type TriggerEvent =
  { type: 'checkpoint'; index: number } | { type: 'death'; reason: 'fall' | 'killZone' };

/** Größe des Checkpoint-Auslösebereichs, wenn im Level nichts angegeben ist. */
const DEFAULT_CHECKPOINT_SIZE = [4, 3, 4] as const;
/** Kill-Zonen verzeihen minimales Streifen. */
const KILL_ZONE_GRACE = 0.1;

/**
 * Laufzeit-Repräsentation eines Levels: Physik-World mit allen Collidern, optional die Meshes,
 * Spawnpunkt, Grapple-Punkte, Checkpoints und Kill-Zonen.
 */
export class Level {
  readonly physics: Physics;
  readonly boxes: ResolvedBox[];
  readonly spawnFeet: THREE.Vector3;
  /** Blickrichtung beim Spawn (rad). */
  readonly spawnYaw: number;
  readonly environment: EnvironmentSettings;
  readonly grapplePoints: GrapplePoint[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly killZones: Aabb[] = [];
  private readonly root = new THREE.Group();
  private readonly grappleVisuals = new Map<number, GrapplePointVisual>();
  private readonly checkpointVisuals: CheckpointVisual[] = [];
  private readonly playerBox = createAabb();
  private readonly killBox = createAabb();
  private highlightedGrapple: number | null = null;
  private lastCheckpoint = -1;
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
      switch (element.type) {
        case 'grapple':
          this.grapplePoints.push({
            id: index,
            position: toVector3(element.pos),
            mode: element.mode,
            range: element.range ?? MOVEMENT.grapple.range,
          });
          break;
        case 'checkpoint':
          this.checkpoints.push({
            index: this.checkpoints.length,
            respawn: toVector3(element.pos),
            yaw: element.yaw * DEG2RAD,
            box: aabbFromBottom(element.pos, element.size ?? DEFAULT_CHECKPOINT_SIZE),
          });
          break;
        case 'killZone':
          this.killZones.push(aabbFromCenter(element.pos, element.size));
          break;
        default:
          break;
      }
    });

    // Ein Schritt baut die Beschleunigungsstruktur für Ray-/Shape-Casts auf.
    this.physics.step();

    this.spawnFeet = toVector3(data.spawn.pos);
    this.spawnYaw = data.spawn.yaw * DEG2RAD;
    this.environment = { ...DEFAULT_ENVIRONMENT, ...data.environment };

    if (render) this.buildVisuals(render);
  }

  /** Index des zuletzt erreichten Checkpoints (-1 = noch keiner). */
  get checkpointIndex(): number {
    return this.lastCheckpoint;
  }

  /** Wo der Spieler nach einem Tod / mit R wieder einsteigt. */
  get respawnPoint(): { feet: THREE.Vector3; yaw: number } {
    const checkpoint = this.checkpoints[this.lastCheckpoint];
    return checkpoint
      ? { feet: checkpoint.respawn, yaw: checkpoint.yaw }
      : { feet: this.spawnFeet, yaw: this.spawnYaw };
  }

  /** Fester Physik-Tick: bewegliche Teile aktualisieren (vor dem Physik-Schritt). */
  fixedUpdate(_dt: number): void {
    // Bewegliche Plattformen folgen mit dem Level-System.
  }

  /**
   * Prüft Checkpoints, Kill-Zonen und die Absturzhöhe für die aktuelle Spielerposition.
   * Checkpoints zählen nur vorwärts: Ein früherer Checkpoint überschreibt keinen späteren.
   */
  checkTriggers(feet: THREE.Vector3, radius: number, height: number, out: TriggerEvent[]): void {
    out.length = 0;
    if (feet.y < this.data.killY) {
      out.push({ type: 'death', reason: 'fall' });
      return;
    }
    playerAabb(feet, radius, height, this.killBox, KILL_ZONE_GRACE);
    for (const zone of this.killZones) {
      if (aabbIntersects(this.killBox, zone)) {
        out.push({ type: 'death', reason: 'killZone' });
        return;
      }
    }
    playerAabb(feet, radius, height, this.playerBox);
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.index <= this.lastCheckpoint) continue;
      if (!aabbIntersects(this.playerBox, checkpoint.box)) continue;
      this.activateCheckpoint(checkpoint.index);
      out.push({ type: 'checkpoint', index: checkpoint.index });
    }
  }

  /** Setzt den Fortschritt zurück (Neustart des Levels). */
  resetProgress(): void {
    this.lastCheckpoint = -1;
    this.checkpointVisuals.forEach((visual) => visual.setActive(false));
  }

  /** Pro Frame: rein optische Animationen. */
  frameUpdate(dt: number, _alpha: number): void {
    this.time += dt;
    for (const visual of this.grappleVisuals.values()) visual.update(this.time);
    for (const visual of this.checkpointVisuals) visual.update(this.time);
    this.render?.factory.update(this.time);
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

  private activateCheckpoint(index: number): void {
    // Übersprungene Checkpoints werden mit aktiviert.
    for (let i = this.lastCheckpoint + 1; i <= index; i++)
      this.checkpointVisuals[i]?.setActive(true);
    this.lastCheckpoint = index;
  }

  private buildVisuals(render: LevelRenderContext): void {
    const { factory } = render;
    this.root.name = `level:${this.data.id}`;
    for (const object of factory.staticMeshes(this.boxes)) this.root.add(object);
    for (const point of this.grapplePoints) {
      const visual = factory.grapplePoint(point);
      this.grappleVisuals.set(point.id, visual);
      this.root.add(visual.object);
    }
    for (const checkpoint of this.checkpoints) {
      const visual = factory.checkpoint(checkpoint);
      this.checkpointVisuals.push(visual);
      this.root.add(visual.object);
    }
    for (const zone of this.killZones) this.root.add(factory.killZone(zone));
    render.scene.add(this.root);
  }
}
