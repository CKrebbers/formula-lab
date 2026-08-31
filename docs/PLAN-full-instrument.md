# Formula Lab — Plan: from lab to full instrument for progressive visuals

Status: 2026-09-01. Companion to `ROADMAP-SYMBIOSIS.md` and `TODO.md`.
Language: English (house rule). Chat with Clay may stay Dutch.

## 0. North star (what “volwaardig” means here)

**One sentence (from CLAUDE.md, still correct):**
a browser lab where `f(x,y,t)→color` is typed, mutated, filtered, performed and
archived — value is in **search + live instrument**, not rendering fidelity.

**Volwaardig for Clay does NOT mean:** become TouchDesigner, Notch, Resolume,
or a diffusion VJ box. Those already exist; the 2014 iMac and “no backend /
WebGL2 / independently shippable phases” forbid that path.

**Volwaardig DOES mean:** Formula Lab is the place where *new looks* are born
and steered live, then leave the building as:

1. a performable state (display / phone instrument / MIDI),
2. an archived genotype (snapshot + lineage + pack),
3. an export into the outside stack (TD GLSL TOP, ISF/Resolume, PNG/WebM,
   Higgsfield/Seedance look-reference, OSC params toward NEXUS — never edit NEXUS).

Progressive animation here = **time-aware, coupled, musically steerable formulas**
(`prev`, derivatives, bytebeat, self-stats, inputs-as-math) discovered faster
than hand-authoring in TD, then used on stage or in renders.

Constellation rule (unchanged): Formula Lab = picture brain; av-patch = live
rig; td-lab = chemistry DNA; NEXUS = OSC grammar to steal, not revive; Higgsfield
= external finish. Max-3 priorities still apply — this plan is sequenced so each
phase is usable alone.

---

## 1. Current state (honest baseline)

### Already a serious lab (shipped ~31 Aug–1 Sep 2026)
- Formula → AST → GLSL (whitelist, column errors, never eval)
- Sliders + LFO/audio/gesture automation, param glide, capture-take gestures
- Coords, palettes, tone; modulator rack; audio bands + beat pulse
- Mutate / crossover / 3×3 sheet / §7 filter / novelty / lineage / archive / permalinks
- Zero-player + MAP-Elites (entropy × symmetry)
- Family library + AI family packs (strategy rotation)
- Multi-window display + ~0.9s crossfade (`BroadcastChannel`)
- Language basins open: iterated maps, **`prev` feedback**, **`dx`/`dy`**, **bitwise/bytebeat**
- Coach loop: `docs/PROMPT-*.md`, `.claude/commands/play.md`, skill for session briefs

### YOU ARE HERE (`TODO.md`)
**⏸ USE IT** — play evening; friction list reorders everything below.

**Doc lag (Mac scan 2026-09-01):** B1 cue/take is largely **already in code**,
not a greenfield session:
- `src/sync/cue.js` — CueProgram, Policy B / ADR #28 (cited in source; ADR body
  may still be missing from DECISIONS.md)
- Wired in `main.js`: TAKE, cue/live-edit toggle, live channel for params/coords
  while sources match, dice arms TAKE, zero-player auto-TAKEs, display `hello`
  gets program only
- `docs/PROMPT-play-face.md` + `.claude/commands/play.md` exist
- TODO/CHANGELOG still list B1 as “next” — treat docs as stale; **verify by play**,
  then tick B1 and only fill gaps (starters UX, polish)

CLAUDE.md §5 may still say `prev` reserved; CHANGELOG/ADR #22–25 say shipped.

### Explicit gaps vs “helps make progressive animations”
| Need | Status |
|------|--------|
| Discover weird time-coupled looks | Strong (prev/dx/bits/packs/auto) |
| Play without killing the live image | **Strong in code** (cue/TAKE) — confirm in play evening |
| Musical structure (bars, Link, cue lists) | Partial (LFOs, tap-tempo planned; look-slots next) |
| Hands/controllers as math (`in1..`) | Planned D1 |
| Self-regulating images (`s_ent`) | Planned D2 remainder |
| Leave the browser (ISF/TD/WebM/OSC) | Parked v4 |
| Agent *plays* the app (MCP) | Not on roadmap — new opportunity |
| Multi-layer / clip decks | Out of scope as TD job; cue/take is the thin wedge |

---

## 2. Research: what others do that Formula Lab should steal (not copy)

Findings from 2025–2026 creative-coding / VJ / AI-tooling landscape:

### A. Instrument & performance
- **Hydra:** random sketch + dice-one-value + hide code + URL history.
- **Karl Sims / Picbreeder / AI Co-Artist:** selection (or LLM-as-judge) as the
  primary gesture; code optional.
- **OpenDrop VJ / VKO1:** snapshot slots, **timeline of looks**, Ableton Link,
  MIDI learn, pad triggering — Formula Lab needs *cue lists of snapshots*, not
  a full clip deck.
- **Videosync / Showsync:** treat visuals on a **musical timeline** inside Ableton;
  ISF as the shader currency.

