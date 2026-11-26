// Vehicles built in code, made to look like real cars (all original designs, no real brands):
//  - smooth bodies "lofted" through rounded cross-sections, like a car designer's clay model
//  - dark reflective glass, painted roof and pillars, black trim, chrome, number plates, door lines
//  - head and tail lights that glow at night
//  - alloy wheels that spin and steer (ALL wheels in the city share 2 draw calls)
// Each car is ONE mesh with ONE material (its paint colour), so the streets can hold many cars.
// Types: hatchback, sedan, suv, sports, taxi, police, van, ambulance, truck, bus, auto (rickshaw), boat.
import * as THREE from 'three';
import { BOX, signGeometry } from './mesh.js';
import { policeDecal } from './textures.js';

export const CAR_GLOW = { value: 0 };   // 0 = day .. 1 = night (set by the atmosphere every frame)

// Size of every vehicle (metres) for collisions and parking.
export const VEHICLE_SIZE = {
  hatchback: { l: 3.85, w: 1.72 },
  sedan: { l: 4.5, w: 1.8 },
  suv: { l: 4.65, w: 1.9 },
  police: { l: 4.65, w: 1.9 },
  sports: { l: 4.45, w: 1.94 },
  taxi: { l: 4.2, w: 1.7 },
  van: { l: 4.7, w: 1.86 },
  ambulance: { l: 4.9, w: 1.9 },
  truck: { l: 7.4, w: 2.36 },
  bus: { l: 10.6, w: 2.55 },
  auto: { l: 2.75, w: 1.38 },
  boat: { l: 5.8, w: 2.2 },
};

// Indian city traffic: lots of small cars and autos, some SUVs, taxis, vans, trucks and buses.
export const TRAFFIC_TYPES = ['hatchback', 'hatchback', 'hatchback', 'sedan', 'sedan', 'sedan', 'suv', 'suv', 'auto', 'auto', 'auto',
  'taxi', 'taxi', 'van', 'sports', 'truck', 'bus'];
export const CAR_COLORS = [0xf2f2f2, 0xf2f2f2, 0xc9ccd1, 0xbfc3c9, 0x1d1e22, 0x9e1b1b, 0x22468f, 0x6b6e73, 0x2e5e45, 0xd9d2c2, 0xb36b1e, 0x7a1f2b, 0x3d4a5c];

// ---------- Part "materials", stored per vertex: colour + (glow, paint, roughness, metalness) ----------
const P = {
  paint:  { c: [1, 1, 1], paint: 1, r: 0.28, m: 0.45 },
  glass:  { c: [0.01, 0.014, 0.018], paint: 0, r: 0.1, m: 0 },
  black:  { c: [0.035, 0.036, 0.04], paint: 0, r: 0.62, m: 0 },
  trim:   { c: [0.045, 0.046, 0.05], paint: 0, r: 0.3, m: 0.25 },
  grille: { c: [0.02, 0.02, 0.024], paint: 0, r: 0.4, m: 0.5 },
  chrome: { c: [0.85, 0.86, 0.88], paint: 0, r: 0.1, m: 1 },
  plate:  { c: [0.92, 0.92, 0.88], paint: 0, r: 0.45, m: 0 },
  yplate: { c: [0.95, 0.78, 0.12], paint: 0, r: 0.45, m: 0 },
  under:  { c: [0.018, 0.018, 0.02], paint: 0, r: 0.95, m: 0 },
  head:   { c: [1, 0.98, 0.93], paint: 0, r: 0.06, m: 0, glow: 1 },
  tail:   { c: [0.9, 0.035, 0.03], paint: 0, r: 0.12, m: 0, glow: 1 },
  amber:  { c: [1, 0.48, 0.04], paint: 0, r: 0.12, m: 0, glow: 0.6 },
  seat:   { c: [0.09, 0.08, 0.075], paint: 0, r: 0.8, m: 0 },
};
const livery = (c, r = 0.3, m = 0.2) => ({ c, paint: 1, r, m });   // a painted colour baked into the model (taxi, police...)

