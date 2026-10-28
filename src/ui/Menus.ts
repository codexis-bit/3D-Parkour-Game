import { CAMERA } from '../config/camera';
import { GAME } from '../config/game';
import { QUALITY_PRESETS, type QualityLevel } from '../config/render';
import type { Settings, SettingsStore } from '../core/Settings';
import type { LevelData } from '../level/types';
import type { BestTimes, RunResult } from './BestTimes';
import { button, el } from './dom';
import { formatDelta, formatTime } from './format';

/** Aktionen, die die Menüs am Spiel auslösen. */
export interface MenuActions {
  /** „Spielen“: erstes noch nicht geschafftes Level. */
  play(): void;
  playLevel(id: string): void;
  resume(): void;
  restart(): void;
  nextLevel(): void;
  quitToMenu(): void;
}

export type ScreenId = 'main' | 'levels' | 'options' | 'controls' | 'pause' | 'finish' | 'click';

export interface FinishInfo {
  level: LevelData;
  result: RunResult;
  hasNext: boolean;
}

const DIFFICULTY_LABEL = ['', 'Leicht', 'Mittel', 'Schwer'] as const;

/** Tabelle für den Steuerungs-Bildschirm. */
const CONTROLS: readonly [string, string, string][] = [
  ['Laufen', 'W A S D', 'Linker Stick'],
  ['Umsehen', 'Maus', 'Rechter Stick'],
  ['Springen / Wall Jump', 'Leertaste', 'A'],
  ['Sliden / Ducken', 'Shift · Strg · C', 'B / L3'],
  ['Grappling Hook (halten)', 'Rechtsklick · E', 'RT / RB'],
  ['Zum Checkpoint', 'R', 'Y'],
  ['Level neu starten', 'T', 'Select / Back'],
  ['Pause', 'Esc · P', 'Start'],
  ['Debug-Anzeige', 'F3', '—'],
];

const TIPS: readonly string[] = [
  'Slide bergab, um Tempo aufzubauen – ein Slide-Jump behält den Schwung.',
  'Ein Wall Run endet nach 1,5 s. Spring vorher ab, um die nächste Wand zu erreichen.',
  'Lass das Seil im Swing in der Aufwärtsbewegung los – so fliegst du am weitesten.',
  'Drück die Sprungtaste kurz vor der Landung: Der Sprung wird gemerkt (Jump Buffer).',
  'Kurz nach einer Kante kannst du noch springen (Coyote Time).',
  'Mit T startest du ein Level sofort neu – ideal für Speedruns.',
];

/**
 * Alle Menü-Bildschirme als DOM-Overlay über der 3D-Szene. Bildschirme liegen auf einem Stapel,
 * „Zurück“ bzw. Esc kehrt zum vorherigen zurück.
 */
export class Menus {
  readonly root: HTMLDivElement;
  private readonly stack: ScreenId[] = [];
  private finishInfo: FinishInfo | null = null;
  private levels: readonly LevelData[] = [];
  private nextUp: LevelData | null = null;

  constructor(
    parent: HTMLElement,
    private readonly settings: SettingsStore,
    private readonly bestTimes: BestTimes,
    private readonly actions: MenuActions,
  ) {
    this.root = el('div', { className: 'menus', attrs: { 'aria-live': 'polite' } });
    this.root.hidden = true;
    parent.append(this.root);
    window.addEventListener('keydown', this.handleKey);
  }

  get current(): ScreenId | null {
    return this.stack.at(-1) ?? null;
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  setLevels(levels: readonly LevelData[], nextUp: LevelData | null): void {
    this.levels = levels;
    this.nextUp = nextUp;
    if (this.current === 'main' || this.current === 'levels') this.render();
  }

  /** Öffnet einen Bildschirm; `replace` leert vorher den Stapel. */
  show(screen: ScreenId, replace = false): void {
    if (replace) this.stack.length = 0;
    this.stack.push(screen);
    this.render();
  }

  showFinish(info: FinishInfo): void {
    this.finishInfo = info;
    this.show('finish', true);
  }

  back(): void {
    if (this.stack.length <= 1) return;
    this.stack.pop();
    this.render();
  }

  close(): void {
    this.stack.length = 0;
    this.render();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKey);
    this.root.remove();
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    const screen = this.current;
    if (!screen) return;
    if (
      event.code === 'Escape' &&
      (screen === 'levels' || screen === 'options' || screen === 'controls')
    ) {
      // Unterseiten mit Esc verlassen (Esc selbst kann den Pointer Lock nicht anfordern).
      this.back();
    } else if (screen === 'finish' && event.code === 'Enter' && this.finishInfo?.hasNext) {
      this.actions.nextLevel();
    }
  };

