import type {
  CardId,
  GameEvent,
  GameIntent,
  GameMode,
  GameView,
  Seat,
  Team,
} from '../shared/types.js';
import { RULES } from './config.js';
import { applyIntent, createGame, viewFor, type GameState } from './game.js';
import { CARDS_PER_PLAYER, type HandState } from './hand.js';
import { handsVisibleTo } from './maoDeOnze.js';
import { nextInt, seedRng, type RngState } from './rng.js';
import { seatsOf } from './seating.js';

/**
 * Simulation harness: plays whole matches through the engine's public API
 * (`createGame`, `applyIntent`, `viewFor`), the way the server will.
 *
 * Players only ever act on what their own view advertises in `actions`, so a
 * simulated match also proves that the views and the rules agree: every
 * advertised intent must be accepted. After every step the harness checks
 * invariants (cards conserved, scores in range, no hidden card in any view
 * or event...) and throws a `SimulationError` naming the seed and step, so
 * any failure can be replayed exactly.
 *
 * Pure like the rest of the engine: no I/O. `scripts/simulate.ts` is the CLI.
 */

/** One player doing one thing. */
export interface Choice {
  seat: Seat;
  intent: GameIntent;
}

/**
 * Picks one of `choices` (every legal intent of every seat, never empty).
 * `views` is indexed by seat; a strategy must not look at anything else, just
 * as a real player only sees their own screen. Returns the index picked and
 * the advanced RNG state.
 */
export type Strategy = (
  choices: readonly Choice[],
  views: readonly GameView[],
  rng: RngState,
) => [pick: number, next: RngState];

/** Every intent `view` advertises as legal for its seat. */
export function legalIntents(view: GameView): GameIntent[] {
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
  if (actions.play) for (const card of cards) intents.push({ t: 'play_card', cardId: card.id });
  if (actions.playFaceDown) {
    for (const card of cards) intents.push({ t: 'play_card', cardId: card.id, faceDown: true });
  }
  if (actions.playBlind) {
    const count = view.players[view.seat]?.cardCount ?? 0;
    for (let slot = 0; slot < count; slot++) intents.push({ t: 'play_blind', slot });
  }
  return intents;
}

/** Every legal choice at the table, seat by seat. */
export function legalChoices(views: readonly GameView[]): Choice[] {
  return views.flatMap((view) => legalIntents(view).map((intent) => ({ seat: view.seat, intent })));
}

/** Any legal choice, uniformly: calls, raises, runs and face-down plays all happen. */
export const randomStrategy: Strategy = (choices, _views, rng) => nextInt(rng, choices.length);

/**
 * A calm table: nobody calls or raises truco, every call is accepted, the
 * team at 11 always plays, cards go face up. Hands are worth 1, so matches
 * run long and reach mão de onze and mão de ferro often.
 */
export const plainStrategy: Strategy = (choices, _views, rng) => {
  const calm = choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice: { intent } }) => {
      switch (intent.t) {
        case 'call_truco':
          return false;
        case 'respond':
          return intent.answer === 'accept';
        case 'mao11_decision':
          return intent.play;
        case 'play_card':
          return intent.faceDown !== true;
        case 'play_blind':
          return true;
      }
    });
  if (calm.length === 0) return nextInt(rng, choices.length);
  const [pick, next] = nextInt(rng, calm.length);
  return [calm[pick]?.index ?? 0, next];
};

export const STRATEGIES = { random: randomStrategy, plain: plainStrategy } as const;
export type StrategyName = keyof typeof STRATEGIES;

/** What happened in a match, counted from its public events. */
export interface MatchStats {
  steps: number;
  hands: number;
  tricks: number;
  tiedTricks: number;
  faceDownPlays: number;
  trucoCalls: number;
  raises: number;
  accepts: number;
  runs: number;
  maoDeOnzeHands: number;
  maoDeOnzeRuns: number;
  maoDeFerroHands: number;
  /** Hands won, by team. */
  handsWon: [number, number];
}