### B. Pipeline / export (how progressive work ships)
- **ISF** is the practical bridge to Resolume, VDMX, Videosync — stronger near-term
  than “clean GLSL only.” Shadertoy wrappers help humans; ISF helps shows.
- **Spout / Syphon / NDI:** zero-latency texture share into TD/Resolume — almost
  always needs a native/Electron shell (parked behind v4; don’t fake in pure web).
- **OSC:** still the LAN lingua franca (TouchOSC, TD, Scope, Hydra bridges).
  Matches existing NEXUS grammar — bridge *out*, don’t fork NEXUS.

### C. AI co-discovery (beyond paste-a-pack)
- **Lluminate / CLIP novelty:** fight spiral homogeny with embedding distance,
  not only entropy×symmetry.
- **tdmcp / Vivid / VKO1 MCP:** agents author and *perform* the tool over MCP
  with compile→preview loops. Formula Lab’s missing twin: an optional local MCP
  that mutates cue, takes, rates, exports — Claude Code already builds; MCP would
  let it *play*.
- **Family packs** already cover manual Lluminate-style strategy rotation — keep
  that; add in-app LLM mutator only when packs feel slow.

### D. What NOT to chase
- Full node graphs (TD/Cables/Notch), diffusion-in-the-loop VJ (Scope et al.),
  WebGPU-only engines, cloud galleries/auth, React rewrites.

---

## 3. Product model — four layers

Think of the app as four concentric jobs. Each layer ships value alone.

```text
┌─────────────────────────────────────────────┐
│ 4 PIPELINE   ISF / TD wrapper / WebM / OSC  │
├─────────────────────────────────────────────┤
│ 3 PERFORM    cue/take, MIDI, instrument, BPM│
├─────────────────────────────────────────────┤
│ 2 DISCOVER   mutate, packs, auto, elites    │  ← mostly DONE
├─────────────────────────────────────────────┤
│ 1 LANGUAGE   prev, dx, bits, (s_ent, in1…)  │  ← half DONE
└─────────────────────────────────────────────┘
```

Progressive animations need **1+2** to invent motion, **3** to shape it in time,
**4** to use it outside the lab.

---

## 4. Sequenced plan (phases)

Session sizes are ~1 Claude Code session unless noted. Order respects TODO’s
“friction list reorders below” — after the play evening, slide items, don’t skip
the play gate.

### Phase P0 — Play gate (now, mostly play — not a rebuild)
**Goal:** prove the lab earns its keep before more surface area.

1. Real play evening with `prev` / dx-basins / bytebeat **and** cue/TAKE + dice
   (friction notes). Assume B1 works; file gaps only.
2. If play finds holes vs `docs/PROMPT-play-face.md`, one short `/play` patch
   session — do **not** re-implement CueProgram.
3. Sync docs: CHANGELOG + TODO tick B1; add ADR #28 body if missing.
4. Grow archive past ~10 rated snapshots (DoD from v1/v2).
5. Optional: displaced-`prev` family pack.

**Exit:** you can rehearse a look on cue and TAKE to display; TODO matches code.

### Phase P1 — Instrument face (roadmap B, ~3–4 sessions)
**Goal:** the panel is playable like a small VJ instrument.

| # | Item | Why for progressive visuals |
|---|------|-----------------------------|
| B1 | cue/take | Edit next look without murdering the live image |
| B2 | XY pad | Continuous 2D performance gesture |
| B3 | Macros / DNA dial | One hand steers a whole look / walks lineage |
| B4 | Tap-tempo + bar-quantized auto swaps | Motion lands on music |
| B5 | Panic / freeze | Live safety |

**New (research add):** **Look slots (8)** — save program snapshots to pads;
recall with crossfade. Thin cousin of OpenDrop’s snapshot bank. Fits macros.

**Exit:** 20-minute set possible with display window + keyboard/MIDI-less pad.

### Phase P2 — Symbiosis math (roadmap D, highest creative leverage, ~3 sessions)
**Goal:** animation that *regulates and listens*, not only oscillates.

| # | Item | Progressive payoff |
|---|------|--------------------|
| D2b | `s_ent` / `s_sym` | Self-damping / self-exciting fields (RD without chem) |
| D1 | `in1..in4` in whitelist | Finger/CC **inside** the formula |
| D4 | Gesture recorder (partially exists as ↺ cap) | Performable motion vocabulary |
| D5 | Meta-formulas on params | Params driven by other params/inputs |
| D3 | Implicit preference → elites | Idle play teaches the search |

**Language park (only if play proves a hole):** attractors (2nd renderer),
Gray-Scott phase map, `lap()` sugar. Do not stack language before P1 friction.

**Exit:** a formula can include the room (`in1`) and its own chaos (`s_ent`).

### Phase P3 — Many bodies, one conductor (roadmap C, ~2–3 sessions)
**Goal:** phones/iPads as instruments; laptop as conductor.

- C1 relay + `?view=instrument`
- C2 multi-touch + Web MIDI → same input bus as D1

**Research add:** Ableton **Link** (via a tiny native helper or Electron later)
is nicer than tap-tempo alone for real bands — schedule after C1, not before.

**Exit:** two thumbs on a phone drive `in1/in2` while Air shows display.

