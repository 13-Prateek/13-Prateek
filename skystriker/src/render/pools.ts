import { Container, Sprite, type Texture } from 'pixi.js';

/**
 * Fixed-size pools. Everything is preallocated; spawning and updating never
 * allocate. When a pool is full the oldest live item is recycled.
 */

/** Index free-list + active list shared by both pools. */
class Slots {
  readonly active: Int32Array;
  count = 0;
  private readonly free: Int32Array;
  private freeTop: number;
  private readonly where: Int32Array; // slot -> index in active list (or -1)
  private ring = 0;

  constructor(readonly size: number) {
    this.active = new Int32Array(size);
    this.free = new Int32Array(size);
    this.where = new Int32Array(size).fill(-1);
    for (let i = 0; i < size; i++) this.free[i] = size - 1 - i;
    this.freeTop = size;
  }

  /** Returns a slot index; recycles a live one if the pool is exhausted. */
  take(): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else {
      // pool exhausted: steal a slot round-robin (it is already in the active list)
      i = this.active[this.ring++ % this.count];
      return i;
    }
    this.where[i] = this.count;
    this.active[this.count++] = i;
    return i;
  }

  release(i: number): void {
    const w = this.where[i];
    if (w < 0) return;
    const last = this.active[--this.count];
    this.active[w] = last;
    this.where[last] = w;
    this.where[i] = -1;
    this.free[this.freeTop++] = i;
  }
}

export const enum PKind { Dot = 0, Streak = 1 }

/** Physics particles: dots and velocity-aligned streaks. Additive blend. */
export class ParticlePool {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly slots: Slots;
  private readonly x: Float32Array; private readonly y: Float32Array;
  private readonly vx: Float32Array; private readonly vy: Float32Array;
  private readonly life: Float32Array; private readonly max: Float32Array;
  private readonly s0: Float32Array; private readonly s1: Float32Array;
  private readonly drag: Float32Array; private readonly a0: Float32Array;
  private readonly kind: Uint8Array;

  constructor(size: number, private readonly dotTex: Texture, private readonly streakTex: Texture) {
    this.slots = new Slots(size);
    const f = () => new Float32Array(size);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.life = f(); this.max = f();
    this.s0 = f(); this.s1 = f(); this.drag = f(); this.a0 = f();
    this.kind = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const s = new Sprite(dotTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.sprites.push(s);
      this.container.addChild(s);
    }
  }

  get liveCount(): number { return this.slots.count; }

  spawn(kind: PKind, x: number, y: number, vx: number, vy: number, life: number,
    size0: number, size1: number, color: number, drag = 2, alpha = 1): void {
    const i = this.slots.take();
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = 0; this.max[i] = life; this.s0[i] = size0; this.s1[i] = size1;
    this.drag[i] = drag; this.a0[i] = alpha; this.kind[i] = kind;
    const s = this.sprites[i];
    s.texture = kind === PKind.Streak ? this.streakTex : this.dotTex;
    s.tint = color;
    s.visible = true;
    s.rotation = 0;
    this.place(i, 0);
  }

  private place(i: number, t: number): void {
    const s = this.sprites[i];
    const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
    s.position.set(this.x[i], this.y[i]);
    s.alpha = this.a0[i] * (1 - t * t);
    if (this.kind[i] === PKind.Streak) {
      const vx = this.vx[i], vy = this.vy[i];
      const sp = Math.sqrt(vx * vx + vy * vy);
      s.rotation = Math.atan2(vy, vx);
      s.scale.set((size * (0.8 + sp / 260)) / 64, (size * 0.45) / 8);
    } else {
      s.scale.set(size / 128);
    }
  }

  update(dt: number): void {
    const act = this.slots.active;
    for (let k = this.slots.count - 1; k >= 0; k--) {
      const i = act[k];
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        this.sprites[i].visible = false;
        this.slots.release(i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] *= d;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.place(i, this.life[i] / this.max[i]);
    }
  }

  clear(): void {
    const act = this.slots.active;
    for (let k = this.slots.count - 1; k >= 0; k--) {
      this.sprites[act[k]].visible = false;
      this.slots.release(act[k]);
    }
  }
}

/** Tweened one-shot sprites: rings, flashes, swooshes, decals, wall glows. */
export class TweenPool {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly slots: Slots;
  private readonly life: Float32Array; private readonly max: Float32Array; private readonly delay: Float32Array;
  private readonly sx0: Float32Array; private readonly sy0: Float32Array;
  private readonly sx1: Float32Array; private readonly sy1: Float32Array;
  private readonly a0: Float32Array; private readonly a1: Float32Array;
  private readonly spin: Float32Array;
  private readonly easePow: Float32Array;

  constructor(size: number, blend: 'add' | 'normal' = 'add') {
    this.slots = new Slots(size);
    const f = () => new Float32Array(size);
    this.life = f(); this.max = f(); this.delay = f();
    this.sx0 = f(); this.sy0 = f(); this.sx1 = f(); this.sy1 = f();
    this.a0 = f(); this.a1 = f(); this.spin = f(); this.easePow = f();
    for (let i = 0; i < size; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.blendMode = blend;
      s.visible = false;
      this.sprites.push(s);
      this.container.addChild(s);
    }
  }

  get liveCount(): number { return this.slots.count; }

  /**
   * Scale goes sx0→sx1 / sy0→sy1 (in texture-relative units) with ease-out of power `ease`,
   * alpha goes a0→a1 linearly. `delay` seconds before it appears.
   */
  spawn(texture: Texture, x: number, y: number, rotation: number, sx0: number, sy0: number,
    sx1: number, sy1: number, a0: number, a1: number, life: number, color: number,
    ease = 3, delay = 0, spin = 0): Sprite {
    const i = this.slots.take();
    const s = this.sprites[i];
    s.texture = texture;
    s.position.set(x, y);
    s.rotation = rotation;
    s.tint = color;
    this.life[i] = 0; this.max[i] = life; this.delay[i] = delay;
    this.sx0[i] = sx0; this.sy0[i] = sy0; this.sx1[i] = sx1; this.sy1[i] = sy1;
    this.a0[i] = a0; this.a1[i] = a1; this.spin[i] = spin; this.easePow[i] = ease;
    s.visible = delay <= 0;
    s.scale.set(sx0, sy0);
    s.alpha = a0;
    return s;
  }

  update(dt: number): void {
    const act = this.slots.active;
    for (let k = this.slots.count - 1; k >= 0; k--) {
      const i = act[k];
      const s = this.sprites[i];
      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        if (this.delay[i] > 0) continue;
        s.visible = true;
      }
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        s.visible = false;
        this.slots.release(i);
        continue;
      }
      const t = this.life[i] / this.max[i];
      const e = 1 - Math.pow(1 - t, this.easePow[i]);
      s.scale.set(this.sx0[i] + (this.sx1[i] - this.sx0[i]) * e, this.sy0[i] + (this.sy1[i] - this.sy0[i]) * e);
      s.alpha = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
      s.rotation += this.spin[i] * dt;
    }
  }

  clear(): void {
    const act = this.slots.active;
    for (let k = this.slots.count - 1; k >= 0; k--) {
      this.sprites[act[k]].visible = false;
      this.slots.release(act[k]);
    }
  }
}
