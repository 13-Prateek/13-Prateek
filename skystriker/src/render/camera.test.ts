import { describe, expect, it } from 'vitest';
import { CameraFx, shakeNoise } from './camera';
import { FX } from './palette';

describe('screen shake (trauma model)', () => {
  it('caps trauma at 1 and decays it to zero', () => {
    const c = new CameraFx();
    c.addTrauma(0.7); c.addTrauma(0.7);
    expect(c.trauma).toBe(1);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(c.trauma).toBe(0);
    expect(Math.abs(c.offsetX)).toBe(0);
    expect(Math.abs(c.offsetY)).toBe(0);
  });

  it('never exceeds SHAKE_MAX and scales with trauma squared', () => {
    const c = new CameraFx();
    let peakBig = 0;
    for (let i = 0; i < 30; i++) { c.trauma = 1; c.update(1 / 60); peakBig = Math.max(peakBig, Math.abs(c.offsetX), Math.abs(c.offsetY)); }
    const d = new CameraFx();
    let peakSmall = 0;
    for (let i = 0; i < 30; i++) { d.trauma = 0.3; d.update(1 / 60); peakSmall = Math.max(peakSmall, Math.abs(d.offsetX), Math.abs(d.offsetY)); }
    expect(peakBig).toBeLessThanOrEqual(FX.SHAKE_MAX);
    expect(peakSmall).toBeLessThan(peakBig * 0.2);
  });

  it('noise is smooth and bounded', () => {
    let prev = shakeNoise(0, 1);
    for (let t = 0.001; t < 3; t += 0.001) {
      const n = shakeNoise(t, 1);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
      expect(Math.abs(n - prev)).toBeLessThan(0.1);
      prev = n;
    }
  });

  it('zoom punch peaks then returns to 1, focus returns to centre', () => {
    const c = new CameraFx();
    c.zoomPunch(0.1, 200, 100);
    c.update(1 / 60);
    expect(c.zoom).toBeGreaterThan(1.05);
    for (let i = 0; i < 240; i++) c.update(1 / 60);
    expect(c.zoom).toBe(1);
    expect(c.focusX).toBeCloseTo(800, 0);
    expect(c.focusY).toBeCloseTo(450, 0);
  });

  it('held punch stays zoomed for the hold time', () => {
    const c = new CameraFx();
    c.zoomPunch(0.16, 900, 450, 0.5);
    for (let i = 0; i < 24; i++) c.update(1 / 60); // 0.4 s
    expect(c.zoom).toBeCloseTo(1.16);
  });
});
