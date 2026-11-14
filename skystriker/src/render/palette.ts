import type { Element } from '../shared/types';

/**
 * Visual tuning knobs for the renderer. Pure presentation: changing these
 * never affects gameplay. Listed in docs/handoff/render.md.
 */
export const FX = {
  /** Background / arena */
  BG: 0x05060d,
  GRID: 0x1b2550,
  WALL: 0x5b7cff,
  WALL_SUDDEN_DEATH: 0xff3b5c,
  /** Final Rush walls: amber, distinct from sudden-death red. */
  WALL_FINAL_RUSH: 0xffa41b,
  /** Rally heat: white-gold the ball's glow/trail shifts toward as heat rises (ring stays owner colour). */
  HEAT_COLOR: 0xfff0b0,
  /** Highest heat level drawn (matches GDD §3: 0..4). */
  HEAT_MAX: 4,
  /** Phase Dash ghost tint (mixed with the hero colour). */
  PHASE_COLOR: 0xe6dcff,
  /** Screen shake: max offset (world units) at trauma 1, decay per second, max roll (rad). */
  SHAKE_MAX: 22,
  SHAKE_DECAY: 1.6,
  SHAKE_ROLL: 0.025,
  /** Trauma added per event (0..1, shake ∝ trauma²). */
  TRAUMA_KICK: 0.12,
  TRAUMA_KICK_POWER: 0.28,
  TRAUMA_PERFECT: 0.5,
  TRAUMA_HIT: 0.3,
  TRAUMA_HIT_PER_DMG: 0.025,
  TRAUMA_SPLAT: 0.5,
  TRAUMA_CLASH: 0.45,
  TRAUMA_KO: 0.85,
  TRAUMA_BOUNCE_FAST: 0.1,
  /** Zoom punches (extra scale). */
  ZOOM_PERFECT: 0.05,
  ZOOM_HIT: 0.03,
  ZOOM_CLASH: 0.05,
  ZOOM_KO: 0.16,
  /** KO visual slow-mo: time scale for effects, and real seconds it lasts. */
  KO_SLOWMO_SCALE: 0.25,
  KO_SLOWMO_SECONDS: 1.0,
  /** Effects time scale while the sim is in hitstop (sparks keep moving a little). */
  HITSTOP_FX_SCALE: 0.35,
  /** Ball trail: points, seconds between points, full-strength speed. */
  TRAIL_POINTS: 18,
  TRAIL_SPACING: 0.011,
  TRAIL_FULL_SPEED: 1700,
  /** Bloom (glow) strength; off with ?lowfx=1. */
  BLOOM_THRESHOLD: 0.35,
  BLOOM_SCALE: 1.1,
  BLOOM_BLUR: 7,
};

export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xff7a1a,
  frost: 0x9cf0ff,
  volt: 0xfff04a,
  stone: 0xd8a35a,
};

export const ELEMENT_COLOR_2: Record<Element, number> = {
  fire: 0xffd166,
  frost: 0xffffff,
  volt: 0xc77dff,
  stone: 0x8a6a3a,
};

/** Linear blend of two 0xRRGGBB colours. */
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
