import type {
  CheckpointElement,
  HintElement,
  PlatformElement,
  Vec3,
  WallRunElement,
} from '../types';

/**
 * Kleine Bau-Helfer für Level-Daten. Sie erzeugen nur Datenobjekte – die Levels bleiben
 * damit rein datengetrieben, lassen sich aber in „Laufrichtung“ (-Z) bequem beschreiben.
 *
 * Konvention: `zFrom` ist das vordere (größere) z, `zTo` das hintere (kleinere) z.
 */

export interface DeckOptions {
  x?: number;
  width?: number;
  thickness?: number;
  style?: 'base' | 'trim';
}

/** Plattform mit Oberkante `top` zwischen zFrom und zTo. */
export function deck(
  zFrom: number,
  zTo: number,
  top: number,
  options: DeckOptions = {},
): PlatformElement {
  const { x = 0, width = 8, thickness = 1, style } = options;
  const length = Math.abs(zFrom - zTo);
  return {
    type: 'platform',
    pos: [x, top - thickness / 2, (zFrom + zTo) / 2],
    size: [width, thickness, length],
    ...(style ? { style } : {}),
  };
}

/** Block mit Ober- und Unterkante (z. B. Hindernis zum Hochziehen). */
export function block(
  zFrom: number,
  zTo: number,
  bottom: number,
  top: number,
  options: { x?: number; width?: number; style?: 'base' | 'trim' } = {},
): PlatformElement {
  const { x = 0, width = 8, style } = options;
  return {
    type: 'platform',
    pos: [x, (bottom + top) / 2, (zFrom + zTo) / 2],
    size: [width, top - bottom, Math.abs(zFrom - zTo)],
    ...(style ? { style } : {}),
  };
}

/** Säule unter einer Plattform, die optisch in die Tiefe führt. */
export function support(
  x: number,
  z: number,
  top: number,
  depth = 40,
  width = 2.5,
): PlatformElement {
  return {
    type: 'platform',
    pos: [x, top - depth / 2, z],
    size: [width, depth, width],
    style: 'trim',
  };
}

/** Wall-Run-Wand parallel zur Z-Achse; `x` ist die Wandmitte. */
export function runWall(
  x: number,
  zFrom: number,
  zTo: number,
  bottom: number,
  top: number,
  thickness = 0.5,
): WallRunElement {
  return {
    type: 'wallrun',
    pos: [x, (bottom + top) / 2, (zFrom + zTo) / 2],
    size: [thickness, top - bottom, Math.abs(zFrom - zTo)],
  };
}

/** Hinweis-Bereich über einer Strecke (Unterkante auf `floor`). */
export function hint(
  zFrom: number,
  zTo: number,
  floor: number,
  text: string,
  width = 12,
): HintElement {
  return {
    type: 'hint',
    pos: [0, floor - 1, (zFrom + zTo) / 2],
    size: [width, 6, Math.abs(zFrom - zTo)],
    text,
  };
}

/** Checkpoint mit Blick in Laufrichtung (-Z). */
export function checkpoint(pos: Vec3, yaw = 0): CheckpointElement {
  return { type: 'checkpoint', pos, yaw };
}
