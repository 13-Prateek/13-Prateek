/**
 * GAME LOOP — owned by the lead/integration session.
 * Fixed-timestep simulation (SIM_HZ) with render interpolation, so motion is
 * smooth at any monitor refresh rate and the sim stays deterministic.
 */
import { SIM_DT } from '../shared/constants';
import type { AIController, AudioSystem, HudSystem, InputFrame, InputSource, MatchState, Renderer } from '../shared/types';
import { createMatch, stepMatch } from '../sim';

const MAX_FRAME_SECONDS = 0.25; // avoid spiral of death after a tab switch

export interface LoopDeps {
  renderer: Renderer;
  audio: AudioSystem;
  hud: HudSystem;
  p1: InputSource;
  p2: InputSource | AIController;
  seed?: number;
}

/** Cheap structural clone for the interpolation snapshot (state is plain data). */
const snapshot = (s: MatchState): MatchState => structuredClone(s);

export function startGame(deps: LoopDeps) {
  const state = createMatch({ heroes: ['kael', 'yuki'], roundsToWin: 2, seed: deps.seed ?? 1337 });
  let prev = snapshot(state);
  let acc = 0;
  let last = performance.now();
  let running = true;
  let paused = false;

  const sampleP2 = (): InputFrame =>
    'think' in deps.p2 ? deps.p2.think(state, 1) : deps.p2.sample(state, 1);

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    if (!paused) {
      acc += dt;
      while (acc >= SIM_DT) {
        prev = snapshot(state);
        const events = stepMatch(state, [deps.p1.sample(state, 0), sampleP2()]);
        if (events.length) {
          deps.renderer.onEvents(events, state);
          deps.audio.onEvents(events, state);
          deps.hud.onEvents(events, state);
        }
        acc -= SIM_DT;
      }
    }
    deps.renderer.render(prev, state, paused ? 1 : acc / SIM_DT, dt);
    deps.hud.update(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    state: () => state,
    setPaused(p: boolean) { paused = p; },
    stop() { running = false; },
  };
}
