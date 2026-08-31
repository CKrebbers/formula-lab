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
14a. **Coordinate remap runs in-shader via `uniform int u_coords`** — one compiled
    shader serves all three modes, toggling never recompiles. Polar feeds the formula
    `(r, th/π)`; toroidal wraps via `(sin(πx), sin(πy))` for seamless tiling. Raw `r`/`th`
    stay derived from the untransformed uv, so polar mode doesn't double-transform them.
14b. **Contact sheet reuses one offscreen GL context** (`render/tile.js`, 128×128):
    same shader, 9 param sets, blitted into 2D canvases. Tiles are frozen at generation
    time (no 9 live animations — the 2014 GPU thanks us). const_tweak perturbs every
    unlocked param with σ·max(1,|v|) so large constants drift proportionally.
15. **v1 family library ships the 10 families expressible in today's language** (field.*,
    warp.fbm/curl, noise.worley, shape.superformula/truchet). Iterated families
    (julia, kaliset, …) need `iter()`, which §5 reserves for v2 — shipping them now
    would mean building v2 language features early. Attractors need their own CPU
    histogram render path (decision #2); they land as the next step, with the Sprott
    search button (§9 v2). Deviation from §9 v1 scope, chosen over scope creep.
16. **Formulas must not use `^` on possibly-negative bases** — GLSL `pow` is undefined
    for base < 0 (black screen on some GPUs, including possibly the 2014 Radeon).
    Families use `length(a, b)` / `abs()` instead; a families test enforces no bare `^`.
    Consider a transpiler warning later.
17. **Bug fixed: explicit `display: flex` beat the `hidden` attribute** on .auto-row and
    #panel (the `h` key silently never worked). Global `[hidden] { display: none
    !important; }` now guards every hideable element. CSS-level, so no unit test —
    verified live in the browser.
18. **v2 stats run on palette-free renders** (`u_raw` uniform): the 4-color LUT caps
    luminance entropy at log2(4)/log2(64) ≈ 0.33, breaking the §7 thresholds. Novelty,
    by contrast, uses the PALETTE pixels — §7 compares against archived thumbs, which
    are palette renders; both sides must match.
19. **Mutation sheet ('mut')**: masks all/const/struct; 'const' mask uses stratified
    LHS rerolls (§6), 'struct'/'all' use mutateOnce. coords_flip stays a manual button,
    not a sheet operator. Candidates: max 60 attempts for 8 accepted; center = parent;
    sorted by novelty desc. 'xover' crosses with a RANDOM archived snapshot.
20. **Lineage chain**: parent_ids = [last saved/loaded snapshot]. Loading, saving, or
    promoting keeps the chain; typing by hand resets origin to 'typed' but keeps the
    parent link. Rating lives on the loaded snapshot via the lineage strip (click the
    current star again to clear).
21. **v3 auto-explore ("zero-player") started on request, ahead of the v2 DoD** — Clay
    asked for algorithmic, self-generating, infinite visuals; that IS §9 v3's
    auto-explore + MAP-Elites, so built in phase order. Deviations from §9 v3: cell
    fitness = novelty-at-insert instead of "highest-rated" (machine finds are unrated;
    the archive stays the human-curated layer), and the LLM mutator is not part of this
    step. Strategy mix per step: mutate elite 55% / crossover 20% / family LHS-reroll
    15% / random birth 10% (cold start: family 40 / birth 30 / mutate 30). Tick = 900ms,
    gentle on the 2014 GPU. Elites persist in their own localStorage key; the main view
    follows every discovery while auto is on; typing or picking a cell hands control back.
14. **Per-slider automation (LFO) added on request** (`core/automate.js`): modes
    off/sine/tri/walk, rate in Hz, depth as fraction of the slider range, centered on
    the slider position (dragging retargets the orbit). 'walk' is layered incommensurate
    sines — deterministic, no RNG state. Phases de-synced per param via golden-ratio
    steps. Lock pauses automation. Not MIDI/audio/OSC — those stay v4 (§9).
