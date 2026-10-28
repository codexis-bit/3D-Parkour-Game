import type * as THREE from 'three';
import { CAMERA } from '../config/camera';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { clamp, damp, DEG2RAD, easeInOutCubic, lerp, smoothstep, wrapAngle } from '../core/math';
import { MoveState } from './MoveState';
import type { PlayerView } from './PlayerContext';

/** Ein-/ausschaltbare Effekte (Optionsmenü, z. B. gegen Motion Sickness). */
export interface CameraEffects {
  headBob: boolean;
  shake: boolean;
  dynamicFov: boolean;
}

/** Was die Kamera pro Frame vom Spieler braucht – der PlayerController erfüllt das strukturell. */
export interface CameraSubject {
  readonly horizontalSpeed: number;
  readonly state: MoveState;
  readonly targetEyeHeight: number;
  /** Schrittzähler (ganzzahlig = Fuß setzt auf) aus diesem und dem vorigen Physik-Tick. */
  readonly stride: number;
  readonly previousStride: number;
  readonly input: { readonly moveX: number };
  readonly wallRun: { readonly normal: { readonly x: number; readonly z: number } };
  readonly vault: { readonly progress: number };
}

/** Glattes Pseudo-Rauschen in [-1, 1] aus überlagerten Sinuswellen (für Kamera-Shake). */
function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed * 12.9898) * 0.5 +
    Math.sin(t * 2.31 + seed * 7.233) * 0.3 +
    Math.sin(t * 4.73 + seed * 3.917) * 0.2
  );
}

/**
 * First-Person-Kamera: Blick per Maus (Yaw/Pitch), Position an der interpolierten Spielerposition –
 * plus Kamera-Feedback: Head-Bob, Neigung beim Wall Run/Slide/Strafen, dynamisches FOV,
 * Shake bei harten Landungen, Absacken per Feder, Abrollen und Nicken beim Hochziehen.
 */
export class CameraRig {
  /** Gieren (rad): 0 = Blick nach -Z. */
  yaw = 0;
  /** Nicken (rad): positiv = nach oben. */
  pitch = 0;
  sensitivity = 1;
  invertY = false;
  effects: CameraEffects = { headBob: true, shake: true, dynamicFov: true };
  /** FOV-Zuschlag in Grad (Tempo + Kicks), wird vom Spiel auf das Basis-FOV addiert. */
  fovOffset = 0;
  /** Geglättete Tempo-Intensität 0–1 (für die Vignette im HUD), folgt dem Tempo-FOV. */
  speedIntensity = 0;

