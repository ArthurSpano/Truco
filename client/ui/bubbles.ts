import type { Bubble } from './bubbleModel.js';
import { el } from './dom.js';
import type { SeatGeometry } from './layout.js';
import { setVars } from './scene.js';

const SHOW_MS = 1300;

/**
 * Speech bubbles next to each player's avatar (V1 `.bub`). Mounts into the persistent fx layer
 * inside the scaled stage, so a bubble is placed with the same design-pixel geometry as the
 * seats and never needs measuring. Bubbles queue so two that arrive together appear one after
 * the other.
 */
export class BubbleLayer {
  private readonly queue: Bubble[] = [];
  private active: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    /** Bubble box for a seat at the current table, or null if that seat is not on it. */
    private readonly placeOf: (seat: number) => SeatGeometry['bubble'] | null,
  ) {}

  show(b: Bubble): void {
    if (this.destroyed) return;
    this.queue.push(b);
    if (!this.active) this.next();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.active?.remove();
    this.active = null;
    this.queue.length = 0;
  }

  private next(): void {
    let b: Bubble | undefined;
    let place: SeatGeometry['bubble'] | null = null;
    // Skip bubbles whose seat is not on the table right now.
    while ((b = this.queue.shift())) {
      place = this.placeOf(b.seat);
      if (place) break;
    }
    if (!b || !place) return;
    const node = el('div', `bub bub-${b.kind} align-${place.align}`, b.text);
    setVars(node, { x: place.x, y: place.y });
    this.host.append(node);
    this.active = node;
    this.timer = setTimeout(() => {
      node.remove();
      this.active = null;
      this.timer = null;
      this.next();
    }, SHOW_MS);
  }
}
