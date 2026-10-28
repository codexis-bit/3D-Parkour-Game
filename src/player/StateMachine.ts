/**
 * Generische endliche Zustandsmaschine mit expliziter Übergangstabelle.
 * Merkt sich vorherigen Zustand und die Verweildauer im aktuellen Zustand.
 */
export class StateMachine<S extends string> {
  private current: S;
  private last: S | null = null;
  private elapsed = 0;

  constructor(
    initial: S,
    private readonly transitions: Readonly<Record<S, readonly S[]>>,
    private readonly onChange?: (from: S, to: S) => void,
  ) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  get previous(): S | null {
    return this.last;
  }

  /** Sekunden seit dem letzten Zustandswechsel. */
  get timeInState(): number {
    return this.elapsed;
  }

  is(state: S): boolean {
    return this.current === state;
  }

  canTransition(to: S): boolean {
    return this.transitions[this.current].includes(to);
  }

  /**
   * Wechselt in `to`, sofern der Übergang erlaubt ist.
   * @returns true bei erfolgtem Wechsel, false wenn bereits im Zustand oder der Übergang verboten ist.
   */
  transition(to: S): boolean {
    if (to === this.current || !this.canTransition(to)) return false;
    this.apply(to);
    return true;
  }

  /** Erzwingt einen Zustand ohne Prüfung der Tabelle (z. B. beim Respawn). */
  force(to: S): void {
    if (to === this.current) {
      this.elapsed = 0;
      return;
    }
    this.apply(to);
  }

  tick(dt: number): void {
    this.elapsed += dt;
  }

  private apply(to: S): void {
    const from = this.current;
    this.last = from;
    this.current = to;
    this.elapsed = 0;
    this.onChange?.(from, to);
  }
}
