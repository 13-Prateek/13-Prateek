import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../../src/shared/constants';
import type { MatchState } from '../../src/shared/types';
import {
  aimFromCursor, computeFit, createKeyboardInput, deadzone, frameFromActions, normaliseMove,
  readPad, screenToWorld, type Action, type MenuAction,
} from '../../src/input';

/** Minimal fake window: an EventTarget with a viewport size. */
function fakeWindow(w = 1600, h = 900, pads: unknown[] = []) {
  const et = new EventTarget();
  return Object.assign(et, {
    innerWidth: w,
    innerHeight: h,
    navigator: { getGamepads: () => pads },
  }) as unknown as Window & { innerWidth: number; innerHeight: number };
}
const key = (type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });
const mouse = (type: string, x: number, y: number, button = 0, buttons?: number) =>
  Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, button, buttons });

/** Only fighters[self].pos is read by the input module. */
const stateWithP1At = (x: number, y: number) =>
  ({ fighters: [{ pos: { x, y } }, { pos: { x: 1200, y: 450 } }] }) as unknown as MatchState;

describe('letterbox fit + screen→world', () => {
  it('matches the world exactly at 1600×900', () => {
    const f = computeFit(1600, 900);
    expect(f).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(screenToWorld(800, 450, f)).toEqual({ x: 800, y: 450 });
  });

  it('pillarboxes a 4:3 window (bars top/bottom)', () => {
    const f = computeFit(1200, 900); // width-limited: scale 0.75, world height 675, offsetY 112.5
    expect(f.scale).toBeCloseTo(0.75);
    expect(f.offsetX).toBeCloseTo(0);
    expect(f.offsetY).toBeCloseTo(112.5);
    const w = screenToWorld(600, 112.5 + 675 / 2, f);
    expect(w.x).toBeCloseTo(WORLD_W / 2);
    expect(w.y).toBeCloseTo(WORLD_H / 2);
    // Top-left corner of the world on screen.
    const tl = screenToWorld(0, 112.5, f);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);
  });

  it('letterboxes an ultrawide window (bars left/right)', () => {
    const f = computeFit(2560, 720); // height-limited: scale 0.8, world width 1280, offsetX 640
    expect(f.scale).toBeCloseTo(0.8);
    expect(f.offsetX).toBeCloseTo(640);
    const br = screenToWorld(640 + 1280, 720, f);
    expect(br.x).toBeCloseTo(WORLD_W);
    expect(br.y).toBeCloseTo(WORLD_H);
  });
});

