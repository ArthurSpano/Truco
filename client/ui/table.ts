import type { CardId } from '../../shared/types.js';
import { renderCardBack, renderCard, renderTableCard, rankLabel } from './card.js';
import { el } from './dom.js';
import { placeAtAnchor, renderChair, renderScene } from './scene.js';
import type { Pip, SeatModel, TableModel } from './tableModel.js';

export interface TableHandler {
  onPlay(cardId: CardId, faceDown: boolean): void;
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
  vira.append(el('span', 'vira-label', 'Vira'), renderCard(model.vira));
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
      slot.append(renderTableCard(card, model.manilha));
      played.append(slot);
    }
  };
  add(model.lastTrick, ' last-trick');
  add(model.trick, '');
  centre.append(played);
  return centre;
}

function renderOver(won: boolean, onLeave: () => void): HTMLElement {
  const overlay = el('div', `match-over ${won ? 'won' : 'lost'}`);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'match-over-title');
  const title = el('h2', 'match-over-title', won ? 'Vitória!' : 'Derrota');
  title.id = 'match-over-title';
  overlay.append(title);
  const btn = el('button', 'btn primary', 'Voltar ao início');
  btn.type = 'button';
  btn.addEventListener('click', onLeave);
  overlay.append(btn);
  // Focus once the overlay is in the document.
  queueMicrotask(() => {
    btn.focus();
  });
  return overlay;
}

/** Pure render of one snapshot; the hand and action bar are added by later tasks. */
export function renderTable(model: TableModel, handler: TableHandler): HTMLElement {
  const { root, tableArea } = renderScene();
  root.classList.add(`mode-${model.seats.length}`);
  root.insertBefore(renderInfoStrip(model), tableArea);
  root.insertBefore(renderScoreboard(model), root.querySelector('.info-strip'));

  for (const seat of model.seats) {
    tableArea.append(renderChair(seat.anchor, seat));
    if (!seat.mine) tableArea.append(renderOpponentHand(seat));
  }
  tableArea.append(renderCentre(model));

  if (model.over)
    root.append(
      renderOver(model.over.won, () => {
        handler.onLeave();
      }),
    );
  return root;
}
