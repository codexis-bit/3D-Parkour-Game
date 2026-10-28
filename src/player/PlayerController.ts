import * as THREE from 'three';
import { jumpVelocity, type MovementConfig } from '../config/movement';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, GrappleReleaseReason, JumpKind } from '../core/events';
import { createPlayerInput, type PlayerInput } from '../core/Input';
import type { Physics } from '../core/Physics';
import {
  applyAirMovement,
  applyGravity,
  applyGroundMovement,
  clipAgainstContacts,
  horizontalSpeed,
  wishDirection,
} from '../mechanics/Locomotion';
import { Grapple, type GrapplePoint } from '../mechanics/Grapple';
import { Slide } from '../mechanics/Slide';
import { computeWallJumpVelocity } from '../mechanics/WallJump';
import { createWallContact, WallRun, type WallRunResult } from '../mechanics/WallRun';
import { MOVE_TRANSITIONS, MoveState } from './MoveState';
import {
  createGroundProbe,
  createMoveResult,
  PlayerBody,
  type GroundProbe,
  type MoveResult,
} from './PlayerBody';
import type { PlayerContext, PlayerView } from './PlayerContext';
import { StateMachine } from './StateMachine';

export type { PlayerView } from './PlayerContext';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Spieler-Controller als State Machine
 * (Grounded, Airborne, Sliding, WallRunning, Grappling – Vaulting folgt).
 *
 * Ablauf pro festem Physik-Tick:
 * 1. Eingabe-Flanken in Timer übernehmen (Jump Buffer), Cooldowns weiterzählen,
 * 2. Sensoren (Bodensonde),
 * 3. State-Logik setzt die Geschwindigkeit und löst ggf. Übergänge aus,
 * 4. Integration über den Character Controller inkl. Kollisionsauflösung,
 * 5. Kontaktauswertung (Landen, Kante verlassen).
 */
export class PlayerController implements PlayerContext {
  readonly body: PlayerBody;
  readonly velocity = new THREE.Vector3();
  readonly fsm: StateMachine<MoveState>;
  /** Fußposition vor dem letzten Tick – für die Render-Interpolation. */
  readonly previousFeet = new THREE.Vector3();
  readonly ground: GroundProbe = createGroundProbe();
  readonly lastMove: MoveResult = createMoveResult();
  readonly wish = new THREE.Vector3();
  readonly slide: Slide;
  readonly wallRun: WallRun;
  readonly grapple: Grapple;
  /** Eingabe des aktuellen Ticks. */
  input: PlayerInput = createPlayerInput();
  /** Blickrichtung des aktuellen Ticks (Wall Jump und Grapple brauchen sie). */
  view: PlayerView = { yaw: 0, pitch: 0 };
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
  private grappleBufferTimer = 0;
  private jumpCutArmed = false;
  private readonly desired = new THREE.Vector3();
  /** Zusätzliche Verschiebung in diesem Tick (z. B. Seilkorrektur), nicht Teil der Geschwindigkeit. */
  private readonly correction = new THREE.Vector3();
  private readonly wallContact = createWallContact();
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly center = new THREE.Vector3();

  constructor(
    readonly physics: Physics,
    readonly events: EventBus<GameEvents>,
    readonly cfg: MovementConfig,
    spawnFeet: THREE.Vector3,
  ) {
    this.body = new PlayerBody(physics, cfg.player, spawnFeet);
    this.previousFeet.copy(spawnFeet);
    this.slide = new Slide(cfg.slide, cfg.gravity);
    this.wallRun = new WallRun(cfg.wallRun);
    this.grapple = new Grapple(cfg.grapple);
    this.fsm = new StateMachine<MoveState>(MoveState.Airborne, MOVE_TRANSITIONS, (from, to) =>
      this.onStateChange(from, to),
    );
  }

  get state(): MoveState {
    return this.fsm.state;
  }

