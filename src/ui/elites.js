// MAP-Elites grid panel: 10×10 cells, entropy → (left to right),
// symmetry ↑ (bottom to top). Filled cells show the elite's thumb;
// click loads it into the main view.

import { GRID_SIZE } from '../search/elites.js';

export class ElitesPanel {
  /**
   * @param {HTMLElement} container
   * @param {(snapshot: object) => void} onPick
   */
  constructor(container, onPick) {
    this.container = container;
    this.onPick = onPick;
    this.cells = {};
    this.build();
  }

  build() {
    this.container.textContent = '';
    const label = document.createElement('div');
    label.className = 'elites-label';
    label.textContent = 'elites — entropy → · symmetry ↑';
    this.container.appendChild(label);

    const gridEl = document.createElement('div');
    gridEl.className = 'elites-grid';
    for (let row = GRID_SIZE - 1; row >= 0; row--) { // high symmetry on top
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = document.createElement('div');
        cell.className = 'elite-cell';
        gridEl.appendChild(cell);
        this.cells[`${col},${row}`] = cell;
      }
    }
    this.container.appendChild(gridEl);
  }

  /** @param {import('../search/elites.js').ElitesGrid} grid */
  refresh(grid) {
    for (const [key, el] of Object.entries(this.cells)) {
      const entry = grid.get(key);
      el.classList.toggle('filled', !!entry);
      el.style.backgroundImage = entry ? `url(${entry.snapshot.thumb})` : '';
      el.title = entry
        ? `${entry.snapshot.formula.source}\n${entry.snapshot.origin} · novelty ${entry.fitness.toFixed(3)}`
        : `empty (entropy ${key.split(',')[0]}/10, symmetry ${key.split(',')[1]}/10)`;
      el.onclick = entry ? () => this.onPick(entry.snapshot) : null;
    }
  }
}
