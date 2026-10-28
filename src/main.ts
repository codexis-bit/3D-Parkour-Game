import './style.css';
import { GAME } from './config/game';
import { Game, type TestControls } from './core/Game';
import { findLevel, LEVELS } from './level/levels';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('DOM-Grundgerüst fehlt');

  const loading = document.createElement('div');
  loading.className = 'boot-overlay';
  loading.innerHTML = `<div><h1>${GAME.name}</h1>Lade Physik …</div>`;
  ui.append(loading);

  const game = new Game(canvas, ui);
  await game.init();
  const requested = new URLSearchParams(location.search).get('level');
  game.loadLevel((requested ? findLevel(requested) : undefined) ?? LEVELS[0]!);
  loading.remove();
  game.start();

  if (new URLSearchParams(location.search).has('test')) {
    window.momentumTest = game.enableTestControls();
  }
}

declare global {
  interface Window {
    /** Test-Hook für automatisierte Browser-Tests (nur mit `?test` in der URL). */
    momentumTest?: TestControls;
  }
}

boot().catch((error: unknown) => {
  console.error(error);
  const ui = document.querySelector('#ui');
  if (ui) {
    const message = error instanceof Error ? error.message : String(error);
    ui.innerHTML = `<div class="fatal-error"><div><h2>Start fehlgeschlagen</h2><p></p>
      <p>Bitte verwende einen aktuellen Browser mit WebGL2-Unterstützung.</p></div></div>`;
    const p = ui.querySelector('.fatal-error p');
    if (p) p.textContent = message;
  }
});
