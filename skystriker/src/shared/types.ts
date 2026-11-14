/**
 * SHARED CONTRACTS — every module builds against these types.
 *
 * Ownership: the lead/integration session. Module sessions must NOT change
 * existing fields. If you need something new, ADD an optional field and note it
 * in your PR / handoff summary under "Contract changes".
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerId = 0 | 1;

export type Element = 'fire' | 'frost' | 'volt' | 'stone';

export type HeroId = 'kael' | 'yuki' | 'zap' | 'brakka';

/* ------------------------------------------------------------------ */
/* Input: what a controller (keyboard, gamepad, AI) produces each tick */
/* ------------------------------------------------------------------ */

/**
 * Held-state snapshot for one sim tick. The sim does its own edge detection
 * (pressed / released) by comparing with the previous tick's frame.
 */
export interface InputFrame {
  /** Movement intent, each in -1..1 (not required to be normalised). */
  moveX: number;
  moveY: number;
  /**
   * Aim direction (unit vector). If both are 0 the sim aims at the opponent.
   * Keyboard/mouse input converts the mouse position into a direction.
   */
  aimX: number;
  aimY: number;
  /** Kick button held. Tap = snap kick, hold = charge power kick, release fires. */
  kick: boolean;
  /** Trap / dribble held. */
  trap: boolean;
  /** Dash button held (sim triggers on press edge). */
  dash: boolean;
  /** Spend 1 aura bar: element-infuse next kick (press edge). */
  infuse: boolean;
  /** Spend 3 aura bars: super shot (press edge). Wave 2 feature. */
  super: boolean;
  /** Spend 2 aura bars: defensive super (press edge). Wave 2 feature. */
  guard: boolean;
}

export const EMPTY_INPUT: Readonly<InputFrame> = Object.freeze({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  kick: false,
  trap: false,
  dash: false,
  infuse: false,
  super: false,
  guard: false,
});

/* ------------------------------------------------------------------ */
/* Simulation state                                                    */
/* ------------------------------------------------------------------ */

export type KickPhase = 'idle' | 'charging' | 'active' | 'recovery';

export interface FighterState {
  id: PlayerId;
  heroId: HeroId;
  element: Element;
  pos: Vec2;
  vel: Vec2;
  /** Unit vector the fighter faces / aims (used for kick foot placement + rendering). */
  facing: Vec2;
  hp: number;
  /** 0..AURA_MAX (3 bars of AURA_PER_BAR). */
  aura: number;
  kickPhase: KickPhase;
  /** Ticks remaining in the current kick phase (or ticks held while charging). */
  kickTimer: number;
  /** 0..1 power-kick charge. */
  charge: number;
  /** Ticks until dash is available again. */
  dashCooldown: number;
  /** Ticks remaining in the current dash burst (>0 means dashing). */
  dashTimer: number;
  /** Ticks of invulnerability left (dash start frames, respawn, etc.). */
  invulnTimer: number;
  /** Ticks of hitstun left (cannot act). */
  hitstun: number;
  /** True while holding the ball at the feet. */
  trapping: boolean;
  /** Next kick is element-infused. */
  infused: boolean;
  /** Current combo count being suffered (for damage scaling + UI). */
  comboAgainst: number;
  /** (sim-internal, added by sim) Trap is locked until the trap button is released (after a forced pop). */
  trapLock?: boolean;
  /** (sim-internal, added by sim) Close-call tracker for the current enemy ball pass: 0 idle, 1 in zone, 2 spent. */
  closeCall?: 0 | 1 | 2;
}

export type BallMode = 'neutral' | 'live' | 'super';

export interface BallState {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  /** Angular spin; curve shots bend the trajectory (+ = clockwise). */
  spin: number;
  mode: BallMode;
  /** Who last kicked it; a live ball only hurts the OTHER player. */
  owner: PlayerId | null;
  /** Element carried by the ball, if infused / super. */
  element: Element | null;
  /** Wall bounces since the last kick (bank-shot bonus). */
  bounces: number;
  /** Player trapping the ball, if any. */
  heldBy: PlayerId | null;
  /** Ticks the ball has been held (auto pop-loose at TRAP_MAX_TICKS). */
  heldTicks: number;
}

export type MatchPhase = 'countdown' | 'playing' | 'roundOver' | 'matchOver';

export interface MatchConfig {
  heroes: [HeroId, HeroId];
  roundsToWin: number;
  /** Seed for any randomness inside the sim (keeps it deterministic). */
  seed: number;
}

