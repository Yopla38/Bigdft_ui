/* Notebook importer: a Jupyter notebook (nbformat 4) becomes a guided path.
 *
 * The same code reads the notebooks bundled with the workshop and the ones an
 * administrator adds. Nothing in a notebook is executed and none of its text is
 * trusted: Markdown is escaped before any formatting is applied, and outputs
 * are ignored. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';

  const text = (source) => (Array.isArray(source) ? source.join('') : String(source || ''));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const snap = (x, allowed) => allowed.reduce((best, a) => (Math.abs(Math.log10(a) - Math.log10(x)) < Math.abs(Math.log10(best) - Math.log10(x)) ? a : best));

  /* PyBigDFT calls the workshop can replay on a blueprint. Each entry is
   * [pattern, match -> list of {key, value}]. A call that is not listed stays
   * in the step as code: the learner reads it, the workshop does not guess. */
  const XC = ['LDA', 'PBE', 'PBE0', 'B3LYP', 'HF'];
  const MOVES = [
    [/\bset_xc\(\s*["']([\w-]+)["']/g, (m) => (XC.includes(m[1].toUpperCase()) ? [{ key: 'xc', value: m[1].toUpperCase() }] : [])],
    [/\bset_hgrid\(\s*(\d*\.?\d+)\s*\)/g, (m) => [{ key: 'hgrid', value: clamp(+(+m[1]).toFixed(2), 0.25, 0.65) }]],
    [/\bset_rmult\(\s*(?:\[\s*)?(?:coarse\s*=\s*)?(\d*\.?\d+)\s*,\s*(?:fine\s*=\s*)?(\d*\.?\d+)/g, (m) => [{ key: 'crmult', value: clamp(Math.round(+m[1] * 2) / 2, 3, 10) }, { key: 'frmult', value: clamp(Math.round(+m[2] * 2) / 2, 4, 12) }]],
    [/\bspin_polarize\(\s*(?:mpol\s*=\s*)?(\d+)?/g, (m) => [{ key: 'nspin', value: 2 }, { key: 'mpol', value: clamp(+(m[1] || 1), 0, 12) }]],
    [/\.charge\(\s*(?:charge\s*=\s*)?(-?\d+)\s*\)/g, (m) => [{ key: 'charge', value: clamp(+m[1], -4, 4) }]],
    [/\bset_dispersion_correction\(/g, () => [{ key: 'dispersion', value: true }]],
    [/\boptimize_geometry\(([^)]*)\)/g, (m) => { const meth = /method\s*=\s*["'](\w+)["']/.exec(m[1]); return [{ key: 'action', value: 'geopt' }].concat(meth && ['FIRE', 'SQNM', 'LBFGS', 'DIIS'].includes(meth[1]) ? [{ key: 'geoptMethod', value: meth[1] }] : []); }],
    [/\bset_implicit_solvent\(([^)]*)\)/g, (m) => { const s = /solvent\s*=\s*["'](\w+)["']/.exec(m[1]); return [{ key: 'solvent', value: s && ['water', 'ethanol', 'mesitylene'].includes(s[1]) ? s[1] : 'water' }]; }],
    [/\bset_kpt_mesh\([^)]*ngkpt\s*=\s*\[\s*(\d+)/g, (m) => [{ key: 'kpt', value: clamp(+m[1], 1, 8) }]],
    [/\bset_linear_scaling\(/g, () => [{ key: 'algo', value: 'linear' }]],
    [/\bwrite_density_on_disk\(/g, () => [{ key: 'density', value: true }]],
    [/\bwrite_cubefiles_around_fermi_level\(\s*(?:nplot\s*=\s*)?(\d+)?/g, (m) => [{ key: 'nplot', value: clamp(+(m[1] || 1), 0, 8) }]],
    [/\bcalculate_dipole\(/g, () => [{ key: 'dipole', value: true }]],
    [/\bcalculate_multipoles\(/g, () => [{ key: 'charges', value: true }]],
    [/\bset_scf_convergence\(\s*(?:gnrm\s*=\s*)?(\d*\.?\d+(?:[eE]-?\d+)?)/g, (m) => [{ key: 'gnrm', value: snap(+m[1], [1e-3, 1e-4, 1e-5, 1e-6]) }]],
    [/\bset_electronic_temperature\(\s*(?:kT\s*=\s*)?(\d*\.?\d+(?:[eE]-?\d+)?)/g, (m) => [{ key: 'tel', value: clamp(+(+m[1]).toFixed(3), 0, 0.03) }]],
  ];
  const HANDLED = /^(set_xc|set_hgrid|set_rmult|spin_polarize|charge|set_dispersion_correction|optimize_geometry|set_implicit_solvent|set_kpt_mesh|set_linear_scaling|write_density_on_disk|write_cubefiles_around_fermi_level|calculate_dipole|calculate_multipoles|set_scf_convergence|set_electronic_temperature)$/;
  const SETUP = /^\s*(!|%|import condacolab|condacolab\.|from google\.colab|$|#)/;

  function movesOf(code) {
    const found = [];
    for (const [pattern, build] of MOVES) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(code))) for (const mv of build(m)) found.push({ key: mv.key, value: mv.value, at: m.index, call: m[0].replace(/^\./, '') });
    }
    found.sort((a, b) => a.at - b.at);
    const closed = (c) => c + ((c.match(/\(/g) || []).length > (c.match(/\)/g) || []).length ? ')' : '');
    return found.map(({ key, value, call }) => ({ key, value, call: closed(call) }));
  }
  /* Input-file calls of a cell that the workshop does not replay. */
  function keptOf(code) {
    const names = new Set();
    const re = /\binp\w*\.(\w+)\(/g;
    let m;
    while ((m = re.exec(code))) if (!HANDLED.test(m[1])) names.add(m[1]);
    return [...names];
  }

  /* notebook JSON -> { title, steps: [{ title, md, codes: [{ src, setup }], moves, kept, setup }] }
   * A cell made only of shell or magic lines is environment setup: the workshop
   * runs in the pack's container, so it is shown folded and yields no move. */
  function parse(nb, fallbackTitle) {
    if (!nb || !Array.isArray(nb.cells)) throw new Error('This file is not a Jupyter notebook: it has no "cells" list.');
    if (nb.nbformat && nb.nbformat < 4) throw new Error('This notebook uses nbformat ' + nb.nbformat + '. Re-save it with a recent Jupyter (nbformat 4) and try again.');
    const steps = [];
    let title = '', cur = null;
    const open = (t) => { cur = { title: t, md: '', codes: [], moves: [], kept: [], setup: false }; steps.push(cur); };
    for (const cell of nb.cells.slice(0, 400)) {
      const src = text(cell.source);
      if (!src.trim()) continue;
      if (cell.cell_type === 'markdown') {
        let fence = false;
        for (const line of src.split('\n')) {
          if (/^\s*(```|~~~)/.test(line)) fence = !fence;
          const head = !fence && /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
          if (head) {
            const t = head[2].replace(/[*_`]/g, '');
            if (head[1].length === 1 && !title) title = t;
            open(t);
          } else {
            if (!cur) open('Introduction');
            cur.md += line + '\n';
          }
        }
        cur.md += '\n';
      } else if (cell.cell_type === 'code') {
        if (!cur) open('Introduction');
        cur.codes.push({ src: src.slice(0, 6000), setup: src.split('\n').every((l) => SETUP.test(l)) });
      }
    }
    for (const s of steps) {
      s.md = s.md.trim().slice(0, 12000);
      s.setup = s.codes.length > 0 && s.codes.every((c) => c.setup);
      for (const c of s.codes) {
        if (c.setup) continue;
        s.moves.push(...movesOf(c.src));
        for (const k of keptOf(c.src)) if (!s.kept.includes(k)) s.kept.push(k);
      }
    }
    const kept = steps.filter((s) => s.md || s.codes.length).slice(0, 80);
    if (!kept.length) throw new Error('This notebook has no text or code cell to turn into steps.');
    return { title: title || fallbackTitle || 'Untitled notebook', steps: kept };
  }

  // --- a small, safe Markdown renderer -----------------------------------------
  function inline(s) {
    let out = esc(s);
    const codes = [];
    out = out.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)&]+(?:&amp;[^\s)&]+)*)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[+i] + '</code>');
  }
  function markdown(md) {
    const html = [];
    let para = [], list = null, fence = null;
    const flush = () => {
      if (para.length) { html.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
      if (list) { html.push('<' + list.tag + '>' + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + '</' + list.tag + '>'); list = null; }
    };
    for (const line of md.split('\n')) {
      if (fence !== null) {
        if (/^\s*(```|~~~)/.test(line)) { html.push('<pre>' + esc(fence.join('\n')) + '</pre>'); fence = null; } else fence.push(line);
        continue;
      }
      if (/^\s*(```|~~~)/.test(line)) { flush(); fence = []; continue; }
      const head = /^ {0,3}#{4,6}\s+(.+)$/.exec(line), item = /^\s*(?:[-*+]|(\d+)[.)])\s+(.+)$/.exec(line);
      if (head) { flush(); html.push('<h4>' + inline(head[1]) + '</h4>'); }
      else if (item) {
        if (para.length) flush();
        const tag = item[1] ? 'ol' : 'ul';
        if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
        list.items.push(item[2]);
      } else if (!line.trim()) flush();
      else if (list && /^\s{2,}\S/.test(line)) list.items[list.items.length - 1] += ' ' + line.trim();
      else { if (list) flush(); para.push(line.trim()); }
    }
    if (fence !== null) html.push('<pre>' + esc(fence.join('\n')) + '</pre>');
    flush();
    return html.join('');
  }

  /* What is kept of a notebook: cell types and their text, nothing else. */
  const strip = (nb) => ({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: nb.cells.filter((c) => (c.cell_type === 'markdown' || c.cell_type === 'code') && text(c.source).trim()).slice(0, 400).map((c) => ({ cell_type: c.cell_type, source: text(c.source) })) });

  OND.notebook = { parse, markdown, movesOf, strip };
})(window.OND);
