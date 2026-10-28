import { describe, expect, it } from 'vitest';
import {
  approach,
  clamp,
  createRng,
  damp,
  dampAngle,
  easeInOutCubic,
  remapClamped,
  wrapAngle,
} from '../src/core/math';

describe('math helpers', () => {
  it('clamp begrenzt auf den Bereich', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
  });

  it('approach überschießt das Ziel nie', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
    expect(approach(1, 0, 4)).toBe(0);
  });

  it('damp ist framerate-unabhängig', () => {
    // Zwei halbe Schritte müssen exakt einem ganzen Schritt entsprechen.
    const whole = damp(0, 1, 8, 0.1);
    const half = damp(damp(0, 1, 8, 0.05), 1, 8, 0.05);
    expect(half).toBeCloseTo(whole, 10);
  });

  it('wrapAngle normalisiert nach (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  it('dampAngle nimmt den kürzeren Weg über ±PI', () => {
    const next = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1);
    expect(Math.abs(wrapAngle(next - (-Math.PI + 0.1)))).toBeLessThan(1e-6);
  });

  it('remapClamped und Easing liefern Randwerte', () => {
    expect(remapClamped(15, 10, 20, 0, 100)).toBe(50);
    expect(remapClamped(30, 10, 20, 0, 100)).toBe(100);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('createRng ist deterministisch', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
