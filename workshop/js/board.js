/* The board: steps drawn as boxes on a lattice, linked by typed arrows. The same
 * drawing as the Study space of version 1 (prototype/js/study.js), on its own so
 * that the workshop can show the map of a study without the rest of that space. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  let ctx = {};
  const LINKS = { geometry: ['Geometry', ''], wavefunctions: ['Wavefunctions', '7 4'], choice: ['Choice of settings', '2 4'], energies: ['Energies into a formula', ''], criterion: ['Criterion fixed in advance', '2 4'], lesson: ['Lesson from a failed attempt', '1 5'] };
  const ICON = { structure: '<circle cx="6" cy="12" r="3"/><circle cx="14.5" cy="6" r="2.3"/><circle cx="14" cy="15.5" r="1.8"/><path d="M8.6 10.4l3.8-3M8.9 13l3.4 1.7"/>', series: '<path d="M4 15V9M8 15V5M12 15v-4M16 15V7"/>', run: '<path d="M6 4l9 6-9 6z"/>', relax: '<path d="M3 6c3 0 3 8 7 8s4-5 7-5"/><circle cx="10" cy="14" r="1.3"/>', formula: '<path d="M5 6h10M5 10h7M5 14h10"/>', decision: '<path d="M10 3l7 7-7 7-7-7z"/>', target: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.2"/>' };
  const CW = 186, CH = 98, PX = 222, PY = 130, PAD = 14;


  function status(n) {
    if (n.state) return [n.state, n.pill];
    if (n.type === 'formula') return ['partial', n.value];
    const st = stage(n.stage);
    if (n.aside) return ['aside', 'set aside'];
    if (!st.done) return ['queued', 'queued · ' + st.planned + ' runs'];
    return st.done < st.planned ? ['partial', st.done + ' of ' + st.planned + ' done'] : ['done', st.done + ' of ' + st.planned + ' done'];
  }

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

  /* Draws any study: nodes placed on a (col, row) lattice, typed links, one selection.
   * Used for the real study and for the one a user builds. */
  function drawBoard(host, nodes, edges, sel, onSelect, statusOf, opt = {}) {
    const { h } = ctx, px = opt.px || PX, lane = px - CW;                 // opt.px: a tighter column pitch, for a board that must fit
    const pos = (n) => ({ x: PAD + n.col * px + (n.dx || 0), y: PAD + n.row * PY + (n.dy || 0) });
    const W = PAD * 2 + Math.max(...nodes.map((n) => n.col)) * px + CW, H = PAD * 2 + Math.max(...nodes.map((n) => n.row)) * PY + CH;
    const svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'edges'); svg.setAttribute('aria-hidden', 'true');
    const head = (id, cls) => '<marker id="' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path class="' + cls + '" d="M0 0L8 4L0 8z"/></marker>';
    svg.innerHTML = '<defs>' + head('arr', 'ah') + head('arr-on', 'ah on') + '</defs>';
    const paths = edges.map(([a, b, type]) => { const p = document.createElementNS(svgNS, 'path'); p.setAttribute('class', 'edge ' + type); if (LINKS[type][1]) p.setAttribute('stroke-dasharray', LINKS[type][1]); p.dataset.a = a; p.dataset.b = b; svg.appendChild(p); return p; });
    const route = () => paths.forEach((p) => {
      const na = nodes.find((n) => n.id === p.dataset.a), nb = nodes.find((n) => n.id === p.dataset.b), A = pos(na), B = pos(nb);
      let d;
      if (Math.abs(A.x - B.x) < CW / 2) d = 'M' + (A.x + CW / 2) + ' ' + (A.y + CH) + 'L' + (B.x + CW / 2) + ' ' + (B.y - 3);            // same column: straight down
      else if (nb.col - na.col > 1 && !na.dx && !nb.dx && !na.dy && !nb.dy) {                                                           // skips a column: go round the blocks
        const yc = Math.min(A.y, B.y) + CH + (PY - CH) / 2, xa = A.x + CW + lane * 0.44, xb = B.x - lane * 0.5;
        d = rounded([[A.x + CW, A.y + CH / 2], [xa, A.y + CH / 2], [xa, yc], [xb, yc], [xb, B.y + CH / 2], [B.x - 3, B.y + CH / 2]], 9);
      } else {
        const x0 = A.x + CW, y0 = A.y + CH / 2, x1 = B.x - 3, y1 = B.y + CH / 2, c = Math.max(14, (x1 - x0) * 0.55);
        d = 'M' + x0 + ' ' + y0 + 'C' + (x0 + c) + ' ' + y0 + ' ' + (x1 - c) + ' ' + y1 + ' ' + x1 + ' ' + y1;
      }
      const on = na.id === sel || nb.id === sel;
      p.setAttribute('d', d); p.classList.toggle('on', on); p.setAttribute('marker-end', on ? 'url(#arr-on)' : 'url(#arr)');
    });
    const cards = nodes.map((n) => {
      const [st, label] = statusOf(n), p = pos(n);
      const card = h('button', { class: 'node t-' + n.type + ' s-' + st, type: 'button', 'aria-pressed': String(n.id === sel), style: 'left:' + p.x + 'px;top:' + p.y + 'px' },
        h('b', {}, n.title),
        n.tex ? h('span', { class: 'node-tex' }, '$' + n.tex + '$') : h('span', { class: 'node-sub' }, n.sub),
        h('span', { class: 'node-foot' }, h('span', { class: 'node-pill s-' + st }, label), h('i', { class: 'node-ico', html: '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[n.type] + '</svg>' })));
      let start = null;
      card.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, dx: n.dx || 0, dy: n.dy || 0, moved: false }; card.setPointerCapture(e.pointerId); });
      card.addEventListener('pointermove', (e) => {
        if (!start) return;
        const mx = e.clientX - start.x, my = e.clientY - start.y;
        if (!start.moved && Math.hypot(mx, my) < 5) return;
        start.moved = true; n.dx = start.dx + mx; n.dy = start.dy + my;
        const q = pos(n); card.style.left = q.x + 'px'; card.style.top = q.y + 'px'; route();
      });
      card.addEventListener('pointerup', () => { const moved = start && start.moved; start = null; if (!moved) onSelect(n.id); });
      card.addEventListener('pointercancel', () => { start = null; });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } });
      return card;
    });
    const canvas = h('div', { class: 'board-canvas', style: 'width:' + W + 'px;height:' + H + 'px' }, svg, cards);
    const keep = host.scrollLeft;
    host.replaceChildren(canvas);
    host.scrollLeft = keep;
    route();
    if (ctx.typeset) ctx.typeset(canvas);
  }

  OND.board = { init(context) { ctx = context; }, draw: drawBoard, LINKS };
})(window.OND);
