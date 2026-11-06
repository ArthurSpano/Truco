import type { Animation } from './animationModel.js';
import { el } from './dom.js';

/** A class is always removed after this long, even if `animationend` never fires. */
const SAFETY_MS = 1000;

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Adds `cls` to `node` and removes it when the node's own animation ends or after the safety
 * timeout, whichever comes first. `onDone` runs once, at that point.
 */
function withClass(node: HTMLElement, cls: string, onDone?: () => void): void {
  node.classList.add(cls);
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (timer !== null) clearTimeout(timer);
    node.removeEventListener('animationend', onEnd);
    node.classList.remove(cls);
    onDone?.();
  };
  const onEnd = (e: Event): void => {
    if (e.target === node) finish();
  };
  node.addEventListener('animationend', onEnd);
  timer = setTimeout(finish, SAFETY_MS);
}

/**
 * Applies one animation to the CURRENT DOM under `table` (the scene host). Cards are looked up
 * by anchor (one per seat), so a re-render never leaves a duplicate. A target that is not on
 * the table is skipped silently. `fx` is the persistent overlay for the truco flash.
 */
export function play(animation: Animation, table: HTMLElement, fx?: HTMLElement): void {
  if (reducedMotion()) return;
  switch (animation.kind) {
    case 'slide': {
      const slots = table.querySelectorAll<HTMLElement>(`.played-slot.anchor-${animation.anchor}`);
      // Prefer the live trick; the last card of a trick is already in `.last-trick` by then.
      const slot = [...slots].find((s) => !s.classList.contains('last-trick')) ?? slots[0];
      const card = slot?.firstElementChild;
      if (card instanceof HTMLElement) withClass(card, `slide-from-${animation.anchor}`);
      return;
    }
    case 'sweep': {
      const cls = animation.toward === null ? 'sweep-fade' : `sweep-to-${animation.toward}`;
      for (const slot of table.querySelectorAll<HTMLElement>('.played-slot.last-trick')) {
        withClass(slot, cls, () => {
          slot.classList.add('swept');
        });
      }
      return;
    }
    case 'shake': {
      withClass(table, `shake-${String(animation.strength)}`);
      if (fx) {
        const flash = el('div', 'truco-flash');
        fx.append(flash);
        flash.addEventListener('animationend', () => {
          flash.remove();
        });
        setTimeout(() => {
          flash.remove();
        }, SAFETY_MS);
      }
    }
  }
}

/**
 * Animations are computed from events (which arrive before their snapshot) and applied once
 * the snapshot has rendered, so they always run against the new DOM.
 */
export class AnimationQueue {
  private pending: Animation[] = [];

  constructor(
    private readonly table: HTMLElement,
    private readonly fx: HTMLElement,
  ) {}

  enqueue(animations: Animation[]): void {
    this.pending.push(...animations);
  }

  /** Plays everything queued against the DOM as it is now, then empties the queue. */
  flush(): void {
    const batch = this.pending;
    this.pending = [];
    for (const a of batch) play(a, this.table, this.fx);
  }

  destroy(): void {
    this.pending = [];
  }
}
