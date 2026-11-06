import type { RoomState } from '../../shared/protocol.js';
import type { Card, GameActions, GameView, Rank, TableCard } from '../../shared/types.js';
import { anchorFor, isPartner, relativeIndex, type Anchor } from './layout.js';

export type Pip = 'won' | 'lost' | 'tied' | 'pending';

export interface SeatModel {
  seat: number;
  anchor: Anchor;
  name: string;
  team: 0 | 1;
  mine: boolean;
  partner: boolean;
  connected: boolean;
  active: boolean;
  cardCount: number;
  cards: Card[] | null;
}

export interface TableModel {
  seats: SeatModel[];
  /** Viewer's team score first (Nós x Eles), whatever the seat parity. */
  us: number;
  them: number;
  value: number;
  vira: Card;
  manilha: Rank;
  pips: Pip[];
  trick: { anchor: Anchor; card: TableCard }[];
  /** Cards of the last finished trick while the next one is empty, so its result stays visible. */
  lastTrick: { anchor: Anchor; card: TableCard }[];
  maoDeFerro: boolean;
  actions: GameActions;
  over: { won: boolean } | null;
}

const PIP_COUNT = 3;

/** Pure view -> render model. Never throws on a well-formed snapshot. */
export function tableModel(view: GameView, room: RoomState): TableModel {
  const { mode } = view;
  const seats = view.players.map((p): SeatModel => {
    const info = room.players.find((r) => r.seat === p.seat);
    return {
      seat: p.seat,
      anchor: anchorFor(mode, relativeIndex(view.seat, p.seat, mode)),
      name: info?.name ?? 'Vazio',
      team: p.team,
      mine: p.seat === view.seat,
      partner: isPartner(view.seat, p.seat),
      connected: info?.connected ?? false,
      active: view.turn === p.seat,
      cardCount: p.cardCount,
      cards: p.cards,
    };
  });

  const pips: Pip[] = view.tricks.slice(0, PIP_COUNT).map((t) => {
    if (t.winner === null) return 'tied';
    return t.winner === view.team ? 'won' : 'lost';
  });
  while (pips.length < PIP_COUNT) pips.push('pending');

  const placed = (cards: readonly TableCard[]): { anchor: Anchor; card: TableCard }[] =>
    cards.map((card) => ({
      anchor: anchorFor(mode, relativeIndex(view.seat, card.seat, mode)),
      card,
    }));
  const finished = view.tricks[view.tricks.length - 1];

  const theirs = view.team === 0 ? 1 : 0;
  return {
    seats,
    us: view.scores[view.team],
    them: view.scores[theirs],
    value: view.value,
    vira: view.vira,
    manilha: view.manilha,
    pips,
    trick: placed(view.trick),
    lastTrick: view.trick.length === 0 && finished ? placed(finished.cards) : [],
    maoDeFerro: view.maoDeFerro,
    actions: view.actions,
    over: view.winner === null ? null : { won: view.winner === view.team },
  };
}
