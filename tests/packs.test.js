import { describe, it, expect } from 'vitest';
import { FamilyPacks, validateFamily } from '../src/families/packs.js';
import { buildFamilyPrompt } from '../src/families/prompt.js';
import { parse } from '../src/core/parser.js';
import { createSnapshot } from '../src/store/snapshot.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

const GOOD_PACK = JSON.stringify({
  name: 'Test Spirits',
  families: [
    { name: 'A', source: 'sin(4.0 * x * y + t)', coords: 'polar', notes: 'n' },
    { name: 'B', source: 'worley(x * 3.0, y * 3.0 + t * 0.2) * 2.0 - 1.0' },
    { name: 'C', source: 'vec2(sin(y * 3.0 + t), cos(x * 2.0))', coords: 'toroidal' },
  ],
});

describe('family packs', () => {
  it('validateFamily runs the full compile pipeline', () => {
    expect(validateFamily({ source: 'sin(x + t)' }).ok).toBe(true);
    expect(validateFamily({ source: 'evil(x)' }).ok).toBe(false);
    expect(validateFamily({ source: 'sin(x)', coords: 'spherical' }).ok).toBe(false);
    expect(validateFamily({}).ok).toBe(false);
  });

  it('imports a pack, fills ids, enables it, persists', () => {
    const storage = mockStorage();
    const packs = new FamilyPacks(storage);
    const { pack, added, rejected } = packs.importJSON(GOOD_PACK);
    expect(added).toBe(3);
    expect(rejected).toEqual([]);
    expect(pack.id).toBe('test-spirits');
    expect(pack.families[0].id).toBe('test-spirits.1');
    expect(pack.families[0].coords).toBe('polar');
    expect(pack.families[1].coords).toBe('cartesian'); // default
    expect(packs.enabledFamilies()).toHaveLength(3);

    const reloaded = new FamilyPacks(storage);
    expect(reloaded.enabledFamilies()).toHaveLength(3);
  });

  it('drops invalid formulas but keeps the pack; all-invalid throws', () => {
    const packs = new FamilyPacks(mockStorage());
    const mixed = JSON.stringify({
      name: 'mixed',
      families: [
        { source: 'sin(x + t)' },
        { source: 'blorp(x)' },
      ],
    });
    const { added, rejected } = packs.importJSON(mixed);
    expect(added).toBe(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].error).toContain('blorp');

    expect(() => packs.importJSON('{"name":"bad","families":[{"source":"nope("}]}'))
      .toThrow(/failed/);
    expect(() => packs.importJSON('{"name":"empty"}')).toThrow(/no families/);
  });

  it('accepts a bare array and de-duplicates pack ids', () => {
    const packs = new FamilyPacks(mockStorage());
    packs.importJSON(GOOD_PACK);
    const again = packs.importJSON(GOOD_PACK); // same name → new id
    expect(again.pack.id).not.toBe('test-spirits');
    const bare = packs.importJSON('[{"source": "cos(x * 2.0 - t)"}]');
    expect(bare.added).toBe(1);
    expect(packs.list()).toHaveLength(3);
  });

  it('toggle removes families from the enabled pool; remove deletes', () => {
    const packs = new FamilyPacks(mockStorage());
    packs.importJSON(GOOD_PACK);
    packs.toggle('test-spirits');
    expect(packs.enabledFamilies()).toHaveLength(0);
    packs.toggle('test-spirits');
    expect(packs.enabledFamilies()).toHaveLength(3);
    packs.remove('test-spirits');
    expect(packs.list()).toHaveLength(0);
  });
});

describe('family prompt', () => {
  it('contains grammar, output spec, and the empty-history fallback', () => {
    const prompt = buildFamilyPrompt({});
    expect(prompt).toContain('noise(x,y) fbm(x,y,octaves)');
    expect(prompt).toContain('Exactly 10 families');
    expect(prompt).toContain('ONLY this JSON');
    expect(prompt).toContain('no history yet');
  });

  it('teaches the iterated maps and enforces strategy rotation', () => {
    const prompt = buildFamilyPrompt({});
    expect(prompt).toContain('julia(zx,zy,cr,ci,n)');
    expect(prompt).toContain('STRATEGY ROTATION');
    expect(prompt).toContain('no trig functions at all');
    expect(prompt).toContain('wildcard');
  });

  it('embeds the user memory: ratings, saves, habits, elites, packs', () => {
    const rated = createSnapshot({ source: 'sin(9.0 * r - t)', ast: parse('sin(9.0 * r - t)'), coords: 'polar' });
    rated.rating = 5;
    rated.stats.entropy = 0.42;
    const saved = createSnapshot({ source: 'worley(x * 4.0, y * 4.0)', ast: parse('worley(x * 4.0, y * 4.0)'), origin: 'mutate' });
    const elite = { snapshot: createSnapshot({ source: 'fract(x * 8.0 - t)', ast: parse('fract(x * 8.0 - t)') }), fitness: 0.7 };

    const prompt = buildFamilyPrompt({
      snapshots: [rated, saved],
      elites: [elite],
      packNames: ['crt-spirits'],
    });
    expect(prompt).toContain('★5 [polar] sin(9.0 * r - t)');
    expect(prompt).toContain('entropy 0.42');
    expect(prompt).toContain('worley(x * 4.0, y * 4.0)');
    expect(prompt).toContain('fract(x * 8.0 - t)');
    expect(prompt).toContain('crt-spirits');
    expect(prompt).not.toContain('no history yet');
  });
});
