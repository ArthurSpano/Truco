import http from 'node:http';
import nodeNet, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  MAX_MESSAGE_BYTES,
  REPLACED_CLOSE_CODE,
  type ClientMessage,
  type ServerMessage,
} from '../shared/protocol.js';
import { RoomRegistry } from './rooms.js';
import { createNet } from './net.js';
import { attachWebSocket, type WsOptions } from './ws.js';

interface TestClient {
  ws: WebSocket;
  send(m: ClientMessage): void;
  next<T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>>;
  closed: Promise<number>;
}

let server: http.Server;
let handle: ReturnType<typeof attachWebSocket>;
let port: number;
const clients: WebSocket[] = [];

async function start(opts: WsOptions = {}): Promise<void> {
  server = http.createServer();
  handle = attachWebSocket(server, { registry: new RoomRegistry({ seed: () => 1 }), ...opts });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
}

function open(
  path = '/ws',
  wsOpts: ConstructorParameters<typeof WebSocket>[2] = {},
): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, wsOpts);
  clients.push(ws);
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    inbox.push(JSON.parse((data as Buffer).toString('utf8')) as ServerMessage);
    waiters.splice(0).forEach((w) => {
      w();
    });
  });
  const closed = new Promise<number>((r) =>
    ws.on('close', (code) => {
      r(code);
    }),
  );
  const client: TestClient = {
    ws,
    closed,
    send: (m) => {
      ws.send(JSON.stringify(m));
    },
    next: async <T extends ServerMessage['t']>(t: T) => {
      for (;;) {
        const i = inbox.findIndex((m) => m.t === t);
        if (i >= 0) return inbox.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>;
        await new Promise<void>((r) => waiters.push(r));
      }
    },
  };
  return new Promise((resolve, reject) => {
    ws.once('open', () => {
      resolve(client);
    });
    ws.once('error', reject);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  await handle.close();
  if (server.listening)
    await new Promise<void>((r) =>
      server.close(() => {
        r();
      }),
    );
});

