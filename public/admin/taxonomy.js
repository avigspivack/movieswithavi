// Taxonomy autocomplete for comma-separated category/tag fields.
// Attaches a suggestion dropdown to an <input>; suggestions come from /api/taxonomy.
// Typing a value not in the list is always allowed (free entry preserved).
(function () {
  let TAX = { categories: [], tags: [] };
  let loaded = false;

  async function loadTax() {
    if (loaded) return TAX;
    try {
      const r = await fetch('/api/taxonomy');
      if (r.ok) TAX = await r.json();
    } catch (e) { /* offline / build not ready: fall back to empty, free entry still works */ }
    loaded = true;
    return TAX;
  }

  // split "a, b, c" into pieces; return {items, current} where current is the fragment being typed
  function parse(value) {
    const parts = value.split(',');
    const current = parts[parts.length - 1].trim();
    const items = parts.slice(0, -1).map(s => s.trim()).filter(Boolean);
    return { items, current };
  }

  function attach(input, kind) {
    const pool = () => (kind === 'tags' ? TAX.tags : TAX.categories);
    // Wrap the input so the dropdown positions against the INPUT, not the whole form.
    let wrap = input.closest('.tax-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'tax-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    const box = document.createElement('div');
    box.className = 'tax-suggest';
    box.style.display = 'none';
    wrap.appendChild(box);

    let active = -1;

    function chosenLower(value) {
      return new Set(parse(value).items.map(s => s.toLowerCase()).concat(
        // also exclude anything already fully typed before the current fragment
        []));
    }

    function refresh() {
      const { items, current } = parse(input.value);
      const used = new Set(items.map(s => s.toLowerCase()));
      const frag = current.toLowerCase();
      let matches = pool().filter(x => !used.has(x.toLowerCase()));
      if (frag) matches = matches.filter(x => x.toLowerCase().includes(frag));
      matches = matches.slice(0, 8);
      if (!matches.length) { box.style.display = 'none'; return; }
      active = -1;
      box.innerHTML = matches.map((m, i) =>
        `<div class="tax-opt" data-i="${i}" data-v="${m.replace(/"/g, '&quot;')}">${m}</div>`).join('');
      box.style.display = '';
    }

    function pick(val) {
      const { items } = parse(input.value);
      const next = items.concat(val);
      input.value = next.join(', ') + ', ';
      box.style.display = 'none';
      input.focus();
    }

    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);
    input.addEventListener('blur', () => setTimeout(() => { box.style.display = 'none'; }, 150));
    input.addEventListener('keydown', (e) => {
      if (box.style.display === 'none') return;
      const opts = [...box.querySelectorAll('.tax-opt')];
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, opts.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(opts[active].dataset.v); return; }
      else if (e.key === 'Escape') { box.style.display = 'none'; return; }
      else return;
      opts.forEach((o, i) => o.classList.toggle('on', i === active));
    });
    box.addEventListener('mousedown', (e) => {
      const o = e.target.closest('.tax-opt'); if (!o) return;
      e.preventDefault(); pick(o.dataset.v);
    });
  }

  // public init: call after the form exists
  window.initTaxonomy = async function () {
    await loadTax();
    const cat = document.getElementById('categories');
    const tag = document.getElementById('tags');
    if (cat) attach(cat, 'categories');
    if (tag) attach(tag, 'tags');
  };
})();
