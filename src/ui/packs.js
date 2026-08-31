// Pack manager panel: list generations (toggle ●/○, delete ✕), copy the
// AI generation prompt (seeded with the user's history), and paste-import
// the JSON a model answers with.

export class PacksPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('../families/packs.js').FamilyPacks} packs
   * @param {{ onChange: () => void, buildPrompt: () => string }} hooks
   */
  constructor(container, packs, hooks) {
    this.container = container;
    this.packs = packs;
    this.hooks = hooks;
    this.build();
  }

  build() {
    this.container.textContent = '';

    const label = document.createElement('div');
    label.className = 'mods-label';
    label.textContent = 'family packs — AI-generated generations, kept apart';

    const promptBtn = document.createElement('button');
    promptBtn.className = 'slider-btn';
    promptBtn.textContent = 'copy AI prompt';
    promptBtn.title = 'copies a generation prompt seeded with your ratings, saves and elite discoveries — paste it into any LLM';
    promptBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.hooks.buildPrompt());
        this.status('prompt copied — paste into an LLM, paste its JSON below');
      } catch {
        this.status('clipboard blocked — see docs/FAMILY-PACKS.md');
      }
    });

    this.listEl = document.createElement('div');
    this.listEl.className = 'packs-list';

    this.paste = document.createElement('textarea');
    this.paste.rows = 3;
    this.paste.placeholder = 'paste the JSON answer here… {"name": "...", "families": [...]}';
    this.paste.spellcheck = false;

    const importBtn = document.createElement('button');
    importBtn.className = 'slider-btn';
    importBtn.textContent = 'import pack';
    importBtn.addEventListener('click', () => {
      const text = this.paste.value.trim().replace(/^```(json)?|```$/g, '');
      if (!text) return this.status('nothing pasted');
      try {
        const { pack, added, rejected } = this.packs.importJSON(text);
        this.paste.value = '';
        this.status(`'${pack.name}': ${added} imported`
          + (rejected.length ? `, ${rejected.length} rejected (${rejected[0].error})` : ''));
        this.refresh();
        this.hooks.onChange();
      } catch (err) {
        this.status(`import failed: ${err.message}`);
      }
    });

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'packs-status';

    this.container.append(label, promptBtn, this.listEl, this.paste, importBtn, this.statusEl);
    this.refresh();
  }

  status(text) {
    this.statusEl.textContent = text;
  }

  refresh() {
    this.listEl.textContent = '';
    for (const pack of this.packs.list()) {
      const row = document.createElement('div');
      row.className = 'pack-row';

      const toggle = document.createElement('button');
      toggle.className = 'slider-btn';
      toggle.textContent = pack.enabled ? '●' : '○';
      toggle.title = pack.enabled ? 'enabled — click to switch off' : 'disabled — click to switch on';
      toggle.addEventListener('click', () => {
        this.packs.toggle(pack.id);
        this.refresh();
        this.hooks.onChange();
      });

      const name = document.createElement('span');
      name.textContent = `${pack.name} (${pack.families.length})`;
      name.title = new Date(pack.created).toLocaleString();

      const del = document.createElement('button');
      del.className = 'slider-btn';
      del.textContent = '✕';
      del.title = 'delete this pack';
      del.addEventListener('click', () => {
        this.packs.remove(pack.id);
        this.refresh();
        this.hooks.onChange();
      });

      row.append(toggle, name, del);
      this.listEl.appendChild(row);
    }
  }
}
