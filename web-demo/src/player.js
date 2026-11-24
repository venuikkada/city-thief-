// Vikram: movement on foot, health, guns (pistol / SMG), aiming, reload, cars, pick-ups.
// Plus the third-person camera (on foot, aiming, and a chase camera behind cars).
import * as THREE from 'three';
import { clamp, lerp, moveTowards, rotateTowards, yawOf, DEG, pushOutOfBox, dist } from './util.js';
import { CharacterRig } from './characters.js';
import { WEAPONS, makeGun, castShot } from './weapons.js';
import { placeGun } from './police.js';

const _dir = new THREE.Vector3(), _muz = new THREE.Vector3(), _hp = new THREE.Vector3(), _hd = new THREE.Vector3();

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
    this.runSpeed = 4.6; this.sprintSpeed = 6.8; this.crouchSpeed = 1.7; this.aimSpeed = 2.4;
    this.accel = 16; this.decel = 24;

    // Vikram: realistic man, dark jacket, jeans, short beard.
    this.rig = new CharacterRig('man', { top: 0x2b2f36, bottom: 0x2c3e66, shoes: 0x1a1a1a, detail: true, castShadow: game.shadows, skinTone: 0xb98468 });
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.crouchBlend = 0;

    // Guns.
    this.owned = ['pistol'];
    this.weapon = 'pistol';
    this.ammo = { pistol: { mag: 12, reserve: 48 }, smg: { mag: 0, reserve: 0 } };
    this.cooldown = 0; this.reloadT = 0; this.lastShot = -99;
    this.guns = { pistol: makeGun('pistol'), smg: makeGun('smg') };
    for (const gmesh of Object.values(this.guns)) { gmesh.visible = false; game.scene.add(gmesh); }
    this.gunMesh = this.guns.pistol;
    this.sync();
  }

  get weaponDef() { return WEAPONS[this.weapon]; }

  giveWeapon(id, ammo) {
    if (!this.owned.includes(id)) this.owned.push(id);
    const a = this.ammo[id];
    a.reserve += ammo;
    // A new gun comes loaded.
    const take = Math.min(WEAPONS[id].mag - a.mag, a.reserve);
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
    if (a.mag >= w.mag || a.reserve <= 0 || this.reloadT > 0) return;
    if (instant) { this.finishReload(); return; }
    this.reloadT = w.reload;
    this.game.audio.reload();
  }

  finishReload() {
    const a = this.ammo[this.weapon], w = this.weaponDef;
    const take = Math.min(w.mag - a.mag, a.reserve);
    a.mag += take; a.reserve -= take;
  }

  respawn() {
    this.x = this.spawn.x; this.z = this.spawn.z; this.yaw = this.spawn.yaw;
    this.y = this.game.world.groundAt(this.x, this.z);
    this.vx = this.vz = this.vy = 0;
    this.crouching = false; this.aiming = false; this.dead = false;
    this.health = 100; this.controlsEnabled = true;
    if (this.rig.dead) {   // fresh body after dying
      this.game.scene.remove(this.mesh);
      this.rig = new CharacterRig('man', { top: 0x2b2f36, bottom: 0x2c3e66, shoes: 0x1a1a1a, detail: true, castShadow: this.game.shadows, skinTone: 0xb98468 });
      this.mesh = this.rig.root;
      this.game.scene.add(this.mesh);
    }
    this.mesh.visible = true;
    this.game.camera3p.snapBehind();
  }

  takeDamage(amount, fromX, fromZ) {
    if (this.dead || this.game.godMode) return;
    if (this.inCar) amount *= 0.45;   // the car body protects you a bit
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
      this.x = c.x; this.z = c.z; this.y = 0; this.yaw = c.yaw;
      this.regen(dt);
      return;
    }
    if (this.dead) { this.rig.update(dt, 0); return; }

    const on = this.controlsEnabled;
    const move = on ? input.move : { x: 0, y: 0 };
    const strength = Math.min(1, Math.hypot(move.x, move.y));

    if (on && input.aimPressed) this.aiming = !this.aiming;
    if (on && input.crouchPressed) this.crouching = !this.crouching;
    if (on && input.reloadPressed) this.reload();
    if (on && input.switchPressed) this.switchWeapon();

    let wantSprint = on && input.sprint && strength > 0.5 && !this.aiming && !input.fire;
    if (wantSprint && this.crouching) this.crouching = false;
    this.sprinting = wantSprint;

    // Camera-relative direction. Forward = (sin, cos), right = (-cos, sin).
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let wx = fx * move.y + rx * move.x, wz = fz * move.y + rz * move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) { wx /= wl; wz /= wl; }

    const firingStance = this.aiming || t - this.lastShot < 0.8;
    const max = this.crouching ? this.crouchSpeed : firingStance ? this.aimSpeed + 0.8 : this.runSpeed;
    const target = this.sprinting ? this.sprintSpeed : max * strength;
    const tvx = wx * target, tvz = wz * target;
    const speedingUp = tvx * tvx + tvz * tvz > this.vx * this.vx + this.vz * this.vz;
    const rate = (speedingUp ? this.accel : this.decel) * (this.grounded ? 1 : 0.35);
    const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
    if (dl <= rate * dt) { this.vx = tvx; this.vz = tvz; }
    else { this.vx += (dvx / dl) * rate * dt; this.vz += (dvz / dl) * rate * dt; }

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
    for (const c of g.cars) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
    for (const o of g.walkers) {
      if (o === this || o.inactive || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 0.0001) { this.x += (dx / d) * (min - d); this.z += (dz / d) * (min - d); }
    }
    const rvx = (this.x - sx) / dt, rvz = (this.z - sz) / dt;
    if (rvx * rvx + rvz * rvz < this.vx * this.vx + this.vz * this.vz) { this.vx = rvx; this.vz = rvz; }

    const ground = g.world.groundAt(this.x, this.z);
    if (this.y <= ground) { this.y = ground; if (this.vy < 0) this.vy = 0; this.grounded = true; }
    else this.grounded = this.y - ground < 0.02 && this.vy <= 0;

    // Face the camera direction when aiming/shooting, else the move direction.
    let face = null;
    if (firingStance || input.fire) face = camYaw;
    else if (strength > 0.1) face = yawOf(wx, wz);
    if (face !== null) this.yaw = rotateTowards(this.yaw, face, (firingStance ? 1200 : 720) * DEG * dt);

    // ---- Guns ----
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); } }
    const w = this.weaponDef;
    if (on && (w.auto ? input.fire : input.firePressed)) this.fire();

    this.regen(dt);
    this.sync(dt, firingStance || input.fire);
  }

  // Health slowly comes back when you are not hit for a while.
  regen(dt) {
    if (!this.dead && this.health < 100 && this.game.time - this.lastHurt > 6) this.health = Math.min(100, this.health + 6 * dt);
  }

  fire() {
    const g = this.game, w = this.weaponDef, a = this.ammo[this.weapon];
    if (this.cooldown > 0 || this.reloadT > 0) return;
    if (a.mag <= 0) { if (a.reserve > 0) this.reload(); else g.audio.click(); this.cooldown = 0.3; return; }
    a.mag--;
    this.cooldown = w.rate;
    this.lastShot = g.time;

    // Aim from the camera through the centre of the screen (the crosshair).
    const cam = g.camera;
    cam.getWorldDirection(_dir);
    const moving = Math.hypot(this.vx, this.vz) > 1;
    const spread = w.spread * (this.aiming ? 0.5 : 1.4) * (moving ? 1.6 : 1) * (this.crouching ? 0.7 : 1) + g.camera3p.recoil * 0.02;
    _dir.x += (Math.random() - 0.5) * spread * 2; _dir.y += (Math.random() - 0.5) * spread * 2; _dir.z += (Math.random() - 0.5) * spread * 2;
    _dir.normalize();
    // Start the ray just past Vikram so he never shoots himself.
    const startAt = Math.max(0, (this.x - cam.position.x) * _dir.x + (this.y + 1.4 - cam.position.y) * _dir.y + (this.z - cam.position.z) * _dir.z) + 0.6;
    const hit = castShot(g, cam.position, _dir, w.range, this, startAt);

    // Muzzle position from the gun model.
    this.rig.handPose(_hp, _hd);
    _muz.copy(_hp).addScaledVector(_dir, w.muzzle + 0.05);
    _muz.y += 0.04;
    g.fx.muzzle(_muz);
    g.fx.tracer(_muz, hit.point, 1);
    g.audio.gunshot(this.weapon, 1);
    g.camera3p.kick(this.weapon === 'smg' ? 0.5 : 1);

    if (hit.kind === 'human') {
      const dmg = w.damage * (hit.head ? 2.5 : 1);
      hit.target.takeDamage(dmg, true, this.x, this.z);
      g.fx.hitPerson(hit.point);
      g.hud.hitMarker(hit.target.dead);
    } else if (hit.kind === 'car') {
      hit.target.takeDamage(w.damage * 0.35);
      g.fx.impact(hit.point, _dir.clone().negate(), true);
      g.audio.ping();
    } else if (hit.t < w.range) {
      g.fx.impact(hit.point, _dir.clone().negate(), false);
    }
    g.dispatch.crime('gunfire', this.x, this.z);
    g.alarm(this.x, this.z, 35);
    g.stats.shots++;
  }

  sync(dt = 0, holdingGun = false) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
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

