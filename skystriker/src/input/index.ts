/**
 * INPUT MODULE — keyboard + mouse + gamepad for player 1.
 * Owned by the audio/UI session (see docs/ARCHITECTURE.md).
 *
 * Aim: whichever device the player used last wins.
 *  - Mouse: unit vector from the fighter (from the `state` given to sample()) to the cursor in
 *    WORLD coordinates (shared layout, same as the renderer). Only real mouse movement or a
 *    click switches aim to the mouse.
 *  - Gamepad: right stick; a centred stick means auto-aim (0,0 → the sim aims at the opponent).
 *    Any pad activity switches aim to the pad, so a cursor left on screen never steals it.
 * Before any input, aim is (0,0) (auto-aim).
 */
import type { InputFrame, InputSource, MatchState, PlayerId, Vec2 } from '../shared/types';
import {
  type PadEntry, type PadInfo, type PadStatus, choosePad, padActive, padInfo, padStatus as sharedPadStatus, readGamepads,
} from './gamepad';
import {
  type Action, type MenuAction, type PadInput, KEY_BINDINGS, MOUSE_BINDINGS,
  aimFromCursor, computeFit, frameFromActions, isMenuAction, readPad, screenToWorld,
} from './mapping';

export * from './mapping';
export * from './gamepad';

/** createKeyboardInput's return value: an InputSource plus menu-key hooks for the game loop. */
export interface KeyboardInput extends InputSource {
  /**
   * Called on Esc/P/pad-Start ('pause') and Enter ('rematch') presses, even while
   * the sim is paused. Returns an unsubscribe function.
   */
  onMenu(cb: (action: MenuAction) => void): () => void;
  /** Which device last produced input; the HUD can use it for button prompts. */
  lastDevice(): 'keyboard' | 'gamepad';
  /** The controller being read right now (null = none seen yet). */
  pad(): PadInfo | null;
}

export interface KeyboardInputOptions {
  /** Where to publish controller status (default: the shared store the HUD reads). */
  padStatus?: { set(s: PadStatus): void };
}

/** Mouse must move at least this far (CSS px) to take aim back from the gamepad. */
export const MOUSE_REAIM_PX = 3;

type InputTarget = Pick<Window, 'addEventListener' | 'removeEventListener' | 'innerWidth' | 'innerHeight'> &
  Partial<Pick<Window, 'navigator' | 'requestAnimationFrame' | 'cancelAnimationFrame'>>;

