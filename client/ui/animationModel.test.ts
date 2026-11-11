import { describe, expect, it } from 'vitest';
import type { Card, GameEvent, TableCard, TrickWinner } from '../../shared/types.js';
import {
  TRICK_HOLD_MS,
  TRICK_SWEEP_MS,
  animationsFor,
  animationsForBurst,
  handToast,
  scheduleBurst,
  trickResults,
} from './animationModel.js';

const card = (id: Card['id'], rank: Card['rank'], suit: Card['suit']): Card => ({ id, rank, suit });
const up = (seat: number, c: Card): TableCard => ({ seat, faceDown: false, card: c });
const down = (seat: number): TableCard => ({ seat, faceDown: true });
const played = (seat: number): GameEvent => ({ t: 'card_played', seat, card: down(seat) });
const trickWon = (
  cards: TableCard[],
  winner: TrickWinner,
  winnerSeat: number | null,
): GameEvent => ({ t: 'trick_won', winner, winnerSeat, leader: cards[0]?.seat ?? 0, cards });
const handWon = (
  over: Partial<Extract<GameEvent, { t: 'hand_won' }>> = {},
): Extract<GameEvent, { t: 'hand_won' }> => ({
  t: 'hand_won',
  team: 0,
  points: 1,
  ranBy: null,
  reason: 'tricks',
  tricks: [0, 0],
  scores: [1, 0],
  ...over,
});
const dealt = (over: Partial<Extract<GameEvent, { t: 'hand_dealt' }>> = {}): GameEvent => ({
  t: 'hand_dealt',
  handNumber: 2,
  dealer: 1,
  maoDeOnze: null,
  maoDeFerro: false,
  ...over,
});

describe('animationsFor', () => {
  it.each([
    [0, 'bottom'],
    [1, 'right'],
    [2, 'top'],
    [3, 'left'],
  ])('card_played by seat %i slides from %s (4 players, viewer seat 0)', (seat, anchor) => {
    expect(animationsFor(played(seat), 0, 0, 4)).toEqual([{ kind: 'slide', anchor }]);
  });

  it('is relative to the viewer seat', () => {
    expect(animationsFor(played(0), 1, 1, 4)).toEqual([{ kind: 'slide', anchor: 'left' }]);
    expect(animationsFor(played(1), 0, 0, 6)).toEqual([{ kind: 'slide', anchor: 'bottom-right' }]);
  });

  it('holds a finished trick with per-card results and sweeps toward the winning card', () => {
    const cards = [up(0, card('4c', '4', 'clubs')), up(1, card('7d', '7', 'diamonds')), down(2)];
    const [anim] = animationsFor(trickWon(cards, 1, 1), 0, 0, 4);
    expect(anim).toEqual({
      kind: 'trick',
      toward: 'right',
      flyIn: null,
      cards: [
        { anchor: 'bottom', card: cards[0], result: 'lose' },
        { anchor: 'right', card: cards[1], result: 'win' },
        { anchor: 'top', card: cards[2], result: 'lose' },
      ],
    });
  });

  it('a tied trick has no winner to sweep to', () => {
    const [anim] = animationsFor(trickWon([down(0), down(1)], null, null), 0, 0, 2);
    expect(anim).toMatchObject({ kind: 'trick', toward: null });
  });

  it.each([
    [3, 'TRUCO!', 1],
    [6, 'SEIS!', 1],
    [9, 'NOVE!', 2],
    [12, 'DOZE!', 3],
  ])('truco_called stake %i shows %s and shakes with strength %i', (stake, text, strength) => {
    expect(animationsFor({ t: 'truco_called', seat: 1, stake }, 0, 0, 4)).toEqual([
      { kind: 'banner', text },
      { kind: 'shake', strength },
    ]);
  });

  it('a raise is shouted like a call; accept and run are only bubbles', () => {
    const raise: GameEvent = { t: 'truco_answered', seat: 1, answer: 'raise', stake: 6 };
    expect(animationsFor(raise, 0, 0, 4)[0]).toEqual({ kind: 'banner', text: 'SEIS!' });
    const accept: GameEvent = { t: 'truco_answered', seat: 1, answer: 'accept', stake: 3 };
    expect(animationsFor(accept, 0, 0, 4)).toEqual([]);
  });

  it('deals a new hand and announces mão de onze / mão de ferro', () => {
    expect(animationsFor(dealt(), 0, 0, 4)).toEqual([{ kind: 'deal' }]);
    expect(animationsFor(dealt({ maoDeOnze: 1 }), 0, 0, 4)).toEqual([
      { kind: 'deal' },
      { kind: 'banner', text: 'MÃO DE ONZE!' },
    ]);
    expect(animationsFor(dealt({ maoDeOnze: 1, maoDeFerro: true }), 0, 0, 4)).toEqual([
      { kind: 'deal' },
      { kind: 'banner', text: 'MÃO DE FERRO!' },
    ]);
  });

  it('shows a toast when a hand is won, from the viewer side', () => {
    expect(animationsFor(handWon({ team: 1 }), 0, 0, 4)).toEqual([
      { kind: 'toast', toast: handToast(handWon({ team: 1 }), 0) },
    ]);
  });

  it('ignores other events', () => {
    expect(animationsFor({ t: 'mao_de_onze_decided', seat: 0, play: true }, 0, 0, 4)).toEqual([]);
    expect(animationsFor({ t: 'match_won', team: 0, scores: [12, 3] }, 0, 0, 4)).toEqual([]);
  });
});

