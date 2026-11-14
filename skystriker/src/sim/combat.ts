/**
 * Contact resolution (GDD §4) — foot first, then body hit, then soft bump —
 * plus clashes, damage (§6) and close calls.
 */
import {
  AURA_GAIN_CLOSE_CALL, AURA_GAIN_HIT_LANDED, AURA_GAIN_HIT_TAKEN, BANK_BONUS_MAX_BOUNCES, BANK_BONUS_PER_BOUNCE,
  BUMP_EVENT_MIN_SPEED, BUMP_RESTITUTION, CLASH_MIN_CHARGE, CLASH_POP_SPEED, CLOSE_CALL_DISTANCE, COMBO_SCALING,
  DAMAGE_MAX, DAMAGE_MIN, FIGHTER_BODY_RADIUS, FOOT_RADIUS, HIT_BALL_RESTITUTION, HIT_KNOCKBACK,
  HIT_KNOCKBACK_MIN, HITSTOP_CLASH, HITSTOP_HIT, HITSTUN_TICKS, INFUSE_DAMAGE_MULT, KICK_RECOVERY_TICKS,
  PERFECT_WINDOW, SUDDEN_DEATH_BALL_MULT, SUDDEN_DEATH_ONE_HIT,
} from '../shared/constants';
import { elementAdvantage } from '../shared/heroes';
import type { FighterState, GameEvent, InputFrame, MatchState, PlayerId } from '../shared/types';
import { lerp, norm } from '../shared/vec';
import { footTouches, isPerfect, kickBall, releaseBall } from './kick';
import { addHitstop, bodyOverlap, callout, copy, dangerRaw, gainAura, heroOf, isEnemyLive, moveVec, other } from './util';

export interface TickCtx {
  state: MatchState;
  inputs: [InputFrame, InputFrame];
  events: GameEvent[];
  /** False during round-over / match-over: physics only, nobody can kick or get hurt. */
  combat: boolean;
  /** One damaging hit per tick at most. */
  hitThisTick: boolean;
}

/** Called after every ball sub-step (and once per tick for a held ball). */
export function resolveContacts(ctx: TickCtx): void {
  const { state } = ctx;
  const b = state.ball;
  const [f0, f1] = state.fighters;
  // 1. Foot first.
  if (ctx.combat) {
    const t0 = footTouches(f0, b, FOOT_RADIUS);
    const t1 = footTouches(f1, b, FOOT_RADIUS);
    if (t0 && t1) { clash(ctx); return; }
    if (t0 || t1) {
      const f = t0 ? f0 : f1;
      kickBall(state, f, moveVec(ctx.inputs[f.id]), ctx.events, isPerfect(b, f, PERFECT_WINDOW));
      return;
    }
  }
  if (b.heldBy !== null) return;
  // 2. Body hit, 3. soft bump.
  for (const f of state.fighters) {
    if (!bodyOverlap(f, b)) continue;
    if (ctx.combat && isEnemyLive(b, f)) {
      if (f.invulnTimer > 0) continue; // dash i-frames: the ball passes straight through
      if (ctx.hitThisTick) continue;
      hit(ctx, f);
      ctx.hitThisTick = true;
    } else {
      bump(ctx, f);
    }
  }
}

/* ------------------------------------------------------------------ */

/** GDD §6 damage for a ball of `speed` from `attacker` hitting `victim`. Pure (no state change). */
export function computeDamage(
  speed: number, bounces: number, attacker: FighterState, victim: FighterState, infused: boolean,
): { damage: number; bank: number; prevCombo: number } {
  const base = DAMAGE_MIN + (DAMAGE_MAX - DAMAGE_MIN) * dangerRaw(speed);
  const bank = Math.min(bounces, BANK_BONUS_MAX_BOUNCES);
  const prevCombo = victim.hitstun > 0 ? victim.comboAgainst : 0;
  const scale = COMBO_SCALING[Math.min(prevCombo, COMBO_SCALING.length - 1)];
  const raw = base * (1 + BANK_BONUS_PER_BOUNCE * bank) * heroOf(attacker).power * scale * (infused ? INFUSE_DAMAGE_MULT : 1);
  return { damage: Math.max(1, Math.round(raw)), bank, prevCombo };
}

