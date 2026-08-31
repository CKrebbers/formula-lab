// Second settings panel: the modulator rack. Every algorithmic manipulator
// with on/off + amount + rate — compose exactly the controls you need now.

export class ModsPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('../core/modulators.js').ModStack} stack
   * @param {(id: string, active: boolean) => void} onToggle — for external
   *   mirrors (the quick gl!tch button in the main bar)
   */
  constructor(container, stack, onToggle = () => {}) {
    this.container = container;
    this.stack = stack;
    this.onToggle = onToggle;
    this.rows = {};
    this.build();
  }

  build() {
    this.container.textContent = '';
    const label = document.createElement('div');
    label.className = 'mods-label';
    label.textContent = 'modulators — algorithmic parameter manipulation';
    this.container.appendChild(label);

    for (const mod of this.stack.mods) {
      const row = document.createElement('div');
      row.className = 'mod-row';
      row.title = mod.hint;

      const toggle = document.createElement('button');
      toggle.className = 'slider-btn mod-toggle';
      toggle.textContent = mod.name;

      const amount = miniRange(0, 1, 0.01, mod.amount, 'amount');
      const rate = miniRange(0, 2, 0.01, mod.rate, 'rate');

      toggle.addEventListener('click', () => {
        this.stack.toggle(mod.id);
        this.refresh();
        this.onToggle(mod.id, mod.active);
      });
      amount.addEventListener('input', () => this.stack.set(mod.id, 'amount', parseFloat(amount.value)));
      rate.addEventListener('input', () => this.stack.set(mod.id, 'rate', parseFloat(rate.value)));

      row.append(toggle, miniLabel('amt'), amount, miniLabel('rate'), rate);
      this.container.appendChild(row);
      this.rows[mod.id] = { toggle, amount, rate, row };
    }
  }

  /** Reflect stack state (called after toggles from anywhere). */
  refresh() {
    for (const mod of this.stack.mods) {
      const row = this.rows[mod.id];
      if (!row) continue;
      row.toggle.classList.toggle('active', mod.active);
      row.row.classList.toggle('mod-active', mod.active);
      row.amount.value = mod.amount;
      row.rate.value = mod.rate;
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
