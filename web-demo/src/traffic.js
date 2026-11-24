// Traffic: lane network (LEFT-hand traffic, like India), signals, AI cars and pedestrians.
import * as THREE from 'three';
import { LINES, HALF_ROAD, LANE_OFF, STOP_BACK, FOOT_W, FOOT_TOP, ROAD_TOP, ROAD_W } from './world.js';
import { clamp, lerp, moveTowards, rotateTowards, yawOf, dist, DEG, pick } from './util.js';
import { makeVehicle, VEHICLE_SIZE, TRAFFIC_TYPES, CAR_COLORS } from './vehicles.js';
import { CharacterRig } from './characters.js';

const LIGHT_COLORS = [0x22ff44, 0xffcc11, 0xff2222];

// ---------------------------------------------------------------------------
// Traffic light: north-south (axis 0) and east-west (axis 1) take turns.
// ---------------------------------------------------------------------------
class Signal {
  constructor(offset) {
    this.offset = offset;
    this.green = 10; this.yellow = 2.5; this.allRed = 1.5;
    this.mats = [new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false })];
    this.shown = [-1, -1];
  }
  light(axis, t) {
    const half = this.green + this.yellow + this.allRed;
    const tt = (t + this.offset + (axis === 1 ? half : 0)) % (half * 2);
    if (tt < this.green) return 0;
    if (tt < this.green + this.yellow) return 1;
    return 2;
  }
  update(t) {
    for (let a = 0; a < 2; a++) {
      const l = this.light(a, t);
      if (l === this.shown[a]) continue;
      this.shown[a] = l;
      this.mats[a].color.setHex(LIGHT_COLORS[l]).multiplyScalar(2.5);   // brighter than white = glows
    }
  }
}

// ---------------------------------------------------------------------------
// Lane network
// ---------------------------------------------------------------------------
export class Network {
  constructor() { this.nodes = []; this.signals = []; }

  add(x, z, spawnable) {
    this.nodes.push({ x, z, next: [], signal: -1, axis: 0, spawnable });
    return this.nodes.length - 1;
  }
  link(a, b) { if (!this.nodes[a].next.includes(b)) this.nodes[a].next.push(b); }

  mustStop(i, t) {
    const n = this.nodes[i];
    if (!n || n.signal < 0) return false;
    return this.signals[n.signal].light(n.axis, t) !== 0;
  }

  // Closest node; with a heading, only lanes going the same way and ahead.
  nearest(x, z, hx, hz) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (hx !== undefined) {
        if (!n.next.length) continue;
        const m = this.nodes[n.next[0]];
        const lx = m.x - n.x, lz = m.z - n.z, ll = Math.hypot(lx, lz) || 1;
        if ((lx * hx + lz * hz) / ll < 0.3) continue;
        if ((n.x - x) * hx + (n.z - z) * hz < 0) continue;
      }
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 && hx !== undefined) return this.nearest(x, z);
    return best;
  }

  // A* shortest drive. Returns the list of nodes from start to goal, or null.
  findPath(start, goal) {
    const n = this.nodes.length;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const open = new Uint8Array(n), closed = new Uint8Array(n);
    const G = this.nodes[goal];
    g[start] = 0; open[start] = 1;
    let openCount = 1;
    while (openCount > 0) {
      let cur = -1, best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!open[i]) continue;
        const f = g[i] + Math.hypot(this.nodes[i].x - G.x, this.nodes[i].z - G.z);
        if (f < best) { best = f; cur = i; }
      }
      if (cur === goal) {
        const path = [];
        for (let c = goal; c !== -1; c = came[c]) path.push(c);
        return path.reverse();
      }
      open[cur] = 0; closed[cur] = 1; openCount--;
      const C = this.nodes[cur];
      for (const nb of C.next) {
        if (closed[nb]) continue;
        const cost = g[cur] + Math.hypot(this.nodes[nb].x - C.x, this.nodes[nb].z - C.z);
        if (cost < g[nb]) {
          g[nb] = cost; came[nb] = cur;
          if (!open[nb]) { open[nb] = 1; openCount++; }
        }
      }
    }
    return null;
  }
}

