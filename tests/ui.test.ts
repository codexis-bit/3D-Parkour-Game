import { describe, expect, it } from 'vitest';
import { RunTimer } from '../src/core/RunTimer';
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsStore } from '../src/core/Settings';
import { MemoryStore } from '../src/core/storage';
import { BestTimes } from '../src/ui/BestTimes';
import { formatDelta, formatSpeed, formatTime } from '../src/ui/format';

describe('formatTime', () => {
  it('formatiert Minuten, Sekunden und Millisekunden', () => {
    expect(formatTime(0)).toBe('00:00.000');
    expect(formatTime(5.0071)).toBe('00:05.007');
    expect(formatTime(83.456)).toBe('01:23.456');
    expect(formatTime(3725.5)).toBe('1:02:05.500');
  });

  it('formatDelta zeigt Vorzeichen', () => {
    expect(formatDelta(-0.4123)).toBe('−0.412');
    expect(formatDelta(1.25)).toBe('+1.250');
  });

  it('formatSpeed rechnet km/h um', () => {
    expect(formatSpeed(10, 'kmh')).toEqual({ value: '36', unit: 'km/h' });
    expect(formatSpeed(12.34, 'ms')).toEqual({ value: '12.3', unit: 'm/s' });
  });
});

describe('RunTimer', () => {
  it('läuft erst nach start() und zählt Ticks', () => {
    const timer = new RunTimer();
    timer.arm();
    timer.tick(1 / 60);
    expect(timer.time).toBe(0);
    expect(timer.start()).toBe(true);
    for (let i = 0; i < 60; i++) timer.tick(1 / 60);
    expect(timer.time).toBeCloseTo(1, 10);
  });

  it('bestimmt die Zielzeit auf den Tick-Bruchteil genau', () => {
    const timer = new RunTimer();
    timer.arm();
    timer.start();
    for (let i = 0; i < 10; i++) timer.tick(0.1);
    const result = timer.finish(0.25);
    expect(result).toBeCloseTo(0.925, 10);
    expect(timer.finished).toBe(true);
    timer.tick(0.1);
    expect(timer.time).toBeCloseTo(0.925, 10);
  });

  it('start() ohne arm() tut nichts', () => {
    const timer = new RunTimer();
    expect(timer.start()).toBe(false);
    expect(timer.running).toBe(false);
  });
});

describe('BestTimes', () => {
  it('speichert nur Verbesserungen und meldet Rekorde', () => {
    const store = new MemoryStore();
    const times = new BestTimes(store);
    expect(times.submit('flow', 42.5)).toMatchObject({ newRecord: true, previousBest: null });
    expect(times.submit('flow', 45)).toMatchObject({ newRecord: false, best: 42.5 });
    expect(times.submit('flow', 40)).toMatchObject({
      newRecord: true,
      previousBest: 42.5,
      best: 40,
    });
    // Neu geladen aus demselben Speicher
    expect(new BestTimes(store).get('flow')).toBe(40);
  });

  it('ignoriert kaputte Speicherinhalte', () => {
    const store = new MemoryStore();
    store.setItem('momentum.bestTimes.v1', '{"flow": "schnell", "tutorial": -3, "challenge": 55}');
    const times = new BestTimes(store);
    expect(times.get('flow')).toBeNull();
    expect(times.get('tutorial')).toBeNull();
    expect(times.get('challenge')).toBe(55);
    store.setItem('momentum.bestTimes.v1', 'kein json');
    expect(new BestTimes(store).get('challenge')).toBeNull();
  });
});

describe('Settings', () => {
  it('repariert ungültige Werte und füllt Lücken mit Standardwerten', () => {
    const settings = sanitizeSettings({
      sensitivity: 99,
      fov: 'breit',
      quality: 'ultra',
      invertY: true,
    });
    expect(settings.sensitivity).toBe(5);
    expect(settings.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(settings.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(settings.invertY).toBe(true);
  });

  it('speichert Änderungen und benachrichtigt Abonnenten', () => {
    const store = new MemoryStore();
    const settings = new SettingsStore(store);
    const seen: number[] = [];
    settings.subscribe((s) => seen.push(s.volume));
    settings.update({ volume: 0.3 });
    expect(seen).toEqual([DEFAULT_SETTINGS.volume, 0.3]);
    expect(new SettingsStore(store).current.volume).toBe(0.3);
  });
});
