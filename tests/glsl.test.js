import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { transpile, outputMode, glslFloat, TranspileError } from '../src/core/glsl.js';

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
