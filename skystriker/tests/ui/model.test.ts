import { describe, expect, it } from 'vitest';
import { ROUND_TIME, SIM_HZ } from '../../src/shared/constants';
import type { MatchState } from '../../src/shared/types';
import {
  CHIP_DELAY, CHIP_DRAIN_PER_SEC, auraFill, countdownDigit, isFinalRound, matchWinner, roundLabel, stepChip, timerText,
} from '../../src/ui/model';
import { fakeState } from '../../src/ui/dev/fake';

const st = (patch: Partial<MatchState> = {}): MatchState => Object.assign(fakeState(), patch);

describe('damage chip', () => {
  it('holds during the delay, then drains toward hp', () => {
    expect(stepChip(80, 60, CHIP_DELAY * 0.5, 0.016)).toBe(80);
    const after = stepChip(80, 60, CHIP_DELAY + 0.01, 0.1);
    expect(after).toBeCloseTo(80 - CHIP_DRAIN_PER_SEC * 0.1);
    expect(stepChip(61, 60, 5, 0.5)).toBe(60); // never undershoots
  });
  it('snaps up when hp rises (new round)', () => {
    expect(stepChip(20, 100, 0, 0.016)).toBe(100);
  });
});

describe('aura segments', () => {
  it('splits 0..300 into three 0..1 fills', () => {
    expect(auraFill(0)).toEqual([0, 0, 0]);
    expect(auraFill(150)).toEqual([1, 0.5, 0]);
    expect(auraFill(300)).toEqual([1, 1, 1]);
    expect(auraFill(999)).toEqual([1, 1, 1]);
  });
});

describe('timer + flow labels', () => {
  it('shows whole seconds rounded up while playing', () => {
    expect(timerText(st({ phase: 'playing', phaseTimer: 61 * SIM_HZ + 1 }), ROUND_TIME)).toBe('62');
    expect(timerText(st({ phase: 'playing', phaseTimer: 0 }), ROUND_TIME)).toBe('0');
  });
  it('shows the full round time during the countdown and SD in sudden death', () => {
    expect(timerText(st({ phase: 'countdown' }), ROUND_TIME)).toBe(String(ROUND_TIME / SIM_HZ));
    expect(timerText(st({ phase: 'playing', suddenDeath: true }), ROUND_TIME)).toBe('SD');
  });
  it('counts 3-2-1 from the countdown timer', () => {
    expect(countdownDigit(st({ phase: 'countdown', phaseTimer: 180 }))).toBe(3);
    expect(countdownDigit(st({ phase: 'countdown', phaseTimer: 120 }))).toBe(2);
    expect(countdownDigit(st({ phase: 'countdown', phaseTimer: 1 }))).toBe(1);
    expect(countdownDigit(st({ phase: 'playing', phaseTimer: 100 }))).toBe(0);
  });
  it('labels the final round and picks the match winner', () => {
    expect(roundLabel(st({ round: 2 }))).toBe('ROUND 2');
    const fin = st({ round: 3, wins: [1, 1] });
    expect(isFinalRound(fin)).toBe(true);
    expect(roundLabel(fin)).toBe('FINAL ROUND');
    expect(matchWinner(st({ wins: [1, 2] }))).toBe(1);
    expect(matchWinner(st({ wins: [2, 0] }))).toBe(0);
  });
});
