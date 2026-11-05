import type { ErrorCode, PhraseId, RoomState, ServerMessage } from '../../shared/protocol.js';
import type { GameEvent, GameView } from '../../shared/types.js';
import { errorText } from './messages.js';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface AppState {
  conn: ConnStatus;
  token: string | null;
  code: string | null;
  room: RoomState | null;
  view: GameView | null;
  events: GameEvent[];
  chat: { seat: number; phraseId: PhraseId; at: number }[];
  error: { code: ErrorCode; text: string } | null;
}

export type Action =
  | { kind: 'server'; msg: ServerMessage; now: number }
  | { kind: 'conn'; status: ConnStatus }
  | { kind: 'clear_error' }
  | { kind: 'reset' };

export function initialState(): AppState {
  return {
    conn: 'connecting',
    token: null,
    code: null,
    room: null,
    view: null,
    events: [],
    chat: [],
    error: null,
  };
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.kind) {
    case 'conn':
      return { ...state, conn: action.status };
    case 'clear_error':
      return { ...state, error: null };
    case 'reset':
      return initialState();
    case 'server': {
      const msg = action.msg;
      switch (msg.t) {
        case 'joined':
          return { ...state, token: msg.token, code: msg.code };
        case 'room_state':
          return { ...state, room: msg.room };
        case 'game_state':
          return { ...state, view: msg.view, events: [] };
        case 'event':
          return { ...state, events: [...state.events, msg.event] };
        case 'chat':
          return {
            ...state,
            chat: [...state.chat, { seat: msg.seat, phraseId: msg.phraseId, at: action.now }],
          };
        case 'error':
          return { ...state, error: { code: msg.code, text: errorText(msg.code) } };
      }
    }
  }
}
