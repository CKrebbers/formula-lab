// Family registry. One file per family (§8); each exports
// { id, name, source, params, coords, notes, ref }.
// `params: {}` everywhere — the literals in `source` ARE the params;
// extraction (core/constants.js) turns them into sliders automatically.

import fieldTrig from './field-trig.js';
import fieldTixy from './field-tixy.js';
import fieldInterference from './field-interference.js';
import fieldChladni from './field-chladni.js';
import fieldMoire from './field-moire.js';
import warpFbm from './warp-fbm.js';
import warpCurl from './warp-curl.js';
import noiseWorley from './noise-worley.js';
import shapeSuperformula from './shape-superformula.js';
import shapeTruchet from './shape-truchet.js';
import iterJulia from './iter-julia.js';
import iterShip from './iter-ship.js';
import iterKaliset from './iter-kaliset.js';
import iterOrbit from './iter-orbit.js';
import bitBytebeat from './bit-bytebeat.js';
import camMirror from './cam-mirror.js';
import selfHomeostat from './self-homeostat.js';

export const FAMILIES = [
  fieldTrig,
  fieldTixy,
  fieldInterference,
  fieldChladni,
  fieldMoire,
  warpFbm,
  warpCurl,
  noiseWorley,
  shapeSuperformula,
  shapeTruchet,
  iterJulia,
  iterShip,
  iterKaliset,
  iterOrbit,
  bitBytebeat,
  camMirror,
  selfHomeostat,
];

/** Families that work without a live input — for random starts and the zero-player. */
export function autonomousFamilies(list = FAMILIES) {
  return list.filter((f) => !f.input);
}

export function getFamily(id) {
  return FAMILIES.find((f) => f.id === id) ?? null;
}
