import * as THREE from 'three';
import { PALETTE } from '../config/render';

/**
 * Prozedurale Texturen und Materialien – komplett im Code erzeugt, keine externen Assets.
 * Die Texturen werden über Welt-UVs gekachelt (siehe geometry.ts), eine Kachel = {@link TEXTURE_TILE_SIZE} m.
 */

/** Kantenlänge einer Texturkachel in Metern. Das Raster darin hat 1-m-Linien. */
export const TEXTURE_TILE_SIZE = 4;

export type MaterialKey =
  | 'base'
  | 'ramp'
  | 'wallRun'
  | 'slide'
  | 'moving'
  | 'jumpPad'
  | 'killZone'
  | 'checkpoint'
  | 'checkpointActive'
  | 'goal'
  | 'grapple'
  | 'grappleActive'
  | 'backdrop'
  | 'trim';

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Canvas nicht verfügbar');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Prototyp-Raster: feine 1-m-Linien, kräftigere Linien an den Kachelrändern. */
function createGridTexture(
  base: string,
  minor: string,
  major: string,
  anisotropy: number,
): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const cell = size / TEXTURE_TILE_SIZE;
  ctx.fillStyle = minor;
  for (let i = 1; i < TEXTURE_TILE_SIZE; i++) {
    ctx.fillRect(i * cell - 1.5, 0, 3, size);
    ctx.fillRect(0, i * cell - 1.5, size, 3);
  }
  // Hauptlinien liegen genau auf dem Kachelrand: je halbe Breite oben/unten bzw. links/rechts,
  // damit sie beim Kacheln nahtlos zusammenpassen.
  ctx.fillStyle = major;
  ctx.fillRect(0, 0, size, 4);
  ctx.fillRect(0, size - 4, size, 4);
  ctx.fillRect(0, 0, 4, size);
  ctx.fillRect(size - 4, 0, 4, size);
  return toTexture(canvas, anisotropy);
}

/** Diagonale Streifen – markieren Wall-Run-Wände und Slide-Tunnel. */
function createStripeTexture(
  base: string,
  stripe: string,
  stripes: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = stripe;
  const step = size / stripes;
  // Parallelogramme über den Rand hinaus zeichnen, damit die Kachel nahtlos ist.
  for (let i = -stripes; i < stripes * 2; i++) {
    const x = i * step;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + step * 0.45, 0);
    ctx.lineTo(x + step * 0.45 + size, size);
    ctx.lineTo(x + size, size);
    ctx.closePath();
    ctx.fill();
  }
  return toTexture(canvas, anisotropy);
}

/** Pfeile (Chevrons) für Sprungpads. */
function createChevronTexture(
  base: string,
  arrow: string,
  anisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = arrow;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const y of [size * 0.3, size * 0.62]) {
    ctx.beginPath();
    ctx.moveTo(size * 0.22, y + size * 0.16);
    ctx.lineTo(size * 0.5, y - size * 0.06);
    ctx.lineTo(size * 0.78, y + size * 0.16);
    ctx.stroke();
  }
  return toTexture(canvas, anisotropy);
}

/**
 * Erzeugt und cached alle Materialien eines Levels. Wird beim Levelwechsel per
 * {@link MaterialLibrary.dispose} freigegeben.
 */
export class MaterialLibrary {
  private readonly cache = new Map<MaterialKey, THREE.MeshStandardMaterial>();
  private readonly textures: THREE.Texture[] = [];

  constructor(private readonly anisotropy: number) {}

  get(key: MaterialKey): THREE.MeshStandardMaterial {
    let material = this.cache.get(key);
    if (!material) {
      material = this.create(key);
      this.cache.set(key, material);
    }
    return material;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.cache.clear();
    this.textures.length = 0;
  }

  private track<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  private create(key: MaterialKey): THREE.MeshStandardMaterial {
    const a = this.anisotropy;
    switch (key) {
      case 'base':
        return new THREE.MeshStandardMaterial({
          map: this.track(createGridTexture(PALETTE.base, '#d2d8e0', PALETTE.baseLine, a)),
          roughness: 0.88,
          metalness: 0,
        });
      case 'ramp':
        return new THREE.MeshStandardMaterial({
          map: this.track(createGridTexture(PALETTE.ramp, '#c5ccd6', '#9ea8b6', a)),
          roughness: 0.85,
          metalness: 0,
        });
      case 'wallRun':
        return new THREE.MeshStandardMaterial({
          map: this.track(createStripeTexture(PALETTE.wallRun, '#63c6ff', 6, a)),
          emissive: new THREE.Color(PALETTE.wallRun),
          emissiveIntensity: 0.28,
          roughness: 0.8,
          metalness: 0,
        });
      case 'slide':
        return new THREE.MeshStandardMaterial({
          map: this.track(createStripeTexture(PALETTE.slide, '#2a1f45', 8, a)),
          emissive: new THREE.Color(PALETTE.slide),
          emissiveIntensity: 0.18,
          roughness: 0.6,
        });
      case 'moving':
        return new THREE.MeshStandardMaterial({
          map: this.track(createGridTexture(PALETTE.moving, '#e09b1c', '#b87a10', a)),
          emissive: new THREE.Color(PALETTE.moving),
          emissiveIntensity: 0.12,
          roughness: 0.7,
        });
      case 'jumpPad':
        return new THREE.MeshStandardMaterial({
          map: this.track(createChevronTexture('#1f7a4a', '#b8ffd8', a)),
          emissive: new THREE.Color(PALETTE.jumpPad),
          emissiveIntensity: 0.55,
          roughness: 0.4,
        });
      case 'killZone':
        return new THREE.MeshStandardMaterial({
          color: PALETTE.killZone,
          emissive: new THREE.Color(PALETTE.killZone),
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          roughness: 0.3,
        });
      case 'checkpoint':
        return new THREE.MeshStandardMaterial({
          color: PALETTE.checkpoint,
          emissive: new THREE.Color(PALETTE.checkpoint),
          emissiveIntensity: 0.8,
          roughness: 0.4,
        });
      case 'checkpointActive':
        return new THREE.MeshStandardMaterial({
          color: PALETTE.checkpointActive,
          emissive: new THREE.Color(PALETTE.checkpointActive),
          emissiveIntensity: 0.9,
          roughness: 0.4,
        });
      case 'goal':
        return new THREE.MeshStandardMaterial({
          color: PALETTE.goal,
          emissive: new THREE.Color(PALETTE.goal),
          emissiveIntensity: 1.0,
          roughness: 0.3,
          metalness: 0.2,
        });
      case 'grapple':
        return new THREE.MeshStandardMaterial({
          color: PALETTE.grapple,
          emissive: new THREE.Color(PALETTE.grapple),
          emissiveIntensity: 1.1,
          roughness: 0.35,
        });
      case 'grappleActive':
        return new THREE.MeshStandardMaterial({
          color: '#ffffff',
          emissive: new THREE.Color('#ffb36b'),
          emissiveIntensity: 1.6,
          roughness: 0.3,
        });
      case 'backdrop':
        return new THREE.MeshStandardMaterial({
          color: PALETTE.backdrop,
          roughness: 1,
          metalness: 0,
        });
      case 'trim':
        return new THREE.MeshStandardMaterial({ color: '#5b6677', roughness: 0.7 });
    }
  }
}
