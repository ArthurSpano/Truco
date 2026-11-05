import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES } from '../shared/protocol.js';
import { parseClientMessage } from './validate.js';

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it.each([
    { t: 'create_room', mode: 4, name: 'Ana' },
    { t: 'join_room', code: 'BAR7', name: 'Beto' },
    { t: 'rejoin', token: 'abc' },
    { t: 'pick_seat', seat: 2 },
    { t: 'ready' },
    { t: 'play_card', cardId: 'Ac', faceDown: true },
    { t: 'play_card', cardId: '7d' },
    { t: 'play_blind', slot: 0 },
    { t: 'call_truco' },
    { t: 'respond', answer: 'raise' },
    { t: 'mao11_decision', play: false },
    { t: 'chat_quick', phraseId: 'bora' },
  ])('accepts %j', (msg) => {
    expect(parse(msg)).toEqual({ ok: true, msg });
  });

  it('normalizes room code and name', () => {
    expect(parse({ t: 'join_room', code: ' bar7 ', name: '  Zé   Carlos ' })).toEqual({
      ok: true,
      msg: { t: 'join_room', code: 'BAR7', name: 'Zé Carlos' },
    });
  });

  it.each(['not json', 'null', '[]', '42', '{}'])('rejects raw %s', (raw) => {
    expect(parseClientMessage(raw).ok).toBe(false);
  });

  it.each([
    { t: 'nope' },
    { t: 'create_room', mode: 3, name: 'A' },
    { t: 'create_room', mode: '4', name: 'A' },
    { t: 'create_room', mode: 4, name: '' },
    { t: 'create_room', mode: 4, name: '   ' },
    { t: 'create_room', mode: 4, name: 'x'.repeat(17) },
    { t: 'join_room', code: 'ABC', name: 'A' },
    { t: 'join_room', code: 'AB!C', name: 'A' },
    { t: 'play_card', cardId: '1x' },
    { t: 'play_card', cardId: '10c' },
    { t: 'play_card', cardId: 'Ac', faceDown: 'yes' },
    { t: 'play_blind', slot: -1 },
    { t: 'play_blind', slot: 1.5 },
    { t: 'pick_seat', seat: '1' },
    { t: 'respond', answer: 'maybe' },
    { t: 'mao11_decision', play: 'true' },
    { t: 'chat_quick', phraseId: 'unknown' },
    { t: 'rejoin', token: '' },
  ])('rejects %j', (msg) => {
    expect(parse(msg).ok).toBe(false);
  });

  it('rejects oversized messages even when valid JSON', () => {
    const raw = JSON.stringify({ t: 'rejoin', token: 'x'.repeat(MAX_MESSAGE_BYTES) });
    expect(parseClientMessage(raw).ok).toBe(false);
  });
});
