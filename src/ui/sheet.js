// Contact sheets. Two flows:
//  - tweak sheet (v1): same shader, 8 gaussian param variants + original
//  - mutation sheet (v2): structural children via §6 operators (or crossover /
//    LHS rerolls), §7-filtered, sorted by novelty desc. Center = parent.

import { constTweak, mutateOnce } from '../search/mutate.js';
import { crossover } from '../search/crossover.js';
import { lhsParamSets } from '../search/sample.js';
import { extractParams, substituteParams } from '../core/constants.js';
import { transpile } from '../core/glsl.js';
import { print } from '../core/print.js';
import { computeStats, averageStats, shouldReject } from '../search/filter.js';
import { luminanceHistogram, noveltyOf } from '../search/novelty.js';

const SHEET_SIZE = 8; // candidates around the center tile
const MAX_ATTEMPTS = 60;

export class ContactSheet {
  /**
   * @param {HTMLElement} container
   * @param {{ onPromoteParams: (params: object) => void,
   *           onPromoteFormula: (c: {source: string, operator: string}) => void }} handlers
   */
  constructor(container, handlers) {
    this.container = container;
    this.handlers = handlers;
  }

  clear() {
    this.container.textContent = '';
  }

  /** v1 flow: 8 const_tweak param variants + original in the center. */
  generateTweak(tileRenderer, baseParams, locks, state) {
    this.clear();
    for (let i = 0; i < 9; i++) {
      const isOriginal = i === 4;
      const params = isOriginal ? { ...baseParams } : constTweak(baseParams, Math.random, { locks });
      const canvas = makeTile(tileRenderer.size, isOriginal);
      tileRenderer.drawTo(canvas.getContext('2d'), { ...state, params });
      if (!isOriginal) {
        canvas.addEventListener('click', () => this.handlers.onPromoteParams(params));
      }
      this.container.appendChild(canvas);
    }
  }

  /**
   * v2 flow. Generates, filters (§7) and novelty-sorts up to 8 children.
   * @param {{ tileRenderer, ast: object, params: object, locks: object,
   *           state: object, mask: string, archiveHists: Float64Array[],
   *           partner: object|null, parentShader: {fragmentSource, paramNames} }} opts
   * @returns {{ shown: number, tried: number }}
   */
  generateMutations(opts) {
    const { tileRenderer, ast, params, locks, state, mask, archiveHists = [], partner = null } = opts;
    const raw = substituteParams(ast, params);
    const candidates = [];
    let tried = 0;

    while (candidates.length < SHEET_SIZE && tried < MAX_ATTEMPTS) {
      tried++;
      const made = makeChild(raw, ast, params, locks, mask, partner);
      if (!made) continue;
      try {
        const { ast: paramAst, params: childParams } = extractParams(made.ast);
        const { fragmentSource, paramNames } = transpile(paramAst);
        tileRenderer.setShader(fragmentSource, paramNames);
        const childState = { ...state, params: childParams };

        // §7 filter on palette-free renders at t=0 and t=1
        const s0 = tileRenderer.readStats({ ...childState, time: 0 });
        const s1 = tileRenderer.readStats({ ...childState, time: 1 });
        const stats = averageStats(
          computeStats(s0.pixels, s0.width, s0.height),
          computeStats(s1.pixels, s1.width, s1.height)
        );
        if (shouldReject(stats).rejected) continue;

        // display tile (palette render, frozen at current time) + novelty
        const canvas = makeTile(tileRenderer.size, false);
        tileRenderer.drawTo(canvas.getContext('2d'), childState);
        const disp = tileRenderer.renderer.readPixels();
        const novelty = noveltyOf(
          luminanceHistogram(disp.pixels, disp.width, disp.height),
          archiveHists
        );
        candidates.push({ canvas, source: print(made.ast), operator: made.operator, novelty, stats });
      } catch {
        continue; // parse/compile blow-ups are just failed candidates
      }
    }

    // restore the parent's shader for the center tile and everything after
    tileRenderer.setShader(opts.parentShader.fragmentSource, opts.parentShader.paramNames);

    candidates.sort((a, b) => b.novelty - a.novelty);
    this.clear();
    const layout = [...candidates.slice(0, 4), 'parent', ...candidates.slice(4)];
    for (const cell of layout) {
      if (cell === 'parent') {
        const canvas = makeTile(tileRenderer.size, true);
        tileRenderer.drawTo(canvas.getContext('2d'), state);
        canvas.title = 'parent';
        this.container.appendChild(canvas);
        continue;
      }
      cell.canvas.title = `${cell.operator} · novelty ${cell.novelty.toFixed(3)}\n${cell.source}`;
      cell.canvas.addEventListener('click', () =>
        this.handlers.onPromoteFormula({ source: cell.source, operator: cell.operator }));
      this.container.appendChild(cell.canvas);
    }
    return { shown: candidates.length, tried };
  }
}

/** One raw child AST via the mask's generator. Returns { ast, operator } | null. */
function makeChild(raw, paramAst, params, locks, mask, partner) {
  if (partner) {
    return crossover(raw, partner, Math.random);
  }
  if (mask === 'constants') {
    // §6: stratified LHS when rerolling many constants at once
    const set = lhsParamSets(params, 1, Math.random, { locks })[0];
    return { ast: substituteParams(paramAst, set), operator: 'const_reroll' };
  }
  return mutateOnce(raw, Math.random, { mask, locks });
}

function makeTile(size, isOriginal) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = isOriginal ? 'tile original' : 'tile';
  return canvas;
}
