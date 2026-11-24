// Navapur Metro Police (fictional): wanted stars, patrol cars, officers who arrest or shoot.
//
// WANTED STARS
//   1 star : cops chase you and try to ARREST you (BUSTED if one catches you).
//   2 stars: cops SHOOT. 3+ stars: more cars, two officers per car.
//   Crimes raise stars (shooting near police, hurting people, stealing cars in front of cops).
//   Stay out of sight long enough and the stars disappear.
import * as THREE from 'three';
import { Car } from './traffic.js';
import { CharacterRig } from './characters.js';
import { makeGun, castShot, shotHitsPlayer } from './weapons.js';
import { dist, rotateTowards, yawOf, pushOutOfBox, moveTowards } from './util.js';

const UNITS_FOR_STARS = [2, 2, 3, 4, 5, 6];

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

export class Dispatch {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.lastX = 0; this.lastZ = 0;
    this.sinceSeen = 0;
    this.busting = false;
    this.reportTimer = -1;
    this.reinforceT = 0;
    this.onStars = () => {}; this.onEscaped = () => {}; this.onBusted = () => {};
  }

  get active() { return this.stars > 0; }
  get loseTime() { return 6 + this.stars * 3; }

  // Raise (never lower) the wanted level.
  setStars(n, x, z) {
    n = Math.max(0, Math.min(5, n));
    const P = this.game.player;
    if (n <= this.stars) return;
    const was = this.stars;
    this.stars = n;
    this.lastX = x ?? P.x; this.lastZ = z ?? P.z;
    this.sinceSeen = 0;
    if (was === 0) for (const c of this.game.policeCars) c.beginPursuit();
    this.onStars(n, was);
  }

  clear(escaped) {
    if (!this.stars) return;
    this.stars = 0;
    for (const c of this.game.policeCars) c.endPursuit();
    for (const o of this.game.officers) if (!o.dead) o.standDown();
    this.onStars(0, 1);
    if (escaped) this.onEscaped();
  }

  // Is any police unit looking at the player right now?
  witnessed() {
    const g = this.game, P = g.player;
    for (const c of g.policeCars) if (canSee(g.world, c.x, c.z, Math.sin(c.yaw), Math.cos(c.yaw), P, 55, 200)) return true;
    for (const o of g.officers) if (!o.dead && canSee(g.world, o.x, o.z, Math.sin(o.yaw), Math.cos(o.yaw), P, 45, 220)) return true;
    return false;
  }

  // A crime happened at (x, z).
  crime(kind, x, z) {
    const seen = this.witnessed();
    switch (kind) {
      case 'gunfire':
        if (seen) this.setStars(Math.max(this.stars, 2), x, z);
        else if (!this.stars && this.reportTimer < 0) { this.reportTimer = 5; this.reportX = x; this.reportZ = z; }   // people call the police
        break;
      case 'kill_ped': this.setStars(seen ? Math.min(5, Math.max(1, this.stars + 1)) : Math.max(1, this.stars), x, z); break;
      case 'hit_cop': this.setStars(Math.max(this.stars, 2), x, z); break;
      case 'kill_cop': this.setStars(Math.min(5, Math.max(2, this.stars + 1)), x, z); this.forceUp(); break;
      case 'carjack': if (seen) this.setStars(Math.max(this.stars, 1), x, z); break;
      case 'steal_police': this.setStars(Math.max(this.stars, 2), x, z); break;
      case 'run_over': this.setStars(Math.max(this.stars, seen ? 2 : 1), x, z); break;
      default: break;
    }
  }

  forceUp() { this.sinceSeen = 0; }

  report(x, z) {
    if (!this.stars) return;
    this.lastX = x; this.lastZ = z;
    this.sinceSeen = 0;
  }

  // An officer has hold of the player (only at 1 star; on foot).
  caught() {
    const g = this.game, P = g.player;
    if (this.busting || this.stars !== 1 || P.inCar || P.dead) return;
    this.busting = true;
    P.controlsEnabled = false;
    this.onBusted();
    setTimeout(() => { this.busting = false; }, 2600);
  }

  update(dt) {
    const g = this.game;
    if (this.reportTimer >= 0) {
      this.reportTimer -= dt;
      if (this.reportTimer < 0 && !this.stars) this.setStars(1, this.reportX, this.reportZ);
    }
    if (!this.stars || this.busting) return;
    this.sinceSeen += dt;
    if (g.mission && g.mission.holdStars && !g.mission.done) this.sinceSeen = 0;   // no escape during the shoot-out
    if (this.sinceSeen >= this.loseTime) { this.clear(true); return; }

    // Reinforcements: keep enough police cars for the star level.
    this.reinforceT -= dt;
    if (this.reinforceT <= 0) {
      this.reinforceT = 4;
      const want = UNITS_FOR_STARS[this.stars];
      if (g.policeCars.length < want) g.spawnPoliceCar(true);
    }
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
    this.crew = [];
    this.repathT = 0; this.sightT = Math.random() * 0.2; this.flashT = 0; this.flash = false; this.waitT = 0;
    this.redMat = this.vehicle.red;
    this.blueMat = this.vehicle.blue;
  }

  beginPursuit() {
    if (this.playerControlled || this.parked || this.wrecked) return;
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
    const alive = this.crew.filter((o) => !o.dead);
    if (alive.length) { this.state = 'waiting'; this.hold = true; this.waitT = 25; }
    else this.state = 'patrol';
  }

  officerBack(o) {
    this.crew = this.crew.filter((c) => c !== o);
    if (this.state === 'waiting' && !this.crew.some((c) => !c.dead)) { this.state = 'patrol'; this.hold = false; }
  }

  setLights(r, b) {
    if (r) this.redMat.color.setRGB(6, 0.3, 0.25); else this.redMat.color.setHex(0x551111);
    if (b) this.blueMat.color.setRGB(0.3, 0.8, 7); else this.blueMat.color.setHex(0x111a55);
  }

  update(dt) {
    if (this.playerControlled || this.parked) { super.update(dt); return; }
    const g = this.game, D = g.dispatch, P = g.player;
    const target = P.inCar && g.driving.car ? g.driving.car : P;

    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = 0.2;
      if (D.active && canSee(g.world, this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw), target, 60, 200)) D.report(target.x, target.z);
    }

    if (this.state === 'pursuit' && !this.wrecked) {
      const d = dist(this.x, this.z, D.lastX, D.lastZ);
      const clear = d < 32 && !g.world.segmentBlocked(this.x, this.z, D.lastX, D.lastZ);
      if (clear) this.setDirect(D.lastX, D.lastZ, P.inCar ? 4 : 7);
      else {
        this.clearDirect();
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 1; this.routeTo(this.net.nearest(D.lastX, D.lastZ)); }
      }
      // Officers get out when close (one at 1-2 stars, two at 3+).
      const crewSize = D.stars >= 3 ? 2 : 1;
      if (!P.inCar && this.crew.filter((o) => !o.dead).length < crewSize && this.deployT <= 0 && D.sinceSeen < 1.5 && d < 14 && this.speed < 1.5) {
        const side = this.crew.length % 2 === 0 ? 1 : -1;
        const rx = -Math.cos(this.yaw) * side, rz = Math.sin(this.yaw) * side;
        const o = g.spawnOfficer(this.x + rx * (this.halfW + 0.9), this.z + rz * (this.halfW + 0.9), this.yaw, this);
        this.crew.push(o);
        this.deployT = 1.2;
      }
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashT = 0.25; this.flash = !this.flash; this.setLights(this.flash, !this.flash); }
    } else if (this.state === 'waiting') {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        for (const o of this.crew) if (!o.dead) o.remove();
        this.crew = []; this.hold = false; this.state = 'patrol';
      }
    }
    if (this.deployT > 0) this.deployT -= dt; else this.deployT = 0;

    super.update(dt);
    if (this.direct) { g.world.resolveCircle(this, this.halfW); this.syncMesh(); }
  }
}

