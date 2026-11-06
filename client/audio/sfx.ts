import type { SfxName } from './sfxModel.js';

export interface Sfx {
  /** Creates/resumes the AudioContext; call from a user gesture. No-op while muted. */
  unlock(): void;
  play(name: SfxName): void;
  /** Starts the looping crowd murmur (once); silent while muted. */
  startAmbience(): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

const STORAGE_KEY = 'truco.muted';

function defaultFactory(): AudioContext {
  if (typeof AudioContext === 'undefined') throw new Error('AudioContext unavailable');
  return new AudioContext();
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
  let wantAmbience = false;
  let ambience: AudioBufferSourceNode | null = null;

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
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
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

  function syncAmbience(): void {
    if (muted || !wantAmbience) {
      if (ambience) {
        try {
          ambience.stop();
        } catch {
          // already stopped
        }
        ambience.disconnect();
        ambience = null;
      }
      return;
    }
    if (ambience) return;
    const c = context();
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.7;
    const gain = c.createGain();
    gain.gain.value = 0.05;
    // Slow wobble so the murmur breathes.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.15;
    const depth = c.createGain();
    depth.gain.value = 0.02;
    lfo.connect(depth).connect(gain.gain);
    lfo.start();
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    const stop = src.stop.bind(src);
    src.stop = (when?: number): void => {
      stop(when);
      lfo.stop();
    };
    ambience = src;
  }

  return {
    get muted() {
      return muted;
    },
    unlock() {
      armed = true;
      context();
      syncAmbience();
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
    startAmbience() {
      wantAmbience = true;
      syncAmbience();
    },
    setMuted(value) {
      muted = value;
      try {
        storage?.setItem(STORAGE_KEY, value ? '1' : '0');
      } catch {
        // Not persisted; still applies for this session.
      }
      syncAmbience();
    },
  };
}
