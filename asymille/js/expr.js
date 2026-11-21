/* Arithmetic written by a person: the formula of a column.
 *
 *     ASY.expr.compile('A*2 + sqrt(B)')   →   { names: ['A', 'B'], run(env) }
 *
 * Read by a small parser, never by eval or Function: numbers, names, + - * / ^, parentheses and
 * the functions below. The same grammar is read on the server by asymille/expressions.py for a
 * custom fit function; tools/check_page.js compares the two on the same expressions. */
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

  function tokens(text) {
    const out = [], re = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/^(),]))/y;
    let i = 0;
    while (i < text.length) {
      if (/^\s*$/.test(text.slice(i))) break;
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m) throw new ExprError('this is not arithmetic near “' + text.slice(i, i + 12).trim() + '”');
      if (m[1] != null) { if (out.length && (out[out.length - 1].t === 'num' || out[out.length - 1].t === 'name')) throw new ExprError('write products with * (2*x, not 2 x)'); out.push({ t: 'num', v: parseFloat(m[1]) }); }
      else if (m[2] != null) { if (out.length && out[out.length - 1].t === 'num') throw new ExprError('write products with * (2*x, not 2x)'); out.push({ t: 'name', v: m[2] }); }
      else out.push({ t: m[3] === '**' ? '^' : m[3] });
      i = re.lastIndex;
    }
    return out;
  }

  function compile(text) {
    text = String(text || '').trim();
    if (!text) throw new ExprError('the expression is empty');
    if (text.length > 2000) throw new ExprError('the expression is longer than 2000 characters');
    const toks = tokens(text), names = [];
    let p = 0, depth = 0;
    const peek = () => (toks[p] || {}).t, next = () => toks[p++];
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
    const atom = () => {
      if (++depth > 200) throw new ExprError('the expression is nested too deeply');
      const t = next();
      if (!t) throw new ExprError('the expression ends too soon');
      if (t.t === 'num') { const v = t.v; depth--; return () => v; }
      if (t.t === '(') { const inner = sum(); if (peek() !== ')') throw new ExprError('a parenthesis is not closed'); next(); depth--; return inner; }
      if (t.t === 'name') {
        if (peek() === '(') {
          const f = FUNCTIONS[t.v];
          if (!f) throw new ExprError(t.v + ' is not a known function. Known: ' + Object.keys(FUNCTIONS).sort().join(', '));
          next();
          const args = [];
          if (peek() !== ')') { args.push(sum()); while (peek() === ',') { next(); args.push(sum()); } }
          if (peek() !== ')') throw new ExprError('a parenthesis is not closed');
          next();
          if (args.length !== f[1]) throw new ExprError(t.v + ' takes ' + f[1] + ' argument' + (f[1] > 1 ? 's' : ''));
          depth--;
          const fn = f[0];
          return args.length === 1 ? ((a) => (e) => fn(a(e)))(args[0]) : ((a, b) => (e) => fn(a(e), b(e)))(args[0], args[1]);
        }
        depth--;
        if (t.v in CONSTANTS) { const c = CONSTANTS[t.v]; return () => c; }
        if (FUNCTIONS[t.v]) throw new ExprError(t.v + ' is a function: write ' + t.v + '(…)');
        if (!names.includes(t.v)) names.push(t.v);
        const name = t.v;
        return (e) => e[name];
      }
      throw new ExprError('“' + t.t + '” is not expected here');
    };
    const run = sum();
    if (p < toks.length) throw new ExprError('“' + (toks[p].v != null ? toks[p].v : toks[p].t) + '” is not expected here');
    return { text, names, run };
  }

  ASY.expr = { compile, ExprError, FUNCTIONS, CONSTANTS };
})(window.ASY);
