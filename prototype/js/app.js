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
  const fr = (x, n) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: n || 0, maximumFractionDigits: n == null ? 3 : n });
  const sub = (s) => String(s).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const { EL } = OND.chem;
  const recipe = OND.Recipe(), P = recipe.PARAMS, st = recipe.st;
  const stage = OND.Stage($('#stage'));
  const SCHEMA = OND.schema.variables;
  const ui = { brick: 'matiere', depth: 0, view: { grid: false, density: false, orbital: false, fragment: false, ghosts: true, vdw: false }, sel: null, undo: [], drag: false, ran: false, query: '' };

  const icon = (d) => '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const BRICKS = [
    ['matiere', 'Matière', 'Les atomes, la cellule et ses conditions aux limites.', icon('<circle cx="6" cy="12" r="3"/><circle cx="14.500" cy="6" r="2.300"/><circle cx="14" cy="15.500" r="1.800"/><path d="M8.600 10.400l3.800-3M8.900 13l3.400 1.700"/>')],
    ['theorie', 'Théorie', 'Le niveau de description des électrons.', icon('<path d="M10 3v14M4 5c0 5 2 7 6 7s6-2 6-7"/>')],
    ['precision', 'Précision', 'La grille d’ondelettes et la convergence.', icon('<path d="M3 3h14v14H3zM3 10h14M10 3v14M10 6.500h3.500M10 13.500h3.500M13.500 10V3M6.500 10v7" stroke-width="1.200"/>')],
    ['milieu', 'Milieu', 'Ce qui entoure le système : périodicité, solvant, champ.', icon('<path d="M2 7c2-2 4-2 6 0s4 2 6 0 3-1.500 4-1M2 13c2-2 4-2 6 0s4 2 6 0 3-1.500 4-1"/>')],
    ['action', 'Action', 'Ce que l’on demande au calcul.', icon('<path d="M6 4l9 6-9 6z"/>')],
    ['mesures', 'Mesures', 'Ce que l’on veut observer à la fin.', icon('<path d="M3 17h14M5.500 14V9M10 14V4M14.500 14v-7"/>')],
    ['machine', 'Machine', 'Où le calcul tourne, et pour quel budget.', icon('<rect x="5" y="5" width="10" height="10" rx="1.500"/><path d="M8 2v3M12 2v3M8 15v3M12 15v3M2 8h3M2 12h3M15 8h3M15 12h3"/>')],
  ];
  const SRC = { defaut: 'Défaut BigDFT', adapte: 'Adapté', vous: 'Vous', agent: 'Compagnon', article: 'Article' };
  const BC = { free: 'isolé', surface: 'surface (x, z périodiques)', periodic: 'périodique' };
  const ACTIONS = [['sp', 'Énergie', 'Un point : énergie et forces'], ['geopt', 'Relaxation', 'Trouver la géométrie d’équilibre'], ['md', 'Dynamique', 'Suivre le mouvement des atomes'], ['neb', 'Chemin', 'Barrière entre deux états'], ['tddft', 'Excitations', 'Spectre d’absorption'], ['frag', 'Fragments', 'Ce qui lie les parties']];

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
    recipe.clear();
    recipe.setSystem(sys);
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
    recipe.touchSystem();
    stage.setSystem(st.sys, true);
    syncStage(true);
  }
  function undoEdit() {
    if (!ui.undo.length) return;
    st.sys.atoms = JSON.parse(ui.undo.pop());
    st.sys.edited = ui.undo.length > 0; ui.sel = null;
    recipe.touchSystem(); stage.setSystem(st.sys, true); syncStage(true);
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
  }

  // --- rail -----------------------------------------------------------------
  function summary(id) {
    const v = st.v, sys = st.sys;
    switch (id) {
      case 'matiere': return formula() + ' · ' + sys.atoms.length + ' atomes · ' + BC[sys.bc].split(' ')[0];
      case 'theorie': return [v.xc, v.nspin === 1 ? 'sans spin' : 'spin, ' + v.mpol + ' µB', v.charge ? 'charge ' + (v.charge > 0 ? '+' : '') + v.charge : null, v.dispersion ? 'D3' : null].filter(Boolean).join(' · ');
      case 'precision': return 'h ' + fr(v.hgrid, 2) + ' · ' + fr(v.crmult) + '/' + fr(v.frmult) + ' · ' + (v.algo === 'linear' ? 'linéaire' : 'cubique');
      case 'milieu': return [sys.bc !== 'free' ? 'k ' + (sys.bc === 'surface' ? v.kpt + '×1×' + v.kpt : v.kpt + '×' + v.kpt + '×' + v.kpt) : 'vide', v.solvent !== 'none' ? { water: 'eau', ethanol: 'éthanol', mesitylene: 'mésitylène' }[v.solvent] : null, v.efield ? 'champ' : null, v.scf === 'mixing' ? 'mélange' : null].filter(Boolean).join(' · ');
      case 'action': return ACTIONS.find((a) => a[0] === v.action)[1] + (v.action === 'geopt' ? ' ' + v.geoptMethod : v.action === 'md' ? ' ' + v.mdSteps + ' pas' : '');
      case 'mesures': return [v.dos && 'DOS', v.density && 'densité', v.nplot && v.nplot + ' orbitale' + (v.nplot > 1 ? 's' : ''), v.dipole && 'dipôle', v.charges && 'charges'].filter(Boolean).join(', ') || 'énergie seule';
      case 'machine': return recipe.TARGETS[v.target].label.replace('Conteneur ', '') + ' · ' + v.mpi + '×' + v.omp + ' cœurs';
    }
  }
  const duration = (s) => (s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : fr(s / 3600, 1) + ' h');

  function renderRail() {
    const checks = recipe.checks(), d = recipe.derived(), box = $('#bricks');
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
    $('#estimate').replaceChildren(
      h('dt', {}, 'Durée'), h('dd', { class: 'num' }, '≈ ' + duration(d.seconds)),
      h('dt', {}, 'Coût'), h('dd', { class: 'num' }, '≈ ' + fr(d.credits, d.credits < 10 ? 1 : 0) + ' crédits'),
      h('dt', {}, 'Mémoire'), h('dd', { class: 'num' }, '≈ ' + fr(d.mem, d.mem < 10 ? 1 : 0) + ' Go'));
    const btn = $('#launch');
    btn.disabled = bad > 0;
    btn.textContent = bad ? 'Recette incomplète' : 'Lancer le calcul';
    btn.title = checks.filter((c) => c.level !== 'ok').map((c) => c.text).join('\n');
  }

  function renderStageMeta() {
    const sys = st.sys, d = recipe.derived();
    $('#sys-name').textContent = sys.name + (sys.edited ? ', modifié' : '');
    $('#sys-blurb').textContent = sys.blurb;
    $('#sys-chips').replaceChildren(...[formula(), sys.atoms.length + ' atomes', d.ne + ' e⁻ de valence', BC[sys.bc]].concat(sys.traits).map((t) => h('span', { class: 'chip' }, t)));
    const w = ui.view;
    $$('#viewbar .tog').forEach((b) => {
      const k = b.dataset.view;
      b.setAttribute('aria-pressed', String(!!w[k]));
      b.disabled = (k === 'fragment' && !sys.fragments) || (k === 'orbital' && !sys.orbital) || (k === 'ghosts' && sys.bc === 'free');
    });
    const L = $('#legend'), css = (n) => 'background:var(' + n + ')';
    if (w.grid) L.replaceChildren(h('span', {}, h('i', { style: css('--fg-3') }), 'région grossière : fonctions d’échelle'), h('span', {}, h('i', { style: css('--accent') }), 'région fine : 7 ondelettes de plus par point'));
    else if (w.orbital) L.replaceChildren(h('span', {}, h('i', { style: css('--pos') }), 'phase +'), h('span', {}, h('i', { style: css('--neg') }), 'phase −'), h('span', {}, sys.orbital.label + ' · illustration'));
    else if (w.density) L.replaceChildren(h('span', {}, h('i', { style: css('--accent') }), 'isosurface de densité · illustration'));
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
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, EL[at.el].name + ' · atome ' + (i + 1)), h('button', { class: 'btn small', type: 'button', onclick: () => { ui.sel = null; refresh(); syncStage(); } }, 'Fermer')),
      h('span', { class: 'label' }, 'Substituer par'),
      h('div', { class: 'row' }, Object.keys(EL).filter((e) => e !== at.el).map((e) => h('button', { class: 'el', type: 'button', title: EL[e].name, onclick: () => editAtoms((A) => { A[i].el = e; }) }, e))),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => editAtoms((A) => { A.splice(i, 1); }) }, 'Créer une lacune')));
  }

  // --- inspector ---------------------------------------------------------------
  const seg = (opts, cur, on) => h('div', { class: 'seg' }, opts.map(([val, label]) => h('button', { type: 'button', 'aria-pressed': String(val === cur), onclick: () => on(val) }, label)));

  function ctl(def) {
    const k = def.k, v = st.v[k], src = st.src[k], why = st.why[k];
    let body;
    if (def.type === 'seg') body = seg(def.opts, v, (val) => recipe.set(k, val));
    else if (def.type === 'cards') body = h('div', { class: 'cards' }, def.opts.map(([val, label, text]) => h('button', { class: 'card', type: 'button', 'aria-pressed': String(val === v), onclick: () => recipe.set(k, val) }, h('b', {}, label), h('span', {}, text))));
    else if (def.type === 'toggle') body = h('div', { class: 'ctl-val' }, h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!v), 'aria-label': def.label, onclick: () => recipe.set(k, !v) }), h('span', { style: 'color:var(--fg-2);font-size:13px' }, def.text ? def.text(v) : v ? 'activée' : 'désactivée'));
    else if (def.type === 'step') body = h('div', { class: 'ctl-val' }, h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Diminuer', onclick: () => recipe.set(k, Math.max(def.min, v - (def.step || 1))) }, '−'),
      h('output', {}, def.fmt ? def.fmt(v) : String(v)),
      h('button', { type: 'button', 'aria-label': 'Augmenter', onclick: () => recipe.set(k, Math.min(def.max, v + (def.step || 1))) }, '+')), def.unit ? h('span', { style: 'color:var(--fg-3);font-size:12px' }, def.unit) : null);
    else {
      const out = h('output', {}, fr(v, def.dec) + ' ' + def.unit);
      body = h('div', { class: 'ctl-val' }, h('input', {
        type: 'range', id: 'ctl-' + k, min: def.min, max: def.max, step: def.step, value: v, 'aria-label': def.label,
        oninput: (e) => { ui.drag = true; out.textContent = fr(+e.target.value, def.dec) + ' ' + def.unit; recipe.set(k, +e.target.value); },
        onchange: () => { ui.drag = false; refresh(); },
      }), out);
    }
    const user = ['vous', 'agent', 'article'].includes(src);
    return h('div', { class: 'ctl' },
      h('div', { class: 'ctl-head' }, h('b', {}, def.label), P[k][1] ? h('code', {}, P[k][1]) : null),
      body,
      def.help ? h('p', { style: 'font-size:12px;color:var(--fg-3)' }, def.help) : null,
      h('div', { class: 'prov' }, h('span', { class: 'src-chip src-' + src }, SRC[src]),
        h('div', {}, why ? why.reason : src === 'defaut' ? 'Valeur d’origine du code.' : '',
          why ? h('div', { class: 'trip', html: '(' + esc(why.triplet[0]) + ') <em>' + esc(why.triplet[1]) + '</em> (' + esc(why.triplet[2]) + ')' }) : null,
          user ? h('button', { class: 'btn small', type: 'button', style: 'margin-top:4px', onclick: () => recipe.reset(k) }, 'Revenir au conseil') : null)));
  }

  function controls(id) {
    const v = st.v, sys = st.sys, per = sys.bc !== 'free';
    switch (id) {
      case 'theorie': return [
        { k: 'xc', label: 'Échange-corrélation', type: 'seg', opts: [['LDA', 'LDA'], ['PBE', 'PBE'], ['PBE0', 'PBE0'], ['B3LYP', 'B3LYP'], ['HF', 'Hartree-Fock']] },
        { k: 'charge', label: 'Charge totale', type: 'step', min: -4, max: 4, fmt: (x) => (x > 0 ? '+' : '') + x, unit: 'e' },
        { k: 'nspin', label: 'Spin', type: 'seg', opts: [[1, 'Non polarisé'], [2, 'Colinéaire'], [4, 'Non colinéaire']] },
        v.nspin !== 1 && { k: 'mpol', label: 'Moment magnétique total', type: 'step', min: 0, max: 12, unit: 'µB' },
        { k: 'dispersion', label: 'Dispersion (D3 de Grimme)', type: 'toggle' },
      ];
      case 'precision': return [
        { k: 'hgrid', label: 'Pas de la grille', type: 'range', min: 0.25, max: 0.65, step: 0.01, dec: 2, unit: 'bohr', help: 'Plus le pas est petit, plus la base est riche. Activez « Grille d’ondelettes » dans la scène pour la voir se resserrer.' },
        { k: 'crmult', label: 'Étendue de la région grossière', type: 'range', min: 3, max: 10, step: 0.5, dec: 1, unit: '× rayon' },
        { k: 'frmult', label: 'Étendue de la région fine', type: 'range', min: 4, max: 12, step: 0.5, dec: 1, unit: '× rayon' },
        { k: 'gnrm', label: 'Critère de convergence', type: 'seg', opts: [[1e-3, '10⁻³'], [1e-4, '10⁻⁴'], [1e-5, '10⁻⁵'], [1e-6, '10⁻⁶']] },
        { k: 'algo', label: 'Algorithme', type: 'seg', opts: [['cubic', 'Cubique'], ['linear', 'Linéaire']], help: 'Cubique : orbitales étendues, référence de précision. Linéaire : fonctions support localisées, pour les grands systèmes.' },
      ];
      case 'milieu': return [
        per && { k: 'kpt', label: 'Points k (Monkhorst-Pack)', type: 'step', min: 1, max: 8, fmt: (n) => (sys.bc === 'surface' ? n + '×1×' + n : n + '×' + n + '×' + n) },
        { k: 'solvent', label: 'Solvant implicite', type: 'seg', opts: [['none', 'Vide'], ['water', 'Eau'], ['ethanol', 'Éthanol'], ['mesitylene', 'Mésitylène']] },
        { k: 'efield', label: 'Champ électrique selon y', type: 'range', min: -0.01, max: 0.01, step: 0.001, dec: 3, unit: 'Ha/bohr' },
        { k: 'scf', label: 'Schéma auto-cohérent', type: 'seg', opts: [['dirmin', 'Minimisation directe'], ['mixing', 'Mélange de densité']] },
        (ui.depth > 0 || v.scf === 'mixing') && { k: 'tel', label: 'Température électronique', type: 'range', min: 0, max: 0.03, step: 0.001, dec: 3, unit: 'Ha' },
      ];
      case 'action': return [
        { k: 'action', label: 'Que voulez-vous obtenir ?', type: 'cards', opts: ACTIONS },
        v.action === 'geopt' && { k: 'geoptMethod', label: 'Optimiseur', type: 'seg', opts: [['FIRE', 'FIRE'], ['SQNM', 'SQNM'], ['LBFGS', 'L-BFGS'], ['DIIS', 'DIIS']] },
        v.action === 'geopt' && { k: 'geoptSteps', label: 'Nombre maximal de pas', type: 'step', min: 10, max: 500, step: 10 },
        v.action === 'geopt' && { k: 'forcemax', label: 'Arrêt sur la force maximale', type: 'range', min: 0, max: 0.02, step: 0.001, dec: 3, unit: 'Ha/bohr' },
        v.action === 'geopt' && (ui.depth > 0 || v.biomode) && { k: 'biomode', label: 'Mode biomolécule', type: 'toggle' },
        v.action === 'md' && { k: 'mdSteps', label: 'Nombre de pas', type: 'step', min: 50, max: 5000, step: 50 },
        v.action === 'md' && { k: 'mdT', label: 'Température', type: 'range', min: 0, max: 1000, step: 10, dec: 0, unit: 'K' },
        v.action === 'md' && { k: 'mdDt', label: 'Pas de temps', type: 'range', min: 5, max: 60, step: 1, dec: 0, unit: 'u.a.', help: '20,67 u.a. valent 0,5 fs.' },
        v.action === 'md' && { k: 'thermostat', label: 'Thermostat', type: 'seg', opts: [['none', 'Aucun (NVE)'], ['nose_hoover_chain', 'Nosé-Hoover']] },
        v.action === 'neb' && { k: 'nimg', label: 'Images le long du chemin', type: 'step', min: 3, max: 31, step: 2 },
        v.action === 'tddft' && { k: 'tddft', label: 'Approche', type: 'seg', opts: [['TDA', 'Tamm-Dancoff'], ['full', 'Casida complet']] },
        v.action === 'tddft' && { k: 'nvirt', label: 'États virtuels', type: 'step', min: 2, max: 64, step: 2 },
      ];
      case 'mesures': return [
        { k: 'dos', label: 'Densité d’états', type: 'toggle', text: (x) => (x ? 'tracée après le calcul' : 'non tracée') },
        { k: 'density', label: 'Densité électronique', type: 'toggle', text: (x) => (x ? 'écrite au format cube' : 'non écrite') },
        { k: 'nplot', label: 'Orbitales autour du niveau de Fermi', type: 'step', min: 0, max: 8 },
        { k: 'dipole', label: 'Moment dipolaire', type: 'toggle' },
        { k: 'charges', label: 'Charges et multipôles atomiques', type: 'toggle' },
      ];
      case 'machine': return [
        { k: 'target', label: 'Cible', type: 'cards', opts: Object.entries(recipe.TARGETS).map(([id2, t]) => [id2, t.label, t.detail]) },
        { k: 'mpi', label: 'Processus MPI', type: 'step', min: 1, max: 128, step: 1 },
        { k: 'omp', label: 'Fils OpenMP par processus', type: 'step', min: 1, max: 16 },
      ];
    }
    return [];
  }

  const EQ = {
    theorie: ['Les électrons sont décrits par les équations de Kohn-Sham ; la fonctionnelle choisie fixe $V_{xc}$.', '$$\\Big[-\\tfrac12\\nabla^2+V_{\\mathrm H}[\\rho]+V_{xc}[\\rho]+V_{\\mathrm{ext}}\\Big]\\psi_i=\\varepsilon_i\\,\\psi_i$$'],
    precision: ['Chaque orbitale est développée sur des fonctions d’échelle $\\phi$ partout, et sur 7 ondelettes $\\psi^{\\nu}$ par point dans la région fine.', '$$\\psi(\\mathbf r)=\\sum_{i}s_{i}\\,\\phi_{i}(\\mathbf r)+\\sum_{j}\\sum_{\\nu=1}^{7}d_{j}^{\\nu}\\,\\psi_{j}^{\\nu}(\\mathbf r)\\qquad N_{\\mathrm{ddl}}=N_c+7N_f$$'],
    milieu: ['Le solvant implicite entre par une permittivité $\\epsilon(\\mathbf r)$ dans l’équation de Poisson généralisée.', '$$\\nabla\\!\\cdot\\!\\big[\\epsilon(\\mathbf r)\\,\\nabla\\phi(\\mathbf r)\\big]=-4\\pi\\rho(\\mathbf r)$$'],
    action: ['Relaxation et dynamique suivent les forces sur les noyaux.', '$$\\mathbf F_I=-\\frac{\\partial E}{\\partial \\mathbf R_I}\\qquad M_I\\ddot{\\mathbf R}_I=\\mathbf F_I$$'],
  };
  function typeset(el) {
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {});
    else setTimeout(() => typeset(el), 400);
  }

  function schemaRow(vr) {
    const cur = st.expert[vr.p], set = cur !== undefined;
    const parse = (s) => { if (s === '') return ''; try { return JSON.parse(s); } catch (e) { return s; } };
    const field = vr.e
      ? h('select', { class: set ? 'set' : '', 'aria-label': vr.p, onchange: (e) => recipe.setExpert(vr.p, e.target.value === String(vr.d) ? '' : parse(e.target.value)) }, vr.e.map((o) => h('option', { value: String(o), selected: String(set ? cur : vr.d) === String(o) }, String(o))))
      : h('input', { class: set ? 'set' : '', 'aria-label': vr.p, value: set ? (typeof cur === 'string' ? cur : JSON.stringify(cur)) : '', placeholder: typeof vr.d === 'string' ? vr.d : JSON.stringify(vr.d), onchange: (e) => recipe.setExpert(vr.p, parse(e.target.value.trim())) });
    return h('div', { class: 'vrow' }, h('code', {}, vr.p), field, h('small', {}, vr.c + (vr.r ? ' · de ' + vr.r[0] + ' à ' + vr.r[1] : '') + (vr.if ? ' · dépend de ' + vr.if : '')));
  }

  function renderInspector() {
    const b = BRICKS.find((x) => x[0] === ui.brick), body = $('#insp-body'), sys = st.sys;
    $('#insp-title').textContent = b[1]; $('#insp-role').textContent = b[2];
    $$('#depth button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.depth === ui.depth)));
    const kids = [];
    if (ui.depth < 2) {
      if (ui.brick === 'matiere') {
        kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Point de départ')),
          h('div', { class: 'cards' }, OND.chem.list.map(([id, name]) => h('button', { class: 'card', type: 'button', 'aria-pressed': String(sys.id === id), onclick: () => loadSystem(id) }, h('b', {}, name), h('span', {}, { h2o: 'molécule', c60: 'molécule, 60 atomes', 'gr-bz': 'surface, 72 atomes', si64: 'cristal, 64 atomes', ala20: 'biologie, 203 atomes' }[id])))),
          h('div', { class: 'chips' }, ['Importer XYZ, PDB, CIF', 'Dessiner', 'Bases de structures'].map((t) => h('span', { class: 'chip' }, t)))));
        kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Conditions aux limites'), h('code', {}, 'posinp.cell')),
          seg([['free', 'Isolé'], ['surface', 'Surface'], ['periodic', 'Périodique']], sys.bc, () => {}),
          h('p', { style: 'font-size:12px;color:var(--fg-3)' }, sys.bc === 'surface' ? 'Périodique selon x et z, libre selon y : la convention de BigDFT pour les surfaces. Cellule ' + fr(sys.cell[0], 2) + ' × ∞ × ' + fr(sys.cell[2], 2) + ' Å.' : sys.bc === 'periodic' ? 'Cellule orthorhombique de ' + sys.cell.map((c) => fr(c, 2)).join(' × ') + ' Å.' : 'Aucune image périodique : le potentiel est résolu avec les vraies conditions du vide.')));
        kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Modifier')),
          h('p', { style: 'font-size:13px;color:var(--fg-2)' }, 'Cliquez un atome dans la scène pour le substituer ou le retirer. La recette se réadapte : essayez de doper le silicium avec un phosphore.'),
          ui.undo.length ? h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: undoEdit }, 'Annuler la dernière modification (' + ui.undo.length + ')')) : null));
        if (sys.fragments) kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'Fragments'), h('code', {}, sys.fragments.length + ' définis')), h('p', { style: 'font-size:13px;color:var(--fg-2)' }, sys.fragments.slice(0, 4).join(', ') + (sys.fragments.length > 4 ? '…' : '') + '. Activez « Fragments » dans la scène pour les colorer.')));
      } else kids.push(...controls(ui.brick).filter(Boolean).map(ctl));
      const adv = st.advice.filter((a) => P[a.key][2] === ui.brick);
      for (const a of adv) kids.push(h('div', { class: 'advice' }, h('b', {}, 'Le conseil diffère de votre choix'), h('span', {}, a.reason), h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => recipe.reset(a.key) }, 'Suivre le conseil'))));
      const mine = recipe.checks().filter((c) => c.block === ui.brick && c.level !== 'ok');
      for (const c of mine) kids.push(h('div', { class: 'advice', style: c.level === 'err' ? 'border-color:var(--err)' : '' }, h('b', {}, c.level === 'err' ? 'À corriger' : 'À savoir'), h('span', {}, c.text)));
      if (EQ[ui.brick]) { const eq = h('div', { class: 'eq' }, h('p', {}, EQ[ui.brick][0]), h('div', {}, EQ[ui.brick][1])); kids.push(eq); setTimeout(() => typeset(eq), 0); }
      if (ui.depth === 1) {
        const rows = SCHEMA.filter((x) => x.b === ui.brick && x.t === 1);
        if (rows.length) kids.push(h('p', { class: 'label', style: 'margin-top:18px' }, 'Réglages avancés · ' + rows.length), ...rows.map(schemaRow));
      }
    } else {
      const q = ui.query.toLowerCase();
      const rows = SCHEMA.filter((x) => (q ? (x.p + ' ' + x.c).toLowerCase().includes(q) : x.b === ui.brick));
      kids.push(h('input', { class: 'vsearch', id: 'vsearch', type: 'search', placeholder: 'Chercher parmi les ' + SCHEMA.length + ' variables de BigDFT', value: ui.query, 'aria-label': 'Chercher une variable', oninput: (e) => { ui.query = e.target.value; renderInspector(); const s = $('#vsearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }),
        h('p', { class: 'count' }, q ? rows.length + ' résultat' + (rows.length > 1 ? 's' : '') + ' dans tout le code' : rows.length + ' variables rattachées à cette brique, extraites de la source de BigDFT'),
        ...rows.slice(0, 80).map(schemaRow));
    }
    body.replaceChildren(...kids);
  }

  // --- source -----------------------------------------------------------------
  function renderSource() {
    $('#yaml').innerHTML = recipe.yaml().map((l) => {
      const pad = '  '.repeat(l.ind);
      if (l.note) return pad + '<span class="c"># ' + esc(l.note) + '</span>';
      if (l.item) return pad + '- <span class="k">' + l.item + '</span>: ' + l.val;
      return pad + '<span class="k">' + esc(l.k) + '</span>:' + (l.val != null ? ' ' + esc(l.val) : '') + (l.c ? '  <span class="c"># ' + esc(l.c) + '</span>' : '');
    }).join('\n');
    $('#python').innerHTML = recipe.python().map((l) => esc(l).replace(/("[^"]*")/g, '<span class="s">$1</span>').replace(/^(from|import|print)\b/, '<span class="k">$1</span>').replace(/\b(inp|code|log)\.(\w+)/g, '$1.<span class="k">$2</span>')).join('\n');
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
    $('#results').replaceChildren(h('p', { class: 'label' }, 'Résultats'), h('p', { style: 'color:var(--fg-2);margin-top:8px' }, 'Lancez le calcul : la convergence s’affiche ici en direct, puis les observables demandées dans la brique Mesures.'));
  }
  function setTab(name) {
    $$('#dock .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('#dock [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    $('#dock').classList.remove('closed'); $('#dock-toggle').textContent = 'Replier';
  }
  function run() {
    const v = st.v, d = recipe.derived(), sys = st.sys, rand = rng(sys.atoms.length * 7919 + Math.round(v.hgrid * 100));
    resetRun(); setTab('run');
    const outer = ['geopt', 'md', 'neb'].includes(v.action);
    const names = ['File d’attente', 'Conteneur prêt', 'Cycle auto-cohérent'].concat(outer ? [{ geopt: 'Relaxation', md: 'Dynamique', neb: 'Chemin' }[v.action]] : [], ['Analyse']);
    const pills = names.map((n) => h('span', { class: 'step' }, n));
    $('#run-steps').replaceChildren(...pills, h('span', { class: 'pill example' }, 'valeurs d’exemple'));
    const mark = (i) => pills.forEach((p, j) => { p.className = 'step' + (j < i ? ' done' : j === i ? ' on' : ''); });
    const n = Math.min(d.iters, 44), goal = Math.log10(v.gnrm), xs = [], ys = [];
    let i = 0, phase = 0, fx = [], fy = [];
    mark(0);
    runTimer = setInterval(() => {
      if (phase === 0) { if (++i > 6) { phase = 1; i = 0; mark(2); } else if (i === 3) mark(1); return; }
      if (phase === 1) {
        i++; xs.push(i);
        ys.push(Math.pow(10, 0.4 + (goal - 0.55) * Math.pow(i / n, 0.8) + (rand() - 0.5) * 0.22));
        $('#run-title').textContent = 'Norme du gradient des orbitales, par itération';
        chart($('#scf-chart'), { title: 'Convergence du cycle auto-cohérent', xs, ys, log: true, x0: 1, x1: n, y0: Math.pow(10, goal - 0.6), y1: 10, goal: v.gnrm, goalLabel: 'critère', xlabel: 'itérations', xfmt: (x) => String(Math.round(x)), tip: (x, y) => 'it. ' + x + ' · ' + y.toExponential(1) });
        if (i >= n) { phase = outer ? 2 : 3; i = 0; mark(3); }
        return;
      }
      if (phase === 2) {
        i++; fx.push(i);
        fy.push(0.06 * Math.exp(-i / 4.2) * (1 + (rand() - 0.5) * 0.3) + 0.0012);
        $('#run-title').textContent = 'Force maximale sur les atomes, par pas';
        chart($('#scf-chart'), { title: 'Force maximale par pas', xs: fx, ys: fy, log: true, x0: 1, x1: 20, y0: 1e-4, y1: 0.1, xlabel: 'pas', xfmt: (x) => String(Math.round(x)), tip: (x, y) => 'pas ' + x + ' · ' + y.toExponential(1) + ' Ha/bohr' });
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
    row('Énergie totale', fr(E, 4) + ' Ha');
    row('Écart HOMO-LUMO', fr(gap, 2) + ' eV');
    if (fy.length) row('Force maximale', fy[fy.length - 1].toExponential(1).replace('.', ',') + ' Ha/bohr');
    if (v.dipole) row('Moment dipolaire', fr(sys.id === 'h2o' ? 1.81 : rand() * 0.6, 2) + ' D');
    row('Temps de calcul', duration(d.seconds)); row('Coût', fr(d.credits, 1) + ' crédits');
    box.replaceChildren(h('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, h('p', { class: 'label' }, 'Résultats'), h('span', { class: 'pill example' }, 'valeurs d’exemple')), dl);
    if (v.dos) {
      const lv = [], nocc = Math.min(d.norb, 70);
      for (let i = 0; i < nocc; i++) lv.push(-Math.pow(rand(), 0.7) * 17);
      for (let i = 0; i < 30; i++) lv.push(gap + Math.pow(rand(), 1.3) * 8);
      lv.push(0, gap);
      const xs = [], ys = [];
      for (let e = -18; e <= gap + 8; e += 0.2) { xs.push(e); ys.push(lv.reduce((s, l) => s + Math.exp(-((e - l) ** 2) / 0.24), 0)); }
      const el = h('div', { class: 'chart' });
      box.append(h('p', { class: 'label', style: 'margin-top:12px' }, 'Densité d’états'), el);
      chart(el, { title: 'Densité d’états', h: 120, xs, ys, area: true, y0: 0, vline: 0, vlabel: 'HOMO', xlabel: 'eV', xfmt: (x) => fr(x, 0), yfmt: (y) => fr(y, 0), tip: (x, y) => fr(x, 1) + ' eV · ' + fr(y, 1) });
    }
    if (v.nplot && sys.orbital) { ui.view.orbital = true; ui.view.density = false; }
    else if (v.density) { ui.view.density = true; ui.view.orbital = false; }
    refresh(); syncStage();
  }

  // --- capsule ------------------------------------------------------------------
  const CAPSULE = {
    title: 'Adsorption du benzène sur graphène',
    meta: 'Session enregistrée : 8 étapes, 3 calculs, environnement figé (image du conteneur et versions). Déplacez le curseur pour revivre la session.',
    steps: [
      ['vous', null, 'Je veux l’énergie d’adsorption du benzène sur le graphène.', () => {}],
      ['agent', 'aom_query', 'Mémoire interrogée sur « physisorption sur une surface ». Trois faits retenus, dont (Graphène) estUn (Système sans gap).', () => {}],
      ['agent', 'build_surface', 'Feuillet 5×3 en cellule orthorhombique dans le plan xz, benzène à 3,35 Å.', () => { ui.view.ghosts = true; }],
      ['agent', 'set_parameters', 'PBE, profil mixing, grille de points k 2×1×2.', () => { recipe.set('xc', 'PBE', 'agent'); recipe.set('scf', 'mixing', 'agent'); recipe.set('kpt', 2, 'agent'); }],
      ['agent', 'convergence_study', 'Étude de convergence du pas de grille de 0,50 à 0,35 bohr. Retenu : 0,40.', () => { recipe.set('hgrid', 0.4, 'agent'); ui.view.grid = true; }],
      ['agent', 'run', 'Trois calculs soumis : complexe, feuillet seul, molécule seule.', () => { ui.view.grid = false; recipe.set('density', true, 'agent'); }],
      ['agent', 'analyse', 'Énergie d’adsorption par différence, figure de la HOMO du benzène déposée dans le projet.', () => { ui.view.orbital = true; }],
      ['vous', null, 'Même étude avec le pyrène : la capsule bifurque ici.', () => {}],
    ],
  };
  let capBase = null, capTimer = null;
  function capsuleGo(k) {
    if (st.sys.id !== 'gr-bz' || st.sys.edited) loadSystem('gr-bz');
    if (!capBase) capBase = recipe.snapshot();
    recipe.restore(capBase);
    Object.assign(ui.view, { grid: false, density: false, orbital: false, fragment: false });
    for (let i = 0; i <= k; i++) CAPSULE.steps[i][3]();
    $('#cap-range').value = k;
    $$('#cap-log .msg').forEach((m, i) => m.classList.toggle('seen', i <= k));
    const cur = $$('#cap-log .msg')[k]; if (cur) cur.scrollIntoView({ block: 'nearest' });
    refresh(); syncStage(true);
  }
  function initCapsule() {
    $('#cap-title').textContent = CAPSULE.title; $('#cap-meta').textContent = CAPSULE.meta;
    $('#cap-log').replaceChildren(...CAPSULE.steps.map(([who, tool, text]) => h('div', { class: 'msg' }, h('span', { class: 'who' + (who === 'agent' ? ' bot' : '') }, who === 'agent' ? 'Agent' : 'Humain'), h('div', {}, tool ? h('code', {}, tool + ' ') : null, text))));
    $('#cap-range').addEventListener('input', (e) => { clearInterval(capTimer); capsuleGo(+e.target.value); });
    $('#cap-play').addEventListener('click', () => { clearInterval(capTimer); let k = 0; capsuleGo(0); capTimer = setInterval(() => { if (++k >= CAPSULE.steps.length) return clearInterval(capTimer); capsuleGo(k); }, 1500); });
    $('#cap-fork').addEventListener('click', () => { clearInterval(capTimer); capBase = null; for (const k in st.src) if (st.src[k] === 'agent') st.src[k] = 'vous'; ui.brick = 'precision'; setTab('source'); refresh(); });
  }
  function openCapsule() { location.hash = 'atelier'; setTab('capsule'); capBase = null; capsuleGo(0); }

  // --- companion ------------------------------------------------------------------
  const INTENTS = [
    ['Relaxer la structure', /relax|optimi|géom/i, 'Je passe l’action en relaxation. L’optimiseur suit la nature du système.', [['Action', 'Énergie → Relaxation']], () => recipe.set('action', 'geopt', 'agent'), '(Relaxation) requiert (Forces)'],
    ['Mettre le système dans l’eau', /eau|solvant|solv/i, 'J’ajoute un solvant implicite, cavité soft-sphere paramétrée pour l’eau.', [['Milieu', 'Vide → Eau implicite']], () => recipe.set('solvent', 'water', 'agent'), '(Eau) modéliséePar (Cavité soft-sphere)'],
    ['Voir la densité et la HOMO', /densit|orbit|homo/i, 'Je demande la densité au format cube et une orbitale autour du niveau de Fermi.', [['Mesures', '+ densité'], ['Mesures', '+ 1 orbitale']], () => { recipe.set('density', true, 'agent'); recipe.set('nplot', 1, 'agent'); }, '(Orbitale frontière) écritePar (nplot)'],
  ];
  function propose(it) {
    const card = h('div', { class: 'prop' }, h('span', {}, it[2]),
      h('div', { class: 'diff' }, it[3].map(([b, t]) => h('div', {}, h('span', {}, b + '  '), h('b', {}, t)))),
      h('div', { class: 'trip' }, 'mémoire : ' + it[5]),
      h('div', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn cta small', type: 'button', onclick: (e) => { it[4](); e.target.parentNode.replaceChildren(h('span', { style: 'color:var(--ok);font-size:12px' }, 'Appliqué. Les valeurs portent la marque « Compagnon ».')); } }, 'Appliquer'),
        h('button', { class: 'btn small', type: 'button', onclick: () => card.remove() }, 'Ignorer')));
    $('#agent-body').append(card); card.scrollIntoView({ block: 'nearest' });
  }
  function initAgent() {
    $('#agent-body').replaceChildren(h('p', { style: 'color:var(--fg-2);font-size:13px' }, 'Le compagnon agit sur les mêmes briques que vous, par les mêmes actions. Chaque proposition est un changement de recette que vous acceptez ou non.'),
      h('div', { class: 'chips' }, INTENTS.map((it) => h('button', { class: 'chip', type: 'button', onclick: () => propose(it) }, it[0]))));
    $('#agent-open').addEventListener('click', () => { $('#agent').hidden = !$('#agent').hidden; });
    $('#agent-close').addEventListener('click', () => { $('#agent').hidden = true; });
    $('#agent-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#agent-input').value.trim(); if (!q) return;
      $('#agent-body').append(h('p', { style: 'text-align:right;font-size:13px' }, q));
      const it = INTENTS.find((x) => x[1].test(q));
      if (it) propose(it); else $('#agent-body').append(h('p', { style: 'color:var(--fg-2);font-size:13px' }, 'Dans cette maquette, le compagnon connaît trois gestes : relaxer, solvater, visualiser. Essayez l’un d’eux.'));
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
    let t = 'Les calculs de structure électronique ont été réalisés avec le code BigDFT' + cite('bigdft') + cite('flex') + ', qui développe les orbitales de Kohn-Sham sur une base d’ondelettes de Daubechies. ';
    t += 'La fonctionnelle ' + v.xc + cite(v.xc) + ' a été employée avec des pseudopotentiels à norme conservée' + cite('hgh') + '. ';
    t += 'Le pas de la grille est de ' + fr(v.hgrid, 2) + ' bohr ; les régions grossière et fine s’étendent à ' + fr(v.crmult, 1) + ' et ' + fr(v.frmult, 1) + ' fois les rayons de référence des atomes. ';
    if (v.nspin === 2) t += 'Le calcul est polarisé en spin, avec un moment magnétique total de ' + v.mpol + ' µB. ';
    if (sys.bc !== 'free' && v.kpt > 1) t += 'La zone de Brillouin est échantillonnée par une grille de Monkhorst-Pack ' + (sys.bc === 'surface' ? v.kpt + '×1×' + v.kpt : v.kpt + '×' + v.kpt + '×' + v.kpt) + '. ';
    if (v.algo === 'linear') t += 'Le formalisme à échelle linéaire' + cite('linear') + ' est utilisé, la matrice densité étant exprimée sur des fonctions support localisées. ';
    if (v.solvent !== 'none') t += 'Le solvant est décrit par un continuum diélectrique à cavité soft-sphere, traité par le solveur de Poisson généralisé' + cite('solvent') + '. ';
    if (v.dispersion) t += 'Les interactions de dispersion sont corrigées par le schéma D3' + cite('d3') + '. ';
    if (v.action === 'geopt') t += 'Les géométries ont été relaxées avec l’algorithme ' + v.geoptMethod + cite(v.geoptMethod) + (v.forcemax ? ' jusqu’à des forces inférieures à ' + fr(v.forcemax, 3) + ' Ha/bohr' : '') + '. ';
    if (v.action === 'frag') t += 'L’analyse en fragments suit la méthode de réduction de complexité' + cite('frag') + '. ';
    $('#methods').textContent = t;
    $('#refs').replaceChildren(...refs.map((k) => h('li', {}, REF[k])));
    const eq = $('#pub-eq');
    eq.replaceChildren(h('div', {}, EQ.theorie[1]), h('div', {}, EQ.precision[1].replace('\\qquad N_{\\mathrm{ddl}}=N_c+7N_f', '')));
    if (v.solvent !== 'none') eq.append(h('div', {}, EQ.milieu[1]));
    if (v.algo === 'linear') eq.append(h('div', {}, '$$\\rho(\\mathbf r,\\mathbf r\')=\\sum_{\\alpha\\beta}\\phi_\\alpha(\\mathbf r)\\,K^{\\alpha\\beta}\\,\\phi_\\beta(\\mathbf r\')$$'));
    typeset(eq);
    const b = $('#fig-preset button[aria-pressed="true"]'), mm = +b.dataset.w, ratio = mm === 170 ? 0.5 : mm === 120 ? 1.25 : 0.75;
    const px = Math.round(mm / 25.4 * 600), w = Math.min(px, 1200);
    $('#fig-img').src = stage.snapshot(w, Math.round(w * ratio), '#ffffff');
    $('#fig-size').textContent = fr(px) + ' × ' + fr(Math.round(px * ratio)) + ' px à 600 dpi';
  }
  function copy(text, btn) {
    const done = () => { btn.textContent = 'Copié'; setTimeout(() => { btn.textContent = 'Copier'; }, 1400); };
    try { navigator.clipboard.writeText(text).then(done, () => { btn.textContent = 'Sélectionnez le texte'; }); } catch (e) { btn.textContent = 'Sélectionnez le texte'; }
  }

  // --- routing and wiring ---------------------------------------------------------
  const VIEWS = ['atelier', 'bibliotheque', 'laboratoire', 'calcul', 'publication'];
  function route() {
    const name = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'atelier';
    VIEWS.forEach((n) => { $('#view-' + n).hidden = n !== name; });
    $$('.spaces a').forEach((a) => { if (a.getAttribute('href') === '#' + name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (name === 'publication') renderPublication();
    if (name === 'laboratoire') typeset($('#view-laboratoire'));
  }

  let queued = false;
  function refresh() {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderRail(); renderStageMeta(); renderSource();
      if (!ui.drag) renderInspector();
      syncStage();
      if (!$('#view-publication').hidden) renderPublication();
    });
  }

  recipe.on(refresh);
  stage.onPick = (i) => { ui.sel = i; if (i != null) ui.brick = 'matiere'; refresh(); syncStage(); };
  stage.onFrame = () => {
    const pin = $('#pin'), show = st.sys && st.sys.id === 'si64' && !st.sys.edited && st.sys.atoms[17];
    if (show) { const p = stage.project(st.sys.atoms[17].p); pin.style.left = p.x + 'px'; pin.style.top = p.y + 'px'; }
    pin.hidden = !show;
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
  $$('#dock .tab').forEach((t) => t.addEventListener('click', () => { setTab(t.dataset.tab); if (t.dataset.tab === 'capsule' && st.sys.id !== 'gr-bz') { capBase = null; capsuleGo(0); } }));
  $('#dock-toggle').addEventListener('click', (e) => { const closed = $('#dock').classList.toggle('closed'); e.target.textContent = closed ? 'Déplier' : 'Replier'; });
  $$('[data-capsule]').forEach((b) => b.addEventListener('click', openCapsule));
  $$('[data-load]').forEach((b) => b.addEventListener('click', () => { loadSystem(b.dataset.load); location.hash = 'atelier'; }));
  $('#paper-build').addEventListener('click', () => {
    loadSystem('si64');
    editAtoms((A) => { A[17].el = 'P'; });
    recipe.set('xc', 'PBE', 'article'); recipe.set('hgrid', 0.4, 'article'); recipe.set('kpt', 2, 'article');
    recipe.set('action', 'geopt', 'article'); recipe.set('forcemax', 0.005, 'article');
    ui.brick = 'theorie'; location.hash = 'atelier';
  });
  $('#fig-preset').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('#fig-preset button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderPublication(); });
  $('#copy-methods').addEventListener('click', (e) => copy($('#methods').textContent, e.target));
  $('#copy-refs').addEventListener('click', (e) => copy($$('#refs li').map((li, i) => '[' + (i + 1) + '] ' + li.textContent).join('\n'), e.target));
  window.addEventListener('hashchange', route);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeColors);
  new MutationObserver(themeColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  themeColors(); initCapsule(); initAgent();
  loadSystem('c60');
  ui.view.orbital = true; // open on a characteristic picture: a frontier orbital of C60
  refresh(); syncStage(true); route();
})(window.OND);
