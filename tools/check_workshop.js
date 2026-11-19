#!/usr/bin/env node
/* Check workshop 2 against a real run, without a browser.

     node tools/check_workshop.js

   The example study of the workshop was written by the interface, saved as
   examples/water-ionisation/study.py and executed with BigDFT through the
   registry of steps (for_pybigdft_pack/study). This rebuilds the example with
   the model of the page and checks three things:

     1. the script the page writes is, character for character, the one that ran;
     2. the page sends the same runs, under the same names, in waves;
     3. every number the page shows is the number BigDFT gave.

   Exit status 0 when all hold, 1 otherwise. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXAMPLE = path.join(ROOT, 'examples', 'water-ionisation');

global.window = global;
for (const f of ['prototype/js/chem', 'prototype/js/targets', 'prototype/js/actions', 'prototype/js/schema', 'prototype/js/blueprint',
  'workshop/js/steps', 'workshop/js/library', 'workshop/js/model']) require(path.join(ROOT, f + '.js'));
const M = global.OND.model;

let failed = 0;
const check = (what, ok, detail) => { console.log((ok ? 'ok    ' : 'FAILED') + '  ' + what + (ok || !detail ? '' : '\n        ' + detail)); if (!ok) failed += 1; };
const close = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;

M.example();

/* 1. the script */
const written = M.script().map((line) => line[1]).join('\n').trim();
const ran = fs.readFileSync(path.join(EXAMPLE, 'study.py'), 'utf8').trim();
const firstDifference = () => { const a = written.split('\n'), b = ran.split('\n'); for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return 'line ' + (i + 1) + '\n        page: ' + a[i] + '\n        ran : ' + b[i]; return ''; };
check('the page writes the script that was run', written === ran, firstDifference());

/* 2. the runs */
const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'runs', 'manifest.json'), 'utf8'));
const real = manifest.runs.filter((r) => !r.alias).map((r) => r.name).sort();
const before = M.study.steps.filter((s) => M.status(s).state === 'done').map((s) => s.title);
check('nothing is done before computing', before.length === 0, before.join(', '));
const out = M.compute();
const sent = out.waves.flat().map((r) => r.name).sort();
check('the page sends the ' + real.length + ' runs BigDFT ran, under the same names', sent.join() === real.join(), 'page: ' + sent.join(' ') + '\n        ran : ' + real.join(' '));
check('in two waves, the second waiting for the relaxed geometry', out.waves.length === 2 && out.waves[1].map((r) => r.name).sort().join() === 'cation_relaxed,cation_vertical', out.waves.map((w) => w.map((r) => r.name).join(' ')).join(' | '));
check('every run has a recorded result', out.absent === 0 || (Array.isArray(out.absent) && out.absent.length === 0), JSON.stringify(out.absent));

/* 3. the numbers */
const analysis = fs.readFileSync(path.join(EXAMPLE, 'analysis.txt'), 'utf8');
const section = (name) => { const m = analysis.match(new RegExp('^' + name + ':\\n((?:[ ]+.*\\n?)+)', 'm')); return m ? m[1] : ''; };
const number = (name, key) => { const m = section(name).match(new RegExp('^\\s+' + key + ': (\\S+)', 'm')); return m ? Number(m[1]) : NaN; };
const step = (title) => M.study.steps.find((s) => s.title === title);

for (const [title, name] of [['Ground state', 'ground_state'], ['Cation', 'cation'], ['Relaxed', 'relaxed'], ['Cation, vertical', 'cation_vertical'], ['Cation, relaxed', 'cation_relaxed']]) {
  const shown = M.energy(step(title)), given = number(name, 'energy_Ha');
  check('energy of "' + title + '": ' + given + ' Ha', close(shown, given, 5e-10), 'page shows ' + shown);
}
const series = M.series(step('Grid convergence'));
const rows = [...section('grid_convergence').matchAll(/- value: (\S+)\n\s+quantity: (\S+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
check('convergence series: ' + rows.length + ' values', rows.length === 4 && rows.every(([v, q]) => { const r = series.rows.find((x) => x.value === v); return r && close(r.quantity, q, 5e-8); }),
  JSON.stringify(series.rows.map((r) => [r.value, r.quantity])));
check('the criterion proposes ' + number('grid_convergence', 'proposed'), series.proposed === number('grid_convergence', 'proposed'), 'page proposes ' + series.proposed);
check('the decision retains ' + number('grid_kept', 'retained'), M.retained(step('Grid kept')) === number('grid_kept', 'retained'), 'page retains ' + M.retained(step('Grid kept')));
for (const [title, name] of [['Ionisation energy', 'ionisation_energy'], ['Ionisation, adiabatic', 'ionisation_adiabatic']]) {
  const shown = M.difference(step(title)), given = number(name, 'value');
  check('"' + title + '": ' + given + ' eV', shown && close(shown.value, given, 5e-8), 'page shows ' + JSON.stringify(shown));
}
const verdict = M.difference(step('Ionisation energy'));
check('judged within the target, as the real analysis says', verdict && verdict.agrees === true && /agrees: true/.test(section('ionisation_energy')), JSON.stringify(verdict));

/* A change upstream must leave nothing downstream standing. */
const ground = step('Ground state');
ground.own.v = Object.assign({}, ground.own.v, { xc: 'LDA' }); M.touch();
const still = M.study.steps.filter((s) => s.kind !== 'target' && M.status(s).state === 'done').map((s) => s.title);
check('changing the first calculation leaves no later result standing', still.length === 0, still.join(', '));

console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
