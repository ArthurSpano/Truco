import type { ClientMessage } from '../../shared/protocol.js';
import type { ActionBarModel } from './actionBarModel.js';
import { el } from './dom.js';
import type { SendLatch } from './hand.js';

/**
 * The truco action bar. Renders only what the model offers; every send goes through the
 * table-wide latch so a double tap sends once.
 */
export function renderActionBar(
  model: ActionBarModel,
  send: (m: ClientMessage) => void,
  latch: SendLatch = { pending: false },
  /** Phase note (mão de onze / ferro); those phases never have buttons, so it sits in the bar. */
  note: HTMLElement | null = null,
): HTMLElement {
  const bar = el('div', 'action-bar');
  if (model.banner) {
    const banner = el('p', 'truco-banner', model.banner);
    banner.setAttribute('role', 'status');
    bar.append(banner);
  }
  const row = el('div', 'action-row');

  const buttons: HTMLButtonElement[] = [];
  const button = (
    text: string | [string, string],
    cls: string,
    msg: ClientMessage,
    aria?: string,
  ): void => {
    const b = el('button', `btn action-btn ${cls}`);
    if (typeof text === 'string') b.textContent = text;
    else b.append(el('span', 'action-small', text[0]), el('span', 'action-big', text[1]));
    b.type = 'button';
    if (aria) b.setAttribute('aria-label', aria);
    if (latch.pending) b.setAttribute('aria-disabled', 'true');
    buttons.push(b);
    b.addEventListener('click', () => {
      if (latch.pending) return;
      latch.pending = true;
      for (const other of buttons) other.setAttribute('aria-disabled', 'true');
      send(msg);
    });
    row.append(b);
  };

  if (model.call) button(`${model.call.label}!`, 'primary call', { t: 'call_truco' });
  if (model.respond) {
    button('Aceitar', 'accept', { t: 'respond', answer: 'accept' });
    button('Correr', 'run', { t: 'respond', answer: 'run' });
    if (model.respond.raise)
      button(
        ['Aumentar', model.respond.raise.name],
        'raise primary',
        { t: 'respond', answer: 'raise' },
        model.respond.raise.label,
      );
  }
  if (row.childElementCount > 0) bar.append(row);
  if (model.waiting) bar.append(el('p', 'truco-waiting', model.waiting));
  if (note) bar.append(note);
  return bar;
}