export function buildNetwork(world, scene) {
  const net = new Network();
  const n = LINES.length;
  const incoming = [], outgoing = [];
  for (let i = 0; i < n * n; i++) { incoming.push([]); outgoing.push([]); }
  const idx = (i, j) => i * n + j;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 1) One lane per direction on every road piece.
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (const [di, dj] of D) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
    const ax = LINES[i], az = LINES[j], bx = LINES[ni], bz = LINES[nj];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const lx = dz, lz = -dx;   // driver's LEFT (we drive on the left)
    const sx = ax + dx * STOP_BACK + lx * LANE_OFF, sz = az + dz * STOP_BACK + lz * LANE_OFF;
    const ex = bx - dx * STOP_BACK + lx * LANE_OFF, ez = bz - dz * STOP_BACK + lz * LANE_OFF;
    const s = net.add(sx, sz, false);
    const m1 = net.add(lerp(sx, ex, 1 / 3), lerp(sz, ez, 1 / 3), true);
    const m2 = net.add(lerp(sx, ex, 2 / 3), lerp(sz, ez, 2 / 3), true);
    const e = net.add(ex, ez, false);
    net.link(s, m1); net.link(m1, m2); net.link(m2, e);
    outgoing[idx(i, j)].push({ node: s, dx, dz });
    incoming[idx(ni, nj)].push({ node: e, dx, dz });
  }

  // 2) Turns in each crossing + traffic lights where 3 or more roads meet.
  const lampGeo = new THREE.BoxGeometry(0.36, 0.36, 0.5);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const ins = incoming[idx(i, j)], outs = outgoing[idx(i, j)];
    let signal = null, sIndex = -1;
    if (ins.length >= 3) {
      signal = new Signal((i * 3 + j) * 3.7);
      net.signals.push(signal);
      sIndex = net.signals.length - 1;
    }
    for (const a of ins) {
      for (const b of outs) {
        const dot = a.dx * b.dx + a.dz * b.dz;
        if (dot < -0.9) continue;                         // no U-turns
        if (dot > 0.9) { net.link(a.node, b.node); continue; }   // straight on
        const E = net.nodes[a.node], S = net.nodes[b.node];
        const along = (S.x - E.x) * a.dx + (S.z - E.z) * a.dz;
        const cx = E.x + a.dx * along, cz = E.z + a.dz * along;
        const mid = net.add(0.25 * E.x + 0.5 * cx + 0.25 * S.x, 0.25 * E.z + 0.5 * cz + 0.25 * S.z, false);
        net.link(a.node, mid); net.link(mid, b.node);
      }
      if (signal) {
        const axis = Math.abs(a.dx) > 0.5 ? 1 : 0;
        const node = net.nodes[a.node];
        node.signal = sIndex; node.axis = axis;
        // Pole on the left footpath + light, and a white stop line.
        const lx = a.dz, lz = -a.dx;
        const px = node.x + lx * (HALF_ROAD - LANE_OFF + 0.7) - a.dx * 0.5;
        const pz = node.z + lz * (HALF_ROAD - LANE_OFF + 0.7) - a.dz * 0.5;
        world.addBox(px, FOOT_TOP + 1.9, pz, 0.14, 3.8, 0.14, 0x2b2d31);
        world.addBox(px, FOOT_TOP + 4.0, pz, 0.5, 1.2, 0.5, 0x1b1c1f);   // signal housing
        const lamp = new THREE.Mesh(lampGeo, signal.mats[axis]);
        lamp.position.set(px, FOOT_TOP + 4.0, pz);
        scene.add(lamp);
        world.addBox(node.x + a.dx * 0.3, ROAD_TOP + 0.004, node.z + a.dz * 0.3,
          Math.abs(a.dx) > 0.5 ? 0.4 : ROAD_W * 0.45, 0.01, Math.abs(a.dx) > 0.5 ? ROAD_W * 0.45 : 0.4, 0xf2f2f2);
      }
    }
  }
  return net;
}

