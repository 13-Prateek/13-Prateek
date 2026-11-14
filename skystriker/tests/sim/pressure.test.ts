/**
 * Pressure pass (lead brief, owner-approved): dodging costs something, rallies escalate,
 * rounds don't stall. Pins the targets from the brief.
 */
import { describe, expect, it } from 'vitest';
import {
  DASH_COOLDOWN, DASH_TICKS, FIGHTER_MAX_SPEED, FINAL_RUSH_MIN_W, FINAL_RUSH_TICKS, HEAT_MAX,
  HEAT_SPEED_PER_LEVEL, MAX_HP, PHASE_DASH_COST, PHASE_WINDED_MULT, PHASE_WINDED_TICKS, ROUND_TIME,
  SNAP_KICK_SPEED, WINDED_MULT, WINDED_TICKS,
} from '../../src/shared/constants';
import type { GameEvent, MatchState } from '../../src/shared/types';
import { stepMatch } from '../../src/sim';
import { I, ofType, park, playing, run, setBall, step } from './helpers';

const speed = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

/** Release a snap kick from p0 (at 400,450, aiming right) with the ball placed on the foot just before release. */
function snapFromP0(s: MatchState, ball: (s: MatchState) => void): GameEvent[] {
  const ev = step(s, { kick: true, aimX: 1 });
  ball(s);
  ev.push(...step(s, { kick: false, aimX: 1 }));
  return ev;
}

describe('faster ball: shots are hard to dodge by just flying', () => {
  /** Seconds of simulated flight (hitstop excluded) for a snap whose ball starts 800 u from the target's centre. */
  function arrival(heatBefore: number): { secs: number; kickSpeed: number } {
    const s = playing();
    s.fighters[0].pos = { x: 400, y: 450 };
    s.fighters[1].pos = { x: 460 + 800, y: 450 };
    // a live enemy ball at rest on the foot: kicking it back is a return (heat +1)
    const ev = snapFromP0(s, (st) => {
      if (heatBefore < 0) setBall(st, 460, 450);
      else { setBall(st, 460, 450, 0, 0, 1); st.ball.heat = heatBefore; }
    });
    const kickSpeed = ofType(ev, 'kick')[0].speed;
    let ticks = 0;
    for (let i = 0; i < 120; i++) {
      const frozen = s.hitstop > 0;
      const e = stepMatch(s, [I(), I()]);
      if (!frozen) ticks++;
      if (ofType(e, 'hit').length) break;
    }
    return { secs: ticks / 60, kickSpeed };
  }

  it('a heat-0 snap from 800 u arrives in <= 0.65 s', () => {
    const r = arrival(-1);
    expect(r.kickSpeed).toBeCloseTo(SNAP_KICK_SPEED);
    expect(r.secs).toBeLessThanOrEqual(0.65);
  });

  it('a heat-4 snap from 800 u arrives in <= 0.5 s', () => {
    const r = arrival(3); // the return makes it heat 4
    expect(r.kickSpeed).toBeCloseTo(SNAP_KICK_SPEED * (1 + HEAT_SPEED_PER_LEVEL * 4));
    expect(r.secs).toBeLessThanOrEqual(0.5);
  });
});

describe('free dash: no invulnerability, then Winded', () => {
  it('a dash gives no invulnerability: a ball still hits you mid-dash', () => {
    const s = playing();
    const v = s.fighters[1];
    setBall(s, 1120, 450, 1500, 0, 0);
    const ev = step(s, {}, { dash: true, moveY: -1 });
    expect(ofType(ev, 'dash')).toHaveLength(1);
    expect(v.invulnTimer).toBe(0);
    ev.push(...run(s, 20));
    expect(ofType(ev, 'hit').length).toBeGreaterThan(0);
    expect(v.hp).toBeLessThan(MAX_HP);
  });

  it('you are Winded when the burst ends: slower for WINDED_TICKS, with a `winded` event', () => {
    const s = playing();
    const f = s.fighters[0];
    let ev = step(s, { dash: true, moveY: 1 });
    ev = ev.concat(run(s, DASH_TICKS - 1, { moveY: 1 }));
    expect(ofType(ev, 'winded')).toHaveLength(0);
    ev = step(s, { moveY: 1 });
    expect(ofType(ev, 'winded')).toEqual([{ type: 'winded', player: 0, ticks: WINDED_TICKS }]);
    expect(f.winded).toBe(WINDED_TICKS);
    // From rest, a winded fighter can't exceed half speed; a fresh one goes well past it.
    f.vel = { x: 0, y: 0 };
    run(s, WINDED_TICKS - 2, { moveX: 1 });
    expect(speed(f.vel)).toBeLessThanOrEqual(FIGHTER_MAX_SPEED * WINDED_MULT + 1e-6);
    const fresh = playing();
    run(fresh, WINDED_TICKS - 2, { moveX: 1 });
    expect(speed(fresh.fighters[0].vel)).toBeGreaterThan(speed(f.vel) * 1.6);
    run(s, 3);
    expect(f.winded).toBe(0);
  });

  it('dash cooldown is 1.2 s', () => {
    expect(DASH_COOLDOWN).toBe(72);
  });
});

