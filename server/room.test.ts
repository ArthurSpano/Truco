import { describe, expect, it } from 'vitest';
import type { GameMode } from '../shared/types.js';
import { Room } from './room.js';

/** Fills a room with `n` players (default: all seats) named P1, P2... */
function setup(mode: GameMode, n: number = mode, seed = 7) {
  const room = new Room('BAR7', mode, seed);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = room.addPlayer(`P${i + 1}`, 0);
    if (!r.ok) throw new Error(r.msg);
    ids.push(r.value.id);
  }
  return { room, ids };
}

function startGame(mode: GameMode, seed = 7) {
  const { room, ids } = setup(mode, mode, seed);
  ids.forEach((id, i) => {
    expect(room.pickSeat(id, i).ok).toBe(true);
    expect(room.toggleReady(id).ok).toBe(true);
  });
  return { room, ids };
}

describe('Room joining', () => {
  it('marks the first joiner as host and tells each player who they are', () => {
    const { room, ids } = setup(2);
    const state = room.roomStateFor(must(ids[1]));
    expect(state.you).toBe(ids[1]);
    expect(state.players.map((p) => p.host)).toEqual([true, false]);
    expect(ids).toEqual(['p1', 'p2']);
    expect(room.playerByToken('nope')).toBeNull();
  });

  it('resolves tokens to players', () => {
    const room = new Room('BAR7', 2, 1);
    const r = room.addPlayer('Ana', 0);
    if (!r.ok) throw new Error('join failed');
    expect(room.playerByToken(r.value.token)).toBe(r.value.id);
  });

  it('rejects a join when full, and after the start', () => {
    const { room } = setup(2);
    const full = room.addPlayer('X', 0);
    expect(full).toMatchObject({ ok: false, code: 'room_full' });
    const started = startGame(2);
    expect(started.room.addPlayer('X', 0)).toMatchObject({ ok: false, code: 'room_started' });
  });
});

describe('Room seats', () => {
  it('picks a seat, and rejects an occupied one without changing state', () => {
    const { room, ids } = setup(2);
    expect(room.pickSeat(must(ids[0]), 1).ok).toBe(true);
    expect(room.seatOf(must(ids[0]))).toBe(1);
    const before = JSON.stringify(room.roomStateFor(must(ids[1])));
    expect(room.pickSeat(must(ids[1]), 1)).toMatchObject({ ok: false, code: 'seat_taken' });
    expect(JSON.stringify(room.roomStateFor(must(ids[1])))).toBe(before);
  });

  it.each([-1, 2, 1.5])('rejects seat %s as bad_seat', (seat) => {
    const { room, ids } = setup(2);
    expect(room.pickSeat(must(ids[0]), seat)).toMatchObject({ ok: false, code: 'bad_seat' });
  });

  it('frees the old seat on a move and clears ready', () => {
    const { room, ids } = setup(2);
    room.pickSeat(must(ids[0]), 0);
    room.toggleReady(must(ids[0]));
    room.pickSeat(must(ids[0]), 1);
    expect(room.pickSeat(must(ids[1]), 0).ok).toBe(true);
    const me = room.roomStateFor(must(ids[0])).players.find((p) => p.id === ids[0]);
    expect(me).toMatchObject({ seat: 1, ready: false });
  });

  it('refuses seat picks outside the lobby', () => {
    const { room, ids } = startGame(2);
    expect(room.pickSeat(must(ids[0]), 1)).toMatchObject({ ok: false, code: 'not_in_lobby' });
    expect(room.toggleReady(must(ids[0]))).toMatchObject({ ok: false, code: 'not_in_lobby' });
  });
});

