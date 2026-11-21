/* The studies of whoever is signed in: their list, the one that is open, and keeping it saved.
 *
 * The study on screen is the model's (model.js). This file sends it to the server when it
 * changed (model.serialize, a moment after the last change), and reads one back (model.restore).
 * It never asks before saving and never blocks the page: what is done on screen is done, the
 * server follows. `state.save` says where that stands:
 *
 *     saved      the server holds what is on screen
 *     dirty      changed since; a save is coming
 *     saving     being sent
 *     error      the save failed (state.saveError says why); it is tried again, and can be asked for
 *     conflict   the study was changed elsewhere (another tab) since it was opened: the person chooses
 *
 * The list is changed first and sent after: a study renamed, copied or deleted shows so at once,
 * and goes back to what it was if the server refuses (the caller gets the error to show).
 *
 * A save carries the revision it was made from, so two tabs cannot overwrite each other
 * silently. Nothing here draws: `on(fn)` is called at each change of `state`. The page gives
 * `hooks`: how to write the study on screen, how to put one there, and whether it is computing. */
(function (OND) {
  'use strict';
  const api = OND.api, J = JSON.stringify;
  const state = { on: false, list: null, loading: false, error: null, id: null, revision: 0, opening: false, save: 'saved', saveError: '' };
  const hooks = { snapshot: null, load: null, busy: () => false };
  const heard = [];
  const DELAY = 700;
  let ready = false, last = null, refused = null, timer = null, sending = null, again = false, retry = 0, temp = 0;

  const tell = () => heard.forEach((fn) => fn(state));
  const set = (save, why) => { if (state.save !== save || state.saveError !== (why || '')) { state.save = save; state.saveError = why || ''; tell(); } };
  const summary = (s) => ({ id: s.id, name: s.name, system: s.system, step_count: s.step_count, revision: s.revision, created_at: s.created_at, updated_at: s.updated_at });
  const sorted = () => { state.list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0)); };
  const place = (s) => { const i = state.list.findIndex((x) => x.id === s.id); if (i < 0) state.list.unshift(summary(s)); else state.list[i] = summary(s); sorted(); };

  async function refreshList() {
    state.loading = true; state.error = null; tell();
    try { state.list = await api.get('studies'); } catch (e) { state.error = e.message; throw e; } finally { state.loading = false; tell(); }
    return state.list;
  }

  /* Someone signed in: their studies, and the last one they worked on. Without any, the study on screen becomes their first. */
  async function start() {
    state.on = true; state.id = null; last = null; ready = false; state.opening = true; tell();
    try {
      await refreshList();
      if (state.list.length) await open(state.list[0].id);
      ready = true; state.opening = false; tell();
      if (!state.id) changed();
    } catch (e) { ready = true; state.opening = false; set('error', e.message); tell(); }
  }

  /* The study of that id replaces the one on screen. What was on screen is saved first. */
  async function open(id) {
    await flush();
    state.opening = true; tell();
    try {
      const study = await api.get('studies/' + id);
      clearTimeout(timer); timer = null;
      hooks.load(study);
      state.id = study.id; state.revision = study.revision; last = J(hooks.snapshot());
      place(study); retry = 0; set('saved');
      return study;
    } finally { state.opening = false; tell(); }
  }

  /* The page changed something, or may have: save a moment after the last change. Cheap: called at every redraw. */
  function changed() {
    if (!state.on || state.opening || state.save === 'conflict') return;
    if (state.save === 'saved') { if (last !== null && J(hooks.snapshot()) === last) return; set('dirty'); }
    if (state.save === 'error' && (timer || J(hooks.snapshot()) === refused)) return;      // the same study is not sent again at every redraw
    if (hooks.busy()) return;                                   // while a wave computes the log changes every second: saved when it ends
    clearTimeout(timer); timer = setTimeout(save, DELAY);
  }

  async function save(opt) {
    clearTimeout(timer); timer = null;
    if (!state.on || !ready || state.opening) return;
    if (sending) { again = true; return sending; }
    const doc = hooks.snapshot(), text = J(doc), id = state.id;
    if (text === last && id) { set('saved'); return; }
    set('saving');
    sending = (async () => {
      try {
        const kept = id ? await api.put('studies/' + id, { document: doc, revision: state.revision }, opt) : await api.post('studies', { document: doc }, opt);
        if (state.id !== id) return;                            // another study was opened meanwhile
        state.id = kept.id; state.revision = kept.revision; last = text; retry = 0;
        place(kept);
        set(again || J(hooks.snapshot()) !== text ? 'dirty' : 'saved');
      } catch (e) {
        if (state.id !== id) return;
        if (e.code === 'stale_revision') { set('conflict', e.message); return; }
        refused = text; set('error', e.message);
        // a refusal will be refused again; a server that did not answer may answer later
        if (!(e.status >= 400 && e.status < 500) && e.status !== 401) { retry = Math.min(retry + 1, 6); clearTimeout(timer); timer = setTimeout(save, 2000 * 2 ** retry); }
      } finally {
        sending = null;
        if (again) { again = false; if (state.save === 'dirty') changed(); }
      }
    })();
    return sending;
  }
  /* Save now what is not saved, and wait for it. */
  async function flush(opt) {
    if (!state.on || !ready) return;                            // until the list is read, what is on screen is nobody's study
    if (sending) await sending;
    if (state.save === 'conflict') return;
    if (!state.id || (hooks.snapshot && J(hooks.snapshot()) !== last)) await save(opt);
  }

  /* The study was changed elsewhere. 'mine': what is on screen replaces it. 'theirs': it replaces what is on screen. */
  async function resolve(which) {
    const id = state.id;
    if (which === 'theirs') { state.save = 'saved'; last = J(hooks.snapshot()); return open(id); }
    const theirs = await api.get('studies/' + id);
    state.revision = theirs.revision; state.save = 'dirty'; tell();
    return save();
  }

  /* A new study: `build` puts it on screen (an empty one, the example), and it is saved as a study of its own. */
  async function fresh(build) {
    await flush();
    clearTimeout(timer); timer = null;
    state.id = null; state.revision = 0; last = null;
    build();
    set('dirty');
    return save();
  }

  // ------------------------------------------------------------------ the list: changed at once, sent after
  async function rename(id, name) {
    name = String(name).trim().slice(0, 60) || 'Untitled study';
    const row = state.list.find((s) => s.id === id), before = row.name;
    if (before === name) return;
    row.name = name; tell();
    try {
      if (id === state.id) { hooks.rename(name); await save(); if (state.save === 'error') throw new Error(state.saveError); return; }
      const study = await api.get('studies/' + id);
      place(await api.put('studies/' + id, { document: Object.assign(study.document, { name }), revision: study.revision }));
      tell();
    } catch (e) { row.name = before; if (id === state.id) hooks.rename(before); tell(); throw e; }
  }
  async function duplicate(id) {
    const source = state.list.find((s) => s.id === id), ghost = Object.assign({}, source, { id: 'new' + (++temp), name: (source.name.slice(0, 52) + ' (copy)').slice(0, 60), pending: true, updated_at: new Date().toISOString() });
    state.list.unshift(ghost); tell();
    try { const made = await api.post('studies/' + id + '/duplicate'); state.list[state.list.indexOf(ghost)] = summary(made); sorted(); tell(); return made; }
    catch (e) { state.list = state.list.filter((s) => s !== ghost); tell(); throw e; }
  }
  /* Delete a study. The open one is replaced by the next of the list, or by `empty()` when it was the last. */
  async function remove(id, empty) {
    const before = state.list.slice(), row = state.list.find((s) => s.id === id);
    state.list = state.list.filter((s) => s !== row); tell();
    try {
      if (id === state.id) { clearTimeout(timer); timer = null; if (sending) await sending; }
      await api.del('studies/' + id);
    } catch (e) { state.list = before; tell(); throw e; }
    if (id === state.id) {
      state.id = null; last = null; state.save = 'saved';
      if (state.list.length) await open(state.list[0].id); else { state.revision = 0; empty(); set('dirty'); await save(); }
    }
  }

  // leaving the page, or hiding it: what is not saved is sent with a request that outlives the page
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.on && state.save !== 'saved' && state.save !== 'conflict' && !hooks.busy()) flush({ keepalive: true }); });
  }

  OND.store = { state, hooks, on: (fn) => heard.push(fn), start, refreshList, open, changed, save, flush, resolve, fresh, rename, duplicate, remove };
})(window.OND);
