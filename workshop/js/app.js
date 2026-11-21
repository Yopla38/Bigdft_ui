/* Workshop 2: one place where a study is built, computed and read, step by step.
 * The rail is the study. The scene, the results and the settings all follow the
 * selected step. The model is in model.js; this file only draws and listens. */
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
  const fx = (x, n) => Number(x).toFixed(n).replace('-', '−');
  const sub = (s) => String(s).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sci = (v) => { const [m, e] = Number(v).toExponential(1).split('e'); return m + '×10' + String(+e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]); };
  /* An equation. MathJax comes from the network, after the page: until it is there, and without it, the same
     thing is shown in plain characters. Nothing is typeset in place, so no TeX source is ever on screen. */
  let mathReady = false;
  function math(tex, plain, display) {
    if (mathReady) { try { return h('span', { class: 'math', title: plain }, MathJax.tex2svg(tex, { display: !!display })); } catch (e) { /* in plain characters */ } }
    return h('span', { class: 'math plain' }, display ? plain.split('   ·   ').map((line) => h('span', {}, line)) : plain);
  }
  (function waitForMath(tries) {
    if (window.MathJax && MathJax.tex2svg && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(() => { document.head.appendChild(MathJax.svgStylesheet()); mathReady = true; refresh(); });
    else if (tries < 75) setTimeout(() => waitForMath(tries + 1), 400);
  })(0);

  const M = OND.model, L = OND.live, S = OND.structures, Q = OND.equations, T = OND.store, study = M.study, P = M.P;
  const bp = OND.Blueprint(), st = bp.st;                 // the settings of the selected calculation, edited in place
  const stage = OND.Stage($('#stage'));
  const SCHEMA = OND.schema.variables;
  const ui = { said: null, sel: 'system', tab: 'results', main: 'graph', inset: true, zoom: 'fit', depth: 0, view: { grid: false, ghosts: true, vdw: false }, drag: false, loading: false, query: '', acts: {}, palette: false, geo: '', moved: {}, reveal: true };
  OND.board.init({ h, math });

  const KIND = { structure: 'Structure', combination: 'Result', system: 'System', calculation: 'Calculation', relax: 'Relaxation', converge: 'Convergence series', vary: 'Series', choose: 'Decision', difference: 'Result', levels: 'Result', target: 'Criterion' };
  const ROLE = {
    structure: 'Another system of the study: a molecule, a fragment, an isolated atom.', combination: 'A sum of energies with coefficients: an atomisation, a formation or a reaction energy.',
    system: 'What everything else is computed on.', calculation: 'An energy at a fixed geometry.', relax: 'The atoms move until the forces vanish.',
    converge: 'One setting varied, to see when the result stops changing.', vary: 'One setting varied, the results side by side.', choose: 'The value kept for every step after this one.',
    difference: 'The energy of one step minus the energy of another.', levels: 'The energy levels of a calculation, read from its log.', target: 'A reference and the window that counts as agreement, set before computing.',
  };
  const GLYPH = { structure: '⬡', combination: 'Σ', system: '⬡', calculation: 'E', relax: '↯', converge: '≋', choose: '?', difference: 'Δ', target: '◎' };
  const SRC = { default: 'BigDFT default', adapted: 'Adapted', you: 'This step', inherited: 'Inherited', decision: 'Decision' };
  const BC = { free: 'isolated', surface: 'surface (x, z periodic)', periodic: 'periodic' };
  const sel = () => M.byId(ui.sel);
  const SYSTEMS = OND.chem.list.filter(([id]) => id !== '6a');
  const LABELS = { xc: 'Functional', charge: 'Charge', nspin: 'Spin', mpol: 'Unpaired electrons', dispersion: 'Dispersion', hgrid: 'Grid spacing', crmult: 'Coarse extent', frmult: 'Fine extent', gnrm: 'Criterion',
    algo: 'Algorithm', kpt: 'k-points', solvent: 'Solvent', efield: 'Electric field', scf: 'SCF scheme', tel: 'Electronic temperature', density: 'Density', nplot: 'Orbitals written', dipole: 'Dipole', charges: 'Atomic charges' };

  // ------------------------------------------------------------------ the selected step and its settings
  /* Load the settings of the selected calculation into the editor. Edits come back through onEdit. */
  function loadSelected() {
    const step = sel();
    ui.loading = true;
    if (M.isCalc(step)) M.resolveInto(bp, step);
    else if (step && step.kind === 'structure') { bp.clear(); bp.setSystem(step.sys); }
    else { const first = study.steps.find(M.isCalc); if (first) M.resolveInto(bp, first); else { bp.clear(); bp.setSystem(study.sys); } }
    ui.loading = false;
    ui.acts = {};
  }
  /* A setting changed in the inspector: what this step adds is whatever now differs from what it inherits. */
  function onEdit() {
    const step = sel();
    if (ui.loading || !M.isCalc(step)) return;
    const parent = M.resolveInto(OND.Blueprint(), step, { own: false }).st, own = { v: {}, expert: {}, actions: [] }, J = JSON.stringify;
    for (const k in P) {
      if (st.src[k] !== 'you' || k === 'action' || (step.kind === 'relax' && M.RELAX_KEYS.includes(k))) continue;
      if (J(st.v[k]) !== J(parent.v[k])) own.v[k] = st.v[k];
    }
    for (const p in st.expert) if (J(st.expert[p]) !== J(parent.expert[p])) own.expert[p] = st.expert[p];
    own.actions = st.actions.filter((a) => J(a) !== J(parent.actions.find((b) => b.name === a.name)));
    step.own = own;
    M.touch();
    refresh();
  }
  bp.on(onEdit);

  function select(id) { ui.sel = id; ui.palette = false; ui.reveal = true; loadSelected(); refresh(true); }

  // ------------------------------------------------------------------ the scene
  /* The geometry a step is computed on, or ends on: the relaxed one once its relaxation is computed. */
  function sceneFor(step) {
    const relax = step && (step.kind === 'relax' ? step : M.isCalc(step) ? M.geometryFrom(step) : null), sys = M.sysOf(M.isSeries(step) ? M.byId(step.links.of) : M.isCalc(step) || (step && step.kind === 'structure') ? step : null);
    const own = step && step.kind === 'relax';
    if (!relax || M.status(relax).state !== 'done') return { sys, base: sys, tag: 'built', text: relax ? 'geometry as built: “' + relax.title + '” is not computed yet' : sys.source ? 'geometry as given' : 'geometry as built' };
    const final = M.runOf(relax).run.relax.final;
    const moved = Object.assign({}, sys, { atoms: sys.atoms.map((a, i) => Object.assign({}, a, { p: [0, 1, 2].map((d) => final[i][d + 1] - sys.origin[d]) })) });
    return { sys: moved, base: sys, tag: relax.id + ':' + M.keyOf(relax), text: own ? 'geometry after this relaxation' : 'geometry relaxed in “' + relax.title + '”' };
  }
  function renderStage(force) {
    const step = sel(), scene = sceneFor(step), sys = scene.base, v = st.v, w = ui.view;
    if (force || ui.geo !== scene.tag + '|' + sys.id) { stage.setSystem(scene.sys, ui.geo.endsWith('|' + sys.id)); ui.geo = scene.tag + '|' + sys.id; }
    const look = [w.ghosts, w.vdw].join(), grid = [w.grid, v.hgrid, v.crmult, v.frmult, ui.geo].join();
    if (force || renderStage.look !== look) { stage.setOptions({ ghosts: w.ghosts, style: w.vdw ? 'vdw' : 'ball' }); renderStage.look = look; renderStage.grid = null; }
    if (force || renderStage.grid !== grid) { stage.setGrid(w.grid ? { h: v.hgrid, crmult: v.crmult, frmult: v.frmult } : null); renderStage.grid = grid; }
    const c = OND.chem.composition(sys), keys = Object.keys(c).sort((a, b) => (c.C ? (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)) : c[b] - c[a]));
    $('#sys-name').textContent = sys.name;
    $('#sys-blurb').textContent = step && step.kind !== 'structure' ? step.title + ' · ' + scene.text : sys.blurb;
    $('#inset-cap').textContent = sys.name + ' · ' + scene.text;
    $('#sys-chips').replaceChildren(...[keys.map((k) => k + (c[k] > 1 ? sub(c[k]) : '')).join(''), sys.atoms.length + ' atoms', BC[sys.bc]].map((t) => h('span', { class: 'chip' }, t)));
    $$('#viewbar .tog').forEach((b) => { b.setAttribute('aria-pressed', String(!!w[b.dataset.view])); b.disabled = b.dataset.view === 'ghosts' && sys.bc === 'free'; });
    const L = $('#legend'), css = (n) => 'background:var(' + n + ')';
    if (w.grid) L.replaceChildren(h('span', {}, h('i', { style: css('--fg-3') }), 'coarse region'), h('span', {}, h('i', { style: css('--accent') }), 'fine region'), h('span', {}, 'h = ' + v.hgrid.toFixed(2) + ' bohr, as this step is set'));
    L.hidden = !w.grid; $('#hint').hidden = w.grid;
  }
  function themeColors() {
    const css = getComputedStyle(document.documentElement), g = (n) => css.getPropertyValue(n).trim();
    stage.setColors({ coarse: g('--fg-3'), fine: g('--accent'), pos: g('--pos'), neg: g('--neg'), dens: g('--accent'), sel: g('--fg'), cell: g('--fg-3') });
  }

  // ------------------------------------------------------------------ the rail: the study
  /* A combination as it is written: 2 × E(a) + E(b) − E(c). */
  function formulaOf(step, name) {
    return M.termsOf(step).map((t, i) => (t.c < 0 ? (i ? ' − ' : '−') : i ? ' + ' : '') + (Math.abs(t.c) === 1 ? '' : +Math.abs(t.c).toPrecision(6) + ' × ') + (t.step ? name(t.step) : '?')).join('') || 'nothing yet';
  }
  /* What a step computes, as an equation: alone in the settings of the step, with the energies and the value in
     its results. The legend says which step each symbol is the energy of. */
  function equation(step, full, e) {
    e = e || Q.of(step);
    if (!e) return null;
    const tex = full ? e.tex : e.definition;
    const copy = h('button', { class: 'btn small', type: 'button', title: 'Copy the equation as LaTeX', onclick: (ev) => {
      const b = ev.currentTarget, done = (said) => { b.textContent = said; setTimeout(() => { b.textContent = 'Copy LaTeX'; }, 1800); };
      try { navigator.clipboard.writeText(tex).then(() => done('Copied'), () => done('Copy refused by the browser')); } catch (err) { done('Copy refused by the browser'); }
    } }, 'Copy LaTeX');
    return h('div', { class: 'eq' },
      h('div', { class: 'eq-head' }, h('p', {}, e.head || (e.name ? e.name[0].toUpperCase() + e.name.slice(1) : M.isSeries(step) ? 'What this series follows' : 'What this step computes')), copy),
      h('div', { class: 'eq-math' }, math(tex, e.plain, true)),
      h('dl', { class: 'eq-where' }, e.where.filter((w) => full || !w.computed).flatMap((w) => [h('dt', {}, math(w.tex, w.plain)), h('dd', {}, w.text)])));
  }
  function summaryOf(step) {
    const L = step.links, t = (id) => (M.byId(id) ? M.byId(id).title : '?');
    if (M.isCalc(step)) {
      const own = M.ownOf(step), bits = Object.keys(step.own.v).filter((k) => !(k === 'nspin')).map((k) => LABELS[k] ? LABELS[k].toLowerCase() + ' ' + String(step.own.v[k]) : k);
      const extra = Object.keys(own.expert).length + own.actions.length;
      const what = step.kind === 'relax' ? 'relax' + (bits.length ? ', ' + bits.join(', ') : '') : bits.join(', ') || (L.after ? 'same settings' : 'the first calculation');
      return (L.after ? 'after ' + t(L.after) + ' · ' : '') + (L.on && M.byId(L.on) ? 'on ' + t(L.on) + ' · ' : '') + what + (extra ? ' +' + extra : '') + (L.wavefunctions ? ' · wavefunctions of ' + t(L.wavefunctions) : '');
    }
    if (step.kind === 'structure') return step.sys.formula + ' · ' + step.sys.atoms.length + ' atom' + (step.sys.atoms.length > 1 ? 's' : '') + ' · ' + BC[step.sys.bc];
    if (step.kind === 'combination') return formulaOf(step, (s) => s.title);
    if (M.isSeries(step)) return t(L.of) + (L.relative_to ? ' − ' + t(L.relative_to) : '') + ' · ' + step.params.values.length + ' × ' + (LABELS[M.settingVaried(step)] || 'setting').toLowerCase();
    if (step.kind === 'choose') return 'on ' + t(L.among);
    if (step.kind === 'levels') return 'of ' + t(L.of);
    if (step.kind === 'difference') return t(L.a) + ' − ' + t(L.b);
    if (step.kind === 'target') return step.params.value + ' ± ' + step.params.within + ' ' + step.params.unit;
    return '';
  }
  /* The equation of a box of the graph: the right-hand side of a difference or of a short sum. */
  function texOf(step) {
    if (step.kind !== 'difference' && !(step.kind === 'combination' && M.termsOf(step).length <= 3)) return null;
    const e = Q.of(step);
    return e ? e.short : null;
  }
  function resultOf(step) {
    const s = M.status(step);
    if (M.isCalc(step) && s.state === 'done') return 'E = ' + fx(M.energy(step), 6) + ' Ha';
    if (step.kind === 'converge' && s.state === 'done') { const p = M.series(step).proposed; return p == null ? 'not converged in this range' : 'proposes ' + p; }
    if (step.kind === 'vary' && s.state === 'done') return M.series(step).rows.map((r) => r.value + ' ' + fx(r.quantity, 2)).join(' · ');
    if (step.kind === 'levels' && s.state === 'done') { const l = M.levels(step); return l ? 'HOMO ' + fx(l.homo, 2) + (l.gap ? ' · gap ' + fx(l.gap[0], 2) : '') + ' eV' : 'no levels in this log'; }
    if (step.kind === 'choose') { const v = M.retained(step); return v == null ? s.text : '= ' + v + (step.params.retained != null ? ' (you)' : ''); }
    if (step.kind === 'combination' && s.state === 'done') { const d = M.combination(step); return fx(d.value, d.unit === 'Ha' ? 6 : 3) + ' ' + d.unit + (d.target ? (d.agrees ? ' ✓' : ' ✗') : ''); }
    if (step.kind === 'difference' && s.state === 'done') { const d = M.difference(step); return fx(d.value, d.unit === 'Ha' ? 6 : 3) + ' ' + d.unit + (d.target ? (d.agrees ? ' ✓' : ' ✗') : ''); }
    return s.state === 'given' ? '' : s.text;
  }
  function renderRail() {
    const sys = study.sys, item = (id, kind, title, subText, res, state, n) => h('li', {}, h('button', { class: 'pstep k-' + kind, type: 'button', 'aria-pressed': String(ui.sel === id), 'data-step': id, onclick: () => select(id) },
      h('span', { class: 'glyph' }, h('span', {}, kind === 'system' ? GLYPH.system : String(n))), h('span', {}, h('b', {}, title), h('span', { class: 'sub' }, subText), res ? h('span', { class: 'res' }, res) : null),
      h('span', { class: 'pdot ' + state, title: state })));
    $('#steps').replaceChildren(item('system', 'system', sys.name, sys.atoms.length + ' atoms · ' + BC[sys.bc], '', 'done', 0),
      ...study.steps.map((s, i) => item(s.id, s.kind, s.title, summaryOf(s), resultOf(s), M.status(s).state === 'given' ? 'done' : M.status(s).state, i + 1)));
    // the palette: every step of the registry, grouped as the registry groups them
    const open = $('#add-open'), pal = $('#palette');
    open.setAttribute('aria-expanded', String(ui.palette)); open.textContent = ui.palette ? 'Close' : '+ Add a step';
    pal.hidden = !ui.palette;
    if (ui.palette) {
      const families = [...new Set(OND.steps.map((s) => s.family))];
      pal.replaceChildren(...families.flatMap((f) => [h('h4', {}, f), ...OND.steps.filter((s) => s.family === f).map((s) => {
        const why = M.cannotAdd(s.name, ui.sel);
        return h('button', { class: 'pal', type: 'button', disabled: !!why, 'data-add': s.name, onclick: () => { const step = M.add(s.name, ui.sel); select(step.id); } },
          h('b', {}, M.TITLES[s.name]), h('span', {}, s.summary), why ? h('i', {}, why) : null);
      })]));
    }
    const done = study.steps.filter((s) => ['done', 'given'].includes(M.status(s).state)).length;
    $('#progress').textContent = study.steps.length ? done + ' of ' + study.steps.length + ' steps done' : 'no step yet';
    $('#compute-all').disabled = L.state.busy || !M.readyRuns().length;
    renderMode();
  }
  /* Where the results come from: the recorded library, or BigDFT now. The choice exists only when a server answers. */
  function renderMode() {
    const info = L.state.info, on = M.live.on, haps = info && info.haps;
    $('#mode').hidden = !info; $('header.top').classList.toggle('with-mode', !!info);
    $$('#mode button').forEach((b) => { b.setAttribute('aria-pressed', String((b.dataset.mode === 'live') === on)); b.disabled = L.state.busy; });
    $('#stop').hidden = !L.state.busy; $('#compute-all').hidden = L.state.busy;       // one or the other: the wave is computed, or can be
    const honest = $('#honest');
    honest.className = 'pill' + (on ? (haps.ok ? ' live' : ' down') : ' example');
    // beside the switch the words are short, so that the header keeps to one line; the title says the rest
    honest.textContent = !info ? 'Mock-up · real results for water' : !on ? 'Recorded results' : !haps.ok ? 'HAPS not ready' : L.state.busy ? 'Computing…' : 'HAPS ready';
    honest.title = !on ? 'A web page cannot start BigDFT. The results shown were computed with BigDFT 1.9.1 for this mock-up, for water; a step whose calculation is not among them says so.'
      : (haps.ok ? 'Every step is computed now: checked by BigDFT’s dry run, then run on the HAPS' + (info.bridge ? ' through ' + info.bridge : '') + '. ' + (haps.wavefunctions ? '' : 'This HAPS does not take wavefunctions: a step that starts from those of another is refused. ')
        + (info.workdir ? 'The runs are kept in ' + info.workdir + ', one directory per user and per study.' : 'The results are kept with your study.') : haps.text);
  }
  function setMode(live) {
    if (L.state.busy || !L.state.info) return;
    M.setLive(live); refresh(true);
    if (live) L.probe().then(() => refresh());       // the HAPS may have come up, or gone, since the page was opened
  }

  // ------------------------------------------------------------------ inspector: controls (as in the first workshop)
  const seg = (opts, cur, on) => h('div', { class: 'seg' }, opts.map(([val, label]) => h('button', { type: 'button', 'aria-pressed': String(val === cur), onclick: () => on(val) }, label)));
  function ctl(def) {
    const k = def.k, v = st.v[k], src = st.src[k], why = st.why[k], step = sel();
    const decided = src === 'decision', owner = src === 'inherited' ? M.ownerOf(step, k) : null;
    let body;
    if (def.type === 'seg') body = seg(def.opts, v, (val) => bp.set(k, val));
    else if (def.type === 'toggle') body = h('div', { class: 'ctl-val' }, h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!v), 'aria-label': def.label, onclick: () => bp.set(k, !v) }), h('span', { style: 'color:var(--fg-2);font-size:13px' }, def.text ? def.text(v) : v ? 'on' : 'off'));
    else if (def.type === 'step') body = h('div', { class: 'ctl-val' }, h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Decrease', onclick: () => bp.set(k, Math.max(def.min, v - (def.step || 1))) }, '−'), h('output', {}, def.fmt ? def.fmt(v) : String(v)),
      h('button', { type: 'button', 'aria-label': 'Increase', onclick: () => bp.set(k, Math.min(def.max, v + (def.step || 1))) }, '+')), def.unit ? h('span', { style: 'color:var(--fg-3);font-size:12px' }, def.unit) : null);
    else {
      const out = h('output', {}, fr(v, def.dec) + ' ' + def.unit);
      body = h('div', { class: 'ctl-val' }, h('input', { type: 'range', id: 'ctl-' + k, min: def.min, max: def.max, step: def.step, value: v, 'aria-label': def.label,
        oninput: (e) => { ui.drag = true; out.textContent = fr(+e.target.value, def.dec) + ' ' + def.unit; bp.set(k, +e.target.value); }, onchange: () => { ui.drag = false; refresh(); } }), out);
    }
    if (decided) body = h('div', { class: 'ctl-val' }, h('output', {}, (def.dec != null ? fr(v, def.dec) : String(v)) + (def.unit ? ' ' + def.unit : '')));
    const d = decided ? M.decisionsBefore(step).reverse().find((x) => x.key === k) : null;
    return h('div', { class: 'ctl', id: 'row-' + k },
      h('div', { class: 'ctl-head' }, h('b', {}, def.label), P[k][1] ? h('code', {}, P[k][1]) : null), body,
      def.help && !decided ? h('p', { style: 'font-size:12px;color:var(--fg-3)' }, def.help) : null,
      h('div', { class: 'prov' }, h('span', { class: 'src-chip src-' + src }, SRC[src] || src),
        h('div', {}, decided ? 'Decided in “' + d.step.title + '”, for every step after it.' : owner ? 'Set in “' + owner.title + '”. Change it here and only this step and what follows it differ.' : why ? why.reason : src === 'default' ? 'The code’s own value.' : src === 'you' ? 'Changed in this step.' : '',
          why && !decided ? h('div', { class: 'trip', html: '(' + esc(why.triplet[0]) + ') <em>' + esc(why.triplet[1]) + '</em> (' + esc(why.triplet[2]) + ')' }) : null,
          decided ? h('button', { class: 'btn small', type: 'button', style: 'margin-top:4px', onclick: () => select(d.step.id) }, 'Go to the decision') : null,
          src === 'you' ? h('button', { class: 'btn small', type: 'button', style: 'margin-top:4px', onclick: () => { bp.reset(k); onEdit(); loadSelected(); refresh(); } }, step.links.after ? 'Inherit again' : 'Back to the advice') : null)));
  }
  function controls(id) {
    const sys = st.sys, per = sys.bc !== 'free', v = st.v;
    return ({
      theory: [
        { k: 'xc', label: 'Exchange-correlation', type: 'seg', opts: [['LDA', 'LDA'], ['PBE', 'PBE'], ['PBE0', 'PBE0'], ['B3LYP', 'B3LYP'], ['HF', 'Hartree-Fock']] },
        { k: 'charge', label: 'Total charge', type: 'step', min: -4, max: 4, fmt: (x) => (x > 0 ? '+' : '') + x, unit: 'e' },
        { k: 'nspin', label: 'Spin', type: 'seg', opts: [[1, 'Unpolarised'], [2, 'Collinear']] },
        v.nspin !== 1 && { k: 'mpol', label: 'Unpaired electrons', type: 'step', min: 0, max: 12 },
        { k: 'dispersion', label: 'Dispersion (Grimme D3)', type: 'toggle' },
      ],
      accuracy: [
        { k: 'hgrid', label: 'Grid spacing', type: 'range', min: 0.25, max: 0.65, step: 0.01, dec: 2, unit: 'bohr', help: 'The smaller the spacing, the richer the basis. Turn on “Wavelet grid” in the scene to watch it tighten.' },
        { k: 'crmult', label: 'Extent of the coarse region', type: 'range', min: 3, max: 10, step: 0.5, dec: 1, unit: '× radius' },
        { k: 'frmult', label: 'Extent of the fine region', type: 'range', min: 4, max: 12, step: 0.5, dec: 1, unit: '× radius' },
        { k: 'gnrm', label: 'Convergence criterion', type: 'seg', opts: [[1e-3, '10⁻³'], [1e-4, '10⁻⁴'], [1e-5, '10⁻⁵'], [1e-6, '10⁻⁶']] },
        { k: 'algo', label: 'Algorithm', type: 'seg', opts: [['cubic', 'Cubic'], ['linear', 'Linear']] },
      ],
      environment: [
        per && { k: 'kpt', label: 'k-points (Monkhorst-Pack)', type: 'step', min: 1, max: 8, fmt: (n) => (sys.bc === 'surface' ? n + '×1×' + n : n + '×' + n + '×' + n) },
        { k: 'solvent', label: 'Implicit solvent', type: 'seg', opts: [['none', 'Vacuum'], ['water', 'Water'], ['ethanol', 'Ethanol'], ['mesitylene', 'Mesitylene']] },
        { k: 'efield', label: 'Electric field along y', type: 'range', min: -0.01, max: 0.01, step: 0.001, dec: 3, unit: 'Ha/bohr' },
      ],
      observables: [
        { k: 'density', label: 'Electron density', type: 'toggle', text: (x) => (x ? 'written as a cube file' : 'not written') },
        { k: 'nplot', label: 'Orbitals around the Fermi level', type: 'step', min: 0, max: 8 },
        { k: 'dipole', label: 'Dipole moment', type: 'toggle' },
      ],
    })[id].filter(Boolean);
  }
  const SECTIONS = [['theory', 'Theory', 'the level at which electrons are described'], ['accuracy', 'Accuracy', 'the wavelet grid and convergence'], ['environment', 'Environment', 'what surrounds the system'], ['observables', 'Observables', 'what is written besides the energy']];

  const parseList = (text) => {
    const parts = text.trim().replace(/^[\[(]\s*|\s*[\])]$/g, '').split(/[\s,;]+/).filter(Boolean), out = parts.map(Number);
    return parts.length && out.every(Number.isFinite) ? out : null;
  };
  /* One control per input action of PyBigDFT's registry (see the first workshop). */
  function actionCard(def) {
    const applied = bp.appliedAction(def.name), draft = ui.acts[def.name] || (ui.acts[def.name] = Object.assign({}, applied ? applied.args : {}));
    const value = (p) => (p.name in draft ? draft[p.name] : p.default), changed = (p) => JSON.stringify(value(p)) !== JSON.stringify(p.default);
    const args = () => Object.fromEntries(def.params.filter(changed).map((p) => [p.name, value(p)]));
    const usable = def.writes !== null, invalid = new Set(), call = h('code', {}), writesBox = h('div', {}), problem = h('p', { class: 'act-note err', hidden: true });
    const sync = () => {
      call.textContent = bp.actionCall(def.name, args()); problem.hidden = !invalid.size;
      problem.textContent = invalid.size ? 'Not understood: ' + [...invalid].join(', ') + '. A list is numbers separated by commas or spaces.' : '';
      if (!usable) return;
      const writes = bp.actionWrites(def.name, args());
      writesBox.replaceChildren(writes.length ? h('ul', { class: 'act-writes' }, writes.map(([path, v, known]) => h('li', {}, h('code', {}, path), ' = ', known ? h('code', {}, JSON.stringify(v)) : h('i', {}, 'computed by PyBigDFT'))))
        : h('p', { class: 'act-note' }, 'With these arguments it writes nothing in the input.'));
    };
    const take = (p, v, el) => { if (v === null) { invalid.add(p.name); el.setAttribute('aria-invalid', 'true'); } else { invalid.delete(p.name); el.removeAttribute('aria-invalid'); draft[p.name] = v; } sync(); };
    const field = (p) => {
      const id = 'act-' + def.name + '-' + p.name;
      if (p.kind === 'bool') return h('button', { class: 'tog', id, type: 'button', role: 'switch', 'aria-checked': String(!!value(p)), 'aria-label': p.name, onclick: (e) => { draft[p.name] = !value(p); e.currentTarget.setAttribute('aria-checked', String(draft[p.name])); e.currentTarget.textContent = draft[p.name] ? 'True' : 'False'; sync(); } }, value(p) ? 'True' : 'False');
      if (p.kind === 'number') return h('input', { id, type: 'text', inputmode: 'decimal', value: String(value(p)), 'aria-label': p.name, oninput: (e) => { const t = e.target.value.trim().replace(',', '.'); take(p, t === '' ? p.default : (Number.isFinite(Number(t)) ? Number(t) : null), e.target); } });
      if (p.kind === 'text') return h('input', { id, type: 'text', value: value(p), 'aria-label': p.name, oninput: (e) => take(p, e.target.value, e.target) });
      if (p.kind === 'list') return h('input', { id, type: 'text', value: value(p).join(', '), 'aria-label': p.name, oninput: (e) => take(p, e.target.value.trim() === '' ? p.default : parseList(e.target.value), e.target) });
      return h('code', {}, p.kind === 'required' ? 'required' : p.shown);
    };
    const card = h('div', { class: 'act' + (applied ? ' on' : ''), 'data-action': def.name },
      h('div', { class: 'act-head' }, call, applied ? h('span', { class: 'pill' }, 'applied') : null),
      h('p', { class: 'act-sum' }, (def.summary || 'No docstring in PyBigDFT for this action.').replace(/``/g, '')),
      def.params.length ? h('div', { class: 'act-args' }, def.params.map((p) => h('label', {}, h('span', {}, p.name), field(p)))) : null,
      usable ? writesBox : h('p', { class: 'act-note' }, 'Not offered here: it was ' + def.note + '.'), problem,
      usable ? h('div', { class: 'act-do' }, h('button', { class: 'btn small' + (applied ? '' : ' cta'), type: 'button', onclick: () => { if (!invalid.size) bp.applyAction(def.name, args()); } }, applied ? 'Update' : 'Apply'),
        applied ? h('button', { class: 'btn small', type: 'button', onclick: () => { delete ui.acts[def.name]; bp.removeAction(def.name); } }, 'Remove') : null) : null);
    sync();
    return card;
  }
  function schemaRow(vr) {
    const cur = st.expert[vr.p], set = cur !== undefined;
    const parse = (s) => { if (s === '') return ''; try { return JSON.parse(s); } catch (e) { return s; } };
    const field = vr.e
      ? h('select', { class: set ? 'set' : '', 'aria-label': vr.p, onchange: (e) => bp.setExpert(vr.p, e.target.value === String(vr.d) ? '' : parse(e.target.value)) }, vr.e.map((o) => h('option', { value: String(o), selected: String(set ? cur : vr.d) === String(o) }, String(o))))
      : h('input', { class: set ? 'set' : '', 'aria-label': vr.p, value: set ? (typeof cur === 'string' ? cur : JSON.stringify(cur)) : '', placeholder: typeof vr.d === 'string' ? vr.d : JSON.stringify(vr.d), onchange: (e) => bp.setExpert(vr.p, parse(e.target.value.trim())) });
    return h('div', { class: 'vrow' }, h('code', {}, vr.p), field, h('small', {}, vr.c + (vr.r ? ' · from ' + vr.r[0] + ' to ' + vr.r[1] : '')));
  }

  // ------------------------------------------------------------------ inspector, per kind of step
  const field = (label, control, help) => h('label', { class: 'field2' }, h('span', {}, label), control, help ? h('small', {}, help) : null);
  const stepSelect = (step, role, test, optional, label) => field(label, h('select', { 'aria-label': label, onchange: (e) => { if (e.target.value) step.links[role] = e.target.value; else delete step.links[role]; M.touch(); loadSelected(); refresh(true); } },
    optional ? h('option', { value: '', selected: !step.links[role] }, optional) : null,
    study.steps.filter((s) => s !== step && M.at(s) < M.at(step) && test(s)).map((s) => h('option', { value: s.id, selected: step.links[role] === s.id }, s.title))));
  const number = (step, key, label, help, scale) => field(label, h('input', { type: 'text', inputmode: 'decimal', value: String(+(step.params[key] * (scale || 1)).toPrecision(10)), 'aria-label': label,
    onchange: (e) => { const x = Number(e.target.value.replace(',', '.')); if (Number.isFinite(x)) { step.params[key] = x / (scale || 1); M.touch(); } refresh(); } }), help);

  /* Compute one step, or what is ready. On recorded results it is immediate; for real, the server is asked wave after wave. */
  function compute(step, tab) {
    if (tab) ui.tab = tab;
    if (!M.live.on) { M.compute(step); refresh(true); return; }
    if (!L.state.busy) T.flush().then(() => L.compute(step, () => refresh(true)));       // the server computes a study it holds: saved first
    refresh(true);
  }
  const again = (step) => h('button', { class: 'btn small', type: 'button', disabled: L.state.busy, onclick: () => { L.retry(step); compute(step, 'results'); } }, 'Try again');
  function computeRow(step) {
    const s = M.status(step), runs = M.readyRuns(step);
    return h('div', { class: 'compute-row' },
      s.state === 'ready' ? h('button', { class: 'btn cta', type: 'button', id: 'compute-step', disabled: L.state.busy, onclick: () => compute(step, 'results') }, 'Compute this step' + (runs.length > 1 ? ' · ' + runs.length + ' runs' : ''))
        : h('span', { class: 'pill' + (s.state === 'running' ? ' busy' : '') }, s.state === 'done' ? 'computed' : s.state === 'blocked' ? 'waits' : s.state === 'refused' ? 'to fix' : s.state === 'running' ? 'on the HAPS' : s.state === 'failed' ? 'not computed' : 'not available'),
      s.state === 'failed' ? again(step) : null,
      h('span', { style: 'font-size:12px;color:var(--fg-3)' }, s.state === 'ready' || s.state === 'done' ? '' : s.text));
  }
  // ------------------------------------------------------------------ where a structure comes from
  /* The same sources for the system of the study and for a structure step: the built-in ones, one atom, a file
     of the disk, a molecule by its name. Whatever the source, the structure ends the same object. */
  function sourcesPanel(step) {
    const cur = step ? step.sys : study.sys, said = h('p', { class: 'figmeta', role: 'status' });
    const give = (sys) => { M.setStructure(step, sys); ui.geo = ''; loadSelected(); refresh(true); };
    const fail = (e) => { said.className = 'figmeta err'; said.textContent = e.message + (e.detail ? ' ' + e.detail : ''); };
    const file = h('input', { type: 'file', accept: '.xyz,text/plain', 'aria-label': 'An .xyz file of your disk', 'data-source': 'file',
      onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { give(S.parseXyz(await f.text(), f.name, 'file ' + f.name)); } catch (err) { fail(err); } } });
    const name = h('input', { type: 'text', placeholder: 'ammonia, benzene, a name or a CID', 'aria-label': 'Name of a molecule', 'data-source': 'name', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); fetchIt(); } } });
    const go = h('button', { class: 'btn small', type: 'button', 'data-source': 'fetch', onclick: () => fetchIt() }, 'Fetch');
    async function fetchIt() {
      const asked = name.value.trim(); if (!asked) return;
      said.className = 'figmeta'; said.textContent = 'Looking for “' + asked + '”…'; go.disabled = true;
      try { const got = await L.structure(asked); give(S.parseXyz(got.xyz, got.name, got.source)); } catch (err) { fail(err); go.disabled = false; }
    }
    return [h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, step ? 'Where this structure comes from' : 'The system of this study')),
      cur.source ? h('p', { class: 'figmeta', style: 'margin:0' }, 'Now: ' + cur.name + ' (' + cur.formula + '), ' + cur.source + '.') : null,
      h('div', { class: 'cards' }, SYSTEMS.map(([id, label]) => h('button', { class: 'card', type: 'button', 'aria-pressed': String(cur.id === id), onclick: () => give(OND.chem.build(id)) }, h('b', {}, label), h('span', {}, { h2o: 'molecule · real results', c60: 'molecule, 60 atoms', 'gr-bz': 'surface, 72 atoms', si64: 'crystal, 64 atoms', ala20: 'peptide, 203 atoms' }[id])))),
      field('One atom', h('select', { 'aria-label': 'One atom', 'data-source': 'atom', onchange: (e) => { if (e.target.value) give(S.atom(e.target.value)); } },
        h('option', { value: '' }, 'an element…'), S.known().map((el) => h('option', { value: el, selected: cur.id === 'atom-' + el }, el + ' · ' + OND.chem.EL[el].name))), 'What an atomisation energy is counted from.'),
      field('A file of your disk', file, 'An .xyz file: in angstroem, unless its first line names another unit as BigDFT’s does.'),
      L.state.info ? field('A molecule by its name', h('div', { class: 'row2' }, name, go), 'Its 3D structure is fetched from PubChem by the server of the workshop.')
        : h('p', { class: 'figmeta' }, 'Served by backend/serve.py, the workshop also fetches a molecule by its name.'),
      said,
      h('p', { style: 'font-size:12px;color:var(--fg-3)' }, step ? 'A calculation placed on this structure is computed on it as it is given here. Changing it forgets the results computed on it.'
        : 'Every step of the study is computed on this structure, or on a geometry relaxed from it, unless it is placed on another one: add a “Structure” step for a second molecule or for an atom. Changing it keeps the steps and forgets their results.'))];
  }

  function calcPanel(step) {
    const kids = [], own = step.own, chips = Object.keys(own.v).filter((k) => k !== 'nspin' || !('mpol' in own.v)).map((k) => (LABELS[k] || k) + ': ' + String(own.v[k]))
      .concat(Object.keys(own.expert).map((p) => p + ' = ' + own.expert[p]), own.actions.map((a) => bp.actionCall(a.name, a.args)));
    if (step.links.after || study.steps.filter(M.isCalc).length > 1) kids.push(stepSelect(step, 'after', (s) => M.isCalc(s), step.kind === 'relax' ? null : 'nothing: it starts the study', 'Continues'));
    if (step.kind === 'calculation' && study.steps.some((s) => s.kind === 'structure' && M.at(s) < M.at(step))) kids.push(stepSelect(step, 'on', (s) => s.kind === 'structure', step.links.after ? 'the structure of the step it continues' : 'the system of the study', 'Computed on'),
      step.links.on && step.links.after ? h('p', { class: 'figmeta', style: 'margin:-4px 0 0' }, 'The same calculation as “' + M.byId(step.links.after).title + '”, on “' + M.byId(step.links.on).title + '”: its functional, its grid and its extents, on this structure as given.') : null);
    if (step.links.after) {
      kids.push(stepSelect(step, 'wavefunctions', (s) => M.isCalc(s), 'nothing: from scratch', 'Starts from the wavefunctions of'));
      const no = M.cannotRead(step);
      if (no) kids.push(h('div', { class: 'notice err' }, h('b', {}, 'To fix'), h('span', {}, 'This step cannot start there: ' + no + '. Wavefunctions can be read across functionals and grids, not across charges or spins.')));
      else if (step.links.wavefunctions) kids.push(h('p', { class: 'figmeta', style: 'margin:-4px 0 0' }, '“' + M.byId(step.links.wavefunctions).title + '” then writes its wavefunctions, and this step waits for it. The steps that continue this one start from scratch again.'));
    }
    kids.push(h('div', { class: 'field2' }, h('span', {}, step.links.after ? 'What this step changes' : 'What this step sets'),
      chips.length ? h('div', { class: 'own' }, chips.map((c) => h('span', { class: 'chip' }, c))) : h('small', {}, step.links.after ? 'Nothing yet: it repeats “' + M.byId(step.links.after).title + '”' + (step.kind === 'relax' ? ' and relaxes its geometry.' : '. Change a setting below.') : 'The advised values for this system. Change any of them below.')));
    kids.push(computeRow(step));
    for (const c of bp.checks()) if (c.level !== 'ok' && c.block !== 'machine' && c.block !== 'task') kids.push(h('div', { class: 'notice' + (c.level === 'err' ? ' err' : '') }, h('b', {}, c.level === 'err' ? 'To fix' : 'Good to know'), h('span', {}, c.text)));
    if (step.kind === 'relax') kids.push(h('details', { class: 'sec', open: true }, h('summary', {}, 'Relaxation', h('span', {}, 'how the atoms are moved')),
      field('Optimiser', seg([['SQNM', 'SQNM'], ['FIRE', 'FIRE'], ['LBFGS', 'L-BFGS']], step.params.method, (m) => { step.params.method = m; M.touch(); loadSelected(); refresh(); })),
      number(step, 'forcemax', 'Stop when the largest force is below (Ha/bohr)'), number(step, 'nsteps', 'Maximum number of steps')));
    kids.push(h('div', { class: 'seg', id: 'depth', role: 'group', 'aria-label': 'Depth of settings', style: 'margin:12px 0 2px' }, [[0, 'Settings'], [3, 'PyBigDFT actions'], [2, 'All variables']].map(([d, l]) => h('button', { type: 'button', 'aria-pressed': String(ui.depth === d), onclick: () => { ui.depth = d; refresh(); } }, l))));
    if (ui.depth === 0) for (const [id, label, role] of SECTIONS) kids.push(h('details', { class: 'sec', open: ui.open === id, ontoggle: (e) => { if (e.target.open) ui.open = id; else if (ui.open === id) ui.open = null; } }, h('summary', {}, label, h('span', {}, role)), controls(id).map(ctl)));
    if (ui.depth === 0) kids.push(equation(step));
    else if (ui.depth === 3) kids.push(h('p', { class: 'count' }, 'The ' + OND.actions.list.length + ' input actions of ' + OND.actions.version.split(',')[0] + ', drawn from its registry. One applied here belongs to this step and to those that continue it.'), ...OND.actions.list.map(actionCard));
    else {
      const q = ui.query.toLowerCase(), rows = SCHEMA.filter((x) => (q ? (x.p + ' ' + x.c).toLowerCase().includes(q) : x.t < 2));
      kids.push(h('input', { class: 'vsearch', id: 'vsearch', type: 'search', placeholder: 'Search the ' + SCHEMA.length + ' BigDFT variables', value: ui.query, 'aria-label': 'Search a variable', oninput: (e) => { ui.query = e.target.value; refresh(); const s = $('#vsearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }),
        h('p', { class: 'count' }, q ? rows.length + ' result' + (rows.length > 1 ? 's' : '') : 'The most used variables. Search to reach any of the ' + SCHEMA.length + '.'), ...rows.slice(0, 60).map(schemaRow));
    }
    return kids;
  }
  function decisionTable(step) {
    const conv = M.byId(step.links.among), s = M.series(conv), kept = M.retained(step), unit = s.relative ? 'eV' : 'eV/atom';
    if (!s.complete) return [h('p', { class: 'say' }, 'The decision is taken on the results of “' + conv.title + '”, which is not computed yet.')];
    if (conv.kind === 'vary') return [h('div', { class: 'scroll-x' }, h('table', { class: 'choice' }, h('thead', {}, h('tr', {}, ['Value', s.relative ? 'Difference (eV)' : 'Energy (eV)', s.target ? 'Target ' + s.target.value + ' ± ' + s.target.within : null, 'BigDFT time (s)', ''].filter(Boolean).map((c) => h('th', {}, c)))),
      h('tbody', {}, s.rows.map((r) => h('tr', { class: r.value === kept ? 'kept' : '' }, h('td', { class: 'num' }, String(r.value)), h('td', { class: 'num' }, fx(r.quantity, 4)), s.target ? h('td', {}, r.agrees ? 'within' : 'outside') : null, h('td', { class: 'num' }, fx(r.seconds, 0)),
        h('td', {}, r.value === kept ? h('span', { class: 'pill kept' }, 'kept') : h('button', { class: 'btn small', type: 'button', onclick: () => { step.params.retained = r.value; M.touch(); refresh(true); } }, 'Keep'))))))),
      h('p', { class: 'figmeta' }, 'Nothing is proposed here: these values do not converge towards one another. ' + (kept == null ? 'Keep one, and say why.' : 'You kept ' + kept + '.'))];
    return [h('div', { class: 'scroll-x' }, h('table', { class: 'choice' }, h('thead', {}, h('tr', {}, ['Value', s.relative ? 'Difference (eV)' : 'Energy (' + unit + ')', 'Off reference (meV)', 'BigDFT time (s)', 'Criterion', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, s.rows.map((r, i) => h('tr', { class: r.value === kept ? 'kept' : '' }, h('td', { class: 'num' }, String(r.value)), h('td', { class: 'num' }, fx(r.quantity, s.relative ? 4 : 5)), h('td', { class: 'num' }, i === s.rows.length - 1 ? 'reference' : fx(r.away * 1000, 1)), h('td', { class: 'num' }, fx(r.seconds, 0)),
        h('td', {}, r.value === s.proposed ? h('span', { class: 'pill' }, 'proposes') : r.away <= conv.params.within ? 'passes' : 'fails'),
        h('td', {}, r.value === kept ? h('span', { class: 'pill kept' }, 'kept') : h('button', { class: 'btn small', type: 'button', onclick: () => { step.params.retained = r.value === s.proposed ? null : r.value; M.touch(); refresh(true); } }, 'Keep'))))))),
      h('p', { class: 'figmeta' }, s.proposed == null ? 'No value of the series is within ' + fx(conv.params.within * 1000, 0) + ' meV of the last one: extend the series.' : 'The criterion (within ' + fx(conv.params.within * 1000, 0) + ' meV of the last value) proposes ' + s.proposed + ', the cheapest that passes. ' + (step.params.retained == null ? 'It is kept.' : 'You kept ' + kept + ' instead.'))];
  }
  function renderInspector() {
    const step = sel(), body = $('#insp-body'), kids = [];
    $('#insp-kind').textContent = step ? 'Step ' + (M.at(step) + 1) + ' · ' + KIND[step.kind] : KIND.system;
    $('#insp-role').textContent = ROLE[step ? step.kind : 'system'];
    const s = step ? M.status(step) : { state: 'done' };
    $('#insp-status').replaceChildren(h('span', { class: 'pdot ' + (s.state === 'given' ? 'done' : s.state) }));
    $('#insp-title').replaceChildren(step ? h('input', { class: 'insp-title-input', type: 'text', value: step.title, maxlength: 40, 'aria-label': 'Name of the step', onchange: (e) => { step.title = e.target.value.trim() || step.title; M.touch(); refresh(); } }) : h('h2', {}, study.sys.name));
    if (!step) {
      kids.push(...sourcesPanel(null));
      if (!M.live.on) kids.push(h('div', { class: 'notice' }, h('b', {}, study.sysId === 'h2o' ? 'Real results are bundled for water' : 'No recorded result for this system'), h('span', {}, 'A web page cannot start BigDFT. For water, ' + Object.keys(M.LIB).length + ' calculations were run with BigDFT 1.9.1 through the registry of steps, and a step whose input is one of them shows its real result. For any other system or setting the study is built and checked the same way, and says its result is not available here.')));
      if (!study.steps.length) kids.push(h('div', { class: 'compute-row' }, h('button', { class: 'btn cta', type: 'button', onclick: () => select(M.add('calculation', null).id) }, 'Add the first calculation')));
    } else if (step.kind === 'structure') {
      const on = study.steps.filter((x) => x.links.on === step.id);
      kids.push(...sourcesPanel(step), h('div', { class: 'compute-row' },
        h('button', { class: 'btn cta', type: 'button', onclick: () => select(M.add('calculation', step.id).id) }, on.length ? 'Add another calculation on it' : 'Add a calculation on it'),
        h('span', { style: 'font-size:12px;color:var(--fg-3)' }, study.steps.some(M.isCalc) ? 'With the settings of the first calculation of the study: the same calculation, on this structure.' : '')));
    } else if (step.kind === 'combination') {
      const terms = M.termsOf(step), calcs = study.steps.filter((x) => M.isCalc(x) && M.at(x) < M.at(step)), molecules = calcs.filter((x) => M.sysOf(x).atoms.length > 1);
      const put = (next) => { M.setTerms(step, next.filter((t) => t.step)); refresh(true); };
      kids.push(h('div', { class: 'field2' }, h('span', {}, 'Sum of'),
        h('div', { class: 'terms' }, terms.map((t, i) => h('div', { class: 'term' },
          h('input', { type: 'text', inputmode: 'decimal', value: String(t.c), 'aria-label': 'Coefficient of term ' + (i + 1), onchange: (e) => { const x = Number(e.target.value.replace(',', '.')); if (Number.isFinite(x) && x) { terms[i].c = x; put(terms); } else refresh(); } }),
          h('span', {}, '× E of'),
          h('select', { 'aria-label': 'Calculation of term ' + (i + 1), onchange: (e) => { terms[i].step = M.byId(e.target.value); put(terms); } }, calcs.map((x) => h('option', { value: x.id, selected: t.step === x }, x.title))),
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Remove term ' + (i + 1), disabled: terms.length < 2, onclick: () => put(terms.filter((_, n) => n !== i)) }, '×')))),
        h('div', {}, h('button', { class: 'btn small', type: 'button', disabled: !calcs.length, onclick: () => put(terms.concat([{ c: 1, step: calcs.find((x) => !terms.some((t) => t.step === x)) || calcs[0] }])) }, '+ Add a term')),
        h('small', {}, 'It has a meaning only if every term is computed the same way: same functional, same grid. A calculation placed “on” a structure and continuing another one is.')));
      if (molecules.length) {
        const of = terms.map((t) => t.step).reverse().find((x) => molecules.includes(x)) || molecules[molecules.length - 1];
        const lacking = Object.keys(OND.chem.composition(M.sysOf(of))).filter((el) => !M.atomCalc(el)), wanted = M.atomisationTerms(of);
        const same = wanted.length === terms.length && wanted.every((w, i) => w.step === terms[i].step && w.c === terms[i].c);
        if (lacking.length || !same) kids.push(h('div', { class: 'notice advice' }, h('b', {}, 'As an atomisation energy'),
          h('span', {}, 'Each atom of “' + of.title + '”, as many times as its structure holds it, minus “' + of.title + '” itself. ' + (lacking.length ? 'The study has no calculation on an isolated ' + lacking.join(', ') + ' atom yet.' : '')),
          h('div', { class: 'notice-actions' }, h('button', { class: 'btn small', type: 'button', id: 'fill-atomisation', onclick: () => { if (lacking.length) M.addAtoms(of, step); M.setTerms(step, M.atomisationTerms(of)); if (/^Combination( \d+)?$/.test(step.title)) step.title = 'Atomisation energy'; M.touch(); refresh(true); } },
            lacking.length ? 'Add the atoms of “' + of.title + '” and fill' : 'Fill from “' + of.title + '”'))));
      }
      kids.push(field('Unit', seg([['eV', 'eV'], ['kJ/mol', 'kJ/mol'], ['Ha', 'Ha']], step.params.unit, (u) => { step.params.unit = u; M.touch(); refresh(); })),
        stepSelect(step, 'against', (x) => x.kind === 'target', 'no target', 'Judged against'), equation(step));
    } else if (M.isCalc(step)) kids.push(...calcPanel(step));
    else if (M.isSeries(step)) {
      const setting = M.settingVaried(step), conv = step.kind === 'converge', text = setting === 'xc';
      const offered = M.VARIABLE.filter((x) => (conv ? ['hgrid', 'crmult', 'frmult', 'gnrm'] : ['xc', 'hgrid', 'crmult', 'frmult', 'gnrm', 'charge', 'mpol', 'tel']).includes(x.key));
      const XCS = ['LDA', 'PBE', 'PBE0', 'B3LYP', 'HF'];
      kids.push(stepSelect(step, 'of', (x) => x.kind === 'calculation', null, 'The calculation to vary'),
        stepSelect(step, 'relative_to', (x) => x.kind === 'calculation' && x.id !== step.links.of, 'nothing: its total energy', conv ? 'Watch its difference with' : 'Compare its difference with'),
        field('Setting varied', h('select', { 'aria-label': 'Setting varied', onchange: (e) => { M.vary(step, e.target.value); if (step.kind === 'choose') step.params.retained = null; for (const d of M.dependents(step)) if (d.kind === 'choose') d.params.retained = null; M.touch(); refresh(true); } },
          offered.map((x) => h('option', { value: x.key, selected: x.key === setting }, (LABELS[x.key] || x.key) + '  ·  ' + x.action + (x.argument ? ', ' + x.argument : '')))), 'Any argument of an input action of PyBigDFT’s registry that writes one setting.'),
        text ? field('Values', h('div', { class: 'pick' }, XCS.map((x) => h('button', { class: 'tog', type: 'button', 'aria-pressed': String(step.params.values.includes(x)), onclick: () => { const v = XCS.filter((y) => (y === x) !== step.params.values.includes(y)); if (v.length) { step.params.values = v; M.touch(); } refresh(true); } }, x))))
          : field(conv ? 'Values, from the cheapest to the most accurate' : 'Values', h('input', { type: 'text', value: step.params.values.join(', '), 'aria-label': 'Values', onchange: (e) => { const v = parseList(e.target.value); if (v && v.length > (conv ? 1 : 0)) { step.params.values = v; M.touch(); } refresh(true); } }), conv ? 'The last one is the reference.' : null),
        conv ? number(step, 'within', 'Converged when within (meV' + (step.links.relative_to ? '' : ' per atom') + ')', 'of the reference', 1000) : stepSelect(step, 'against', (x) => x.kind === 'target', 'no target', 'Each value judged against'),
        equation(step), computeRow(step));
    } else if (step.kind === 'choose') {
      const among = M.byId(step.links.among);
      kids.push(stepSelect(step, 'among', M.isSeries, null, 'Decides on'), ...decisionTable(step));
      if (step.params.retained != null) kids.push(field(among.kind === 'vary' ? 'Why this value' : 'Why this value and not the proposed one', h('input', { type: 'text', value: step.params.because || '', placeholder: 'the reason is kept with the study', 'aria-label': 'Reason', onchange: (e) => { step.params.because = e.target.value; M.touch(); refresh(); } })),
        among.kind === 'vary' ? null : h('div', { class: 'compute-row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { step.params.retained = null; M.touch(); refresh(true); } }, 'Back to what the criterion proposes')));
      kids.push(h('p', { class: 'figmeta' }, 'Every calculation placed after this step uses the kept value. Changing it sends them back to “to compute”.'));
    } else if (step.kind === 'levels') {
      kids.push(stepSelect(step, 'of', M.isCalc, null, 'Levels of'),
        h('p', { class: 'figmeta' }, 'Nothing more is computed: the levels are in the log of that calculation. For a gap it must hold empty states: add an “Empty states” step and read its levels.'));
    } else if (step.kind === 'difference') {
      kids.push(stepSelect(step, 'a', M.isCalc, null, 'Energy of'), stepSelect(step, 'b', M.isCalc, null, 'minus energy of'),
        field('Unit', seg([['eV', 'eV'], ['kJ/mol', 'kJ/mol'], ['Ha', 'Ha']], step.params.unit, (u) => { step.params.unit = u; M.touch(); refresh(); })),
        stepSelect(step, 'against', (x) => x.kind === 'target', 'no target', 'Judged against'), equation(step));
    } else if (step.kind === 'target') {
      kids.push(number(step, 'value', 'Reference value'), number(step, 'within', 'Agreement within ±'),
        field('Unit', seg([['eV', 'eV'], ['kJ/mol', 'kJ/mol'], ['Ha', 'Ha']], step.params.unit, (u) => { step.params.unit = u; M.touch(); refresh(); })),
        field('Where it comes from', h('input', { type: 'text', value: step.params.source || '', placeholder: 'experiment, paper, another calculation', 'aria-label': 'Source', onchange: (e) => { step.params.source = e.target.value; M.touch(); refresh(); } })),
        h('p', { class: 'figmeta' }, 'Set it before computing, and leave it alone afterwards: a result is judged against it, never tuned towards it.'));
    }
    if (step) {
      const deps = M.dependents(step);
      kids.push(h('div', { class: 'compute-row', style: 'border:0' }, deps.length ? h('span', { style: 'font-size:12px;color:var(--fg-3)' }, 'Used by ' + deps.map((d) => '“' + d.title + '”').join(', ') + ': remove those first.')
        : h('button', { class: 'btn small', type: 'button', onclick: () => { M.remove(step); select('system'); } }, 'Remove this step')));
    }
    body.replaceChildren(...kids.filter(Boolean));
  }

  // ------------------------------------------------------------------ results, step by step
  const figure = (spec, height) => { const host = h('div', { class: 'figure' }); setTimeout(() => OND.figure.render(host, spec, { preset: 'screen', panelHeight: height || 190 }), 0); return host; };
  const facts = (rows) => h('dl', { class: 'facts2' }, rows.filter(Boolean).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const real = (run) => (M.live.on ? h('p', { class: 'figmeta' }, 'Computed just now with BigDFT ' + run.version + ' on the HAPS (run ', h('code', {}, run.name), '), ' + fx(run.wall, 1) + ' s on ' + run.omp + ' threads. Every number here is read from its log, kept in ', h('code', {}, M.live.dir + '/runs'), '.')
    : h('p', { class: 'figmeta' }, 'Computed with BigDFT ' + run.version + ' for this mock-up (run ', h('code', {}, run.name), ' of the library), ' + fx(run.wall, 1) + ' s on ' + run.omp + ' threads. Every number here is read from its log.'));
  function waiting(step) {
    const s = M.status(step), runs = M.runsOf(step);
    if (s.state === 'running') return [h('p', { class: 'say' }, h('b', {}, 'On its way. '), runs.length > 1 ? s.text + '. ' : 'This step is ' + (runs[0].busy.state === 'checking' ? 'being checked by BigDFT’s dry run' : 'computing on the HAPS') + '. ', 'Its result appears here when BigDFT ends; the “Log” tab follows the wave.')];
    if (s.state === 'failed') return [h('p', { class: 'say' }, h('b', {}, 'Not computed. '), s.text),
      h('p', { class: 'figmeta' }, 'Nothing is shown for it. Change what the message points at, or try again if the cause was on the HAPS side: a run that failed is not sent again by itself.'),
      h('div', {}, again(step))];
    if (s.state === 'refused') return [h('p', { class: 'say' }, h('b', {}, 'Cannot be computed as it is. '), 'This step asks to start from wavefunctions it cannot read: ' + s.text + '. Choose another step to start from, or none.')];
    if (s.state === 'ready') return [h('p', { class: 'say' }, h('b', {}, 'Ready. '), M.live.on ? 'Nothing stops this step. BigDFT checks its input first (a dry run), then computes it on the HAPS. ' : 'Nothing stops this step: its input is written and checked. ', runs.length > 1 ? runs.length + ' runs would be sent.' : ''),
      h('div', {}, h('button', { class: 'btn cta', type: 'button', disabled: L.state.busy, onclick: () => compute(step) }, 'Compute this step'))];
    if (s.state === 'blocked') return [h('p', { class: 'say' }, h('b', {}, 'Not yet. '), 'This step ' + s.text + '. Compute what comes before it, or press “Compute what is ready”: the study is sent wave after wave.')];
    return [h('p', { class: 'say' }, h('b', {}, 'No recorded result for this input. '), 'This mock-up holds real BigDFT results for a set of calculations on water; this one is not among them' + (study.sysId === 'h2o' ? ' (' + s.text + ')' : '') + '. On the platform the step would be sent to the HAPS as:'),
      h('pre', { class: 'wave' }, 'haps_bigdft(names=[' + runs.map((r) => '"' + r.name + '"').join(', ') + '], directory="runs")'),
      h('p', { class: 'figmeta' }, 'The input it would send is in the “Input” tab, and it is exact.')];
  }
  function geometryNote(run, step) {
    const sys = M.sysOf(step), start = sys.atoms.map((a) => a.p.map((x, d) => x + sys.origin[d])), end = run.relax.final.map((f) => f.slice(1));
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const move = Math.max(...start.map((p, i) => dist(p, end[i])));
    const rows = [['Largest displacement', fx(move, 3) + ' Å']];
    if (sys.atoms.length === 3) {
      const c = sys.atoms.findIndex((a) => a.el !== sys.atoms[(sys.atoms.findIndex((b) => b.el !== a.el) + 1) % 3].el && sys.atoms.filter((b) => b.el === a.el).length === 1), o = c < 0 ? 0 : c, [i, j] = [0, 1, 2].filter((x) => x !== o);
      const ang = (P3) => { const u = P3[i].map((x, d) => x - P3[o][d]), w = P3[j].map((x, d) => x - P3[o][d]); return Math.acos((u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w))) * 180 / Math.PI; };
      rows.push(['Bond length', fx(dist(start[o], start[i]), 3) + ' → ' + fx(dist(end[o], end[i]), 3) + ' Å'], ['Angle', fx(ang(start), 1) + '° → ' + fx(ang(end), 1) + '°']);
    }
    return rows;
  }
  // ---- what the log holds: one view per attribute of PyBigDFT's registry of log attributes (BigDFT.Logfiles.BUILTIN)
  /* Words and units for the attributes this workshop knows. One it does not know is shown under its own name, by the shape of its value. */
  const LOGWORDS = { energy: ['Total energy', 'Ha'], hartree_energy: ['Hartree energy', 'Ha'], XC_energy: ['Exchange-correlation energy', 'Ha'], trVxc: ['Integral of the XC potential', 'Ha'], ionic_energy: ['Ion-ion energy', 'Ha'], trH: ['Trace of the Hamiltonian', 'Ha'],
    fermi_level: ['Highest occupied level', 'Ha'], evals: ['Energy levels', ''], forces: ['Forces on the atoms', 'Ha/bohr'], forcemax: ['Largest force', 'Ha/bohr'], force_fluct: ['Noise on the forces', 'Ha/bohr'], forcemax_cv: ['Force criterion asked', 'Ha/bohr'],
    dipole: ['Dipole moment', 'a.u.'], magnetization: ['Total magnetisation', 'µB'], pressure: ['Pressure', 'GPa'], stress_tensor: ['Stress tensor', 'Ha/bohr³'], astruct: ['Atomic structure', ''], electrostatic_multipoles: ['Atomic multipoles', ''], support_functions: ['Moments of the support functions', ''],
    memory_peak: ['Memory peak, estimated', 'MB'], memory_run: ['Memory of the run stages', 'MB'], memory_quantities: ['Memory of the main quantities', 'MB'], nat: ['Atoms', ''], number_of_orbitals: ['Occupied orbitals', ''], grid_spacing: ['Grid spacing', 'bohr'], rmult: ['Extents, coarse and fine', '× radius'],
    XC_parameter: ['Functional, as the code names it', ''], spin_polarization: ['Spin treatment (nspin)', ''], total_magn_moment: ['Unpaired electrons (mpol)', ''], system_charge: ['Total charge', 'e'], gnrm_cv: ['Convergence criterion asked', ''], kpts: ['k-points', ''], kpt_mesh: ['k-point mesh', ''],
    symmetry: ['Symmetry', ''], data_directory: ['Data directory', ''], posinp_file: ['Structure read from', ''], sdos: ['Files of the density of states', ''] };
  const num = (x) => (typeof x === 'number' ? String(x).replace('-', '−').replace('e', '×10^') : String(x));
  const perAtom = (v) => Array.isArray(v) && v.length > 0 && v.every((a) => a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).some((k) => Array.isArray(a[k]) && a[k].length === 3 && a[k].every((x) => typeof x === 'number')));
  const atomTable = (v, unit, norm) => h('table', {}, h('thead', {}, h('tr', {}, ['Atom', 'x', 'y', 'z' + (unit && !norm ? ' (' + unit + ')' : ''), norm ? 'norm' + (unit ? ' (' + unit + ')' : '') : null].filter(Boolean).map((c) => h('th', {}, c)))),
    h('tbody', {}, v.slice(0, 24).map((a, i) => { const el = Object.keys(a).find((k) => Array.isArray(a[k])), q = a[el]; return h('tr', {}, h('td', {}, el + (i + 1)), q.map((x) => h('td', { class: 'num' }, x.toFixed(6).replace('-', '−'))), norm ? h('td', { class: 'num' }, Math.hypot(...q).toFixed(6)) : null); })),
    v.length > 24 ? h('caption', { style: 'caption-side:bottom;text-align:left;color:var(--fg-3)' }, 'first 24 of ' + v.length + ' atoms') : null);
  function logValue(name, value, unit) {
    if (typeof value === 'number') return num(value) + (unit ? ' ' + unit : '');
    if (typeof value === 'string' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value) && value.every((x) => typeof x === 'number')) return '[' + value.map(num).join(', ') + ']' + (unit ? ' ' + unit : '');
    if (Array.isArray(value) && value.length && value.every((x) => x && typeof x === 'object' && ('e' in x || 'e_occ' in x || 'e_vrt' in x || Object.keys(x).some((k) => /gap/i.test(k))))) {
      // the levels: as BigDFT lists them, occupied only, or occupied then empty with the gap in between
      const rows = value.flatMap((o) => ('e' in o ? [[o.e, String(o.f), 's' in o ? (o.s > 0 ? '↑' : '↓') : '']] : 'e_occ' in o ? [].concat(o.e_occ).map((e, i) => [e, 'occupied', Array.isArray(o.e_occ) ? '↑↓'[i] : '']) : 'e_vrt' in o ? [].concat(o.e_vrt).map((e, i) => [e, 'empty', Array.isArray(o.e_vrt) ? '↑↓'[i] : '']) : []));
      const spin = rows.some((r) => r[2]);
      return h('table', {}, h('thead', {}, h('tr', {}, ['Level', 'Ha', 'eV', 'Occupation', spin ? 'Spin' : null].filter(Boolean).map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((r, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', { class: 'num' }, r[0].toFixed(6).replace('-', '−')), h('td', { class: 'num' }, fx(r[0] * M.HA.eV, 3)), h('td', { class: 'num' }, r[1]), spin ? h('td', {}, r[2]) : null))));
    }
    if (perAtom(value)) return atomTable(value, unit, true);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const simple = Object.entries(value).filter(([, v]) => !perAtom(v)), atoms = Object.entries(value).filter(([, v]) => perAtom(v));
      return h('div', { style: 'display:grid;gap:8px' }, simple.length ? h('div', { class: 'kv' }, simple.flatMap(([k, v]) => [h('span', {}, k), h('b', { style: 'font-weight:400' }, typeof v === 'object' ? JSON.stringify(v).replace(/"/g, '').slice(0, 160) : num(v))])) : null, atoms.map(([k, v]) => atomTable(v, k === 'positions' ? value.units || '' : '', false)));
    }
    const text = JSON.stringify(value);
    return text.length > 300 ? text.slice(0, 300) + ' …' : text;
  }
  function logViews(run) {
    const FIRST = ['energy', 'fermi_level', 'evals', 'forces', 'forcemax', 'force_fluct', 'dipole', 'magnetization', 'pressure', 'stress_tensor'], rank = (a) => (FIRST.indexOf(a.name) + 1 || 99);
    const R = OND.logviews, got = R.attributes.filter((a) => run.log && a.name in run.log).sort((x, y) => rank(x) - rank(y)), missing = R.attributes.filter((a) => !(run.log && a.name in run.log));
    const row = (a) => { const w = LOGWORDS[a.name] || [a.label ? a.label.replace(/:$/, '') : a.name, '']; return h('dl', { class: 'lv', 'data-log': a.name }, h('dt', {}, w[0], h('code', {}, a.access || 'log.' + a.name)), h('dd', {}, logValue(a.name, run.log[a.name], w[1]))); };
    return h('details', { class: 'logviews', id: 'logviews', open: ui.logOpen, ontoggle: (e) => { ui.logOpen = e.target.open; } },
      h('summary', {}, 'Everything the log holds', h('span', {}, got.length + ' of the ' + R.attributes.length + ' attributes of a Logfile, ' + R.version.split(',')[0])),
      h('p', { class: 'figmeta', style: 'margin:0 0 8px' }, 'PyBigDFT reads a log through one table, ', h('code', {}, 'BigDFT.Logfiles.BUILTIN'), ': each entry is an attribute of the Logfile. The views below are drawn from that table, with the values of this run. A script reads the same thing as ', h('code', {}, 'log.energy'), ', ', h('code', {}, 'log.forces'), ' …', run.relax ? ' For a relaxation these are the attributes of its last geometry.' : ''),
      got.filter((a) => !a.global).map(row), h('p', { class: 'label', style: 'margin:14px 0 2px' }, 'What describes the run'), got.filter((a) => a.global).map(row),
      missing.length ? h('p', { class: 'lv-absent' }, 'Not in this log, because the calculation did not produce it: ', missing.map((a, i) => [i ? ', ' : '', h('code', {}, a.name)]), '.') : null);
  }
  /* The identity of the same calculation started from scratch. */
  const fromScratch = (key) => { const [sys, kept, ...rest] = key.split('|'); return [sys, kept.split(';').filter((x) => !x.startsWith('dft.inputpsiid=')).join(';'), ...rest.filter((x) => !x.startsWith('wf='))].join('|'); };
  /* Levels drawn as a ladder: occupied full, empty dashed, one column per spin. */
  function levelDiagram(l) {
    const cols = l.polarised ? [['↑', l.occupied.up, l.empty.up], ['↓', l.occupied.down, l.empty.down]] : [['', l.occupied.up, l.empty.up]];
    const all = cols.flatMap((c) => c[1].concat(c[2])), top = Math.max(...all), low = Math.max(Math.min(...all), top - 32), W = 150 * cols.length + 70, H = 230, y = (e) => 14 + (top - Math.max(e, low)) / (top - low || 1) * (H - 40);
    let g = '';
    for (const t of [0, -5, -10, -15, -20, -25, -30].filter((v) => v <= top + 1 && v >= low)) g += '<line x1="46" x2="' + (W - 6) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--line)"/><text x="40" y="' + (y(t) + 4) + '" text-anchor="end">' + String(t).replace('-', '−') + '</text>';
    cols.forEach(([name, occ, emp], i) => {
      const x0 = 62 + i * 150, x1 = x0 + 78;
      for (const e of occ) g += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y(e) + '" y2="' + y(e) + '" stroke="var(--fg)" stroke-width="2.2"' + (e < low ? ' stroke-dasharray="1 3"' : '') + '/>';
      for (const e of emp) g += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y(e) + '" y2="' + y(e) + '" stroke="var(--accent)" stroke-width="2.2" stroke-dasharray="5 4"/>';
      const homo = Math.max(...occ), lumo = emp.length ? Math.min(...emp) : null;
      g += '<text x="' + (x1 + 6) + '" y="' + (y(homo) + 4) + '">' + fx(homo, 2) + '</text>';
      if (lumo != null) g += '<text x="' + (x1 + 6) + '" y="' + (y(lumo) + 4) + '">' + fx(lumo, 2) + '</text>';
      if (name) g += '<text class="lab" x="' + (x0 + 39) + '" y="' + (H - 6) + '" text-anchor="middle">spin ' + name + '</text>';
    });
    g += '<text class="lab" x="4" y="10">eV</text>';
    return h('div', { html: '<svg class="levels-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Energy levels">' + g + '</svg>' });
  }
  const levelFacts = (l) => [['Highest occupied level', fx(l.homo, 3) + ' eV'], l.lumo != null ? ['Lowest empty level', fx(l.lumo, 3) + ' eV'] : null,
    l.gap ? ['Gap, as BigDFT prints it', l.gap.map((g) => fx(g, 3)).join(' (↑), ') + (l.gap.length > 1 ? ' (↓)' : '') + ' eV'] : ['Gap', 'not in this log: no empty state was computed'],
    ['Levels', l.occupied.up.length + l.occupied.down.length + ' occupied' + (l.empty.up.length + l.empty.down.length ? ', ' + (l.empty.up.length + l.empty.down.length) + ' empty' : '')]];

  /* Every equation of the study, in the order of its steps. Calculations that solve the same equations with the
     same settings share one block. */
  function equations() {
    const groups = [];
    for (const step of study.steps) {
      const e = Q.of(step);
      if (!e) continue;
      /* calculations are compared without the size of their basis, which is each run's own and is in its results */
      const said = M.isCalc(step) ? e.definition + e.where.filter((w) => !w.computed).map((w) => w.text).join() : null, same = said && groups.find((g) => g.said === said);
      if (same) same.steps.push(step); else groups.push({ said, steps: [step] });
    }
    $('#equations').replaceChildren(
      h('p', { class: 'figmeta' }, groups.length ? 'What the study computes, step by step: the equations BigDFT solves for each calculation, written with its settings, and what is then computed from the energies. The numbers are those of the results, where there are results.'
        : 'Nothing to write yet: add a calculation.'),
      ...groups.map((g) => h('section', { class: 'eq-of' },
        h('div', { class: 'eq-steps' }, g.steps.map((x) => h('button', { class: 'chip-step' + (x.id === ui.sel ? ' on' : ''), type: 'button', title: 'Select this step', onclick: () => select(x.id) }, (M.at(x) + 1) + ' · ' + x.title))),
        equation(g.steps[0], !g.said))));
  }
  function results() {
    const step = sel(), host = $('#results'), sys = study.sys;
    if (!step) {
      const calcs = study.steps.filter(M.isCalc).length;
      host.replaceChildren(h('div', { class: 'res-head' }, h('h3', {}, study.steps.length ? 'A study of ' + study.steps.length + ' step' + (study.steps.length > 1 ? 's' : '') + ' on ' + sys.name.toLowerCase() : 'Start with a system, then add what you want to compute')),
        h('p', { class: 'say' }, 'The list on the left is the study. Each step continues one before it: a calculation inherits the settings of the one it follows, a relaxation hands its geometry on, a decision applies to everything after it. Select a step to see its settings on the right and its results here; add steps with “Add a step”.'),
        facts([['Atoms', String(sys.atoms.length)], ['Valence electrons', String(OND.chem.electrons(sys, 0))], ['Boundary conditions', BC[sys.bc]], ['Calculations in the study', String(calcs)]]));
      return;
    }
    const s = M.status(step), kids = [];
    if (M.isCalc(step)) {
      if (s.state !== 'done') kids.push(...waiting(step), equation(step));
      else {
        const run = M.runOf(step).run, homo = run.levels ? Math.max(...run.levels.up.concat(run.levels.down.length ? run.levels.down : [-1e9]).filter(Number.isFinite)) : null;
        const scf = { title: '', caption: '', panels: [{ title: step.kind === 'relax' ? 'Self-consistency of the first geometry' : 'Self-consistency', x: { label: 'Iteration', min: 0, fmt: (v) => String(Math.round(v)) }, y: { label: 'Wavefunction residue', log: true }, series: [{ name: 'residue', slot: 0, marker: true, pts: run.scf }], hlines: [{ y: run.gnrm_cv, label: 'criterion' }] }] };
        const left = [h('p', { class: 'big' }, fx(run.energy, 6), h('small', {}, 'Ha')), facts([['SCF iterations', String(run.iters) + (run.relax ? ' at the first geometry' : '')], ['Last residue', sci(run.gnrm) + ' for ' + sci(run.gnrm_cv) + ' asked'],
          homo != null ? ['Highest occupied level', fx(homo, 3) + ' eV'] : null, run.dipole != null ? ['Dipole', fx(run.dipole, 3) + ' D'] : null, ['Grid points', fr(run.nc, 0) + ' coarse, ' + fr(run.nf, 0) + ' fine'], ['Memory peak', run.mem + ' MB'],
          ['Warnings', run.warnings.length ? run.warnings.join(' · ') : 'none']].concat(run.relax ? [['Force evaluations', String(run.relax.steps.length)], ['Largest force at the end', sci(run.fmax) + ' Ha/bohr for ' + sci(run.relax.forcemax) + ' asked']].concat(geometryNote(run, step)) : []))];
        const right = [figure(scf)];
        if (run.relax) { const e0 = run.relax.steps[0][0], x = { label: 'Force evaluation', min: 0, fmt: (v) => String(Math.round(v)) };
          right.unshift(figure({ title: '', caption: '', panels: [{ title: 'Energy', x, y: { label: 'E − E(start) (meV)', fmt: (v) => v.toFixed(0).replace('-', '−') }, series: [{ name: 'energy', slot: 0, marker: true, pts: run.relax.steps.map((q, i) => [i, (q[0] - e0) * 27211.386]) }] },
            { title: 'Largest force', x, y: { label: 'Ha/bohr', log: true }, series: [{ name: 'force', slot: 1, marker: true, pts: run.relax.steps.map((q, i) => [i, q[1]]) }], hlines: [{ y: run.relax.forcemax, label: 'asked' }] }] })); }
        if (run.relax && run.fmax > run.relax.forcemax) left.push(h('div', { class: 'notice' }, h('b', {}, 'Look at the last force'), h('span', {}, 'BigDFT ended this relaxation with a largest force of ' + sci(run.fmax) + ' Ha/bohr, above the ' + sci(run.relax.forcemax) + ' asked. The geometry may not be the minimum: a finer grid gives cleaner forces.')));
        if (step.links.wavefunctions) { const twin = study.steps.find((x) => x !== step && M.isCalc(x) && !x.links.wavefunctions && M.status(x).state === 'done' && M.keyOf(x) === fromScratch(M.keyOf(step)));
          left.push(h('p', { class: 'say' }, h('b', {}, 'Started from the wavefunctions of “' + M.byId(step.links.wavefunctions).title + '”. '), 'It converged in ' + run.iters + ' iterations' + (twin ? ', for ' + M.runOf(twin).run.iters + ' from scratch in “' + twin.title + '”, to the same energy within ' + sci(Math.max(Math.abs(run.energy - M.runOf(twin).run.energy), 1e-12)) + ' Ha.' : '. Add the same step without the wavefunctions to compare.'))); }
        if (run.gap) left.push(facts(levelFacts(M.levels({ links: { of: step.id } }))));
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:12px' }, left), h('div', { style: 'display:grid;gap:12px;min-width:0' }, right)), real(run), equation(step, true), logViews(run));
      }
    } else if (step.kind === 'vary') {
      const ser = M.series(step);
      kids.push(equation(step));
      if (!ser.complete) kids.push(...waiting(step));
      else {
        const t = ser.target, what = ser.relative ? 'E(“' + M.byId(step.links.of).title + '”) − E(“' + M.byId(step.links.relative_to).title + '”)' : 'total energy of “' + M.byId(step.links.of).title + '”';
        const inside = t ? ser.rows.filter((r) => r.agrees).map((r) => r.value) : [];
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:10px' },
          h('p', { class: 'say' }, h('b', {}, ser.rows.length + ' values of ' + (LABELS[M.settingVaried(step)] || 'the setting').toLowerCase() + ', side by side. '), 'What is compared: ' + what + '. ', t ? (inside.length ? 'Within the target: ' + inside.join(', ') + '.' : 'None falls within the target.') : 'Attach a target to judge them.'),
          h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Value', ser.relative ? 'Difference (eV)' : 'Energy (eV)', t ? 'Off target (eV)' : null, 'BigDFT time (s)'].filter(Boolean).map((c) => h('th', {}, c)))),
            h('tbody', {}, ser.rows.map((r) => h('tr', {}, h('td', { class: 'num' }, String(r.value)), h('td', { class: 'num' }, fx(r.quantity, 4)), t ? h('td', { class: 'num' }, fx(r.quantity - t.value, 3) + (r.agrees ? ' ✓' : ' ✗')) : null, h('td', { class: 'num' }, fx(r.seconds, 0)))))))),
          figure({ kind: 'interval', title: '', caption: '', x: { label: (ser.relative ? 'Difference' : 'Energy') + ' (eV)', unit: 'eV', fmt: (v) => v.toFixed(2) }, band: t ? { x0: t.value - t.within, x1: t.value + t.within, mid: t.value, label: 'target ' + t.value + ' ± ' + t.within } : null,
            rows: ser.rows.map((r) => ({ label: String(r.value), value: r.quantity, text: fx(r.quantity, 3) })) })),
          h('p', { class: 'figmeta' }, ser.rows.length * (ser.relative ? 2 : 1) + ' real BigDFT runs. A decision step can keep one of these values for what follows.'));
      }
    } else if (step.kind === 'levels') {
      const l = M.levels(step), of = M.byId(step.links.of);
      if (M.status(step).state !== 'done') kids.push(h('p', { class: 'say' }, h('b', {}, 'Not yet. '), 'The levels are read from the log of “' + of.title + '”, which is not computed.'));
      else if (!l) kids.push(h('p', { class: 'say' }, 'The log of “' + of.title + '” lists no level.'));
      else kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:12px' }, h('p', { class: 'big' }, l.gap ? fx(l.gap[0], 3) : fx(l.homo, 3), h('small', {}, l.gap ? 'eV · gap' : 'eV · highest occupied level')), facts(levelFacts(l)),
        h('p', { class: 'say' }, l.gap ? 'The gap is the distance between the highest occupied level and the lowest empty one, in the same potential. With LDA or PBE it underestimates the true gap; a hybrid opens it.'
          : 'The highest occupied level of a Kohn-Sham calculation is not the ionisation energy: with LDA or PBE it lies several eV above it. Compare with the difference between the cation and the neutral.')),
        h('div', { style: 'min-width:0' }, levelDiagram(l))), h('p', { class: 'figmeta' }, 'Read from the log of “' + of.title + '”: ', h('code', {}, 'log.evals'), ', ', h('code', {}, 'log.fermi_level'), l.gap ? ', and the gap BigDFT prints after the empty states.' : '.'));
    } else if (step.kind === 'converge') {
      const ser = M.series(step);
      kids.push(equation(step));
      if (!ser.complete) kids.push(...waiting(step));
      else {
        const unit = ser.relative ? 'eV' : 'meV per atom', ref = ser.rows[ser.rows.length - 1].quantity, y = (r) => (ser.relative ? r.quantity : (r.quantity - ref) * 1000);
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:10px' },
          h('p', { class: 'say' }, ser.proposed == null ? h('b', {}, 'Not converged in this range. ') : h('b', {}, 'Converged at ' + ser.proposed + '. '), ser.proposed == null ? 'No value is within ' + fx(step.params.within * 1000, 0) + ' meV of the last one.' : 'It is the cheapest value within ' + fx(step.params.within * 1000, 0) + ' meV of the reference. A decision step keeps it, or another, for what follows.'),
          h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Value', ser.relative ? 'Difference (eV)' : 'Energy (eV/atom)', 'Off reference (meV)', 'BigDFT time (s)'].map((c) => h('th', {}, c)))),
            h('tbody', {}, ser.rows.map((r) => h('tr', {}, h('td', { class: 'num' }, String(r.value)), h('td', { class: 'num' }, fx(r.quantity, ser.relative ? 4 : 5)), h('td', { class: 'num' }, fx(r.away * 1000, 1)), h('td', { class: 'num' }, fx(r.seconds, 0)))))))),
          figure({ title: '', caption: '', panels: [{ title: ser.relative ? 'What is watched: the difference' : 'Total energy, against the reference', x: { label: (LABELS[M.settingVaried(step)] || 'value'), fmt: (v) => String(+v.toFixed(3)) }, y: { label: unit, fmt: (v) => v.toFixed(ser.relative ? 2 : 0) },
            series: [{ name: step.title, slot: 0, marker: true, pts: ser.rows.map((r) => [r.value, y(r)]).sort((a, b) => a[0] - b[0]) }] }] }, 210)),
          h('p', { class: 'figmeta' }, ser.rows.length * (ser.relative ? 2 : 1) + ' real BigDFT runs. A value already computed elsewhere in the study is not computed twice.'));
      }
    } else if (step.kind === 'choose') {
      kids.push(h('p', { class: 'say' }, M.retained(step) == null ? h('b', {}, 'No decision yet. ') : h('b', {}, 'Kept: ' + M.retained(step) + '. '), 'A decision is a step of the study: the series proposes, a person keeps. Every calculation after it uses the kept value.'), ...decisionTable(step));
    } else if (step.kind === 'difference') {
      const d = M.difference(step);
      if (!d) kids.push(...waiting(step), equation(step));
      else {
        const left = [h('p', { class: 'big' }, fx(d.value, d.unit === 'Ha' ? 6 : 3), h('small', {}, d.unit)),
          h('p', { class: 'say' }, d.target ? h('b', {}, d.agrees ? 'Within the target. ' : 'Outside the target. ') : null, d.target ? fx(d.value - d.target.value, 3) + ' ' + d.unit + ' from ' + d.target.value + ' ± ' + d.target.within + (d.target.source ? ' (' + d.target.source + ').' : '.') : 'No target is attached to this result.')];
        const right = d.target ? [figure({ kind: 'interval', title: '', caption: '', x: { label: step.title + ' (' + d.unit + ')', unit: d.unit, fmt: (v) => v.toFixed(2) }, band: { x0: d.target.value - d.target.within, x1: d.target.value + d.target.within, mid: d.target.value, label: 'target ' + d.target.value + ' ± ' + d.target.within },
          rows: study.steps.filter((x) => x.kind === 'difference' && x.links.against === step.links.against && M.difference(x)).map((x) => ({ label: x.title, value: M.difference(x).value, text: fx(M.difference(x).value, 3) + ' ' + d.unit })) })] : [];
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:12px;min-width:0' }, left), h('div', { style: 'min-width:0' }, right)), equation(step, true));
      }
    } else if (step.kind === 'combination') {
      const d = M.combination(step);
      if (!d) kids.push(...waiting(step), equation(step));
      else {
        const digits = d.unit === 'Ha' ? 6 : 3;
        const left = [h('p', { class: 'big' }, fx(d.value, digits), h('small', {}, d.unit)),
          h('p', { class: 'say' }, d.target ? h('b', {}, d.agrees ? 'Within the target. ' : 'Outside the target. ') : null, d.target ? fx(d.value - d.target.value, 3) + ' ' + d.unit + ' from ' + d.target.value + ' ± ' + d.target.within + (d.target.source ? ' (' + d.target.source + ').' : '.') : 'No target is attached to it.'),
          h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Calculation', 'Computed on', 'Energy (Ha)', 'Counts for (' + d.unit + ')'].map((c) => h('th', {}, c)))),
            h('tbody', {}, d.terms.map((t) => h('tr', {}, h('td', { class: 'num' }, (t.c > 0 ? '+' : '−') + +Math.abs(t.c).toPrecision(6)), h('td', {}, t.step.title), h('td', {}, M.sysOf(t.step).formula), h('td', { class: 'num' }, fx(M.energy(t.step), 6)), h('td', { class: 'num' }, fx(t.c * M.energy(t.step) * M.HA[d.unit], digits)))))))];
        const spins = [...new Set(d.terms.filter((t) => S.isAtom(M.sysOf(t.step))).map((t) => OND.chem.EL[M.sysOf(t.step).atoms[0].el]))];
        const right = d.target ? [figure({ kind: 'interval', title: '', caption: '', x: { label: step.title + ' (' + d.unit + ')', unit: d.unit, fmt: (v) => v.toFixed(2) }, band: { x0: d.target.value - d.target.within, x1: d.target.value + d.target.within, mid: d.target.value, label: 'target ' + d.target.value + ' ± ' + d.target.within },
          rows: [{ label: step.title, value: d.value, text: fx(d.value, 3) + ' ' + d.unit }] })] : [];
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:12px;min-width:0' }, left), h('div', { style: 'min-width:0' }, right)), equation(step, true),
          spins.length ? h('p', { class: 'figmeta' }, 'The atoms are computed spin-polarised, in their ground state by Hund’s rule (' + spins.map((el) => el.name.toLowerCase() + ': ' + el.unp + ' unpaired').join(', ') + '). Without it an atom’s energy is too high and the sum too large.') : null);
      }
    } else if (step.kind === 'structure') {
      const sys = step.sys, on = study.steps.filter((x) => x.links.on === step.id);
      kids.push(h('p', { class: 'big' }, sys.formula, h('small', {}, sys.atoms.length + ' atom' + (sys.atoms.length > 1 ? 's' : ''))),
        facts([['Valence electrons', String(OND.chem.electrons(sys, 0))], ['Boundary conditions', BC[sys.bc]], sys.cell ? ['Cell (Å)', sys.cell.map((c) => (c ? fx(c, 3) : 'free')).join(' × ')] : null, ['Comes from', sys.source || 'built by the workshop'],
          ['Computed on it', on.map((x) => '“' + x.title + '”').join(', ') || 'nothing yet']]),
        h('p', { class: 'say' }, 'A structure is not computed: a calculation is placed on it. It is written in the script as BigDFT reads it, positions in angstroem with their unit.'));
    } else if (step.kind === 'target') {
      kids.push(h('p', { class: 'big' }, step.params.value + ' ± ' + step.params.within, h('small', {}, step.params.unit)), h('p', { class: 'say' }, step.params.source ? 'From: ' + step.params.source + '. ' : '', 'The results attached to this target are judged against it: ' + (study.steps.filter((x) => x.links.against === step.id).map((x) => '“' + x.title + '”').join(', ') || 'none yet') + '.'));
    }
    host.replaceChildren(h('div', { class: 'res-head' }, h('h3', {}, step.title), h('span', { class: 'pill' }, KIND[step.kind] + ' · ' + s.text)), ...kids);
  }

  // ------------------------------------------------------------------ input, script, map, log
  function renderDock() {
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === ui.tab)));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== ui.tab; });
    const step = sel();
    if (ui.tab === 'results') results();
    if (ui.tab === 'input') {
      const calc = M.isCalc(step);
      $('#input-name').textContent = (calc ? M.nameOf(step) : 'input') + '.yaml';
      $('#yaml').innerHTML = !calc && !study.steps.some(M.isCalc) ? '<span class="c"># no calculation in the study yet</span>' : (calc ? '' : '<span class="c"># this step has no input of its own: the first calculation is shown</span>\n') + bp.yaml().map((l) => {
        const pad = '  '.repeat(l.ind);
        if (l.note) return pad + '<span class="c"># ' + esc(l.note) + '</span>';
        if (l.item) return pad + '- <span class="k">' + l.item + '</span>: ' + l.val;
        return pad + '<span class="k">' + esc(l.k) + '</span>:' + (l.val != null ? ' ' + esc(l.val) : '') + (l.c ? '  <span class="c"># ' + esc(l.c) + '</span>' : '');
      }).join('\n');
      $('#python').innerHTML = bp.python().filter((l) => /^inp\b|^from|^$/.test(l)).map((l) => esc(l).replace(/("[^"]*")/g, '<span class="s">$1</span>').replace(/^(from|import)\b/, '<span class="k">$1</span>').replace(/\b(inp)\.(\w+)/g, '$1.<span class="k">$2</span>')).join('\n');
    }
    if (ui.tab === 'script') $('#script').replaceChildren(...M.script().map(([id, text]) => {
      const line = h('div', { class: 'sline' + (id && id === ui.sel ? ' on' : ''), onclick: id ? () => select(id) : null });
      line.innerHTML = esc(text).replace(/(#.*)$/, '<span class="c">$1</span>').replace(/("[^"]*")/g, '<span class="s">$1</span>') || ' ';
      return line;
    }));
    if (ui.tab === 'equations') equations();
    if (ui.tab === 'log') {
      const VERDICT = { done: '<span class="ok">[OK]</span>', failed: '<span class="err">[FAILED]</span>', refused: '<span class="err">[REFUSED]</span>', waiting: '<span class="err">[WAITING]</span>', stopped: '<span class="c">[STOPPED]</span>', checking: '<span class="c">[dry run]</span>', sent: '<span class="c">[sent]</span>', running: '<span class="c">[running]</span>' };
      const notes = (r) => (r.relax ? '  <span class="c"># relaxation</span>' : '') + (r.restart ? '  <span class="c"># reads data-' + esc(r.name) + '/wavefunction*, copied from the run it starts from</span>' : '');
      const call = (w, i) => '<b>wave ' + (i + 1) + '</b>  haps_bigdft(names=[' + w.map((r) => '"' + esc(r.name) + '"').join(', ') + '], directory="runs")\n';
      const recorded = (entry) => entry.waves.map((w, i) => call(w, i) + w.map((r) => '  <span class="ok">[OK]</span> bigdft -n ' + esc(r.name) + ', ' + fx(r.seconds, 0) + ' s' + notes(r)).join('\n')).join('\n')
        + (entry.absent.length ? '\n<span class="c"># no recorded result: ' + esc(entry.absent.join(', ')) + '</span>' : '');
      const lived = (entry) => entry.waves.map((w, i) => call(w, i) + w.map((r) => '  ' + VERDICT[r.state] + ' bigdft -n ' + esc(r.name) + (r.state === 'done' ? ', ' + fx(r.seconds, 0) + ' s' + notes(r) : r.text ? '  <span class="c"># ' + esc(r.text) + '</span>' : '')).join('\n')).join('\n')
        + (entry.phase ? '\n<span class="c"># ' + esc(entry.phase) + '…</span>' : '') + (entry.error ? '\n<span class="err">' + esc(entry.error) + '</span>' : '')
        + (!entry.waves.length && !entry.error && !entry.phase ? '<span class="c"># nothing was ready</span>' : '');
      $('#log').replaceChildren(h('p', { class: 'figmeta' }, 'What was sent, wave after wave. A wave holds every run that needs nothing still to come; the next one waits for it. '
        + (M.live.on ? 'Each run is first checked by BigDFT’s dry run, then computed on the HAPS; the time shown is what BigDFT took.' : 'Here each run comes back at once with its recorded result; the time shown is what BigDFT took.')),
        ...(study.log.length ? study.log.map((entry) => h('pre', { class: 'wave', html: entry.live ? lived(entry) : recorded(entry) }))
          : [h('p', { class: 'say' }, 'Nothing computed yet.')]));
    }
  }

  // ------------------------------------------------------------------ the graph of the study: one box per step
  function renderGraph() {
    const TYPE = { structure: 'structure', combination: 'formula', calculation: 'run', relax: 'relax', converge: 'series', vary: 'series', choose: 'decision', difference: 'formula', levels: 'levels', target: 'target' };
    const col = { system: 0 }, row = { system: 0 }, taken = new Set(['0:0']);
    const put = (c, want) => { let r = Math.max(0, want); while (taken.has(c + ':' + r)) r++; taken.add(c + ':' + r); return r; };
    /* What a step needs before it: its links, and for a calculation the decisions taken before it. A box sits to the right of all of them. */
    const needs = (s) => Object.values(s.links).map(M.byId).filter(Boolean).concat(M.isCalc(s) ? M.decisionsBefore(s).map((d) => d.step) : []);
    const depth = (s) => (s.id in col ? col[s.id] : (col[s.id] = s.kind === 'target' || s.kind === 'structure' ? 0 : 1 + Math.max(0, ...needs(s).map(depth))));
    const nodes = [{ id: 'system', col: 0, row: 0, type: 'structure', title: study.sys.name, sub: study.sys.atoms.length + ' atoms · ' + BC[study.sys.bc], say: 'what everything is computed on', state: 'given' }];
    for (const s of study.steps) {
      const c = depth(s), L = s.links, parent = M.byId(L.on || L.after || L.of || L.among || L.a || L.term1), st = M.status(s), res = resultOf(s);
      row[s.id] = put(c, s.kind === 'target' || s.kind === 'structure' ? 1 : parent ? row[parent.id] : 0);
      nodes.push({ id: s.id, col: c, row: row[s.id], type: TYPE[s.kind], title: s.title, sub: summaryOf(s), tex: texOf(s), res: st.state === 'done' || (s.kind === 'choose' && M.retained(s) != null) ? res : '', say: st.state === 'given' ? '' : st.text, state: st.state });
    }
    for (const n of nodes) if (ui.moved[n.id]) Object.assign(n, ui.moved[n.id]);
    const edges = study.steps.flatMap((s) => {
      const L = s.links, out = [], g = M.isCalc(s) && M.geometryFrom(s);
      const on = L.on && M.byId(L.on);
      if (M.isCalc(s) && (L.after || !on)) out.push([L.after || 'system', s.id, g && g.id === L.after ? 'geometry' : 'settings']);
      if (on) out.push([L.on, s.id, 'structure']);
      if (L.wavefunctions) out.push([L.wavefunctions, s.id, 'wavefunctions']);
      for (const r of Object.keys(L)) if (['of', 'relative_to', 'among', 'a', 'b'].includes(r) || r.startsWith('term')) out.push([L[r], s.id, 'energies']);
      if (L.against) out.push([L.against, s.id, 'criterion']);
      if (s.kind === 'choose') for (const later of study.steps) if (M.isCalc(later) && M.at(later) > M.at(s) && !(later.links.after && M.at(M.byId(later.links.after)) > M.at(s))) out.push([s.id, later.id, 'choice']);
      return out;
    });
    const z = OND.board.draw($('#graph'), nodes, edges, ui.sel, select, { reveal: ui.reveal, zoom: ui.zoom, per: ui.per, avoid: !ui.inset ? { w: 0, h: 0 } : matchMedia('(max-width:860px)').matches ? { w: 172, h: 138 } : { w: 256, h: 198 }, onMove: (n) => { ui.moved[n.id] = { dx: n.dx, dy: n.dy }; T.changed(); },
      onAdd: (id) => { if (ui.sel !== id) select(id); ui.palette = true; refresh(); const pal = $('#palette'); if (pal.scrollIntoView) pal.scrollIntoView({ block: 'nearest' }); } });
    ui.reveal = false; ui.z = z.z; ui.cols = z.per;
    $('#zoom-fit').setAttribute('aria-pressed', String(ui.zoom === 'all')); $('#zoom-out').disabled = z.z <= OND.board.SMALLEST; $('#zoom-in').disabled = z.z >= BIGGEST;
    const used = [...new Set(edges.map((e) => e[2]))], L = OND.board.LINKS;
    $('#graph-legend').replaceChildren(...Object.keys(L).filter((t) => used.includes(t)).map((t) => h('span', { html: '<svg width="28" height="8" aria-hidden="true"><path class="edge ' + t + '" d="M1 4H27"' + (L[t][1] ? ' stroke-dasharray="' + L[t][1] + '"' : '') + '/></svg>' + esc(L[t][0]) })));
  }
  function renderMain() {
    $('#main').dataset.main = ui.main; $('#main').dataset.inset = ui.inset ? 'on' : 'off';
    $('#inset-show').hidden = ui.main !== 'graph' || ui.inset;
    $$('#main-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.main === ui.main)));
    $('#graph-legend').hidden = $('#zoom').hidden = ui.main !== 'graph';
    if (ui.main === 'graph') renderGraph();
  }

  // ------------------------------------------------------------------ refresh and wiring
  let queued = false;
  function refresh(scene) {
    if (scene) renderStage();
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; renderRail(); renderMain(); renderStage(); if (!ui.drag) renderInspector(); renderDock(); if (document.activeElement !== $('#study-name')) $('#study-name').value = study.name; if (!ui.drag) T.changed(); });       // a redraw that comes from elsewhere (a wave, the server) never takes back a name being typed
  }
  const fresh = () => Object.assign(ui, { moved: {}, per: null, zoom: 'fit' });       // another study: its boxes are laid out anew
  function example() { fresh(); select(M.example().id); }
  function start() { fresh(); M.reset(); M.setSystem('h2o'); const first = M.add('calculation', null); first.title = 'Ground state'; M.touch(); select('system'); }

  $('#add-open').addEventListener('click', () => { ui.palette = !ui.palette; refresh(); });
  $('#compute-all').addEventListener('click', () => compute(null, 'log'));
  $('#mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode === 'live'); });
  $('#stop').addEventListener('click', () => L.stop());
  /* Signed in, the example and a new study are studies of their own: the one in hand stays in the list. A first
     study nobody touched is simply filled. Without accounts (the mock-up) there is one study, replaced in place. */
  const untouched = () => study.steps.length <= 1 && !study.computed.size && !Object.keys(M.live.runs).length && study.name === 'Untitled study';
  const another = (build) => { if (L.state.busy) return; if (!T.state.on || untouched()) build(); else T.fresh(build); };
  $('#example').addEventListener('click', () => another(example));
  $('#restart').addEventListener('click', () => another(start));
  $('#study-name').addEventListener('change', (e) => { study.name = e.target.value.trim() || 'Untitled study'; M.touch(); refresh(); });
  $('.tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) { ui.tab = t.dataset.tab; $('#dock').classList.remove('closed'); refresh(); } });
  $('#main-switch').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ui.main = b.dataset.main; ui.reveal = true; refresh(true); } });
  $('#inset-open').addEventListener('click', () => { ui.main = 'scene'; refresh(true); });
  $('#inset-hide').addEventListener('click', () => { ui.inset = false; refresh(); });
  $('#inset-show').addEventListener('click', () => { ui.inset = true; refresh(true); });
  /* Zooming changes the size and nothing else: the bands keep the columns they had, so no box changes place.
     "Fit" shows the whole study, cut into bands the way that shows it largest; pressed again, it goes back to reading size. */
  const BIGGEST = 1.5;
  function zoomBy(factor) { ui.per = ui.cols; ui.zoom = Math.min(BIGGEST, Math.max(OND.board.SMALLEST, (ui.z || 1) * factor)); refresh(); }
  $('#zoom').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'zoom-fit') { ui.zoom = ui.zoom === 'all' ? 'fit' : 'all'; ui.per = null; ui.reveal = true; refresh(); } else zoomBy(b.id === 'zoom-in' ? 1.25 : 0.8);
  });
  $('#graph').addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  $('#dock-toggle').addEventListener('click', (e) => { const tall = $('#dock').classList.toggle('tall'); e.target.textContent = tall ? 'Smaller' : 'Larger'; setTimeout(() => window.dispatchEvent(new Event('resize')), 0); refresh(); });
  $('#viewbar').addEventListener('click', (e) => { const b = e.target.closest('.tog'); if (b && !b.disabled) { ui.view[b.dataset.view] = !ui.view[b.dataset.view]; refresh(true); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { themeColors(); refresh(true); });
  window.addEventListener('resize', () => { if (ui.tab === 'results' || ui.main === 'graph') refresh(); });

  // ------------------------------------------------------------------ whose studies: the account, and what the server keeps
  /* What the store needs of the page: the study on screen as a document (with where its boxes were dragged), a
     document put on screen, and whether a wave is computing. */
  T.hooks.snapshot = () => Object.assign(M.serialize(), { layout: Object.fromEntries(Object.entries(ui.moved).filter(([id]) => id === 'system' || M.byId(id))) });
  T.hooks.load = (kept) => {
    fresh(); M.restore(kept.document);
    ui.moved = Object.assign({}, kept.document.layout); M.setResults(kept.results || {});
    select((study.steps.find(M.isCalc) || { id: 'system' }).id);
    if (kept.job) setTimeout(() => L.resume(kept.job, () => refresh(true)), 0);       // a wave sent before this page was opened: follow it
  };
  T.hooks.busy = () => L.state.busy;
  T.hooks.rename = (name) => { study.name = name; M.touch(); refresh(); };
  // signed in, the example is offered where the studies are ("Studies"): the header keeps to what is done to the study in hand
  T.on((s) => { L.state.study = s.id; $('#restart').textContent = s.on ? 'New study' : 'Start over'; $('#example').hidden = s.on; $('header.top').classList.toggle('with-account', s.on); });
  OND.studies.mount({ h, $, fresh: () => another(start), example: () => another(example), blank: start });

  themeColors();
  start();
  /* Served by backend/serve.py, the page belongs to whoever signs in: their studies are read from the server and
     kept there, and it computes for real as soon as the HAPS is ready. Served as files (tools/preview.py) no
     account exists: it stays the mock-up, on its recorded results. */
  OND.account.start({ slot: $('#account'), links: [{ label: 'The first workshop (mock-up)', href: '/first/' }, { label: 'Asymille · fit, analyse, figures', href: '/asymille/' }],
    onReturn: () => T.save(),                                     // what could not be saved while the session was over
    onUser: async () => {
      const info = await L.probe();
      if (info) M.setLive(info.haps.ok);
      await T.start();
      refresh(true);
    } });
  OND.w2 = { model: M, ui, select, example, refresh, store: T };
})(window.OND);