  private render(): void {
    const screen = this.current;
    this.root.hidden = screen === null;
    this.root.dataset.screen = screen ?? '';
    if (!screen) {
      this.root.replaceChildren();
      return;
    }
    const content = this.build(screen);
    this.root.replaceChildren(content);
    content.querySelector<HTMLButtonElement>('.btn--primary')?.focus({ preventScroll: true });
  }

  private build(screen: ScreenId): HTMLElement {
    switch (screen) {
      case 'main':
        return this.buildMain();
      case 'levels':
        return this.buildLevels();
      case 'options':
        return this.buildOptions();
      case 'controls':
        return this.buildControls();
      case 'pause':
        return this.buildPause();
      case 'finish':
        return this.buildFinish();
      case 'click':
        return el(
          'div',
          { className: 'screen screen--click', onClick: () => this.actions.resume() },
          [
            el('div', { className: 'click-card' }, [
              el('div', { className: 'click-card__title', text: 'Klicken zum Spielen' }),
              el('div', {
                className: 'click-card__hint',
                text: 'Die Maus wird für die Kamera gesperrt – Esc gibt sie wieder frei.',
              }),
            ]),
          ],
        );
    }
  }

  private panel(title: string, children: (Node | null | false)[], wide = false): HTMLElement {
    return el('div', { className: 'screen' }, [
      el('div', { className: `panel${wide ? ' panel--wide' : ''}` }, [
        el('h2', { className: 'panel__title', text: title }),
        ...children,
      ]),
    ]);
  }

  private backButton(): HTMLButtonElement {
    return button('Zurück', () => this.back(), { hint: 'Esc' });
  }

