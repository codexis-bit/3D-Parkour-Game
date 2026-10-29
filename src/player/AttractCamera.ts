import * as THREE from 'three';

/**
 * Kamerafahrt für den Menü-Hintergrund: fliegt langsam die Strecke eines Levels entlang
 * (Spawn → Checkpoints → Ziel) und schaut dabei leicht voraus.
 */
export class AttractCamera {
  private curve: THREE.CatmullRomCurve3 | null = null;
  private length = 1;
  private distance = 0;
  private readonly look = new THREE.Vector3();
  private readonly position = new THREE.Vector3();

  constructor(private readonly speed = 6) {}

  /** Neue Strecke; Punkte werden etwas angehoben, damit die Kamera über dem Parcours fliegt. */
  setPath(points: readonly THREE.Vector3[]): void {
    const lifted = points.map((p) => p.clone().add(new THREE.Vector3(3.5, 5, 0)));
    if (lifted.length < 2) {
      this.curve = null;
      return;
    }
    this.curve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal');
    this.length = Math.max(1, this.curve.getLength());
    this.distance = 0;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    const curve = this.curve;
    if (!curve) return;
    // Auch bei negativem dt im Bereich [0, length) bleiben: Kurven-Parameter außerhalb von
    // [0, 1] liefern in three.js NaN und lassen getPointAt abstürzen.
    const next = (this.distance + Math.max(0, dt) * this.speed) % this.length;
    this.distance = Number.isFinite(next) ? next : 0;
    const u = this.distance / this.length;
    curve.getPointAt(u, this.position);
    curve.getPointAt(Math.min(1, u + 18 / this.length), this.look);
    this.look.y -= 3;
    camera.position.copy(this.position);
    camera.lookAt(this.look);
  }
}
