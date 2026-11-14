/** Small sim-internal helpers. Pure, deterministic. */
import {
  AURA_MAX, AURA_PER_BAR, BALL_LIVE_MIN_SPEED, DAMAGE_MAX_SPEED, DAMAGE_MIN_SPEED, FIGHTER_BODY_RADIUS, FOOT_REACH,
  POWER_KICK_MAX_SPEED,
} from '../shared/constants';
import { HEROES, type HeroDef } from '../shared/heroes';
import type { BallState, FighterState, GameEvent, InputFrame, MatchState, PlayerId, Vec2 } from '../shared/types';

export const other = (id: PlayerId): PlayerId => (id === 0 ? 1 : 0);
export const heroOf = (f: FighterState): HeroDef => HEROES[f.heroId];
export const copy = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });

export const footPos = (f: FighterState): Vec2 => ({
  x: f.pos.x + f.facing.x * FOOT_REACH,
  y: f.pos.y + f.facing.y * FOOT_REACH,
});

/** Movement intent clamped to length <= 1 (keyboard diagonals are not normalised). */
export function moveVec(inp: InputFrame): Vec2 {
  const x = Number.isFinite(inp.moveX) ? inp.moveX : 0;
  const y = Number.isFinite(inp.moveY) ? inp.moveY : 0;
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

export const bars = (aura: number): number => Math.floor(aura / AURA_PER_BAR + 1e-9);

/** Add aura (scaled by hero auraGain); emits `auraBar` when the bar count changes. */
export function gainAura(f: FighterState, amount: number, events: GameEvent[]): void {
  const before = bars(f.aura);
  f.aura = Math.min(AURA_MAX, Math.max(0, f.aura + amount * heroOf(f).auraGain));
  const after = bars(f.aura);
  if (after !== before) events.push({ type: 'auraBar', player: f.id, bars: after });
}

export function spendAura(f: FighterState, amount: number, events: GameEvent[]): void {
  const before = bars(f.aura);
  f.aura = Math.max(0, f.aura - amount);
  const after = bars(f.aura);
  if (after !== before) events.push({ type: 'auraBar', player: f.id, bars: after });
}

export function callout(events: GameEvent[], text: string, player: PlayerId | null, tier: 1 | 2 | 3): void {
  events.push({ type: 'callout', text, player, tier });
}

export function addHitstop(state: MatchState, ticks: number): void {
  state.hitstop = Math.max(state.hitstop, ticks);
}

/** Overlap of the ball with a fighter's body circle. */
export function bodyOverlap(f: FighterState, b: BallState): boolean {
  const r = FIGHTER_BODY_RADIUS + b.radius;
  const dx = b.pos.x - f.pos.x, dy = b.pos.y - f.pos.y;
  return dx * dx + dy * dy <= r * r;
}

/** Ball is live (or super) and owned by the other player = dangerous to `f`. */
export const isEnemyLive = (b: BallState, f: FighterState): boolean =>
  b.mode !== 'neutral' && b.owner !== null && b.owner !== f.id && b.heldBy === null;

/**
 * How dangerous (damage-wise) a ball at this speed is: 0 at DAMAGE_MIN_SPEED, 1 at DAMAGE_MAX_SPEED.
 * Unclamped above 1 (perfect returns go faster and hurt more). Drives damage only.
 */
export const dangerRaw = (speed: number): number =>
  Math.max(0, (speed - DAMAGE_MIN_SPEED) / (DAMAGE_MAX_SPEED - DAMAGE_MIN_SPEED));

/** Ball-speed strength 0..1: 0 at the live threshold, 1 at a full power kick. `kick.power` and knockback. */
export const kickPower = (speed: number): number =>
  Math.min(1, Math.max(0, (speed - BALL_LIVE_MIN_SPEED) / (POWER_KICK_MAX_SPEED - BALL_LIVE_MIN_SPEED)));
