#!/usr/bin/env node
/* Check workshop 2 computing for real, without a browser.

     node tools/check_live.js [http://127.0.0.1:8766]

   Needs backend/serve.py running, and behind it a bridge and the two HAPS: it
   COMPUTES. The example study (the ionisation energy of water, 18 runs, a few
   minutes) is rebuilt with the model of the page and sent wave after wave by
   the code the page uses (workshop/js/live.js). It then checks that:

     1. every step ends computed, in the waves the recorded run went through;
     2. every energy BigDFT gives now is the one recorded when the study was run
        by hand (examples/water-ionisation), within what two runs of BigDFT differ by;
     3. the runs that start from wavefunctions did read them;
     4. asked again, nothing is computed twice.

   Exit status 0 when all hold, 1 otherwise. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = (process.argv[2] || 'http://127.0.0.1:8766').replace(/\/+$/, '');
const ORIGIN = BASE;

global.window = global;
const plain = global.fetch;
global.fetch = (url, options) => plain(url, Object.assign({}, options, { headers: Object.assign({ Origin: ORIGIN }, (options || {}).headers) }));   // what a browser adds
for (const f of ['prototype/js/chem', 'prototype/js/targets', 'prototype/js/actions', 'prototype/js/schema', 'prototype/js/blueprint',
  'workshop/js/structures', 'workshop/js/steps', 'workshop/js/library', 'workshop/js/model', 'workshop/js/live']) require(path.join(ROOT, f + '.js'));
const M = global.OND.model, live = global.OND.live;
live.state.base = ORIGIN + '/';
live.state.poll = 500;

let failed = 0;
const check = (what, ok, detail) => { console.log((ok ? 'ok    ' : 'FAILED') + '  ' + what + (ok || !detail ? '' : '\n        ' + detail)); if (!ok) failed += 1; };

(async () => {
  const info = await live.probe();
  if (!info) { console.log('no server at ' + BASE + ': start it with  cd backend && uv run python serve.py'); process.exit(1); }
  check('the HAPS is ready behind ' + info.bridge, info.haps.ok, info.haps.text);
  if (!info.haps.ok) process.exit(1);
  console.log('        wavefunctions travel: ' + info.haps.wavefunctions + ' · studies in ' + info.workdir);

  const recorded = M.LIB;                                   // the runs of examples/water-ionisation are in the library, under the same identities
  M.example(); M.setLive(true);
  M.study.name = process.argv[3] || 'Check of the live workshop'; M.touch();
  const calcs = M.study.steps.filter(M.isCalc), restarted = M.study.steps.filter((s) => s.links.wavefunctions);
  if (!info.haps.wavefunctions) console.log('        this HAPS does not take wavefunctions: the ' + restarted.length + ' steps that start from them are expected to be refused');

  let last = '';
  const started = Date.now();
  const entry = await live.compute(null, () => {
    const wave = entry_waves().length, line = M.study.steps.map((s) => M.status(s).state[0]).join('');
    if (line !== last) { last = line; console.log('        ' + ((Date.now() - started) / 1000).toFixed(0).padStart(4) + ' s  wave ' + wave + '  ' + line); }
  });
  function entry_waves() { const log = M.study.log; return log.length ? log[log.length - 1].waves : []; }
  check('the server computed without error', !entry.error, entry.error);

  const expected = info.haps.wavefunctions ? [] : restarted.concat(M.study.steps.filter((s) => s.kind === 'difference' && [s.links.a, s.links.b].some((id) => restarted.includes(M.byId(id)))));
  const undone = M.study.steps.filter((s) => !['done', 'given'].includes(M.status(s).state) && !expected.includes(s));
  check('every step is computed', undone.length === 0, undone.map((s) => M.nameOf(s) + ': ' + M.status(s).state + ' (' + M.status(s).text + ')').join('\n        '));
  const analysis = fs.readFileSync(path.join(ROOT, 'examples/water-ionisation/analysis.txt'), 'utf8');
  const realWaves = [...analysis.matchAll(/^wave \d+: ready \[([^\]]*)\]/gm)].map((m) => m[1].split(',').map((n) => n.trim().replace(/'/g, '')).filter(Boolean).sort().join(' ')).filter(Boolean);
  const pageWaves = entry.waves.map((w) => w.map((r) => r.name).sort().join(' '));
  check('in the ' + realWaves.length + ' waves of the recorded run', pageWaves.join(' | ') === realWaves.join(' | '), 'now: ' + pageWaves.join(' | ') + '\n        then: ' + realWaves.join(' | '));

  const runs = [...new Map(M.study.steps.flatMap((s) => M.runsOf(s)).map((r) => [r.key, r])).values()];
  let worst = 0;
  for (const r of runs) {
    const then = recorded[r.key];
    if (!r.run) { if (!expected.some((s) => M.runOf(s).key === r.key)) check('energy of ' + r.name, false, 'not computed'); continue; }
    const away = then ? Math.abs(r.run.energy - then.energy) : NaN; worst = Math.max(worst, away || 0);
    // a relaxation stops when the forces are small enough: two runs do not stop on the same digit
    check('energy of ' + r.name + ': ' + r.run.energy.toFixed(8) + ' Ha, ' + (then ? away.toExponential(1) + ' Ha from the recorded run' : 'no recorded run'), !!then && away < (r.run.relax || r.key.includes('geo=@') ? 2e-5 : 1e-6));
  }
  console.log('        largest difference with the recorded runs: ' + worst.toExponential(1) + ' Ha');
  for (const s of M.study.steps.filter((x) => x.kind === 'difference')) { const d = M.difference(s); if (d) console.log('        ' + M.nameOf(s) + ': ' + d.value.toFixed(4) + ' ' + d.unit + (d.agrees == null ? '' : ', within the target: ' + d.agrees)); }
  if (info.haps.wavefunctions) for (const s of restarted) {
    const r = M.runOf(s).run, warnings = (r && r.warnings) || [];
    check(M.nameOf(s) + ' read the wavefunctions it starts from (' + (r ? r.iters + ' iterations' : 'not computed') + ')', !!r && !warnings.some((w) => w.includes('Missing wavefunction')));
  }

  /* Again, as after reloading the page: the page knows nothing, the server has everything. */
  const before = Object.assign({}, M.live.runs);
  Object.assign(M.live, { runs: {}, state: {} }); M.touch();
  const t = Date.now(), again = await live.compute(null);
  const same = Object.keys(before).every((k) => M.live.runs[k] && M.live.runs[k].energy === before[k].energy);
  check('asked again, the server answers from what it holds (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)', !again.error && same && Object.keys(M.live.runs).length === Object.keys(before).length, again.error || '');

  console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
