// Per-param automation (LFO): pure math, no DOM — testable in Node.
// A param oscillates around its slider position (center); depth is a fraction
// of the slider range, rate is in Hz. 'walk' is a deterministic pseudo-random
// drift (layered incommensurate sines), so it needs no RNG state.

export const MODES = ['off', 'sine', 'tri', 'walk', 'bass', 'mid', 'high'];

export const AUDIO_MODES = ['bass', 'mid', 'high'];

export const MODE_ICONS = {
  off: '·', sine: '∿', tri: '△', walk: '≈',
  bass: '♪b', mid: '♪m', high: '♪h',
  gesture: '↺',
};

/** 'gesture' joins the cycle only when a captured gesture exists. */
export function nextMode(mode, hasGesture = false) {
  const cycle = hasGesture ? [...MODES, 'gesture'] : MODES;
  const i = cycle.indexOf(mode);
  return cycle[(i + 1) % cycle.length];
}

/**
 * @param {number} center — current slider value; the automation orbits it
 * @param {number} index — param index, used to de-sync phases (golden ratio steps)
 */
export function createAutomation(center, index = 0) {
  // rate and depth both start at 0: enabling an LFO changes nothing until
  // you raise them — no surprise motion (Clay, 2026-08-31)
  return { mode: 'off', rate: 0, depth: 0, curve: 0, phase: index * 0.381966, center };
}

/**
 * Curve-shape a signal like DAW automation curves. curve ∈ -1..1:
 *   0 = linear · negative = blocky, dwells at the extremes ·
 *   positive = spiky, hugs the center with short excursions.
 * Sign-preserving power curve; ±1 endpoints stay put.
 */
export function shape(v, curve = 0) {
  if (!curve) return v;
  const k = Math.pow(4, curve); // -1..1 → exponent 0.25..4
  return Math.sign(v) * Math.pow(Math.abs(v), k);
}

/**
 * Swap automation SETTINGS (mode, rate, depth) between two params.
 * center and phase stay with their own param — the setting moves,
 * the parameter keeps its position and de-sync.
 */
export function swapAutomationSettings(a, b) {
  for (const key of ['mode', 'rate', 'depth', 'curve', 'gesture']) {
    [a[key], b[key]] = [b[key], a[key]];
  }
}

/**
 * Capture-last-take (Logic Pro style): find the most recent stretch of
 * MOVEMENT in a recorded (time, value) history and turn it into a loopable
 * gesture. The window ends at the last movement and extends backwards until
 * a still gap of `maxGap` seconds. Returns null when nothing moved.
 *
 * @param {number[]} times seconds, ascending
 * @param {number[]} values same length
 * @returns {{ wave: number[], duration: number, amp: number, mean: number } | null}
 *   wave: `samples` points normalized to -1..1 around the mean
 */
export function extractGesture(times, values, {
  minDelta = 0.001, maxGap = 1.0, minDuration = 0.25, samples = 128,
} = {}) {
  const n = values.length;
  if (n < 4) return null;

  let end = -1;
  for (let i = n - 1; i > 0; i--) {
    if (Math.abs(values[i] - values[i - 1]) > minDelta) { end = i; break; }
  }
  if (end < 0) return null;

  let start = end;
  let lastMotionT = times[end];
  for (let i = end - 1; i > 0; i--) {
    if (Math.abs(values[i] - values[i - 1]) > minDelta) {
      lastMotionT = times[i];
      start = i - 1;
    } else if (lastMotionT - times[i] > maxGap) {
      break;
    }
  }

  const duration = times[end] - times[start];
  if (duration < minDuration) return null;

  // uniform resample of the window
  const resampled = new Array(samples);
  let p = start;
  for (let k = 0; k < samples; k++) {
    const tt = times[start] + (duration * k) / (samples - 1);
    while (p < end && times[p + 1] <= tt) p++;
    const span = times[p + 1] - times[p];
    const f = span > 0 ? (tt - times[p]) / span : 0;
    resampled[k] = values[p] + (values[Math.min(p + 1, end)] - values[p]) * Math.min(1, f);
  }

  const mean = resampled.reduce((s, v) => s + v, 0) / samples;
  let amp = 0;
  for (const v of resampled) amp = Math.max(amp, Math.abs(v - mean));
  if (amp < minDelta) return null;

  return {
    wave: resampled.map((v) => (v - mean) / amp),
    duration,
    amp,
    mean,
  };
}

/** Waveform in cycles → −1..1. */
function wave(mode, x) {
  switch (mode) {
    case 'sine':
      return Math.sin(x * 2 * Math.PI);
    case 'tri': {
      const f = x - Math.floor(x);
      return 4 * Math.abs(f - 0.5) - 1;
    }
    case 'walk':
      // three incommensurate frequencies — never repeats audibly, sums to ≤1
      return 0.5 * Math.sin(x * 2 * Math.PI)
        + 0.35 * Math.sin(x * 2 * Math.PI * 2.618 + 1.7)
        + 0.15 * Math.sin(x * 2 * Math.PI * 5.236 + 4.2);
    default:
      return 0;
  }
}

/**
 * Ease-in-out glide between two values — every discrete param change
 * (reroll, promote, snapshot load) moves smoothly instead of jumping.
 */
export function glideValue(from, to, elapsed, duration) {
  if (duration <= 0 || elapsed >= duration) return to;
  const k = Math.max(0, elapsed / duration);
  const s = k * k * (3 - 2 * k); // smoothstep
  return from + (to - from) * s;
}

/**
 * Value of an automated param at time t (seconds), clamped to the slider range.
 * Audio modes (bass/mid/high) read the live audio frame instead of a wave:
 * the rate knob becomes the FOCUS morph (0 = hardness/level, 2 = rhythm/beat
 * pulse) and the signal pushes upward from the center (silence = center).
 * @param {{mode: string, rate: number, depth: number, phase: number, center: number}} auto
 * @param {{min: number, max: number}} range
 * @param {number} t
 * @param {{bass: {level, pulse}, mid: {level, pulse}, high: {level, pulse}} | null} [audio]
 */
export function evaluate(auto, range, t, audio = null) {
  if (auto.mode === 'off') return auto.center;
  const amp = auto.depth * (range.max - range.min) / 2;
  let v;
  if (auto.mode === 'gesture') {
    const g = auto.gesture;
    if (!g || !g.wave.length || g.duration <= 0) return auto.center;
    // rate = playback speed (1 = original tempo), depth = amplitude scale
    const phase = ((t * auto.rate) % g.duration + g.duration) % g.duration;
    const pos = (phase / g.duration) * (g.wave.length - 1);
    const i = Math.floor(pos);
    const j = Math.min(i + 1, g.wave.length - 1);
    const w = g.wave[i] + (g.wave[j] - g.wave[i]) * (pos - i);
    v = auto.center + g.amp * auto.depth * shape(w, auto.curve);
  } else if (AUDIO_MODES.includes(auto.mode)) {
    const band = audio?.[auto.mode];
    if (!band) return auto.center;
    const focus = Math.min(1, Math.max(0, auto.rate / 2));
    const signal = band.level * (1 - focus) + band.pulse * focus;
    v = auto.center + amp * shape(signal, auto.curve);
  } else {
    v = auto.center + amp * shape(wave(auto.mode, t * auto.rate + auto.phase), auto.curve);
  }
  return Math.min(range.max, Math.max(range.min, v));
}
