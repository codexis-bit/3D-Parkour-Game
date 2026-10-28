import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { initPhysics } from '../src/core/Physics';
import { Level } from '../src/level/Level';
import { challengeLevel } from '../src/level/levels/challenge';
import { flowLevel } from '../src/level/levels/flow';
import { tutorialLevel } from '../src/level/levels/tutorial';
import type { LevelData } from '../src/level/types';
import { validateLevel } from '../src/level/validate';
import { PlayerBody, createGroundProbe } from '../src/player/PlayerBody';
import { runRoute } from './helpers/route';
import { challengeRoute } from './routes/challengeRoute';
import { flowRoute } from './routes/flowRoute';
import { tutorialRoute } from './routes/tutorialRoute';

const LEVELS: LevelData[] = [tutorialLevel, flowLevel, challengeLevel];

describe.each(LEVELS)('Level $name', (level) => {
  it('hat gültige Daten', () => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('Spawn und Checkpoints stehen frei auf festem Boden', async () => {
    await initPhysics();
    const runtime = new Level(level, 60);
    const points = [runtime.spawnFeet, ...runtime.checkpoints.map((c) => c.respawn)];
    const body = new PlayerBody(runtime.physics, MOVEMENT.player, runtime.spawnFeet);
    const probe = createGroundProbe();
    for (const point of points) {
      const feet = new THREE.Vector3().copy(point).setY(point.y + 0.05);
      body.teleport(feet);
      expect(body.fitsAt(feet, false), `frei bei ${point.toArray()}`).toBe(true);
      expect(body.probeGround(1.5, probe), `Boden unter ${point.toArray()}`).toBe(true);
    }
    body.dispose();
    runtime.dispose();
  });
});

describe('Bot-Routen', () => {
  it('Grundkurs ist durchspielbar', async () => {
    const result = await runRoute(tutorialLevel, tutorialRoute);
    expect(result.failedStep, result.log.join('\n')).toBeNull();
    expect(result.finished).toBe(true);
    expect(result.time).toBeLessThan(tutorialLevel.parTime ?? 999);
  });

  it('Strömung ist durchspielbar', async () => {
    const result = await runRoute(flowLevel, flowRoute);
    expect(result.failedStep, result.log.join('\n')).toBeNull();
    expect(result.finished).toBe(true);
    expect(result.time).toBeLessThan(flowLevel.parTime ?? 999);
  });

  it('Abgrund ist durchspielbar', async () => {
    const result = await runRoute(challengeLevel, challengeRoute);
    expect(result.failedStep, result.log.join('\n')).toBeNull();
    expect(result.finished).toBe(true);
    expect(result.time).toBeLessThan(challengeLevel.parTime ?? 999);
  });
});

describe('Level-Registry', () => {
  it('IDs sind eindeutig und nextLevel folgt der Reihenfolge', async () => {
    const { LEVELS, DEV_LEVELS, nextLevel, findLevel } = await import('../src/level/levels');
    const ids = [...LEVELS, ...DEV_LEVELS].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(nextLevel('tutorial')?.id).toBe('flow');
    expect(nextLevel('challenge')).toBeUndefined();
    expect(findLevel('sandbox')?.name).toBe('Sandbox');
  });
});
