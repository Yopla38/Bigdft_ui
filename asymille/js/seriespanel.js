/* A series: the same fit on many files, and what it gave against what was varied between them.
 *
 * The analysis is made once, on one file (a fit, and the operations before it). A series repeats
 * it on the others: each file is given the same computed columns, then fitted with the same
 * model, starting from what its neighbour gave so that a peak is followed as it moves. What comes
 * out is a sheet, one row per file: each parameter with its uncertainty against the temperature,
 * the field, the time… ready to be plotted and fitted in its turn.
 *
 * model.js holds the series and runs it (no DOM there); this file is its three places on screen:
 * a section of the fit panel, the dialog that says which files and which values, and the table
 * under the graph, where each fit can be looked at. A fit that failed or carries a warning is
 * marked in that table and in the sheet of results: its numbers are kept, and flagged. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, M = ASY.model, ui = ASY.ui, api = window.OND.api;
  const A = () => ASY.app;
  const NAMES = { K: 'Temperature', C: 'Temperature', '°C': 'Temperature', T: 'Field', mT: 'Field', G: 'Field', V: 'Voltage', kV: 'Voltage', mV: 'Voltage', nm: 'Wavelength', s: 'Time', ms: 'Time', min: 'Time', h: 'Time',
    W: 'Power', mW: 'Power', A: 'Current', mA: 'Current', bar: 'Pressure', GPa: 'Pressure', eV: 'Energy', Hz: 'Frequency', kHz: 'Frequency', MHz: 'Frequency', mm: 'Distance' };
  const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  const sorted = (sr) => sr.members.slice().sort((a, b) => (a.value == null) - (b.value == null) || a.value - b.value);
  /* How much room the project takes of what the server reads in one save. */
  function room() {
    const limit = A().catalogue && A().catalogue.limits.document_bytes, size = M.size;
    if (!limit) return null;
    return { size, limit, text: 'This project is ' + mb(size) + ' of the ' + mb(limit) + ' the server keeps in one project.', near: size > 0.8 * limit };
  }

  // ------------------------------------------------------------------ in the fit panel
  function section(f) {
    const sr = M.doc.series.find((k) => k.fit === f.id);
    return ui.sec('The same fit on other files', sr ? sr.members.length + ' files' : 'a series', false,
      h('p', { class: 'say' }, sr ? 'This fit is repeated on ' + sr.members.length + ' files' + (sr.variable.name ? ', against ' + sr.variable.name.toLowerCase() : '') + '.'
        : 'Measured the same thing at thirty temperatures? Make the fit on one file, then repeat it on the others: you get each parameter, with its uncertainty, against what was varied.'),
      h('div', { class: 'acts', style: 'padding-bottom:6px' }, sr ? ui.btn('Open the series', () => open(sr)) : ui.btn('Make a series…', () => { const made = M.addSeries(f); dialog(made, true); }, '', { disabled: !f.model.components.length, title: f.model.components.length ? '' : 'Build the model first' })));
  }

  // ------------------------------------------------------------------ which files, which values
  function dialog(sr, fresh) {
    const f = M.fit(sr.fit), model = M.sheet(f.sheet);
    const body = h('div', { class: 'dlg-body' });
    let note = '', ran = false;
    const auto = sr.name.startsWith('Series of ');            // named by the page so far: it takes what the names of its files have in common
    const el = h('dialog', { class: 'dlg wide', 'aria-label': 'A series', onclick: (e) => { if (e.target === el) el.close(); },
      onclose: () => { el.remove(); if (fresh && !ran && sr.members.length < 2) M.doc.series = M.doc.series.filter((k) => k !== sr); A().refresh(); } },
      h('div', { class: 'dlg-head' }, h('h2', {}, 'The same fit on many files'), h('button', { class: 'btn small', type: 'button', onclick: () => el.close() }, 'Close')), body);
    const member = (s) => sr.members.find((m) => m.sheet === s.id);
    const include = (s, on) => { if (on && !member(s)) sr.members.push({ sheet: s.id, value: null, state: 'todo', message: '', result: null }); if (!on) sr.members = sr.members.filter((m) => m.sheet !== s.id || s.id === f.sheet); };
    const candidates = () => M.variablesIn(sr.members.map((m) => (M.sheet(m.sheet) || { name: '' }).name)).filter((c) => c.distinct > 1);
    const read = (c) => { sr.members.forEach((m, i) => { m.value = c.values[i]; }); sr.variable.unit = c.unit || sr.variable.unit; if (!sr.variable.name && NAMES[c.unit]) sr.variable.name = NAMES[c.unit]; };
    const fileInput = h('input', { type: 'file', multiple: true, hidden: true, accept: '.txt,.dat,.csv,.tsv,.asc,.xy,.prn,.Specan,.xml,text/*', onchange: async (e) => {
      note = ''; let taken = 0;
      for (const file of [...e.target.files]) {
        try {
          const got = ASY.importer.read(await file.text(), file.name);
          if (!got.rows) throw new Error('no row of numbers was found');
          const s = M.sheetFrom(got.name, got.columns, 'Imported from ' + file.name + '.'), why = M.fitsIn(sr, s);
          if (why) { M.removeSheet(s.id); throw new Error(why); }
          include(s, true); taken++;
        } catch (err) { note += file.name + ': ' + err.message + '. '; }
      }
      if (taken) { M.log(taken + ' file' + (taken > 1 ? 's' : '') + ' imported into the series “' + sr.name + '”.'); const c = candidates(); if (c.length && sr.members.every((m) => m.value == null)) read(c[0]); }
      e.target.value = ''; draw();
    } });
    function draw() {
      const place = (s) => { const m = member(s); return m ? (m.value == null ? Infinity : m.value) : Infinity; };
      const sheets = M.doc.sheets.filter((s) => s.id !== sr.results && !s.columns.some((c) => c.made && c.made.series)).sort((a, b) => !member(a) - !member(b) || place(a) - place(b)), cands = candidates(), n = sr.members.length, space = room();
      if (auto) { const stem = M.commonName(sr.members.map((m) => (M.sheet(m.sheet) || { name: '' }).name)); if (stem) sr.name = M.unique(M.doc.series.filter((k) => k !== sr), stem).slice(0, 80); }
      ASY.fill(body, fileInput,
        h('p', { class: 'say' }, 'The fit “' + f.name + '” was made on the sheet ', h('b', {}, model.name), '. Each file below gets the same computed columns, then the same model. A file must hold its data in the same columns as that sheet.'),
        h('div', { class: 'cols3', style: 'gap:0 14px' },
          ui.field('What was varied between the files', h('input', { class: 'inp', type: 'text', value: sr.variable.name, maxlength: 60, placeholder: 'Temperature', onchange: (e) => { sr.variable.name = e.target.value.trim(); } })),
          ui.field('Its unit', h('input', { class: 'inp', type: 'text', value: sr.variable.unit, maxlength: 40, placeholder: 'K', onchange: (e) => { sr.variable.unit = e.target.value.trim(); } })),
          ui.field('Read its values from the names', h('select', { class: 'inp', disabled: !cands.length, onchange: (e) => { if (e.target.value !== '') { read(cands[Number(e.target.value)]); draw(); } } },
            h('option', { value: '' }, cands.length ? 'choose which number' : 'no number differs between the names'),
            cands.map((c, i) => h('option', { value: i }, c.values.slice(0, 4).map((v) => ASY.fmt(v, 6)).join(', ') + (c.values.length > 4 ? ', …' : '') + (c.unit ? ' ' + c.unit : '')))), 'Or type each value below.')),
        h('div', { class: 'members' }, sheets.map((s) => {
          const m = member(s), why = m ? '' : M.fitsIn(sr, s), isModel = s.id === f.sheet;
          return h('label', { class: 'member' + (m ? '' : ' off') },
            h('input', { type: 'checkbox', checked: !!m, disabled: isModel || !!why, 'aria-label': 'In the series: ' + s.name, onchange: (e) => { include(s, e.target.checked); draw(); } }),
            h('span', {}, s.name, isModel ? h('small', {}, 'the fit was made on this one') : why ? h('small', {}, 'cannot be in the series: ' + why) : null),
            m ? h('input', { class: 'inp num', type: 'text', inputmode: 'decimal', value: m.value == null ? '' : m.value, placeholder: sr.variable.name || 'value', 'aria-label': (sr.variable.name || 'Value') + ' of ' + s.name,
              onchange: (e) => { const v = ASY.parseNum(e.target.value); m.value = isNaN(v) ? null : v; } }) : h('span', {}));
        })),
        note ? h('div', { class: 'notice err' }, note) : null,
        space && space.near ? h('div', { class: 'notice' }, space.text + ' A project that is too large is refused when it is saved: put fewer files in one project.') : space ? h('p', { class: 'muted' }, space.text) : null,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: sr.chain, onchange: (e) => { sr.chain = e.target.checked; } }), 'Each file starts from what its neighbour gave: a peak is followed as it moves'),
        h('div', { class: 'acts' },
          ui.btn('Add files…', () => fileInput.click(), n < 2 ? 'cta' : '', { title: 'Each file becomes a sheet of the project and a file of the series' }),
          ui.btn(n > 1 ? 'Fit ' + n + ' files' : 'Add files to fit', () => { ran = true; el.close(); run(sr); }, n > 1 ? 'cta' : '', { disabled: n < 2 || !A().catalogue }),
          sr.members.some((m) => m.value == null) && n > 1 ? h('span', { class: 'muted' }, 'A file without a value is numbered by its place.') : null));
    }
    document.body.append(el); el.showModal();
    if (fresh) { M.doc.sheets.forEach((s) => { if (s.id !== f.sheet && !M.fitsIn(sr, s) && M.originals(s).length === M.originals(model).length && M.rows(s) > 0 && !s.columns.some((c) => c.made && c.made.series)) include(s, true); }); const c = candidates(); if (c.length) read(c[0]); }
    draw();
  }

  // ------------------------------------------------------------------ running it, and looking at one file
  async function run(sr) {
    const st = A().state, f = M.fit(sr.fit);
    st.busy = 'series:' + sr.id; st.stop = false; st.dock = 'series'; st.shownSeries = sr.id; st.facts = null;
    A().redrawAll();
    try {
      await M.runSeries(sr, (path, body) => api.post(path, body), () => { A().redrawDock(); A().redrawTree(); }, () => st.stop);
      const done = sr.members.filter((m) => m.state === 'done').length, bad = sr.members.filter((m) => m.state === 'failed').length;
      M.log('Series “' + sr.name + '”: the fit “' + f.name + '” on ' + sr.members.length + ' files' + (sr.variable.name ? ', against ' + sr.variable.name.toLowerCase() + (sr.variable.unit ? ' (' + sr.variable.unit + ')' : '') : '') +
        (sr.chain ? ', each starting from its neighbour' : ', each from the same starting values') + '. ' + done + ' fitted' + (bad ? ', ' + bad + ' to check' : '') + (st.stop ? '; stopped before the end' : '') + '. Results in the sheet “' + (M.sheet(sr.results) || { name: '' }).name + '”.');
    } catch (e) { A().say(e.message, true); }
    st.busy = null; st.stop = false;
    A().refresh();
  }
  /* The curve fitted to a file, computed again from its parameters when the page does not hold it any more. */
  async function curveOf(sr) {
    const key = sr.id + ':' + sr.current, m = sr.members.find((k) => k.sheet === sr.current), f = M.fit(sr.fit), s = M.sheet(sr.current);
    if (M.memberCurves[key] || !m || !m.result || !s || !A().catalogue) return;
    try {
      const d = M.memberData(sr, s), xs = d.x.filter((v, i) => v != null && d.y[i] != null && (!f.limits || ((f.limits[0] == null || v >= f.limits[0]) && (f.limits[1] == null || v <= f.limits[1]))));
      if (!xs.length) return;
      const lo = xs.reduce((a, b) => Math.min(a, b)), hi = xs.reduce((a, b) => Math.max(a, b));
      const said = await api.post('asymille/model/evaluate', { model: M.modelFrom(f.model, m.result.params), x: Array.from({ length: 600 }, (_, i) => lo + (hi - lo) * i / 599) });
      M.memberCurves[key] = { x: said.x, y: said.y, components: said.components };
      if (sr.current === m.sheet) A().redrawMain();
    } catch (e) { /* the table still says what was found */ }
  }
  function show(sr, sheetId) {
    const g = M.reviewGraph(sr);
    sr.current = sheetId;
    M.doc.view.graph = g.id; M.doc.view.main = 'graph';
    A().state.shownSeries = sr.id;
    A().refresh(); curveOf(sr);
  }
  function open(sr) {
    const st = A().state;
    st.dock = 'series'; st.shownSeries = sr.id; st.facts = null;
    if (sr.members.some((m) => m.result)) show(sr, M.sheet(sr.current) ? sr.current : sr.members[0].sheet); else A().refresh();
  }

  // ------------------------------------------------------------------ under the graph: the table of the series
  const plotting = { key: null, shift: 0 };
  function dock() {
    const st = A().state, doc = M.doc, sr = doc.series.find((k) => k.id === st.shownSeries) || doc.series[0];
    if (!sr) {
      const f = M.fit(doc.view.fit);
      return [h('p', { class: 'say' }, 'A series repeats one fit on many files and gives each parameter, with its uncertainty, against what was varied between them: a temperature, a field, a time.'),
        f ? h('div', { class: 'acts' }, ui.btn('Make a series from “' + f.name + '”', () => dialog(M.addSeries(f), true), 'cta', { disabled: !f.model.components.length })) : h('p', { class: 'say' }, 'Fit one file first: the series repeats that fit.')];
    }
    const f = M.fit(sr.fit), busy = st.busy === 'series:' + sr.id, rows = sorted(sr), results = M.sheet(sr.results);
    const done = rows.filter((m) => m.state === 'done').length, bad = rows.filter((m) => m.state === 'failed').length, warned = rows.filter((m) => m.state === 'done' && m.result && m.result.warnings.length).length;
    const first = rows.find((m) => m.result), shown = first ? first.result.params.filter((q) => q.vary).slice(0, 4).map((q) => q.name) : [];
    const ys = results ? results.columns.filter((c) => c.role === 'y' && c.made && c.made.series === sr.id) : [];
    if (!ys.some((c) => c.made.key === plotting.key)) plotting.key = ys.length ? ys[0].made.key : null;
    const changed = sr.ran && f && sr.ran !== M.mark(f);
    return [
      h('div', { class: 'res-head' }, h('h3', {}, sr.name),
        h('span', { class: 'acts' }, busy ? h('span', { class: 'pill' }, 'fitting ' + (done + bad + 1) + ' of ' + rows.length + '…') : null, done ? h('span', { class: 'pill ok' }, done + ' fitted') : null,
          bad ? h('span', { class: 'pill err' }, bad + ' not fitted') : null, warned ? h('span', { class: 'pill warn' }, warned + ' with a warning') : null)),
      doc.series.length > 1 ? h('div', { class: 'seg' }, doc.series.map((k) => h('button', { type: 'button', 'aria-pressed': String(k === sr), onclick: () => open(k) }, k.name))) : null,
      changed && !busy ? h('div', { class: 'notice' }, 'The model, the columns or the range of the fit “' + f.name + '” changed since this series was run: what is below is out of date. Fit the files again.') : null,
      h('div', { class: 'acts' },
        busy ? ui.btn('Stop', () => { st.stop = true; }, 'danger', { title: 'After the file being fitted' }) : ui.btn(done + bad ? 'Fit the files again' : 'Fit ' + rows.length + ' files', () => run(sr), done + bad && !changed ? '' : 'cta', { disabled: rows.length < 2 || !A().catalogue }),
        ui.btn('Files and values…', () => dialog(sr, false), '', { disabled: busy }),
        ys.length ? h('select', { class: 'inp', style: 'width:auto', 'aria-label': 'Which result to plot', onchange: (e) => { plotting.key = e.target.value; } }, ys.map((c) => h('option', { value: c.made.key, selected: c.made.key === plotting.key }, c.title))) : null,
        ys.length ? ui.btn('Plot it against ' + (sr.variable.name ? sr.variable.name.toLowerCase() : 'the files'), () => {
          const c = ys.find((k) => k.made.key === plotting.key), flag = results.columns.find((k) => k.made && k.made.series === sr.id && k.made.key === 'check'), marked = flag ? flag.values.filter((v) => v != null).length : 0;
          const g = M.plot(results, [c], 'both'); g.name = M.unique(doc.graphs.filter((k) => k !== g), c.title + ' of ' + sr.name).slice(0, 80);
          g.figure.panels[0].legend.show = false;                              // one curve: its name is the title of the axis
          if (marked) g.figure.panels[0].series[0].unless = flag.id;          // the fits to check stay in the sheet and are left out of the curve, unless asked for
          M.log('Graph “' + g.name + '”: ' + c.title + ' against ' + (sr.variable.name || 'the files') + ', from the series “' + sr.name + '”' + (marked ? '; the ' + marked + ' file' + (marked > 1 ? 's' : '') + ' marked “to check” ' + (marked > 1 ? 'are' : 'is') + ' left out' : '') + '.');
          A().state.tab.graph = 'series'; A().refresh();
          if (marked) A().say(marked + ' file' + (marked > 1 ? 's' : '') + ' marked “to check” ' + (marked > 1 ? 'are' : 'is') + ' left out of this curve. Under Curves you can draw ' + (marked > 1 ? 'them' : 'it') + '.');
        }, 'cta', { disabled: busy }) : null,
        ui.btn('Plot all the files', () => { const g = M.overlayGraph(sr, plotting.shift); doc.view.graph = g.id; doc.view.main = 'graph'; A().state.tab.graph = 'series'; M.log('Graph “' + g.name + '”: the ' + rows.length + ' files of the series, coloured along ' + (sr.variable.name ? sr.variable.name.toLowerCase() : 'their order') + (plotting.shift ? ', each shifted by ' + plotting.shift : '') + '.'); A().refresh(); }, '', { disabled: busy || rows.length < 2 }),
        h('input', { class: 'inp num', type: 'text', inputmode: 'decimal', style: 'width:9ch', placeholder: 'shift', title: 'Shift each file up by this much from the one before, to stack them', 'aria-label': 'Shift between files', onchange: (e) => { const v = ASY.parseNum(e.target.value); plotting.shift = isNaN(v) ? 0 : v; } })),
      h('div', { style: 'overflow-x:auto' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, sr.variable.name ? sr.variable.name + (sr.variable.unit ? ' (' + sr.variable.unit + ')' : '') : '#'), h('th', {}, 'File'), h('th', {}, ''),
        shown.map((n) => h('th', { class: 'num' }, n)), h('th', { class: 'num' }, 'Reduced χ²'), h('th', { class: 'num' }, 'R²'), h('th', {}, 'To check'))),
        h('tbody', {}, rows.map((m, i) => {
          const s = M.sheet(m.sheet), r = m.result, by = {}; if (r) r.params.forEach((q) => { by[q.name] = q; });
          return h('tr', { class: 'pick' + (m.sheet === sr.current && doc.view.graph === sr.graph ? ' on' : ''), title: 'Show this file with its fit', onclick: () => show(sr, m.sheet) },
            h('td', { class: 'num' }, m.value == null ? String(i + 1) : ASY.fmt(m.value, 7)), h('td', {}, s ? s.name : 'gone'),
            h('td', {}, h('span', { class: 'pdot ' + (m.state === 'running' ? 'running' : m.state === 'failed' ? 'failed' : m.state === 'done' ? (r && r.warnings.length ? 'stale' : 'done') : '') })),
            shown.map((n) => h('td', { class: 'num' }, by[n] && by[n].value != null ? (by[n].stderr != null ? ASY.pm(by[n].value, by[n].stderr) : ASY.fmt(by[n].value, 6)) : '')),
            h('td', { class: 'num' }, r ? ASY.fmt(r.redchi, 4) : ''), h('td', { class: 'num' }, r ? ASY.fmt(r.rsquared, 5) : ''),
            h('td', { class: 'muted', style: 'white-space:normal;min-width:22ch' }, m.state === 'failed' ? m.message : r && r.warnings.length ? r.warnings[0] + (r.warnings.length > 1 ? ' (+' + (r.warnings.length - 1) + ')' : '') : ''));
        })))),
      results ? h('p', { class: 'say' }, 'Every parameter and derived quantity, with its uncertainty, is in the sheet ', h('b', {}, results.name), ': plot any of them, or fit one in its turn.') : h('p', { class: 'say' }, 'Not fitted yet.'),
    ];
  }

  ASY.seriespanel = { section, dialog, run, show, open, dock, room };
})(window.ASY);
