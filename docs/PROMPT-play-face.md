# Formula Lab — Claude Code session: Play face (cue/take + dice + cold-start)

Paste this whole file as the session brief. Work in the local repo:
the local repo checkout
No git remote. English UI, commits, ADRs, CHANGELOG. WebGL2 only. No React, no backend.
One coherent playability session — not Phase B2–B5, not language features.

---

## 0. Why this session exists

The language basin is open (`prev`, `dx`/`dy`, bitwise). TODO.md says **YOU ARE HERE: USE IT** — a play evening should reorder the roadmap via a friction list.

Usability research (tixy / Hydra / Karl Sims / Lluminate) points at the same gap:

| Reference | What makes it playable | Formula Lab today |
|-----------|------------------------|-------------------|
| **tixy.land** | Tiny constraint, examples in the UI, URL = save | Permalinks exist; cold start is a blank-ish lab |
| **Hydra** | Random sketch + **dice** (mutate one value) + hide code | Mutate/sheet exist but are lab-secondary; editor dominates |
| **Karl Sims** | Selection is the only gesture | Rate/promote exist but typing/editing is still the default loop |
| **Lluminate** | Strategy rotation against homogeny | Family packs already cover this — do **not** rebuild |

Conclusion: **speelgezicht > more language.** This session ships the minimum that makes the panel an instrument: **cue/take**, **dice-one-slider**, **cold-start examples**. Leave XY pad, macros, tap-tempo, panic, `in1`, `s_ent`, attractors alone.

---

## 1. Read first (do not invent architecture)

Read before coding:

- `docs/TODO.md` — “⏸ USE IT” / B1 cue/take
- `docs/ROADMAP-SYMBIOSIS.md` — Phase B §1 (program/preview)
- `docs/DECISIONS.md` — latest ADRs (esp. sync, display crossfade, feedback)
- `docs/CHANGELOG.md` — tone/format
- `src/sync/local.js` — transport-agnostic `{ type, payload }`
- `src/display.js` — **already** two stacked canvases + ~900ms CSS opacity crossfade on every `formula` message
- `src/main.js` — how the panel broadcasts `formula` / `params` / `coords` / `style` and answers `hello`
- `src/ui/editor.js`, `src/ui/sheet.js`, `src/ui/sliders.js`, `src/ui/families.js`, `src/ui/packs.js`
- `src/search/mutate.js` — const_tweak and friends
- `src/store/snapshot.js`, `src/store/url.js`, `src/store/archive.js`
- `src/families/index.js`, `src/families/field-tixy.js` (and packs)
- Existing tests under `tests/` (or wherever vitest lives) — match patterns

Confirm by reading (do not assume):

1. Exact message types the panel sends today.
2. Whether every editor keystroke / Apply already `sync.send('formula', …)` (almost certainly yes — that is the bug for live use).
3. How zero-player / auto-explore triggers formula swaps.
4. How snapshots + permalinks serialize state (cue must not break them).

---

## 2. Goal (one sentence)

**The display (and the panel’s “program” output) only changes when the user hits TAKE; meanwhile the panel freely edits a cue (next) state. Add a one-tap dice that mutates a single unlocked param, and a cold-start strip of 3–5 playable examples so the first minute never requires typing.**

---

## 3. Non-goals (explicit)

Do **NOT** implement in this session:

- B2 XY pad, B3 macros, B4 tap-tempo, B5 panic/freeze
- Phase C relay / `?view=instrument`
- `in1..in4`, `s_ent`/`s_sym`, `lap()`, attractors, LLM mutator in-app
- New GLSL functions / whitelist churn
- Redesigning family packs or strategy rotation
- TouchDesigner / OSC / NEXUS
- Hiding the editor forever (a compact **Play** mode toggle is enough; full instrument view is Phase C)

If you notice the dblclick-slider-range bug: leave it unless it blocks DoD; one line in CHANGELOG “known” is fine.

---

## 4. Design — cue / take (program–preview)

### 4.1 Mental model (video mixer)

- **Program (live):** what the display windows show right now. Also what the panel’s main preview represents when not “editing blind.”
- **Cue (next):** the state the panel is editing. Mutations, pack loads, slider tweaks, editor changes land here **without** broadcasting a new `formula` to displays.
- **TAKE:** commit cue → program. Display crossfades (reuse existing dual-canvas path). Panel program = cue snapshot.

Optional but valuable: a small **cue preview** (existing tile/thumb renderer or a second mini canvas) so “blind” is not totally blind — roadmap says blind edit; a postage-stamp cue preview is OK if cheap.

### 4.2 State shape (panel)

Introduce an explicit dual state in the panel controller (names can match codebase style):

```js
// Conceptual — fit into existing main.js state, don’t invent a parallel app
program: Snapshot-like  // last TAKEN (or bootstrapped) state
cue: Snapshot-like      // editable draft
armed: boolean          // cue differs from program (dirty)
cueMode: boolean        // when true, edits do not auto-TAKE / do not send formula
```

