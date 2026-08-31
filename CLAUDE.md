FORMULA LAB — Project Brief for Claude Code

0. One-sentence goal
A browser-based lab where a formula f(x, y, t) → color is typed, mutated, filtered and archived, so the user discovers formulas that produce interesting visuals — the tool's value is in the search mechanism, not in rendering quality.

1. Who this is for
	•	Solo user: Clay — live-AV artist / creative technologist, uses TouchDesigner (GLSL TOP), has an existing Node.js CLI AV system called NEXUS that sends OSC to TouchDesigner (WebSocket port 8080; its manifest, "three pillars" and OSC variables must never be touched).
	•	Aesthetic: glitch, texture, pixel art, dither, CRT, digital magic realism. Not smooth/polished.
	•	Hardware: iMac 27" Late 2014 (max macOS Big Sur 11.7, Radeon R9 M295X) + MacBook Air 2024. → Target WebGL2 only. No WebGPU. Must run acceptably on the 2014 GPU.
	•	Works in long sessions, thinks in modules/ecosystems, prefers CLI-first, cost-conscious, uses multiple LLMs (Claude, Gemini, local Ollama).
	•	Known pattern (self-reported): builds systems too complex to sustain, stops before they pay off. Every phase must be independently usable and shippable.

2. Non-negotiable decisions
Decision
Choice
Why
Runtime
Browser, vanilla ES modules, no framework
2014 GPU, zero build friction, portable
Build
Vite for dev; vite-plugin-singlefile for a distributable dist/index.html
Single HTML file can be opened anywhere
Rendering
WebGL2 fragment shaders; formula transpiled to GLSL
JS-per-pixel is too slow
Genotype
AST with a fixed, whitelisted function set (see §5). Not CPPN (revisit only if AST mutation breaks >20% of the time)
Simplest thing that supports structural mutation
Persistence
localStorage + JSON export/import. No backend, no auth, no accounts, no public gallery
Solo tool
Language
Code, comments, commits, docs: English. UI labels: English.
Consistency
Snapshot schema
Frozen in §4 before any UI is written. Versioned.
Everything downstream depends on it
Phasing
v1 → v2 → v3 → v4 strictly in order. No v4 (MIDI/TD) work before v2 is done
v4 is Clay's comfort zone; v2 is where the value is

3. Architecture
src/
  main.js              # bootstrap, wires modules
  core/
    ast.js             # AST node types, validate, clone, serialize
    parser.js          # text → AST (Pratt/recursive-descent, whitelist)
    glsl.js            # AST → GLSL fragment shader source
    constants.js       # extract/replace numeric literals (auto-sliders)
  render/
    gl.js              # WebGL2 context, compile, uniforms, fullscreen quad
    tile.js            # small offscreen renderer for contact sheets / thumbnails
    postfx.js          # dither / quantize / pixelate / CRT passes (v4)
    feedback.js        # ping-pong framebuffers, prev frame as sampler (v4)
  search/
    mutate.js          # mutation operators (§6)
    crossover.js       # subtree crossover
    sample.js          # random + Latin-hypercube parameter sampling
    filter.js          # interestingness stats + threshold (§7)
    novelty.js         # thumbnail-histogram distance archive (§7)
    elites.js          # MAP-Elites grid (v3)
    llm.js             # LLM mutator, provider-agnostic (v3)
  store/
    snapshot.js        # schema, validate, migrate
    archive.js         # localStorage CRUD, lineage queries
    url.js             # permalink encode/decode (lz-string)
  ui/
    editor.js          # formula textarea, error display
    sliders.js         # auto-generated sliders + lock toggles
    sheet.js           # contact sheet grid
    lineage.js         # parent/child navigation (v2), tree view (v3)
    families.js        # starter library picker
  families/
    index.js           # registry
    *.js               # one file per formula family (§8)
tests/                 # vitest: parser, glsl transpile, mutate, filter, snapshot migrate
docs/
  DECISIONS.md         # append-only ADR log
  CHANGELOG.md
