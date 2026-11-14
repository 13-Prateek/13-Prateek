/** The temporary sparring bot must actually play: kick, hit, never get stuck, stay deterministic. */
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

  // Playtest bug: the bot pinned the ball in a corner forever (a corner bounces a kick
  // straight back into the kicker's body). It must trap the ball and carry it out.
  const spots = [
    ['bottom-left corner', 0, 1], ['top-left corner', 0, 0], ['bottom-right corner', 1, 1],
    ['top-right corner', 1, 0], ['left wall', 0, 0.5], ['bottom wall', 0.5, 1],
  ] as const;
  for (const [name, bx, by] of spots) {
    it(`gets the ball out of the ${name} within 2 s`, () => {
      const s = createMatch({ heroes: ['kael', 'yuki'], roundsToWin: 2, seed: 3 });
      s.phase = 'playing'; s.phaseTimer = 99999;
      const a = s.arena, r = s.ball.radius;
      const px = (f: number) => (f === 0 ? a.left + r : f === 1 ? a.right - r : (a.left + a.right) / 2);
      const py = (f: number) => (f === 0 ? a.top + r : f === 1 ? a.bottom - r : (a.top + a.bottom) / 2);
      s.ball.pos = { x: px(bx), y: py(by) };
      s.fighters[1].pos = { x: s.ball.pos.x + (bx === 1 ? -40 : 40), y: s.ball.pos.y + (by === 1 ? -40 : 40) };
      s.fighters[0].pos = { x: 800, y: 450 };
      const ai = createAI('pro', 'rival');
      const start = { ...s.ball.pos };
      let freed = false;
      for (let i = 0; i < 2 * SIM_HZ && !freed; i++) {
        stepMatch(s, [{ ...EMPTY_INPUT }, ai.think(s, 1)]);
        freed = Math.hypot(s.ball.pos.x - start.x, s.ball.pos.y - start.y) > 250;
      }
      expect(freed).toBe(true);
    });
  }

  it('in a 3-minute bot-vs-bot match the ball never sits still for 3 s', () => {
    const s = createMatch({ heroes: ['kael', 'yuki'], roundsToWin: 99, seed: 11 });
    const bots = [createAI('rookie', 'rival'), createAI('legend', 'rival')];
    let still = 0, worst = 0;
    for (let i = 0; i < 180 * SIM_HZ; i++) {
      stepMatch(s, [bots[0].think(s, 0), bots[1].think(s, 1)]);
      const moving = Math.hypot(s.ball.vel.x, s.ball.vel.y) > 30 || s.ball.heldBy !== null;
      still = s.phase === 'playing' && !moving ? still + 1 : 0;
      worst = Math.max(worst, still);
    }
    expect(worst / SIM_HZ).toBeLessThan(3);
  });
});
