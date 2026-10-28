import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { applySlidePhysics } from '../src/mechanics/Slide';
import { MoveState } from '../src/player/MoveState';
import { createSim, FLOOR, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

/** Spieler landen lassen und mit voller Geschwindigkeit nach -Z laufen. */
async function runningSim(elements = [FLOOR]): Promise<Sim> {
  const s = await createSim(elements, { pos: [0, 0.2, 0], yaw: 0 });
  s.until(() => s.player.state === MoveState.Grounded, 120);
  s.input.moveY = 1;
  s.step(20);
  return s;
}

function pressSlide(s: Sim): void {
  s.input.slideHeld = true;
  s.input.slidePressed = true;
}

describe('Slide', () => {
  it('startet aus dem Sprint mit Boost und niedriger Kollisionsbox', async () => {
    sim = await runningSim();
    expect(sim.player.horizontalSpeed).toBeCloseTo(MOVEMENT.ground.runSpeed, 1);
    pressSlide(sim);
    sim.step();
    expect(sim.player.state).toBe(MoveState.Sliding);
    expect(sim.player.body.isCrouched).toBe(true);
    expect(sim.player.horizontalSpeed).toBeGreaterThan(MOVEMENT.ground.runSpeed + 2.5);
    expect(sim.log.find((e) => e.type === 'slideStart')?.payload).toMatchObject({ boosted: true });
  });

  it('langsam gedrückt bedeutet Ducken statt Slide', async () => {
    sim = await createSim([FLOOR], { pos: [0, 0.2, 0], yaw: 0 });
    sim.until(() => sim!.player.state === MoveState.Grounded, 120);
    sim.input.moveY = 0.3;
    sim.step(30);
    pressSlide(sim);
    sim.step(30);
    expect(sim.player.state).toBe(MoveState.Grounded);
    expect(sim.player.body.isCrouched).toBe(true);
    expect(sim.player.horizontalSpeed).toBeLessThanOrEqual(MOVEMENT.ground.crouchSpeed + 0.01);
  });

  it('bremst auf ebenem Boden ab und endet unter dem Mindesttempo', async () => {
    sim = await runningSim();
    pressSlide(sim);
    sim.step();
    expect(sim.player.state).toBe(MoveState.Sliding);
    const ticks = sim.until(() => sim!.player.state !== MoveState.Sliding, 600);
    const seconds = (ticks + 1) / 60;
    // (12,5 - 3) m/s bei 4 m/s² Reibung ≈ 2,4 s
    expect(seconds).toBeGreaterThan(1.8);
    expect(seconds).toBeLessThan(3);
    expect(sim.player.state).toBe(MoveState.Grounded);
    expect(sim.player.body.isCrouched).toBe(true); // Taste noch gehalten → geduckt
  });

  it('wird bergab schneller', async () => {
    // 20°-Gefälle in Laufrichtung (-Z): 30 m lang, 10,9 m Höhenunterschied
    sim = await createSim(
      [
        { type: 'platform', pos: [0, 10.42, 4], size: [6, 1, 8] },
        { type: 'ramp', from: [0, 10.92, 0], to: [0, 0, -30], width: 6, thickness: 1 },
        { type: 'platform', pos: [0, -0.5, -60], size: [20, 1, 60] },
      ],
      { pos: [0, 11.2, 4], yaw: 0 },
    );
    sim.until(() => sim!.player.state === MoveState.Grounded, 120);
    sim.input.moveY = 1;
    sim.step(25);
    pressSlide(sim);
    sim.step(30);
    const early = sim.player.horizontalSpeed;
    sim.step(40);
    expect(sim.player.state).toBe(MoveState.Sliding);
    expect(sim.player.horizontalSpeed).toBeGreaterThan(early + 3);
  });

  it('Slide-Jump behält den Schwung', async () => {
    sim = await runningSim();
    pressSlide(sim);
    sim.step(10);
    const before = sim.player.horizontalSpeed;
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    sim.step();
    expect(sim.player.state).toBe(MoveState.Airborne);
    expect(sim.player.body.isCrouched).toBe(false);
    expect(sim.player.horizontalSpeed).toBeGreaterThanOrEqual(before);
    const jump = sim.log.find((e) => e.type === 'jump');
    expect((jump?.payload as { kind: string }).kind).toBe('slide');
  });

  it('passt unter einen 1,2 m hohen Tunnel und bleibt darin geduckt', async () => {
    sim = await runningSim([
      FLOOR,
      { type: 'slideTunnel', pos: [0, 0, -16], length: 8, width: 3, clearance: 1.2 },
    ]);
    pressSlide(sim);
    // In den Tunnel hinein sliden, dann die Taste loslassen.
    sim.until(() => sim!.player.feet.z < -14, 120);
    sim.input.slideHeld = false;
    sim.step(10);
    expect(sim.player.feet.z).toBeLessThan(-14);
    expect(sim.player.body.isCrouched).toBe(true);
    // Weiterlaufen bis hinter den Tunnel: dort wird automatisch aufgestanden.
    sim.until(() => sim!.player.feet.z < -21.5, 240);
    sim.step(5);
    expect(sim.player.feet.z).toBeLessThan(-21);
    expect(sim.player.body.isCrouched).toBe(false);
  });

  it('stehend kommt man nicht in den Tunnel', async () => {
    sim = await runningSim([
      FLOOR,
      { type: 'slideTunnel', pos: [0, 0, -16], length: 8, width: 3, clearance: 1.2 },
    ]);
    sim.step(120);
    expect(sim.player.feet.z).toBeGreaterThan(-12.5);
  });

  it('Boost hat einen Cooldown gegen Slide-Spam', async () => {
    sim = await runningSim();
    pressSlide(sim);
    sim.step(20);
    sim.input.slideHeld = false;
    sim.step(5);
    expect(sim.player.state).toBe(MoveState.Grounded);
    pressSlide(sim);
    sim.step();
    const slideStarts = sim.log.filter((e) => e.type === 'slideStart');
    expect(slideStarts).toHaveLength(2);
    expect(slideStarts[1]!.payload).toMatchObject({ boosted: false });
  });
});

describe('applySlidePhysics', () => {
  const cfg = MOVEMENT.slide;

  it('Reibung bremst gleichmäßig', () => {
    const v = new THREE.Vector3(0, 0, -10);
    applySlidePhysics(v, new THREE.Vector3(0, 1, 0), new THREE.Vector3(), cfg, 26, 0.5);
    expect(v.length()).toBeCloseTo(10 - cfg.friction * 0.5);
  });

  it('Lenken dreht die Richtung nur begrenzt', () => {
    const v = new THREE.Vector3(0, 0, -10);
    applySlidePhysics(v, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), cfg, 26, 1 / 60);
    const angle = Math.atan2(v.x, -v.z);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThanOrEqual(cfg.steerRate / 60 + 1e-9);
  });

  it('Rückwärts-Eingabe dreht den Slide nicht um', () => {
    const v = new THREE.Vector3(0, 0, -10);
    applySlidePhysics(v, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), cfg, 26, 1 / 60);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeLessThan(0);
  });
});
