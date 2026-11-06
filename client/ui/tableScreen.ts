import type { ClientMessage, RoomState } from '../../shared/protocol.js';
import type { GameEvent, GameView } from '../../shared/types.js';
import { createEventFeed } from '../state/eventFeed.js';
import type { AppState } from '../state/reducer.js';
import { BubbleLayer } from './bubbles.js';
import { bubblesFor } from './bubbleModel.js';
import { el } from './dom.js';
import { createHandStore } from './handFan.js';
import type { SendLatch } from './hand.js';
import type { ScreenView } from './screen.js';
import { renderTable } from './table.js';
import { tableModel } from './tableModel.js';

/** Handed to `onRendered` listeners after every rebuild. */
export interface RenderedContext {
  /** Persistent full-screen overlay (never replaced) for bubbles and animations. */
  fx: HTMLElement;
  /** The seat's chair in the CURRENT DOM (null if that seat is not on the table). */
  anchorOf(seat: number): HTMLElement | null;
}

export interface TableScreen extends ScreenView {
  /** Persistent overlay; survives snapshots. Lives inside the table-mode screen only. */
  fx: HTMLElement;
  anchorOf(seat: number): HTMLElement | null;
  /** Registers a callback fired after every rebuild; returns an unsubscribe function. */
  onRendered(cb: (view: GameView, ctx: RenderedContext) => void): () => void;
  /**
   * Registers a callback for newly arrived events (one shared cursor for bubbles, sfx,
   * animations); returns an unsubscribe function. Events arrive BEFORE their burst's
   * `game_state`, so this fires against the OLD DOM; `onRendered` fires against the new one.
   */
  onEvents(cb: (events: GameEvent[], state: AppState) => void): () => void;
  /**
   * Table-wide send latch: set by every intent sent from the table, cleared when a new view
   * arrives or a server error comes in. Action-bar buttons should check and set it too.
   */
  latch: SendLatch;
}

export interface TableDeps {
  send(m: ClientMessage): void;
  leave(): void;
}

/** Table screen: the scene host is rebuilt from each snapshot; `fx` is never touched. */
export function createTableScreen(deps: TableDeps): TableScreen {
  const element = el('div', 'table-screen');
  const sceneHost = el('div', 'scene-host');
  const fx = el('div', 'fx-layer');
  fx.setAttribute('aria-hidden', 'true');
  element.append(sceneHost, fx);

  let shownView: GameView | null = null;
  let shownRoom: RoomState | null = null;
  let shownError: AppState['error'] = null;
  const hand = createHandStore();
  const latch: SendLatch = { pending: false };
  const listeners = new Set<(view: GameView, ctx: RenderedContext) => void>();

  const anchorOf = (seat: number): HTMLElement | null =>
    sceneHost.querySelector<HTMLElement>(`.chair[data-seat="${String(seat)}"]`);
  const ctx: RenderedContext = { fx, anchorOf };
  const bubbles = new BubbleLayer(fx, anchorOf);
  const eventListeners = new Set<(events: GameEvent[], state: AppState) => void>();
  // Seeded from the first state seen, so mounting or reconnecting never replays old events.
  const nextEvents = createEventFeed();
  const onEvents: TableScreen['onEvents'] = (cb) => {
    eventListeners.add(cb);
    return () => {
      eventListeners.delete(cb);
    };
  };
  onEvents((events) => {
    for (const b of bubblesFor(events)) bubbles.show(b);
  });

  /** Runs on every state update (even ones that do not rebuild the table). */
  const feedEvents = (state: AppState): void => {
    const events = nextEvents(state);
    if (events.length === 0) return;
    for (const cb of [...eventListeners]) cb(events, state);
  };

  return {
    element,
    fx,
    anchorOf,
    latch,
    onEvents,
    onRendered(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    update(next) {
      feedEvents(next);
      if (!next.view || !next.room) return;
      if (next.view === shownView && next.room === shownRoom && next.error === shownError) return;
      const viewChanged = next.view !== shownView;
      const errorGone = next.error === null && shownError !== null;
      const roomSame = next.room === shownRoom;
      shownError = next.error;
      // Clearing an error (the user acted) must not rebuild: that would re-arm the latch
      // mid-click. Just drop the toast.
      if (!viewChanged && roomSame && errorGone) {
        sceneHost.querySelector('.table-error')?.remove();
        return;
      }
      if (viewChanged || next.error) latch.pending = false;
      shownView = next.view;
      shownRoom = next.room;
      const model = tableModel(next.view, next.room);
      sceneHost.replaceChildren(
        renderTable(model, {
          hand,
          latch,
          error: next.error?.text ?? null,
          send: (m) => {
            deps.send(m);
          },
          onPlay: (cardId, faceDown) => {
            latch.pending = true;
            deps.send({ t: 'play_card', cardId, faceDown });
          },
          onPlayBlind: (slot) => {
            latch.pending = true;
            deps.send({ t: 'play_blind', slot });
          },
          onLeave: () => {
            deps.leave();
          },
        }),
      );
      for (const cb of [...listeners]) cb(next.view, ctx);
    },
    destroy() {
      bubbles.destroy();
      listeners.clear();
      eventListeners.clear();
      element.replaceChildren();
    },
  };
}
