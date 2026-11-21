/* Reading data from text: a file of an instrument, a CSV, what was copied from a spreadsheet.
 *
 *     ASY.importer.read(text, name)   →   { name, columns: [{ title, unit, values }], said: [...] }
 *
 * `detect` looks at the text and says how it reads it (what separates the columns, whether the
 * decimal mark is a comma, how many lines come before the numbers, which line names the columns);
 * `parse` reads it that way. The person sees the detection and can change it before importing.
 * Nothing here draws, and nothing is sent anywhere: a file is read in the browser. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const SEPARATORS = { tab: '\t', semicolon: ';', comma: ',', space: ' ' };
  const NUMBER = /^[-+−]?(\d+[.,]?\d*|[.,]\d+)([eEdD][-+]?\d+)?$/;
  const number = (cell, comma) => {
    let s = cell.trim().replace('−', '-');
    if (!s) return null;
    if (comma) s = s.replace(/\./g, '').replace(',', '.');
    s = s.replace(/[dD]([-+]?\d+)$/, 'e$1');                         // Fortran's 1.0D-3
    if (/^[-+]?(nan|inf(inity)?)$/i.test(s)) return null;
    const v = Number(s);
    return isNaN(v) ? undefined : v;                                  // undefined: this is text
  };
  function split(line, sep) {
    if (sep === ' ') return line.trim().split(/\s+/);
    if (!line.includes('"')) return line.split(sep);
    const out = []; let cur = '', quoted = false;                     // a CSV field in quotes may hold the separator
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (ch === sep && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  const numeric = (c) => NUMBER.test(c.trim()) || /^[-+]?(nan|inf(inity)?)$/i.test(c.trim());
  /* A line of data: it starts with a number, and most of what it holds are numbers (a column of labels or of notes does not make it a heading). */
  const isNumbers = (cells) => { const full = cells.filter((c) => c.trim()); return full.length > 0 && numeric(full[0]) && full.filter(numeric).length * 2 >= full.length; };

  /* How this text is read. */
  function detect(text) {
    const lines = text.split(/\r\n|\n|\r/);
    const sample = lines.filter((l) => l.trim()).slice(0, 400);
    // the separator: the one that cuts the most lines into the same number (more than one) of fields
    let best = { sep: 'space', score: -1 };
    for (const key of ['tab', 'semicolon', 'comma', 'space']) {
      const counts = {};
      for (const l of sample) { const n = split(l, SEPARATORS[key]).length; if (n > 1) counts[n] = (counts[n] || 0) + 1; }
      const top = Math.max(0, ...Object.values(counts));
      const score = top + (key === 'space' ? -0.5 : 0);               // at equal score, a real separator wins over blanks
      if (score > best.score) best = { sep: key, score };
    }
    const sep = SEPARATORS[best.sep];
    // the decimal mark: a comma, when numbers are written 3,14 and the comma is not what separates the columns
    let commaLike = 0, dotLike = 0;
    for (const l of sample) for (const c of split(l, sep)) { const s = c.trim(); if (/^[-+]?\d+,\d+([eE][-+]?\d+)?$/.test(s)) commaLike++; else if (/^[-+]?\d*\.\d+([eE][-+]?\d+)?$/.test(s)) dotLike++; }
    const comma = best.sep !== 'comma' && commaLike > dotLike;
    // the first line of numbers: the start of the longest run of lines that are all numbers, with the same count
    let first = 0, run = 0, bestRun = 0, bestStart = 0, width = 0, bestWidth = 0;
    lines.forEach((l, i) => {
      const cells = l.trim() ? split(l, sep) : [];
      const ok = cells.length > 0 && isNumbers(cells, comma) && !/^\s*[#%!;]/.test(l);
      if (ok && (run === 0 || cells.length === width)) { if (run === 0) { first = i; width = cells.length; } run++; }
      else if (ok) { first = i; run = 1; width = cells.length; }
      else if (l.trim()) run = 0;
      if (run > bestRun) { bestRun = run; bestStart = first; bestWidth = width; }
    });
    // the names of the columns: the last line before the numbers that has as many fields as they do
    let header = -1;
    for (let i = bestStart - 1; i >= 0 && i >= bestStart - 4; i--) {
      const l = lines[i].replace(/^\s*[#%!;]+\s*/, '');
      if (!l.trim()) continue;
      let cells = split(l, sep);
      if (cells.length !== bestWidth && sep !== ' ') cells = split(l, ' ').length === bestWidth ? split(l, ' ') : cells;
      if (cells.length === bestWidth && !isNumbers(cells, comma)) { header = i; break; }
      if (lines[i].trim()) break;
    }
    return { separator: best.sep, comma, skip: bestStart, header, columns: bestWidth, lines: lines.length, rows: bestRun };
  }

  /* "Energy (eV)" or "Energy [eV]" or "Energy/eV": a title and a unit. */
  function titleUnit(text) {
    const s = text.trim().replace(/^"|"$/g, '');
    const m = /^(.*?)\s*[([]\s*([^()[\]]{1,30})\s*[)\]]\s*$/.exec(s) || /^([^/]+?)\s*\/\s*([^/\s]{1,20})$/.exec(s);
    return m ? { title: m[1].trim(), unit: m[2].trim() } : { title: s, unit: '' };
  }

  function parse(text, how) {
    how = Object.assign(detect(text), how || {});
    const sep = SEPARATORS[how.separator] || '\t', lines = text.split(/\r\n|\n|\r/);
    const strip = (l) => l.replace(/^\s*[#%!;]+\s*/, '');
    let names = [];
    if (how.header >= 0 && how.header < lines.length) { names = split(strip(lines[how.header]), sep); if (names.length !== how.columns && sep !== ' ') { const alt = split(strip(lines[how.header]), ' '); if (alt.length === how.columns) names = alt; } }
    const columns = [];
    let rows = 0, skipped = 0;
    for (let i = how.skip; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim() || /^\s*[#%!;]/.test(l)) { if (l.trim()) skipped++; continue; }
      const cells = split(l, sep);
      for (let c = 0; c < cells.length; c++) {
        if (!columns[c]) columns[c] = new Array(rows).fill(null);
        const v = number(cells[c], how.comma);
        columns[c][rows] = v === undefined ? cells[c].trim().slice(0, 200) : v;
      }
      for (let c = cells.length; c < columns.length; c++) columns[c][rows] = null;
      rows++;
      if (rows >= 500000) break;
    }
    const meta = lines.slice(0, Math.min(how.skip, 60)).filter((l, i) => l.trim() && i !== how.header).map(strip);
    return { how, rows, skipped, meta,
      columns: columns.map((values, c) => Object.assign({ values }, titleUnit(names[c] != null ? names[c] : ''))) };
  }

  /* A Tektronix RSA .Specan file: XML holding a trace as a start, a stop and the values. */
  function specan(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('this file is not readable XML');
    const traces = [...doc.querySelectorAll('Waveform')].filter((w) => w.querySelector('y'));
    if (!traces.length) throw new Error('no trace was found in this file');
    const get = (w, tag) => { const el = w.querySelector(':scope > ' + tag); return el ? el.textContent.trim() : ''; };
    const columns = [];
    traces.forEach((w, k) => {
      const ys = [...w.querySelectorAll(':scope > y')].map((y) => Number(y.textContent));
      const a = Number(get(w, 'XStart')), b = Number(get(w, 'XStop')), n = ys.length;
      if (k === 0 || columns[0].values.length !== n) columns.push({ title: 'Frequency', unit: get(w, 'XUnits') || 'Hz', values: ys.map((_, i) => (n > 1 ? a + (b - a) * i / (n - 1) : a)), role: 'x' });
      columns.push({ title: w.getAttribute('name') || 'Trace ' + (k + 1), unit: get(w, 'YUnits') || '', values: ys });
    });
    return { how: { format: 'specan' }, rows: columns[0].values.length, skipped: 0, meta: ['Tektronix RSA spectrum (.Specan)'], columns };
  }

  /* Read a file by what it is. */
  function read(text, name) {
    const base = String(name || 'data').replace(/\.[A-Za-z0-9]+$/, '');
    if (/^\s*<\?xml|^\s*<RSAPersist/.test(text.slice(0, 400)) && typeof DOMParser !== 'undefined') return Object.assign(specan(text), { name: base });
    return Object.assign(parse(text), { name: base });
  }

  ASY.importer = { detect, parse, read, specan, titleUnit, SEPARATORS };
})(window.ASY);