function hit(ctx: TickCtx, victim: FighterState): void {
  const { state, events } = ctx;
  const b = state.ball;
  const attackerId = b.owner as PlayerId;
  const attacker = state.fighters[attackerId];
  const speed = Math.hypot(b.vel.x, b.vel.y);
  const { damage, bank, prevCombo } = computeDamage(speed, b.bounces, attacker, victim, b.element !== null);

  victim.hp = state.suddenDeath && SUDDEN_DEATH_ONE_HIT ? 0 : Math.max(0, victim.hp - damage);
  victim.comboAgainst = prevCombo + 1;

  const n = norm({ x: b.pos.x - victim.pos.x, y: b.pos.y - victim.pos.y });
  const contact = { x: victim.pos.x + n.x * FIGHTER_BODY_RADIUS, y: victim.pos.y + n.y * FIGHTER_BODY_RADIUS };
  const knockDir = norm(b.vel);
  const knock = lerp(HIT_KNOCKBACK_MIN, HIT_KNOCKBACK, Math.min(1, dangerRaw(speed)));

  // Ball rebounds off the victim and stays live (still the attacker's).
  const rvx = b.vel.x - victim.vel.x, rvy = b.vel.y - victim.vel.y;
  const vn = rvx * n.x + rvy * n.y;
  if (vn < 0) {
    b.vel.x = rvx - (1 + HIT_BALL_RESTITUTION) * vn * n.x + victim.vel.x;
    b.vel.y = rvy - (1 + HIT_BALL_RESTITUTION) * vn * n.y + victim.vel.y;
  }
  const out = FIGHTER_BODY_RADIUS + b.radius + 0.5;
  b.pos = { x: victim.pos.x + n.x * out, y: victim.pos.y + n.y * out };

  // Victim: knockback along the ball's travel, hitstun, everything cancelled.
  victim.vel = { x: knockDir.x * knock, y: knockDir.y * knock };
  victim.hitstun = HITSTUN_TICKS;
  victim.dashTimer = 0;
  if (victim.kickPhase === 'charging' || victim.kickPhase === 'active') {
    victim.kickPhase = 'recovery';
    victim.kickTimer = KICK_RECOVERY_TICKS;
  }
  victim.charge = 0;
  victim.closeCall = 2;
  if (b.heldBy === victim.id) releaseBall(state, victim, events, true);

  events.push({
    type: 'hit', target: victim.id, attacker: attackerId, pos: contact, damage, speed, bank,
    combo: victim.comboAgainst, element: b.element,
  });
  if (bank >= 2) callout(events, 'DOUBLE BANK!', attackerId, 3);
  else if (bank === 1) callout(events, 'BANK SHOT!', attackerId, 2);
  if (victim.comboAgainst >= 2) callout(events, `${victim.comboAgainst}-HIT COMBO!`, attackerId, victim.comboAgainst >= 3 ? 3 : 2);
  addHitstop(state, HITSTOP_HIT);
  gainAura(attacker, AURA_GAIN_HIT_LANDED, events);
  gainAura(victim, AURA_GAIN_HIT_TAKEN, events);
}

/** Soft bump: the body pushes the ball, no damage. */
function bump(ctx: TickCtx, f: FighterState): void {
  const b = ctx.state.ball;
  let n = norm({ x: b.pos.x - f.pos.x, y: b.pos.y - f.pos.y });
  if (n.x === 0 && n.y === 0) n = copy(f.facing);
  const out = FIGHTER_BODY_RADIUS + b.radius + 0.01;
  b.pos = { x: f.pos.x + n.x * out, y: f.pos.y + n.y * out };
  const rvx = b.vel.x - f.vel.x, rvy = b.vel.y - f.vel.y;
  const vn = rvx * n.x + rvy * n.y;
  if (vn >= 0) return;
  b.vel.x = rvx - (1 + BUMP_RESTITUTION) * vn * n.x + f.vel.x;
  b.vel.y = rvy - (1 + BUMP_RESTITUTION) * vn * n.y + f.vel.y;
  if (-vn > BUMP_EVENT_MIN_SPEED) {
    ctx.events.push({
      type: 'bump', player: f.id, speed: -vn,
      pos: { x: f.pos.x + n.x * FIGHTER_BODY_RADIUS, y: f.pos.y + n.y * FIGHTER_BODY_RADIUS },
    });
  }
}

/** Both feet on the ball in the same tick: freeze, stronger kick wins; tie pops the ball up neutral. */
function clash(ctx: TickCtx): void {
  const { state, events } = ctx;
  const b = state.ball;
  const [f0, f1] = state.fighters;
  const score = (f: FighterState, o: FighterState): number =>
    Math.max(f.charge, CLASH_MIN_CHARGE) * heroOf(f).power * elementAdvantage(f.element, o.element);
  const s0 = score(f0, f1), s1 = score(f1, f0);
  const winner: PlayerId | null = Math.abs(s0 - s1) < 1e-9 ? null : s0 > s1 ? 0 : 1;
  const pos = copy(b.pos);
  if (b.heldBy !== null) releaseBall(state, state.fighters[b.heldBy], events, true);
  events.push({ type: 'clash', pos, winner });
  callout(events, 'CLASH!', winner, 3);
  addHitstop(state, HITSTOP_CLASH);
  for (const f of state.fighters) {
    if (f.id === winner) continue;
    f.kickPhase = 'recovery';
    f.kickTimer = KICK_RECOVERY_TICKS;
    f.charge = 0;
  }
  if (winner !== null) {
    kickBall(state, state.fighters[winner], moveVec(ctx.inputs[winner]), events, false);
    return;
  }
  const wasLive = b.mode !== 'neutral';
  b.vel = { x: 0, y: -CLASH_POP_SPEED * (state.suddenDeath ? SUDDEN_DEATH_BALL_MULT : 1) };
  b.mode = 'neutral';
  b.owner = null;
  b.element = null;
  b.spin = 0;
  b.bounces = 0;
  if (wasLive) events.push({ type: 'ballNeutral', pos: copy(b.pos) });
}

/**
 * Close call: an enemy live ball enters the zone around your body and leaves again without
 * hitting (dash i-frame pass-throughs count). Once per pass.
 */
export function updateCloseCalls(ctx: TickCtx): void {
  const b = ctx.state.ball;
  for (const f of ctx.state.fighters) {
    const enemy = ctx.combat && isEnemyLive(b, f);
    const gap = Math.hypot(b.pos.x - f.pos.x, b.pos.y - f.pos.y) - FIGHTER_BODY_RADIUS - b.radius;
    const st = f.closeCall ?? 0;
    if (enemy && gap <= CLOSE_CALL_DISTANCE) {
      if (st === 0) f.closeCall = 1;
      continue;
    }
    if (st === 1 && enemy) {
      ctx.events.push({ type: 'closeCall', player: f.id, pos: copy(b.pos) });
      callout(ctx.events, 'CLOSE CALL!', f.id, 1);
      gainAura(f, AURA_GAIN_CLOSE_CALL, ctx.events);
    }
    f.closeCall = 0;
  }
}

export const opponentOf = (state: MatchState, f: FighterState): FighterState => state.fighters[other(f.id)];
