// CRAZY MOVES (v9.5) - Vikram does mad, thrilling things:
//   SUTLI BOMB      tap BOMB (PC: N). He throws a Diwali sutli bomb: it bounces, the fuse fizzes, and
//                   2 seconds later DHAMAKA - cops and goons fly, cars blow up (and set off the next ones).
//                   3 bombs at the start; +1 from every ammo box, +2 with AMMO from a shop.
//   GAS CYLINDERS   red LPG cylinders stand outside chai stalls and eateries, and next to the goons in
//                   every fight. Shoot one, bomb it or ram it with a car: a fireball, and every cylinder
//                   near it goes too (a chain).
//   BULLET-TIME DIVE (player.js)  AIM + JUMP: he flies sideways in slow motion and keeps shooting.
//   BAIL OUT        (driving.js)  get out of a fast car: he rolls on the road in slow motion and the car
//                   rolls on by itself and crashes.
import * as THREE from 'three';
import { part, mergeParts, vertexColorMaterial } from './mesh.js';
import { dist } from './util.js';

const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CYL_GEO = mergeParts([
  part(CYL, 0xc4161c, 0, 0.34, 0, 0.17, 0.6, 0.17),     // the red body
  part(CYL, 0x9c1014, 0, 0.665, 0, 0.12, 0.06, 0.12),   // shoulder
  part(CYL, 0x8d8d8d, 0, 0.74, 0, 0.065, 0.1, 0.065),   // valve
  part(CYL, 0x55585c, 0, 0.03, 0, 0.16, 0.06, 0.16),    // foot ring
]);
const MAX = 72;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

// Big blast: count the people it took down -> DHAMAKA! (slow motion and a bonus).
function dhamaka(g, x, y, z, r, size, byPlayer) {
  const k0 = g.stats.kills;
  g.fx.explosion(x, y, z, size);
  g.blast(x, z, r, null, byPlayer);
  const n = g.stats.kills - k0;
  if (n >= 2 && byPlayer) {
    g.hud.showBig(n >= 4 ? 'MEGA DHAMAKA!' : 'DHAMAKA!', '#ff9b2a', 1.6);
    if (g.rewards) g.rewards.event(`DHAMAKA x${n}`, 150 * n, 10 * n);
    g.slowmo(1.0, 0.3);
  }
}

export class Cylinders {
  constructor(g) {
    this.g = g; this.list = [];
    this.mesh = new THREE.InstancedMesh(CYL_GEO, vertexColorMaterial, MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    g.scene.add(this.mesh);
  }
  // Next to the door of one shop in six (on the footpath, beside the doorway).
  placeCity() {
    let k = 0;
    for (const D of this.g.world.doors) {
      if (D.kind === 'tower' || k++ % 6) continue;
      const tx = -D.nz, tz = D.nx, off = D.w / 2 + 0.7;
      this.add(D.x + D.nx * 0.55 + tx * off, D.z + D.nz * 0.55 + tz * off, false);
      if (this.list.length >= 44) break;
    }
  }
  add(x, z, temp = true) {
    if (this.list.length >= MAX) return null;
    const c = { x, z, gy: this.g.world.groundAt(x, z), radius: 0.42, dead: false, temp, hp: 30, fuse: -1, byPlayer: false, respawnT: 0, yaw: Math.random() * 6.28, idx: this.list.length };
    c.y = c.gy + 0.4;
    c.takeDamage = (d, byPlayer) => this.hit(c, d, byPlayer);
    this.list.push(c); this.mesh.count = this.list.length; this.sync(c);
    return c;
  }
  // A few for a fight around (x, z): on free ground 3-9 m away, not on the road.
  addNear(x, z, n) {
    const nav = this.g.nav;
    for (let k = 0, put = 0; k < 40 && put < n; k++) {
      const a = Math.random() * 6.283, r = 3 + Math.random() * 6, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!nav.spawnOk(nav.idx(px, pz))) continue;
      if (this.list.some((c) => !c.dead && dist(c.x, c.z, px, pz) < 2.5)) continue;
      if (this.add(px, pz, true)) put++;
    }
  }
  hit(c, d, byPlayer) {
    if (c.dead || c.fuse >= 0) return;
    c.hp -= d; c.byPlayer = c.byPlayer || !!byPlayer;
    if (c.hp <= 0) { c.fuse = 0.15; this.g.audio.play('hiss', { vol: 0.35, vary: 0.1 }); }   // a hiss, then BOOM
  }
  // An explosion nearby sets them off (one after another).
  blast(x, z, r) {
    for (const c of this.list) if (!c.dead && c.fuse < 0 && dist(c.x, c.z, x, z) < r + 1.2) { c.fuse = 0.18 + Math.random() * 0.3; c.byPlayer = true; }
  }
  update(dt) {
    const g = this.g, P = g.player, car = P.inCar ? g.driving.car : null;
    for (const c of this.list) {
      if (c.dead) {
        if (!c.temp && (c.respawnT -= dt) <= 0 && dist(c.x, c.z, P.x, P.z) > 70) { c.dead = false; c.hp = 30; c.fuse = -1; c.byPlayer = false; this.sync(c); }
        continue;
      }
      // Rammed by his car.
      if (car && Math.abs(g.driving.speed) > 4 && dist(c.x, c.z, car.x, car.z) < car.halfL * 0.8) this.hit(c, 999, true);
      if (c.fuse >= 0 && (c.fuse -= dt) < 0) this.explode(c);
    }
  }
  explode(c) {
    c.dead = true; c.respawnT = 150; this.sync(c);
    dhamaka(this.g, c.x, c.gy + 0.7, c.z, 7.5, 1.25, c.byPlayer);
  }
  sync(c) {
    if (c.dead) _s.set(0, 0, 0); else _s.set(1, 1, 1);
    _m.compose(_p.set(c.x, c.gy, c.z), _q.setFromAxisAngle(_up, c.yaw), _s);
    this.mesh.setMatrixAt(c.idx, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // A new mission / free roam: the fight ones go, the city ones are back.
  reset() {
    this.list = this.list.filter((c) => !c.temp);
    this.list.forEach((c, i) => { c.idx = i; c.dead = false; c.hp = 30; c.fuse = -1; c.byPlayer = false; this.sync(c); });
    this.mesh.count = this.list.length;
  }
}

// ---------- Sutli bombs ----------
const BOMB_GEO = mergeParts([
  part(new THREE.SphereGeometry(1, 10, 8), 0x8a6a3a, 0, 0, 0, 0.11, 0.11, 0.11),       // jute-wrapped ball
  part(new THREE.CylinderGeometry(1, 1, 1, 6), 0xe8e0c8, 0, 0.13, 0, 0.012, 0.09, 0.012),   // fuse
]);
const SPARK_GEO = new THREE.SphereGeometry(0.04, 6, 4);
const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.4, 0.8), toneMapped: false });

