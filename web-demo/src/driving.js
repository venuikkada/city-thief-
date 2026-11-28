// Player driving: steal any car (or a police SUV!) and drive.
// Controls (phone):
//   BUTTONS mode (default): left/right arrows steer, the up arrow is GAS, the down arrow is BRAKE / reverse.
//   JOYSTICK mode (Settings or the small switch button): up = gas, down = brake, left-right = steer.
//   Always: BOOST (nitro), DRIFT (handbrake), FIRE (shoot from the window), HORN, camera, EXIT.
// Physics: engine, brakes, reverse, tyre grip, speed-sensitive steering that centres itself,
// anti-spin help, drifts, kerbs, ramps and jumps, crashes, burst tyres, police ramming, cars on fire.
// Bonus cash: drifts, near misses, stunt jumps.
// Indian cars are right-hand drive: you get out on the right side.
import { AmbientPerson } from './ambient.js';
import { dist, clamp, moveTowards, pushOutOfBox } from './util.js';

const SPEC = {
  hatchback: { accel: 8, top: 31, grip: 9, wheelBase: 2.4, mass: 1, lat: 15 },
  sedan: { accel: 9, top: 35, grip: 9, wheelBase: 2.7, mass: 1.1, lat: 15.5 },
  suv: { accel: 8.5, top: 33, grip: 8.5, wheelBase: 2.8, mass: 1.35, lat: 14 },
  police: { accel: 10, top: 38, grip: 9.5, wheelBase: 2.8, mass: 1.35, lat: 16 },
  sports: { accel: 12, top: 43, grip: 10, wheelBase: 2.6, mass: 1.05, lat: 17 },
  auto: { accel: 5, top: 18, grip: 7, wheelBase: 1.9, mass: 0.6, lat: 11 },
  taxi: { accel: 8, top: 31, grip: 8.5, wheelBase: 2.6, mass: 1.05, lat: 14.5 },
  van: { accel: 7, top: 29, grip: 8, wheelBase: 3.1, mass: 1.5, lat: 13 },
  ambulance: { accel: 8, top: 33, grip: 8.5, wheelBase: 3.2, mass: 1.6, lat: 13.5 },
  truck: { accel: 5, top: 25, grip: 7.5, wheelBase: 4.8, mass: 3.2, lat: 11 },
  bus: { accel: 4.5, top: 24, grip: 7.5, wheelBase: 6.5, mass: 4, lat: 10.5 },
  boat: { accel: 7.5, top: 23, grip: 2.4, wheelBase: 3.2, mass: 1.3, lat: 10 },
};
const GRAVITY = 18;

