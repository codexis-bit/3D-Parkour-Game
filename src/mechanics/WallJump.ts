import type * as THREE from 'three';
import type { WallJumpConfig } from '../config/movement';

/**
 * Berechnet die Geschwindigkeit nach einem Wall Jump (rein, testbar).
 *
 * Zusammensetzung der horizontalen Geschwindigkeit:
 * - Tempo entlang der Wand bleibt (anteilig) erhalten → Schwung für Ketten,
 * - Abstoß entlang der Wandnormalen,
 * - Schub in Blickrichtung, aber ohne Anteil in die Wand hinein.
 * Das Ergebnis wird gedeckelt, damit Ketten nicht unbegrenzt beschleunigen.
 *
 * @param wallNormal Normale der Wand (zeigt zum Spieler); wird horizontal ausgewertet.
 * @param lookYaw Blickrichtung (rad, Three.js-Konvention: 0 = -Z).
 */
export function computeWallJumpVelocity(
  velocity: THREE.Vector3,
  wallNormal: THREE.Vector3,
  lookYaw: number,
  cfg: WallJumpConfig,
  out: THREE.Vector3,
): THREE.Vector3 {
  const nLen = Math.hypot(wallNormal.x, wallNormal.z) || 1;
  const nx = wallNormal.x / nLen;
  const nz = wallNormal.z / nLen;

  const vx = velocity.x;
  const vz = velocity.z;
  const into = vx * nx + vz * nz;
  const alongX = vx - into * nx;
  const alongZ = vz - into * nz;

  let lookX = -Math.sin(lookYaw);
  let lookZ = -Math.cos(lookYaw);
  const lookInto = lookX * nx + lookZ * nz;
  if (lookInto < 0) {
    lookX -= lookInto * nx;
    lookZ -= lookInto * nz;
  }

  let rx = alongX * cfg.keepAlong + nx * cfg.outSpeed + lookX * cfg.lookBoost;
  let rz = alongZ * cfg.keepAlong + nz * cfg.outSpeed + lookZ * cfg.lookBoost;
  const limit = Math.max(Math.hypot(vx, vz) + cfg.maxSpeedGain, cfg.outSpeed + cfg.lookBoost);
  const len = Math.hypot(rx, rz);
  if (len > limit) {
    rx *= limit / len;
    rz *= limit / len;
  }
  return out.set(rx, cfg.upSpeed, rz);
}