Use the **existing snapshot schema (v2)** from `store/snapshot.js` for both sides so permalink/archive/export stay coherent. Do not invent a third schema.

Bootstrap:

- On load (URL / archive restore / default): `program = cue = restored`.
- First paint: send `formula` once so displays sync (answer `hello` with **program**, not a half-edited cue).

### 4.3 Sync protocol extensions

Keep `SyncChannel` transport-agnostic. Prefer **additive** messages; keep old ones working.

**Recommended mapping** (adjust if reading the code suggests a cleaner fit — document the choice in ADR):

| Message | When | Payload | Display behavior |
|---------|------|---------|------------------|
| `formula` | **TAKE** (and initial hello reply / cold bootstrap only) | same as today: `{ source, coords, params, palette, smooth, tone }` | existing crossfade onto back layer |
| `params` | program param changes that are live (see §4.4) | `{ params }` | as today |
| `coords` / `style` | only when they apply to **program** | as today | as today |
| `hello` | display → panel | — | panel replies with **program** formula (+ style), not cue |
| `cue` (optional) | panel → display if you add an on-display PIP later | full cue snapshot or formula | **ignore in v1** unless trivial; default: displays never see cue |

**Critical rule:** while `cueMode` is on (default for this session’s play face), editor Apply / pack load / mutate sheet promote-to-editor / family pick update **cue only** and must **not** `sync.send('formula')`.

### 4.4 Live param scrubbing vs cue

Two acceptable policies — pick one, ADR it:

**A (stricter mixer, preferred):** All slider / LFO / audio modulation writes go to **cue** until TAKE. Displays stay frozen on program formula+params. Simpler mentally; TAKE can send formula if source changed else params-only if only constants moved.

**B (performer-friendly):** If cue formula `source` === program `source`, param/LFO changes may stream to display via `params` (live tweak). If source differs, params stay cue-local until TAKE (which sends `formula` and resets feedback per existing display path).

Prefer **B** if LFOs on the live image are already part of Clay’s play loop; otherwise **A**. Read how modulators bind today before choosing.

On TAKE:

1. `program = clone(cue)`.
2. If formula source (or coords/palette/tone needing full rebuild) changed → `sync.send('formula', program…)`.
3. Else if only params → `sync.send('params', …)` (no needless feedback reset).
4. Clear `armed` / update TAKE button affordance.
5. Panel main renderer shows program (or cue≡program).

### 4.5 Zero-player / auto-explore

Today auto-explore almost certainly broadcasts `formula` on each swap (display already crossfades). With cue/take:

- Auto-explore writes into **cue**, then either:
  - **auto-TAKE** each accepted elite (preserve today’s “display keeps moving” behavior), or
  - arms cue and waits for human TAKE (safer for live, worse for zero-player demos).

Default for this session: **auto-TAKE when zero-player is running**; when zero-player is off, human TAKE only. Document in ADR.

### 4.6 UI (panel)

Minimal English UI (match existing tone — short labels, no marketing copy):

1. **TAKE** — large, primary, keyboard shortcut `T` (or `Space` if Space is free; do not steal typing focus from the textarea — only when editor not focused, or use `Cmd/Ctrl+Enter` for TAKE). Disable or dim when `!armed`.
2. **Cue mode** toggle — default **on** after this ships (“Cue” / “Live edit”). When off, restore legacy behavior: edits broadcast `formula` immediately (escape hatch).
3. Armed indicator — e.g. TAKE button glows / “cue ≠ program” chip.
4. Optional: **CUT** = TAKE with fade 0 (instant). Only if fade duration is already parameterized; don’t bike-shed. Skip if not trivial.

Do **not** build a full second editor. One editor bound to `cue`.

### 4.7 Interaction with feedback (`prev`)

Display already resets feedback on `setFragmentShader` during crossfade (see comment in `display.js`). TAKE that changes formula must keep that behavior. TAKE that only updates params must **not** reset feedback. Panel-side feedback (if the panel renderer uses `prev`) follows the same rule for the surface being shown.

---

## 5. Design — dice (Hydra-style one-value mutate)

Add a primary control **Dice** (🎲 or label `dice`) next to mutate/sheet controls:

Behavior:

1. Prefer an **unlocked** numeric param / slider target (same unlock model sliders already use).
2. If none unlocked, pick a random numeric literal in the cue AST via existing mutate operators (`const_tweak` or equivalent in `search/mutate.js`).
3. Apply **one** mutation to **cue** (not a full sheet). Respect §7 filter if the mutate pipeline already does for sheet cells; for a single dice, if filter rejects, retry up to N=8 then no-op with status toast.
4. Does **not** TAKE. Arms cue.
5. Shortcut: `D` when editor not focused.

Reuse mutate code paths — do not fork a second mutation language.

---

## 6. Design — cold-start examples (tixy-style)

