/** Fighter: input edges, timers, facing, dash / wall kick-off, flight, wall stops and wall splats. */
import {
  CHARGE_MOVE_MULT, DASH_COOLDOWN, DASH_INVULN, DASH_SPEED, DASH_TICKS, FIGHTER_ACCEL, FIGHTER_BODY_RADIUS,
  FIGHTER_DRAG, FIGHTER_MAX_SPEED, HITSTOP_SPLAT, HITSTUN_DRAG, KICK_CHARGE_START, PHASE_DASH_EXTRA_INVULN,
  PHASE_WINDED_MULT, PHASE_WINDED_TICKS, SIM_DT, SUDDEN_DEATH_ONE_HIT, WINDED_MULT, WINDED_TICKS,
  TRAP_MOVE_MULT, WALL_KICKOFF_SPEED, WALL_SPLAT_DAMAGE, WALL_SPLAT_MIN_SPEED, WALL_SPLAT_RESTITUTION,
  WALL_SPLAT_STUN, WALL_TOUCH_SLOP,
} from '../shared/constants';
import type { FighterState, GameEvent, InputFrame, MatchState, Vec2 } from '../shared/types';
import { dot, norm } from '../shared/vec';
import { addHitstop, callout, copy, heroOf, moveVec, other } from './util';

export interface Edges {
  kickPressed: boolean;
  kickReleased: boolean;
  dashPressed: boolean;
  phaseDashPressed: boolean;
  infusePressed: boolean;
}

export function edgesOf(prev: InputFrame, cur: InputFrame): Edges {
  return {
    kickPressed: cur.kick && !prev.kick,
    kickReleased: !cur.kick && prev.kick,
    dashPressed: cur.dash && !prev.dash,
    phaseDashPressed: !!cur.phaseDash && !prev.phaseDash,
    infusePressed: cur.infuse && !prev.infuse,
  };
}

/**
 * Per-tick countdown of fighter timers. Hitstun ending resets the combo counter (GDD §6).
 * A dash burst ending leaves the fighter Winded (longer and slower after a Phase Dash).
 */
export function tickTimers(f: FighterState, events: GameEvent[]): void {
  if (f.dashCooldown > 0) f.dashCooldown--;
  if ((f.winded ?? 0) > 0) f.winded = (f.winded ?? 0) - 1;
  if (f.dashTimer > 0 && --f.dashTimer === 0) {
    const phase = (f.phaseDashTimer ?? 0) > 0;
    f.winded = phase ? PHASE_WINDED_TICKS : WINDED_TICKS;
    f.windedMult = phase ? PHASE_WINDED_MULT : WINDED_MULT;
    events.push({ type: 'winded', player: f.id, ticks: f.winded });
  }
  if ((f.phaseDashTimer ?? 0) > 0) f.phaseDashTimer = (f.phaseDashTimer ?? 0) - 1;
  if (f.invulnTimer > 0) f.invulnTimer--;
  if (f.hitstun > 0) {
    f.hitstun--;
    if (f.hitstun === 0) f.comboAgainst = 0;
  }
  if (f.kickPhase === 'recovery' && --f.kickTimer <= 0) {
    f.kickPhase = 'idle';
    f.kickTimer = 0;
  }
}

/** Facing follows the aim stick/mouse; with no aim it faces the opponent. Locked in hitstun and mid-kick. */
export function updateFacing(f: FighterState, inp: InputFrame, opp: FighterState): void {
  if (f.hitstun > 0 || f.kickPhase === 'active') return;
  const ax = Number.isFinite(inp.aimX) ? inp.aimX : 0;
  const ay = Number.isFinite(inp.aimY) ? inp.aimY : 0;
  let dir = norm({ x: ax, y: ay });
  if (dir.x === 0 && dir.y === 0) dir = norm({ x: opp.pos.x - f.pos.x, y: opp.pos.y - f.pos.y });
  if (dir.x !== 0 || dir.y !== 0) f.facing = dir;
}

/** Outward normals of every wall the fighter is touching (left, right, top, bottom order). */
export function touchingWalls(state: MatchState, f: FighterState): Vec2[] {
  const a = state.arena, r = FIGHTER_BODY_RADIUS + WALL_TOUCH_SLOP;
  const out: Vec2[] = [];
  if (f.pos.x <= a.left + r) out.push({ x: 1, y: 0 });
  if (f.pos.x >= a.right - r) out.push({ x: -1, y: 0 });
  if (f.pos.y <= a.top + r) out.push({ x: 0, y: 1 });
  if (f.pos.y >= a.bottom - r) out.push({ x: 0, y: -1 });
  return out;
}

/**
 * Dash on press: burst in the move direction (or facing). Touching a wall = wall kick-off.
 * Free dash: no invulnerability. Phase Dash (`phase`, aura already checked by the caller):
 * invulnerable for the whole burst + PHASE_DASH_EXTRA_INVULN ticks. Both leave you Winded.
 * Returns true if the dash happened.
 */
