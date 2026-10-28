import { afterEach, describe, expect, it } from 'vitest';
import type { LevelElement } from '../src/level/types';
import { MoveState } from '../src/player/MoveState';
import { createSim, FLOOR, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

/** Block der Höhe `h` mit Vorderkante bei z = -6 (4 m tief). */
function block(h: number): LevelElement {
  return { type: 'platform', pos: [0, h / 2, -8], size: [6, h, 4] };
}

async function runTowards(elements: LevelElement[]): Promise<Sim> {
  const s = await createSim(elements, { pos: [0, 0.2, 0], yaw: 0 });
  s.until(() => s.player.state === MoveState.Grounded, 120);
  s.input.moveY = 1;
  return s;
}

describe('Vault / Mantle', () => {
  it('zieht sich an einer 1,2 m hohen Kante aus dem Lauf hoch', async () => {
    sim = await runTowards([FLOOR, block(1.2)]);
    const ticks = sim.until(() => sim!.player.state === MoveState.Vaulting, 120);
    expect(ticks).toBeGreaterThan(0);
    sim.until(() => sim!.player.state !== MoveState.Vaulting, 60);
    sim.step(5);
    expect(sim.player.state).toBe(MoveState.Grounded);
    expect(sim.player.feet.y).toBeGreaterThan(1.15);
    expect(sim.player.horizontalSpeed).toBeGreaterThan(4);
    expect(sim.log.find((e) => e.type === 'vault')?.payload).toMatchObject({});
  });

  it('erreicht mit Sprung eine 2,4 m hohe Kante', async () => {
    sim = await runTowards([FLOOR, block(2.4)]);
    sim.until(() => sim!.player.feet.z < -4.2, 120);
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    const ticks = sim.until(() => sim!.player.state === MoveState.Vaulting, 60);
    expect(ticks).toBeGreaterThanOrEqual(0);
    sim.until(() => sim!.player.state !== MoveState.Vaulting, 60);
    sim.step(5);
    expect(sim.player.feet.y).toBeGreaterThan(2.35);
  });

  it('hohe Wände (3,5 m) lassen sich nicht erklimmen', async () => {
    sim = await runTowards([FLOOR, block(3.5)]);
    sim.until(() => sim!.player.feet.z < -4.2, 120);
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    sim.step(90);
    expect(sim.log.some((e) => e.type === 'vault')).toBe(false);
    expect(sim.player.feet.y).toBeLessThan(0.2);
  });

  it('ohne Vorwärts-Eingabe wird nicht hochgezogen', async () => {
    sim = await runTowards([FLOOR, block(1.2)]);
    sim.until(() => sim!.player.feet.z < -4.5, 120);
    sim.input.moveY = 0;
    sim.step(40);
    expect(sim.log.some((e) => e.type === 'vault')).toBe(false);
  });

  it('endet geduckt, wenn über der Kante nur wenig Platz ist', async () => {
    sim = await runTowards([
      FLOOR,
      block(1.2),
      // Decke 1,25 m über der Kante (Unterkante bei 2,45 m), bündig mit der Vorderkante.
      { type: 'platform', pos: [0, 3.2, -8], size: [6, 1.5, 4] },
    ]);
    const ticks = sim.until(() => sim!.player.state === MoveState.Vaulting, 120);
    expect(ticks).toBeGreaterThan(0);
    sim.until(() => sim!.player.state !== MoveState.Vaulting, 60);
    expect(sim.player.body.isCrouched).toBe(true);
    expect(sim.player.feet.y).toBeGreaterThan(1.15);
  });
});

describe('Landung', () => {
  it('meldet harte Landungen und Abrollen aus großer Höhe', async () => {
    sim = await createSim([FLOOR], { pos: [0, 4, 0], yaw: 0 });
    sim.until(() => sim!.player.state === MoveState.Grounded, 240);
    const soft = sim.log.find((e) => e.type === 'land')?.payload as {
      hard: boolean;
      roll: boolean;
    };
    expect(soft).toMatchObject({ hard: true, roll: false });

    sim.player.teleport(sim.player.feet.clone().setY(14));
    sim.until(() => sim!.player.state === MoveState.Grounded, 240);
    const lands = sim.log.filter((e) => e.type === 'land');
    expect(lands.at(-1)?.payload).toMatchObject({ roll: true });
  });
});
