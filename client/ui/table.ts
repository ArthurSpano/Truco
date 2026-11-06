import type { ClientMessage } from '../../shared/protocol.js';
import type { CardId } from '../../shared/types.js';
import { renderActionBar } from './actionBar.js';
import { renderCardBack, renderCard, renderTableCard, rankLabel } from './card.js';
import { el } from './dom.js';
import { renderHand } from './hand.js';
import type { SendLatch } from './hand.js';
import type { HandStore } from './handFan.js';
import {
  renderMatchOver,
  renderMaoDeFerroBanner,
  renderMaoDeOnze,
  renderMaoDeOnzeWait,
} from './phaseScreens.js';
import { placeAtAnchor, renderChair, renderScene } from './scene.js';
import type { Pip, SeatModel, TableModel } from './tableModel.js';

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

const PIP_LABELS: Record<Pip, string> = {
  won: 'vaza ganha',
  lost: 'vaza perdida',
  tied: 'vaza empatada',
  pending: 'vaza pendente',
};

function renderScoreboard(model: TableModel): HTMLElement {
  const board = el('div', 'scoreboard');
  const us = el('span', 'score score-us');
  us.append(el('span', 'score-label', 'Nós'), el('strong', 'score-num', String(model.us)));
  const them = el('span', 'score score-them');
  them.append(el('strong', 'score-num', String(model.them)), el('span', 'score-label', 'Eles'));
  board.append(us, el('span', 'score-x', '×'), them);
  return board;
}

function renderPips(pips: Pip[]): HTMLElement {
  const row = el('div', 'pips');
  row.setAttribute('role', 'list');
  for (const pip of pips) {
    const dot = el('span', `pip ${pip}`);
    dot.setAttribute('role', 'listitem');
    dot.setAttribute('aria-label', PIP_LABELS[pip]);
    row.append(dot);
  }
  return row;
}

/** Fanned card backs next to an opponent's chair, one per card still in hand. */
function renderOpponentHand(seat: SeatModel): HTMLElement {
  const fan = el('div', `opp-hand anchor-${seat.anchor}`);
  fan.dataset.seat = String(seat.seat);
  const n = seat.cardCount;
  for (let i = 0; i < n; i++) {
    const back = renderCardBack();
    back.style.setProperty('--fan', String(i - (n - 1) / 2));
    fan.append(back);
  }
  placeAtAnchor(fan, seat.anchor);
  return fan;
}

/** Vira, manilha, hand value and trick pips: a compact strip above the table, off the card paths. */
function renderInfoStrip(model: TableModel): HTMLElement {
  const strip = el('div', 'info-strip');
  const vira = el('div', 'vira');
  const viraCard = renderCard(model.vira);
  viraCard.setAttribute('role', 'img');
  vira.append(el('span', 'vira-label', 'Vira'), viraCard);
  const manilha = el('span', 'manilha-mark', `Manilha: ${rankLabel(model.manilha)}`);
  const badge = el('span', 'value-badge', `Valendo ${model.value}`);
  const tags = el('div', 'info-tags');
  tags.append(manilha, badge);
  if (model.maoDeFerro) tags.append(el('span', 'ferro-mark', 'Mão de ferro'));
  strip.append(vira, tags, renderPips(model.pips));
  return strip;
}

function renderCentre(model: TableModel): HTMLElement {
  const centre = el('div', 'table-centre');
  const played = el('div', 'played');
  const add = (list: TableModel['trick'], extra: string): void => {
    for (const { anchor, card } of list) {
      const slot = el('div', `played-slot anchor-${anchor}${extra}`);
      slot.dataset.seat = String(card.seat);
      slot.append(renderTableCard(card, model.manilha));
      played.append(slot);
    }
  };
  add(model.lastTrick, ' last-trick');
  add(model.trick, '');
  centre.append(played);
  return centre;
}

/** Pure render of one snapshot; the action bar sits between the table and the hand. */
export function renderTable(model: TableModel, handler: TableHandler): HTMLElement {
  const { root, tableArea } = renderScene();
  root.classList.add(`mode-${model.seats.length}`);
  root.insertBefore(renderInfoStrip(model), tableArea);
  if (handler.error) {
    const err = el('p', 'table-error', handler.error);
    err.setAttribute('role', 'alert');
    root.append(err);
  }
  root.insertBefore(renderScoreboard(model), root.querySelector('.info-strip'));

  for (const seat of model.seats) {
    tableArea.append(renderChair(seat.anchor, seat));
    if (!seat.mine) tableArea.append(renderOpponentHand(seat));
  }
  tableArea.append(renderCentre(model));

  root.append(
    renderActionBar(
      model.bar,
      (m) => {
        handler.send(m);
      },
      handler.latch,
    ),
  );

  const phase = model.phase;
  const me = model.seats.find((s) => s.mine);
  if (phase.kind === 'mao_de_ferro') root.append(renderMaoDeFerroBanner());
  if (phase.kind === 'mao_de_onze_wait') root.append(renderMaoDeOnzeWait());

  // The hand row keeps its place in every phase: face-up cards, or backs in mão de ferro.
  if (phase.kind === 'mao_de_ferro' && me) {
    root.append(
      renderHand(
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
      ),
    );
  } else if (me?.cards) {
    root.append(
      renderHand(
        me.cards,
        model.manilha,
        model.actions,
        (id, down) => {
          handler.onPlay(id, down);
        },
        handler.hand,
        handler.latch,
      ),
    );
  }

  if (phase.kind === 'mao_de_onze_decide') {
    const names = new Map(model.seats.map((s) => [s.seat, s.mine ? 'Você' : s.name]));
    root.append(
      renderMaoDeOnze(
        phase,
        (m) => {
          handler.send(m);
        },
        handler.latch,
        (seat) => names.get(seat) ?? '',
      ),
    );
  }
  if (phase.kind === 'over')
    root.append(
      renderMatchOver(phase.won, () => {
        handler.onLeave();
      }),
    );
  return root;
}