// ---------------------------------------------------------------------------
// Officer on foot: khaki uniform, pistol. Arrests at 1 star, shoots at 2+.
// ---------------------------------------------------------------------------
const _from = new THREE.Vector3(), _dir = new THREE.Vector3(), _hand = new THREE.Vector3(), _hd = new THREE.Vector3();

export class Officer {
  constructor(game, x, z, yaw, car) {
    this.game = game; this.car = car;
    this.x = x; this.z = z; this.yaw = yaw; this.groundY = game.world.groundAt(x, z);
    this.rLong = 0.35; this.rLat = 0.35; this.radius = 0.35;
    this.health = 100; this.dead = false; this.deadT = 0;
    this.returning = false; this.catchT = 0; this.sightT = Math.random() * 0.2; this.avoidSide = 1;
    this.fireT = 1 + Math.random(); this.seesPlayer = false; this.speed = 0; this.aimW = 0;
    this.isOfficer = true;
    this.rig = new CharacterRig('man', { top: 0xc9b07a, bottom: 0xa8915f, shoes: 0x2a1f14, hideBeard: Math.random() < 0.5, castShadow: game.shadows, skin: true });
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    // Police cap.
    const head = this.rig.bones.Head;
    if (head) {
      const cap = new THREE.Mesh(CAP_GEO, CAP_MAT);
      head.add(cap);
      const s = 1 / worldScale(head);
      cap.scale.setScalar(s);
      cap.position.set(0, 0.16 * s, 0.015 * s);
    }
    this.gun = makeGun('pistol');
    this.gun.visible = false;
    game.scene.add(this.gun);
  }

