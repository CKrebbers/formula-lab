# Symbiosis Roadmap — multi-window, multi-device, multi-human, self-feeding

Clay's brief (2026-08-31): control panel in a second window with the visual
fullscreen; more performance control on that panel; panels and displays on any
device (second computer, iPhone, iPad); many people and devices at once —
multi-touch, MIDI; and above all **symbiosis**: the existing organism (formulas,
LFOs, filter, elites, zero-player) connected to the new inputs so that the
system *lives on input but is also the input itself* — a new visual language.

Guardrail from the project brief (§1): Clay's known pattern is building systems
too complex to sustain. Therefore: **each phase ends in something usable in a
live set, and no phase starts before the previous one has actually been used.**

---

## Phase A — Second window (SHIPPED 2026-08-31)

- `⧉ out` opens `?view=display`: a bare renderer, no UI, click = fullscreen.
  Drag it to the projector/second screen. Multiple displays allowed.
- Transport: `sync/local.js` — BroadcastChannel wrapper with a deliberately
  transport-agnostic `{type, payload}` protocol. Messages: `formula`
  (source + coords + params), `params` (~30 Hz, follows sliders AND LFOs AND
  the zero-player), `coords`, `hello` (display asks for current state).
- Everything existing flows through automatically: LFO motion, mutation-sheet
  promotes, zero-player discoveries — the display just follows.
- Limit: BroadcastChannel = same browser, same machine, same origin (the
  single-file `dist/index.html` from `file://` may isolate windows — use the
  dev server or a `python3 -m http.server` for multi-window).

## Phase B — The panel becomes an instrument (1–2 sessions)

The panel today is a *lab*. For live use it needs a *performance* face:

1. **Program/preview (cue) model** — like a video mixer: the panel edits a
   NEXT state (blind), the display holds the CURRENT state; a big `TAKE`
   button (or crossfade slider) commits. Protocol: add `cue` and `take`
   messages; display keeps two shader slots and lerps params during the fade.
   This is v4's A/B crossfader (§9), arriving via the sync layer.
2. **XY performance pad** — a large touch/mouse pad; each axis assignable to
   any param (dropdowns). This is the germ of the multi-touch story.
3. **Macro system** — one macro knob drives N params through ranges (the
   "DNA dial" of §9 v4: a macro can also walk a lineage path).
4. **Tap-tempo** — tap sets a global BPM; LFO rates snap to musical divisions
   (1/4, 1/2, 1, 2, 4 bars). LFOs already have rate — this only adds a
   quantized rate source.
5. **Panic/freeze** — freeze all LFOs (one key), drop to black (another).
   Live essentials.

## Phase C — Any device, any human (2–3 sessions)

**Transport**: `tools/relay.js` — a ~60-line Node WebSocket relay (`ws` dep,
run on the iMac: `node tools/relay.js` → prints `ws://<LAN-ip>:9900` + a QR
code in the terminal). `sync/remote.js` implements the SAME interface as
`sync/local.js`; `?relay=ws://…` picks the transport. No accounts, no cloud,
LAN only — consistent with "no backend" (§2): the relay stores nothing.
The permalink system already transports state between machines today (manual
fallback that keeps working).

**Roles** (URL params, one codebase, zero installs — phones just open the URL):
- `?view=display` — fullscreen output (a TV, an iPad on a stand, a projector).
- `?view=panel` — full control panel (default).
- `?view=instrument` — NEW: touch-first, big-controls surface for
  phones/tablets: sliders as fat strips, the XY pad, tap-tempo. No editor,
  no archive — play, don't administrate.

