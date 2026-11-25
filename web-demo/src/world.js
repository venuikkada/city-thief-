// Navapur (fictional Indian coastal city): 6 x 6 blocks in districts - old town, downtown glass
// towers, parks, a bazaar, art-deco seafront hotels - plus a palm promenade, beach and the sea.
// Also the collision helpers (fast grid) used by people, cars, police and the camera.
import * as THREE from 'three';
import { seededRandom } from './util.js';
import { BOX, part, mergeParts, wallsGeometry, floorGeometry, signGeometry, vertexColorMaterial, vertexColorGlow } from './mesh.js';
import {
  asphaltTexture, pavingTexture, kerbTexture, groundTexture, facadeTexture, FACADE_COUNT, shopTexture, signAtlas,
  decoTexture, DECO_COUNT, glassTexture, GLASS_TINTS, grassTexture, sandTexture, palmTexture, neonAtlas,
  facadeMask, decoMask, glassMask,
} from './textures.js';

export const LINES = [-225, -150, -75, 0, 75, 150, 225];   // road centre lines (X and Z)
export const ROAD_W = 9;
export const HALF_ROAD = 4.5;
export const LANE_OFF = 2.25;
export const STOP_BACK = 9;
export const FOOT_W = 4;
export const FOOT_TOP = 0.15;
export const ROAD_TOP = 0.02;
export const SEA_LEVEL = -0.55;
const BLD_DEPTH = 15;
const GAP = 3;
const SHOP_H = 4.2;
const FLOOR_H = 3.2;
const EDGE = LINES[LINES.length - 1] + HALF_ROAD + FOOT_W;   // outer footpath edge (229.5 + 4)
export const PROMENADE = { z0: LINES[0] - HALF_ROAD - 8, z1: LINES[0] - HALF_ROAD };   // seafront walk
const WALL_Z = PROMENADE.z0;
const SAND_END = -272;

// District of each block: BLOCKS[j][i] (j = row from the sea (south) to north, i = west to east).
const BLOCKS = [
  ['beach', 'beach', 'beach', 'beach', 'beach', 'beach'],
  ['market', 'old', 'old', 'old', 'market', 'old'],
  ['old', 'tower', 'tower', 'tower', 'tower', 'old'],
  ['old', 'park', 'ware', 'start', 'old', 'park'],
  ['old', 'old', 'old', 'market', 'tower', 'old'],
  ['old', 'old', 'park', 'old', 'old', 'old'],
];
export function blockRect(i, j) {
  return { x0: LINES[i] + HALF_ROAD, x1: LINES[i + 1] - HALF_ROAD, z0: LINES[j] + HALF_ROAD, z1: LINES[j + 1] - HALF_ROAD };
}

