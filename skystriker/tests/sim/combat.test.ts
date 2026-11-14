import { describe, expect, it } from 'vitest';
import { computeDamage } from '../../src/sim/combat';
import {
  AURA_GAIN_CLOSE_CALL, AURA_GAIN_HIT_LANDED, AURA_GAIN_HIT_TAKEN, AURA_GAIN_KICK, HITSTOP_HIT, HITSTUN_TICKS,
  MAX_HP, WALL_SPLAT_DAMAGE,
} from '../../src/shared/constants';
import { clearHitstop, ofType, park, playing, run, setBall, step, tapKick } from './helpers';

describe('damage formula (GDD §6)', () => {
  const s = playing(); // p0 Kael (power 1.1), p1 Yuki (power 0.95)
  const [kael, yuki] = s.fighters;
  const dmg = (speed: number, bounces = 0, infused = false, a = kael, v = yuki) =>
    computeDamage(speed, bounces, a, v, infused).damage;

  it('scales linearly from DAMAGE_MIN at live speed to DAMAGE_MAX at max power, × hero power', () => {
    expect(dmg(420)).toBe(4); // 4 × 1.1 = 4.4
    expect(dmg(1700)).toBe(18); // 16 × 1.1 = 17.6
    expect(dmg(1700, 0, false, yuki, kael)).toBe(15); // 16 × 0.95 = 15.2
  });
  it('keeps rising above max power (perfect returns hit harder through speed alone)', () => {
    expect(dmg(2550)).toBe(26); // (4 + 12 × 1.664) × 1.1
  });
  it('bank bonus +15% per bounce, max 2', () => {
    expect(dmg(1700, 1)).toBe(20); // 17.6 × 1.15
    expect(dmg(1700, 2)).toBe(23); // 17.6 × 1.3
    expect(dmg(1700, 5)).toBe(23);
  });
  it('infuse ×1.2', () => {
    expect(dmg(1700, 0, true)).toBe(21);
  });
  it('combo scaling uses the hits already taken in this hitstun', () => {
    const v = { ...yuki, hitstun: 5, comboAgainst: 1 };
    expect(computeDamage(1700, 0, kael, v, false).damage).toBe(14); // 17.6 × 0.8
    expect(computeDamage(1700, 0, kael, { ...v, comboAgainst: 9 }, false).damage).toBe(7); // × 0.4 floor
    expect(computeDamage(1700, 0, kael, { ...v, hitstun: 0, comboAgainst: 3 }, false).damage).toBe(18);
  });
});

describe('hits', () => {
  it('a hit deals damage, hitstun, knockback along the ball, hitstop, and the ball rebounds still live', () => {
    const s = playing();
    const v = s.fighters[1];
    setBall(s, 1000, 450, 1200, 0, 0);
    const ev = run(s, 12);
    const h = ofType(ev, 'hit');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ target: 1, attacker: 0, bank: 0, combo: 1, element: null });
    expect(h[0].pos.x).toBeCloseTo(1200 - 34, 0);
    expect(h[0].damage).toBe(computeDamage(h[0].speed, 0, s.fighters[0], { ...v, hitstun: 0 }, false).damage);
    expect(v.hp).toBe(MAX_HP - h[0].damage);
    expect(v.vel.x).toBeGreaterThan(400);
    expect(v.hitstun).toBeGreaterThan(0);
    expect(v.hitstun).toBeLessThanOrEqual(HITSTUN_TICKS);
    expect(s.ball.mode).toBe('live');
    expect(s.ball.owner).toBe(0);
    expect(s.ball.vel.x).toBeLessThan(0);
  });

  it('sets HITSTOP_HIT on impact', () => {
    const s = playing();
    setBall(s, 1100, 450, 1200, 0, 0);
    let ev = step(s);
    while (ofType(ev, 'hit').length === 0) ev = step(s);
    expect(s.hitstop).toBe(HITSTOP_HIT);
  });

  it('a bank shot (off a wall) gets the bonus and a callout', () => {
    const s = playing();
    s.fighters[1].pos = { x: 1200, y: 450 };
    setBall(s, 1200, 200, 0, -1300, 0);
    const ev = run(s, 40);
    const h = ofType(ev, 'hit');
    expect(h).toHaveLength(1);
    expect(h[0].bank).toBe(1);
    expect(ofType(ev, 'callout').map((c) => c.text)).toContain('BANK SHOT!');
  });

  it('two bounces is a DOUBLE BANK (tier 3)', () => {
    const s = playing();
    setBall(s, 1000, 450, 1200, 0, 0);
    s.ball.bounces = 2;
    const ev = run(s, 12);
    const c = ofType(ev, 'callout').find((x) => x.text === 'DOUBLE BANK!');
    expect(c).toMatchObject({ player: 0, tier: 3 });
  });

  it('combo counter rises for hits during hitstun, scales damage, and resets after', () => {
    const s = playing();
    const v = s.fighters[1];
    setBall(s, 1100, 450, 1200, 0, 0);
    run(s, 6);
    clearHitstop(s);
    expect(v.comboAgainst).toBe(1);
    // second ball while still stunned
    setBall(s, v.pos.x - 100, v.pos.y, 1500, 0, 0);
    let ev = run(s, 6);
    ev = ev.concat(clearHitstop(s));
    const h = ofType(ev, 'hit');
    expect(h).toHaveLength(1);
    expect(h[0].combo).toBe(2);
    expect(ofType(ev, 'callout').map((c) => c.text)).toContain('2-HIT COMBO!');
    s.ball.mode = 'neutral';
    run(s, HITSTUN_TICKS + 1);
    expect(v.hitstun).toBe(0);
    expect(v.comboAgainst).toBe(0);
  });

  it('wall splat: a stunned fighter slamming a wall takes damage and bounces off', () => {
    const s = playing();
    const v = s.fighters[1];
    v.pos = { x: 1420, y: 450 };
    setBall(s, 1250, 450, 1700, 0, 0);
    let ev = run(s, 30);
    ev = ev.concat(clearHitstop(s));
    const sp = ofType(ev, 'wallSplat');
    expect(sp).toHaveLength(1);
    expect(sp[0]).toMatchObject({ target: 1, damage: WALL_SPLAT_DAMAGE, normal: { x: -1, y: 0 } });
    const hitDmg = ofType(ev, 'hit')[0].damage;
    expect(v.hp).toBe(MAX_HP - hitDmg - WALL_SPLAT_DAMAGE);
    expect(v.vel.x).toBeLessThanOrEqual(0);
    expect(ofType(ev, 'callout').map((c) => c.text)).toContain('WALL SPLAT!');
  });
});

