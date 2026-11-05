import { parseArgs } from 'node:util';
import type { GameEvent, GameMode, Team } from '../shared/types.js';
import type { GameState } from '../engine/game.js';
import { isGameMode } from '../engine/seating.js';
import { STRATEGIES, type BatchResult, type StrategyName } from '../engine/simulate.js';

/**
 * The pure half of `npm run simulate`: argument parsing and output
 * formatting, kept apart from the entry point so it can be tested.
 */

export interface SimArgs {
  modes: GameMode[];
  games: number;
  seed: number;
  strategy: StrategyName;
  /** Print a play-by-play of every match (public events only). */
  verbose: boolean;
  help: boolean;
}

export const USAGE = `Usage: npm run simulate -- [options]

Plays whole Truco matches through the engine with simulated players,
checking every invariant after every step.

Options:
  -m, --mode <2|4|6>        Players per match; repeat for several (default: 2, 4 and 6)
  -n, --games <count>       Matches per mode (default: 100)
  -s, --seed <seed>         First seed; match i uses seed + i (default: 1)
      --strategy <name>     random (anything legal) or plain (no truco) (default: random)
  -v, --verbose             Print a play-by-play of every match
  -h, --help                Show this help`;

function isStrategy(name: string): name is StrategyName {
  return Object.hasOwn(STRATEGIES, name);
}

/** Parses CLI arguments (without `node` and the script path). */
export function parseSimArgs(argv: readonly string[]): SimArgs | { error: string } {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        mode: { type: 'string', short: 'm', multiple: true },
        games: { type: 'string', short: 'n', default: '100' },
        seed: { type: 'string', short: 's', default: '1' },
        strategy: { type: 'string', default: 'random' },
        verbose: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const modes: GameMode[] = [];
  for (const raw of values.mode ?? ['2', '4', '6']) {
    const mode = Number(raw);
    if (!isGameMode(mode)) return { error: `Invalid mode "${raw}": use 2, 4 or 6` };
    if (!modes.includes(mode)) modes.push(mode);
  }

  const games = Number(values.games);
  if (!Number.isInteger(games) || games < 1) {
    return { error: `Invalid game count "${values.games}": use a positive integer` };
  }
  const seed = Number(values.seed);
  if (!Number.isSafeInteger(seed))
    return { error: `Invalid seed "${values.seed}": use an integer` };
  if (!isStrategy(values.strategy)) {
    return { error: `Unknown strategy "${values.strategy}": use random or plain` };
  }

  return {
    modes,
    games,
    seed,
    strategy: values.strategy,
    verbose: values.verbose,
    help: values.help,
  };
}

const TEAM_NAMES = ['A', 'B'] as const;

function team(t: Team): string {
  return `team ${TEAM_NAMES[t]}`;
}

const STAKE_CALLS: Record<number, string> = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };

function stakeName(stake: number): string {
  return `${STAKE_CALLS[stake] ?? 'RAISE'}! (${stake})`;
}

/** Header line for a hand: number, dealer, vira and any special kind. All public. */
export function formatHand(state: GameState): string {
  const { hand } = state;
  const kind = hand.maoDeFerro
    ? ' — mão de ferro'
    : hand.maoDeOnze !== null
      ? ` — mão de onze for ${team(hand.maoDeOnze.team)}`
      : '';
  return `Hand ${state.handNumber}: dealer seat ${hand.dealer}, vira ${hand.vira.id}${kind}`;
}

/**
 * One public event as a play-by-play line. Uses only what every player sees,
 * so face-down cards stay hidden here too. `after` is the state once the
 * event's intent was applied (for the next hand's header).
 */
export function formatEvent(event: GameEvent, after: GameState): string {
  switch (event.t) {
    case 'card_played':
      return event.card.faceDown
        ? `  seat ${event.seat} plays a card face down`
        : `  seat ${event.seat} plays ${event.card.card.id}`;
    case 'trick_won':
      return event.winner === null ? '  → trick tied' : `  → trick to ${team(event.winner)}`;
    case 'truco_called':
      return `  seat ${event.seat}: ${stakeName(event.stake)}`;
    case 'truco_answered':
      switch (event.answer) {
        case 'accept':
          return `  seat ${event.seat} accepts (${event.stake})`;
        case 'run':
          return `  seat ${event.seat} runs`;
        case 'raise':
          return `  seat ${event.seat}: ${stakeName(event.stake)}`;
      }
      break;
    case 'mao_de_onze_decided':
      return `  seat ${event.seat} decides to ${event.play ? 'play' : 'run from'} the mão de onze`;
    case 'hand_won': {
      const ran = event.ranBy === null ? '' : ` (${team(event.ranBy)} ran)`;
      return `  ${team(event.team)} wins the hand, +${event.points}${ran} → ${event.scores.join(' x ')}`;
    }
    case 'hand_dealt':
      return `\n${formatHand(after)}`;
    case 'match_won':
      return `\n${team(event.team)} wins the match ${event.scores.join(' x ')}`;
  }
}

const COLUMNS = [
  ['mode', 4],
  ['matches', 7],
  ['A/B wins', 9],
  ['hands', 6],
  ['hands/match', 11],
  ['tied tricks', 11],
  ['face-down', 9],
  ['truco', 6],
  ['raises', 6],
  ['runs', 6],
  ['onze', 5],
  ['onze runs', 9],
  ['ferro', 5],
  ['ms', 6],
] as const;

/** Header of the summary table. */
export function formatSummaryHeader(): string {
  return COLUMNS.map(([name, width]) => name.padStart(width)).join('  ');
}

/** One summary row for a batch of matches that took `ms` milliseconds. */
export function formatSummaryRow(batch: BatchResult, ms: number): string {
  const { stats } = batch;
  const cells = [
    `${batch.mode}p`,
    batch.matches,
    `${batch.wins[0]}/${batch.wins[1]}`,
    stats.hands,
    (stats.hands / batch.matches).toFixed(1),
    stats.tiedTricks,
    stats.faceDownPlays,
    stats.trucoCalls,
    stats.raises,
    stats.runs,
    stats.maoDeOnzeHands,
    stats.maoDeOnzeRuns,
    stats.maoDeFerroHands,
    Math.round(ms),
  ];
  return cells.map((cell, i) => String(cell).padStart(COLUMNS[i]?.[1] ?? 0)).join('  ');
}

/** The command that replays one match with a play-by-play. */
export function replayCommand(mode: GameMode, seed: number, strategy: StrategyName): string {
  return `npm run simulate -- --mode ${mode} --seed ${seed} --games 1 --strategy ${strategy} --verbose`;
}
