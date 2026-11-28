// Mission kit for chapters 4-8: new kinds of mission steps.
//   askAround   talk to people to find a clue (some want money first)
//   pickpocket  rob marked people without being seen
//   footChase   run after someone and tackle them
//   disguise    wear another outfit: guards of that kind let you pass if you act normal
//   photo       take pictures of targets with the CAMERA button
//   passengers  taxi / bus / ambulance jobs: people get in and out
//   escort      keep a person alive on the way to a place
//   waves       fight waves of enemies
//   drones      shoot down spy drones
//   targets     shooting-gallery boards
//   plant       plant bombs (and blow them up)
//   deliver     bring a car somewhere in good shape
//   stealList   steal a list of cars for a buyer
//   choose      pick one of two ways to do it (the mission changes)
//   beat        timing game on the beat (dance, chant, cricket bat)
import * as THREE from 'three';
import { AmbientPerson } from './ambient.js';
import { CharacterRig } from './characters.js';
import { Rhythm } from './specials.js';
import { dist, yawOf, pick } from './util.js';

const $ = (id) => document.getElementById(id);
const PI = Math.PI;
export const CROWD = ['m_kurta', 'f_salwar', 'm_jacket', 'f_purple', 'm_delivery', 'f_green', 'm_denim', 'f_grey', 'm_office', 'f_pink', 'm_sweater', 'm_tee', 'f_coat'];
const GANGR = ['m_jacket', 'm_hoodie', 'm_denim', 'm_red', 'm_tee'];

// A person that belongs to the mission (removed afterwards).
export function person(g, m, x, z, yaw, rig, opts = {}) {
  const p = new AmbientPerson(g, x, z, yaw, { rig: new CharacterRig(rig || pick(CROWD), { castShadow: g.shadows }), gesture: opts.gesture || null, ...opts });
  p.noInteract = opts.interact === undefined ? true : !opts.interact;
  g.ambient.push(p); m.track(p); g.refreshLists();
  return p;
}

// ---------- Hittable objects (drones, targets): shots test these too ----------
export function addHittable(g, o) { (g.hittables = g.hittables || []).push(o); }
export function removeHittable(g, o) { if (g.hittables) g.hittables = g.hittables.filter((h) => h !== o); }

const DRONE_BODY = new THREE.BoxGeometry(0.55, 0.14, 0.55);
const DRONE_ARM = new THREE.BoxGeometry(1.1, 0.04, 0.06);
const DRONE_ROTOR = new THREE.CylinderGeometry(0.22, 0.22, 0.015, 12);
const droneMat = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.5, metalness: 0.5 });
const rotorMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.45 });
const redLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2), toneMapped: false });
const coneMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class Drone {
  constructor(g, cx, cz, r, h, phase = 0) {
    this.g = g; this.cx = cx; this.cz = cz; this.r = r; this.h = h; this.a = phase;
    this.health = 24; this.dead = false; this.radius = 0.9; this.seen = 0;
    const m = this.mesh = new THREE.Group();
    m.add(new THREE.Mesh(DRONE_BODY, droneMat));
    const a1 = new THREE.Mesh(DRONE_ARM, droneMat); a1.rotation.y = PI / 4; m.add(a1);
    const a2 = new THREE.Mesh(DRONE_ARM, droneMat); a2.rotation.y = -PI / 4; m.add(a2);
    this.rotors = [];
    for (const [x, z] of [[0.39, 0.39], [-0.39, 0.39], [0.39, -0.39], [-0.39, -0.39]]) {
      const ro = new THREE.Mesh(DRONE_ROTOR, rotorMat); ro.position.set(x, 0.08, z); m.add(ro); this.rotors.push(ro);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), redLed); led.position.set(0, -0.08, 0.28); m.add(led);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, h, 18, 1, true), coneMat);
    cone.position.y = -h / 2; m.add(cone); this.cone = cone;
    g.scene.add(m);
    addHittable(g, this);
    this.update(0);
  }
  get y() { return this.h; }
  update(dt) {
    if (this.dead) {
      this.fallV = (this.fallV || 0) + dt * 12; this.mesh.position.y -= this.fallV * dt; this.mesh.rotation.z += dt * 6;
      if (this.mesh.position.y < 0.3) { this.g.scene.remove(this.mesh); this.gone = true; }
      return;
    }
    this.a += dt * (4 / Math.max(6, this.r));
    this.x = this.cx + Math.cos(this.a) * this.r; this.z = this.cz + Math.sin(this.a) * this.r;
    this.mesh.position.set(this.x, this.h + Math.sin(this.a * 3) * 0.3, this.z);
    this.mesh.rotation.y = -this.a;
    for (const ro of this.rotors) ro.rotation.y += dt * 40;
    // Eyes: a spotlight below. Standing in it (not under cover) = you are spotted.
    const P = this.g.player, T = this.g.dispatch.target;
    const d = Math.hypot(T.x - this.x, T.z - this.z);
    if (!P.dead && d < 4.2 && !this.g.world.colorInside?.(T.x, T.z)) this.seen += dt * 1.6; else this.seen = Math.max(0, this.seen - dt);
    coneMat.opacity = 0.08 + Math.min(0.2, this.seen * 0.2);
    if (this.seen >= 1 && this.g.dispatch.stars < 2) { this.g.dispatch.setStars(2); this.g.hud.toast('A DRONE SPOTTED YOU!'); this.seen = 0; }
  }
  takeDamage(n) {
    if (this.dead) return;
    this.health -= n;
    if (this.health <= 0) {
      this.dead = true; removeHittable(this.g, this);
      this.g.fx.explosion(this.x, this.h, this.z, 0.35);
      this.g.audio.explosion(0.4);
      this.mesh.remove(this.cone);
      this.g.rewards.event('DRONE DOWN', 150, 10);
      this.g.emit('drone');
    }
  }
  remove() { removeHittable(this.g, this); this.g.scene.remove(this.mesh); this.gone = true; }
}

