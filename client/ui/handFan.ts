import type { GameActions } from '../../shared/types.js';

export interface FanSlot {
  /** Degrees, negative = tilted left. */
  angle: number;
  /** Horizontal offset from the centre, in card widths (unitless; CSS multiplies by --card-w). */
  offsetX: number;
  /** Pixels the card drops towards the edges of the fan (an arc). */
  lift: number;
}

const MAX_STEP = 8; // degrees between neighbours; the brief caps this at 10
const SPREAD_X = 0.62; // card widths between neighbours: the exposed strip is 0.62 * --card-w

/** Symmetric fan: centred on 0, neighbours at most 10 degrees apart. */
export function fanLayout(count: number): FanSlot[] {
  const slots: FanSlot[] = [];
  for (let i = 0; i < count; i++) {
    const pos = i - (count - 1) / 2;
    slots.push({ angle: pos * MAX_STEP, offsetX: pos * SPREAD_X, lift: Math.abs(pos) ** 2 * 4 });
  }
  return slots;
}

export interface HandState {
  selected: string | null;
  faceDown: boolean;
  /** Last actions seen via `sync`, so a tap can check what is allowed. */
  actions: GameActions;
}

export type HandAction =
  | { kind: 'tap'; cardId: string }
  | { kind: 'toggle_face_down' }
  | { kind: 'sync'; cardIds: string[]; actions: GameActions };

export interface HandPlay {
  cardId: string;
  faceDown: boolean;
}

const NO_ACTIONS: GameActions = {
  play: false,
  playFaceDown: false,
  playBlind: false,
  callTruco: null,
  respond: null,
  decideMaoDeOnze: false,
};

export function initialHandState(): HandState {
  return { selected: null, faceDown: false, actions: NO_ACTIONS };
}

export function handReduce(
  state: HandState,
  action: HandAction,
): { state: HandState; play: HandPlay | null } {
  switch (action.kind) {
    case 'sync': {
      const keep = state.selected !== null && action.cardIds.includes(state.selected);
      return {
        state: {
          selected: keep ? state.selected : null,
          faceDown: state.faceDown && action.actions.playFaceDown,
          actions: action.actions,
        },
        play: null,
      };
    }
    case 'toggle_face_down':
      if (!state.actions.playFaceDown) return { state, play: null };
      return { state: { ...state, faceDown: !state.faceDown }, play: null };
    case 'tap': {
      if (state.selected !== action.cardId) {
        return { state: { ...state, selected: action.cardId }, play: null };
      }
      const faceDown = state.faceDown && state.actions.playFaceDown;
      const allowed = faceDown ? state.actions.playFaceDown : state.actions.play;
      if (!allowed) return { state, play: null };
      return {
        state: { ...state, selected: null, faceDown: false },
        play: { cardId: action.cardId, faceDown },
      };
    }
  }
}

/**
 * Mutable holder for HandState. The table is rebuilt on every snapshot, so the selection
 * lives here (owned by the table screen) and survives those rebuilds.
 */
export interface HandStore {
  readonly state: HandState;
  dispatch(action: HandAction): HandPlay | null;
}

export function createHandStore(): HandStore {
  let state = initialHandState();
  return {
    get state() {
      return state;
    },
    dispatch(action) {
      const r = handReduce(state, action);
      state = r.state;
      return r.play;
    },
  };
}
