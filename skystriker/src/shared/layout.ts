/**
 * SCREEN LAYOUT — owned by the lead. The single source of truth for how the world is
 * placed on screen. Renderer (drawing), input (mouse aim) and HUD (overlay) all use it,
 * so they can never disagree.
 *
 * The screen fits a box of WORLD_W × (HUD_BAND + WORLD_H), centred and letterboxed.
 * The top HUD_BAND (world units) holds the health bars / timer, so the HUD never
 * covers the arena (playtest: fighters and the ball near the top wall hid behind it).
 */
import { WORLD_H, WORLD_W } from './constants';
import type { Vec2 } from './types';

/** Height, in world units, of the HUD strip above the arena. */
export const HUD_BAND = 96;

export interface Fit {
  /** CSS px per world unit. */
  scale: number;
  /** Screen position (CSS px) of world (0, 0). */
  offsetX: number;
  offsetY: number;
}

/** Where world (0,0) lands on a viewW × viewH screen, and at what scale. */
export function computeFit(viewW: number, viewH: number, out: Fit = { scale: 1, offsetX: 0, offsetY: 0 }): Fit {
  const boxH = WORLD_H + HUD_BAND;
  const s = Math.max(1e-6, Math.min(viewW / WORLD_W, viewH / boxH));
  out.scale = s;
  out.offsetX = (viewW - WORLD_W * s) / 2;
  out.offsetY = (viewH - boxH * s) / 2 + HUD_BAND * s;
  return out;
}

/** Screen point (CSS px) → world units, for a given fit. */
export function screenToWorld(sx: number, sy: number, fit: Fit, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  out.x = (sx - fit.offsetX) / fit.scale;
  out.y = (sy - fit.offsetY) / fit.scale;
  return out;
}
