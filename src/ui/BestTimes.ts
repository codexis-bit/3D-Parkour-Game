import { readJson, removeKey, writeJson, type KeyValueStore } from '../core/storage';

const STORAGE_KEY = 'bestTimes.v1';

export interface RunResult {
  time: number;
  /** Bestzeit vor diesem Lauf (null = erster Abschluss). */
  previousBest: number | null;
  best: number;
  newRecord: boolean;
}

/** Bestzeiten pro Level im localStorage (Sekunden). */
export class BestTimes {
  private times: Record<string, number>;

  constructor(private readonly store: KeyValueStore) {
    const raw = readJson<unknown>(store, STORAGE_KEY, {});
    this.times = {};
    if (typeof raw === 'object' && raw !== null) {
      for (const [id, value] of Object.entries(raw)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0)
          this.times[id] = value;
      }
    }
  }

  get(levelId: string): number | null {
    return this.times[levelId] ?? null;
  }

  /** Hat der Spieler das Level schon einmal abgeschlossen? */
  completed(levelId: string): boolean {
    return this.get(levelId) !== null;
  }

  /** Trägt einen Lauf ein und meldet, ob er ein neuer Rekord ist. */
  submit(levelId: string, time: number): RunResult {
    const previousBest = this.get(levelId);
    const newRecord = previousBest === null || time < previousBest;
    if (newRecord) {
      this.times[levelId] = time;
      writeJson(this.store, STORAGE_KEY, this.times);
    }
    return { time, previousBest, best: newRecord ? time : (previousBest ?? time), newRecord };
  }

  clear(): void {
    this.times = {};
    removeKey(this.store, STORAGE_KEY);
  }
}
