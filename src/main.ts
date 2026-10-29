import './style.css';
import { GAME } from './config/game';
import { Game, type TestControls } from './core/Game';
import { findLevel } from './level/levels';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('DOM-Grundgerüst fehlt');

  const loading = document.createElement('div');
  loading.className = 'boot-overlay';
  loading.innerHTML = `<div><h1>${GAME.name}</h1><p>Lade Physik …</p></div>`;
  ui.append(loading);

  const game = new Game(canvas, ui);
  await game.init();

  const params = new URLSearchParams(location.search);
  const requested = params.get('level');
  const level = requested ? findLevel(requested) : undefined;
  // `?level=<id>` startet ein Level direkt (auch Entwickler-Levels wie die Sandbox).
  if (level) game.playLevelData(level);
  else game.showMainMenu();
  loading.remove();
  game.start();

  if (params.has('test')) window.momentumTest = game.enableTestControls();
}

declare global {
  interface Window {
    /** Test-Hook für automatisierte Browser-Tests (nur mit `?test` in der URL). */
    momentumTest?: TestControls;
  }
}

/** Ratschlag passend zur Fehlerursache (blockiertes WebAssembly sieht sonst wie ein WebGL-Problem aus). */
function startupAdvice(message: string): string {
  if (/WebAssembly|wasm/i.test(message)) {
    return 'Die Physik-Engine (WebAssembly) darf in dieser Umgebung nicht starten. Öffne MOMENTUM in einem normalen Browser-Tab, lokal mit npm run dev oder über GitHub Pages.';
  }
  return 'Bitte verwende einen aktuellen Browser mit WebGL2-Unterstützung.';
}

boot().catch((error: unknown) => {
  console.error(error);
  const ui = document.querySelector('#ui');
  if (ui) {
    const message = error instanceof Error ? error.message : String(error);
    ui.innerHTML = `<div class="fatal-error"><div><h2>Start fehlgeschlagen</h2>
      <p class="fatal-error__advice"></p><p class="fatal-error__detail"></p></div></div>`;
    const advice = ui.querySelector('.fatal-error__advice');
    const detail = ui.querySelector('.fatal-error__detail');
    if (advice) advice.textContent = startupAdvice(message);
    if (detail) detail.textContent = message;
  }
});
