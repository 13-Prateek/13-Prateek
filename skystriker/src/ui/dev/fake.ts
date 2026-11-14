/**
 * Fake MatchState + a tiny fake "sim" clock for the HUD/audio dev harness.
 * Lives in src/ui so it never depends on the (parallel, in-progress) real sim.
 */
import { BALL_RADIUS, COUNTDOWN_TICKS, MAX_HP, ROUND_OVER_TICKS, ROUND_TIME, SIM_HZ } from '../../shared/constants';
import type { FighterState, GameEvent, HeroId, MatchState, PlayerId } from '../../shared/types';
import { EMPTY_INPUT } from '../../shared/types';

function fighter(id: PlayerId, heroId: HeroId): FighterState {
  const element = ({ kael: 'fire', yuki: 'frost', zap: 'volt', brakka: 'stone' } as const)[heroId];
  return {
    id, heroId, element,
    pos: { x: id === 0 ? 400 : 1200, y: 450 }, vel: { x: 0, y: 0 }, facing: { x: id === 0 ? 1 : -1, y: 0 },
    hp: MAX_HP, aura: 0, kickPhase: 'idle', kickTimer: 0, charge: 0, dashCooldown: 0, dashTimer: 0,
    invulnTimer: 0, hitstun: 0, trapping: false, infused: false, comboAgainst: 0,
  };
}

export function fakeState(heroes: [HeroId, HeroId] = ['kael', 'yuki']): MatchState {
  return {
    config: { heroes, roundsToWin: 2, seed: 1 },
    tick: 0, phase: 'countdown', phaseTimer: COUNTDOWN_TICKS, round: 1, wins: [0, 0],
    fighters: [fighter(0, heroes[0]), fighter(1, heroes[1])],
    ball: { pos: { x: 800, y: 450 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS, spin: 0, mode: 'neutral', owner: null,
      element: null, bounces: 0, heldBy: null, heldTicks: 0 },
    hitstop: 0, suddenDeath: false, arena: { left: 40, top: 40, right: 1560, bottom: 860 }, rng: 1,
    prevInput: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }],
  };
}

/** Advance the fake match clock one tick, emitting the same flow events the sim would. */
export function fakeTick(s: MatchState): GameEvent[] {
  const ev: GameEvent[] = [];
  s.tick++;
  if (s.phase === 'countdown') {
    if (s.phaseTimer % SIM_HZ === 0) ev.push({ type: 'countdown', secondsLeft: s.phaseTimer / SIM_HZ });
    if (--s.phaseTimer <= 0) { s.phase = 'playing'; s.phaseTimer = ROUND_TIME; ev.push({ type: 'fight' }); }
  } else if (s.phase === 'playing') {
    if (!s.suddenDeath && s.phaseTimer > 0) s.phaseTimer--;
  } else if (s.phase === 'roundOver') {
    if (--s.phaseTimer <= 0) nextRound(s, ev);
  }
  return ev;
}

export function nextRound(s: MatchState, ev: GameEvent[] = []): GameEvent[] {
  s.round++;
  s.phase = 'countdown';
  s.phaseTimer = COUNTDOWN_TICKS;
  s.suddenDeath = false;
  for (const f of s.fighters) { f.hp = MAX_HP; f.infused = false; }
  ev.push({ type: 'roundStart', round: s.round });
  return ev;
}

/** Apply a hit to `target` and return the events the sim would emit. */
export function fakeHit(s: MatchState, attacker: PlayerId, damage: number, combo = 1): GameEvent[] {
  const target: PlayerId = attacker === 0 ? 1 : 0;
  const f = s.fighters[target];
  f.hp = Math.max(0, f.hp - damage);
  s.fighters[attacker].aura = Math.min(300, s.fighters[attacker].aura + 20);
  const ev: GameEvent[] = [{
    type: 'hit', target, attacker, pos: { ...f.pos }, damage, speed: 1200 + damage * 30, bank: 0, combo, element: null,
  }];
  if (f.hp <= 0) {
    ev.push({ type: 'ko', loser: target, pos: { ...f.pos } });
    s.phase = 'roundOver';
    s.phaseTimer = ROUND_OVER_TICKS;
  }
  return ev;
}
