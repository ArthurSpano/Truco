import type { Card, CardId, GameMode, Seat, Team } from '../shared/types.js';
import { DECK_SIZE, createDeck } from './deck.js';
import { shuffle, type RngState } from './rng.js';
import { assertSeat, maoSeat, nextSeat, teamOf, turnOrder } from './seating.js';
import {
  TRICKS_PER_HAND,
  handWinner,
  resolveTrick,
  type TrickPlay,
  type TrickResult,
} from './tricks.js';
import { BASE_HAND_VALUE, type TrucoCall } from './truco.js';

/**
 * One hand of Truco as a small pure state machine: deal, then each player
 * plays one card per trick in counter-clockwise order until the hand is
 * decided. Scoring, truco and match flow are layered on top of this.
 */

/** Cards dealt to each player, in every mode. */
export const CARDS_PER_PLAYER = 3;

export interface CompletedTrick {
  /** Cards in playing order. */
  plays: readonly TrickPlay[];
  result: TrickResult;
}

export interface HandState {
  readonly mode: GameMode;
  readonly dealer: Seat;
  /** The player to the dealer's right: leads trick 1 and wins an all-tied hand. */
  readonly mao: Seat;
  readonly vira: Card;
  /** Cards still held, indexed by seat. Hidden information: never send other seats' hands. */
  readonly hands: readonly (readonly Card[])[];
  /**
   * Cards played so far to the trick in progress, in playing order.
   * Hidden information: face-down plays keep their real card; show them via `tableCard`.
   */
  readonly trick: readonly TrickPlay[];
  /** Finished tricks, oldest first. Same hidden-information caveat as `trick`. */
  readonly tricks: readonly CompletedTrick[];
  /** Seat expected to play next, or `null` once the hand is decided. */
  readonly turn: Seat | null;
  /** Team that won the hand, or `null` while it is still being played. */
  readonly winner: Team | null;
  /** Points the hand is worth: 1, or the last accepted step of the truco ladder. */
  readonly value: number;
  /** A truco call or raise waiting for an answer. Cards cannot be played meanwhile. */
  readonly truco: TrucoCall | null;
  /** Team that made the latest accepted raise: only the other team may raise next. */
  readonly raisedBy: Team | null;
  /** Team that ran from a truco call, ending the hand early; `null` otherwise. */
  readonly ranBy: Team | null;
}

/**
 * Starts a hand from a given deal. `hands` is indexed by seat and must hold
 * exactly 3 cards per player, with no card repeated (vira included).
 */
export function startHand(
  mode: GameMode,
  dealer: Seat,
  hands: readonly (readonly Card[])[],
  vira: Card,
): HandState {
  assertSeat(dealer, mode);
  if (hands.length !== mode) {
    throw new Error(`Expected ${mode} hands, got ${hands.length}`);
  }
  const seen = new Set<CardId>([vira.id]);
  hands.forEach((hand, seat) => {
    if (hand.length !== CARDS_PER_PLAYER) {
      throw new Error(`Seat ${seat} has ${hand.length} cards, expected ${CARDS_PER_PLAYER}`);
    }
    for (const card of hand) {
      if (seen.has(card.id)) throw new Error(`Card ${card.id} dealt twice`);
      seen.add(card.id);
    }
  });

  const mao = maoSeat(dealer, mode);
  return {
    mode,
    dealer,
    mao,
    vira,
    hands: hands.map((hand) => [...hand]),
    trick: [],
    tricks: [],
    turn: mao,
    winner: null,
    value: BASE_HAND_VALUE,
    truco: null,
    raisedBy: null,
    ranBy: null,
  };
}

/**
 * Shuffles a fresh deck and deals: one card at a time, counter-clockwise
 * starting with the mão, three rounds; then the next card is turned up as
 * the vira. Returns the advanced RNG state.
 */
export function dealHand(
  mode: GameMode,
  dealer: Seat,
  rng: RngState,
): [hand: HandState, next: RngState] {
  assertSeat(dealer, mode);
  const [deck, next] = shuffle(createDeck(), rng);
  const order = turnOrder(maoSeat(dealer, mode), mode);
  const hands: Card[][] = Array.from({ length: mode }, () => []);

  let i = 0;
  const draw = (): Card => {
    const card = deck[i++];
    // Unreachable: at most 6 × 3 + 1 = 19 of the 40 cards are drawn.
    if (card === undefined) throw new Error(`Deck exhausted after ${DECK_SIZE} cards`);
    return card;
  };
  for (let round = 0; round < CARDS_PER_PLAYER; round++) {
    for (const seat of order) hands[seat]?.push(draw());
  }
  const vira = draw();

  return [startHand(mode, dealer, hands, vira), next];
}

export type HandError =
  'hand_over' | 'truco_pending' | 'not_your_turn' | 'card_not_in_hand' | 'face_down_not_allowed';

export type PlayResult = { ok: true; state: HandState } | { ok: false; error: HandError };

/** Face-down play (*encoberta*) is only allowed from this trick on (1-based). */
export const FACE_DOWN_FROM_TRICK = 2;

/**
 * `seat` plays `cardId`, face up or, from trick 2 on, face down. Rejects
 * (without throwing) plays out of turn, after the hand is decided, while a
 * truco call awaits an answer, of a card the player does not hold, or face
 * down in trick 1. When the trick
 * completes it is resolved, and either the hand is decided or the trick's
 * leader starts the next one.
 */
export function playCard(
  state: HandState,
  seat: Seat,
  cardId: CardId,
  faceDown = false,
): PlayResult {
  if (state.winner !== null || state.turn === null) return { ok: false, error: 'hand_over' };
  if (state.truco !== null) return { ok: false, error: 'truco_pending' };
  if (seat !== state.turn) return { ok: false, error: 'not_your_turn' };

  const hand = state.hands[seat] ?? [];
  const card = hand.find((c) => c.id === cardId);
  if (card === undefined) return { ok: false, error: 'card_not_in_hand' };
  if (faceDown && state.tricks.length + 1 < FACE_DOWN_FROM_TRICK) {
    return { ok: false, error: 'face_down_not_allowed' };
  }

  const hands = state.hands.map((h, s) => (s === seat ? h.filter((c) => c.id !== cardId) : h));
  const trick = [...state.trick, { seat, card, faceDown }];

  if (trick.length < state.mode) {
    return { ok: true, state: { ...state, hands, trick, turn: nextSeat(seat, state.mode) } };
  }

  const result = resolveTrick(trick, state.vira);
  const tricks = [...state.tricks, { plays: trick, result }];
  const winner = handWinner(
    tricks.map((t) => t.result.winner),
    teamOf(state.mao),
  );
  if (winner === null && tricks.length >= TRICKS_PER_HAND) {
    // Unreachable: handWinner always decides once all three tricks are played.
    throw new Error('Hand undecided after three tricks');
  }

  return {
    ok: true,
    state: {
      ...state,
      hands,
      trick: [],
      tricks,
      turn: winner === null ? result.leader : null,
      winner,
    },
  };
}
