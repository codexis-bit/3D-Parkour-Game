import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/render';
import { createRng } from '../core/math';
import type { GrapplePoint } from '../mechanics/Grapple';
import { applyWorldUVs, createWorldBox } from './geometry';
import {
  goalQuaternion,
  type AnimatedVisual,
  type Checkpoint,
  type CheckpointVisual,
  type Goal,
  type GrapplePointVisual,
  type JumpPad,
  type LevelVisualFactory,
} from './Level';
import type { MovingPlatform } from './MovingPlatform';
import type { LevelData } from './types';
import type { Aabb } from './triggers';
import { TEXTURE_TILE_SIZE, type MaterialKey, type MaterialLibrary } from './materials';
import type { ResolvedBox } from './shapes';

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

/** Weicher, radialer Leuchtpunkt (für Sprites), einmal erzeugt und geteilt. */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Canvas nicht verfügbar');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Vertikaler Verlauf (unten deckend, oben transparent) für Lichtsäulen. */
function createBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Canvas nicht verfügbar');
  const gradient = ctx.createLinearGradient(0, 128, 0, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Schachbrettmuster für die Ziellinie. */
function createCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Canvas nicht verfügbar');
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** Schriftzug als Textur (für das Zielschild). */
function createLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Canvas nicht verfügbar');
  ctx.font = '900 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, 256, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Baut die Meshes eines Levels aus den aufgelösten Level-Daten.
 * Statische Geometrie wird pro Material zu einem Mesh zusammengefasst (ein Draw Call pro Material).
 */
export class MeshFactory implements LevelVisualFactory {
  private glowTexture: THREE.CanvasTexture | null = null;
  private beamTexture: THREE.CanvasTexture | null = null;
  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly sharedMaterials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];

  constructor(private readonly materials: MaterialLibrary) {}

  staticMeshes(boxes: readonly ResolvedBox[]): THREE.Mesh[] {
    const groups = new Map<
      MaterialKey,
      { geometries: THREE.BufferGeometry[]; castShadow: boolean }
    >();
    const matrix = new THREE.Matrix4();
    for (const box of boxes) {
      matrix.compose(box.center, box.quaternion, UNIT_SCALE);
      const geometry = createWorldBox(box.size, matrix, TEXTURE_TILE_SIZE);
      let group = groups.get(box.material);
      if (!group) {
        group = { geometries: [], castShadow: false };
        groups.set(box.material, group);
      }
      group.geometries.push(geometry);
      group.castShadow ||= box.castShadow;
    }

    const meshes: THREE.Mesh[] = [];
    for (const [key, group] of groups) {
      const merged = mergeGeometries(group.geometries, false);
      for (const g of group.geometries) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.materials.get(key));
      mesh.name = `static:${key}`;
      mesh.castShadow = group.castShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      meshes.push(mesh);
    }
    return meshes;
  }

  grapplePoint(point: GrapplePoint): GrapplePointVisual {
    const group = new THREE.Group();
    group.position.copy(point.position);
    const normal = this.materials.get('grapple');
    const active = this.materials.get('grappleActive');

    // Pull: kantiger Kristall. Swing: Ring mit kleinem Kern.
    const core = new THREE.Mesh(
      point.mode === 'pull'
        ? this.shared(new THREE.OctahedronGeometry(0.42))
        : this.shared(new THREE.SphereGeometry(0.18, 16, 12)),
      normal,
    );
    group.add(core);
    let ring: THREE.Mesh | null = null;
    if (point.mode === 'swing') {
      ring = new THREE.Mesh(this.shared(new THREE.TorusGeometry(0.62, 0.09, 10, 36)), normal);
      group.add(ring);
    }

    const glowMaterial = new THREE.SpriteMaterial({
      map: this.glow(),
      color: PALETTE.grapple,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedMaterials.push(glowMaterial);
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(2.6);
    group.add(glow);

    let highlighted = false;
    const phase = point.id * 1.7;
    return {
      object: group,
      setHighlighted(on: boolean) {
        highlighted = on;
        core.material = on ? active : normal;
        if (ring) ring.material = on ? active : normal;
        glowMaterial.opacity = on ? 0.95 : 0.55;
      },
      update(time: number) {
        const t = time + phase;
        const scale = highlighted ? 1.25 + Math.sin(t * 10) * 0.05 : 1 + Math.sin(t * 2.2) * 0.04;
        core.scale.setScalar(scale);
        core.rotation.y = t * (highlighted ? 3 : 1.1);
        core.rotation.x = Math.sin(t * 0.7) * 0.4;
        if (ring) {
          // Ring bleibt der Anlaufrichtung (+Z) zugewandt und pendelt nur leicht – so ist er
          // aus der Ferne immer als Ring erkennbar.
          ring.scale.setScalar(scale);
          ring.rotation.y = Math.sin(t * 0.8) * 0.35;
          ring.rotation.x = Math.sin(t * 0.6) * 0.15;
        }
        glow.scale.setScalar((highlighted ? 3.4 : 2.6) * (1 + Math.sin(t * 3) * 0.05));
      },
    };
  }

  checkpoint(checkpoint: Checkpoint): CheckpointVisual {
    const { min, max } = checkpoint.box;
    const radius = Math.min(max.x - min.x, max.z - min.z) * 0.42;
    const group = new THREE.Group();
    group.position.copy(checkpoint.respawn);
    const idle = this.materials.get('checkpoint');
    const active = this.materials.get('checkpointActive');

    const ring = new THREE.Mesh(this.shared(new THREE.TorusGeometry(radius, 0.07, 8, 48)), idle);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    const beamMaterial = new THREE.MeshBasicMaterial({
      map: this.beam(),
      color: PALETTE.checkpoint,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sharedMaterials.push(beamMaterial);
    const beamHeight = 4;
    const beam = new THREE.Mesh(
      this.shared(new THREE.CylinderGeometry(radius, radius, beamHeight, 32, 1, true)),
      beamMaterial,
    );
    beam.position.y = beamHeight / 2;
    group.add(beam);

    let pulse = 0;
    let isActive = false;
    return {
      object: group,
      setActive(on: boolean) {
        if (on && !isActive) pulse = 1;
        isActive = on;
        ring.material = on ? active : idle;
        beamMaterial.color.set(on ? PALETTE.checkpointActive : PALETTE.checkpoint);
        beamMaterial.opacity = on ? 0.35 : 0.55;
      },
      update(time: number) {
        pulse = Math.max(0, pulse - 0.03);
        const scale = 1 + pulse * 0.6 + Math.sin(time * 2.5) * 0.02;
        ring.scale.setScalar(scale);
        beam.scale.set(scale, 1 + pulse * 0.5, scale);
      },
    };
  }

  killZone(box: Aabb): THREE.Object3D {
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    const mesh = new THREE.Mesh(
      this.shared(new THREE.BoxGeometry(size.x, size.y, size.z)),
      this.materials.get('killZone'),
    );
    mesh.position.addVectors(box.min, box.max).multiplyScalar(0.5);
    mesh.renderOrder = 1;
    return mesh;
  }

  movingPlatform(platform: MovingPlatform): THREE.Object3D {
    const geometry = this.shared(
      new THREE.BoxGeometry(platform.size.x, platform.size.y, platform.size.z),
    );
    applyWorldUVs(geometry, TEXTURE_TILE_SIZE);
    const mesh = new THREE.Mesh(geometry, this.materials.get('moving'));
    mesh.position.copy(platform.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  jumpPad(pad: JumpPad): AnimatedVisual {
    const group = new THREE.Group();
    group.position.copy(pad.position);
    const radius = Math.min(pad.size[0], pad.size[1]) * 0.45;
    const rings: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; phase: number }[] = [];
    const geometry = this.shared(new THREE.RingGeometry(radius * 0.82, radius, 40));
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: PALETTE.jumpPad,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.sharedMaterials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      group.add(mesh);
      rings.push({ mesh, material, phase: i / 3 });
    }
    return {
      object: group,
      update(time: number) {
        for (const ring of rings) {
          // Ringe steigen auf, werden kleiner und blenden aus – zeigt die Sprungrichtung.
          const t = (time * 0.9 + ring.phase) % 1;
          ring.mesh.position.y = 0.05 + t * 2.2;
          ring.mesh.scale.setScalar(1 - t * 0.35);
          ring.material.opacity = (1 - t) * 0.8;
        }
      },
    };
  }

  goal(goal: Goal): AnimatedVisual {
    const { min, max } = goal.box;
    const width = Math.max(max.x - min.x, max.z - min.z);
    const height = max.y - min.y + 1;
    const group = new THREE.Group();
    group.position.copy(goal.position);
    group.quaternion.copy(goalQuaternion(goal));
    const gold = this.materials.get('goal');
    const pillarGeometry = this.shared(new THREE.BoxGeometry(0.5, height, 0.5));
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeometry, gold);
      pillar.position.set((side * width) / 2, height / 2, 0);
      pillar.castShadow = true;
      group.add(pillar);
    }
    const top = new THREE.Mesh(this.shared(new THREE.BoxGeometry(width + 0.5, 0.5, 0.5)), gold);
    top.position.y = height;
    top.castShadow = true;
    group.add(top);

    const checker = createCheckerTexture();
    this.textures.push(checker);
    const lineMaterial = new THREE.MeshBasicMaterial({ map: checker });
    this.sharedMaterials.push(lineMaterial);
    const line = new THREE.Mesh(this.shared(new THREE.PlaneGeometry(width, 0.8)), lineMaterial);
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    group.add(line);

    const curtainMaterial = new THREE.MeshBasicMaterial({
      map: this.beam(),
      color: PALETTE.goal,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sharedMaterials.push(curtainMaterial);
    const curtain = new THREE.Mesh(
      this.shared(new THREE.PlaneGeometry(width, height)),
      curtainMaterial,
    );
    curtain.position.y = height / 2;
    group.add(curtain);

    const label = createLabelTexture('ZIEL', PALETTE.goal);
    this.textures.push(label);
    const signMaterial = new THREE.SpriteMaterial({
      map: label,
      transparent: true,
      depthWrite: false,
    });
    this.sharedMaterials.push(signMaterial);
    const sign = new THREE.Sprite(signMaterial);
    sign.scale.set(4, 1, 1);
    sign.position.y = height + 1.4;
    group.add(sign);

    return {
      object: group,
      update(time: number) {
        curtainMaterial.opacity = 0.28 + Math.sin(time * 3) * 0.1;
        sign.position.y = height + 1.4 + Math.sin(time * 2) * 0.15;
      },
    };
  }

  backdrop(level: LevelData, bounds: THREE.Box3): THREE.Object3D | null {
    const settings = level.backdrop;
    if (!settings || settings.count <= 0 || bounds.isEmpty()) return null;
    const rng = createRng(settings.seed);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const inner = Math.hypot(size.x, size.z) / 2 + 45;
    const geometry = this.shared(new THREE.BoxGeometry(1, 1, 1));
    const material = new THREE.MeshStandardMaterial({
      color: settings.color ?? PALETTE.backdrop,
      roughness: 1,
      metalness: 0,
    });
    this.sharedMaterials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, settings.count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const bottom = level.killY - 60;
    for (let i = 0; i < settings.count; i++) {
      const angle = rng() * Math.PI * 2;
      const distance = inner + rng() * 220;
      const width = 8 + rng() * 22;
      const top = center.y - 10 + rng() * rng() * 120;
      scale.set(width, top - bottom, width * (0.6 + rng() * 0.8));
      position.set(
        center.x + Math.cos(angle) * distance,
        (top + bottom) / 2,
        center.z + Math.sin(angle) * distance,
      );
      rotation.setFromAxisAngle(up, rng() * Math.PI);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  update(time: number): void {
    // Alle Kill-Zonen teilen sich ein Material – ein Puls für alle.
    this.materials.get('killZone').emissiveIntensity = 0.75 + Math.sin(time * 4) * 0.25;
  }

  dispose(): void {
    for (const g of this.sharedGeometries) g.dispose();
    for (const m of this.sharedMaterials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.glowTexture?.dispose();
    this.beamTexture?.dispose();
    this.sharedGeometries.length = 0;
    this.sharedMaterials.length = 0;
    this.glowTexture = null;
    this.beamTexture = null;
  }

  private shared<T extends THREE.BufferGeometry>(geometry: T): T {
    this.sharedGeometries.push(geometry);
    return geometry;
  }

  private glow(): THREE.CanvasTexture {
    this.glowTexture ??= createGlowTexture();
    return this.glowTexture;
  }

  private beam(): THREE.CanvasTexture {
    this.beamTexture ??= createBeamTexture();
    return this.beamTexture;
  }
}
