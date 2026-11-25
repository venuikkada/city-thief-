// Player driving, PUBG-style: steal any car (or a police SUV!) and drive.
// Controls (phone):
//   JOYSTICK mode (default): push up = gas (harder = faster), pull down = brake / reverse, left-right = steer.
//   BUTTONS mode (Settings): left/right arrows to steer, GAS and BRAKE buttons.
//   Always: BOOST (nitro), DRIFT (handbrake), HORN, camera button, EXIT. Drag the right side to look around.
// Physics: engine, brakes, reverse, tyre grip, speed-sensitive steering that centres itself,
// anti-spin help, drifts, crashes (damage), spike strips (burst tyres), police ramming.
// Indian cars are right-hand drive: you get out on the right side.
import { AmbientPerson } from './ambient.js';
import { dist, clamp, moveTowards, pushOutOfBox } from './util.js';

const SPEC = {
  hatchback: { accel: 8, top: 31, grip: 9, wheelBase: 2.4, mass: 1, lat: 15 },
  sedan: { accel: 9, top: 35, grip: 9, wheelBase: 2.7, mass: 1.1, lat: 15.5 },
  suv: { accel: 8.5, top: 33, grip: 8.5, wheelBase: 2.8, mass: 1.35, lat: 14 },
  police: { accel: 10, top: 38, grip: 9.5, wheelBase: 2.8, mass: 1.35, lat: 16 },
  auto: { accel: 5, top: 18, grip: 7, wheelBase: 1.9, mass: 0.6, lat: 11 },
};