describe('Phase Dash (Q)', () => {
  it('spends 50 aura, emits phaseDash (not dash), and the ball passes through you', () => {
    const s = playing();
    const v = s.fighters[1];
    v.aura = 120;
    setBall(s, 1120, 450, 1500, 0, 0);
    const ev = step(s, {}, { phaseDash: true, moveY: -1 });
    expect(ofType(ev, 'phaseDash')).toHaveLength(1);
    expect(ofType(ev, 'dash')).toHaveLength(0);
    expect(v.aura).toBe(120 - PHASE_DASH_COST);
    expect(v.phaseDashTimer).toBeGreaterThan(DASH_TICKS - 1);
    ev.push(...run(s, 20));
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(v.hp).toBe(MAX_HP);
  });

  it('leaves you Winded longer and slower than a free dash', () => {
    const s = playing();
    const f = s.fighters[0];
    f.aura = 60;
    const ev = step(s, { phaseDash: true, moveY: 1 }).concat(run(s, DASH_TICKS, { moveY: 1 }));
    expect(ofType(ev, 'winded')).toEqual([{ type: 'winded', player: 0, ticks: PHASE_WINDED_TICKS }]);
    expect(f.windedMult).toBe(PHASE_WINDED_MULT);
    expect(PHASE_WINDED_TICKS).toBeGreaterThan(WINDED_TICKS);
    expect(PHASE_WINDED_MULT).toBeLessThan(WINDED_MULT);
  });

  it('with 49 aura it emits noAura and does nothing', () => {
    const s = playing();
    const f = s.fighters[0];
    f.aura = 49;
    const ev = step(s, { phaseDash: true, moveY: 1 });
    expect(ofType(ev, 'noAura')).toEqual([{ type: 'noAura', player: 0, action: 'phaseDash' }]);
    expect(ofType(ev, 'phaseDash')).toHaveLength(0);
    expect(ofType(ev, 'dash')).toHaveLength(0);
    expect(f.aura).toBe(49);
    expect(f.dashCooldown).toBe(0);
    expect(f.phaseDashTimer ?? 0).toBe(0);
  });

  it('shares the dash cooldown: on cooldown nothing happens and no aura is spent', () => {
    const s = playing();
    const f = s.fighters[0];
    f.aura = 100;
    step(s, { dash: true });
    step(s);
    const ev = step(s, { phaseDash: true });
    expect(ofType(ev, 'phaseDash')).toHaveLength(0);
    expect(ofType(ev, 'noAura')).toHaveLength(0);
    expect(f.aura).toBe(100);
  });

  it('E without enough aura emits noAura (infuse)', () => {
    const s = playing();
    s.fighters[0].aura = 99;
    expect(ofType(step(s, { infuse: true }), 'noAura')).toEqual([{ type: 'noAura', player: 0, action: 'infuse' }]);
  });
});

