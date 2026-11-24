// Navapur Metro Police (fictional): dispatch, patrol cars and officers on foot.
// Same rules as the Unity Step 2 code.
import * as THREE from 'three';
import { Car } from './traffic.js';
import { CharacterRig } from './characters.js';
import { dist, rotateTowards, yawOf, pushOutOfBox, moveTowards } from './util.js';

// Can a police unit at (ex, ez) facing (fx, fz) see the player?
export function canSee(world, ex, ez, fx, fz, target, range, fovDeg, closeRange = 8) {
  const dx = target.x - ex, dz = target.z - ez;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d > closeRange) {
    const cos = (dx * fx + dz * fz) / (d || 1);
    if (cos < Math.cos((fovDeg / 2) * Math.PI / 180)) return false;
  }
  return !world.segmentBlocked(ex, ez, target.x, target.z);
}

// ---------------------------------------------------------------------------
// Dispatch: starts/ends chases, remembers where the player was LAST SEEN.
// ---------------------------------------------------------------------------
export class Dispatch {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.lastX = 0; this.lastZ = 0;
    this.sinceSeen = 0;
    this.loseTime = 10;
    this.busting = false;
    this.onStart = () => {}; this.onEnd = () => {}; this.onBusted = () => {};
  }

  start() {
    const P = this.game.player;
    if (this.active) return;
    this.active = true;
    this.sinceSeen = 0;
    this.lastX = P.x; this.lastZ = P.z;
    for (const c of this.game.policeCars) c.beginPursuit();
    this.onStart();
  }

  report(x, z) {
    if (!this.active) return;
    this.lastX = x; this.lastZ = z;
    this.sinceSeen = 0;
  }

  end(escaped) {
    if (!this.active) return;
    this.active = false;
    for (const c of this.game.policeCars) c.endPursuit();
    this.onEnd(escaped);
  }

  caught() {
    if (this.busting || !this.active) return;
    this.busting = true;
    const P = this.game.player;
    P.controlsEnabled = false;
    this.onBusted();
    setTimeout(() => {
      this.end(false);
      P.respawn();
      P.controlsEnabled = true;
      this.busting = false;
    }, 2500);
  }

  update(dt) {
    if (!this.active || this.busting) return;
    this.sinceSeen += dt;
    if (this.sinceSeen >= this.loseTime) this.end(true);
  }
}

// ---------------------------------------------------------------------------
// Police patrol car.
// ---------------------------------------------------------------------------
export class PoliceCar extends Car {
  constructor(game) {
    super(game, 'police', 0xffffff);
    this.isPolice = true;
    this.state = 'patrol';
    this.patrolSpeed = 9; this.pursuitSpeed = 16;
    this.cruise = this.patrolSpeed;
    this.officer = null;
    this.repathT = 0; this.sightT = Math.random() * 0.2; this.flashT = 0; this.flash = false; this.waitT = 0;
    this.redMat = this.vehicle.red;
    this.blueMat = this.vehicle.blue;
  }

  beginPursuit() {
    this.state = 'pursuit';
    this.cruise = this.pursuitSpeed; this.accel = 5.5;
    this.obeySignals = false; this.pursuing = true; this.hold = false;
    this.repathT = 0;
  }

  endPursuit() {
    this.pursuing = false; this.obeySignals = true;
    this.cruise = this.patrolSpeed; this.accel = 3.5;
    this.clearDirect(); this.upcoming = [];
    this.setLights(false, false);
    if (this.officer) {
      this.officer.returning = true;
      this.state = 'waiting'; this.hold = true; this.waitT = 20;
    } else this.state = 'patrol';
  }

  officerBack(o) {
    if (o === this.officer) this.officer = null;
    if (this.state === 'waiting') { this.state = 'patrol'; this.hold = false; }
  }

  // Bright (above 1.0) colours glow with bloom; dark when off.
  setLights(r, b) {
    if (r) this.redMat.color.setRGB(6, 0.3, 0.25); else this.redMat.color.setHex(0x551111);
    if (b) this.blueMat.color.setRGB(0.3, 0.8, 7); else this.blueMat.color.setHex(0x111a55);
  }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player;

