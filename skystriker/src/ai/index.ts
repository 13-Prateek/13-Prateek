/**
 * AI MODULE — temporary SPARRING BOT written by the lead so wave 1 is playable.
 * The wave 2 AI session replaces this file (see docs/ARCHITECTURE.md, GDD §9).
 *
 * Behaviour: gets behind the ball and kicks it at you, sometimes charging a power
 * kick; dodges or swats incoming enemy balls; re-plans only every few ticks
 * (reaction delay by difficulty). Deterministic: own seeded LCG, no Math.random.
 */
import { FIGHTER_BODY_RADIUS, FOOT_REACH, INFUSE_COST, KICK_CHARGE_FULL, SIM_HZ } from '../shared/constants';
import type { AIController, AIDifficulty, AIPersonality, InputFrame, MatchState, PlayerId } from '../shared/types';
import { EMPTY_INPUT } from '../shared/types';

const TUNING: Record<AIDifficulty, { react: number; aimNoise: number; swat: number; charge: number }> = {
  rookie: { react: Math.round(0.35 * SIM_HZ), aimNoise: 0.35, swat: 0.25, charge: 0.15 },
  pro: { react: Math.round(0.2 * SIM_HZ), aimNoise: 0.18, swat: 0.5, charge: 0.3 },
  legend: { react: Math.round(0.12 * SIM_HZ), aimNoise: 0.08, swat: 0.75, charge: 0.45 },
};

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
    const threat = b.mode !== 'neutral' && b.owner !== null && b.owner !== self && closing > 0 && dist / closing < 0.6;
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

  return {
    think(s, self) {
      if (s.phase !== 'playing') { chargeTicks = 0; kickHeldLast = false; return { ...EMPTY_INPUT }; }
      if (--replanIn <= 0) replan(s, self);

      const me = s.fighters[self];
      const foe = s.fighters[self === 0 ? 1 : 0];
      const b = s.ball;
      const out: InputFrame = { ...EMPTY_INPUT };

      // Aim at the opponent, with a little error.
      let ax = foe.pos.x - b.pos.x + noise.x * 300, ay = foe.pos.y - b.pos.y + noise.y * 300;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al; ay /= al;

      // Is the ball inside the foot hitbox reach?
      const fx = me.pos.x + ax * FOOT_REACH, fy = me.pos.y + ay * FOOT_REACH;
      const footDist = Math.hypot(b.pos.x - fx, b.pos.y - fy);
      const inReach = footDist < FIGHTER_BODY_RADIUS + b.radius;

      if (plan.kind === 'dodge') {
        out.moveX = plan.dx; out.moveY = plan.dy;
        out.dash = replanIn === t.react - 1 && rnd() < 0.5;
      } else {
        // Get to the spot behind the ball (opposite side from where we aim).
        // (Leading the ball's velocity was tried: worse, it overshoots wall bounces.)
        const tx = b.pos.x - ax * FOOT_REACH * 0.9, ty = b.pos.y - ay * FOOT_REACH * 0.9;
        const mx = tx - me.pos.x, my = ty - me.pos.y;
        const ml = Math.hypot(mx, my);
        if (ml > 6) { out.moveX = mx / ml; out.moveY = my / ml; }
      }
      out.aimX = ax; out.aimY = ay;

      // Kicking: a held charge releases when full; otherwise tap when in reach.
      if (chargeTicks > 0) {
        chargeTicks--;
        out.kick = chargeTicks > 0;
      } else if (inReach && !kickHeldLast) {
        if (plan.kind === 'chase' && rnd() < t.charge) { chargeTicks = Math.round(KICK_CHARGE_FULL * (0.5 + rnd() * 0.5)); out.kick = true; }
        else out.kick = true; // snap kick / swat
      }
      if (me.aura >= INFUSE_COST && !me.infused && rnd() < 0.004) out.infuse = true;
      kickHeldLast = out.kick;
      return out;
    },
    reset() { seed = 0x9e3779b9; plan = { kind: 'chase' }; replanIn = 0; chargeTicks = 0; kickHeldLast = false; },
  };
}
