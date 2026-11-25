// Vikram: movement on foot, health, guns (pistol / SMG), aiming, reload, cars, pick-ups.
// Plus the third-person camera (on foot, aiming, and a chase camera behind cars).
//
// Aiming help for touch screens (can be turned off in Settings):
// - the camera slows down and gently follows a police officer under the crosshair,
// - pressing AIM snaps onto the nearest officer close to the crosshair,
// - bullets bend a tiny bit onto an officer you are almost on.
import * as THREE from 'three';
import { clamp, lerp, moveTowards, rotateTowards, yawOf, DEG, pushOutOfBox, angleDiff } from './util.js';
import { CharacterRig, strafeYaw, twistTo } from './characters.js';
import { WEAPONS, WEAPON_ORDER, makeGun, castShot } from './weapons.js';
import { placeGun } from './police.js';

const _dir = new THREE.Vector3(), _aim = new THREE.Vector3(), _muz = new THREE.Vector3(), _hp = new THREE.Vector3(), _hd = new THREE.Vector3(), _to = new THREE.Vector3();

export class Player {
  constructor(game, x, z, yaw) {
    this.game = game;
    this.spawn = { x, z, yaw };
    this.x = x; this.z = z; this.y = game.world.groundAt(x, z); this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.35; this.rLong = 0.35; this.rLat = 0.35;
    this.grounded = true; this.crouching = false; this.sprinting = false; this.aiming = false;
    this.controlsEnabled = true;
    this.inCar = false; this.dead = false;
    this.health = 100; this.armor = 0; this.lastHurt = -99;
    this.lastGrounded = 0; this.lastJumpPress = -99;
    // Real-life speeds (m/s), like GTA: walk, jog (full push), sprint (push past the ring / sprint lock / Shift).
    this.walkSpeed = 1.55; this.jogSpeed = 3.4; this.sprintSpeed = 5.9; this.crouchSpeed = 1.3; this.aimSpeed = 1.9; this.hipSpeed = 2.6;
    this.speed = 0;   // forward speed along the way he faces

    this.rig = new CharacterRig('vikram', { castShadow: game.shadows });
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.crouchBlend = 0;

    // Guns.
    this.owned = ['pistol'];
    this.weapon = 'pistol';
    this.ammo = {};
    for (const id of WEAPON_ORDER) this.ammo[id] = { mag: 0, reserve: 0 };
    this.ammo.pistol = { mag: 12, reserve: 48 };
    this.maxHealth = 100; this.armor = 0;
    this.cooldown = 0; this.reloadT = 0; this.lastShot = -99;
    this.guns = {};
    for (const id of WEAPON_ORDER) this.guns[id] = makeGun(id);
    for (const gmesh of Object.values(this.guns)) { gmesh.visible = false; game.scene.add(gmesh); }
    this.gunMesh = this.guns.pistol;
    this.sync();
  }

  get weaponDef() { return WEAPONS[this.weapon]; }
  // Magazine size (the BIG MAGAZINES upgrade from the shop adds 50%).
  magSize(id = this.weapon) { const r = this.game.rewards; return Math.round(WEAPONS[id].mag * (r && r.has('mags') ? 1.5 : 1)); }

  giveWeapon(id, ammo) {
    if (!this.owned.includes(id)) this.owned.push(id);
    this.owned.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
    const a = this.ammo[id];
    a.reserve += ammo;
    // A new gun comes loaded.
    const take = Math.min(this.magSize(id) - a.mag, a.reserve);
    a.mag += take; a.reserve -= take;
  }

  switchWeapon() {
    if (this.owned.length < 2) return;
    const i = this.owned.indexOf(this.weapon);
    this.weapon = this.owned[(i + 1) % this.owned.length];
    this.reloadT = 0; this.cooldown = 0.25;
    this.game.audio.click();
  }

  reload(instant = false) {
    const a = this.ammo[this.weapon], w = this.weaponDef;
    if (a.mag >= this.magSize() || a.reserve <= 0 || this.reloadT > 0) return;
    if (instant) { this.finishReload(); return; }
    this.reloadT = w.reload * (this.game.rewards && this.game.rewards.rank >= 3 ? 0.75 : 1);
    this.game.audio.reload();
  }

