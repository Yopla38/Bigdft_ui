/* Small things every script of the page uses: making elements, writing numbers, ids, downloads. No state. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';

  /* h('div', {class: 'x', onclick: fn}, child, 'text', [more]) : null, false and undefined children are skipped. */
  function h(tag, attrs, ...kids) {
    const el = tag === 'svg' || tag === 'path' ? document.createElementNS(SVG, tag) : document.createElement(tag);
    for (const k in attrs || {}) {
      const val = attrs[k];
      if (val == null || val === false) continue;
      if (k === 'class') el.setAttribute('class', val);
      else if (k === 'value' && 'value' in el) el.value = val;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'open') el[k] = !!val;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), val);
      else el.setAttribute(k, val === true ? '' : val);
    }
    for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  /* Put these children in `el`, in place of what it held. Lists are opened and nothing is skipped silently into the text "null". */
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(4).filter((k) => k != null && k !== false).map((k) => (k.nodeType ? k : document.createTextNode(String(k))))); return el; };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const escapeXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* A number as a person reads it: `sig` significant digits, no trailing zeros, powers of ten beyond 1e±5. */
  function fmt(v, sig) {
    if (v == null || v === '') return '';
    if (typeof v !== 'number') return String(v);
    if (!isFinite(v)) return isNaN(v) ? '' : (v > 0 ? '∞' : '−∞');
    if (v === 0) return '0';
    sig = sig || 6;
    const a = Math.abs(v);
    let s = a >= 1e6 || a < 1e-4 ? v.toExponential(sig - 1) : v.toPrecision(sig);
    if (s.includes('e')) { let [m, e] = s.split('e'); if (m.includes('.')) m = m.replace(/\.?0+$/, ''); s = m + 'e' + (+e); }
    else if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s.replace('-', '−');
  }
  /* A value and its uncertainty, the value written to the digit its uncertainty reaches: 7.012 ± 0.045. */
  function pm(v, err) {
    if (v == null || !isFinite(v)) return '';
    if (err == null || !isFinite(err) || err <= 0) return fmt(v, 7);
    const place = Math.floor(Math.log10(err)) - 1;                       // two digits of uncertainty
    const big = Math.max(Math.abs(v), err), exp = Math.floor(Math.log10(big));
    if (exp >= 6 || exp < -4) {
      const k = Math.pow(10, exp), d = Math.max(0, exp - place);
      return ('(' + (v / k).toFixed(d) + ' ± ' + (err / k).toFixed(d) + ')e' + exp).replace(/-/g, '−');
    }
    const d = clamp(-place, 0, 15);
    return (v.toFixed(d) + ' ± ' + err.toFixed(d)).replace(/-/g, '−');
  }
  const parseNum = (text) => {
    if (typeof text === 'number') return text;
    let s = String(text == null ? '' : text).trim().replace('−', '-');
    if (!s) return NaN;
    if (/^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');       // 1.234,5
    else if (/^[-+]?\d+,\d+([eE][-+]?\d+)?$/.test(s)) s = s.replace(',', '.');                    // 3,14
    const v = Number(s);
    return isNaN(v) ? NaN : v;
  };
  const when = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : s < 86400 * 30 ? Math.round(s / 86400) + ' d ago' : new Date(iso).toLocaleDateString();
  };
  function download(data, name, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const letters = (i) => { let s = ''; i += 1; while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; };

  Object.assign(ASY, { h, fill, $, clamp, debounce, escapeXml, fmt, pm, parseNum, when, download, letters });
})(window.ASY);
