#!/usr/bin/env node
/* Check workshop 2 against a real run, without a browser.

     node tools/check_workshop.js

   The example study of the workshop was written by the interface, saved as
   examples/water-ionisation/study.py and executed with BigDFT through the
   registry of steps (for_pybigdft_pack/study). This rebuilds the example with
   the model of the page and checks three things:

     1. the script the page writes is, character for character, the one that ran;
     2. the page sends the same runs, under the same names, in the same waves;
     3. every number the page shows is the number BigDFT gave.

   Exit status 0 when all hold, 1 otherwise. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXAMPLE = path.join(ROOT, 'examples', 'water-ionisation');

global.window = global;
for (const f of ['prototype/js/chem', 'prototype/js/targets', 'prototype/js/actions', 'prototype/js/schema', 'prototype/js/blueprint',
  'workshop/js/structures', 'workshop/js/steps', 'workshop/js/library', 'workshop/js/model', 'workshop/js/equations']) require(path.join(ROOT, f + '.js'));
const M = global.OND.model;

let failed = 0;
const check = (what, ok, detail) => { console.log((ok ? 'ok    ' : 'FAILED') + '  ' + what + (ok || !detail ? '' : '\n        ' + detail)); if (!ok) failed += 1; };
const close = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;

M.example();
const step = (name) => M.study.steps.find((s) => M.nameOf(s) === name);

/* 1. the script */
const written = M.script().map((line) => line[1]).join('\n').trim();
const ran = fs.readFileSync(path.join(EXAMPLE, 'study.py'), 'utf8').trim();
const firstDifference = () => { const a = written.split('\n'), b = ran.split('\n'); for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return 'line ' + (i + 1) + '\n        page: ' + a[i] + '\n        ran : ' + b[i]; return ''; };
check('the page writes the script that was run', written === ran, firstDifference());

