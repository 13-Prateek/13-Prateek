/**
 * RENDER MODULE (render/VFX session). Neon-style PixiJS 8 renderer.
 * Public API: `createRenderer(host)` returning the shared `Renderer` interface,
 * plus `screenToWorld` / `computeFit` (the letterbox math, for mouse aiming).
 *
 * Presentation only: reads MatchState + GameEvents, never mutates them.
 * Layers (back → front): backdrop · wall decals · walls · dash ghosts · ball trail ·
 * fighters · ball · particles · tween fx · damage numbers.  Screen flash on top.
 */
import { Application, Container, Filter, Point, Sprite } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';
import { WORLD_H, WORLD_W } from '../shared/constants';
import type { GameEvent, MatchState, Renderer } from '../shared/types';
import { ArenaView } from './arena';
import { BallView } from './ball';
import { CameraFx } from './camera';
import { FighterView } from './fighter';
import { computeFit, type Fit } from './fit';
import { FX } from './palette';
import { ParticlePool, TweenPool } from './pools';
import { getTextures } from './textures';
import { Vfx, type ScreenFx } from './vfx';

export { computeFit, screenToWorld } from './fit';
export { FX } from './palette';

export interface RendererOptions {
  /** Disable bloom / shockwave / chromatic filters (also `?lowfx=1`). */
  lowFx?: boolean;
}

/** Extra debug surface, used by the dev harness and frame-time checks. */
export interface RendererDebug {
  particles(): number;
  tweens(): number;
  lowFx: boolean;
}

