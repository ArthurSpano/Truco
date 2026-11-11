import { describe, expect, it } from 'vitest';
import type { GameEvent, GameView } from '../shared/types.js';
import { RULES } from './config.js';
import { applyIntent, createGame, viewFor, type GameState } from './game.js';
import { seatsOf } from './seating.js';
import {
  SimulationError,
  addStats,
  countEvents,
  emptyStats,
  legalChoices,
  legalIntents,
  plainStrategy,
  randomStrategy,
  simulateMatch,
  simulateMatches,
  stateViolations,
  stepViolations,
  viewViolations,
  type Strategy,
} from './simulate.js';

const MODES = [2, 4, 6] as const;

function viewsOf(state: GameState): GameView[] {
  return seatsOf(state.mode).map((seat) => viewFor(state, seat));
}

describe('simulateMatch', () => {
  it.each(MODES)('plays random %i-player matches to 12 with every invariant holding', (mode) => {
    for (let seed = 1; seed <= 30; seed++) {
      const result = simulateMatch(mode, seed);
      expect(result.scores[result.winner]).toBe(RULES.winningScore);
      expect(result.scores[1 - result.winner]).toBeLessThan(RULES.winningScore);
      expect(result.stats.hands).toBe(result.stats.handsWon[0] + result.stats.handsWon[1]);
    }
  });

  it.each(MODES)('plays calm %i-player matches, all the way to mão de onze', (mode) => {
    const batch = simulateMatches(mode, 1, 20, { strategy: plainStrategy });
    expect(batch.matches).toBe(20);
    expect(batch.stats.trucoCalls).toBe(0);
    expect(batch.stats.faceDownPlays).toBe(0);
    expect(batch.stats.maoDeOnzeRuns).toBe(0);
    // A match won 1 point at a time passes through 11 points.
    expect(batch.stats.maoDeOnzeHands + batch.stats.maoDeFerroHands).toBeGreaterThanOrEqual(20);
  });

  it.each(MODES)('exercises every rule over many random %i-player matches', (mode) => {
    const { stats, wins } = simulateMatches(mode, 100, 60);
    expect(wins[0]).toBeGreaterThan(0);
    expect(wins[1]).toBeGreaterThan(0);
    expect(stats.tiedTricks).toBeGreaterThan(0);
    expect(stats.faceDownPlays).toBeGreaterThan(0);
    expect(stats.trucoCalls).toBeGreaterThan(0);
    expect(stats.raises).toBeGreaterThan(0);
    expect(stats.accepts).toBeGreaterThan(0);
    expect(stats.runs).toBeGreaterThan(0);
    expect(stats.maoDeOnzeHands).toBeGreaterThan(0);
    expect(stats.maoDeOnzeRuns).toBeGreaterThan(0);
    expect(stats.maoDeFerroHands).toBeGreaterThan(0);
  });

  it('is deterministic for a mode, seed and strategy', () => {
    for (const mode of MODES) {
      const a = simulateMatch(mode, 7);
      const b = simulateMatch(mode, 7);
      expect(b.state).toEqual(a.state);
      expect(b.stats).toEqual(a.stats);
    }
    expect(simulateMatch(4, 8).state).not.toEqual(simulateMatch(4, 7).state);
  });

  it('deals the same cards whatever the players do', () => {
    // Hand N's deal depends only on the seed, never on how earlier hands went.
    const deals = (strategy: Strategy): string[] => {
      const out: string[] = [];
      simulateMatch(4, 3, {
        strategy,
        onStep: ({ events, state }) => {
          if (events.some((e) => e.t === 'hand_dealt')) {
            out.push(
              state.hand.hands
                .flat()
                .map((c) => c.id)
                .join() +
                '|' +
                state.hand.vira.id,
            );
          }
        },
      });
      return out;
    };
    const calm = deals(plainStrategy);
    const wild = deals(randomStrategy);
    const common = Math.min(calm.length, wild.length);
    expect(common).toBeGreaterThan(0);
    expect(calm.slice(0, common)).toEqual(wild.slice(0, common));
  });

  it('reports every step, and the events add up to the final score', () => {
    const events: GameEvent[] = [];
    let steps = 0;
    const result = simulateMatch(6, 11, {
      onStep: (s) => {
        steps++;
        expect(s.step).toBe(steps);
        expect(s.state.mode).toBe(6);
        events.push(...s.events);
      },
    });
    expect(result.stats.steps).toBe(steps);

    const scores = [0, 0];
    for (const e of events) {
      if (e.t !== 'hand_won') continue;
      scores[e.team] = Math.min((scores[e.team] ?? 0) + e.points, RULES.winningScore);
      expect(e.scores).toEqual(scores);
    }
    expect(scores).toEqual(result.scores);
    expect(events.filter((e) => e.t === 'match_won')).toEqual([
      { t: 'match_won', team: result.winner, scores: result.scores },
    ]);
  });

  it('fails with the seed and step when a strategy picks something illegal', () => {
    const broken: Strategy = (choices, _views, rng) => [choices.length, rng];
    expect(() => simulateMatch(2, 5, { strategy: broken })).toThrow(SimulationError);
    try {
      simulateMatch(2, 5, { strategy: broken });
    } catch (error) {
      expect(error).toMatchObject({ mode: 2, seed: 5, step: 1 });
      expect(String(error)).toContain('seed 5, step 1');
    }
  });

  it('gives up on a match that runs past maxSteps', () => {
    expect(() => simulateMatch(4, 1, { maxSteps: 3 })).toThrow(/no winner after 3 steps/);
  });
});

