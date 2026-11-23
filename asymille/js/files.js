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
      const entry = { book: null }; datasets.push(entry);
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

    // the windows: a worksheet says there what each of its columns is (X, Y, an error) and how it is called. Not finding them loses the names, not the values.
    const said = [];
    try {
      const annotations = () => { for (;;) { const hlen = size(); if (!hlen) break; block(hlen); const d1 = size(); block(d1); const d2 = size(); if ((d1 === 0x5e || d1 === 0x0a) && d2 === 0x04) annotations(); else block(d2); block(size()); } };
      const list = () => { for (;;) { const len = size(); if (!len) break; block(len); } };
      for (;;) {
        const wlen = size(); if (!wlen) break;
        const w = block(wlen), window = cstring(w, 0x02, 25);
        for (;;) {
          const llen = size(); if (!llen) break;
          block(llen); annotations();
          for (;;) {                                                  // in a worksheet, the curves of a layer are its columns
            const clen = size(); if (!clen) break;
            const c = block(clen), text = block(size());
            if (c.length < 0x14) continue;
            const id = new DataView(c.buffer, c.byteOffset, c.byteLength).getUint16(0x04, true), named = cstring(c, 0x12, 25);
            const entry = datasets[id - 1], column = entry && entry.column && entry.book.name === window && entry.column.name.slice(0, 11) === named.slice(0, 11) ? entry.column
              : (books.filter((b) => b.name === window).flatMap((b) => b.columns).find((k) => k.role === null && k.name.slice(0, 11) === named.slice(0, 11)) || null);
            if (!column) continue;
            column.role = ROLES[c[0x11]] || 'y';
            // the label rows of a column: its long name, its unit, its comments, one under the other; what follows an @ is Origin's own
            const label = cstring(text, 0).split('@${')[0].split(/\r\n|\n/).map((s) => s.trim());
            if (label[0]) column.title = label[0].slice(0, 120);
            if (label[1]) column.unit = label[1].slice(0, 40);
          }
          list(); list(); list(); list();                              // axis breaks, then what is said of the x, y and z axes
        }
      }
    } catch (e) { said.push('The long names and the roles of some columns could not be read (' + e.message + '): those keep their short name, and the first column of such a sheet is taken as x.'); }

    const sheetsOf = {}; books.forEach((b) => { sheetsOf[b.name] = (sheetsOf[b.name] || 0) + 1; });
    return books.filter((b) => b.columns.some((c) => c.values.some((v) => typeof v === 'number'))).map((b) => {            // a sheet without one number is a table of Origin's own, or empty
      const known = b.columns.some((c) => c.role !== null);
      return { name: b.name + (sheetsOf[b.name] > 1 ? ' · sheet ' + b.sheet : ''), said,
        read: { rows: Math.max(...b.columns.map((c) => c.values.length)), skipped: 0, meta: ['a worksheet of an Origin project' + (version ? ', version ' + version : '')],
          columns: b.columns.map((c, i) => ({ title: c.title || c.name, unit: c.unit, role: known ? c.role || 'y' : i === 0 ? 'x' : 'y', values: c.values })) } };
    });
  }

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
    if (k === 'origin') return origin(bytes).map((t) => Object.assign(t, { name: stem + ' · ' + t.name }));
    const tables = k === 'xlsx' ? await xlsx(bytes) : k === 'ods' ? await ods(bytes) : null;
    if (!tables) throw new Error('this file is read as text');
    if (!tables.length) throw new Error('no sheet of this file holds anything');
    return tables.map((t) => ({ name: tables.length > 1 ? stem + ' · ' + t.name : stem, text: t.text }));
  }

  ASY.files = { kind, read, unzip, xlsx, ods, origin, walk, tsv };
})(window.ASY);
