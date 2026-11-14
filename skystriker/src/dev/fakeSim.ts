/**
 * DEV ONLY: a tiny scripted stand-in for the real sim so the renderer can be
 * exercised before the sim exists. Not deterministic-critical, not shipped.
 * It fills the shared MatchState shape and emits shared GameEvents.
 */
import {
  ARENA_MARGIN, BALL_DRAG, BALL_LIVE_MIN_SPEED, BALL_RADIUS, BALL_WALL_RESTITUTION, CLOSE_CALL_DISTANCE,
  DAMAGE_MAX, DAMAGE_MIN, DASH_SPEED, DASH_TICKS, FIGHTER_ACCEL, FIGHTER_BODY_RADIUS,
  FIGHTER_DRAG, FIGHTER_MAX_SPEED, FOOT_REACH, HIT_KNOCKBACK, HITSTOP_HIT, HITSTOP_KICK, HITSTOP_KO,
  HITSTOP_PERFECT, HITSTUN_TICKS, KICK_ACTIVE_TICKS, KICK_CHARGE_FULL, KICK_RECOVERY_TICKS, MAX_HP,
  POWER_KICK_MAX_SPEED, ROUND_OVER_TICKS, ROUND_TIME, SIM_DT, SNAP_KICK_SPEED, SPIN_DECAY,
  WALL_SPLAT_DAMAGE, WALL_SPLAT_MIN_SPEED, WORLD_H, WORLD_W,
} from '../shared/constants';
import type { Element, FighterState, GameEvent, HeroId, MatchState, PlayerId } from '../shared/types';
import { EMPTY_INPUT } from '../shared/types';

/** Fake-sim stand-ins for the pressure-pass numbers (the real ones live in the sim). */
const HEAT_MAX = 4;
const WINDED_DASH = 26;
const WINDED_PHASE = 70;

export function makeState(heroes: [HeroId, HeroId] = ['kael', 'yuki']): MatchState {
  const fighter = (id: PlayerId): FighterState => ({
    id, heroId: heroes[id], element: ({ kael: 'fire', yuki: 'frost', zap: 'volt', brakka: 'stone' } as const)[heroes[id]],
    pos: { x: id === 0 ? WORLD_W * 0.25 : WORLD_W * 0.75, y: WORLD_H / 2 }, vel: { x: 0, y: 0 },
    facing: { x: id === 0 ? 1 : -1, y: 0 }, hp: MAX_HP, aura: 0, kickPhase: 'idle', kickTimer: 0, charge: 0,
    dashCooldown: 0, dashTimer: 0, invulnTimer: 0, hitstun: 0, trapping: false, infused: false, comboAgainst: 0,
  });
  return {
    config: { heroes, roundsToWin: 2, seed: 1 }, tick: 0, phase: 'playing', phaseTimer: ROUND_TIME, round: 1, wins: [0, 0],
    fighters: [fighter(0), fighter(1)],
    ball: { pos: { x: WORLD_W / 2, y: WORLD_H / 2 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, spin: 0, mode: 'neutral', owner: null, element: null, bounces: 0, heldBy: null, heldTicks: 0 },
    hitstop: 0, suddenDeath: false,
    arena: { left: ARENA_MARGIN, top: ARENA_MARGIN, right: WORLD_W - ARENA_MARGIN, bottom: WORLD_H - ARENA_MARGIN },
    rng: 1, prevInput: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }],
  };
}

export interface KickOpts {
  perfect?: boolean;
  curve?: boolean;
  element?: Element | null;
  /** Put the kicker right behind the ball first (demo convenience). */
  snapTo?: boolean;
}

export class FakeSim {
  state: MatchState = makeState();
  /** Movement intent per player (-1..1). */
  readonly move: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  /** Live balls hurt the non-owner automatically (off for pure trail demos). */
  hits = true;
  private closeCallArmed = [true, true];
  /** Was the current dash a phase dash (decides how long Winded lasts). */
  private dashWasPhase = [false, false];
  private pending: GameEvent[] = [];

