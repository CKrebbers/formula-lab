# ADR 001 — Audiovisual layer: one formula, image AND sound

2026-09-01 · status: accepted — phases 1, 2 and 3 shipped (see CHANGELOG)

## Principle

The existing AST **is** the IR. The split happens after `parse()`:

```
source → parse() → AST ─┬→ transpile()   (core/glsl.js, exists)  → shader
                        └→ emitJS()      (core/js.js, new)       → AudioWorklet
```

No second parser, no second math implementation. `emitJS()` compiles the same
AST to a JS function body; a JS helper library (`core/jsruntime.js`, `FL`)
mirrors the GLSL helpers (`fl_hash`, `fl_fbm`, `fl_julia`, bitwise, `fold`, …)
line for line. A tree-walking reference evaluator (`core/interp.js`) is the
third, independent leg the parity tests stand on.

## Files touched / added

- **new** `src/core/jsruntime.js` — FL helper lib. Zero imports (worklet-embeddable).
- **new** `src/core/js.js` — `emitJS(ast)` + `compileFormula(ast)` (`new Function`, never eval of user text — the AST is already whitelisted).
- **new** `src/core/interp.js` — reference AST interpreter (tests + honesty check).
- **new** `src/audio/dsp.js` — pure DSP core, zero imports: NaN-guard → DC-blocker (20 Hz) → peak-normalizer (slow release) → tanh limiter, all at 4× oversampling, then 64-tap polyphase FIR decimation. Crossfade 20 ms between old/new formula at the raw-formula stage (single chain state, no gain jumps). Runs identically in Node (tests) and in the worklet.
- **new** `src/audio/worklet-glue.js` — `registerProcessor` shell, zero imports.
- **new** `src/audio/synth.js` — main-thread controller. Builds the worklet module ONCE as a Blob of `jsruntime.js?raw + dsp.js?raw + worklet-glue.js?raw` (Vite `?raw`); formulas travel by `postMessage` (compiled with `new Function` inside the worklet) — no `addModule` per formula, no clicks.
- **new** `src/ui/scope.js` — XY-plot overlay for parametric formulas, drawn from the *same* compiled JS function the worklet runs, on the audio clock.
- **edit** `src/main.js`, `index.html` — snd/vol controls + wiring in `applyFormula` and the frame loop. Existing renderer, parser, cue/take, presets untouched.

## Modes

- **Parametric** (formula uses no spatial vars — only `t`, `i`, `mx`, `my`):
  top-level `vec2(a, b)` → L/R; scalar → mono. Image = XY/waveform plot from the
  same compiled function. `t` is real seconds on the shared phase clock — audible
  formulas contain audio-rate terms (`sin(440*6.283*t)`), exactly what the plot draws.
- **Field** (phase 3): x/y driven at audio rate along a scan path (line / spiral /
  Lissajous) through the same field the shader draws; `t` stays the shared slow clock,
  so image and sound are literally the same field at the same moment.

## Semantics pinned here

- `prev(x,y)` → 0 in the audio backend (there is no frame buffer at 48 kHz); such
  formulas stay image-only until a feedback story exists. `dx`/`dy` → 0 in audio.
  `i` = output-sample index. Documented, not hidden.
- JS runs float64, the GPU float32. Parity: reference ↔ emitJS at 1e-6 (both f64);
  reference ↔ GLSL via readPixels with a float32-realistic tolerance, and the
  chaotic hash-based helpers compared structurally (they amplify last-bit noise).
- Audio follows the panel (cue) formula, like the panel canvas — you hear what
  you see. Editor's existing 250 ms debounce is reused instead of adding a second
  300 ms timer; the 20 ms crossfade handles the swap.

## Risks

1. **f32/f64 divergence in hash/fbm/iterated maps** — GLSL parity can't be 1e-6
   there; mitigated by the three-legged test (interp ↔ emitJS strict, GLSL loose).
2. **Worklet single-file build** — `?raw` + one Blob module is the plan; verified
   in dev AND `vite build` (singlefile) before phase 1 closes.
3. **Perf on the 2014 iMac** — budget test (< 1 ms / 128-frame block) runs in Node;
   the real machine is verified by ear/dropout counter in the UI status.
4. **CI browser tests** — GLSL parity/e2e/OfflineAudioContext need a browser:
   Playwright (dev-dep only, motivated here) as `npm run test:browser`, added to CI
   next to `npm test`.

## Non-goals

No audio analysis, no FFT-to-image coupling, no new runtime dependencies, no
changes to preset storage beyond the phase-3 stats addition (which gets its own
schema bump + migrate + ADR line).
