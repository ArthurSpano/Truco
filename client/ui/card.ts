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

/** Suit colour class of the V1 card (`.c.sh` etc.): red for hearts and diamonds via CSS. */
const SUIT_CLASS: Record<Suit, string> = {
  clubs: 'sc',
  hearts: 'sh',
  spades: 'ss',
  diamonds: 'sd',
};

/**
 * A card face: rank + suit in two opposite corners and a big suit glyph in the middle.
 * Sized entirely in `em`, so the container's `font-size` sets the card size.
 */
export function renderCard(
  card: Card,
  opts: { manilha?: boolean; selected?: boolean } = {},
): HTMLElement {
  const root = el('div', `c ${SUIT_CLASS[card.suit]} ${suitColor(card.suit)}`);
  if (opts.manilha) root.classList.add('man');
  if (opts.selected) root.classList.add('selected');
  root.dataset.cardId = card.id;
  // No role here: the hand wraps cards in buttons, which supply the role; the label stays.
  root.setAttribute('aria-label', cardAriaLabel(card));

  const glyph = suitGlyph(card.suit);
  const corner = (pos: 'tl' | 'br'): HTMLElement => {
    const c = el('div', `cn ${pos}`);
    c.setAttribute('aria-hidden', 'true');
    c.append(el('b', undefined, rankLabel(card.rank)), el('i', undefined, glyph));
    return c;
  };
  const mid = el('div', 'mid', glyph);
  mid.setAttribute('aria-hidden', 'true');
  root.append(corner('tl'), mid, corner('br'));
  return root;
}

export function renderCardBack(): HTMLElement {
  const root = el('div', 'bk');
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
  const face = renderCard(tc.card, {
    manilha: manilhaRank !== null && tc.card.rank === manilhaRank,
  });
  face.setAttribute('role', 'img'); // table cards are not wrapped in a button
  return face;
}
