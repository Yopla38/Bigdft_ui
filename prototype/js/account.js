/* Who is using the page: signing in and up, the profile menu, the account settings, and for an
 * administrator the accounts of the others. Shared by the two workshops.
 *
 * The page calls `start` once. Three outcomes:
 *   'static'      no server with accounts answers (tools/preview.py): the page stays a mock-up;
 *   'anonymous'   a server answers and nobody is signed in: the page is covered until someone is;
 *   'user'        someone is signed in.
 * `onUser(user)` is called when someone signs in, at start included; `onReturn(user)` when the
 * same person signs in again after their session ended, the page still open. Signing out, or
 * signing in as someone else, reloads the page: nothing a user had on screen stays for the next.
 *
 * It draws its own elements and brings its own styles, written with the variables both pages
 * define. The session itself is the server's business (api.js). */
(function (OND) {
  'use strict';
  const api = OND.api;
  const state = { mode: 'unknown', user: null };
  let spec = { slot: null, onUser: null, onReturn: null, links: [] }, gateEl = null, popEl = null;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const val = attrs[k];
      if (val == null || val === false) continue;
      if (k === 'class') el.className = val;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), val);
      else el.setAttribute(k, val === true ? '' : val);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const initials = (name) => (String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
  const when = (iso) => {
    if (!iso) return 'never';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : s < 86400 * 30 ? Math.round(s / 86400) + ' d ago' : new Date(iso).toLocaleDateString();
  };
  const device = (ua) => { const b = /Firefox|Edg|Chrome|Safari/.exec(ua || ''), o = /Windows|Mac OS X|Android|iPhone|iPad|Linux/.exec(ua || ''); return ((b ? b[0].replace('Edg', 'Edge') : 'A browser') + (o ? ' on ' + o[0].replace('Mac OS X', 'macOS') : '')); };
  const MIN = 10;

  const CSS = `
.acc-me{width:32px;height:32px;border-radius:50%;border:1px solid var(--line-2);background:var(--raise);color:var(--fg);font:600 12px var(--sans);display:grid;place-items:center;flex:none}
.acc-me:hover,.acc-me[aria-expanded="true"]{border-color:var(--accent)}
.acc-slot{position:relative;display:flex;align-items:center}
.acc-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:60;width:min(280px,calc(100vw - 24px));background:var(--panel-2);border:1px solid var(--line-2);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.35);padding:6px;display:grid;gap:2px}
.acc-who{padding:10px 10px 12px;border-bottom:1px solid var(--line);margin-bottom:4px;display:grid;gap:2px;min-width:0}
.acc-who b{font-weight:600;overflow:hidden;text-overflow:ellipsis}.acc-who span{color:var(--fg-3);font-size:12px;overflow:hidden;text-overflow:ellipsis}
.acc-item{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:13px}
.acc-item:hover{background:var(--raise)}.acc-item.out{color:var(--fg-2);border-top:1px solid var(--line);border-radius:0 0 8px 8px;margin-top:4px}
.acc-role{display:inline-block;font:500 10px var(--mono);letter-spacing:.08em;padding:1px 6px;border-radius:99px;border:1px solid var(--line-2);color:var(--fg-2);justify-self:start;margin-top:4px}
.acc-role.admin{border-color:var(--accent);color:var(--accent)}
dialog.acc-gate,dialog.acc-dlg{color:var(--fg);font:14px/1.45 var(--sans);border:1px solid var(--line-2);background:var(--panel);border-radius:16px;padding:0;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);box-shadow:0 30px 80px rgba(0,0,0,.5)}
dialog.acc-gate{width:420px}dialog.acc-dlg{width:560px}dialog.acc-dlg.wide{width:980px}
dialog.acc-gate::backdrop{background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(7px)}
dialog.acc-dlg::backdrop{background:color-mix(in srgb,var(--bg) 62%,transparent);backdrop-filter:blur(2px)}
.acc-card{padding:28px 28px 22px;display:grid;gap:16px}
.acc-brand{display:flex;align-items:center;gap:10px}.acc-brand b{font:400 30px/1 var(--display)}
.acc-lede{color:var(--fg-2);font-size:13px;margin:0}
.acc-tabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line-2);border-radius:9px;padding:2px;gap:2px}
.acc-tabs button{padding:7px 10px;border-radius:7px;font-weight:500;color:var(--fg-2)}
.acc-tabs button[aria-selected="true"]{background:var(--raise);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line-2)}
.acc-form{display:grid;gap:12px;margin:0}
.acc-field{display:grid;gap:5px;font-size:13px;min-width:0}.acc-field>span{color:var(--fg-2);font-size:12px}
.acc-field input,.acc-field select,.acc-table select{width:100%;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid var(--line-2);background:var(--panel-2);color:var(--fg);font:inherit}
.acc-field input[aria-invalid="true"]{border-color:var(--err)}
.acc-field small{color:var(--fg-3);font-size:12px}.acc-field small.acc-err{color:var(--err)}
.acc-said{margin:0;padding:8px 10px;border-radius:8px;border:1px solid var(--err);color:var(--fg);font-size:13px}.acc-said.ok{border-color:var(--ok)}
.acc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.acc-actions .btn{min-height:36px}
.acc-foot{color:var(--fg-3);font-size:12px;margin:0}
.acc-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:1}
.acc-head h2{font:400 24px/1.1 var(--display);margin:0;flex:1}
.acc-body{padding:6px 20px 20px;display:grid;gap:4px}
.acc-sec{padding:16px 0;border-bottom:1px solid var(--line);display:grid;gap:12px}.acc-sec:last-child{border-bottom:0}
.acc-sec h3{margin:0;font:500 11px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--fg-3)}
.acc-sec.danger h3{color:var(--err)}
.acc-rows{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.acc-rows li{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;font-size:13px;min-width:0}
.acc-rows li>span{flex:1;min-width:0;display:grid}.acc-rows small{color:var(--fg-3);font-size:12px}
.acc-scroll{overflow-x:auto}.acc-table{width:100%;border-collapse:collapse;font-size:13px}
.acc-table th{text-align:left;font:500 11px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3);padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.acc-table td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap}
.acc-table td.who{white-space:normal;min-width:16ch}.acc-table td.who small{display:block;color:var(--fg-3)}
.acc-table tr.off td{opacity:.55}.acc-table select{width:auto;padding:4px 8px}
.acc-btn-danger{border-color:var(--err)!important;color:var(--err)}
.acc-muted{color:var(--fg-3);font-size:13px;margin:0}
.acc-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
@media (max-width:560px){.acc-card{padding:22px 18px 18px}.acc-head{padding:14px 16px}.acc-body{padding:4px 16px 16px}}
`;

  /* A form: its fields and one button. While it is sent the button says so; what the server refused is
     written under the field it refused, the rest above the button. */
  function form(o) {
    const inputs = {}, notes = {};
    const said = h('p', { class: 'acc-said', role: 'alert', hidden: true });
    const button = h('button', { class: 'btn ' + (o.danger ? 'acc-btn-danger' : 'cta'), type: 'submit' }, o.submit);
    const show = (fields, message, ok) => {
      let placed = false;
      for (const k in inputs) {
        const text = fields && fields[k];
        notes[k].hidden = !text; notes[k].textContent = text ? text[0].toUpperCase() + text.slice(1) + '.' : '';
        if (text) { inputs[k].setAttribute('aria-invalid', 'true'); placed = true; } else inputs[k].removeAttribute('aria-invalid');
      }
      said.hidden = !message || (placed && !ok); said.className = 'acc-said' + (ok ? ' ok' : '');
      said.textContent = message ? message[0].toUpperCase() + message.slice(1) + (/[.?!]$/.test(message) ? '' : '.') : '';
    };
    const el = h('form', { class: 'acc-form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      const values = Object.fromEntries(Object.keys(inputs).map((k) => [k, inputs[k].value]));
      const wrong = o.check ? o.check(values) : null;
      if (wrong) { show(wrong, 'Some fields need another look'); const first = Object.keys(wrong)[0]; if (inputs[first]) inputs[first].focus(); return; }
      show(null, ''); button.disabled = true; button.textContent = o.busy || 'One moment…';
      try {
        await o.send(values);
        for (const f of o.fields) if (f.type === 'password') inputs[f.name].value = '';
        if (o.done) show(null, o.done, true);
      } catch (err) { show(err.fields, err.message || String(err)); } finally { button.disabled = false; button.textContent = o.submit; }
    } },
    o.fields.map((f) => {
      inputs[f.name] = f.options ? h('select', { name: f.name }, f.options.map((v) => h('option', { value: v, selected: v === f.value }, v)))
        : h('input', { name: f.name, type: f.type || 'text', value: f.value || '', autocomplete: f.auto || 'off', required: f.required !== false, maxlength: f.max || 128, placeholder: f.placeholder, spellcheck: 'false' });
      notes[f.name] = h('small', { class: 'acc-err', hidden: true });
      return h('label', { class: 'acc-field' }, h('span', {}, f.label), inputs[f.name], f.hint ? h('small', {}, f.hint) : null, notes[f.name]);
    }), said, h('div', { class: 'acc-actions' }, button, o.extra || null));
    return { el, inputs };
  }
  const passwordRule = (v, key) => (v[key].length < MIN ? { [key]: 'at least ' + MIN + ' characters' } : null);

  // ------------------------------------------------------------------ signing in: the page is covered until someone is
  function gate(note) {
    if (gateEl) return;
    let tab = 'in';
    const body = h('div'), tabs = h('div', { class: 'acc-tabs', role: 'tablist' });
    const draw = () => {
      const open = api.state.registration === 'open';
      tabs.hidden = !open;
      tabs.replaceChildren(...[['in', 'Sign in'], ['up', 'Create an account']].map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; draw(); } }, label)));
      const f = tab === 'in'
        ? form({ submit: 'Sign in', busy: 'Signing in…', send: async (v) => entered(await api.post('auth/login', { email: v.email, password: v.password }, { quiet: true })),
          check: (v) => (!v.email.trim() ? { email: 'your e-mail' } : !v.password ? { password: 'your password' } : null),
          fields: [{ name: 'email', label: 'E-mail', type: 'email', auto: 'username', max: 254 }, { name: 'password', label: 'Password', type: 'password', auto: 'current-password' }] })
        : form({ submit: 'Create my account', busy: 'Creating the account…', send: async (v) => entered(await api.post('auth/register', { email: v.email, name: v.name.trim(), password: v.password }, { quiet: true })),
          check: (v) => (!v.name.trim() ? { name: 'how you are called' } : !/^\S+@\S+\.\S+$/.test(v.email.trim()) ? { email: 'an e-mail address' } : passwordRule(v, 'password')),
          fields: [{ name: 'name', label: 'Name', auto: 'name', max: 80 }, { name: 'email', label: 'E-mail', type: 'email', auto: 'username', max: 254 },
            { name: 'password', label: 'Password', type: 'password', auto: 'new-password', hint: 'At least ' + MIN + ' characters. It is kept as an Argon2 hash, never as it is.' }] });
      body.replaceChildren(f.el, h('p', { class: 'acc-foot' }, tab === 'in' ? (open ? 'No account yet? Create one: your studies are kept under it, and only you see them.' : 'Accounts are created by an administrator of this workshop.')
        : 'Your studies and the results computed for them belong to your account alone.'));
      setTimeout(() => { const first = f.el.querySelector('input'); if (first) first.focus(); }, 0);
    };
    gateEl = h('dialog', { class: 'acc-gate', 'aria-label': 'Sign in to the workshop', oncancel: (e) => e.preventDefault() },
      h('div', { class: 'acc-card' },
        h('div', { class: 'acc-brand' }, wave(34), h('b', {}, 'Ondelette')),
        h('p', { class: 'acc-lede' }, note || 'The BigDFT workshop: build a study step by step, compute it, read it. Sign in to find your studies.'),
        tabs, body));
    document.body.append(gateEl);
    gateEl.showModal();
    draw();
    api.token().then(draw, () => {});
  }
  const wave = (size) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 30 30'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<path d="M1 17h5c2 0 2.6-1.2 3.4-3.6C10.6 9.8 11.6 4 13.6 4c2.6 0 2.4 22 5 22 1.8 0 2.4-5.6 3.4-7.6.6-1.2 1.2-1.4 2.6-1.4H29" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>'; return s; };

  function entered(session) {
    const before = state.user;
    if (before && before.id !== session.user.id) { location.reload(); return; }       // someone else: nothing of the previous user stays
    state.user = session.user; state.mode = 'user';
    if (gateEl) { gateEl.close(); gateEl.remove(); gateEl = null; }
    drawSlot();
    if (!before && spec.onUser) spec.onUser(state.user);
    if (before && spec.onReturn) spec.onReturn(state.user);       // the same person, after their session ended: the page goes on
  }
  async function signOut() {
    try { await api.post('auth/logout', undefined, { quiet: true }); } catch (e) { /* signed out here whatever the server said */ }
    location.reload();
  }

  // ------------------------------------------------------------------ the profile menu
  function drawSlot() {
    const slot = spec.slot;
    if (!slot) return;
    slot.hidden = !state.user; slot.classList.add('acc-slot');
    if (!state.user) { slot.replaceChildren(); return; }
    const u = state.user, admin = u.role === 'ADMIN';
    const close = () => { if (popEl) { popEl.remove(); popEl = null; button.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); } };
    const outside = (e) => { if (!slot.contains(e.target)) close(); };
    const escape = (e) => { if (e.key === 'Escape') { close(); button.focus(); } };
    const item = (label, act, cls) => h('button', { class: 'acc-item' + (cls ? ' ' + cls : ''), type: 'button', role: 'menuitem', onclick: () => { close(); act(); } }, label);
    const button = h('button', { class: 'acc-me', type: 'button', id: 'account-open', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Your account: ' + u.name, title: u.name + ' · ' + u.email,
      onclick: () => {
        if (popEl) return close();
        popEl = h('div', { class: 'acc-pop', role: 'menu', 'aria-label': 'Your account' },
          h('div', { class: 'acc-who' }, h('b', {}, u.name), h('span', {}, u.email), h('i', { class: 'acc-role' + (admin ? ' admin' : '') }, admin ? 'ADMINISTRATOR' : 'MEMBER')),
          item('Account settings', openSettings), admin ? item('Users and computing', openUsers) : null,
          (spec.links || []).map((l) => h('a', { class: 'acc-item', href: l.href, role: 'menuitem' }, l.label)),
          item('Sign out', signOut, 'out'));
        slot.append(popEl); button.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
      } }, initials(u.name));
    slot.replaceChildren(button);
  }

  function dialog(title, wide) {
    const body = h('div', { class: 'acc-body' });
    const el = h('dialog', { class: 'acc-dlg' + (wide ? ' wide' : ''), 'aria-label': title, onclose: () => el.remove(), onclick: (e) => { if (e.target === el) el.close(); } },
      h('div', { class: 'acc-head' }, h('h2', {}, title), h('button', { class: 'btn small', type: 'button', onclick: () => el.close() }, 'Close')), body);
    document.body.append(el); el.showModal();
    return { el, body };
  }
  const section = (title, ...kids) => h('section', { class: 'acc-sec' }, h('h3', {}, title), ...kids);

  // ------------------------------------------------------------------ account settings: profile, password, sessions
  function openSettings() {
    const d = dialog('Your account'), u = () => state.user;
    const profile = form({ submit: 'Save the profile', busy: 'Saving…', done: 'Saved',
      check: (v) => (!v.name.trim() ? { name: 'how you are called' } : v.email.trim().toLowerCase() !== u().email && !v.current_password ? { current_password: 'needed to change the e-mail' } : null),
      send: async (v) => {
        const before = u(), body = { name: v.name.trim() }, email = v.email.trim().toLowerCase();
        if (email !== before.email) Object.assign(body, { email, current_password: v.current_password });
        state.user = Object.assign({}, before, { name: body.name }); drawSlot();                 // shown at once; taken back if the server refuses
        try { state.user = await api.patch('account', body); } catch (e) { state.user = before; throw e; } finally { drawSlot(); }
      },
      fields: [{ name: 'name', label: 'Name', value: u().name, auto: 'name', max: 80 }, { name: 'email', label: 'E-mail', type: 'email', value: u().email, auto: 'username', max: 254 },
        { name: 'current_password', label: 'Current password', type: 'password', auto: 'current-password', required: false, hint: 'Only asked for when the e-mail changes.' }] });
    const password = form({ submit: 'Change the password', busy: 'Changing…', done: 'Changed. Every other browser was signed out',
      check: (v) => (!v.current_password ? { current_password: 'your current password' } : passwordRule(v, 'new_password') || (v.new_password !== v.again ? { again: 'not the same as above' } : null)),
      send: async (v) => { await api.put('account/password', { current_password: v.current_password, new_password: v.new_password }); devices(); },
      fields: [{ name: 'current_password', label: 'Current password', type: 'password', auto: 'current-password' },
        { name: 'new_password', label: 'New password', type: 'password', auto: 'new-password', hint: 'At least ' + MIN + ' characters.' }, { name: 'again', label: 'New password, again', type: 'password', auto: 'new-password' }] });
    const list = h('div');
    async function devices() {
      list.replaceChildren(h('p', { class: 'acc-muted' }, 'Loading…'));
      let rows;
      try { rows = await api.get('account/sessions'); } catch (e) { list.replaceChildren(h('p', { class: 'acc-said', role: 'alert' }, e.message + '. '), h('button', { class: 'btn small', type: 'button', onclick: devices }, 'Try again')); return; }
      const draw = (note) => list.replaceChildren(...[note ? h('p', { class: 'acc-said', role: 'alert' }, note) : null, h('ul', { class: 'acc-rows' }, rows.map((r) => h('li', {},
        h('span', {}, h('b', {}, device(r.user_agent) + (r.current ? ' · this browser' : '')), h('small', {}, 'active ' + when(r.last_seen_at) + (r.ip ? ' · ' + r.ip : '') + ' · signed in ' + when(r.created_at))),
        r.current ? null : h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const before = rows; rows = rows.filter((x) => x !== r); draw();                        // gone at once; back if the server refuses
          try { await api.del('account/sessions/' + r.id); } catch (e) { rows = before; draw(e.message); }
        } }, 'Sign out'))))].filter(Boolean));
      draw();
    }
    const erase = form({ submit: 'Delete my account and my studies', busy: 'Deleting…', danger: true,
      check: (v) => (!v.password ? { password: 'your password, to confirm' } : null),
      send: async (v) => { await api.del('account', { password: v.password }); location.reload(); },
      fields: [{ name: 'password', label: 'Password', type: 'password', auto: 'current-password', hint: 'Your studies, their results and their runs on the server are removed with the account. This cannot be undone.' }] });
    const danger = section('Delete the account', erase.el); danger.classList.add('danger');
    d.body.append(section('Profile', profile.el), section('Password', password.el), section('Where you are signed in', list), danger);
    devices();
  }

  // ------------------------------------------------------------------ for administrators: the accounts, and what is computing
  function openUsers() {
    const d = dialog('Users and computing', true), users = h('div'), jobs = h('div');
    let rows = [];
    const failed = (host, e, again) => host.replaceChildren(h('p', { class: 'acc-said', role: 'alert' }, e.message), h('button', { class: 'btn small', type: 'button', onclick: again }, 'Try again'));
    /* A change is shown at once and sent; if the server refuses, the row goes back to what it was and says why. */
    async function change(row, patch) {
      const before = Object.assign({}, row);
      Object.assign(row, patch.is_active !== undefined || patch.role ? patch : {}); draw();
      try { Object.assign(row, await api.patch('admin/users/' + row.id, patch)); draw(patch.new_password ? 'The password of ' + row.email + ' was changed: every browser of that account was signed out.' : '', true); }
      catch (e) { Object.assign(row, before); draw(e.message); }
    }
    function draw(note, ok) {
      users.replaceChildren(...[note ? h('p', { class: 'acc-said' + (ok ? ' ok' : ''), role: 'alert' }, note) : null, h('div', { class: 'acc-scroll' }, h('table', { class: 'acc-table' },
        h('thead', {}, h('tr', {}, ['Account', 'Role', 'State', 'Studies', 'Last sign-in', ''].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((r) => {
          const me = r.id === state.user.id;
          return h('tr', { class: r.is_active ? '' : 'off', 'data-user': r.email }, h('td', { class: 'who' }, h('b', {}, r.name + (me ? ' (you)' : '')), h('small', {}, r.email)),
            h('td', {}, h('select', { 'aria-label': 'Role of ' + r.email, onchange: (e) => change(r, { role: e.target.value }) }, ['USER', 'ADMIN'].map((x) => h('option', { value: x, selected: r.role === x }, x)))),
            h('td', {}, h('button', { class: 'btn small', type: 'button', disabled: me, title: me ? 'Your own account' : '', onclick: () => change(r, { is_active: !r.is_active }) }, r.is_active ? 'Active · close' : 'Closed · reopen')),
            h('td', {}, String(r.study_count)), h('td', {}, when(r.last_login_at)),
            h('td', {}, h('span', { class: 'acc-actions' },
              h('button', { class: 'btn small', type: 'button', onclick: () => { const p = prompt('A new password for ' + r.email + ' (at least ' + MIN + ' characters). Every browser of that account will be signed out.'); if (p) change(r, { new_password: p }); } }, 'Set a password'),
              me ? null : h('button', { class: 'btn small acc-btn-danger', type: 'button', onclick: async () => {
                if (!confirm('Delete the account ' + r.email + ' with its ' + r.study_count + ' studies and their runs? This cannot be undone.')) return;
                const before = rows; rows = rows.filter((x) => x !== r); draw();
                try { await api.del('admin/users/' + r.id); } catch (e) { rows = before; draw(e.message); }
              } }, 'Delete'))));
        }))))].filter(Boolean));
    }
    async function load() {
      users.replaceChildren(h('p', { class: 'acc-muted' }, 'Loading the accounts…'));
      try { rows = await api.get('admin/users'); draw(); } catch (e) { failed(users, e, load); }
    }
    const create = form({ submit: 'Create the account', busy: 'Creating…', done: 'Created. Give them the password: they change it from their account settings',
      check: (v) => (!v.name.trim() ? { name: 'a name' } : !/^\S+@\S+\.\S+$/.test(v.email.trim()) ? { email: 'an e-mail address' } : passwordRule(v, 'password')),
      send: async (v) => { rows.push(await api.post('admin/users', { email: v.email.trim(), name: v.name.trim(), password: v.password, role: v.role })); draw(); },
      fields: [{ name: 'name', label: 'Name', max: 80 }, { name: 'email', label: 'E-mail', type: 'email', max: 254 }, { name: 'password', label: 'First password', type: 'password', auto: 'new-password' }, { name: 'role', label: 'Role', options: ['USER', 'ADMIN'], value: 'USER' }] });
    create.el.classList.add('acc-grid2');
    async function loadJobs() {
      jobs.replaceChildren(h('p', { class: 'acc-muted' }, 'Loading…'));
      try {
        const list = await api.get('admin/jobs');
        jobs.replaceChildren(list.length ? h('div', { class: 'acc-scroll' }, h('table', { class: 'acc-table' }, h('thead', {}, h('tr', {}, ['Wave', 'State', 'Account', 'Study', 'Runs', 'Sent', 'Ended'].map((c) => h('th', {}, c)))),
          h('tbody', {}, list.map((j) => h('tr', {}, h('td', {}, h('code', {}, j.id)), h('td', {}, j.state), h('td', {}, j.user), h('td', {}, 'n° ' + j.study), h('td', {}, String(j.runs)), h('td', {}, when(j.created_at)), h('td', {}, j.finished_at ? when(j.finished_at) : '—'))))))
          : h('p', { class: 'acc-muted' }, 'Nothing was sent to the HAPS yet.'));
      } catch (e) { failed(jobs, e, loadJobs); }
    }
    d.body.append(section('Accounts', h('p', { class: 'acc-muted' }, 'An administrator sees the accounts and what they compute, never the content of a study. ' + (api.state.registration === 'open' ? 'Registration is open: anyone who reaches this page can create an account.' : 'Registration is closed: accounts are created here.')), users),
      section('Create an account', create.el),
      section('Sent to the HAPS', h('p', { class: 'acc-muted' }, 'The last waves, whoever sent them: every account computes with the one HAPS account of the bridge.'), jobs, h('div', { class: 'acc-actions' }, h('button', { class: 'btn small', type: 'button', onclick: loadJobs }, 'Refresh'))));
    load(); loadJobs();
  }

  // ------------------------------------------------------------------ start
  async function start(o) {
    spec = Object.assign(spec, o);
    if (!document.getElementById('acc-css')) document.head.append(h('style', { id: 'acc-css' }, CSS));
    api.onSignedOut(() => { if (state.mode !== 'static') { state.mode = 'anonymous'; gate(state.user ? 'Your session ended. Sign in again: what is on screen is kept.' : ''); } });
    try {
      const session = await api.get('auth/me', { quiet: true });
      entered(session);
    } catch (e) {
      if (e.code !== 'not_authenticated') { state.mode = 'static'; drawSlot(); return state.mode; }
      state.mode = 'anonymous'; drawSlot(); gate();
    }
    return state.mode;
  }

  OND.account = { state, start, signOut, openSettings, openUsers };
})(window.OND);
