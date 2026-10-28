/**
 * Lauf-Timer im Physik-Takt (deterministisch, unabhängig von der Bildrate).
 *
 * - Startet erst mit der ersten Eingabe ({@link arm} → {@link start}).
 * - Jeder Physik-Tick addiert genau `dt`.
 * - Die Zielzeit wird auf den Bruchteil des Ticks genau bestimmt, in dem die Ziellinie
 *   überquert wurde – so sind Zeiten auf die Millisekunde vergleichbar.
 */
export class RunTimer {
  private elapsed = 0;
  private before = 0;
  private state: 'idle' | 'armed' | 'running' | 'finished' = 'idle';
  private result: number | null = null;

  /** Bereit machen: Die Zeit startet mit dem nächsten {@link start}. */
  arm(): void {
    this.elapsed = 0;
    this.before = 0;
    this.result = null;
    this.state = 'armed';
  }

  /** Startet die Zeit, falls bereit (z. B. bei der ersten Bewegung). */
  start(): boolean {
    if (this.state !== 'armed') return false;
    this.state = 'running';
    return true;
  }

  /** Ein Physik-Tick. */
  tick(dt: number): void {
    if (this.state !== 'running') return;
    this.before = this.elapsed;
    this.elapsed += dt;
  }

  /**
   * Beendet den Lauf. `fraction` (0…1) gibt an, wann im zuletzt gezählten Tick die Ziellinie
   * überquert wurde.
   * @returns Endzeit in Sekunden.
   */
  finish(fraction: number): number {
    if (this.state !== 'running') return this.result ?? 0;
    const tickLength = this.elapsed - this.before;
    this.result = this.before + Math.min(1, Math.max(0, fraction)) * tickLength;
    this.elapsed = this.result;
    this.state = 'finished';
    return this.result;
  }

  stop(): void {
    this.state = 'idle';
  }

  get running(): boolean {
    return this.state === 'running';
  }

  get armed(): boolean {
    return this.state === 'armed';
  }

  get finished(): boolean {
    return this.state === 'finished';
  }

  /** Aktuelle Zeit in Sekunden. */
  get time(): number {
    return this.elapsed;
  }
}
