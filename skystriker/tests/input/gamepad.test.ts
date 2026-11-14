import { describe, expect, it } from 'vitest';
import type { MatchState } from '../../src/shared/types';
import {
  type PadEntry, type PadStatus, choosePad, createKeyboardInput, createPadStatus, padInfo, padName, readGamepads, type MenuAction,
} from '../../src/input';
import { NON_STANDARD_WARNING, padStatusLine, padToast } from '../../src/ui/controls';

/** A fake Gamepad. Buttons/axes are mutable so a test can "press" things between samples. */
function fakePad(o: { id?: string; index?: number; mapping?: string; timestamp?: number; axes?: number[]; pressed?: number[] } = {}) {
  return {
    id: o.id ?? 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    index: o.index ?? 0,
    mapping: o.mapping ?? 'standard',
    connected: true,
    timestamp: o.timestamp ?? 1000,
    axes: o.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (o.pressed ?? []).includes(i), value: (o.pressed ?? []).includes(i) ? 1 : 0 })),
  };
}
const press = (gp: ReturnType<typeof fakePad>, i: number, on = true) => { gp.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };

function fakeWindow(pads: Array<ReturnType<typeof fakePad> | null>) {
  return Object.assign(new EventTarget(), {
    innerWidth: 1600, innerHeight: 996, // 1600 × (900 + HUD band): world maps 1:1 below the band
    navigator: { getGamepads: () => pads },
  }) as unknown as Window;
}
const mouse = (type: string, x: number, y: number) =>
  Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, button: 0, buttons: 0 });
const state = (x: number, y: number) =>
  ({ fighters: [{ pos: { x, y } }, { pos: { x: 1200, y: 450 } }] }) as unknown as MatchState;
const quiet = () => ({ set() {} });

describe('stale mouse + gamepad play', () => {
  it('a cursor left on screen (from the focus click) never steals pad aim', () => {
    const gp = fakePad();
    const w = fakeWindow([gp]);
    const inp = createKeyboardInput(w, { padStatus: quiet() });
    // The owner clicked the page to focus it: the cursor is now parked on the left.
    w.dispatchEvent(mouse('mousemove', 100, 500));
    expect(inp.sample(state(400, 450), 0).aimX).toBeLessThan(0); // mouse aim, before any pad use
    // Now they play on the pad: dash with A, right stick centred.
    press(gp, 0);
    const f = inp.sample(state(400, 450), 0);
    expect(f.dash).toBe(true);
    expect(f.aimX).toBe(0); // centred stick = auto-aim at the opponent, NOT at the parked cursor
    expect(f.aimY).toBe(0);
    expect(inp.lastDevice()).toBe('gamepad');
    press(gp, 0, false);
    // Kick with RT later, stick still centred: still auto-aim.
    press(gp, 7);
    const k = inp.sample(state(400, 450), 0);
    expect(k.kick).toBe(true);
    expect([k.aimX, k.aimY]).toEqual([0, 0]);
    inp.destroy();
  });

  it('right stick aims; a tiny mouse jiggle does not take aim back, real movement does', () => {
    const gp = fakePad({ axes: [0, 0, 0, -1] });
    const w = fakeWindow([gp]);
    const inp = createKeyboardInput(w, { padStatus: quiet() });
    w.dispatchEvent(mouse('mousemove', 900, 500));
    let f = inp.sample(state(400, 450), 0);
    expect(f.aimY).toBeCloseTo(-1); // stick up wins (pad is the latest input)
    gp.axes[3] = 0;
    w.dispatchEvent(mouse('mousemove', 901, 501)); // 1-2 px: sensor noise / browser re-fire
    f = inp.sample(state(400, 450), 0);
    expect([f.aimX, f.aimY]).toEqual([0, 0]);
    w.dispatchEvent(mouse('mousemove', 1000, 546)); // real movement → mouse aim (world 1000,450)
    f = inp.sample(state(400, 450), 0);
    expect(f.aimX).toBeCloseTo(1);
    expect(f.aimY).toBeCloseTo(0, 1);
    inp.destroy();
  });

  it('pad covers movement, kick, dash, phase dash (B) and Start = pause', () => {
    const gp = fakePad({ axes: [1, 0, 0, 0] });
    const w = fakeWindow([gp]);
    const inp = createKeyboardInput(w, { padStatus: quiet() });
    const menu: MenuAction[] = [];
    inp.onMenu((a) => menu.push(a));
    press(gp, 7); press(gp, 0); press(gp, 1);
    const f = inp.sample(state(400, 450), 0);
    expect(f).toMatchObject({ moveX: 1, moveY: 0, kick: true, dash: true, phaseDash: true, guard: false });
    press(gp, 9);
    inp.sample(state(400, 450), 0);
    inp.sample(state(400, 450), 0); // held Start = one pause, not two
    expect(menu).toEqual(['pause']);
    inp.destroy();
  });
});

