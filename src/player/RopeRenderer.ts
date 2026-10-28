import * as THREE from 'three';
import { PALETTE } from '../config/render';

const SEGMENTS = 28;
const RADIAL = 5;
/** Radius am Ankerende; zur Hand hin wird das Seil dünner, damit es nahe der Kamera nicht klobig wirkt. */
const RADIUS = 0.03;
const RADIUS_NEAR = 0.008;

/**
 * Seil des Grappling Hooks als dünne Röhre, deren Vertices jeden Frame aktualisiert werden
 * (keine Neu-Allokation). Beim Abschuss schlängelt sich das Seil und beruhigt sich, sobald der
 * Haken einrastet; ein lockeres Seil hängt leicht durch.
 */
export class RopeRenderer {
  readonly object = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly hook: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly positions: Float32Array;
  private readonly start = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly binormal = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly helper = new THREE.Vector3();

  constructor() {
    this.positions = new Float32Array((SEGMENTS + 1) * RADIAL * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const indices: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) {
      for (let r = 0; r < RADIAL; r++) {
        const a = s * RADIAL + r;
        const b = s * RADIAL + ((r + 1) % RADIAL);
        const c = a + RADIAL;
        const d = b + RADIAL;
        indices.push(a, c, b, b, c, d);
      }
    }
    geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: '#ffd9b0', fog: true }),
    );
    this.mesh.frustumCulled = false;
    this.hook = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09),
      new THREE.MeshBasicMaterial({ color: PALETTE.grapple }),
    );
    this.object.add(this.mesh, this.hook);
    this.object.visible = false;
  }

  /**
   * @param from Startpunkt (Hand des Spielers).
   * @param to Ankerpunkt.
   * @param progress Hakenflug 0…1 (1 = eingerastet).
   * @param slack Durchhang in Metern (0 = straff).
   * @param time Laufzeit für die Wellenbewegung.
   */
  update(
    from: THREE.Vector3,
    to: THREE.Vector3,
    progress: number,
    slack: number,
    time: number,
  ): void {
    this.object.visible = true;
    this.start.copy(from);
    this.dir.subVectors(to, from);
    const fullLength = this.dir.length();
    if (fullLength < 1e-4) {
      this.object.visible = false;
      return;
    }
    this.dir.divideScalar(fullLength);
    const length = fullLength * progress;
    // Orthonormalbasis quer zum Seil.
    this.helper.set(0, 1, 0);
    if (Math.abs(this.dir.y) > 0.95) this.helper.set(1, 0, 0);
    this.normal.crossVectors(this.dir, this.helper).normalize();
    this.binormal.crossVectors(this.dir, this.normal).normalize();

    const wave = (1 - progress) * 0.35 + 0.02;
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      const envelope = Math.sin(Math.PI * t);
      this.point.copy(this.start).addScaledVector(this.dir, length * t);
      // Wellen beim Abschuss, Durchhang bei lockerem Seil (Parabel nach unten).
      const offset = Math.sin(t * 9 - time * 28) * wave * envelope;
      this.point.addScaledVector(this.normal, offset);
      this.point.y -= slack * envelope;
      const radius = RADIUS_NEAR + (RADIUS - RADIUS_NEAR) * Math.min(1, t * 4);
      for (let r = 0; r < RADIAL; r++) {
        const angle = (r / RADIAL) * Math.PI * 2;
        const cx = Math.cos(angle) * radius;
        const cy = Math.sin(angle) * radius;
        const i = (s * RADIAL + r) * 3;
        this.positions[i] = this.point.x + this.normal.x * cx + this.binormal.x * cy;
        this.positions[i + 1] = this.point.y + this.normal.y * cx + this.binormal.y * cy;
        this.positions[i + 2] = this.point.z + this.normal.z * cx + this.binormal.z * cy;
      }
    }
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
    this.hook.position.copy(this.point);
    this.hook.rotation.y = time * 8;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.hook.geometry.dispose();
    this.hook.material.dispose();
  }
}
