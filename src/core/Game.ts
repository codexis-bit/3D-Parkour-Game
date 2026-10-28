import * as THREE from 'three';
import { GAME } from '../config/game';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_ENVIRONMENT } from '../config/render';
import { Environment } from '../level/Environment';
import { Level, type TriggerEvent } from '../level/Level';
import { MeshFactory } from '../level/LevelVisuals';
import { MaterialLibrary } from '../level/materials';
import type { LevelData } from '../level/types';
import { CameraRig } from '../player/CameraRig';
import { MOVE_STATE_LABELS } from '../player/MoveState';
import { PlayerController } from '../player/PlayerController';
import { RopeRenderer } from '../player/RopeRenderer';
import { HUD } from '../ui/HUD';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { FixedTimestep } from './FixedTimestep';
import { Graphics } from './Graphics';
import { createPlayerInput, Input } from './Input';
import { initPhysics } from './Physics';
import { PointerLock } from './PointerLock';

/** Steuerung für automatisierte Browser-Tests (nur mit `?test` in der URL aktiv). */
export interface TestControls {
  look: (yawDeg: number, pitchDeg?: number) => void;
  state: () => string;
  /** Liefert alle seit dem letzten Aufruf aufgetretenen Events. */
  events: () => string[];
  position: () => [number, number, number];
}

/**
 * Hauptklasse: verbindet Rendering, Eingabe, Physik-Takt, Level und Spieler.
 *
 * Game-Loop: Pro Frame wird die Mausbewegung sofort auf die Kamera angewendet (kein Input-Lag),
 * die Physik läuft in festen 60-Hz-Schritten, gerendert wird mit Interpolation zwischen den Schritten.
 */
