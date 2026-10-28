import * as THREE from 'three';
import { AudioManager, type AudioFrameState } from '../audio/AudioManager';
import type { Action } from '../config/input';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_ENVIRONMENT } from '../config/render';
import { Environment } from '../level/Environment';
import { Level, type TriggerEvent } from '../level/Level';
import { LEVELS, nextLevel } from '../level/levels';
import { MeshFactory } from '../level/LevelVisuals';
import { MaterialLibrary } from '../level/materials';
import type { LevelData } from '../level/types';
import { AttractCamera } from '../player/AttractCamera';
import { CameraRig } from '../player/CameraRig';
import { MOVE_STATE_LABELS, MoveState } from '../player/MoveState';
import { PlayerController } from '../player/PlayerController';
import { RopeRenderer } from '../player/RopeRenderer';
import { BestTimes } from '../ui/BestTimes';
import { HUD } from '../ui/HUD';
import { Menus } from '../ui/Menus';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { FixedTimestep } from './FixedTimestep';
import { Graphics } from './Graphics';
import { createPlayerInput, Input, type PlayerInput } from './Input';
import { initPhysics } from './Physics';
import { PointerLock } from './PointerLock';
import { RunTimer } from './RunTimer';
import { SettingsStore, type Settings } from './Settings';
import { defaultStore } from './storage';

/** Steuerung für automatisierte Browser-Tests (nur mit `?test` in der URL aktiv). */
export interface TestControls {
  look: (yawDeg: number, pitchDeg?: number) => void;
  state: () => string;
  /** Liefert alle seit dem letzten Aufruf aufgetretenen Events. */
  events: () => string[];
  position: () => [number, number, number];
  /** Setzt den Spieler an eine Position (Fußpunkt). */
  teleport: (x: number, y: number, z: number) => void;
}

/** Spielmodus: Menü (Kamerafahrt im Hintergrund), aktives Spiel, Pause oder Zielbildschirm. */
type Mode = 'menu' | 'playing' | 'paused' | 'finished';

function hasMovementIntent(input: PlayerInput): boolean {
  return (
    input.moveX !== 0 ||
    input.moveY !== 0 ||
    input.jumpPressed ||
    input.slidePressed ||
    input.grapplePressed
  );
}

