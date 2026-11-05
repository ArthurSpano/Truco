import { describe, expect, it } from 'vitest';
import type {
  Card,
  CardId,
  GameEvent,
  GameIntent,
  GameMode,
  GameView,
  Rank,
  Seat,
  Suit,
} from '../shared/types.js';
import { makeCard } from './deck.js';
import { applyIntent, createGame, viewFor, type GameState, type IntentResult } from './game.js';
import { startHand, type HandOptions } from './hand.js';
import { handsVisibleTo } from './maoDeOnze.js';
import type { Scores } from './match.js';
import { nextInt, seedRng } from './rng.js';
import { seatsOf } from './seating.js';

const SUIT_BY_CODE: Record<string, Suit> = { c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' };

function c(id: CardId): Card {
  return makeCard(id[0] as Rank, SUIT_BY_CODE[id[1] ?? ''] as Suit);
}

// Vira 7 → manilha Q.
const VIRA = c('7d');

/**
 * Six disjoint non-manilha hands, enough for any mode. Playing each seat's
 * first card makes team 0 win trick 1 (3 beats 2) and tie trick 2, so team 0
 * wins the hand.
 */
const HANDS: CardId[][] = [
  ['3c', '4c', '5c'],
  ['2c', '4h', '5h'],
  ['3h', '4s', '5s'],
  ['2h', '4d', '5d'],
  ['3s', '6c', '6h'],
  ['2s', '6s', '6d'],
];

/** A game at `scores` on a fixed deal where seat 0 is the mão (the last seat deals). */
function gameAt(mode: GameMode, scores: Scores = [0, 0], options: HandOptions = {}): GameState {
  const hand = startHand(
    mode,
    mode - 1,
    HANDS.slice(0, mode).map((ids) => ids.map(c)),
    VIRA,
    options,
  );
  return { mode, scores, hand, handNumber: 1, winner: null, rng: seedRng(1) };
}

function ok(result: IntentResult): { state: GameState; events: GameEvent[] } {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result;
}

/** Applies intents in order, failing on any rejection; returns the final state and every event. */
function run(
  state: GameState,
  steps: readonly [Seat, GameIntent][],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  for (const [seat, intent] of steps) {
    const result = ok(applyIntent(s, seat, intent));
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

const play = (cardId: CardId, faceDown = false): GameIntent => ({
  t: 'play_card',
  cardId,
  faceDown,
});

/** Every seat plays the card at `index` of its fixed hand, in seat order from seat 0. */
function trickSteps(mode: GameMode, index: number): [Seat, GameIntent][] {
  return seatsOf(mode).map((seat) => [seat, play(HANDS[seat]?.[index] as CardId)]);
}

describe('createGame', () => {
  it.each([2, 4, 6] as const)('starts a %i-player match at 0 x 0 with 3 cards each', (mode) => {
    const game = createGame(mode, 42);
    expect(game.mode).toBe(mode);
    expect(game.scores).toEqual([0, 0]);
    expect(game.handNumber).toBe(1);
    expect(game.winner).toBeNull();
    expect(game.hand.hands).toHaveLength(mode);
    for (const hand of game.hand.hands) expect(hand).toHaveLength(3);
    expect(game.hand.turn).toBe(game.hand.mao);
  });

  it('is deterministic for a given seed', () => {
    expect(createGame(4, 7)).toEqual(createGame(4, 7));
    expect(createGame(4, 7)).not.toEqual(createGame(4, 8));
  });

  it('deals a random game without a seed', () => {
    const game = createGame(2);
    expect(game.hand.hands.flat()).toHaveLength(6);
  });

  it('rejects an invalid mode', () => {
    expect(() => createGame(3 as GameMode, 1)).toThrow(/mode/);
  });
});

describe('applyIntent', () => {
  it('plays a card and emits a public card_played event', () => {
    const { state, events } = ok(applyIntent(gameAt(2), 0, play('3c')));
    expect(state.hand.trick).toHaveLength(1);
    expect(state.hand.turn).toBe(1);
    expect(events).toEqual([
      { t: 'card_played', seat: 0, card: { seat: 0, faceDown: false, card: c('3c') } },
    ]);
  });

  it('does not mutate the state it is given', () => {
    const game = gameAt(2);
    const copy = structuredClone(game);
    applyIntent(game, 0, play('3c'));
    expect(game).toEqual(copy);
  });

  it('rejects illegal intents with an error code', () => {
    const game = gameAt(4);
    expect(applyIntent(game, 1, play('2c'))).toEqual({ ok: false, error: 'not_your_turn' });
    expect(applyIntent(game, 0, play('2c'))).toEqual({ ok: false, error: 'card_not_in_hand' });
    expect(applyIntent(game, 0, play('3c', true))).toEqual({
      ok: false,
      error: 'face_down_not_allowed',
    });
    expect(applyIntent(game, 0, { t: 'respond', answer: 'accept' })).toEqual({
      ok: false,
      error: 'no_truco_pending',
    });
    expect(applyIntent(game, 0, { t: 'mao11_decision', play: true })).toEqual({
      ok: false,
      error: 'no_decision_pending',
    });
    expect(applyIntent(game, 0, { t: 'play_blind', slot: 0 })).toEqual({
      ok: false,
      error: 'not_mao_de_ferro',
    });
  });

  it('rejects invalid seats and unknown intents without throwing', () => {
    const game = gameAt(2);
    for (const seat of [-1, 2, 0.5, NaN]) {
      expect(applyIntent(game, seat, play('3c'))).toEqual({ ok: false, error: 'invalid_seat' });
    }
    for (const bad of [{ t: 'shuffle' }, null, undefined, 'play_card', 7, []]) {
      expect(applyIntent(game, 0, bad as unknown as GameIntent)).toEqual({
        ok: false,
        error: 'invalid_intent',
      });
    }
  });

  it('emits trick_won when a trick completes, with the trick leader to play next', () => {
    const { state, events } = run(gameAt(4), trickSteps(4, 0));
    expect(events.at(-1)).toEqual({
      t: 'trick_won',
      winner: 0,
      leader: 0,
      cards: HANDS.slice(0, 4).map((ids, seat) => ({
        seat,
        faceDown: false,
        card: c(ids[0] as CardId),
      })),
    });
    expect(state.hand.turn).toBe(0);
    expect(state.hand.tricks).toHaveLength(1);
  });

  it('scores a decided hand and deals the next one, rotating the deal', () => {
    const game = gameAt(4);
    const { state, events } = run(game, [...trickSteps(4, 0), ...trickSteps(4, 1)]);
    expect(events.slice(-2)).toEqual([
      { t: 'hand_won', team: 0, points: 1, ranBy: null, scores: [1, 0] },
      { t: 'hand_dealt', handNumber: 2, dealer: 0, maoDeOnze: null, maoDeFerro: false },
    ]);
    expect(state.scores).toEqual([1, 0]);
    expect(state.handNumber).toBe(2);
    expect(state.hand.dealer).toBe(0);
    expect(state.hand.mao).toBe(1);
    expect(state.hand.hands.every((h) => h.length === 3)).toBe(true);
    expect(state.rng).not.toBe(game.rng);
  });

  describe('truco', () => {
    it('calls, raises and accepts through the ladder', () => {
      const { state, events } = run(gameAt(2), [
        [0, { t: 'call_truco' }],
        [1, { t: 'respond', answer: 'raise' }],
        [0, { t: 'respond', answer: 'accept' }],
      ]);
      expect(events).toEqual([
        { t: 'truco_called', seat: 0, stake: 3 },
        { t: 'truco_answered', seat: 1, answer: 'raise', stake: 6 },
        { t: 'truco_answered', seat: 0, answer: 'accept', stake: 6 },
      ]);
      expect(state.hand.value).toBe(6);
      expect(state.hand.truco).toBeNull();
      // Team 1 made the latest raise, so only team 0 may call Nove, and play resumes.
      expect(applyIntent(state, 1, { t: 'call_truco' })).toEqual({
        ok: false,
        error: 'not_your_turn',
      });
      expect(viewFor(state, 0).actions.callTruco).toBe(9);
      expect(applyIntent(state, 0, play('3c')).ok).toBe(true);
    });

    it('lets any member of the answering team respond, and not the callers', () => {
      const called = run(gameAt(6), [[0, { t: 'call_truco' }]]).state;
      expect(applyIntent(called, 2, { t: 'respond', answer: 'accept' })).toEqual({
        ok: false,
        error: 'not_your_team_to_answer',
      });
      expect(applyIntent(called, 5, { t: 'respond', answer: 'accept' }).ok).toBe(true);
      expect(applyIntent(called, 0, play('3c'))).toEqual({ ok: false, error: 'truco_pending' });
    });

    it('running ends the hand: the callers score the value before the call', () => {
      const { state, events } = run(gameAt(2, [3, 4]), [
        [0, { t: 'call_truco' }],
        [1, { t: 'respond', answer: 'run' }],
      ]);
      expect(events).toEqual([
        { t: 'truco_called', seat: 0, stake: 3 },
        { t: 'truco_answered', seat: 1, answer: 'run', stake: 3 },
        { t: 'hand_won', team: 0, points: 1, ranBy: 1, scores: [4, 4] },
        { t: 'hand_dealt', handNumber: 2, dealer: 0, maoDeOnze: null, maoDeFerro: false },
      ]);
      expect(state.scores).toEqual([4, 4]);
    });
  });

  describe('face-down cards', () => {
    it('hides a face-down card in events and in every view', () => {
      // Trick 1: seat 0 (3c) beats seat 1 (2c), so seat 0 leads trick 2.
      const afterTrick1 = run(gameAt(2), trickSteps(2, 0)).state;
      const { state, events } = ok(applyIntent(afterTrick1, 0, play('4c', true)));
      expect(events).toEqual([{ t: 'card_played', seat: 0, card: { seat: 0, faceDown: true } }]);
      expect(JSON.stringify(events)).not.toContain('4c');
      expect(JSON.stringify(viewFor(state, 1))).not.toContain('"4c"');
      expect(viewFor(state, 1).trick).toEqual([{ seat: 0, faceDown: true }]);
      // Still hidden once the trick is complete and resolved.
      const done = ok(applyIntent(state, 1, play('4h')));
      expect(JSON.stringify(done.events)).not.toContain('"4c"');
    });
  });

  describe('mão de onze', () => {
    it('lets the team at 11 run, giving the opponents 1 point', () => {
      const game = gameAt(4, [11, 5], { maoDeOnze: 0 });
      expect(applyIntent(game, 1, { t: 'mao11_decision', play: false })).toEqual({
        ok: false,
        error: 'not_your_team_to_decide',
      });
      expect(applyIntent(game, 0, play('3c'))).toEqual({
        ok: false,
        error: 'mao_de_onze_pending',
      });
      const { state, events } = ok(applyIntent(game, 2, { t: 'mao11_decision', play: false }));
      expect(events.slice(0, 2)).toEqual([
        { t: 'mao_de_onze_decided', seat: 2, play: false },
        { t: 'hand_won', team: 1, points: 1, ranBy: 0, scores: [11, 6] },
      ]);
      expect(events[2]).toMatchObject({ t: 'hand_dealt', handNumber: 2, maoDeOnze: 0 });
      expect(state.hand.maoDeOnze).toEqual({ team: 0, decision: 'pending' });
    });

    it('playing it makes the hand worth 3 and forbids truco', () => {
      const { state } = run(gameAt(2, [11, 5], { maoDeOnze: 0 }), [
        [0, { t: 'mao11_decision', play: true }],
      ]);
      expect(state.hand.value).toBe(3);
      expect(applyIntent(state, 0, { t: 'call_truco' })).toEqual({
        ok: false,
        error: 'truco_not_allowed',
      });
    });
  });

  describe('mão de ferro', () => {
    it('plays blind by slot and rejects picking a card by id', () => {
      const game = gameAt(2, [11, 11], { maoDeFerro: true });
      expect(applyIntent(game, 0, play('3c'))).toEqual({ ok: false, error: 'blind_play_required' });
      const { events } = ok(applyIntent(game, 0, { t: 'play_blind', slot: 0 }));
      expect(events).toEqual([
        { t: 'card_played', seat: 0, card: { seat: 0, faceDown: false, card: c('3c') } },
      ]);
    });

    it('wins the match on the hand', () => {
      const game = gameAt(2, [11, 11], { maoDeFerro: true });
      const blind = (seat: Seat): [Seat, GameIntent] => [seat, { t: 'play_blind', slot: 0 }];
      const { state, events } = run(game, [blind(0), blind(1), blind(0), blind(1)]);
      expect(events.slice(-2)).toEqual([
        { t: 'hand_won', team: 0, points: 1, ranBy: null, scores: [12, 11] },
        { t: 'match_won', team: 0, scores: [12, 11] },
      ]);
      expect(state.winner).toBe(0);
    });
  });

  it('ends the match at 12 and rejects every intent after that', () => {
    const { state, events } = run(gameAt(2, [10, 3]), [
      [0, { t: 'call_truco' }],
      [1, { t: 'respond', answer: 'accept' }],
      ...trickSteps(2, 0),
      ...trickSteps(2, 1),
    ]);
    expect(events.slice(-2)).toEqual([
      { t: 'hand_won', team: 0, points: 3, ranBy: null, scores: [12, 3] },
      { t: 'match_won', team: 0, scores: [12, 3] },
    ]);
    expect(state.winner).toBe(0);
    expect(state.handNumber).toBe(1);
    expect(applyIntent(state, 0, play('5c'))).toEqual({ ok: false, error: 'match_over' });
  });
});

describe('viewFor', () => {
  it('shows only your own cards, and card counts for everyone', () => {
    const view = viewFor(gameAt(4), 1);
    expect(view.seat).toBe(1);
    expect(view.team).toBe(1);
    expect(view.players.map((p) => p.cardCount)).toEqual([3, 3, 3, 3]);
    expect(view.players.map((p) => p.cards)).toEqual([null, HANDS[1]?.map(c), null, null]);
    expect(view.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
  });

  it('shows the public table state', () => {
    const state = run(gameAt(2, [2, 5]), trickSteps(2, 0)).state;
    const view = viewFor(state, 0);
    expect(view).toMatchObject({
      mode: 2,
      scores: [2, 5],
      handNumber: 1,
      dealer: 1,
      mao: 0,
      turn: 0,
      vira: VIRA,
      manilha: 'Q',
      value: 1,
      truco: null,
      raisedBy: null,
      maoDeOnze: null,
      maoDeFerro: false,
      trick: [],
      tricks: [
        {
          winner: 0,
          cards: [
            { seat: 0, faceDown: false, card: c('3c') },
            { seat: 1, faceDown: false, card: c('2c') },
          ],
        },
      ],
      winner: null,
    });
  });

  it('never includes the RNG state or other hands', () => {
    const game = createGame(6, 99);
    for (const seat of seatsOf(6)) {
      const json = JSON.stringify(viewFor(game, seat));
      expect(json).not.toContain('rng');
      game.hand.hands.forEach((hand, other) => {
        if (other === seat) return;
        for (const card of hand) expect(json).not.toContain(`"${card.id}"`);
      });
    }
  });

  it('is plain data, detached from the state', () => {
    const game = gameAt(2);
    const view = viewFor(game, 0);
    view.players[0]?.cards?.pop();
    view.vira.rank = '3';
    expect(game.hand.hands[0]).toHaveLength(3);
    expect(game.hand.vira).toEqual(VIRA);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('shows the team at 11 its partners’ cards while deciding a mão de onze', () => {
    const game = gameAt(6, [5, 11], { maoDeOnze: 1 });
    const deciding = viewFor(game, 3);
    expect(deciding.players.map((p) => p.cards !== null)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(deciding.actions.decideMaoDeOnze).toBe(true);
    const opponent = viewFor(game, 0);
    expect(opponent.players.map((p) => p.cards !== null)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(opponent.actions.decideMaoDeOnze).toBe(false);
  });

  it('hides even your own cards in a mão de ferro', () => {
    const view = viewFor(gameAt(2, [11, 11], { maoDeFerro: true }), 0);
    expect(view.players.map((p) => p.cards)).toEqual([null, null]);
    expect(view.players[0]?.cardCount).toBe(3);
    expect(view.actions).toEqual({
      play: false,
      playFaceDown: false,
      playBlind: true,
      callTruco: null,
      respond: null,
      decideMaoDeOnze: false,
    });
  });

  describe('actions', () => {
    it('lets the player on turn play or call truco, and nobody else', () => {
      const game = gameAt(4);
      expect(viewFor(game, 0).actions).toEqual({
        play: true,
        playFaceDown: false,
        playBlind: false,
        callTruco: 3,
        respond: null,
        decideMaoDeOnze: false,
      });
      for (const seat of [1, 2, 3]) {
        expect(viewFor(game, seat).actions).toEqual({
          play: false,
          playFaceDown: false,
          playBlind: false,
          callTruco: null,
          respond: null,
          decideMaoDeOnze: false,
        });
      }
    });

    it('allows face-down play from trick 2', () => {
      const state = run(gameAt(2), trickSteps(2, 0)).state;
      expect(viewFor(state, 0).actions.playFaceDown).toBe(true);
    });

    it('offers the answering team a response, with the raise stake', () => {
      const called = run(gameAt(4), [[0, { t: 'call_truco' }]]).state;
      for (const seat of [1, 3])
        expect(viewFor(called, seat).actions.respond).toEqual({ raise: 6 });
      for (const seat of [0, 2]) expect(viewFor(called, seat).actions.respond).toBeNull();
      expect(viewFor(called, 0).actions.play).toBe(false);
      expect(viewFor(called, 0).actions.callTruco).toBeNull();

      const atDoze = run(called, [
        [1, { t: 'respond', answer: 'raise' }],
        [2, { t: 'respond', answer: 'raise' }],
        [3, { t: 'respond', answer: 'raise' }],
      ]).state;
      expect(atDoze.hand.truco?.stake).toBe(12);
      expect(viewFor(atDoze, 0).actions.respond).toEqual({ raise: null });
    });

    it('stops the team that raised last from raising again', () => {
      // Seat 0 calls, team 1 accepts; then seat 1 (team 1) may call Seis on its turn.
      const accepted = run(gameAt(2), [
        [0, { t: 'call_truco' }],
        [1, { t: 'respond', answer: 'accept' }],
        [0, play('3c')],
      ]).state;
      expect(viewFor(accepted, 1).actions.callTruco).toBe(6);
      const afterTrick = run(accepted, [[1, play('2c')]]).state;
      expect(afterTrick.hand.turn).toBe(0);
      expect(viewFor(afterTrick, 0).actions.callTruco).toBeNull();
    });

    it('offers nothing once the match is over', () => {
      const over: GameState = { ...gameAt(2), winner: 0 };
      for (const seat of [0, 1]) {
        expect(
          Object.values(viewFor(over, seat).actions).every((a) => a === false || a === null),
        ).toBe(true);
      }
    });
  });

  it('throws on an invalid seat', () => {
    expect(() => viewFor(gameAt(2), 2)).toThrow(/seat/);
  });
});

/** Every intent the view says is legal for its seat. */
function legalIntents(view: GameView): GameIntent[] {
  const { actions } = view;
  const intents: GameIntent[] = [];
  if (actions.decideMaoDeOnze) {
    intents.push({ t: 'mao11_decision', play: true }, { t: 'mao11_decision', play: false });
  }
  if (actions.respond !== null) {
    intents.push({ t: 'respond', answer: 'accept' }, { t: 'respond', answer: 'run' });
    if (actions.respond.raise !== null) intents.push({ t: 'respond', answer: 'raise' });
  }
  if (actions.callTruco !== null) intents.push({ t: 'call_truco' });
  const cards = view.players[view.seat]?.cards ?? [];
  if (actions.play) for (const card of cards) intents.push(play(card.id));
  if (actions.playFaceDown) for (const card of cards) intents.push(play(card.id, true));
  if (actions.playBlind) {
    const count = view.players[view.seat]?.cardCount ?? 0;
    for (let slot = 0; slot < count; slot++) intents.push({ t: 'play_blind', slot });
  }
  return intents;
}

describe('random full matches driven only by views', () => {
  it.each([2, 4, 6] as const)(
    'plays %i-player matches to 12 using only advertised actions, never leaking cards',
    (mode) => {
      for (let seed = 1; seed <= 5; seed++) {
        let state = createGame(mode, seed);
        let rng = seedRng(seed * 1000);
        let steps = 0;

        while (state.winner === null) {
          if (++steps > 2000) throw new Error('Match did not finish');
          const views = seatsOf(mode).map((seat) => viewFor(state, seat));

          // No view shows a hand its seat may not see.
          for (const view of views) {
            const allowed = new Set(handsVisibleTo(state.hand, view.seat));
            const json = JSON.stringify(view);
            state.hand.hands.forEach((hand, other) => {
              if (allowed.has(other)) return;
              for (const card of hand) expect(json).not.toContain(`"${card.id}"`);
            });
          }

          const options = views.flatMap((view) =>
            legalIntents(view).map((intent) => [view.seat, intent] as const),
          );
          expect(options.length).toBeGreaterThan(0);
          const [pick, next] = nextInt(rng, options.length);
          rng = next;
          const [seat, intent] = options[pick] as (typeof options)[number];

          const result = applyIntent(state, seat, intent);
          if (!result.ok) throw new Error(`Advertised ${intent.t} rejected: ${result.error}`);
          for (const event of result.events) {
            if (event.t === 'card_played' && event.card.faceDown) {
              expect(event.card).toEqual({ seat, faceDown: true });
            }
          }
          state = result.state;
        }

        expect(Math.max(...state.scores)).toBe(12);
        expect(state.scores[state.winner]).toBe(12);
      }
    },
  );
});
