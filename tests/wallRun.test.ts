import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import type { LevelElement } from '../src/level/types';
import { computeWallJumpVelocity } from '../src/mechanics/WallJump';
import { MoveState } from '../src/player/MoveState';
import { createSim, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

/** Startplattform (z ∈ [-10, 10]), tiefe Grube, rechts eine 40 m lange Wall-Run-Wand. */
const RIGHT_WALL_COURSE: LevelElement[] = [
  { type: 'platform', pos: [0, -0.5, 0], size: [10, 1, 20] },
  { type: 'platform', pos: [0, -40.5, -40], size: [60, 1, 120] },
  { type: 'wallrun', pos: [2, 2, -30], size: [0.5, 12, 40] },
];

/** Bis zur Kante laufen, abspringen und leicht zur rechten Wand lenken. */
async function jumpToRightWall(): Promise<Sim> {
  const s = await createSim(RIGHT_WALL_COURSE, { pos: [1, 0.2, 5], yaw: 0 });
  s.until(() => s.player.state === MoveState.Grounded, 120);
  s.input.moveY = 1;
  s.until(() => s.player.feet.z < -9, 240);
  s.input.jumpPressed = true;
  s.input.jumpHeld = true;
  s.input.moveX = 0.4;
  s.step();
  return s;
}

describe('Wall Run', () => {
  it('startet seitlich an einer markierten Wand und hält den Spieler', async () => {
    sim = await jumpToRightWall();
    const ticks = sim.until(() => sim!.player.state === MoveState.WallRunning, 40);
    expect(ticks).toBeGreaterThanOrEqual(0);
    expect(sim.log.some((e) => e.type === 'wallRunStart')).toBe(true);

    const startY = sim.player.feet.y;
    const runTicks = sim.until(() => sim!.player.state !== MoveState.WallRunning, 200);
    const seconds = runTicks / 60;
    expect(seconds).toBeGreaterThan(MOVEMENT.wallRun.duration - 0.1);
    expect(seconds).toBeLessThanOrEqual(MOVEMENT.wallRun.duration + 0.05);
    // Freier Fall wären ~29 m – an der Wand verliert man nur wenig Höhe.
    expect(sim.player.feet.y - startY).toBeGreaterThan(-2.5);
    const end = sim.log.find((e) => e.type === 'wallRunEnd');
    expect(end?.payload).toMatchObject({ reason: 'timeout' });
  });

  it('läuft nicht zweimal hintereinander an derselben Wand', async () => {
    sim = await jumpToRightWall();
    sim.until(() => sim!.player.state === MoveState.WallRunning, 40);
    sim.until(() => sim!.player.state !== MoveState.WallRunning, 200);
    sim.input.moveX = 1; // weiter gegen die Wand drücken
    sim.step(40);
    const starts = sim.log.filter((e) => e.type === 'wallRunStart');
    expect(starts).toHaveLength(1);
    expect(sim.player.state).toBe(MoveState.Airborne);
  });

  it('Wall Jump stößt von der Wand ab und schräg nach oben', async () => {
    sim = await jumpToRightWall();
    sim.until(() => sim!.player.state === MoveState.WallRunning, 40);
    sim.step(15);
    sim.input.jumpPressed = true;
    sim.step();
    expect(sim.player.state).toBe(MoveState.Airborne);
    expect(sim.player.velocity.x).toBeLessThan(-3); // weg von der Wand bei x = +1,75
    expect(sim.player.velocity.y).toBeGreaterThan(MOVEMENT.wallJump.upSpeed - 1);
    expect(sim.player.velocity.z).toBeLessThan(-5); // Schwung nach vorn bleibt
    expect(sim.log.some((e) => e.type === 'wallJump')).toBe(true);
  });

  it('erlaubt Wall-Jump-Ketten zwischen zwei gegenüberliegenden Wänden', async () => {
    sim = await createSim(
      [
        { type: 'platform', pos: [0, -0.5, 0], size: [10, 1, 20] },
        { type: 'platform', pos: [0, -40.5, -60], size: [60, 1, 160] },
        { type: 'wallrun', pos: [2.2, 2, -50], size: [0.5, 14, 80] },
        { type: 'wallrun', pos: [-2.2, 2, -50], size: [0.5, 14, 80] },
      ],
      { pos: [0.8, 0.2, 5], yaw: 0 },
    );
    const s = sim;
    s.until(() => s.player.state === MoveState.Grounded, 120);
    s.input.moveY = 1;
    s.until(() => s.player.feet.z < -9, 240);
    s.input.jumpPressed = true;
    s.input.jumpHeld = true;
    s.input.moveX = 0.5;

    let lowestY = Infinity;
    for (let i = 0; i < 360; i++) {
      s.step();
      lowestY = Math.min(lowestY, s.player.feet.y);
      if (s.player.state === MoveState.WallRunning) {
        // Zur jeweils anderen Wand lenken, nach kurzer Zeit abspringen.
        s.input.moveX = s.player.wallRun.normal.x > 0 ? 0.6 : -0.6;
        if (s.player.timeInState > 0.25) s.input.jumpPressed = true;
      }
      if (s.log.filter((e) => e.type === 'wallRunStart').length >= 5) break;
    }
    const runs = s.log.filter((e) => e.type === 'wallRunStart').length;
    const jumps = s.log.filter((e) => e.type === 'wallJump').length;
    expect(runs).toBeGreaterThanOrEqual(4);
    expect(jumps).toBeGreaterThanOrEqual(3);
    expect(lowestY).toBeGreaterThan(-4);
    expect(s.player.feet.z).toBeLessThan(-30);
  });
});

describe('computeWallJumpVelocity', () => {
  const cfg = MOVEMENT.wallJump;

  it('stößt entlang der Normalen ab und behält Tempo entlang der Wand', () => {
    const out = computeWallJumpVelocity(
      new THREE.Vector3(0, 0, -11),
      new THREE.Vector3(-1, 0, 0),
      0,
      cfg,
      new THREE.Vector3(),
    );
    expect(out.x).toBeLessThan(0);
    expect(out.z).toBeLessThan(-8);
    expect(out.y).toBe(cfg.upSpeed);
  });

  it('Blick in die Wand drückt den Spieler nicht in die Wand', () => {
    // Wand rechts (Normale -X), Blick nach rechts (+X, yaw = -90°)
    const out = computeWallJumpVelocity(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      -Math.PI / 2,
      cfg,
      new THREE.Vector3(),
    );
    expect(out.x).toBeCloseTo(-cfg.outSpeed);
  });

  it('deckelt den Tempogewinn', () => {
    const before = new THREE.Vector3(0, 0, -12);
    const out = computeWallJumpVelocity(
      before,
      new THREE.Vector3(-1, 0, 0),
      0,
      cfg,
      new THREE.Vector3(),
    );
    expect(Math.hypot(out.x, out.z)).toBeLessThanOrEqual(12 + cfg.maxSpeedGain + 1e-6);
  });
});