Rules:
	•	core/ and search/ have no DOM dependency — testable in Node.
	•	Any new capability = new module, not a bigger existing one.
	•	Max ~300 lines per file. Split when exceeded.

4. Snapshot schema (v1 — frozen)
{
  "schema": 1,
  "id": "uuid-v4",
  "created": "2026-08-31T20:00:00Z",
  "parent_ids": [],
  "origin": "typed | mutate | crossover | sample | llm | family",
  "operator": "op_swap | const_tweak | ... | null",
  "family": "attractor.clifford | warp.fbm | ... | null",
  "formula": {
    "source": "sin(x*y + t) + cos(a*x)",
    "ast": { "...serialized AST..." }
  },
  "params": { "a": 1.7, "b": -1.3 },
  "locks": { "a": false, "b": true },
  "coords": "cartesian | polar | toroidal",
  "seed": 123456789,
  "time": 0.0,
  "stats": {
    "entropy": 0.0,
    "edge_density": 0.0,
    "color_variance": 0.0,
    "symmetry": 0.0,
    "spectral_flatness": 0.0
  },
  "thumb": "data:image/png;base64,... (64x64)",
  "tags": [],
  "rating": null,
  "notes": ""
}
	•	params holds every numeric literal extracted from source, named a, b, c… in order of appearance (user may rename).
	•	stats are computed from a 128×128 render at time = 0 and at time = 1.0 (average), so time-only formulas don't score as "flat".
	•	Migration function migrate(snapshot) must exist from day one, even if it's identity.

5. Formula language
Inputs available in every formula: x, y (normalized −1..1, aspect-corrected), t (seconds), r, th (polar, derived), mx, my (mouse, −1..1), i (pixel index, for tixy-style).
Whitelisted functions (v1): sin cos tan atan atan2 abs floor fract mod pow sqrt exp log min max clamp mix step smoothstep length sign Whitelisted noise (v1, implemented as GLSL helpers): noise(x,y) fbm(x,y,octaves) worley(x,y) hash(x,y) Operators: + - * / ^ ( ) and comparison < > == (returns 0/1). Reserved (v2): fold(v) = abs(mod(v,2)-1), iter(expr, n) for iterated maps, prev(x,y) = previous frame (v4).
Output modes (formula returns):
	•	scalar → grayscale, or mapped through a palette LUT
	•	vec3(r,g,b) → color directly
	•	vec2(dx,dy) → interpreted as displacement / flow field (rendered as domain warp on a base pattern)
Parser must reject anything outside the whitelist with a readable error at the exact column. Never eval.

6. Mutation operators (v2)
Each operator is a pure function (ast, rng, opts) → ast. Log which operator produced each child (snapshot.operator).
	1	const_tweak — Gaussian perturb one or more constants (σ configurable; respects locks)
	2	const_reroll — replace one constant with a fresh sample in its inferred range
	3	op_swap — swap operator (+↔*, sin↔cos, min↔max, floor↔fract)
	4	func_swap — replace a function with another of the same arity
	5	node_insert — wrap a random subtree in a function (abs, fract, fold, sin)
	6	node_delete — replace a subtree with one of its children
	7	subtree_replace — replace a subtree with a random small expression
	8	var_swap — swap x↔y, x↔t, x↔r etc.
	9	coords_flip — cycle cartesian → polar → toroidal (cheap multiplier, always try)
	10	crossover(a, b) — swap a random subtree between two parents
Masked mutation: opts.mask ∈ {constants, structure, coords, all} so the UI can offer "mutate palette/geometry/timing only".
Sampling: use Latin-hypercube when rerolling ≥ 3 constants at once.

