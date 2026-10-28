import { MoveState } from '../../src/player/MoveState';
import { at, type RouteStep } from '../helpers/route';
import type { Sim } from '../helpers/sim';

const grounded = (s: Sim) =>
  s.player.state === MoveState.Grounded || s.player.state === MoveState.Sliding;

/** Wall-Jump-Rhythmus: an der Wand kurz laufen, abspringen, zur anderen Wand lenken. */
export function wallJumpRhythm(s: Sim): void {
  const p = s.player;
  if (p.state === MoveState.WallRunning) {
    s.input.moveX = p.wallRun.normal.x > 0 ? 0.6 : -0.6;
    if (p.timeInState > 0.25) {
      s.input.jumpPressed = true;
      s.input.jumpHeld = true;
    }
  }
}

/** Bot-Route durch den Grundkurs (Tutorial). */
export const tutorialRoute: RouteStep[] = [
  { name: 'Anlauf Lücke 1', hold: { moveY: 1 }, yaw: 0, until: at.zBelow(-11.3) },
  { name: 'Sprung Lücke 1', press: ['jump'], until: (s) => s.player.feet.z < -15.8 && grounded(s) },
  { name: 'Block hochziehen', until: (s) => s.player.feet.z < -26.5 && grounded(s) },
  { name: 'Anlauf Plateau', until: at.zBelow(-31.6) },
  {
    name: 'Sprung + Mantle Plateau',
    press: ['jump'],
    until: (s) => s.player.feet.y > 2.5 && grounded(s),
  },
  { name: 'Anlauf Tunnel', until: at.zBelow(-40) },
  { name: 'Slide durch den Tunnel', press: ['slide'], until: at.zBelow(-54) },
  { name: 'Rampe hinab', until: at.zBelow(-81.2), timeout: 8 },
  {
    name: 'Slide-Jump',
    press: ['jump'],
    until: (s) => s.player.feet.z < -89.5 && grounded(s),
  },
  {
    name: 'Anlauf Wall Run',
    hold: { slideHeld: false },
    toward: [2.4, -101],
    until: at.zBelow(-100.4),
  },
  {
    name: 'Absprung zur Wand',
    press: ['jump'],
    hold: { moveX: 0.5 },
    yaw: 0,
    until: at.state(MoveState.WallRunning),
    timeout: 1,
  },
  {
    name: 'Wall Run',
    hold: { moveX: 0 },
    until: (s) => s.player.feet.z < -116.5 && grounded(s),
    timeout: 4,
  },
  { name: 'Anlauf Korridor', toward: [0.8, -128], until: at.zBelow(-127.2) },
  {
    name: 'Wall-Jump-Kette',
    press: ['jump'],
    hold: { moveX: 0.5 },
    yaw: 0,
    each: wallJumpRhythm,
    until: (s) => s.player.feet.z < -154.5 && grounded(s),
    timeout: 6,
  },
  { name: 'Anlauf Zugpunkt', hold: { moveX: 0 }, toward: [0, -174], until: at.zBelow(-160) },
  {
    name: 'Pull',
    press: ['grapple'],
    lookAt: [0, 8.5, -176],
    until: (s) => s.player.feet.y > 5.5 && grounded(s),
    timeout: 4,
  },
  {
    name: 'Anlauf Swing',
    hold: { grappleHeld: false },
    yaw: 0,
    pitch: 0,
    until: at.zBelow(-193.4),
  },
  { name: 'Absprung Swing', press: ['jump'], until: at.ticks(4) },
  {
    name: 'Swing',
    press: ['grapple'],
    lookAt: [0, 19, -205],
    until: at.zBelow(-210),
    timeout: 4,
  },
  {
    name: 'Loslassen + Landung',
    hold: { grappleHeld: false },
    yaw: 0,
    pitch: 0,
    until: (s) => s.player.feet.z < -216 && grounded(s),
    timeout: 4,
  },
  {
    name: 'Sprungpad',
    toward: [0, -240],
    until: (s) => s.player.feet.y > 11.5 && grounded(s),
    timeout: 5,
  },
  { name: 'Zur Plattformkante', toward: [0, -246], until: at.zBelow(-244.5) },
  {
    name: 'Warten auf Plattform',
    hold: { moveY: 0 },
    until: (s) => {
      const p = s.level.movingPlatforms[0]!;
      return p.position.z > -250.3 && p.velocity.lengthSq() < 0.01;
    },
    timeout: 10,
  },
  {
    name: 'Auf die Plattform',
    hold: { moveY: 1 },
    press: ['jump'],
    until: (s) => s.player.feet.z < -248.5 && grounded(s),
    timeout: 2,
  },
  {
    name: 'Mitfahren',
    hold: { moveY: 0 },
    until: (s) => s.level.movingPlatforms[0]!.position.z < -261.7,
    timeout: 8,
  },
  {
    name: 'Absprung auf Zielplattform',
    hold: { moveY: 1 },
    press: ['jump'],
    until: (s) => s.player.feet.z < -266.5 && grounded(s),
    timeout: 2,
  },
  { name: 'Anlauf Kill-Zone', toward: [0, -280], until: at.zBelow(-274.3) },
  { name: 'Sprung über Kill-Zone', press: ['jump'], until: at.zBelow(-281) },
];
