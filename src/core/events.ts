import type { MoveState } from '../player/MoveState';

/** Art eines Sprungs – Audio und Kamera reagieren unterschiedlich darauf. */
export type JumpKind = 'ground' | 'coyote' | 'slide' | 'wall' | 'grapple';

/** Alle Spielereignisse mit ihren Nutzdaten. */
export type GameEvents = {
  stateChange: { from: MoveState; to: MoveState };
  jump: { kind: JumpKind; speed: number };
  land: { impactSpeed: number; horizontalSpeed: number; hard: boolean; roll: boolean };
  footstep: { speed: number; onWall: boolean };
  slideStart: { speed: number; boosted: boolean };
  slideEnd: { speed: number };
  wallRunStart: { speed: number };
  wallRunEnd: { reason: 'timeout' | 'lost' | 'cancel' | 'slow' | 'jump' | 'land' };
  wallJump: { speed: number };
  grappleFire: { pointId: number; distance: number };
  grappleAttach: { pointId: number; mode: 'pull' | 'swing' };
  grappleRelease: { speed: number; reason: GrappleReleaseReason };
  grappleCancel: Record<string, never>;
};

export type GrappleReleaseReason = 'released' | 'arrived' | 'jump' | 'timeout' | 'blocked';
