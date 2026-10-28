import type * as THREE from 'three';
import { CAMERA } from '../config/camera';
import { clamp, damp, DEG2RAD, wrapAngle } from '../core/math';
import type { PlayerController, PlayerView } from './PlayerController';

/**
 * First-Person-Kamera: Blick per Maus (Yaw/Pitch), Position an der interpolierten Spielerposition.
 * Kamera-Feedback (Head-Bob, Tilt, FOV-Boost, Shake) kommt in einem späteren Meilenstein dazu.
 */
export class CameraRig {
  /** Gieren (rad): 0 = Blick nach -Z. */
  yaw = 0;
  /** Nicken (rad): positiv = nach oben. */
  pitch = 0;
  sensitivity = 1;
  invertY = false;

  private eyeHeight: number;
  private readonly view: PlayerView = { yaw: 0, pitch: 0 };
  private readonly pitchLimit = CAMERA.pitchLimitDeg * DEG2RAD;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    initialEyeHeight: number,
  ) {
    this.eyeHeight = initialEyeHeight;
  }

  /** Verarbeitet Mausbewegung in Pixeln. */
  applyLook(dx: number, dy: number): void {
    const k = CAMERA.radiansPerPixel * this.sensitivity;
    this.yaw = wrapAngle(this.yaw - dx * k);
    this.pitch = clamp(
      this.pitch - dy * k * (this.invertY ? -1 : 1),
      -this.pitchLimit,
      this.pitchLimit,
    );
  }

  /** Blickrichtung für den Physik-Tick (wird wiederverwendet, keine Allokation). */
  getView(): PlayerView {
    this.view.yaw = this.yaw;
    this.view.pitch = this.pitch;
    return this.view;
  }

  /** Setzt die Blickrichtung hart, z. B. beim Spawn. */
  setOrientation(yaw: number, pitch = 0): void {
    this.yaw = wrapAngle(yaw);
    this.pitch = clamp(pitch, -this.pitchLimit, this.pitchLimit);
  }

  /** Setzt die Augenhöhe ohne Glättung (Spawn/Respawn). */
  snapEyeHeight(height: number): void {
    this.eyeHeight = height;
  }

  /** Pro Frame: Kamera an die interpolierte Fußposition setzen. */
  update(dt: number, feet: THREE.Vector3, player: PlayerController): void {
    this.eyeHeight = damp(this.eyeHeight, player.targetEyeHeight, CAMERA.eyeHeightLambda, dt);
    this.camera.position.set(feet.x, feet.y + this.eyeHeight, feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** Normalisierte Blickrichtung in Weltkoordinaten. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}
