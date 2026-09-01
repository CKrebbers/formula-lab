// Auto-generated sliders for extracted params, with per-slider lock, reroll
// and automation (LFO / audio bands). Automation settings can be moved between
// params with ←/→ (a swap — nothing is ever lost). Slider moves only touch
// uniforms — never a recompile.

import { inferRange, reroll } from '../core/constants.js';
import { sliderStep, wheelZoomFactor, wheelNudge } from '../core/steps.js';
import {
  createAutomation, evaluate, nextMode, glideValue, swapAutomationSettings,
  extractGesture, MODE_ICONS, AUDIO_MODES,
} from '../core/automate.js';

const HISTORY_SECONDS = 30; // rolling take: capture-last-take reads from this

const GLIDE_SECONDS = 0.5; // discrete changes ease in — no visual jumps
const EDGE_EXTEND_FACTOR = 0.6;  // pushing an end grows the range by 60%
const EDGE_EXTEND_COOLDOWN = 350; // ms between ratchet steps while pinned

export class SliderPanel {
  /**
   * @param {HTMLElement} container
   * @param {(name: string, value: number) => void} onChange
   */
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.locks = {};
    this.rows = {};
    this.autos = {};
    this.glides = {};
    this.history = {}; // name → {t: [], v: []} rolling movement record
    this.lastT = 0;
    this.stepScale = 1; // fine 0.1 / ×1 / coarse 10 — see core/steps.js
  }

  /** One coarseness for drag, arrow keys, wheel-zoom and shift+wheel nudges. */
  setStepScale(scale) {
    this.stepScale = scale;
    for (const row of Object.values(this.rows)) {
      row.slider.step = sliderStep(row.range.min, row.range.max, scale);
    }
  }

  /** Rebuild the panel for a new set of params (locks & automation reset). */
  rebuild(params) {
    this.container.textContent = '';
    this.locks = {};
    this.rows = {};
    this.autos = {};
    this.glides = {};
    this.history = {};
    Object.entries(params).forEach(([name, value], index) => {
      this.locks[name] = false;
      this.autos[name] = createAutomation(value, index);
      this.container.appendChild(this.buildRow(name, value));
    });
  }

  buildRow(name, value) {
    const range = inferRange(value);
    const auto = this.autos[name];

    const row = document.createElement('div');
    row.className = 'slider-row';

    const label = document.createElement('span');
    label.className = 'slider-name';
    label.textContent = name;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = range.min;
    slider.max = range.max;
    slider.step = range.step;
    slider.value = value;

    const readout = document.createElement('span');
    readout.className = 'slider-value';
    readout.textContent = formatValue(value);

    // visible, living range bounds — they flash when a bound moves
    const minLabel = document.createElement('span');
    minLabel.className = 'range-bound';
    const maxLabel = document.createElement('span');
    maxLabel.className = 'range-bound';

    // shrink arrows: pull a bound halfway toward the current value per click
    const shrinkMin = document.createElement('button');
    shrinkMin.className = 'range-btn';
    shrinkMin.textContent = '»';
    shrinkMin.title = 'shorten: pull the minimum toward the current value (hold to repeat)';
    holdRepeat(shrinkMin, () => this.shrinkRange(name, 'min'));
    const shrinkMax = document.createElement('button');
    shrinkMax.className = 'range-btn';
    shrinkMax.textContent = '«';
    shrinkMax.title = 'shorten: pull the maximum toward the current value (hold to repeat)';
    holdRepeat(shrinkMax, () => this.shrinkRange(name, 'max'));

    const autoBtn = document.createElement('button');
    autoBtn.className = 'slider-btn';
    autoBtn.title = 'automation: off → sine → triangle → walk → ♪bass → ♪mid → ♪high';
    autoBtn.textContent = MODE_ICONS.off;

    const lock = document.createElement('button');
    lock.className = 'slider-btn';
    lock.title = 'lock (excluded from reroll & mutation, pauses automation)';
    lock.textContent = '○';

    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'slider-btn';
    rerollBtn.title = 'reroll: fresh random value in range';
    rerollBtn.textContent = '⟳';

    // sub-row with rate/depth + move buttons, shown while automation is active
    const autoRow = document.createElement('div');
    autoRow.className = 'auto-row';
    autoRow.hidden = true;
    const rateInput = miniRange(0, 2, 0.01, auto.rate, 'rate (Hz)');
    const depthInput = miniRange(0, 1, 0.01, auto.depth, 'depth (fraction of range)');
    const curveInput = miniRange(-1, 1, 0.01, auto.curve,
      'curve: left = blocky (dwells at extremes), center = linear, right = spiky (hugs the center)');
    rateInput.addEventListener('input', () => { auto.rate = parseFloat(rateInput.value); });
    depthInput.addEventListener('input', () => { auto.depth = parseFloat(depthInput.value); });
    curveInput.addEventListener('input', () => { auto.curve = parseFloat(curveInput.value); });
    const rateLabel = miniLabel('rate');

    const moveL = document.createElement('button');
    moveL.className = 'slider-btn';
    moveL.textContent = '←';
    moveL.title = 'move this automation to the previous param (swaps settings)';
    const moveR = document.createElement('button');
    moveR.className = 'slider-btn';
    moveR.textContent = '→';
    moveR.title = 'move this automation to the next param (swaps settings)';
    moveL.addEventListener('click', () => this.moveAutomation(name, -1));
    moveR.addEventListener('click', () => this.moveAutomation(name, 1));

    autoRow.append(rateLabel, rateInput, miniLabel('dep'), depthInput, miniLabel('crv'), curveInput, moveL, moveR);

    slider.addEventListener('input', () => {
      delete this.glides[name]; // dragging takes over: direct, no easing lag
      this.maybeExtendEdge(name); // pushing against an end grows the range
      const v = parseFloat(slider.value);
      auto.center = v; // manual position is the automation's center
      readout.textContent = formatValue(v);
      this.onChange(name, v);
    });

    // double-click: re-center the range tightly around the current value
    slider.addEventListener('dblclick', () => {
      const v = parseFloat(slider.value);
      const r = inferRange(v);
      this.setRange(name, r.min, r.max);
    });

    // scroll on the slider: zoom the range around the current value —
    // proportional to the actual wheel delta (a flick fires many events).
    // shift+scroll nudges the VALUE instead; both obey the step scale.
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = parseFloat(slider.value);
      const r = this.rows[name].range;
      if (e.shiftKey) {
        // trackpads report a horizontal delta while shift is held
        const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        const nv = v + wheelNudge(delta, r.min, r.max, this.stepScale);
        this.setValue(name, nv, { smooth: false });
        this.autos[name].center = parseFloat(slider.value);
        return;
      }
      const factor = wheelZoomFactor(e.deltaY, this.stepScale);
      const half = Math.max(1e-6, ((r.max - r.min) * factor) / 2);
      this.setRange(name, v - half, v + half);
    }, { passive: false });

    autoBtn.addEventListener('click', () => {
      auto.mode = nextMode(auto.mode, !!auto.gesture);
      auto.center = parseFloat(slider.value);
      this.refreshAutoUI(name);
      if (auto.mode === 'off') this.settle(name);
    });

    lock.addEventListener('click', () => {
      this.locks[name] = !this.locks[name];
      lock.textContent = this.locks[name] ? '●' : '○';
      rerollBtn.disabled = this.locks[name];
      row.classList.toggle('locked', this.locks[name]);
    });

    rerollBtn.addEventListener('click', () => {
      if (this.locks[name]) return;
      this.setValue(name, reroll(parseFloat(slider.value)));
    });

    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap';
    row.append(label, shrinkMin, minLabel, slider, maxLabel, shrinkMax, readout, autoBtn, lock, rerollBtn);
    wrap.append(row, autoRow);
    this.rows[name] = {
      slider, readout, range, lockBtn: lock,
      autoBtn, autoRow, rateInput, depthInput, curveInput, rateLabel, rowEl: row,
      minLabel, maxLabel, lastExtend: 0,
    };
    this.setRange(name, range.min, range.max); // sets bounds + tooltip
    return wrap;
  }

  /**
   * Live range bounds: the slider's extremes are movable, not sacred.
   * Everything reading ranges() (automation depth, glitch/mods clamps)
   * follows along because the range object mutates in place.
   */
  setRange(name, min, max) {
    const row = this.rows[name];
    if (!row || !(max > min)) return;
    row.range.min = min;
    row.range.max = max;
    row.range.step = (max - min) / 400;
    const v = parseFloat(row.slider.value);
    row.slider.min = min;
    row.slider.max = max;
    row.slider.step = sliderStep(min, max, this.stepScale);
    row.slider.value = Math.min(max, Math.max(min, v));
    row.slider.title = 'push an end to extend · double-click to re-center · scroll to zoom · shift+scroll to nudge';
    flashBound(row.minLabel, formatBound(min));
    flashBound(row.maxLabel, formatBound(max));
  }

  /**
   * Shrink one bound halfway toward the current value ("» «" arrows).
   * Repeat-clicking converges tightly around where the param sits now.
   */
  shrinkRange(name, side) {
    const row = this.rows[name];
    if (!row) return;
    const r = row.range;
    const v = parseFloat(row.slider.value);
    const minSpan = Math.max(1e-6, (r.max - r.min) * 0.02);
    if (side === 'min') {
      const newMin = Math.min(r.min + (v - r.min) * 0.65, v - minSpan);
      this.setRange(name, newMin, r.max);
    } else {
      const newMax = Math.max(r.max - (r.max - v) * 0.65, v + minSpan);
      this.setRange(name, r.min, newMax);
    }
  }

  /** Ratchet: while the thumb is pinned to an end, grow that side. */
  maybeExtendEdge(name) {
    const row = this.rows[name];
    const r = row.range;
    const v = parseFloat(row.slider.value);
    const now = performance.now();
    if (now - row.lastExtend < EDGE_EXTEND_COOLDOWN) return;
    const span = r.max - r.min;
    if (v >= r.max - r.step) {
      this.setRange(name, r.min, r.max + span * EDGE_EXTEND_FACTOR);
      row.lastExtend = now;
    } else if (v <= r.min + r.step) {
      this.setRange(name, r.min - span * EDGE_EXTEND_FACTOR, r.max);
      row.lastExtend = now;
    }
  }

  /** Sync one row's automation UI from its auto state. */
  refreshAutoUI(name) {
    const row = this.rows[name];
    const auto = this.autos[name];
    if (!row || !auto) return;
    row.autoBtn.textContent = MODE_ICONS[auto.mode];
    row.autoRow.hidden = auto.mode === 'off';
    row.rowEl.classList.toggle('automated', auto.mode !== 'off');
    row.rateInput.value = auto.rate;
    row.depthInput.value = auto.depth;
    row.curveInput.value = auto.curve ?? 0;
    const isAudio = AUDIO_MODES.includes(auto.mode);
    const isGesture = auto.mode === 'gesture';
    row.rateLabel.textContent = isGesture ? 'spd' : isAudio ? 'r↔h' : 'rate';
    row.rateInput.title = isGesture
      ? 'playback speed (1 = original tempo)'
      : isAudio
        ? 'focus: left = hardness (loudness level), right = rhythm (beat pulses)'
        : 'rate (Hz)';
  }

  /**
   * Capture-last-take (Logic Pro): turn each param's most recent stretch of
   * movement — drags, LFO, audio response, anything — into a looping
   * gesture automation. Returns how many params captured something.
   */
  captureAll() {
    let captured = 0;
    for (const name of Object.keys(this.rows)) {
      if (this.captureGesture(name)) captured++;
    }
    return captured;
  }

  captureGesture(name) {
    const h = this.history[name];
    const row = this.rows[name];
    if (!h || !row) return false;
    const minDelta = (row.range.max - row.range.min) * 0.002;
    const gesture = extractGesture(h.t, h.v, { minDelta });
    if (!gesture) return false;
    const auto = this.autos[name];
    auto.gesture = gesture;
    auto.mode = 'gesture';
    auto.rate = 1;  // original tempo
    auto.depth = 1; // original amplitude
    auto.center = gesture.mean;
    this.refreshAutoUI(name);
    return true;
  }

  /** Land a param back on its center (automation left or turned off). */
  settle(name) {
    const { slider, readout } = this.rows[name];
    const center = this.autos[name].center;
    slider.value = center;
    readout.textContent = formatValue(center);
    this.onChange(name, center);
  }

  /**
   * Move this param's automation to its neighbour (dir ±1, wraps). Settings
   * swap, so repeated presses walk a setup through every param.
   */
  moveAutomation(name, dir) {
    const names = Object.keys(this.rows);
    if (names.length < 2) return;
    const i = names.indexOf(name);
    const j = (i + dir + names.length) % names.length;
    const other = names[j];
    swapAutomationSettings(this.autos[name], this.autos[other]);
    this.autos[name].center = parseFloat(this.rows[name].slider.value);
    this.autos[other].center = parseFloat(this.rows[other].slider.value);
    this.refreshAutoUI(name);
    this.refreshAutoUI(other);
    if (this.autos[name].mode === 'off') this.settle(name);
    if (this.autos[other].mode === 'off') this.settle(other);
  }

  /**
   * Set a param from code (reroll, promote, snapshot load). Glides to the
   * target over GLIDE_SECONDS by default — no visual jumps.
   */
  setValue(name, v, { smooth = true } = {}) {
    const row = this.rows[name];
    if (!row) return;
    // a target outside the current range widens it (with 10% headroom)
    if (v < row.range.min || v > row.range.max) {
      const pad = (row.range.max - row.range.min) * 0.1;
      this.setRange(
        name,
        Math.min(row.range.min, v - pad),
        Math.max(row.range.max, v + pad)
      );
    }
    if (!smooth) {
      delete this.glides[name];
      row.slider.value = v;
      row.readout.textContent = formatValue(v);
      this.autos[name].center = v;
      this.onChange(name, v);
      return;
    }
    this.glides[name] = {
      from: parseFloat(row.slider.value),
      to: v,
      start: this.lastT,
      duration: GLIDE_SECONDS,
    };
  }

  /** Slider ranges per param (used by the glitch overlay for clamping). */
  ranges() {
    const out = {};
    for (const [name, { range }] of Object.entries(this.rows)) out[name] = range;
    return out;
  }

  /**
   * Where every param is HEADING (glide targets, not in-between values).
   * Snapshots, permalinks and mutation use this so a save mid-glide
   * captures intent, not a transition frame.
   */
  targetParams() {
    const out = {};
    for (const [name, { slider }] of Object.entries(this.rows)) {
      out[name] = this.glides[name] ? this.glides[name].to : parseFloat(slider.value);
    }
    return out;
  }

  /** Set a param's lock from code (snapshot load); reuses the button handler. */
  setLock(name, locked) {
    if (this.rows[name] && this.locks[name] !== !!locked) {
      this.rows[name].lockBtn.click();
    }
  }

  /** Reroll every unlocked param at once. */
  rerollAll() {
    for (const [name, { slider }] of Object.entries(this.rows)) {
      if (this.locks[name]) continue;
      this.setValue(name, reroll(parseFloat(slider.value)));
    }
  }

  /**
   * Advance glides + automation; call once per frame.
   * @param {number} t seconds
   * @param {object|null} [audio] live audio frame for ♪ modes (engine.tick())
   */
  tick(t, audio = null) {
    this.lastT = t;

    for (const [name, glide] of Object.entries(this.glides)) {
      const row = this.rows[name];
      if (!row) {
        delete this.glides[name];
        continue;
      }
      const v = glideValue(glide.from, glide.to, t - glide.start, glide.duration);
      this.autos[name].center = v; // an active LFO orbits the moving center
      if (this.autos[name].mode === 'off' || this.locks[name]) {
        row.slider.value = v;
        row.readout.textContent = formatValue(v);
        this.onChange(name, v);
      }
      if (t - glide.start >= glide.duration) delete this.glides[name];
    }

    for (const [name, auto] of Object.entries(this.autos)) {
      if (auto.mode === 'off' || this.locks[name]) continue;
      const { slider, readout, range } = this.rows[name];
      const v = evaluate(auto, range, t, audio);
      slider.value = v;
      readout.textContent = formatValue(v);
      this.onChange(name, v);
    }

    // rolling take: remember every param's motion for capture-last-take
    for (const [name, { slider }] of Object.entries(this.rows)) {
      const h = (this.history[name] ??= { t: [], v: [] });
      h.t.push(t);
      h.v.push(parseFloat(slider.value));
      while (h.t.length && h.t[0] < t - HISTORY_SECONDS) {
        h.t.shift();
        h.v.shift();
      }
    }
  }
}

/** Fire on press, then repeat while held (mouse or touch). */
function holdRepeat(btn, fn) {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    fn();
    timer = setInterval(fn, 140);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
}

function miniRange(min, max, step, value, title) {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  input.title = title;
  input.className = 'mini-range';
  return input;
}

function miniLabel(text) {
  const span = document.createElement('span');
  span.className = 'auto-label';
  span.textContent = text;
  return span;
}

function formatValue(v) {
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);
}

function formatBound(v) {
  const a = Math.abs(v);
  return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

/** Update a bound label and flash it green when the value changed. */
function flashBound(label, text) {
  if (label.textContent === text) return;
  const changed = label.textContent !== '';
  label.textContent = text;
  if (!changed) return;
  label.classList.add('flash');
  clearTimeout(label._flashTimer);
  label._flashTimer = setTimeout(() => label.classList.remove('flash'), 500);
}
