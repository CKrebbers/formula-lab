FORMULA LAB — Project Brief (rewritten 2026-09-01, reflects actual built state)

0. One-sentence goal
A browser-based lab where a formula f(x, y, t) → color is typed, mutated, filtered,
performed and archived, so the user discovers formulas that produce interesting
visuals — the value is in the search mechanism and the live instrument, not in
rendering fidelity.

1. Who this is for
- Solo user: Clay — live-AV artist / creative technologist, uses TouchDesigner
  (GLSL TOP), has a Node.js CLI AV system called NEXUS that sends OSC to TD
  (WebSocket 8080). NEXUS must never be touched.
- Aesthetic: glitch, texture, pixel art, dither, CRT, digital magic realism.
  Not smooth, not polished, not corporate.
- Hardware: iMac 27" Late 2014 (max macOS Big Sur 11.7, Radeon R9 M295X) +
  MacBook Air 2024. → WebGL2 only. No WebGPU. Must run on the 2014 GPU.
- Works in long sessions, thinks in modules/ecosystems, CLI-first, cost-conscious,
  uses multiple LLMs (Claude, Gemini, Grok, local Ollama).
- Known pattern (self-reported): builds systems too complex to sustain, stops
  before they pay off. Every phase must be independently usable and shippable.
- Conversation language: Dutch. Code, comments, commits, docs, UI: English.

2. Non-negotiable decisions (unchanged)
| Decision | Choice |
|---|---|
| Runtime | Browser, vanilla ES modules, no framework |
| Build | Vite dev; vite-plugin-singlefile → distributable dist/index.html |
| Rendering | WebGL2 fragment shaders; formula transpiled to GLSL |
| Genotype | AST with a fixed, whitelisted function set (not CPPN) |
| Persistence | localStorage + JSON export/import. No backend, no auth, no gallery |
| Language | Vanilla JS + JSDoc. No TypeScript, no React/Vue/Svelte, no CSS framework |
| Snapshot schema | Versioned + migrate() from day one |

3. CURRENT STATUS (2026-09-01, updated after the play-face session)

SINCE THE SECTION BELOW WAS WRITTEN: the formula language gained `prev(x, y)`
(feedback), `dx`/`dy` (pixel step) and bitwise helpers, and the panel gained the
cue/take program–preview model, a dice, and a starters strip. Read
docs/CHANGELOG.md top entries before assuming anything about the panel's
broadcast behaviour: formulas now reach the displays only on TAKE.

Built in one marathon session (24 commits, ~5,500 lines, 201 vitest tests green,
single-file build ~94 kB). v1, v2 and v3's zero-player are DONE, plus a large
amount of instrument/live work that was originally scheduled for v4.

WORKING RIGHT NOW:
- Formula editor with column-exact parse errors; whitelist enforced; never eval.
- Auto-sliders per numeric literal, with LIVE ranges (push an end = stretch,
  » « arrows = shorten toward current value with hold-to-repeat, scroll = zoom
  proportional to wheel delta, dblclick = re-center), visible min/max labels
  that flash on change.
- Per-slider automation: off / sine / tri / walk / ♪bass / ♪mid / ♪high /
  ↺ gesture. Knobs: rate (or r↔h focus for audio, spd for gesture), depth,
  curve (-1..1 DAW-style shaping). Automations are movable between params
  with ←/→ (swap). Rate and depth start at 0 — enabling is silent.
- Capture last take (⏺ cap): a 30 s rolling history per param; captures each
  param's most recent stretch of movement as a looping ↺ gesture automation.
- Param glide: every discrete change (reroll, promote, load) eases over 0.5 s.
  Dragging stays direct. Saves read glide TARGETS, never transition frames.
- Coordinate toggle (cart/polar/torus), 5 palettes (hollow/gameboy/cga/amber/
  fire), tone mapping (clamp/wrap/fold), quantized/smooth toggle — all uniforms,
  no recompiles.