describe('legalIntents', () => {
  it('lists a card play per card for the seat on turn, and only truco for the others', () => {
    const state = createGame(4, 2);
    const turn = state.hand.turn ?? -1;
    for (const view of viewsOf(state)) {
      const intents = legalIntents(view);
      if (view.seat === turn) {
        expect(intents).toContainEqual({ t: 'call_truco' });
        expect(intents.filter((i) => i.t === 'play_card')).toHaveLength(3);
      } else {
        expect(intents).toEqual([]);
      }
    }
  });

  it('lists every answer to a pending truco, for each player of the answering team', () => {
    const start = createGame(4, 2);
    const caller = start.hand.turn ?? -1;
    const called = applyIntent(start, caller, { t: 'call_truco' });
    if (!called.ok) throw new Error(called.error);
    const choices = legalChoices(viewsOf(called.state));
    expect(new Set(choices.map((c) => c.seat))).toEqual(
      new Set([(caller + 1) % 4, (caller + 3) % 4]),
    );
    for (const seat of [(caller + 1) % 4, (caller + 3) % 4]) {
      expect(choices.filter((c) => c.seat === seat).map((c) => c.intent)).toEqual([
        { t: 'respond', answer: 'accept' },
        { t: 'respond', answer: 'run' },
        { t: 'respond', answer: 'raise' },
      ]);
    }
  });

  it('lists blind slots in a mão de ferro, and nothing that names a card', () => {
    let state: GameState | undefined;
    for (let seed = 1; state === undefined && seed < 50; seed++) {
      simulateMatch(2, seed, {
        strategy: plainStrategy,
        onStep: (s) => {
          if (state === undefined && s.state.hand.maoDeFerro) state = s.state;
        },
      });
    }
    if (state === undefined) throw new Error('No mão de ferro found');
    const turn = state.hand.turn ?? -1;
    const view = viewFor(state, turn);
    expect(legalIntents(view)).toEqual([
      { t: 'play_blind', slot: 0 },
      { t: 'play_blind', slot: 1 },
      { t: 'play_blind', slot: 2 },
    ]);
  });
});

