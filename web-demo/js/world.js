// Navapur city block: ground, roads, footpaths, buildings, and simple collision checks.
// Same layout as the Unity Step 2 builder.
import * as THREE from 'three';
import { seededRandom } from './util.js';
import { BOX, part, mergeParts, vertexColorMaterial } from './mesh.js';

export const LINES = [-70, 0, 70];      // road centre lines (X and Z)
export const ROAD_W = 8;
export const HALF_ROAD = 4;
export const LANE_OFF = 2;
export const STOP_BACK = 5.5;
export const FOOT_W = 3.5;
export const FOOT_TOP = 0.15;
export const ROAD_TOP = 0.02;
const BLD_DEPTH = 16;
const GAP = 2.5;

const BUILDING_COLORS = [0xccad85, 0xa37361, 0xa8adb5, 0xe0d6a8, 0x739e99, 0xd6a07a];

export class World {
  constructor(scene, lowQuality) {
    this.scene = scene;
    this.lowQuality = lowQuality;
    this.random = seededRandom(2026);
    this.buildings = [];   // {x0, z0, x1, z1, h}
    this.slabs = [];       // footpath areas {x0, z0, x1, z1}
    this.mapRects = [];    // for the mini-map {x0, z0, x1, z1, kind}
    this.box = BOX;
    this.staticParts = [];   // everything that never moves -> merged into one mesh

    // Colours (hex).
    this.mat = {
      ground: 0x55584b,
      road: 0x38383d,
      foot: 0xa29b8d,
      yellow: 0xf2c727,
      white: 0xeeeeee,
      pole: 0x2e2e33,
    };

    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
  }

  // Add a box that never moves (road, line, footpath, pole...). Drawn later as one mesh.
  addBox(x, y, z, sx, sy, sz, colorHex) {
    this.staticParts.push(part(this.box, colorHex, x, y, z, sx, sy, sz));
  }

  // Merge all static boxes into ONE mesh = one draw call (big speed-up on phones).
  finishStatic() {
    const mesh = new THREE.Mesh(mergeParts(this.staticParts), vertexColorMaterial);
    mesh.receiveShadow = !this.lowQuality;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    this.staticParts = [];
  }

  buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ color: this.mat.ground }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = !this.lowQuality;
    this.scene.add(g);
  }

  buildRoads() {
    const min = LINES[0] - HALF_ROAD, max = LINES[LINES.length - 1] + HALF_ROAD;

    // East-west roads, full length (include the crossings).
    for (const z of LINES) {
      this.addBox(0, ROAD_TOP / 2, z, max - min, ROAD_TOP, ROAD_W, this.mat.road);
      this.mapRects.push({ x0: min, z0: z - HALF_ROAD, x1: max, z1: z + HALF_ROAD, kind: 'road' });
    }
    // North-south roads, only between crossings.
    for (const x of LINES) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const z0 = LINES[j] + HALF_ROAD, z1 = LINES[j + 1] - HALF_ROAD;
        this.addBox(x, ROAD_TOP / 2, (z0 + z1) / 2, ROAD_W, ROAD_TOP, z1 - z0, this.mat.road);
        this.mapRects.push({ x0: x - HALF_ROAD, z0, x1: x + HALF_ROAD, z1, kind: 'road' });
      }
    }
    // Yellow centre lines.
    for (const k of LINES) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const a = LINES[j] + HALF_ROAD, b = LINES[j + 1] - HALF_ROAD;
        this.addBox((a + b) / 2, ROAD_TOP + 0.004, k, b - a, 0.008, 0.15, this.mat.yellow);
        this.addBox(k, ROAD_TOP + 0.004, (a + b) / 2, 0.15, 0.008, b - a, this.mat.yellow);
      }
    }
  }

  buildBlocks() {
    const list = [];

    // Inner blocks: footpath slab + buildings round a hidden courtyard.
    for (let i = 0; i < LINES.length - 1; i++) {
      for (let j = 0; j < LINES.length - 1; j++) {
        const x0 = LINES[i] + HALF_ROAD, x1 = LINES[i + 1] - HALF_ROAD;
        const z0 = LINES[j] + HALF_ROAD, z1 = LINES[j + 1] - HALF_ROAD;
        this.slab(x0, z0, x1, z1);

        const bx0 = x0 + FOOT_W, bx1 = x1 - FOOT_W, bz0 = z0 + FOOT_W, bz1 = z1 - FOOT_W;
        this.splitX(list, bx0, bx1, bz0, bz0 + BLD_DEPTH, 3);
        this.splitX(list, bx0, bx1, bz1 - BLD_DEPTH, bz1, 3);
        this.splitZ(list, bx0, bx0 + BLD_DEPTH, bz0 + BLD_DEPTH + GAP, bz1 - BLD_DEPTH - GAP, 1);
        this.splitZ(list, bx1 - BLD_DEPTH, bx1, bz0 + BLD_DEPTH + GAP, bz1 - BLD_DEPTH - GAP, 1);
      }
    }

    // Outer footpath ring and a ring of buildings round the edge.
    const rMin = LINES[0] - HALF_ROAD, rMax = LINES[LINES.length - 1] + HALF_ROAD;
    const e = rMax + FOOT_W;
    this.slab(-e, -e, e, rMin);
    this.slab(-e, rMax, e, e);
    this.slab(-e, rMin, rMin, rMax);
    this.slab(rMax, rMin, e, rMax);
    this.splitX(list, -e - BLD_DEPTH, e + BLD_DEPTH, -e - BLD_DEPTH, -e, 7);
    this.splitX(list, -e - BLD_DEPTH, e + BLD_DEPTH, e, e + BLD_DEPTH, 7);
    this.splitZ(list, -e - BLD_DEPTH, -e, -e, e, 6);
    this.splitZ(list, e, e + BLD_DEPTH, -e, e, 6);

    // All buildings in ONE draw call (instanced), each with its own colour.
    const mat = new THREE.MeshLambertMaterial({ map: makeWindowTexture() });
    const mesh = new THREE.InstancedMesh(this.box, mat, list.length);
    mesh.castShadow = !this.lowQuality;
    mesh.receiveShadow = !this.lowQuality;
    const m4 = new THREE.Matrix4();
    const color = new THREE.Color();
    list.forEach((b, i) => {
      m4.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0);
      m4.setPosition((b.x0 + b.x1) / 2, FOOT_TOP + b.h / 2, (b.z0 + b.z1) / 2);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, color.setHex(b.color));
    });
    this.scene.add(mesh);
    this.buildings = list;
  }

  slab(x0, z0, x1, z1) {
    this.addBox((x0 + x1) / 2, FOOT_TOP / 2, (z0 + z1) / 2, x1 - x0, FOOT_TOP, z1 - z0, this.mat.foot);
    this.slabs.push({ x0, z0, x1, z1 });
    this.mapRects.push({ x0, z0, x1, z1, kind: 'block' });
  }

  splitX(list, x0, x1, z0, z1, count) {
    const w = (x1 - x0 - GAP * (count - 1)) / count;
    for (let k = 0; k < count; k++) {
      const a = x0 + k * (w + GAP);
      this.addBuilding(list, a, z0, a + w, z1);
    }
  }

  splitZ(list, x0, x1, z0, z1, count) {
    const w = (z1 - z0 - GAP * (count - 1)) / count;
    for (let k = 0; k < count; k++) {
      const a = z0 + k * (w + GAP);
      this.addBuilding(list, x0, a, x1, a + w);
    }
  }

  addBuilding(list, x0, z0, x1, z1) {
    const h = 8 + this.random() * 18;
    const color = BUILDING_COLORS[Math.floor(this.random() * BUILDING_COLORS.length)];
    list.push({ x0, z0, x1, z1, h, color });
    this.mapRects.push({ x0, z0, x1, z1, kind: 'building' });
  }

  // ---------- Collision helpers ----------

  // Height of the ground here: footpaths are 15 cm higher than the road.
  groundAt(x, z) {
    for (const s of this.slabs) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return FOOT_TOP;
    }
    return 0;
  }

  // Push a circle (obj.x, obj.z, radius r) out of all buildings.
  resolveCircle(obj, r) {
    for (const b of this.buildings) {
      const cx = Math.max(b.x0, Math.min(obj.x, b.x1));
      const cz = Math.max(b.z0, Math.min(obj.z, b.z1));
      let dx = obj.x - cx, dz = obj.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        obj.x += (dx / d) * (r - d);
        obj.z += (dz / d) * (r - d);
      } else {
        // Inside: push out through the nearest side.
        const left = obj.x - b.x0, right = b.x1 - obj.x, down = obj.z - b.z0, up = b.z1 - obj.z;
        const m = Math.min(left, right, down, up);
        if (m === left) obj.x = b.x0 - r;
        else if (m === right) obj.x = b.x1 + r;
        else if (m === down) obj.z = b.z0 - r;
        else obj.z = b.z1 + r;
      }
    }
  }

  // Is the straight line from A to B blocked by a building? (Used for police eyes.)
  segmentBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const b of this.buildings) {
      if (segmentHitsRect(ax, az, dx, dz, b)) return true;
    }
    return false;
  }

  // 3D ray against buildings and ground. Returns hit distance or maxDist.
  rayCast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t > 0 && t < best) best = t;
    }
    for (const b of this.buildings) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, FOOT_TOP, b.z0, b.x1, FOOT_TOP + b.h, b.z1);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

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
  return tmin >= 0 ? tmin : 0;   // 0 = ray starts inside
}

// Simple window pattern, tinted per building by the instance colour.
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = Math.random() < 0.15 ? '#c9b98a' : '#5d6670';
      g.fillRect(4 + x * 15, 6 + y * 15.5, 10, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
