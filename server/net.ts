import {
  REPLACED_CLOSE_CODE,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../shared/protocol.js';
import type { GameIntent } from '../shared/types.js';
import type { Room, RoomResult } from './room.js';
import type { RoomRegistry } from './rooms.js';
import { parseClientMessage } from './validate.js';

/** The transport the protocol handler talks to (a WebSocket in production). */
export interface Connection {
  send(msg: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

export interface Session {
  readonly conn: Connection;
  binding: { room: Room; playerId: string } | null;
}

export interface Net {
  connect(conn: Connection): Session;
  message(session: Session, raw: string): void;
  disconnect(session: Session): void;
  /** Periodic housekeeping: sweeps the registry and tells affected lobbies. */
  tick(now: number): void;
}

type Binding = NonNullable<Session['binding']>;

/**
 * Protocol handler: validates intents, applies them to the room and sends
 * each connected player their own snapshot. It never logs message payloads.
 */
export function createNet(registry: RoomRegistry, now: () => number = Date.now): Net {
  /** Live session per player, per room: broadcasts only reach these. */
  const live = new WeakMap<Room, Map<string, Session>>();

  const sessionsOf = (room: Room): Map<string, Session> => {
    let m = live.get(room);
    if (!m) {
      m = new Map();
      live.set(room, m);
    }
    return m;
  };

  const error = (s: Session, code: ErrorCode, msg: string): void => {
    s.conn.send({ t: 'error', code, msg });
  };

  const bind = (s: Session, room: Room, playerId: string): void => {
    s.binding = { room, playerId };
    sessionsOf(room).set(playerId, s);
  };

  const broadcastRoom = (room: Room, except?: Session): void => {
    for (const [id, s] of sessionsOf(room)) {
      if (s !== except) s.conn.send({ t: 'room_state', room: room.roomStateFor(id) });
    }
  };

  const sendGame = (room: Room, id: string, s: Session): void => {
    const view = room.gameViewFor(id);
    if (view) s.conn.send({ t: 'game_state', view });
  };

  const broadcastGame = (room: Room): void => {
    for (const [id, s] of sessionsOf(room)) sendGame(room, id, s);
  };

  const gameIntent = (s: Session, b: Binding, intent: GameIntent): void => {
    const before = b.room.status;
    const r = b.room.applyGameIntent(b.playerId, intent);
    if (!r.ok) {
      error(s, r.code, r.msg);
      return;
    }
    for (const event of r.value) {
      for (const peer of sessionsOf(b.room).values()) peer.conn.send({ t: 'event', event });
    }
    broadcastGame(b.room);
    if (b.room.status !== before) broadcastRoom(b.room);
  };

  const lobbyStep = (s: Session, b: Binding, result: RoomResult, wasPlaying: boolean): void => {
    if (!result.ok) {
      error(s, result.code, result.msg);
      return;
    }
    broadcastRoom(b.room);
    if (!wasPlaying && b.room.status === 'playing') broadcastGame(b.room);
  };

  const handle = (s: Session, msg: ClientMessage): void => {
    const b = s.binding;
    switch (msg.t) {
      case 'create_room': {
        if (b) {
          error(s, 'already_in_room', 'Você já está em uma mesa.');
          return;
        }
        const room = registry.createRoom(msg.mode);
        const added = room.addPlayer(msg.name, now());
        if (!added.ok) {
          error(s, added.code, added.msg);
          return;
        }
        bind(s, room, added.value.id);
        s.conn.send({ t: 'joined', token: added.value.token, code: room.code });
        s.conn.send({ t: 'room_state', room: room.roomStateFor(added.value.id) });
        return;
      }
      case 'join_room': {
        if (b) {
          error(s, 'already_in_room', 'Você já está em uma mesa.');
          return;
        }
        const room = registry.getRoom(msg.code);
        if (!room) {
          error(s, 'room_not_found', 'Mesa não encontrada.');
          return;
        }
        const added = room.addPlayer(msg.name, now());
        if (!added.ok) {
          error(s, added.code, added.msg);
          return;
        }
        bind(s, room, added.value.id);
        s.conn.send({ t: 'joined', token: added.value.token, code: room.code });
        broadcastRoom(room);
        return;
      }
      case 'rejoin': {
        if (b) {
          error(s, 'already_in_room', 'Você já está em uma mesa.');
          return;
        }
        const found = registry.findByToken(msg.token);
        if (!found) {
          error(s, 'bad_token', 'Sessão desconhecida.');
          return;
        }
        const { room, playerId } = found;
        const old = sessionsOf(room).get(playerId);
        if (old && old !== s) {
          old.binding = null;
          old.conn.close(REPLACED_CLOSE_CODE, 'replaced');
        }
        bind(s, room, playerId);
        room.setConnected(playerId, true, now());
        s.conn.send({ t: 'joined', token: msg.token, code: room.code });
        s.conn.send({ t: 'room_state', room: room.roomStateFor(playerId) });
        sendGame(room, playerId, s);
        broadcastRoom(room, s);
        return;
      }
      case 'pick_seat':
        if (!b) {
          error(s, 'not_in_room', 'Entre em uma mesa primeiro.');
          return;
        }
        {
          lobbyStep(s, b, b.room.pickSeat(b.playerId, msg.seat), false);
          return;
        }
      case 'ready': {
        if (!b) {
          error(s, 'not_in_room', 'Entre em uma mesa primeiro.');
          return;
        }
        const wasPlaying = b.room.status !== 'lobby';
        lobbyStep(s, b, b.room.toggleReady(b.playerId), wasPlaying);
        return;
      }
      case 'chat_quick': {
        if (!b) {
          error(s, 'not_in_room', 'Entre em uma mesa primeiro.');
          return;
        }
        const seat = b.room.seatOf(b.playerId);
        if (seat === null) {
          error(s, 'need_seat', 'Escolha um lugar primeiro.');
          return;
        }
        for (const peer of sessionsOf(b.room).values()) {
          peer.conn.send({ t: 'chat', seat, phraseId: msg.phraseId });
        }
        return;
      }
      default:
        if (!b) {
          error(s, 'not_in_room', 'Entre em uma mesa primeiro.');
          return;
        }
        {
          gameIntent(s, b, msg);
          return;
        }
    }
  };

  return {
    connect: (conn) => ({ conn, binding: null }),
    message(session, raw) {
      const parsed = parseClientMessage(raw);
      if (!parsed.ok) {
        error(session, 'bad_message', parsed.msg);
        return;
      }
      handle(session, parsed.msg);
    },
    disconnect(session) {
      const b = session.binding;
      if (!b || sessionsOf(b.room).get(b.playerId) !== session) return;
      sessionsOf(b.room).delete(b.playerId);
      session.binding = null;
      b.room.setConnected(b.playerId, false, now());
      broadcastRoom(b.room);
    },
    tick(at) {
      for (const room of registry.sweep(at).changed) broadcastRoom(room);
    },
  };
}
