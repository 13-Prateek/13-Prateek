/**
 * AUDIO MODULE — synthesised Web Audio SFX + procedural music. No asset files.
 * Owned by the audio/UI session (see docs/ARCHITECTURE.md).
 *
 * The AudioContext is created lazily in unlock() (call it from a user gesture).
 * Events that arrive before unlock are ignored. Music intensity follows the
 * match automatically (calm → combat → final round / low HP / sudden death)
 * until setMusicIntensity() is called, after which the game is in control.
 */
import type { AudioSystem, GameEvent, MatchState } from '../shared/types';
import { type Engine, createEngine } from './engine';
import { DEFAULT_MASTER } from './mixer';

export { createEngine } from './engine';
export type { Engine } from './engine';

/** Scheduler lookahead (seconds) for the music loop. */
const LOOKAHEAD = 0.2;
const SCHEDULER_MS = 40;

export interface GameAudio extends AudioSystem {
  /** The live engine once unlocked (dev harness / tests). */
  engine(): Engine | null;
  /**
   * Optional per-frame hook for state-driven sounds (the charge whine). Not required:
   * the module also polls the last state it was given from its own scheduler.
   */
  update(state: Readonly<MatchState>): void;
  /** Mute/unmute everything (keeps the master volume setting). */
  setMuted(muted: boolean): void;
  destroy(): void;
}

export function createAudio(): GameAudio {
  let engine: Engine | null = null;
  let master = DEFAULT_MASTER;
  let muted = false;
  let intensity: 0 | 1 | 2 | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  /** The loop passes the same (mutated-in-place) state every tick; we only ever READ it. */
  let lastState: Readonly<MatchState> | null = null;

  const applyMaster = () => engine?.mixer.setMaster(muted ? 0 : master);

  function unlock() {
    if (engine) {
      if (engine.ctx instanceof AudioContext && engine.ctx.state !== 'running') void engine.ctx.resume();
      return;
    }
    const Ctx: typeof AudioContext | undefined =
      typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    engine = createEngine(ctx);
    applyMaster();
    if (intensity !== null) engine.setIntensity(intensity);
    if (ctx.state !== 'running') void ctx.resume();
    engine.music.start();
    const e = engine;
    timer = setInterval(() => {
      e.music.scheduleUntil(ctx.currentTime + LOOKAHEAD);
      if (lastState && ctx.state === 'running') e.update(lastState);
    }, SCHEDULER_MS);
    e.music.scheduleUntil(ctx.currentTime + LOOKAHEAD);
  }

  return {
    unlock,
    onEvents(events: readonly GameEvent[], state: Readonly<MatchState>) {
      lastState = state;
      if (!engine || engine.ctx.state !== 'running') return;
      engine.handleEvents(events, state);
    },
    setMasterVolume(v: number) {
      master = Math.max(0, Math.min(1, v));
      applyMaster();
    },
    setMusicIntensity(level: 0 | 1 | 2) {
      intensity = level;
      engine?.setIntensity(level);
    },
    update(state: Readonly<MatchState>) {
      lastState = state;
      if (engine && engine.ctx.state === 'running') engine.update(state);
    },
    setMuted(m: boolean) { muted = m; applyMaster(); },
    engine: () => engine,
    destroy() {
      if (timer) clearInterval(timer);
      if (engine && engine.ctx instanceof AudioContext) void engine.ctx.close();
      engine = null;
    },
  };
}