const LAMP_GLOW = new THREE.Color(3.2, 2.4, 1.3);
const CHUNK = 240;
const CELL = 24;

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.shadows = quality !== 'low';
    this.random = seededRandom(2026);
    this.buildings = [];   // {x0,z0,x1,z1,h, nosight}
    this.circles = [];
    this.slabs = [];       // raised footpaths
    this.mapRects = [];
    this.chunks = new Map();
    this.wires = [];
    this.atlas = signAtlas();
    this.neon = neonAtlas();
    this.grid = new Map();
    this.stamp = 1;
    this.spots = { benches: [], beach: [], plazas: [], parks: [], market: [], hotels: [] };
    this.animated = [];   // boats, water
    this.ramps = [];      // stunt jumps

    this.buildGround();
    this.buildRoads();
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) this.buildBlock(i, j, BLOCKS[j][i]);
    this.buildOuterRing();
    this.buildSeafront();
    this.buildSkyline();
    this.buildRamps();
  }

  // ---------- Stunt ramps (jump over the park fountains, and off the promenade onto the beach) ----------
  buildRamps() {
    const parks = [[1, 3, 0], [5, 3, Math.PI], [2, 5, Math.PI / 2]];
    for (const [i, j, yaw] of parks) {
      const r = blockRect(i, j), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      this.addRamp(cx - Math.sin(yaw) * 22, cz - Math.cos(yaw) * 22, yaw, 7, 1.8);
    }
    this.addRamp(112.5, PROMENADE.z1 - 0.6, Math.PI, 6.4, 1.0);
  }

  // A wedge: low end at (x, z), rising along "yaw" to height h after "len" metres.
  addRamp(x, z, yaw, len = 7, h = 1.8, w = 4.2) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const y0 = this.groundAt(x, z);
    this.ramps.push({ x, z, fx, fz, len, h, w, y0 });
    const P = (u, v, y) => [x + fx * u + rx * v, y0 + y, z + fz * u + rz * v];
    const hw = w / 2;
    const a = P(0, -hw, 0.02), b = P(0, hw, 0.02), c = P(len, hw, h), d = P(len, -hw, h), e = P(len, hw, 0), f = P(len, -hw, 0);
    const tri = [a, b, c, a, c, d, d, c, e, d, e, f, a, d, f, b, e, c];   // top, back, two sides
    const cols = [];
    for (let i = 0; i < tri.length; i++) cols.push(...(i < 6 ? [0.95, 0.72, 0.08] : [0.2, 0.2, 0.22]));
    // Black hazard stripes across the yellow top.
    for (let k = 0; k < 4; k++) {
      const u0 = len * (0.12 + k * 0.22), u1 = u0 + 0.45, y = (u) => h * u / len + 0.03;
      const q = [P(u0, -hw * 0.9, y(u0)), P(u0, hw * 0.9, y(u0)), P(u1, hw * 0.9, y(u1)), P(u1, -hw * 0.9, y(u1))];
      tri.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      for (let i = 0; i < 6; i++) cols.push(0.08, 0.08, 0.08);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.add('static', geo, x, z);
  }

  // Height of a ramp under (x, z), 0 if none.
  rampAt(x, z) {
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z;
      const u = dx * r.fx + dz * r.fz;
      if (u < 0 || u > r.len) continue;
      if (Math.abs(-dx * r.fz + dz * r.fx) > r.w / 2) continue;
      return r.y0 + 0.02 + r.h * u / r.len;
    }
    return 0;
  }

  // ---------- Parts are grouped by material and by map chunk (so far chunks are not drawn) ----------
  // Tiled textures (walls, glass, ground) share a few big "atlas" pictures: fewer draw calls.
  add(matKey, geo, x, z) {
    const at = atlasSlot(matKey);
    if (at) {
      const uv = geo.attributes.uv.array, off = at[1] * 1000 + 500;
      for (let i = 1; i < uv.length; i += 2) uv[i] += off;
      matKey = at[0];
    }
    const key = matKey + '|' + Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!this.chunks.has(key)) this.chunks.set(key, []);
    this.chunks.get(key).push(geo);
  }
  addBox(x, y, z, sx, sy, sz, colorHex) { this.add('static', part(BOX, colorHex, x, y, z, sx, sy, sz), x, z); }
  addPart(geo, x, z, glow = false) { this.add(glow ? 'glow' : 'static', geo, x, z); }

  // ---------- Collision grid ----------
  cellKey(cx, cz) { return (cx + 500) * 1000 + (cz + 500); }
  register(list, idx, x0, z0, x1, z1) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = this.cellKey(cx, cz);
        let c = this.grid.get(k);
        if (!c) { c = { b: [], c: [], s: [] }; this.grid.set(k, c); }
        c[list].push(idx);
      }
    }
  }
  addSolid(x0, z0, x1, z1, h, opts = {}) {
    const b = { x0, z0, x1, z1, h, nosight: !!opts.nosight, stamp: 0 };
    this.buildings.push(b);
    this.register('b', this.buildings.length - 1, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
    if (!opts.nomap) this.mapRects.push({ x0, z0, x1, z1, kind: opts.kind || 'building' });
    return b;
  }
  addCircle(x, z, r) {
    this.circles.push({ x, z, r });
    this.register('c', this.circles.length - 1, x - r - 1, z - r - 1, x + r + 1, z + r + 1);
  }
  near(list, x0, z0, x1, z1, fn) {
    const st = ++this.stamp;
    const src = list === 'b' ? this.buildings : list === 'c' ? this.circles : this.slabs;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const c = this.grid.get(this.cellKey(cx, cz));
        if (!c) continue;
        for (const i of c[list]) {
          const o = src[i];
          if (o.stamp === st) continue;
          o.stamp = st;
          if (fn(o)) return true;
        }
      }
    }
    return false;
  }

  // ---------- Ground, sea, beach ----------
  buildGround() {
    const tex = groundTexture(); tex.repeat.set(90, 90);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    g.rotation.x = -Math.PI / 2; g.position.set(0, -0.02, 500);
    g.receiveShadow = this.shadows;
    this.scene.add(g);
  }

  buildRoads() {
    const min = LINES[0] - HALF_ROAD, max = LINES[LINES.length - 1] + HALF_ROAD;
    for (const z of LINES) {
      for (let x = min; x < max; x += 80) this.add('asphalt', floorGeometry(x, z - HALF_ROAD, Math.min(max, x + 80), z + HALF_ROAD, ROAD_TOP, 8), x + 40, z);
      this.mapRects.push({ x0: min, z0: z - HALF_ROAD, x1: max, z1: z + HALF_ROAD, kind: 'road' });
    }
    for (const x of LINES) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const z0 = LINES[j] + HALF_ROAD, z1 = LINES[j + 1] - HALF_ROAD;
        this.add('asphalt', floorGeometry(x - HALF_ROAD, z0, x + HALF_ROAD, z1, ROAD_TOP, 8), x, (z0 + z1) / 2);
        this.mapRects.push({ x0: x - HALF_ROAD, z0, x1: x + HALF_ROAD, z1, kind: 'road' });
      }
    }
    const y = ROAD_TOP + 0.006;
    for (const k of LINES) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const a = LINES[j] + STOP_BACK + 1, b = LINES[j + 1] - STOP_BACK - 1;
        for (let s = a; s < b - 1; s += 6) {
          const e = Math.min(s + 3, b);
          this.addBox((s + e) / 2, y, k, e - s, 0.01, 0.16, 0xf0f0f0);
          this.addBox(k, y, (s + e) / 2, 0.16, 0.01, e - s, 0xf0f0f0);
        }
        const a2 = LINES[j] + HALF_ROAD, b2 = LINES[j + 1] - HALF_ROAD;
        for (const side of [-1, 1]) {
          this.addBox((a2 + b2) / 2, y, k + side * (HALF_ROAD - 0.3), b2 - a2, 0.01, 0.12, 0xe6e6e6);
          this.addBox(k + side * (HALF_ROAD - 0.3), y, (a2 + b2) / 2, 0.12, 0.01, b2 - a2, 0xe6e6e6);
        }
      }
    }
    const lim = LINES[LINES.length - 1];
    for (const cx of LINES) for (const cz of LINES) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ox = cx + dx * (HALF_ROAD + 2.2), oz = cz + dz * (HALF_ROAD + 2.2);
        if (Math.abs(ox) > lim + 1 || Math.abs(oz) > lim + 1) continue;
        for (let s = -HALF_ROAD + 0.6; s < HALF_ROAD - 0.3; s += 1.0) {
          if (dx !== 0) this.addBox(ox, y, cz + s, 3.2, 0.01, 0.5, 0xf2f2f2);
          else this.addBox(cx + s, y, oz, 0.5, 0.01, 3.2, 0xf2f2f2);
        }
      }
    }
  }

  slab(x0, z0, x1, z1, mat = 'paving') {
    this.add(mat, floorGeometry(x0, z0, x1, z1, FOOT_TOP, 2), (x0 + x1) / 2, (z0 + z1) / 2);
    this.add('kerb', wallsGeometry(x0, z0, x1, z1, 0, FOOT_TOP, 1, FOOT_TOP), (x0 + x1) / 2, (z0 + z1) / 2);
    const s = { x0, z0, x1, z1, stamp: 0 };
    this.slabs.push(s);
    this.register('s', this.slabs.length - 1, x0, z0, x1, z1);
    this.mapRects.push({ x0, z0, x1, z1, kind: 'block' });
  }

  // ---------- Blocks by district ----------
  buildBlock(i, j, type) {
    const { x0, x1, z0, z1 } = blockRect(i, j);
    this.slab(x0, z0, x1, z1);
    const bx0 = x0 + FOOT_W, bx1 = x1 - FOOT_W, bz0 = z0 + FOOT_W, bz1 = z1 - FOOT_W;
    const palms = type === 'beach' || type === 'tower';
    this.streetFurniture(x0, z0, x1, z1, palms);

    if (type === 'tower') return this.towerBlock(bx0, bz0, bx1, bz1);
    if (type === 'park') return this.parkBlock(bx0, bz0, bx1, bz1);
    const deco = type === 'beach';
    const style = { deco, market: type === 'market' };
    this.row(bx0, bx1, bz0, bz0 + BLD_DEPTH, 'x', 3, [0, -1], style);
    this.row(bx0, bx1, bz1 - BLD_DEPTH, bz1, 'x', 3, [0, 1], { ...style, deco: false });
    this.row(bx0, bx0 + BLD_DEPTH, bz0 + BLD_DEPTH + GAP, bz1 - BLD_DEPTH - GAP, 'z', 1, [-1, 0], { ...style, deco: false });
    this.row(bx1 - BLD_DEPTH, bx1, bz0 + BLD_DEPTH + GAP, bz1 - BLD_DEPTH - GAP, 'z', 1, [1, 0], { ...style, deco: false });
    const cx0 = bx0 + BLD_DEPTH, cz0 = bz0 + BLD_DEPTH, cx1 = bx1 - BLD_DEPTH, cz1 = bz1 - BLD_DEPTH;
    if (type === 'market') this.bazaar(cx0, cz0, cx1, cz1);
    else if (type === 'beach') this.pool(cx0, cz0, cx1, cz1);
    else if (type !== 'ware') this.courtyard(cx0, cz0, cx1, cz1);
    else this.add('paving', floorGeometry(cx0, cz0, cx1, cz1, FOOT_TOP + 0.005, 2), (cx0 + cx1) / 2, (cz0 + cz1) / 2);
  }

  row(x0, x1, z0, z1, axis, count, facing, style) {
    const w = ((axis === 'x' ? x1 - x0 : z1 - z0) - GAP * (count - 1)) / count;
    for (let k = 0; k < count; k++) {
      const a = (axis === 'x' ? x0 : z0) + k * (w + GAP);
      if (axis === 'x') this.building(a, z0, a + w, z1, facing, style);
      else this.building(x0, a, x1, a + w, facing, style);
    }
  }

  building(x0, z0, x1, z1, facing, style = {}) {
    const r = this.random;
    const floors = style.market ? 1 + Math.floor(r() * 2) : style.deco ? 4 + Math.floor(r() * 4) : 2 + Math.floor(r() * 6);
    const top = FOOT_TOP + SHOP_H + floors * FLOOR_H;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    this.add('shop', wallsGeometry(x0, z0, x1, z1, FOOT_TOP, FOOT_TOP + SHOP_H, 8, SHOP_H), cx, cz);
    if (style.deco) {
      const s = Math.floor(r() * DECO_COUNT);
      this.add('deco' + s, wallsGeometry(x0, z0, x1, z1, FOOT_TOP + SHOP_H, top, 3, FLOOR_H), cx, cz);
      this.addBox(cx, top + 0.6, cz, w + 0.4, 1.2, d + 0.4, 0xffffff);   // white deco crown
      const [nx, nz] = facing;
      const nr = this.neon.rects[Math.floor(r() * this.neon.rects.length)];
      const sw = Math.min(w - 2, 13);
      this.add('neon', signGeometry(cx + nx * (d / 2 + 0.08), top + 2.2, cz + nz * (d / 2 + 0.08), sw, sw / 6.5, nx, nz, nr), cx, cz);
      this.spots.hotels.push({ x: cx + nx * (d / 2 + 2), z: cz + nz * (d / 2 + 2) });
    } else {
      const s = Math.floor(r() * FACADE_COUNT);
      this.add('facade' + s, wallsGeometry(x0, z0, x1, z1, FOOT_TOP + SHOP_H, top, 3, FLOOR_H), cx, cz);
      const trims = [0xd9ccb0, 0xb5705c, 0x8fae98, 0x9aa0a8, 0x8c4735, 0xd8cc84];
      if (r() < 0.6) for (let f = 1; f < floors; f++) this.addBox(cx, FOOT_TOP + SHOP_H + f * FLOOR_H - 0.08, cz, w + 0.5, 0.14, d + 0.5, trims[s]);
    }
    this.addBox(cx, FOOT_TOP + SHOP_H, cz, w + 0.3, 0.3, d + 0.3, 0xcfc8ba);
    this.roof(x0, z0, x1, z1, top);

    const [nx, nz] = facing;
    const along = nx === 0 ? w : d;
    const fx = nx === 0 ? cx : (nx > 0 ? x1 : x0);
    const fz = nz === 0 ? cz : (nz > 0 ? z1 : z0);
    const awningColors = [0xc0392b, 0x1f6fb2, 0x2f8f4e, 0xe3a21a, 0x8e44ad];
    const ac = awningColors[Math.floor(r() * awningColors.length)];
    const tilt = 0.32, depth = 1.7, ay = FOOT_TOP + 3.0;
    if (nx === 0) {
      this.add('static', part(BOX, ac, fx, ay, fz + nz * depth / 2, along - 0.4, 0.07, depth, nz * tilt, 0, 0), fx, fz);
      this.addBox(fx, ay - 0.42, fz + nz * (depth - 0.08), along - 0.4, 0.3, 0.05, ac);
    } else {
      this.add('static', part(BOX, ac, fx + nx * depth / 2, ay, fz, depth, 0.07, along - 0.4, 0, 0, -nx * tilt), fx, fz);
      this.addBox(fx + nx * (depth - 0.08), ay - 0.42, fz, 0.05, 0.3, along - 0.4, ac);
    }
    const shopRect = this.atlas.rects.shops[Math.floor(r() * this.atlas.rects.shops.length)];
    const signW = Math.min(along - 1.2, 8);
    this.add('signs', signGeometry(fx + nx * 0.06, FOOT_TOP + 3.65, fz + nz * 0.06, signW, signW / 8, nx, nz, shopRect), fx, fz);
    if (!style.deco && r() < 0.2) {
      const board = this.atlas.rects.boards[Math.floor(r() * this.atlas.rects.boards.length)];
      const bw = Math.min(along - 2, 10), bh = bw / 2;
      const bx = cx + nx * (nx ? w / 2 - 1.5 : 0), bz = cz + nz * (nz ? d / 2 - 1.5 : 0);
      this.add('signs', signGeometry(bx, top + 1.2 + bh / 2, bz, bw, bh, nx, nz, board), bx, bz);
      this.addBox(bx - nx * 0.2, top + 0.6 + bh / 2, bz - nz * 0.2, nx ? 0.2 : bw, bh + 1.2, nz ? 0.2 : bw, 0x3a3a3a);
    }
    this.addSolid(x0, z0, x1, z1, top - FOOT_TOP);
  }

  roof(x0, z0, x1, z1, top) {
    const r = this.random, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    this.addBox(cx, top, cz, w, 0.12, d, 0x8d8880);
    const pc = 0xb8b0a2;
    this.addBox(cx, top + 0.45, z0 + 0.1, w, 0.9, 0.2, pc);
    this.addBox(cx, top + 0.45, z1 - 0.1, w, 0.9, 0.2, pc);
    this.addBox(x0 + 0.1, top + 0.45, cz, 0.2, 0.9, d, pc);
    this.addBox(x1 - 0.1, top + 0.45, cz, 0.2, 0.9, d, pc);
    const tanks = 1 + Math.floor(r() * 2);
    for (let t = 0; t < tanks; t++) {
      const tx = x0 + 1.5 + r() * (w - 3), tz = z0 + 1.5 + r() * (d - 3);
      this.add('static', part(TANK, 0x1a1a1a, tx, top + 0.85, tz), tx, tz);
    }
    if (r() < 0.5) this.addBox(x0 + 2 + r() * (w - 4), top + 1.2, z0 + 2 + r() * (d - 4), 2.5, 2.4, 2.5, pc);
  }

  // Downtown: four glass towers round a plaza with a fountain.
  towerBlock(x0, z0, x1, z1) {
    const r = this.random, s = 21;
    this.add('paving', floorGeometry(x0, z0, x1, z1, FOOT_TOP + 0.005, 2), (x0 + x1) / 2, (z0 + z1) / 2);
    for (const [ax, az] of [[x0, z0], [x1 - s, z0], [x0, z1 - s], [x1 - s, z1 - s]]) {
      const tx0 = ax + 1, tz0 = az + 1, tx1 = ax + s - 1, tz1 = az + s - 1;
      const h = 34 + Math.floor(r() * 16) * 3.6;
      const tint = Math.floor(r() * GLASS_TINTS.length);
      const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2;
      this.add('lobby', wallsGeometry(tx0, tz0, tx1, tz1, FOOT_TOP, FOOT_TOP + 5, 6, 5), cx, cz);
      this.add('glass' + tint, wallsGeometry(tx0, tz0, tx1, tz1, FOOT_TOP + 5, FOOT_TOP + h, 3, 3.6), cx, cz);
      this.addBox(cx, FOOT_TOP + 5, cz, tx1 - tx0 + 0.6, 0.4, tz1 - tz0 + 0.6, 0xdfe3e8);
      this.addBox(cx, FOOT_TOP + h + 0.4, cz, tx1 - tx0, 0.8, tz1 - tz0, 0x7c838c);
      this.addBox(cx, FOOT_TOP + h + 2.2, cz, 6, 3, 6, 0x9aa1aa);
      if (r() < 0.6) this.addBox(cx + 3, FOOT_TOP + h + 6, cz + 3, 0.25, 9, 0.25, 0xcccccc);
      this.add('glow', part(BOX, new THREE.Color(4, 0.4, 0.3), cx + 3, FOOT_TOP + h + 10.6, cz + 3, 0.5, 0.5, 0.5), cx, cz);
      this.addSolid(tx0, tz0, tx1, tz1, h);
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.fountain(cx, cz, 4);
    this.spots.plazas.push({ x: cx, z: cz, r: 9 });
    for (const [dx, dz] of [[-7, 0], [7, 0], [0, -7], [0, 7]]) this.bench(cx + dx, cz + dz, Math.atan2(-dx, -dz));
  }

  // Park: lawn, paths, trees, benches, fountain.
  parkBlock(x0, z0, x1, z1) {
    const r = this.random;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.add('grass', floorGeometry(x0, z0, x1, z1, FOOT_TOP + 0.01, 6), cx, cz);
    this.add('paving', floorGeometry(cx - 2, z0, cx + 2, z1, FOOT_TOP + 0.02, 2), cx, cz);
    this.add('paving', floorGeometry(x0, cz - 2, x1, cz + 2, FOOT_TOP + 0.02, 2), cx, cz);
    this.mapRects.push({ x0, z0, x1, z1, kind: 'park' });
    this.fountain(cx, cz, 5);
    for (let k = 0; k < 26; k++) {
      const x = x0 + 3 + r() * (x1 - x0 - 6), z = z0 + 3 + r() * (z1 - z0 - 6);
      if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
      if (r() < 0.35) this.palm(x, z, 7 + r() * 4); else this.tree(x, z, 1.1 + r() * 0.6);
    }
    for (const [dx, dz, a] of [[-12, 3.2, Math.PI], [12, -3.2, 0], [3.2, 12, -Math.PI / 2], [-3.2, -12, Math.PI / 2], [-20, 3.2, Math.PI], [20, -3.2, 0]]) this.bench(cx + dx, cz + dz, a);
    this.spots.parks.push({ x0, z0, x1, z1, cx, cz });
  }

  fountain(x, z, rad) {
    const y = FOOT_TOP;
    this.add('static', part(RING, 0xd8d2c4, x, y + 0.35, z, rad, 0.7, rad), x, z);
    this.add('pool', part(DISC, 0xffffff, x, y + 0.5, z, rad - 0.25, 1, rad - 0.25), x, z);
    this.add('static', part(CYL, 0xd8d2c4, x, y + 1.0, z, 0.5, 2.0, 0.5), x, z);
    this.add('glow', part(CYL, new THREE.Color(1.6, 2.2, 2.6), x, y + 2.3, z, 0.25, 0.6, 0.25), x, z);
    this.addCircle(x, z, rad);
  }

  bench(x, z, yaw) {
    const y = FOOT_TOP, fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.add('static', part(BOX, 0x7a5232, x, y + 0.45, z, 1.8, 0.08, 0.5, 0, yaw, 0), x, z);
    this.add('static', part(BOX, 0x7a5232, x - fx * 0.25, y + 0.8, z - fz * 0.25, 1.8, 0.5, 0.06, 0, yaw, 0), x, z);
    this.add('static', part(BOX, 0x333333, x, y + 0.22, z, 1.7, 0.44, 0.4, 0, yaw, 0), x, z);
    this.spots.benches.push({ x: x + fx * 0.05, z: z + fz * 0.05, yaw });
  }

  courtyard(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.add('paving', floorGeometry(x0, z0, x1, z1, FOOT_TOP + 0.005, 2), cx, cz);
    this.tree(cx, cz, 1.3);
    this.addBox(cx + 4, FOOT_TOP + 0.4, cz - 3, 3, 0.8, 1.2, 0x5b4636);
  }

  // Bazaar: rows of stalls with bright canopies inside the block.
  bazaar(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.add('paving', floorGeometry(x0, z0, x1, z1, FOOT_TOP + 0.005, 2), cx, cz);
    const cols = [0xd62828, 0xf77f00, 0xfcbf49, 0x2a9d8f, 0x6a4c93, 0x1d70b8];
    const goods = [0xe6a817, 0xc0392b, 0x4f8f2f, 0xf2d024, 0xe67e22, 0xa64ac9, 0xf5f0e6];
    const r = this.random;
    for (let x = x0 + 4; x < x1 - 3; x += 5.5) {
      for (const z of [z0 + 5, z1 - 5]) {
        const c = cols[Math.floor(r() * cols.length)];
        this.addBox(x, FOOT_TOP + 0.45, z, 3, 0.9, 1.6, 0x6b4a2b);
        for (let g = 0; g < 4; g++) this.addBox(x - 1 + g * 0.66, FOOT_TOP + 1.0, z, 0.55, 0.2, 1.3, goods[Math.floor(r() * goods.length)]);
        this.add('static', part(BOX, c, x, FOOT_TOP + 2.5, z, 3.6, 0.08, 2.6, z < cz ? 0.18 : -0.18, 0, 0), x, z);
        for (const sx of [-1.6, 1.6]) this.addBox(x + sx, FOOT_TOP + 1.25, z + (z < cz ? 1.2 : -1.2), 0.06, 2.5, 0.06, 0x444444);
        this.addSolid(x - 1.5, z - 0.8, x + 1.5, z + 0.8, 1.0, { nosight: true, nomap: true });
        this.spots.market.push({ x, z: z + (z < cz ? 1.9 : -1.9), yaw: z < cz ? Math.PI : 0 });
      }
    }
  }

  // Hotel courtyard pool with deck chairs.
  pool(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.add('paving', floorGeometry(x0, z0, x1, z1, FOOT_TOP + 0.005, 2), cx, cz);
    const w = (x1 - x0) * 0.6, d = (z1 - z0) * 0.45;
    this.add('static', part(BOX, 0xf2f2f2, cx, FOOT_TOP + 0.15, cz, w + 1, 0.3, d + 1), cx, cz);
    this.add('pool', part(BOX, 0xffffff, cx, FOOT_TOP + 0.31, cz, w, 0.02, d), cx, cz);
    this.addSolid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0.3, { nosight: true, kind: 'water' });
    for (let k = -2; k <= 2; k++) {
      const x = cx + k * 3;
      this.addBox(x, FOOT_TOP + 0.3, cz + d / 2 + 2.2, 0.7, 0.12, 1.8, 0xf5f5f5);
      this.add('static', part(CONE, [0xff5d8f, 0x2ec4b6, 0xffd166][(k + 2) % 3], x, FOOT_TOP + 2.4, cz + d / 2 + 3.6, 1.2, 0.5, 1.2), x, cz);
      this.addBox(x, FOOT_TOP + 1.2, cz + d / 2 + 3.6, 0.06, 2.4, 0.06, 0xeeeeee);
    }
    this.palm(x0 + 2, z0 + 2, 8); this.palm(x1 - 2, z1 - 2, 9); this.palm(x0 + 2, z1 - 2, 8.5); this.palm(x1 - 2, z0 + 2, 7.5);
  }

  // Lamps every 20 m with trees (or palms) between them, sagging wires between lamps.
  streetFurniture(x0, z0, x1, z1, palms) {
    const inset = 0.7;
    const edges = [
      [x0 + inset, z0 + inset, x1 - inset, z0 + inset, 0, 1], [x1 - inset, z0 + inset, x1 - inset, z1 - inset, -1, 0],
      [x1 - inset, z1 - inset, x0 + inset, z1 - inset, 0, -1], [x0 + inset, z1 - inset, x0 + inset, z0 + inset, 1, 0],
    ];
    for (const [ax, az, bx, bz, inx, inz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      let prevTop = null;
      for (let s = 10; s < len - 8; s += 20) {
        const px = ax + ux * s, pz = az + uz * s;
        this.lamp(px, pz, -inx, -inz);
        const topPt = [px, FOOT_TOP + 6.6, pz];
        if (prevTop && !palms) this.wire(prevTop, topPt);
        prevTop = topPt;
        if (s + 10 < len - 8) {
          const tx = px + ux * 10 + inx * 0.2, tz = pz + uz * 10 + inz * 0.2;
          if (palms) this.palm(tx, tz, 7 + this.random() * 3); else this.tree(tx, tz, 0.9 + this.random() * 0.4);
        }
      }
    }
  }

  lamp(x, z, outX, outZ) {
    const y = FOOT_TOP;
    this.add('static', part(POLE, 0x4a4d52, x, y + 3.4, z), x, z);
    this.addBox(x + outX * 0.8, y + 6.8, z + outZ * 0.8, outX ? 1.6 : 0.12, 0.12, outZ ? 1.6 : 0.12, 0x4a4d52);
    this.addBox(x + outX * 1.5, y + 6.65, z + outZ * 1.5, outX ? 0.6 : 0.3, 0.14, outZ ? 0.6 : 0.3, 0x2a2a2a);
    this.add('glow', part(BOX, LAMP_GLOW, x + outX * 1.5, y + 6.56, z + outZ * 1.5, outX ? 0.5 : 0.22, 0.04, outZ ? 0.5 : 0.22), x, z);
    this.addCircle(x, z, 0.15);
    (this.lampHeads = this.lampHeads || []).push([x + outX * 1.5, z + outZ * 1.5]);
  }

  tree(x, z, scale) {
    const y = this.groundAt(x, z), r = this.random;
    this.add('static', part(TRUNK, 0x5a4330, x, y + 1.6 * scale, z, scale, scale, scale), x, z);
    const greens = [0x3f6b2a, 0x4d7a30, 0x5a8a35, 0x35602a];
    for (let k = 0; k < 4; k++) {
      const s = (1.4 + r() * 0.8) * scale;
      this.add('static', part(LEAVES, greens[Math.floor(r() * greens.length)],
        x + (r() - 0.5) * 1.8 * scale, y + (3.6 + r() * 1.4) * scale, z + (r() - 0.5) * 1.8 * scale, s, s * 0.8, s), x, z);
    }
    this.addCircle(x, z, 0.25 * scale);
  }

  // Coconut palm: curved trunk + drooping fronds.
  palm(x, z, h) {
    const r = this.random, y = this.groundAt(x, z);
    const lean = 0.08 + r() * 0.12, la = r() * Math.PI * 2, lx = Math.sin(la), lz = Math.cos(la);
    const segs = 7;
    let px = x, pz = z, py = y;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const ox0 = lean * h * t0 * t0, ox1 = lean * h * t1 * t1;
      const nx = x + lx * ox1, nz = z + lz * ox1, ny = y + h * t1;
      const dx = nx - px, dy = ny - py, dz = nz - pz, L = Math.hypot(dx, dy, dz);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
      const e = new THREE.Euler().setFromQuaternion(q);
      const rad = 0.2 - 0.06 * t0;
      this.add('static', part(PALM_SEG, i % 2 ? 0x8a6b4a : 0x7a5d40, (px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, rad, L * 1.04, rad, e.x, e.y, e.z), x, z);
      px = nx; py = ny; pz = nz; void ox0;
    }
    const fr = 9;
    for (let k = 0; k < fr; k++) {
      const a = (k / fr) * Math.PI * 2 + r() * 0.3;
      const s = 1.15 + r() * 0.45;
      this.add('palm', part(FROND, 0xffffff, px, py + 0.1, pz, s, s, s, 0, a, 0), x, z);
    }
    this.add('static', part(LEAVES, 0x5b3d1f, px, py - 0.1, pz, 0.35, 0.3, 0.35), x, z);   // coconuts
    this.addCircle(x, z, 0.3);
  }

  wire(a, b) {
    for (let c = 0; c < 3; c++) {
      const off = (c - 1) * 0.25;
      let prev = null;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const p = [a[0] + (b[0] - a[0]) * t + off, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.6 - c * 0.15, a[2] + (b[2] - a[2]) * t + off];
        if (prev) this.wires.push(...prev, ...p);
        prev = p;
      }
    }
  }

  // North, east and west edges: footpath + a ring of buildings facing the city.
  buildOuterRing() {
    const rMax = LINES[LINES.length - 1] + HALF_ROAD, rMin = LINES[0] - HALF_ROAD;
    const e = rMax + FOOT_W;
    this.slab(-e, rMax, e, e);
    this.slab(-e, rMin, rMin, rMax);
    this.slab(rMax, rMin, e, rMax);
    this.row(-e - BLD_DEPTH, e + BLD_DEPTH, e, e + BLD_DEPTH, 'x', 14, [0, -1], {});
    this.row(-e - BLD_DEPTH, -e, rMin, e, 'z', 12, [1, 0], {});
    this.row(e, e + BLD_DEPTH, rMin, e, 'z', 12, [-1, 0], {});
  }

  // Marine-drive style seafront: palm promenade, sea wall with steps, beach, the sea.
  buildSeafront() {
    const x0 = -EDGE - BLD_DEPTH, x1 = EDGE + BLD_DEPTH;
    const { z0, z1 } = PROMENADE;
    for (let x = x0; x < x1; x += 80) this.slab(x, z0, Math.min(x1, x + 80), z1);
    // Sea wall with gaps (steps down to the beach).
    const steps = [-150, 0, 150];
    let start = x0;
    for (const sx of [...steps, x1 + 10]) {
      const end = Math.min(x1, sx - 3);
      if (end > start) {
        this.addBox((start + end) / 2, 0.25, WALL_Z - 0.35, end - start, 0.8, 0.7, 0xd8d0be);
        this.addBox((start + end) / 2, 0.67, WALL_Z - 0.35, end - start, 0.06, 0.8, 0xeee8da);
        this.addSolid(start, WALL_Z - 0.7, end, WALL_Z, 0.9, { nosight: true, nomap: true });
      }
      if (sx <= x1) for (let k = 0; k < 3; k++) this.addBox(sx, -0.1 - k * 0.15, WALL_Z - 0.9 - k * 0.6, 6, 0.3, 0.6, 0xbdb3a0);
      start = sx + 3;
    }
    for (let x = x0 + 6; x < x1; x += 13) {
      this.palm(x, z0 + 1.6, 8 + this.random() * 4);
      if (Math.round(x / 13) % 2 === 0) this.lamp(x + 6.5, z0 + 1.0, 0, 1);
      if (Math.round(x / 13) % 3 === 0) this.bench(x + 3, z0 + 2.2, Math.PI);
    }
    // Beach (slopes gently into the water).
    const sand = new THREE.PlaneGeometry(x1 - x0, -(SAND_END - WALL_Z), 1, 1);
    sand.rotateX(-Math.PI / 2);
    const pos = sand.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const zz = pos.getZ(i);
      pos.setY(i, zz < 0 ? -0.15 : -1.3);   // high at the wall, below sea level far out
    }
    sand.translate((x0 + x1) / 2, 0, (WALL_Z + SAND_END) / 2);
    sand.computeVertexNormals();
    const st = sandTexture(); st.repeat.set((x1 - x0) / 6, (WALL_Z - SAND_END) / 6);
    const sandMesh = new THREE.Mesh(sand, new THREE.MeshStandardMaterial({ map: st, roughness: 1 }));
    sandMesh.receiveShadow = this.shadows;
    this.scene.add(sandMesh);
    this.mapRects.push({ x0, z0: SAND_END, x1, z1: WALL_Z, kind: 'sand' });
    // Umbrellas, chairs, a lifeguard tower.
    const cols = [0xff5d8f, 0x2ec4b6, 0xffd166, 0xef476f, 0x118ab2];
    for (let x = x0 + 20; x < x1 - 20; x += 22) {
      const z = WALL_Z - 6 - this.random() * 4, gy = this.groundAt(x, z);
      this.add('static', part(CONE, cols[Math.floor(this.random() * cols.length)], x, gy + 2.4, z, 1.5, 0.5, 1.5), x, z);
      this.addBox(x, gy + 1.2, z, 0.06, 2.4, 0.06, 0xeeeeee);
      this.addBox(x + 1.2, gy + 0.2, z - 1.0, 0.7, 0.12, 1.8, 0xf5f5f5);
      this.spots.beach.push({ x: x - 1, z: z - 1.4 });
    }
    this.addBox(60, 1.6, WALL_Z - 9, 2.6, 0.2, 2.6, 0xf5f5f5);
    for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) this.addBox(60 + dx, 0.6, WALL_Z - 9 + dz, 0.15, 2.4, 0.15, 0xcc3333);
    this.addBox(60, 2.6, WALL_Z - 9, 2.2, 1.6, 2.2, 0xd62828);
    // The sea is a wall for walking (no swimming in this demo).
    this.addSolid(x0 - 50, -2000, x1 + 50, SAND_END + 14, 1, { nosight: true, nomap: true });
    this.mapRects.push({ x0: -900, z0: -900, x1: 900, z1: SAND_END + 10, kind: 'water' });
  }

  // Far away: city skyline (N/E/W) and islands + boats out at sea (S).
  buildSkyline() {
    const r = this.random;
    for (let i = 0; i < 90; i++) {
      const ang = (i / 90) * Math.PI * 1.25 - Math.PI * 0.125;   // only the land side
      const dist = 330 + r() * 160;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist + 40;
      const w = 16 + r() * 24, d = w * (0.6 + r() * 0.6);
      const h = 14 + Math.floor(r() * 22) * FLOOR_H;
      const style = Math.floor(r() * FACADE_COUNT);
      if (r() < 0.3) this.add('glass' + Math.floor(r() * GLASS_TINTS.length), wallsGeometry(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, h * 1.6, 3, 3.6), x, z);
      else this.add('facade' + style, wallsGeometry(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, h, 3, FLOOR_H), x, z);
    }
    for (const [x, z, s, h] of [[-420, -720, 140, 45], [-120, -820, 90, 30], [330, -760, 160, 60], [620, -640, 110, 35]]) {
      this.add('static', part(HILL, 0x5d6b55, x, h / 2 - 2, z, s, h, s * 0.6), x, z);
    }
    // Boats bobbing out at sea.
    for (const [x, z, c] of [[-60, -330, 0xf2f2f2], [90, -380, 0xd62828], [-180, -420, 0x1d70b8], [210, -310, 0xf2c21b]]) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(BOAT_HULL, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
      const cabin = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }));
      cabin.scale.set(2.2, 1.4, 3); cabin.position.set(0, 1.6, -0.5);
      g.add(hull, cabin);
      g.position.set(x, SEA_LEVEL, z); g.rotation.y = r() * 6;
      this.scene.add(g);
      this.animated.push({ obj: g, t: r() * 6 });
    }
  }

  // A speedboat at the water's edge (missions). Set userData.sail = true to send it out to sea.
  makeBoat(x, z, color) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(BOAT_HULL, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
    hull.scale.set(0.7, 0.7, 0.75);
    const deck = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 }));
    deck.scale.set(1.6, 0.9, 1.4); deck.position.set(0, 0.9, 0.4);
    const stripe = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 }));
    stripe.scale.set(2.3, 0.15, 5.9); stripe.position.y = 0.45;
    g.add(hull, deck, stripe);
    g.position.set(x, SEA_LEVEL, z); g.rotation.y = Math.PI;
    this.scene.add(g);
    this.animated.push({ obj: g, t: 0 });
    return g;
  }

  buildSea(normalTex) {
    normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(60, 60);
    this.seaTex = normalTex;
    const m = new THREE.MeshStandardMaterial({ color: 0x1b5d70, roughness: 0.06, metalness: 0.45, normalMap: normalTex, normalScale: new THREE.Vector2(0.55, 0.55) });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1600), m);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, SEA_LEVEL, SAND_END - 790);
    this.scene.add(sea);
    this.poolMat.normalMap = normalTex.clone(); this.poolMat.normalMap.repeat.set(2, 2); this.poolMat.needsUpdate = true;
  }

  update(dt, t) {
    if (this.seaTex) { this.seaTex.offset.x = t * 0.004; this.seaTex.offset.y = t * 0.006; }
    for (const b of this.animated) {
      b.t += dt;
      if (b.obj.userData.sail) { b.st = (b.st || 0) + dt; b.obj.position.z -= dt * Math.min(16, 3 + b.st * 3); }
      b.obj.position.y = SEA_LEVEL + Math.sin(b.t * 1.1) * 0.15;
      b.obj.rotation.z = Math.sin(b.t * 0.9) * 0.04;
      b.obj.rotation.x = Math.sin(b.t * 0.7) * 0.03;
    }
  }

  // Build all merged meshes (per material, per chunk).
  finishStatic() {
    const shopTex = shopTexture();
    const mats = {
      ground: atlasMaterial([asphaltTexture(), pavingTexture(), kerbTexture(), grassTexture()], 256, 256, { roughness: 0.92 }),
      walls: atlasMaterial([...range(FACADE_COUNT).map(facadeTexture), ...range(DECO_COUNT).map(decoTexture)], 128, 136, { roughness: 0.8 },
        [...range(FACADE_COUNT).map(facadeMask), ...range(DECO_COUNT).map(decoMask)]),
      glassA: atlasMaterial(GLASS_TINTS.map(glassTexture), 128, 154, { roughness: 0.12, metalness: 0.65 }, GLASS_TINTS.map(glassMask), true),
      shop: new THREE.MeshStandardMaterial({ map: shopTex, roughness: 0.8, emissive: 0xffd9a0, emissiveMap: shopTex, emissiveIntensity: 0.25 }),
      lobby: new THREE.MeshStandardMaterial({ map: shopTex, color: 0xb8c4d0, roughness: 0.3, metalness: 0.3 }),
      signs: new THREE.MeshStandardMaterial({ map: this.atlas.texture, emissive: 0xffffff, emissiveMap: this.atlas.texture, emissiveIntensity: 0.45, roughness: 0.6 }),
      neon: new THREE.MeshBasicMaterial({ map: this.neon.texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) }),
      static: vertexColorMaterial,
      glow: vertexColorGlow,
      palm: new THREE.MeshStandardMaterial({ map: palmTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }),
      pool: new THREE.MeshStandardMaterial({ color: 0x2fb6d6, roughness: 0.05, metalness: 0.2 }),
    };
    this.poolMat = mats.pool;
    this.mats = mats;
    this.glowMat = vertexColorGlow;

    for (const [key, parts] of this.chunks) {
      const mat = key.split('|')[0];
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(mergeParts(parts), mats[mat] || vertexColorMaterial);
      const big = /walls|glassA|shop|lobby|static/.test(mat);
      mesh.castShadow = this.shadows && big;
      mesh.receiveShadow = this.shadows && !/neon|glow|signs/.test(mat);
      mesh.matrixAutoUpdate = false;
      mesh.geometry.computeBoundingSphere();
      mesh.userData.chunk = key;
      this.scene.add(mesh);
    }
    this.chunks.clear();
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(this.wires, 3));
    this.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x151515 })));
  }

  // ---------- Collision helpers ----------
  groundAt(x, z) {
    if (z < WALL_Z - 0.6) {
      // Beach: from -0.15 at the wall down to -1.3 at the far end.
      const t = Math.min(1, Math.max(0, (WALL_Z - z) / (WALL_Z - SAND_END)));
      return -0.15 - t * 1.15;
    }
    let h = 0;
    this.near('s', x, z, x, z, (s) => {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) { h = FOOT_TOP; return true; }
      return false;
    });
    return h;
  }

  resolveCircle(obj, r, y = 0) {
    this.near('b', obj.x - r, obj.z - r, obj.x + r, obj.z + r, (b) => {
      if (y > 0.3 && FOOT_TOP + b.h < y) return false;   // flying over it
      const cx = Math.max(b.x0, Math.min(obj.x, b.x1));
      const cz = Math.max(b.z0, Math.min(obj.z, b.z1));
      const dx = obj.x - cx, dz = obj.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return false;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        obj.x += (dx / d) * (r - d); obj.z += (dz / d) * (r - d);
      } else {
        const left = obj.x - b.x0, right = b.x1 - obj.x, down = obj.z - b.z0, up = b.z1 - obj.z;
        const m = Math.min(left, right, down, up);
        if (m === left) obj.x = b.x0 - r; else if (m === right) obj.x = b.x1 + r;
        else if (m === down) obj.z = b.z0 - r; else obj.z = b.z1 + r;
      }
      return false;
    });
    if (y > 1.4) return;
    this.near('c', obj.x - r, obj.z - r, obj.x + r, obj.z + r, (c) => {
      const dx = obj.x - c.x, dz = obj.z - c.z, min = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) { const d = Math.sqrt(d2); obj.x += (dx / d) * (min - d); obj.z += (dz / d) * (min - d); }
      return false;
    });
  }

  // Is the line from A to B blocked by a building? (police eyes; low walls / stalls do not block)
  segmentBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    return this.near('b', Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz),
      (b) => !b.nosight && segmentHitsRect(ax, az, dx, dz, b));
  }

  // Can something walk/drive from A to B in a straight line? (includes low walls)
  pathBlocked(ax, az, bx, bz, pad = 0) {
    const dx = bx - ax, dz = bz - az;
    return this.near('b', Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad,
      (b) => b.h > 0.5 && segmentHitsRect(ax, az, dx, dz, pad ? { x0: b.x0 - pad, z0: b.z0 - pad, x1: b.x1 + pad, z1: b.z1 + pad } : b));
  }

  rayCast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    if (dy < -1e-6) { const t = (0.05 - oy) / dy; if (t > 0 && t < best) best = t; }
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    this.near('b', Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
      if (b.nosight && b.h > 2) return false;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, FOOT_TOP, b.z0, b.x1, FOOT_TOP + b.h + 1, b.z1);
      if (t >= 0 && t < best) best = t;
      return false;
    });
    return best;
  }
}

