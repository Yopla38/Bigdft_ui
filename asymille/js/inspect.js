/* The right-hand column: what is selected, and its settings. A sheet shows its columns and the
 * operations; a graph shows its series, its axes, its page and its notes (fitpanel.js draws the fit).
 *
 * A control changes the project at once and the figure follows; the inspector itself is drawn
 * again only when what it lists changed (a series added, another tab), so that typing in one
 * field and moving to the next never loses the place. `ASY.ui` is the small set of controls. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, M = ASY.model, P = ASY.plot;
  const A = () => ASY.app;

  // ------------------------------------------------------------------ controls bound to a field of the project
  const folds = {};                 // the parts a person opened or closed, for this visit
  const done = (opt) => { if (opt && opt.then) opt.then(); if (opt && opt.structural) A().refresh(); else A().touch(); };
  const ui = ASY.ui = {
    field: (label, control, hint) => h('label', { class: 'field2' }, h('span', {}, label), control, hint ? h('small', {}, hint) : null),
    txt(obj, key, opt) {
      opt = opt || {};
      return h(opt.area ? 'textarea' : 'input', { type: opt.area ? null : 'text', class: 'inp', value: obj[key] == null ? '' : obj[key], placeholder: opt.placeholder, maxlength: opt.max || 400, spellcheck: 'false', rows: opt.area ? 2 : null,
        onchange: (e) => { obj[key] = e.target.value; done(opt); } });
    },
    num(obj, key, opt) {
      opt = opt || {};
      return h('input', { type: 'text', inputmode: 'decimal', class: 'inp num', value: obj[key] == null ? '' : String(obj[key]), placeholder: opt.placeholder || (opt.nullable ? 'auto' : ''),
        onchange: (e) => {
          const raw = e.target.value.trim(); let v = raw === '' ? null : ASY.parseNum(raw);
          if (v === null && !opt.nullable) { e.target.value = obj[key]; return; }
          if (v !== null && isNaN(v)) { e.target.value = obj[key] == null ? '' : obj[key]; A().say('“' + raw + '” is not a number', true); return; }
          if (v !== null) { if (opt.min != null) v = Math.max(opt.min, v); if (opt.max != null) v = Math.min(opt.max, v); if (opt.int) v = Math.round(v); }
          obj[key] = v; e.target.value = v == null ? '' : String(v); done(opt);
        } });
    },
    sel(obj, key, options, opt) {
      opt = opt || {};
      const current = obj[key] == null ? '' : String(obj[key]);
      const option = (o) => h('option', { value: o[0] == null ? '' : o[0], selected: String(o[0] == null ? '' : o[0]) === current }, o[1]);
      return h('select', { class: 'inp', onchange: (e) => { const v = e.target.value; obj[key] = v === '' && opt.nullable ? null : opt.number ? Number(v) : v; done(opt); } },
        options.map((o) => (o.group ? h('optgroup', { label: o.group }, o.options.map(option)) : option(o))));
    },
    chk: (obj, key, label, opt) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opt && opt.invert ? !obj[key] : obj[key] !== false && !!obj[key], onchange: (e) => { obj[key] = opt && opt.invert ? !e.target.checked : e.target.checked; done(opt); } }), label),
    col: (obj, key, opt) => h('input', { type: 'color', value: obj[key] || '#000000', 'aria-label': 'Colour', oninput: (e) => { obj[key] = e.target.value; A().redrawMain(); }, onchange: (e) => { obj[key] = e.target.value; done(opt); } }),
    /* A part of a panel that opens and closes. What a person opened or closed stays so while the page is drawn again around it:
       `open` is only how it starts. `key` tells apart two parts of the same title. */
    sec: (title, hint, open, ...kids) => ui.fold('sec', title, title, hint, open, kids),
    fold(cls, key, title, hint, open, kids) {
      const v = M.doc.view, k = v.main + '/' + (A().state.tab[v.main === 'graph' ? 'graph' : 'sheet']) + '/' + key;
      const el = h('details', { class: cls, open: k in folds ? folds[k] : open }, h('summary', { onclick: () => { folds[k] = !el.open; } }, title, hint == null ? null : h('span', {}, hint || '')), h('div', {}, kids));
      return el;
    },
    btn: (label, act, cls, attrs) => h('button', Object.assign({ class: 'btn small' + (cls ? ' ' + cls : ''), type: 'button', onclick: act }, attrs || {}), label),
  };
  const columnOptions = (s, opt) => (opt && opt.none ? [[null, opt.none]] : []).concat(s ? s.columns.map((c) => [c.id, c.name + (c.title ? ' · ' + c.title : '')]) : []);
  const sheetOptions = () => M.doc.sheets.map((s) => [s.id, s.name]);

  // ------------------------------------------------------------------ a graph: its series
  function seriesName(r) {
    const d = M.seriesData(r);
    if (r.label) return P.plain(r.label);
    if (r.kind === 'member') return 'Fit of the file shown';
    if (r.kind === 'fit') { const f = M.fit(r.fit); return (r.part === 'total' ? 'Fit' : r.part === 'band' ? 'Confidence band' : r.part === 'residuals' ? 'Residuals' : r.part) + (f ? ' · ' + f.name : ''); }
    return d ? d.label : 'missing data';
  }
  function seriesTab(g) {
    const st = A().state, fig = g.figure, panel = fig.panels.find((p) => p.id === st.panel) || fig.panels[0];
    const sel = panel.series.find((r) => r.id === st.series) || panel.series[0] || null;
    const pick = { sheet: (M.sheet(M.doc.view.sheet) || M.doc.sheets[0] || {}).id, y: null };
    const yChoice = h('span', {});
    const drawPick = () => { const s = M.sheet(pick.sheet); const ys = s ? s.columns.filter((c) => c.role === 'y') : []; pick.y = ys.length ? ys[0].id : s && s.columns.length ? s.columns[0].id : null; ASY.fill(yChoice, ui.sel(pick, 'y', columnOptions(s), { then: () => {}, structural: false })); };
    drawPick();
    const out = [];
    if (fig.panels.length > 1) out.push(ui.field('Panel', ui.sel(st, 'panel', fig.panels.map((p, i) => [p.id, 'Panel ' + String.fromCharCode(97 + i) + (p.title ? ' · ' + p.title : '')]), { structural: true })));
    out.push(h('div', { class: 'slist' }, panel.series.length ? panel.series.map((r) => h('button', { class: 'srow', type: 'button', 'aria-pressed': String(sel === r), onclick: () => { st.series = r.id; A().refresh(); } },
      h('i', { style: 'background:' + r.color + (r.show === false ? ';opacity:.25' : '') }), h('span', {}, seriesName(r)), h('small', {}, r.show === false ? 'hidden' : P.TYPES[r.type] || (r.type === 'band' ? 'Band' : r.type)))) : h('p', { class: 'empty' }, 'Nothing is drawn in this panel yet.')));
    if (sel) {
      const s = M.sheet(sel.sheet);
      const move = (d) => { const i = panel.series.indexOf(sel), j = i + d; if (j < 0 || j >= panel.series.length) return; panel.series.splice(i, 1); panel.series.splice(j, 0, sel); A().refresh(); };
      out.push(ui.sec(seriesName(sel), sel.kind === 'fit' || sel.kind === 'member' ? 'a curve of a fit' : sel.follow ? 'the file a series shows' : 'data', true,
        ui.field('Name in the legend', ui.txt(sel, 'label', { placeholder: seriesName(Object.assign({}, sel, { label: '' })), structural: true }), 'Write E_{F}, cm^{-1}, \\alpha for subscripts, superscripts and Greek letters.'),
        sel.kind === 'data' ? h('div', { class: 'cols2' },
          ui.field('X', ui.sel(sel, 'x', columnOptions(s, { none: 'row number' }), { nullable: true })), ui.field('Y', ui.sel(sel, 'y', columnOptions(s), { structural: true })),
          ui.field('Y error', ui.sel(sel, 'yerr', columnOptions(s, { none: 'none' }), { nullable: true })), ui.field('X error', ui.sel(sel, 'xerr', columnOptions(s, { none: 'none' }), { nullable: true }))) : null,
        sel.type === 'band' ? null : h('div', { class: 'cols2' },
          ui.field('Drawn as', ui.sel(sel, 'type', Object.entries(P.TYPES), { structural: true })),
          ui.field('Axis', ui.sel(sel, 'axis', [['y', 'left'], ['y2', 'right']], { then: () => { if (sel.axis === 'y2' && !panel.y2) panel.y2 = P.axis(); }, structural: true }))),
        h('div', { class: 'cols2' },
          ui.field('Colour', h('div', { class: 'row2' }, ui.col(sel, 'color', { structural: true }), ui.txt(sel, 'color', { max: 7, structural: true }))),
          ui.field('Opacity', ui.num(sel, 'opacity', { min: 0.05, max: 1 }))),
        sel.kind === 'data' && s && s.columns.some((c) => c.made && c.made.key === 'check') ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!sel.unless,
          onchange: (e) => { sel.unless = e.target.checked ? s.columns.find((c) => c.made && c.made.key === 'check').id : null; A().touch(); } }), 'Leave out the files marked “to check”') : null,
        sel.kind === 'data' ? ui.field('Shifted up by', ui.num(sel, 'shift', { nullable: true, placeholder: 'not shifted' }), 'Added to y, in its unit: to stack curves one above the other.') : null,
        sel.type === 'line' || sel.type === 'both' || sel.type === 'steps' || sel.type === 'area' ? h('div', { class: 'cols2' },
          ui.field('Line width (pt)', ui.num(sel, 'width', { nullable: true, min: 0.1, max: 10, placeholder: 'of the page' })),
          ui.field('Line', ui.sel(sel, 'dash', [['solid', 'solid'], ['dash', 'dashed'], ['dot', 'dotted'], ['dashdot', 'dash-dot'], ['long', 'long dashes']]))) : null,
        sel.type === 'scatter' || sel.type === 'both' ? h('div', { class: 'cols3' },
          ui.field('Symbol', ui.sel(sel, 'marker', [['circle', 'circle'], ['square', 'square'], ['triangle', 'triangle'], ['down', 'triangle down'], ['diamond', 'diamond'], ['cross', 'cross'], ['plus', 'plus']])),
          ui.field('Size (pt)', ui.num(sel, 'size', { min: 0.5, max: 30 })), ui.field('Filled', ui.sel(sel, 'open', [['false', 'filled'], ['true', 'open']], { then: () => { sel.open = sel.open === 'true' || sel.open === true; } }))) : null,
        h('div', { class: 'cols2' }, ui.chk(sel, 'show', 'Drawn', { structural: true }), sel.type === 'band' ? null : ui.chk(sel, 'legend', 'In the legend')),
        h('div', { class: 'acts' }, ui.btn('Draw earlier', () => move(-1)), ui.btn('Draw later', () => move(1)), ui.btn('Remove', () => { panel.series = panel.series.filter((r) => r !== sel); st.series = null; A().refresh(); }, 'danger'))));
    }
    out.push(ui.sec('Add data to this panel', '', !panel.series.length,
      ui.field('Sheet', ui.sel(pick, 'sheet', sheetOptions(), { then: drawPick, structural: false })), ui.field('Y column', yChoice),
      h('div', { class: 'acts' }, ui.btn('Add', () => { const s = M.sheet(pick.sheet), y = M.column(s, pick.y); if (!y) return A().say('Choose a column first', true); st.series = M.addData(g, panel, s, y, { type: M.rows(s) > 60 ? 'line' : 'scatter' }).id; A().refresh(); }, 'cta'))));
    return out;
  }

  // ------------------------------------------------------------------ a graph: its axes and legend
  function axisFields(ax, name) {
    const moved = !!(ax.labelDx || ax.labelDy);
    return [ui.field('Title', ui.txt(ax, 'label', { placeholder: 'e.g. Energy (eV)' }), 'Double-click it on the figure to rewrite it there; drag it to move it.'),
      h('div', { class: 'cols3' }, ui.field('Size of the title (pt)', ui.num(ax, 'labelSize', { nullable: true, min: 3, max: 60, placeholder: 'of the page' })),
        ui.field('Size of the numbers (pt)', ui.num(ax, 'tickSize', { nullable: true, min: 3, max: 40, placeholder: 'of the page' })),
        ui.field('Decimals', ui.num(ax, 'decimals', { nullable: true, min: 0, max: 10, int: true }))),
      h('div', { class: 'cols3' }, ui.chk(ax, 'labelBold', 'Title in bold'), ui.chk(ax, 'labelItalic', 'Title in italic'),
        moved ? ui.btn('Put the title back', () => { ax.labelDx = ax.labelDy = null; A().refresh(); }, '', { title: 'It was dragged on the figure: back to its place under or beside the axis' }) : h('span', {})),
      h('div', { class: 'cols3' }, ui.field('From', ui.num(ax, 'min', { nullable: true })), ui.field('To', ui.num(ax, 'max', { nullable: true })), ui.field('Step', ui.num(ax, 'step', { nullable: true, min: 0 }))),
      h('div', { class: 'cols3' }, ui.field('Scale', ui.sel(ax, 'scale', [['linear', 'linear'], ['log', 'logarithmic']])), ui.chk(ax, 'grid', 'Grid lines'), ui.chk(ax, 'reverse', 'Reversed')),
      ui.fold('own-axis', 'own-axis:' + name, 'Ticks, colour and grid of this axis', null, ['tickDir', 'tickLen', 'tickWidth', 'color', 'gridColor', 'gridDash'].some((k) => ax[k] != null && ax[k] !== 'solid') || ax.minor === false, [
        h('div', { class: 'cols3' },
          ui.field('Ticks point', ui.sel(ax, 'tickDir', [[null, 'as the page says'], ['in', 'inwards'], ['out', 'outwards'], ['both', 'both ways'], ['none', 'no ticks']], { nullable: true })),
          ui.field('Tick length (pt)', ui.num(ax, 'tickLen', { nullable: true, min: 0.5, max: 20, placeholder: 'of the page' })),
          ui.field('Tick width (pt)', ui.num(ax, 'tickWidth', { nullable: true, min: 0.1, max: 6, placeholder: 'of the page' }))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ax.minor !== false, onchange: (e) => { ax.minor = e.target.checked; A().touch(); } }), 'Small ticks between the numbered ones'),
        h('div', { class: 'cols2' },
          ui.field('Colour of the axis', h('div', { class: 'row2' }, ui.col(ax, 'color'), h('span', { class: 'muted' }, 'its line, ticks, numbers and title'))),
          ui.field('Grid', h('div', { class: 'row2' }, h('input', { type: 'color', value: ax.gridColor || '#d0d0d0', 'aria-label': 'Colour of the grid', oninput: (e) => { ax.gridColor = e.target.value; A().redrawMain(); }, onchange: (e) => { ax.gridColor = e.target.value; A().touch(); } }),
            ui.sel(ax, 'gridDash', [[null, 'solid'], ['dash', 'dashed'], ['dot', 'dotted'], ['dashdot', 'dash-dot']], { nullable: true }))))]),
      h('div', { class: 'acts' }, ui.btn('Show all the data', () => { ax.min = ax.max = ax.step = null; A().refresh(); }, '', { title: 'Back to an automatic range for the ' + name + ' axis' }))];
  }
  function axesTab(g) {
    const st = A().state, fig = g.figure, panel = fig.panels.find((p) => p.id === st.panel) || fig.panels[0];
    const cat = A().catalogue;
    return [fig.panels.length > 1 ? ui.field('Panel', ui.sel(st, 'panel', fig.panels.map((p, i) => [p.id, 'Panel ' + String.fromCharCode(97 + i)]), { structural: true })) : null,
      ui.sec('Type', fig.font, false,
        ui.field('Font of the figure', ui.sel(fig, 'font', (cat ? cat.fonts.map((f) => [f.name, f.name]) : [['Arial', 'Arial']]), { structural: true }), 'One font for the whole figure: journals ask for it. Each axis has its own sizes, below.'),
        h('div', { class: 'cols3' }, ui.field('Axis titles (pt)', ui.num(fig.size, 'label', { min: 3, max: 40 })), ui.field('Numbers (pt)', ui.num(fig.size, 'tick', { min: 3, max: 40 })), ui.field('Legend (pt)', ui.num(fig.size, 'legend', { min: 3, max: 40 }))),
        h('p', { class: 'muted' }, 'The sizes of the page, for every axis that does not say its own.')),
      ui.sec('Title above the panel', P.plain(panel.title) || 'none', !!panel.title,
        ui.field('Text', ui.txt(panel, 'title', { structural: true }), 'E_{F}, cm^{-1}, \\alpha …'),
        h('div', { class: 'cols3' }, ui.field('Size (pt)', ui.num(panel, 'titleSize', { nullable: true, min: 3, max: 60, placeholder: 'of the page' })),
          ui.field('Placed', ui.sel(panel, 'titleAlign', [[null, 'in the middle'], ['left', 'on the left'], ['right', 'on the right']], { nullable: true })),
          ui.field('Colour', ui.col(panel, 'titleColor'))),
        ui.chk(panel, 'titleBold', 'Bold'), h('p', { class: 'muted' }, 'A figure has one font (Page): journals ask for it.')),
      ui.sec('X axis', P.plain(panel.x.label), true, axisFields(panel.x, 'x')),
      ui.sec('Y axis', P.plain(panel.y.label), true, axisFields(panel.y, 'y')),
      ui.sec('Second Y axis, on the right', panel.y2 ? P.plain(panel.y2.label) : 'none', !!panel.y2,
        panel.y2 ? [axisFields(panel.y2, 'right'), h('div', { class: 'acts' }, ui.btn('Remove this axis', () => { panel.y2 = null; panel.series.forEach((r) => { r.axis = 'y'; }); A().refresh(); }, 'danger'))]
          : h('div', { class: 'acts' }, ui.btn('Add a second Y axis', () => { panel.y2 = P.axis(); A().refresh(); }), h('span', { class: 'muted' }, 'Then choose “right” as the axis of a series.'))),
      ui.sec('Legend', panel.legend.show === false ? 'hidden' : '', false,
        ui.chk(panel.legend, 'show', 'Shown'), ui.chk(panel.legend, 'frame', 'In a frame'),
        ui.field('Place', ui.sel(panel.legend, 'pos', [['ne', 'top right'], ['nw', 'top left'], ['se', 'bottom right'], ['sw', 'bottom left'], ['n', 'top'], ['s', 'bottom'], ['e', 'right'], ['w', 'left'], ['out', 'outside, on the right'], ['custom', 'where it was dragged']]), 'Or drag it on the figure. Double-click a name in it to rewrite it there.'))];
  }

  // ------------------------------------------------------------------ a graph: its page
  function applyJournal(fig, preset) {
    Object.assign(fig, { width: preset.width, height: preset.height, font: preset.font, journal: preset.id });
    Object.assign(fig.size, { label: preset.label_size, tick: preset.tick_size, legend: preset.tick_size, title: preset.label_size, tag: preset.label_size + 1 });
    Object.assign(fig.stroke, { axis: preset.stroke, line: preset.line, grid: Math.max(0.25, preset.stroke * 0.7), error: preset.stroke });
    fig.tick.len = Math.max(2, preset.tick_size * 0.4);
    fig.panels.forEach((p) => p.series.forEach((r) => { if (r.type !== 'band') r.size = Math.max(1.5, preset.tick_size * 0.4); }));
  }
  /* The formats a person kept: on the server, under their account, when there is one; in this browser otherwise. Read once, then kept in step here. */
  const kept = { list: null, loading: false, error: '', name: '', pick: '' };
  const onServer = () => !!A().catalogue;
  async function loadFormats() {
    if (kept.loading) return;
    kept.loading = true;
    try { kept.list = onServer() ? await window.OND.api.get('asymille/formats') : JSON.parse(localStorage.getItem('asymille.formats') || '[]'); kept.error = ''; }
    catch (e) { kept.list = []; kept.error = e.message || String(e); }
    kept.loading = false; A().redrawAll();
  }
  async function keepFormat(fig) {
    const name = kept.name.trim().slice(0, 60);
    if (!name) return A().say('Give the format a name', true);
    const format = P.formatOf(fig), had = kept.list.find((f) => f.name === name);
    try {
      let row;
      if (onServer()) row = await window.OND.api.put('asymille/formats', { name, format });
      else { row = { id: had ? had.id : 'l' + Date.now(), name, format }; localStorage.setItem('asymille.formats', JSON.stringify(kept.list.filter((f) => f.name !== name).concat([row]))); }
      kept.list = kept.list.filter((f) => f.name !== name).concat([row]).sort((a, b) => a.name.localeCompare(b.name));
      kept.pick = String(row.id); kept.name = '';
      A().say(had ? '“' + name + '” now holds the format of this graph' : 'Kept as “' + name + '”'); A().redrawAll();
    } catch (e) { A().say(e.message, true); }
  }
  async function dropFormat(f) {
    try {
      if (onServer()) await window.OND.api.del('asymille/formats/' + f.id);
      kept.list = kept.list.filter((k) => k !== f); kept.pick = '';
      if (!onServer()) localStorage.setItem('asymille.formats', JSON.stringify(kept.list));
      A().say('“' + f.name + '” is no longer kept'); A().redrawAll();
    } catch (e) { A().say(e.message, true); }
  }
  function formatsSection(g) {
    const fig = g.figure;
    if (kept.list === null) { loadFormats(); return ui.sec('My formats', '…', false, h('p', { class: 'say' }, 'Reading the formats you kept…')); }
    const chosen = kept.list.find((f) => String(f.id) === kept.pick) || kept.list[0] || null;
    return ui.sec('My formats', kept.list.length ? kept.list.length + ' kept' : 'none yet', kept.list.length > 0,
      h('p', { class: 'say' }, 'The size, the type, the lines, the ticks and the colours of a graph, kept under a name of yours and given to other graphs' + (onServer() ? ', in any of your projects.' : '. Without a server they are kept in this browser only.')),
      kept.error ? h('div', { class: 'notice' }, 'The formats could not be read: ' + kept.error) : null,
      kept.list.length ? [ui.field('Give this graph the format', ui.sel(kept, 'pick', kept.list.map((f) => [String(f.id), f.name + (f.format && f.format.width ? ' · ' + f.format.width + ' × ' + f.format.height + ' mm' : '')]), { then: () => {}, structural: true })),
        h('div', { class: 'acts' }, ui.btn('Apply it', () => { P.applyFormat(fig, chosen.format); M.log('Graph “' + g.name + '”: the format “' + chosen.name + '” was given to it.'); A().refresh(); A().say('“' + chosen.name + '” applied'); }, 'cta', { id: 'format-apply' }),
          ui.btn('Delete it', () => dropFormat(chosen), 'danger', { title: 'It is no longer kept. The graphs that took it stay as they are' }))] : null,
      ui.field('Keep the format of this graph as', h('input', { class: 'inp', type: 'text', id: 'format-name', maxlength: 60, value: kept.name, placeholder: 'e.g. PRB single column, my thesis', oninput: (e) => { kept.name = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); keepFormat(fig); } } }), 'A name already used is given the format of this graph.'),
      h('div', { class: 'acts' }, ui.btn('Keep it', () => keepFormat(fig), '', { id: 'format-keep' })));
  }
  function pageTab(g) {
    const fig = g.figure, cat = A().catalogue, presets = cat ? cat.journals.presets : [], chosen = { id: fig.journal || '' };
    const groups = []; presets.forEach((p) => { let grp = groups.find((x) => x.group === p.publisher); if (!grp) groups.push(grp = { group: p.publisher, options: [] }); grp.options.push([p.id, p.label + ' · ' + p.width + ' mm']); });
    const preset = presets.find((p) => p.id === fig.journal);
    const fontNote = cat && cat.fonts.find((f) => f.name === fig.font);
    return [
      ui.sec('For a journal', preset ? preset.publisher : '', true,
        ui.field('Size and type of', ui.sel(chosen, 'id', [['', 'my own size']].concat(groups), { then: () => { const p = presets.find((x) => x.id === chosen.id); if (p) applyJournal(fig, p); else fig.journal = null; }, structural: true }),
          preset ? (preset.note ? preset.note + ' ' : '') + 'Page of the journal: ' + preset.max_height + ' mm high at most. Widths are ' + cat.journals.checked + ': check the journal’s guide before submitting.' : 'Sets the width, the type and the line widths. Your data and your choices of colours stay.'),
        h('div', { class: 'cols2' }, ui.field('Width (mm)', ui.num(fig, 'width', { min: 20, max: 500, then: () => { fig.journal = fig.journal && preset && preset.width === fig.width ? fig.journal : null; }, structural: true })), ui.field('Height (mm)', ui.num(fig, 'height', { min: 15, max: 500, structural: true })))),
      formatsSection(g),
      ui.sec('Type', fig.font, false,
        ui.field('Font', ui.sel(fig, 'font', (cat ? cat.fonts.map((f) => [f.name, f.name]) : [['Arial', 'Arial']]), { structural: true }), fontNote && fontNote.note ? 'In a file made by the server: ' + fontNote.note : null),
        h('div', { class: 'cols3' }, ui.field('Axis titles (pt)', ui.num(fig.size, 'label', { min: 3, max: 40 })), ui.field('Numbers (pt)', ui.num(fig.size, 'tick', { min: 3, max: 40 })), ui.field('Legend (pt)', ui.num(fig.size, 'legend', { min: 3, max: 40 }))),
        h('div', { class: 'cols3' }, ui.field('Panel titles (pt)', ui.num(fig.size, 'title', { min: 3, max: 60 })), ui.field('Panel letters (pt)', ui.num(fig.size, 'tag', { min: 3, max: 60 })), h('span', {}))),
      ui.sec('Lines and ticks', '', false,
        h('div', { class: 'cols3' }, ui.field('Axes (pt)', ui.num(fig.stroke, 'axis', { min: 0.1, max: 6 })), ui.field('Curves (pt)', ui.num(fig.stroke, 'line', { min: 0.1, max: 10 })), ui.field('Error bars (pt)', ui.num(fig.stroke, 'error', { min: 0.1, max: 6 }))),
        h('div', { class: 'cols3' }, ui.field('Grid (pt)', ui.num(fig.stroke, 'grid', { min: 0.1, max: 6 })), h('span', {}), h('span', {})),
        h('p', { class: 'muted' }, 'For every axis. An axis can have its own ticks, numbers, colour and grid: under Axes.'),
        h('div', { class: 'cols2' }, ui.field('Ticks point', ui.sel(fig.tick, 'dir', [['in', 'inwards'], ['out', 'outwards'], ['both', 'both ways'], ['none', 'no ticks']])), ui.field('Tick length (pt)', ui.num(fig.tick, 'len', { min: 0.5, max: 20 }))),
        h('div', { class: 'cols2' }, ui.field('Frame', ui.sel(fig, 'frame', [['box', 'a box'], ['open', 'left and bottom only']])), ui.chk(fig.tick, 'mirror', 'Ticks on the top and right too'))),
      ui.sec('Colours', fig.palette, false,
        ui.field('Palette of the data', ui.sel(fig, 'palette', [['okabe', 'Okabe–Ito: safe for colour-blind readers'], ['tol', 'Paul Tol, bright'], ['classic', 'Classic: black, red, blue…'], ['grey', 'Greys, for print']], { then: () => { const pal = P.PALETTES[fig.palette]; fig.panels.forEach((p) => { let i = 0; p.series.forEach((r) => { if (r.kind === 'data') r.color = pal[i++ % pal.length]; }); }); }, structural: true }), 'Choosing a palette recolours the data series.'),
        ui.field('Paper', h('div', { class: 'row2' }, ui.col(fig, 'background'), h('span', { class: 'muted' }, 'white for a journal')))),
      ui.sec('Panels', fig.panels.length + (fig.panels.length > 1 ? ' panels' : ' panel'), false,
        h('div', { class: 'cols2' }, ui.field('Columns', ui.num(fig.layout, 'cols', { min: 1, max: 6, int: true })), ui.field('Letters', ui.sel(fig, 'tags', [['none', 'none'], ['(a)', '(a) (b)'], ['a', 'a b'], ['A', 'A B']]))),
        ui.chk(fig.layout, 'shareX', 'Stacked panels share their x axis'),
        ui.field('Heights of the rows', h('input', { class: 'inp', type: 'text', value: (fig.layout.ratios || []).join(' : '), placeholder: 'equal, or 3 : 1', onchange: (e) => { fig.layout.ratios = e.target.value.split(/[:\s,;]+/).map(Number).filter((v) => v > 0).slice(0, 12); A().touch(); } })),
        h('div', { class: 'acts' }, ui.btn('Add a panel', () => { const p = P.panel(M.id('p')); fig.panels.push(p); A().state.panel = p.id; A().refresh(); }),
          fig.panels.length > 1 ? ui.btn('Remove the last panel', () => { fig.panels.pop(); if (fig.panels.length === 1) { fig.layout.ratios = []; fig.layout.shareX = false; } A().refresh(); }, 'danger') : null)),
      ui.sec('Style', 'from one graph to another', false,
        h('p', { class: 'say' }, 'The size, the type, the lines and the ticks of this graph can be given to another, so that the figures of a paper look alike.'),
        h('div', { class: 'acts' }, ui.btn('Copy the style', () => { A().style = P.formatOf(fig); try { localStorage.setItem('asymille.style', JSON.stringify(A().style)); } catch (e) { /* kept for this visit only */ } A().say('Style copied: open another graph and paste it'); }),
          ui.btn('Paste the style', () => { let style = A().style; try { style = style || JSON.parse(localStorage.getItem('asymille.style')); } catch (e) { /* none */ } if (!style) return A().say('Copy the style of a graph first', true); P.applyFormat(fig, style); A().refresh(); }))),
    ];
  }

  // ------------------------------------------------------------------ a graph: its notes
  const NOTES = { text: 'Text', arrow: 'Arrow', line: 'Line', vline: 'Vertical line', hline: 'Horizontal line', span: 'Highlighted range of x' };
  function notesTab(g) {
    const st = A().state, fig = g.figure, panel = fig.panels.find((p) => p.id === st.panel) || fig.panels[0], hp = (A().hit() || []).find((q) => q.id === panel.id);
    const mid = (r, f) => (r ? Number((r[0] + (r[1] - r[0]) * f).toPrecision(4)) : f);
    const add = (type) => {
      const xr = hp ? hp.xr : null, yr = hp ? hp.yr : null, n = { id: M.id('n'), type, color: '#000000' };
      if (type === 'text') Object.assign(n, { x: mid(xr, 0.1), y: mid(yr, 0.9), text: 'Text', size: fig.size.label, coords: 'data' });
      else if (type === 'vline') Object.assign(n, { x: mid(xr, 0.5), width: 0.8, dash: 'dash' });
      else if (type === 'hline') Object.assign(n, { y: mid(yr, 0.5), width: 0.8, dash: 'dash' });
      else if (type === 'span') Object.assign(n, { x: mid(xr, 0.4), x2: mid(xr, 0.6), color: '#e69f00', opacity: 0.18 });
      else Object.assign(n, { x: mid(xr, 0.3), y: mid(yr, 0.8), x2: mid(xr, 0.5), y2: mid(yr, 0.6), width: 0.8, coords: 'data' });
      panel.notes.push(n); st.note = n.id; A().refresh();
    };
    return [fig.panels.length > 1 ? ui.field('Panel', ui.sel(st, 'panel', fig.panels.map((p, i) => [p.id, 'Panel ' + String.fromCharCode(97 + i)]), { structural: true })) : null,
      h('div', { class: 'acts', style: 'padding:10px 0' }, Object.entries(NOTES).map(([type, label]) => ui.btn('+ ' + label, () => add(type)))),
      h('p', { class: 'empty' }, panel.notes.length ? 'Drag one on the figure to move it; an arrow or a line is also taken by one of its ends. Double-click a text to rewrite it.' : 'A text, an arrow, a line marking a value, a highlighted range. Each can then be dragged on the figure.'),
      panel.notes.map((n) => h('div', { class: 'act' + (st.note === n.id ? ' on' : '') },
        h('div', { class: 'act-head' }, h('b', {}, NOTES[n.type]), ui.btn('Remove', () => { panel.notes = panel.notes.filter((k) => k !== n); A().refresh(); }, 'danger')),
        n.type === 'text' ? [ui.field('Text', (() => { const el = ui.txt(n, 'text', { area: true, max: 4000, structural: true, then: () => { n.fit = null; n.of = null; } }); el.rows = Math.min(12, Math.max(2, String(n.text || '').split('\n').length)); return el; })(),
          n.fit && M.fit(n.fit) ? 'Written by the fit “' + M.fit(n.fit).name + '”, and written again each time it is run. Rewritten here, it is yours and the fit leaves it alone.' : 'E_{F}, cm^{-1}, \\alpha … One line under the other.'),
          h('div', { class: 'cols3' }, ui.field('x', ui.num(n, 'x')), ui.field('y', ui.num(n, 'y')), ui.field('Size (pt)', ui.num(n, 'size', { min: 3, max: 60 }))),
          h('div', { class: 'cols2' }, ui.field('Turned by (°)', ui.num(n, 'rotate', { nullable: true, min: -180, max: 180, placeholder: '0: level; 90: reads upwards' })), ui.chk(n, 'frame', 'In a frame, on white')),
          h('div', { class: 'cols2' }, ui.field('Placed in', ui.sel(n, 'coords', [['data', 'the units of the axes'], ['axes', 'fractions of the panel']], { then: () => { if (hp) { if (n.coords === 'axes') { n.x = 0.05; n.y = 0.92; } else { n.x = mid(hp.xr, 0.1); n.y = mid(hp.yr, 0.9); } } }, structural: true })), ui.chk(n, 'bold', 'Bold'))] : null,
        n.type === 'arrow' || n.type === 'line' ? h('div', { class: 'cols2' }, ui.field('From x', ui.num(n, 'x')), ui.field('From y', ui.num(n, 'y')), ui.field(n.type === 'arrow' ? 'To x (the head)' : 'To x', ui.num(n, 'x2')), ui.field('To y', ui.num(n, 'y2'))) : null,
        n.type === 'arrow' ? h('div', { class: 'cols2' }, ui.field('Size of the head (pt)', ui.num(n, 'head', { nullable: true, min: 1, max: 60, placeholder: 'from the width' })), ui.chk(n, 'both', 'A head at each end')) : null,
        n.type === 'vline' ? ui.field('At x', ui.num(n, 'x')) : null, n.type === 'hline' ? ui.field('At y', ui.num(n, 'y')) : null,
        n.type === 'span' ? h('div', { class: 'cols3' }, ui.field('From x', ui.num(n, 'x')), ui.field('To x', ui.num(n, 'x2')), ui.field('Opacity', ui.num(n, 'opacity', { min: 0.02, max: 1 }))) : null,
        h('div', { class: 'row2' }, ui.col(n, 'color'), n.type === 'text' || n.type === 'span' ? null : ui.num(n, 'width', { min: 0.1, max: 10, placeholder: 'width (pt)' }),
          n.type === 'text' || n.type === 'span' ? null : ui.sel(n, 'dash', [['solid', 'solid'], ['dash', 'dashed'], ['dot', 'dotted']])))),
    ];
  }

  // ------------------------------------------------------------------ a sheet: its columns
  /* Compute a column from what was typed. A formula of other columns is kept; one that names the column itself is applied once (model.applyOnce). */
  function compute(s, c, text) {
    const formula = String(text || '').trim();
    if (formula && M.namesItself(c, formula)) {
      try {
        const count = M.applyOnce(s, c, formula);
        M.log('Column ' + c.name + ' of “' + s.name + '” computed once as ' + c.name + ' = ' + formula + ' (' + count + ' numbers). The formula is not kept.');
        A().changedSheet(s); A().say(c.name + ' = ' + formula + ': applied once. The column holds the result; Undo brings back what it held.');
      } catch (e) { c.formula = formula; A().changedSheet(s); }          // the formula stays in the field with what is wrong with it
      return;
    }
    c.formula = formula;
    A().changedSheet(s);
    if (formula && !M.errors[c.id]) A().say(c.name + ' computed: ' + c.values.filter((v) => v != null).length + ' numbers');
  }
  function columnTab(s) {
    const picked = A().picked(), cols = picked.columns.map((id) => M.column(s, id)).filter(Boolean), c = cols[0];
    if (!c) return [h('p', { class: 'empty' }, 'Select a column: click its header.')];
    const ys = cols.filter((k) => k.role === 'y'), toPlot = ys.length ? ys : cols;
    const nums = M.numbers(c).filter(isFinite), mean = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
    const sd = nums.length > 1 ? Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1)) : NaN;
    const index = s.columns.indexOf(c), g = M.graph(M.doc.view.graph);
    const insert = (at) => { M.addColumn(s, {}, at); A().changedSheet(s, true); };
    return [
      ui.sec('Plot', toPlot.map((k) => k.name).join(', '), true,
        h('p', { class: 'say' }, toPlot.length > 1 ? toPlot.length + ' columns, each against the X column on its left.' : h('span', {}, h('b', {}, M.label(c)), ' against ', h('b', {}, M.label(M.xOf(s, c)) || 'the row number'), '.')),
        h('div', { class: 'acts' }, ui.btn('Symbols', () => A().plot(s, toPlot, 'scatter'), 'cta'), ui.btn('Line', () => A().plot(s, toPlot, 'line')), ui.btn('Line and symbols', () => A().plot(s, toPlot, 'both')), ui.btn('Bars', () => A().plot(s, toPlot, 'bars'))),
        g ? h('div', { class: 'acts', style: 'margin-top:8px' }, ui.btn('Add to “' + g.name + '”', () => { toPlot.forEach((y) => M.addData(g, g.figure.panels[0], s, y, { type: M.rows(s) > 60 ? 'line' : 'scatter' })); M.doc.view.main = 'graph'; A().refresh(); })) : null,
        h('div', { class: 'acts', style: 'margin-top:8px' }, ui.btn('Fit this column', () => A().fitColumn(s, toPlot[0]), '', { title: 'A fit of ' + M.label(toPlot[0]) + ', on a graph' }))),
      ui.sec('Column ' + c.name, M.label(c), true,
        h('div', { class: 'cols2' }, ui.field('Short name', ui.txt(c, 'name', { max: 24, then: () => { const clean = c.name.replace(/[^A-Za-z0-9_]/g, '').replace(/^[^A-Za-z]+/, '').slice(0, 24); c.name = clean && !s.columns.some((k) => k !== c && k.name === clean) && clean !== 'i' && clean !== 'n' && clean !== 'x' && !ASY.expr.WORDS.includes(clean) && !ASY.expr.FUNCTIONS[clean] && !ASY.expr.AGGREGATES[clean] && !(clean in ASY.expr.CONSTANTS) ? clean : M.freeName({ columns: s.columns.filter((k) => k !== c) }); M.recompute(s); }, structural: true }), 'What formulas call it.'),
          ui.field('Used as', ui.sel(c, 'role', [['x', 'X'], ['y', 'Y'], ['yerr', 'error on Y'], ['xerr', 'error on X'], ['label', 'labels'], ['none', 'not plotted']], { structural: true }))),
        h('div', { class: 'cols2' }, ui.field('Title', ui.txt(c, 'title', { max: 120, placeholder: 'Energy', structural: true })), ui.field('Unit', ui.txt(c, 'unit', { max: 40, placeholder: 'eV', structural: true }))),
        ui.field('Comment', ui.txt(c, 'comment', { area: true, max: 2000 })),
        h('div', { class: 'acts' }, ui.btn('Insert before', () => insert(index)), ui.btn('Insert after', () => insert(index + 1)),
          ui.btn('Delete', () => { cols.forEach((k) => M.removeColumn(s, k.id)); A().changedSheet(s, true); }, 'danger', { disabled: s.columns.length <= cols.length }))),
      ui.sec('Compute this column', c.formula ? '= ' + c.formula.slice(0, 28) : 'a formula', !!c.formula || !nums.length,
        ui.field('Formula', (() => {
          const field = h('textarea', { class: 'inp', id: 'column-formula', rows: 2, maxlength: 2000, spellcheck: 'false', value: c.formula || '', placeholder: 'e.g. ' + (s.columns[0] && s.columns[0] !== c ? s.columns[0].name : 'A') + '*1000   or   sqrt(B)   or   i - 1',
            onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); compute(s, c, field.value); } } });
          return [field, h('div', { class: 'acts', style: 'margin-top:6px' }, ui.btn('Compute', () => compute(s, c, field.value), 'cta', { id: 'column-compute', title: 'Compute the column from this formula (Enter in the field does the same)' }),
            c.formula ? ui.btn('Keep the numbers, drop the formula', () => { c.formula = ''; M.log('Column ' + c.name + ' of “' + s.name + '” keeps its numbers; its formula was dropped.'); A().changedSheet(s); }, '', { title: 'The column stops following the columns it was computed from' }) : null)];
        })(),
          M.errors[c.id] ? null : h('span', {}, 'Columns by their short name; ', h('code', {}, 'i'), ' is the row, ', h('code', {}, 'n'), ' the number of rows. Of a whole column: ', h('code', {}, 'B/max(B)'), ', ', h('code', {}, 'B - mean(B)'),
            ' (also sum, sd, median, min, count). Another row: ', h('code', {}, 'B - B[i-1]'), ', ', h('code', {}, 'B/B[1]'), '. A condition: ', h('code', {}, 'if(A > 5 and B < 2, B, 0)'), '. Functions: ' + Object.keys(ASY.expr.FUNCTIONS).slice(0, 12).join(', ') + '…')),
        M.errors[c.id] ? h('small', { class: 'act-note err' }, 'Not computed: ' + M.errors[c.id]) : null,
        h('p', { class: 'muted' }, c.formula ? 'This column follows its formula: it is computed again when a column it reads changes.'
          : 'A formula of other columns is kept, and followed. One that names this column itself (' + c.name + '*2, ' + c.name + '/max(' + c.name + '), ' + c.name + '[i-1] + …) is applied once to the numbers it holds, and not kept: Undo brings them back.')),
      ui.sec('Statistics and sorting', nums.length + ' numbers', false,
        h('dl', { class: 'facts2' }, [['Numbers', nums.length], ['Mean', mean], ['Standard deviation', sd], ['Minimum', nums.length ? Math.min(...nums.slice(0, 1e5)) : NaN], ['Maximum', nums.length ? Math.max(...nums.slice(0, 1e5)) : NaN], ['Sum', nums.reduce((a, b) => a + b, 0)]]
          .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, nums.length ? ASY.fmt(v, 7) : '–')])),
        h('div', { class: 'acts', style: 'margin-top:10px' }, ui.btn('Sort the sheet ↑', () => { M.sortBy(s, c, false); M.log('Sheet “' + s.name + '” sorted by ' + M.label(c) + ', ascending.'); A().changedSheet(s); }), ui.btn('Sort the sheet ↓', () => { M.sortBy(s, c, true); M.log('Sheet “' + s.name + '” sorted by ' + M.label(c) + ', descending.'); A().changedSheet(s); }))),
    ];
  }

  // ------------------------------------------------------------------ operations on a curve
  const chosen = { op: 'smooth_savgol', args: {}, sheet: null, x: null, y: null, y2: null, plot: true };
  function analyseTab() {
    const cat = A().catalogue;
    if (!cat) return [h('div', { class: 'notice' }, 'The operations are computed by the server, which does not answer here.')];
    const doc = M.doc, g = doc.view.main === 'graph' ? M.graph(doc.view.graph) : null;
    // what it is applied to: the selected series of the graph, or the selected column of the sheet
    if (!M.sheet(chosen.sheet) || chosen.from !== doc.view.main + ':' + (g ? g.id + ':' + A().state.series : doc.view.sheet + ':' + A().picked().columns.join())) {
      let s = M.sheet(doc.view.sheet), y = null, x = null;
      if (g) { const all = g.figure.panels.flatMap((p) => p.series).filter((r) => r.kind === 'data'), r = all.find((k) => k.id === A().state.series) || all[0]; if (r) { s = M.sheet(r.sheet); y = M.column(s, r.y); x = M.column(s, r.x); } }
      else if (s) { const cols = A().picked().columns.map((id) => M.column(s, id)).filter(Boolean); y = cols.find((k) => k.role === 'y') || cols[0] || s.columns.find((k) => k.role === 'y'); x = y ? M.xOf(s, y) : null; }
      Object.assign(chosen, { sheet: s ? s.id : null, x: x ? x.id : null, y: y ? y.id : null, y2: null, from: doc.view.main + ':' + (g ? g.id + ':' + A().state.series : doc.view.sheet + ':' + A().picked().columns.join()) });
    }
    const s = M.sheet(chosen.sheet), op = cat.operations.find((o) => o.name === chosen.op) || cat.operations[0];
    const groups = cat.operation_families.map((f) => ({ group: f, options: cat.operations.filter((o) => o.family === f).map((o) => [o.name, o.label]) })).filter((x) => x.options.length);
    op.args.forEach((a) => { if (!(a.name in chosen.args) || chosen.argsOf !== op.name) chosen.args[a.name] = a.default; });
    chosen.argsOf = op.name;
    const quiet = { then: () => {}, structural: false, quiet: true };
    const control = (a) => (a.kind === 'bool' ? ui.chk(chosen.args, a.name, a.label, quiet) : ui.field(a.label, a.kind === 'choice' ? ui.sel(chosen.args, a.name, a.choices, quiet) : ui.num(chosen.args, a.name, { min: a.min, max: a.max, int: a.kind === 'int' }), a.help));
    return [
      ui.field('Operation', ui.sel(chosen, 'op', groups, { then: () => { chosen.args = {}; }, structural: true }), op.summary),
      ui.sec('On', s ? s.name : 'no data', true,
        ui.field('Sheet', ui.sel(chosen, 'sheet', sheetOptions(), { then: () => { const t = M.sheet(chosen.sheet), y = t.columns.find((k) => k.role === 'y') || t.columns[0]; chosen.y = y ? y.id : null; chosen.x = y && M.xOf(t, y) ? M.xOf(t, y).id : null; chosen.from += ' '; }, structural: true })),
        h('div', { class: 'cols2' }, ui.field('X', ui.sel(chosen, 'x', columnOptions(s, { none: 'row number' }), { nullable: true, structural: true })), ui.field('Y', ui.sel(chosen, 'y', columnOptions(s), { structural: true }))),
        op.second ? ui.field('The other curve (Y, same sheet)', ui.sel(chosen, 'y2', columnOptions(s, { none: 'choose' }), { nullable: true, structural: true })) : null),
      op.args.length ? ui.sec('With', '', true, op.args.map(control)) : null,
      g ? ui.chk(chosen, 'plot', 'Draw the result on this graph', quiet) : null,
      h('div', { class: 'acts', style: 'padding:12px 0' }, ui.btn(A().state.busy === 'analyse' ? 'Computing…' : 'Apply', () => A().analyse(Object.assign({}, chosen, { args: Object.assign({}, chosen.args) }), op), 'cta', { disabled: A().state.busy === 'analyse' || !chosen.y })),
      h('p', { class: 'say' }, 'The result is written in new columns; what was done, with the values used, is kept under “What was done”.'),
    ];
  }

  ASY.inspect = { seriesTab, axesTab, pageTab, notesTab, columnTab, analyseTab, seriesName, applyJournal, columnOptions, sheetOptions, forgetFormats: () => { kept.list = null; kept.pick = ''; } };
})(window.ASY);
