import { MoveState } from '../../src/player/MoveState';
import { at, type RouteStep } from '../helpers/route';
import type { Sim } from '../helpers/sim';
import { wallJumpRhythm } from './tutorialRoute';

const grounded = (s: Sim) =>
  s.player.state === MoveState.Grounded || s.player.state === MoveState.Sliding;

/** Sprung von Pfeiler zu Pfeiler: auf den nächsten zielen, an der Kante abspringen, landen. */
function pillarHop(
  name: string,
  target: [number, number],
  jumpAtZ: number,
  landZ: number,
): RouteStep[] {
  return [
    { name: `${name}: Anlauf`, toward: target, until: at.zBelow(jumpAtZ) },
    {
      name: `${name}: Sprung`,
      press: ['jump'],
      toward: target,
      until: (s) => s.player.feet.z < landZ && grounded(s),
      timeout: 2,
    },
  ];
}

/** Bot-Route durch „Abgrund“ (Hauptweg ohne Abkürzungen). */
export const challengeRoute: RouteStep[] = [
  { name: 'Start', hold: { moveY: 1 }, yaw: 0, until: at.ticks(1) },
  ...pillarHop('Pfeiler 1', [1, -11.5], -5.6, -10.2),
  ...pillarHop('Pfeiler 2', [-1, -18.5], -12.8, -17.2),
  ...pillarHop('Pfeiler 3', [1, -25.5], -19.8, -24.2),
  ...pillarHop('Pfeiler 4', [-1, -32.5], -26.8, -31.2),
  ...pillarHop('Deck 1', [0, -42], -33.8, -38.3),
  { name: 'Anlauf Wände', toward: [-1.2, -50], until: at.zBelow(-49.3) },
  {
    name: 'Absprung linke Wand',
    press: ['jump'],
    hold: { moveX: -0.6 },
    yaw: 0,
    until: at.state(MoveState.WallRunning),
    timeout: 1.5,
  },
  {
    name: 'Wall-Run-Spießrutenlauf',
    each: wallJumpRhythm,
    until: (s) => s.player.feet.z < -89 && grounded(s),
    timeout: 8,
  },
  {
    name: 'Zur linken Wartestelle',
    hold: { moveX: 0 },
    toward: [-5, -100],
    until: (s) => Math.hypot(s.player.feet.x + 5, s.player.feet.z + 100) < 0.6,
    timeout: 4,
  },
  {
    name: 'Warten auf Plattform links',
    hold: { moveY: 0 },
    until: (s) => {
      const p = s.level.movingPlatforms[0]!;
      return p.position.x < -4.9 && p.velocity.lengthSq() < 0.001;
    },
    timeout: 12,
  },
  { name: 'Anlauf Plattform 1', hold: { moveY: 1 }, yaw: 0, until: at.zBelow(-103.6) },
  {
    name: 'Auf Plattform 1',
    press: ['jump'],
    until: (s) => s.player.feet.z < -108.4 && grounded(s),
    timeout: 2,
  },
  { name: 'Anlauf Plattform 2', until: at.zBelow(-111.3) },
  {
    name: 'Auf Plattform 2',
    press: ['jump'],
    until: (s) => s.player.feet.z < -116.4 && grounded(s),
    timeout: 2,
  },
  { name: 'Anlauf Deck 3', until: at.zBelow(-119.3) },
  {
    name: 'Auf Deck 3',
    press: ['jump'],
    until: (s) => s.player.feet.z < -122.5 && grounded(s),
    timeout: 2,
  },
  { name: 'Anlauf Laser', toward: [-1, -140], until: at.zBelow(-124.5) },
  { name: 'Unter dem Laser durch', press: ['slide'], until: at.zBelow(-130) },
  {
    name: 'Anlauf Swing 1',
    hold: { slideHeld: false },
    toward: [0, -150],
    until: at.zBelow(-139.4),
  },
  { name: 'Absprung Swing 1', press: ['jump'], until: at.ticks(4) },
  {
    name: 'Swing 1',
    press: ['grapple'],
    lookAt: [0, 34, -151],
    until: at.zBelow(-156),
    timeout: 4,
  },
  {
    name: 'Flug zu Ring 2',
    hold: { grappleHeld: false },
    lookAt: [0, 34, -177],
    until: at.ticks(8),
  },
  {
    name: 'Swing 2',
    press: ['grapple'],
    lookAt: [0, 34, -177],
    until: at.zBelow(-182),
    timeout: 4,
  },
  {
    name: 'Landung Deck 4',
    hold: { grappleHeld: false },
    yaw: 0,
    pitch: 0,
    until: (s) => s.player.feet.z < -189.5 && grounded(s),
    timeout: 4,
  },
  { name: 'Zur Rampe', toward: [0, -210], until: at.zBelow(-205) },
  { name: 'Slide bergab', press: ['slide'], until: at.zBelow(-235.4), timeout: 6 },
  {
    name: 'Slide-Jump',
    press: ['jump'],
    until: (s) => s.player.feet.z < -243.5 && grounded(s),
    timeout: 3,
  },
  {
    name: 'Anlauf Zugpunkt',
    hold: { slideHeld: false },
    toward: [0, -260],
    until: at.zBelow(-247),
  },
  {
    name: 'Pull auf den Zielturm',
    press: ['grapple'],
    lookAt: [0, 26, -263],
    until: (s) => s.player.feet.y > 23.5 && grounded(s),
    timeout: 4,
  },
  {
    name: 'Ins Ziel',
    hold: { grappleHeld: false },
    toward: [0, -280],
    pitch: 0,
    until: at.zBelow(-270),
  },
];
