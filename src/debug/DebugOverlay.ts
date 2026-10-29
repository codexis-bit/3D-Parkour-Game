import type { World } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RAD2DEG } from '../core/math';
import type { Level } from '../level/Level';
import type { Aabb } from '../level/triggers';
import { MOVE_STATE_LABELS } from '../player/MoveState';
import type { PlayerController } from '../player/PlayerController';
import { formatTime } from '../ui/format';

/** Werte aus dem Game-Loop, die zusätzlich zum Spielerzustand angezeigt werden. */
export interface DebugFrameInfo {
  dt: number;
  /** Physik-Schritte in diesem Frame. */
  steps: number;
  physicsHz: number;
  renderer: THREE.WebGLRenderer;
  runTime: number;
  /** Blickrichtung (rad) – in Grad angezeigt, so wie Levels `yaw` angeben. */
  yaw: number;
  pitch: number;
}

const TRIGGER_COLORS = {
  checkpoint: 0x3dff9a,
  goal: 0xffd23d,
  killZone: 0xff3355,
  hint: 0x5aa9ff,
} as const;

type TriggerKind = keyof typeof TRIGGER_COLORS;

/** Wie oft der Text aktualisiert wird (Hz) – DOM-Updates jedes Frame wären unnötig teuer. */
const TEXT_RATE = 10;

/**
 * Linienmaterial mit leichtem Tiefen-Versatz zur Kamera hin: Kollisionslinien liegen exakt auf den
 * Kanten der Level-Geometrie und würden sonst flackern (Z-Fighting). Das Skalieren im View-Space
 * verschiebt die Punkte entlang des Sehstrahls, die Bildschirmposition bleibt also gleich.
 */
function biasedLineMaterial(params: THREE.LineBasicMaterialParameters): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial(params);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
      mvPosition.xyz *= 0.997;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  return material;
}

/**
 * Debug-Anzeige (F3): Rapier-Collider als Linien, Trigger-Volumen (Checkpoints, Ziel, Kill-Zonen,
 * Hinweise), Absturzhöhe, Geschwindigkeitsvektor und ein Textpanel mit Zustand, Tempo, FPS,
 * Timern und Render-Statistik.
 */
