import { describe, it, expect } from 'vitest';
import { frameDifference, luminance, MotionEnvelope } from '../src/core/motion.js';

describe('motion: frame difference', () => {
  it('is 0 for identical frames and without a previous frame', () => {
    const a = new Float32Array([0.1, 0.5, 0.9]);
    expect(frameDifference(a, a)).toBe(0);
    expect(frameDifference(a, null)).toBe(0);
    expect(frameDifference(a, new Float32Array(2))).toBe(0);
  });

  it('is the mean absolute change', () => {
    const a = new Float32Array([0, 0, 0, 0]);
    const b = new Float32Array([1, 0, 0.5, 0]);
    expect(frameDifference(b, a)).toBeCloseTo(0.375);
  });

  it('luminance maps RGBA bytes to 0..1 with Rec.709 weights', () => {
    const lum = luminance(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]));
    expect(lum[0]).toBeCloseTo(1);
    expect(lum[1]).toBe(0);
  });
});

describe('motion: envelope', () => {
  it('rises fast on motion, releases slowly, decays to rest', () => {
    const env = new MotionEnvelope();
    let t = 0;
    for (let i = 0; i < 30; i++) env.tick(0, (t += 1 / 30)); // still camera
    expect(env.level).toBeLessThan(0.01);
    const moving = env.tick(0.15, (t += 1 / 30));
    expect(moving.level).toBeGreaterThan(0.3);
    expect(moving.pulse).toBeGreaterThan(0.5); // onset above the quiet average
    const afterOne = env.tick(0, (t += 1 / 30)).level;
    expect(afterOne).toBeLessThan(moving.level);
    expect(afterOne).toBeGreaterThan(moving.level * 0.8); // release is slow
    for (let i = 0; i < 90; i++) env.tick(0, (t += 1 / 30));
    expect(env.level).toBeLessThan(0.05);
    expect(env.pulse).toBeLessThan(0.01);
  });

  it('constant motion stops pulsing but keeps level', () => {
    const env = new MotionEnvelope();
    let t = 0;
    let last;
    for (let i = 0; i < 150; i++) last = env.tick(0.1, (t += 1 / 30));
    expect(last.level).toBeGreaterThan(0.5);
    expect(last.pulse).toBeLessThan(0.05);
  });

  it('never exceeds 1', () => {
    const env = new MotionEnvelope();
    let t = 0;
    for (let i = 0; i < 20; i++) {
      const { level, pulse } = env.tick(5, (t += 1 / 30));
      expect(level).toBeLessThanOrEqual(1);
      expect(pulse).toBeLessThanOrEqual(1);
    }
  });
});
