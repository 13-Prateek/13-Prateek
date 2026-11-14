import type { Element, HeroId } from './types';

/** Hero roster data. Stats are multipliers around 1.0. Wave 1 ships Kael only in UI; all are valid in the sim. */
export interface HeroDef {
  id: HeroId;
  name: string;
  element: Element;
  /** One-word playstyle shown on the select screen. */
  style: string;
  /** Primary neon colour (hex) for body glow, trails, HUD. */
  color: number;
  /** Secondary colour for highlights. */
  accent: number;
  speed: number;
  power: number;
  control: number;
  auraGain: number;
  superName: string;
  guardName: string;
}

export const HEROES: Record<HeroId, HeroDef> = {
  kael: {
    id: 'kael', name: 'Kael Ember', element: 'fire', style: 'Pressure',
    color: 0xff5a2a, accent: 0xffd166,
    speed: 1.0, power: 1.1, control: 0.95, auraGain: 1.0,
    superName: 'INFERNO COMET', guardName: 'FLAME WALL',
  },
  yuki: {
    id: 'yuki', name: 'Yuki Riven', element: 'frost', style: 'Precision',
    color: 0x5ad8ff, accent: 0xe6fbff,
    speed: 1.0, power: 0.95, control: 1.15, auraGain: 1.0,
    superName: 'GLACIER LANCE', guardName: 'MIRROR ICE',
  },
  zap: {
    id: 'zap', name: 'Zap Voltaire', element: 'volt', style: 'Tempo',
    color: 0xc77dff, accent: 0xfff275,
    speed: 1.15, power: 0.9, control: 1.0, auraGain: 1.1,
    superName: 'THUNDER RICOCHET', guardName: 'STATIC FIELD',
  },
  brakka: {
    id: 'brakka', name: 'Brakka Stone', element: 'stone', style: 'Weight',
    color: 0x7ee08a, accent: 0xd4a373,
    speed: 0.85, power: 1.25, control: 0.85, auraGain: 0.95,
    superName: 'TITAN HAMMER', guardName: 'STONE GAUNTLET',
  },
};

/** Fire > Frost > Volt > Stone > Fire. Returns the power multiplier for `a` against `b`. */
export function elementAdvantage(a: Element | null, b: Element | null): number {
  if (!a || !b) return 1;
  const beats: Record<Element, Element> = { fire: 'frost', frost: 'volt', volt: 'stone', stone: 'fire' };
  if (beats[a] === b) return 1.25;
  if (beats[b] === a) return 0.8;
  return 1;
}
