import type * as THREE from 'three';
import type { AirConfig, GroundConfig } from '../config/movement';

/**
 * Reine Bewegungsmathematik für Boden- und Luftbewegung.
 * Alle Funktionen verändern nur die übergebenen Vektoren und sind dadurch direkt testbar.
 * Es wird nur die horizontale Komponente (x/z) bearbeitet, außer bei der Gravitation.
 */

export function horizontalSpeed(v: THREE.Vector3): number {
  return Math.hypot(v.x, v.z);
}

/** Skaliert nur die horizontale Komponente. */
export function scaleHorizontal(v: THREE.Vector3, factor: number): void {
  v.x *= factor;
  v.z *= factor;
}

/** Zieht die horizontale Geschwindigkeit um höchstens `maxDelta` in Richtung (tx, tz). */
export function moveTowardsHorizontal(
  v: THREE.Vector3,
  tx: number,
  tz: number,
  maxDelta: number,
): void {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxDelta || dist < 1e-9) {
    v.x = tx;
    v.z = tz;
    return;
  }
  v.x += (dx / dist) * maxDelta;
  v.z += (dz / dist) * maxDelta;
}

/**
 * Wunschrichtung aus WASD/Stick relativ zur Blickrichtung (yaw, rad).
 * Konvention wie Three.js: yaw = 0 blickt nach -Z, rechts ist +X.
 * Die Länge ist ≤ 1 (analoge Sticks erlauben Teilgeschwindigkeit).
 */
export function wishDirection(
  moveX: number,
  moveY: number,
  yaw: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // vorwärts = (-sin, 0, -cos), rechts = (cos, 0, -sin)
  let x = -sin * moveY + cos * moveX;
  let z = -cos * moveY - sin * moveX;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return out.set(x, 0, z);
}

/**
 * Bodenbewegung: Beschleunigen/Abbremsen statt sofortiger Maximalgeschwindigkeit.
 * Überschuss-Tempo (z. B. nach einem Slide-Jump) bleibt lenkbar und baut sich nur langsam ab,
 * damit Schwung beim Landen nicht abrupt verloren geht.
 */
export function applyGroundMovement(
  v: THREE.Vector3,
  wish: THREE.Vector3,
  maxSpeed: number,
  cfg: GroundConfig,
  dt: number,
): void {
  const wishLen = Math.hypot(wish.x, wish.z);
  const speed = horizontalSpeed(v);

  if (wishLen < 1e-3) {
    const next = Math.max(0, speed - cfg.deceleration * dt);
    scaleHorizontal(v, speed > 1e-6 ? next / speed : 0);
    return;
  }

  const wx = wish.x / wishLen;
  const wz = wish.z / wishLen;
  const targetSpeed = maxSpeed * Math.min(1, wishLen);

  if (speed > targetSpeed + 0.05) {
    const dirX = v.x / speed;
    const dirZ = v.z / speed;
    const alignment = dirX * wx + dirZ * wz;
    if (alignment < 0) {
      // Gegenlenken: normal abbremsen, Richtung behalten (keine verlustfreie Kehrtwende).
      const next = Math.max(0, speed - cfg.deceleration * dt);
      scaleHorizontal(v, next / speed);
      return;
    }
    const next = Math.max(targetSpeed, speed - cfg.overspeedDeceleration * dt);
    const t = 1 - Math.exp(-cfg.overspeedSteer * dt);
    let nx = dirX + (wx - dirX) * t;
    let nz = dirZ + (wz - dirZ) * t;
    const nLen = Math.hypot(nx, nz);
    nx /= nLen;
    nz /= nLen;
    v.x = nx * next;
    v.z = nz * next;
    return;
  }

  moveTowardsHorizontal(v, wx * targetSpeed, wz * targetSpeed, cfg.acceleration * dt);
}

/**
 * Luftkontrolle (Quake-Prinzip): Eingabe beschleunigt nur, solange die Geschwindigkeit in
 * Eingaberichtung unter `inputSpeed` liegt. Zusätzlich darf das Gesamttempo durch Lenken nicht über
 * max(vorher, inputSpeed) steigen – Lenken ja, „Air-Strafe“-Tempogewinn nein.
 */
export function applyAirMovement(
  v: THREE.Vector3,
  wish: THREE.Vector3,
  cfg: AirConfig,
  dt: number,
): void {
  if (cfg.drag > 0) scaleHorizontal(v, Math.max(0, 1 - cfg.drag * dt));
  const wishLen = Math.hypot(wish.x, wish.z);
  if (wishLen < 1e-3) return;
  const wx = wish.x / wishLen;
  const wz = wish.z / wishLen;
  const before = horizontalSpeed(v);
  const along = v.x * wx + v.z * wz;
  const add = cfg.inputSpeed * Math.min(1, wishLen) - along;
  if (add <= 0) return;
  const accel = Math.min(cfg.acceleration * dt, add);
  v.x += wx * accel;
  v.z += wz * accel;
  const limit = Math.max(before, cfg.inputSpeed);
  const after = horizontalSpeed(v);
  if (after > limit) scaleHorizontal(v, limit / after);
}

/** Gravitation mit optional stärkerem Fallen und Grenzgeschwindigkeit. */
export function applyGravity(
  v: THREE.Vector3,
  gravity: number,
  scale: number,
  fallMultiplier: number,
  maxFallSpeed: number,
  dt: number,
): void {
  const g = gravity * scale * (v.y < 0 ? fallMultiplier : 1);
  v.y = Math.max(v.y - g * dt, -maxFallSpeed);
}

/** Minimale Kontaktinfo für {@link clipAgainstContacts} (entspricht PlayerBody.Contact). */
export interface ContactLike {
  readonly normal: THREE.Vector3;
  readonly height: number;
}

export interface ClipOptions {
  /** cos des maximalen Hangwinkels: Kontakte mit ny darüber sind Boden. */
  walkableNormalY: number;
  /** Kontakte unterhalb dieser Höhe (über den Füßen) gelten am Boden als Stufenkante. */
  stepHeight: number;
  /** Steht der Spieler gerade (Grounded/Sliding)? */
  onGround: boolean;
}

/**
 * Entfernt den Geschwindigkeitsanteil, der in Wände oder Decken hineinzeigt, damit sich an
 * Hindernissen keine „gespeicherte“ Geschwindigkeit aufbaut.
 *
 * - Boden (ny ≥ walkableNormalY) wird ignoriert – den Bodenkontakt regelt der State, sonst würde
 *   Bergauflaufen künstlich gebremst.
 * - Wände werden nur horizontal geclippt: Schräge Kanten-Normalen sollen keinen Auftrieb erzeugen.
 * - Am Boden werden niedrige Kontakte (Stufenkanten) übersprungen, damit Autostep funktioniert.
 */
export function clipAgainstContacts(
  v: THREE.Vector3,
  contacts: readonly ContactLike[],
  count: number,
  options: ClipOptions,
): void {
  for (let i = 0; i < count; i++) {
    const { normal: n, height } = contacts[i]!;
    if (n.y >= options.walkableNormalY) continue;
    if (n.y <= -0.3) {
      // Decke: nur die Aufwärtsbewegung stoppen.
      if (v.y > 0) v.y = 0;
      continue;
    }
    if (options.onGround && height <= options.stepHeight + 0.05) continue;
    const hLen = Math.hypot(n.x, n.z);
    if (hLen < 1e-3) continue;
    const hx = n.x / hLen;
    const hz = n.z / hLen;
    const into = v.x * hx + v.z * hz;
    if (into < 0) {
      v.x -= hx * into;
      v.z -= hz * into;
    }
  }
}
