/* The study: one structure, and steps added one after the other.
 *
 * A calculation step holds only what it changes; everything else it inherits
 * from the step it continues. A decision applies to every step after it. So a
 * study is a growing thing, not a set of independent calculations: change the
 * first step and what follows changes with it.
 *
 * Nothing here draws anything. The interface (app.js) reads this model. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  const HA = { eV: 27.211386245988, 'kJ/mol': 2625.4996394799, Ha: 1 };
  const RELAX_KEYS = ['action', 'geoptMethod', 'geoptSteps', 'forcemax', 'biomode'];
  const CALC = ['calculation', 'relax'], SERIES = ['converge', 'vary'];
  const scratch = OND.Blueprint(), P = scratch.PARAMS;
  const LIB = OND.library.runs;
  const REG = Object.fromEntries(OND.steps.map((s) => [s.name, s]));
  const J = JSON.stringify;

  const study = { name: 'Untitled study', sysId: 'h2o', sys: null, steps: [], computed: new Set(), log: [], rev: 0, seq: 0 };
  /* Computing for real (backend/serve.py): the results BigDFT gave in this session, by the identity of their calculation,
     and what is known of the runs on their way. Off, the page shows the recorded library. `dir` is where the server keeps
     the runs of this study: results belong to it, so it is fixed at the first wave and forgotten with the study. */
  const live = { on: false, dir: null, runs: {}, state: {} };
  let cache = {};
  const touch = () => { study.rev++; cache = {}; };
  const memo = (key, fn) => (key in cache ? cache[key] : (cache[key] = fn()));

  const byId = (id) => study.steps.find((s) => s.id === id) || null;
  const at = (step) => study.steps.indexOf(step);
  const isCalc = (s) => !!s && CALC.includes(s.kind);
  const isSeries = (s) => !!s && SERIES.includes(s.kind);

  // --- naming: a step's name is the name of its run -----------------------------------
  /* 30 characters at most: BigDFT truncates the name of a longer run, and its log is then not found. */
  const LONGEST = 30;
  const slug = (text) => String(text).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, LONGEST - 2).replace(/_+$/, '') || 'step';
  function nameOf(step) {
    const mine = slug(step.title).toLowerCase(), same = study.steps.filter((s) => slug(s.title).toLowerCase() === mine);
    return same.length > 1 ? mine + '_' + (same.indexOf(step) + 1) : mine;
  }
  const tag = (value) => String(value).replace(/[^A-Za-z0-9]+/g, 'p').replace(/^p+|p+$/g, '');
  const memberName = (conv, base, value) => { const suffix = '-' + (conv.params.argument || conv.params.action.replace(/^set_/, '')).slice(0, 6) + tag(value); return nameOf(base).slice(0, LONGEST - suffix.length).replace(/[_-]+$/, '') + suffix; };

  // --- which setting a series varies -----------------------------------------------------
  /* The registry names an input action and, when it has several, one of its arguments (set_rmult, coarse);
     the settings model has a key for what that writes (crmult). */
  function settingOf(action, argument) {
    const def = OND.actions.list.find((a) => a.name === action);
    const param = def && (argument ? def.params.find((p) => p.name === argument) : def.params[0]);
    const key = param && def.maps[param.name] && def.maps[param.name].keys[0];
    if (!key || !['value', 'element'].includes(key.as)) return null;
    const keys = Object.keys(P).filter((k) => P[k][1] === key.path);
    return key.as === 'element' ? keys[key.index] || null : keys.length === 1 ? keys[0] : null;
  }
  const settingVaried = (series) => settingOf(series.params.action, series.params.argument);
  /* Every setting a series can vary: an argument of an input action that writes one setting of the model. */
  const VARIABLE = OND.actions.list.filter((a) => a.writes !== null && a.method).flatMap((a) => a.params.map((p, i) => ({ action: a.name, argument: i === 0 ? null : p.name, key: settingOf(a.name, i === 0 ? null : p.name), kind: p.kind })))
    .filter((x) => x.key && ['number', 'text'].includes(x.kind)).filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i);

  // --- resolving a step: what it inherits, what it adds, what was decided before it ------
  function ownOf(step) {
    if (step.kind !== 'relax') return step.own;
    return Object.assign({}, step.own, { v: Object.assign({}, step.own.v, { action: 'geopt', geoptMethod: step.params.method, geoptSteps: step.params.nsteps, forcemax: step.params.forcemax }) });
  }
  function chain(step) { const out = []; for (let s = step; s; s = byId(s.links.after)) out.unshift(s); return out; }
  /* The structure a step is computed on: the one it names (`on`), or the one named by the nearest step it
     continues, or the system of the study. A structure step is its own. */
  const structureOf = (s) => (s && s.links.on && byId(s.links.on) ? byId(s.links.on).sys : null);
  function sysOf(step) {
    if (!step) return study.sys;
    if (step.kind === 'structure') return step.sys;
    for (let s = step; s; s = byId(s.links.after)) if (structureOf(s)) return structureOf(s);
    return study.sys;
  }
  /* Settings that belong to a system and not to a way of computing: they are advised again on another structure. */
  const OF_THE_SYSTEM = ['nspin', 'mpol', 'kpt', 'algo', 'solvent', 'dispersion', 'target', 'mpi'];
  function decisionsBefore(step) {
    const i = at(step);
    return study.steps.filter((s, n) => s.kind === 'choose' && n < i).map((s) => ({ step: s, key: settingVaried(byId(s.links.among)), value: retained(s) }));
  }
  /* Load into a settings model `b` the settings of `step`. own: false stops before the step's own changes. */
  function resolveInto(b, step, opt) {
    opt = opt || {};
    const steps = chain(step);
    let sys = structureOf(steps[0]) || study.sys;
    b.clear(); b.setSystem(sys);
    steps.forEach((s, n) => {
      const last = n === steps.length - 1;
      if (last && opt.own === false) return;
      if (n && structureOf(s) && structureOf(s) !== sys) {
        /* the same calculation on another structure: what was advised for the first one (its grid, its extents) is
           kept, as an energy difference between the two needs; only what belongs to a system is advised again */
        const kept = Object.keys(b.st.src).filter((k) => b.st.src[k] === 'adapted' && !OF_THE_SYSTEM.includes(k)).map((k) => [k, b.st.v[k]]);
        sys = structureOf(s); b.setSystem(sys);
        for (const [k, v] of kept) b.set(k, v, 'inherited');
      }
      const own = ownOf(s), src = last ? 'you' : 'inherited';
      for (const k in own.v) if (last || !(s.kind === 'relax' && RELAX_KEYS.includes(k))) b.set(k, own.v[k], src);
      for (const p in own.expert) b.setExpert(p, own.expert[p]);
      for (const a of own.actions) b.applyAction(a.name, a.args);
    });
    if (opt.decisions !== false) for (const d of decisionsBefore(step)) if (d.key && d.value != null) b.set(d.key, d.value, 'decision');
    if (opt.override) b.set(opt.override[0], opt.override[1], 'decision');
    // wavefunctions travel between two steps: the one that reads them, and only it, starts from them; the one read writes them
    if (byId(step.links.wavefunctions)) b.applyAction('read_orbitals_from_disk', {});
    if (study.steps.some((s) => s.links.wavefunctions === step.id)) b.applyAction('write_orbitals_on_disk', {});
    return b;
  }
  /* Charge and spin of a step: what the wavefunctions of another step must share to be read. */
  const electronsOf = (step) => memo('el:' + step.id, () => { const v = resolveInto(scratch, step).st.v; return [v.charge, v.nspin, v.nspin === 1 ? 0 : v.mpol].join(); });
  /* The settings a calculation is run with, once everything it inherits and every decision before it is applied. */
  const valuesOf = (step) => memo('v:' + step.id, () => Object.assign({}, resolveInto(scratch, step).st.v));
  function cannotRead(step) {
    const from = byId(step.links.wavefunctions);
    if (!from) return null;
    const mine = electronsOf(step).split(','), theirs = electronsOf(from).split(',');
    const what = sysOf(step) !== sysOf(from) ? 'structure' : mine[0] !== theirs[0] ? 'charge' : mine[1] !== theirs[1] ? 'spin treatment' : mine[2] !== theirs[2] ? 'number of unpaired electrons' : null;
    return what ? 'the wavefunctions of “' + from.title + '” are for another ' + what : null;
  }
  const undecided = (step) => decisionsBefore(step).some((d) => d.value == null);
  /* The relaxation whose final geometry a step starts from. A step computed on another structure starts from
     that structure as it was given: what was relaxed before it is another system. */
  function geometryFrom(step) {
    if (structureOf(step)) return null;
    for (const s of chain(step).slice(0, -1).reverse()) { if (s.kind === 'relax') return s; if (structureOf(s)) return null; }
    return null;
  }
  /* Which earlier step set a key this step inherits. */
  function ownerOf(step, key) { return chain(step).slice(0, -1).reverse().find((s) => key in ownOf(s).v) || null; }

  // --- the identity of a calculation: what BigDFT is asked, defaults removed, and the geometry it starts from.
  //     The same function as identity() in tools/build_library.py: keep them the same. --------------------------
  const canon = (x) => (typeof x === 'boolean' ? String(x) : typeof x === 'number' ? x.toExponential(9).replace('e+', 'e')
    : Array.isArray(x) ? ((i) => (i.length === 3 && new Set(i).size === 1 ? i[0] : '[' + i.join(',') + ']'))(x.map(canon)) : String(x));
  const DEFAULT = Object.fromEntries(OND.schema.variables.map((v) => [v.p, canon(v.d)]));
  const IGNORED = ['posinp', 'psppar', 'radical', 'output.orbitals'];
  function flat(b) {
    const inp = b.input(), out = {};
    for (const profile of inp.imports) out['import.' + profile] = true;
    for (const sec in inp.sections) for (const [key, value] of inp.sections[sec]) {
      const path = sec ? sec + '.' + key : key;
      if (!IGNORED.some((p) => path.startsWith(p))) out[path] = value;
    }
    return out;
  }
  const fnv = (text) => { let x = 0x811c9dc5; for (const byte of new TextEncoder().encode(text)) { x ^= byte; x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
  function identity(b, geometry) {
    const f = flat(b), kept = Object.keys(f).map((p) => [p, canon(f[p])]).filter(([p, v]) => DEFAULT[p] !== v).map(([p, v]) => p + '=' + v).sort();
    return b.st.sys.id + '|' + kept.join(';') + '|geo=' + geometry;
  }
  function keyOf(step, override) {
    return memo('key:' + step.id + ':' + J(override || 0), () => {
      const from = geometryFrom(step), orbitals = byId(step.links.wavefunctions);
      return identity(resolveInto(scratch, step, { override }), from ? '@' + fnv(keyOf(from)) : 'start') + (orbitals ? '|wf=@' + fnv(keyOf(orbitals)) : '');
    });
  }

  // --- runs, statuses ------------------------------------------------------------------------
  /* One BigDFT run of a step: its identity, its recorded result if the library holds it, whether it was computed here. */
  function runOf(step, override, name) {
    const key = keyOf(step, override), run = (live.on ? live.runs : LIB)[key] || null, said = (live.on && !run && live.state[key]) || null;
    return { key, run, done: !!run && (live.on || study.computed.has(key)), name: name || nameOf(step),
      busy: said && BUSY.includes(said.state) ? said : null, problem: said && !BUSY.includes(said.state) ? said : null };
  }
  const BUSY = ['checking', 'sent', 'running'];
  /* What the server says of a run on its way, or that it could not be computed; null forgets it. */
  function mark(keys, said) { for (const k of keys) { if (said) live.state[k] = said; else delete live.state[k]; } touch(); }
  function receive(key, run) { live.runs[key] = run; delete live.state[key]; touch(); }
  function setLive(on) { live.on = !!on; touch(); }
  const runsOf = (step) => (isCalc(step) ? [runOf(step)] : isSeries(step) ? members(step).flatMap((m) => [m.of, m.rel].filter(Boolean)) : []);
  function members(conv) {
    const key = settingVaried(conv), of = byId(conv.links.of), rel = byId(conv.links.relative_to);
    return conv.params.values.map((value) => ({ value, of: runOf(of, [key, value], memberName(conv, of, value)), rel: rel ? runOf(rel, [key, value], memberName(conv, rel, value)) : null }));
  }
  function series(conv) {
    return memo('series:' + conv.id, () => {
      const rows = members(conv), natoms = sysOf(byId(conv.links.of)).atoms.length, rel = !!conv.links.relative_to;
      for (const r of rows) {
        const ok = r.of.done && (!rel || r.rel.done);
        r.quantity = !ok ? null : rel ? (r.of.run.energy - r.rel.run.energy) * HA.eV : r.of.run.energy * HA.eV / (conv.params.per_atom ? natoms : 1);
        r.seconds = (r.of.run ? r.of.run.wall : 0) + (r.rel && r.rel.run ? r.rel.run.wall : 0);
      }
      const complete = rows.length > 0 && rows.every((r) => r.quantity != null);
      if (conv.kind === 'vary') {                                                                    // side by side: no reference, nothing proposed
        const t = byId(conv.links.against);
        for (const r of rows) r.agrees = t && r.quantity != null ? Math.abs(r.quantity - t.params.value) <= t.params.within : null;
        return { rows, complete, proposed: null, relative: rel, target: t ? t.params : null };
      }
      const ref = complete ? rows[rows.length - 1].quantity : null;
      for (const r of rows) r.away = complete ? Math.abs(r.quantity - ref) : null;
      const first = complete ? rows.slice(0, -1).find((r) => r.away <= conv.params.within) : null;   // the reference agreeing with itself proves nothing
      return { rows, complete, proposed: first ? first.value : null, relative: rel };
    });
  }
  function retained(choose) { return choose.params.retained != null ? choose.params.retained : series(byId(choose.links.among)).proposed; }

  /* done: computed | ready: can be computed now | blocked: waits for something | absent: not among the recorded results | given
     and, computing for real: running: sent, not back yet | failed: refused by BigDFT's dry run, or not computed */
  function status(step) {
    return memo('status:' + step.id, () => {
      const blockedBy = (s) => { if (undecided(s)) return 'the decision'; const g = geometryFrom(s), w = byId(s.links.wavefunctions), late = [g, w].find((x) => x && status(x).state !== 'done'); return late ? '“' + late.title + '”' : null; };
      if (isCalc(step)) {
        const wait = blockedBy(step);
        if (wait) return { state: 'blocked', text: 'waits for ' + wait };
        const refused = cannotRead(step);
        if (refused) return { state: 'refused', text: refused };
        const r = runOf(step);
        if (live.on) return r.done ? { state: 'done', text: 'computed' } : r.problem ? { state: 'failed', text: r.problem.text } : r.busy ? { state: 'running', text: r.busy.text } : { state: 'ready', text: 'ready to compute' };
        return r.done ? { state: 'done', text: 'computed' } : r.run ? { state: 'ready', text: 'ready to compute' } : { state: 'absent', text: 'not among the recorded results' };
      }
      if (isSeries(step)) {
        const bases = [byId(step.links.of), byId(step.links.relative_to)].filter(Boolean), wait = bases.map(blockedBy).find(Boolean);
        if (wait) return { state: 'blocked', text: 'waits for ' + wait };
        const runs = members(step).flatMap((m) => [m.of, m.rel].filter(Boolean)), done = runs.filter((r) => r.done).length;
        if (done === runs.length) return { state: 'done', text: runs.length + ' runs computed' };
        if (live.on) {
          const bad = runs.filter((r) => r.problem), busy = runs.filter((r) => r.busy).length;
          if (bad.length) return { state: 'failed', text: bad.length + ' of ' + runs.length + ' runs not computed. ' + bad[0].name + ': ' + bad[0].problem.text };
          return busy ? { state: 'running', text: done + ' of ' + runs.length + ' computed' } : { state: 'ready', text: done ? done + ' of ' + runs.length + ' computed' : runs.length + ' runs ready' };
        }
        if (runs.some((r) => !r.run)) return { state: 'absent', text: runs.filter((r) => !r.run).length + ' of ' + runs.length + ' runs not among the recorded results' };
        return { state: 'ready', text: done ? done + ' of ' + runs.length + ' computed' : runs.length + ' runs ready' };
      }
      if (step.kind === 'choose') return !series(byId(step.links.among)).complete ? { state: 'blocked', text: 'waits for the series' } : retained(step) != null ? { state: 'done', text: 'decided' }
        : { state: 'absent', text: byId(step.links.among).kind === 'vary' ? 'needs you: keep one of the values' : 'needs you: no value passes the criterion' };
      if (step.kind === 'levels') { const of = byId(step.links.of); return status(of).state === 'done' ? { state: 'done', text: 'read' } : { state: 'blocked', text: 'waits for “' + of.title + '”' }; }
      if (step.kind === 'difference' || step.kind === 'combination') {
        const missing = (step.kind === 'difference' ? [byId(step.links.a), byId(step.links.b)] : termsOf(step).map((t) => t.step)).filter((s) => status(s).state !== 'done');
        return missing.length ? { state: 'blocked', text: 'waits for ' + [...new Set(missing)].map((s) => '“' + s.title + '”').join(' and ') } : { state: 'done', text: 'computed' };
      }
      return { state: 'given', text: 'set' };
    });
  }
  const energy = (step) => { const r = runOf(step); return r.done ? r.run.energy : null; };
  /* The levels of a calculation, in eV: highest occupied, lowest empty and gap if empty states were computed. */
  function levels(step) {
    const r = runOf(byId(step.links.of));
    if (!r.done || !r.run.levels) return null;
    const occupied = r.run.levels, empty = r.run.empty || { up: [], down: [] }, all = occupied.up.concat(occupied.down);
    return { occupied, empty, homo: Math.max(...all), lumo: empty.up.concat(empty.down).length ? Math.min(...empty.up.concat(empty.down)) : null, gap: r.run.gap || null, polarised: occupied.down.length > 0 };
  }
  function difference(step) {
    const a = energy(byId(step.links.a)), b = energy(byId(step.links.b));
    if (a == null || b == null) return null;
    const value = (a - b) * HA[step.params.unit], t = byId(step.links.against);
    return { value, unit: step.params.unit, target: t ? t.params : null, agrees: t ? Math.abs(value - t.params.value) <= t.params.within : null };
  }

  /* A sum of energies with coefficients: an atomisation, a formation or a reaction energy. */
  const termsOf = (step) => step.params.coefficients.map((c, i) => ({ c, step: byId(step.links['term' + (i + 1)]) }));
  function setTerms(step, terms) {
    for (const role of Object.keys(step.links)) if (role.startsWith('term')) delete step.links[role];
    terms.forEach((t, i) => { step.links['term' + (i + 1)] = t.step.id; });
    step.params.coefficients = terms.map((t) => t.c); touch();
  }
  function combination(step) {
    const terms = termsOf(step);
    if (!terms.length || terms.some((t) => !t.step || energy(t.step) == null)) return null;
    const value = terms.reduce((sum, t) => sum + t.c * energy(t.step), 0) * HA[step.params.unit], t = byId(step.links.against);
    return { value, unit: step.params.unit, terms, target: t ? t.params : null, agrees: t ? Math.abs(value - t.params.value) <= t.params.within : null };
  }
  /* What an atomisation energy of a calculation sums: each atom of its structure, as many times as it holds it, minus
     itself. An atom counts when a calculation of the study is computed on that isolated atom. */
  const atomCalc = (el) => study.steps.find((s) => s.kind === 'calculation' && OND.structures.isAtom(sysOf(s), el)) || null;
  function atomisationTerms(of) {
    const count = OND.chem.composition(sysOf(of));
    return Object.keys(count).filter(atomCalc).map((el) => ({ c: count[el], step: atomCalc(el) })).concat([{ c: -1, step: of }]);
  }
  /* The atoms an atomisation energy of `of` still lacks: for each element, the isolated atom as a structure, and the
     same calculation as `of` on it. Every one is an ordinary step, placed before `before` when it is given. Returns
     what was added. */
  function addAtoms(of, before) {
    const added = [];
    for (const el of Object.keys(OND.chem.composition(sysOf(of)))) {
      if (atomCalc(el)) continue;
      let atom = study.steps.find((s) => s.kind === 'structure' && OND.structures.isAtom(s.sys, el));
      if (!atom) { atom = add('structure', null); setStructure(atom, OND.structures.atom(el)); added.push(atom); }
      const calc = add('calculation', atom.id); calc.links.after = of.id; calc.title = 'Energy of ' + el + ' atom'; added.push(calc);
    }
    if (before) {                                              // a step names only steps written before it: the script reads in order
      study.steps = study.steps.filter((s) => !added.includes(s));
      study.steps.splice(at(before), 0, ...added);
    }
    touch();
    return added;
  }

  // --- computing: what a wave would send, and what comes back ---------------------------------------
  /* The runs that can go now. In the mock-up a run "comes back" when the library holds its real result. */
  function readyRuns(only) {
    const out = new Map();
    for (const step of study.steps) {
      if (only && only !== step) continue;
      if (status(step).state !== 'ready') continue;
      for (const r of runsOf(step)) if ((live.on ? !r.done && !r.busy && !r.problem : r.run && !r.done) && !out.has(r.key)) out.set(r.key, r);
    }
    return [...out.values()];
  }
  function compute(only) {
    const waves = [];
    for (let n = 0; n < 12; n++) {
      const runs = readyRuns(only);
      if (!runs.length) break;
      for (const r of runs) study.computed.add(r.key);
      waves.push(runs.map((r) => ({ name: r.name, seconds: r.run.wall, relax: !!r.run.relax, restart: r.key.includes('|wf=') })));
      touch();
      if (only) break;
    }
    const absent = study.steps.filter((s) => (!only || only === s) && status(s).state === 'absent').map((s) => s.title);
    if (waves.length || absent.length) study.log.push({ waves, absent, only: only ? only.title : null });
    return { waves, absent };
  }

  // --- adding and removing steps ------------------------------------------------------------------
  const TITLES = { structure: 'Structure', combination: 'Combination', calculation: 'Calculation', relax: 'Relaxation', ionised: 'Cation', triplet: 'Triplet', hybrid: 'PBE0', empty_states: 'Empty states', converge: 'Convergence', vary: 'Functionals', choose: 'Decision', difference: 'Energy difference', levels: 'Energy levels', target: 'Target' };
  /* Values a series starts with, by the setting it varies. */
  const VALUES = { hgrid: [0.5, 0.45, 0.4, 0.35], crmult: [4, 5, 6, 7], frmult: [7, 8, 9, 10], gnrm: [1e-3, 1e-4, 1e-5, 1e-6], xc: ['LDA', 'PBE', 'PBE0'] };
  function vary(series, key) {
    const v = VARIABLE.find((x) => x.key === key);
    Object.assign(series.params, { action: v.action, argument: v.argument, values: (VALUES[key] || [scratch.st.v[key]]).slice() });
    touch();
  }
  /* Turn what a pre-filled step fills in (input actions and keys) into settings of the model. */
  function fillsToOwn(fills) {
    const own = { v: {}, expert: {}, actions: [] };
    for (const [name, argument] of Object.entries(fills.actions)) {
      const def = OND.actions.list.find((a) => a.name === name);
      const args = argument === true ? {} : argument && typeof argument === 'object' && !Array.isArray(argument) ? argument : { [def.params[0].name]: argument };
      const writes = scratch.actionWrites(name, args), keys = writes.map(([path]) => Object.keys(P).filter((k) => P[k][1] === path));
      if (writes.length && writes.every((w, i) => w[2] && keys[i].length === 1)) writes.forEach((w, i) => { own.v[keys[i][0]] = w[1]; });
      else own.actions.push({ name, args });
    }
    for (const [section, values] of Object.entries(fills.keys)) for (const [key, value] of Object.entries(values)) own.expert[section + '.' + key] = value;
    return own;
  }
  const lastOf = (test, before) => study.steps.slice(0, before == null ? undefined : before).reverse().find(test) || null;
  /* What a step of the registry needs to exist, given the study and the selected step. Null when it can be added. */
  function cannotAdd(fn, selected) {
    const need = REG[fn].params.filter((p) => p.link && p.required).map((p) => p.name);
    const calcs = study.steps.filter(isCalc);
    if (need.includes('after') && !calcs.length) return 'needs a calculation to continue';
    if (need.includes('of') && !study.steps.some((s) => (REG[fn].kind === 'levels' ? isCalc(s) : s.kind === 'calculation'))) return REG[fn].kind === 'levels' ? 'needs a calculation to read' : 'needs a calculation to vary';
    if (need.includes('among') && !study.steps.some(isSeries)) return 'needs a series';
    if (need.includes('a') && calcs.length < 2) return 'needs two calculations to compare';
    if (REG[fn].kind === 'combination' && !calcs.length) return 'needs a calculation to sum';
    return null;
  }
  function add(fn, selected) {
    const def = REG[fn], kind = def.kind, sel = byId(selected), links = {}, params = {};
    for (const p of def.params) if (!p.link && p.name !== 'keys') params[p.name] = Array.isArray(p.default) ? p.default.slice() : p.default;
    const calcSel = isCalc(sel) ? sel : lastOf(isCalc);
    if (CALC.includes(kind)) links.after = calcSel ? calcSel.id : null;
    if (fn === 'calculation' && sel && sel.kind === 'structure') {       // on a structure: the same calculation as the first of the study, there
      const first = study.steps.find(isCalc);
      links.on = sel.id; links.after = first ? first.id : null;
    }
    if (SERIES.includes(kind)) {
      const of = sel && sel.kind === 'calculation' ? sel : lastOf((s) => s.kind === 'calculation'), before = byId(of.links.after);
      links.of = of.id;
      if (before && before.kind === 'calculation') links.relative_to = before.id;       // a step that continues another: what matters is usually their difference
      if (kind === 'vary') { const t = lastOf((s) => s.kind === 'target'); if (t && links.relative_to) links.against = t.id; }
    }
    if (kind === 'choose') links.among = (isSeries(sel) ? sel : lastOf(isSeries)).id;
    if (kind === 'levels') links.of = calcSel.id;
    if (kind === 'difference') {
      const a = calcSel, b = (a && byId(a.links.after)) || lastOf((s) => isCalc(s) && s !== a), t = lastOf((s) => s.kind === 'target');
      links.a = a.id; links.b = b.id; if (t) links.against = t.id;
    }
    if (kind === 'target') { params.value = 0; params.within = 0.1; }
    if (kind === 'structure') { delete params.posinp; params.source = ''; }
    if (kind === 'combination') {
      delete params.terms; params.coefficients = [];
      const of = calcSel && sysOf(calcSel).atoms.length > 1 ? calcSel : lastOf((s) => isCalc(s) && sysOf(s).atoms.length > 1) || calcSel;
      atomisationTerms(of).forEach((term, i) => { links['term' + (i + 1)] = term.step.id; params.coefficients.push(term.c); });
    }
    const count = study.steps.filter((s) => s.fn === fn).length;
    const step = { id: 's' + (++study.seq), fn, kind, title: TITLES[fn] + (count ? ' ' + (count + 1) : ''), links, params,
      own: def.fills ? fillsToOwn(def.fills) : { v: {}, expert: {}, actions: [] } };
    if (def.fills) step.filled = J(step.own);
    if (kind === 'structure') {       // an atom the study does not hold yet, of its system first: what an atomisation energy starts with
      const els = Object.keys(OND.chem.composition(study.sys)).concat(OND.structures.known()), held = (el) => study.steps.some((s) => s.kind === 'structure' && OND.structures.isAtom(s.sys, el));
      step.sys = OND.structures.atom(els.find((el) => !held(el)) || els[0]); step.title = step.sys.name; step.params.source = step.sys.source;
    }
    if (fn === 'hybrid') step.own.v.xc = params.xc;
    if (fn === 'ionised') { step.own.v.charge = params.charge; step.own.v.mpol = params.unpaired; }
    for (const k of ['xc', 'charge', 'unpaired', 'number']) delete params[k];       // they are settings of the calculation now
    if (fn === 'converge') params.argument = null;
    study.steps.push(step); touch();
    return step;
  }
  const dependents = (step) => study.steps.filter((s) => Object.values(s.links).includes(step.id));
  function remove(step) { if (dependents(step).length) return false; study.steps = study.steps.filter((s) => s !== step); touch(); return true; }
  /* Give a structure to the study (no step), or to a structure step. Results belong to what they were computed on. */
  function setStructure(step, sys) {
    if (step) { if (step.title === step.sys.name) step.title = sys.name; step.sys = sys; step.params.source = sys.source || ''; touch(); return; }
    study.sysId = sys.id; study.sys = sys; scratch.setSystem(sys); study.computed.clear(); study.log = []; touch();
  }
  const setSystem = (id) => setStructure(null, OND.chem.build(id));
  function reset() { study.steps = []; study.computed.clear(); study.log = []; study.seq = 0; study.name = 'Untitled study'; Object.assign(live, { dir: null, runs: {}, state: {} }); touch(); }

  // --- the study as a script: one line per step, written with the registry of steps ------------------
  const changesOf = (step) => changes(step).map(([k, v]) => k + '=' + py(v));
  const py = (x) => (x === true ? 'True' : x === false ? 'False' : x == null ? 'None' : Array.isArray(x) ? '[' + x.map(py).join(', ') + ']'
    : typeof x === 'object' ? '{' + Object.entries(x).map(([k, v]) => J(k) + ': ' + py(v)).join(', ') + '}' : typeof x === 'string' ? J(x) : String(x));
  /* What a calculation step changes, said with input actions of PyBigDFT's registry wherever one writes exactly that. */
  function changes(step) {
    const mine = flat(resolveInto(scratch, step, { decisions: false })), parent = step.links.after ? flat(resolveInto(scratch, step, { own: false, decisions: false })) : {};
    const changed = {};
    for (const p in mine) if (canon(mine[p]) !== canon(parent[p] === undefined ? '\u0000' : parent[p]) && !(step.kind === 'relax' && p.startsWith('geopt.'))) changed[p] = mine[p];
    const kwargs = [];
    const candidates = OND.actions.list.filter((a) => a.writes !== null && a.method).map((a) => {
      const args = {};
      for (const p of a.params) for (const k of (a.maps[p.name] || { keys: [] }).keys) {
        if (!(k.path in changed)) continue;
        if (k.as === 'value') args[p.name] = changed[k.path];
        else if (k.as === 'element' && Array.isArray(changed[k.path])) args[p.name] = changed[k.path][k.index];
      }
      return { a, args, writes: scratch.actionWrites(a.name, args) };
    }).filter((c) => c.writes.length && c.writes.every(([p, v, known]) => known && p in changed && canon(v) === canon(changed[p])))
      .sort((x, y) => x.writes.length - y.writes.length);
    for (const c of candidates) {
      if (!c.writes.every(([p]) => p in changed)) continue;                          // an earlier action already said it
      const names = Object.keys(c.args);
      kwargs.push([c.a.name, names.length === 0 ? true : names.length === 1 && names[0] === c.a.params[0].name ? c.args[names[0]] : c.args]);
      for (const [p] of c.writes) delete changed[p];
    }
    const keys = {};
    for (const p in changed) { const cut = p.lastIndexOf('.'); if (cut > 0 && !p.startsWith('import.')) (keys[p.slice(0, cut)] = keys[p.slice(0, cut)] || {})[p.slice(cut + 1)] = changed[p]; }
    if (Object.keys(keys).length) kwargs.push(['keys', keys]);
    return kwargs;
  }
  /* The study as calls of the registry of steps, as data: one per step, with its positional and keyword arguments.
     { $step: name } is the step of that name, { $tuple: [...] } a tuple. The script and the plan sent to the server
     are two writings of this list, so the server computes what the script says. */
  const ref = (id) => ({ $step: nameOf(byId(id)) });
  function calls() {
    return study.steps.map((s) => {
      const L = s.links, args = [], kw = [];
      let fn = s.kind;
      if (s.kind === 'structure') { args.push(OND.structures.posinp(s.sys)); if (s.params.source) kw.push(['source', s.params.source]); }
      else if (s.kind === 'combination') {
        args.push(termsOf(s).map((t) => ({ $tuple: [t.c, ref(t.step.id)] }))); if (s.params.unit !== 'eV') kw.push(['unit', s.params.unit]); if (L.against) kw.push(['against', ref(L.against)]);
      } else if (isCalc(s)) {
        if (L.after) kw.push(['after', ref(L.after)]);
        if (structureOf(s)) kw.push(['on', ref(L.on)]);
        if (L.wavefunctions) kw.push(['wavefunctions', ref(L.wavefunctions)]);
        const preset = REG[s.fn].fills && s.filled === J(s.own);
        if (s.kind === 'relax') { const d = REG.relax.params; for (const p of ['method', 'nsteps', 'forcemax']) if (s.params[p] !== d.find((x) => x.name === p).default) kw.push([p, s.params[p]]); }
        if (preset) fn = s.fn; else kw.push(...changes(s));
      } else if (isSeries(s)) {
        kw.push(['of', ref(L.of)]); if (L.relative_to) kw.push(['relative_to', ref(L.relative_to)]);
        kw.push(['action', s.params.action]); if (s.params.argument) kw.push(['argument', s.params.argument]);
        kw.push(['values', { $tuple: s.params.values }]);
        if (s.kind === 'converge') { kw.push(['within', s.params.within]); if (!L.relative_to && !s.params.per_atom) kw.push(['per_atom', false]); }
        else if (L.against) kw.push(['against', ref(L.against)]);
      } else if (s.kind === 'levels') kw.push(['of', ref(L.of)]);
      else if (s.kind === 'choose') { kw.push(['among', ref(L.among)]); if (s.params.retained != null) kw.push(['retained', s.params.retained], ['because', s.params.because || '']); }
      else if (s.kind === 'difference') { args.push(ref(L.a), ref(L.b)); if (s.params.unit !== 'eV') kw.push(['unit', s.params.unit]); if (L.against) kw.push(['against', ref(L.against)]); }
      else if (s.kind === 'target') { args.push(s.params.value); kw.push(['within', s.params.within], ['unit', s.params.unit]); if (s.params.source) kw.push(['source', s.params.source]); }
      return { id: s.id, fn, name: nameOf(s), args, kw };
    });
  }
  const positions = () => study.sys.atoms.map((a) => [a.el, a.p.map((x, d) => (x + study.sys.origin[d]).toFixed(4))]);
  /* What the server is sent to compute: the structure and the calls, as data. Nothing in it is code. */
  function plan() {
    live.dir = live.dir || slug(study.name).toLowerCase();
    return { name: live.dir, system: study.sysId, structure: OND.structures.posinp(study.sys), steps: calls().map((c) => ({ fn: c.fn, name: c.name, args: c.args, kwargs: Object.fromEntries(c.kw) })) };
  }
  function script() {
    const sys = study.sys, lines = [];
    const arg = (x) => (x && x.$step ? x.$step : x && x.$tuple ? '(' + x.$tuple.map(arg).join(', ') + (x.$tuple.length === 1 ? ',' : '') + ')' : Array.isArray(x) ? '[' + x.map(arg).join(', ') + ']' : py(x));
    lines.push(['', '"""' + study.name + ': a study written by the workshop, step by step."""'], ['', 'from Studies import Study'], ['', '']);
    if (sys.atoms.length <= 12) lines.push(['system', 'STRUCTURE = {"units": "angstroem", "positions": ['], ...positions().map(([el, p]) => ['system', '    {' + J(el) + ': [' + p.join(', ') + ']},']), ['system', ']}']);
    else lines.push(['system', 'STRUCTURE = "' + sys.id + '.xyz"   # ' + sys.atoms.length + ' atoms, written by the workshop']);
    lines.push(['', ''], ['system', 'study = Study(STRUCTURE, name=' + J(slug(study.name).toLowerCase()) + ')']);
    for (const c of calls()) lines.push([c.id, c.name + ' = study.' + c.fn + '(' + [J(c.name), ...c.args.map(arg), ...c.kw.map(([k, v]) => k + '=' + arg(v))].join(', ') + ')']);
    return lines;
  }

  /* The example: a complete study, built with the same calls the interface makes. */
  function example() {
    reset(); setSystem('h2o');
    const t = (step, title) => { step.title = title; return step; };
    const target = t(add('target', null), 'Experiment'); Object.assign(target.params, { value: 12.62, within: 0.3, source: 'first ionisation energy of water, photoelectron spectroscopy' });
    const ground = t(add('calculation', null), 'Ground state'), cation = t(add('ionised', ground.id), 'Cation');
    const grid = t(add('converge', cation.id), 'Grid convergence'); grid.links.relative_to = ground.id; grid.params.within = 0.010;
    const kept = t(add('choose', grid.id), 'Grid kept'); kept.params.retained = 0.4;
    kept.params.because = 'The energy difference is converged at 0.45, but the geometry is not: relaxed there, the H–O–H angle comes out at 99.7° for 105.0° at 0.40 and 104.5° at 0.35.';
    const relaxed = t(add('relax', ground.id), 'Relaxed'), vertical = t(add('ionised', relaxed.id), 'Cation, vertical');
    t(add('difference', vertical.id), 'Ionisation energy');
    const cr = t(add('relax', vertical.id), 'Cation, relaxed'), adiabatic = t(add('difference', cr.id), 'Ionisation, adiabatic'); adiabatic.links.b = relaxed.id; delete adiabatic.links.against;
    // does the functional matter? side by side, then the usual practice: the PBE geometry, a hybrid energy started from the PBE wavefunctions
    const xcs = t(add('vary', cation.id), 'Functionals'); xcs.links.relative_to = ground.id; xcs.links.against = target.id;
    const neutral0 = t(add('hybrid', relaxed.id), 'PBE0'); neutral0.links.wavefunctions = relaxed.id;
    const cation0 = t(add('hybrid', vertical.id), 'Cation, PBE0'); cation0.links.wavefunctions = vertical.id;
    const ip0 = t(add('difference', cation0.id), 'Ionisation, PBE0'); ip0.links.b = neutral0.id; ip0.links.against = target.id;
    // what the levels say, and do not say
    const empty = t(add('empty_states', relaxed.id), 'Empty states'); t(add('levels', empty.id), 'Levels');
    study.name = 'Ionisation energy of water'; touch(); return ground;
  }

  OND.model = { study, HA, P, REG, CALC, SERIES, RELAX_KEYS, LIB, VARIABLE, touch, byId, at, isCalc, isSeries, nameOf, memberName, settingOf, settingVaried, vary, ownOf, chain, decisionsBefore, resolveInto, electronsOf, valuesOf, undecided, geometryFrom, ownerOf,
    cannotRead, keyOf, runOf, runsOf, members, series, retained, status, energy, levels, difference, combination, termsOf, setTerms, atomisationTerms, addAtoms, atomCalc, sysOf, readyRuns, compute, cannotAdd, add, remove, dependents, setSystem, setStructure, reset, script, changesOf, calls, plan, example, TITLES,
    live, setLive, mark, receive };
})(window.OND);
