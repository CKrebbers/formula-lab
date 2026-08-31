// Auto-generated sliders for extracted params, with per-slider lock, reroll
// and automation (LFO / audio bands). Automation settings can be moved between
// params with ←/→ (a swap — nothing is ever lost). Slider moves only touch
// uniforms — never a recompile.

import { inferRange, reroll } from '../core/constants.js';
import {
  createAutomation, evaluate, nextMode, glideValue, swapAutomationSettings,
  MODE_ICONS, AUDIO_MODES,
} from '../core/automate.js';

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
    this.lastT = 0;
  }

  /** Rebuild the panel for a new set of params (locks & automation reset). */
  rebuild(params) {
    this.container.textContent = '';
    this.locks = {};
    this.rows = {};
    this.autos = {};
    this.glides = {};
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

    // scroll on the slider: zoom the range in/out around the current value
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = parseFloat(slider.value);
      const r = this.rows[name].range;
      const half = ((r.max - r.min) * (e.deltaY > 0 ? 1.25 : 0.8)) / 2;
      this.setRange(name, v - half, v + half);
    }, { passive: false });

    autoBtn.addEventListener('click', () => {
      auto.mode = nextMode(auto.mode);
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
    row.append(label, minLabel, slider, maxLabel, readout, autoBtn, lock, rerollBtn);
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
    row.slider.step = row.range.step;
    row.slider.value = Math.min(max, Math.max(min, v));
    row.slider.title = 'push an end to extend · double-click to re-center · scroll to zoom';
    flashBound(row.minLabel, formatBound(min));
    flashBound(row.maxLabel, formatBound(max));
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
    row.rateLabel.textContent = isAudio ? 'r↔h' : 'rate';
    row.rateInput.title = isAudio
      ? 'focus: left = hardness (loudness level), right = rhythm (beat pulses)'
      : 'rate (Hz)';
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
  }
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
