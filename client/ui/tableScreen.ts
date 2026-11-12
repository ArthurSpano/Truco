import type { ClientMessage, RoomState } from '../../shared/protocol.js';
import type { GameEvent, GameView } from '../../shared/types.js';
import { createEventFeed } from '../state/eventFeed.js';
import type { AppState } from '../state/reducer.js';
import { Animator, type AnimContext } from './animations.js';
import { animationsForBurst, scheduleBurst } from './animationModel.js';
import { renderBackdrop } from './backdrop.js';
import { BubbleLayer } from './bubbles.js';
import { bubblesFor } from './bubbleModel.js';
import { el } from './dom.js';
import { createHandStore } from './handFan.js';
import type { SendLatch } from './hand.js';
import { createThemeStore, SCENE_THEMES, type SceneTheme } from './sceneTheme.js';
import { renderThemeButton } from './themeButton.js';
import { anchorFor, relativeIndex, seatGeometry } from './layout.js';
import type { ScreenView } from './screen.js';
import { renderTable } from './table.js';
import { tableModel } from './tableModel.js';

export interface TableScreen extends ScreenView {
  /** Persistent overlay inside the scaled stage; survives snapshots. */
  fx: HTMLElement;
  /**
   * Registers a callback for newly arrived events (one shared cursor for bubbles and
   * animations); returns an unsubscribe function. Events arrive BEFORE their burst's
   * `game_state`, one message at a time, so this fires against the OLD view.
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

/**
 * Table screen. Layout (see styles/table.css):
 *
 *   .table-screen.v1   full viewport, wooden-plank floor; carries a theme-<scene> class
 *     .backdrop        scenery behind the stage, replaced when the theme changes
 *     .stage           the 390 x 844 design artboard, scaled by --u and centred
 *       .scene-host    rebuilt from every snapshot
 *       .fx-layer      persistent: bubbles, held trick, banner, toast, flash
 *     .glow            vignette over the whole viewport
 *     .overlay-host    rebuilt: full-viewport dialogs (mão de onze, game over)
 *     .theme-btn       cycles the scene (taverna, praça, gramado)
 */
export function createTableScreen(deps: TableDeps): TableScreen {
  const themes = createThemeStore();
  const element = el('div', `table-screen v1 floor theme-${themes.get()}`);
  let backdrop = renderBackdrop(themes.get());
  const stage = el('div', 'stage');
  const sceneHost = el('div', 'scene-host');
  const glow = el('div', 'glow');
  const fx = el('div', 'fx-layer');
  fx.setAttribute('aria-hidden', 'true');
  glow.setAttribute('aria-hidden', 'true');
  const overlayHost = el('div', 'overlay-host');
  stage.append(sceneHost, fx);
  /** Swaps only the theme class and the backdrop; the table, hand and animator are untouched. */
  const applyTheme = (t: SceneTheme): void => {
    for (const other of SCENE_THEMES) element.classList.toggle(`theme-${other}`, other === t);
    const next = renderBackdrop(t);
    backdrop.replaceWith(next);
    backdrop = next;
  };
  const themeButton = renderThemeButton(themes, applyTheme);
  element.append(backdrop, stage, glow, overlayHost, themeButton);

  let shownView: GameView | null = null;
  let shownRoom: RoomState | null = null;
  let shownError: AppState['error'] = null;
  const hand = createHandStore();
  const latch: SendLatch = { pending: false };

  const bubbles = new BubbleLayer(fx, (seat) => {
    const view = shownView;
    if (!view || seat < 0 || seat >= view.mode) return null;
    const anchor = anchorFor(view.mode, relativeIndex(view.seat, seat, view.mode));
    return seatGeometry(view.mode, anchor).bubble;
  });
  const animator = new Animator(stage, () => sceneHost, fx);

  const eventListeners = new Set<(events: GameEvent[], state: AppState) => void>();
  // Seeded from the first state seen, so mounting or reconnecting never replays old events.
  const nextEvents = createEventFeed();
  const onEvents: TableScreen['onEvents'] = (cb) => {
    eventListeners.add(cb);
    return () => {
      eventListeners.delete(cb);
    };
  };

  // The burst being collected: events since the last snapshot, plus the view they belong to.
  let burst: GameEvent[] = [];
  let burstView: GameView | null = null;
  onEvents((events, state) => {
    for (const b of bubblesFor(events)) bubbles.show(b);
    if (burst.length === 0) burstView = state.view;
    burst.push(...events);
  });

  /** Runs on every state update (even ones that do not rebuild the table). */
  const feedEvents = (state: AppState): void => {
    const events = nextEvents(state);
    if (events.length === 0) return;
    for (const cb of [...eventListeners]) cb(events, state);
  };

  /** Plays the collected burst against the freshly rendered snapshot. */
  const flushBurst = (view: GameView): void => {
    const events = burst;
    const before = burstView ?? view;
    burst = [];
    burstView = null;
    if (events.length === 0) return;
    const ctx: AnimContext = { mode: view.mode, manilha: before.manilha };
    const anims = animationsForBurst(events, view.seat, view.team, view.mode);
    animator.run(scheduleBurst(anims), ctx);
  };

  return {
    element,
    fx,
    latch,
    onEvents,
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
      const { scene, overlay } = renderTable(model, {
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
      });
      sceneHost.replaceChildren(scene);
      if (overlay) overlayHost.replaceChildren(overlay);
      else overlayHost.replaceChildren();
      if (viewChanged) flushBurst(next.view);
    },
    destroy() {
      bubbles.destroy();
      animator.destroy();
      eventListeners.clear();
      element.replaceChildren();
    },
  };
}
