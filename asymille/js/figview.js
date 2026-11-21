/* A graph on screen: the figure as it will be printed, on a white page, and what a hand does to it.
 *
 *     const view = ASY.figview(el, ctx)     ctx: graph(), tool(), fit(), changed(), picked(key), readout(text)
 *     view.draw()
 *
 * The figure is laid out by plot.js; this file shows its SVG and turns the pointer into changes
 * of the figure: drag a rectangle to zoom, drag to move, wheel to zoom about the pointer,
 * double-click to see everything again; drag across x to set the range of the fit; drag the
 * legend or a text; click a curve to select it. A change made by hand is a change of the figure
 * (its axes, its legend): it is saved and exported like any other. */
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
      paper.innerHTML = P.svg(Object.assign({}, list, { items }), { keys: true });
      paper.append(note);
      const mm = 96 / 25.4, room = stage.clientWidth - 44, roomH = stage.clientHeight - 64;
      const scale = zoom === 'fit' ? Math.min(room / (fig.width * mm), roomH / (fig.height * mm), 3.2) : zoom;
      paper.style.width = Math.max(120, fig.width * mm * scale) + 'px';
      paper.className = 'paper tool-' + ctx.tool();
      ASY.fill(note, fig.width + ' × ' + fig.height + ' mm · shown at ' + Math.round(scale * 100) + ' %' + (list.items.some((it) => it.t === 'marks' && it.pts.length >= 40000) ? ' · every symbol could not be drawn: only one in a few is' : ''),
        list.hit.warnings.map((w) => h('span', { class: 'warn' }, w)));
    }
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
      if (e.button !== 0 || !list) return;
      const pt = point(e), hp = panelAt(pt), tool = ctx.tool(), marked = e.target.closest && e.target.closest('[data-k]'), key = marked ? marked.getAttribute('data-k') : null;        // a text is clicked on one of its runs
      if (tool === 'pointer') {
        const legendOf = list.hit.panels.find((p) => within(pt, p.legend));
        if (legendOf) drag = { kind: 'legend', hp: legendOf, dx: pt.x - legendOf.legend.x, dy: pt.y - legendOf.legend.y, moved: false };
        else if (key && key.startsWith('note:')) {
          const fig = ctx.graph().figure; let found = null;
          fig.panels.forEach((p, i) => p.notes.forEach((n) => { if ('note:' + n.id === key) found = { n, hp: list.hit.panels.find((q) => q.index === i) }; }));
          if (found && (found.n.type === 'text' || found.n.type === 'vline' || found.n.type === 'hline')) drag = { kind: 'note', n: found.n, hp: found.hp, moved: false };
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
        const n = drag.n, hp = drag.hp;
        if (n.type === 'vline') n.x = round(hp.sx.inv(pt.x), hp.sx.hi - hp.sx.lo);
        else if (n.type === 'hline') n.y = round(hp.sy.inv(pt.y), hp.sy.hi - hp.sy.lo);
        else if (n.coords === 'axes') { n.x = Number(((pt.x - b.x) / b.w).toFixed(4)); n.y = Number((1 - (pt.y - b.y) / b.h).toFixed(4)); }
        else { n.x = round(hp.sx.inv(pt.x), hp.sx.hi - hp.sx.lo); n.y = round(hp.sy.inv(pt.y), hp.sy.hi - hp.sy.lo); }
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
      const pt = point(e), hp = panelAt(pt); if (!hp) return;
      const fig = ctx.graph().figure, p = panelOf(hp);
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