describe('attachWebSocket', () => {
  it('creates a room and plays a 2-player lobby through to game_state', async () => {
    await start();
    const a = await open();
    a.send({ t: 'create_room', mode: 2, name: 'A' });
    const joined = await a.next('joined');
    await a.next('room_state');
    const b = await open();
    b.send({ t: 'join_room', code: joined.code, name: 'B' });
    await b.next('joined');
    a.send({ t: 'pick_seat', seat: 0 });
    b.send({ t: 'pick_seat', seat: 1 });
    a.send({ t: 'ready' });
    b.send({ t: 'ready' });
    await a.next('game_state');
    await b.next('game_state');
  });

  it('rejects upgrades on other paths', async () => {
    await start();
    await expect(open('/other')).rejects.toThrow();
  });

  it('answers bad frames with bad_message and stays open', async () => {
    await start();
    const a = await open();
    a.ws.send('not json');
    expect((await a.next('error')).code).toBe('bad_message');
    a.ws.send(Buffer.from([1, 2, 3]));
    expect((await a.next('error')).code).toBe('bad_message');
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('closes with 1009 on oversized frames and keeps serving', async () => {
    await start();
    const a = await open();
    a.ws.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(await a.closed).toBe(1009);
    const b = await open();
    b.send({ t: 'create_room', mode: 2, name: 'B' });
    await b.next('joined');
  });

  it('rate limits floods', async () => {
    await start({ burst: 3, perSecond: 0.001 });
    const a = await open();
    for (let i = 0; i < 6; i++) a.send({ t: 'ready' });
    const codes: string[] = [];
    for (let i = 0; i < 6; i++) codes.push((await a.next('error')).code);
    expect(codes).toContain('rate_limited');
  });

  it('survives a malformed upgrade request target', async () => {
    await start();
    const raw = nodeNet.connect(port, '127.0.0.1');
    await new Promise<void>((r) =>
      raw.once('connect', () => {
        r();
      }),
    );
    raw.on('error', () => {});
    raw.write(
      'GET http://[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
    );
    await sleep(100);
    raw.destroy();
    const a = await open();
    a.send({ t: 'create_room', mode: 2, name: 'A' });
    await a.next('joined');
  });

  it('leaves non-/ws upgrades to other listeners', async () => {
    await start();
    server.on('upgrade', (req, socket) => {
      if (req.url === '/other') socket.end('HTTP/1.1 418 Teapot\r\nConnection: close\r\n\r\n');
    });
    await expect(open('/other')).rejects.toThrow(/418/);
  });

  it('survives a client reset on an upgrade nobody handles', async () => {
    await start();
    const uncaught: Error[] = [];
    const onUncaught = (e: Error): void => {
      uncaught.push(e);
    };
    process.on('uncaughtException', onUncaught);
    try {
      const raw = nodeNet.connect(port, '127.0.0.1');
      raw.on('error', () => {});
      await new Promise<void>((r) =>
        raw.once('connect', () => {
          r();
        }),
      );
      raw.write(
        'GET /other HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
      );
      raw.resetAndDestroy();
      await sleep(100);
      const a = await open();
      a.send({ t: 'create_room', mode: 2, name: 'A' });
      await a.next('joined');
      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', onUncaught);
    }
  });

  it('turns a throwing handler into an internal error without dropping anyone', async () => {
    const real = createNet(new RoomRegistry({ seed: () => 1 }));
    const net = {
      ...real,
      message: (s: Parameters<typeof real.message>[0], raw: string) => {
        if (raw.includes('explode')) throw new Error('invariant');
        real.message(s, raw);
      },
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await start({ net });
    const a = await open();
    const b = await open();
    a.ws.send('explode');
    expect((await a.next('error')).code).toBe('internal');
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
    b.send({ t: 'create_room', mode: 2, name: 'B' });
    await b.next('joined');
    expect(spy.mock.calls.flat().join(' ')).not.toContain('explode');
    spy.mockRestore();
  });

  it('keeps ticking when the sweep throws', async () => {
    const real = createNet(new RoomRegistry({ seed: () => 1 }));
    let ticks = 0;
    const net = {
      ...real,
      tick: () => {
        ticks++;
        throw new Error('boom');
      },
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await start({ net, sweepMs: 20 });
    await sleep(100);
    expect(ticks).toBeGreaterThan(1);
    spy.mockRestore();
  });

  it('closes a replaced socket with 4001', async () => {
    await start();
    const a = await open();
    a.send({ t: 'create_room', mode: 2, name: 'A' });
    const { token } = await a.next('joined');
    const a2 = await open();
    a2.send({ t: 'rejoin', token });
    await a2.next('joined');
    expect(await a.closed).toBe(REPLACED_CLOSE_CODE);
  });

  it('terminates clients that stop answering pings', async () => {
    await start({ heartbeatMs: 50 });
    const dead = await open('/ws', { autoPong: false });
    dead.ws.pong = () => {};
    const live = await open();
    await Promise.race([
      dead.closed,
      sleep(300).then(() => Promise.reject(new Error('not dropped'))),
    ]);
    expect(live.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('keeps a responsive client connected', async () => {
    await start({ heartbeatMs: 50 });
    const live = await open();
    await sleep(300);
    expect(live.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('restores a seat over a new socket with rejoin', async () => {
    await start();
    const a = await open();
    a.send({ t: 'create_room', mode: 2, name: 'A' });
    const { token, code } = await a.next('joined');
    const b = await open();
    b.send({ t: 'join_room', code, name: 'B' });
    await b.next('joined');
    a.ws.terminate();
    await a.closed;
    const a2 = await open();
    a2.send({ t: 'rejoin', token });
    expect((await a2.next('joined')).code).toBe(code);
  });

  it('close() resolves and closes sockets', async () => {
    await start();
    const a = await open();
    await handle.close();
    expect(await a.closed).toBeTypeOf('number');
  });
});