// ---------- Geometry builder: non-indexed triangles with smooth normals and per-face parts ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
class Geo {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.mat = []; }
  vert(x, y, z, nx, ny, nz, pt) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz);
    const c = pt.c; this.col.push(c[0], c[1], c[2]);
    this.mat.push(pt.glow || 0, pt.paint, pt.r, pt.m + (pt.cc ? 10 : 0));   // +10 = glass gets a clear coat
  }
  // Add any THREE geometry (box, cylinder...) moved/turned/scaled, painted with one part.
  add(geo, pt, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) this.vert(p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2], pt);
    g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('pbr', new THREE.Float32BufferAttribute(this.mat, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// Skin a list of cross-sections (all with the same number of points) into a smooth surface.
// rings[i] = { z, pts: [[x, y], ...] }. classify(cx, cy, cz, nx, ny, nz) -> part for each triangle.
function loft(G, rings, closed, classify, caps = false) {
  const S = rings.length, N = rings[0].pts.length;
  const V = rings.map((r) => r.pts.map(([x, y]) => [x, y, r.z]));
  // Smooth normals from the surface tangents (finite differences).
  const NV = V.map((row, i) => row.map((v, j) => {
    const jp = closed ? (j + 1) % N : Math.min(N - 1, j + 1), jm = closed ? (j - 1 + N) % N : Math.max(0, j - 1);
    const ip = Math.min(S - 1, i + 1), im = Math.max(0, i - 1);
    const tj = [V[i][jp][0] - V[i][jm][0], V[i][jp][1] - V[i][jm][1], 0];
    const ti = [V[ip][j][0] - V[im][j][0], V[ip][j][1] - V[im][j][1], V[ip][j][2] - V[im][j][2]];
    let nx = ti[1] * tj[2] - ti[2] * tj[1], ny = ti[2] * tj[0] - ti[0] * tj[2], nz = ti[0] * tj[1] - ti[1] * tj[0];
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) { nx = v[0]; ny = v[1] - 0.8; nz = 0; l = Math.hypot(nx, ny, nz) || 1; }
    nx /= l; ny /= l; nz /= l;
    // Point outwards (away from the middle of the section).
    if (nx * v[0] + ny * (v[1] - 0.8) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  }));
  const jEnd = closed ? N : N - 1;
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < jEnd; j++) {
      const j2 = (j + 1) % N;
      quad(G, V[i][j], V[i][j2], V[i + 1][j2], V[i + 1][j], NV[i][j], NV[i][j2], NV[i + 1][j2], NV[i + 1][j], classify);
    }
  }
  if (caps) for (const [i, sign] of [[0, -1], [S - 1, 1]]) {
    const row = V[i];
    let cx = 0, cy = 0;
    for (const v of row) { cx += v[0]; cy += v[1]; }
    cx /= N; cy /= N;
    const cz = row[0][2], nrm = [0, 0, sign];
    for (let j = 0; j < N; j++) {
      const a = row[j], b = row[(j + 1) % N];
      const pt = classify((a[0] + b[0] + cx) / 3, (a[1] + b[1] + cy) / 3, cz, 0, 0, sign);
      triOut(G, [cx, cy, cz], a, b, nrm, nrm, nrm, pt, nrm);
    }
  }
}
function quad(G, a, b, c, d, na, nb, nc, nd, classify) {
  // Face normal decides the part (glass, paint, trim...) and the winding.
  _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
  _n.crossVectors(_a, _b);
  if (_n.lengthSq() < 1e-12) { _a.set(c[0] - b[0], c[1] - b[1], c[2] - b[2]); _b.set(a[0] - b[0], a[1] - b[1], a[2] - b[2]); _n.crossVectors(_a, _b); }
  if (_n.lengthSq() < 1e-14) return;
  _n.normalize();
  const avg = [na[0] + nb[0] + nc[0] + nd[0], na[1] + nb[1] + nc[1] + nd[1], na[2] + nb[2] + nc[2] + nd[2]];
  if (_n.x * avg[0] + _n.y * avg[1] + _n.z * avg[2] < 0) _n.negate();
  const fn = [_n.x, _n.y, _n.z];
  const pt = classify((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, fn[0], fn[1], fn[2]);
  triOut(G, a, b, c, na, nb, nc, pt, fn);
  triOut(G, a, c, d, na, nc, nd, pt, fn);
}
function triOut(G, a, b, c, na, nb, nc, pt, fn) {
  _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  _c.crossVectors(_a, _b);
  if (_c.lengthSq() < 1e-14) return;
  if (_c.x * fn[0] + _c.y * fn[1] + _c.z * fn[2] < 0) { const t = b; b = c; c = t; const u = nb; nb = nc; nc = u; }
  G.vert(a[0], a[1], a[2], na[0], na[1], na[2], pt);
  G.vert(b[0], b[1], b[2], nb[0], nb[1], nb[2], pt);
  G.vert(c[0], c[1], c[2], nc[0], nc[1], nc[2], pt);
}

// Smooth piecewise curve through [t, value] keys (monotone, no overshoot).
function curve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const k = (t - t0) / (t1 - t0), s = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

// ---------- The car designs (all units metres; z = forward, y = up, x = right) ----------
// top/bot: side profile of the lower body (top line and bottom line) at z/(L/2) from -1 (rear) to 1 (front).
// cab: glass house from the rear-glass base (z0) up to the roof (z1..z2) and down to the windshield base (z3).
const SPECS = {
  hatchback: {
    L: 3.85, W: 1.72, Rf: 0.42, Rr: 0.32,
    top: [[-1, 0.66], [-0.97, 0.84], [-0.9, 0.93], [0.3, 0.94], [0.36, 0.92], [0.72, 0.86], [0.93, 0.8], [0.985, 0.7], [1, 0.56]],
    bot: [[-1, 0.42], [-0.93, 0.27], [-0.8, 0.22], [0.8, 0.22], [0.93, 0.27], [1, 0.42]],
    cab: { z0: -1.66, z1: -1.45, z2: 0.15, z3: 0.66, roof: 1.5, tumble: 0.14, w0: -1.55, w1: 0.5, b: -0.25 },
    wheels: [{ z: 1.22, r: 0.31, w: 0.2 }, { z: -1.2, r: 0.31, w: 0.2 }],
    grille: [0.42, 0.62, 0.32], head: { x: 0.6, dy: 0.13, w: 0.34, h: 0.12 }, tailL: { x: 0.72, dy: 0.2, w: 0.16, h: 0.3 },
  },
  sedan: {
    L: 4.5, W: 1.8, Rf: 0.46, Rr: 0.4,
    top: [[-1, 0.66], [-0.97, 0.85], [-0.9, 0.93], [-0.62, 0.95], [-0.45, 0.955], [0.3, 0.96], [0.36, 0.93], [0.72, 0.86], [0.93, 0.8], [0.985, 0.7], [1, 0.56]],
    bot: [[-1, 0.42], [-0.94, 0.28], [-0.84, 0.22], [0.84, 0.22], [0.94, 0.28], [1, 0.42]],
    cab: { z0: -1.12, z1: -0.52, z2: 0.36, z3: 0.84, roof: 1.46, tumble: 0.15, w0: -0.82, w1: 0.68, b: -0.06 },
    wheels: [{ z: 1.42, r: 0.33, w: 0.21 }, { z: -1.36, r: 0.33, w: 0.21 }],
    grille: [0.44, 0.64, 0.36], head: { x: 0.6, dy: 0.12, w: 0.38, h: 0.11 }, tail: { x: 0.64, dy: 0.1, w: 0.42, h: 0.12 },
  },
  suv: {
    L: 4.65, W: 1.9, Rf: 0.38, Rr: 0.3, gc: 0.34,
    top: [[-1, 0.86], [-0.97, 1.04], [-0.92, 1.1], [0.35, 1.12], [0.42, 1.1], [0.75, 1.06], [0.94, 1.01], [0.985, 0.9], [1, 0.74]],
    bot: [[-1, 0.56], [-0.94, 0.4], [-0.84, 0.36], [0.84, 0.36], [0.94, 0.4], [1, 0.56]],
    cab: { z0: -2.1, z1: -1.92, z2: 0.42, z3: 0.98, roof: 1.84, tumble: 0.1, w0: -1.98, w1: 0.84, b: -0.12, c2: -1.05 },
    wheels: [{ z: 1.45, r: 0.38, w: 0.24 }, { z: -1.4, r: 0.38, w: 0.24 }],
    grille: [0.62, 0.92, 0.42], head: { x: 0.62, dy: 0.15, w: 0.4, h: 0.14 }, tailL: { x: 0.74, dy: 0.25, w: 0.14, h: 0.38 },
    rails: true, skid: true,
  },
  sports: {
    L: 4.45, W: 1.94, Rf: 0.5, Rr: 0.45, gc: 0.12,
    top: [[-1, 0.58], [-0.97, 0.74], [-0.9, 0.8], [-0.55, 0.82], [0.2, 0.82], [0.3, 0.8], [0.7, 0.72], [0.93, 0.64], [0.985, 0.55], [1, 0.42]],
    bot: [[-1, 0.3], [-0.94, 0.18], [-0.84, 0.13], [0.84, 0.13], [0.94, 0.16], [1, 0.26]],
    cab: { z0: -1.3, z1: -0.55, z2: 0.12, z3: 0.75, roof: 1.2, tumble: 0.2, w0: -0.85, w1: 0.62, b: 99 },
    wheels: [{ z: 1.36, r: 0.34, w: 0.26 }, { z: -1.3, r: 0.35, w: 0.3 }],
    grille: [0.2, 0.36, 0.55], head: { x: 0.64, dy: 0.08, w: 0.42, h: 0.08 }, tail: { x: 0.66, dy: 0.08, w: 0.5, h: 0.07 },
    wing: true, intakes: true,
  },
  taxi: {   // the classic black-and-yellow city taxi: rounded old-school shape
    L: 4.2, W: 1.7, Rf: 0.55, Rr: 0.5,
    top: [[-1, 0.7], [-0.96, 0.86], [-0.88, 0.92], [-0.5, 0.94], [0.3, 0.95], [0.38, 0.93], [0.72, 0.9], [0.92, 0.84], [0.98, 0.72], [1, 0.58]],
    bot: [[-1, 0.44], [-0.94, 0.3], [-0.84, 0.25], [0.84, 0.25], [0.94, 0.3], [1, 0.44]],
    cab: { z0: -1.05, z1: -0.6, z2: 0.3, z3: 0.78, roof: 1.5, tumble: 0.2, w0: -0.78, w1: 0.62, b: -0.1, round: true },
    wheels: [{ z: 1.3, r: 0.3, w: 0.18 }, { z: -1.28, r: 0.3, w: 0.18 }],
    grille: [0.46, 0.66, 0.34], head: { x: 0.66, dy: 0.13, w: 0.2, h: 0.2, round: true }, tailL: { x: 0.72, dy: 0.2, w: 0.12, h: 0.22 },
    livery: (x, y) => (y > 1.0 ? [0.95, 0.74, 0.08] : [0.03, 0.03, 0.035]),
    sign: 'taxi', bumpers: 'chrome',
  },
  van: {
    L: 4.7, W: 1.86, Rf: 0.4, Rr: 0.14, gc: 0.3,
    top: [[-1, 1.0], [-0.98, 1.06], [0.5, 1.08], [0.6, 1.06], [0.86, 1.0], [0.97, 0.9], [1, 0.72]],
    bot: [[-1, 0.4], [-0.95, 0.32], [0.84, 0.32], [0.94, 0.36], [1, 0.5]],
    cab: { z0: -2.33, z1: -2.3, z2: 0.95, z3: 1.65, roof: 2.0, tumble: 0.05, w0: 0.6, w1: 1.5, b: 99, box: true },
    wheels: [{ z: 1.55, r: 0.34, w: 0.22 }, { z: -1.55, r: 0.34, w: 0.22 }],
    grille: [0.6, 0.86, 0.4], head: { x: 0.64, dy: 0.14, w: 0.34, h: 0.15 }, tailL: { x: 0.8, dy: 0.15, w: 0.12, h: 0.5 },
    seams: 'van',
  },
  bus: {
    L: 10.6, W: 2.55, Rf: 0.22, Rr: 0.18, gc: 0.36,
    top: [[-1, 1.2], [-0.99, 1.22], [0.97, 1.22], [1, 1.12]],
    bot: [[-1, 0.5], [-0.98, 0.38], [0.97, 0.38], [1, 0.5]],
    cab: { z0: -5.29, z1: -5.26, z2: 5.0, z3: 5.3, roof: 3.05, tumble: 0.02, w0: -5.0, w1: 5.0, b: 99, box: true, band: 0.74, pillars: 1.3 },
    wheels: [{ z: 3.55, r: 0.5, w: 0.3 }, { z: -2.95, r: 0.5, w: 0.42 }],
    grille: [0.5, 0.9, 0.5], head: { x: 0.74, dy: 0.25, w: 0.34, h: 0.16 }, tailL: { x: 0.86, dy: 0.2, w: 0.14, h: 0.5 },
    livery: (x, y) => (y < 1.25 ? [0.62, 0.08, 0.06] : y < 2.35 ? [0.92, 0.88, 0.78] : [0.95, 0.93, 0.88]),
    destination: true,
  },
};
SPECS.police = { ...SPECS.suv, livery: (x, y) => (y > 0.56 && y < 0.72 ? [0.1, 0.22, 0.6] : [0.95, 0.96, 0.97]) };
SPECS.ambulance = { ...SPECS.van, L: 4.9, W: 1.9, livery: (x, y) => (y > 0.62 && y < 0.8 ? [0.8, 0.05, 0.04] : [0.96, 0.96, 0.96]),
  cab: { ...SPECS.van.cab, z0: -2.43, z1: -2.4, z2: 1.05, z3: 1.75, w0: 0.7, w1: 1.6 },
  wheels: [{ z: 1.62, r: 0.35, w: 0.22 }, { z: -1.6, r: 0.35, w: 0.22 }], beacon: true };
SPECS.truck = {   // the cab of the goods truck; the cargo body is added separately
  L: 7.4, W: 2.36, Rf: 0.2, Rr: 0.05, gc: 0.5, cabOnly: 2.1,
  top: [[-1, 1.45], [0.43, 1.45], [0.47, 1.5], [0.8, 1.52], [0.97, 1.45], [1, 1.2]],
  bot: [[-1, 0.62], [0.55, 0.62], [0.95, 0.62], [1, 0.7]],
  cab: { z0: 1.65, z1: 1.7, z2: 3.05, z3: 3.55, roof: 2.95, tumble: 0.03, w0: 2.4, w1: 3.4, b: 99, box: true },
  wheels: [{ z: 2.6, r: 0.5, w: 0.3 }, { z: -1.7, r: 0.5, w: 0.44 }, { z: -2.75, r: 0.5, w: 0.44 }],
  grille: [0.78, 1.28, 0.6], head: { x: 0.74, dy: 0.42, w: 0.3, h: 0.18, round: true }, tailL: { x: 0.86, dy: 0, w: 0.16, h: 0.2 },
  livery: (x, y) => (y > 1.9 ? [0.95, 0.6, 0.06] : y > 1.2 ? [0.9, 0.42, 0.06] : [0.1, 0.35, 0.65]),
};

function planW(s, z) {
  const hl = s.L / 2, hw = s.W / 2, R = z > 0 ? s.Rf : s.Rr;
  const e = Math.abs(z) - (hl - R);
  if (e <= 0) return hw;
  return hw - R + Math.sqrt(Math.max(0, R * R - e * e));
}

// Everything known about the body at one station along the car.
function station(s, z) {
  const hl = s.L / 2, zn = z / hl;
  const w = planW(s, z);
  let yt = curve(s.top, zn), yb = curve(s.bot, zn);
  let yn = yb;
  for (const wh of s.wheels) {
    const R = wh.r + 0.07, dz = z - wh.z;
    if (Math.abs(dz) < R) yn = Math.max(yn, wh.r + Math.sqrt(R * R - dz * dz) * 0.97);
  }
  const ys = Math.max(Math.max(yb, yn) + 0.06, yt - (s.cab.box ? 0.05 : 0.1));
  yt = Math.max(yt, ys + 0.01);
  return { z, w, yt, yb, yn, ys };
}

// Cross-section of the lower body (closed loop).
function lowerRing(st, s, lo) {
  const { w, yb, yn, yt, ys } = st;
  const rs = s.cab.box ? 0.08 : 0.15, crown = s.cab.box ? 0.01 : 0.035;
  const d = Math.min(w - 0.1, (s.wheels[0].w || 0.22) + 0.13);
  const R = [[0, yb], [w - d, yb], [w - d, Math.max(yb, yn)], [w - 0.05, Math.max(yb, yn)]];
  const y0 = Math.max(yb, yn) + 0.04;
  const sideN = lo ? 2 : 3;
  for (let k = 0; k <= sideN; k++) {
    const t = k / sideN;
    R.push([w - 0.025 * (1 - Math.sin(Math.PI * t)) - (k === 0 ? 0.012 : 0), y0 + (ys - y0) * t]);
  }
  const shN = lo ? 2 : 3;
  for (let k = 1; k <= shN; k++) {
    const a = (k / shN) * Math.PI / 2;
    R.push([w - rs + rs * Math.cos(a), ys + (yt - ys) * Math.sin(a)]);
  }
  if (!lo) R.push([(w - rs) * 0.55, yt + crown * 0.72]);
  R.push([0, yt + crown]);
  const n = R.length;
  for (let k = n - 2; k >= 1; k--) R.push([-R[k][0], R[k][1]]);
  return R;
}

// Height of the glass house above the lower body at z (0 outside it).
function cabHeight(s, z, base) {
  const c = s.cab;
  const top = c.roof;
  if (z <= c.z0 || z >= c.z3) return 0;
  const H = top - base;
  if (z < c.z1) { const t = (z - c.z0) / (c.z1 - c.z0); return H * (1 - Math.pow(1 - t, c.round ? 2.2 : 1.6)); }
  if (z > c.z2) { const t = (c.z3 - z) / (c.z3 - c.z2); return H * (1 - Math.pow(1 - t, c.round ? 2.2 : 1.35)); }
  const mid = (c.z1 + c.z2) / 2, half = (c.z2 - c.z1) / 2 || 1;
  const u = (z - mid) / half;
  return H * (1 - (c.box ? 0.005 : 0.03) * u * u);
}

function cabRing(s, st, h, lo) {
  const c = s.cab;
  const rs = c.box ? 0.1 : 0.15;
  const wc = st.w - rs * 0.9 - 0.03;
  const base = st.yt + (c.box ? 0.0 : 0.02);
  const K = lo ? 3 : 6;
  const R = [[wc + 0.012, base - 0.06]];   // a little below the belt: the black window seal
  for (let k = 0; k <= K; k++) {
    const a = (k / K) * Math.PI / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pw = c.box ? 0.18 : 0.7, ph = c.box ? 0.25 : 0.8;
    R.push([wc * Math.pow(ca, pw) * (1 - c.tumble * Math.pow(sa, 1.2)), base + h * Math.pow(sa, ph)]);
  }
  const n = R.length;
  for (let k = n - 2; k >= 0; k--) R.push([-R[k][0], R[k][1]]);
  return { pts: R, base };
}

// Build the body geometry of one design. lo = the cheap version for cars far away.
function buildBody(s, lo) {
  const G = new Geo();
  const hl = s.L / 2;
  const liveryPart = (x, y, z) => (s.livery ? livery(s.livery(x, y, z)) : P.paint);
  const grille = s.grille;
  // Where the lower body ends (trucks: only the cab is lofted).
  const zStart = s.cabOnly ? hl - s.cabOnly : -hl;
  // Stations: even steps + extra ones round the wheel arches and the window pillars.
  const step = lo ? 0.28 : (s.L > 6 ? 0.2 : 0.1);
  const zs = new Set();
  for (let z = zStart; z < hl; z += step) zs.add(+z.toFixed(3));
  zs.add(+zStart.toFixed(3)); zs.add(hl);
  if (!lo) {
    for (const wh of s.wheels) for (let k = -6; k <= 6; k++) zs.add(+(wh.z + (wh.r + 0.07) * (k / 6)).toFixed(3));
    for (const z of [hl - 0.04, hl - 0.12, zStart + 0.04, zStart + 0.12]) zs.add(+z.toFixed(3));
  }
  const zList = [...zs].filter((z) => z >= zStart - 1e-6 && z <= hl + 1e-6).sort((a, b) => a - b);
  const stations = zList.map((z) => station(s, z));
  const rings = stations.map((st) => ({ z: st.z, pts: lowerRing(st, s, lo) }));
  const stAt = (z) => station(s, Math.max(zStart, Math.min(hl, z)));
  loft(G, rings, true, (x, y, z, nx, ny, nz) => {
    const st = stAt(z);
    if (ny < -0.35) return P.under;
    if (Math.abs(nx) > 0.55 && nx * x < 0) return P.under;                 // inside the wheel arches
    if (Math.abs(nx) > 0.5 && y < Math.max(st.yb, st.yn) + 0.07) return P.black;   // sill
    if (nz > 0.45 && z > 0) {
      if (y < st.yb + (s.bumpers === 'chrome' ? 0.1 : 0.2)) return s.bumpers === 'chrome' ? P.chrome : P.black;
      if (grille && y > grille[0] && y < grille[1] && Math.abs(x) < grille[2] * s.W / 2) return P.grille;
    }
    if (nz < -0.45 && z < 0 && y < st.yb + (s.bumpers === 'chrome' ? 0.1 : 0.17)) return s.bumpers === 'chrome' ? P.chrome : P.black;
    return liveryPart(x, y, z);
  }, true);

  // Glass house.
  const c = s.cab;
  const cz = [];
  const cstep = lo ? 0.3 : (s.L > 6 ? 0.25 : 0.08);
  for (let z = c.z0; z < c.z3; z += cstep) cz.push(z);
  cz.push(c.z3);
  if (!lo) {
    for (const z of [c.z1, c.z2, c.w0, c.w1, c.b - 0.05, c.b + 0.05, c.c2 ?? 99]) if (z > c.z0 && z < c.z3) cz.push(z);
    if (c.pillars) for (let z = c.w0; z <= c.w1; z += c.pillars) { cz.push(z - 0.06, z + 0.06); }
  }
  const czs = [...new Set(cz.map((z) => +z.toFixed(3)))].sort((a, b) => a - b);
  const cRings = czs.map((z) => {
    const st = station(s, z);
    const h = cabHeight(s, z, st.yt);
    const r = cabRing(s, st, h, lo);
    return { z, pts: r.pts, base: r.base, h };
  });
  const cabInfo = (z) => { const st = station(s, z); return { base: st.yt + (c.box ? 0 : 0.02), h: cabHeight(s, z, st.yt) }; };
  loft(G, cRings, false, (x, y, z, nx, ny, nz) => {
    const ci = cabInfo(z);
    if (y < ci.base + 0.004) return P.trim;                                  // window seal
    const rel = ci.h > 0.05 ? (y - ci.base) / ci.h : 0;
    if (ny > 0.72 && z > c.z1 + 0.02 && z < c.z2 - 0.02) return liveryPart(x, y, z);   // roof
    const side = Math.abs(nx) >= Math.max(Math.abs(nz), 0.35);
    if (side) {
      if (c.band && rel > c.band) return liveryPart(x, y, z);                // bus: painted band above the windows
      if (z < c.w0 || z > c.w1) return liveryPart(x, y, z);                  // pillars
      if (Math.abs(z - c.b) < 0.05) return P.trim;                           // B-pillar
      if (c.c2 !== undefined && Math.abs(z - c.c2) < 0.05) return P.trim;
      if (c.pillars && Math.abs(((z - c.w0) / c.pillars) - Math.round((z - c.w0) / c.pillars)) * c.pillars < 0.06) return P.trim;
      return P.glass;
    }
    if (c.band && rel > c.band + 0.12 && ny > 0.3) return liveryPart(x, y, z);
    return P.glass;
  });

  if (!lo) details(G, s, stations, liveryPart);
  else lights(G, s, true);
  if (s.cabOnly) cargo(G, s, lo);
  return G.build();
}

// Body point lookups for placing lights and trim right on the surface.
function frontZ(s, x, y) {
  for (let z = s.L / 2; z > 0; z -= 0.005) {
    const st = station(s, z);
    if (y <= st.yt && y >= Math.max(st.yb, st.yn) && Math.abs(x) <= st.w - 0.02) return z;
  }
  return s.L / 2 - 0.1;
}
function rearZ(s, x, y) {
  const z0 = s.cabOnly ? s.L / 2 - s.cabOnly : -s.L / 2;
  for (let z = z0; z < 0; z += 0.005) {
    const st = station(s, z);
    if (y <= st.yt && y >= Math.max(st.yb, st.yn) && Math.abs(x) <= st.w - 0.02) return z;
  }
  return z0 + 0.1;
}

const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const SPH = new THREE.SphereGeometry(1, 10, 6);

// A lamp that wraps round the body corner: split into small pieces, each sitting on the surface
// and turned to face out (front: forward, back: backward).
function lamp(G, s, pt, x0, y, w, h, front, segs = 3, depth = 0.05) {
  const hw = s.W / 2;
  for (let k = 0; k < segs; k++) {
    const x = x0 + (segs > 1 ? (k - (segs - 1) / 2) * (w / segs) : 0);
    const z = front ? frontZ(s, x, y) : rearZ(s, x, y);
    const R = front ? s.Rf : s.Rr;
    let nx = 0, nz = front ? 1 : -1;
    if (Math.abs(x) > hw - R - 0.02) {
      const d = (planW(s, z + 0.01) - planW(s, z - 0.01)) / 0.02;   // how fast the body narrows
      nx = Math.sign(x); nz = front ? -d : -d;
      if (front) nz = Math.abs(nz); else nz = -Math.abs(nz);
      const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      // blend towards straight ahead / back for a natural lamp angle
      nx *= 0.55; nz = (front ? 1 : -1) * Math.sqrt(1 - nx * nx);
    }
    const yaw = Math.atan2(nx, nz);
    G.add(BOX, pt, x + nx * 0.005, y, z + nz * 0.005 - (front ? depth / 2 : -depth / 2), w / segs + 0.012, h, depth, 0, yaw, 0);
  }
}

function lights(G, s, lo) {
  const hl = s.L / 2, hw = s.W / 2;
  const h = s.head;
  const yF = curve(s.top, 0.97) - h.dy;
  const n = lo ? 1 : 3;
  for (const sx of [-1, 1]) {
    const x = sx * hw * h.x;
    if (h.round && !lo) G.add(SPH, P.head, x, yF, frontZ(s, x, yF) - 0.01, h.w / 2, h.h / 2, 0.06);
    else lamp(G, s, P.head, x, yF, h.w, h.h, true, n, 0.06);
    if (!lo) lamp(G, s, P.amber, sx * Math.min(hw - 0.12, hw * h.x + h.w * 0.62), yF - h.h * 0.12, 0.08, h.h * 0.55, true, 1, 0.04);
  }
  // Tail lights: a horizontal strip (tail) or tall lamps on the corners (tailL).
  const zr0 = s.cabOnly ? hl - s.cabOnly : -hl;
  if (s.tail) {
    const t = s.tail, y = curve(s.top, -0.93) - t.dy;
    for (const sx of [-1, 1]) lamp(G, s, P.tail, sx * hw * t.x, y, t.w, t.h, false, n, 0.05);
    if (!lo && s.wing) lamp(G, s, P.tail, 0, y, hw * 0.5, t.h * 0.5, false, 1, 0.04);
  } else if (s.tailL) {
    const t = s.tailL;
    const y = s.cabOnly ? 0.95 : Math.max(curve(s.bot, -0.98) + 0.25, curve(s.top, -0.95) - t.dy - t.h / 2);
    for (const sx of [-1, 1]) {
      const x = sx * Math.min(hw * t.x, hw - s.Rr * 0.5 - t.w / 2);
      if (s.cabOnly) G.add(BOX, P.tail, x, y, zr0 - 0.02, t.w, t.h, 0.05);
      else lamp(G, s, P.tail, x, y, t.w, t.h, false, lo ? 1 : 2, 0.04);
    }
  }
}

function details(G, s, stations, liveryPart) {
  const hl = s.L / 2, hw = s.W / 2, c = s.cab;
  lights(G, s, false);
  const zr0 = s.cabOnly ? hl - s.cabOnly : -hl;
  // Number plates (front: on the bumper; back: on the boot / tailgate).
  const plate = s.sign === 'taxi' ? P.yplate : P.plate;
  const yPf = curve(s.bot, 0.98) + 0.2;
  G.add(BOX, P.black, 0, yPf, frontZ(s, 0, yPf) + 0.005, 0.54, 0.15, 0.03);
  G.add(BOX, plate, 0, yPf, frontZ(s, 0, yPf) + 0.02, 0.5, 0.12, 0.02);
  const yPr = s.cabOnly ? 0.8 : (curve(s.bot, -0.98) + curve(s.top, -0.97)) / 2 + 0.02;
  const zPr = s.cabOnly ? zr0 - 0.06 : rearZ(s, 0, yPr);
  G.add(BOX, P.black, 0, yPr, zPr - 0.005, 0.54, 0.15, 0.03);
  G.add(BOX, plate, 0, yPr, zPr - 0.02, 0.5, 0.12, 0.02);
  // Mirrors on the doors at the base of the windshield.
  const zm = Math.min(c.z3 - 0.18, c.w1 - 0.05);
  const stm = station(s, zm);
  for (const sx of [-1, 1]) {
    G.add(BOX, P.black, sx * (stm.w + 0.03), stm.yt + 0.07, zm, 0.06, 0.04, 0.06);
    G.add(SPH, s.livery ? P.black : P.paint, sx * (stm.w + 0.09), stm.yt + 0.11, zm - 0.02, 0.075, 0.05, 0.045, 0, sx * 0.2, 0);
    G.add(BOX, P.glass, sx * (stm.w + 0.09), stm.yt + 0.11, zm - 0.065, 0.1, 0.06, 0.005, 0, sx * 0.2, 0);
  }
  // Door lines and handles (cars with doors along the side).
  if (!c.box) {
    const doors = s.cab.b < 50 ? [c.w1 + 0.12, c.b + 0.02, c.b - 0.02, c.w0 - 0.02] : [c.w1 + 0.12, c.w0 - 0.04];
    for (const z of doors) {
      const st = station(s, z);
      const y0 = Math.max(st.yb, st.yn) + 0.08, y1 = st.yt + 0.0;
      for (const sx of [-1, 1]) G.add(BOX, P.trim, sx * (st.w + 0.001), (y0 + y1) / 2, z, 0.006, y1 - y0, 0.012);
    }
    const handles = s.cab.b < 50 ? [c.b + 0.62, c.b - 0.42] : [c.w0 + 0.35];
    for (const z of handles) {
      const st = station(s, z);
      for (const sx of [-1, 1]) G.add(BOX, P.chrome, sx * (st.w + 0.012), st.yt - 0.14, z, 0.02, 0.035, 0.17);
    }
  } else if (s.seams === 'van') {
    for (const z of [c.w1 + 0.05, c.w0 - 0.05, -0.2]) {
      const st = station(s, z);
      for (const sx of [-1, 1]) G.add(BOX, P.trim, sx * (st.w + 0.001), (st.yn + 1.95) / 2, z, 0.006, 1.95 - st.yn - 0.1, 0.012);
    }
  }
  // Wipers.
  if (!c.box || s.cabOnly) {
    const st = station(s, c.z3 - 0.05);
    for (const x of [-0.32, 0.18]) G.add(BOX, P.black, x * s.W, st.yt + 0.05, c.z3 - 0.1, 0.5, 0.015, 0.025, 0, 0.12, 0.25);
  }
  // Exhaust pipe.
  if (!s.cabOnly) G.add(CYL, P.chrome, -hw * 0.55, curve(s.bot, -0.98) + 0.06, zr0 - 0.02, 0.045, 0.2, 0.045, Math.PI / 2, 0, 0);
  // Extras.
  if (s.rails) for (const sx of [-1, 1]) {
    const st = station(s, (c.z1 + c.z2) / 2);
    G.add(BOX, P.trim, sx * (st.w * 0.62), c.roof + 0.05, (c.z1 + c.z2) / 2, 0.05, 0.04, c.z2 - c.z1 + 0.2);
    for (const z of [c.z1 + 0.05, c.z2 - 0.05]) G.add(BOX, P.trim, sx * (st.w * 0.62), c.roof + 0.025, z, 0.06, 0.05, 0.08);
  }
  if (s.skid) {
    G.add(BOX, P.chrome, 0, curve(s.bot, 0.98) + 0.06, frontZ(s, 0, curve(s.bot, 0.98) + 0.06) + 0.02, s.W * 0.5, 0.05, 0.1);
    for (const sx of [-1, 1]) {   // side steps
      G.add(BOX, P.trim, sx * (hw + 0.02), 0.42, 0, 0.12, 0.04, 1.6);
    }
  }
  if (s.wing) {
    const y = curve(s.top, -0.9) + 0.22, z = -hl + 0.28;
    G.add(BOX, P.trim, 0, y, z, s.W * 0.9, 0.025, 0.3, -0.08, 0, 0);
    for (const sx of [-1, 1]) G.add(BOX, P.trim, sx * s.W * 0.32, y - 0.1, z + 0.05, 0.04, 0.2, 0.1);
  }
  if (s.intakes) for (const sx of [-1, 1]) {
    const st = station(s, -0.85);
    G.add(BOX, P.grille, sx * (st.w + 0.002), st.yt - 0.18, -0.85, 0.01, 0.12, 0.42);
  }
  if (s.sign === 'taxi') {
    G.add(BOX, P.black, 0, c.roof + 0.06, (c.z1 + c.z2) / 2, 0.6, 0.06, 0.24);
    G.add(BOX, { ...P.amber, c: [1, 0.85, 0.2], glow: 0.8 }, 0, c.roof + 0.16, (c.z1 + c.z2) / 2, 0.52, 0.14, 0.18);
  }
  if (s.beacon) {   // ambulance light bar + red cross panels
    G.add(BOX, P.trim, 0, c.roof + 0.05, c.z2 - 0.2, 1.3, 0.06, 0.3);
    G.add(BOX, { ...P.tail, glow: 0.9 }, -0.35, c.roof + 0.13, c.z2 - 0.2, 0.5, 0.1, 0.24);
    G.add(BOX, { ...P.head, c: [0.2, 0.4, 1] }, 0.35, c.roof + 0.13, c.z2 - 0.2, 0.5, 0.1, 0.24);
    for (const sx of [-1, 1]) {
      const st = station(s, -0.9);
      G.add(BOX, livery([0.8, 0.05, 0.04]), sx * (st.w + 0.003), 1.45, -0.9, 0.005, 0.5, 0.14);
      G.add(BOX, livery([0.8, 0.05, 0.04]), sx * (st.w + 0.003), 1.45, -0.9, 0.005, 0.14, 0.5);
    }
  }
  if (s.destination) {   // bus route board above the windshield
    const z = frontZ(s, 0, 2.7);
    G.add(BOX, P.black, 0, 2.72, Math.min(z, c.z3) + 0.02, 1.6, 0.3, 0.05);
    G.add(BOX, { ...P.amber, c: [1, 0.6, 0.1], glow: 0.9 }, 0, 2.72, Math.min(z, c.z3) + 0.05, 1.5, 0.2, 0.02);
    for (let z = -4.2; z <= 3; z += 2.4) for (const sx of [-1, 1]) G.add(BOX, P.trim, sx * (s.W / 2 + 0.002), 0.95, z, 0.006, 0.7, 0.012);
  }
}

// Goods truck: chassis + a big painted wooden cargo body behind the cab.
function cargo(G, s, lo) {
  const hl = s.L / 2, hw = s.W / 2;
  const z1 = hl - s.cabOnly - 0.08, z0 = -hl;
  const len = z1 - z0, mid = (z0 + z1) / 2;
  G.add(BOX, P.under, 0, 0.72, mid, s.W * 0.7, 0.24, len);                    // chassis
  G.add(BOX, livery([0.55, 0.32, 0.12], 0.7, 0), 0, 1.05, mid, s.W, 0.12, len);  // wooden floor
  const sideCol = livery([0.12, 0.42, 0.62], 0.55, 0);
  for (const sx of [-1, 1]) {
    G.add(BOX, sideCol, sx * (hw - 0.03), 1.75, mid, 0.06, 1.3, len);
    if (!lo) for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.1) G.add(BOX, livery([0.85, 0.65, 0.1], 0.5, 0), sx * (hw + 0.002), 1.75, z, 0.01, 1.28, 0.08);
    if (!lo) G.add(BOX, livery([0.8, 0.15, 0.12], 0.5, 0), sx * (hw + 0.003), 2.25, mid, 0.01, 0.16, len - 0.2);
  }
  G.add(BOX, sideCol, 0, 1.75, z0 + 0.03, s.W, 1.3, 0.06);                     // tail gate
  G.add(BOX, sideCol, 0, 1.9, z1 - 0.03, s.W, 1.6, 0.06);                      // front wall
  if (!lo) {
    G.add(BOX, livery([0.9, 0.7, 0.1], 0.5, 0), 0, 1.75, z0 - 0.003, s.W * 0.8, 0.5, 0.01);   // painted panel
    G.add(BOX, P.black, 0, 0.62, z0 + 0.1, s.W, 0.12, 0.1);                       // rear bumper
    for (const sx of [-1, 1]) G.add(BOX, P.black, sx * (hw - 0.2), 0.45, z0 + 0.3, 0.3, 0.35, 0.02);   // mud flaps
  }
  for (const sx of [-1, 1]) G.add(BOX, P.tail, sx * (hw - 0.25), 0.82, z0 + 0.02, 0.2, 0.12, 0.05);
}

