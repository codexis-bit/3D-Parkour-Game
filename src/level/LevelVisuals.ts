import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/render';
import type { GrapplePoint } from '../mechanics/Grapple';
import { createWorldBox } from './geometry';
import type { GrapplePointVisual, LevelVisualFactory } from './Level';
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

/**
 * Baut die Meshes eines Levels aus den aufgelösten Level-Daten.
 * Statische Geometrie wird pro Material zu einem Mesh zusammengefasst (ein Draw Call pro Material).
 */
export class MeshFactory implements LevelVisualFactory {
  private glowTexture: THREE.CanvasTexture | null = null;
  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly sharedMaterials: THREE.Material[] = [];

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
          ring.scale.setScalar(scale);
          ring.rotation.y = t * 0.8;
          ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.9) * 0.35;
        }
        glow.scale.setScalar((highlighted ? 3.4 : 2.6) * (1 + Math.sin(t * 3) * 0.05));
      },
    };
  }

  dispose(): void {
    for (const g of this.sharedGeometries) g.dispose();
    for (const m of this.sharedMaterials) m.dispose();
    this.glowTexture?.dispose();
    this.sharedGeometries.length = 0;
    this.sharedMaterials.length = 0;
    this.glowTexture = null;
  }

  private shared<T extends THREE.BufferGeometry>(geometry: T): T {
    this.sharedGeometries.push(geometry);
    return geometry;
  }

  private glow(): THREE.CanvasTexture {
    this.glowTexture ??= createGlowTexture();
    return this.glowTexture;
  }
}
