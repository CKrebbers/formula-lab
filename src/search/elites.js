// MAP-Elites grid (v3): axes entropy × symmetry, 10×10 cells. Each cell keeps
// one snapshot; a newcomer takes the cell only with higher fitness (novelty at
// insert — machine finds have no rating; see DECISIONS.md). Pure + injectable
// storage, testable in Node.

import { validateSnapshot, migrate } from '../store/snapshot.js';

export const GRID_SIZE = 10;
const KEY = 'formula-lab.elites.v1';

/** Stats → "x,y" cell key. x = entropy, y = symmetry, both clamped to 0..1. */
export function cellOf(stats, grid = GRID_SIZE) {
  const bin = (v) => Math.min(grid - 1, Math.max(0, Math.floor(v * grid)));
  return `${bin(stats.entropy)},${bin(stats.symmetry)}`;
}

export class ElitesGrid {
  /** @param {{getItem(k): string|null, setItem(k, v): void}} storage */
  constructor(storage, grid = GRID_SIZE) {
    this.storage = storage;
    this.grid = grid;
    this.cells = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(this.storage.getItem(KEY) || '{}');
      const cells = {};
      for (const [cell, entry] of Object.entries(raw)) {
        if (!entry || typeof entry.fitness !== 'number') continue;
        try {
          const snapshot = migrate(entry.snapshot);
          if (validateSnapshot(snapshot).ok) cells[cell] = { ...entry, snapshot };
        } catch {
          continue;
        }
      }
      return cells;
    } catch {
      return {};
    }
  }

  persist() {
    this.storage.setItem(KEY, JSON.stringify(this.cells));
  }

  get(cell) {
    return this.cells[cell] ?? null;
  }

  count() {
    return Object.keys(this.cells).length;
  }

  /** @returns {{cell: string, snapshot: object, fitness: number}[]} */
  all() {
    return Object.entries(this.cells).map(([cell, e]) => ({ cell, ...e }));
  }

  /**
   * Offer a candidate to the grid.
   * @param {object} snapshot
   * @param {number} fitness — what the cell is won on (AV novelty, ADR #42)
   * @param {object} [detail] — the parts that made it (novelty, audioNovelty),
   *   kept beside the fitness so the grid can say WHY a cell was won
   * @returns {{ placed: boolean, cell: string, replaced: boolean }}
   */
  consider(snapshot, fitness, detail = {}) {
    const cell = cellOf(snapshot.stats, this.grid);
    const existing = this.cells[cell];
    if (existing && existing.fitness >= fitness) {
      return { placed: false, cell, replaced: false };
    }
    this.cells[cell] = { ...detail, snapshot, fitness };
    this.persist();
    return { placed: true, cell, replaced: !!existing };
  }

  clear() {
    this.cells = {};
    this.persist();
  }
}
