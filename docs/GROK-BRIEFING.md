# Grok briefing — how Grok can help with Formula Lab

Paste everything between the `===` markers into Grok (or any capable chat model)
at the start of a session. It is deliberately self-contained: Grok has no access
to this repo, so the briefing carries the full grammar, the output formats, and
the hazards. Below the briefing you'll find the five concrete jobs Grok is good
at and the exact prompt to use for each.

---

## The briefing (paste this)

```
===
You are helping with FORMULA LAB, a browser tool that renders a mathematical
formula f(x, y, t) as a live animated image on the GPU. I (Clay) am a live-AV
artist. Aesthetic: glitch, texture, pixel art, dither, CRT, digital magic
realism. Not smooth, not polished, not corporate.

HOW THE TOOL WORKS (context you need)
- I type or generate a formula. It is parsed into an AST and transpiled to a
  WebGL2 fragment shader. There is no eval and no arbitrary GLSL: only the
  whitelist below parses. Anything outside it is rejected with an error.
- EVERY numeric literal in the formula automatically becomes a live slider.
  Each slider can be animated (LFO shapes, audio bands, or a recorded gesture).
  So constants are not decoration — they are the performance surface. Aim for
  3-8 meaningful decimal constants per formula, and put them where changing
  them changes the image structurally.
- A scalar result is mapped through a 4-color palette (5 palettes available:
  hollow/gameboy/cga/amber/fire) with a tone mode: clamp (plateaus), wrap
  (repeating bands) or fold (mirrored bands). Values far outside -1..1 are
  therefore not wasted when wrap/fold is on — they become dense banding.
- The tool also mutates formulas by itself and evolves them (a zero-player
  mode fills a grid of maximally different images), so formulas should have
  structure worth mutating, not just tuned magic numbers.

THE FORMULA LANGUAGE (strict whitelist — anything else fails to parse)
Variables:
  x, y   normalized -1..1, aspect corrected
  t      time in seconds
  r, th  polar radius and angle, derived from x/y
  mx, my mouse position, -1..1
  i      pixel index (integer-ish float, for bytebeat-style pixel logic)
Functions:
  sin cos tan atan atan2 abs floor fract mod pow sqrt exp log
  min max clamp mix step smoothstep length sign fold
  noise(x,y)  fbm(x,y,octaves)  worley(x,y)  hash(x,y)
Iterated maps (arity 5, n = iteration count, keep n <= 32; all return ~0..1):
  julia(zx,zy,cr,ci,n)   escape-time Julia set
  ship(zx,zy,cr,ci,n)    burning-ship variant (abs before squaring)
  kali(px,py,cx,cy,n)    kaliset: p = abs(p)/dot(p,p) - c, colored by length
  orbit(zx,zy,cr,ci,n)   Julia iteration colored by closest pass to a circle
Helpers:
  fold(v) = abs(mod(v,2)-1)      length(a) = abs(a)      length(a,b) = distance
  atan2(y,x) = two-argument atan
Operators:
  + - * / ^ ( ) and comparisons < > == (comparisons return exactly 0.0 or 1.0)
Output modes:
  - a scalar  -> mapped through the palette
  - vec2(dx,dy) -> interpreted as a domain-warp displacement over an fbm base
  - vec3(r,g,b) -> direct color, components clamped to 0..1
  vec2 and vec3 are ONLY allowed as the outermost call of the whole formula.

HARD RULES (breaking these produces black screens or parse errors)
1. Never use ^, sqrt() or log() on a value that can be negative — undefined on
   GPU. Use abs(), or length(a,b) instead of sqrt(a*a+b*b).
2. Never divide by something that can be exactly zero without guarding it
   (add a small constant, or use max()).
3. No function outside the whitelist. No variables outside the list. No
   assignments, no semicolons, no loops, no if-statements, no GLSL syntax.
4. vec2/vec3 only at the very outside.
5. Animate with t. Slow drift beats fast spinning: t * 0.2 is usually better
   than t * 5.
6. Write constants as decimals (4.0, not 4) so they read clearly as sliders.

When you are unsure whether something parses, choose the safer construction.
A formula that renders something mediocre is infinitely better than one that
does not compile.
===
```

