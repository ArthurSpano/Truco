import { describe, expect, it } from 'vitest';
import type { Card, GameMode, GameView, Seat, Team } from '../../shared/types.js';
import { handPhase } from './handPhase.js';

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

describe('handPhase', () => {
  it('is normal for an ordinary hand', () => {
    expect(handPhase(makeView(2, 0))).toEqual({ kind: 'normal' });
  });

  it('reports the match result and beats every other phase', () => {
    const base = { maoDeFerro: true, maoDeOnze: { team: 0 as Team, decision: 'pending' as const } };
    expect(handPhase(makeView(2, 0, { ...base, winner: 0 }))).toEqual({ kind: 'over', won: true });
    expect(handPhase(makeView(2, 0, { ...base, winner: 1 }))).toEqual({ kind: 'over', won: false });
  });

  it('lets the deciding team see only the hands the server revealed (2 players)', () => {
    const view = makeView(2, 0, {
      maoDeOnze: { team: 0, decision: 'pending' },
      actions: { ...makeView(2, 0).actions, decideMaoDeOnze: true },
    });
    const phase = handPhase(view);
    expect(phase.kind).toBe('mao_de_onze_decide');
    if (phase.kind === 'mao_de_onze_decide') {
      expect(phase.hands.map((h) => h.seat)).toEqual([0]);
    }
  });

  it('lists the partner hand too in 4 players', () => {
    const base = makeView(4, 1);
    const view = makeView(4, 1, {
      maoDeOnze: { team: 1, decision: 'pending' },
      actions: { ...base.actions, decideMaoDeOnze: true },
      players: base.players.map((p) =>
        p.seat === 3 ? { ...p, cards: [card('5c', '5', 'clubs')] } : p,
      ),
    });
    const phase = handPhase(view);
    expect(phase.kind === 'mao_de_onze_decide' && phase.hands.map((h) => h.seat)).toEqual([1, 3]);
  });

  it('waits while the other team decides, with no hands attached', () => {
    const view = makeView(2, 1, { maoDeOnze: { team: 0, decision: 'pending' } });
    expect(handPhase(view)).toEqual({ kind: 'mao_de_onze_wait' });
  });

  it('plays on normally once the decision is play', () => {
    const view = makeView(2, 0, { maoDeOnze: { team: 0, decision: 'play' }, value: 3 });
    expect(handPhase(view)).toEqual({ kind: 'normal' });
  });

  it('is mao_de_ferro when both teams are at 11', () => {
    expect(handPhase(makeView(2, 0, { maoDeFerro: true }))).toEqual({ kind: 'mao_de_ferro' });
  });
});
