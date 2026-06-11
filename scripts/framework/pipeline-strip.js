/* Sticky pipeline strip: when a paper is pinned, shows its full path through
   the framework as clickable chips ([42] · VFS → DP (P1) → A → … ). Clicking
   a chip scrolls the page to that box. */

import { domId } from './render.js';
import { scrollDiagramTo } from './scroll.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

export function initPipelineStrip(data, stateApi) {
  const strip = document.getElementById('pipeline-strip');
  if (!strip || !stateApi) return;

  function chipsFor(refId) {
    const hitIds = new Set(data.refToBoxes.get(refId) || []);
    // boxesFlat is in visual order; derived perception hits would only add noise
    return data.boxesFlat.filter((b) => hitIds.has(b.id) && !b.derived);
  }

  function show(refId) {
    const paper = data.paperById.get(refId);
    if (!paper) return hide();

    const boxes = chipsFor(refId);
    if (!boxes.length) return hide(); // background reference — nothing to trace
    const chips = boxes.map((b, i) => `
      ${i > 0 ? '<span class="pipeline-strip__arrow">→</span>' : ''}
      <button class="pipeline-strip__chip" type="button" data-goto="box-${domId(b.id)}"
              title="${esc(b.compTitle)}">
        <span class="ph">${b.phaseTag}</span>${esc(b.display || b.abbrev)}
      </button>`).join('');

    strip.innerHTML = `
      <span class="pipeline-strip__who" title="${esc(paper.title)}">
        [${paper.id}] ${esc(paper.authors)} · ${esc(paper.title)}
      </span>
      ${chips}
      <button class="pipeline-strip__clear" type="button" data-clear>Esc · Clear</button>`;
    strip.hidden = false;
  }

  function hide() {
    strip.hidden = true;
    strip.innerHTML = '';
  }

  strip.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      scrollDiagramTo(document.getElementById(goto.dataset.goto), { margin: 140 });
      return;
    }
    if (e.target.closest('[data-clear]')) stateApi.clear();
  });

  document.addEventListener('explorer:change', (e) => {
    const { pinned } = e.detail;
    if (pinned && pinned.type === 'ref') show(pinned.id);
    else hide();
  });

  // hash deep-links pin before this module subscribes — sync once at init
  const current = stateApi.get().pinned;
  if (current && current.type === 'ref') show(current.id);
}
