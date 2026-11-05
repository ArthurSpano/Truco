import { randomUUID } from 'node:crypto';
import { applyIntent, createGame, viewFor, type GameState } from '../engine/game.js';
import type { ErrorCode, PlayerInfo, RoomState } from '../shared/protocol.js';
import type { GameEvent, GameIntent, GameMode, GameView, Seat } from '../shared/types.js';

export type RoomResult<T = undefined> =
  { ok: true; value: T } | { ok: false; code: ErrorCode; msg: string };

interface Member {
  id: string;
  token: string;
  name: string;
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
}

const OK: RoomResult = { ok: true, value: undefined };

function fail(code: ErrorCode, msg: string): { ok: false; code: ErrorCode; msg: string } {
  return { ok: false, code, msg };
}

/**
 * One table: lobby (players, seats, ready) and, once everyone is ready, the
 * game. The engine state stays private; callers only get personalized views.
 */
export class Room {
  lastActivity = Date.now();
  private readonly members: Member[] = [];
  private game: GameState | null = null;
  private nextId = 1;
  private state: 'lobby' | 'playing' | 'finished' = 'lobby';

  constructor(
    readonly code: string,
    readonly mode: GameMode,
    private readonly seed?: number,
  ) {}

  get status(): 'lobby' | 'playing' | 'finished' {
    return this.state;
  }

  addPlayer(name: string, now: number): RoomResult<{ id: string; token: string }> {
    if (this.state !== 'lobby') return fail('room_started', 'A partida já começou.');
    if (this.members.length >= this.mode) return fail('room_full', 'A mesa está cheia.');
    const member: Member = {
      id: `p${this.nextId++}`,
      token: randomUUID(),
      name,
      seat: null,
      ready: false,
      connected: true,
      disconnectedAt: null,
    };
    this.members.push(member);
    this.touch(now);
    return { ok: true, value: { id: member.id, token: member.token } };
  }

  playerByToken(token: string): string | null {
    return this.members.find((m) => m.token === token)?.id ?? null;
  }

  pickSeat(id: string, seat: Seat): RoomResult {
    const me = this.find(id);
    if (!me) return fail('not_in_room', 'Jogador desconhecido.');
    if (this.state !== 'lobby') return fail('not_in_lobby', 'A partida já começou.');
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.mode) {
      return fail('bad_seat', 'Lugar inválido.');
    }
    if (this.members.some((m) => m.seat === seat && m.id !== id)) {
      return fail('seat_taken', 'Lugar ocupado.');
    }
    me.seat = seat;
    me.ready = false;
    this.touch();
    return OK;
  }

  toggleReady(id: string): RoomResult {
    const me = this.find(id);
    if (!me) return fail('not_in_room', 'Jogador desconhecido.');
    if (this.state !== 'lobby') return fail('not_in_lobby', 'A partida já começou.');
    if (me.seat === null) return fail('need_seat', 'Escolha um lugar primeiro.');
    me.ready = !me.ready;
    this.touch();
    const seated = this.members.filter((m) => m.seat !== null);
    if (seated.length === this.mode && seated.every((m) => m.ready && m.connected)) {
      this.game = createGame(this.mode, this.seed);
      this.state = 'playing';
    }
    return OK;
  }

  setConnected(id: string, connected: boolean, now: number): void {
    const me = this.find(id);
    if (!me) return;
    me.connected = connected;
    me.disconnectedAt = connected ? null : now;
    if (!connected && this.state === 'lobby') me.ready = false;
    this.touch(now);
  }

  applyGameIntent(id: string, intent: GameIntent): RoomResult<GameEvent[]> {
    if (this.state !== 'playing' || !this.game)
      return fail('not_playing', 'Não há jogo em andamento.');
    const seat = this.seatOf(id);
    if (seat === null) return fail('need_seat', 'Você não tem lugar na mesa.');
    const result = applyIntent(this.game, seat, intent);
    if (!result.ok) return fail('illegal_intent', result.error);
    this.game = result.state;
    if (result.state.winner !== null) this.state = 'finished';
    this.touch();
    return { ok: true, value: result.events };
  }

  seatOf(id: string): Seat | null {
    return this.find(id)?.seat ?? null;
  }

  roomStateFor(id: string): RoomState {
    return {
      code: this.code,
      mode: this.mode,
      status: this.state,
      you: id,
      players: this.members.map((m, i): PlayerInfo => ({
        id: m.id,
        name: m.name,
        seat: m.seat,
        ready: m.ready,
        connected: m.connected,
        host: i === 0,
      })),
    };
  }

  gameViewFor(id: string): GameView | null {
    const seat = this.seatOf(id);
    if (!this.game || seat === null) return null;
    return viewFor(this.game, seat);
  }

  playerIds(): string[] {
    return this.members.map((m) => m.id);
  }

  hasConnectedPlayer(): boolean {
    return this.members.some((m) => m.connected);
  }

  /** Lobby players that have been disconnected for longer than `graceMs`. */
  staleLobbyPlayers(now: number, graceMs: number): string[] {
    if (this.state !== 'lobby') return [];
    return this.members
      .filter((m) => !m.connected && m.disconnectedAt !== null && now - m.disconnectedAt > graceMs)
      .map((m) => m.id);
  }

  /** Lobby only: frees the player's seat and place. */
  removePlayer(id: string): void {
    if (this.state !== 'lobby') return;
    const i = this.members.findIndex((m) => m.id === id);
    if (i >= 0) this.members.splice(i, 1);
    this.touch();
  }

  private find(id: string): Member | undefined {
    return this.members.find((m) => m.id === id);
  }

  private touch(now: number = Date.now()): void {
    this.lastActivity = now;
  }
}