export class Driving {
  constructor(game) {
    this.game = game;
    this.car = null;
    this.vx = 0; this.vz = 0; this.steer = 0;
    this.crashCooldown = 0; this.ramCooldown = 0;
    this.nitro = 1; this.boosting = false; this.mode = 'joystick';
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get kmh() { return Math.round(this.speed * 3.6); }

  // Car the player could get into (within reach of a door).
  nearestCar(px, pz) {
    let best = null, bd = Infinity;
    for (const c of this.game.cars) {
      if (c.inactive) continue;
      if (Math.abs(c.x - px) > 8 || Math.abs(c.z - pz) > 8) continue;
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
    if (g.controls.sprintLock) g.controls.cancelSprintLock();

    // The driver jumps out and runs (unless the car was parked / is a mission car).
    if (!parked && !car.missionCar) {
      const rx = -Math.cos(car.yaw), rz = Math.sin(car.yaw);
      const d = new AmbientPerson(g, car.x + rx * (car.halfW + 0.8), car.z + rz * (car.halfW + 0.8), car.yaw, { flee: true, fromX: P.x, fromZ: P.z });
      if (car.isPolice) d.rig.root.visible = false;   // police crew is handled by the police code
      d.temp = true;
      g.ambient.push(d);
      g.dispatch.crime(car.isPolice ? 'steal_police' : 'carjack', car.x, car.z);
    }
    if (car !== this.lastCar) g.dispatch.newCar();
    this.lastCar = car;
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
    this.car = null; this.boosting = false;
    g.audio.engine(false);
    g.camera3p.snapBehind();
  }

  // Spike strip: tyres burst - slow and slidey from now on.
  burstTyres() {
    const car = this.car;
    if (!car || car.spiked) return;
    car.spiked = true;
    car.takeDamage(10);
    this.game.hud.showBig('TYRES BURST!', '#ff4438', 2);
    this.game.audio.crash(0.6);
    this.game.camera3p.shake(0.8);
  }

  update(dt, input) {
    const car = this.car, g = this.game;
    if (!car) return;
    const s = this.spec;
    const dead = car.wrecked;

    // ---- Inputs ----
    let throttle = 0, brake = 0, steerIn = 0;
    if (this.mode === 'buttons') {
      throttle = input.gas ? 1 : 0; brake = input.brake ? 1 : 0;
      steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (!steerIn) steerIn = clamp(input.move.x, -1, 1);
    } else {
      const y = input.move.y;
      if (y > 0.12) throttle = Math.min(1, (y - 0.12) / 0.6);
      if (y < -0.25) brake = Math.min(1, (-y - 0.25) / 0.5);
      steerIn = clamp(input.move.x, -1, 1);
      if (input.gas) throttle = 1;
      if (input.brake) brake = 1;
    }
    if (input.left || input.right) steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dead) throttle = 0;
    const hand = input.handbrake;
    this.boosting = !dead && input.boost && this.nitro > 0.02 && throttle > 0;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - 0.28 * dt);
    else this.nitro = Math.min(1, this.nitro + 0.07 * dt);

    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;

    // ---- Engine / brakes / reverse ----
    const spikes = car.spiked ? 0.5 : 1;
    const top = s.top * (this.boosting ? 1.3 : 1) * spikes;
    const accel = s.accel * (this.boosting ? 1.9 : 1) * spikes;
    if (throttle > 0) {
      if (vF < -0.5) vF += 16 * throttle * dt;
      else vF += accel * throttle * Math.max(0, 1 - vF / top) * dt;
    }
    if (brake > 0) {
      if (vF > 0.5) vF -= 18 * brake * dt;
      else vF = Math.max(-8, vF - 6 * brake * dt);
    }
    // Rolling resistance + air drag.
    vF -= vF * 0.1 * dt + Math.sign(vF) * (throttle + brake === 0 ? 1.6 : 0.3) * dt;
    if (Math.abs(vF) < 0.05 && throttle + brake === 0) vF = 0;
    if (vF > top) vF = moveTowards(vF, top, 6 * dt);
    if (hand) vF = moveTowards(vF, 0, 5 * dt);

    // ---- Steering ----
    // Less wheel angle at speed; the wheel centres itself fast when you let go.
    const maxSteer = 0.6 / (1 + Math.abs(vF) / 16);
    const wantSteer = steerIn * maxSteer;
    const centring = steerIn === 0 || Math.sign(steerIn) !== Math.sign(this.steer);
    this.steer = moveTowards(this.steer, wantSteer, (centring ? 6 : 3.4) * dt);
    let yawRate = (vF / s.wheelBase) * Math.tan(this.steer);
    // Tyres can only grip so much: limit the turn at high speed (no spinning out), more with the handbrake.
    const latMax = (hand ? s.lat * 1.6 : s.lat) * (car.spiked ? 0.6 : 1);
    const maxRate = latMax / Math.max(4, Math.abs(vF));
    yawRate = clamp(yawRate, -maxRate, maxRate) * (hand ? 1.35 : 1);
    car.yaw += yawRate * dt;

    // Tyre grip kills sideways sliding; the handbrake lets the back slide (drift).
    vL *= Math.exp(-(hand ? 1.4 : s.grip * (car.spiked ? 0.55 : 1)) * dt);

    const nfx = Math.sin(car.yaw), nfz = Math.cos(car.yaw), nrx = -nfz, nrz = nfx;
    this.vx = nfx * vF + nrx * vL;
    this.vz = nfz * vF + nrz * vL;
    car.x += this.vx * dt;
    car.z += this.vz * dt;
    car.speed = Math.abs(vF);

    this.collide(dt);
    car.syncMesh();
    car.mesh.rotation.z = -vL * 0.012 - yawRate * Math.abs(vF) * 0.0025;   // body roll in turns and slides

    // Nitro flames, sparks from burst tyres.
    if (this.boosting || car.spiked) {
      this.fxT = (this.fxT || 0) - dt;
      if (this.fxT <= 0) {
        this.fxT = 0.03;
        const bx = car.x - nfx * (car.halfL + 0.1), bz = car.z - nfz * (car.halfL + 0.1);
        if (this.boosting) g.fx.flame(bx, 0.45, bz, -nfx, -nfz);
        if (car.spiked && Math.abs(vF) > 3) g.fx.tyreSparks(car.x + nfx * car.halfL * 0.6 + nrx * car.halfW, 0.2, car.z + nfz * car.halfL * 0.6 + nrz * car.halfW);
      }
    }

    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    g.audio.engineLevel(Math.abs(vF) / s.top, Math.max(throttle, this.boosting ? 1.4 : 0));
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
        if (Math.abs(c.x - o.x) > 6 || Math.abs(c.z - o.z) > 6) continue;
        const ox = c.x, oz = c.z;
        if (pushOutOfBox(c, r, o.x, o.z, o.yaw, o.halfL, o.halfW)) {
          // Shove the other car a little and stop it.
          const heavy = o.roadblock ? 0.15 : 0.35;
          o.x -= (c.x - ox) * heavy; o.z -= (c.z - oz) * heavy; o.syncMesh();
          if (o.isPolice && o.pursuing && o.speed > 5 && this.ramCooldown <= 0) {
            // Police ramming: a hard knock sideways.
            this.ramCooldown = 0.8;
            this.vx += Math.sin(o.yaw) * o.speed * 0.35; this.vz += Math.cos(o.yaw) * o.speed * 0.35;
            car.takeDamage(o.speed * 0.5 / this.spec.mass);
            g.audio.crash(0.7); g.camera3p.shake(0.7);
            o.speed *= 0.3;
          } else o.speed = 0;
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
        this.vx *= 0.82; this.vz *= 0.82;
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
      if (Math.abs(h.x - car.x) > car.halfL + 12 || Math.abs(h.z - car.z) > car.halfL + 12) continue;
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
