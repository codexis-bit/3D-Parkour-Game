import { afterEach, describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { MoveState } from '../src/player/MoveState';
import { createSim, FLOOR, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

/** Lässt den Spieler aus geringer Höhe landen und zur Ruhe kommen. */
function settle(s: Sim): void {
  const ticks = s.until(() => s.player.state === MoveState.Grounded, 120);
  expect(ticks).toBeGreaterThanOrEqual(0);
  s.step(5);
}

describe('PlayerController – Grundbewegung', () => {
  it('landet auf dem Boden und steht stabil', async () => {
    sim = await createSim([FLOOR], { pos: [0, 1, 0], yaw: 0 });
    settle(sim);
    const y = sim.player.feet.y;
    sim.step(60);
    expect(sim.player.state).toBe(MoveState.Grounded);
    expect(Math.abs(sim.player.feet.y - y)).toBeLessThan(0.01);
    expect(sim.player.feet.y).toBeGreaterThan(-0.05);
    expect(sim.player.feet.y).toBeLessThan(0.1);
  });

  it('erreicht die Laufgeschwindigkeit und bremst ohne Eingabe wieder ab', async () => {
    sim = await createSim([FLOOR], { pos: [0, 0.2, 0], yaw: 0 });
    settle(sim);
    sim.input.moveY = 1;
    sim.step(30);
    expect(sim.player.horizontalSpeed).toBeCloseTo(MOVEMENT.ground.runSpeed, 1);
    expect(sim.player.velocity.z).toBeLessThan(0);
    sim.input.moveY = 0;
    sim.step(15);
    expect(sim.player.horizontalSpeed).toBeLessThan(0.01);
  });

  it('springt bei gehaltener Taste etwa die konfigurierte Höhe', async () => {
    sim = await createSim([FLOOR], { pos: [0, 0.2, 0], yaw: 0 });
    settle(sim);
    const startY = sim.player.feet.y;
    sim.input.jumpHeld = true;
    sim.input.jumpPressed = true;
    let maxY = startY;
    for (let i = 0; i < 60; i++) {
      sim.step();
      maxY = Math.max(maxY, sim.player.feet.y);
    }
    expect(maxY - startY).toBeGreaterThan(MOVEMENT.jump.height - 0.12);
    expect(maxY - startY).toBeLessThan(MOVEMENT.jump.height + 0.12);
    expect(sim.log.some((e) => e.type === 'jump')).toBe(true);
  });

  it('kurzes Antippen ergibt einen deutlich niedrigeren Sprung (variable Sprunghöhe)', async () => {
    sim = await createSim([FLOOR], { pos: [0, 0.2, 0], yaw: 0 });
    settle(sim);
    const startY = sim.player.feet.y;
    sim.input.jumpHeld = true;
    sim.input.jumpPressed = true;
    sim.step(2);
    sim.input.jumpHeld = false;
    let maxY = startY;
    for (let i = 0; i < 60; i++) {
      sim.step();
      maxY = Math.max(maxY, sim.player.feet.y);
    }
    expect(maxY - startY).toBeLessThan(MOVEMENT.jump.height * 0.5);
    expect(maxY - startY).toBeGreaterThan(0.15);
  });

  it('Coyote Time: Sprung kurz nach dem Verlassen der Kante gelingt noch', async () => {
    // Plattform endet bei z = -5, darunter tiefer Boden.
    sim = await createSim(
      [
        { type: 'platform', pos: [0, -0.5, 0], size: [10, 1, 10] },
        { type: 'platform', pos: [0, -20.5, 0], size: [100, 1, 100] },
      ],
      { pos: [0, 0.2, 0], yaw: 0 },
    );
    settle(sim);
    sim.input.moveY = 1;
    const leftEdge = sim.until(() => sim!.player.state === MoveState.Airborne, 120);
    expect(leftEdge).toBeGreaterThan(0);
    sim.step(3); // 50 ms nach dem Verlassen der Kante
    sim.input.jumpHeld = true;
    sim.input.jumpPressed = true;
    sim.step();
    const jump = sim.log.find((e) => e.type === 'jump');
    expect(jump).toBeDefined();
    expect((jump!.payload as { kind: string }).kind).toBe('coyote');
    expect(sim.player.velocity.y).toBeGreaterThan(5);
  });

  it('Coyote Time läuft ab: zu später Sprung wird ignoriert', async () => {
    sim = await createSim(
      [
        { type: 'platform', pos: [0, -0.5, 0], size: [10, 1, 10] },
        { type: 'platform', pos: [0, -20.5, 0], size: [100, 1, 100] },
      ],
      { pos: [0, 0.2, 0], yaw: 0 },
    );
    settle(sim);
    sim.input.moveY = 1;
    sim.until(() => sim!.player.state === MoveState.Airborne, 120);
    sim.step(12); // 200 ms
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    sim.step();
    expect(sim.log.some((e) => e.type === 'jump')).toBe(false);
    expect(sim.player.velocity.y).toBeLessThan(0);
  });

  it('Jump Buffer: Sprung kurz vor der Landung wird bei Bodenkontakt ausgeführt', async () => {
    sim = await createSim([FLOOR], { pos: [0, 3, 0], yaw: 0 });
    // Fallen lassen, bis der Spieler knapp über dem Boden ist.
    sim.until(() => sim!.player.feet.y < 0.6 && sim!.player.velocity.y < 0, 120);
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    const ticks = sim.until(() => sim!.log.some((e) => e.type === 'jump'), 12);
    expect(ticks).toBeGreaterThanOrEqual(0);
    expect(sim.log.some((e) => e.type === 'land')).toBe(true);
    sim.step(3);
    expect(sim.player.velocity.y).toBeGreaterThan(3);
  });

  it('steigt 0,3-m-Stufen automatisch hinauf', async () => {
    sim = await createSim([FLOOR, { type: 'platform', pos: [0, 0.15, -5], size: [4, 0.3, 4] }], {
      pos: [0, 0.2, 0],
      yaw: 0,
    });
    settle(sim);
    sim.input.moveY = 1;
    sim.step(50);
    expect(sim.player.feet.y).toBeGreaterThan(0.25);
  });

  it('läuft eine 15°-Rampe hinauf', async () => {
    sim = await createSim(
      [FLOOR, { type: 'ramp', from: [0, 0, -2], to: [0, 2.68, -12], width: 4 }],
      { pos: [0, 0.2, 0], yaw: 0 },
    );
    settle(sim);
    sim.input.moveY = 1;
    sim.step(60);
    expect(sim.player.feet.y).toBeGreaterThan(1.5);
    expect(sim.player.state).toBe(MoveState.Grounded);
  });
});
