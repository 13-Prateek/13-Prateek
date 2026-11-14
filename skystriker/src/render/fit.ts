import type { Vec2 } from '../shared/types';
import { computeFit as layoutFit, screenToWorld as layoutToWorld, type Fit } from '../shared/layout';

export type { Fit };

/**
 * How the 1600x900 world is placed on screen (CSS pixels). Delegates to the lead's
 * shared layout (`src/shared/layout.ts`), which reserves a HUD band above the arena.
 */
export function computeFit(screenW: number, screenH: number, out: Fit = { scale: 1, offsetX: 0, offsetY: 0 }): Fit {
  return layoutFit(screenW, screenH, out);
}

/**
 * Convert a screen point (CSS pixels, relative to the canvas' top-left) to world units.
 * Ignores the purely visual shake / zoom punch, so aiming never wobbles.
 */
export function screenToWorld(sx: number, sy: number, screenW: number, screenH: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  return layoutToWorld(sx, sy, layoutFit(screenW, screenH), out);
}
