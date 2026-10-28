import type { PlayerInput } from '../../src/core/Input';
import type { LevelData } from '../../src/level/types';
import { MoveState } from '../../src/player/MoveState';
import { createLevelSim, type Sim } from './sim';

/**
 * Ein Schritt einer Bot-Route: Eingaben setzen, optional einmalig Tasten „drücken“,
 * Blickrichtung steuern und laufen lassen, bis die Bedingung erfüllt ist.
 */
export interface RouteStep {
  name: string;
  /** Gehaltene Eingaben während des Schritts (nicht genannte bleiben wie im vorigen Schritt). */
  hold?: Partial<Pick<PlayerInput, 'moveX' | 'moveY' | 'jumpHeld' | 'slideHeld' | 'grappleHeld'>>;
  /** Einmalige Tastendrücke zu Beginn des Schritts (setzt auch den Halte-Zustand). */
  press?: ('jump' | 'slide' | 'grapple')[];
  /** Feste Blickrichtung in Grad. */
  yaw?: number;
  pitch?: number;
  /** Laufrichtung jeden Tick auf diesen Punkt (x, z) ausrichten. */
  toward?: readonly [number, number];
  /** Blick jeden Tick auf diesen Punkt richten (z. B. Grapple-Punkt). */
  lookAt?: readonly [number, number, number];
  /** Optionale Logik pro Tick (z. B. Wall-Jump-Rhythmus). */
  each?: (s: Sim) => void;
  until: (s: Sim) => boolean;
  /** Maximale Dauer in Sekunden. */
  timeout?: number;
}

export interface RouteResult {
  finished: boolean;
  /** Spielzeit bis zum Ziel in Sekunden. */
  time: number;
  failedStep: string | null;
  deaths: number;
  log: string[];
}

const DEG = Math.PI / 180;

function aim(s: Sim, step: RouteStep): void {
  const eye = s.player.eyePosition(s.player.feet.clone());
  if (step.lookAt) {
    const [x, y, z] = step.lookAt;
    s.view.yaw = Math.atan2(-(x - eye.x), -(z - eye.z));
    s.view.pitch = Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z));
  } else if (step.toward) {
    const [x, z] = step.toward;
    s.view.yaw = Math.atan2(-(x - eye.x), -(z - eye.z));
  }
}

/** Spielt eine Route im vollständigen Level ab (ohne Respawn: Tod = Fehlschlag). */
export async function runRoute(level: LevelData, steps: RouteStep[]): Promise<RouteResult> {
  const s = await createLevelSim(level);
  const log: string[] = [];
  const result: RouteResult = { finished: false, time: 0, failedStep: null, deaths: 0, log };
  s.until(() => s.player.state === MoveState.Grounded, 240);
  try {
    for (const step of steps) {
      Object.assign(s.input, step.hold ?? {});
      for (const key of step.press ?? []) {
        if (key === 'jump') {
          s.input.jumpPressed = true;
          s.input.jumpHeld = true;
        } else if (key === 'slide') {
          s.input.slidePressed = true;
          s.input.slideHeld = true;
        } else {
          s.input.grapplePressed = true;
          s.input.grappleHeld = true;
        }
      }
      if (step.yaw !== undefined) s.view.yaw = step.yaw * DEG;
      if (step.pitch !== undefined) s.view.pitch = step.pitch * DEG;
      const maxTicks = Math.round((step.timeout ?? 6) * 60);
      let done = false;
      for (let i = 0; i < maxTicks; i++) {
        aim(s, step);
        step.each?.(s);
        if (step.until(s)) {
          done = true;
          break;
        }
        s.step();
        const death = s.triggers.find((t) => t.event.type === 'death');
        if (death) {
          result.deaths++;
          const p = s.player.feet;
          result.failedStep = `${step.name} (Tod bei ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
          return result;
        }
        const goal = s.triggers.find((t) => t.event.type === 'goal');
        if (goal) {
          result.finished = true;
          result.time = goal.tick / 60;
          return result;
        }
      }
      const p = s.player.feet;
      log.push(
        `${step.name}: ${done ? 'ok' : 'TIMEOUT'} @ tick ${s.tick} pos ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} state ${s.player.state} v ${s.player.horizontalSpeed.toFixed(1)}`,
      );
      if (!done) {
        result.failedStep = `${step.name} (Timeout bei ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}, ${s.player.state})`;
        return result;
      }
    }
    // Nach dem letzten Schritt noch bis zum Ziel weiterlaufen lassen.
    for (let i = 0; i < 600; i++) {
      s.step();
      const goal = s.triggers.find((t) => t.event.type === 'goal');
      if (goal) {
        result.finished = true;
        result.time = goal.tick / 60;
        return result;
      }
      if (s.triggers.some((t) => t.event.type === 'death')) {
        result.failedStep = 'Zielanlauf (Tod)';
        return result;
      }
    }
    result.failedStep = 'Ziel nicht erreicht';
    return result;
  } finally {
    s.dispose();
  }
}

/** Bedingungen für Routen-Schritte. */
export const at = {
  zBelow: (z: number) => (s: Sim) => s.player.feet.z < z,
  grounded: () => (s: Sim) =>
    s.player.state === MoveState.Grounded || s.player.state === MoveState.Sliding,
  state: (state: MoveState) => (s: Sim) => s.player.state === state,
  notState: (state: MoveState) => (s: Sim) => s.player.state !== state,
  yAbove: (y: number) => (s: Sim) => s.player.feet.y > y,
  landedAbove: (y: number) => (s: Sim) =>
    (s.player.state === MoveState.Grounded || s.player.state === MoveState.Sliding) &&
    s.player.feet.y > y,
  ticks: (n: number) => {
    let left = n;
    return () => left-- <= 0;
  },
};
