import type { GameMode, Seat } from '../../shared/types.js';

/**
 * Seat geometry for the table view. Pure lookup tables, no DOM.
 *
 * Turn order is counter-clockwise, so seen from the bottom (you) the next
 * seat to play sits on your RIGHT.
 *
 * Coordinates are in DESIGN PIXELS of a 390 x 844 portrait stage (the V1 mockup's artboard).
 * CSS multiplies every one of them by `--u` (one design pixel in real pixels), so the whole
 * scene scales as a unit to any viewport; see styles/base.css.
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

/** Same team and not me. Teams are fixed by seat parity (CLAUDE.md: team = seat % 2). */
export function isPartner(mySeat: Seat, seat: Seat): boolean {
  return seat !== mySeat && seat % 2 === mySeat % 2;
}

// ---------------------------------------------------------------------------
// Stage geometry (design pixels).

export const STAGE = { width: 390, height: 844 } as const;
/** Centre of the round table (and of the felt and the rug). */
export const TABLE_CENTRE = { x: 195, y: 410 } as const;

export interface SeatGeometry {
  /** Plastic chair: centre, size and rotation (degrees, clockwise). */
  chair: { x: number; y: number; w: number; h: number; rot: number };
  /** Top-centre of the avatar + name block; null for the viewer (the hand stands in for it). */
  avatar: { x: number; y: number } | null;
  /** Centre of the row of card backs, row rotation, spacing between cards and fan spread. */
  backs: { x: number; y: number; rot: number; pitch: number; spread: number };
  /** Played card: offset from the felt centre and rotation. */
  played: { x: number; y: number; rot: number };
  /** Where a played card flies in from (offset from the felt centre), its rotation and scale. */
  from: { x: number; y: number; rot: number; scale: number };
  /**
   * Speech bubble box: `x` is its left edge (align left), right edge (align right) or centre,
   * `y` its top edge.
   */
  bubble: { x: number; y: number; align: 'left' | 'right' | 'center' };
}

/** The mockup's 4-player positions; 2 players use bottom and top unchanged. */
const BOTTOM: SeatGeometry = {
  chair: { x: 195, y: 596, w: 124, h: 96, rot: 0 },
  avatar: null,
  backs: { x: 195, y: 682, rot: 0, pitch: 26, spread: 10 },
  played: { x: 0, y: 42, rot: 3 },
  from: { x: 0, y: 270, rot: -8, scale: 1.55 },
  bubble: { x: 195, y: 536, align: 'center' },
};
const TOP: SeatGeometry = {
  chair: { x: 195, y: 198, w: 124, h: 96, rot: 0 },
  avatar: { x: 195, y: 112 },
  backs: { x: 195, y: 217, rot: 0, pitch: 26, spread: 10 },
  played: { x: 0, y: -42, rot: 184 },
  from: { x: 0, y: -240, rot: 150, scale: 0.8 },
  bubble: { x: 228, y: 96, align: 'left' },
};
const LEFT: SeatGeometry = {
  chair: { x: -10, y: 424, w: 96, h: 124, rot: 0 },
  avatar: { x: 33, y: 284 },
  backs: { x: 31, y: 410, rot: 90, pitch: 24, spread: 6 },
  played: { x: -50, y: -2, rot: 86 },
  from: { x: -200, y: -6, rot: 40, scale: 0.8 },
  bubble: { x: 66, y: 290, align: 'left' },
};
const RIGHT: SeatGeometry = {
  chair: { x: 400, y: 424, w: 96, h: 124, rot: 0 },
  avatar: { x: 357, y: 284 },
  backs: { x: 359, y: 410, rot: -90, pitch: 24, spread: 6 },
  played: { x: 50, y: 3, rot: -92 },
  from: { x: 200, y: 6, rot: -40, scale: 0.8 },
  bubble: { x: 324, y: 290, align: 'right' },
};

/**
 * Six players: a hexagon. Diagonal chairs sit on a 212px circle around the table at 60 degree
 * steps; avatars and card backs hug the stage edges (like the 4-player sides) so they never
 * cover the felt. Played cards sit on a 70px ring and are drawn smaller (see `.mode-6`).
 */
const HEX = 212 * Math.sin(Math.PI / 3); // horizontal reach of a diagonal chair, ~183.6
const SIX: Record<Anchor, SeatGeometry> = {
  bottom: { ...BOTTOM, played: { x: 0, y: 70, rot: 3 } },
  top: { ...TOP, played: { x: 0, y: -70, rot: 184 } },
  'bottom-right': {
    chair: { x: 195 + HEX, y: 516, w: 124, h: 96, rot: -60 },
    avatar: { x: 357, y: 470 },
    backs: { x: 352, y: 420, rot: -110, pitch: 22, spread: 6 },
    played: { x: 61, y: 35, rot: -58 },
    from: { x: 220, y: 130, rot: -20, scale: 0.8 },
    bubble: { x: 324, y: 474, align: 'right' },
  },
  'top-right': {
    chair: { x: 195 + HEX, y: 304, w: 124, h: 96, rot: 60 },
    avatar: { x: 357, y: 222 },
    backs: { x: 350, y: 318, rot: -70, pitch: 22, spread: 6 },
    played: { x: 61, y: -35, rot: -122 },
    from: { x: 220, y: -130, rot: -160, scale: 0.8 },
    bubble: { x: 324, y: 226, align: 'right' },
  },
  'top-left': {
    chair: { x: 195 - HEX, y: 304, w: 124, h: 96, rot: -60 },
    avatar: { x: 33, y: 222 },
    backs: { x: 40, y: 318, rot: 70, pitch: 22, spread: 6 },
    played: { x: -61, y: -35, rot: 118 },
    from: { x: -220, y: -130, rot: 160, scale: 0.8 },
    bubble: { x: 66, y: 226, align: 'left' },
  },
  'bottom-left': {
    chair: { x: 195 - HEX, y: 516, w: 124, h: 96, rot: 60 },
    avatar: { x: 33, y: 470 },
    backs: { x: 38, y: 420, rot: 110, pitch: 22, spread: 6 },
    played: { x: -61, y: 35, rot: 62 },
    from: { x: -220, y: 130, rot: 20, scale: 0.8 },
    bubble: { x: 66, y: 474, align: 'left' },
  },
  // Unused in 6p (no straight sides), kept so the table is total.
  left: LEFT,
  right: RIGHT,
};

const FOUR: Record<Anchor, SeatGeometry> = {
  ...SIX,
  bottom: BOTTOM,
  top: TOP,
  left: LEFT,
  right: RIGHT,
};

/** Geometry of one seat for this table size. */
export function seatGeometry(mode: GameMode, anchor: Anchor): SeatGeometry {
  return mode === 6 ? SIX[anchor] : FOUR[anchor];
}