// ---------- Auto-rickshaw (three-wheeler) ----------
function buildAuto(lowerRGB, topRGB, lo) {
  const G = new Geo();
  const W = 1.3, low = livery(lowerRGB, 0.35, 0.2), top = livery(topRGB, 0.6, 0);
  // Rounded front cowl (lofted), floor and rear body.
  const rings = [];
  const zs = lo ? [-1.32, -0.6, 0.4, 0.9, 1.2, 1.34] : [-1.32, -1.2, -0.9, -0.6, -0.2, 0.2, 0.5, 0.75, 0.9, 1.05, 1.18, 1.28, 1.34];
  for (const z of zs) {
    const w = z > 0.6 ? 0.65 - (z - 0.6) * 0.35 : 0.65;
    const yb = 0.3 + Math.max(0, z - 1.1) * 0.6;
    const yt = z > 0.75 ? 1.08 - (z - 0.75) * 0.5 : z > 0.4 ? 0.62 + (z - 0.4) * 1.3 : 0.62;
    const pts = [[0, yb], [w - 0.08, yb], [w, yb + 0.08], [w, yt - 0.08], [w - 0.08, yt], [0, yt + 0.01]];
    const n = pts.length;
    for (let k = n - 2; k >= 1; k--) pts.push([-pts[k][0], pts[k][1]]);
    rings.push({ z, pts });
  }
  loft(G, rings, true, (x, y, z, nx, ny) => (ny < -0.4 ? P.under : low), true);
  G.add(BOX, P.seat, 0, 0.86, -0.72, W - 0.14, 0.24, 0.78);                        // seat
  G.add(BOX, P.seat, 0, 1.2, -1.12, W - 0.14, 0.5, 0.12, 0.12, 0, 0);               // backrest
  G.add(BOX, P.black, 0, 1.28, -1.28, W, 1.1, 0.06);                                // back panel
  // Canopy: rounded black hood with a yellow top.
  const canopy = [];
  for (const z of [-1.32, -0.6, 0.2, 0.95, 1.08]) {
    const pts = [];
    for (let k = 0; k <= (lo ? 3 : 6); k++) { const a = (k / (lo ? 3 : 6)) * Math.PI; pts.push([Math.cos(a) * 0.68, 1.62 + Math.sin(a) * 0.28]); }
    canopy.push({ z, pts });
  }
  loft(G, canopy, false, (x, y, z, nx, ny) => (ny > 0.6 ? top : P.black));
  for (const sx of [-1, 1]) {
    G.add(BOX, P.black, sx * 0.62, 1.38, 1.0, 0.05, 0.55, 0.05, -0.35, 0, 0);       // front poles
    G.add(BOX, P.black, sx * 0.62, 1.3, -1.25, 0.05, 1.0, 0.05);
    G.add(BOX, low, sx * 0.64, 0.98, -0.95, 0.04, 0.44, 0.6);                        // side panels
  }
  G.add(BOX, P.glass, 0, 1.38, 1.06, W - 0.22, 0.56, 0.02, -0.38, 0, 0);            // windshield
  G.add(BOX, P.chrome, 0, 1.12, 0.86, 0.85, 0.04, 0.04);                            // handlebar
  G.add(BOX, P.head, 0, 0.98, 1.36, 0.2, 0.16, 0.05);
  for (const sx of [-1, 1]) G.add(BOX, P.tail, sx * 0.52, 0.58, -1.35, 0.14, 0.1, 0.04);
  G.add(BOX, P.yplate, 0, 0.5, -1.36, 0.36, 0.12, 0.02);
  return G.build();
}

