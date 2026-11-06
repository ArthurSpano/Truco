import type { Card, GameView } from '../../shared/types.js';

export type HandPhase =
  | { kind: 'normal' }
  | { kind: 'mao_de_onze_decide'; hands: { seat: number; cards: Card[] }[] }
  | { kind: 'mao_de_onze_wait' }
  | { kind: 'mao_de_ferro' }
  | { kind: 'over'; won: boolean };

/**
 * Which screen the hand is in. Pure view -> phase; legality comes only from `view.actions`.
 * Priority: match over > mão de onze (pending) > mão de ferro > normal.
 * Hands are listed only for seats whose `cards` the server sent us.
 */
export function handPhase(view: GameView): HandPhase {
  if (view.winner !== null) return { kind: 'over', won: view.winner === view.team };
  if (view.maoDeOnze?.decision === 'pending') {
    if (!view.actions.decideMaoDeOnze) return { kind: 'mao_de_onze_wait' };
    const hands: { seat: number; cards: Card[] }[] = [];
    for (const p of view.players) if (p.cards) hands.push({ seat: p.seat, cards: p.cards });
    return { kind: 'mao_de_onze_decide', hands };
  }
  if (view.maoDeFerro) return { kind: 'mao_de_ferro' };
  return { kind: 'normal' };
}
