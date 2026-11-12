import { el } from './dom.js';
import type { SceneTheme } from './sceneTheme.js';

/** Class lists of the decorative props each theme draws inside `.props`; shared with the CSS guard test. */
export const THEME_PROPS: Record<SceneTheme, readonly string[]> = {
  taverna: [],
  praca: ['shade s1', 'shade s2', 'shade s3', 'leaf l1', 'leaf l2', 'leaf l3', 'leaf l4', 'grate'],
  gramado: ['shade s1', 'shade s2', 'flowers f1', 'flowers f2', 'flowers f3', 'cooler', 'blanket'],
};

/** Full-viewport scenery layer behind the stage; purely decorative. */
export function renderBackdrop(theme: SceneTheme): HTMLElement {
  const backdrop = el('div', 'backdrop');
  backdrop.setAttribute('aria-hidden', 'true');
  const props = el('div', 'props');
  for (const cls of THEME_PROPS[theme]) props.append(el('div', cls));
  backdrop.append(props);
  return backdrop;
}
