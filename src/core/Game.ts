import * as THREE from 'three';
import { GAME } from '../config/game';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_ENVIRONMENT } from '../config/render';
import { Environment } from '../level/Environment';
import { Level } from '../level/Level';
import { buildStaticMeshes } from '../level/LevelVisuals';
import { MaterialLibrary } from '../level/materials';
import type { LevelData } from '../level/types';
import { CameraRig } from '../player/CameraRig';
import { MOVE_STATE_LABELS } from '../player/MoveState';
import { PlayerController } from '../player/PlayerController';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { FixedTimestep } from './FixedTimestep';
import { Graphics } from './Graphics';
import { createPlayerInput, Input } from './Input';
import { initPhysics } from './Physics';
import { PointerLock } from './PointerLock';

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
  private materials: MaterialLibrary;
  private level: Level | null = null;
  private player: PlayerController | null = null;
  private lastTime = 0;
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
    this.input = new Input(canvas);
    this.pointerLock = new PointerLock(canvas);
    this.cameraRig = new CameraRig(this.graphics.camera, MOVEMENT.player.eyeHeightStand);

    this.overlay = document.createElement('div');
    this.overlay.className = 'click-to-play';
    this.overlay.innerHTML = `<div><h1>${GAME.name}</h1><p>Klicken zum Spielen</p>
      <p class="hint">WASD bewegen · Maus umsehen · Leertaste springen · R zurücksetzen</p></div>`;
    this.overlay.addEventListener('click', () => void this.pointerLock.request());
    this.devHud = document.createElement('div');
    this.devHud.className = 'dev-hud';
    this.ui.append(this.overlay, this.devHud);

    this.pointerLock.onChange((locked) => {
      this.input.enabled = locked;
      this.input.reset();
      this.overlay.hidden = locked;
    });
    this.input.onAction((action) => {
      if (action === 'respawn' && this.input.enabled) this.respawn();
    });
  }

  async init(): Promise<void> {
    await initPhysics();
  }

  loadLevel(data: LevelData): void {
    this.unloadLevel();
    this.materials = new MaterialLibrary(this.graphics.anisotropy);
    const level = new Level(data, MOVEMENT.physicsHz, {
      scene: this.graphics.scene,
      materials: this.materials,
      buildMeshes: buildStaticMeshes,
    });
    this.level = level;
    this.environment.apply(level.environment);
    this.player = new PlayerController(level.physics, this.events, MOVEMENT, level.spawnFeet);
    this.respawn();
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /**
   * Nur für automatisierte Browser-Tests (URL-Parameter `?test`): Steuerung ohne Pointer Lock
   * aktivieren und die Blickrichtung direkt setzen.
   */
  enableTestControls(): { look: (yawDeg: number, pitchDeg?: number) => void; state: () => string } {
    this.input.enabled = true;
    this.overlay.hidden = true;
    return {
      look: (yawDeg, pitchDeg = 0) =>
        this.cameraRig.setOrientation((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180),
      state: () => this.devHud.textContent ?? '',
    };
  }

  private respawn(): void {
    if (!this.level || !this.player) return;
    this.player.teleport(this.level.spawnFeet);
    this.cameraRig.setOrientation(this.level.spawnYaw, 0);
    this.cameraRig.snapEyeHeight(this.player.targetEyeHeight);
    this.fixed.reset();
  }

  private unloadLevel(): void {
    this.player?.dispose();
    this.player = null;
    this.level?.dispose();
    this.level = null;
    this.materials.dispose();
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

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
    if (player.feet.y < level.data.killY) this.respawn();
  }

  private updateDevHud(player: PlayerController): void {
    const v = player.velocity;
    this.devHud.textContent = `${MOVE_STATE_LABELS[player.state]} · ${player.horizontalSpeed.toFixed(
      1,
    )} m/s · vy ${v.y.toFixed(1)}`;
  }
}
