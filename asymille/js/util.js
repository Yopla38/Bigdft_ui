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
  /* A browser gives a page its clipboard, and the right to ask where a file goes, on https and on localhost only. At a plain http address neither is there:
     what the page can still do is done another way, and the person is told why the rest is not. */
  const plainHttp = () => window.isSecureContext === false;
  /* Text to the clipboard: true when it is there. Without the clipboard of the page, the old command copies what is selected in a field made for it. */
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* tried the other way */ } }
    const was = document.activeElement, field = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0' });
    field.value = text;
    (document.querySelector('dialog[open]') || document.body).append(field);          // inside the dialog that is open, or it could not take the focus
    field.focus({ preventScroll: true }); field.select();
    let done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
    field.remove(); if (was && was.focus) was.focus({ preventScroll: true });
    return done;
  }
  /* The text of the clipboard, or null when the browser does not give it to a page (plain http, or refused): Ctrl+V still works then, in a cell or a field. */
  async function pastedText() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return null;
    try { return await navigator.clipboard.readText(); } catch (e) { return null; }
  }
  /* The name a file will have when the browser does not ask: a small window with the name to rewrite. Gives the name, or null when the person gave up. */
  function askName(name, last) {
    return new Promise((resolve) => {
      let answer = null;
      const input = h('input', { class: 'inp', type: 'text', value: name, maxlength: 120, spellcheck: 'false', id: 'save-name' });
      const el = h('dialog', { class: 'dlg', 'aria-label': 'Save a file', style: 'width:520px', onclose: () => { el.remove(); resolve(answer); } },
        h('div', { class: 'dlg-head' }, h('h2', {}, 'Save a file'), h('button', { class: 'btn small', type: 'button', onclick: () => el.close() }, 'Cancel')),
        h('form', { class: 'dlg-body', method: 'dialog', onsubmit: (e) => {
          e.preventDefault();
          let v = input.value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, ''); if (!v) return;
          if (last && !v.toLowerCase().endsWith(last.toLowerCase())) v += last;
          answer = v; el.close(); } },
          h('label', { class: 'field2' }, h('span', {}, 'Name of the file'), input),
          h('p', { class: 'say' }, 'It goes to the folder of downloads of the browser. ', plainHttp()
            ? 'This page is open at a plain http address, and a browser lets a page ask where to save only on https or on localhost.'
            : 'This browser does not let a page ask where to save.',
            ' To choose the folder each time, turn on “Ask where to save each file before downloading” in the settings of the browser, under Downloads.'),
          h('div', { class: 'acts' }, h('button', { class: 'btn small cta', type: 'submit', id: 'save-go' }, 'Save'))));
      document.body.append(el); el.showModal();
      const ending = (/(\.[A-Za-z0-9]+)+$/.exec(name) || [''])[0]; input.focus(); input.setSelectionRange(0, name.length - ending.length);          // the name is selected, not its ending (.asymille.json): typing replaces it
    });
  }
  /* Where a file goes. A browser that lets a page ask (Chromium, on https or on localhost) shows its own window: the person chooses the folder and the name,
     before the file is made. Elsewhere the page asks the name (unless `named`: it was just asked) and the browser saves the file in its folder of downloads.
         const to = await ASY.saveAs('figure.pdf', 'application/pdf');   // null: the person gave up
         if (to) await to.write(blob);                                    // to.chosen says whether the place was chosen; to.name is the name it has */
  async function saveAs(name, mime, named) {
    const kind = mime || 'application/octet-stream', last = (/\.[A-Za-z0-9]+$/.exec(name) || [''])[0];
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker(Object.assign({ suggestedName: name }, last && /^[\w.+-]+\/[\w.+-]+$/.test(kind) ? { types: [{ description: last.slice(1).toUpperCase() + ' file', accept: { [kind]: [last] } }] } : {}));
        const to = { name: handle.name, chosen: true, write: async (data) => {
          try { const w = await handle.createWritable(); await w.write(data instanceof Blob ? data : new Blob([data], { type: kind })); await w.close(); }
          catch (e) { to.chosen = false; download(data, to.name, kind); }          // the browser would not write there after all: the file is not lost, it is downloaded
        } };
        return to;
      } catch (e) { if (e && e.name === 'AbortError') return null; /* the browser would not ask (no gesture left, not allowed here): the file is downloaded */ }
    }
    const asked = named ? name : await askName(name, last);
    if (asked == null) return null;
    return { name: asked, chosen: false, write: async (data) => download(data, asked, kind) };
  }
  const letters = (i) => { let s = ''; i += 1; while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; };

  Object.assign(ASY, { h, fill, $, clamp, debounce, escapeXml, fmt, pm, parseNum, when, download, saveAs, copyText, pastedText, plainHttp, letters });
})(window.ASY);
