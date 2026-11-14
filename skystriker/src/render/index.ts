/**
 * RENDER MODULE — STUB. Owned by the render/VFX session (see docs/ARCHITECTURE.md).
 * Replace the internals; keep `createRenderer` and the Renderer interface.
 */
import { Application, Graphics } from 'pixi.js';
import { WORLD_H, WORLD_W } from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { GameEvent, MatchState, Renderer } from '../shared/types';
import { lerp } from '../shared/vec';

export async function createRenderer(host: HTMLElement): Promise<Renderer> {
  const app = new Application();
  await app.init({ background: 0x05060d, antialias: true, resizeTo: host, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  host.appendChild(app.canvas);
  const world = new Graphics();
  app.stage.addChild(world);

  const fit = () => {
    const s = Math.min(app.screen.width / WORLD_W, app.screen.height / WORLD_H);
    world.scale.set(s);
    world.position.set((app.screen.width - WORLD_W * s) / 2, (app.screen.height - WORLD_H * s) / 2);
  };
  fit();

  return {
    render(prev, curr, alpha) {
      fit();
      world.clear();
      const a = curr.arena;
      world.rect(a.left, a.top, a.right - a.left, a.bottom - a.top).stroke({ width: 3, color: 0x2b3a67 });
      curr.fighters.forEach((f, i) => {
        const p = prev.fighters[i];
        const x = lerp(p.pos.x, f.pos.x, alpha), y = lerp(p.pos.y, f.pos.y, alpha);
        world.circle(x, y, 34).stroke({ width: 4, color: HEROES[f.heroId].color });
      });
      const b = curr.ball, pb = prev.ball;
      world.circle(lerp(pb.pos.x, b.pos.x, alpha), lerp(pb.pos.y, b.pos.y, alpha), b.radius).fill(0xffffff);
    },
    onEvents(_e: readonly GameEvent[], _s: Readonly<MatchState>) {},
    resize() { fit(); },
    destroy() { app.destroy(true); },
  };
}
