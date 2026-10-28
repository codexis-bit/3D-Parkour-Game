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

/** Wand, an der man entlanglaufen und abspringen kann (blau markiert). */
export interface WallRunElement extends BoxElementBase {
  type: 'wallrun';
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

/**
 * Niedriger Durchgang, unter dem man nur sliden oder geduckt durchkommt.
 * Erzeugt Deckenblock und (optional) Seitenwände – den Boden liefert eine normale Plattform.
 */
export interface SlideTunnelElement {
  type: 'slideTunnel';
  /** Mitte des Tunnelbodens (auf Höhe der Bodenoberkante). */
  pos: Vec3;
  /** Länge in Laufrichtung (lokale Z-Achse). */
  length: number;
  /** Lichte Breite. */
  width: number;
  /** Lichte Höhe – muss zwischen Duckhöhe (1,0 m) und Stehhöhe (1,8 m) liegen. */
  clearance: number;
  /** Dicke des Deckenblocks (Standard 1,5 m). */
  ceilingThickness?: number;
  /** Ausrichtung in Grad (0 = Tunnel verläuft entlang Z). */
  yaw?: number;
  /** Seitenwände erzeugen (Standard true). */
  walls?: boolean;
}

export type GrappleMode = 'pull' | 'swing';

/**
 * Grapple-Punkt (orange). `pull` zieht den Spieler zum Punkt, `swing` lässt ihn am Seil pendeln.
 */
export interface GrappleElement {
  type: 'grapple';
  pos: Vec3;
  mode: GrappleMode;
  /** Überschreibt die Standard-Reichweite (m). */
  range?: number;
}

export type LevelElement =
  PlatformElement | WallRunElement | RampElement | SlideTunnelElement | GrappleElement;

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
