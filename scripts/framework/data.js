/* Data loading + indexing for the framework explorer.
   Reads data/framework.json + data/papers.json (frozen schemas) and builds
   the lookup maps every other module consumes. No DOM here. */

const PANELS = [
  { id: 'fusion', phase: 'PHASE 00', title: 'Multi-modality Fusion & Encoding', note: 'components (a) – (b)' },
  { id: 'phase1', phase: 'PHASE 01', title: 'Primary Action Policy', note: 'components (c) – (f)' },
  { id: 'phase2', phase: 'PHASE 02', title: 'Refinement Policy', note: 'components (e) – (g)' },
  { id: 'phase3', phase: 'PHASE 03', title: 'Robot-end Control', note: 'component (h)' },
];

const PHASE_TAG = { fusion: 'P0', phase1: 'P1', phase2: 'P2', phase3: 'P3' };

/* visual reading order of components/band-groups (top→bottom, left→right) */
const COMP_ORDER = [
  'perception', 'fusion',
  'reconstruction', 'policy1', 'intermediate',
  'band.p2in.fwd', 'band.p2in.pred', 'obsprediction', 'policy2',
  'band.p3in.fwd', 'band.p3in.pred', 'band.p3in.p1fwd', 'control',
];

/* display codes for boxes whose data id is a lowercase slug */
const DISPLAY_ABBREV = {
  vla: 'VLA', dp: 'DP', act: 'ACT', rl: 'RL', reg: 'REG', model: 'MBA',
  impedance: 'IMP', admittance: 'ADM', hybrid: 'HFP', pid: 'PID',
  robotdep: 'R-DEP', others: 'OTH', Other: 'OTH',
};
const displayOf = (abbrev) => DISPLAY_ABBREV[abbrev] || abbrev;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/* Perception boxes carry no refs in the figure; derive them as the union of
   fusion configurations containing that modality letter, so component (a)
   is still meaningfully interactive. */
function derivePerceptionRefs(framework) {
  const perception = framework.components.find((c) => c.id === 'perception');
  const fusion = framework.components.find((c) => c.id === 'fusion');
  if (!perception || !fusion) return;

  for (const box of perception.boxes) {
    if (box.refs && box.refs.length) continue;
    const letter = box.abbrev.toUpperCase();
    if (letter.length !== 1) continue; // skip "Others"
    const union = new Set();
    for (const fb of fusion.boxes) {
      if (/^[A-Z]+$/.test(fb.abbrev) && fb.abbrev.includes(letter)) {
        fb.refs.forEach((r) => union.add(r));
      }
    }
    box.refs = [...union].sort((a, b) => a - b);
    box.derived = true;
  }
}

export async function loadData() {
  const [framework, papersDoc] = await Promise.all([
    fetchJSON('data/framework.json?v=11'),
    fetchJSON('data/papers.json?v=11'),
  ]);

  derivePerceptionRefs(framework);

  const paperById = new Map();
  for (const p of papersDoc.papers) paperById.set(p.id, p);

  // flatten boxes (components + band groups) preserving visual order
  const boxesFlat = [];
  const compById = new Map();

  for (const comp of framework.components) {
    compById.set(comp.id, comp);
    for (const box of comp.boxes) {
      box.display = displayOf(box.abbrev);
      boxesFlat.push({
        ...box,
        compId: comp.id,
        compTitle: comp.title,
        panelId: comp.panel,
        phaseTag: PHASE_TAG[comp.panel] || '',
      });
    }
  }
  for (const band of framework.bands || []) {
    for (const group of band.groups) {
      compById.set(group.id, { ...group, panel: band.panel, band: true });
      for (const box of group.boxes) {
        box.display = displayOf(box.abbrev);
        boxesFlat.push({
          ...box,
          compId: group.id,
          compTitle: group.title,
          panelId: band.panel,
          phaseTag: PHASE_TAG[band.panel] || '',
          inBand: true,
        });
      }
    }
  }

  // sort into visual reading order (pipeline strip + first-hit logic rely on it)
  const orderOf = (compId) => {
    const i = COMP_ORDER.indexOf(compId);
    return i === -1 ? COMP_ORDER.length : i;
  };
  boxesFlat.sort((a, b) => orderOf(a.compId) - orderOf(b.compId));

  const boxById = new Map();
  const refToBoxes = new Map();
  for (const box of boxesFlat) {
    boxById.set(box.id, box);
    for (const r of box.refs || []) {
      if (!paperById.has(r)) {
        console.warn(`framework.json references [${r}] missing from papers.json (box ${box.id})`);
        continue;
      }
      if (!refToBoxes.has(r)) refToBoxes.set(r, []);
      refToBoxes.get(r).push(box.id);
    }
  }

  // refs per component (for header hover = union of its boxes)
  const compRefs = new Map();
  for (const box of boxesFlat) {
    if (!compRefs.has(box.compId)) compRefs.set(box.compId, new Set());
    const set = compRefs.get(box.compId);
    (box.refs || []).forEach((r) => set.add(r));
  }

  return {
    PANELS,
    PHASE_TAG,
    framework,
    papers: papersDoc.papers,
    paperById,
    boxesFlat,
    boxById,
    compById,
    compRefs,
    refToBoxes,
  };
}
