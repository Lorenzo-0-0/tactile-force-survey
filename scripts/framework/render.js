/* Renders the framework diagram DOM from framework.json, mirroring the
   paper's Fig. 2 layout: (a)(b) fusion stack, (c) reconstruction docked left
   of (d)(f), bands + (g) with (e) docked right, (h) under the phase-3 band.
   Compact one-viewport design — boxes carry code + count, full names in
   tooltips. Interaction classes are applied by state.js. */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

export const domId = (boxOrCompId) => boxOrCompId.replace(/[.]/g, '-');

function boxHTML(box, { labeled = false } = {}) {
  const count = (box.refs || []).length;
  const code = box.display || box.abbrev;
  const tip = `${box.label && box.label.toUpperCase() !== code.toUpperCase() ? box.label + ' · ' : ''}${count} paper${count === 1 ? '' : 's'}${box.derived ? ' · via fusion configurations' : ''}`;
  return `
    <button class="fw-box${labeled ? ' fw-box--labeled' : ''}" type="button"
            id="box-${domId(box.id)}" data-box="${esc(box.id)}"
            aria-pressed="false" title="${esc(tip)}">
      <span class="fw-box__top">
        <span class="fw-box__abbrev">${esc(code)}</span>
        ${count ? `<span class="fw-box__count">${count}</span>` : ''}
      </span>
      ${labeled && box.label ? `<span class="fw-box__label">${esc(box.label)}</span>` : ''}
    </button>`;
}

function stripHTML(comp, { side = false } = {}) {
  return `
    <header class="fw-strip${side ? ' fw-strip--side' : ''}" data-comp-head="${esc(comp.id)}"
            tabindex="0" role="button" aria-label="Highlight all papers in ${esc(comp.title)}">
      <span class="fw-strip__letter">(${esc(comp.letter)})</span> ${esc(comp.title)}
    </header>`;
}

function compHTML(comp, { labeled = false, cols = null } = {}) {
  const colsStyle = cols ? ` style="--cols:${cols}"` : '';
  return `
    <div class="fw-comp" data-comp="${esc(comp.id)}" id="comp-${domId(comp.id)}">
      ${stripHTML(comp)}
      <div class="fw-comp__boxes"${colsStyle}>
        ${comp.boxes.map((b) => boxHTML(b, { labeled })).join('')}
      </div>
    </div>`;
}

function sideHTML(comp, { foot = null, head = null } = {}) {
  return `
    <aside class="fw-side" data-comp="${esc(comp.id)}" id="comp-${domId(comp.id)}">
      ${head ? `<p class="fw-side__note">${esc(head)}</p>` : ''}
      ${stripHTML(comp, { side: true })}
      <div class="fw-comp__boxes fw-comp__boxes--side">
        ${comp.boxes.map((b) => boxHTML(b)).join('')}
      </div>
      ${foot ? `<p class="fw-side__note fw-side__note--foot">${esc(foot)}</p>` : ''}
    </aside>`;
}

function bandHTML(band, groups) {
  return `
    <div class="fw-band" data-band="${esc(band.id)}" id="band-${domId(band.id)}">
      ${groups.map((g) => `
        <div class="fw-band__group" data-comp="${esc(g.id)}" id="comp-${domId(g.id)}"
             style="--gcols:${g.boxes.length}">
          <p class="fw-band__title" data-comp-head="${esc(g.id)}" tabindex="0" role="button"
             aria-label="Highlight all papers in ${esc(g.title)}">${esc(g.title)}</p>
          <div class="fw-band__boxes">
            ${g.boxes.map((b) => boxHTML(b)).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

export function renderFramework(data) {
  const root = document.getElementById('framework-root');
  if (!root) return;

  const comp = new Map(data.framework.components.map((c) => [c.id, c]));
  const band = new Map((data.framework.bands || []).map((b) => [b.id, b]));
  const p2 = band.get('band.p2in');
  const p3 = band.get('band.p3in');

  root.innerHTML = `
    <svg class="fw-wires" aria-hidden="true"></svg>

    <section class="fw-panel" data-panel="fusion" id="panel-fusion">
      <span class="fw-panel__rail">Multi-modality Fusion</span>
      <div class="fw-stack">
        ${compHTML(comp.get('perception'), { cols: 6 })}
        ${compHTML(comp.get('fusion'), { cols: 12 })}
      </div>
    </section>

    <section class="fw-panel" data-panel="phase1" id="panel-phase1">
      <span class="fw-panel__rail">Phase 1 · Primary Action Policy</span>
      <div class="fw-panel__grid">
        ${sideHTML(comp.get('reconstruction'), { foot: 'Auxiliary Representation Learning' })}
        <div class="fw-stack">
          ${compHTML(comp.get('policy1'), { labeled: true, cols: 5 })}
          ${compHTML(comp.get('intermediate'), { labeled: true, cols: 4 })}
        </div>
      </div>
    </section>

    <section class="fw-panel" data-panel="phase2" id="panel-phase2">
      <span class="fw-panel__rail">Phase 2 · Refinement Policy</span>
      <div class="fw-panel__grid fw-panel__grid--right">
        <div class="fw-stack">
          ${p2 ? bandHTML(p2, p2.groups) : ''}
          ${compHTML(comp.get('policy2'), { labeled: true, cols: 5 })}
        </div>
        ${sideHTML(comp.get('obsprediction'), { head: 'Auxiliary Observation Prediction' })}
      </div>
    </section>

    <section class="fw-panel" data-panel="phase3" id="panel-phase3">
      <span class="fw-panel__rail">Phase 3 · Robot-end Control</span>
      <div class="fw-stack">
        ${p3 ? bandHTML(p3, p3.groups) : ''}
        ${compHTML(comp.get('control'), { labeled: true, cols: 6 })}
      </div>
    </section>`;
}
