import type { ClientMessage } from '../../shared/protocol.js';
import type { ActionBarModel } from './actionBarModel.js';
import { el } from './dom.js';
import type { SendLatch } from './hand.js';

/**
 * The truco controls. Normally the bar with the big gold TRUCO / SEIS / NOVE / DOZE button
 * (disabled, with the reason underneath, when no call is allowed). When the viewer may answer a
 * call it is replaced by the response sheet: Correr / Aceitar / raise. Every send goes through
 * the table-wide latch so a double tap sends once.
 */
export function renderActionBar(
  model: ActionBarModel,
  send: (m: ClientMessage) => void,
  latch: SendLatch = { pending: false },
  /** The hand's face-down toggle, shown beside the gold button when it is offered. */
  toggle: HTMLElement | null = null,
): HTMLElement {
  const buttons: HTMLButtonElement[] = [];
  const button = (cls: string, msg: ClientMessage, aria?: string): HTMLButtonElement => {
    const b = el('button', `btn ${cls}`);
    b.type = 'button';
    if (aria) b.setAttribute('aria-label', aria);
    if (latch.pending) b.setAttribute('aria-disabled', 'true');
    buttons.push(b);
    b.addEventListener('click', () => {
      if (latch.pending || b.disabled) return;
      latch.pending = true;
      for (const other of buttons) other.setAttribute('aria-disabled', 'true');
      send(msg);
    });
    return b;
  };

  if (model.respond && model.ask) {
    const sheet = el('div', 'sheet glass');
    sheet.setAttribute('role', 'group');
    sheet.setAttribute('aria-label', 'Responder ao truco');
    const q = el('div', 'q');
    q.append(
      `${model.ask.name} pede `,
      el('b', undefined, model.ask.what),
      ` — vale ${model.ask.to}`,
    );
    const row = el('div', 'row');
    const run = button('red', { t: 'respond', answer: 'run' });
    run.textContent = 'Correr';
    const accept = button('grn', { t: 'respond', answer: 'accept' });
    accept.textContent = 'Aceitar';
    row.append(run, accept);
    const raise = model.respond.raise;
    if (raise) {
      const up = button('gold', { t: 'respond', answer: 'raise' }, raise.label);
      up.textContent = `${raise.name}!`;
      row.append(up);
    }
    sheet.append(q, row);
    return sheet;
  }

  const bar = el('div', 'bar');
  if (toggle) bar.append(toggle);
  const gold = button('gold truco', { t: 'call_truco' });
  gold.disabled = !model.button.enabled;
  gold.append(el('span', undefined, model.button.label), el('small', undefined, model.button.sub));
  bar.append(gold);
  return bar;
}
