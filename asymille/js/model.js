/* The project: sheets of data, graphs, fits, and what was done to them. No DOM.
 *
 * A project is one document (`doc`), written as it is to the server (store.js) and to a file:
 * `serialize` and `restore` are exact inverses, and asymille/web/schemas.py describes the same
 * shape (a field added here must be added there, or every save is refused).
 *
 *     sheets   columns of values. A column has a short name (A, B: what formulas use), a title and
 *              a unit (what an axis writes), a role (x, y, yerr, xerr, label) and maybe a formula.
 *     graphs   a figure (plot.js): panels, axes, series. A series names a sheet and its columns,
 *              or a fit and one of its curves: it holds no data of its own.
 *     fits     the data fitted (a sheet, its x and y columns, a range), the model, the options,
 *              and what the server answered.
 *     log      one line per thing done: what goes in a lab notebook, and in the methods of a paper.
 *
 * `commit()` is called after every change a person made: it is what makes it undoable and what
 * tells the store there is something to save. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const P = ASY.plot;
  let doc = null, version = 0, last = '';
  const undoStack = [], redoStack = [];
  const errors = {};                       // column id → why its formula could not be computed (not part of the document)
  const heard = [];

  const id = (prefix) => prefix + (++doc.seq);
  const unique = (list, base) => { const names = new Set(list.map((x) => x.name)); if (!names.has(base)) return base; for (let i = 2; ; i++) if (!names.has(base + ' ' + i)) return base + ' ' + i; };
  const iso = () => new Date().toISOString();

  function blank(name) {
    doc = { version: 1, name: name || 'Untitled project', seq: 0, sheets: [], graphs: [], fits: [], log: [], view: { main: 'sheet', sheet: null, graph: null, fit: null } };
    const sheet = addSheet('Sheet 1');
    addColumn(sheet, { role: 'x' }); addColumn(sheet, { role: 'y' });
    doc.view.sheet = sheet.id;
    reset();
    return doc;
  }
  function reset() { undoStack.length = redoStack.length = 0; last = JSON.stringify(doc); version++; for (const k in errors) delete errors[k]; doc.sheets.forEach(recompute); }
  function restore(saved) {
    if (!saved || saved.version !== 1 || !Array.isArray(saved.sheets)) throw new Error('this is not an Asymille project');
    doc = JSON.parse(JSON.stringify(saved));
    doc.view = Object.assign({ main: 'sheet', sheet: null, graph: null, fit: null }, doc.view || {});
    doc.graphs = doc.graphs || []; doc.fits = doc.fits || []; doc.log = doc.log || [];
    if (!sheet(doc.view.sheet)) doc.view.sheet = doc.sheets.length ? doc.sheets[0].id : null;
    if (!graph(doc.view.graph)) doc.view.graph = doc.graphs.length ? doc.graphs[0].id : null;
    if (!fit(doc.view.fit)) doc.view.fit = doc.fits.length ? doc.fits[0].id : null;
    if (doc.view.main === 'graph' && !doc.view.graph) doc.view.main = 'sheet';
    reset();
    return doc;
  }
  const serialize = () => doc;

  /* Something was changed by the person: remember what was there, and tell whoever listens. */
  function commit() {
    const now = JSON.stringify(doc);
    if (now === last) return false;
    undoStack.push(last); redoStack.length = 0;
    let size = undoStack.reduce((a, s) => a + s.length, 0);
    while (undoStack.length > 60 || (size > 4e7 && undoStack.length > 1)) size -= undoStack.shift().length;
    last = now; version++;
    heard.forEach((fn) => fn());
    return true;
  }
  function step(from, to) {
    if (!from.length) return false;
    to.push(last); last = from.pop(); doc = JSON.parse(last); version++;
    doc.sheets.forEach(recompute);
    heard.forEach((fn) => fn());
    return true;
  }
  const undo = () => { commit(); return step(undoStack, redoStack); }, redo = () => step(redoStack, undoStack);       // what was not committed yet is a change like another: undo takes it back first
  function log(text) { doc.log.push({ at: iso(), text: String(text).slice(0, 2000) }); if (doc.log.length > 500) doc.log.splice(0, doc.log.length - 500); }

  // ------------------------------------------------------------------ sheets and columns
  const sheet = (sid) => doc.sheets.find((s) => s.id === sid) || null;
  const column = (s, cid) => (s ? s.columns.find((c) => c.id === cid) || null : null);
  const rows = (s) => s.columns.reduce((n, c) => Math.max(n, c.values.length), 0);
  function addSheet(name, source) { const s = { id: id('s'), name: unique(doc.sheets, name || 'Sheet ' + (doc.sheets.length + 1)).slice(0, 80), columns: [], source: source || '' }; doc.sheets.push(s); return s; }
  function freeName(s) { const used = new Set(s.columns.map((c) => c.name)); for (let i = 0; ; i++) if (!used.has(ASY.letters(i))) return ASY.letters(i); }
  function addColumn(s, props, at) {
    props = props || {};
    const c = { id: id('c'), name: freeName(s), title: String(props.title || '').slice(0, 120), unit: String(props.unit || '').slice(0, 40), role: props.role || 'y',
      formula: props.formula || '', comment: String(props.comment || '').slice(0, 2000), values: props.values ? props.values.slice() : [] };
    if (at == null || at >= s.columns.length) s.columns.push(c); else s.columns.splice(at, 0, c);
    return c;
  }
  function removeColumn(s, cid) {
    s.columns = s.columns.filter((c) => c.id !== cid);
    doc.graphs.forEach((g) => g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'data' && r.sheet === s.id && (r.x === cid || r.y === cid))); p.series.forEach((r) => { if (r.yerr === cid) r.yerr = null; if (r.xerr === cid) r.xerr = null; }); }));
    doc.fits.forEach((f) => { if (f.sheet === s.id) { if (f.yerr === cid) f.yerr = null; f.more = f.more.filter((m) => m !== cid); if (f.x === cid || f.y === cid) { f.x = f.x === cid ? null : f.x; f.y = f.y === cid ? null : f.y; f.stale = true; } } });
  }
  function removeSheet(sid) {
    doc.sheets = doc.sheets.filter((s) => s.id !== sid);
    doc.graphs.forEach((g) => g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'data' && r.sheet === sid)); }));
    doc.fits.filter((f) => f.sheet === sid).forEach((f) => removeFit(f.id));
    if (doc.view.sheet === sid) doc.view.sheet = doc.sheets.length ? doc.sheets[0].id : null;
  }
  /* A cell as it is kept: a number when it reads as one, text otherwise, null when empty. */
  const cell = (raw) => { if (raw == null) return null; if (typeof raw === 'number') return isFinite(raw) ? raw : null; const t = String(raw).trim(); if (!t) return null; const v = ASY.parseNum(t); return isNaN(v) ? t.slice(0, 200) : v; };
  function setCell(s, c, row, raw) { while (c.values.length < row) c.values.push(null); c.values[row] = cell(raw); trim(c); }
  const trim = (c) => { let n = c.values.length; while (n && c.values[n - 1] == null) n--; c.values.length = n; };
  /* The numbers of a column: NaN where a cell is empty or text. */
  const numbers = (c, n) => { const out = new Array(n != null ? n : c.values.length); for (let i = 0; i < out.length; i++) { const v = c.values[i]; out[i] = typeof v === 'number' ? v : NaN; } return out; };
  const label = (c) => (c ? (c.title || c.name) + (c.unit ? ' (' + c.unit + ')' : '') : '');
  /* The x column a y column is plotted against: the nearest x on its left, else the first x of the sheet. */
  function xOf(s, c) {
    const i = s.columns.indexOf(c);
    for (let k = i - 1; k >= 0; k--) if (s.columns[k].role === 'x') return s.columns[k];
    return s.columns.find((k) => k.role === 'x' && k !== c) || null;
  }
  const errOf = (s, c) => { const next = s.columns[s.columns.indexOf(c) + 1]; return next && next.role === 'yerr' ? next : null; };

  /* Compute the columns that have a formula, from left to right. A, B… are the columns, i the row (from 1), n the number of rows. */
  function recompute(s) {
    const n = rows(s);
    s.columns.forEach((c) => {
      delete errors[c.id];
      if (!c.formula) return;
      try {
        const compiled = ASY.expr.compile(c.formula), env = { i: 0, n }, sources = [];
        for (const name of compiled.names) {
          if (name === 'i' || name === 'n') continue;
          const src = s.columns.find((k) => k.name === name);
          if (!src) throw new Error('no column is called ' + name);
          if (src === c) throw new Error('a column cannot be computed from itself');
          sources.push([name, src.values]);
        }
        const count = sources.length ? Math.max(...sources.map((x) => x[1].length)) : n;
        const out = new Array(count);
        for (let r = 0; r < count; r++) {
          env.i = r + 1;
          for (const [name, values] of sources) { const v = values[r]; env[name] = typeof v === 'number' ? v : NaN; }
          const v = compiled.run(env);
          out[r] = typeof v === 'number' && isFinite(v) ? v : null;
        }
        c.values = out; trim(c);
      } catch (e) { errors[c.id] = e.message; }
    });
  }
  function changed(s) { recompute(s); doc.fits.forEach((f) => { if (f.sheet === s.id && (f.result || Object.keys(f.results).length)) f.stale = true; }); }
  function sortBy(s, c, descending) {
    const n = rows(s), order = Array.from({ length: n }, (_, i) => i);
    const key = (i) => { const v = c.values[i]; return v == null ? null : v; };
    order.sort((a, b) => { const x = key(a), y = key(b); if (x == null || y == null) return (x == null) - (y == null) || a - b; const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return (descending ? -r : r) || a - b; });
    s.columns.forEach((k) => { if (!k.formula) { k.values = order.map((i) => (i < k.values.length ? k.values[i] : null)); trim(k); } });
    changed(s);
  }
  /* A table that was read (importer.js) or computed (an operation) becomes a sheet. */
  function sheetFrom(name, columns, source) {
    const s = addSheet(name, source);
    columns.forEach((c, i) => addColumn(s, { title: c.title || c.name || '', unit: c.unit, values: c.values, role: c.role || (i === 0 ? 'x' : 'y'), comment: c.comment }));
    return s;
  }
  function toText(s, sep) {
    sep = sep || '\t';
    const quote = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : /[\t\n",;]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    const lines = [s.columns.map((c) => quote(label(c))).join(sep)];
    for (let r = 0, n = rows(s); r < n; r++) lines.push(s.columns.map((c) => quote(c.values[r])).join(sep));
    return lines.join('\n') + '\n';
  }

  // ------------------------------------------------------------------ graphs
  const graph = (gid) => doc.graphs.find((g) => g.id === gid) || null;
  function addGraph(name) { const g = { id: id('g'), name: unique(doc.graphs, name || 'Graph ' + (doc.graphs.length + 1)).slice(0, 80), figure: P.defaults() }; doc.graphs.push(g); return g; }
  function removeGraph(gid) { doc.graphs = doc.graphs.filter((g) => g.id !== gid); if (doc.view.graph === gid) { doc.view.graph = doc.graphs.length ? doc.graphs[0].id : null; if (!doc.view.graph) doc.view.main = 'sheet'; } }
  const colorFor = (g, panel) => { const pal = P.PALETTES[g.figure.palette] || P.PALETTES.okabe; return pal[panel.series.filter((r) => r.kind === 'data').length % pal.length]; };
  function addData(g, panel, s, y, more) {
    const x = xOf(s, y), e = errOf(s, y);
    const r = P.series(Object.assign({ id: id('r'), kind: 'data', sheet: s.id, x: x ? x.id : null, y: y.id, yerr: e ? e.id : null, xerr: null, color: colorFor(g, panel) }, more || {}));
    panel.series.push(r);
    if (!panel.x.label && x) panel.x.label = label(x);
    if (!panel[r.axis].label) panel[r.axis].label = label(y);
    return r;
  }
  /* A new graph of some y columns of a sheet, each against its x. */
  function plot(s, ys, type) {
    const g = addGraph(s.name), panel = g.figure.panels[0];
    ys.forEach((y) => addData(g, panel, s, y, { type: type || (rows(s) > 60 ? 'line' : 'scatter') }));
    if (ys.length > 1 && ys.some((y) => label(y) !== label(ys[0]))) panel.y.label = ys.every((y) => y.unit === ys[0].unit) && ys[0].unit ? '(' + ys[0].unit + ')' : '';
    doc.view.graph = g.id; doc.view.main = 'graph';
    return g;
  }
  /* The curves of a fit on the graph where its data are drawn (or on the open graph). */
  function showFit(f, g, opt) {
    opt = opt || {};
    g = g || doc.graphs.find((k) => k.figure.panels.some((p) => p.series.some((r) => r.kind === 'data' && r.sheet === f.sheet && r.y === f.y))) || graph(doc.view.graph);
    if (!g) return null;
    const panel = g.figure.panels.find((p) => p.series.some((r) => r.kind === 'data' && r.sheet === f.sheet && r.y === f.y)) || g.figure.panels[0];
    const has = (part, col) => panel.series.some((r) => r.kind === 'fit' && r.fit === f.id && r.part === part && (r.column || null) === (col || null));
    const columnsOf = f.mode === 'single' ? [null] : [f.y].concat(f.more);
    // one column or several: the curves already there follow. With several, each column is drawn with its data, and its curve in a darker shade of their colour.
    const mine = (r) => r.kind === 'fit' && r.fit === f.id && r.part !== 'residuals';
    if (f.mode === 'single') { panel.series = panel.series.filter((r) => !(mine(r) && r.column && r.column !== f.y)); panel.series.forEach((r) => { if (mine(r)) r.column = null; }); }
    else {
      panel.series.forEach((r) => { if (mine(r) && !r.column) r.column = f.y; });
      panel.series = panel.series.filter((r) => !(mine(r) && !columnsOf.includes(r.column)));
      const s = sheet(f.sheet);
      columnsOf.forEach((col) => { const c = column(s, col); if (c && !panel.series.some((r) => r.kind === 'data' && r.sheet === f.sheet && r.y === col)) addData(g, panel, s, c, { type: 'scatter' }); });
    }
    const darker = (hex) => (hex ? '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.6).toString(16).padStart(2, '0')).join('') : null);
    columnsOf.forEach((col, k) => {
      const base = col ? darker((panel.series.find((r) => r.kind === 'data' && r.sheet === f.sheet && r.y === col) || {}).color) : null;
      if (col) panel.series.forEach((r) => { if (mine(r) && r.column === col && r.part === 'total' && base) r.color = base; });
      if (!has('total', col)) panel.series.push(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: 'total', column: col, type: 'line', color: base || '#c81d25', marker: 'none', label: '' }));
      if (opt.band && !has('band', col)) panel.series.unshift(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: 'band', column: col, type: 'band', color: base || '#c81d25', legend: false }));
      if (opt.components && (f.model.components || []).length > 1) f.model.components.forEach((c, i) => { if (!has(c.id, col)) panel.series.push(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: c.id, column: col, type: 'line', dash: 'dash', width: 0.8, color: P.PALETTES.okabe[(i + 2) % 8], marker: 'none', legend: k === 0 })); });
    });
    return g;
  }
  /* A panel under the data that shows what the fit leaves: the residuals. */
  function showResiduals(f, g) {
    const fig = g.figure, top = fig.panels.findIndex((p) => p.series.some((r) => r.kind === 'data' && r.sheet === f.sheet && r.y === f.y));
    if (top < 0 || fig.panels.some((p) => p.series.some((r) => r.kind === 'fit' && r.fit === f.id && r.part === 'residuals'))) return;
    const p = P.panel(id('p'));
    p.x.label = fig.panels[top].x.label; p.y.label = 'Residual'; p.legend.show = false; p.x.scale = fig.panels[top].x.scale; p.x.min = fig.panels[top].x.min; p.x.max = fig.panels[top].x.max;
    p.series.push(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: 'residuals', column: null, type: 'scatter', color: '#000000', size: 2.2, legend: false }));
    p.notes.push({ id: id('n'), type: 'hline', y: 0, color: '#888888', width: 0.6, dash: 'dash' });
    fig.panels.splice(top + 1, 0, p);
    if (fig.panels.length === 2) { fig.layout.cols = 1; fig.layout.ratios = [3, 1]; fig.layout.shareX = true; fig.height = Math.round(fig.height * 1.25); }
  }
  const resultOf = (f, col) => (col && f.results[col] ? f.results[col] : f.mode === 'single' || !col ? f.result : null);
  /* What a series draws: the columns it names, or the curve of the fit it names. */
  function seriesData(r) {
    if (r.kind === 'fit') {
      const f = fit(r.fit); if (!f) return null;
      const s = sheet(f.sheet), ycol = column(s, r.column || f.y), res = resultOf(f, r.column) || (r.column ? null : f.results[f.y]);
      const preview = f.id === previewOf.fit ? previewOf.curve : null;
      if (r.part === 'total' && preview && !res) return { x: preview.x, y: preview.y, label: 'Model, not fitted' };
      if (!res) return null;
      const name = f.mode === 'single' ? '' : ' of ' + (ycol ? ycol.title || ycol.name : '');
      if (r.part === 'total') return { x: res.curve.x, y: res.curve.y, label: 'Fit' + name };
      if (r.part === 'band') return res.curve.band ? { x: res.curve.x, y: res.curve.y, lower: res.curve.band.lower, upper: res.curve.band.upper } : null;
      if (r.part === 'prediction') return res.curve.prediction ? { x: res.curve.x, y: res.curve.y, lower: res.curve.prediction.lower, upper: res.curve.prediction.upper } : null;
      if (r.part === 'residuals') return { x: res.residuals.x, y: res.residuals.y, label: 'Residual' + name };
      const part = res.curve.components[r.part];
      const comp = (f.model.components || []).find((c) => c.id === r.part);
      return part ? { x: res.curve.x, y: part, label: r.part + (comp ? ' · ' + ASY.fnLabel(comp) : '') } : null;
    }
    const s = sheet(r.sheet), y = column(s, r.y); if (!y) return null;
    const x = column(s, r.x), n = Math.max(y.values.length, x ? x.values.length : 0);
    const ye = column(s, r.yerr), xe = column(s, r.xerr);
    return { x: x ? numbers(x, n) : Array.from({ length: n }, (_, i) => i + 1), y: numbers(y, n), yerr: ye ? numbers(ye, n) : null, xerr: xe ? numbers(xe, n) : null, label: y.title || y.name };
  }
  const previewOf = { fit: null, curve: null };                // the model drawn at its starting values, before any fit: on screen only

  // ------------------------------------------------------------------ fits
  const fit = (fid) => doc.fits.find((f) => f.id === fid) || null;
  function addFit(s, x, y) {
    const e = errOf(s, y);
    const f = { id: id('f'), name: unique(doc.fits, 'Fit of ' + (y.title || y.name)).slice(0, 80), sheet: s.id, x: x ? x.id : null, y: y.id, yerr: e ? e.id : null, more: [], mode: 'single', shared: [], limits: null,
      model: { components: [] }, options: { method: 'leastsq', weights: e ? 'instrumental' : 'none', absolute_sigma: false, loss: 'linear', level: 0.95, points: 800, intervals: false }, result: null, results: {}, stale: false };
    doc.fits.push(f); doc.view.fit = f.id;
    return f;
  }
  function removeFit(fid) {
    doc.fits = doc.fits.filter((f) => f.id !== fid);
    doc.graphs.forEach((g) => { g.figure.panels = g.figure.panels.filter((p) => !(p.series.length && p.series.every((r) => r.kind === 'fit' && r.fit === fid && r.part === 'residuals')) || g.figure.panels.length === 1); g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'fit' && r.fit === fid)); }); if (g.figure.panels.length === 1) { g.figure.layout.ratios = []; g.figure.layout.shareX = false; } });
    if (doc.view.fit === fid) doc.view.fit = doc.fits.length ? doc.fits[doc.fits.length - 1].id : null;
  }
  const nullable = (a) => a.map((v) => (isFinite(v) ? v : null));
  /* What is sent to be fitted: the x, y and error columns of a fit, row for row. */
  function fitData(f, ycol) {
    const s = sheet(f.sheet), x = column(s, f.x), y = column(s, ycol || f.y), e = column(s, f.yerr);
    if (!s || !y) throw new Error('the data of this fit are gone: choose its columns again');
    const n = Math.max(y.values.length, x ? x.values.length : 0);
    return { x: x ? nullable(numbers(x, n)) : Array.from({ length: n }, (_, i) => i + 1), y: nullable(numbers(y, n)), sigma: e ? nullable(numbers(e, n)) : null };
  }
  const componentId = (f, fn) => { const letter = (fn || 'c')[0].replace(/[^a-z]/, 'c'), used = new Set(f.model.components.map((c) => c.id)); for (let i = 1; ; i++) if (!used.has(letter + i)) return letter + i; };

  ASY.model = {
    get doc() { return doc; }, get version() { return version; }, get canUndo() { return undoStack.length > 0; }, get canRedo() { return redoStack.length > 0; },
    errors, previewOf, on: (fn) => heard.push(fn), id: (p) => id(p), blank, restore, serialize, commit, undo, redo, log,
    sheet, column, rows, addSheet, freeName, addColumn, removeColumn, removeSheet, setCell, cell, numbers, label, xOf, errOf, recompute, changed, sortBy, sheetFrom, toText, unique,
    graph, addGraph, removeGraph, addData, plot, showFit, showResiduals, seriesData, resultOf,
    fit, addFit, removeFit, fitData, componentId,
  };
})(window.ASY);
