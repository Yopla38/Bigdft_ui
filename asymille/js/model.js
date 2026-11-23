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
 *     fits     the data fitted (a sheet, its x and y columns, their error columns, the column that
 *              holds the response of the instrument, a range), the model, the options, and what
 *              the server answered.
 *     series   the same fit on many files. A series names a fit (made on one sheet, its model), the
 *              other sheets it is repeated on, each with the value of what was varied between them
 *              (a temperature, a field), and keeps what each gave. A graph's own `series` are its
 *              curves: an older use of the word, kept in the document.
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
    doc = { version: 1, name: name || 'Untitled project', seq: 0, sheets: [], graphs: [], fits: [], series: [], log: [], view: { main: 'sheet', sheet: null, graph: null, fit: null } };
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
    doc.graphs = doc.graphs || []; doc.fits = doc.fits || []; doc.log = doc.log || []; doc.series = doc.series || [];
    doc.sheets.forEach((s) => s.columns.forEach((c) => { if (c.made === undefined) c.made = null; }));          // a project saved before columns kept how they were made
    doc.fits.forEach((f) => { if (f.xerr === undefined) f.xerr = null; if (f.response === undefined) f.response = null; });      // a project saved before fits counted errors of x and responses
    doc.series.forEach((sr) => sr.members.forEach((m) => { if (m.state === 'running') m.state = 'todo'; }));      // a page closed in the middle of a series
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
      formula: props.formula || '', comment: String(props.comment || '').slice(0, 2000), values: props.values ? props.values.slice() : [], made: props.made || null };
    if (at == null || at >= s.columns.length) s.columns.push(c); else s.columns.splice(at, 0, c);
    return c;
  }
  function removeColumn(s, cid) {
    s.columns = s.columns.filter((c) => c.id !== cid);
    doc.graphs.forEach((g) => g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'data' && r.sheet === s.id && (r.x === cid || r.y === cid))); p.series.forEach((r) => { if (r.yerr === cid) r.yerr = null; if (r.xerr === cid) r.xerr = null; }); }));
    doc.fits.forEach((f) => { if (f.sheet === s.id) { if (f.yerr === cid) f.yerr = null; if (f.xerr === cid) f.xerr = null; if (f.response === cid) { f.response = null; f.stale = true; } f.more = f.more.filter((m) => m !== cid); if (f.x === cid || f.y === cid) { f.x = f.x === cid ? null : f.x; f.y = f.y === cid ? null : f.y; f.stale = true; } } });
  }
  function removeSheet(sid) {
    doc.sheets = doc.sheets.filter((s) => s.id !== sid);
    doc.graphs.forEach((g) => g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'data' && r.sheet === sid)); }));
    doc.fits.filter((f) => f.sheet === sid).forEach((f) => removeFit(f.id));
    doc.series.forEach((sr) => { sr.members = sr.members.filter((m) => m.sheet !== sid); if (sr.results === sid) sr.results = null; if (sr.current === sid) sr.current = sr.members.length ? sr.members[0].sheet : null; });
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
  const xerrOf = (s, c) => { const next = c ? s.columns[s.columns.indexOf(c) + 1] : null; return next && next.role === 'xerr' ? next : null; };      // the errors of an x column: the column after it, when its role says so

  /* Compute the columns that have a formula, from left to right. A, B… are the columns, i the row (from 1), n the number of rows. */
  function recompute(s) {
    const n = rows(s);
    s.columns.forEach((c) => {
      delete errors[c.id];
      if (!c.formula) return;
      try {
        const compiled = ASY.expr.column(c.formula), cols = {};
        for (const name of compiled.names) {
          if (name === 'i' || name === 'n') continue;
          const src = s.columns.find((k) => k.name === name);
          if (!src) throw new Error('no column is called ' + name);
          if (src === c) throw new Error('a column cannot be computed from itself');
          cols[name] = src.values;
        }
        const lengths = Object.values(cols).map((v) => v.length), count = lengths.length ? Math.max(...lengths) : n;
        const out = compiled.run({ n: count, cols }).map((v) => (typeof v === 'number' && isFinite(v) ? v : null));
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
  function removeGraph(gid) { doc.graphs = doc.graphs.filter((g) => g.id !== gid); doc.series.forEach((sr) => { if (sr.graph === gid) sr.graph = null; }); if (doc.view.graph === gid) { doc.view.graph = doc.graphs.length ? doc.graphs[0].id : null; if (!doc.view.graph) doc.view.main = 'sheet'; } }
  const colorFor = (g, panel) => { const pal = P.PALETTES[g.figure.palette] || P.PALETTES.okabe; return pal[panel.series.filter((r) => r.kind === 'data').length % pal.length]; };
  function addData(g, panel, s, y, more) {
    const x = xOf(s, y), e = errOf(s, y), ex = xerrOf(s, x);
    const r = P.series(Object.assign({ id: id('r'), kind: 'data', sheet: s.id, x: x ? x.id : null, y: y.id, yerr: e ? e.id : null, xerr: ex ? ex.id : null, color: colorFor(g, panel) }, more || {}));
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
      if (!has('total', col)) {
        // a second fit on the same panel is told from the first: another colour, and each curve under the name of its fit
        const others = panel.series.filter((r) => r.kind === 'fit' && r.fit !== f.id && r.part === 'total'), taken = others.length ? panel.series.map((r) => r.color) : [];
        others.forEach((r) => { if (!r.label && fit(r.fit)) r.label = P.literal(fit(r.fit).name); });
        panel.series.push(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: 'total', column: col, type: 'line', color: base || ['#c81d25', '#0072b2', '#009e73', '#cc79a7', '#e69f00'].find((c) => !taken.includes(c)) || '#c81d25', marker: 'none', label: others.length ? P.literal(f.name) : '' }));
      }
      if (opt.band && !has('band', col)) panel.series.unshift(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: 'band', column: col, type: 'band', color: base || '#c81d25', legend: false }));
      if (opt.components && (f.model.components || []).length > 1) f.model.components.forEach((c, i) => { if (c.fn !== 'response' && !has(c.id, col)) panel.series.push(P.series({ id: id('r'), kind: 'fit', fit: f.id, part: c.id, column: col, type: 'line', dash: 'dash', width: 0.8, color: P.PALETTES.okabe[(i + 2) % 8], marker: 'none', legend: k === 0 })); });
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
  /* What of a fit the graphs show beside its curve: the curves of its components, its band, a panel of what it leaves. */
  const OF_THE_FIT = ['total', 'band', 'prediction', 'residuals'];
  const isPart = { components: (r) => !OF_THE_FIT.includes(r.part), band: (r) => r.part === 'band', residuals: (r) => r.part === 'residuals' };
  function shownOf(f) {
    const all = doc.graphs.flatMap((g) => g.figure.panels.flatMap((p) => p.series)).filter((r) => r.kind === 'fit' && r.fit === f.id);
    return { components: all.some(isPart.components), band: all.some(isPart.band), residuals: all.some(isPart.residuals) };
  }
  /* Take the components or the band of a fit off the graphs; its curve stays. */
  function hideFit(f, what) {
    doc.graphs.forEach((g) => g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'fit' && r.fit === f.id && isPart[what](r))); }));
  }
  /* Take the panel of residuals away, and give the figure back the height it had before it. */
  function hideResiduals(f) {
    doc.graphs.forEach((g) => {
      const fig = g.figure, before = fig.panels.length, mine = (r) => r.kind === 'fit' && r.fit === f.id && r.part === 'residuals';
      fig.panels = fig.panels.filter((p) => !(p.series.length && p.series.every(mine)) || fig.panels.length === 1);
      fig.panels.forEach((p) => { p.series = p.series.filter((r) => !mine(r)); });
      if (before === 2 && fig.panels.length === 1) { fig.layout.ratios = []; fig.layout.shareX = false; fig.height = Math.round(fig.height / 1.25); }
    });
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
    if (r.kind === 'member') {            // the curve fitted to the file a series is showing: computed when asked for, kept for the visit only
      const sr = fileSeries(r.series), curve = sr ? memberCurves[sr.id + ':' + sr.current] : null;
      if (!curve) return null;
      return r.part === 'total' ? { x: curve.x, y: curve.y, label: 'Fit' } : curve.components[r.part] ? { x: curve.x, y: curve.components[r.part], label: r.part } : null;
    }
    // a curve that follows a series draws, with the same columns, the file the series is showing
    const sr = r.follow ? fileSeries(r.follow) : null, model = sheet(r.sheet), s = sr && sheet(sr.current) ? sheet(sr.current) : model;
    const at = (cid) => (s === model ? column(s, cid) : counterpart(model, cid, s));
    const y = at(r.y); if (!y) return null;
    const x = at(r.x), n = Math.max(y.values.length, x ? x.values.length : 0);
    const ye = at(r.yerr), xe = at(r.xerr);
    let ys = numbers(y, n);
    if (r.shift) ys = ys.map((v) => v + r.shift);
    const out = { x: x ? numbers(x, n) : Array.from({ length: n }, (_, i) => i + 1), y: ys, yerr: ye ? numbers(ye, n) : null, xerr: xe ? numbers(xe, n) : null, label: sr ? P.literal(s.name) : y.title || y.name };
    const flag = r.unless ? column(s, r.unless) : null;          // the rows another column marks (a fit to check) are left out of this curve
    if (flag) { const keep = []; for (let i = 0; i < n; i++) if (flag.values[i] == null) keep.push(i); ['x', 'y', 'yerr', 'xerr'].forEach((k) => { if (out[k]) out[k] = keep.map((i) => out[k][i]); }); out.left = n - keep.length; }
    return out;
  }
  const previewOf = { fit: null, curve: null };                // the model drawn at its starting values, before any fit: on screen only

  // ------------------------------------------------------------------ fits
  const fit = (fid) => doc.fits.find((f) => f.id === fid) || null;
  function addFit(s, x, y) {
    const e = errOf(s, y), ex = e ? xerrOf(s, x) : null;          // errors of x are counted with errors of y, not alone
    const f = { id: id('f'), name: unique(doc.fits, 'Fit of ' + (y.title || y.name)).slice(0, 80), sheet: s.id, x: x ? x.id : null, y: y.id, yerr: e ? e.id : null, xerr: ex ? ex.id : null, response: null, more: [], mode: 'single', shared: [], limits: null,
      model: { components: [] }, options: { method: 'leastsq', weights: e ? 'instrumental' : 'none', absolute_sigma: false, loss: 'linear', level: 0.95, points: 800, intervals: false }, result: null, results: {}, stale: false };
    doc.fits.push(f); doc.view.fit = f.id;
    return f;
  }
  /* The same data, the same model, under another name: to change the model and see which the data support. */
  function duplicateFit(f) {
    const k = JSON.parse(JSON.stringify(f));
    Object.assign(k, { id: id('f'), name: unique(doc.fits, f.name).slice(0, 80), result: null, results: {}, stale: false });
    doc.fits.push(k); doc.view.fit = k.id;
    return k;
  }
  /* Two fits that can be compared: the same points, counted the same way. What differs is the model. */
  function comparable(a, b) {
    const same = (k) => JSON.stringify(a[k]) === JSON.stringify(b[k]), opt = (k) => a.options[k] === b.options[k];
    return a !== b && !!a.result && !!b.result && !a.stale && !b.stale && ['sheet', 'x', 'y', 'mode', 'more', 'limits'].every(same) && ['weights', 'loss'].every(opt) &&
      (a.options.weights !== 'instrumental' || (same('yerr') && same('xerr') && opt('absolute_sigma'))) && (a.options.method === 'least_squares') === (b.options.method === 'least_squares') && a.result.ndata === b.result.ndata;
  }
  const hasResponse = (f) => f.model.components.some((c) => c.fn === 'response');
  function removeFit(fid) {
    doc.fits = doc.fits.filter((f) => f.id !== fid);
    doc.series = doc.series.filter((sr) => sr.fit !== fid);
    doc.graphs.forEach((g) => { g.figure.panels = g.figure.panels.filter((p) => !(p.series.length && p.series.every((r) => r.kind === 'fit' && r.fit === fid && r.part === 'residuals')) || g.figure.panels.length === 1); g.figure.panels.forEach((p) => { p.series = p.series.filter((r) => !(r.kind === 'fit' && r.fit === fid)); }); if (g.figure.panels.length === 1) { g.figure.layout.ratios = []; g.figure.layout.shareX = false; } });
    if (doc.view.fit === fid) doc.view.fit = doc.fits.length ? doc.fits[doc.fits.length - 1].id : null;
  }
  const nullable = (a) => a.map((v) => (isFinite(v) ? v : null));

  // ------------------------------------------------------------------ series: the same fit on many files
  const fileSeries = (id) => doc.series.find((sr) => sr.id === id) || null;
  const memberCurves = {};                                    // series id + ':' + sheet id → the fitted curve, on screen only
  const originals = (s) => s.columns.filter((c) => !c.formula && !c.made);
  const madeKey = (m) => JSON.stringify([m.op, Object.keys(m.args || {}).sort().map((k) => [k, m.args[k]]), m.x, m.y, m.y2 || null, m.part || 0]);
  /* The column of sheet `to` that is what column `cid` is in sheet `from`: the same place among the columns that were
     imported or typed, the same formula, or the same operation on the counterparts of its own columns. */
  function counterpart(from, cid, to) {
    const c = column(from, cid);
    if (!c || !to) return null;
    if (from === to) return c;
    if (c.formula) return to.columns.find((k) => k.formula === c.formula && k.name === c.name) || null;
    if (c.made) { const want = mapped(from, c.made, to); return want ? to.columns.find((k) => k.made && madeKey(k.made) === madeKey(want)) || null : null; }
    return originals(to)[originals(from).indexOf(c)] || null;
  }
  function mapped(from, made, to) {
    const ids = {};
    for (const key of ['x', 'y', 'y2']) { if (made[key] == null) { ids[key] = null; continue; } const k = counterpart(from, made[key], to); if (!k) return null; ids[key] = k.id; }
    return Object.assign({}, made, ids);
  }
  /* The numbers written in a name, each with the letters that follow it: "N3978_3kV_236nm_160K" → 3978, 3 kV, 236 nm, 160 K. */
  function numbersIn(name) {
    const out = [], re = /(\d+(?:[.,]\d+)?)\s?([A-Za-zµ°%]{0,4})(?![A-Za-zµ°%=])|(\d+(?:[.,]\d+)?)/g;          // "3 T=5": T is the name of what follows, not the unit of 3
    let m;
    while ((m = re.exec(String(name)))) {
      const text = m[1] || m[3], before = name[m.index - 1], sign = before === '-' && !/[A-Za-z0-9.]/.test(name[m.index - 2] || ' ') ? -1 : 1;
      out.push({ value: sign * Number(text.replace(',', '.')), unit: m[1] ? m[2] : '' });
    }
    return out;
  }
  /* What may have been varied between files, read from their names: for each number that sits at the same place in every
     name, its value in each. The ones that differ from file to file come first. */
  function variablesIn(names) {
    const all = names.map(numbersIn), n = all.length ? Math.min(...all.map((a) => a.length)) : 0, out = [];
    if (all.every((a) => a.length === n)) for (let i = 0; i < n; i++) out.push({ values: all.map((a) => a[i].value), unit: all[0][i].unit });
    else {                                                    // names of different shapes: a number is known by its unit
      const units = [...new Set(all.flat().map((x) => x.unit))].filter((u) => u && all.every((a) => a.filter((x) => x.unit === u).length === 1));
      units.forEach((u) => out.push({ values: all.map((a) => a.find((x) => x.unit === u).value), unit: u }));
    }
    out.forEach((c) => { c.distinct = new Set(c.values).size; });
    return out.map((c, i) => [c, i]).sort((a, b) => b[0].distinct - a[0].distinct || b[1] - a[1]).map((x) => x[0]);
  }
  /* A name for a series from the names of its files: what they have in common. */
  function commonName(names) {
    if (names.length < 2) return '';
    let n = 0; while (n < names[0].length && names.every((x) => x[n] === names[0][n])) n++;
    const stem = names[0].slice(0, n).replace(/[\s_\-.\d]+$/, '');
    return stem.length >= 3 ? stem : '';
  }
  function addSeries(f) {
    const sr = { id: id('q'), name: unique(doc.series, 'Series of ' + (sheet(f.sheet) || { name: 'files' }).name).slice(0, 80), fit: f.id, variable: { name: '', unit: '' },
      members: [{ sheet: f.sheet, value: null, state: 'todo', message: '', result: null }], chain: true, results: null, graph: null, current: f.sheet, ran: '' };
    doc.series.push(sr);
    return sr;
  }
  /* Whether a sheet can be a file of the series: it must hold what the fit reads, at the same places. */
  function fitsIn(sr, s) {
    const f = fit(sr.fit), model = f && sheet(f.sheet);
    if (!model || !s) return 'the fit of this series is gone';
    if (s.id === sr.results) return 'it is the table of results';
    const need = [];
    const walk = (cid) => {             // back to the columns that were imported or typed: through an operation by what it read, through a formula by the names it uses
      const c = column(model, cid); if (!c) return;
      if (c.made) ['x', 'y', 'y2'].forEach((k) => { if (c.made[k]) walk(c.made[k]); });
      else if (c.formula) { try { ASY.expr.column(c.formula).names.forEach((n) => { const k = model.columns.find((q) => q.name === n && q !== c); if (k) walk(k.id); }); } catch (e) { /* a formula that does not read: nothing to follow */ } }
      else if (!need.includes(c)) need.push(c);
    };
    [f.x, f.y, f.yerr, f.options.weights === 'instrumental' ? f.xerr : null, hasResponse(f) ? f.response : null].forEach((cid) => { if (cid) walk(cid); });
    const short = need.find((c) => !originals(s)[originals(model).indexOf(c)]);
    return short ? 'it has ' + originals(s).length + ' column' + (originals(s).length === 1 ? '' : 's') + ' of data where “' + model.name + '” has ' + originals(model).length : '';
  }
  /* The order the files are fitted in: the one the fit was made on first, then its neighbours in the value that was varied,
     outwards on each side. With `chain`, each starts from what its neighbour gave: that is how a peak is followed as it moves. */
  function seriesOrder(sr) {
    const f = fit(sr.fit), sorted = sr.members.slice().sort((a, b) => (a.value == null) - (b.value == null) || a.value - b.value);
    const t = Math.max(0, sorted.findIndex((m) => f && m.sheet === f.sheet)), out = [{ member: sorted[t], from: null }];
    for (let i = t + 1; i < sorted.length; i++) out.push({ member: sorted[i], from: sorted[i - 1] });
    for (let i = t - 1; i >= 0; i--) out.push({ member: sorted[i], from: sorted[i + 1] });
    return out;
  }
  /* A mark of what a series was run with: the model, the columns, the range, the weights. Starting values are not in it. */
  function mark(f) {
    const text = JSON.stringify([f.x, f.y, f.yerr, f.limits, f.options.weights, f.options.method, f.options.loss, f.options.absolute_sigma].concat(f.xerr || f.response ? [f.xerr, f.response] : [],       // added only when used: the mark of an older series stays what it was
      [f.model.components.map((c) => [c.id, c.fn, c.expr || '', Object.entries(c.params).map(([n, p]) => [n, p.vary !== false, p.min, p.max, p.expr || '', p.vary === false ? p.value : null])])]));
    let h = 5381; for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(16) + ':' + text.length;
  }
  const brief = (res) => ({ success: !!res.success, message: res.message || '', redchi: res.redchi, rsquared: res.rsquared, npoints: res.npoints, nvarys: res.nvarys, warnings: res.warnings || [],
    params: res.params.map((q) => ({ name: q.name, value: q.value, stderr: q.stderr, vary: q.vary, tied: q.tied || '' })), derived: res.derived.map((d) => ({ name: d.name, label: d.label, value: d.value, stderr: d.stderr })) });
  /* The model of a fit, starting from values found elsewhere: the parameters that are fitted take them, the held and the tied ones stay. */
  function modelFrom(model, params) {
    const got = {}; (params || []).forEach((q) => { if (q.value != null) got[q.name] = q.value; });
    const out = JSON.parse(JSON.stringify(model));
    out.components.forEach((c) => Object.entries(c.params).forEach(([n, spec]) => { const v = got[c.id + '_' + n]; if (v != null && spec.vary !== false && !spec.expr) { let w = Number(v.toPrecision(10)); if (spec.min != null) w = Math.max(w, spec.min); if (spec.max != null) w = Math.min(w, spec.max); spec.value = w; } }));
    return out;
  }
  /* What is sent to be fitted for one file of a series: the counterparts of the columns the fit reads. */
  function memberData(sr, s) {
    const f = fit(sr.fit), model = sheet(f.sheet), x = counterpart(model, f.x, s), y = counterpart(model, f.y, s);
    if (!y) throw new Error('“' + s.name + '” has no column that is what “' + label(column(model, f.y)) + '” is in “' + model.name + '”');
    return sent(f, x, y, (cid) => counterpart(model, cid, s), s);
  }
  /* Give a file of the series the columns the model sheet computes: its formulas, and its operations done again on this file. `call(path, body)` asks the server. */
  async function replay(sr, s, call) {
    const f = fit(sr.fit), model = sheet(f.sheet);
    if (s === model) return 0;
    let made = 0;
    const done = new Set(), whole = (m) => madeKey(Object.assign({}, m, { part: 0 }));          // an operation is done once, whichever of its columns the model sheet kept
    for (const c of model.columns) {
      if (c.formula && !counterpart(model, c.id, s)) { if (s.columns.some((k) => k.name === c.name)) throw new Error('“' + s.name + '” already has a column ' + c.name + ', which the formula of “' + model.name + '” would need'); const k = addColumn(s, { title: c.title, unit: c.unit, role: c.role, formula: c.formula, comment: c.comment }); k.name = c.name; recompute(s); made++; }
      if (!c.made || !c.made.op || done.has(whole(c.made))) continue;
      done.add(whole(c.made));
      const want = mapped(model, c.made, s);
      if (!want) throw new Error('“' + s.name + '” lacks a column that ' + c.made.op + ' needs');
      const xc = column(s, want.x), yc = column(s, want.y), y2c = column(s, want.y2), n = Math.max(yc.values.length, xc ? xc.values.length : 0);
      const body = { operation: c.made.op, args: c.made.args || {}, x: xc ? nullable(numbers(xc, n)) : Array.from({ length: n }, (_, i) => i + 1), y: nullable(numbers(yc, n)) };
      if (y2c) { const x2 = xOf(s, y2c) || xc; body.x2 = x2 ? nullable(numbers(x2, n)) : body.x; body.y2 = nullable(numbers(y2c, n)); }
      const out = await call('asymille/analyse', body);
      if (out.sheet !== 'same') throw new Error(c.made.op + ' makes a table of its own: it cannot be repeated inside a series');
      out.columns.forEach((col, part) => {
        const twin = model.columns.find((k) => k.made && madeKey(k.made) === madeKey(Object.assign({}, c.made, { part })));
        if (!twin) return;                                      // the model sheet no longer keeps that output: neither does this one
        const key = Object.assign({}, want, { part }), had = s.columns.find((k) => k.made && madeKey(k.made) === madeKey(key));
        if (had) had.values = col.values.slice();
        else { const k = addColumn(s, { title: twin.title, unit: twin.unit, role: twin.role, values: col.values, comment: out.note, made: key }); if (!s.columns.some((q) => q !== k && q.name === twin.name)) k.name = twin.name; }       // the same short name, so that the formulas of the model sheet read it
        made++;
      });
    }
    return made;
  }
  /* Fit every file of a series. `call` asks the server; `tell(member)` is called as each one starts and ends; `stop()` says whether to go on.
     A file that cannot be fitted says why and the others go on: a series is not lost for one bad file. */
  async function runSeries(sr, call, tell, stop) {
    const f = fit(sr.fit);
    if (!f || !f.model.components.length) throw new Error('The fit of this series has no model yet');
    const options = Object.assign({}, f.options); delete options.started; options.intervals = false;
    const limits = f.limits ? [f.limits[0], f.limits[1]] : null;
    /* A result to start a neighbour from: it converged and carries no warning. A file where the peak is lost must not lead the next ones astray. */
    const sound = (r) => !!(r && r.success && !r.warnings.length);
    let model = f.model, lastSound = null;
    if (!f.options.started && !(f.result && !f.stale)) { const d = fitData(f); model = (await call('asymille/model/guess', { x: d.x, y: d.y, model: f.model, limits })).model; f.model = model; f.options.started = true; }
    sr.members.forEach((m) => { m.state = 'todo'; m.message = ''; });
    for (const step of seriesOrder(sr)) {
      const m = step.member, s = sheet(m.sheet);
      if (stop && stop()) break;
      m.state = 'running'; if (tell) tell(m);
      try {
        if (!s) throw new Error('its sheet is gone');
        let res;
        if (s.id === f.sheet && f.result && !f.stale && f.mode === 'single') res = f.result;            // the fit already made on the model sheet is its result
        else {
          await replay(sr, s, call);
          if (step.from && step.from.sheet === f.sheet) lastSound = null;                              // the other side of the model sheet: start again from it
          const d = memberData(sr, s), near = sr.chain && step.from ? (sound(step.from.result) ? step.from.result : lastSound) : null;
          const start = near ? near.params : f.result && !f.stale ? f.result.params : null;
          res = await call('asymille/fit', Object.assign({ model: start ? modelFrom(model, start) : model, limits, options }, d));
          if (!sound(res)) {                                                                          // a second try, from starting values read from this file itself; the better of the two is kept
            const own = await call('asymille/model/guess', { x: d.x, y: d.y, model, limits });
            const again = await call('asymille/fit', Object.assign({ model: own.model, limits, options }, d));
            if (sound(again) || (again.success && (!res.success || again.redchi < res.redchi))) res = again;
          }
        }
        if (sound(res)) lastSound = brief(res);
        m.result = brief(res); m.state = res.success ? 'done' : 'failed'; m.message = res.success ? '' : res.message || 'did not converge';
        memberCurves[sr.id + ':' + m.sheet] = { x: res.curve.x, y: res.curve.y, components: res.curve.components };
      } catch (e) { m.result = null; m.state = 'failed'; m.message = e.message || String(e); }
      if (tell) tell(m);
    }
    sr.members.forEach((m) => { if (m.state === 'running') m.state = 'todo'; });
    sr.ran = mark(f);
    return seriesTable(sr);
  }
  const OF_X = ['center', 'sigma', 'gamma', 'fwhm', 'sigma_r', 'x0', 'width', 'tau', 'tau1', 'tau2', 'tau3', 'mode', 'median', 'half_life', 'period', 'km', 'k', 'shift', 'scale', 'pulse_fwhm', 'pp_width', 'theta', 't0', 'beta', 'v0', 'kt', 'resolution_fwhm'],
    OF_Y = ['height', 'y0', 'c', 'intercept', 'low', 'high', 'top', 'vmax', 'qmax', 'e0', 'i0', 'ms', 'chi0', 'i_s'];
  /* What a series found, as a sheet: one row per file, in the order of what was varied; each parameter beside its uncertainty,
     so that it is plotted with its error bars; and a column that says which rows should not be trusted. Made again at each run, in place. */
  function seriesTable(sr) {
    const f = fit(sr.fit), model = f && sheet(f.sheet), xc = model && column(model, f.x), yc = model && column(model, f.y);
    let s = sheet(sr.results);
    if (!s) { s = addSheet('Results of ' + sr.name, 'What the series “' + sr.name + '” found: one row per file.'); sr.results = s.id; }
    const rows = sr.members.slice().sort((a, b) => (a.value == null) - (b.value == null) || a.value - b.value);
    const kept = [], put = (key, props, values) => {
      let c = s.columns.find((k) => k.made && k.made.series === sr.id && k.made.key === key);
      if (!c) c = addColumn(s, Object.assign({ made: { series: sr.id, key } }, props));
      Object.assign(c, { title: props.title, unit: props.unit || '', role: props.role }); c.values = values.slice(); kept.push(c);
    };
    const unitOf = (name) => { const p = name.split('_').slice(1).join('_'); return OF_X.includes(p) ? (xc ? xc.unit : '') : OF_Y.includes(p) ? (yc ? yc.unit : '') : ''; };
    put('variable', { title: sr.variable.name || 'File', unit: sr.variable.unit, role: 'x' }, rows.map((m, i) => (m.value == null ? i + 1 : m.value)));
    const names = [], derived = [];
    rows.forEach((m) => { if (!m.result) return; m.result.params.forEach((q) => { if (q.vary && !names.includes(q.name)) names.push(q.name); }); m.result.derived.forEach((d) => { if (!derived.includes(d.name)) derived.push(d.name); }); });
    const cell = (m, list, name, field) => { const q = m.result && m.result[list].find((k) => k.name === name); return q && q[field] != null ? q[field] : null; };
    const said = (name) => name.replace(/_/g, ' ');            // p1_center is a name of the model; as the title of an axis an underscore would lower what follows
    names.forEach((name) => { put(name, { title: said(name), unit: unitOf(name), role: 'y' }, rows.map((m) => cell(m, 'params', name, 'value'))); put(name + ':err', { title: '± ' + said(name), unit: unitOf(name), role: 'yerr' }, rows.map((m) => cell(m, 'params', name, 'stderr'))); });
    derived.forEach((name) => { put(name, { title: said(name), unit: unitOf(name), role: 'y' }, rows.map((m) => cell(m, 'derived', name, 'value'))); put(name + ':err', { title: '± ' + said(name), unit: unitOf(name), role: 'yerr' }, rows.map((m) => cell(m, 'derived', name, 'stderr'))); });
    put('redchi', { title: 'Reduced χ²', role: 'y' }, rows.map((m) => (m.result ? m.result.redchi : null)));
    put('rsquared', { title: 'R²', role: 'y' }, rows.map((m) => (m.result ? m.result.rsquared : null)));
    put('check', { title: 'To check', role: 'label' }, rows.map((m) => (m.state === 'failed' ? (m.message || 'not fitted').slice(0, 190) : m.result && m.result.warnings.length ? m.result.warnings.length + ' warning' + (m.result.warnings.length > 1 ? 's' : '') : null)));
    put('file', { title: 'File', role: 'label' }, rows.map((m) => (sheet(m.sheet) || { name: '' }).name.slice(0, 190)));
    s.columns = kept.concat(s.columns.filter((c) => !kept.includes(c) && !(c.made && c.made.series === sr.id)));
    return s;
  }
  /* A graph that shows one file of the series at a time, with the curve fitted to it: to look at each fit. */
  function reviewGraph(sr) {
    let g = graph(sr.graph);
    if (g) return g;
    const f = fit(sr.fit), model = sheet(f.sheet), y = column(model, f.y), x = column(model, f.x), e = column(model, f.yerr);
    g = addGraph('Each fit of ' + sr.name); sr.graph = g.id;
    const p = g.figure.panels[0];
    p.series.push(P.series({ id: id('r'), kind: 'data', follow: sr.id, sheet: model.id, x: x ? x.id : null, y: y.id, yerr: e ? e.id : null, xerr: null, type: rows(model) > 400 ? 'line' : 'scatter', color: P.PALETTES.okabe[0] }));
    p.series.push(P.series({ id: id('r'), kind: 'member', series: sr.id, part: 'total', type: 'line', color: '#c81d25', marker: 'none' }));
    p.x.label = label(x); p.y.label = label(y);
    return g;
  }
  const RAMP = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#e8d51c'];          // viridis, stopped before its palest yellow: it must show on white
  const ramp = (t) => { const u = ASY.clamp(t, 0, 1) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(u)), k = u - i, h = (c, o) => parseInt(c.slice(o, o + 2), 16);
    return '#' + [1, 3, 5].map((o) => Math.round(h(RAMP[i], o) * (1 - k) + h(RAMP[i + 1], o) * k).toString(16).padStart(2, '0')).join(''); };
  /* Every file of the series on one graph, coloured along what was varied, each shifted up by `shift` from the one before. */
  function overlayGraph(sr, shift) {
    const f = fit(sr.fit), model = sheet(f.sheet), g = addGraph('All of ' + sr.name), p = g.figure.panels[0];
    const members = sr.members.slice().sort((a, b) => (a.value == null) - (b.value == null) || a.value - b.value).filter((m) => sheet(m.sheet) && counterpart(model, f.y, sheet(m.sheet)));
    members.forEach((m, i) => {
      const s = sheet(m.sheet), y = counterpart(model, f.y, s), x = counterpart(model, f.x, s);
      p.series.push(P.series({ id: id('r'), kind: 'data', sheet: s.id, x: x ? x.id : null, y: y.id, yerr: null, xerr: null, type: 'line', marker: 'none', color: ramp(members.length > 1 ? i / (members.length - 1) : 0), shift: (shift || 0) * i,
        label: m.value == null ? s.name : ASY.fmt(m.value, 6) + (sr.variable.unit ? ' ' + sr.variable.unit : '') }));
    });
    p.x.label = label(column(model, f.x)); p.y.label = label(column(model, f.y)) + (shift ? ', shifted' : '');
    if (members.length > 5) { p.legend.pos = 'out'; g.figure.width += 22; }          // many files: the legend beside the curves, on a wider page
    return g;
  }
  /* What is sent to be fitted: the x, y and error columns of a fit, row for row. */
  function fitData(f, ycol) {
    const s = sheet(f.sheet), x = column(s, f.x), y = column(s, ycol || f.y);
    if (!s || !y) throw new Error('the data of this fit are gone: choose its columns again');
    return sent(f, x, y, (cid) => column(s, cid), s);
  }
  /* The columns a fit sends, row for row. The errors of x go only with the weights that count errors, the response only for a model that holds one:
     what is sent is what is used. `at` finds a column of the fit in the sheet that is fitted (the fit's own, or a file of a series). */
  function sent(f, x, y, at, s) {
    const n = Math.max(y.values.length, x ? x.values.length : 0), of = (c) => (c ? nullable(numbers(c, n)) : null);
    const weighted = f.options.weights === 'instrumental', through = hasResponse(f);
    const response = through ? at(f.response) : null;
    if (through && !response) throw new Error(f.response ? '“' + s.name + '” has no column that is the response of the instrument' : 'The model holds a measured instrument response: choose the column that holds it, under Data');
    return { x: x ? of(x) : Array.from({ length: n }, (_, i) => i + 1), y: of(y), sigma: of(at(f.yerr)), sigma_x: weighted ? of(at(f.xerr)) : null, response: of(response) };
  }
  /* What is asked to draw a model without fitting it: `points` spread over the range that is fitted. Through a measured response the model
     exists on the x of the measurement only: these are sent with the response, and `cut` keeps what is in the range. */
  function drawing(f, d, model, points) {
    const inside = (v) => !f.limits || ((f.limits[0] == null || v >= f.limits[0]) && (f.limits[1] == null || v <= f.limits[1]));
    if (d.response) {
      const rows = d.x.map((v, i) => i).filter((i) => d.x[i] != null);
      return { body: { model, x: rows.map((i) => d.x[i]), response: rows.map((i) => (d.response[i] == null ? 0 : d.response[i])) },
        cut: (said) => { const keep = said.x.map((v, i) => i).filter((i) => inside(said.x[i])), pick = (a) => keep.map((i) => a[i]), parts = {}; Object.entries(said.components).forEach(([k, a]) => { parts[k] = pick(a); }); return { x: pick(said.x), y: pick(said.y), components: parts }; } };
    }
    const xs = d.x.filter((v, i) => v != null && d.y[i] != null && inside(v));
    if (!xs.length) return null;
    const lo = xs.reduce((a, b) => Math.min(a, b)), hi = xs.reduce((a, b) => Math.max(a, b));
    return { body: { model, x: Array.from({ length: points }, (_, i) => lo + (hi - lo) * i / (points - 1)) }, cut: (said) => ({ x: said.x, y: said.y, components: said.components }) };
  }
  const componentId = (f, fn) => { const letter = (fn || 'c')[0].replace(/[^a-z]/, 'c'), used = new Set(f.model.components.map((c) => c.id)); for (let i = 1; ; i++) if (!used.has(letter + i)) return letter + i; };

  ASY.model = {
    get doc() { return doc; }, get version() { return version; }, get canUndo() { return undoStack.length > 0; }, get canRedo() { return redoStack.length > 0; },
    errors, previewOf, on: (fn) => heard.push(fn), id: (p) => id(p), blank, restore, serialize, commit, undo, redo, log,
    sheet, column, rows, addSheet, freeName, addColumn, removeColumn, removeSheet, setCell, cell, numbers, label, xOf, errOf, xerrOf, recompute, changed, sortBy, sheetFrom, toText, unique,
    graph, addGraph, removeGraph, addData, plot, showFit, showResiduals, shownOf, hideFit, hideResiduals, seriesData, resultOf,
    fit, addFit, duplicateFit, comparable, hasResponse, removeFit, fitData, drawing, componentId,
    fileSeries, memberCurves, mark, commonName, originals, counterpart, numbersIn, variablesIn, addSeries, fitsIn, seriesOrder, modelFrom, memberData, replay, runSeries, seriesTable, reviewGraph, overlayGraph,
    get size() { return last.length; },
  };
})(window.ASY);