const TANK = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12);
const POLE = new THREE.CylinderGeometry(0.07, 0.11, 6.8, 6);
const TRUNK = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6);
const LEAVES = new THREE.IcosahedronGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const RING = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
const DISC = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const HILL = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const PALM_SEG = new THREE.CylinderGeometry(1, 1.08, 1, 7);
const BOAT_HULL = (() => {
  const s = new THREE.Shape([new THREE.Vector2(-1.6, 0.9), new THREE.Vector2(1.6, 0.9), new THREE.Vector2(1.1, -0.3), new THREE.Vector2(-1.1, -0.3)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false });
  g.translate(0, 0, -4);
  return g;
})();
// One palm frond: a long leaf that droops down at the tip.
const FROND = (() => {
  const g = new THREE.PlaneGeometry(1.4, 3.6, 1, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 1.8;                       // 0 at the trunk .. 3.6 at the tip
    p.setXYZ(i, p.getX(i), -0.25 * y * y * 0.35 + 0.35 * y, y);
  }
  g.computeVertexNormals();
  return g;
})();

function segmentHitsRect(ax, az, dx, dz, b) {
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - b.x0) && clip(dx, b.x1 - ax) && clip(-dz, az - b.z0) && clip(dz, b.z1 - az) && t0 <= t1;
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const axis = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > tmin) tmin = a; if (b < tmax) tmax = b;
    return tmin <= tmax;
  };
  if (!axis(ox, dx, x0, x1) || !axis(oy, dy, y0, y1) || !axis(oz, dz, z0, z1)) return -1;
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

