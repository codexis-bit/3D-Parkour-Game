import { MoveState } from '../../src/player/MoveState';
import { at, type RouteStep } from '../helpers/route';
import type { Sim } from '../helpers/sim';
import { wallJumpRhythm } from './tutorialRoute';

const grounded = (s: Sim) =>
  s.player.state === MoveState.Grounded || s.player.state === MoveState.Sliding;

/** Bot-Route durch „Strömung“. */
export const flowRoute: RouteStep[] = [
  { name: 'Anlauf Rampe', hold: { moveY: 1 }, yaw: 0, until: at.zBelow(-5) },
  { name: 'Slide bergab', press: ['slide'], until: at.zBelow(-40.8), timeout: 6 },
  {
    name: 'Absprung zur linken Wand',
    press: ['jump'],
    hold: { moveX: -0.6, slideHeld: false },
    until: at.state(MoveState.WallRunning),
    timeout: 1.5,
  },
  {
    name: 'Wall Run → Wall Jump → Wall Run',
    each: (s) => {
      // Nur von der linken Wand abspringen, an der rechten bis zur Landung weiterlaufen.
      const p = s.player;
      if (p.state === MoveState.WallRunning && p.wallRun.normal.x > 0) wallJumpRhythm(s);
      else if (p.state === MoveState.WallRunning) s.input.moveX = 0.3;
    },
    until: (s) => s.player.feet.z < -68.5 && grounded(s),
    timeout: 5,
  },
  { name: 'Anlauf Tunnel', hold: { moveX: 0 }, toward: [0, -88], until: at.zBelow(-71) },
  { name: 'Slide durch den Tunnel', press: ['slide'], until: at.zBelow(-87.3) },
  {
    name: 'Slide-Jump',
    press: ['jump'],
    until: (s) => s.player.feet.z < -95.5 && grounded(s),
    timeout: 3,
  },
  {
    name: 'Anlauf Zugpunkt',
    hold: { slideHeld: false },
    toward: [0, -110],
    until: at.zBelow(-101),
  },
  {
    name: 'Pull auf den Turm',
    press: ['grapple'],
    lookAt: [0, 14.5, -117],
    until: (s) => s.player.feet.y > 11.5 && grounded(s),
    timeout: 4,
  },
  {
    name: 'Anlauf Swing',
    hold: { grappleHeld: false },
    toward: [0, -140],
    pitch: 0,
    until: at.zBelow(-133.4),
  },
  { name: 'Absprung Swing', press: ['jump'], until: at.ticks(4) },
  { name: 'Swing', press: ['grapple'], lookAt: [0, 25, -145], until: at.zBelow(-150), timeout: 4 },
  {
    name: 'Loslassen + Landung',
    hold: { grappleHeld: false },
    toward: [0, -170],
    pitch: 0,
    until: (s) => s.player.feet.z < -156.5 && grounded(s),
    timeout: 4,
  },
  { name: 'Zur zweiten Rampe', toward: [0, -190], until: at.zBelow(-172) },
  { name: 'Slide bergab 2', press: ['slide'], until: at.zBelow(-205.3), timeout: 6 },
  {
    name: 'Slide-Jump 2',
    press: ['jump'],
    until: (s) => s.player.feet.z < -213.5 && grounded(s),
    timeout: 3,
  },
  {
    name: 'Sprungpad',
    hold: { slideHeld: false },
    toward: [0, -245],
    until: (s) => s.player.feet.y > 8.5 && grounded(s),
    timeout: 5,
  },
];
