import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWorldBox } from './geometry';
import { TEXTURE_TILE_SIZE, type MaterialKey, type MaterialLibrary } from './materials';
import type { ResolvedBox } from './shapes';

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

/**
 * Baut die statische Level-Geometrie als wenige, nach Material zusammengefasste Meshes.
 * Statt hunderter Draw Calls (einer pro Block) entsteht so ein Draw Call pro Material.
 */
export function buildStaticMeshes(
  boxes: readonly ResolvedBox[],
  materials: MaterialLibrary,
): THREE.Mesh[] {
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
    const mesh = new THREE.Mesh(merged, materials.get(key));
    mesh.name = `static:${key}`;
    mesh.castShadow = group.castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  }
  return meshes;
}
