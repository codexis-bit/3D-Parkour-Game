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
