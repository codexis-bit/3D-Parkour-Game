import type { LevelData } from '../types';

/**
 * Minimales Beispiel-Level aus der README (über `?level=beispiel` erreichbar):
 * Lücke, Checkpoint, Kante zum Hochziehen, Rampe und Ziel.
 */
export const exampleLevel: LevelData = {
  id: 'beispiel',
  name: 'Beispiel',
  subtitle: 'Sprung, Kante, Rampe',
  difficulty: 1,
  parTime: 12,
  spawn: { pos: [0, 0, 0], yaw: 0 },
  killY: -15,
  elements: [
    // Startplattform: Oberkante auf y = 0, reicht von z = 2 bis z = -18
    { type: 'platform', pos: [0, -0.5, -8], size: [8, 1, 20] },
    {
      type: 'hint',
      pos: [0, -1, -8],
      size: [12, 6, 20],
      text: 'Lauf mit [W] los und spring mit [Leertaste] über die Lücke.',
    },
    // 3 m Lücke, dann die zweite Plattform mit Checkpoint
    { type: 'platform', pos: [0, -0.5, -32], size: [8, 1, 22] },
    { type: 'checkpoint', pos: [0, 0, -24], yaw: 0 },
    // 1 m hohe Kante: Dagegenlaufen zieht automatisch hoch
    { type: 'platform', pos: [0, 0.5, -32], size: [8, 1, 2], style: 'trim' },
    // Rampe hinauf zur Zielplattform
    { type: 'ramp', from: [0, 0, -43], to: [0, 3, -55], width: 6 },
    { type: 'platform', pos: [0, 2.5, -61], size: [8, 1, 12] },
    { type: 'goal', pos: [0, 3, -64] },
  ],
};
