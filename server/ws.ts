import type http from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  MAX_MESSAGE_BYTES,
  type ServerMessage,
} from '../shared/protocol.js';
import { createNet, type Net, type Session } from './net.js';
import { RateLimiter, DEFAULT_BURST, DEFAULT_PER_SECOND } from './rateLimit.js';
import { RoomRegistry } from './rooms.js';

const WS_PATH = '/ws';
const DEFAULT_SWEEP_MS = 5_000;

export interface WsOptions {
  heartbeatMs?: number;
  sweepMs?: number;
  registry?: RoomRegistry;
  /** Test seam: replaces the protocol handler built from `registry`. */
  net?: Net;
  burst?: number;
  perSecond?: number;
}

/**
 * Attach the game WebSocket to an HTTP server. Only `/ws` upgrades are
 * handled, so other upgrade listeners (Vite HMR in dev) keep working.
 */
export function attachWebSocket(
  httpServer: http.Server,
  opts: WsOptions = {},
): { close(): Promise<void> } {
  const registry = opts.registry ?? new RoomRegistry();
  const net = opts.net ?? createNet(registry);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  const guarded = (fn: () => void, session: Session | null): void => {
    try {
      fn();
    } catch (err) {
      // Name and message only: never the payload or any game state.
      const e = err instanceof Error ? err : null;
      console.error(`internal error: ${e ? `${e.name}: ${e.message}` : 'unknown'}`);
      session?.conn.send({ t: 'error', code: 'internal', msg: 'Deu ruim na mesa. Tente de novo.' });
    }
  };

  const onUpgrade = (
    req: http.IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ): void => {
    // No URL parsing: a malformed request target must never throw here.
    const path = (req.url ?? '').split('?')[0];
    // Node removes its own socket 'error' listener before emitting 'upgrade'; without
    // one, a client RST would be an unhandled ECONNRESET that kills the process.
    const onErr = (): void => {
      socket.destroy();
    };
    socket.on('error', onErr);
    if (path !== WS_PATH) {
      // Leave it to other listeners (Vite HMR); if none exists, don't leave it hanging.
      if (httpServer.listenerCount('upgrade') <= 1) {
        socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      }
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      socket.off('error', onErr);
      wss.emit('connection', ws, req);
    });
  };
  httpServer.on('upgrade', onUpgrade);

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const limiter = new RateLimiter({
      burst: opts.burst ?? DEFAULT_BURST,
      perSecond: opts.perSecond ?? DEFAULT_PER_SECOND,
    });
    const send = (msg: ServerMessage): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const session: Session = net.connect({
      send,
      close: (code, reason) => {
        ws.close(code, reason);
      },
    });
    let disconnected = false;
    const disconnect = (): void => {
      if (disconnected) return;
      disconnected = true;
      net.disconnect(session);
    };

    ws.on('message', (data, isBinary) => {
      // performance.now() is monotonic, unlike Date.now().
      if (!limiter.allow(performance.now())) {
        send({ t: 'error', code: 'rate_limited', msg: 'Calma aí, muita mensagem.' });
        return;
      }
      if (isBinary) {
        send({ t: 'error', code: 'bad_message', msg: 'Só texto, parceiro.' });
        return;
      }
      guarded(() => {
        net.message(session, rawToString(data));
      }, session);
    });
    ws.on('close', disconnect);
    // ws closes the socket itself on protocol errors (e.g. 1009); let that flush.
    ws.on('error', disconnect);
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, opts.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);

  const sweep = setInterval(() => {
    guarded(() => {
      net.tick(Date.now());
    }, null);
  }, opts.sweepMs ?? DEFAULT_SWEEP_MS);

  return {
    close: () => {
      clearInterval(heartbeat);
      clearInterval(sweep);
      httpServer.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      return new Promise<void>((resolve) => {
        wss.close(() => {
          resolve();
        });
      });
    },
  };
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
