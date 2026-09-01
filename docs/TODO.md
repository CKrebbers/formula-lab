# TODO — everything still to be executed

Status 2026-08-31, after: v1 ✓, v2 ✓ (minus Sprott), v3 zero-player ✓,
multi-window ✓, modulator rack ✓, audio reactivity ✓, family packs ✓,
palettes + tone mapping ✓. Ordered by agreed priority; sizes are sessions.

## Next up (agreed order)

1. ~~Iteration functions~~ ✓ SHIPPED 2026-08-31: julia/ship/kali/orbit + fold
   whitelisted (GLSL helpers, capped loops, n as slider), 4 iter.* families,
   verified rendering real structure on GPU. Mutation/crossover/zero-player
   use them automatically (arity-5 func_swap group).
2. ~~Prompt strategy rotation~~ ✓ SHIPPED 2026-08-31: 10 mandatory distinct
   strategies per pack, iterated-fractal strategies included.
2b. ~~dx/dy pixel step + bitwise helpers~~ ✓ SHIPPED 2026-09-01 (ADR #26/#27,
   family bit.bytebeat_pixel). Deliberately NOT done: `lap()` sugar, `in1..in4`,
   `s_ent`/`s_sym`.
2c. ~~AV layer: every formula is image AND sound~~ ✓ SHIPPED 2026-09-01.
   One AST → emitGLSL + emitJS → AudioWorklet (plan: docs/adr/001-av-layer.md,
   decisions #31–#39). Parametric f(t) plays as L/R with an XY scope; field
   formulas sound through a scan path (liss/spiral/line, 27.5 Hz–1.76 kHz).
   Safety chain, dropout meter on the audio thread, mutation-tested emitter,
   schema v4 (`scan` + `stats.audio {pre, post, silent}`). 345 unit + 28
   browser tests. **Read docs/HANDOFF.md before touching the audio path.**
3. **⏸ USE IT** — a full evening of real play, now with sound (v1/v2 DoD are
   usage-based; archive needs to grow past ~10 snapshots). The friction list
   from that evening reorders everything below. ← YOU ARE HERE

## Open in the AV layer (details + reasons in docs/HANDOFF.md)

- **A1 stats.audio → zero-player novelty.** Measuring pre-limiter exists so
  discoveries can be ranked on sound as well as image; nothing reads it yet.
  This is the payoff of ADR #35 and the smallest next AV step. (~0.5)
- **A2 prev() in audio, or a written decision that it stays image-only.**
  It is 0 at 48 kHz today, declared honestly (ADR #38) but still a place where
  one formula means two things. (~1)
- **A3 scan path parameters** — row count for `line`, windings for `spiral`,
  ratio for `lissajous`; all hardcoded now. (~0.5)
- Parked: Chrome `renderCapacity` as a second opinion for the dropout meter
  (absent in this build); goldens across JS engines for chaotic formulas.

## Roadmap phases (docs/ROADMAP-SYMBIOSIS.md)

- ~~**B1 cue/take**~~ ✓ SHIPPED 2026-09-01 — program/preview, TAKE commits with
  the existing crossfade; policy B live channel; dice; starters strip (ADR
  #28-30). NOT done and still open here: CUT (instant take), a program PIP on
  the panel, "from archive" starters, and the multi-panel conductor question.
- **B2 XY performance pad** — axes assignable to any param; germ of
  multi-touch. (with B3/B4: 1)
- **B3 macros** — one knob drives N params through ranges; "DNA dial" walks
  a lineage path later.
- **B4 tap-tempo** — global BPM; LFO rates snap to musical divisions; also
  lets zero-player swaps land on bar boundaries.
- **B5 panic/freeze** — freeze all LFOs / black-out keys.
- **C1 relay + instrument view** — ~60-line Node WebSocket relay (LAN, QR),
  `sync/remote.js` with the same interface as local.js; `?view=instrument`
  touch surface for phones/iPads. (1–2)
- **C2 multi-touch + MIDI into the input bus** — every finger a control;
  Web MIDI CC through the same routing table. (1)
- **D1 input variables** — `in1..in4` in the formula whitelist + routing
  table: a finger/CC/remote slider becomes a term in the math. Highest
  symbiosis leverage. (1)
- **D2 feedback + self-stats** — ~~`prev(x,y)` ping-pong buffer~~ ✓ SHIPPED
  2026-09-01 (whitelisted, continuous scalar via alpha, resets on formula
  change/resize/crossfade, tiles warm 6 frames — ADR #22-25). REMAINING: expose
  previous-frame entropy/symmetry as `s_ent`/`s_sym` so images regulate
  themselves (reaction-diffusion-like behaviour without simulating chemistry).
  Sketch: the §7 stats already run cheaply at 128²; feed them in as two more
  uniforms and whitelist them as variables. (~1 session)
- **D3 implicit preference learning** — dwell time & touch density as
  implicit rating; boosts elites cells; idle = machine takes over. Absorbs
  the "learn my preferences" wish. (1)
- **D4 gesture recorder** — record an XY/slider gesture as a looping
  automation mode next to sine/tri/walk/audio. (1)
- **D5 meta-formulas** — params driven by mini-formulas over other params
  and inputs (`a: b * 0.5 + in1`), same parser, CPU-evaluated. (1)

## Parked from the original brief (§9)

- **Attractors** — clifford/dejong/svensson/gumowski-mira/hopalong/ikeda as
  CPU histogram → texture (decision #2), + **Sprott random-search button**
  with Lyapunov test (the missing v2 checkbox). (1–2)
- **LLM mutator in-app (§10 / v3)** — provider-agnostic (Ollama default,
  Claude on demand), strategy rotation, parser-validated, batch of 8.
  Note: family packs already cover the manual version of this loop. (1)
- **Phase-diagram navigation (v3)** — Gray-Scott / Julia coarse maps, click
  to jump. Depends on iteration (B) and feedback (D2).
- **Lineage tree view (v3)** — full ancestry tree; the lineage strip exists,
  the tree does not.
- **v4 remainder** — post-FX chain (dither: Bayer/blue-noise/Floyd-Steinberg,
  pixelate, scanline/chromatic-aberration/VHS — palettes+tone are done);
  OSC bridge (WebSocket↔UDP for NEXUS — never touch NEXUS itself);
  exports: clean GLSL, TouchDesigner GLSL TOP wrapper, Shadertoy wrapper,
  hi-res PNG, PNG-sequence/WebM loop.
- **Parked behind v4 (brief)** — VLM night-curator, session replay, webcam
  input, NDI/Syphon, sonification, 3D/raymarch, cross-family translation.

## Small debts / polish

- Tune audio envelope constants on real music (attack/release/pulse decay).
- Elites grid: axes configurable (now fixed entropy × symmetry).
- Contact-sheet thresholds debug panel (§7 says thresholds surface in UI).
- Archive: bulk export of selected snapshots only; tags/notes UI (schema
  fields exist, no UI).
- Display window: option to hide cursor entirely / auto-fullscreen flag.
- `dist/index.html` multi-window needs a served origin (file:// isolates
  BroadcastChannel) — document or ship a tiny `npx serve` note.
