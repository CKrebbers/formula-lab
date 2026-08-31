// Auto-generated sliders for extracted params, with per-slider lock + reroll.
// Slider moves only touch uniforms — never a shader recompile.

import { inferRange, reroll } from '../core/constants.js';

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
  }

  /** Rebuild the panel for a new set of params (locks reset). */
  rebuild(params) {
    this.container.textContent = '';
    this.locks = {};
    this.rows = {};
    for (const [name, value] of Object.entries(params)) {
      this.locks[name] = false;
      this.container.appendChild(this.buildRow(name, value));
    }
  }

  buildRow(name, value) {
    const range = inferRange(value);
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

    const lock = document.createElement('button');
    lock.className = 'slider-btn';
    lock.title = 'lock (excluded from reroll & mutation)';
    lock.textContent = '○';

    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'slider-btn';
    rerollBtn.title = 'reroll: fresh random value in range';
    rerollBtn.textContent = '⟳';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      readout.textContent = formatValue(v);
      this.onChange(name, v);
    });

    lock.addEventListener('click', () => {
      this.locks[name] = !this.locks[name];
      lock.textContent = this.locks[name] ? '●' : '○';
      rerollBtn.disabled = this.locks[name];
      row.classList.toggle('locked', this.locks[name]);
    });

    rerollBtn.addEventListener('click', () => {
      if (this.locks[name]) return;
      const v = reroll(parseFloat(slider.value));
      slider.value = v;
      readout.textContent = formatValue(v);
      this.onChange(name, v);
    });

    row.append(label, slider, readout, lock, rerollBtn);
    this.rows[name] = { slider, readout };
    return row;
  }

  /** Reroll every unlocked param at once. */
  rerollAll() {
    for (const [name, { slider, readout }] of Object.entries(this.rows)) {
      if (this.locks[name]) continue;
      const v = reroll(parseFloat(slider.value));
      slider.value = v;
      readout.textContent = formatValue(v);
      this.onChange(name, v);
    }
  }
}

function formatValue(v) {
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);
}
