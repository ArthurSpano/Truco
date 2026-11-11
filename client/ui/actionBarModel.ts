import type { GameView } from '../../shared/types.js';

export interface LabelledStake {
  label: string;
  stake: number;
}

/** The big gold button: always drawn, enabled only when the server allows a call. */
export interface TrucoButton {
  /** e.g. "TRUCO!", "SEIS!", "AGUARDE". */
  label: string;
  /** Small line under the label, e.g. "vale 3". */
  sub: string;
  enabled: boolean;
}

export interface ActionBarModel {
  /** The TRUCO / SEIS / NOVE / DOZE call, when the server allows one. */
  call: LabelledStake | null;
  /** Aceitar / Correr / Aumentar, when the viewer may answer a pending call. */
  respond: { raise: (LabelledStake & { name: string }) | null } | null;
  /** Shown instead of buttons while the other team is still answering our call. */
  waiting: string | null;
  /** Who called what, while a call is pending. */
  banner: string | null;
  button: TrucoButton;
  /** The response sheet's question ("Ana pede TRUCO — vale 3"), when the viewer may answer. */
  ask: { name: string; what: string; to: number } | null;
}

const STAKE_NAMES: Record<number, string> = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };
/** Display-only ladder, used to label the disabled button; legality always comes from the server. */
const LADDER = [3, 6, 9, 12] as const;

export function stakeName(stake: number): string {
  return STAKE_NAMES[stake] ?? String(stake);
}

function trucoButton(view: GameView, waiting: boolean): TrucoButton {
  const { actions } = view;
  if (actions.callTruco !== null) {
    return {
      label: `${stakeName(actions.callTruco)}!`,
      sub: `vale ${actions.callTruco}`,
      enabled: true,
    };
  }
  if (waiting) return { label: 'AGUARDE', sub: 'esperando resposta', enabled: false };
  if (view.maoDeFerro) return { label: 'MÃO DE FERRO', sub: 'sem truco', enabled: false };
  if (view.maoDeOnze) return { label: 'MÃO DE ONZE', sub: 'sem truco', enabled: false };
  const next = LADDER.find((s) => s > view.value);
  if (next === undefined) return { label: `VALE ${view.value}`, sub: 'máximo', enabled: false };
  return { label: `${stakeName(next)}!`, sub: `vale ${next}`, enabled: false };
}

/** Pure view -> action bar model. Legality comes only from `view.actions`. */
export function actionBarModel(
  view: GameView,
  names: (seat: number) => string | null,
): ActionBarModel {
  const { actions, truco } = view;
  const raise = actions.respond?.raise ?? null;
  const waiting = truco !== null && truco.team === view.team && !actions.respond;
  const caller = truco ? (names(truco.caller) ?? 'Alguém') : '';
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
    waiting: waiting ? 'Aguardando resposta…' : null,
    banner: truco ? `${caller} pediu ${stakeName(truco.stake)}!` : null,
    button: trucoButton(view, waiting),
    ask:
      truco && actions.respond
        ? { name: caller, what: stakeName(truco.stake), to: truco.stake }
        : null,
  };
}