- Modulator rack (mods panel): drift / chase / pulse / shuffle / gl!tch, each
  with on/off + amount + rate. Render-time overlays: base params never move.
  Smooth mods fade in/out 0.8 s; glitch deliberately tears.
- Audio reactivity: ♪ tab (share a Chrome tab with audio — the macOS route to
  system sound) or ♪ mic (mic / BlackHole loopback). Bands with 30 ms attack /
  350 ms release + spectral-flux beat pulses.
- Search: all §6 mutation operators + crossover + LHS sampling; 3×3 tweak sheet
  and 'mut' mutation sheet (masked all/const/struct, §7-filtered, novelty-sorted);
  'xover' with a random archived snapshot.
- Zero-player ('auto'): Explorer births candidates via mutate / crossover /
  family-LHS-reroll / random birth, filters them, and fills a 10×10 MAP-Elites
  grid (entropy × symmetry, novelty fitness, persistent). Main view follows each
  discovery; discoveries also mutate palette/tone. Typing or picking a cell
  hands control back.
- Archive: save/load with real stats, 64×64 thumbs, ratings (stars in the
  lineage strip), lineage parent/child navigation, sort new/top/novel, JSON
  export/import, lz-string permalinks (consumed then stripped from the URL so
  the next launch is random again).
- Family library: 14 built-ins (5 field, 2 warp, worley, superformula, truchet,
  4 iterated fractals) + AI-generated family packs.
- Family packs: 'copy AI prompt' builds a generation prompt from the user's real
  memory (rated snapshots, saves, habits, elites); paste the model's JSON back
  and it imports as a separate, toggleable generation. See docs/FAMILY-PACKS.md.