export class Driving {
  constructor(game) {
    this.game = game;
    this.car = null;
    this.vx = 0; this.vz = 0; this.vy = 0; this.steer = 0;
    this.crashCooldown = 0; this.ramCooldown = 0;
    this.nitro = 1; this.boosting = false; this.mode = 'buttons';
    this.air = false; this.airT = 0;
    this.driftPts = 0; this.driftT = 0; this.driftIdle = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get kmh() { return Math.round(this.speed * 3.6); }

  // Car the player could get into (within reach of a door).
  nearestCar(px, pz) {
    let best = null, bd = Infinity;
    for (const c of this.game.cars) {
      if (c.inactive || c.exploded || c.sinking) continue;
      if (Math.abs(c.x - px) > 8 || Math.abs(c.z - pz) > 8) continue;
      const d = dist(px, pz, c.x, c.z) - c.halfL;
      if (d < 1.6 && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enter(car) {
    const g = this.game, P = g.player;
    g.audio.carDoor();
    this.car = car;
    const parked = car.parked;
    car.playerControlled = true;
    car.parked = false;
    car.pursuing = false; car.hold = false; car.direct = null; car.upcoming = [];
    if (car.setLights) car.setLights(false, false);
    this.vx = Math.sin(car.yaw) * car.speed; this.vz = Math.cos(car.yaw) * car.speed; this.vy = 0;
    car.y = car.y || 0;
    car.mesh.rotation.order = 'YXZ';
    this.steer = 0; this.air = false; this.driftPts = 0;
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

  exit(force = false) {
    const g = this.game, P = g.player, car = this.car;
    if (!car || (this.air && !force)) return;
    const v = this.speed || 0;   // BAIL OUT at speed (v9.5): he tumbles out, the car rolls on and crashes
    this.bankDrift();
    // Right-hand drive: try the right side first, then the left.
    for (const side of [1, -1]) {
      const rx = -Math.cos(car.yaw) * side, rz = Math.sin(car.yaw) * side;
      const test = { x: car.x + rx * (car.halfW + 0.75), z: car.z + rz * (car.halfW + 0.75) };
      const before = { ...test };
      g.world.resolveCircle(test, 0.4);
      if (dist(before.x, before.z, test.x, test.z) < 0.3 || side === -1) { P.x = test.x; P.z = test.z; break; }
    }
    P.y = g.world.groundAt(P.x, P.z);
    P.yaw = car.yaw; P.speed = 0; P.vx = P.vz = 0;
    P.inCar = false; P.mesh.visible = true;
    car.playerControlled = false; car.parked = true; car.speed = 0;
    car.mesh.rotation.x = 0; car.mesh.rotation.z = 0;
    this.car = null; this.boosting = false; this.air = false;
    g.audio.carDoor(); g.audio.screech(0); g.audio.nitro(false);
    g.audio.engine(false);
    g.camera3p.snapBehind();
    // (not with a car the mission needs: it would roll away and crash)
    const needed = car.missionCar || car.isPolice || (g.mission && (g.mission.ents.includes(car) || Object.values(g.mission.vars).includes(car)));
    if (!force && v > 11 && !needed) {
      const side = dist(P.x, P.z, car.x - Math.cos(car.yaw) * 2, car.z + Math.sin(car.yaw) * 2) < dist(P.x, P.z, car.x + Math.cos(car.yaw) * 2, car.z - Math.sin(car.yaw) * 2) ? 1 : -1;
      const rx = -Math.cos(car.yaw) * side, rz = Math.sin(car.yaw) * side;
      P.vx = Math.sin(car.yaw) * v * 0.45 + rx * 3; P.vz = Math.cos(car.yaw) * v * 0.45 + rz * 3; P.speed = Math.hypot(P.vx, P.vz);
      P.rollT = 0.9; P.rollDir = side; P.aiming = false;
      P.takeDamage(Math.min(14, v * 0.6), car.x, car.z);
      g.slowmo(1.1, 0.3);
      g.hud.showBig('BAIL OUT!', '#ffc531', 1.4);
      if (g.rewards) g.rewards.event('BAIL OUT', 200, 10);
      car.coastV = v; this.coasting = (this.coasting || []).filter((c) => c !== car); this.coasting.push(car);
    }
    if (g.mission && g.mission.onExitCar) g.mission.onExitCar(car);
  }

  // A car he bailed out of rolls on by itself: it slows down, runs people over, and crashes into
  // walls and cars (a hard crash wrecks it: it burns, then blows up).
  coast(dt) {
    const g = this.game;
    if (!this.coasting || !this.coasting.length) return;
    for (const c of [...this.coasting]) {
      if (c.exploded || c.playerControlled || !(c.coastV > 0.6)) { c.coastV = 0; this.coasting = this.coasting.filter((x) => x !== c); continue; }
      const nx = c.x + Math.sin(c.yaw) * c.coastV * dt, nz = c.z + Math.cos(c.yaw) * c.coastV * dt;
      const t = { x: nx, z: nz };
      g.world.resolveCircle(t, c.halfW + 0.15, 0, true);
      let hit = dist(t.x, t.z, nx, nz) > 0.05;
      c.x = t.x; c.z = t.z;
      for (const o of g.cars) {
        if (o === c || o.exploded || Math.abs(o.x - c.x) > 5 || Math.abs(o.z - c.z) > 5) continue;
        if (dist(o.x, o.z, c.x, c.z) < (c.halfL + o.halfL) * 0.75) { hit = true; o.takeDamage(c.coastV * 9, true); }
      }
      for (const h of g.humans()) if (!h.dead && Math.abs(h.x - c.x) < 3 && Math.abs(h.z - c.z) < 3 && dist(h.x, h.z, c.x, c.z) < c.halfL) h.takeDamage(c.coastV * 14, true, c.x, c.z);
      if (hit) {
        c.takeDamage(c.coastV > 9 ? 999 : c.coastV * 12, true);
        g.camera3p.shake(Math.max(0, 0.6 - dist(c.x, c.z, g.camera.position.x, g.camera.position.z) / 60));
        g.audio.thump(1, 55, 0.35);
        c.coastV = 0;
      } else c.coastV *= Math.max(0, 1 - 0.3 * dt);
      c.syncMesh();
    }
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
    const car = this.car, g = this.game, W = g.world;
    if (!car) return;
    const s = this.spec;
    const dead = car.wrecked;
    if (dead && !this.fireWarned) { this.fireWarned = true; g.hud.showBig('CAR ON FIRE - GET OUT!', '#ff7a2a', 2.5); }
    if (!dead) this.fireWarned = false;

    // ---- Inputs ----
    let throttle = 0, brake = 0, steerIn = 0;
    if (this.mode === 'buttons') {
      throttle = input.gas ? 1 : 0; brake = input.brake ? 1 : 0;
      steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (!steerIn) steerIn = clamp(input.move.x, -1, 1);
      if (!throttle && !brake) { if (input.move.y > 0.3) throttle = input.move.y; if (input.move.y < -0.3) brake = -input.move.y; }
    } else {
      const y = input.move.y;
      if (y > 0.12) throttle = Math.min(1, (y - 0.12) / 0.6);
      if (y < -0.25) brake = Math.min(1, (-y - 0.25) / 0.5);
      steerIn = clamp(input.move.x, -1, 1);
      if (input.gas) throttle = 1;
      if (input.brake) brake = 1;
      if (input.left || input.right) steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    }
    if (dead || car.sinking) { throttle = 0; brake = 0; }
    if (g.raceHold) { throttle = 0; brake = 1; }   // waiting for the race to start
    const hand = input.handbrake;
    const drain = g.rewards && g.rewards.has('nitro') ? 0.14 : 0.28;
    this.boosting = !dead && !this.air && input.boost && this.nitro > 0.02 && throttle > 0;
    this.game.audio.nitro(this.boosting);
    if (this.boosting) this.nitro = Math.max(0, this.nitro - drain * dt);
    else this.nitro = Math.min(1, this.nitro + 0.07 * dt);

    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;
    let yawRate = 0;

    if (!this.air) {
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
      vF -= vF * 0.1 * dt + Math.sign(vF) * (throttle + brake === 0 ? 1.6 : 0.3) * dt;   // rolling + air drag
      if (Math.abs(vF) < 0.05 && throttle + brake === 0) vF = 0;
      if (vF > top) vF = moveTowards(vF, top, 6 * dt);
      if (hand) vF = moveTowards(vF, 0, 5 * dt);

      // ---- Steering: less wheel angle at speed; centres itself fast when you let go ----
      const maxSteer = 0.6 / (1 + Math.abs(vF) / 16);
      const centring = steerIn === 0 || Math.sign(steerIn) !== Math.sign(this.steer);
      this.steer = moveTowards(this.steer, steerIn * maxSteer, (centring ? 6 : 3.4) * dt);
      yawRate = (vF / s.wheelBase) * Math.tan(this.steer);
      // Tyres only grip so much: limit the turn at high speed (no spinning out), more with the handbrake.
      const latMax = (hand ? s.lat * 1.6 : s.lat) * (car.spiked ? 0.6 : 1);
      const maxRate = latMax / Math.max(4, Math.abs(vF));
      yawRate = clamp(yawRate, -maxRate, maxRate) * (hand ? 1.35 : 1);
      // (+x is on the car's LEFT in this world: steering right makes the heading angle smaller.)
      car.yaw -= yawRate * dt;
      // Grip kills sideways sliding; the handbrake lets the back slide (drift).
      vL *= Math.exp(-(hand ? 1.4 : s.grip * (car.spiked ? 0.55 : 1)) * dt);
    }

    const nfx = Math.sin(car.yaw), nfz = Math.cos(car.yaw), nrx = -nfz, nrz = nfx;
    this.vx = nfx * vF + nrx * vL;
    this.vz = nfz * vF + nrz * vL;
    car.x += this.vx * dt;
    car.z += this.vz * dt;
    car.speed = Math.abs(vF);

    this.vertical(dt, vF);
    this.collide(dt);
    this.scoring(dt, vF, vL);
    car.syncMesh();
    // Body: pitch with the jump, roll in turns and slides.
    car.mesh.rotation.x = this.air ? -Math.atan2(this.vy, Math.max(4, Math.abs(vF))) * 0.6 : car.mesh.rotation.x * 0.8;
    car.mesh.rotation.z = -vL * 0.012 + yawRate * Math.abs(vF) * 0.0025;

    // Nitro flames, sparks from burst tyres.
    if (this.boosting || car.spiked) {
      this.fxT = (this.fxT || 0) - dt;
      if (this.fxT <= 0) {
        this.fxT = 0.03;
        const bx = car.x - nfx * (car.halfL + 0.1), bz = car.z - nfz * (car.halfL + 0.1);
        if (this.boosting) g.fx.flame(bx, 0.45 + car.y, bz, -nfx, -nfz);
        if (car.spiked && Math.abs(vF) > 3) g.fx.tyreSparks(car.x + nfx * car.halfL * 0.6 + nrx * car.halfW, 0.2 + car.y, car.z + nfz * car.halfL * 0.6 + nrz * car.halfW);
      }
    }

    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    g.audio.engineLevel(Math.abs(vF) / s.top, Math.max(throttle, this.boosting ? 1.4 : 0));
    if (input.horn) g.audio.horn(1, true);   // your own horn (not limited like the traffic's)
  }

  // Kerbs, ramps, jumps, landing; water at the beach. Boats float on the flood.
  vertical(dt, vF) {
    const g = this.game, W = g.world, car = this.car;
    const flood = g.atmo && g.atmo.floodLevel != null ? g.atmo.floodLevel : null;
    if (car.type === 'boat') {
      const water = flood ?? -0.55, ground = W.groundAt(car.x, car.z);
      if (water > ground + 0.3) car.y = water - 0.2 + Math.sin(g.time * 2.3) * 0.05;
      else { car.y = ground; this.vx *= 0.9; this.vz *= 0.9; }   // run aground
      if (Math.abs(vF) > 3) { this.sprayT = (this.sprayT || 0) - dt; if (this.sprayT <= 0) { this.sprayT = 0.06; g.fx.wake(car.x - Math.sin(car.yaw) * car.halfL, water, car.z - Math.cos(car.yaw) * car.halfL); } }
      return;
    }
    if (flood !== null && flood - W.groundAt(car.x, car.z) > 0.45) {   // car in deep flood water: barely moves
      const k = Math.exp(-2.5 * dt); this.vx *= k; this.vz *= k;
    }
    const rampH = W.rampAt(car.x, car.z);
    const ground = Math.max(W.groundAt(car.x, car.z), rampH);
    if (this.air) {
      this.vy -= GRAVITY * dt; car.y += this.vy * dt; this.airT += dt;
      if (car.y <= ground) {
        const impact = -this.vy;
        car.y = ground; this.vy = 0; this.air = false;
        if (impact > 6) {
          g.camera3p.shake(Math.min(1, impact / 14)); g.audio.crash(Math.min(1, impact / 18));
          if (impact > 11) car.takeDamage((impact - 11) * 3);
        }
        if (this.airT > 0.55 && g.rewards) g.rewards.stunt(this.airT, dist(this.jumpX, this.jumpZ, car.x, car.z));
      }
    } else if (rampH > 0 && rampH >= car.y - 0.3) {
      this.vy = (rampH - car.y) / Math.max(dt, 1e-3);   // climbing the ramp
      car.y = rampH;
    } else if (car.y > ground + 0.35) {
      // Flew off the top of a ramp.
      this.air = true; this.airT = 0; this.jumpX = car.x; this.jumpZ = car.z;
      this.vy = Math.min(this.vy, 9);
      if (Math.abs(vF) > 14) { g.slowmo(0.9, 0.4); g.music.whoosh(); }
    } else { car.y = ground; this.vy = 0; }
    // Into the sea: the car sinks, you wade out.
    if (!this.air && ground < -0.5 && !car.sinking) {
      car.sinking = true; car.takeDamage(999);
      g.hud.showBig('SPLASH!', '#6fd3ff', 2);
      g.fx.splash(car.x, -0.5, car.z);
      setTimeout(() => { if (this.car === car) { this.exit(true); g.player.z = Math.max(g.player.z, -246); g.player.y = W.groundAt(g.player.x, g.player.z); } }, 700);
    }
    if (car.sinking) car.y = Math.max(-1.6, car.y - dt * 0.6);
  }

  // Bonus cash for style: drifts and near misses.
  scoring(dt, vF, vL) {
    const g = this.game;
    if (!g.rewards) return;
    const slide = Math.abs(vL), sp = Math.abs(vF);
    g.audio.screech(!this.air && sp > 5 && slide > 2.6 ? Math.min(1, (slide - 2.6) / 5) : 0);   // tyres squeal in a slide
    if (!this.air && slide > 2.4 && sp > 7 && !this.car.wrecked) {
      this.driftT += dt; this.driftIdle = 0;
      this.driftMult = Math.min(5, 1 + Math.floor(this.driftT / 1.5));
      this.driftPts += slide * sp * dt * 2 * this.driftMult;
      g.hud.setDrift(this.driftPts, this.driftMult);
    } else if (this.driftPts > 0) {
      this.driftIdle += dt;
      if (this.driftIdle > 0.45) this.bankDrift();
    }
  }

  bankDrift() {
    const g = this.game;
    if (this.driftPts > 60 && g.rewards) g.rewards.drift(this.driftPts);
    this.driftPts = 0; this.driftT = 0; this.driftIdle = 0;
    g.hud.setDrift(0);
  }

  // Walls, other cars, people.
  collide(dt) {
    const g = this.game, car = this.car;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
    const r = car.halfW + 0.05;
    let pushX = 0, pushZ = 0;
    const sp = this.speed;
    for (const k of [-0.62, 0, 0.62]) {
      const c = { x: car.x + fx * car.halfL * k, z: car.z + fz * car.halfL * k };
      const bx = c.x, bz = c.z;
      g.world.resolveCircle(c, r, car.y, true);
      for (const o of g.cars) {
        if (o === car || o.inactive) continue;
        if (Math.abs(c.x - o.x) > 6 || Math.abs(c.z - o.z) > 6) continue;
        if (car.y > 1.6) continue;   // flying over it
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
          if (sp > 6) o.takeDamage(sp * 1.5, true);
          this.nearOK = false;
          if (this.driftPts > 0) { this.driftPts = 0; this.driftT = 0; g.hud.setDrift(0); g.hud.popup('DRIFT LOST', 'bad'); }
        }
      }
      pushX += c.x - bx; pushZ += c.z - bz;
    }
    // Near misses: flash past another car at speed without touching it.
    if (sp > 15 && g.rewards && !this.air) {
      for (const o of g.cars) {
        if (o === car || o.inactive || o.parked || o.wrecked) continue;
        const dx = o.x - car.x, dz = o.z - car.z;
        if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
        const along = dx * fx + dz * fz, lat = Math.abs(dx * rx + dz * rz);
        const gap = lat - car.halfW - o.halfW;
        if (Math.abs(along) < car.halfL * 0.6 && gap > 0.05 && gap < 1.0 && g.time - (o.nearT || -9) > 3) {
          o.nearT = g.time;
          g.rewards.nearMiss();
        }
      }
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
          if (this.driftPts > 0) { this.driftPts = 0; this.driftT = 0; g.hud.setDrift(0); g.hud.popup('DRIFT LOST', 'bad'); }
        }
      }
    }
    // People in the way: they dive aside if they can; at speed, they get hit.
    if (car.y > 1.4) return;
    for (const h of g.humans()) {
      if (h.dead || h.isRavi) continue;
      if (Math.abs(h.x - car.x) > car.halfL + 12 || Math.abs(h.z - car.z) > car.halfL + 12) continue;
      const along = (h.x - car.x) * fx + (h.z - car.z) * fz;
      const lat = Math.abs((h.x - car.x) * -fz + (h.z - car.z) * fx);
      if (lat < car.halfW + 0.3 && Math.abs(along) < car.halfL + 0.3) {
        if (sp > 4) {
          h.takeDamage(sp * 6, true, car.x, car.z);
          if (h.dead) g.dispatch.crime(h.isOfficer && !h.gang ? 'kill_cop' : 'run_over', h.x, h.z);
          this.vx *= 0.9; this.vz *= 0.9;
        } else {
          pushOutOfBox(h, 0.3, car.x, car.z, car.yaw, car.halfL, car.halfW);
        }
      } else if (along > 0 && along < 10 && lat < 2.5 && sp > 5 && h.panicFrom) h.panicFrom(car.x, car.z);
    }
  }
}
