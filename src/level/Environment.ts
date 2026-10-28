import * as THREE from 'three';
import { type EnvironmentSettings, type QualityPreset, SHADOW_EXTENT } from '../config/render';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunColor;
uniform vec3 sunDirection;
varying vec3 vDirection;
void main() {
  vec3 dir = normalize(vDirection);
  float h = dir.y;
  vec3 color = h >= 0.0
    ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.45));
  float sunAmount = max(dot(dir, sunDirection), 0.0);
  color += sunColor * (pow(sunAmount, 900.0) * 3.0 + pow(sunAmount, 20.0) * 0.16);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Himmel (Gradient-Kuppel mit Sonne), Nebel und Beleuchtung.
 * Das Schattengebiet der Sonne folgt dem Spieler und rastet auf Texel ein, damit Schatten nicht flimmern.
 */
export class Environment {
  readonly sun = new THREE.DirectionalLight();
  readonly hemi = new THREE.HemisphereLight();
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly skyUniforms = {
    topColor: { value: new THREE.Color() },
    horizonColor: { value: new THREE.Color() },
    bottomColor: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
  };
  private readonly fog = new THREE.Fog(0xffffff, 60, 400);
  private readonly sunDirection = new THREE.Vector3(0, 1, 0);
  private readonly lightRight = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private texelSize = 0.05;

  constructor(
    private readonly scene: THREE.Scene,
    settings: EnvironmentSettings,
  ) {
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), material);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(this.hemi);
    scene.fog = this.fog;

    this.apply(settings);
  }

  apply(settings: EnvironmentSettings): void {
    const u = this.skyUniforms;
    u.topColor.value.set(settings.skyTop);
    u.horizonColor.value.set(settings.skyHorizon);
    u.bottomColor.value.set(settings.skyBottom);
    u.sunColor.value.set(settings.sunColor);
    this.sunDirection.set(...settings.sunDirection).normalize();
    u.sunDirection.value.copy(this.sunDirection);

    this.fog.color.set(settings.skyHorizon);
    this.fog.near = settings.fogNear;
    this.fog.far = settings.fogFar;

    this.sun.color.set(settings.sunColor);
    this.sun.intensity = settings.sunIntensity;
    this.hemi.color.set(settings.hemiSky);
    this.hemi.groundColor.set(settings.hemiGround);
    this.hemi.intensity = settings.hemiIntensity;

    // Orthonormalbasis senkrecht zur Lichtrichtung für das Texel-Snapping.
    const worldUp =
      Math.abs(this.sunDirection.y) > 0.99
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    this.lightRight.crossVectors(worldUp, this.sunDirection).normalize();
    this.lightUp.crossVectors(this.sunDirection, this.lightRight).normalize();
  }

  setQuality(preset: QualityPreset): void {
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.radius = preset.shadowRadius;
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.texelSize = (SHADOW_EXTENT * 2) / preset.shadowMapSize;
  }

  /** Pro Frame: Himmel an die Kamera hängen, Schattenbereich um `focus` zentrieren. */
  update(focus: THREE.Vector3, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);

    // Fokus in Licht-Koordinaten zerlegen und quer zur Lichtrichtung auf Texel runden.
    const r = Math.round(focus.dot(this.lightRight) / this.texelSize) * this.texelSize;
    const u = Math.round(focus.dot(this.lightUp) / this.texelSize) * this.texelSize;
    const d = focus.dot(this.sunDirection);
    this.tmp
      .copy(this.lightRight)
      .multiplyScalar(r)
      .addScaledVector(this.lightUp, u)
      .addScaledVector(this.sunDirection, d);
    this.sun.target.position.copy(this.tmp);
    this.sun.position.copy(this.tmp).addScaledVector(this.sunDirection, 250);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.scene.remove(this.sky, this.sun, this.sun.target, this.hemi);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.fog = null;
  }
}
