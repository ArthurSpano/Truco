import type { PlayerInfo, RoomState } from '../../shared/protocol.js';

export interface SeatSlot {
  seat: number;
  team: 0 | 1;
  player: PlayerInfo | null;
  mine: boolean;
}

/** One slot per seat, in seat order. */
export function seatSlots(room: RoomState): SeatSlot[] {
  return Array.from({ length: room.mode }, (_, seat) => {
    const player = room.players.find((x) => x.seat === seat) ?? null;
    return {
      seat,
      // Rule: teams are fixed by seat parity (engine's teamOf is not importable here).
      team: (seat % 2) as 0 | 1,
      player,
      mine: player !== null && player.id === room.you,
    };
  });
}

export function unseated(room: RoomState): PlayerInfo[] {
  return room.players.filter((x) => x.seat === null);
}

/** Ready is only meaningful once you hold a seat. */
export function canReady(room: RoomState): boolean {
  return room.players.some((x) => x.id === room.you && x.seat !== null);
}

export function statusLine(room: RoomState): string {
  const seated = room.players.filter((x) => x.seat !== null);
  if (seated.length === 0) return 'Esperando jogadores…';
  const ready = seated.filter((x) => x.ready).length;
  return `${ready} de ${room.mode} prontos`;
}