describe('invariant checks', () => {
  const game = createGame(4, 9);

  it('accept a fresh game', () => {
    expect(stateViolations(game)).toEqual([]);
    expect(viewViolations(game, viewsOf(game))).toEqual([]);
  });

  it('catch a duplicated or missing card', () => {
    const hands = game.hand.hands.map((h) => [...h]);
    const first = hands[0]?.[0];
    if (first === undefined) throw new Error('empty hand');
    hands[1] = [first, ...(hands[1] ?? []).slice(1)];
    expect(stateViolations({ ...game, hand: { ...game.hand, hands } })).toContain(
      'a card appears twice',
    );
    const short = game.hand.hands.map((h, s) => (s === 0 ? h.slice(1) : h));
    expect(stateViolations({ ...game, hand: { ...game.hand, hands: short } })).toContain(
      '12 cards in play, expected 13',
    );
  });

  it('catch impossible scores, winners and hand values', () => {
    expect(stateViolations({ ...game, scores: [13, 0] })).toContain('score 13 out of range');
    expect(stateViolations({ ...game, scores: [12, 0] })).toContain(
      'winner null but scores are 12 x 0',
    );
    expect(stateViolations({ ...game, winner: 1 })).toContain('winner 1 but scores are 0 x 0');
    expect(stateViolations({ ...game, hand: { ...game.hand, value: 4 } })).toContain(
      'hand worth 4',
    );
    expect(
      stateViolations({
        ...game,
        hand: {
          ...game.hand,
          maoDeOnze: { team: 0, decision: 'play' },
          truco: { caller: 1, team: 1, stake: 3 },
        },
      }),
    ).toContain('truco in a mão de onze');
  });

  it('catch a view that leaks another hand, or miscounts cards', () => {
    const views = viewsOf(game);
    const leaky = views.map((view) => ({
      ...view,
      players: view.players.map((p) => ({
        ...p,
        cards: game.hand.hands[p.seat]?.map((c) => ({ ...c })) ?? null,
      })),
    }));
    const leaked = game.hand.hands[1]?.[0]?.id ?? '';
    expect(viewViolations(game, leaky)).toContain(`seat 0 sees hidden card ${leaked}`);

    const miscounted = views.map((view) => ({
      ...view,
      players: view.players.map((p) => ({ ...p, cardCount: 2 })),
    }));
    expect(viewViolations(game, miscounted)).toContain(
      'seat 0 sees the wrong card count for seat 0',
    );
  });

  it('catch a view that lets the wrong seat play', () => {
    const turn = game.hand.turn ?? -1;
    const views = viewsOf(game).map((view) => ({
      ...view,
      actions: { ...view.actions, play: view.seat !== turn },
    }));
    expect(viewViolations(game, views).join()).toMatch(/may play, expected \[\d\]/);
  });

  it('catch events that reveal a held card, and scores going down', () => {
    const held = game.hand.hands[2]?.[1];
    if (held === undefined) throw new Error('empty hand');
    const leak: GameEvent[] = [
      {
        t: 'trick_won',
        winner: 0,
        winnerSeat: 0,
        leader: 0,
        cards: [{ seat: 2, faceDown: false, card: held }],
      },
    ];
    expect(stepViolations(game, game, leak)).toContain(`events reveal ${held.id}`);

    // The card just played face up is fine to show.
    const played: GameEvent[] = [
      { t: 'card_played', seat: 2, card: { seat: 2, faceDown: false, card: held } },
    ];
    expect(stepViolations(game, game, played)).toEqual([]);

    expect(stepViolations({ ...game, scores: [3, 0] }, game, [])).toContain(
      'scores went down: 3 x 0 → 0 x 0',
    );
  });
});

describe('stats', () => {
  it('counts events and adds up batches', () => {
    const events: GameEvent[] = [
      { t: 'truco_called', seat: 0, stake: 3 },
      { t: 'truco_answered', seat: 1, answer: 'raise', stake: 6 },
      { t: 'truco_answered', seat: 0, answer: 'run', stake: 6 },
      {
        t: 'hand_won',
        team: 1,
        points: 3,
        ranBy: 0,
        reason: 'truco_run',
        tricks: [],
        scores: [0, 3],
      },
      { t: 'hand_dealt', handNumber: 2, dealer: 1, maoDeOnze: null, maoDeFerro: false },
    ];
    const one = countEvents(emptyStats(), events);
    expect(one).toMatchObject({
      steps: 1,
      trucoCalls: 1,
      raises: 1,
      runs: 1,
      hands: 1,
      handsWon: [0, 1],
    });
    const two = addStats(one, one);
    expect(two).toMatchObject({
      steps: 2,
      trucoCalls: 2,
      raises: 2,
      runs: 2,
      hands: 2,
      handsWon: [0, 2],
    });
  });
});
