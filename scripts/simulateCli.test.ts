import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../shared/types.js';
import { createGame } from '../engine/game.js';
import { simulateMatch, simulateMatches } from '../engine/simulate.js';
import {
  formatEvent,
  formatHand,
  formatSummaryHeader,
  formatSummaryRow,
  parseSimArgs,
  replayCommand,
} from './simulateCli.js';

describe('parseSimArgs', () => {
  it('defaults to 100 random matches per mode, from seed 1, in every mode', () => {
    expect(parseSimArgs([])).toEqual({
      modes: [2, 4, 6],
      games: 100,
      seed: 1,
      strategy: 'random',
      verbose: false,
      help: false,
    });
  });

  it('reads every option, long and short', () => {
    expect(
      parseSimArgs([
        '-m',
        '4',
        '--mode',
        '6',
        '-m',
        '4',
        '-n',
        '3',
        '-s',
        '42',
        '--strategy',
        'plain',
        '-v',
      ]),
    ).toEqual({ modes: [4, 6], games: 3, seed: 42, strategy: 'plain', verbose: true, help: false });
    expect(parseSimArgs(['--help'])).toMatchObject({ help: true });
  });

  it.each([
    [['--mode', '3'], /Invalid mode "3"/],
    [['--games', '0'], /Invalid game count/],
    [['--games', '2.5'], /Invalid game count/],
    [['--seed', 'abc'], /Invalid seed/],
    [['--strategy', 'cheat'], /Unknown strategy "cheat"/],
    [['--strategy', 'toString'], /Unknown strategy/],
    [['--bogus'], /bogus/],
    [['extra'], /extra/],
  ])('rejects %j', (argv, message) => {
    const result = parseSimArgs(argv);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(message);
  });
});

describe('formatting', () => {
  const game = createGame(2, 5);

  it('describes a hand with only public information', () => {
    const line = formatHand(game);
    expect(line).toBe(`Hand 1: dealer seat ${game.hand.dealer}, vira ${game.hand.vira.id}`);
    for (const card of game.hand.hands.flat()) expect(line).not.toContain(card.id);
  });

  it('formats every kind of event', () => {
    const card = game.hand.hands[0]?.[0];
    if (card === undefined) throw new Error('empty hand');
    const lines = (
      [
        { t: 'card_played', seat: 0, card: { seat: 0, faceDown: false, card } },
        { t: 'card_played', seat: 1, card: { seat: 1, faceDown: true } },
        { t: 'trick_won', winner: 1, leader: 1, cards: [] },
        { t: 'trick_won', winner: null, leader: 0, cards: [] },
        { t: 'truco_called', seat: 0, stake: 3 },
        { t: 'truco_answered', seat: 1, answer: 'raise', stake: 6 },
        { t: 'truco_answered', seat: 0, answer: 'accept', stake: 6 },
        { t: 'truco_answered', seat: 0, answer: 'run', stake: 9 },
        { t: 'mao_de_onze_decided', seat: 1, play: false },
        { t: 'hand_won', team: 0, points: 6, ranBy: 1, scores: [6, 2] },
        { t: 'match_won', team: 0, scores: [12, 2] },
      ] satisfies GameEvent[]
    ).map((e) => formatEvent(e, game));
    expect(lines).toEqual([
      `  seat 0 plays ${card.id}`,
      '  seat 1 plays a card face down',
      '  → trick to team B',
      '  → trick tied',
      '  seat 0: TRUCO! (3)',
      '  seat 1: SEIS! (6)',
      '  seat 0 accepts (6)',
      '  seat 0 runs',
      '  seat 1 decides to run from the mão de onze',
      '  team A wins the hand, +6 (team B ran) → 6 x 2',
      '\nteam A wins the match 12 x 2',
    ]);
  });

  it('only ever names cards played face up, and the vira, in a play-by-play', () => {
    for (const mode of [2, 4, 6] as const) {
      simulateMatch(mode, 21, {
        onStep: ({ events, state }) => {
          const text = events.map((e) => formatEvent(e, state)).join('\n');
          const allowed = new Set<string>();
          for (const e of events) {
            if (e.t === 'card_played' && !e.card.faceDown) allowed.add(e.card.card.id);
            if (e.t === 'hand_dealt') allowed.add(state.hand.vira.id);
          }
          const named = text.match(/\b[4-7QJKA23][chsd]\b/g) ?? [];
          for (const id of named) expect(allowed).toContain(id);
        },
      });
    }
  });

  it('labels special hands', () => {
    expect(formatHand({ ...game, hand: { ...game.hand, maoDeFerro: true } })).toMatch(
      / — mão de ferro$/,
    );
    expect(
      formatHand({ ...game, hand: { ...game.hand, maoDeOnze: { team: 1, decision: 'pending' } } }),
    ).toMatch(/ — mão de onze for team B$/);
  });

  it('lines the summary rows up under the header', () => {
    const header = formatSummaryHeader();
    const row = formatSummaryRow(simulateMatches(4, 1, 2), 12.4);
    expect(row).toHaveLength(header.length);
    expect(row.trimStart()).toMatch(/^4p\s+2\s/);
    expect(row.trimEnd()).toMatch(/\s12$/);
  });

  it('prints a replay command for one match', () => {
    expect(replayCommand(6, 99, 'plain')).toBe(
      'npm run simulate -- --mode 6 --seed 99 --games 1 --strategy plain --verbose',
    );
  });
});
