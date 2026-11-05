import { randomInt } from 'node:crypto';
import { isGameMode } from '../engine/seating.js';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/protocol.js';
import type { GameMode } from '../shared/types.js';
import { Room } from './room.js';

export const LOBBY_GRACE_MS = 30_000;
export const ROOM_IDLE_MS = 600_000;

export interface RegistryOptions {
  randomInt?: (max: number) => number;
  seed?: () => number | undefined;
}

/** In-memory registry of rooms, keyed by their 4-letter code. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly randomInt: (max: number) => number;
  private readonly seed: () => number | undefined;

  constructor(opts: RegistryOptions = {}) {
    this.randomInt = opts.randomInt ?? ((max) => randomInt(max));
    this.seed = opts.seed ?? (() => undefined);
  }

  get size(): number {
    return this.rooms.size;
  }

  createRoom(mode: GameMode): Room {
    if (!isGameMode(mode)) throw new Error(`invalid mode: ${String(mode)}`);
    let code = this.randomCode();
    while (this.rooms.has(code)) code = this.randomCode();
    const room = new Room(code, mode, this.seed());
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  findByToken(token: string): { room: Room; playerId: string } | null {
    for (const room of this.rooms.values()) {
      const playerId = room.playerByToken(token);
      if (playerId !== null) return { room, playerId };
    }
    return null;
  }

  /** Drops stale lobby players, then idle rooms nobody is connected to. */
  sweep(now: number): string[] {
    const deleted: string[] = [];
    for (const [code, room] of this.rooms) {
      // Evicting a stale player is housekeeping, not activity: keep the idle clock.
      const lastActivity = room.lastActivity;
      for (const id of room.staleLobbyPlayers(now, LOBBY_GRACE_MS)) room.removePlayer(id);
      room.lastActivity = lastActivity;
      if (!room.hasConnectedPlayer() && now - room.lastActivity > ROOM_IDLE_MS) {
        this.rooms.delete(code);
        deleted.push(code);
      }
    }
    return deleted;
  }

  private randomCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET.charAt(this.randomInt(ROOM_CODE_ALPHABET.length));
    }
    return code;
  }
}