export function tryDash(state: MatchState, f: FighterState, inp: InputFrame, events: GameEvent[], phase = false): boolean {
  if (f.dashCooldown > 0 || f.hitstun > 0) return false;
  const mv = moveVec(inp);
  let dir = norm(mv);
  if (dir.x === 0 && dir.y === 0) dir = copy(f.facing);
  const walls = touchingWalls(state, f);
  let speed = DASH_SPEED;
  let wallKick = false;
  if (walls.length > 0) {
    // Launch away from the wall(s), keeping the sideways part of the input so you can angle off.
    const n = norm(walls.reduce((acc, w) => ({ x: acc.x + w.x, y: acc.y + w.y }), { x: 0, y: 0 }));
    const along = dot(dir, n);
    const tangent = { x: dir.x - n.x * along, y: dir.y - n.y * along };
    const kick = norm({ x: n.x + tangent.x, y: n.y + tangent.y });
    dir = kick.x === 0 && kick.y === 0 ? n : kick;
    speed = WALL_KICKOFF_SPEED;
    wallKick = true;
  }
  f.vel = { x: dir.x * speed, y: dir.y * speed };
  f.dashTimer = DASH_TICKS;
  f.dashCooldown = DASH_COOLDOWN;
  f.winded = 0;
  if (phase) {
    f.phaseDashTimer = DASH_TICKS + PHASE_DASH_EXTRA_INVULN;
    f.invulnTimer = Math.max(f.invulnTimer, f.phaseDashTimer);
    events.push({ type: 'phaseDash', player: f.id, pos: copy(f.pos), dir: copy(dir) });
  } else {
    f.invulnTimer = Math.max(f.invulnTimer, DASH_INVULN);
    events.push(wallKick
      ? { type: 'dash', player: f.id, pos: copy(f.pos), dir: copy(dir), wallKick: true }
      : { type: 'dash', player: f.id, pos: copy(f.pos), dir: copy(dir) });
  }
  return true;
}

/** Integrate one fighter: control + drag (or dash hold / hitstun drift), then walls. */
export function moveFighter(state: MatchState, f: FighterState, inp: InputFrame, events: GameEvent[], combat: boolean): void {
  if (f.dashTimer > 0) {
    // Dash burst: velocity held, no drag, no steering.
  } else if (f.hitstun > 0 || !combat) {
    const d = Math.exp(-(f.hitstun > 0 ? HITSTUN_DRAG : FIGHTER_DRAG) * SIM_DT);
    f.vel.x *= d; f.vel.y *= d;
  } else {
    const h = heroOf(f);
    let mult = h.speed;
    if (f.kickPhase === 'charging' && f.kickTimer >= KICK_CHARGE_START) mult *= CHARGE_MOVE_MULT;
    if (f.trapping) mult *= TRAP_MOVE_MULT;
    if ((f.winded ?? 0) > 0) mult *= f.windedMult ?? WINDED_MULT;
    const mv = moveVec(inp);
    const drag = Math.exp(-FIGHTER_DRAG * SIM_DT);
    const before = Math.hypot(f.vel.x, f.vel.y);
    f.vel.x = (f.vel.x + mv.x * FIGHTER_ACCEL * mult * SIM_DT) * drag;
    f.vel.y = (f.vel.y + mv.y * FIGHTER_ACCEL * mult * SIM_DT) * drag;
    // Input can steer but not push past the cap; extra speed (dash, knockback) just decays.
    const cap = Math.max(FIGHTER_MAX_SPEED * mult, before * drag);
    const after = Math.hypot(f.vel.x, f.vel.y);
    if (after > cap) { f.vel.x *= cap / after; f.vel.y *= cap / after; }
  }
  f.pos.x += f.vel.x * SIM_DT;
  f.pos.y += f.vel.y * SIM_DT;
  collideFighterWalls(state, f, events, combat);
}

/** Wall stops; a fighter in hitstun slamming a wall fast enough gets WALL SPLATTED. */
export function collideFighterWalls(state: MatchState, f: FighterState, events: GameEvent[], combat: boolean): void {
  const a = state.arena, r = FIGHTER_BODY_RADIUS;
  const walls: [boolean, number, Vec2][] = [
    [f.pos.x < a.left + r, a.left + r, { x: 1, y: 0 }],
    [f.pos.x > a.right - r, a.right - r, { x: -1, y: 0 }],
    [f.pos.y < a.top + r, a.top + r, { x: 0, y: 1 }],
    [f.pos.y > a.bottom - r, a.bottom - r, { x: 0, y: -1 }],
  ];
  for (const [hit, edge, n] of walls) {
    if (!hit) continue;
    if (n.x !== 0) f.pos.x = edge; else f.pos.y = edge;
    const vn = dot(f.vel, n);
    if (vn >= 0) continue;
    if (f.hitstun > 0 && -vn > WALL_SPLAT_MIN_SPEED) {
      f.vel.x -= (1 + WALL_SPLAT_RESTITUTION) * vn * n.x;
      f.vel.y -= (1 + WALL_SPLAT_RESTITUTION) * vn * n.y;
      if (combat) wallSplat(state, f, n, events);
    } else {
      f.vel.x -= vn * n.x;
      f.vel.y -= vn * n.y;
    }
  }
}

function wallSplat(state: MatchState, f: FighterState, n: Vec2, events: GameEvent[]): void {
  const dmg = WALL_SPLAT_DAMAGE;
  f.hp = state.suddenDeath && SUDDEN_DEATH_ONE_HIT ? 0 : Math.max(0, f.hp - dmg);
  f.hitstun = Math.max(f.hitstun, WALL_SPLAT_STUN);
  const pos = { x: f.pos.x - n.x * FIGHTER_BODY_RADIUS, y: f.pos.y - n.y * FIGHTER_BODY_RADIUS };
  events.push({ type: 'wallSplat', target: f.id, pos, normal: copy(n), damage: dmg });
  callout(events, 'WALL SPLAT!', other(f.id), 2);
  addHitstop(state, HITSTOP_SPLAT);
}
