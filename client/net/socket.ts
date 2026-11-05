import { REPLACED_CLOSE_CODE } from '../../shared/protocol.js';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.js';
import type { ConnStatus } from '../state/reducer.js';
import type { TokenStore } from './tokenStore.js';

export interface SocketOptions {
  url: string;
  tokens: TokenStore;
  WebSocketImpl?: typeof WebSocket;
  backoffMs?: (attempt: number) => number;
  onMessage(msg: ServerMessage): void;
  onStatus(status: ConnStatus): void;
  /** Called when the server closed this socket because another tab/device took the session. */
  onReplaced?(): void;
}

const OPEN = 1;

export function defaultBackoff(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 5000);
}

function parse(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const v: unknown = JSON.parse(data);
    if (typeof v === 'object' && v !== null && typeof (v as { t?: unknown }).t === 'string') {
      return v as ServerMessage;
    }
  } catch {
    /* malformed: ignore */
  }
  return null;
}

/** WebSocket wrapper: rejoins with the stored token and reconnects with backoff. */
export class GameSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly opts: SocketOptions) {}

  /** Idempotent: drops any pending retry and existing socket, then opens one fresh socket. */
  connect(): void {
    this.stopped = false;
    this.teardown();
    this.attempt = 0;
    this.open('connecting');
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState !== OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.stopped = true;
    this.teardown();
    this.opts.onStatus('closed');
  }

  private teardown(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.close();
    }
  }

  private open(status: ConnStatus): void {
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    this.opts.onStatus(status);
    const ws = new Impl(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.opts.onStatus('open');
      const token = this.opts.tokens.get();
      if (token) this.send({ t: 'rejoin', token });
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      const msg = parse(e.data);
      if (!msg) return;
      if (msg.t === 'joined') this.opts.tokens.set(msg.token);
      else if (msg.t === 'error' && msg.code === 'bad_token') this.opts.tokens.clear();
      this.opts.onMessage(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || e.code === REPLACED_CLOSE_CODE) {
        this.stopped = true;
        if (e.code === REPLACED_CLOSE_CODE) this.opts.onReplaced?.();
        this.opts.onStatus('closed');
        return;
      }
      this.opts.onStatus('reconnecting');
      const delay = (this.opts.backoffMs ?? defaultBackoff)(this.attempt++);
      this.timer = setTimeout(() => {
        this.timer = null;
        if (!this.stopped) this.open('reconnecting');
      }, delay);
    };
  }
}
