/* Hero background: abstract framework topology — layered nodes wired top-to-bottom,
   slow signal pulses drifting along the edges. Generated once, animated with CSS/SMIL-free
   JS-driven dash offsets kept cheap (single rAF, ~30 paths). */
(function () {
  const svg = document.getElementById('hero-topo');
  if (!svg) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 1600, H = 900;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // theme-driven: read palette from CSS variables so the topology follows tokens.css
  const css = getComputedStyle(document.documentElement);
  const EDGE = (css.getPropertyValue('--border-strong') || '#B9C2CD').trim();
  const PULSE = (css.getPropertyValue('--accent') || '#0070C0').trim();

  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  // Deterministic pseudo-random (seeded) so the hero is stable between loads.
  let seed = 20260611;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  // Layered topology: 5 rows echoing perception → fusion → P1 → P2 → P3
  const rows = [
    { y: 90,  n: 6 },
    { y: 280, n: 9 },
    { y: 470, n: 5 },
    { y: 650, n: 4 },
    { y: 820, n: 5 },
  ];

  const nodes = [];
  rows.forEach((row, ri) => {
    const margin = 140;
    const span = W - margin * 2;
    for (let i = 0; i < row.n; i++) {
      const x = margin + (span / (row.n - 1)) * i + (rand() - 0.5) * 70;
      const y = row.y + (rand() - 0.5) * 46;
      nodes.push({ x, y, row: ri });
    }
  });

  const edgesGroup = mk('g', {});
  const pulseGroup = mk('g', {});
  const nodesGroup = mk('g', {});
  svg.append(edgesGroup, pulseGroup, nodesGroup);

  const pulses = [];
  // wire each node to 1–2 nodes of the next row
  nodes.forEach((a) => {
    const next = nodes.filter((b) => b.row === a.row + 1);
    if (!next.length) return;
    const sorted = next.slice().sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
    const count = rand() > 0.6 ? 2 : 1;
    sorted.slice(0, count).forEach((b) => {
      const midY = (a.y + b.y) / 2;
      const d = `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
      edgesGroup.appendChild(mk('path', {
        d, fill: 'none', stroke: EDGE, 'stroke-width': 1,
      }));
      if (!reduced && rand() > 0.45) {
        const p = mk('path', {
          d, fill: 'none', stroke: PULSE, 'stroke-width': 1.4,
          'stroke-linecap': 'round', opacity: 0.8,
        });
        pulseGroup.appendChild(p);
        const len = p.getTotalLength();
        p.setAttribute('stroke-dasharray', `26 ${len}`);
        pulses.push({ el: p, len: len + 26, off: rand() * len, speed: 28 + rand() * 36 });
      }
    });
  });

  nodes.forEach((n) => {
    nodesGroup.appendChild(mk('circle', {
      cx: n.x, cy: n.y, r: n.row === 2 ? 4 : 3,
      fill: n.row === 2 ? PULSE : EDGE,
      opacity: n.row === 2 ? 0.9 : 1,
    }));
  });

  if (reduced || !pulses.length) return;

  let last = performance.now();
  let running = true;

  function tick(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const p of pulses) {
      p.off = (p.off + p.speed * dt) % p.len;
      p.el.setAttribute('stroke-dashoffset', String(-p.off + 26));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // pause when hero is offscreen
  new IntersectionObserver((entries) => {
    const vis = entries[0].isIntersecting;
    if (vis && !running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
    else if (!vis) running = false;
  }).observe(svg);
})();