describe('choosing the real controller among several', () => {
  const vjoy = fakePad({ id: 'vJoy Device (Vendor: 1234 Product: bead)', mapping: '', timestamp: 9000 });
  const xbox = fakePad({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', timestamp: 500 });
  const steam = fakePad({ id: 'Steam Virtual Gamepad (STANDARD GAMEPAD)', timestamp: 800 });

  it('prefers a standard-mapped pad, then the most recently updated one', () => {
    expect(choosePad([vjoy, null, xbox, steam], null)).toBe(3);
    expect(choosePad([vjoy], null)).toBe(0); // a non-standard pad is still better than nothing
    expect(choosePad([null, null], null)).toBe(-1);
  });

  it('switches to the pad the player is pressing, then sticks with it', () => {
    const a = fakePad({ timestamp: 500 }), b = fakePad({ timestamp: 800 });
    const pads = [a, b];
    expect(choosePad(pads, null)).toBe(1);
    press(a, 0);
    expect(choosePad(pads, 1)).toBe(0);
    press(a, 0, false);
    expect(choosePad(pads, 0)).toBe(0); // idle again: sticky, even though b is newer
  });

  it('ignores resting non-standard axes (triggers at -1) as activity', () => {
    const odd = fakePad({ mapping: '', axes: [-1, -1, -1, -1], timestamp: 9999 });
    const std = fakePad({ timestamp: 1 });
    expect(choosePad([odd, std], null)).toBe(1);
  });

  it('the game reads the chosen pad, not the first entry', () => {
    const v = fakePad({ id: 'vJoy', mapping: '', timestamp: 9000 });
    const x = fakePad({ timestamp: 10, axes: [0, -1, 0, 0] });
    const inp = createKeyboardInput(fakeWindow([v, x]), { padStatus: quiet() });
    expect(inp.sample(state(400, 450), 0).moveY).toBeCloseTo(-1);
    expect(inp.pad()?.standard).toBe(true);
    inp.destroy();
  });
});

describe('controller names, status and warnings', () => {
  it('shortens browser ids', () => {
    expect(padName('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('Xbox 360 Controller');
    expect(padName('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('DualSense Wireless Controller');
    expect(padName('054c-0ce6-Wireless Controller')).toBe('Wireless Controller');
    expect(padName('')).toBe('Controller');
  });

  it('publishes connect / disconnect to the status store', () => {
    const store = createPadStatus();
    const seen: string[] = [];
    store.subscribe((s, e) => seen.push(`${e}:${s.info?.name ?? '-'}`));
    const pads: Array<ReturnType<typeof fakePad> | null> = [];
    const inp = createKeyboardInput(fakeWindow(pads), { padStatus: store });
    inp.sample(state(400, 450), 0);
    pads.push(fakePad());
    inp.sample(state(400, 450), 0);
    inp.sample(state(400, 450), 0); // no change → no event
    pads[0] = null;
    inp.sample(state(400, 450), 0);
    expect(seen).toEqual(['connected:Xbox 360 Controller', 'disconnected:-']);
    inp.destroy();
  });

  it('warns about a non-standard controller in the toast and on the pause screen', () => {
    const odd = fakePad({ id: 'USB Gamepad (Vendor: 0079 Product: 0006)', mapping: '' });
    const info = padInfo([odd as PadEntry], 0)!;
    expect(info.standard).toBe(false);
    const st: PadStatus = { info, support: 'ok' };
    expect(padToast(st, 'connected')).toEqual({ title: 'Controller connected: USB Gamepad', warning: NON_STANDARD_WARNING });
    expect(padStatusLine(st)).toEqual({ text: `Controller: USB Gamepad. ${NON_STANDARD_WARNING}`, warn: true });
    const ok: PadStatus = { info: padInfo([fakePad() as PadEntry], 0), support: 'ok' };
    expect(padToast(ok, 'connected')).toEqual({ title: 'Controller connected: Xbox 360 Controller' });
    expect(padStatusLine({ info: null, support: 'ok' }).text).toBe('Controller: none. Press any controller button to connect.');
    expect(padToast({ info: null, support: 'ok' }, 'disconnected')).toEqual({ title: 'Controller disconnected' });
  });

  it('never throws when the browser blocks getGamepads', () => {
    const r = readGamepads({ getGamepads: () => { throw new Error('SecurityError'); } } as unknown as Navigator);
    expect(r.pads).toEqual([]);
    expect(r.support).not.toBe('ok');
    expect(padStatusLine({ info: null, support: 'insecure' }).warn).toBe(true);
  });
});
