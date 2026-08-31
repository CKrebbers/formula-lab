import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { print } from '../src/core/print.js';
import { validate } from '../src/core/ast.js';
import { transpile, outputMode } from '../src/core/glsl.js';
import { extractParams } from '../src/core/constants.js';
import {
  OPERATORS, operatorsForMask, mutateOnce, coordsFlip,
  astConstTweak, constReroll, funcSwap, nodeDelete,
} from '../src/search/mutate.js';
import { crossover } from '../src/search/crossover.js';
import { latinHypercube, lhsParamSets, randomExpr } from '../src/search/sample.js';
import { countNodes } from '../src/search/walk.js';

/** mulberry32 — deterministic rng for reproducible tests */
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARENTS = [
  'sin(4.0 * x * y + t) + cos(3.0 * x + t * 0.7)',
  'fbm(x + 1.5 * fbm(x, y, 4.0), y, 4.0) * 2.0 - 1.0',
  'vec2(sin(y * 3.0 + t), cos(x * 3.0 - t))',
  '1.0 - worley(x * 4.0, y * 4.0) * 2.5',
];

/** Round every literal to print precision so deep-equal ignores digits print trims. */
function roundNums(node) {
  if (node.type === 'num') return { ...node, value: Number(node.value.toPrecision(9)) };
  if (node.type === 'neg') return { ...node, arg: roundNums(node.arg) };
  if (node.type === 'bin') return { ...node, left: roundNums(node.left), right: roundNums(node.right) };
  if (node.type === 'call') return { ...node, args: node.args.map(roundNums) };
  return node;
}

/** A mutated child must always survive the full pipeline. */
function assertViable(child, label) {
  expect(validate(child).ok, `${label}: validate`).toBe(true);
  const source = print(child);
  const reparsed = parse(source);
  expect(reparsed, `${label}: print/parse round-trip`).toEqual(roundNums(child));
  const { ast } = extractParams(reparsed);
  expect(() => transpile(ast), `${label}: transpile`).not.toThrow();
}

describe('operators: fuzz — every operator × every parent, always viable', () => {
  for (const { name, fn } of OPERATORS) {
    it(name, () => {
      const rng = seeded(42);
      let produced = 0;
      for (const src of PARENTS) {
        const parent = parse(src);
        for (let i = 0; i < 40; i++) {
          const child = fn(parent, rng, {});
          if (child === null) continue;
          produced++;
          assertViable(child, `${name} on '${src}'`);
          expect(countNodes(child)).toBeLessThanOrEqual(110);
        }
        expect(parent, `${name} must not mutate its input`).toEqual(parse(src));
      }
      expect(produced, `${name} should apply to at least one parent`).toBeGreaterThan(0);
    });
  }

  it('preserves vec2/vec3 output mode (root is off-limits)', () => {
    const rng = seeded(7);
    const parent = parse('vec2(sin(y * 3.0 + t), cos(x * 3.0 - t))');
    for (let i = 0; i < 120; i++) {
      const result = mutateOnce(parent, rng);
      if (result) expect(outputMode(result.ast)).toBe('vec2');
    }
  });
});

describe('operators: specifics', () => {
  it('const ops respect locks (a = first literal)', () => {
    const rng = seeded(1);
    const parent = parse('sin(1.7 * x) + 2.0');
    for (let i = 0; i < 30; i++) {
      for (const fn of [astConstTweak, constReroll]) {
        const child = fn(parent, rng, { locks: { a: true } });
        // literal a (1.7) untouched; only b (2.0) may change
        expect(print(child)).toMatch(/^sin\(1\.7 \* x\)/);
      }
    }
  });

  it('const ops return null when everything is locked', () => {
    const parent = parse('x + 1.0');
    expect(astConstTweak(parent, seeded(2), { locks: { a: true } })).toBeNull();
  });

  it('func_swap keeps arity', () => {
    const rng = seeded(3);
    for (let i = 0; i < 30; i++) {
      const child = funcSwap(parse('clamp(x, 0.0, 1.0)'), rng);
      expect(child.args).toHaveLength(3);
      expect(['clamp', 'mix', 'smoothstep', 'fbm']).toContain(child.name);
    }
  });

  it('node_delete shrinks the tree', () => {
    const rng = seeded(4);
    const parent = parse('sin(x + cos(y * 2.0))');
    for (let i = 0; i < 20; i++) {
      const child = nodeDelete(parent, rng);
      expect(countNodes(child)).toBeLessThan(countNodes(parent));
    }
  });

  it('mutateOnce reports which operator produced the child', () => {
    const result = mutateOnce(parse(PARENTS[0]), seeded(5));
    expect(result).not.toBeNull();
    expect(OPERATORS.map((o) => o.name)).toContain(result.operator);
  });

  it('masks limit the operator pool', () => {
    expect(operatorsForMask('constants').map((o) => o.mask)).toEqual(['constants', 'constants']);
    expect(operatorsForMask('structure')).toHaveLength(6);
    expect(operatorsForMask('all')).toHaveLength(OPERATORS.length);
  });

  it('coordsFlip cycles 0 → 1 → 2 → 0', () => {
    expect([coordsFlip(0), coordsFlip(1), coordsFlip(2)]).toEqual([1, 2, 0]);
  });
});

describe('crossover', () => {
  it('produces viable children mixing both parents', () => {
    const rng = seeded(6);
    const a = parse(PARENTS[0]);
    const b = parse(PARENTS[3]);
    let produced = 0;
    for (let i = 0; i < 40; i++) {
      const result = crossover(a, b, rng);
      if (!result) continue;
      produced++;
      assertViable(result.ast, 'crossover');
      expect(result.operator).toBe('crossover');
    }
    expect(produced).toBeGreaterThan(30);
    expect(a).toEqual(parse(PARENTS[0])); // inputs untouched
  });
});

describe('sampling', () => {
  it('latinHypercube stratifies every dimension', () => {
    const cube = latinHypercube(8, 3, seeded(8));
    expect(cube).toHaveLength(8);
    for (let d = 0; d < 3; d++) {
      const strata = cube.map((row) => Math.floor(row[d] * 8)).sort((x, y) => x - y);
      expect(strata).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); // one sample per stratum
    }
  });

  it('lhsParamSets keeps locked params fixed and stays in range', () => {
    const sets = lhsParamSets({ a: 1.7, b: -1.3 }, 8, seeded(9), { locks: { b: true } });
    for (const set of sets) {
      expect(set.b).toBe(-1.3);
      expect(set.a).toBeGreaterThanOrEqual(1.7 - 4.25);
      expect(set.a).toBeLessThanOrEqual(1.7 + 4.25);
    }
    expect(new Set(sets.map((s) => s.a)).size).toBe(8);
  });

  it('randomExpr always yields valid, bounded expressions', () => {
    const rng = seeded(10);
    for (let i = 0; i < 100; i++) {
      const expr = randomExpr(rng, 2);
      expect(validate(expr).ok).toBe(true);
      expect(countNodes(expr)).toBeLessThanOrEqual(7);
    }
  });
});
