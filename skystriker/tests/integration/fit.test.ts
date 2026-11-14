/**
 * Lead-owned integration guard: mouse aim (src/input) and drawing (src/render)
 * each compute the letterbox fit. If they ever disagree, aiming feels "off".
 */
import { describe, expect, it } from 'vitest';
import { computeFit as inputFit, screenToWorld as inputToWorld } from '../../src/input/mapping';
import { screenToWorld as renderToWorld } from '../../src/render/fit';

describe('input and render agree on screen → world', () => {
  const screens: [number, number][] = [[1280, 720], [1920, 1080], [1024, 768], [2560, 1080], [390, 844]];
  const points: [number, number][] = [[0, 0], [100, 50], [640, 360], [1279, 719], [37.5, 812.25]];
  for (const [w, h] of screens) {
    it(`${w}x${h}`, () => {
      const fit = inputFit(w, h);
      for (const [x, y] of points) {
        const a = inputToWorld(x, y, fit);
        const b = renderToWorld(x, y, w, h);
        expect(a.x).toBeCloseTo(b.x, 6);
        expect(a.y).toBeCloseTo(b.y, 6);
      }
    });
  }
});
