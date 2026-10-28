import * as THREE from 'three';
import { jumpVelocity, type MovementConfig } from '../config/movement';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, JumpKind } from '../core/events';
import type { PlayerInput } from '../core/Input';
import type { Physics } from '../core/Physics';
import {
  applyAirMovement,
  applyGravity,
  applyGroundMovement,
  clipAgainstContacts,
  horizontalSpeed,
  wishDirection,
} from '../mechanics/Locomotion';
import { MOVE_TRANSITIONS, MoveState } from './MoveState';
import {
  createGroundProbe,
  createMoveResult,
  PlayerBody,
  type GroundProbe,
  type MoveResult,
} from './PlayerBody';
import { StateMachine } from './StateMachine';

/** Blickrichtung der Kamera (rad), wird pro Tick an den Controller übergeben. */
export interface PlayerView {
  yaw: number;
  pitch: number;
}

/**
 * Spieler-Controller als State Machine.
 *
 * Ablauf pro festem Physik-Tick:
 * 1. Eingabe-Flanken in Timer übernehmen (Jump Buffer),
 * 2. Sensoren (Bodensonde),
 * 3. State-Logik setzt die Geschwindigkeit und löst ggf. Übergänge aus,
 * 4. Integration über den Character Controller inkl. Kollisionsauflösung,
 * 5. Kontaktauswertung (Landen, Kante verlassen).
 */
export class PlayerController {
  readonly body: PlayerBody;
  readonly velocity = new THREE.Vector3();
  readonly fsm: StateMachine<MoveState>;
  /** Fußposition vor dem letzten Tick – für die Render-Interpolation. */
  readonly previousFeet = new THREE.Vector3();
  readonly ground: GroundProbe = createGroundProbe();
  readonly lastMove: MoveResult = createMoveResult();
  /** Bodenkontakt nach dem letzten Bewegungsschritt. */
  grounded = false;
  /** Kontinuierlicher Schrittzähler (für Head-Bob und Schrittgeräusche). */
  stride = 0;
  /** Sekunden seit dem letzten Bodenkontakt. */
  airTime = 0;
  /** Aufprallgeschwindigkeit der letzten Landung (m/s, positiv). */
  lastImpactSpeed = 0;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpCutArmed = false;
  /** Blickrichtung aus dem letzten Tick (Wall Jump und Grapple brauchen sie). */
  view: PlayerView = { yaw: 0, pitch: 0 };
  private input: PlayerInput | null = null;
  private readonly wish = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(
    readonly physics: Physics,
    readonly events: EventBus<GameEvents>,
    readonly cfg: MovementConfig,
    spawnFeet: THREE.Vector3,
  ) {
    this.body = new PlayerBody(physics, cfg.player, spawnFeet);
    this.previousFeet.copy(spawnFeet);
    this.fsm = new StateMachine<MoveState>(MoveState.Airborne, MOVE_TRANSITIONS, (from, to) =>
      this.events.emit('stateChange', { from, to }),
    );
  }

  get state(): MoveState {
    return this.fsm.state;
  }

  get feet(): THREE.Vector3 {
    return this.body.feet;
  }

