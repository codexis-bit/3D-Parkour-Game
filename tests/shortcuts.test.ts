import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { challengeLevel } from '../src/level/levels/challenge';
import { MoveState } from '../src/player/MoveState';
import { createLevelSim, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

const grounded = (s: Sim) =>
  s.player.state === MoveState.Grounded || s.player.state === MoveState.Sliding;

function lookAt(s: Sim, x: number, y: number, z: number): void {
  const eye = s.player.eyePosition(new THREE.Vector3());
  s.view.yaw = Math.atan2(-(x - eye.x), -(z - eye.z));
  s.view.pitch = Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z));
}

async function startAt(x: number, y: number, z: number): Promise<Sim> {
  const s = await createLevelSim(challengeLevel);
  s.player.teleport(new THREE.Vector3(x, y + 0.05, z));
  s.until(() => s.player.state === MoveState.Grounded, 60);
  return s;
}

describe('Abgrund – Abkürzungen', () => {
  it('A: Zugpunkt ist vom Start aus nicht, vom ersten Pfeiler aus erreichbar', async () => {
    sim = await startAt(0, 20, -5);
    lookAt(sim, 0, 24.5, -36);
    sim.step();
    expect(sim.player.grapple.target).toBeNull();

    sim.player.teleport(new THREE.Vector3(1, 20.05, -11.5));
    sim.until(() => grounded(sim!), 60);
    lookAt(sim, 0, 24.5, -36);
    sim.input.grapplePressed = true;
    sim.input.grappleHeld = true;
    const landed = sim.until(() => sim!.player.feet.z < -38 && grounded(sim!), 300);
    expect(landed).toBeGreaterThan(0);
    expect(sim.player.feet.y).toBeGreaterThan(20.5);
    expect(sim.triggers.some((t) => t.event.type === 'death')).toBe(false);
  });

  it('B: Sprungpad → Balken → Wall Run trägt an Plattformen und Laser vorbei', async () => {
    sim = await startAt(-9, 21, -92.5);
    const s = sim;
    s.view.yaw = 0;
    s.input.moveY = 1;
    const onBeam = s.until(() => s.player.feet.y > 25.5 && grounded(s), 240);
    expect(onBeam).toBeGreaterThan(0);
    s.until(() => s.player.feet.z < -111.2, 120);
    s.input.jumpPressed = true;
    s.input.jumpHeld = true;
    s.input.moveX = -0.6;
    const running = s.until(() => s.player.state === MoveState.WallRunning, 60);
    expect(running).toBeGreaterThanOrEqual(0);
    s.input.moveX = 0;
    const landed = s.until(() => grounded(s) && s.player.feet.y < 21.5, 240);
    expect(landed).toBeGreaterThan(0);
    expect(s.triggers.some((t) => t.event.type === 'death')).toBe(false);
    expect(s.player.feet.z).toBeLessThan(-129);
  });
});
