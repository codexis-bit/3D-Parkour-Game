# Credits

MOMENTUM verwendet **keine externen Grafik- oder Audio-Assets**.

- **Geometrie & Texturen:** prozedural im Code erzeugt (`src/level/materials.ts`, `src/level/geometry.ts`).
- **Himmel:** Gradient-Shader (`src/level/Environment.ts`).
- **Sounds:** zur Laufzeit per WebAudio synthetisiert – gefiltertes Rauschen und Oszillatoren mit
  Hüllkurven (`src/audio/synth.ts`, `src/audio/AudioManager.ts`). Es gibt keine Audiodateien.

## Bibliotheken

| Bibliothek                                                    | Lizenz     |
| ------------------------------------------------------------- | ---------- |
| [three.js](https://threejs.org)                               | MIT        |
| [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`)     | Apache-2.0 |
| [Vite](https://vite.dev), [Vitest](https://vitest.dev)        | MIT        |
| [TypeScript](https://www.typescriptlang.org)                  | Apache-2.0 |
| [ESLint](https://eslint.org), [Prettier](https://prettier.io) | MIT        |
