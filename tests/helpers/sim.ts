import { MOVEMENT, type MovementConfig } from '../../src/config/movement';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/events';
import { createPlayerInput, type PlayerInput } from '../../src/core/Input';
import { initPhysics } from '../../src/core/Physics';
import { Level } from '../../src/level/Level';
import type { LevelData, LevelElement } from '../../src/level/types';
import { PlayerController, type PlayerView } from '../../src/player/PlayerController';

/**
 * Headless-Simulation von Level + Spieler für Tests (Rapier läuft auch in Node).
 * Eingaben werden pro Tick über `input` gesetzt; Flanken (…Pressed) werden nach jedem Tick gelöscht.
 */
export interface Sim {
  level: Level;
  player: PlayerController;
  input: PlayerInput;
  view: PlayerView;
  events: EventBus<GameEvents>;
  log: { type: keyof GameEvents; payload: unknown; tick: number }[];
  tick: number;
  readonly dt: number;
  step(ticks?: number): void;
  /** Läuft, bis `predicate` wahr ist (max. `maxTicks`). Liefert die benötigten Ticks oder -1. */
  until(predicate: () => boolean, maxTicks?: number): number;
  dispose(): void;
}

export async function createSim(
  elements: LevelElement[],
  spawn: LevelData['spawn'] = { pos: [0, 0, 0], yaw: 0 },
  cfg: MovementConfig = MOVEMENT,
): Promise<Sim> {
  await initPhysics();
  const data: LevelData = {
    id: 'test',
    name: 'Test',
    subtitle: '',
    difficulty: 1,
    spawn,
    killY: -100,
    elements,
  };
  const level = new Level(data, cfg.physicsHz);
  const events = new EventBus<GameEvents>();
  const player = new PlayerController(level.physics, events, cfg, level.spawnFeet);
  const input = createPlayerInput();
  const view: PlayerView = { yaw: level.spawnYaw, pitch: 0 };
  const log: Sim['log'] = [];
  const types: (keyof GameEvents)[] = ['stateChange', 'jump', 'land', 'footstep'];

  const sim: Sim = {
    level,
    player,
    input,
    view,
    events,
    log,
    tick: 0,
    dt: 1 / cfg.physicsHz,
    step(ticks = 1) {
      for (let i = 0; i < ticks; i++) {
        level.fixedUpdate(sim.dt);
        level.physics.step();
        player.fixedUpdate(sim.dt, input, view);
        input.jumpPressed = false;
        input.slidePressed = false;
        input.grapplePressed = false;
        sim.tick++;
      }
    },
    until(predicate, maxTicks = 600) {
      for (let i = 0; i < maxTicks; i++) {
        if (predicate()) return i;
        sim.step();
      }
      return predicate() ? maxTicks : -1;
    },
    dispose() {
      player.dispose();
      level.dispose();
    },
  };
  for (const type of types) {
    events.on(type, (payload) => log.push({ type, payload, tick: sim.tick }));
  }
  return sim;
}

/** Großer flacher Boden mit Oberkante y = 0. */
export const FLOOR: LevelElement = { type: 'platform', pos: [0, -0.5, 0], size: [200, 1, 200] };