// ---------- Rescue speedboat ----------
function buildBoat() {
  const G = new Geo();
  const rings = [];
  for (const z of [-2.9, -2.4, -1.5, -0.5, 0.5, 1.4, 2.0, 2.5, 2.8, 2.95]) {
    const k = Math.max(0, (z - 0.8) / 2.15);
    const w = 1.1 * Math.sqrt(Math.max(0.02, 1 - k * k));
    const keel = 0.05 + Math.max(0, z - 1.6) * 0.45;
    const pts = [[0, keel], [w * 0.6, keel + 0.25], [w, 0.55], [w, 0.95], [0, 0.97]];
    const n = pts.length;
    for (let i = n - 2; i >= 1; i--) pts.push([-pts[i][0], pts[i][1]]);
    rings.push({ z, pts });
  }
  loft(G, rings, true, (x, y) => (y < 0.7 && y > 0.6 ? livery([0.75, 0.15, 0.12]) : P.paint), true);
  G.add(BOX, P.plate, 0, 0.98, -0.4, 1.9, 0.06, 4.2);
  G.add(BOX, P.glass, 0, 1.35, 0.9, 1.6, 0.6, 0.05, -0.5, 0, 0);
  G.add(BOX, P.seat, 0, 1.2, -0.3, 1.2, 0.4, 0.9);
  G.add(BOX, P.trim, 0, 0.9, -2.95, 0.6, 0.7, 0.5);
  G.add(BOX, { ...P.head, c: [0.2, 1, 0.3] }, 1.05, 1.0, 2.2, 0.1, 0.1, 0.1);
  G.add(BOX, P.tail, -1.05, 1.0, 2.2, 0.1, 0.1, 0.1);
  G.add(BOX, P.head, 0, 1.65, 0.85, 0.3, 0.12, 0.08);
  return G.build();
}

