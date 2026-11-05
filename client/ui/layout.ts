import type { GameMode, Seat } from '../../shared/types.js';

/**
 * Seat geometry for the table view. Pure lookup tables, no DOM.
 *
 * Turn order is counter-clockwise, so seen from the bottom (you) the next
 * seat to play sits on your RIGHT.
 */

export type Anchor =
  'bottom' | 'right' | 'top' | 'left' | 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left';

const ANCHORS: Record<GameMode, readonly Anchor[]> = {
  2: ['bottom', 'top'],
  4: ['bottom', 'right', 'top', 'left'],
  6: ['bottom', 'bottom-right', 'top-right', 'top', 'top-left', 'bottom-left'],
};

/** Position in play order relative to `mySeat`: 0 for yourself, then counter-clockwise. */
export function relativeIndex(mySeat: Seat, seat: Seat, mode: GameMode): number {
  return (((seat - mySeat) % mode) + mode) % mode;
}

export function anchorFor(mode: GameMode, relative: number): Anchor {
  const anchor = ANCHORS[mode][relative];
  if (anchor === undefined) {
    throw new RangeError(`relative index ${relative} out of range for ${mode} players`);
  }
  return anchor;
}

/**
 * Chair placement as percentages of the table area (portrait phone), plus the
 * rotation in degrees (clockwise, 0 = chair facing up) so it faces the centre.
 * Side chairs hug x of about 6 / 94, top about y 8, bottom about y 92.
 */
const POSITIONS: Record<Anchor, { x: number; y: number; angle: number }> = {
  bottom: { x: 50, y: 92, angle: 0 },
  top: { x: 50, y: 8, angle: 180 },
  left: { x: 6, y: 50, angle: 90 },
  right: { x: 94, y: 50, angle: 270 },
  'bottom-right': { x: 90, y: 74, angle: 315 },
  'top-right': { x: 90, y: 26, angle: 225 },
  'top-left': { x: 10, y: 26, angle: 135 },
  'bottom-left': { x: 10, y: 74, angle: 45 },
};

export function chairPosition(anchor: Anchor): { x: number; y: number; angle: number } {
  return { ...POSITIONS[anchor] };
}

/** Same team and not me. Teams are fixed by seat parity (CLAUDE.md: team = seat % 2). */
export function isPartner(mySeat: Seat, seat: Seat): boolean {
  return seat !== mySeat && seat % 2 === mySeat % 2;
}
