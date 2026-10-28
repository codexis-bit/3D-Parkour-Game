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

/** Checkpoint: Respawn-Punkt, wird beim Durchlaufen des Auslösebereichs aktiviert. */
export interface CheckpointElement {
  type: 'checkpoint';
  /** Fußposition beim Respawn = Mitte der Unterkante des Auslösebereichs. */
  pos: Vec3;
  /** Blickrichtung beim Respawn (Grad, wie beim Spawn). */
  yaw: number;
  /** Größe des Auslösebereichs (Standard [4, 3, 4]). */
  size?: Vec3;
}

/** Tödliche Zone (rot) – Berührung setzt den Spieler zum letzten Checkpoint zurück. */
export interface KillZoneElement {
  type: 'killZone';
  /** Mittelpunkt. */
  pos: Vec3;
  size: Vec3;
}

/**
 * Bewegliche Plattform (gelb), fährt einen Pfad aus Wegpunkten ab und nimmt den Spieler mit.
 */
export interface MovingPlatformElement {
  type: 'moving';
  size: Vec3;
  /** Wegpunkte (Mittelpunkt der Plattform), mindestens zwei. */
  path: Vec3[];
  /** Geschwindigkeit in m/s. */
  speed: number;
  /** Wartezeit an jedem Wegpunkt in Sekunden (Standard 0,8). */
  wait?: number;
  /** `pingpong` = hin und zurück (Standard), `loop` = Rundkurs zurück zum ersten Punkt. */
  mode?: 'pingpong' | 'loop';
  /** Zeitversatz in Sekunden, damit Plattformen nicht im Gleichtakt fahren. */
  offset?: number;
}

/** Sprungpad (grün): katapultiert den Spieler beim Betreten nach oben. */
export interface JumpPadElement {
  type: 'jumpPad';
  /** Mitte der Oberseite. */
  pos: Vec3;
  /** Fläche [Breite x, Tiefe z] (Standard [3, 3]). */
  size?: readonly [number, number];
  /** Abfluggeschwindigkeit nach oben in m/s (Steighöhe ≈ v² / (2 · Gravitation)). */
  power: number;
  /** Zusätzlicher horizontaler Schub [x, z] in m/s. */
  push?: readonly [number, number];
}

/** Ziel – Durchlaufen stoppt die Zeit. */
export interface GoalElement {
  type: 'goal';
  /** Mitte der Unterkante. */
  pos: Vec3;
  /** Größe des Zielbereichs (Standard [6, 4, 2]). */
  size?: Vec3;
  /** Ausrichtung des Zieltors in Grad (0 = Tor quer zur Z-Achse). */
  yaw?: number;
}

/** Tutorial-Hinweis: Text erscheint, solange der Spieler im Bereich ist. Tasten in [eckigen Klammern]. */
export interface HintElement {
  type: 'hint';
  /** Mitte der Unterkante des Bereichs. */
  pos: Vec3;
  size: Vec3;
  text: string;
}

export type LevelElement =
  | PlatformElement
  | WallRunElement
  | RampElement
  | SlideTunnelElement
  | GrappleElement
  | CheckpointElement
  | KillZoneElement
  | MovingPlatformElement
  | JumpPadElement
  | GoalElement
  | HintElement;

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
  /** Deko-Skyline im Nebel (rein optisch, ohne Kollision). */
  backdrop?: { seed: number; count: number; color?: string };
  /** Richtzeit in Sekunden – eine schnelle, aber machbare Zeit als Ansporn. */
  parTime?: number;
  elements: LevelElement[];
}
