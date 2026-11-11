import type { ClientMessage } from '../../shared/protocol.js';
import type { CardId } from '../../shared/types.js';
import { renderActionBar } from './actionBar.js';
import { renderCard, rankLabel } from './card.js';
import { el } from './dom.js';
import { renderHand } from './hand.js';
import type { SendLatch } from './hand.js';
import type { HandStore } from './handFan.js';
import { renderMatchOver, renderMaoDeOnze } from './phaseScreens.js';
import { renderRoom } from './scene.js';
import type { Pip, TableModel } from './tableModel.js';

export interface TableHandler {
  /** Selection state; owned by the table screen so it survives rebuilds. */
  hand: HandStore;
  /** One-play latch shared with every other intent sent from the table. */
  latch: SendLatch;
  /** Last server error text (pt-BR), shown as a small line so a rejected play is not silent. */
  error: string | null;
  /** Sends a truco intent (call or answer); the bar has already taken the latch. */
  send(m: ClientMessage): void;
  onPlay(cardId: CardId, faceDown: boolean): void;
  /** Mão de ferro: play the card at this hand position (the viewer cannot see it). */
  onPlayBlind(slot: number): void;
  /** Match-over overlay button: leave the room and go back to the start screen. */
  onLeave(): void;
}

const PIPS: Record<Pip, { cls: string; label: string; aria: string }> = {
  won: { cls: 'nos', label: 'N', aria: 'rodada nossa' },
  lost: { cls: 'eles', label: 'E', aria: 'rodada deles' },
  tied: { cls: 'tie', label: '=', aria: 'rodada empatada' },
  pending: { cls: 'none', label: '', aria: 'rodada por jogar' },
};

const two = (n: number): string => String(n).padStart(2, '0');

function renderScore(model: TableModel): HTMLElement {
  const box = el('div', 'score glass');
  box.setAttribute('aria-label', `Placar: nós ${String(model.us)}, eles ${String(model.them)}`);
  const row = (label: string, value: number, cls: string): HTMLElement => {
    const r = el('div', `r${cls}`);
    r.setAttribute('aria-hidden', 'true');
    r.append(el('span', undefined, label), el('b', undefined, two(value)));
    return r;
  };
  box.append(row('NÓS', model.us, ''), row('ELES', model.them, ' e'));
  return box;
}

function renderMidHud(model: TableModel): HTMLElement {
  const hud = el('div', 'mid-hud');
  hud.append(el('div', 'lbl', 'RODADA'));
  const pips = el('div', 'pips');
  pips.setAttribute('role', 'list');
  for (const pip of model.pips) {
    const p = PIPS[pip];
    const dot = el('div', `pip ${p.cls}`, p.label);
    dot.setAttribute('role', 'listitem');
    dot.setAttribute('aria-label', p.aria);
    pips.append(dot);
  }
  hud.append(pips, el('div', 'value', `VALE ${String(model.value)}`));
  if (model.maoDeFerro) hud.append(el('div', 'tag ferro', 'MÃO DE FERRO'));
  return hud;
}

function renderVira(model: TableModel): HTMLElement {
  const box = el('div', 'vira glass');
  const holder = el('div', 'vc');
  const card = renderCard(model.vira);
  card.classList.add('c-v');
  card.setAttribute('role', 'img');
  holder.append(card);
  const t = el('div', 't');
  t.append(
    el('span', 'lbl', 'VIRA'),
    el('span', 'lbl man-lbl', 'MANILHA'),
    el('b', undefined, rankLabel(model.manilha)),
  );
  t.setAttribute('aria-label', `Manilha: ${rankLabel(model.manilha)}`);
  box.append(holder, t);
  return box;
}

function renderStatus(model: TableModel): HTMLElement {
  const pill = el('div', 'status');
  pill.setAttribute('role', 'status');
  pill.append(
    el('span', `dot${model.status.on ? ' on' : ''}`),
    el('span', undefined, model.status.text),
  );
  return pill;
}

export interface RenderedTable {
  /** Everything on the stage (scaled with it). */
  scene: HTMLElement;
  /** Full-viewport dialog (mão de onze decision, match over), outside the stage; or null. */
  overlay: HTMLElement | null;
}

/** Pure render of one snapshot. */
export function renderTable(model: TableModel, handler: TableHandler): RenderedTable {
  const scene = el('div', `scene mode-${String(model.mode)}`);
  scene.append(renderRoom(model), renderScore(model), renderMidHud(model), renderVira(model));
  scene.append(renderStatus(model));

  if (handler.error) {
    const err = el('p', 'table-error', handler.error);
    err.setAttribute('role', 'alert');
    scene.append(err);
  }

  const phase = model.phase;
  const me = model.seats.find((s) => s.mine);
  // The hand keeps its place in every phase: face-up cards, or backs in mão de ferro.
  let hand: HTMLElement | null = null;
  if (phase.kind === 'mao_de_ferro' && me) {
    hand = renderHand(
      null,
      model.manilha,
      model.actions,
      () => undefined, // blind mode never plays by card id
      handler.hand,
      handler.latch,
      {
        count: me.cardCount,
        onPlayBlind: (slot) => {
          handler.onPlayBlind(slot);
        },
      },
    );
  } else if (me?.cards) {
    hand = renderHand(
      me.cards,
      model.manilha,
      model.actions,
      (id, down) => {
        handler.onPlay(id, down);
      },
      handler.hand,
      handler.latch,
    );
  }
  // The face-down toggle lives in the bar, beside the gold button.
  const toggle = hand?.querySelector<HTMLElement>('.hand-toggle') ?? null;
  const offered = toggle !== null && !toggle.hidden;
  if (toggle && !offered) toggle.remove();
  if (hand) scene.append(hand);
  scene.append(
    renderActionBar(
      model.bar,
      (m) => {
        handler.send(m);
      },
      handler.latch,
      offered ? toggle : null,
    ),
  );

  let overlay: HTMLElement | null = null;
  if (phase.kind === 'mao_de_onze_decide') {
    const names = new Map(model.seats.map((s) => [s.seat, s.mine ? 'Você' : s.name]));
    overlay = renderMaoDeOnze(
      phase,
      (m) => {
        handler.send(m);
      },
      handler.latch,
      (seat) => names.get(seat) ?? '',
      model.manilha,
    );
  } else if (phase.kind === 'over') {
    overlay = renderMatchOver(phase.won, model.us, model.them, () => {
      handler.onLeave();
    });
  }
  return { scene, overlay };
}