export function emptyStats(): MatchStats {
  return {
    steps: 0,
    hands: 0,
    tricks: 0,
    tiedTricks: 0,
    faceDownPlays: 0,
    trucoCalls: 0,
    raises: 0,
    accepts: 0,
    runs: 0,
    maoDeOnzeHands: 0,
    maoDeOnzeRuns: 0,
    maoDeFerroHands: 0,
    handsWon: [0, 0],
  };
}

/** Adds one step's events to `stats` (returns a new object). */
export function countEvents(stats: MatchStats, events: readonly GameEvent[]): MatchStats {
  const s: MatchStats = { ...stats, steps: stats.steps + 1, handsWon: [...stats.handsWon] };
  for (const e of events) {
    switch (e.t) {
      case 'card_played':
        if (e.card.faceDown) s.faceDownPlays++;
        break;
      case 'trick_won':
        s.tricks++;
        if (e.winner === null) s.tiedTricks++;
        break;
      case 'truco_called':
        s.trucoCalls++;
        break;
      case 'truco_answered':
        if (e.answer === 'raise') s.raises++;
        else if (e.answer === 'accept') s.accepts++;
        else s.runs++;
        break;
      case 'mao_de_onze_decided':
        if (!e.play) s.maoDeOnzeRuns++;
        break;
      case 'hand_won':
        s.hands++;
        s.handsWon[e.team]++;
        break;
      case 'hand_dealt':
        if (e.maoDeOnze !== null) s.maoDeOnzeHands++;
        if (e.maoDeFerro) s.maoDeFerroHands++;
        break;
      case 'match_won':
        break;
    }
  }
  return s;
}

