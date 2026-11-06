import type { GameEvent, GameMode, Seat } from '../../shared/types.js';
import { anchorFor, relativeIndex, type Anchor } from './layout.js';

export type Animation =
  | { kind: 'slide'; anchor: Anchor }
  | { kind: 'sweep'; toward: Anchor | null }
  | { kind: 'shake'; strength: 1 | 2 | 3 };

/** Truco stake -> shake strength: 3 and 6 are light, 9 heavier, 12 the strongest. */
function strengthFor(stake: number): 1 | 2 | 3 {
  if (stake >= 12) return 3;
  if (stake >= 9) return 2;
  return 1;
}

/** Pure: which animation (if any) a game event should trigger for this viewer. */
export function animationFor(event: GameEvent, mySeat: Seat, mode: GameMode): Animation | null {
  const anchorOf = (seat: Seat): Anchor => anchorFor(mode, relativeIndex(mySeat, seat, mode));
  switch (event.t) {
    case 'card_played':
      return { kind: 'slide', anchor: anchorOf(event.seat) };
    case 'trick_won':
      // `leader` is the seat of the winning card (engine/tricks.ts); a tie has no winner.
      return { kind: 'sweep', toward: event.winner === null ? null : anchorOf(event.leader) };
    case 'truco_called':
      return { kind: 'shake', strength: strengthFor(event.stake) };
    default:
      return null;
  }
}
