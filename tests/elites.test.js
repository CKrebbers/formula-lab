import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { cellOf, ElitesGrid, GRID_SIZE } from '../src/search/elites.js';
import { Explorer } from '../src/search/explore.js';
import { createSnapshot } from '../src/store/snapshot.js';
import { FAMILIES } from '../src/families/index.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

function snapWith(stats) {
  const snap = createSnapshot({
    source: 'sin(x + t)',
    ast: parse('sin(x + t)'),
    origin: 'sample',
  });
  snap.stats = { ...snap.stats, ...stats };
  return snap;
}

describe('elites: cellOf', () => {
  it('bins stats into the 10×10 grid, clamped', () => {
    expect(cellOf({ entropy: 0, symmetry: 0 })).toBe('0,0');
    expect(cellOf({ entropy: 0.55, symmetry: 0.92 })).toBe('5,9');
    expect(cellOf({ entropy: 1, symmetry: 1.3 })).toBe('9,9');
    expect(cellOf({ entropy: -0.2, symmetry: 0.999 })).toBe('0,9');
  });
});

describe('elites: grid', () => {
  it('places into empty cells, replaces only on higher fitness', () => {
    const grid = new ElitesGrid(mockStorage());
    const a = snapWith({ entropy: 0.5, symmetry: 0.5 });
    const b = snapWith({ entropy: 0.52, symmetry: 0.55 }); // same cell 5,5

    expect(grid.consider(a, 0.4)).toEqual({ placed: true, cell: '5,5', replaced: false });
    expect(grid.consider(b, 0.3)).toEqual({ placed: false, cell: '5,5', replaced: false });
    expect(grid.get('5,5').snapshot.id).toBe(a.id);
    expect(grid.consider(b, 0.9)).toEqual({ placed: true, cell: '5,5', replaced: true });
    expect(grid.get('5,5').snapshot.id).toBe(b.id);
    expect(grid.count()).toBe(1);
  });

  it('persists and reloads', () => {
    const storage = mockStorage();
    const grid = new ElitesGrid(storage);
    grid.consider(snapWith({ entropy: 0.15, symmetry: 0.85 }), 0.5);
    const reloaded = new ElitesGrid(storage);
    expect(reloaded.count()).toBe(1);
    expect(reloaded.get('1,8').fitness).toBe(0.5);
  });

  it('survives corrupt storage and drops invalid entries', () => {
    const storage = mockStorage();
    storage.setItem('formula-lab.elites.v1', '{broken');
    expect(new ElitesGrid(storage).count()).toBe(0);
    storage.setItem('formula-lab.elites.v1', JSON.stringify({ '3,3': { fitness: 'x', snapshot: {} } }));
    expect(new ElitesGrid(storage).count()).toBe(0);
  });
});

describe('explorer', () => {
  function makeExplorer(evaluate, rng = Math.random) {
    return new Explorer({ families: FAMILIES, evaluate, rng });
  }

  const okEval = async () => ({
    stats: { entropy: 0.5, edge_density: 0.2, color_variance: 0.1, symmetry: 0.6, spectral_flatness: 0.1 },
    thumb: '',
    novelty: 0.5,
  });

  it('every strategy yields a parseable source', async () => {
    const grid = new ElitesGrid(mockStorage());
    for (let i = 0; i < 12; i++) grid.consider(snapWith({ entropy: i / 15, symmetry: 0.5 }), 0.5);
    const explorer = makeExplorer(okEval);
    for (const strategy of ['mutate', 'crossover', 'family', 'birth']) {
      let accepted = 0;
      for (let i = 0; i < 10; i++) {
        const res = await explorer.step({
          elites: grid, fallbackSource: 'sin(x + t)', fallbackCoords: 'cartesian',
          forceStrategy: strategy,
        });
        if (!res.accepted) continue;
        accepted++;
        expect(() => parse(res.source), `${strategy}: ${res.source}`).not.toThrow();
        expect(['mutate', 'crossover', 'family', 'sample']).toContain(res.origin);
        expect(['cartesian', 'polar', 'toroidal']).toContain(res.coords);
      }
      expect(accepted, strategy).toBeGreaterThan(0);
    }
  });

  it('rejected evaluations come back accepted:false and count as tried', async () => {
    const explorer = makeExplorer(async () => null);
    const res = await explorer.step({
      elites: new ElitesGrid(mockStorage()),
      fallbackSource: 'sin(x + t)', fallbackCoords: 'cartesian', forceStrategy: 'birth',
    });
    expect(res.accepted).toBe(false);
    expect(explorer.tried).toBe(1);
    expect(explorer.found).toBe(0);
  });

  it('cold start favors family/birth; warm grid favors mutate/crossover', () => {
    const explorer = makeExplorer(okEval, () => 0.5);
    expect(explorer.pickStrategy(0)).toBe('birth');   // r=0.5 in cold table
    expect(explorer.pickStrategy(50)).toBe('mutate'); // r=0.5 in warm table
  });

  it('crossover records both parent ids', async () => {
    const grid = new ElitesGrid(mockStorage());
    grid.consider(snapWith({ entropy: 0.2, symmetry: 0.5 }), 0.5);
    grid.consider(snapWith({ entropy: 0.8, symmetry: 0.5 }), 0.5);
    const explorer = makeExplorer(okEval);
    for (let i = 0; i < 20; i++) {
      const res = await explorer.step({
        elites: grid, fallbackSource: 'x', fallbackCoords: 'cartesian', forceStrategy: 'crossover',
      });
      if (res.accepted) {
        expect(res.parentIds).toHaveLength(2);
        return;
      }
    }
    throw new Error('crossover never produced a child');
  });
});
