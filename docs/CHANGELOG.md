# Changelog

<!-- Session entries are appended at close with status / besluit per §12. -->

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
