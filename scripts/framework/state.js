/* Interaction state machine.
   state = { pinned, hover } where each is {type:'ref'|'box'|'comp', id} | null.
   Effective selection = hover ?? pinned (hover previews on top of a pin).
   Applies is-hit / is-dim / is-pinned via diff-free full passes (≈260 nodes,
   measured trivial) and broadcasts 'explorer:change' for wires + strip. */

import { domId } from './render.js';

export function initState(data, sidebar) {
  const root = document.getElementById('framework-root');
  const list = document.getElementById('paper-list');
  if (!root || !list || !sidebar) return null;

  const boxEls = new Map();
  root.querySelectorAll('.fw-box').forEach((el) => boxEls.set(el.dataset.box, el));
  const compEls = new Map();
  root.querySelectorAll('[data-comp]').forEach((el) => compEls.set(el.dataset.comp, el));

  const state = { pinned: null, hover: null };
  let hoverScrollTimer = 0;

  /* ---- selection resolution ---------------------------------------- */
  function resolve(sel) {
    const refs = new Set();
    const boxes = new Set();
    if (!sel) return { refs, boxes };

    if (sel.type === 'ref') {
      refs.add(sel.id);
      (data.refToBoxes.get(sel.id) || []).forEach((b) => boxes.add(b));
    } else if (sel.type === 'box') {
      const box = data.boxById.get(sel.id);
      if (box) {
        boxes.add(box.id);
        (box.refs || []).forEach((r) => refs.add(r));
      }
    } else if (sel.type === 'comp') {
      (data.compRefs.get(sel.id) || new Set()).forEach((r) => refs.add(r));
      for (const box of data.boxesFlat) if (box.compId === sel.id) boxes.add(box.id);
    }
    return { refs, boxes };
  }

  function sameSel(a, b) {
    return (!a && !b) || (a && b && a.type === b.type && a.id === b.id);
  }

  /* ---- status line -------------------------------------------------- */
  function describe(sel, refs, boxes) {
    if (!sel) return null;
    if (sel.type === 'ref') {
      const n = boxes.size;
      if (!n) return `<span class="hl">[${sel.id}]</span> background reference — not in the diagram`;
      return `<span class="hl">[${sel.id}]</span> traced through ${n} module${n === 1 ? '' : 's'}`;
    }
    if (sel.type === 'box') {
      const box = data.boxById.get(sel.id);
      const label = box ? box.abbrev : sel.id;
      return `<span class="hl">${label}</span> — ${refs.size} paper${refs.size === 1 ? '' : 's'}${box && box.derived ? ' · via fusion' : ''}`;
    }
    const comp = data.compById.get(sel.id);
    return `<span class="hl">${comp ? comp.title : sel.id}</span> — ${refs.size} papers`;
  }

  /* ---- apply -------------------------------------------------------- */
  function apply() {
    const effective = state.hover || state.pinned;
    const { refs, boxes } = resolve(effective);
    const active = !!effective;

    for (const [id, el] of boxEls) {
      const hit = boxes.has(id);
      el.classList.toggle('is-hit', active && hit);
      el.classList.toggle('is-dim', active && !hit);
      const pinnedHere = state.pinned && state.pinned.type === 'box' && state.pinned.id === id;
      el.classList.toggle('is-pinned', !!pinnedHere);
      el.setAttribute('aria-pressed', pinnedHere ? 'true' : 'false');
    }

    for (const [id, el] of compEls) {
      let anyHit = false;
      if (active) {
        for (const box of data.boxesFlat) {
          if (box.compId === id && boxes.has(box.id)) { anyHit = true; break; }
        }
      }
      el.classList.toggle('is-hit', active && anyHit);
      el.classList.toggle('is-dim', active && !anyHit);
    }

    for (const [ref, el] of sidebar.rows) {
      const hit = refs.has(ref);
      el.classList.toggle('is-hit', active && hit);
      el.classList.toggle('is-dim', active && !hit);
      el.classList.toggle('is-pinned',
        !!(state.pinned && state.pinned.type === 'ref' && state.pinned.id === ref));
    }

    const desc = describe(effective, refs, boxes);
    if (desc) sidebar.setStatus(desc);
    else if (!document.getElementById('paper-search')?.value) sidebar.defaultStatus();
    else sidebar.filter(document.getElementById('paper-search').value);

    document.dispatchEvent(new CustomEvent('explorer:change', {
      detail: { effective, refs, boxes, pinned: state.pinned, hover: state.hover },
    }));
  }

  /* ---- scrolling helpers -------------------------------------------- */
  function scrollPageTo(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const navSafe = 120;
    if (r.top > navSafe && r.bottom < window.innerHeight - 60) return; // already visible
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -160, duration: 0.9 });
    else el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function firstHitBoxEl(boxes) {
    for (const box of data.boxesFlat) {
      if (boxes.has(box.id)) return boxEls.get(box.id);
    }
    return null;
  }

  /* ---- mutations ----------------------------------------------------- */
  function setHover(sel) {
    if (sameSel(state.hover, sel)) return;
    state.hover = sel;
    apply();

    clearTimeout(hoverScrollTimer);
    if (sel && (sel.type === 'box' || sel.type === 'comp')) {
      const { refs } = resolve(sel);
      const first = Math.min(...refs);
      if (refs.size) {
        hoverScrollTimer = setTimeout(() => sidebar.scrollToRef(first), 160);
      }
    }
  }

  function syncHash() {
    const sel = state.pinned;
    const hash = !sel ? ''
      : sel.type === 'ref' ? `#ref-${sel.id}`
      : sel.type === 'box' ? `#box-${domId(sel.id)}`
      : `#comp-${domId(sel.id)}`;
    history.replaceState(null, '', hash || location.pathname + location.search);
  }

  function setPinned(sel, { scroll = true } = {}) {
    state.pinned = sel;
    state.hover = null;
    apply();
    syncHash();
    if (sel && scroll) {
      const { refs, boxes } = resolve(sel);
      if (sel.type === 'ref') {
        scrollPageTo(firstHitBoxEl(boxes));
        sidebar.scrollToRef(sel.id);
      } else if (refs.size) {
        sidebar.scrollToRef(Math.min(...refs));
      }
    }
  }

  function togglePin(sel) {
    setPinned(sameSel(state.pinned, sel) ? null : sel);
  }

  /* ---- event wiring --------------------------------------------------- */
  // diagram: hover + click (delegated)
  root.addEventListener('mouseover', (e) => {
    const boxEl = e.target.closest('.fw-box');
    if (boxEl) return setHover({ type: 'box', id: boxEl.dataset.box });
    const headEl = e.target.closest('[data-comp-head]');
    if (headEl) return setHover({ type: 'comp', id: headEl.dataset.compHead });
  });
  root.addEventListener('mouseleave', () => setHover(null));
  root.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || !root.contains(e.relatedTarget)) setHover(null);
    else if (!e.relatedTarget.closest('.fw-box, [data-comp-head]')) setHover(null);
  });

  root.addEventListener('click', (e) => {
    const boxEl = e.target.closest('.fw-box');
    if (boxEl) return togglePin({ type: 'box', id: boxEl.dataset.box });
    const headEl = e.target.closest('[data-comp-head]');
    if (headEl) return togglePin({ type: 'comp', id: headEl.dataset.compHead });
    if (state.pinned) setPinned(null); // click on empty diagram space clears
  });

  // keyboard access on comp heads
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const headEl = e.target.closest('[data-comp-head]');
    if (headEl) { e.preventDefault(); togglePin({ type: 'comp', id: headEl.dataset.compHead }); }
  });
  root.addEventListener('focusin', (e) => {
    const boxEl = e.target.closest('.fw-box');
    if (boxEl) setHover({ type: 'box', id: boxEl.dataset.box });
  });

  // sidebar: hover + click
  list.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.paper');
    if (row) setHover({ type: 'ref', id: Number(row.dataset.ref) });
  });
  list.addEventListener('mouseleave', () => setHover(null));
  list.addEventListener('click', (e) => {
    if (e.target.closest('[data-paper-link]')) return; // external link
    const row = e.target.closest('.paper');
    if (row) togglePin({ type: 'ref', id: Number(row.dataset.ref) });
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.paper');
    if (row) { e.preventDefault(); togglePin({ type: 'ref', id: Number(row.dataset.ref) }); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.pinned) setPinned(null);
  });

  // search interacts with highlight repaint
  document.addEventListener('explorer:searched', () => apply());

  /* ---- deep link ------------------------------------------------------ */
  function pinFromHash() {
    const h = decodeURIComponent(location.hash || '');
    let m;
    if ((m = h.match(/^#ref-(\d+)$/))) {
      const id = Number(m[1]);
      if (data.paperById.has(id)) {
        setPinned({ type: 'ref', id }, { scroll: false });
        setTimeout(() => {
          document.getElementById('explorer')?.scrollIntoView();
          sidebar.scrollToRef(id);
        }, 60);
      }
    } else if ((m = h.match(/^#box-([\w-]+)$/))) {
      const box = data.boxesFlat.find((b) => domId(b.id) === m[1]);
      if (box) {
        setPinned({ type: 'box', id: box.id }, { scroll: false });
        setTimeout(() => boxEls.get(box.id)?.scrollIntoView({ block: 'center' }), 60);
      }
    }
  }
  pinFromHash();

  return {
    get: () => ({ ...state }),
    resolve,
    setPinned,
    togglePin,
    clear: () => setPinned(null),
  };
}
