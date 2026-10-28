import type { LevelData } from '../types';

/**
 * Test-Arena zum Ausprobieren und Tunen der Grundbewegung:
 * Lücken mit wachsender Breite, Stufen, Rampen und Blöcke verschiedener Höhe.
 */
export const sandboxLevel: LevelData = {
  id: 'sandbox',
  name: 'Sandbox',
  subtitle: 'Testgelände für alle Mechaniken',
  difficulty: 1,
  spawn: { pos: [0, 0, 8], yaw: 0 },
  killY: -25,
  elements: [
    // Boden
    { type: 'platform', pos: [0, -0.5, 0], size: [60, 1, 40] },

    // Blöcke mit 0,5 / 1,0 / 1,5 / 2,5 m Höhe
    { type: 'platform', pos: [-12, 0.25, -4], size: [3, 0.5, 3] },
    { type: 'platform', pos: [-8, 0.5, -4], size: [3, 1, 3] },
    { type: 'platform', pos: [-4, 0.75, -4], size: [3, 1.5, 3] },
    { type: 'platform', pos: [0, 1.25, -4], size: [3, 2.5, 3], style: 'trim' },

    // Treppe mit 0,3-m-Stufen
    ...Array.from({ length: 6 }, (_, i) => ({
      type: 'platform' as const,
      pos: [10, 0.15 + i * 0.15, -2 - i * 0.6] as const,
      size: [3, 0.3 + i * 0.3, 0.6] as const,
    })),

    // Rampen 15° und 30°
    { type: 'ramp', from: [18, 0, 4], to: [18, 2.68, -6], width: 4 },
    { type: 'ramp', from: [24, 0, 4], to: [24, 5.77, -6], width: 4 },
    { type: 'platform', pos: [21, 2.6, -9], size: [10, 0.5, 6] },

    // Sprung-Strecke: Plattformen über einem Graben mit 3 / 4 / 5 / 6 m Lücke
    { type: 'platform', pos: [-20, -0.5, -40], size: [60, 1, 40] },
    { type: 'platform', pos: [-20, 1.5, -22], size: [6, 3, 4] },
    { type: 'platform', pos: [-20, 1.5, -29], size: [6, 3, 4] },
    { type: 'platform', pos: [-20, 1.5, -37], size: [6, 3, 4] },
    { type: 'platform', pos: [-20, 1.5, -46], size: [6, 3, 4] },
    { type: 'platform', pos: [-20, 1.5, -56], size: [6, 3, 4] },
  ],
};
