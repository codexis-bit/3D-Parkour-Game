/**
 * Movement-States des Spielers und die erlaubten Übergänge zwischen ihnen.
 * Die Tabelle ist bewusst explizit: Ungültige Übergänge fallen in Tests und im Debug-Modus sofort auf.
 */
export const MoveState = {
  Grounded: 'grounded',
  Airborne: 'airborne',
  WallRunning: 'wallRunning',
  Sliding: 'sliding',
  Grappling: 'grappling',
  Vaulting: 'vaulting',
} as const;

export type MoveState = (typeof MoveState)[keyof typeof MoveState];

export const MOVE_TRANSITIONS: Readonly<Record<MoveState, readonly MoveState[]>> = {
  grounded: ['airborne', 'sliding', 'grappling', 'vaulting'],
  airborne: ['grounded', 'wallRunning', 'sliding', 'grappling', 'vaulting'],
  wallRunning: ['airborne', 'grounded', 'grappling', 'vaulting'],
  sliding: ['grounded', 'airborne', 'grappling', 'vaulting'],
  grappling: ['airborne', 'grounded'],
  vaulting: ['grounded', 'airborne'],
};

/** Deutsche Bezeichnungen für Debug-Anzeige und HUD. */
export const MOVE_STATE_LABELS: Readonly<Record<MoveState, string>> = {
  grounded: 'Am Boden',
  airborne: 'In der Luft',
  wallRunning: 'Wall Run',
  sliding: 'Slide',
  grappling: 'Grapple',
  vaulting: 'Vault',
};
