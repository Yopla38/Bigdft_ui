/* The page: what is on screen, and what a click does. It draws; model.js holds the project,
 * plot.js lays out the figures, the server computes (fits, operations, PDF) and keeps the projects.
 *
 * Started three ways, as Ondelette's pages are:
 *   plugged into a server with accounts   the page is covered until someone signs in, then their projects;
 *   served by serve.py                    one local user, no sign-in;
 *   opened as plain files                 no server: sheets, graphs, SVG and PNG work, and say what does not. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, $ = ASY.$, M = ASY.model, P = ASY.plot, I = ASY.inspect, ui = ASY.ui, api = window.OND.api, T = ASY.store;
  const state = { tab: { graph: 'fit', sheet: 'column' }, tool: 'pointer', panel: null, series: null, note: null, dock: 'results', busy: null, facts: null, resultOf: null, live: false, stop: false, shownSeries: null };
  let grid = null, view = null, shown = null, toastTimer = null;
  const app = ASY.app = { state, catalogue: null, style: null };

  // ------------------------------------------------------------------ small things
  app.say = (text, bad) => {
    clearTimeout(toastTimer); const old = $('.toast'); if (old) old.remove();
    const el = h('div', { class: 'toast' + (bad ? ' err' : ''), role: bad ? 'alert' : 'status' }, text);
    document.body.append(el); toastTimer = setTimeout(() => el.remove(), bad ? 7000 : 3200);
  };
  app.picked = () => (grid && M.doc.view.main === 'sheet' ? grid.selection() : { columns: [], rows: [0, 0] });
  app.hit = () => (view && view.list() ? view.list().hit.panels : null);
  app.resetGrid = () => { if (grid) grid.reset(); state.series = state.panel = state.note = null; state.facts = null; };

  /* Something of the project changed. `touch` leaves the inspector as it is (a field was edited in it); `refresh` draws everything. */
  app.touch = () => { M.commit(); drawTop(); drawTree(); drawMain(); drawDock(); T.changed(); };
  app.refresh = () => { M.commit(); drawTop(); drawTree(); drawMain(); drawInspector(); drawDock(); T.changed(); };
  app.redrawMain = () => { if (view && M.doc.view.main === 'graph') view.draw(); };
  app.redrawDock = () => drawDock();
  app.redrawTree = () => drawTree();
  app.redrawAll = () => { drawTop(); drawTree(); drawMain(); drawInspector(); drawDock(); };          // what is on screen, without saying the project changed
  app.changedSheet = (s) => { M.changed(s); app.refresh(); };

  // ------------------------------------------------------------------ what the buttons do
  app.plot = (s, ys, type) => {
    const g = M.plot(s, ys, type);
    M.log('Graph “' + g.name + '”: ' + ys.map((y) => M.label(y)).join(', ') + ' against ' + (M.label(M.xOf(s, ys[0])) || 'the row number') + '.');
    state.tab.graph = 'series'; state.series = null; state.panel = null; app.refresh();
  };
  app.fitColumn = (s, y) => {
    let g = M.doc.graphs.find((k) => k.figure.panels.some((p) => p.series.some((r) => r.kind === 'data' && r.sheet === s.id && r.y === y.id)));
    if (!g) g = M.plot(s, [y], M.rows(s) > 400 ? 'line' : 'scatter');
    const f = M.addFit(s, M.xOf(s, y), y);
    M.showFit(f, g);
    M.doc.view.graph = g.id; M.doc.view.main = 'graph'; state.tab.graph = 'fit'; state.facts = null; app.refresh();
  };
  const SAME_UNIT = ['Smoothed', 'Filtered', 'Baseline', 'Baseline removed', 'Regression', 'Residual', 'Difference', 'Sum', 'Interpolated'];
  app.analyse = async (chosen, op) => {
    const s = M.sheet(chosen.sheet), y = M.column(s, chosen.y), x = M.column(s, chosen.x), y2 = M.column(s, chosen.y2);
    if (!y) return app.say('Choose the column to work on', true);
    if (op.second && !y2) return app.say(op.label + ' needs a second curve: choose its column', true);
    const n = Math.max(y.values.length, x ? x.values.length : 0), nul = (a) => a.map((v) => (isFinite(v) ? v : null));
    const xs = x ? nul(M.numbers(x, n)) : Array.from({ length: n }, (_, i) => i + 1);
    const body = { operation: op.name, args: chosen.args, x: xs, y: nul(M.numbers(y, n)) };
    if (op.second) { const x2 = M.xOf(s, y2) || x; body.x2 = x2 ? nul(M.numbers(x2, n)) : xs; body.y2 = nul(M.numbers(y2, n)); }
    state.busy = 'analyse'; drawInspector();
    try {
      const out = await api.post('asymille/analyse', body), of = y.title || y.name, g = M.doc.view.main === 'graph' ? M.graph(M.doc.view.graph) : null;
      let target = s, made = [];
      if (out.sheet === 'new' && out.columns.length) {
        target = M.sheetFrom((out.title || op.label) + ' of ' + of, out.columns.map((c) => ({ title: c.role === 'x' && c.name === 'x' ? (x ? x.title || x.name : 'x') : c.name, unit: c.role === 'x' && c.name === 'x' && x ? x.unit : SAME_UNIT.includes(c.name) ? y.unit : '', values: c.values, role: c.role, comment: out.note })), op.label + ' of “' + M.label(y) + '” (sheet “' + s.name + '”). ' + out.note);
        made = target.columns;
      } else out.columns.forEach((c, i) => { made.push(M.addColumn(s, { title: c.name + ' of ' + of, unit: SAME_UNIT.includes(c.name) ? y.unit : '', values: c.values, role: 'y', comment: out.note,
        made: { op: op.name, args: chosen.args, x: x ? x.id : null, y: y.id, y2: y2 ? y2.id : null, part: i } }, s.columns.indexOf(y) + 1 + i)); });          // kept so that a series can do it again on each of its files
      M.log(op.label + ' of “' + M.label(y) + '” (sheet “' + s.name + '”). ' + out.note + (made.length ? ' Written to ' + (target === s ? 'the column' + (made.length > 1 ? 's ' : ' ') + made.map((c) => c.name).join(', ') : 'the sheet “' + target.name + '”') + '.' : ''));
      if (chosen.plot && g && made.length) {
        const panel = g.figure.panels.find((p) => p.series.some((r) => r.kind === 'data' && r.sheet === s.id && r.y === y.id)) || g.figure.panels[0];
        if (target === s) made.slice(0, 1).forEach((c) => M.addData(g, panel, s, c, { type: 'line', x: x ? x.id : null }));          // the first column is the result; the others are beside it in the sheet
        else if (op.name === 'find_peaks') M.addData(g, panel, target, target.columns[1], { type: 'scatter', marker: 'down', size: 4.5, color: '#c81d25', label: 'Peaks' });
      }
      if (out.facts.length || !made.length) { state.facts = { title: op.label + ' of ' + M.label(y), note: out.note, facts: out.facts }; state.dock = 'results'; }
      state.busy = null;
      if (target !== s && !(chosen.plot && g && op.name === 'find_peaks')) { M.doc.view.sheet = target.id; M.doc.view.main = 'sheet'; app.resetGrid(); if (out.facts.length) state.facts = { title: op.label + ' of ' + M.label(y), note: out.note, facts: out.facts }; }
      M.recompute(s); app.refresh(); app.say(op.label + ': done');
    } catch (e) { state.busy = null; drawInspector(); app.say(e.message, true); }
  };
  /* A spectrum that was measured, and two peaks made up to be fitted: something to try the page on. */
  async function example() {
    let text = null;
    try { const r = await fetch('examples/NW1051-NW1.txt', { cache: 'no-store' }); if (r.ok) text = await r.text(); } catch (e) { /* the made-up part is enough */ }
    const build = () => {
      M.blank('Example');
      const first = M.doc.sheets[0];
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
      const xs = Array.from({ length: 240 }, (_, i) => Number((i * 0.1).toFixed(2)));
      const ys = xs.map((x) => Number((4 * Math.exp(-((x - 8) ** 2) / (2 * 0.9 ** 2)) + 2.5 / (1 + ((x - 14.5) / 0.7) ** 2) + 0.4 + 0.02 * x + 0.08 * gauss()).toFixed(4)));
      const peaks = M.sheetFrom('Two peaks (made up)', [{ title: 'Energy', unit: 'eV', values: xs }, { title: 'Intensity', unit: 'a.u.', values: ys }, { title: 'σ', unit: 'a.u.', values: xs.map(() => 0.08), role: 'yerr' }],
        'Made up for the example: a Gaussian at 8 eV and a Lorentzian at 14.5 eV on a line, with Gaussian noise of 0.08.');
      M.removeSheet(first.id);
      if (text) { const read = ASY.importer.read(text, 'NW1051-NW1.txt'); const s = M.sheetFrom('NW1051-NW1', read.columns, 'Imported from examples/NW1051-NW1.txt: a spectrum measured with a Tektronix RSA analyser.'); const g = M.plot(s, [s.columns[1]], 'line'); g.figure.panels[0].y.scale = 'log'; g.name = 'Spectrum'; }
      const g2 = M.plot(peaks, [peaks.columns[1]], 'scatter'); g2.name = 'Two peaks';
      const f = M.addFit(peaks, peaks.columns[0], peaks.columns[1]);
      if (app.catalogue) { ASY.fitpanel.addComponent(f, 'gaussian'); ASY.fitpanel.addComponent(f, 'lorentzian'); ASY.fitpanel.addComponent(f, 'linear'); }
      M.showFit(f, g2);
      M.log('Example loaded: a measured spectrum, and two made-up peaks to fit.');
      M.doc.view.graph = g2.id; M.doc.view.sheet = peaks.id; M.doc.view.main = 'graph';
    };
    if (T.state.on) await T.fresh(build); else build();
    state.tab.graph = 'fit'; app.resetGrid(); app.refresh();
  }

  // ------------------------------------------------------------------ the header
  function drawTop() {
    const s = T.state, name = $('#project-name');
    if (document.activeElement !== name) name.value = M.doc.name;
    $('#undo').disabled = !M.canUndo; $('#redo').disabled = !M.canRedo;
    $('#export-open').disabled = !(M.doc.view.main === 'graph' && M.graph(M.doc.view.graph));
    document.title = M.doc.name + ' · Asymille';
    const pill = $('#save-state');
    pill.hidden = $('#projects-open').hidden = false;
    if (!s.on) { pill.hidden = true; return; }
    const SAVE = { saved: ['Saved', 'This project is kept on the server, under your account.'], dirty: ['Not saved yet', 'Changed: it is saved a moment after the last change.'], saving: ['Saving…', ''], error: ['Not saved · retry', ''], conflict: ['Changed elsewhere', 'Changed in another tab since it was opened here. Click to choose which one is kept.'] };
    const [label, title] = s.opening ? ['Opening…', ''] : SAVE[s.save];
    pill.className = 'pill save-state ' + (s.opening ? 'saving' : s.save);
    ASY.fill(pill, h('i', { 'aria-hidden': 'true' }), label);
    pill.title = s.save === 'error' ? 'The last save failed: ' + s.saveError + '. Click to try again.' : title;
    pill.disabled = !(s.save === 'error' || s.save === 'conflict');
  }

  // ------------------------------------------------------------------ the project, on the left
  function drawTree() {
    const doc = M.doc, v = doc.view;
    const item = (glyph, name, sub, on, open, remove, dot) => h('div', { class: 'item', role: 'button', tabindex: 0, 'aria-pressed': String(on), onclick: open, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } },
      h('span', { class: 'glyph' }, glyph), h('span', { style: 'min-width:0' }, h('b', {}, name), h('span', { class: 'sub' }, sub)),
      h('span', { style: 'display:flex;gap:6px;align-items:center' }, dot || null, h('button', { class: 'x', type: 'button', title: 'Delete (Undo brings it back)', 'aria-label': 'Delete ' + name, onclick: (e) => { e.stopPropagation(); remove(); } }, '×')));
    const section = (title, add, addTitle, items, none) => h('section', {}, h('h4', {}, title, add ? h('button', { type: 'button', title: addTitle, 'aria-label': addTitle, onclick: add }, '+') : null), items.length ? items : h('p', { class: 'empty' }, none));
    ASY.fill($('#tree'), 
      section('Sheets', () => { const s = M.addSheet(); M.addColumn(s, { role: 'x' }); M.addColumn(s, { role: 'y' }); v.sheet = s.id; v.main = 'sheet'; app.resetGrid(); app.refresh(); }, 'A new, empty sheet',
        doc.sheets.map((s) => item('S', s.name, M.rows(s) + ' × ' + s.columns.length, v.main === 'sheet' && v.sheet === s.id, () => { v.sheet = s.id; v.main = 'sheet'; app.resetGrid(); app.refresh(); },
          () => { if (doc.sheets.length === 1) return app.say('A project keeps at least one sheet', true); M.removeSheet(s.id); app.resetGrid(); app.refresh(); })), 'No sheet.'),
      section('Graphs', () => { const g = M.addGraph(); v.graph = g.id; v.main = 'graph'; state.tab.graph = 'series'; app.resetGrid(); app.refresh(); }, 'A new, empty graph',
        doc.graphs.map((g) => { const n = g.figure.panels.reduce((a, p) => a + p.series.length, 0); return item('G', g.name, n + ' curve' + (n === 1 ? '' : 's') + ' · ' + g.figure.width + ' × ' + g.figure.height + ' mm', v.main === 'graph' && v.graph === g.id, () => { v.graph = g.id; v.main = 'graph'; state.series = state.panel = null; app.refresh(); }, () => { M.removeGraph(g.id); app.refresh(); }); }),
        'Select columns of a sheet and plot them.'),
      section('Fits', null, '', doc.fits.map((f) => { const r = f.result || f.results[f.y], busy = state.busy === 'fit:' + f.id;
        return item('F', f.name, r ? 'χ²ᵣ ' + ASY.fmt(r.redchi, 4) + ' · R² ' + ASY.fmt(r.rsquared, 5) : f.model.components.length + ' component' + (f.model.components.length === 1 ? '' : 's') + ', not fitted', v.fit === f.id && state.tab[v.main] === 'fit',
          () => { v.fit = f.id; state.facts = null; const g = M.doc.graphs.find((k) => k.figure.panels.some((p) => p.series.some((x) => (x.kind === 'fit' && x.fit === f.id) || (x.kind === 'data' && x.sheet === f.sheet && x.y === f.y)))); if (g) { v.graph = g.id; v.main = 'graph'; state.tab.graph = 'fit'; } app.refresh(); },
          () => { M.removeFit(f.id); app.refresh(); }, h('span', { class: 'pdot ' + (busy ? 'running' : !r ? '' : f.stale ? 'stale' : r.success ? 'done' : 'failed'), title: busy ? 'being fitted' : !r ? 'not fitted' : f.stale ? 'out of date' : r.success ? 'converged' : 'did not converge' })); }),
        'Select a column and choose “Fit this column”.'),
      doc.series.length ? section('Series', null, '', doc.series.map((sr) => { const done = sr.members.filter((m) => m.state === 'done').length, bad = sr.members.filter((m) => m.state === 'failed').length, busy = state.busy === 'series:' + sr.id;
        return item('≡', sr.name, sr.members.length + ' files' + (sr.variable.name ? ' · ' + sr.variable.name : '') + (done + bad ? ' · ' + done + ' fitted' : ''), state.dock === 'series' && state.shownSeries === sr.id,
          () => ASY.seriespanel.open(sr), () => { doc.series = doc.series.filter((k) => k !== sr); app.refresh(); },
          h('span', { class: 'pdot ' + (busy ? 'running' : bad ? 'failed' : done ? 'done' : ''), title: busy ? 'being fitted' : bad ? bad + ' to check' : done ? 'fitted' : 'not fitted yet' })); }), '') : null);
  }

  // ------------------------------------------------------------------ the middle: a sheet or a graph
  function drawMain() {
    const doc = M.doc, v = doc.view, main = $('#main'), bar = $('#mainbar');
    const s = M.sheet(v.sheet), g = M.graph(v.graph);
    const what = v.main === 'graph' && g ? 'graph:' + g.id : s ? 'sheet:' + s.id : 'none';
    const rename = (obj, max) => h('input', { class: 'name', type: 'text', value: obj.name, maxlength: max, 'aria-label': 'Name', onchange: (e) => { obj.name = e.target.value.trim().slice(0, max) || obj.name; app.touch(); } });
    if (what.startsWith('graph')) {
      if (shown !== 'graph') { ASY.fill(main); view = ASY.figview(main, { graph: () => M.graph(M.doc.view.graph), tool: () => state.tool, fit: () => (state.tab.graph === 'fit' ? M.fit(M.doc.view.fit) : null), note: () => (state.tab.graph === 'notes' ? state.note : null), changed: () => app.refresh(),
        readout: (t) => { const el = $('#readout'); if (el) el.textContent = t; },
        ranged: (a, b) => { const f = M.fit(M.doc.view.fit); if (!f) return; const r = (x) => Number(x.toPrecision(5)); f.limits = [r(a), r(b)]; if (f.result || Object.keys(f.results).length) f.stale = true; state.tool = 'pointer'; app.refresh(); },
        picked: (key) => { const [kind, id] = key.split(':'); const fig = M.graph(M.doc.view.graph).figure, before = state.tab.graph + ':' + state.note;
          if (kind === 'series') { state.tab.graph = 'series'; state.series = id; const p = fig.panels.find((q) => q.series.some((r) => r.id === id)); if (p) state.panel = p.id; }
          else if (kind === 'note') { state.tab.graph = 'notes'; state.note = id; const p = fig.panels.find((q) => q.notes.some((n) => n.id === id)); if (p) state.panel = p.id; }
          else if (['xlabel', 'ylabel', 'y2label', 'xaxis', 'yaxis', 'y2axis', 'title', 'frame', 'legend'].includes(kind)) { state.tab.graph = 'axes'; state.panel = id; }
          else if (kind === 'panel') { state.panel = id; }
          else return;
          drawInspector();
          if (kind === 'note') {
            // the figure is drawn again only when another note is chosen (to show its ends): drawing it under a double-click would lose the double-click
            if (before !== 'notes:' + id) view.draw();
            const card = $('#insp-body .act.on'); if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
          } } }); shown = 'graph'; grid = null; }
      const tools = [['pointer', 'Select', 'Click a curve, an axis or the legend to change it. Drag the legend, the title of an axis, a text, a line or an arrow (by its middle or by one end). Double-click a text to rewrite it'], ['zoom', 'Zoom', 'Drag a rectangle; the wheel zooms; double-click shows everything again'], ['pan', 'Move', 'Drag the curves; double-click shows everything again'], ['range', 'Fit range', 'Drag across the part of the curve to fit']];
      ASY.fill(bar, rename(g, 80),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'What the pointer does' }, tools.map(([id, label, title]) => h('button', { type: 'button', title, 'aria-pressed': String(state.tool === id), disabled: id === 'range' && !M.fit(v.fit), onclick: () => { state.tool = id; drawMain(); if (id === 'range') { state.tab.graph = 'fit'; drawInspector(); } } }, label))),
        ui.btn('Show all', () => { g.figure.panels.forEach((p) => { p.x.min = p.x.max = p.y.min = p.y.max = null; if (p.y2) p.y2.min = p.y2.max = null; }); app.refresh(); }, '', { title: 'Automatic range on every axis' }),
        h('span', { class: 'sp' }),
        h('div', { class: 'tools' }, ui.btn('−', () => view.zoom(Math.max(0.3, (view.zoomed() === 'fit' ? 1 : view.zoomed()) / 1.25)), '', { 'aria-label': 'Smaller' }), ui.btn('Fit', () => view.zoom('fit'), '', { title: 'The whole figure in sight', 'aria-pressed': String(view.zoomed() === 'fit') }),
          ui.btn('1:1', () => view.zoom(1), '', { title: 'At its printed size, if the screen is set to 96 dpi' }), ui.btn('+', () => view.zoom(Math.min(6, (view.zoomed() === 'fit' ? 1 : view.zoomed()) * 1.25)), '', { 'aria-label': 'Larger' })));
      view.draw();
    } else if (what.startsWith('sheet')) {
      if (shown !== 'sheet') { const el = h('div', {}); ASY.fill(main, el); grid = ASY.grid(el, { sheet: () => M.sheet(M.doc.view.sheet), say: app.say,
        changed: (kind) => { const sh = M.sheet(M.doc.view.sheet); M.changed(sh); if (kind === 'structure') app.refresh(); else { app.touch(); if (sh.columns.some((c) => c.formula)) grid.draw(); } },
        picked: () => { if (state.tab.sheet !== 'column' && state.tab.sheet !== 'analyse') return; drawInspector(); } }); shown = 'sheet'; view = null; }
      ASY.fill(bar, rename(s, 80), h('span', { class: 'muted' }, M.rows(s) + ' rows × ' + s.columns.length + ' columns' + (s.source ? ' · ' + s.source.slice(0, 90) : '')), h('span', { class: 'sp' }),
        h('div', { class: 'tools' }, ui.btn('Paste', async () => { const text = await ASY.pastedText(); grid.focus(); if (text) grid.paste(text); else if (text === null) app.say('Press Ctrl+V now: ' + (ASY.plainHttp() ? 'at a plain http address the browser gives the clipboard to the keyboard, not to a button' : 'the browser did not let the button read the clipboard'), true); else app.say('The clipboard holds no text'); }, '', { title: 'Paste what was copied from a spreadsheet, from the selected cell on (Ctrl+V)' }),
          ui.btn('Save as CSV', async () => { const to = await ASY.saveAs(s.name.replace(/[^\w.-]+/g, '_') + '.csv', 'text/csv'); if (!to) return; try { await to.write(M.toText(s, ',')); app.say(to.chosen ? 'Saved as ' + to.name : to.name + ' is in the folder of downloads of the browser'); } catch (e) { app.say(e.message, true); } }),
          ui.btn('Copy selection', async () => { const text = grid.copied(), n = text.split('\n').length, w = grid.selection().columns.length, done = await ASY.copyText(text); grid.focus();
            app.say(done ? n + ' row' + (n > 1 ? 's' : '') + ' of ' + w + ' column' + (w > 1 ? 's' : '') + ' copied, tab-separated' : 'Press Ctrl+C: the browser did not let the button copy', !done); }, '', { title: 'The selected cells, to paste in a spreadsheet (Ctrl+C does the same)' }),
          ui.btn('Copy all', async () => { const done = await ASY.copyText(M.toText(s)); grid.focus(); app.say(done ? 'The sheet is in the clipboard, tab-separated' : 'The browser did not allow copying', !done); })));
      grid.draw();
    } else { shown = null; grid = view = null; ASY.fill(bar); ASY.fill(main, h('div', { class: 'stage' }, h('div', { class: 'blank' }, h('h2', {}, 'Nothing here yet'), h('p', {}, 'Import a file, or load the example.')))); }
  }

  // ------------------------------------------------------------------ the right: what is selected
  const TABS = { graph: [['fit', 'Fit'], ['analyse', 'Analyse'], ['series', 'Curves'], ['axes', 'Axes'], ['page', 'Page'], ['notes', 'Notes']], sheet: [['column', 'Column'], ['analyse', 'Analyse'], ['fit', 'Fit']] };
  function drawInspector() {
    const v = M.doc.view, kind = v.main === 'graph' && M.graph(v.graph) ? 'graph' : 'sheet', g = M.graph(v.graph), s = M.sheet(v.sheet);
    const tab = TABS[kind].some((t) => t[0] === state.tab[kind]) ? state.tab[kind] : TABS[kind][0][0];
    $('#insp-title').textContent = kind === 'graph' ? g.name : s ? s.name : '';
    ASY.fill($('#insp-tabs'), ...TABS[kind].map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(tab === id), onclick: () => { state.tab[kind] = id; if (id !== 'fit' && state.tool === 'range') state.tool = 'pointer'; drawTree(); drawMain(); drawInspector(); } }, label)));
    const body = $('#insp-body'), keep = body.scrollTop;
    let parts;
    if (tab === 'fit') parts = ASY.fitpanel.tab();
    else if (tab === 'analyse') parts = I.analyseTab();
    else if (kind === 'graph') parts = { series: I.seriesTab, axes: I.axesTab, page: I.pageTab, notes: I.notesTab }[tab](g);
    else parts = s ? I.columnTab(s) : [];
    ASY.fill(body, ...parts.flat(4).filter((x) => x != null && x !== false));
    body.scrollTop = keep;
  }

  // ------------------------------------------------------------------ the dock
  function drawDock() {
    document.querySelectorAll('#dock .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === state.dock)));
    const body = $('#dock-body');
    let parts;
    if (state.dock === 'results') parts = ASY.fitpanel.results();
    else if (state.dock === 'report') parts = ASY.fitpanel.report();
    else if (state.dock === 'series') parts = ASY.seriespanel.dock();
    else parts = M.doc.log.length ? [h('p', { class: 'say' }, 'One line per thing done to this project, with the values used: for a notebook, and for the methods of a paper.'),
      h('div', {}, M.doc.log.slice().reverse().map((l) => h('div', { class: 'logline' }, h('time', {}, new Date(l.at).toLocaleString()), h('span', {}, l.text)))),
      h('div', { class: 'acts' }, ui.btn('Copy', async () => { const done = await ASY.copyText(M.doc.log.map((l) => l.at + '\t' + l.text).join('\n')); app.say(done ? 'Copied' : 'The browser did not allow copying', !done); }))] : [h('p', { class: 'say' }, 'Nothing was done yet. Imports, operations, fits and exports are written here as they happen.')];
    ASY.fill(body, h('div', { class: 'panel-pad' }, parts.flat(4).filter((x) => x != null && x !== false)));
  }

  // ------------------------------------------------------------------ start
  function wire() {
    $('#project-name').addEventListener('change', (e) => { M.doc.name = e.target.value.trim().slice(0, 80) || 'Untitled project'; app.touch(); if (T.state.list) { const row = T.state.list.find((x) => x.id === T.state.id); if (row) row.name = M.doc.name; } });
    $('#undo').addEventListener('click', () => { if (M.undo()) { app.resetGrid(); app.refresh(); } });
    $('#redo').addEventListener('click', () => { if (M.redo()) { app.resetGrid(); app.refresh(); } });
    $('#import-open').addEventListener('click', () => ASY.dialogs.importData());
    $('#export-open').addEventListener('click', () => ASY.dialogs.exportFigure());
    $('#projects-open').addEventListener('click', () => ASY.dialogs.projects());
    $('#example').addEventListener('click', () => example().catch((e) => app.say(e.message, true)));
    $('#save-state').addEventListener('click', () => { if (T.state.save === 'conflict') ASY.dialogs.conflict(); else T.save(); });
    $('#dock-toggle').addEventListener('click', (e) => { const dock = $('#dock'), tall = dock.classList.toggle('tall'); e.target.textContent = tall ? 'Smaller' : 'Larger'; if (view) view.draw(); });
    document.querySelectorAll('#dock .tab').forEach((t) => t.addEventListener('click', () => { state.dock = t.dataset.tab; if (state.dock !== 'results') state.facts = null; drawDock(); }));
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey ? M.redo() : M.undo()) { app.resetGrid(); app.refresh(); } }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); if (M.redo()) { app.resetGrid(); app.refresh(); } }
      else if (e.key === 'Escape' && state.tool !== 'pointer' && !typing) { state.tool = 'pointer'; drawMain(); }
    });
    // a file dropped anywhere on the page is a file to import
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', (e) => { if (e.target.closest && e.target.closest('dialog')) return; if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); ASY.dialogs.importData([...e.dataTransfer.files]); } });
    window.addEventListener('asy-math', () => { drawInspector(); drawDock(); });
    T.on(() => drawTop());
  }
  async function start() {
    M.blank();
    wire();
    app.refresh();
    const signedIn = async () => {
      try { app.catalogue = await api.get('asymille/catalogue'); } catch (e) { app.catalogue = null; app.say('The server did not give its list of functions: ' + e.message, true); }
      await T.start();
      I.forgetFormats();                 // the formats kept are those of who is signed in now
      app.resetGrid(); app.refresh();
    };
    // plugged into Ondelette, the account menu leads to its workshops, as theirs lead here
    const mode = await window.OND.account.start({ slot: $('#account'), onUser: signedIn, links: [{ href: '../', label: 'Workshop 2 · build a study' }, { href: '../first/', label: 'The first workshop (mock-up)' }] });
    const honest = $('#honest');
    if (mode === 'static') { honest.hidden = false; honest.textContent = 'No server · sheets, graphs, SVG and PNG only'; honest.title = 'Fits, operations, PDF and keeping projects are the server’s. Opened without it, the page still reads files, draws graphs and saves a project to a file.'; }
    else if (window.OND.account.state.user && !window.OND.account.state.user.email) { honest.hidden = false; honest.textContent = 'On this machine · no accounts'; honest.title = 'Served by serve.py: one local user. Plugged into Ondelette, each person has their own projects.'; }

  }
  start();
})(window.ASY);
