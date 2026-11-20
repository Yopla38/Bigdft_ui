/* The graph of a study: one box per step, linked by typed arrows. It follows the
 * board of the first workshop's Study space (prototype/js/study.js), redrawn
 * for a study that is being built: a box says what the step is, what it gave,
 * and where it stands.
 *
 * A study reads from left to right. It is usually a long chain, longer than
 * the place it is shown in, so the chain wraps like a line of text: it is cut
 * into bands of as many columns as fit, one under the other. An arrow that
 * goes to a later band leaves by the right of its box, runs in the gap under
 * the band and enters the next box from the left. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  let ctx = {};
  /* type of link: [what it means, dash pattern] */
  const LINKS = {
    settings: ['same settings', ''],
    geometry: ['relaxed geometry', ''],
    structure: ['computed on', '10 3 2 3'],
    wavefunctions: ['wavefunctions', '7 4'],
    energies: ['results read', ''],
    choice: ['decision applied', '2 4'],
    criterion: ['judged against', '1 5'],
  };
  const ICON = { structure: '<circle cx="6" cy="12" r="3"/><circle cx="14.5" cy="6" r="2.3"/><circle cx="14" cy="15.5" r="1.8"/><path d="M8.6 10.4l3.8-3M8.9 13l3.4 1.7"/>', series: '<path d="M4 15V9M8 15V5M12 15v-4M16 15V7"/>', run: '<path d="M6 4l9 6-9 6z"/>', relax: '<path d="M3 6c3 0 3 8 7 8s4-5 7-5"/><circle cx="10" cy="14" r="1.3"/>', formula: '<path d="M5 6h10M5 10h7M5 14h10"/>', decision: '<path d="M10 3l7 7-7 7-7-7z"/>', target: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.2"/>', levels: '<path d="M4 15h12M4 11h12M4 5h12" /><path d="M4 8h12" stroke-dasharray="2 2.5"/>' };
  const CW = 196, CH = 92, PX = 236, PY = 114, PADX = 26, PADY = 16, GAP = 40, LANE = PX - CW;
  const ZOOMS = [1, 0.9, 0.8, 0.72];       // sizes tried for reading; under the last one the titles of the boxes no longer read
  const SMALLEST = 0.05;

  /* An orthogonal path with rounded corners through the given points. */
  function rounded(pts, r) {
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const a = Math.min(r, Math.hypot(x - px, y - py) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
      d += 'L' + (x - Math.sign(x - px) * a) + ' ' + (y - Math.sign(y - py) * a) + 'Q' + x + ' ' + y + ' ' + (x + Math.sign(nx - x) * b) + ' ' + (y + Math.sign(ny - y) * b);
    }
    return d + 'L' + pts[pts.length - 1][0] + ' ' + pts[pts.length - 1][1];
  }

  /* Where the boxes go when the chain is cut into bands of `per` columns. */
  function layout(nodes, per) {
    const bands = [];
    for (const n of nodes) { const b = Math.floor(n.col / per); (bands[b] = bands[b] || { rows: new Set() }).rows.add(n.row); }
    let top = PADY;
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b] = bands[b] || { rows: new Set([0]) };
      band.rows = [...band.rows].sort((x, y) => x - y);
      band.top = top; band.bottom = top + (band.rows.length - 1) * PY + CH; band.gap = band.bottom + (PY - CH + GAP) / 2;
      top = band.bottom + PY - CH + GAP;
    }
    const place = (n) => { const b = Math.floor(n.col / per), band = bands[b]; return { band: b, x: PADX + (n.col % per) * PX, y: band.top + band.rows.indexOf(n.row) * PY }; };
    const cols = Math.min(per, Math.max(...nodes.map((n) => n.col)) + 1);
    return { bands, place, W: PADX * 2 + cols * PX - LANE, H: bands[bands.length - 1].bottom + PADY };
  }

  /* nodes: { id, col, row, type, title, sub, res, say, state }   edges: [from, to, type]
     opt: { onAdd(id): a "+" on the selected box; onMove(node); reveal: keep the selected box in sight;
            avoid: { w, h } a corner at the bottom right of the host that something else covers;
            zoom: 'fit' the largest size that still reads, the chain cut to the width (it scrolls if it must);
                  'all' the whole study in sight, however small, cut into bands the way that shows it largest;
                  a number: that size, and nothing else changes;
            per: with a number, the columns of a band. Zooming is then only a change of size: the chain is
                 not cut again, so no box changes place }
     Returns { z, per }: the zoom and the columns per band that were used. */
  function draw(host, nodes, edges, sel, onSelect, opt = {}) {
    const { h } = ctx, avoid = opt.avoid || { w: 0, h: 0 };
    const fits = (z) => Math.max(2, Math.floor((host.clientWidth / z - PADX * 2 + LANE) / PX));
    let z = opt.zoom, per = opt.per;
    if (z === 'all') {
      let best = null;
      for (let p = 2; p <= Math.max(2, ...nodes.map((n) => n.col + 1)); p++) {
        const l = layout(nodes, p), q = Math.min(1, (host.clientWidth - 4) / l.W, (host.clientHeight - 4) / l.H);
        if (!best || q > best.z + 1e-9) best = { z: q, per: p };
      }
      z = Math.max(SMALLEST, best.z); per = best.per;
    } else if (!z || z === 'fit') { z = ZOOMS.find((q) => layout(nodes, fits(q)).H * q <= host.clientHeight) || ZOOMS[ZOOMS.length - 1]; per = fits(z); }
    else { z = Math.max(SMALLEST, z); per = per || fits(z); }
    const L = layout(nodes, per), at = new Map(nodes.map((n) => [n.id, L.place(n)]));
    const pos = (n) => { const p = at.get(n.id); return { x: p.x + (n.dx || 0), y: p.y + (n.dy || 0), band: p.band }; };
    const W = L.W, H = L.H + avoid.h / z;                     // room to scroll the last boxes out of the covered corner
    const svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'edges'); svg.setAttribute('aria-hidden', 'true');
    const head = (id, cls) => '<marker id="' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path class="' + cls + '" d="M0 0L8 4L0 8z"/></marker>';
    svg.innerHTML = '<defs>' + head('arr', 'ah') + head('arr-on', 'ah on') + '</defs>';
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const twins = (a, b) => edges.filter((e) => e[0] === a && e[1] === b).length;
    const leaving = {};                                                                    // arrows that leave each band, to run them side by side in its gap
    const paths = edges.map(([a, b, type], i) => {
      const p = document.createElementNS(svgNS, 'path'); p.setAttribute('class', 'edge ' + type); if (LINKS[type][1]) p.setAttribute('stroke-dasharray', LINKS[type][1]);
      p.dataset.a = a; p.dataset.b = b;
      p.dataset.shift = String((edges.slice(0, i).filter((e) => e[0] === a && e[1] === b).length - (twins(a, b) - 1) / 2) * 9);     // two links between the same boxes run side by side
      const ba = at.get(a).band, bb = at.get(b).band;
      if (bb !== ba) { leaving[ba] = (leaving[ba] || 0) + 1; p.dataset.track = String(leaving[ba] - 1); }
      svg.appendChild(p); return p;
    });
    const route = () => paths.forEach((p) => {
      const na = byId.get(p.dataset.a), nb = byId.get(p.dataset.b), A = pos(na), B = pos(nb), s = +p.dataset.shift;
      const moved = na.dx || nb.dx || na.dy || nb.dy;
      let d;
      if (A.band !== B.band && !moved) {                                                    // to another band: out by the right, along the gap, in by the left
        const n = leaving[A.band] || 1, t = +p.dataset.track, off = (t - (n - 1) / 2) * Math.min(6, (GAP + PY - CH - 16) / n);
        const gap = L.bands[Math.min(A.band, B.band)].gap + off, xa = A.x + CW + LANE * 0.5 + off * 0.6, xb = B.x - LANE * 0.5 - off * 0.6;
        d = rounded([[A.x + CW, A.y + CH / 2 + s], [xa, A.y + CH / 2 + s], [xa, gap], [xb, gap], [xb, B.y + CH / 2 + s], [B.x - 3, B.y + CH / 2 + s]], 8);
      } else if (Math.abs(A.x - B.x) < CW / 2) {                                             // same column: straight down, or up
        const down = B.y > A.y;
        d = 'M' + (A.x + CW / 2 + s) + ' ' + (down ? A.y + CH : A.y) + 'L' + (B.x + CW / 2 + s) + ' ' + (down ? B.y - 3 : B.y + CH + 3);
      } else if (B.x - A.x > PX * 1.5 && !moved) {                                          // skips columns: along the space under the upper row
        const yc = Math.min(A.y, B.y) + CH + (PY - CH) / 2 + s * 0.6, xa = A.x + CW + LANE * 0.42, xb = B.x - LANE * 0.5;
        d = rounded([[A.x + CW, A.y + CH / 2 + s], [xa, A.y + CH / 2 + s], [xa, yc], [xb, yc], [xb, B.y + CH / 2 + s], [B.x - 3, B.y + CH / 2 + s]], 8);
      } else if (B.x < A.x && !moved) {                                                     // goes back: under both boxes
        const yc = Math.max(A.y, B.y) + CH + (PY - CH) / 2;
        d = rounded([[A.x + CW / 2, A.y + CH], [A.x + CW / 2, yc], [B.x + CW / 2, yc], [B.x + CW / 2, B.y + CH + 3]], 8);
      } else {
        const x0 = A.x + CW, y0 = A.y + CH / 2 + s, x1 = B.x - 3, y1 = B.y + CH / 2 + s, c = Math.max(14, (x1 - x0) * 0.55);
        d = 'M' + x0 + ' ' + y0 + 'C' + (x0 + c) + ' ' + y0 + ' ' + (x1 - c) + ' ' + y1 + ' ' + x1 + ' ' + y1;
      }
      const on = na.id === sel || nb.id === sel;
      p.setAttribute('d', d); p.classList.toggle('on', on); p.setAttribute('marker-end', on ? 'url(#arr-on)' : 'url(#arr)');
      if (on) svg.appendChild(p);                                                           // the arrows of the selected box are drawn over the others
    });
    let plus = null;
    const place = (n) => { if (plus && n.id === sel) { const q = pos(n); plus.style.left = (q.x + CW - 13) + 'px'; plus.style.top = (q.y - 11) + 'px'; } };
    const cards = nodes.map((n) => {
      const p = pos(n);
      const card = h('button', { class: 'node t-' + n.type + ' s-' + n.state, type: 'button', 'aria-pressed': String(n.id === sel), 'data-node': n.id, style: 'left:' + p.x + 'px;top:' + p.y + 'px', title: n.title + (n.sub ? ' · ' + n.sub : '') },
        h('span', { class: 'node-head' }, h('i', { class: 'node-ico', html: '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[n.type] + '</svg>' }), h('b', {}, n.title), h('span', { class: 'pdot ' + (n.state === 'given' ? 'done' : n.state) })),
        n.tex ? h('span', { class: 'node-sub node-tex' }, ctx.math(n.tex, n.sub || '')) : h('span', { class: 'node-sub' }, n.sub || ''),
        h('span', { class: 'node-res' + (n.res ? '' : ' none') }, n.res || n.say || ''));
      let start = null;
      card.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, dx: n.dx || 0, dy: n.dy || 0, moved: false }; card.setPointerCapture(e.pointerId); });
      card.addEventListener('pointermove', (e) => {
        if (!start) return;
        const mx = (e.clientX - start.x) / z, my = (e.clientY - start.y) / z;
        if (!start.moved && Math.hypot(mx, my) < 5) return;
        start.moved = true; n.dx = start.dx + mx; n.dy = start.dy + my;
        const q = pos(n); card.style.left = q.x + 'px'; card.style.top = q.y + 'px'; route(); place(n);
        if (opt.onMove) opt.onMove(n);
      });
      card.addEventListener('pointerup', () => { const moved = start && start.moved; start = null; if (!moved) onSelect(n.id); });
      card.addEventListener('pointercancel', () => { start = null; });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } });
      return card;
    });
    const chosen = byId.get(sel);
    if (opt.onAdd && chosen) { plus = h('button', { class: 'node-add', type: 'button', title: 'Add a step after “' + chosen.title + '”', 'aria-label': 'Add a step after ' + chosen.title, onclick: () => opt.onAdd(chosen.id) }, '+'); place(chosen); }
    const canvas = h('div', { class: 'board-canvas', style: 'width:' + W + 'px;height:' + H + 'px;zoom:' + z + ';--z:' + z }, svg, cards, plus);
    const keep = [host.scrollLeft, host.scrollTop];
    host.replaceChildren(canvas);
    host.scrollLeft = keep[0]; host.scrollTop = keep[1];
    route();
    if (chosen && opt.reveal) {                                    // keep the selected box in sight, without moving the page
      const q = pos(chosen), x = q.x * z, y = q.y * z, w = CW * z, t = CH * z;
      if (x < host.scrollLeft + 8) host.scrollLeft = x - 16; else if (x + w > host.scrollLeft + host.clientWidth - 8) host.scrollLeft = x + w - host.clientWidth + 16;
      const floor = host.clientHeight - (x + w - host.scrollLeft > host.clientWidth - avoid.w ? avoid.h : 0);
      if (y < host.scrollTop + 8) host.scrollTop = y - 16; else if (y + t > host.scrollTop + floor - 8) host.scrollTop = y + t - floor + 16;
    }
    return { z, per };
  }

  OND.board = { init(context) { ctx = context; }, draw, LINKS, SMALLEST };
})(window.OND);
