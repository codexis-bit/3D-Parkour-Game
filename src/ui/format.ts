/**
 * Zeit- und Tempo-Formatierung für HUD und Menüs.
 */

/** Sekunden → „mm:ss.mmm“ (bzw. „h:mm:ss.mmm“ ab einer Stunde). */
export function formatTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const core = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  return h > 0 ? `${h}:${core}` : core;
}

/** Differenz zu einer Referenzzeit mit Vorzeichen, z. B. „-0.412“ oder „+1.250“. */
export function formatDelta(seconds: number): string {
  const sign = seconds < 0 ? '−' : '+';
  const abs = Math.abs(seconds);
  return `${sign}${abs >= 60 ? formatTime(abs) : abs.toFixed(3)}`;
}

/** m/s → Anzeige in der gewählten Einheit. */
export function formatSpeed(
  metersPerSecond: number,
  unit: 'ms' | 'kmh',
): { value: string; unit: string } {
  if (unit === 'kmh') return { value: Math.round(metersPerSecond * 3.6).toString(), unit: 'km/h' };
  return { value: metersPerSecond.toFixed(1), unit: 'm/s' };
}