// ---------- Texture atlases ----------
// Which atlas (and which tile in it) a material name belongs to.
function atlasSlot(key) {
  if (key === 'asphalt') return ['ground', 0];
  if (key === 'paving') return ['ground', 1];
  if (key === 'kerb') return ['ground', 2];
  if (key === 'grass') return ['ground', 3];
  let m = /^facade(\d+)$/.exec(key); if (m) return ['walls', +m[1]];
  m = /^deco(\d+)$/.exec(key); if (m) return ['walls', FACADE_COUNT + +m[1]];
  m = /^glass(\d+)$/.exec(key); if (m) return ['glassA', +m[1]];
  return null;
}
const range = (n) => [...Array(n).keys()];

// Night and city-lights switches shared by the building shaders (set by the atmosphere).
export const CITY = { night: { value: 0 }, lights: { value: 1 } };

// Stack tiles in one tall picture. The shader picks the tile from the UV (tile * 1000 + 500 is
// added to V) and repeats inside it; textureGrad keeps the edges between repeats clean.
// masks (optional): a matching picture where windows are white: glass reflects the sky by day,
// and at night random rooms light up (warm, cool white or TV blue).
function atlasMaterial(textures, w, h, props, masks = null, officeLights = false) {
  const stack = (list) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h * list.length;
    const g = c.getContext('2d');
    // Tile 0 at the bottom (V = 0 is the bottom row of a texture).
    list.forEach((img, i) => g.drawImage(img, 0, (list.length - 1 - i) * h, w, h));
    return c;
  };
  const tex = new THREE.CanvasTexture(stack(textures.map((t) => t.image)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  for (const t of textures) t.dispose();
  const mat = new THREE.MeshStandardMaterial({ map: tex, ...props });
  const n = textures.length.toFixed(1), inset = (0.5 / h).toFixed(5);
  let winTex = null;
  if (masks) { winTex = new THREE.CanvasTexture(stack(masks)); winTex.wrapS = THREE.RepeatWrapping; }
  mat.onBeforeCompile = (sh) => {
    if (winTex) {
      sh.uniforms.uWin = { value: winTex };
      sh.uniforms.uNight = CITY.night; sh.uniforms.uLights = CITY.lights;
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = 'uniform sampler2D uWin; uniform float uNight; uniform float uLights; varying vec3 vWPos;\n' + sh.fragmentShader;
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      float wm = 0.0;
      #ifdef USE_MAP
        float tIdx = floor( vMapUv.y / 1000.0 );
        vec2 tUv = vec2( vMapUv.x, vMapUv.y - tIdx * 1000.0 - 500.0 );
        vec2 aUv = vec2( fract( tUv.x ), ( tIdx + ${inset} + fract( tUv.y ) * ( 1.0 - 2.0 * ${inset} ) ) / ${n} );
        vec2 gUv = vec2( tUv.x, tUv.y / ${n} );
        diffuseColor *= textureGrad( map, aUv, dFdx( gUv ), dFdy( gUv ) );
        ${winTex ? 'wm = textureGrad( uWin, aUv, dFdx( gUv ), dFdy( gUv ) ).r;' : ''}
      #endif
    `);
    if (winTex) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, 0.07, wm );')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix( metalnessFactor, 0.92, wm );')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 cell = floor( vec3( ( vWPos.x + vWPos.z ) / 3.0, vWPos.y / ${officeLights ? '3.6' : '3.2'}, ( vWPos.z - vWPos.x ) / 3.0 ) );
            float hs = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
            float on = step( ${officeLights ? '0.45' : '0.6'}, fract( hs * 7.31 ) );
            vec3 room = hs < 0.3 ? vec3( 1.0, 0.62, 0.3 ) : hs < 0.42 ? vec3( 0.35, 0.55, 1.0 ) : vec3( 1.0, 0.78, 0.5 );
            ${officeLights ? 'room = mix( room, vec3( 0.85, 0.92, 1.0 ), 0.6 );' : ''}
            totalEmissiveRadiance += room * on * wm * uNight * uLights * ${officeLights ? '0.75' : '0.85'};
          }`);
    }
  };
  mat.customProgramCacheKey = () => 'atlas' + n + inset + (winTex ? 'w' + officeLights : '');
  return mat;
}
