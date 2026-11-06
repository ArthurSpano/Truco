import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/types.js';
import { bubbleFor, bubblesFor, newEvents } from './bubbleModel.js';

const called = (seat: number, stake: number): GameEvent => ({ t: 'truco_called', seat, stake });
const answered = (seat: number, answer: 'accept' | 'run' | 'raise', stake: number): GameEvent => ({
  t: 'truco_answered',
  seat,
  answer,
  stake,
});

describe('bubbleFor', () => {
  it.each([
    [3, 'TRUCO!'],
    [6, 'SEIS!'],
    [9, 'NOVE!'],
    [12, 'DOZE!'],
  ])('call at stake %i says %s', (stake, text) => {
    expect(bubbleFor(called(1, stake))).toEqual({ seat: 1, text, kind: 'call' });
  });

  it('accept and run', () => {
    expect(bubbleFor(answered(2, 'accept', 3))).toEqual({
      seat: 2,
      text: 'Aceito!',
      kind: 'accept',
    });
    expect(bubbleFor(answered(2, 'run', 3))).toEqual({ seat: 2, text: 'Corre!', kind: 'run' });
  });

  it('a raise answer is a call at the new stake', () => {
    expect(bubbleFor(answered(2, 'raise', 6))).toEqual({ seat: 2, text: 'SEIS!', kind: 'call' });
  });

  it('mao de onze decisions', () => {
    expect(bubbleFor({ t: 'mao_de_onze_decided', seat: 0, play: false })?.text).toBe('Corre!');
    expect(bubbleFor({ t: 'mao_de_onze_decided', seat: 0, play: true })?.text).toBe('Vamos jogar!');
  });

  it('ignores unrelated events', () => {
    expect(
      bubbleFor({ t: 'card_played', seat: 0, card: { faceDown: true } } as unknown as GameEvent),
    ).toBeNull();
  });
});

describe('bubblesFor', () => {
  it('keeps order and drops nulls', () => {
    const out = bubblesFor([
      called(1, 3),
      { t: 'match_won', team: 0, scores: [12, 0] },
      answered(2, 'raise', 6),
    ]);
    expect(out.map((b) => b.seat)).toEqual([1, 2]);
    expect(out.map((b) => b.text)).toEqual(['TRUCO!', 'SEIS!']);
  });
});

describe('newEvents', () => {
  const evs = (n: number): GameEvent[] => Array.from({ length: n }, (_, i) => called(i, 3));
  it('first burst of 3', () => {
    expect(newEvents(evs(3), 3, 0)).toHaveLength(3);
  });
  it('later smaller burst replaced the list', () => {
    expect(newEvents(evs(2), 5, 3)).toHaveLength(2);
  });
  it('burst of 1 after burst of 3', () => {
    const list = [called(9, 6)];
    expect(newEvents(list, 4, 3)).toEqual(list);
  });
  it('missed a whole burst: takes all, no negative slice', () => {
    expect(newEvents(evs(2), 10, 3)).toHaveLength(2);
  });
  it('nothing new', () => {
    expect(newEvents(evs(3), 3, 3)).toEqual([]);
  });
});
