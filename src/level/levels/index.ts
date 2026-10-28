import type { LevelData } from '../types';
import { challengeLevel } from './challenge';
import { exampleLevel } from './example';
import { flowLevel } from './flow';
import { sandboxLevel } from './sandbox';
import { tutorialLevel } from './tutorial';

/** Die spielbaren Levels in Reihenfolge der Levelauswahl. */
export const LEVELS: readonly LevelData[] = [tutorialLevel, flowLevel, challengeLevel];

/** Entwickler-Levels, nur über `?level=<id>` erreichbar. */
export const DEV_LEVELS: readonly LevelData[] = [sandboxLevel, exampleLevel];

export function findLevel(id: string): LevelData | undefined {
  return [...LEVELS, ...DEV_LEVELS].find((level) => level.id === id);
}

/** Nächstes Level nach `id` (oder undefined beim letzten). */
export function nextLevel(id: string): LevelData | undefined {
  const index = LEVELS.findIndex((level) => level.id === id);
  return index >= 0 ? LEVELS[index + 1] : undefined;
}
