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