  private buildMain(): HTMLElement {
    const next = this.nextUp;
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)] ?? '';
    return el('div', { className: 'screen screen--main' }, [
      el('div', { className: 'title-block' }, [
        el('h1', { className: 'game-title', text: GAME.name }),
        el('p', { className: 'game-tagline', text: GAME.tagline }),
      ]),
      el('div', { className: 'main-buttons' }, [
        button(next ? `Spielen · ${next.name}` : 'Spielen', () => this.actions.play(), {
          primary: true,
        }),
        button('Levelauswahl', () => this.show('levels')),
        button('Optionen', () => this.show('options')),
        button('Steuerung', () => this.show('controls')),
      ]),
      el('p', { className: 'main-tip' }, [el('strong', { text: 'Tipp: ' }), tip]),
      el('p', { className: 'main-version', text: `v${GAME.version}` }),
    ]);
  }

  private buildLevels(): HTMLElement {
    const cards = this.levels.map((level, index) => {
      const best = this.bestTimes.get(level.id);
      const par = level.parTime ?? null;
      const beatPar = best !== null && par !== null && best <= par;
      const pips = el('span', {
        className: 'pips',
        attrs: { 'aria-label': `Schwierigkeit ${level.difficulty} von 3` },
      });
      for (let i = 1; i <= 3; i++)
        pips.append(el('span', { className: i <= level.difficulty ? 'pip pip--on' : 'pip' }));
      return el('div', { className: `level-card${best !== null ? ' level-card--done' : ''}` }, [
        el('div', { className: 'level-card__head' }, [
          el('span', { className: 'level-card__index', text: String(index + 1).padStart(2, '0') }),
          pips,
          el('span', {
            className: 'level-card__difficulty',
            text: DIFFICULTY_LABEL[level.difficulty],
          }),
        ]),
        el('h3', { className: 'level-card__name', text: level.name }),
        el('p', { className: 'level-card__subtitle', text: level.subtitle }),
        el('dl', { className: 'level-card__stats' }, [
          el('dt', { text: 'Bestzeit' }),
          el('dd', {
            className: beatPar ? 'is-gold' : '',
            text: best !== null ? formatTime(best) : '–',
          }),
          el('dt', { text: 'Richtzeit' }),
          el('dd', { text: par !== null ? formatTime(par) : '–' }),
        ]),
        button('Spielen', () => this.actions.playLevel(level.id), {
          primary: index === 0 && best === null,
        }),
      ]);
    });
    return this.panel(
      'Levelauswahl',
      [
        el('div', { className: 'level-grid' }, cards),
        el('div', { className: 'panel__actions' }, [this.backButton()]),
      ],
      true,
    );
  }

  private buildOptions(): HTMLElement {
    const s = this.settings.current;
    const update = (patch: Partial<Settings>): void => this.settings.update(patch);
    const rows = el('div', { className: 'options' }, [
      this.slider(
        'Maus-Empfindlichkeit',
        s.sensitivity,
        0.1,
        3,
        0.05,
        (v) => v.toFixed(2),
        (v) => update({ sensitivity: v }),
      ),
      this.toggle('Y-Achse invertieren', s.invertY, (v) => update({ invertY: v })),
      this.slider(
        'Sichtfeld (FOV)',
        s.fov,
        CAMERA.fov.min,
        CAMERA.fov.max,
        1,
        (v) => `${Math.round(v)}°`,
        (v) => update({ fov: v }),
      ),
      this.slider(
        'Lautstärke',
        s.volume,
        0,
        1,
        0.01,
        (v) => `${Math.round(v * 100)} %`,
        (v) => update({ volume: v }),
      ),
      this.toggle('Head-Bob beim Laufen', s.headBob, (v) => update({ headBob: v })),
      this.toggle('Kamera-Shake', s.cameraShake, (v) => update({ cameraShake: v })),
      this.toggle('Dynamisches FOV (Tempo)', s.dynamicFov, (v) => update({ dynamicFov: v })),
      this.select(
        'Tempo-Anzeige',
        s.speedUnit,
        [
          ['kmh', 'km/h'],
          ['ms', 'm/s'],
        ],
        (v) => update({ speedUnit: v === 'ms' ? 'ms' : 'kmh' }),
      ),
      this.select(
        'Grafikqualität',
        s.quality,
        (Object.keys(QUALITY_PRESETS) as QualityLevel[]).map((key) => [
          key,
          QUALITY_PRESETS[key].label,
        ]),
        (v) => update({ quality: v as QualityLevel }),
      ),
      this.slider(
        'Gamepad-Empfindlichkeit',
        s.gamepadSensitivity,
        0.2,
        3,
        0.05,
        (v) => v.toFixed(2),
        (v) => update({ gamepadSensitivity: v }),
      ),
    ]);
    const resetTimes = button('Bestzeiten löschen', () => {
      if (window.confirm('Alle Bestzeiten wirklich löschen?')) {
        this.bestTimes.clear();
        this.render();
      }
    });
    const resetSettings = button('Standardwerte', () => {
      this.settings.reset();
      this.render();
    });
    return this.panel('Optionen', [
      rows,
      el('div', { className: 'panel__actions' }, [resetSettings, resetTimes, this.backButton()]),
    ]);
  }

  private buildControls(): HTMLElement {
    const table = el('table', { className: 'controls-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Aktion' }),
          el('th', { text: 'Tastatur & Maus' }),
          el('th', { text: 'Gamepad' }),
        ]),
      ]),
      el(
        'tbody',
        {},
        CONTROLS.map(([action, keys, pad]) =>
          el('tr', {}, [
            el('td', { text: action }),
            el('td', { className: 'keys', text: keys }),
            el('td', { className: 'keys', text: pad }),
          ]),
        ),
      ),
    ]);
    const notes = el('ul', { className: 'controls-notes' }, [
      el('li', { text: 'Sliden klappt aus dem Sprint; langsam gedrückt duckst du dich.' }),
      el('li', { text: 'Wall Run: in der Luft seitlich an eine blaue Wand und W halten.' }),
      el('li', { text: 'Orange Kristalle ziehen dich heran, Ringe sind Schwungpunkte.' }),
      el('li', {
        text: 'Strg+W schließt in vielen Browsern den Tab – nutze zum Sliden lieber Shift oder C.',
      }),
    ]);
    return this.panel(
      'Steuerung',
      [table, notes, el('div', { className: 'panel__actions' }, [this.backButton()])],
      true,
    );
  }

  private buildPause(): HTMLElement {
    return this.panel('Pause', [
      el('div', { className: 'menu-buttons' }, [
        button('Fortsetzen', () => this.actions.resume(), { primary: true }),
        button('Neustart', () => this.actions.restart(), { hint: 'T' }),
        button('Optionen', () => this.show('options')),
        button('Steuerung', () => this.show('controls')),
        button('Levelauswahl', () => this.show('levels')),
        button('Hauptmenü', () => this.actions.quitToMenu()),
      ]),
    ]);
  }

  private buildFinish(): HTMLElement {
    const info = this.finishInfo;
    if (!info) return this.buildMain();
    const { level, result } = info;
    const par = level.parTime ?? null;
    const lines: HTMLElement[] = [];
    if (result.previousBest !== null) {
      lines.push(
        el('div', { className: 'finish-line' }, [
          el('span', { text: result.newRecord ? 'Alte Bestzeit' : 'Bestzeit' }),
          el('strong', { text: formatTime(result.newRecord ? result.previousBest : result.best) }),
          el('em', {
            className: result.time < result.previousBest ? 'is-good' : 'is-bad',
            text: formatDelta(result.time - result.previousBest),
          }),
        ]),
      );
    }
    if (par !== null) {
      lines.push(
        el('div', { className: 'finish-line' }, [
          el('span', { text: 'Richtzeit' }),
          el('strong', { text: formatTime(par) }),
          el('em', {
            className: result.time <= par ? 'is-good' : 'is-bad',
            text: formatDelta(result.time - par),
          }),
        ]),
      );
    }
    return el('div', { className: 'screen' }, [
      el('div', { className: 'panel panel--finish' }, [
        el('p', { className: 'finish-level', text: level.name }),
        el('h2', {
          className: `finish-title${result.newRecord ? ' finish-title--record' : ''}`,
          text: result.newRecord
            ? result.previousBest === null
              ? 'Geschafft!'
              : 'Neuer Rekord!'
            : 'Ziel erreicht',
        }),
        el('div', { className: 'finish-time', text: formatTime(result.time) }),
        el('div', { className: 'finish-lines' }, lines),
        el('div', { className: 'menu-buttons menu-buttons--row' }, [
          info.hasNext
            ? button('Nächstes Level', () => this.actions.nextLevel(), {
                primary: true,
                hint: 'Enter',
              })
            : null,
          button('Nochmal', () => this.actions.restart(), { primary: !info.hasNext, hint: 'T' }),
          button('Levelauswahl', () => this.show('levels')),
          button('Hauptmenü', () => this.actions.quitToMenu()),
        ]),
      ]),
    ]);
  }

  private slider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
    onChange: (value: number) => void,
  ): HTMLElement {
    const output = el('output', { text: format(value) });
    const input = el('input', {
      attrs: {
        type: 'range',
        min: String(min),
        max: String(max),
        step: String(step),
        value: String(value),
      },
    });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      output.textContent = format(v);
      onChange(v);
    });
    return el('label', { className: 'option' }, [
      el('span', { className: 'option__label', text: label }),
      input,
      output,
    ]);
  }

  private toggle(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
    const input = el('input', { attrs: { type: 'checkbox' } });
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { className: 'option option--toggle' }, [
      el('span', { className: 'option__label', text: label }),
      input,
      el('span', { className: 'switch', attrs: { 'aria-hidden': 'true' } }),
    ]);
  }

  private select(
    label: string,
    value: string,
    choices: readonly (readonly [string, string])[],
    onChange: (value: string) => void,
  ): HTMLElement {
    const select = el(
      'select',
      {},
      choices.map(([key, text]) => el('option', { text, attrs: { value: key } })),
    );
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return el('label', { className: 'option' }, [
      el('span', { className: 'option__label', text: label }),
      select,
    ]);
  }
}
