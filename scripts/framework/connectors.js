/* SVG connector overlay. Edges are authored here (they are presentation,
   not survey data): endpoints reference rendered component/band elements,
   geometry is recomputed from live rects on resize. Highlighting follows
   'explorer:change' — an edge lights up when the active selection has hit
   boxes at BOTH endpoints (ref trace) or touches an endpoint (box/comp). */

const NS = 'http://www.w3.org/2000/svg';

/* from/to: element ids (without '#'); a/b: data-comp ids each endpoint covers.
   Full Fig.2 arrow set: a sequential main arrow between every consecutive stage
   (incl. within-panel), two dashed auxiliary branches (reconstruction, obs.
   prediction), and two curved right-rail skip/forward paths. */
const EDGES = [
  /* sequential main flow (solid, top→bottom) */
  { from: 'comp-perception', to: 'comp-fusion', kind: 'main',          // (a)→(b)
    a: ['perception'], b: ['fusion'] },
  { from: 'comp-fusion', to: 'comp-policy1', kind: 'main',             // (b)→(d)
    a: ['fusion'], b: ['policy1'] },
  { from: 'comp-policy1', to: 'comp-intermediate', kind: 'main',       // (d)→(f)
    a: ['policy1'], b: ['intermediate'] },
  { from: 'comp-intermediate', to: 'band-band-p2in', kind: 'main',     // (f)→phase2 bands
    a: ['intermediate'], b: ['band.p2in.fwd', 'band.p2in.pred'] },
  { from: 'band-band-p2in', to: 'comp-policy2', kind: 'main',          // bands→(g)
    a: ['band.p2in.fwd', 'band.p2in.pred'], b: ['policy2'] },
  { from: 'comp-policy2', to: 'band-band-p3in', kind: 'main',          // (g)→phase3 bands
    a: ['policy2'], b: ['band.p3in.pred'] },
  { from: 'band-band-p3in', to: 'comp-control', kind: 'main',          // bands→(h)
    a: ['band.p3in.fwd', 'band.p3in.pred', 'band.p3in.p1fwd'], b: ['control'] },

  /* auxiliary branches (dashed) */
  { from: 'comp-fusion', to: 'comp-reconstruction', kind: 'auxv',      // (b)⤳(c)
    a: ['fusion'], b: ['reconstruction'] },
  { from: 'comp-intermediate', to: 'comp-obsprediction', kind: 'aux', side: 'right', // (f)⤳(e)
    a: ['intermediate'], b: ['obsprediction'] },

  /* right-rail skip / forward paths (curved, labeled) */
  { from: 'comp-intermediate', to: 'band-band-p3in', kind: 'skip', side: 'right',
    label: 'Phase 1 forwarded', rail: 14,
    a: ['intermediate'], b: ['band.p3in.p1fwd', 'band.p3in.fwd'] },
  { from: 'comp-policy1', to: 'comp-control', kind: 'skip', side: 'right',
    label: 'Skipping phase 2', rail: 34,
    a: ['policy1'], b: ['control'] },
];

