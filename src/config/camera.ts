/**
 * Kamera-Einstellungen und „Juice“-Werte (Head-Bob, Tilt, FOV-Effekte, Shake, Abrollen).
 * Gameplay-relevante Movement-Werte liegen in movement.ts. Winkel in Grad, Zeiten in Sekunden.
 */
export const CAMERA = {
  /** Radiant pro Mauspixel bei Empfindlichkeit 1,0. */
  radiansPerPixel: 0.0022,
  /** Maximaler Blickwinkel nach oben/unten. */
  pitchLimitDeg: 89,
  /** Glättungsrate der Augenhöhe beim Ducken/Aufstehen (1/s). */
  eyeHeightLambda: 16,

  /** Horizontales Sichtfeld (Grad): Standard und erlaubter Bereich im Optionsmenü. */
  fov: { default: 95, min: 70, max: 120 },

  /** Head-Bob, synchron zu den Schritten (Tiefpunkt = Schrittgeräusch). */
  bob: {
    /** Vertikale Amplitude in m. */
    amplitudeY: 0.05,
    /** Seitliches Pendeln in m. */
    amplitudeX: 0.028,
    rollDeg: 0.5,
    /** Ab diesem Tempo voller Ausschlag. */
    fullSpeed: 9,
    /** Ein- und Ausblendrate (1/s). */
    lambda: 10,
  },

  /** Kamera-Neigung (Rollen). */
  tilt: {
    /** Beim Wall Run von der Wand weg. */
    wallRunDeg: 13,
    slideDeg: 3.5,
    /** Leichtes Mitneigen beim seitlichen Laufen. */
    strafeDeg: 1.2,
    lambda: 9,
  },

  /** Dynamisches Sichtfeld. */
  fovEffects: {
    /** Maximale FOV-Erhöhung durch Tempo. */
    speedBoostDeg: 14,
    /** Ab diesem Tempo beginnt der Boost … */
    speedStart: 10,
    /** … bei diesem ist er voll. */
    speedFull: 26,
    lambda: 4,
    /** Kurzer FOV-Kick (zerfällt mit kickDecay). */
    grappleKickDeg: 5,
    jumpPadKickDeg: 7,
    slideKickDeg: 3,
    kickDecay: 6,
  },

  /** Kamera-Shake (Trauma-Modell: Stärke = Trauma², Trauma zerfällt linear). */
  shake: {
    hardLanding: 0.45,
    roll: 0.2,
    grappleAttach: 0.18,
    jumpPad: 0.25,
    death: 0.55,
    /** Zerfall pro Sekunde. */
    decay: 2.2,
    maxPitchDeg: 2.4,
    maxYawDeg: 1.8,
    maxRollDeg: 2.8,
    /** Frequenz des Rauschens (Hz). */
    frequency: 18,
  },

  /** Feder für das Absacken bei Landungen. */
  landing: {
    /** Abwärtsimpuls pro m/s Aufprall. */
    dipPerSpeed: 0.11,
    maxDipVelocity: 2.6,
    spring: 150,
    damping: 15,
  },

  /** Abrollen nach einer Landung aus großer Höhe. */
  roll: {
    duration: 0.55,
    /** Zusätzliches Absenken der Kamera während der Rolle (m). */
    dip: 0.75,
  },

  /** Leichtes Nach-unten-Nicken beim Hochziehen. */
  vault: { pitchDipDeg: 9, eyeDip: 0.12 },
} as const;
