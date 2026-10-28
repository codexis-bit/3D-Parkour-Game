/**
 * Zentrale Tuning-Werte für das Movement.
 *
 * Einheiten: Meter (m), Sekunden (s), Geschwindigkeit in m/s, Beschleunigung in m/s².
 * Winkel sind in Grad angegeben. Alle Mechaniken lesen ausschließlich aus diesem Objekt –
 * zum Nachjustieren reicht es, hier Werte zu ändern (Hot Reload übernimmt sie im Dev-Server).
 */

export interface PlayerShapeConfig {
  /** Radius der Spielerkapsel. */
  radius: number;
  /** Gesamthöhe stehend. */
  standHeight: number;
  /** Gesamthöhe geduckt / beim Sliden (passt unter niedrige Decken). */
  crouchHeight: number;
  /** Augenhöhe über den Füßen, stehend. */
  eyeHeightStand: number;
  /** Augenhöhe über den Füßen, geduckt / im Slide. */
  eyeHeightCrouch: number;
  /** Abstand, den der Character Controller zu Oberflächen hält. */
  skinWidth: number;
  /** Maximale Stufenhöhe, die automatisch erstiegen wird. */
  stepHeight: number;
  /** Steilster begehbarer Hang. */
  maxSlopeDeg: number;
  /** Bis zu diesem Abstand wird der Spieler am Boden „festgeklebt“ (bergab laufen). */
  snapDistance: number;
  /** Stabilisierung des Character Controllers an Ecken (siehe Rapier normalNudgeFactor). */
  normalNudge: number;
  /** Kleine Abwärtsgeschwindigkeit am Boden, damit der Bodenkontakt nicht abreißt. */
  groundStickSpeed: number;
}

export interface GroundConfig {
  /** Laufgeschwindigkeit – das Spiel kennt nur Sprint, kein Gehen. */
  runSpeed: number;
  /** Beschleunigung bis runSpeed (70 → in ~0,13 s auf Tempo). */
  acceleration: number;
  /** Abbremsen ohne Eingabe. */
  deceleration: number;
  /** Wie schnell Überschuss-Tempo (z. B. nach Slide-Jump) am Boden abgebaut wird. */
  overspeedDeceleration: number;
  /** Lenkrate (1/s), mit der Überschuss-Tempo der Eingaberichtung folgt. */
  overspeedSteer: number;
  /** Geschwindigkeit geduckt. */
  crouchSpeed: number;
  /** Schrittlänge für Head-Bob und Schrittgeräusche. */
  stepLength: number;
}

export interface AirConfig {
  /** Beschleunigung durch Eingabe in der Luft (reduziert gegenüber dem Boden). */
  acceleration: number;
  /** Bis zu diesem Tempo kann die Eingabe in Blickrichtung beschleunigen. */
  inputSpeed: number;
  /** Proportionaler Luftwiderstand (1/s); 0 = Schwung bleibt voll erhalten. */
  drag: number;
  /** Faktor auf die Gravitation beim Fallen – > 1 macht Sprungkurven knackiger. */
  fallGravityMultiplier: number;
}

export interface JumpConfig {
  /** Sprunghöhe bei voll gehaltener Taste. */
  height: number;
  /** Faktor auf die Aufwärtsgeschwindigkeit beim frühen Loslassen (variable Sprunghöhe). */
  cutMultiplier: number;
  /** Zeit nach dem Verlassen einer Kante, in der noch gesprungen werden darf. */
  coyoteTime: number;
  /** So lange vor der Landung wird ein Sprung-Tastendruck gemerkt. */
  bufferTime: number;
  /** Anteil der Plattformgeschwindigkeit, der beim Absprung übernommen wird. */
  platformInherit: number;
}

export interface MovementConfig {
  /** Feste Physik-Taktrate. */
  physicsHz: number;
  gravity: number;
  maxFallSpeed: number;
  player: PlayerShapeConfig;
  ground: GroundConfig;
  air: AirConfig;
  jump: JumpConfig;
}

export const MOVEMENT: MovementConfig = {
  physicsHz: 60,
  gravity: 26,
  maxFallSpeed: 55,

  player: {
    radius: 0.35,
    standHeight: 1.8,
    crouchHeight: 1.0,
    eyeHeightStand: 1.62,
    eyeHeightCrouch: 0.82,
    skinWidth: 0.02,
    stepHeight: 0.35,
    maxSlopeDeg: 50,
    snapDistance: 0.3,
    normalNudge: 0.01,
    groundStickSpeed: 1.5,
  },

  ground: {
    runSpeed: 9,
    acceleration: 70,
    deceleration: 60,
    overspeedDeceleration: 9,
    overspeedSteer: 7,
    crouchSpeed: 4,
    stepLength: 2.3,
  },

  air: {
    acceleration: 16,
    inputSpeed: 9,
    drag: 0,
    fallGravityMultiplier: 1.12,
  },

  jump: {
    height: 1.45,
    cutMultiplier: 0.5,
    coyoteTime: 0.1,
    bufferTime: 0.1,
    platformInherit: 1,
  },
};

/** Abfluggeschwindigkeit, die genau die konfigurierte Sprunghöhe erreicht: v = √(2·g·h). */
export function jumpVelocity(cfg: Pick<MovementConfig, 'gravity'>, height: number): number {
  return Math.sqrt(2 * cfg.gravity * height);
}
