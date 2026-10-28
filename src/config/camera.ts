/**
 * Kamera-Einstellungen und „Juice“-Werte (Head-Bob, Tilt, FOV-Effekte, Shake).
 * Gameplay-relevante Movement-Werte liegen in movement.ts.
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
} as const;
