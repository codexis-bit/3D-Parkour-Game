/** Allgemeine Spielkonstanten (Name, Version, Speicher-Präfix). */
export const GAME = {
  name: 'MOMENTUM',
  tagline: '3D-Parkour mit Wall Runs, Slides und Grappling Hook',
  version: '0.1.0',
  /** Präfix für alle localStorage-Schlüssel, damit nichts kollidiert. */
  storagePrefix: 'momentum.',
} as const;
