import type { LevelData } from '../types';
import { block, checkpoint, deck, hint, runWall, support } from './helpers';

/**
 * Level 1 – Grundkurs: führt jede Mechanik einzeln ein, mit Hinweistexten an jeder Station.
 * Strecke verläuft entlang -Z; unter allen Plattformen liegt der Abgrund.
 *
 * Maße sind auf die Movement-Werte abgestimmt (siehe tests/levels.test.ts – ein Bot läuft die
 * Strecke durch): normale Lücken ≤ 4 m, Slide-Jump-Lücke 7 m, Wall Run 14 m, Wall-Jump-Korridor
 * 26 m, Schwung-Lücke 22 m mit dem Ring 13 m über der Absprungkante.
 */
export const tutorialLevel: LevelData = {
  id: 'tutorial',
  name: 'Grundkurs',
  subtitle: 'Alle Moves Schritt für Schritt',
  difficulty: 1,
  parTime: 45,
  spawn: { pos: [0, 0, 9], yaw: 0 },
  killY: -20,
  backdrop: { seed: 7, count: 140 },
  elements: [
    // --- Start: Laufen und Springen ------------------------------------------------------------
    deck(14, -12, 0),
    support(0, 1, -1),
    hint(
      14,
      2,
      0,
      'Willkommen bei MOMENTUM! Laufe mit [W] [A] [S] [D] und schau dich mit der Maus um. Die Zeit läuft ab deiner ersten Bewegung.',
    ),
    hint(
      2,
      -12,
      0,
      'Springe mit [Leertaste] über die Lücke. Je länger du die Taste hältst, desto höher springst du.',
    ),

    // --- Kanten hochziehen ----------------------------------------------------------------------
    deck(-15.5, -34, 0),
    support(0, -25, -1),
    hint(
      -15.5,
      -22,
      0,
      'Kanten in Brusthöhe überwindest du automatisch: einfach mit [W] dagegen laufen.',
    ),
    block(-23, -26, 0, 1.3),
    hint(-26, -34, 0, 'Höhere Kanten erreichst du mit einem Sprung – oben ziehst du dich hoch.'),

    // --- Slide unter dem Tunnel, dann bergab -----------------------------------------------------
    deck(-34, -54, 2.6),
    support(0, -44, 1.6),
    checkpoint([0, 2.6, -37]),
    hint(
      -35,
      -42,
      2.6,
      'Halte im Sprint [Shift] (oder [Strg] / [C]), um zu sliden – so passt du unter niedrige Hindernisse.',
    ),
    { type: 'slideTunnel', pos: [0, 2.6, -46], length: 6, width: 7.2, clearance: 1.2 },
    hint(-49, -56, 2.6, 'Bergab wird dein Slide immer schneller – halte die Taste gedrückt!'),
    { type: 'ramp', from: [0, 2.6, -54], to: [0, -3, -74], width: 8 },

    // --- Slide-Jump über die breite Lücke ------------------------------------------------------
    deck(-74, -82, -3),
    support(0, -78, -4),
    checkpoint([0, -3, -75.5]),
    hint(
      -74,
      -82,
      -3,
      'Springe aus dem Slide: Dein Schwung bleibt erhalten. Diese Lücke schaffst du nur mit einem Slide-Jump!',
    ),
    deck(-89, -102, -3),
    support(0, -95, -4),

    // --- Wall Run -------------------------------------------------------------------------------
    checkpoint([0, -3, -92]),
    hint(
      -89,
      -102,
      -3,
      'Blaue Wände: Springe seitlich dagegen und halte [W], um an ihnen entlangzulaufen.',
    ),
    runWall(3.6, -100, -120, -9, 1),
    deck(-116, -128, -3),
    support(0, -122, -4),

    // --- Wall Jump im Korridor ------------------------------------------------------------------
    checkpoint([0, -3, -119]),
    hint(
      -116,
      -128,
      -3,
      'Drücke während des Wall Runs [Leertaste] für einen Wall Jump – so springst du von Wand zu Wand.',
    ),
    runWall(2.2, -126, -156, -10, 3),
    runWall(-2.2, -126, -156, -10, 3),
    deck(-154, -168, -3),
    support(0, -161, -4),

    // --- Grappling Hook: Ziehen -----------------------------------------------------------------
    checkpoint([0, -3, -157]),
    hint(
      -154,
      -162,
      -3,
      'Orange Kristalle sind Zugpunkte: Anvisieren und [Rechtsklick] oder [E] halten – das Seil zieht dich hinauf.',
    ),
    { type: 'grapple', pos: [0, 8.5, -176], mode: 'pull' },
    deck(-177, -194, 6),
    support(0, -185, 5),

    // --- Grappling Hook: Schwingen --------------------------------------------------------------
    checkpoint([0, 6, -180]),
    hint(
      -178,
      -187,
      6,
      'Ringe sind Schwungpunkte: Halte [Rechtsklick] / [E], pendle über die Lücke und lass in der Aufwärtsbewegung los.',
    ),
    { type: 'grapple', pos: [0, 19, -205], mode: 'swing' },
    deck(-216, -231.7, 6),
    support(0, -224, 5),

    // --- Sprungpad ------------------------------------------------------------------------------
    checkpoint([0, 6, -219]),
    hint(-217, -225, 6, 'Grüne Sprungpads schleudern dich in die Höhe.'),
    { type: 'jumpPad', pos: [0, 6, -227], size: [4, 3], power: 19, push: [0, -5] },
    block(-231.7, -246, 6, 12),
    support(0, -239, 6),

    // --- Bewegliche Plattform -------------------------------------------------------------------
    checkpoint([0, 12, -234]),
    hint(
      -232,
      -240,
      12,
      'Gelbe Plattformen bewegen sich – spring im richtigen Moment auf und wieder ab.',
    ),
    {
      type: 'moving',
      size: [4, 0.6, 4],
      path: [
        [0, 11.7, -250],
        [0, 11.7, -262],
      ],
      speed: 4,
      wait: 1,
    },
    deck(-266, -286, 12),
    support(0, -276, 11),

    // --- Kill-Zone und Ziel ---------------------------------------------------------------------
    checkpoint([0, 12, -269]),
    hint(
      -268,
      -274,
      12,
      'Rote Zonen sind tödlich – du startest dann am letzten Checkpoint. Mit [R] kommst du jederzeit dorthin zurück.',
    ),
    { type: 'killZone', pos: [0, 12.3, -277], size: [8, 0.6, 2.5] },
    { type: 'goal', pos: [0, 12, -283] },
  ],
};
