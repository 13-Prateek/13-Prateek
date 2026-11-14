import { Container, Sprite } from 'pixi.js';
import { BALL_LIVE_MIN_SPEED } from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { BallState, MatchState } from '../shared/types';
import { ELEMENT_COLOR, ELEMENT_COLOR_2, FX, mixColor } from './palette';
import { PKind, type ParticlePool } from './pools';
import { rnd, rrange } from './rng';
import type { FxTextures } from './textures';

const HIST = 64;

/**
 * The ball. Readable from colour alone:
 *  - neutral: calm white core, soft breathing glow, no trail
 *  - live: owner's hero colour glow + danger ring + speed-scaled trail
 *  - element: element colour + element particles
 * Squash on bounce / kick, stretch with speed, a spinning seam shows spin.
 */
export class BallView {
  readonly trailLayer = new Container();
  readonly root = new Container();
  private readonly body = new Container();
  private readonly glow: Sprite;
  private readonly ring: Sprite;
  private readonly core: Sprite;
  private readonly seam: Sprite;
  private readonly holdRing: Sprite;
  private readonly heatHalo: Sprite;
  private readonly heatPips: Sprite[] = [];
  private heatPulse = 0;
  private heatSparkAcc = 0;
  private heatNow = 0;
  private readonly trail: Sprite[] = [];
  private readonly hx = new Float32Array(HIST);
  private readonly hy = new Float32Array(HIST);
  private readonly ht = new Float32Array(HIST);
  private head = 0;
  private filled = 0;
  private time = 0;
  private seamAngle = 0;
  private squash = 0;
  private squashAngle = 0;
  private squashT = 9;
  private partAcc = 0;
  private colorNow = 0xffffff;
  /** Seconds of white flash on the ball (kick / perfect). */
  flash = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;

