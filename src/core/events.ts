import type { MoveState } from '../player/MoveState';

/** Art eines Sprungs – Audio und Kamera reagieren unterschiedlich darauf. */
export type JumpKind = 'ground' | 'coyote' | 'slide' | 'wall' | 'grapple';

/** Alle Spielereignisse mit ihren Nutzdaten. */
export type GameEvents = {
  stateChange: { from: MoveState; to: MoveState };
  jump: { kind: JumpKind; speed: number };
  land: { impactSpeed: number; horizontalSpeed: number; hard: boolean; roll: boolean };
  footstep: { speed: number; onWall: boolean };
};
