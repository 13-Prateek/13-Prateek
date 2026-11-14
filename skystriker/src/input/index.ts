/**
 * INPUT MODULE — keyboard + mouse (+ standard gamepad) for player 1.
 * Owned by the audio/UI session (see docs/ARCHITECTURE.md).
 *
 * Aim = unit vector from the fighter (taken from the `state` given to sample())
 * to the cursor in WORLD coordinates, using the same letterbox fit as the renderer.
 * Before the mouse has ever moved, aim is (0,0) so the sim auto-aims at the opponent.
 */
import type { InputFrame, InputSource, MatchState, PlayerId, Vec2 } from '../shared/types';
import {
  type Action, type MenuAction, type PadInput, KEY_BINDINGS, MOUSE_BINDINGS,
  aimFromCursor, computeFit, frameFromActions, isMenuAction, readPad, screenToWorld,
} from './mapping';

export * from './mapping';

/** createKeyboardInput's return value: an InputSource plus menu-key hooks for the game loop. */
export interface KeyboardInput extends InputSource {
  /**
   * Called on Esc/P/pad-Start ('pause') and Enter ('rematch') presses, even while
   * the sim is paused. Returns an unsubscribe function.
   */
  onMenu(cb: (action: MenuAction) => void): () => void;
  /** Which device last produced input; the HUD can use it for button prompts. */
  lastDevice(): 'keyboard' | 'gamepad';
}

type InputTarget = Pick<Window, 'addEventListener' | 'removeEventListener' | 'innerWidth' | 'innerHeight'> &
  Partial<Pick<Window, 'navigator' | 'requestAnimationFrame' | 'cancelAnimationFrame'>>;

export function createKeyboardInput(target: Window = window): KeyboardInput {
  const t = target as InputTarget;
  const held = new Set<Action>();
  const mouseHeld = new Set<Action>();
  /** Pressed since the last sample: a tap shorter than one frame still reaches the sim once. */
  const tapped = new Set<Action>();
  const menuListeners = new Set<(a: MenuAction) => void>();
  let cursor: Vec2 | null = null; // client (screen) px
  let aimSource: 'mouse' | 'pad' = 'mouse';
  let lastAim: Vec2 | null = null;
  let device: 'keyboard' | 'gamepad' = 'keyboard';
  let padStartWasDown = false;
  let raf = 0;

  const emitMenu = (a: MenuAction) => menuListeners.forEach((cb) => cb(a));

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
    cursor = { x: e.clientX, y: e.clientY };
    aimSource = 'mouse';
    device = 'keyboard';
    // Resync from the button bitmask in case a mouseup happened outside the window.
    if (typeof e.buttons === 'number') {
      if (!(e.buttons & 1)) mouseHeld.delete('kick');
      if (!(e.buttons & 2)) mouseHeld.delete('trap');
    }
  };
  const onContextMenu = (e: Event) => e.preventDefault();
  const onBlur = () => { held.clear(); mouseHeld.clear(); tapped.clear(); };

  const getPad = (): PadInput | null => {
    const nav = t.navigator;
    if (!nav || typeof nav.getGamepads !== 'function') return null;
    for (const gp of nav.getGamepads()) {
      if (gp && gp.connected !== false) return readPad(gp);
    }
    return null;
  };

  // Poll the pad's Start button for pause even while the sim (and so sample()) is paused.
  const pollMenu = () => {
    const pad = getPad();
    const down = !!pad?.held.has('pause');
    if (down && !padStartWasDown) { device = 'gamepad'; emitMenu('pause'); }
    padStartWasDown = down;
    raf = t.requestAnimationFrame ? t.requestAnimationFrame(pollMenu) : 0;
  };
  const onPadConnected = () => { if (!raf && t.requestAnimationFrame) raf = t.requestAnimationFrame(pollMenu); };

  t.addEventListener('keydown', onKeyDown as EventListener);
  t.addEventListener('keyup', onKeyUp as EventListener);
  t.addEventListener('mousedown', onMouseDown as EventListener);
  t.addEventListener('mouseup', onMouseUp as EventListener);
  t.addEventListener('mousemove', onMouseMove as EventListener);
  t.addEventListener('contextmenu', onContextMenu);
  t.addEventListener('blur', onBlur);
  t.addEventListener('gamepadconnected', onPadConnected);

  return {
    sample(state: Readonly<MatchState>, self: PlayerId): InputFrame {
      const pad = getPad();
      if (pad && (pad.aim || pad.moveX || pad.moveY || pad.held.size)) device = 'gamepad';
      if (pad?.aim) aimSource = 'pad';

      let aim: Vec2 | null = null;
      if (aimSource === 'pad') {
        aim = pad?.aim ?? null; // centred stick → auto-aim at opponent
      } else if (cursor) {
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
    destroy() {
      t.removeEventListener('keydown', onKeyDown as EventListener);
      t.removeEventListener('keyup', onKeyUp as EventListener);
      t.removeEventListener('mousedown', onMouseDown as EventListener);
      t.removeEventListener('mouseup', onMouseUp as EventListener);
      t.removeEventListener('mousemove', onMouseMove as EventListener);
      t.removeEventListener('contextmenu', onContextMenu);
      t.removeEventListener('blur', onBlur);
      t.removeEventListener('gamepadconnected', onPadConnected);
      if (raf && t.cancelAnimationFrame) t.cancelAnimationFrame(raf);
      menuListeners.clear();
    },
  };
}