  standDown() { if (this.car) this.returning = true; }

  remove() {
    this.inactive = true;
    this.game.scene.remove(this.mesh);
    this.game.scene.remove(this.gun);
    const list = this.game.officers, i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }

  takeDamage(amount, byPlayer, fromX = this.x, fromZ = this.z - 1) {
    if (this.dead) return;
    this.health -= amount;
    const g = this.game;
    if (this.health <= 0) {
      this.dead = true;
      this.rig.die(this.x - fromX, this.z - fromZ);
      this.gun.visible = false;
      if (byPlayer) {
        g.dispatch.crime('kill_cop', this.x, this.z);
        g.stats.kills++;
        if (g.mission && g.mission.onKill) g.mission.onKill(this);
      }
      g.pickups.spawn(Math.random() < 0.7 ? 'ammo' : 'health', this.x, this.z);
      g.alarm(this.x, this.z, 25);
    } else if (byPlayer) {
      g.dispatch.crime('hit_cop', this.x, this.z);
      this.fireT = Math.min(this.fireT, 0.5);   // shoot back quickly
    }
  }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player;
    const camD = dist(this.x, this.z, g.camera.position.x, g.camera.position.z);
    if (this.dead) {
      this.deadT += dt;
      this.rig.update(dt, camD);
      if (this.deadT > 20 && camD > 25) this.remove();
      return;
    }