  reset(heroes?: [HeroId, HeroId]): void {
    this.state = makeState(heroes);
    this.move[0].x = this.move[0].y = this.move[1].x = this.move[1].y = 0;
    this.closeCallArmed = [true, true];
    this.dashWasPhase = [false, false];
    this.pending = [];
    this.hits = true;
  }

  emit(e: GameEvent): void { this.pending.push(e); }

  /* ---- scripted actions ---- */

  face(p: PlayerId, x: number, y: number): void {
    const l = Math.hypot(x, y) || 1;
    this.state.fighters[p].facing = { x: x / l, y: y / l };
  }

  /** Face toward a world point. */
  aimAt(p: PlayerId, x: number, y: number): void {
    const f = this.state.fighters[p];
    this.face(p, x - f.pos.x, y - f.pos.y);
  }

  startCharge(p: PlayerId): void {
    const f = this.state.fighters[p];
    f.kickPhase = 'charging';
    f.kickTimer = 0;
    f.charge = 0;
    this.emit({ type: 'kickStart', player: p, charge: 0 });
  }

  /** Kick the ball along (dx, dy) with power 0..1. */
  kick(p: PlayerId, dx: number, dy: number, power: number, o: KickOpts = {}): void {
    const s = this.state, f = s.fighters[p], b = s.ball;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    this.face(p, dx, dy);
    if (o.snapTo) { f.pos.x = b.pos.x - dx * FOOT_REACH; f.pos.y = b.pos.y - dy * FOOT_REACH; f.vel.x = f.vel.y = 0; }
    let speed = power <= 0.05 ? SNAP_KICK_SPEED : SNAP_KICK_SPEED + (POWER_KICK_MAX_SPEED - SNAP_KICK_SPEED) * power;
    if (o.perfect) speed *= 1.5;
    // rally heat: a return of the opponent's live ball heats it up
    const isReturn = b.mode !== 'neutral' && b.owner !== null && b.owner !== p;
    const before = b.heat ?? 0;
    const heat = isReturn ? Math.min(HEAT_MAX, before + 1) : Math.max(before, this.heatFloor());
    speed *= 1 + 0.1 * heat;
    f.kickPhase = 'active';
    f.kickTimer = KICK_ACTIVE_TICKS;
    f.charge = 0;
    const el = o.element ?? (f.infused ? f.element : null);
    f.infused = false;
    b.heldBy = null;
    f.trapping = false;
    b.vel = { x: dx * speed, y: dy * speed };
    b.mode = 'live';
    b.owner = p;
    b.element = el;
    b.bounces = 0;
    b.spin = o.curve ? 3.2 * (dy >= 0 ? 1 : -1) : 0;
    this.closeCallArmed = [true, true];
    s.hitstop = Math.max(s.hitstop, o.perfect ? HITSTOP_PERFECT : HITSTOP_KICK);
    this.emit({ type: 'kick', player: p, pos: { x: b.pos.x, y: b.pos.y }, dir: { x: dx, y: dy }, speed, power, perfect: !!o.perfect, curve: !!o.curve, element: el });
    b.heat = heat;
    if (heat !== before) this.emit({ type: 'heat', level: heat, pos: { x: b.pos.x, y: b.pos.y } });
  }

  private heatFloor(): number { return this.state.finalRush ? 1 : 0; }

  private coolBall(ev: GameEvent[]): void {
    const b = this.state.ball;
    const floor = this.heatFloor();
    if ((b.heat ?? 0) > floor) {
      b.heat = floor;
      ev.push({ type: 'heat', level: floor, pos: { x: b.pos.x, y: b.pos.y } });
    }
  }

