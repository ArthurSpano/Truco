import type {
  GameEvent,
  GameMode,
  Seat,
  TableCard,
  Team,
  TrickWinner,
} from '../../shared/types.js';
import { stakeName } from './actionBarModel.js';
import { anchorFor, relativeIndex, type Anchor } from './layout.js';

export type TrickResult = 'win' | 'lose' | 'tie';

export interface HeldCard {
  anchor: Anchor;
  card: TableCard;
  result: TrickResult;
}

export interface Toast {
  /** Our team took the hand. */
  ours: boolean;
  title: string;
  points: number;
  why: string;
}

export type Animation =
  /** A played card flies in from its owner's seat. */
  | { kind: 'slide'; anchor: Anchor }
  /** A finished trick stays on the felt with its result, then sweeps to the winner (null: fades). */
  | {
      kind: 'trick';
      cards: HeldCard[];
      toward: Anchor | null;
      /** The trick's last card, which no snapshot ever shows on the felt, flies in from here. */
      flyIn: Anchor | null;
    }
  | { kind: 'shake'; strength: 1 | 2 | 3 }
  /** Big centred word (TRUCO!, SEIS!, MÃO DE FERRO!). */
  | { kind: 'banner'; text: string }
  /** Hand result card over the table. */
  | { kind: 'toast'; toast: Toast }
  /** A new hand: the viewer's cards deal in, everyone's backs pop in. */
  | { kind: 'deal' };

/** How long a finished trick stays on the felt (result glow), then how long its sweep takes. */
export const TRICK_HOLD_MS = 1100;
export const TRICK_SWEEP_MS = 400;

/** Truco stake -> shake strength: 3 and 6 are light, 9 heavier, 12 the strongest. */
function strengthFor(stake: number): 1 | 2 | 3 {
  if (stake >= 12) return 3;
  if (stake >= 9) return 2;
  return 1;
}

/** Per-card result of a finished trick: the winning card glows, the others dim; a tie is a tie. */
export function trickResults(
  cards: readonly TableCard[],
  winner: TrickWinner,
  winnerSeat: Seat | null,
): TrickResult[] {
  return cards.map((c) => (winner === null ? 'tie' : c.seat === winnerSeat ? 'win' : 'lose'));
}

/** Toast text for a finished hand, from the viewer's side of the table. */
export function handToast(event: Extract<GameEvent, { t: 'hand_won' }>, myTeam: Team): Toast {
  const ours = event.team === myTeam;
  const weRan = event.ranBy === myTeam;
  let why: string;
  switch (event.reason) {
    case 'truco_run':
      why = weRan ? 'Nós corremos' : 'Eles correram';
      break;
    case 'mao_de_onze_run':
      why = weRan ? 'Corremos da mão de onze' : 'Correram da mão de onze';
      break;
    case 'tricks': {
      const won = event.tricks.filter((t) => t === event.team).length;
      const ties = event.tricks.filter((t) => t === null).length;
      const lost = event.tricks.length - won - ties;
      if (won === 0 && lost === 0) why = 'Tudo empatado';
      else if (ties === 0) why = `${won} a ${lost} nas rodadas`;
      else why = `${won} a ${lost} · ${ties} ${ties > 1 ? 'empates' : 'empate'}`;
      break;
    }
  }
  return {
    ours,
    title: ours ? 'Nós levamos a mão!' : 'Eles levaram a mão',
    points: event.points,
    why,
  };
}

/** Pure: the animations a game event should trigger for this viewer, in order. */
export function animationsFor(
  event: GameEvent,
  mySeat: Seat,
  myTeam: Team,
  mode: GameMode,
): Animation[] {
  const anchorOf = (seat: Seat): Anchor => anchorFor(mode, relativeIndex(mySeat, seat, mode));
  switch (event.t) {
    case 'card_played':
      return [{ kind: 'slide', anchor: anchorOf(event.seat) }];
    case 'trick_won': {
      const results = trickResults(event.cards, event.winner, event.winnerSeat);
      return [
        {
          kind: 'trick',
          cards: event.cards.map((card, i) => ({
            anchor: anchorOf(card.seat),
            card,
            result: results[i] ?? 'lose',
          })),
          toward: event.winnerSeat === null ? null : anchorOf(event.winnerSeat),
          flyIn: null,
        },
      ];
    }
    case 'truco_called':
      return [
        { kind: 'banner', text: `${stakeName(event.stake)}!` },
        { kind: 'shake', strength: strengthFor(event.stake) },
      ];
    case 'truco_answered':
      return event.answer === 'raise'
        ? [
            { kind: 'banner', text: `${stakeName(event.stake)}!` },
            { kind: 'shake', strength: strengthFor(event.stake) },
          ]
        : [];
    case 'hand_won':
      return [{ kind: 'toast', toast: handToast(event, myTeam) }];
    case 'hand_dealt': {
      const out: Animation[] = [{ kind: 'deal' }];
      if (event.maoDeFerro) out.push({ kind: 'banner', text: 'MÃO DE FERRO!' });
      else if (event.maoDeOnze !== null) out.push({ kind: 'banner', text: 'MÃO DE ONZE!' });
      return out;
    }
    default:
      return [];
  }
}

/**
 * Animations for one burst of events, in order. A card that completes a trick is never drawn on
 * the felt (the snapshot after it already has an empty trick), so its slide is folded into the
 * held trick as `flyIn`.
 */
export function animationsForBurst(
  events: readonly GameEvent[],
  mySeat: Seat,
  myTeam: Team,
  mode: GameMode,
): Animation[] {
  const out: Animation[] = [];
  for (const e of events) {
    for (const a of animationsFor(e, mySeat, myTeam, mode)) {
      const prev = out[out.length - 1];
      if (
        a.kind === 'trick' &&
        prev?.kind === 'slide' &&
        a.cards.some((c) => c.anchor === prev.anchor)
      ) {
        out[out.length - 1] = { ...a, flyIn: prev.anchor };
      } else {
        out.push(a);
      }
    }
  }
  return out;
}

/**
 * Orders one burst of animations in time. The engine finishes a trick, scores the hand and deals
 * the next one in a single burst, so without this the last trick, the toast and the new cards
 * would all land at once. A finished trick holds the floor for TRICK_HOLD_MS + TRICK_SWEEP_MS;
 * everything after it in the burst (toast, deal, banners) waits for it.
 */
export function scheduleBurst(animations: readonly Animation[]): { at: number; anim: Animation }[] {
  let cursor = 0;
  return animations.map((anim) => {
    const at = anim.kind === 'slide' ? 0 : cursor;
    if (anim.kind === 'trick') cursor += TRICK_HOLD_MS + TRICK_SWEEP_MS;
    return { at, anim };
  });
}
