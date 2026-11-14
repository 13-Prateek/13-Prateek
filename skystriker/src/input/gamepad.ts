/**
 * Gamepad discovery + selection (pure helpers, plus a tiny status store the HUD reads).
 *
 * Windows often lists extra "pads": Steam virtual pads, vJoy, a DualSense listed twice,
 * headsets with buttons. We pick the most likely real controller and stick with it:
 *   1. a pad the player is pressing/tilting right now (standard mapping first),
 *   2. else the pad we used last, if still connected,
 *   3. else standard mapping first, then the most recently updated (timestamp).
 */
import type { PadLike } from './mapping';

export interface PadEntry extends PadLike {
  id?: string;
  index?: number;
  connected?: boolean;
  timestamp?: number;
}

export interface PadInfo {
  index: number;
  /** Full browser id string. */
  id: string;
  /** Short human name for toasts / the pause screen. */
  name: string;
  /** W3C "standard" mapping (Xbox layout). Non-standard pads may have wrong buttons. */
  standard: boolean;
  /** How many controllers the browser lists in total. */
  count: number;
}

/** 'ok', or why the browser won't give us controllers at all. */
export type PadSupport = 'ok' | 'insecure' | 'unsupported';

/** Stick tilt that counts as "the player is using this pad". */
export const PAD_ACTIVITY_AXIS = 0.4;

/** Short display name: drop the "(STANDARD GAMEPAD Vendor: … Product: …)" noise. */
export function padName(id: string | undefined): string {
  if (!id) return 'Controller';
  let n = id.replace(/\(.*?\)/g, ' ');
  n = n.replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, ''); // Firefox style "054c-0ce6-Name"
  n = n.replace(/\b(STANDARD GAMEPAD|Vendor:?\s*\w+|Product:?\s*\w+)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return n || 'Controller';
}

export const isStandard = (gp: PadEntry): boolean => gp.mapping === 'standard';

/** Is the player pressing a button or tilting a stick on this pad right now? */
export function padActive(gp: PadEntry): boolean {
  if (gp.buttons.some((b) => b && (b.pressed || b.value > 0.5))) return true;
  // Only trust stick axes on standard pads: non-standard pads often rest triggers at -1.
  if (!isStandard(gp)) return false;
  for (let i = 0; i < Math.min(4, gp.axes.length); i++) if (Math.abs(gp.axes[i] ?? 0) > PAD_ACTIVITY_AXIS) return true;
  return false;
}

const connected = (gp: PadEntry | null | undefined): gp is PadEntry => !!gp && gp.connected !== false;
const rank = (gp: PadEntry) => (isStandard(gp) ? 2 : 0) + (padActive(gp) ? 1 : 0);
const newest = (a: PadEntry, b: PadEntry) => (b.timestamp ?? 0) - (a.timestamp ?? 0);

/**
 * Choose the pad to read. `lastIndex` = the pad chosen last time (sticky).
 * Returns the chosen pad's position in `pads`, or -1.
 */
export function choosePad(pads: ReadonlyArray<PadEntry | null | undefined>, lastIndex: number | null): number {
  const list = pads.map((gp, i) => ({ gp, i })).filter((x): x is { gp: PadEntry; i: number } => connected(x.gp));
  if (!list.length) return -1;
  const active = list.filter((x) => padActive(x.gp));
  if (active.length) {
    // Someone is pressing something: keep the current pad if it's one of them, else the best active one.
    const cur = active.find((x) => x.i === lastIndex);
    if (cur) return cur.i;
    active.sort((a, b) => rank(b.gp) - rank(a.gp) || newest(a.gp, b.gp));
    return active[0].i;
  }
  const sticky = list.find((x) => x.i === lastIndex);
  if (sticky) return sticky.i;
  list.sort((a, b) => rank(b.gp) - rank(a.gp) || newest(a.gp, b.gp));
  return list[0].i;
}

export function padInfo(pads: ReadonlyArray<PadEntry | null | undefined>, i: number): PadInfo | null {
  const gp = pads[i];
  if (!connected(gp)) return null;
  return {
    index: gp.index ?? i,
    id: gp.id ?? '',
    name: padName(gp.id),
    standard: isStandard(gp),
    count: pads.filter(connected).length,
  };
}

/** Safe navigator.getGamepads(): never throws (permissions policy / insecure context). */
export function readGamepads(nav: Partial<Navigator> | undefined): { pads: ReadonlyArray<PadEntry | null>; support: PadSupport } {
  const secure = typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : true;
  if (!nav || typeof nav.getGamepads !== 'function') return { pads: [], support: secure ? 'unsupported' : 'insecure' };
  try {
    return { pads: Array.from(nav.getGamepads() as ArrayLike<PadEntry | null>), support: 'ok' };
  } catch {
    return { pads: [], support: secure ? 'unsupported' : 'insecure' };
  }
}

/* ------------------------------ status store ------------------------------ */
export type PadEvent = 'connected' | 'disconnected' | 'changed';
export interface PadStatus {
  info: PadInfo | null;
  support: PadSupport;
}
type PadListener = (status: PadStatus, event: PadEvent) => void;

/**
 * The active controller as seen by the keyboard/mouse/pad input. The HUD subscribes,
 * so the toast and pause-screen line show exactly the pad the game is reading.
 */
export function createPadStatus() {
  let status: PadStatus = { info: null, support: 'ok' };
  const listeners = new Set<PadListener>();
  return {
    get: (): PadStatus => status,
    set(next: PadStatus) {
      const a = status.info, b = next.info;
      const same = a?.index === b?.index && a?.id === b?.id && a?.standard === b?.standard && a?.count === b?.count;
      if (same && status.support === next.support) return;
      const event: PadEvent = !a && b ? 'connected' : a && !b ? 'disconnected' : 'changed';
      status = next;
      listeners.forEach((cb) => cb(status, event));
    },
    subscribe(cb: PadListener): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/** Shared instance: written by createKeyboardInput, read by createHud. */
export const padStatus = createPadStatus();
