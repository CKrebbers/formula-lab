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
31. **AV layer (one AST, two backends) — full plan and risks in
    docs/adr/001-av-layer.md.** The AST is the IR; `core/js.js` emits a JS twin
    of the GLSL transpile against `core/jsruntime.js` (FL, mirrors every fl_*
    helper), `core/interp.js` is the reference evaluator the parity harness
    stands on. The worklet loads ONE Blob module (jsruntime+dsp+glue);
    formulas travel as postMessage strings compiled with new Function — the
    AST is already whitelisted, so "never eval user text" holds. Chain (in
    order, at 4× oversampling): NaN guard → 2× DC blocker (a ramp leaves a
    constant after one differentiator) → peak normalizer (slow release) →
    tanh → 192-tap decimation FIR with its stopband at the output Nyquist →
    hard [-1,1] clamp (the FIR can ring past tanh). 20 ms formula crossfade at
    the raw stage, 200 ms soft start over the blockers' step response.
    prev()/dx/dy are 0 in the audio backend. Sound follows the panel (cue).
32. **The JS hash emulates the GPU's float32 op for op (Math.fround).**
    Measured, not assumed: in float64 the hash's p·p≈8000-through-fract chain
    amplifies representation error into DIFFERENT cell values than the GPU —
    worley image correlation 0.20. With fround mirroring: max pixel diff < 1
    byte, correlation > 0.9999 across noise/fbm/worley/hash. Image and sound
    now see the same noise cells. Perf test measures CPU time in a child
    process: a worklet thread has near-realtime priority; wall clock on a
    busy desktop measures preemption, not the DSP.
33. **Dropouts are measured on the audio thread, and the meter is validated by
    a negative control.** The child-process CPU-time budget test proves the DSP
    is fast in isolation; it cannot prove "no dropouts in 30 s of real time",
    and it had flaked once. `DropoutMeter` (dsp.js, pure so it unit-tests in
    Node) now runs inside `process()` with two independent instruments:
    `gaps` (rendered position vs. wall clock, tolerance 25 ms, counted once per
    stretch of lost ground) and `overruns`/`load` (our own wall time vs. the
    audio time produced, per 32-quantum window). `Date.now()` is the only clock
    in AudioWorkletGlobalScope; the 25 ms tolerance and the windowed load are
    built for its 1 ms resolution. Measured, not assumed:
    - **Negative control (mandatory):** the first "deliberately too heavy"
      formula ran at load 0.84 — heavy but inside budget, so the control proved
      nothing. Four blocks of iterated maps + 8-octave fbm gives load 3.15:
      192 gaps, 235 630 lost frames, 26 overruns. The meter reads non-zero when
      it should.
    - **Corpus run:** 24 presets, 30 s realtime → 0 gaps, 0 overruns, 0 skipped
      quanta, load 0.22, worst lag 7.2 ms.
    - **The context is 44.1 kHz, not 48 kHz.** The first corpus run looked like
      a 2.4 s deficit; `contextQuanta`/`skipped`/`wallMs` in the report showed
      process() saw every quantum and the audio thread's own wall clock matched
      exactly — the test was dividing by 48000. `report()` now carries
      `sampleRate` so no reader can repeat that mistake. Node tests still pin
      48 kHz explicitly; only the device decides in the browser.
    - Windowed reports reach a busy main thread late, so a reader that wants an
      exact number calls `flushMeter()` and gets one straight from the thread.
    - Chrome's own `AudioContext.renderCapacity` was absent in this build
      (`underrunRatio` null), so it corroborates nothing here; the test reads it
      when present but never depends on it.
34. **The parity harness is itself tested, by mutation.** A green suite claims
    nothing until it can be made to fail. `tests/mutation.test.js` rewrites
    `core/js.js` three ways (sin→cos in the emitted call name, a 1e-3 offset on
    the emitted output, `*` emitted as `+`), writes each mutant beside the
    original — vite cannot resolve a `file://` URL outside the project root
    when the path contains spaces, so a sibling is the only clean way — and
    asserts the parity check catches it. Kill rates: sin→cos 4/25 (exactly the
    4 corpus formulas that use `sin`), offset 22/25, operator swap 21/25. No
    mutant survived, so no corpus gap to fill. A CONTROL loads the unmutated
    emitter through the same machinery and must pass, otherwise a broken loader
    would "kill" every mutant for the wrong reason.
    **Documented blind spot, asserted as a test:** emitJS and the reference
    interpreter both call into `FL`, so a mutation *inside* jsruntime.js moves
    both sides together and is invisible here (the test proves it: FL.sin→cos
    yields zero parity failures). That gap is covered by the browser GLSL
    parity spec, where the GPU is a genuinely independent implementation. The
    offset mutation surviving 3 formulas is the same effect in miniature: the
    tolerance is relative, so large-output formulas tolerate 1e-3 by design.