function urlLowFx(): boolean {
  try {
    const v = new URLSearchParams(window.location.search).get('lowfx');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export async function createRenderer(host: HTMLElement, opts: RendererOptions = {}): Promise<Renderer & { debug: RendererDebug }> {
  const lowFx = opts.lowFx ?? urlLowFx();
  const app = new Application();
  await app.init({
    background: FX.BG, antialias: true, resizeTo: host, autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  host.appendChild(app.canvas);
  const tx = getTextures();

  /* scene graph */
  const fxRoot = new Container(); // screen space, identity transform: post filters live here
  const root = new Container(); // letterbox fit
  const camera = new Container(); // shake + zoom punch
  root.addChild(camera);
  fxRoot.addChild(root);
  app.stage.addChild(fxRoot);

  const arena = new ArenaView(tx);
  const parts = new ParticlePool(900, tx.glow, tx.streak);
  const tweens = new TweenPool(220, 'add');
  const decals = new TweenPool(12, 'add');
  const fighterViews: [FighterView, FighterView] = [
    new FighterView(tx, 0, tweens, parts),
    new FighterView(tx, 1, tweens, parts),
  ];
  const ball = new BallView(tx, parts);
  const cam = new CameraFx();

  const flash = new Sprite(tx.white);
  flash.alpha = 0;
  let flashDecay = 1;
  const edge = new Sprite(tx.edge);
  edge.blendMode = 'add';
  edge.alpha = 0;
  let edgeDecay = 1;

  camera.addChild(
    arena.back, decals.container, arena.walls,
    fighterViews[0].ghostLayer, fighterViews[1].ghostLayer,
    ball.trailLayer,
    fighterViews[0].root, fighterViews[1].root,
    ball.root, parts.container, tweens.container,
  );
  app.stage.addChild(edge, flash);

  /* filters */
  const bloom = lowFx ? null : new AdvancedBloomFilter({
    threshold: FX.BLOOM_THRESHOLD, bloomScale: FX.BLOOM_SCALE, brightness: 1, blur: FX.BLOOM_BLUR, quality: 4,
  });
  const shock = lowFx ? null : new ShockwaveFilter({ amplitude: 22, wavelength: 140, speed: 900, brightness: 1.15, radius: 420 });
  const rgb = lowFx ? null : new RGBSplitFilter({ red: { x: -4, y: 0 }, green: { x: 0, y: 2 }, blue: { x: 4, y: -1 } });
  let shockOn = false, shockLife = 0, shockMax = 0;
  let chromaT = 0, chromaMax = 0.1;
  let filterKey = -1;
  const syncFilters = () => {
    const key = (shockOn ? 1 : 0) | (chromaT > 0 ? 2 : 0);
    if (key === filterKey) return;
    filterKey = key;
    const list: Filter[] = [];
    if (shock && shockOn) list.push(shock);
    if (bloom) list.push(bloom);
    if (rgb && chromaT > 0) list.push(rgb);
    fxRoot.filters = list.length ? list : null;
  };

  /* fit */
  const fit: Fit = { scale: 1, offsetX: 0, offsetY: 0 };
  let lastW = -1, lastH = -1;
  const doFit = () => {
    const w = app.screen.width, h = app.screen.height;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    computeFit(w, h, fit);
    root.scale.set(fit.scale);
    root.position.set(fit.offsetX, fit.offsetY);
    flash.width = w;
    flash.height = h;
    edge.width = w;
    edge.height = h;
    fxRoot.filterArea = app.screen;
  };
  doFit();

  let slowmoT = 0;
  const tmpP = new Point();
  const tmpG = new Point();
  const screenFx: ScreenFx = {
    flash(color, alpha, seconds) {
      if (alpha < flash.alpha) return;
      flash.tint = color;
      flash.alpha = alpha;
      flashDecay = alpha / Math.max(0.01, seconds);
    },
    shockwave(x, y, strength) {
      if (!shock) return;
      tmpP.set(x, y);
      camera.toGlobal(tmpP, tmpG);
      shock.centerX = tmpG.x;
      shock.centerY = tmpG.y;
      const s = fit.scale;
      shock.amplitude = 18 * strength * s + 6;
      shock.wavelength = 150 * s;
      shock.speed = 1100 * s;
      shock.radius = (300 + 200 * strength) * s;
      shock.time = 0;
      shockMax = shock.radius / shock.speed + 0.05;
      shockLife = 0;
      shockOn = true;
    },
    chroma(seconds) {
      chromaT = Math.max(chromaT, seconds);
      chromaMax = Math.max(0.05, chromaT);
    },
    slowmo(seconds) { slowmoT = Math.max(slowmoT, seconds); },
    edgeFlash(color, alpha, seconds) {
      edge.tint = color;
      edge.alpha = alpha;
      edgeDecay = alpha / Math.max(0.01, seconds);
    },
  };

  const vfx = new Vfx(tx, parts, tweens, decals, cam, fighterViews, ball, arena, screenFx);
  camera.addChild(vfx.numbers.container);

  let destroyed = false;

  return {
    render(prev: Readonly<MatchState>, curr: Readonly<MatchState>, alpha: number, dtSeconds: number) {
      if (destroyed) return;
      doFit();
      const dt = Math.max(0, Math.min(0.1, dtSeconds || 0));
      const a = Math.max(0, Math.min(1, alpha));
      const frozen = curr.hitstop > 0;
      if (slowmoT > 0) slowmoT -= dt;
      let ts = slowmoT > 0 ? FX.KO_SLOWMO_SCALE : 1;
      if (frozen) ts = Math.min(ts, FX.HITSTOP_FX_SCALE);
      const fxDt = dt * ts;

      cam.update(dt);
      camera.pivot.set(cam.focusX, cam.focusY);
      camera.position.set(cam.focusX + cam.offsetX, cam.focusY + cam.offsetY);
      camera.scale.set(cam.zoom);
      camera.rotation = cam.roll;

      const f0 = curr.fighters[0], f1 = curr.fighters[1];
      const midX = (f0.pos.x + f1.pos.x + curr.ball.pos.x) / 3 - WORLD_W / 2;
      const midY = (f0.pos.y + f1.pos.y + curr.ball.pos.y) / 3 - WORLD_H / 2;
      arena.update(curr, dt, midX + cam.offsetX * 4, midY + cam.offsetY * 4);

      fighterViews[0].update(f0, prev.fighters[0], a, curr, dt, fxDt, frozen);
      fighterViews[1].update(f1, prev.fighters[1], a, curr, dt, fxDt, frozen);
      ball.update(prev.ball, curr.ball, a, curr, dt, fxDt, frozen);

      parts.update(fxDt);
      tweens.update(fxDt);
      decals.update(fxDt);
      vfx.numbers.update(dt * (slowmoT > 0 ? 0.6 : 1));

      if (flash.alpha > 0) flash.alpha = Math.max(0, flash.alpha - flashDecay * dt);
      if (edge.alpha > 0) edge.alpha = Math.max(0, edge.alpha - edgeDecay * dt);

      if (shock && shockOn) {
        shockLife += dt;
        shock.time = shockLife;
        if (shockLife > shockMax) shockOn = false;
      }
      if (rgb && chromaT > 0) {
        chromaT = Math.max(0, chromaT - dt);
        const k = chromaT / chromaMax;
        rgb.redX = -6 * k;
        rgb.blueX = 6 * k;
        rgb.blueY = -1.5 * k;
        rgb.greenY = 2 * k;
      }
      syncFilters();
    },
    onEvents(events: readonly GameEvent[], state: Readonly<MatchState>) {
      if (destroyed) return;
      for (const e of events) vfx.handle(e, state);
    },
    resize() {
      // Application resizes the canvas to the host itself; refit next frame.
      lastW = -1;
      doFit();
    },
    destroy() {
      destroyed = true;
      app.destroy(true, { children: true });
    },
    debug: {
      particles: () => parts.liveCount,
      tweens: () => tweens.liveCount,
      lowFx,
    },
  };
}
