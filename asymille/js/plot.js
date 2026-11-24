/* A figure, laid out: from what a person chose (size in millimetres, axes, series, labels) to a
 * list of things to draw at given places, and that list written as SVG.
 *
 *     const list = ASY.plot.layout(figure, data)      // data(series, panel) → { x, y, yerr, xerr, lower, upper, label }
 *     ASY.plot.svg(list)                              // the figure, as the text of an SVG
 *
 * The list is the figure: lines, shapes, symbols and texts, in points, y downwards, on a page of
 * `width` × `height` millimetres. The page shows its SVG; the server draws the same list into
 * PDF, EPS and TIFF (asymille/figures.py). Both hold the same axes, ticks and positions because
 * neither decides them: this file does. No DOM here: tools/check_page.js runs it in Node.
 *
 * Text is measured with the widths of Helvetica (the metrics of Arial and of Liberation Sans),
 * so that margins and the legend do not depend on what a browser has installed. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const MM = 72 / 25.4;
  const PALETTES = {
    okabe: ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#000000', '#b8a900'],          // Okabe and Ito: told apart by colour-blind readers
    tol: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb', '#000000'],              // Paul Tol, bright
    classic: ['#000000', '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf'],
    grey: ['#000000', '#555555', '#888888', '#aaaaaa', '#333333', '#777777', '#999999', '#bbbbbb'],
  };
  const MARKERS = {
    circle: { circle: true }, square: { verts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] }, triangle: { verts: [[0, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
    down: { verts: [[0, 0.5], [0.5, -0.5], [-0.5, -0.5]] }, diamond: { verts: [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]] },
    cross: { strokes: [[-0.5, -0.5, 0.5, 0.5], [-0.5, 0.5, 0.5, -0.5]] }, plus: { strokes: [[-0.5, 0, 0.5, 0], [0, -0.5, 0, 0.5]] },
  };
  const DASHES = { solid: null, dash: [4, 2], dot: [1, 1.6], dashdot: [5, 2, 1, 2], long: [8, 3] };          // in line widths
  const TYPES = { scatter: 'Symbols', line: 'Line', both: 'Line and symbols', steps: 'Steps', bars: 'Bars', area: 'Filled area' };
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
    rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ',
    Psi: 'Ψ', Omega: 'Ω', deg: '°', AA: 'Å', times: '×', pm: '±', cdot: '·', infty: '∞', hbar: 'ħ', partial: '∂', nabla: '∇', propto: '∝', approx: '≈', leq: '≤', geq: '≥', to: '→', micro: 'µ' };
  // widths of Helvetica, in thousandths of the type size, for the characters 32 to 126
  const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

  const axis = (more) => Object.assign({ label: '', min: null, max: null, scale: 'linear', step: null, grid: false, reverse: false, decimals: null }, more || {});
  const panel = (id) => ({ id, title: '', x: axis(), y: axis(), y2: null, legend: { show: true, pos: 'ne', x: 0.6, y: 0.05, frame: false }, series: [], notes: [] });
  const defaults = () => ({
    width: 120, height: 85, font: 'Arial', background: '#ffffff', journal: null, palette: 'okabe',
    size: { label: 9, tick: 8, legend: 8, title: 9, tag: 10 }, stroke: { axis: 0.6, line: 1.2, grid: 0.4, error: 0.6 },
    tick: { dir: 'in', len: 3.5, mirror: true }, frame: 'box', layout: { cols: 1, ratios: [], gap: 2, shareX: false }, tags: 'none', panels: [panel('p1')],
  });
  /* The format of a figure: what a journal sets, and what a person keeps under a name to give to their other figures. Not its data, its axes or its notes. */
  const FORMAT = ['width', 'height', 'font', 'background', 'journal', 'palette', 'size', 'stroke', 'tick', 'frame'];
  const formatOf = (fig) => { const out = {}; FORMAT.forEach((k) => { out[k] = fig[k] === undefined ? null : JSON.parse(JSON.stringify(fig[k])); }); return out; };
  /* A figure takes of a format the things it knows, each of the kind it must be: a format read from elsewhere puts nothing else in a figure. */
  function applyFormat(fig, format) {
    const d = defaults();
    FORMAT.forEach((k) => {
      const v = format ? format[k] : undefined;
      if (v == null) { if (k === 'journal' && v === null) fig.journal = null; return; }
      if (d[k] !== null && typeof d[k] === 'object') { if (typeof v === 'object') { fig[k] = fig[k] || {}; Object.keys(d[k]).forEach((q) => { if (typeof v[q] === typeof d[k][q] && (typeof v[q] !== 'number' || isFinite(v[q]))) fig[k][q] = v[q]; }); } }
      else if (k === 'journal' ? typeof v === 'string' : typeof v === typeof d[k] && (typeof v !== 'number' || (isFinite(v) && v > 0))) fig[k] = v;
    });
    return fig;
  }
  const series = (more) => Object.assign({ kind: 'data', axis: 'y', label: '', type: 'scatter', color: '#0072b2', width: null, dash: 'solid', marker: 'circle', size: 3.5, open: false,
    opacity: 1, show: true, legend: true }, more || {});

  // ------------------------------------------------------------------ text
  /* "E_{F} (cm^{-1}), \alpha" → runs of text, each on the line (v: 0), raised (1) or lowered (−1). */
  function runs(text) {
    const out = []; let cur = '';
    const push = (s, v) => { if (s) { const last = out[out.length - 1]; if (last && last.v === v) last.s += s; else out.push({ s, v }); } };
    const flush = () => { push(cur, 0); cur = ''; };
    const minus = (s) => s.replace(/-/g, '−');
    text = String(text == null ? '' : text);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\') {
        const m = /^[A-Za-z]+/.exec(text.slice(i + 1));
        if (m && GREEK[m[0]]) { cur += GREEK[m[0]]; i += m[0].length; if (text.slice(i + 1, i + 3) === '{}') i += 2; continue; }       // \mu{}m: μm
        if (i + 1 < text.length && '\\^_{}'.includes(text[i + 1])) { cur += text[i + 1]; i++; continue; }
        cur += ch;
      } else if ((ch === '^' || ch === '_') && i + 1 < text.length) {
        let inner;
        if (text[i + 1] === '{') { const end = text.indexOf('}', i + 2); if (end < 0) { cur += ch; continue; } inner = text.slice(i + 2, end); i = end; }
        else { inner = text[i + 1]; i++; }
        flush();
        push(minus(runs(inner).map((r) => r.s).join('')), ch === '^' ? 1 : -1);
      } else cur += ch;
    }
    flush();
    return out;
  }
  const plain = (text) => runs(text).map((r) => r.s).join('');
  /* A name that is not markup (a file name, with its underscores) written so that it is drawn as it is. */
  const literal = (text) => String(text == null ? '' : text).replace(/[\\_^]/g, '\\$&');
  function textWidth(text, size) {
    let w = 0;
    for (const r of (Array.isArray(text) ? text : runs(text))) {
      let sum = 0;
      for (const ch of r.s) { const c = ch.codePointAt(0); sum += c >= 32 && c <= 126 ? WIDTHS[c - 32] : c === 0x2212 ? 584 : 570; }
      w += sum / 1000 * size * (r.v ? 0.7 : 1);
    }
    return w;
  }

  // ------------------------------------------------------------------ axes: range, ticks
  const clean = (v) => Number(v.toPrecision(12));
  const sign = (s) => s.replace('-', '−');
  function extent(values, positive) {
    let lo = Infinity, hi = -Infinity;
    for (const list of values) for (let i = 0; i < list.length; i++) { const v = list[i]; if (v == null || !isFinite(v) || (positive && v <= 0)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    return lo <= hi ? [lo, hi] : null;
  }
  /* The range an axis shows: what was asked, or the data with a little room around it. */
  function range(ax, values) {
    const log = ax.scale === 'log';
    let [lo, hi] = extent(values, log) || (log ? [1, 10] : [0, 1]);
    if (log) { const pad = (Math.log10(hi) - Math.log10(lo)) * 0.04 || 0.3; lo = Math.pow(10, Math.log10(lo) - pad); hi = Math.pow(10, Math.log10(hi) + pad); }
    else { const pad = (hi - lo) * 0.04 || Math.abs(hi) * 0.05 || 0.5; lo -= pad; hi += pad; }
    if (ax.min != null && isFinite(ax.min) && (!log || ax.min > 0)) lo = ax.min;
    if (ax.max != null && isFinite(ax.max) && (!log || ax.max > 0)) hi = ax.max;
    if (!(hi > lo)) hi = log ? lo * 10 : lo + 1;
    return [lo, hi];
  }
  function ticks(lo, hi, ax, length, size, horizontal) {
    const span = hi - lo, out = { major: [], minor: [], factor: '' };
    if (ax.scale === 'log' && lo > 0 && Math.log10(hi / lo) >= 1) {
      const a = Math.ceil(Math.log10(lo) - 1e-9), b = Math.floor(Math.log10(hi) + 1e-9);
      const every = Math.max(1, Math.ceil((b - a + 1) / Math.max(2, Math.floor(length / (horizontal ? size * 3.2 : size * 1.6)))));
      for (let e = a; e <= b; e++) if ((e - a) % every === 0) out.major.push({ v: Math.pow(10, e), runs: [{ s: '10', v: 0 }, { s: sign(String(e)), v: 1 }] });
      if (b - a < 9) for (let e = a - 1; e <= b; e++) for (let k = 2; k <= 9; k++) { const v = k * Math.pow(10, e); if (v >= lo && v <= hi) out.minor.push(v); }
      return out;
    }
    const want = ASY.clamp(Math.round(length / (horizontal ? size * 5.2 : size * 2.9)), 2, 10);
    let step = ax.step > 0 && span / ax.step <= 60 ? ax.step : null;
    if (!step) { const raw = span / want, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag; step = (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag; }
    const mant = Math.round(step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9)));
    const parts = mant === 2 ? 4 : 5, small = step / parts;
    const top = Math.max(Math.abs(lo), Math.abs(hi));
    const exp = ax.scale !== 'log' && (top >= 1e5 || top < 1e-3) ? Math.floor(Math.log10(top) + 1e-9) : 0;
    const k = Math.pow(10, exp);
    let decimals = ax.decimals;
    if (decimals == null) { const unit = step / k; decimals = 0; while (decimals < 10 && Math.abs(Math.round(unit * Math.pow(10, decimals)) - unit * Math.pow(10, decimals)) > 1e-6 * unit * Math.pow(10, decimals)) decimals++; }      // as many as the step needs: 0.25 → 2
    for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) { const v = clean(i * step); out.major.push({ v, runs: [{ s: sign((v / k).toFixed(ASY.clamp(decimals, 0, 12))), v: 0 }] }); }
    for (let i = Math.ceil(lo / small - 1e-9); i * small <= hi + small * 1e-9; i++) if (i % parts !== 0) out.minor.push(clean(i * small));
    if (exp) out.factor = [{ s: '×10', v: 0 }, { s: sign(String(exp)), v: 1 }];
    return out;
  }
  function scale(lo, hi, p0, p1, log, reverse) {
    if (reverse) [p0, p1] = [p1, p0];
    const a = log ? Math.log10(lo) : lo, b = log ? Math.log10(hi) : hi, k = (p1 - p0) / (b - a);
    return { lo, hi, log,
      map: (v) => (log ? (v > 0 ? p0 + (Math.log10(v) - a) * k : NaN) : p0 + (v - a) * k),
      inv: (p) => { const u = a + (p - p0) / k; return log ? Math.pow(10, u) : u; } };
  }

  // ------------------------------------------------------------------ the list of things to draw
  const R = (v) => Math.round(v * 100) / 100;
  const far = (v) => (v > 1e5 ? 1e5 : v < -1e5 ? -1e5 : v);

  function layout(fig, data) {
    const W = fig.width * MM, H = fig.height * MM, S = fig.size, T = fig.tick, items = [], hit = { panels: [], warnings: [] };
    /* How one axis draws its ticks and numbers: what it says itself, or what the page says for all of them. */
    const style = (ax) => { const dir = ax.tickDir || T.dir, len = ax.tickLen != null ? ax.tickLen : T.len;
      return { out: dir === 'out' || dir === 'both' ? len : 0, in: dir === 'in' || dir === 'both' ? len : 0, w: ax.tickWidth != null ? ax.tickWidth : fig.stroke.axis,
        size: ax.tickSize != null ? ax.tickSize : S.tick, color: ax.color || '#000000', minor: ax.minor !== false,
        // its title: a size of its own, bold or italic, and moved from its place by a hand (labelDx, labelDy, in points)
        title: ax.labelSize != null ? ax.labelSize : S.label, weight: ax.labelBold ? 'bold' : undefined, slant: ax.labelItalic ? 'italic' : undefined, dx: +ax.labelDx || 0, dy: +ax.labelDy || 0 }; };
    const text = (x, y, content, size, more) => { const r = Array.isArray(content) ? content : runs(content); if (r.length) items.push(Object.assign({ t: 'text', x: R(x), y: R(y), runs: r, size, anchor: 'middle', color: '#000000' }, more || {})); };
    const line = (paths, stroke, width, more) => { if (paths.length) items.push(Object.assign({ t: 'line', paths: paths.map((p) => p.map(R)), stroke, width }, more || {})); };
    items.push({ t: 'poly', pts: [0, 0, R(W), 0, R(W), R(H), 0, R(H)], fill: fig.background || '#ffffff', k: 'page' });

    // each panel: its series with their data, the range of its axes
    const cols = Math.max(1, Math.min(fig.layout.cols || 1, fig.panels.length)), rowsN = Math.ceil(fig.panels.length / cols);
    const prepared = fig.panels.map((p, index) => {
      const drawn = p.series.filter((s) => s.show !== false).map((s) => ({ s, d: data(s, p) || { x: [], y: [] } }));
      const of = (key) => drawn.filter((e) => (e.s.axis || 'y') === key);
      // the range makes room for the error bars, but not for one that dwarfs the data: a point that is not determined would flatten every other
      const ys = (list) => list.flatMap((e) => { const d = e.d; const arr = [d.y]; if (d.lower) arr.push(d.lower, d.upper);
        if (d.yerr) { const span = extent([d.y]), most = span ? 3 * (span[1] - span[0]) : 0, bar = (i) => (isFinite(d.yerr[i]) && (!most || d.yerr[i] <= most) ? d.yerr[i] : 0); arr.push(d.y.map((v, i) => v - bar(i)), d.y.map((v, i) => v + bar(i))); }
        return arr; });
      const xr = range(p.x, drawn.map((e) => e.d.x)), yr = range(p.y, ys(of('y')));
      if (!p.y.min && p.y.min !== 0 && p.y.scale !== 'log' && of('y').some((e) => e.s.type === 'bars' || e.s.type === 'area') && yr[0] > 0) yr[0] = 0;       // bars stand on zero
      const y2r = p.y2 ? range(p.y2, ys(of('y2'))) : null;
      // a logarithmic axis has no place for zero or negative values: when none of them is positive, the page says so instead of showing an empty frame
      const lost = (ax, values, name) => { if (ax && ax.scale === 'log' && !extent(values, true) && extent(values, false)) hit.warnings.push('The ' + name + ' axis' + (fig.panels.length > 1 ? ' of panel ' + String.fromCharCode(97 + index) : '') + ' is logarithmic and none of its values is positive: nothing can be drawn on it.'); };
      lost(p.x, drawn.map((e) => e.d.x), 'x'); lost(p.y, of('y').map((e) => e.d.y), 'y'); lost(p.y2, of('y2').map((e) => e.d.y), 'right');
      const row = Math.floor(index / cols), col = index % cols;
      const shared = fig.layout.shareX && row < rowsN - 1 && index + cols < fig.panels.length;         // its x axis is the one of the panel below
      return { p, index, row, col, drawn, xr, yr, y2r, shared };
    });
    // margins: what the numbers and the titles of each panel need, aligned along rows and columns
    const cellW = W / cols;
    const weights = Array.from({ length: rowsN }, (_, r) => +(fig.layout.ratios || [])[r] > 0 ? +fig.layout.ratios[r] : 1), total = weights.reduce((a, b) => a + b, 0);
    const gap = (fig.layout.gap || 0) * MM;
    const rowH = weights.map((w) => (H - gap * (rowsN - 1)) * w / total), rowY = rowH.map((_, r) => rowH.slice(0, r).reduce((a, b) => a + b, 0) + gap * r);
    const need = prepared.map((e) => {
      const guessW = cellW * 0.75, guessH = rowH[e.row] * 0.75, ax = style(e.p.x), ay = style(e.p.y), ay2 = e.p.y2 ? style(e.p.y2) : null;
      const ty = ticks(e.yr[0], e.yr[1], e.p.y, guessH, ay.size, false), ty2 = e.y2r ? ticks(e.y2r[0], e.y2r[1], e.p.y2, guessH, ay2.size, false) : null;
      const wide = (t, size) => Math.max(0, ...t.major.map((m) => textWidth(m.runs, size)));
      const tx = ticks(e.xr[0], e.xr[1], e.p.x, guessW, ax.size, true);
      const lastHalf = tx.major.length ? textWidth(tx.major[tx.major.length - 1].runs, ax.size) / 2 : 0;
      // a legend set outside takes its room on the right of the panel
      const listed = e.p.legend && e.p.legend.show !== false && e.p.legend.pos === 'out' ? e.drawn.filter((q) => q.s.legend !== false && q.s.type !== 'band' && (q.s.label || q.d.label || q.d.x.length)).map((q) => q.s.label || q.d.label || '') : [];
      const beside = listed.length ? 6 + S.legend * 3.75 + Math.max(...listed.map((t) => textWidth(t, S.legend))) : 0;
      // a text placed outside the frame (in fractions of the panel) is given the room it needs on its side of the page
      const out = { l: 0, r: 0, t: 0, b: 0 };
      (e.p.notes || []).forEach((nt) => {
        if (nt.type !== 'text' || nt.coords !== 'axes' || !isFinite(nt.x) || !isFinite(nt.y)) return;
        const size = nt.size || S.label, lines = String(nt.text == null ? '' : nt.text).split('\n'), long = Math.max(...lines.map((l) => textWidth(l, size))), tall = lines.length * size * 1.32;
        if (nt.rotate) return;
        const wideW = cellW * 0.85, wideH = rowH[e.row] * 0.85;                                 // a little more than the panel will be: too much room is better than a text cut off
        const left = nt.anchor === 'middle' ? nt.x - long / 2 / wideW : nt.anchor === 'end' ? nt.x - long / wideW : nt.x;
        const top = nt.valign === 'top' ? nt.y : nt.valign === 'middle' ? nt.y + tall / 2 / wideH : nt.y + size / wideH;          // in fractions of the panel, from its foot
        if (left + long / wideW > 1 && left > 0.5) out.r = Math.max(out.r, (Math.min(left, 1.6) - 1) * wideW + long + 2);
        if (left < 0) out.l = Math.max(out.l, -Math.max(left, -0.6) * wideW + 1);
        if (top > 1) out.t = Math.max(out.t, (Math.min(top, 1.6) - 1) * wideH + 1);
        if (top - tall / wideH < 0 && top < 0.5) out.b = Math.max(out.b, -Math.max(top - tall / wideH, -0.6) * wideH + 1);
      });
      return {
        l: Math.max(2 + (e.p.y.label ? ay.title * 1.3 + 2 : 0) + wide(ty, ay.size) + 3 + ay.out, out.l),
        r: Math.max(ty2 ? 2 + (e.p.y2.label ? ay2.title * 1.3 + 2 : 0) + wide(ty2, ay2.size) + 3 + ay2.out : Math.max(4, lastHalf + 1.5), out.r) + beside,
        beside,
        t: Math.max(3 + (e.p.title ? (e.p.titleSize || S.title) * 1.45 : 0) + ((ty.factor || (ty2 && ty2.factor)) && !e.p.title ? ay.size * 1.25 : 0) + S.tick * 0.4, out.t),
        b: Math.max(e.shared ? Math.max(2, ax.out) : 2 + (e.p.x.label ? ax.title * 1.3 + 1 : 0) + ax.size * 1.15 + 3 + ax.out, out.b),
        wy: wide(ty, ay.size), wy2: ty2 ? wide(ty2, ay2.size) : 0,
      };
    });
    const maxOf = (key, test) => Math.max(0, ...prepared.filter(test).map((e) => need[e.index][key]));
    const colL = Array.from({ length: cols }, (_, c) => maxOf('l', (e) => e.col === c)), colR = Array.from({ length: cols }, (_, c) => maxOf('r', (e) => e.col === c));
    const rowT = Array.from({ length: rowsN }, (_, r) => maxOf('t', (e) => e.row === r)), rowB = Array.from({ length: rowsN }, (_, r) => maxOf('b', (e) => e.row === r));

    prepared.forEach((e) => {
      const p = e.p, n = need[e.index];
      const box = { x: e.col * cellW + colL[e.col], y: rowY[e.row] + rowT[e.row], w: Math.max(10, cellW - colL[e.col] - colR[e.col]), h: Math.max(10, rowH[e.row] - rowT[e.row] - rowB[e.row]) };
      const x1 = box.x + box.w, y1 = box.y + box.h, clip = [R(box.x), R(box.y), R(box.w), R(box.h)];
      const sx = scale(e.xr[0], e.xr[1], box.x, x1, p.x.scale === 'log', p.x.reverse), sy = scale(e.yr[0], e.yr[1], y1, box.y, p.y.scale === 'log', p.y.reverse);
      const sy2 = e.y2r ? scale(e.y2r[0], e.y2r[1], y1, box.y, p.y2.scale === 'log', p.y2.reverse) : null;
      const AX = style(p.x), AY = style(p.y), AY2 = sy2 ? style(p.y2) : null;
      const tx = ticks(e.xr[0], e.xr[1], p.x, box.w, AX.size, true), ty = ticks(e.yr[0], e.yr[1], p.y, box.h, AY.size, false), ty2 = sy2 ? ticks(e.y2r[0], e.y2r[1], p.y2, box.h, AY2.size, false) : null;
      const key = (what) => what + ':' + p.id;

      // grid, under everything: each axis has the colour and the line of its own
      const gridOf = (ax, lines) => line(lines, ax.gridColor || '#d0d0d0', fig.stroke.grid, { dash: DASHES[ax.gridDash] ? DASHES[ax.gridDash].map((v) => R(v * Math.max(fig.stroke.grid, 0.5))) : null });
      if (p.x.grid) gridOf(p.x, tx.major.map((m) => { const X = sx.map(m.v); return [X, box.y, X, y1]; }));
      if (p.y.grid) gridOf(p.y, ty.major.map((m) => { const Y = sy.map(m.v); return [box.x, Y, x1, Y]; }));

      // notes that sit under the data: a highlighted span of x
      p.notes.filter((nt) => nt.type === 'span').forEach((nt) => {
        const a = far(sx.map(nt.x)), b = far(sx.map(nt.x2));
        if (isFinite(a) && isFinite(b)) items.push({ t: 'poly', pts: [a, box.y, b, box.y, b, y1, a, y1].map(R), fill: nt.color || '#e69f00', opacity: nt.opacity != null ? nt.opacity : 0.18, clip, k: 'note:' + nt.id });
      });

      // the series, in their order
      const legend = [];
      e.drawn.forEach(({ s, d }) => {
        const yScale = s.axis === 'y2' && sy2 ? sy2 : sy, color = s.color || '#000000', lw = s.width != null ? s.width : fig.stroke.line, k = 'series:' + s.id;
        const n0 = Math.min(d.x.length, d.y.length), X = new Array(n0), Y = new Array(n0);
        for (let i = 0; i < n0; i++) { X[i] = d.x[i] == null ? NaN : far(sx.map(d.x[i])); Y[i] = d.y[i] == null ? NaN : far(yScale.map(d.y[i])); }
        const dash = DASHES[s.dash] ? DASHES[s.dash].map((v) => R(v * Math.max(lw, 0.5))) : null;
        const type = s.type || 'scatter';
        if (type === 'band' && d.lower && d.upper) {
          const up = [], down = [];
          for (let i = 0; i < n0; i++) { const a = yScale.map(d.upper[i]), b = yScale.map(d.lower[i]); if (isFinite(X[i]) && isFinite(a) && isFinite(b)) { up.push(X[i], far(a)); down.unshift(X[i], far(b)); } }
          if (up.length > 2) items.push({ t: 'poly', pts: up.concat(pairsReversed(down)).map(R), fill: color, opacity: (s.opacity != null ? s.opacity : 1) * 0.22, clip, k });
        }
        if (type === 'area') {
          const base = ASY.clamp(yScale.map(yScale.log ? yScale.lo : Math.max(yScale.lo, Math.min(0, yScale.hi))), box.y, y1), pts = [];
          let first = null, last = null;
          for (let i = 0; i < n0; i++) if (isFinite(X[i]) && isFinite(Y[i])) { if (first == null) first = X[i]; last = X[i]; pts.push(X[i], Y[i]); }
          if (pts.length > 2) items.push({ t: 'poly', pts: [first, base].concat(pts, [last, base]).map(R), fill: color, opacity: (s.opacity != null ? s.opacity : 1) * 0.3, clip, k });
        }
        if (type === 'bars') {
          let dx = Infinity;
          const sorted = X.filter(isFinite).sort((a, b) => a - b);
          for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > 1e-6) dx = Math.min(dx, sorted[i] - sorted[i - 1]);
          const half = (isFinite(dx) ? dx : box.w / 4) * 0.4, base = ASY.clamp(yScale.map(yScale.log ? yScale.lo : Math.max(yScale.lo, Math.min(0, yScale.hi))), box.y, y1);
          for (let i = 0; i < n0; i++) if (isFinite(X[i]) && isFinite(Y[i])) items.push({ t: 'poly', pts: [X[i] - half, base, X[i] + half, base, X[i] + half, Y[i], X[i] - half, Y[i]].map(R), fill: color, opacity: s.opacity, clip, k });
        }
        if (type === 'line' || type === 'both' || type === 'steps' || type === 'area') {
          const paths = polylines(X, Y, type === 'steps');
          line(paths, color, lw, { dash, clip, opacity: s.opacity, join: 'round', k });
        }
        if (d.yerr || d.xerr) {
          const bars = [], cap = Math.max(1.2, (s.size || 3) * 0.45);
          for (let i = 0; i < n0; i++) {
            if (!isFinite(X[i]) || !isFinite(Y[i])) continue;
            if (d.yerr && isFinite(d.yerr[i]) && d.yerr[i] > 0) { const a = far(yScale.map(d.y[i] - d.yerr[i])), b = far(yScale.map(d.y[i] + d.yerr[i])); if (isFinite(b)) { const lo = isFinite(a) ? a : y1; bars.push([X[i], lo, X[i], b], [X[i] - cap, b, X[i] + cap, b]); if (isFinite(a)) bars.push([X[i] - cap, a, X[i] + cap, a]); } }
            if (d.xerr && isFinite(d.xerr[i]) && d.xerr[i] > 0) { const a = far(sx.map(d.x[i] - d.xerr[i])), b = far(sx.map(d.x[i] + d.xerr[i])); if (isFinite(a) && isFinite(b)) bars.push([a, Y[i], b, Y[i]], [a, Y[i] - cap, a, Y[i] + cap], [b, Y[i] - cap, b, Y[i] + cap]); }
          }
          line(bars, color, fig.stroke.error, { clip, opacity: s.opacity, k });
        }
        const symbols = (type === 'scatter' || type === 'both') && s.marker !== 'none';
        if (symbols) {
          const pts = [], every = Math.max(1, Math.ceil(n0 / 20000));          // beyond 20 000 symbols a figure is a blot, and a file of that many is unusable
          for (let i = 0; i < n0; i += every) if (isFinite(X[i]) && isFinite(Y[i]) && X[i] >= box.x - 1 && X[i] <= x1 + 1 && Y[i] >= box.y - 1 && Y[i] <= y1 + 1) pts.push(R(X[i]), R(Y[i]));
          const shape = MARKERS[s.marker] || MARKERS.circle;
          items.push(Object.assign({ t: 'marks', pts, size: s.size || 3.5, fill: shape.strokes ? null : s.open ? '#ffffff' : color, stroke: shape.strokes || s.open ? color : null,
            width: shape.strokes || s.open ? Math.max(0.5, (s.size || 3.5) * 0.18) : 0, opacity: s.opacity, clip, k }, shape));
        }
        if (s.legend !== false && type !== 'band' && (s.label || d.label || d.x.length)) legend.push({ s, label: s.label || d.label || '', color, lw, dash, type, symbols });
      });

      // notes over the data
      p.notes.forEach((nt) => {
        const k = 'note:' + nt.id, c = nt.color || '#000000', w = nt.width || 0.8, dash = DASHES[nt.dash] ? DASHES[nt.dash].map((v) => R(v * w)) : null;
        const at = (x, y) => (nt.coords === 'axes' ? [box.x + x * box.w, box.y + (1 - y) * box.h] : [far(sx.map(x)), far(sy.map(y))]);
        if (nt.type === 'vline') { const X = far(sx.map(nt.x)); if (isFinite(X)) line([[X, box.y, X, y1]], c, w, { dash, clip, k }); }
        else if (nt.type === 'hline') { const Y = far(sy.map(nt.y)); if (isFinite(Y)) line([[box.x, Y, x1, Y]], c, w, { dash, clip, k }); }
        else if (nt.type === 'line' || nt.type === 'arrow') {
          const [ax, ay] = at(nt.x, nt.y), [bx, by] = at(nt.x2, nt.y2);
          if ([ax, ay, bx, by].every(isFinite)) {
            line([[ax, ay, bx, by]], c, w, { dash, k });
            if (nt.type === 'arrow') {
              const L = nt.head > 0 ? nt.head : 4 + w * 2, spread = 0.42;
              const head = (tx, ty, ang) => items.push({ t: 'poly', pts: [tx, ty, tx - L * Math.cos(ang - spread), ty - L * Math.sin(ang - spread), tx - L * Math.cos(ang + spread), ty - L * Math.sin(ang + spread)].map(R), fill: c, k });
              head(bx, by, Math.atan2(by - ay, bx - ax)); if (nt.both) head(ax, ay, Math.atan2(ay - by, ax - bx));
            }
          }
        } else if (nt.type === 'text') {
          const [X, Y] = at(nt.x, nt.y);
          if (isFinite(X) && isFinite(Y)) {
            // a text of several lines: one under the other from the first, whose baseline is the place of the note; in a frame, on white
            const size = nt.size || S.label, lines = String(nt.text == null ? '' : nt.text).split('\n'), lead = size * 1.32, anchor = nt.anchor || 'start';
            const turn = +nt.rotate || 0, rad = turn * Math.PI / 180;                      // turned anticlockwise by so many degrees: 90 reads upwards
            // the place of a text is the baseline of its first line; or, when it says so, the top of its block or its middle. From there, down by `first` to that baseline.
            const first = nt.valign === 'top' ? size * 0.8 : nt.valign === 'middle' ? size * 0.35 - (lines.length - 1) * lead / 2 : 0;
            if (nt.frame && !turn) {
              const wide = Math.max(...lines.map((l) => textWidth(l, size))), pad = size * 0.5, left = (anchor === 'end' ? X - wide : anchor === 'middle' ? X - wide / 2 : X) - pad, top = Y + first - size * 0.92 - pad, bottom = Y + first + (lines.length - 1) * lead + size * 0.28 + pad;
              items.push({ t: 'poly', pts: [left, top, left + wide + 2 * pad, top, left + wide + 2 * pad, bottom, left, bottom].map(R), fill: '#ffffff', stroke: c, width: fig.stroke.axis * 0.8, k });
            }
            lines.forEach((l, i) => text(X + (first + i * lead) * Math.sin(rad), Y + (first + i * lead) * Math.cos(rad), l, size, { anchor, color: c, k, weight: nt.bold ? 'bold' : undefined, rotate: turn ? -turn : undefined }));
          }
        }
      });

      // the frame, the ticks, the numbers
      const open = fig.frame === 'open', aw = fig.stroke.axis, mirror = T.mirror && !open, right = AY2 || AY;
      const marksX = [], marksY = [], marksY2 = [], drawnOnly = (m) => m[0] !== m[2] || m[1] !== m[3];
      const tickX = (v, f) => { const X = sx.map(v); if (!(X >= box.x - 0.01 && X <= x1 + 0.01)) return; marksX.push([X, y1 - AX.in * f, X, y1 + AX.out * f]); if (mirror) marksX.push([X, box.y, X, box.y + AX.in * f]); };
      const tickY = (s, v, f, A, list, onRight) => { const Y = s.map(v); if (!(Y >= box.y - 0.01 && Y <= y1 + 0.01)) return; const X = onRight ? x1 : box.x, dir = onRight ? -1 : 1; list.push([X + dir * A.in * f, Y, X - dir * A.out * f, Y]); if (mirror && !sy2 && !onRight) list.push([x1 - A.in * f, Y, x1, Y]); };
      tx.major.forEach((m) => tickX(m.v, 1)); if (AX.minor) tx.minor.forEach((v) => tickX(v, 0.55));
      ty.major.forEach((m) => tickY(sy, m.v, 1, AY, marksY)); if (AY.minor) ty.minor.forEach((v) => tickY(sy, v, 0.55, AY, marksY));
      if (sy2) { ty2.major.forEach((m) => tickY(sy2, m.v, 1, AY2, marksY2, true)); if (AY2.minor) ty2.minor.forEach((v) => tickY(sy2, v, 0.55, AY2, marksY2, true)); }
      line(marksX.filter(drawnOnly), AX.color, AX.w); line(marksY.filter(drawnOnly), AY.color, AY.w); if (sy2) line(marksY2.filter(drawnOnly), AY2.color, AY2.w);
      if (AX.color === AY.color && AY.color === right.color) {            // one colour: one line around, with true corners
        line(open ? [[box.x, box.y, box.x, y1, x1, y1].concat(sy2 ? [x1, box.y] : [])] : [[box.x, box.y, x1, box.y, x1, y1, box.x, y1, box.x, box.y - aw / 2]], AX.color, aw, { join: 'miter', k: key('frame') });
      } else {                                                           // each side in the colour of its axis, a half width longer so that the corners close
        const half = aw / 2, side = (pts, color) => line([pts], color, aw, { k: key('frame') });
        side([box.x - half, y1, x1 + half, y1], AX.color); side([box.x, box.y - half, box.x, y1 + half], AY.color);
        if (!open) side([box.x - half, box.y, x1 + half, box.y], AX.color);
        if (!open || sy2) side([x1, box.y - half, x1, y1 + half], right.color);
      }
      const inside = (v, s, a, b) => { const P = s.map(v); return P >= a - 0.01 && P <= b + 0.01; };
      if (!e.shared) {
        const base = y1 + AX.out + 2.5 + AX.size * 0.74;
        tx.major.forEach((m) => { if (inside(m.v, sx, box.x, x1)) text(sx.map(m.v), base, m.runs, AX.size, { color: AX.color, k: key('xaxis') }); });
        const titleY = base + AX.size * 0.35 + 2 + AX.title * 0.82;
        if (p.x.label) text(box.x + box.w / 2 + AX.dx, titleY + AX.dy, p.x.label, AX.title, { color: AX.color, weight: AX.weight, style: AX.slant, k: key('xlabel') });
        if (tx.factor) text(x1, p.x.label ? titleY : base + AX.size * 1.2, tx.factor, AX.size, { anchor: 'end', color: AX.color, k: key('xaxis') });
      }
      ty.major.forEach((m) => { if (inside(m.v, sy, box.y, y1)) text(box.x - AY.out - 3, sy.map(m.v) + AY.size * 0.35, m.runs, AY.size, { anchor: 'end', color: AY.color, k: key('yaxis') }); });
      if (p.y.label) text(box.x - AY.out - 3 - n.wy - 3 - AY.title * 0.28 + AY.dx, box.y + box.h / 2 + AY.dy, p.y.label, AY.title, { rotate: -90, color: AY.color, weight: AY.weight, style: AY.slant, k: key('ylabel') });
      if (ty.factor) text(box.x, box.y - 2.5, ty.factor, AY.size, { anchor: 'start', color: AY.color, k: key('yaxis') });
      if (sy2) {
        ty2.major.forEach((m) => { if (inside(m.v, sy2, box.y, y1)) text(x1 + AY2.out + 3, sy2.map(m.v) + AY2.size * 0.35, m.runs, AY2.size, { anchor: 'start', color: AY2.color, k: key('y2axis') }); });
        if (p.y2.label) text(x1 + AY2.out + 3 + n.wy2 + 3 + AY2.title * 0.8 + AY2.dx, box.y + box.h / 2 + AY2.dy, p.y2.label, AY2.title, { rotate: -90, color: AY2.color, weight: AY2.weight, style: AY2.slant, k: key('y2label') });
        if (ty2.factor) text(x1, box.y - 2.5, ty2.factor, AY2.size, { anchor: 'end', color: AY2.color, k: key('y2axis') });
      }
      if (p.title) {
        const size = p.titleSize || S.title, at = p.titleAlign === 'left' ? [box.x, 'start'] : p.titleAlign === 'right' ? [x1, 'end'] : [box.x + box.w / 2, 'middle'];
        text(at[0], box.y - S.tick * 0.4 - size * 0.3, p.title, size, { anchor: at[1], color: p.titleColor || '#000000', weight: p.titleBold ? 'bold' : undefined, k: key('title') });
      }
      const tag = fig.tags && fig.tags !== 'none' && fig.panels.length > 1 ? fig.tags.replace('a', String.fromCharCode(97 + e.index)).replace('A', String.fromCharCode(65 + e.index)) : '';
      if (tag) text(box.x + S.tag * 0.5, box.y + S.tag * 1.25, tag, S.tag, { anchor: 'start', weight: 'bold', k: key('tag') });

      // the legend
      let legendBox = null;
      if (p.legend && p.legend.show !== false && legend.length) {
        const fs = S.legend, sample = fs * 2.3, padL = fs * 0.5, rowHt = fs * 1.4, widest = Math.max(...legend.map((l) => textWidth(l.label, fs)));
        const w = padL + sample + fs * 0.45 + widest + padL, hgt = rowHt * legend.length + fs * 0.5, inset = fs * 0.6 + Math.max(AX.in, AY.in);
        const pos = p.legend.pos || 'ne';
        let lx = pos === 'custom' ? box.x + p.legend.x * box.w : pos.includes('w') ? box.x + inset : pos.includes('e') ? x1 - inset - w : box.x + (box.w - w) / 2;
        let ly = pos === 'custom' ? box.y + p.legend.y * box.h : pos.includes('s') ? y1 - inset - hgt : pos === 'e' || pos === 'w' ? box.y + (box.h - hgt) / 2 : box.y + inset + (tag && pos === 'nw' ? S.tag * 1.5 : 0);
        if (pos === 'out') { lx = x1 + (colR[e.col] - n.beside) + 6; ly = box.y; }
        legendBox = { x: lx, y: ly, w, h: hgt, rows: legend.map((l, i) => ({ id: l.s.id, label: l.label, x: lx + padL + sample + fs * 0.45, y: ly + fs * 0.25 + rowHt * i, h: rowHt })) };
        if (p.legend.frame) items.push({ t: 'poly', pts: [lx, ly, lx + w, ly, lx + w, ly + hgt, lx, ly + hgt].map(R), fill: '#ffffff', stroke: '#000000', width: aw * 0.8, k: key('legend') });
        legend.forEach((l, i) => {
          const cy = ly + fs * 0.25 + rowHt * (i + 0.5), x0 = lx + padL, k = key('legend');
          if (l.type === 'bars' || l.type === 'area') items.push({ t: 'poly', pts: [x0, cy - fs * 0.32, x0 + sample, cy - fs * 0.32, x0 + sample, cy + fs * 0.32, x0, cy + fs * 0.32].map(R), fill: l.color, opacity: l.type === 'area' ? 0.3 : l.s.opacity, k });
          if (l.type === 'line' || l.type === 'both' || l.type === 'steps' || l.type === 'area') line([[x0, cy, x0 + sample, cy]], l.color, l.lw, { dash: l.dash, opacity: l.s.opacity, k });
          if (l.symbols) { const shape = MARKERS[l.s.marker] || MARKERS.circle; items.push(Object.assign({ t: 'marks', pts: [R(x0 + sample / 2), R(cy)], size: l.s.size || 3.5, fill: shape.strokes ? null : l.s.open ? '#ffffff' : l.color, stroke: shape.strokes || l.s.open ? l.color : null, width: shape.strokes || l.s.open ? Math.max(0.5, (l.s.size || 3.5) * 0.18) : 0, opacity: l.s.opacity, k }, shape)); }
          text(x0 + sample + fs * 0.45, cy + fs * 0.35, l.label, fs, { anchor: 'start', k });
        });
      }
      hit.panels.push({ id: p.id, index: e.index, box, sx, sy, sy2, legend: legendBox, xr: e.xr, yr: e.yr, y2r: e.y2r });
    });
    return { width: fig.width, height: fig.height, background: fig.background || '#ffffff', font: fig.font || 'Arial', items, hit };
  }
  const pairsReversed = (flat) => flat;        // `down` was filled from the end: it already runs back along the lower edge
  /* A curve as lines, cut where a value is missing. A long one is thinned to what a page can show: per step of a fifth of a point, its first, lowest, highest and last value. */
  function polylines(X, Y, steps) {
    const paths = []; let cur = [];
    const n = X.length, dense = n > 6000 && !steps;
    let bucket = null, b0 = 0, lo = 0, hi = 0, first = 0, last = 0, ilo = 0, ihi = 0;
    const flushBucket = () => { if (bucket == null) return; const px = bucket / 5; cur.push(px, first); if (ilo < ihi) cur.push(px, lo, px, hi); else if (ihi < ilo) cur.push(px, hi, px, lo); cur.push(px, last); bucket = null; };
    for (let i = 0; i < n; i++) {
      const x = X[i], y = Y[i];
      if (!isFinite(x) || !isFinite(y)) { flushBucket(); if (cur.length > 2) paths.push(cur); cur = []; continue; }
      if (dense) {
        const b = Math.round(x * 5);
        if (bucket !== b) { flushBucket(); bucket = b; b0 = i; lo = hi = first = last = y; ilo = ihi = i; }
        else { last = y; if (y < lo) { lo = y; ilo = i; } if (y > hi) { hi = y; ihi = i; } }
      } else if (steps && cur.length) { cur.push(x, cur[cur.length - 1], x, y); } else cur.push(x, y);
    }
    flushBucket();
    if (cur.length > 2) paths.push(cur);
    return paths;
  }

  // ------------------------------------------------------------------ the list as SVG
  const FONTS = { Arial: 'Arial, Helvetica, "Liberation Sans", Arimo, sans-serif', Helvetica: 'Helvetica, Arial, "Nimbus Sans", "Liberation Sans", sans-serif',
    'Times New Roman': '"Times New Roman", Times, "Liberation Serif", Tinos, serif', 'DejaVu Sans': '"DejaVu Sans", Verdana, sans-serif' };
  function svg(list, opt) {
    opt = opt || {};
    const W = R(list.width * MM), H = R(list.height * MM), esc = ASY.escapeXml, clips = [], body = [];
    const clipOf = (c) => { if (!c) return ''; const id = c.join(','); let i = clips.indexOf(id); if (i < 0) { clips.push(id); i = clips.length - 1; } return ' clip-path="url(#' + (opt.prefix || 'c') + i + ')"'; };
    const common = (it) => (it.opacity != null && it.opacity !== 1 ? ' opacity="' + it.opacity + '"' : '') + clipOf(it.clip) + (opt.keys && it.k ? ' data-k="' + esc(it.k) + '"' : '') + (it.ghost ? ' pointer-events="none"' : '');          // a ghost is seen and lets the pointer through to what is under it
    const d = (p, close) => { let s = 'M' + p[0] + ' ' + p[1]; for (let i = 2; i < p.length; i += 2) s += 'L' + p[i] + ' ' + p[i + 1]; return s + (close ? 'Z' : ''); };
    for (const it of list.items) {
      if (it.t === 'line') {
        const path = it.paths.map((p) => d(p)).join('');
        body.push('<path d="' + path + '" fill="none" stroke="' + it.stroke + '" stroke-width="' + it.width + '"' + (it.dash ? ' stroke-dasharray="' + it.dash.join(' ') + '"' : '') + ' stroke-linejoin="' + (it.join === 'round' ? 'round' : 'miter') + '" stroke-linecap="' + (it.cap === 'round' ? 'round' : 'butt') + '"' + common(it) + '/>');
        // on screen only: a curve or a line of a note is a hair wide, and a pointer needs more than that to take it
        if (opt.keys && it.k && it.width < 6 && /^(series|note):/.test(it.k)) body.push('<path d="' + path + '" fill="none" stroke="#000000" stroke-opacity="0" stroke-width="6"' + clipOf(it.clip) + ' data-k="' + esc(it.k) + '"/>');
      }
      else if (it.t === 'poly') body.push('<path d="' + d(it.pts, true) + '" fill="' + (it.fill || 'none') + '"' + (it.stroke ? ' stroke="' + it.stroke + '" stroke-width="' + (it.width || 0.5) + '"' : '') + common(it) + '/>');
      else if (it.t === 'marks') {
        const z = it.size, r = R(z / 2); let path = '';
        for (let i = 0; i < it.pts.length; i += 2) {
          const x = it.pts[i], y = it.pts[i + 1];
          if (it.circle) path += 'M' + R(x - r) + ' ' + y + 'a' + r + ' ' + r + ' 0 1 0 ' + R(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + R(-2 * r) + ' 0Z';
          else if (it.verts) path += it.verts.map((v, j) => (j ? 'L' : 'M') + R(x + v[0] * z) + ' ' + R(y + v[1] * z)).join('') + 'Z';
          else path += it.strokes.map((s) => 'M' + R(x + s[0] * z) + ' ' + R(y + s[1] * z) + 'L' + R(x + s[2] * z) + ' ' + R(y + s[3] * z)).join('');
        }
        body.push('<path d="' + path + '" fill="' + (it.fill || 'none') + '"' + (it.stroke ? ' stroke="' + it.stroke + '" stroke-width="' + it.width + '"' : '') + common(it) + '/>');
      } else if (it.t === 'text') {
        let inner = '', shift = 0;
        for (const r of it.runs) {            // raised and lowered runs are moved by dy, which every reader of SVG understands (baseline-shift is not one of those things)
          const want = r.v === 1 ? -0.36 * it.size : r.v === -1 ? 0.2 * it.size : 0, dy = R(want - shift);
          inner += '<tspan' + (dy ? ' dy="' + dy + '"' : '') + (r.v ? ' font-size="' + R(it.size * 0.7) + '"' : '') + '>' + esc(r.s) + '</tspan>';
          shift = want;
        }
        body.push('<text x="' + it.x + '" y="' + it.y + '" font-size="' + it.size + '" text-anchor="' + (it.anchor || 'start') + '" fill="' + (it.color || '#000000') + '"' + (it.weight === 'bold' ? ' font-weight="bold"' : '') + (it.style === 'italic' ? ' font-style="italic"' : '') +
          (it.rotate ? ' transform="rotate(' + it.rotate + ' ' + it.x + ' ' + it.y + ')"' : '') + ' xml:space="preserve"' + common(it) + '>' + inner + '</text>');
      }
    }
    const defs = clips.length ? '<defs>' + clips.map((c, i) => { const [x, y, w, h] = c.split(','); return '<clipPath id="' + (opt.prefix || 'c') + i + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/></clipPath>'; }).join('') + '</defs>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + list.width + 'mm" height="' + list.height + 'mm" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + (FONTS[list.font] || FONTS.Arial) + '\'>' + defs + body.join('') + '</svg>';
  }
  /* What the server is sent to draw: the list, without what only the page uses. */
  const sendable = (list) => ({ width: list.width, height: list.height, background: list.background, font: list.font,
    items: list.items.map((it) => { const o = {}; for (const key in it) if (key !== 'k' && it[key] !== undefined) o[key] = it[key]; return o; }) });

  ASY.plot = { MM, PALETTES, MARKERS, DASHES, TYPES, GREEK, FORMAT, formatOf, applyFormat, defaults, panel, axis, series, runs, plain, literal, textWidth, range, ticks, scale, layout, svg, sendable, FONTS };
})(window.ASY);
