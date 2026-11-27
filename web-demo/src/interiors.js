// Walk into ANY building in Navapur. Every shop and office tower has a real front door with glass
// doors that slide open when someone comes close. When Vikram walks up to a building, its inside is
// built: a shop that matches the sign over the door (phones, sweets, medicines, saris...), with a
// shopkeeper behind the counter, customers, shelves full of things and a cash drawer.
// TALK to the owner, BUY what the shop sells, or ROB THE TILL (the alarm brings the police, and they
// come inside after you). Only the 3 nearest buildings are open at a time (cheap on phones), and
// everything is made of simple coloured boxes: nothing extra to download.
import * as THREE from 'three';
import { BOX, part, mergeParts, vertexColorShiny, vertexColorGlow } from './mesh.js';
import { FOOT_TOP } from './world.js';
import { AmbientPerson } from './ambient.js';
import { CharacterRig, loadedCrowd } from './characters.js';
import { dist, pick, seededRandom } from './util.js';
import { WEAPONS } from './weapons.js';
import { rollLoot } from './loot.js';
import { t as tr, tLabel } from './i18n.js';

const OPEN_DIST = 16, CLOSE_DIST = 30, MAX_OPEN = 3;
const T = 0.25;   // thickness of the front wall
const LIGHT = 0.66;   // overall brightness of the rooms (lit by their own tube lights)

// What each shop sign sells (same order as the shop signs in textures.js).
const SHOPS = [
  { kind: 'phones', name: 'NAVAPUR MOBILES', wall: 0xe9eef4, floor: [0xe4e7ec, 0xc8ced6], cash: [3000, 6500],
    buy: { label: 'NEW SIM ₹500', price: 500, fx: 'sim' }, hi: 'Naya phone chahiye? Best price in Navapur, boss!' },
  { kind: 'sweets', name: 'SRI LAKSHMI SWEETS', wall: 0xf7e8c6, floor: [0xeadcbf, 0xd2c09c], cash: [1200, 2600],
    buy: { label: 'LADDOO ₹40', price: 40, heal: 30 }, hi: 'Garam jalebi, taaza laddoo! Kya doon?' },
  { kind: 'tea', name: 'RAJU TEA STALL', wall: 0xdcead2, floor: [0xbca98c, 0xa8957a], cash: [400, 900],
    buy: { label: 'CHAI ₹20', price: 20, heal: 25 }, hi: 'Ek cutting chai? Sirf bees rupaye.' },
  { kind: 'hardware', name: 'GANESH HARDWARE', wall: 0xd9d5cd, floor: [0xa29e96, 0x8e8a83], cash: [1500, 3200],
    buy: { label: 'AMMO ₹600', price: 600, fx: 'ammo' }, hi: 'Pana, hathoda, taala... aur counter ke neeche "special" maal bhi.' },
  { kind: 'food', name: 'ANNAPURNA HOTEL', wall: 0xf2dcc0, floor: [0xcbb89a, 0xb6a284], cash: [1500, 3500],
    buy: { label: 'THALI ₹120', price: 120, heal: 60 }, hi: 'Aaiye, baithiye! Garam thali ready hai.' },
  { kind: 'medical', name: 'KUMAR MEDICALS', wall: 0xf4f8f7, floor: [0xe7edeb, 0xd0dad6], cash: [2000, 4200],
    buy: { label: 'FIRST AID ₹300', price: 300, heal: 100 }, hi: 'Dawai chahiye? Chot lagi hai kya?' },
  { kind: 'textiles', name: 'SHANTI TEXTILES', wall: 0xf4e3e9, floor: [0xd9c3a9, 0xc5ae93], cash: [2500, 5200],
    buy: { label: 'NEW SHIRT ₹400', price: 400, fx: 'look' }, hi: 'Silk saree, cotton shirt, sab milega!' },
  { kind: 'electric', name: 'GALLI ELECTRICALS', wall: 0xe7eaef, floor: [0xd0d4da, 0xbcc1c8], cash: [2000, 4500],
    buy: { label: 'NEW SIM ₹500', price: 500, fx: 'sim' }, hi: 'Bulb, pankha, wire... aur nayi SIM bhi.' },
  { kind: 'grocery', name: 'BALAJI GENERAL STORE', wall: 0xf3ebd8, floor: [0xdad0b9, 0xc6bba3], cash: [1500, 3000],
    buy: { label: 'SNACKS ₹50', price: 50, heal: 35 }, hi: 'Haan bolo bhai, kya doon?' },
  { kind: 'auto', name: 'VIJAY AUTO PARTS', wall: 0xd6d9dd, floor: [0x919396, 0x7f8285], cash: [2000, 4000],
    buy: { label: 'AMMO ₹600', price: 600, fx: 'ammo' }, hi: 'Gaadi ka kaam? Under the counter bhi maal milta hai.' },
  { kind: 'tailor', name: 'NEW STAR TAILORS', wall: 0xebdff1, floor: [0xcfb99d, 0xbba586], cash: [800, 1800],
    buy: { label: 'NEW SHIRT ₹400', price: 400, fx: 'look' }, hi: 'Naap de do, kal tak silai ho jayegi.' },
  { kind: 'fruit', name: 'DURGA FRUIT MART', wall: 0xe5f0d9, floor: [0xc3b59b, 0xafa085], cash: [600, 1500],
    buy: { label: 'FRUIT ₹30', price: 30, heal: 40 }, hi: 'Taaze phal, seedha bagaan se!' },
];
const TOWER = { kind: 'office', name: 'NAVAPUR TOWERS', wall: 0xeceef0, floor: [0xeae6de, 0xd8d1c5], cash: [3000, 6000],
  buy: null, hi: 'Welcome to Navapur Towers. Appointment hai aapka?' };
const ICONS = { phones: '📱', electric: '📱', sweets: '🍬', tea: '☕', hardware: '🧰', auto: '🧰', food: '🍛', medical: '💊', textiles: '👕', tailor: '👕', grocery: '🍪', fruit: '🍎' };
for (const s of SHOPS) s.icon = ICONS[s.kind] || '🛒';
for (const s of [...SHOPS, TOWER]) s.job = s.kind === 'office' ? 'Receptionist, Navapur Towers' : `Owner, ${s.name}`;

const ROB_SAY = ['Haath upar! Galla khol, jaldi!', 'Cash drawer, abhi! No heroes today.', 'Chup chaap paisa nikaalo!'];
const ROB_ANSWER = ['Mat maaro! Sab le lo!', 'Le lo, le lo! Goli mat chalana!', 'Bhagwan ke liye, shant!'];
const EMPTY = ['Galla khaali hai! Abhi abhi loot liya tumne!', 'Kuch nahi bacha bhai, jao yahan se!'];
const PALETTES = {
  phones: [0xf5f5f5, 0x1b1b1d, 0x2f6fd6, 0xdfe6ee, 0x5e6b7a], sweets: [0xf7a823, 0xf5d76e, 0xfff4dc, 0xe85d9e, 0x7cc86b, 0xc97b2a],
  grocery: [0xe63946, 0xf1c40f, 0x2a9d8f, 0x264653, 0xf4a261, 0xffffff, 0x8e44ad, 0x3a86ff], medical: [0xffffff, 0xe8f4fb, 0x7fc8a9, 0xe76f51, 0x457b9d, 0xf6bd60],
  hardware: [0x555b61, 0x9aa1a8, 0xc0392b, 0xe3a21a, 0x2c3e50, 0x7f8c8d], auto: [0x2b2d2f, 0x5d6d7e, 0x1f6fb2, 0xc0392b, 0xbdc3c7],
  textiles: [0xc0392b, 0x8e44ad, 0x16a085, 0xf39c12, 0xd35400, 0x2980b9, 0xe84393, 0xf1c40f], electric: [0xf5f5f5, 0xf1c40f, 0x2c3e50, 0xe67e22, 0x95a5a6],
  fruit: [0xf4a62a, 0xc0392b, 0xf1d23d, 0x7ac74f, 0xf28c28, 0x9b1b30], tailor: [0x34495e, 0xc0392b, 0x1abc9c, 0xf5cba7, 0x8e44ad, 0xecf0f1],
  tea: [0xc9ced4, 0x8b5a2b, 0xf2e2c4], food: [0xc9ced4, 0xd35400, 0xf1c40f], office: [0x2c3e50, 0xbdc3c7],
};

