/* A sheet on screen: a grid that draws only the rows in sight, so that a hundred thousand rows
 * scroll as ten do. Click a cell and type; drag or shift-arrow to select; copy and paste go
 * through the clipboard as tab-separated text, so they work with a spreadsheet in both directions.
 *
 *     const grid = ASY.grid(el, { sheet: () => sheet, changed: (what) => …, picked: () => … })
 *     grid.draw()            after the sheet changed
 *     grid.selection()       { columns: [ids], rows: [first, last] }
 *
 * The model holds the data (model.js); this file only shows a window of it and edits cells. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, M = ASY.model;
  const COLW = 116, ROWH = 24, GUT = 58, HEAD = 46, ROLE = { x: 'X', y: 'Y', yerr: 'yEr', xerr: 'xEr', label: 'L', none: '–' };

  ASY.grid = function (root, ctx) {
    let sel = { c: 0, r: 0, c2: 0, r2: 0, cols: false }, editing = null, dragging = false, drawnFrom = -1, drawnTo = -1;
    const head = h('div', { class: 'grid-head' }), rowsEl = h('div', { class: 'grid-rows' }), canvas = h('div', { class: 'grid-canvas' }, head, rowsEl);
    root.classList.add('grid'); root.tabIndex = 0; ASY.fill(root, canvas);
    const sheet = () => ctx.sheet();
    const count = () => { const s = sheet(); return s ? Math.max(M.rows(s) + 40, Math.ceil(root.clientHeight / ROWH) + 2) : 0; };
    const box = () => ({ c0: Math.min(sel.c, sel.c2), c1: Math.max(sel.c, sel.c2), r0: Math.min(sel.r, sel.r2), r1: Math.max(sel.r, sel.r2) });
    /* A cell shows its number in full while that stays readable: 1000000, not 1e6. */
    const show = (v) => { if (v == null) return ''; if (typeof v !== 'number') return ASY.escapeXml(v); const a = Math.abs(v); return a !== 0 && (a >= 1e10 || a < 1e-4) ? ASY.fmt(v, 9) : String(Number(v.toPrecision(10))).replace('-', '−'); };

    function drawHead() {
      const s = sheet(); if (!s) return;
      const b = box();
      ASY.fill(head, ...[h('div', { class: 'gh corner', style: 'width:' + GUT + 'px', title: 'Select everything', onclick: () => { sel = { c: 0, r: 0, c2: s.columns.length - 1, r2: Math.max(0, M.rows(s) - 1), cols: true }; redraw(); ctx.picked(); } }, M.rows(s) + ' rows'),
        s.columns.map((c, i) => {
          const bad = M.errors[c.id];
          return h('button', { class: 'gh' + (i >= b.c0 && i <= b.c1 ? ' on' : ''), type: 'button', style: 'width:' + COLW + 'px', 'data-col': i, title: (bad ? 'The formula could not be computed: ' + bad + '\n' : '') + (c.comment || M.label(c)),
            onclick: (e) => { root.focus(); const last = Math.max(0, M.rows(s) - 1); sel = e.shiftKey ? { c: sel.c, r: 0, c2: i, r2: last, cols: true } : { c: i, r: 0, c2: i, r2: last, cols: true }; redraw(); ctx.picked(); } },
            h('b', {}, c.name, h('i', { class: 'r-' + c.role }, ROLE[c.role]), c.formula ? h('i', { class: bad ? 'bad' : 'f' }, bad ? '= !' : '=') : null),
            h('span', {}, M.label(c) === c.name ? ' ' : M.label(c)));
        }),
        h('button', { class: 'gh add', type: 'button', style: 'width:44px', title: 'Add a column', onclick: () => { M.addColumn(s, {}); ctx.changed('structure'); } }, '+')].flat());
      canvas.style.width = GUT + s.columns.length * COLW + 44 + 'px';
      canvas.style.height = HEAD + count() * ROWH + 'px';
    }
    function drawRows(force) {
      const s = sheet(); if (!s) { rowsEl.innerHTML = ''; return; }
      const first = Math.max(0, Math.floor(root.scrollTop / ROWH) - 8), last = Math.min(count(), first + Math.ceil(root.clientHeight / ROWH) + 16);
      if (!force && first === drawnFrom && last === drawnTo) return;
      drawnFrom = first; drawnTo = last;
      const b = box(), cols = s.columns;
      let html = '';
      for (let r = first; r < last; r++) {
        html += '<div class="gr" style="top:' + (HEAD + r * ROWH) + 'px"><div class="gn" style="width:' + GUT + 'px">' + (r + 1) + '</div>';
        for (let c = 0; c < cols.length; c++) {
          const v = cols[c].values[r], inSel = r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
          html += '<div class="gc' + (typeof v === 'string' ? ' t' : '') + (inSel ? ' sel' : '') + (r === sel.r && c === sel.c ? ' cur' : '') + (cols[c].formula ? ' ro' : '') + '" style="width:' + COLW + 'px">' + show(v) + '</div>';
        }
        html += '</div>';
      }
      rowsEl.innerHTML = html;
    }
    function redraw() { drawHead(); drawRows(true); }
    function reveal() {
      const top = sel.r2 * ROWH, left = GUT + sel.c2 * COLW;
      if (top < root.scrollTop) root.scrollTop = top; else if (top + ROWH + HEAD > root.scrollTop + root.clientHeight) root.scrollTop = top + ROWH + HEAD - root.clientHeight;
      if (left - GUT < root.scrollLeft) root.scrollLeft = left - GUT; else if (left + COLW > root.scrollLeft + root.clientWidth) root.scrollLeft = left + COLW - root.clientWidth;
    }
    const at = (e) => { const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return { c: Math.floor((x - GUT) / COLW), r: Math.floor((y - HEAD) / ROWH), gutter: x < GUT }; };

    // ------------------------------------------------------------------ editing a cell
    function edit(initial) {
      const s = sheet(), col = s && s.columns[sel.c]; if (!col) return;
      if (col.formula) { ctx.say('This column is computed by its formula (' + col.name + ' = ' + col.formula + '): change the formula, or clear it to type values.'); return; }
      commitEdit();
      const v = col.values[sel.r];
      const input = h('input', { class: 'grid-edit', type: 'text', value: initial != null ? initial : v == null ? '' : String(v), style: 'left:' + (GUT + sel.c * COLW) + 'px;top:' + (HEAD + sel.r * ROWH) + 'px;width:' + COLW + 'px;height:' + ROWH + 'px',
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitEdit(); move(0, e.shiftKey ? -1 : 1); }
          else if (e.key === 'Tab') { e.preventDefault(); commitEdit(); move(e.shiftKey ? -1 : 1, 0); }
          else if (e.key === 'Escape') { e.preventDefault(); editing = null; input.remove(); root.focus(); }
          e.stopPropagation();
        }, onblur: () => commitEdit() });
      editing = { input, c: sel.c, r: sel.r };
      canvas.append(input); input.focus(); if (initial == null) input.select();
    }
    function commitEdit() {
      if (!editing) return;
      const { input, c, r } = editing; editing = null;
      const s = sheet(), col = s && s.columns[c];
      if (col) { const before = col.values[r] == null ? null : col.values[r]; M.setCell(s, col, r, input.value); if (before !== (col.values[r] == null ? null : col.values[r])) ctx.changed('data'); }
      input.remove(); root.focus({ preventScroll: true });
    }
    function move(dc, dr, extend) {
      const s = sheet(); if (!s) return;
      const c = ASY.clamp((extend ? sel.c2 : sel.c) + dc, 0, s.columns.length - 1), r = Math.max(0, (extend ? sel.r2 : sel.r) + dr);
      sel = extend ? Object.assign({}, sel, { c2: c, r2: r, cols: false }) : { c, r, c2: c, r2: r, cols: false };
      reveal(); redraw(); ctx.picked();
    }
    function clear() {
      const s = sheet(), b = box(); let any = false;
      for (let c = b.c0; c <= b.c1; c++) { const col = s.columns[c]; if (!col || col.formula) continue; for (let r = b.r0; r <= Math.min(b.r1, col.values.length - 1); r++) if (col.values[r] != null) { col.values[r] = null; any = true; } while (col.values.length && col.values[col.values.length - 1] == null) col.values.pop(); }
      if (any) ctx.changed('data');
    }
    function copied() {
      const s = sheet(), b = box(), lines = [];
      for (let r = b.r0; r <= Math.min(b.r1, Math.max(0, M.rows(s) - 1)); r++) { const cells = []; for (let c = b.c0; c <= b.c1; c++) { const v = s.columns[c].values[r]; cells.push(v == null ? '' : String(v)); } lines.push(cells.join('\t')); }
      return lines.join('\n');
    }
    /* Text from the clipboard, written from the selected cell on. Columns are added when it is wider than the sheet. */
    function paste(text) {
      const s = sheet(); if (!s) return;
      const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
      const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.every((l) => l.includes(';')) ? ';' : null;
      const table = lines.map((l) => (sep ? l.split(sep) : l.trim().split(/\s+/)));
      const c0 = Math.min(sel.c, sel.c2), r0 = Math.min(sel.r, sel.r2), width = Math.max(...table.map((t) => t.length));
      while (s.columns.length < c0 + width) M.addColumn(s, {});
      let skipped = 0;
      for (let k = 0; k < width; k++) {
        const col = s.columns[c0 + k];
        if (col.formula) { skipped++; continue; }
        while (col.values.length < r0) col.values.push(null);
        for (let i = 0; i < table.length; i++) col.values[r0 + i] = M.cell(table[i][k]);
        while (col.values.length && col.values[col.values.length - 1] == null) col.values.pop();
      }
      sel = { c: c0, r: r0, c2: c0 + width - 1, r2: r0 + table.length - 1, cols: false };
      ctx.changed('structure');
      if (skipped) ctx.say(skipped + ' column' + (skipped > 1 ? 's are' : ' is') + ' computed by a formula and was not written over.');
    }

    root.addEventListener('scroll', () => drawRows(false));
    root.addEventListener('mousedown', (e) => {
      if (e.target.closest('.grid-head') || e.target === editing?.input) return;
      const p = at(e), s = sheet(); if (!s || p.r < 0) return;
      commitEdit();
      if (p.gutter) sel = { c: 0, r: p.r, c2: s.columns.length - 1, r2: p.r, cols: false };
      else if (p.c >= 0 && p.c < s.columns.length) sel = e.shiftKey ? Object.assign({}, sel, { c2: p.c, r2: p.r, cols: false }) : { c: p.c, r: p.r, c2: p.c, r2: p.r, cols: false };
      else return;
      dragging = true; redraw(); ctx.picked();
    });
    root.addEventListener('mousemove', (e) => { if (!dragging) return; const p = at(e), s = sheet(); const c = ASY.clamp(p.c, 0, s.columns.length - 1), r = Math.max(0, p.r); if (c !== sel.c2 || r !== sel.r2) { sel.c2 = c; sel.r2 = r; redraw(); } });
    window.addEventListener('mouseup', () => { if (dragging) { dragging = false; ctx.picked(); } });
    root.addEventListener('dblclick', (e) => { if (!e.target.closest('.grid-head')) edit(); });
    root.addEventListener('keydown', (e) => {
      if (editing) return;
      const s = sheet(); if (!s) return;
      const page = Math.max(1, Math.floor(root.clientHeight / ROWH) - 2), mod = e.ctrlKey || e.metaKey;
      const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], PageUp: [0, -page], PageDown: [0, page] };
      if (keys[e.key]) { e.preventDefault(); const [dc, dr] = keys[e.key]; if (mod && dr) move(0, dr < 0 ? -1e9 : Math.max(0, M.rows(s) - 1) - (e.shiftKey ? sel.r2 : sel.r), e.shiftKey); else move(dc, dr, e.shiftKey); }
      else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); edit(); }
      else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clear(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = { c: 0, r: 0, c2: s.columns.length - 1, r2: Math.max(0, M.rows(s) - 1), cols: true }; redraw(); ctx.picked(); }
      else if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); edit(e.key); }
    });
    root.addEventListener('copy', (e) => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', copied()); });
    root.addEventListener('cut', (e) => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', copied()); clear(); });
    root.addEventListener('paste', (e) => { if (editing) return; e.preventDefault(); const text = e.clipboardData.getData('text/plain'); if (text) paste(text); });

    return {
      draw() { const s = sheet(); if (s) { sel.c = ASY.clamp(sel.c, 0, Math.max(0, s.columns.length - 1)); sel.c2 = ASY.clamp(sel.c2, 0, Math.max(0, s.columns.length - 1)); } redraw(); },
      /* The columns the selection covers, and its rows. */
      selection() { const s = sheet(), b = box(); return { columns: s ? s.columns.slice(b.c0, b.c1 + 1).map((c) => c.id) : [], rows: [b.r0, b.r1], whole: sel.cols }; },
      select(index) { const s = sheet(); sel = { c: index, r: 0, c2: index, r2: Math.max(0, M.rows(s) - 1), cols: true }; redraw(); },
      paste, copied, focus: () => root.focus({ preventScroll: true }), reset() { sel = { c: 0, r: 0, c2: 0, r2: 0, cols: false }; root.scrollTop = root.scrollLeft = 0; drawnFrom = -1; },
    };
  };
})(window.ASY);
