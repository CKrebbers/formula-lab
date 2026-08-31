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
