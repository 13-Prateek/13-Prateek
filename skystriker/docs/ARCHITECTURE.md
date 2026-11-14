# Architecture and team workflow

## Stack
TypeScript · Vite · PixiJS 8 (WebGL) · pixi-filters (glow/bloom/shockwave) · Web Audio API · Vitest · Playwright smoke test.

## Data flow
```
 InputSource (keyboard) ─┐
                         ├─► sim.stepMatch(state, [in0, in1]) ──► GameEvent[] ──► renderer.onEvents
 AIController.think ─────┘          │ (fixed 60 Hz, deterministic)            ├─► audio.onEvents
                                    ▼                                         └─► hud.onEvents
                               MatchState ──► renderer.render(prev, curr, alpha) every animation frame
                                         └──► hud.update(state)
```
- **The sim is the single source of truth.** It's pure TypeScript: no DOM, no `Math.random`, no `Date`/`performance`. The same inputs always give the same result, so we get replays, tests and later online play.
- **Presentation never changes the state.** Render, audio and HUD only read the state and react to events.
- **Events are the only bridge** for one-off moments (a kick, a hit, a callout). If presentation needs to know "this happened", the sim must emit an event.
- Hitstop is stored in the sim state (`state.hitstop`). The renderer may *add* purely visual slow-mo on top.

## Module ownership
| Path | Owner session | Branch |
|---|---|---|
| `src/shared/**`, `src/game/**`, `src/main.ts`, docs, configs | Lead / integration | `claude/2d-flying-stick-fight-9ilslx` |
| `src/sim/**`, `tests/sim/**`, tuning values in `src/shared/constants.ts` | Sim session | `claude/skystriker-sim` |
| `src/render/**`, `src/dev/**` | Render/VFX session | `claude/skystriker-render` |
| `src/audio/**`, `src/ui/**`, `src/input/**`, `index.html` styles | Audio/UI session | `claude/skystriker-ui-audio` |
| `src/ai/**`, `tests/ai/**` | AI session (wave 2) | `claude/skystriker-ai` |

**Rules**
1. Only edit files your session owns. If you need a change elsewhere, write it under "Requests for lead" in your handoff.
2. `src/shared/types.ts` is the contract. You may **add optional fields or new event types**, but never rename or remove anything. List every change under "Contract changes".
3. Keep each module's public entry point (`src/<module>/index.ts`) and its exported function signature, because `src/main.ts` and `src/game/loop.ts` depend on them.
4. Never import another module's internals. Import only from `src/shared/**` and (for presentation) types.

## Definition of done (every session)
- `npm run typecheck` passes · `npm test` passes · `npm run build && npm run smoke` passes.
- You looked at `playtest-shots/*.png` yourself and described what you saw.
- Small, focused commits. Push to your branch.
- Write `docs/handoff/<module>.md`: what's done, how to test it by hand (keys to press, what you should see), known issues, contract changes, requests for lead.

## Integration (lead)
The lead merges module branches into the main dev branch, resolves conflicts, runs the full checks, publishes a playable build, and the human tester plays it and reports bugs. Bugs become focused tasks for the owning session.
