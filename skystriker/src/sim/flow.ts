/** Match flow: countdown → playing → (KO | timeout | sudden death) → roundOver → next round / matchOver. */
import {
  ARENA_MARGIN, AURA_CARRIES_OVER, BALL_RADIUS, COUNTDOWN_TICKS, HITSTOP_KO, KICK_RECOVERY_TICKS, MAX_HP,
  ROUND_OVER_TICKS, ROUND_TIME, SIM_DT, SIM_HZ, SUDDEN_DEATH_MIN_H, SUDDEN_DEATH_MIN_W, SUDDEN_DEATH_SHRINK_SPEED,
  WORLD_H, WORLD_W,
} from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { BallState, FighterState, GameEvent, MatchConfig, MatchState, PlayerId } from '../shared/types';
import { releaseBall } from './kick';
import { addHitstop, callout, copy } from './util';

export function makeFighter(id: PlayerId, config: MatchConfig, aura = 0): FighterState {
  const hero = HEROES[config.heroes[id]];
  return {
    id, heroId: hero.id, element: hero.element,
    pos: { x: id === 0 ? WORLD_W * 0.25 : WORLD_W * 0.75, y: WORLD_H * 0.5 },
    vel: { x: 0, y: 0 }, facing: { x: id === 0 ? 1 : -1, y: 0 },
    hp: MAX_HP, aura, kickPhase: 'idle', kickTimer: 0, charge: 0,
    dashCooldown: 0, dashTimer: 0, invulnTimer: 0, hitstun: 0,
    trapping: false, infused: false, comboAgainst: 0, trapLock: false, closeCall: 0,
  };
}

export function makeBall(): BallState {
  return {
    pos: { x: WORLD_W / 2, y: WORLD_H / 2 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, spin: 0,
    mode: 'neutral', owner: null, element: null, bounces: 0, heldBy: null, heldTicks: 0,
  };
}

export const freshArena = (): MatchState['arena'] =>
  ({ left: ARENA_MARGIN, top: ARENA_MARGIN, right: WORLD_W - ARENA_MARGIN, bottom: WORLD_H - ARENA_MARGIN });

/** Reset positions/HP/ball for a round. Aura carries over (AURA_CARRIES_OVER), wins and rng persist. */
export function startRound(state: MatchState, round: number): void {
  const keep = (i: PlayerId) => (AURA_CARRIES_OVER ? state.fighters[i].aura : 0);
  state.fighters = [makeFighter(0, state.config, keep(0)), makeFighter(1, state.config, keep(1))];
  state.ball = makeBall();
  state.arena = freshArena();
  state.round = round;
  state.phase = 'countdown';
  state.phaseTimer = COUNTDOWN_TICKS;
  state.suddenDeath = false;
  state.hitstop = 0;
}

/** One countdown tick: `roundStart` on the first tick, `countdown` each whole second, then `fight`. */
export function stepCountdown(state: MatchState, events: GameEvent[]): void {
  if (state.phaseTimer === COUNTDOWN_TICKS) events.push({ type: 'roundStart', round: state.round });
  if (state.phaseTimer % SIM_HZ === 0) events.push({ type: 'countdown', secondsLeft: state.phaseTimer / SIM_HZ });
  if (--state.phaseTimer <= 0) {
    state.phase = 'playing';
    state.phaseTimer = ROUND_TIME;
    events.push({ type: 'fight' });
  }
}

/** Stop kicks/traps when a round ends so nothing fires during the round-over pause. */
function freezeActions(state: MatchState, events: GameEvent[]): void {
  for (const f of state.fighters) {
    if (f.kickPhase === 'charging' || f.kickPhase === 'active') {
      f.kickPhase = 'recovery';
      f.kickTimer = KICK_RECOVERY_TICKS;
    }
    f.charge = 0;
    if (state.ball.heldBy === f.id) releaseBall(state, f, events, false);
  }
}

function enterRoundOver(state: MatchState, events: GameEvent[]): void {
  state.phase = 'roundOver';
  state.phaseTimer = ROUND_OVER_TICKS;
  freezeActions(state, events);
}

/** hp <= 0 → K.O.: big hitstop, `ko` event, round over. */
export function checkKO(state: MatchState, events: GameEvent[]): void {
  const dead = state.fighters.filter((f) => f.hp <= 0);
  if (dead.length === 0) return;
  for (const f of dead) events.push({ type: 'ko', loser: f.id, pos: copy(f.pos) });
  const winner = dead.length === 1 ? (dead[0].id === 0 ? 1 : 0) : null;
  callout(events, 'K.O.!', winner, 3);
  addHitstop(state, HITSTOP_KO);
  enterRoundOver(state, events);
}

/** Round timer ran out: higher HP wins, a tie starts sudden death. */
export function timeout(state: MatchState, events: GameEvent[]): void {
  const [a, b] = state.fighters;
  if (a.hp !== b.hp) {
    callout(events, 'TIME!', null, 2);
    enterRoundOver(state, events);
    return;
  }
  state.suddenDeath = true;
  state.phaseTimer = 0;
  events.push({ type: 'suddenDeath' });
  callout(events, 'SUDDEN DEATH!', null, 3);
}

/** Sudden death: the walls slowly close in (down to a minimum size). */
export function shrinkArena(state: MatchState): void {
  const a = state.arena, s = SUDDEN_DEATH_SHRINK_SPEED * SIM_DT;
  if (a.right - a.left - 2 * s >= SUDDEN_DEATH_MIN_W) { a.left += s; a.right -= s; }
  if (a.bottom - a.top - 2 * s >= SUDDEN_DEATH_MIN_H) { a.top += s; a.bottom -= s; }
}

export function roundWinner(state: MatchState): PlayerId | null {
  const [a, b] = state.fighters;
  return a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : null;
}

/**
 * Round-over bookkeeping. First tick (after any KO hitstop): award the win + `roundEnd`.
 * Last tick: `matchEnd` or the next round's countdown.
 */
export function roundOverStart(state: MatchState, events: GameEvent[]): void {
  if (state.phaseTimer !== ROUND_OVER_TICKS) return;
  const w = roundWinner(state);
  if (w !== null) state.wins[w]++;
  events.push({ type: 'roundEnd', winner: w });
}

export function roundOverEnd(state: MatchState, events: GameEvent[]): void {
  if (--state.phaseTimer > 0) return;
  const need = state.config.roundsToWin;
  const champ: PlayerId | null = state.wins[0] >= need ? 0 : state.wins[1] >= need ? 1 : null;
  if (champ !== null) {
    state.phase = 'matchOver';
    state.phaseTimer = 0;
    events.push({ type: 'matchEnd', winner: champ });
  } else {
    startRound(state, state.round + 1);
  }
}
