/**
 * Playtest targets for ball feel (lead brief after the wave 1 playtest):
 * shots go where you aim, the ball is fast and stays live, curves are deliberate and capped.
 */
import { describe, expect, it } from 'vitest';
import {
  BALL_CRUISE_TICKS, BALL_LIVE_MIN_SPEED, CURVE_BEND, CURVE_MIN_CHARGE, KICK_CHARGE_FULL, KICK_CHARGE_START,
  POWER_KICK_MAX_SPEED, SNAP_KICK_SPEED,
} from '../../src/shared/constants';
import { HEROES } from '../../src/shared/heroes';
import type { GameEvent, HeroId, MatchState } from '../../src/shared/types';
import { ofType, park, playing, setBall, step } from './helpers';

/** Hero at (300,450) kicking right with aim (1,0); P2 parked out of the way. */
function setup(hero: HeroId = 'kael'): MatchState {
  const s = playing(1, [hero, 'yuki']);
  park(s, 1);
  s.fighters[0].pos = { x: 300, y: 450 };
  s.fighters[0].vel = { x: 0, y: 0 };
  return s;
}

/** Hold kick `held` ticks standing still, then release with the ball on the foot while moving `moveY`. */
function kickRight(s: MatchState, held: number, moveY = 0): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < held; i++) ev.push(...step(s, { kick: true, aimX: 1 }));
  const f = s.fighters[0];
  f.vel = { x: 0, y: 0 };
  setBall(s, f.pos.x + 60, f.pos.y);
  ev.push(...step(s, { kick: false, aimX: 1, moveY }));
  return ev;
}

/** Ticks to hold kick to reach at least `charge`. */
const heldFor = (charge: number) =>
  Math.ceil(KICK_CHARGE_START + charge * (KICK_CHARGE_FULL - KICK_CHARGE_START)) + 1;

/** Step with no input until the ball goes neutral; returns the live path length and a trace. */
function flyUntilNeutral(s: MatchState, maxTicks = 600) {
  let dist = 0;
  const trace: { x: number; y: number; vx: number; vy: number; bounces: number }[] = [];
  for (let i = 0; i < maxTicks && s.ball.mode === 'live'; i++) {
    const p = { ...s.ball.pos };
    step(s, { aimX: 1 });
    dist += Math.hypot(s.ball.pos.x - p.x, s.ball.pos.y - p.y);
    trace.push({ ...s.ball.pos, vx: s.ball.vel.x, vy: s.ball.vel.y, bounces: s.ball.bounces });
  }
  return { dist, trace };
}

describe('ball feel: straight, fast, lively', () => {
  it('a snap kick flies straight where you aim, even while moving sideways', () => {
    const s = setup();
    const k = ofType(kickRight(s, 2, 1), 'kick')[0];
    expect(k.curve).toBe(false);
    expect(k.speed).toBeCloseTo(SNAP_KICK_SPEED);
    expect(s.ball.spin).toBe(0);
    for (let i = 0; i < 50; i++) step(s, { moveY: 1, aimX: 1 });
    expect(Math.abs(s.ball.pos.y - 450)).toBeLessThan(1);
    expect(Math.abs(s.ball.vel.y)).toBeLessThan(1e-6);
  });

  it('a kicked ball keeps its full launch speed through the start of its flight', () => {
    const s = setup();
    kickRight(s, 2);
    for (let i = 0; i < BALL_CRUISE_TICKS - 1; i++) step(s);
    expect(Math.hypot(s.ball.vel.x, s.ball.vel.y)).toBeCloseTo(SNAP_KICK_SPEED, 6);
  });

  it('a snap kick stays live for most of the arena width (>= 1300 units)', () => {
    const s = setup();
    kickRight(s, 2);
    expect(flyUntilNeutral(s).dist).toBeGreaterThanOrEqual(1300);
  });

  it('a full power kick crosses the arena, banks off the far wall and is still live past mid-arena', () => {
    const s = setup();
    const k = ofType(kickRight(s, KICK_CHARGE_FULL + 2), 'kick')[0];
    expect(k.speed).toBeCloseTo(POWER_KICK_MAX_SPEED);
    const { trace } = flyUntilNeutral(s);
    const back = trace.find((t) => t.bounces >= 1 && t.x <= 800);
    expect(back).toBeDefined();
    expect(Math.hypot(back!.vx, back!.vy)).toBeGreaterThan(BALL_LIVE_MIN_SPEED);
  });

  it('a slow ball is clearly safe: the live threshold is under half a snap kick', () => {
    expect(BALL_LIVE_MIN_SPEED).toBeLessThan(SNAP_KICK_SPEED / 2);
    expect(BALL_LIVE_MIN_SPEED).toBeGreaterThanOrEqual(400);
  });

  it('once harmless, the ball settles instead of drifting across the arena', () => {
    const s = setup();
    setBall(s, 300, 450, BALL_LIVE_MIN_SPEED - 1, 0, null);
    for (let i = 0; i < 60 * 5; i++) step(s);
    expect(s.ball.pos.x - 300).toBeLessThan(600);
    expect(Math.hypot(s.ball.vel.x, s.ball.vel.y)).toBeLessThan(5);
  });
});

describe('curve shots are deliberate and capped', () => {
  it('a lightly charged kick while moving sideways does not curve', () => {
    const s = setup();
    const k = ofType(kickRight(s, heldFor(CURVE_MIN_CHARGE * 0.6), 1), 'kick')[0];
    expect(k.curve).toBe(false);
    expect(s.ball.spin).toBe(0);
  });

  it('a kick charged past half while moving sideways curves toward the move side', () => {
    const s = setup();
    const k = ofType(kickRight(s, heldFor(CURVE_MIN_CHARGE), 1), 'kick')[0];
    expect(k.curve).toBe(true);
    expect(s.ball.spin).toBeGreaterThan(0);
  });

  /** Total heading change of a full-charge curve shot with no walls in the way. */
  function totalBend(hero: HeroId): number {
    const s = setup(hero);
    s.arena = { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
    kickRight(s, KICK_CHARGE_FULL + 2, 1);
    const a0 = Math.atan2(s.ball.vel.y, s.ball.vel.x);
    for (let i = 0; i < 60 * 8; i++) step(s);
    return Math.abs(Math.atan2(s.ball.vel.y, s.ball.vel.x) - a0) * (180 / Math.PI);
  }

  it('total bend is capped around 25–35° (× hero control)', () => {
    for (const h of ['kael', 'yuki', 'zap', 'brakka'] as HeroId[]) {
      const bend = totalBend(h);
      const cap = CURVE_BEND * HEROES[h].control * (180 / Math.PI);
      expect(bend).toBeLessThanOrEqual(cap + 1e-6);
      expect(bend).toBeGreaterThan(cap * 0.95);
      expect(bend).toBeLessThanOrEqual(35);
      expect(bend).toBeGreaterThanOrEqual(23);
    }
  });
});
