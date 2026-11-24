// Navapur city block (fictional Indian city): roads, footpaths, buildings with
// shops and signs, street lamps, trees, overhead wires, distant skyline,
// plus simple collision checks used by the player, police and camera.
import * as THREE from 'three';
import { seededRandom } from './util.js';
import {
  BOX, part, mergeParts, wallsGeometry, floorGeometry, signGeometry,
  vertexColorMaterial, vertexColorGlow,
} from './mesh.js';
import {
  asphaltTexture, pavingTexture, kerbTexture, groundTexture,
  facadeTexture, FACADE_COUNT, shopTexture, signAtlas,
} from './textures.js';

export const LINES = [-70, 0, 70];      // road centre lines (X and Z)
export const ROAD_W = 9;
export const HALF_ROAD = 4.5;
export const LANE_OFF = 2.25;
export const STOP_BACK = 9;              // stop line distance from crossing centre (zebra crossing in front)
export const FOOT_W = 4;
export const FOOT_TOP = 0.15;
export const ROAD_TOP = 0.02;
const BLD_DEPTH = 15;
const GAP = 3;
const SHOP_H = 4.2;
const FLOOR_H = 3.2;

const LAMP_GLOW = new THREE.Color(3.2, 2.4, 1.3);   // brighter than white = glows with bloom

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;              // 'low' | 'medium' | 'high'
    this.shadows = quality !== 'low';
    this.random = seededRandom(2026);
    this.buildings = [];   // collision rects {x0, z0, x1, z1, h}
    this.circles = [];     // small round obstacles {x, z, r} (tree trunks, poles)
    this.slabs = [];       // footpath areas
    this.mapRects = [];    // mini-map

    this.parts = { static: [], glow: [], asphalt: [], paving: [], kerb: [], shop: [], signs: [] };
    this.facadeParts = Array.from({ length: FACADE_COUNT }, () => []);
    this.wires = [];
    this.atlas = signAtlas();

    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildSkyline();
  }

  // Static box (never moves) in plain colour. Merged into one mesh at the end.
  addBox(x, y, z, sx, sy, sz, colorHex) {
    this.parts.static.push(part(BOX, colorHex, x, y, z, sx, sy, sz));
  }

  // ---------------------------------------------------------------------------
  // Ground and roads
  // ---------------------------------------------------------------------------
  buildGround() {
    const tex = groundTexture();
    tex.repeat.set(60, 60);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.01;
    g.receiveShadow = this.shadows;
    this.scene.add(g);
  }

  buildRoads() {
    const min = LINES[0] - HALF_ROAD, max = LINES[LINES.length - 1] + HALF_ROAD;
    const A = this.parts.asphalt;
    for (const z of LINES) {
      A.push(floorGeometry(min, z - HALF_ROAD, max, z + HALF_ROAD, ROAD_TOP, 8));
      this.mapRects.push({ x0: min, z0: z - HALF_ROAD, x1: max, z1: z + HALF_ROAD, kind: 'road' });
    }
    for (const x of LINES) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const z0 = LINES[j] + HALF_ROAD, z1 = LINES[j + 1] - HALF_ROAD;
        A.push(floorGeometry(x - HALF_ROAD, z0, x + HALF_ROAD, z1, ROAD_TOP, 8));
        this.mapRects.push({ x0: x - HALF_ROAD, z0, x1: x + HALF_ROAD, z1, kind: 'road' });
      }
    }

    // Lane markings: white dashed centre line, solid edge lines.
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

    // Zebra crossings on every road leaving a crossing.
    for (const cx of LINES) for (const cz of LINES) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ox = cx + dx * (HALF_ROAD + 2.2), oz = cz + dz * (HALF_ROAD + 2.2);
        if (Math.abs(ox) > LINES[LINES.length - 1] + 1 || Math.abs(oz) > LINES[LINES.length - 1] + 1) continue;
        for (let s = -HALF_ROAD + 0.6; s < HALF_ROAD - 0.3; s += 1.0) {
          if (dx !== 0) this.addBox(ox, y, cz + s, 3.2, 0.01, 0.5, 0xf2f2f2);
          else this.addBox(cx + s, y, oz, 0.5, 0.01, 3.2, 0xf2f2f2);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Blocks: footpaths, buildings, shops, signs, roofs, street furniture
  // ---------------------------------------------------------------------------
  buildBlocks() {
    for (let i = 0; i < LINES.length - 1; i++) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const x0 = LINES[i] + HALF_ROAD, x1 = LINES[i + 1] - HALF_ROAD;
        const z0 = LINES[j] + HALF_ROAD, z1 = LINES[j + 1] - HALF_ROAD;
        this.slab(x0, z0, x1, z1);
        this.streetFurniture(x0, z0, x1, z1);

        const bx0 = x0 + FOOT_W, bx1 = x1 - FOOT_W, bz0 = z0 + FOOT_W, bz1 = z1 - FOOT_W;
        this.row(bx0, bx1, bz0, bz0 + BLD_DEPTH, 'x', 3, [0, -1]);
        this.row(bx0, bx1, bz1 - BLD_DEPTH, bz1, 'x', 3, [0, 1]);
        this.row(bx0, bx0 + BLD_DEPTH, bz0 + BLD_DEPTH + GAP, bz1 - BLD_DEPTH - GAP, 'z', 1, [-1, 0]);
        this.row(bx1 - BLD_DEPTH, bx1, bz0 + BLD_DEPTH + GAP, bz1 - BLD_DEPTH - GAP, 'z', 1, [1, 0]);
        this.courtyard(bx0 + BLD_DEPTH, bz0 + BLD_DEPTH, bx1 - BLD_DEPTH, bz1 - BLD_DEPTH);
      }
    }

    // Outer ring: footpath and a ring of buildings facing the city.
    const rMin = LINES[0] - HALF_ROAD, rMax = LINES[LINES.length - 1] + HALF_ROAD;
    const e = rMax + FOOT_W;
    this.slab(-e, -e, e, rMin);
    this.slab(-e, rMax, e, e);
    this.slab(-e, rMin, rMin, rMax);
    this.slab(rMax, rMin, e, rMax);
    this.row(-e - BLD_DEPTH, e + BLD_DEPTH, -e - BLD_DEPTH, -e, 'x', 7, [0, 1]);
    this.row(-e - BLD_DEPTH, e + BLD_DEPTH, e, e + BLD_DEPTH, 'x', 7, [0, -1]);
    this.row(-e - BLD_DEPTH, -e, -e, e, 'z', 6, [1, 0]);
    this.row(e, e + BLD_DEPTH, -e, e, 'z', 6, [-1, 0]);
  }

  slab(x0, z0, x1, z1) {
    this.parts.paving.push(floorGeometry(x0, z0, x1, z1, FOOT_TOP, 2));
    this.parts.kerb.push(wallsGeometry(x0, z0, x1, z1, 0, FOOT_TOP, 1, FOOT_TOP));
    this.slabs.push({ x0, z0, x1, z1 });
    this.mapRects.push({ x0, z0, x1, z1, kind: 'block' });
  }

  row(x0, x1, z0, z1, axis, count, facing) {
    if (axis === 'x') {
      const w = (x1 - x0 - GAP * (count - 1)) / count;
      for (let k = 0; k < count; k++) {
        const a = x0 + k * (w + GAP);
        this.building(a, z0, a + w, z1, facing);
      }
    } else {
      const w = (z1 - z0 - GAP * (count - 1)) / count;
      for (let k = 0; k < count; k++) {
        const a = z0 + k * (w + GAP);
        this.building(x0, a, x1, a + w, facing);
      }
    }
  }

  building(x0, z0, x1, z1, facing) {
    const r = this.random;
    const floors = 2 + Math.floor(r() * 6);              // 2 to 7 floors above the shops
    const top = FOOT_TOP + SHOP_H + floors * FLOOR_H;
    const style = Math.floor(r() * FACADE_COUNT);
    const h = top - FOOT_TOP;

    // Shop floor + upper floors (textures repeat at real size).
    this.parts.shop.push(wallsGeometry(x0, z0, x1, z1, FOOT_TOP, FOOT_TOP + SHOP_H, 8, SHOP_H));
    this.facadeParts[style].push(wallsGeometry(x0, z0, x1, z1, FOOT_TOP + SHOP_H, top, 3, FLOOR_H));

    // Floor ledges (balcony slabs) on some buildings: real depth for cheap.
    const trims = [0xd9ccb0, 0xb5705c, 0x8fae98, 0x9aa0a8, 0x8c4735, 0xd8cc84];
    if (r() < 0.6) {
      for (let f = 1; f <= floors; f++) {
        const y = FOOT_TOP + SHOP_H + f * FLOOR_H - 0.08;
        if (f === floors) break;
        this.addBox((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0 + 0.5, 0.14, z1 - z0 + 0.5, trims[style]);
      }
    }
    // Concrete band over the shops.
    this.addBox((x0 + x1) / 2, FOOT_TOP + SHOP_H, (z0 + z1) / 2, x1 - x0 + 0.3, 0.3, z1 - z0 + 0.3, 0xcfc8ba);

    // Roof: slab, parapet, black water tank(s), stair room - the classic Indian rooftop.
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    this.addBox(cx, top, cz, w, 0.12, d, 0x8d8880);
    const pc = 0xb8b0a2;
    this.addBox(cx, top + 0.45, z0 + 0.1, w, 0.9, 0.2, pc);
    this.addBox(cx, top + 0.45, z1 - 0.1, w, 0.9, 0.2, pc);
    this.addBox(x0 + 0.1, top + 0.45, cz, 0.2, 0.9, d, pc);
    this.addBox(x1 - 0.1, top + 0.45, cz, 0.2, 0.9, d, pc);
    const tanks = 1 + Math.floor(r() * 2);
    for (let t = 0; t < tanks; t++) {
      const tx = x0 + 1.5 + r() * (w - 3), tz = z0 + 1.5 + r() * (d - 3);
      this.parts.static.push(part(TANK, 0x1a1a1a, tx, top + 0.85, tz));
      this.addBox(tx, top + 0.15, tz, 1.4, 0.2, 1.4, 0x6e6a64);
    }
    if (r() < 0.6) this.addBox(x0 + 2 + r() * (w - 4), top + 1.2, z0 + 2 + r() * (d - 4), 2.5, 2.4, 2.5, pc);

    // Awning + shop sign on the street side.
    const [nx, nz] = facing;
    const along = nx === 0 ? w : d;
    const fx = nx === 0 ? cx : (nx > 0 ? x1 : x0);
    const fz = nz === 0 ? cz : (nz > 0 ? z1 : z0);
    const awningColors = [0xc0392b, 0x1f6fb2, 0x2f8f4e, 0xe3a21a, 0x8e44ad];
    const ac = awningColors[Math.floor(r() * awningColors.length)];
    // Sloped awning (tilts down away from the wall) with a front lip.
    const tilt = 0.32, depth = 1.7, ay = FOOT_TOP + 3.0;
    if (nx === 0) {
      this.parts.static.push(part(BOX, ac, fx, ay, fz + nz * depth / 2, along - 0.4, 0.07, depth, nz * tilt, 0, 0));
      this.addBox(fx, ay - 0.42, fz + nz * (depth - 0.08), along - 0.4, 0.3, 0.05, ac);
    } else {
      this.parts.static.push(part(BOX, ac, fx + nx * depth / 2, ay, fz, depth, 0.07, along - 0.4, 0, 0, -nx * tilt));
      this.addBox(fx + nx * (depth - 0.08), ay - 0.42, fz, 0.05, 0.3, along - 0.4, ac);
    }
    const shopRect = this.atlas.rects.shops[Math.floor(r() * this.atlas.rects.shops.length)];
    const signW = Math.min(along - 1.2, 8);
    this.parts.signs.push(signGeometry(fx + nx * 0.06, FOOT_TOP + 3.65, fz + nz * 0.06, signW, signW / 8, nx, nz, shopRect));

    // A few rooftop billboards.
    if (r() < 0.22) {
      const board = this.atlas.rects.boards[Math.floor(r() * this.atlas.rects.boards.length)];
      const bw = Math.min(along - 2, 10), bh = bw / 2;
      const bx = cx + nx * (Math.abs(nx) ? w / 2 - 1.5 : 0), bz = cz + nz * (Math.abs(nz) ? d / 2 - 1.5 : 0);
      this.parts.signs.push(signGeometry(bx, top + 1.2 + bh / 2, bz, bw, bh, nx, nz, board));
      // Steel frame behind the board.
      this.addBox(bx - nx * 0.2, top + 0.6 + bh / 2, bz - nz * 0.2, nx ? 0.2 : bw, bh + 1.2, nz ? 0.2 : bw, 0x3a3a3a);
    }

    this.buildings.push({ x0, z0, x1, z1, h });
    this.mapRects.push({ x0, z0, x1, z1, kind: 'building' });
  }

  // Hidden courtyard: a small garden, parked bikes, a neem tree.
  courtyard(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.parts.paving.push(floorGeometry(x0, z0, x1, z1, FOOT_TOP + 0.005, 2));
    this.tree(cx, cz, 1.3);
    this.addBox(cx + 4, FOOT_TOP + 0.4, cz - 3, 3, 0.8, 1.2, 0x5b4636);   // old cart
  }

  // Lamps every 20 m and trees between them, wires hung from lamp to lamp.
  streetFurniture(x0, z0, x1, z1) {
    const inset = 0.7;
    const edges = [
      [x0 + inset, z0 + inset, x1 - inset, z0 + inset, 0, 1],
      [x1 - inset, z0 + inset, x1 - inset, z1 - inset, -1, 0],
      [x1 - inset, z1 - inset, x0 + inset, z1 - inset, 0, -1],
      [x0 + inset, z1 - inset, x0 + inset, z0 + inset, 1, 0],
    ];
    for (const [ax, az, bx, bz, inx, inz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      let prevTop = null;
      for (let s = 10; s < len - 8; s += 20) {
        const px = ax + ux * s, pz = az + uz * s;
        this.lamp(px, pz, -inx, -inz);
        const topPt = [px, FOOT_TOP + 6.6, pz];
        if (prevTop) this.wire(prevTop, topPt);
        prevTop = topPt;
        if (s + 10 < len - 8) this.tree(px + ux * 10 + inx * 0.2, pz + uz * 10 + inz * 0.2, 0.9 + this.random() * 0.4);
      }
    }
  }

  lamp(x, z, outX, outZ) {
    const y = FOOT_TOP;
    this.parts.static.push(part(POLE, 0x4a4d52, x, y + 3.4, z));
    this.addBox(x + outX * 0.8, y + 6.8, z + outZ * 0.8, outX ? 1.6 : 0.12, 0.12, outZ ? 1.6 : 0.12, 0x4a4d52);
    this.addBox(x + outX * 1.5, y + 6.65, z + outZ * 1.5, outX ? 0.6 : 0.3, 0.14, outZ ? 0.6 : 0.3, 0x2a2a2a);
    this.parts.glow.push(part(BOX, LAMP_GLOW, x + outX * 1.5, y + 6.56, z + outZ * 1.5, outX ? 0.5 : 0.22, 0.04, outZ ? 0.5 : 0.22));
    this.circles.push({ x, z, r: 0.15 });
  }

  tree(x, z, scale) {
    const y = FOOT_TOP, r = this.random;
    this.parts.static.push(part(TRUNK, 0x5a4330, x, y + 1.6 * scale, z, scale, scale, scale));
    const greens = [0x3f6b2a, 0x4d7a30, 0x5a8a35, 0x35602a];
    for (let k = 0; k < 4; k++) {
      const s = (1.4 + r() * 0.8) * scale;
      this.parts.static.push(part(LEAVES, greens[Math.floor(r() * greens.length)],
        x + (r() - 0.5) * 1.8 * scale, y + (3.6 + r() * 1.4) * scale, z + (r() - 0.5) * 1.8 * scale, s, s * 0.8, s));
    }
    this.circles.push({ x, z, r: 0.25 * scale });
  }

  // Sagging overhead wire between two points (3 parallel cables).
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

  // Tall blocks far away: makes the city feel huge (hidden in the haze).
  buildSkyline() {
    const r = this.random;
    for (let i = 0; i < 80; i++) {
      const ang = (i / 80) * Math.PI * 2 + r() * 0.04;
      const dist = 150 + r() * 140;
      const w = 14 + r() * 22, d = w * (0.6 + r() * 0.6);
      const h = 12 + Math.floor(r() * 16) * FLOOR_H;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      const style = Math.floor(r() * FACADE_COUNT);
      // Same window textures as the real buildings; the haze hides the rest.
      this.facadeParts[style].push(wallsGeometry(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, h, 3, FLOOR_H));
      this.addBox(x, h, z, w, 0.3, d, 0x8d8880);
      if (r() < 0.5) this.parts.static.push(part(TANK, 0x1a1a1a, x + (r() - 0.5) * w * 0.6, h + 0.8, z));
    }
  }

  // Merge everything into a handful of meshes (few draw calls = fast on phones).
  finishStatic() {
    const add = (parts, material, opts = {}) => {
      if (!parts.length) return;
      const mesh = new THREE.Mesh(mergeParts(parts), material);
      mesh.receiveShadow = this.shadows && opts.receive !== false;
      mesh.castShadow = this.shadows && !!opts.cast;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
    };
    const tex = (t) => t;
    add(this.parts.asphalt, new THREE.MeshStandardMaterial({ map: tex(asphaltTexture()), roughness: 0.92 }));
    add(this.parts.paving, new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.9 }));
    add(this.parts.kerb, new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.8 }));
    const shopTex = shopTexture();
    add(this.parts.shop, new THREE.MeshStandardMaterial({
      map: shopTex, roughness: 0.8, emissive: 0xffd9a0, emissiveMap: shopTex, emissiveIntensity: 0.25,
    }), { cast: true });
    this.facadeParts.forEach((parts, i) => {
      add(parts, new THREE.MeshStandardMaterial({ map: facadeTexture(i), roughness: 0.82 }), { cast: true });
    });
    add(this.parts.signs, new THREE.MeshStandardMaterial({
      map: this.atlas.texture, emissive: 0xffffff, emissiveMap: this.atlas.texture, emissiveIntensity: 0.45, roughness: 0.6,
    }), { receive: false });
    add(this.parts.static, vertexColorMaterial, { cast: true });
    add(this.parts.glow, vertexColorGlow, { receive: false });

    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(this.wires, 3));
    this.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x151515 })));
  }

  // ---------------------------------------------------------------------------
  // Collision helpers
  // ---------------------------------------------------------------------------
  groundAt(x, z) {
    for (const s of this.slabs) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return FOOT_TOP;
    }
    return 0;
  }

  // Push a circle (obj.x, obj.z, radius r) out of buildings, trees and poles.
  resolveCircle(obj, r) {
    for (const b of this.buildings) {
      const cx = Math.max(b.x0, Math.min(obj.x, b.x1));
      const cz = Math.max(b.z0, Math.min(obj.z, b.z1));
      const dx = obj.x - cx, dz = obj.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        obj.x += (dx / d) * (r - d);
        obj.z += (dz / d) * (r - d);
      } else {
        const left = obj.x - b.x0, right = b.x1 - obj.x, down = obj.z - b.z0, up = b.z1 - obj.z;
        const m = Math.min(left, right, down, up);
        if (m === left) obj.x = b.x0 - r;
        else if (m === right) obj.x = b.x1 + r;
        else if (m === down) obj.z = b.z0 - r;
        else obj.z = b.z1 + r;
      }
    }
    for (const c of this.circles) {
      const dx = obj.x - c.x, dz = obj.z - c.z, min = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        obj.x += (dx / d) * (min - d);
        obj.z += (dz / d) * (min - d);
      }
    }
  }

  segmentBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const b of this.buildings) if (segmentHitsRect(ax, az, dx, dz, b)) return true;
    return false;
  }

  rayCast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    if (dy < -1e-6) {
      const t = (0.05 - oy) / dy;
      if (t > 0 && t < best) best = t;
    }
    for (const b of this.buildings) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, FOOT_TOP, b.z0, b.x1, FOOT_TOP + b.h + 1, b.z1);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

// Shared shapes for street furniture.
const TANK = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12);
const POLE = new THREE.CylinderGeometry(0.07, 0.11, 6.8, 6);
const TRUNK = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6);
const LEAVES = new THREE.IcosahedronGeometry(1, 1);

function segmentHitsRect(ax, az, dx, dz, b) {
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
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
    if (a > tmin) tmin = a;
    if (b < tmax) tmax = b;
    return tmin <= tmax;
  };
  if (!axis(ox, dx, x0, x1) || !axis(oy, dy, y0, y1) || !axis(oz, dz, z0, z1)) return -1;
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
