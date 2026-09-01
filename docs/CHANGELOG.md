# Changelog

<!-- Session entries are appended at close with status / besluit per §12. -->

## 2026-09-01 — A2: prev() is heard (ADR #43)

**status:** the last "one formula means two things" in the audio backend is
closed. `prev(x, y)`, `dx` and `dy` are no longer 0 at audio rate; `cam()` is
the only audio-silent term left, still declared per formula (ADR #38).

- **Spike first** (Node, lissajous 110 Hz): with a scan-written grid, Trails
  measures pre.rms 0.196 / crest 4.5 against 0.042 / 1.5 for its driver term
  alone; a `prev * 0.9` comb 0.526 vs 0.071; plain `prev(x, y)` is silence
  (black held), a runaway saturates at the clamp; per-block cost unchanged at
  0.22 ms; deterministic; the three scan paths give three different sounds.
  That was enough to build rather than to declare feedback image-only.
- **`ScanFeedback`** (`audio/dsp.js`, embedded in the worklet with the rest):
  a 64×64 grid; the scan writes each cell once per visit (the mean of the
  samples spent inside, committed on leaving), `prev()` reads it bilinearly,
  `dx`/`dy` = one cell (2/64). Black (-1) on reset and on every formula
  change, clamp to -1..1 on write, edge-clamped reads — the shader's rules
  (ADR #23/#25) where they apply. Bound per core: `FL` stays pure, the scope
  on the main thread draws a prev() formula's direct part only (documented).
- **Emitter**: `audioSilentTerms` lists cam() only; `compileFormula` carries
  `feedback` so the core writes only when a formula reads prev(). The panel
  note under the editor now appears for cam() alone.
- **Zero-player**: untouched. Trails-like formulas get a descriptor through
  the same ADR #42 rules because their measurement no longer carries a silent
  term; "unheard is not punished" still holds for cam() and unmeasured.
- Tests: `tests/feedback-audio.test.js` (+17: grid rules, hold, clamp,
  neighbour idiom, line rows exact, reset, dx heard, per-path difference,
  determinism, safety with feedback); js/avstats/avnovelty updated to lock
  the new contract (+4); the perf budget formula now reads `prev(x + dx, y)`;
  the Trails golden regenerated deliberately (the only entry that changed);
  the e2e note test uses cam() and asserts Trails shows no note.
  404 unit + 29 browser. Single-file build 194 kB (+8, the grid class in
  worklet and worker).

**besluit:** done: A2 as "build", not "decide". Deliberately not done: a grid
size setting (64 is a constant), feedback in the scope (the buffer is on the
audio thread), any A3 scan-path parameter, cam() in audio. Next per TODO: Clay
plays; then A3.

## 2026-09-01 — A1: the zero-player hears its discoveries (ADR #42)

**status:** the payoff of ADR #35. `stats.audio.pre` is read at last: the
zero-player ranks every candidate on how new it sounds as well as how new it
looks. Nothing else changed — no camera, no prev() audio, no scan params.

- **Spike first.** `computeAudioStats` on the 15 autonomous families: 0.37 s
  (field.trig) to 3.1 s (warp.curl) per formula in Node — the chain's 0.5 s
  settle plus a 32k window through the 4× oversampled core. On the UI thread
  every 900 ms that would have frozen the panel, so the same function now runs
  in an inline worker (`audio/stats-worker.js`, Vite `?worker&inline`), driven
  by `audio/stats-remote.js`: one job at a time, 6 s budget, over budget =
  unmeasured, worker replaced. One meter, two call sites.
- **`search/avnovelty.js`**: `stats.audio.pre` → `[level, crest, flatness]` on
  log scales, min-L2 novelty against the archive + elites pool (same
  `noveltyOf` as the image side), `fitness = (img + snd) / 2`. Measured on the
  families: median pairwise descriptor distance 0.148, per-member min
  0.014–0.33 — the same order as histogram novelty, so neither side swamps.
- **Unheard is not punished.** No descriptor when nothing was measured, when
  `pre` is null (migrated v3), or when audio-silent terms (prev/dx/dy/cam)
  were inert during the measurement; then the cell is won on image novelty
  alone. Tested: Trails and a cam() formula get `null`, and a sound-alike with
  audio novelty 0 ranks BELOW a silent-term formula of equal image novelty.
- **Ranking moves with `pre.rms`.** Tested on the ADR #35 pair: the same sine
  at ×0.001 and ×1000 — `post` cannot tell them apart (Δrms < 0.02), the
  descriptor puts them at opposite ends of the level axis, and with the
  mid-level sine in the pool the loud one out-ranks another mid one.
- Elites now carry `stats.audio` (so later candidates are ranked against how
  earlier finds sound) and the grid keeps `{novelty, audioNovelty}` beside
  `fitness`; the cell tooltip reads `fitness 0.412 (img 0.310 · snd 0.514)`.
  The status line counts `snd N heard, M unmeasured`.
- Tests: +15 unit (`tests/avnovelty.test.js`, real `computeAudioStats`
  outputs), +5 unit (`tests/stats-remote.test.js`, fake worker: order,
  timeout, replacement, no-Worker fallback), +1 browser (e2e: press `auto`,
  status reports a heard candidate, every won cell carries img · snd).
  383 unit + 29 browser. Single-file build 186 kB (was 153; the worker
  duplicates the compile chain as a data URL).

**besluit:** done: A1. Deliberately not done: the image/audio balance was
designed from the family corpus, not fitted against real image novelty — the
first thing to revisit after an evening of `auto` with sound on; a candidate
is measured through the session's scan path while pool members carry their
own (ADR #36 keeps that visible). `auto` is slower on heavy families now,
because a step waits for its measurement. Next per TODO: Clay plays.

## 2026-09-01 — AV hardening: make the tests prove something (ADR #33–#39)

**status:** no new features. Six review points, in the order that puts the
measuring instruments before the things they measure.

- **Dropout meter on the audio thread** (#33). The child-process CPU test
  could not prove "zero dropouts in 30 s realtime" and had flaked once.
  `DropoutMeter` counts gaps (rendered position vs. wall clock) and overruns
  (our wall time vs. audio time produced), reports to the main thread, and
  surfaces in the status line. Corpus run: 24 presets, 30 s, **0 gaps, load
  0.22**. Negative control: **192 gaps, 235 630 lost frames, load 3.15** —
  the first "too heavy" control ran at load 0.84 and proved nothing, so it
  was made genuinely heavy. Also found: the context runs at **44.1 kHz**, not
  48 kHz; the first corpus run's apparent 2.4 s deficit was the test's own
  arithmetic. `report()` now carries `sampleRate`.
- **Mutation testing on emitJS** (#34). Three mutations of the emitter, each
  killed by the parity corpus (4/25, 22/25, 21/25), with a control proving the
  loader itself works. The harness's blind spot is now asserted, not assumed:
  emitJS and the reference interpreter share `FL`, so a mutation inside
  jsruntime.js is invisible here — the GPU parity spec covers that.
- **stats.audio measured pre-normalizer as well as post** (#35, schema 4). The
  same sine at ×0.001 and ×1000: `pre.rms` 0.000707 vs 707.014, `post.rms`
  0.3308 vs 0.3329. Level is what the chain destroys. **Correction:** the
  crest flattening this point assumed was a startup transient, removed by #37;
  in steady state tanh shaves ~3 %.
- **Migration with visible provenance** (#36). v2 presets get the documented
  scan default tagged `origin: 'schema-v2-default'`; a session's own setting is
  tagged `session`, and validation refuses a scan that will not say which.
  Tested against frozen v1/v2/v3 fixtures, and verified live: a v2 record
  injected into the running app loads as schema 4 with its rating, formula and
  style intact and no invented audio stats.
- **DC chain rebuilt** (#37): one 6 Hz blocker + a 250 ms running-mean
  subtraction instead of two cascaded 20 Hz blockers. 20 Hz −6.02 → −0.37 dB,
  30 Hz −3.19 → −0.16 dB. The safety test then caught a real regression — a
  ramp pinned the limiter for the first 250 ms — so the synth is now silent
  for one mean window before fading in: it cannot know a formula's DC before
  watching a window of it.
- **Audio-silent terms declared** (#38). `prev()`, `dx`, `dy` are 0 at 48 kHz;
  the panel now says so per formula under the editor, and the saved
  measurement carries the list so `stats.audio` cannot imply the whole formula
  was heard.
- **Goldens compare with tolerance** (#39), 1e-5, with controls both ways (a
  64-ULP nudge passes, 1e-4 fails). Found while doing it: regenerating right
  after #37's warmup captured 1024 samples of silence — **all 20 hashes
  identical, test green, proving nothing**. Fingerprints now start at 0.4 s and
  two guards keep that failure loud.

345 unit + 28 browser tests. Verified live: the audio note, the scope drawing
the audible waveform, and a migrated v2 preset in the archive.

**besluit:** deliberately not done, and why — Chrome's `renderCapacity` is
absent in this build so the dropout meter has no second opinion (the negative
control is what validates it); tolerance goldens still cannot survive a
chaotic formula's escape-time decisions on another engine (they now fail with
a number attached instead of "hash mismatch"); `stats.audio` is still not read
by the zero-player's novelty — that was the reason for #35, not part of it.

## 2026-09-01 — The AV layer: every formula is image AND sound (ADR 001, #31/#32)

**status:** one AST, two backends — no audio analysis, no FFT coupling; the
same IR that becomes the shader becomes the waveform.

- **emitJS** (`core/js.js`) is the audio twin of the GLSL transpile;
  `core/jsruntime.js` mirrors every `fl_*` helper, `core/interp.js` is the
  reference evaluator the parity harness stands on. The hash is emulated in
  float32 op for op (`Math.fround`) — measured first: in float64 worley's
  image correlation with the GPU was 0.20; with the emulation, max pixel
  diff < 1 byte (ADR #32). Image and sound see the same noise cells.
- **AudioWorklet** (`audio/dsp.js` + one Blob module): 4× oversampling through
  NaN guard → dual DC blockers → peak normalizer → tanh → 192-tap decimation,
  20 ms formula crossfade, 200 ms soft start. Formulas travel as postMessage
  strings; the module loads once, no clicks.
- **Parametric mode**: pure f(t) formulas play as L/R (`vec2` = stereo), the
  scope overlay draws the XY curve from the *same compiled function* on the
  audio clock. **Field mode**: x/y walk a scan path (lissajous / spiral /
  line, 27.5 Hz–1.76 kHz) through the same field the shader draws; the scope
  shows the scanned waveform. `▶ snd`, volume, path + rate in the panel.
- **Snapshot schema v3**: `scan` settings + `stats.audio` {rms, crest,
  flatness} recorded at save — presets now say how interesting image and
  sound are independently. migrate() v1→v2→v3.
- **Tests**: 301 unit (parity corpus at 1e-6, 2 s safety renders — finite,
  |DC| < 0.01, peak ≤ 1 — for hostile formulas incl. 1/sin(t) and t*8000,
  ≥20 dB alias drop, golden hashes, CPU-time block budget) + 25 browser
  (Playwright: GLSL↔reference parity on real renders, OfflineAudioContext
  through the real worklet, e2e type→hear→see). CI runs both before deploy.
- Verified live: Lissajous scope for `vec2(sin(440·2π·t), sin(662·2π·t))`,
  worley field scan waveform, save writes scan + audio stats (schema 3).
- `prev()`/`dx`/`dy` are 0 in the audio backend (no frame buffer at 48 kHz) —
  documented in ADR 001, not hidden.

**besluit:** done: AV phases 1–3. Parked: audio for prev() formulas, per-scan
row-count control, using stats.audio in the zero-player's novelty. Next per
TODO: Clay plays a real evening — now with sound on.

## 2026-09-01 — The panel becomes an instrument: cue/take, dice, starters (B1)

**status:** the play face, not more language.

- **TAKE** (`T`, or `Cmd/Ctrl+Enter` from inside the editor): the displays only
  change when you commit. Editing a formula, loading a family/pack, promoting a
  sheet tile or dicing now lands in the CUE; the panel canvas is that preview.
  The button glows red while the cue differs from what is on air.
- **Live channel (policy B, ADR #28):** sliders, LFOs, modulators and audio keep
  streaming to the displays while cue and program share the same formula — play
  stays live, authoring needs a commit. Change the formula and the channel closes
  until TAKE.
- **cue / live edit** toggle keeps the old immediate-broadcast behaviour as an
  escape hatch.
- **dice** (`D`): nudges one unlocked constant in the formula text, Hydra-style.
  Arms TAKE; never leaks to the displays.
- **Starters strip:** five one-click starting points (Ripple, Trails, Bytebeat,
  Kaliset, Warp) with thumbnails, rendered after boot. A click cues and takes, so
  the first minute never requires typing.
- Zero-player auto-TAKEs, so `auto` still drives the displays exactly as before.

Verified live against a real display window: cue edits do not reach it, TAKE does
(0.9 s crossfade), dice arms silently, `hello` is answered with program while the
cue held something else. 222 tests.

**Known:** several open panels on the same origin share one BroadcastChannel, so
they all answer `hello` and the last TAKE wins. Fine for one panel + displays;
the conductor role in Phase C is where that gets resolved. Also still open: the
double-click slider-range gesture expands rather than tightens for large values
(the `»` `«` arrows are the working path).

## 2026-09-01 — dx/dy + bitwise helpers

**status:** two language additions. `dx`/`dy` are variables holding one screen
pixel in the pre-remap uv space, derived per fragment (ADR #26) — neighbour
sampling and derivatives are now expressible. `band/bor/bxor/shl/shr/bnot` do
integer work on floats (`^` still means pow, so xor is `bxor`); shader now
declares `precision highp int` because fragment default is mediump/16-bit
(ADR #27). New family bit.bytebeat_pixel, picked by rendering five candidates
and comparing §7 stats rather than guessing. 211 tests.

Note for the next session: `prev(x + dx, y) - prev(x - dx, y)` on its own is
flat mid-grey and that is correct — the derivative of a uniform buffer is zero
and the buffer starts black. A prev-derivative needs a source term.

## 2026-09-01 — prev(x, y): the image feeds on itself (roadmap D2, first half)

**status:** every pixel was a pure f(x, y, t) with no memory; it now has one.
`prev(x, y)` is whitelisted (arity 2), transpiles to a sampler read of the
previous frame in the same aspect-corrected space as x/y, and returns the
previous CONTINUOUS scalar (-1..1), not the palette-mapped color. New
src/render/feedback.js: ping-pong textures + blitFramebuffer, allocated only
for formulas that use prev(). Resets on formula change, resize and display
crossfade. Tiles/thumbs/stats warm 6 frames before capture. Formulas without
prev() are byte-identical to before (alpha stays 1.0). 205 tests.

Measured on the GPU, not assumed: the first design (feeding back the canvas
color) collapsed to a fixed point in two frames because of the 4-color palette
quantizer — see ADR #22/#23 for the measurement and the fix.

**besluit:** s_ent / s_sym (previous-frame stats as formula variables) is the
remaining half of D2 and was deliberately not started. Next formula-ceiling
break after this: attractors (CPU histogram → texture), not B1.

## 2026-08-31 — Session 1 (iteration functions + strategy rotation)

**status:** the pattern-breakers: julia/ship/kali/orbit (arity 5, n as live
slider like fbm octaves, capped GLSL loops with smooth escape coloring) +
fold(v) promoted from reserved to real. 4 new iter.* families; nodeInsert
and randomExpr use fold; func_swap trades fractals among themselves. Pack
prompt teaches the new maps AND enforces 10 distinct strategies per
generation (§10 Lluminate). Verified: all four compile on GPU and render
structure (kali entropy 0.83). 201 tests. TODO items 1+2 done — next is
Clay's playing evening.

## 2026-08-31 — SESSION 1 CLOSE

**status:** one marathon session, empty folder → living instrument. Shipped:
v1 complete (parser→AST→GLSL, sliders, coords, sheets, snapshots, permalinks,
10 families) · v2 complete minus Sprott (all §6 operators, §7 filter, novelty,
lineage, ratings) · v3 zero-player (MAP-Elites + auto-explore) · multi-window
display sync + crossfade · param glide · modulator rack (drift/chase/pulse/
shuffle/glitch) · audio reactivity (tab/mic → ♪b/♪m/♪h per slider, r↔h focus)
· movable automations (←/→) + curve knob · live slider ranges (push/dblclick/
scroll, visible bounds) · family packs (AI prompt from user memory + paste
import, toggleable generations) · 5 palettes + tone clamp/wrap/fold (schema
v2) · capture-last-take (⏺ cap → ↺ gesture automation, rate=speed).
195 tests green, 20 commits, docs current.

**besluit:** next window starts at docs/TODO.md top: (1) julia/kali iteration
functions, (2) prompt strategy rotation, (3) Clay plays a real evening.
Read CLAUDE.md + docs/ROADMAP-SYMBIOSIS.md + docs/TODO.md for full context.
Gotcha for testing: background tabs throttle timers AND rAF — verify UI in a
foreground tab. Dev server: `npm run dev` (Clay runs it himself).

## 2026-08-31 — Session 1

**status:** fresh start → v1 in progress.
Done: Vite/vitest/singlefile scaffold; parser → AST → GLSL transpiler with §5 whitelist
and column-exact errors; WebGL2 fullscreen renderer (verified live in Chrome, 4-color
pixel LUT); constant extraction → auto-sliders with per-slider lock + reroll + reroll-all;
formula editor with debounce and caret error display. 51 tests green. §13 decided
(LUT / CPU attractors / lz-string), 13 ADRs logged.

**besluit:** sliders done; next step = coordinate toggle (cartesian/polar/toroidal),
then 3×3 contact sheet with const_tweak variants.

## 2026-08-31 — Session 1 (continued)

**status:** v1 nearly complete.
Added: per-slider LFO automation (sine/tri/walk, rate/depth, lock pauses);
coordinate toggle via u_coords uniform; 3×3 contact sheet (const_tweak variants,
click promotes); snapshot save/load (schema §4, zero stats until v2), archive
strip with thumbs + delete, JSON export/import (merge, ids win), lz-string
permalinks (verified across a full page reload). 78 tests green.

**besluit:** remaining v1 = family picker (§8, non-feedback families) + one
evening of real use (DoD). Stats stay zeroed until the v2 filter lands.

**status (later):** family picker shipped — 10 families (5 fields, 2 warps, worley,
superformula, truchet), all verified compiling & rendering live. Iterated families
and attractors deferred (ADR #15). Fixed: [hidden] vs display:flex bug that also
broke the `h` panel toggle. 92 tests green.

**besluit:** v1 feature-complete minus attractors. DoD check is on Clay: one full
evening in the tool without leaving it. Next build step: attractor density path
(CPU histogram → texture) or straight to v2 mutation operators — Clay's call.

## 2026-08-31 — Session 1 (v2)

**status:** Clay chose v2-first (audio/sequences/preference-learning parked until
this layer exists). Shipped in three commits: (A) all §6 operators + crossover +
LHS + AST printer, fuzz-tested; (B) §7 stats (raw-render), reject rules, novelty,
FFT; (C) UI — 'mut' sheet with masks (filtered, novelty-sorted, verified 8/8 live),
'xover', lineage strip with rating stars, archive sort new/top/novel, real stats
on every save. 143 tests green.

**besluit:** v2 complete except the Sprott button (parked with attractors) and
MAP-Elites-grade auto-explore (that's v3). v2 DoD is now measurable: ≥50 snapshots
rated ≥4 that Clay didn't type. Audio-reactivity is the natural next build once
the archive starts filling.

## 2026-08-31 — Session 1 (v3 zero-player)

**status:** Clay asked for algorithmic self-generating infinite visuals = §9 v3
auto-explore. Shipped: MAP-Elites grid (entropy × symmetry 10×10, persistent,
novelty-fitness), Explorer with 4 birth strategies (mutate/crossover/family-LHS/
random birth), 'auto' toggle — main view follows each discovery with provenance,
click a cell to take over. Verified live: 18 cells and 19/23 filter-passed in ~20s
on the dev machine. 151 tests green.

**besluit:** v3 remaining: LLM mutator, phase-diagram nav, lineage tree — plus the
parked attractors + Sprott. Clay's audio/sequence wishes stay queued behind those.

## 2026-08-31 — Session 1 (multi-window + symbiosis roadmap)

**status:** '⧉ out' opens display windows (?view=display): bare fullscreen
renderer driven over BroadcastChannel (sync/local.js — transport-agnostic
protocol: formula/params@30Hz/coords/hello). LFOs, promotes and zero-player
discoveries all flow to displays automatically. Verified live across two tabs.
155 tests green. Full multi-device/multi-human/symbiosis plan written:
docs/ROADMAP-SYMBIOSIS.md (phases A shipped / B instrument-panel / C relay +
any-device + MIDI / D input-is-output symbiosis, with session-sized steps).

**besluit:** next per roadmap: D1 (live input vars in1..in4 + routing table) —
highest leverage, smallest step. Then B1 cue/take.

## 2026-08-31 — Session 1 (B0: smoothness)

**status:** Clay: param changes jump and break the experience. Shipped B0:
param glide (0.5s smoothstep on every discrete change; dragging stays direct;
LFOs orbit the moving center; saves read glide targets) + display crossfade
(0.9s two-canvas fade on every formula swap, zero-player included). Roadmap
gained the audio×auto×human combination model (timescale hierarchy: genotype /
center / orbit; audio as enveloped automation source; beats as events).
157 tests green; glide verified live (reroll eased 0.637 → -1.436 over 6 frames).

**besluit:** audio lands later as an automation mode per the combination model —
through the same center±depth lens, with attack/release smoothing.

## 2026-08-31 — Session 1 (glitch + LFO defaults)

**status:** gl!tch button + chaos slider (core/glitch.js): Poisson-ish bursts
(30–260ms) spike a chaos-scaled subset of params with heavy-tailed offsets,
per-frame rejitter at high chaos, occasional 1-burst coords flip; render-time
overlay so base params/saves never move and recovery is exact; deliberately
bypasses glide (a glitch should tear). Displays glitch along. LFO rate & depth
now both START AT 0 — enabling automation is silent until raised. 163 tests.

**besluit:** glitch is the first "performance gesture" from roadmap phase B
territory; next candidates stay D1 (input vars) or B1 (cue/take).

## 2026-08-31 — Session 1 (modulator rack + random start)

**status:** glitch generalized into ModStack (core/modulators.js): drift /
chase / pulse / shuffle / gl!tch, each toggleable with amount+rate in the new
'mods' panel; smooth mods fade in/out 0.8s, all render-time overlays, additive,
range-clamped. Glitch got a rate knob (burst frequency). Startup randomized:
rerolled family or random birth — verified two loads give two different
formulas. 171 tests green.

**besluit:** the rack is the future home of audio bands, remote inputs and
gesture playback (roadmap). Next: D1 input vars or B1 cue/take.

## 2026-08-31 — Session 1 (audio reactivity + random-start fix)

**status:** audio capture (♪tab = share a Chrome tab with audio — macOS way to
system sound; ♪mic = mic/BlackHole) → pure DSP (bass/mid/high levels with
asymmetric envelopes + spectral-flux beat pulses) → per-slider automation
modes ♪b/♪m/♪h. Rate knob morphs to r↔h (focus: hardness ↔ rhythm), depth =
amount; silence sits exactly on center. Fixed random start: permalink hash is
consumed-then-stripped, and 'link' copies without touching the URL. 179 tests.

**besluit:** every param×band×focus combination is now an experiment, as
intended. Real-music tuning of envelope constants is Clay's ear-work.

## 2026-08-31 — Session 1 (movable automation)

**status:** ←/→ in the automation sub-row moves a full automation setup
(mode + rate/focus + depth) to the neighbouring param, as a swap (wraps,
nothing lost); center and phase stay with their param, the abandoned param
settles on its center. Slider automation UI refactored around refreshAutoUI.
Verified live: sine walked a→b→c carrying its settings. 180 tests.

## 2026-08-31 — Session 1 (visible ranges + automation curves)

**status:** range bounds are now VISIBLE per slider (min/max labels flanking
it, green flash when a bound moves) + a permanent hint line explaining the
three gestures. Automations gained a curve knob (crv, -1..1): sign-preserving
power curve à la DAW automation — negative = blocky/dwells at extremes,
positive = spiky/hugs center; shapes LFO waves AND the audio response, moves
along with ←/→ swaps. 190 tests.

## 2026-08-31 — Session 1 (family packs: AI generations)

**status:** family packs = AI-generated GENERATIONS of 10 formulas, kept apart
and toggleable ('packs' panel: ●/○ per pack, ✕ delete, paste-import with full
parse→transpile validation per formula). 'copy AI prompt' builds a generation
prompt live from the user's memory: rated snapshots (strongest signal), saves,
origin/coords habits, elites discoveries, existing pack names. Enabled packs
feed the picker (optgroup per generation) AND the zero-player gene pool.
Tested end-to-end live: prompt captured Clay's real taste (extreme constants,
toroidal radials, warp.fbm), 10/10 formulas imported as 'overdrive-spirits',
family loads clean, toggle removes/restores the generation. 187 tests.
Docs: docs/FAMILY-PACKS.md.

## 2026-08-31 — Session 1 (live slider ranges)

**status:** slider extremes are movable, directly on the slider: push against
an end and it ratchets outward (+60% per 350ms while pinned); double-click
re-centers the range tightly around the current value; scroll wheel zooms the
range in/out. Out-of-range setValue targets (rerolls, promotes, loads) widen
the range automatically with 10% headroom. Automation depth and mod/glitch
clamps follow the live range. Verified live: 28.8→53.4→92.9 ratchet,
dblclick re-center, wheel zoom.
