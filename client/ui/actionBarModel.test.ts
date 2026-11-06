import { describe, expect, it } from 'vitest';
import type { Card, GameActions, GameView, Team } from '../../shared/types.js';
import { actionBarModel, stakeName } from './actionBarModel.js';

const card = (id: Card['id'], rank: Card['rank'], suit: Card['suit']): Card => ({ id, rank, suit });
const noActions: GameActions = {
  play: false,
  playFaceDown: false,
  playBlind: false,
  callTruco: null,
  respond: null,
  decideMaoDeOnze: false,
};

function makeView(patch: Partial<GameView> = {}, actions: Partial<GameActions> = {}): GameView {
  return {
    mode: 4,
    seat: 0,
    team: 0,
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
    players: [],
    tricks: [],
    trick: [],
    winner: null,
    actions: { ...noActions, ...actions },
    ...patch,
  };
}

const names = (seat: number): string => ['Ana', 'Beto', 'Caio', 'Duda'][seat] ?? 'Vazio';

describe('stakeName', () => {
  it('names the ladder steps', () => {
    expect(stakeName(3)).toBe('TRUCO');
    expect(stakeName(6)).toBe('SEIS');
    expect(stakeName(9)).toBe('NOVE');
    expect(stakeName(12)).toBe('DOZE');
    expect(stakeName(4)).toBe('4');
  });
});

describe('actionBarModel', () => {
  it('labels the call button from callTruco', () => {
    expect(actionBarModel(makeView({}, { callTruco: 3 }), names).call).toEqual({
      label: 'TRUCO',
      stake: 3,
    });
    expect(actionBarModel(makeView({}, { callTruco: 6 }), names).call?.label).toBe('SEIS');
  });

  it('has no call button when callTruco is null', () => {
    expect(actionBarModel(makeView(), names).call).toBeNull();
  });

  it('builds the raise label', () => {
    const m = actionBarModel(makeView({}, { respond: { raise: 6 } }), names);
    expect(m.respond?.raise).toEqual({ label: 'Aumentar para SEIS', stake: 6 });
  });

  it('has no raise at the top of the ladder', () => {
    const m = actionBarModel(makeView({}, { respond: { raise: null } }), names);
    expect(m.respond).not.toBeNull();
    expect(m.respond?.raise).toBeNull();
  });

  it('makes the calling team wait without buttons', () => {
    const truco = { caller: 0, team: 0 as Team, stake: 3 };
    const m = actionBarModel(makeView({ truco }), names);
    expect(m.waiting).toBe('Aguardando resposta…');
    expect(m.call).toBeNull();
    expect(m.respond).toBeNull();
  });

  it('does not wait when the viewer can respond', () => {
    const truco = { caller: 1, team: 1 as Team, stake: 3 };
    const m = actionBarModel(makeView({ truco }, { respond: { raise: 6 } }), names);
    expect(m.waiting).toBeNull();
  });

  it('names the caller in the banner', () => {
    const truco = { caller: 1, team: 1 as Team, stake: 6 };
    expect(actionBarModel(makeView({ truco }), names).banner).toBe('Beto pediu SEIS!');
    expect(actionBarModel(makeView(), names).banner).toBeNull();
  });
});