// ---------- One shared material per paint colour (lights, glass, chrome are in the vertex data) ----------
const paintCache = new Map();
function carMaterial(hex) {
  if (paintCache.has(hex)) return paintCache.get(hex);
  const m = new THREE.MeshPhysicalMaterial({ color: hex, vertexColors: true, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCarGlow = CAR_GLOW;
    sh.vertexShader = 'attribute vec4 pbr;\nvarying vec4 vPbr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = 'uniform float uCarGlow;\nvarying vec4 vPbr;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#if defined( USE_COLOR )\ndiffuseColor.rgb = mix(vColor, diffuseColor.rgb * vColor, vPbr.y);\n#endif')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.z;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mod(vPbr.w, 10.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * vPbr.x * (0.5 + uCarGlow * 2.8);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= max(vPbr.y, step(9.5, vPbr.w));');
  };
  m.customProgramCacheKey = () => 'cityThiefCar';
  paintCache.set(hex, m);
  return m;
}

// ---------- Wheels (global instanced meshes: 2 draw calls for every wheel in the city) ----------
function tyreGeometry() {
  const prof = [[0.6, -0.44], [0.84, -0.5], [0.95, -0.47], [1.0, -0.36], [1.0, 0.36], [0.95, 0.47], [0.84, 0.5], [0.6, 0.44]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22);
  g.rotateZ(-Math.PI / 2);   // axle along x
  return g;
}
function rimGeometry() {
  const G = new Geo();
  const alloy = { c: [0.8, 0.81, 0.84], paint: 0, r: 0.25, m: 0.9 };
  const disc = { c: [0.25, 0.24, 0.23], paint: 0, r: 0.6, m: 0.7 };
  const ring = new THREE.CylinderGeometry(0.64, 0.64, 0.8, 22, 1, true);
  G.add(ring, alloy, 0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2);
  G.add(CYL, disc, -0.05, 0, 0, 0.5, 0.05, 0.5, 0, 0, Math.PI / 2);              // brake disc
  G.add(CYL, alloy, 0.22, 0, 0, 0.17, 0.12, 0.17, 0, 0, Math.PI / 2);             // hub
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    G.add(BOX, alloy, 0.22, Math.sin(a) * 0.38, Math.cos(a) * 0.38, 0.07, 0.48, 0.12, a, 0, 0);   // spokes
  }
  for (let k = 0; k < 5; k++) { const a = (k / 5 + 0.1) * Math.PI * 2; G.add(CYL6, disc, 0.28, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0.025, 0.04, 0.025, 0, 0, Math.PI / 2); }
  return G.build();
}
const BURNT_COLOR = new THREE.Color(0.06, 0.05, 0.045);
const WHITE = new THREE.Color(1, 1, 1);
const _w = new THREE.Matrix4(), _car = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _we = new THREE.Euler(), _wp = new THREE.Vector3(), _ws = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class WheelSystem {
  constructor(game, max = 720) {
    this.game = game; this.max = max;
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92, metalness: 0 });
    const rimMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9, clearcoat: 0.6 });
    rimMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 pbr;\nvarying vec4 vPbr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
      sh.fragmentShader = 'varying vec4 vPbr;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.z;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.w;');
    };
    this.tyre = new THREE.InstancedMesh(tyreGeometry(), tyreMat, max);
    this.rim = new THREE.InstancedMesh(rimGeometry(), rimMat, max);
    for (const m of [this.tyre, this.rim]) {
      m.frustumCulled = false; m.castShadow = !!game.shadows; m.count = 0;
      for (let i = 0; i < max; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, WHITE); }
      game.scene.add(m);
    }
    this.free = []; this.used = 0; this.cars = new Set();
  }
  slot() { if (this.free.length) return this.free.pop(); if (this.used < this.max) return this.used++; return -1; }
  add(car) {
    const defs = car.vehicle && car.vehicle.wheels;
    if (!defs || !defs.length) return;
    car.wheelSlots = defs.map(() => this.slot());
    car.wheelSpin = 0; car.wheelSteer = 0; car.wheelPrev = null;
    this.cars.add(car);
    this.tyre.count = this.rim.count = this.used;
  }
  remove(car) {
    if (!car.wheelSlots) return;
    for (const i of car.wheelSlots) if (i >= 0) { this.tyre.setMatrixAt(i, ZERO); this.rim.setMatrixAt(i, ZERO); this.free.push(i); }
    car.wheelSlots = null;
    this.cars.delete(car);
    this.dirty = true;
  }
  update(dt) {
    const g = this.game, cam = g.camera.position, D = g.driving;
    let colors = false;
    for (const car of this.cars) {
      const mesh = car.mesh;
      if (!mesh.parent || car.inactive) { this.remove(car); continue; }
      const defs = car.vehicle.wheels;
      // Spin from the real movement, steer from the turn (or the player's steering).
      const pv = car.wheelPrev;
      if (pv && dt > 0) {
        const moved = (car.x - pv.x) * Math.sin(car.yaw) + (car.z - pv.z) * Math.cos(car.yaw);
        car.wheelSpin += moved / (defs[0].r || 0.33);
        let want;
        if (D && D.car === car) want = -(D.steer || 0) * 0.5;
        else {
          let dy = car.yaw - pv.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          const sp = Math.abs(moved) / dt;
          want = sp > 0.5 ? Math.max(-0.5, Math.min(0.5, Math.atan((dy / dt) * 2.7 / sp))) : car.wheelSteer;
        }
        car.wheelSteer += (want - car.wheelSteer) * Math.min(1, dt * 8);
      }
      car.wheelPrev = { x: car.x, z: car.z, yaw: car.yaw };
      const far = !mesh.visible || (cam.x - car.x) ** 2 + (cam.z - car.z) ** 2 > 140 * 140;
      if (car.exploded && !car.wheelBurnt) {
        car.wheelBurnt = true;
        for (const i of car.wheelSlots) if (i >= 0) { this.tyre.setColorAt(i, BURNT_COLOR); this.rim.setColorAt(i, BURNT_COLOR); }
        colors = true;
      }
      _car.compose(mesh.position, mesh.quaternion, mesh.scale);
      for (let k = 0; k < defs.length; k++) {
        const i = car.wheelSlots[k];
        if (i < 0) continue;
        if (far) { this.tyre.setMatrixAt(i, ZERO); this.rim.setMatrixAt(i, ZERO); continue; }
        const w = defs[k];
        const left = w.x < 0;
        const steer = w.front ? car.wheelSteer : 0;
        _we.set(left ? -car.wheelSpin : car.wheelSpin, steer + (left ? Math.PI : 0), 0, 'YXZ');
        _loc.compose(_wp.set(w.x, w.y, w.z), _wq.setFromEuler(_we), _ws.set(w.w, w.r, w.r));
        _w.multiplyMatrices(_car, _loc);
        this.tyre.setMatrixAt(i, _w);
        this.rim.setMatrixAt(i, _w);
      }
    }
    this.tyre.instanceMatrix.needsUpdate = true; this.rim.instanceMatrix.needsUpdate = true;
    if (colors) { this.tyre.instanceColor.needsUpdate = true; this.rim.instanceColor.needsUpdate = true; }
    this.tyre.count = this.rim.count = this.used;
  }
}