export interface MatchState {
  config: MatchConfig;
  /** Sim tick counter since match start. */
  tick: number;
  phase: MatchPhase;
  /** Ticks left in the current phase (countdown / round timer / round-over pause). */
  phaseTimer: number;
  round: number;
  wins: [number, number];
  fighters: [FighterState, FighterState];
  ball: BallState;
  /** Global freeze frames for impact (sim does not advance physics while > 0). */
  hitstop: number;
  /** Sudden death active (ball speeds up, walls close in). */
  suddenDeath: boolean;
  /** Arena bounds (may shrink in sudden death). */
  arena: { left: number; top: number; right: number; bottom: number };
  /** Internal RNG state. */
  rng: number;
  /** Previous tick inputs (for edge detection). */
  prevInput: [InputFrame, InputFrame];
}

/* ------------------------------------------------------------------ */
/* Events: the sim's ONLY output channel to render / audio / UI        */
/* ------------------------------------------------------------------ */

export type GameEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'fight' }
  | { type: 'move'; player: PlayerId } // reserved, optional
  | { type: 'dash'; player: PlayerId; pos: Vec2; dir: Vec2; /** Added by sim: true for a wall kick-off. */ wallKick?: boolean }
  | { type: 'kickStart'; player: PlayerId; charge: number }
  | { type: 'chargeFull'; player: PlayerId }
  | {
      type: 'kick';
      player: PlayerId;
      pos: Vec2;
      dir: Vec2;
      /** Resulting ball speed. */
      speed: number;
      /** 0..1 */
      power: number;
      perfect: boolean;
      curve: boolean;
      element: Element | null;
    }
  | { type: 'trap'; player: PlayerId; pos: Vec2 }
  | { type: 'trapRelease'; player: PlayerId; forced: boolean }
  | { type: 'bounce'; pos: Vec2; normal: Vec2; speed: number }
  | { type: 'ballNeutral'; pos: Vec2 }
  | {
      type: 'hit';
      target: PlayerId;
      attacker: PlayerId;
      pos: Vec2;
      damage: number;
      speed: number;
      bank: number;
      combo: number;
      element: Element | null;
    }
  | { type: 'wallSplat'; target: PlayerId; pos: Vec2; normal: Vec2; damage: number }
  | { type: 'clash'; pos: Vec2; winner: PlayerId | null }
  | { type: 'closeCall'; player: PlayerId; pos: Vec2 }
  | { type: 'auraBar'; player: PlayerId; bars: number }
  | { type: 'infuse'; player: PlayerId; element: Element }
  | { type: 'superStart'; player: PlayerId; element: Element; name: string }
  | { type: 'callout'; text: string; player: PlayerId | null; tier: 1 | 2 | 3 }
  | { type: 'ko'; loser: PlayerId; pos: Vec2 }
  | { type: 'roundEnd'; winner: PlayerId | null }
  | { type: 'matchEnd'; winner: PlayerId }
  | { type: 'suddenDeath' }
  /** Added by sim: a body softly bumped the ball (no damage). Emitted only above BUMP_EVENT_MIN_SPEED. */
  | { type: 'bump'; player: PlayerId; pos: Vec2; speed: number };

export type GameEventType = GameEvent['type'];

/* ------------------------------------------------------------------ */
/* Module interfaces                                                   */
/* ------------------------------------------------------------------ */

/** src/sim — pure, deterministic, no DOM, no Math.random, no Date. */
export interface SimApi {
  createMatch(config: MatchConfig): MatchState;
  /** Advance exactly one fixed tick (1 / SIM_HZ s). Mutates state, returns events. */
  stepMatch(state: MatchState, inputs: [InputFrame, InputFrame]): GameEvent[];
}

/** src/ai — reads state, produces input. Must only use public state. */
export type AIDifficulty = 'rookie' | 'pro' | 'legend';
export type AIPersonality = 'brawler' | 'wall' | 'trickster' | 'rival';

export interface AIController {
  think(state: Readonly<MatchState>, self: PlayerId): InputFrame;
  reset(): void;
}

/** src/render — draws state; never mutates it. */
export interface Renderer {
  /** alpha = interpolation factor between prev and curr sim states (0..1). */
  render(prev: Readonly<MatchState>, curr: Readonly<MatchState>, alpha: number, dtSeconds: number): void;
  onEvents(events: readonly GameEvent[], state: Readonly<MatchState>): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

/** src/audio — reacts to events. Must call unlock() from a user gesture. */
export interface AudioSystem {
  unlock(): void;
  onEvents(events: readonly GameEvent[], state: Readonly<MatchState>): void;
  setMasterVolume(v: number): void;
  setMusicIntensity(level: 0 | 1 | 2): void;
}

/** src/ui — DOM overlay: HUD, callouts, menus. */
export interface HudSystem {
  update(state: Readonly<MatchState>): void;
  onEvents(events: readonly GameEvent[], state: Readonly<MatchState>): void;
}

/** src/input — local human controllers. */
export interface InputSource {
  /** Called once per sim tick. `self` lets mouse aim be converted to a direction. */
  sample(state: Readonly<MatchState>, self: PlayerId): InputFrame;
  destroy(): void;
}
