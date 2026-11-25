// Cars with a job in a mission:
//   race   - street racer: follows the checkpoints flat out, brakes for corners, overtakes, rubber-bands
//   flee   - a target running away from you through the city (wreck it!)
//   tail   - a car you must follow: drives normally (stops at red lights) to its destination
//   deploy - gang car: races to a spot, its crew jumps out and attacks
import { Car } from './traffic.js';
import { dist, clamp, yawOf, angleDiff, moveTowards, lerp } from './util.js';

export class MissionCar extends Car {
  constructor(game, type, color, opts = {}) {
    super(game, type, color);
    this.missionCar = true;
    this.mode = opts.mode || 'parked';
    this.health = opts.health ?? 100;
    this.hostile = !!opts.hostile;
    this.fastBurn = !!opts.fastBurn;
    this.name = opts.name || '';
    if (opts.speed) this.cruise = opts.speed;
    if (this.mode === 'flee') { this.cruise = opts.speed || 23; this.obeySignals = false; this.pursuing = true; this.accel = 6; this.brake = 10; this.thinkT = 0; }
    if (this.mode === 'deploy') { this.cruise = opts.speed || 17; this.obeySignals = false; this.pursuing = true; this.accel = 6; }
    if (this.mode === 'tail') { this.cruise = opts.speed || 11; this.accel = 2.8; }
    if (this.mode === 'race') {
      this.cps = opts.cps; this.cpi = 0; this.top = opts.top || 33; this.skill = opts.skill || 1;
      this.lane = opts.lane || 0; this.laneT = 0; this.finished = false;
    }
    this.dest = opts.dest || null; this.onArrive = opts.onArrive || null; this.arrived = false;
  }

  // Put it on the road nearest (x, z), facing (hx, hz).
  placeAt(x, z, hx, hz) {
    const n = this.net.nearest(x, z, hx, hz);
    this.init(n);
    if (this.dest) this.routeTo(this.net.nearest(this.dest.x, this.dest.z));
    return this;
  }

  get progress() { return this.cpi * 100000 - (this.cps ? dist(this.x, this.z, this.cps[Math.min(this.cpi, this.cps.length - 1)].x, this.cps[Math.min(this.cpi, this.cps.length - 1)].z) : 0); }

  update(dt) {
    if (this.playerControlled || this.parked || this.wrecked) { super.update(dt); return; }
    if (this.mode === 'race') { this.raceUpdate(dt); return; }
    const g = this.game;
    if (this.mode === 'flee') {
      // Keep choosing a far-away goal, away from the player.
      this.thinkT -= dt;
      if (this.thinkT <= 0 && this.upcoming.length < 4) {
        this.thinkT = 1;
        const P = g.player, N = this.net.nodes;
        let best = -1, bestScore = -Infinity;
        for (let k = 0; k < 40; k++) {
          const i = Math.floor(Math.random() * N.length);
          if (!N[i].spawnable) continue;
          const score = dist(N[i].x, N[i].z, P.x, P.z) - 0.5 * dist(N[i].x, N[i].z, this.x, this.z);
          if (dist(N[i].x, N[i].z, this.x, this.z) > 90 && score > bestScore) { bestScore = score; best = i; }
        }
        if (best >= 0) this.routeTo(best);
      }
    }
    if ((this.mode === 'tail' || this.mode === 'deploy') && this.dest && !this.arrived) {
      if (dist(this.x, this.z, this.dest.x, this.dest.z) < (this.mode === 'deploy' ? 14 : 10)) {
        this.arrived = true; this.hold = true;
        if (this.mode === 'deploy') this.parkSoon = 1.2;
        if (this.onArrive) this.onArrive(this);
      } else if (!this.upcoming.length) this.routeTo(this.net.nearest(this.dest.x, this.dest.z));
    }
    if (this.parkSoon !== undefined) { this.parkSoon -= dt; if (this.parkSoon <= 0 && this.speed < 0.5) { this.parked = true; this.parkSoon = undefined; } }
    super.update(dt);
  }

  // Street racer: aim at the next checkpoint (+ its lane), full speed on straights, brake for corners,
  // swap lanes to get past slower cars, and stay close to the player so races stay exciting.
  raceUpdate(dt) {
    const g = this.game, cps = this.cps;
    if (this.finished || this.cpi >= cps.length) {
      this.finished = true;
      this.speed = moveTowards(this.speed, 0, 6 * dt);
      this.x += Math.sin(this.yaw) * this.speed * dt; this.z += Math.cos(this.yaw) * this.speed * dt;
      this.syncMesh(); return;
    }
    if (!g.raceGo) { this.syncMesh(); return; }
    const cp = cps[this.cpi], prev = cps[this.cpi - 1] || { x: this.x, z: this.z }, next = cps[this.cpi + 1];
    let sx = cp.x - prev.x, sz = cp.z - prev.z; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ax = cp.x - sz * this.lane, az = cp.z + sx * this.lane;
    const d = dist(this.x, this.z, cp.x, cp.z);
    if (d < 11) { this.cpi++; return; }
    // Corner ahead: how sharp is the turn at this checkpoint?
    let vCorner = this.top;
    if (next) {
      let nx = next.x - cp.x, nz = next.z - cp.z; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const turn = Math.acos(clamp(sx * nx + sz * nz, -1, 1));
      vCorner = lerp(this.top, 12, clamp(turn / (Math.PI / 2), 0, 1));
    }
    // Rubber band: a little slower when far ahead of the player, a little faster when far behind.
    const P = g.mission && g.mission.vars.playerProgress !== undefined ? g.mission.vars.playerProgress : this.progress;
    const gap = (this.progress - P) / 1;
    const band = gap > 60 ? 0.86 : gap < -60 ? 1.1 : 1;
    let want = this.top * this.skill * band;
    const brakeDist = (this.speed * this.speed - vCorner * vCorner) / (2 * 13) + 6;
    if (d < brakeDist) want = Math.min(want, vCorner);
    // Something in front: change lane, slow down if both are blocked.
    this.sensorT -= dt;
    if (this.sensorT <= 0) { this.sensorT = 0.12; this.sense(); }
    this.laneT -= dt;
    if (this.obstacle && this.obstacleGap < 14 && this.laneT <= 0) { this.lane = this.lane > 0 ? -2.4 : 2.4; this.laneT = 1.5; }
    if (this.obstacle && this.obstacleGap < 4) want = Math.min(want, this.obstacle.speed || 0);
    this.speed = moveTowards(this.speed, want, (want > this.speed ? 9 : 14) * dt);
    const maxRate = Math.min(2.4, 16 / Math.max(this.speed, 4));
    this.yaw += clamp(angleDiff(this.yaw, yawOf(ax - this.x, az - this.z)), -maxRate * dt, maxRate * dt);
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    // Do not drive through buildings.
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const k of [0.55, -0.55]) {
      const c = { x: this.x + fx * this.halfL * k, z: this.z + fz * this.halfL * k };
      const bx = c.x, bz = c.z;
      g.world.resolveCircle(c, this.halfW);
      this.x += c.x - bx; this.z += c.z - bz;
    }
    this.syncMesh();
  }
}

