/* The 3D stage: atoms, bonds, periodic images, the wavelet grid and
 * isosurfaces. Built on three.js r128 (global THREE). */
window.OND = window.OND || {};
(function (OND) {
  'use strict';
  const { EL, BOHR } = OND.chem;
  const V = OND.chem.vec;

  // --- marching tetrahedra ---------------------------------------------------
  const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];

  function isoSurface(f, n, origin, h, iso) {
    const [nx, ny, nz] = n, pos = [], nor = [];
    const at = (i, j, k) => f[i + nx * (j + ny * k)];
    const grad = (i, j, k) => [
      at(Math.min(i + 1, nx - 1), j, k) - at(Math.max(i - 1, 0), j, k),
      at(i, Math.min(j + 1, ny - 1), k) - at(i, Math.max(j - 1, 0), k),
      at(i, j, Math.min(k + 1, nz - 1)) - at(i, j, Math.max(k - 1, 0)),
    ];
    const P = [], G = [], val = new Float32Array(8);
    const edge = (a, b) => {
      const t = (iso - val[a]) / (val[b] - val[a]);
      return [
        [0, 1, 2].map((d) => origin[d] + (P[a][d] + (P[b][d] - P[a][d]) * t) * h),
        [0, 1, 2].map((d) => -(G[a][d] + (G[b][d] - G[a][d]) * t)),
      ];
    };
    const tri = (a, b, c) => {
      const nrm = V.add(V.add(a[1], b[1]), c[1]);
      if (V.dot(V.cross(V.sub(b[0], a[0]), V.sub(c[0], a[0])), nrm) < 0) { const s = b; b = c; c = s; }
      for (const v of [a, b, c]) { pos.push(v[0][0], v[0][1], v[0][2]); const u = V.unit(v[1]); nor.push(u[0], u[1], u[2]); }
    };
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let above = 0;
      for (let c = 0; c < 8; c++) { val[c] = at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2]); if (val[c] > iso) above++; }
      if (above === 0 || above === 8) continue;
      for (let c = 0; c < 8; c++) {
        P[c] = [i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2]];
        G[c] = grad(P[c][0], P[c][1], P[c][2]);
      }
      for (const t of TETS) {
        const inn = [], out = [];
        for (const v of t) (val[v] > iso ? inn : out).push(v);
        if (inn.length === 1) tri(edge(inn[0], out[0]), edge(inn[0], out[1]), edge(inn[0], out[2]));
        else if (inn.length === 3) tri(edge(out[0], inn[0]), edge(out[0], inn[1]), edge(out[0], inn[2]));
        else if (inn.length === 2) {
          const a = edge(inn[0], out[0]), b = edge(inn[0], out[1]), c = edge(inn[1], out[0]), d = edge(inn[1], out[1]);
          tri(a, b, d); tri(a, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }

  /* Atoms plus the periodic images that can contribute within `reach`. */
  function withImages(sys, reach) {
    const out = [];
    const range = (k) => (sys.cell && sys.cell[k] ? [-1, 0, 1] : [0]);
    for (const at of sys.atoms) for (const a of range(0)) for (const b of range(1)) for (const c of range(2)) {
      const p = [at.p[0] + a * (sys.cell ? sys.cell[0] || 0 : 0), at.p[1] + b * (sys.cell ? sys.cell[1] || 0 : 0), at.p[2] + c * (sys.cell ? sys.cell[2] || 0 : 0)];
      let ok = true;
      if (a || b || c) for (let k = 0; k < 3; k++) if (sys.cell && sys.cell[k] && Math.abs(p[k]) > sys.cell[k] / 2 + reach) ok = false;
      if (ok) out.push({ at, p, image: !!(a || b || c) });
    }
    return out;
  }

  function bounds(sys, pad) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const at of sys.atoms) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], at.p[k]); hi[k] = Math.max(hi[k], at.p[k]); }
    for (let k = 0; k < 3; k++) {
      if (sys.cell && sys.cell[k]) { lo[k] = -sys.cell[k] / 2; hi[k] = sys.cell[k] / 2; } else { lo[k] -= pad; hi[k] += pad; }
    }
    return { lo, hi };
  }

  /* Toy fields for the illustration layers. Density: superposition of
   * exponential atomic densities. Orbital: p-like functions along a local
   * normal with LCAO-style coefficients. Neither is a BigDFT result. */
  function field(sys, kind) {
    const reach = 3.2, { lo, hi } = bounds(sys, 2.6);
    const span = [0, 1, 2].map((k) => hi[k] - lo[k]);
    const h = Math.max(0.26, Math.max(...span) / 70);
    const n = span.map((s) => Math.max(2, Math.round(s / h) + 1));
    const f = new Float32Array(n[0] * n[1] * n[2]);
    const orb = sys.orbital;
    for (const src of withImages(sys, reach)) {
      const w = kind === 'density' ? EL[src.at.el].val : orb.coeff(src.at);
      if (!w) continue;
      const nrm = kind === 'orbital' ? orb.normal(src.at) : null;
      const a = [0, 1, 2].map((k) => Math.max(0, Math.floor((src.p[k] - reach - lo[k]) / h)));
      const b = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.ceil((src.p[k] + reach - lo[k]) / h)));
      for (let k = a[2]; k <= b[2]; k++) for (let j = a[1]; j <= b[1]; j++) for (let i = a[0]; i <= b[0]; i++) {
        const d = [lo[0] + i * h - src.p[0], lo[1] + j * h - src.p[1], lo[2] + k * h - src.p[2]];
        const r = Math.hypot(d[0], d[1], d[2]);
        if (r > reach) continue;
        f[i + n[0] * (j + n[1] * k)] += kind === 'density' ? w * Math.exp(-2.4 * r) : w * V.dot(d, nrm) * Math.exp(-2.7 * r);
      }
    }
    let max = 0;
    for (let i = 0; i < f.length; i++) max = Math.max(max, Math.abs(f[i]));
    return { f, n, lo, h, max };
  }

  // --- the stage -------------------------------------------------------------
  function Stage(host) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3c40, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(-6, 9, 12);
    camera.add(key);
    scene.add(camera);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.autoRotateSpeed = 0.55;
    controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.addEventListener('start', () => { controls.autoRotate = false; });

    const layer = {};
    for (const name of ['atoms', 'bonds', 'ghosts', 'cell', 'grid', 'iso', 'sel']) { layer[name] = new THREE.Group(); scene.add(layer[name]); }

    const sphere = new THREE.SphereGeometry(1, 30, 20), lowSphere = new THREE.SphereGeometry(1, 14, 10);
    const srgb = (c) => new THREE.Color(c).convertSRGBToLinear(); // the renderer outputs sRGB
    const stick = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    stick.translate(0, 0.5, 0);

    let sys = null, atomMesh = null, radius = 8;
    let opts = { style: 'ball', ghosts: true, colorBy: 'element' };
    let colors = { coarse: '#6c8482', fine: '#6fd6e8', pos: '#f0a93b', neg: '#5b8def', dens: '#6fd6e8', sel: '#ffffff', cell: '#6c8482' };
    const self = { onPick: null, onFrame: null };

    const clear = (g) => { while (g.children.length) { const o = g.children.pop(); if (o.geometry && o.geometry !== sphere && o.geometry !== lowSphere && o.geometry !== stick) o.geometry.dispose(); if (o.material) o.material.dispose(); } };
    const atomRadius = (el) => (opts.style === 'vdw' ? EL[el].rcov * 1.9 + 0.26 : EL[el].rcov * 0.46 + 0.1);

    function atomColor(at) {
      if (opts.colorBy === 'fragment' && sys.fragments) {
        const nf = sys.fragments.length, t = nf > 1 ? at.frag / (nf - 1) : 0;
        if (nf === 2) return srgb(at.frag ? colors.pos : colors.neg);
        return srgb(colors.neg).lerp(srgb(colors.pos), t);
      }
      return srgb(EL[at.el].color);
    }

    function rebuild() {
      for (const name of ['atoms', 'bonds', 'ghosts', 'cell', 'sel']) clear(layer[name]);
      if (!sys) return;
      const A = sys.atoms, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);

      atomMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.02 }), A.length);
      A.forEach((at, i) => {
        const r = atomRadius(at.el);
        m.makeScale(r, r, r).setPosition(at.p[0], at.p[1], at.p[2]);
        atomMesh.setMatrixAt(i, m);
        atomMesh.setColorAt(i, atomColor(at));
      });
      layer.atoms.add(atomMesh);

      if (opts.style === 'ball') {
        const B = OND.chem.bonds(sys);
        const mesh = new THREE.InstancedMesh(stick, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.02 }), B.length * 2);
        B.forEach((b, n) => {
          const half = V.len(b.d) / 2, dir = new THREE.Vector3(b.d[0], b.d[1], b.d[2]).normalize();
          [[A[b.i], 1], [A[b.j], -1]].forEach(([at, s], e) => {
            q.setFromUnitVectors(up, dir.clone().multiplyScalar(s));
            m.compose(new THREE.Vector3(at.p[0], at.p[1], at.p[2]), q, new THREE.Vector3(0.105, half, 0.105));
            mesh.setMatrixAt(n * 2 + e, m);
            mesh.setColorAt(n * 2 + e, atomColor(at).multiplyScalar(0.82));
          });
        });
        layer.bonds.add(mesh);
      }

      if (sys.cell) {
        const { lo, hi } = bounds(sys, 2.2);
        const box = new THREE.Box3(new THREE.Vector3(lo[0], lo[1], lo[2]), new THREE.Vector3(hi[0], hi[1], hi[2]));
        const lines = new THREE.Box3Helper(box, new THREE.Color(colors.cell));
        lines.material.transparent = true; lines.material.opacity = 0.7;
        layer.cell.add(lines);
        if (opts.ghosts) {
          // only the first shell of images: enough to read the periodicity
          const imgs = withImages(sys, 2.6).filter((s) => s.image);
          const ghost = new THREE.InstancedMesh(lowSphere, new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true, opacity: 0.2, depthWrite: false }), imgs.length);
          imgs.forEach((s, i) => {
            const r = atomRadius(s.at.el) * 0.9;
            m.makeScale(r, r, r).setPosition(s.p[0], s.p[1], s.p[2]);
            ghost.setMatrixAt(i, m); ghost.setColorAt(i, srgb(EL[s.at.el].color));
          });
          layer.ghosts.add(ghost);
        }
      }
    }

    function frame() {
      radius = 3;
      for (const at of sys.atoms) radius = Math.max(radius, V.len(at.p) + 2.2);
      const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * (camera.aspect < 1 ? 1 / camera.aspect : 1) * 1.16;
      const dir = new THREE.Vector3(0.42, sys.bc === 'surface' ? 0.6 : 0.34, 1).normalize();
      camera.position.copy(dir.multiplyScalar(dist));
      controls.target.set(0, 0, 0);
      controls.minDistance = radius * 0.6; controls.maxDistance = dist * 3;
      controls.update();
    }

    self.setSystem = function (s, keepView) {
      sys = s; clear(layer.grid); clear(layer.iso);
      rebuild();
      if (!keepView) frame();
    };
    self.setOptions = function (o) { Object.assign(opts, o); rebuild(); };
    self.setColors = function (c) { Object.assign(colors, c); if (sys) rebuild(); };
    self.options = () => opts;

    self.select = function (i) {
      clear(layer.sel);
      if (i == null || !sys.atoms[i]) return;
      const at = sys.atoms[i], r = atomRadius(at.el) + 0.09;
      const halo = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: colors.sel, side: THREE.BackSide }));
      halo.scale.set(r, r, r); halo.position.set(at.p[0], at.p[1], at.p[2]);
      layer.sel.add(halo);
    };

    /* A slice of the two-level wavelet grid through the plane z = 0. */
    self.setGrid = function (g) {
      clear(layer.grid);
      if (!g || !sys) return;
      const classify = OND.grid.classifier(sys, g.crmult, g.frmult);
      const step = g.h * BOHR, { lo, hi } = classify.box, coarse = [], fine = [];
      for (let x = Math.ceil(lo[0] / step) * step; x <= hi[0]; x += step) for (let y = Math.ceil(lo[1] / step) * step; y <= hi[1]; y += step) {
        const c = classify(x, y, 0);
        if (c === 2) fine.push(x, y, 0); else if (c === 1) coarse.push(x, y, 0);
      }
      const cloud = (pts, color, size, opacity) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        layer.grid.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false })));
      };
      cloud(coarse, colors.coarse, 1.7, 0.75);
      cloud(fine, colors.fine, 3.2, 1);
    };

    self.setIso = function (kind) {
      clear(layer.iso);
      if (!kind || !sys || (kind === 'orbital' && !sys.orbital)) return;
      const F = field(sys, kind);
      const add = (f, iso, color) => {
        const geo = isoSurface(f, F.n, F.lo, F.h, iso);
        layer.iso.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color, transparent: true, opacity: kind === 'density' ? 0.34 : 0.72, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide, depthWrite: false,
        })));
      };
      if (kind === 'density') add(F.f, 0.5, colors.dens);
      else {
        add(F.f, 0.3 * F.max, colors.pos);
        add(F.f.map((v) => -v), 0.3 * F.max, colors.neg);
      }
    };

    self.project = function (p) {
      const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
      return { x: (v.x + 1) / 2 * host.clientWidth, y: (1 - v.y) / 2 * host.clientHeight, visible: v.z < 1 };
    };

    self.snapshot = function (w, h, background) {
      const size = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio(), aspect = camera.aspect;
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      scene.background = background ? new THREE.Color(background) : null;
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      scene.background = null;
      renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false);
      camera.aspect = aspect; camera.updateProjectionMatrix();
      return url;
    };

    self.resetView = () => { frame(); };

    // picking: a click that did not turn into a drag
    const ray = new THREE.Raycaster(), down = { x: 0, y: 0 };
    renderer.domElement.addEventListener('pointerdown', (e) => { down.x = e.clientX; down.y = e.clientY; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !atomMesh) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
      const hit = ray.intersectObject(atomMesh)[0];
      if (self.onPick) self.onPick(hit ? hit.instanceId : null);
    });

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host);
    resize();

    (function loop() {
      requestAnimationFrame(loop);
      if (!host.offsetParent) return; // view hidden
      controls.update();
      renderer.render(scene, camera);
      if (self.onFrame) self.onFrame();
    })();

    return self;
  }

  OND.Stage = Stage;
  OND.stageUtil = { withImages, bounds };
})(window.OND);
