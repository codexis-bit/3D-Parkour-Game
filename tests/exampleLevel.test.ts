import { describe, expect, it } from 'vitest';
import { exampleLevel } from '../src/level/levels/example';
import { findLevel } from '../src/level/levels';
import { validateLevel } from '../src/level/validate';
import { at, runRoute } from './helpers/route';

/** Das Beispiel aus der README muss gültig und schaffbar bleiben. */
describe('Beispiel-Level (README)', () => {
  it('ist gültig und über ?level=beispiel erreichbar', () => {
    expect(validateLevel(exampleLevel)).toEqual([]);
    expect(findLevel('beispiel')).toBe(exampleLevel);
  });

  it('lässt sich mit Laufen und einem Sprung beenden', async () => {
    const result = await runRoute(exampleLevel, [
      { name: 'Anlauf', hold: { moveY: 1 }, yaw: 0, until: at.zBelow(-16.5) },
      { name: 'Sprung', press: ['jump'], until: at.zBelow(-22) },
      { name: 'Kante, Rampe, Ziel', until: () => false, timeout: 12 },
    ]);
    expect(result.finished, result.log.join('\n')).toBe(true);
    expect(result.time).toBeLessThan(exampleLevel.parTime ?? Infinity);
  });
});
