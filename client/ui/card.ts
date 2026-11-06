import type { Card, Rank, Suit, TableCard } from '../../shared/types.js';
import { el } from './dom.js';

const GLYPHS: Record<Suit, string> = { clubs: '♣', hearts: '♥', spades: '♠', diamonds: '♦' };
const SUIT_NAMES: Record<Suit, string> = {
  clubs: 'paus',
  hearts: 'copas',
  spades: 'espadas',
  diamonds: 'ouros',
};

export function suitGlyph(suit: Suit): string {
  return GLYPHS[suit];
}

export function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

/** Identity today; kept so there is one place to change how ranks are printed. */
export function rankLabel(rank: Rank): string {
  return rank;
}

/** Screen-reader label in pt-BR, e.g. "3 de copas". */
export function cardAriaLabel(card: Card): string {
  return `${rankLabel(card.rank)} de ${SUIT_NAMES[card.suit]}`;
}

export function renderCard(
  card: Card,
  opts: { manilha?: boolean; selected?: boolean } = {},
): HTMLElement {
  const root = el('div', `card ${suitColor(card.suit)}`);
  if (opts.manilha) root.classList.add('manilha');
  if (opts.selected) root.classList.add('selected');
  root.dataset.cardId = card.id;
  // No role here: the hand wraps cards in buttons, which supply the role; the label stays.
  root.setAttribute('aria-label', cardAriaLabel(card));

  const corner = el('div', 'card-corner');
  corner.append(
    el('span', 'card-rank', rankLabel(card.rank)),
    el('span', 'card-suit', suitGlyph(card.suit)),
  );
  root.append(corner, el('div', 'card-pip', suitGlyph(card.suit)));
  return root;
}

export function renderCardBack(): HTMLElement {
  const root = el('div', 'card card-back');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Carta virada');
  return root;
}

/** A face-down table card carries no identity, so only the back is ever drawn for it. */
export function renderTableCard(tc: TableCard, manilhaRank: Rank | null): HTMLElement {
  if (tc.faceDown) {
    const back = renderCardBack();
    back.classList.add('encoberta');
    back.setAttribute('aria-label', 'Carta encoberta');
    return back;
  }
  return renderCard(tc.card, { manilha: manilhaRank !== null && tc.card.rank === manilhaRank });
}
