// Player driving: steal any car (or a police SUV!), drive with realistic-feeling physics.
// - Engine, brakes, reverse, grip on the tyres, HANDBRAKE drifts.
// - Crashes into walls and cars cost speed and damage; a wrecked car smokes and dies.
// - Indian cars are right-hand drive: you get out on the right side.
import * as THREE from 'three';
import { AmbientPerson } from './ambient.js';
import { dist, clamp, moveTowards, pushOutOfBox } from './util.js';

const SPEC = {
  hatchback: { accel: 7.5, top: 30, grip: 9, wheelBase: 2.4, mass: 1 },
  sedan: { accel: 8.5, top: 34, grip: 9, wheelBase: 2.7, mass: 1.1 },
  suv: { accel: 8, top: 32, grip: 8, wheelBase: 2.8, mass: 1.35 },
  police: { accel: 9.5, top: 37, grip: 9.5, wheelBase: 2.8, mass: 1.35 },
  auto: { accel: 4.5, top: 17, grip: 7, wheelBase: 1.9, mass: 0.6 },
};

export class Driving {
  constructor(game) {
    this.game = game;
    this.car = null;
    this.vx = 0; this.vz = 0; this.steer = 0;
    this.crashCooldown = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get kmh() { return Math.round(this.speed * 3.6); }

  // Car the player could get into (within reach of a door).
  nearestCar(px, pz) {
    let best = null, bd = Infinity;
    for (const c of this.game.cars) {
      if (c.inactive) continue;
      const d = dist(px, pz, c.x, c.z) - c.halfL;
      if (d < 1.6 && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enter(car) {
    const g = this.game, P = g.player;
    this.car = car;
    const parked = car.parked;
    car.playerControlled = true;
    car.parked = false;
    car.pursuing = false; car.hold = false; car.direct = null; car.upcoming = [];
    if (car.setLights) car.setLights(false, false);
    this.vx = Math.sin(car.yaw) * car.speed; this.vz = Math.cos(car.yaw) * car.speed;
    this.steer = 0;
    this.spec = SPEC[car.type] || SPEC.sedan;
    P.inCar = true; P.mesh.visible = false; P.gunMesh.visible = false;
    P.aiming = false; P.crouching = false;

    // The driver jumps out and runs (unless the car was parked / is a mission car).
    if (!parked && !car.missionCar) {
      const rx = -Math.cos(car.yaw), rz = Math.sin(car.yaw);
      const d = new AmbientPerson(g, car.x + rx * (car.halfW + 0.8), car.z + rz * (car.halfW + 0.8), car.yaw, { flee: true, fromX: P.x, fromZ: P.z });
      if (car.isPolice) d.rig.root.visible = false;   // police crew is handled by the police code
      g.ambient.push(d);
      g.dispatch.crime(car.isPolice ? 'steal_police' : 'carjack', car.x, car.z);
    }
    g.audio.engine(true);
    if (g.mission && g.mission.onEnterCar) g.mission.onEnterCar(car);
  }

  exit() {
    const g = this.game, P = g.player, car = this.car;
    if (!car) return;
    // Right-hand drive: try the right side first, then the left.
    for (const side of [1, -1]) {
      const rx = -Math.cos(car.yaw) * side, rz = Math.sin(car.yaw) * side;
      const test = { x: car.x + rx * (car.halfW + 0.75), z: car.z + rz * (car.halfW + 0.75) };
      const before = { ...test };
      g.world.resolveCircle(test, 0.4);
      if (dist(before.x, before.z, test.x, test.z) < 0.3 || side === -1) { P.x = test.x; P.z = test.z; break; }
    }
    P.y = g.world.groundAt(P.x, P.z);
    P.yaw = car.yaw;
    P.inCar = false; P.mesh.visible = true;
    car.playerControlled = false; car.parked = true; car.speed = 0;
    this.car = null;
    g.audio.engine(false);
    g.camera3p.snapBehind();
  }

  update(dt, input) {
    const car = this.car, g = this.game;
    if (!car) return;
    const s = this.spec;
    const dead = car.wrecked;

    // Inputs: joystick X = steering; GAS / BRAKE buttons (or joystick up/down as a fallback).
    let throttle = input.gas ? 1 : 0, brake = input.brake ? 1 : 0;
    if (!input.gas && !input.brake) { if (input.move.y > 0.3) throttle = input.move.y; if (input.move.y < -0.3) brake = -input.move.y; }
    if (dead) throttle = 0;
    const steerIn = clamp(input.move.x, -1, 1);
    const hand = input.handbrake;

    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;

    // Engine / brakes / reverse.
    if (throttle > 0) {
      if (vF < -0.5) vF += 14 * throttle * dt;
      else vF += s.accel * throttle * Math.max(0, 1 - vF / s.top) * dt;
    }
    if (brake > 0) {
      if (vF > 0.5) vF -= 16 * brake * dt;
      else vF = Math.max(-7, vF - 5 * brake * dt);
    }
    // Rolling resistance + air drag.
    vF -= vF * 0.12 * dt + Math.sign(vF) * (throttle + brake === 0 ? 1.4 : 0.3) * dt;
    if (Math.abs(vF) < 0.05 && throttle + brake === 0) vF = 0;
    if (hand) vF = moveTowards(vF, 0, 6 * dt);

    // Steering: less steering angle at high speed (stable on the highway).
    const maxSteer = 0.62 / (1 + Math.abs(vF) / 14);
    this.steer = moveTowards(this.steer, steerIn * maxSteer, 3.2 * dt);
    const yawRate = (vF / s.wheelBase) * Math.tan(this.steer) * (hand ? 1.45 : 1);
    car.yaw += yawRate * dt;

    // Tyre grip kills sideways sliding; the handbrake lets the back slide (drift).
    vL *= Math.exp(-(hand ? 1.3 : s.grip) * dt);

    const nfx = Math.sin(car.yaw), nfz = Math.cos(car.yaw), nrx = -nfz, nrz = nfx;
    this.vx = nfx * vF + nrx * vL;
    this.vz = nfz * vF + nrz * vL;
    car.x += this.vx * dt;
    car.z += this.vz * dt;
    car.speed = Math.abs(vF);

    this.collide(dt);
    car.syncMesh();
    car.mesh.rotation.z = -vL * 0.012;   // a little body roll when sliding

    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    g.audio.engineLevel(Math.abs(vF) / s.top, throttle);
    if (input.horn) g.audio.horn(1);
  }

  // Walls, other cars, people.
  collide(dt) {
    const g = this.game, car = this.car;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const r = car.halfW + 0.05;
    let pushX = 0, pushZ = 0;
    for (const k of [-0.62, 0, 0.62]) {
      const c = { x: car.x + fx * car.halfL * k, z: car.z + fz * car.halfL * k };
      const bx = c.x, bz = c.z;
      g.world.resolveCircle(c, r);
      for (const o of g.cars) {
        if (o === car || o.inactive) continue;
        if (dist(c.x, c.z, o.x, o.z) > 6) continue;
        const ox = c.x, oz = c.z;
        if (pushOutOfBox(c, r, o.x, o.z, o.yaw, o.halfL, o.halfW)) {
          // Shove the other car a little and stop it.
          o.x -= (c.x - ox) * 0.35; o.z -= (c.z - oz) * 0.35; o.speed = 0; o.syncMesh();
          if (this.speed > 6) o.takeDamage(this.speed * 1.5);
        }
      }
      pushX += c.x - bx; pushZ += c.z - bz;
    }
    const pl = Math.hypot(pushX, pushZ);
    if (pl > 0.0001) {
      car.x += pushX / 3; car.z += pushZ / 3;
      const nx = pushX / pl, nz = pushZ / pl;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        // Bounce a little, lose speed, take damage on hard hits.
        this.vx -= 1.25 * vn * nx; this.vz -= 1.25 * vn * nz;
        this.vx *= 0.8; this.vz *= 0.8;
        if (-vn > 4 && this.crashCooldown <= 0) {
          car.takeDamage(-vn * 2.2 / this.spec.mass);
          g.audio.crash(Math.min(1, -vn / 15));
          g.camera3p.shake(Math.min(1, -vn / 12));
          this.crashCooldown = 0.4;
        }
      }
    }
    // People in the way: they dive aside if they can; at speed, they get hit.
    const sp = this.speed;
    for (const h of g.humans()) {
      if (h.dead || h.isRavi) continue;
      const d = dist(car.x, car.z, h.x, h.z);
      if (d > car.halfL + 2) continue;
      const along = (h.x - car.x) * fx + (h.z - car.z) * fz;
      const lat = Math.abs((h.x - car.x) * -fz + (h.z - car.z) * fx);
      if (lat < car.halfW + 0.3 && Math.abs(along) < car.halfL + 0.3) {
        if (sp > 4) {
          h.takeDamage(sp * 6, true, car.x, car.z);
          if (h.dead) g.dispatch.crime(h.isOfficer ? 'kill_cop' : 'run_over', h.x, h.z);
          this.vx *= 0.9; this.vz *= 0.9;
        } else {
          pushOutOfBox(h, 0.3, car.x, car.z, car.yaw, car.halfL, car.halfW);
        }
      } else if (along > 0 && along < 10 && lat < 2.5 && sp > 5 && h.panicFrom) h.panicFrom(car.x, car.z);
    }
  }
}
