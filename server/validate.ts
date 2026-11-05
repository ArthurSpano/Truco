import {
  MAX_MESSAGE_BYTES,
  MAX_NAME_LENGTH,
  QUICK_PHRASES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type PhraseId,
} from '../shared/protocol.js';
import type { CardId, GameMode, Seat } from '../shared/types.js';

export type ParseResult = { ok: true; msg: ClientMessage } | { ok: false; msg: string };

const CARD_ID = /^[4567QJKA23][chsd]$/;
const MODES: readonly number[] = [2, 4, 6];
const MAX_SEAT = 5;

type Fields = Record<string, unknown>;

const bad = (msg: string): ParseResult => ({ ok: false, msg });
const good = (msg: ClientMessage): ParseResult => ({ ok: true, msg });

function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMode(value: unknown): value is GameMode {
  return typeof value === 'number' && MODES.includes(value);
}

function isSeat(value: unknown): value is Seat {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SEAT;
}

function isCardId(value: unknown): value is CardId {
  return typeof value === 'string' && CARD_ID.test(value);
}

function isPhrase(value: unknown): value is PhraseId {
  return QUICK_PHRASES.some((phrase) => phrase === value);
}

/** Trimmed, inner whitespace collapsed; `null` if empty or too long. */
function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Trimmed and upper-cased; `null` unless it is a well-formed room code. */
function cleanCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`).test(code) ? code : null;
}

/** Validates the shape of one raw WebSocket text frame. Legality is checked later, against state. */
export function parseClientMessage(raw: string): ParseResult {
  if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) return bad('message too large');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return bad('invalid JSON');
  }
  if (!isObject(data) || typeof data.t !== 'string') return bad('expected an object with "t"');

  switch (data.t) {
    case 'create_room': {
      const name = cleanName(data.name);
      if (!isMode(data.mode)) return bad('invalid mode');
      if (name === null) return bad('invalid name');
      return good({ t: 'create_room', mode: data.mode, name });
    }
    case 'join_room': {
      const code = cleanCode(data.code);
      const name = cleanName(data.name);
      if (code === null) return bad('invalid room code');
      if (name === null) return bad('invalid name');
      return good({ t: 'join_room', code, name });
    }
    case 'rejoin':
      if (typeof data.token !== 'string' || data.token === '') return bad('invalid token');
      return good({ t: 'rejoin', token: data.token });
    case 'pick_seat':
      if (!isSeat(data.seat)) return bad('invalid seat');
      return good({ t: 'pick_seat', seat: data.seat });
    case 'ready':
    case 'call_truco':
      return good({ t: data.t });
    case 'play_card':
      if (!isCardId(data.cardId)) return bad('invalid card');
      if (data.faceDown === undefined) return good({ t: 'play_card', cardId: data.cardId });
      if (typeof data.faceDown !== 'boolean') return bad('invalid faceDown');
      return good({ t: 'play_card', cardId: data.cardId, faceDown: data.faceDown });
    case 'play_blind':
      if (!Number.isInteger(data.slot) || (data.slot as number) < 0) return bad('invalid slot');
      return good({ t: 'play_blind', slot: data.slot as number });
    case 'respond':
      if (data.answer !== 'accept' && data.answer !== 'run' && data.answer !== 'raise')
        return bad('invalid answer');
      return good({ t: 'respond', answer: data.answer });
    case 'mao11_decision':
      if (typeof data.play !== 'boolean') return bad('invalid decision');
      return good({ t: 'mao11_decision', play: data.play });
    case 'chat_quick':
      if (!isPhrase(data.phraseId)) return bad('invalid phrase');
      return good({ t: 'chat_quick', phraseId: data.phraseId });
    default:
      return bad('unknown message type');
  }
}