/* 2. the runs and the waves */
const analysis = fs.readFileSync(path.join(EXAMPLE, 'analysis.txt'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'runs', 'manifest.json'), 'utf8'));
const real = manifest.runs.filter((r) => !r.alias).map((r) => r.name).sort();
const before = M.study.steps.filter((s) => M.status(s).state === 'done').map((s) => s.title);
check('nothing is done before computing', before.length === 0, before.join(', '));
const out = M.compute();
const sent = out.waves.flat().map((r) => r.name).sort();
check('the page sends the ' + real.length + ' runs BigDFT ran, under the same names', sent.join() === real.join(), 'page: ' + sent.join(' ') + '\n        ran : ' + real.join(' '));
const realWaves = [...analysis.matchAll(/^wave \d+: ready \[([^\]]*)\]/gm)].map((m) => m[1].split(',').map((n) => n.trim().replace(/'/g, '')).filter(Boolean).sort().join(' ')).filter(Boolean);
const pageWaves = out.waves.map((w) => w.map((r) => r.name).sort().join(' '));
check('in the same ' + realWaves.length + ' waves', realWaves.length > 0 && pageWaves.join(' | ') === realWaves.join(' | '), 'page: ' + pageWaves.join(' | ') + '\n        ran : ' + realWaves.join(' | '));
check('every run has a recorded result', out.absent.length === 0, out.absent.join(', '));
const restarted = manifest.runs.filter((r) => r.wavefunctions_from).map((r) => r.name + ' from ' + r.wavefunctions_from).sort();
const pageRestarted = M.study.steps.filter((s) => s.links.wavefunctions).map((s) => M.nameOf(s) + ' from ' + M.nameOf(M.byId(s.links.wavefunctions))).sort();
check('the same ' + restarted.length + ' runs start from wavefunctions', restarted.join() === pageRestarted.join(), 'page: ' + pageRestarted.join(', ') + '\n        ran : ' + restarted.join(', '));

/* 3. the numbers */
const section = (name) => { const m = analysis.match(new RegExp('^' + name + ':\\n((?:[ ]+.*\\n?)+)', 'm')); return m ? m[1] : ''; };
const number = (name, key) => { const m = section(name).match(new RegExp('^\\s+' + key + ': (\\S+)', 'm')); return m ? Number(m[1]) : NaN; };
const rows = (name) => [...section(name).matchAll(/- value: (\S+)\n\s+quantity: (\S+)(?:\n\s+agrees: (\w+))?/g)].map((m) => ({ value: isNaN(Number(m[1])) ? m[1] : Number(m[1]), quantity: Number(m[2]), agrees: m[3] }));

for (const s of M.study.steps.filter(M.isCalc)) {
  const name = M.nameOf(s), shown = M.energy(s), given = number(name, 'energy_Ha');
  check('energy of ' + name + ': ' + given + ' Ha', close(shown, given, 5e-10), 'page shows ' + shown);
}
for (const s of M.study.steps.filter(M.isSeries)) {
  const name = M.nameOf(s), given = rows(name), shown = M.series(s);
  check('series ' + name + ': ' + given.length + ' values', given.length === shown.rows.length && given.every((g) => { const r = shown.rows.find((x) => x.value === g.value); return r && close(r.quantity, g.quantity, 5e-8) && (g.agrees === undefined || String(r.agrees) === g.agrees); }),
    JSON.stringify(shown.rows.map((r) => [r.value, r.quantity, r.agrees])));
  if (s.kind === 'converge') check('its criterion proposes ' + number(name, 'proposed'), shown.proposed === number(name, 'proposed'), 'page proposes ' + shown.proposed);
}
for (const s of M.study.steps.filter((x) => x.kind === 'choose')) check('the decision ' + M.nameOf(s) + ' retains ' + number(M.nameOf(s), 'retained'), M.retained(s) === number(M.nameOf(s), 'retained'), 'page retains ' + M.retained(s));
for (const s of M.study.steps.filter((x) => x.kind === 'difference')) {
  const name = M.nameOf(s), shown = M.difference(s), given = number(name, 'value'), verdict = (section(name).match(/agrees: (\w+)/) || [])[1];
  check(name + ': ' + given + ' eV' + (verdict ? ', within the target: ' + verdict : ''), shown && close(shown.value, given, 5e-8) && (verdict === undefined || String(shown.agrees) === verdict), 'page shows ' + JSON.stringify(shown));
}
/* The equation a result is shown with must say what the result is: named for what its terms are, written with
   the energies of the real runs, ending on the value the engine found. */
const Q = global.OND.equations;
const CALLED = { ionisation_energy: 'vertical ionisation energy', ionisation_adiabatic: 'adiabatic ionisation energy', ionisation_pbe0: 'vertical ionisation energy' };
for (const s of M.study.steps.filter((x) => x.kind === 'difference')) {
  const name = M.nameOf(s), e = Q.of(s), given = number(name, 'value');
  const energies = [s.links.a, s.links.b].map((id) => number(M.nameOf(M.byId(id)), 'energy_Ha').toFixed(6));
  check('the equation of ' + name + ' (' + CALLED[name] + '), from ' + energies.join(' and ') + ' Ha',
    e && e.name === CALLED[name] && e.definition.endsWith('= E(\\mathrm{H_{2}O^{+}}) - E(\\mathrm{H_{2}O})') && e.tex.includes('&= ' + energies[0] + ' - (' + energies[1] + ')\\ \\mathrm{Ha}')
      && e.tex.endsWith('= ' + given.toFixed(3) + '\\ \\mathrm{eV}\\end{aligned}'), 'page writes ' + (e && e.tex));
}
{
  const e = Q.of(M.study.steps.find((x) => x.kind === 'converge'));
  check('the convergence is written with what it follows and its criterion',
    e && e.tex === '\\begin{aligned}&\\Delta E(h) = E(\\mathrm{H_{2}O^{+}};h) - E(\\mathrm{H_{2}O};h)\\\\[3pt]&\\lvert \\Delta E(h) - \\Delta E(h_{\\mathrm{ref}})\\rvert \\le 10\\ \\mathrm{meV}\\end{aligned}', 'page writes ' + (e && e.tex));
}
/* A calculation is written with the settings it is run with: its functional, the electrons it holds, its grid;
   and, once computed, with the grid points its own log reports. */
{
  const of = (name) => Q.of(step(name)), cation = of('cation'), neutral = of('ground_state'), hybrid = of('pbe0'), relaxed = of('relaxed'), run = M.runOf(step('relaxed')).run;
  check('a calculation is written with its functional, its electrons and its grid',
    neutral && neutral.definition.includes('V_{xc}^{\\mathrm{PBE}}[\\rho]') && neutral.definition.includes('\\mathrm d\\mathbf r=8') && !neutral.definition.includes('\\sigma')
      && cation.definition.includes('V_{xc,\\sigma}^{\\mathrm{PBE}}[\\rho_\\uparrow,\\rho_\\downarrow]') && cation.definition.includes('\\mathrm d\\mathbf r=7') && cation.definition.includes('(\\rho_\\uparrow-\\rho_\\downarrow)\\,\\mathrm d\\mathbf r=1')
      && hybrid.definition.includes('\\hat V_{xc}^{\\mathrm{PBE0}}') && neutral.where.some((w) => w.text.includes('spacing ' + M.valuesOf(step('ground_state')).hgrid + ' bohr')),
    'page writes ' + (neutral && neutral.definition) + '\n        and ' + (cation && cation.definition));
  check('a relaxation adds the forces and its criterion, and the basis of its run: ' + run.nc + ' + 7 × ' + run.nf + ' coefficients',
    relaxed && relaxed.definition.includes('\\le ' + step('relaxed').params.forcemax + '\\ \\mathrm{Ha/bohr}') && !relaxed.definition.includes('N_{\\mathrm{dof}}')
      && relaxed.tex.includes('N_{\\mathrm{dof}}=N_c+7N_f=' + run.nc + '+7\\times' + run.nf + '=' + (run.nc + 7 * run.nf)), 'page writes ' + (relaxed && relaxed.tex));
}
for (const s of M.study.steps.filter((x) => x.kind === 'levels')) {
  const name = M.nameOf(s), shown = M.levels(s), homo = number(name, 'homo_eV'), gap = number(name, 'gap_eV');
  check('levels ' + name + ': highest occupied ' + homo.toFixed(4) + ' eV, gap ' + gap.toFixed(4) + ' eV', shown && close(shown.homo, homo, 1e-4) && shown.gap && close(shown.gap[0], gap, 1e-4), 'page shows ' + JSON.stringify(shown && { homo: shown.homo, gap: shown.gap }));
}

/* A restart must pay: fewer iterations than the same calculation from scratch, where the library holds both. */
const hybrid = step('pbe0'), scratchKey = M.keyOf(hybrid).replace('dft.inputpsiid=2.000000000e0;', '').replace(/\|wf=.*$/, '');
check('the restarted hybrid took fewer iterations than from scratch', M.LIB[scratchKey] && M.runOf(hybrid).run.iters < M.LIB[scratchKey].iters && close(M.runOf(hybrid).run.energy, M.LIB[scratchKey].energy, 1e-7),
  M.LIB[scratchKey] ? M.runOf(hybrid).run.iters + ' against ' + M.LIB[scratchKey].iters : 'the library has no such run from scratch: ' + scratchKey);

/* Every recorded run holds what PyBigDFT reads from a log. */
const registry = new Set(global.OND.logviews ? global.OND.logviews.attributes.map((a) => a.name) : JSON.parse(fs.readFileSync(path.join(ROOT, 'workshop/js/logviews.js'), 'utf8').split('OND.logviews = ')[1].replace(/;\s*$/, '')).attributes.map((a) => a.name));
const without = Object.values(M.LIB).filter((r) => !r.log || typeof r.log.energy !== 'number' || Object.keys(r.log).some((k) => !registry.has(k)));
check('the ' + Object.keys(M.LIB).length + ' recorded runs hold the attributes of PyBigDFT’s registry, and only those', without.length === 0, without.map((r) => r.name).slice(0, 5).join(', '));

/* A change upstream must leave nothing downstream standing. */
const ground = step('ground_state');
ground.own.v = Object.assign({}, ground.own.v, { crmult: 6 }); M.touch();
const still = M.study.steps.filter((s) => s.kind !== 'target' && M.status(s).state === 'done').map((s) => s.title);
check('changing the first calculation leaves no later result standing', still.length === 0, still.join(', '));

/* ... except what was already computed: a run is a calculation, whoever asked for it. With LDA, the first two steps
   are the runs the series over functionals already made; the relaxation is not. */
ground.own.v = Object.assign({}, ground.own.v, { crmult: 5, xc: 'LDA' }); M.touch();
const kept = M.study.steps.filter((s) => M.isCalc(s) && M.status(s).state === 'done').map((s) => M.nameOf(s)).join();
check('a calculation a series already made is not asked again', kept === 'ground_state,cation' && M.status(step('relaxed')).state === 'ready', 'done: ' + kept + ' | relaxed: ' + M.status(step('relaxed')).state);

/* 7. a study is saved and opened again: what the server keeps for its owner is the study, whole.
      Written, turned into JSON as it travels, and read back, it gives the same script, the same identities of
      calculations (so the same results), the same statuses, and writes itself the same again. */
{
  const scriptOf = () => M.script().map((line) => line[1]).join('\n');
  const stateOf = () => M.study.steps.map((s) => M.nameOf(s) + ':' + M.status(s).state + ':' + M.runsOf(s).map((r) => r.key).join(',')).join('\n');
  const reopened = (label) => {
    const saved = JSON.stringify(M.serialize()), script = scriptOf(), state = stateOf();
    M.restore(JSON.parse(saved));
    check(label + ': saved and opened again, it is the same study', scriptOf() === script && stateOf() === state && JSON.stringify(M.serialize()) === saved,
      scriptOf() !== script ? 'the script differs' : stateOf() !== state ? 'a status or an identity differs' : 'it does not write itself the same again');
  };
  M.example(); M.compute(); reopened('the example, computed');
  const built = M.study.steps.filter((s) => ['done', 'given'].includes(M.status(s).state)).length;
  check('its ' + M.study.computed.size + ' computed runs are still computed once reopened', built === M.study.steps.length, built + ' of ' + M.study.steps.length + ' steps done');

  /* a structure read from a file, a second structure, a calculation placed on it, an atomisation energy */
  M.reset(); M.setStructure(null, OND.structures.parseXyz('3\nwater, from a file\nO 0 0 0.1173\nH 0 0.7572 -0.4692\nH 0 -0.7572 -0.4692\n', 'my-water.xyz', 'file my-water.xyz'));
  const molecule = M.add('calculation', null), sum = M.add('combination', molecule.id);
  M.addAtoms(molecule, sum); M.setTerms(sum, M.atomisationTerms(molecule)); M.study.name = 'From a file'; M.touch();
  reopened('a study on a file of the disk, with ' + M.study.steps.filter((s) => s.kind === 'structure').length + ' other structures');
  const next = M.add('relax', molecule.id);
  check('a step added after reopening takes an id no other step has', M.study.steps.filter((s) => s.id === next.id).length === 1, next.id);
  let refused = ''; try { M.restore({ version: 2 }); } catch (e) { refused = e.message; }
  check('a document of another version is refused, and the study in hand is kept', refused !== '' && M.study.name === 'From a file', refused || 'it was accepted');

  const seed = require('./build_seed.js');
  check('backend/app/seed_data/studies.json is what the model writes now (node tools/build_seed.js)',
    fs.existsSync(seed.OUT) && fs.readFileSync(seed.OUT, 'utf8') === seed.text(seed.documents(M)));
}

console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
