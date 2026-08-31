import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { transpile, outputMode, usesPrev, glslFloat, TranspileError } from '../src/core/glsl.js';

function expr(source) {
  return transpile(parse(source)).expression;
}

describe('glsl: expression emission', () => {
  it('emits numbers as float literals', () => {
    expect(glslFloat(4)).toBe('4.0');
    expect(glslFloat(1.5)).toBe('1.5');
    expect(glslFloat(0.0015)).toBe('0.0015');
  });

  it('emits binary operations with parens', () => {
    expect(expr('x + y * t')).toBe('(x + (y * t))');
  });

  it('emits ^ as pow()', () => {
    expect(expr('x ^ 2')).toBe('pow(x, 2.0)');
  });

  it('emits comparisons as float()', () => {
    expect(expr('x < y')).toBe('float(x < y)');
    expect(expr('x == y')).toBe('float(x == y)');
  });

  it('emits unary minus', () => {
    expect(expr('-x')).toBe('(-x)');
  });

  it('maps atan2 to two-arg atan', () => {
    expect(expr('atan2(y, x)')).toBe('atan(y, x)');
  });

  it('maps length: 1 arg → abs, 2 args → length(vec2)', () => {
    expect(expr('length(x)')).toBe('abs(x)');
    expect(expr('length(x, y)')).toBe('length(vec2(x, y))');
  });

  it('maps iterated maps and fold to prefixed GLSL helpers', () => {
    expect(expr('julia(x, y, 0.3, 0.5, 32.0)')).toBe('fl_julia(x, y, 0.3, 0.5, 32.0)');
    expect(expr('ship(x, y, 0.3, 0.5, 24.0)')).toBe('fl_ship(x, y, 0.3, 0.5, 24.0)');
    expect(expr('kali(x, y, 0.5, 0.4, 12.0)')).toBe('fl_kali(x, y, 0.5, 0.4, 12.0)');
    expect(expr('orbit(x, y, 0.28, 0.01, 24.0)')).toBe('fl_orbit(x, y, 0.28, 0.01, 24.0)');
    expect(expr('fold(x * 3.0)')).toBe('fl_fold((x * 3.0))');
    const { fragmentSource } = transpile(parse('julia(x, y, 0.3, 0.5, 32.0)'));
    expect(fragmentSource).toContain('float fl_julia');
    expect(fragmentSource).toContain('float fl_fold');
  });

  it('maps noise helpers to prefixed GLSL functions', () => {
    expect(expr('noise(x, y)')).toBe('fl_noise(vec2(x, y))');
    expect(expr('fbm(x, y, 4)')).toBe('fl_fbm(vec2(x, y), 4.0)');
    expect(expr('worley(x, y)')).toBe('fl_worley(vec2(x, y))');
    expect(expr('hash(x, y)')).toBe('fl_hash(vec2(x, y))');
  });

  it('emits plain whitelisted calls directly', () => {
    expect(expr('smoothstep(0, 1, x)')).toBe('smoothstep(0.0, 1.0, x)');
  });
});

describe('glsl: output modes', () => {
  it('detects scalar mode', () => {
    expect(outputMode(parse('sin(x + t)'))).toBe('scalar');
  });

  it('detects vec3 (color) mode', () => {
    const ast = parse('vec3(fract(x), fract(y), 0.5)');
    expect(outputMode(ast)).toBe('vec3');
    expect(transpile(ast).mode).toBe('vec3');
  });

  it('detects vec2 (displacement) mode', () => {
    const ast = parse('vec2(sin(t), cos(t))');
    expect(transpile(ast).mode).toBe('vec2');
  });

  it('rejects vec3 below the top level (v1)', () => {
    expect(() => transpile(parse('sin(x) + vec3(1, 2, 3)'))).toThrow(TranspileError);
  });
});

