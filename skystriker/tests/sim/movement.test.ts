import { describe, expect, it } from 'vitest';
import {
  DASH_COOLDOWN, DASH_INVULN, DASH_SPEED, FIGHTER_BODY_RADIUS, FIGHTER_MAX_SPEED, WALL_KICKOFF_SPEED,
} from '../../src/shared/constants';
import { match, ofType, playing, run, step } from './helpers';

const speed = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('flight', () => {
  it('accelerates toward input, caps at max speed, drifts to a stop under drag', () => {
    const s = playing();
    const f = s.fighters[0];
    step(s, { moveX: 1 });
    expect(f.vel.x).toBeGreaterThan(0);
    run(s, 60, { moveX: 1 });
    expect(speed(f.vel)).toBeLessThanOrEqual(FIGHTER_MAX_SPEED + 1e-6);
    expect(speed(f.vel)).toBeGreaterThan(400);
    const x = f.pos.x;
    run(s, 5);
    expect(f.pos.x).toBeGreaterThan(x); // momentum: keeps drifting
    run(s, 120);
    expect(speed(f.vel)).toBeLessThan(5);
  });

  it('diagonal keyboard input is not faster than straight', () => {
    const a = playing(), b = playing();
    run(a, 60, { moveX: 1 });
    run(b, 60, { moveX: 1, moveY: -1 });
    expect(speed(b.fighters[0].vel)).toBeCloseTo(speed(a.fighters[0].vel), 3);
  });

  it('stops at walls (body edge touches the wall)', () => {
    const s = playing();
    run(s, 180, { moveX: -1 });
    const f = s.fighters[0];
    expect(f.pos.x).toBeCloseTo(s.arena.left + FIGHTER_BODY_RADIUS, 6);
    expect(f.vel.x).toBeCloseTo(0, 6);
  });

  it('fighters cannot move during the countdown', () => {
    const s = match();
    const x = s.fighters[0].pos.x;
    run(s, 100, { moveX: 1 });
    expect(s.phase).toBe('countdown');
    expect(s.fighters[0].pos.x).toBe(x);
  });
});

describe('facing', () => {
  it('follows the aim input', () => {
    const s = playing();
    step(s, { aimX: 0, aimY: -1 });
    expect(s.fighters[0].facing.x).toBeCloseTo(0);
    expect(s.fighters[0].facing.y).toBeCloseTo(-1);
  });
  it('faces the opponent when there is no aim', () => {
    const s = playing();
    s.fighters[1].pos = { x: 400, y: 100 }; // straight above p0 (400,450)
    step(s);
    expect(s.fighters[0].facing.x).toBeCloseTo(0);
    expect(s.fighters[0].facing.y).toBeCloseTo(-1);
  });
});

describe('dash', () => {
  it('bursts in the move direction with invulnerability and a cooldown', () => {
    const s = playing();
    const ev = step(s, { moveY: 1, dash: true });
    const f = s.fighters[0];
    const d = ofType(ev, 'dash');
    expect(d).toHaveLength(1);
    expect(d[0].dir.y).toBeCloseTo(1);
    expect(d[0].wallKick).toBeUndefined();
    expect(f.vel.y).toBeCloseTo(DASH_SPEED);
    expect(f.invulnTimer).toBe(DASH_INVULN);
    expect(f.dashCooldown).toBe(DASH_COOLDOWN);
    // Held button doesn't re-dash; a new press during cooldown does nothing.
    step(s, { dash: false });
    expect(ofType(step(s, { moveY: 1, dash: true }), 'dash')).toHaveLength(0);
    run(s, DASH_COOLDOWN);
    expect(ofType(step(s, { moveY: 1, dash: true }), 'dash')).toHaveLength(1);
  });

  it('dashes along facing when not moving', () => {
    const s = playing();
    const ev = step(s, { dash: true });
    expect(ofType(ev, 'dash')[0].dir.x).toBeCloseTo(1); // p0 faces p1 (right)
  });

  it('wall kick-off launches away from the wall', () => {
    const s = playing();
    run(s, 180, { moveX: -1 });
    const ev = step(s, { moveX: -1, dash: true });
    const d = ofType(ev, 'dash')[0];
    expect(d.wallKick).toBe(true);
    expect(d.dir.x).toBeCloseTo(1);
    expect(s.fighters[0].vel.x).toBeCloseTo(WALL_KICKOFF_SPEED);
  });

  it('wall kick-off keeps the sideways part of the input', () => {
    const s = playing();
    run(s, 180, { moveX: -1 });
    const d = ofType(step(s, { moveX: -1, moveY: -1, dash: true }), 'dash')[0];
    expect(d.dir.x).toBeGreaterThan(0.5);
    expect(d.dir.y).toBeLessThan(-0.5);
  });
});
