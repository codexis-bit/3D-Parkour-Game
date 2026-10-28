import * as THREE from 'three';

/**
 * Setzt UV-Koordinaten aus Weltpositionen (Box-Projektion nach dominanter Normalenachse).
 * Dadurch hat das Raster auf jeder Fläche denselben Maßstab und Linien benachbarter Blöcke fluchten.
 */
export function applyWorldUVs(geometry: THREE.BufferGeometry, tile: number): void {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!pos || !nor || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / tile, z / tile);
    else if (nx >= nz) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
}

/** Box, deren UVs bereits für die Weltposition `matrix` berechnet und eingebacken sind. */
export function createWorldBox(
  size: THREE.Vector3,
  matrix: THREE.Matrix4,
  tile: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.applyMatrix4(matrix);
  applyWorldUVs(geometry, tile);
  return geometry;
}