  get timeInState(): number {
    return this.fsm.timeInState;
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

  /** Restzeiten für die Debug-Anzeige. */
  get timers(): { coyote: number; jumpBuffer: number; wallJumpGrace: number } {
    return {
      coyote: this.coyoteTimer,
      jumpBuffer: this.jumpBufferTimer,
      wallJumpGrace: this.wallRun.graceTimer,
    };
  }

  /** Augenposition (Kamera ohne Effekte) in Weltkoordinaten. */
  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.body.feet.x, this.body.feet.y + this.targetEyeHeight, this.body.feet.z);
  }

  /** Grapple-Punkte des aktuellen Levels. */
  setGrapplePoints(points: readonly GrapplePoint[]): void {
    this.grapple.setPoints(points);
  }

  /** Interpolierte Fußposition für das Rendering zwischen zwei Physik-Ticks. */
  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.previousFeet, this.body.feet, alpha);
  }

  fixedUpdate(dt: number, input: PlayerInput, view: PlayerView): void {
    this.previousFeet.copy(this.body.feet);
    this.input = input;
    this.view = view;

    this.correction.set(0, 0, 0);
    this.carryWithPlatform();
    if (input.jumpPressed) this.jumpBufferTimer = this.cfg.jump.bufferTime;
    if (input.grapplePressed) this.grappleBufferTimer = this.cfg.grapple.bufferTime;
    this.slide.tick(dt);
    this.wallRun.tick(dt);
    this.grapple.tick(dt);
    wishDirection(input.moveX, input.moveY, view.yaw, this.wish);
    this.body.probeGround(0.6, this.ground);
    this.updateGrappleHook(dt);

    switch (this.fsm.state) {
      case MoveState.Grounded:
        this.updateGrounded(dt);
        break;
      case MoveState.Sliding:
        this.updateSliding(dt);
        break;
      case MoveState.WallRunning:
        this.updateWallRunning(dt);
        break;
      case MoveState.Grappling:
        this.updateGrappling(dt);
        break;
      default:
        this.updateAirborne(dt);
        break;
    }

    this.integrate(dt);
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.grappleBufferTimer = Math.max(0, this.grappleBufferTimer - dt);
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
    this.grappleBufferTimer = 0;
    this.airTime = 0;
    this.slide.reset();
    this.wallRun.resetMemory();
    this.grapple.reset();
    this.fsm.force(MoveState.Airborne);
  }

  dispose(): void {
    this.body.dispose();
  }

  // ---------------------------------------------------------------- States

  private updateGrounded(dt: number): void {
    if (this.jumpBufferTimer > 0 && this.tryJump('ground')) return;
    // Slide-Taste: mit genug Tempo sliden, sonst ducken.
    if (this.input.slidePressed && this.slide.canStart(this.horizontalSpeed)) {
      this.startSlide();
      this.updateSliding(dt);
      return;
    }
    if (this.input.slideHeld) this.body.setCrouched(true);
    else if (this.body.isCrouched) this.body.setCrouched(false); // nur mit Kopffreiheit

    const maxSpeed = this.body.isCrouched ? this.cfg.ground.crouchSpeed : this.cfg.ground.runSpeed;
    applyGroundMovement(this.velocity, this.wish, maxSpeed, this.cfg.ground, dt);
    this.velocity.y = -this.cfg.player.groundStickSpeed;
  }

  private updateSliding(dt: number): void {
    if (this.jumpBufferTimer > 0 && this.tryJump('slide')) return;
    const normal = this.ground.hit && this.ground.distance < 0.3 ? this.ground.normal : UP;
    this.slide.update(this.velocity, normal, this.wish, dt);
    this.velocity.y = -this.cfg.player.groundStickSpeed;

    const released = !this.input.slideHeld && this.fsm.timeInState >= this.cfg.slide.minDuration;
    if (this.horizontalSpeed < this.cfg.slide.minSpeed || released) {
      this.fsm.transition(MoveState.Grounded);
      // Unter einem niedrigen Hindernis bleibt der Spieler automatisch geduckt.
      if (!this.input.slideHeld) this.body.setCrouched(false);
    }
  }

  private updateAirborne(dt: number): void {
    if (this.jumpBufferTimer > 0 && this.tryAirJump()) return;
    // In der Luft nur geduckt bleiben, solange die Slide-Taste gehalten wird.
    if (this.body.isCrouched && !this.input.slideHeld) this.body.setCrouched(false);

    // Variable Sprunghöhe: Loslassen während des Steigens kappt die Aufwärtsgeschwindigkeit einmalig.
    if (this.jumpCutArmed) {
      if (this.velocity.y <= 0) this.jumpCutArmed = false;
      else if (!this.input.jumpHeld) {
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

    // Wall Run starten, wenn seitlich eine markierte Wand ist und die Bedingungen passen.
    if (
      !this.body.isCrouched &&
      this.wallRun.findWall(
        this.body,
        this.view.yaw,
        this.cfg.wallRun.detectDistance,
        this.wallContact,
      ) &&
      this.wallRun.canStart(this, this.wallContact)
    ) {
      this.wallRun.start(this, this.wallContact);
      this.jumpCutArmed = false;
      this.fsm.transition(MoveState.WallRunning);
      this.events.emit('wallRunStart', { speed: this.horizontalSpeed });
    }
  }

  private updateWallRunning(dt: number): void {
    if (this.jumpBufferTimer > 0) {
      this.wallJump(this.wallRun.normal, this.wallRun.wallId, 'jump');
      return;
    }
    const result = this.wallRun.update(this, dt);
    if (result !== 'continue') this.endWallRun(result);
    else this.advanceStride(this.horizontalSpeed * dt * 1.25, true);
  }

  private updateGrappling(dt: number): void {
    const grapple = this.grapple;
    if (!this.input.grappleHeld) {
      this.releaseGrapple('released');
      return;
    }
    if (this.jumpBufferTimer > 0) {
      this.velocity.y = Math.max(this.velocity.y, this.cfg.grapple.jumpReleaseUpSpeed);
      this.consumeJump();
      this.releaseGrapple('jump');
      this.events.emit('jump', { kind: 'grapple', speed: this.horizontalSpeed });
      return;
    }
    this.body.center(this.center);
    if (grapple.mode === 'pull') {
      const result = grapple.updatePull(this, this.center, dt);
      if (result !== 'continue') this.releaseGrapple(result);
    } else {
      grapple.updateSwing(this, this.center, dt, this.correction);
    }
  }

  // ---------------------------------------------------------------- Aktionen

  /** Zielerfassung, Abschuss und Hakenflug – läuft unabhängig vom Movement-State. */
  private updateGrappleHook(dt: number): void {
    const grapple = this.grapple;
    this.eyePosition(this.eye);
    if (grapple.phase === 'idle') {
      const cp = Math.cos(this.view.pitch);
      this.look.set(
        -Math.sin(this.view.yaw) * cp,
        Math.sin(this.view.pitch),
        -Math.cos(this.view.yaw) * cp,
      );
      grapple.updateTarget(this.body, this.eye, this.look);
      const wantsFire = this.grappleBufferTimer > 0 && this.input.grappleHeld;
      if (wantsFire && this.fsm.state !== MoveState.Vaulting) {
        const point = grapple.fire(this.eye);
        if (point) {
          this.grappleBufferTimer = 0;
          this.events.emit('grappleFire', {
            pointId: point.id,
            distance: this.eye.distanceTo(point.position),
          });
        }
      }
    }
    if (grapple.phase !== 'firing') return;
    const result = grapple.updateHook(dt, this.input.grappleHeld);
    if (result === 'cancelled') {
      this.events.emit('grappleCancel', {});
    } else if (result === 'attached') {
      this.attachGrapple();
    }
  }

  private attachGrapple(): void {
    const point = this.grapple.active;
    if (!point) return;
    if (this.body.isCrouched) this.body.setCrouched(false);
    this.grapple.attach(this.body.center(this.center));
    if (this.fsm.state === MoveState.WallRunning) {
      this.wallRun.leave(this.velocity, 0);
      this.events.emit('wallRunEnd', { reason: 'cancel' });
    }
    this.jumpCutArmed = false;
    this.fsm.transition(MoveState.Grappling);
    this.events.emit('grappleAttach', { pointId: point.id, mode: point.mode });
  }

  private releaseGrapple(reason: GrappleReleaseReason): void {
    const cfg = this.cfg.grapple;
    const v = this.velocity;
    if (reason === 'arrived') {
      // Am Punkt angekommen: Schwung dämpfen und über die Kante heben.
      v.multiplyScalar(cfg.pullArriveKeep);
      v.y = Math.max(v.y, cfg.pullEndUpBoost);
    } else if (reason === 'released' && this.grapple.mode === 'swing' && v.y > -1) {
      v.y += cfg.swingReleaseUpBoost;
    }
    this.grapple.detach();
    this.fsm.transition(this.grounded && v.y <= 0.5 ? MoveState.Grounded : MoveState.Airborne);
    this.events.emit('grappleRelease', { speed: v.length(), reason });
  }

  private startSlide(): void {
    this.body.setCrouched(true);
    const boosted = this.slide.start(this.velocity);
    this.fsm.transition(MoveState.Sliding);
    this.events.emit('slideStart', { speed: this.horizontalSpeed, boosted });
  }

  /**
   * Sprung in der Luft, nach Priorität: Coyote-Sprung (Kante gerade verlassen),
   * später Wall Jump (Gnadenfrist nach dem Wall Run), Wall Jump von einer Wand in Reichweite.
   */
  private tryAirJump(): boolean {
    if (this.coyoteTimer > 0) {
      const kind: JumpKind = this.fsm.previous === MoveState.Sliding ? 'slide' : 'coyote';
      if (this.tryJump(kind)) return true;
    }
    if (this.wallRun.graceTimer > 0) {
      this.wallJump(this.wallRun.graceNormal, this.wallRun.graceWallId, null);
      return true;
    }
    if (
      this.wallRun.findWall(this.body, this.view.yaw, this.cfg.wallJump.reach, this.wallContact) &&
      this.wallContact.elementId !== this.wallRun.lastWallId
    ) {
      this.wallJump(this.wallContact.normal, this.wallContact.elementId, null);
      return true;
    }
    return false;
  }

  private tryJump(kind: JumpKind): boolean {
    // Unter niedriger Decke kann man nicht aufstehen – und damit nicht springen.
    if (this.body.isCrouched && !this.body.setCrouched(false)) return false;
    let height = this.cfg.jump.height;
    if (kind === 'slide') {
      // Slide-Jump: Schwung bleibt erhalten (optional leicht verstärkt).
      height *= this.cfg.slide.jumpHeightMultiplier;
      this.velocity.x *= this.cfg.slide.jumpSpeedMultiplier;
      this.velocity.z *= this.cfg.slide.jumpSpeedMultiplier;
    }
    this.velocity.y = jumpVelocity(this.cfg, height);
    const platform = this.grounded || kind !== 'ground' ? this.ground.surface?.platform : undefined;
    if (platform) {
      const k = this.cfg.jump.platformInherit;
      this.velocity.x += platform.velocity.x * k;
      this.velocity.z += platform.velocity.z * k;
      this.velocity.y += Math.max(0, platform.velocity.y) * k;
    }
    this.consumeJump();
    this.jumpCutArmed = this.input.jumpHeld;
    this.grounded = false;
    this.fsm.transition(MoveState.Airborne);
    this.events.emit('jump', { kind, speed: this.horizontalSpeed });
    return true;
  }

  /**
   * Wall Jump: von der Wand weg, schräg nach oben, mit Schub in Blickrichtung.
   * @param endReason Grund für das Wall-Run-Ende, falls gerade ein Wall Run läuft.
   */
  private wallJump(normal: THREE.Vector3, wallId: number, endReason: 'jump' | null): void {
    computeWallJumpVelocity(this.velocity, normal, this.view.yaw, this.cfg.wallJump, this.velocity);
    this.wallRun.markJumped(wallId);
    this.consumeJump();
    this.jumpCutArmed = false;
    if (endReason) this.events.emit('wallRunEnd', { reason: endReason });
    this.fsm.transition(MoveState.Airborne);
    this.events.emit('jump', { kind: 'wall', speed: this.horizontalSpeed });
    this.events.emit('wallJump', { speed: this.horizontalSpeed });
  }

  private endWallRun(reason: Exclude<WallRunResult, 'continue'>): void {
    const push = reason === 'lost' ? 0 : this.cfg.wallRun.exitPush;
    this.wallRun.leave(this.velocity, push);
    this.fsm.transition(MoveState.Airborne);
    this.events.emit('wallRunEnd', { reason });
  }

  private consumeJump(): void {
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
  }

  private land(impactVelocityY: number): void {
    const impact = Math.max(0, -impactVelocityY);
    this.lastImpactSpeed = impact;
    this.velocity.y = -this.cfg.player.groundStickSpeed;
    this.jumpCutArmed = false;
    if (this.fsm.state === MoveState.WallRunning) {
      this.events.emit('wallRunEnd', { reason: 'land' });
    }
    this.wallRun.resetMemory();
    // Landen mit gehaltener Slide-Taste geht direkt in einen Slide über (Momentum bleibt).
    if (this.input.slideHeld && this.slide.canStart(this.horizontalSpeed)) this.startSlide();
    else this.fsm.transition(MoveState.Grounded);
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
    const onGround = state === MoveState.Grounded || state === MoveState.Sliding;
    this.body.setSnapToGround(onGround);

    const preVelocityY = this.velocity.y;
    this.desired.copy(this.velocity).multiplyScalar(dt).add(this.correction);
    this.body.move(this.desired, this.lastMove);
    clipAgainstContacts(this.velocity, this.lastMove.contacts, this.lastMove.contactCount, {
      walkableNormalY: this.body.walkableNormalY,
      stepHeight: this.cfg.player.stepHeight,
      onGround,
    });
    this.grounded = this.lastMove.grounded && this.velocity.y <= 0.5;

    if ((state === MoveState.Airborne || state === MoveState.WallRunning) && this.grounded) {
      this.land(preVelocityY);
    } else if (onGround && !this.grounded) {
      // Kante verlassen, ohne zu springen → Coyote Time startet.
      this.coyoteTimer = this.cfg.jump.coyoteTime;
      this.fsm.transition(MoveState.Airborne);
    }

    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.fsm.state === MoveState.Grounded) this.advanceStride(this.horizontalSpeed * dt, false);
  }

  private onStateChange(from: MoveState, to: MoveState): void {
    if (from === MoveState.Sliding) this.events.emit('slideEnd', { speed: this.horizontalSpeed });
    this.events.emit('stateChange', { from, to });
  }

  private advanceStride(distance: number, onWall: boolean): void {
    const before = Math.floor(this.stride);
    this.stride += distance / this.cfg.ground.stepLength;
    if (Math.floor(this.stride) !== before) {
      this.events.emit('footstep', { speed: this.horizontalSpeed, onWall });
    }
  }
}