7. Interestingness filter + novelty (v2)
Compute on a 128×128 render (both t=0 and t=1):
	•	entropy — Shannon entropy of luminance histogram (64 bins)
	•	edge_density — fraction of pixels where Sobel magnitude > threshold
	•	color_variance — variance of RGB
	•	symmetry — 1 − mean |img − mirror(img)| over H and V mirrors
	•	spectral_flatness — geometric/arithmetic mean of FFT magnitude (via small JS FFT on luminance)
Reject before showing to user if:
	•	entropy < 0.15 (flat) or entropy > 0.97 && edge_density > 0.6 (pure noise)
	•	color_variance < 0.005
	•	shader compile error or NaN detected (render a known pixel, check isNaN)
Thresholds live in one config object; expose in a debug panel.
Novelty-lite: keep the 64×64 thumb of every archived snapshot; a candidate's novelty = min L2 distance of its luminance histogram to all archived thumbs. Sort contact sheet by novelty descending. Later (v3) this becomes the MAP-Elites descriptor.

8. Formula family library
One module per family, each exporting { id, name, source, params, coords, notes, ref }. Ship these in v1 with sane default constants; v2 lets mutation cross families.
Scalar fields
	•	field.trig — sin(a*x*y + t) + cos(b*x)
	•	field.tixy — sin(t - sqrt((x-a)^2 + (y-b)^2) * c)
	•	field.interference — sum of 3–5 circular waves with different centers/frequencies
	•	field.chladni — sin(n*pi*x)*sin(m*pi*y) - sin(m*pi*x)*sin(n*pi*y)
	•	field.moire — two rotated grids: sin(a*x) * sin(a*(x*cos(th)+y*sin(th)))
Noise / warp
	•	warp.fbm — fbm(x + a*fbm(x+t, y), y + b*fbm(x, y+t)) (Quilez domain warp)
	•	warp.curl — curl of fbm as displacement
	•	noise.worley — worley(x*a, y*a) with distance-metric variant
Iterated / complex
	•	iter.julia — escape-time z → z² + c, c = (a, b), iter(…, 32)
	•	iter.burningship, iter.newton (cubic)
	•	iter.kaliset — p = abs(p)/dot(p,p) - c repeated N times, color by accumulated length
	•	iter.orbit_trap — any of the above colored by min distance to a line/circle
Attractors (rendered as density: iterate on CPU for v1 into a 2D histogram texture, GPU later)
	•	attractor.clifford — x' = sin(a*y) + c*cos(a*x); y' = sin(b*x) + d*cos(b*y)
	•	attractor.dejong — x' = sin(a*y) - cos(b*x); y' = sin(c*x) - cos(d*y)
	•	attractor.svensson, attractor.gumowski_mira, attractor.hopalong, attractor.ikeda
	•	attractor.sprott_quadratic — 12-coefficient quadratic map; include Sprott's random-coefficient search + Lyapunov test as its own "find" button (this is the Sprott filter)
Simulation (v4, needs feedback buffer)
	•	sim.grayscott — reaction-diffusion; include f/k phase-diagram presets
	•	sim.life, sim.lenia, sim.rule30
Shape / distribution
	•	shape.superformula — Gielis, 6 params, polar coords
	•	shape.phyllotaxis — golden-angle dots
	•	shape.truchet — tile rotation grid from hash
	•	shape.lissajous — sin(a*t + p1), sin(b*t + p2) traced with decay
Bit / glitch
	•	bit.bytebeat_pixel — (i * (i >> 8 | i >> 9) & 46 & i >> 8) ^ (i & i >> 13 | i >> 6) style on integer pixel index (needs integer ops in GLSL ES 3.0)

9. Phases and definition of done
v1 — Sandbox
	•	[ ] Parser → AST → GLSL; formula compiles and renders fullscreen at 60fps
	•	[ ] Auto-sliders for every constant, with lock toggle and reroll button per slider
	•	[ ] Coordinate toggle (cartesian / polar / toroidal)
	•	[ ] 3×3 contact sheet: 8 const_tweak variants + original, click = promote to main view
	•	[ ] Snapshot save/load (localStorage), export/import JSON, permalink URL
	•	[ ] Family picker with all §8 families that don't need feedback buffers
	•	[ ] Tests: parser (valid/invalid), transpile golden files, snapshot migrate
	•	DoD: Clay uses it for one full evening and never has to leave the tool.
