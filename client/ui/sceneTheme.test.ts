import { describe, expect, it } from 'vitest';
import { SCENE_THEMES, createThemeStore, nextTheme, parseTheme } from './sceneTheme.js';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('parseTheme', () => {
  it('accepts every known id', () => {
    for (const t of SCENE_THEMES) expect(parseTheme(t)).toBe(t);
  });
  it('falls back to taverna', () => {
    for (const raw of [null, undefined, '', 'beach', 'PRACA']) {
      expect(parseTheme(raw)).toBe('taverna');
    }
  });
});

describe('nextTheme', () => {
  it('cycles and wraps', () => {
    expect(nextTheme('taverna')).toBe('praca');
    expect(nextTheme('praca')).toBe('gramado');
    expect(nextTheme('gramado')).toBe('taverna');
  });
});

describe('createThemeStore', () => {
  it('defaults to taverna on empty storage', () => {
    expect(createThemeStore(memory()).get()).toBe('taverna');
  });

  it('persists under truco.scene and reads it back', () => {
    const storage = memory();
    createThemeStore(storage).set('gramado');
    expect(storage.map.get('truco.scene')).toBe('gramado');
    expect(createThemeStore(storage).get()).toBe('gramado');
  });

  it('ignores a garbage stored value', () => {
    const storage = memory();
    storage.map.set('truco.scene', 'beach');
    expect(createThemeStore(storage).get()).toBe('taverna');
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createThemeStore(broken);
    expect(store.get()).toBe('taverna');
    expect(() => {
      store.set('praca');
    }).not.toThrow();
    expect(store.get()).toBe('praca');
  });
});
