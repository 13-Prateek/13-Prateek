/**
 * UI MODULE — STUB. Owned by the audio/UI session (see docs/ARCHITECTURE.md).
 * DOM overlay in #ui: HUD (health, aura, timer, rounds), callouts, menus.
 */
import type { HudSystem, MatchState } from '../shared/types';

export function createHud(root: HTMLElement): HudSystem {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:12px;left:0;right:0;text-align:center;color:#cfe3ff;font:600 18px system-ui';
  root.appendChild(el);
  return {
    update(s: Readonly<MatchState>) {
      el.textContent = `P1 ${s.fighters[0].hp} HP  ·  ${s.phase.toUpperCase()}  ·  P2 ${s.fighters[1].hp} HP`;
    },
    onEvents() {},
  };
}
