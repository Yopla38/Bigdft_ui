/* The studies of whoever is signed in, on screen: the list to open, rename, copy and delete them,
 * and in the header where the saving of the open one stands. This file draws; store.js does.
 *
 * A change of the list shows at once (store.js sends it after). When the server refuses, the
 * list goes back to what it was and the reason is written above it. */
(function (OND) {
  'use strict';
  const T = OND.store;
  let ctx = null, el = null, body = null, note = '', renaming = null, removing = null;
  const SYSTEM = Object.fromEntries(OND.chem.list);
  const systemOf = (id) => SYSTEM[id] || (/^atom-/.test(id) ? id.slice(5) + ' atom' : 'a structure of yours');
  const when = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : s < 86400 * 30 ? Math.round(s / 86400) + ' d ago' : new Date(iso).toLocaleDateString();
  };
  const SAVE = {
    saved: ['Saved', 'This study is kept on the server, under your account.'], dirty: ['Not saved yet', 'Changed: it is saved a moment after the last change.'], saving: ['Saving…', ''],
    error: ['Not saved · retry', ''], conflict: ['Changed elsewhere', 'This study was changed in another tab or browser since it was opened here. Click to choose which one is kept.'],
  };

  /* What the header says of the open study. */
  function status() {
    const s = T.state, h = ctx.h, pill = ctx.$('#save-state'), open = ctx.$('#studies-open');
    open.hidden = pill.hidden = !s.on;
    if (!s.on) return;
    const [label, title] = s.opening ? ['Opening…', ''] : SAVE[s.save];
    pill.className = 'pill save-state ' + (s.opening ? 'saving' : s.save);
    pill.replaceChildren(h('i', { 'aria-hidden': 'true' }), label);
    pill.title = s.save === 'error' ? 'The last save failed: ' + s.saveError + '. Click to try again; it is also tried again by itself.' : title;
    pill.disabled = !(s.save === 'error' || s.save === 'conflict');
    if (el) draw();
  }

  async function act(fn) {
    note = '';
    try { await fn(); } catch (e) { note = e.message || String(e); }
    if (el) draw();
  }

  function row(s) {
    const h = ctx.h, current = s.id === T.state.id;
    if (renaming === s.id) {
      const input = h('input', { type: 'text', value: s.name, maxlength: 60, 'aria-label': 'Name of the study', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.stopPropagation(); renaming = null; draw(); } } });
      const done = () => { const name = input.value; renaming = null; act(() => T.rename(s.id, name)); draw(); };
      setTimeout(() => { input.focus(); input.select(); }, 0);
      return h('li', { class: 'std-row' }, h('div', { class: 'std-edit' }, input, h('button', { class: 'btn small cta', type: 'button', onclick: done }, 'Rename'), h('button', { class: 'btn small', type: 'button', onclick: () => { renaming = null; draw(); } }, 'Cancel')));
    }
    if (removing === s.id) return h('li', { class: 'std-row warn' }, h('div', { class: 'std-edit' }, h('span', {}, 'Delete “' + s.name + '”, its results and its runs on the server? This cannot be undone.'),
      h('button', { class: 'btn small acc-btn-danger', type: 'button', 'data-confirm': 'delete', onclick: () => { removing = null; act(() => T.remove(s.id, ctx.blank)); draw(); } }, 'Delete'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { removing = null; draw(); } }, 'Keep')));
    return h('li', { class: 'std-row' + (current ? ' on' : '') + (s.pending ? ' pending' : ''), 'data-study': s.id },
      h('button', { class: 'std-open', type: 'button', disabled: s.pending || T.state.opening, 'aria-current': current ? 'true' : null, onclick: () => { if (current) return el.close(); act(async () => { await T.open(s.id); if (el) el.close(); }); } },
        h('b', {}, s.name), h('span', {}, systemOf(s.system) + ' · ' + s.step_count + ' step' + (s.step_count === 1 ? '' : 's') + ' · ' + (s.pending ? 'being copied…' : 'changed ' + when(s.updated_at)) + (current ? ' · open' : ''))),
      s.pending ? null : h('span', { class: 'std-acts' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { renaming = s.id; removing = null; draw(); } }, 'Rename'),
        h('button', { class: 'btn small', type: 'button', onclick: () => act(() => T.duplicate(s.id)) }, 'Duplicate'),
        h('button', { class: 'btn small', type: 'button', 'data-act': 'delete', onclick: () => { removing = s.id; renaming = null; draw(); } }, 'Delete')));
  }

  function draw() {
    const h = ctx.h, s = T.state;
    body.replaceChildren(...[
      note ? h('p', { class: 'acc-said', role: 'alert' }, note[0].toUpperCase() + note.slice(1) + (/[.?!]$/.test(note) ? '' : '.')) : null,
      s.error && !s.list ? h('div', { class: 'std-empty' }, h('p', { class: 'acc-said', role: 'alert' }, 'Your studies could not be read: ' + s.error + '.'), h('button', { class: 'btn small', type: 'button', onclick: () => act(T.refreshList) }, 'Try again'))
        : !s.list ? h('p', { class: 'acc-muted std-empty' }, 'Loading your studies…')
          : !s.list.length ? h('p', { class: 'acc-muted std-empty' }, 'No study yet. The one on screen is saved as your first as soon as it changes.')
            : h('ul', { class: 'std-list' }, s.list.map(row)),
      h('p', { class: 'acc-muted' }, 'A study is saved by itself as you build it, with what BigDFT computed for it. Only you see your studies.')].filter(Boolean));
  }

  function open() {
    if (el) return;
    const h = ctx.h;
    note = ''; renaming = removing = null;
    body = h('div', { class: 'acc-body' });
    el = h('dialog', { class: 'acc-dlg', id: 'studies', 'aria-label': 'Your studies', onclose: () => { el.remove(); el = null; }, onclick: (e) => { if (e.target === el) el.close(); } },
      h('div', { class: 'acc-head' }, h('h2', {}, 'Your studies'),
        h('button', { class: 'btn small cta', type: 'button', id: 'study-new', onclick: () => { ctx.fresh(); el.close(); } }, 'New study'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { ctx.example(); el.close(); } }, 'The example'),
        h('button', { class: 'btn small', type: 'button', onclick: () => el.close() }, 'Close')), body);
    document.body.append(el); el.showModal();
    draw();
    T.refreshList().catch(() => {});                              // what another tab did since
  }

  /* The study was changed elsewhere: which one is kept is the person's choice, never the page's. */
  function conflict() {
    const h = ctx.h, said = h('p', { class: 'acc-said', role: 'alert', hidden: true });
    const choose = (which) => async (e) => { e.target.disabled = true; try { await T.resolve(which); d.close(); } catch (err) { said.hidden = false; said.textContent = err.message; e.target.disabled = false; } };
    const d = h('dialog', { class: 'acc-dlg', 'aria-label': 'This study was changed elsewhere', onclose: () => d.remove() },
      h('div', { class: 'acc-head' }, h('h2', {}, 'Changed elsewhere')),
      h('div', { class: 'acc-body' }, h('p', {}, 'This study was saved from another tab or browser after it was opened here. The two versions cannot both be kept under one name.'), said,
        h('div', { class: 'acc-actions', style: 'padding:8px 0 4px' },
          h('button', { class: 'btn cta', type: 'button', onclick: choose('theirs') }, 'Open the other version'),
          h('button', { class: 'btn', type: 'button', onclick: choose('mine') }, 'Keep what is on screen'),
          h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Decide later'))));
    document.body.append(d); d.showModal();
  }

  /* `c`: { h, $, fresh(), example(), blank() } — how the page makes a new study, loads the example, and empties itself. */
  function mount(c) {
    ctx = c;
    c.$('#studies-open').addEventListener('click', open);
    c.$('#save-state').addEventListener('click', () => { if (T.state.save === 'conflict') conflict(); else if (T.state.save === 'error') T.save(); });
    T.on(status);
    status();
  }

  OND.studies = { mount, open, status };
})(window.OND);
