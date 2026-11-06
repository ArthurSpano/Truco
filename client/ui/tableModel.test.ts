import { describe, expect, it } from 'vitest';
import type { RoomState } from '../../shared/protocol.js';
import type { Card, GameMode, GameView, Seat, Team } from '../../shared/types.js';
import { tableModel } from './tableModel.js';

const card = (id: Card['id'], rank: Card['rank'], suit: Card['suit']): Card => ({ id, rank, suit });

function makeView(mode: GameMode, seat: Seat, patch: Partial<GameView> = {}): GameView {
  return {
    mode,
    seat,
    team: (seat % 2) as Team,
    scores: [0, 0],
    handNumber: 1,
    dealer: 0,
    mao: 1,
    turn: 0,
    vira: card('3h', '3', 'hearts'),
    manilha: '4',
    value: 1,
    truco: null,
    raisedBy: null,
    maoDeOnze: null,
    maoDeFerro: false,
    players: Array.from({ length: mode }, (_, s) => ({
      seat: s,
      team: (s % 2) as Team,
      cardCount: 3,
      cards: s === seat ? [card('4c', '4', 'clubs')] : null,
    })),
    trick: [],
    tricks: [],
    winner: null,
    actions: {
      play: false,
      playFaceDown: false,
      playBlind: false,
      callTruco: null,
      respond: null,
      decideMaoDeOnze: false,
    },
    ...patch,
  };
}

function makeRoom(mode: GameMode, skip: Seat[] = []): RoomState {
  return {
    code: 'BAR7',
    mode,
    status: 'playing',
    you: 'p1',
    players: Array.from({ length: mode }, (_, s) => s)
      .filter((s) => !skip.includes(s))
      .map((s) => ({
        id: `p${s}`,
        name: `Jog${s}`,
        seat: s,
        ready: true,
        connected: true,
        host: s === 0,
      })),
  };
}

describe('tableModel', () => {
  it('puts the viewer at the bottom and flips the score to Nós x Eles', () => {
    const m = tableModel(makeView(4, 1, { scores: [5, 3], turn: 2 }), makeRoom(4));
    expect(m.us).toBe(3);
    expect(m.them).toBe(5);
    expect(m.seats).toHaveLength(4);
    const me = m.seats.find((s) => s.seat === 1);
    expect(me).toMatchObject({ anchor: 'bottom', mine: true, name: 'Jog1' });
    expect(m.seats.find((s) => s.seat === 3)?.partner).toBe(true);
    expect(m.seats.find((s) => s.seat === 2)?.partner).toBe(false);
  });

  it('marks only the seat on turn as active, and none when turn is null', () => {
    const a = tableModel(makeView(4, 1, { turn: 2 }), makeRoom(4));
    expect(a.seats.filter((s) => s.active).map((s) => s.seat)).toEqual([2]);
    const b = tableModel(makeView(4, 1, { turn: null }), makeRoom(4));
    expect(b.seats.some((s) => s.active)).toBe(false);
  });

  it('maps pips relative to the viewer team and pads to three', () => {
    const view = makeView(4, 1, {
      tricks: [
        { cards: [], winner: 1 },
        { cards: [], winner: null },
      ],
    });
    expect(tableModel(view, makeRoom(4)).pips).toEqual(['won', 'tied', 'pending']);
    const lost = makeView(4, 1, { tricks: [{ cards: [], winner: 0 }] });
    expect(tableModel(lost, makeRoom(4)).pips).toEqual(['lost', 'pending', 'pending']);
    expect(tableModel(makeView(2, 0), makeRoom(2)).pips).toEqual(['pending', 'pending', 'pending']);
  });

  it('names a seat without a player Vazio', () => {
    const m = tableModel(makeView(4, 0), makeRoom(4, [2]));
    const empty = m.seats.find((s) => s.seat === 2);
    expect(empty?.name).toBe('Vazio');
    expect(empty?.connected).toBe(false);
  });

  it('keeps face-down trick cards face-down and anchors them to their seat', () => {
    const view = makeView(4, 1, {
      trick: [
        { seat: 2, faceDown: true },
        { seat: 1, faceDown: false, card: card('7d', '7', 'diamonds') },
      ],
    });
    const m = tableModel(view, makeRoom(4));
    expect(m.trick).toHaveLength(2);
    expect(m.trick[0]).toMatchObject({ anchor: 'right', card: { faceDown: true } });
    expect(m.trick[1]?.anchor).toBe('bottom');
  });

  it('exposes cards only for seats the view reveals, plus vira data', () => {
    const m = tableModel(makeView(4, 1), makeRoom(4));
    expect(m.seats.find((s) => s.mine)?.cards).toHaveLength(1);
    expect(m.seats.find((s) => s.seat === 2)?.cards).toBeNull();
    expect(m.manilha).toBe('4');
    expect(m.vira.id).toBe('3h');
  });

  it('keeps the last finished trick visible until the next card is played', () => {
    const cards = [
      { seat: 0, faceDown: false as const, card: card('7d', '7', 'diamonds') },
      { seat: 1, faceDown: true as const },
    ];
    const done = makeView(2, 0, { tricks: [{ cards, winner: 0 }] });
    const m = tableModel(done, makeRoom(2));
    expect(m.trick).toEqual([]);
    expect(m.lastTrick.map((t) => t.anchor)).toEqual(['bottom', 'top']);
    expect(m.lastTrick[1]?.card.faceDown).toBe(true);
    const next = makeView(2, 0, { tricks: [{ cards, winner: 0 }], trick: [cards[0] as never] });
    expect(tableModel(next, makeRoom(2)).lastTrick).toEqual([]);
    expect(tableModel(makeView(2, 0), makeRoom(2)).lastTrick).toEqual([]);
  });
});

describe('tableModel.bar', () => {
  it('names the caller and falls back to a neutral name', () => {
    const view = makeView(4, 0, { truco: { caller: 1, team: 1, stake: 3 } });
    expect(tableModel(view, makeRoom(4)).bar.banner).toBe('Jog1 pediu TRUCO!');
    expect(tableModel(view, makeRoom(4, [1])).bar.banner).toBe('Alguém pediu TRUCO!');
  });
});
