import { describe, it, expect } from 'vitest';
import {
  STEP_SCALES, STEP_LABELS, stepIndex, sliderStep, wheelZoomFactor, wheelNudge,
} from '../src/core/steps.js';

describe('step scale', () => {
  it('has one label per scale and ×1 in the middle', () => {
    expect(STEP_SCALES.length).toBe(STEP_LABELS.length);
    expect(STEP_SCALES[1]).toBe(1);
  });

  it('cycles without wrapping', () => {
    expect(stepIndex(1, 1)).toBe(2);
    expect(stepIndex(2, 1)).toBe(2);
    expect(stepIndex(0, -1)).toBe(0);
  });

  it('slider step scales with the mode and never hits zero', () => {
    expect(sliderStep(0, 4, 1)).toBeCloseTo(0.01);
    expect(sliderStep(0, 4, 0.1)).toBeCloseTo(0.001);
    expect(sliderStep(0, 4, 10)).toBeCloseTo(0.1);
    expect(sliderStep(1, 1, 1)).toBeGreaterThan(0);
  });

  it('wheel zoom is symmetric, direction-true and clamped', () => {
    const inF = wheelZoomFactor(-40, 1);
    const outF = wheelZoomFactor(40, 1);
    expect(inF).toBeLessThan(1);
    expect(outF).toBeGreaterThan(1);
    expect(inF * outF).toBeCloseTo(1, 6);
    expect(wheelZoomFactor(5000, 1)).toBeCloseTo(1.15);
    expect(wheelZoomFactor(-5000, 1)).toBeCloseTo(1 / 1.15);
  });

  it('fine zooms slower than coarse for the same flick', () => {
    const fine = Math.abs(Math.log(wheelZoomFactor(30, 0.1)));
    const one = Math.abs(Math.log(wheelZoomFactor(30, 1)));
    const coarse = Math.abs(Math.log(wheelZoomFactor(30, 10)));
    expect(fine).toBeLessThan(one);
    expect(one).toBeLessThan(coarse);
  });

  it('nudge: 100 px = 1 % of range at ×1, down lowers, capped at 10 %', () => {
    expect(wheelNudge(100, 0, 10, 1)).toBeCloseTo(-0.1);
    expect(wheelNudge(-100, 0, 10, 1)).toBeCloseTo(0.1);
    expect(wheelNudge(100, 0, 10, 0.1)).toBeCloseTo(-0.01);
    expect(wheelNudge(-100000, 0, 10, 1)).toBeCloseTo(1);
    expect(wheelNudge(-100000, 0, 10, 10)).toBeCloseTo(10);
  });
});
