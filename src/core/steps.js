// Step scale: one knob for how coarse every slider gesture is. It multiplies
// drag granularity, arrow-key steps, wheel-zoom speed and shift+wheel nudges,
// so "fine" and "coarse" mean the same thing everywhere. Pure — no DOM.

export const STEP_SCALES = [0.1, 1, 10];
export const STEP_LABELS = ['fine', '×1', 'coarse'];

/** Cycle index by direction, clamped (no wrap: coarse stays coarse). */
export function stepIndex(index, dir) {
  return Math.min(STEP_SCALES.length - 1, Math.max(0, index + dir));
}

/** Slider `step` attribute: 1/400 of the range at ×1. */
export function sliderStep(min, max, scale) {
  return Math.max(1e-9, ((max - min) / 400) * scale);
}

/**
 * Wheel → range zoom factor. Proportional to the real delta (a flick fires
 * many events), clamped per event so one violent tick cannot collapse or
 * explode the range; the clamp widens with the scale.
 */
export function wheelZoomFactor(deltaY, scale) {
  const cap = 1 + 0.15 * scale;
  const factor = Math.pow(1.0015, deltaY * scale);
  return Math.min(cap, Math.max(1 / cap, factor));
}

/**
 * Shift+wheel → value nudge. 100 px of wheel moves 1 % of the range at ×1;
 * scrolling down lowers the value. Capped at 10 % of the range per event.
 */
export function wheelNudge(deltaY, min, max, scale) {
  const span = max - min;
  const cap = span * 0.1 * scale;
  const d = -(deltaY / 100) * span * 0.01 * scale;
  return Math.min(cap, Math.max(-cap, d));
}