// ---------------------------------------------------------------------------
// AI car: follows lanes, stops at red lights, brakes for anything ahead,
// pulls over for police chases. Police cars reuse it with extra orders.
// ---------------------------------------------------------------------------
export class Car {
  constructor(game, type, colorHex) {
    this.game = game;
    this.isCar = true;
    this.type = type;
    const size = VEHICLE_SIZE[type];
    this.halfL = size.l / 2;
    this.halfW = size.w / 2;
    this.rLong = this.halfL;
    this.rLat = this.halfW;
    this.vehicle = makeVehicle(type, colorHex, game.shadows);
    this.mesh = this.vehicle.group;
    game.scene.add(this.mesh);

    // Autos are slower; everyone varies a little.
    this.cruise = (type === 'auto' ? 8.5 : 11) * (0.9 + Math.random() * 0.2);
    this.accel = type === 'auto' ? 2.6 : 3.5; this.brake = 8; this.corner = 6;
    this.obeySignals = true; this.pursuing = false; this.hold = false;
    this.x = 0; this.z = 0; this.yaw = 0; this.speed = 0;
    this.prev = -1; this.target = -1; this.upcoming = [];
    this.segX = 0; this.segZ = 0;
    this.direct = null; this.directStop = 0;
    this.lateral = 0; this.targetLateral = 0;
    this.overtake = 0; this.ignoreCars = 0; this.blocked = 0;
    this.sensorT = Math.random() * 0.1; this.yieldT = 0; this.yielding = false;
    this.obstacle = null; this.obstacleGap = Infinity;
    this.health = 100; this.wrecked = false;
  }

  get net() { return this.game.network; }

  init(node) {
    const N = this.net.nodes;
    this.prev = node;
    this.target = this.pickNext(node);
    this.x = N[node].x; this.z = N[node].z;
    this.segX = this.x; this.segZ = this.z;
    this.yaw = yawOf(N[this.target].x - this.x, N[this.target].z - this.z);
    this.speed = this.cruise * 0.5;
    this.syncMesh();
  }

  pickNext(node) {
    const opts = this.net.nodes[node].next;
    return opts.length ? pick(opts) : -1;
  }

  peekNext() {
    if (!this.upcoming.length && this.target >= 0) {
      const n = this.pickNext(this.target);
      if (n >= 0) this.upcoming.push(n);
    }
    return this.upcoming.length ? this.upcoming[0] : -1;
  }

  advance() {
    this.prev = this.target;
    this.segX = this.net.nodes[this.prev].x; this.segZ = this.net.nodes[this.prev].z;
    this.target = this.upcoming.length ? this.upcoming.shift() : this.pickNext(this.prev);
  }

  routeTo(goal) {
    if (this.target < 0 || goal < 0) return;
    const path = this.net.findPath(this.target, goal);
    if (path) this.upcoming = path.slice(1);
  }

  setDirect(x, z, stop) { this.direct = { x, z }; this.directStop = stop; }

  clearDirect() {
    if (!this.direct) return;
    this.direct = null;
    this.rejoin();
  }