  /** Aura-paid invulnerable dash, followed by a long Winded. */
  phaseDash(p: PlayerId, dx: number, dy: number): void {
    const f = this.state.fighters[p];
    const l = Math.hypot(dx, dy) || 1;
    f.vel = { x: (dx / l) * DASH_SPEED, y: (dy / l) * DASH_SPEED };
    f.dashTimer = DASH_TICKS + 4;
    f.phaseDashTimer = DASH_TICKS + 4;
    f.winded = 0;
    this.dashWasPhase[p] = true;
    this.emit({ type: 'phaseDash', player: p, pos: { x: f.pos.x, y: f.pos.y }, dir: { x: dx / l, y: dy / l } });
  }

  startFinalRush(): void {
    this.state.finalRush = true;
    this.emit({ type: 'finalRush' });
    this.emit({ type: 'callout', text: 'FINAL RUSH!', player: null, tier: 3 });
  }

  dash(p: PlayerId, dx: number, dy: number): void {
    const f = this.state.fighters[p];
    const l = Math.hypot(dx, dy) || 1;
    f.vel = { x: (dx / l) * DASH_SPEED, y: (dy / l) * DASH_SPEED };
    f.dashTimer = DASH_TICKS;
    f.winded = 0;
    this.dashWasPhase[p] = false;
    this.emit({ type: 'dash', player: p, pos: { x: f.pos.x, y: f.pos.y }, dir: { x: dx / l, y: dy / l } });
  }

  trap(p: PlayerId): void {
    const f = this.state.fighters[p], b = this.state.ball;
    f.trapping = true;
    b.heldBy = p;
    b.heldTicks = 0;
    b.mode = 'neutral';
    b.owner = null;
    b.element = null;
    this.emit({ type: 'trap', player: p, pos: { x: b.pos.x, y: b.pos.y } });
  }

  release(p: PlayerId, forced: boolean): void {
    const f = this.state.fighters[p], b = this.state.ball;
    f.trapping = false;
    b.heldBy = null;
    if (forced) b.vel = { x: f.facing.x * 300, y: f.facing.y * 300 - 150 };
    this.emit({ type: 'trapRelease', player: p, forced });
  }

  /* ---- one fixed tick ---- */

