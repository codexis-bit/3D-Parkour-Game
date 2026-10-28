import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { initPhysics } from '../src/core/Physics';
import { Level, type TriggerEvent } from '../src/level/Level';
import {
  aabbFromBottom,
  aabbFromCenter,
  aabbIntersects,
  createAabb,
  playerAabb,
  segmentEntry,
} from '../src/level/triggers';
import type { LevelData } from '../src/level/types';

describe('AABB-Trigger', () => {
  it('erkennt Überlappung und Abstand', () => {
    const a = aabbFromCenter([0, 0, 0], [2, 2, 2]);
    expect(aabbIntersects(a, aabbFromCenter([1.5, 0, 0], [2, 2, 2]))).toBe(true);
    expect(aabbIntersects(a, aabbFromCenter([3.1, 0, 0], [2, 2, 2]))).toBe(false);
  });

  it('aabbFromBottom steht auf dem Punkt', () => {
    const box = aabbFromBottom([0, 5, 0], [4, 3, 4]);
    expect(box.min.y).toBe(5);
    expect(box.max.y).toBe(8);
  });

  it('playerAabb umschließt die Kapsel (optional verkleinert)', () => {
    const box = playerAabb(new THREE.Vector3(1, 2, 3), 0.35, 1.8, createAabb(), 0.1);
    expect(box.min.x).toBeCloseTo(0.75);
    expect(box.max.y).toBeCloseTo(3.7);
  });

  it('segmentEntry liefert den Eintrittszeitpunkt', () => {
    const box = aabbFromCenter([0, 0, -10], [4, 4, 2]);
    const t = segmentEntry(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -20), box);
    expect(t).toBeCloseTo(9 / 20);
    expect(segmentEntry(new THREE.Vector3(5, 0, 0), new THREE.Vector3(5, 0, -20), box)).toBeNull();
    expect(segmentEntry(new THREE.Vector3(0, 0, -10), new THREE.Vector3(0, 0, -11), box)).toBe(0);
  });
});

describe('Level – Checkpoints und Kill-Zonen', () => {
  const data: LevelData = {
    id: 'trigger-test',
    name: 'Trigger',
    subtitle: '',
    difficulty: 1,
    spawn: { pos: [0, 0, 0], yaw: 0 },
    killY: -10,
    elements: [
      { type: 'platform', pos: [0, -0.5, -30], size: [10, 1, 80] },
      { type: 'checkpoint', pos: [0, 0, -10], yaw: 90 },
      { type: 'checkpoint', pos: [0, 0, -20], yaw: 0 },
      { type: 'killZone', pos: [0, 0.5, -30], size: [10, 1, 2] },
    ],
  };
  const events: TriggerEvent[] = [];

  it('aktiviert Checkpoints nur vorwärts und setzt den Respawnpunkt', async () => {
    await initPhysics();
    const level = new Level(data, 60);
    expect(level.respawnPoint.feet.z).toBe(0);

    level.checkTriggers(new THREE.Vector3(0, 0, -10), 0.35, 1.8, events);
    expect(events).toEqual([{ type: 'checkpoint', index: 0 }]);
    expect(level.respawnPoint.feet.z).toBe(-10);
    expect(level.respawnPoint.yaw).toBeCloseTo(Math.PI / 2);

    level.checkTriggers(new THREE.Vector3(0, 0, -20), 0.35, 1.8, events);
    expect(level.checkpointIndex).toBe(1);
    // Zurücklaufen zum ersten Checkpoint ändert nichts mehr.
    level.checkTriggers(new THREE.Vector3(0, 0, -10), 0.35, 1.8, events);
    expect(events).toHaveLength(0);
    expect(level.checkpointIndex).toBe(1);

    level.resetProgress();
    expect(level.checkpointIndex).toBe(-1);
    level.dispose();
  });

  it('meldet Tod in Kill-Zonen und unterhalb von killY', async () => {
    await initPhysics();
    const level = new Level(data, 60);
    level.checkTriggers(new THREE.Vector3(0, 0, -30), 0.35, 1.8, events);
    expect(events).toEqual([{ type: 'death', reason: 'killZone' }]);
    level.checkTriggers(new THREE.Vector3(0, -11, -40), 0.35, 1.8, events);
    expect(events).toEqual([{ type: 'death', reason: 'fall' }]);
    level.checkTriggers(new THREE.Vector3(0, 0, -40), 0.35, 1.8, events);
    expect(events).toHaveLength(0);
    level.dispose();
  });
});
