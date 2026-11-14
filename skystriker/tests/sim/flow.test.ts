import { describe, expect, it } from 'vitest';
import { stepMatch } from '../../src/sim';
import {
  COUNTDOWN_TICKS, HITSTOP_KO, MAX_HP, ROUND_OVER_TICKS, ROUND_TIME, SIM_HZ,
} from '../../src/shared/constants';
import type { GameEvent, MatchState } from '../../src/shared/types';
import { clearHitstop, IDLE, match, ofType, park, playing, run, setBall, step } from './helpers';

/** Land a KO on p1 (or p0) from a fresh playing position. */
function koHit(s: MatchState, victim: 0 | 1): GameEvent[] {
  const v = s.fighters[victim];
  v.hp = 1;
  setBall(s, v.pos.x + (victim === 1 ? -150 : 150), v.pos.y, victim === 1 ? 1200 : -1200, 0, victim === 1 ? 0 : 1);
  const ev: GameEvent[] = [];
  while (s.phase === 'playing') ev.push(...step(s));
  return ev;
}

describe('countdown', () => {
  it('roundStart, 3-2-1 once per second, then fight', () => {
    const s = match();
    const log: [number, GameEvent][] = [];
    for (let i = 0; i < COUNTDOWN_TICKS; i++) for (const e of stepMatch(s, IDLE)) log.push([s.tick, e]);
    expect(log).toEqual([
      [1, { type: 'roundStart', round: 1 }],
      [1, { type: 'countdown', secondsLeft: 3 }],
      [1 + SIM_HZ, { type: 'countdown', secondsLeft: 2 }],
      [1 + 2 * SIM_HZ, { type: 'countdown', secondsLeft: 1 }],
      [COUNTDOWN_TICKS, { type: 'fight' }],
    ]);
    expect(s.phase).toBe('playing');
    expect(s.phaseTimer).toBe(ROUND_TIME);
  });
});

describe('KO and rounds', () => {
  it('KO: ko event + callout + HITSTOP_KO, then roundEnd, then the next round', () => {
    const s = playing();
    s.fighters[0].aura = 150;
    const ev = koHit(s, 1);
    expect(ofType(ev, 'ko')).toHaveLength(1);
    expect(ofType(ev, 'ko')[0].loser).toBe(1);
    expect(ofType(ev, 'callout').find((c) => c.text === 'K.O.!')).toMatchObject({ player: 0, tier: 3 });
    expect(s.phase).toBe('roundOver');
    expect(s.hitstop).toBe(HITSTOP_KO);
    expect(s.fighters[1].hp).toBe(0);
    // the KO freeze holds everything, then roundEnd fires
    const frozen = clearHitstop(s);
    expect(ofType(frozen, 'roundEnd')).toHaveLength(0);
    let next = step(s);
    expect(ofType(next, 'roundEnd')).toEqual([{ type: 'roundEnd', winner: 0 }]);
    expect(s.wins).toEqual([1, 0]);
    next = run(s, ROUND_OVER_TICKS - 1);
    expect(s.phase).toBe('countdown');
    expect(s.round).toBe(2);
    expect(s.fighters.map((f) => f.hp)).toEqual([MAX_HP, MAX_HP]);
    expect(s.fighters[0].aura).toBeGreaterThanOrEqual(150); // aura carries over
    expect(s.ball.mode).toBe('neutral');
    expect(ofType(step(s), 'roundStart')).toEqual([{ type: 'roundStart', round: 2 }]);
  });

  it('two round wins end the match', () => {
    const s = playing();
    koHit(s, 1);
    while (s.phase !== 'playing') stepMatch(s, IDLE);
    koHit(s, 1);
    const ev: GameEvent[] = [];
    while ((s.phase as string) === 'roundOver') ev.push(...stepMatch(s, IDLE));
    expect(s.phase).toBe('matchOver');
    expect(ofType(ev, 'matchEnd')).toEqual([{ type: 'matchEnd', winner: 0 }]);
    expect(s.wins).toEqual([2, 0]);
    run(s, 300, { moveX: 1, kick: true }); // match over: nothing breaks, nothing changes phase
    expect(s.phase).toBe('matchOver');
  });

  it('round over is safe: a live ball hurts nobody and kicks do nothing', () => {
    const s = playing();
    koHit(s, 1);
    clearHitstop(s);
    s.fighters[0].pos = { x: 400, y: 450 };
    s.fighters[0].hp = 50;
    setBall(s, 600, 450, -1200, 0, 1);
    const ev = run(s, 30, { kick: true });
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(ofType(ev, 'kick')).toHaveLength(0);
    expect(s.fighters[0].hp).toBe(50);
  });
});

describe('timeout and sudden death', () => {
  it('timeout: higher HP wins the round', () => {
    const s = playing();
    s.fighters[0].hp = 40;
    s.phaseTimer = 1;
    const ev = step(s).concat(step(s));
    expect(ofType(ev, 'callout').map((c) => c.text)).toContain('TIME!');
    expect(ofType(ev, 'roundEnd')).toEqual([{ type: 'roundEnd', winner: 1 }]);
    expect(s.wins).toEqual([0, 1]);
  });

  it('tied timeout starts sudden death: walls close in, next damage is a K.O.', () => {
    const s = playing();
    s.phaseTimer = 1;
    const ev = step(s);
    expect(ofType(ev, 'suddenDeath')).toHaveLength(1);
    expect(s.suddenDeath).toBe(true);
    expect(s.phase).toBe('playing');
    const w = s.arena.right - s.arena.left;
    run(s, 60);
    expect(s.arena.right - s.arena.left).toBeLessThan(w - 50);
    const v = s.fighters[1];
    setBall(s, v.pos.x - 150, v.pos.y, 900, 0, 0);
    const ko = run(s, 20);
    expect(ofType(ko, 'hit')).toHaveLength(1);
    expect(ofType(ko, 'ko')).toHaveLength(1);
    expect(s.phase).toBe('roundOver');
  });

  it('sudden death walls stop at the minimum size and keep fighters inside', () => {
    const s = playing();
    s.phaseTimer = 1;
    step(s);
    park(s, 0);
    run(s, 60 * 30, { moveX: -1, moveY: -1 });
    const a = s.arena;
    expect(a.right - a.left).toBeGreaterThanOrEqual(700 - 1e-6);
    const f = s.fighters[0];
    expect(f.pos.x).toBeGreaterThanOrEqual(a.left);
    expect(f.pos.y).toBeGreaterThanOrEqual(a.top);
  });
});

describe('hitstop', () => {
  it('freezes physics while > 0', () => {
    const s = playing();
    setBall(s, 800, 450, 1000, 0, 0);
    s.hitstop = 5;
    const pos = { ...s.ball.pos };
    run(s, 5);
    expect(s.ball.pos).toEqual(pos);
    step(s);
    expect(s.ball.pos.x).toBeGreaterThan(pos.x);
  });

  it('a button pressed during hitstop fires exactly once afterwards (buffered, not eaten or doubled)', () => {
    const s = playing();
    s.hitstop = 4;
    run(s, 4, { kick: true }); // pressed during the freeze
    expect(s.fighters[0].kickPhase).toBe('idle');
    step(s, { kick: true });
    expect(s.fighters[0].kickPhase).toBe('charging');
    expect(s.fighters[0].kickTimer).toBe(1);
    step(s, { kick: true });
    expect(s.fighters[0].kickTimer).toBe(2);
  });
});
