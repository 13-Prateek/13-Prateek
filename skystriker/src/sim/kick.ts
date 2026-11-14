/** Kick toolkit: snap / power kick state machine, curve shots, perfect timing, trap & dribble. */
import {
  AURA_GAIN_KICK, AURA_GAIN_PERFECT, BALL_CRUISE_TICKS, CURVE_MIN_CHARGE, CURVE_MIN_CROSS, CURVE_MIN_MOVE, CURVE_SPIN,
  FIGHTER_BODY_RADIUS,
  HITSTOP_KICK, HITSTOP_PERFECT, HITSTOP_POWER_BONUS, KICK_ACTIVE_TICKS, KICK_CHARGE_FULL, KICK_CHARGE_START,
  KICK_RECOVERY_TICKS, PERFECT_SPEED_MULT, POWER_KICK_MAX_SPEED, SIM_DT, SNAP_KICK_SPEED,
  SUDDEN_DEATH_BALL_MULT, TRAP_CATCH_MAX_SPEED, TRAP_DROP_SPEED, TRAP_MAX_TICKS, TRAP_POP_SPEED,
  TRAP_POP_SPREAD, TRAP_RANGE,
} from '../shared/constants';
import type { BallState, FighterState, GameEvent, InputFrame, MatchState, Vec2 } from '../shared/types';
import { clamp, cross, dist, lerp, norm, rand } from '../shared/vec';
import { maxBallSpeed } from './ball';
import type { Edges } from './fighter';
import { addHitstop, callout, copy, footPos, gainAura, heroOf, isEnemyLive, kickPower, moveVec } from './util';

/** Charge 0..1 from ticks held: 0 until KICK_CHARGE_START, 1 at KICK_CHARGE_FULL. */
export const chargeFromHeld = (held: number): number =>
  clamp((held - KICK_CHARGE_START) / (KICK_CHARGE_FULL - KICK_CHARGE_START), 0, 1);

/** Press starts charging; release fires the kick (snap if released early, power kick if held). */
export function updateKickInput(state: MatchState, f: FighterState, inp: InputFrame, edges: Edges, events: GameEvent[]): void {
  if (f.kickPhase === 'idle') {
    if (edges.kickPressed && f.hitstun === 0) {
      f.kickPhase = 'charging';
      f.kickTimer = 1;
      f.charge = 0;
    }
    return;
  }
  if (f.kickPhase !== 'charging') return;
  if (inp.kick) {
    f.kickTimer++;
    const c = chargeFromHeld(f.kickTimer);
    if (c >= 1 && f.charge < 1) events.push({ type: 'chargeFull', player: f.id });
    f.charge = c;
    return;
  }
  // Released: the foot goes active.
  f.kickPhase = 'active';
  f.kickTimer = KICK_ACTIVE_TICKS;
  events.push({ type: 'kickStart', player: f.id, charge: f.charge });
  // Kicking while trapping kicks the held ball instantly.
  if (state.ball.heldBy === f.id) kickBall(state, f, moveVec(inp), events, false);
}

/** Active foot ticks run down; a whiff goes to recovery. */
export function endOfTickKick(f: FighterState): void {
  if (f.kickPhase === 'active' && --f.kickTimer <= 0) {
    f.kickPhase = 'recovery';
    f.kickTimer = KICK_RECOVERY_TICKS;
  }
}

/**
 * Ticks until the ball would touch `f`'s body on current velocities (relative motion),
 * or Infinity if it would miss / is moving away. 0 if already overlapping.
 */
export function ticksToImpact(b: BallState, f: FighterState): number {
  const R = FIGHTER_BODY_RADIUS + b.radius;
  const rx = b.pos.x - f.pos.x, ry = b.pos.y - f.pos.y;
  const c = rx * rx + ry * ry - R * R;
  if (c <= 0) return 0;
  const vx = b.vel.x - f.vel.x, vy = b.vel.y - f.vel.y;
  const a = vx * vx + vy * vy;
  const bq = 2 * (rx * vx + ry * vy);
  if (a < 1e-9 || bq >= 0) return Infinity;
  const disc = bq * bq - 4 * a * c;
  if (disc < 0) return Infinity;
  return (-bq - Math.sqrt(disc)) / (2 * a) / SIM_DT;
}

/** Perfect return: enemy live ball, and release→impact time within PERFECT_WINDOW. */
export function isPerfect(b: BallState, f: FighterState, window: number): boolean {
  if (!isEnemyLive(b, f) || f.kickPhase !== 'active') return false;
  const since = KICK_ACTIVE_TICKS - f.kickTimer;
  return since + ticksToImpact(b, f) <= window;
}

