/**
 * Procedural music loop: A-minor synthwave, 4-bar progression Am–F–C–G.
 * Intensity 0 = calm pad + bass swells, 1 = combat (drums, driving bass),
 * 2 = final round / low HP / sudden death (16th arp, snare, brighter mix).
 * A lookahead scheduler calls scheduleUntil(); offline tests call it directly.
 */
import type { Mixer } from './mixer';

/* ---- Tuning knobs ---- */
export const MUSIC_BPM = 128;

const STEPS_PER_BAR = 16;
// Chord roots (MIDI) and triad intervals for Am, F, C, G.
const CHORDS: ReadonlyArray<[number, readonly number[]]> = [
  [45, [0, 3, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]], [43, [0, 4, 7]],
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export type Music = ReturnType<typeof createMusic>;

export function createMusic(m: Mixer) {
  const ctx = m.ctx;
  const stepDur = 60 / MUSIC_BPM / 4;
  let level: 0 | 1 | 2 = 0;
  let playing = false;
  let nextTime = 0;
  let step = 0;

  const bus = ctx.createGain();
  bus.connect(m.music);
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 700;
  padFilter.Q.value = 0.7;
  padFilter.connect(bus);

  const PAD_CUTOFF = [650, 1200, 2200];

  function note(type: OscillatorType, t: number, dur: number, freq: number, peak: number, to: AudioNode,
    o: { attack?: number; release?: number; detune?: number; cutoff?: number; sweepTo?: number } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.sweepTo) osc.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005, r = o.release ?? dur * 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0, t + dur);
    let n: AudioNode = osc;
    if (o.cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff; n = osc.connect(f); }
    n.connect(g).connect(to);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function hat(t: number, peak: number, dur = 0.04) {
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(f).connect(g).connect(bus);
    src.start(t);
  }

  function snare(t: number, peak: number) {
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    note('triangle', t, 0.1, 190, peak * 0.5, bus, { release: 0.09 });
  }

  function kickDrum(t: number, peak: number) {
    note('sine', t, 0.28, 150, peak, bus, { sweepTo: 42, release: 0.26 });
  }

  function scheduleStep(i: number, t: number) {
    const bar = Math.floor(i / STEPS_PER_BAR) % CHORDS.length;
    const s = i % STEPS_PER_BAR;
    const [root, triad] = CHORDS[bar];
    const barDur = stepDur * STEPS_PER_BAR;

    // Pad: chord at the start of each bar (all levels).
    if (s === 0) {
      padFilter.frequency.setTargetAtTime(PAD_CUTOFF[level], t, 0.4);
      for (const iv of triad) {
        const f = midi(root + 12 + iv);
        note('sawtooth', t, barDur * 1.02, f, 0.035, padFilter, { attack: 0.35, release: 0.4, detune: -8 });
        note('sawtooth', t, barDur * 1.02, f, 0.035, padFilter, { attack: 0.35, release: 0.4, detune: 8 });
      }
    }
    // Bass
    if (level === 0) {
      if (s === 0) note('triangle', t, barDur * 0.9, midi(root - 12), 0.22, bus, { attack: 0.08, release: 0.6 });
    } else {
      const pattern = level === 2 ? true : s % 2 === 0;
      if (pattern) {
        const oct = level === 2 && s % 4 === 2 ? 12 : 0;
        const accent = s % 4 === 0 ? 1 : 0.7;
        note('sawtooth', t, stepDur * 1.5, midi(root - 12 + oct), 0.16 * accent, bus, { cutoff: level === 2 ? 900 : 600, release: stepDur });
      }
    }
    // Drums
    if (level >= 1) {
      if (s % 4 === 0 || (level === 2 && s === 14)) kickDrum(t, 0.55);
      if (s % 4 === 2) hat(t, 0.12);
      if (level === 2 && s % 2 === 1) hat(t, 0.06, 0.025);
      if (s === 4 || s === 12) snare(t, level === 2 ? 0.32 : 0.18);
    }
    // Arp (level 2)
    if (level === 2) {
      const seq = [0, 1, 2, 1, 2, 3, 2, 1];
      const k = seq[s % seq.length];
      const iv = k === 3 ? 12 : triad[k];
      note('square', t, stepDur * 0.9, midi(root + 24 + iv), 0.035, bus, { cutoff: 2800, release: stepDur * 0.7 });
    }
  }

  return {
    get level() { return level; },
    setLevel(l: 0 | 1 | 2) { level = l; },
    start(at = ctx.currentTime + 0.05) {
      if (playing) return;
      playing = true;
      nextTime = at;
      step = 0;
      bus.gain.cancelScheduledValues(at);
      bus.gain.setValueAtTime(0, at);
      bus.gain.linearRampToValueAtTime(1, at + 1.5);
    },
    stop(at = ctx.currentTime) {
      if (!playing) return;
      playing = false;
      bus.gain.setTargetAtTime(0, at, 0.3);
    },
    get playing() { return playing; },
    /** Schedule every step that starts before time `t`. */
    scheduleUntil(t: number) {
      if (!playing) return;
      if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.05; // resync after a stall
      while (nextTime < t) {
        scheduleStep(step, nextTime);
        nextTime += stepDur;
        step++;
      }
    },
  };
}
