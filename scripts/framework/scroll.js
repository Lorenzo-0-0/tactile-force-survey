/* Shared scrolling helper for the explorer.
   Desktop: the diagram lives in its own scroll container (.explorer__main);
   mobile (<900px) falls back to page flow — detected via computed overflow,
   so no media-query duplication here. */

export function diagramScroller() {
  return document.querySelector('.explorer__main');
}

export function scrollDiagramTo(el, { margin = 100 } = {}) {
  const sc = diagramScroller();
  if (!sc || !el) return;

  if (getComputedStyle(sc).overflowY !== 'auto') {
    // page-flow fallback (mobile)
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -160, duration: 0.9 });
    else el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const er = el.getBoundingClientRect();
  const sr = sc.getBoundingClientRect();
  if (er.top > sr.top + margin && er.bottom < sr.bottom - 60) return; // already visible
  sc.scrollTo({
    top: Math.max(0, sc.scrollTop + er.top - sr.top - margin),
    behavior: 'smooth',
  });
}

/* Bring the explorer section itself into the page viewport (deep links). */
export function scrollPageToExplorer({ immediate = false } = {}) {
  const section = document.getElementById('explorer');
  if (!section) return;
  if (window.__lenis) window.__lenis.scrollTo(section, { offset: -8, immediate, duration: 0.9 });
  else section.scrollIntoView(immediate ? {} : { behavior: 'smooth' });
}
