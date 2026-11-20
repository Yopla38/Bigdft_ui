/* Computing for real: the page asks its own server (backend/serve.py), wave after wave.
 *
 * The model decides what a wave is, exactly as it does on recorded results: every run that
 * waits for nothing. This file sends those runs, follows them, and hands what BigDFT gave
 * back to the model under the identity of each calculation. The next wave is then whatever
 * the model says is ready: a relaxation that came back frees the steps that start from it.
 *
 * The server is sent the study as data (model.plan), never code. No address and no account
 * is known here: the server stands between the page and the HAPS.
 *
 * Nothing here draws. Served as a file (tools/preview.py), no server answers: `probe`
 * says so and the page stays on its recorded results. */
(function (OND) {
  'use strict';
  const M = OND.model;
  const state = { base: '', poll: 1000, info: null, busy: false, job: null, error: null, stopping: false };
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  async function api(path, body) {
    const response = await fetch(state.base + path, body === undefined ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const said = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(said.error || 'the server answered ' + response.status), { detail: said.detail || '' });
    return said;
  }

  /* Is there a server behind the page, and is its HAPS ready? null when the page is served as files. */
  async function probe() {
    try { const info = await api('api/info'); state.info = info && info.live ? info : null; } catch (e) { state.info = null; }
    return state.info;
  }

  /* Compute what is ready, or one step. `changed` is called whenever something on screen may differ. */
  async function compute(only, changed) {
    if (state.busy) return null;
    changed = changed || (() => {});
    state.busy = true; state.error = null; state.stopping = false;
    const entry = { live: true, waves: [], absent: [], only: only ? only.title : null, phase: '', error: null };
    M.study.log.push(entry);
    let sent = [];
    try {
      for (let n = 0; n < 24; n++) {
        const runs = M.readyRuns(only);
        if (!runs.length) break;
        const wave = runs.map((r) => ({ name: r.name, key: r.key, state: 'checking', text: '', seconds: null, relax: false, restart: r.key.includes('|wf=') }));
        entry.waves.push(wave); sent = wave;
        M.mark(wave.map((w) => w.key), { state: 'checking', text: 'its input is being checked' }); changed();
        const started = await api('api/compute', { plan: M.plan(), names: wave.map((w) => w.name), script: M.script().map((line) => line[1]).join('\n') + '\n' });
        state.job = started.job; entry.directory = started.directory;
        let status;
        do {
          await sleep(state.poll);
          status = await api('api/jobs/' + started.job);
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
        state.job = null; sent = [];
        if (status.state === 'error') throw new Error(status.message);
        if (only || state.stopping || !wave.some((w) => w.state === 'done')) break;   // stopped, or nothing came back: no further wave
      }
    } catch (e) {
      state.error = entry.error = e.message + (e.detail ? '\n' + e.detail : '');
      M.mark(sent.filter((w) => w.state !== 'done').map((w) => w.key), null);   // not computed, and not refused either: ready again
    } finally {
      state.busy = false; state.job = null; entry.phase = ''; changed();
    }
    return entry;
  }

  /* Ask the server to stop the wave: it asks the HAPS to stop its jobs. */
  async function stop() { state.stopping = true; if (state.job) { try { await api('api/jobs/' + state.job + '/cancel', {}); } catch (e) { /* the wave says how it ended */ } } }
  /* Forget why the runs of a step were not computed: they are ready again. */
  function retry(step) { M.mark(M.runsOf(step).filter((r) => r.problem).map((r) => r.key), null); }

  /* A molecule by its name: the server fetches its 3D structure and hands it back as the text of an .xyz file. */
  const structure = (name) => api('api/structure', { name });

  OND.live = { state, probe, compute, stop, retry, structure };
})(window.OND);
