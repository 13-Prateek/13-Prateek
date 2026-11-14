import { describe, expect, it } from 'vitest';
import {
  CHARGE_MOVE_MULT, FIGHTER_MAX_SPEED, HITSTOP_CLASH, HITSTOP_KICK, HITSTOP_PERFECT, KICK_ACTIVE_TICKS,
  KICK_CHARGE_FULL, KICK_RECOVERY_TICKS, MAX_HP, PERFECT_SPEED_MULT, POWER_KICK_MAX_SPEED, SNAP_KICK_SPEED,
  TRAP_MAX_TICKS,
} from '../../src/shared/constants';
import { clearHitstop, I, ofType, park, playing, run, setBall, step, tapKick } from './helpers';
import { stepMatch } from '../../src/sim';

/** p0 at (400,450) facing p1 at (1200,450): p0's foot is at (452,450). */
const ballAtFoot = (s: ReturnType<typeof playing>) => setBall(s, 462, 450);

describe('snap and power kicks', () => {
  it('a tap is a snap kick toward the opponent when there is no aim', () => {
    const s = playing();
    ballAtFoot(s);
    const ev = tapKick(s, 0, 3);
    const k = ofType(ev, 'kick');
    expect(ofType(ev, 'kickStart')).toEqual([{ type: 'kickStart', player: 0, charge: 0 }]);
    expect(k).toHaveLength(1);
    expect(k[0].speed).toBeCloseTo(SNAP_KICK_SPEED);
    expect(k[0].dir.x).toBeCloseTo(1);
    expect(k[0].perfect).toBe(false);
    expect(k[0].curve).toBe(false);
    expect(s.ball.mode).toBe('live');
    expect(s.ball.owner).toBe(0);
    expect(s.hitstop).toBe(HITSTOP_KICK);
    expect(s.fighters[0].kickPhase).toBe('recovery');
  });

  it('kick direction follows the aim', () => {
    const s = playing();
    setBall(s, 400, 400); // above p0
    const k = ofType(tapKick(s, 0, 2, { aimX: 0, aimY: -1 }), 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].dir.y).toBeCloseTo(-1);
    expect(s.ball.vel.y).toBeLessThan(0);
  });

  it('holding charges a power kick: 60% move speed, one chargeFull, full speed on release', () => {
    const s = playing();
    park(s, 1);
    s.fighters[1].pos = { x: 1400, y: 450 };
    const f = s.fighters[0];
    let ev = step(s, { kick: true, moveY: 1 });
    ev.push(...run(s, KICK_CHARGE_FULL + 20, { kick: true, moveY: 1 }));
    expect(f.kickPhase).toBe('charging');
    expect(f.charge).toBe(1);
    expect(ofType(ev, 'chargeFull')).toHaveLength(1);
    expect(Math.hypot(f.vel.x, f.vel.y)).toBeLessThanOrEqual(FIGHTER_MAX_SPEED * CHARGE_MOVE_MULT + 1e-6);
    // put the ball on the foot and release
    s.fighters[1].pos = { x: f.pos.x + 800, y: f.pos.y };
    step(s, { kick: true });
    setBall(s, f.pos.x + 60, f.pos.y);
    ev = step(s, { kick: false });
    const k = ofType(ev, 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].speed).toBeCloseTo(POWER_KICK_MAX_SPEED);
    expect(k[0].power).toBeCloseTo(1);
    expect(ofType(ev, 'kickStart')[0].charge).toBe(1);
  });

  it('a whiffed kick goes active then recovers', () => {
    const s = playing();
    const f = s.fighters[0];
    tapKick(s, 0, 2);
    expect(f.kickPhase).toBe('active');
    run(s, KICK_ACTIVE_TICKS);
    expect(f.kickPhase).toBe('recovery');
    run(s, KICK_RECOVERY_TICKS);
    expect(f.kickPhase).toBe('idle');
  });

  it('kicking while moving sideways to the aim is a curve shot', () => {
    const s = playing();
    ballAtFoot(s);
    const k = ofType(tapKick(s, 0, 2, { moveY: 1 }), 'kick')[0];
    expect(k.curve).toBe(true);
    expect(s.ball.spin).toBeGreaterThan(0); // aim right, moving down → bends down (clockwise)
    const s2 = playing();
    ballAtFoot(s2);
    tapKick(s2, 0, 2, { moveY: -1 });
    expect(s2.ball.spin).toBeLessThan(0);
  });
});

