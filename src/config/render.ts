/**
 * Render-Einstellungen: Qualitätsstufen, Farbpalette und Standard-Umgebung.
 * Farben sind sRGB-Hex-Strings; Three.js wandelt sie in den linearen Arbeitsfarbraum um.
 */

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  label: string;
  /** Obergrenze für devicePixelRatio (Hauptkostenfaktor auf HiDPI-Displays). */
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Weichzeichnung der PCF-Schatten in Texeln. */
  shadowRadius: number;
  maxAnisotropy: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    label: 'Niedrig',
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowRadius: 1,
    maxAnisotropy: 2,
  },
  medium: {
    label: 'Mittel',
    pixelRatioCap: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 2,
    maxAnisotropy: 4,
  },
  high: {
    label: 'Hoch',
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 2.5,
    maxAnisotropy: 8,
  },
};

/** Jede Mechanik hat eine eigene, gut lesbare Akzentfarbe. */
export const PALETTE = {
  base: '#e4e8ee',
  baseLine: '#aab3c0',
  ramp: '#d9dfe7',
  wallRun: '#1ea7fd',
  grapple: '#ff7a1a',
  jumpPad: '#35d07f',
  slide: '#9b6bff',
  moving: '#f2b134',
  checkpoint: '#ffd23f',
  checkpointActive: '#5ef0a0',
  killZone: '#ff3355',
  goal: '#ffcf4a',
  backdrop: '#8b9bb4',
} as const;

/** Halbe Kantenlänge des Schatten-Bereichs (in m), der dem Spieler folgt. */
export const SHADOW_EXTENT = 48;

export interface EnvironmentSettings {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  fogNear: number;
  fogFar: number;
  /** Richtung zur Sonne (wird normalisiert). */
  sunDirection: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
}

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  skyTop: '#3d7fd9',
  skyHorizon: '#cfe2f5',
  skyBottom: '#8fa6c2',
  fogNear: 70,
  fogFar: 420,
  sunDirection: [0.45, 0.8, 0.35],
  sunColor: '#fff1db',
  sunIntensity: 2.6,
  hemiSky: '#dbe9ff',
  hemiGround: '#9a948c',
  hemiIntensity: 1.25,
};
