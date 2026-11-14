import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../shared/constants';
import { computeFit, screenToWorld } from './fit';

describe('letterbox fit', () => {
  it('fills a 16:9 screen exactly', () => {
    const f = computeFit(1280, 720);
    expect(f.scale).toBeCloseTo(0.8);
    expect(f.offsetX).toBeCloseTo(0);
    expect(f.offsetY).toBeCloseTo(0);
  });

  it('letterboxes a tall screen vertically and keeps the world centred', () => {
    const f = computeFit(1000, 1000);
    expect(f.scale).toBeCloseTo(1000 / WORLD_W);
    expect(f.offsetX).toBeCloseTo(0);
    expect(f.offsetY).toBeCloseTo((1000 - WORLD_H * f.scale) / 2);
  });

  it('screenToWorld inverts the fit (corners and centre)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1200], [800, 900], [2560, 1080]]) {
      const f = computeFit(w, h);
      const c = screenToWorld(w / 2, h / 2, w, h);
      expect(c.x).toBeCloseTo(WORLD_W / 2);
      expect(c.y).toBeCloseTo(WORLD_H / 2);
      const tl = screenToWorld(f.offsetX, f.offsetY, w, h);
      expect(tl.x).toBeCloseTo(0);
      expect(tl.y).toBeCloseTo(0);
      const br = screenToWorld(f.offsetX + WORLD_W * f.scale, f.offsetY + WORLD_H * f.scale, w, h);
      expect(br.x).toBeCloseTo(WORLD_W);
      expect(br.y).toBeCloseTo(WORLD_H);
    }
  });
});