  private eyeHeight: number;
  private readonly view: PlayerView = { yaw: 0, pitch: 0 };
  private readonly pitchLimit = CAMERA.pitchLimitDeg * DEG2RAD;
  private readonly unsubscribers: (() => void)[] = [];
  private time = 0;
  private bobIntensity = 0;
  private roll = 0;
  private speedFov = 0;
  private fovKick = 0;
  private trauma = 0;
  private dip = 0;
  private dipVelocity = 0;
  private rollTimer = -1;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    initialEyeHeight: number,
  ) {
    this.eyeHeight = initialEyeHeight;
  }

  /** Reagiert auf Spielereignisse (Landung, Grapple, Sprungpad, Tod). */
  attach(events: EventBus<GameEvents>): void {
    this.detach();
    const { shake, landing, fovEffects } = CAMERA;
    this.unsubscribers.push(
      events.on('land', ({ impactSpeed, hard, roll }) => {
        this.dipVelocity -= Math.min(impactSpeed * landing.dipPerSpeed, landing.maxDipVelocity);
        if (roll) {
          this.rollTimer = 0;
          this.addTrauma(shake.roll);
        } else if (hard) {
          this.addTrauma(shake.hardLanding);
        }
      }),
      events.on('grappleAttach', () => {
        this.fovKick += fovEffects.grappleKickDeg;
        this.addTrauma(shake.grappleAttach);
      }),
      events.on('jumpPad', () => {
        this.fovKick += fovEffects.jumpPadKickDeg;
        this.addTrauma(shake.jumpPad);
      }),
      events.on('slideStart', ({ boosted }) => {
        if (boosted) this.fovKick += fovEffects.slideKickDeg;
      }),
      events.on('death', () => this.addTrauma(shake.death)),
    );
  }

  detach(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
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

  /** Blick direkt in Radiant drehen (Gamepad). */
  rotate(yawDelta: number, pitchDelta: number): void {
    this.yaw = wrapAngle(this.yaw + yawDelta);
    this.pitch = clamp(
      this.pitch + pitchDelta * (this.invertY ? -1 : 1),
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

  /** Setzt die Augenhöhe ohne Glättung und alle Effekte zurück (Spawn/Respawn). */
  snapEyeHeight(height: number): void {
    this.eyeHeight = height;
    this.resetEffects();
  }

  resetEffects(): void {
    this.bobIntensity = 0;
    this.roll = 0;
    this.speedFov = 0;
    this.fovKick = 0;
    this.trauma = 0;
    this.dip = 0;
    this.dipVelocity = 0;
    this.rollTimer = -1;
    this.fovOffset = 0;
    this.speedIntensity = 0;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Pro Frame: Kamera an die interpolierte Fußposition setzen und alle Effekte anwenden. */
  update(dt: number, feet: THREE.Vector3, player: CameraSubject, alpha: number): void {
    this.time += dt;
    const speed = player.horizontalSpeed;
    const state = player.state;
    this.eyeHeight = damp(this.eyeHeight, player.targetEyeHeight, CAMERA.eyeHeightLambda, dt);

    this.updateLandingSpring(dt);

    // Abrollen: einmal vorwärts um die eigene Achse, dabei kurz tief.
    let rollPitch = 0;
    let rollDip = 0;
    if (this.rollTimer >= 0) {
      this.rollTimer += dt;
      const p = this.rollTimer / CAMERA.roll.duration;
      if (p >= 1) this.rollTimer = -1;
      else {
        rollPitch = -Math.PI * 2 * easeInOutCubic(p);
        rollDip = -CAMERA.roll.dip * Math.sin(Math.PI * p);
      }
    }

    // Head-Bob: Tiefpunkt bei ganzzahligem Schrittzähler (dort spielt auch der Schritt-Sound).
    const bob = CAMERA.bob;
    const bobTarget =
      this.effects.headBob && state === MoveState.Grounded ? clamp(speed / bob.fullSpeed, 0, 1) : 0;
    this.bobIntensity = damp(this.bobIntensity, bobTarget, bob.lambda, dt);
    const stride = lerp(player.previousStride, player.stride, alpha);
    const bobY = -bob.amplitudeY * this.bobIntensity * (0.5 - 0.5 * Math.cos(Math.PI * 2 * stride));
    const sway = Math.sin(Math.PI * stride) * this.bobIntensity;
    const bobX = bob.amplitudeX * sway;
    const bobRoll = bob.rollDeg * sway;

    // Neigung: beim Wall Run von der Wand weg, im Slide leicht, beim Strafen minimal.
    const tilt = CAMERA.tilt;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    let targetRoll = -tilt.strafeDeg * player.input.moveX;
    if (state === MoveState.WallRunning) {
      const n = player.wallRun.normal;
      targetRoll = -tilt.wallRunDeg * clamp((n.x * rightX + n.z * rightZ) * 1.4, -1, 1);
    } else if (state === MoveState.Sliding) {
      targetRoll = tilt.slideDeg;
    }
    this.roll = damp(this.roll, targetRoll, tilt.lambda, dt);

    // Hochziehen: kurz nach unten nicken.
    const vaultP = state === MoveState.Vaulting ? Math.sin(Math.PI * player.vault.progress) : 0;
    const vaultPitch = -CAMERA.vault.pitchDipDeg * vaultP;
    const vaultDip = -CAMERA.vault.eyeDip * vaultP;

    // Shake (Trauma²) – abschaltbar.
    const sh = CAMERA.shake;
    this.trauma = Math.max(0, this.trauma - sh.decay * dt);
    const shake = this.effects.shake ? this.trauma * this.trauma : 0;
    const t = this.time * sh.frequency;
    const shakePitch = sh.maxPitchDeg * shake * wobble(t, 1);
    const shakeYaw = sh.maxYawDeg * shake * wobble(t, 2);
    const shakeRoll = sh.maxRollDeg * shake * wobble(t, 3);

    // Dynamisches FOV: Tempo-Boost plus kurze Kicks.
    const fx = CAMERA.fovEffects;
    const speedTarget = this.effects.dynamicFov
      ? fx.speedBoostDeg * smoothstep(fx.speedStart, fx.speedFull, speed)
      : 0;
    this.speedFov = damp(this.speedFov, speedTarget, fx.lambda, dt);
    this.fovKick = this.effects.dynamicFov ? this.fovKick * Math.exp(-fx.kickDecay * dt) : 0;
    this.fovOffset = this.speedFov + this.fovKick;
    this.speedIntensity = fx.speedBoostDeg > 0 ? this.speedFov / fx.speedBoostDeg : 0;

    this.camera.position.set(
      feet.x + rightX * bobX,
      feet.y + this.eyeHeight + bobY + this.dip + rollDip + vaultDip,
      feet.z + rightZ * bobX,
    );
    this.camera.rotation.set(
      this.pitch + rollPitch + (vaultPitch + shakePitch) * DEG2RAD,
      this.yaw + shakeYaw * DEG2RAD,
      (this.roll + bobRoll + shakeRoll) * DEG2RAD,
      'YXZ',
    );
  }

  /** Normalisierte Blickrichtung in Weltkoordinaten. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** Feder-Dämpfer für das Absacken bei Landungen (in kleinen Teilschritten, stabil bei Rucklern). */
  private updateLandingSpring(dt: number): void {
    const { spring, damping } = CAMERA.landing;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 240);
      const accel = -spring * this.dip - damping * this.dipVelocity;
      this.dipVelocity += accel * h;
      this.dip += this.dipVelocity * h;
      remaining -= h;
    }
  }
}
