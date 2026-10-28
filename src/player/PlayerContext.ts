import type * as THREE from 'three';
import type { MovementConfig } from '../config/movement';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { PlayerInput } from '../core/Input';
import type { GroundProbe, PlayerBody } from './PlayerBody';

/** Blickrichtung der Kamera (rad), wird pro Tick an den Controller übergeben. */
export interface PlayerView {
  yaw: number;
  pitch: number;
}

/**
 * Was eine Mechanik (Wall Run, Grapple, Vault …) vom Spieler sehen darf.
 * Der PlayerController implementiert dieses Interface; Mechaniken hängen so nicht von ihm ab.
 */
export interface PlayerContext {
  readonly cfg: MovementConfig;
  readonly body: PlayerBody;
  readonly velocity: THREE.Vector3;
  readonly ground: GroundProbe;
  readonly input: PlayerInput;
  readonly view: PlayerView;
  /** Wunschrichtung aus WASD relativ zur Blickrichtung (Länge ≤ 1). */
  readonly wish: THREE.Vector3;
  readonly events: EventBus<GameEvents>;
  /** Sekunden im aktuellen Movement-State. */
  readonly timeInState: number;
}