export class Bombs {
  constructor(g) { this.g = g; this.live = []; }
  throw() {
    const g = this.g, P = g.player;
    if (P.inCar || P.dead || !P.controlsEnabled || (P.bombs || 0) <= 0 || (P.throwCd || 0) > 0) return false;
    P.bombs--; P.throwCd = 0.6;
    g.camera.getWorldDirection(_d);
    const h = Math.hypot(_d.x, _d.z) || 1, fx = _d.x / h, fz = _d.z / h;
    P.throwT = 0.3; P.throwDir = { x: fx, z: fz };
    const b = { x: P.x + fx * 0.5, y: P.y + 1.6, z: P.z + fz * 0.5, vx: fx * 12, vz: fz * 12, vy: Math.max(3.2, _d.y * 12 + 4.6), t: 2.1 };
    b.mesh = new THREE.Mesh(BOMB_GEO, vertexColorMaterial);
    b.spark = new THREE.Mesh(SPARK_GEO, sparkMat); b.spark.position.y = 0.23; b.mesh.add(b.spark);
    b.mesh.position.set(b.x, b.y, b.z);
    g.scene.add(b.mesh);
    this.live.push(b);
    g.music.whoosh(); g.audio.play('fuse', { vol: 0.32, vary: 0.05 });   // the fuse fizzes for 2 seconds
    g.hud.setBombs(P.bombs);
    if (!g.bombTipDone) { g.bombTipDone = true; g.hud.toast('SUTLI BOMB! It blows up in 2 seconds - get clear!'); }
    return true;
  }
  update(dt) {
    const g = this.g, W = g.world;
    for (const b of [...this.live]) {
      b.t -= dt;
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      if (W.segmentBlocked(b.x, b.z, nx, nz)) { b.vx *= -0.35; b.vz *= -0.35; } else { b.x = nx; b.z = nz; }
      b.vy -= 18 * dt; b.y += b.vy * dt;
      const gy = W.groundAt(b.x, b.z) + 0.11;
      if (b.y < gy) { b.y = gy; b.vy = b.vy < -1 ? -b.vy * 0.32 : 0; b.vx *= 0.6; b.vz *= 0.6; }
      b.mesh.position.set(b.x, b.y, b.z);
      if (Math.hypot(b.vx, b.vz) > 0.5) { b.mesh.rotation.x += dt * 9; b.mesh.rotation.z += dt * 4; }
      b.spark.scale.setScalar(0.5 + Math.random() * 1.4);
      if (b.t <= 0) this.explode(b);
    }
  }
  explode(b) {
    const g = this.g;
    g.scene.remove(b.mesh);
    this.live = this.live.filter((x) => x !== b);
    dhamaka(g, b.x, b.y + 0.4, b.z, 8.5, 1.45, true);
  }
  clear() { for (const b of this.live) this.g.scene.remove(b.mesh); this.live = []; }
}
