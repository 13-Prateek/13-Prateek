import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch } from '../../src/sim';
import type { GameEvent, InputFrame, MatchState, PlayerId } from '../../src/shared/types';
import { I } from './helpers';

/** Tiny LCG for scripted test inputs (keeps the test itself deterministic). */
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Scripted dummy (tests only): chase the ball, kick when it's near the foot,
 * sometimes charge, trap, dash or infuse. Exercises most of the sim.
 */
function chaser(s: MatchState, id: PlayerId, r: () => number): InputFrame {
  const f = s.fighters[id];
  const b = s.ball;
  const dx = b.pos.x - f.pos.x, dy = b.pos.y - f.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const near = d < 110;
  const kicking = f.kickPhase === 'charging';
  return I({
    moveX: dx / d + (r() - 0.5) * 0.6,
    moveY: dy / d + (r() - 0.5) * 0.6,
    aimX: r() < 0.5 ? 0 : r() - 0.5,
    aimY: r() < 0.5 ? 0 : r() - 0.5,
    kick: kicking ? r() < 0.9 : near && r() < 0.5,
    trap: near && r() < 0.15,
    dash: r() < 0.03,
    infuse: r() < 0.01,
    phaseDash: r() < 0.01,
  });
}

function playScript(seed: number, ticks: number) {
  const s = createMatch({ heroes: ['kael', 'zap'], roundsToWin: 2, seed });
  const r = lcg(seed * 7919 + 1);
  const log: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const inputs: [InputFrame, InputFrame] = [chaser(s, 0, r), chaser(s, 1, r)];
    log.push(...stepMatch(s, inputs));
  }
  return { s, log };
}

describe('determinism', () => {
  it('same seed + same inputs → identical state and events (3000 ticks)', () => {
    const a = playScript(42, 3000);
    const b = playScript(42, 3000);
    expect(b.s).toEqual(a.s);
    expect(b.log).toEqual(a.log);
    // the script actually played the game
    const types = new Set(a.log.map((e) => e.type));
    for (const t of ['kick', 'bounce', 'fight', 'dash']) expect(types.has(t as GameEvent['type'])).toBe(true);
  });

  it('state stays plain JSON data (structuredClone / JSON round trip are lossless)', () => {
    const { s } = playScript(7, 900);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(structuredClone(s)).toEqual(s);
  });

  it('long chaotic play never produces NaN or escapes the arena', () => {
    for (const seed of [1, 2, 3]) {
      const s = createMatch({ heroes: ['brakka', 'yuki'], roundsToWin: 99, seed });
      const r = lcg(seed);
      for (let i = 0; i < 6000; i++) {
        stepMatch(s, [chaser(s, 0, r), chaser(s, 1, r)]);
        const a = s.arena;
        for (const f of s.fighters) {
          expect(Number.isFinite(f.pos.x) && Number.isFinite(f.pos.y)).toBe(true);
          expect(f.pos.x).toBeGreaterThanOrEqual(a.left - 1e-6);
          expect(f.pos.x).toBeLessThanOrEqual(a.right + 1e-6);
        }
        expect(Number.isFinite(s.ball.pos.x) && Number.isFinite(s.ball.pos.y)).toBe(true);
        expect(s.ball.pos.x).toBeGreaterThanOrEqual(a.left);
        expect(s.ball.pos.x).toBeLessThanOrEqual(a.right);
        expect(s.ball.pos.y).toBeGreaterThanOrEqual(a.top);
        expect(s.ball.pos.y).toBeLessThanOrEqual(a.bottom);
      }
    }
  });
});
