/**
 * "How to play" content for the pause screen. Key labels are DERIVED from the
 * real bindings in src/input/mapping.ts, so the help can never drift from input.
 */
import * as C from '../shared/constants';
import { type Action, KEY_BINDINGS, MOUSE_BINDINGS, PAD_BUTTONS } from '../input/mapping';

/** Reads a tuning constant the sim session may add later (pressure pass), with the design default. */
const tuning = (name: string, fallback: number): number => {
  const v = (C as Record<string, unknown>)[name];
  return typeof v === 'number' ? v : fallback;
};
/** Phase Dash cost in aura (GDD §7: half a bar). */
export const PHASE_DASH_COST = tuning('PHASE_DASH_COST', C.AURA_PER_BAR / 2);
/** Max rally Heat level (GDD §3). */
export const HEAT_MAX = tuning('HEAT_MAX', 4);
/** Final Rush length in seconds (GDD §8, display only). */
export const FINAL_RUSH_SECONDS = tuning('FINAL_RUSH_TICKS', 20 * C.SIM_HZ) / C.SIM_HZ;

const KEY_LABEL: Record<string, string> = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter',
};
export const keyLabel = (code: string): string => KEY_LABEL[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');

const MOUSE_LABEL: Record<number, string> = { 0: 'Left click', 1: 'Middle click', 2: 'Right click' };
const PAD_LABEL: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start',
};

function keysFor(a: Action): string[] {
  const out: string[] = [];
  for (const [code, act] of Object.entries(KEY_BINDINGS)) if (act === a && !out.includes(keyLabel(code))) out.push(keyLabel(code));
  return out;
}
const mouseFor = (a: Action) => Object.entries(MOUSE_BINDINGS).filter(([, x]) => x === a).map(([b]) => MOUSE_LABEL[Number(b)]);
const padFor = (a: Action) => PAD_BUTTONS.filter(([, x]) => x === a).map(([i]) => PAD_LABEL[i] ?? `Button ${i}`);

export interface ControlRow {
  action: string;
  keyboard: string;
  pad: string;
}

/** Every player-1 control, keyboard+mouse and gamepad, in play order. */
export function controlRows(): ControlRow[] {
  const join = (...parts: string[][]) => parts.flat().join(' / ');
  const row = (action: string, a: Action, note = ''): ControlRow =>
    ({ action, keyboard: join(mouseFor(a), keysFor(a)) + note, pad: join(padFor(a)) });
  const move = [...keysFor('up'), ...keysFor('left'), ...keysFor('down'), ...keysFor('right')].join(' ');
  return [
    { action: 'Fly', keyboard: move, pad: 'Left stick / D-pad' },
    { action: 'Aim', keyboard: 'Mouse', pad: 'Right stick (centred = auto-aim)' },
    row('Kick (hold = power)', 'kick'),
    row('Trap / dribble', 'trap'),
    row('Dash (free)', 'dash'),
    row('Phase Dash (½ bar)', 'phaseDash'),
    row('Infuse (1 bar)', 'infuse'),
    row('Super (3 bars, coming soon)', 'super'),
    row('Pause', 'pause'),
    { action: 'Rematch', keyboard: keysFor('rematch').join(' / '), pad: padFor('pause').join(' / ') },
    { action: 'Mute', keyboard: 'M', pad: '' },
  ];
}

/** One line per core rule (ball colour, Phase Dash, Heat, Final Rush, aura, winning). */
export function ruleLines(): Array<[string, string]> {
  return [
    ['Ball colour', 'White = safe to touch. Coloured = last kicker’s ball: it only hurts the OTHER player.'],
    ['Phase Dash', `Costs half an aura bar (the notch). Ball passes through you, then you're winded. Free dash is not invulnerable.`],
    ['Heat', `Each return heats the ball (max ${HEAT_MAX}): faster and louder. Cools when someone is hit.`],
    ['Final Rush', `Last ${Math.round(FINAL_RUSH_SECONDS)} s of a round: walls close in, the ball never fully cools.`],
    ['Aura', 'Fill it by kicking, close calls, perfect returns and landing hits.'],
    ['Win', 'Hit them with your ball to drain their health. Best of 3 rounds.'],
  ];
}
