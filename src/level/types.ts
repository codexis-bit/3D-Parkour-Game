import type { EnvironmentSettings } from '../config/render';

/**
 * Datenformat der Levels.
 *
 * Koordinaten: Meter, Y ist oben. Ein Spieler mit yaw = 0 blickt nach -Z, +X ist rechts.
 * Rotationen `rot` sind Grad in der Reihenfolge Y (Gieren) → X (Nicken) → Z (Rollen).
 */

export type Vec3 = readonly [number, number, number];

export interface BoxElementBase {
  /** Mittelpunkt der Box. */
  pos: Vec3;
  /** Kantenlängen [Breite x, Höhe y, Tiefe z]. */
  size: Vec3;
  rot?: Vec3;
}

/** Normale, begehbare Geometrie (Böden, Blöcke, Säulen). */
export interface PlatformElement extends BoxElementBase {
  type: 'platform';
  /** Optischer Stil; Standard ist das helle Raster. */
  style?: 'base' | 'trim';
}

/**
 * Rampe von `from` nach `to` (jeweils Mitte der Oberkante am Anfang/Ende).
 * Die Oberseite verläuft exakt durch beide Punkte.
 */
export interface RampElement {
  type: 'ramp';
  from: Vec3;
  to: Vec3;
  width: number;
  /** Materialstärke unter der Oberfläche (Standard 0,5 m). */
  thickness?: number;
}

export type LevelElement = PlatformElement | RampElement;

export interface LevelSpawn {
  /** Fußposition. */
  pos: Vec3;
  /** Blickrichtung in Grad (0 = -Z, 90 = -X, 180 = +Z, -90 = +X). */
  yaw: number;
}

export interface LevelData {
  /** Stabile ID, z. B. für Bestzeiten im localStorage. */
  id: string;
  name: string;
  subtitle: string;
  /** 1 = leicht … 3 = schwer. */
  difficulty: 1 | 2 | 3;
  spawn: LevelSpawn;
  /** Fällt der Spieler unter diese Höhe, wird er zurückgesetzt. */
  killY: number;
  environment?: Partial<EnvironmentSettings>;
  elements: LevelElement[];
}
