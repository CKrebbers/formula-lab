// Zero-player explorer (v3 auto-explore): each step births one candidate —
// mutate an elite, cross two elites, reroll a family, or grow a fresh random
// formula — and hands it to an injected evaluate(). No DOM: testable in Node.

import { parse } from '../core/parser.js';
import { print } from '../core/print.js';
import { extractParams, substituteParams } from '../core/constants.js';
import { mutateOnce } from './mutate.js';
import { crossover } from './crossover.js';
import { randomExpr, lhsParamSets } from './sample.js';
import { pick } from './walk.js';

const COORD_NAMES = ['cartesian', 'polar', 'toroidal'];

export class Explorer {
  /**
   * @param {{ families: object[],
   *           evaluate: (c: {source: string, coords: string}) =>
   *             Promise<null | { stats: object, thumb: string, novelty: number }>,
   *           rng?: () => number }} opts
   */
  constructor({ families, evaluate, rng = Math.random }) {
    this.families = families;
    this.evaluate = evaluate;
    this.rng = rng;
    this.tried = 0;
    this.found = 0;
  }

  /**
   * One exploration step.
   * @param {{ elites: import('./elites.js').ElitesGrid, fallbackSource: string,
   *           fallbackCoords: string, forceStrategy?: string }} ctx
   * @returns {Promise<{accepted: boolean, strategy: string, source?: string,
   *   coords?: string, origin?: string, operator?: string|null,
   *   parentIds?: string[], stats?: object, thumb?: string, novelty?: number}>}
   */
  async step(ctx) {
    this.tried++;
    const strategy = ctx.forceStrategy ?? this.pickStrategy(ctx.elites.count());
    const candidate = this.build(strategy, ctx);
    if (!candidate) return { accepted: false, strategy };

    const result = await this.evaluate({ source: candidate.source, coords: candidate.coords });
    if (!result) return { accepted: false, strategy };

    this.found++;
    return { accepted: true, strategy, ...candidate, ...result };
  }

  pickStrategy(eliteCount) {
    const r = this.rng();
    if (eliteCount < 5) {
      // cold start: seed the grid from families and fresh births
      if (r < 0.4) return 'family';
      if (r < 0.7) return 'birth';
      return 'mutate';
    }
    if (r < 0.55) return 'mutate';
    if (r < 0.75) return 'crossover';
    if (r < 0.9) return 'family';
    return 'birth';
  }

  build(strategy, { elites, fallbackSource, fallbackCoords }) {
    const elite = elites.count() ? pick(this.rng, elites.all()) : null;
    try {
      switch (strategy) {
        case 'mutate': {
          const source = elite ? elite.snapshot.formula.source : fallbackSource;
          const coords = elite ? elite.snapshot.coords : fallbackCoords;
          const res = mutateOnce(parse(source), this.rng);
          if (!res) return null;
          return {
            source: print(res.ast), coords, origin: 'mutate', operator: res.operator,
            parentIds: elite ? [elite.snapshot.id] : [],
          };
        }
        case 'crossover': {
          if (!elite) return null;
          const other = pick(this.rng, elites.all());
          const res = crossover(
            parse(elite.snapshot.formula.source),
            parse(other.snapshot.formula.source),
            this.rng
          );
          if (!res) return null;
          return {
            source: print(res.ast), coords: elite.snapshot.coords,
            origin: 'crossover', operator: 'crossover',
            parentIds: [elite.snapshot.id, other.snapshot.id],
          };
        }
        case 'family': {
          const family = pick(this.rng, this.families);
          const { ast, params } = extractParams(parse(family.source));
          const set = lhsParamSets(params, 1, this.rng)[0];
          return {
            source: print(substituteParams(ast, set)), coords: family.coords,
            origin: 'family', operator: 'const_reroll', parentIds: [], family: family.id,
          };
        }
        case 'birth': {
          const ast = {
            type: 'bin',
            op: pick(this.rng, ['+', '*', '-']),
            left: randomExpr(this.rng, 3),
            right: randomExpr(this.rng, 3),
          };
          return {
            source: print(ast), coords: pick(this.rng, COORD_NAMES),
            origin: 'sample', operator: null, parentIds: [],
          };
        }
        default:
          return null;
      }
    } catch {
      return null; // a malformed candidate is just a failed attempt
    }
  }
}