### Phase P4 — Leave the browser (v4 export spine, ~3–4 sessions)
**Goal:** progressive looks become assets and show sources.

Priority order (revised by research):

1. **ISF export** (Resolume / VDMX / Videosync) — params → JSON INPUTS
2. **TouchDesigner GLSL TOP wrapper** (Clay’s daily host)
3. Clean GLSL + Shadertoy wrapper (sharing / reference)
4. Hi-res PNG + **PNG sequence / WebM loop** (Higgsfield/Seedance refs, social)
5. Post-FX chain (dither/scanline/VHS) — aesthetic finish, after export works
6. OSC bridge (WebSocket↔UDP) toward NEXUS grammar — **read-only steal, never edit NEXUS**

**Park until native shell is justified:** NDI / Syphon / Spout, webcam, NDI
return path. Browser-only cannot honestly own those.

**Exit:** one TAKE → “Export ISF” drops a file that opens in Resolume Wire.

### Phase P5 — Co-discovery 2.0 (parked + new, on demand)
**Goal:** search stays ahead of homogeny.

- In-app LLM mutator (Ollama default) — only if packs are the bottleneck
- Configurable elites axes; optional **CLIP/offline novelty** pass on archive
  (batch job, not per-frame on iMac)
- Phase-diagram navigation (Julia / Gray-Scott maps)
- Lineage **tree** view (strip exists)
- **Local MCP server** (new): tools like `set_cue`, `take`, `dice`, `rate`,
  `export_isf`, `run_pack_import` so Claude Code / Cursor can perform the lab
  (pattern from tdmcp / Vivid / VKO1). Biggest automation unlock after `/play`.

**Exit:** an agent can rehearse 10 looks into the archive without GUI babysitting.

### Phase P6 — Constellation, not merger (ongoing, no mega-app)
- Feed Higgsfield/Seedance with WebM + stills from P4
- av-patch consumes OSC/params; Formula Lab stays the genotype editor
- td-lab / Culcosponi remain satellites; steal DNA, don’t merge repos
- VLM night-curator / session replay — only after archive is large

---

## 5. “Vooruitstrevende animaties” — capability map

What the app should uniquely enable once P0–P4 land:

1. **Coupled motion** — feedback + spatial derivatives + self-stats  
2. **Bytebeat / discrete time aesthetics** — already seeded; packs deepen  
3. **Search as co-author** — mutate/auto/packs beat blank GLSL  
4. **Musical time** — tap/Link + quantized takes + look slots  
5. **Embodied control** — `in*` from touch/MIDI inside the math  
6. **Show pipeline** — ISF/TD/WebM so experiments become set pieces  
7. **Agent loop** — session prompts + later MCP so development and play scale

---

## 6. Working agreements (so this doesn’t die)

1. **Play gate is real.** No P2 language while archive < ~10 rated and P0 undone.
2. **One basin per Claude Code session.** Use `/play` or new `docs/PROMPT-*` +
   skill `formula-lab-session-prompt`.
3. **Independently shippable phases** (CLAUDE.md pattern) — each phase demoable.
4. **iMac + Air** — WebGL2 only; measure on GPU when feedback/quantization lies.
5. **English artifacts / Dutch chat.**
6. **No second bot** until a second recurring stream needs a role.
7. **No git remote required** for building; add remote only if cloud agents or
   sharing demand it.
8. **Friction list wins** — after each play block, reorder P1–P5 in TODO.

---

## 7. Suggested near-term calendar (not a prison)

| When | Focus |
|------|--------|
| Tonight / next evening | P0 play (incl. cue/TAKE) + friction notes; tick B1 in TODO if solid |
| Next build session | Only if play finds gaps — else B2–B4 / look slots |
| +1 session | B2–B4 cluster (XY, macro, tap) or look slots — friction decides |
| +1 session | D2b `s_ent`/`s_sym` **or** D1 `in1` — whichever friction screamed louder |
| Later | P4 ISF export before post-FX toys |
| When packs feel slow | P5 MCP or in-app LLM mutator |

---

## 8. Success metrics (lightweight)

- Archive: ≥30 rated snapshots; ≥3 distinct “basins” you still open a month later
- Performance: one 15–20 min rehearsal using only cue/take + macros + audio
- Export: ≥5 looks reused in TD or Resolume or a Higgsfield reel
- Speed: time-to-first-interesting from cold start < 60s (starters + dice)
- Discipline: no phase started that isn’t usable alone

---

## 9. Open questions for Clay (decide when friction appears)

1. Is the primary downstream **TD**, **Resolume/ISF**, or **WebM→Higgsfield**?
   That picks P4 order.
2. Do you want **MCP play** before or after phone instrument view?
3. Attractors vs `s_ent` — second renderer or self-stats first?
4. Remains Formula Lab a conscious max-3 deviation through Nov 2026? (Assume yes.)

---

## 10. Immediate next action

1. Play (P0).  
2. Run Claude Code `/play`.  
3. Return CHANGELOG + friction list → coach reorders P1.  
4. Keep this document updated when a phase ships (one checkbox line in TODO is enough).
