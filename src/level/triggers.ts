import * as THREE from 'three';
import type { Vec3 } from './types';

/**
 * Achsenparallele Auslösebereiche (Checkpoints, Kill-Zonen, Ziel) und reine Schnitttests.
 * Bewusst ohne Physik-Engine: deterministisch, billig und direkt testbar.
 */
export interface Aabb {
  readonly min: THREE.Vector3;
  readonly max: THREE.Vector3;
}

export function aabbFromCenter(center: Vec3, size: Vec3): Aabb {
  return {
    min: new THREE.Vector3(
      center[0] - size[0] / 2,
      center[1] - size[1] / 2,
      center[2] - size[2] / 2,
    ),
    max: new THREE.Vector3(
      center[0] + size[0] / 2,
      center[1] + size[1] / 2,
      center[2] + size[2] / 2,
    ),
  };
}

/** Box, deren Unterseite mittig auf `bottom` steht (z. B. Checkpoint auf dem Boden). */
export function aabbFromBottom(bottom: Vec3, size: Vec3): Aabb {
  return aabbFromCenter([bottom[0], bottom[1] + size[1] / 2, bottom[2]], size);
}

export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

/** Hüllbox der Spielerkapsel; `shrink` macht Kill-Zonen etwas nachsichtiger. */
export function playerAabb(
  feet: THREE.Vector3,
  radius: number,
  height: number,
  out: Aabb,
  shrink = 0,
): Aabb {
  const r = Math.max(0, radius - shrink);
  out.min.set(feet.x - r, feet.y + shrink, feet.z - r);
  out.max.set(feet.x + r, feet.y + height - shrink, feet.z + r);
  return out;
}

export function createAabb(): Aabb {
  return { min: new THREE.Vector3(), max: new THREE.Vector3() };
}

/**
 * Erster Eintrittszeitpunkt (0…1) der Strecke p0 → p1 in die Box (Slab-Methode), sonst null.
 * Liegt p0 bereits in der Box, ist das Ergebnis 0. Wird für die exakte Zielzeit benutzt.
 */
export function segmentEntry(p0: THREE.Vector3, p1: THREE.Vector3, box: Aabb): number | null {
  let tMin = 0;
  let tMax = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const start = p0[axis];
    const delta = p1[axis] - start;
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(delta) < 1e-12) {
      if (start < lo || start > hi) return null;
      continue;
    }
    let t0 = (lo - start) / delta;
    let t1 = (hi - start) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }
  return tMin;
}
