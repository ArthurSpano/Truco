import { describe, expect, it } from 'vitest';
import { REPLACED_CLOSE_CODE, type ClientMessage, type ServerMessage } from '../shared/protocol.js';
import type { GameView, Seat } from '../shared/types.js';
import { createNet, type Connection, type Net, type Session } from './net.js';
import { LOBBY_GRACE_MS, RoomRegistry } from './rooms.js';

class FakeConn implements Connection {
  sent: ServerMessage[] = [];
  closed = false;
  closeArgs: [number | undefined, string | undefined] | null = null;
  send(msg: ServerMessage): void {
    this.sent.push(msg);
  }
  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeArgs = [code, reason];
  }
  ofType<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.ofType(t);
    const m = all[all.length - 1];
    if (!m) throw new Error(`no ${t} received`);
    return m;
  }
  clear(): void {
    this.sent = [];
  }
}

interface Client {
  conn: FakeConn;
  session: Session;
}

function setup(): { net: Net; connect: () => Client; send: (c: Client, m: ClientMessage) => void } {
  const net = createNet(new RoomRegistry({ seed: () => 1 }));
  const connect = (): Client => {
    const conn = new FakeConn();
    return { conn, session: net.connect(conn) };
  };
  const send = (c: Client, m: ClientMessage): void => {
    net.message(c.session, JSON.stringify(m));
  };
  return { net, connect, send };
}

function lobbyOf(mode: 2 | 4 | 6) {
  const env = setup();
  const clients: Client[] = [];
  const host = env.connect();
  env.send(host, { t: 'create_room', mode, name: 'p0' });
  const code = host.conn.last('joined').code;
  clients.push(host);
  for (let i = 1; i < mode; i++) {
    const c = env.connect();
    env.send(c, { t: 'join_room', code, name: `p${i}` });
    clients.push(c);
  }
  clients.forEach((c, i) => {
    env.send(c, { t: 'pick_seat', seat: i });
  });
  clients.forEach((c) => {
    env.send(c, { t: 'ready' });
  });
  return { ...env, clients, code };
}

const seatOf = (c: Client): Seat => c.conn.last('game_state').view.seat;
const handIds = (v: GameView): string[] => (v.players[v.seat]?.cards ?? []).map((card) => card.id);

describe('net: lobby', () => {
  it('create sends joined then room_state for the host', () => {
    const { connect, send } = setup();
    const c = connect();
    send(c, { t: 'create_room', mode: 2, name: 'Ana' });
    expect(c.conn.sent.map((m) => m.t)).toEqual(['joined', 'room_state']);
    const joined = c.conn.last('joined');
    expect(joined.token).not.toBe('');
    expect(joined.code).toHaveLength(4);
    const rs = c.conn.last('room_state').room;
    expect(rs.you).toBe(rs.players[0]?.id);
    expect(rs.players[0]?.host).toBe(true);
  });

  it('join works with lowercase code and updates the host', () => {
    const { connect, send } = setup();
    const a = connect();
    send(a, { t: 'create_room', mode: 2, name: 'Ana' });
    const b = connect();
    send(b, { t: 'join_room', code: a.conn.last('joined').code.toLowerCase(), name: 'Bia' });
    expect(b.conn.last('joined').t).toBe('joined');
    expect(a.conn.last('room_state').room.players).toHaveLength(2);
    expect(b.conn.last('room_state').room.you).not.toBe(a.conn.last('room_state').room.you);
  });

  it('rejects unknown rooms and double creation', () => {
    const { connect, send } = setup();
    const a = connect();
    send(a, { t: 'join_room', code: 'ZZZZ', name: 'Ana' });
    expect(a.conn.last('error').code).toBe('room_not_found');
    send(a, { t: 'create_room', mode: 2, name: 'Ana' });
    send(a, { t: 'create_room', mode: 2, name: 'Ana' });
    expect(a.conn.last('error').code).toBe('already_in_room');
  });

  it('answers garbage with bad_message and stays usable', () => {
    const { net, connect, send } = setup();
    const a = connect();
    net.message(a.session, 'not json');
    net.message(a.session, '{"t":"nope"}');
    expect(a.conn.ofType('error').map((e) => e.code)).toEqual(['bad_message', 'bad_message']);
    send(a, { t: 'create_room', mode: 2, name: 'Ana' });
    expect(a.conn.last('joined').t).toBe('joined');
  });

  it('requires a room for room and game intents', () => {
    const { connect, send } = setup();
    const a = connect();
    send(a, { t: 'pick_seat', seat: 0 });
    send(a, { t: 'ready' });
    send(a, { t: 'play_card', cardId: '4c' });
    expect(a.conn.ofType('error').map((e) => e.code)).toEqual([
      'not_in_room',
      'not_in_room',
      'not_in_room',
    ]);
  });

  it('rejoin with an unknown token is bad_token', () => {
    const { connect, send } = setup();
    const a = connect();
    send(a, { t: 'rejoin', token: 'nope' });
    expect(a.conn.last('error').code).toBe('bad_token');
  });
});

