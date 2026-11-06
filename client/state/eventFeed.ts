import type { GameEvent } from '../../shared/types.js';
import type { AppState } from './reducer.js';

/**
 * The tail of `list` that arrived since `lastSeq`. `list` holds only the latest burst (events) or
 * the latest window (chat), so take the last `seq - lastSeq` entries, or all of it if more than
 * that were missed.
 */
function tail<T>(list: readonly T[], seq: number, lastSeq: number): T[] {
  const fresh = seq - lastSeq;
  if (fresh <= 0) return [];
  return list.slice(Math.max(0, list.length - fresh));
}

/** The events received since `lastSeq` (see `AppState.eventSeq`). */
export function newEvents(
  events: readonly GameEvent[],
  eventSeq: number,
  lastSeq: number,
): GameEvent[] {
  return tail(events, eventSeq, lastSeq);
}

/** The chat entries received since `lastSeq` (see `AppState.chatSeq`). */
export function newChat(
  chat: AppState['chat'],
  chatSeq: number,
  lastSeq: number,
): AppState['chat'] {
  return tail(chat, chatSeq, lastSeq);
}

/**
 * A cursor over `AppState.events`: each call returns the events that arrived since the previous
 * call. The first call seeds the cursor and returns [] so mounting or reconnecting never replays
 * old events. A sequence that went backwards means the state was reset (leave()), so the cursor
 * restarts at 0 and what is there counts as new.
 *
 * Note: the server sends a burst's events BEFORE its `game_state`, so a subscriber fed from this
 * cursor fires against the old DOM; `onRendered` fires against the new one.
 */
export function createEventFeed(): (s: AppState) => GameEvent[] {
  let last: number | null = null;
  return (s) => {
    if (last === null) {
      last = s.eventSeq;
      return [];
    }
    if (s.eventSeq < last) last = 0;
    const out = newEvents(s.events, s.eventSeq, last);
    last = s.eventSeq;
    return out;
  };
}

/** Same cursor, for `AppState.chat` / `chatSeq`. */
export function createChatFeed(): (s: AppState) => AppState['chat'] {
  let last: number | null = null;
  return (s) => {
    if (last === null) {
      last = s.chatSeq;
      return [];
    }
    if (s.chatSeq < last) last = 0;
    const out = newChat(s.chat, s.chatSeq, last);
    last = s.chatSeq;
    return out;
  };
}
