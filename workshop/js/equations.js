/* What a step computes, written as an equation.
 *
 * A calculation solves the Kohn-Sham equations: they are written with the settings the step is
 * run with (its functional, its charge and spin, its grid, a solvent, a relaxation). A difference,
 * a combination and a series each compute something from the energies of other steps: the terms
 * are the links of the step, each energy is named by what it is the energy of (the structure, its
 * charge), and the numbers of the second line are the energies the model holds, nothing else.
 * Change a setting or a term and the equation changes; a result that is not computed leaves the
 * equation without numbers.
 *
 * No DOM and no MathJax here: this returns text. For a step,
 *
 *   definition   the equation alone                    tex   the same, with the energies and the value once computed
 *   short        its right-hand side (a box of the graph)       plain   the definition in ordinary characters
 *   name         what the left-hand side is, in words, or ''          head   the title of the block, when it has its own
 *   where        what each symbol stands for: { tex, plain, text }; `computed` marks one that only `tex` uses
 *
 * The page typesets the TeX and shows `plain` when it cannot. */
(function (OND) {
  'use strict';
  const M = OND.model;
  const DIGITS = '₀₁₂₃₄₅₆₇₈₉', UP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const UNIT = { eV: '\\mathrm{eV}', 'kJ/mol': '\\mathrm{kJ\\,mol^{-1}}', Ha: '\\mathrm{Ha}' };
  /* The letter a varied setting is written with; anything else is x, and the legend says what x is. */
  const LETTER = { hgrid: 'h' };
  const NAME = { hgrid: 'grid spacing', crmult: 'coarse extent', frmult: 'fine extent', gnrm: 'convergence criterion', xc: 'functional', charge: 'charge', mpol: 'unpaired electrons', tel: 'electronic temperature' };
  const trim = (x) => String(+Number(x).toPrecision(6));
  /* A title inside \text{}: what TeX or MathJax would read as a command is left out. */
  const text = (s) => '\\text{' + String(s).replace(/[\\{}$%#&^~]/g, '').replace(/_/g, ' ') + '}';

  /* Charge and spin multiplicity of a calculation, as the model resolves them. */
  function electrons(step) { const [charge, nspin, mpol] = M.electronsOf(step).split(',').map(Number); return { charge, mult: nspin === 1 ? 1 : mpol + 1 }; }
  /* The geometry an energy is taken at: the end of its own relaxation, the relaxation it starts from, or the structure as given. */
  const geometry = (step) => (step.kind === 'relax' ? step.id : (M.geometryFrom(step) || { id: 'given' }).id);

  function species(sys, charge, mult) {
    const n = Math.abs(charge), q = charge ? (n > 1 ? n : '') + (charge > 0 ? '+' : '-') : '';
    const body = sys.formula.replace(/[\\{}$%#&^~_]/g, '').replace(/[₀-₉]+/g, (run) => '_{' + [...run].map((d) => DIGITS.indexOf(d)).join('') + '}');
    return {
      tex: (mult ? '{}^{' + mult + '}' : '') + '\\mathrm{' + body + (q ? '^{' + q + '}' : '') + '}',
      plain: (mult ? UP[mult] || '' : '') + sys.formula + (charge ? (n > 1 ? UP[n] || n : '') + (charge > 0 ? '⁺' : '⁻') : ''),
    };
  }

  /* How the energy of each step is written, so that two steps of one equation never share a symbol:
     E(H2O+) when the structure and the charge tell them apart, with the multiplicity when that does,
     and with the title of the step when nothing else does. `bare` leaves charge and spin out: a series
     that varies them cannot name one. */
  function symbols(steps, bare) {
    const all = [...new Set(steps.filter(Boolean))].map((step) => Object.assign({ step, sys: M.sysOf(step) }, electrons(step)));
    const base = (i) => i.sys.id + '|' + (bare ? '' : i.charge);
    const out = new Map();
    for (const i of all) {
      const twins = all.filter((j) => base(j) === base(i));
      const bySpin = !bare && twins.length > 1 && new Set(twins.map((j) => j.mult)).size === twins.length;
      const byTitle = twins.length > 1 && !bySpin;
      const sp = species(i.sys, bare ? 0 : i.charge, bySpin ? i.mult : 0);
      out.set(i.step, {
        step: i.step,
        tex: (arg) => 'E' + (byTitle ? '_{' + text(i.step.title) + '}' : '') + '(' + sp.tex + (arg ? ';' + arg : '') + ')',
        plain: (arg) => 'E(' + sp.plain + (byTitle ? ', “' + i.step.title + '”' : '') + (arg ? '; ' + arg : '') + ')',
      });
    }
    return out;
  }

  /* c1 E(a) + c2 E(b) − E(c): `write` gives each term its text, `times` the sign between a coefficient and it. */
  function sum(terms, write, times, minus) {
    return terms.map((t, i) => (t.c < 0 ? (i ? ' ' + minus + ' ' : minus) : i ? ' + ' : '') + (Math.abs(t.c) === 1 ? '' : trim(Math.abs(t.c)) + times) + write(t)).join('');
  }

  /* What the left-hand side is called, when the terms say it. Each name is a definition, not a guess:
     the energy of the cation minus the neutral on one structure is an ionisation energy, vertical when
     both are taken at one geometry and adiabatic when each is relaxed. Anything else is ΔE. */
  function called(step, terms) {
    const plainDelta = { tex: '\\Delta E', plain: 'ΔE', name: '' };
    if (step.kind === 'combination') {
      const of = terms.filter((t) => t.c === -1 && M.sysOf(t.step).atoms.length > 1);
      if (of.length !== 1) return plainDelta;
      const elements = Object.keys(OND.chem.composition(M.sysOf(of[0].step))), wanted = M.atomisationTerms(of[0].step);
      const same = elements.every(M.atomCalc) && wanted.length === terms.length && wanted.every((w) => terms.some((t) => t.step === w.step && t.c === w.c));
      return same ? { tex: 'E_{\\mathrm{at}}', plain: 'E_at', name: 'atomisation energy' } : plainDelta;
    }
    const a = terms[0].step, b = terms[1].step, ea = electrons(a), eb = electrons(b);
    if (M.sysOf(a) !== M.sysOf(b)) return plainDelta;
    const kind = ea.charge === eb.charge + 1 ? ['I', 'ionisation energy'] : ea.charge === eb.charge && ea.mult === 3 && eb.mult === 1 ? ['T', 'triplet energy'] : null;
    if (!kind) return plainDelta;
    const how = geometry(a) === geometry(b) ? ['vert', 'vertical '] : a.kind === 'relax' && b.kind === 'relax' ? ['adia', 'adiabatic '] : null;
    return { tex: 'E_{\\mathrm{' + kind[0] + '}}' + (how ? '^{\\mathrm{' + how[0] + '}}' : ''), plain: 'E_' + kind[0] + (how ? ' (' + how[0] + ')' : ''), name: (how ? how[1] : '') + kind[1] };
  }

  /* A difference or a combination: the definition, then the energies it is computed from, then its value. */
  function ofSum(step) {
    const terms = step.kind === 'difference' ? [{ c: 1, step: M.byId(step.links.a) }, { c: -1, step: M.byId(step.links.b) }] : M.termsOf(step);
    if (!terms.length || terms.some((t) => !t.step)) return null;
    const sym = symbols(terms.map((t) => t.step)), left = called(step, terms);
    const short = sum(terms, (t) => sym.get(t.step).tex(), '\\,', '-');
    const lines = [left.tex + ' &= ' + short], definition = left.tex + ' = ' + short;
    const d = step.kind === 'difference' ? M.difference(step) : M.combination(step);
    if (d) {
      const energy = (t, i) => { const e = M.energy(t.step).toFixed(6); return e.startsWith('-') && (i || Math.abs(t.c) !== 1) ? '(' + e + ')' : e; };
      const hartree = terms.reduce((total, t) => total + t.c * M.energy(t.step), 0);
      lines.push('&= ' + terms.map((t, i) => (t.c < 0 ? (i ? ' - ' : '-') : i ? ' + ' : '') + (Math.abs(t.c) === 1 ? '' : trim(Math.abs(t.c)) + '\\times') + energy(t, i)).join('') + '\\ ' + UNIT.Ha);
      lines.push('&= ' + hartree.toFixed(6) + '\\ ' + UNIT.Ha + (d.unit === 'Ha' ? '' : ' = ' + d.value.toFixed(3) + '\\ ' + UNIT[d.unit]));
    }
    return {
      name: left.name, short, definition, computed: !!d,
      tex: lines.length > 1 ? '\\begin{aligned}' + lines.join('\\\\[3pt]') + '\\end{aligned}' : definition,
      plain: left.plain + ' = ' + sum(terms, (t) => sym.get(t.step).plain(), ' × ', '−'),
      where: [...sym.values()].map((s) => ({ tex: s.tex(), plain: s.plain(), text: 'from “' + s.step.title + '”' })),
    };
  }

  /* A series: the quantity followed along the values, and for a convergence the criterion it is judged with. */
  function ofSeries(step) {
    const of = M.byId(step.links.of), rel = M.byId(step.links.relative_to);
    if (!of) return null;
    const key = M.settingVaried(step), x = LETTER[key] || 'x', electronic = key === 'charge' || key === 'mpol';
    const sym = symbols([of, rel], electronic), values = step.params.values;
    const natoms = M.sysOf(of).atoms.length, perAtom = !rel && !!step.params.per_atom;
    const at = (v) => (rel ? '\\Delta E(' + v + ')' : sym.get(of).tex(v)), said = (v) => (rel ? 'ΔE(' + v + ')' : sym.get(of).plain(v));
    const lines = [], plain = [];
    const where = [...sym.values()].map((s) => ({ tex: s.tex(x), plain: s.plain(x), text: 'from “' + s.step.title + '”, at each value' }));
    where.push({ tex: x, plain: x, text: 'the ' + (NAME[key] || key || 'setting varied') + ': ' + values.join(', ') });
    if (rel) { lines.push('\\Delta E(' + x + ') = ' + sym.get(of).tex(x) + ' - ' + sym.get(rel).tex(x)); plain.push('ΔE(' + x + ') = ' + sym.get(of).plain(x) + ' − ' + sym.get(rel).plain(x)); }
    if (step.kind === 'converge') {
      const gap = '\\lvert ' + at(x) + ' - ' + at(x + '_{\\mathrm{ref}}') + '\\rvert';
      lines.push((perAtom ? '\\frac{' + gap + '}{N_{\\mathrm{at}}}' : gap) + ' \\le ' + trim(step.params.within * 1000) + '\\ \\mathrm{meV}');
      plain.push('|' + said(x) + ' − ' + said(x + ' ref') + '|' + (perAtom ? ' / N_at' : '') + ' ≤ ' + trim(step.params.within * 1000) + ' meV');
      where.push({ tex: x + '_{\\mathrm{ref}} = ' + values[values.length - 1], plain: x + ' ref = ' + values[values.length - 1], text: 'the last value, taken as the reference' });
    } else if (!rel) { lines.push(perAtom ? '\\frac{' + at(x) + '}{N_{\\mathrm{at}}}' : at(x)); plain.push(said(x) + (perAtom ? ' / N_at' : '')); }
    if (perAtom) where.push({ tex: 'N_{\\mathrm{at}} = ' + natoms, plain: 'N_at = ' + natoms, text: 'the atoms of the structure' });
    const tex = lines.length > 1 ? '\\begin{aligned}&' + lines.join('\\\\[3pt]&') + '\\end{aligned}' : lines[0];
    return {
      name: '', short: rel ? sym.get(of).tex(x) + ' - ' + sym.get(rel).tex(x) : lines[lines.length - 1], definition: tex, computed: false,
      tex, plain: plain.join('   ·   '), where,
    };
  }

  /* A calculation: the equations BigDFT solves for it, written with the settings the step is run with. The
     functional names the exchange-correlation term, the charge and the unpaired electrons are the numbers
     the density is held to, a solvent, a dispersion correction and a relaxation each add their line, and the
     size of the basis is the one its log reports once it is computed. */
  const HYBRID = { PBE0: '25 % of exact exchange, computed from the orbitals, with PBE for the rest', B3LYP: '20 % of exact exchange, computed from the orbitals, with B88, LYP and LDA for the rest' };
  const SOLVENT = { water: 'water', ethanol: 'ethanol', mesitylene: 'mesitylene' };
  function ofCalculation(step) {
    const v = M.valuesOf(step), sys = M.sysOf(step), spin = v.nspin !== 1, hf = v.xc === 'HF', hybrid = !!HYBRID[v.xc];
    const n = OND.chem.electrons(sys, v.charge), natoms = sys.atoms.length, atoms = natoms > 1 ? 'the ' + natoms + ' atoms' : 'the atom';
    const s = spin ? '\\sigma' : '', i = 'i' + s, ps = spin ? 'σ' : '';
    const xc = hf ? '\\hat V_{x' + (spin ? ',\\sigma' : '') + '}^{\\mathrm{HF}}' : hybrid ? '\\hat V_{xc' + (spin ? ',\\sigma' : '') + '}^{\\mathrm{' + v.xc + '}}'
      : 'V_{xc' + (spin ? ',\\sigma' : '') + '}^{\\mathrm{' + v.xc + '}}[' + (spin ? '\\rho_\\uparrow,\\rho_\\downarrow' : '\\rho') + ']';
    const xcPlain = hf ? 'Vx(HF)' : 'Vxc(' + v.xc + ')' + (hybrid ? '' : spin ? '[ρ↑,ρ↓]' : '[ρ]');
    const lines = [], plain = [], where = [];
    lines.push('\\Big[-\\tfrac12\\nabla^2+V_{\\mathrm H}[\\rho]+' + xc + '+V_{\\mathrm{ext}}\\Big]\\Psi_{' + i + '}=\\varepsilon_{' + i + '}\\,\\Psi_{' + i + '}');
    plain.push('[−½∇² + V_H[ρ] + ' + xcPlain + ' + V_ext] Ψi' + ps + ' = εi' + ps + ' Ψi' + ps);
    if (spin) {
      lines.push('\\rho_\\sigma(\\mathbf r)=\\sum_i f_{i\\sigma}\\,\\lvert\\Psi_{i\\sigma}(\\mathbf r)\\rvert^2,\\qquad \\rho=\\rho_\\uparrow+\\rho_\\downarrow');
      lines.push('\\int\\!\\rho\\,\\mathrm d\\mathbf r=' + n + ',\\qquad \\int\\!(\\rho_\\uparrow-\\rho_\\downarrow)\\,\\mathrm d\\mathbf r=' + v.mpol);
      plain.push('ρσ = Σi fiσ |Ψiσ|²,  ρ = ρ↑ + ρ↓', '∫ρ = ' + n + ',  ∫(ρ↑ − ρ↓) = ' + v.mpol);
    } else {
      lines.push('\\rho(\\mathbf r)=\\sum_i f_i\\,\\lvert\\Psi_i(\\mathbf r)\\rvert^2,\\qquad \\int\\!\\rho\\,\\mathrm d\\mathbf r=' + n);
      plain.push('ρ = Σi fi |Ψi|²,  ∫ρ = ' + n);
    }
    where.push({ tex: '\\Psi_{' + i + '},\\ \\varepsilon_{' + i + '}', plain: 'Ψi' + ps + ', εi' + ps, text: 'the orbitals and their energies' + (spin ? ', for each spin σ' : '') + '; the equation is solved with the density until both agree'
      + (sys.bc !== 'free' && v.kpt > 1 ? ', on a Monkhorst-Pack mesh of ' + v.kpt + ' points along each periodic direction' : '') });
    where.push({ tex: xc, plain: xcPlain, text: hf ? 'exact exchange, computed from the orbitals (Hartree-Fock): no correlation' : hybrid ? 'the ' + v.xc + ' hybrid functional: ' + HYBRID[v.xc] : 'the ' + v.xc + ' functional' });
    where.push({ tex: 'V_{\\mathrm{ext}}', plain: 'V_ext', text: 'the HGH pseudopotentials of ' + atoms + (v.efield ? ', and an electric field of ' + trim(v.efield) + ' Ha/bohr along y' : '') });
    where.push({ tex: '\\int\\!\\rho\\,\\mathrm d\\mathbf r=' + n, plain: '∫ρ = ' + n, text: 'the valence electrons of ' + species(sys, v.charge, 0).plain + (v.charge ? ' (charge ' + (v.charge > 0 ? '+' : '−') + Math.abs(v.charge) + ')' : '')
      + (spin ? ', ' + v.mpol + ' of them unpaired' : '') + '; f are the occupations' });
    if (v.solvent && v.solvent !== 'none') {
      lines.push('\\nabla\\!\\cdot\\!\\big[\\epsilon(\\mathbf r)\\,\\nabla\\Phi(\\mathbf r)\\big]=-4\\pi\\rho(\\mathbf r)'); plain.push('∇·[ε(r) ∇Φ(r)] = −4π ρ(r)');
      where.push({ tex: '\\epsilon(\\mathbf r)', plain: 'ε(r)', text: 'the permittivity of the implicit solvent, ' + (SOLVENT[v.solvent] || v.solvent) + ', outside a soft-sphere cavity around ' + atoms + '; Φ is the electrostatic potential' });
    }
    if (v.algo === 'linear') {
      lines.push('\\rho(\\mathbf r,\\mathbf r\')=\\sum_{\\alpha,\\beta}\\phi_\\alpha(\\mathbf r)\\,K^{\\alpha\\beta}\\,\\phi_\\beta(\\mathbf r\')'); plain.push('ρ(r,r′) = Σαβ φα(r) Kαβ φβ(r′)');
      where.push({ tex: '\\phi_\\alpha,\\ K^{\\alpha\\beta}', plain: 'φα, Kαβ', text: 'linear-scaling mode: localised support functions and the density kernel' });
    }
    if (v.dispersion) {
      lines.push('E=E_{\\mathrm{KS}}[\\rho]+E_{\\mathrm{D3}}(\\{\\mathbf R_I\\})'); plain.push('E = E_KS[ρ] + E_D3({R_I})');
      where.push({ tex: 'E_{\\mathrm{D3}}', plain: 'E_D3', text: 'Grimme’s D3 dispersion correction, from the positions of the atoms' });
    }
    lines.push('\\Psi(\\mathbf r)=\\sum_{\\mathbf j}s_{\\mathbf j}\\,\\phi_{\\mathbf j}(\\mathbf r)+\\sum_{\\mathbf j}\\sum_{\\nu=1}^{7}d^{(\\nu)}_{\\mathbf j}\\,\\psi^{(\\nu)}_{\\mathbf j}(\\mathbf r)');
    plain.push('Ψ(r) = Σj sj φj(r) + Σj Σν=1..7 dj(ν) ψj(ν)(r)');
    const afterBasis = lines.length;
    where.push({ tex: '\\phi_{\\mathbf j},\\ \\psi^{(\\nu)}_{\\mathbf j}', plain: 'φj, ψj(ν)', text: 'the basis: a Daubechies scaling function on every point j of a grid of spacing ' + trim(v.hgrid) + ' bohr, and 7 wavelets on every point of its fine region' });
    if (step.kind === 'relax') {
      lines.push('\\mathbf F_I=-\\frac{\\partial E}{\\partial \\mathbf R_I}', '\\max_I\\,\\lvert\\mathbf F_I\\rvert\\le ' + trim(step.params.forcemax) + '\\ \\mathrm{Ha/bohr}');
      plain.push('F_I = −∂E/∂R_I', 'max |F_I| ≤ ' + trim(step.params.forcemax) + ' Ha/bohr');
      where.push({ tex: '\\mathbf R_I,\\ \\mathbf F_I', plain: 'R_I, F_I', text: 'the positions of ' + atoms + ' and the forces on them: the atoms are moved (' + step.params.method + ') until the largest force passes the criterion' });
    }
    const wrap = (all) => '\\begin{aligned}&' + all.join('\\\\[5pt]&') + '\\end{aligned}';
    const definition = wrap(lines), run = M.status(step).state === 'done' ? M.runOf(step).run : null, counted = !!run && Number.isFinite(run.nc) && Number.isFinite(run.nf);
    const size = counted ? 'N_{\\mathrm{dof}}=N_c+7N_f=' + run.nc + '+7\\times' + run.nf + '=' + (run.nc + 7 * run.nf) : '';
    return {
      name: '', head: hf ? 'What BigDFT solves for this step: the Hartree-Fock equations' : 'What BigDFT solves for this step: the Kohn-Sham equations', short: null, definition, computed: counted,
      tex: counted ? wrap(lines.slice(0, afterBasis).concat([size], lines.slice(afterBasis))) : definition, plain: plain.join('   ·   '),
      where: counted ? where.concat([{ tex: 'N_c,\\ N_f', plain: 'N_c, N_f', text: 'the points of the grid and of its fine region in this run, read from its log: N_dof coefficients for each orbital', computed: true }]) : where,
    };
  }

  /* null for a step that computes nothing (a structure, a decision, a target, the levels read from a log). */
  function of(step) {
    if (!step) return null;
    if (M.isCalc(step)) return ofCalculation(step);
    if (step.kind === 'difference' || step.kind === 'combination') return ofSum(step);
    if (M.isSeries(step)) return ofSeries(step);
    return null;
  }

  OND.equations = { of };
})(window.OND);
