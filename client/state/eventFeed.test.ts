import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/types.js';
import { createChatFeed, createEventFeed, newEvents } from './eventFeed.js';
import { initialState, reduce, type AppState } from './reducer.js';

const called = (seat: number, stake = 3): GameEvent => ({ t: 'truco_called', seat, stake });
const evs = (n: number): GameEvent[] => Array.from({ length: n }, (_, i) => called(i));
const st = (events: GameEvent[], eventSeq: number): AppState => ({
  ...initialState(),
  events,
  eventSeq,
});

describe('newEvents', () => {
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

describe('createEventFeed', () => {
  it('first call seeds and returns nothing', () => {
    const feed = createEventFeed();
    expect(feed(st(evs(3), 3))).toEqual([]);
  });
  it('repeated state yields nothing', () => {
    const feed = createEventFeed();
    feed(st([], 0));
    const s = st(evs(3), 3);
    expect(feed(s)).toHaveLength(3);
    expect(feed(s)).toEqual([]);
  });
  it('burst of 3 then burst of 1', () => {
    const feed = createEventFeed();
    feed(st([], 0));
    expect(feed(st(evs(3), 3))).toHaveLength(3);
    const one = [called(7, 6)];
    expect(feed(st(one, 4))).toEqual(one);
  });
  it('missed burst returns what is there', () => {
    const feed = createEventFeed();
    feed(st([], 0));
    expect(feed(st(evs(2), 10))).toHaveLength(2);
  });
  it('detects a reset (sequence went backwards)', () => {
    const feed = createEventFeed();
    feed(st([], 0));
    feed(st(evs(3), 3));
    const one = [called(1)];
    expect(feed(st(one, 1))).toEqual(one);
    expect(feed(st(one, 1))).toEqual([]);
  });
});

describe('chat', () => {
  const chatMsg = (seat: number) => ({ t: 'chat' as const, seat, phraseId: 'bora' as const });
  const push = (s: AppState, n: number): AppState => {
    for (let i = 0; i < n; i++) s = reduce(s, { kind: 'server', msg: chatMsg(i), now: i });
    return s;
  };

  it('counts chatSeq, prunes to the last 30, resets', () => {
    const s = push(initialState(), 45);
    expect(s.chatSeq).toBe(45);
    expect(s.chat).toHaveLength(30);
    expect(s.chat[29]?.seat).toBe(44);
    expect(reduce(s, { kind: 'reset' }).chatSeq).toBe(0);
  });

  it('feed seeds, then returns new entries, survives reset', () => {
    const feed = createChatFeed();
    let s = push(initialState(), 2);
    expect(feed(s)).toEqual([]);
    s = push(s, 2);
    expect(feed(s).map((c) => c.seat)).toEqual([0, 1]);
    expect(feed(s)).toEqual([]);
    s = push(reduce(s, { kind: 'reset' }), 1);
    expect(feed(s)).toHaveLength(1);
  });
});
