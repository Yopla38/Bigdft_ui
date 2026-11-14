/* The Study space: linked calculations, their real results, and the capsule
 * that carries them. Everything shown here is computed from OND.study, the
 * result set extracted from the logs of a real BigDFT campaign. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  const S = OND.study, HA = 27.211386245988, NAT = S.system.atoms.length;
  const runs = Object.values(S.runs), relax = S.relax;
  const fx = (v, n) => Number(v).toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
  const RM = [[5, 8], [6, 9], [7, 10]], rname = (r) => 'rmult ' + r[0] + '/' + r[1];
  const grid = (stage, state) => runs.filter((r) => r.stage === stage && r.id.includes('_' + state + '_')).sort((a, b) => a.h - b.h || a.rmult[0] - b.rmult[0]);
  const at = (list, h, r) => list.find((x) => x.h === h && x.rmult[0] === r[0]);
  const G = { S0: grid('00_phase2_grid_pbe', 'S0'), T1: grid('01_t1_scf_rerun', 'T1'), T1first: grid('00_phase2_grid_pbe', 'T1') };
  const prod = { S0: S.runs['02_pbe_s1_wavefunctions/6a_S1_S0_pbe_h0.35_r6-9'], T1: S.runs['02_pbe_s1_wavefunctions/6a_S1_T1_pbe_h0.35_r6-9'] };
  const cg = { S0: relax['05_geopt_constrained/6a_S0_pbe_cgeopt'], T1: relax['05_geopt_constrained/6a_T1_pbe_cgeopt'], S0atT1: S.runs['06_pbe_cg_wavefunctions/6a_cgT1_S0_pbe_h0.35_r6-9'] };
  const free = { S0: relax['04_geopt_free/6a_S0_pbe_geopt'], T1: relax['04_geopt_free/6a_T1_pbe_geopt'] };
  const ET = {
    vertical: (prod.T1.energy - prod.S0.energy) * HA,
    adiabatic: (cg.T1.energy - cg.S0.energy) * HA,
    emission: (cg.T1.energy - cg.S0atT1.energy) * HA,
  };
  const HS = [0.3, 0.35, 0.4, 0.45], hAxis = { label: 'Grid spacing h (bohr)', ticks: HS, fmt: (v) => v.toFixed(2), min: 0.28, max: 0.47 };

  // --- views: each returns a figure spec built from the result set ---------------
  const VIEWS = {
    gridError(state) {
      const list = G[state], ref = at(list, 0.3, RM[2]).energy;
      const err = (r) => (r.energy - ref) * HA * 1000 / NAT, cost = (r) => r.wall * r.cores / 3600;
      const series = (f) => RM.map((rm, i) => ({ name: rname(rm), slot: i, marker: true, pts: HS.map((h) => [h, f(at(list, h, rm))]).filter((q) => q[1] > 0) }));
      const chosen = at(list, 0.35, RM[1]);
      return {
        title: 'Converging the wavelet grid, ' + state,
        caption: 'Total energy of ' + state + ' against the finest grid (h = 0.30 bohr, rmult 7/10), and what each run cost. The grid kept for production, h = 0.35 bohr with rmult 6/9, is within ' + fx(err(chosen), 1) + ' meV per atom for ' + fx(cost(chosen), 1) + ' core-hours. Extending the regions changes little; the spacing decides.',
        panels: [
          { title: 'Error in the total energy', x: hAxis, y: { label: 'meV per atom', log: true }, series: series(err) },
          { title: 'Cost of one run', x: hAxis, y: { label: 'core-hours', min: 0 }, series: series(cost) },
        ],
        table: { head: ['h (bohr)', 'rmult', 'Energy (Ha)', 'Error (meV/atom)', 'SCF iterations', 'Core-hours'], rows: list.map((r) => [r.h.toFixed(2), r.rmult.join('/'), r.energy.toFixed(6), fx(err(r), 2), r.iters, fx(cost(r), 2)]) },
        view: { view: 'series', runs: 'stage:' + list[0].stage + ' state:' + state, x: 'dft.hgrids', group: 'dft.rmult', panels: [{ y: 'energy', relative_to: { hgrids: 0.3, rmult: [7, 10] }, per: 'atom', unit: 'meV', scale: 'log' }, { y: 'walltime × cores', unit: 'core-hours' }] },
      };
    },
    gapGrid() {
      const gap = (h, rm) => (at(G.T1, h, rm).energy - at(G.S0, h, rm).energy) * HA, all = HS.flatMap((h) => RM.map((rm) => gap(h, rm)));
      return {
        title: 'The triplet energy converges a thousand times faster than the total energy',
        caption: 'Vertical ΔSCF triplet energy on the twelve grids. It moves by ' + fx((Math.max(...all) - Math.min(...all)) * 1000, 1) + ' meV in all, while the total energies move by ' + fx((at(G.S0, 0.45, RM[0]).energy - at(G.S0, 0.3, RM[2]).energy) * HA, 1) + ' eV: the grid error cancels between the two states.',
        panels: [{ x: hAxis, y: { label: 'E(T₁) − E(S₀) (eV)', fmt: (v) => v.toFixed(4), tip: (v) => v.toFixed(5) + ' eV', count: 4 }, series: RM.map((rm, i) => ({ name: rname(rm), slot: i, marker: true, pts: HS.map((h) => [h, gap(h, rm)]) })) }],
        table: { head: ['h (bohr)', 'rmult', 'E(S₀) (Ha)', 'E(T₁) (Ha)', 'E_T (eV)'], rows: HS.flatMap((h) => RM.map((rm) => [h.toFixed(2), rm.join('/'), at(G.S0, h, rm).energy.toFixed(6), at(G.T1, h, rm).energy.toFixed(6), gap(h, rm).toFixed(5)])) },
        view: { view: 'series', x: 'dft.hgrids', group: 'dft.rmult', y: { combine: 'a - b', a: 'energy of stage:01_t1_scf_rerun', b: 'energy of stage:00_phase2_grid_pbe state:S0' }, unit: 'eV' },
      };
    },
    scf() {
      const panel = (r, name, slot, extra) => Object.assign({ title: name + ', ' + r.iters + ' iterations', x: { label: 'Iteration', min: 0, fmt: (v) => String(Math.round(v)) }, y: { label: 'Gradient norm', log: true, min: 1e-6, max: 1 }, series: [{ name, slot, pts: r.scf.map((q) => [q[0], q[1]]) }], hlines: [{ y: r.gnrm_cv, label: 'criterion' }] }, extra);
      return {
        title: 'The triplet needs a different self-consistency protocol',
        caption: 'S₀ converges in ' + prod.S0.iters + ' iterations. T₁ needs ' + prod.T1.iters + ' and two restarts of the minimisation: with the default limit of 50 iterations all twelve triplet runs of the grid study stopped unconverged, which BigDFT reports as a warning.',
        panels: [panel(prod.S0, 'S₀', 0), panel(prod.T1, 'T₁', 1, { vlines: [{ x: 200, label: 'restart' }, { x: 400, label: 'restart' }] })],
        table: { head: ['State', 'Iterations', 'Final gradient norm', 'Criterion', 'Wall time (s)', 'Warnings'], rows: ['S0', 'T1'].map((k) => [k, prod[k].iters, prod[k].gnrm.toExponential(2), prod[k].gnrm_cv.toExponential(0), fx(prod[k].wall, 0), prod[k].warnings.length]) },
        view: { view: 'trace', runs: 'stage:02_pbe_s1_wavefunctions', x: 'iteration', y: 'gnrm', scale: 'log', reference: 'dft.gnrm_cv', small_multiples: 'state' },
      };
    },
    dos() {
      const lo = -16, hi = -2, sigma = 0.25, xs = []; for (let e = lo; e <= hi + 1e-9; e += 0.05) xs.push(+e.toFixed(2));
      const dos = (levels) => xs.map((e) => [e, levels.reduce((s, l) => s + Math.exp(-((e - l) ** 2) / (2 * sigma * sigma)), 0) / (sigma * Math.sqrt(2 * Math.PI))]);
      return {
        title: 'Occupied states of S₀ and T₁',
        caption: 'Density of the occupied Kohn-Sham states, broadened by ' + sigma + ' eV. The highest occupied level is at ' + fx(prod.S0.orbitals.up.at(-1), 2) + ' eV for S₀, and at ' + fx(prod.T1.orbitals.up.at(-1), 2) + ' eV (↑) and ' + fx(prod.T1.orbitals.down.at(-1), 2) + ' eV (↓) for T₁. No virtual orbital was computed in these runs, so there is no gap to read here.',
        panels: [{ x: { label: 'Energy (eV)', min: lo, max: hi, fmt: (v) => String(v) }, y: { label: 'States per eV, per spin', min: 0 }, series: [{ name: 'S₀', slot: 0, pts: dos(prod.S0.orbitals.up), area: true }, { name: 'T₁ ↑', slot: 1, pts: dos(prod.T1.orbitals.up) }, { name: 'T₁ ↓', slot: 2, pts: dos(prod.T1.orbitals.down), dash: '5 3' }] }],
        table: { head: ['State', 'Spin', 'Orbitals', 'Highest occupied (eV)', 'Lowest (eV)'], rows: [['S0', 'paired', prod.S0.orbitals.up.length, fx(prod.S0.orbitals.up.at(-1), 3), fx(prod.S0.orbitals.up[0], 3)], ['T1', 'up', prod.T1.orbitals.up.length, fx(prod.T1.orbitals.up.at(-1), 3), fx(prod.T1.orbitals.up[0], 3)], ['T1', 'down', prod.T1.orbitals.down.length, fx(prod.T1.orbitals.down.at(-1), 3), fx(prod.T1.orbitals.down[0], 3)]] },
        view: { view: 'dos', runs: 'stage:02_pbe_s1_wavefunctions', broadening_eV: sigma, window_eV: [lo, hi], split: 'spin' },
      };
    },
    relax(which) {
      const R = which === 'free' ? free : cg, names = { S0: 'S₀', T1: 'T₁' };
      const series = (f, log) => ['S0', 'T1'].map((k, i) => ({ name: names[k], slot: i, pts: R[k].steps.map((s, n) => [n, f(s, R[k])]).filter((q) => !log || q[1] > 0) }));
      return {
        title: which === 'free' ? 'Relaxing every atom lets the peptide drift' : 'Relaxing the chromophore only',
        caption: (which === 'free' ? 'All 77 atoms free. ' : R.S0.frozen + ' of the 77 atoms frozen, 22 free. ') + 'S₀ gains ' + fx((R.S0.steps[0][0] - R.S0.energy) * HA, 2) + ' eV in ' + (R.S0.steps.length - 1) + ' steps, T₁ ' + fx((R.T1.steps[0][0] - R.T1.energy) * HA, 2) + ' eV in ' + (R.T1.steps.length - 1) + '. The maximum force ends at ' + R.S0.fmax.toExponential(1) + ' and ' + R.T1.fmax.toExponential(1) + ' Ha/bohr: the target of ' + R.S0.forcemax.toExponential(0) + ' was not reached.',
        panels: [
          { title: 'Energy gained', x: { label: 'Relaxation step', min: 0, fmt: (v) => String(Math.round(v)) }, y: { label: 'eV below the start' }, series: series((s, r) => (r.steps[0][0] - s[0]) * HA) },
          { title: 'Maximum force', x: { label: 'Relaxation step', min: 0, fmt: (v) => String(Math.round(v)) }, y: { label: 'Ha/bohr', log: true }, series: series((s) => s[1], true), hlines: [{ y: R.S0.forcemax, label: 'target' }] },
        ],
        table: { head: ['State', 'Steps', 'Start (Ha)', 'End (Ha)', 'Final max. force (Ha/bohr)', 'Target reached'], rows: ['S0', 'T1'].map((k) => [k, R[k].steps.length - 1, R[k].steps[0][0].toFixed(6), R[k].energy.toFixed(6), R[k].fmax.toExponential(2), R[k].done ? 'yes' : 'no']) },
        view: { view: 'trajectory', runs: 'stage:' + R.S0.stage, x: 'step', panels: [{ y: 'energy', relative_to: 'first', unit: 'eV' }, { y: 'fmax', scale: 'log', reference: 'geopt.forcemax' }] },
      };
    },
    et(kind) {
      const t = S.target, rows = kind === 'vertical'
        ? [{ label: 'PBE, vertical at the S1 geometry', value: ET.vertical, text: fx(ET.vertical, 3) + ' eV' }, { label: 'PBE0, vertical at the S1 geometry', value: null, note: 'queued (stage 03)' }]
        : [{ label: 'PBE, vertical at the S1 geometry', value: ET.vertical, text: fx(ET.vertical, 3) + ' eV' }, { label: 'PBE, adiabatic, chromophore relaxed', value: ET.adiabatic, text: fx(ET.adiabatic, 3) + ' eV' }, { label: 'PBE, emission at the relaxed T₁', value: ET.emission, text: fx(ET.emission, 3) + ' eV' }, { label: 'PBE0, adiabatic: the criterion', value: null, note: 'queued (stage 07)' }];
      return {
        kind: 'interval',
        title: 'PBE underestimates the triplet energy; the PBE0 answer is still to come',
        caption: 'ΔSCF triplet energies against the experimental value, ' + t.eV + ' eV, and the ±' + t.window + ' eV window fixed before the calculations. The PBE adiabatic value lies ' + fx(t.eV - ET.adiabatic, 2) + ' eV below. The criterion is on the PBE0 value, whose runs were queued when the capsule was made.',
        x: { label: 'Triplet energy (eV)', unit: 'eV', min: 2.1, max: 3.05, fmt: (v) => v.toFixed(1) },
        band: { x0: t.eV - t.window, x1: t.eV + t.window, mid: t.eV, label: 'experiment ' + t.eV + ' eV ± ' + t.window },
        rows,
        table: { head: ['Estimate', 'E_T (eV)', 'E_T (kJ/mol)', 'Against experiment (eV)'], rows: rows.map((r) => [r.label, r.value == null ? 'pending' : r.value.toFixed(4), r.value == null ? '' : fx(r.value * 96.48533, 1), r.value == null ? '' : fx(r.value - t.eV, 3)]) },
        view: { view: 'compare', quantity: 'E(T1) - E(S0)', estimates: rows.map((r) => r.label), reference: { value: t.eV, window: t.window, unit: 'eV', source: 'experiment' } },
      };
    },
  };

  // --- the board: blueprints linked into a study ------------------------------------
  const stage = (id) => S.stages.find((x) => x.id === id);
  const NODES = [
    { id: 'geom', col: 0, row: 1, type: 'structure', title: 'Starting geometry', sub: '6a at S1 · 77 atoms', state: 'done', pill: 'from xTB + NMR' },
    { id: 'grid0', col: 1, row: 0, type: 'series', stage: '00_phase2_grid_pbe', title: 'Grid study, S₀', sub: '4 spacings × 3 extents', views: [['gridError', 'S0']] },
    { id: 'grid1', col: 1, row: 2, type: 'series', stage: '01_t1_scf_rerun', title: 'Grid study, T₁', sub: 're-run after 12 unconverged', views: [['gridError', 'T1']], extra: [['gapGrid']] },
    { id: 'prod', col: 2, row: 1, type: 'run', stage: '02_pbe_s1_wavefunctions', title: 'PBE, S1 geometry', sub: 'S₀ and T₁ · h 0.35 · 6/9', views: [['scf'], ['dos']], open: true },
    { id: 'pbe0v', col: 3, row: 0, type: 'run', stage: '03_pbe0_s1_vertical', title: 'PBE0, S1 geometry', sub: 'S₀ and T₁' },
    { id: 'relc', col: 3, row: 1, type: 'relax', stage: '05_geopt_constrained', title: 'Relaxation, chromophore', sub: '22 atoms free, 55 frozen', views: [['relax', 'constrained']] },
    { id: 'relf', col: 3, row: 2, type: 'relax', stage: '04_geopt_free', title: 'Relaxation, all atoms', sub: 'path set aside by the researcher', views: [['relax', 'free']], aside: true },
    { id: 'etv', col: 4, row: 0, type: 'formula', title: 'Vertical triplet energy', tex: 'E_T^{\\mathrm{vert}}=E(T_1)-E(S_0)', value: fx(ET.vertical, 3) + ' eV with PBE', views: [['et', 'vertical']] },
    { id: 'cg', col: 4, row: 1, type: 'run', stage: '06_pbe_cg_wavefunctions', title: 'PBE, relaxed geometries', sub: 'four single points' },
    { id: 'pbe0cg', col: 5, row: 0, type: 'run', stage: '07_pbe0_cg', title: 'PBE0, relaxed geometries', sub: 'four single points' },
    { id: 'eta', col: 5, row: 1, type: 'formula', title: 'Adiabatic triplet energy', tex: 'E_T^{\\mathrm{adia}}=E(T_1@T_1)-E(S_0@S_0)', value: fx(ET.adiabatic, 3) + ' eV with PBE', views: [['et', 'adiabatic']] },
  ];
  const EDGES = [
    ['geom', 'grid0', 'geometry'], ['geom', 'grid1', 'geometry'], ['grid0', 'prod', 'choice'], ['grid1', 'prod', 'choice'],
    ['prod', 'pbe0v', 'wavefunctions'], ['prod', 'relc', 'geometry'], ['prod', 'relf', 'geometry'], ['prod', 'etv', 'energies'], ['pbe0v', 'etv', 'energies'],
    ['relc', 'cg', 'geometry'], ['cg', 'pbe0cg', 'wavefunctions'], ['cg', 'eta', 'energies'], ['pbe0cg', 'eta', 'energies'],
  ];
  const LINKS = { geometry: ['Geometry', ''], wavefunctions: ['Wavefunctions', '7 4'], choice: ['Choice of settings', '2 4'], energies: ['Energies into a formula', ''] };
  const ICON = { structure: '<circle cx="6" cy="12" r="3"/><circle cx="14.5" cy="6" r="2.3"/><circle cx="14" cy="15.5" r="1.8"/><path d="M8.6 10.4l3.8-3M8.9 13l3.4 1.7"/>', series: '<path d="M4 15V9M8 15V5M12 15v-4M16 15V7"/>', run: '<path d="M6 4l9 6-9 6z"/>', relax: '<path d="M3 6c3 0 3 8 7 8s4-5 7-5"/><circle cx="10" cy="14" r="1.3"/>', formula: '<path d="M5 6h10M5 10h7M5 14h10"/>' };
  const CW = 186, CH = 98, PX = 222, PY = 130, PAD = 14;

  let ctx = null, selected = 'prod', extraViews = {}, fig = {}, kindFilter = 'correction';

  function status(n) {
    if (n.state) return [n.state, n.pill];
    if (n.type === 'formula') return ['partial', n.value];
    const st = stage(n.stage);
    if (n.aside) return ['aside', 'set aside'];
    if (!st.done) return ['queued', 'queued · ' + st.planned + ' runs'];
    return st.done < st.planned ? ['partial', st.done + ' of ' + st.planned + ' done'] : ['done', st.done + ' of ' + st.planned + ' done'];
  }

  /* An orthogonal path with rounded corners through the given points. */
  function rounded(pts, r) {
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const a = Math.min(r, Math.hypot(x - px, y - py) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
      d += 'L' + (x - Math.sign(x - px) * a) + ' ' + (y - Math.sign(y - py) * a) + 'Q' + x + ' ' + y + ' ' + (x + Math.sign(nx - x) * b) + ' ' + (y + Math.sign(ny - y) * b);
    }
    return d + 'L' + pts[pts.length - 1][0] + ' ' + pts[pts.length - 1][1];
  }

  /* Draws any study: nodes placed on a (col, row) lattice, typed links, one selection.
   * Used for the real study and for the one a user builds. */
  function drawBoard(host, nodes, edges, sel, onSelect, statusOf) {
    const { h } = ctx;
    const pos = (n) => ({ x: PAD + n.col * PX + (n.dx || 0), y: PAD + n.row * PY + (n.dy || 0) });
    const W = PAD * 2 + Math.max(...nodes.map((n) => n.col)) * PX + CW, H = PAD * 2 + Math.max(...nodes.map((n) => n.row)) * PY + CH;
    const svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'edges'); svg.setAttribute('aria-hidden', 'true');
    const head = (id, cls) => '<marker id="' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path class="' + cls + '" d="M0 0L8 4L0 8z"/></marker>';
    svg.innerHTML = '<defs>' + head('arr', 'ah') + head('arr-on', 'ah on') + '</defs>';
    const paths = edges.map(([a, b, type]) => { const p = document.createElementNS(svgNS, 'path'); p.setAttribute('class', 'edge ' + type); if (LINKS[type][1]) p.setAttribute('stroke-dasharray', LINKS[type][1]); p.dataset.a = a; p.dataset.b = b; svg.appendChild(p); return p; });
    const route = () => paths.forEach((p) => {
      const na = nodes.find((n) => n.id === p.dataset.a), nb = nodes.find((n) => n.id === p.dataset.b), A = pos(na), B = pos(nb);
      let d;
      if (Math.abs(A.x - B.x) < CW / 2) d = 'M' + (A.x + CW / 2) + ' ' + (A.y + CH) + 'L' + (B.x + CW / 2) + ' ' + (B.y - 3);            // same column: straight down
      else if (nb.col - na.col > 1 && !na.dx && !nb.dx && !na.dy && !nb.dy) {                                                           // skips a column: go round the blocks
        const yc = Math.min(A.y, B.y) + CH + (PY - CH) / 2, xa = A.x + CW + 16, xb = B.x - 18;
        d = rounded([[A.x + CW, A.y + CH / 2], [xa, A.y + CH / 2], [xa, yc], [xb, yc], [xb, B.y + CH / 2], [B.x - 3, B.y + CH / 2]], 9);
      } else {
        const x0 = A.x + CW, y0 = A.y + CH / 2, x1 = B.x - 3, y1 = B.y + CH / 2, c = Math.max(14, (x1 - x0) * 0.55);
        d = 'M' + x0 + ' ' + y0 + 'C' + (x0 + c) + ' ' + y0 + ' ' + (x1 - c) + ' ' + y1 + ' ' + x1 + ' ' + y1;
      }
      const on = na.id === sel || nb.id === sel;
      p.setAttribute('d', d); p.classList.toggle('on', on); p.setAttribute('marker-end', on ? 'url(#arr-on)' : 'url(#arr)');
    });
    const cards = nodes.map((n) => {
      const [st, label] = statusOf(n), p = pos(n);
      const card = h('button', { class: 'node t-' + n.type + ' s-' + st, type: 'button', 'aria-pressed': String(n.id === sel), style: 'left:' + p.x + 'px;top:' + p.y + 'px' },
        h('b', {}, n.title),
        n.tex ? h('span', { class: 'node-tex' }, '$' + n.tex + '$') : h('span', { class: 'node-sub' }, n.sub),
        h('span', { class: 'node-foot' }, h('span', { class: 'node-pill s-' + st }, label), h('i', { class: 'node-ico', html: '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[n.type] + '</svg>' })));
      let start = null;
      card.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, dx: n.dx || 0, dy: n.dy || 0, moved: false }; card.setPointerCapture(e.pointerId); });
      card.addEventListener('pointermove', (e) => {
        if (!start) return;
        const mx = e.clientX - start.x, my = e.clientY - start.y;
        if (!start.moved && Math.hypot(mx, my) < 5) return;
        start.moved = true; n.dx = start.dx + mx; n.dy = start.dy + my;
        const q = pos(n); card.style.left = q.x + 'px'; card.style.top = q.y + 'px'; route();
      });
      card.addEventListener('pointerup', () => { const moved = start && start.moved; start = null; if (!moved) onSelect(n.id); });
      card.addEventListener('pointercancel', () => { start = null; });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } });
      return card;
    });
    const canvas = h('div', { class: 'board-canvas', style: 'width:' + W + 'px;height:' + H + 'px' }, svg, cards);
    const keep = host.scrollLeft;
    host.replaceChildren(canvas);
    host.scrollLeft = keep;
    route();
    ctx.typeset(canvas);
  }

  const renderBoard = () => drawBoard(ctx.$('#study-board'), NODES, EDGES, selected, select, status);

  function select(id) { selected = id; renderBoard(); renderResults(); }

  // --- results: figure cards --------------------------------------------------------
  function figureCard(key, spec, tag) {
    const { h } = ctx, st = fig[key] || (fig[key] = { preset: 'screen', data: false });
    const target = h('div', { class: 'figure' });
    const draw = () => OND.figure.render(target, spec, { preset: st.preset, panelHeight: spec.panels && spec.panels.length === 1 ? 230 : 200 });
    const seg = h('div', { class: 'seg' }, [['screen', 'Screen'], ['col1', 'Journal, 1 column'], ['col2', 'Journal, 2 columns']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(st.preset === v), onclick: () => { st.preset = v; renderResults(); } }, l)));
    const copy = h('button', { class: 'btn small', type: 'button', onclick: (e) => {
      const text = OND.figure.svgText(spec, { preset: st.preset === 'screen' ? 'col1' : st.preset });
      const done = (msg) => { e.target.textContent = msg; setTimeout(() => { e.target.textContent = 'Copy SVG'; }, 1800); };
      try { navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Copy refused by the browser')); } catch (err) { done('Copy refused by the browser'); }
    } }, 'Copy SVG');
    const card = h('article', { class: 'figcard' },
      h('header', {}, h('div', {}, tag ? h('span', { class: 'pill' }, tag) : null, h('h3', {}, spec.title)),
        h('div', { class: 'figtools' }, seg, h('button', { class: 'btn small', type: 'button', 'aria-pressed': String(st.data), onclick: () => { st.data = !st.data; renderResults(); } }, st.data ? 'Hide data' : 'Data'), copy)),
      target,
      h('p', { class: 'caption' }, spec.caption),
      st.preset !== 'screen' ? h('p', { class: 'figmeta' }, 'Drawn at ' + OND.figure.PRESETS[st.preset].mm + ' mm with 7 pt type, the size it will have in print. “Copy SVG” gives this exact drawing; PDF and 600 dpi PNG are made from it.') : null,
      st.data ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, spec.table.head.map((c) => h('th', {}, c)))), h('tbody', {}, spec.table.rows.map((r) => h('tr', {}, r.map((c) => h('td', { class: 'num' }, String(c)))))))) : null,
      h('details', {}, h('summary', {}, 'How this view is defined'), h('p', { class: 'figmeta' }, 'A view is a description, not a program: which runs, which quantity, how to draw it. The workshop reads the typed results and draws.'), h('pre', {}, JSON.stringify(spec.view, null, 1))));
    setTimeout(draw, 0);
    return card;
  }

  function facts(n) {
    const { h } = ctx, dl = h('dl', { class: 'kv facts' }), row = (k, v) => dl.append(h('dt', {}, k), h('dd', { class: 'num' }, v));
    if (n.id === 'prod') {
      for (const k of ['S0', 'T1']) row('Energy, ' + k, prod[k].energy.toFixed(6) + ' Ha');
      row('Degrees of freedom', fx(prod.S0.dof, 0) + '  (N_c ' + fx(prod.S0.nc, 0) + ' + 7 × ' + fx(prod.S0.nf, 0) + ')');
      row('Memory peak per MPI task, S0 / T1', fx(prod.S0.mem, 0) + ' / ' + fx(prod.T1.mem, 0) + ' MB'); row('Dipole moment, S0 / T1', fx(prod.S0.dipole, 2) + ' / ' + fx(prod.T1.dipole, 2) + ' D');
      row('Wall time, S0 / T1', fx(prod.S0.wall, 0) + ' s / ' + fx(prod.T1.wall / 60, 0) + ' min on ' + prod.S0.cores + ' cores');
      row('Code', 'BigDFT ' + prod.S0.version + ', ' + S.source.machine);
    } else if (n.type === 'series') {
      const first = G.T1first;
      row('Runs', stage(n.stage).done + ', all converged');
      if (n.id === 'grid1') row('First attempt', first.length + ' runs stopped at ' + first[0].iters + ' iterations, gradient ' + Math.min(...first.map((r) => r.gnrm)).toExponential(1) + ' to ' + Math.max(...first.map((r) => r.gnrm)).toExponential(1));
      row('Grid kept', 'h 0.35 bohr, rmult 6/9');
    } else if (n.type === 'relax') { const R = n.id === 'relf' ? free : cg; row('Optimiser', R.S0.method + ', target ' + R.S0.forcemax.toExponential(0) + ' Ha/bohr'); row('Steps, S0 / T1', (R.S0.steps.length - 1) + ' / ' + (R.T1.steps.length - 1)); }
    else if (n.stage) { const st = stage(n.stage); row('Runs', st.done + ' of ' + st.planned + (st.done ? ' done' : ', queued when the capsule was made')); }
    else if (n.id === 'geom') { row('Formula', 'C₃₁H₃₄N₄O₇S'); row('Electrons', S.system.electrons + ' valence'); row('Box', S.system.box.map((x) => fx(x, 1)).join(' × ') + ' Å'); }
    return dl.children.length ? dl : null;
  }

  function renderResults() {
    const { h } = ctx, n = NODES.find((x) => x.id === selected), host = ctx.$('#study-results');
    const kids = [h('header', {}, h('h2', {}, n.title), n.open ? h('button', { class: 'btn small', type: 'button', onclick: () => ctx.openInWorkshop() }, 'Open in the workshop') : null)];
    const f = facts(n); if (f) kids.push(f);
    const warn = n.id === 'prod' ? prod.T1.warnings : [];
    if (warn.length) kids.push(h('div', { class: 'notice' }, h('b', {}, 'BigDFT warnings in the T₁ run, kept with the result'), h('span', {}, [...new Set(warn)].join(' · ')), h('span', { style: 'color:var(--fg-3)' }, 'The run finished converged after the restarts. A converged run that warned is shown as such, never as a plain success.')));
    const views = (n.views || []).map((v) => [v.join(':'), VIEWS[v[0]](v[1]), null]).concat((extraViews[n.id] || []).map((v) => [v.join(':'), VIEWS[v[0]](v[1]), 'built on request']));
    if (views.length) kids.push(h('div', { class: 'figs' }, views.map(([k, spec, tag]) => figureCard(n.id + ':' + k, spec, tag))));
    else kids.push(h('p', { style: 'color:var(--fg-2)' }, n.stage && !stage(n.stage).done ? 'These runs were queued when the capsule was made. Their figures appear here when the logs arrive: the views are attached to the kind of calculation, not written for each run.' : n.id === 'cg' ? 'Two of the four single points are in the capsule; their energies enter the adiabatic triplet energy.' : 'The geometry every calculation of this study starts from.'));
    kids.push(newView(n));
    host.replaceChildren(...kids);
  }

  /* When the view you need does not exist: three steps, from no code to code. */
  function newView(n) {
    const { h } = ctx, offer = n.extra && !(extraViews[n.id] || []).length;
    const cell = 'def analyse(runs):\n    """Read-only access to the logs of the selected runs."""\n    s0 = {(r.hgrid, r.rmult): r.energy for r in runs.stage("00_phase2_grid_pbe").state("S0")}\n    t1 = {(r.hgrid, r.rmult): r.energy for r in runs.stage("01_t1_scf_rerun")}\n    return table(\n        columns=["hgrid", "rmult", "gap_eV"],\n        rows=[(h, r, (t1[h, r] - s0[h, r]) * HARTREE_EV) for (h, r) in s0],\n    )';
    return h('section', { class: 'newview' }, h('h3', {}, 'Need another view?'),
      h('div', { class: 'rungs' },
        h('div', { class: 'rung' }, h('p', { class: 'label' }, '1 · From the catalogue'), h('p', {}, 'Views are attached to kinds of results: a series, a trace, a trajectory, a spectrum, a comparison. Change the unit, the scale or the grouping in the view definition; no code is involved.')),
        h('div', { class: 'rung' }, h('p', { class: 'label' }, '2 · Describe it'), h('p', {}, 'Say what you want to see. The agent answers with a view definition you approve, as for any change to a blueprint. It writes code only if the data are not there yet.'),
          offer ? h('div', { class: 'prop' }, h('span', {}, '“Show how the triplet energy itself depends on the grid.”'), h('div', { class: 'diff' }, h('div', {}, h('span', {}, 'new view  '), h('b', {}, 'series of E(T₁) − E(S₀) over h, grouped by rmult')), h('div', {}, h('span', {}, 'data      '), h('b', {}, 'already extracted: no code needed'))),
            h('div', {}, h('button', { class: 'btn cta small', type: 'button', onclick: () => { extraViews[n.id] = n.extra; renderResults(); ctx.$('#study-results .figcard:last-of-type').scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 'Approve'))) : n.extra ? h('p', { style: 'color:var(--ok)' }, 'Added above, marked “built on request”.') : h('p', { style: 'color:var(--fg-3)' }, 'Example available on the node “Grid study, T₁”.')),
        h('div', { class: 'rung' }, h('p', { class: 'label' }, '3 · Write an analysis cell'), h('p', {}, 'For what no view covers. Python, run in the pack’s container beside the calculation: read-only on the run’s files, no network, time and memory limits. It must return a table; the workshop draws it. The cell is saved with the study and travels in the capsule.'),
          h('details', {}, h('summary', {}, 'What a cell looks like'), h('pre', {}, cell), h('p', { class: 'figmeta' }, 'Not executed in this mock-up.')))));
  }

  // --- the capsule that carries the study --------------------------------------------
  function renderCapsule() {
    const { h } = ctx, c = S.capsule, host = ctx.$('#study-capsule');
    const kinds = Object.entries(c.kinds).sort((a, b) => b[1] - a[1]);
    const list = c.records.filter((r) => r.kind === kindFilter);
    host.replaceChildren(
      h('p', { class: 'cap-goal' }, c.goal),
      h('div', { class: 'meta' }, h('span', {}, c.records.length + ' records'), h('span', {}, c.statuses.verified + ' verified'), h('span', {}, (c.statuses.superseded || 0) + ' superseded'), h('span', {}, (c.statuses.unresolved || 0) + ' open questions'), h('span', {}, c.inventory.files + ' files, ' + fx(c.inventory.bytes / 1e6, 1) + ' MB'), h('span', {}, 'approved ' + c.approved), h('span', {}, 'format ' + c.schema)),
      h('p', { class: 'lineage' }, h('code', {}, c.parent.id + '…'), ' → ', h('code', {}, c.id + '…'), '  This capsule extends its parent: ' + c.parent.inherited + ' records inherited, ' + c.parent.new + ' new, ' + c.parent.revised + ' revised. The parent is embedded, so the lineage verifies without it.'),
      h('div', { class: 'chips' }, kinds.map(([k, n]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === kindFilter), onclick: () => { kindFilter = k; renderCapsule(); } }, k.replace('_', ' ') + ' · ' + n))),
      h('div', { class: 'records' }, list.map((r) => h('div', { class: 'record' }, h('div', {}, h('code', {}, r.id), h('span', { class: 'rec ' + r.status }, r.status), r.new ? h('span', { class: 'rec' }, 'new in C2') : null, r.by ? h('span', { class: 'by' }, r.by) : null),
        h('p', {}, r.text + (r.text.length >= 260 ? '…' : '')), r.supersedes.length ? h('p', { class: 'figmeta' }, 'supersedes ' + r.supersedes.join(', ')) : null))),
      h('p', { class: 'figmeta' }, 'Inspecting, importing and verifying a capsule never run its code. Running its tests is a separate, explicit act of trust.'));
  }

  // --- the capsule's own pipeline: the code a relaunch runs --------------------------
  let codeTab = 0;
  function renderPipeline() {
    const { h } = ctx, code = S.capsule.code, cur = code[codeTab];
    ctx.$('#study-code').replaceChildren(
      h('p', {}, 'A capsule carries the code that produced its results. Relaunching the study means running these five steps again, in the pack’s container or on the cluster, not replaying numbers. The figures above are then redrawn from the new logs.'),
      h('ol', { class: 'pipe' }, code.map((c, i) => h('li', {}, h('button', { type: 'button', 'aria-pressed': String(i === codeTab), onclick: () => { codeTab = i; renderPipeline(); } }, h('b', {}, c.step), h('span', {}, c.what), h('code', {}, c.command))))),
      h('div', { class: 'codeview' }, h('div', { class: 'codehead' }, h('code', {}, cur.path), h('span', {}, cur.text.split('\n').length + ' lines, from the capsule, unchanged')), h('pre', {}, cur.text)),
      h('div', { class: 'relaunch' },
        h('div', {}, h('b', {}, 'Relaunch what is missing'), h('span', {}, 'Stages 03 and 07 (PBE0) were queued when the capsule was made: generate, dry run, run, analyse for those ' + S.stages.filter((x) => !x.done).reduce((n, x) => n + x.planned, 0) + ' inputs only. The wavefunctions of stages 02 and 06 are handed over, as the restart script does.')),
        h('div', {}, h('b', {}, 'Relaunch everything'), h('span', {}, 'All ' + S.stages.reduce((n, x) => n + x.planned, 0) + ' inputs, to check that the capsule reproduces. The new energies are compared with the recorded ones; any difference is shown, never overwritten.')),
        h('div', {}, h('b', {}, 'Change something, relaunch what follows'), h('span', {}, 'Open the study as an editable board, change a block, and only the blocks downstream are recomputed.'))),
      h('p', { class: 'figmeta' }, 'Nothing is executed in this mock-up. In the workshop, “Run calculation” on the tetrapeptide shows the log recorded in the capsule; it is a reading, not a new calculation.'));
  }

  OND.studyView = {
    /* Equations cannot be measured in a hidden view: the board is drawn when the space is shown. */
    mount(context) { ctx = context; renderCapsule(); renderPipeline(); if (!ctx.$('#view-study').hidden) { renderBoard(); renderResults(); } },
    refresh() { if (ctx && !ctx.$('#study-real').hidden) { renderBoard(); renderResults(); } },
    drawBoard,
    energies: { ET, prod },
  };
})(window.OND);
