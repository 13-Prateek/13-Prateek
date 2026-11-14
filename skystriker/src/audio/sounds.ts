/**
 * Synthesised SFX for every GameEvent (no asset files). Each function takes an
 * absolute start time `t` so it can be scheduled offline for tests.
 */
import { WORLD_W } from '../shared/constants';
import type { Element, PlayerId, Vec2 } from '../shared/types';
import { type Mixer, jitter } from './mixer';

/** Stereo position from world x (kept narrow so it never feels lopsided). */
export const panOf = (pos?: Vec2): number => (pos ? ((pos.x / WORLD_W) * 2 - 1) * 0.55 : 0);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Sounds = ReturnType<typeof createSounds>;

export function createSounds(m: Mixer) {
  const charging: Array<{ v: NonNullable<ReturnType<Mixer['voice']>> } | null> = [null, null];

  function elementLayer(el: Element, t: number, pan: number, amt = 1) {
    const v = m.voice(`el-${el}`, t, 0.45, { pan, max: 2, prio: 2, reverb: 0.15 });
    if (!v) return;
    switch (el) {
      case 'fire': // crackle + roar
        m.noise(v, t, 0.32, 0.32 * amt, { type: 'highpass', f0: 2500, q: 0.7, drive: true });
        m.noise(v, t, 0.4, 0.25 * amt, { type: 'lowpass', f0: 900, f1: 300 });
        break;
      case 'frost': // glassy shimmer
        m.tone(v, 'sine', t, 0.4, 2637 * jitter(), null, 0.09 * amt);
        m.tone(v, 'sine', t + 0.03, 0.35, 3520 * jitter(), null, 0.07 * amt);
        m.noise(v, t, 0.25, 0.12 * amt, { type: 'highpass', f0: 6000 });
        break;
      case 'volt': // electric buzz
        m.tone(v, 'square', t, 0.2, 180 * jitter(), 90, 0.11 * amt, { filter: 2400 });
        m.noise(v, t, 0.18, 0.18 * amt, { type: 'bandpass', f0: 4000, q: 4, drive: true });
        break;
      case 'stone': // heavy rumble
        m.tone(v, 'sine', t, 0.35, 70, 40, 0.5 * amt);
        m.noise(v, t, 0.3, 0.3 * amt, { type: 'lowpass', f0: 500, f1: 150 });
        break;
    }
  }

  const api = {
    /** Kick contact: noise snap + pitched thump; pitch and weight rise with power. */
    kick(t: number, power: number, pos?: Vec2, curve = false, element: Element | null = null) {
      const p = clamp01(power), pan = panOf(pos);
      const v = m.voice('kick', t, 0.45, { pan, max: 4, prio: 3, reverb: 0.05 + 0.15 * p });
      if (!v) return;
      const j = jitter();
      m.tone(v, 'sine', t, 0.11 + 0.14 * p, (150 + 130 * p) * j, 48, 0.75 + 0.25 * p);
      m.noise(v, t, 0.05 + 0.03 * p, 0.45 + 0.2 * p, { type: 'bandpass', f0: 2600 * j, f1: 900, q: 0.8 });
      if (p > 0.55) m.tone(v, 'sine', t, 0.35, 70, 32, 0.5 * p); // sub boom on power kicks
      if (curve) m.tone(v, 'triangle', t + 0.02, 0.28, 900, 2200, 0.08);
      if (element) elementLayer(element, t, pan, 0.6 + 0.4 * p);
    },
    /** Rising whine while a kick charges. Stopped by stopCharge. */
    startCharge(t: number, player: PlayerId, pos?: Vec2, charge0 = 0) {
      api.stopCharge(t, player);
      const c0 = clamp01(charge0), rise = Math.max(0.05, 1 - c0); // seconds left until full
      const v = m.voice(`charge${player}`, t, rise + 0.7, { pan: panOf(pos), max: 1, prio: 2 });
      if (!v) return;
      const osc = m.ctx.createOscillator(), osc2 = m.ctx.createOscillator();
      osc.type = 'sawtooth'; osc2.type = 'square';
      osc.frequency.setValueAtTime(170 + 510 * c0, t);
      osc.frequency.linearRampToValueAtTime(680, t + rise);
      osc2.frequency.setValueAtTime(171.5 + 512 * c0, t);
      osc2.frequency.linearRampToValueAtTime(684, t + rise);
      const f = m.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(600 + 2600 * c0, t);
      f.frequency.linearRampToValueAtTime(3200, t + rise);
      const g = m.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012 + 0.033 * c0, t + 0.06);
      g.gain.linearRampToValueAtTime(0.045, t + rise);
      g.gain.linearRampToValueAtTime(0.032, t + rise + 0.4);
      g.gain.linearRampToValueAtTime(0, t + rise + 0.65);
      osc.connect(f); osc2.connect(f); f.connect(g).connect(v.out);
      osc.start(t); osc2.start(t); osc.stop(t + rise + 0.7); osc2.stop(t + rise + 0.7);
      v.srcs.push(osc, osc2);
      charging[player] = { v };
    },
    stopCharge(t: number, player: PlayerId) {
      const c = charging[player];
      if (c) { m.kill(c.v, t); charging[player] = null; }
    },
    /** Leg swing when a kick goes active (fires even on a whiff); bigger with charge. */
    swing(t: number, charge: number, pos?: Vec2) {
      const c = clamp01(charge);
      const v = m.voice('swing', t, 0.25, { pan: panOf(pos), max: 2, prio: 1 });
      if (!v) return;
      m.noise(v, t, 0.12 + 0.08 * c, 0.24 + 0.3 * c, { type: 'bandpass', f0: 900 * jitter(), f1: 3200, q: 1.4, attack: 0.02 });
    },
    /** Body softly pushing the ball (no damage). */
    bump(t: number, speed: number, pos?: Vec2) {
      const a = clamp01(speed / 800);
      const v = m.voice('bump', t, 0.12, { pan: panOf(pos), max: 2, prio: 0 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.08, 220 * jitter(), 120, 0.12 + 0.2 * a);
    },
    /** Wall kick-off: dash plus a solid push off the wall. */
    wallKick(t: number, pos?: Vec2) {
      const v = m.voice('wallkick', t, 0.3, { pan: panOf(pos), max: 2, prio: 3 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.18, 180, 60, 0.6);
      m.noise(v, t, 0.06, 0.3, { type: 'lowpass', f0: 1800 });
    },
    chargeFull(t: number, pos?: Vec2) {
      const v = m.voice('chargeFull', t, 0.5, { pan: panOf(pos), max: 2, prio: 3, reverb: 0.2 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.45, 1568, null, 0.22);
      m.tone(v, 'sine', t + 0.05, 0.4, 2349, null, 0.14);
      m.tone(v, 'triangle', t, 0.12, 784, 1568, 0.1);
    },
    bounce(t: number, speed: number, pos?: Vec2) {
      const a = clamp01(speed / 1700);
      const v = m.voice('bounce', t, 0.08, { pan: panOf(pos), max: 3, prio: 0 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.05, 1400 * jitter(0.08), 700, 0.08 + 0.22 * a);
      m.noise(v, t, 0.025, 0.1 + 0.2 * a, { type: 'highpass', f0: 3000 });
    },
    hit(t: number, damage: number, combo: number, pos?: Vec2, element: Element | null = null) {
      const a = clamp01(damage / 16), pan = panOf(pos);
      const v = m.voice('hit', t, 0.45, { pan, max: 3, prio: 4, reverb: 0.12 });
      if (!v) return;
      const up = 1 + Math.min(4, Math.max(0, combo - 1)) * 0.06; // combo hits climb in pitch
      m.tone(v, 'sine', t, 0.28, 120 * up * jitter(), 38, 0.95 + 0.25 * a);
      m.noise(v, t, 0.16 + 0.08 * a, 0.35 + 0.35 * a, { type: 'lowpass', f0: 3200 * up, f1: 600, drive: true });
      m.tone(v, 'square', t, 0.06, 240 * up, 90, 0.12, { filter: 1500 });
      if (element) elementLayer(element, t, pan);
      m.duckMusic(t, 0.5, 0.18);
    },
    wallSplat(t: number, pos?: Vec2) {
      const v = m.voice('splat', t, 0.5, { pan: panOf(pos), max: 2, prio: 4, reverb: 0.2 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.38, 95 * jitter(), 30, 0.95);
      m.noise(v, t, 0.3, 0.55, { type: 'lowpass', f0: 1400, f1: 200, drive: true });
      m.noise(v, t + 0.015, 0.12, 0.3, { type: 'bandpass', f0: 500, q: 2 });
      m.duckMusic(t, 0.45, 0.25);
    },
    clash(t: number, pos?: Vec2) {
      const v = m.voice('clash', t, 0.9, { pan: panOf(pos), max: 2, prio: 5, reverb: 0.35 });
      if (!v) return;
      const base = 520 * jitter();
      for (const [r, g] of [[1, 0.22], [2.76, 0.14], [5.4, 0.09], [8.93, 0.05]] as const) m.tone(v, 'sine', t, 0.85, base * r, null, g);
      m.noise(v, t, 0.12, 0.5, { type: 'highpass', f0: 2000, drive: true });
      m.tone(v, 'sine', t, 0.3, 160, 50, 0.6);
      m.duckMusic(t, 0.4, 0.4);
    },
    perfect(t: number, pos?: Vec2) {
      const v = m.voice('perfect', t, 0.8, { pan: panOf(pos), max: 2, prio: 5, reverb: 0.45 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.6, 1318.5, null, 0.22);
      m.tone(v, 'sine', t + 0.04, 0.6, 1975.5, null, 0.16);
      m.tone(v, 'triangle', t + 0.08, 0.5, 2637, null, 0.08);
      m.noise(v, t, 0.35, 0.3, { type: 'bandpass', f0: 700, f1: 5000, q: 1.5, attack: 0.04 });
    },
    closeCall(t: number, pos?: Vec2) {
      const v = m.voice('close', t, 0.45, { pan: panOf(pos), max: 2, prio: 2 });
      if (!v) return;
      m.noise(v, t, 0.38, 0.4, { type: 'bandpass', f0: 500, f1: 3500, q: 2.5, attack: 0.12 });
      m.tone(v, 'sine', t, 0.3, 300, 900, 0.05, { attack: 0.1 });
    },
    dash(t: number, pos?: Vec2) {
      const v = m.voice('dash', t, 0.25, { pan: panOf(pos), max: 2, prio: 2 });
      if (!v) return;
      m.noise(v, t, 0.2, 0.42, { type: 'bandpass', f0: 2200 * jitter(), f1: 400, q: 1.2, attack: 0.01 });
      m.tone(v, 'sine', t, 0.16, 260, 110, 0.18);
    },
    trap(t: number, pos?: Vec2) {
      const v = m.voice('trap', t, 0.12, { pan: panOf(pos), max: 2, prio: 1 });
      if (!v) return;
      m.tone(v, 'sine', t, 0.09, 260 * jitter(), 140, 0.35);
      m.noise(v, t, 0.04, 0.12, { type: 'lowpass', f0: 1200 });
    },
    infuse(t: number, element: Element, pos?: Vec2) {
      const v = m.voice('infuse', t, 0.6, { pan: panOf(pos), max: 2, prio: 3, reverb: 0.3 });
      if (!v) return;
      m.tone(v, 'sawtooth', t, 0.5, 220, 1760, 0.09, { filter: 2500, attack: 0.05 });
      m.tone(v, 'sine', t + 0.1, 0.45, 880, 1760, 0.12, { attack: 0.04 });
      elementLayer(element, t + 0.15, panOf(pos), 0.7);
    },
    auraBar(t: number, bars: number) {
      const v = m.voice('aura', t, 0.4, { max: 2, prio: 2, reverb: 0.25 });
      if (!v) return;
      const f = 880 * Math.pow(1.26, Math.max(0, bars - 1));
      m.tone(v, 'sine', t, 0.32, f, null, 0.14);
      m.tone(v, 'sine', t + 0.07, 0.3, f * 1.5, null, 0.1);
    },
    countdown(t: number, secondsLeft: number) {
      const v = m.voice('count', t, 0.3, { max: 2, prio: 6, reverb: 0.15 });
      if (!v) return;
      const f = secondsLeft <= 1 ? 740 : 587;
      m.tone(v, 'square', t, 0.16, f, null, 0.2, { filter: 3000 });
      m.tone(v, 'sine', t, 0.25, f / 2, null, 0.3);
    },
    fight(t: number) {
      const v = m.voice('fight', t, 1.4, { max: 1, prio: 7, reverb: 0.5 });
      if (!v) return;
      for (const [f, g] of [[220, 0.13], [329.6, 0.11], [440, 0.1], [554.4, 0.07], [659.3, 0.06]] as const) {
        m.tone(v, 'sawtooth', t, 1.2, f, null, g, { filter: 3500, attack: 0.01 });
        m.tone(v, 'sawtooth', t, 1.2, f, null, g * 0.7, { filter: 3500, detune: 12 });
      }
      m.noise(v, t, 0.9, 0.4, { type: 'highpass', f0: 5000, attack: 0.005 });
      m.tone(v, 'sine', t, 0.5, 110, 40, 0.9);
    },
    ko(t: number, pos?: Vec2) {
      const v = m.voice('ko', t, 2.4, { pan: panOf(pos) * 0.5, max: 1, prio: 9, reverb: 0.8 });
      if (!v) return;
      m.tone(v, 'sine', t, 1.6, 95, 22, 1.0);
      m.tone(v, 'triangle', t, 0.8, 190, 40, 0.3);
      m.noise(v, t, 1.2, 0.7, { type: 'lowpass', f0: 2400, f1: 120, drive: true });
      m.noise(v, t, 0.15, 0.5, { type: 'highpass', f0: 3000 });
      m.duckMusic(t, 0.15, 1.6);
    },
    roundEnd(t: number) {
      const v = m.voice('jingle', t, 1.0, { max: 1, prio: 6, reverb: 0.4 });
      if (!v) return;
      [440, 554.4, 659.3].forEach((f, i) => m.tone(v, 'triangle', t + i * 0.12, 0.5, f, null, 0.14));
    },
    matchEnd(t: number) {
      const v = m.voice('jingle', t, 2.0, { max: 1, prio: 7, reverb: 0.5 });
      if (!v) return;
      [440, 554.4, 659.3, 880].forEach((f, i) => m.tone(v, 'sawtooth', t + i * 0.14, 0.7 + (i === 3 ? 0.8 : 0), f, null, 0.08, { filter: 3000 }));
      m.tone(v, 'sine', t + 0.42, 1.4, 220, null, 0.25);
    },
    superStart(t: number, element: Element) {
      const v = m.voice('super', t, 1.6, { max: 1, prio: 8, reverb: 0.5 });
      if (!v) return;
      m.noise(v, t, 1.2, 0.35, { type: 'bandpass', f0: 300, f1: 6000, q: 1.2, attack: 0.9 });
      m.tone(v, 'sawtooth', t, 1.2, 110, 880, 0.09, { filter: 3000, attack: 0.8 });
      elementLayer(element, t + 1.0, 0, 1);
      m.duckMusic(t, 0.3, 1.2);
    },
    suddenDeath(t: number) {
      const v = m.voice('alarm', t, 1.3, { max: 1, prio: 7, reverb: 0.3 });
      if (!v) return;
      for (let i = 0; i < 3; i++) {
        m.tone(v, 'square', t + i * 0.4, 0.18, 880, null, 0.08, { filter: 2500 });
        m.tone(v, 'square', t + i * 0.4 + 0.2, 0.18, 660, null, 0.08, { filter: 2500 });
      }
    },
    /** Soft whoosh for the round-start / round label. */
    roundStart(t: number) {
      const v = m.voice('rstart', t, 0.6, { max: 1, prio: 3, reverb: 0.3 });
      if (!v) return;
      m.noise(v, t, 0.5, 0.25, { type: 'bandpass', f0: 300, f1: 2500, q: 1, attack: 0.3 });
    },
  };
  return api;
}
