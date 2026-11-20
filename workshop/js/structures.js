/* Structures that are not built in: an atom, an .xyz file from the disk, a molecule fetched by name.
 *
 * Whatever its origin, a structure ends as the same object the built-in systems are
 * (OND.chem): atoms in angstroem, a cell or none, an identity. The identity is a digest
 * of the content, so that a calculation is recognised by what it is computed on, not by
 * the name a file happened to have.
 *
 * No DOM, no network: the page reads the file and asks its server for the molecule; this
 * module only turns text into a structure, and a structure into what BigDFT reads. */
(function (OND) {
  'use strict';
  const C = OND.chem, EL = C.EL, BOHR = C.BOHR;
  const fnv = (text) => { let x = 0x811c9dc5; for (const byte of new TextEncoder().encode(text)) { x ^= byte; x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
  const sub = (n) => String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const known = () => Object.keys(EL).sort((a, b) => EL[a].z - EL[b].z);

  /* Hill order: carbon, hydrogen, then the others by letter; by letter alone without carbon. */
  function formula(atoms) {
    const n = {};
    for (const a of atoms) n[a.el] = (n[a.el] || 0) + 1;
    const order = Object.keys(n).sort((a, b) => (n.C ? (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)) : a.localeCompare(b)));
    return order.map((el) => el + (n[el] > 1 ? sub(n[el]) : '')).join('');
  }

  /* A structure from its atoms ({ el, p } in angstroem, in the frame they were given in). */
  function make(given) {
    const atoms = given.atoms.map((a) => ({ el: a.el, p: a.p.slice() })), cell = given.cell || null;
    const text = atoms.map((a) => a.el + a.p.map((x) => x.toFixed(4)).join(',')).join(';') + '|' + (cell ? cell.map((c) => (c ? c.toFixed(4) : '-')).join(',') : '');
    return C.finish({
      id: given.id || 'x' + fnv(text), name: given.name || formula(atoms), formula: formula(atoms),
      bc: cell ? (cell.every(Boolean) ? 'periodic' : 'surface') : 'free', cell,
      blurb: given.blurb || '', source: given.source || '', traits: [atoms.length === 1 ? 'atom' : 'molecule'], atoms,
    });
  }

  /* One isolated atom: what an atomisation energy is counted from. */
  function atom(el) {
    return make({ id: 'atom-' + el, name: EL[el].name + ' atom', atoms: [{ el, p: [0, 0, 0] }], source: 'one isolated atom',
      blurb: 'One isolated atom' + (EL[el].unp ? ', with ' + EL[el].unp + ' unpaired electron' + (EL[el].unp > 1 ? 's' : '') + ' in its ground state.' : ', closed shell.') });
  }
  const isAtom = (sys, el) => sys.atoms.length === 1 && (!el || sys.atoms[0].el === el);

  /* An .xyz file, as a chemist's tool writes it or as BigDFT does.

       3                      3 angstroem             2 atomic
       a comment              free                    periodic 10.2 10.2 10.2
       O 0.0 0.0 0.0          O 0.0 0.0 0.0           Si 0.0 0.0 0.0
       ...

     A plain .xyz has no unit: by its own convention it is in angstroem, and it is read so
     here. BigDFT given the same file would read bohr, silently, and compute another
     molecule; the workshop always writes the unit, so what is shown is what is computed. */
  function parseXyz(text, name, source) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    while (lines.length && !lines[0].trim()) lines.shift();
    const head = (lines[0] || '').trim().split(/\s+/), n = Number(head[0]);
    if (!Number.isInteger(n) || n < 1) throw new Error('not an .xyz file: its first line must be the number of atoms');
    if (n > 5000) throw new Error(n + ' atoms: more than the workshop shows');
    const unit = (head[1] || '').toLowerCase();
    if (unit.startsWith('reduced')) throw new Error('reduced coordinates are not read: give positions in angstroem or bohr');
    const scale = /^(atomic|bohr)/.test(unit) ? BOHR : 1;
    const second = (lines[1] || '').trim().split(/\s+/), bc = second[0].toLowerCase();
    let cell = null;
    if (bc === 'periodic' || bc === 'surface') {
      const box = second.slice(1, 4).map((x) => Number(String(x).replace(/d/i, 'e')) * scale);
      if (box.length < 3 || box.some((x) => !Number.isFinite(x))) throw new Error('the second line says “' + bc + '” without the three lengths of the cell');
      cell = bc === 'periodic' ? box : [box[0], null, box[2]];
    } else if (bc === 'wire') throw new Error('wire boundary conditions are not read');
    const atoms = [];
    for (const line of lines.slice(2)) {
      if (atoms.length === n) break;
      const t = line.trim().split(/\s+/);
      if (!t[0]) continue;
      const m = /^([A-Za-z]{1,2})/.exec(t[0]), el = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '';
      const p = t.slice(1, 4).map((x) => Number(String(x).replace(/d/i, 'e')) * scale);
      if (p.length < 3 || p.some((x) => !Number.isFinite(x))) throw new Error('line ' + (atoms.length + 3) + ' is not “element x y z”: ' + line.trim().slice(0, 40));
      if (!EL[el]) throw new Error('the element “' + t[0] + '” is not known to the workshop yet (known: ' + known().join(', ') + ')');
      atoms.push({ el, p });
    }
    if (atoms.length < n) throw new Error('the file announces ' + n + ' atoms and holds ' + atoms.length);
    const label = String(name || '').replace(/\.xyz$/i, '').replace(/[_-]+/g, ' ').trim();
    return make({ name: label ? label[0].toUpperCase() + label.slice(1) : '', atoms, cell, source: source || '', blurb: source || '' });
  }

  /* What BigDFT reads: positions in angstroem, in the frame the structure was given in, and its cell. */
  function posinp(sys) {
    const out = { units: 'angstroem', positions: sys.atoms.map((a) => ({ [a.el]: a.p.map((x, d) => Number((x + sys.origin[d]).toFixed(4))) })) };
    if (sys.cell) out.cell = sys.cell.map((c) => (c ? Number(c.toFixed(4)) : '.inf'));
    return out;
  }

  OND.structures = { make, atom, isAtom, parseXyz, posinp, formula, known };
})(window.OND);
