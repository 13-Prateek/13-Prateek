/**
 * Master bus, voice management and synth primitives (Web Audio, no assets).
 * Works on any BaseAudioContext, so the same code renders offline for tests.
 *
 *   voices → panner → sfx ─┐
 *   music  → duck ─────────┼→ master → compressor → limiter → soft-clip → out
 *   reverb send → convolver┘
 */

/* ---- Tuning knobs ---- */
/** Hard cap on simultaneous SFX voices. */
export const MAX_VOICES = 28;
/** Default master volume (0..1). */
export const DEFAULT_MASTER = 0.8;
/** Music level relative to SFX. */
export const MUSIC_LEVEL = 0.3;
/** Random pitch spread so repeats don't machine-gun (±5%). */
export const PITCH_JITTER = 0.05;

export interface Voice {
  key: string;
  prio: number;
  start: number;
  end: number;
  out: GainNode;
  srcs: AudioScheduledSourceNode[];
}

export interface VoiceOpts {
  /** -1..1 stereo position. */
  pan?: number;
  /** Max simultaneous voices with this key (oldest is stolen). */
  max?: number;
  /** Higher survives voice stealing; low-priority sounds are dropped when full. */
  prio?: number;
  /** 0..1 reverb send. */
  reverb?: number;
  gain?: number;
}

export const jitter = (amt = PITCH_JITTER): number => 1 + (Math.random() * 2 - 1) * amt;

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  return c;
}

function driveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export type Mixer = ReturnType<typeof createMixer>;

export function createMixer(ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
  const master = ctx.createGain();
  master.gain.value = DEFAULT_MASTER;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = '2x';
  master.connect(comp).connect(limiter).connect(clip).connect(destination);

  const sfx = ctx.createGain();
  sfx.connect(master);
  const duck = ctx.createGain();
  const music = ctx.createGain();
  music.gain.value = MUSIC_LEVEL;
  music.connect(duck).connect(master);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.4, 3);
  const reverbIn = ctx.createGain();
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.4;
  reverbIn.connect(reverb).connect(reverbOut).connect(master);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const crunchCurve = driveCurve(18);

  const voices: Voice[] = [];
  const stats = { played: 0, stolen: 0, dropped: 0, peakVoices: 0 };

  function kill(v: Voice, at: number) {
    v.out.gain.cancelScheduledValues(at);
    v.out.gain.setTargetAtTime(0, at, 0.012);
    for (const s of v.srcs) { try { s.stop(at + 0.08); } catch { /* already stopped */ } }
    v.end = Math.min(v.end, at + 0.08);
  }

  /** Allocate a voice, enforcing per-key and global limits. Returns null if dropped. */
  function voice(key: string, at: number, dur: number, o: VoiceOpts = {}): Voice | null {
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= at) voices.splice(i, 1);
    const prio = o.prio ?? 1;
    const same = voices.filter((v) => v.key === key);
    if (same.length >= (o.max ?? 4)) { kill(same[0], at); voices.splice(voices.indexOf(same[0]), 1); stats.stolen++; }
    if (voices.length >= MAX_VOICES) {
      let victim = -1;
      for (let i = 0; i < voices.length; i++) if (voices[i].prio <= prio && (victim < 0 || voices[i].prio < voices[victim].prio)) victim = i;
      if (victim < 0) { stats.dropped++; return null; }
      kill(voices[victim], at); voices.splice(victim, 1); stats.stolen++;
    }
    const out = ctx.createGain();
    out.gain.value = o.gain ?? 1;
    let node: AudioNode = out;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(p);
      node = p;
    }
    node.connect(sfx);
    if (o.reverb) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      node.connect(send).connect(reverbIn);
    }
    const v: Voice = { key, prio, start: at, end: at + dur + 0.1, out, srcs: [] };
    voices.push(v);
    stats.played++;
    stats.peakVoices = Math.max(stats.peakVoices, voices.length);
    return v;
  }

  /** Gain envelope: attack to `peak`, exponential decay to silence at t+dur. */
  function env(t: number, dur: number, peak: number, attack = 0.002): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.005, dur));
    return g;
  }

  /** Oscillator with optional exponential pitch sweep f0→f1. */
  function tone(v: Voice, type: OscillatorType, t: number, dur: number, f0: number, f1: number | null, peak: number,
    o: { attack?: number; filter?: number; detune?: number; to?: AudioNode } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = env(t, dur, peak, o.attack);
    let n: AudioNode = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; n = n.connect(f); }
    n.connect(g).connect(o.to ?? v.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    v.srcs.push(osc);
    return osc;
  }

  /** Filtered noise burst, optional filter sweep and drive (crunch). */
  function noise(v: Voice, t: number, dur: number, peak: number,
    o: { type?: BiquadFilterType; f0?: number; f1?: number; q?: number; attack?: number; drive?: boolean; to?: AudioNode } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f0 ?? 1200, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    f.Q.value = o.q ?? 1;
    let n: AudioNode = src.connect(f);
    if (o.drive) { const ws = ctx.createWaveShaper(); ws.curve = crunchCurve; n = n.connect(ws); }
    n.connect(env(t, dur, peak, o.attack)).connect(o.to ?? v.out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    v.srcs.push(src);
  }

  return {
    ctx, master, sfx, music, duck, reverbIn, voices, stats,
    voice, tone, noise, env, kill,
    setMaster(vol: number, at = ctx.currentTime) {
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), at, 0.03);
    },
    /** Briefly lower the music under a big impact. */
    duckMusic(at: number, depth = 0.4, hold = 0.25) {
      duck.gain.cancelScheduledValues(at);
      duck.gain.setTargetAtTime(depth, at, 0.01);
      duck.gain.setTargetAtTime(1, at + hold, 0.3);
    },
    activeVoices(at = ctx.currentTime) { return voices.filter((v) => v.end > at).length; },
  };
}