- Multi-window: '⧉ out' opens ?view=display — a bare fullscreen renderer driven
  over BroadcastChannel, with a 0.9 s crossfade on every formula swap. Needs a
  served origin (file:// isolates BroadcastChannel).
- Random start: no permalink → a rerolled family (75%) or a random-born
  formula (25%). Every launch begins somewhere else.

4. Architecture (as built)
src/
  main.js            # role router + control-panel wiring (the big one)
  display.js         # ?view=display: bare renderer, crossfading layers
  core/
    ast.js parser.js print.js glsl.js constants.js automate.js glitch.js modulators.js
  render/
    gl.js tile.js thumbs.js
  search/
    mutate.js crossover.js walk.js sample.js filter.js fft.js novelty.js elites.js explore.js
  store/
    snapshot.js archive.js url.js
  sync/
    local.js         # BroadcastChannel; transport-agnostic {type, payload}
    hub.js           # Varve hub link (APC40/LPD8), only with ?hub=ws://… (ADR #31)
  audio/
    engine.js analysis.js
  ui/
    editor.js sliders.js sheet.js archive.js lineage.js elites.js mods.js packs.js families.js
  families/
    index.js packs.js prompt.js + one file per family
tests/               # 16 vitest files, 201 tests
docs/
  CHANGELOG.md DECISIONS.md TODO.md ROADMAP-SYMBIOSIS.md FAMILY-PACKS.md GROK-BRIEFING.md

Rules:
- core/, search/, store/ have no DOM dependency — testable in Node.
- Any new capability = new module, not a bigger existing one. Max ~300 lines/file.
- main.js is the exception (wiring) and is already long; prefer extracting to ui/.

5. Formula language (current whitelist)
Variables: x, y (−1..1, aspect-corrected), t (seconds), r, th (polar), mx, my
(mouse), i (pixel index).
Functions: sin cos tan atan atan2 abs floor fract mod pow sqrt exp log min max
clamp mix step smoothstep length sign fold
Noise: noise(x,y) fbm(x,y,octaves) worley(x,y) hash(x,y)
Iterated maps (arity 5, n = iterations, capped GLSL loops):
  julia(zx,zy,cr,ci,n) ship(zx,zy,cr,ci,n) kali(px,py,cx,cy,n) orbit(zx,zy,cr,ci,n)
Operators: + - * / ^ ( ) and comparisons < > == (return 0/1).
Output: scalar (→ palette), or top-level vec2(dx,dy) (domain warp) or vec3(r,g,b).
vec2/vec3 only as the outermost call (ADR #4).
Hazard: never ^ / sqrt / log on possibly-negative values (undefined on GPU) —
use abs() or length(a,b).
Reserved for later: prev(x,y) (feedback buffer), in1..in4 (live inputs).

6. Snapshot schema (v2 — current)
Same as v1 plus display style. Fields: schema(2), id, created, parent_ids, origin
(typed|mutate|crossover|sample|llm|family), operator, family, formula{source,ast},
params, locks, coords, palette(int), smooth(bool), tone(0=clamp|1=wrap|2=fold),
seed, time, stats{entropy,edge_density,color_variance,symmetry,spectral_flatness},
thumb, tags, rating, notes.
migrate() upgrades v1 → v2 on read (archive AND elites). Never change the schema
silently: bump, migrate, log in DECISIONS.md.

7. Interestingness filter (§7, implemented)
Stats computed on 128×128 PALETTE-FREE renders (u_raw) at t=0 and t=1, averaged.
Reject: entropy < 0.15 (flat) · entropy > 0.97 && edge_density > 0.6 (noise) ·
color_variance < 0.005. Novelty = min L2 distance of the luminance histogram to
archived thumbs — and novelty uses PALETTE pixels, because archive thumbs are
palette renders (ADR #18).

8. What to work on next
docs/TODO.md is the ordered backlog and the single source of truth for "what now".
Top of that list right now: Clay plays a real evening (the v1/v2 DoDs are
usage-based; the friction list from that evening reorders everything else).
After that, in order: cue/take with crossfade → XY pad / macros / tap-tempo →
LAN relay + ?view=instrument for phones/iPads → multi-touch + MIDI into one input
bus → in1..in4 as formula variables (highest symbiosis leverage) → feedback
buffer + self-reading stats → implicit preference learning → gesture-as-genotype
→ meta-formulas. Parked: attractors + Sprott button, in-app LLM mutator,
phase-diagram nav, lineage tree, post-FX/dither, OSC bridge, exports.

9. Do NOT
- No framework, state library, CSS framework, TypeScript.
- No backend, database, auth, or public gallery.
- Do not touch anything in the NEXUS repo. Do not use WebGPU.
- Do not implement CPPN unless AST mutation is measured to fail > 20%.
- Do not change the snapshot schema silently.
- Do not build features "for later": every commit leaves the tool usable.

10. Working agreement
- Session opens with status: (what works, what's broken, current phase) — read
  docs/CHANGELOG.md and docs/TODO.md first. Session closes with besluit:
  (done / parked / next step) appended to docs/CHANGELOG.md.
- Small conventional commits (feat(parser): …, fix(filter): …). npm test before
  every commit; add a test for every bug fixed.
- When a decision is needed that this file doesn't cover: make it, log one line
  in docs/DECISIONS.md, continue. Clay steers on results, not pre-approval.
- Keep answers short; no summaries of what was just built — the diff is the
  summary. Verify UI work live in the browser, not just via tests.
- TESTING GOTCHA: background Chrome tabs throttle BOTH timers and rAF. Anything
  time-based (LFOs, glide, capture, crossfade, zero-player) must be verified in
  a foreground tab or through the Node test suite.
- Clay runs the dev server himself (`npm run dev`); don't leave one running.

11. References
Karl Sims Genetic Images · Lluminate (joelsimon.net/lluminate) · AI Co-Artist
(arxiv 2512.08951) · Quilez domain warping (iquilezles.org/articles/warp) ·
tixy.land · viznut bytebeat · Sprott "Automatic generation of strange attractors"
· McCormack & Gambardella, Quality-Diversity for Aesthetic Evolution (EvoMUSART
2022) · dotsimulate GLSL Creator LOP.

12. First prompt for a fresh session
Read CLAUDE.md, docs/CHANGELOG.md (last entries) and docs/TODO.md. Report status
in three lines, then propose the next step from the top of TODO.md and wait.
