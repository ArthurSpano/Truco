import type { AppState } from '../state/reducer.js';

/** A swappable screen: app.ts calls update() on every state change and destroy() when leaving it. */
export interface ScreenView {
  element: HTMLElement;
  update(state: AppState): void;
  /** Release listeners, timers and anything else outside `element`. */
  destroy(): void;
}
