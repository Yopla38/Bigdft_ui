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
  let ctx = null, sel = 'A', blocks = [], mode = 'example', attempt = 1;  // attempt: which of the example's two runs is shown
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const SWEEPS = {
    hgrid: { label: 'Grid spacing', values: '0.50, 0.45, 0.40, 0.35', call: (x) => 'inp.set_hgrid(' + x + ')', loop: 'h', parse: Number, ok: (x) => x >= 0.25 && x <= 0.65 },
    rmult: { label: 'Extent of the regions', values: '5/8, 6/9, 7/10', call: (x) => 'inp.set_rmult(coarse=' + x + '[0], fine=' + x + '[1])', loop: 'rm', parse: (s) => String(s).split('/').map(Number), ok: (x) => x.length === 2 && x[0] >= 3 && x[1] > x[0] },
    xc: { label: 'Functional', values: 'LDA, PBE, PBE0', call: (x) => 'inp.set_xc(' + x + ')', loop: 'xc', parse: (s) => String(s).trim().toUpperCase(), ok: (x) => ['LDA', 'PBE', 'PBE0', 'B3LYP', 'HF'].includes(x) },
  };
  /* What can follow a block: [title, changes written in PyBigDFT, what is handed over, the gesture].
   * Only the geometry is handed over: the HAPS of the pack accepts BigDFT input files and nothing
   * else, so the wavefunctions of an earlier run cannot be sent back as a starting point. */
  const NEXT = {
    relax: ['Relaxation', ['inp.optimize_geometry(method="SQNM", nsteps=300, forcemax=2.0e-4)'], ['geometry'], 'Relax the geometry'],
    triplet: ['Triplet state', ['inp.spin_polarize(mpol=2)', 'inp["dft"].update(itermax=200, nrepmax=5)  # a triplet needs more iterations and restarts'], ['geometry'], 'Compute another spin state'],
    // BigDFT registers no pseudopotential for a hybrid functional and refuses the input: name the PBE ones.
    hybrid: ['PBE0 single point', ['inp.set_xc("PBE0")', 'for el in ELEMENTS:  # no pseudopotential is registered for a hybrid functional', '    inp["psppar." + el] = {"Pseudopotential XC": 11}  # use the PBE ones'], ['geometry'], 'Recompute with a hybrid functional'],
  };
  const UNITS = { eV: ['HA_EV', 'eV'], 'kJ/mol': ['HA_KJ', 'kJ/mol'], Ha: ['1.0', 'Ha'] };

  const get = (id) => blocks.find((b) => b.id === id);
  const isRelax = (b) => b.kind !== 'formula' && b.changes.some((c) => c.includes('optimize_geometry'));
  const nextId = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !get(l));
  const members = (b) => (b.sweep ? b.sweep.values.length : 1);
  const upstream = (b) => (b.kind === 'formula' ? [b.a, b.b] : b.from ? [b.from] : []);
  const downstream = (id) => blocks.filter((b) => upstream(b).includes(id));

  /* The example is a study that was really run (examples/water-study): its board, its blueprint and
   * its logs travel together. While the board is the one that ran, the script shown is the script
   * that ran, character for character, and its results are shown below it. */
  const EX = () => OND.example;
  const sig = (bs) => JSON.stringify(bs.map((b) => Object.assign({}, b, b.sweep ? { sweep: { key: b.sweep.key, values: b.sweep.values } } : {})));
  const ran = () => mode === 'example' && sig(blocks) === sig(EX().blocks);
  const origin = () => (mode === 'example' ? { system: EX().system, lines: EX().attempts[attempt].base, example: true } : ctx.base());

  function example() {
    blocks = JSON.parse(JSON.stringify(EX().blocks));
    for (const b of blocks) if (b.sweep && !b.sweep.raw) b.sweep.raw = b.sweep.values.map((x) => x.toFixed(2)).join(', ');
    mode = 'example'; sel = 'A';
  }

  /* The relaxation whose final geometry a block starts from, through any number of "same structure as" links. */
  const geometryOf = (b) => (!b.from ? null : isRelax(get(b.from)) ? b.from : geometryOf(get(b.from)));
  /* A block is prepared in the wave after the relaxation it waits for has come back. */
  const wave = (b) => (geometryOf(b) ? 1 + wave(get(geometryOf(b))) : 1);

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
    }
    return out;
  }

  // --- the script ------------------------------------------------------------------
  /* Run names go to `bigdft -n NAME`: letters, digits, '_' and '-' only (the HAPS refuses anything else). */
  const SUFFIX = { hgrid: 'f"_h{round(h * 100):03d}"', rmult: 'f"_r{rm[0]:.0f}-{rm[1]:.0f}"', xc: 'f"_{xc}"' };

  function script() {
    const base = origin(), L = [], order = blocks.filter((b) => b.kind !== 'formula'), formulas = blocks.filter((b) => b.kind === 'formula');
    L.push('"""Study pipeline, written by the workshop from the board.', '',
      'A calculation has two places. Here, in the pack\'s container: prepare, dry-run and analyse,',
      'with PyBigDFT. On the HAPS: compute, `bigdft -n NAME` on each prepared NAME.yaml, nothing else.', '',
      '    python study.py prepare   # writes runs/NAME.yaml for every run that is ready, and dry-runs it',
      '    #   -> send the names it prints to the HAPS: haps_bigdft(names=[...], directory="runs")',
      '    python study.py analyse   # reads the logs the HAPS sent back',
      'Repeat `prepare` after each wave: what continues from a relaxation is ready once its log is back.', '"""');
    L.push('import sys', 'from pathlib import Path', '', 'import yaml', 'from BigDFT.Calculators import SystemCalculator', 'from BigDFT.Inputfiles import Inputfile', 'from BigDFT.Logfiles import Logfile', '');
    L.push('HA_EV, HA_KJ = 27.211386245988, 2625.4996394799', 'RUNS = "runs"', 'STRUCTURE = yaml.safe_load(Path("structure.yaml").read_text())  # ' + base.system + ', written by the Matter block', 'ELEMENTS = sorted({e for p in STRUCTURE["positions"] for e in p})', '', '');
    L.push('def blueprint():', '    """The settings of the workshop blueprint this study starts from."""', '    inp = Inputfile()');
    for (const l of base.lines) L.push('    ' + l);
    L.push('    return inp', '', '', 'def relaxed(name):', '    """Final geometry of a relaxation, as BigDFT wrote it."""', '    pos = yaml.safe_load(Path(RUNS, f"final_{name}.yaml").read_text())["positions"]', '    return {"units": "angstroem", "positions": [{e: v} for p in pos for e, v in p.items() if e != "force"]}', '', '',
      'def energy(name):', '    """Final energy of a run; None if it is not back yet or if BigDFT refused it."""', '    path = Path(RUNS, f"log-{name}.yaml")', '    if not path.exists():', '        return None', '    try:', '        log = Logfile(str(path))', '        return (log if len(log) == 0 else log[len(log) - 1]).energy  # a relaxation logs every step: keep the last', '    except Exception:', '        return None', '', '');
    L.push('def inputs():', '    """One entry per run: its input and, if any, the relaxation its geometry comes from."""', '    runs = {}');
    for (const b of order) {
      const sw = b.sweep && SWEEPS[b.sweep.key], at = geometryOf(b), geo = at ? ', geometry="' + at + '"' : '';
      L.push('', '    # ' + b.id + ': ' + b.title + (b.from ? (isRelax(get(b.from)) ? ', at the relaxed geometry of ' : ', same structure as ') + b.from : '') + (sw ? ', varied over ' + sw.label.toLowerCase() : ''));
      const ind = sw ? '        ' : '    ';
      if (sw) L.push('    for ' + sw.loop + ' in (' + b.sweep.values.map((x) => (b.sweep.key === 'rmult' ? '(' + x.join(', ') + ')' : b.sweep.key === 'xc' ? '"' + x + '"' : x.toFixed(2))).join(', ') + '):');
      L.push(ind + 'inp = blueprint()');
      for (const c of b.changes) L.push(ind + c);
      if (sw) L.push(ind + sw.call(sw.loop));
      L.push(ind + 'runs[' + (sw ? '"' + b.id + '" + ' + SUFFIX[b.sweep.key] : '"' + b.id + '"') + '] = dict(input=inp' + geo + ')');
    }
    L.push('    return runs', '', '');
    L.push('def prepare():', '    code = SystemCalculator(omp="1", dry_run=True, verbose=False)', '    ready, waiting, refused = [], [], []', '    for name, r in inputs().items():',
      '        if energy(name) is not None:', '            continue  # already computed',
      '        if r.get("geometry") and not Path(RUNS, f"final_{r[\'geometry\']}.yaml").exists():', '            waiting.append(name)  # its relaxation is not back yet', '            continue',
      '        posinp = relaxed(r["geometry"]) if r.get("geometry") else STRUCTURE',
      '        log = code.run(name=name, input=r["input"], posinp=posinp, run_dir=RUNS)  # writes runs/NAME.yaml, no SCF',
      '        memory = log.log.get("Estimated Memory Peak (MB)")', '        if memory is None:  # BigDFT refused the input: its reason is in runs/log-NAME.yaml',
      '            refused.append(name)', '            continue',
      '        print(f"{name}: dry run passed, memory peak {memory} MB")', '        ready.append(name)',
      '    print("ready for the HAPS:", ready)', '    print("waiting for a relaxation:", waiting)', '    print("refused by the dry run:", refused)', '    return 1 if refused else 0', '', '');
    L.push('def analyse():', '    E = {name: energy(name) for name in inputs()}', '    E = {name: e for name, e in E.items() if e is not None}', '    out = {}');
    for (const f of formulas) {
      const A = get(f.a), B = get(f.b), u = UNITS[f.unit];
      if (A.sweep || B.sweep) {
        const sr = A.sweep ? A : B;
        L.push('    for key in [n.split("_", 1)[1] for n in E if n.startswith("' + sr.id + '_")]:  # ' + f.id + ': one value per member of the series',
          '        a, b = ' + (A.sweep ? 'f"' + A.id + '_{key}"' : '"' + A.id + '"') + ', ' + (B.sweep ? 'f"' + B.id + '_{key}"' : '"' + B.id + '"'),
          '        if a in E and b in E:', '            out[f"' + f.id + '_{key}"] = (E[a] - E[b]) * ' + u[0] + '  # ' + f.title + ', ' + u[1]);
      } else L.push('    if "' + f.a + '" in E and "' + f.b + '" in E:', '        out["' + f.id + '"] = (E["' + f.a + '"] - E["' + f.b + '"]) * ' + u[0] + '  # ' + f.title + ', ' + u[1]);
    }
    L.push('    print(yaml.safe_dump({"energies_Ha": E, "results": out}, sort_keys=False))', '    return 0', '', '',
      'if __name__ == "__main__":', '    sys.exit({"prepare": prepare, "analyse": analyse}[sys.argv[1] if len(sys.argv) > 1 else "prepare"]())');
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
    const { h, $ } = ctx, bad = problems(), b = get(sel) || blocks[0], base = origin();
    OND.studyView.drawBoard($('#mine-board'), layout(), edges(), b.id, (id) => { sel = id; render(); }, statusOf(bad));
    // what next?
    const kids = [h('p', { class: 'label' }, 'Block ' + b.id), h('label', { class: 'field' }, h('span', { class: 'label' }, 'Name'), h('input', { id: 'mine-name', type: 'text', value: b.title, maxlength: 40, onchange: (e) => { b.title = e.target.value.trim() || b.title; render(); } }))];
    if (b.kind === 'formula') {
      kids.push(h('p', {}, 'Energy of ' + b.a + ' minus energy of ' + b.b + '.'), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Unit'), h('div', { class: 'seg' }, Object.keys(UNITS).map((u) => h('button', { type: 'button', 'aria-pressed': String(b.unit === u), onclick: () => { b.unit = u; render(); } }, u)))));
    } else {
      kids.push(h('p', {}, !b.from ? (base.example ? 'Uses the blueprint of the example: ' : 'Uses the blueprint of the workshop: ') + base.system + '.' : isRelax(get(b.from)) ? 'Takes the relaxed ' + b.takes.join(' and the ') + ' of ' + b.from + '.' : b.takes.includes('wavefunctions') ? 'Same structure as ' + b.from + ', and restarts from its wavefunctions.' : 'Same structure as ' + b.from + '.'),
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
    $('#mine-next').replaceChildren(...kids.filter(Boolean));
    // script and plan
    $('#mine-code').innerHTML = script().map(colour).join('\n');
    const runs = blocks.filter((x) => x.kind !== 'formula'), n = runs.reduce((k, x) => k + members(x), 0), waves = Math.max(...runs.map(wave)), nf = blocks.length - runs.length, done = ran();
    $('#mine-origin').textContent = base.example ? 'Example study · ' + base.system.toLowerCase() + ' · run with BigDFT 1.9.1' + (done ? '' : ' · changed since') : 'Your study · starts from the blueprint of the workshop: ' + base.system;
    $('#mine-plan').replaceChildren(...[
      h('ol', { class: 'pipe plain' },
        h('li', {}, h('b', {}, 'Prepare'), h('span', {}, n + ' input' + (n > 1 ? 's' : '') + ' written with PyBigDFT from the blueprint and the changes of each block, in the container of the pack. BigDFT itself cannot be started there.')),
        h('li', {}, h('b', {}, 'Dry run'), h('span', {}, 'BigDFT reads each input and estimates its memory, without computing. An input it refuses is never sent.')),
        h('li', {}, h('b', {}, 'Compute'), h('span', {}, 'On the HAPS, which receives input files only and runs one command on each, ', h('code', {}, 'bigdft -n NAME'), ': two at a time, one hour at most per run.' + (waves > 1 ? ' ' + waves + ' waves: a relaxation must come back before what continues from it is prepared.' : '') + (base.cost ? ' One blueprint run is estimated at ' + base.cost + '.' : ''))),
        h('li', {}, h('b', {}, 'Analyse'), h('span', {}, 'Back in the container: ' + nf + ' formula' + (nf === 1 ? '' : 's') + ' applied to the energies read from the logs, figures drawn from the kind of each block.'))),
      bad.length ? h('div', { class: 'notice err' }, h('b', {}, 'The study cannot start'), h('span', {}, bad.map((p) => p[1]).join(' '))) : h('p', { style: 'color:var(--ok);font-size:13px' }, 'The study is consistent: ' + blocks.length + ' blocks, ' + n + ' run' + (n > 1 ? 's' : '') + '.'),
      done ? h('p', { class: 'figmeta' }, 'This board has been run as it stands, twice. What it gave is below.')
        : h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('button', { class: 'btn', type: 'button', disabled: true }, 'Dry run the study'), h('button', { class: 'btn cta', type: 'button', disabled: true }, 'Run the study')),
      done ? null : h('p', { class: 'figmeta' }, 'Not executed in this mock-up. Saved as a capsule, the study carries this script, its inputs, its logs and the decisions taken on the way.')].filter(Boolean));
    results();
  }

  // --- the example, as it was run ---------------------------------------------------
  const HS = [0.5, 0.45, 0.4], hk = (x) => 'h' + String(Math.round(x * 100)).padStart(3, '0');
  const fx = (v, n) => Number(v).toFixed(n).replace('-', '−');
  const sci = (v) => { const [m, e] = Number(v).toExponential(1).split('e'); return m + '×10' + String(+e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]); };
  const CRIT = ['Default criterion, 10⁻⁴', 'Criterion 10⁻⁵'];
  const fig = {};

  function gapFigure() {
    const A = EX().attempts, gaps = (a) => HS.map((x) => a.gaps[hk(x)]), homo = (a) => HS.map((x) => a.runs['B_' + hk(x)].homo[0]);
    const span = (v) => Math.max(...v) - Math.min(...v);
    const axis = { label: 'Grid spacing h (bohr)', ticks: HS.slice().reverse(), fmt: (v) => v.toFixed(2), min: 0.385, max: 0.515 };
    const series = (f) => A.map((a, i) => ({ name: CRIT[i], slot: i, marker: true, pts: HS.map((x, k) => [x, f(a)[k]]).reverse() }));
    return {
      title: 'The same board, two criteria: only one series can be read',
      caption: 'Triplet energy of water, E(B) − E(A), on three grids. With the default self-consistency criterion the three values span ' + fx(span(gaps(A[0])), 2) + ' eV, and the highest occupied spin-up level of the triplet run moves by ' + fx(span(homo(A[0])), 2) + ' eV from one grid to the next: the runs did not stop on the same electronic state, although BigDFT reports each of them converged. With a criterion of 10⁻⁵ the values span ' + fx(span(gaps(A[1])) * 1000, 0) + ' meV and the two finest grids agree within ' + fx(Math.abs(A[1].gaps.h045 - A[1].gaps.h040) * 1000, 1) + ' meV.',
      panels: [
        { title: 'Triplet energy', x: axis, y: { label: 'E(B) − E(A) (eV)', fmt: (v) => v.toFixed(1), tip: (v) => v.toFixed(4) + ' eV' }, series: series(gaps) },
        { title: 'Highest occupied level of the triplet, spin up', x: axis, y: { label: 'eV', fmt: (v) => v.toFixed(1).replace('-', '−'), tip: (v) => v.toFixed(3) + ' eV' }, series: series(homo) },
      ],
      table: { head: ['Criterion', 'h (bohr)', 'E(A) (Ha)', 'E(B) (Ha)', 'Triplet energy (eV)', 'Highest occupied ↑ of B (eV)', 'SCF iterations of B'], rows: A.flatMap((a, i) => HS.map((x) => [i ? '10⁻⁵' : '10⁻⁴', x.toFixed(2), a.runs['A_' + hk(x)].energy.toFixed(6), a.runs['B_' + hk(x)].energy.toFixed(6), a.gaps[hk(x)].toFixed(4), a.runs['B_' + hk(x)].homo[0].toFixed(3), a.runs['B_' + hk(x)].iters])) },
      view: { view: 'series', x: 'dft.hgrids', group: 'attempt', panels: [{ y: { combine: 'a - b', a: 'energy of block:B', b: 'energy of block:A' }, unit: 'eV' }, { y: 'highest occupied orbital, spin up, of block:B', unit: 'eV' }] },
    };
  }

  function relaxFigure(a) {
    const r = a.relax.D, e0 = r.steps[0][0], step = { label: 'Force evaluation', min: 0, fmt: (v) => String(Math.round(v)) };
    return {
      title: 'Relaxation D, as BigDFT logged it',
      caption: 'SQNM relaxation of water from the geometry of the blueprint: ' + r.evaluations + ' force evaluations, energy lowered by ' + fx((e0 - r.energy) * 27211.386, 1) + ' meV. BigDFT reports convergence after ' + r.iterations + ' SQNM iterations; the last force it printed is ' + sci(r.fmax) + ' Ha/bohr, for ' + sci(r.forcemax) + ' asked.',
      panels: [
        { title: 'Energy', x: step, y: { label: 'E − E(start) (meV)', fmt: (v) => v.toFixed(0).replace('-', '−'), tip: (v) => v.toFixed(2) + ' meV' }, series: [{ name: 'Energy', slot: 0, marker: true, pts: r.steps.map((q, i) => [i, (q[0] - e0) * 27211.386]) }] },
        { title: 'Largest force on an atom', x: step, y: { label: 'Ha/bohr', log: true }, series: [{ name: 'Largest force', slot: 1, marker: true, pts: r.steps.map((q, i) => [i, q[1]]) }], hlines: [{ y: r.forcemax, label: 'asked' }] },
      ],
      table: { head: ['Force evaluation', 'Energy (Ha)', 'Largest force (Ha/bohr)'], rows: r.steps.map((q, i) => [i, q[0].toFixed(7), q[1].toExponential(3)]) },
      view: { view: 'trace', runs: 'block:D', x: 'force evaluation', panels: [{ y: 'energy', relative_to: 'first', unit: 'meV' }, { y: 'largest force', scale: 'log', reference: 'geopt.forcemax' }] },
    };
  }

  /* What the workshop says about a finished study: read from the logs, compared across the series. */
  function findings(a) {
    const out = [], g = HS.map((x) => a.gaps[hk(x)]), lev = HS.map((x) => a.runs['B_' + hk(x)].homo[0]), r = a.relax.D, list = (v, n) => v.map((x) => fx(x, n)).join(', ');
    if (Math.max(...lev) - Math.min(...lev) > 0.5) out.push(['warn', 'The series C cannot be read as it is', 'Its values are ' + list(g, 2) + ' eV for h = 0.50, 0.45 and 0.40 bohr. The highest occupied spin-up level of the triplet runs sits at ' + list(lev, 2) + ' eV: they did not stop on the same electronic state. BigDFT reported every run converged, to its criterion of ' + sci(a.runs.B_h050.gnrm_cv) + '. No single log shows the problem; the comparison does.', ['See the second attempt', 1]]);
    else out.push(['ok', 'The series C is consistent', 'The triplet runs are on the same electronic state (highest occupied spin-up level at ' + list(lev, 2) + ' eV). The triplet energy is ' + fx(g[2], 3) + ' eV on the finest grid and moves by ' + fx(Math.abs(g[1] - g[2]) * 1000, 1) + ' meV between h = 0.45 and 0.40 bohr. The coarsest grid took ' + a.runs.B_h050.iters + ' iterations to get there, for ' + EX().attempts[0].runs.B_h050.iters + ' when it stopped early in the first attempt.']);
    if (r.fmax > r.forcemax) out.push(['warn', 'Relaxation D: look at the last force', 'BigDFT reports the relaxation converged, after ' + r.evaluations + ' force evaluations. The last force it printed is ' + sci(r.fmax) + ' Ha/bohr, above the ' + sci(r.forcemax) + ' asked: read the trace below before using this geometry for forces or vibrations.']);
    else out.push(['ok', 'Relaxation D converged', r.evaluations + ' force evaluations, largest force ' + sci(r.fmax) + ' Ha/bohr for ' + sci(r.forcemax) + ' asked.']);
    out.push(['advice', 'E was refused once, before anything was computed', 'The first dry run of the PBE0 block answered: “' + EX().refused + '”. BigDFT registers no pseudopotential for a hybrid functional, so nothing was sent to compute. The block now names the PBE pseudopotentials; BigDFT accepts the input and writes in the log: “' + a.runs.E.warnings[0] + '”.']);
    return out;
  }

  function results() {
    const { h, $ } = ctx, host = $('#mine-results');
    $('#mine-ran').hidden = mode !== 'example';
    if (mode !== 'example') return;
    if (!ran()) {
      host.replaceChildren(h('div', { class: 'notice' }, h('b', {}, 'You changed the example'), h('span', {}, 'The results belong to the board as it was run. Your version has not been computed.'),
        h('div', { class: 'notice-actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => { example(); render(); } }, 'Back to the board that was run'))));
      return;
    }
    const a = EX().attempts[attempt], order = blocks.filter((b) => b.kind !== 'formula').flatMap((b) => (b.sweep ? b.sweep.values.map((x) => b.id + '_' + hk(x)) : [b.id]));
    const total = order.reduce((s, k) => s + a.runs[k].wall, 0);
    const row = (k) => { const r = a.runs[k]; return h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, 'exit 0'), h('td', { class: 'num' }, r.evaluations ? r.evaluations + ' × SCF' : String(r.iters)), h('td', { class: 'num' }, r.energy.toFixed(6).replace('-', '−')), h('td', { class: 'num' }, fx(r.wall, 1)), h('td', { class: 'num' }, String(r.mem)), h('td', {}, r.warnings.length ? r.warnings.join(' · ') : '—')); };
    host.replaceChildren(
      h('p', { class: 'lede' }, 'The script above wrote the eight inputs and dry-ran them. Each was then computed with ', h('code', {}, 'bigdft -n NAME'), ', the one command a HAPS runs, in the image the pack pins. The HAPS service itself was not in the loop. Every number below is read from those logs.'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Which attempt' }, EX().attempts.map((x, i) => h('button', { type: 'button', 'aria-pressed': String(i === attempt), onclick: () => { attempt = i; render(); } }, x.label))),
      h('p', { class: 'figmeta' }, attempt ? 'One line of the blueprint differs from the first attempt: ' : 'The blueprint leaves the self-consistency criterion at its default. ', attempt ? h('code', {}, a.base[a.base.length - 1]) : null),
      ...findings(a).map(([level, title, text, go]) => h('div', { class: 'notice ' + level }, h('b', {}, title), h('span', {}, text), go ? h('div', { class: 'notice-actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => { attempt = go[1]; render(); } }, go[0])) : null)),
      OND.studyView.figureCard('mine-gap', gapFigure(), 'C · formula over two series', render),
      OND.studyView.figureCard('mine-relax-' + attempt, relaxFigure(a), 'D · relaxation', render),
      h('div', { class: 'tile' }, h('p', { class: 'label' }, 'Runs of this attempt'),
        h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Run', 'BigDFT', 'SCF iterations', 'Energy (Ha)', 'Wall time (s)', 'Memory peak (MB)', 'Warnings in the log'].map((c) => h('th', {}, c)))), h('tbody', {}, order.map(row)))),
        h('p', { class: 'figmeta' }, order.length + ' runs, ' + fx(total, 0) + ' s in all on 4 threads. Image ', h('code', {}, EX().image.slice(0, 37) + '…'), ', BigDFT ' + a.runs.A_h040.version + '. Inputs, logs and script: ', h('code', {}, 'examples/water-study/' + a.id), ' in the repository.')));
  }

  OND.builder = {
    mount(context) { ctx = context; example(); },
    render() { if (ctx) render(); },
    reset() { blocks = [{ id: 'A', kind: 'run', title: 'Ground state', changes: [] }]; sel = 'A'; mode = 'own'; render(); },
    example() { example(); render(); },
    script: () => script().join('\n'),
    ran,
  };
})(window.OND);
