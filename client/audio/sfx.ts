import type { SfxName } from './sfxModel.js';

export interface Sfx {
  /** Creates/resumes the AudioContext; call from a user gesture. No-op while muted. */
  unlock(): void;
  play(name: SfxName): void;
  /** True once the context exists and is running (gestures can stop retrying). */
  readonly ready: boolean;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

const STORAGE_KEY = 'truco.muted';

function defaultFactory(): AudioContext {
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : w.webkitAudioContext;
  if (!Ctor) throw new Error('AudioContext unavailable');
  return new Ctor();
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Procedural sound effects (no audio files). Everything is a silent no-op when the browser has no
 * AudioContext, and while muted nothing is created or scheduled.
 */
export function createSfx(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage(),
  ctxFactory: () => AudioContext = defaultFactory,
): Sfx {
  let muted = false;
  try {
    muted = storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage may be blocked; default to sound on.
  }
  let armed = false; // a user gesture has happened
  let broken = false; // the context could not be created
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  function context(): AudioContext | null {
    if (muted || !armed || broken) return null;
    if (!ctx) {
      try {
        ctx = ctxFactory();
      } catch {
        broken = true;
        return null;
      }
    }
    // 'interrupted' is iOS Safari's suspended-by-system state.
    const state: string = ctx.state;
    if (state === 'suspended' || state === 'interrupted') {
      void Promise.resolve(ctx.resume()).catch(() => undefined);
    }
    return ctx;
  }

  function noiseBuffer(c: AudioContext): AudioBuffer {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  /** A noise burst through a band-pass whose centre can sweep; gain decays over `dur` seconds. */
  function burst(c: AudioContext, from: number, to: number, dur: number, peak: number): void {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(c: AudioContext, freq: number, at: number, dur: number, peak: number): void {
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    get muted() {
      return muted;
    },
    get ready() {
      return ctx !== null && ctx.state === 'running';
    },
    unlock() {
      armed = true;
      context();
    },
    play(name) {
      const c = context();
      if (!c) return;
      switch (name) {
        case 'slap':
          burst(c, 2200, 900, 0.09, 0.6);
          break;
        case 'knock':
          tone(c, 90, 0, 0.14, 0.9);
          tone(c, 90, 0.12, 0.14, 0.9);
          break;
        case 'chime':
          tone(c, 660, 0, 0.18, 0.25);
          tone(c, 880, 0.1, 0.25, 0.25);
          break;
        case 'sweep':
          burst(c, 500, 2800, 0.25, 0.35);
          break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) => {
            tone(c, f, i * 0.12, 0.3, 0.25);
          });
          break;
        case 'lose':
          [392, 330, 262, 196].forEach((f, i) => {
            tone(c, f, i * 0.14, 0.35, 0.25);
          });
          break;
      }
    },
    setMuted(value) {
      muted = value;
      try {
        storage?.setItem(STORAGE_KEY, value ? '1' : '0');
      } catch {
        // Not persisted; still applies for this session.
      }
    },
  };
}
