import type { LevelData, LevelElement } from '../types';

/** Treppe mit `count` Stufen à `rise` m Höhe und `run` m Tiefe in Richtung -Z. */
function stairs(x: number, z: number, count: number, rise: number, run: number): LevelElement[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'platform' as const,
    pos: [x, ((i + 1) * rise) / 2, z - i * run] as const,
    size: [3, (i + 1) * rise, run] as const,
  }));
}

/**
 * Test-Arena zum Ausprobieren und Tunen aller Mechaniken (über `?level=sandbox` erreichbar):
 * Blöcke verschiedener Höhe, Stufen, Rampen, Slide-Tunnel, Slide-Hügel und eine Sprungstrecke.
 */
export const sandboxLevel: LevelData = {
  id: 'sandbox',
  name: 'Sandbox',
  subtitle: 'Testgelände für alle Mechaniken',
  difficulty: 1,
  spawn: { pos: [0, 0, 20], yaw: 0 },
  killY: -25,
  elements: [
    // Boden
    { type: 'platform', pos: [0, -0.5, 0], size: [80, 1, 80] },

    // Blöcke mit 0,5 / 1,0 / 1,5 / 2,5 m Höhe
    { type: 'platform', pos: [-12, 0.25, 8], size: [3, 0.5, 3] },
    { type: 'platform', pos: [-8, 0.5, 8], size: [3, 1, 3] },
    { type: 'platform', pos: [-4, 0.75, 8], size: [3, 1.5, 3] },
    { type: 'platform', pos: [0, 1.25, 8], size: [3, 2.5, 3], style: 'trim' },

    // Treppe mit 0,3-m-Stufen
    ...stairs(10, 10, 6, 0.3, 0.6),

    // Rampen 15° und 30°
    { type: 'ramp', from: [18, 0, 14], to: [18, 2.68, 4], width: 4 },
    { type: 'ramp', from: [24, 0, 14], to: [24, 5.77, 4], width: 4 },
    { type: 'platform', pos: [21, 2.43, 1], size: [10, 0.5, 6] },

    // Slide-Tunnel (1,2 m lichte Höhe)
    { type: 'slideTunnel', pos: [4, 0, -2], length: 8, width: 3, clearance: 1.2 },

    // Slide-Hügel: 15° hinauf, kurzes Plateau, 20° hinab
    { type: 'ramp', from: [-30, 0, 30], to: [-30, 5.36, 10], width: 6 },
    { type: 'platform', pos: [-30, 4.86, 7], size: [6, 1, 6] },
    { type: 'ramp', from: [-30, 5.36, 4], to: [-30, 0, -10.7], width: 6, thickness: 1 },

    // Wall Run: einzelne Wand und ein Korridor für Wall-Jump-Ketten
    { type: 'wallrun', pos: [-18, 3, -20], size: [0.5, 6, 24] },
    { type: 'wallrun', pos: [9.8, 3, -26], size: [0.5, 6, 24] },
    { type: 'wallrun', pos: [14.2, 3, -26], size: [0.5, 6, 24] },

    // Sprungstrecke auf 2 m Höhe: Lücken mit 3 / 4 / 5 / 6 m
    { type: 'ramp', from: [30, 0, 12], to: [30, 2, 0], width: 4 },
    { type: 'platform', pos: [30, 1, -2], size: [4, 2, 4] },
    { type: 'platform', pos: [30, 1, -9], size: [4, 2, 4] },
    { type: 'platform', pos: [30, 1, -17], size: [4, 2, 4] },
    { type: 'platform', pos: [30, 1, -26], size: [4, 2, 4] },
    { type: 'platform', pos: [30, 1, -36], size: [4, 2, 4] },
  ],
};
