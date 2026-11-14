/* Interface of the prototype: blocks, inspector, stage overlays, dock
 * (source, run, capsule), boards and the optional companion. */
(function (OND) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const val = attrs[k];
      if (val == null || val === false) continue;
      if (k === 'class') el.className = val;
      else if (k === 'html') el.innerHTML = val;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), val);
      else el.setAttribute(k, val === true ? '' : val);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const fr = (x, n) => Number(x).toLocaleString('en-US', { minimumFractionDigits: n || 0, maximumFractionDigits: n == null ? 3 : n });
  const sub = (s) => String(s).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const { EL } = OND.chem;
  const blueprint = OND.Blueprint(), P = blueprint.PARAMS, st = blueprint.st;
  const stage = OND.Stage($('#stage'));
  const SCHEMA = OND.schema.variables;
  const ui = { brick: 'matter', depth: 0, view: { grid: false, density: false, orbital: false, fragment: false, ghosts: true, vdw: false }, sel: null, undo: [], drag: false, ran: false, query: '', notes: [] };

  const icon = (d) => '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const BRICKS = [
    ['matter', 'Matter', 'The atoms, the cell and its boundary conditions.', icon('<circle cx="6" cy="12" r="3"/><circle cx="14.500" cy="6" r="2.300"/><circle cx="14" cy="15.500" r="1.800"/><path d="M8.600 10.400l3.800-3M8.900 13l3.400 1.700"/>')],
    ['theory', 'Theory', 'The level at which electrons are described.', icon('<path d="M10 3v14M4 5c0 5 2 7 6 7s6-2 6-7"/>')],
    ['accuracy', 'Accuracy', 'The wavelet grid and convergence.', icon('<path d="M3 3h14v14H3zM3 10h14M10 3v14M10 6.500h3.500M10 13.500h3.500M13.500 10V3M6.500 10v7" stroke-width="1.200"/>')],
    ['environment', 'Environment', 'What surrounds the system: periodicity, solvent, field.', icon('<path d="M2 7c2-2 4-2 6 0s4 2 6 0 3-1.500 4-1M2 13c2-2 4-2 6 0s4 2 6 0 3-1.500 4-1"/>')],
    ['task', 'Task', 'What the calculation is asked to do.', icon('<path d="M6 4l9 6-9 6z"/>')],
    ['observables', 'Observables', 'What you want to look at in the end.', icon('<path d="M3 17h14M5.500 14V9M10 14V4M14.500 14v-7"/>')],
    ['machine', 'Machine', 'Where the calculation runs, and on what budget.', icon('<rect x="5" y="5" width="10" height="10" rx="1.500"/><path d="M8 2v3M12 2v3M8 15v3M12 15v3M2 8h3M2 12h3M15 8h3M15 12h3"/>')],
  ];
  const SRC = { default: 'BigDFT default', adapted: 'Adapted', you: 'You', agent: 'Agent', paper: 'Paper', guide: 'Guide', run: 'Recorded run' };
  const BC = { free: 'isolated', surface: 'surface (x, z periodic)', periodic: 'periodic' };
  const ACTIONS = [['sp', 'Energy', 'Single point: energy and forces'], ['geopt', 'Relaxation', 'Find the equilibrium geometry'], ['md', 'Dynamics', 'Follow the motion of the atoms'], ['neb', 'Path', 'Barrier between two states'], ['tddft', 'Excitations', 'Absorption spectrum'], ['frag', 'Fragments', 'What binds the parts']];

  function formula() {
    const c = OND.chem.composition(st.sys);
    const keys = Object.keys(c).sort((a, b) => (c.C ? (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)) : c[b] - c[a]));
    return keys.map((k) => k + (c[k] > 1 ? sub(c[k]) : '')).join('');
  }

  // --- system ---------------------------------------------------------------
  function loadSystem(id) {
    const sys = OND.chem.build(id);
    ui.sel = null; ui.undo = []; ui.ran = false;
    ui.view.density = ui.view.orbital = ui.view.fragment = false;
    blueprint.clear();
    blueprint.setSystem(sys);
    stage.setOptions({ colorBy: 'element' });
    stage.setSystem(sys);
    syncStage(true);
    resetRun();
  }
  function editAtoms(fn) {
    ui.undo.push(JSON.stringify(st.sys.atoms));
    fn(st.sys.atoms);
    st.sys.atoms.forEach((at, i) => { at.i = i; });
    ui.sel = null; st.sys.edited = true;
    ui.notes = ui.notes.filter((n) => n.sys !== st.sys.id); // atom indices no longer mean the same atoms
    blueprint.touchSystem();
    stage.setSystem(st.sys, true);
    syncStage(true);
  }
  function undoEdit() {
    if (!ui.undo.length) return;
    st.sys.atoms = JSON.parse(ui.undo.pop());
    st.sys.edited = ui.undo.length > 0; ui.sel = null;
    blueprint.touchSystem(); stage.setSystem(st.sys, true); syncStage(true);
  }

  function syncStage(all) {
    const v = st.v, w = ui.view;
    if (all || syncStage.grid !== [w.grid, v.hgrid, v.crmult, v.frmult].join()) {
      stage.setGrid(w.grid ? { h: v.hgrid, crmult: v.crmult, frmult: v.frmult } : null);
      syncStage.grid = [w.grid, v.hgrid, v.crmult, v.frmult].join();
    }
    const iso = w.orbital ? 'orbital' : w.density ? 'density' : null;
    if (all || syncStage.iso !== iso) { stage.setIso(iso); syncStage.iso = iso; }
    stage.select(ui.sel);
  }

  function themeColors() {
    const css = getComputedStyle(document.documentElement), g = (n) => css.getPropertyValue(n).trim();
    stage.setColors({ coarse: g('--fg-3'), fine: g('--accent'), pos: g('--pos'), neg: g('--neg'), dens: g('--accent'), sel: g('--fg'), cell: g('--fg-3') });
    if (st.sys) syncStage(true);
    if (OND.studyView && !$('#view-study').hidden) OND.studyView.refresh();
  }

  // --- rail -----------------------------------------------------------------
  function summary(id) {
    const v = st.v, sys = st.sys;
    switch (id) {
      case 'matter': return formula() + ' · ' + sys.atoms.length + ' atoms · ' + BC[sys.bc].split(' ')[0];
      case 'theory': return [v.xc, v.nspin === 1 ? 'no spin' : 'spin, ' + v.mpol + ' µB', v.charge ? 'charge ' + (v.charge > 0 ? '+' : '') + v.charge : null, v.dispersion ? 'D3' : null].filter(Boolean).join(' · ');
      case 'accuracy': return 'h ' + fr(v.hgrid, 2) + ' · ' + fr(v.crmult) + '/' + fr(v.frmult) + ' · ' + (v.algo === 'linear' ? 'linear' : 'cubic');
      case 'environment': return [sys.bc !== 'free' ? 'k ' + (sys.bc === 'surface' ? v.kpt + '×1×' + v.kpt : v.kpt + '×' + v.kpt + '×' + v.kpt) : 'vacuum', v.solvent !== 'none' ? { water: 'water', ethanol: 'ethanol', mesitylene: 'mesitylene' }[v.solvent] : null, v.efield ? 'field' : null, v.scf === 'mixing' ? 'mixing' : null].filter(Boolean).join(' · ');
      case 'task': return ACTIONS.find((a) => a[0] === v.action)[1] + (v.action === 'geopt' ? ' ' + v.geoptMethod : v.action === 'md' ? ' ' + v.mdSteps + ' steps' : '');
      case 'observables': return [v.dos && 'DOS', v.density && 'density', v.nplot && v.nplot + ' orbital' + (v.nplot > 1 ? 's' : ''), v.dipole && 'dipole', v.charges && 'charges'].filter(Boolean).join(', ') || 'energy only';
      case 'machine': return blueprint.TARGETS[v.target].label.replace(' container', '') + ' · ' + v.mpi + '×' + v.omp + ' cores';
    }
  }
  const duration = (s) => (s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : fr(s / 3600, 1) + ' h');

  function renderRail() {
    const checks = blueprint.checks(), d = blueprint.derived(), box = $('#bricks');
    box.replaceChildren(...BRICKS.map(([id, label]) => {
      const mine = checks.filter((c) => c.block === id), lvl = mine.some((c) => c.level === 'err') ? 'err' : mine.some((c) => c.level === 'warn') ? 'warn' : '';
      return h('button', { class: 'brick', type: 'button', 'aria-pressed': String(ui.brick === id), onclick: () => { ui.brick = id; ui.query = ''; refresh(); } },
        h('span', { class: 'glyph', html: BRICKS.find((b) => b[0] === id)[3] }), h('div', {}, h('b', {}, label), h('span', {}, summary(id))),
        h('i', { class: 'dot ' + lvl, title: mine.map((c) => c.text).join(' · ') }));
    }));
    const bad = checks.filter((c) => c.level === 'err').length, warn = checks.filter((c) => c.level === 'warn').length;
    const score = Math.round(100 * (checks.length - bad - warn * 0.4) / checks.length);
    $('#ring').setAttribute('stroke-dashoffset', String(138.2 * (1 - score / 100)));
    $('#ring').setAttribute('stroke', bad ? 'var(--err)' : warn ? 'var(--warn)' : 'var(--ok)');
    $('#ring-t').textContent = score;
    const rec = recorded(); // a recorded run states what it cost; anything else is an estimate
    $('#estimate').replaceChildren(
      h('dt', {}, 'Time'), h('dd', { class: 'num' }, rec ? duration(rec.wall) : '≈ ' + duration(d.seconds)),
      h('dt', {}, 'Cost'), h('dd', { class: 'num' }, rec ? fr(rec.cores * rec.wall / 3600 * blueprint.TARGETS[st.v.target].rate, 1) + ' credits' : '≈ ' + fr(d.credits, d.credits < 10 ? 1 : 0) + ' credits'),
      h('dt', {}, 'Mem./task'), h('dd', { class: 'num' }, rec ? fr(rec.mem / 1000, 1) + ' GB' : '≈ ' + fr(d.mem, d.mem < 10 ? 1 : 0) + ' GB'));
    const btn = $('#launch');
    btn.disabled = bad > 0;
    btn.textContent = bad ? 'Blueprint incomplete' : 'Run calculation';
    btn.title = checks.filter((c) => c.level !== 'ok').map((c) => c.text).join('\n');
  }

  function renderStageMeta() {
    const sys = st.sys, d = blueprint.derived();
    $('#sys-name').textContent = sys.name + (sys.edited ? ', modified' : '');
    $('#sys-blurb').textContent = sys.blurb;
    $('#sys-chips').replaceChildren(...[formula(), sys.atoms.length + ' atoms', d.ne + ' valence e⁻', BC[sys.bc]].concat(sys.traits).map((t) => h('span', { class: 'chip' }, t)));
    const w = ui.view;
    $$('#viewbar .tog').forEach((b) => {
      const k = b.dataset.view;
      b.setAttribute('aria-pressed', String(!!w[k]));
      b.disabled = (k === 'fragment' && !sys.fragments) || (k === 'orbital' && !sys.orbital) || (k === 'ghosts' && sys.bc === 'free');
    });
    const L = $('#legend'), css = (n) => 'background:var(' + n + ')';
    if (w.grid) L.replaceChildren(h('span', {}, h('i', { style: css('--fg-3') }), 'coarse region: scaling functions'), h('span', {}, h('i', { style: css('--accent') }), 'fine region: 7 more wavelets per point'));
    else if (w.orbital) L.replaceChildren(h('span', {}, h('i', { style: css('--pos') }), 'phase +'), h('span', {}, h('i', { style: css('--neg') }), 'phase −'), h('span', {}, sys.orbital.label + ' · illustration'));
    else if (w.density) L.replaceChildren(h('span', {}, h('i', { style: css('--accent') }), 'density isosurface · illustration'));
    L.hidden = !(w.grid || w.orbital || w.density);
    $('#hint').hidden = ui.sel != null || !L.hidden;
    renderSel();
  }

  function renderSel() {
    const card = $('#selcard');
    card.hidden = ui.sel == null;
    if (ui.sel == null) return;
    const at = st.sys.atoms[ui.sel], i = ui.sel;
    card.replaceChildren(
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, EL[at.el].name + ' · atom ' + (i + 1)), h('button', { class: 'btn small', type: 'button', onclick: () => { ui.sel = null; refresh(); syncStage(); } }, 'Close')),
      h('span', { class: 'label' }, 'Substitute with'),
      h('div', { class: 'row' }, Object.keys(EL).filter((e) => e !== at.el).map((e) => h('button', { class: 'el', type: 'button', title: EL[e].name, onclick: () => editAtoms((A) => { A[i].el = e; }) }, e))),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => editAtoms((A) => { A.splice(i, 1); }) }, 'Create a vacancy')),
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const t = $('#note-text').value.trim(); if (!t) return; addNote(i, t, 'You'); ui.sel = null; refresh(); syncStage(); } },
        h('input', { id: 'note-text', type: 'text', placeholder: 'Leave a note on this atom', 'aria-label': 'Note on this atom', maxlength: 120 }), h('button', { class: 'btn small', type: 'submit' }, 'Pin')));
  }

  // --- notes pinned on atoms: written by you, or shown on request from a project -----
  function addNote(index, text, author, example) { ui.notes.push({ sys: st.sys.id, i: index, text, author, example }); renderPins(); }
  function renderPins() {
    $('#pins').replaceChildren(...ui.notes.filter((n) => n.sys === st.sys.id && st.sys.atoms[n.i]).map((n) => {
      const el = h('div', { class: 'pin' }, h('b', {}, n.author), ' · ' + n.text + (n.example ? ' (example from the Lab)' : ''),
        h('button', { type: 'button', 'aria-label': 'Remove this note', onclick: () => { ui.notes.splice(ui.notes.indexOf(n), 1); renderPins(); } }, '×'));
      el.note = n;
      return el;
    }));
  }

  // --- inspector ---------------------------------------------------------------
  const seg = (opts, cur, on) => h('div', { class: 'seg' }, opts.map(([val, label]) => h('button', { type: 'button', 'aria-pressed': String(val === cur), onclick: () => on(val) }, label)));

  function ctl(def) {
    const k = def.k, v = st.v[k], src = st.src[k], why = st.why[k];
    let body;
    if (def.type === 'seg') body = seg(def.opts, v, (val) => blueprint.set(k, val));
    else if (def.type === 'cards') body = h('div', { class: 'cards' }, def.opts.map(([val, label, text]) => h('button', { class: 'card', type: 'button', 'aria-pressed': String(val === v), onclick: () => blueprint.set(k, val) }, h('b', {}, label), h('span', {}, text))));
    else if (def.type === 'toggle') body = h('div', { class: 'ctl-val' }, h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!v), 'aria-label': def.label, onclick: () => blueprint.set(k, !v) }), h('span', { style: 'color:var(--fg-2);font-size:13px' }, def.text ? def.text(v) : v ? 'on' : 'off'));
    else if (def.type === 'step') body = h('div', { class: 'ctl-val' }, h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Decrease', onclick: () => blueprint.set(k, Math.max(def.min, v - (def.step || 1))) }, '−'),
      h('output', {}, def.fmt ? def.fmt(v) : String(v)),
      h('button', { type: 'button', 'aria-label': 'Increase', onclick: () => blueprint.set(k, Math.min(def.max, v + (def.step || 1))) }, '+')), def.unit ? h('span', { style: 'color:var(--fg-3);font-size:12px' }, def.unit) : null);
    else {
      const out = h('output', {}, fr(v, def.dec) + ' ' + def.unit);
      body = h('div', { class: 'ctl-val' }, h('input', {
        type: 'range', id: 'ctl-' + k, min: def.min, max: def.max, step: def.step, value: v, 'aria-label': def.label,
        oninput: (e) => { ui.drag = true; out.textContent = fr(+e.target.value, def.dec) + ' ' + def.unit; blueprint.set(k, +e.target.value); },
        onchange: () => { ui.drag = false; refresh(); },
      }), out);
    }
    const user = ['you', 'agent', 'paper', 'guide', 'run'].includes(src);
    return h('div', { class: 'ctl', id: 'row-' + k },
      h('div', { class: 'ctl-head' }, h('b', {}, def.label), P[k][1] ? h('code', {}, P[k][1]) : null),
      body,
      def.help ? h('p', { style: 'font-size:12px;color:var(--fg-3)' }, def.help) : null,
      h('div', { class: 'prov' }, h('span', { class: 'src-chip src-' + src }, SRC[src]),
        h('div', {}, why ? why.reason : src === 'default' ? 'The code’s own value.' : '',
          why ? h('div', { class: 'trip', html: '(' + esc(why.triplet[0]) + ') <em>' + esc(why.triplet[1]) + '</em> (' + esc(why.triplet[2]) + ')' }) : null,
          user ? h('button', { class: 'btn small', type: 'button', style: 'margin-top:4px', onclick: () => blueprint.reset(k) }, 'Back to the advice') : null)));
  }

  function controls(id, depth = ui.depth) {
    const v = st.v, sys = st.sys, per = sys.bc !== 'free';
    switch (id) {
      case 'theory': return [
        { k: 'xc', label: 'Exchange-correlation', type: 'seg', opts: [['LDA', 'LDA'], ['PBE', 'PBE'], ['PBE0', 'PBE0'], ['B3LYP', 'B3LYP'], ['HF', 'Hartree-Fock']] },
        { k: 'charge', label: 'Total charge', type: 'step', min: -4, max: 4, fmt: (x) => (x > 0 ? '+' : '') + x, unit: 'e' },
        { k: 'nspin', label: 'Spin', type: 'seg', opts: [[1, 'Unpolarised'], [2, 'Collinear'], [4, 'Non-collinear']] },
        v.nspin !== 1 && { k: 'mpol', label: 'Total magnetic moment', type: 'step', min: 0, max: 12, unit: 'µB' },
        { k: 'dispersion', label: 'Dispersion (Grimme D3)', type: 'toggle' },
      ];
      case 'accuracy': return [
        { k: 'hgrid', label: 'Grid spacing', type: 'range', min: 0.25, max: 0.65, step: 0.01, dec: 2, unit: 'bohr', help: 'The smaller the spacing, the richer the basis. Turn on “Wavelet grid” in the scene to watch it tighten.' },
        { k: 'crmult', label: 'Extent of the coarse region', type: 'range', min: 3, max: 10, step: 0.5, dec: 1, unit: '× radius' },
        { k: 'frmult', label: 'Extent of the fine region', type: 'range', min: 4, max: 12, step: 0.5, dec: 1, unit: '× radius' },
        { k: 'gnrm', label: 'Convergence criterion', type: 'seg', opts: [[1e-3, '10⁻³'], [1e-4, '10⁻⁴'], [1e-5, '10⁻⁵'], [1e-6, '10⁻⁶']] },
        { k: 'algo', label: 'Algorithm', type: 'seg', opts: [['cubic', 'Cubic'], ['linear', 'Linear']], help: 'Cubic: extended orbitals, the accuracy reference. Linear: localised support functions, for large systems.' },
      ];
      case 'environment': return [
        per && { k: 'kpt', label: 'k-points (Monkhorst-Pack)', type: 'step', min: 1, max: 8, fmt: (n) => (sys.bc === 'surface' ? n + '×1×' + n : n + '×' + n + '×' + n) },
        { k: 'solvent', label: 'Implicit solvent', type: 'seg', opts: [['none', 'Vacuum'], ['water', 'Water'], ['ethanol', 'Ethanol'], ['mesitylene', 'Mesitylene']] },
        { k: 'efield', label: 'Electric field along y', type: 'range', min: -0.01, max: 0.01, step: 0.001, dec: 3, unit: 'Ha/bohr' },
        { k: 'scf', label: 'Self-consistency scheme', type: 'seg', opts: [['dirmin', 'Direct minimisation'], ['mixing', 'Density mixing']] },
        (depth > 0 || v.scf === 'mixing') && { k: 'tel', label: 'Electronic temperature', type: 'range', min: 0, max: 0.03, step: 0.001, dec: 3, unit: 'Ha' },
      ];
      case 'task': return [
        { k: 'action', label: 'What do you want to obtain?', type: 'cards', opts: ACTIONS },
        v.action === 'geopt' && { k: 'geoptMethod', label: 'Optimiser', type: 'seg', opts: [['FIRE', 'FIRE'], ['SQNM', 'SQNM'], ['LBFGS', 'L-BFGS'], ['DIIS', 'DIIS']] },
        v.action === 'geopt' && { k: 'geoptSteps', label: 'Maximum number of steps', type: 'step', min: 10, max: 500, step: 10 },
        v.action === 'geopt' && { k: 'forcemax', label: 'Stop at maximum force', type: 'range', min: 0, max: 0.02, step: 0.001, dec: 3, unit: 'Ha/bohr' },
        v.action === 'geopt' && (depth > 0 || v.biomode) && { k: 'biomode', label: 'Biomolecule mode', type: 'toggle' },
        v.action === 'md' && { k: 'mdSteps', label: 'Number of steps', type: 'step', min: 50, max: 5000, step: 50 },
        v.action === 'md' && { k: 'mdT', label: 'Temperature', type: 'range', min: 0, max: 1000, step: 10, dec: 0, unit: 'K' },
        v.action === 'md' && { k: 'mdDt', label: 'Time step', type: 'range', min: 5, max: 60, step: 1, dec: 0, unit: 'a.u.', help: '20.67 a.u. is 0.5 fs.' },
        v.action === 'md' && { k: 'thermostat', label: 'Thermostat', type: 'seg', opts: [['none', 'None (NVE)'], ['nose_hoover_chain', 'Nosé-Hoover']] },
        v.action === 'neb' && { k: 'nimg', label: 'Images along the path', type: 'step', min: 3, max: 31, step: 2 },
        v.action === 'tddft' && { k: 'tddft', label: 'Approach', type: 'seg', opts: [['TDA', 'Tamm-Dancoff'], ['full', 'Full Casida']] },
        v.action === 'tddft' && { k: 'nvirt', label: 'Virtual states', type: 'step', min: 2, max: 64, step: 2 },
      ];
      case 'observables': return [
        { k: 'dos', label: 'Density of states', type: 'toggle', text: (x) => (x ? 'plotted after the run' : 'not plotted') },
        { k: 'density', label: 'Electron density', type: 'toggle', text: (x) => (x ? 'written as a cube file' : 'not written') },
        { k: 'nplot', label: 'Orbitals around the Fermi level', type: 'step', min: 0, max: 8 },
        { k: 'dipole', label: 'Dipole moment', type: 'toggle' },
        { k: 'charges', label: 'Atomic charges and multipoles', type: 'toggle' },
      ];
      case 'machine': return [
        { k: 'target', label: 'Target', type: 'cards', opts: Object.entries(blueprint.TARGETS).map(([id2, t]) => [id2, t.label, t.detail]) },
        { k: 'mpi', label: 'MPI processes', type: 'step', min: 1, max: 128, step: 1 },
        { k: 'omp', label: 'OpenMP threads per process', type: 'step', min: 1, max: 16 },
      ];
    }
    return [];
  }

  /* Equations, written once and reused by the inspector and the Publish space.
   * Notation: Psi_i Kohn-Sham orbitals, phi scaling functions, psi^(nu) wavelets
   * (Genovese et al., J. Chem. Phys. 129, 014109), Phi electrostatic potential,
   * phi_alpha support functions and K the density kernel (Mohr et al., 2014). */
  const TEX = {
    ks: '\\Big[-\\tfrac12\\nabla^2+V_{\\mathrm H}[\\rho]+V_{xc}[\\rho]+V_{\\mathrm{ext}}\\Big]\\Psi_i=\\varepsilon_i\\,\\Psi_i',
    density: '\\rho(\\mathbf r)=\\sum_i f_i\\,\\lvert\\Psi_i(\\mathbf r)\\rvert^2',
    // two lines: the panel of a block is narrow, and so is a phone
    expansion: '\\begin{aligned}\\Psi(\\mathbf r)={}&\\sum_{i_1,i_2,i_3}s_{i_1i_2i_3}\\,\\phi_{i_1i_2i_3}(\\mathbf r)\\\\&+\\sum_{j_1,j_2,j_3}\\sum_{\\nu=1}^{7}d^{(\\nu)}_{j_1j_2j_3}\\,\\psi^{(\\nu)}_{j_1j_2j_3}(\\mathbf r)\\end{aligned}',
    dof: 'N_{\\mathrm{dof}}=N_c+7N_f',
    poisson: '\\nabla\\!\\cdot\\!\\big[\\epsilon(\\mathbf r)\\,\\nabla\\Phi(\\mathbf r)\\big]=-4\\pi\\rho(\\mathbf r)',
    forces: '\\mathbf F_I=-\\frac{\\partial E}{\\partial \\mathbf R_I}',
    newton: 'M_I\\,\\ddot{\\mathbf R}_I=\\mathbf F_I',
    kernel: '\\rho(\\mathbf r,\\mathbf r\')=\\sum_{\\alpha,\\beta}\\phi_\\alpha(\\mathbf r)\\,K^{\\alpha\\beta}\\,\\phi_\\beta(\\mathbf r\')',
  };
  const stack = (...lines) => '$$\\begin{gathered}' + lines.join('\\\\[6pt]') + '\\end{gathered}$$';
  const EQ = {
    theory: ['Electrons are described by the Kohn-Sham equations, solved self-consistently with the density; the chosen functional sets $V_{xc}$, and $f_i$ are the occupations.', stack(TEX.ks, TEX.density)],
    accuracy: ['Each orbital is expanded on scaling functions $\\phi$ at every grid point, plus 7 wavelets $\\psi^{(\\nu)}$ per point of the fine region: $N_c$ coarse and $N_f$ fine points give the number of degrees of freedom.', stack(TEX.expansion, TEX.dof)],
    environment: ['The implicit solvent enters through a position-dependent permittivity $\\epsilon(\\mathbf r)$ in the generalised Poisson equation for the electrostatic potential $\\Phi$ (atomic units).', '$$' + TEX.poisson + '$$'],
    task: ['Relaxation and dynamics follow the forces on the nuclei, of mass $M_I$ at positions $\\mathbf R_I$.', stack(TEX.forces, TEX.newton)],
  };
  /* MathJax loads asynchronously; give it ten seconds, then leave the TeX as text. */
  function typeset(el, tries = 0) {
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {});
    else if (tries < 25) setTimeout(() => typeset(el, tries + 1), 400);
  }

  function schemaRow(vr) {
    const cur = st.expert[vr.p], set = cur !== undefined;
    const parse = (s) => { if (s === '') return ''; try { return JSON.parse(s); } catch (e) { return s; } };
    const field = vr.e
      ? h('select', { class: set ? 'set' : '', 'aria-label': vr.p, onchange: (e) => blueprint.setExpert(vr.p, e.target.value === String(vr.d) ? '' : parse(e.target.value)) }, vr.e.map((o) => h('option', { value: String(o), selected: String(set ? cur : vr.d) === String(o) }, String(o))))
      : h('input', { class: set ? 'set' : '', 'aria-label': vr.p, value: set ? (typeof cur === 'string' ? cur : JSON.stringify(cur)) : '', placeholder: typeof vr.d === 'string' ? vr.d : JSON.stringify(vr.d), onchange: (e) => blueprint.setExpert(vr.p, parse(e.target.value.trim())) });
    return h('div', { class: 'vrow' }, h('code', {}, vr.p), field, h('small', {}, vr.c + (vr.r ? ' · from ' + vr.r[0] + ' to ' + vr.r[1] : '') + (vr.if ? ' · depends on ' + vr.if : '')));
  }

  // --- notices: advice and checks, tied to the parameters they involve ----------
  const blockLabel = (id) => BRICKS.find((b) => b[0] === id)[1];
  /* Names of the controls that are only drawn in some situations. */
  const NAMES = { action: 'Task', geoptMethod: 'Optimiser', geoptSteps: 'Maximum number of steps', forcemax: 'Stop at maximum force', biomode: 'Biomolecule mode', mdSteps: 'Number of steps', mdT: 'Temperature', mdDt: 'Time step', thermostat: 'Thermostat', nimg: 'Images along the path', tddft: 'Excitation approach', nvirt: 'Virtual states', mpol: 'Total magnetic moment', kpt: 'k-points (Monkhorst-Pack)', tel: 'Electronic temperature' };
  const labelOf = (key) => { if (NAMES[key]) return NAMES[key]; const d = controls(P[key][2], 1).find((x) => x && x.k === key); return d ? d.label : P[key][1] || key; };

  /* Open the block that owns a parameter, scroll to its control and flash it. */
  function reveal(key) {
    const block = P[key][2];
    ui.brick = block; ui.query = '';
    ui.depth = controls(block, 0).some((x) => x && x.k === key) ? (ui.depth === 2 ? 0 : ui.depth) : 1;
    if (location.hash.slice(1) !== 'workshop' && location.hash) location.hash = 'workshop';
    renderRail(); renderInspector();
    const row = document.getElementById('row-' + key);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 2400);
    const first = row.querySelector('button, input, select');
    if (first) first.focus({ preventScroll: true });
  }

  function notice(level, title, body, keys, extra) {
    const mark = (on) => keys.forEach((k) => { const r = document.getElementById('row-' + k); if (r) r.classList.toggle('hl', on); });
    return h('div', { class: 'notice ' + level, onmouseenter: () => mark(true), onmouseleave: () => mark(false), onfocusin: () => mark(true), onfocusout: () => mark(false) },
      h('b', {}, title), h('span', {}, body),
      h('div', { class: 'notice-actions' }, extra || null, keys.map((k) => h('button', { class: 'btn small', type: 'button', onclick: () => reveal(k) },
        'See parameter: ' + labelOf(k) + (P[k][2] === ui.brick ? '' : ' (' + blockLabel(P[k][2]) + ')')))));
  }
  /* Shown at the top of a block: advice on its parameters, and every check that
   * involves one of them, even when the check is filed under another block. */
  function notices() {
    const out = [];
    for (const a of st.advice) if (P[a.key][2] === ui.brick) out.push(notice('advice', 'The advice differs from your choice', a.reason, [a.key], h('button', { class: 'btn small cta', type: 'button', onclick: () => blueprint.reset(a.key) }, 'Follow the advice')));
    for (const c of blueprint.checks()) if (c.level !== 'ok' && (c.block === ui.brick || c.keys.some((k) => P[k][2] === ui.brick))) out.push(notice(c.level, c.level === 'err' ? 'To fix' : 'Good to know', c.text, c.keys));
    return out;
  }

  function renderInspector() {
    const b = BRICKS.find((x) => x[0] === ui.brick), body = $('#insp-body'), sys = st.sys;
    $('#insp-title').textContent = b[1]; $('#insp-role').textContent = b[2];
    $$('#depth button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.depth === ui.depth)));
    const kids = [];
    if (ui.depth < 2) {
      if (ui.brick === 'matter') {
        kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Starting point')),
          h('div', { class: 'cards' }, OND.chem.list.map(([id, name]) => h('button', { class: 'card', type: 'button', 'aria-pressed': String(sys.id === id), onclick: () => loadSystem(id) }, h('b', {}, name), h('span', {}, { h2o: 'molecule', c60: 'molecule, 60 atoms', 'gr-bz': 'surface, 72 atoms', si64: 'crystal, 64 atoms', ala20: 'biology, 203 atoms' }[id])))),
          h('p', { style: 'font-size:12px;color:var(--fg-3)' }, 'Planned: import of XYZ, PDB and CIF files, drawing, structure databases.')));
        kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Boundary conditions'), h('code', {}, 'posinp.cell')),
          h('div', { class: 'seg readonly', role: 'img', 'aria-label': 'Boundary conditions: ' + BC[sys.bc] }, [['free', 'Isolated'], ['surface', 'Surface'], ['periodic', 'Periodic']].map(([val, label]) => h('span', { class: val === sys.bc ? 'on' : '' }, label))),
          h('p', { style: 'font-size:12px;color:var(--fg-3)' }, sys.bc === 'surface' ? 'Periodic along x and z, free along y: the BigDFT convention for surfaces. Cell ' + fr(sys.cell[0], 2) + ' × ∞ × ' + fr(sys.cell[2], 2) + ' Å.' : sys.bc === 'periodic' ? 'Orthorhombic cell, ' + sys.cell.map((c) => fr(c, 2)).join(' × ') + ' Å.' : 'No periodic image: the potential is solved with true free boundary conditions.') , h('p', { style: 'font-size:12px;color:var(--fg-3)' }, 'Set by the cell of the structure, not chosen here.')));
        kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Edit')),
          h('p', { style: 'font-size:13px;color:var(--fg-2)' }, 'Click an atom in the scene to substitute or remove it. The blueprint adapts: try doping silicon with a phosphorus.'),
          ui.undo.length ? h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: undoEdit }, 'Undo last edit (' + ui.undo.length + ')')) : null));
        if (sys.fragments) kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Fragments'), h('code', {}, sys.fragments.length + ' defined')), h('p', { style: 'font-size:13px;color:var(--fg-2)' }, sys.fragments.slice(0, 4).join(', ') + (sys.fragments.length > 4 ? '…' : '') + '. Turn on “Fragments” in the scene to colour them.')));
      } else {
        if (ui.brick === 'machine') kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Container'), h('code', {}, 'pack.container')),
          h('code', { style: 'overflow-wrap:anywhere' }, 'bigdft/runtime@sha256:6f16f65f5b33…'),
          h('p', { style: 'font-size:12px;color:var(--fg-3)' }, 'BigDFT 1.9.1. Declared by the PyBigDFT pack and pinned by digest, never by tag: two runs months apart stay comparable.')));
        kids.push(...controls(ui.brick).filter(Boolean).map(ctl));
      }
      kids.unshift(...notices());
      if (EQ[ui.brick]) { const eq = h('div', { class: 'eq' }, h('p', {}, EQ[ui.brick][0]), h('div', {}, EQ[ui.brick][1])); kids.push(eq); setTimeout(() => typeset(eq), 0); }
      if (ui.depth === 1) {
        const rows = SCHEMA.filter((x) => x.b === ui.brick && x.t === 1);
        if (rows.length) kids.push(h('p', { class: 'label', style: 'margin-top:18px' }, 'Advanced settings · ' + rows.length), ...rows.map(schemaRow));
      }
    } else {
      const q = ui.query.toLowerCase();
      const rows = SCHEMA.filter((x) => (q ? (x.p + ' ' + x.c).toLowerCase().includes(q) : x.b === ui.brick));
      kids.push(h('input', { class: 'vsearch', id: 'vsearch', type: 'search', placeholder: 'Search the ' + SCHEMA.length + ' BigDFT variables', value: ui.query, 'aria-label': 'Search a variable', oninput: (e) => { ui.query = e.target.value; renderInspector(); const s = $('#vsearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }),
        h('p', { class: 'count' }, q ? rows.length + ' result' + (rows.length > 1 ? 's' : '') + ' across the whole code' : rows.length + ' variables attached to this block, extracted from the BigDFT source'),
        ...rows.slice(0, 80).map(schemaRow));
    }
    body.replaceChildren(...kids);
  }

  // --- source -----------------------------------------------------------------
  function renderSource() {
    $('#yaml').innerHTML = blueprint.yaml().map((l) => {
      const pad = '  '.repeat(l.ind);
      if (l.note) return pad + '<span class="c"># ' + esc(l.note) + '</span>';
      if (l.item) return pad + '- <span class="k">' + l.item + '</span>: ' + l.val;
      return pad + '<span class="k">' + esc(l.k) + '</span>:' + (l.val != null ? ' ' + esc(l.val) : '') + (l.c ? '  <span class="c"># ' + esc(l.c) + '</span>' : '');
    }).join('\n');
    $('#python').innerHTML = blueprint.python().map((l) => esc(l).replace(/("[^"]*")/g, '<span class="s">$1</span>').replace(/^(from|import|print)\b/, '<span class="k">$1</span>').replace(/\b(inp|code|log)\.(\w+)/g, '$1.<span class="k">$2</span>')).join('\n');
  }

  // --- charts (single series: the title names it) -------------------------------
  function chart(el, o) {
    const W = Math.max(260, el.clientWidth || 420), H = o.h || 150, m = { l: 46, r: 14, t: 10, b: 28 };
    const ty = (y) => (o.log ? Math.log10(y) : y);
    const xs = o.xs, ys = o.ys.map(ty);
    const x0 = o.x0 != null ? o.x0 : Math.min(...xs), x1 = o.x1 != null ? o.x1 : Math.max(...xs, x0 + 1);
    let y0 = o.y0 != null ? ty(o.y0) : Math.min(...ys), y1 = o.y1 != null ? ty(o.y1) : Math.max(...ys);
    if (o.log) { y0 = Math.floor(y0); y1 = Math.ceil(y1); }
    if (y1 === y0) y1 = y0 + 1;
    const X = (x) => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r), Y = (y) => H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b);
    const ticks = o.log ? Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter((t, i, a) => a.length < 7 || i % 2 === 0) : [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
    const line = xs.map((x, i) => (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(ys[i]).toFixed(1)).join('');
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title) + '">';
    for (const t of ticks) s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (m.l - 7) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + (o.log ? '10' + String(t).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) : o.yfmt(t)) + '</text>';
    s += '<text x="' + m.l + '" y="' + (H - 6) + '">' + o.xfmt(x0) + '</text><text x="' + (W - m.r) + '" y="' + (H - 6) + '" text-anchor="end">' + o.xfmt(x1) + ' ' + o.xlabel + '</text>';
    if (o.goal != null) s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(ty(o.goal)) + '" y2="' + Y(ty(o.goal)) + '" stroke="var(--ok)" stroke-width="1" stroke-dasharray="4 4"/><text x="' + (W - m.r) + '" y="' + (Y(ty(o.goal)) - 5) + '" text-anchor="end">' + o.goalLabel + '</text>';
    if (o.vline != null) s += '<line x1="' + X(o.vline) + '" x2="' + X(o.vline) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--fg-3)" stroke-width="1" stroke-dasharray="3 3"/><text x="' + (X(o.vline) + 5) + '" y="' + (m.t + 9) + '">' + o.vlabel + '</text>';
    if (o.area && xs.length > 1) s += '<path d="' + line + 'L' + X(xs[xs.length - 1]) + ' ' + Y(y0) + 'L' + X(xs[0]) + ' ' + Y(y0) + 'Z" fill="var(--accent-soft)"/>';
    s += '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    if (!o.area && xs.length) s += '<circle cx="' + X(xs[xs.length - 1]) + '" cy="' + Y(ys[ys.length - 1]) + '" r="4.500" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>';
    s += '<g class="cross" visibility="hidden"><line y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--fg-3)" stroke-width="1"/><circle r="4" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/></g></svg><div class="tip" hidden></div>';
    el.innerHTML = s;
    const svg = el.firstChild, cross = $('.cross', svg), tip = $('.tip', el);
    svg.onpointermove = (e) => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      let best = 0;
      xs.forEach((x, i) => { if (Math.abs(X(x) - px) < Math.abs(X(xs[best]) - px)) best = i; });
      cross.setAttribute('visibility', 'visible');
      cross.firstChild.setAttribute('x1', X(xs[best])); cross.firstChild.setAttribute('x2', X(xs[best]));
      cross.lastChild.setAttribute('cx', X(xs[best])); cross.lastChild.setAttribute('cy', Y(ys[best]));
      tip.hidden = false; tip.textContent = o.tip(xs[best], o.ys[best]);
      tip.style.left = X(xs[best]) / W * r.width + 'px'; tip.style.top = Y(ys[best]) / H * r.height + 'px';
    };
    svg.onpointerleave = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  }

  // --- run (simulated: every number below is an example) ------------------------
  let runTimer = null;
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function resetRun() {
    clearInterval(runTimer); ui.ran = false;
    $('#run-steps').replaceChildren(); $('#scf-chart').replaceChildren();
    $('#results').replaceChildren(h('p', { class: 'label' }, 'Results'), h('p', { style: 'color:var(--fg-2);margin-top:8px' }, 'Run the calculation: convergence shows here live, then the quantities requested in the Observables block.'));
  }
  function setTab(name) {
    $$('#dock .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('#dock [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    $('#dock').classList.remove('closed'); $('#dock-toggle').textContent = 'Collapse';
    $('#dock').classList.toggle('tall', name === 'guide'); // a tutorial needs room to be read
  }
  // --- real results: the recorded runs of the 6a study ------------------------------
  const REC = OND.studyView.energies.prod;
  /* The recorded run that matches the blueprint, if any: same system, same physics. */
  function recorded() {
    const v = st.v, sys = st.sys;
    if (!sys.recorded || sys.edited) return null;
    const same = v.xc === 'PBE' && v.hgrid === 0.35 && v.crmult === 6 && v.frmult === 9 && v.solvent === 'none' && v.action === 'sp' && v.charge === 0 && v.algo === 'cubic' && !v.dispersion;
    return !same ? null : v.nspin === 1 ? REC.S0 : v.nspin === 2 && v.mpol === 2 ? REC.T1 : null;
  }
  function openRecorded() {
    loadSystem('6a');
    for (const [k, val] of [['xc', 'PBE'], ['hgrid', 0.35], ['crmult', 6], ['frmult', 9], ['gnrm', 1e-5], ['solvent', 'none'], ['target', 'hpc'], ['mpi', 20], ['omp', 4]]) blueprint.set(k, val, 'run');
    ui.brick = 'accuracy'; location.hash = 'workshop'; dryRun();
  }
  function dryRun() {
    const d = blueprint.derived(), rec = recorded(), dl = h('dl', { class: 'kv' }), row = (k, val) => dl.append(h('dt', {}, k), h('dd', { class: 'num' }, val));
    clearInterval(runTimer); setTab('run');
    $('#run-steps').replaceChildren(); $('#scf-chart').replaceChildren(); $('#run-title').textContent = '';
    row('Valence electrons', String(d.ne)); row('Orbitals', String(d.norb));
    row('Coarse grid points', (rec ? '' : '≈ ') + fr(rec ? rec.nc : d.nc, 0)); row('Fine grid points', (rec ? '' : '≈ ') + fr(rec ? rec.nf : d.nf, 0));
    row('Degrees of freedom per orbital', (rec ? '' : '≈ ') + fr(rec ? rec.dof : d.dof, 0));
    row('Memory peak per MPI task', rec ? fr(rec.mem, 0) + ' MB' : '≈ ' + fr(d.mem * 1000, 0) + ' MB');
    const bad = blueprint.checks().filter((c) => c.level === 'err');
    $('#results').replaceChildren(
      h('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, h('p', { class: 'label' }, 'Dry run'), h('span', { class: 'pill' + (rec ? '' : ' example') }, rec ? 'recorded on TSUBAME4.0' : 'workshop estimate')),
      h('p', { style: 'color:var(--fg-2);font-size:13px;margin:6px 0 8px' }, 'A dry run builds the input, counts electrons and grid points and estimates the memory, without a single self-consistent step. It takes seconds: do it before every run.'),
      dl,
      bad.length ? h('div', { class: 'notice err' }, h('b', {}, 'The input would be refused'), h('span', {}, bad.map((c) => c.text).join(' · '))) : h('p', { style: 'color:var(--ok);font-size:13px;margin-top:8px' }, rec ? 'Passed. BigDFT read this input and the run that followed is recorded: “Run calculation” replays it.' : 'No inconsistency found. In production these numbers come from BigDFT itself, not from the workshop.'));
  }
  function runRecorded(rec) {
    resetRun(); setTab('run');
    const names = ['Queued', 'Container ready', 'Self-consistent cycle', 'Analysis'], pills = names.map((n) => h('span', { class: 'step' }, n));
    $('#run-steps').replaceChildren(...pills, h('span', { class: 'pill' }, 'recorded on TSUBAME4.0'));
    const mark = (i) => pills.forEach((p, j) => { p.className = 'step' + (j < i ? ' done' : j === i ? ' on' : ''); });
    const all = rec.scf, chunk = Math.max(1, Math.ceil(all.length / 46));
    let i = 0, shown = 0;
    mark(0); $('#run-title').textContent = 'Norm of the orbital gradient, per iteration';
    runTimer = setInterval(() => {
      if (i < 6) { i++; if (i === 3) mark(1); if (i === 6) mark(2); return; }
      shown = Math.min(all.length, shown + chunk);
      const part = all.slice(0, shown);
      chart($('#scf-chart'), { title: 'Self-consistent cycle convergence', xs: part.map((q) => q[0]), ys: part.map((q) => q[1]), log: true, x0: 1, x1: all.length, y0: 1e-6, y1: 1, goal: rec.gnrm_cv, goalLabel: 'criterion', xlabel: 'iterations', xfmt: (x) => String(Math.round(x)), tip: (x, y) => 'it. ' + x + ' · ' + y.toExponential(1) });
      if (shown < all.length) return;
      clearInterval(runTimer); mark(names.length); ui.ran = true;
      const dl = h('dl', { class: 'kv' }), row = (k, val) => dl.append(h('dt', {}, k), h('dd', { class: 'num' }, val)), o = rec.orbitals;
      row('Total energy', rec.energy.toFixed(6) + ' Ha');
      row('Highest occupied level', o.down.length ? fr(o.up.at(-1), 2) + ' eV (↑), ' + fr(o.down.at(-1), 2) + ' eV (↓)' : fr(o.up.at(-1), 2) + ' eV');
      row('Maximum force', rec.fmax.toExponential(1) + ' Ha/bohr'); row('Dipole moment', fr(rec.dipole, 2) + ' D');
      row('Self-consistent iterations', String(rec.iters)); row('Wall time', duration(rec.wall) + ' on ' + rec.cores + ' cores'); row('Code', 'BigDFT ' + rec.version);
      const lo = -16, hi = -2, xs = [], ys = [], lv = o.up.concat(o.down);
      for (let e = lo; e <= hi; e += 0.1) { xs.push(e); ys.push(lv.reduce((sum, l) => sum + Math.exp(-((e - l) ** 2) / 0.125), 0)); }
      const el = h('div', { class: 'chart' });
      $('#results').replaceChildren(h('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, h('p', { class: 'label' }, 'Results'), h('span', { class: 'pill' }, 'recorded run')), dl,
        rec.warnings.length ? h('div', { class: 'notice' }, h('b', {}, 'Converged, with ' + rec.warnings.length + ' BigDFT warnings'), h('span', {}, [...new Set(rec.warnings)].join(' · '))) : '',
        h('p', { class: 'label', style: 'margin-top:12px' }, 'Occupied states'), el,
        h('p', { class: 'figmeta', style: 'margin-top:10px' }, 'This is the log recorded in the capsule, read back: no calculation was started. To compute again, relaunch the pipeline of the study.'),
        h('p', { style: 'margin-top:8px' }, h('a', { class: 'btn small', href: '#study' }, 'See the study and its code')));
      chart(el, { title: 'Occupied states', h: 120, xs, ys, area: true, y0: 0, xlabel: 'eV', xfmt: (x) => fr(x, 0), yfmt: (y) => fr(y, 0), tip: (x, y) => fr(x, 1) + ' eV · ' + fr(y, 1) });
    }, 70);
  }

  function run() {
    const match = recorded();
    if (match) return runRecorded(match);
    const v = st.v, d = blueprint.derived(), sys = st.sys, rand = rng(sys.atoms.length * 7919 + Math.round(v.hgrid * 100));
    resetRun(); setTab('run');
    const outer = ['geopt', 'md', 'neb'].includes(v.action);
    const names = ['Queued', 'Container ready', 'Self-consistent cycle'].concat(outer ? [{ geopt: 'Relaxation', md: 'Dynamics', neb: 'Path' }[v.action]] : [], ['Analysis']);
    const pills = names.map((n) => h('span', { class: 'step' }, n));
    $('#run-steps').replaceChildren(...pills, h('span', { class: 'pill example' }, 'example values'));
    const mark = (i) => pills.forEach((p, j) => { p.className = 'step' + (j < i ? ' done' : j === i ? ' on' : ''); });
    const n = Math.min(d.iters, 44), goal = Math.log10(v.gnrm), xs = [], ys = [];
    let i = 0, phase = 0, fx = [], fy = [];
    mark(0);
    runTimer = setInterval(() => {
      if (phase === 0) { if (++i > 6) { phase = 1; i = 0; mark(2); } else if (i === 3) mark(1); return; }
      if (phase === 1) {
        i++; xs.push(i);
        ys.push(Math.pow(10, 0.4 + (goal - 0.55) * Math.pow(i / n, 0.8) + (rand() - 0.5) * 0.22));
        $('#run-title').textContent = 'Norm of the orbital gradient, per iteration';
        chart($('#scf-chart'), { title: 'Self-consistent cycle convergence', xs, ys, log: true, x0: 1, x1: n, y0: Math.pow(10, goal - 0.6), y1: 10, goal: v.gnrm, goalLabel: 'criterion', xlabel: 'iterations', xfmt: (x) => String(Math.round(x)), tip: (x, y) => 'it. ' + x + ' · ' + y.toExponential(1) });
        if (i >= n) { phase = outer ? 2 : 3; i = 0; mark(3); }
        return;
      }
      if (phase === 2) {
        i++; fx.push(i);
        fy.push(0.06 * Math.exp(-i / 4.2) * (1 + (rand() - 0.5) * 0.3) + 0.0012);
        $('#run-title').textContent = 'Maximum force on the atoms, per step';
        chart($('#scf-chart'), { title: 'Maximum force per step', xs: fx, ys: fy, log: true, x0: 1, x1: 20, y0: 1e-4, y1: 0.1, xlabel: 'steps', xfmt: (x) => String(Math.round(x)), tip: (x, y) => 'step ' + x + ' · ' + y.toExponential(1) + ' Ha/bohr' });
        if (i >= 20) { phase = 3; i = 0; mark(4); }
        return;
      }
      if (++i > 4) { clearInterval(runTimer); mark(names.length); results(d, rand, fy); }
    }, 70);
  }
  function results(d, rand, fy) {
    const v = st.v, sys = st.sys, c = OND.chem.composition(sys);
    const atomE = { H: -0.50, B: -2.60, C: -5.43, N: -9.90, O: -15.90, Si: -3.85, P: -6.50, S: -10.10 };
    const E = Object.keys(c).reduce((s, k) => s + c[k] * atomE[k], 0) * 1.035;
    const gap = { h2o: 6.3, c60: 1.6, 'gr-bz': 0, si64: 0.6, ala20: 4.6 }[sys.id] * (sys.edited ? 0.4 : 1);
    ui.ran = true;
    const box = $('#results'), dl = h('dl', { class: 'kv' });
    const row = (k, val) => dl.append(h('dt', {}, k), h('dd', { class: 'num' }, val));
    row('Total energy', fr(E, 4) + ' Ha');
    row('HOMO-LUMO gap', fr(gap, 2) + ' eV');
    if (fy.length) row('Maximum force', fy[fy.length - 1].toExponential(1) + ' Ha/bohr');
    if (v.dipole) row('Dipole moment', fr(sys.id === 'h2o' ? 1.81 : rand() * 0.6, 2) + ' D');
    row('Wall time', duration(d.seconds)); row('Cost', fr(d.credits, 1) + ' credits');
    box.replaceChildren(h('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, h('p', { class: 'label' }, 'Results'), h('span', { class: 'pill example' }, 'example values')), dl);
    if (v.dos) {
      const lv = [], nocc = Math.min(d.norb, 70);
      for (let i = 0; i < nocc; i++) lv.push(-Math.pow(rand(), 0.7) * 17);
      for (let i = 0; i < 30; i++) lv.push(gap + Math.pow(rand(), 1.3) * 8);
      lv.push(0, gap);
      const xs = [], ys = [];
      for (let e = -18; e <= gap + 8; e += 0.2) { xs.push(e); ys.push(lv.reduce((s, l) => s + Math.exp(-((e - l) ** 2) / 0.24), 0)); }
      const el = h('div', { class: 'chart' });
      box.append(h('p', { class: 'label', style: 'margin-top:12px' }, 'Density of states'), el);
      chart(el, { title: 'Density of states', h: 120, xs, ys, area: true, y0: 0, vline: 0, vlabel: 'HOMO', xlabel: 'eV', xfmt: (x) => fr(x, 0), yfmt: (y) => fr(y, 0), tip: (x, y) => fr(x, 1) + ' eV · ' + fr(y, 1) });
    }
    if (v.nplot && sys.orbital) { ui.view.orbital = true; ui.view.density = false; }
    else if (v.density) { ui.view.density = true; ui.view.orbital = false; }
    refresh(); syncStage();
  }

  // --- capsule ------------------------------------------------------------------
  /* Shaped like a Capsule-Maker package built from an aom-memory: one episode
   * per intention, the researcher's verdicts quoted verbatim, results verified
   * only when their evidence is packaged, files listed with their sha256. */
  const CAPSULE = {
    title: 'Benzene adsorption on graphene',
    meta: 'An example in the Capsule-Maker format: a goal, typed records, the files behind them. Move the slider to relive the session.',
    steps: [
      ['you', null, 'I want the adsorption energy of benzene on graphene.', () => {}, ['context', 'verified']],
      ['agent', 'use_pack', 'BigDFT pack loaded: read-only memory, its tools, its container.', () => {}],
      ['agent', 'query_memory', 'Asked the memory about “physisorption on a surface”. Three facts kept, among them (Graphene) isA (Gapless system).', () => {}],
      ['agent', 'set_parameters', 'PBE, mixing profile, Γ point only.', () => { blueprint.set('xc', 'PBE', 'agent'); blueprint.set('scf', 'mixing', 'agent'); blueprint.set('kpt', 1, 'agent'); }, ['decision', 'superseded']],
      ['you', null, 'Γ alone is not enough for a 12 Å sheet. Use a 2×1×2 mesh.', () => { blueprint.set('kpt', 2, 'you'); }, ['correction', 'verified']],
      ['agent', 'convergence_study', 'Grid-spacing convergence from 0.50 to 0.35 bohr. Kept: 0.40.', () => { blueprint.set('hgrid', 0.4, 'agent'); ui.view.grid = true; }],
      ['agent', 'run_in_container', 'Three calculations: complex, sheet alone, molecule alone.', () => { ui.view.grid = false; blueprint.set('density', true, 'agent'); }],
      ['agent', 'parse_bigdft_log', 'All three reached #FINAL with no warning. $E_{\\mathrm{ads}}=E_{\\mathrm{complex}}-E_{\\mathrm{sheet}}-E_{\\mathrm{molecule}}$', () => {}, ['result', 'verified']],
      ['agent', 'declare_file', 'input.yaml, run.py and the benzene HOMO figure declared in the manifest with their sha256.', () => { ui.view.orbital = true; }, ['evidence', 'verified']],
      ['you', null, 'Accepted. Without dispersion this is a lower bound; redo it once D3 handles surfaces.', () => {}, ['question', 'unresolved']],
    ],
  };
  let capBase = null, capTimer = null;
  function capsuleGo(k) {
    if (st.sys.id !== 'gr-bz' || st.sys.edited) loadSystem('gr-bz');
    if (!capBase) capBase = blueprint.snapshot();
    blueprint.restore(capBase);
    Object.assign(ui.view, { grid: false, density: false, orbital: false, fragment: false });
    for (let i = 0; i <= k; i++) CAPSULE.steps[i][3]();
    $('#cap-range').value = k;
    $$('#cap-log .msg').forEach((m, i) => m.classList.toggle('seen', i <= k));
    const cur = $$('#cap-log .msg')[k]; if (cur) cur.scrollIntoView({ block: 'nearest' });
    refresh(); syncStage(true);
  }
  function initCapsule() {
    $('#cap-title').textContent = CAPSULE.title; $('#cap-meta').textContent = CAPSULE.meta;
    $('#cap-log').replaceChildren(...CAPSULE.steps.map(([who, tool, text, , rec]) => h('div', { class: 'msg' }, h('span', { class: 'who' + (who === 'agent' ? ' bot' : '') }, who === 'agent' ? 'Agent' : 'Researcher'), h('div', {}, tool ? h('code', {}, tool + ' ') : null, text, rec ? h('span', { class: 'rec ' + rec[1] }, rec[0] + ' · ' + rec[1]) : null))));
    typeset($('#cap-log'));
    $('#cap-verify').addEventListener('click', () => { $('#cap-verify-out').textContent = 'Example: 10 records, 3 files. Every file matches its sha256 and every verified record points to packaged evidence. No code was run: running the tests of a capsule is a separate act of trust.'; });
    $('#cap-range').addEventListener('input', (e) => { clearInterval(capTimer); capsuleGo(+e.target.value); });
    $('#cap-play').addEventListener('click', () => { clearInterval(capTimer); let k = 0; capsuleGo(0); capTimer = setInterval(() => { if (++k >= CAPSULE.steps.length) return clearInterval(capTimer); capsuleGo(k); }, 1500); });
    $('#cap-fork').addEventListener('click', () => { clearInterval(capTimer); capBase = null; for (const k in st.src) if (st.src[k] === 'agent') st.src[k] = 'you'; ui.brick = 'accuracy'; setTab('source'); refresh(); });
  }
  function openCapsule() { location.hash = 'workshop'; setTab('capsule'); capBase = null; capsuleGo(0); }

  // --- companion ------------------------------------------------------------------
  const INTENTS = [
    ['Relax the structure', /relax|optimi|geom/i, 'I switch the task to relaxation. The optimiser follows the nature of the system.', [['Task', 'Energy → Relaxation']], () => blueprint.set('action', 'geopt', 'agent'), '(Relaxation) requires (Forces)'],
    ['Put the system in water', /water|solv/i, 'I add an implicit solvent, soft-sphere cavity parametrised for water.', [['Environment', 'Vacuum → Implicit water']], () => blueprint.set('solvent', 'water', 'agent'), '(Water) modelledBy (Soft-sphere cavity)'],
    ['Show the density and the HOMO', /densit|orbit|homo/i, 'I request the density as a cube file and one orbital around the Fermi level.', [['Observables', '+ density'], ['Observables', '+ 1 orbital']], () => { blueprint.set('density', true, 'agent'); blueprint.set('nplot', 1, 'agent'); }, '(Frontier orbital) writtenBy (nplot)'],
  ];
  function propose(it) {
    const card = h('div', { class: 'prop' }, h('span', {}, it[2]),
      h('div', { class: 'diff' }, it[3].map(([b, t]) => h('div', {}, h('span', {}, b + '  '), h('b', {}, t)))),
      h('div', { class: 'trip' }, 'memory: ' + it[5]),
      h('div', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn cta small', type: 'button', onclick: (e) => { it[4](); e.target.parentNode.replaceChildren(h('span', { style: 'color:var(--ok);font-size:12px' }, 'Approved. The values carry the “Agent” mark.')); } }, 'Approve'),
        h('button', { class: 'btn small', type: 'button', onclick: () => card.remove() }, 'Reject')));
    $('#agent-body').append(card); card.scrollIntoView({ block: 'nearest' });
  }
  function initAgent() {
    $('#agent-body').replaceChildren(h('p', { style: 'color:var(--fg-2);font-size:13px' }, 'The agent acts on the same blocks as you, through the same actions. Each proposal is a change to the blueprint that you approve or reject.'),
      h('div', { class: 'chips' }, INTENTS.map((it) => h('button', { class: 'chip', type: 'button', onclick: () => propose(it) }, it[0]))));
    $('#agent-open').addEventListener('click', () => { $('#agent').hidden = !$('#agent').hidden; });
    $('#agent-close').addEventListener('click', () => { $('#agent').hidden = true; });
    $('#agent-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#agent-input').value.trim(); if (!q) return;
      $('#agent-body').append(h('p', { style: 'text-align:right;font-size:13px' }, q));
      const it = INTENTS.find((x) => x[1].test(q));
      if (it) propose(it); else $('#agent-body').append(h('p', { style: 'color:var(--fg-2);font-size:13px' }, 'In this mock-up the agent knows three moves: relax, solvate, visualise. Try one of them.'));
      $('#agent-input').value = '';
    });
  }

  // --- publication ------------------------------------------------------------------
  const REF = {
    bigdft: 'L. Genovese et al., J. Chem. Phys. 129, 014109 (2008)', flex: 'L. E. Ratcliff et al., J. Chem. Phys. 152, 194110 (2020)',
    LDA: 'S. Goedecker, M. Teter, J. Hutter, Phys. Rev. B 54, 1703 (1996)', PBE: 'J. P. Perdew, K. Burke, M. Ernzerhof, Phys. Rev. Lett. 77, 3865 (1996)',
    PBE0: 'C. Adamo, V. Barone, J. Chem. Phys. 110, 6158 (1999)', B3LYP: 'A. D. Becke, J. Chem. Phys. 98, 5648 (1993)',
    hgh: 'C. Hartwigsen, S. Goedecker, J. Hutter, Phys. Rev. B 58, 3641 (1998)', linear: 'S. Mohr et al., J. Chem. Phys. 140, 204110 (2014)',
    solvent: 'G. Fisicaro et al., J. Chem. Phys. 144, 014103 (2016)', d3: 'S. Grimme, J. Antony, S. Ehrlich, H. Krieg, J. Chem. Phys. 132, 154104 (2010)',
    FIRE: 'E. Bitzek et al., Phys. Rev. Lett. 97, 170201 (2006)', SQNM: 'B. Schaefer et al., J. Chem. Phys. 142, 034112 (2015)',
    frag: 'W. Dawson et al., J. Chem. Theory Comput. 16, 2952 (2020)',
  };
  function renderPublication() {
    const v = st.v, sys = st.sys, refs = [], cite = (k) => { if (!REF[k]) return ''; if (!refs.includes(k)) refs.push(k); return ' [' + (refs.indexOf(k) + 1) + ']'; };
    let t = 'Electronic-structure calculations were performed with the BigDFT code' + cite('bigdft') + cite('flex') + ', which expands the Kohn-Sham orbitals in a Daubechies wavelet basis. ';
    t += 'The ' + v.xc + ' functional' + cite(v.xc) + ' was used with norm-conserving pseudopotentials' + cite('hgh') + '. ';
    t += 'The grid spacing is ' + fr(v.hgrid, 2) + ' bohr; the coarse and fine regions extend to ' + fr(v.crmult, 1) + ' and ' + fr(v.frmult, 1) + ' times the reference radii of the atoms. ';
    if (v.nspin === 2) t += 'The calculation is spin-polarised, with a total magnetic moment of ' + v.mpol + ' µB. ';
    if (sys.bc !== 'free' && v.kpt > 1) t += 'The Brillouin zone is sampled with a ' + (sys.bc === 'surface' ? v.kpt + '×1×' + v.kpt : v.kpt + '×' + v.kpt + '×' + v.kpt) + ' Monkhorst-Pack mesh. ';
    if (v.algo === 'linear') t += 'The linear-scaling formalism' + cite('linear') + ' is used, the density matrix being expressed on localised support functions. ';
    if (v.solvent !== 'none') t += 'The solvent is described as a dielectric continuum with a soft-sphere cavity, handled by the generalised Poisson solver' + cite('solvent') + '. ';
    if (v.dispersion) t += 'Dispersion interactions are corrected with the D3 scheme' + cite('d3') + '. ';
    if (v.action === 'geopt') t += 'Geometries were relaxed with the ' + v.geoptMethod + ' algorithm' + cite(v.geoptMethod) + (v.forcemax ? ' until forces fell below ' + fr(v.forcemax, 3) + ' Ha/bohr' : '') + '. ';
    if (v.action === 'frag') t += 'The fragment analysis follows the complexity-reduction framework' + cite('frag') + '. ';
    $('#methods').textContent = t;
    $('#refs').replaceChildren(...refs.map((k) => h('li', {}, REF[k])));
    const eq = $('#pub-eq');
    eq.replaceChildren(h('div', {}, '$$' + TEX.ks + '$$'), h('div', {}, '$$' + TEX.expansion + '$$'));
    if (v.solvent !== 'none') eq.append(h('div', {}, '$$' + TEX.poisson + '$$'));
    if (v.algo === 'linear') eq.append(h('div', {}, '$$' + TEX.kernel + '$$'));
    typeset(eq);
    const b = $('#fig-preset button[aria-pressed="true"]'), mm = +b.dataset.w, ratio = mm === 170 ? 0.5 : mm === 120 ? 1.25 : 0.75;
    const px = Math.round(mm / 25.4 * 600), w = Math.min(px, 1200);
    const shot = stage.snapshot(w, Math.round(w * ratio), '#ffffff');
    $('#fig-img').hidden = !shot; $('#fig-none').hidden = !!shot;
    if (shot) $('#fig-img').src = shot;
    $('#fig-size').textContent = fr(px) + ' × ' + fr(Math.round(px * ratio)) + ' px at 600 dpi';
  }
  function copy(text, btn) {
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1400); };
    try { navigator.clipboard.writeText(text).then(done, () => { btn.textContent = 'Select the text'; }); } catch (e) { btn.textContent = 'Select the text'; }
  }

  // --- guided paths: Jupyter notebooks turned into steps ---------------------------
  /* Browser storage keeps what an administrator added on this device only. In
   * production the notebook goes to the platform, and to the pack's sources. */
  const store = {
    get(k, d) { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : d; } catch (e) { return d; } },
    set(k, val) { try { localStorage.setItem(k, JSON.stringify(val)); return true; } catch (e) { return false; } },
  };
  const guides = { list: [], imported: store.get('ond.guides', []), draft: null, error: '', cur: null, step: 0, applied: new Set() };
  ui.admin = store.get('ond.admin', false) === true;
  const LEVELS = ['Discovery', 'Intermediate', 'Advanced'];
  const fmtMove = (m) => labelOf(m.key) + ' → ' + (m.value === true ? 'on' : m.key === 'action' ? ACTIONS.find((a) => a[0] === m.value)[1] : m.value);
  const count = (g) => ({ steps: g.steps.filter((x) => !x.setup).length, moves: g.steps.reduce((n, x) => n + x.moves.length, 0), setup: g.steps.reduce((n, x) => n + x.codes.filter((c) => c.setup).length, 0) });

  function buildGuides() {
    const make = (g, builtin) => { try { const parsed = OND.notebook.parse(g.notebook, g.id); return Object.assign({ builtin }, g, parsed, { title: g.title || parsed.title }); } catch (e) { return null; } };
    guides.list = (OND.guides || []).map((g) => make(g, true)).concat(guides.imported.map((g) => make(g, false))).filter(Boolean);
  }

  function readNotebook(file) {
    if (!file) return;
    guides.error = ''; guides.draft = null;
    if (file.size > 8e6) { guides.error = 'This file is ' + fr(file.size / 1e6, 1) + ' MB. Notebooks over 8 MB usually embed large outputs: clear the outputs in Jupyter and try again.'; return renderGuides(); }
    const reader = new FileReader();
    reader.onerror = () => { guides.error = 'The file could not be read. Choose it again.'; renderGuides(); };
    reader.onload = () => {
      try {
        let nb;
        try { nb = JSON.parse(reader.result); } catch (e) { throw new Error('This file is not valid JSON, so it is not a Jupyter notebook (.ipynb).'); }
        const parsed = OND.notebook.parse(nb, file.name.replace(/\.ipynb$/i, ''));
        guides.draft = { id: 'nb-' + Date.now().toString(36), file: file.name, title: parsed.title, level: 'Discovery', minutes: Math.max(5, Math.round(parsed.steps.length * 3 / 5) * 5), summary: '', origin: 'Added by an administrator', notebook: OND.notebook.strip(nb), parsed };
      } catch (e) { guides.error = e.message; }
      renderGuides();
    };
    reader.readAsText(file);
  }
  function publishDraft() {
    const d = guides.draft, entry = { id: d.id, title: d.title.trim() || d.parsed.title, level: d.level, minutes: d.minutes, summary: d.summary.trim() || 'Imported from ' + d.file + '.', origin: d.origin, notebook: d.notebook };
    guides.imported.push(entry);
    const saved = store.set('ond.guides', guides.imported);
    guides.draft = null; guides.error = saved ? '' : 'Published for this session. This browser refused to store it, so it will not be there after a reload.';
    buildGuides(); renderGuides();
  }

  function renderGuides() {
    $('#role').textContent = ui.admin ? 'Admin view' : 'Member view';
    $('#role').setAttribute('aria-pressed', String(ui.admin));
    $('#guides-admin').replaceChildren(...(ui.admin
      ? [h('input', { type: 'file', id: 'nb-file', accept: '.ipynb,application/json', hidden: true, onchange: (e) => { readNotebook(e.target.files[0]); e.target.value = ''; } }),
        h('button', { class: 'btn small cta', type: 'button', onclick: () => $('#nb-file').click() }, 'Add a notebook (.ipynb)')]
      : [h('span', { style: 'color:var(--fg-3);font-size:13px' }, 'each path is a Jupyter notebook')]));
    const review = $('#guides-review'), d = guides.draft;
    review.hidden = !(ui.admin && (d || guides.error));
    if (!review.hidden) {
      const kids = [];
      if (guides.error) kids.push(h('div', { class: 'notice err' }, h('b', {}, 'Not imported'), h('span', {}, guides.error)));
      if (d) {
        const c = count(d.parsed), moves = d.parsed.steps.flatMap((x) => x.moves), kept = [...new Set(d.parsed.steps.flatMap((x) => x.kept))];
        const field = (label, control) => h('label', { class: 'field' }, h('span', { class: 'label' }, label), control);
        kids.push(h('p', { class: 'label' }, 'Import review · ' + d.file),
          h('div', { class: 'fields' },
            field('Title', h('input', { id: 'gd-title', type: 'text', value: d.title, oninput: (e) => { d.title = e.target.value; } })),
            field('Level', h('select', { id: 'gd-level', onchange: (e) => { d.level = e.target.value; } }, LEVELS.map((l) => h('option', { value: l, selected: l === d.level }, l)))),
            field('Minutes', h('input', { id: 'gd-minutes', type: 'number', min: 5, max: 240, step: 5, value: d.minutes, oninput: (e) => { d.minutes = Math.max(5, Math.min(240, +e.target.value || 5)); } })),
            field('One-line summary', h('input', { id: 'gd-summary', type: 'text', value: d.summary, placeholder: 'What the learner will be able to do', oninput: (e) => { d.summary = e.target.value; } }))),
          h('p', { class: 'label', style: 'margin-top:6px' }, 'What the importer understood'),
          h('p', {}, c.steps + ' steps, cut at the headings of the notebook. ' + c.moves + ' PyBigDFT call' + (c.moves === 1 ? '' : 's') + ' become moves on the blueprint. ' + (c.setup ? c.setup + ' installation cell' + (c.setup === 1 ? '' : 's') + ' folded away: the workshop runs in the pack’s container. ' : '') + 'Outputs are ignored and nothing is executed.'),
          moves.length ? h('div', { class: 'chips' }, [...new Set(moves.map(fmtMove))].slice(0, 12).map((t) => h('span', { class: 'chip' }, t))) : h('p', { style: 'color:var(--fg-3);font-size:13px' }, 'No call was recognised: the path will be read-only, with its code shown.'),
          kept.length ? h('p', { style: 'color:var(--fg-3);font-size:13px' }, 'Kept as code, not replayed: ' + kept.slice(0, 10).join(', ') + (kept.length > 10 ? '…' : '') + '.') : null,
          h('ol', { class: 'steps-preview' }, d.parsed.steps.filter((x) => !x.setup).slice(0, 14).map((x) => h('li', {}, x.title + (x.moves.length ? ' · ' + x.moves.length + ' move' + (x.moves.length > 1 ? 's' : '') : '')))),
          h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
            h('button', { class: 'btn cta small', type: 'button', onclick: publishDraft }, 'Publish to the Library'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { guides.draft = null; guides.error = ''; renderGuides(); } }, 'Discard')));
      }
      review.replaceChildren(...kids);
    }
    $('#guides').replaceChildren(...guides.list.map((g) => {
      const c = count(g);
      return h('article', { class: 'tile' }, h('h3', {}, g.title), h('p', {}, g.summary),
        h('div', { class: 'meta' }, h('span', {}, g.level), h('span', {}, g.minutes + ' min'), h('span', {}, c.steps + ' steps'), c.moves ? h('span', {}, c.moves + (c.moves === 1 ? ' move' : ' moves')) : null),
        h('div', { class: 'foot' }, h('span', { class: 'chip' }, g.builtin ? 'BigDFT-school' : 'Added by admin'),
          h('span', { style: 'display:flex;gap:6px' },
            ui.admin && !g.builtin ? h('button', { class: 'btn small', type: 'button', onclick: () => { guides.imported = guides.imported.filter((x) => x.id !== g.id); store.set('ond.guides', guides.imported); if (guides.cur && guides.cur.id === g.id) guides.cur = null; buildGuides(); renderGuides(); renderGuide(); } }, 'Remove') : null,
            h('button', { class: 'btn small', type: 'button', onclick: () => startGuide(g) }, 'Start'))));
    }));
  }

  function startGuide(g) {
    guides.cur = g; guides.applied = new Set();
    guides.step = Math.max(0, g.steps.findIndex((x) => !x.setup));
    location.hash = 'workshop'; setTab('guide'); renderGuide();
  }
  function renderGuide() {
    const nav = $('#guide-nav'), box = $('#guide-step'), g = guides.cur;
    if (!g) {
      nav.replaceChildren(h('p', { class: 'label' }, 'Guided path'), h('p', { style: 'color:var(--fg-2);margin-top:8px' }, 'No path in progress. Guided paths are Jupyter notebooks: each step explains, and its PyBigDFT calls become moves on your blueprint.'),
        h('p', { style: 'margin-top:10px' }, h('a', { class: 'btn small', href: '#library' }, 'Choose a path in the Library')));
      box.replaceChildren();
      return;
    }
    const s = g.steps[guides.step], go = (i) => { guides.step = Math.max(0, Math.min(g.steps.length - 1, i)); renderGuide(); };
    nav.replaceChildren(h('p', { class: 'label' }, 'Guided path · ' + g.level),
      h('h3', { class: 'serif', style: 'font-size:22px;margin:4px 0 6px' }, g.title),
      h('p', { style: 'color:var(--fg-2);font-size:13px' }, 'Step ' + (guides.step + 1) + ' of ' + g.steps.length),
      h('div', { style: 'display:flex;gap:8px;margin:10px 0' },
        h('button', { class: 'btn small', type: 'button', disabled: guides.step === 0, onclick: () => go(guides.step - 1) }, 'Previous'),
        h('button', { class: 'btn small cta', type: 'button', disabled: guides.step === g.steps.length - 1, onclick: () => go(guides.step + 1) }, 'Next')),
      h('ol', { class: 'step-list' }, g.steps.map((x, i) => h('li', {}, h('button', { type: 'button', 'aria-current': i === guides.step ? 'step' : null, onclick: () => go(i) }, x.title + (x.setup ? ' (setup)' : ''))))));
    const kids = [h('h3', {}, s.title)];
    if (s.md) kids.push(h('div', { class: 'md', html: OND.notebook.markdown(s.md) }));
    for (const c of s.codes) kids.push(c.setup
      ? h('details', {}, h('summary', {}, 'Installation cell, not needed here: the workshop runs in the pack’s container'), h('pre', {}, c.src))
      : h('pre', {}, c.src));
    if (s.moves.length) {
      kids.push(h('p', { class: 'label', style: 'margin-top:10px' }, 'Moves on your blueprint'));
      s.moves.forEach((m, i) => {
        const id = guides.step + ':' + i, done = guides.applied.has(id);
        kids.push(h('div', { class: 'move' }, h('code', {}, m.call.length > 44 ? m.call.slice(0, 43) + '…' : m.call), h('span', {}, fmtMove(m)),
          h('span', { style: 'display:flex;gap:6px' },
            h('button', { class: 'btn small' + (done ? '' : ' cta'), type: 'button', onclick: () => { guides.applied.add(id); blueprint.set(m.key, m.value, 'guide'); renderGuide(); } }, done ? 'Applied' : 'Apply'),
            h('button', { class: 'btn small', type: 'button', onclick: () => reveal(m.key) }, 'See parameter'))));
      });
    }
    if (s.kept.length) kids.push(h('p', { style: 'color:var(--fg-3);font-size:12px;margin-top:8px' }, 'Shown as code, not replayed by the workshop: ' + s.kept.join(', ') + '.'));
    box.replaceChildren(...kids);
    box.scrollTop = 0;
    typeset(box);
  }

  // --- routing and wiring ---------------------------------------------------------
  const VIEWS = ['workshop', 'study', 'library', 'lab', 'compute', 'publish'];
  function route() {
    const name = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'workshop';
    VIEWS.forEach((n) => { $('#view-' + n).hidden = n !== name; });
    $$('.spaces a').forEach((a) => { if (a.getAttribute('href') === '#' + name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (name === 'publish') renderPublication();
    if (name === 'lab') typeset($('#view-lab'));
    if (name === 'study') { if ($('#study-mine').hidden) OND.studyView.refresh(); else OND.builder.render(); }
    if (name === 'library') renderGuides();
  }

  let queued = false;
  function refresh() {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderRail(); renderStageMeta(); renderSource(); renderPins();
      if (!ui.drag) renderInspector();
      syncStage();
      if (!$('#view-publish').hidden) renderPublication();
    });
  }

  blueprint.on(refresh);
  stage.onPick = (i) => { ui.sel = i; if (i != null) ui.brick = 'matter'; refresh(); syncStage(); };
  stage.onFrame = () => {
    for (const el of $('#pins').children) {
      const p = stage.project(st.sys.atoms[el.note.i].p);
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.hidden = !p.visible;
    }
  };
  $('#viewbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tog'); if (!b || b.disabled) return;
    const k = b.dataset.view, w = ui.view; w[k] = !w[k];
    if (k === 'density' && w[k]) w.orbital = false;
    if (k === 'orbital' && w[k]) w.density = false;
    if (k === 'fragment') stage.setOptions({ colorBy: w[k] ? 'fragment' : 'element' });
    if (k === 'ghosts') stage.setOptions({ ghosts: w[k] });
    if (k === 'vdw') stage.setOptions({ style: w[k] ? 'vdw' : 'ball' });
    refresh(); syncStage(k === 'fragment' || k === 'ghosts' || k === 'vdw');
  });
  $('#depth').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ui.depth = +b.dataset.depth; renderInspector(); } });
  $('#launch').addEventListener('click', run);
  $('#dryrun').addEventListener('click', dryRun);
  $('#lab-note').addEventListener('click', () => { loadSystem('si64'); addNote(17, 'would a vacancy here change the gap?', 'Inès', true); location.hash = 'workshop'; });
  let resizing = null;
  window.addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { if (!$('#view-study').hidden) OND.studyView.refresh(); }, 180); });
  $$('#dock .tab').forEach((t) => t.addEventListener('click', () => { setTab(t.dataset.tab); if (t.dataset.tab === 'capsule' && st.sys.id !== 'gr-bz') { capBase = null; capsuleGo(0); } }));
  $('#dock-toggle').addEventListener('click', (e) => { const closed = $('#dock').classList.toggle('closed'); e.target.textContent = closed ? 'Expand' : 'Collapse'; });
  $$('[data-capsule]').forEach((b) => b.addEventListener('click', openCapsule));
  $$('[data-load]').forEach((b) => b.addEventListener('click', () => { loadSystem(b.dataset.load); location.hash = 'workshop'; }));
  $('#paper-build').addEventListener('click', () => {
    loadSystem('si64');
    editAtoms((A) => { A[17].el = 'P'; });
    blueprint.set('xc', 'PBE', 'paper'); blueprint.set('hgrid', 0.4, 'paper'); blueprint.set('kpt', 2, 'paper');
    blueprint.set('action', 'geopt', 'paper'); blueprint.set('forcemax', 0.005, 'paper');
    ui.brick = 'theory'; location.hash = 'workshop';
  });
  $('#fig-preset').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('#fig-preset button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderPublication(); });
  $('#copy-methods').addEventListener('click', (e) => copy($('#methods').textContent, e.target));
  $('#copy-refs').addEventListener('click', (e) => copy($$('#refs li').map((li, i) => '[' + (i + 1) + '] ' + li.textContent).join('\n'), e.target));
  window.addEventListener('hashchange', route);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeColors);
  new MutationObserver(themeColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  $('#role').addEventListener('click', () => { ui.admin = !ui.admin; store.set('ond.admin', ui.admin); guides.draft = null; guides.error = ''; renderGuides(); });
  OND.studyView.mount({ h, $, typeset, openInWorkshop: openRecorded });
  /* The study a user builds starts from the blueprint of the workshop: its settings become the script's blueprint(). */
  OND.builder.mount({ h, $, base: () => ({ system: st.sys.name, file: blueprint.input().file, lines: blueprint.python().filter((l) => l.startsWith('inp.')), mpi: st.v.mpi, omp: st.v.omp, cost: '≈ ' + duration(blueprint.derived().seconds) + ' on ' + st.v.mpi * st.v.omp + ' cores' }) });
  const studyMode = (mode) => {
    $$('#study-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('#study-real').hidden = mode !== 'real'; $('#study-mine').hidden = mode !== 'mine';
    if (mode === 'mine') OND.builder.render(); else OND.studyView.refresh();
  };
  $('#study-mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) studyMode(b.dataset.mode); });
  $('#mine-example').addEventListener('click', () => OND.builder.example());
  $('#mine-reset').addEventListener('click', () => OND.builder.reset());
  { const c = OND.study.capsule; $('#real-capsule-meta').replaceChildren(h('span', {}, c.records.length + ' records'), h('span', {}, c.inventory.files + ' files'), h('span', {}, 'extends a parent capsule')); }
  themeColors(); initCapsule(); initAgent(); buildGuides(); renderGuides(); renderGuide();
  loadSystem('c60');
  ui.view.orbital = true; // open on a characteristic picture: a frontier orbital of C60
  refresh(); syncStage(true); route();
})(window.OND);
