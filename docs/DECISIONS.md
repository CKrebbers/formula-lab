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
22. **prev(x, y) uses a ping-pong FBO, not a copy of the canvas.** First attempt was
    one texture + `copyTexSubImage2D` after the draw (read and write never overlap
    within a pass, so no ping-pong is strictly needed). Measured on the GPU: it does
    not work, because the canvas holds the PALETTE-MAPPED color — feeding that back
    puts the signal through a 4-color quantizer, only ~2 bits of state per pixel
    survive, and the image locks into a fixed point within two frames (verified:
    mean luminance constant, zero difference vs. a single-shot render). So: draw
    into an offscreen RGBA texture while sampling the other one, `blitFramebuffer`
    to the canvas, swap. Same measurement after the change: mean 15 → 111 over 40
    frames, 70/255 average difference vs. single-shot.
23. **The feedback texture carries the formula's continuous scalar in ALPHA**, and
    `prev()` reads `.a * 2.0 - 1.0`. Keeps prev() in the language's -1..1 scalar
    convention, is immune to palette quantization and to palette/tone changes, and
    makes plain `prev(x, y)` a hold rather than a runaway. vec3-mode formulas have
    no scalar, so they feed back their own luminance. 8-bit storage means values
    outside -1..1 are clamped in the feedback path. The GL context is created with
    `alpha: false` so this alpha never reaches compositing. Formulas that do not
    call prev() still emit `vec4(color, 1.0)` and are byte-identical to before.
24. **Tiles/thumbs/stats warm the feedback buffer instead of disabling it**:
    reset → 6 draws at the capture's own t → capture. Deterministic (every call
    starts from black) and trivial at 128², and it keeps trail formulas visible in
    contact sheets, thumbnails and the §7 stats instead of evaluating as flat black
    and being filtered out of the evolutionary pool. (func_swap can produce prev(),
    so trail formulas do enter that pool.)
25. **prev() out-of-frame sampling clamps** (CLAMP_TO_EDGE), it does not wrap:
    a warp that walks off the edge smears the border rather than teleporting to the
    opposite side. The buffer resets to black, so prev() reads -1 on the first
    frame, after a formula change and after a resize.
26. **dx/dy are pre-remap, and they are variables, not uniforms.** They hold the size
    of one screen pixel in the same uv space x/y are built from
    (`2.0 / min(u_resolution.x, u_resolution.y)`), derived per fragment rather than
    set by the CPU. Consequence, accepted on purpose: under polar/toroidal coords
    x/y are remapped, so `prev(x + dx, y)` is NOT a guaranteed screen-space
    neighbour there. One definition, one instruction, and the cartesian Laplacian
    is the point; polar-neighbour sugar can come later if it earns its place.
27. **Bitwise helpers are named functions, not operators.** `^` stays `pow()` (it has
    meant that since v1 and formulas depend on it), so xor is `bxor`; the tokenizer
    is untouched. Details: `precision highp int;` is now declared because fragment
    shaders default to *mediump* int (16-bit), too narrow for the pixel index.
    `fl_i()` converts float→int by wrapping into the signed 32-bit range rather than
    saturating — that matches bytebeat's integer overflow and avoids the undefined
    behaviour of out-of-range float→int. `shr` is an arithmetic (sign-extending)
    shift on signed int; in practice operands are non-negative, where arithmetic and
    logical agree. Shift amounts are clamped to 0..31 (GLSL leaves the rest
    undefined). Known limit, documented rather than hidden: a float has no exact
    integer low bits above 2^24, so huge intermediate products give coarse banding
    instead of fine bit texture — keep operands small.