// ---------------------------------------------------------------------------
// Room builder: works in the building's own directions. u = along the front wall (metres from the
// middle of the door), v = into the building (0 = the front wall), y = up from the floor.
// Colours get simple "baked" light: tops bright, sides softer, undersides dark.
// ---------------------------------------------------------------------------
const _c = new THREE.Color();

// Fast geometry writer: boxes, cylinders and flat faces go straight into plain arrays
// (no small meshes to merge), so a whole shop is built in a millisecond or two.
const unitCyl = (sides) => {   // a unit cylinder (radius 1, height 1) as plain arrays
  const g = new THREE.CylinderGeometry(1, 1, 1, sides);
  return { p: Array.from(g.attributes.position.array), n: Array.from(g.attributes.normal.array), i: Array.from(g.index.array) };
};
const CYL_T = unitCyl(8), CYL_LOW = unitCyl(6);
class Mesher {
  constructor(shadeCeil = 0) { this.p = []; this.n = []; this.c = []; this.i = []; this.ceil = shadeCeil; }
  // Simple "baked" light: tops bright, sides softer, undersides dark, a little darker low down.
  col(ny, nx, nz, y) {
    if (!this.ceil) { this.c.push(_c.r, _c.g, _c.b); return; }
    let k = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.62 : 0.8 + 0.06 * nx + 0.04 * nz;
    k *= (0.8 + 0.2 * Math.min(1, Math.max(0, (y - FOOT_TOP) / this.ceil))) * LIGHT;
    this.c.push(_c.r * k, _c.g * k, _c.b * k);
  }
  // A flat face from 4 corners (in order round the edge) looking along (nx, ny, nz).
  face(a, b, c, d, nx, ny, nz) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const flip = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0;
    const base = this.p.length / 3;
    for (const q of flip ? [d, c, b, a] : [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.col(ny, nx, nz, q[1]); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(x0, y0, z0, x1, y1, z1) {
    const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1], E = [x0, y1, z0], F = [x1, y1, z0], G = [x1, y1, z1], H = [x0, y1, z1];
    this.face(E, F, G, H, 0, 1, 0); this.face(A, B, C, D, 0, -1, 0);
    this.face(B, C, G, F, 1, 0, 0); this.face(A, D, H, E, -1, 0, 0);
    this.face(D, C, G, H, 0, 0, 1); this.face(A, B, F, E, 0, 0, -1);
  }
  // Cylinder: standing (axis up) or lying along x ('x') or z ('z').
  cyl(x, y, z, r, h, axis = 'y', T = CYL_T) {
    const base = this.p.length / 3;
    for (let k = 0; k < T.p.length; k += 3) {
      const px = T.p[k] * r, py = T.p[k + 1] * h, pz = T.p[k + 2] * r, nx = T.n[k], ny = T.n[k + 1], nz = T.n[k + 2];
      if (axis === 'y') { this.p.push(x + px, y + py, z + pz); this.n.push(nx, ny, nz); this.col(ny, nx, nz, y + py); }
      else if (axis === 'x') { this.p.push(x - py, y + px, z + pz); this.n.push(-ny, nx, nz); this.col(nx, -ny, nz, y + px); }
      else { this.p.push(x + px, y - pz, z + py); this.n.push(nx, -nz, ny); this.col(-nz, nx, ny, y - pz); }
    }
    for (const k of T.i) this.i.push(base + k);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
const setCol = (color) => { if (color instanceof THREE.Color) _c.copy(color); else _c.setHex(color); };

class Room {
  constructor(D, uL, uR, depth, ceil, seed) {
    this.D = D; this.uL = uL; this.uR = uR; this.depth = depth; this.ceil = ceil;
    this.Vx = -D.nx; this.Vz = -D.nz; this.Ux = this.Vz; this.Uz = -this.Vx;
    this.mesh = new Mesher(ceil); this.lit = new Mesher(0);   // normal parts / glowing parts
    this.solids = []; this.seats = []; this.spots = [];
    this.r = seededRandom(seed);
  }
  wx(u, v) { return this.D.x + this.Ux * u + this.Vx * v; }
  wz(u, v) { return this.D.z + this.Uz * u + this.Vz * v; }
  rect(u0, u1, v0, v1) {
    const ax = this.wx(u0, v0), az = this.wz(u0, v0), bx = this.wx(u1, v1), bz = this.wz(u1, v1);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  }
  // An upright box between (u0..u1, v0..v1), from height y0 to y1.
  box(u0, u1, y0, y1, v0, v1, color, glow = false) {
    const R = this.rect(u0, u1, v0, v1);
    setCol(color);
    (glow ? this.lit : this.mesh).box(R.x0, FOOT_TOP + y0, R.z0, R.x1, FOOT_TOP + y1, R.z1);
  }
  // A standing cylinder (pots, stools, tyres) or one lying across the room (cloth rolls).
  cyl(u, v, y0, h, rad, color, lying = false) {
    setCol(color);
    const x = this.wx(u, v), z = this.wz(u, v);
    if (!lying) this.mesh.cyl(x, FOOT_TOP + y0 + h / 2, z, rad, h, 'y');
    else this.mesh.cyl(x, FOOT_TOP + y0 + rad, z, rad, h, Math.abs(this.Ux) > 0.5 ? 'x' : 'z', CYL_LOW);
  }
  // A flat rectangle (floor tile or ceiling) and a wall face (from A to B, facing into the room).
  flat(u0, u1, v0, v1, y, color, up = true, glow = false) {
    const R = this.rect(u0, u1, v0, v1), Y = FOOT_TOP + y;
    setCol(color);
    (glow ? this.lit : this.mesh).face([R.x0, Y, R.z0], [R.x1, Y, R.z0], [R.x1, Y, R.z1], [R.x0, Y, R.z1], 0, up ? 1 : -1, 0);
  }
  wall(uA, vA, uB, vB, y0, y1, color) {
    // Normal: points to the middle of the room.
    let nu = -(vB - vA), nv = uB - uA;
    const mu = (this.uL + this.uR) / 2 - uA, mv = this.depth / 2 - vA;
    if (nu * mu + nv * mv < 0) { nu = -nu; nv = -nv; }
    const l = Math.hypot(nu, nv); nu /= l; nv /= l;
    const nx = this.Ux * nu + this.Vx * nv, nz = this.Uz * nu + this.Vz * nv;
    const ax = this.wx(uA, vA), az = this.wz(uA, vA), bx = this.wx(uB, vB), bz = this.wz(uB, vB);
    const Y0 = FOOT_TOP + y0, Y1 = FOOT_TOP + y1;
    setCol(color);
    this.mesh.face([ax, Y0, az], [bx, Y0, bz], [bx, Y1, bz], [ax, Y1, az], nx, 0, nz);
  }
  solid(u0, u1, v0, v1, h, low = true) { this.solids.push({ ...this.rect(u0, u1, v0, v1), h, nosight: low && h < 1.5 }); }
  rnd(a, b) { return a + this.r() * (b - a); }
  pickC(list) { return list[Math.floor(this.r() * list.length)]; }

  // ---------- Pieces ----------
  // Floor tiles, walls with a skirting band, the ceiling with tube lights, the front wall with the doorway.
  shell(S) {
    const { uL, uR, depth: Dv, ceil: C, D } = this, w = D.w;
    const tile = S.kind === 'office' ? 1.2 : 0.8;
    for (let i = 0, u = uL; u < uR - 0.01; i++, u += tile) {
      for (let j = 0, v = T; v < Dv - 0.01; j++, v += tile) this.flat(u, Math.min(uR, u + tile), v, Math.min(Dv, v + tile), 0.012, S.floor[(i + j) % 2]);
    }
    // Walls (left, right, back) and their skirting.
    const skirt = new THREE.Color(S.wall).multiplyScalar(0.55);
    this.wall(uL, T, uL, Dv, 0, C, S.wall); this.wall(uR, T, uR, Dv, 0, C, S.wall); this.wall(uL, Dv, uR, Dv, 0, C, S.wall);
    this.box(uL, uL + 0.03, 0, 0.14, T, Dv, skirt); this.box(uR - 0.03, uR, 0, 0.14, T, Dv, skirt); this.box(uL, uR, 0, 0.14, Dv - 0.03, Dv, skirt);
    // Front wall: thick, with the doorway (its edges are the door frame's job).
    const fc = new THREE.Color(S.wall).multiplyScalar(0.92);
    this.box(uL, -w / 2, 0, C, 0.02, T, fc); this.box(w / 2, uR, 0, C, 0.02, T, fc); this.box(-w / 2, w / 2, D.h, C, 0.02, T, fc);
    // Ceiling + tube lights.
    this.flat(uL, uR, T, Dv, C, 0xf2f0ea, false);
    const light = new THREE.Color(2.4, 2.3, 2.1);
    for (let u = uL + 1.6; u < uR - 1; u += 3.2) for (let v = T + 1.8; v < Dv - 0.8; v += 3) this.box(u - 0.6, u + 0.6, C - 0.06, C - 0.02, v - 0.06, v + 0.06, light, true);
    // A big shop name board on the back wall (the colour of the sign outside).
    if (S.kind !== 'office') this.box(-1.6, 1.6, C - 0.75, C - 0.15, Dv - 0.05, Dv - 0.02, new THREE.Color(S.board || 0x1f6fb2).multiplyScalar(1.4), true);
  }
  // Shelves on a wall, filled with goods. side: 'back' | 'left' | 'right'.
  shelves(side, a0, a1, h, levels, palette, deep = 0.45, frame = 0x8a6a46) {
    const { uL, uR, depth: Dv } = this;
    const R = side === 'back' ? [a0, a1, Dv - deep, Dv] : side === 'left' ? [uL, uL + deep, a0, a1] : [uR - deep, uR, a0, a1];
    const [u0, u1, v0, v1] = R;
    // Side posts and boards.
    if (side === 'back') { this.box(u0, u0 + 0.05, 0, h, v0, v1, frame); this.box(u1 - 0.05, u1, 0, h, v0, v1, frame); }
    else { this.box(u0, u1, 0, h, v0, v0 + 0.05, frame); this.box(u0, u1, 0, h, v1 - 0.05, v1, frame); }
    for (let i = 0; i < levels; i++) {
      const y = 0.12 + (i * (h - 0.25)) / (levels - 1);
      this.box(u0, u1, y - 0.03, y, v0, v1, frame);
      if (i === levels - 1) break;
      // Goods along the shelf.
      const along = side === 'back' ? [u0 + 0.08, u1 - 0.08] : [v0 + 0.08, v1 - 0.08];
      for (let p = along[0]; p < along[1] - 0.1;) {
        const wdt = this.rnd(0.14, 0.42), ht = this.rnd(0.14, Math.min(0.42, (h - 0.25) / (levels - 1) - 0.08));
        const e = Math.min(along[1], p + wdt), c = this.pickC(palette);
        if (side === 'back') this.box(p, e, y, y + ht, v0 + 0.06, v1 - 0.06, c);
        else this.box(u0 + 0.06, u1 - 0.06, y, y + ht, p, e, c);
        p = e + this.rnd(0.02, 0.08);
      }
    }
    this.solid(u0, u1, v0, v1, h, false);
  }
  // The counter with the cash drawer; returns where the owner stands.
  counter(u0, u1, v0, v1, top, front, tillU) {
    this.box(u0, u1, 0, 0.95, v0, v1, front);
    this.box(u0 - 0.03, u1 + 0.03, 0.95, 1.0, v0 - 0.03, v1 + 0.03, top);
    // Cash drawer + a little screen.
    this.box(tillU - 0.22, tillU + 0.22, 1.0, 1.16, v0 + 0.12, v1 - 0.12, 0x2b2b2e);
    this.box(tillU - 0.16, tillU + 0.16, 1.16, 1.2, v0 + 0.18, v1 - 0.18, 0x3f9b4f);
    this.box(tillU - 0.12, tillU + 0.12, 1.2, 1.36, v1 - 0.16, v1 - 0.12, 0x111111);
    this.box(tillU - 0.1, tillU + 0.1, 1.22, 1.34, v1 - 0.165, v1 - 0.155, new THREE.Color(0.4, 1.2, 0.8), true);
    this.solid(u0, u1, v0, v1, 1.0);
    this.till = { u: tillU, v: (v0 + v1) / 2 };
  }
  table(u, v, w, d, color = 0x8a5a33) {
    this.box(u - w / 2, u + w / 2, 0.72, 0.77, v - d / 2, v + d / 2, color);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(u + a * (w / 2 - 0.08) - 0.03, u + a * (w / 2 - 0.08) + 0.03, 0, 0.72, v + b * (d / 2 - 0.08) - 0.03, v + b * (d / 2 - 0.08) + 0.03, 0x3a2a1c);
    this.solid(u - w / 2, u + w / 2, v - d / 2, v + d / 2, 0.77);
  }
  chair(u, v, faceV, color = 0xb03a2e) {
    // faceV: +1 = looks into the building, -1 = looks at the door.
    this.box(u - 0.22, u + 0.22, 0.42, 0.47, v - 0.22, v + 0.22, color);
    this.box(u - 0.22, u + 0.22, 0.47, 0.95, v - faceV * 0.22, v - faceV * 0.17, color);
    this.box(u - 0.2, u - 0.16, 0, 0.42, v - 0.2, v + 0.2, 0x2a2a2a); this.box(u + 0.16, u + 0.2, 0, 0.42, v - 0.2, v + 0.2, 0x2a2a2a);
    this.seats.push({ u, v: v + faceV * 0.05, faceV });
  }
  plant(u, v) {
    this.cyl(u, v, 0, 0.45, 0.24, 0x9c5b33);
    this.box(u - 0.3, u + 0.3, 0.45, 1.25, v - 0.3, v + 0.3, 0x2f7d3a);
    this.box(u - 0.2, u + 0.2, 1.2, 1.6, v - 0.2, v + 0.2, 0x3e9b4a);
    this.solid(u - 0.3, u + 0.3, v - 0.3, v + 0.3, 1.2);
  }
  poster(side, a, y, w, h, color) {
    const { uL, uR, depth: Dv } = this;
    if (side === 'left') this.box(uL, uL + 0.03, y, y + h, a - w / 2, a + w / 2, color, true);
    else if (side === 'right') this.box(uR - 0.03, uR, y, y + h, a - w / 2, a + w / 2, color, true);
    else this.box(a - w / 2, a + w / 2, y, y + h, Dv - 0.03, Dv, color, true);
  }
}

// ---------------------------------------------------------------------------
// Inside each kind of building.
// ---------------------------------------------------------------------------
function furnish(B, S) {
  const { uL, uR, depth: Dv, ceil: C } = B, pal = PALETTES[S.kind] || PALETTES.grocery;
  const W = uR - uL;
  const retail = () => {
    B.shelves('back', uL + 0.15, uR - 0.15, 2.5, 5, pal);
    B.shelves('left', T + 1.0, Dv - 3.4, 2.2, 4, pal);
    B.shelves('right', T + 1.0, Dv - 3.4, 2.2, 4, pal);
    B.counter(uL + 0.9, uR - 1.7, Dv - 2.95, Dv - 2.3, 0xd8d2c6, 0x8a6a46, uR - 2.6);
    B.owner = { u: uR - 2.6, v: Dv - 1.55 };
  };
  switch (S.kind) {
    case 'phones': case 'electric': {
      B.shelves('back', uL + 0.15, uR - 0.15, 2.5, 5, pal, 0.4, 0xdfe3e8);
      B.counter(uL + 0.9, uR - 1.7, Dv - 2.95, Dv - 2.3, 0xbfe3ee, 0xf2f4f6, uR - 2.6);
      B.owner = { u: uR - 2.6, v: Dv - 1.55 };
      // Glass display cases with phones, along both sides.
      for (const side of [-1, 1]) {
        const u0 = side < 0 ? uL + 0.1 : uR - 0.9, u1 = u0 + 0.8;
        B.box(u0, u1, 0, 0.85, T + 1.0, Dv - 3.6, 0xf2f4f6);
        B.box(u0 - 0.02, u1 + 0.02, 0.85, 0.9, T + 0.98, Dv - 3.58, 0x9fd6e6);
        for (let v = T + 1.25; v < Dv - 3.8; v += 0.42) B.box(u0 + 0.25, u0 + 0.55, 0.9, 0.92, v, v + 0.16, S.kind === 'phones' ? 0x15161a : 0xf1c40f);
        B.solid(u0, u1, T + 1.0, Dv - 3.6, 0.9);
        // Bright ads above them.
        B.poster(side < 0 ? 'left' : 'right', (T + Dv) / 2 - 1, 1.5, 1.2, 0.8, pick([new THREE.Color(0.2, 0.45, 1.1), new THREE.Color(1.1, 0.3, 0.6), new THREE.Color(1.0, 0.8, 0.2)]));
        B.poster(side < 0 ? 'left' : 'right', (T + Dv) / 2 + 0.6, 1.5, 0.9, 0.8, new THREE.Color(0.2, 0.9, 0.7));
      }
      if (S.kind === 'electric') for (let u = uL + 1.5; u < uR - 1; u += 2) B.box(u - 0.07, u + 0.07, C - 0.6, C - 0.46, Dv / 2 - 0.07, Dv / 2 + 0.07, new THREE.Color(2.6, 2.2, 1.2), true);
      B.spots.push({ u: uL + 1.3, v: Dv / 2 - 1, face: 'left' }, { u: uR - 1.3, v: Dv / 2, face: 'right' }, { u: 0.6, v: Dv - 3.6, face: 'back' });
      break;
    }
    case 'sweets': {
      B.shelves('back', uL + 0.15, uR - 0.15, 2.4, 4, [0xe85d9e, 0xf7a823, 0xf5d76e, 0xffffff], 0.4, 0xc9a66b);
      // Long glass sweet counter with trays of colourful sweets.
      B.counter(uL + 0.6, uR - 1.7, Dv - 3.1, Dv - 2.3, 0xd6eef4, 0xf6efe2, uR - 2.4);
      B.owner = { u: uR - 2.4, v: Dv - 1.55 };
      for (let u = uL + 0.8; u < uR - 2.9; u += 0.62) {
        B.box(u, u + 0.52, 1.0, 1.03, Dv - 3.0, Dv - 2.45, 0xc0c4c8);
        const c = B.pickC(pal);
        for (let i = 0; i < 6; i++) B.box(u + 0.05 + (i % 3) * 0.16, u + 0.15 + (i % 3) * 0.16, 1.03, 1.12, Dv - 2.95 + Math.floor(i / 3) * 0.24, Dv - 2.83 + Math.floor(i / 3) * 0.24, c);
      }
      B.table(uL + 1.4, T + 2.6, 1.0, 0.8, 0xe0d5c0); B.chair(uL + 1.4, T + 1.95, 1, 0xd35400); B.chair(uL + 1.4, T + 3.25, -1, 0xd35400);
      B.poster('left', Dv - 4.2, 1.4, 1.6, 1.0, new THREE.Color(1.6, 0.9, 0.3));
      B.spots.push({ u: 0.4, v: Dv - 3.7, face: 'back' }, { u: uR - 1.2, v: T + 2.2, face: 'right' });
      break;
    }
    case 'tea': case 'food': {
      const food = S.kind === 'food';
      // Kitchen counter at the back with big steel pots; the owner sits at the cash desk by the door.
      B.box(uL + 0.2, uR - 0.2, 0, 0.95, Dv - 0.85, Dv - 0.05, 0x7b8a8f);
      B.box(uL + 0.2, uR - 0.2, 0.95, 1.0, Dv - 0.85, Dv - 0.05, 0xc9ced4);
      for (let u = uL + 0.8; u < uR - 0.6; u += 1.1) B.cyl(u, Dv - 0.45, 1.0, food ? 0.45 : 0.55, 0.24, 0xd5dadf);
      B.solid(uL + 0.2, uR - 0.2, Dv - 0.85, Dv - 0.05, 1.0);
      B.box(-1.4, 1.4, 1.5, 2.3, Dv - 0.04, Dv - 0.01, new THREE.Color(1.6, 1.3, 0.5), true);   // menu board
      B.counter(uR - 2.2, uR - 0.3, T + 1.1, T + 1.75, 0xd8d2c6, 0x6b4a2e, uR - 1.0);
      B.owner = { u: uR - 1.0, v: T + 2.5 };
      const cols = W > 6 ? [uL + 1.4, (uL + uR) / 2 - 0.4] : [uL + 1.4];
      const rows = [];
      for (let v = T + 2.4; v < Dv - 2.0; v += 2.2) rows.push(v);
      for (const u of cols) for (const v of rows) {
        B.table(u, v, food ? 1.1 : 0.8, 0.75, food ? 0x8a5a33 : 0x5b7d8a);
        B.chair(u, v - 0.65, 1, food ? 0xb03a2e : 0x2f8f4e); B.chair(u, v + 0.65, -1, food ? 0xb03a2e : 0x2f8f4e);
        B.box(u - 0.06, u + 0.06, 0.77, 0.86, v - 0.06, v + 0.06, 0xc9ced4);   // glass / steel tumbler
      }
      if (food) { B.cyl(uL + 0.4, T + 0.9, 0, 0.9, 0.22, 0xffffff); B.box(uL + 0.15, uL + 0.65, 0.9, 1.4, T + 0.6, T + 1.2, 0xbfc5ca); }   // wash basin
      break;
    }
    case 'medical': {
      retail();
      B.box(-0.5, 0.5, C - 0.95, C - 0.15, Dv - 0.5, Dv - 0.47, new THREE.Color(0.2, 1.8, 0.6), true);
      B.box(-0.15, 0.15, C - 0.95, C - 0.15, Dv - 0.52, Dv - 0.49, new THREE.Color(2.4, 2.4, 2.4), true);
      B.box(-0.5, 0.5, C - 0.7, C - 0.4, Dv - 0.52, Dv - 0.49, new THREE.Color(2.4, 2.4, 2.4), true);   // green cross
      B.spots.push({ u: uL + 1.2, v: Dv / 2 - 1, face: 'left' }, { u: 0.2, v: Dv - 3.5, face: 'back' });
      break;
    }
    case 'textiles': case 'tailor': {
      // Shelves of cloth rolls; a white "gaddi" (mattress platform) where customers sit (saree shop style).
      for (const side of ['left', 'right']) {
        const u0 = side === 'left' ? uL : uR - 0.55, u1 = u0 + 0.55, wood = 0x8a6a46;
        if (side === 'left') B.box(uL, uL + 0.04, 0, 2.6, T + 0.9, Dv - 0.2, wood); else B.box(uR - 0.04, uR, 0, 2.6, T + 0.9, Dv - 0.2, wood);
        B.box(u0, u1, 0, 2.6, T + 0.9, T + 0.95, wood); B.box(u0, u1, 0, 2.6, Dv - 0.25, Dv - 0.2, wood);
        for (let lv = 0; lv < 5; lv++) {
          const y = 0.15 + lv * 0.5;
          B.box(u0, u1, y - 0.03, y, T + 0.9, Dv - 0.2, wood);
          for (let v = T + 1.08; v < Dv - 0.5; v += 0.33) B.cyl((u0 + u1) / 2, v, y, 0.5, 0.15, B.pickC(PALETTES.textiles), true);
        }
        B.solid(u0, u1, T + 0.9, Dv - 0.2, 2.6, false);
      }
      if (S.kind === 'textiles') {
        const g0 = uL + 0.9, g1 = uR - 2.6;
        B.box(g0, g1, 0, 0.45, Dv - 4.4, Dv - 1.8, 0xf4f1ea);   // gaddi
        B.box(g0, g1, 0.45, 0.5, Dv - 4.4, Dv - 1.8, 0xffffff);
        B.solid(g0, g1, Dv - 4.4, Dv - 1.8, 0.5);
        for (let u = g0 + 0.3; u < g1 - 0.4; u += 0.5) B.box(u, u + 0.42, 0.5, 0.54, Dv - 3.6, Dv - 2.4, B.pickC(PALETTES.textiles));   // saris spread out
        B.counter(uR - 2.3, uR - 0.7, Dv - 3.3, Dv - 2.7, 0xe8dcc4, 0x6b4a2e, uR - 1.2);
        B.owner = { u: uR - 1.5, v: Dv - 1.95 };
        B.spots.push({ u: -0.8, v: Dv - 4.8, face: 'back' }, { u: g0 + 0.6, v: Dv - 4.8, face: 'back' });
      } else {
        // Tailor: cutting table, sewing machines, a mannequin and a mirror.
        B.counter(uL + 1.4, uR - 1.6, Dv - 3.2, Dv - 2.2, 0xe8dcc4, 0x6b4a2e, uR - 2.4);
        B.owner = { u: uR - 2.4, v: Dv - 1.45 };
        for (const u of [uL + 1.6, uL + 3.0]) { B.table(u, T + 2.2, 1.0, 0.6, 0x7a5232); B.box(u - 0.25, u + 0.2, 0.77, 1.05, T + 2.05, T + 2.3, 0x1b1b1d); }
        B.cyl(uR - 1.3, T + 1.6, 0, 1.0, 0.05, 0x333333); B.cyl(uR - 1.3, T + 1.6, 1.0, 0.6, 0.2, 0xf5cba7); B.cyl(uR - 1.3, T + 1.6, 1.6, 0.25, 0.11, 0xf5cba7);
        B.solid(uR - 1.55, uR - 1.05, T + 1.35, T + 1.85, 1.8);
        B.spots.push({ u: 0.3, v: Dv - 3.6, face: 'back' });
      }
      break;
    }
    case 'fruit': {
      // Sloping crates of fruit on both sides and down the middle.
      for (const [u0, u1] of [[uL + 0.1, uL + 1.2], [uR - 1.2, uR - 0.1], [-0.7, 0.7]]) {
        const mid = u0 > -1 && u1 < 1;
        const v0 = mid ? T + 2.4 : T + 0.9, v1 = mid ? Dv - 4.0 : Dv - 3.4;
        B.box(u0, u1, 0, 0.6, v0, v1, 0x6b4a2e);
        for (let v = v0 + 0.1; v < v1 - 0.4; v += 0.62) {
          B.box(u0 + 0.05, u1 - 0.05, 0.6, 0.78, v, v + 0.55, 0xa57c48);
          const c = B.pickC(pal);
          for (let i = 0; i < 8; i++) B.box(u0 + 0.12 + (i % 4) * ((u1 - u0 - 0.24) / 4), u0 + 0.12 + (i % 4) * ((u1 - u0 - 0.24) / 4) + 0.16, 0.78, 0.92, v + 0.06 + Math.floor(i / 4) * 0.24, v + 0.22 + Math.floor(i / 4) * 0.24, c);
        }
        B.solid(u0, u1, v0, v1, 0.92);
      }
      B.counter(uL + 1.5, uR - 1.7, Dv - 2.9, Dv - 2.3, 0xd8d2c6, 0x6b4a2e, uR - 2.6);
      B.owner = { u: uR - 2.6, v: Dv - 1.55 };
      B.box(uL + 1.8, uL + 2.2, 1.0, 1.12, Dv - 2.8, Dv - 2.4, 0xc0392b);   // weighing scale
      B.spots.push({ u: uL + 1.7, v: T + 2.6, face: 'left' }, { u: 1.2, v: T + 3.2, face: 'left' });
      break;
    }
    case 'hardware': case 'auto': {
      const rack = 0x5d6d7e;
      B.shelves('back', uL + 0.15, uR - 0.15, 2.7, 5, pal, 0.5, rack);
      B.shelves('left', T + 0.9, Dv - 3.4, 2.4, 5, pal, 0.5, rack);
      B.counter(uL + 0.9, uR - 1.7, Dv - 2.95, Dv - 2.3, 0x9aa1a8, 0x34495e, uR - 2.6);
      B.owner = { u: uR - 2.6, v: Dv - 1.55 };
      if (S.kind === 'auto') {   // stacks of tyres
        for (const [u, v] of [[uR - 0.7, T + 1.4], [uR - 0.7, T + 2.5], [uR - 1.8, T + 1.4]]) {
          for (let i = 0; i < 4; i++) B.cyl(u, v, i * 0.24, 0.22, 0.38, 0x1d1e20);
          B.solid(u - 0.4, u + 0.4, v - 0.4, v + 0.4, 1.0);
        }
      } else {   // paint cans and pipes
        for (let i = 0; i < 6; i++) B.cyl(uR - 0.4 - (i % 3) * 0.32, T + 1.3 + Math.floor(i / 3) * 0.32, 0, 0.3, 0.13, B.pickC([0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1]));
        for (let i = 0; i < 5; i++) B.box(uR - 0.2 - i * 0.09, uR - 0.14 - i * 0.09, 0, 2.6, Dv - 4.2, Dv - 4.14, 0xa0a4a8);
        B.solid(uR - 1.1, uR - 0.1, T + 1.1, T + 2.0, 0.4);
      }
      B.spots.push({ u: uL + 1.2, v: Dv / 2 - 1.5, face: 'left' }, { u: 0, v: Dv - 3.5, face: 'back' });
      break;
    }
    case 'office': {
      // Tower lobby: reception desk, logo wall, lifts, sofas, plants, security gates.
      const mid = (uL + uR) / 2;
      B.box(mid - 3.2, mid + 3.2, 0.3, C - 0.3, Dv - 0.06, Dv - 0.02, 0x7a5a40);   // wooden logo wall
      B.box(mid - 2.4, mid + 2.4, 2.0, 2.6, Dv - 0.08, Dv - 0.06, new THREE.Color(1.8, 1.3, 0.3), true);   // logo
      for (const u of [uL + 1.6, uL + 3.2, uR - 3.2, uR - 1.6]) {   // lift doors
        B.box(u - 0.65, u + 0.65, 0, 2.5, Dv - 0.06, Dv - 0.02, 0xa9b1b8);
        B.box(u - 0.02, u + 0.02, 0, 2.5, Dv - 0.07, Dv - 0.06, 0x6b737a);
        B.box(u - 0.15, u + 0.15, 2.65, 2.8, Dv - 0.06, Dv - 0.03, new THREE.Color(1.6, 0.4, 0.2), true);
      }
      B.counter(mid - 2.6, mid + 2.6, Dv - 5.2, Dv - 4.4, 0xf0ece4, 0x6b4f3a, mid + 1.4);
      B.owner = { u: mid + 0.6, v: Dv - 3.6 };
      for (const side of [-1, 1]) {   // sofas facing each other + a low table
        const u = side < 0 ? uL + 1.2 : uR - 1.2;
        const b0 = side < 0 ? u - 0.45 : u + 0.33;
        B.box(u - 0.45, u + 0.45, 0, 0.45, T + 2.0, T + 4.4, 0x34495e); B.box(b0, b0 + 0.12, 0.45, 0.95, T + 2.0, T + 4.4, 0x2c3e50);
        B.solid(u - 0.45, u + 0.45, T + 2.0, T + 4.4, 0.95);
        B.plant(side < 0 ? uL + 0.6 : uR - 0.6, T + 1.0);
        B.plant(side < 0 ? uL + 0.6 : uR - 0.6, Dv - 1.2);
      }
      B.box(mid - 0.7, mid + 0.7, 0, 0.4, T + 2.6, T + 3.6, 0x8a6a46); B.solid(mid - 0.7, mid + 0.7, T + 2.6, T + 3.6, 0.4);
      for (const u of [mid - 2.2, mid + 2.2]) { B.box(u - 0.08, u + 0.08, 0, 1.0, Dv - 7.0, Dv - 6.2, 0x7f8c8d); B.solid(u - 0.08, u + 0.08, Dv - 7.0, Dv - 6.2, 1.0); }
      B.spots.push({ u: mid - 1.2, v: Dv - 6.0, face: 'back' }, { u: uL + 2.4, v: T + 3.0, face: 'left' });
      break;
    }
    default: {   // general store / anything else
      retail();
      for (let i = 0; i < 4; i++) { const u = uL + 1.0 + i * 0.6; B.box(u, u + 0.5, 0, 0.55, Dv - 3.9, Dv - 3.3, 0xd9c9a3); }   // rice sacks
      B.solid(uL + 1.0, uL + 3.4, Dv - 3.9, Dv - 3.3, 0.55);
      B.box(uR - 0.9, uR - 0.1, 0, 1.9, T + 0.5, T + 1.2, 0xf4f6f7);   // fridge
      B.box(uR - 0.92, uR - 0.88, 0.2, 1.8, T + 0.55, T + 1.15, new THREE.Color(0.6, 1.0, 1.8), true);
      B.solid(uR - 0.9, uR - 0.1, T + 0.5, T + 1.2, 1.9, false);
      B.spots.push({ u: uL + 1.2, v: Dv / 2 - 1, face: 'left' }, { u: uR - 1.2, v: Dv / 2, face: 'right' });
    }
  }
}

// ---------------------------------------------------------------------------
export class Interiors {
  constructor(game) {
    this.game = game; this.W = game.world; this.doors = this.W.doors;
    this.open = []; this.robbedAt = new Map(); this.current = null; this.t = 0;
    this.timers = [];   // things that happen a little later (game time, so pausing stops them too)
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.buildDoorMeshes();
  }

  // Door frames (always there) and sliding glass doors (2 per door), one draw call each.
  buildDoorMeshes() {
    const n = this.doors.length, frame = 0x3b3f44;
    const fg = mergeParts([
      part(BOX, frame, -0.86, 1.33, 0.09, 0.14, 2.72, 0.36), part(BOX, frame, 0.86, 1.33, 0.09, 0.14, 2.72, 0.36),
      part(BOX, frame, 0, 2.66, 0.09, 1.86, 0.14, 0.36), part(BOX, 0x8d8a84, 0, 0.012, 0.09, 1.72, 0.025, 0.4),
    ]);
    const lg = mergeParts([
      part(BOX, 0x2c5563, 0, 1.3, 0, 0.72, 2.42, 0.03),
      part(BOX, 0xaab2b9, -0.38, 1.3, 0, 0.05, 2.52, 0.045), part(BOX, 0xaab2b9, 0.38, 1.3, 0, 0.05, 2.52, 0.045),
      part(BOX, 0xaab2b9, 0, 2.54, 0, 0.8, 0.06, 0.045), part(BOX, 0xaab2b9, 0, 0.06, 0, 0.8, 0.1, 0.045),
      part(BOX, 0xd9dde0, 0, 1.05, 0, 0.6, 0.05, 0.08),
    ]);
    this.frames = new THREE.InstancedMesh(fg, vertexColorShiny, n);
    this.leaves = new THREE.InstancedMesh(lg, vertexColorShiny, n * 2);
    for (const m of [this.frames, this.leaves]) { m.frustumCulled = false; this.game.scene.add(m); }
    this.doors.forEach((D, i) => {
      D.f = 0; D.sx = D.w / 1.6; D.sy = D.h / 2.6; D.yaw = Math.atan2(-D.nx, -D.nz);
      this.frames.setMatrixAt(i, this.matrix(D, 0, 0, D.sx, D.sy));
      this.placeLeaves(D);
    });
    this.frames.instanceMatrix.needsUpdate = true;
  }
  matrix(D, u, v, sx, sy) {
    const Vx = -D.nx, Vz = -D.nz, Ux = Vz, Uz = -Vx;
    _m.compose(_p.set(D.x + Ux * u + Vx * v, FOOT_TOP, D.z + Uz * u + Vz * v), _q.setFromAxisAngle(_up, D.yaw), _s.set(sx, sy, 1));
    return _m;
  }
  placeLeaves(D) {
    const off = 0.4 * D.sx + D.f * 0.76 * D.sx;
    this.leaves.setMatrixAt(D.id * 2, this.matrix(D, -off, 0.13, D.sx, D.sy));
    this.leaves.setMatrixAt(D.id * 2 + 1, this.matrix(D, off, 0.13, D.sx, D.sy));
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  // ---------- Open / close ----------
  openDoor(D) {
    const g = this.game, W = this.W, nav = g.nav;
    const S = D.kind === 'tower' ? TOWER : SHOPS[D.sign] || SHOPS[8];
    // The room: up to 8 m wide around the door (the whole lobby in a tower) and up to 10 m deep.
    const Vx = -D.nx, Vz = -D.nz, Ux = Vz, Uz = -Vx;
    const us = [[D.x0, D.z0], [D.x1, D.z0], [D.x0, D.z1], [D.x1, D.z1]].map(([x, z]) => (x - D.x) * Ux + (z - D.z) * Uz);
    const bu0 = Math.min(...us), bu1 = Math.max(...us);
    const want = D.kind === 'tower' ? 99 : 8.2;
    let uL = Math.max(bu0 + 0.3, -want / 2), uR = Math.min(bu1 - 0.3, want / 2);
    if (uR - uL < want) { const lack = want - (uR - uL); uL = Math.max(bu0 + 0.3, uL - lack); uR = Math.min(bu1 - 0.3, uL + want); }
    const depth = Math.min(D.kind === 'tower' ? 13 : 10, D.depth - 0.3);
    const B = new Room(D, uL, uR, depth, D.ceil, 1000 + D.id * 7.31);
    B.shell({ ...S, board: [0x1f6fb2, 0xe3a21a, 0x2f8f4e, 0xc0392b, 0x8e44ad, 0x16a085, 0xd35400, 0x2c3e50, 0xb03a2e, 0x34495e, 0x7d3c98, 0x239b56][D.sign] });
    furnish(B, S);

    const it = { D, S, B, solids: [], ceilings: [], undo: [], npcs: [], meshes: [] };
    // Meshes.
    for (const [ms, mat] of [[B.mesh, this.mat], [B.lit, vertexColorGlow]]) {
      if (!ms.i.length) continue;
      const m = new THREE.Mesh(ms.geometry(), mat);
      m.matrixAutoUpdate = false;
      g.scene.add(m); it.meshes.push(m);
    }
    // Walls that block: the rest of the building around the room, the front wall each side of the door.
    const H = D.solid.h, add = (u0, u1, v0, v1, h, opts) => { if (u1 - u0 > 0.02 && v1 - v0 > 0.02) it.solids.push(W.addTempSolid(...Object.values(B.rect(u0, u1, v0, v1)), h, opts)); };
    add(bu0, uL, 0, D.depth, H); add(uR, bu1, 0, D.depth, H); add(uL, uR, depth, D.depth, H);
    add(uL, -D.w / 2, 0, T, H); add(D.w / 2, uR, 0, T, H);
    add(-D.w / 2, D.w / 2, -0.35, T, 0.5, { carOnly: true, nosight: true });   // a step: no driving into the shop
    for (const s of B.solids) it.solids.push(W.addTempSolid(s.x0, s.z0, s.x1, s.z1, s.h, { nosight: s.nosight }));
    D.solid.off = true;
    // Ceiling (for bullets and the camera) and the wall above the door.
    const top = D.top + 1;
    const cr = B.rect(uL, uR, 0, depth), lr = B.rect(-D.w / 2, D.w / 2, -0.02, T);
    it.ceilings.push({ ...cr, y0: FOOT_TOP + D.ceil, y1: top }, { ...lr, y0: FOOT_TOP + D.h, y1: top });
    W.ceilings.push(...it.ceilings);
    // Police walking map: the room floor is open, furniture blocked, a way in through the door.
    const pad = 0.38, rr = B.rect(uL + pad, uR - pad, T + pad, depth - pad);
    nav.paint(rr.x0, rr.z0, rr.x1, rr.z1, 0, it.undo);
    for (const s of B.solids) nav.paint(s.x0 - pad, s.z0 - pad, s.x1 + pad, s.z1 + pad, 1, it.undo);
    const dr = B.rect(-D.w / 2 + 0.2, D.w / 2 - 0.2, -1.4, T + 1.1);
    nav.paint(dr.x0, dr.z0, dr.x1, dr.z1, 0, it.undo);
    const room = B.rect(uL, uR, 0, depth);
    nav.markRoom(room.x0, room.z0, room.x1, room.z1, it.undo);
    it.room = room;
    this.spawnPeople(it);
    this.lootFor(it);
    D.openIt = it;
    this.open.push(it);
    return it;
  }

  close(it) {
    const g = this.game, W = this.W, D = it.D;
    for (const m of it.meshes) { g.scene.remove(m); m.geometry.dispose(); }
    for (const s of it.solids) W.removeTempSolid(s);
    W.ceilings = W.ceilings.filter((c) => !it.ceilings.includes(c));
    g.nav.restore(it.undo);
    for (const p of it.npcs) if (!p.removed) p.remove();
    // Money left on the floor goes with the shop (it would be stuck inside the closed building).
    const R = it.room;
    for (const k of [...g.pickups.list]) if (k.x > R.x0 && k.x < R.x1 && k.z > R.z0 && k.z < R.z1) g.pickups.take(k);
    D.solid.off = false; D.openIt = null; D.f = 0; this.placeLeaves(D);
    this.open = this.open.filter((o) => o !== it);
    if (this.current === it) this.current = null;
  }

  closeAll() { for (const it of [...this.open]) this.close(it); this.timers = []; g_indoors(this.game, false); }
  later(sec, fn) { this.timers.push({ at: this.game.time + sec, fn }); }

  // v9.7 loot (like PUBG): some shops have a gun or a scope lying inside. Hardware and auto parts shops
  // ("special maal under the counter") always do. Taken? The shop gets new loot 3 minutes later.
  lootFor(it) {
    const g = this.game, D = it.D, B = it.B, S = it.S;
    if (!g.loot || (D.lootT && g.time - D.lootT < 180) || !B.spots || !B.spots.length) return;
    const r = seededRandom(D.id * 5.3 + Math.floor(g.time / 180));
    const special = S.kind === 'hardware' || S.kind === 'auto';
    if (!special && r() > 0.3) return;
    const s = B.spots[Math.floor(r() * B.spots.length)];
    const type = special ? pick(['rifle', 'dmr', 'shotgun', 'smg', 'sniper', 'rifle']) : rollLoot(r());
    g.pickups.spawn(type, B.wx(s.u, s.v), B.wz(s.u, s.v), { yaw: r() * 6.28, onTake: () => { D.lootT = g.time; } });
  }

  // ---------- People inside ----------
  spawnPeople(it) {
    const g = this.game, B = it.B, D = it.D, S = it.S;
    const yawTo = (fu, fv) => Math.atan2(B.Ux * fu + B.Vx * fv, B.Uz * fu + B.Vz * fv);
    if (B.owner) {
      const o = new AmbientPerson(g, B.wx(B.owner.u, B.owner.v), B.wz(B.owner.u, B.owner.v), yawTo(0, -1), { gesture: S.kind === 'office' ? 'wait' : 'look' });
      o.vendor = 'shop'; o.shop = S; o.interior = it; o.calm = false; o.home = null;
      g.ambient.push(o); it.npcs.push(o); it.owner = o;
    }
    // Customers: looking at the goods, or sitting at the tables.
    const r = seededRandom(D.id * 3.7 + Math.floor(g.time / 120));
    const n = Math.floor(r() * 3);
    const spots = [...B.spots];
    for (let i = 0; i < n && spots.length; i++) {
      const s = spots.splice(Math.floor(r() * spots.length), 1)[0];
      const fu = s.face === 'left' ? -1 : s.face === 'right' ? 1 : 0, fv = s.face === 'back' ? 1 : 0;
      const p = new AmbientPerson(g, B.wx(s.u, s.v), B.wz(s.u, s.v), yawTo(fu, fv), { gesture: pick(['look', 'phone', 'talk', 'wait']) });
      p.home = null; g.ambient.push(p); it.npcs.push(p);
    }
    const seats = [...B.seats];
    const sit = S.kind === 'food' || S.kind === 'tea' ? 1 + Math.floor(r() * 3) : 0;
    for (let i = 0; i < sit && seats.length; i++) {
      const s = seats.splice(Math.floor(r() * seats.length), 1)[0];
      const p = new AmbientPerson(g, B.wx(s.u, s.v), B.wz(s.u, s.v), yawTo(0, s.faceV), { gesture: 'sit' });
      p.rig.setGesture('sit'); p.home = null; p.seated = true;
      g.ambient.push(p); it.npcs.push(p);
    }
    g.refreshLists();
  }

  // ---------- Buying and robbing ----------
  buy(p) {
    const g = this.game, P = g.player, S = p.shop, b = S && S.buy, ia = g.interact;
    if (!b) { ia.sayL(p, 'notForSale', ['Yahan kuch nahi bikta, sir.']); return; }
    if (p.robbedBy) { ia.sayL(p, 'noThief', ['Chor ko kuch nahi bechunga!'], 'angry'); return; }
    if (g.save.coins < b.price) { ia.sayL(p, 'payFirst', ['Pehle paise lao!']); return; }
    const D = g.dispatch;
    let msg = '';
    if (b.heal) {
      if (P.health >= (P.maxHealth || 100)) { ia.sayL(p, 'fit', ['Aap to ekdum fit ho!']); return; }
      P.health = Math.min(P.maxHealth || 100, P.health + b.heal); msg = `+${b.heal} HEALTH`;
      if (P.rig) { P.rig.setGesture('drink'); setTimeout(() => P.rig && P.rig.setGesture(null), 1600); }
    } else if (b.fx === 'ammo') {
      for (const id of P.owned) P.ammo[id].reserve += Math.round(WEAPONS[id].mag * 2);
      P.bombs = Math.min(9, (P.bombs || 0) + 2); g.hud.setBombs(P.bombs);
      msg = 'AMMO +2 MAGAZINES +2 SUTLI BOMBS'; g.audio.reload();
    } else if (b.fx === 'sim') {
      if (!D.stars) { ia.sayL(p, 'noSim', ['Police aapke peeche nahi hai, SIM ka kya karoge?']); return; }
      D.setStars(D.stars - 1); msg = 'NEW SIM: POLICE LOST YOUR PHONE  -1 STAR';
    } else if (b.fx === 'look') {
      const pool = loadedCrowd(false).filter((id) => id !== P.outfit);
      if (pool.length) P.setOutfit(pick(pool));
      if (D.stars && D.stars <= 2 && D.sinceSeen > 2) { D.clear(true); msg = 'NEW LOOK! THE POLICE LOST YOU'; }
      else msg = D.stars ? 'NEW LOOK (they are still watching you!)' : 'NEW LOOK';
    }
    g.save.coins -= b.price;
    if (g.voice) g.voice.sayLine('VIKRAM', 'buy', ['Ek dena, bhaiya.', 'Yeh wala, please.', 'Pack kar do.'], { queue: true });
    ia.sayL(p, 'sold', ['Yeh lijiye!', 'Dhanyavaad, phir aana!', 'Bilkul, sir!'], 'happy');
    g.hud.popup(`${msg}  -₹${b.price}`, 'bonus');
    g.emit('buy', p);
  }

  // Rob the cash drawer: hands up, the money comes out, then the alarm (2 stars) - police come inside.
  robTill(p) {
    const g = this.game, P = g.player, it = p.interior, ia = g.interact;
    if (!it) return;
    const last = this.robbedAt.get(it.D.id);
    // Lines in the player's language (shopkeepers and Vikram), English on devices without that voice.
    const say = (key, en) => (g.voice ? g.voice.line(key, en) : { text: pick(en), en: null, lang: 'en' });
    if (p.robbedBy || (last !== undefined && g.time - last < 300)) { const L = say('empty', EMPTY); ia.speak(p, L.text, 'angry', L); return; }
    p.robbedBy = true; this.robbedAt.set(it.D.id, g.time);
    if (g.voice) g.voice.sayLine('VIKRAM', 'rob', ROB_SAY, { queue: false, prio: 2 });
    p.handsUp = true; ia.hold(p, 4.5, 'cheer');
    const LA = say('robAnswer', ROB_ANSWER); ia.speak(p, LA.text, 'alarm', LA);
    for (const q of it.npcs) if (q !== p && q.panicFrom) q.panicFrom(P.x, P.z);
    const [lo, hi] = it.S.cash, cash = Math.round((lo + Math.random() * (hi - lo)) / 50) * 50;
    const B = it.B, t = B.till || B.owner;
    const tx = B.wx(t.u, t.v - 1.0), tz = B.wz(t.u, t.v - 1.0);
    this.later(1.4, () => {
      if (!it.D.openIt || p.dead) return;
      const parts = cash > 2500 ? 3 : 2;
      for (let i = 0; i < parts; i++) g.pickups.spawn('cash', tx + (Math.random() - 0.5) * 0.9, tz + (Math.random() - 0.5) * 0.9, { value: Math.round(cash / parts) });
      g.hud.popup(`TILL OPEN: ₹${cash.toLocaleString('en-IN')}`, 'combo');
    });
    this.later(3.6, () => {
      p.handsUp = false;
      if (g.dispatch.stars < 2) g.dispatch.setStars(2, P.x, P.z);
      g.hud.toast('SHOP ALARM! The police are coming - inside too!');
      g.alarm(P.x, P.z, 30);
      g.emit('robShop', { shop: it.S.name, cash });
    });
    g.rewards.addXP(15);
  }

  // ---------- Every frame ----------
  update(dt) {
    const g = this.game, P = g.player;
    for (let i = this.timers.length - 1; i >= 0; i--) if (g.time >= this.timers[i].at) { const t = this.timers.splice(i, 1)[0]; t.fn(); }
    // Glass doors slide open when somebody comes close (only open buildings).
    for (const it of this.open) {
      const D = it.D;
      const d2 = (x, z) => (x - D.x) * (x - D.x) + (z - D.z) * (z - D.z);
      let near = !P.inCar && d2(P.x, P.z) < 3.3 * 3.3;
      if (!near) for (const o of g.officers) if (!o.dead && !o.inactive && d2(o.x, o.z) < 9) { near = true; break; }
      if (!near) for (const q of it.npcs) if (!q.dead && d2(q.x, q.z) < 6.5) { near = true; break; }
      if (near && D.f === 0 && !P.inCar) { const pd = Math.hypot(P.x - D.x, P.z - D.z); if (pd < 9) g.audio.chime(Math.max(0.25, 1 - pd / 9)); }   // doors whoosh + bell
      const f = Math.max(0, Math.min(1, D.f + (near ? 2.6 : -1.4) * dt));
      if (f !== D.f) { D.f = f; this.placeLeaves(D); }
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    this.current = this.open.find((it) => P.x > it.room.x0 && P.x < it.room.x1 && P.z > it.room.z0 && P.z < it.room.z1) || null;
    g_indoors(g, !!this.current && !P.inCar);
    // Close far buildings (all of them when driving, except the one he is in).
    for (const it of [...this.open]) {
      if (it === this.current) continue;
      const d = dist(P.x, P.z, it.D.x, it.D.z);
      if (d > CLOSE_DIST || (P.inCar && d > 5) || g.mode === 'menu') this.close(it);
    }
    if (P.inCar || P.dead || g.mode === 'menu') return;
    // Open the nearest closed building (one per tick: no big pause).
    let best = null, bd = OPEN_DIST;
    for (const D of this.doors) {
      if (D.openIt) continue;
      const dx = D.x - P.x, dz = D.z - P.z;
      if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue;
      const d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = D; }
    }
    if (!best) return;
    if (this.open.length >= MAX_OPEN) {
      let far = null, fd = -1;
      for (const it of this.open) { if (it === this.current) continue; const d = dist(P.x, P.z, it.D.x, it.D.z); if (d > fd) { fd = d; far = it; } }
      if (!far || fd <= bd + 2) return;
      this.close(far);
    }
    this.openDoor(best);
  }

  // Name of the place Vikram is in (for the HUD), or null.
  get placeName() { return this.current ? this.current.S.name : null; }
}

function g_indoors(g, on) {
  if (g.indoors === on) return;
  g.indoors = on;
  if (on && g.interiors && g.interiors.current) {
    const it = g.interiors.current, S = it.S, o = it.owner;
    g.hud.toast(S.buy ? `${S.name}: ${tLabel(S.buy.label).replace(/ ₹.*/, '')} ${tr('here')}, ${tr('or ROB THE TILL')}` : `${S.name}: ${tr('rob the reception till')}`);
    // The owner says hello (once per visit), unless you robbed him.
    if (o && !o.dead && !o.removed && !it.greeted && !g.dispatch.stars) {
      it.greeted = true;
      g.interiors.later(0.5, () => {
        if (o.dead || o.removed) return;
        const L = g.voice ? (o.robbedBy ? g.voice.line('again', ['Tum phir aa gaye?!']) : g.voice.line('welcome', [S.hi])) : { text: o.robbedBy ? 'Tum phir aa gaye?!' : S.hi };
        g.interact.speak(o, L.text, o.robbedBy ? 'angry' : 'happy', L.lang ? L : null);
      });
    }
  }
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
