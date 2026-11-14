import { Container, Graphics, Sprite } from 'pixi.js';
import { WORLD_H, WORLD_W } from '../shared/constants';
import type { MatchState } from '../shared/types';
import { FX, mixColor } from './palette';
import { rnd, rrange } from './rng';
import type { FxTextures } from './textures';

const BLEED = 360; // backdrop extends past the world so shake / letterbox never shows bare edges
const STARS = 150;
const DUST = 46;

/**
 * Backdrop (grid, stars, drifting dust with parallax) and the glowing arena walls.
 * Static geometry is built once; walls are rebuilt only when the arena rect changes.
 */
export class ArenaView {
  readonly back = new Container();
  readonly walls = new Container();
  private readonly grid = new Graphics();
  private readonly starLayer = new Container();
  private readonly dustLayer = new Container();
  private readonly stars: Sprite[] = [];
  private readonly starPhase = new Float32Array(STARS);
  private readonly starBase = new Float32Array(STARS);
  private readonly dust: Sprite[] = [];
  private readonly dustV = new Float32Array(DUST * 2);
  private readonly wallG = new Graphics();
  private readonly outside = new Graphics();
  private readonly vignette: Sprite;
  private l = NaN; private t = NaN; private r = NaN; private b = NaN;
  private time = 0;
  /** 0..1 extra wall brightness (round start / fight pulse). */
  pulse = 0;
  private sudden = false;

  constructor(tx: FxTextures) {
    const bg = new Graphics();
    bg.rect(-BLEED, -BLEED, WORLD_W + BLEED * 2, WORLD_H + BLEED * 2).fill(FX.BG);
    // faint deeper-blue haze in the middle for depth
    const haze = new Sprite(tx.glow);
    haze.anchor.set(0.5);
    haze.position.set(WORLD_W / 2, WORLD_H / 2);
    haze.scale.set(WORLD_W * 1.3 / 128, WORLD_H * 1.3 / 128);
    haze.tint = 0x1a1f5c;
    haze.alpha = 0.55;

    for (let i = 0; i < STARS; i++) {
      const s = new Sprite(tx.disc);
      s.anchor.set(0.5);
      s.position.set(rrange(-BLEED, WORLD_W + BLEED), rrange(-BLEED, WORLD_H + BLEED));
      s.scale.set(rrange(1, 3.2) / 64);
      s.tint = rnd() < 0.2 ? 0x9fb4ff : 0xffffff;
      this.starBase[i] = rrange(0.15, 0.6);
      this.starPhase[i] = rrange(0, 6.28);
      this.stars.push(s);
      this.starLayer.addChild(s);
    }

    this.drawGrid();

    for (let i = 0; i < DUST; i++) {
      const s = new Sprite(tx.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.position.set(rrange(-BLEED, WORLD_W + BLEED), rrange(-BLEED, WORLD_H + BLEED));
      s.scale.set(rrange(10, 34) / 128);
      s.tint = rnd() < 0.5 ? 0x5b7cff : 0xa06bff;
      s.alpha = rrange(0.08, 0.22);
      this.dustV[i * 2] = rrange(-8, 8);
      this.dustV[i * 2 + 1] = rrange(-6, 6);
      this.dust.push(s);
      this.dustLayer.addChild(s);
    }

    this.vignette = new Sprite(tx.vignette);
    this.vignette.anchor.set(0.5);
    this.vignette.position.set(WORLD_W / 2, WORLD_H / 2);
    this.vignette.scale.set((WORLD_W + 200) / 256 * 1.15, (WORLD_H + 200) / 256 * 1.2);

    this.back.addChild(bg, haze, this.starLayer, this.grid, this.dustLayer, this.vignette);
    this.walls.addChild(this.outside, this.wallG);
  }

  private drawGrid(): void {
    const g = this.grid;
    const step = 50;
    for (let x = -BLEED + ((BLEED % step)); x <= WORLD_W + BLEED; x += step) {
      const major = x % 200 === 0;
      g.moveTo(x, -BLEED).lineTo(x, WORLD_H + BLEED).stroke({ width: major ? 1.6 : 1, color: FX.GRID, alpha: major ? 0.55 : 0.28 });
    }
    for (let y = -BLEED + ((BLEED % step)); y <= WORLD_H + BLEED; y += step) {
      const major = (y - 50) % 200 === 0; // keeps a major line through the centre (y = 450)
      g.moveTo(-BLEED, y).lineTo(WORLD_W + BLEED, y).stroke({ width: major ? 1.6 : 1, color: FX.GRID, alpha: major ? 0.55 : 0.28 });
    }
    // centre markings: ball spawn circle and halfway line
    g.circle(WORLD_W / 2, WORLD_H / 2, 90).stroke({ width: 2, color: 0x3a4a99, alpha: 0.45 });
    g.circle(WORLD_W / 2, WORLD_H / 2, 6).fill({ color: 0x3a4a99, alpha: 0.6 });
    g.moveTo(WORLD_W / 2, 40).lineTo(WORLD_W / 2, WORLD_H / 2 - 90).stroke({ width: 2, color: 0x3a4a99, alpha: 0.3 });
    g.moveTo(WORLD_W / 2, WORLD_H / 2 + 90).lineTo(WORLD_W / 2, WORLD_H - 40).stroke({ width: 2, color: 0x3a4a99, alpha: 0.3 });
  }

  private drawWalls(l: number, t: number, r: number, b: number, color: number): void {
    const g = this.wallG;
    g.clear();
    const w = r - l, h = b - t;
    // layered strokes = neon tube: wide faint halo -> bright thin core
    g.rect(l, t, w, h).stroke({ width: 26, color, alpha: 0.05 });
    g.rect(l, t, w, h).stroke({ width: 12, color, alpha: 0.12 });
    g.rect(l, t, w, h).stroke({ width: 5, color, alpha: 0.75 });
    g.rect(l, t, w, h).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
    // corner brackets
    const c = 46;
    const corners: [number, number, number, number][] = [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]];
    for (const [x, y, sx, sy] of corners) {
      g.moveTo(x + sx * c, y + sy * 8).lineTo(x + sx * 8, y + sy * 8).lineTo(x + sx * 8, y + sy * c)
        .stroke({ width: 3, color: mixColor(color, 0xffffff, 0.5), alpha: 0.9 });
    }
    // darken the out-of-bounds band (visible when walls close in during sudden death)
    const o = this.outside;
    o.clear();
    const B = BLEED;
    o.rect(-B, -B, WORLD_W + 2 * B, t + B).fill({ color: 0x000000, alpha: 0.55 });
    o.rect(-B, b, WORLD_W + 2 * B, WORLD_H - b + B).fill({ color: 0x000000, alpha: 0.55 });
    o.rect(-B, t, l + B, h).fill({ color: 0x000000, alpha: 0.55 });
    o.rect(r, t, WORLD_W - r + B, h).fill({ color: 0x000000, alpha: 0.55 });
  }

