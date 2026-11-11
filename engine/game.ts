import type {
  GameActions,
  GameEvent,
  GameIntent,
  GameMode,
  GameView,
  HandEndReason,
  Seat,
  Team,
} from '../shared/types.js';
import { manilhaRank } from './deck.js';
import {
  faceDownAllowed,
  playBlind,
  playBlocked,
  playCard,
  type HandError,
  type HandState,
} from './hand.js';
import { decideMaoDeOnze, handsVisibleTo, type MaoDeOnzeError } from './maoDeOnze.js';
import { finishHand, startMatch, type MatchState } from './match.js';
import { seedRng } from './rng.js';
import { assertSeat, isGameMode, teamOf } from './seating.js';
import { tableCard } from './tricks.js';
import { callTruco, nextStake, respondTruco, type TrucoError } from './truco.js';

/**
 * The engine's public API, the only part the server needs:
 *
 * - `createGame(mode, seed)` starts a match;
 * - `applyIntent(state, seat, intent)` validates and applies one player's
 *   intent, returning the new state plus public events for animations;
 * - `viewFor(state, seat)` is the personalized snapshot sent to one player.
 *
 * Everything is pure: the state is plain data, never mutated. A decided hand
 * is scored and the next one dealt within the same `applyIntent` call, so
 * the state only ever rests on a hand in play (or on the last hand once the
 * match is over). The events (`trick_won`, `hand_won`, `hand_dealt`) carry
 * what the client needs to show the transition.
 */

/** The full, server-side game state. Hidden information: send players `viewFor` only. */
export type GameState = MatchState;

export type GameError =
  HandError | TrucoError | MaoDeOnzeError | 'match_over' | 'invalid_seat' | 'invalid_intent';

export type IntentResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: GameError };

/** A random RNG seed, for when the caller does not care about replaying the game. */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * Starts a match at 0 x 0 for `mode` players: draws the first dealer and
 * deals the first hand. The same `seed` always gives the same game; omit it
 * for a random one. Throws on an invalid mode (callers validate input first).
 */
export function createGame(mode: GameMode, seed: number = randomSeed()): GameState {
  if (!isGameMode(mode)) throw new Error(`Invalid game mode: ${String(mode)}`);
  return startMatch(mode, seedRng(seed));
}

function isSeat(seat: Seat, mode: GameMode): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < mode;
}

type HandStep =
  { ok: true; state: HandState; events: GameEvent[] } | { ok: false; error: GameError };

/**
 * `seat` tries to do `intent`. Illegal intents (out of turn, a card the
 * player does not hold, answering one's own truco...) are rejected with an
 * error code and leave the state untouched; they never throw.
 */
export function applyIntent(state: GameState, seat: Seat, intent: GameIntent): IntentResult {
  if (state.winner !== null) return { ok: false, error: 'match_over' };
  if (!isSeat(seat, state.mode)) return { ok: false, error: 'invalid_seat' };
  // Guards against unvalidated runtime input such as `null` parsed from JSON.
  const raw: unknown = intent;
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalid_intent' };

  const step = applyToHand(state.hand, seat, intent);
  if (!step.ok) return step;

  const played: GameState = { ...state, hand: step.state };
  const winner = step.state.winner;
  if (winner === null) return { ok: true, state: played, events: step.events };
  return finish(played, winner, step.events);
}

function applyToHand(hand: HandState, seat: Seat, intent: GameIntent): HandStep {
  switch (intent.t) {
    case 'play_card': {
      const result = playCard(hand, seat, intent.cardId, intent.faceDown === true);
      return result.ok ? { ...result, events: playEvents(hand, result.state, seat) } : result;
    }
    case 'play_blind': {
      const result = playBlind(hand, seat, intent.slot);
      return result.ok ? { ...result, events: playEvents(hand, result.state, seat) } : result;
    }
    case 'call_truco': {
      const result = callTruco(hand, seat);
      if (!result.ok) return result;
      const stake = pendingStake(result.state);
      return { ...result, events: [{ t: 'truco_called', seat, stake }] };
    }
    case 'respond': {
      const call = hand.truco;
      const result = respondTruco(hand, seat, intent.answer);
      if (!result.ok) return result;
      // Unreachable: respondTruco only succeeds with a call pending.
      if (call === null) throw new Error('Truco answered with no call pending');
      const stake = intent.answer === 'raise' ? pendingStake(result.state) : call.stake;
      return {
        ...result,
        events: [{ t: 'truco_answered', seat, answer: intent.answer, stake }],
      };
    }
    case 'mao11_decision': {
      const result = decideMaoDeOnze(hand, seat, intent.play);
      if (!result.ok) return result;
      return { ...result, events: [{ t: 'mao_de_onze_decided', seat, play: intent.play }] };
    }
    default:
      // Unreachable for typed callers; guards against unvalidated runtime input.
      return { ok: false, error: 'invalid_intent' };
  }
}

function pendingStake(hand: HandState): number {
  // Unreachable: only called right after a successful call or raise.
  if (hand.truco === null) throw new Error('No truco call pending');
  return hand.truco.stake;
}

