import type { GameEvent } from '../../shared/types.js';
import { stakeName } from './actionBarModel.js';

export interface Bubble {
  seat: number;
  text: string;
  kind: 'call' | 'accept' | 'run' | 'chat';
}

/** Maps one server event to the speech bubble it should show, if any. */
export function bubbleFor(event: GameEvent): Bubble | null {
  switch (event.t) {
    case 'truco_called':
      return { seat: event.seat, text: `${stakeName(event.stake)}!`, kind: 'call' };
    case 'truco_answered':
      if (event.answer === 'accept') return { seat: event.seat, text: 'Aceito!', kind: 'accept' };
      if (event.answer === 'run') return { seat: event.seat, text: 'Corre!', kind: 'run' };
      return { seat: event.seat, text: `${stakeName(event.stake)}!`, kind: 'call' };
    case 'mao_de_onze_decided':
      return event.play
        ? { seat: event.seat, text: 'Vamos jogar!', kind: 'accept' }
        : { seat: event.seat, text: 'Corre!', kind: 'run' };
    default:
      return null;
  }
}

/** Bubbles for a list of events, in order, with non-speech events dropped. */
export function bubblesFor(events: readonly GameEvent[]): Bubble[] {
  const out: Bubble[] = [];
  for (const e of events) {
    const b = bubbleFor(e);
    if (b) out.push(b);
  }
  return out;
}

/**
 * The events received since `lastSeq`. `events` holds the latest burst only (it is replaced when
 * a new burst starts), so take the tail of length `eventSeq - lastSeq`, or all of it if more
 * than that were missed.
 */
export function newEvents(
  events: readonly GameEvent[],
  eventSeq: number,
  lastSeq: number,
): GameEvent[] {
  const fresh = eventSeq - lastSeq;
  if (fresh <= 0) return [];
  return events.slice(Math.max(0, events.length - fresh));
}
