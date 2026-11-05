import type { ClientMessage, PlayerInfo } from '../../shared/protocol.js';
import type { ServerInfo } from '../../shared/types.js';
import type { AppState } from '../state/reducer.js';
import { renderShareCard } from './share.js';
import { canReady, seatSlots, statusLine, unseated } from './seatSlots.js';
import { el } from './dom.js';

const TEAM_NAMES = ['Time A', 'Time B'] as const;

/** Lobby: room code, share card, one tappable card per seat, ready toggle. Re-rendered wholesale. */
export function renderLobby(
  state: AppState,
  info: ServerInfo | null,
  send: (m: ClientMessage) => void,
  infoFailed = false,
  onLeave?: () => void,
): HTMLElement {
  const room = state.room;
  const root = el('section', 'panel lobby');
  if (!room) return root;

  const head = el('div', 'room-head');
  head.append(el('p', 'muted small', 'Código da sala'));
  head.append(el('p', 'room-code', room.code));
  root.append(head);

  if (info) root.append(renderShareCard(info, room.code));
  else if (infoFailed) {
    root.append(
      el('p', 'muted small', 'Não consegui obter o endereço da rede. Passe o código da sala.'),
    );
  }

  const list = el('ul', 'seats');
  for (const slot of seatSlots(room)) {
    const li = el('li');
    const btn = el('button', `seat team-${slot.team}`);
    btn.type = 'button';
    const team = el('span', 'seat-team', TEAM_NAMES[slot.team]);
    const who = el('span', 'seat-name', slot.player ? slot.player.name : 'Vaga livre');
    btn.append(team, who);
    if (slot.mine) btn.classList.add('mine');
    if (slot.player && !slot.player.connected) {
      btn.classList.add('away');
      btn.append(el('span', 'seat-note', 'desconectado'));
    } else if (slot.player?.ready) {
      btn.classList.add('ready');
      btn.append(el('span', 'seat-note', 'pronto'));
    }
    // Server rejects taken seats; disable them so the tap target is not misleading.
    // Also inert while offline and for your own seat (nothing to do there).
    btn.disabled = state.conn !== 'open' || slot.player !== null;
    const parts = [`${TEAM_NAMES[slot.team]}, cadeira ${slot.seat + 1}`];
    parts.push(slot.player ? slot.player.name : 'vaga livre');
    if (slot.mine) parts.push('você');
    if (slot.player && !slot.player.connected) parts.push('desconectado');
    else if (slot.player?.ready) parts.push('pronto');
    btn.setAttribute('aria-label', parts.join(', '));
    btn.addEventListener('click', () => {
      send({ t: 'pick_seat', seat: slot.seat });
    });
    li.append(btn);
    list.append(li);
  }
  root.append(list);

  const waiting = unseated(room);
  if (waiting.length > 0) {
    const names = waiting.map((x: PlayerInfo) => x.name).join(', ');
    root.append(el('p', 'muted small', `Em pé, sem cadeira: ${names}`));
  }

  const me = room.players.find((x) => x.id === room.you);
  const ready = el('button', 'btn primary', me?.ready ? 'Não estou pronto' : 'Pronto!');
  ready.type = 'button';
  ready.disabled = state.conn !== 'open' || !canReady(room);
  ready.setAttribute('aria-pressed', String(me?.ready === true));
  ready.addEventListener('click', () => {
    send({ t: 'ready' });
  });
  root.append(ready);

  const status = el('p', 'muted', statusLine(room));
  status.setAttribute('aria-live', 'polite');
  root.append(status);
  if (onLeave) {
    const leave = el('button', 'btn', 'Sair da mesa');
    leave.type = 'button';
    leave.addEventListener('click', onLeave);
    root.append(leave);
  }
  if (state.error) {
    const err = el('p', 'error', state.error.text);
    err.setAttribute('role', 'alert');
    root.append(err);
  }
  return root;
}
