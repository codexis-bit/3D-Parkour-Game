import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';

type TestEvents = {
  ping: { value: number };
  pong: { text: string };
};

describe('EventBus', () => {
  it('ruft registrierte Listener mit der Nutzlast auf', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { value: 3 });
    expect(fn).toHaveBeenCalledWith({ value: 3 });
  });

  it('meldet Listener über die Rückgabefunktion ab', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on('pong', fn);
    off();
    bus.emit('pong', { text: 'x' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('once feuert nur einmal', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', { value: 1 });
    bus.emit('ping', { value: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('erlaubt Abmelden während eines Emits', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const offA = bus.on('ping', () => {
      calls.push('a');
      offA();
    });
    bus.on('ping', () => calls.push('b'));
    bus.emit('ping', { value: 0 });
    bus.emit('ping', { value: 0 });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
