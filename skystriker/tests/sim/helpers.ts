/** Test helpers: build matches, skip the countdown, script inputs, place things precisely. */
import { createMatch, stepMatch } from '../../src/sim';
import type { GameEvent, HeroId, InputFrame, MatchState, PlayerId } from '../../src/shared/types';
import { EMPTY_INPUT } from '../../src/shared/types';

export const I = (over: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...over });
export const IDLE: [InputFrame, InputFrame] = [I(), I()];

export function match(seed = 1, heroes: [HeroId, HeroId] = ['kael', 'yuki']): MatchState {
  return createMatch({ heroes, roundsToWin: 2, seed });
}

/** A match already in the `playing` phase (countdown stepped through). */
export function playing(seed = 1, heroes: [HeroId, HeroId] = ['kael', 'yuki']): MatchState {
  const s = match(seed, heroes);
  while (s.phase === 'countdown') stepMatch(s, IDLE);
  return s;
}

/** Step until hitstop is over (so the next step runs physics). Returns events seen. */
export function clearHitstop(s: MatchState): GameEvent[] {
  const ev: GameEvent[] = [];
  while (s.hitstop > 0) ev.push(...stepMatch(s, [s.prevInput[0], s.prevInput[1]]));
  return ev;
}

export function step(s: MatchState, p0: Partial<InputFrame> = {}, p1: Partial<InputFrame> = {}): GameEvent[] {
  return stepMatch(s, [I(p0), I(p1)]);
}

export function run(s: MatchState, n: number, p0: Partial<InputFrame> = {}, p1: Partial<InputFrame> = {}): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < n; i++) ev.push(...step(s, p0, p1));
  return ev;
}

export const ofType = <T extends GameEvent['type']>(ev: GameEvent[], t: T) =>
  ev.filter((e): e is Extract<GameEvent, { type: T }> => e.type === t);

/** Move a fighter far away so it can't interfere. */
export function park(s: MatchState, id: PlayerId): void {
  const f = s.fighters[id];
  f.pos = { x: id === 0 ? 120 : 1480, y: 120 };
  f.vel = { x: 0, y: 0 };
}

export function setBall(s: MatchState, x: number, y: number, vx = 0, vy = 0, owner: PlayerId | null = null): void {
  const b = s.ball;
  b.pos = { x, y };
  b.vel = { x: vx, y: vy };
  b.spin = 0;
  b.owner = owner;
  b.mode = owner === null ? 'neutral' : 'live';
  b.bounces = 0;
  b.heldBy = null;
  b.heldTicks = 0;
}

/** Hold kick for `held` ticks then release (returns events; stops right after the release tick). */
export function tapKick(s: MatchState, id: PlayerId, held: number, extra: Partial<InputFrame> = {}): GameEvent[] {
  const ev: GameEvent[] = [];
  const press = (k: boolean) => (id === 0 ? step(s, { ...extra, kick: k }, {}) : step(s, {}, { ...extra, kick: k }));
  for (let i = 0; i < held; i++) ev.push(...press(true));
  ev.push(...press(false));
  return ev;
}
