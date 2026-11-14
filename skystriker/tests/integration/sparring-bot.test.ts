/** The temporary sparring bot must actually play: kick, hit, and stay deterministic. */
import { describe, expect, it } from 'vitest';
import { createAI } from '../../src/ai';
import { SIM_HZ } from '../../src/shared/constants';
import { EMPTY_INPUT, type GameEvent } from '../../src/shared/types';
import { createMatch, stepMatch } from '../../src/sim';

function play(seconds: number) {
  const s = createMatch({ heroes: ['kael', 'yuki'], roundsToWin: 2, seed: 1337 });
  const ai = createAI('pro', 'rival');
  const log: GameEvent[] = [];
  for (let i = 0; i < seconds * SIM_HZ; i++) log.push(...stepMatch(s, [{ ...EMPTY_INPUT }, ai.think(s, 1)]));
  return { s, log };
}

describe('sparring bot', () => {
  it('kicks the ball and hurts an idle player within 30 s', () => {
    const { s, log } = play(30);
    expect(log.filter((e) => e.type === 'kick' && e.player === 1).length).toBeGreaterThan(5);
    expect(log.some((e) => e.type === 'hit' && e.target === 0)).toBe(true);
    expect(s.fighters[0].hp < 100 || s.round > 1 || s.phase !== 'playing').toBe(true);
  });

  it('is deterministic', () => {
    expect(play(10).s).toEqual(play(10).s);
  });
});
