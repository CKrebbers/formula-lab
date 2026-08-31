# Decisions (append-only ADR log)

## 2026-08-31 — Session 1 (v1 scaffold)

1. **Default palette for scalar output: 4-color pixel-art LUT** (§13.1, per suggestion).
   Quantized 4 steps, dark→light (#0f0f1b, #565a75, #c6b7be, #fafbf6). Matches the
   glitch/pixel-art aesthetic; a viridis gradient would read as "data viz".
2. **Attractors in v1: CPU histogram → texture** (§13.2, per suggestion).
   200k points into a 2D histogram, uploaded as a texture. Simple, GPU-independent;
   transform-feedback revisited only if it's too slow in practice.
3. **Permalink compression: lz-string** (§13.3, per suggestion). Tiny dep, URLs stay usable.
4. **vec2/vec3 constructors allowed only at the top level of a formula (v1).**
   Keeps the transpiler single-typed (everything below the root is a float expression) —
   no type inference needed. Revisit if mutation wants to produce nested vectors.
5. **Comparisons transpile to `float(a < b)`** — returns exactly 0.0/1.0 per §5 with no
   branching cost.
6. **Fullscreen quad = single oversized triangle via `gl_VertexID`** — no vertex buffer,
   fewer GL objects, standard trick.
7. **`fbm` octaves is a runtime float**: fixed 8-iteration GLSL loop with an early
   `break` (GLSL ES 3.0 requires constant loop bounds); amplitude-normalized.
8. **`length(x)` (1 arg) transpiles to `abs(x)`** — scalar length is magnitude; the
   2-arg form becomes `length(vec2(a,b))`.
9. **Noise helpers prefixed `fl_`** in GLSL to avoid any collision with built-ins.
10. **devicePixelRatio capped at 2** in the renderer — protects the 2014 GPU on hidpi.
11. **Extracted constants become `param` AST nodes bound as float uniforms (`u_a`, `u_b`…).**
    Slider moves never recompile the shader — they just set uniforms. Formula text keeps
    its original literals; params live beside it (matches snapshot schema §4).
12. **Slider range inference: value ± 2.5 × max(1, |value|), 400 steps.** Centered on the
    typed constant; wide enough to explore, revisit if it feels wrong in practice.
13. **Formula Lab gets its own git repo** inside `1. Projects/Visual app` — the Desktop
    repo gitignores all PARA folders, so committing there is impossible by design.
14. **Per-slider automation (LFO) added on request** (`core/automate.js`): modes
    off/sine/tri/walk, rate in Hz, depth as fraction of the slider range, centered on
    the slider position (dragging retargets the orbit). 'walk' is layered incommensurate
    sines — deterministic, no RNG state. Phases de-synced per param via golden-ratio
    steps. Lock pauses automation. Not MIDI/audio/OSC — those stay v4 (§9).
