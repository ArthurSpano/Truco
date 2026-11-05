import { describe, expect, it } from 'vitest';
import type { PlayerInfo, RoomState } from '../../shared/protocol.js';
import { canReady, seatSlots, statusLine, unseated } from './seatSlots.js';

function p(id: string, seat: number | null, ready = false): PlayerInfo {
  return { id, name: id, seat, ready, connected: true, host: false };
}
function room(mode: 2 | 4 | 6, players: PlayerInfo[], you = 'a'): RoomState {
  return { code: 'BAR7', mode, status: 'lobby', you, players };
}

describe('seatSlots', () => {
  it('lists one slot per seat with alternating teams', () => {
    const slots = seatSlots(room(4, [p('a', 0), p('b', 3)]));
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.team)).toEqual([0, 1, 0, 1]);
    expect(slots[1]?.player).toBeNull();
    expect(slots[2]?.player).toBeNull();
    expect(slots[3]?.player?.id).toBe('b');
    expect(slots.map((s) => s.mine)).toEqual([true, false, false, false]);
  });
  it('has six slots in a 6 player room', () => {
    expect(seatSlots(room(6, []))).toHaveLength(6);
  });
});

describe('unseated / canReady', () => {
  it('returns players without a seat', () => {
    const r = room(2, [p('a', null), p('b', 1)]);
    expect(unseated(r).map((x) => x.id)).toEqual(['a']);
    expect(canReady(r)).toBe(false);
  });
  it('allows ready once seated', () => {
    expect(canReady(room(2, [p('a', 0)]))).toBe(true);
  });
});

describe('statusLine', () => {
  it('counts ready players', () => {
    const r = room(4, [p('a', 0, true), p('b', 1, true), p('c', 2), p('d', null, true)]);
    expect(statusLine(r)).toBe('2 de 4 prontos');
  });
  it('waits when nobody is seated', () => {
    expect(statusLine(room(4, [p('a', null)]))).toBe('Esperando jogadores…');
  });
});
