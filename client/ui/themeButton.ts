import { el } from './dom.js';
import {
  nextTheme,
  THEME_ICON,
  THEME_LABEL,
  type SceneTheme,
  type ThemeStore,
} from './sceneTheme.js';

/** A 44px icon button that cycles the table scene. */
export function renderThemeButton(
  store: ThemeStore,
  onChange: (t: SceneTheme) => void,
): HTMLElement {
  const button = el('button', 'theme-btn');
  button.type = 'button';
  const paint = (): void => {
    const current = store.get();
    const label = `Cenário: ${THEME_LABEL[current]}. Mudar para ${THEME_LABEL[nextTheme(current)]}`;
    button.textContent = THEME_ICON[current];
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  button.addEventListener('click', () => {
    const t = nextTheme(store.get());
    store.set(t);
    paint();
    onChange(t);
  });
  paint();
  return button;
}