**Multi-human model**: one panel is *conductor* (first to join, holds the
formula); instruments send **input events**, not state: `input` messages
`{device, control, value}`. The conductor maps them (a small routing table in
the panel: device×control → param/macro/action) and merges last-write-wins per
param. Two people on two phones = four thumbs = four simultaneous param
streams. Conflicts are a feature (it's an instrument, not a form).

**Multi-touch**: instrument view uses Pointer Events; every active finger is a
control (`touch1.x`, `touch1.y`, `touch2.x`, …, plus `touches` = count).

**MIDI**: Web MIDI in panel AND instrument views (Chrome on any laptop;
iOS Safari has no Web MIDI — phones contribute touch, laptops contribute
MIDI). CC events enter the exact same `input` bus. This is v4's MIDI item
landing naturally inside the routing table.

**OSC/NEXUS**: the relay later grows a UDP/OSC leg (v4, §9) so NEXUS and
TouchDesigner speak the same bus. Never modify NEXUS itself.

## Phase D — Symbiosis: input is output is input (the actual point)

The new visual language emerges when the boundary between controlling and
being-controlled dissolves. Concrete mechanisms, in build order:

1. **Inputs become formula variables.** Extend §5's whitelist with live vars:
   `in1..in4` (assignable from the routing table: a finger, a CC, a remote
   slider). Then input is no longer *outside* the math — `sin(x * in1 + t)`
   makes a human finger a term in the equation. Cheap: they're just uniforms,
   the parser whitelist grows by four names. **This is the single highest
   leverage step and needs only Phase A.**
2. **The image feeds on itself.** v4's feedback buffer (`prev(x,y)`) plus a
   new stats uniform: each frame, the §7 stats of the *previous* frame
   (entropy, symmetry — already computed cheaply at 128px) are exposed as
   variables `s_ent`, `s_sym`. A formula can then regulate itself:
   `sin(x * y * (1.0 + s_ent * 4.0))` — high chaos damps itself, flatness
   excites itself. Reaction-diffusion behavior without simulating chemistry.
3. **Humans steer evolution without menus.** The zero-player already runs;
   connect it to the input stream: touch density and dwell time act as
   implicit rating (dwell on a discovery ≥ N seconds → fitness boost for its
   grid cell; frantic input → explorer raises mutation sigma; total silence →
   explorer takes over the display). The machine reads the room; the room
   feeds the machine. (This absorbs Clay's earlier "learn my preferences"
   wish — implicit signals first, no ML needed.)
4. **Gestures become genotype.** Record a finger path on the XY pad → store
   it as a looping automation curve (a new automation mode next to
   sine/tri/walk: `gesture`). Your movement literally becomes a reusable
   LFO waveform, savable in snapshots. Input crystallized into organism.
5. **Meta-formulas (patch language).** A param can be driven by a tiny
   formula over other params and inputs (`a: b * 0.5 + in1`) — same parser,
   evaluated per frame on the CPU. The routing table becomes expressive
   instead of a matrix. This closes the loop: formulas modulate formulas.

**Why this is symbiosis and not feature soup**: every layer reuses the
existing organs — the parser/whitelist (1, 5), the automation system (4), the
stats engine (2, 3), the elites/zero-player (3), snapshots/lineage (all).
Nothing new stands alone; every input path ends in the same genotype that
mutation, crossover and the archive already understand.

## Order & session plan

| # | What | Depends on | Size |
|---|------|-----------|------|
| A | Second window + sync bus | — | DONE |
| D1 | `in1..in4` live vars + routing table (mouse/keys first) | A | 1 session |
| B1 | Cue/take + crossfade | A | 1 session |
| B2–B5 | XY pad, macros, tap-tempo, freeze | B1 | 1 session |
| C1 | Relay + remote transport + instrument view | A | 1–2 sessions |
| C2 | Multi-touch + MIDI into the input bus | C1, D1 | 1 session |
| D3 | Implicit rating / idle autonomy | C1 | 1 session |
| D4 | Gesture recorder as automation mode | B2 | 1 session |
| D2 | Feedback buffer + self-stats (v4 territory) | v4 gate | 1–2 sessions |
| D5 | Meta-formulas | D1 | 1 session |

Deliberately NOT in this roadmap: cloud/WAN sync, accounts, native apps,
WebRTC (relay is simpler and LAN is the venue), audio-reactivity (queued
separately — it enters through the same `input` bus when it comes).
