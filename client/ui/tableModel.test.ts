import { describe, expect, it } from 'vitest';
import type { RoomState } from '../../shared/protocol.js';
import type { Card, GameMode, GameView, Seat, Team } from '../../shared/types.js';
import { initialOf, statusModel, tableModel } from './tableModel.js';

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
    const truco = { caller: 2, team: 0 as Team, stake: 3 };
    const c = tableModel(makeView(4, 1, { turn: 2, truco }), makeRoom(4));
    expect(c.seats.some((s) => s.active)).toBe(false);
    const maoDeOnze = { team: 0 as Team, decision: 'pending' as const };
    const d = tableModel(makeView(4, 1, { turn: 2, maoDeOnze }), makeRoom(4));
    expect(d.seats.some((s) => s.active)).toBe(false);
  });

  it('maps pips relative to the viewer team and pads to three', () => {
    const view = makeView(4, 1, {
      tricks: [
        { cards: [], winner: 1, winnerSeat: 1 },
        { cards: [], winner: null, winnerSeat: null },
      ],
    });
    expect(tableModel(view, makeRoom(4)).pips).toEqual(['won', 'tied', 'pending']);
    const lost = makeView(4, 1, { tricks: [{ cards: [], winner: 0, winnerSeat: 2 }] });
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

  it('does not redraw a finished trick (the trick_won animation shows it)', () => {
    const cards = [
      { seat: 0, faceDown: false as const, card: card('7d', '7', 'diamonds') },
      { seat: 1, faceDown: true as const },
    ];
    const done = makeView(2, 0, { tricks: [{ cards, winner: 0, winnerSeat: 0 }] });
    const m = tableModel(done, makeRoom(2));
    expect(m.trick).toEqual([]);
    expect(m.pips).toEqual(['won', 'pending', 'pending']);
  });

  it('colours seats by the viewer team and gives avatars an initial', () => {
    const m = tableModel(makeView(4, 1), makeRoom(4, [2]));
    expect(m.seats.filter((s) => s.ours).map((s) => s.seat)).toEqual([1, 3]);
    expect(m.seats.find((s) => s.seat === 0)?.initial).toBe('J');
    expect(m.seats.find((s) => s.seat === 2)?.initial).toBe('?');
    expect(m.mode).toBe(4);
  });

  it('anchors 6-player seats around the hexagon', () => {
    const m = tableModel(makeView(6, 3), makeRoom(6));
    expect(m.seats.map((s) => s.anchor)).toEqual([
      'top',
      'top-left',
      'bottom-left',
      'bottom',
      'bottom-right',
      'top-right',
    ]);
  });
});

describe('initialOf', () => {
  it('takes the first letter, upper-cased, and falls back to ?', () => {
    expect(initialOf('marina')).toBe('M');
    expect(initialOf('  édson')).toBe('É');
    expect(initialOf('')).toBe('?');
  });
});

describe('statusModel', () => {
  const names = (seat: number): string | null => (seat === 2 ? 'Caio' : null);

  it('says whose turn it is and lights the dot only when the viewer can play', () => {
    expect(statusModel(makeView(4, 0, { turn: 2 }), names)).toEqual({
      text: 'Vez de Caio',
      on: false,
    });
    expect(statusModel(makeView(4, 0, { turn: 3 }), names).text).toBe('Vez de Vazio');
    const mine = makeView(4, 0, { turn: 0 });
    expect(statusModel(mine, names)).toEqual({ text: 'Sua vez', on: false });
    const playable = makeView(4, 0, { turn: 0, actions: { ...mine.actions, play: true } });
    expect(statusModel(playable, names)).toEqual({ text: 'Sua vez', on: true });
  });

  it('covers truco, mão de onze, mão de ferro and the end of the match', () => {
    const base = makeView(4, 0);
    const truco = { caller: 1, team: 1 as Team, stake: 6 };
    expect(
      statusModel(
        makeView(4, 0, { truco, actions: { ...base.actions, respond: { raise: 9 } } }),
        names,
      ),
    ).toEqual({ text: 'SEIS! Responda', on: true });
    expect(statusModel(makeView(4, 1, { truco }), names).text).toBe('Aguardando resposta…');
    const m11 = { team: 1 as Team, decision: 'pending' as const };
    expect(statusModel(makeView(4, 0, { maoDeOnze: m11 }), names).text).toBe(
      'Eles decidem a mão de onze…',
    );
    expect(
      statusModel(
        makeView(4, 1, { maoDeOnze: m11, actions: { ...base.actions, decideMaoDeOnze: true } }),
        names,
      ),
    ).toEqual({ text: 'Mão de onze: decida!', on: true });
    expect(statusModel(makeView(4, 0, { maoDeFerro: true, turn: 0 }), names).text).toBe(
      'Sua vez · às cegas',
    );
    expect(statusModel(makeView(4, 0, { winner: 0, turn: null }), names).text).toBe('Fim de jogo');
    expect(statusModel(makeView(4, 0, { turn: null }), names).text).toBe('Embaralhando…');
  });
});

describe('tableModel.bar', () => {
  it('names the caller and falls back to a neutral name', () => {
    const view = makeView(4, 0, { truco: { caller: 1, team: 1, stake: 3 } });
    expect(tableModel(view, makeRoom(4)).bar.banner).toBe('Jog1 pediu TRUCO!');
    expect(tableModel(view, makeRoom(4, [1])).bar.banner).toBe('Alguém pediu TRUCO!');
  });
});
