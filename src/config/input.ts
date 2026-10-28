/**
 * Tastenbelegung. Es werden `KeyboardEvent.code`-Werte verwendet, d. h. die physische
 * Tastenposition – WASD liegt damit auch auf QWERTZ- und AZERTY-Tastaturen richtig.
 */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'slide'
  | 'grapple'
  | 'respawn'
  | 'restart'
  | 'pause'
  | 'debug';

export const KEY_BINDINGS: Record<Action, readonly string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  // Strg funktioniert, aber Strg+W schließt in vielen Browsern den Tab – Shift oder C sind sicherer.
  slide: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC'],
  grapple: ['KeyE'],
  respawn: ['KeyR'],
  restart: ['KeyT'],
  pause: ['Escape', 'KeyP'],
  debug: ['F3'],
};

/** Maustasten (MouseEvent.button): 0 = links, 1 = Mitte, 2 = rechts. */
export const MOUSE_BINDINGS: Partial<Record<Action, readonly number[]>> = {
  grapple: [2],
};

/** Aktionen, die sofort (nicht im Physik-Takt) an UI/Spielablauf gemeldet werden. */
export const UI_ACTIONS: readonly Action[] = ['respawn', 'restart', 'pause', 'debug'];

/**
 * Gamepad-Tasten im Standard-Mapping (https://w3c.github.io/gamepad/#remapping):
 * 0 = A, 1 = B, 3 = Y, 5 = RB, 7 = RT, 8 = Select/Back, 9 = Start, 10 = L3.
 */
export const GAMEPAD_BINDINGS: Partial<Record<Action, readonly number[]>> = {
  jump: [0],
  slide: [1, 10],
  grapple: [7, 5],
  respawn: [3],
  restart: [8],
  pause: [9],
};

/** Gamepad-Feinabstimmung. */
export const GAMEPAD = {
  /** Radiale Deadzone der Sticks (0–1). */
  stickDeadzone: 0.16,
  /** Ab diesem Wert gilt ein analoger Trigger als gedrückt. */
  triggerThreshold: 0.35,
  /** Blickgeschwindigkeit bei vollem Ausschlag und Empfindlichkeit 1 (rad/s). */
  lookYawSpeed: 3.6,
  lookPitchSpeed: 2.4,
  /** Kennlinie: > 1 = feineres Zielen bei kleinem Ausschlag. */
  lookExponent: 1.7,
} as const;
