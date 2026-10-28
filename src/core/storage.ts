import { GAME } from '../config/game';

/** Minimales Key-Value-Interface – im Browser localStorage, in Tests eine Map. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-Memory-Ersatz, falls localStorage fehlt oder blockiert ist (Privatmodus, Tests). */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** localStorage, wenn nutzbar – sonst ein flüchtiger Speicher (das Spiel läuft trotzdem). */
export function defaultStore(): KeyValueStore {
  try {
    const probe = `${GAME.storagePrefix}probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return new MemoryStore();
  }
}

/** Liest JSON robust: kaputte oder fehlende Werte ergeben `fallback`. */
export function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  try {
    const raw = store.getItem(GAME.storagePrefix + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  try {
    store.setItem(GAME.storagePrefix + key, JSON.stringify(value));
  } catch {
    // Speicher voll oder blockiert – Fortschritt geht dann nur in dieser Sitzung verloren.
  }
}

export function removeKey(store: KeyValueStore, key: string): void {
  try {
    store.removeItem(GAME.storagePrefix + key);
  } catch {
    // ignorieren
  }
}
