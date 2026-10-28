import * as THREE from 'three';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_ENVIRONMENT, type EnvironmentSettings } from '../config/render';
import { DEG2RAD } from '../core/math';
import { Physics } from '../core/Physics';
import type { GrapplePoint } from '../mechanics/Grapple';
import { MovingPlatform } from './MovingPlatform';
import { quaternionFromDegrees, resolveStaticBoxes, toVector3, type ResolvedBox } from './shapes';
import {
  aabbFromBottom,
  aabbFromCenter,
  aabbIntersects,
  createAabb,
  playerAabb,
  segmentEntry,
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

/** Einfaches animiertes Objekt (Ziel, Sprungpad-Effekt …). */
export interface AnimatedVisual {
  readonly object: THREE.Object3D;
  update(time: number): void;
}

export interface Goal {
  readonly box: Aabb;
  readonly position: THREE.Vector3;
  /** Ausrichtung des Tors (rad). */
  readonly yaw: number;
}

export interface JumpPad {
  readonly position: THREE.Vector3;
  readonly size: readonly [number, number];
  readonly power: number;
}

export interface Hint {
  readonly box: Aabb;
  readonly text: string;
}

/** Erzeugt alle Meshes eines Levels – nur im Browser vorhanden, in Tests entfällt sie. */
export interface LevelVisualFactory {
  staticMeshes(boxes: readonly ResolvedBox[]): THREE.Object3D[];
  grapplePoint(point: GrapplePoint): GrapplePointVisual;
  checkpoint(checkpoint: Checkpoint): CheckpointVisual;
  killZone(box: Aabb): THREE.Object3D;
  movingPlatform(platform: MovingPlatform): THREE.Object3D;
  jumpPad(pad: JumpPad): AnimatedVisual;
  goal(goal: Goal): AnimatedVisual;
  backdrop(level: LevelData, bounds: THREE.Box3): THREE.Object3D | null;
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
  | { type: 'checkpoint'; index: number }
  | { type: 'death'; reason: 'fall' | 'killZone' }
  /** `fraction`: Anteil des Ticks (0…1), an dem die Ziellinie überquert wurde. */
  | { type: 'goal'; fraction: number }
  /** Aktiver Tutorial-Hinweis hat gewechselt (null = keiner). */
  | { type: 'hint'; text: string | null };

/** Größe des Checkpoint-Auslösebereichs, wenn im Level nichts angegeben ist. */
const DEFAULT_CHECKPOINT_SIZE = [4, 3, 4] as const;
const DEFAULT_GOAL_SIZE = [6, 4, 2] as const;
/** Kill-Zonen verzeihen minimales Streifen. */
const KILL_ZONE_GRACE = 0.1;

/**
 * Laufzeit-Repräsentation eines Levels: Physik-World mit allen Collidern, optional die Meshes,
 * Spawn, Grapple-Punkte, Checkpoints, Kill-Zonen, bewegliche Plattformen, Ziel und Hinweise.
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
  readonly movingPlatforms: MovingPlatform[] = [];
  readonly jumpPads: JumpPad[] = [];
  readonly hints: Hint[] = [];
  readonly goal: Goal | null = null;
  /** Hüllbox aller statischen Elemente (für Deko und Kamera im Menü). */
  readonly bounds = new THREE.Box3();
  private readonly root = new THREE.Group();
  private readonly grappleVisuals = new Map<number, GrapplePointVisual>();
  private readonly checkpointVisuals: CheckpointVisual[] = [];
  private readonly animated: AnimatedVisual[] = [];
  private readonly platformMeshes: { platform: MovingPlatform; object: THREE.Object3D }[] = [];
  private readonly playerBox = createAabb();
  private readonly killBox = createAabb();
  private readonly goalBox = createAabb();
  private readonly tmp = new THREE.Vector3();
  private highlightedGrapple: number | null = null;
  private lastCheckpoint = -1;
  private activeHint: Hint | null = null;
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
        {
          kind: box.surface,
          elementId: box.elementIndex,
          wallRunnable: box.wallRunnable,
          ...(box.launch ? { launch: box.launch } : {}),
        },
      );
      this.expandBounds(box);
    }

    let goal: Goal | null = null;
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
        case 'moving':
          this.movingPlatforms.push(
            new MovingPlatform(this.physics, index, {
              size: element.size,
              path: element.path,
              speed: element.speed,
              wait: element.wait ?? 0.8,
              mode: element.mode ?? 'pingpong',
              offset: element.offset ?? 0,
            }),
          );
          for (const p of element.path) this.bounds.expandByPoint(this.tmp.set(p[0], p[1], p[2]));
          break;
        case 'jumpPad':
          this.jumpPads.push({
            position: toVector3(element.pos),
            size: element.size ?? [3, 3],
            power: element.power,
          });
          break;
        case 'goal':
          goal = {
            box: aabbFromBottom(element.pos, element.size ?? DEFAULT_GOAL_SIZE),
            position: toVector3(element.pos),
            yaw: (element.yaw ?? 0) * DEG2RAD,
          };
          break;
        case 'hint':
          this.hints.push({ box: aabbFromBottom(element.pos, element.size), text: element.text });
          break;
        default:
          break;
      }
    });
    this.goal = goal;

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

  /** Fester Physik-Tick (vor dem Physik-Schritt): bewegliche Plattformen weiterbewegen. */
  fixedUpdate(dt: number): void {
    for (const platform of this.movingPlatforms) platform.fixedUpdate(dt);
  }

  /**
   * Prüft Ziel, Kill-Zonen, Absturzhöhe, Checkpoints und Hinweise für die aktuelle Spielerposition.
   * Checkpoints zählen nur vorwärts: Ein früherer Checkpoint überschreibt keinen späteren.
   * @param previousFeet Position vor dem Tick – für den exakten Zeitpunkt der Zieldurchquerung.
   */
  checkTriggers(
    previousFeet: THREE.Vector3,
    feet: THREE.Vector3,
    radius: number,
    height: number,
    out: TriggerEvent[],
  ): void {
    out.length = 0;
    if (this.goal) {
      // Zielbox um die Kapselmaße erweitern und die Strecke des Fußpunkts prüfen.
      const g = this.goal.box;
      this.goalBox.min.set(g.min.x - radius, g.min.y - height, g.min.z - radius);
      this.goalBox.max.set(g.max.x + radius, g.max.y, g.max.z + radius);
      const fraction = segmentEntry(previousFeet, feet, this.goalBox);
      if (fraction !== null) {
        out.push({ type: 'goal', fraction });
        return;
      }
    }
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
    let hint: Hint | null = null;
    for (const candidate of this.hints) {
      if (aabbIntersects(this.playerBox, candidate.box)) {
        hint = candidate;
        break;
      }
    }
    if (hint !== this.activeHint) {
      this.activeHint = hint;
      out.push({ type: 'hint', text: hint?.text ?? null });
    }
  }

  /** Setzt Fortschritt und bewegliche Teile zurück (Neustart des Levels). */
  resetProgress(): void {
    this.lastCheckpoint = -1;
    this.activeHint = null;
    this.checkpointVisuals.forEach((visual) => visual.setActive(false));
    for (const platform of this.movingPlatforms) platform.reset();
  }

  /** Pro Frame: rein optische Animationen und interpolierte Plattformen. */
  frameUpdate(dt: number, alpha: number): void {
    this.time += dt;
    for (const visual of this.grappleVisuals.values()) visual.update(this.time);
    for (const visual of this.checkpointVisuals) visual.update(this.time);
    for (const visual of this.animated) visual.update(this.time);
    for (const { platform, object } of this.platformMeshes) {
      platform.interpolated(alpha, object.position);
    }
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

  private expandBounds(box: ResolvedBox): void {
    const half = this.tmp.copy(box.size).multiplyScalar(0.5);
    const radius = half.length();
    this.bounds.expandByPoint(this.tmp.copy(box.center).addScalar(radius));
    this.bounds.expandByPoint(this.tmp.copy(box.center).addScalar(-radius));
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
    for (const platform of this.movingPlatforms) {
      const object = factory.movingPlatform(platform);
      this.platformMeshes.push({ platform, object });
      this.root.add(object);
    }
    for (const pad of this.jumpPads) {
      const visual = factory.jumpPad(pad);
      this.animated.push(visual);
      this.root.add(visual.object);
    }
    if (this.goal) {
      const visual = factory.goal(this.goal);
      this.animated.push(visual);
      this.root.add(visual.object);
    }
    const backdrop = factory.backdrop(this.data, this.bounds);
    if (backdrop) this.root.add(backdrop);
    render.scene.add(this.root);
  }
}

/** Rotation eines Zieltors (für die Mesh-Factory). */
export function goalQuaternion(goal: Goal): THREE.Quaternion {
  return quaternionFromDegrees([0, (goal.yaw * 180) / Math.PI, 0]);
}
