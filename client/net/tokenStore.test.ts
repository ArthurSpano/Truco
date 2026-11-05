import { describe, expect, it } from 'vitest';
import { localTokenStore } from './tokenStore.js';

function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('localTokenStore', () => {
  it('round-trips and clears', () => {
    const s = localTokenStore(memory());
    expect(s.get()).toBeNull();
    s.set('abc');
    expect(s.get()).toBe('abc');
    s.clear();
    expect(s.get()).toBeNull();
  });

  it('returns null when storage throws', () => {
    const boom = (): never => {
      throw new Error('denied');
    };
    const s = localTokenStore({ getItem: boom, setItem: boom, removeItem: boom });
    expect(s.get()).toBeNull();
    expect(() => {
      s.set('x');
      s.clear();
    }).not.toThrow();
  });
});