export class Game {
  readonly events = new EventBus<GameEvents>();
  private readonly graphics: Graphics;
  private readonly environment: Environment;
  private readonly input: Input;
  private readonly pointerLock: PointerLock;
  private readonly fixed = new FixedTimestep(MOVEMENT.physicsHz);
  private readonly cameraRig: CameraRig;
  private readonly tickInput = createPlayerInput();
  private readonly renderFeet = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly ropeCenter = new THREE.Vector3();
  private readonly triggerEvents: TriggerEvent[] = [];
  private readonly rope = new RopeRenderer();
  private readonly hud: HUD;
  private materials: MaterialLibrary;
  private meshFactory: MeshFactory;
  private level: Level | null = null;
  private player: PlayerController | null = null;
  private lastTime = 0;
  private elapsed = 0;
  private readonly overlay: HTMLDivElement;
  private readonly devHud: HTMLDivElement;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly ui: HTMLElement,
  ) {
    this.graphics = new Graphics(canvas);
    this.graphics.setQuality('high');
    this.graphics.setHorizontalFov(95);
    this.environment = new Environment(this.graphics.scene, DEFAULT_ENVIRONMENT);
    this.environment.setQuality(this.graphics.preset);
    this.materials = new MaterialLibrary(this.graphics.anisotropy);
    this.meshFactory = new MeshFactory(this.materials);
    this.graphics.scene.add(this.rope.object);
    this.input = new Input(canvas);
    this.pointerLock = new PointerLock(canvas);
    this.cameraRig = new CameraRig(this.graphics.camera, MOVEMENT.player.eyeHeightStand);

    this.overlay = document.createElement('div');
    this.overlay.className = 'click-to-play';
    this.overlay.innerHTML = `<div><h1>${GAME.name}</h1><p>Klicken zum Spielen</p>
      <p class="hint">WASD bewegen · Maus umsehen · Leertaste springen · Shift/Strg sliden ·
      Rechtsklick/E Grappling Hook · R Checkpoint · T Neustart</p></div>`;
    this.overlay.addEventListener('click', () => void this.pointerLock.request());
    this.devHud = document.createElement('div');
    this.devHud.className = 'dev-hud';
    this.hud = new HUD(this.ui);
    this.ui.append(this.overlay, this.devHud);

    this.pointerLock.onChange((locked) => {
      this.input.enabled = locked;
      this.input.reset();
      this.overlay.hidden = locked;
    });
    this.input.onAction((action) => {
      if (!this.input.enabled) return;
      if (action === 'respawn') this.respawn();
      else if (action === 'restart') this.restart();
    });
  }

  async init(): Promise<void> {
    await initPhysics();
  }

  loadLevel(data: LevelData): void {
    this.unloadLevel();
    this.materials = new MaterialLibrary(this.graphics.anisotropy);
    this.meshFactory = new MeshFactory(this.materials);
    const level = new Level(data, MOVEMENT.physicsHz, {
      scene: this.graphics.scene,
      factory: this.meshFactory,
    });
    this.level = level;
    this.environment.apply(level.environment);
    this.player = new PlayerController(level.physics, this.events, MOVEMENT, level.spawnFeet);
    this.player.setGrapplePoints(level.grapplePoints);
    this.restart();
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /**
   * Nur für automatisierte Browser-Tests (URL-Parameter `?test`): Steuerung ohne Pointer Lock
   * aktivieren und die Blickrichtung direkt setzen.
   */
  enableTestControls(): TestControls {
    this.input.enabled = true;
    this.overlay.hidden = true;
    const log: string[] = [];
    const emit = this.events.emit.bind(this.events);
    this.events.emit = ((type: keyof GameEvents, payload: GameEvents[keyof GameEvents]) => {
      log.push(`${String(type)} ${JSON.stringify(payload)}`);
      emit(type, payload);
    }) as typeof this.events.emit;
    return {
      look: (yawDeg, pitchDeg = 0) =>
        this.cameraRig.setOrientation((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180),
      state: () => this.devHud.textContent ?? '',
      events: () => log.splice(0, log.length),
      position: () => {
        const p = this.player?.feet;
        return p ? [p.x, p.y, p.z] : [0, 0, 0];
      },
    };
  }

  /** Zurück zum letzten Checkpoint (bzw. zum Start, wenn noch keiner erreicht wurde). */
  private respawn(): void {
    const level = this.level;
    const player = this.player;
    if (!level || !player) return;
    const { feet, yaw } = level.respawnPoint;
    player.teleport(feet);
    this.cameraRig.setOrientation(yaw, 0);
    this.cameraRig.snapEyeHeight(player.targetEyeHeight);
    this.fixed.reset();
    this.events.emit('respawn', { checkpoint: level.checkpointIndex });
  }

  /** Sofort-Neustart des Levels: Fortschritt zurücksetzen und zum Start. */
  private restart(): void {
    this.level?.resetProgress();
    this.respawn();
  }

  private unloadLevel(): void {
    this.player?.dispose();
    this.player = null;
    this.level?.dispose();
    this.level = null;
    this.meshFactory.dispose();
    this.materials.dispose();
    this.rope.hide();
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.elapsed += dt;

    const look = this.input.consumeLook();
    if (this.input.enabled) this.cameraRig.applyLook(look.x, look.y);

    const level = this.level;
    const player = this.player;
    if (level && player) {
      const steps = this.input.enabled ? this.fixed.advance(dt) : 0;
      for (let i = 0; i < steps; i++) this.tick(this.fixed.dt, level, player);
      const alpha = this.input.enabled ? this.fixed.alpha : 1;
      level.frameUpdate(dt, alpha);
      player.interpolatedFeet(alpha, this.renderFeet);
      this.cameraRig.update(dt, this.renderFeet, player);
      this.environment.update(this.renderFeet, this.graphics.camera);
      this.updateGrappleVisuals(level, player);
      this.updateDevHud(player);
    }

    this.graphics.render();
    requestAnimationFrame(this.frame);
  };

  private tick(dt: number, level: Level, player: PlayerController): void {
    this.input.sampleTick(this.tickInput);
    level.fixedUpdate(dt);
    level.physics.step();
    player.fixedUpdate(dt, this.tickInput, this.cameraRig.getView());
    this.handleTriggers(level, player);
  }

  private handleTriggers(level: Level, player: PlayerController): void {
    level.checkTriggers(player.feet, player.body.radius, player.body.height, this.triggerEvents);
    for (const event of this.triggerEvents) {
      if (event.type === 'checkpoint') {
        const total = level.checkpoints.length;
        this.events.emit('checkpoint', { index: event.index, total });
        this.hud.toast(`Checkpoint ${event.index + 1}/${total}`, 'good');
      } else {
        this.events.emit('death', { reason: event.reason });
        this.hud.flash();
        this.respawn();
        return;
      }
    }
  }

  /** Seil, Hervorhebung des Ziels und HUD-Indikator. */
  private updateGrappleVisuals(level: Level, player: PlayerController): void {
    const grapple = player.grapple;
    const camera = this.graphics.camera;
    level.setGrappleHighlight(grapple.phase === 'idle' ? (grapple.target?.id ?? null) : null);
    this.hud.updateGrapple(
      {
        target: grapple.phase === 'idle' ? (grapple.target?.position ?? null) : null,
        mode: grapple.target?.mode ?? null,
        attached: grapple.phase !== 'idle',
        cooling: grapple.cooldown > 0,
      },
      camera,
    );
    const active = grapple.active;
    if (!active || grapple.phase === 'idle') {
      this.rope.hide();
      return;
    }
    // „Hand“: rechts unten vor der Kamera.
    camera.updateMatrixWorld();
    this.hand.set(0.3, -0.34, -0.9).applyMatrix4(camera.matrixWorld);
    let slack = 0;
    if (grapple.phase === 'attached' && active.mode === 'swing') {
      const distance = player.body.center(this.ropeCenter).distanceTo(active.position);
      slack = Math.max(0, grapple.ropeLength - distance) * 0.35;
    }
    this.rope.update(this.hand, active.position, grapple.hookProgress, slack, this.elapsed);
  }

  private updateDevHud(player: PlayerController): void {
    const v = player.velocity;
    this.devHud.textContent = `${MOVE_STATE_LABELS[player.state]} · ${player.horizontalSpeed.toFixed(
      1,
    )} m/s · vy ${v.y.toFixed(1)}`;
  }
}
