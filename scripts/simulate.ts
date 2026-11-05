/**
 * `npm run simulate`: plays many full matches in 2, 4 and 6 player modes
 * through the engine's public API and prints a summary. Every step is
 * checked against the harness invariants (see engine/simulate.ts); on a
 * failure it prints the command that replays the broken match and exits 1.
 */
import { performance } from 'node:perf_hooks';
import {
  STRATEGIES,
  SimulationError,
  simulateMatches,
  type SimulationOptions,
} from '../engine/simulate.js';
import {
  USAGE,
  formatEvent,
  formatHand,
  formatSummaryHeader,
  formatSummaryRow,
  parseSimArgs,
  replayCommand,
} from './simulateCli.js';

function main(argv: readonly string[]): number {
  const args = parseSimArgs(argv);
  if ('error' in args) {
    console.error(`${args.error}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const options: SimulationOptions = { strategy: STRATEGIES[args.strategy] };
  if (args.verbose) {
    options.onStart = (state, seed) => {
      console.log(`\n=== ${state.mode}-player match, seed ${seed} ===\n`);
      console.log(formatHand(state));
    };
    options.onStep = ({ events, state }) => {
      for (const event of events) console.log(formatEvent(event, state));
    };
  }

  const rows: string[] = [];
  for (const mode of args.modes) {
    const started = performance.now();
    try {
      const batch = simulateMatches(mode, args.seed, args.games, options);
      rows.push(formatSummaryRow(batch, performance.now() - started));
    } catch (error) {
      if (!(error instanceof SimulationError)) throw error;
      console.error(`\nFAILED: ${error.message}`);
      console.error(`Replay: ${replayCommand(error.mode, error.seed, args.strategy)}`);
      return 1;
    }
  }

  console.log(
    `\n${args.games} ${args.strategy} match(es) per mode from seed ${args.seed}, all invariants held:\n`,
  );
  console.log(formatSummaryHeader());
  for (const row of rows) console.log(row);
  return 0;
}

// Piping the play-by-play into `head` closes stdout early: just stop.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(0);
});

process.exitCode = main(process.argv.slice(2));
