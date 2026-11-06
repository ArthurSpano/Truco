import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../shared/types.js';
import { createSfx } from './sfx.js';
import { sfxFor } from './sfxModel.js';

const card = { rank: '3', suit: 'clubs' } as never;

describe('sfxFor', () => {
  it('maps events to sounds', () => {
    expect(sfxFor({ t: 'card_played', seat: 0, card }, 0)).toEqual(['slap']);
    expect(sfxFor({ t: 'truco_called', seat: 0, stake: 3 }, 0)).toEqual(['knock']);
    expect(sfxFor({ t: 'truco_answered', seat: 0, answer: 'accept', stake: 3 }, 0)).toEqual([
      'chime',
    ]);
    expect(sfxFor({ t: 'trick_won', winner: 0, leader: 0, cards: [] }, 0)).toEqual(['sweep']);
  });
  it('picks win or lose for match_won by team', () => {
    const e: GameEvent = { t: 'match_won', team: 1, scores: [3, 12] };
    expect(sfxFor(e, 1)).toEqual(['win']);
    expect(sfxFor(e, 0)).toEqual(['lose']);
  });
  it('ignores other events', () => {
    expect(sfxFor({ t: 'mao_de_onze_decided', seat: 0, play: true }, 0)).toEqual([]);
  });
});

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('truco.muted', initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

function fakeCtx() {
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      connect: vi.fn(() => n),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    n.gain = param();
    n.frequency = param();
    n.Q = param();
    n.detune = param();
    return n;
  };
  return {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(node),
    createBufferSource: vi.fn(node),
    createGain: vi.fn(node),
    createBiquadFilter: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(8000) })),
  };
}

describe('createSfx', () => {
  it('persists mute and a new instance reads it back', () => {
    const storage = fakeStorage();
    const a = createSfx(storage, () => fakeCtx() as never);
    expect(a.muted).toBe(false);
    a.setMuted(true);
    expect(storage.data.get('truco.muted')).toBe('1');
    expect(createSfx(storage, () => fakeCtx() as never).muted).toBe(true);
  });

  it('plays after unlock', () => {
    const ctx = fakeCtx();
    const sfx = createSfx(fakeStorage(), () => ctx as never);
    sfx.unlock();
    sfx.play('slap');
    expect(ctx.createBufferSource).toHaveBeenCalled();
    sfx.play('knock');
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('does no audio work while muted', () => {
    const factory = vi.fn(() => fakeCtx() as never);
    const sfx = createSfx(fakeStorage('1'), factory);
    sfx.unlock();
    sfx.startAmbience();
    sfx.play('slap');
    sfx.play('knock');
    expect(factory).not.toHaveBeenCalled();
  });

  it('silences an existing context when muted', () => {
    const ctx = fakeCtx();
    const sfx = createSfx(fakeStorage(), () => ctx as never);
    sfx.unlock();
    sfx.setMuted(true);
    ctx.createBufferSource.mockClear();
    ctx.createOscillator.mockClear();
    sfx.play('slap');
    sfx.play('win');
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('is silent when the factory throws', () => {
    const sfx = createSfx(fakeStorage(), () => {
      throw new Error('no audio');
    });
    expect(() => {
      sfx.unlock();
      sfx.startAmbience();
      sfx.play('chime');
      sfx.setMuted(true);
      sfx.setMuted(false);
    }).not.toThrow();
  });

  it('starts ambience once and stops it on mute', () => {
    const ctx = fakeCtx();
    const sfx = createSfx(fakeStorage(), () => ctx as never);
    sfx.unlock();
    sfx.startAmbience();
    sfx.startAmbience();
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    sfx.setMuted(true);
    sfx.setMuted(false);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
  });

  it('resumes a suspended context on every unlock', () => {
    const ctx = fakeCtx();
    ctx.state = 'suspended';
    const sfx = createSfx(fakeStorage(), () => ctx as never);
    sfx.unlock();
    sfx.unlock();
    expect(ctx.resume.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sfx.ready).toBe(false);
  });

  it('stopAmbience stops the murmur', () => {
    const ctx = fakeCtx();
    const sfx = createSfx(fakeStorage(), () => ctx as never);
    sfx.unlock();
    sfx.startAmbience();
    sfx.stopAmbience();
    sfx.unlock();
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
  });
});