  rejoin() {
    this.upcoming = [];
    this.prev = -1;
    this.segX = this.x; this.segZ = this.z;
    this.target = this.net.nearest(this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw));
  }

  stopSpeed(d) { return d <= 0 ? 0 : Math.sqrt(2 * this.brake * 0.7 * d); }

  // Bullets and crashes damage cars. A wrecked car smokes and stops.
  takeDamage(amount) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.wrecked = true; this.hold = true; this.pursuing = false;
      if (this.isPolice) this.state = 'patrol';
    }
  }

  update(dt) {
    if (this.health < 45) {
      this.smokeT = (this.smokeT || 0) - dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.wrecked ? 0.06 : 0.15;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        this.game.fx.smoke(this.x + fx * (this.halfL - 0.6), 1.2, this.z + fz * (this.halfL - 0.6), this.wrecked);
      }
    }
    if (this.playerControlled || this.parked) return;   // the player is driving / left it parked (see driving.js)
    if (this.wrecked) { this.speed = 0; return; }
    const N = this.net.nodes;
    let desired = this.cruise;
    let aimX, aimZ;

    if (this.direct) {
      aimX = this.direct.x; aimZ = this.direct.z;
      desired = Math.min(desired, this.stopSpeed(dist(this.x, this.z, aimX, aimZ) - this.directStop));
    } else {
      if (this.target < 0) this.rejoin();
      if (this.target < 0) return;
      let seg = this.segDir();
      let tp = this.targetPoint(seg);
      let d = dist(this.x, this.z, tp.x, tp.z);
      let mustStop = this.obeySignals && this.net.mustStop(this.target, this.game.time);
      const passed = (this.x - tp.x) * seg.x + (this.z - tp.z) * seg.z > 0;
      if (passed || (d < 2.5 && !mustStop)) {
        this.advance();
        if (this.target < 0) return;
        seg = this.segDir(); tp = this.targetPoint(seg);
        d = dist(this.x, this.z, tp.x, tp.z);
        mustStop = this.obeySignals && this.net.mustStop(this.target, this.game.time);
      }
      aimX = tp.x; aimZ = tp.z;

      // Slow down before a turn.
      const nx = this.peekNext();
      if (nx >= 0) {
        const T = N[this.target], X = N[nx];
        const ndx = X.x - T.x, ndz = X.z - T.z, nl = Math.hypot(ndx, ndz) || 1;
        const cos = (seg.x * ndx + seg.z * ndz) / nl;
        if (cos < Math.cos(25 * DEG)) {
          desired = Math.min(desired, lerp(this.corner, this.cruise, clamp((d - 6) / 19, 0, 1)));
        }
      }
      // Red / yellow light: stop at the line if we still can.
      if (mustStop && (this.speed * this.speed) / (2 * this.brake) < d + 1) {
        desired = Math.min(desired, this.stopSpeed(d - 0.5));
      }
    }

    // Look ahead for anything in the way.
    this.sensorT -= dt;
    if (this.sensorT <= 0) { this.sensorT = 0.1; this.sense(); }
    if (this.obstacle) desired = Math.min(desired, this.stopSpeed(this.obstacleGap - 2));

    const blockedByCar = this.obstacle && this.obstacle.isCar;
    this.blocked = this.obstacle && this.speed < 0.5 ? this.blocked + dt : 0;
    if (blockedByCar && this.blocked > 6) { this.ignoreCars = 1.5; this.blocked = 0; }   // break rare deadlocks
    // Someone standing in front of the car: honk (Indian traffic!).
    if (this.obstacle === this.game.player && this.blocked > 1) {
      const cam = this.game.camera.position;
      this.game.audio.horn(1 - dist(this.x, this.z, cam.x, cam.z) / 50);
    }
    if (this.ignoreCars > 0) this.ignoreCars -= dt;

    if (this.pursuing) {
      // Police: use the other lane to get past slow traffic.
      if (blockedByCar && this.speed < 3) this.overtake = 3;
      this.overtake -= dt;
      this.targetLateral = this.overtake > 0 ? -3.8 : 0;
    } else {
      // Traffic: pull over to the left for a police chase coming from behind.
      this.yieldT -= dt;
      if (this.yieldT <= 0) { this.yieldT = 0.3; this.yielding = this.pursuerBehind(); }
      this.targetLateral = this.yielding ? 1.6 : 0;
      if (this.yielding) desired = Math.min(desired, 1.5);
    }
    this.lateral = moveTowards(this.lateral, this.targetLateral, 2.5 * dt);
    if (this.hold) desired = 0;

    let rate = desired > this.speed ? this.accel : this.brake;
    if (this.obstacle && this.obstacleGap < 3) rate = this.brake * 2;
    this.speed = moveTowards(this.speed, Math.max(0, desired), rate * dt);

    // Steer: a faster car turns faster; a stopped car cannot spin on the spot.
    const tx = aimX - this.x, tz = aimZ - this.z;
    if (tx * tx + tz * tz > 0.04 && this.speed > 0.1) {
      const turnRate = Math.max(25, this.speed * 14) * DEG;
      this.yaw = rotateTowards(this.yaw, yawOf(tx, tz), turnRate * dt);
    }
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    this.syncMesh();
  }

  sense() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const range = 3 + this.speed * 1.1;
    let best = Infinity, hit = null;
    for (const o of this.game.agents) {
      if (o === this || o.inactive) continue;
      if (this.ignoreCars > 0 && o.isCar) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const along = dx * fx + dz * fz;
      if (along <= 0) continue;
      const lat = Math.abs(-dx * fz + dz * fx);
      if (lat > this.halfW * 0.85 + o.rLat) continue;
      const gap = along - this.halfL - o.rLong;
      if (gap < range && gap < best) { best = gap; hit = o; }
    }
    this.obstacle = hit;
    this.obstacleGap = best;
  }

  pursuerBehind() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const p of this.game.policeCars) {
      if (!p.pursuing) continue;
      const dx = p.x - this.x, dz = p.z - this.z;
      if (dx * dx + dz * dz < 625 && dx * fx + dz * fz < 0) return true;
    }
    return false;
  }

  segDir() {
    const T = this.net.nodes[this.target];
    let dx = T.x - this.segX, dz = T.z - this.segZ;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    return { x: dx / l, z: dz / l };
  }

  // Target node, moved sideways when pulling over (+, left) or overtaking (-, right).
  targetPoint(seg) {
    const T = this.net.nodes[this.target];
    return { x: T.x + seg.z * this.lateral, z: T.z - seg.x * this.lateral };
  }

  syncMesh() {
    this.mesh.position.set(this.x, ROAD_TOP, this.z);
    this.mesh.rotation.y = this.yaw;
  }
}