  step(): GameEvent[] {
    const s = this.state;
    const ev = this.pending;
    this.pending = [];
    s.tick++;
    if (s.hitstop > 0) { s.hitstop--; return ev; }
    if (s.phase === 'roundOver') s.phaseTimer--;

    for (const f of s.fighters) {
      if (f.dashTimer > 0 && --f.dashTimer === 0) {
        // every dash ends Winded: short after a free dash, long after a phase dash
        f.winded = this.dashWasPhase[f.id] ? WINDED_PHASE : WINDED_DASH;
        ev.push({ type: 'winded', player: f.id, ticks: f.winded });
      } else if ((f.winded ?? 0) > 0) f.winded = (f.winded ?? 0) - 1;
      if ((f.phaseDashTimer ?? 0) > 0) f.phaseDashTimer = (f.phaseDashTimer ?? 0) - 1;
      if (f.invulnTimer > 0) f.invulnTimer--;
      if (f.hitstun > 0 && --f.hitstun === 0) f.comboAgainst = 0;
      if (f.kickPhase === 'active' && --f.kickTimer <= 0) { f.kickPhase = 'recovery'; f.kickTimer = KICK_RECOVERY_TICKS; }
      else if (f.kickPhase === 'recovery' && --f.kickTimer <= 0) { f.kickPhase = 'idle'; f.kickTimer = 0; }
      else if (f.kickPhase === 'charging') {
        f.kickTimer++;
        const before = f.charge;
        f.charge = Math.min(1, f.charge + 1 / KICK_CHARGE_FULL);
        if (before < 1 && f.charge >= 1) ev.push({ type: 'chargeFull', player: f.id });
      }
      const m = this.move[f.id];
      const ko = f.hp <= 0;
      if (f.hitstun <= 0 && f.dashTimer <= 0 && !ko) {
        const mult = (f.kickPhase === 'charging' ? 0.6 : 1) * ((f.winded ?? 0) > 0 ? 0.4 : 1);
        f.vel.x += m.x * FIGHTER_ACCEL * SIM_DT * mult;
        f.vel.y += m.y * FIGHTER_ACCEL * SIM_DT * mult;
      }
      if (f.dashTimer <= 0) {
        const d = Math.exp(-(f.hitstun > 0 ? 1.5 : FIGHTER_DRAG) * SIM_DT);
        f.vel.x *= d; f.vel.y *= d;
        const sp = Math.hypot(f.vel.x, f.vel.y);
        if (f.hitstun <= 0 && sp > FIGHTER_MAX_SPEED) { f.vel.x *= FIGHTER_MAX_SPEED / sp; f.vel.y *= FIGHTER_MAX_SPEED / sp; }
      }
      f.pos.x += f.vel.x * SIM_DT;
      f.pos.y += f.vel.y * SIM_DT;
      // walls
      const R = FIGHTER_BODY_RADIUS, a = s.arena;
      const walls: [boolean, number, number][] = [
        [f.pos.x < a.left + R, 1, 0], [f.pos.x > a.right - R, -1, 0], [f.pos.y < a.top + R, 0, 1], [f.pos.y > a.bottom - R, 0, -1],
      ];
      for (const [hitW, nx, ny] of walls) {
        if (!hitW) continue;
        const into = -(f.vel.x * nx + f.vel.y * ny);
        if (nx) f.pos.x = nx > 0 ? a.left + R : a.right - R;
        if (ny) f.pos.y = ny > 0 ? a.top + R : a.bottom - R;
        if (f.hitstun > 0 && into > WALL_SPLAT_MIN_SPEED) {
          f.hp -= WALL_SPLAT_DAMAGE;
          if (nx) f.vel.x = -f.vel.x * 0.45; else f.vel.y = -f.vel.y * 0.45;
          s.hitstop = HITSTOP_HIT;
          ev.push({ type: 'wallSplat', target: f.id, pos: { x: f.pos.x - nx * R, y: f.pos.y - ny * R }, normal: { x: nx, y: ny }, damage: WALL_SPLAT_DAMAGE });
          this.checkKo(f, ev);
        } else if (into > 0) {
          if (nx) f.vel.x = 0; else f.vel.y = 0;
        }
      }
    }

    // ball
    const b = s.ball;
    if (b.heldBy !== null) {
      const f = s.fighters[b.heldBy];
      b.heldTicks++;
      b.pos.x = f.pos.x + f.facing.x * FOOT_REACH;
      b.pos.y = f.pos.y + f.facing.y * FOOT_REACH;
      b.vel.x = f.vel.x; b.vel.y = f.vel.y;
    } else {
      const d = Math.exp(-BALL_DRAG * SIM_DT);
      b.vel.x *= d; b.vel.y *= d;
      if (b.spin !== 0) {
        const k = b.spin * SIM_DT * 0.9;
        const vx = b.vel.x, vy = b.vel.y;
        b.vel.x = vx - vy * k; b.vel.y = vy + vx * k;
        b.spin *= Math.exp(-SPIN_DECAY * SIM_DT);
      }
      b.pos.x += b.vel.x * SIM_DT;
      b.pos.y += b.vel.y * SIM_DT;
      const a = s.arena, r = b.radius;
      const bounce = (nx: number, ny: number) => {
        const sp = Math.hypot(b.vel.x, b.vel.y);
        if (nx) b.vel.x = -b.vel.x * BALL_WALL_RESTITUTION; else b.vel.y = -b.vel.y * BALL_WALL_RESTITUTION;
        b.bounces++;
        ev.push({ type: 'bounce', pos: { x: b.pos.x - nx * r, y: b.pos.y - ny * r }, normal: { x: nx, y: ny }, speed: sp });
      };
      if (b.pos.x < a.left + r && b.vel.x < 0) { b.pos.x = a.left + r; bounce(1, 0); }
      if (b.pos.x > a.right - r && b.vel.x > 0) { b.pos.x = a.right - r; bounce(-1, 0); }
      if (b.pos.y < a.top + r && b.vel.y < 0) { b.pos.y = a.top + r; bounce(0, 1); }
      if (b.pos.y > a.bottom - r && b.vel.y > 0) { b.pos.y = a.bottom - r; bounce(0, -1); }
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (b.mode === 'live' && sp < BALL_LIVE_MIN_SPEED) {
        b.mode = 'neutral'; b.owner = null; b.element = null;
        ev.push({ type: 'ballNeutral', pos: { x: b.pos.x, y: b.pos.y } });
        this.coolBall(ev);
      }
      // body hits + close calls
      if (b.mode !== 'neutral' && b.owner !== null) {
        const f = s.fighters[1 - b.owner];
        const dx = f.pos.x - b.pos.x, dy = f.pos.y - b.pos.y;
        const dist = Math.hypot(dx, dy);
        const gap = dist - FIGHTER_BODY_RADIUS - r;
        const phasing = (f.phaseDashTimer ?? 0) > 0;
        if (gap < 0 && this.hits && !phasing && f.invulnTimer <= 0 && f.hp > 0) this.hit(f, b.owner, sp, ev);
        else if (gap < CLOSE_CALL_DISTANCE && gap >= 0 && this.closeCallArmed[f.id]) {
          this.closeCallArmed[f.id] = false;
          ev.push({ type: 'closeCall', player: f.id, pos: { x: b.pos.x, y: b.pos.y } });
        }
      }
    }
    return ev;
  }

