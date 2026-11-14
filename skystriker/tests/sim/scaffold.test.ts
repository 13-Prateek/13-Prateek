import { describe, expect, it } from 'vitest';
import { createMatch, stepMatch } from '../../src/sim';
import { EMPTY_INPUT } from '../../src/shared/types';

describe('sim scaffold', () => {
  it('creates a match and leaves countdown', () => {
    const s = createMatch({ heroes: ['kael', 'yuki'], roundsToWin: 2, seed: 1 });
    for (let i = 0; i < 200; i++) stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT]);
    expect(s.phase).toBe('playing');
  });
});
