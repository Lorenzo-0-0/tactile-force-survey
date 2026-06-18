/* Explorer bootstrap: load data → render diagram + sidebar → wire state,
   connectors, pipeline strip. Fails soft: on any error the section shows a
   fallback message instead of a broken half-render. */

import { loadData } from './data.js?v=11';
import { renderFramework } from './render.js?v=11';
import { renderSidebar } from './sidebar.js?v=11';
import { initState } from './state.js?v=11';
import { initConnectors } from './connectors.js?v=11';
import { initPipelineStrip } from './pipeline-strip.js?v=11';

(async () => {
  const root = document.getElementById('framework-root');
  try {
    const data = await loadData();
    renderFramework(data);
    const sidebar = renderSidebar(data);
    const stateApi = initState(data, sidebar);
    initConnectors(data, stateApi);
    initPipelineStrip(data, stateApi);
    document.documentElement.classList.add('explorer-ready');
  } catch (err) {
    console.error('[explorer] failed to boot:', err);
    if (root) {
      root.innerHTML = `
        <p style="font-family: var(--mono); font-size: 13px; color: var(--text-muted); padding: 2rem">
          The interactive framework could not load (${String(err.message || err)}).
          Please refer to Fig. 2 of the paper.
        </p>`;
    }
  }
})();