// ---------- Making a vehicle ----------
const geoCache = new Map();
function bodyGeometry(type, lo) {
  const key = type + (lo ? ':lo' : '');
  if (!geoCache.has(key)) geoCache.set(key, buildBody(SPECS[type], lo));
  return geoCache.get(key);
}
function wheelDefs(type) {
  if (type === 'boat') return [];
  if (type === 'auto') return [{ x: 0.001, y: 0.24, z: 1.0, r: 0.24, w: 0.14, front: true }, { x: 0.6, y: 0.24, z: -0.95, r: 0.24, w: 0.14 }, { x: -0.6, y: 0.24, z: -0.95, r: 0.24, w: 0.14 }];
  const s = SPECS[type], out = [];
  s.wheels.forEach((wh, i) => {
    for (const sx of [-1, 1]) out.push({ x: sx * (s.W / 2 - wh.w / 2 - 0.04), y: wh.r, z: wh.z, r: wh.r, w: wh.w, front: i === 0 });
  });
  return out;
}
const AUTO_COLORS = [[[0.12, 0.48, 0.18], [0.95, 0.76, 0.08]], [[0.06, 0.06, 0.06], [0.95, 0.76, 0.08]], [[0.12, 0.48, 0.18], [0.95, 0.76, 0.08]]];
let decalMaterial = null;