describe('trickResults', () => {
  const cards = [down(0), down(1), down(2), down(3)];
  it('marks the winning card and dims the rest', () => {
    expect(trickResults(cards, 0, 2)).toEqual(['lose', 'lose', 'win', 'lose']);
  });
  it('marks every card of a tied trick', () => {
    expect(trickResults(cards, null, null)).toEqual(['tie', 'tie', 'tie', 'tie']);
  });
});

describe('handToast', () => {
  it('titles the hand for us or them, with the points', () => {
    expect(handToast(handWon({ team: 0, points: 3 }), 0)).toMatchObject({
      ours: true,
      title: 'Nós levamos a mão!',
      points: 3,
    });
    expect(handToast(handWon({ team: 0 }), 1)).toMatchObject({
      ours: false,
      title: 'Eles levaram a mão',
    });
  });

  it('explains the result from hand_won.reason', () => {
    const run = handWon({ team: 0, reason: 'truco_run', ranBy: 1, tricks: [] });
    expect(handToast(run, 0).why).toBe('Eles correram');
    expect(handToast(run, 1).why).toBe('Nós corremos');
    const m11 = handWon({ team: 1, reason: 'mao_de_onze_run', ranBy: 0, tricks: [] });
    expect(handToast(m11, 0).why).toBe('Corremos da mão de onze');
    expect(handToast(m11, 1).why).toBe('Correram da mão de onze');
    expect(handToast(handWon({ tricks: [0, 1, 0] }), 0).why).toBe('2 a 1 nas rodadas');
    expect(handToast(handWon({ tricks: [null, 0] }), 0).why).toBe('1 a 0 · 1 empate');
    expect(handToast(handWon({ tricks: [null, null, null] }), 0).why).toBe('Tudo empatado');
  });
});

describe('animationsForBurst', () => {
  it('folds the card that completes a trick into the held trick', () => {
    const cards = [down(0), down(1)];
    const anims = animationsForBurst([played(1), trickWon(cards, 0, 0)], 0, 0, 2);
    expect(anims).toHaveLength(1);
    expect(anims[0]).toMatchObject({ kind: 'trick', flyIn: 'top', toward: 'bottom' });
  });

  it('keeps an ordinary slide', () => {
    expect(animationsForBurst([played(1)], 0, 0, 4)).toEqual([{ kind: 'slide', anchor: 'right' }]);
  });
});

describe('scheduleBurst', () => {
  it('waits for the last trick before the toast, the deal and any banner', () => {
    const burst = animationsForBurst(
      [
        played(1),
        trickWon([down(0), down(1)], 0, 0),
        handWon(),
        dealt({ maoDeFerro: true, maoDeOnze: 0 }),
      ],
      0,
      0,
      2,
    );
    const wait = TRICK_HOLD_MS + TRICK_SWEEP_MS;
    expect(scheduleBurst(burst).map(({ at, anim }) => [anim.kind, at])).toEqual([
      ['trick', 0],
      ['toast', wait],
      ['deal', wait],
      ['banner', wait],
    ]);
  });

  it('plays a burst without a trick right away', () => {
    const burst = animationsForBurst([handWon({ reason: 'truco_run' }), dealt()], 0, 0, 4);
    expect(scheduleBurst(burst).every(({ at }) => at === 0)).toBe(true);
  });
});
