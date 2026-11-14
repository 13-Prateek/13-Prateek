import { describe, expect, it } from 'vitest';
import { BALL_LIVE_MIN_SPEED, BALL_MAX_SPEED, BALL_WALL_RESTITUTION, MAX_HP } from '../../src/shared/constants';
import { ofType, park, playing, run, setBall, step } from './helpers';

describe('ball physics', () => {
  it('drag slows the ball; a live ball goes neutral below BALL_LIVE_MIN_SPEED', () => {
    const s = playing();
    park(s, 0); park(s, 1);
    setBall(s, 800, 450, 0, -BALL_LIVE_MIN_SPEED - 20, 0);
    s.ball.pos.y = 450; // free space vertically: arena top is 40
    let ev = step(s);
    expect(s.ball.mode).toBe('live');
    ev = run(s, 30);
    expect(s.ball.mode).toBe('neutral');
    expect(ofType(ev, 'ballNeutral')).toHaveLength(1);
    expect(s.ball.owner).toBe(0); // last kicker remembered
  });

  it('bounces off walls with restitution, counts bounces and emits bounce', () => {
    const s = playing();
    park(s, 0); park(s, 1);
    setBall(s, 1500, 600, 1200, 0, 0);
    const ev = run(s, 10);
    const bounces = ofType(ev, 'bounce');
    expect(bounces).toHaveLength(1);
    expect(bounces[0].normal).toEqual({ x: -1, y: 0 });
    expect(bounces[0].pos.x).toBeCloseTo(s.arena.right);
    expect(s.ball.vel.x).toBeLessThan(0);
    expect(Math.abs(s.ball.vel.x)).toBeLessThan(1200 * BALL_WALL_RESTITUTION);
    expect(s.ball.bounces).toBe(1);
    expect(s.ball.pos.x).toBeLessThanOrEqual(s.arena.right - s.ball.radius);
  });

  it('spin curves the path perpendicular to velocity (+ = clockwise) and decays', () => {
    const s = playing();
    park(s, 0); park(s, 1);
    setBall(s, 300, 450, 1000, 0, 0);
    s.ball.spin = 1.5;
    run(s, 20);
    expect(s.ball.vel.y).toBeGreaterThan(50); // clockwise on a y-down screen: rightward turns downward
    expect(s.ball.spin).toBeLessThan(1.5);
    expect(s.ball.spin).toBeGreaterThan(0);
  });

  it('does not tunnel through a body at max speed', () => {
    const s = playing();
    park(s, 0);
    const v = s.fighters[1];
    v.pos = { x: 1000, y: 450 };
    setBall(s, 700, 450, BALL_MAX_SPEED, 0, 0);
    const ev = run(s, 20);
    expect(ofType(ev, 'hit')).toHaveLength(1);
    expect(v.hp).toBeLessThan(MAX_HP);
  });

  it('a neutral ball never hurts, it bumps', () => {
    const s = playing();
    park(s, 0);
    const v = s.fighters[1];
    v.pos = { x: 1000, y: 450 };
    setBall(s, 800, 450, 1500, 0, null);
    const ev = run(s, 20);
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(ofType(ev, 'bump').length).toBeGreaterThan(0);
    expect(v.hp).toBe(MAX_HP);
    expect(s.ball.vel.x).toBeLessThan(0);
  });

  it('a live ball never hurts its owner', () => {
    const s = playing();
    park(s, 1);
    const o = s.fighters[0];
    o.pos = { x: 1000, y: 450 };
    setBall(s, 800, 450, 1500, 0, 0);
    const ev = run(s, 20);
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(o.hp).toBe(MAX_HP);
  });
});
