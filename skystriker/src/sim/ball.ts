/** Ball physics: drag, spin curve, sub-stepped integration, wall bounces, live → neutral. */
import {
  BALL_DRAG, BALL_LIVE_MIN_SPEED, BALL_MAX_SPEED, BALL_MAX_SUBSTEPS, BALL_RADIUS, BALL_WALL_RESTITUTION,
  BALL_WALL_SPIN_KEEP, BOUNCE_EVENT_MIN_SPEED, SIM_DT, SPIN_DECAY, SUDDEN_DEATH_BALL_MULT,
} from '../shared/constants';
import type { GameEvent, MatchState, Vec2 } from '../shared/types';
import { dot } from '../shared/vec';
import { copy } from './util';

export const maxBallSpeed = (state: MatchState): number =>
  BALL_MAX_SPEED * (state.suddenDeath ? SUDDEN_DEATH_BALL_MULT : 1);

/**
 * Advance a free ball one tick. Movement is split into sub-steps no longer than
 * BALL_RADIUS so a 2600 u/s ball can't skip through a foot or body; `onSubstep`
 * runs the contact checks after each sub-step.
 */
export function integrateBall(state: MatchState, events: GameEvent[], onSubstep: () => void): void {
  const b = state.ball;
  if (b.heldBy !== null) return;
  const drag = Math.exp(-BALL_DRAG * SIM_DT);
  b.vel.x *= drag; b.vel.y *= drag;
  b.spin *= Math.exp(-SPIN_DECAY * SIM_DT);
  if (Math.abs(b.spin) < 1e-4) b.spin = 0;
  let speed = Math.hypot(b.vel.x, b.vel.y);
  const cap = maxBallSpeed(state);
  if (speed > cap) { b.vel.x *= cap / speed; b.vel.y *= cap / speed; speed = cap; }
  const n = Math.min(BALL_MAX_SUBSTEPS, Math.max(1, Math.ceil((speed * SIM_DT) / BALL_RADIUS)));
  const h = SIM_DT / n;
  for (let i = 0; i < n; i++) {
    if (b.heldBy !== null) return; // trapped/kicked mid-tick by a contact
    if (b.spin !== 0) {
      // Spin turns the velocity (perpendicular acceleration) without changing speed. + = clockwise on screen.
      const ang = b.spin * h, c = Math.cos(ang), s = Math.sin(ang);
      const vx = b.vel.x * c - b.vel.y * s;
      b.vel.y = b.vel.x * s + b.vel.y * c;
      b.vel.x = vx;
    }
    b.pos.x += b.vel.x * h;
    b.pos.y += b.vel.y * h;
    collideBallWalls(state, events);
    onSubstep();
  }
}

/** Reflect off the arena walls; counts bounces (bank shots) and emits `bounce`. */
export function collideBallWalls(state: MatchState, events: GameEvent[]): void {
  const b = state.ball, a = state.arena, r = b.radius;
  const walls: [boolean, number, Vec2][] = [
    [b.pos.x < a.left + r, a.left + r, { x: 1, y: 0 }],
    [b.pos.x > a.right - r, a.right - r, { x: -1, y: 0 }],
    [b.pos.y < a.top + r, a.top + r, { x: 0, y: 1 }],
    [b.pos.y > a.bottom - r, a.bottom - r, { x: 0, y: -1 }],
  ];
  for (const [hit, edge, n] of walls) {
    if (!hit) continue;
    if (n.x !== 0) b.pos.x = edge; else b.pos.y = edge;
    const vn = dot(b.vel, n);
    if (vn >= 0) continue;
    b.vel.x -= (1 + BALL_WALL_RESTITUTION) * vn * n.x;
    b.vel.y -= (1 + BALL_WALL_RESTITUTION) * vn * n.y;
    b.spin *= BALL_WALL_SPIN_KEEP;
    b.bounces++;
    if (-vn > BOUNCE_EVENT_MIN_SPEED) {
      events.push({ type: 'bounce', pos: { x: b.pos.x - n.x * r, y: b.pos.y - n.y * r }, normal: copy(n), speed: -vn });
    }
  }
}

/** A live ball that slowed below BALL_LIVE_MIN_SPEED goes back to neutral (harmless). */
export function checkNeutral(state: MatchState, events: GameEvent[]): void {
  const b = state.ball;
  if (b.mode === 'neutral' || b.heldBy !== null) return;
  if (Math.hypot(b.vel.x, b.vel.y) < BALL_LIVE_MIN_SPEED) {
    b.mode = 'neutral';
    b.element = null;
    events.push({ type: 'ballNeutral', pos: copy(b.pos) });
  }
}