describe('net: game', () => {
  it('starts a 2-player game with one personal game_state each', () => {
    const { clients } = lobbyOf(2);
    clients.forEach((c, i) => {
      expect(c.conn.ofType('game_state')).toHaveLength(1);
      expect(seatOf(c)).toBe(i);
    });
  });

  it('never leaks hidden cards (4 players)', () => {
    const { clients, send } = lobbyOf(4);
    const hands = clients.map((c) => handIds(c.conn.last('game_state').view));
    const turn = clients[0]?.conn.last('game_state').view.turn;
    const player = clients[turn ?? 0];
    if (!player) throw new Error('no player');
    const first = handIds(player.conn.last('game_state').view)[0];
    send(player, { t: 'play_card', cardId: first as never });

    clients.forEach((c, i) => {
      for (const m of c.conn.ofType('game_state')) {
        m.view.players.forEach((p, s) => {
          if (s !== m.view.seat) expect(p.cards).toBeNull();
        });
      }
      const json = JSON.stringify(c.conn.sent);
      hands.forEach((hand, j) => {
        if (j === i) return;
        for (const id of hand) {
          if (id === first) continue;
          expect(json).not.toContain(`"${id}"`);
        }
      });
    });
  });

  it('does not put a card in a face-down event', () => {
    const { clients, send } = lobbyOf(2);
    const byTurn = (): Client => {
      const t = clients[0]?.conn.last('game_state').view.turn;
      const c = clients[t ?? 0];
      if (!c) throw new Error('x');
      return c;
    };
    const p1 = byTurn();
    send(p1, { t: 'play_card', cardId: handIds(p1.conn.last('game_state').view)[0] as never });
    const p2 = byTurn();
    send(p2, { t: 'play_card', cardId: handIds(p2.conn.last('game_state').view)[0] as never });
    // second trick: winner leads; opponent plays face down
    const lead = byTurn();
    send(lead, { t: 'play_card', cardId: handIds(lead.conn.last('game_state').view)[0] as never });
    const other = byTurn();
    const hidden = handIds(other.conn.last('game_state').view)[0] as never;
    send(other, { t: 'play_card', cardId: hidden, faceDown: true });
    for (const c of clients) {
      const played = c.conn
        .ofType('event')
        .flatMap((e) => (e.event.t === 'card_played' ? [e.event.card] : []));
      for (const card of played) if (card.faceDown) expect('card' in card).toBe(false);
      expect(played.some((p) => p.faceDown)).toBe(true);
    }
  });

  it('broadcasts events and snapshots for a legal play; illegal goes to sender only', () => {
    const { clients, send } = lobbyOf(2);
    const turn = clients[0]?.conn.last('game_state').view.turn ?? 0;
    const player = clients[turn];
    const waiting = clients[1 - turn];
    if (!player || !waiting) throw new Error('x');
    const mine = handIds(player.conn.last('game_state').view)[0] as never;
    const theirs = handIds(waiting.conn.last('game_state').view)[0] as never;
    clients.forEach((c) => {
      c.conn.clear();
    });

    send(waiting, { t: 'play_card', cardId: theirs });
    expect(waiting.conn.last('error').code).toBe('illegal_intent');
    expect(player.conn.sent).toEqual([]);
    expect(waiting.conn.ofType('game_state')).toHaveLength(0);

    send(player, { t: 'play_card', cardId: mine });
    for (const c of clients) {
      expect(c.conn.ofType('event').some((e) => e.event.t === 'card_played')).toBe(true);
      expect(c.conn.ofType('game_state')).toHaveLength(1);
    }
  });

  it('holds the seat on disconnect and restores it on rejoin', () => {
    const { net, connect, send, clients } = lobbyOf(2);
    const [a, b] = clients;
    if (!a || !b) throw new Error('x');
    const token = a.conn.last('joined').token;
    const before = handIds(a.conn.last('game_state').view);
    net.disconnect(a.session);
    const me = b.conn.last('room_state').room.players.find((p) => p.host);
    expect(me?.connected).toBe(false);

    const again = connect();
    send(again, { t: 'rejoin', token });
    expect(again.conn.sent.map((m) => m.t)).toEqual(['joined', 'room_state', 'game_state']);
    expect(handIds(again.conn.last('game_state').view)).toEqual(before);
    expect(b.conn.last('room_state').room.players.every((p) => p.connected)).toBe(true);
  });

  it('takeover: rejoin closes the old connection and the stale disconnect is ignored', () => {
    const { net, connect, send, clients } = lobbyOf(2);
    const [a, b] = clients;
    if (!a || !b) throw new Error('x');
    const token = a.conn.last('joined').token;
    const second = connect();
    send(second, { t: 'rejoin', token });
    expect(a.conn.closed).toBe(true);
    expect(a.conn.closeArgs).toEqual([REPLACED_CLOSE_CODE, 'replaced']);
    expect(second.conn.ofType('game_state')).toHaveLength(1);
    net.disconnect(a.session);
    expect(b.conn.last('room_state').room.players.every((p) => p.connected)).toBe(true);
  });

  it('ignores late messages from a disconnected session', () => {
    const { net, send, clients } = lobbyOf(2);
    const [a] = clients;
    if (!a) throw new Error('x');
    net.disconnect(a.session);
    a.conn.clear();
    send(a, { t: 'ready' });
    expect(a.conn.last('error').code).toBe('not_in_room');
  });

  it('tick tells remaining lobby players about swept ones', () => {
    let clock = 0;
    const net = createNet(new RoomRegistry({ seed: () => 1 }), () => clock);
    const mk = (): Client => {
      const conn = new FakeConn();
      return { conn, session: net.connect(conn) };
    };
    const a = mk();
    const b = mk();
    net.message(a.session, JSON.stringify({ t: 'create_room', mode: 2, name: 'Ana' }));
    const code = a.conn.last('joined').code;
    net.message(b.session, JSON.stringify({ t: 'join_room', code, name: 'Beto' }));
    clock = 1_000;
    net.disconnect(a.session);
    b.conn.clear();
    net.tick(1_000 + LOBBY_GRACE_MS + 1);
    expect(b.conn.last('room_state').room.players.map((p) => p.name)).toEqual(['Beto']);
  });

  it('chat needs a seat and then broadcasts', () => {
    const env = setup();
    const a = env.connect();
    env.send(a, { t: 'create_room', mode: 2, name: 'Ana' });
    env.send(a, { t: 'chat_quick', phraseId: 'bora' });
    expect(a.conn.last('error').code).toBe('need_seat');
    env.send(a, { t: 'pick_seat', seat: 1 });
    env.send(a, { t: 'chat_quick', phraseId: 'bora' });
    expect(a.conn.last('chat')).toEqual({ t: 'chat', seat: 1, phraseId: 'bora' });
  });
});
