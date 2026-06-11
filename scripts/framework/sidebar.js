/* Sidebar paper directory: render 189 rows, text filter, scope toggle
   (all / mapped-in-framework), scroll-to-first-hit.
   Highlight classes are applied by state.js — this module owns construction,
   search/scope, and scrolling only. */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

function paperHTML(p, mapped) {
  const link = p.url
    ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" data-paper-link
         aria-label="Open paper [${p.id}]">${p.url.includes('arxiv') ? 'arXiv' : 'DOI'} ↗</a>`
    : '';
  return `
    <li class="paper ${mapped ? 'paper--mapped' : ''}" data-ref="${p.id}" id="paper-${p.id}" tabindex="0"
        aria-label="[${p.id}] ${esc(p.title)}">
      <span class="paper__num">[${p.id}]${mapped ? '<span class="paper__node" title="Appears in the framework diagram"></span>' : ''}</span>
      <span class="paper__body">
        <span class="paper__title">${esc(p.title)}</span>
        <span class="paper__meta">
          <span>${esc(p.authors)}</span>·<span>${esc(p.venue)} ${p.year}</span>${link}
        </span>
      </span>
    </li>`;
}

export function renderSidebar(data) {
  const list = document.getElementById('paper-list');
  if (!list) return null;

  const isMapped = (id) => data.refToBoxes.has(id);
  list.innerHTML = data.papers.map((p) => paperHTML(p, isMapped(p.id))).join('');

  const rows = new Map();
  list.querySelectorAll('.paper').forEach((el) => rows.set(Number(el.dataset.ref), el));

  const status = document.getElementById('sidebar-status');
  const search = document.getElementById('paper-search');
  const scopeEl = document.getElementById('sidebar-scope');
  const total = data.papers.length;
  const mappedTotal = data.refToBoxes.size;

  // precomputed haystacks for the filter
  const hay = new Map();
  for (const p of data.papers) {
    hay.set(p.id, `[${p.id}] ${p.title} ${p.authors} ${p.venue} ${p.year} ${p.key}`.toLowerCase());
  }

  let scope = 'all';
  let query = '';

  const api = {
    rows,
    isMapped,
    setStatus(html) { if (status) status.innerHTML = html; },
    defaultStatus() {
      api.setStatus(scope === 'mapped'
        ? `<span class="hl">${mappedTotal}</span> in framework`
        : `${total} papers`);
    },

    /* re-evaluate row visibility from scope + query; returns shown count */
    refilter() {
      const q = query.trim().toLowerCase();
      let shown = 0;
      for (const [id, el] of rows) {
        const match = (!q || hay.get(id).includes(q)) && (scope === 'all' || isMapped(id));
        el.style.display = match ? '' : 'none';
        if (match) shown += 1;
      }
      if (q) api.setStatus(`<span class="hl">${shown}</span> / ${scope === 'mapped' ? mappedTotal : total} match “${esc(query.trim())}”`);
      else api.defaultStatus();
      return shown;
    },

    filter(q) { query = q; return api.refilter(); },

    /* scroll the sidebar's internal list to a given ref */
    scrollToRef(ref) {
      const el = rows.get(ref);
      if (!el || el.style.display === 'none') return;
      const top = el.offsetTop - list.offsetTop - 8;
      list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    },
  };

  if (search) {
    // direct, not rAF-debounced: 189 rows is trivial, and rAF starves in
    // background tabs which made the filter appear dead
    search.addEventListener('input', () => {
      api.filter(search.value);
      document.dispatchEvent(new CustomEvent('explorer:searched', { detail: search.value }));
    });
  }

  if (scopeEl) {
    scopeEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-scope]');
      if (!btn || btn.dataset.scope === scope) return;
      scope = btn.dataset.scope;
      scopeEl.querySelectorAll('[data-scope]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      api.refilter();
      document.dispatchEvent(new CustomEvent('explorer:searched', { detail: query }));
    });
  }

  api.defaultStatus();
  return api;
}
