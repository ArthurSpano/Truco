import type { ClientMessage } from '../../shared/protocol.js';
import { renderCard } from './card.js';
import { el } from './dom.js';
import type { SendLatch } from './hand.js';
import type { HandPhase } from './handPhase.js';

type DecidePhase = Extract<HandPhase, { kind: 'mao_de_onze_decide' }>;

/**
 * Mão de onze decision overlay: shows only the hands the server revealed (`phase.hands`)
 * and two buttons. Both go through the table-wide latch so a double tap sends once.
 */
export function renderMaoDeOnze(
  phase: DecidePhase,
  send: (m: ClientMessage) => void,
  latch: SendLatch = { pending: false },
  nameOf: (seat: number) => string = () => '',
): HTMLElement {
  const overlay = el('div', 'phase-overlay mao-onze');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mao-onze-title');
  const title = el('h2', 'phase-title', 'Mão de onze');
  title.id = 'mao-onze-title';
  overlay.append(title);

  const hands = el('div', 'phase-hands');
  for (const hand of phase.hands) {
    const group = el('div', 'phase-hand');
    group.dataset.seat = String(hand.seat);
    const who = nameOf(hand.seat);
    if (who) group.append(el('span', 'phase-hand-name', who));
    const row = el('div', 'phase-cards');
    for (const card of hand.cards) row.append(renderCard(card));
    group.append(row);
    hands.append(group);
  }
  overlay.append(hands);

  const buttons: HTMLButtonElement[] = [];
  const row = el('div', 'phase-actions');
  const add = (text: string, cls: string, play: boolean): void => {
    const b = el('button', `btn ${cls}`, text);
    b.type = 'button';
    if (latch.pending) b.setAttribute('aria-disabled', 'true');
    buttons.push(b);
    b.addEventListener('click', () => {
      if (latch.pending) return;
      latch.pending = true;
      for (const other of buttons) other.setAttribute('aria-disabled', 'true');
      send({ t: 'mao11_decision', play });
    });
    row.append(b);
  };
  add('Jogar (vale 3)', 'primary', true);
  add('Correr (eles ganham 1)', 'run', false);
  overlay.append(row);
  // Focus the primary button once the overlay is in the document.
  queueMicrotask(() => {
    row.querySelector<HTMLButtonElement>('button.primary')?.focus();
  });
  return overlay;
}

/** Shown while a mão de onze decision is pending and the viewer cannot make it. Shows no cards. */
export function renderMaoDeOnzeWait(): HTMLElement {
  const note = el('p', 'phase-wait', 'Os adversários estão decidindo a mão de onze…');
  note.setAttribute('role', 'status');
  return note;
}

export function renderMaoDeFerroBanner(): HTMLElement {
  const banner = el('p', 'ferro-banner', 'Mão de ferro: ninguém vê as cartas');
  banner.setAttribute('role', 'status');
  return banner;
}

export function renderMatchOver(won: boolean, onAgain: () => void): HTMLElement {
  const overlay = el('div', `match-over ${won ? 'won' : 'lost'}`);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'match-over-title');
  const title = el('h2', 'match-over-title', won ? 'Vitória!' : 'Derrota');
  title.id = 'match-over-title';
  overlay.append(title);
  const btn = el('button', 'btn primary', 'Voltar ao início');
  btn.type = 'button';
  btn.addEventListener('click', onAgain);
  overlay.append(btn);
  // Focus once the overlay is in the document.
  queueMicrotask(() => {
    btn.focus();
  });
  return overlay;
}
