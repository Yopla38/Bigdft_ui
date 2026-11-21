/* The three dialogs: bringing data in, taking a figure out, and the list of projects.
 *
 * A file is read in the browser (importer.js) and shown as it was understood before anything is
 * kept; what was detected can be corrected there. A figure leaves as SVG or PNG made by the page,
 * or as PDF, EPS or TIFF made by the server from the same list of things to draw (plot.js): the
 * dialog says which font the file holds when it is not the one asked for. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, M = ASY.model, P = ASY.plot, ui = ASY.ui, api = window.OND.api;
  const A = () => ASY.app;

  function dialog(title, wide) {
    const body = h('div', { class: 'dlg-body' });
    const el = h('dialog', { class: 'dlg' + (wide ? ' wide' : ''), 'aria-label': title, onclose: () => el.remove(), onclick: (e) => { if (e.target === el) el.close(); } },
      h('div', { class: 'dlg-head' }, h('h2', {}, title), h('button', { class: 'btn small', type: 'button', onclick: () => el.close() }, 'Close')), body);
    document.body.append(el); el.showModal();
    return { el, body };
  }

  // ------------------------------------------------------------------ bringing data in
  function importData(given) {
    const d = dialog('Import data', true), files = [];
    let current = 0, note = '';
    const add = (text, name) => {
      try { const how = /^\s*<\?xml|^\s*<RSAPersist/.test(text.slice(0, 400)) ? null : ASY.importer.detect(text); files.push({ name, text, how, read: ASY.importer.read(text, name) }); }
      catch (e) { note = name + ': ' + e.message; }
    };
    const take = async (list) => { for (const file of list) { if (file.size > 80e6) { note = file.name + ' is larger than 80 MB'; continue; } add(await file.text(), file.name); } current = Math.max(0, files.length - list.length); draw(); };
    const reread = () => { const f = files[current]; try { f.read = Object.assign(ASY.importer.parse(f.text, f.how), { name: f.read.name }); note = ''; } catch (e) { note = e.message; } draw(); };
    const input = h('input', { type: 'file', multiple: true, hidden: true, accept: '.txt,.dat,.csv,.tsv,.asc,.xy,.prn,.Specan,.xml,text/*', onchange: (e) => take([...e.target.files]) });
    function draw() {
      const f = files[current];
      const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); take([...e.dataTransfer.files]); } },
        h('p', {}, files.length ? 'Drop more files here' : 'Drop files here: text with columns of numbers (.txt, .dat, .csv…), or a Tektronix .Specan spectrum'),
        h('div', { class: 'acts' }, ui.btn('Choose files', () => input.click(), files.length ? '' : 'cta'), ui.btn('Paste from the clipboard', async () => { try { const text = await navigator.clipboard.readText(); if (!text.trim()) throw new Error('empty'); add(text, 'Pasted data'); current = files.length - 1; draw(); } catch (e) { note = 'The clipboard holds no text, or the browser did not allow reading it: click a cell of a sheet and press Ctrl+V instead.'; draw(); } })),
        h('p', { class: 'muted' }, 'A file is read here, in the browser. The separator, the decimal mark and the lines of heading are detected; you can correct them before importing.'));
      const parts = [drop, input, note ? h('div', { class: 'notice err' }, note) : null];
      if (f) {
        const r = f.read, cells = r.rows * r.columns.length, how = f.how;
        const set = (key, value) => { how[key] = value; reread(); };
        parts.push(files.length > 1 ? h('div', { class: 'seg' }, files.map((x, i) => h('button', { type: 'button', 'aria-pressed': String(i === current), onclick: () => { current = i; draw(); } }, x.name))) : null,
          h('p', { class: 'say' }, h('b', {}, f.name), ': ' + r.rows + ' rows of ' + r.columns.length + ' columns' + (r.skipped ? ', ' + r.skipped + ' comment lines left out' : '') + (how ? '' : ' (' + r.meta[0] + ')') + '.'),
          how ? h('div', { class: 'cols3', style: 'gap:0 14px' },
            ui.field('Columns are separated by', h('select', { class: 'inp', onchange: (e) => set('separator', e.target.value) }, [['tab', 'tabs'], ['semicolon', 'semicolons'], ['comma', 'commas'], ['space', 'blanks']].map(([v, l]) => h('option', { value: v, selected: how.separator === v }, l)))),
            ui.field('Decimal mark', h('select', { class: 'inp', onchange: (e) => set('comma', e.target.value === 'comma') }, [['point', 'a point: 3.14'], ['comma', 'a comma: 3,14']].map(([v, l]) => h('option', { value: v, selected: (how.comma ? 'comma' : 'point') === v }, l)))),
            ui.field('Numbers start at line', h('input', { class: 'inp num', type: 'text', value: how.skip + 1, onchange: (e) => { const v = Math.round(ASY.parseNum(e.target.value)); if (v >= 1) { how.header = Math.min(how.header, v - 2); set('skip', v - 1); } } }))) : null,
          how ? ui.field('Names of the columns', h('select', { class: 'inp', onchange: (e) => set('header', Number(e.target.value)) }, [[-1, 'none: A, B, C…']].concat(f.text.split(/\r\n|\n|\r/).slice(0, Math.min(how.skip, 40)).map((l, i) => [i, 'line ' + (i + 1) + ': ' + l.slice(0, 80)]).filter((x) => x[1].trim().length > 8)).map(([v, l]) => h('option', { value: v, selected: how.header === v }, l)))) : null,
          h('div', { class: 'preview' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), r.columns.map((c, i) => h('th', {}, ASY.letters(i) + (c.title ? ' · ' + c.title : '') + (c.unit ? ' (' + c.unit + ')' : ''))))),
            h('tbody', {}, Array.from({ length: Math.min(r.rows, 12) }, (_, k) => h('tr', {}, h('td', { class: 'muted' }, k + 1), r.columns.map((c) => h('td', { class: 'num' }, c.values[k] == null ? '' : typeof c.values[k] === 'number' ? ASY.fmt(c.values[k], 8) : c.values[k]))))))),
          r.meta.length && how ? h('details', {}, h('summary', { class: 'muted', style: 'cursor:pointer' }, r.meta.length + ' lines before the numbers'), h('pre', { class: 'code', style: 'max-height:140px' }, r.meta.join('\n'))) : null,
          cells > 400000 ? h('div', { class: 'notice' }, 'This is ' + cells.toLocaleString() + ' values: a project that large may be refused when it is saved. Import the columns you need.') : null,
          h('div', { class: 'acts' }, ui.btn(files.length > 1 ? 'Import ' + files.length + ' files, a sheet each' : 'Import as a new sheet', () => {
            let last = null;
            files.forEach((x) => { if (!x.read.rows) return; last = M.sheetFrom(x.read.name, x.read.columns, 'Imported from ' + x.name + '.'); M.log('Imported “' + x.name + '”: ' + x.read.rows + ' rows, ' + x.read.columns.length + ' columns, into the sheet “' + last.name + '”.'); });
            if (!last) { note = 'No row of numbers was found.'; return draw(); }
            const empty = M.doc.sheets.find((s) => s !== last && s.columns.every((c) => !c.values.length) && M.doc.sheets.length > 1 && !M.doc.fits.some((k) => k.sheet === s.id));
            if (empty && empty.name.startsWith('Sheet')) M.removeSheet(empty.id);
            M.doc.view.sheet = last.id; M.doc.view.main = 'sheet'; d.el.close(); A().resetGrid(); A().refresh();
          }, 'cta')));
      }
      ASY.fill(d.body, ...parts.filter(Boolean));
    }
    draw();
    if (given && given.length) take(given);
  }

  // ------------------------------------------------------------------ taking a figure out
  const b64 = (text) => { const bin = atob(text), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; };
  /* The figure as pixels, drawn by the browser from its SVG. */
  function raster(list, dpi) {
    return new Promise((resolve, reject) => {
      const w = Math.round(list.width / 25.4 * dpi), ht = Math.round(list.height / 25.4 * dpi);
      if (Math.max(w, ht) > 16000) return reject(new Error('At ' + dpi + ' dpi this figure is ' + w + ' pixels wide, more than a browser draws: lower the resolution, or ask the server for a TIFF.'));
      const img = new Image(), url = URL.createObjectURL(new Blob([P.svg(list)], { type: 'image/svg+xml' }));
      img.onload = () => { const canvas = h('canvas', { width: w, height: ht }), c = canvas.getContext('2d'); c.fillStyle = list.background; c.fillRect(0, 0, w, ht); c.drawImage(img, 0, 0, w, ht); URL.revokeObjectURL(url); canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not make the image.'))), 'image/png'); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The browser could not draw the figure.')); };
      img.src = url;
    });
  }
  function exportFigure() {
    const g = M.graph(M.doc.view.graph); if (!g) return;
    const d = dialog('Export the figure'), cat = A().catalogue, fig = g.figure;
    const opt = { format: cat ? 'pdf' : 'svg', dpi: 600, name: g.name.replace(/[^\w.-]+/g, '_') };
    let note = '', busy = false, said = [];
    const FORMATS = [['pdf', 'PDF · vector, font embedded', true], ['svg', 'SVG · vector, text kept as text', false], ['eps', 'EPS · vector, for older workflows', true], ['tiff', 'TIFF · pixels, LZW', true], ['png', 'PNG · pixels', false]];
    const list = () => P.layout(fig, M.seriesData);
    async function make() {
      const format = opt.format, needs = FORMATS.find((x) => x[0] === format)[2], name = (opt.name || 'figure') + '.' + format;
      if (format === 'svg') return { blob: new Blob([P.svg(list())], { type: 'image/svg+xml' }), name, notes: [] };
      if (format === 'png' && !cat) return { blob: await raster(list(), opt.dpi), name, notes: [] };
      if (needs && !cat) throw new Error('This format is made by the server, which does not answer here. SVG and PNG are made by the page.');
      const out = await api.post('asymille/figure', { figure: P.sendable(list()), format, dpi: opt.dpi, name: opt.name || 'figure' });
      return { blob: new Blob([b64(out.data)], { type: out.mime }), name: out.name, notes: out.notes };
    }
    function draw() {
      const pixels = opt.format === 'png' || opt.format === 'tiff';
      ASY.fill(d.body, 
        h('p', { class: 'say' }, h('b', {}, g.name), ': ' + fig.width + ' × ' + fig.height + ' mm, ' + fig.font + ', axis titles of ' + fig.size.label + ' pt. The file holds the figure at this size: change it under Page, not by stretching the file.'),
        h('div', { class: 'cols2', style: 'gap:0 14px' },
          ui.field('Format', h('select', { class: 'inp', onchange: (e) => { opt.format = e.target.value; said = []; note = ''; draw(); } }, FORMATS.map(([v, l, server]) => h('option', { value: v, selected: opt.format === v, disabled: server && !cat }, l + (server && !cat ? ' (needs the server)' : '')))),
            { pdf: 'What most journals ask for line art: sharp at any size.', svg: 'Made by the page; opens in Inkscape or Illustrator, text stays editable.', eps: 'Without transparency: bands are drawn in the colour they show.', tiff: 'For journals that ask for pixels: 600 dpi for line art, 300 for halftones.', png: 'For a slide, a notebook, a web page.' }[opt.format]),
          pixels ? ui.field('Resolution (dpi)', h('select', { class: 'inp', onchange: (e) => { opt.dpi = Number(e.target.value); draw(); } }, [150, 300, 600, 1200].map((v) => h('option', { value: v, selected: opt.dpi === v }, v + ' dpi · ' + Math.round(fig.width / 25.4 * v) + ' × ' + Math.round(fig.height / 25.4 * v) + ' px')))) : h('span', {})),
        ui.field('File name', h('input', { class: 'inp', type: 'text', value: opt.name, maxlength: 80, onchange: (e) => { opt.name = e.target.value.replace(/[^\w.-]+/g, '_'); } })),
        note ? h('div', { class: 'notice err' }, note) : null, said.map((s) => h('div', { class: 'notice advice' }, s)),
        h('div', { class: 'acts' },
          ui.btn(busy ? 'Making the file…' : 'Download', async () => { busy = true; note = ''; draw(); try { const out = await make(); said = out.notes || []; ASY.download(out.blob, out.name); M.log('Figure “' + g.name + '” exported as ' + out.name + ' (' + fig.width + ' × ' + fig.height + ' mm' + (pixels ? ', ' + opt.dpi + ' dpi' : '') + ').'); A().touch(); } catch (e) { note = e.message; } busy = false; draw(); }, 'cta', { disabled: busy }),
          ui.btn('Copy as an image', async () => { try { const blob = await raster(list(), 300); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); A().say('The figure is in the clipboard (PNG, 300 dpi)'); } catch (e) { note = e.message || 'The browser did not allow copying an image.'; draw(); } }, '', { title: 'A PNG at 300 dpi, to paste in a slide or a notebook' })));
    }
    draw();
  }

  // ------------------------------------------------------------------ the projects
  function projects() {
    const T = ASY.store, d = dialog('Projects');
    let note = '', renaming = null, removing = null;
    const act = async (fn) => { note = ''; try { await fn(); } catch (e) { note = e.message || String(e); } draw(); };
    const fileInput = h('input', { type: 'file', hidden: true, accept: '.json,application/json', onchange: async (e) => { const file = e.target.files[0]; if (!file) return; act(async () => { const doc = JSON.parse(await file.text()); if (!doc || doc.version !== 1 || !Array.isArray(doc.sheets)) throw new Error('This file is not an Asymille project.'); if (T.state.on) await T.fresh(() => M.restore(doc)); else M.restore(doc); d.el.close(); A().resetGrid(); A().refresh(); }); } });
    function row(s) {
      const current = s.id === T.state.id;
      if (renaming === s.id) {
        const input = h('input', { type: 'text', value: s.name, maxlength: 80, 'aria-label': 'Name of the project', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') { e.stopPropagation(); renaming = null; draw(); } } });
        const ok = () => { const name = input.value; renaming = null; act(async () => { await T.rename(s.id, name); A().refresh(); }); };
        setTimeout(() => { input.focus(); input.select(); }, 0);
        return h('li', { class: 'std-row' }, h('div', { class: 'std-edit' }, input, ui.btn('Rename', ok, 'cta'), ui.btn('Cancel', () => { renaming = null; draw(); })));
      }
      if (removing === s.id) return h('li', { class: 'std-row warn' }, h('div', { class: 'std-edit' }, h('span', {}, 'Delete “' + s.name + '”, its data, its graphs and its fits? This cannot be undone.'),
        ui.btn('Delete', () => { removing = null; act(async () => { await T.remove(s.id); A().resetGrid(); A().refresh(); }); }, 'danger'), ui.btn('Keep', () => { removing = null; draw(); })));
      const counts = [[s.sheet_count, 'sheet'], [s.graph_count, 'graph'], [s.fit_count, 'fit']].map(([n, w]) => n + ' ' + w + (n === 1 ? '' : 's')).join(' · ');
      return h('li', { class: 'std-row' + (current ? ' on' : '') + (s.pending ? ' pending' : '') },
        h('button', { class: 'std-open', type: 'button', disabled: s.pending || T.state.opening, onclick: () => { if (current) return d.el.close(); act(async () => { await T.open(s.id); d.el.close(); A().resetGrid(); A().refresh(); }); } },
          h('b', {}, s.name), h('span', {}, counts + ' · ' + (s.pending ? 'being copied…' : 'changed ' + ASY.when(s.updated_at)) + (current ? ' · open' : ''))),
        s.pending ? null : h('span', { class: 'std-acts' }, ui.btn('Rename', () => { renaming = s.id; removing = null; draw(); }), ui.btn('Duplicate', () => act(() => T.duplicate(s.id))), ui.btn('Delete', () => { removing = s.id; renaming = null; draw(); })));
    }
    function draw() {
      const s = T.state;
      ASY.fill(d.body, fileInput,
        h('div', { class: 'acts' }, s.on ? ui.btn('New project', () => act(async () => { await T.fresh(() => M.blank()); d.el.close(); A().resetGrid(); A().refresh(); }), 'cta') : ui.btn('New project', () => { M.blank(); d.el.close(); A().resetGrid(); A().refresh(); }, 'cta'),
          ui.btn('Save this project to a file', () => ASY.download(JSON.stringify(M.doc), (M.doc.name.replace(/[^\w.-]+/g, '_') || 'project') + '.asymille.json', 'application/json'), '', { title: 'The whole project (data, graphs, fits) as one file: a backup, or to send to someone' }),
          ui.btn('Open a project file', () => fileInput.click())),
        note ? h('div', { class: 'notice err' }, note) : null,
        !s.on ? h('p', { class: 'say' }, 'No server keeps projects here: save the project to a file to find it again.')
          : s.loading && !s.list ? h('p', { class: 'say' }, 'Reading your projects…') : s.error && !s.list ? h('div', { class: 'notice err' }, s.error)
            : h('ul', { class: 'std-list' }, (s.list || []).map(row)));
    }
    const off = () => { if (d.el.isConnected) draw(); };
    T.on(off);
    if (T.state.on) T.refreshList().catch(() => {});
    draw();
  }
  /* The open project was changed in another tab since it was opened here: the person chooses. */
  function conflict() {
    const d = dialog('Changed elsewhere');
    ASY.fill(d.body, h('p', { class: 'say' }, 'This project was changed in another tab or browser since it was opened here. Which one is kept?'),
      h('div', { class: 'acts' }, ui.btn('Keep what is on this screen', async () => { d.el.close(); try { await ASY.store.resolve('mine'); } catch (e) { A().say(e.message, true); } }, 'cta'),
        ui.btn('Take the other one', async () => { d.el.close(); try { await ASY.store.resolve('theirs'); A().resetGrid(); A().refresh(); } catch (e) { A().say(e.message, true); } })));
  }

  ASY.dialogs = { importData, exportFigure, projects, conflict, raster };
})(window.ASY);
