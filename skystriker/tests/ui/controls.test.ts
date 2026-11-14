import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, MOUSE_BINDINGS, PAD_BUTTONS } from '../../src/input/mapping';
import { PHASE_DASH_COST, controlRows, keyLabel, ruleLines } from '../../src/ui/controls';

describe('pause-screen controls match the real bindings', () => {
  const rows = controlRows();
  const all = rows.map((r) => `${r.action}|${r.keyboard}|${r.pad}`).join('\n');

  it('lists every bound key, mouse button and pad button', () => {
    for (const code of Object.keys(KEY_BINDINGS)) expect(all).toContain(keyLabel(code));
    expect(all).toContain('Left click');
    expect(all).toContain('Right click');
    expect(Object.keys(MOUSE_BINDINGS)).toHaveLength(2);
    for (const label of ['RT', 'RB', 'LT', 'A', 'X', 'B', 'Y', 'Start']) expect(all).toContain(label);
    expect(PAD_BUTTONS.length).toBe(8);
  });

  it('shows Phase Dash on Q / B and no Guard', () => {
    const pd = rows.find((r) => r.action.startsWith('Phase Dash'))!;
    expect(pd.keyboard).toBe('Q');
    expect(pd.pad).toBe('B');
    expect(all).not.toMatch(/guard/i);
  });

  it('kick and dash rows read naturally', () => {
    expect(rows.find((r) => r.action.startsWith('Kick'))!.keyboard).toBe('Left click / J');
    expect(rows.find((r) => r.action.startsWith('Dash'))!.keyboard).toBe('Space / Shift');
    expect(rows.find((r) => r.action === 'Fly')!.keyboard).toBe('W A S D');
  });

  it('has one line for each core rule', () => {
    const keys = ruleLines().map(([k]) => k);
    for (const k of ['Ball colour', 'Phase Dash', 'Heat', 'Final Rush']) expect(keys).toContain(k);
    expect(PHASE_DASH_COST).toBe(50);
  });
});
