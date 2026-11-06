import type { Bubble } from './bubbleModel.js';
import { el } from './dom.js';

const SHOW_MS = 900;
const MARGIN = 8;

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
    const node = el('div', `bubble bubble-${b.kind}`);
    node.append(el('span', 'bubble-text', b.text));
    this.host.append(node);
    // Measure in place, then clamp: horizontally inside the viewport, and below the chair when
    // there is no room above it (the bubble is translated by (-50%, -100%) from left/top).
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const vw = window.innerWidth;
    const cx = rect.left + rect.width / 2;
    const x =
      w + 2 * MARGIN >= vw ? vw / 2 : Math.min(Math.max(cx, w / 2 + MARGIN), vw - w / 2 - MARGIN);
    const top = safeTop() + MARGIN;
    const y = rect.top - h < top ? rect.bottom + h : rect.top;
    node.style.left = `${String(x)}px`;
    node.style.top = `${String(y)}px`;
    this.active = node;
    this.timer = setTimeout(() => {
      node.remove();
      this.active = null;
      this.timer = null;
      this.next();
    }, SHOW_MS);
  }
}

/** Top safe-area inset in px (0 where unsupported). */
function safeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}
