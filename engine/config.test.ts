import { describe, expect, it } from 'vitest';
import type { Team, TrickWinner } from '../shared/types.js';
import { RULES, ruleProblems, type RuleConfig, type TieRules } from './config.js';
import { handWinner } from './tricks.js';
import { nextStake } from './truco.js';

const T = (...tricks: TrickWinner[]): TrickWinner[] => tricks;
const STANDARD: TieRules = RULES.ties;
const rulesWith = (patch: Partial<RuleConfig>): RuleConfig => ({ ...RULES, ...patch });

describe('RULES (defaults)', () => {
  it('matches Truco Paulista as documented', () => {
    expect(RULES).toEqual({
      winningScore: 12,
      baseHandValue: 1,
      trucoLadder: [3, 6, 9, 12],
      ties: { firstWonThenTied: 'first_trick_winner', splitThenTied: 'first_trick_winner' },
      faceDownFromTrick: 2,
      maoDeOnzeScore: 11,
      maoDeOnzeValue: 3,
      maoDeOnzeRunValue: 1,
      maoDeFerroValue: 1,
    });
  });

  it('has no problems', () => {
    expect(ruleProblems(RULES)).toEqual([]);
  });

  it('handWinner and nextStake default to them', () => {
    expect(handWinner(T(0, null), 1)).toBe(handWinner(T(0, null), 1, RULES.ties));
    expect(handWinner(T(0, 1, null), 1)).toBe(0);
    expect(nextStake(1)).toBe(RULES.trucoLadder[0]);
  });
});

describe('ruleProblems', () => {
  it.each([
    ['winningScore', rulesWith({ winningScore: 0, maoDeOnzeScore: -1 })],
    ['baseHandValue', rulesWith({ baseHandValue: 1.5 })],
    ['maoDeOnzeValue', rulesWith({ maoDeOnzeValue: 0 })],
    ['maoDeOnzeRunValue', rulesWith({ maoDeOnzeRunValue: -1 })],
    ['maoDeFerroValue', rulesWith({ maoDeFerroValue: Number.NaN })],
    ['at least one step', rulesWith({ trucoLadder: [] })],
    ['positive integers', rulesWith({ trucoLadder: [3, 6.5, 9] })],
    ['rise strictly', rulesWith({ trucoLadder: [3, 9, 6, 12] })],
    ['rise strictly', rulesWith({ trucoLadder: [3, 3, 6] })],
    ['starting above baseHandValue', rulesWith({ trucoLadder: [1, 3, 6] })],
    ['one point short', rulesWith({ maoDeOnzeScore: 10 })],
    ['one point short', rulesWith({ winningScore: 15 })],
    ['faceDownFromTrick', rulesWith({ faceDownFromTrick: 0 })],
    ['faceDownFromTrick', rulesWith({ faceDownFromTrick: 4 })],
  ])('flags %s', (fragment, rules) => {
    const problems = ruleProblems(rules);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(fragment);
  });

  it('accepts sound variants', () => {
    expect(ruleProblems(rulesWith({ trucoLadder: [3, 6, 9, 12, 15] }))).toEqual([]);
    expect(ruleProblems(rulesWith({ winningScore: 24, maoDeOnzeScore: 23 }))).toEqual([]);
    expect(ruleProblems(rulesWith({ faceDownFromTrick: 1 }))).toEqual([]);
    expect(
      ruleProblems(rulesWith({ ties: { firstWonThenTied: 'play_third', splitThenTied: 'mao' } })),
    ).toEqual([]);
  });
});

describe('tie variant: trick 1 won, trick 2 tied', () => {
  const playThird: TieRules = { ...STANDARD, firstWonThenTied: 'play_third' };

  describe.each([0, 1] as const)('mão is team %i', (mao: Team) => {
    it('standard: the trick-1 winner takes the hand after two tricks', () => {
      expect(handWinner(T(0, null), mao, STANDARD)).toBe(0);
      expect(handWinner(T(1, null), mao, STANDARD)).toBe(1);
    });

    it.each([
      [T(0, null), null],
      [T(1, null), null],
      [T(0, null, 0), 0],
      [T(0, null, 1), 1],
      [T(1, null, 0), 0],
      [T(1, null, 1), 1],
      // Trick 3 tied too → the trick-1 winner.
      [T(0, null, null), 0],
      [T(1, null, null), 1],
    ] as const)('play_third: %j → %p', (tricks, expected) => {
      expect(handWinner(tricks, mao, playThird)).toBe(expected);
    });

    it('play_third leaves every other case alone', () => {
      for (const tricks of [T(0, 0), T(null, 1), T(0, 1, 1), T(null, null, null), T(1, 0, null)]) {
        expect(handWinner(tricks, mao, playThird)).toBe(handWinner(tricks, mao, STANDARD));
      }
    });
  });
});

describe('tie variant: 1-1, trick 3 tied', () => {
  const toMao: TieRules = { ...STANDARD, splitThenTied: 'mao' };

  it.each([
    // [tricks, mão team, standard winner, 'mao' variant winner]
    [T(0, 1, null), 0, 0, 0],
    [T(0, 1, null), 1, 0, 1],
    [T(1, 0, null), 0, 1, 0],
    [T(1, 0, null), 1, 1, 1],
  ] as const)('%j with mão %i → standard %i, mao variant %i', (tricks, mao, std, variant) => {
    expect(handWinner(tricks, mao, STANDARD)).toBe(std);
    expect(handWinner(tricks, mao, toMao)).toBe(variant);
  });

  it('a won trick 3 still decides', () => {
    expect(handWinner(T(0, 1, 1), 0, toMao)).toBe(1);
    expect(handWinner(T(1, 0, 0), 1, toMao)).toBe(0);
  });
});

describe('truco ladder variants', () => {
  it('climbs a custom ladder and stops at its top', () => {
    const ladder = [2, 4, 8];
    expect(nextStake(1, ladder)).toBe(2);
    expect(nextStake(2, ladder)).toBe(4);
    expect(nextStake(4, ladder)).toBe(8);
    expect(nextStake(8, ladder)).toBeNull();
  });

  it('a value between steps goes to the next step up', () => {
    // E.g. a mão de onze worth 3 on a 2-4-8 ladder.
    expect(nextStake(3, [2, 4, 8])).toBe(4);
  });
});
