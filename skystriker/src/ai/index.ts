/**
 * AI MODULE — temporary SPARRING BOT written by the lead so wave 1 is playable.
 * The wave 2 AI session replaces this file (see docs/ARCHITECTURE.md, GDD §9).
 *
 * Behaviour: gets behind the ball and kicks it at you, sometimes charging a power
 * kick; when the ball is stuck against a wall or in a corner it traps it and carries
 * it out; dodges or swats incoming enemy balls; re-plans only every few ticks
 * (reaction delay by difficulty). Deterministic: own seeded LCG, no Math.random.
 */
import { FIGHTER_BODY_RADIUS, FOOT_REACH, INFUSE_COST, KICK_CHARGE_FULL, SIM_HZ, TRAP_RANGE } from '../shared/constants';
import type { AIController, AIDifficulty, AIPersonality, InputFrame, MatchState, PlayerId } from '../shared/types';
import { EMPTY_INPUT } from '../shared/types';

const TUNING: Record<AIDifficulty, { react: number; aimNoise: number; swat: number; charge: number }> = {
  rookie: { react: Math.round(0.35 * SIM_HZ), aimNoise: 0.35, swat: 0.25, charge: 0.15 },
  pro: { react: Math.round(0.2 * SIM_HZ), aimNoise: 0.18, swat: 0.5, charge: 0.3 },
  legend: { react: Math.round(0.12 * SIM_HZ), aimNoise: 0.08, swat: 0.75, charge: 0.45 },
};

/** How far from every wall a carried ball must be before the bot shoots it. */
const CARRY_CLEARANCE = 150;
/** Shoot a carried ball after this long even if not fully clear (well before the forced pop). */
const CARRY_MAX_TICKS = Math.round(0.9 * SIM_HZ);

type Plan = { kind: 'chase' } | { kind: 'dodge'; dx: number; dy: number } | { kind: 'swat' };