28. **Cue/take (program–preview), policy B: the live channel follows the formula.**
    PROGRAM is what the displays show; CUE is what the panel edits; only TAKE
    commits. Chosen policy B over the stricter A because params already stream at
    ~30 Hz and carry every slider, LFO, modulator and audio band — freezing them
    until TAKE would kill the instrument. Rule in one line: **params/coords/style
    stream straight through while cue and program share the same formula source;
    the moment the source differs nothing reaches the displays until TAKE.** So
    uniform-level play stays live, authoring needs a commit. Consequences:
    - `armed` means only "the cue's source differs from program's" — everything
      else is already live, so there is nothing else to commit.
    - TAKE sends one `formula` when the source changed (displays rebuild and reset
      feedback via the existing crossfade), otherwise a plain `params` refresh, so
      an unchanged formula never triggers a needless fade or feedback reset.
    - `hello` is always answered with program, never with a half-edited cue.
    - The panel's own canvas is the CUE preview (a program PIP on the panel is
      deferred). With no display window open, TAKE therefore has no visible effect
      beyond the armed indicator — accepted; the display window is the program monitor.
    - The zero-player auto-TAKEs each accepted elite, so the display keeps moving
      exactly as before. Human edits do not.
    - `cueMode` off restores the legacy immediate-broadcast behaviour as an escape
      hatch; leaving cue mode publishes what you were editing.
    - Export/permalink/snapshot keep reading the panel's current (cue) state, which
      is what the user is looking at; schema v2 is untouched.
    - Logic lives in `src/sync/cue.js`, pure with an injected send, so the gating is
      unit-tested rather than asserted about DOM.
29. **Dice rewrites the formula text, it does not move a slider.** One unlocked
    constant, via the existing `astConstTweak` — so it arms TAKE like any other
    authoring act, and the separation stays clean: sliders/LFOs/audio are the live
    channel, editor/dice/family/pack/starters are cue authoring. No §7 filter on a
    dice: a human asked for exactly one nudge and is the filter; §7 exists to
    protect attention from machine bulk. Retries up to 8× on a parse round-trip
    failure, then a status message.
30. **Starters are self-contained, not family references** (`families/starters.js`):
    five deliberately different kinds (wave, feedback, integer glitch, fractal,
    warp) so the first screen shows the instrument's range. A click cues AND takes,
    because a cold start must yield a living image, not homework. Thumbnails render
    after first paint (a shader compile each) and restore the panel's shader.
14. **Per-slider automation (LFO) added on request** (`core/automate.js`): modes
    off/sine/tri/walk, rate in Hz, depth as fraction of the slider range, centered on
    the slider position (dragging retargets the orbit). 'walk' is layered incommensurate
    sines — deterministic, no RNG state. Phases de-synced per param via golden-ratio
    steps. Lock pauses automation. Not MIDI/audio/OSC — those stay v4 (§9).

## 2026-10-03 — Varve hub link

31. **APC40/LPD8 reach the panel through the Varve hub, behind `?hub=ws://…`**
    (`src/sync/hub.js`, AV-app-hub PROTOCOL.md v1). One daemon on the machine owns
    the controllers; the panel is a client like any other app. Not a backend: the
    hub is a local, optional peer, and NEXUS (WS 8080) is untouched.
    - **No flag, no change:** main.js only `import()`s the module when `?hub=` is
      present — no socket, no timer, nothing evaluated. `tools/hub-check.mjs`
      proves it in a browser (no request beyond the page, no WebSocket).
    - **Only the panel**, never `?view=display`: displays follow the panel through
      the existing cue/program path.
    - **Same path as a hand:** a hub `zet` is scaled into the slider's CURRENT live
      range and applied with `sliders.setValue(…, { smooth: false })` — the drag
      path (onChange → state.params → `cue.live`). The hub can never push a param
      past the slider's own bounds, and an active LFO orbits the new center as it
      does after a drag. palette/coords/smooth/tone go through `setStyle`/
      `setCoords`, `take`/`dice` through the buttons' functions.
    - **Manifest = the current controls:** formula params a, b, c… as faders, the
      param that directly multiplies `t` gets `macro.beweging`, palette gets
      `macro.kleur`. No `standaard` in the manifest (values travel in `staat`), so a
      dice — same names, new values — resends only `staat`; a formula with other
      params resends manifest + `staat`.
    - Own changes (drag, LFO, audio) reach the hub as `zet` at ≤ 10 Hz; heartbeat
      after 0.8 s of silence; reconnect 0.5 → 1 → 2 → 5 s, 30 s after close 4001.
    - Dev server pinned to 5174 with `strictPort` (av-kern owns 5173; the archive
      lives in per-origin localStorage, so the port must not drift).
