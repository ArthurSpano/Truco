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
  /** True once a game_state closed the current event burst; the next event starts a new list. */
  eventsStale: boolean;
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
    eventsStale: false,
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
          // The server sends a burst's events BEFORE its game_state, so keep them for consumers.
          return { ...state, view: msg.view, eventsStale: true };
        case 'event':
          return {
            ...state,
            events: state.eventsStale ? [msg.event] : [...state.events, msg.event],
            eventsStale: false,
          };
        case 'chat':
          return {
            ...state,
            chat: [...state.chat, { seat: msg.seat, phraseId: msg.phraseId, at: action.now }],
          };
        case 'error':
          // A rejected rejoin means the old session is gone: drop any stale room.
          if (msg.code === 'bad_token') {
            return {
              ...state,
              room: null,
              view: null,
              code: null,
              token: null,
              events: [],
              eventsStale: false,
              chat: [],
              error: { code: msg.code, text: errorText(msg.code) },
            };
          }
          return { ...state, error: { code: msg.code, text: errorText(msg.code) } };
      }
    }
  }
}
