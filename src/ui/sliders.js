// Auto-generated sliders for extracted params, with per-slider lock, reroll
// and automation (LFO). Slider moves only touch uniforms — never a recompile.

import { inferRange, reroll } from '../core/constants.js';
import { createAutomation, evaluate, nextMode, glideValue, MODE_ICONS, AUDIO_MODES } from '../core/automate.js';

const GLIDE_SECONDS = 0.5; // discrete changes ease in — no visual jumps

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

    const autoBtn = document.createElement('button');
    autoBtn.className = 'slider-btn';
    autoBtn.title = 'automation: off → sine → triangle → walk';
    autoBtn.textContent = MODE_ICONS.off;

    const lock = document.createElement('button');
    lock.className = 'slider-btn';
    lock.title = 'lock (excluded from reroll & mutation, pauses automation)';
    lock.textContent = '○';

    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'slider-btn';
    rerollBtn.title = 'reroll: fresh random value in range';
    rerollBtn.textContent = '⟳';

    // sub-row with rate/depth, shown while automation is active
    const autoRow = document.createElement('div');
    autoRow.className = 'auto-row';
    autoRow.hidden = true;
    const rate = miniRange(0, 2, 0.01, auto.rate, 'rate (Hz)');
    const depth = miniRange(0, 1, 0.01, auto.depth, 'depth (fraction of range)');
    rate.addEventListener('input', () => { auto.rate = parseFloat(rate.value); });
    depth.addEventListener('input', () => { auto.depth = parseFloat(depth.value); });
    const rateLabel = miniLabel('rate');
    autoRow.append(rateLabel, rate, miniLabel('depth'), depth);

    slider.addEventListener('input', () => {
      delete this.glides[name]; // dragging takes over: direct, no easing lag
      const v = parseFloat(slider.value);
      auto.center = v; // manual position is the automation's center
      readout.textContent = formatValue(v);
      this.onChange(name, v);
    });

    autoBtn.addEventListener('click', () => {
      auto.mode = nextMode(auto.mode);
      auto.center = parseFloat(slider.value);
      autoBtn.textContent = MODE_ICONS[auto.mode];
      autoRow.hidden = auto.mode === 'off';
      row.classList.toggle('automated', auto.mode !== 'off');
      const isAudio = AUDIO_MODES.includes(auto.mode);
      rateLabel.textContent = isAudio ? 'r↔h' : 'rate';
      rate.title = isAudio
        ? 'focus: left = hardness (loudness level), right = rhythm (beat pulses)'
        : 'rate (Hz)';
      if (auto.mode === 'off') {
        // settle back on the center so the param doesn't freeze mid-swing
        slider.value = auto.center;
        readout.textContent = formatValue(auto.center);
        this.onChange(name, auto.center);
      }
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
    row.append(label, slider, readout, autoBtn, lock, rerollBtn);
    wrap.append(row, autoRow);
    this.rows[name] = { slider, readout, range, lockBtn: lock };
    return wrap;
  }

  /** Set a param's lock from code (snapshot load); reuses the button handler. */
  setLock(name, locked) {
    if (this.rows[name] && this.locks[name] !== !!locked) {
      this.rows[name].lockBtn.click();
    }
  }

  /**
   * Set a param from code (reroll, promote, snapshot load). Glides to the
   * target over GLIDE_SECONDS by default — no visual jumps.
   */
  setValue(name, v, { smooth = true } = {}) {
    const row = this.rows[name];
    if (!row) return;
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
