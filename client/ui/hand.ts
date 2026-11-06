import type { Card, CardId, GameActions, Rank } from '../../shared/types.js';
import { renderCard, renderCardBack } from './card.js';
import { el } from './dom.js';
import { createHandStore, fanLayout } from './handFan.js';
import type { HandStore } from './handFan.js';

/** One-play latch owned by the table screen, shared by every intent sent from the table. */
export interface SendLatch {
  pending: boolean;
}

/** Upward drag distance (px) that counts as "play this card". */
const DRAG_PLAY_PX = 40;

/** Mão de ferro: the viewer's cards are unseen, so the hand is `count` backs played by slot. */
export interface BlindHand {
  count: number;
  onPlayBlind(slot: number): void;
}

/** Store key of a blind slot; never collides with a real card id (those are rank + suit code). */
const slotKey = (i: number): string => `slot:${String(i)}`;

/**
 * The viewer's hand: fanned cards, tap to select and tap again (or drag up) to play.
 * Playing is gated on `actions`; out of turn the hand is inert and sends nothing.
 * With `blind` (mão de ferro) it shows card backs and only ever sends `onPlayBlind(slot)`,
 * gated on `actions.playBlind`; `onPlay` is never called and there is no face-down toggle.
 */
export function renderHand(
  cards: Card[] | null,
  manilha: Rank,
  actions: GameActions,
  onPlay: (cardId: CardId, faceDown: boolean) => void,
  store: HandStore = createHandStore(),
  latch: SendLatch = { pending: false },
  blind?: BlindHand,
): HTMLElement {
  const isBlind = blind !== undefined;
  const faces = isBlind ? [] : (cards ?? []);
  const keys = isBlind
    ? Array.from({ length: blind.count }, (_, i) => slotKey(i))
    : faces.map((c) => c.id as string);
  // The reducer plays on `actions.play`; in blind mode that permission is `playBlind`.
  const effective: GameActions = isBlind
    ? { ...actions, play: actions.playBlind, playFaceDown: false }
    : actions;
  store.dispatch({ kind: 'sync', cardIds: keys, actions: effective });
  const canAct = isBlind ? actions.playBlind : actions.play || actions.playFaceDown;

  const root = el('div', 'hand');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Sua mão');
  if (!canAct) root.setAttribute('aria-disabled', 'true');
  const fan = el('div', 'hand-fan');
  root.append(fan);

  const buttons = new Map<string, HTMLButtonElement>();

  function tap(cardId: string): void {
    if (!canAct || latch.pending) return;
    const play = store.dispatch({ kind: 'tap', cardId });
    if (play && blind) {
      const slot = keys.indexOf(play.cardId);
      if (slot >= 0) {
        latch.pending = true;
        blind.onPlayBlind(slot);
      }
    } else {
      const card = play && faces.find((c) => c.id === play.cardId);
      if (play && card) {
        latch.pending = true;
        onPlay(card.id, play.faceDown);
      }
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
      if (!canAct || latch.pending) btn.setAttribute('aria-disabled', 'true');
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

  const slots = fanLayout(keys.length);
  keys.forEach((key, i) => {
    const slot = slots[i];
    const btn = el('button', 'hand-card');
    btn.type = 'button';
    if (!canAct) btn.setAttribute('aria-disabled', 'true');
    if (slot) {
      btn.style.setProperty('--angle', `${slot.angle}deg`);
      btn.style.setProperty('--dx', String(slot.offsetX));
      btn.style.setProperty('--drop', `${slot.lift}px`);
    }
    const card = faces[i];
    if (card) {
      btn.append(renderCard(card, { manilha: card.rank === manilha }));
    } else {
      const back = renderCardBack();
      back.setAttribute('aria-label', `Carta ${String(i + 1)}, virada`);
      btn.append(back);
    }
    attachDrag(btn, key);
    buttons.set(key, btn);
    fan.append(btn);
  });

  const toggle = el('button', 'btn hand-toggle', 'Virada');
  toggle.type = 'button';
  toggle.hidden = isBlind || !actions.playFaceDown;
  toggle.addEventListener('click', () => {
    store.dispatch({ kind: 'toggle_face_down' });
    refresh();
  });
  root.append(toggle);

  refresh();
  return root;
}
