/* Renders the framework diagram DOM from framework.json.
   Pure construction — interaction classes are applied later by state.js. */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

export const domId = (boxOrCompId) => boxOrCompId.replace(/[.]/g, '-');

function boxHTML(box) {
  const count = (box.refs || []).length;
  const code = box.display || box.abbrev;
  const showLabel = box.label && box.label.toUpperCase() !== code.toUpperCase();
  return `
    <button class="fw-box" type="button"
            id="box-${domId(box.id)}"
            data-box="${esc(box.id)}"
            aria-pressed="false"
            title="${count ? `${count} paper${count === 1 ? '' : 's'}` : esc(box.label || code)}${box.derived ? ' · via fusion configurations' : ''}">
      <span class="fw-box__abbrev">${esc(code)}</span>
      ${showLabel ? `<span class="fw-box__label">${esc(box.label)}</span>` : ''}
      ${count ? `<span class="fw-box__count">${count}</span>` : ''}
    </button>`;
}

function compHTML(comp, opts = {}) {
  const side = comp.kind === 'side';
  const wide = opts.wide ? ' fw-comp--wideboxes' : '';
  return `
    <section class="fw-comp ${side ? 'fw-comp--side' : 'fw-comp--main'}${wide}"
             data-comp="${esc(comp.id)}" id="comp-${domId(comp.id)}">
      <header class="fw-comp__head" data-comp-head="${esc(comp.id)}" tabindex="0" role="button"
              aria-label="Highlight all papers in ${esc(comp.title)}">
        <span class="fw-comp__letter">(${esc(comp.letter)})</span>
        <span>${esc(comp.title)}</span>
        ${comp.phaseLabel ? `<span class="fw-comp__sub">${esc(comp.phaseLabel)}</span>` : ''}
      </header>
      <div class="fw-comp__boxes">
        ${comp.boxes.map(boxHTML).join('')}
      </div>
    </section>`;
}

function bandHTML(band) {
  return `
    <div class="fw-band" data-band="${esc(band.id)}" id="band-${domId(band.id)}">
      ${band.groups.map((g) => `
        <div class="fw-band__group" data-comp="${esc(g.id)}" id="comp-${domId(g.id)}">
          <p class="fw-band__title" data-comp-head="${esc(g.id)}" tabindex="0" role="button"
             aria-label="Highlight all papers in ${esc(g.title)}">${esc(g.title)}</p>
          <div class="fw-band__boxes">
            ${g.boxes.map(boxHTML).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

/* Panel composition — mirrors the paper's Fig. 2 reading order, re-art-directed
   for vertical web flow. */
const PANEL_CONTENT = {
  fusion: { comps: ['perception', 'fusion'], bands: [] },
  phase1: { comps: ['reconstruction', 'policy1', 'intermediate'], bands: [] },
  phase2: { comps: ['obsprediction', 'policy2'], bands: ['band.p2in'] },
  phase3: { comps: ['control'], bands: ['band.p3in'] },
};

const WIDE_BOX_COMPS = new Set(['policy1', 'policy2', 'control', 'intermediate']);

export function renderFramework(data) {
  const root = document.getElementById('framework-root');
  if (!root) return;

  const compMap = new Map(data.framework.components.map((c) => [c.id, c]));
  const bandMap = new Map((data.framework.bands || []).map((b) => [b.id, b]));

  const html = data.PANELS.map((panel) => {
    const content = PANEL_CONTENT[panel.id];
    const parts = [];

    if (panel.id === 'phase1') {
      // side card (c) spans rows next to (d) + (f)
      const recon = compMap.get('reconstruction');
      const p1 = compMap.get('policy1');
      const inter = compMap.get('intermediate');
      if (recon) parts.push(compHTML(recon));
      if (p1) parts.push(compHTML(p1, { wide: true }));
      if (inter) parts.push(compHTML(inter, { wide: true }));
    } else if (panel.id === 'phase2') {
      const band = bandMap.get('band.p2in');
      const p2 = compMap.get('policy2');
      const obs = compMap.get('obsprediction');
      if (band) parts.push(bandHTML(band));
      if (obs) parts.push(compHTML(obs));
      if (p2) parts.push(compHTML(p2, { wide: true }));
    } else {
      for (const bandId of content.bands) {
        const band = bandMap.get(bandId);
        if (band) parts.push(bandHTML(band));
      }
      for (const compId of content.comps) {
        const comp = compMap.get(compId);
        if (comp) parts.push(compHTML(comp, { wide: WIDE_BOX_COMPS.has(compId) }));
      }
    }

    return `
      <section class="fw-panel" data-panel="${panel.id}" id="panel-${panel.id}">
        <header class="fw-panel__head">
          <span class="fw-panel__phase">${panel.phase}</span>
          <h3 class="fw-panel__title">${esc(panel.title)}</h3>
          <span class="fw-panel__note">${esc(panel.note)}</span>
        </header>
        <div class="fw-panel__grid">
          ${parts.join('')}
        </div>
      </section>`;
  }).join('');

  // wires overlay sits first so it can never cover scrollbars; z-index handles layering
  root.innerHTML = `<svg class="fw-wires" aria-hidden="true"></svg>${html}`;
}