---

## The five jobs Grok is good at

### 1. Generate a family pack (the main job)
Formula Lab has a `packs` panel with a **copy AI prompt** button. That prompt is
built live from my actual history — my highest-rated formulas, what I save, which
coordinate systems and families I return to, what the machine discovered and I
kept — plus a mandatory rotation of 10 different strategies so the output does
not converge on the same trig shapes. **Prefer that generated prompt over
anything hand-written: it carries my real taste.** Paste it into Grok, and paste
Grok's JSON back into the panel.

If the button is unavailable, use the briefing above plus:

```
Design 10 NEW formulas for Formula Lab. Assign each a DIFFERENT strategy and
name the strategy in its notes:
1 no trig at all · 2 comparisons (< > ==) as the main structure ·
3 julia or ship · 4 kali or orbit · 5 vec2 displacement output ·
6 vec3 direct color · 7 one constant pushed 100x beyond sane, compensated
elsewhere · 8 hash/floor pixel logic only · 9 blend two unrelated structures so
both stay recognizable · 10 wildcard: your strangest idea that still parses.

Respond with ONLY this JSON, no prose, no markdown fences:
{"name":"<short-pack-name>","families":[
 {"name":"<display name>","source":"<formula>",
  "coords":"cartesian"|"polar"|"toroidal",
  "notes":"<one line: what it does + which strategy>"}]}
Exactly 10 entries.
```

Every formula is compiled through the real parser and transpiler on import;
invalid ones are dropped and reported, so a mistake costs one entry, not the pack.

### 2. Read a screenshot and push it further (uses Grok's vision)
Screenshot the canvas, paste it with the formula and ask:

> Here is the current output and the formula that produced it: `<formula>`.
> Describe what you actually see. Then give me three modified formulas: one that
> intensifies the dominant feature, one that breaks its symmetry, and one that
> keeps the structure but changes its texture completely. Same whitelist, JSON
> array of `{name, source, notes}`.

This is the fastest loop when something *almost* works.

### 3. Repair a formula that will not parse
Paste the formula and the exact error (the editor shows the message and the
column). Grok returns a corrected version. Common causes: a function not on the
whitelist, wrong arity, `^` on a negative base, or `vec3` used inside another
call.

### 4. Translate a mathematical idea into the language
Grok knows a lot of maths and can search the web. Useful prompts:

> Explain the <Gielis superformula / de Jong attractor / Chladni plate / Newton
> fractal / reaction-diffusion> and express what is expressible of it in the
> Formula Lab whitelist. If part of it needs iteration or feedback that the
> language lacks, say so explicitly and give the closest achievable
> approximation instead of inventing functions.

That last sentence matters: without it models invent `iterate()` or write raw
GLSL, which cannot be imported.

### 5. Propose palettes
Palettes are 4 colors, dark → light, defined in `src/core/glsl.js` as the
`PALETTES` array.

> Give me 3 palettes of 4 hex colors each, ordered dark to light, in the spirit
> of <CRT phosphor / Risograph / early-90s demoscene / rusted metal>. Format:
> `{ id: 'name', colors: ['#...', '#...', '#...', '#...'] }`. They must stay
> readable when only 4 quantized steps are used.

I add these by hand; they are not importable through the packs panel.

---

## What Grok should NOT be asked for
- Raw GLSL, shader code, or any language feature outside the whitelist — it
  cannot be imported and cannot be validated.
- Architecture or refactor advice for the codebase (that is Claude Code's job in
  the repo, with the tests and the actual files in front of it).
- Anything touching NEXUS, the OSC system, or TouchDesigner integration.

## For the human running this
The pack workflow, the exact JSON shape and the guarantees around generations
(kept separate, toggleable, validated on import) are in `docs/FAMILY-PACKS.md`.
The formula language reference is section 5 of `CLAUDE.md`. Nothing in this file
needs to change when new families are added — only when the whitelist itself
grows, in which case update the briefing block above and section 5 of CLAUDE.md
together.
