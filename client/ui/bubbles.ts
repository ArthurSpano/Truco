import type { Bubble } from './bubbleModel.js';
import { el } from './dom.js';

const SHOW_MS = 900;
const EDGE = 70;

/**
 * Speech bubbles over the chairs. Mounts into a persistent full-screen fixed layer and
 * positions each bubble from its chair's viewport rect at show time. Bubbles queue so two that
 * arrive together appear one after the other.
 */
export class BubbleLayer {
  private readonly queue: Bubble[] = [];
  private active: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly anchorOf: (seat: number) => HTMLElement | null,
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
    let anchor: HTMLElement | null = null;
    // Skip bubbles whose seat is not on the table right now.
    while ((b = this.queue.shift())) {
      anchor = this.anchorOf(b.seat);
      if (anchor) break;
    }
    if (!b || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, EDGE), window.innerWidth - EDGE);
    const y = Math.max(rect.top, 48);
    const node = el('div', `bubble bubble-${b.kind}`);
    node.append(el('span', 'bubble-text', b.text));
    node.style.left = `${String(x)}px`;
    node.style.top = `${String(y)}px`;
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
