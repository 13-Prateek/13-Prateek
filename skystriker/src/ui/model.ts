/** Pure HUD helpers (no DOM) — unit-tested in tests/ui/. */
import { AURA_PER_BAR, MAX_HP, SIM_HZ } from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { Element, MatchState, PlayerId } from '../shared/types';

/* ---- Tuning knobs (real seconds) ---- */
/** How long the white "recent damage" chunk waits before draining. */
export const CHIP_DELAY = 0.55;
/** Drain speed of the damage chunk, in HP per second. */
export const CHIP_DRAIN_PER_SEC = 55;
/** HP at or below this makes the bar pulse red. */
export const LOW_HP = 25;
/** Timer turns red and pulses at or below this many seconds. */
export const TIMER_URGENT = 10;
/** Combo counter disappears after this long without a new hit. */
export const COMBO_HOLD = 1.6;

export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
export const heroColor = (s: Readonly<MatchState>, p: PlayerId): string => hex(HEROES[s.fighters[p].heroId].color);
export const heroName = (s: Readonly<MatchState>, p: PlayerId): string => HEROES[s.fighters[p].heroId].name;

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a3a', frost: '#7fe3ff', volt: '#d79bff', stone: '#9be08a',
};

/** Round timer text: whole seconds remaining (rounded up), or SD in sudden death. */
export function timerText(s: Readonly<MatchState>, roundTimeTicks: number): string {
  if (s.suddenDeath) return 'SD';
  if (s.phase === 'countdown') return String(Math.ceil(roundTimeTicks / SIM_HZ));
  if (s.phase === 'playing') return String(Math.max(0, Math.ceil(s.phaseTimer / SIM_HZ)));
  return '0';
}

export function timerSeconds(s: Readonly<MatchState>): number {
  return s.phase === 'playing' ? Math.ceil(s.phaseTimer / SIM_HZ) : Infinity;
}

/** Countdown digit to show (3,2,1) during the countdown phase, else 0. */
export function countdownDigit(s: Readonly<MatchState>): number {
  return s.phase === 'countdown' ? Math.max(1, Math.ceil(s.phaseTimer / SIM_HZ)) : 0;
}

export const isFinalRound = (s: Readonly<MatchState>): boolean =>
  s.wins[0] === s.config.roundsToWin - 1 && s.wins[1] === s.config.roundsToWin - 1;

export const roundLabel = (s: Readonly<MatchState>): string => (isFinalRound(s) ? 'FINAL ROUND' : `ROUND ${s.round}`);

/** Fill (0..1) of each of the 3 aura segments. */
export function auraFill(aura: number): [number, number, number] {
  const f = (i: number) => Math.max(0, Math.min(1, (aura - i * AURA_PER_BAR) / AURA_PER_BAR));
  return [f(0), f(1), f(2)];
}

export const hpFraction = (hp: number): number => Math.max(0, Math.min(1, hp / MAX_HP));

/**
 * Damage-chip step. `chip` trails `hp`: it waits CHIP_DELAY after the last damage,
 * then drains at CHIP_DRAIN_PER_SEC. If hp rises (new round), chip snaps up.
 */
export function stepChip(chip: number, hp: number, sinceDamage: number, dt: number): number {
  if (hp >= chip) return hp;
  if (sinceDamage < CHIP_DELAY) return chip;
  return Math.max(hp, chip - CHIP_DRAIN_PER_SEC * dt);
}

/** Winner of the match from the state (higher wins), for the result screen. */
export const matchWinner = (s: Readonly<MatchState>): PlayerId => (s.wins[1] > s.wins[0] ? 1 : 0);

/** Callout font size (world px) by tier. */
export const CALLOUT_SIZE: Record<1 | 2 | 3, number> = { 1: 38, 2: 62, 3: 118 };
/** Callout lifetime (s) by tier. */
export const CALLOUT_LIFE: Record<1 | 2 | 3, number> = { 1: 0.9, 2: 1.2, 3: 1.6 };
