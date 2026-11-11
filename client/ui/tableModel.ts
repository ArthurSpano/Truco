import type { RoomState } from '../../shared/protocol.js';
import type { Card, GameActions, GameMode, GameView, Rank, TableCard } from '../../shared/types.js';
import { actionBarModel, stakeName, type ActionBarModel } from './actionBarModel.js';
import { handPhase, type HandPhase } from './handPhase.js';
import { anchorFor, isPartner, relativeIndex, type Anchor } from './layout.js';

export type Pip = 'won' | 'lost' | 'tied' | 'pending';

export interface SeatModel {
  seat: number;
  anchor: Anchor;
  name: string;
  /** Avatar letter: the name's first letter, or '?' for an empty chair. */
  initial: string;
  team: 0 | 1;
  /** On the viewer's team (Nós): amber chair and avatar; otherwise red (Eles). */
  ours: boolean;
  mine: boolean;
  partner: boolean;
  connected: boolean;
  active: boolean;
  cardCount: number;
  cards: Card[] | null;
}

export interface StatusModel {
  text: string;
  /** The viewer is expected to act now (lights the dot). */
  on: boolean;
}

export interface TableModel {
  mode: GameMode;
  seats: SeatModel[];
  /** Viewer's team score first (Nós x Eles), whatever the seat parity. */
  us: number;
  them: number;
  value: number;
  vira: Card;
  manilha: Rank;
  pips: Pip[];
  /** Cards of the trick in progress, anchored to their player's seat. */
  trick: { anchor: Anchor; card: TableCard }[];
  maoDeFerro: boolean;
  actions: GameActions;
  bar: ActionBarModel;
  phase: HandPhase;
  status: StatusModel;
}

const PIP_COUNT = 3;
const EMPTY_SEAT = 'Vazio';

/** First letter of a name for the avatar, upper-cased; '?' when there is none. */
export function initialOf(name: string): string {
  const first = name.trim().codePointAt(0);
  return first === undefined ? '?' : String.fromCodePoint(first).toLocaleUpperCase('pt-BR');
}

/** The status pill under the table: whose turn it is, or what the table is waiting for. */
export function statusModel(view: GameView, nameOf: (seat: number) => string | null): StatusModel {
  const { actions } = view;
  if (view.winner !== null) return { text: 'Fim de jogo', on: false };
  if (view.maoDeOnze?.decision === 'pending') {
    if (actions.decideMaoDeOnze) return { text: 'Mão de onze: decida!', on: true };
    return {
      text: view.maoDeOnze.team === view.team ? 'Sua dupla decide…' : 'Eles decidem a mão de onze…',
      on: false,
    };
  }
  if (view.truco) {
    if (actions.respond) return { text: `${stakeName(view.truco.stake)}! Responda`, on: true };
    if (view.truco.team === view.team) return { text: 'Aguardando resposta…', on: false };
    return { text: `${stakeName(view.truco.stake)}!`, on: false };
  }
  if (view.turn === null) return { text: 'Embaralhando…', on: false };
  if (view.turn === view.seat) {
    return {
      text: view.maoDeFerro ? 'Sua vez · às cegas' : 'Sua vez',
      on: actions.play || actions.playFaceDown || actions.playBlind,
    };
  }
  return { text: `Vez de ${nameOf(view.turn) ?? EMPTY_SEAT}`, on: false };
}

/** Pure view -> render model. Never throws on a well-formed snapshot. */
export function tableModel(view: GameView, room: RoomState): TableModel {
  const { mode } = view;
  const nameOf = (seat: number): string | null =>
    room.players.find((r) => r.seat === seat)?.name ?? null;
  const anchorOf = (seat: number): Anchor => anchorFor(mode, relativeIndex(view.seat, seat, mode));

  // Play pauses while a call or a mão de onze decision is pending: nobody is "on turn" then.
  const playing = view.truco === null && view.maoDeOnze?.decision !== 'pending';
  const seats = view.players.map((p): SeatModel => {
    const info = room.players.find((r) => r.seat === p.seat);
    const name = info?.name ?? EMPTY_SEAT; // display fallback for empty chairs
    return {
      seat: p.seat,
      anchor: anchorOf(p.seat),
      name,
      initial: info ? initialOf(name) : '?',
      team: p.team,
      ours: p.team === view.team,
      mine: p.seat === view.seat,
      partner: isPartner(view.seat, p.seat),
      connected: info?.connected ?? false,
      active: playing && view.turn === p.seat,
      cardCount: p.cardCount,
      cards: p.cards,
    };
  });

  const pips: Pip[] = view.tricks.slice(0, PIP_COUNT).map((t) => {
    if (t.winner === null) return 'tied';
    return t.winner === view.team ? 'won' : 'lost';
  });
  while (pips.length < PIP_COUNT) pips.push('pending');

  const theirs = view.team === 0 ? 1 : 0;
  return {
    mode,
    seats,
    us: view.scores[view.team],
    them: view.scores[theirs],
    value: view.value,
    vira: view.vira,
    manilha: view.manilha,
    pips,
    trick: view.trick.map((card) => ({ anchor: anchorOf(card.seat), card })),
    maoDeFerro: view.maoDeFerro,
    actions: view.actions,
    bar: actionBarModel(view, nameOf),
    phase: handPhase(view),
    status: statusModel(view, nameOf),
  };
}