  finishReload() {
    const a = this.ammo[this.weapon];
    const take = Math.min(this.magSize() - a.mag, a.reserve);
    a.mag += take; a.reserve -= take;
  }

  // Guns tick (cool-down, reload) - also while driving.
  tickGuns(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); } }
  }

  respawn() {
    this.x = this.spawn.x; this.z = this.spawn.z; this.yaw = this.spawn.yaw;
    this.y = this.game.world.groundAt(this.x, this.z);
    this.vx = this.vz = this.vy = 0; this.speed = 0;
    this.crouching = false; this.aiming = false; this.dead = false;
    this.health = this.maxHealth; this.controlsEnabled = true;
    if (this.rig.dead) {   // fresh body after dying
      this.game.scene.remove(this.mesh);
      this.rig = new CharacterRig('vikram', { castShadow: this.game.shadows });
      this.mesh = this.rig.root;
      this.game.scene.add(this.mesh);
    }
    this.mesh.visible = true;
    this.game.camera3p.snapBehind();
  }

  takeDamage(amount, fromX, fromZ) {
    if (this.dead || this.game.godMode) return;
    if (this.inCar) amount *= 0.45;   // the car body protects you a bit
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.7); this.armor -= a; amount -= a; }
    this.health -= amount;
    this.lastHurt = this.game.time;
    this.game.hud.hurt(fromX, fromZ);
    this.game.audio.hurt();
    if (this.health <= 0) this.die(fromX, fromZ);
  }

  die(fromX = this.x, fromZ = this.z - 1) {
    if (this.dead) return;
    this.health = 0; this.dead = true; this.controlsEnabled = false;
    if (this.inCar) this.game.driving.exit();
    this.rig.die(this.x - fromX, this.z - fromZ);
    this.gunMesh.visible = false;
    this.game.onPlayerDied();
  }

  update(dt, input, camYaw) {
    const g = this.game, t = g.time;
    if (this.inCar) {
      const c = g.driving.car;
      this.x = c.x; this.z = c.z; this.y = c.y || 0; this.yaw = c.yaw;
      this.tickGuns(dt);
      if (this.controlsEnabled && (this.weaponDef.auto ? input.fire : input.firePressed)) this.driveBy();
      if (this.controlsEnabled && input.switchPressed) this.switchWeapon();
      this.regen(dt);
      return;
    }
    if (this.dead) { this.rig.update(dt, 0); return; }

    const on = this.controlsEnabled;
    const move = on ? input.move : { x: 0, y: 0 };
    const strength = Math.min(1, Math.hypot(move.x, move.y));

    if (on && input.aimPressed) {
      this.aiming = !this.aiming;
      if (this.aiming) g.camera3p.snapToTarget();
    }
    if (on && input.crouchPressed) this.crouching = !this.crouching;
    if (on && input.reloadPressed) this.reload();
    if (on && input.switchPressed) this.switchWeapon();
    if ((this.aiming || input.fire) && g.controls.sprintLock) g.controls.cancelSprintLock();

    const wantSprint = on && input.sprint && strength > 0.5 && !this.aiming && !input.fire;
    if (wantSprint && this.crouching) this.crouching = false;
    this.sprinting = wantSprint;

    // Camera-relative direction. Forward = (sin, cos), right = (-cos, sin).
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let wx = fx * move.y + rx * move.x, wz = fz * move.y + rz * move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) { wx /= wl; wz /= wl; }

    const firingStance = this.aiming || t - this.lastShot < 0.8;
    const strafe = firingStance || input.fire;
    const air = this.grounded ? 1 : 0.3;
    if (strafe) {
      // Combat walk: step any way (camera-relative); the chest stays on the crosshair.
      const max = this.crouching ? this.crouchSpeed : this.aiming ? this.aimSpeed : this.hipSpeed;
      const k = Math.min(1, strength * 1.25);
      const tvx = wx * max * k, tvz = wz * max * k;
      const up = tvx * tvx + tvz * tvz > this.vx * this.vx + this.vz * this.vz;
      const rate = (up ? 9 : 12) * air;
      const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
      if (dl <= rate * dt) { this.vx = tvx; this.vz = tvz; }
      else { this.vx += (dvx / dl) * rate * dt; this.vz += (dvz / dl) * rate * dt; }
      this.speed = Math.hypot(this.vx, this.vz);
    } else {
      // GTA-style: he turns towards the stick and moves the way he faces, with weight:
      // he speeds up and slows down over a moment, slows in sharp turns, and skids round for a U-turn.
      let want = 0;
      if (strength > 0.12) {
        want = this.crouching ? this.crouchSpeed : this.sprinting ? this.sprintSpeed
          : strength < 0.62 ? this.walkSpeed * Math.max(0.55, strength / 0.62) : this.jogSpeed;
        if (this.carrying) want = Math.min(want, 2.6);   // heavy gold bag
        const diff = angleDiff(this.yaw, yawOf(wx, wz)), ad = Math.abs(diff);
        const turn = (this.speed < 2 ? 520 : this.speed < 4.5 ? 340 : 210) * DEG * dt * air;
        const dyaw = clamp(diff, -turn, turn);
        this.yaw += dyaw;
        this.turnRate = dyaw / Math.max(dt, 1e-4);
        if (ad > 2.2 && this.speed > 2.4) want = Math.min(want, 0.8);
        else want *= 1 - 0.45 * clamp((ad - 0.35) / 2.2, 0, 1);
      }
      const up = want > this.speed;
      const rate = (up ? (this.speed < this.walkSpeed ? 6 : this.speed < this.jogSpeed ? 4.2 : 3.2) : 9) * air;
      this.speed = moveTowards(this.speed, want, rate * dt);
      this.vx = Math.sin(this.yaw) * this.speed; this.vz = Math.cos(this.yaw) * this.speed;
      // Lean into speeding up (sprint start), straighten when slowing.
      this.rig.lean += (clamp((want - this.speed) * 0.05, -0.05, 0.12) - this.rig.lean) * Math.min(1, dt * 6);
    }

    if (this.grounded) this.lastGrounded = t;
    if (on && input.jumpPressed) this.lastJumpPress = t;
    if (t - this.lastJumpPress <= 0.12 && t - this.lastGrounded <= 0.12) {
      this.lastJumpPress = -99;
      if (this.crouching) this.crouching = false;
      else { this.vy = Math.sqrt(2 * 1.1 * 22); this.lastGrounded = -99; this.grounded = false; }
    }

    const sx = this.x, sz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.vy = Math.max(this.vy - 22 * dt, -40);
    this.y += this.vy * dt;

    g.world.resolveCircle(this, this.radius);
    for (const c of g.cars) if (Math.abs(c.x - this.x) < 4 && Math.abs(c.z - this.z) < 4) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
    for (const o of g.walkers) {
      if (o === this || o.inactive || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) continue;
      const d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 0.0001) { this.x += (dx / d) * (min - d); this.z += (dz / d) * (min - d); }
    }
    const rvx = (this.x - sx) / dt, rvz = (this.z - sz) / dt;
    if (rvx * rvx + rvz * rvz < this.vx * this.vx + this.vz * this.vz) {
      this.vx = rvx; this.vz = rvz;
      if (!strafe) this.speed = Math.min(this.speed, Math.max(0, rvx * Math.sin(this.yaw) + rvz * Math.cos(this.yaw)) + 0.3);   // ran into a wall
    }

    const ground = g.world.groundAt(this.x, this.z);
    if (this.y <= ground) { this.y = ground; if (this.vy < 0) this.vy = 0; this.grounded = true; }
    else this.grounded = this.y - ground < 0.02 && this.vy <= 0;

    // Aiming / shooting: chest faces the crosshair, legs walk where you move (strafe, walk backwards).
    if (strafe) {
      this.yaw = rotateTowards(this.yaw, strafeYaw(this.rig, camYaw, this.vx, this.vz), 720 * DEG * dt);
      twistTo(this.rig, this.yaw, camYaw);
      this.rig.lean += (0 - this.rig.lean) * Math.min(1, dt * 6);
    } else {
      this.rig.reverse = false;
      this.rig.twist = moveTowards(this.rig.twist, 0, 6 * dt);
    }
    // Lean into turns when running (like a real runner), straight when slow or aiming.
    const wantBank = strafe || strength < 0.12 ? 0 : clamp(-(this.turnRate || 0) * this.speed * 0.028, -0.2, 0.2);
    this.bank = (this.bank || 0) + (wantBank - (this.bank || 0)) * Math.min(1, dt * 7);
    this.turnRate = 0;
    // Footsteps (sand is softer, the sea splashes).
    if (this.grounded) {
      const sp = Math.hypot(this.vx, this.vz);
      this.stride = sp < 2 ? 0.72 : sp < 4.5 ? 1.05 : 1.45;
      this.stepDist = (this.stepDist || 0) + sp * dt;
      if (this.stepDist > this.stride) {
        this.stepDist -= this.stride;
        const surface = this.z < -238 ? (this.y < -0.5 ? 'water' : 'sand') : 'hard';
        g.audio.footstep(0.18 + sp * 0.05, surface);
      }
    }

    // ---- Guns ----
    this.tickGuns(dt);
    const w = this.weaponDef;
    if (on && (w.auto ? input.fire : input.firePressed)) this.fire();

    this.regen(dt);
    this.sync(dt, firingStance || input.fire);
  }

  // Health slowly comes back when you are not hit for a while.
  regen(dt) {
    if (!this.dead && this.health < this.maxHealth && this.game.time - this.lastHurt > 6) this.health = Math.min(this.maxHealth, this.health + 6 * dt);
  }

  // Can we shoot now? Uses a bullet (or reloads / clicks when empty).
  useBullet() {
    const g = this.game, w = this.weaponDef, a = this.ammo[this.weapon];
    if (this.cooldown > 0 || this.reloadT > 0) return false;
    if (a.mag <= 0) { if (a.reserve > 0) this.reload(); else g.audio.click(); this.cooldown = 0.3; return false; }
    a.mag--;
    this.cooldown = w.rate;
    this.lastShot = g.time;
    return true;
  }

  // On foot: shoot from the camera through the crosshair.
  fire() {
    const g = this.game, w = this.weaponDef;
    if (!this.useBullet()) return;
    const cam = g.camera;
    cam.getWorldDirection(_aim);
    const moving = Math.hypot(this.vx, this.vz) > 1;
    const spread = w.spread * (this.aiming ? 0.5 : 1.4) * (moving ? 1.6 : 1) * (this.crouching ? 0.7 : 1) + g.camera3p.recoil * 0.02;
    // Bullet magnetism (aim help): almost on an enemy = hit him.
    let target = null;
    if (g.aimAssist) target = g.camera3p.findTarget(cam.position, _aim, this.aiming ? 2.6 : 3.6, w.range);
    // Start the ray just past Vikram so he never shoots himself.
    const startAt = Math.max(0, (this.x - cam.position.x) * _aim.x + (this.y + 1.4 - cam.position.y) * _aim.y + (this.z - cam.position.z) * _aim.z) + 0.6;
    this.rig.handPose(_hp, _hd);
    _muz.copy(_hp).addScaledVector(_aim, w.muzzle + 0.05);
    _muz.y += 0.04;
    this.shoot(cam.position, _aim, spread, target, startAt, _muz, null);
    g.camera3p.kick(this.weapon === 'smg' || this.weapon === 'rifle' ? 0.5 : this.weapon === 'shotgun' ? 2.2 : 1);
    g.noise(this.x, this.z, 38);
  }

  // From the car window: aim where the camera looks, help onto police / enemies / their cars.
  driveBy() {
    const g = this.game, w = this.weaponDef, car = g.driving.car;
    if (!car || !this.useBullet()) return;
    const cam = g.camera;
    cam.getWorldDirection(_aim);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    // Driver sits on the right (right-hand drive): the window is on the right side.
    _muz.set(car.x - fz * (car.halfW + 0.15) + fx * 0.3, (car.y || 0) + 1.25, car.z + fx * (car.halfW + 0.15) + fz * 0.3);
    const target = g.camera3p.findTarget(_muz, _aim, 16, w.range, true);
    this.shoot(_muz, _aim, w.spread * 1.6, target, 0.2, _muz, car);
    g.camera3p.kick(0.35);
    g.noise(this.x, this.z, 38);
  }

  // One trigger pull (a shotgun fires several pellets).
  shoot(origin, aimDir, spread, target, startAt, muzzle, ignore) {
    const g = this.game, w = this.weaponDef;
    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      if (target) {
        const ty = target.isCar ? (target.y || 0) + 0.9 : (target.groundY || 0) + 1.25 + (Math.random() - 0.5) * 0.4;
        _dir.set(target.x - origin.x, ty - origin.y, target.z - origin.z).normalize();
        if (pellets > 1) _dir.x += (Math.random() - 0.5) * spread, _dir.y += (Math.random() - 0.5) * spread, _dir.z += (Math.random() - 0.5) * spread;
      } else {
        _dir.copy(aimDir);
        _dir.x += (Math.random() - 0.5) * spread * 2; _dir.y += (Math.random() - 0.5) * spread * 2; _dir.z += (Math.random() - 0.5) * spread * 2;
      }
      _dir.normalize();
      const hit = castShot(g, origin, _dir, w.range, ignore || this, startAt);
      if (p < 3) g.fx.tracer(muzzle, hit.point, pellets > 1 ? 0.6 : 1);
      if (hit.kind === 'human') {
        const dmg = w.damage * (hit.head ? 2.5 : 1);
        const wasAlive = !hit.target.dead;
        hit.target.takeDamage(dmg, true, this.x, this.z);
        g.fx.hitPerson(hit.point);
        g.hud.hitMarker(hit.target.dead);
        if (wasAlive && hit.target.dead && g.rewards) g.rewards.kill(hit.target, hit.head);
      } else if (hit.kind === 'car') {
        hit.target.takeDamage(w.damage * 0.35, true);
        g.fx.impact(hit.point, _dir.clone().negate(), true);
        if (p === 0) g.audio.ping();
      } else if (hit.t < w.range) {
        g.fx.impact(hit.point, _dir.clone().negate(), false);
      }
    }
    g.fx.muzzle(muzzle);
    g.audio.gunshot(this.weapon === 'shotgun' || this.weapon === 'rifle' ? 'smg' : this.weapon, this.weapon === 'shotgun' ? 1.3 : 1);
    g.dispatch.crime('gunfire', this.x, this.z);
    g.alarm(this.x, this.z, 35);
    g.stats.shots++;
  }

  sync(dt = 0, holdingGun = false) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.z = this.bank || 0;
    for (const [id, m] of Object.entries(this.guns)) m.visible = !this.inCar && !this.dead && id === this.weapon;
    this.gunMesh = this.guns[this.weapon];
    if (dt > 0) {
      this.crouchBlend = moveTowards(this.crouchBlend, this.crouching ? 1 : 0, 5 * dt);
      this.rig.setMotion(Math.hypot(this.vx, this.vz), this.crouchBlend);
      // Arms point where the camera aims while aiming/shooting.
      const cam = this.game.camera;
      cam.getWorldDirection(_dir);
      this.aimW = moveTowards(this.aimW || 0, holdingGun && this.reloadT <= 0 ? 1 : 0, 8 * dt);
      this.rig.setAim(this.aimW, _dir);
      this.rig.update(dt, 0);
      placeGun(this.rig, this.gunMesh, this.aimW > 0.5 ? _dir : null);
    }
  }
}