export function createKeyboardInput(target: Window = window, opts: KeyboardInputOptions = {}): KeyboardInput {
  const t = target as InputTarget;
  const status = opts.padStatus ?? sharedPadStatus;
  const held = new Set<Action>();
  const mouseHeld = new Set<Action>();
  /** Pressed since the last sample: a tap shorter than one frame still reaches the sim once. */
  const tapped = new Set<Action>();
  const menuListeners = new Set<(a: MenuAction) => void>();
  let cursor: Vec2 | null = null; // client (screen) px
  let aimSource: 'mouse' | 'pad' | 'none' = 'none';
  let lastAim: Vec2 | null = null;
  let device: 'keyboard' | 'gamepad' = 'keyboard';
  let padIndex: number | null = null;
  let pad: PadInput | null = null;
  let info: PadInfo | null = null;
  let padStartWasDown = false;
  let raf = 0;
  let alive = true;

  const emitMenu = (a: MenuAction) => menuListeners.forEach((cb) => cb(a));

  /** Read the controllers once: pick the active pad, publish status, handle Start + device switching. */
  function pollPads() {
    const { pads, support } = readGamepads(t.navigator);
    const i = choosePad(pads as ReadonlyArray<PadEntry | null>, padIndex);
    padIndex = i >= 0 ? i : null;
    const gp = i >= 0 ? (pads[i] as PadEntry) : null;
    pad = readPad(gp);
    info = padInfo(pads as ReadonlyArray<PadEntry | null>, i);
    status.set({ info, support });
    if (gp && padActive(gp)) { device = 'gamepad'; aimSource = 'pad'; }
    const startDown = !!pad?.held.has('pause');
    if (startDown && !padStartWasDown) emitMenu('pause');
    padStartWasDown = startDown;
  }

  // Poll every frame from the start (Chrome may never fire 'gamepadconnected' for a pad that
  // was plugged in before the page loaded), and keep polling while the sim is paused (Start).
  const loop = () => {
    if (!alive) return;
    pollPads();
    raf = t.requestAnimationFrame ? t.requestAnimationFrame(loop) : 0;
  };
  if (t.requestAnimationFrame) raf = t.requestAnimationFrame(loop);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts (Ctrl+R etc.) alone
    const a = KEY_BINDINGS[e.code];
    if (!a) return;
    e.preventDefault?.();
    device = 'keyboard';
    if (isMenuAction(a)) { if (!e.repeat) emitMenu(a); return; }
    held.add(a);
    tapped.add(a);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const a = KEY_BINDINGS[e.code];
    if (a) held.delete(a);
  };
  const onMouseDown = (e: MouseEvent) => {
    const a = MOUSE_BINDINGS[e.button];
    if (!a) return;
    mouseHeld.add(a);
    tapped.add(a);
    device = 'keyboard';
    if (e.clientX !== undefined) { cursor = { x: e.clientX, y: e.clientY }; aimSource = 'mouse'; }
  };
  const onMouseUp = (e: MouseEvent) => {
    const a = MOUSE_BINDINGS[e.button];
    if (a) mouseHeld.delete(a);
  };
  const onMouseMove = (e: MouseEvent) => {
    const moved = !cursor || Math.hypot(e.clientX - cursor.x, e.clientY - cursor.y) >= MOUSE_REAIM_PX;
    if (!cursor || moved) cursor = { x: e.clientX, y: e.clientY };
    if (moved) { aimSource = 'mouse'; device = 'keyboard'; }
    // Resync from the button bitmask in case a mouseup happened outside the window.
    if (typeof e.buttons === 'number') {
      if (!(e.buttons & 1)) mouseHeld.delete('kick');
      if (!(e.buttons & 2)) mouseHeld.delete('trap');
    }
  };
  const onContextMenu = (e: Event) => e.preventDefault();
  const onBlur = () => { held.clear(); mouseHeld.clear(); tapped.clear(); };
  const onPadEvent = () => pollPads();

  t.addEventListener('keydown', onKeyDown as EventListener);
  t.addEventListener('keyup', onKeyUp as EventListener);
  t.addEventListener('mousedown', onMouseDown as EventListener);
  t.addEventListener('mouseup', onMouseUp as EventListener);
  t.addEventListener('mousemove', onMouseMove as EventListener);
  t.addEventListener('contextmenu', onContextMenu);
  t.addEventListener('blur', onBlur);
  t.addEventListener('gamepadconnected', onPadEvent);
  t.addEventListener('gamepaddisconnected', onPadEvent);

  return {
    sample(state: Readonly<MatchState>, self: PlayerId): InputFrame {
      pollPads();
      let aim: Vec2 | null = null;
      if (aimSource === 'pad') {
        aim = pad?.aim ?? null; // centred right stick → auto-aim at the opponent
      } else if (aimSource === 'mouse' && cursor) {
        const fit = computeFit(t.innerWidth, t.innerHeight);
        const world = screenToWorld(cursor.x, cursor.y, fit);
        aim = aimFromCursor(state.fighters[self].pos, world) ?? lastAim;
      }
      lastAim = aim;

      const all = mouseHeld.size || tapped.size ? new Set<Action>([...held, ...mouseHeld, ...tapped]) : held;
      tapped.clear();
      return frameFromActions(all, aim, pad);
    },
    onMenu(cb) {
      menuListeners.add(cb);
      return () => menuListeners.delete(cb);
    },
    lastDevice: () => device,
    pad: () => info,
    destroy() {
      alive = false;
      t.removeEventListener('keydown', onKeyDown as EventListener);
      t.removeEventListener('keyup', onKeyUp as EventListener);
      t.removeEventListener('mousedown', onMouseDown as EventListener);
      t.removeEventListener('mouseup', onMouseUp as EventListener);
      t.removeEventListener('mousemove', onMouseMove as EventListener);
      t.removeEventListener('contextmenu', onContextMenu);
      t.removeEventListener('blur', onBlur);
      t.removeEventListener('gamepadconnected', onPadEvent);
      t.removeEventListener('gamepaddisconnected', onPadEvent);
      if (raf && t.cancelAnimationFrame) t.cancelAnimationFrame(raf);
      menuListeners.clear();
    },
  };
}