export class DebugOverlay {
  private readonly root = new THREE.Group();
  private readonly colliderGeometry = new THREE.BufferGeometry();
  private readonly colliderLines: THREE.LineSegments;
  private readonly triggers = new THREE.Group();
  private readonly velocityArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(),
    1,
    0x00e5ff,
  );
  private readonly edgeMaterials = new Map<TriggerKind, THREE.LineBasicMaterial>();
  private readonly fillMaterials = new Map<TriggerKind, THREE.MeshBasicMaterial>();
  private readonly panel: HTMLPreElement;
  private readonly direction = new THREE.Vector3();
  private positions = new Float32Array(0);
  private colors = new Float32Array(0);
  private level: Level | null = null;
  private enabled = false;
  private frames = 0;
  private frameTime = 0;
  private worstFrame = 0;
  private fps = 0;
  private averageMs = 0;
  private maxMs = 0;
  private textTimer = 0;

  constructor(scene: THREE.Scene, parent: HTMLElement) {
    this.colliderLines = new THREE.LineSegments(
      this.colliderGeometry,
      biasedLineMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    // Die Geometrie ändert sich jedes Frame – Bounding-Sphere-Culling lohnt sich nicht.
    this.colliderLines.frustumCulled = false;
    this.root.add(this.colliderLines, this.triggers, this.velocityArrow);
    this.root.visible = false;
    this.root.renderOrder = 10;
    scene.add(this.root);

    for (const [kind, color] of Object.entries(TRIGGER_COLORS) as [TriggerKind, number][]) {
      this.edgeMaterials.set(kind, biasedLineMaterial({ color }));
      this.fillMaterials.set(
        kind,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }),
      );
    }

    this.panel = document.createElement('pre');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;
    parent.append(this.panel);
  }

  get visible(): boolean {
    return this.enabled;
  }

  set visible(visible: boolean) {
    this.enabled = visible;
    this.root.visible = visible;
    this.panel.hidden = !visible;
    this.textTimer = 0;
  }

  toggle(): boolean {
    this.visible = !this.enabled;
    return this.enabled;
  }

  /** Baut die Trigger-Volumen für ein neues Level auf (null = Level entladen). */
  setLevel(level: Level | null): void {
    this.clearTriggers();
    this.level = level;
    if (!level) return;
    for (const checkpoint of level.checkpoints) this.addBox(checkpoint.box, 'checkpoint');
    if (level.goal) this.addBox(level.goal.box, 'goal');
    for (const zone of level.killZones) this.addBox(zone, 'killZone');
    for (const hint of level.hints) this.addBox(hint.box, 'hint');
    this.addKillPlane(level);
  }

  /** Pro Frame aufrufen (misst auch bei ausgeblendeter Anzeige die FPS weiter). */
  update(player: PlayerController | null, info: DebugFrameInfo): void {
    this.measure(info.dt);
    if (!this.enabled) return;
    const level = this.level;
    if (level) this.updateColliders(level.physics.world, player);
    if (player) {
      const v = player.velocity;
      const speed = v.length();
      this.velocityArrow.visible = speed > 0.2;
      if (speed > 0.2) {
        this.velocityArrow.position.set(player.feet.x, player.feet.y + 0.9, player.feet.z);
        this.velocityArrow.setDirection(this.direction.copy(v).divideScalar(speed));
        this.velocityArrow.setLength(Math.max(0.5, speed * 0.25), 0.35, 0.18);
      }
    }
    this.textTimer -= info.dt;
    if (this.textTimer <= 0) {
      this.textTimer = 1 / TEXT_RATE;
      this.panel.textContent = this.describe(player, info);
    }
  }

  dispose(): void {
    this.clearTriggers();
    this.colliderGeometry.dispose();
    (this.colliderLines.material as THREE.Material).dispose();
    for (const material of this.edgeMaterials.values()) material.dispose();
    for (const material of this.fillMaterials.values()) material.dispose();
    this.velocityArrow.dispose();
    this.root.removeFromParent();
    this.panel.remove();
  }

  // ---------------------------------------------------------------- intern

  private measure(dt: number): void {
    this.frames++;
    this.frameTime += dt;
    this.worstFrame = Math.max(this.worstFrame, dt);
    if (this.frameTime >= 0.5) {
      this.fps = this.frames / this.frameTime;
      this.averageMs = (this.frameTime / this.frames) * 1000;
      this.maxMs = this.worstFrame * 1000;
      this.frames = 0;
      this.frameTime = 0;
      this.worstFrame = 0;
    }
  }

  /** Übernimmt die Linien aus Rapiers Debug-Renderer (ohne den Spieler-Collider vor der Kamera). */
  private updateColliders(world: World, player: PlayerController | null): void {
    const playerHandle = player?.body.collider.handle;
    const buffers = world.debugRender(undefined, (collider) => collider.handle !== playerHandle);
    const count = buffers.vertices.length / 3;
    if (count > this.positions.length / 3) {
      // Puffer mit Reserve vergrößern, damit nicht jedes Frame neu angelegt wird.
      const capacity = Math.ceil(count * 1.5);
      this.positions = new Float32Array(capacity * 3);
      this.colors = new Float32Array(capacity * 4);
      this.colliderGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
      );
      this.colliderGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage),
      );
    }
    this.positions.set(buffers.vertices);
    this.colors.set(buffers.colors);
    const position = this.colliderGeometry.getAttribute('position');
    const color = this.colliderGeometry.getAttribute('color');
    if (position) position.needsUpdate = true;
    if (color) color.needsUpdate = true;
    this.colliderGeometry.setDrawRange(0, count);
  }

  private addBox(box: Aabb, kind: TriggerKind): void {
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
    const shape = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(shape),
      this.edgeMaterials.get(kind),
    );
    const fill = new THREE.Mesh(shape, this.fillMaterials.get(kind));
    edges.position.copy(center);
    fill.position.copy(center);
    this.triggers.add(edges, fill);
  }

  /** Rechteck auf Absturzhöhe unter dem ganzen Level. */
  private addKillPlane(level: Level): void {
    const b = level.bounds;
    if (b.isEmpty()) return;
    const margin = 30;
    const y = level.data.killY;
    const corners = [
      [b.min.x - margin, b.min.z - margin],
      [b.max.x + margin, b.min.z - margin],
      [b.max.x + margin, b.max.z + margin],
      [b.min.x - margin, b.max.z + margin],
    ] as const;
    const points: THREE.Vector3[] = [];
    corners.forEach(([x, z], i) => {
      const [nx, nz] = corners[(i + 1) % corners.length] ?? corners[0];
      points.push(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, y, nz));
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.triggers.add(new THREE.LineSegments(geometry, this.edgeMaterials.get('killZone')));
  }

  private clearTriggers(): void {
    for (const child of [...this.triggers.children]) {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
    }
    this.triggers.clear();
  }

  private describe(player: PlayerController | null, info: DebugFrameInfo): string {
    const render = info.renderer.info.render;
    const lines = [
      'DEBUG  (F3)',
      `FPS       ${this.fps.toFixed(0).padStart(3)}  ·  ${this.averageMs.toFixed(1)} ms (max ${this.maxMs.toFixed(1)})`,
      `Physik    ${info.physicsHz} Hz  ·  ${info.steps} Schritt(e) im Frame`,
      `Render    ${render.calls} Draw Calls  ·  ${(render.triangles / 1000).toFixed(1)}k Dreiecke`,
    ];
    if (this.level) {
      const level = this.level;
      lines.push(
        `Level     ${level.data.name}  ·  ${level.physics.world.colliders.len()} Collider`,
        `Checkpt   ${level.checkpointIndex + 1}/${level.checkpoints.length}  ·  Lauf ${formatTime(info.runTime)}`,
      );
    }
    if (player) {
      const v = player.velocity;
      const p = player.feet;
      const g = player.ground;
      const t = player.timers;
      const grapple = player.grapple;
      lines.push(
        '',
        `Zustand   ${MOVE_STATE_LABELS[player.state]}  ·  ${player.timeInState.toFixed(2)} s`,
        `Tempo     ${player.horizontalSpeed.toFixed(2)} m/s  ·  vy ${v.y.toFixed(2)}`,
        `Position  ${p.x.toFixed(2)}  ${p.y.toFixed(2)}  ${p.z.toFixed(2)}`,
        `Blick     yaw ${(info.yaw * RAD2DEG).toFixed(1)}°  ·  pitch ${(info.pitch * RAD2DEG).toFixed(1)}°`,
        `Boden     ${g.hit ? `ja · Abstand ${g.distance.toFixed(3)} · n.y ${g.normal.y.toFixed(2)}` : 'nein'}`,
        `Coyote    ${t.coyote.toFixed(3)} s  ·  Sprungpuffer ${t.jumpBuffer.toFixed(3)} s`,
        `Wand      Wall-Jump-Gnade ${t.wallJumpGrace.toFixed(2)} s`,
        `Grapple   ${grapple.phase}  ·  Cooldown ${grapple.cooldown.toFixed(2)} s${grapple.target ? `  ·  Ziel #${grapple.target.id}` : ''}`,
        `Kapsel    Höhe ${player.body.height.toFixed(2)} m${player.body.isCrouched ? ' (geduckt)' : ''}`,
      );
    }
    lines.push('', 'Grün Checkpoint · Gelb Ziel · Rot Kill-Zone · Blau Hinweis');
    return lines.join('\n');
  }
}