// Over-the-shoulder camera, aim zoom, recoil kick, crash shake, aim help, and a chase camera for cars.
export class ThirdPersonCamera {
  constructor(game, camera) {
    this.game = game; this.cam = camera;
    this.yaw = 0; this.pitch = 10 * DEG;
    this.dist = 3.4; this.aimBlend = 0; this.pivotH = 1.55;
    this.sensitivity = 1; this.aimSensitivity = 0.6; this.invert = false;
    this.recoil = 0; this.shakeT = 0; this.carLookT = 0; this.snapT = 0; this.fovKick = 0;
    this.pivot = null; this.lookIdle = 0;
  }

  snapBehind() { this.yaw = this.game.player.yaw; this.pitch = 10 * DEG; this.pivot = null; }
  kick(k) { this.recoil = Math.min(3, this.recoil + k); this.pitch -= 0.9 * DEG * k; this.yaw += (Math.random() - 0.5) * 0.5 * DEG * k; }
  shake(k) { this.shakeT = Math.max(this.shakeT, 0.35 * k); }
  snapToTarget() { if (this.game.aimAssist) this.snapT = 0.2; }

  // Closest enemy (police / gang) within maxDeg of the ray from "from" along "dir", in clear view.
  // withCars: also police cars and enemy mission cars (shooting from a car).
  findTarget(from, dir, maxDeg, range = 80, withCars = false) {
    const g = this.game, P = g.player;
    let best = null, bestCos = Math.cos(maxDeg * DEG);
    const test = (o, y) => {
      _to.set(o.x - from.x, y - from.y, o.z - from.z);
      const d = _to.length();
      if (d > range || d < 1) return;
      const c = _to.dot(dir) / d;
      if (c > bestCos && !g.world.segmentBlocked(P.x, P.z, o.x, o.z)) { bestCos = c; best = o; }
    };
    for (const o of g.officers) if (!o.dead && !o.inactive) test(o, (o.groundY || 0) + 1.25);
    if (withCars) for (const c of g.cars) if ((c.isPolice || c.hostile) && !c.exploded && !c.playerControlled) test(c, (c.y || 0) + 0.9);
    return best;
  }

