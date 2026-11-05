import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, type ClientMessage, type ServerMessage } from '../shared/protocol.js';
import { RoomRegistry } from './rooms.js';
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
    expect((await a.next('error')).code).not.toBeUndefined();
    const codes: string[] = [];
    await sleep(100);
    for (let i = 0; i < 6; i++) a.send({ t: 'ready' });
    await sleep(100);
    // drain what remains
    for (;;) {
      const r = await Promise.race([a.next('error'), sleep(50).then(() => null)]);
      if (!r) break;
      codes.push(r.code);
    }
    expect(codes).toContain('rate_limited');
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