describe('Rally Heat', () => {
  /** p0 kicks a ball placed on its foot: owner 1 = a return, owner 0 = own ball, null = neutral. */
  function kickWith(owner: 0 | 1 | null, heat: number) {
    const s = playing();
    park(s, 1);
    const ev = snapFromP0(s, (st) => { setBall(st, 460, 450, 0, 0, owner); st.ball.heat = heat; });
    return { s, ev, kick: ofType(ev, 'kick')[0], heatEv: ofType(ev, 'heat') };
  }

  it('a return raises heat by 1 and the ball flies faster', () => {
    const { s, kick, heatEv } = kickWith(1, 2);
    expect(s.ball.heat).toBe(3);
    expect(heatEv).toEqual([{ type: 'heat', level: 3, pos: expect.any(Object) }]);
    expect(kick.speed).toBeCloseTo(SNAP_KICK_SPEED * (1 + HEAT_SPEED_PER_LEVEL * 3));
  });

  it('is capped at HEAT_MAX', () => {
    const { s, heatEv } = kickWith(1, HEAT_MAX);
    expect(s.ball.heat).toBe(HEAT_MAX);
    expect(heatEv).toHaveLength(0); // unchanged → no event
  });

  it('kicking your own live ball keeps the heat; a fresh neutral ball has none', () => {
    expect(kickWith(0, 2).s.ball.heat).toBe(2);
    const n = kickWith(null, 0);
    expect(n.s.ball.heat).toBe(0);
    expect(n.kick.speed).toBeCloseTo(SNAP_KICK_SPEED);
  });

  it('resets to 0 (with an event) when the ball hits someone', () => {
    const s = playing();
    setBall(s, 1000, 450, 1400, 0, 0);
    s.ball.heat = 3;
    const ev = run(s, 15);
    expect(ofType(ev, 'hit')).toHaveLength(1);
    expect(s.ball.heat).toBe(0);
    expect(ofType(ev, 'heat').map((h) => h.level)).toEqual([0]);
  });

  it('resets when the ball goes neutral', () => {
    const s = playing();
    park(s, 0); park(s, 1);
    setBall(s, 800, 450, 0, 500, 0);
    s.ball.heat = 2;
    const ev = run(s, 30);
    expect(ofType(ev, 'ballNeutral')).toHaveLength(1);
    expect(s.ball.heat).toBe(0);
    expect(ofType(ev, 'heat').map((h) => h.level)).toEqual([0]);
  });

  it('resets when the ball is trapped', () => {
    const s = playing();
    setBall(s, 470, 450, 0, 0, null);
    s.ball.heat = 2;
    const ev = step(s, { trap: true });
    expect(ofType(ev, 'trap')).toHaveLength(1);
    expect(s.ball.heat).toBe(0);
    expect(ofType(ev, 'heat').map((h) => h.level)).toEqual([0]);
  });

  it('a real rally climbs: each return adds one', () => {
    const s = playing();
    s.fighters[0].pos = { x: 400, y: 450 };
    s.fighters[1].pos = { x: 1200, y: 450 };
    const levels: number[] = [];
    for (let i = 0; i < 4; i++) {
      const kicker = i % 2 === 0 ? 0 : 1;
      const f = s.fighters[kicker];
      const owner = i === 0 ? null : (kicker === 0 ? 1 : 0);
      const press = (k: boolean) => step(s, kicker === 0 ? { kick: k } : {}, kicker === 1 ? { kick: k } : {});
      press(true);
      const h = s.ball.heat ?? 0;
      setBall(s, f.pos.x + f.facing.x * 60, f.pos.y, 0, 0, owner);
      s.ball.heat = h;
      press(false);
      levels.push(s.ball.heat ?? 0);
      run(s, 20); // recover
    }
    expect(levels).toEqual([0, 1, 2, 3]);
  });
});

describe('Final Rush', () => {
  it('triggers once at 20 s left, closes the walls gently, and sets a heat floor of 1', () => {
    const s = playing();
    s.phaseTimer = FINAL_RUSH_TICKS + 2;
    let ev = run(s, 1);
    expect(s.finalRush).toBe(false);
    ev = run(s, 120);
    expect(ofType(ev, 'finalRush')).toHaveLength(1);
    expect(s.finalRush).toBe(true);
    const w = s.arena.right - s.arena.left;
    expect(w).toBeLessThan(1520 - 30);
    run(s, 60 * 30); // walls stop at the Final Rush minimum (timer ran out → sudden death or round over)
    if (!s.suddenDeath) expect(s.arena.right - s.arena.left).toBeGreaterThanOrEqual(FINAL_RUSH_MIN_W - 1e-6);
  });

  it('every kick in Final Rush has heat >= 1', () => {
    const s = playing();
    park(s, 1);
    s.phaseTimer = FINAL_RUSH_TICKS;
    run(s, 1);
    expect(s.finalRush).toBe(true);
    const ev = snapFromP0(s, (st) => setBall(st, 460, 450));
    expect(s.ball.heat).toBe(1);
    expect(ofType(ev, 'kick')[0].speed).toBeCloseTo(SNAP_KICK_SPEED * (1 + HEAT_SPEED_PER_LEVEL));
  });

  it('is cleared on the next round', () => {
    const s = playing();
    s.phaseTimer = FINAL_RUSH_TICKS;
    run(s, 1);
    s.fighters[1].hp = 1;
    setBall(s, 1050, 450, 1400, 0, 0);
    run(s, 30);
    while (s.phase !== 'countdown') stepMatch(s, [I(), I()]);
    expect(s.finalRush).toBe(false);
    expect(s.round).toBe(2);
    expect(s.arena.right - s.arena.left).toBe(1520);
  });

  it('does not trigger early in a round', () => {
    const s = playing();
    expect(s.phaseTimer).toBe(ROUND_TIME);
    const ev = run(s, 60 * 10);
    expect(ofType(ev, 'finalRush')).toHaveLength(0);
  });
});
