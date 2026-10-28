import * as THREE from 'three';
import type { SurfaceKind } from '../core/Physics';
import { DEG2RAD } from '../core/math';
import type { MaterialKey } from './materials';
import type { LevelData, LevelElement, Vec3 } from './types';

/**
 * Übersetzt Level-Elemente in einheitliche, statische Boxen.
 * Physik (Collider) und Optik (Meshes) werden beide aus dieser Liste gebaut, damit sie nie
 * auseinanderlaufen. Diese Datei hat keine DOM-/WebGL-Abhängigkeiten und läuft auch in Tests.
 */

export interface ResolvedBox {
  /** Index des Elements im Level (dient als Element-ID). */
  elementIndex: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  quaternion: THREE.Quaternion;
  material: MaterialKey;
  surface: SurfaceKind;
  wallRunnable: boolean;
  castShadow: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

export function toVector3(v: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v[0], v[1], v[2]);
}

/** Quaternion aus `rot` in Grad (Reihenfolge YXZ, wie die Spielerkamera). */
export function quaternionFromDegrees(rot: Vec3 | undefined): THREE.Quaternion {
  if (!rot) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rot[0] * DEG2RAD, rot[1] * DEG2RAD, rot[2] * DEG2RAD, 'YXZ'),
  );
}

/**
 * Box einer Rampe: lokale Achsen x = Breite, y = Flächennormale, z = Anstiegsrichtung.
 * Die Box wird um die halbe Stärke nach unten versetzt, damit die Oberseite durch from/to läuft.
 */
export function resolveRamp(
  from: Vec3,
  to: Vec3,
  width: number,
  thickness: number,
): { center: THREE.Vector3; size: THREE.Vector3; quaternion: THREE.Quaternion } {
  const a = toVector3(from);
  const b = toVector3(to);
  const forward = b.clone().sub(a);
  const length = forward.length();
  forward.normalize();
  if (Math.abs(forward.y) > 0.999) throw new Error('Rampe darf nicht senkrecht sein');
  // Rechtshändige Basis: right = up × forward, normal = forward × right.
  const right = new THREE.Vector3().crossVectors(UP, forward).normalize();
  const normal = new THREE.Vector3().crossVectors(forward, right).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, normal, forward);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  const center = a
    .add(b)
    .multiplyScalar(0.5)
    .addScaledVector(normal, -thickness / 2);
  return { center, size: new THREE.Vector3(width, thickness, length), quaternion };
}

/** Wandstärke der Tunnel-Seitenwände. */
const TUNNEL_WALL = 0.4;

function resolveSlideTunnel(
  element: Extract<LevelElement, { type: 'slideTunnel' }>,
  index: number,
  out: ResolvedBox[],
): void {
  const quaternion = quaternionFromDegrees([0, element.yaw ?? 0, 0]);
  const base = toVector3(element.pos);
  const thickness = element.ceilingThickness ?? 1.5;
  const withWalls = element.walls ?? true;
  const outerWidth = element.width + (withWalls ? TUNNEL_WALL * 2 : 0);
  const local = (x: number, y: number): THREE.Vector3 =>
    new THREE.Vector3(x, y, 0).applyQuaternion(quaternion).add(base);
  const common = {
    elementIndex: index,
    quaternion,
    material: 'slide' as const,
    surface: 'solid' as const,
    wallRunnable: false,
    castShadow: true,
  };
  out.push({
    ...common,
    center: local(0, element.clearance + thickness / 2),
    size: new THREE.Vector3(outerWidth, thickness, element.length),
  });
  if (!withWalls) return;
  for (const side of [-1, 1]) {
    out.push({
      ...common,
      quaternion: quaternion.clone(),
      center: local(side * (element.width / 2 + TUNNEL_WALL / 2), element.clearance / 2),
      size: new THREE.Vector3(TUNNEL_WALL, element.clearance, element.length),
    });
  }
}

function resolveElement(element: LevelElement, index: number, out: ResolvedBox[]): void {
  switch (element.type) {
    case 'platform':
      out.push({
        elementIndex: index,
        center: toVector3(element.pos),
        size: toVector3(element.size),
        quaternion: quaternionFromDegrees(element.rot),
        material: element.style ?? 'base',
        surface: 'solid',
        wallRunnable: false,
        castShadow: true,
      });
      return;
    case 'ramp': {
      const ramp = resolveRamp(element.from, element.to, element.width, element.thickness ?? 0.5);
      out.push({
        elementIndex: index,
        ...ramp,
        material: 'ramp',
        surface: 'solid',
        wallRunnable: false,
        castShadow: true,
      });
      return;
    }
    case 'slideTunnel':
      resolveSlideTunnel(element, index, out);
      return;
  }
}

/** Alle statischen Boxen eines Levels. */
export function resolveStaticBoxes(level: LevelData): ResolvedBox[] {
  const boxes: ResolvedBox[] = [];
  level.elements.forEach((element, index) => resolveElement(element, index, boxes));
  return boxes;
}
