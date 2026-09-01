// Camera motion, the pure part: a luminance frame in, {level, pulse} out —
// the same envelope shape the audio bands have, so a slider that follows
// ♪bass can follow ◉cam with no new code. No DOM: the camera module feeds it.

const ATTACK_S = 0.05;   // motion is felt at once
const RELEASE_S = 0.4;   // and lets go slowly enough to not flicker
const PULSE_DECAY_S = 0.25;
const GAIN = 6;          // mean |Δlum| of a waving hand is ~0.05..0.15 → ~0.3..0.9

/** Mean absolute luminance difference between two frames (0..1). */
export function frameDifference(lum, prevLum) {
  if (!prevLum || prevLum.length !== lum.length || !lum.length) return 0;
  let sum = 0;
  for (let i = 0; i < lum.length; i++) sum += Math.abs(lum[i] - prevLum[i]);
  return sum / lum.length;
}

/** RGBA bytes → luminance 0..1 per pixel. */
export function luminance(rgba, out) {
  const n = rgba.length / 4;
  const lum = out && out.length === n ? out : new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    lum[i] = (rgba[j] * 0.2126 + rgba[j + 1] * 0.7152 + rgba[j + 2] * 0.0722) / 255;
  }
  return lum;
}

export class MotionEnvelope {
  constructor() {
    this.level = 0;
    this.pulse = 0;
    this.avg = 0.02; // running mean of raw motion, for onset detection
    this.lastT = null;
  }

  /**
   * @param {number} motion raw frame difference (frameDifference())
   * @param {number} t seconds
   * @returns {{level: number, pulse: number}}
   */
  tick(motion, t) {
    const dt = this.lastT === null ? 1 / 30 : Math.max(1e-3, t - this.lastT);
    this.lastT = t;
    const energy = Math.min(1, motion * GAIN);
    const coef = energy > this.level ? 1 - Math.exp(-dt / ATTACK_S) : 1 - Math.exp(-dt / RELEASE_S);
    this.level += (energy - this.level) * coef;
    // onset: motion well above its own recent average spikes the pulse
    const onset = motion - this.avg;
    if (onset > 0) this.pulse = Math.min(1, Math.max(this.pulse, onset / (this.avg * 3 + 0.01)));
    this.pulse *= Math.exp(-dt / PULSE_DECAY_S);
    this.avg += (motion - this.avg) * Math.min(1, dt / 1.5);
    return { level: this.level, pulse: this.pulse };
  }
}
