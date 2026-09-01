# Handoff — state of the repo, 2026-09-01 (end of the AV sessions)

Read this after CLAUDE.md and the top two CHANGELOG entries. It holds what the
diff does not say: what is running, what will bite, and what is deliberately
unfinished.

## Where the code stands

- **AV layer shipped**: one AST → `emitGLSL` (image) and `emitJS` (sound).
  Phases 1–3 (parametric f(t), parity + test harness, field scan paths) plus a
  hardening pass. Plan: `docs/adr/001-av-layer.md`. Decisions: DECISIONS #31–#39.
- **Tests**: 383 unit (30 files, `npm test`, ~1 min) + 29 browser
  (4 specs, `npm run test:browser`, ~3 min, includes a 30 s realtime run and
  a zero-player run that waits for a real off-thread measurement).
  Single-file build 186 kB (the inline stats worker is +33 kB of it).
- **A1 shipped (ADR #42)**: the zero-player ranks on `stats.audio.pre` too.
  `search/avnovelty.js` (descriptor + fitness), `audio/stats-worker.js` +
  `audio/stats-remote.js` (the same `computeAudioStats`, off-thread, 6 s
  budget). Unheard formulas are judged on image alone.
- **Git**: clean tree, **13 commits ahead of origin/main, not pushed**. Pushing
  to main deploys to GitHub Pages *and* varve.nl/formula-lab over SSH, and the
  CI gates on both suites. Clay decides when that happens.
- **Schema is v4** (was v2 before these sessions): `scan` + `stats.audio`.
  `migrate()` covers v1→v2→v3→v4, tested against frozen fixtures.

## Things that will bite

1. **250 ms of silence before the first sound is intentional** (ADR #37). The
   DC chain cannot know a formula's offset before it has watched one mean
   window, and faking it made `t*8000` pin the limiter. Not a bug to "fix".
2. **The AudioContext runs at 44.1 kHz on Clay's Macs.** Never hardcode 48000
   when converting quanta or frames to seconds — that mistake once looked like
   a 2.4 s dropout deficit that did not exist. `DropoutMeter.report()` carries
   `sampleRate`; use it. Node tests pin 48 kHz explicitly, which is fine.
3. **Sound follows the CUE, not the program.** You hear what the panel is
   editing. Display windows (`?view=display`) are silent by design.
4. **`prev()`, `dx`, `dy` are 0 in the audio backend.** `compileFormula()`
   returns them as `silent`; the panel prints a line under the editor and
   `stats.audio.silent` records it. Do not let a future change make
   `stats.audio` imply a whole formula was heard.
5. **Goldens are tolerance-compared, not hashed** (ADR #39). Regenerate only
   deliberately (`UPDATE_GOLDEN=1 npx vitest run tests/golden.test.js`). Two
   guards exist because this file once went vacuous while staying green: every
   fingerprint must have rms > 1e-3, and no two may be identical.
6. **The mutation test writes `src/core/js.__mutant_*__.js` and deletes them.**
   Gitignored in case a crash leaves one behind. If imports start behaving
   oddly, check for a straggler.
7. **Browser tests need Chrome flags** (`--enable-unsafe-swiftshader`,
   `--autoplay-policy=no-user-gesture-required`) — already in
   `playwright.config.js`. In the real app, audio needs one genuine click.
8. **Background tabs throttle timers AND rAF.** Verify anything time-based in a
   foreground tab or in Node.
9. **`cam()` reads 0 wherever no camera runs** — tiles, thumbs, §7 stats, the
   audio backend, and displays until their own getUserMedia resolves. The
   renderer binds a 1×1 mid-gray on texture unit 1; unit 0 stays the feedback
   pass. `mot` IS heard in audio (rides the params message). ADR #41.

## Deliberately unfinished

- **The image/sound balance in the zero-player is designed, not fitted.**
  The descriptor's scale was set from the family corpus (median pairwise
  0.148); histogram novelty was never measured against it. If `auto` starts
  filling cells on sound alone, or never on sound, the average in
  `avFitness` is where to look — and the elites tooltip shows both halves.
  Also: a step now waits for its measurement, so `auto` crawls on fbm/curl.
- **`prev()` has no audio story.** Either give the worklet a feedback buffer at
  audio rate, or decide feedback stays image-only and say so in §5 of CLAUDE.md.
- **Chrome's `renderCapacity`** was absent in this build, so the dropout meter
  has no second opinion; its negative control is what validates it. If a Chrome
  ever exposes it, `tests/browser/dropouts.spec.js` already reads it.
- **Chaotic goldens across engines**: tolerance absorbs ULP noise but not a
  julia/kali escape-time decision flipping on another JS engine. It now fails
  with a number attached instead of "hash mismatch".
- **Scan paths are fixed shapes.** No row-count or per-path parameters; the
  `line` path is hardcoded to 64 rows.

## Verifying by hand

`npm run dev` → http://localhost:5173, then:
`vec2(sin(440.0*6.283*t), sin(662.0*6.283*t))` + `▶ snd` (Lissajous in the
scope) · a starter like Kaliset + the scan-rate slider (field becomes pitch) ·
the Trails starter (prev() note appears) · a heavy iterated formula until the
status line reports dropouts — that is how to find this machine's ceiling.