describe('Room ready and start', () => {
  it('needs a seat to be ready, and toggles', () => {
    const { room, ids } = setup(2);
    expect(room.toggleReady(must(ids[0]))).toMatchObject({ ok: false, code: 'need_seat' });
    room.pickSeat(must(ids[0]), 0);
    room.toggleReady(must(ids[0]));
    room.toggleReady(must(ids[0]));
    expect(must(room.roomStateFor(must(ids[0])).players[0]).ready).toBe(false);
  });

  it('starts only when every seat is ready', () => {
    const { room, ids } = setup(2);
    room.pickSeat(must(ids[0]), 0);
    room.pickSeat(must(ids[1]), 1);
    room.toggleReady(must(ids[0]));
    expect(room.status).toBe('lobby');
    expect(room.gameViewFor(must(ids[0]))).toBeNull();
    room.toggleReady(must(ids[1]));
    expect(room.status).toBe('playing');
    expect(room.gameViewFor(must(ids[0]))).not.toBeNull();
  });

  it('is blocked by a disconnected seated player', () => {
    const { room, ids } = setup(2);
    room.pickSeat(must(ids[0]), 0);
    room.pickSeat(must(ids[1]), 1);
    room.toggleReady(must(ids[1]));
    room.setConnected(must(ids[1]), false, 100);
    // Disconnecting in the lobby also clears ready.
    expect(must(room.roomStateFor(must(ids[0])).players[1]).ready).toBe(false);
    room.toggleReady(must(ids[0]));
    expect(room.status).toBe('lobby');
    room.setConnected(must(ids[1]), true, 200);
    room.toggleReady(must(ids[1]));
    expect(room.status).toBe('playing');
  });

  it.each([2, 4, 6] as const)('starts a %i-player game with seats in order', (mode) => {
    const { room, ids } = startGame(mode);
    expect(room.status).toBe('playing');
    ids.forEach((id, i) => {
      const view = must(room.gameViewFor(id));
      expect(view.seat).toBe(i);
      expect(view.team).toBe(i % 2);
    });
  });
});

describe('Room game intents', () => {
  it('rejects intents before the start', () => {
    const { room, ids } = setup(2);
    room.pickSeat(must(ids[0]), 0);
    expect(room.applyGameIntent(must(ids[0]), { t: 'call_truco' })).toMatchObject({
      ok: false,
      code: 'not_playing',
    });
  });

  it('rejects intents from an unseated player', () => {
    const { room, ids } = setup(2);
    room.pickSeat(must(ids[0]), 0);
    room.pickSeat(must(ids[1]), 1);
    room.toggleReady(must(ids[0]));
    room.toggleReady(must(ids[1]));
    room.removePlayer(must(ids[1])); // ignored once playing
    expect(room.seatOf(must(ids[1]))).toBe(1);
    expect(room.applyGameIntent('ghost', { t: 'call_truco' })).toMatchObject({
      ok: false,
      code: 'need_seat',
    });
  });

  it('applies a legal play, updates other views, and rejects out of turn', () => {
    const { room, ids } = startGame(2);
    const views = ids.map((id) => must(room.gameViewFor(id)));
    const turnIdx = must(must(views[0]).turn);
    const actor = must(ids[turnIdx]);
    const other = must(ids[1 - turnIdx]);
    const card = must(must(must(must(views[turnIdx]).players[turnIdx]).cards)[0]);

    expect(room.applyGameIntent(other, { t: 'play_card', cardId: card.id })).toMatchObject({
      ok: false,
      code: 'illegal_intent',
    });
    const r = room.applyGameIntent(actor, { t: 'play_card', cardId: card.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.length).toBeGreaterThan(0);
    expect(must(room.gameViewFor(other)).trick).toHaveLength(1);
  });

  it('never exposes another player cards', () => {
    const { room, ids } = startGame(2);
    const bView = must(room.gameViewFor(must(ids[1])));
    const bCards = must(must(bView.players[1]).cards);
    const aView = must(room.gameViewFor(must(ids[0])));
    expect(must(aView.players[1]).cards).toBeNull();
    const json = JSON.stringify(aView);
    for (const c of bCards) expect(json).not.toContain(c.id);
  });

  it('keeps seat and game state when a player disconnects', () => {
    const { room, ids } = startGame(2);
    const before = room.gameViewFor(must(ids[0]));
    room.setConnected(must(ids[1]), false, 5);
    expect(room.seatOf(must(ids[1]))).toBe(1);
    expect(must(room.roomStateFor(must(ids[0])).players[1]).connected).toBe(false);
    expect(room.gameViewFor(must(ids[0]))).toEqual(before);
  });
});

describe('Room stale lobby players', () => {
  it('lists players disconnected longer than the grace period', () => {
    const { room, ids } = setup(4, 3);
    room.pickSeat(must(ids[0]), 0);
    room.setConnected(must(ids[0]), false, 1_000);
    room.setConnected(must(ids[1]), false, 3_000);
    expect(room.staleLobbyPlayers(32_000, 30_000)).toEqual([ids[0]]);
    room.removePlayer(must(ids[0]));
    expect(room.playerIds()).toEqual([ids[1], ids[2]]);
    expect(room.pickSeat(must(ids[1]), 0).ok).toBe(true);
  });

  it('returns nothing once playing', () => {
    const { room, ids } = startGame(2);
    room.setConnected(must(ids[0]), false, 0);
    expect(room.staleLobbyPlayers(1_000_000, 30_000)).toEqual([]);
  });
});

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('unexpected nullish value');
  return value;
}