// Over-the-shoulder camera, aim zoom, recoil kick, crash shake, and a chase camera for cars.
export class ThirdPersonCamera {
  constructor(game, camera) {
    this.game = game; this.cam = camera;
    this.yaw = 0; this.pitch = 10 * DEG;
    this.dist = 3.4; this.aimBlend = 0; this.pivotH = 1.55;
    this.sensitivity = 1; this.aimSensitivity = 0.6; this.invert = false;
    this.recoil = 0; this.shakeT = 0; this.carLookT = 0;
  }

  snapBehind() { this.yaw = this.game.player.yaw; this.pitch = 10 * DEG; }
  kick(k) { this.recoil = Math.min(3, this.recoil + k); this.pitch -= 0.9 * DEG * k; this.yaw += (Math.random() - 0.5) * 0.5 * DEG * k; }
  shake(k) { this.shakeT = Math.max(this.shakeT, 0.35 * k); }

  update(dt, look) {
    const P = this.game.player, W = this.game.world;
    const firing = this.game.time - P.lastShot < 0.8;
    this.aimBlend = moveTowards(this.aimBlend, P.aiming && !P.inCar ? 1 : 0, 6 * dt);
    this.recoil = Math.max(0, this.recoil - dt * 4);

    const k = 0.12 * DEG * this.sensitivity * lerp(1, this.aimSensitivity, this.aimBlend);
    this.yaw -= look.x * k;
    this.pitch += (this.invert ? -look.y : look.y) * k;

    let px, py, pz, wantDist, wantShoulder, fovBase;
    if (P.inCar && this.game.driving.car) {
      // Chase camera: swings behind the car unless you are looking around.
      const car = this.game.driving.car, sp = this.game.driving.speed;
      if (Math.abs(look.x) + Math.abs(look.y) > 0.5) this.carLookT = 1.6;
      this.carLookT -= dt;
      if (this.carLookT <= 0 && sp > 1) {
        const behind = car.yaw + (this.game.driving.vx * Math.sin(car.yaw) + this.game.driving.vz * Math.cos(car.yaw) < -0.5 ? Math.PI : 0);
        const d = Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw));
        this.yaw += d * Math.min(1, dt * 3);
        this.pitch = lerp(this.pitch, 12 * DEG, dt * 2);
      }
      px = car.x; py = 1.6; pz = car.z;
      wantDist = (this.game.carCamFar ? 9 : 6.2) + Math.min(3, sp * 0.08);
      wantShoulder = 0;
      fovBase = 62 + Math.min(14, sp * 0.45);
    } else {
      const wantH = P.crouching ? 1.05 : 1.55;
      this.pivotH = lerp(this.pivotH, wantH, 1 - Math.exp(-10 * dt));
      px = P.x; py = P.y + this.pivotH; pz = P.z;
      wantDist = lerp(firing ? 2.6 : 3.4, 1.45, this.aimBlend);
      wantShoulder = lerp(firing ? 0.6 : 0.5, 0.65, this.aimBlend);
      fovBase = lerp(P.sprinting ? 66 : 60, 42, this.aimBlend);
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