export function createAI(difficulty: AIDifficulty, _personality: AIPersonality): AIController {
  const t = TUNING[difficulty];
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;

  let plan: Plan = { kind: 'chase' };
  let replanIn = 0;
  let chargeTicks = 0; // >0 while holding kick for a power shot
  let kickHeldLast = false;
  let noise = { x: 0, y: 0 };

  function replan(s: Readonly<MatchState>, self: PlayerId) {
    const me = s.fighters[self];
    const b = s.ball;
    const dx = me.pos.x - b.pos.x, dy = me.pos.y - b.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const closing = (b.vel.x * dx + b.vel.y * dy) / dist; // ball speed toward me
    const threat = b.mode !== 'neutral' && b.owner !== null && b.owner !== self && b.heldBy === null && closing > 0 && dist / closing < 0.6;
    if (threat) {
      if (rnd() < t.swat) plan = { kind: 'swat' };
      else {
        // Step sideways out of the ball's line.
        const side = rnd() < 0.5 ? 1 : -1;
        const v = Math.hypot(b.vel.x, b.vel.y) || 1;
        plan = { kind: 'dodge', dx: (-b.vel.y / v) * side, dy: (b.vel.x / v) * side };
      }
    } else plan = { kind: 'chase' };
    noise = { x: (rnd() - 0.5) * 2 * t.aimNoise, y: (rnd() - 0.5) * 2 * t.aimNoise };
    replanIn = t.react;
  }

  const unit = (x: number, y: number) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

  return {
    think(s, self) {
      if (s.phase !== 'playing') { chargeTicks = 0; kickHeldLast = false; return { ...EMPTY_INPUT }; }
      if (--replanIn <= 0) replan(s, self);

      const me = s.fighters[self];
      const foe = s.fighters[self === 0 ? 1 : 0];
      const b = s.ball;
      const a = s.arena, m = FIGHTER_BODY_RADIUS;
      const out: InputFrame = { ...EMPTY_INPUT };
      const moveTo = (x: number, y: number) => {
        x = Math.min(a.right - m, Math.max(a.left + m, x));
        y = Math.min(a.bottom - m, Math.max(a.top + m, y));
        const dx = x - me.pos.x, dy = y - me.pos.y, l = Math.hypot(dx, dy);
        if (l > 6) { out.moveX = dx / l; out.moveY = dy / l; }
      };
      const done = () => {
        if (me.aura >= INFUSE_COST && !me.infused && rnd() < 0.004) out.infuse = true;
        kickHeldLast = out.kick;
        return out;
      };

      // Aim at the opponent (from the ball), with a little error.
      const shot = unit(foe.pos.x - b.pos.x + noise.x * 300, foe.pos.y - b.pos.y + noise.y * 300);

      // 1) Carrying a trapped ball out of a wall/corner: walk it toward the middle, then shoot.
      if (b.heldBy === self) {
        chargeTicks = 0;
        out.trap = true;
        const toFoe = unit(foe.pos.x - me.pos.x + noise.x * 300, foe.pos.y - me.pos.y + noise.y * 300);
        out.aimX = toFoe.x; out.aimY = toFoe.y;
        moveTo((a.left + a.right) / 2, (a.top + a.bottom) / 2);
        const clear = Math.min(b.pos.x - a.left, a.right - b.pos.x, b.pos.y - a.top, a.bottom - b.pos.y) > CARRY_CLEARANCE;
        if ((clear || b.heldTicks > CARRY_MAX_TICKS) && !kickHeldLast) out.kick = true; // kick while trapping = instant shot
        return done();
      }

      // The spot behind the ball we'd kick from. Near a wall or in a corner it can be
      // OUTSIDE the arena, and a ball kicked into a corner comes straight back off both
      // walls into our own body (the "stuck in the corner" playtest bug). Then trap it.
      const sx = b.pos.x - shot.x * FOOT_REACH * 0.9, sy = b.pos.y - shot.y * FOOT_REACH * 0.9;
      const spotBlocked = sx < a.left + m || sx > a.right - m || sy < a.top + m || sy > a.bottom - m;

      if (plan.kind === 'dodge') {
        out.moveX = plan.dx; out.moveY = plan.dy;
        out.dash = replanIn === t.react - 1 && rnd() < 0.5;
        out.aimX = shot.x; out.aimY = shot.y;
      } else if (spotBlocked && b.heldBy === null && b.mode === 'neutral') {
        // 2) Dig out: face the ball, walk onto it, hold trap once it's near the foot.
        chargeTicks = 0;
        const toBall = unit(b.pos.x - me.pos.x, b.pos.y - me.pos.y);
        out.aimX = toBall.x; out.aimY = toBall.y;
        moveTo(b.pos.x - toBall.x * FOOT_REACH * 0.7, b.pos.y - toBall.y * FOOT_REACH * 0.7);
        const fx = me.pos.x + toBall.x * FOOT_REACH, fy = me.pos.y + toBall.y * FOOT_REACH;
        out.trap = Math.hypot(b.pos.x - fx, b.pos.y - fy) < TRAP_RANGE;
        return done();
      } else {
        // 3) Normal: get to the kicking spot behind the ball.
        // (Leading the ball's velocity was tried: worse, it overshoots wall bounces.)
        moveTo(sx, sy);
        out.aimX = shot.x; out.aimY = shot.y;
      }

      // Kicking: a held charge releases when full; otherwise tap when the ball is at the foot.
      const fx = me.pos.x + out.aimX * FOOT_REACH, fy = me.pos.y + out.aimY * FOOT_REACH;
      const inReach = Math.hypot(b.pos.x - fx, b.pos.y - fy) < FIGHTER_BODY_RADIUS + b.radius;
      if (chargeTicks > 0) {
        chargeTicks--;
        out.kick = chargeTicks > 0;
      } else if (inReach && !kickHeldLast) {
        if (plan.kind === 'chase' && rnd() < t.charge) { chargeTicks = Math.round(KICK_CHARGE_FULL * (0.5 + rnd() * 0.5)); out.kick = true; }
        else out.kick = true; // snap kick / swat
      }
      return done();
    },
    reset() { seed = 0x9e3779b9; plan = { kind: 'chase' }; replanIn = 0; chargeTicks = 0; kickHeldLast = false; },
  };
}
