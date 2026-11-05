import type { GameEvent, GameIntent, GameMode, GameView, Seat } from './types.js';

/** Length of a room code, e.g. `BAR7`. */
export const ROOM_CODE_LENGTH = 4;
/** Longest display name, in characters. */
export const MAX_NAME_LENGTH = 16;
/** Largest accepted client message, in bytes. */
export const MAX_MESSAGE_BYTES = 2048;
/** Ping interval for dropping dead sockets. */
/**
 * WebSocket close code sent to a socket whose seat was taken over by another
 * socket (rejoin). Clients must NOT auto-reconnect after this code.
 */
export const REPLACED_CLOSE_CODE = 4001;

export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Room code letters and digits, without I/O/0/1, which are easy to misread on a phone. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Quick-chat phrases (shown in pt-BR by the client). */
export const QUICK_PHRASES = ['bora', 'fraco', 'truco_ladrao', 'meu', 'rapaz'] as const;
export type PhraseId = (typeof QUICK_PHRASES)[number];

export type ErrorCode =
  | 'bad_message'
  | 'rate_limited'
  | 'not_in_room'
  | 'already_in_room'
  | 'room_not_found'
  | 'room_full'
  | 'room_started'
  | 'bad_token'
  | 'bad_seat'
  | 'seat_taken'
  | 'need_seat'
  | 'not_in_lobby'
  | 'not_playing'
  | 'illegal_intent'
  | 'internal';

/** Everything a client may send. The server validates each one. `ready` toggles. */
export type ClientMessage =
  | { t: 'create_room'; mode: GameMode; name: string }
  | { t: 'join_room'; code: string; name: string }
  | { t: 'rejoin'; token: string }
  | { t: 'pick_seat'; seat: Seat }
  | { t: 'ready' }
  | GameIntent
  | { t: 'chat_quick'; phraseId: PhraseId };

/** A person in a room, as listed in the lobby. */
export interface PlayerInfo {
  id: string;
  name: string;
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
  host: boolean;
}

export interface RoomState {
  code: string;
  mode: GameMode;
  status: 'lobby' | 'playing' | 'finished';
  /** The receiving player's id. */
  you: string;
  players: PlayerInfo[];
}

export type ServerMessage =
  | { t: 'joined'; token: string; code: string }
  | { t: 'room_state'; room: RoomState }
  | { t: 'game_state'; view: GameView }
  | { t: 'event'; event: GameEvent }
  | { t: 'chat'; seat: Seat; phraseId: PhraseId }
  | { t: 'error'; code: ErrorCode; msg: string };
