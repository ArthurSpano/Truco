import type { GameMode, Rank } from '../../shared/types.js';
import type { HeldCard } from './animationModel.js';
import { renderCardBack, renderTableCard } from './card.js';
import { el } from './dom.js';
import { seatGeometry, type Anchor } from './layout.js';
import type { SeatModel, TableModel } from './tableModel.js';

/**
 * The "Taverna de madeira" room, top-down: round red rug, team-coloured chairs, a round wooden
 * table with a felt top, card backs in front of each opponent and avatars with name tags.
 *
 * Every position is a design pixel of the 390 x 844 stage, handed to CSS as a unitless custom
 * property (`--x: 195`); the stylesheet multiplies it by `--u`, so nothing here knows the real
 * screen size.
 */

/** Sets unitless design-pixel custom properties (`--x`, `--rot`, ...) on a node. */
export function setVars(node: HTMLElement, vars: Record<string, number>): void {
  for (const [k, v] of Object.entries(vars)) node.style.setProperty(`--${k}`, String(v));
}

function renderChair(mode: GameMode, seat: SeatModel): HTMLElement {
  const { chair } = seatGeometry(mode, seat.anchor);
  const node = el('div', `chair ${seat.ours ? 't1' : 't2'}`);
  node.dataset.seat = String(seat.seat);
  if (seat.mine) node.classList.add('mine');
  if (!seat.connected) node.classList.add('away');
  setVars(node, chair);
  return node;
}

/** Avatar circle + name pill. The node carries `data-seat` so bubbles and tests can find it. */
function renderAvatar(mode: GameMode, seat: SeatModel): HTMLElement | null {
  const { avatar } = seatGeometry(mode, seat.anchor);
  if (!avatar) return null;
  const node = el('div', 'pl');
  node.dataset.seat = String(seat.seat);
  if (!seat.connected) node.classList.add('away');
  setVars(node, avatar);
  const av = el('div', `av ${seat.ours ? 'nos' : 'eles'}`, seat.initial);
  av.setAttribute('aria-hidden', 'true');
  if (seat.active) av.classList.add('turn');
  const name = el('div', 'nm', seat.name);
  name.title = seat.connected ? seat.name : `${seat.name} (desconectado)`;
  node.append(av, name);
  if (!seat.connected) node.append(el('div', 'off', 'offline'));
  return node;
}

/** One small card back per card still in an opponent's hand, fanned along their table edge. */
function renderBacks(mode: GameMode, seat: SeatModel): HTMLElement {
  const { backs } = seatGeometry(mode, seat.anchor);
  const row = el('div', 'backs');
  row.dataset.seat = String(seat.seat);
  row.setAttribute('aria-label', `${seat.name}: ${String(seat.cardCount)} cartas`);
  row.setAttribute('role', 'img');
  setVars(row, { x: backs.x, y: backs.y, rot: backs.rot, pitch: backs.pitch });
  const n = seat.cardCount;
  for (let i = 0; i < n; i++) {
    const slot = el('div', 'bw');
    const back = renderCardBack();
    back.removeAttribute('role');
    back.removeAttribute('aria-label');
    setVars(back, { r: (i - (n - 1) / 2) * backs.spread, i });
    slot.append(back);
    row.append(slot);
  }
  return row;
}

/** A card on the felt at its owner's spot; `fly` vectors are read by the slide animation. */
export function renderPlayed(
  mode: GameMode,
  anchor: Anchor,
  card: HeldCard['card'],
  manilha: Rank,
  result: HeldCard['result'] | null = null,
): HTMLElement {
  const { played, from } = seatGeometry(mode, anchor);
  const node = el('div', `tc${result ? ` ${result}` : ''}`);
  node.dataset.anchor = anchor;
  node.dataset.seat = String(card.seat);
  setVars(node, {
    px: played.x,
    py: played.y,
    pr: played.rot,
    fx: from.x,
    fy: from.y,
    fr: from.rot,
    fs: from.scale,
  });
  node.append(renderTableCard(card, manilha));
  return node;
}

export function renderRoom(model: TableModel): HTMLElement {
  const room = el('div', 'room');
  const rug = el('div', 'rugc');
  rug.setAttribute('aria-hidden', 'true');
  room.append(rug);
  for (const seat of model.seats) room.append(renderChair(model.mode, seat));

  const table = el('div', 'table');
  const rim = el('div', 'rim');
  const felt = el('div', 'felt');
  felt.append(el('div', 'fring'));
  const played = el('div', 'played');
  played.setAttribute('aria-label', 'Cartas na mesa');
  for (const { anchor, card } of model.trick) {
    played.append(renderPlayed(model.mode, anchor, card, model.manilha));
  }
  felt.append(played);
  table.append(rim, felt);
  room.append(table);

  for (const seat of model.seats) {
    if (!seat.mine) room.append(renderBacks(model.mode, seat));
  }
  for (const seat of model.seats) {
    const avatar = renderAvatar(model.mode, seat);
    if (avatar) room.append(avatar);
  }
  return room;
}
