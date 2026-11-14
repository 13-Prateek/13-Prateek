/**
 * SIM MODULE — pure, deterministic fixed-step simulation (see .claude/skills/sim-rules).
 * Public API: `createMatch` / `stepMatch` (SimApi). Everything else is internal.
 *
 * Tick order: hitstop gate → timers → facing → actions (infuse, dash, kick, trap) → fighter movement
 * → held ball → ball sub-steps (walls, foot → body → bump contacts, close calls) → live/neutral
 * → kick timers → KO → sudden-death walls → round timer → prevInput.
 */
import { COUNTDOWN_TICKS, INFUSE_COST, ROUNDS_TO_WIN } from '../shared/constants';
import type { FighterState, GameEvent, InputFrame, MatchConfig, MatchState } from '../shared/types';
import { EMPTY_INPUT } from '../shared/types';
import { checkNeutral, integrateBall } from './ball';
import { resolveContacts, updateCloseCalls, type TickCtx } from './combat';
import { edgesOf, moveFighter, tickTimers, tryDash, updateFacing } from './fighter';
import {
  checkKO, freshArena, makeBall, makeFighter, roundOverEnd, roundOverStart, shrinkArena, stepCountdown, timeout,
} from './flow';
import { endOfTickKick, updateHeldBall, updateKickInput, updateTrap } from './kick';
import { spendAura } from './util';

export function createMatch(config: MatchConfig): MatchState {
  return {
    config: { ...config, heroes: [config.heroes[0], config.heroes[1]], roundsToWin: config.roundsToWin || ROUNDS_TO_WIN },
    tick: 0, phase: 'countdown', phaseTimer: COUNTDOWN_TICKS, round: 1, wins: [0, 0],
    fighters: [makeFighter(0, config), makeFighter(1, config)],
    ball: makeBall(),
    hitstop: 0, suddenDeath: false,
    arena: freshArena(),
    rng: config.seed | 0,
    prevInput: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }],
  };
}

/** Advance exactly one tick. Mutates `state`, returns the events presentation should react to. */
export function stepMatch(state: MatchState, inputs: [InputFrame, InputFrame]): GameEvent[] {
  const events: GameEvent[] = [];
  state.tick++;
  // Hitstop: the world is frozen. prevInput is NOT updated, so a press during the freeze
  // fires once on the first tick after it (buffered) instead of being eaten.
  if (state.hitstop > 0) {
    state.hitstop--;
    return events;
  }
  switch (state.phase) {
    case 'countdown':
      for (const f of state.fighters) updateFacing(f, inputs[f.id], state.fighters[f.id === 0 ? 1 : 0]);
      stepCountdown(state, events);
      break;
    case 'playing':
      simulate(state, inputs, events, true);
      if (state.phase === 'playing') {
        if (state.suddenDeath) shrinkArena(state);
        else if (--state.phaseTimer <= 0) timeout(state, events);
      }
      break;
    case 'roundOver':
      roundOverStart(state, events);
      simulate(state, inputs, events, false);
      roundOverEnd(state, events);
      break;
    case 'matchOver':
      simulate(state, inputs, events, false);
      break;
  }
  state.prevInput = [{ ...inputs[0] }, { ...inputs[1] }];
  return events;
}

function simulate(state: MatchState, inputs: [InputFrame, InputFrame], events: GameEvent[], combat: boolean): void {
  const ctx: TickCtx = { state, inputs, events, combat, hitThisTick: false };
  const [f0, f1] = state.fighters;
  const opp = (f: FighterState) => (f.id === 0 ? f1 : f0);
  const input = (f: FighterState): InputFrame => (combat ? inputs[f.id] : EMPTY_INPUT);

  for (const f of state.fighters) tickTimers(f);
  for (const f of state.fighters) updateFacing(f, input(f), opp(f));
  if (combat) {
    for (const f of state.fighters) {
      const inp = inputs[f.id];
      const edges = edgesOf(state.prevInput[f.id], inp);
      if (edges.infusePressed && f.hitstun === 0 && !f.infused && f.aura >= INFUSE_COST) {
        spendAura(f, INFUSE_COST, events);
        f.infused = true;
        events.push({ type: 'infuse', player: f.id, element: f.element });
      }
      if (edges.dashPressed) tryDash(state, f, inp, events);
      updateKickInput(state, f, inp, edges, events);
      updateTrap(state, f, inp, events);
    }
  }
  for (const f of state.fighters) moveFighter(state, f, input(f), events, combat);

  updateHeldBall(state, events);
  if (state.ball.heldBy !== null) {
    resolveContacts(ctx); // an enemy foot can still steal a trapped ball
  } else {
    integrateBall(state, events, () => {
      resolveContacts(ctx);
      updateCloseCalls(ctx);
    });
  }
  updateCloseCalls(ctx);
  checkNeutral(state, events);
  for (const f of state.fighters) endOfTickKick(f);
  if (combat) checkKO(state, events);
}
