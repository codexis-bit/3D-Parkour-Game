import { afterEach, describe, expect, it } from 'vitest';
import type { LevelElement } from '../src/level/types';
import { MoveState } from '../src/player/MoveState';
import { createSim, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

/** Pad bei z = -10, 6 m hohe Klippe 4,7 m dahinter – das Level-Design-Muster der Levels. */
const COURSE: LevelElement[] = [
  { type: 'platform', pos: [0, -0.5, 0], size: [8, 1, 29.4] },
  { type: 'jumpPad', pos: [0, 0, -10], size: [4, 3], power: 19, push: [0, -5] },
  { type: 'platform', pos: [0, 3, -24.7], size: [8, 6, 20] },
];

describe('Sprungpad', () => {
  it.each([
    ['im Stand betreten', 0.15],
    ['mit Laufgeschwindigkeit', 1],
  ])('trägt auf die Klippe (%s)', async (_label, moveY) => {
    sim = await createSim(COURSE, { pos: [0, 0.2, -5], yaw: 0 });
    sim.until(() => sim!.player.state === MoveState.Grounded, 120);
    sim.input.moveY = moveY;
    sim.until(() => sim!.log.some((e) => e.type === 'jumpPad'), 240);
    sim.input.moveY = 1;
    const landed = sim.until(
      () => sim!.player.state === MoveState.Grounded && sim!.player.feet.y > 5.5,
      240,
    );
    expect(landed).toBeGreaterThan(0);
  });

  it('auch mit sehr hohem Tempo (Slide) geht es hinauf statt darunter hindurch', async () => {
    sim = await createSim([{ type: 'platform', pos: [0, -0.5, 30], size: [8, 1, 90] }, ...COURSE], {
      pos: [0, 0.2, 60],
      yaw: 0,
    });
    sim.until(() => sim!.player.state === MoveState.Grounded, 120);
    sim.input.moveY = 1;
    sim.step(30);
    sim.input.slidePressed = true;
    sim.input.slideHeld = true;
    sim.until(() => sim!.log.some((e) => e.type === 'jumpPad'), 600);
    sim.input.slideHeld = false;
    const landed = sim.until(
      () => sim!.player.state === MoveState.Grounded && sim!.player.feet.y > 5.5,
      240,
    );
    expect(landed).toBeGreaterThan(0);
  });
});
