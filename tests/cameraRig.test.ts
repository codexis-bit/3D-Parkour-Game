import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CameraRig, type CameraSubject } from '../src/player/CameraRig';
import { MoveState } from '../src/player/MoveState';

const EYE = 1.62;

interface FakePlayer {
  horizontalSpeed: number;
  state: MoveState;
  targetEyeHeight: number;
  stride: number;
  previousStride: number;
  input: { moveX: number };
  wallRun: { normal: { x: number; z: number } };
  vault: { progress: number };
}

function createPlayer(patch: Partial<FakePlayer> = {}): FakePlayer & CameraSubject {
  return {
    horizontalSpeed: 0,
    state: MoveState.Grounded,
    targetEyeHeight: EYE,
    stride: 0,
    previousStride: 0,
    input: { moveX: 0 },
    wallRun: { normal: { x: 0, z: 0 } },
    vault: { progress: 0 },
    ...patch,
  };
}

function createRig(): {
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  events: EventBus<GameEvents>;
} {
  const camera = new THREE.PerspectiveCamera();
  const rig = new CameraRig(camera, EYE);
  const events = new EventBus<GameEvents>();
  rig.attach(events);
  return { rig, camera, events };
}

const feet = new THREE.Vector3();

function run(rig: CameraRig, player: CameraSubject, seconds: number, onFrame?: () => void): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    rig.update(dt, feet, player, 1);
    onFrame?.();
  }
}

describe('CameraRig', () => {
  it('neigt sich beim Wall Run von der Wand weg', () => {
    const { rig, camera } = createRig();
    // Blick nach -Z, Wand rechts: Normale zeigt nach links (-X).
    run(
      rig,
      createPlayer({
        state: MoveState.WallRunning,
        horizontalSpeed: 12,
        wallRun: { normal: { x: -1, z: 0 } },
      }),
      0.6,
    );
    // Positive Rollung = Kopf kippt nach links, also weg von der rechten Wand.
    expect(camera.rotation.z).toBeGreaterThan(0.15);
    run(
      rig,
      createPlayer({
        state: MoveState.WallRunning,
        horizontalSpeed: 12,
        wallRun: { normal: { x: 1, z: 0 } },
      }),
      0.8,
    );
    expect(camera.rotation.z).toBeLessThan(-0.15);
  });

  it('erhöht das FOV mit dem Tempo – nur mit aktivem dynamischem FOV', () => {
    const { rig } = createRig();
    const fast = createPlayer({ state: MoveState.Airborne, horizontalSpeed: 30 });
    run(rig, fast, 2);
    expect(rig.fovOffset).toBeGreaterThan(10);
    expect(rig.speedIntensity).toBeGreaterThan(0.8);
    rig.effects = { ...rig.effects, dynamicFov: false };
    run(rig, fast, 2);
    expect(rig.fovOffset).toBeLessThan(0.5);
  });

  it('sackt bei einer harten Landung ab und federt zurück', () => {
    const { rig, camera, events } = createRig();
    const player = createPlayer();
    run(rig, player, 0.5);
    events.emit('land', { impactSpeed: 16, horizontalSpeed: 0, hard: true, roll: false });
    let lowest = Infinity;
    run(rig, player, 0.3, () => (lowest = Math.min(lowest, camera.position.y)));
    expect(lowest).toBeLessThan(EYE - 0.05);
    run(rig, player, 1.5);
    expect(camera.position.y).toBeCloseTo(EYE, 2);
  });

  it('Shake lässt sich abschalten', () => {
    const { rig, camera, events } = createRig();
    rig.effects = { headBob: false, shake: false, dynamicFov: false };
    const player = createPlayer();
    events.emit('death', { reason: 'fall' });
    let maxYaw = 0;
    run(rig, player, 0.3, () => (maxYaw = Math.max(maxYaw, Math.abs(camera.rotation.y))));
    expect(maxYaw).toBe(0);
  });

  it('Head-Bob folgt dem Schrittzähler und ruht im Stand', () => {
    const { rig, camera } = createRig();
    const walking = createPlayer({ horizontalSpeed: 9 });
    let min = Infinity;
    let max = -Infinity;
    run(rig, walking, 1, () => {
      walking.previousStride = walking.stride;
      walking.stride += 1 / 60 / 0.3;
      min = Math.min(min, camera.position.y);
      max = Math.max(max, camera.position.y);
    });
    expect(max - min).toBeGreaterThan(0.03);
    run(rig, createPlayer(), 1.5);
    expect(camera.position.y).toBeCloseTo(EYE, 3);
  });
});