/**
 * Hauptklasse: verbindet Rendering, Eingabe, Physik-Takt, Level, Spieler, UI und Spielablauf.
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
  private readonly audio: AudioManager;
  private readonly audioFrame: AudioFrameState = {
    playing: false,
    speed: 0,
    verticalSpeed: 0,
    state: MoveState.Grounded,
  };
  private readonly attract = new AttractCamera();
  private readonly timer = new RunTimer();
  private readonly settings: SettingsStore;
  private readonly bestTimes: BestTimes;
  private readonly menus: Menus;
  private readonly hud: HUD;
  private readonly tickInput = createPlayerInput();
  private readonly renderFeet = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly ropeCenter = new THREE.Vector3();
  private readonly triggerEvents: TriggerEvent[] = [];
  private readonly rope = new RopeRenderer();
  private materials: MaterialLibrary;
  private meshFactory: MeshFactory;
  private level: Level | null = null;
  private player: PlayerController | null = null;
  private mode: Mode = 'menu';
  private testMode = false;
  private lastTime = 0;
  private elapsed = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly ui: HTMLElement,
  ) {
    this.graphics = new Graphics(canvas);
    this.environment = new Environment(this.graphics.scene, DEFAULT_ENVIRONMENT);
    this.materials = new MaterialLibrary(this.graphics.anisotropy);
    this.meshFactory = new MeshFactory(this.materials);
    this.graphics.scene.add(this.rope.object);
    this.input = new Input(canvas);
    this.pointerLock = new PointerLock(canvas);
    this.cameraRig = new CameraRig(this.graphics.camera, MOVEMENT.player.eyeHeightStand);
    this.cameraRig.attach(this.events);
    this.audio = new AudioManager(this.events);

    const store = defaultStore();
    this.settings = new SettingsStore(store);
    this.bestTimes = new BestTimes(store);
    this.hud = new HUD(this.ui);
    this.hud.visible = false;
    this.menus = new Menus(this.ui, this.settings, this.bestTimes, {
      play: () => this.play(),
      playLevel: (id) => this.playLevel(id),
      resume: () => this.resume(),
      restart: () => this.restartRun(),
      nextLevel: () => this.playNext(),
      quitToMenu: () => this.showMainMenu(),
    });

    this.settings.subscribe((settings) => this.applySettings(settings));
    this.pointerLock.onChange(this.handlePointerLock);
    this.input.onAction(this.handleAction);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // Audio darf erst nach einer Nutzeraktion starten (Autoplay-Regeln der Browser).
    window.addEventListener('pointerdown', this.unlockAudio, true);
    window.addEventListener('keydown', this.unlockAudio, true);
    this.ui.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.btn')) this.audio.uiClick();
    });
    document.addEventListener('visibilitychange', () => this.audio.setSuspended(document.hidden));
  }

  async init(): Promise<void> {
    await initPhysics();
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Hauptmenü mit Kamerafahrt durch `level` (Standard: aktuelles oder erstes Level). */
  showMainMenu(level?: LevelData): void {
    const data = level ?? this.level?.data ?? LEVELS[0];
    if (!data) return;
    if (this.level?.data.id !== data.id) this.loadLevel(data);
    this.mode = 'menu';
    this.setInputActive(false);
    this.pointerLock.exit();
    this.hud.visible = false;
    this.hud.setHint(null);
    this.rope.hide();
    this.refreshMenuLevels();
    this.menus.show('main', true);
  }

  /** Startet ein Level direkt (z. B. über `?level=…`). */
  playLevel(id: string): void {
    const data =
      LEVELS.find((level) => level.id === id) ??
      (this.level?.data.id === id ? this.level.data : undefined);
    if (data) this.startRun(data);
  }

  /** Lädt ein beliebiges Level (auch Entwickler-Levels) und startet es. */
  playLevelData(data: LevelData): void {
    this.startRun(data);
  }

  /**
   * Nur für automatisierte Browser-Tests (URL-Parameter `?test`): Steuerung ohne Pointer Lock
   * aktivieren und die Blickrichtung direkt setzen.
   */
  enableTestControls(): TestControls {
    this.testMode = true;
    if (this.mode !== 'playing' && this.level) this.startRun(this.level.data);
    this.setInputActive(true);
    const log: string[] = [];
    const emit = this.events.emit.bind(this.events);
    this.events.emit = ((type: keyof GameEvents, payload: GameEvents[keyof GameEvents]) => {
      log.push(`${String(type)} ${JSON.stringify(payload)}`);
      emit(type, payload);
    }) as typeof this.events.emit;
    return {
      look: (yawDeg, pitchDeg = 0) =>
        this.cameraRig.setOrientation((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180),
      state: () => {
        const player = this.player;
        if (!player) return '';
        return `${MOVE_STATE_LABELS[player.state]} · ${player.horizontalSpeed.toFixed(1)} m/s · vy ${player.velocity.y.toFixed(1)}`;
      },
      events: () => log.splice(0, log.length),
      position: () => {
        const p = this.player?.feet;
        return p ? [p.x, p.y, p.z] : [0, 0, 0];
      },
      teleport: (x, y, z) => this.player?.teleport(new THREE.Vector3(x, y, z)),
    };
  }

  // ---------------------------------------------------------------- Spielablauf

  /** „Spielen“: erstes noch nicht geschafftes Level (sonst das erste). */
  private play(): void {
    const next = LEVELS.find((level) => !this.bestTimes.completed(level.id)) ?? LEVELS[0];
    if (next) this.startRun(next);
  }

  private playNext(): void {
    const current = this.level?.data;
    const next = current ? nextLevel(current.id) : undefined;
    if (next) this.startRun(next);
    else this.showMainMenu();
  }

  private startRun(data: LevelData): void {
    if (this.level?.data.id !== data.id) this.loadLevel(data);
    this.resetRun();
    this.mode = 'playing';
    this.menus.close();
    this.hud.visible = true;
    this.requestLock();
  }

  private restartRun(): void {
    const data = this.level?.data;
    if (data) this.startRun(data);
  }

  private resume(): void {
    if (this.mode !== 'paused' && this.mode !== 'playing') return;
    this.mode = 'playing';
    this.menus.close();
    this.requestLock();
  }

  /** Fortschritt, Timer und Spieler auf den Levelstart setzen. */
  private resetRun(): void {
    this.level?.resetProgress();
    this.respawn(false);
    this.timer.arm();
    this.hud.setHint(null);
    this.updateHudMeta();
  }

  /** Zurück zum letzten Checkpoint (bzw. zum Start, wenn noch keiner erreicht wurde). */
  private respawn(announce = true): void {
    const level = this.level;
    const player = this.player;
    if (!level || !player) return;
    const { feet, yaw } = level.respawnPoint;
    player.teleport(feet);
    this.cameraRig.setOrientation(yaw, 0);
    this.cameraRig.snapEyeHeight(player.targetEyeHeight);
    this.fixed.reset();
    this.hud.setCheckpoint(level.checkpointIndex + 1, level.checkpoints.length);
    if (announce) this.events.emit('respawn', { checkpoint: level.checkpointIndex });
  }

  private finish(fraction: number): void {
    const level = this.level;
    if (!level) return;
    const time = this.timer.finish(fraction);
    const result = this.bestTimes.submit(level.data.id, time);
    this.mode = 'finished';
    this.setInputActive(false);
    this.pointerLock.exit();
    this.rope.hide();
    this.hud.setHint(null);
    this.events.emit('finish', { levelId: level.data.id, time, newRecord: result.newRecord });
    this.updateHudMeta();
    this.menus.showFinish({
      level: level.data,
      result,
      hasNext: nextLevel(level.data.id) !== undefined,
    });
  }

  private loadLevel(data: LevelData): void {
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
    const path = [level.spawnFeet, ...level.checkpoints.map((c) => c.respawn)];
    if (level.goal) path.push(level.goal.position);
    this.attract.setPath(path);
    this.respawn(false);
    this.updateHudMeta();
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

  private updateHudMeta(): void {
    const data = this.level?.data;
    if (!data) return;
    this.hud.setLevel(data.name, this.bestTimes.get(data.id), data.parTime ?? null);
    this.hud.setCheckpoint(
      (this.level?.checkpointIndex ?? -1) + 1,
      this.level?.checkpoints.length ?? 0,
    );
  }

  private refreshMenuLevels(): void {
    const next = LEVELS.find((level) => !this.bestTimes.completed(level.id)) ?? null;
    this.menus.setLevels(LEVELS, next);
  }

  // ---------------------------------------------------------------- Eingabe & Pointer Lock

  private setInputActive(active: boolean): void {
    this.input.enabled = active;
    this.input.reset();
  }

  private requestLock(): void {
    if (this.testMode) {
      this.setInputActive(true);
      return;
    }
    if (this.pointerLock.locked) {
      this.setInputActive(true);
      return;
    }
    void this.pointerLock.request().then((locked) => {
      // Ohne Lock (z. B. Browser-Sperrzeit nach Esc) braucht es einen weiteren Klick.
      if (!locked && this.mode === 'playing') this.menus.show('click', true);
    });
  }

  private readonly handlePointerLock = (locked: boolean): void => {
    if (this.testMode) return;
    if (locked) {
      if (this.mode === 'playing' || this.mode === 'paused') {
        this.mode = 'playing';
        this.menus.close();
        this.setInputActive(true);
      }
      return;
    }
    this.setInputActive(false);
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.menus.show('pause', true);
    }
  };

  private readonly handleAction = (action: Action): void => {
    if (
      action === 'restart' &&
      (this.mode === 'playing' || this.mode === 'finished' || this.mode === 'paused')
    ) {
      this.restartRun();
      return;
    }
    if (this.mode !== 'playing' || !this.input.enabled) return;
    if (action === 'respawn') {
      this.respawn();
    } else if (action === 'pause') {
      // Esc gibt der Browser selbst frei; P pausiert über das Freigeben des Pointer Locks.
      if (this.testMode) {
        this.mode = 'paused';
        this.setInputActive(false);
        this.menus.show('pause', true);
      } else {
        this.pointerLock.exit();
      }
    }
  };

  private readonly unlockAudio = (): void => this.audio.unlock();

  /** Schutz vor versehentlichem Schließen (z. B. Strg+W beim Sliden). */
  private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.mode === 'playing' && !this.testMode) event.preventDefault();
  };

  private applySettings(settings: Settings): void {
    this.cameraRig.sensitivity = settings.sensitivity;
    this.cameraRig.invertY = settings.invertY;
    this.cameraRig.effects = {
      headBob: settings.headBob,
      shake: settings.cameraShake,
      dynamicFov: settings.dynamicFov,
    };
    this.graphics.setHorizontalFov(settings.fov);
    this.graphics.setQuality(settings.quality);
    this.environment.setQuality(this.graphics.preset);
    this.audio.setVolume(settings.volume);
  }

  // ---------------------------------------------------------------- Loop

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.elapsed += dt;

    const look = this.input.consumeLook();
    if (this.mode === 'playing' && this.input.enabled) this.cameraRig.applyLook(look.x, look.y);

    const level = this.level;
    const player = this.player;
    if (level && player) {
      let alpha = 1;
      if (this.mode === 'playing' && this.input.enabled) {
        const steps = this.fixed.advance(dt);
        for (let i = 0; i < steps && this.mode === 'playing'; i++)
          this.tick(this.fixed.dt, level, player);
        alpha = this.fixed.alpha;
      } else if (this.mode === 'menu') {
        // Im Menü laufen nur die Plattformen weiter (Kamerafahrt im Hintergrund).
        const steps = this.fixed.advance(dt);
        for (let i = 0; i < steps; i++) {
          level.fixedUpdate(this.fixed.dt);
          level.physics.step();
        }
        alpha = this.fixed.alpha;
      }
      level.frameUpdate(dt, alpha);

      if (this.mode === 'menu') {
        this.attract.update(dt, this.graphics.camera);
        this.graphics.setHorizontalFov(this.settings.current.fov);
        this.environment.update(this.graphics.camera.position, this.graphics.camera);
      } else {
        player.interpolatedFeet(alpha, this.renderFeet);
        this.cameraRig.update(dt, this.renderFeet, player, alpha);
        this.graphics.setHorizontalFov(this.settings.current.fov + this.cameraRig.fovOffset);
        this.environment.update(this.renderFeet, this.graphics.camera);
        this.updateGrappleVisuals(level, player);
        this.updateHud(player);
      }
    }
    this.updateAudio(player);

    this.graphics.render();
    requestAnimationFrame(this.frame);
  };

  private tick(dt: number, level: Level, player: PlayerController): void {
    this.input.sampleTick(this.tickInput);
    if (this.timer.armed && hasMovementIntent(this.tickInput)) {
      this.timer.start();
      this.events.emit('timerStart', { levelId: level.data.id });
    }
    level.fixedUpdate(dt);
    level.physics.step();
    player.fixedUpdate(dt, this.tickInput, this.cameraRig.getView());
    this.timer.tick(dt);
    this.handleTriggers(level, player);
  }

  private handleTriggers(level: Level, player: PlayerController): void {
    level.checkTriggers(
      player.previousFeet,
      player.feet,
      player.body.radius,
      player.body.height,
      this.triggerEvents,
    );
    for (const event of this.triggerEvents) {
      switch (event.type) {
        case 'checkpoint': {
          const total = level.checkpoints.length;
          this.events.emit('checkpoint', { index: event.index, total });
          this.hud.toast(`Checkpoint ${event.index + 1}/${total}`, 'good');
          this.hud.setCheckpoint(event.index + 1, total);
          break;
        }
        case 'hint':
          this.hud.setHint(event.text);
          break;
        case 'goal':
          if (this.timer.running) this.finish(event.fraction);
          return;
        case 'death':
          this.events.emit('death', { reason: event.reason });
          this.hud.flash();
          this.respawn();
          return;
      }
    }
  }

  private updateHud(player: PlayerController): void {
    const state = this.timer.running ? 'running' : this.timer.finished ? 'finished' : 'waiting';
    this.hud.setTimer(this.timer.time, state);
    this.hud.setSpeed(player.horizontalSpeed, this.settings.current.speedUnit);
    this.hud.setSpeedEffect(this.mode === 'playing' ? this.cameraRig.speedIntensity : 0);
  }

  /** Wind-, Slide- und Wall-Run-Schleifen folgen dem Spieler; außerhalb des Spiels verstummen sie. */
  private updateAudio(player: PlayerController | null): void {
    const frame = this.audioFrame;
    frame.playing = this.mode === 'playing' && this.input.enabled && player !== null;
    frame.speed = player?.horizontalSpeed ?? 0;
    frame.verticalSpeed = player?.velocity.y ?? 0;
    frame.state = player?.state ?? MoveState.Grounded;
    this.audio.update(frame);
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
}
