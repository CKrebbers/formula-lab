// Glitch engine: short random bursts that spike parameters and snap back.
// It's a RENDER-TIME OVERLAY — base params (sliders, LFO centers, saves) are
// never touched, so recovery is always exact. Chaos (0..1) scales burst
// frequency, spread, spike size and per-frame rejitter. Deliberately bypasses
// the glide system: a glitch is supposed to tear.
// Pure + injectable rng — testable in Node.

export class GlitchEngine {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.active = false;
    this.chaos = 0.3;
    this.rate = 1; // burst-frequency multiplier (0..2)
    this.burst = null;
    this.lastT = 0;
  }

  start() { this.active = true; }
  stop() { this.active = false; this.burst = null; }
  setChaos(c) { this.chaos = Math.min(1, Math.max(0, c)); }
  setRate(r) { this.rate = Math.min(2, Math.max(0, r)); }

  /**
   * Per-frame overlay.
   * @param {number} t seconds
   * @param {Record<string, number>} baseParams
   * @param {Record<string, {min: number, max: number}>} ranges
   * @returns {{ params: Record<string, number>, coords: number|null, glitching: boolean }}
   */
  tick(t, baseParams, ranges) {
    const dt = Math.min(0.1, Math.max(0.001, t - this.lastT));
    this.lastT = t;
    const clean = { params: baseParams, coords: null, glitching: false };
    if (!this.active || this.chaos === 0) {
      this.burst = null;
      return clean;
    }

    if (this.burst && t >= this.burst.until) this.burst = null; // snap back

    if (!this.burst) {
      // Poisson-ish onset: at chaos 0.5, rate 1, roughly one burst every ~1.3s
      const chance = this.chaos * 1.2 * dt * (0.3 + this.rate);
      if (this.rng() >= chance) return clean;
      this.burst = this.makeBurst(t, baseParams, ranges);
    }

    const burst = this.burst;
    // rejitter: at high chaos the spikes re-randomize while the burst lasts
    if (this.rng() < this.chaos * 0.7) {
      burst.offsets = this.makeOffsets(baseParams, ranges);
    }

    const params = { ...baseParams };
    for (const [name, offset] of Object.entries(burst.offsets)) {
      const range = ranges[name];
      if (!range) continue;
      params[name] = Math.min(range.max, Math.max(range.min, baseParams[name] + offset));
    }
    return { params, coords: burst.coords, glitching: true };
  }

  makeBurst(t, baseParams, ranges) {
    const duration = 0.03 + this.rng() * 0.25 * (0.4 + this.chaos);
    return {
      until: t + duration,
      offsets: this.makeOffsets(baseParams, ranges),
      // at high chaos a burst may briefly flip the coordinate system
      coords: this.rng() < this.chaos * 0.25 ? Math.floor(this.rng() * 3) : null,
    };
  }

  makeOffsets(baseParams, ranges) {
    const offsets = {};
    for (const name of Object.keys(baseParams)) {
      // each param joins with probability scaling on chaos (always ≥ one try)
      if (this.rng() > 0.25 + this.chaos * 0.65) continue;
      const range = ranges[name];
      if (!range) continue;
      const span = range.max - range.min;
      const sign = this.rng() < 0.5 ? -1 : 1;
      // heavy tail: mostly small nudges, occasionally a full-throw spike
      const mag = this.rng() < this.chaos * 0.15
        ? span * 0.5
        : Math.pow(this.rng(), 2.5) * span * this.chaos * 0.6;
      offsets[name] = sign * mag;
    }
    return offsets;
  }
}