  private hit(f: FighterState, attacker: PlayerId, speed: number, ev: GameEvent[]): void {
    const s = this.state, b = s.ball;
    const t = Math.max(0, Math.min(1, (speed - BALL_LIVE_MIN_SPEED) / (POWER_KICK_MAX_SPEED - BALL_LIVE_MIN_SPEED)));
    const dmg = Math.round((DAMAGE_MIN + (DAMAGE_MAX - DAMAGE_MIN) * t) * 10) / 10;
    const bl = Math.hypot(b.vel.x, b.vel.y) || 1;
    const dx = b.vel.x / bl, dy = b.vel.y / bl;
    f.hp -= dmg;
    f.hitstun = HITSTUN_TICKS;
    f.comboAgainst++;
    f.kickPhase = 'idle'; f.charge = 0;
    f.vel = { x: dx * HIT_KNOCKBACK * 1.4, y: dy * HIT_KNOCKBACK * 1.4 };
    b.vel = { x: -dx * speed * 0.45 + dy * 120, y: -dy * speed * 0.45 - dx * 120 };
    s.hitstop = HITSTOP_HIT;
    ev.push({
      type: 'hit', target: f.id, attacker, pos: { x: b.pos.x + dx * b.radius, y: b.pos.y + dy * b.radius },
      damage: dmg, speed, bank: b.bounces, combo: f.comboAgainst, element: b.element,
    });
    this.coolBall(ev);
    this.checkKo(f, ev);
  }

  private checkKo(f: FighterState, ev: GameEvent[]): void {
    const s = this.state;
    if (f.hp > 0 || s.phase !== 'playing') return;
    f.hp = 0;
    s.hitstop = HITSTOP_KO;
    s.phase = 'roundOver';
    s.phaseTimer = ROUND_OVER_TICKS;
    ev.push({ type: 'ko', loser: f.id, pos: { x: f.pos.x, y: f.pos.y } });
    ev.push({ type: 'callout', text: 'K.O.', player: (1 - f.id) as PlayerId, tier: 3 });
    ev.push({ type: 'roundEnd', winner: (1 - f.id) as PlayerId });
  }
}
