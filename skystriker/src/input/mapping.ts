/**
 * Pure input mapping helpers (no DOM). Unit-tested in tests/input/.
 * GDD §10: WASD fly · mouse aim · LMB/J kick · RMB/K trap · Space/Shift dash ·
 * E infuse · Q phase dash · R super · Esc/P pause. (`guard` is reserved: always false.)
 */
import { WORLD_H, WORLD_W } from '../shared/constants';
import type { InputFrame, Vec2 } from '../shared/types';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'kick' | 'trap' | 'dash' | 'infuse' | 'phaseDash' | 'super'
  | 'pause' | 'rematch';

/** Menu actions are not part of InputFrame; they are reported through onMenu(). */
export type MenuAction = 'pause' | 'rematch';

/** KeyboardEvent.code → action. Using `code` keeps WASD in place on AZERTY etc. */
export const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyJ: 'kick', KeyK: 'trap',
  Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyE: 'infuse', KeyQ: 'phaseDash', KeyR: 'super',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'rematch', NumpadEnter: 'rematch',
};

/** MouseEvent.button → action. 0 = left, 2 = right. */
export const MOUSE_BINDINGS: Readonly<Record<number, Action>> = { 0: 'kick', 2: 'trap' };

export const isMenuAction = (a: Action): a is MenuAction => a === 'pause' || a === 'rematch';

/** Letterbox fit — identical maths to the renderer's `fit()` (src/render/index.ts). */
export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeFit(viewW: number, viewH: number, worldW = WORLD_W, worldH = WORLD_H): Fit {
  const scale = Math.max(1e-6, Math.min(viewW / worldW, viewH / worldH));
  return { scale, offsetX: (viewW - worldW * scale) / 2, offsetY: (viewH - worldH * scale) / 2 };
}

export function screenToWorld(sx: number, sy: number, fit: Fit): Vec2 {
  return { x: (sx - fit.offsetX) / fit.scale, y: (sy - fit.offsetY) / fit.scale };
}

/** Cursor closer than this to the fighter (world units) keeps the previous aim, so it doesn't jitter. */
export const AIM_DEADZONE = 8;

/** Unit vector from `from` toward `cursor`, or null when the cursor sits on the fighter. */
export function aimFromCursor(from: Vec2, cursor: Vec2, deadzone = AIM_DEADZONE): Vec2 | null {
  const dx = cursor.x - from.x, dy = cursor.y - from.y;
  const l = Math.hypot(dx, dy);
  return l > deadzone ? { x: dx / l, y: dy / l } : null;
}

/** Clamp a move vector to length 1 (diagonals aren't faster; analog sticks keep partial tilt). */
export function normaliseMove(x: number, y: number): Vec2 {
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

/** Optional analog/gamepad contribution, already dead-zoned. */
export interface PadInput {
  moveX: number;
  moveY: number;
  /** Right-stick aim (unit) or null when the stick is centred. */
  aim: Vec2 | null;
  held: ReadonlySet<Action>;
}

/**
 * Build the sim InputFrame from held actions + aim.
 * Keyboard movement wins over the stick when any WASD key is held.
 */
export function frameFromActions(held: ReadonlySet<Action>, aim: Vec2 | null, pad?: PadInput | null): InputFrame {
  const has = (a: Action) => held.has(a) || (pad ? pad.held.has(a) : false);
  let mx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  let my = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
  if (mx === 0 && my === 0 && pad) { mx = pad.moveX; my = pad.moveY; }
  const m = normaliseMove(mx, my);
  return {
    moveX: m.x,
    moveY: m.y,
    aimX: aim ? aim.x : 0,
    aimY: aim ? aim.y : 0,
    kick: has('kick'),
    trap: has('trap'),
    dash: has('dash'),
    infuse: has('infuse'),
    super: has('super'),
    guard: false, // reserved since the pressure pass
    phaseDash: has('phaseDash'),
  };
}

/* ------------------------------ Gamepad ------------------------------ */

export const STICK_DEADZONE = 0.22;
export const AIM_STICK_THRESHOLD = 0.45;
export const TRIGGER_THRESHOLD = 0.35;

/** W3C "standard" mapping button indices → action. */
export const PAD_BUTTONS: ReadonlyArray<[number, Action]> = [
  [7, 'kick'], // RT
  [6, 'trap'], // LT
  [5, 'kick'], // RB (alt)
  [0, 'dash'], // A
  [2, 'infuse'], // X
  [1, 'phaseDash'], // B
  [3, 'super'], // Y
  [9, 'pause'], // Start
];

/** Radial deadzone with rescale so small tilts start from 0. */
export function deadzone(x: number, y: number, dz = STICK_DEADZONE): Vec2 {
  const l = Math.hypot(x, y);
  if (l <= dz) return { x: 0, y: 0 };
  const k = Math.min(1, (l - dz) / (1 - dz)) / l;
  return { x: x * k, y: y * k };
}

/** Minimal structural Gamepad shape so tests can pass plain objects. */
export interface PadLike {
  mapping?: string;
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

export function readPad(gp: PadLike | null | undefined): PadInput | null {
  if (!gp) return null;
  const held = new Set<Action>();
  for (const [i, a] of PAD_BUTTONS) {
    const b = gp.buttons[i];
    if (b && (b.pressed || b.value > TRIGGER_THRESHOLD)) held.add(a);
  }
  // D-pad also flies.
  const btn = (i: number) => !!gp.buttons[i]?.pressed;
  const dpadX = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
  const dpadY = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  const ls = deadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
  const rx = gp.axes[2] ?? 0, ry = gp.axes[3] ?? 0;
  const rl = Math.hypot(rx, ry);
  return {
    moveX: dpadX || ls.x,
    moveY: dpadY || ls.y,
    aim: rl > AIM_STICK_THRESHOLD ? { x: rx / rl, y: ry / rl } : null,
    held,
  };
}
