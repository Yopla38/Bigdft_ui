/* A graph on screen: the figure as it will be printed, on a white page, and what a hand does to it.
 *
 *     const view = ASY.figview(el, ctx)     ctx: graph(), tool(), fit(), changed(), picked(key), readout(text)
 *     view.draw()
 *
 * The figure is laid out by plot.js; this file shows its SVG and turns the pointer into changes
 * of the figure: drag a rectangle to zoom, drag to move, wheel to zoom about the pointer,
 * double-click to see everything again; drag across x to set the range of the fit; drag the
 * legend, the title of an axis, a text, a line or an arrow (by its middle, or by one end);
 * double-click a text (a name in the legend, the title of an axis, a note) to rewrite it where
 * it is; click a curve to select it. A change made by hand is a change of the figure (its axes,
 * its legend, its notes): it is saved and exported like any other. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const h = ASY.h, P = ASY.plot, M = ASY.model;

  ASY.figview = function (root, ctx) {
    const paper = h('div', { class: 'paper' }), note = h('p', { class: 'paper-note' }), stage = h('div', { class: 'stage' }, paper), readout = h('span', { class: 'readout', id: 'readout' });
    let list = null, zoom = 'fit', drag = null, band = null;
    ASY.fill(root, stage, readout);

    function draw() {
      const g = ctx.graph(); if (!g) return;
      const fig = g.figure;
      list = P.layout(fig, M.seriesData);
      // on screen only: the range of the fit being worked on, as two faint curtains over what is left out
      const f = ctx.fit();
      const items = list.items.slice();
      if (f && f.limits) list.hit.panels.forEach((hp) => {
        const p = fig.panels[hp.index];
        if (!p.series.some((r) => (r.kind === 'data' && r.sheet === f.sheet && r.y === f.y) || (r.kind === 'fit' && r.fit === f.id))) return;
        const b = hp.box, cut = (lo, hi) => { const a = ASY.clamp(lo, b.x, b.x + b.w), c = ASY.clamp(hi, b.x, b.x + b.w); if (c - a > 0.2) items.push({ t: 'poly', pts: [a, b.y, c, b.y, c, b.y + b.h, a, b.y + b.h], fill: '#000000', opacity: 0.07 }); };
        const [lo, hi] = f.limits, xa = lo == null ? null : hp.sx.map(lo), xb = hi == null ? null : hp.sx.map(hi);
        const left = Math.min(xa == null ? Infinity : xa, xb == null ? Infinity : xb), right = Math.max(xa == null ? -Infinity : xa, xb == null ? -Infinity : xb);
        if (isFinite(left)) cut(b.x, Math.min(left, right)); if (isFinite(right)) cut(Math.max(left, right), b.x + b.w);
      });
      // on screen only: the two ends of the line or the arrow that is selected, to take it by
      const chosen = ctx.note ? ctx.note() : null;
      if (chosen) fig.panels.forEach((p, i) => p.notes.forEach((n) => {
        const hp = list.hit.panels.find((q) => q.index === i);
        if (n.id !== chosen || !hp || (n.type !== 'line' && n.type !== 'arrow')) return;
        const pts = ends(n, hp).flat();
        if (pts.every(isFinite)) items.push({ t: 'marks', pts, size: 5, fill: '#ffffff', stroke: '#0a7286', width: 0.9, verts: P.MARKERS.square.verts, k: 'note:' + n.id });
      }));
      // a panel of residuals with nothing in it says why
      const empty = fig.panels.some((p) => p.series.some((r) => r.kind === 'fit' && r.part === 'residuals' && r.show !== false && !M.seriesData(r)));
      paper.innerHTML = P.svg(Object.assign({}, list, { items }), { keys: true });
      paper.append(note);
      const mm = 96 / 25.4, room = stage.clientWidth - 44, roomH = stage.clientHeight - 64;
      const scale = zoom === 'fit' ? Math.min(room / (fig.width * mm), roomH / (fig.height * mm), 3.2) : zoom;
      paper.style.width = Math.max(120, fig.width * mm * scale) + 'px';
      paper.className = 'paper tool-' + ctx.tool();
      ASY.fill(note, fig.width + ' × ' + fig.height + ' mm · shown at ' + Math.round(scale * 100) + ' %' + (list.items.some((it) => it.t === 'marks' && it.pts.length >= 40000) ? ' · every symbol could not be drawn: only one in a few is' : ''),
        list.hit.warnings.concat(empty ? ['The panel of residuals is empty: it shows what the last fit left, and this model was changed or only previewed since. Press Fit.'] : []).map((w) => h('span', { class: 'warn' }, w)));
    }
    /* A place of a note, from what it keeps (the units of the axes, or fractions of the panel) to points of the page, and back. */
    const toPt = (n, hp, x, y) => (n.coords === 'axes' ? [hp.box.x + x * hp.box.w, hp.box.y + (1 - y) * hp.box.h] : [hp.sx.map(x), hp.sy.map(y)]);
    const fromPt = (n, hp, X, Y) => (n.coords === 'axes' ? [Number(((X - hp.box.x) / hp.box.w).toFixed(4)), Number((1 - (Y - hp.box.y) / hp.box.h).toFixed(4))]
      : [round(hp.sx.inv(X), hp.sx.hi - hp.sx.lo), round(hp.sy.inv(Y), hp.sy.hi - hp.sy.lo)]);
    const ends = (n, hp) => [toPt(n, hp, n.x, n.y), toPt(n, hp, n.x2, n.y2)];
    /* Rewrite a text where it is: a field over it, kept by Enter or by leaving it, given up by Escape. `at` is in pixels of the paper. */
    function edit(at, value, commit) {
      const input = h('input', { class: 'inplace', type: 'text', value, spellcheck: 'false', 'aria-label': 'The text' }), width = Math.max(160, at.w || 0);
      Object.assign(input.style, { left: ASY.clamp(at.x, 0, Math.max(0, paper.clientWidth - width)) + 'px', top: Math.max(0, at.y) + 'px', width: width + 'px' });
      let over = false;
      const close = (keep) => { if (over) return; over = true; const v = input.value; input.remove(); if (keep && v !== value) { commit(v); ctx.changed(); } };
      input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') close(true); else if (ev.key === 'Escape') close(false); });
      input.addEventListener('blur', () => close(true));
      paper.append(input); input.focus(); input.select();
    }
    const AXIS_OF = { xlabel: 'x', ylabel: 'y', y2label: 'y2' };
    const point = (e) => { const r = paper.getBoundingClientRect(), k = list.width * P.MM / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k }; };
    const panelAt = (pt) => list.hit.panels.find((p) => pt.x >= p.box.x && pt.x <= p.box.x + p.box.w && pt.y >= p.box.y && pt.y <= p.box.y + p.box.h) || null;
    const within = (pt, r) => r && pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
    const panelOf = (hp) => ctx.graph().figure.panels[hp.index];
    const round = (v, span) => { const d = Math.pow(10, Math.floor(Math.log10(Math.abs(span) || 1)) - 3); return Number((Math.round(v / d) * d).toPrecision(12)); };
    function setRange(hp, x0, x1, y0, y1) {
      const p = panelOf(hp), fig = ctx.graph().figure;
      const put = (ax, a, b, s) => { if (!ax || a == null) return; const lo = Math.min(a, b), hi = Math.max(a, b); if (!(hi > lo) || (s.log && lo <= 0)) return; ax.min = round(lo, hi - lo); ax.max = round(hi, hi - lo); };
      put(p.x, x0, x1, hp.sx);
      if (fig.layout.shareX) fig.panels.forEach((q) => { q.x.min = p.x.min; q.x.max = p.x.max; });
      if (y0 != null) { put(p.y, hp.sy.inv(y0), hp.sy.inv(y1), hp.sy); if (hp.sy2) put(p.y2, hp.sy2.inv(y0), hp.sy2.inv(y1), hp.sy2); }
    }

    paper.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !list || (e.target.closest && e.target.closest('input'))) return;
      const pt = point(e), hp = panelAt(pt), tool = ctx.tool(), marked = e.target.closest && e.target.closest('[data-k]'), key = marked ? marked.getAttribute('data-k') : null;        // a text is clicked on one of its runs
      if (tool === 'pointer') {
        const legendOf = list.hit.panels.find((p) => within(pt, p.legend));
        if (legendOf) drag = { kind: 'legend', hp: legendOf, from: pt, dx: pt.x - legendOf.legend.x, dy: pt.y - legendOf.legend.y, moved: false };
        else if (key && key.startsWith('note:')) {
          const fig = ctx.graph().figure; let found = null;
          fig.panels.forEach((p, i) => p.notes.forEach((n) => { if ('note:' + n.id === key) found = { n, hp: list.hit.panels.find((q) => q.index === i) }; }));
          if (found && found.hp) {
            const n = found.n, near = (q, d) => Math.hypot(pt.x - q[0], pt.y - q[1]) < d;
            drag = { kind: 'note', n, hp: found.hp, from: pt, grab: 'whole', moved: false };
            // a line or an arrow is taken by the end the pointer is on, or by its middle; a highlighted range by one of its edges, or whole
            if (n.type === 'line' || n.type === 'arrow') { [drag.a, drag.b] = ends(n, found.hp); drag.grab = near(drag.b, 5) ? 'b' : near(drag.a, 5) ? 'a' : 'whole'; }
            else if (n.type === 'span') { drag.a = [found.hp.sx.map(n.x), 0]; drag.b = [found.hp.sx.map(n.x2), 0]; drag.grab = Math.abs(pt.x - drag.a[0]) < 3 ? 'a' : Math.abs(pt.x - drag.b[0]) < 3 ? 'b' : 'whole'; }
            else if (n.type === 'text') drag.a = toPt(n, found.hp, n.x, n.y);              // a text keeps the place of the pointer in it: it does not jump to it
          }
          ctx.picked(key);
        } else if (key && AXIS_OF[key.split(':')[0]]) {
          const [kind, id] = key.split(':'), p = ctx.graph().figure.panels.find((q) => q.id === id), ax = p ? p[AXIS_OF[kind]] : null, of = list.hit.panels.find((q) => q.id === id);
          if (ax && of) drag = { kind: 'axlabel', ax, hp: of, from: pt, dx: +ax.labelDx || 0, dy: +ax.labelDy || 0, moved: false };
          ctx.picked(key);
        } else if (key) ctx.picked(key); else if (hp) ctx.picked('panel:' + hp.id);
      } else if (hp && (tool === 'zoom' || tool === 'range')) {
        band = h('div', { class: 'band' }); paper.append(band);
        drag = { kind: tool, hp, x: pt.x, y: pt.y, cx: e.clientX, cy: e.clientY };
      } else if (hp && tool === 'pan') drag = { kind: 'pan', hp, x: pt.x, y: pt.y, xr: [hp.sx.inv(hp.box.x), hp.sx.inv(hp.box.x + hp.box.w)], yr: [hp.sy.inv(hp.box.y + hp.box.h), hp.sy.inv(hp.box.y)], last: pt };
      if (drag) { paper.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    paper.addEventListener('pointermove', (e) => {
      if (!list) return;
      const pt = point(e);
      if (!drag) { const hp = panelAt(pt); ctx.readout(hp ? 'x ' + ASY.fmt(hp.sx.inv(pt.x), 5) + '   y ' + ASY.fmt(hp.sy.inv(pt.y), 5) : ''); return; }
      const b = drag.hp.box;
      // a click is not a drag: what is taken moves once the pointer has gone two points away
      if ((drag.kind === 'legend' || drag.kind === 'note' || drag.kind === 'axlabel') && !drag.moved && drag.from && Math.hypot(pt.x - drag.from.x, pt.y - drag.from.y) < 2) return;
      if (drag.kind === 'zoom' || drag.kind === 'range') {
        const r = paper.getBoundingClientRect(), k = 1 / pt.k, x0 = ASY.clamp(Math.min(drag.x, pt.x), b.x, b.x + b.w), x1 = ASY.clamp(Math.max(drag.x, pt.x), b.x, b.x + b.w);
        const full = drag.kind === 'range' || Math.abs(pt.y - drag.y) < 4, y0 = full ? b.y : ASY.clamp(Math.min(drag.y, pt.y), b.y, b.y + b.h), y1 = full ? b.y + b.h : ASY.clamp(Math.max(drag.y, pt.y), b.y, b.y + b.h);
        Object.assign(band.style, { left: x0 * k + 'px', top: y0 * k + 'px', width: (x1 - x0) * k + 'px', height: (y1 - y0) * k + 'px' });
        drag.now = { x0, x1, y0, y1, full }; void r;
      } else if (drag.kind === 'pan') {
        const hp = drag.hp, shift = (s, a, b2, d) => (s.log ? [Math.pow(10, Math.log10(a) + d), Math.pow(10, Math.log10(b2) + d)] : [a + d, b2 + d]);
        const dx = pt.x - drag.x, dy = pt.y - drag.y, ux = (v) => (hp.sx.log ? Math.log10(v) : v);
        const kx = (ux(drag.xr[1]) - ux(drag.xr[0])) / b.w * (hp.sx.inv(b.x) > hp.sx.inv(b.x + b.w) ? -1 : 1), uy = (v) => (hp.sy.log ? Math.log10(v) : v), ky = (uy(drag.yr[1]) - uy(drag.yr[0])) / b.h;
        const nx = shift(hp.sx, Math.min(...drag.xr), Math.max(...drag.xr), -dx * Math.abs(kx)), ny = shift(hp.sy, Math.min(...drag.yr), Math.max(...drag.yr), dy * Math.abs(ky));
        const p = panelOf(hp); p.x.min = round(nx[0], nx[1] - nx[0]); p.x.max = round(nx[1], nx[1] - nx[0]); p.y.min = round(ny[0], ny[1] - ny[0]); p.y.max = round(ny[1], ny[1] - ny[0]);
        if (ctx.graph().figure.layout.shareX) ctx.graph().figure.panels.forEach((q) => { q.x.min = p.x.min; q.x.max = p.x.max; });
        drag.moved = true; draw();
      } else if (drag.kind === 'legend') {
        const p = panelOf(drag.hp);
        p.legend.pos = 'custom'; p.legend.x = Number(((pt.x - drag.dx - b.x) / b.w).toFixed(4)); p.legend.y = Number(((pt.y - drag.dy - b.y) / b.h).toFixed(4));
        drag.moved = true; draw();
      } else if (drag.kind === 'note') {
        const n = drag.n, hp = drag.hp, dx = pt.x - drag.from.x, dy = pt.y - drag.from.y;
        if (n.type === 'line' || n.type === 'arrow') {
          if (drag.grab !== 'b') [n.x, n.y] = fromPt(n, hp, drag.a[0] + dx, drag.a[1] + dy);
          if (drag.grab !== 'a') [n.x2, n.y2] = fromPt(n, hp, drag.b[0] + dx, drag.b[1] + dy);
        } else if (n.type === 'span') {
          if (drag.grab !== 'b') n.x = round(hp.sx.inv(drag.a[0] + dx), hp.sx.hi - hp.sx.lo);
          if (drag.grab !== 'a') n.x2 = round(hp.sx.inv(drag.b[0] + dx), hp.sx.hi - hp.sx.lo);
        } else if (n.type === 'vline') n.x = round(hp.sx.inv(pt.x), hp.sx.hi - hp.sx.lo);
        else if (n.type === 'hline') n.y = round(hp.sy.inv(pt.y), hp.sy.hi - hp.sy.lo);
        else if (drag.a) [n.x, n.y] = fromPt(n, hp, drag.a[0] + dx, drag.a[1] + dy);
        drag.moved = true; draw();
      } else if (drag.kind === 'axlabel') {
        drag.ax.labelDx = Number((drag.dx + pt.x - drag.from.x).toFixed(1)); drag.ax.labelDy = Number((drag.dy + pt.y - drag.from.y).toFixed(1));
        drag.moved = true; draw();
      }
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (band) { band.remove(); band = null; }
      try { paper.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      if ((d.kind === 'zoom' || d.kind === 'range') && d.now && d.now.x1 - d.now.x0 > 2) {
        const a = d.hp.sx.inv(d.now.x0), b = d.hp.sx.inv(d.now.x1);
        if (d.kind === 'range') ctx.ranged(Math.min(a, b), Math.max(a, b));
        else { setRange(d.hp, a, b, d.now.full ? null : d.now.y1, d.now.full ? null : d.now.y0); ctx.changed(); }
      } else if (d.moved) ctx.changed();
    };
    paper.addEventListener('pointerup', end); paper.addEventListener('pointercancel', end);
    paper.addEventListener('pointerleave', () => { if (!drag) ctx.readout(''); });
    paper.addEventListener('dblclick', (e) => {
      if (!list || (e.target.closest && e.target.closest('input'))) return;
      const pt = point(e), hp = panelAt(pt), fig = ctx.graph().figure;
      if (ctx.tool() === 'pointer') {            // on a text: rewrite it where it is
        const of = list.hit.panels.find((q) => within(pt, q.legend));
        if (of) {
          const rows = of.legend.rows, row = rows.find((r) => pt.y >= r.y && pt.y < r.y + r.h) || rows[0], series = fig.panels[of.index].series.find((r) => r.id === row.id);
          if (series) edit({ x: row.x / pt.k - 4, y: row.y / pt.k - 3, w: (of.legend.x + of.legend.w - row.x) / pt.k + 30 }, series.label || row.label, (v) => { series.label = v.trim() === row.label && !series.label ? '' : v.trim().slice(0, 400); });
          return;
        }
        // the paper holds the pointer since the first click, so the event names the paper: what is under the pointer is asked of the document
        const under = document.elementFromPoint(e.clientX, e.clientY), el = under && under.closest ? under.closest('[data-k]') : null, [kind, id] = el ? el.getAttribute('data-k').split(':') : [];
        const r = el ? el.getBoundingClientRect() : null, pr = paper.getBoundingClientRect(), over = r ? { x: r.left - pr.left + r.width / 2 - 100, y: r.top - pr.top + r.height / 2 - 14, w: 200 } : null;
        const p = fig.panels.find((q) => q.id === id);
        if (p && AXIS_OF[kind] && p[AXIS_OF[kind]]) return edit(over, p[AXIS_OF[kind]].label || '', (v) => { p[AXIS_OF[kind]].label = v.trim().slice(0, 400); });
        if (p && kind === 'title') return edit(over, p.title || '', (v) => { p.title = v.trim().slice(0, 400); });
        if (kind === 'note') { let note = null; fig.panels.forEach((q) => q.notes.forEach((n) => { if (n.id === id) note = n; })); if (note && note.type === 'text') return edit(over, note.text || '', (v) => { note.text = v.slice(0, 400); }); if (note) return; }
      }
      if (!hp) return;
      const p = panelOf(hp);
      (fig.layout.shareX ? fig.panels : [p]).forEach((q) => { q.x.min = q.x.max = null; });
      p.y.min = p.y.max = null; if (p.y2) p.y2.min = p.y2.max = null;
      ctx.changed();
    });
    paper.addEventListener('wheel', (e) => {
      const tool = ctx.tool(); if (tool !== 'zoom' && tool !== 'pan') return;
      const pt = point(e), hp = panelAt(pt); if (!hp) return;
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.25 : 0.8, b = hp.box;
      const about = (s, p0, lo, hi) => { const u = (v) => (s.log ? Math.log10(v) : v), back = (v) => (s.log ? Math.pow(10, v) : v), c = u(s.inv(p0)), a = u(s.inv(lo)), z = u(s.inv(hi)); return [back(c + (a - c) * f), back(c + (z - c) * f)]; };
      const [xa, xb] = about(hp.sx, pt.x, b.x, b.x + b.w), [ya, yb] = about(hp.sy, pt.y, b.y + b.h, b.y);
      setRange(hp, xa, xb, null, null);
      if (!e.shiftKey) { const p = panelOf(hp), lo = Math.min(ya, yb), hi = Math.max(ya, yb); p.y.min = round(lo, hi - lo); p.y.max = round(hi, hi - lo); }
      wheelDone();
      draw();
    }, { passive: false });
    const wheelDone = ASY.debounce(() => ctx.changed(), 350);
    new ResizeObserver(() => { if (list && ctx.graph()) draw(); }).observe(root);

    return { draw, list: () => list, zoom: (z) => { zoom = z; draw(); }, zoomed: () => zoom };
  };
})(window.ASY);
