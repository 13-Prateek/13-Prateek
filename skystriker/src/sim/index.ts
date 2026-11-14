/**
 * SIM MODULE — STUB. Owned by the sim session (see docs/ARCHITECTURE.md).
 * Replace the internals; keep the exported signatures (SimApi).
 */
import {
  ARENA_MARGIN, BALL_RADIUS, COUNTDOWN_TICKS, FIGHTER_ACCEL, FIGHTER_DRAG, FIGHTER_MAX_SPEED,
  MAX_HP, ROUND_TIME, SIM_DT, SIM_HZ, WORLD_H, WORLD_W,
} from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { FighterState, GameEvent, InputFrame, MatchConfig, MatchState, PlayerId } from '../shared/types';
import { EMPTY_INPUT } from '../shared/types';

function makeFighter(id: PlayerId, config: MatchConfig): FighterState {
  const hero = HEROES[config.heroes[id]];
  return {
    id, heroId: hero.id, element: hero.element,
    pos: { x: id === 0 ? WORLD_W * 0.25 : WORLD_W * 0.75, y: WORLD_H * 0.5 },
    vel: { x: 0, y: 0 }, facing: { x: id === 0 ? 1 : -1, y: 0 },
    hp: MAX_HP, aura: 0, kickPhase: 'idle', kickTimer: 0, charge: 0,
    dashCooldown: 0, dashTimer: 0, invulnTimer: 0, hitstun: 0,
    trapping: false, infused: false, comboAgainst: 0,
  };
}

export function createMatch(config: MatchConfig): MatchState {
  return {
    config, tick: 0, phase: 'countdown', phaseTimer: COUNTDOWN_TICKS, round: 1, wins: [0, 0],
    fighters: [makeFighter(0, config), makeFighter(1, config)],
    ball: {
      pos: { x: WORLD_W / 2, y: WORLD_H / 2 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, spin: 0,
      mode: 'neutral', owner: null, element: null, bounces: 0, heldBy: null, heldTicks: 0,
    },
    hitstop: 0, suddenDeath: false,
    arena: { left: ARENA_MARGIN, top: ARENA_MARGIN, right: WORLD_W - ARENA_MARGIN, bottom: WORLD_H - ARENA_MARGIN },
    rng: config.seed | 0,
    prevInput: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }],
  };
}

export function stepMatch(state: MatchState, inputs: [InputFrame, InputFrame]): GameEvent[] {
  const events: GameEvent[] = [];
  state.tick++;
  if (state.phase === 'countdown') {
    if (state.phaseTimer % SIM_HZ === 0) events.push({ type: 'countdown', secondsLeft: state.phaseTimer / SIM_HZ });
    if (--state.phaseTimer <= 0) { state.phase = 'playing'; state.phaseTimer = ROUND_TIME; events.push({ type: 'fight' }); }
  }
  // Stub movement only so the scaffold is visibly alive.
  for (const f of state.fighters) {
    const inp = inputs[f.id];
    f.vel.x += inp.moveX * FIGHTER_ACCEL * SIM_DT;
    f.vel.y += inp.moveY * FIGHTER_ACCEL * SIM_DT;
    const d = Math.exp(-FIGHTER_DRAG * SIM_DT);
    f.vel.x *= d; f.vel.y *= d;
    const sp = Math.hypot(f.vel.x, f.vel.y);
    if (sp > FIGHTER_MAX_SPEED) { f.vel.x *= FIGHTER_MAX_SPEED / sp; f.vel.y *= FIGHTER_MAX_SPEED / sp; }
    f.pos.x = Math.min(state.arena.right, Math.max(state.arena.left, f.pos.x + f.vel.x * SIM_DT));
    f.pos.y = Math.min(state.arena.bottom, Math.max(state.arena.top, f.pos.y + f.vel.y * SIM_DT));
  }
  state.prevInput = [{ ...inputs[0] }, { ...inputs[1] }];
  return events;
}
