/* Figures: one renderer for the screen and for the journal.
 *
 * A figure is described by data (a spec), never by drawing code. The same spec
 * is drawn responsively in the page, or at the exact width of a journal column
 * with print typography, and the SVG that is shown is the SVG that is exported:
 * every colour is resolved, nothing depends on the page's stylesheet.
 *
 * spec = { title, caption, panels: [{ title, x, y, series, hlines, vlines, bands }], table }
 *   axis   = { label, log, min, max, fmt }
 *   series = { name, slot, pts: [[x, y], ...], dash, marker }
 * or spec = { kind: 'interval', x, rows: [{ label, value, note }], band }
 */
window.OND = window.OND || {};
(function (OND) {
  'use strict';

  // Categorical slots in fixed order (validated: CVD separation, lightness band,
  // contrast; aqua needs the direct labels and the table view on light surfaces).
  const PALETTE = { light: ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'], dark: ['#3987e5', '#d95926', '#199e70', '#9085e9'] };
  const PRESETS = {
    screen: { font: 11, family: '"IBM Plex Sans",system-ui,sans-serif', line: 2, marker: 4, hair: 1 },
    col1: { width: 241, mm: 85, font: 7, family: 'Helvetica,Arial,sans-serif', line: 1.1, marker: 2.2, hair: 0.5 },
    col2: { width: 482, mm: 170, font: 7, family: 'Helvetica,Arial,sans-serif', line: 1.1, marker: 2.2, hair: 0.5 },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sup = (n) => String(n).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

  function theme(preset) {
    if (preset !== 'screen') return { ink: '#000000', soft: '#333333', muted: '#555555', grid: '#dddddd', axis: '#000000', surface: '#ffffff', colors: PALETTE.light, good: '#0a7d32' };
    const css = getComputedStyle(document.documentElement), g = (n) => css.getPropertyValue(n).trim();
    const dark = css.colorScheme.includes('dark');
    return { ink: g('--fg'), soft: g('--fg-2'), muted: g('--fg-3'), grid: g('--line'), axis: g('--line-2'), surface: g('--panel'), colors: dark ? PALETTE.dark : PALETTE.light, good: g('--ok') };
  }

  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = [];
    for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-6; t += step) out.push(+t.toPrecision(12));
    return { ticks: out, step };
  }
  const defaultFmt = (step) => { const d = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9))); return (v) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };

  function scale(axis, values, lo, hi) {
    const log = !!axis.log;
    const vals = values.filter((v) => Number.isFinite(v) && (!log || v > 0));
    let min = axis.min != null ? axis.min : Math.min(...vals), max = axis.max != null ? axis.max : Math.max(...vals);
    if (log) {
      const a = Math.floor(Math.log10(min) + 1e-9), b = Math.ceil(Math.log10(max) - 1e-9), e0 = a === b ? a - 1 : a;
      const ticks = []; for (let e = e0; e <= b; e++) ticks.push(Math.pow(10, e));
      const skip = Math.ceil(ticks.length / 7);
      return { map: (v) => lo + (Math.log10(v) - e0) / (b - e0) * (hi - lo), ticks: ticks.filter((_, i) => i % skip === 0), fmt: (v) => '10' + sup(Math.round(Math.log10(v))), min: Math.pow(10, e0), max: Math.pow(10, b) };
    }
    if (axis.min == null || axis.max == null) { const pad = (max - min || Math.abs(max) || 1) * 0.06; if (axis.min == null) min -= pad; if (axis.max == null) max += pad; }
    const t = niceTicks(min, max, axis.count || 5);
    return { map: (v) => lo + (v - min) / (max - min) * (hi - lo), ticks: t.ticks, fmt: axis.fmt || defaultFmt(t.step), min, max };
  }

  /* Returns { svg, hit }: the SVG text and what the hover layer needs. */
  function draw(spec, opts) {
    const preset = (opts && opts.preset) || 'screen', P = PRESETS[preset], T = theme(preset);
    const W = P.width || Math.max(300, Math.round((opts && opts.width) || 520)), f = P.font, k = f / 11;
    const text = (x, y, s, o) => '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + ((o && o.size) || f) + '" fill="' + ((o && o.fill) || T.muted) + '"' + (o && o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o && o.weight ? ' font-weight="' + o.weight + '"' : '') + (o && o.rot ? ' transform="rotate(-90 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '') + '>' + esc(s) + '</text>';
    const hit = [];
    let body = '', H;

    if (spec.kind === 'interval') {
      const m = { l: 8 * k, r: 12 * k, t: 22 * k, b: 34 * k }, row = 30 * k;
      const labelW = Math.min(W * 0.56, Math.max(...spec.rows.map((r) => r.label.length)) * f * 0.52 + 12 * k); // room for the longest label
      H = m.t + spec.rows.length * row + m.b;
      const sx = scale(spec.x, spec.rows.map((r) => r.value).concat(spec.band ? [spec.band.x0, spec.band.x1] : []), m.l + labelW, W - m.r);
      if (spec.band) {
        body += '<rect x="' + sx.map(spec.band.x0) + '" y="' + (m.t - 6 * k) + '" width="' + (sx.map(spec.band.x1) - sx.map(spec.band.x0)) + '" height="' + (spec.rows.length * row + 6 * k) + '" fill="' + T.good + '" fill-opacity="0.16"/>';
        body += '<line x1="' + sx.map(spec.band.mid) + '" x2="' + sx.map(spec.band.mid) + '" y1="' + (m.t - 6 * k) + '" y2="' + (m.t + spec.rows.length * row) + '" stroke="' + T.good + '" stroke-width="' + P.line + '"/>';
        body += text(W - m.r, m.t - 10 * k, spec.band.label, { anchor: 'end', fill: T.soft });
      }
      for (const t of sx.ticks) {
        body += '<line x1="' + sx.map(t) + '" x2="' + sx.map(t) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="' + T.grid + '" stroke-width="' + P.hair + '"/>';
        body += text(sx.map(t), H - m.b + 13 * k, sx.fmt(t), { anchor: 'middle' });
      }
      body += text((m.l + labelW + W - m.r) / 2, H - 6 * k, spec.x.label, { anchor: 'middle', fill: T.soft });
      spec.rows.forEach((r, i) => {
        const y = m.t + i * row + row / 2;
        body += text(m.l, y + f * 0.35, r.label, { fill: T.ink });
        if (r.value == null) body += text(m.l + labelW + 6 * k, y + f * 0.35, r.note || 'pending', { fill: T.muted });
        else {
          const x = sx.map(r.value);
          body += '<circle cx="' + x + '" cy="' + y + '" r="' + (P.marker * 1.25) + '" fill="' + T.colors[0] + '" stroke="' + T.surface + '" stroke-width="' + (P.line * 0.9) + '"><title>' + esc(r.label + ': ' + sx.fmt(r.value) + ' ' + (spec.x.unit || '')) + '</title></circle>';
          body += text(x + 8 * k, y + f * 0.35, (r.text || sx.fmt(r.value)) + (r.note ? '  ' + r.note : ''), { fill: T.ink, weight: 600 });
        }
      });
    } else {
      const n = spec.panels.length, side = n > 1 && W >= 430 * k;
      const names = []; for (const p of spec.panels) for (const s of p.series) if (!names.some((x) => x.name === s.name)) names.push(s);
      const legendH = names.length > 1 ? 24 * k : 0;
      const pw = side ? W / n : W, ph = (opts && opts.panelHeight ? opts.panelHeight : 190) * k * (side || n === 1 ? 1 : 0.9);
      H = legendH + (side ? ph : ph * n);
      if (legendH) {
        let x = 4 * k;
        for (const s of names) {
          body += '<line x1="' + x + '" x2="' + (x + 16 * k) + '" y1="' + 9 * k + '" y2="' + 9 * k + '" stroke="' + T.colors[s.slot] + '" stroke-width="' + P.line + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
          body += '<circle cx="' + (x + 8 * k) + '" cy="' + 9 * k + '" r="' + P.marker + '" fill="' + T.colors[s.slot] + '"/>';
          body += text(x + 21 * k, 9 * k + f * 0.35, s.name, { fill: T.ink });
          x += 21 * k + s.name.length * f * 0.56 + 14 * k;
        }
      }
      spec.panels.forEach((p, pi) => {
        const ox = side ? pi * pw : 0, oy = legendH + (side ? 0 : pi * ph);
        const m = { l: 50 * k, r: (names.length > 1 ? 14 : 12) * k, t: (p.title ? 20 : 8) * k, b: 34 * k };
        const all = p.series.flatMap((s) => s.pts);
        const sx = scale(p.x, all.map((q) => q[0]).concat((p.vlines || []).map((v) => v.x)), ox + m.l, ox + pw - m.r);
        const sy = scale(p.y, all.map((q) => q[1]).concat((p.hlines || []).map((v) => v.y)), oy + ph - m.b, oy + m.t);
        if (p.title) body += text(ox + m.l, oy + 11 * k, p.title, { fill: T.ink, weight: 600 });
        for (const t of sy.ticks) {
          body += '<line x1="' + (ox + m.l) + '" x2="' + (ox + pw - m.r) + '" y1="' + sy.map(t) + '" y2="' + sy.map(t) + '" stroke="' + T.grid + '" stroke-width="' + P.hair + '"/>';
          body += text(ox + m.l - 5 * k, sy.map(t) + f * 0.35, sy.fmt(t), { anchor: 'end' });
        }
        const xt = p.x.ticks || sx.ticks;
        for (const t of xt) { body += '<line x1="' + sx.map(t) + '" x2="' + sx.map(t) + '" y1="' + (oy + ph - m.b) + '" y2="' + (oy + ph - m.b + 3 * k) + '" stroke="' + T.axis + '" stroke-width="' + P.hair + '"/>'; body += text(sx.map(t), oy + ph - m.b + 13 * k, (p.x.fmt || sx.fmt)(t), { anchor: 'middle' }); }
        body += '<line x1="' + (ox + m.l) + '" x2="' + (ox + pw - m.r) + '" y1="' + (oy + ph - m.b) + '" y2="' + (oy + ph - m.b) + '" stroke="' + T.axis + '" stroke-width="' + P.hair + '"/>';
        body += text(ox + (m.l + pw - m.r) / 2, oy + ph - 6 * k, p.x.label, { anchor: 'middle', fill: T.soft });
        body += text(ox + 10 * k, oy + (m.t + ph - m.b) / 2, p.y.label, { anchor: 'middle', fill: T.soft, rot: true });
        for (const h of p.hlines || []) {
          body += '<line x1="' + (ox + m.l) + '" x2="' + (ox + pw - m.r) + '" y1="' + sy.map(h.y) + '" y2="' + sy.map(h.y) + '" stroke="' + T.good + '" stroke-width="' + P.hair * 1.6 + '" stroke-dasharray="' + 4 * k + ' ' + 3 * k + '"/>';
          body += text(ox + m.l + 4 * k, sy.map(h.y) - 4 * k, h.label, { fill: T.soft });
        }
        for (const v of p.vlines || []) {
          body += '<line x1="' + sx.map(v.x) + '" x2="' + sx.map(v.x) + '" y1="' + (oy + m.t) + '" y2="' + (oy + ph - m.b) + '" stroke="' + T.muted + '" stroke-width="' + P.hair + '" stroke-dasharray="' + 2 * k + ' ' + 3 * k + '"/>';
          if (v.label) body += text(sx.map(v.x) + 3 * k, oy + m.t + 8 * k, v.label, {});
        }
        for (const s of p.series) {
          const pts = s.pts.filter((q) => Number.isFinite(q[1]) && (!p.y.log || q[1] > 0));
          const d = pts.map((q, i) => (i ? 'L' : 'M') + sx.map(q[0]).toFixed(2) + ' ' + sy.map(q[1]).toFixed(2)).join('');
          if (s.area) body += '<path d="' + d + 'L' + sx.map(pts[pts.length - 1][0]).toFixed(2) + ' ' + sy.map(sy.min).toFixed(2) + 'L' + sx.map(pts[0][0]).toFixed(2) + ' ' + sy.map(sy.min).toFixed(2) + 'Z" fill="' + T.colors[s.slot] + '" fill-opacity="0.14"/>';
          body += '<path d="' + d + '" fill="none" stroke="' + T.colors[s.slot] + '" stroke-width="' + P.line + '" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
          if (s.marker) for (const q of pts) body += '<circle cx="' + sx.map(q[0]).toFixed(2) + '" cy="' + sy.map(q[1]).toFixed(2) + '" r="' + P.marker + '" fill="' + T.colors[s.slot] + '" stroke="' + T.surface + '" stroke-width="' + P.line * 0.7 + '"/>';
        }
        hit.push({ x0: ox + m.l, x1: ox + pw - m.r, y0: oy + m.t, y1: oy + ph - m.b, sx, sy, panel: p });
      });
    }
    const size = P.mm ? ' width="' + P.mm + 'mm" height="' + (H / W * P.mm).toFixed(1) + 'mm"' : '';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H.toFixed(1) + '"' + size + ' font-family=\'' + P.family + '\' role="img" aria-label="' + esc(spec.title) + '"><rect width="' + W + '" height="' + H.toFixed(1) + '" fill="' + T.surface + '"/>' + body + '</svg>';
    return { svg, hit, W, H, T, P };
  }

  function render(host, spec, opts) {
    const o = Object.assign({ width: host.clientWidth || 520 }, opts), d = draw(spec, o);
    host.innerHTML = d.svg + '<div class="tip" hidden></div>';
    const svg = host.firstChild, tip = host.lastChild;
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = d.P.mm ? 'min(100%,' + d.W * (d.P.mm === 85 ? 2.1 : 1.7) + 'px)' : '100%';
    if (!d.hit.length) return;
    const ns = 'http://www.w3.org/2000/svg', cross = document.createElementNS(ns, 'g');
    cross.setAttribute('visibility', 'hidden'); svg.appendChild(cross);
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * d.W, py = (e.clientY - r.top) / r.height * d.H;
      const h = d.hit.find((q) => px >= q.x0 - 4 && px <= q.x1 + 4 && py >= q.y0 - 4 && py <= q.y1 + 16);
      if (!h) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
      const xs = [...new Set(h.panel.series.flatMap((s) => s.pts.map((q) => q[0])))];
      const x = xs.reduce((best, v) => (Math.abs(h.sx.map(v) - px) < Math.abs(h.sx.map(best) - px) ? v : best));
      const rows = h.panel.series.map((s) => { const q = s.pts.find((t) => t[0] === x); return q ? [s, q[1]] : null; }).filter(Boolean);
      cross.innerHTML = '<line x1="' + h.sx.map(x) + '" x2="' + h.sx.map(x) + '" y1="' + h.y0 + '" y2="' + h.y1 + '" stroke="' + d.T.muted + '" stroke-width="' + d.P.hair + '"/>' +
        rows.filter(([, y]) => !h.panel.y.log || y > 0).map(([s, y]) => '<circle cx="' + h.sx.map(x) + '" cy="' + h.sy.map(y) + '" r="' + d.P.marker * 1.3 + '" fill="' + d.T.colors[s.slot] + '" stroke="' + d.T.surface + '" stroke-width="' + d.P.line + '"/>').join('');
      cross.setAttribute('visibility', 'visible');
      const fx = h.panel.x.tip || h.panel.x.fmt || h.sx.fmt, fy = h.panel.y.tip || ((v) => (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5 ? v.toExponential(2) : +v.toPrecision(5)));
      tip.textContent = ''; tip.hidden = false;
      const head = document.createElement('div'); head.textContent = h.panel.x.label.split(' (')[0] + ' ' + fx(x); tip.appendChild(head);
      for (const [s, y] of rows) { const line = document.createElement('div'); const dot = document.createElement('i'); dot.style.background = d.T.colors[s.slot]; line.append(dot, s.name + '  ' + fy(y)); tip.appendChild(line); }
      tip.style.left = Math.min(r.width - 70, Math.max(70, h.sx.map(x) / d.W * r.width)) + 'px'; tip.style.top = h.y0 / d.H * r.height + 'px';
    });
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  OND.figure = { render, svgText: (spec, opts) => draw(spec, opts).svg, PRESETS };
})(window.OND);
