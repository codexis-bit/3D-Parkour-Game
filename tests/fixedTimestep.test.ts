import { describe, expect, it } from 'vitest';
import { FixedTimestep } from '../src/core/FixedTimestep';

describe('FixedTimestep', () => {
  it('liefert bei 60 FPS genau einen Schritt pro Frame', () => {
    const fixed = new FixedTimestep(60);
    let total = 0;
    for (let i = 0; i < 600; i++) total += fixed.advance(1 / 60);
    expect(total).toBe(600);
  });

  it('verteilt Schritte bei 144 FPS korrekt und liefert alpha in [0,1)', () => {
    const fixed = new FixedTimestep(60);
    let total = 0;
    for (let i = 0; i < 144; i++) {
      total += fixed.advance(1 / 144);
      expect(fixed.alpha).toBeGreaterThanOrEqual(0);
      expect(fixed.alpha).toBeLessThan(1);
    }
    expect(total).toBe(60);
  });

  it('kappt lange Frames (kein Spiral of Death)', () => {
    const fixed = new FixedTimestep(60, 0.25, 8);
    expect(fixed.advance(5)).toBe(8);
    expect(fixed.advance(0)).toBe(0);
  });

  it('reset verwirft angesammelte Zeit', () => {
    const fixed = new FixedTimestep(60);
    fixed.advance(0.01);
    fixed.reset();
    expect(fixed.alpha).toBe(0);
  });
});
