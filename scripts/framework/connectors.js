/* SVG connector overlay. Edges are authored here (presentation, not survey
   data): endpoints reference rendered component/band elements, geometry is
   recomputed from live rects on resize and routed as orthogonal (90°) elbows
   to mirror the paper's Fig.2. Highlighting follows 'explorer:change' — an edge
   lights up when the active selection hits boxes at BOTH endpoints (ref trace)
   or touches an endpoint (box/comp). */

const NS = 'http://www.w3.org/2000/svg';

/* from/to: element ids (without '#'); a/b: data-comp ids each endpoint covers.
   Fig.2 arrow set: a sequential main arrow between consecutive stages, two
   dashed auxiliary branches (reconstruction (c), observation prediction (e)),
   a left "forward-data" corridor (b → fwd bands of P2 & P3) and a right
   "skip phase 2" corridor (Phase 1 → P3 Phase-1-Forwarded box). */
const EDGES = [
  /* sequential main flow (solid, top→bottom) */
  { from: 'comp-perception', to: 'comp-fusion', kind: 'main',            // (a)→(b)
    a: ['perception'], b: ['fusion'] },
  { from: 'comp-fusion', to: 'comp-policy1', kind: 'main',               // (b)→(d)
    a: ['fusion'], b: ['policy1'] },
  { from: 'comp-policy1', to: 'comp-intermediate', kind: 'main',         // (d)→(f)
    a: ['policy1'], b: ['intermediate'] },
  { from: 'comp-intermediate', to: 'comp-band-p2in-pred', kind: 'main',  // (f)→Phase 1 Predicted Modalities
    a: ['intermediate'], b: ['band.p2in.pred'] },
  { from: 'band-band-p2in', to: 'comp-policy2', kind: 'main',            // bands→(g)
    a: ['band.p2in.fwd', 'band.p2in.pred'], b: ['policy2'] },
  { from: 'comp-policy2', to: 'comp-band-p3in-pred', kind: 'main',       // (g)→Phase 2 Predicted Modalities
    a: ['policy2'], b: ['band.p3in.pred'] },
  { from: 'band-band-p3in', to: 'comp-control', kind: 'main',            // bands→(h)
    a: ['band.p3in.fwd', 'band.p3in.pred', 'band.p3in.p1fwd'], b: ['control'] },

  /* left "forward-data" corridor (solid): (b) → fusion-phase forwarded bands */
  { from: 'comp-fusion', to: 'comp-band-p2in-fwd', kind: 'lrail',        // (b)→P2 Fusion-phase Forwarded
    a: ['fusion'], b: ['band.p2in.fwd'] },
  { from: 'comp-fusion', to: 'comp-band-p3in-fwd', kind: 'lrail',        // (b)→P3 Fusion-phase Forwarded
    a: ['fusion'], b: ['band.p3in.fwd'] },

  /* right "skip phase 2" corridor (solid): Primary Policy REG box → (e) Observation Prediction */
  { from: 'box-policy1-reg', to: 'comp-obsprediction', kind: 'rrail', enterBottom: true, // (d) REG → (e)
    a: ['intermediate', 'policy1'], b: ['obsprediction'] },

  /* auxiliary reconstruction branch (double dashed, OPPOSITE directions): (b)⇅(c) */
  { from: 'comp-fusion', to: 'comp-reconstruction', kind: 'auxv', dx: -4,            // encode ↓
    a: ['fusion'], b: ['reconstruction'] },
  { from: 'comp-fusion', to: 'comp-reconstruction', kind: 'auxv', dx: 4, up: true,   // reconstruct ↑
    a: ['fusion'], b: ['reconstruction'] },
];