v2 — Discovery
	•	[ ] All §6 mutation operators + masked mutation
	•	[ ] Interestingness filter + novelty-lite, contact sheet sorted by novelty
	•	[ ] Latin-hypercube sampling
	•	[ ] Lineage: every snapshot stores parent_ids; UI shows parents/children, "branch from here"
	•	[ ] Thumbnail gallery of archive with sort by date / rating / novelty
	•	[ ] Sprott random-search button for attractor.sprott_quadratic
	•	DoD: after 20 sessions the archive contains ≥ 50 snapshots Clay rates ≥ 4/5 that he did not type by hand.
v3 — Intelligence
	•	[ ] MAP-Elites grid: axes = entropy × symmetry (configurable), 10×10 cells, each cell keeps the highest-rated snapshot; click cell = load
	•	[ ] Auto-explore mode: background loop sample → filter → place in grid, N iterations, no user input
	•	[ ] LLM mutator (§10), provider-agnostic (Anthropic, OpenRouter, Ollama endpoints via config)
	•	[ ] Phase-diagram navigation for Gray-Scott and Julia (precomputed coarse map, click to jump)
	•	[ ] Lineage tree view (d3-hierarchy or hand-rolled)
	•	DoD: auto-explore finds ≥ 5 grid cells per session that Clay would not have found manually.
v4 — Performance
	•	[ ] Feedback buffer (ping-pong FBO), prev(x,y) in formula language
	•	[ ] Post-FX chain: Bayer/blue-noise/Floyd-Steinberg dither, palette LUT (CGA/GameBoy/custom), nearest-neighbor pixelate, scanline/chromatic-aberration/VHS
	•	[ ] Web MIDI: bind any slider to CC; Web Audio: FFT bands → sliders
	•	[ ] OSC bridge via a tiny Node script (WebSocket ↔ UDP) so NEXUS can drive parameters — never modify NEXUS itself
	•	[ ] A/B crossfader between two snapshots (parameter lerp); "DNA dial" = MIDI knob mapped to position along a lineage path
	•	[ ] Export: clean GLSL; TouchDesigner GLSL TOP wrapper (uTD2DInfos, TDOutputSwizzle, uniforms as custom parameters); Shadertoy mainImage wrapper; PNG at arbitrary resolution; PNG sequence / WebM loop
	•	DoD: one formula from the archive is used in a live NEXUS set.
Parked (not before v4 ships)
VLM night-curator, session replay, webcam input, NDI/Syphon, formula sonification, 3D/raymarch promotion, cross-family translation.

10. LLM mutator design (v3)
Do not prompt "make it more interesting" — LLMs converge to spirals and saturated colors. Use the Lluminate pattern:
SYSTEM: You mutate formulas in a restricted language (grammar below). Output ONLY the new formula, nothing else. Must parse under the grammar.

CONTEXT:
- Population summary: <10 archived formulas, one line each, with their stats>
- Current parent: <formula> stats: <stats>
- Cells in the elites grid that are still EMPTY: <list of (entropy, symmetry) ranges>

STRATEGY (pick exactly this one): <one of:
  "replace_template": keep structure, replace one function with an unexpected one
  "conceptual_blend": combine the parent with <second formula> so both are recognizable
  "constraint": use no trig functions at all
  "extreme": push one constant to 10× and compensate elsewhere
  "fold": wrap a subtree in fold() and rebalance
  "target_cell": aim for stats in the range <empty cell> >

GRAMMAR: <whitelist from §5>
	•	Rotate strategies; never the same one twice in a row.
	•	Validate output with the parser; on failure retry once with the error message, then discard.
	•	Every LLM child goes through the §7 filter like any other candidate.
	•	Cost control: batch 8 children per call; default to Ollama locally, Claude only when the user clicks "quality mutate".

