import { describe, expect, it } from 'vitest';
import { MOVE_TRANSITIONS, MoveState } from '../src/player/MoveState';
import { StateMachine } from '../src/player/StateMachine';

describe('StateMachine', () => {
  it('erlaubt nur Übergänge aus der Tabelle', () => {
    const fsm = new StateMachine<MoveState>(MoveState.Grounded, MOVE_TRANSITIONS);
    expect(fsm.transition(MoveState.WallRunning)).toBe(false);
    expect(fsm.state).toBe(MoveState.Grounded);
    expect(fsm.transition(MoveState.Airborne)).toBe(true);
    expect(fsm.state).toBe(MoveState.Airborne);
    expect(fsm.previous).toBe(MoveState.Grounded);
  });

  it('zählt die Zeit im Zustand und setzt sie beim Wechsel zurück', () => {
    const fsm = new StateMachine<MoveState>(MoveState.Airborne, MOVE_TRANSITIONS);
    fsm.tick(0.5);
    expect(fsm.timeInState).toBeCloseTo(0.5);
    fsm.transition(MoveState.Grounded);
    expect(fsm.timeInState).toBe(0);
  });

  it('meldet Wechsel an den Callback und ignoriert Selbstübergänge', () => {
    const changes: string[] = [];
    const fsm = new StateMachine<MoveState>(MoveState.Airborne, MOVE_TRANSITIONS, (a, b) =>
      changes.push(`${a}>${b}`),
    );
    fsm.transition(MoveState.Airborne);
    fsm.transition(MoveState.WallRunning);
    fsm.force(MoveState.Vaulting);
    expect(changes).toEqual(['airborne>wallRunning', 'wallRunning>vaulting']);
  });

  it('jeder Zustand ist erreichbar und kann wieder verlassen werden', () => {
    const states = Object.values(MoveState);
    for (const s of states) {
      expect(MOVE_TRANSITIONS[s].length).toBeGreaterThan(0);
      const reachable = states.some((other) => MOVE_TRANSITIONS[other].includes(s));
      expect(reachable).toBe(true);
    }
  });
});