describe('aim + movement maths', () => {
  it('aims as a unit vector from fighter to cursor', () => {
    const a = aimFromCursor({ x: 100, y: 100 }, { x: 400, y: 500 })!;
    expect(a.x).toBeCloseTo(0.6);
    expect(a.y).toBeCloseTo(0.8);
  });
  it('returns null when the cursor is on the fighter', () => {
    expect(aimFromCursor({ x: 100, y: 100 }, { x: 103, y: 102 })).toBeNull();
  });
  it('normalises diagonals but keeps partial analog tilt', () => {
    const d = normaliseMove(1, -1);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(normaliseMove(0.3, 0)).toEqual({ x: 0.3, y: 0 });
  });
  it('frameFromActions maps every action', () => {
    const all = new Set<Action>(['up', 'right', 'kick', 'trap', 'dash', 'infuse', 'phaseDash', 'super']);
    const f = frameFromActions(all, { x: 0, y: 1 });
    expect(f.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(f.moveY).toBeCloseTo(-Math.SQRT1_2);
    expect(f).toMatchObject({ aimX: 0, aimY: 1, kick: true, trap: true, dash: true, infuse: true, phaseDash: true, super: true });
    expect(f.guard).toBe(false); // reserved since the pressure pass
  });
  it('opposite keys cancel out', () => {
    const f = frameFromActions(new Set<Action>(['left', 'right', 'up']), null);
    expect(f.moveX).toBe(0);
    expect(f.moveY).toBe(-1);
    expect(f.aimX).toBe(0);
    expect(f.aimY).toBe(0);
  });
});

describe('createKeyboardInput (GDD §10 map)', () => {
  it('WASD flies, diagonals are normalised', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    w.dispatchEvent(key('keydown', 'KeyW'));
    w.dispatchEvent(key('keydown', 'KeyD'));
    const f = inp.sample(stateWithP1At(400, 450), 0);
    expect(f.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(f.moveY).toBeCloseTo(-Math.SQRT1_2);
    w.dispatchEvent(key('keyup', 'KeyW'));
    expect(inp.sample(stateWithP1At(400, 450), 0).moveY).toBe(0);
    inp.destroy();
  });

  it('maps J/K/Space/Shift/E/Q/R (Q = Phase Dash, guard always false)', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    const s = stateWithP1At(400, 450);
    const check = (code: string, field: 'kick' | 'trap' | 'dash' | 'infuse' | 'phaseDash' | 'super') => {
      w.dispatchEvent(key('keydown', code));
      const f = inp.sample(s, 0);
      expect(f[field]).toBe(true);
      expect(f.guard).toBe(false);
      w.dispatchEvent(key('keyup', code));
      expect(inp.sample(s, 0)[field]).toBe(false);
    };
    check('KeyJ', 'kick');
    check('KeyK', 'trap');
    check('Space', 'dash');
    check('ShiftLeft', 'dash');
    check('KeyE', 'infuse');
    check('KeyQ', 'phaseDash');
    check('KeyR', 'super');
    inp.destroy();
  });

  it('a tap that starts and ends between two samples still registers exactly once', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    const s = stateWithP1At(400, 450);
    w.dispatchEvent(key('keydown', 'KeyJ'));
    w.dispatchEvent(key('keyup', 'KeyJ'));
    w.dispatchEvent(mouse('mousedown', 900, 450, 2));
    w.dispatchEvent(mouse('mouseup', 900, 450, 2));
    const f = inp.sample(s, 0);
    expect(f.kick).toBe(true);
    expect(f.trap).toBe(true);
    const g = inp.sample(s, 0);
    expect(g.kick).toBe(false);
    expect(g.trap).toBe(false);
    inp.destroy();
  });

  it('left click kicks, right click traps, and the context menu is suppressed', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    const s = stateWithP1At(400, 450);
    w.dispatchEvent(mouse('mousedown', 900, 450, 0));
    w.dispatchEvent(mouse('mousedown', 900, 450, 2));
    let f = inp.sample(s, 0);
    expect(f.kick).toBe(true);
    expect(f.trap).toBe(true);
    w.dispatchEvent(mouse('mouseup', 900, 450, 0));
    f = inp.sample(s, 0);
    expect(f.kick).toBe(false);
    expect(f.trap).toBe(true);
    const ctx = new Event('contextmenu', { cancelable: true });
    w.dispatchEvent(ctx);
    expect(ctx.defaultPrevented).toBe(true);
    inp.destroy();
  });

  it('aims from P1 to the cursor in world space through the letterbox', () => {
    // 1200×900 window → scale 0.75, 112.5 px bars top and bottom.
    const w = fakeWindow(1200, 900);
    const inp = createKeyboardInput(w);
    // No mouse yet → aim 0,0 so the sim auto-aims at the opponent.
    expect(inp.sample(stateWithP1At(400, 450), 0)).toMatchObject({ aimX: 0, aimY: 0 });
    // Cursor at world (800, 450) = screen (600, 450).
    w.dispatchEvent(mouse('mousemove', 600, 450));
    let f = inp.sample(stateWithP1At(400, 450), 0);
    expect(f.aimX).toBeCloseTo(1);
    expect(f.aimY).toBeCloseTo(0);
    // Cursor at world (400, 50) = screen (300, 112.5 + 37.5) → straight up from P1.
    w.dispatchEvent(mouse('mousemove', 300, 150));
    f = inp.sample(stateWithP1At(400, 450), 0);
    expect(f.aimX).toBeCloseTo(0);
    expect(f.aimY).toBeCloseTo(-1);
    // Aim follows the fighter as it moves (direction recomputed from the new position).
    f = inp.sample(stateWithP1At(400, 850), 0);
    expect(f.aimY).toBeCloseTo(-1);
    inp.destroy();
  });

  it('keeps the previous aim when the cursor sits on the fighter', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    w.dispatchEvent(mouse('mousemove', 600, 450));
    expect(inp.sample(stateWithP1At(400, 450), 0).aimX).toBeCloseTo(1);
    w.dispatchEvent(mouse('mousemove', 401, 451));
    expect(inp.sample(stateWithP1At(400, 450), 0).aimX).toBeCloseTo(1);
    inp.destroy();
  });

  it('reports pause/rematch as menu actions (not gameplay), ignoring key repeat', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    const got: MenuAction[] = [];
    inp.onMenu((a) => got.push(a));
    w.dispatchEvent(key('keydown', 'Escape'));
    w.dispatchEvent(key('keydown', 'Escape', { repeat: true }));
    w.dispatchEvent(key('keydown', 'KeyP'));
    w.dispatchEvent(key('keydown', 'Enter'));
    expect(got).toEqual(['pause', 'pause', 'rematch']);
    inp.destroy();
  });

  it('ignores Ctrl+R (browser reload) and clears held keys on blur', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    const s = stateWithP1At(400, 450);
    w.dispatchEvent(key('keydown', 'KeyR', { ctrlKey: true }));
    expect(inp.sample(s, 0).super).toBe(false);
    w.dispatchEvent(key('keydown', 'KeyJ'));
    w.dispatchEvent(new Event('blur'));
    expect(inp.sample(s, 0).kick).toBe(false);
    inp.destroy();
  });

  it('destroy removes listeners', () => {
    const w = fakeWindow();
    const inp = createKeyboardInput(w);
    inp.destroy();
    w.dispatchEvent(key('keydown', 'KeyJ'));
    expect(inp.sample(stateWithP1At(400, 450), 0).kick).toBe(false);
  });
});

