import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLACED_CLOSE_CODE } from '../../shared/protocol.js';
import type { ServerMessage } from '../../shared/protocol.js';
import type { ConnStatus } from '../state/reducer.js';
import { GameSocket } from './socket.js';
import type { TokenStore } from './tokenStore.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function memTokens(initial: string | null): TokenStore & { value: string | null } {
  const s = {
    value: initial,
    get: () => s.value,
    set: (t: string) => void (s.value = t),
    clear: () => void (s.value = null),
  };
  return s;
}

function setup(token: string | null, backoffMs: (n: number) => number = () => 0) {
  const tokens = memTokens(token);
  const messages: ServerMessage[] = [];
  const statuses: ConnStatus[] = [];
  const gs = new GameSocket({
    url: 'ws://x',
    tokens,
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    backoffMs,
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
  });
  return { tokens, messages, statuses, gs };
}

const last = (): FakeWebSocket => {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error('no socket');
  return ws;
};
const sentJson = (ws: FakeWebSocket): unknown[] => ws.sent.map((s): unknown => JSON.parse(s));

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GameSocket', () => {
  it('sends rejoin first when a token exists', () => {
    const { gs, statuses } = setup('tok');
    gs.connect();
    expect(statuses).toEqual(['connecting']);
    last().open();
    expect(statuses).toEqual(['connecting', 'open']);
    expect(sentJson(last())).toEqual([{ t: 'rejoin', token: 'tok' }]);
  });

  it('does not send rejoin without a token', () => {
    const { gs } = setup(null);
    gs.connect();
    last().open();
    expect(last().sent).toEqual([]);
  });

  it('stores the token after joined and forwards the message', () => {
    const { gs, tokens, messages } = setup(null);
    gs.connect();
    last().open();
    last().receive(JSON.stringify({ t: 'joined', token: 'new', code: 'BAR7' }));
    expect(tokens.value).toBe('new');
    expect(messages).toHaveLength(1);
  });

  it('clears the token on bad_token', () => {
    const { gs, tokens } = setup('old');
    gs.connect();
    last().open();
    last().receive(JSON.stringify({ t: 'error', code: 'bad_token', msg: 'x' }));
    expect(tokens.value).toBeNull();
  });

  it('reconnects after an unexpected close and re-sends rejoin', () => {
    const { gs, statuses } = setup('tok');
    gs.connect();
    last().open();
    last().drop();
    expect(statuses.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(0);
    expect(FakeWebSocket.instances).toHaveLength(2);
    last().open();
    expect(sentJson(last())[0]).toEqual({ t: 'rejoin', token: 'tok' });
  });

  it('backs off using the injected function and resets after open', () => {
    const calls: number[] = [];
    const { gs } = setup('tok', (n) => {
      calls.push(n);
      return 100;
    });
    gs.connect();
    last().drop();
    vi.advanceTimersByTime(99);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    last().drop();
    vi.advanceTimersByTime(100);
    last().open();
    last().drop();
    expect(calls).toEqual([0, 1, 0]);
  });

  it('close() prevents reconnect and sets closed', () => {
    const { gs, statuses } = setup('tok');
    gs.connect();
    last().open();
    gs.close();
    last().drop(1000);
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');
  });

  it('close() closes the socket and detaches handlers', () => {
    const { gs } = setup('tok');
    gs.connect();
    const ws = last();
    ws.open();
    gs.close();
    expect(ws.readyState).toBe(3);
    expect(ws.onclose).toBeNull();
    expect(ws.onmessage).toBeNull();
  });

  it('connect() twice leaves exactly one live socket', () => {
    const { gs } = setup('tok');
    gs.connect();
    gs.connect();
    const live = FakeWebSocket.instances.filter((w) => w.readyState !== 3);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(live).toEqual([last()]);
  });

  it('connect() during a pending retry creates no extra socket', () => {
    const { gs } = setup('tok', () => 100);
    gs.connect();
    last().drop();
    gs.connect();
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('default backoff doubles from 500ms and caps at 5s', () => {
    const gs2 = new GameSocket({
      url: 'ws://x',
      tokens: memTokens(null),
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      onMessage: () => undefined,
      onStatus: () => undefined,
    });
    gs2.connect();
    for (const delay of [500, 1000, 2000, 4000, 5000, 5000]) {
      const n = FakeWebSocket.instances.length;
      last().drop();
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(n);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(n + 1);
    }
  });

  it('close() cancels a pending retry', () => {
    const { gs } = setup('tok', () => 100);
    gs.connect();
    last().drop();
    gs.close();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('does not reconnect after the replaced close code', () => {
    const { gs, statuses } = setup('tok');
    gs.connect();
    last().open();
    last().drop(REPLACED_CLOSE_CODE);
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');
  });

  it('reports onReplaced only for the replaced close code', () => {
    const onReplaced = vi.fn();
    const gs = new GameSocket({
      url: 'ws://x',
      tokens: memTokens('tok'),
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      backoffMs: () => 0,
      onMessage: () => undefined,
      onStatus: () => undefined,
      onReplaced,
    });
    gs.connect();
    last().open();
    last().drop(1006);
    expect(onReplaced).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    last().open();
    last().drop(REPLACED_CLOSE_CODE);
    expect(onReplaced).toHaveBeenCalledTimes(1);
  });

  it('send before open does not throw and drops the message', () => {
    const { gs } = setup(null);
    expect(() => {
      gs.send({ t: 'ready' });
    }).not.toThrow();
    gs.connect();
    expect(() => {
      gs.send({ t: 'ready' });
    }).not.toThrow();
    expect(last().sent).toEqual([]);
    last().open();
    gs.send({ t: 'ready' });
    expect(last().sent).toEqual([JSON.stringify({ t: 'ready' })]);
  });

  it('ignores invalid JSON and non-string data', () => {
    const { gs, messages } = setup(null);
    gs.connect();
    last().open();
    last().receive('{nope');
    last().receive(new ArrayBuffer(2));
    last().receive('42');
    expect(messages).toEqual([]);
  });
});