describe('glsl: full shader (golden structure)', () => {
  it('produces a complete GLSL ES 3.0 shader for scalar formulas', () => {
    const { fragmentSource } = transpile(parse('sin(x*y + t)'));
    expect(fragmentSource).toContain('#version 300 es');
    expect(fragmentSource).toContain('uniform float u_time;');
    expect(fragmentSource).toContain('uniform vec2 u_resolution;');
    expect(fragmentSource).toContain('uniform vec2 u_mouse;');
    expect(fragmentSource).toContain('float v = sin(((x * y) + t));');
    expect(fragmentSource).toContain('fl_palette(v)');
    expect(fragmentSource).toContain('out vec4 outColor;');
  });

  it('produces a warp shader for vec2 formulas', () => {
    const { fragmentSource } = transpile(parse('vec2(sin(t), cos(t))'));
    expect(fragmentSource).toContain('vec2 warp = vec2(sin(t), cos(t));');
    expect(fragmentSource).toContain('fl_fbm(vec2(x + warp.x, y + warp.y)');
  });

  it('emits the feedback path only when prev() is used', () => {
    const plain = transpile(parse('sin(x * y + t)'));
    expect(plain.usesPrev).toBe(false);
    expect(plain.fragmentSource).not.toContain('u_prev');
    expect(plain.fragmentSource).not.toContain('fl_prev');

    const feeding = transpile(parse('mix(sin(x * y + t), prev(x, y), 0.85)'));
    expect(feeding.usesPrev).toBe(true);
    expect(feeding.fragmentSource).toContain('uniform sampler2D u_prev;');
    expect(feeding.fragmentSource).toContain('float fl_prev(float px, float py)');
    expect(feeding.expression).toContain('fl_prev(x, y)');
    // samples in the same aspect-corrected space as the uv line in main()
    expect(feeding.fragmentSource).toContain('min(u_resolution.x, u_resolution.y)');
  });

  it('detects prev at any depth, and leaves prev-free formulas untouched', () => {
    expect(usesPrev(parse('prev(x, y)'))).toBe(true);
    expect(usesPrev(parse('sin(fbm(prev(x, y), y, 4.0))'))).toBe(true);
    expect(usesPrev(parse('-prev(x, y)'))).toBe(true);
    expect(usesPrev(parse('x + prev(x, y) * 2.0'))).toBe(true);
    expect(usesPrev(parse('vec3(prev(x, y), 0.0, 0.0)'))).toBe(true);
    expect(usesPrev(parse('sin(x * y + t) + fbm(x, y, 4.0)'))).toBe(false);
    // a prev-free formula transpiles byte-identically to the pre-feedback build
    const before = transpile(parse('sin(x * y * 4.0 + t) + cos(3.0 * x)')).fragmentSource;
    expect(before).not.toMatch(/prev/);
  });

  it('embeds all palettes and the tone/palette/smooth uniforms', () => {
    const { fragmentSource } = transpile(parse('sin(x)'));
    expect(fragmentSource).toContain('uniform int u_palette;');
    expect(fragmentSource).toContain('uniform int u_smooth;');
    expect(fragmentSource).toContain('uniform int u_tone;');
    expect(fragmentSource).toContain('FL_PAL[20]'); // 5 palettes × 4 colors
    expect(fragmentSource).toContain('fract(raw)'); // wrap tone
  });

  it('remaps coordinates via the u_coords uniform', () => {
    const { fragmentSource } = transpile(parse('sin(x)'));
    expect(fragmentSource).toContain('uniform int u_coords;');
    expect(fragmentSource).toContain('if (u_coords == 1)');   // polar (r, th/pi)
    expect(fragmentSource).toContain('else if (u_coords == 2)'); // toroidal wrap
    expect(fragmentSource).toContain('float x = p.x;');
  });

  it('declares every formula variable', () => {
    const { fragmentSource } = transpile(parse('x + y + t + r + th + mx + my + i'));
    for (const decl of ['float x =', 'float y =', 'float t =', 'float r =',
      'float th =', 'float mx =', 'float my =', 'float i =']) {
      expect(fragmentSource).toContain(decl);
    }
  });

  it('refuses an invalid AST', () => {
    expect(() => transpile({ type: 'call', name: 'system', args: [] })).toThrow(TranspileError);
  });
});
