import { describe, expect, it, vi } from 'vitest';
import type { Card, CardId, Rank, Seat, Suit } from '../shared/types.js';
import type * as ConfigModule from './config.js';
import { RULES, ruleProblems } from './config.js';
import { makeCard } from './deck.js';
import { playCard, startHand, type HandState } from './hand.js';
import { isMaoDeFerro } from './maoDeFerro.js';
import { decideMaoDeOnze, maoDeOnzeTeam } from './maoDeOnze.js';
import { addPoints, handOptionsFor, matchWinner } from './match.js';
import { callTruco, respondTruco } from './truco.js';

/*
 * End-to-end check that editing config.ts really changes the engine: the
 * whole module is swapped for a house-rules variant, and the hand, truco,
 * mão de onze/ferro and match code must all follow it without being passed
 * anything. (config.test.ts covers the pure helpers with explicit arguments.)
 */
vi.mock('./config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ConfigModule>();
  const variant: ConfigModule.RuleConfig = {
    winningScore: 24,
    baseHandValue: 1,
    trucoLadder: [2, 4, 8],
    ties: { firstWonThenTied: 'play_third', splitThenTied: 'mao' },
    faceDownFromTrick: 1,
    maoDeOnzeScore: 23,
    maoDeOnzeValue: 5,
    maoDeOnzeRunValue: 2,
    maoDeFerroValue: 2,
  };
  return { ...actual, RULES: variant };
});

const SUIT_BY_CODE: Record<string, Suit> = { c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' };
const c = (id: CardId): Card => makeCard(id[0] as Rank, SUIT_BY_CODE[id[1] ?? ''] as Suit);

// Vira 7 → manilha Q, so none of the cards below is a manilha.
const VIRA = c('7d');

/** A 2-player hand where seat 0 is the mão (seat 1 deals). */
const deal = (seat0: CardId[], seat1: CardId[], options = {}): HandState =>
  startHand(2, 1, [seat0.map(c), seat1.map(c)], VIRA, options);

function ok(result: { ok: true; state: HandState } | { ok: false; error: string }): HandState {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

function playAll(state: HandState, ...plays: [Seat, CardId][]): HandState {
  return plays.reduce((s, [seat, id]) => ok(playCard(s, seat, id)), state);
}

describe('engine under a variant config.ts', () => {
  it('the variant itself is sound', () => {
    expect(RULES.winningScore).toBe(24);
    expect(ruleProblems(RULES)).toEqual([]);
  });

  it('play_third: trick 1 won, trick 2 tied → trick 3 is played and decides', () => {
    let s = deal(['3c', '4c', '5c'], ['2c', '4h', '6h']);
    s = playAll(s, [0, '3c'], [1, '2c'], [0, '4c'], [1, '4h']);
    // The standard rule would hand it to team 0 here.
    expect(s.winner).toBeNull();
    expect(s.turn).toBe(0);
    s = playAll(s, [0, '5c'], [1, '6h']);
    expect(s.winner).toBe(1);
  });

  it("splitThenTied 'mao': 1-1 and trick 3 tied → the mão's team", () => {
    let s = deal(['4c', '3c', '5c'], ['2c', '4h', '5h']);
    s = playAll(s, [0, '4c'], [1, '2c'], [1, '4h'], [0, '3c'], [0, '5c'], [1, '5h']);
    // The standard rule would give it to team 1, the trick-1 winner.
    expect(s.winner).toBe(0);
  });

  it('faceDownFromTrick 1: encoberta is allowed in the first trick', () => {
    const s = deal(['3c', '4c', '5c'], ['2c', '4h', '6h']);
    expect(playCard(s, 0, '3c', true).ok).toBe(true);
  });

  it('the truco ladder climbs 1 → 2 → 4 → 8 and stops', () => {
    let s = deal(['3c', '4c', '5c'], ['2c', '4h', '6h']);
    expect(s.value).toBe(1);
    s = ok(callTruco(s, 0));
    expect(s.truco?.stake).toBe(2);
    s = ok(respondTruco(s, 1, 'raise'));
    expect(s.truco?.stake).toBe(4);
    s = ok(respondTruco(s, 0, 'raise'));
    expect(s.truco?.stake).toBe(8);
    expect(respondTruco(s, 1, 'raise')).toEqual({ ok: false, error: 'ladder_maxed' });
    s = ok(respondTruco(s, 1, 'accept'));
    expect(s.value).toBe(8);
  });

  it('mão de onze happens at 23 and is worth 5, or 2 to the opponents on a run', () => {
    expect(maoDeOnzeTeam([11, 0])).toBeNull();
    expect(maoDeOnzeTeam([23, 0])).toBe(0);
    expect(handOptionsFor([0, 23])).toEqual({ maoDeOnze: 1 });
    const s = deal(['3c', '4c', '5c'], ['2c', '4h', '6h'], { maoDeOnze: 0 });
    expect(ok(decideMaoDeOnze(s, 0, true)).value).toBe(5);
    const ran = ok(decideMaoDeOnze(s, 0, false));
    expect(ran.value).toBe(2);
    expect(ran.winner).toBe(1);
  });

  it('mão de ferro happens at 23-23 and is worth 2', () => {
    expect(isMaoDeFerro([11, 11])).toBe(false);
    expect(isMaoDeFerro([23, 23])).toBe(true);
    expect(deal(['3c', '4c', '5c'], ['2c', '4h', '6h'], { maoDeFerro: true }).value).toBe(2);
  });

  it('the match is won, and scores capped, at 24', () => {
    expect(matchWinner([12, 0])).toBeNull();
    expect(addPoints([22, 0], 0, 8)).toEqual([24, 0]);
    expect(matchWinner([24, 3])).toBe(0);
  });
});
