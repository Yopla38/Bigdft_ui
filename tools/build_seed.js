#!/usr/bin/env node
/* The demonstration studies of `python -m app.seed`: workshop/js/model.js -> backend/app/seed_data/studies.json

     node tools/build_seed.js

   The seed is Python and the study logic is the page's: rather than write a study a second
   time by hand, the model of the page builds each one with the calls the interface makes and
   writes it as the page saves it (model.serialize). tools/check_workshop.js fails when the
   file is no longer what the model writes; backend/tests checks that the server accepts it.

   Two studies:
     - the example of the workshop (the ionisation energy of water), computed on the recorded
       results: every number it shows is a real BigDFT 1.9.1 run of the library;
     - an atomisation energy of water, on three structures (the molecule and its two atoms),
       not computed: no run of an isolated atom is recorded, and the seed invents none. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'backend', 'app', 'seed_data', 'studies.json');

function documents(M) {
  const out = [];
  M.example(); M.compute();
  out.push(M.serialize());

  M.reset(); M.setSystem('h2o');
  const water = M.add('calculation', null); water.title = 'Water';
  const sum = M.add('combination', water.id); sum.title = 'Atomisation energy';
  M.addAtoms(water, sum); M.setTerms(sum, M.atomisationTerms(water));
  M.study.name = 'Atomisation energy of water'; M.touch();
  out.push(M.serialize());

  M.reset(); M.setSystem('h2o');
  return out;
}
const text = (docs) => JSON.stringify(docs, null, 1) + '\n';

if (require.main === module) {
  global.window = global;
  for (const f of ['prototype/js/chem', 'prototype/js/targets', 'prototype/js/actions', 'prototype/js/schema', 'prototype/js/blueprint',
    'workshop/js/structures', 'workshop/js/steps', 'workshop/js/library', 'workshop/js/model']) require(path.join(ROOT, f + '.js'));
  const docs = documents(global.OND.model);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text(docs));
  console.log(path.relative(ROOT, OUT) + ': ' + docs.map((d) => '“' + d.name + '” (' + d.steps.length + ' steps, ' + d.computed.length + ' runs computed on recorded results)').join(', '));
}

module.exports = { documents, text, OUT };
