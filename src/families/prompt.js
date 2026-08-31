// Builds the AI generation prompt for a new family pack, seeded with the
// user's actual memories: rated snapshots, origin history, elites discoveries.
// The output of that prompt (strict JSON, 10 formulas) imports directly as a
// pack. See docs/FAMILY-PACKS.md for the workflow.

const GRAMMAR = `FORMULA LANGUAGE (strict whitelist — anything else fails to parse):
- variables: x, y (both -1..1), t (seconds), r, th (polar), mx, my (mouse), i (pixel index)
- functions: sin cos tan atan atan2 abs floor fract mod pow sqrt exp log
  min max clamp mix step smoothstep length sign
  noise(x,y) fbm(x,y,octaves) worley(x,y) hash(x,y)
- length(a) = abs, length(a,b) = distance; atan2(y,x)
- operators: + - * / ^ ( ) and comparisons < > == (return 0.0/1.0)
- output: a scalar (mapped to a 4-color palette), or top-level vec2(dx,dy)
  (domain-warp displacement) or vec3(r,g,b) (direct color). vec2/vec3 are
  ONLY allowed as the outermost call.
- NEVER use ^ or sqrt/log on possibly-negative values (undefined on GPU) —
  wrap in abs() or use length(a,b).
- every numeric literal becomes a live slider, so use real decimal constants
  generously (aim for 3–8 per formula) instead of magic structure.
- animate with t; slow drift beats fast spinning.`;

const OUTPUT_SPEC = `OUTPUT — respond with ONLY this JSON, no prose, no markdown fences:
{
  "name": "<short-pack-name>",
  "families": [
    { "name": "<display name>",
      "source": "<formula in the language above>",
      "coords": "cartesian" | "polar" | "toroidal",
      "notes": "<one line: what it does + which taste signal inspired it>" }
  ]
}
Exactly 10 families. Every formula must parse under the grammar. Vary the
structure across the 10 (fields, warps, cellular, interference, comparisons,
one vec2 and/or one vec3 is welcome).`;

/**
 * @param {{snapshots?: object[], elites?: {snapshot: object, fitness: number}[],
 *          packNames?: string[]}} data — the user's memory banks
 */
export function buildFamilyPrompt({ snapshots = [], elites = [], packNames = [] } = {}) {
  const lines = [];
  lines.push('You generate a new FAMILY PACK for Formula Lab: a browser tool where');
  lines.push('formulas f(x, y, t) → color are explored, mutated and performed live.');
  lines.push('Aesthetic north star: glitch, texture, pixel art, dither, CRT,');
  lines.push('digital magic realism. Not smooth, not polished, not corporate.');
  lines.push('');
  lines.push(GRAMMAR);
  lines.push('');
  lines.push(userTasteDigest(snapshots, elites, packNames));
  lines.push('');
  lines.push('YOUR TASK: design 10 NEW formulas that push further into what this');
  lines.push('history shows the user loves — same veins, deeper cuts, unexpected');
  lines.push('crossings — while avoiding near-duplicates of anything listed above.');
  lines.push('');
  lines.push(OUTPUT_SPEC);
  return lines.join('\n');
}

function userTasteDigest(snapshots, elites, packNames) {
  const lines = ["USER'S MEMORY (their actual history — build on this):"];

  const rated = snapshots
    .filter((s) => (s.rating ?? 0) >= 4)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 8);
  if (rated.length) {
    lines.push(`- formulas they rated ${'≥'}4/5 (their strongest signal):`);
    for (const s of rated) {
      lines.push(`    ★${s.rating} [${s.coords}] ${s.formula.source}`
        + `  (entropy ${s.stats.entropy.toFixed(2)}, symmetry ${s.stats.symmetry.toFixed(2)})`);
    }
  }

  const saved = snapshots.filter((s) => !rated.includes(s)).slice(0, 6);
  if (saved.length) {
    lines.push('- other formulas they chose to save:');
    for (const s of saved) lines.push(`    [${s.coords}] ${s.formula.source}`);
  }

  const originCounts = {};
  const coordCounts = {};
  const familyCounts = {};
  for (const s of snapshots) {
    originCounts[s.origin] = (originCounts[s.origin] ?? 0) + 1;
    coordCounts[s.coords] = (coordCounts[s.coords] ?? 0) + 1;
    if (s.family) familyCounts[s.family] = (familyCounts[s.family] ?? 0) + 1;
  }
  if (snapshots.length) {
    lines.push(`- how they work: origins ${JSON.stringify(originCounts)}, coords ${JSON.stringify(coordCounts)}`);
  }
  if (Object.keys(familyCounts).length) {
    lines.push(`- families they return to: ${JSON.stringify(familyCounts)}`);
  }

  const eliteSamples = elites.slice(0, 6);
  if (eliteSamples.length) {
    lines.push(`- machine discoveries they kept on the elites grid (${elites.length} cells filled):`);
    for (const e of eliteSamples) {
      lines.push(`    [${e.snapshot.coords}] ${e.snapshot.formula.source}`);
    }
  }

  if (packNames.length) {
    lines.push(`- packs already generated (do not repeat their territory): ${packNames.join(', ')}`);
  }

  if (lines.length === 1) {
    lines.push('- no history yet: invent adventurously inside the stated aesthetic.');
  }
  return lines.join('\n');
}
