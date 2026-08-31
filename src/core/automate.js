// Per-param automation (LFO): pure math, no DOM — testable in Node.
// A param oscillates around its slider position (center); depth is a fraction
// of the slider range, rate is in Hz. 'walk' is a deterministic pseudo-random
// drift (layered incommensurate sines), so it needs no RNG state.

export const MODES = ['off', 'sine', 'tri', 'walk', 'bass', 'mid', 'high'];

export const AUDIO_MODES = ['bass', 'mid', 'high'];

export const MODE_ICONS = {
  off: '·', sine: '∿', tri: '△', walk: '≈',
  bass: '♪b', mid: '♪m', high: '♪h',
};

export function nextMode(mode) {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

/**
 * @param {number} center — current slider value; the automation orbits it
 * @param {number} index — param index, used to de-sync phases (golden ratio steps)
 */
export function createAutomation(center, index = 0) {
  // rate and depth both start at 0: enabling an LFO changes nothing until
  // you raise them — no surprise motion (Clay, 2026-08-31)
  return { mode: 'off', rate: 0, depth: 0, phase: index * 0.381966, center };
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
  if (AUDIO_MODES.includes(auto.mode)) {
    const band = audio?.[auto.mode];
    if (!band) return auto.center;
    const focus = Math.min(1, Math.max(0, auto.rate / 2));
    const signal = band.level * (1 - focus) + band.pulse * focus;
    v = auto.center + amp * signal;
  } else {
    v = auto.center + amp * wave(auto.mode, t * auto.rate + auto.phase);
  }
  return Math.min(range.max, Math.max(range.min, v));
}
