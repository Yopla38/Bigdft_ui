/* Arithmetic written by a person. Read by a small parser, never by eval or Function.
 *
 * Two readers of one grammar:
 *
 *     ASY.expr.compile('a*exp(-x/tau) + c')     →   { names, run(env) }       a custom fit function
 *     ASY.expr.column('B/max(B) - A[i-1]')      →   { names, run(table) }     the formula of a column
 *
 * `compile` reads numbers, names, + - * / ^, parentheses and the functions below: exactly what
 * asymille/expressions.py reads on the server, and tools/check_page.js compares the two on the
 * same expressions. A custom fit function is checked here with it, so that the page never
 * accepts what the server will refuse.
 *
 * `column` reads that and what only a column needs, computed in the page and never sent:
 *
 *     whole columns   sum(B), mean(B), sd(B), median(B), min(B), max(B), count(B): of every row, the empty ones apart.
 *                     What is inside may be a calculation: max(B - A).
 *     other rows      B[i-1] the row before, B[1] the first, B[n] the last; outside the column: empty.
 *     conditions      < > <= >= == !=, and, or, not, and if(condition, then, otherwise).
 *
 * A row where something needed is empty gives an empty cell: a comparison with nothing is not
 * false, it is nothing. */
window.ASY = window.ASY || {};
(function (ASY) {
  'use strict';
  const erf = (x) => {            // Abramowitz and Stegun 7.1.26 refined by a series near 0: 1e-7 is ample for a column
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  };
  const FUNCTIONS = {
    sin: [Math.sin, 1], cos: [Math.cos, 1], tan: [Math.tan, 1], asin: [Math.asin, 1], acos: [Math.acos, 1], atan: [Math.atan, 1],
    sinh: [Math.sinh, 1], cosh: [Math.cosh, 1], tanh: [Math.tanh, 1], exp: [Math.exp, 1], ln: [Math.log, 1], log: [Math.log, 1],
    log10: [Math.log10, 1], log2: [Math.log2, 1], sqrt: [Math.sqrt, 1], abs: [Math.abs, 1], sign: [Math.sign, 1], floor: [Math.floor, 1], ceil: [Math.ceil, 1],
    erf: [erf, 1], erfc: [(x) => 1 - erf(x), 1], heaviside: [(x) => (x > 0 ? 1 : x < 0 ? 0 : 0.5), 1],
    min: [Math.min, 2], max: [Math.max, 2], atan2: [Math.atan2, 2], pow: [Math.pow, 2],
  };
  const CONSTANTS = { pi: Math.PI, e: Math.E };
  class ExprError extends Error {}

  const AGGREGATES = {
    sum: (v) => v.reduce((a, b) => a + b, 0),
    mean: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN),
    sd: (v) => { if (v.length < 2) return NaN; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1)); },          // with n − 1, as the statistics of a column
    median: (v) => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; },
    min: (v) => (v.length ? v.reduce((a, b) => Math.min(a, b)) : NaN),
    max: (v) => (v.length ? v.reduce((a, b) => Math.max(a, b)) : NaN),
    count: (v) => v.length,
  };
  const WORDS = ['and', 'or', 'not', 'if'];              // read as what they say in the formula of a column: no column can be called so

  function tokens(text) {
    const out = [], re = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|<=|>=|==|!=|[-+*/^(),<>[\]]))/y;
    let i = 0;
    while (i < text.length) {
      if (/^\s*$/.test(text.slice(i))) break;
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m) throw new ExprError('this is not arithmetic near “' + text.slice(i, i + 12).trim() + '”');
      if (m[1] != null) { const last = out[out.length - 1]; if (last && (last.t === 'num' || (last.t === 'name' && !['and', 'or', 'not'].includes(last.v)))) throw new ExprError('write products with * (2*x, not 2 x)'); out.push({ t: 'num', v: parseFloat(m[1]) }); }
      else if (m[2] != null) { if (out.length && out[out.length - 1].t === 'num' && m[2] !== 'and' && m[2] !== 'or') throw new ExprError('write products with * (2*x, not 2x)'); out.push({ t: 'name', v: m[2] }); }
      else out.push({ t: m[3] === '**' ? '^' : m[3] });
      i = re.lastIndex;
    }
    return out;
  }

  /* One parser for the two readers. `wide` is the formula of a column: values are read from a place (a table and a row) instead of an environment. */
  function parse(text, wide) {
    text = String(text || '').trim();
    if (!text) throw new ExprError('the expression is empty');
    if (text.length > 2000) throw new ExprError('the expression is longer than 2000 characters');
    const toks = tokens(text), names = [];
    let p = 0, depth = 0, cached = 0;
    const peek = () => (toks[p] || {}).t, next = () => toks[p++];
    const word = (w) => wide && toks[p] && toks[p].t === 'name' && toks[p].v === w && (toks[p + 1] || {}).t !== '(';
    const note = (name) => { if (!names.includes(name)) names.push(name); return name; };
    const cell = (v) => (typeof v === 'number' ? v : NaN);
    const only = (what) => new ExprError(what + ' are for the formula of a column');
    const either = () => {         // or
      let left = both();
      while (word('or')) { next(); const a = left, b = both(); left = (e) => { const x = a(e), y = b(e); return isNaN(x) || isNaN(y) ? NaN : x !== 0 || y !== 0 ? 1 : 0; }; }
      return left;
    };
    const both = () => {           // and
      let left = negated();
      while (word('and')) { next(); const a = left, b = negated(); left = (e) => { const x = a(e), y = b(e); return isNaN(x) || isNaN(y) ? NaN : x !== 0 && y !== 0 ? 1 : 0; }; }
      return left;
    };
    const negated = () => {
      if (word('not')) { next(); const a = negated(); return (e) => { const x = a(e); return isNaN(x) ? NaN : x === 0 ? 1 : 0; }; }
      return compared();
    };
    const COMPARE = { '<': (x, y) => x < y, '>': (x, y) => x > y, '<=': (x, y) => x <= y, '>=': (x, y) => x >= y, '==': (x, y) => x === y, '!=': (x, y) => x !== y };
    const compared = () => {       // a comparison answers 1 or 0, and nothing when one side is nothing
      const left = sum();
      if (!COMPARE[peek()]) return left;
      if (!wide) throw only('comparisons');
      const test = COMPARE[next().t], right = sum();
      if (COMPARE[peek()]) throw new ExprError('write a < b and b < c, not a < b < c');
      return (e) => { const x = left(e), y = right(e); return isNaN(x) || isNaN(y) ? NaN : test(x, y) ? 1 : 0; };
    };
    const sum = () => {            // + and -
      let left = product();
      while (peek() === '+' || peek() === '-') { const op = next().t, a = left, b = product(); left = op === '+' ? (e) => a(e) + b(e) : (e) => a(e) - b(e); }
      return left;
    };
    const product = () => {
      let left = unary();
      while (peek() === '*' || peek() === '/') { const op = next().t, a = left, b = unary(); left = op === '*' ? (e) => a(e) * b(e) : (e) => a(e) / b(e); }
      return left;
    };
    const unary = () => {          // -x^2 is -(x^2), as everywhere
      if (peek() === '-') { next(); const a = unary(); return (e) => -a(e); }
      if (peek() === '+') { next(); return unary(); }
      return power();
    };
    const power = () => {          // right to left: 2^3^2 = 2^9
      const base = atom();
      if (peek() === '^') { next(); const ex = unary(); return (e) => Math.pow(base(e), ex(e)); }
      return base;
    };
    const top = wide ? either : sum;
    const closed = (what) => {
      if (peek() === what) { next(); return; }
      if (!wide && (COMPARE[peek()] || peek() === '[')) throw only(peek() === '[' ? 'rows of a column' : 'comparisons');
      throw new ExprError(what === ')' ? 'a parenthesis is not closed' : 'a bracket is not closed');
    };
    const atom = () => {
      if (++depth > 200) throw new ExprError('the expression is nested too deeply');
      const t = next();
      if (!t) throw new ExprError('the expression ends too soon');
      if (t.t === 'num') { const v = t.v; depth--; return () => v; }
      if (t.t === '(') { const inner = top(); closed(')'); depth--; return inner; }
      if (t.t === 'name') {
        if (peek() === '(') {
          next();
          const args = [];
          if (peek() !== ')') { args.push(top()); while (peek() === ',') { next(); args.push(top()); } }
          closed(')');
          depth--;
          if (wide && t.v === 'if') {                      // only the branch that is taken is computed
            if (args.length !== 3) throw new ExprError('if takes a condition, the value when it holds, the value when it does not');
            const [c, a, b] = args;
            return (e) => { const x = c(e); return isNaN(x) ? NaN : x !== 0 ? a(e) : b(e); };
          }
          if (wide && AGGREGATES[t.v] && args.length === 1) {       // of the whole column: computed once, by going through every row
            const of = AGGREGATES[t.v], inner = args[0], slot = cached++;
            return (e) => {
              if (!(slot in e.kept)) { const at = e.row, values = []; for (e.row = 0; e.row < e.n; e.row++) { const v = inner(e); if (isFinite(v)) values.push(v); } e.row = at; e.kept[slot] = of(values); }
              return e.kept[slot];
            };
          }
          const f = FUNCTIONS[t.v];
          if (!f) throw (!wide && (AGGREGATES[t.v] || t.v === 'if') ? only(t.v === 'if' ? 'conditions' : 'functions of a whole column, like ' + t.v + ',')
            : new ExprError(t.v + ' is not a known function. Known: ' + Object.keys(FUNCTIONS).concat(wide ? Object.keys(AGGREGATES).filter((k) => !FUNCTIONS[k]).concat('if') : []).sort().join(', ')));
          if (args.length !== f[1]) throw new ExprError(t.v + ' takes ' + f[1] + ' argument' + (f[1] > 1 ? 's' : '') + (wide && AGGREGATES[t.v] ? ', or one: a whole column' : ''));
          const fn = f[0];
          return args.length === 1 ? ((a) => (e) => fn(a(e)))(args[0]) : ((a, b) => (e) => fn(a(e), b(e)))(args[0], args[1]);
        }
        if (peek() === '[') {                              // another row of a column: B[i-1], B[1], B[n]
          if (!wide) throw only('rows of a column');
          next();
          const index = top(), name = note(t.v);
          closed(']');
          depth--;
          return (e) => { const k = index(e), col = e.cols[name]; return Number.isInteger(k) && k >= 1 && k <= col.length ? cell(col[k - 1]) : NaN; };
        }
        depth--;
        if (t.v in CONSTANTS) { const c = CONSTANTS[t.v]; return () => c; }
        if (FUNCTIONS[t.v]) throw new ExprError(t.v + ' is a function: write ' + t.v + '(…)');
        if (wide && WORDS.includes(t.v)) throw new ExprError('“' + t.v + '” is not expected here');
        const name = note(t.v);
        if (!wide) return (e) => e[name];
        if (name === 'i') return (e) => e.row + 1;
        if (name === 'n') return (e) => e.n;
        return (e) => cell(e.cols[name][e.row]);
      }
      throw new ExprError('“' + t.t + '” is not expected here');
    };
    const run = top();
    if (p < toks.length) {
      const t = toks[p], shown = t.v != null ? t.v : t.t;
      throw !wide && (COMPARE[t.t] || t.t === '[') ? only(t.t === '[' ? 'rows of a column' : 'comparisons') : new ExprError('“' + shown + '” is not expected here');
    }
    return { text, names, run };
  }
  /* A custom fit function, a tie: the grammar the server reads. */
  const compile = (text) => parse(text, false);
  /* The formula of a column. `run({ n, cols })` computes every row: `cols` gives the values of each column it names, `n` how many rows there are. */
  function column(text) {
    const parsed = parse(text, true);
    return { text: parsed.text, names: parsed.names,
      run(table) { const e = { row: 0, n: table.n, cols: table.cols, kept: {} }, out = new Array(table.n); for (let r = 0; r < table.n; r++) { e.row = r; out[r] = parsed.run(e); } return out; } };
  }

  ASY.expr = { compile, column, ExprError, FUNCTIONS, AGGREGATES, CONSTANTS, WORDS };
})(window.ASY);
