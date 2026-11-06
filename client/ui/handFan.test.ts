import { describe, expect, it } from 'vitest';
import type { GameActions } from '../../shared/types.js';
import { createHandStore, fanLayout, handReduce, initialHandState } from './handFan.js';
import type { HandAction, HandState } from './handFan.js';

const acts = (over: Partial<GameActions> = {}): GameActions => ({
  play: true,
  playFaceDown: false,
  playBlind: false,
  callTruco: null,
  respond: null,
  decideMaoDeOnze: false,
  ...over,
});

const IDS = ['a', 'b', 'c'];

function run(
  actions: GameActions,
  steps: HandAction[],
): { state: HandState; plays: ({ cardId: string; faceDown: boolean } | null)[] } {
  let state = handReduce(initialHandState(), { kind: 'sync', cardIds: IDS, actions }).state;
  const plays = [];
  for (const s of steps) {
    const r = handReduce(state, s);
    state = r.state;
    plays.push(r.play);
  }
  return { state, plays };
}

describe('fanLayout', () => {
  it('is empty for 0', () => {
    expect(fanLayout(0)).toEqual([]);
  });
  it('is symmetric for 3 and neighbours differ by at most 10 degrees', () => {
    const f = fanLayout(3);
    expect(f[0]?.angle).toBe(-(f[2]?.angle ?? NaN));
    expect(f[1]?.angle).toBe(0);
    for (const n of [2, 3, 4, 10]) {
      const l = fanLayout(n);
      for (let i = 1; i < l.length; i++) {
        expect(Math.abs((l[i]?.angle ?? 0) - (l[i - 1]?.angle ?? 0))).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('handReduce', () => {
  it('first tap selects without playing', () => {
    const r = run(acts(), [{ kind: 'tap', cardId: 'a' }]);
    expect(r.plays).toEqual([null]);
    expect(r.state.selected).toBe('a');
  });
  it('second tap on the same card plays it face up', () => {
    const r = run(acts(), [
      { kind: 'tap', cardId: 'a' },
      { kind: 'tap', cardId: 'a' },
    ]);
    expect(r.plays[1]).toEqual({ cardId: 'a', faceDown: false });
    expect(r.state.selected).toBeNull();
  });
  it('tapping another card moves the selection', () => {
    const r = run(acts(), [
      { kind: 'tap', cardId: 'a' },
      { kind: 'tap', cardId: 'b' },
    ]);
    expect(r.plays).toEqual([null, null]);
    expect(r.state.selected).toBe('b');
  });
  it('does not play when no action allows it', () => {
    const r = run(acts({ play: false }), [
      { kind: 'tap', cardId: 'a' },
      { kind: 'tap', cardId: 'a' },
    ]);
    expect(r.plays[1]).toBeNull();
  });
  it('plays face down after toggling when playFaceDown is allowed', () => {
    const r = run(acts({ playFaceDown: true }), [
      { kind: 'toggle_face_down' },
      { kind: 'tap', cardId: 'a' },
      { kind: 'tap', cardId: 'a' },
    ]);
    expect(r.plays[2]).toEqual({ cardId: 'a', faceDown: true });
  });
  it('toggle has no effect without playFaceDown', () => {
    const r = run(acts(), [
      { kind: 'toggle_face_down' },
      { kind: 'tap', cardId: 'a' },
      { kind: 'tap', cardId: 'a' },
    ]);
    expect(r.state.faceDown).toBe(false);
    expect(r.plays[2]).toEqual({ cardId: 'a', faceDown: false });
  });
  it('sync drops a selection that left the hand and forces faceDown off', () => {
    const r = run(acts({ playFaceDown: true }), [
      { kind: 'tap', cardId: 'a' },
      { kind: 'toggle_face_down' },
      { kind: 'sync', cardIds: ['b', 'c'], actions: acts({ playFaceDown: false }) },
    ]);
    expect(r.state.selected).toBeNull();
    expect(r.state.faceDown).toBe(false);
  });
  it('sync keeps a selection that is still in hand', () => {
    const r = run(acts(), [
      { kind: 'tap', cardId: 'b' },
      { kind: 'sync', cardIds: ['b', 'c'], actions: acts() },
    ]);
    expect(r.state.selected).toBe('b');
  });
});

describe('createHandStore', () => {
  it('keeps state across dispatches', () => {
    const store = createHandStore();
    store.dispatch({ kind: 'sync', cardIds: IDS, actions: acts() });
    store.dispatch({ kind: 'tap', cardId: 'c' });
    expect(store.state.selected).toBe('c');
  });
});