export function randomTrafficType() { return pick(TRAFFIC_TYPES); }
export function randomCarColor() { return pick(CAR_COLORS); }

// ---------------------------------------------------------------------------
// Pedestrians: walk round the blocks, keep left, run from police chases.
// ---------------------------------------------------------------------------
export const CLOTHES = [0xe8e2d0, 0xc0392b, 0x2e5aa8, 0xe6a817, 0x4f8f4f, 0x8e3a85, 0x4a4a50, 0xe07a9a, 0xd35400, 0x16a085, 0xf5f0e6];
export const TROUSERS = [0x2b2f3a, 0x3d3227, 0x1f2a44, 0x4b4b4b, 0x6b5a42, 0xd8d0c0];

// A random city person: realistic man (any clothes) or woman.
export function randomPersonRig(castShadow) {
  if (Math.random() < 0.62) {
    return new CharacterRig('man', {
      top: pick(CLOTHES), bottom: pick(TROUSERS), hideBeard: Math.random() < 0.5, hideHat: Math.random() < 0.7, castShadow,
    });
  }
  return new CharacterRig('woman', { castShadow, tint: pick([0xffffff, 0xf2e6da, 0xe8f0ff, 0xfff0f0]) });
}

export function buildLoops() {
  const loops = [];
  const mid = FOOT_W / 2;
  for (let i = 0; i < LINES.length - 1; i++) for (let j = 0; j < LINES.length - 1; j++) {
    const x0 = LINES[i] + HALF_ROAD + mid, x1 = LINES[i + 1] - HALF_ROAD - mid;
    const z0 = LINES[j] + HALF_ROAD + mid, z1 = LINES[j + 1] - HALF_ROAD - mid;
    loops.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  }
  const r = LINES[LINES.length - 1] + HALF_ROAD + mid;
  loops.push([[-r, -r], [r, -r], [r, r], [-r, r]]);
  return loops;
}

export class Pedestrian {
  constructor(game, loop, startPos, target, dir) {
    this.game = game;
    this.loop = loop;
    this.target = target;
    this.dir = dir;
    this.x = startPos[0]; this.z = startPos[1];
    this.yaw = 0;
    this.rLong = 0.3; this.rLat = 0.3; this.radius = 0.3;
    this.walk = 1.1 + Math.random() * 0.5;
    this.side = 0.5 + Math.random() * 0.4;   // keep left
    this.panic = 0; this.wait = 0; this.senseT = Math.random() * 0.2; this.blocked = false;
    this.rig = randomPersonRig(game.shadows);
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.speed = 0;
    this.health = 40; this.dead = false; this.groundY = FOOT_TOP;
  }

