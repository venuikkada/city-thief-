// Vikram on foot (port of the Unity PlayerMotor) and the third-person camera.
import * as THREE from 'three';
import { clamp, lerp, moveTowards, rotateTowards, yawOf, DEG, pushOutOfBox } from './util.js';

export class Player {
  constructor(game, x, z, yaw) {
    this.game = game;
    this.spawn = { x, z, yaw };
    this.x = x; this.z = z; this.y = game.world.groundAt(x, z); this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.35; this.rLong = 0.35; this.rLat = 0.35;
    this.grounded = true; this.crouching = false; this.sprinting = false; this.aiming = false;
    this.controlsEnabled = true;
    this.height = 1.8;
    this.lastGrounded = 0; this.lastJumpPress = -99;

    // Speeds (metres per second), same as Unity.
    this.runSpeed = 4.6; this.sprintSpeed = 6.8; this.crouchSpeed = 1.7; this.aimSpeed = 2.4;
    this.accel = 16; this.decel = 24;

    const mat = new THREE.MeshLambertMaterial({ color: 0x2659d9 });
    this.mesh = new THREE.Group();
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 1.14, 4, 10), mat);
    this.body.position.y = 0.9;
    this.body.castShadow = !game.lowQuality;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshLambertMaterial({ color: 0x8c6145 }));
    head.position.y = 1.0;
    this.body.add(head);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.35), new THREE.MeshLambertMaterial({ color: 0xffd126 }));
    nose.position.set(0, 0.45, 0.3);
    this.body.add(nose);
    this.mesh.add(this.body);
    game.scene.add(this.mesh);
    this.sync();
  }

  respawn() {
    this.x = this.spawn.x; this.z = this.spawn.z; this.yaw = this.spawn.yaw;
    this.vx = this.vz = this.vy = 0;
    this.crouching = false; this.aiming = false;
    this.game.camera3p.snapBehind();
  }

  update(dt, input, camYaw) {
    const t = this.game.time;
    const on = this.controlsEnabled;
    const move = on ? input.move : { x: 0, y: 0 };
    const strength = Math.min(1, Math.hypot(move.x, move.y));

    if (on && input.aimPressed) this.aiming = !this.aiming;
    if (on && input.crouchPressed) this.crouching = !this.crouching;

    let wantSprint = on && input.sprint && strength > 0.5 && !this.aiming;
    if (wantSprint && this.crouching) this.crouching = false;   // sprint makes you stand (like PUBG)
    this.sprinting = wantSprint;

    // Camera-relative direction. Forward = (sin, cos), right = (-cos, sin).
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let wx = fx * move.y + rx * move.x, wz = fz * move.y + rz * move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) { wx /= wl; wz /= wl; }

    const max = this.crouching ? this.crouchSpeed : this.aiming ? this.aimSpeed : this.runSpeed;
    const target = this.sprinting ? this.sprintSpeed : max * strength;
    const tvx = wx * target, tvz = wz * target;
    const speedingUp = tvx * tvx + tvz * tvz > this.vx * this.vx + this.vz * this.vz;
    let rate = (speedingUp ? this.accel : this.decel) * (this.grounded ? 1 : 0.35);
    // Move the velocity towards the target velocity.
    const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
    if (dl <= rate * dt) { this.vx = tvx; this.vz = tvz; }
    else { this.vx += (dvx / dl) * rate * dt; this.vz += (dvz / dl) * rate * dt; }

    // Jump (with a little forgiveness before landing and after leaving an edge).
    if (this.grounded) this.lastGrounded = t;
    if (on && input.jumpPressed) this.lastJumpPress = t;
    if (t - this.lastJumpPress <= 0.12 && t - this.lastGrounded <= 0.12) {
      this.lastJumpPress = -99;
      if (this.crouching) this.crouching = false;
      else { this.vy = Math.sqrt(2 * 1.1 * 22); this.lastGrounded = -99; this.grounded = false; }
    }

    // Move + gravity.
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vy = Math.max(this.vy - 22 * dt, -40);
    this.y += this.vy * dt;

    // Collisions: buildings, cars, people, officers.
    const g = this.game;
    g.world.resolveCircle(this, this.radius);
    for (const c of g.cars) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
    for (const o of g.walkers) {
      if (o === this || o.inactive) continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 0.0001) { this.x += (dx / d) * (min - d); this.z += (dz / d) * (min - d); }
    }

    // Ground: footpaths are a small step up (taken automatically).
    const ground = g.world.groundAt(this.x, this.z);
    if (this.y <= ground) { this.y = ground; if (this.vy < 0) this.vy = 0; this.grounded = true; }
    else this.grounded = this.y - ground < 0.02 && this.vy <= 0;

    // Face where you move, or where the camera looks while aiming.
    let face = null;
    if (this.aiming) face = camYaw;
    else if (strength > 0.1) face = yawOf(wx, wz);
    if (face !== null) this.yaw = rotateTowards(this.yaw, face, (this.aiming ? 1080 : 720) * DEG * dt);

    this.height = moveTowards(this.height, this.crouching ? 1.15 : 1.8, 5 * dt);
    this.sync();
  }

  sync() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    const k = this.height / 1.8;
    this.body.scale.y = k;
    this.body.position.y = 0.9 * k;
  }
}

