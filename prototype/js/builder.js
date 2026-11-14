/* Building a study by hand: three gestures on a block, and the workshop writes
 * the pipeline. The board and the script are two views of the same study, as
 * the blocks and the YAML are two views of a blueprint.
 *
 * The generated script has the shape of the pipeline found in a real capsule
 * (generate the inputs, dry-run them all, run in dependency order, analyse),
 * and uses the hand-over procedures that capsule verified. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  let ctx = null, sel = 'A', blocks = [];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const SWEEPS = {
    hgrid: { label: 'Grid spacing', values: '0.50, 0.45, 0.40, 0.35', call: (x) => 'inp.set_hgrid(' + x + ')', loop: 'h', parse: Number, ok: (x) => x >= 0.25 && x <= 0.65 },
    rmult: { label: 'Extent of the regions', values: '5/8, 6/9, 7/10', call: (x) => 'inp.set_rmult(coarse=' + x + '[0], fine=' + x + '[1])', loop: 'rm', parse: (s) => String(s).split('/').map(Number), ok: (x) => x.length === 2 && x[0] >= 3 && x[1] > x[0] },
    xc: { label: 'Functional', values: 'LDA, PBE, PBE0', call: (x) => 'inp.set_xc(' + x + ')', loop: 'xc', parse: (s) => String(s).trim().toUpperCase(), ok: (x) => ['LDA', 'PBE', 'PBE0', 'B3LYP', 'HF'].includes(x) },
  };
  /* What can follow a block: [title, changes written in PyBigDFT, what is handed over] */
  const NEXT = {
    relax: ['Relaxation', ['inp.optimize_geometry(method="SQNM", nsteps=300, forcemax=2.0e-4)'], ['geometry'], 'Relax the geometry'],
    triplet: ['Triplet state', ['inp.spin_polarize(mpol=2)', 'inp["dft"].update(itermax=200, nrepmax=5)  # a triplet needs more iterations and restarts'], ['geometry'], 'Compute another spin state'],
    hybrid: ['PBE0 single point', ['inp.set_xc("PBE0")'], ['geometry', 'wavefunctions'], 'Recompute with a hybrid functional'],
    spectrum: ['Excitations', ['inp.extract_virtual_states(nvirt=8)', 'inp.calculate_coupling_matrix(tda=True)'], ['geometry', 'wavefunctions'], 'Compute excitations'],
  };
  const UNITS = { eV: ['HA_EV', 'eV'], 'kJ/mol': ['HA_KJ', 'kJ/mol'], Ha: ['1.0', 'Ha'] };

  const get = (id) => blocks.find((b) => b.id === id);
  const isRelax = (b) => b.kind !== 'formula' && b.changes.some((c) => c.includes('optimize_geometry'));
  const nextId = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !get(l));
  const members = (b) => (b.sweep ? b.sweep.values.length : 1);
  const upstream = (b) => (b.kind === 'formula' ? [b.a, b.b] : b.from ? [b.from] : []);
  const downstream = (id) => blocks.filter((b) => upstream(b).includes(id));

  function example() {
    blocks = [
      { id: 'A', kind: 'run', title: 'Ground state', changes: [] },
      { id: 'B', kind: 'run', title: 'Triplet state', from: 'A', takes: ['geometry'], changes: NEXT.triplet[1] },
      { id: 'C', kind: 'formula', title: 'Triplet energy', a: 'B', b: 'A', unit: 'eV' },
    ];
    sel = 'A';
  }

  // --- checks: a link is checked like a parameter -----------------------------------
  function problems() {
    const out = [];
    for (const b of blocks) {
      // Starting from the same structure as a series is fine; taking something a series computed is ambiguous.
      if (b.from && get(b.from).sweep && (b.takes.includes('wavefunctions') || isRelax(get(b.from)))) out.push([b.id, 'Block ' + b.id + ' takes what ' + b.from + ' computed, but ' + b.from + ' is a series: which member? Continue from a single run, or remove the series on ' + b.from + '.']);
      if (b.kind === 'formula') {
        const A = get(b.a), B = get(b.b);
        if (A.sweep && B.sweep && (A.sweep.key !== B.sweep.key || A.sweep.values.join() !== B.sweep.values.join())) out.push([b.id, 'The two series compared in ' + b.id + ' do not vary the same values.']);
        else if (!!A.sweep !== !!B.sweep) out.push([b.id, 'In ' + b.id + ', ' + (A.sweep ? A.id : B.id) + ' is a series and ' + (A.sweep ? B.id : A.id) + ' is a single run: the difference would compare different settings. Vary both the same way.']);
      }
      if (b.takes && b.takes.includes('wavefunctions') && b.sweep && b.sweep.key !== 'xc') out.push([b.id, 'Block ' + b.id + ' restarts from wavefunctions and varies the grid: wavefunctions can only be handed over on the same grid.']);
    }
    return out;
  }

  // --- the script ------------------------------------------------------------------
  function script() {
    const base = ctx.base(), L = [], order = blocks.filter((b) => b.kind !== 'formula'), formulas = blocks.filter((b) => b.kind === 'formula');
    const needWrite = new Set(blocks.filter((b) => b.takes && b.takes.includes('wavefunctions')).map((b) => b.from));
    const relaxed = new Set(order.filter((b) => b.changes.some((c) => c.includes('optimize_geometry'))).map((b) => b.id));
    L.push('"""Study pipeline, written by the workshop from the board.', '', 'Edit it freely: the board is redrawn from this file. Run from the study directory:', '    python study.py --dry-run     # every input must pass before anything is computed', '    python study.py               # run in dependency order, then analyse', '"""');
    L.push('import shutil', 'import sys', 'from pathlib import Path', '', 'import yaml', 'from BigDFT.Calculators import SystemCalculator', 'from BigDFT.Inputfiles import Inputfile', '');
    L.push('HA_EV, HA_KJ = 27.211386245988, 2625.4996394799', 'STRUCTURE = "' + base.file + '"  # ' + base.system, 'RUNS = Path("runs")', '', '');
    L.push('def blueprint():', '    """The settings of the workshop blueprint this study starts from."""', '    inp = Inputfile()');
    for (const l of base.lines) L.push('    ' + l);
    L.push('    return inp', '', '', 'def relaxed(name):', '    """Final geometry of a relaxation, as BigDFT wrote it."""', '    pos = yaml.safe_load((RUNS / f"final_{name}.yaml").read_text())["positions"]', '    return {"units": "angstroem", "positions": [{e: v} for p in pos for e, v in p.items() if e != "force"]}', '', '');
    L.push('def inputs():', '    """One entry per run: its input, the relaxation its geometry comes from, the run it restarts from."""', '    runs = {}');
    for (const b of order) {
      const sw = b.sweep && SWEEPS[b.sweep.key], geo = b.from && relaxed.has(b.from) ? ', geometry="' + b.from + '"' : '';
      L.push('', '    # ' + b.id + ': ' + b.title + (b.from ? ', continues ' + b.from + ' (' + b.takes.join(' and ') + ')' : '') + (sw ? ', varied over ' + sw.label.toLowerCase() : ''));
      const ind = sw ? '        ' : '    ';
      if (sw) L.push('    for ' + sw.loop + ' in (' + b.sweep.values.map((x) => (b.sweep.key === 'rmult' ? '(' + x.join(', ') + ')' : b.sweep.key === 'xc' ? '"' + x + '"' : x.toFixed(2))).join(', ') + '):');
      L.push(ind + 'inp = blueprint()');
      for (const c of b.changes) L.push(ind + c);
      if (sw) L.push(ind + sw.call(sw.loop));
      if (needWrite.has(b.id)) L.push(ind + 'inp.write_orbitals_on_disk()  # ' + downstream(b.id).filter((d) => d.takes && d.takes.includes('wavefunctions')).map((d) => d.id).join(', ') + ' restarts from these');
      if (b.takes && b.takes.includes('wavefunctions')) L.push(ind + 'inp.read_orbitals_from_disk()');
      const name = sw ? 'f"' + b.id + '_{' + (b.sweep.key === 'rmult' ? sw.loop + '[0]:.0f}-{' + sw.loop + '[1]:.0f' : sw.loop + (b.sweep.key === 'hgrid' ? ':.2f' : '')) + '}"' : '"' + b.id + '"';
      L.push(ind + 'runs[' + name + '] = dict(input=inp' + geo + (b.takes && b.takes.includes('wavefunctions') ? ', restart="' + b.from + '"' : '') + ')');
    }
    L.push('    return runs', '', '');
    L.push('def run(dry_run=False):', '    code = SystemCalculator(omp="' + base.omp + '", mpi_run="mpirun -np ' + base.mpi + '", dry_run=dry_run, skip=True, verbose=False)', '    logs = {}', '    for name, r in inputs().items():  # written in dependency order', '        if r.get("restart") and not dry_run:', '            # hand-over of wavefunctions: the whole data directory, as verified in the 6a capsule', '            shutil.copytree(RUNS / f"data-{r[\'restart\']}", RUNS / f"data-{name}", dirs_exist_ok=True)', '        # a relaxed geometry exists only once its relaxation has run; a dry run uses the starting one', '        posinp = relaxed(r["geometry"]) if r.get("geometry") and not dry_run else STRUCTURE', '        logs[name] = code.run(name=name, input=r["input"], posinp=posinp, run_dir=str(RUNS))', '    return logs', '', '');
    L.push('def analyse(logs):', '    E = {name: log.energy for name, log in logs.items()}', '    out = {}');
    for (const f of formulas) {
      const A = get(f.a), B = get(f.b), u = UNITS[f.unit];
      if (A.sweep || B.sweep) { const s = A.sweep ? A : B; L.push('    for key in [n.split("_", 1)[1] for n in E if n.startswith("' + s.id + '_")]:  # ' + f.id + ': one value per member of the series', '        out[f"' + f.id + '_{key}"] = (E[' + (A.sweep ? 'f"' + A.id + '_{key}"' : '"' + A.id + '"') + '] - E[' + (B.sweep ? 'f"' + B.id + '_{key}"' : '"' + B.id + '"') + ']) * ' + u[0]); }
      else L.push('    out["' + f.id + '"] = (E["' + f.a + '"] - E["' + f.b + '"]) * ' + u[0] + '  # ' + f.title + ', ' + u[1]);
    }
    L.push('    return out', '', '', 'if __name__ == "__main__":', '    dry = "--dry-run" in sys.argv', '    logs = run(dry_run=dry)', '    if not dry:', '        print(yaml.safe_dump(analyse(logs)))');
    return L;
  }
  /* Python, coloured without ever touching the markup it produces: comment first, then strings. */
  function colour(line) {
    let quote = null, cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '#') { cut = i; break; }
    }
    const code = line.slice(0, cut).split(/("[^"]*"|'[^']*')/).map((seg, n) => (n % 2 ? '<span class="s">' + esc(seg) + '</span>' : n ? esc(seg) : esc(seg).replace(/^(\s*)(def|for|if|import|from|return)\b/, '$1<span class="k">$2</span>')));
    return code.join('') + (cut < line.length ? '<span class="c">' + esc(line.slice(cut)) + '</span>' : '');
  }

  // --- drawing ----------------------------------------------------------------------
  function layout() {
    const col = {}, rows = {};
    const depth = (b) => (col[b.id] != null ? col[b.id] : (col[b.id] = upstream(b).length ? 1 + Math.max(...upstream(b).map((u) => depth(get(u)))) : 0));
    return blocks.map((b) => { const c = depth(b), r = rows[c] = (rows[c] == null ? 0 : rows[c] + 1); return { id: b.id, col: c, row: r, type: b.kind === 'formula' ? 'formula' : b.changes.some((x) => x.includes('optimize_geometry')) ? 'relax' : b.sweep ? 'series' : 'run', title: b.id + ' · ' + b.title, sub: b.kind === 'formula' ? null : b.sweep ? SWEEPS[b.sweep.key].label + ', ' + members(b) + ' values' : b.from ? 'continues ' + b.from : 'from your blueprint', tex: b.kind === 'formula' ? 'E(' + b.a + ')-E(' + b.b + ')' : null, block: b }; });
  }
  const edges = () => blocks.flatMap((b) => (b.kind === 'formula' ? [[b.a, b.id, 'energies'], [b.b, b.id, 'energies']] : b.from ? [[b.from, b.id, b.takes.includes('wavefunctions') ? 'wavefunctions' : 'geometry']] : []));
  const statusOf = (bad) => (n) => (bad.some((p) => p[0] === n.id) ? ['partial', 'to fix'] : n.block.kind === 'formula' ? ['draft', n.block.unit] : ['draft', members(n.block) + (members(n.block) > 1 ? ' runs' : ' run')]);

  function render() {
    const { h, $ } = ctx, bad = problems(), b = get(sel) || blocks[0], base = ctx.base();
    OND.studyView.drawBoard($('#mine-board'), layout(), edges(), b.id, (id) => { sel = id; render(); }, statusOf(bad));
    // what next?
    const kids = [h('p', { class: 'label' }, 'Block ' + b.id), h('label', { class: 'field' }, h('span', { class: 'label' }, 'Name'), h('input', { id: 'mine-name', type: 'text', value: b.title, maxlength: 40, onchange: (e) => { b.title = e.target.value.trim() || b.title; render(); } }))];
    if (b.kind === 'formula') {
      kids.push(h('p', {}, 'Energy of ' + b.a + ' minus energy of ' + b.b + '.'), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Unit'), h('div', { class: 'seg' }, Object.keys(UNITS).map((u) => h('button', { type: 'button', 'aria-pressed': String(b.unit === u), onclick: () => { b.unit = u; render(); } }, u)))));
    } else {
      kids.push(h('p', {}, !b.from ? 'Uses the blueprint of the workshop: ' + base.system + '.' : isRelax(get(b.from)) ? 'Takes the relaxed ' + b.takes.join(' and the ') + ' of ' + b.from + '.' : b.takes.includes('wavefunctions') ? 'Same structure as ' + b.from + ', and restarts from its wavefunctions.' : 'Same structure as ' + b.from + '.'),
        b.changes.length ? h('pre', {}, b.changes.join('\n')) : null);
      // gesture 1: vary
      const cur = b.sweep, key = cur ? cur.key : 'hgrid';
      kids.push(h('p', { class: 'label', style: 'margin-top:8px' }, '1 · Vary a setting'),
        h('div', { class: 'vary' }, h('select', { id: 'mine-sweep-key', 'aria-label': 'Setting to vary', onchange: (e) => { $('#mine-sweep-values').value = SWEEPS[e.target.value].values; } }, Object.entries(SWEEPS).map(([k, s]) => h('option', { value: k, selected: k === key }, s.label))),
          h('input', { id: 'mine-sweep-values', type: 'text', 'aria-label': 'Values, separated by commas', value: cur ? cur.raw : SWEEPS[key].values }),
          h('button', { class: 'btn small', type: 'button', onclick: () => {
            const k = $('#mine-sweep-key').value, raw = $('#mine-sweep-values').value, vals = raw.split(',').map((x) => SWEEPS[k].parse(x.trim())).filter((x) => SWEEPS[k].ok(x));
            b.sweep = vals.length > 1 ? { key: k, values: vals, raw } : null; render();
          } }, cur ? 'Update' : 'Vary'),
          cur ? h('button', { class: 'btn small', type: 'button', onclick: () => { b.sweep = null; render(); } }, 'Single run') : null));
      // gesture 2: continue
      kids.push(h('p', { class: 'label', style: 'margin-top:8px' }, '2 · Continue from it'),
        h('div', { class: 'chips' }, Object.entries(NEXT).map(([k, n]) => h('button', { class: 'chip', type: 'button', onclick: () => { const id = nextId(); if (!id) return; blocks.push({ id, kind: 'run', title: n[0], from: b.id, takes: n[2], changes: n[1] }); sel = id; render(); } }, n[3]))));
      // gesture 3: compare
      const others = blocks.filter((x) => x.kind !== 'formula' && x.id !== b.id);
      if (others.length) kids.push(h('p', { class: 'label', style: 'margin-top:8px' }, '3 · Compare it'),
        h('div', { class: 'vary' }, h('span', {}, 'E(' + b.id + ') −'), h('select', { id: 'mine-other', 'aria-label': 'Block to subtract' }, others.map((x) => h('option', { value: x.id }, 'E(' + x.id + ')  ' + x.title))),
          h('button', { class: 'btn small', type: 'button', onclick: () => { const id = nextId(); if (!id) return; blocks.push({ id, kind: 'formula', title: 'Difference', a: b.id, b: $('#mine-other').value, unit: 'eV' }); sel = id; render(); } }, 'Add the formula')));
    }
    if (blocks.length > 1 && !downstream(b.id).length) kids.push(h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn small', type: 'button', onclick: () => { blocks = blocks.filter((x) => x !== b); sel = blocks[blocks.length - 1].id; render(); } }, 'Remove this block')));
    else if (blocks.length > 1) kids.push(h('p', { class: 'figmeta', style: 'margin-top:10px' }, 'Other blocks depend on this one: remove them first.'));
    for (const p of bad.filter((x) => x[0] === b.id)) kids.push(h('div', { class: 'notice err' }, h('b', {}, 'To fix'), h('span', {}, p[1])));
    $('#mine-next').replaceChildren(...kids);
    // script and plan
    $('#mine-code').innerHTML = script().map(colour).join('\n');
    const runs = blocks.filter((x) => x.kind !== 'formula').reduce((n, x) => n + members(x), 0), relax = blocks.filter((x) => x.kind !== 'formula' && x.changes.some((c) => c.includes('optimize_geometry'))).length;
    $('#mine-plan').replaceChildren(
      h('ol', { class: 'pipe plain' },
        h('li', {}, h('b', {}, 'Generate'), h('span', {}, runs + ' input' + (runs > 1 ? 's' : '') + ' written from the blueprint and the changes of each block.')),
        h('li', {}, h('b', {}, 'Dry run'), h('span', {}, 'BigDFT reads each input and estimates memory. Nothing is computed until all ' + runs + ' pass.')),
        h('li', {}, h('b', {}, 'Run'), h('span', {}, 'In the pack’s container, in dependency order' + (relax ? '; a relaxation must finish before what continues from it' : '') + '. One blueprint run is estimated at ' + base.cost + '; the dry run gives the real figure per block.')),
        h('li', {}, h('b', {}, 'Analyse'), h('span', {}, blocks.filter((x) => x.kind === 'formula').length + ' formula' + (blocks.filter((x) => x.kind === 'formula').length === 1 ? '' : 's') + ' applied to the energies read from the logs; figures drawn from the kind of each block.'))),
      bad.length ? h('div', { class: 'notice err' }, h('b', {}, 'The study cannot start'), h('span', {}, bad.map((p) => p[1]).join(' '))) : h('p', { style: 'color:var(--ok);font-size:13px' }, 'The study is consistent: ' + blocks.length + ' blocks, ' + runs + ' runs.'),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('button', { class: 'btn', type: 'button', disabled: true }, 'Dry run the study'), h('button', { class: 'btn cta', type: 'button', disabled: true }, 'Run the study')),
      h('p', { class: 'figmeta' }, 'Not executed in this mock-up. Saved as a capsule, the study carries this script, its inputs, its logs and the decisions taken on the way.'));
  }

  OND.builder = {
    mount(context) { ctx = context; example(); },
    render() { if (ctx) render(); },
    reset() { blocks = [{ id: 'A', kind: 'run', title: 'Ground state', changes: [] }]; sel = 'A'; render(); },
    example() { example(); render(); },
    script: () => script().join('\n'),
  };
})(window.OND);
