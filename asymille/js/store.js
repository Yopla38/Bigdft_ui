/* The projects of whoever is signed in: their list, the one that is open, and keeping it saved.
 *
 * Written after Ondelette's workshop/js/store.js, and it behaves the same: what is done on screen
 * is done, the server follows a moment after the last change, and `state.save` says where that
 * stands (saved, dirty, saving, error, conflict). A save carries the revision it was made from, so
 * two tabs cannot overwrite each other silently. The list is changed first and sent after; when
 * the server refuses it goes back to what it was. Nothing here draws: `on(fn)` is called at each
 * change of `state`.
 *
 * The one difference: a project can be large (its data are in it), so "did it change" is asked of
 * the model's version number, not by writing the project out at every redraw. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const api = window.OND.api, M = ASY.model, PATH = 'asymille/projects';
  const state = { on: false, list: null, loading: false, error: null, id: null, revision: 0, opening: false, save: 'saved', saveError: '' };
  const heard = [];
  const DELAY = 900;
  let ready = false, saved = -1, refused = -1, timer = null, sending = null, again = false, retry = 0, temp = 0;

  const tell = () => heard.forEach((fn) => fn(state));
  const set = (save, why) => { if (state.save !== save || state.saveError !== (why || '')) { state.save = save; state.saveError = why || ''; tell(); } };
  const summary = (s) => ({ id: s.id, name: s.name, sheet_count: s.sheet_count, graph_count: s.graph_count, fit_count: s.fit_count, revision: s.revision, created_at: s.created_at, updated_at: s.updated_at });
  const sorted = () => { state.list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0)); };
  const place = (s) => { const i = state.list.findIndex((x) => x.id === s.id); if (i < 0) state.list.unshift(summary(s)); else state.list[i] = summary(s); sorted(); };

  async function refreshList() {
    state.loading = true; state.error = null; tell();
    try { state.list = await api.get(PATH); } catch (e) { state.error = e.message; throw e; } finally { state.loading = false; tell(); }
    return state.list;
  }
  /* Someone signed in: their projects, and the last one they worked on. Without any, the project on screen becomes their first. */
  async function start() {
    state.on = true; state.id = null; saved = -1; ready = false; state.opening = true; tell();
    try {
      await refreshList();
      if (state.list.length) await open(state.list[0].id);
      ready = true; state.opening = false; tell();
      if (!state.id) changed();
    } catch (e) { ready = true; state.opening = false; set('error', e.message); tell(); }
  }
  async function open(id) {
    await flush();
    state.opening = true; tell();
    try {
      const project = await api.get(PATH + '/' + id);
      clearTimeout(timer); timer = null;
      M.restore(project.document);
      state.id = project.id; state.revision = project.revision; saved = M.version;
      place(project); retry = 0; set('saved');
      return project;
    } finally { state.opening = false; tell(); }
  }
  /* The page changed something, or may have: save a moment after the last change. Called at every redraw. */
  function changed() {
    if (!state.on || state.opening || state.save === 'conflict') return;
    if (state.save === 'saved') { if (M.version === saved) return; set('dirty'); }
    if (state.save === 'error' && (timer || M.version === refused)) return;
    clearTimeout(timer); timer = setTimeout(save, DELAY);
  }
  async function save(opt) {
    clearTimeout(timer); timer = null;
    if (!state.on || !ready || state.opening) return;
    if (sending) { again = true; return sending; }
    const doc = M.serialize(), at = M.version, id = state.id;
    if (at === saved && id) { set('saved'); return; }
    set('saving');
    sending = (async () => {
      try {
        const kept = id ? await api.put(PATH + '/' + id, { document: doc, revision: state.revision }, opt) : await api.post(PATH, { document: doc }, opt);
        if (state.id !== id) return;
        state.id = kept.id; state.revision = kept.revision; saved = at; retry = 0;
        place(kept);
        set(again || M.version !== at ? 'dirty' : 'saved');
      } catch (e) {
        if (state.id !== id) return;
        if (e.code === 'stale_revision') { set('conflict', e.message); return; }
        refused = at;
        set('error', e.status === 413 || e.code === 'too_large' ? 'this project is larger than the server accepts: remove a sheet, or ask an administrator to raise the limit' : e.message);
        if (!(e.status >= 400 && e.status < 500) && e.status !== 401) { retry = Math.min(retry + 1, 6); clearTimeout(timer); timer = setTimeout(save, 2000 * 2 ** retry); }
      } finally {
        sending = null;
        if (again) { again = false; if (state.save === 'dirty') changed(); }
      }
    })();
    return sending;
  }
  async function flush(opt) {
    if (!state.on || !ready) return;
    if (sending) await sending;
    if (state.save === 'conflict') return;
    if (!state.id || M.version !== saved) await save(opt);
  }
  /* The project was changed elsewhere. 'mine': what is on screen replaces it. 'theirs': it replaces what is on screen. */
  async function resolve(which) {
    const id = state.id;
    if (which === 'theirs') { state.save = 'saved'; saved = M.version; return open(id); }
    const theirs = await api.get(PATH + '/' + id);
    state.revision = theirs.revision; state.save = 'dirty'; tell();
    return save();
  }
  /* A new project: `build` puts it on screen, and it is saved as a project of its own. */
  async function fresh(build) {
    await flush();
    clearTimeout(timer); timer = null;
    state.id = null; state.revision = 0; saved = -1;
    build();
    set('dirty');
    return save();
  }
  async function rename(id, name) {
    name = String(name).trim().slice(0, 80) || 'Untitled project';
    const row = state.list.find((s) => s.id === id), before = row.name;
    if (before === name) return;
    row.name = name; tell();
    try {
      if (id === state.id) { M.doc.name = name; M.commit(); await save(); if (state.save === 'error') throw new Error(state.saveError); return; }
      const project = await api.get(PATH + '/' + id);
      place(await api.put(PATH + '/' + id, { document: Object.assign(project.document, { name }), revision: project.revision }));
      tell();
    } catch (e) { row.name = before; if (id === state.id) { M.doc.name = before; M.commit(); } tell(); throw e; }
  }
  async function duplicate(id) {
    if (id === state.id) await flush();
    const source = state.list.find((s) => s.id === id), ghost = Object.assign({}, source, { id: 'new' + (++temp), name: (source.name.slice(0, 72) + ' (copy)').slice(0, 80), pending: true, updated_at: new Date().toISOString() });
    state.list.unshift(ghost); tell();
    try { const made = await api.post(PATH + '/' + id + '/duplicate'); state.list[state.list.indexOf(ghost)] = summary(made); sorted(); tell(); return made; }
    catch (e) { state.list = state.list.filter((s) => s !== ghost); tell(); throw e; }
  }
  async function remove(id) {
    const before = state.list.slice(), row = state.list.find((s) => s.id === id);
    state.list = state.list.filter((s) => s !== row); tell();
    try {
      if (id === state.id) { clearTimeout(timer); timer = null; if (sending) await sending; }
      await api.del(PATH + '/' + id);
    } catch (e) { state.list = before; tell(); throw e; }
    if (id === state.id) {
      state.id = null; saved = -1; state.save = 'saved';
      if (state.list.length) await open(state.list[0].id); else { state.revision = 0; M.blank(); set('dirty'); await save(); }
    }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.on && state.save !== 'saved' && state.save !== 'conflict') flush({ keepalive: JSON.stringify(M.doc).length < 60000 }); });
  }
  ASY.store = { state, on: (fn) => heard.push(fn), start, refreshList, open, changed, save, flush, resolve, fresh, rename, duplicate, remove };
})(window.ASY);
