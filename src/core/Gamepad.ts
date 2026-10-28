import { GAMEPAD, GAMEPAD_BINDINGS, UI_ACTIONS, type Action } from '../config/input';

/** Was ein Gamepad liefert – strukturell kompatibel zur DOM-Klasse `Gamepad`. */
export interface PadState {
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

/** Ziel für Gamepad-Eingaben (implementiert von {@link Input}). */
export interface GamepadSink {
  readonly external: { moveX: number; moveY: number };
  readonly externalHeld: Set<Action>;
  press(action: Action): void;
}

/** Blickdrehung eines Frames in Radiant. */
export interface LookDelta {
  yaw: number;
  pitch: number;
}

/** Radiale Deadzone mit Neuskalierung: knapp außerhalb der Deadzone beginnt der Wert bei 0. */
export function applyDeadzone(
  x: number,
  y: number,
  deadzone: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= deadzone || length === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const scaled = Math.min(1, (length - deadzone) / (1 - deadzone));
  out.x = (x / length) * scaled;
  out.y = (y / length) * scaled;
  return out;
}

const BOUND_ACTIONS = Object.entries(GAMEPAD_BINDINGS) as [Action, readonly number[]][];

function defaultPads(): readonly (PadState | null)[] {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
    ? navigator.getGamepads()
    : [];
}

/**
 * Fragt pro Frame das erste angeschlossene Gamepad ab: linker Stick läuft, rechter Stick schaut,
 * Tasten werden als gehaltene Aktionen bzw. Flanken an {@link GamepadSink} weitergegeben.
 */
export class GamepadInput {
  /** Faktor auf die Blickgeschwindigkeit (Optionsmenü). */
  sensitivity = 1;
  /** War im letzten Frame ein Gamepad verbunden? */
  connected = false;

  private readonly previous = new Set<Action>();
  private readonly held = new Set<Action>();
  private readonly look: LookDelta = { yaw: 0, pitch: 0 };
  private readonly stick = { x: 0, y: 0 };

  constructor(
    private readonly sink: GamepadSink,
    private readonly getPads: () => readonly (PadState | null)[] = defaultPads,
  ) {}

  /**
   * @param active Spiel läuft – sonst werden nur UI-Aktionen (Neustart, Pause …) weitergegeben.
   * @returns Blickdrehung für diesen Frame (rad).
   */
  poll(dt: number, active: boolean): LookDelta {
    const look = this.look;
    look.yaw = 0;
    look.pitch = 0;
    const pad = this.firstPad();
    this.connected = pad !== null;

    this.held.clear();
    if (pad) {
      for (const [action, indices] of BOUND_ACTIONS) {
        if (indices.some((i) => this.isPressed(pad, i))) this.held.add(action);
      }
    }

    for (const [action] of BOUND_ACTIONS) {
      const down = this.held.has(action);
      const isUi = UI_ACTIONS.includes(action);
      if (down && !this.previous.has(action) && (active || isUi)) this.sink.press(action);
      if (down && active && !isUi) this.sink.externalHeld.add(action);
      else this.sink.externalHeld.delete(action);
    }
    this.previous.clear();
    for (const action of this.held) this.previous.add(action);

    if (!pad || !active) {
      this.sink.external.moveX = 0;
      this.sink.external.moveY = 0;
      return look;
    }

    const move = applyDeadzone(
      pad.axes[0] ?? 0,
      pad.axes[1] ?? 0,
      GAMEPAD.stickDeadzone,
      this.stick,
    );
    this.sink.external.moveX = move.x;
    this.sink.external.moveY = -move.y;

    const aim = applyDeadzone(
      pad.axes[2] ?? 0,
      pad.axes[3] ?? 0,
      GAMEPAD.stickDeadzone,
      this.stick,
    );
    const magnitude = Math.hypot(aim.x, aim.y);
    if (magnitude > 0) {
      // Kennlinie auf den Betrag anwenden, Richtung beibehalten.
      const curve = Math.pow(magnitude, GAMEPAD.lookExponent) / magnitude;
      look.yaw = -aim.x * curve * GAMEPAD.lookYawSpeed * this.sensitivity * dt;
      look.pitch = -aim.y * curve * GAMEPAD.lookPitchSpeed * this.sensitivity * dt;
    }
    return look;
  }

  private firstPad(): PadState | null {
    let fallback: PadState | null = null;
    for (const pad of this.getPads()) {
      if (!pad || !pad.connected) continue;
      if (pad.mapping === 'standard') return pad;
      fallback ??= pad;
    }
    return fallback;
  }

  private isPressed(pad: PadState, index: number): boolean {
    const button = pad.buttons[index];
    if (!button) return false;
    // Analoge Trigger (6/7) erst ab einer Schwelle, sonst reicht schon ein leichtes Antippen.
    return index === 6 || index === 7
      ? button.value >= GAMEPAD.triggerThreshold
      : button.pressed || button.value > 0.5;
  }
}