export function initConnectors(data, stateApi) {
  const root = document.getElementById('framework-root');
  const svg = root?.querySelector('.fw-wires');
  if (!root || !svg) return;

  // theme-driven colors from tokens.css
  const css = getComputedStyle(document.documentElement);
  const C_EDGE = (css.getPropertyValue('--border-strong') || '#B9C2CD').trim();
  const C_HIT = (css.getPropertyValue('--accent') || '#0070C0').trim();
  const C_LABEL = (css.getPropertyValue('--text-muted') || '#6B7686').trim();

  svg.innerHTML = `
    <defs>
      <marker id="fw-arrow" viewBox="0 0 6 6" refX="6" refY="3"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0.5 L6 3 L0 5.5 Z" fill="${C_EDGE}"/>
      </marker>
      <marker id="fw-arrow-hit" viewBox="0 0 6 6" refX="6" refY="3"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0.5 L6 3 L0 5.5 Z" fill="${C_HIT}"/>
      </marker>
    </defs>`;

  const layer = document.createElementNS(NS, 'g');
  svg.appendChild(layer);

  const edgeEls = [];

  function rectOf(id) {
    const el = document.getElementById(id);
    if (!el || !el.offsetParent) return null;
    const r = el.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    return {
      x: r.left - base.left, y: r.top - base.top,
      w: r.width, h: r.height,
      cx: r.left - base.left + r.width / 2,
      cy: r.top - base.top + r.height / 2,
    };
  }

  function pathFor(edge) {
    const a = rectOf(edge.from);
    const b = rectOf(edge.to);
    if (!a || !b) return null;

    if (edge.kind === 'skip') {
      // route along the right rail
      const base = root.getBoundingClientRect();
      const railX = base.width - (edge.rail || 30);
      const y0 = a.cy;
      const y1 = b.cy;
      return {
        d: `M ${a.x + a.w} ${y0}
            C ${a.x + a.w + 36} ${y0}, ${railX} ${y0 + 24}, ${railX} ${y0 + 60}
            L ${railX} ${y1 - 60}
            C ${railX} ${y1 - 24}, ${b.x + b.w + 36} ${y1}, ${b.x + b.w + 4} ${y1}`,
        labelAt: { x: railX, y: (y0 + y1) / 2 },
      };
    }

    if (edge.kind === 'aux') {
      // horizontal side hop between neighbouring columns
      const leftFirst = a.cx < b.cx;
      const x0 = leftFirst ? a.x + a.w : a.x;
      const x1 = leftFirst ? b.x - 4 : b.x + b.w + 4;
      const dir = leftFirst ? 1 : -1;
      // if vertically distant, drop a curve
      if (Math.abs(a.cy - b.cy) > 60) {
        const y0 = a.cy, y1 = b.cy;
        const mx = (x0 + x1) / 2;
        return { d: `M ${x0} ${y0} C ${mx + 30 * dir} ${y0}, ${mx - 30 * dir} ${y1}, ${x1} ${y1}` };
      }
      return { d: `M ${x0} ${a.cy} L ${x1} ${b.cy}` };
    }

    if (edge.kind === 'auxv') {
      // short vertical dashed hop, dropped at the target's x-center
      const x = Math.min(Math.max(b.cx, a.x + 20), a.x + a.w - 20);
      return { d: `M ${x} ${a.y + a.h + 1} L ${x} ${b.y - 6}` };
    }

    // main: vertical drop at the target's x-center (clamped into the source span).
    // Leave headroom (>= marker height) so the arrowhead reads cleanly in the gap.
    const x = Math.min(Math.max(b.cx, a.x + 24), a.x + a.w - 24);
    const y0 = a.y + a.h + 1, y1 = b.y - 6;
    if (Math.abs(x - b.cx) < 2) {
      return { d: `M ${x} ${y0} L ${x} ${y1}` };
    }
    const my = (y0 + y1) / 2;
    return { d: `M ${x} ${y0} C ${x} ${my}, ${b.cx} ${my}, ${b.cx} ${y1}` };
  }

  function build() {
    // clear previous paths/labels
    edgeEls.length = 0;
    layer.innerHTML = '';

    const base = root.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);

    for (const edge of EDGES) {
      const geo = pathFor(edge);
      if (!geo) continue;

      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', geo.d);
      p.classList.add('is-ambient');
      if (edge.kind === 'aux' || edge.kind === 'auxv') p.setAttribute('stroke-dasharray', '3 5');
      p.setAttribute('marker-end', 'url(#fw-arrow)');
      layer.appendChild(p);

      let labelEl = null;
      if (edge.label && geo.labelAt) {
        labelEl = document.createElementNS(NS, 'text');
        labelEl.textContent = edge.label.toUpperCase();
        labelEl.setAttribute('x', geo.labelAt.x);
        labelEl.setAttribute('y', geo.labelAt.y);
        labelEl.setAttribute('transform', `rotate(90 ${geo.labelAt.x} ${geo.labelAt.y})`);
        labelEl.setAttribute('text-anchor', 'middle');
        labelEl.setAttribute('dy', '-6');
        labelEl.setAttribute('fill', C_LABEL);
        labelEl.setAttribute('font-size', '8');
        labelEl.setAttribute('letter-spacing', '2');
        labelEl.setAttribute('font-family', "'JetBrains Mono', monospace");
        layer.appendChild(labelEl);
      }

      edgeEls.push({ edge, p, labelEl });
    }
  }

  /* highlight sync */
  function compHasHit(compIds, boxes) {
    for (const box of data.boxesFlat) {
      if (boxes.has(box.id) && compIds.includes(box.compId)) return true;
    }
    return false;
  }

  document.addEventListener('explorer:change', (e) => {
    const { effective, boxes } = e.detail;
    for (const { edge, p } of edgeEls) {
      let hit = false;
      if (effective) {
        if (effective.type === 'ref') {
          hit = compHasHit(edge.a, boxes) && compHasHit(edge.b, boxes);
        } else {
          const selComp = effective.type === 'comp'
            ? effective.id
            : data.boxById.get(effective.id)?.compId;
          hit = !!selComp && (edge.a.includes(selComp) || edge.b.includes(selComp));
        }
      }
      p.classList.toggle('is-hit', hit);
      p.classList.toggle('is-ambient', !hit);
      p.setAttribute('marker-end', hit ? 'url(#fw-arrow-hit)' : 'url(#fw-arrow)');
    }
  });

  /* geometry sync */
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(build);
  };
  new ResizeObserver(schedule).observe(root);
  window.addEventListener('resize', schedule);
  if (document.fonts?.ready) document.fonts.ready.then(schedule);
  build();
}
