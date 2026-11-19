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
  function typeset(el, tries = 0) {
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {});
    else if (tries < 25) setTimeout(() => typeset(el, tries + 1), 400);
  }

  const M = OND.model, study = M.study, P = M.P;
  const bp = OND.Blueprint(), st = bp.st;                 // the settings of the selected calculation, edited in place
  const stage = OND.Stage($('#stage'));
  const SCHEMA = OND.schema.variables;
  const ui = { sel: 'system', tab: 'results', depth: 0, view: { grid: false, ghosts: true, vdw: false }, drag: false, loading: false, query: '', acts: {}, palette: false, geo: '' };
  OND.board.init({ h, typeset });

  const KIND = { system: 'System', calculation: 'Calculation', relax: 'Relaxation', converge: 'Convergence series', choose: 'Decision', difference: 'Result', target: 'Criterion' };
  const ROLE = {
    system: 'What everything else is computed on.', calculation: 'An energy at a fixed geometry.', relax: 'The atoms move until the forces vanish.',
    converge: 'One setting varied, to see when the result stops changing.', choose: 'The value kept for every step after this one.',
    difference: 'The energy of one step minus the energy of another.', target: 'A reference and the window that counts as agreement, set before computing.',
  };
  const GLYPH = { system: '⬡', calculation: 'E', relax: '↯', converge: '≋', choose: '?', difference: 'Δ', target: '◎' };
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

  function select(id) { ui.sel = id; ui.palette = false; loadSelected(); refresh(true); }

  // ------------------------------------------------------------------ the scene
  /* The geometry a step is computed on, or ends on: the relaxed one once its relaxation is computed. */
  function sceneFor(step) {
    const relax = step && (step.kind === 'relax' ? step : M.geometryFrom(step)), sys = study.sys;
    const own = step && step.kind === 'relax';
    if (!relax || M.status(relax).state !== 'done') return { sys, tag: 'built', text: relax ? 'geometry as built: “' + relax.title + '” is not computed yet' : 'geometry as built' };
    const final = M.runOf(relax).run.relax.final;
    const moved = Object.assign({}, sys, { atoms: sys.atoms.map((a, i) => Object.assign({}, a, { p: [0, 1, 2].map((d) => final[i][d + 1] - sys.origin[d]) })) });
    return { sys: moved, tag: relax.id + ':' + M.keyOf(relax), text: own ? 'geometry after this relaxation' : 'geometry relaxed in “' + relax.title + '”' };
  }
  function renderStage(force) {
    const step = sel(), scene = sceneFor(step), sys = study.sys, v = st.v, w = ui.view;
    if (force || ui.geo !== scene.tag + '|' + sys.id) { stage.setSystem(scene.sys, ui.geo.endsWith('|' + sys.id)); ui.geo = scene.tag + '|' + sys.id; }
    const look = [w.ghosts, w.vdw].join(), grid = [w.grid, v.hgrid, v.crmult, v.frmult, ui.geo].join();
    if (force || renderStage.look !== look) { stage.setOptions({ ghosts: w.ghosts, style: w.vdw ? 'vdw' : 'ball' }); renderStage.look = look; renderStage.grid = null; }
    if (force || renderStage.grid !== grid) { stage.setGrid(w.grid ? { h: v.hgrid, crmult: v.crmult, frmult: v.frmult } : null); renderStage.grid = grid; }
    const c = OND.chem.composition(sys), keys = Object.keys(c).sort((a, b) => (c.C ? (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)) : c[b] - c[a]));
    $('#sys-name').textContent = sys.name;
    $('#sys-blurb').textContent = step ? step.title + ' · ' + scene.text : sys.blurb;
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
  function summaryOf(step) {
    const L = step.links, t = (id) => (M.byId(id) ? M.byId(id).title : '?');
    if (M.isCalc(step)) {
      const own = M.ownOf(step), bits = Object.keys(step.own.v).filter((k) => !(k === 'nspin')).map((k) => LABELS[k] ? LABELS[k].toLowerCase() + ' ' + String(step.own.v[k]) : k);
      const extra = Object.keys(own.expert).length + own.actions.length;
      const what = step.kind === 'relax' ? 'relax' + (bits.length ? ', ' + bits.join(', ') : '') : bits.join(', ') || (L.after ? 'same settings' : 'the first calculation');
      return (L.after ? 'after ' + t(L.after) + ' · ' : '') + what + (extra ? ' +' + extra : '');
    }
    if (step.kind === 'converge') return t(L.of) + (L.relative_to ? ' − ' + t(L.relative_to) : '') + ' · ' + step.params.values.length + ' values';
    if (step.kind === 'choose') return 'on ' + t(L.among);
    if (step.kind === 'difference') return t(L.a) + ' − ' + t(L.b);
    if (step.kind === 'target') return step.params.value + ' ± ' + step.params.within + ' ' + step.params.unit;
    return '';
  }
  function resultOf(step) {
    const s = M.status(step);
    if (M.isCalc(step) && s.state === 'done') return 'E = ' + fx(M.energy(step), 6) + ' Ha';
    if (step.kind === 'converge' && s.state === 'done') { const p = M.series(step).proposed; return p == null ? 'not converged in this range' : 'proposes ' + p; }
    if (step.kind === 'choose') { const v = M.retained(step); return v == null ? s.text : '= ' + v + (step.params.retained != null ? ' (you)' : ''); }
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
    $('#compute-all').disabled = !M.readyRuns().length;
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

  function computeRow(step) {
    const s = M.status(step), runs = M.readyRuns(step);
    return h('div', { class: 'compute-row' },
      s.state === 'ready' ? h('button', { class: 'btn cta', type: 'button', id: 'compute-step', onclick: () => { M.compute(step); ui.tab = 'results'; refresh(true); } }, 'Compute this step' + (runs.length > 1 ? ' · ' + runs.length + ' runs' : ''))
        : h('span', { class: 'pill' }, s.state === 'done' ? 'computed' : s.state === 'blocked' ? 'waits' : 'not available'),
      h('span', { style: 'font-size:12px;color:var(--fg-3)' }, s.state === 'ready' || s.state === 'done' ? '' : s.text));
  }
  function calcPanel(step) {
    const kids = [], own = step.own, chips = Object.keys(own.v).filter((k) => k !== 'nspin' || !('mpol' in own.v)).map((k) => (LABELS[k] || k) + ': ' + String(own.v[k]))
      .concat(Object.keys(own.expert).map((p) => p + ' = ' + own.expert[p]), own.actions.map((a) => bp.actionCall(a.name, a.args)));
    if (step.links.after || study.steps.filter(M.isCalc).length > 1) kids.push(stepSelect(step, 'after', (s) => M.isCalc(s), step.kind === 'relax' ? null : 'nothing: it starts the study', 'Continues'));
    kids.push(h('div', { class: 'field2' }, h('span', {}, step.links.after ? 'What this step changes' : 'What this step sets'),
      chips.length ? h('div', { class: 'own' }, chips.map((c) => h('span', { class: 'chip' }, c))) : h('small', {}, step.links.after ? 'Nothing yet: it repeats “' + M.byId(step.links.after).title + '”' + (step.kind === 'relax' ? ' and relaxes its geometry.' : '. Change a setting below.') : 'The advised values for this system. Change any of them below.')));
    kids.push(computeRow(step));
    for (const c of bp.checks()) if (c.level !== 'ok' && c.block !== 'machine' && c.block !== 'task') kids.push(h('div', { class: 'notice' + (c.level === 'err' ? ' err' : '') }, h('b', {}, c.level === 'err' ? 'To fix' : 'Good to know'), h('span', {}, c.text)));
    if (step.kind === 'relax') kids.push(h('details', { class: 'sec', open: true }, h('summary', {}, 'Relaxation', h('span', {}, 'how the atoms are moved')),
      field('Optimiser', seg([['SQNM', 'SQNM'], ['FIRE', 'FIRE'], ['LBFGS', 'L-BFGS']], step.params.method, (m) => { step.params.method = m; M.touch(); loadSelected(); refresh(); })),
      number(step, 'forcemax', 'Stop when the largest force is below (Ha/bohr)'), number(step, 'nsteps', 'Maximum number of steps')));
    kids.push(h('div', { class: 'seg', id: 'depth', role: 'group', 'aria-label': 'Depth of settings', style: 'margin:12px 0 2px' }, [[0, 'Settings'], [3, 'PyBigDFT actions'], [2, 'All variables']].map(([d, l]) => h('button', { type: 'button', 'aria-pressed': String(ui.depth === d), onclick: () => { ui.depth = d; refresh(); } }, l))));
    if (ui.depth === 0) for (const [id, label, role] of SECTIONS) kids.push(h('details', { class: 'sec', open: ui.open === id, ontoggle: (e) => { if (e.target.open) ui.open = id; else if (ui.open === id) ui.open = null; } }, h('summary', {}, label, h('span', {}, role)), controls(id).map(ctl)));
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
      kids.push(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('b', {}, 'The system of this study')),
        h('div', { class: 'cards' }, SYSTEMS.map(([id, name]) => h('button', { class: 'card', type: 'button', 'aria-pressed': String(study.sysId === id), onclick: () => { M.setSystem(id); loadSelected(); refresh(true); } }, h('b', {}, name), h('span', {}, { h2o: 'molecule · real results', c60: 'molecule, 60 atoms', 'gr-bz': 'surface, 72 atoms', si64: 'crystal, 64 atoms', ala20: 'peptide, 203 atoms' }[id])))),
        h('p', { style: 'font-size:12px;color:var(--fg-3)' }, 'Every step of the study is computed on this structure, or on a geometry relaxed from it. Changing it keeps the steps and forgets their results.')),
        h('div', { class: 'notice' }, h('b', {}, study.sysId === 'h2o' ? 'Real results are bundled for water' : 'No recorded result for this system'), h('span', {}, 'A web page cannot start BigDFT. For water, ' + Object.keys(M.LIB).length + ' calculations were run with BigDFT 1.9.1 through the registry of steps, and a step whose input is one of them shows its real result. For any other system or setting the study is built and checked the same way, and says its result is not available here.')));
      if (!study.steps.length) kids.push(h('div', { class: 'compute-row' }, h('button', { class: 'btn cta', type: 'button', onclick: () => select(M.add('calculation', null).id) }, 'Add the first calculation')));
    } else if (M.isCalc(step)) kids.push(...calcPanel(step));
    else if (step.kind === 'converge') {
      const setting = M.settingOf(step.params.action);
      kids.push(stepSelect(step, 'of', (x) => x.kind === 'calculation', null, 'The calculation to vary'),
        stepSelect(step, 'relative_to', (x) => x.kind === 'calculation' && x.id !== step.links.of, 'nothing: watch its total energy', 'Watch its difference with'),
        field('Setting varied', h('select', { 'aria-label': 'Setting varied', disabled: true }, h('option', {}, (LABELS[setting] || setting) + '  ·  ' + step.params.action)), 'The registry names an input action; more settings will come with it.'),
        field('Values, from the cheapest to the most accurate', h('input', { type: 'text', value: step.params.values.join(', '), 'aria-label': 'Values', onchange: (e) => { const v = parseList(e.target.value); if (v && v.length > 1) { step.params.values = v; M.touch(); } refresh(true); } }), 'The last one is the reference.'),
        number(step, 'within', 'Converged when within (meV' + (step.links.relative_to ? '' : ' per atom') + ')', 'of the reference', 1000), computeRow(step));
    } else if (step.kind === 'choose') {
      kids.push(stepSelect(step, 'among', (x) => x.kind === 'converge', null, 'Decides on'), ...decisionTable(step));
      if (step.params.retained != null) kids.push(field('Why this value and not the proposed one', h('input', { type: 'text', value: step.params.because || '', placeholder: 'the reason is kept with the study', 'aria-label': 'Reason', onchange: (e) => { step.params.because = e.target.value; M.touch(); refresh(); } })),
        h('div', { class: 'compute-row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { step.params.retained = null; M.touch(); refresh(true); } }, 'Back to what the criterion proposes')));
      kids.push(h('p', { class: 'figmeta' }, 'Every calculation placed after this step uses the kept value. Changing it sends them back to “to compute”.'));
    } else if (step.kind === 'difference') {
      kids.push(stepSelect(step, 'a', M.isCalc, null, 'Energy of'), stepSelect(step, 'b', M.isCalc, null, 'minus energy of'),
        field('Unit', seg([['eV', 'eV'], ['kJ/mol', 'kJ/mol'], ['Ha', 'Ha']], step.params.unit, (u) => { step.params.unit = u; M.touch(); refresh(); })),
        stepSelect(step, 'against', (x) => x.kind === 'target', 'no target', 'Judged against'));
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
  const real = (run) => h('p', { class: 'figmeta' }, 'Computed with BigDFT ' + run.version + ' for this mock-up (run ', h('code', {}, run.name), ' of the library), ' + fx(run.wall, 1) + ' s on ' + run.omp + ' threads. Every number here is read from its log.');
  function waiting(step) {
    const s = M.status(step), runs = M.isCalc(step) ? [M.runOf(step)] : step.kind === 'converge' ? M.members(step).flatMap((m) => [m.of, m.rel].filter(Boolean)) : [];
    if (s.state === 'ready') return [h('p', { class: 'say' }, h('b', {}, 'Ready. '), 'Nothing stops this step: its input is written and checked. ', runs.length > 1 ? runs.length + ' runs would be sent.' : ''),
      h('div', {}, h('button', { class: 'btn cta', type: 'button', onclick: () => { M.compute(step); refresh(true); } }, 'Compute this step'))];
    if (s.state === 'blocked') return [h('p', { class: 'say' }, h('b', {}, 'Not yet. '), 'This step ' + s.text + '. Compute what comes before it, or press “Compute what is ready”: the study is sent wave after wave.')];
    return [h('p', { class: 'say' }, h('b', {}, 'No recorded result for this input. '), 'This mock-up holds real BigDFT results for a set of calculations on water; this one is not among them' + (study.sysId === 'h2o' ? ' (' + s.text + ')' : '') + '. On the platform the step would be sent to the HAPS as:'),
      h('pre', { class: 'wave' }, 'haps_bigdft(names=[' + runs.map((r) => '"' + r.name + '"').join(', ') + '], directory="runs")'),
      h('p', { class: 'figmeta' }, 'The input it would send is in the “Input” tab, and it is exact.')];
  }
  function geometryNote(run) {
    const sys = study.sys, start = sys.atoms.map((a) => a.p.map((x, d) => x + sys.origin[d])), end = run.relax.final.map((f) => f.slice(1));
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
      if (s.state !== 'done') kids.push(...waiting(step));
      else {
        const run = M.runOf(step).run, homo = run.levels ? Math.max(...run.levels.up.concat(run.levels.down.length ? run.levels.down : [-1e9]).filter(Number.isFinite)) : null;
        const scf = { title: '', caption: '', panels: [{ title: step.kind === 'relax' ? 'Self-consistency of the first geometry' : 'Self-consistency', x: { label: 'Iteration', min: 0, fmt: (v) => String(Math.round(v)) }, y: { label: 'Wavefunction residue', log: true }, series: [{ name: 'residue', slot: 0, marker: true, pts: run.scf }], hlines: [{ y: run.gnrm_cv, label: 'criterion' }] }] };
        const left = [h('p', { class: 'big' }, fx(run.energy, 6), h('small', {}, 'Ha')), facts([['SCF iterations', String(run.iters) + (run.relax ? ' at the first geometry' : '')], ['Last residue', sci(run.gnrm) + ' for ' + sci(run.gnrm_cv) + ' asked'],
          homo != null ? ['Highest occupied level', fx(homo, 3) + ' eV'] : null, run.dipole != null ? ['Dipole', fx(run.dipole, 3) + ' D'] : null, ['Grid points', fr(run.nc, 0) + ' coarse, ' + fr(run.nf, 0) + ' fine'], ['Memory peak', run.mem + ' MB'],
          ['Warnings', run.warnings.length ? run.warnings.join(' · ') : 'none']].concat(run.relax ? [['Force evaluations', String(run.relax.steps.length)], ['Largest force at the end', sci(run.fmax) + ' Ha/bohr for ' + sci(run.relax.forcemax) + ' asked']].concat(geometryNote(run)) : []))];
        const right = [figure(scf)];
        if (run.relax) { const e0 = run.relax.steps[0][0], x = { label: 'Force evaluation', min: 0, fmt: (v) => String(Math.round(v)) };
          right.unshift(figure({ title: '', caption: '', panels: [{ title: 'Energy', x, y: { label: 'E − E(start) (meV)', fmt: (v) => v.toFixed(0).replace('-', '−') }, series: [{ name: 'energy', slot: 0, marker: true, pts: run.relax.steps.map((q, i) => [i, (q[0] - e0) * 27211.386]) }] },
            { title: 'Largest force', x, y: { label: 'Ha/bohr', log: true }, series: [{ name: 'force', slot: 1, marker: true, pts: run.relax.steps.map((q, i) => [i, q[1]]) }], hlines: [{ y: run.relax.forcemax, label: 'asked' }] }] })); }
        if (run.relax && run.fmax > run.relax.forcemax) left.push(h('div', { class: 'notice' }, h('b', {}, 'Look at the last force'), h('span', {}, 'BigDFT ended this relaxation with a largest force of ' + sci(run.fmax) + ' Ha/bohr, above the ' + sci(run.relax.forcemax) + ' asked. The geometry may not be the minimum: a finer grid gives cleaner forces.')));
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:12px' }, left), h('div', { style: 'display:grid;gap:12px;min-width:0' }, right)), real(run));
      }
    } else if (step.kind === 'converge') {
      const ser = M.series(step);
      if (!ser.complete) kids.push(...waiting(step));
      else {
        const unit = ser.relative ? 'eV' : 'meV per atom', ref = ser.rows[ser.rows.length - 1].quantity, y = (r) => (ser.relative ? r.quantity : (r.quantity - ref) * 1000);
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:10px' },
          h('p', { class: 'say' }, ser.proposed == null ? h('b', {}, 'Not converged in this range. ') : h('b', {}, 'Converged at ' + ser.proposed + '. '), ser.proposed == null ? 'No value is within ' + fx(step.params.within * 1000, 0) + ' meV of the last one.' : 'It is the cheapest value within ' + fx(step.params.within * 1000, 0) + ' meV of the reference. A decision step keeps it, or another, for what follows.'),
          h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Value', ser.relative ? 'Difference (eV)' : 'Energy (eV/atom)', 'Off reference (meV)', 'BigDFT time (s)'].map((c) => h('th', {}, c)))),
            h('tbody', {}, ser.rows.map((r) => h('tr', {}, h('td', { class: 'num' }, String(r.value)), h('td', { class: 'num' }, fx(r.quantity, ser.relative ? 4 : 5)), h('td', { class: 'num' }, fx(r.away * 1000, 1)), h('td', { class: 'num' }, fx(r.seconds, 0)))))))),
          figure({ title: '', caption: '', panels: [{ title: ser.relative ? 'What is watched: the difference' : 'Total energy, against the reference', x: { label: (LABELS[M.settingOf(step.params.action)] || 'value'), fmt: (v) => String(+v.toFixed(3)) }, y: { label: unit, fmt: (v) => v.toFixed(ser.relative ? 2 : 0) },
            series: [{ name: step.title, slot: 0, marker: true, pts: ser.rows.map((r) => [r.value, y(r)]).sort((a, b) => a[0] - b[0]) }] }] }, 210)),
          h('p', { class: 'figmeta' }, ser.rows.length * (ser.relative ? 2 : 1) + ' real BigDFT runs. A value already computed elsewhere in the study is not computed twice.'));
      }
    } else if (step.kind === 'choose') {
      kids.push(h('p', { class: 'say' }, M.retained(step) == null ? h('b', {}, 'No decision yet. ') : h('b', {}, 'Kept: ' + M.retained(step) + '. '), 'A decision is a step of the study: the series proposes, a person keeps. Every calculation after it uses the kept value.'), ...decisionTable(step));
    } else if (step.kind === 'difference') {
      const d = M.difference(step);
      if (!d) kids.push(...waiting(step));
      else {
        const left = [h('p', { class: 'big' }, fx(d.value, d.unit === 'Ha' ? 6 : 3), h('small', {}, d.unit)),
          h('p', { class: 'say' }, 'E(“' + M.byId(step.links.a).title + '”) − E(“' + M.byId(step.links.b).title + '”). ', d.target ? h('b', {}, d.agrees ? 'Within the target. ' : 'Outside the target. ') : null, d.target ? fx(d.value - d.target.value, 3) + ' ' + d.unit + ' from ' + d.target.value + ' ± ' + d.target.within + (d.target.source ? ' (' + d.target.source + ').' : '.') : 'No target is attached to this result.')];
        const right = d.target ? [figure({ kind: 'interval', title: '', caption: '', x: { label: step.title + ' (' + d.unit + ')', unit: d.unit, fmt: (v) => v.toFixed(2) }, band: { x0: d.target.value - d.target.within, x1: d.target.value + d.target.within, mid: d.target.value, label: 'target ' + d.target.value + ' ± ' + d.target.within },
          rows: study.steps.filter((x) => x.kind === 'difference' && x.links.against === step.links.against && M.difference(x)).map((x) => ({ label: x.title, value: M.difference(x).value, text: fx(M.difference(x).value, 3) + ' ' + d.unit })) })] : [];
        kids.push(h('div', { class: 'res-cols' }, h('div', { style: 'display:grid;gap:12px' }, left), h('div', { style: 'min-width:0' }, right)));
      }
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
    if (ui.tab === 'map') {
      const col = {}, rows = {}, depth = (s) => (s.id in col ? col[s.id] : (col[s.id] = 1 + Math.max(0, ...Object.values(s.links).map(M.byId).filter(Boolean).map(depth))));
      const TYPE = { calculation: 'run', relax: 'relax', converge: 'series', choose: 'decision', difference: 'formula', target: 'target' };
      const nodes = [{ id: 'system', col: 0, row: 0, type: 'structure', title: study.sys.name, sub: study.sys.atoms.length + ' atoms' }].concat(study.steps.map((s) => { const c = s.kind === 'target' ? 0 : depth(s), r = rows[c] = (rows[c] == null ? (c === 0 ? 1 : 0) : rows[c] + 1); return { id: s.id, col: c, row: r, type: TYPE[s.kind], title: s.title, sub: resultOf(s) || summaryOf(s) }; }));
      const edges = study.steps.flatMap((s) => {
        const L = s.links, out = [];
        if (M.isCalc(s)) out.push([L.after || 'system', s.id, L.after && M.geometryFrom(s) && M.geometryFrom(s).id === L.after ? 'wavefunctions' : 'geometry']);
        for (const r of ['of', 'relative_to', 'among', 'a', 'b']) if (L[r]) out.push([L[r], s.id, 'energies']);
        if (L.against) out.push([L.against, s.id, 'criterion']);
        if (s.kind === 'choose') for (const later of study.steps) if (M.isCalc(later) && M.at(later) > M.at(s) && !(later.links.after && M.at(M.byId(later.links.after)) > M.at(s))) out.push([s.id, later.id, 'choice']);
        return out;
      });
      OND.board.draw($('#map'), nodes, edges, ui.sel, select, (n) => { const x = n.id === 'system' ? { state: 'done', text: 'given' } : M.status(M.byId(n.id)); return [{ done: 'done', given: 'done', ready: 'draft', blocked: 'queued', absent: 'partial' }[x.state], x.state === 'given' ? 'set' : x.state]; }, { px: 212 });
    }
    if (ui.tab === 'log') $('#log').replaceChildren(h('p', { class: 'figmeta' }, 'What was sent, wave after wave. A wave holds every run that needs nothing still to come; the next one waits for it. Here each run comes back at once with its recorded result; the time shown is what BigDFT took.'),
      ...(study.log.length ? study.log.map((entry, n) => h('pre', { class: 'wave', html: entry.waves.map((w, i) => '<b>wave ' + (i + 1) + '</b>  haps_bigdft(names=[' + w.map((r) => '"' + esc(r.name) + '"').join(', ') + '], directory="runs")\n' + w.map((r) => '  <span class="ok">[OK]</span> bigdft -n ' + esc(r.name) + ', ' + fx(r.seconds, 0) + ' s' + (r.relax ? '  <span class="c"># relaxation</span>' : '')).join('\n')).join('\n') + (entry.absent.length ? '\n<span class="c"># no recorded result: ' + esc(entry.absent.join(', ')) + '</span>' : '') }))
        : [h('p', { class: 'say' }, 'Nothing computed yet.')]));
  }

  // ------------------------------------------------------------------ refresh and wiring
  let queued = false;
  function refresh(scene) {
    if (scene) renderStage();
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; renderRail(); renderStage(); if (!ui.drag) renderInspector(); renderDock(); $('#study-name').value = study.name; });
  }
  function example() { select(M.example().id); }
  function start() { M.reset(); M.setSystem('h2o'); const first = M.add('calculation', null); first.title = 'Ground state'; M.touch(); select('system'); }

  $('#add-open').addEventListener('click', () => { ui.palette = !ui.palette; refresh(); });
  $('#compute-all').addEventListener('click', () => { M.compute(); ui.tab = 'log'; refresh(true); });
  $('#example').addEventListener('click', example);
  $('#restart').addEventListener('click', start);
  $('#study-name').addEventListener('change', (e) => { study.name = e.target.value.trim() || 'Untitled study'; refresh(); });
  $('.tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) { ui.tab = t.dataset.tab; $('#dock').classList.remove('closed'); refresh(); } });
  $('#dock-toggle').addEventListener('click', (e) => { const tall = $('#dock').classList.toggle('tall'); e.target.textContent = tall ? 'Smaller' : 'Larger'; setTimeout(() => window.dispatchEvent(new Event('resize')), 0); refresh(); });
  $('#viewbar').addEventListener('click', (e) => { const b = e.target.closest('.tog'); if (b && !b.disabled) { ui.view[b.dataset.view] = !ui.view[b.dataset.view]; refresh(true); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { themeColors(); refresh(true); });
  window.addEventListener('resize', () => { if (ui.tab === 'results' || ui.tab === 'map') refresh(); });

  themeColors();
  start();
  OND.w2 = { model: M, ui, select, example, refresh };
})(window.OND);
