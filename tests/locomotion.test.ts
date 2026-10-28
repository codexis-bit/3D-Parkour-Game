import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import {
  applyAirMovement,
  applyGravity,
  applyGroundMovement,
  clipAgainstContacts,
  horizontalSpeed,
  wishDirection,
} from '../src/mechanics/Locomotion';

const DT = 1 / 60;

describe('wishDirection', () => {
  it('W bei yaw 0 zeigt nach -Z, D nach +X', () => {
    const out = new THREE.Vector3();
    wishDirection(0, 1, 0, out);
    expect(out.z).toBeCloseTo(-1);
    wishDirection(1, 0, 0, out);
    expect(out.x).toBeCloseTo(1);
  });

  it('normalisiert Diagonalen auf Länge 1', () => {
    const out = wishDirection(1, 1, 0.3, new THREE.Vector3());
    expect(out.length()).toBeCloseTo(1);
  });
});

describe('applyGroundMovement', () => {
  it('beschleunigt in ~0,13 s auf Laufgeschwindigkeit', () => {
    const v = new THREE.Vector3();
    const wish = new THREE.Vector3(0, 0, -1);
    let t = 0;
    while (horizontalSpeed(v) < MOVEMENT.ground.runSpeed - 1e-6 && t < 1) {
      applyGroundMovement(v, wish, MOVEMENT.ground.runSpeed, MOVEMENT.ground, DT);
      t += DT;
    }
    expect(t).toBeLessThan(0.2);
    expect(horizontalSpeed(v)).toBeCloseTo(MOVEMENT.ground.runSpeed);
  });

  it('bremst ohne Eingabe vollständig ab', () => {
    const v = new THREE.Vector3(9, 0, 0);
    for (let i = 0; i < 20; i++)
      applyGroundMovement(v, new THREE.Vector3(), 9, MOVEMENT.ground, DT);
    expect(horizontalSpeed(v)).toBe(0);
  });

  it('baut Überschuss-Tempo nur langsam ab und bleibt dabei lenkbar', () => {
    const v = new THREE.Vector3(0, 0, -15);
    const wish = new THREE.Vector3(1, 0, -1).normalize();
    for (let i = 0; i < 10; i++) applyGroundMovement(v, wish, 9, MOVEMENT.ground, DT);
    expect(horizontalSpeed(v)).toBeGreaterThan(13);
    expect(v.x).toBeGreaterThan(0);
  });

  it('Gegenlenken bei Überschuss-Tempo bremst, statt verlustfrei umzukehren', () => {
    const v = new THREE.Vector3(0, 0, -15);
    applyGroundMovement(v, new THREE.Vector3(0, 0, 1), 9, MOVEMENT.ground, DT);
    expect(v.z).toBeLessThan(0);
    expect(horizontalSpeed(v)).toBeLessThan(15);
  });
});

describe('applyAirMovement', () => {
  it('erhöht das Tempo nicht über max(vorher, inputSpeed)', () => {
    const v = new THREE.Vector3(0, 0, -14);
    const side = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 120; i++) applyAirMovement(v, side, MOVEMENT.air, DT);
    expect(horizontalSpeed(v)).toBeLessThanOrEqual(14 + 1e-6);
    expect(v.x).toBeGreaterThan(0);
  });

  it('beschleunigt aus dem Stand bis inputSpeed', () => {
    const v = new THREE.Vector3();
    for (let i = 0; i < 120; i++)
      applyAirMovement(v, new THREE.Vector3(0, 0, -1), MOVEMENT.air, DT);
    expect(horizontalSpeed(v)).toBeCloseTo(MOVEMENT.air.inputSpeed);
  });
});

describe('applyGravity / clipAgainstContacts', () => {
  it('begrenzt die Fallgeschwindigkeit', () => {
    const v = new THREE.Vector3();
    for (let i = 0; i < 600; i++) applyGravity(v, 26, 1, 1.1, 55, DT);
    expect(v.y).toBe(-55);
  });

  const options = { walkableNormalY: 0.64, stepHeight: 0.35, onGround: false };

  it('entfernt nur den Anteil in die Wand hinein, nicht den Bodenkontakt', () => {
    const v = new THREE.Vector3(5, -2, 3);
    const wall = { normal: new THREE.Vector3(-1, 0, 0), height: 1 };
    const floor = { normal: new THREE.Vector3(0, 1, 0), height: 0 };
    clipAgainstContacts(v, [wall, floor], 2, options);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBe(-2);
    expect(v.z).toBe(3);
  });

  it('schräge Kanten-Normalen erzeugen keinen Auftrieb', () => {
    const v = new THREE.Vector3(0, -1, -9);
    const edge = { normal: new THREE.Vector3(0, 0.5, 0.866), height: 1 };
    clipAgainstContacts(v, [edge], 1, options);
    expect(v.y).toBe(-1);
    expect(v.z).toBeCloseTo(0);
  });

  it('am Boden bleiben Stufenkanten ungeclippt (Autostep)', () => {
    const v = new THREE.Vector3(0, -1, -9);
    const step = { normal: new THREE.Vector3(0, 0.15, 0.99), height: 0.2 };
    clipAgainstContacts(v, [step], 1, { ...options, onGround: true });
    expect(v.z).toBe(-9);
  });

  it('Decken stoppen nur die Aufwärtsbewegung', () => {
    const v = new THREE.Vector3(3, 6, 0);
    clipAgainstContacts(v, [{ normal: new THREE.Vector3(0, -1, 0), height: 1.8 }], 1, options);
    expect(v.y).toBe(0);
    expect(v.x).toBe(3);
  });
});
