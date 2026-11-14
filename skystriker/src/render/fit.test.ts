import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../shared/constants';
import { HUD_BAND } from '../shared/layout';
import { computeFit, screenToWorld } from './fit';

const SCREENS: [number, number][] = [[1280, 720], [1920, 1080], [1920, 1200], [1000, 1000], [800, 900], [2560, 1080]];

describe('letterbox fit (with the HUD band above the arena)', () => {
  it('fits the HUD band + world inside every screen, centred', () => {
    for (const [w, h] of SCREENS) {
      const f = computeFit(w, h);
      const top = f.offsetY - HUD_BAND * f.scale; // top of the HUD band
      expect(top).toBeGreaterThanOrEqual(-1e-6);
      expect(f.offsetY + WORLD_H * f.scale).toBeLessThanOrEqual(h + 1e-6);
      expect(f.offsetX).toBeGreaterThanOrEqual(-1e-6);
      expect(f.offsetX + WORLD_W * f.scale).toBeLessThanOrEqual(w + 1e-6);
      // Centred: equal margins left/right and above the band / below the world.
      expect(f.offsetX).toBeCloseTo(w - (f.offsetX + WORLD_W * f.scale));
      expect(top).toBeCloseTo(h - (f.offsetY + WORLD_H * f.scale));
      // And one side touches the screen edge (it's as big as it can be).
      expect(Math.min(f.offsetX, top)).toBeCloseTo(0);
    }
  });

  it('screenToWorld inverts the fit (corners)', () => {
    for (const [w, h] of SCREENS) {
      const f = computeFit(w, h);
      const tl = screenToWorld(f.offsetX, f.offsetY, w, h);
      expect(tl.x).toBeCloseTo(0);
      expect(tl.y).toBeCloseTo(0);
      const br = screenToWorld(f.offsetX + WORLD_W * f.scale, f.offsetY + WORLD_H * f.scale, w, h);
      expect(br.x).toBeCloseTo(WORLD_W);
      expect(br.y).toBeCloseTo(WORLD_H);
    }
  });
});
