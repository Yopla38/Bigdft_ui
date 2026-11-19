/* A sketch, to judge an idea before building it: a study written as calls to a
 * registry of steps, where a box is a call and an arrow is an argument that is
 * the result of another box, and where a decision is a box of its own.
 *
 * The registry (`study.converge`, `study.choose`, `study.relax`, ...) does not
 * exist. Every number shown is real: it is read from the logs of the 6a
 * capsule, the same result set as the "real study" view. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  const S = OND.study, HA = 27.211386245988, HS = [0.45, 0.40, 0.35, 0.30], CAPSULE_H = 0.35;
  let ctx = null, sel = 'choose', face = 'words';
  const state = { tol: 1, retained: CAPSULE_H };

  // --- the capsule's numbers ---------------------------------------------------------
  const run = (stage, st, hgrid) => S.runs[stage + '/6a_S1_' + st + '_pbe_h' + hgrid.toFixed(2) + '_r6-9'];
  const pair = (hgrid) => [run('00_phase2_grid_pbe', 'S0', hgrid), run('01_t1_scf_rerun', 'T1', hgrid)];
  const gap = (hgrid) => { const [a, b] = pair(hgrid); return (b.energy - a.energy) * HA; };
  const away = (hgrid) => Math.abs(gap(hgrid) - gap(0.30)) * 1000;                       // meV from the finest grid
  const cost = (hgrid) => pair(hgrid).reduce((s, r) => s + r.wall * r.cores / 3600, 0);  // core-hours for the pair
  const proposed = () => HS.find((x) => away(x) < state.tol);
  const cg = { S0: S.relax['05_geopt_constrained/6a_S0_pbe_cgeopt'], T1: S.relax['05_geopt_constrained/6a_T1_pbe_cgeopt'] };
  const adiabatic = (cg.T1.energy - cg.S0.energy) * HA;
  const failed = run('00_phase2_grid_pbe', 'T1', 0.35);
  const record = (id) => (S.capsule.records.find((r) => r.id === id) || { text: '' }).text;
  const ran = () => state.retained === CAPSULE_H;
  const fx = (v, n) => Number(v).toFixed(n).replace('-', '−');
  const spread = (() => { const [a] = pair(0.45), [b] = pair(0.30); return (a.energy - b.energy) * HA; })();

  // --- the boxes -----------------------------------------------------------------------
  const NODES = [
    { id: 'structure', col: 0, row: 0, type: 'structure', title: '6a, as built', label: () => '77 atoms · S1 geometry' },
    { id: 'target', col: 0, row: 1, type: 'target', title: 'Target, fixed first', label: () => S.target.eV + ' ± ' + S.target.window + ' eV' },
    { id: 'grid', col: 1, row: 0, type: 'series', title: 'Converge the grid', label: () => '4 spacings · on the gap' },
    { id: 'fail', col: 2, row: 1, type: 'run', title: 'T₁ with default SCF', label: () => '12 runs, none converged' },
    { id: 'choose', col: 2, row: 0, type: 'decision', title: 'Choose', label: () => 'h = ' + state.retained.toFixed(2) },
    { id: 's0', col: 3, row: 0, type: 'relax', title: 'Relax S₀', label: () => 'chromophore only' },
    { id: 't1', col: 3, row: 1, type: 'relax', title: 'Relax T₁', label: () => 'spin 2 · chromophore only' },
    { id: 'et', col: 4, row: 2, type: 'formula', title: 'Triplet energy, PBE', tex: 'E(T_1) - E(S_0)' },
    { id: 's0h', col: 4, row: 0, type: 'run', title: 'S₀, PBE0', label: () => 'restart from Relax S₀' },
    { id: 't1h', col: 4, row: 1, type: 'run', title: 'T₁, PBE0', label: () => 'restart from Relax T₁' },
    { id: 'verdict', col: 5, row: 2, type: 'formula', title: 'Triplet energy, PBE0', tex: 'E(T_1) - E(S_0)' },
  ];
  const EDGES = [
    ['structure', 'grid', 'geometry'], ['grid', 'choose', 'energies'], ['choose', 's0', 'choice'], ['choose', 't1', 'choice'],
    ['fail', 't1', 'lesson'], ['s0', 'et', 'energies'], ['t1', 'et', 'energies'], ['target', 'et', 'criterion'],
    ['s0', 's0h', 'wavefunctions'], ['t1', 't1h', 'wavefunctions'], ['s0h', 'verdict', 'energies'], ['t1h', 'verdict', 'energies'], ['target', 'verdict', 'criterion'],
  ];
  const status = (n) => ({
    structure: ['done', 'given'], target: ['done', 'criterion'], grid: ['done', '24 runs'], fail: ['aside', 'superseded'],
    choose: ran() ? ['done', 'decided'] : ['partial', 'your choice'],
    s0: ran() ? ['done', cg.S0.steps.length + ' steps'] : ['queued', 'to run'], t1: ran() ? ['done', cg.T1.steps.length + ' steps'] : ['queued', 'to run'],
    et: ran() ? ['partial', fx(adiabatic, 3) + ' eV'] : ['queued', 'to run'],
    s0h: ['queued', 'queued'], t1h: ['queued', 'queued'], verdict: ['queued', 'pending'],
  }[n.id]);

  // --- the script: one line per box; {name} is an argument that is another box ------------
  const SCRIPT = () => [
    ['structure', 'study  = Study("6a_S1.xyz", base=blueprint)'],
    ['target', 'target = study.target("E_T", ' + S.target.eV + ', within=' + S.target.window + ', unit="eV")'],
    ['grid', 'grid   = study.converge("hgrid", [0.45, 0.40, 0.35, 0.30], on="E(T1) - E(S0)", within="' + state.tol + ' meV")'],
    ['choose', 'hgrid  = study.choose({grid}, retained=' + state.retained.toFixed(2) + ', by="' + (ran() ? 'capsule dec-p2-grid' : 'you') + '")'],
    ['s0', 's0     = study.relax("S0", grid={choose}, frozen="all but thioxanthone")'],
    ['t1', 't1     = study.relax("T1", grid={choose}, spin=2, frozen="all but thioxanthone")'],
    ['et', 'e_pbe  = study.difference("Triplet energy, PBE", {t1}, {s0}, unit="eV", against={target})'],
    ['s0h', 's0h    = study.single_point("S0, PBE0", at={s0}, xc="PBE0", restart={s0})'],
    ['t1h', 't1h    = study.single_point("T1, PBE0", at={t1}, xc="PBE0", restart={t1})'],
    ['verdict', 'e_pbe0 = study.difference("Triplet energy, PBE0", {t1h}, {s0h}, unit="eV", against={target})'],
  ];
  const VAR = { grid: 'grid', choose: 'hgrid', s0: 's0', t1: 't1', target: 'target', s0h: 's0h', t1h: 't1h' };

  // --- what each box says: the words, the settings with where they come from, the PyBigDFT under the call -----
  const base = () => ['inp = study.base()                      # the blueprint of the workshop',
    'inp.set_hgrid(' + state.retained.toFixed(2) + ')                    # from the decision', 'inp.set_rmult(coarse=6.0, fine=9.0)'];
  const relaxLines = ['inp.optimize_geometry(method="SQNM", nsteps=300, betax=1.0, forcemax=2.0e-4)', '# posinp: 55 atoms carry  Frozen: fxyz  (everything but the thioxanthone)'];
  const tripletLines = ['inp.spin_polarize(mpol=2)', 'inp["dft"].update(itermax=200, nrepmax=5)   # the lesson of the failed attempt'];
  const hybridLines = ['inp.set_xc("PBE0")', 'for element in ELEMENTS:                # no pseudopotential is registered for a hybrid', '    inp["psppar." + element] = {"Pseudopotential XC": 11}', 'inp.read_orbitals_from_disk()           # the PBE orbitals, copied in data-NAME/'];
  const BOX = {
    structure: { words: ['The geometry every box starts from. The authors published no coordinates: it was rebuilt from the NMR restraints of the paper.', 'Nothing is computed here. It is a box because the rest depends on it.'],
      settings: [['Structure', '6a_S1.xyz, C31H34N4O7S', 'capsule'], ['State', 'neutral, isolated', 'capsule']], code: ['# the structure and the blueprint the study starts from'] },
    target: { words: ['The experimental triplet energy, and the window that will count as “reproduced”, written down before any calculation.', 'Results come here to be judged. Nothing is tuned towards it: that is why it is a box, placed first, and not a number in the conclusion.'],
      settings: [['Quantity', 'triplet energy E_T', 'paper'], ['Value', S.target.eV + ' eV (269 kJ/mol), 77 K phosphorescence', 'paper'], ['Window', '± ' + S.target.window + ' eV', 'capsule'], ['Applies to', 'the PBE0 adiabatic value', 'capsule']], code: ['# a criterion: no calculation'] },
    grid: { words: ['Runs the singlet and the triplet on four grids, and watches the quantity the study is about, their difference.', 'Total energies move by ' + fx(spread, 2) + ' eV across these grids; the gap moves by ' + fx(away(0.45), 1) + ' meV. Converging the total energy would have asked for a far finer grid than the question needs.'],
      settings: [['Vary', 'grid spacing: 0.45, 0.40, 0.35, 0.30 bohr', 'default'], ['On', 'E(T₁) − E(S₀), vertical', 'you'], ['Criterion', 'within ' + state.tol + ' meV of the finest grid', 'you'], ['Runs', '4 × (S₀ + T₁), and the same for two other extents', 'capsule']],
      code: ['for h in (0.45, 0.40, 0.35, 0.30):', '    inp = study.base()', '    inp.set_hgrid(h)                    # S0', '    inp.spin_polarize(mpol=2)           # and once more for T1', '    inp["dft"].update(itermax=200, nrepmax=5)'] },
    fail: { words: ['The first twelve triplet runs, with the default limits of the self-consistency: ' + failed.iters + ' iterations and they stopped, not converged. BigDFT said so in its warnings.', 'It stays on the board, faded. What it taught is carried by the dotted arrow: every triplet box after it arrives with 200 iterations and 5 restarts already filled in.'],
      settings: [['dft.itermax', '50', 'default'], ['dft.nrepmax', '1', 'default'], ['Outcome', 'residue ' + failed.gnrm.toExponential(1) + ' for a criterion of 1.0e-5', 'capsule'], ['Status', 'superseded by the re-run', 'capsule']], code: ['inp.spin_polarize(mpol=2)               # and nothing else: the defaults'] },
    choose: { words: ['A decision is part of the study, so it is a box. The criterion is applied by the machine, which proposes; a person retains, and may retain something else for a reason the criterion does not know.', 'Here the criterion on the gap accepts the coarsest grid. The researcher kept 0.35: “' + record('dec-p2-grid') + '”'], settings: null, code: ['# no calculation: a value, who chose it, and why. Saved in the capsule as a decision.'] },
    s0: { words: ['Relaxes the singlet ground state, moving only the thioxanthone: the rest of the peptide stays where the NMR restraints put it.', ran() ? cg.S0.steps.length + ' force evaluations; the last force printed is ' + cg.S0.fmax.toExponential(1) + ' Ha/bohr.' : 'Not computed at h = ' + state.retained.toFixed(2) + ': the capsule only holds this relaxation at 0.35.'],
      settings: [['Grid spacing', state.retained.toFixed(2) + ' bohr', 'decision'], ['Optimiser', 'SQNM, 300 steps', 'default'], ['Stop at', '2.0e-4 Ha/bohr', 'default'], ['Frozen', '55 of 77 atoms', 'capsule']], code: () => base().concat(relaxLines) },
    t1: { words: ['The same relaxation for the lowest triplet: two unpaired electrons, and the settings the failed attempt taught.', ran() ? cg.T1.steps.length + ' force evaluations; the last force printed is ' + cg.T1.fmax.toExponential(1) + ' Ha/bohr.' : 'Not computed at h = ' + state.retained.toFixed(2) + ': the capsule only holds this relaxation at 0.35.'],
      settings: [['Grid spacing', state.retained.toFixed(2) + ' bohr', 'decision'], ['Spin', 'polarised, 2 unpaired electrons', 'you'], ['SCF limits', '200 iterations, 5 restarts', 'lesson'], ['Optimiser', 'SQNM, 300 steps, stop at 2.0e-4', 'default'], ['Frozen', '55 of 77 atoms', 'capsule']], code: () => base().concat(tripletLines, relaxLines) },
    et: { words: ['The difference between the two relaxed states, set against the target.', ran() ? 'With PBE it comes out at ' + fx(adiabatic, 3) + ' eV, ' + fx(S.target.eV - adiabatic, 2) + ' eV below the experiment and outside the window. The criterion was never on this value: it is on the PBE0 one, further right.' : 'Not available at h = ' + state.retained.toFixed(2) + ': both relaxations have to run on that grid first.'],
      settings: [['Formula', 'E(Relax T₁) − E(Relax S₀)', 'you'], ['Unit', 'eV', 'you'], ['Against', 'the target', 'you']], code: ['E_T = (energy("T1") - energy("S0")) * HA_EV     # each read on the last step of its relaxation'] },
    s0h: { words: ['One PBE0 calculation at the PBE geometry of the singlet, started from its PBE orbitals rather than from scratch.', 'Queued when the capsule was made: this is where the study stops today.'],
      settings: [['Functional', 'PBE0', 'you'], ['Geometry', 'the one Relax S₀ ended on', 'link'], ['Starts from', 'the orbitals of Relax S₀', 'link'], ['Pseudopotentials', 'the PBE ones, named for each element', 'lesson']], code: () => base().concat(hybridLines) },
    t1h: { words: ['The same for the triplet, at its own relaxed geometry.', 'Queued when the capsule was made.'],
      settings: [['Functional', 'PBE0', 'you'], ['Spin', 'polarised, 2 unpaired electrons', 'you'], ['SCF limits', '200 iterations, 5 restarts', 'lesson'], ['Geometry and orbitals', 'those of Relax T₁', 'link'], ['Pseudopotentials', 'the PBE ones, named for each element', 'lesson']], code: () => base().concat(tripletLines, hybridLines) },
    verdict: { words: ['The value the criterion was written for: the PBE0 adiabatic triplet energy, against ' + S.target.eV + ' ± ' + S.target.window + ' eV.', 'Pending. The board shows it as it is: a box that exists, with its formula and its judge, and no number yet.'],
      settings: [['Formula', 'E(T₁, PBE0) − E(S₀, PBE0)', 'you'], ['Unit', 'eV', 'you'], ['Against', 'the target: this is the test', 'you']], code: ['E_T = (energy("T1_PBE0") - energy("S0_PBE0")) * HA_EV'] },
  };
  const TAG = { default: 'pre-filled', you: 'you', capsule: 'capsule', paper: 'paper', decision: 'from the decision', lesson: 'lesson learned', link: 'from a link' };

  // --- drawing ---------------------------------------------------------------------------
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const paint = (text) => esc(text).replace(/(#.*)$/, '<span class="c">$1</span>').replace(/("[^"]*")/g, '<span class="s">$1</span>');

  function decisionPanel() {
    const { h } = ctx, prop = proposed();
    return [
      h('p', { class: 'label' }, 'Criterion'),
      h('div', { class: 'field' }, h('span', {}, 'The gap is within'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Tolerance' }, [1, 0.5, 0.4, 0.2].map((t) => h('button', { type: 'button', 'aria-pressed': String(state.tol === t), onclick: () => { state.tol = t; render(); } }, t + ' meV'))), h('span', {}, 'of the finest grid')),
      h('div', { class: 'scroll-x' }, h('table', { class: 'choice' }, h('thead', {}, h('tr', {}, ['h', 'Gap (eV)', 'Off finest (meV)', 'Cost (core-h)', 'Criterion', ''].map((c) => h('th', {}, c)))),
        h('tbody', {}, HS.map((x) => h('tr', { class: (x === state.retained ? 'kept' : '') }, h('td', { class: 'num' }, x.toFixed(2)), h('td', { class: 'num' }, gap(x).toFixed(5)), h('td', { class: 'num' }, x === 0.30 ? 'reference' : fx(away(x), 2)), h('td', { class: 'num' }, fx(cost(x), 0)),
          h('td', {}, x === prop ? h('span', { class: 'pill' }, 'proposes') : away(x) < state.tol ? 'passes' : 'fails'),
          h('td', {}, x === state.retained ? h('span', { class: 'pill kept', title: ran() ? 'Retained in the capsule' : 'Retained by you' }, 'kept') : h('button', { class: 'btn small', type: 'button', onclick: () => { state.retained = x; render(); } }, 'Retain'))))))),
      h('p', { class: 'figmeta' }, 'Cost: one S₀ and one T₁ calculation on that grid, as measured. The criterion proposes h = ' + prop.toFixed(2) + ', the coarsest grid that passes, for ' + fx(cost(prop), 0) + ' core-hours a pair. ' + (ran() ? 'The capsule retained 0.35, which costs ' + fx(cost(0.35) / cost(prop), 1) + ' times ' + (prop === 0.35 ? 'that' : 'more') + (prop === 0.35 ? '.' : ', for a reason the criterion does not hold.') : 'You retained ' + state.retained.toFixed(2) + '.')),
      ...(ran() ? [] : [h('div', { class: 'notice' }, h('b', {}, 'Your decision changes what is downstream'), h('span', {}, 'The relaxations and what follows exist in the capsule at h = 0.35 only. At ' + state.retained.toFixed(2) + ' they are to be run; the board shows them as such. The decision would be saved with your name and your reason.'),
        h('div', { class: 'notice-actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => { state.retained = CAPSULE_H; render(); } }, 'Back to the decision of the capsule')))]),
    ];
  }

  function figure(id) {
    const { h } = ctx, t = S.target, host = h('div', { class: 'figure' });
    const rows = [{ label: 'PBE, vertical, at h = ' + state.retained.toFixed(2), value: gap(state.retained), text: fx(gap(state.retained), 3) + ' eV' },
      ran() ? { label: 'PBE, adiabatic', value: adiabatic, text: fx(adiabatic, 3) + ' eV' } : { label: 'PBE, adiabatic', value: null, note: 'to run at this grid' },
      { label: 'PBE0, adiabatic: the criterion', value: null, note: 'pending' }];
    const spec = { kind: 'interval', title: '', caption: '', x: { label: 'Triplet energy (eV)', unit: 'eV', min: 2.1, max: 3.05, fmt: (v) => v.toFixed(1) }, band: { x0: t.eV - t.window, x1: t.eV + t.window, mid: t.eV, label: 'target ' + t.eV + ' ± ' + t.window + ' eV' }, rows: id === 'verdict' ? rows.slice(2) : rows };
    setTimeout(() => OND.figure.render(host, spec, { preset: 'screen' }), 0);
    return host;
  }

  function render() {
    const { h, $ } = ctx, board = $('#steps-board');
    for (const n of NODES) if (n.label) n.sub = n.label();          // the same objects each time: a dragged box stays where it was put
    OND.studyView.drawBoard(board, NODES, EDGES, sel, (id) => { sel = id; render(); }, status, { px: 219 });
    const els = [...board.querySelectorAll('.node')], elOf = (id) => els[NODES.findIndex((n) => n.id === id)];
    elOf('choose').classList.toggle('mine', !ran());

    // the selected box, three faces
    const n = NODES.find((x) => x.id === sel), box = BOX[sel], code = typeof box.code === 'function' ? box.code() : box.code;
    const faces = { words: 'In words', settings: sel === 'choose' ? 'The decision' : 'Settings', code: 'PyBigDFT' };
    $('#steps-box').replaceChildren(
      h('div', { class: 'box-head' }, h('div', {}, h('p', { class: 'label' }, { decision: 'Decision', formula: 'Formula', series: 'Series', relax: 'Relaxation', run: sel === 'fail' ? 'Failed attempt, kept' : 'Calculation', structure: 'Structure', target: 'Criterion' }[n.type]), h('h3', {}, n.title)),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Face of the box' }, Object.entries(faces).map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(face === k), onclick: () => { face = k; render(); } }, l)))),
      ...(face === 'words' ? box.words.map((w) => h('p', { class: 'box-words' }, w)).concat(sel === 'et' || sel === 'verdict' ? [figure(sel)] : [])
        : face === 'settings' ? (sel === 'choose' ? decisionPanel() : [h('dl', { class: 'box-set' }, box.settings.flatMap(([k, v, src]) => [h('dt', {}, k), h('dd', {}, h('span', {}, v), h('span', { class: 'prov-tag src-' + src }, TAG[src]))])),
          h('p', { class: 'figmeta' }, 'A pre-filled value can be changed; one that comes from a decision, a link or a lesson says where it comes from.')])
          : [h('p', { class: 'figmeta' }, sel === 'choose' || sel === 'target' || sel === 'structure' ? 'This box computes nothing.' : 'What the call on the right does, in PyBigDFT. Written once, in the registry; the board only shows it.'), h('pre', { class: 'code', html: code.map(paint).join('\n') })]));

    // the script: a line per box, an argument per arrow
    const pre = $('#steps-code');
    pre.replaceChildren(...SCRIPT().map(([id, text]) => {
      const line = h('div', { class: 'sline' + (id === sel ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { sel = id; render(); }, onkeydown: (e) => { if (e.key === 'Enter') { sel = id; render(); } } });
      line.innerHTML = paint(text).replace(/\{(\w+)\}/g, (m, ref) => '<button class="ref" type="button" data-ref="' + ref + '">' + VAR[ref] + '</button>');
      for (const b of line.querySelectorAll('.ref')) {
        const src = b.dataset.ref, mark = (on) => { elOf(src).classList.toggle('hot', on); for (const p of board.querySelectorAll('.edge')) if (p.dataset.a === src && p.dataset.b === id) p.classList.toggle('on', on || sel === src || sel === id); };
        b.addEventListener('mouseenter', () => mark(true)); b.addEventListener('mouseleave', () => mark(false));
        b.addEventListener('focus', () => mark(true)); b.addEventListener('blur', () => mark(false));
        b.addEventListener('click', (e) => { e.stopPropagation(); sel = src; render(); });
      }
      return line;
    }));
  }

  OND.steps = { mount(context) { ctx = context; }, render() { if (ctx) render(); } };
})(window.OND);