  // Run away from danger (gunshots, police chase).
  panicFrom(x, z) {
    if (this.dead) return;
    if (this.panic <= 0) this.fleeFrom(x, z);
    this.panic = 6;
  }

  takeDamage(amount, byPlayer, fromX = this.x, fromZ = this.z) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true; this.deadT = 0;
      this.rig.die(this.x - fromX, this.z - fromZ);
      if (byPlayer) this.game.dispatch.crime('kill_ped', this.x, this.z);
      this.game.alarm(this.x, this.z, 30);
    }
  }

  point(i) { const n = this.loop.length; return this.loop[((i % n) + n) % n]; }

  update(dt) {
    const g = this.game, P = g.player;
    if (this.dead) {
      this.deadT += dt;
      this.rig.update(dt, dist(this.x, this.z, g.camera.position.x, g.camera.position.z));
      if (this.deadT > 25) this.respawnElsewhere();
      return;
    }

    if (g.dispatch.active && dist(this.x, this.z, P.x, P.z) < 14) this.panicFrom(P.x, P.z);
    this.panic -= dt;
    const panicking = this.panic > 0;

    const from = this.point(this.target - this.dir), to = this.point(this.target);
    let sx = to[0] - from[0], sz = to[1] - from[1];
    const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const tx = to[0] + sz * this.side, tz = to[1] - sx * this.side;   // left of walking direction
    if (dist(this.x, this.z, tx, tz) < 0.6) { this.target += this.dir; return; }

    // Someone in the way? Wait, then try the other side.
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.2;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.blocked = false;
      for (const o of g.walkers) {
        if (o === this || o.inactive) continue;
        const dx = o.x - this.x, dz = o.z - this.z;
        const along = dx * fx + dz * fz;
        if (along > 0 && along < 1.1 && Math.abs(-dx * fz + dz * fx) < 0.6) { this.blocked = true; break; }
      }
    }
    let speed = panicking ? 4.2 : this.walk;
    if (this.blocked && !panicking) {
      speed = 0; this.wait += dt;
      if (this.wait > 1.5) { this.side = this.side > 0 ? -0.4 : 0.8; this.wait = 0; }
    } else this.wait = 0;

    this.yaw = rotateTowards(this.yaw, yawOf(tx - this.x, tz - this.z), 6.3 * dt);
    this.speed = moveTowards(this.speed, speed, 6 * dt);
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    this.mesh.position.set(this.x, FOOT_TOP, this.z);
    this.mesh.rotation.y = this.yaw;
    this.rig.setMotion(this.speed);
    this.rig.update(dt, dist(this.x, this.z, g.camera.position.x, g.camera.position.z));
  }

  // Quietly come back as a new person on the far side of the loop (keeps the streets busy).
  respawnElsewhere() {
    const g = this.game, cam = g.camera.position;
    const i = Math.floor(Math.random() * this.loop.length);
    const p = this.point(i);
    if (dist(p[0], p[1], cam.x, cam.z) < 40) { this.deadT = 15; return; }
    g.scene.remove(this.mesh);
    this.rig = randomPersonRig(g.shadows);
    this.mesh = this.rig.root;
    g.scene.add(this.mesh);
    this.x = p[0]; this.z = p[1]; this.target = i + this.dir;
    this.dead = false; this.health = 40; this.panic = 0;
  }

  fleeFrom(px, pz) {
    const ahead = this.point(this.target), behind = this.point(this.target - this.dir);
    if (dist(behind[0], behind[1], px, pz) > dist(ahead[0], ahead[1], px, pz)) {
      const old = this.dir;
      this.dir = -this.dir;
      this.target -= old;   // turn round: the point we came from is the new target
    }
  }
}
