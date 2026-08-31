// Starter-library picker: a <select> listing every registered family.

import { FAMILIES } from '../families/index.js';

/**
 * @param {HTMLSelectElement} select
 * @param {(family: object) => void} onPick
 */
export function initFamilyPicker(select, onPick) {
  select.append(new Option('family…', ''));
  for (const family of FAMILIES) {
    const opt = new Option(`${family.id} — ${family.name}`, family.id);
    opt.title = family.notes;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    const family = FAMILIES.find((f) => f.id === select.value);
    select.value = ''; // reset so re-picking the same family fires again
    if (family) onPick(family);
  });
}
