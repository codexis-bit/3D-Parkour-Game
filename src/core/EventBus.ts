/**
 * Minimaler, typisierter Event-Bus.
 *
 * Gameplay-Code meldet Ereignisse (Sprung, Landung, Checkpoint …), ohne zu wissen, wer zuhört –
 * Audio, Kamera-Effekte und HUD hängen sich unabhängig voneinander daran.
 */
export class EventBus<Events extends object> {
  private readonly listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  /** Registriert einen Listener und liefert eine Funktion zum Abmelden. */
  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners[type];
    if (!set) {
      set = new Set();
      this.listeners[type] = set;
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Wie {@link on}, meldet sich aber nach dem ersten Aufruf selbst ab. */
  once<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): () => void {
    const off = this.on(type, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners[type];
    if (!set || set.size === 0) return;
    // Kopie, damit Listener sich während des Aufrufs abmelden dürfen.
    for (const listener of [...set]) listener(payload);
  }

  clear(): void {
    for (const key of Object.keys(this.listeners) as (keyof Events)[]) {
      this.listeners[key]?.clear();
    }
  }
}
