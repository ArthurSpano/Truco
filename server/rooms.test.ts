import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/protocol.js';
import { LOBBY_GRACE_MS, ROOM_IDLE_MS, RoomRegistry } from './rooms.js';

/** randomInt stub that replays `values`, then falls back to a counter. */
function scripted(values: number[]): (max: number) => number {
  let i = 0;
  let extra = 0;
  return (max) => (i < values.length ? (values[i++] ?? 0) : extra++) % max;
}

const idx = (s: string): number[] => s.split('').map((c) => ROOM_CODE_ALPHABET.indexOf(c));

describe('RoomRegistry codes', () => {
  it('creates 4-char codes from the alphabet', () => {
    const room = new RoomRegistry().createRoom(4);
    expect(room.code).toHaveLength(ROOM_CODE_LENGTH);
    for (const c of room.code) expect(ROOM_CODE_ALPHABET).toContain(c);
  });

  it('creates 200 distinct codes', () => {
    const reg = new RoomRegistry();
    const codes = new Set(Array.from({ length: 200 }, () => reg.createRoom(2).code));
    expect(codes.size).toBe(200);
    expect(reg.size).toBe(200);
  });

  it('retries on collision', () => {
    const reg = new RoomRegistry({ randomInt: scripted([...idx('BAR7'), ...idx('BAR7')]) });
    const a = reg.createRoom(2);
    const b = reg.createRoom(2);
    expect(a.code).toBe('BAR7');
    expect(b.code).not.toBe(a.code);
  });

  it('getRoom is case-insensitive and trims', () => {
    const reg = new RoomRegistry({ randomInt: scripted(idx('BAR7')) });
    const room = reg.createRoom(4);
    expect(reg.getRoom(' bar7 ')).toBe(room);
    expect(reg.getRoom('ZZZZ')).toBeUndefined();
  });
});

describe('RoomRegistry tokens', () => {
  it('finds room and player by token', () => {
    const reg = new RoomRegistry();
    const room = reg.createRoom(2);
    const added = room.addPlayer('Ana', 0);
    if (!added.ok) throw new Error('addPlayer failed');
    expect(reg.findByToken(added.value.token)).toEqual({ room, playerId: added.value.id });
    expect(reg.findByToken('nope')).toBeNull();
  });
});

describe('RoomRegistry sweep', () => {
  it('removes lobby players disconnected past the grace period', () => {
    const reg = new RoomRegistry();
    const room = reg.createRoom(2);
    const a = room.addPlayer('Ana', 0);
    const b = room.addPlayer('Beto', 0);
    if (!a.ok || !b.ok) throw new Error('addPlayer failed');
    room.setConnected(a.value.id, false, 1_000);
    reg.sweep(1_000 + LOBBY_GRACE_MS + 1_000);
    expect(room.playerIds()).toEqual([b.value.id]);
    expect(reg.findByToken(a.value.token)).toBeNull();
  });

  it('keeps lobby players within the grace period', () => {
    const reg = new RoomRegistry();
    const room = reg.createRoom(2);
    const a = room.addPlayer('Ana', 0);
    if (!a.ok) throw new Error('addPlayer failed');
    room.setConnected(a.value.id, false, 1_000);
    reg.sweep(1_000 + LOBBY_GRACE_MS - 1);
    expect(room.playerIds()).toEqual([a.value.id]);
  });

  it('deletes idle rooms with nobody connected', () => {
    const reg = new RoomRegistry();
    const room = reg.createRoom(2);
    const a = room.addPlayer('Ana', 0);
    if (!a.ok) throw new Error('addPlayer failed');
    room.setConnected(a.value.id, false, 0);
    const deleted = reg.sweep(11 * 60_000);
    expect(deleted).toEqual([room.code]);
    expect(reg.getRoom(room.code)).toBeUndefined();
    expect(reg.findByToken(a.value.token)).toBeNull();
  });

  it('keeps a room with a connected player regardless of age', () => {
    const reg = new RoomRegistry();
    const room = reg.createRoom(2);
    room.addPlayer('Ana', 0);
    room.lastActivity = 0;
    expect(reg.sweep(ROOM_IDLE_MS * 10)).toEqual([]);
    expect(reg.size).toBe(1);
  });

  it('keeps a playing room with a disconnected player idle for 1 min', () => {
    const reg = new RoomRegistry();
    const room = reg.createRoom(2);
    const a = room.addPlayer('Ana', 0);
    const b = room.addPlayer('Beto', 0);
    if (!a.ok || !b.ok) throw new Error('addPlayer failed');
    room.pickSeat(a.value.id, 0);
    room.pickSeat(b.value.id, 1);
    room.toggleReady(a.value.id);
    room.toggleReady(b.value.id);
    expect(room.status).toBe('playing');
    room.setConnected(a.value.id, false, 0);
    room.setConnected(b.value.id, false, 0);
    expect(reg.sweep(60_000)).toEqual([]);
    expect(reg.size).toBe(1);
  });
});