const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
function boardTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  for (let i = 5; i > 0; i--) { x.fillStyle = i % 2 ? '#e8322c' : '#ffffff'; x.beginPath(); x.arc(32, 32, i * 6, 0, PI * 2); x.fill(); }
  return new THREE.CanvasTexture(c);
}
let boardTex = null;
export class TargetBoard {
  constructor(g, x, y, z, yaw) {
    this.g = g; this.x = x; this.y = y; this.z = z; this.radius = 0.5; this.dead = false; this.health = 1;
    if (!boardTex) { boardTex = boardTexture(); boardTex.colorSpace = THREE.SRGBColorSpace; }
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ map: boardTex }));
    this.mesh.position.set(x, y, z); this.mesh.rotation.y = yaw;
    g.scene.add(this.mesh); addHittable(g, this);
  }
  takeDamage() {
    if (this.dead) return;
    this.dead = true; removeHittable(this.g, this);
    this.g.audio.ping(); this.g.hud.hitMarker(true);
    this.downT = 0.25; this.g.emit('target');
  }
  update(dt) { if (this.dead && this.downT > 0) { this.downT -= dt; this.mesh.rotation.x -= dt * 6; if (this.downT <= 0) this.g.scene.remove(this.mesh); } }
  remove() { removeHittable(this.g, this); this.g.scene.remove(this.mesh); }
}

// ---------- Steps ----------
const near = (g, x, z, r) => { const T = g.dispatch.target; return dist(T.x, T.z, x, z) < r; };

