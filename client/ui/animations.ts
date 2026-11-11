import type { GameMode, Rank } from '../../shared/types.js';
import { TRICK_HOLD_MS, TRICK_SWEEP_MS, type Animation, type Toast } from './animationModel.js';
import { el } from './dom.js';
import { TABLE_CENTRE, seatGeometry } from './layout.js';
import { renderPlayed, setVars } from './scene.js';

/** A class is always removed after this long, even if `animationend` never fires. */
const SAFETY_MS = 1200;
/** How long the hand-result toast stays up (the mockup holds the hand-over for 2.5s). */
const TOAST_MS = 2400;
/** Deal-in is .7s plus a .12s stagger per card. */
const DEAL_MS = 1100;

/** What the animator needs to draw cards outside the snapshot (a trick's last card). */
export interface AnimContext {
  mode: GameMode;
  /** Manilha of the hand the burst belongs to (the snapshot may already be the next hand). */
  manilha: Rank;
}

/**
 * Adds `cls` to `node` and removes it when the node's own animation ends or after `ms`,
 * whichever comes first.
 */
function withClass(node: HTMLElement, cls: string, ms = SAFETY_MS): void {
  node.classList.add(cls);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = (): void => {
    if (timer !== null) clearTimeout(timer);
    node.removeEventListener('animationend', onEnd);
    node.classList.remove(cls);
  };
  const onEnd = (e: Event): void => {
    if (e.target === node) finish();
  };
  node.addEventListener('animationend', onEnd);
  timer = setTimeout(finish, ms);
}

/**
 * Plays the V1 animations. Card fly-ins and the deal act on the CURRENT scene DOM (looked up
 * through `scene()`, which is replaced on every snapshot); the finished trick, banner, toast and
 * truco flash live in `fx`, a persistent layer inside the scaled stage, so a snapshot never cuts
 * them short. `stage` is what shakes.
 */
export class Animator {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private hold: { node: HTMLElement; sweep: () => void } | null = null;
  private banner: HTMLElement | null = null;
  private toast: HTMLElement | null = null;

  constructor(
    private readonly stage: HTMLElement,
    private readonly scene: () => HTMLElement,
    private readonly fx: HTMLElement,
  ) {}

  /** Runs a scheduled burst (see `scheduleBurst`): `at` is ms from now. */
  run(burst: readonly { at: number; anim: Animation }[], ctx: AnimContext): void {
    for (const { at, anim } of burst) {
      // Cards of a hand dealt later in the burst stay hidden until their deal-in starts.
      if (anim.kind === 'deal' && at > 0) this.hideForDeal();
      if (at <= 0) this.apply(anim, ctx);
      else
        this.later(at, () => {
          this.apply(anim, ctx);
        });
    }
  }

  destroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.hold?.node.remove();
    this.hold = null;
    this.banner?.remove();
    this.toast?.remove();
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private apply(anim: Animation, ctx: AnimContext): void {
    switch (anim.kind) {
      case 'slide': {
        // A new card on the felt: whatever trick was still held sweeps away now.
        this.hold?.sweep();
        const node = this.scene().querySelector<HTMLElement>(
          `.played .tc[data-anchor="${anim.anchor}"]`,
        );
        if (node) withClass(node, 'fly');
        return;
      }
      case 'trick':
        this.showTrick(anim, ctx);
        return;
      case 'shake': {
        withClass(this.stage, `shake-${String(anim.strength)}`);
        const flash = el('div', 'truco-flash');
        this.fx.append(flash);
        this.later(SAFETY_MS, () => {
          flash.remove();
        });
        return;
      }
      case 'banner': {
        this.banner?.remove();
        const node = el('div', 'call-banner', anim.text);
        this.fx.append(node);
        this.banner = node;
        this.later(SAFETY_MS, () => {
          node.remove();
          if (this.banner === node) this.banner = null;
        });
        return;
      }
      case 'toast':
        this.showToast(anim.toast);
        return;
      case 'deal': {
        const scene = this.scene();
        for (const node of scene.querySelectorAll<HTMLElement>('.hand, .backs')) {
          node.classList.remove('predeal');
          withClass(node, 'dealing', DEAL_MS);
        }
        return;
      }
    }
  }

  private hideForDeal(): void {
    for (const node of this.scene().querySelectorAll<HTMLElement>('.hand, .backs')) {
      node.classList.add('predeal');
    }
  }

  /** The finished trick: result glow on the felt, then a sweep toward the winner's chair. */
  private showTrick(anim: Extract<Animation, { kind: 'trick' }>, ctx: AnimContext): void {
    this.hold?.node.remove();
    const node = el('div', `hold mode-${String(ctx.mode)}`);
    node.setAttribute('aria-hidden', 'true');
    for (const c of anim.cards) {
      const card = renderPlayed(ctx.mode, c.anchor, c.card, ctx.manilha, c.result);
      if (c.anchor === anim.flyIn) withClass(card, 'fly');
      node.append(card);
    }
    this.fx.append(node);

    let swept = false;
    const sweep = (): void => {
      if (swept) return;
      swept = true;
      if (anim.toward) {
        const { chair } = seatGeometry(ctx.mode, anim.toward);
        setVars(node, { tx: chair.x - TABLE_CENTRE.x, ty: chair.y - TABLE_CENTRE.y });
        node.classList.add('sweep');
      } else {
        node.classList.add('fade');
      }
      this.later(TRICK_SWEEP_MS, () => {
        node.remove();
        if (this.hold?.node === node) this.hold = null;
      });
    };
    this.hold = { node, sweep };
    this.later(TRICK_HOLD_MS, sweep);
  }

  private showToast(t: Toast): void {
    this.toast?.remove();
    const node = el('div', `toast glass ${t.ours ? 'ours' : 'theirs'}`);
    node.setAttribute('role', 'status');
    node.append(
      el('div', 'a', t.title),
      el('div', 'p', `+${String(t.points)}`),
      el('div', 'w', t.why),
    );
    this.fx.append(node);
    this.toast = node;
    this.later(TOAST_MS, () => {
      node.remove();
      if (this.toast === node) this.toast = null;
    });
  }
}