export function makeVehicle(type, colorHex, castShadow) {
  const g = new THREE.Group();
  let body;
  if (type === 'auto') {
    const k = Math.floor(Math.random() * AUTO_COLORS.length);
    const key = 'auto' + k;
    if (!geoCache.has(key)) geoCache.set(key, buildAuto(...AUTO_COLORS[k], false));
    body = new THREE.Mesh(geoCache.get(key), carMaterial(0xffffff));
  } else if (type === 'boat') {
    if (!geoCache.has('boat')) geoCache.set('boat', buildBoat());
    body = new THREE.Mesh(geoCache.get('boat'), carMaterial(colorHex));
  } else {
    if (!SPECS[type]) type = 'sedan';
    const livered = !!SPECS[type].livery;
    body = new THREE.Mesh(bodyGeometry(type, false), carMaterial(livered ? 0xffffff : colorHex));
    body.userData.lod = [bodyGeometry(type, false), bodyGeometry(type, true)];
  }
  body.castShadow = castShadow; body.receiveShadow = false;
  g.add(body);
  const out = { group: g, body, wheels: wheelDefs(type) };
  if (type === 'police') {
    const s = SPECS.police;
    if (!decalMaterial) decalMaterial = new THREE.MeshStandardMaterial({ map: policeDecal(), roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
    const side = s.W / 2 + 0.012;
    const decal = new THREE.Mesh(mergeDecals([
      signGeometry(side, 0.86, -0.2, 2.6, 0.48, 1, 0, [0, 0, 1, 1]),
      signGeometry(-side, 0.86, -0.2, 2.6, 0.48, -1, 0, [0, 0, 1, 1]),
    ]), decalMaterial);
    g.add(decal);
    // Light bar: dark base + red and blue lamps that flash in a chase.
    const roofY = s.cab.roof + 0.03;
    const base = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
    base.position.set(0, roofY + 0.05, -0.2); base.scale.set(1.25, 0.07, 0.3);
    const red = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x551111, toneMapped: false }));
    red.position.set(-0.33, roofY + 0.14, -0.2); red.scale.set(0.52, 0.12, 0.26);
    const blue = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x111a55, toneMapped: false }));
    blue.position.set(0.33, roofY + 0.14, -0.2); blue.scale.set(0.52, 0.12, 0.26);
    g.add(base, red, blue);
    out.red = red.material;
    out.blue = blue.material;
  }
  return out;
}
function mergeDecals(list) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const gq of list) {
    const base = pos.length / 3;
    pos.push(...gq.attributes.position.array); nor.push(...gq.attributes.normal.array); uv.push(...gq.attributes.uv.array);
    for (const i of gq.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Detailed body close up, simple body far away (phones draw many cars).
export function carLod(car, camX, camZ) {
  const body = car.vehicle && car.vehicle.body;
  const lod = body && body.userData.lod;
  if (!lod) return;
  const d2 = (camX - car.x) ** 2 + (camZ - car.z) ** 2;
  const want = d2 > (car.lodFar ? 52 * 52 : 60 * 60) ? 1 : 0;
  if ((want === 1) !== !!car.lodFar) { car.lodFar = want === 1; body.geometry = lod[want]; }
}

// Headlight beams for night driving: two soft cones + a bright patch on the road (one draw call).
let beamGeo = null;
const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
export function makeBeams(halfL, halfW, lightY) {
  if (!beamGeo) {
    const parts = [];
    for (const sx of [-1, 1]) {
      const cone = new THREE.CylinderGeometry(0.12, 1.9, 13, 12, 4, true).rotateX(-Math.PI / 2).translate(sx * 0.55, 0, 6.5);
      const n = cone.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const z = cone.attributes.position.getZ(i); const k = Math.max(0, 1 - z / 13) * 0.09; col[i * 3] = k; col[i * 3 + 1] = k * 0.95; col[i * 3 + 2] = k * 0.8; }
      cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(cone);
    }
    const disc = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2).scale(2.6, 1, 6).translate(0, 0, 8.5);
    const n = disc.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = i === 0 ? 0.28 : 0.0; col[i * 3] = k; col[i * 3 + 1] = k * 0.93; col[i * 3 + 2] = k * 0.78; }
    disc.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const G = [];
    for (const p of [...parts, disc]) { const q = p.toNonIndexed(); q.deleteAttribute('uv'); q.deleteAttribute('normal'); G.push(q); }
    const pos = [], cl = [];
    for (const q of G) { pos.push(...q.attributes.position.array); cl.push(...q.attributes.color.array); }
    beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  }
  const m = new THREE.Mesh(beamGeo, beamMat);
  m.position.set(0, lightY, halfL);
  m.renderOrder = 3;
  m.frustumCulled = false;
  return m;
}