describe('gamepad (standard mapping)', () => {
  const pad = (axes: number[], pressed: number[] = [], triggers: Record<number, number> = {}) => ({
    mapping: 'standard',
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: triggers[i] ?? (pressed.includes(i) ? 1 : 0) })),
  });

  it('applies a radial deadzone', () => {
    expect(deadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const d = deadzone(1, 0);
    expect(d.x).toBeCloseTo(1);
  });

  it('maps sticks, triggers and face buttons', () => {
    const p = readPad(pad([0, -1, 0.9, 0], [0, 2], { 7: 0.8 }))!;
    expect(p.moveY).toBeCloseTo(-1);
    expect(p.aim).toEqual({ x: 1, y: 0 });
    expect([...p.held].sort()).toEqual(['dash', 'infuse', 'kick']);
    const b = readPad(pad([0, 0, 0, 0], [1, 3]))!;
    expect([...b.held].sort()).toEqual(['phaseDash', 'super']);
    const f = frameFromActions(new Set(), null, b);
    expect(f.phaseDash).toBe(true);
    expect(f.guard).toBe(false);
  });

  it('right stick overrides mouse aim; centred stick falls back to auto-aim', () => {
    const gp = pad([0, 0, 0, 1]);
    const w = fakeWindow(1600, 900, [gp]);
    const inp = createKeyboardInput(w);
    w.dispatchEvent(mouse('mousemove', 1000, 450));
    const f = inp.sample(stateWithP1At(400, 450), 0);
    expect(f.aimY).toBeCloseTo(1);
    expect(inp.lastDevice()).toBe('gamepad');
    gp.axes[3] = 0;
    expect(inp.sample(stateWithP1At(400, 450), 0)).toMatchObject({ aimX: 0, aimY: 0 });
    inp.destroy();
  });

  it('keyboard movement wins over the stick', () => {
    const f = frameFromActions(new Set<Action>(['left']), null, readPad(pad([0, 1, 0, 0])));
    expect(f.moveX).toBe(-1);
    expect(f.moveY).toBe(0);
  });
});
