import { describe, expect, it } from 'vitest';
import { GAMEPAD } from '../src/config/input';
import type { Action } from '../src/config/input';
import { applyDeadzone, GamepadInput, type GamepadSink, type PadState } from '../src/core/Gamepad';

/** Simuliertes Gamepad im Standard-Mapping (17 Tasten, 4 Achsen). */
function createPad(): {
  pad: PadState;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
} {
  const axes = [0, 0, 0, 0];
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  return { pad: { connected: true, mapping: 'standard', axes, buttons }, axes, buttons };
}

function createSink(): GamepadSink & { presses: Action[] } {
  const presses: Action[] = [];
  return {
    external: { moveX: 0, moveY: 0 },
    externalHeld: new Set<Action>(),
    presses,
    press: (action) => presses.push(action),
  };
}

function hold(buttons: { pressed: boolean; value: number }[], index: number, down: boolean): void {
  const button = buttons[index];
  if (!button) throw new Error(`Taste ${index} fehlt`);
  button.pressed = down;
  button.value = down ? 1 : 0;
}

describe('applyDeadzone', () => {
  it('liefert innerhalb der Deadzone 0 und skaliert außerhalb neu', () => {
    const out = { x: 0, y: 0 };
    expect(applyDeadzone(0.1, 0.05, 0.16, out)).toEqual({ x: 0, y: 0 });
    applyDeadzone(1, 0, 0.16, out);
    expect(out.x).toBeCloseTo(1);
    applyDeadzone(0.58, 0, 0.16, out);
    expect(out.x).toBeCloseTo(0.5);
  });

  it('behält die Richtung bei und begrenzt den Betrag auf 1', () => {
    const out = applyDeadzone(1, 1, 0.16, { x: 0, y: 0 });
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1);
    expect(out.x).toBeCloseTo(out.y);
  });
});

describe('GamepadInput', () => {
  it('linker Stick bewegt (oben = vorwärts), ohne aktives Spiel nicht', () => {
    const { pad, axes } = createPad();
    const sink = createSink();
    const gamepad = new GamepadInput(sink, () => [pad]);
    axes[0] = 1;
    axes[1] = -1;
    gamepad.poll(1 / 60, true);
    expect(sink.external.moveX).toBeGreaterThan(0.6);
    expect(sink.external.moveY).toBeGreaterThan(0.6);
    gamepad.poll(1 / 60, false);
    expect(sink.external).toEqual({ moveX: 0, moveY: 0 });
  });

  it('meldet einen Tastendruck genau einmal und hält ihn, solange die Taste unten ist', () => {
    const { pad, buttons } = createPad();
    const sink = createSink();
    const gamepad = new GamepadInput(sink, () => [pad]);
    hold(buttons, 0, true);
    gamepad.poll(1 / 60, true);
    gamepad.poll(1 / 60, true);
    expect(sink.presses).toEqual(['jump']);
    expect(sink.externalHeld.has('jump')).toBe(true);
    hold(buttons, 0, false);
    gamepad.poll(1 / 60, true);
    expect(sink.externalHeld.has('jump')).toBe(false);
  });

  it('gibt im Menü nur UI-Aktionen weiter (Neustart ja, Sprung nein)', () => {
    const { pad, buttons } = createPad();
    const sink = createSink();
    const gamepad = new GamepadInput(sink, () => [pad]);
    hold(buttons, 0, true);
    hold(buttons, 8, true);
    gamepad.poll(1 / 60, false);
    expect(sink.presses).toEqual(['restart']);
    expect(sink.externalHeld.size).toBe(0);
  });

  it('wertet analoge Trigger erst ab der Schwelle als Grapple', () => {
    const { pad, buttons } = createPad();
    const sink = createSink();
    const gamepad = new GamepadInput(sink, () => [pad]);
    const rt = buttons[7];
    if (!rt) throw new Error('RT fehlt');
    rt.value = GAMEPAD.triggerThreshold * 0.5;
    gamepad.poll(1 / 60, true);
    expect(sink.presses).toEqual([]);
    rt.value = 0.9;
    gamepad.poll(1 / 60, true);
    expect(sink.presses).toEqual(['grapple']);
  });

  it('rechter Stick dreht den Blick (rechts = Yaw nimmt ab, oben = Pitch nimmt zu)', () => {
    const { pad, axes } = createPad();
    const gamepad = new GamepadInput(createSink(), () => [pad]);
    axes[2] = 1;
    axes[3] = -1;
    const look = gamepad.poll(0.1, true);
    expect(look.yaw).toBeLessThan(0);
    expect(look.pitch).toBeGreaterThan(0);
    const full = look.yaw;
    gamepad.sensitivity = 2;
    expect(gamepad.poll(0.1, true).yaw).toBeCloseTo(full * 2);
  });

  it('ohne Gamepad passiert nichts', () => {
    const sink = createSink();
    const gamepad = new GamepadInput(sink, () => [null]);
    expect(gamepad.poll(1 / 60, true)).toEqual({ yaw: 0, pitch: 0 });
    expect(gamepad.connected).toBe(false);
    expect(sink.presses).toEqual([]);
  });
});