    let gx, gz, speed = 0, shooting = false;
    const target = P.inCar && g.driving.car ? g.driving.car : P;
    const dP = dist(this.x, this.z, target.x, target.z);

    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = 0.2;
      this.seesPlayer = !P.dead && canSee(g.world, this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw), target, 45, 220);
      if (this.seesPlayer) D.report(target.x, target.z);
    }

    if (this.returning || (!D.active && !this.forceHostile)) {
      if (this.car && !this.car.inactive) {
        gx = this.car.x; gz = this.car.z; speed = 2.6;
        if (dist(this.x, this.z, gx, gz) < 3) { this.car.officerBack(this); this.remove(); return; }
      } else { gx = this.x; gz = this.z; }
    } else if ((D.stars >= 2 || this.forceHostile) && this.seesPlayer && dP < 32 && !P.dead) {
      // Engage: stop, face the player, shoot.
      shooting = true;
      gx = this.x; gz = this.z;
      this.yaw = rotateTowards(this.yaw, yawOf(target.x - this.x, target.z - this.z), 8 * dt);
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = 1.0 + Math.random() * 0.7; this.shoot(target, dP); }
      // Keep some distance: step closer if far.
      if (dP > 18) { speed = 2.2; gx = target.x; gz = target.z; }
    } else {
      gx = D.active ? D.lastX : this.x; gz = D.active ? D.lastZ : this.z;
      if (this.forceHostile && !D.active) { gx = P.x; gz = P.z; }
      speed = dist(this.x, this.z, gx, gz) < 1 ? 0 : 5.3;
      // Arrest at 1 star.
      if (D.stars === 1 && !P.inCar && dist(this.x, this.z, P.x, P.z) < 1.5 && P.controlsEnabled) {
        this.catchT += dt;
        if (this.catchT >= 0.5) { this.catchT = 0; D.caught(); }
      } else this.catchT = 0;
    }

    if (speed > 0) {
      const want = this.avoid(yawOf(gx - this.x, gz - this.z));
      this.yaw = rotateTowards(this.yaw, want, 9.4 * dt);
    }
    this.speed = moveTowards(this.speed, speed, 10 * dt);
    const bx = this.x, bz = this.z;
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    g.world.resolveCircle(this, this.radius);
    for (const c of g.cars) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
    this.groundY = g.world.groundAt(this.x, this.z);

    this.mesh.position.set(this.x, this.groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    const real = dist(bx, bz, this.x, this.z) / Math.max(dt, 1e-4);
    this.rig.setMotion(Math.min(real, this.speed + 0.1));

    // Gun out and arms up while shooting.
    this.aimW = moveTowards(this.aimW, shooting ? 1 : 0, 5 * dt);
    if (shooting) {
      _dir.set(target.x - this.x, (target.y || 0) + 1.2 - (this.groundY + 1.4), target.z - this.z).normalize();
      this.rig.setAim(this.aimW, _dir);
    } else this.rig.setAim(this.aimW, null);
    this.rig.update(dt, camD);
    this.gun.visible = this.aimW > 0.3 && this.rig.root.visible;
    if (this.gun.visible) placeGun(this.rig, this.gun, shooting ? _dir : null);
  }

  // Fire at the player. Accuracy drops with distance and if the player moves or crouches.
  shoot(target, d) {
    const g = this.game, P = g.player;
    this.rig.handPose(_from, _hd);
    const muzzle = _from.clone().addScaledVector(_dir, 0.2);
    const moving = Math.hypot(P.vx || 0, P.vz || 0) > 2 || P.inCar;
    let chance = 0.5 - d * 0.012 - (moving ? 0.18 : 0) - (P.crouching ? 0.12 : 0);
    chance = Math.max(0.06, Math.min(0.5, chance)) * g.difficulty;
    const aimY = (target.y || 0) + (P.crouching ? 0.9 : 1.25);
    const dir = new THREE.Vector3(target.x - muzzle.x, aimY - muzzle.y, target.z - muzzle.z).normalize();
    const hit = Math.random() < chance;
    if (!hit) { dir.x += (Math.random() - 0.5) * 0.12; dir.y += (Math.random() - 0.3) * 0.08; dir.z += (Math.random() - 0.5) * 0.12; dir.normalize(); }
    const res = shotHitsPlayer(g, muzzle, dir, 60);
    const end = muzzle.clone().addScaledVector(dir, Math.min(res.t, 60));
    g.fx.muzzle(muzzle);
    g.fx.tracer(muzzle, end, 0.8);
    g.audio.gunshot('pistol', Math.max(0, 1 - dist(this.x, this.z, g.camera.position.x, g.camera.position.z) / 70));
    if (res.hit && hit) P.takeDamage(6 + Math.random() * 3, this.x, this.z);
    else if (res.t < 60) g.fx.impact(end, dir.clone().negate(), false);
  }

  avoid(yaw) {
    const blocked = (a) => this.game.world.segmentBlocked(this.x, this.z, this.x + Math.sin(a) * 1.6, this.z + Math.cos(a) * 1.6);
    if (!blocked(yaw)) return yaw;
    for (let i = 1; i <= 3; i++) {
      const a = 0.61 * i;
      if (!blocked(yaw + a * this.avoidSide)) return yaw + a * this.avoidSide;
      if (!blocked(yaw - a * this.avoidSide)) { this.avoidSide = -this.avoidSide; return yaw + a * this.avoidSide; }
    }
    return yaw;
  }
}

const CAP_GEO = new THREE.CylinderGeometry(0.105, 0.115, 0.07, 12);
const CAP_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3b25, roughness: 0.7 });

function worldScale(obj) {
  obj.updateWorldMatrix(true, false);
  const s = new THREE.Vector3();
  obj.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  return s.x || 1;
}

// Put a gun model in the character's right hand, pointing along aimDir (or along the forearm).
const _gp = new THREE.Vector3(), _gd = new THREE.Vector3(), _m4 = new THREE.Matrix4();
export function placeGun(rig, gun, aimDir) {
  rig.handPose(_gp, _gd);
  const d = aimDir || _gd;
  gun.position.copy(_gp).addScaledVector(d, 0.03);
  _m4.lookAt(new THREE.Vector3(), d.clone().negate(), new THREE.Vector3(0, 1, 0));
  gun.quaternion.setFromRotationMatrix(_m4);
}