  /** `parX/parY`: where the action is relative to centre (world units) for parallax. */
  update(state: Readonly<MatchState>, dt: number, parX: number, parY: number): void {
    this.time += dt;
    const a = state.arena;
    if (a.left !== this.l || a.top !== this.t || a.right !== this.r || a.bottom !== this.b || state.suddenDeath !== this.sudden) {
      this.l = a.left; this.t = a.top; this.r = a.right; this.b = a.bottom; this.sudden = state.suddenDeath;
      this.drawWalls(a.left, a.top, a.right, a.bottom, state.suddenDeath ? FX.WALL_SUDDEN_DEATH : FX.WALL);
    }
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    const breathe = state.suddenDeath ? 0.25 * (0.5 + 0.5 * Math.sin(this.time * 6)) : 0.06 * Math.sin(this.time * 1.3);
    this.wallG.alpha = Math.min(1, 0.82 + breathe + this.pulse * 0.6);

    for (let i = 0; i < STARS; i++) {
      this.stars[i].alpha = this.starBase[i] * (0.7 + 0.3 * Math.sin(this.time * 1.7 + this.starPhase[i]));
    }
    const W = WORLD_W + BLEED * 2, H = WORLD_H + BLEED * 2;
    for (let i = 0; i < DUST; i++) {
      const s = this.dust[i];
      let x = s.position.x + this.dustV[i * 2] * dt, y = s.position.y + this.dustV[i * 2 + 1] * dt;
      if (x < -BLEED) x += W; else if (x > WORLD_W + BLEED) x -= W;
      if (y < -BLEED) y += H; else if (y > WORLD_H + BLEED) y -= H;
      s.position.set(x, y);
    }
    // parallax: far stars move least, dust most (opposite to where the action is)
    this.starLayer.position.set(-parX * 0.015, -parY * 0.015);
    this.dustLayer.position.set(-parX * 0.05, -parY * 0.05);
  }
}