On first load with **no** permalink hash and **empty/default** formula:

1. Show a horizontal **Examples** strip (3–5 thumbnails + short labels) above or beside the editor.
2. Sources (in order of preference — use what already exists):
   - Curated entries from `src/families/` (include at least one `field-tixy` / trig, one `prev`-based feedback toy if a pack/example exists, one bytebeat / `bit.*` if present)
   - Or 3–5 hard-coded starter snapshots in e.g. `src/families/starters.js` (English labels, valid formulas, locked-reasonable params)
3. Click example → loads into **cue** and **auto-TAKE** once (so display and panel both show something alive in <1s). Subsequent example clicks cue+TAKE or cue-only+arm — pick one, ADR it; prefer cue+TAKE for cold-start clarity.
4. Strip can remain available later as “Starters” (not only first run).
5. Do not block app boot on network. No remote gallery.

Also: if archive already has rated snapshots, optionally prepend “From archive” — nice-to-have, skip if it risks scope creep.

---

## 7. Implementation order (stick to this)

1. **Spike read** — confirm broadcast sites in `main.js` / UI; list every `sync.send('formula'` call site.
2. **Dual state** — `program` / `cue` / `armed` / `cueMode` wired through apply/load/save.
3. **Gate broadcasts** — all formula sends go through `commitProgram()` / `take()` except legacy live-edit mode.
4. **TAKE UI + shortcut** + hello replies program.
5. **Dice** one-shot mutate into cue.
6. **Starters** strip + `starters.js` (or family picks).
7. **Tests** — see §8.
8. **Docs** — ADR + CHANGELOG + TODO reorder note.
9. **Manual GPU check** on Air (and note iMac Big Sur if relevant): cue edits don’t flash display; TAKE crossfades; dice arms; starter click shows image <1s.

One commit is fine if cohesive; two commits OK (`feat(sync): cue/take program-preview` then `feat(ui): dice + starters`). No drive-by refactors.

---

## 8. Tests / DoD

Automated (vitest or project’s runner — match existing):

1. Cue edit does not call sync send for `formula` when `cueMode===true` (mock SyncChannel).
2. `take()` sends exactly one `formula` when source changed; sends `params` only when source identical (if policy B).
3. `hello` handler replies with program snapshot, not cue.
4. Dice changes cue AST/params and sets armed; no formula sync.
5. Starter load produces a parseable formula; snapshot round-trip OK.
6. Permalink / snapshot export reads **program** (or document if export is cue — prefer exporting program, with optional `?cue=` later; don’t break schema v2).
7. Full suite green (was 211 after dx/bits — expect same or +N).

Manual DoD (Clay):

1. Open panel + `?view=display`. Move a slider / edit formula in cue mode → **display unchanged**.
2. Hit TAKE → display crossfades to new look (~0.9s).
3. Dice a few times → panel preview/cue changes, display still until TAKE.
4. Hard reload with no hash → starters visible; one click → living image without typing.
5. Toggle cue mode **off** → legacy immediate broadcast still works.
6. Formulas **without** `prev` still byte-identical path (no feedback regress).
7. Zero-player still moves the display (auto-TAKE).

---

## 9. Docs to update

1. **ADR** in `docs/DECISIONS.md` — next number after #27 (or whatever HEAD is): title e.g. “Cue/take program–preview; dice; starters”. Record: message rules, policy A vs B for params, zero-player auto-TAKE, export=program.
2. **CHANGELOG.md** — user-facing bullets.
3. **TODO.md** — mark B1 cue/take done (or partial); keep “USE IT” play evening; note dice/starters as playability patch; do not claim B2–B5 done.
4. **ROADMAP-SYMBIOSIS.md** — one-line check on B1 if that’s the house style.
5. Refresh **CLAUDE.md** only if it’s still stuck on v1-start and would mislead the *next* session — short status blurb, don’t rewrite the brief.

---

## 10. Constraints (house rules)

- English UI strings and commit messages.
- WebGL2 only; no WebGPU; target MacBook Air + 2014 iMac (Radeon R9 M295X / Big Sur).
- No React, no backend, no new deps unless unavoidable (prefer zero).
- `SyncChannel` stays the single sync API; remote relay is future — don’t break `{ type, payload }`.
- Don’t touch NEXUS / av-patch / td-lab.
- Don’t expand the formula language.
- Keep display’s existing crossfade; don’t replace it with a second competing fade system.
- Accessibility: TAKE must be keyboard-reachable; don’t strand keyboard users.

---

## 11. Deliverable back to Clay

When done, report:

1. Commit hash(es) + one-paragraph summary.
2. Policy chosen (param scrub A vs B).
3. New/changed files list.
4. Test count.
5. Exact keyboard shortcuts.
6. Anything deferred (CUT, on-display cue PIP, archive starters).
7. Suggested **30-minute play protocol** friction prompts (bullet list) for the USE IT evening — no code, just what to notice.

Then stop. Do not start B2.
