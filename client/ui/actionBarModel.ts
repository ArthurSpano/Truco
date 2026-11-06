import type { GameView } from '../../shared/types.js';

export interface LabelledStake {
  label: string;
  stake: number;
}

export interface ActionBarModel {
  /** The TRUCO / SEIS / NOVE / DOZE button, when the server allows a call. */
  call: LabelledStake | null;
  /** Aceitar / Correr / Aumentar, when the viewer may answer a pending call. */
  respond: { raise: (LabelledStake & { name: string }) | null } | null;
  /** Shown instead of buttons while the other team is still answering our call. */
  waiting: string | null;
  /** Who called what, while a call is pending. */
  banner: string | null;
}

const STAKE_NAMES: Record<number, string> = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };

export function stakeName(stake: number): string {
  return STAKE_NAMES[stake] ?? String(stake);
}

/** Pure view -> action bar model. Legality comes only from `view.actions`. */
export function actionBarModel(view: GameView, names: (seat: number) => string): ActionBarModel {
  const { actions, truco } = view;
  const raise = actions.respond?.raise ?? null;
  return {
    call:
      actions.callTruco === null
        ? null
        : { label: stakeName(actions.callTruco), stake: actions.callTruco },
    respond: actions.respond
      ? {
          raise:
            raise === null
              ? null
              : {
                  label: `Aumentar para ${stakeName(raise)}`,
                  name: stakeName(raise),
                  stake: raise,
                },
        }
      : null,
    waiting: truco && truco.team === view.team && !actions.respond ? 'Aguardando resposta…' : null,
    banner: truco
      ? `${names(truco.caller) === 'Vazio' ? 'Alguém' : names(truco.caller)} pediu ${stakeName(truco.stake)}!`
      : null,
  };
}