const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* Build an orthogonal path through waypoints with rounded 90° corners. */
function orth(pts, r = 7) {
  const p = [];
  for (const q of pts) {
    const last = p[p.length - 1];
    if (!last || Math.abs(last.x - q.x) > 0.5 || Math.abs(last.y - q.y) > 0.5) p.push(q);
  }
  if (p.length < 2) return '';
  const f = (n) => n.toFixed(1);
  let d = `M ${f(p[0].x)} ${f(p[0].y)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1], cur = p[i], nxt = p[i + 1];
    const d1 = { x: sign(cur.x - prev.x), y: sign(cur.y - prev.y) };
    const d2 = { x: sign(nxt.x - cur.x), y: sign(nxt.y - cur.y) };
    const r1 = Math.min(r, Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2);
    const r2 = Math.min(r, Math.hypot(nxt.x - cur.x, nxt.y - cur.y) / 2);
    const bx = cur.x - d1.x * r1, by = cur.y - d1.y * r1;
    const ax = cur.x + d2.x * r2, ay = cur.y + d2.y * r2;
    d += ` L ${f(bx)} ${f(by)} Q ${f(cur.x)} ${f(cur.y)} ${f(ax)} ${f(ay)}`;
  }
  const last = p[p.length - 1];
  d += ` L ${f(last.x)} ${f(last.y)}`;
  return d;
}

export function initConnectors(data, stateApi) {
  const root = document.getElementById('framework-root');
  const svg = root?.querySelector('.fw-wires');
  if (!root || !svg) return;

  // theme-driven colors from tokens.css (figure keeps the paper's blue)
  const css = getComputedStyle(root);
  const C_EDGE = (css.getPropertyValue('--border-strong') || '#B9C2CD').trim();
  const C_HIT = (css.getPropertyValue('--accent') || '#0070C0').trim();
  const C_LABEL = (css.getPropertyValue('--text-muted') || '#6B7686').trim();
  const C_PILL = (css.getPropertyValue('--bg-elev') || '#FFFFFF').trim();

  svg.innerHTML = `
    <defs>
      <marker id="fw-arrow" viewBox="0 0 6 6" refX="5.4" refY="3"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0.5 L6 3 L0 5.5 Z" fill="${C_EDGE}"/>
      </marker>
      <marker id="fw-arrow-hit" viewBox="0 0 6 6" refX="5.4" refY="3"
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

  function pathFor(edge, base) {
    const a = rectOf(edge.from);
    const b = rectOf(edge.to);
    if (!a || !b) return null;

    if (edge.kind === 'lrail') {
      // left corridor: out the source's left edge, down the rail, into target's left edge
      const railX = 17;
      return { d: orth([
        { x: a.x, y: a.cy }, { x: railX, y: a.cy },
        { x: railX, y: b.cy }, { x: b.x - 6, y: b.cy },
      ]) };
    }

    if (edge.kind === 'rrail') {
      // right corridor: out the source's right edge, down the rail, into the target.
      const railX = base.width - 30;
      if (edge.enterBottom) {
        // loop down the rail and back up into the target's bottom edge
        const yr = b.y + b.h + 14;
        const xt = clamp(b.cx, b.x + 16, b.x + b.w - 16);
        return { d: orth([
          { x: a.x + a.w, y: a.cy }, { x: railX, y: a.cy },
          { x: railX, y: yr }, { x: xt, y: yr }, { x: xt, y: b.y + b.h },
        ]) };
      }
      return { d: orth([
        { x: a.x + a.w, y: a.cy }, { x: railX, y: a.cy },
        { x: railX, y: b.cy }, { x: b.x + b.w + 6, y: b.cy },
      ]) };
    }

    if (edge.kind === 'auxv') {
      // short vertical dashed hop (reconstruction (c)); dx offsets the parallel
      // pair, up reverses the arrow so the two read as opposite directions
      const x = (clamp(b.cx, a.x + 20, a.x + a.w - 20) + (edge.dx || 0)).toFixed(1);
      const top = (a.y + a.h + 1).toFixed(1);
      const bot = (b.y - 6).toFixed(1);
      return edge.up
        ? { d: `M ${x} ${bot} L ${x} ${top}` }   // arrow at the top → points up into (b)
        : { d: `M ${x} ${top} L ${x} ${bot}` };  // arrow at the bottom → points down into (c)
    }

    if (edge.kind === 'auxin') {
      // dashed branch that loops up into a docked side panel from below ((e))
      const yr = Math.max(a.y + a.h, b.y + b.h) + 14;
      const xt = clamp(b.cx, b.x + 14, b.x + b.w - 14);
      return { d: orth([
        { x: a.cx, y: a.y + a.h }, { x: a.cx, y: yr },
        { x: xt, y: yr }, { x: xt, y: b.y + b.h },
      ]) };
    }

    // main: vertical drop; if the centers are offset, an orthogonal Z-elbow.
    const x0 = clamp(b.cx, a.x + 24, a.x + a.w - 24);
    const y0 = a.y + a.h + 1, y1 = b.y - 7;
    if (Math.abs(x0 - b.cx) < 2) {
      return { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x0.toFixed(1)} ${y1.toFixed(1)}` };
    }
    const my = (y0 + y1) / 2;
    return { d: orth([
      { x: x0, y: y0 }, { x: x0, y: my }, { x: b.cx, y: my }, { x: b.cx, y: y1 },
    ]) };
  }

  function staticPath(d) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.classList.add('is-ambient');
    p.setAttribute('marker-end', 'url(#fw-arrow)');
    layer.appendChild(p);
    return p;
  }

  function pill(cx, cy, text) {
    const fs = 9.5, h = 21, padX = 10;
    const w = text.length * fs * 0.6 + padX * 2;
    const g = document.createElementNS(NS, 'g');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', (cx - w / 2).toFixed(1));
    rect.setAttribute('y', (cy - h / 2).toFixed(1));
    rect.setAttribute('width', w.toFixed(1));
    rect.setAttribute('height', h);
    rect.setAttribute('rx', (h / 2).toFixed(1));
    rect.setAttribute('fill', C_PILL);
    rect.setAttribute('stroke', C_EDGE);
    rect.setAttribute('stroke-width', '1');
    const t = document.createElementNS(NS, 'text');
    t.textContent = text;
    t.setAttribute('x', cx.toFixed(1));
    t.setAttribute('y', (cy + 0.5).toFixed(1));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('fill', C_LABEL);
    t.setAttribute('font-size', fs);
    t.setAttribute('font-family', "'JetBrains Mono', monospace");
    g.append(rect, t);
    layer.appendChild(g);
    return { x: cx - w / 2, w, h, cx, cy };
  }

  /* Fig.2 framing: external inputs into (a) and the control→estimation feedback. */
  function drawFraming(base) {
    const a = rectOf('comp-perception');
    const obs = rectOf('comp-obsprediction');
    if (!a) return;
    const topY = 17;
    const measCx = a.x + a.w * 0.40;
    const estCx = a.x + a.w * 0.61;
    pill(measCx, topY, 'Measurements');
    const est = pill(estCx, topY, 'Estimation');
    for (const cx of [measCx, estCx]) {
      staticPath(`M ${cx.toFixed(1)} ${(topY + 11).toFixed(1)} L ${cx.toFixed(1)} ${(a.y - 6).toFixed(1)}`);
    }
    // feedback: observation-prediction (e) output up the outer-right rail to Estimation
    if (obs) {
      const railX = base.width - 13;
      staticPath(orth([
        { x: obs.x + obs.w, y: obs.cy },
        { x: railX, y: obs.cy },
        { x: railX, y: topY },
        { x: est.x + est.w + 6, y: topY },
      ]));
    }
  }

  function build() {
    edgeEls.length = 0;
    layer.innerHTML = '';

    const base = root.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);

    drawFraming(base);

    for (const edge of EDGES) {
      const geo = pathFor(edge, base);
      if (!geo) continue;

      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', geo.d);
      p.classList.add('is-ambient');
      if (edge.kind === 'auxv' || edge.kind === 'auxin') p.setAttribute('stroke-dasharray', '3 5');
      p.setAttribute('marker-end', 'url(#fw-arrow)');
      layer.appendChild(p);

      edgeEls.push({ edge, p });
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
