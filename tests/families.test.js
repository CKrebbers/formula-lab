import { describe, it, expect } from 'vitest';
import { FAMILIES, getFamily } from '../src/families/index.js';
import { parse } from '../src/core/parser.js';
import { transpile } from '../src/core/glsl.js';
import { extractParams } from '../src/core/constants.js';
import { COORD_NAMES } from '../src/store/snapshot.js';

describe('families: registry', () => {
  it('has unique ids and complete metadata', () => {
    const ids = FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FAMILIES) {
      expect(f.id).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(f.name.length).toBeGreaterThan(0);
      expect(typeof f.source).toBe('string');
      expect(typeof f.notes).toBe('string');
      expect(typeof f.ref).toBe('string');
      expect(COORD_NAMES).toContain(f.coords);
    }
  });

  it('getFamily finds by id and returns null otherwise', () => {
    expect(getFamily('field.trig').name).toBe('Trig field');
    expect(getFamily('nope.nope')).toBeNull();
  });
});

describe('families: every source parses, extracts and transpiles', () => {
  for (const family of FAMILIES) {
    it(family.id, () => {
      const ast = parse(family.source);
      const { ast: paramAst, params } = extractParams(ast);
      const { fragmentSource, mode, paramNames } = transpile(paramAst);
      expect(fragmentSource).toContain('#version 300 es');
      expect(['scalar', 'vec2', 'vec3']).toContain(mode);
      expect(paramNames).toEqual(Object.keys(params));
      // families should ship tweakable constants
      expect(paramNames.length).toBeGreaterThan(0);
    });
  }

  it('warp.curl uses vec2 displacement mode', () => {
    const { ast } = extractParams(parse(getFamily('warp.curl').source));
    expect(transpile(ast).mode).toBe('vec2');
  });

  it('no family uses ^ on a possibly-negative base (undefined in GLSL)', () => {
    // pow() is fine when wrapped in abs(); bare `something^2` on x/y is not.
    for (const family of FAMILIES) {
      expect(family.source, `${family.id} should avoid '^' on signed values`).not.toMatch(/\^/);
    }
  });
});