    // Eyes, 5 times a second.
    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = 0.2;
      if (canSee(g.world, this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw), P, 50, 160)) D.report(P.x, P.z);
    }

    if (this.state === 'pursuit') {
      const d = dist(this.x, this.z, D.lastX, D.lastZ);
      const clear = d < 30 && !g.world.segmentBlocked(this.x, this.z, D.lastX, D.lastZ);
      if (clear) this.setDirect(D.lastX, D.lastZ, 7);
      else {
        this.clearDirect();
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 1; this.routeTo(this.net.nearest(D.lastX, D.lastZ)); }
      }
      // Close and almost stopped: the officer jumps out.
      if (!this.officer && D.sinceSeen < 1 && d < 12 && this.speed < 1.5) {
        const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
        this.officer = new Officer(g, this, this.x + rx * (this.halfW + 0.9), this.z + rz * (this.halfW + 0.9), this.yaw);
        g.officers.push(this.officer);
      }
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashT = 0.25; this.flash = !this.flash; this.setLights(this.flash, !this.flash); }
    } else if (this.state === 'waiting') {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        if (this.officer) this.officer.remove();
        this.officer = null; this.hold = false; this.state = 'patrol';
      }
    }

    super.update(dt);
    // Off the road (driving straight at the player): never drive into buildings.
    if (this.direct) { g.world.resolveCircle(this, this.halfW); this.syncMesh(); }
  }
}

// ---------------------------------------------------------------------------
// Officer on foot. 5.3 m/s: faster than Vikram's run, slower than his sprint.
// ---------------------------------------------------------------------------
export class Officer {
  constructor(game, car, x, z, yaw) {
    this.game = game; this.car = car;
    this.x = x; this.z = z; this.yaw = yaw;
    this.rLong = 0.35; this.rLat = 0.35; this.radius = 0.35;
    this.returning = false; this.catchT = 0; this.sightT = 0; this.avoidSide = 1;
    this.rig = new CharacterRig('police', 0xb39b68, game.shadows);   // khaki uniform
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.isOfficer = true;
    this.speed = 0;
  }

  remove() {
    this.inactive = true;
    this.game.scene.remove(this.mesh);
    const list = this.game.officers;
    const i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player;
    let gx, gz, speed;

    if (this.returning) {
      gx = this.car.x; gz = this.car.z; speed = 2.6;
      if (dist(this.x, this.z, gx, gz) < 3) { this.car.officerBack(this); this.remove(); return; }
    } else {
      this.sightT -= dt;
      if (this.sightT <= 0) {
        this.sightT = 0.2;
        if (canSee(g.world, this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw), P, 35, 150)) D.report(P.x, P.z);
      }
      gx = D.lastX; gz = D.lastZ;
      speed = dist(this.x, this.z, gx, gz) < 1 ? 0 : 5.3;

      if (dist(this.x, this.z, P.x, P.z) < 1.5 && P.controlsEnabled) {
        this.catchT += dt;
        if (this.catchT >= 0.5) { this.catchT = 0; D.caught(); }
      } else this.catchT = 0;
    }

    let want = yawOf(gx - this.x, gz - this.z);
    want = this.avoid(want);
    if (speed > 0) this.yaw = rotateTowards(this.yaw, want, 9.4 * dt);
    this.speed = moveTowards(this.speed, speed, 10 * dt);
    const bx = this.x, bz = this.z;
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;

    // Do not walk through walls or cars.
    g.world.resolveCircle(this, this.radius);
    for (const c of g.cars) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);

    this.mesh.position.set(this.x, g.world.groundAt(this.x, this.z), this.z);
    this.mesh.rotation.y = this.yaw;
    const real = dist(bx, bz, this.x, this.z) / Math.max(dt, 1e-4);   // real speed after walls
    this.rig.setMotion(Math.min(real, this.speed + 0.1));
    this.rig.update(dt, dist(this.x, this.z, g.camera.position.x, g.camera.position.z));
  }

  // Straight way blocked? Try angles to the side; remember which side worked.
  avoid(yaw) {
    const blocked = (a) => {
      const ex = this.x + Math.sin(a) * 1.6, ez = this.z + Math.cos(a) * 1.6;
      return this.game.world.segmentBlocked(this.x, this.z, ex, ez);
    };
    if (!blocked(yaw)) return yaw;
    for (let i = 1; i <= 3; i++) {
      const a = 0.61 * i;
      if (!blocked(yaw + a * this.avoidSide)) return yaw + a * this.avoidSide;
      if (!blocked(yaw - a * this.avoidSide)) { this.avoidSide = -this.avoidSide; return yaw + a * this.avoidSide; }
    }
    return yaw;
  }
}
