import * as THREE from 'three';
import { QUALITY_PRESETS, type QualityLevel, type QualityPreset } from '../config/render';
import { DEG2RAD, RAD2DEG } from './math';

/**
 * Kapselt WebGLRenderer, Szene und Kamera inkl. Resize- und Qualitätslogik.
 */
export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private quality: QualityPreset = QUALITY_PRESETS.high;
  private horizontalFovDeg = 95;
  private readonly resizeListeners = new Set<() => void>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  get preset(): QualityPreset {
    return this.quality;
  }

  /** Maximale anisotrope Filterung, die Hardware und Qualitätsstufe erlauben. */
  get anisotropy(): number {
    return Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.quality.maxAnisotropy);
  }

  setQuality(level: QualityLevel): void {
    const next = QUALITY_PRESETS[level];
    const shadowsChanged = next.shadows !== this.quality.shadows;
    this.quality = next;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, next.pixelRatioCap));
    this.renderer.shadowMap.enabled = next.shadows;
    if (shadowsChanged) {
      // Shader müssen neu kompiliert werden, wenn Schatten an/aus geschaltet werden.
      this.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) m.needsUpdate = true;
      });
    }
    this.handleResize();
  }

  /** Setzt das horizontale Sichtfeld in Grad (so wie Spieler es aus Shootern kennen). */
  setHorizontalFov(deg: number): void {
    this.horizontalFovDeg = deg;
    this.applyFov();
  }

  get aspect(): number {
    return this.camera.aspect;
  }

  /** Rechnet ein horizontales FOV in das vertikale FOV der Three.js-Kamera um. */
  static verticalFovFromHorizontal(horizontalDeg: number, aspect: number): number {
    const h = horizontalDeg * DEG2RAD;
    return 2 * Math.atan(Math.tan(h / 2) / aspect) * RAD2DEG;
  }

  onResize(listener: () => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }

  private applyFov(): void {
    this.camera.fov = Graphics.verticalFovFromHorizontal(this.horizontalFovDeg, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  private readonly handleResize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.applyFov();
    for (const listener of this.resizeListeners) listener();
  };
}
