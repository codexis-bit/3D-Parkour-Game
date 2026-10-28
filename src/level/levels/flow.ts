import type { LevelData } from '../types';
import { block, checkpoint, deck, hint, runWall, support } from './helpers';

/**
 * Level 2 – Strömung: Kombinationen im Fluss. Slide die Rampe hinab, Wall Run → Wall Jump,
 * Slide durch den Tunnel → Slide-Jump, Pull auf den Turm → Swing, Rampe → Sprungpad → Ziel.
 */
export const flowLevel: LevelData = {
  id: 'flow',
  name: 'Strömung',
  subtitle: 'Moves kombinieren, Schwung halten',
  difficulty: 2,
  parTime: 40,
  spawn: { pos: [0, 10, 8], yaw: 0 },
  killY: -25,
  backdrop: { seed: 21, count: 160, color: '#9c8f9e' },
  environment: {
    skyTop: '#4a6fbf',
    skyHorizon: '#f2d3b0',
    skyBottom: '#a88f84',
    sunDirection: [-0.55, 0.45, 0.35],
    sunColor: '#ffd9a8',
    sunIntensity: 2.8,
    hemiSky: '#ffe6c9',
    hemiGround: '#8a7a70',
    fogNear: 60,
    fogFar: 380,
  },
  elements: [
    // --- Start und erste Abfahrt ---------------------------------------------------------------
    deck(12, -6, 10, { width: 10 }),
    support(0, 3, 9, 50),
    hint(
      12,
      0,
      10,
      'Halte den Schwung: Slide die Rampe hinab und kombiniere Wall Run, Wall Jump, Slide und Grapple.',
    ),
    { type: 'ramp', from: [0, 10, -6], to: [0, 2, -34], width: 8 },
    deck(-34, -42, 2, { width: 4 }),
    support(0, -38, 1, 40, 2),

    // --- Versetzte Wände: Wall Run links → Wall Jump → Wall Run rechts ------------------------------
    runWall(-2.2, -40, -60, -6, 7),
    runWall(2.2, -54, -74, -6, 7),
    deck(-68, -88, 2),
    support(0, -78, 1),
    checkpoint([0, 2, -70]),

    // --- Slide-Tunnel → Slide-Jump -------------------------------------------------------------
    { type: 'slideTunnel', pos: [0, 2, -78], length: 8, width: 7.2, clearance: 1.2 },
    deck(-95, -108, 2),
    support(0, -101, 1),
    checkpoint([0, 2, -97]),

    // --- Pull auf den Turm, Swing über die Schlucht ---------------------------------------------
    { type: 'grapple', pos: [0, 14.5, -117], mode: 'pull' },
    deck(-118, -134, 12, { thickness: 3 }),
    support(0, -126, 9, 50, 4),
    checkpoint([0, 12, -121]),
    { type: 'grapple', pos: [0, 25, -145], mode: 'swing' },
    deck(-156, -172, 12),
    support(0, -164, 11),
    checkpoint([0, 12, -159]),

    // --- Zweite Abfahrt → Slide-Jump → Sprungpad → Ziel ----------------------------------------
    { type: 'ramp', from: [0, 12, -172], to: [0, 3, -200], width: 8 },
    deck(-200, -206, 3),
    deck(-213, -227.7, 3),
    support(0, -220, 2),
    { type: 'jumpPad', pos: [0, 3, -223], size: [4, 3], power: 19, push: [0, -5] },
    block(-227.7, -248, 3, 9),
    support(0, -238, 3),
    { type: 'goal', pos: [0, 9, -243] },
  ],
};
