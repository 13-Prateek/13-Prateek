---
name: sim-rules
description: Determinism, physics and testing rules for Skystriker's simulation (skystriker/src/sim). Use whenever writing or reviewing sim, physics, collision, combat-resolution or AI-prediction code.
---

# Simulation rules

## Determinism (non-negotiable)
- Pure TypeScript. **No** DOM, `window`, `Math.random`, `Date`, `performance`, timers, or iteration over unordered structures where order matters.
- Randomness only through `rand(state.rng)` from `src/shared/vec.ts`, storing the next state back into `state.rng`.
- Fixed step: one call to `stepMatch` = one tick of `SIM_DT`. Never read wall-clock time.
- Same seed + same input sequence → identical state. Keep a test that proves it (run 600 ticks twice with scripted inputs and deep-equal the states).

## State
- `MatchState` must stay plain JSON-able data (the loop `structuredClone`s it every tick). No classes, Maps, functions or cycles.
- All tuning numbers go in `src/shared/constants.ts` with a comment. No magic numbers in logic.
- Times are in ticks (`sec(0.5)` helper), distances in world units, speeds in units/second.

## Physics recipe
- Integrate in a fixed order each tick: inputs → timers → fighter movement → ball (spin curve, drag, integrate) → wall collisions → kick/foot checks → body checks → combat bookkeeping → phase/round logic → events.
- Exponential drag: `vel *= Math.exp(-DRAG * SIM_DT)`.
- Fast ball vs. thin targets: **sub-step the ball** (split movement into steps no longer than `BALL_RADIUS`) or use swept circle tests, so a 2600 u/s ball can't tunnel through a foot or body.
- Wall bounce: reflect the velocity component along the normal, multiply by restitution, push the ball back inside the arena, emit `bounce`, increment `bounces`.
- Keep the resolution order from GDD §4: **foot before body**. Perfect window uses time-to-impact (distance / closing speed), not raw distance.

## Hitstop
- While `state.hitstop > 0`: decrement it and **skip physics**, but still record `prevInput` so edge detection doesn't fire twice.

## Events
- Emit an event for everything presentation needs to react to (GDD + `GameEvent` union). Events carry positions so VFX can spawn at the right spot.
- Emit `callout` events for "PERFECT!", "BANK SHOT!", "DOUBLE BANK!", "CLOSE CALL!", "WALL SPLAT!", "x-HIT COMBO!", "K.O.!". Tier 1 is small, 3 is huge.

## Tests to keep green
- Determinism · kick-vs-hit resolution (ball touches foot during active → kick; touches body → hit) · live ball doesn't hurt its owner · neutral ball never hurts · perfect window · bank bonus · combo scaling · trap timeout · round/match flow · no tunnelling at max speed.