// Over-the-shoulder camera: drag to turn, AIM zooms over the right shoulder,
// wider view when sprinting, never goes inside buildings.
export class ThirdPersonCamera {
  constructor(game, camera) {
    this.game = game; this.cam = camera;
    this.yaw = 0; this.pitch = 10 * DEG;
    this.dist = 3.4; this.aimBlend = 0; this.pivotH = 1.55;
    this.sensitivity = 1;
  }

  snapBehind() { this.yaw = this.game.player.yaw; this.pitch = 10 * DEG; }

  update(dt, look) {
    const P = this.game.player;
    this.aimBlend = moveTowards(this.aimBlend, P.aiming ? 1 : 0, 6 * dt);

    const k = 0.12 * DEG * this.sensitivity * lerp(1, 0.6, this.aimBlend);
    this.yaw -= look.x * k;     // drag right = turn right
    this.pitch += look.y * k;   // drag down = look down
    this.pitch = clamp(this.pitch, -40 * DEG, 65 * DEG);

    const wantH = P.crouching ? 1.05 : 1.55;
    this.pivotH = lerp(this.pivotH, wantH, 1 - Math.exp(-10 * dt));
    const px = P.x, py = P.y + this.pivotH, pz = P.z;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dx = fx * cp, dy = -sp, dz = fz * cp;     // look direction
    const rx = -fz, rz = fx;                         // camera right

    const W = this.game.world;
    const wantShoulder = lerp(0.5, 0.65, this.aimBlend);
    const side = Math.max(0, W.rayCast(px, py, pz, rx, 0, rz, wantShoulder + 0.22) - 0.22);
    const shoulder = Math.min(wantShoulder, side);
    const sx = px + rx * shoulder, sz = pz + rz * shoulder;

    const wantDist = lerp(3.4, 1.5, this.aimBlend);
    const hit = W.rayCast(sx, py, sz, -dx, -dy, -dz, wantDist + 0.22);
    const allowed = Math.max(0.4, Math.min(wantDist, hit - 0.22));
    this.dist = allowed < this.dist ? allowed : lerp(this.dist, allowed, 1 - Math.exp(-6 * dt));

    this.cam.position.set(sx - dx * this.dist, py - dy * this.dist, sz - dz * this.dist);
    this.cam.lookAt(this.cam.position.x + dx, this.cam.position.y + dy, this.cam.position.z + dz);

    const fov = lerp(P.sprinting ? 66 : 60, 42, this.aimBlend);
    if (Math.abs(this.cam.fov - fov) > 0.05) {
      this.cam.fov = lerp(this.cam.fov, fov, 1 - Math.exp(-8 * dt));
      this.cam.updateProjectionMatrix();
    }
  }
}
