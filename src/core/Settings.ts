import { CAMERA } from '../config/camera';
import type { QualityLevel } from '../config/render';
import { clamp } from './math';
import { readJson, writeJson, type KeyValueStore } from './storage';

/** Alle Einstellungen aus dem Optionsmenü. */
export interface Settings {
  /** Maus-Empfindlichkeit (Faktor). */
  sensitivity: number;
  invertY: boolean;
  /** Horizontales Sichtfeld in Grad. */
  fov: number;
  /** Gesamtlautstärke 0…1. */
  volume: number;
  headBob: boolean;
  cameraShake: boolean;
  /** FOV-Erhöhung bei hohem Tempo. */
  dynamicFov: boolean;
  speedUnit: 'ms' | 'kmh';
  quality: QualityLevel;
  /** Gamepad-Blickempfindlichkeit (Faktor). */
  gamepadSensitivity: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: CAMERA.fov.default,
  volume: 0.7,
  headBob: true,
  cameraShake: true,
  dynamicFov: true,
  speedUnit: 'kmh',
  quality: 'high',
  gamepadSensitivity: 1,
};

const STORAGE_KEY = 'settings.v1';
const QUALITIES: readonly QualityLevel[] = ['low', 'medium', 'high'];

/** Repariert geladene Werte (fehlende Felder, Ausreißer, falsche Typen). */
export function sanitizeSettings(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<
    Record<keyof Settings, unknown>
  >;
  const num = (value: unknown, fallback: number, min: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;
  const d = DEFAULT_SETTINGS;
  return {
    sensitivity: num(input.sensitivity, d.sensitivity, 0.1, 5),
    invertY: bool(input.invertY, d.invertY),
    fov: num(input.fov, d.fov, CAMERA.fov.min, CAMERA.fov.max),
    volume: num(input.volume, d.volume, 0, 1),
    headBob: bool(input.headBob, d.headBob),
    cameraShake: bool(input.cameraShake, d.cameraShake),
    dynamicFov: bool(input.dynamicFov, d.dynamicFov),
    speedUnit:
      input.speedUnit === 'ms' || input.speedUnit === 'kmh' ? input.speedUnit : d.speedUnit,
    quality: QUALITIES.includes(input.quality as QualityLevel)
      ? (input.quality as QualityLevel)
      : d.quality,
    gamepadSensitivity: num(input.gamepadSensitivity, d.gamepadSensitivity, 0.1, 5),
  };
}

/** Lädt, speichert und verteilt Einstellungen an alle Interessenten. */
export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly store: KeyValueStore) {
    this.value = sanitizeSettings(readJson<unknown>(store, STORAGE_KEY, {}));
  }

  get current(): Readonly<Settings> {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    writeJson(this.store, STORAGE_KEY, this.value);
    for (const listener of [...this.listeners]) listener(this.value);
  }

  reset(): void {
    this.update(DEFAULT_SETTINGS);
  }

  /** Meldet Änderungen; wird sofort einmal mit dem aktuellen Stand aufgerufen. */
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    listener(this.value);
    return () => this.listeners.delete(listener);
  }
}
