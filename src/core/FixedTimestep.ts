/**
 * Akkumulator für einen festen Physik-Takt (z. B. 60 Hz) bei variabler Bildrate.
 *
 * Pro Frame wird die vergangene Zeit hinzugefügt; {@link advance} liefert die Anzahl fälliger
 * Physik-Schritte. Der Rest steht als {@link alpha} (0…1) für die Render-Interpolation bereit.
 */
export class FixedTimestep {
  readonly dt: number;
  private accumulator = 0;

  /**
   * @param hz Physik-Takt in Hertz.
   * @param maxFrameTime Längere Frames (Tab im Hintergrund, Ruckler) werden auf diesen Wert gekappt.
   * @param maxStepsPerFrame Schutz vor der „Spiral of Death“ auf langsamen Geräten.
   */
  constructor(
    hz: number,
    private readonly maxFrameTime = 0.25,
    private readonly maxStepsPerFrame = 8,
  ) {
    this.dt = 1 / hz;
  }

  /** Fügt Frame-Zeit (Sekunden) hinzu und liefert die Anzahl jetzt auszuführender Schritte. */
  advance(frameTime: number): number {
    const clamped = Math.min(Math.max(frameTime, 0), this.maxFrameTime);
    this.accumulator = Math.min(this.accumulator + clamped, this.maxStepsPerFrame * this.dt);
    // Kleines Epsilon gegen Rundungsfehler (60 × 1/60 soll genau 60 Schritte ergeben).
    const steps = Math.floor(this.accumulator / this.dt + 1e-6);
    this.accumulator = Math.max(0, this.accumulator - steps * this.dt);
    return steps;
  }

  /** Anteil des angebrochenen Schritts (0…1) für die Interpolation zwischen zwei Physik-Zuständen. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.dt);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
