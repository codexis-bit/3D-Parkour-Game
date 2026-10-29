import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AttractCamera } from '../src/player/AttractCamera';

const path = [
  new THREE.Vector3(0, 0, 9),
  new THREE.Vector3(0, 2.6, -37),
  new THREE.Vector3(0, 6, -80),
];

describe('AttractCamera', () => {
  it('fliegt die Strecke entlang', () => {
    const attract = new AttractCamera();
    const camera = new THREE.PerspectiveCamera();
    attract.setPath(path);
    attract.update(0, camera);
    const start = camera.position.clone();
    for (let i = 0; i < 120; i++) attract.update(1 / 60, camera);
    expect(camera.position.z).toBeLessThan(start.z - 5);
  });

  it('übersteht negative und ungültige Zeitschritte (erster Frame nach dem Start)', () => {
    const attract = new AttractCamera();
    const camera = new THREE.PerspectiveCamera();
    attract.setPath(path);
    expect(() => attract.update(-0.004, camera)).not.toThrow();
    expect(() => attract.update(Number.NaN, camera)).not.toThrow();
    expect(Number.isFinite(camera.position.x)).toBe(true);
  });
});
