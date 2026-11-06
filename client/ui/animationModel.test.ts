import { describe, expect, it } from 'vitest';
import type { GameEvent, TableCard } from '../../shared/types.js';
import { animationFor } from './animationModel.js';

const card: TableCard = { seat: 0, faceDown: true };
const played = (seat: number): GameEvent => ({ t: 'card_played', seat, card: { ...card, seat } });

describe('animationFor', () => {
  it.each([
    [0, 'bottom'],
    [1, 'right'],
    [2, 'top'],
  ])('card_played by seat %i slides from %s (4 players, viewer seat 0)', (seat, anchor) => {
    expect(animationFor(played(seat), 0, 4)).toEqual({ kind: 'slide', anchor });
  });

  it('is relative to the viewer seat', () => {
    expect(animationFor(played(0), 1, 4)).toEqual({ kind: 'slide', anchor: 'left' });
  });

  it('sweeps toward the anchor of the leader', () => {
    const e: GameEvent = { t: 'trick_won', winner: 1, leader: 3, cards: [] };
    expect(animationFor(e, 0, 4)).toEqual({ kind: 'sweep', toward: 'left' });
  });

  it('a tied trick fades at the centre', () => {
    const e: GameEvent = { t: 'trick_won', winner: null, leader: 3, cards: [] };
    expect(animationFor(e, 0, 4)).toEqual({ kind: 'sweep', toward: null });
  });

  it.each([
    [3, 1],
    [6, 1],
    [9, 2],
    [12, 3],
  ])('truco_called stake %i shakes with strength %i', (stake, strength) => {
    expect(animationFor({ t: 'truco_called', seat: 1, stake }, 0, 4)).toEqual({
      kind: 'shake',
      strength,
    });
  });

  it('ignores other events', () => {
    expect(
      animationFor(
        { t: 'hand_dealt', handNumber: 1, dealer: 0, maoDeOnze: null, maoDeFerro: false },
        0,
        4,
      ),
    ).toBeNull();
  });
});
