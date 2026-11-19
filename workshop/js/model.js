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
  const CALC = ['calculation', 'relax'];
  const scratch = OND.Blueprint(), P = scratch.PARAMS;
  const LIB = OND.library.runs;
  const REG = Object.fromEntries(OND.steps.map((s) => [s.name, s]));
  const J = JSON.stringify;

  const study = { name: 'Untitled study', sysId: 'h2o', sys: null, steps: [], computed: new Set(), log: [], rev: 0, seq: 0 };
  let cache = {};
  const touch = () => { study.rev++; cache = {}; };
  const memo = (key, fn) => (key in cache ? cache[key] : (cache[key] = fn()));

  const byId = (id) => study.steps.find((s) => s.id === id) || null;
  const at = (step) => study.steps.indexOf(step);
  const isCalc = (s) => !!s && CALC.includes(s.kind);

  // --- naming: a step's name is the name of its run -----------------------------------
  /* 30 characters at most: BigDFT truncates the name of a longer run, and its log is then not found. */
  const LONGEST = 30;
  const slug = (text) => String(text).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, LONGEST - 2).replace(/_+$/, '') || 'step';
  function nameOf(step) {
    const mine = slug(step.title).toLowerCase(), same = study.steps.filter((s) => slug(s.title).toLowerCase() === mine);
    return same.length > 1 ? mine + '_' + (same.indexOf(step) + 1) : mine;
  }
  const tag = (value) => String(value).replace(/[^A-Za-z0-9]+/g, 'p').replace(/^p+|p+$/g, '');
  const memberName = (conv, base, value) => { const suffix = '-' + conv.params.action.replace(/^set_/, '').slice(0, 6) + tag(value); return nameOf(base).slice(0, LONGEST - suffix.length).replace(/[_-]+$/, '') + suffix; };

  // --- which setting a convergence step varies -----------------------------------------
  /* The registry names an input action (set_hgrid); the settings model has a key for what it writes (hgrid). */
  function settingOf(action) {
    const def = OND.actions.list.find((a) => a.name === action);
    const path = def && def.params.length && def.maps[def.params[0].name] && def.maps[def.params[0].name].keys[0].path;
    const keys = Object.keys(P).filter((k) => P[k][1] === path);
    return keys.length === 1 ? keys[0] : null;
  }

  // --- resolving a step: what it inherits, what it adds, what was decided before it ------
  function ownOf(step) {
    if (step.kind !== 'relax') return step.own;
    return Object.assign({}, step.own, { v: Object.assign({}, step.own.v, { action: 'geopt', geoptMethod: step.params.method, geoptSteps: step.params.nsteps, forcemax: step.params.forcemax }) });
  }
  function chain(step) { const out = []; for (let s = step; s; s = byId(s.links.after)) out.unshift(s); return out; }
  function decisionsBefore(step) {
    const i = at(step);
    return study.steps.filter((s, n) => s.kind === 'choose' && n < i).map((s) => ({ step: s, key: settingOf(byId(s.links.among).params.action), value: retained(s) }));
  }
  /* Load into a settings model `b` the settings of `step`. own: false stops before the step's own changes. */
  function resolveInto(b, step, opt) {
    opt = opt || {};
    b.clear(); b.setSystem(study.sys);
    const steps = chain(step);
    steps.forEach((s, n) => {
      const last = n === steps.length - 1;
      if (last && opt.own === false) return;
      const own = ownOf(s), src = last ? 'you' : 'inherited';
      for (const k in own.v) if (last || !(s.kind === 'relax' && RELAX_KEYS.includes(k))) b.set(k, own.v[k], src);
      for (const p in own.expert) b.setExpert(p, own.expert[p]);
      for (const a of own.actions) b.applyAction(a.name, a.args);
    });
    if (opt.decisions !== false) for (const d of decisionsBefore(step)) if (d.key && d.value != null) b.set(d.key, d.value, 'decision');
    if (opt.override) b.set(opt.override[0], opt.override[1], 'decision');
    return b;
  }
  const undecided = (step) => decisionsBefore(step).some((d) => d.value == null);
  /* The relaxation whose final geometry a step starts from. */
  function geometryFrom(step) { const up = chain(step).slice(0, -1).reverse(); return up.find((s) => s.kind === 'relax') || null; }
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
    return study.sysId + '|' + kept.join(';') + '|geo=' + geometry;
  }
  function keyOf(step, override) {
    return memo('key:' + step.id + ':' + J(override || 0), () => {
      const from = geometryFrom(step);
      return identity(resolveInto(scratch, step, { override }), from ? '@' + fnv(keyOf(from)) : 'start');
    });
  }

  // --- runs, statuses ------------------------------------------------------------------------
  /* One BigDFT run of a step: its identity, its recorded result if the library holds it, whether it was computed here. */
  function runOf(step, override, name) {
    const key = keyOf(step, override), run = LIB[key] || null;
    return { key, run, done: !!run && study.computed.has(key), name: name || nameOf(step) };
  }
  function members(conv) {
    const key = settingOf(conv.params.action), of = byId(conv.links.of), rel = byId(conv.links.relative_to);
    return conv.params.values.map((value) => ({ value, of: runOf(of, [key, value], memberName(conv, of, value)), rel: rel ? runOf(rel, [key, value], memberName(conv, rel, value)) : null }));
  }
  function series(conv) {
    return memo('series:' + conv.id, () => {
      const rows = members(conv), natoms = study.sys.atoms.length, rel = !!conv.links.relative_to;
      for (const r of rows) {
        const ok = r.of.done && (!rel || r.rel.done);
        r.quantity = !ok ? null : rel ? (r.of.run.energy - r.rel.run.energy) * HA.eV : r.of.run.energy * HA.eV / (conv.params.per_atom ? natoms : 1);
        r.seconds = (r.of.run ? r.of.run.wall : 0) + (r.rel && r.rel.run ? r.rel.run.wall : 0);
      }
      const complete = rows.length > 0 && rows.every((r) => r.quantity != null), ref = complete ? rows[rows.length - 1].quantity : null;
      for (const r of rows) r.away = complete ? Math.abs(r.quantity - ref) : null;
      const first = complete ? rows.slice(0, -1).find((r) => r.away <= conv.params.within) : null;   // the reference agreeing with itself proves nothing
      return { rows, complete, proposed: first ? first.value : null, relative: rel };
    });
  }
  function retained(choose) { return choose.params.retained != null ? choose.params.retained : series(byId(choose.links.among)).proposed; }

  /* done: computed | ready: can be computed now | blocked: waits for something | absent: not among the recorded results | given */
  function status(step) {
    return memo('status:' + step.id, () => {
      const blockedBy = (s) => { if (undecided(s)) return 'the decision'; const g = geometryFrom(s); return g && status(g).state !== 'done' ? '“' + g.title + '”' : null; };
      if (isCalc(step)) {
        const wait = blockedBy(step);
        if (wait) return { state: 'blocked', text: 'waits for ' + wait };
        const r = runOf(step);
        return r.done ? { state: 'done', text: 'computed' } : r.run ? { state: 'ready', text: 'ready to compute' } : { state: 'absent', text: 'not among the recorded results' };
      }
      if (step.kind === 'converge') {
        const bases = [byId(step.links.of), byId(step.links.relative_to)].filter(Boolean), wait = bases.map(blockedBy).find(Boolean);
        if (wait) return { state: 'blocked', text: 'waits for ' + wait };
        const runs = members(step).flatMap((m) => [m.of, m.rel].filter(Boolean)), done = runs.filter((r) => r.done).length;
        if (done === runs.length) return { state: 'done', text: runs.length + ' runs computed' };
        if (runs.some((r) => !r.run)) return { state: 'absent', text: runs.filter((r) => !r.run).length + ' of ' + runs.length + ' runs not among the recorded results' };
        return { state: 'ready', text: done ? done + ' of ' + runs.length + ' computed' : runs.length + ' runs ready' };
      }
      if (step.kind === 'choose') return !series(byId(step.links.among)).complete ? { state: 'blocked', text: 'waits for the series' } : retained(step) != null ? { state: 'done', text: 'decided' } : { state: 'absent', text: 'needs you: no value passes the criterion' };
      if (step.kind === 'difference') {
        const missing = [byId(step.links.a), byId(step.links.b)].filter((s) => status(s).state !== 'done');
        return missing.length ? { state: 'blocked', text: 'waits for ' + missing.map((s) => '“' + s.title + '”').join(' and ') } : { state: 'done', text: 'computed' };
      }
      return { state: 'given', text: 'set' };
    });
  }
  const energy = (step) => { const r = runOf(step); return r.done ? r.run.energy : null; };
  function difference(step) {
    const a = energy(byId(step.links.a)), b = energy(byId(step.links.b));
    if (a == null || b == null) return null;
    const value = (a - b) * HA[step.params.unit], t = byId(step.links.against);
    return { value, unit: step.params.unit, target: t ? t.params : null, agrees: t ? Math.abs(value - t.params.value) <= t.params.within : null };
  }

  // --- computing: what a wave would send, and what comes back ---------------------------------------
  /* The runs that can go now. In the mock-up a run "comes back" when the library holds its real result. */
  function readyRuns(only) {
    const out = new Map();
    for (const step of study.steps) {
      if (only && only !== step) continue;
      if (status(step).state !== 'ready') continue;
      const runs = isCalc(step) ? [runOf(step)] : step.kind === 'converge' ? members(step).flatMap((m) => [m.of, m.rel].filter(Boolean)) : [];
      for (const r of runs) if (r.run && !r.done && !out.has(r.key)) out.set(r.key, r);
    }
    return [...out.values()];
  }
  function compute(only) {
    const waves = [];
    for (let n = 0; n < 12; n++) {
      const runs = readyRuns(only);
      if (!runs.length) break;
      for (const r of runs) study.computed.add(r.key);
      waves.push(runs.map((r) => ({ name: r.name, seconds: r.run.wall, relax: !!r.run.relax })));
      touch();
      if (only) break;
    }
    const absent = study.steps.filter((s) => (!only || only === s) && status(s).state === 'absent').map((s) => s.title);
    if (waves.length || absent.length) study.log.push({ waves, absent, only: only ? only.title : null });
    return { waves, absent };
  }

  // --- adding and removing steps ------------------------------------------------------------------
  const TITLES = { calculation: 'Calculation', relax: 'Relaxation', ionised: 'Cation', triplet: 'Triplet', hybrid: 'PBE0', converge: 'Convergence of the grid', choose: 'Decision on the grid', difference: 'Energy difference', target: 'Target' };
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
    if (need.includes('of') && !study.steps.some((s) => s.kind === 'calculation')) return 'needs a calculation to vary';
    if (need.includes('among') && !study.steps.some((s) => s.kind === 'converge')) return 'needs a convergence series';
    if (need.includes('a') && calcs.length < 2) return 'needs two calculations to compare';
    return null;
  }
  function add(fn, selected) {
    const def = REG[fn], kind = def.kind, sel = byId(selected), links = {}, params = {};
    for (const p of def.params) if (!p.link && p.name !== 'keys') params[p.name] = Array.isArray(p.default) ? p.default.slice() : p.default;
    const calcSel = isCalc(sel) ? sel : lastOf(isCalc);
    if (CALC.includes(kind)) links.after = calcSel ? calcSel.id : null;
    if (kind === 'converge') links.of = (sel && sel.kind === 'calculation' ? sel : lastOf((s) => s.kind === 'calculation')).id;
    if (kind === 'choose') links.among = (sel && sel.kind === 'converge' ? sel : lastOf((s) => s.kind === 'converge')).id;
    if (kind === 'difference') {
      const a = calcSel, b = (a && byId(a.links.after)) || lastOf((s) => isCalc(s) && s !== a), t = lastOf((s) => s.kind === 'target');
      links.a = a.id; links.b = b.id; if (t) links.against = t.id;
    }
    if (kind === 'target') { params.value = 0; params.within = 0.1; }
    const count = study.steps.filter((s) => s.fn === fn).length;
    const step = { id: 's' + (++study.seq), fn, kind, title: TITLES[fn] + (count ? ' ' + (count + 1) : ''), links, params,
      own: def.fills ? fillsToOwn(def.fills) : { v: {}, expert: {}, actions: [] } };
    if (def.fills) step.filled = J(step.own);
    if (fn === 'hybrid') step.own.v.xc = params.xc;
    if (fn === 'ionised') { step.own.v.charge = params.charge; step.own.v.mpol = params.unpaired; }
    for (const k of ['xc', 'charge', 'unpaired']) delete params[k];                // they are settings of the calculation now
    study.steps.push(step); touch();
    return step;
  }
  const dependents = (step) => study.steps.filter((s) => Object.values(s.links).includes(step.id));
  function remove(step) { if (dependents(step).length) return false; study.steps = study.steps.filter((s) => s !== step); touch(); return true; }
  function setSystem(id) { study.sysId = id; study.sys = OND.chem.build(id); scratch.setSystem(study.sys); study.computed.clear(); study.log = []; touch(); }
  function reset() { study.steps = []; study.computed.clear(); study.log = []; study.seq = 0; study.name = 'Untitled study'; touch(); }

  // --- the study as a script: one line per step, written with the registry of steps ------------------
  const py = (x) => (x === true ? 'True' : x === false ? 'False' : x == null ? 'None' : Array.isArray(x) ? '[' + x.map(py).join(', ') + ']'
    : typeof x === 'object' ? '{' + Object.entries(x).map(([k, v]) => J(k) + ': ' + py(v)).join(', ') + '}' : typeof x === 'string' ? J(x) : String(x));
  /* What a calculation step changes, said with input actions of PyBigDFT's registry wherever one writes exactly that. */
  function changesOf(step) {
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
      kwargs.push(c.a.name + '=' + (names.length === 0 ? 'True' : names.length === 1 && names[0] === c.a.params[0].name ? py(c.args[names[0]]) : py(c.args)));
      for (const [p] of c.writes) delete changed[p];
    }
    const keys = {};
    for (const p in changed) { const cut = p.lastIndexOf('.'); if (cut > 0 && !p.startsWith('import.')) (keys[p.slice(0, cut)] = keys[p.slice(0, cut)] || {})[p.slice(cut + 1)] = changed[p]; }
    if (Object.keys(keys).length) kwargs.push('keys=' + py(keys));
    return kwargs;
  }
  function script() {
    const v = (s) => nameOf(s), sys = study.sys, lines = [];
    const positions = sys.atoms.map((a) => '{' + J(a.el) + ': [' + a.p.map((x, d) => (x + sys.origin[d]).toFixed(4)).join(', ') + ']}');
    lines.push(['', '"""' + study.name + ': a study written by the workshop, step by step."""'], ['', 'from Studies import Study'], ['', '']);
    if (sys.atoms.length <= 12) lines.push(['system', 'STRUCTURE = {"units": "angstroem", "positions": ['], ...positions.map((p) => ['system', '    ' + p + ',']), ['system', ']}']);
    else lines.push(['system', 'STRUCTURE = "' + sys.id + '.xyz"   # ' + sys.atoms.length + ' atoms, written by the workshop']);
    lines.push(['', ''], ['system', 'study = Study(STRUCTURE, name=' + J(slug(study.name).toLowerCase()) + ')']);
    for (const s of study.steps) {
      const L = s.links, args = [J(nameOf(s))], name = (id) => v(byId(id));
      if (isCalc(s)) {
        if (L.after) args.push('after=' + name(L.after));
        const preset = REG[s.fn].fills && s.filled === J(s.own);
        if (s.kind === 'relax') { const d = REG.relax.params; for (const p of ['method', 'nsteps', 'forcemax']) if (s.params[p] !== d.find((x) => x.name === p).default) args.push(p + '=' + py(s.params[p])); }
        if (!preset) args.push(...changesOf(s));
        lines.push([s.id, v(s) + ' = study.' + (preset ? s.fn : s.kind) + '(' + args.join(', ') + ')']);
      } else if (s.kind === 'converge') {
        args.push('of=' + name(L.of)); if (L.relative_to) args.push('relative_to=' + name(L.relative_to));
        args.push('action=' + J(s.params.action), 'values=(' + s.params.values.join(', ') + ')', 'within=' + s.params.within);
        if (!L.relative_to && !s.params.per_atom) args.push('per_atom=False');
        lines.push([s.id, v(s) + ' = study.converge(' + args.join(', ') + ')']);
      } else if (s.kind === 'choose') {
        args.push('among=' + name(L.among)); if (s.params.retained != null) args.push('retained=' + s.params.retained, 'because=' + J(s.params.because || ''));
        lines.push([s.id, v(s) + ' = study.choose(' + args.join(', ') + ')']);
      } else if (s.kind === 'difference') {
        args.push(name(L.a), name(L.b)); if (s.params.unit !== 'eV') args.push('unit=' + J(s.params.unit)); if (L.against) args.push('against=' + name(L.against));
        lines.push([s.id, v(s) + ' = study.difference(' + args.join(', ') + ')']);
      } else if (s.kind === 'target') {
        args.push(String(s.params.value), 'within=' + s.params.within, 'unit=' + J(s.params.unit)); if (s.params.source) args.push('source=' + J(s.params.source));
        lines.push([s.id, v(s) + ' = study.target(' + args.join(', ') + ')']);
      }
    }
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
    study.name = 'Ionisation energy of water'; touch(); return ground;
  }

  OND.model = { study, HA, P, REG, CALC, RELAX_KEYS, LIB, touch, byId, at, isCalc, nameOf, memberName, settingOf, ownOf, chain, decisionsBefore, resolveInto, undecided, geometryFrom, ownerOf,
    keyOf, runOf, members, series, retained, status, energy, difference, readyRuns, compute, cannotAdd, add, remove, dependents, setSystem, reset, script, changesOf, example, TITLES };
})(window.OND);
