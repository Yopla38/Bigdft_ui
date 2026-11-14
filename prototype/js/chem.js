/* Chemistry layer of the prototype: element data and exact, procedurally built
 * sample systems. Coordinates are in angstroem; BigDFT grid quantities in bohr. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';

  const BOHR = 0.529177210903; // angstroem per bohr

  /* z: atomic number; val: valence electrons with HGH pseudopotentials;
   * rcov: covalent radius (A); rc/rf: coarse/fine localisation radii (bohr),
   * the per-species lengths multiplied by dft.rmult. Order-of-magnitude values
   * used only for the live estimate; the run reads them from the pseudopotential. */
  const EL = {
    H:  { z: 1,  val: 1, rcov: 0.31, rc: 1.46, rf: 0.20, color: 0xdfe5e8, name: 'Hydrogen' },
    B:  { z: 5,  val: 3, rcov: 0.84, rc: 1.60, rf: 0.23, color: 0xe7a39a, name: 'Boron' },
    C:  { z: 6,  val: 4, rcov: 0.76, rc: 1.58, rf: 0.23, color: 0x566067, name: 'Carbon' },
    N:  { z: 7,  val: 5, rcov: 0.71, rc: 1.37, rf: 0.21, color: 0x3f74e0, name: 'Nitrogen' },
    O:  { z: 8,  val: 6, rcov: 0.66, rc: 1.47, rf: 0.20, color: 0xe0503f, name: 'Oxygen' },
    Si: { z: 14, val: 4, rcov: 1.11, rc: 1.71, rf: 0.32, color: 0xc9a56d, name: 'Silicon' },
    P:  { z: 15, val: 5, rcov: 1.07, rc: 1.63, rf: 0.30, color: 0xe58a2b, name: 'Phosphorus' },
    S:  { z: 16, val: 6, rcov: 1.05, rc: 1.60, rf: 0.29, color: 0xe2c53a, name: 'Sulfur' },
  };

  // --- small vector helpers -------------------------------------------------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => mul(a, 1 / (len(a) || 1));

  /* Natural Extension Reference Frame: place d at distance L from c, with
   * angle(b,c,d) = theta and dihedral(a,b,c,d) = chi (degrees). */
  function nerf(a, b, c, L, theta, chi) {
    const bc = unit(sub(c, b));
    const n = unit(cross(sub(b, a), bc));
    const m = cross(n, bc);
    const t = theta * Math.PI / 180, x = chi * Math.PI / 180;
    const d = [-L * Math.cos(t), L * Math.sin(t) * Math.cos(x), L * Math.sin(t) * Math.sin(x)];
    return [0, 1, 2].map((i) => c[i] + bc[i] * d[0] + m[i] * d[1] + n[i] * d[2]);
  }
  /* Substituent opposite to the given neighbours of a centre. */
  const opposite = (centre, neighbours, L) =>
    add(centre, mul(unit(neighbours.reduce((s, p) => sub(s, unit(sub(p, centre))), [0, 0, 0])), L));

  // --- sample systems -------------------------------------------------------
  function water() {
    const a = 104.52 * Math.PI / 360, r = 0.9572;
    return {
      id: 'h2o', name: 'Water', formula: 'H₂O', bc: 'free', cell: null,
      blurb: 'One isolated molecule. Where every first session starts.',
      traits: ['molecule'],
      atoms: [
        { el: 'O', p: [0, 0, 0] },
        { el: 'H', p: [r * Math.sin(a), r * Math.cos(a), 0] },
        { el: 'H', p: [-r * Math.sin(a), r * Math.cos(a), 0] },
      ],
      orbital: { label: 'HOMO 1b₁', normal: () => [0, 0, 1], coeff: (at) => (at.el === 'O' ? 1 : 0) },
    };
  }

  function c60() {
    const phi = (1 + Math.sqrt(5)) / 2, s = 1.42 / 2, atoms = [];
    const seeds = [[0, 1, 3 * phi], [1, 2 + phi, 2 * phi], [phi, 2, 2 * phi + 1]];
    for (const v of seeds) {
      for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
        const w = [v[0] * sx, v[1] * sy, v[2] * sz];
        if ((v[0] === 0 && sx < 0)) continue;
        for (let k = 0; k < 3; k++) atoms.push({ el: 'C', p: [w[k % 3] * s, w[(k + 1) % 3] * s, w[(k + 2) % 3] * s] });
      }
    }
    return {
      id: 'c60', name: 'C₆₀ fullerene', formula: 'C₆₀', bc: 'free', cell: null,
      blurb: 'Ideal truncated icosahedron, 1.42 Å bonds. A classic of π orbitals.',
      traits: ['molecule', 'π-conjugated'],
      atoms,
      // pi-like frontier orbital: radial p functions modulated by an l=5 harmonic
      orbital: {
        label: 'HOMO (hᵤ)', normal: (at) => unit(at.p),
        coeff: (at) => { const u = unit(at.p); return u[2] * (63 * u[2] ** 4 - 70 * u[2] ** 2 + 15) / 8; },
      },
    };
  }

  function grapheneBenzene() {
    // Orthorhombic 4-atom graphene cell in the xz plane: BigDFT surface
    // boundary conditions are periodic along x and z, free along y.
    const a = 2.46, b = 4.26, nx = 5, nz = 3, atoms = [];
    const base = [[0, 0], [0, 1.42], [1.23, 2.13], [1.23, 3.55]];
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) for (const q of base) {
      atoms.push({ el: 'C', p: [q[0] + i * a, 0, q[1] + k * b], frag: 0 });
    }
    const cx = 1.23 + 2 * a, cz = 2.84 + b, h = 3.35;
    for (let i = 0; i < 6; i++) {
      const t = i * Math.PI / 3;
      atoms.push({ el: 'C', p: [cx + 1.39 * Math.cos(t), h, cz + 1.39 * Math.sin(t)], frag: 1 });
      atoms.push({ el: 'H', p: [cx + 2.48 * Math.cos(t), h, cz + 2.48 * Math.sin(t)], frag: 1 });
    }
    return {
      id: 'gr-bz', name: 'Benzene on graphene', formula: 'C₆H₆ / graphene', bc: 'surface', cell: [nx * a, null, nz * b],
      blurb: 'A surface: periodic in the xz plane, free along y. Physisorption, hence dispersion.',
      traits: ['surface', 'semimetal', 'van der Waals'],
      atoms, fragments: ['Graphene', 'Benzene'],
      orbital: {
        label: 'Benzene HOMO (e₁g)', normal: () => [0, 1, 0],
        coeff: (at) => (at.frag === 1 && at.el === 'C' ? Math.cos(Math.atan2(at.p[2] - cz, at.p[0] - cx)) : 0),
      },
    };
  }

  function silicon() {
    const a = 5.431, n = 2, atoms = [];
    const fcc = [[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0]];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) for (const f of fcc) for (const o of [0, .25]) {
      atoms.push({ el: 'Si', p: [(f[0] + o + i) * a, (f[1] + o + j) * a, (f[2] + o + k) * a] });
    }
    return {
      id: 'si64', name: 'Silicon, 64 atoms', formula: 'Si₆₄', bc: 'periodic', cell: [n * a, n * a, n * a],
      blurb: '2×2×2 diamond supercell, a = 5.431 Å. Substitute an atom to dope it.',
      traits: ['crystal', 'semiconductor'],
      atoms,
    };
  }

  function helix(nres) {
    // Idealised poly-alanine alpha helix (phi = -57, psi = -47, omega = 180).
    const atoms = [], push = (el, p, r) => { atoms.push({ el, p, frag: r }); return p; };
    let N = [0, 0, 0], CA = [1.458, 0, 0];
    let C = nerf([-0.5, 1.2, 0.3], N, CA, 1.525, 111.0, -57);
    let prevC = null;
    for (let r = 0; r < nres; r++) {
      if (r > 0) {
        N = nerf(N, CA, C, 1.329, 116.2, -47);
        const nCA = nerf(CA, C, N, 1.458, 121.7, 180);
        prevC = C; C = nerf(C, N, nCA, 1.525, 111.0, -57); CA = nCA;
      }
      push('N', N, r);
      if (prevC) push('H', opposite(N, [prevC, CA], 1.01), r);
      else { push('H', nerf(C, CA, N, 1.01, 109.5, 60), r); push('H', nerf(C, CA, N, 1.01, 109.5, -60), r); }
      push('C', CA, r);
      const bv = sub(CA, N), cv = sub(C, CA), av = cross(bv, cv);
      const CB = add(CA, add(mul(av, -0.58273431), add(mul(bv, 0.56802827), mul(cv, -0.54067466))));
      push('H', opposite(CA, [N, C, CB], 1.09), r);
      push('C', CB, r);
      for (const chi of [60, 180, 300]) push('H', nerf(N, CA, CB, 1.09, 109.5, chi), r);
      push('C', C, r);
      const nextN = nerf(N, CA, C, 1.329, 116.2, -47);
      push('O', opposite(C, [CA, nextN], 1.231), r);
      if (r === nres - 1) { push('O', nextN, r); push('H', nerf(CA, C, nextN, 0.97, 108, 180), r); }
    }
    return {
      id: 'ala20', name: '(Ala)₂₀ peptide, α helix', formula: 'C₆₀H₁₀₂N₂₀O₂₁', bc: 'free', cell: null,
      blurb: 'Idealised α helix of 20 residues. Large enough to think in fragments.',
      traits: ['biomolecule', 'hydrogen bonds', 'fragments'],
      atoms, fragments: Array.from({ length: nres }, (_, i) => 'Ala ' + (i + 1)),
    };
  }

  const builders = { h2o: water, c60, 'gr-bz': grapheneBenzene, si64: silicon, ala20: () => helix(20) };

  function build(id) {
    const sys = builders[id]();
    // centre isolated directions on the origin; periodic ones keep the cell frame
    const c = [0, 0, 0];
    for (const at of sys.atoms) for (let i = 0; i < 3; i++) c[i] += at.p[i] / sys.atoms.length;
    sys.origin = [0, 1, 2].map((i) => (sys.cell && sys.cell[i] ? sys.cell[i] / 2 : c[i]));
    for (const at of sys.atoms) at.p = sub(at.p, sys.origin);
    sys.atoms.forEach((at, i) => { at.i = i; at.src = at.el; });
    return sys;
  }

  /* Bonds from covalent radii, with minimum image in periodic directions. */
  function bonds(sys) {
    const out = [], A = sys.atoms, cell = sys.cell;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const d = sub(A[j].p, A[i].p);
      let wrapped = false;
      if (cell) for (let k = 0; k < 3; k++) if (cell[k]) {
        const s = Math.round(d[k] / cell[k]);
        if (s) { d[k] -= s * cell[k]; wrapped = true; }
      }
      const max = 1.22 * (EL[A[i].el].rcov + EL[A[j].el].rcov);
      if (dot(d, d) < max * max) out.push({ i, j, d, wrapped });
    }
    return out;
  }

  const electrons = (sys, charge) => sys.atoms.reduce((n, at) => n + EL[at.el].val, 0) - (charge || 0);

  function composition(sys) {
    const n = {};
    for (const at of sys.atoms) n[at.el] = (n[at.el] || 0) + 1;
    return n;
  }

  OND.chem = {
    BOHR, EL, build, bonds, electrons, composition,
    list: [['h2o', 'Water'], ['c60', 'C₆₀ fullerene'], ['gr-bz', 'Benzene on graphene'], ['si64', 'Crystalline silicon'], ['ala20', 'α-helix peptide']],
    vec: { sub, add, mul, dot, cross, len, unit },
  };
})(window.OND);
