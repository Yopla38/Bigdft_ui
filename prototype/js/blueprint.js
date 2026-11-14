/* The blueprint: one simulation described as seven blocks. This module owns the
 * parameter values and their provenance, the adaptive defaults ("conseiller"),
 * the readiness checks, the cost estimate and the compilation to BigDFT's
 * native YAML input and to a PyBigDFT script. */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  const { EL, BOHR } = OND.chem;

  // --- two-level wavelet grid ------------------------------------------------
  /* classifier(sys, crmult, frmult)(x, y, z) -> 0 outside, 1 coarse, 2 fine.
   * Free directions: a point is coarse within crmult*rc of an atom, fine within
   * frmult*rf. Periodic directions are entirely covered by the coarse grid. */
  function classifier(sys, crmult, frmult) {
    const img = OND.stageUtil.withImages(sys, 12);
    let reach = 0;
    const pts = img.map((s) => {
      const e = EL[s.at.el], rc = e.rc * crmult * BOHR, rf = e.rf * frmult * BOHR;
      reach = Math.max(reach, rc);
      return { p: s.p, rc2: rc * rc, rf2: rf * rf, rc };
    });
    const size = Math.max(reach, 1), buckets = new Map();
    const key = (i, j, k) => i + 4096 * (j + 4096 * k);
    for (const a of pts) {
      const k = key(Math.floor(a.p[0] / size) + 2048, Math.floor(a.p[1] / size) + 2048, Math.floor(a.p[2] / size) + 2048);
      (buckets.get(k) || buckets.set(k, []).get(k)).push(a);
    }
    const per = [0, 1, 2].map((d) => !!(sys.cell && sys.cell[d]));
    const box = { lo: [0, 0, 0], hi: [0, 0, 0] };
    for (let d = 0; d < 3; d++) {
      if (per[d]) { box.lo[d] = -sys.cell[d] / 2; box.hi[d] = sys.cell[d] / 2; continue; }
      box.lo[d] = Math.min(...sys.atoms.map((a) => a.p[d] - EL[a.el].rc * crmult * BOHR));
      box.hi[d] = Math.max(...sys.atoms.map((a) => a.p[d] + EL[a.el].rc * crmult * BOHR));
    }
    const anyPer = per.some(Boolean);
    const fn = function (x, y, z) {
      const q = [x, y, z];
      for (let d = 0; d < 3; d++) if (q[d] < box.lo[d] || q[d] > box.hi[d]) return 0;
      let level = anyPer ? 1 : 0;
      const bi = Math.floor(x / size) + 2048, bj = Math.floor(y / size) + 2048, bk = Math.floor(z / size) + 2048;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const list = buckets.get(key(bi + i, bj + j, bk + k));
        if (!list) continue;
        for (const a of list) {
          const d2 = (x - a.p[0]) ** 2 + (y - a.p[1]) ** 2 + (z - a.p[2]) ** 2;
          if (d2 < a.rf2) return 2;
          if (d2 < a.rc2) level = 1;
        }
      }
      return level;
    };
    fn.box = box;
    return fn;
  }

  /* Volumes (bohr^3) of the coarse and fine regions, by sampling. */
  function volumes(sys, crmult, frmult) {
    const c = classifier(sys, crmult, frmult), { lo, hi } = c.box;
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const s = Math.max(0.22, span / 90);
    let nc = 0, nf = 0;
    for (let x = lo[0] + s / 2; x < hi[0]; x += s) for (let y = lo[1] + s / 2; y < hi[1]; y += s) for (let z = lo[2] + s / 2; z < hi[2]; z += s) {
      const v = c(x, y, z);
      if (v) nc++;
      if (v === 2) nf++;
    }
    const cell = (s / BOHR) ** 3;
    return { coarse: nc * cell, fine: nf * cell };
  }

  // --- parameters ------------------------------------------------------------
  /* key: [BigDFT default, schema path, block] */
  const PARAMS = {
    xc: ['LDA', 'dft.ixc', 'theory'], nspin: [1, 'dft.nspin', 'theory'], mpol: [0, 'dft.mpol', 'theory'],
    charge: [0, 'dft.qcharge', 'theory'], dispersion: [false, 'dft.dispersion', 'theory'],
    hgrid: [0.45, 'dft.hgrids', 'accuracy'], crmult: [5, 'dft.rmult', 'accuracy'], frmult: [8, 'dft.rmult', 'accuracy'],
    gnrm: [1e-4, 'dft.gnrm_cv', 'accuracy'], algo: ['cubic', 'dft.inputpsiid', 'accuracy'],
    kpt: [1, 'kpt.ngkpt', 'environment'], solvent: ['none', 'psolver.environment.cavity', 'environment'],
    efield: [0, 'dft.elecfield', 'environment'], scf: ['dirmin', 'mix.iscf', 'environment'], tel: [0, 'mix.tel', 'environment'],
    action: ['sp', 'geopt.method', 'task'], geoptMethod: ['FIRE', 'geopt.method', 'task'],
    geoptSteps: [50, 'geopt.ncount_cluster_x', 'task'], forcemax: [0, 'geopt.forcemax', 'task'],
    biomode: [false, 'geopt.biomode', 'task'], mdSteps: [200, 'md.mdsteps', 'task'],
    mdT: [300, 'md.temperature', 'task'], mdDt: [20, 'md.timestep', 'task'],
    thermostat: ['none', 'md.thermostat', 'task'], nimg: [15, 'geopt.nimg', 'task'],
    tddft: ['TDA', 'tddft.tddft_approach', 'task'], nvirt: [8, 'dft.nvirt', 'task'],
    density: [false, 'dft.output_denspot', 'observables'], nplot: [0, 'dft.nplot', 'observables'], dos: [true, null, 'observables'],
    dipole: [false, 'lin_general.calc_dipole', 'observables'], charges: [false, 'lin_general.charge_multipoles', 'observables'],
    target: ['cpu', 'perf.accel', 'machine'], mpi: [4, null, 'machine'], omp: [2, null, 'machine'],
  };

  const TARGETS = {
    cpu: { label: 'CPU container', detail: 'PyBigDFT, pinned image', rate: 1, speed: 1 },
    gpu: { label: 'GPU node', detail: 'CUDA, accelerated exact exchange', rate: 6, speed: 5 },
    hpc: { label: 'HPC partition', detail: 'through remotemanager', rate: 0.6, speed: 1 },
  };

  function Blueprint() {
    const st = { v: {}, src: {}, why: {}, expert: {}, sys: null, advice: [], vol: null };
    for (const k in PARAMS) { st.v[k] = PARAMS[k][0]; st.src[k] = 'default'; }
    const listeners = [];
    const self = { st, PARAMS, TARGETS };

    self.on = (fn) => listeners.push(fn);
    const emit = (what) => listeners.forEach((fn) => fn(what));

    self.setSystem = function (sys) { st.sys = sys; st.vol = null; advise(); emit('system'); };
    self.touchSystem = function () { st.vol = null; advise(); emit('system'); };
    self.set = function (key, value, src) {
      st.v[key] = value; st.src[key] = src || 'you'; delete st.why[key];
      if (key === 'crmult' || key === 'frmult') st.vol = null;
      advise(); emit(key);
    };
    self.clear = function () {
      for (const k in PARAMS) { st.v[k] = PARAMS[k][0]; st.src[k] = 'default'; }
      st.why = {}; st.expert = {};
    };
    self.reset = function (key) { st.src[key] = 'default'; st.v[key] = PARAMS[key][0]; advise(); emit(key); };
    self.setExpert = function (path, value) { if (value === '' || value == null) delete st.expert[path]; else st.expert[path] = value; emit('expert'); };
    self.snapshot = () => JSON.parse(JSON.stringify({ v: st.v, src: st.src, why: st.why, expert: st.expert }));
    self.restore = function (snap) { Object.assign(st, JSON.parse(JSON.stringify(snap))); advise(); emit('restore'); };

    // --- adaptive defaults ---------------------------------------------------
    /* Each rule yields [key, value, reason, triplet]. In production the rules
     * are facts of an AOM memory (triplets with their source passage); here
     * they are spelled out so the mock-up behaves like the real thing. */
    function rules() {
      const sys = st.sys, v = st.v, out = [], has = (t) => sys.traits.includes(t), comp = OND.chem.composition(sys);
      const n = sys.atoms.length, ne = OND.chem.electrons(sys, v.charge);
      out.push(['xc', 'PBE', 'PBE is the usual trade-off between cost and reliability for structures and energies.', ['Structure and energy', 'recommendedFunctional', 'PBE']]);
      if (ne % 2) {
        out.push(['nspin', 2, ne + ' electrons: an odd count requires a spin-polarised treatment.', ['Odd electron count', 'requires', 'Collinear spin']]);
        out.push(['mpol', 1, 'Magnetic moment with the parity of the electron count.', ['Collinear spin', 'initialMoment', '1 µB']]);
      }
      if (comp.O || comp.N) out.push(['hgrid', 0.4, 'Oxygen and nitrogen have harder pseudopotentials: a finer grid describes them properly.', ['Hard pseudopotential (N, O)', 'recommendedGridSpacing', '0.40 bohr']]);
      if (v.charge < 0) out.push(['crmult', 7, 'An anion has a more diffuse density: the coarse region must reach further.', ['Anion', 'extendsRegion', 'crmult = 7']]);
      if (sys.bc !== 'free') {
        const L = Math.min(...sys.cell.filter(Boolean));
        if (v.algo === 'linear') out.push(['kpt', 1, 'Linear-scaling mode works at the Γ point: the cell itself must be large enough.', ['Linear scaling', 'sampledAt', 'Γ point only']]);
        else out.push(['kpt', Math.max(1, Math.ceil(20 / L)), L.toFixed(1) + ' Å cell: the Brillouin zone must be sampled along the periodic directions.', ['Periodic system', 'sampledBy', 'Monkhorst-Pack mesh']]);
      }
      if (has('semimetal')) {
        out.push(['scf', 'mixing', 'Without a gap, direct minimisation converges poorly: density mixing and empty states.', ['Gapless system', 'requires', 'mixing profile']]);
        out.push(['tel', 0.01, 'Electronic temperature of the BigDFT mixing profile.', ['mixing profile', 'electronicTemperature', '0.01 Ha']]);
      }
      if ((has('van der Waals') || has('hydrogen bonds')) && sys.bc === 'free') out.push(['dispersion', true, 'The non-covalent interactions of this system call for a dispersion correction.', ['Non-covalent interaction', 'requires', 'Grimme D3 correction']]);
      if (n > 150 || has('fragments')) out.push(['algo', 'linear', n + ' atoms: linear-scaling mode describes the system with localised support functions and opens fragment analysis.', ['Large system', 'recommendedAlgorithm', 'Linear scaling']]);
      if (has('biomolecule')) {
        out.push(['solvent', 'water', 'A biomolecule is described in its environment: implicit solvent, soft-sphere cavity.', ['Biomolecule', 'recommendedEnvironment', 'Implicit water']]);
        if (v.action === 'geopt') {
          out.push(['geoptMethod', 'SQNM', 'SQNM has a mode dedicated to biomolecules.', ['Biomolecule', 'recommendedOptimiser', 'SQNM']]);
          out.push(['biomode', true, 'Enables the separate treatment of stretching modes.', ['SQNM', 'option', 'biomode']]);
        }
      }
      if (['PBE0', 'B3LYP', 'HF'].includes(v.xc)) out.push(['target', 'gpu', 'Exact exchange dominates the cost: it is GPU-accelerated.', ['Hybrid functional', 'recommendedHardware', 'GPU']]);
      if (n > 100 || (sys.bc !== 'free' && v.kpt > 1)) { out.push(['mpi', 16, 'System size: more MPI processes.', ['Large system', 'recommendedResource', '16 processes']]); }
      return out;
    }

    /* A choice that is safer than the advice (finer grid, larger region) needs no notice. */
    const stricter = (key, mine, advised) => (key === 'hgrid' && mine < advised) || ((key === 'crmult' || key === 'frmult' || key === 'kpt') && mine > advised);

    function advise() {
      if (!st.sys) return;
      for (const k in st.src) if (st.src[k] === 'adapted') { st.v[k] = PARAMS[k][0]; st.src[k] = 'default'; delete st.why[k]; }
      st.advice = [];
      for (let pass = 0; pass < 2; pass++) {
        for (const [key, value, reason, triplet] of rules()) {
          const mine = ['you', 'agent', 'paper', 'guide', 'run'].includes(st.src[key]);
          if (!mine) { st.v[key] = value; st.src[key] = 'adapted'; st.why[key] = { reason, triplet }; }
          else if (pass && st.v[key] !== value && !stricter(key, st.v[key], value)) st.advice.push({ key, value, reason, triplet });
        }
      }
    }

    // --- derived quantities --------------------------------------------------
    self.derived = function () {
      const sys = st.sys, v = st.v;
      if (!st.vol) st.vol = volumes(sys, v.crmult, v.frmult);
      const h3 = v.hgrid ** 3, nc = st.vol.coarse / h3, nf = st.vol.fine / h3;
      const ne = OND.chem.electrons(sys, v.charge), norb = Math.ceil(ne / 2) * (v.nspin === 2 ? 2 : 1);
      const dof = nc + 7 * nf, nk = sys.bc === 'free' ? 1 : Math.ceil(v.kpt ** (sys.bc === 'periodic' ? 3 : 2) / 2);
      const cores = v.mpi * v.omp, T = TARGETS[v.target];
      const hybrid = ['PBE0', 'B3LYP', 'HF'].includes(v.xc) ? Math.max(4, norb / 6) : 1;
      const work = v.algo === 'linear' ? 9e-3 * sys.atoms.length * (dof / sys.atoms.length) : 2.2e-6 * norb * dof * nk * hybrid; // core-seconds per iteration, calibrated on the recorded 6a runs (2.0e-6 to 2.2e-6)
      const iters = Math.round(14 + 7 * Math.log10(1e-4 / v.gnrm)) + (v.scf === 'mixing' ? 18 : 0) + (v.solvent !== 'none' ? 4 : 0);
      const outer = { sp: 1, geopt: Math.min(v.geoptSteps, 28), md: v.mdSteps * 0.45, neb: v.nimg * 14, tddft: 1.6, frag: 1.3 }[v.action];
      const seconds = work * iters * outer / (cores * T.speed) + 25;
      return {
        ne, norb, nc, nf, dof, nk, iters,
        // GB per MPI task, fitted on BigDFT's own "Estimated Memory Peak" for the 6a runs (S0 and T1, 20 tasks)
        mem: dof * (1.66e-4 + 1.714e-4 * norb / v.mpi) * (v.algo === 'linear' ? 0.12 : 1) / 1000,
        seconds, credits: cores * seconds / 3600 * T.rate,
      };
    };

    /* Each check names the parameters it involves (keys), so the interface can
     * show it next to every one of them and lead the user to the others. */
    self.checks = function () {
      const sys = st.sys, v = st.v, d = self.derived(), out = [];
      const add = (block, level, text, keys) => out.push({ block, level, text, keys: keys || [] });
      add('matter', 'ok', sys.atoms.length + ' atoms, ' + d.ne + ' valence electrons, units written explicitly');
      if (d.ne % 2 && v.nspin === 1) add('theory', 'err', 'Odd electron count without spin polarisation', ['nspin', 'charge']);
      else if (v.nspin === 2 && (d.ne - v.mpol) % 2) add('theory', 'err', 'The magnetic moment must have the parity of the electron count', ['mpol', 'charge']);
      else add('theory', 'ok', 'Spin and charge are consistent');
      if (v.dispersion && sys.bc !== 'free') add('theory', 'warn', 'The D3 correction is only available with free boundary conditions', ['dispersion']);
      else if (!v.dispersion && sys.traits.includes('van der Waals')) add('theory', 'warn', 'Physisorption without dispersion: D3 is not available with surface boundary conditions, the adsorption energy will be underestimated', ['dispersion']);
      if (v.hgrid > 0.55) add('accuracy', 'warn', 'Coarse grid: energy poorly converged', ['hgrid']);
      else add('accuracy', 'ok', 'Grid: ' + fmtInt(d.dof) + ' degrees of freedom per orbital');
      if (v.algo === 'linear' && v.kpt > 1) add('environment', 'err', 'Linear-scaling mode works at the Γ point only: choose the cubic algorithm or a single k-point', ['algo', 'kpt']);
      if (v.efield && sys.bc === 'periodic') add('environment', 'err', 'No electric field along a periodic direction', ['efield']);
      if (sys.bc !== 'free' && v.kpt === 1 && v.algo !== 'linear') add('environment', 'warn', 'A single k-point for a periodic system: the Brillouin zone is not sampled', ['kpt']);
      if (d.credits > 128) add('machine', 'warn', 'Estimated cost exceeds your 128 credits: lower the accuracy or change the target', ['target', 'mpi', 'hgrid', 'kpt']);
      if (d.mem > 16) add('machine', 'warn', 'High estimated memory per MPI task: use more tasks or a coarser grid', ['mpi', 'hgrid', 'crmult']);
      else add('machine', 'ok', 'Fits in memory: ' + d.mem.toFixed(d.mem < 10 ? 1 : 0) + ' GB per MPI task, estimated');
      return out;
    };

    // --- compilation -----------------------------------------------------------
    const XYZ = { h2o: 'h2o.xyz', c60: 'c60.xyz', 'gr-bz': 'benzene_graphene.xyz', si64: 'si64.xyz', ala20: 'ala20.pdb' };

    /* Returns the input as ordered sections of [key, value, comment]. */
    self.input = function () {
      const sys = st.sys, v = st.v, S = {}, imports = [];
      const put = (sec, key, val, k) => { (S[sec] = S[sec] || []).push([key, val, k && st.why[k] ? st.why[k].triplet.join(' → ') : '']); };
      if (v.algo === 'linear') imports.push('linear');
      if (v.scf === 'mixing') imports.push('mixing');
      put('dft', 'hgrids', v.hgrid, 'hgrid');
      put('dft', 'rmult', [v.crmult, v.frmult], 'crmult');
      put('dft', 'ixc', v.xc, 'xc');
      if (v.charge) put('dft', 'qcharge', v.charge);
      if (v.nspin !== 1) { put('dft', 'nspin', v.nspin, 'nspin'); put('dft', 'mpol', v.mpol, 'mpol'); }
      if (v.gnrm !== 1e-4) put('dft', 'gnrm_cv', v.gnrm);
      if (v.dispersion) put('dft', 'dispersion', 5, 'dispersion');
      if (v.efield) put('dft', 'elecfield', [0, v.efield, 0]);
      if (v.density) put('dft', 'output_denspot', 21);
      if (v.nplot) put('dft', 'nplot', v.nplot);
      if (v.action === 'tddft') { put('dft', 'norbv', -v.nvirt); put('dft', 'nvirt', v.nvirt); put('tddft', 'tddft_approach', v.tddft); }
      if (sys.bc !== 'free' && v.kpt > 1) { put('kpt', 'method', 'mpgrid', 'kpt'); put('kpt', 'ngkpt', sys.bc === 'surface' ? [v.kpt, 1, v.kpt] : [v.kpt, v.kpt, v.kpt]); }
      if (v.tel && v.scf !== 'mixing') put('mix', 'tel', v.tel, 'tel');
      if (v.action === 'geopt') {
        put('geopt', 'method', v.geoptMethod, 'geoptMethod'); put('geopt', 'ncount_cluster_x', v.geoptSteps);
        if (v.forcemax) put('geopt', 'forcemax', v.forcemax);
        if (v.biomode) put('geopt', 'biomode', true, 'biomode');
      }
      if (v.action === 'neb') { put('geopt', 'method', 'NEB'); put('geopt', 'nimg', v.nimg); put('geopt', 'climbing', true); }
      if (v.action === 'md') {
        put('md', 'mdsteps', v.mdSteps); put('md', 'temperature', v.mdT); put('md', 'timestep', v.mdDt);
        if (v.thermostat !== 'none') put('md', 'thermostat', v.thermostat);
      }
      if (v.dipole) put('lin_general', 'calc_dipole', true);
      if (v.charges) put('lin_general', 'charge_multipoles', 1);
      if (v.solvent !== 'none') {
        put('psolver.environment', 'cavity', 'soft-sphere', 'solvent');
        const P = { water: [1.18, 0.625, 72.0, -60.5], ethanol: [1.26, 0.625, 22.1, -26.1], mesitylene: [1.22, 0.5, 28.8, -40.8] }[v.solvent];
        if (v.solvent !== 'water') put('psolver.environment', 'epsilon', { ethanol: 24.852, mesitylene: 2.265 }[v.solvent]);
        put('psolver.environment', 'fact_rigid', P[0]); put('psolver.environment', 'delta', P[1]);
        put('psolver.environment', 'gammaS', P[2]); put('psolver.environment', 'alphaS', P[3]); put('psolver.environment', 'betaV', 0.0);
      }
      if (v.target === 'gpu') { put('perf', 'accel', 'OCLGPU', 'target'); put('psolver.setup', 'accel', 'CUDA'); }
      for (const path in st.expert) {
        const cut = path.lastIndexOf('.');
        put(path.slice(0, cut), path.slice(cut + 1), st.expert[path]);
        S[path.slice(0, cut)][S[path.slice(0, cut)].length - 1][2] = 'expert setting';
      }
      return { imports, sections: S, file: XYZ[sys.id] };
    };

    const yv = (x) => Array.isArray(x) ? '[' + x.map(yv).join(', ') + ']'
      : typeof x === 'boolean' ? (x ? 'Yes' : 'No')
      : typeof x === 'number' ? (Math.abs(x) < 1e-3 && x ? x.toExponential().replace(/^(-?\d+)e/, '$1.e') : String(x)) : String(x);

    self.yaml = function () {
      const sys = st.sys, inp = self.input(), L = [];
      const line = (ind, k, val, c) => L.push({ ind, k, val, c });
      if (inp.imports.length) line(0, 'import', inp.imports.length > 1 ? '[' + inp.imports.join(', ') + ']' : inp.imports[0], 'profiles shipped with BigDFT');
      const tree = {};
      for (const sec in inp.sections) { let node = tree; for (const part of sec.split('.')) node = node[part] = node[part] || {}; node.__ = inp.sections[sec]; }
      (function walk(node, ind) {
        for (const k in node) {
          if (k === '__') continue;
          line(ind, k, null);
          for (const [key, val, c] of node[k].__ || []) line(ind + 1, key, yv(val), c);
          walk(node[k], ind + 1);
        }
      })(tree, 0);
      line(0, 'posinp', null);
      line(1, 'units', 'angstroem');
      if (sys.cell) line(1, 'cell', '[' + sys.cell.map((c) => (c ? c.toFixed(3) : '.inf')).join(', ') + ']', sys.bc === 'surface' ? 'surface: free along y' : 'periodic');
      line(1, 'positions', null);
      sys.atoms.slice(0, 4).forEach((at) => L.push({ ind: 1, item: at.el, val: '[' + at.p.map((x, d) => (x + sys.origin[d]).toFixed(4)).join(', ') + ']' }));
      if (sys.atoms.length > 4) L.push({ ind: 1, note: '… ' + (sys.atoms.length - 4) + ' more atoms' });
      return L;
    };

    self.python = function () {
      const sys = st.sys, v = st.v, L = [], c = (s) => L.push(s);
      c('from BigDFT import Inputfiles, Calculators'); c('');
      c('inp = Inputfiles.Inputfile()');
      if (v.algo === 'linear' || v.scf === 'mixing') c('inp.load(profiles=[' + [v.algo === 'linear' && '"linear"', v.scf === 'mixing' && '"mixing"'].filter(Boolean).join(', ') + '])');
      c('inp.set_hgrid(' + v.hgrid + ')');
      c('inp.set_rmult(coarse=' + v.crmult.toFixed(1) + ', fine=' + v.frmult.toFixed(1) + ')');
      c('inp.set_xc("' + v.xc + '")');
      if (v.charge && v.nspin === 2) { c('inp.charge(' + v.charge + ')'); c('inp.spin_polarize(mpol=' + v.mpol + ')'); }
      else if (v.charge) c('inp.charge(' + v.charge + ')');
      else if (v.nspin === 2) c('inp.spin_polarize(mpol=' + v.mpol + ')');
      if (v.gnrm !== 1e-4) c('inp.set_scf_convergence(gnrm=' + v.gnrm.toExponential() + ')');
      if (v.dispersion) c('inp.set_dispersion_correction()');
      if (v.efield) c('inp.apply_electric_field([0, ' + v.efield + ', 0])');
      if (sys.bc !== 'free' && v.kpt > 1) c('inp.set_kpt_mesh("mpgrid", ngkpt=' + JSON.stringify(sys.bc === 'surface' ? [v.kpt, 1, v.kpt] : [v.kpt, v.kpt, v.kpt]).replace(/,/g, ', ') + ')');
      if (v.tel && v.scf !== 'mixing') c('inp.set_electronic_temperature(kT=' + v.tel + ')');
      if (v.solvent !== 'none') c('inp.set_implicit_solvent(solvent="' + v.solvent + '")');
      if (v.action === 'geopt') c('inp.optimize_geometry(method="' + v.geoptMethod + '", nsteps=' + v.geoptSteps + (v.forcemax ? ', forcemax=' + v.forcemax : '') + ')');
      if (v.action === 'geopt' && v.biomode) c('inp["geopt"]["biomode"] = True');
      if (v.action === 'neb') c('inp.optimize_geometry(method="NEB")');
      if (v.action === 'md') c('inp["md"] = {"mdsteps": ' + v.mdSteps + ', "temperature": ' + v.mdT + ', "timestep": ' + v.mdDt + (v.thermostat !== 'none' ? ', "thermostat": "' + v.thermostat + '"' : '') + '}');
      if (v.action === 'tddft') { c('inp.extract_virtual_states(nvirt=' + v.nvirt + ')'); c('inp.calculate_coupling_matrix(tda=' + (v.tddft === 'TDA' ? 'True' : 'False') + ')'); }
      if (v.density) c('inp.write_density_on_disk()');
      if (v.nplot) c('inp.write_cubefiles_around_fermi_level(nplot=' + v.nplot + ')');
      if (v.dipole) c('inp.calculate_dipole()');
      if (v.charges) c('inp.calculate_multipoles()');
      if (v.target === 'gpu') c('inp.use_gpu_acceleration()');
      for (const path in st.expert) c('inp' + path.split('.').map((p) => '["' + p + '"]').join('') + ' = ' + JSON.stringify(st.expert[path]));
      c('');
      c('code = Calculators.SystemCalculator(omp=' + v.omp + ', mpi_run="mpirun -np ' + v.mpi + '")');
      c('log = code.run(name="' + sys.id + '", input=inp, posinp="' + self.input().file + '")');
      c('print(log.energy)');
      return L;
    };

    return self;
  }

  const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
  OND.grid = { classifier, volumes };
  OND.Blueprint = Blueprint;
  OND.fmtInt = fmtInt;
})(window.OND);
