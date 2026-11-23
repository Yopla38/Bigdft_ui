/* A fit: the data it takes, the model built from the registry of functions, running it, and what
 * it gave. The registry is the server's (asymille/functions.py, read once in the catalogue): the
 * list of functions, their parameters and their equations are drawn from it, not written here.
 *
 * The model is data in the project (fit.model: components and parameters). The server fits it and
 * answers the parameters with their uncertainties, the statistics, the curve to draw and warnings
 * about what should not be trusted; all of it is kept with the fit, so that a project opened
 * again shows what was found without computing anything. A fit whose data or model changed since
 * says so ("out of date") until it is run again. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, M = ASY.model, ui = ASY.ui, api = window.OND.api;
  const A = () => ASY.app;
  const open = {};                               // which parameters show their bounds and tie
  let adding = false, textOf = null;

  const fnOf = (c) => (A().catalogue ? A().catalogue.functions.find((f) => f.name === c.fn) : null);
  ASY.fnLabel = (c) => (c.fn === 'expression' ? 'your expression' : (fnOf(c) || { label: c.fn }).label);
  /* An equation, typeset when MathJax is there (it comes from the network), in plain characters until then. */
  ASY.tex = (tex) => {
    const el = h('div', { class: 'eqn' });
    try {
      if (window.MathJax && window.MathJax.tex2svg) {
        if (!document.getElementById('asy-mjx')) { const css = window.MathJax.svgStylesheet(); css.id = 'asy-mjx'; document.head.append(css); }      // hides the copy of the equation kept for screen readers
        el.append(window.MathJax.tex2svg(tex, { display: false })); return el;
      }
    } catch (e) { /* written plainly below */ }
    el.append(h('span', { class: 'plain' }, tex.replace(/\\(mathrm|operatorname)\{([^}]*)\}/g, '$2').replace(/\\[,!;]/g, ' ').replace(/\\left|\\right/g, '')));
    return el;
  };
  const dirty = (f) => { if (f.result || Object.keys(f.results).length) f.stale = true; M.previewOf.fit = null; };

  function addComponent(f, fn) {
    const def = A().catalogue.functions.find((x) => x.name === fn);
    // p1, p2 for peaks, b1 for a baseline…: the letter says what the component is, the number tells them apart
    const letter = fn === 'expression' ? 'u' : { 'Peaks': 'p', 'Baseline and polynomials': 'b', 'Exponential and power': 'e', 'Sigmoids and steps': 's', 'Oscillations': 'w', 'Physics and chemistry': 'm', 'Instrument response': 'r' }[def.family] || 'c';
    const c = { id: M.componentId(f, letter), fn, params: {} };
    if (fn === 'expression') { c.expr = 'a*x + b'; c.params = { a: { value: 1, vary: true, min: null, max: null, expr: '' }, b: { value: 0, vary: true, min: null, max: null, expr: '' } }; }
    else def.params.forEach((p) => { c.params[p.name] = { value: p.default, vary: true, min: p.min, max: p.max, expr: '' }; });
    f.model.components.push(c); dirty(f);
    return c;
  }
  /* The parameters of an expression are the names it uses, x apart: kept when they stay, made when they appear. */
  function syncExpression(c) {
    const compiled = ASY.expr.compile(c.expr), names = compiled.names.filter((n) => n !== 'x'), next = {};
    names.forEach((n) => { next[n] = c.params[n] || { value: 1, vary: true, min: null, max: null, expr: '' }; });
    c.params = next;
  }

  // ------------------------------------------------------------------ the panel
  function tab() {
    const cat = A().catalogue, doc = M.doc;
    if (!cat) return [h('div', { class: 'notice' }, 'Fitting is done by the server, which does not answer here: the page is showing a project without it.')];
    const f = M.fit(doc.view.fit);
    const start = { sheet: null, y: null };
    const g = doc.view.main === 'graph' ? M.graph(doc.view.graph) : null;
    const firstData = g ? g.figure.panels.flatMap((p) => p.series).find((r) => r.kind === 'data' && (r.id === A().state.series || true)) : null;
    const s0 = firstData ? M.sheet(firstData.sheet) : M.sheet(doc.view.sheet) || doc.sheets[0];
    start.sheet = s0 ? s0.id : null; start.y = firstData ? firstData.y : s0 ? (s0.columns.find((c) => c.role === 'y') || s0.columns[0] || {}).id : null;
    const yPick = h('span', {});
    const drawY = () => ASY.fill(yPick, ui.sel(start, 'y', ASY.inspect.columnOptions(M.sheet(start.sheet)), { then: () => {}, quiet: true }));
    drawY();
    const create = ui.sec(f ? 'Another fit' : 'A new fit', '', !f,
      ui.field('Sheet', ui.sel(start, 'sheet', ASY.inspect.sheetOptions(), { then: () => { const s = M.sheet(start.sheet); start.y = s ? (s.columns.find((c) => c.role === 'y') || s.columns[0] || {}).id : null; drawY(); }, quiet: true })),
      ui.field('Y column to fit', yPick),
      h('div', { class: 'acts' }, ui.btn('New fit', () => { const s = M.sheet(start.sheet), y = M.column(s, start.y); if (!y) return A().say('Choose a column to fit', true); A().fitColumn(s, y); }, f ? '' : 'cta')));
    if (!f) return [h('p', { class: 'say', style: 'padding:12px 0' }, 'A fit takes a column of a sheet, a model built from peaks, baselines, decays… or from your own expression, and gives the parameters with their uncertainties.'), create];

    const s = M.sheet(f.sheet), cols = (opt) => ASY.inspect.columnOptions(s, opt), others = s ? s.columns.filter((c) => c.role === 'y' && c.id !== f.y) : [];
    const structural = { then: () => dirty(f), structural: true }, plain = { then: () => dirty(f) };
    const through = M.hasResponse(f);
    const running = A().state.busy === 'fit:' + f.id;
    const res = f.result, byName = {};
    if (res) res.params.forEach((p) => { byName[p.name] = p; });

    const paramRow = (c, name, spec) => {
      const full = c.id + '_' + name, def = (fnOf(c) || { params: [] }).params.find((p) => p.name === name), got = byName[full], more = open[f.id + full];
      const fitted = got && got.value != null ? (got.stderr != null ? ASY.pm(got.value, got.stderr) : ASY.fmt(got.value, 7) + (got.vary || got.tied ? ' (no uncertainty)' : '')) : '';
      return [h('div', { class: 'prm', title: (def ? def.label : 'a parameter of your expression') + ' — ' + full },
        h('input', { type: 'checkbox', checked: spec.vary !== false && !spec.expr, disabled: !!spec.expr, title: 'Fitted when ticked, held at its value otherwise', 'aria-label': 'Fit ' + full, onchange: (e) => { spec.vary = e.target.checked; dirty(f); A().touch(); } }),
        h('label', {}, name),
        spec.expr ? h('input', { type: 'text', value: '= ' + spec.expr, disabled: true }) : h('input', { type: 'text', inputmode: 'decimal', value: spec.value, 'aria-label': 'Starting value of ' + full,
          onchange: (e) => { const v = ASY.parseNum(e.target.value); if (isNaN(v)) { e.target.value = spec.value; return A().say('Not a number', true); } spec.value = v; f.options.started = true; dirty(f); A().touch(); } }),
        h('button', { class: 'more', type: 'button', title: 'Bounds, or a tie to other parameters', 'aria-expanded': String(!!more), onclick: () => { open[f.id + full] = !more; A().refresh(); } }, more ? '–' : '…'),
        fitted && !f.stale ? h('div', { class: 'prm-res' + (got.stderr == null && got.vary ? ' bad' : '') }, '= ' + fitted) : null),
      more ? h('div', { class: 'prm-more' },
        h('span', {}, 'min'), h('input', { type: 'text', value: spec.min == null ? '' : spec.min, placeholder: 'none', onchange: (e) => { const v = ASY.parseNum(e.target.value); spec.min = isNaN(v) ? null : v; dirty(f); A().touch(); } }),
        h('span', {}, 'max'), h('input', { type: 'text', value: spec.max == null ? '' : spec.max, placeholder: 'none', onchange: (e) => { const v = ASY.parseNum(e.target.value); spec.max = isNaN(v) ? null : v; dirty(f); A().touch(); } }),
        h('span', {}, 'tied to'), h('input', { class: 'tie', type: 'text', value: spec.expr || '', placeholder: 'e.g. ' + (f.model.components[0].id + '_' + Object.keys(f.model.components[0].params)[0]) + ' + 1.5', spellcheck: 'false',
          onchange: (e) => { spec.expr = e.target.value.trim(); dirty(f); A().refresh(); } }),
        f.mode === 'global' ? h('label', { class: 'check tie' }, h('input', { type: 'checkbox', checked: f.shared.includes(full), onchange: (e) => { f.shared = f.shared.filter((n) => n !== full).concat(e.target.checked ? [full] : []); dirty(f); A().touch(); } }), 'The same value for every column') : null) : null];
    };
    const card = (c) => {
      const def = fnOf(c);
      let problem = '';
      if (c.fn === 'expression') { try { ASY.expr.compile(c.expr); } catch (e) { problem = e.message; } }
      return h('div', { class: 'act' },
        h('div', { class: 'act-head' }, h('b', {}, h('code', {}, c.id), ' · ', ASY.fnLabel(c)), ui.btn('Remove', () => { f.model.components = f.model.components.filter((k) => k !== c); f.shared = f.shared.filter((n) => !n.startsWith(c.id + '_')); dirty(f); A().refresh(); }, 'danger')),
        c.fn === 'expression' ? ui.field('y =', h('input', { class: 'inp', type: 'text', value: c.expr, spellcheck: 'false', onchange: (e) => { c.expr = e.target.value; try { syncExpression(c); } catch (err) { /* said under the field */ } dirty(f); A().refresh(); } }),
          problem ? null : 'x is the variable; every other name is a parameter. ' + (A().catalogue.expression_functions || []).slice(0, 12).join(', ') + '…') : ASY.tex(def ? def.tex : ''),
        problem ? h('small', { class: 'act-note err' }, problem) : null,
        def && def.note ? h('small', { class: 'act-note' }, def.note) : null,
        Object.entries(c.params).map(([name, spec]) => paramRow(c, name, spec)));
    };
    const palette = () => h('div', { class: 'palette' },
      cat.families.map((family) => [h('h4', {}, family), cat.functions.filter((x) => x.family === family).map((x) => h('button', { class: 'pal', type: 'button', onclick: () => { addComponent(f, x.name); adding = false; A().refresh(); } }, h('b', {}, x.label), h('span', {}, x.params.map((p) => p.name).join(', '))))]),
      h('h4', {}, 'Yours'), h('button', { class: 'pal', type: 'button', onclick: () => { addComponent(f, 'expression'); adding = false; A().refresh(); } }, h('b', {}, 'Your own expression'), h('span', {}, 'y = a*x + b, a*exp(-x/tau) + c, …')));

    const many = [f.y].concat(f.more).length;
    return [
      doc.fits.length > 1 ? ui.field('Fit', ui.sel(doc.view, 'fit', doc.fits.map((k) => [k.id, k.name]), { structural: true })) : null,
      f.stale ? h('div', { class: 'notice' }, 'The data or the model changed since this fit was run: what is shown is out of date. Fit again.') : null,
      ui.sec('Data', s ? s.name + ' · ' + M.label(M.column(s, f.y)) : 'missing', !res,
        h('div', { class: 'cols2' }, ui.field('X', ui.sel(f, 'x', cols({ none: 'row number' }), { nullable: true, then: () => dirty(f) })), ui.field('Y', ui.sel(f, 'y', cols(), structural))),
        ui.field('Weights', ui.sel(f.options, 'weights', Object.entries(cat.weights).map(([k, v]) => [k, k === 'none' ? 'none: ' + v : v]), structural)),
        f.options.weights === 'instrumental' ? [ui.field('Error column (σ of each y)', ui.sel(f, 'yerr', cols({ none: 'choose' }), { nullable: true, then: () => dirty(f) })),
          through ? null : ui.field('Error column of x', ui.sel(f, 'xerr', cols({ none: 'none: x is exact' }), { nullable: true, structural: true, then: () => { dirty(f); M.doc.graphs.forEach((k) => k.figure.panels.forEach((p) => p.series.forEach((r) => { if (r.kind === 'data' && r.sheet === f.sheet && r.y === f.y && f.xerr && !r.xerr) r.xerr = f.xerr; }))); } }),
            f.xerr ? 'Each point then counts by its distance to the curve in units of its two error bars (orthogonal distance regression).' : 'Choose one when x was measured too: a fit that ignores its errors gives a slope that is too small.'),
          ui.chk(f.options, 'absolute_sigma', 'These σ are true: do not rescale the uncertainties by χ²', plain)] : null,
        through ? ui.field('Response of the instrument', ui.sel(f, 'response', cols({ none: 'choose' }), { nullable: true, then: () => dirty(f) }),
          'A column of this sheet: the response measured on the same x as the data, in even steps. Its scale does not matter; a constant background should be removed from it first.') : null,
        others.length ? ui.field('How many columns', ui.sel(f, 'mode', [['single', 'this column only'], ['batch', 'several columns, one after the other'], ['global', 'several columns, with shared parameters']], { then: () => { if (f.mode === 'single') { f.more = []; f.shared = []; } dirty(f); }, structural: true })) : null,
        f.mode !== 'single' ? h('div', {}, others.map((c) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.more.includes(c.id), onchange: (e) => { f.more = f.more.filter((k) => k !== c.id).concat(e.target.checked ? [c.id] : []); dirty(f); A().touch(); } }), M.label(c))),
          f.mode === 'global' ? h('small', { class: 'act-note' }, 'Open a parameter (…) to make it the same for every column.') : null) : null),
      ui.sec('Range of x', f.limits ? ASY.fmt(f.limits[0], 5) + ' to ' + ASY.fmt(f.limits[1], 5) : 'all the data', !!f.limits,
        h('div', { class: 'cols2' },
          ui.field('From', h('input', { class: 'inp num', type: 'text', value: f.limits && f.limits[0] != null ? f.limits[0] : '', placeholder: 'the start', onchange: (e) => { const v = ASY.parseNum(e.target.value); f.limits = [isNaN(v) ? null : v, f.limits ? f.limits[1] : null]; if (f.limits[0] == null && f.limits[1] == null) f.limits = null; dirty(f); A().refresh(); } })),
          ui.field('To', h('input', { class: 'inp num', type: 'text', value: f.limits && f.limits[1] != null ? f.limits[1] : '', placeholder: 'the end', onchange: (e) => { const v = ASY.parseNum(e.target.value); f.limits = [f.limits ? f.limits[0] : null, isNaN(v) ? null : v]; if (f.limits[0] == null && f.limits[1] == null) f.limits = null; dirty(f); A().refresh(); } }))),
        h('div', { class: 'acts' }, g ? ui.btn('Pick it on the graph', () => { A().state.tool = 'range'; A().refresh(); A().say('Drag across the part of the curve to fit'); }, A().state.tool === 'range' ? 'cta' : '') : null,
          ui.btn('All the data', () => { f.limits = null; dirty(f); A().refresh(); }, '', { disabled: !f.limits }))),
      ui.sec('Model', f.model.components.length ? f.model.components.map((c) => c.id).join(' + ') : 'empty', true,
        f.model.components.length ? null : h('p', { class: 'say', style: 'padding:8px 0' }, 'Add what the curve is made of: one component per peak, one for the background. The model is their sum.'),
        f.model.components.map(card),
        h('div', { class: 'acts' }, ui.btn(adding ? 'Close the list' : '+ Add a component', () => { adding = !adding; A().refresh(); }, '', { 'aria-expanded': String(adding) })),
        adding ? palette() : null),
      h('div', { class: 'acts', style: 'padding:12px 0;border-bottom:1px solid var(--line)' },
        ui.btn(running ? 'Fitting…' : many > 1 && f.mode !== 'single' ? 'Fit ' + many + ' columns' : 'Fit', () => run(f), 'cta', { disabled: running || !f.model.components.length, id: 'fit-run' }),
        ui.btn('Starting values from the data', () => guess(f), '', { disabled: running || !f.model.components.length, title: 'Read the baseline and the most prominent peaks from the data' }),
        ui.btn('Preview', () => preview(f), '', { disabled: running || !f.model.components.length, title: 'Draw the model at its starting values, without fitting' }),
        res && !f.stale ? ui.btn('Start from the result', () => { f.model.components.forEach((c) => Object.entries(c.params).forEach(([n, spec]) => { const got = byName[c.id + '_' + n]; if (got && got.value != null && !spec.expr) spec.value = Number(got.value.toPrecision(8)); })); A().refresh(); }, '', { title: 'Make the fitted values the new starting values' }) : null),
      onGraph(f, g),
      ui.sec('The model on one line', 'to copy, to paste', false,
        h('p', { class: 'say' }, 'The same model as text: keep it in a notebook, paste it into another fit. ', h('code', {}, '~'), ' starts from, ', h('code', {}, '='), ' holds at, ', h('code', {}, '> <'), ' bound, and after ', h('code', {}, '|'), ' come the ties.'),
        h('textarea', { class: 'inp', id: 'model-text', rows: 4, spellcheck: 'false', style: 'font:12px/1.5 var(--mono);margin:8px 0', placeholder: 'p1:gaussian(center~5, sigma~1) + bg:linear()' }, textOf && textOf.fit === f.id ? textOf.text : ''),
        h('div', { class: 'acts' }, ui.btn('Write the model here', async () => { try { const said = await api.post('asymille/model/write', { model: f.model }); textOf = { fit: f.id, text: said.text }; A().refresh(); } catch (e) { A().say(e.message, true); } }, '', { disabled: !f.model.components.length }),
          ui.btn('Read the model from here', async () => { try { const said = await api.post('asymille/model/parse', { text: ASY.$('#model-text').value }); f.model = said.model; f.shared = []; f.options.started = true; textOf = null; dirty(f); A().refresh(); } catch (e) { A().say(e.message, true); } }))),
      ui.sec('How it is fitted', cat.methods[f.options.method].split(',')[0], false,
        ui.field('Method', ui.sel(f.options, 'method', Object.entries(cat.methods), structural), f.options.method === 'differential_evolution' ? 'A global search needs a lower and an upper bound on every fitted parameter (open each with …).' : 'Every method ends with a descent to tight tolerances, which gives the uncertainties.'),
        f.options.method === 'least_squares' ? ui.field('Outliers', ui.sel(f.options, 'loss', [['linear', 'count fully (least squares)'], ['soft_l1', 'count less: soft L1'], ['huber', 'count less: Huber'], ['cauchy', 'count much less: Cauchy']], plain)) : null,
        h('div', { class: 'cols2' }, ui.field('Confidence level of the band', ui.num(f.options, 'level', { min: 0.5, max: 0.999, then: () => dirty(f) })), ui.field('Points of the curve drawn', ui.num(f.options, 'points', { min: 50, max: 20000, int: true, then: () => dirty(f) }))),
        ui.chk(f.options, 'intervals', 'Also profile χ² for each parameter (asymmetric intervals; slower)', plain)),
      ASY.seriespanel.section(f),
      h('div', { class: 'acts', style: 'padding:12px 0' },
        ui.btn('Duplicate this fit', () => { const k = M.duplicateFit(f); M.log('Fit “' + k.name + '”: a copy of “' + f.name + '”, to try another model on the same data.'); A().refresh(); A().say('A copy: change its model and fit, the results will compare the two'); }, '', { title: 'The same data and the same model under another name: change the model, fit, and the results say which of the two the data support' }),
        ui.btn('Delete this fit', () => { M.removeFit(f.id); A().refresh(); }, 'danger')),
      create,
    ];
  }

  /* What the graph shows of this fit beside its curve. Each button says what it will do: show when it is not there, take away when it is. */
  function onGraph(f, g) {
    const on = M.shownOf(f), curves = f.model.components.filter((c) => c.fn !== 'response').length;
    const flip = (what, show, hide) => () => { if (on[what]) hide(); else show(); A().refresh(); };
    return h('div', { class: 'on-graph', style: 'padding:10px 0;border-bottom:1px solid var(--line);display:grid;gap:6px' },
      h('p', { class: 'label' }, 'On the graph'),
      h('div', { class: 'acts' },
        ui.btn(on.components ? 'Hide the components' : 'Show the components', flip('components', () => M.showFit(f, g, { components: true }), () => M.hideFit(f, 'components')), on.components ? 'on' : '',
          { 'aria-pressed': String(on.components), disabled: curves < 2 && !on.components, title: curves < 2 ? 'A model of one component: its curve is the fit itself' : 'The curve of each component of the model, dashed, under the fit' }),
        ui.btn(on.band ? 'Hide the confidence band' : 'Show the confidence band', flip('band', () => M.showFit(f, g, { band: true }), () => M.hideFit(f, 'band')), on.band ? 'on' : '',
          { 'aria-pressed': String(on.band), title: 'Where the fitted curve lies with the confidence chosen under “How it is fitted”' }),
        ui.btn(on.residuals ? 'Remove the panel of residuals' : 'Add a panel of residuals', flip('residuals', () => { const where = M.showFit(f, g); if (where) M.showResiduals(f, where); }, () => M.hideResiduals(f)), on.residuals ? 'on' : '',
          { 'aria-pressed': String(on.residuals), title: 'Data minus fit, in a panel under the data' })),
      (on.components || on.band || on.residuals) && !(f.result || Object.keys(f.results).length) ? h('small', { class: 'act-note' }, 'They are drawn once the fit is run: a model that is only previewed has no components, band or residuals yet.') : null);
  }

  // ------------------------------------------------------------------ asking the server
  const limitsOf = (f) => (f.limits ? [f.limits[0], f.limits[1]] : null);
  const optionsOf = (f) => { const o = Object.assign({}, f.options); delete o.started; ['method', 'weights', 'loss'].forEach((k) => { if (o[k] == null) delete o[k]; }); return o; };
  /* What is kept of an answer: everything a person reads and the curves that are drawn, not what can be had again by fitting. */
  const kept = (res) => { const out = Object.assign({}, res); delete out.fitted; if (out.residuals) out.residuals = { x: out.residuals.x, y: out.residuals.y }; return out; };

  async function run(f) {
    const st = A().state, columnsOf = f.mode === 'single' ? [f.y] : [f.y].concat(f.more);
    st.busy = 'fit:' + f.id; A().refresh();
    try {
      if (f.options.weights === 'instrumental' && !f.yerr) throw new Error('Instrumental weights need an error column: choose it under Data, or choose other weights.');
      A().state.compared = null;
      if (!f.options.started) {            // nobody gave starting values yet: they are read from the data, as “Starting values from the data” does
        const d0 = M.fitData(f);
        f.model = (await api.post('asymille/model/guess', { x: d0.x, y: d0.y, model: f.model, limits: limitsOf(f) })).model; f.options.started = true;
        M.log('Fit “' + f.name + '”: starting values read from the data.');
      }
      const results = {};
      if (f.mode === 'global' && columnsOf.length > 1) {
        const sets = columnsOf.map((col) => M.fitData(f, col));
        const said = await api.post('asymille/fit/global', { datasets: sets, model: f.model, shared: f.shared, limits: limitsOf(f), options: optionsOf(f) });
        const common = Object.assign({}, said); delete common.datasets;
        said.datasets.forEach((d, i) => { results[columnsOf[i]] = kept(Object.assign({}, common, d)); });
      } else for (const col of columnsOf) {
        const d = M.fitData(f, col);
        results[col] = kept(await api.post('asymille/fit', Object.assign({ model: f.model, limits: limitsOf(f), options: optionsOf(f) }, d)));
      }
      f.result = results[f.y]; f.results = columnsOf.length > 1 ? results : {}; f.stale = false; M.previewOf.fit = null;
      const g = M.showFit(f, M.doc.view.main === 'graph' ? M.graph(M.doc.view.graph) : null);
      const r = f.result;
      M.log('Fit “' + f.name + '”: ' + f.model.components.map((c) => ASY.fnLabel(c)).join(' + ') + ' on ' + r.npoints + ' points' + (columnsOf.length > 1 ? ' (' + columnsOf.length + ' columns, ' + (f.mode === 'global' ? 'shared parameters' : 'one after the other') + ')' : '') +
        ', ' + r.method_label + ', weights: ' + r.weights + (r.x_errors ? ', errors of x counted' : '') + (r.response ? ', through the measured response' : '') + '. Reduced χ² ' + ASY.fmt(r.redchi, 5) + ', R² ' + ASY.fmt(r.rsquared, 6) + (r.success ? '.' : '. It did not converge.'));
      A().state.dock = 'results'; void g;
    } catch (e) { A().say(e.message, true); }
    st.busy = null; A().refresh();
  }
  async function guess(f) {
    try {
      const d = M.fitData(f), said = await api.post('asymille/model/guess', { x: d.x, y: d.y, model: f.model, limits: limitsOf(f) });
      f.model = said.model; f.options.started = true; dirty(f); A().refresh(); preview(f);
    } catch (e) { A().say(e.message, true); }
  }
  /* The model at its starting values, drawn with the data: what the fit will start from. */
  async function preview(f) {
    try {
      const ask = M.drawing(f, M.fitData(f), f.model, 400);
      if (!ask) throw new Error('There are no data in this range.');
      const said = ask.cut(await api.post('asymille/model/evaluate', ask.body));
      M.previewOf.fit = f.id; M.previewOf.curve = { x: said.x, y: said.y };
      if (f.result || Object.keys(f.results).length) { f.result = null; f.results = {}; f.stale = false; }
      M.showFit(f, M.doc.view.main === 'graph' ? M.graph(M.doc.view.graph) : null);
      A().refresh();
    } catch (e) { A().say(e.message, true); }
  }

  // ------------------------------------------------------------------ what a fit gave
  const STATS = [['redchi', 'Reduced χ²'], ['chisqr', 'χ²'], ['rsquared', 'R²'], ['adj_rsquared', 'Adjusted R²'], ['rmse', 'RMS of the residuals'], ['aic', 'AIC'], ['bic', 'BIC'], ['p_value', 'Probability of this χ² or more']];
  function tsv(f, r) {
    const lines = ['Parameter\tValue\tStandard error\tFitted\tConstraint'];
    r.params.forEach((p) => lines.push([p.name, p.value, p.stderr == null ? '' : p.stderr, p.vary ? 'yes' : 'no', p.tied ? '= ' + p.tied : ''].join('\t')));
    r.derived.forEach((d) => lines.push([d.name, d.value, d.stderr == null ? '' : d.stderr, 'derived', d.label].join('\t')));
    STATS.forEach(([k, label]) => { if (r[k] != null) lines.push([label, r[k], '', '', ''].join('\t')); });
    lines.push(['Points', r.npoints, '', '', ''].join('\t'), ['Fitted parameters', r.nvarys, '', '', ''].join('\t'));
    return lines.join('\n');
  }
  function latex(f, r) {
    const num = (v, e) => (e != null ? ASY.pm(v, e).replace(' ± ', ' \\pm ').replace(/\((.*)\)e(−?\d+)/, '($1) \\times 10^{$2}') : ASY.fmt(v, 6).replace(/e(−?\d+)/, ' \\times 10^{$1}')).replace(/−/g, '-');
    const rows = r.params.map((p) => '  \\texttt{' + p.name.replace(/_/g, '\\_') + '} & $' + num(p.value, p.stderr) + '$' + (p.vary ? '' : p.tied ? ' (tied)' : ' (fixed)') + ' \\\\')
      .concat(r.derived.map((d) => '  ' + d.label + ' (\\texttt{' + d.component + '}) & $' + num(d.value, d.stderr) + '$ \\\\'));
    return ['\\begin{tabular}{ll}', '  \\hline', '  Parameter & Value \\\\', '  \\hline'].concat(rows, ['  \\hline', '  Reduced $\\chi^2$ & $' + num(r.redchi) + '$ \\\\', '  $R^2$ & $' + num(r.rsquared) + '$ \\\\', '  \\hline', '\\end{tabular}']).join('\n');
  }
  /* A sentence for the methods of a paper: what was fitted, how, and how the uncertainties were obtained. */
  function methods(f, r) {
    const cat = A().catalogue, named = (label) => (/^(Gaussian|Lorentzian|Voigt|Pseudo|Pearson|Moffat|Fano|Doniach|Hill|Arrhenius|Langmuir|Michaelis|Fermi|Bi-Gaussian|Gompertz|Weibull|Planck|Langevin|Brillouin|Curie|Vogel)/.test(label) ? label : label[0].toLowerCase() + label.slice(1));
    const names = f.model.components.filter((c) => c.fn !== 'response').map((c) => { if (c.fn === 'expression') return 'the function y = ' + c.expr; const n = named(ASY.fnLabel(c)); return (/^(two|three) /.test(n) ? '' : /^[aeiouAEIOU]/.test(n) ? 'an ' : 'a ') + n; });
    const model = names.length === 1 ? names[0] : 'the sum of ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    const weights = r.x_errors ? 'with the errors of both x and y counted (orthogonal distance regression)' : { none: 'without weights', instrumental: 'with each point weighted by the inverse of its variance', statistical: 'with weights 1/y (counting statistics)', relative: 'with weights 1/y² (constant relative error)' }[r.weights];
    const through = r.response ? ', convolved with the measured response of the instrument (iterative reconvolution)' : '';
    const errors = !r.errorbars ? 'The uncertainties could not be estimated.' : r.absolute_sigma ? 'Uncertainties are standard errors from the covariance matrix, with the measurement errors taken as absolute.' : 'Uncertainties are standard errors from the covariance matrix, scaled by the reduced χ².';
    return 'The data (' + r.npoints + ' points' + (f.limits ? ', x from ' + ASY.fmt(r.range[0], 5) + ' to ' + ASY.fmt(r.range[1], 5) : '') + ') were fitted with ' + model + through + ' by non-linear least squares (' + r.method_label.replace(/,.*/, '') + ') ' + weights +
      ', using lmfit and SciPy through Asymille ' + cat.version + '. ' + errors + ' The fit gave a reduced χ² of ' + ASY.fmt(r.redchi, 4) + ' (R² = ' + ASY.fmt(r.rsquared, 5) + ', ' + r.nvarys + ' fitted parameters, ' + r.nfree + ' degrees of freedom).';
  }
  function curvesToSheet(f, r) {
    const s = M.sheet(f.sheet), xc = M.column(s, f.x), yc = M.column(s, f.y);
    const columns = [{ title: xc ? xc.title || xc.name : 'x', unit: xc ? xc.unit : '', values: r.curve.x, role: 'x' }, { title: 'Fit of ' + (yc ? yc.title || yc.name : 'y'), unit: yc ? yc.unit : '', values: r.curve.y }];
    Object.entries(r.curve.components).forEach(([cid, values]) => { if (f.model.components.length > 1) columns.push({ title: cid, values }); });
    if (r.curve.band) columns.push({ title: 'Band, lower (' + Math.round(r.curve.band.level * 100) + ' %)', values: r.curve.band.lower }, { title: 'Band, upper', values: r.curve.band.upper });
    const made = M.sheetFrom('Curve of ' + f.name, columns, 'The fitted curve of “' + f.name + '”.');
    const res = M.sheetFrom('Residuals of ' + f.name, [{ title: xc ? xc.title || xc.name : 'x', unit: xc ? xc.unit : '', values: r.residuals.x, role: 'x' }, { title: 'Residual', unit: yc ? yc.unit : '', values: r.residuals.y }], 'Data minus fit, for “' + f.name + '”.');
    M.log('The curve and the residuals of “' + f.name + '” were written to the sheets “' + made.name + '” and “' + res.name + '”.');
    A().refresh(); A().say('Written to two new sheets');
  }
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); A().say(what + ' copied'); } catch (e) { A().say('The browser did not allow copying', true); } };

  function results() {
    const f = M.fit(M.doc.view.fit), st = A().state;
    if (st.facts) return factsPanel(st.facts);
    if (!f) return [h('p', { class: 'say' }, 'The results of a fit or of an operation are shown here.')];
    const columnsOf = Object.keys(f.results);
    const which = columnsOf.length ? (columnsOf.includes(st.resultOf) ? st.resultOf : f.y) : null;
    const r = which ? f.results[which] : f.result;
    if (!r) return [h('div', { class: 'res-head' }, h('h3', {}, f.name)), h('p', { class: 'say' }, M.previewOf.fit === f.id ? 'The graph shows the model at its starting values. Press Fit.' : f.model.components.length ? 'Not fitted yet: press Fit.' : 'Build the model on the right, then press Fit.')];
    const s = M.sheet(f.sheet), rel = (p) => (p.stderr != null && p.value ? ASY.fmt(Math.abs(p.stderr / p.value) * 100, 3) + ' %' : '');
    const flag = (p) => (p.shared ? 'shared' : p.tied ? '= ' + p.tied : p.vary ? '' : 'fixed');
    return [
      h('div', { class: 'res-head' }, h('h3', {}, f.name + (which && columnsOf.length ? ' · ' + M.label(M.column(s, which)) : '')),
        h('span', { class: 'acts' }, f.stale ? h('span', { class: 'pill warn' }, 'out of date') : null, h('span', { class: 'pill ' + (r.success ? 'ok' : 'err') }, r.success ? 'converged' : 'did not converge'),
          h('span', { class: 'pill num' }, r.nfev + ' evaluations'))),
      columnsOf.length > 1 ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Which column' }, columnsOf.map((col) => h('button', { type: 'button', 'aria-pressed': String(col === which), onclick: () => { st.resultOf = col; A().redrawDock(); } }, M.label(M.column(s, col)) || col))) : null,
      r.warnings.map((w) => h('div', { class: 'notice' }, w)),
      h('div', { class: 'res-cols' },
        h('div', { style: 'display:grid;gap:14px;min-width:0' },
          h('div', { style: 'overflow-x:auto' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Parameter'), h('th', { class: 'num' }, 'Value ± standard error'), h('th', { class: 'num' }, 'Relative'), r.params.some((p) => p.interval) ? h('th', { class: 'num' }, Math.round(f.options.level * 100) + ' % interval') : null, h('th', {}, ''))),
            h('tbody', {}, r.params.map((p) => h('tr', {}, h('td', {}, h('code', {}, p.name)), h('td', { class: 'num' }, p.stderr != null ? ASY.pm(p.value, p.stderr) : ASY.fmt(p.value, 7)), h('td', { class: 'num' }, rel(p)),
              r.params.some((q) => q.interval) ? h('td', { class: 'num' }, p.interval && p.interval[0] != null && p.interval[1] != null ? ASY.fmt(p.interval[0], 6) + ' … ' + ASY.fmt(p.interval[1], 6) : '') : null, h('td', { class: 'muted' }, flag(p))))))),
          r.derived.length ? h('div', { style: 'overflow-x:auto' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Derived from them'), h('th', { class: 'num' }, 'Value ± standard error'), h('th', {}, ''))),
            h('tbody', {}, r.derived.map((d) => h('tr', {}, h('td', {}, h('code', {}, d.name)), h('td', { class: 'num' }, d.stderr != null ? ASY.pm(d.value, d.stderr) : ASY.fmt(d.value, 7)), h('td', { class: 'muted' }, d.label)))))) : null,
          h('div', { class: 'acts' }, ui.btn('Copy the table', () => copy(tsv(f, r), 'The table (tab-separated)')), ui.btn('Copy as LaTeX', () => copy(latex(f, r), 'The LaTeX table')),
            ui.btn('Write the curve to a sheet', () => curvesToSheet(f, r)))),
        h('div', { style: 'display:grid;gap:14px;min-width:0' },
          h('dl', { class: 'facts2' }, STATS.filter(([k]) => r[k] != null).flatMap(([k, label]) => [h('dt', {}, label), h('dd', {}, ASY.fmt(r[k], 6))]),
            h('dt', {}, 'Points fitted'), h('dd', {}, r.npoints + (r.given > r.npoints ? ' of ' + r.given : '')), h('dt', {}, 'Fitted parameters'), h('dd', {}, String(r.nvarys)), h('dt', {}, 'Degrees of freedom'), h('dd', {}, String(r.nfree)),
            h('dt', {}, 'Method'), h('dd', { style: 'font-family:var(--sans)' }, r.method_label), h('dt', {}, 'Weights'), h('dd', { style: 'font-family:var(--sans)' }, r.weights + (r.absolute_sigma ? ', absolute' : '') + (r.x_errors ? ', errors of x counted' : '')),
            r.response ? [h('dt', {}, 'Response'), h('dd', { style: 'font-family:var(--sans)' }, 'measured, convolved')] : null),
          r.correlations.filter((c) => Math.abs(c.value) >= 0.5).length ? h('div', {}, h('p', { class: 'label', style: 'margin-bottom:6px' }, 'Correlations above 0.5'),
            h('dl', { class: 'facts2' }, r.correlations.filter((c) => Math.abs(c.value) >= 0.5).slice(0, 12).flatMap((c) => [h('dt', {}, h('code', {}, c.a), ' · ', h('code', {}, c.b)), h('dd', {}, (c.value > 0 ? '+' : '−') + Math.abs(c.value).toFixed(3))]))) : null)),
      which && which !== f.y ? null : comparison(f),
    ];
  }
  /* Which model: this fit beside the other fits of the same points. The server computes; nothing of it is kept in the project. */
  function comparison(f) {
    const st = A().state, peers = M.doc.fits.filter((k) => M.comparable(f, k));
    if (!peers.length) return null;
    const all = [f].concat(peers), key = all.map((k) => k.id + ':' + k.result.chisqr + ':' + k.result.nvarys).join('|'), got = st.compared && st.compared.key === key ? st.compared.said : null;
    const ask = async () => {
      try { st.compared = { key, said: await api.post('asymille/fit/compare', { fits: all.map((k) => ({ name: k.name, ndata: k.result.ndata, nvarys: k.result.nvarys, chisqr: k.result.chisqr })) }) }; }
      catch (e) { A().say(e.message, true); }
      A().redrawDock();
    };
    const crit = got ? (got.by === 'aicc' ? 'AICc' : 'AIC') : '';
    return h('div', { class: 'compare', style: 'display:grid;gap:10px;border-top:1px solid var(--line);padding-top:12px' },
      h('div', { class: 'res-head' }, h('h3', {}, 'Which model'), h('span', { class: 'acts' }, ui.btn(got ? 'Compare again' : 'Compare with ' + (peers.length === 1 ? '“' + peers[0].name + '”' : 'the ' + peers.length + ' other fits of these points'), ask, got ? '' : 'cta', { id: 'fit-compare' }))),
      got ? [h('p', { class: 'say', style: 'font-size:14px;color:var(--fg)' }, got.said),
        h('div', { style: 'overflow-x:auto' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Fit'), h('th', { class: 'num' }, 'Parameters'), h('th', { class: 'num' }, 'χ²'), h('th', { class: 'num' }, crit), h('th', { class: 'num' }, 'Δ' + crit), h('th', { class: 'num' }, 'Akaike weight'), h('th', { class: 'num' }, 'BIC'))),
          h('tbody', {}, got.fits.map((k) => h('tr', {}, h('td', {}, k.name === got.best ? h('b', {}, k.name) : k.name), h('td', { class: 'num' }, String(k.nvarys)), h('td', { class: 'num' }, ASY.fmt(k.chisqr, 6)), h('td', { class: 'num' }, ASY.fmt(k[got.by], 6)),
            h('td', { class: 'num' }, ASY.fmt(k.delta, 4)), h('td', { class: 'num' }, k.weight === 0 ? '0' : k.weight < 1e-4 ? k.weight.toExponential(1).replace('-', '−') : k.weight.toFixed(4)), h('td', { class: 'num' }, ASY.fmt(k.bic, 6))))))),
        got.tests.map((t) => h('p', { class: 'say' }, t.said)),
        h('small', { class: 'act-note' }, crit + ' and BIC are computed from χ², the number of points and the number of fitted parameters; the Akaike weight is the share of support a model has among those compared. A lower χ² alone is not a reason: more parameters always fit better.'),
        h('div', { class: 'acts' }, ui.btn('Copy', () => copy([got.said].concat(got.fits.map((k) => [k.name, k.nvarys, k.chisqr, k[got.by], k.delta, k.weight, k.bic].join('\t')), got.tests.map((t) => t.said)).join('\n'), 'The comparison')))]
        : h('p', { class: 'say' }, peers.length === 1 ? '“' + peers[0].name + '” was fitted to the same points with the same weights: the two can be compared.' : peers.length + ' other fits were made of the same points with the same weights: they can be compared.'));
  }
  function report() {
    const f = M.fit(M.doc.view.fit), r = f && (f.result || f.results[f.y]);
    if (!r) return [h('p', { class: 'say' }, 'Once a fit is run: a sentence for the methods of a paper, the equations of the model, and the full report.')];
    return [
      h('div', {}, h('p', { class: 'label', style: 'margin-bottom:6px' }, 'For the methods of a paper'), h('p', { class: 'say', style: 'font-size:14px;color:var(--fg)' }, methods(f, r)),
        h('div', { class: 'acts', style: 'margin-top:8px' }, ui.btn('Copy', () => copy(methods(f, r), 'The sentence')))),
      h('div', {}, h('p', { class: 'label', style: 'margin-bottom:6px' }, 'The model: y is the sum of'), (r.equations || []).map((e) => ASY.tex(e.tex))),
      r.report ? h('div', {}, h('p', { class: 'label', style: 'margin-bottom:6px' }, 'Report of lmfit'), h('pre', { class: 'code' }, r.report), h('div', { class: 'acts', style: 'margin-top:8px' }, ui.btn('Copy', () => copy(r.report, 'The report')))) : null,
    ];
  }
  /* What an operation answered: its numbers, and the sentence that says what was done. */
  function factsPanel(facts) {
    return [h('div', { class: 'res-head' }, h('h3', {}, facts.title), h('span', { class: 'acts' }, ui.btn('Close', () => { A().state.facts = null; A().redrawDock(); }))),
      h('p', { class: 'say' }, facts.note),
      facts.facts.length ? h('dl', { class: 'facts2', style: 'max-width:520px' }, facts.facts.flatMap((x) => [h('dt', {}, x.label), h('dd', {}, x.error != null ? ASY.pm(x.value, x.error) : x.value == null ? '–' : ASY.fmt(x.value, 8))])) : null,
      h('div', { class: 'acts' }, ui.btn('Copy', () => copy(facts.note + '\n' + facts.facts.map((x) => x.label + '\t' + (x.value == null ? '' : x.value) + (x.error != null ? '\t' + x.error : '')).join('\n'), 'The numbers')))];
  }

  ASY.fitpanel = { tab, run, guess, preview, results, report, addComponent, methods, latex, tsv };
})(window.ASY);