35. **stats.audio is measured twice: pre-normalizer and post-limiter
    (schema 4).** The single measurement graded the output chain, not the
    formula — which matters because the zero-player's novelty will rank on it.
    `SynthCore.enableTap()` taps after the NaN guard and the DC chain, before
    the normalizer and tanh, through its own decimation filter so both sides
    are at the output rate and directly comparable. Opt-in: the worklet
    allocates nothing for a measurement it never reads (asserted by a test).
    Measured on the same formula at ×0.001 and ×1000 (after ADR #37):
    - `pre.rms` 0.000707 vs 707.014 — the formula's own level, six orders apart.
    - `post.rms` 0.3308 vs 0.3329 — a millionfold level change, erased to 0.6 %.
    - `pre.crest` 1.41445 for both (√2, a sine, level-invariant and correct).
    - **Corrected:** the first measurement of this showed `post.crest` swinging
      1.39 → 2.05 and was read as the limiter flattening crest. It was a
      STARTUP TRANSIENT, and ADR #37's warmup removed it. In steady state the
      peak tracker keeps the signal off the limiter and tanh only shaves a few
      percent (a pulse train: 3.04 → 2.95). So the case for `pre` rests on
      level, which `post` destroys completely — not on crest, which mostly
      survives. Recorded rather than quietly re-tuned: the test now asserts
      what is true (compression < 1.5×, never inflation).
    Flatness is computed on the rms-normalized signal so it never depends on
    level either. Done now, before a preset library exists that would need
    migrating: v3 records keep their single measurement as `post` with
    `pre: null` (never measured — say so rather than back-fill).
36. **A migrated scan default carries its provenance, and migration is tested
    against frozen fixtures.** v2 presets predate field-formula sound, so no
    scan was ever chosen for them. They now get `DEFAULT_SCAN`
    (lissajous, 110 Hz) tagged `origin: 'schema-v2-default'` instead of a
    silent `null`; a session's own setting is tagged `origin: 'session'`, and
    `validateSnapshot` refuses a scan that will not say which it is. It matters
    because stats.audio depends on the scan: comparing a measured preset
    against one carrying a migration's guess, with no way to tell them apart,
    would quietly corrupt any ranking built on it. A v3 scan WAS a live
    setting, so v3→v4 tags it `session`.
    Fixtures (`tests/fixtures/snapshot-v{1,2,3}.json`) are frozen records of
    what each schema actually looked like — round-tripping a record the current
    code wrote proves nothing about one written months ago. The suite asserts
    the fixture is genuinely old (no `scan` key at all in v2), that every v2
    field survives untouched, that no audio measurement is invented, and that
    an Archive holding all three loads them migrated and valid.
37. **DC chain: one 6 Hz blocker + a running-mean subtraction, replacing two
    cascaded 20 Hz blockers.** The cascade was 12 dB/oct and ate the 20–40 Hz
    band — exactly where slow visual motion has its audible twin. Measured
    end-to-end (old → new): 20 Hz −6.02 → −0.37 dB, 25 Hz −4.29 → −0.46 dB,
    30 Hz −3.19 → −0.16 dB, 40 Hz −1.93 → −0.10 dB.
    The second blocker existed because one highpass answers a RAMP (`t*8000`,
    bytebeat counters) with a constant. A boxcar running-mean subtraction does
    that job without the low-end cost: it leaves a ramp as a constant
    (slope·T/2) for the 6 Hz blocker to remove, and its own ripple is bounded
    by 1/(π·f·T), so at T = 250 ms it is within ±0.54 dB at 20 Hz and flat
    above. Applied unconditionally rather than gated on a "is this periodic?"
    heuristic — the measured cost is negligible and a filter that sometimes
    changes shape is far less predictable. The test asserts the whole
    20 Hz–1 kHz band, not just the 30 Hz acceptance point, so it cannot be
    satisfied by landing on a sinc null; a negative control asserts the old
    cascade would fail it.
    **Startup, found by the safety test, not by reasoning:** while the mean
    window fills, the mean of a ramp lags by half the samples seen, so the
    residue is still a ramp and the blocker cannot remove it — `t*8000` was
    pinned at the limiter for 250 ms (2 s mean DC 0.085, against a 0.01
    budget). A fade cannot fix that; the chain simply does not know a
    formula's DC before it has watched a window of it. So the synth is SILENT
    for one mean window (250 ms), then fades in over 20 ms. A quarter second
    before the first sound, in exchange for never opening with a thump.
38. **Audio-silent terms are declared, not left implicit.** `prev()`, `dx` and
    `dy` evaluate to 0 in the audio backend — there is no frame buffer at
    48 kHz and no screen pixel to step by — so the same formula demonstrably
    does something different in the two backends. That is the one place the
    "one IR, two emitters" principle bends, and the limit is acceptable; the
    silence about it was not. `audioSilentTerms(ast)` in core/js.js returns
    them, `emitJS`/`compileFormula` carry them as `silent`, the panel prints a
    line under the editor per formula ("prev() = 0 in sound — you hear only the
    rest of the formula"), and `computeAudioStats` includes the list in its
    result so `stats.audio` can never imply the whole formula was heard.
    Migrated v3 records get `silent: null` (unknown), not `[]` (nothing was
    silent) — the difference matters when ranking presets by sound.
14. **Per-slider automation (LFO) added on request** (`core/automate.js`): modes
    off/sine/tri/walk, rate in Hz, depth as fraction of the slider range, centered on
    the slider position (dragging retargets the orbit). 'walk' is layered incommensurate
    sines — deterministic, no RNG state. Phases de-synced per param via golden-ratio
    steps. Lock pauses automation. Not MIDI/audio/OSC — those stay v4 (§9).
