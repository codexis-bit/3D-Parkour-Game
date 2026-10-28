import { afterEach, describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { DEG2RAD } from '../src/core/math';
import type { LevelElement } from '../src/level/types';
import { MoveState } from '../src/player/MoveState';
import { createSim, FLOOR, type Sim } from './helpers/sim';

let sim: Sim | null = null;
afterEach(() => {
  sim?.dispose();
  sim = null;
});

/** Blick vom Auge des Spielers genau auf `target` richten. */
function lookAt(s: Sim, target: [number, number, number]): void {
  const eye = s.player.eyePosition(s.player.feet.clone());
  const dx = target[0] - eye.x;
  const dy = target[1] - eye.y;
  const dz = target[2] - eye.z;
  s.view.yaw = Math.atan2(-dx, -dz);
  s.view.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

async function standingSim(elements: LevelElement[]): Promise<Sim> {
  const s = await createSim(elements, { pos: [0, 0.2, 0], yaw: 0 });
  s.until(() => s.player.state === MoveState.Grounded, 120);
  s.step(2);
  return s;
}

describe('Grapple – Zielerfassung', () => {
  it('erfasst einen Punkt im Zielkegel und in Reichweite', async () => {
    sim = await standingSim([FLOOR, { type: 'grapple', pos: [0, 8, -15], mode: 'pull' }]);
    lookAt(sim, [0, 8, -15]);
    sim.step();
    expect(sim.player.grapple.target?.position.z).toBe(-15);
  });

  it('ignoriert Punkte außerhalb des Kegels, der Reichweite oder hinter Wänden', async () => {
    sim = await standingSim([
      FLOOR,
      { type: 'grapple', pos: [0, 8, 15], mode: 'pull' }, // hinter dem Spieler
      { type: 'grapple', pos: [0, 8, -60], mode: 'pull' }, // zu weit
      { type: 'grapple', pos: [20, 3, -10], mode: 'pull' }, // verdeckt
      { type: 'platform', pos: [10, 3, -5], size: [1, 8, 12] },
    ]);
    sim.view.yaw = 0;
    sim.view.pitch = 8 * DEG2RAD;
    sim.step();
    expect(sim.player.grapple.target).toBeNull();
    lookAt(sim, [0, 8, -60]);
    sim.step();
    expect(sim.player.grapple.target).toBeNull();
    lookAt(sim, [20, 3, -10]);
    sim.step();
    expect(sim.player.grapple.target).toBeNull();
  });
});

describe('Grapple – Pull', () => {
  it('zieht den Spieler zum Punkt und löst sich kurz davor', async () => {
    sim = await standingSim([FLOOR, { type: 'grapple', pos: [0, 9, -18], mode: 'pull' }]);
    lookAt(sim, [0, 9, -18]);
    sim.input.grapplePressed = true;
    sim.input.grappleHeld = true;
    sim.step();
    expect(sim.player.grapple.phase).toBe('firing');
    const attachTicks = sim.until(() => sim!.player.state === MoveState.Grappling, 30);
    expect(attachTicks).toBeGreaterThanOrEqual(0);
    expect(sim.log.some((e) => e.type === 'grappleAttach')).toBe(true);

    let maxY = 0;
    const ticks = sim.until(() => {
      maxY = Math.max(maxY, sim!.player.feet.y);
      return sim!.player.state !== MoveState.Grappling;
    }, 240);
    expect(ticks).toBeGreaterThan(0);
    const release = sim.log.find((e) => e.type === 'grappleRelease');
    expect(release?.payload).toMatchObject({ reason: 'arrived' });
    const center = sim.player.body.center(sim.player.feet.clone());
    expect(center.distanceTo({ x: 0, y: 9, z: -18 } as never)).toBeLessThan(
      MOVEMENT.grapple.pullDetachDistance + 1,
    );
    expect(maxY).toBeGreaterThan(6);
  });

  it('Loslassen der Taste während des Hakenflugs bricht ab', async () => {
    sim = await standingSim([FLOOR, { type: 'grapple', pos: [0, 9, -30], mode: 'pull' }]);
    lookAt(sim, [0, 9, -30]);
    sim.input.grapplePressed = true;
    sim.input.grappleHeld = true;
    sim.step();
    sim.input.grappleHeld = false;
    sim.step(10);
    expect(sim.player.state).not.toBe(MoveState.Grappling);
    expect(sim.log.some((e) => e.type === 'grappleCancel')).toBe(true);
  });
});

describe('Grapple – Swing', () => {
  /** Startplattform bis z = -10, 22 m Lücke, Zielplattform ab z = -32, Schwungpunkt mittig darüber. */
  const SWING_COURSE: LevelElement[] = [
    { type: 'platform', pos: [0, -0.5, 0], size: [8, 1, 20] },
    { type: 'platform', pos: [0, -0.5, -41], size: [8, 1, 18] },
    { type: 'platform', pos: [0, -40.5, -20], size: [60, 1, 100] },
    { type: 'grapple', pos: [0, 12, -21], mode: 'swing' },
  ];

  it('pendelt am Seil und hält die Seillänge ein', async () => {
    sim = await standingSim(SWING_COURSE);
    sim.input.moveY = 1;
    sim.until(() => sim!.player.feet.z < -9.5, 240);
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    sim.step(4);
    lookAt(sim, [0, 12, -21]);
    sim.input.grapplePressed = true;
    sim.input.grappleHeld = true;
    sim.until(() => sim!.player.state === MoveState.Grappling, 30);
    expect(sim.player.state).toBe(MoveState.Grappling);
    let maxStretch = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      const center = sim.player.body.center(sim.player.feet.clone());
      const d = center.distanceTo(sim.player.grapple.active!.position);
      maxStretch = Math.max(maxStretch, d - sim.player.grapple.ropeLength);
    }
    expect(maxStretch).toBeLessThan(0.15);
  });

  it('Swing über eine 22-m-Lücke: Loslassen in der Aufwärtsbewegung trägt auf die andere Seite', async () => {
    sim = await standingSim(SWING_COURSE);
    sim.input.moveY = 1;
    sim.until(() => sim!.player.feet.z < -9.5, 240);
    sim.input.jumpPressed = true;
    sim.input.jumpHeld = true;
    sim.step(4);
    lookAt(sim, [0, 12, -21]);
    sim.input.grapplePressed = true;
    sim.input.grappleHeld = true;
    sim.until(() => sim!.player.state === MoveState.Grappling, 30);
    // Loslassen, sobald der Spieler 5 m hinter dem Anker ist (in der Aufwärtsbewegung).
    sim.until(() => sim!.player.feet.z < -26, 240);
    expect(sim.player.velocity.y).toBeGreaterThan(0);
    sim.input.grappleHeld = false;
    sim.view.pitch = 0;
    const landed = sim.until(() => sim!.player.state === MoveState.Grounded, 240);
    expect(landed).toBeGreaterThan(0);
    expect(sim.player.feet.z).toBeLessThan(-32);
    expect(sim.player.feet.y).toBeGreaterThan(-0.5);
  });
});
