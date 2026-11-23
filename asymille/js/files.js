/* Reading files that are not text: a spreadsheet of Excel (.xlsx) or of LibreOffice (.ods), a
 * project of Origin (.opj, and the older .org).
 *
 *     const tables = await ASY.files.read(bytes, name)      // bytes: an ArrayBuffer or a Uint8Array
 *     → [{ name, text }]                 a spreadsheet: one per sheet, as tab-separated text, read from there as any text file is
 *     → [{ name, read: { columns } }]    an Origin project: one per worksheet, with the names, the units and the roles of its columns
 *
 * A file is read here, in the browser: nothing of it is sent anywhere. No DOM: tools/check_page.js
 * runs this in Node. A spreadsheet is a zip of XML: the zip is opened with the browser's own
 * inflate, the XML is read by a small reader of tags (there is no DOM parser in Node, and none is
 * needed for what a sheet holds). An Origin project is a binary file that OriginLab does not
 * describe: what is read here follows what liborigin (the open reader used by SciDAVis and
 * LabPlot) found of it: the values of the worksheets, the long name, the unit and the role of
 * each column. Graphs, matrices and notes are left. The newer .opju is not this format. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const MAX_ENTRY = 300e6, MAX_ROWS = 1e6, MAX_COLS = 2000, MAX_CELLS = 5e6;
  const utf8 = new TextDecoder('utf-8'), latin1 = new TextDecoder('latin1');
  const bytesOf = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));

  // ------------------------------------------------------------------ a zip
  /* The files of a zip, by name: { name: () => Promise<Uint8Array> }. Stored and deflated entries, as every spreadsheet is written. */
  function unzip(bytes) {
    const u8 = bytesOf(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = u8.length;
    let end = -1;
    for (let i = n - 22; i >= Math.max(0, n - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('this is not a zip: a spreadsheet saved as .xlsx or .ods is one');
    const count = dv.getUint16(end + 10, true), files = {};
    let at = dv.getUint32(end + 16, true);
    for (let k = 0; k < count && at + 46 <= n; k++) {
      if (dv.getUint32(at, true) !== 0x02014b50) break;
      const method = dv.getUint16(at + 10, true), packed = dv.getUint32(at + 20, true), size = dv.getUint32(at + 24, true), nameLen = dv.getUint16(at + 28, true), extra = dv.getUint16(at + 30, true), comment = dv.getUint16(at + 32, true), local = dv.getUint32(at + 42, true);
      const name = utf8.decode(u8.subarray(at + 46, at + 46 + nameLen));
      files[name] = async () => {
        if (size > MAX_ENTRY) throw new Error(name + ' is too large to be read here');
        if (local + 30 > n || dv.getUint32(local, true) !== 0x04034b50) throw new Error('the zip is damaged at ' + name);
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true), raw = u8.subarray(start, start + packed);
        if (method === 0) return raw;
        if (method !== 8) throw new Error(name + ' is packed in a way this cannot open');
        if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot open a zip: use a recent one, or save the sheet as CSV');
        const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = [];
        let total = 0;
        for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX_ENTRY) { reader.cancel(); throw new Error(name + ' unpacks to more than this reads'); } parts.push(value); }
        const out = new Uint8Array(total); let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
      };
      at += 46 + nameLen + extra + comment;
    }
    return files;
  }

  // ------------------------------------------------------------------ XML, as far as a sheet needs it
  const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const plainText = (s) => (s.includes('&') ? s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e] != null ? ENTITY[e] : m)) : s);
  const TAG = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<[!?][\s\S]*?>|([^<]+)/g;
  const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  /* Walk a document: open(name, attrs), close(name), text(string). Attributes are read only when asked for. */
  function walk(xml, on) {
    TAG.lastIndex = 0;
    let m;
    while ((m = TAG.exec(xml))) {
      if (m[2]) {
        if (m[1]) { if (on.close) on.close(m[2]); continue; }
        const raw = m[3];
        if (on.open) on.open(m[2], (name) => { ATTR.lastIndex = 0; let a; while ((a = ATTR.exec(raw))) if (a[1] === name) return plainText(a[2] != null ? a[2] : a[3]); return null; });
        if (m[4] && on.close) on.close(m[2]);
      } else if (m[5] != null) { if (on.text) on.text(m[5]); } else if (m[6] != null && on.text) on.text(plainText(m[6]));
    }
  }

  // ------------------------------------------------------------------ a grid of cells, as text
  /* The cells of a sheet as tab-separated text, without the empty rows and columns around them: what the importer reads as it reads any file. */
  function tsv(rows) {
    let last = -1, left = Infinity, right = -1;
    rows.forEach((r, i) => { if (!r) return; r.forEach((c, j) => { if (c !== undefined && c !== '') { last = i; if (j < left) left = j; if (j > right) right = j; } }); });
    if (last < 0) return '';
    const first = rows.findIndex((r) => r && r.some((c) => c !== undefined && c !== '')), lines = [];
    for (let i = first; i <= last; i++) {
      const r = rows[i] || [], cells = [];
      for (let j = left; j <= right; j++) { const c = r[j]; cells.push(c === undefined ? '' : typeof c === 'number' ? String(c) : String(c).replace(/[\t\r\n]+/g, ' ')); }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }
  const room = (count) => { if (count.cells++ > MAX_CELLS) throw new Error('this sheet holds more than ' + MAX_CELLS.toLocaleString() + ' cells: save the part you need as CSV'); };

  // ------------------------------------------------------------------ Excel
  const columnOf = (ref) => { let c = 0, i = 0; for (; i < ref.length && ref.charCodeAt(i) >= 65; i++) c = c * 26 + (ref.charCodeAt(i) & 31); return [c - 1, parseInt(ref.slice(i), 10) - 1]; };
  async function xlsx(bytes) {
    const zip = unzip(bytes), text = async (name) => (zip[name] ? utf8.decode(await zip[name]()) : null);
    const book = await text('xl/workbook.xml');
    if (!book) throw new Error('this is not an Excel workbook (.xlsx). An older .xls is not read: save it as .xlsx or as CSV');
    const sheets = [], targets = {}, strings = [];
    walk(book, { open: (tag, at) => { if (tag === 'sheet' || tag.endsWith(':sheet')) sheets.push({ name: at('name') || 'Sheet', rid: at('r:id') }); } });
    walk(await text('xl/_rels/workbook.xml.rels') || '', { open: (tag, at) => { if (tag === 'Relationship') targets[at('Id')] = at('Target'); } });
    const shared = await text('xl/sharedStrings.xml');
    if (shared) { let cur = null, take = false, skip = 0;          // a string may be several runs; what is written above it for reading aloud (rPh) is not part of it
      walk(shared, { open: (tag) => { if (tag === 'si') cur = ''; else if (tag === 'rPh') skip++; else if (tag === 't') take = !skip; }, close: (tag) => { if (tag === 'si') { strings.push(cur || ''); cur = null; } else if (tag === 'rPh') skip--; else if (tag === 't') take = false; }, text: (s) => { if (take && cur != null) cur += s; } }); }
    const out = [], count = { cells: 0 };
    for (let k = 0; k < sheets.length; k++) {
      const target = targets[sheets[k].rid] || 'worksheets/sheet' + (k + 1) + '.xml', path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      const xml = await text(path);
      if (!xml) continue;                                             // a chart sheet has no cells
      const rows = []; let cell = null, where = '', rowAt = -1, colAt = -1;
      walk(xml, {
        open: (tag, at) => {
          if (tag === 'row') { const r = at('r'); rowAt = r ? parseInt(r, 10) - 1 : rowAt + 1; colAt = -1; }
          else if (tag === 'c') { const ref = at('r'); if (ref) { const [c, r] = columnOf(ref); colAt = c; if (r >= 0) rowAt = r; } else colAt++; cell = { type: at('t') || 'n', v: '', is: '' }; }
          else if (cell && (tag === 'v' || tag === 't')) where = tag;
        },
        close: (tag) => {
          if (tag === 'v' || tag === 't') where = '';
          else if (tag === 'c' && cell) {
            let value;
            if (cell.type === 's') value = strings[parseInt(cell.v, 10)];
            else if (cell.type === 'inlineStr') value = cell.is;
            else if (cell.type === 'str') value = cell.v;
            else if (cell.type === 'b') value = cell.v === '1' ? 'TRUE' : 'FALSE';
            else if (cell.type === 'e' || cell.v === '') value = undefined;
            else { const v = Number(cell.v); value = isNaN(v) ? cell.v : v; }
            if (value !== undefined && value !== '' && rowAt >= 0 && rowAt < MAX_ROWS && colAt >= 0 && colAt < MAX_COLS) { room(count); (rows[rowAt] = rows[rowAt] || [])[colAt] = value; }
            cell = null;
          }
        },
        text: (s) => { if (!cell) return; if (where === 'v') cell.v += s; else if (where === 't') cell.is += s; },
      });
      const t = tsv(rows);
      if (t) out.push({ name: sheets[k].name, text: t });
    }
    return out;
  }

  // ------------------------------------------------------------------ LibreOffice, OpenOffice
  async function ods(bytes) {
    const zip = unzip(bytes);
    if (!zip['content.xml']) throw new Error('this is not a spreadsheet of LibreOffice or OpenOffice (.ods)');
    if (zip['META-INF/manifest.xml'] && /manifest:encryption-data/.test(utf8.decode(await zip['META-INF/manifest.xml']()))) throw new Error('this spreadsheet is protected by a password: save it without one');
    const xml = utf8.decode(await zip['content.xml']()), out = [], count = { cells: 0 };
    let sheet = null, row = null, cell = null, repeatRow = 1, inText = 0, note = 0;
    const put = () => {                                               // a row repeated many times is the empty rest of a sheet: it is written once, the true repeats as many times as they are
      const filled = row.some((c) => c !== undefined), times = filled ? Math.min(repeatRow, 10000) : Math.min(repeatRow, 200);
      for (let i = 0; i < times && sheet.rows.length < MAX_ROWS; i++) { sheet.rows.push(filled ? row : []); if (filled) for (let j = 0; j < row.length; j++) if (row[j] !== undefined) room(count); }
    };
    walk(xml, {
      open: (tag, at) => {
        if (tag === 'table:table') sheet = { name: at('table:name') || 'Sheet', rows: [] };
        else if (!sheet) return;
        else if (tag === 'table:table-row') { row = []; repeatRow = Math.max(1, parseInt(at('table:number-rows-repeated') || '1', 10)); }
        else if ((tag === 'table:table-cell' || tag === 'table:covered-table-cell') && row) {
          const type = at('office:value-type'), repeat = Math.max(1, parseInt(at('table:number-columns-repeated') || '1', 10));
          cell = { repeat, text: '', value: undefined, type };
          if (type === 'float' || type === 'percentage' || type === 'currency') { const v = Number(at('office:value')); if (!isNaN(v)) cell.value = v; }
          else if (type === 'date') cell.value = at('office:date-value') || undefined;
          else if (type === 'time') cell.value = at('office:time-value') || undefined;
          else if (type === 'boolean') cell.value = at('office:boolean-value') === 'true' ? 'TRUE' : 'FALSE';
        } else if (cell && tag === 'office:annotation') note++;
        else if (cell && tag === 'text:p' && !note) { if (cell.text) cell.text += ' '; inText++; }
        else if (cell && inText && tag === 'text:s') cell.text += ' '.repeat(Math.max(1, parseInt(at('text:c') || '1', 10)));
      },
      close: (tag) => {
        if (tag === 'table:table' && sheet) { const t = tsv(sheet.rows); if (t) out.push({ name: sheet.name, text: t }); sheet = null; }
        else if (tag === 'table:table-row' && row) { put(); row = null; }
        else if ((tag === 'table:table-cell' || tag === 'table:covered-table-cell') && cell) {
          const value = cell.value !== undefined ? cell.value : cell.text !== '' ? cell.text : undefined;
          if (value === undefined) row.length = Math.min(MAX_COLS, row.length + cell.repeat);                      // empty cells only move the place of the next one
          else for (let i = 0; i < cell.repeat && row.length < MAX_COLS; i++) row.push(value);
          cell = null;
        } else if (tag === 'office:annotation') note = Math.max(0, note - 1);
        else if (tag === 'text:p' && inText) inText--;
      },
      text: (s) => { if (cell && inText && !note) cell.text += s; },
    });
    return out;
  }

  // ------------------------------------------------------------------ Origin
  const MISSING = -1.23456789e-300;                                    // what Origin writes in an empty numeric cell
  const ROLES = { 0: 'y', 2: 'yerr', 3: 'x', 4: 'label', 6: 'xerr' };
  const cstring = (u8, from, most) => { let e = from; const stop = Math.min(u8.length, most == null ? u8.length : from + most); while (e < stop && u8[e] !== 0) e++; return latin1.decode(u8.subarray(from, e)); };
  /* The worksheets of an Origin project: for each, its columns with their values, their long name, their unit and their role. */
  function origin(bytes) {
    const u8 = bytesOf(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = u8.length;
    let pos = u8.indexOf(10);
    const head = latin1.decode(u8.subarray(0, Math.max(0, Math.min(pos, 80))));
    if (head.startsWith('CPYUA')) throw new Error('this project was saved in the new format of Origin (.opju), which is not read: in Origin, save it with “Save Project As”, type .opj');
    if (pos < 0 || !head.startsWith('CPYA')) throw new Error('this is not a project of Origin');
    pos += 1;
    // the file is a chain of blocks: a size on four bytes and a line feed, then that many bytes and a line feed. A size of zero ends a list.
    const size = () => { if (pos + 5 > n) throw new Error('the file ends before its data do'); const v = dv.getUint32(pos, true); if (u8[pos + 4] !== 10) throw new Error('the file is not laid out as a project of Origin is (at byte ' + pos + ')'); pos += 5; return v; };
    const block = (len) => { if (pos + len > n) throw new Error('the file ends before its data do'); const b = u8.subarray(pos, pos + len); pos += len; if (len > 0) { if (u8[pos] !== 10) throw new Error('the file is not laid out as a project of Origin is (at byte ' + pos + ')'); pos += 1; } return b; };
    const header = block(size());
    const version = header.length > 0x23 ? new DataView(header.buffer, header.byteOffset, header.byteLength).getFloat64(0x1B, true) : 0;
    if (size() !== 0) throw new Error('the file is not laid out as a project of Origin is');

    // the datasets: a column of a worksheet is called Book_Column, or Book_Column@2 on the second sheet of a workbook
    const datasets = [], books = [];
    for (;;) {
      const hlen = size(); if (!hlen) break;
      const h = block(hlen), data = block(size()), mask = size(); if (mask) block(mask);
      const hv = new DataView(h.buffer, h.byteOffset, h.byteLength), old = version > 0 && version < 4;
      const type = h.length > 0x17 ? hv.getUint16(0x16, true) : 0, last = h.length > 0x24 ? hv.getInt32(0x21, true) : 0;
      let width = h[old ? 0x36 : 0x3D] || 8;
      const full = cstring(h, old ? 0x57 : 0x58, 25), cut = full.lastIndexOf('_');
      const entry = { book: null, plain: cut < 0 && !(type & 0x80) ? full : null }; datasets.push(entry);
      if (cut < 0 || (type & 0x80)) continue;                        // a matrix, or a function (Origin marks those with this bit): not a column
      let name = full.slice(cut + 1), sheet = 1; const amp = name.lastIndexOf('@');
      if (amp > 0) { sheet = parseInt(name.slice(amp + 1), 10) || 1; name = name.slice(0, amp); }
      const count = Math.floor(data.length / width), rows = Math.max(0, Math.min(count, last > 0 ? last : count)), values = new Array(rows);
      const dd = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let i = 0; i < rows; i++) {
        const at = i * width; let v;
        if (width > 8) {                                              // text, or text and numbers: a flag, then a number or the characters
          if ((type & 0x100) === 0x100 && data[at] !== 1) v = dd.getFloat64(at + 2, true);
          else { const s = cstring(data, at + ((type & 0x100) === 0x100 ? 2 : 0), width - ((type & 0x100) === 0x100 ? 2 : 0)); v = s === '' || s.includes('\u000e') ? null : s; }
        } else if (width === 8) v = dd.getFloat64(at, true);
        else if (width === 4) v = (type & 0x800) === 0x800 ? dd.getInt32(at, true) : dd.getFloat32(at, true);
        else if (width === 2) v = dd.getInt16(at, true);
        else v = dd.getInt8(at);
        // what Origin writes of its own in a cell of a report (cell://…, embedding:…) is not a value
        values[i] = typeof v === 'number' ? (v === MISSING || !isFinite(v) ? null : v) : typeof v === 'string' && /^(cell|embedding|graph|http):\/?\/?/i.test(v) && !/^http/i.test(v) ? null : v;
      }
      while (values.length && values[values.length - 1] == null) values.pop();          // the empty rows under the last value
      const bookName = full.slice(0, cut);
      let book = books.find((b) => b.name === bookName && b.sheet === sheet);
      if (!book) books.push(book = { name: bookName, sheet, columns: [] });
      const column = { name, title: '', unit: '', role: null, values };
      book.columns.push(column); entry.book = book; entry.column = column;
    }

    // the windows. A worksheet says there what each of its columns is (X, Y, an error) and how it is called; a graph, its layers: axes, curves, texts.
    // Not being able to read them loses the names and the graphs, not the values.
    const said = [], graphs = [], matrices = new Set(datasets.map((d, k) => (d.book ? null : d.plain)).filter(Boolean));
    const i16 = (b, at) => (at + 2 <= b.length ? new DataView(b.buffer, b.byteOffset, b.byteLength).getInt16(at, true) : 0);
    const u16 = (b, at) => (at + 2 <= b.length ? new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(at, true) : 0);
    const f64 = (b, at) => (at + 8 <= b.length ? new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(at, true) : NaN);
    try {
      /* What is drawn on a layer beside its curves: each is a header and three blocks; a group holds others in place of its second block. */
      const annotations = (out) => { for (;;) { const hlen = size(); if (!hlen) break; const head = block(hlen), d1len = size(), d1 = block(d1len), d2len = size(); let d2 = null; if ((d1len === 0x5e || d1len === 0x0a) && d2len === 0x04) annotations(out); else d2 = block(d2len); block(size()); if (out && d2) out.push({ head, d1, d2 }); } };
      const list = () => { for (;;) { const len = size(); if (!len) break; block(len); } };
      for (;;) {
        const wlen = size(); if (!wlen) break;
        const w = block(wlen), window = cstring(w, 0x02, 25), isBook = books.some((b) => b.name === window);
        const graph = !isBook && !matrices.has(window) && cstring(w, 0x45, 20) !== 'LAYOUT' ? { name: window, layers: [] } : null;
        for (;;) {
          const llen = size(); if (!llen) break;
          const l = block(llen), notes = graph ? [] : null;
          annotations(notes);
          const layer = graph ? { x: { min: f64(l, 0x0f), max: f64(l, 0x17), step: f64(l, 0x1f), scale: l[0x38] }, y: { min: f64(l, 0x3a), max: f64(l, 0x42), step: f64(l, 0x4a), scale: l[0x63] },
            rect: { left: i16(l, 0x71), top: i16(l, 0x73), right: i16(l, 0x75), bottom: i16(l, 0x77) }, notes, curves: [] } : null;
          for (;;) {                                                  // in a worksheet, the curves of a layer are its columns; in a graph, they are its curves
            const clen = size(); if (!clen) break;
            const c = block(clen), text = block(size());
            if (c.length < 0x14) continue;
            const id = u16(c, 0x04), entry = datasets[id - 1];
            if (layer) {
              const xOf = datasets[u16(c, 0x23) - 1], long = c.length > 0x16d;
              layer.curves.push({ y: entry && entry.column ? entry : null, x: xOf && xOf.column ? xOf : null, type: c[0x4c], hidden: c[0x26] === 33, connect: c[0x11], style: c[0x12], width: u16(c, 0x15) / 500,
                shape: c[0x17], interior: c[0x18], size: u16(c, 0x19) / 500, line: long ? c.subarray(0x16a, 0x16e) : null, symbol: long ? c.subarray(0x132, 0x136) : null });
              continue;
            }
            const named = cstring(c, 0x12, 25);
            const column = entry && entry.column && entry.book.name === window && entry.column.name.slice(0, 11) === named.slice(0, 11) ? entry.column
              : (books.filter((b) => b.name === window).flatMap((b) => b.columns).find((k) => k.role === null && k.name.slice(0, 11) === named.slice(0, 11)) || null);
            if (!column) continue;
            column.role = ROLES[c[0x11]] || 'y';
            // the label rows of a column: its long name, its unit, its comments, one under the other; what follows an @ is Origin's own
            const label = cstring(text, 0).split('@${')[0].split(/\r\n|\n/).map((t) => t.trim());
            if (label[0]) column.title = originText(label[0]).replace(/\n/g, ' ').slice(0, 120);          // in the markup of this page: an underscore of a name is not an index
            if (label[1]) column.unit = originText(label[1]).replace(/\n/g, ' ').slice(0, 40);
          }
          list(); list(); list(); list();                              // axis breaks, then what is said of the x, y and z axes
          if (layer) graph.layers.push(layer);
        }
        if (graph && graph.layers.some((y) => y.curves.length)) graphs.push(graph);
      }
    } catch (e) { said.push('The long names and the roles of some columns, and some of the graphs, could not be read (' + e.message + '): those columns keep their short name, and the first column of such a sheet is taken as x.'); }

    const sheetsOf = {}; books.forEach((b) => { sheetsOf[b.name] = (sheetsOf[b.name] || 0) + 1; });
    const kept = books.filter((b) => b.columns.some((c) => c.values.some((v) => typeof v === 'number')));            // a sheet without one number is a table of Origin's own, or empty
    const keyOf = (b) => b.name + '@' + b.sheet;
    const tables = kept.map((b) => {
      const known = b.columns.some((c) => c.role !== null);
      b.columns.forEach((c, k) => { c.as = known ? c.role || 'y' : k === 0 ? 'x' : 'y'; });
      return { name: b.name + (sheetsOf[b.name] > 1 ? ' · sheet ' + b.sheet : ''), key: keyOf(b), said,
        read: { rows: Math.max(...b.columns.map((c) => c.values.length)), skipped: 0, meta: ['a worksheet of an Origin project' + (version ? ', version ' + version : '')],
          columns: b.columns.map((c) => ({ title: c.title || c.name, unit: c.unit, role: c.as, values: c.values })) } };
    });
    const all = graphs.map((g) => graphOf(g, kept, keyOf));
    tables.graphs = all.filter((g) => g.panels.length);
    tables.left = all.filter((g) => !g.panels.length).flatMap((g) => g.said);                 // graphs of which nothing can be drawn here, and why
    return tables;
  }

  // ------------------------------------------------------------------ a graph of Origin, as a graph to make here
  const ORIGIN_COLOURS = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00', '#808000', '#000080', '#800080', '#800000', '#008000', '#008080', '#0000a0', '#ff8000', '#8000ff', '#ff0080', '#ffffff', '#c0c0c0', '#808080',
    '#ffff80', '#80ffff', '#ff80ff', '#404040'];
  const hex = (v) => v.toString(16).padStart(2, '0');
  /* A colour as Origin keeps it on four bytes: one of its list, its own red, green and blue, or "the next of the list" (null: left to the palette here). */
  function colourOf(b, nth) {
    if (!b || b.length < 4) return null;
    if (b[3] === 1) return '#' + hex(b[0]) + hex(b[1]) + hex(b[2]);
    if (b[3] === 0x20) return ORIGIN_COLOURS[(b[1] + (nth || 0)) % 24];
    if (b[3] === 0xff && (b[0] === 0xfc || b[0] === 0xf7)) return null;                        // none, automatic
    return b[0] < 24 && (b[3] === 0 || b[3] === 0xff) ? ORIGIN_COLOURS[b[0]] : null;
  }
  const SYMBOL_GREEK = { a: 'alpha', b: 'beta', g: 'gamma', d: 'delta', e: 'epsilon', z: 'zeta', h: 'eta', q: 'theta', i: 'iota', k: 'kappa', l: 'lambda', m: 'mu', n: 'nu', x: 'xi', p: 'pi', r: 'rho', s: 'sigma', t: 'tau', u: 'upsilon',
    f: 'phi', c: 'chi', y: 'psi', w: 'omega', G: 'Gamma', D: 'Delta', Q: 'Theta', L: 'Lambda', X: 'Xi', P: 'Pi', S: 'Sigma', F: 'Phi', Y: 'Psi', W: 'Omega' };
  /* A text of Origin in the markup of a figure here: \+(2) is an exponent, \-(c) an index, \g(a) a Greek letter; bold, italic, colour and font are dropped, their text kept.
     `named(k)` gives what %(k) stands for (the name of the k-th curve); a line that draws the sample of a curve (\l(2)) keeps its text only. */
  function originText(text, named) {
    let out = '', k = 0;
    const s = String(text || '').replace(/\r\n?/g, '\n');
    const group = (from) => { let depth = 0; for (let e = from; e < s.length; e++) { if (s[e] === '(') depth++; else if (s[e] === ')' && --depth === 0) return e; } return -1; };
    const literal = (t) => t.replace(/[\\_^]/g, '\\$&');
    const walk = (from, to) => {
      let o = '';
      for (let p = from; p < to; p++) {
        if (s[p] === '\\') {
          const m = /^\\(\+|-|=|g|b|i|u|ab|ad|x|l|L|f:[^()]*|c\d+|p\d+|s:\d+|q|v|t)\(/.exec(s.slice(p, Math.min(to, p + 60))), open = m ? p + m[0].length - 1 : -1, close = m ? group(open) : -1;
          if (m && close > 0 && close < to) {
            const kind = m[1], inner = walk(open + 1, close);
            if (kind === '+') o += '^{' + inner.replace(/[{}^_]/g, '') + '}';
            else if (kind === '-') o += '_{' + inner.replace(/[{}^_]/g, '') + '}';
            else if (kind === 'g') o += [...s.slice(open + 1, close)].map((ch) => (SYMBOL_GREEK[ch] ? '\\' + SYMBOL_GREEK[ch] + '{}' : literal(ch))).join('');
            else if (kind === 'l' || kind === 'L') o += '';                                      // the sample of a curve in a legend
            else o += inner;
            p = close; continue;
          }
          // a character by its number: \(x03C7) in hexadecimal, \(a197) and \(41) in decimal
          const code = /^\\\((x[0-9A-Fa-f]{1,6}|a?\d{1,7})\)/.exec(s.slice(p, Math.min(to, p + 12)));
          if (code) { const v = code[1][0] === 'x' ? parseInt(code[1].slice(1), 16) : parseInt(code[1].replace('a', ''), 10); if (v >= 32 && v <= 0x10ffff) o += literal(String.fromCodePoint(v)); p += code[0].length - 1; continue; }
          o += '\\\\'; continue;
        }
        if (s[p] === '%' && s[p + 1] === '(') { const close = s.indexOf(')', p); if (close > 0 && close < to) { const what = s.slice(p + 2, close), got = named ? named(what) : null; o += got != null ? got : ''; p = close; continue; } }
        o += s[p] === '_' || s[p] === '^' ? '\\' + s[p] : s[p];
      }
      return o;
    };
    out = walk(0, s.length); void k;
    return out.split('\n').map((line) => line.trim()).join('\n').replace(/\n+$/, '').slice(0, 2000);
  }
  const PLOT_TYPES = { 200: 'line', 201: 'scatter', 202: 'both', 203: 'bars', 204: 'area', 213: 'bars', 214: 'area', 215: 'bars', 216: 'bars', 246: 'line' };
  const NOT_DRAWN = { 219: 'a histogram, which Origin counts from the column: count it here with Analyse, Histogram', 206: 'a box chart', 225: 'a pie chart', 226: 'a contour plot', 220: 'an image of a matrix', 208: 'a plot of vectors', 232: 'a plot of texts' };
  const SHAPES = { 1: 'square', 2: 'circle', 3: 'triangle', 4: 'down', 5: 'diamond', 6: 'plus', 7: 'cross', 8: 'cross', 15: 'triangle', 16: 'triangle', 17: 'diamond', 18: 'diamond', 19: 'circle' };
  const DASH = { 1: 'dash', 2: 'dot', 3: 'dashdot', 4: 'dashdot', 5: 'dash', 6: 'dot', 7: 'dashdot' };
  /* One graph window: a panel for each layer that has its own place, the curves with their columns, the axes, the legend, the texts and the arrows.
     A layer laid over another (a second y axis) joins it as its right axis. What cannot be drawn here (3D, contours, pies, boxes) is named in `said`. */
  function graphOf(g, kept, keyOf) {
    const said = [], panels = [];
    const finite = (v) => (typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e300 ? Number(v.toPrecision(12)) : null);
    const over = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 && w * h > 0.6 * Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top)); };
    g.layers.forEach((layer) => {
      const R = layer.rect, W = R.right - R.left || 1, H = R.bottom - R.top || 1;
      const axis = (a) => { const log = a.scale === 1 || a.scale === 7 || a.scale === 8, lo = finite(a.min), hi = finite(a.max), reverse = lo != null && hi != null && lo > hi;
        return { label: '', scale: log ? 'log' : 'linear', min: reverse ? hi : lo, max: reverse ? lo : hi, step: !log && finite(a.step) > 0 ? finite(a.step) : null, reverse }; };
      const host = panels.find((p) => !p.y2 && over(p.rect, R)), side = host ? 'y2' : 'y';
      const panel = host || { rect: R, x: axis(layer.x), y: axis(layer.y), y2: null, legend: null, curves: [], notes: [], aspect: H / W };
      if (host) host.y2 = axis(layer.y); else panels.push(panel);
      // the curves: a column of errors belongs to the curve before it
      const mine = [];
      layer.curves.forEach((c, nth) => {
        if (!c.y || !kept.includes(c.y.book)) return;
        const table = keyOf(c.y.book), col = (e) => (e && e.book === c.y.book ? e.book.columns.indexOf(e.column) : null);
        if (c.type === 231 || c.type === 254 || c.type === 233) { const last = mine[mine.length - 1]; if (last && last.table === table) last[c.type === 233 ? 'xerr' : 'yerr'] = col(c.y); return; }
        if (c.type === 255) { const last = mine[mine.length - 1]; if (last && last.table === table) last.yerr = col(c.y); return; }
        const type = PLOT_TYPES[c.type];
        if (!type) { const what = NOT_DRAWN[c.type] || (c.type < 200 || c.type >= 236 ? 'a plot in three dimensions or of a special kind' : 'of a kind (' + c.type + ') that is not drawn here'); if (!said.some((t) => t.includes(what))) said.push('“' + g.name + '” holds ' + what + ': it was left'); return; }
        const colour = (type === 'scatter' ? colourOf(c.symbol, nth) : null) || colourOf(c.line, nth);
        const curve = { table, x: col(c.x), y: col(c.y), yerr: null, xerr: null, axis: side, type: type === 'line' && c.connect >= 11 && c.connect <= 14 ? 'steps' : type, color: colour, show: !c.hidden,
          width: c.width >= 0.1 && c.width <= 10 ? Number(c.width.toFixed(2)) : null, dash: DASH[c.style] || 'solid', marker: SHAPES[c.shape] || 'circle', size: c.size >= 1 && c.size <= 30 ? Number(Math.min(12, c.size / 2).toFixed(1)) : null, open: c.interior === 1 || c.interior === 2,
          label: '', title: (c.y.column.title || c.y.column.name) };
        mine.push(curve); panel.curves.push(curve);
      });
      // curves stacked by an offset: the file says the range of the axis, not the offset, so that the curves would lie flat at one end of it. The range is then left to the data.
      const spanOf = (axisName, pick) => { let lo = Infinity, hi = -Infinity; mine.filter((c) => c.axis === axisName).forEach((c) => { const b = kept.find((k) => keyOf(k) === c.table), col = b.columns[pick(c)]; if (col) col.values.forEach((v) => { if (typeof v === 'number') { if (v < lo) lo = v; if (v > hi) hi = v; } }); }); return hi > lo ? [lo, hi] : null; };
      const ySide = host ? host.y2 : panel.y, data = spanOf(side, (c) => c.y);
      if (data && ySide.min != null && ySide.max != null && ySide.scale === 'linear' && (ySide.max - ySide.min) > 5 * (data[1] - data[0]) && mine.length > 2) {
        ySide.min = ySide.max = ySide.step = null;
        said.push('the curves of “' + g.name + '” were drawn apart by an offset that the file does not say: they are drawn here without it (each curve can be shifted, under Curves)');
      }
      // what is written on the layer
      const named = (what) => { const m = /^(\d+)/.exec(what); if (m) { const c = mine[Number(m[1]) - 1]; return c ? c.title : ''; }
        const first = mine[0], col = first ? kept.find((b) => keyOf(b) === first.table).columns[/X/i.test(what) ? first.x : first.y] : null; return col ? (col.title || col.name) + (col.unit ? ' (' + col.unit + ')' : '') : ''; };
      layer.notes.forEach((n) => {
        const name = cstring(n.head, 0x46, 41), kind = n.head[0x02], attach = n.head[0x28], box = { left: i16s(n.head, 0x03), top: i16s(n.head, 0x05), right: i16s(n.head, 0x07), bottom: i16s(n.head, 0x09) };
        const text = originText(cstring(n.d2, 0), named), where = (px, py) => [Number(((px - R.left) / W).toFixed(4)), Number((1 - (py - R.top) / H).toFixed(4))];
        const colour = colourOf(n.head.subarray(0x33, 0x37)) || '#000000';
        if (name === 'XB') { if (attach !== 0x32 && text) panel.x.label = text.replace(/\n/g, ' '); }
        else if (name === 'YL' || name === 'YR') { if (attach !== 0x32 && text) panel[name === 'YR' && !host ? (panel.y2 ? 'y2' : 'y') : side].label = text.replace(/\n/g, ' '); }
        else if (/^legend$/i.test(name)) {
          const lines = String(cstring(n.d2, 0)).split(/\r\n|\n/);
          lines.forEach((line) => { const m = /\\[lL]\((\d+)\)\s*(.*)$/.exec(line); if (!m) return; const c = mine[Number(m[1]) - 1], own = originText(m[2], named).trim(); if (c && own && own !== c.title) c.label = own; });
          if (!panel.legend) { const [x, y] = where(box.left, box.top); panel.legend = { x: Math.min(0.95, Math.max(0, x)), y: Number(Math.min(0.95, Math.max(0, 1 - y)).toFixed(4)) }; }
        } else if (kind === 0x22 && !/^sline$/i.test(name)) {
          const d = n.d1, straight = d[0] === 2;
          let a = null, b = null, coords = 'axes';
          if (attach === 2 && d.length > 0x5f && straight) { a = [f64s(d, 0x20), f64s(d, 0x40)]; b = [f64s(d, 0x28), f64s(d, 0x48)]; coords = 'data'; }
          else if (straight) { const x1 = i16s(d, 0x01), x2 = i16s(d, 0x03), y1 = i16s(d, 0x09), y2 = i16s(d, 0x0b), dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1), bw = box.right - box.left, bh = box.bottom - box.top;
            const px = (v) => (dx ? box.left + (v - Math.min(x1, x2)) / dx * bw : box.left + bw / 2), py = (v) => (dy ? box.top + (v - Math.min(y1, y2)) / dy * bh : box.top + bh / 2);
            a = where(px(x1), py(y1)); b = where(px(x2), py(y2)); }
          const arrows = d.length > 0x77 ? (d[0x60] ? 1 : 0) + (d[0x6c] ? 2 : 0) : d.length > 0x11 ? d[0x11] : 0;
          if (a && b && [a[0], a[1], b[0], b[1]].every((v) => isFinite(v))) { const from = arrows === 1 ? b : a, to = arrows === 1 ? a : b; panel.notes.push({ type: arrows ? 'arrow' : 'line', coords, x: from[0], y: from[1], x2: to[0], y2: to[1], both: arrows === 3, color: colour, width: 0.8 }); }
        } else if (kind === 0 && text && !/^(P[LRBT]|S[LRBT]|O[LRBT]|[XYZ]1T|XT|ZF|ZB|3D|__BCO2|_206|ZCOLORS|SPECTRUM1|&0|DelData|PIE.*)$/.test(name)) {
          const [x, y] = where(box.left, box.top + (box.bottom - box.top) * 0.75 / Math.max(1, text.split('\n').length));
          if (x > -0.5 && x < 1.5 && y > -0.5 && y < 1.5) panel.notes.push({ type: 'text', coords: 'axes', x, y, text, color: colour });
        }
      });
    });
    // side by side or one under the other, from where the layers stand on the page
    const tops = panels.map((p) => p.rect.top), sameRow = panels.length > 1 && Math.max(...tops) - Math.min(...tops) < 0.3 * Math.min(...panels.map((p) => p.rect.bottom - p.rect.top));
    panels.sort((a, b) => (sameRow ? a.rect.left - b.rect.left : a.rect.top - b.rect.top));
    return { name: g.name, cols: sameRow ? panels.length : 1, said, panels: panels.filter((p) => p.curves.length).map((p) => ({ x: p.x, y: p.y, y2: p.y2, legend: p.legend, aspect: Number(Math.min(3, Math.max(0.3, p.aspect)).toFixed(3)), curves: p.curves, notes: p.notes })) };
  }
  const i16s = (b, at) => (at + 2 <= b.length ? new DataView(b.buffer, b.byteOffset, b.byteLength).getInt16(at, true) : 0);
  const f64s = (b, at) => (at + 8 <= b.length ? new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(at, true) : NaN);

  // ------------------------------------------------------------------ which reader
  const KINDS = { xlsx: 'xlsx', xlsm: 'xlsx', ods: 'ods', opj: 'origin', org: 'origin', opju: 'origin' };
  /* What a file is, by its name and by its first bytes; null when it is to be read as text. */
  function kind(name, bytes) {
    const u8 = bytes ? bytesOf(bytes) : null, ext = (/\.([A-Za-z0-9]+)$/.exec(name || '') || [])[1];
    if (u8 && u8.length > 4 && u8[0] === 0x43 && u8[1] === 0x50 && u8[2] === 0x59 && (u8[3] === 0x41 || u8[3] === 0x55)) return 'origin';        // CPYA, CPYUA
    if (u8 && u8.length > 8 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return 'xls';                              // the old binary files of Office
    const k = ext ? KINDS[ext.toLowerCase()] : null;
    if (k === 'origin' && u8 && ext.toLowerCase() === 'org') return null;                                                                  // .org without Origin's first bytes: a text file of that name
    if (k === 'xlsx' || k === 'ods') return u8 && !(u8[0] === 0x50 && u8[1] === 0x4b) ? null : k;                                             // a zip starts with PK
    return k || (ext && ext.toLowerCase() === 'xls' ? 'xls' : null);
  }
  async function read(bytes, name) {
    const k = kind(name, bytes), stem = String(name || 'file').replace(/\.[A-Za-z0-9]+$/, '');
    if (k === 'xls') throw new Error('an Excel file of before 2007 (.xls) is not read: open it and save it as .xlsx, or as CSV');
    if (k === 'origin') { const tables = origin(bytes), out = tables.map((t) => Object.assign(t, { name: stem + ' · ' + t.name })); out.graphs = tables.graphs; out.left = tables.left; return out; }
    const tables = k === 'xlsx' ? await xlsx(bytes) : k === 'ods' ? await ods(bytes) : null;
    if (!tables) throw new Error('this file is read as text');
    if (!tables.length) throw new Error('no sheet of this file holds anything');
    return tables.map((t) => ({ name: tables.length > 1 ? stem + ' · ' + t.name : stem, text: t.text }));
  }

  ASY.files = { kind, read, unzip, xlsx, ods, origin, originText, walk, tsv };
})(window.ASY);