11. Do NOT
	•	Do not add a framework (React/Vue/Svelte), state library, CSS framework, or TypeScript. Vanilla JS + JSDoc types.
	•	Do not add a backend, database, auth, or gallery.
	•	Do not start MIDI, OSC, audio, feedback buffers or TouchDesigner export before v2's DoD is met, even if asked casually — point back to §9.
	•	Do not touch anything in the NEXUS repo.
	•	Do not use WebGPU.
	•	Do not implement CPPN unless AST mutation is measured to fail > 20% (log the rate).
	•	Do not silently change the snapshot schema — bump schema, add a migration, log in DECISIONS.md.
	•	Do not build features "for later"; every commit must leave the tool usable.

12. Working agreement
	•	Session opens with status: (what works, what's broken, current phase). Session closes with besluit: (done / parked / next step) appended to docs/CHANGELOG.md.
	•	Commit small, conventional messages (feat(parser): …, fix(filter): …).
	•	Run npm test before every commit; add a test for every bug fixed.
	•	When a decision is needed that this file doesn't cover: make it, log it in docs/DECISIONS.md with one line of reasoning, continue. Clay steers on results, not on pre-approval.
	•	If Clay asks to start v4 work while v2 is incomplete, say so once, cite §9, then do what he decides.
	•	Keep answers short; no summaries of what was just built — the diff is the summary.

13. Open questions (decide in session 1)
	1	Default palette mapping for scalar output: viridis-like gradient, or 4-color pixel-art LUT? (Suggest: LUT, matches aesthetic.)
	2	Attractors in v1: CPU histogram to texture (simple, slow on 2014 GPU-independent) vs. GPU transform-feedback (fast, complex)? (Suggest: CPU, 200k points, upload as R32F texture.)
	3	Permalink compression: lz-string (tiny dep) or none (URLs get long)? (Suggest: lz-string.)

14. References (verified sources)
	•	Karl Sims, Genetic Images — https://www.karlsims.com/genetic-images.html
	•	Lluminate (LLM + evolution creative exploration) — https://www.joelsimon.net/lluminate · https://github.com/joel-simon/lluminate
	•	AI Co-Artist (LLM shader evolution, 2025) — https://arxiv.org/abs/2512.08951
	•	Domain warping, Inigo Quilez — https://iquilezles.org/articles/warp/
	•	Tixy — https://tixy.land/
	•	Bytebeat, viznut — http://viznut.fi/texts-en/bytebeat_algorithmic_symphonies.html
	•	2D chaotic attractor formulas — https://sequelaencollection.home.blog/2d-chaotic-attractors/
	•	Attractor families (Clifford, De Jong, Svensson, Gumowski-Mira, Hopalong…) — https://examples.holoviz.org/gallery/attractors/attractors_panel.html
	•	Strange attractors WebGL reference impl — https://piellardj.github.io/strange-attractors-webgl/
	•	Sprott, "Automatic generation of strange attractors" (1993) — Lyapunov/correlation-dimension as aesthetic proxy
	•	MAP-Elites / Quality-Diversity — McCormack & Gambardella, "Quality-Diversity for Aesthetic Evolution" (EvoMUSART 2022)
	•	TouchDesigner GLSL Creator LOP (existing LLM shader gen in TD; check overlap before building §10) — https://docs.dotsimulate.com/operators/other/glsl_creator/

15. First prompt to paste into Claude Code
Read CLAUDE.md fully. We are starting v1 (§9). 
1. Scaffold the repo per §3 with Vite, vitest, vite-plugin-singlefile. 
2. Implement core/parser.js + core/glsl.js + tests, using the whitelist in §5. 
3. Implement render/gl.js with a fullscreen quad and a hardcoded formula. 
4. Stop and show me the running app before building sliders.
Decide the §13 open questions yourself using the suggestions, log them in docs/DECISIONS.md.
