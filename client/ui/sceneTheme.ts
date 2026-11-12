export const SCENE_THEMES = ['taverna', 'praca', 'gramado'] as const;

export type SceneTheme = (typeof SCENE_THEMES)[number];

export const THEME_LABEL: Record<SceneTheme, string> = {
  taverna: 'Taverna',
  praca: 'Praça',
  gramado: 'Gramado',
};

export const THEME_ICON: Record<SceneTheme, string> = {
  taverna: '🍺',
  praca: '🌳',
  gramado: '🌿',
};

const STORAGE_KEY = 'truco.scene';
const DEFAULT_THEME: SceneTheme = 'taverna';

function isSceneTheme(raw: string): raw is SceneTheme {
  return (SCENE_THEMES as readonly string[]).includes(raw);
}

/** Maps an arbitrary stored or user-supplied value to a known theme; unknown values become taverna. */
export function parseTheme(raw: string | null | undefined): SceneTheme {
  return raw && isSceneTheme(raw) ? raw : DEFAULT_THEME;
}

/** Next theme in SCENE_THEMES order, wrapping around. */
export function nextTheme(t: SceneTheme): SceneTheme {
  const i = SCENE_THEMES.indexOf(t);
  return SCENE_THEMES[(i + 1) % SCENE_THEMES.length] ?? DEFAULT_THEME;
}

export interface ThemeStore {
  get(): SceneTheme;
  set(t: SceneTheme): void;
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Persisted choice of table scene. The stored value is read once at creation; `set` updates the
 * in-memory value first so the choice holds even when storage is blocked.
 */
export function createThemeStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage(),
): ThemeStore {
  let current: SceneTheme = DEFAULT_THEME;
  try {
    current = parseTheme(storage?.getItem(STORAGE_KEY));
  } catch {
    // Storage may be blocked; keep the default.
  }
  return {
    get: () => current,
    set(t) {
      current = t;
      try {
        storage?.setItem(STORAGE_KEY, t);
      } catch {
        // Storage may be blocked; the in-memory choice still applies.
      }
    },
  };
}