describe('resolution order (GDD §4)', () => {
  it('foot beats body: an active kick on an incoming enemy ball is a kick, not a hit', () => {
    const s = playing();
    const v = s.fighters[1]; // at (1200,450) facing left, foot at (1148,450)
    setBall(s, 1000, 450, 1200, 0, 0);
    let ev = step(s, {}, { kick: true });
    ev.push(...step(s, {}, { kick: true }));
    ev.push(...step(s, {}, { kick: false })); // release: active
    ev.push(...run(s, 6));
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(ofType(ev, 'kick')).toHaveLength(1);
    expect(v.hp).toBe(MAX_HP);
    expect(s.ball.owner).toBe(1);
  });

  it('without a kick the same ball is a body hit', () => {
    const s = playing();
    setBall(s, 1000, 450, 1200, 0, 0);
    const ev = run(s, 12);
    expect(ofType(ev, 'hit')).toHaveLength(1);
    expect(s.fighters[1].hp).toBeLessThan(MAX_HP);
  });
});

describe('perfect return', () => {
  it('releasing just before impact is PERFECT: ×1.5 speed, big hitstop, callout', () => {
    const s = playing();
    setBall(s, 1000, 450, 1200, 0, 0);
    let ev = step(s, {}, { kick: true });
    ev.push(...step(s, {}, { kick: true }));
    ev.push(...step(s, {}, { kick: true }));
    ev.push(...step(s, {}, { kick: false }));
    ev.push(...run(s, 4));
    const k = ofType(ev, 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].perfect).toBe(true);
    expect(k[0].speed).toBeCloseTo(SNAP_KICK_SPEED * PERFECT_SPEED_MULT);
    expect(ofType(ev, 'callout').map((c) => c.text)).toContain('PERFECT!');
    expect(s.hitstop).toBeGreaterThan(HITSTOP_PERFECT - 5);
  });

  it('a kick released too early to be perfect still returns the ball', () => {
    const s = playing();
    setBall(s, 1060, 450, 600, 0, 0); // slow: ~10 u/tick, the foot zone starts at x=1100
    const ev = step(s, {}, { kick: true });
    ev.push(...step(s, {}, { kick: false }));
    ev.push(...run(s, 8));
    const k = ofType(ev, 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].perfect).toBe(false);
  });

  it('kicking a neutral ball is never perfect', () => {
    const s = playing();
    setBall(s, 1140, 450, 0, 0, null);
    const k = ofType(tapKick(s, 1, 1), 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].perfect).toBe(false);
  });
});

describe('clash', () => {
  const setup = (heroes: ['kael', 'kael'] | ['kael', 'yuki'] = ['kael', 'kael']) => {
    const s = playing(1, heroes);
    s.fighters[0].pos = { x: 700, y: 450 };
    s.fighters[1].pos = { x: 900, y: 450 };
    setBall(s, 800, 450);
    return s;
  };

  it('same-tick double touch with equal strength: freeze, ball pops up neutral', () => {
    const s = setup();
    step(s, { kick: true }, { kick: true });
    const ev = step(s, { kick: false }, { kick: false });
    const c = ofType(ev, 'clash');
    expect(c).toHaveLength(1);
    expect(c[0].winner).toBeNull();
    expect(ofType(ev, 'kick')).toHaveLength(0);
    expect(s.hitstop).toBe(HITSTOP_CLASH);
    expect(s.ball.mode).toBe('neutral');
    expect(s.ball.vel.x).toBe(0);
    expect(s.ball.vel.y).toBeLessThan(0);
  });

  it('the stronger kick (charge × power × element) wins and kicks the ball', () => {
    const s = setup();
    stepMatch(s, [I({ kick: true }), I()]);
    for (let i = 0; i < 40; i++) stepMatch(s, [I({ kick: true }), I(i === 39 ? { kick: true } : {})]);
    s.fighters[0].pos = { x: 700, y: 450 };
    s.fighters[1].pos = { x: 900, y: 450 };
    setBall(s, 800, 450);
    const ev = step(s, { kick: false }, { kick: false });
    expect(ofType(ev, 'clash')[0].winner).toBe(0);
    const k = ofType(ev, 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].player).toBe(0);
    expect(s.ball.owner).toBe(0);
    expect(s.fighters[1].kickPhase).toBe('recovery');
  });

  it('element advantage breaks a snap-vs-snap tie (fire beats frost)', () => {
    const s = setup(['kael', 'yuki']);
    step(s, { kick: true }, { kick: true });
    const ev = step(s, { kick: false }, { kick: false });
    expect(ofType(ev, 'clash')[0].winner).toBe(0);
  });
});