/** Events for a card `seat` just played: the card itself and, if it completed one, the trick. */
function playEvents(before: HandState, after: HandState, seat: Seat): GameEvent[] {
  const completed =
    after.tricks.length > before.tricks.length ? after.tricks[after.tricks.length - 1] : undefined;
  const plays = completed?.plays ?? after.trick;
  const play = plays[plays.length - 1];
  // Unreachable: a successful play always lands on the table.
  if (play === undefined) throw new Error('Played card not found on the table');

  const events: GameEvent[] = [{ t: 'card_played', seat, card: tableCard(play) }];
  if (completed !== undefined) {
    events.push({
      t: 'trick_won',
      winner: completed.result.winner,
      winnerSeat: completed.result.winner === null ? null : completed.result.leader,
      leader: completed.result.leader,
      cards: completed.plays.map(tableCard),
    });
  }
  return events;
}

function handEndReason(hand: HandState): HandEndReason {
  if (hand.ranBy === null) return 'tricks';
  return hand.maoDeOnze?.decision === 'run' ? 'mao_de_onze_run' : 'truco_run';
}

/** Scores the decided hand, then either ends the match or deals the next hand. */
function finish(state: GameState, winner: Team, events: GameEvent[]): IntentResult {
  const result = finishHand(state);
  // Unreachable: the hand is decided and the match was not over.
  if (!result.ok) throw new Error(`Could not finish the hand: ${result.error}`);
  const next = result.state;
  const scores: [number, number] = [...next.scores];

  const out: GameEvent[] = [
    ...events,
    {
      t: 'hand_won',
      team: winner,
      points: state.hand.value,
      ranBy: state.hand.ranBy,
      reason: handEndReason(state.hand),
      tricks: state.hand.tricks.map((t) => t.result.winner),
      scores,
    },
  ];
  if (next.winner !== null) {
    out.push({ t: 'match_won', team: next.winner, scores });
  } else {
    out.push({
      t: 'hand_dealt',
      handNumber: next.handNumber,
      dealer: next.hand.dealer,
      maoDeOnze: next.hand.maoDeOnze?.team ?? null,
      maoDeFerro: next.hand.maoDeFerro,
    });
  }
  return { ok: true, state: next, events: out };
}

/**
 * The game as `seat` sees it: public table state, the hands `seat` may look
 * at (its own; its team's during a mão de onze decision; none in a mão de
 * ferro), card counts for everyone else, and what `seat` may do now.
 * Face-down cards and the RNG state never appear. Throws on an invalid seat.
 */
export function viewFor(state: GameState, seat: Seat): GameView {
  assertSeat(seat, state.mode);
  const { hand } = state;
  const visible = new Set(handsVisibleTo(hand, seat));

  return {
    mode: state.mode,
    seat,
    team: teamOf(seat),
    scores: [...state.scores],
    handNumber: state.handNumber,
    dealer: hand.dealer,
    mao: hand.mao,
    turn: hand.turn,
    vira: { ...hand.vira },
    manilha: manilhaRank(hand.vira),
    value: hand.value,
    truco: hand.truco === null ? null : { ...hand.truco },
    raisedBy: hand.raisedBy,
    maoDeOnze: hand.maoDeOnze === null ? null : { ...hand.maoDeOnze },
    maoDeFerro: hand.maoDeFerro,
    players: hand.hands.map((cards, s) => ({
      seat: s,
      team: teamOf(s),
      cardCount: cards.length,
      cards: visible.has(s) ? cards.map((card) => ({ ...card })) : null,
    })),
    trick: hand.trick.map(tableCard),
    tricks: hand.tricks.map((t) => ({
      cards: t.plays.map(tableCard),
      winner: t.result.winner,
      winnerSeat: t.result.winner === null ? null : t.result.leader,
    })),
    winner: state.winner,
    actions: actionsFor(state, seat),
  };
}

const NO_ACTIONS: GameActions = {
  play: false,
  playFaceDown: false,
  playBlind: false,
  callTruco: null,
  respond: null,
  decideMaoDeOnze: false,
};

/** What `seat` may do right now, derived from the same checks `applyIntent` uses. */
function actionsFor(state: GameState, seat: Seat): GameActions {
  if (state.winner !== null) return { ...NO_ACTIONS };
  const { hand } = state;
  const team = teamOf(seat);
  const canPlay = playBlocked(hand, seat) === null;
  const truco = callTruco(hand, seat);
  const call = hand.truco;
  const onze = hand.maoDeOnze;

  return {
    play: canPlay && !hand.maoDeFerro,
    playFaceDown: canPlay && faceDownAllowed(hand),
    playBlind: canPlay && hand.maoDeFerro,
    callTruco: truco.ok ? pendingStake(truco.state) : null,
    respond: call !== null && call.team !== team ? { raise: nextStake(call.stake) } : null,
    decideMaoDeOnze: onze !== null && onze.decision === 'pending' && onze.team === team,
  };
}