describe('close calls', () => {
  it('an enemy ball whizzing past (no hit) gives one CLOSE CALL and aura', () => {
    const s = playing();
    const v = s.fighters[1];
    setBall(s, 900, 450 - (34 + 18 + 10), 1200, 0, 0);
    const ev = run(s, 30);
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(ofType(ev, 'closeCall')).toHaveLength(1);
    expect(ofType(ev, 'callout').find((c) => c.text === 'CLOSE CALL!')).toMatchObject({ player: 1, tier: 1 });
    expect(v.aura).toBeCloseTo(AURA_GAIN_CLOSE_CALL);
  });

  it('a hit is not a close call', () => {
    const s = playing();
    setBall(s, 1000, 450, 1200, 0, 0);
    const ev = run(s, 40);
    expect(ofType(ev, 'closeCall')).toHaveLength(0);
  });

  it('dashing through the ball: invulnerable, no damage, counts as a close call', () => {
    const s = playing();
    const v = s.fighters[1];
    setBall(s, 1120, 450, 1500, 0, 0);
    const ev = step(s, {}, { dash: true, moveY: -1 });
    ev.push(...run(s, 20));
    expect(ofType(ev, 'hit')).toHaveLength(0);
    expect(v.hp).toBe(MAX_HP);
    expect(ofType(ev, 'closeCall')).toHaveLength(1);
  });
});

describe('aura and infuse', () => {
  it('kicks, hits landed and hits taken give aura; crossing a bar emits auraBar', () => {
    const s = playing();
    const [a, v] = s.fighters;
    a.aura = 95;
    setBall(s, 462, 450);
    let ev = tapKick(s, 0, 2);
    expect(a.aura).toBeCloseTo(95 + AURA_GAIN_KICK);
    expect(ofType(ev, 'auraBar')).toEqual([{ type: 'auraBar', player: 0, bars: 1 }]);
    ev = run(s, 120);
    expect(ofType(ev, 'hit')).toHaveLength(1);
    expect(a.aura).toBeCloseTo(95 + AURA_GAIN_KICK + AURA_GAIN_HIT_LANDED);
    expect(v.aura).toBeCloseTo(AURA_GAIN_HIT_TAKEN);
  });

  it('E with 1 bar infuses the next kick: element on the ball, ×1.2 damage', () => {
    const s = playing();
    const a = s.fighters[0];
    a.aura = 100;
    let ev = step(s, { infuse: true });
    expect(ofType(ev, 'infuse')).toEqual([{ type: 'infuse', player: 0, element: 'fire' }]);
    expect(ofType(ev, 'auraBar')).toEqual([{ type: 'auraBar', player: 0, bars: 0 }]);
    expect(a.infused).toBe(true);
    expect(a.aura).toBe(0);
    setBall(s, 462, 450);
    ev = tapKick(s, 0, 2);
    expect(ofType(ev, 'kick')[0].element).toBe('fire');
    expect(a.infused).toBe(false);
    ev = run(s, 120);
    const h = ofType(ev, 'hit')[0];
    expect(h.element).toBe('fire');
    expect(h.damage).toBe(computeDamage(h.speed, 0, a, { ...s.fighters[1], hitstun: 0 }, true).damage);
  });

  it('E without a full bar does nothing', () => {
    const s = playing();
    s.fighters[0].aura = 99;
    const ev = step(s, { infuse: true });
    expect(ofType(ev, 'infuse')).toHaveLength(0);
    expect(s.fighters[0].infused).toBe(false);
  });

  it('a neutral ball rolling into a fighter deals no damage', () => {
    const s = playing();
    park(s, 0);
    setBall(s, 1100, 450, 300, 0, null);
    run(s, 60);
    expect(s.fighters[1].hp).toBe(MAX_HP);
  });
});
