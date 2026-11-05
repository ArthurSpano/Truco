/**
 * Rule variants: every Truco Paulista number and house rule the engine
 * depends on, in one place so a table's local rules are easy to tweak.
 *
 * The engine reads `RULES` directly; the pure helpers that implement a
 * variant (`handWinner`, `nextStake`) also accept their piece of the config
 * as an optional argument, so alternatives can be tested without editing
 * this file. After changing anything here run the tests: `ruleProblems`
 * flags settings that do not fit together (see config.test.ts).
 *
 * Structural constants that are not house rules (40-card deck, 3 cards per
 * player, best of 3 tricks) stay next to the code that uses them.
 */

/** How a hand is decided when some tricks are tied (*empate*, *embuchada*). */
export interface TieRules {
  /**
   * Trick 1 won, trick 2 tied:
   * - `'first_trick_winner'`: the trick-1 winner takes the hand at once (standard);
   * - `'play_third'`: trick 3 is played and decides; a tie there goes to the trick-1 winner.
   */
  readonly firstWonThenTied: 'first_trick_winner' | 'play_third';
  /**
   * One trick each, trick 3 tied:
   * - `'first_trick_winner'`: the trick-1 winner takes the hand (standard);
   * - `'mao'`: the team of the *mão* takes the hand.
   */
  readonly splitThenTied: 'first_trick_winner' | 'mao';
}

/*
 * Fixed tie rules, not configurable since every common variant agrees:
 * trick 1 tied → the next trick won decides; all three tied → the mão's team.
 */

export interface RuleConfig {
  /** Points a team needs to win the match. Scores are capped here. */
  readonly winningScore: number;
  /** What a hand is worth before anyone calls truco. */
  readonly baseHandValue: number;
  /** Values a hand can be raised to, in order: Truco, Seis, Nove, Doze. */
  readonly trucoLadder: readonly number[];
  readonly ties: TieRules;
  /** Face-down play (*encoberta*) is allowed from this trick on (1-based). */
  readonly faceDownFromTrick: number;
  /** Score at which a team plays a mão de onze (both at it: mão de ferro). */
  readonly maoDeOnzeScore: number;
  /** What a mão de onze is worth if the team at 11 decides to play. */
  readonly maoDeOnzeValue: number;
  /** What the opponents score if the team at 11 runs. */
  readonly maoDeOnzeRunValue: number;
  /** What a mão de ferro is worth. */
  readonly maoDeFerroValue: number;
}

/**
 * Truco Paulista as played by this game. Frozen (deeply) because every room
 * shares it: `readonly` only stops typed code, and a stray runtime mutation
 * would silently change the rules mid-match for everyone.
 */
export const RULES: RuleConfig = Object.freeze({
  winningScore: 12,
  baseHandValue: 1,
  trucoLadder: Object.freeze([3, 6, 9, 12]),
  ties: Object.freeze({
    firstWonThenTied: 'first_trick_winner',
    splitThenTied: 'first_trick_winner',
  } as const),
  faceDownFromTrick: 2,
  maoDeOnzeScore: 11,
  maoDeOnzeValue: 3,
  maoDeOnzeRunValue: 1,
  maoDeFerroValue: 1,
});

const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;

/**
 * Settings in `rules` that do not fit together, as human-readable messages;
 * empty when the config is sound.
 */
export function ruleProblems(rules: RuleConfig): string[] {
  const problems: string[] = [];
  const points = {
    winningScore: rules.winningScore,
    baseHandValue: rules.baseHandValue,
    maoDeOnzeValue: rules.maoDeOnzeValue,
    maoDeOnzeRunValue: rules.maoDeOnzeRunValue,
    maoDeFerroValue: rules.maoDeFerroValue,
  };
  for (const [name, value] of Object.entries(points)) {
    if (!isPositiveInt(value)) problems.push(`${name} must be a positive integer, got ${value}`);
  }

  const ladder = rules.trucoLadder;
  if (ladder.length === 0) problems.push('trucoLadder must have at least one step');
  if (!ladder.every(isPositiveInt)) problems.push('trucoLadder steps must be positive integers');
  if (ladder.some((step, i) => step <= (i === 0 ? rules.baseHandValue : (ladder[i - 1] ?? 0)))) {
    problems.push('trucoLadder must rise strictly, starting above baseHandValue');
  }

  if (rules.maoDeOnzeScore !== rules.winningScore - 1) {
    problems.push('maoDeOnzeScore must be one point short of winningScore');
  }
  if (!isPositiveInt(rules.faceDownFromTrick) || rules.faceDownFromTrick > 3) {
    problems.push('faceDownFromTrick must be 1, 2 or 3');
  }
  return problems;
}
