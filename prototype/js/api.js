/* The page's way to its server (backend/serve.py): one function for every address of the API.
 *
 * The session is a cookie the page cannot read; the browser sends it by itself. What the
 * page holds is the token of that session, given by the server when someone signs in (or
 * by `auth/csrf` before anyone has), and sent back in X-CSRF-Token with every request that
 * changes something: a page of another site can make a browser send the cookie, it cannot
 * know that token.
 *
 * An answer that is not a success becomes an ApiError: `code` for the page, `message` for
 * the person, `fields` for the inputs a validation refused, `status`. Nothing here draws.
 * Served as files (tools/preview.py) no server answers: `status` is then 0 or 404, and the
 * pages stay the mock-ups they were. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  const state = { base: '/', csrf: '', registration: 'open', credentials: 'same-origin' };
  const heard = { signedOut: [] };

  class ApiError extends Error {
    constructor(status, said) {
      said = said || {};
      super(said.message || (status ? 'the server answered ' + status : 'the server did not answer: check the connection'));
      this.name = 'ApiError'; this.status = status; this.code = said.code || (status ? 'error' : 'offline');
      this.detail = said.detail || ''; this.fields = said.fields || {}; this.said = said;
    }
  }

  /* The token of this browser before anyone is signed in, and whether accounts can be created here. */
  async function token() {
    const said = await call('GET', 'auth/csrf');
    state.registration = said.registration || 'open';
    return state.csrf;
  }

  async function call(method, path, body, opt) {
    opt = opt || {};
    const changes = method !== 'GET';
    if (changes && !state.csrf) await token();
    const headers = {};
    if (changes) headers['X-CSRF-Token'] = state.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(state.base + 'api/' + path, { method, headers, credentials: state.credentials, cache: 'no-store', keepalive: !!opt.keepalive, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { throw new ApiError(0); }
    const said = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new ApiError(response.status, said && typeof said.error === 'object' ? said.error : null);
      // the token of a session that ended, or of another tab that signed in: ask for the current one and try once more
      if (error.code === 'bad_csrf' && !opt.again) { state.csrf = ''; await token(); return call(method, path, body, Object.assign({}, opt, { again: true })); }
      if (error.code === 'not_authenticated' && !opt.quiet) heard.signedOut.forEach((fn) => fn(error));
      throw error;
    }
    if (said && typeof said.csrf === 'string') state.csrf = said.csrf;
    return said;
  }

  OND.api = {
    state, ApiError, token, call,
    get: (path, opt) => call('GET', path, undefined, opt),
    post: (path, body, opt) => call('POST', path, body, opt),
    put: (path, body, opt) => call('PUT', path, body, opt),
    patch: (path, body, opt) => call('PATCH', path, body, opt),
    del: (path, body, opt) => call('DELETE', path, body, opt),
    /* Called when an address answers "sign in first" in the middle of the work: the session ended. */
    onSignedOut: (fn) => heard.signedOut.push(fn),
  };
})(window.OND);
