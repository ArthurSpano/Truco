import type { Card, CardId, GameActions, Rank } from '../../shared/types.js';
import { renderCard } from './card.js';
import { el } from './dom.js';
import { createHandStore, fanLayout } from './handFan.js';
import type { HandStore } from './handFan.js';

/** Upward drag distance (px) that counts as "play this card". */
const DRAG_PLAY_PX = 40;

/**
 * The viewer's hand: fanned cards, tap to select and tap again (or drag up) to play.
 * Playing is gated on `actions`; out of turn the hand is inert and sends nothing.
 * Mão de ferro (`actions.playBlind`) is handled by a later task; until then the cards
 * stay inert when only `playBlind` is set.
 */
export function renderHand(
  cards: Card[],
  manilha: Rank,
  actions: GameActions,
  onPlay: (cardId: CardId, faceDown: boolean) => void,
  store: HandStore = createHandStore(),
): HTMLElement {
  store.dispatch({ kind: 'sync', cardIds: cards.map((c) => c.id), actions });
  const canAct = actions.play || actions.playFaceDown;

  const root = el('div', 'hand');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Sua mão');
  if (!canAct) root.setAttribute('aria-disabled', 'true');
  const fan = el('div', 'hand-fan');
  root.append(fan);

  // One latch per rebuild: the next snapshot rebuilds the hand, which re-arms it.
  let sent = false;
  const buttons = new Map<string, HTMLButtonElement>();

  function tap(cardId: string): void {
    if (!canAct || sent) return;
    const play = store.dispatch({ kind: 'tap', cardId });
    const card = play && cards.find((c) => c.id === play.cardId);
    if (play && card) {
      sent = true;
      onPlay(card.id, play.faceDown);
    }
    refresh();
  }

  /** Updates the existing buttons in place so keyboard focus is never lost. */
  function refresh(): void {
    const { selected, faceDown } = store.state;
    for (const [id, btn] of buttons) {
      const on = id === selected;
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-selected', on);
      btn.firstElementChild?.classList.toggle('selected', on);
      if (!canAct || sent) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    }
    root.classList.toggle('face-down', faceDown);
    toggle.setAttribute('aria-pressed', String(faceDown));
    toggle.classList.toggle('on', faceDown);
  }

  function attachDrag(btn: HTMLButtonElement, cardId: string): void {
    let startY: number | null = null;
    let pointer = -1;
    let dragged = false;
    btn.addEventListener('pointerdown', (e) => {
      if (!canAct || !e.isPrimary || e.button !== 0) return;
      startY = e.clientY;
      pointer = e.pointerId;
      dragged = false;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointerup', (e) => {
      if (startY === null || e.pointerId !== pointer) return;
      const rise = startY - e.clientY;
      startY = null;
      btn.releasePointerCapture(e.pointerId);
      if (rise < DRAG_PLAY_PX) return;
      dragged = true; // swallow the click that follows this pointerup
      if (store.state.selected !== cardId) store.dispatch({ kind: 'tap', cardId });
      tap(cardId);
    });
    btn.addEventListener('pointercancel', () => {
      startY = null;
    });
    btn.addEventListener('click', () => {
      if (dragged) {
        dragged = false;
        return;
      }
      tap(cardId);
    });
  }

  const slots = fanLayout(cards.length);
  cards.forEach((card, i) => {
    const slot = slots[i];
    const btn = el('button', 'hand-card');
    btn.type = 'button';
    if (!canAct) btn.setAttribute('aria-disabled', 'true');
    if (slot) {
      btn.style.setProperty('--angle', `${slot.angle}deg`);
      btn.style.setProperty('--dx', String(slot.offsetX));
      btn.style.setProperty('--drop', `${slot.lift}px`);
    }
    btn.append(renderCard(card, { manilha: card.rank === manilha }));
    attachDrag(btn, card.id);
    buttons.set(card.id, btn);
    fan.append(btn);
  });

  const toggle = el('button', 'btn hand-toggle', 'Virada');
  toggle.type = 'button';
  toggle.hidden = !actions.playFaceDown;
  toggle.addEventListener('click', () => {
    store.dispatch({ kind: 'toggle_face_down' });
    refresh();
  });
  root.append(toggle);

  refresh();
  return root;
}