describe('trap and dribble', () => {
  it('hold trap near the ball to carry it; let go to drop it', () => {
    const s = playing();
    setBall(s, 470, 470);
    let ev = step(s, { trap: true });
    expect(ofType(ev, 'trap')).toHaveLength(1);
    expect(s.ball.heldBy).toBe(0);
    expect(s.fighters[0].trapping).toBe(true);
    run(s, 30, { trap: true, moveY: 1 });
    const f = s.fighters[0];
    expect(s.ball.pos.x).toBeCloseTo(f.pos.x + f.facing.x * 52);
    expect(s.ball.pos.y).toBeCloseTo(f.pos.y + f.facing.y * 52);
    ev = step(s, { trap: false });
    expect(ofType(ev, 'trapRelease')).toEqual([{ type: 'trapRelease', player: 0, forced: false }]);
    expect(s.ball.heldBy).toBeNull();
  });

  it('pops loose after TRAP_MAX_TICKS (forced) and can not be re-grabbed until trap is released', () => {
    const s = playing();
    setBall(s, 470, 450);
    let ev = run(s, TRAP_MAX_TICKS + 2, { trap: true });
    const rel = ofType(ev, 'trapRelease');
    expect(rel).toHaveLength(1);
    expect(rel[0].forced).toBe(true);
    expect(s.ball.heldBy).toBeNull();
    ev = run(s, 5, { trap: true });
    expect(ofType(ev, 'trap')).toHaveLength(0);
    step(s, { trap: false });
    expect(s.fighters[0].trapLock).toBe(false);
  });

  it('kicking while trapping kicks the held ball instantly', () => {
    const s = playing();
    setBall(s, 470, 450);
    step(s, { trap: true });
    step(s, { trap: true, kick: true });
    const ev = step(s, { trap: true, kick: false });
    const k = ofType(ev, 'kick');
    expect(k).toHaveLength(1);
    expect(k[0].speed).toBeCloseTo(SNAP_KICK_SPEED);
    expect(s.ball.heldBy).toBeNull();
    expect(s.ball.mode).toBe('live');
    expect(s.ball.vel.x).toBeGreaterThan(0);
  });

  it('can catch a slow enemy ball but not a fast one', () => {
    const slow = playing();
    setBall(slow, 1000, 450, 700, 0, 0);
    run(slow, 12, {}, { trap: true });
    expect(slow.ball.heldBy).toBe(1);
    expect(slow.fighters[1].hp).toBe(MAX_HP);

    const fast = playing();
    setBall(fast, 1000, 450, 1400, 0, 0);
    const ev = run(fast, 10, {}, { trap: true });
    expect(fast.ball.heldBy).not.toBe(1);
    expect(ofType(ev, 'hit')).toHaveLength(1);
  });

  it('an enemy kick steals a trapped ball', () => {
    const s = playing();
    s.fighters[1].pos = { x: 540, y: 450 }; // p1 foot at (488,450); p0 foot (and held ball) at (452,450)
    setBall(s, 470, 450);
    step(s, { trap: true }, { kick: true });
    expect(s.ball.heldBy).toBe(0);
    const ev = step(s, { trap: true }, { kick: false });
    clearHitstop(s);
    expect(ofType(ev, 'kick')[0]?.player).toBe(1);
    expect(ofType(ev, 'trapRelease')).toEqual([{ type: 'trapRelease', player: 0, forced: true }]);
    expect(s.ball.owner).toBe(1);
  });
});