  constructor(tx: FxTextures, private readonly parts: ParticlePool) {
    for (let i = 0; i < FX.TRAIL_POINTS; i++) {
      const s = new Sprite(tx.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.trail.push(s);
      this.trailLayer.addChild(s);
    }
    this.glow = new Sprite(tx.glow);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.ring = new Sprite(tx.ring);
    this.ring.anchor.set(0.5);
    this.ring.blendMode = 'add';
    this.holdRing = new Sprite(tx.ring);
    this.holdRing.anchor.set(0.5);
    this.holdRing.blendMode = 'add';
    this.core = new Sprite(tx.disc);
    this.core.anchor.set(0.5);
    this.seam = new Sprite(tx.limb);
    this.seam.anchor.set(0.5);
    this.heatHalo = new Sprite(tx.ringSoft);
    this.heatHalo.anchor.set(0.5);
    this.heatHalo.blendMode = 'add';
    this.heatHalo.visible = false;
    this.body.addChild(this.core, this.seam);
    this.root.addChild(this.heatHalo, this.glow, this.ring, this.holdRing, this.body);
    // heat pips: one small orbiting spark per heat level (count readable at a glance)
    for (let i = 0; i < FX.HEAT_MAX; i++) {
      const p = new Sprite(tx.disc);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p.visible = false;
      this.heatPips.push(p);
      this.root.addChild(p);
    }
  }

  /** Squash along `nx, ny` (a wall normal or kick direction), amount 0..1. */
  impact(nx: number, ny: number, amount: number): void {
    this.squash = Math.min(1, amount);
    this.squashAngle = Math.atan2(ny, nx);
    this.squashT = 0;
  }

  resetTrail(): void { this.filled = 0; }

  /** Glow surge when heat goes up (set by VFX on the `heat` event). */
  heatUp(): void { this.heatPulse = 1; }

  /** Current drawn heat level (0..HEAT_MAX). */
  get heat(): number { return this.heatNow; }

  private ownerColor(b: BallState, state: Readonly<MatchState>): number {
    if (b.element && (b.mode !== 'neutral')) return ELEMENT_COLOR[b.element];
    if (b.mode === 'neutral' || b.owner === null) return 0xffffff;
    return HEROES[state.fighters[b.owner].heroId].color;
  }

  update(prev: BallState, b: BallState, alpha: number, state: Readonly<MatchState>, dt: number, fxDt: number, frozen: boolean): void {
    this.time += dt;
    const x = prev.pos.x + (b.pos.x - prev.pos.x) * alpha;
    const y = prev.pos.y + (b.pos.y - prev.pos.y) * alpha;
    // a big jump (round reset / respawn) must not draw a trail across the arena
    if (this.filled > 0 && Math.abs(x - this.x) + Math.abs(y - this.y) > 400) this.filled = 0;
    this.x = x; this.y = y;
    this.vx = b.vel.x; this.vy = b.vel.y;
    const speed = Math.hypot(b.vel.x, b.vel.y);
    const live = b.mode !== 'neutral';
    const col = this.ownerColor(b, state);
    this.colorNow = col;
    this.flash = Math.max(0, this.flash - dt);
    this.heatPulse = Math.max(0, this.heatPulse - dt * 3);
    // rally heat: owner colour stays on the ring; glow + trail shift toward white-gold as it rises
    const heat = live ? Math.max(0, Math.min(FX.HEAT_MAX, Math.round(b.heat ?? 0))) : 0;
    this.heatNow = heat;
    const hot = heat > 0 ? mixColor(col, FX.HEAT_COLOR, 0.07 * heat) : col;
    const flicker = heat >= FX.HEAT_MAX ? 1 + 0.1 * Math.sin(this.time * 47) * Math.sin(this.time * 13) : 1;

    // history for the trail (real time so the trail freezes in hitstop)
    if (!frozen) {
      this.head = (this.head + 1) % HIST;
      this.hx[this.head] = x; this.hy[this.head] = y; this.ht[this.head] = this.time;
      this.filled = Math.min(HIST, this.filled + 1);
    } else {
      this.hx[this.head] = x; this.hy[this.head] = y;
    }

    this.root.position.set(x, y);
    const r = b.radius;

    /* glow + ring */
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 2.2);
    if (live) {
      this.glow.tint = hot;
      this.glow.alpha = Math.min(1, 0.75 + 0.05 * heat + 0.25 * this.heatPulse);
      this.glow.scale.set((r * (6.5 + 0.9 * heat + 3 * this.heatPulse) * flicker) / 128);
      this.ring.visible = true;
      this.ring.tint = col;
      const rp = 0.5 + 0.5 * Math.sin(this.time * (18 + 7 * heat));
      this.ring.alpha = 0.55 + 0.35 * rp;
      this.ring.scale.set((r * 2 * (1.45 + 0.1 * rp + 0.08 * heat)) / 256);
    } else {
      this.glow.tint = 0xdfe8ff;
      this.glow.alpha = 0.3 + 0.12 * breathe;
      this.glow.scale.set((r * (4.2 + 0.4 * breathe)) / 128);
      this.ring.visible = false;
    }
    if (b.mode === 'super') this.glow.scale.set((r * 9) / 128);

    /* heat halo (heat 2+) and orbiting pips */
    if (heat >= 2) {
      this.heatHalo.visible = true;
      this.heatHalo.tint = col; // owner colour: whose ball it is stays readable even at max heat
      this.heatHalo.alpha = (0.22 * (heat - 1)) * (0.75 + 0.25 * Math.sin(this.time * 9)) * flicker;
      this.heatHalo.scale.set((r * 2 * (2.4 + 0.5 * heat)) / 256);
      this.heatHalo.rotation += dt * 2;
    } else this.heatHalo.visible = false;
    const orbit = r * (2.3 + 0.12 * heat);
    const spin = this.time * (3 + 1.5 * heat);
    for (let i = 0; i < FX.HEAT_MAX; i++) {
      const p = this.heatPips[i];
      if (i >= heat) { p.visible = false; continue; }
      const a = spin + (i * Math.PI * 2) / heat;
      p.visible = true;
      p.position.set(Math.cos(a) * orbit, Math.sin(a) * orbit);
      p.tint = heat >= FX.HEAT_MAX ? 0xffffff : FX.HEAT_COLOR;
      p.scale.set((heat >= FX.HEAT_MAX ? 12 : 10) / 60);
    }

    /* hold ring while trapped */
    if (b.heldBy !== null) {
      this.holdRing.visible = true;
      this.holdRing.tint = HEROES[state.fighters[b.heldBy].heroId].color;
      this.holdRing.rotation += dt * 4;
      this.holdRing.alpha = 0.7;
      this.holdRing.scale.set((r * 2 * 1.8) / 256, (r * 2 * 1.6) / 256);
    } else this.holdRing.visible = false;

    /* core: white centre tinted toward owner colour when live */
    this.core.tint = this.flash > 0 ? 0xffffff : live ? mixColor(col, 0xffffff, 0.55) : 0xffffff;
    this.core.scale.set((r * 2) / 60);
    this.seam.tint = live ? col : 0x9aa6c8;
    this.seam.scale.set((r * 1.5) / this.seam.texture.width, 3 / 12);
    if (!frozen) this.seamAngle += ((speed / r) * 0.5 * (b.spin < 0 ? -1 : 1) + b.spin * 2) * dt;
    this.seam.rotation = this.seamAngle;

    /* squash (spring) or stretch along velocity */
    if (!frozen) this.squashT += dt;
    const sq = this.squashT < 0.4 ? this.squash * Math.exp(-this.squashT * 11) * Math.cos(this.squashT * 30) : 0;
    if (Math.abs(sq) > 0.02) {
      this.body.rotation = this.squashAngle;
      this.body.scale.set(1 - 0.38 * sq, 1 + 0.26 * sq);
      this.seam.rotation = this.seamAngle - this.squashAngle;
    } else {
      const st = Math.min(0.3, speed / 2600 * 0.32);
      this.body.rotation = Math.atan2(b.vel.y, b.vel.x);
      this.body.scale.set(1 + st, 1 - st * 0.45);
      this.seam.rotation = this.seamAngle - this.body.rotation;
    }

    /* trail: points sampled back in time, so its length grows with speed */
    const strength = live ? Math.min(1, 0.12 * heat + Math.max(0.15, (speed - BALL_LIVE_MIN_SPEED * 0.5) / (FX.TRAIL_FULL_SPEED - BALL_LIVE_MIN_SPEED * 0.5))) : 0;
    const trailSize = 1 + 0.13 * heat;
    let k = this.head, steps = 0;
    for (let i = 0; i < FX.TRAIL_POINTS; i++) {
      const s = this.trail[i];
      if (strength <= 0 || this.filled < 2) { s.visible = false; continue; }
      const target = this.time - (i + 1) * FX.TRAIL_SPACING;
      // walk back through history until we bracket `target`
      while (steps < this.filled - 1 && this.ht[(k - 1 + HIST) % HIST] > target) { k = (k - 1 + HIST) % HIST; steps++; }
      if (steps >= this.filled - 1) { s.visible = false; continue; }
      const k0 = (k - 1 + HIST) % HIST;
      const t0 = this.ht[k0], t1 = this.ht[k];
      const u = t1 > t0 ? Math.max(0, Math.min(1, (target - t0) / (t1 - t0))) : 0;
      const px = this.hx[k0] + (this.hx[k] - this.hx[k0]) * u;
      const py = this.hy[k0] + (this.hy[k] - this.hy[k0]) * u;
      const f = 1 - i / FX.TRAIL_POINTS;
      s.visible = true;
      s.position.set(px, py);
      // hot head of the trail grows with heat (white-gold), tail keeps the owner colour
      s.tint = i < 2 ? mixColor(hot, 0xffffff, 0.3) : i < 2 + heat * 2 ? hot : col;
      s.alpha = strength * f * 0.85;
      s.scale.set((r * 2.6 * (0.35 + 0.65 * f) * trailSize) / 128 * 1.6);
    }

    /* element particles from the ball */
    if (live && b.element && !frozen) {
      this.partAcc += fxDt * (b.mode === 'super' ? 90 : 45);
      const e = b.element;
      while (this.partAcc >= 1) {
        this.partAcc -= 1;
        const c = rnd() < 0.5 ? ELEMENT_COLOR[e] : ELEMENT_COLOR_2[e];
        const ox = rrange(-r, r), oy = rrange(-r, r);
        const bvx = -b.vel.x * 0.15, bvy = -b.vel.y * 0.15;
        if (e === 'fire') this.parts.spawn(PKind.Dot, x + ox, y + oy, bvx + rrange(-60, 60), bvy + rrange(-60, 60), rrange(0.25, 0.45), rrange(14, 22), 3, c, 2.5, 0.9);
        else if (e === 'frost') this.parts.spawn(PKind.Streak, x + ox, y + oy, bvx + rrange(-120, 120), bvy + rrange(-120, 120), 0.35, 9, 3, c, 3, 1);
        else if (e === 'volt') this.parts.spawn(PKind.Streak, x + ox * 1.5, y + oy * 1.5, rrange(-500, 500), rrange(-500, 500), 0.08, 10, 6, c, 0, 1);
        else this.parts.spawn(PKind.Dot, x + ox, y + oy, bvx * 0.5 + rrange(-30, 30), bvy * 0.5 + rrange(-30, 30), 0.6, rrange(10, 16), 18, c, 1.5, 0.5);
      }
    } else this.partAcc = 0;

    /* heat 3+: the ball sheds hot sparks */
    if (heat >= 3 && !frozen) {
      this.heatSparkAcc += fxDt * (heat >= FX.HEAT_MAX ? 70 : 25);
      while (this.heatSparkAcc >= 1) {
        this.heatSparkAcc -= 1;
        const a = rrange(0, 6.283);
        const sp = rrange(80, 260);
        this.parts.spawn(PKind.Streak, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a) * sp - b.vel.x * 0.2, Math.sin(a) * sp - b.vel.y * 0.2,
          rrange(0.15, 0.3), rrange(8, 13), 3, rnd() < 0.5 ? hot : col, 3, 1);
      }
    } else this.heatSparkAcc = 0;
  }

  get color(): number { return this.colorNow; }
}
