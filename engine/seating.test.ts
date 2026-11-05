import { describe, expect, it } from 'vitest';
import type { GameMode } from '../shared/types.js';
import {
  GAME_MODES,
  assertSeat,
  isGameMode,
  maoSeat,
  nextDealer,
  nextSeat,
  partnersOf,
  seatsOf,
  seatsOfTeam,
  teamOf,
  turnOrder,
} from './seating.js';

describe('game modes', () => {
  it('supports 2, 4 and 6 players', () => {
    expect(GAME_MODES).toEqual([2, 4, 6]);
  });

  it.each([2, 4, 6])('accepts %i as a mode', (n) => {
    expect(isGameMode(n)).toBe(true);
  });

  it.each([0, 1, 3, 5, 8, 2.5, -2, NaN, '4', null, undefined])('rejects %p as a mode', (n) => {
    expect(isGameMode(n)).toBe(false);
  });
});

describe('seatsOf', () => {
  it.each([
    [2, [0, 1]],
    [4, [0, 1, 2, 3]],
    [6, [0, 1, 2, 3, 4, 5]],
  ] as const)('%i players → seats %j', (mode, seats) => {
    expect(seatsOf(mode)).toEqual(seats);
  });
});

describe('assertSeat', () => {
  it('accepts every seat of the mode', () => {
    for (const mode of GAME_MODES) {
      for (const seat of seatsOf(mode))
        expect(() => {
          assertSeat(seat, mode);
        }).not.toThrow();
    }
  });

  it.each([
    [2, 2],
    [4, 4],
    [6, 6],
    [4, -1],
    [4, 1.5],
    [6, NaN],
  ] as const)('mode %i rejects seat %p', (mode, seat) => {
    expect(() => {
      assertSeat(seat, mode);
    }).toThrow(/seat/i);
  });
});

describe('teams by seat parity', () => {
  it('2 players: 1v1', () => {
    expect(teamOf(0)).toBe(0);
    expect(teamOf(1)).toBe(1);
    expect(seatsOfTeam(0, 2)).toEqual([0]);
    expect(seatsOfTeam(1, 2)).toEqual([1]);
  });

  it('4 players: partners sit opposite each other', () => {
    expect(seatsOfTeam(0, 4)).toEqual([0, 2]);
    expect(seatsOfTeam(1, 4)).toEqual([1, 3]);
    // Opposite = half the table away.
    for (const seat of seatsOf(4)) {
      expect(partnersOf(seat, 4)).toEqual([(seat + 2) % 4]);
    }
  });

  it('6 players: teams alternate A,B,A,B,A,B', () => {
    expect(seatsOf(6).map(teamOf)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(seatsOfTeam(0, 6)).toEqual([0, 2, 4]);
    expect(seatsOfTeam(1, 6)).toEqual([1, 3, 5]);
    expect(partnersOf(3, 6)).toEqual([1, 5]);
  });

  it('has no partners in 2 players', () => {
    expect(partnersOf(0, 2)).toEqual([]);
    expect(partnersOf(1, 2)).toEqual([]);
  });

  it('never seats two teammates next to each other', () => {
    for (const mode of GAME_MODES) {
      for (const seat of seatsOf(mode)) {
        expect(teamOf(nextSeat(seat, mode))).not.toBe(teamOf(seat));
      }
    }
  });

  it('validates the seat', () => {
    expect(() => partnersOf(4, 4)).toThrow(/seat/i);
    expect(() => teamOf(-1)).toThrow(/seat/i);
  });
});

describe('counter-clockwise turns', () => {
  it('passes the turn to the next seat counter-clockwise, wrapping around', () => {
    expect(nextSeat(0, 2)).toBe(1);
    expect(nextSeat(1, 2)).toBe(0);
    expect(nextSeat(2, 4)).toBe(3);
    expect(nextSeat(3, 4)).toBe(0);
    expect(nextSeat(5, 6)).toBe(0);
  });

  it('validates the seat', () => {
    expect(() => nextSeat(2, 2)).toThrow(/seat/i);
  });

  it.each([
    [2, 1, [1, 0]],
    [4, 0, [0, 1, 2, 3]],
    [4, 3, [3, 0, 1, 2]],
    [6, 4, [4, 5, 0, 1, 2, 3]],
  ] as const)('%i players, leader %i → order %j', (mode, leader, order) => {
    expect(turnOrder(leader, mode)).toEqual(order);
  });

  it('every turn order alternates teams and visits each seat once', () => {
    for (const mode of GAME_MODES) {
      for (const leader of seatsOf(mode)) {
        const order = turnOrder(leader, mode);
        expect([...order].sort()).toEqual(seatsOf(mode));
        order.forEach((seat, i) => {
          expect(teamOf(seat)).toBe((teamOf(leader) + i) % 2);
        });
      }
    }
  });
});

describe('dealer and mão', () => {
  it("the mão is the player to the dealer's right (next counter-clockwise)", () => {
    expect(maoSeat(0, 2)).toBe(1);
    expect(maoSeat(1, 2)).toBe(0);
    expect(maoSeat(3, 4)).toBe(0);
    expect(maoSeat(2, 6)).toBe(3);
  });

  it('the mão is always on the other team from the dealer', () => {
    for (const mode of GAME_MODES) {
      for (const dealer of seatsOf(mode)) {
        expect(teamOf(maoSeat(dealer, mode))).not.toBe(teamOf(dealer));
      }
    }
  });

  it('the dealer rotates counter-clockwise, so last hand’s mão deals next', () => {
    for (const mode of GAME_MODES) {
      for (const dealer of seatsOf(mode)) {
        expect(nextDealer(dealer, mode)).toBe(maoSeat(dealer, mode));
      }
    }
  });

  it.each([2, 4, 6] as const)('%i players: every seat deals once per lap', (mode: GameMode) => {
    const dealers: number[] = [];
    let dealer = 0;
    for (let hand = 0; hand < mode; hand++) {
      dealers.push(dealer);
      dealer = nextDealer(dealer, mode);
    }
    expect(dealers).toEqual(seatsOf(mode));
    expect(dealer).toBe(0);
  });

  it('validates the seat', () => {
    expect(() => maoSeat(6, 6)).toThrow(/seat/i);
    expect(() => nextDealer(4, 4)).toThrow(/seat/i);
  });
});
