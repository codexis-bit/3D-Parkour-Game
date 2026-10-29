import { KEY_BINDINGS, MOUSE_BINDINGS, UI_ACTIONS, type Action } from '../config/input';

/** Eingabe-Schnappschuss für einen Physik-Tick. */
export interface PlayerInput {
  /** -1 = links, +1 = rechts. */
  moveX: number;
  /** -1 = zurück, +1 = vorwärts. */
  moveY: number;
  jumpHeld: boolean;
  /** Taste seit dem letzten Tick neu gedrückt (Flanke). */
  jumpPressed: boolean;
  slideHeld: boolean;
  slidePressed: boolean;
  grappleHeld: boolean;
  grapplePressed: boolean;
}

export function createPlayerInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    jumpHeld: false,
    jumpPressed: false,
    slideHeld: false,
    slidePressed: false,
    grappleHeld: false,
    grapplePressed: false,
  };
}

/** Aktionen, deren Flanken bis zum nächsten Physik-Tick gemerkt werden. */
const TICK_ACTIONS: readonly Action[] = ['jump', 'slide', 'grapple'];

/** Ausreißer-Filter: Manche Browser melden beim Pointer-Lock-Start riesige Sprünge. */
const MAX_MOUSE_DELTA = 600;

/**
 * Tastatur- und Mauseingabe.
 *
 * Gedrückte Tasten werden als Zustand gehalten; Tastendruck-Flanken für Sprung/Slide/Grapple werden
 * gesammelt, bis {@link sampleTick} sie im nächsten festen Physik-Schritt abholt. So geht auch ein
 * sehr kurzer Tastendruck zwischen zwei Ticks nicht verloren.
 */
export class Input {
  /** Nur wenn aktiv, werden Spieltasten abgefangen und ausgewertet (nicht in Menüs). */
  enabled = false;
  /**
   * Umsehen per Ziehen mit gedrückter linker Maustaste – für Umgebungen ohne Pointer Lock
   * (z. B. eingebettete Rahmen, die ihn verweigern).
   */
  dragLook = false;
  /** Externe Bewegungsachsen (Gamepad), werden zu den Tasten addiert. */
  readonly external = { moveX: 0, moveY: 0 };
  /** Externe Halte-Zustände (Gamepad-Tasten). */
  readonly externalHeld = new Set<Action>();

  private readonly keys = new Set<string>();
  private readonly buttons = new Set<number>();
  private readonly pressed = new Set<Action>();
  private readonly codeToActions = new Map<string, Action[]>();
  private readonly actionListeners = new Set<(action: Action) => void>();
  private lookX = 0;
  private lookY = 0;

  constructor(private readonly lockElement: HTMLElement) {
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, readonly string[]][]) {
      for (const code of codes) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('contextmenu', this.handleContextMenu);
  }

  /** Listener für UI-Aktionen (Pause, Neustart, Respawn, Debug) – werden sofort gemeldet. */
  onAction(listener: (action: Action) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  isDown(action: Action): boolean {
    if (this.externalHeld.has(action)) return true;
    for (const code of KEY_BINDINGS[action]) if (this.keys.has(code)) return true;
    const mouse = MOUSE_BINDINGS[action];
    if (mouse) for (const b of mouse) if (this.buttons.has(b)) return true;
    return false;
  }

  /** Meldet eine Tastendruck-Flanke von außen (z. B. Gamepad). */
  press(action: Action): void {
    if (TICK_ACTIONS.includes(action)) this.pressed.add(action);
    if (UI_ACTIONS.includes(action)) this.emitAction(action);
  }

  /** Füllt `out` mit dem aktuellen Zustand und verbraucht die gesammelten Flanken. */
  sampleTick(out: PlayerInput): PlayerInput {
    const keyX = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const keyY = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    out.moveX = Math.max(-1, Math.min(1, keyX + this.external.moveX));
    out.moveY = Math.max(-1, Math.min(1, keyY + this.external.moveY));
    out.jumpHeld = this.isDown('jump');
    out.slideHeld = this.isDown('slide');
    out.grappleHeld = this.isDown('grapple');
    out.jumpPressed = this.pressed.has('jump');
    out.slidePressed = this.pressed.has('slide');
    out.grapplePressed = this.pressed.has('grapple');
    this.pressed.clear();
    return out;
  }

  /** Liefert die seit dem letzten Aufruf gesammelte Mausbewegung in Pixeln. */
  consumeLook(): { x: number; y: number } {
    const result = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return result;
  }

  /** Vergisst alle gehaltenen Tasten (z. B. bei Pause oder Fokusverlust). */
  reset(): void {
    this.keys.clear();
    this.buttons.clear();
    this.pressed.clear();
    this.externalHeld.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    this.actionListeners.clear();
  }

  private emitAction(action: Action): void {
    for (const listener of [...this.actionListeners]) listener(action);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const actions = this.codeToActions.get(event.code);
    if (!actions) return;
    // F3 öffnet sonst die Browsersuche; im Spiel sollen Leertaste & Co. nicht scrollen.
    if (this.enabled || event.code === 'F3') event.preventDefault();
    if (event.repeat) return;
    for (const action of actions) {
      if (UI_ACTIONS.includes(action)) this.emitAction(action);
    }
    if (!this.enabled) return;
    this.keys.add(event.code);
    for (const action of actions) {
      if (TICK_ACTIONS.includes(action)) this.pressed.add(action);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.enabled) return;
    this.buttons.add(event.button);
    for (const [action, buttons] of Object.entries(MOUSE_BINDINGS) as [Action, number[]][]) {
      if (buttons.includes(event.button) && TICK_ACTIONS.includes(action)) this.pressed.add(action);
    }
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.buttons.delete(event.button);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.enabled) return;
    const locked = document.pointerLockElement === this.lockElement;
    const dragging = this.dragLook && (event.buttons & 1) !== 0;
    if (!locked && !dragging) return;
    if (
      Math.abs(event.movementX) > MAX_MOUSE_DELTA ||
      Math.abs(event.movementY) > MAX_MOUSE_DELTA
    ) {
      return;
    }
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly handleBlur = (): void => {
    this.reset();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    // Rechtsklick ist der Grappling Hook – kein Kontextmenü im Spiel.
    if (this.enabled || event.target === this.lockElement) event.preventDefault();
  };
}
