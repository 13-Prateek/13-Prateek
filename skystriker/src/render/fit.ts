import { WORLD_H, WORLD_W } from '../shared/constants';
import type { Vec2 } from '../shared/types';

/** How the 1600x900 world is letterboxed into the screen (CSS pixels). */
export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Same math as the original stub: uniform scale, centred, letterboxed. */
export function computeFit(screenW: number, screenH: number, out: Fit = { scale: 1, offsetX: 0, offsetY: 0 }): Fit {
  const s = Math.min(screenW / WORLD_W, screenH / WORLD_H);
  out.scale = s;
  out.offsetX = (screenW - WORLD_W * s) / 2;
  out.offsetY = (screenH - WORLD_H * s) / 2;
  return out;
}

/**
 * Convert a screen point (CSS pixels, relative to the canvas' top-left) to world units.
 * Ignores the purely visual shake / zoom punch, so aiming never wobbles.
 */
export function screenToWorld(sx: number, sy: number, screenW: number, screenH: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const s = Math.min(screenW / WORLD_W, screenH / WORLD_H);
  out.x = (sx - (screenW - WORLD_W * s) / 2) / s;
  out.y = (sy - (screenH - WORLD_H * s) / 2) / s;
  return out;
}
