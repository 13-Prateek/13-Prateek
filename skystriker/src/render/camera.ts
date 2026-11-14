import { FX } from './palette';

/** Smooth pseudo-noise in -1..1 (sum of incommensurate sines). */
export function shakeNoise(t: number, seed: number): number {
  return (Math.sin(t * 13.1 + seed) + 0.6 * Math.sin(t * 23.7 + seed * 2.3 + 1.3) + 0.3 * Math.sin(t * 41.9 + seed * 3.7 + 2.1)) / 1.9;
}

/**
 * Trauma-based screen shake + zoom punch. Purely visual, renderer-side only.
 * offset = SHAKE_MAX * trauma² * noise(t), trauma decays linearly.
 */
export class CameraFx {
  trauma = 0;
  time = 0;
  zoom = 1;
  punch = 0;
  punchHold = 0;
  focusX = 800;
  focusY = 450;
  targetX = 800;
  targetY = 450;
  offsetX = 0;
  offsetY = 0;
  roll = 0;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Zoom toward (x, y) by `amount` (e.g. 0.05 = 5%), optionally held for `hold` seconds. */
  zoomPunch(amount: number, x: number, y: number, hold = 0): void {
    if (amount >= this.punch * 0.8) {
      this.targetX = x;
      this.targetY = y;
    }
    this.punch = Math.max(this.punch, amount);
    this.punchHold = Math.max(this.punchHold, hold);
  }

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - FX.SHAKE_DECAY * dt);
    const t2 = this.trauma * this.trauma;
    this.offsetX = FX.SHAKE_MAX * t2 * shakeNoise(this.time, 1.7);
    this.offsetY = FX.SHAKE_MAX * t2 * shakeNoise(this.time, 5.3);
    this.roll = FX.SHAKE_ROLL * t2 * shakeNoise(this.time, 9.1);
    if (this.punchHold > 0) this.punchHold -= dt;
    else this.punch *= Math.exp(-7 * dt);
    if (this.punch < 0.0005) this.punch = 0;
    // focus eases toward the punch target, and back to centre when the punch is gone
    const k = 1 - Math.exp(-14 * dt);
    const tx = this.punch > 0 ? this.targetX : 800, ty = this.punch > 0 ? this.targetY : 450;
    this.focusX += (tx - this.focusX) * k;
    this.focusY += (ty - this.focusY) * k;
    this.zoom = 1 + this.punch;
  }
}