/** The kick connects: the ball becomes the kicker's, flying along the facing (aim). */
export function kickBall(state: MatchState, f: FighterState, move: Vec2, events: GameEvent[], perfect: boolean): void {
  const b = state.ball;
  if (b.heldBy !== null) releaseBall(state, state.fighters[b.heldBy], events, b.heldBy !== f.id);
  const dir = norm(f.facing);
  const sd = state.suddenDeath ? SUDDEN_DEATH_BALL_MULT : 1;
  let speed = lerp(SNAP_KICK_SPEED, POWER_KICK_MAX_SPEED, f.charge) * sd;
  if (perfect) speed *= PERFECT_SPEED_MULT;
  speed = Math.min(speed, maxBallSpeed(state));

  // Curve shot (deliberate only): a charged kick released while moving sideways to the aim bends
  // the ball toward the move side, by at most CURVE_BEND × control in total. Snap kicks fly straight.
  let curve = false;
  let spin = 0;
  if (f.charge >= CURVE_MIN_CHARGE && Math.hypot(move.x, move.y) >= CURVE_MIN_MOVE) {
    const c = cross(dir, norm(move));
    if (Math.abs(c) >= CURVE_MIN_CROSS) {
      curve = true;
      spin = CURVE_SPIN * heroOf(f).control * Math.sign(c);
    }
  }

  b.vel = { x: dir.x * speed, y: dir.y * speed };
  b.spin = spin;
  b.mode = 'live';
  b.owner = f.id;
  b.bounces = 0;
  b.cruise = BALL_CRUISE_TICKS;
  b.element = f.infused ? f.element : null;
  f.infused = false;
  // Never leave the ball inside the kicker's own body.
  const minD = FIGHTER_BODY_RADIUS + b.radius + 0.5;
  const rx = b.pos.x - f.pos.x, ry = b.pos.y - f.pos.y, d = Math.hypot(rx, ry);
  if (d < minD) {
    const n = d > 1e-6 ? { x: rx / d, y: ry / d } : dir;
    b.pos = { x: f.pos.x + n.x * minD, y: f.pos.y + n.y * minD };
  }

  const charge = f.charge;
  f.kickPhase = 'recovery';
  f.kickTimer = KICK_RECOVERY_TICKS;
  f.charge = 0;
  events.push({
    type: 'kick', player: f.id, pos: copy(b.pos), dir: copy(dir), speed, power: kickPower(speed),
    perfect, curve, element: b.element,
  });
  if (perfect) {
    callout(events, 'PERFECT!', f.id, 3);
    addHitstop(state, HITSTOP_PERFECT);
    gainAura(f, AURA_GAIN_PERFECT, events);
  } else {
    addHitstop(state, HITSTOP_KICK + Math.round(HITSTOP_POWER_BONUS * charge));
    gainAura(f, AURA_GAIN_KICK, events);
  }
}

/* ------------------------------------------------------------------ */
/* Trap / dribble                                                       */
/* ------------------------------------------------------------------ */

export function releaseBall(state: MatchState, f: FighterState, events: GameEvent[], forced: boolean): void {
  const b = state.ball;
  b.heldBy = null;
  b.heldTicks = 0;
  f.trapping = false;
  events.push({ type: 'trapRelease', player: f.id, forced });
}

/** Hold trap near the ball to stick it to your foot; let go to drop it. */
export function updateTrap(state: MatchState, f: FighterState, inp: InputFrame, events: GameEvent[]): void {
  const b = state.ball;
  if (!inp.trap) f.trapLock = false;
  if (b.heldBy === f.id) {
    if (!inp.trap || f.hitstun > 0) {
      b.vel = { x: f.vel.x + f.facing.x * TRAP_DROP_SPEED, y: f.vel.y + f.facing.y * TRAP_DROP_SPEED };
      releaseBall(state, f, events, false);
    }
    return;
  }
  if (!inp.trap || f.trapLock || f.hitstun > 0 || b.heldBy !== null) return;
  if (f.kickPhase !== 'idle' && f.kickPhase !== 'charging') return;
  if (dist(b.pos, footPos(f)) > TRAP_RANGE) return;
  if (isEnemyLive(b, f) && Math.hypot(b.vel.x, b.vel.y) > TRAP_CATCH_MAX_SPEED) return;
  b.heldBy = f.id;
  b.heldTicks = 0;
  b.mode = 'neutral';
  b.owner = f.id;
  b.element = null;
  b.spin = 0;
  b.bounces = 0;
  b.cruise = 0;
  f.trapping = true;
  events.push({ type: 'trap', player: f.id, pos: copy(b.pos) });
}

/** A trapped ball rides the holder's foot; held too long, it pops loose (forced release). */
export function updateHeldBall(state: MatchState, events: GameEvent[]): void {
  const b = state.ball;
  if (b.heldBy === null) return;
  const h = state.fighters[b.heldBy];
  const fp = footPos(h), a = state.arena, r = b.radius;
  b.pos = { x: clamp(fp.x, a.left + r, a.right - r), y: clamp(fp.y, a.top + r, a.bottom - r) };
  b.vel = copy(h.vel);
  b.heldTicks++;
  if (b.heldTicks < TRAP_MAX_TICKS) return;
  const [rv, next] = rand(state.rng);
  state.rng = next;
  const ang = (rv - 0.5) * TRAP_POP_SPREAD, c = Math.cos(ang), s = Math.sin(ang);
  const dir = { x: h.facing.x * c - h.facing.y * s, y: h.facing.x * s + h.facing.y * c };
  b.vel = { x: h.vel.x + dir.x * TRAP_POP_SPEED, y: h.vel.y + dir.y * TRAP_POP_SPEED };
  releaseBall(state, h, events, true);
  h.trapLock = true; // must let go of trap before grabbing again
}

/** True if the active foot of `f` overlaps the ball. */
export function footTouches(f: FighterState, b: BallState, footRadius: number): boolean {
  if (f.kickPhase !== 'active') return false;
  const fp = footPos(f);
  const r = footRadius + b.radius;
  const dx = b.pos.x - fp.x, dy = b.pos.y - fp.y;
  return dx * dx + dy * dy <= r * r;
}
