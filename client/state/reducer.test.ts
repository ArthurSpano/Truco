import { describe, expect, it } from 'vitest';
import type { ErrorCode, RoomState, ServerMessage } from '../../shared/protocol.js';
import type { GameEvent, GameView } from '../../shared/types.js';
import { errorText } from './messages.js';
import { initialState, reduce, type AppState } from './reducer.js';

const room: RoomState = { code: 'BAR7', mode: 2, status: 'lobby', you: 'p1', players: [] };
const view = { mode: 2, seat: 0 } as unknown as GameView;
const event: GameEvent = { t: 'truco_called', seat: 0, stake: 3 };

function server(state: AppState, msg: ServerMessage, now = 0): AppState {
  return reduce(state, { kind: 'server', msg, now });
}

describe('reduce', () => {
  it('stores token and code on joined', () => {
    const s = server(initialState(), { t: 'joined', token: 'tok', code: 'BAR7' });
    expect(s.token).toBe('tok');
    expect(s.code).toBe('BAR7');
  });

  it('replaces room on room_state', () => {
    expect(server(initialState(), { t: 'room_state', room }).room).toEqual(room);
  });

  it('replaces view and clears events on game_state', () => {
    let s = server(initialState(), { t: 'event', event });
    s = server(s, { t: 'game_state', view });
    expect(s.view).toBe(view);
    expect(s.events).toEqual([]);
  });

  it('appends events', () => {
    let s = server(initialState(), { t: 'event', event });
    s = server(s, { t: 'event', event });
    expect(s.events).toHaveLength(2);
  });

  it('appends chat with timestamp', () => {
    const s = server(initialState(), { t: 'chat', seat: 1, phraseId: 'bora' }, 42);
    expect(s.chat).toEqual([{ seat: 1, phraseId: 'bora', at: 42 }]);
  });

  it('sets and clears errors', () => {
    let s = server(initialState(), { t: 'error', code: 'room_full', msg: 'x' });
    expect(s.error).toEqual({ code: 'room_full', text: errorText('room_full') });
    s = reduce(s, { kind: 'clear_error' });
    expect(s.error).toBeNull();
  });

  it('updates connection status', () => {
    expect(reduce(initialState(), { kind: 'conn', status: 'open' }).conn).toBe('open');
  });

  it('resets to the initial state', () => {
    const s = server(initialState(), { t: 'joined', token: 't', code: 'C' });
    expect(reduce(s, { kind: 'reset' })).toEqual(initialState());
  });
});

describe('bad_token', () => {
  it('drops the stale room and keeps the error', () => {
    let s = server(initialState(), { t: 'joined', token: 'tok', code: 'BAR7' });
    s = server(s, { t: 'room_state', room });
    s = server(s, { t: 'game_state', view });
    s = reduce(s, { kind: 'conn', status: 'open' });
    s = server(s, { t: 'error', code: 'bad_token', msg: 'x' });
    expect(s.room).toBeNull();
    expect(s.view).toBeNull();
    expect(s.code).toBeNull();
    expect(s.token).toBeNull();
    expect(s.conn).toBe('open');
    expect(s.error?.code).toBe('bad_token');
  });
});

describe('errorText', () => {
  const codes: ErrorCode[] = [
    'bad_message',
    'rate_limited',
    'not_in_room',
    'already_in_room',
    'room_not_found',
    'room_full',
    'room_started',
    'bad_token',
    'bad_seat',
    'seat_taken',
    'need_seat',
    'not_in_lobby',
    'not_playing',
    'illegal_intent',
    'internal',
  ];
  it.each(codes)('has pt-BR text for %s', (code) => {
    expect(errorText(code).length).toBeGreaterThan(0);
  });
});