/** Sums the stats of several matches. */
export function addStats(a: MatchStats, b: MatchStats): MatchStats {
  const sum = emptyStats();
  for (const key of Object.keys(sum) as (keyof MatchStats)[]) {
    if (key === 'handsWon')
      sum.handsWon = [a.handsWon[0] + b.handsWon[0], a.handsWon[1] + b.handsWon[1]];
    else sum[key] = a[key] + b[key];
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Invariants. Each returns human-readable problems; empty means all good.

function allPlays(hand: HandState) {
  return [...hand.tricks.flatMap((t) => t.plays), ...hand.trick];
}

function faceDownIds(hand: HandState): CardId[] {
  return allPlays(hand)
    .filter((p) => p.faceDown)
    .map((p) => p.card.id);
}

/** Problems with the server-side state on its own: cards, scores, hand value, turn. */
export function stateViolations(state: GameState): string[] {
  const problems: string[] = [];
  const { hand, mode } = state;

  // Every dealt card is somewhere, exactly once.
  const ids = [
    ...hand.hands.flatMap((h) => h.map((c) => c.id)),
    ...allPlays(hand).map((p) => p.card.id),
    hand.vira.id,
  ];
  const dealt = mode * CARDS_PER_PLAYER + 1;
  if (ids.length !== dealt) problems.push(`${ids.length} cards in play, expected ${dealt}`);
  if (new Set(ids).size !== ids.length) problems.push('a card appears twice');

  // Scores and match winner.
  for (const score of state.scores) {
    if (!Number.isInteger(score) || score < 0 || score > RULES.winningScore) {
      problems.push(`score ${score} out of range`);
    }
  }
  const reached = state.scores.findIndex((s) => s >= RULES.winningScore);
  const expectedWinner = reached === -1 ? null : (reached as Team);
  if (state.winner !== expectedWinner) {
    problems.push(`winner ${String(state.winner)} but scores are ${state.scores.join(' x ')}`);
  }
  if (state.scores.every((s) => s >= RULES.winningScore)) problems.push('both teams at 12');

  // A match in progress always rests on a hand in play.
  if (state.winner === null) {
    if (hand.winner !== null) problems.push('match in progress on a decided hand');
    if (hand.turn === null) problems.push('match in progress with nobody to play');
  }

  // The hand is worth a value the rules allow.
  const values = new Set([
    RULES.baseHandValue,
    ...RULES.trucoLadder,
    RULES.maoDeOnzeValue,
    RULES.maoDeFerroValue,
  ]);
  if (!values.has(hand.value)) problems.push(`hand worth ${hand.value}`);
  if (hand.maoDeFerro && (hand.truco !== null || hand.value !== RULES.maoDeFerroValue)) {
    problems.push('truco in a mão de ferro');
  }
  if (hand.maoDeOnze !== null && hand.truco !== null) problems.push('truco in a mão de onze');

  return problems;
}

/** Card ids `seat` must not find anywhere in its view. */
function hiddenFrom(state: GameState, seat: Seat): Set<CardId> {
  const visible = new Set(handsVisibleTo(state.hand, seat));
  const hidden = new Set<CardId>(faceDownIds(state.hand));
  state.hand.hands.forEach((cards, other) => {
    if (!visible.has(other)) for (const card of cards) hidden.add(card.id);
  });
  return hidden;
}

/** Problems with the personalized views: leaks, wrong seat, wrong card counts, turn. */
export function viewViolations(state: GameState, views: readonly GameView[]): string[] {
  const problems: string[] = [];
  for (const view of views) {
    const json = JSON.stringify(view);
    for (const id of hiddenFrom(state, view.seat)) {
      if (json.includes(`"${id}"`)) problems.push(`seat ${view.seat} sees hidden card ${id}`);
    }
    if (json.includes('"rng"')) problems.push(`seat ${view.seat} sees the RNG state`);
    view.players.forEach((player, s) => {
      if (player.cardCount !== state.hand.hands[s]?.length) {
        problems.push(`seat ${view.seat} sees the wrong card count for seat ${s}`);
      }
    });
  }

  // While cards are being played, exactly the seat on turn may play.
  const players = views.filter((v) => v.actions.play || v.actions.playBlind).map((v) => v.seat);
  const { hand } = state;
  const waiting = hand.truco !== null || hand.maoDeOnze?.decision === 'pending';
  const expected = state.winner !== null || waiting || hand.turn === null ? [] : [hand.turn];
  if (players.join() !== expected.join()) {
    problems.push(`seats [${players.join()}] may play, expected [${expected.join()}]`);
  }
  return problems;
}

/**
 * Problems with one step: events must not name any card that is still
 * hidden (held, or played face down), and scores never go down.
 */
export function stepViolations(
  before: GameState,
  after: GameState,
  events: readonly GameEvent[],
): string[] {
  const problems: string[] = [];
  const revealed = new Set<CardId>();
  for (const e of events) {
    if (e.t === 'card_played' && !e.card.faceDown) revealed.add(e.card.card.id);
  }
  const hidden = new Set<CardId>([
    ...before.hand.hands.flatMap((h) => h.map((c) => c.id)),
    ...faceDownIds(before.hand),
  ]);
  if (after.handNumber === before.handNumber) {
    for (const id of faceDownIds(after.hand)) hidden.add(id);
  }
  const json = JSON.stringify(events);
  for (const id of hidden) {
    if (!revealed.has(id) && json.includes(`"${id}"`)) problems.push(`events reveal ${id}`);
  }

  if (after.scores.some((s, team) => s < (before.scores[team] ?? 0))) {
    problems.push(`scores went down: ${before.scores.join(' x ')} → ${after.scores.join(' x ')}`);
  }
  const dealt = events.some((e) => e.t === 'hand_dealt');
  if (after.handNumber !== before.handNumber + (dealt ? 1 : 0)) {
    problems.push(`hand number ${before.handNumber} → ${after.handNumber}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Running matches.

export class SimulationError extends Error {
  constructor(
    readonly mode: GameMode,
    readonly seed: number,
    readonly step: number,
    readonly problems: readonly string[],
  ) {
    super(`${mode}-player match, seed ${seed}, step ${step}: ${problems.join('; ')}`);
    this.name = 'SimulationError';
  }
}

export interface SimulationStep {
  /** 1-based. */
  step: number;
  seat: Seat;
  intent: GameIntent;
  events: readonly GameEvent[];
  state: GameState;
}

export interface SimulationOptions {
  /** Defaults to `randomStrategy`. */
  strategy?: Strategy;
  /** Gives up (with a `SimulationError`) after this many intents. Default 5000. */
  maxSteps?: number;
  /** Called once the match is dealt, before the first intent. */
  onStart?: (state: GameState, seed: number) => void;
  /** Called after every accepted intent, e.g. to print a play-by-play. */
  onStep?: (step: SimulationStep) => void;
}

export interface SimulationResult {
  mode: GameMode;
  seed: number;
  state: GameState;
  winner: Team;
  scores: [number, number];
  stats: MatchStats;
}

/**
 * Plays one match from `createGame(mode, seed)` to 12 points. Deterministic:
 * the same mode, seed and strategy always play the same match. Throws a
 * `SimulationError` if an advertised intent is rejected, an invariant breaks,
 * nobody can act, or the match runs past `maxSteps`.
 */
export function simulateMatch(
  mode: GameMode,
  seed: number,
  options: SimulationOptions = {},
): SimulationResult {
  const strategy = options.strategy ?? randomStrategy;
  const maxSteps = options.maxSteps ?? 5000;
  let state = createGame(mode, seed);
  // A separate stream from the deal, so strategies never shift the cards.
  let rng = seedRng(seed ^ 0x5eed);
  let stats = emptyStats();
  let step = 0;
  function fail(problems: string[]): never {
    throw new SimulationError(mode, seed, step, problems);
  }

  const initial = stateViolations(state);
  if (initial.length > 0) fail(initial);
  options.onStart?.(state, seed);

  while (state.winner === null) {
    step++;
    if (step > maxSteps) fail([`no winner after ${maxSteps} steps`]);

    const views = seatsOf(mode).map((seat) => viewFor(state, seat));
    const viewProblems = viewViolations(state, views);
    if (viewProblems.length > 0) fail(viewProblems);

    const choices = legalChoices(views);
    if (choices.length === 0) fail(['nobody can act']);
    const [pick, next] = strategy(choices, views, rng);
    rng = next;
    const choice = choices[pick];
    if (choice === undefined) fail([`strategy picked ${pick} of ${choices.length}`]);

    const result = applyIntent(state, choice.seat, choice.intent);
    if (!result.ok) {
      fail([
        `advertised ${JSON.stringify(choice.intent)} by seat ${choice.seat} rejected: ${result.error}`,
      ]);
    }
    const problems = [
      ...stepViolations(state, result.state, result.events),
      ...stateViolations(result.state),
    ];
    if (problems.length > 0) fail(problems);

    state = result.state;
    stats = countEvents(stats, result.events);
    options.onStep?.({
      step,
      seat: choice.seat,
      intent: choice.intent,
      events: result.events,
      state,
    });
  }

  // Once over, nobody may do anything.
  const finalViews = seatsOf(mode).map((seat) => viewFor(state, seat));
  if (legalChoices(finalViews).length > 0) fail(['actions offered after the match ended']);

  return { mode, seed, state, winner: state.winner, scores: [...state.scores], stats };
}

export interface BatchResult {
  mode: GameMode;
  matches: number;
  wins: [number, number];
  stats: MatchStats;
}

/**
 * Plays `count` matches with consecutive seeds from `firstSeed`, and sums
 * them up. Stops at the first `SimulationError`, which names the seed.
 */
export function simulateMatches(
  mode: GameMode,
  firstSeed: number,
  count: number,
  options: SimulationOptions = {},
): BatchResult {
  const batch: BatchResult = { mode, matches: 0, wins: [0, 0], stats: emptyStats() };
  for (let i = 0; i < count; i++) {
    const result = simulateMatch(mode, firstSeed + i, options);
    batch.matches++;
    batch.wins[result.winner]++;
    batch.stats = addStats(batch.stats, result.stats);
  }
  return batch;
}
