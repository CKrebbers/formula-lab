// Starter-library picker: built-in families + every ENABLED family pack,
// grouped per generation (optgroup), so packs stay visibly separate.

/**
 * @param {HTMLSelectElement} select
 * @param {(family: object) => void} onPick
 * @param {() => {label: string, families: object[]}[]} getGroups
 * @returns {{ refresh: () => void }}
 */
export function initFamilyPicker(select, onPick, getGroups) {
  let flat = [];

  function refresh() {
    select.textContent = '';
    select.append(new Option('family…', ''));
    flat = [];
    for (const group of getGroups()) {
      if (!group.families.length) continue;
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      for (const family of group.families) {
        const opt = new Option(`${family.id} — ${family.name}`, family.id);
        opt.title = family.notes;
        optgroup.append(opt);
        flat.push(family);
      }
      select.append(optgroup);
    }
  }

  select.addEventListener('change', () => {
    const family = flat.find((f) => f.id === select.value);
    select.value = ''; // reset so re-picking the same family fires again
    if (family) onPick(family);
  });

  refresh();
  return { refresh };
}
