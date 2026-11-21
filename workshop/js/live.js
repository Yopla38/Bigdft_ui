/* Computing for real: the page asks its own server (backend/serve.py), wave after wave.
 *
 * The model decides what a wave is, exactly as it does on recorded results: every run that
 * waits for nothing. This file sends those runs, follows them, and hands what BigDFT gave
 * back to the model under the identity of each calculation. The next wave is then whatever
 * the model says is ready: a relaxation that came back frees the steps that start from it.
 *
 * The server is sent the study as data (model.plan), never code, for a study of whoever is
 * signed in (`state.study`, its id on the server): it computes in a directory of that study
 * and keeps each result under the identity sent with the run, so that the study opened again
 * shows what was computed. No address and no account of the HAPS is known here: the server
 * stands between the page and the HAPS.
 *
 * Nothing here draws. Served as a file (tools/preview.py), no server answers: `probe`
 * says so and the page stays on its recorded results. */
(function (OND) {
  'use strict';
  const M = OND.model, api = OND.api;
  const state = { poll: 1000, info: null, busy: false, job: null, error: null, stopping: false, study: null };
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  /* Is there a server behind the page, and is its HAPS ready? null when the page is served as files, or to nobody signed in. */
  async function probe() {
    try { const info = await api.get('info', { quiet: true }); state.info = info && info.live ? info : null; } catch (e) { state.info = null; }
    return state.info;
  }

  /* Follow one wave until the server says it ended: each run that comes back goes to the model at once. */
  async function follow(job, wave, entry, changed) {
    state.job = job;
    let status;
    do {
      await sleep(state.poll);
      status = await api.get('jobs/' + job);
      entry.phase = status.phase || '';
      for (const w of wave) {
        const said = status.runs[w.name];
        if (!said || w.state === 'done') continue;
        Object.assign(w, { state: said.state, text: said.text || '' });
        if (said.state === 'done') { Object.assign(w, { seconds: said.result.wall, relax: !!said.result.relax }); M.receive(w.key, said.result); }
        else if (said.state === 'stopped') M.mark([w.key], null);                 // stopped is not failed: the run is ready again
        else M.mark([w.key], { state: said.state, text: said.state === 'refused' ? 'refused by BigDFT’s dry run: ' + said.text : said.state === 'waiting' ? 'the engine says it ' + said.text : said.text });
      }
      changed();
    } while (status.state === 'running');
    state.job = null;
    if (status.state === 'error') throw new Error(status.message);
  }
  const waveOf = (runs) => runs.map((r) => ({ name: r.name, key: r.key, state: 'checking', text: '', seconds: null, relax: false, restart: r.key.includes('|wf=') }));
  const failed = (entry, sent, e) => {
    state.error = entry.error = e.message + (e.detail ? '\n' + e.detail : '');
    M.mark(sent.filter((w) => w.state !== 'done').map((w) => w.key), null);       // not computed, and not refused either: ready again
  };

  /* Compute what is ready, or one step. `changed` is called whenever something on screen may differ. */
  async function compute(only, changed) {
    if (state.busy) return null;
    changed = changed || (() => {});
    state.busy = true; state.error = null; state.stopping = false;
    const entry = { live: true, waves: [], absent: [], only: only ? only.title : null, phase: '', error: null };
    M.study.log.push(entry);
    let sent = [];
    try {
      if (!state.study) throw new Error('this study is not saved yet, so the server has nowhere to compute it: wait for it to be saved and try again');
      for (let n = 0; n < 24; n++) {
        const runs = M.readyRuns(only);
        if (!runs.length) break;
        const wave = waveOf(runs);
        entry.waves.push(wave); sent = wave;
        M.mark(wave.map((w) => w.key), { state: 'checking', text: 'its input is being checked' }); changed();
        const started = await api.post('studies/' + state.study + '/compute', { plan: M.plan(), names: wave.map((w) => w.name), keys: Object.fromEntries(wave.map((w) => [w.name, w.key])),
          script: M.script().map((line) => line[1]).join('\n') + '\n' });
        entry.directory = started.directory;
        await follow(started.job, wave, entry, changed);
        sent = [];
        if (only || state.stopping || !wave.some((w) => w.state === 'done')) break;   // stopped, or nothing came back: no further wave
      }
    } catch (e) { failed(entry, sent, e); } finally {
      state.busy = false; state.job = null; entry.phase = ''; changed();
    }
    return entry;
  }

  /* A wave of this study was on its way when the page was opened (it was sent, then the page was closed or
     reloaded): follow it to its end. Its runs are the ones the model holds ready under the names the server gives. */
  async function resume(job, changed) {
    if (state.busy) return null;
    changed = changed || (() => {});
    state.busy = true; state.error = null; state.stopping = false;
    const entry = { live: true, waves: [], absent: [], only: null, phase: 'following the wave sent before this page was opened', error: null };
    M.study.log.push(entry);
    let wave = [];
    try {
      const status = await api.get('jobs/' + job);
      wave = waveOf(M.readyRuns().filter((r) => r.name in status.runs));
      entry.waves.push(wave);
      M.mark(wave.map((w) => w.key), { state: 'running', text: 'computing on the HAPS' }); changed();
      await follow(job, wave, entry, changed);
    } catch (e) { failed(entry, wave, e); } finally {
      state.busy = false; state.job = null; entry.phase = ''; changed();
    }
    return entry;
  }

  /* Ask the server to stop the wave: it asks the HAPS to stop its jobs. */
  async function stop() { state.stopping = true; if (state.job) { try { await api.post('jobs/' + state.job + '/cancel'); } catch (e) { /* the wave says how it ended */ } } }
  /* Forget why the runs of a step were not computed: they are ready again. */
  function retry(step) { M.mark(M.runsOf(step).filter((r) => r.problem).map((r) => r.key), null); }

  /* A molecule by its name: the server fetches its 3D structure and hands it back as the text of an .xyz file. */
  const structure = (name) => api.post('structure', { name });

  OND.live = { state, probe, compute, resume, stop, retry, structure };
})(window.OND);
