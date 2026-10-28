import type { LevelData } from '../types';
import { block, checkpoint, deck, runWall, support } from './helpers';

/** 3 × 3 m Pfeiler mit Oberkante `top`. */
function pillar(x: number, z: number, top: number) {
  return deck(z + 1.5, z - 1.5, top, { x, width: 3, thickness: 40 });
}

/**
 * Level 3 – Abgrund: lange Sequenzen über dem Nichts.
 * Pfeiler-Sprünge → Wall-Run-Spießrutenlauf → querfahrende Plattformen und Laser →
 * doppelte Schwung-Kette → Abfahrt mit Slide-Jump → Zug auf den Zielturm.
 *
 * Abkürzungen für Speedrunner:
 * - Vom ersten Pfeiler aus ist der Zugpunkt über dem ersten Deck in Reichweite (spart drei Pfeiler).
 * - Links neben dem zweiten Deck führt ein Sprungpad auf einen Balken; von dort trägt eine lange
 *   Wall-Run-Wand an den Plattformen und dem Laser vorbei.
 */
export const challengeLevel: LevelData = {
  id: 'challenge',
  name: 'Abgrund',
  subtitle: 'Lange Sequenzen, Schwung über dem Nichts',
  difficulty: 3,
  parTime: 60,
  spawn: { pos: [0, 20, 6], yaw: 0 },
  killY: -10,
  backdrop: { seed: 99, count: 180, color: '#5d4f6b' },
  environment: {
    skyTop: '#232a5c',
    skyHorizon: '#f2956b',
    skyBottom: '#3a2a40',
    sunDirection: [0.35, 0.22, -0.9],
    sunColor: '#ffb07a',
    sunIntensity: 2.6,
    hemiSky: '#ffc3a0',
    hemiGround: '#4b3d52',
    hemiIntensity: 1.1,
    fogNear: 50,
    fogFar: 340,
  },
  elements: [
    // --- 1: Pfeiler-Sprünge ---------------------------------------------------------------------
    deck(10, -6, 20),
    support(0, 2, 19, 40, 4),
    pillar(1, -11.5, 20),
    pillar(-1, -18.5, 20.5),
    pillar(1, -25.5, 21),
    pillar(-1, -32.5, 21),
    // Abkürzung A: vom ersten Pfeiler aus erreichbar
    { type: 'grapple', pos: [0, 24.5, -36], mode: 'pull', range: 27 },
    deck(-38, -50, 21),
    support(0, -44, 20),
    checkpoint([0, 21, -40]),

    // --- 2: Wall-Run-Spießrutenlauf (vier versetzte Wände) --------------------------------------
    runWall(-2.2, -48, -66, 14, 28),
    runWall(2.2, -56, -74, 14, 28),
    runWall(-2.2, -64, -82, 14, 28),
    runWall(2.2, -72, -90, 14, 28),
    deck(-88, -104, 21, { width: 8 }),
    support(0, -96, 20),
    checkpoint([0, 21, -92]),

    // Abkürzung B: Sprungpad links → Balken → lange Wand vorbei an Plattformen und Laser
    deck(-92, -104, 21, { x: -7.5, width: 7 }),
    { type: 'jumpPad', pos: [-9, 21, -97], size: [3, 3], power: 19, push: [0, -5] },
    block(-101.7, -112, 21, 26, { x: -9, width: 3 }),
    runWall(-11, -110, -138, 18, 34),

    // --- 3: querfahrende Plattformen (im Gleichtakt), dann unter dem Laser durchsliden ----------
    // Tipp: an der linken Kante warten, bis die Plattform dort hält, dann aufspringen.
    {
      type: 'moving',
      size: [4, 0.6, 4],
      path: [
        [-5, 20.7, -110],
        [5, 20.7, -110],
      ],
      speed: 4,
      wait: 1.2,
    },
    {
      type: 'moving',
      size: [4, 0.6, 4],
      path: [
        [-5, 20.7, -118],
        [5, 20.7, -118],
      ],
      speed: 4,
      wait: 1.2,
    },
    deck(-122, -140, 21, { width: 8 }),
    deck(-124, -140, 21, { x: -8.5, width: 9 }),
    support(0, -131, 20),
    // Laser auf Kopfhöhe – nur im Slide (1,0 m) passt man darunter durch.
    { type: 'killZone', pos: [0, 22.75, -128], size: [8, 1.1, 0.4] },
    { type: 'killZone', pos: [-8.5, 22.75, -128], size: [9, 1.1, 0.4] },
    checkpoint([0, 21, -136]),

    // --- 4: doppelte Schwung-Kette über dem Abgrund --------------------------------------------
    { type: 'grapple', pos: [0, 34, -151], mode: 'swing' },
    { type: 'grapple', pos: [0, 34, -177], mode: 'swing' },
    deck(-189, -206, 21),
    support(0, -197, 20),
    checkpoint([0, 21, -192]),

    // --- 5: Abfahrt → Slide-Jump → Zug auf den Zielturm ---------------------------------------
    { type: 'ramp', from: [0, 21, -206], to: [0, 14, -230], width: 8 },
    deck(-230, -236, 14),
    deck(-243, -254, 14),
    support(0, -248, 13),
    { type: 'grapple', pos: [0, 26, -263], mode: 'pull' },
    block(-264, -278, 14, 24, { width: 10 }),
    { type: 'goal', pos: [0, 24, -272] },
  ],
};
