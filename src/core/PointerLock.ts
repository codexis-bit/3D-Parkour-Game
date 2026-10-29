/**
 * Hilfsklasse für die Pointer Lock API.
 *
 * Bevorzugt rohe Mausdaten (`unadjustedMovement`, ohne Mausbeschleunigung des Betriebssystems),
 * fällt aber auf den normalen Modus zurück, wo der Browser das nicht unterstützt.
 */
export class PointerLock {
  private readonly listeners = new Set<(locked: boolean) => void>();

  constructor(private readonly element: HTMLElement) {
    document.addEventListener('pointerlockchange', this.handleChange);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Kennt der Browser die Pointer Lock API überhaupt? (Fehlt z. B. auf Tablets.) */
  get supported(): boolean {
    return typeof this.element.requestPointerLock === 'function';
  }

  onChange(listener: (locked: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Fordert den Pointer Lock an. Muss aus einer Nutzeraktion (Klick) heraus aufgerufen werden.
   * @returns true, wenn der Lock aktiv ist.
   */
  async request(): Promise<boolean> {
    if (this.locked) return true;
    try {
      await this.element.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        // Ältere Browser kennen die Option nicht oder liefern kein Promise.
        await this.element.requestPointerLock();
      } catch {
        return false;
      }
    }
    return this.locked;
  }

  exit(): void {
    if (this.locked) document.exitPointerLock();
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.handleChange);
    this.listeners.clear();
  }

  private readonly handleChange = (): void => {
    const locked = this.locked;
    for (const listener of [...this.listeners]) listener(locked);
  };
}