  /** Augenhöhe, die die Kamera ansteuern soll (stehend oder geduckt). */
  get targetEyeHeight(): number {
    return this.body.isCrouched ? this.cfg.player.eyeHeightCrouch : this.cfg.player.eyeHeightStand;
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.velocity);
  }

  /** Restzeiten für Debug-Anzeige. */
  get timers(): { coyote: number; jumpBuffer: number } {
    return { coyote: this.coyoteTimer, jumpBuffer: this.jumpBufferTimer };
  }

  /** Interpolierte Fußposition für das Rendering zwischen zwei Physik-Ticks. */
  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.previousFeet, this.body.feet, alpha);
  }

  fixedUpdate(dt: number, input: PlayerInput, view: PlayerView): void {
    this.previousFeet.copy(this.body.feet);
    this.input = input;
    this.view = view;

    this.carryWithPlatform();
    if (input.jumpPressed) this.jumpBufferTimer = this.cfg.jump.bufferTime;
    wishDirection(input.moveX, input.moveY, view.yaw, this.wish);
    this.body.probeGround(0.6, this.ground);

    switch (this.fsm.state) {
      case MoveState.Grounded:
        this.updateGrounded(dt);
        break;
      default:
        this.updateAirborne(dt);
        break;
    }

    this.integrate(dt);
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.fsm.tick(dt);
  }

  /** Setzt den Spieler zurück (Spawn/Respawn): Position, Geschwindigkeit, State und Timer. */
  teleport(feet: THREE.Vector3): void {
    this.body.setCrouched(false);
    this.body.teleport(feet);
    this.previousFeet.copy(feet);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpCutArmed = false;
    this.airTime = 0;
    this.fsm.force(MoveState.Airborne);
  }

  dispose(): void {
    this.body.dispose();
  }

  // ---------------------------------------------------------------- States

  private updateGrounded(dt: number): void {
    if (this.jumpBufferTimer > 0 && this.tryJump('ground')) return;
    const maxSpeed = this.body.isCrouched ? this.cfg.ground.crouchSpeed : this.cfg.ground.runSpeed;
    applyGroundMovement(this.velocity, this.wish, maxSpeed, this.cfg.ground, dt);
    this.velocity.y = -this.cfg.player.groundStickSpeed;
  }

  private updateAirborne(dt: number): void {
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && this.tryJump('coyote')) return;

    // Variable Sprunghöhe: Loslassen während des Steigens kappt die Aufwärtsgeschwindigkeit einmalig.
    if (this.jumpCutArmed) {
      if (this.velocity.y <= 0) this.jumpCutArmed = false;
      else if (!this.input?.jumpHeld) {
        this.velocity.y *= this.cfg.jump.cutMultiplier;
        this.jumpCutArmed = false;
      }
    }

    applyGravity(
      this.velocity,
      this.cfg.gravity,
      1,
      this.cfg.air.fallGravityMultiplier,
      this.cfg.maxFallSpeed,
      dt,
    );
    applyAirMovement(this.velocity, this.wish, this.cfg.air, dt);
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
  }

  // ---------------------------------------------------------------- Aktionen

  private tryJump(kind: JumpKind): boolean {
    // Unter niedriger Decke kann man nicht aufstehen – und damit nicht springen.
    if (this.body.isCrouched && !this.body.setCrouched(false)) return false;
    this.velocity.y = jumpVelocity(this.cfg, this.cfg.jump.height);
    const platform = this.grounded || kind === 'coyote' ? this.ground.surface?.platform : undefined;
    if (platform) {
      const k = this.cfg.jump.platformInherit;
      this.velocity.x += platform.velocity.x * k;
      this.velocity.z += platform.velocity.z * k;
      this.velocity.y += Math.max(0, platform.velocity.y) * k;
    }
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.jumpCutArmed = this.input?.jumpHeld ?? false;
    this.grounded = false;
    this.fsm.transition(MoveState.Airborne);
    this.events.emit('jump', { kind, speed: this.horizontalSpeed });
    return true;
  }

  private land(impactVelocityY: number): void {
    const impact = Math.max(0, -impactVelocityY);
    this.lastImpactSpeed = impact;
    this.velocity.y = -this.cfg.player.groundStickSpeed;
    this.jumpCutArmed = false;
    this.fsm.transition(MoveState.Grounded);
    this.events.emit('land', {
      impactSpeed: impact,
      horizontalSpeed: this.horizontalSpeed,
      hard: impact > 14,
      roll: false,
    });
  }

  // ---------------------------------------------------------------- Physik

  /** Steht der Spieler auf einer beweglichen Plattform, wird er mit ihr verschoben. */
  private carryWithPlatform(): void {
    const platform = this.grounded ? this.ground.surface?.platform : undefined;
    if (!platform) return;
    const d = platform.delta;
    if (d.x === 0 && d.y === 0 && d.z === 0) return;
    this.desired.set(d.x, d.y, d.z);
    this.body.translate(this.desired);
  }

  private integrate(dt: number): void {
    const state = this.fsm.state;
    this.body.setSnapToGround(state === MoveState.Grounded || state === MoveState.Sliding);

    const preVelocityY = this.velocity.y;
    this.desired.copy(this.velocity).multiplyScalar(dt);
    this.body.move(this.desired, this.lastMove);
    clipAgainstContacts(this.velocity, this.lastMove.contacts, this.lastMove.contactCount, {
      walkableNormalY: this.body.walkableNormalY,
      stepHeight: this.cfg.player.stepHeight,
      onGround: state === MoveState.Grounded || state === MoveState.Sliding,
    });
    this.grounded = this.lastMove.grounded && this.velocity.y <= 0.5;

    if (state === MoveState.Airborne && this.grounded) {
      this.land(preVelocityY);
    } else if (state === MoveState.Grounded && !this.grounded) {
      // Kante verlassen, ohne zu springen → Coyote Time startet.
      this.coyoteTimer = this.cfg.jump.coyoteTime;
      this.fsm.transition(MoveState.Airborne);
    }

    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.fsm.state === MoveState.Grounded) this.advanceStride(this.horizontalSpeed * dt);
  }

  private advanceStride(distance: number): void {
    const before = Math.floor(this.stride);
    this.stride += distance / this.cfg.ground.stepLength;
    if (Math.floor(this.stride) !== before) {
      this.events.emit('footstep', { speed: this.horizontalSpeed, onWall: false });
    }
  }
}