  update(dt, look) {
    const g = this.game, P = g.player, W = g.world;
    const firing = g.time - P.lastShot < 0.8;
    this.aimBlend = moveTowards(this.aimBlend, P.aiming && !P.inCar ? 1 : 0, 6 * dt);
    this.recoil = Math.max(0, this.recoil - dt * 4);

    // Aim help: slow the camera over a target and follow it a little.
    let slow = 1;
    if (g.aimAssist && !P.inCar && !P.dead && (P.aiming || firing || this.snapT > 0)) {
      this.cam.getWorldDirection(_dir);
      const t = this.findTarget(this.cam.position, _dir, this.snapT > 0 ? 12 : P.aiming ? 7 : 4.5);
      if (t) {
        slow = 0.55;
        _to.set(t.x - this.cam.position.x, (t.groundY || 0) + 1.25 - this.cam.position.y, t.z - this.cam.position.z);
        const wantYaw = Math.atan2(_to.x, _to.z), wantPitch = -Math.atan2(_to.y, Math.hypot(_to.x, _to.z));
        const rate = (this.snapT > 0 ? 70 : P.aiming ? 9 : 6) * DEG * dt;
        this.yaw += clamp(angleDiff(this.yaw, wantYaw), -rate, rate);
        this.pitch += clamp(wantPitch - this.pitch, -rate, rate);
      }
    }
    if (this.snapT > 0) this.snapT -= dt;

    const k = 0.12 * DEG * this.sensitivity * lerp(1, this.aimSensitivity, this.aimBlend) * slow;
    this.yaw -= look.x * k;
    this.pitch += (this.invert ? -look.y : look.y) * k;
    this.lookIdle = Math.abs(look.x) + Math.abs(look.y) > 0.5 ? 0 : this.lookIdle + dt;
    // On foot, running with no camera input: the camera slowly swings in behind him (GTA style).
    if (!P.inCar && !P.aiming && !firing && this.lookIdle > 1.1 && P.speed > 2.2) {
      const d = angleDiff(this.yaw, P.yaw);
      if (Math.abs(d) < 2.0) this.yaw += d * Math.min(1, dt * 1.1);
    }

    let px, py, pz, wantDist, wantShoulder, fovBase;
    if (P.inCar && g.driving.car) {
      // Chase camera: swings behind the car (looking a little into the slide/turn) unless you look around.
      const car = g.driving.car, D = g.driving, sp = D.speed;
      if (Math.abs(look.x) + Math.abs(look.y) > 0.5) this.carLookT = 1.6;
      this.carLookT -= dt;
      if (this.carLookT <= 0 && sp > 1) {
        const back = D.vx * Math.sin(car.yaw) + D.vz * Math.cos(car.yaw) < -0.5;
        let behind = back ? car.yaw + Math.PI : car.yaw;
        if (!back && sp > 4) behind += angleDiff(car.yaw, Math.atan2(D.vx, D.vz)) * 0.6 - D.steer * 0.35;   // look into the turn
        this.yaw += angleDiff(this.yaw, behind) * Math.min(1, dt * 3.2);
        this.pitch = lerp(this.pitch, 11 * DEG, dt * 2);
      }
      px = car.x; py = 1.7; pz = car.z;
      wantDist = (g.carCamFar ? 9.5 : 6.4) + Math.min(3, sp * 0.08);
      wantShoulder = 0;
      this.fovKick = moveTowards(this.fovKick, D.boosting ? 12 : 0, 30 * dt);
      fovBase = 62 + Math.min(14, sp * 0.45) + this.fovKick;
    } else {
      const wantH = P.crouching ? 1.05 : 1.55;
      this.pivotH = lerp(this.pivotH, wantH, 1 - Math.exp(-10 * dt));
      // The camera follows a point that trails him a little: smooth, with a feeling of weight.
      if (!this.pivot || Math.hypot(this.pivot.x - P.x, this.pivot.z - P.z) > 4) this.pivot = { x: P.x, y: P.y, z: P.z };
      const f = 1 - Math.exp(-13 * dt);
      this.pivot.x += (P.x - this.pivot.x) * f; this.pivot.z += (P.z - this.pivot.z) * f;
      this.pivot.y += (P.y - this.pivot.y) * (1 - Math.exp(-9 * dt));
      px = this.pivot.x; py = this.pivot.y + this.pivotH; pz = this.pivot.z;
      // A small bob of the camera with each running step.
      if (P.grounded && P.speed > 3) py += Math.sin(((P.stepDist || 0) / (P.stride || 1)) * Math.PI * 2) * 0.022 * Math.min(1, P.speed / 5.9);
      wantDist = lerp(firing ? 2.6 : 3.4, 1.45, this.aimBlend);
      wantShoulder = lerp(firing ? 0.6 : 0.5, 0.65, this.aimBlend);
      fovBase = lerp(P.sprinting && P.speed > 4.5 ? 65 : 60, 42, this.aimBlend);
    }
    this.pitch = clamp(this.pitch, -40 * DEG, 65 * DEG);

    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dx = fx * cp, dy = -spch, dz = fz * cp;
    const rx = -fz, rz = fx;

    const side = Math.max(0, W.rayCast(px, py, pz, rx, 0, rz, wantShoulder + 0.22) - 0.22);
    const shoulder = Math.min(wantShoulder, side);
    const sx = px + rx * shoulder, sz = pz + rz * shoulder;
    const hit = W.rayCast(sx, py, sz, -dx, -dy, -dz, wantDist + 0.22);
    const allowed = Math.max(0.4, Math.min(wantDist, hit - 0.22));
    this.dist = allowed < this.dist ? allowed : lerp(this.dist, allowed, 1 - Math.exp(-6 * dt));

    let shx = 0, shy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; shx = (Math.random() - 0.5) * this.shakeT * 0.6; shy = (Math.random() - 0.5) * this.shakeT * 0.6; }
    this.cam.position.set(sx - dx * this.dist + shx, py - dy * this.dist + shy, sz - dz * this.dist);
    this.cam.lookAt(this.cam.position.x + dx, this.cam.position.y + dy, this.cam.position.z + dz);

    if (Math.abs(this.cam.fov - fovBase) > 0.05) {
      this.cam.fov = lerp(this.cam.fov, fovBase, 1 - Math.exp(-8 * dt));
      this.cam.updateProjectionMatrix();
    }
  }
}
