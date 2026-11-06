import type { Sfx } from '../audio/sfx.js';
import { el } from './dom.js';

/** A 44px icon button that toggles all sound. */
export function renderMuteButton(sfx: Sfx): HTMLElement {
  const button = el('button', 'mute-btn');
  button.type = 'button';
  const paint = (): void => {
    button.textContent = sfx.muted ? '🔇' : '🔊';
    button.setAttribute('aria-pressed', String(sfx.muted));
    button.setAttribute('aria-label', sfx.muted ? 'Ativar som' : 'Silenciar');
  };
  button.addEventListener('click', () => {
    sfx.setMuted(!sfx.muted);
    paint();
  });
  paint();
  return button;
}