// people: [{ at: [x, z], yaw, rig, gesture, line, key, pay }]. Done when the key person has told you.
export function askAround(people, text, o = {}) {
  return {
    start: (g, m) => {
      m.objective(text);
      m.vars.ask = people.map((d) => {
        const p = person(g, m, d.at[0], d.at[1], d.yaw ?? 0, d.rig, { gesture: d.gesture || 'wait', interact: true });
        p.askDef = d; p.asked = false; p.calm = true;
        p.missionTalk = (G, pp) => {
          // Wants money first (GIVE ₹100 on the card). Broke? Ask twice and they take pity.
          if (d.pay && !pp.given && !(G.save.coins < 100 && pp.askedTwice)) { if (G.save.coins < 100) pp.askedTwice = true; return d.payLine || 'Kuch milega to bataunga... (give ₹100)'; }
          pp.asked = true;
          if (d.key) m.vars.askDone = true;
          return d.line;
        };
        return p;
      });
    },
    update: (g, m) => {
      const left = m.vars.ask.filter((p) => !p.asked && !p.dead);
      g.pins = left.map((p) => ({ x: p.x, z: p.z, color: '#8fe3ff' }));
      const T = g.dispatch.target;
      const nxt = left.sort((a, b) => dist(a.x, a.z, T.x, T.z) - dist(b.x, b.z, T.x, T.z))[0];
      if (nxt) m.marker(nxt.x, nxt.z, 1.2, true);
      m.objective(`${text} (walk up and tap TALK)`);
      return !!m.vars.askDone;
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}

// Rob the marked people (from behind). Caught = they shout and a witness may call the police.
export function pickpocket(list, text, o = {}) {
  return {
    start: (g, m) => {
      m.objective(text);
      m.vars.marks = list.map((d) => {
        const p = person(g, m, d.at[0], d.at[1], d.yaw ?? 0, d.rig, { gesture: d.gesture || null, interact: true });
        p.markDef = d; p.alertMark = !!d.alert; p.walkPts = d.walk || null; p.wi = 0; p.calm = false;
        p.profile = { name: d.name || 'Rich tourist', age: 30 + Math.floor(Math.random() * 30), job: d.job || 'Very rich', fact: d.fact || 'Wallet is fat and the pocket is open', cash: d.cash || 800 };
        return p;
      });
      m.vars.robOk = 0;
    },
    update: (g, m, dt) => {
      for (const p of m.vars.marks) {
        if (p.walkPts && !p.robbed && !(p.holdT > 0)) {
          const w = p.walkPts[p.wi];
          if (dist(p.x, p.z, w[0], w[1]) < 0.8) p.wi = (p.wi + 1) % p.walkPts.length;
          p.walkTo = { x: p.walkPts[p.wi][0], z: p.walkPts[p.wi][1] }; p.walkSpeed = 1.2;
        }
        if (p.alertMark && !p.robbed) {   // a careful one: turns round now and then
          p.turnT = (p.turnT ?? 3) - dt;
          if (p.turnT <= 0) { p.turnT = 2.5 + Math.random() * 2; p.holdT = 1.2; p.holdGesture = 'look'; p.faceX = g.player.x; p.faceZ = g.player.z; }
        }
      }
      const left = m.vars.marks.filter((p) => !p.robbed);
      g.pins = left.map((p) => ({ x: p.x, z: p.z, color: '#ffc531' }));
      if (left[0]) { const T = g.dispatch.target; const n = left.sort((a, b) => dist(a.x, a.z, T.x, T.z) - dist(b.x, b.z, T.x, T.z))[0]; m.marker(n.x, n.z, 1.2, true); }
      m.objective(`${text}: ${m.vars.robOk} / ${list.length}`);
      if (o.failOnCaught && m.vars.marks.some((p) => p.robbed && !p.robOk)) { m.fail(o.failOnCaught); return false; }
      return left.length === 0 && m.vars.robOk >= (o.need ?? list.length);
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}
// (missions count good robs with onEvent: rob)
export function countRobs(g, m, type, data) {
  if (type === 'rob' && data && data.ok && data.person && m.vars.marks && m.vars.marks.includes(data.person)) { data.person.robOk = true; m.vars.robOk++; }
}

// Chase someone on foot; get close to tackle. route = points the runner follows.
export function footChase(name, routeIn, text, o = {}) {
  let far = 0, route = [];
  return {
    start: (g, m) => {
      route = typeof routeIn === 'function' ? routeIn(g, m) : routeIn;
      m.objective(text);
      const [x, z] = o.from || route[0];
      const r = m.vars[name] || person(g, m, x, z, 0, o.rig || 'm_hoodie', {});
      r.calm = true; r.ri = 0; r.walkSpeed = o.speed || 4.6; r.runner = true;
      m.vars[name] = r;
      g.hud.toast(o.toast || 'CATCH HIM!');
      m.music = 2;
    },
    update: (g, m, dt) => {
      const r = m.vars[name], P = g.player;
      if (r.dead) { if (o.noKill) { m.fail(o.noKill); return false; } return true; }
      const w = route[Math.min(r.ri, route.length - 1)];
      if (dist(r.x, r.z, w[0], w[1]) < 1.2) r.ri = r.ri + 1 < route.length ? r.ri + 1 : (o.loop ? 0 : r.ri);
      const d = dist(r.x, r.z, P.x, P.z);
      r.walkSpeed = (o.speed || 4.6) * (d < 6 ? 1.02 : 1) * (r.ri >= route.length - 1 && !o.loop ? 0.7 : 1);
      r.walkTo = { x: route[r.ri][0], z: route[r.ri][1] };
      m.marker(r.x, r.z, 1.2, true);
      far = d > (o.lose || 70) ? far + dt : 0;
      if (far > 6) { m.fail(o.lost || 'He got away'); return false; }
      if (d < 1.7 && !P.inCar) {   // TACKLE!
        r.walkTo = null; r.state = 'cower'; r.cowerT = 999; r.runner = false;
        g.slowmo(0.8, 0.35); g.hud.showBig('TACKLED!', '#ffc531', 1.4); g.audio.thump(0.4, 90, 0.2); g.audio.bodyfall(1);
        g.rewards.event('TACKLE', 200, 15);
        return true;
      }
      g.hud.setProgress(d < 10 ? 'CLOSE! Keep running' : 'Chase him! (sprint)', Math.max(0, 1 - d / 60), d < 10 ? '#7dff8a' : '#ffc531');
      return false;
    },
    end: (g, m) => { m.marker(null); g.hud.hideProgress(); m.music = 1; },
  };
}

// Wear an outfit. kind = which guards accept it ('delivery', 'police', 'waiter', 'cleaner', 'office', 'chai').
export function disguise(outfit, kind, label) {
  return {
    start: (g) => {
      g.player.setOutfit(outfit); g.disguise = { kind };
      const b = $('disguise-badge'); b.textContent = `DISGUISED: ${label || kind.toUpperCase()}`; b.classList.remove('hidden');
      g.hud.toast(`You look like a ${label || kind}. Walk calmly - running or aiming looks suspicious.`);
    },
    update: () => true,
  };
}
export function undisguise() {
  return { start: (g) => { if (g.player.outfit) g.player.setOutfit(null); g.disguise = null; $('disguise-badge').classList.add('hidden'); }, update: () => true };
}

// Take photos: targets = function(g, m) -> [{x, y, z, label}]. Point the camera (aim) and tap PHOTO.
export function photo(targets, text, o = {}) {
  let list = [];
  return {
    start: (g, m) => { list = targets(g, m).map((t) => ({ ...t, done: false })); m.objective(text); $('btn-photo').classList.remove('hidden'); g.photoMode = true; },
    update: (g, m) => {
      const left = list.filter((t) => !t.done);
      g.pins = left.map((t) => ({ x: t.x, z: t.z, color: '#ff7aa8' }));
      if (left[0]) { const T = g.dispatch.target; const n = left.sort((a, b) => dist(a.x, a.z, T.x, T.z) - dist(b.x, b.z, T.x, T.z))[0]; m.marker(n.x, n.z, 1.5, true); }
      m.objective(`${text}: ${list.length - left.length} / ${list.length} (aim at it, tap PHOTO)`);
      if (g.photoPressed) {
        g.photoPressed = false;
        const cam = g.camera, v = new THREE.Vector3();
        $('flash').classList.remove('hidden'); $('flash').style.animation = 'none'; void $('flash').offsetWidth; $('flash').style.animation = '';
        g.audio.click();
        let got = 0;
        for (const t of left) {
          const tx = typeof t.x === 'function' ? t.x() : t.x;
          v.set(tx, t.y ?? 1.5, t.z).project(cam);
          const d = dist(cam.position.x, cam.position.z, tx, t.z);
          if (v.z < 1 && Math.abs(v.x) < 0.42 && Math.abs(v.y) < 0.5 && d < (o.range || 55) && !g.world.segmentBlocked(cam.position.x, cam.position.z, tx, t.z)) { t.done = true; got++; }
        }
        if (got) { g.hud.popup(`PHOTO ${list.length - left.length + got} / ${list.length}`, 'bonus'); g.music.checkpoint(); }
        else g.hud.toast('Nothing important in the photo. Point at the marked target!');
      }
      return left.length === 0;
    },
    end: (g, m) => { g.pins = []; m.marker(null); $('btn-photo').classList.add('hidden'); g.photoMode = false; },
  };
}

// Taxi / bus / ambulance. stops: [{ at, dest, n, kind: 'stand' | 'injured', rig, say }].
export function passengers(carName, stops, text, o = {}) {
  let si = 0, phase = 'goto', riders = [], waiting = [];
  const carOf = (g, m) => m.vars[carName];
  return {
    start: (g, m) => { si = 0; phase = 'goto'; riders = []; waiting = []; m.objective(text); spawnStop(g, m); },
    update: (g, m, dt) => {
      const car = carOf(g, m);
      if (!car || car.exploded) { m.fail('The vehicle was destroyed'); return false; }
      const st = stops[si];
      const inCar = g.driving.car === car;
      const slow = inCar && Math.hypot(g.driving.vx, g.driving.vz) < 2.5;
      if (!inCar) { m.objective(o.getIn || 'Get back in your vehicle'); m.marker(car.x, car.z, 3); return false; }
      if (phase === 'goto') {
        m.marker(st.at[0], st.at[1], 6);
        m.objective(st.n > 1 ? `${text}: pick up ${st.n} people (stop next to them)` : st.kind === 'injured' ? `${text}: pick up the injured person` : `${text}: pick up the passenger`);
        if (slow && dist(car.x, car.z, st.at[0], st.at[1]) < 9) phase = 'board';
      } else if (phase === 'board') {
        m.objective('Wait... they are getting in');
        for (const p of waiting) { p.walkTo = { x: car.x, z: car.z }; p.walkSpeed = p.injured ? 1.0 : 1.6; p.state = 'idle'; p.boardT = (p.boardT || 0) + dt; }
        for (const p of [...waiting]) if (dist(p.x, p.z, car.x, car.z) < car.halfW + 2.2 || p.boardT > 6) { p.mesh.visible = false; p.boarded = true; waiting = waiting.filter((q) => q !== p); riders.push(p); g.audio.click(); }
        if (!waiting.length) { phase = 'deliver'; if (st.say) g.say(st.say); }
        if (!slow) phase = 'goto';
      } else if (phase === 'deliver') {
        m.marker(st.dest[0], st.dest[1], 7);
        m.objective(o.deliverText ? o.deliverText(st) : `Drive to the marker (${st.destName || 'drop-off'})`);
        if (slow && dist(car.x, car.z, st.dest[0], st.dest[1]) < 9) {
          // Out they get.
          for (const p of riders) {
            p.x = car.x + Math.cos(car.yaw) * (car.halfW + 0.7); p.z = car.z - Math.sin(car.yaw) * (car.halfW + 0.7);
            p.mesh.visible = true; p.boarded = false; p.walkTo = { x: p.x + Math.cos(car.yaw) * 6, z: p.z - Math.sin(car.yaw) * 6 }; p.walkSpeed = 1.4;
            if (p.injured) { p.state = 'idle'; p.walkTo = null; p.rig.setGesture('sit'); }
          }
          const pay = (o.fare || 300) * Math.max(1, riders.length) * (car.health > 80 ? 1.3 : 1);
          g.rewards.addCash(pay, car.health > 80 ? 'FARE + TIP' : 'FARE', 'bonus');
          riders = [];
          si++;
          if (si >= stops.length) return true;
          phase = 'goto'; spawnStop(g, m);
        }
      }
      return false;
    },
    end: (g, m) => m.marker(null),
  };
  function spawnStop(g, m) {
    const st = stops[si];
    waiting = [];
    g.noPark(st.at[0], st.at[1], 9); g.noPark(st.dest[0], st.dest[1], 9);   // no parked car in the way
    const n = st.n || 1;
    for (let k = 0; k < n; k++) {
      const p = person(g, m, st.at[0] + (k - (n - 1) / 2) * 0.9, st.at[1] + 0.3 * k, st.yaw ?? 0, st.rig || pick(CROWD), { gesture: st.kind === 'injured' ? 'sit' : 'wait' });
      p.injured = st.kind === 'injured'; p.calm = true;
      waiting.push(p);
    }
  }
}

// Keep a person alive while they walk with you to a place.
export function escort(name, dest, text, o = {}) {
  return {
    start: (g, m) => {
      m.objective(text);
      const v = m.vars[name];
      v.calm = true; v.vipHP = o.hp || 100; v.walkSpeed = 1.6;
      m.music = 2;
    },
    update: (g, m, dt) => {
      const v = m.vars[name], P = g.player;
      if (v.dead || v.vipHP <= 0) { if (!v.dead) { v.dead = true; v.rig.die(1, 0); } m.fail(o.dead || 'He was killed'); return false; }
      // Follow Vikram (stay close), run if far.
      const d = dist(v.x, v.z, P.x, P.z);
      v.walkSpeed = d > 6 ? 4.2 : 1.7;
      v.walkTo = d > 2.2 ? { x: P.x - Math.sin(P.yaw) * 1.5, z: P.z - Math.cos(P.yaw) * 1.5 } : null;
      if (d > 25 && !P.inCar) { v.x = P.x - Math.sin(P.yaw) * 2; v.z = P.z - Math.cos(P.yaw) * 2; }   // stuck behind a wall: catch up
      if (P.inCar) { v.mesh.visible = false; v.x = P.x; v.z = P.z; } else v.mesh.visible = true;
      // Enemies near him hurt him.
      let hurt = 0;
      for (const e of g.officers) if (!e.dead && (e.gang || e.forceHostile) && dist(e.x, e.z, v.x, v.z) < 22 && !g.world.segmentBlocked(e.x, e.z, v.x, v.z)) hurt++;
      v.vipHP -= hurt * dt * (o.dps || 2.2);
      g.hud.setBoss(o.label || 'PROTECT HIM', Math.max(0, v.vipHP) / (o.hp || 100));
      m.marker(dest[0], dest[1], 5);
      return dist(v.x, v.z, dest[0], dest[1]) < 6 || (P.inCar && near(g, dest[0], dest[1], 7));
    },
    end: (g, m) => { g.hud.setBoss(null); m.marker(null); m.music = 1; },
  };
}

// Waves of enemies. waves: [{ at: [[x, z], ...], weapon }]. spawn = (g, m, x, z, opts) -> officer.
export function waves(list, text, spawn, o = {}) {
  let wi = -1, gap = 0;
  return {
    start: (g, m) => { wi = -1; gap = 0.5; m.objective(text); m.music = 3; m.vars.waveGroup = 'wave'; },
    update: (g, m, dt) => {
      const alive = g.officers.filter((e) => e.group === 'wave' && !e.dead).length;
      if (alive === 0) {
        if (wi >= list.length - 1) return true;
        gap -= dt;
        if (gap <= 0) {
          wi++; gap = 2.5;
          const W = list[wi];
          for (const [x, z] of W.at) spawn(g, m, x, z, { group: 'wave', weapon: W.weapon || 'pistol' });
          g.hud.showBig(`WAVE ${wi + 1} / ${list.length}`, '#ff4438', 1.2);
        }
      }
      m.objective(`${text}: wave ${Math.max(1, wi + 1)} / ${list.length}`);
      if (o.zone && !near(g, o.zone[0], o.zone[1], o.zone[2])) { m.vars.awayT = (m.vars.awayT || 0) + dt; m.objective('Get back to the place you are defending!'); if (m.vars.awayT > 8) m.fail(o.zoneFail || 'You left them alone'); }
      else m.vars.awayT = 0;
      return false;
    },
    end: (g, m) => { m.music = 1; },
  };
}

// Spy drones circling over an area: shoot them all down.
export function drones(list, text) {
  return {
    start: (g, m) => { m.objective(text); m.vars.drones = list.map(([x, z, r, h], i) => m.track(new Drone(g, x, z, r, h, i * 1.7))); },
    update: (g, m, dt) => {
      for (const d of m.vars.drones) d.update(dt);
      const left = m.vars.drones.filter((d) => !d.dead);
      g.pins = left.map((d) => ({ x: d.x, z: d.z, color: '#ff4438' }));
      if (left[0]) { const T = g.dispatch.target; const n = left.sort((a, b) => dist(a.x, a.z, T.x, T.z) - dist(b.x, b.z, T.x, T.z))[0]; m.marker(n.x, n.z, 2, true); }
      m.objective(`${text}: ${m.vars.drones.length - left.length} / ${m.vars.drones.length} (aim up and shoot)`);
      return left.length === 0;
    },
    end: (g, m) => { g.pins = []; m.marker(null); for (const d of m.vars.drones || []) if (!d.gone && !d.dead) d.remove(); },
  };
}

// Shooting gallery: boards pop up; hit 'need' of them before time runs out.
export function targets(spots, need, sec, text) {
  let t = 0, hit = 0, live = [], next = 0;
  return {
    start: (g, m) => { t = sec; hit = 0; live = []; next = 0; m.objective(text); g.onTarget = () => { hit++; g.rewards.addCash(40, 'BULLSEYE', 'cash'); }; },
    update: (g, m, dt) => {
      t -= dt; next -= dt;
      live = live.filter((b) => { b.update(dt); if (!b.dead) { b.life -= dt; if (b.life <= 0) { b.remove(); return false; } } return !b.dead || b.downT > 0; });
      if (next <= 0 && live.filter((b) => !b.dead).length < 3) {
        next = 0.7;
        const [x, y, z, yaw] = pick(spots);
        const b = new TargetBoard(g, x + (Math.random() - 0.5) * 2, y + Math.random() * 0.8, z, yaw);
        b.life = 3.2; live.push(b); m.track({ remove: () => b.remove() });
      }
      g.hud.setProgress(`HITS ${hit} / ${need} · ${Math.ceil(t)}s`, Math.min(1, hit / need), '#ffc531');
      m.objective(`${text}: ${hit} / ${need}`);
      if (hit >= need) return true;
      if (t <= 0) { m.fail(`Only ${hit} hits. You needed ${need}`); return false; }
      return false;
    },
    end: (g) => { g.hud.hideProgress(); for (const b of live) b.remove(); g.onTarget = null; },
  };
}

// Plant bombs at points (stand there 2 s each). Then they can go off (blow).
export function plant(points, sec, text, o = {}) {
  const done = points.map(() => false);
  let cur = -1, t = 0;
  return {
    start: (g, m) => m.objective(text),
    update: (g, m, dt) => {
      const T = g.dispatch.target, P = g.player;
      g.pins = points.filter((p, i) => !done[i]).map(([x, z]) => ({ x, z, color: '#ff5a4d' }));
      let best = -1;
      points.forEach(([x, z], i) => { if (!done[i] && (best < 0 || dist(x, z, T.x, T.z) < dist(points[best][0], points[best][1], T.x, T.z))) best = i; });
      if (best >= 0) m.marker(points[best][0], points[best][1], 2.5, true);
      const inside = best >= 0 && !P.inCar && dist(points[best][0], points[best][1], T.x, T.z) < 2.6;
      if (inside) { if (cur !== best) { cur = best; t = 0; } t += dt; g.hud.setProgress(`${o.doing || 'PLANTING'}... ${Math.ceil(sec - t)}s`, t / sec, '#ff5a4d'); }
      else { cur = -1; t = 0; g.hud.hideProgress(); }
      if (inside && t >= sec) { done[best] = true; cur = -1; t = 0; g.hud.hideProgress(); g.music.checkpoint(); if (o.onEach) o.onEach(g, m, best); }
      m.objective(`${text}: ${done.filter(Boolean).length} / ${points.length}`);
      return done.every(Boolean);
    },
    end: (g, m) => { g.pins = []; g.hud.hideProgress(); m.marker(null); },
  };
}
export function blowUp(points) {
  return {
    start: (g) => {
      points.forEach(([x, z], i) => setTimeout(() => { g.fx.explosion(x, 1, z, 1.2); g.audio.explosion(1); g.blast(x, z, 9, null, true); g.emit('explosion'); }, 400 + i * 450));
      g.slowmo(1.2, 0.4);
    },
    update: () => true,
  };
}

// Bring a car to a place in good shape.
export function deliver(carName, x, z, r, text, o = {}) {
  return {
    start: (g, m) => { m.objective(text); m.marker(x, z, r); },
    update: (g, m) => {
      const c = m.vars[carName];
      if (!c || c.exploded) { m.fail('The car was destroyed'); return false; }
      if (g.driving.car !== c) { m.objective(o.carText || 'Get back in the car'); m.marker(c.x, c.z, 3); return false; }
      m.marker(x, z, r);
      const hp = Math.max(0, Math.round(c.health));
      m.objective(`${text}${o.minHealth ? ` · car ${hp}% (keep above ${o.minHealth}%)` : ''}`);
      if (o.minHealth && c.health < o.minHealth) { m.fail('The car is too damaged. The buyer does not want it!'); return false; }
      return near(g, x, z, r);
    },
    end: (g, m) => m.marker(null),
  };
}

// Steal several cars (one after another) and bring each to a place.
export function stealList(list, to, text, o = {}) {
  let i = 0;
  return {
    start: (g, m) => {
      i = 0; m.objective(text);
      m.vars.list = list.map((d, k) => { const c = g.spawnParkedCar(d.type, d.color, d.at[0], d.at[1], d.yaw ?? 0); c.missionCar = true; c.listName = d.name; m.track(c); return c; });
    },
    update: (g, m) => {
      const c = m.vars.list[i];
      if (c.exploded) { m.fail(`The ${list[i].name} was destroyed`); return false; }
      g.pins = m.vars.list.slice(i).map((q) => ({ x: q.x, z: q.z, color: '#7dff6b' }));
      if (g.driving.car !== c) { m.objective(`Steal the ${list[i].name} (${i + 1} / ${list.length})`); m.marker(c.x, c.z, 3, true); return false; }
      m.marker(to[0], to[1], 6);
      m.objective(`Bring the ${list[i].name} to ${o.toName || 'the garage'} · car ${Math.round(Math.max(0, c.health))}%`);
      if (o.minHealth && c.health < o.minHealth) { m.fail(`The ${list[i].name} is too damaged`); return false; }
      if (near(g, to[0], to[1], 6) && Math.hypot(g.driving.vx, g.driving.vz) < 3) {
        g.driving.exit(true); c.parked = true; c.hold = true;
        g.rewards.addCash(o.pay || 800, `${list[i].name.toUpperCase()} DELIVERED`, 'bonus');
        i++;
        if (i >= list.length) return true;
      }
      return false;
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}

// Pick one of two ways. Each way adds its own steps to the mission.
export function choose(question, a, b, stepsA, stepsB) {
  let picked = null;
  return {
    start: (g, m) => {
      picked = null;
      g.controls.releaseAll();
      document.exitPointerLock?.();   // PC: free the mouse so the choice can be clicked (or press 1 / 2)
      $('choice-q').textContent = question; $('choice-a').textContent = a; $('choice-b').textContent = b;
      $('choice').classList.remove('hidden');
      g.choiceHook = (k) => { picked = k; };
      $('choice-a').onclick = () => g.choiceHook && g.choiceHook('a');
      $('choice-b').onclick = () => g.choiceHook && g.choiceHook('b');
      m.objective('Choose how to do it');
    },
    update: (g, m) => {
      if (!picked) return false;
      m.vars.choice = picked;
      const extra = picked === 'a' ? stepsA() : stepsB();
      m.steps.splice(m.si + 1, 0, ...extra);
      return true;
    },
    end: (g) => { $('choice').classList.add('hidden'); g.choiceHook = null; },
  };
}

// Timing game on the beat (dance / chant / cricket bat). Done after 'need' good taps.
export function beat(need, text, o = {}) {
  return {
    start: (g, m) => {
      g.rhythm = new Rhythm(g, o.bpm || 100);
      $('btn-dance').querySelector('span').textContent = o.button || 'DANCE';
      document.querySelector('#rhythm .label').textContent = o.label || 'Tap on the beat when a note hits the line';
      m.vars.beatGood = 0; m.vars.beatMiss = 0;
      g.rhythm.onJudge = (ok) => { if (ok) m.vars.beatGood++; else m.vars.beatMiss++; };
      if (o.quiet) g.music.quiet = true;
      m.objective(text);
    },
    update: (g, m, dt) => {
      g.rhythm.update(dt, false);
      m.objective(`${text}: ${m.vars.beatGood} / ${need}`);
      if (o.maxMiss && m.vars.beatMiss > o.maxMiss) { m.fail(o.missFail || 'Too many misses'); return false; }
      return m.vars.beatGood >= need;
    },
    end: (g) => {
      if (g.rhythm) { g.rhythm.stop(); g.rhythm = null; }
      $('btn-dance').querySelector('span').textContent = 'DANCE';
      document.querySelector('#rhythm .label').textContent = 'BLEND IN: tap DANCE when a note hits the line';
      g.music.quiet = false;
    },
  };
}

// Gang members that guard a place, use the officer system. Helper for missions.
export function thugs(g, m, list, opts = {}) {
  const out = [];
  for (const p of list) {
    const [x, z] = p;
    const P = g.player;
    const o = g.spawnOfficer(x, z, p[2] ?? yawOf(P.x - x, P.z - z), null, { gang: true, hostile: true, model: pick(GANGR), weapon: 'pistol', ...opts });
    m.track(o); out.push(o);
    if (opts.group) m.vars[opts.group + 'N'] = (m.vars[opts.group + 'N'] || 0) + 1;
  }
  // v9.5: every gang fight has red gas cylinders nearby - shoot one and watch them fly.
  if (g.cylinders && list.length >= 2 && !opts.noCylinders) {
    const cx = list.reduce((a, p) => a + p[0], 0) / list.length, cz = list.reduce((a, p) => a + p[1], 0) / list.length;
    g.cylinders.addNear(cx, cz, Math.min(3, Math.ceil(list.length / 2)));
  }
  return out;
}

// Guards that watch (a vision cone and a "suspicion" meter). kind = the disguise they accept.
// list: [[x, z, yaw, path?]] - path = [[x, z], ...] to walk, otherwise they stand.
export function guards(g, m, list, kind, opts = {}) {
  const out = [];
  for (const [x, z, yaw = 0, path] of list) {
    const o = g.spawnOfficer(x, z, yaw, null, { gang: true, model: opts.model || pick(GANGR), weapon: opts.weapon || 'pistol', patrol: path || [[x, z]], group: opts.group || 'grd', ...opts.extra });
    o.yaw = yaw; o.allowDisguise = kind || null;
    m.track(o); out.push(o);
  }
  return out;
}
