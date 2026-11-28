// Story missions: 2 chapters x 10 missions. Each mission is a list of small STEPS
// (go here, steal that, race, chase, fight, sneak, defuse...). Every mission has a goal, a timer or a
// fail rule, and rewards: cash, 1-3 stars, bonuses, XP. Progress is saved on the phone (works offline).
import * as THREE from 'three';
import { localTask, localStep } from './i18n.js';
import { WAREHOUSE, spawnRavi, AmbientPerson } from './ambient.js';
import { MissionCar } from './mcars.js';
import { CharacterRig } from './characters.js';
import { LiveStream, ColorClouds, Rhythm } from './specials.js';
import { moreMissions, INTROS } from './missions2.js';
import { installActs } from './acts.js';
import { part, mergeParts, BOX, vertexColorGlow } from './mesh.js';
import { FOOT_TOP } from './world.js';
import { dist, yawOf, pick } from './util.js';

const SAVE_KEY = 'cityThief.save.v1';

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return { unlocked: s.unlocked || 1, stars: s.stars || {}, coins: s.coins || 0, xp: s.xp || 0, items: s.items || [], weapons: s.weapons || [], daily: s.daily || { last: '', streak: 0 }, best: s.best || {} };
  } catch (e) { return { unlocked: 1, stars: {}, coins: 0, xp: 0, items: [], weapons: [], daily: { last: '', streak: 0 }, best: {} }; }
}
export function writeSave(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* private mode: fine */ }
}

export const CHAPTERS = [
  { id: 1, title: 'STREET ESCAPE', from: 1, to: 10 },
  { id: 2, title: 'CITY OF GOLD', from: 11, to: 20 },
  { id: 3, title: 'NAVAPUR NIGHTS', from: 21, to: 26 },
  { id: 4, title: 'STREET SMART', from: 27, to: 36, isNew: true, teaser: 'Talk, pickpocket, hire a crew. Boss: Chhota Babu.' },
  { id: 5, title: 'UNDERCOVER', from: 37, to: 46, isNew: true, teaser: 'Disguises, photos, phone taps. Boss: Neta Bhanwar Lal.' },
  { id: 6, title: 'FAST AND DESI', from: 47, to: 56, isNew: true, teaser: 'Car lists, buses, ambulances, derby. Boss: Collector Kapoor.' },
  { id: 7, title: 'FESTIVAL CITY', from: 57, to: 66, isNew: true, teaser: 'Diwali, kites, garba, cricket, visarjan. Boss: Rana.' },
  { id: 8, title: 'KING OF NAVAPUR', from: 67, to: 76, isNew: true, teaser: 'The big bank heist. Boss: the Commissioner.' },
  { id: 9, title: 'SAGARPET', soon: true, teaser: 'A new harbour city. Boats, bikes, a smuggling war.' },
];

// ---------- Places ----------
const PI = Math.PI;
const START = [6.6, 19.5, -PI / 2];
const NEAR_CAR = [6.4, 14, 0];              // parked on the footpath next to the start
const CHAI = { x: 7.8, z: 31 };
const GARAGE = { x: -75, z: -37 };
const BAZAAR_ROAD = { x: -187.5, z: -77.2 };
const GOLD_DOOR = { x: 19, z: -10.2 };
const GOLD_CAR = { x: 19, z: -2.25 };
const GANG = ['m_jacket', 'm_hoodie', 'm_denim', 'm_red', 'm_tee'];
const RACE_CPS = [[150, -225], [75, -225], [0, -225], [-75, -225], [-150, -225], [-150, -150], [-150, -75], [-75, -75], [0, -75],
  [75, -75], [75, 0], [75, 75], [150, 75], [150, 0], [150, -75], [150, -150], [150, -203]].map(([x, z]) => ({ x, z }));
const STUNT_CPS = [[-112.5, 4], [-112.5, 54], [-112.5, 75], [-75, 75], [-75, 150], [-75, 187.5], [-65, 187.5], [-18, 187.5], [0, 187.5], [0, 222]].map(([x, z]) => ({ x, z }));

// ---------- Small helpers ----------
const near = (g, x, z, r) => { const T = g.dispatch.target; return dist(T.x, T.z, x, z) < r; };
function parkedCar(g, m, type, color, x, z, yaw, name) {
  const c = g.spawnParkedCar(type, color, x, z, yaw);
  c.missionCar = true;
  if (name) m.vars[name] = c;
  return m.track(c);
}
export function missionCar(g, m, type, color, opts, at) {
  const c = new MissionCar(g, type, color, opts);
  if (at.node) c.placeAt(at.x, at.z, at.hx, at.hz);
  else { c.x = at.x; c.z = at.z; c.yaw = at.yaw; c.syncMesh(); }
  g.cars.push(c);
  if (opts.name) m.vars[opts.name] = c;
  return m.track(c);
}
function gang(g, m, list, opts = {}) {
  const P = g.player;
  for (const p of list) {
    const [x, z] = p;
    const o = g.spawnOfficer(x, z, p[2] ?? yawOf(P.x - x, P.z - z), null, { gang: true, hostile: true, model: pick(GANG), weapon: 'pistol', ...opts });
    m.track(o);
    if (opts.group) m.vars[opts.group + 'N'] = (m.vars[opts.group + 'N'] || 0) + 1;
  }
}
function police(g, m, list, opts = {}) {
  for (const [x, z] of list) {
    const o = g.spawnOfficer(x, z, yawOf(g.player.x - x, g.player.z - z), null, { marker: true, ...opts });
    o.forceHostile = true; o.missionTarget = true; m.track(o);
    if (opts.group) m.vars[opts.group + 'N'] = (m.vars[opts.group + 'N'] || 0) + 1;
  }
}
function alive(g, group) { return g.officers.filter((o) => o.group === group && !o.dead).length; }
// Ravi (or another friend) shoots the nearest enemy he can see.
function allyFight(g, m, ally, dt) {
  if (!ally || ally.dead) return;
  ally.fireT = (ally.fireT ?? 1.4) - dt;
  if (ally.fireT > 0) return;
  ally.fireT = 1.1 + Math.random() * 0.7;
  let best = null, bd = 30;
  for (const o of g.officers) {
    if (o.dead || !(o.gang || o.forceHostile) || (o.guard && !o.guard.alerted)) continue;
    const d = dist(ally.x, ally.z, o.x, o.z);
    if (d < bd && !g.world.segmentBlocked(ally.x, ally.z, o.x, o.z)) { bd = d; best = o; }
  }
  if (!best) return;
  ally.faceTarget = best;
  const from = new THREE.Vector3(ally.x, ally.groundY + 1.45, ally.z), to = new THREE.Vector3(best.x, best.groundY + 1.2, best.z);
  g.fx.muzzle(from.clone().lerp(to, 0.03)); g.fx.tracer(from, to, 0.7);
  g.audio.gunshot('pistol', 0.6);
  if (Math.random() < 0.32) { best.takeDamage(30, false, ally.x, ally.z); if (best.dead) m.onKill(best); }
}

// ---------- Steps ----------
// A step: { start(g, m), update(g, m, dt) -> true when finished, end(g, m) }.
const place = (x, z, yaw) => ({ start: (g) => g.placePlayer(x, z, yaw), update: () => true });
const act = (fn) => ({ start: (g, m) => fn(g, m), update: () => true });
const say = (lines, waitDone = false) => ({ start: (g) => g.say(lines), update: (g) => !waitDone || (g.hud.subT <= 0 && !g.hud.subQueue.length) });
function wait(sec, text) { let t = 0; return { label: text, start: (g, m) => { t = sec; if (text) m.objective(text); }, update: (g, m, dt) => (t -= dt) <= 0 }; }
const waitFor = (text, fn) => ({ label: text, start: (g, m) => text && m.objective(text), update: (g, m, dt) => fn(g, m, dt) });

function goTo(x, z, r, text, o = {}) {
  return {
    label: text,
    start: (g, m) => { m.objective(text); m.marker(x, z, r); },
    update: (g, m) => {
      const P = g.player;
      if (o.car && !P.inCar) { m.objective(o.carText || 'Get in a car (walk up to any car, tap ENTER)'); return false; }
      if (o.foot && P.inCar) { m.objective('Get out of the car'); return false; }
      if (o.withCar && g.driving.car !== m.vars[o.withCar]) { m.objective(o.carText || 'Get back in the car (walk up to it, tap ENTER)'); return false; }
      m.objective(text);
      return near(g, x, z, r);
    },
    end: (g, m) => m.marker(null),
  };
}

function getIn(name, text) {
  return {
    label: text,
    start: (g, m) => { m.objective(text); const c = name && m.vars[name]; if (c) m.marker(c.x, c.z, 3); },
    update: (g, m) => {
      const c = name && m.vars[name], P = g.player;
      if (c && c.exploded) { m.fail('The car was destroyed'); return false; }
      if (c) m.marker(c.x, c.z, 3);
      // v10.2: next to the car but not in it - say how (standing at the marker alone does nothing).
      if (c && g.driving.car !== c) m.objective(Math.hypot(P.x - c.x, P.z - c.z) < 7 ? 'Get in: walk up to the car and tap ENTER' : text);
      return name ? g.driving.car === c : P.inCar;
    },
    end: (g, m) => m.marker(null),
  };
}

const loseCops = (text) => ({
  label: text,
  start: (g, m) => { m.objective(text); m.music = 2; },
  update: (g, m) => { if (g.dispatch.stars === 0) { m.music = 1; return true; } return false; },
});

function killGroup(group, text) {
  return {
    label: text,
    start: (g, m) => { m.music = 3; },
    update: (g, m) => {
      const left = alive(g, group), n = m.vars[group + 'N'] || 0;
      m.objective(`${text}: ${n - left} / ${n}`);
      return left === 0;
    },
    end: (g, m) => { m.music = 1; },
  };
}

// Pick up mission items (cash bags, plans, gold): walk or drive over them.
function collect(name, points, text, o = {}) {
  return {
    label: text,
    start: (g, m) => {
      m.vars[name] = 0;
      m.vars[name + 'Items'] = points.map(([x, z]) => m.track(g.pickups.spawn(o.type || 'bag', x, z, {
        auto: true, car: o.car !== false, onTake: () => { m.vars[name]++; if (o.cash) g.rewards.addCash(o.cash, o.label || 'CASH BAG'); else g.music.checkpoint(); },
      })));
    },
    update: (g, m) => {
      const left = m.vars[name + 'Items'].filter((p) => !p.taken);
      g.pins = left.map((p) => ({ x: p.x, z: p.z, color: '#7dff6b' }));
      m.objective(points.length > 1 ? `${text}: ${m.vars[name]} / ${points.length}` : text);
      if (left.length) {
        const T = g.dispatch.target;
        let b = left[0];
        for (const p of left) if (dist(p.x, p.z, T.x, T.z) < dist(b.x, b.z, T.x, T.z)) b = p;
        m.marker(b.x, b.z, 1.5, true);
      }
      return left.length === 0;
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}

// Wreck a car (it blows up). Fails if it gets too far away for too long.
function destroy(name, text, o = {}) {
  let far = 0;
  return {
    label: text,
    start: (g, m) => { m.objective(text); m.music = 2; },
    update: (g, m, dt) => {
      const c = m.vars[name];
      if (!c || c.exploded) return true;
      m.marker(c.x, c.z, 3, true);
      g.hud.setBoss(o.label || 'TARGET', Math.max(0, c.health) / (c.maxHealth || 160));
      const d = dist(c.x, c.z, g.dispatch.target.x, g.dispatch.target.z);
      far = d > (o.maxDist || 260) ? far + dt : 0;
      if (far > 6) m.fail(o.lost || 'The target got away');
      return false;
    },
    end: (g, m) => { m.marker(null); g.hud.setBoss(null); m.music = 1; },
  };
}

// Follow a car without being seen: not too close, not too far.
function tail(name, minD, maxD, text) {
  let close = 0, far = 0;
  return {
    label: text,
    start: (g, m) => m.objective(text),
    update: (g, m, dt) => {
      const c = m.vars[name], T = g.dispatch.target;
      if (!c || c.exploded) { m.fail('The target was killed'); return false; }
      m.marker(c.x, c.z, 3, true);
      const d = dist(c.x, c.z, T.x, T.z);
      close = d < minD ? close + dt : Math.max(0, close - dt);
      far = d > maxD ? far + dt : Math.max(0, far - dt * 0.5);
      const label = d < minD ? 'TOO CLOSE! He will see you' : d > maxD ? 'TOO FAR! Do not lose him' : 'GOOD DISTANCE';
      g.hud.setProgress(label, 1 - Math.min(1, Math.max(close / 3, far / 7)), d < minD || d > maxD ? '#ff5a4d' : '#7dff8a');
      if (close > 3) m.fail('He saw you following him');
      if (far > 7) m.fail('You lost him');
      return c.arrived;
    },
    end: (g, m) => { g.hud.hideProgress(); m.marker(null); },
  };
}

// Stay in a zone for some seconds (crack a vault, wait for the crew, defuse).
function hold(x, z, r, sec, text, o = {}) {
  let t = 0, away = 0;
  return {
    label: text,
    start: (g, m) => { t = 0; away = 0; m.objective(text); m.marker(x, z, r); },
    update: (g, m, dt) => {
      const P = g.player, there = near(g, x, z, r), inZone = there && (o.car ? P.inCar : !P.inCar);
      const strict = o.failOnLeave && t > 0.5;
      if (inZone) { t += dt; away = 0; }
      // Pushed out (police ram you, a wrong turn)? You get 4 seconds to come back before it fails.
      else if (strict) { away += dt; if (away > 4) { m.fail(o.failOnLeave); return false; } }
      if (o.tick) o.tick(g, m, t, dt);
      const outText = (o.outText || 'Get back in the zone!') + (strict ? ` ${Math.ceil(4 - away)}s` : '');
      if (inZone || t > 0) g.hud.setProgress(inZone ? `${o.label || 'HOLD ON'} ${Math.ceil(sec - t)}s` : outText, t / sec, inZone ? '#ffc531' : '#ff5a4d');
      // v10.2: never "nothing happens" - a car cannot always get into the circle (lanes, courtyards).
      else if (!o.car && P.inCar && near(g, x, z, r + 7)) g.hud.setProgress('GET OUT OF THE CAR - walk into the yellow circle', 0, '#ffc531');
      else if (o.car && !P.inCar && there) g.hud.setProgress('GET IN A CAR - this is done from a car', 0, '#ffc531');
      else g.hud.hideProgress();   // not there yet: the marker shows the way
      return t >= sec;
    },
    end: (g, m) => { g.hud.hideProgress(); m.marker(null); },
  };
}

// Several bombs: stand next to each one for a few seconds.
function defuse(points, sec, text, o = {}) {
  const done = points.map(() => false);
  let cur = -1, t = 0;
  return {
    label: text,
    start: (g, m) => m.objective(text),
    update: (g, m, dt) => {
      const T = g.dispatch.target;
      g.pins = points.filter((p, i) => !done[i]).map(([x, z]) => ({ x, z, color: '#ff5a4d' }));
      let best = -1;
      points.forEach(([x, z], i) => { if (!done[i] && (best < 0 || dist(x, z, T.x, T.z) < dist(points[best][0], points[best][1], T.x, T.z))) best = i; });
      if (best >= 0) m.marker(points[best][0], points[best][1], 3, true);
      const dd = best >= 0 ? dist(points[best][0], points[best][1], T.x, T.z) : 99, inside = dd < 3 && !g.player.inCar, close = g.player.inCar && dd < 10;
      if (inside) { if (cur !== best) { cur = best; t = 0; } t += dt; g.hud.setProgress(`${o.doing || 'DEFUSING'}... ${Math.ceil(sec - t)}s`, t / sec, '#ffc531'); }
      else { cur = -1; t = 0; if (close) g.hud.setProgress('GET OUT OF THE CAR - this is done on foot', 0, '#ffc531'); else g.hud.hideProgress(); }
      if (inside && t >= sec) {
        done[best] = true; cur = -1; t = 0; g.hud.hideProgress();
        g.rewards.event(o.label || 'BOMB DEFUSED', 300, 20);
        if (o.onEach) o.onEach(g, m, best, done.filter(Boolean).length);
      }
      m.objective(`${text}: ${done.filter(Boolean).length} / ${points.length}`);
      return done.every(Boolean);
    },
    end: (g, m) => { g.pins = []; g.hud.hideProgress(); m.marker(null); },
  };
}

function cutscene(o) {
  let finished = false;
  return {
    start: (g, m) => { finished = false; g.cutscene({ ...o(g, m), onDone: () => { finished = true; } }); },
    update: () => finished,
  };
}

// 3, 2, 1, GO! (cars wait at the line)
function countdown() {
  let t = 0, shown = 4;
  return {
    start: (g) => { t = 0; shown = 4; g.raceHold = true; g.raceGo = false; },
    update: (g, m, dt) => {
      t += dt;
      const n = 3 - Math.floor(t);
      if (n !== shown && n >= 0) { shown = n; g.hud.countdown(n > 0 ? String(n) : 'GO!'); g.music.beep(n === 0); }
      if (t >= 3) { g.raceHold = false; g.raceGo = true; return true; }
      return false;
    },
  };
}

function race(cps, text) {
  let pi = 0;
  return {
    label: text,
    start: (g, m) => { pi = 0; m.objective(text); m.marker(cps[0].x, cps[0].z, 9, true); m.music = 2; },
    update: (g, m) => {
      const T = g.dispatch.target, cp = cps[pi];
      if (dist(T.x, T.z, cp.x, cp.z) < 12) {
        pi++; g.music.checkpoint();
        if (pi >= cps.length) {
          const ahead = (m.vars.racers || []).filter((r) => r.finished).length;
          m.vars.place = ahead + 1;
          g.hud.setRace(null);
          if (ahead > 0) m.fail(`You came ${ord(ahead + 1)}. Only 1st place wins!`);
          return ahead === 0;
        }
        const nx = cps[pi];
        m.marker(nx.x, nx.z, pi === cps.length - 1 ? 9 : 9, true);
      }
      m.vars.playerProgress = pi * 100000 - dist(T.x, T.z, cps[Math.min(pi, cps.length - 1)].x, cps[Math.min(pi, cps.length - 1)].z);
      const pos = 1 + (m.vars.racers || []).filter((r) => r.finished || r.progress > m.vars.playerProgress).length;
      g.hud.setRace(`${ord(pos)} / ${(m.vars.racers || []).length + 1}`, pi === cps.length - 1 ? 'FINAL STRETCH!' : `CHECKPOINT ${pi + 1} / ${cps.length}`);
      return false;
    },
    end: (g, m) => { m.marker(null); g.hud.setRace(null); m.music = 1; },
  };
}
const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

function driftChallenge(target, sec) {
  let t = 0;
  return {
    label: `Score ${target.toLocaleString('en-IN')} drift points`,
    start: (g, m) => { t = sec; m.stats.drift = 0; m.objective(`Score ${target.toLocaleString('en-IN')} drift points: hold DRIFT in the turns`); m.music = 2; },
    update: (g, m, dt) => {
      t -= dt;
      const score = (m.stats.drift || 0) + g.driving.driftPts;
      g.hud.setProgress(`DRIFT ${Math.round(score).toLocaleString('en-IN')} / ${target.toLocaleString('en-IN')} · ${Math.ceil(t)}s`, score / target, '#c86bff');
      m.vars.driftLeft = t;
      if (score >= target) { g.driving.bankDrift(); return true; }
      if (t <= 0) m.fail('Not enough drift points');
      return false;
    },
    end: (g) => g.hud.hideProgress(),
  };
}

// Keep the van above a speed or the bomb goes off. The bomb arms once you reach the speed
// (or after 6 seconds), so you have time to get going.
function speedBomb(name, minKmh, sec, events) {
  let t = 0, low = 0, beepT = 0, ev = 0, armed = false, armT = 0;
  return {
    label: `Keep above ${minKmh} km/h or the bomb explodes`,
    start: (g, m) => { t = sec; low = 0; ev = 0; armed = false; armT = 0; m.objective(`Speed up! The bomb arms at ${minKmh + 5} km/h`); m.music = 2; },
    update: (g, m, dt) => {
      const van = m.vars[name];
      const kmh = g.driving.car === van ? g.driving.kmh : 0;
      if (!armed) {
        armT += dt;
        g.hud.setProgress(`SPEED UP TO ${minKmh + 5} km/h · ${kmh} km/h`, kmh / (minKmh + 5), '#8fe3ff');
        if (kmh >= minKmh + 5 || armT > 6) { armed = true; g.hud.showBig('BOMB ARMED!', '#ff4438', 1.6); m.objective(`Keep above ${minKmh} km/h or the bomb explodes!`); }
        return false;
      }
      if (kmh < minKmh) { low += dt; beepT -= dt; if (beepT <= 0) { beepT = 0.25; g.music.beep(false); } }
      else low = Math.max(0, low - dt);
      if (low > 3) {
        van.health = -999; van.wrecked = true; van.explode();
        m.fail('The bomb exploded'); return false;
      }
      t -= dt;
      while (ev < events.length && sec - t >= events[ev][0]) { events[ev][1](g, m); ev++; }
      g.hud.setProgress(low > 0 ? `SPEED UP! ${kmh} km/h` : `BOMB TIMER ${Math.ceil(t)}s · ${kmh} km/h`, t / sec, low > 0 ? '#ff3b30' : '#ffc531');
      return t <= 0;
    },
    end: (g) => g.hud.hideProgress(),
  };
}

// A boss fight: boss bar on screen; optional phase change when his health is low.
function bossFight(name, text) {
  return {
    label: text,
    start: (g, m) => { m.objective(text); m.music = 3; },
    update: (g, m) => {
      const b = m.vars[name];
      if (!b) return true;
      if (b.inactive && !b.dead) { g.hud.setBoss(null); return true; }   // ran away (next phase)
      g.hud.setBoss(b.bossName, Math.max(0, b.health) / b.maxHealth);
      if (b.dead) { g.hud.setBoss(null); return true; }
      return false;
    },
    end: (g, m) => { g.hud.setBoss(null); m.music = 1; },
  };
}

// ---------- The missions ----------
export const MISSIONS = [
  // ===================== CHAPTER 1: STREET ESCAPE =====================
  {
    id: 1, title: 'Run, Vikram!', brief: 'The jewellery heist went wrong. The police saw your face. Get away from them!',
    reward: 500, timer: 150, par: [60, 100], next: 'Ravi says: "You need wheels. Steal a car."',
    steps: () => [
      place(...START),
      say([['RAVI (phone)', 'Vikram! The cops have your photo. RUN! Lose them, then call me.']]),
      wait(1.2),
      act((g) => g.dispatch.setStars(1)),
      loseCops('Lose the police: get out of the red circle on the map and stay out of sight'),
      say([['RAVI (phone)', 'You lost them? Shabash! Now get a car.']]),
    ],
  },
  {
    id: 2, title: 'Wheels', brief: 'You need a car. Take one from the street and bring it to Ravi\'s garage.',
    reward: 700, timer: 150, par: [70, 110], next: 'Ravi is waiting at the old warehouse...',
    steps: () => [
      place(...START),
      say([['RAVI (phone)', 'Get a car, any car. Bring it to my garage near downtown. Quietly!']]),
      getIn(null, 'Steal a car: walk up to any car and tap ENTER'),
      goTo(GARAGE.x, GARAGE.z, 6, 'Drive to Ravi\'s garage (follow the yellow line)', { car: true }),
      say([['RAVI (phone)', 'Nice car! Leave it there. Now come to the old warehouse.']]),
    ],
  },
  {
    id: 3, title: 'Meet Ravi', brief: 'Ravi is waiting at the old warehouse, hidden behind the buildings north of downtown.',
    reward: 400, timer: 150, par: [70, 110], next: 'The police followed you to the warehouse!',
    steps: () => [
      place(-68.5, -30, 0),
      act((g, m) => { g.ravi = m.track(spawnRavi(g)); }),
      goTo(WAREHOUSE.door.x, WAREHOUSE.door.z - 2.5, 3, 'Go to the old warehouse (yellow marker). Use the narrow lanes between buildings.', { foot: true }),
      cutscene((g) => {
        const r = g.ravi;
        return {
          from: [r.x + 3.5, 1.9, r.z - 4.2], at: [(r.x + g.player.x) / 2, 1.35, (r.z + g.player.z) / 2], faces: [[r, g.player], [g.player, r]],
          lines: [['RAVI', 'Bhai! You made it. I thought the cops had you.'], ['VIKRAM', 'They almost did. Somebody tipped them off, Ravi.'],
            ['RAVI', 'We will find out who. Take this - you will need it tonight.'], ['', 'You got an SMG (90 rounds).']],
        };
      }),
      act((g) => { g.player.giveWeapon('smg', 90); g.player.weapon = 'smg'; if (!g.save.weapons.includes('smg')) g.save.weapons.push('smg'); }),
    ],
  },
  {
    id: 4, title: 'Warehouse Shootout', brief: 'The police followed you to the warehouse. Fight them off with Ravi. Use the crates as cover!',
    reward: 900, par: [70, 120], next: 'Three stars and the whole police force is coming...',
    setup: (g, m) => { m.holdStars = true; },
    watch: (g, m, dt) => allyFight(g, m, g.ravi, dt),
    steps: () => [
      place(-35, 31, PI),
      act((g, m) => { g.player.giveWeapon('smg', 120); g.player.weapon = 'smg'; g.ravi = m.track(spawnRavi(g)); g.ravi.x = -40; g.ravi.z = 33; }),
      say([['RAVI', 'Police! They followed you! Take cover behind the crates!']]),
      wait(1.6),
      act((g, m) => { g.dispatch.setStars(3); police(g, m, [[-47.67, 15], [-27.33, 15], [-47.67, 18], [-27.33, 18]], { group: 'w1' }); }),
      killGroup('w1', 'Defeat the police raid'),
      say([['RAVI', 'More are coming from the back lanes!']]),
      act((g, m) => police(g, m, [[-59, 25], [-16, 25], [-59, 50], [-16, 50]], { group: 'w2', swat: true })),
      killGroup('w2', 'Stop the SWAT team'),
      say([['RAVI', 'That is all of them. Now we MUST get out of here!']], true),
    ],
  },
  {
    id: 5, title: 'Getaway', brief: 'Three stars and the whole police force is coming. Get to the getaway car and lose them!',
    reward: 1500, timer: 180, par: [90, 140], next: 'Ravi\'s cousin Sunny races on Marine Drive...',
    steps: () => [
      place(-35, 30, PI),
      act((g, m) => { g.player.giveWeapon('smg', 90); g.ravi = m.track(spawnRavi(g)); parkedCar(g, m, 'suv', 0x1d1e22, -35, 2.25, -PI / 2, 'car'); }),
      say([['RAVI', 'The black SUV is outside on the main road. GO! I will meet you later.']]),
      wait(1.2),
      act((g) => g.dispatch.setStars(3)),
      getIn('car', 'Get to the black getaway SUV (yellow marker)'),
      loseCops('Lose the police! Get out of the red search circle and stay out of sight'),
    ],
  },
  {
    id: 6, title: 'Hot Wheels', brief: 'Sunny runs the street races on Marine Drive. Win the race in his tuned coupe for big cash.',
    reward: 2000, par: [70, 85], next: 'Sunny heard who tipped off the police: a man called Pappu.',
    steps: () => [
      act((g, m) => {
        g.raceGo = false; g.raceHold = true;
        const car = parkedCar(g, m, 'sports', 0xf2c21b, 195, -222.8, -PI / 2, 'mine');
        g.placePlayer(197, -219, -PI / 2);
        g.driving.enter(car);
        const colors = [0xd62828, 0x1d70b8, 0x2a9d8f];
        m.vars.racers = [[195, -227.2], [203, -222.8], [203, -227.2]].map(([x, z], i) =>
          missionCar(g, m, 'sports', colors[i], { mode: 'race', cps: RACE_CPS, top: 33 + i, skill: 0.95 + i * 0.03, lane: i === 1 ? 0 : (i ? 2.2 : -2.2), health: 400 }, { x, z, yaw: -PI / 2 }));
        g.camera3p.snapBehind();
      }),
      say([['SUNNY', 'Welcome to Marine Drive! One lap of the city. Win, and the cash is yours. Use BOOST!']]),
      countdown(),
      race(RACE_CPS, 'WIN THE RACE! Follow the checkpoints'),
      act((g) => g.slowmo(1.2, 0.35)),
      say([['SUNNY', 'WHAT A DRIVE! You are a natural, bhai!']]),
    ],
    rate: (g, m) => (m.elapsed < 70 ? 3 : m.elapsed < 85 ? 2 : 1),
  },
  {
    id: 7, title: 'The Informer', brief: 'Pappu sold you to the police. He is at the bazaar. Chase him down and make him talk.',
    reward: 1600, timer: 210, par: [100, 150], next: 'Rana... the police boss himself.',
    steps: () => [
      place(...START),
      act((g, m) => parkedCar(g, m, 'sedan', 0x22468f, ...NEAR_CAR, 'car')),
      say([['RAVI (phone)', 'The rat is Pappu. He hangs around the bazaar near the beach. Bring him to me!']]),
      getIn(null, 'Get in a car (walk up to any car, tap ENTER)'),
      goTo(BAZAAR_ROAD.x, BAZAAR_ROAD.z, 22, 'Drive to the bazaar (follow the yellow line)', { car: true }),
      act((g, m) => {
        missionCar(g, m, 'hatchback', 0xf2f2f2, { mode: 'flee', health: 160, hostile: true, fastBurn: true, name: 'target', speed: 21 }, { node: true, x: BAZAAR_ROAD.x - 30, z: -75, hx: -1, hz: 0 });
        m.vars.target.maxHealth = 160;
        m.vars.target.onExploded = () => {
          const c = m.vars.target;
          const p = new AmbientPerson(g, c.x + 2.5, c.z + 2.5, 0, { rig: new CharacterRig('m_delivery', { castShadow: g.shadows }), flee: true, fromX: g.player.x, fromZ: g.player.z, invincible: true });
          g.ambient.push(p); m.track(p); m.vars.pappu = p;
          g.dispatch.setStars(2);
        };
      }),
      say([['PAPPU', 'Vikram?! Bhaago! (He jumps in his car)']]),
      destroy('target', 'Pappu is running! Ram or shoot his car until it blows up', { label: "PAPPU'S CAR", lost: 'Pappu got away' }),
      act((g) => g.slowmo(1.0, 0.3)),
      waitFor('Pappu crawled out! Catch him on foot', (g, m) => {
        const p = m.vars.pappu;
        if (!p) return true;
        m.marker(p.x, p.z, 2, true);
        return !g.player.inCar && dist(p.x, p.z, g.player.x, g.player.z) < 2;
      }),
      cutscene((g, m) => {
        const p = m.vars.pappu; p.state = 'idle'; p.calm = true;
        return { from: [p.x + 3, 1.8, p.z + 3], at: [p.x, 1.2, p.z], faces: [[p, g.player], [g.player, p]],
          lines: [['PAPPU', 'Don\'t shoot! It was Inspector RANA! He pays me to watch you!'], ['VIKRAM', 'Rana... the police boss himself.'], ['PAPPU', 'He wants the gold, Vikram. He always wants the gold.']] };
      }),
      act((g, m) => { m.marker(null); }),
      loseCops('Lose the police'),
    ],
  },
  {
    id: 8, title: 'Cash Run', brief: 'Kaali\'s gang stole Ravi\'s cash and hid it in 8 bags around town. Get it back before they move it!',
    reward: 1200, timer: 200, par: [120, 160], next: 'Kaali is angry. Very angry.',
    steps: () => [
      place(...START),
      act((g, m) => {
        parkedCar(g, m, 'hatchback', 0xd62828, ...NEAR_CAR, 'car');
        gang(g, m, [[-34, 30], [-42, 27], [-30, 26]], { group: 'g1', post: true });
        gang(g, m, [[33, 110], [42, 114]], { group: 'g2', post: true });
        gang(g, m, [[-108, 52], [-117, 48]], { group: 'g3', post: true });
      }),
      say([['RAVI (phone)', 'Kaali\'s boys hid our money in 8 bags around town. Some bags are guarded. Get them ALL!']]),
      collect('bags', [[37.5, 41], [-37.5, 29], [37.5, 112.5], [108, 41], [37.5, -31], [-112.5, 51], [-37.5, 106], [112.5, -31]],
        'Collect the cash bags', { cash: 250, label: 'CASH BAG' }),
      goTo(CHAI.x - 1.2, CHAI.z, 3, 'Bring the money to Ravi at the chai stall', {}),
      say([['RAVI', 'All of it! You are a legend, Vikram. Chai is on me.']]),
    ],
  },
  {
    id: 9, title: 'Speed Breaker', brief: 'Kaali put a bomb in Ravi\'s van. Go under 50 km/h and it explodes. Then get rid of it!',
    reward: 2500, par: [150, 175], next: 'Kaali has Ravi\'s brother at the bazaar!',
    steps: () => [
      act((g, m) => {
        const van = parkedCar(g, m, 'suv', 0xf4f4f4, 200, -222.8, -PI / 2, 'van');
        van.health = 260;   // a tough van: the police will ram it a lot
        g.placePlayer(201, -219, -PI / 2);
        g.driving.enter(van);
        g.driving.vx = -19.5; g.driving.vz = 0;
        g.camera3p.snapBehind();
      }),
      say([['RAVI (phone)', 'Vikram! Kaali put a BOMB in the van! Under 50 km/h and it blows! KEEP MOVING!']]),
      speedBomb('van', 50, 100, [
        [20, (g) => { g.dispatch.setStars(2); g.hud.toast('POLICE: STOP THAT VAN!'); }],
        [55, (g) => g.say([['RAVI (phone)', 'Watch the traffic! Do NOT slow down!']])],
        [80, (g) => g.say([['RAVI (phone)', 'Almost there! The bomb man says: throw it in the sea!']])],
      ]),
      goTo(112.5, -226, 4, 'Drive off the ramp on Marine Drive into the sea! (keep speed)', { withCar: 'van', carText: 'Get back in the van!' }),
      waitFor('JUMP!', (g, m) => g.driving.air || g.player.z < -238 || !g.player.inCar),
      act((g, m) => { const v = m.vars.van; v.fastBurn = false; v.health = 0; v.wrecked = true; v.burnT = 2.6; v.hold = true; g.hud.showBig('GET OUT NOW!', '#ff4438', 2); }),
      waitFor('Get out of the van NOW!', (g, m) => m.vars.van.exploded),
      act((g) => { if (g.player.dead) return; g.slowmo(1.0, 0.3); }),
      loseCops('You made it! Now lose the police'),
    ],
  },
  {
    id: 10, title: 'Bazaar Ambush', brief: 'Kaali\'s men grabbed Ravi\'s brother Sonu at the bazaar. Fight through and end Kaali.',
    reward: 4000, par: [180, 260], chapterEnd: 1, next: 'CHAPTER 2: The gold of Navapur...',
    watch: (g, m, dt) => allyFight(g, m, g.ravi, dt),
    onBossHit: (g, m, b) => {
      if (b === m.vars.kaali && !m.vars.fled && b.health > 0 && b.health < b.maxHealth * 0.35) {
        m.vars.fled = true;
        g.hud.toast('KAALI IS RUNNING TO HIS CAR!');
        b.remove();
        missionCar(g, m, 'suv', 0x101010, { mode: 'flee', health: 220, hostile: true, fastBurn: true, name: 'kaaliCar', speed: 22 }, { node: true, x: -160, z: -75, hx: 1, hz: 0 });
        m.vars.kaaliCar.maxHealth = 220;
      }
    },
    steps: () => [
      place(...START),
      act((g, m) => { parkedCar(g, m, 'sedan', 0x1d1e22, ...NEAR_CAR, 'car'); g.player.giveWeapon('smg', 120); }),
      say([['RAVI (phone)', 'Kaali grabbed my brother Sonu at the bazaar! Bring your guns, bhai. I am coming too!']]),
      getIn(null, 'Get in a car (walk up to any car, tap ENTER)'),
      goTo(BAZAAR_ROAD.x, BAZAAR_ROAD.z, 16, 'Drive to the bazaar', { car: true }),
      act((g, m) => {
        g.ravi = m.track(spawnRavi(g)); g.ravi.x = BAZAAR_ROAD.x + 3; g.ravi.z = BAZAAR_ROAD.z - 4; g.ravi.calm = true;
        gang(g, m, [[-195, -105], [-186, -108], [-180, -116], [-192, -118], [-184, -101], [-178, -106]], { group: 'bz' });
      }),
      say([['RAVI', 'They are inside, between the stalls. Go in through the lanes. I have your back!']]),
      killGroup('bz', 'Clear the bazaar'),
      act((g, m) => {
        const k = g.spawnOfficer(-187, -122, 0, null, { gang: true, hostile: true, boss: true, name: 'KAALI', model: 'm_office', weapon: 'smg', health: 650, damage: 1.2 });
        m.track(k); m.vars.kaali = k;
        gang(g, m, [[-193, -123], [-181, -123]], { group: 'kg', weapon: 'smg' });
      }),
      say([['KAALI', 'Vikram! You took my money. Now I take your life!']]),
      bossFight('kaali', 'Take down KAALI'),
      destroy('kaaliCar', 'Kaali is escaping! Wreck his black SUV', { label: "KAALI'S SUV", lost: 'Kaali got away' }),
      act((g, m) => { g.slowmo(1.4, 0.25); g.hud.showBig('KAALI IS FINISHED', '#ffc531', 2.5); g.rewards.event('KAALI TAKEN DOWN', 1500, 120); g.dispatch.setStars(3); }),
      say([['RAVI', 'Sonu is safe! Kaali is finished! Now get us out of here!']]),
      loseCops('Lose the police to finish Chapter 1'),
    ],
  },

  // ===================== CHAPTER 2: CITY OF GOLD =====================
  {
    id: 11, title: 'The Inside Man', brief: 'Mehta runs the Gold Exchange. Follow his car to his secret meeting. Not too close!',
    reward: 1800, par: [100, 140], next: 'The gold moves in 3 days. You need a police car.',
    steps: () => [
      act((g, m) => {
        const car = parkedCar(g, m, 'hatchback', 0x6b6e73, -25, -2.25, PI / 2, 'mine');
        g.placePlayer(-25, -6, PI / 2); g.driving.enter(car); g.camera3p.snapBehind();
        missionCar(g, m, 'sedan', 0xf2f2f2, { mode: 'tail', name: 'mehta', speed: 11, dest: { x: 40, z: -222.75 }, health: 300 }, { node: true, x: GOLD_CAR.x + 4, z: GOLD_CAR.z, hx: 1, hz: 0 });
        m.vars.rana = m.track(new AmbientPerson(g, 44, -218.5, PI, { rig: new CharacterRig('police', { castShadow: g.shadows }), invincible: true }));
        m.vars.rana.calm = true; g.ambient.push(m.vars.rana);
      }),
      say([['RAVI (phone)', 'That white car is Mehta, the Gold Exchange manager. Follow him - but if he sees you, it is over.']]),
      tail('mehta', 14, 95, 'Follow Mehta\'s white car. Not too close, not too far!'),
      cutscene((g, m) => {
        const r = m.vars.rana, c = m.vars.mehta;
        return { from: [c.x - 8, 3.2, c.z + 10], at: [r.x, 1.4, r.z], faces: [],
          lines: [['RANA', 'Mehta. Is the gold ready?'], ['MEHTA', 'Fifty kilos, Inspector. The van leaves the Marine Palace vault in three days.'],
            ['RANA', 'Good. And if that thief Vikram comes near it... shoot him.'], ['VIKRAM (whisper)', 'Fifty kilos... Ravi, we are going to be rich.']] };
      }),
    ],
  },
  {
    id: 12, title: 'Police Supply', brief: 'For the big job you need a police SUV. Steal one from the police parking and bring it to the garage in one piece.',
    reward: 2200, par: [110, 160], next: 'Kaali\'s last men want revenge...',
    steps: () => [
      place(95, -68, PI),
      act((g, m) => {
        for (const [x, i] of [[119.8, 0], [109.8, 1], [99.8, 2]]) { const c = g.spawnPoliceCarParked(x, -81.5, PI / 2); c.missionCar = true; m.track(c); if (i === 1) m.vars.pick = c; }
        for (const [x, z] of [[114.8, -84.5], [104.8, -84.5]]) m.track(g.spawnOfficer(x, z, 0, null, {}));
      }),
      say([['RAVI (phone)', 'Take a police SUV from the parking across the road. They WILL chase you. Bring it to my garage - no scratches!']]),
      waitFor('Steal a police SUV', (g, m) => {
        const c = g.driving.car; if (c && c.isPolice) { m.vars.car = c; return true; }
        const k = m.vars.pick, P = g.player; m.marker(k.x, k.z, 3);
        m.objective(Math.hypot(P.x - k.x, P.z - k.z) < 7 ? 'Get in: walk up to the police SUV and tap ENTER' : 'Steal a police SUV');   // v10.2
        return false;
      }),
      act((g, m) => { m.marker(null); g.dispatch.setStars(3); g.hud.toast('ALL UNITS: STOLEN POLICE VEHICLE!'); }),
      waitFor('Drive it to Ravi\'s garage. Keep it in one piece!', (g, m) => {
        const c = m.vars.car;
        if (c.exploded || c.health < 35) { m.fail('The police SUV is too damaged'); return false; }
        g.hud.setProgress(`SUV HEALTH ${Math.round(c.health)}%`, c.health / 100, c.health > 60 ? '#7dff8a' : '#ff5a4d');
        m.marker(GARAGE.x, GARAGE.z, 6);
        return g.driving.car === c && near(g, GARAGE.x, GARAGE.z, 6);
      }),
      act((g, m) => { g.hud.hideProgress(); m.marker(null); g.dispatch.clear(false); g.hud.showBig('HIDDEN IN THE GARAGE', '#4dff66', 2); }),
    ],
    rate: (g, m) => (m.vars.car.health > 80 ? 3 : m.vars.car.health > 55 ? 2 : 1),
  },
  {
    id: 13, title: 'Chai Stall Rumble', brief: 'Kaali\'s leftover gang is coming for Ravi\'s chai stall. Defend it with Ravi!',
    reward: 2400, par: [150, 220], next: 'Sunny has a new challenge: drifting.',
    watch: (g, m, dt) => allyFight(g, m, g.ravi, dt),
    steps: () => [
      place(6.6, 26, -PI / 2),
      act((g, m) => { g.player.giveWeapon('smg', 150); g.ravi = m.track(spawnRavi(g)); g.ravi.x = 7.2; g.ravi.z = 34; g.ravi.calm = true; }),
      say([['RAVI', 'They are coming in cars! Shoot the cars or wait for them to jump out!']]),
      act((g, m) => {
        const drop = (sx, sz, hz, dx, dz) => missionCar(g, m, 'suv', 0x2b2b2b, { mode: 'deploy', hostile: true, health: 160, dest: { x: dx, z: dz }, onArrive: (c) => {
          gang(g, m, [[c.x - 2.6, c.z - 1], [c.x - 2.6, c.z + 1], [c.x + 2.6, c.z]], { group: 'r1' });
        } }, { node: true, x: sx, z: sz, hx: 0, hz });
        drop(2.25, 120, -1, 0, 44); drop(-2.25, -60, 1, 0, 16);
      }),
      waitFor('Gang cars incoming! Shoot them or wait for them to stop', (g, m) => m.ents.filter((e) => e.isCar && e.mode === 'deploy' && (e.arrived || e.exploded)).length >= 2 || m.elapsed > 40),
      killGroup('r1', 'Defend the chai stall'),
      act((g, m) => gang(g, m, [[30, 8], [38, 8], [-6.9, 45], [-6.9, 52], [20, 66]], { group: 'r2', weapon: 'smg' })),
      say([['RAVI', 'Second wave! Watch the corners!']]),
      killGroup('r2', 'Defend the chai stall'),
      act((g, m) => {
        missionCar(g, m, 'hatchback', 0x8e3a85, { mode: 'flee', health: 140, hostile: true, fastBurn: true, name: 'thief', speed: 20 }, { node: true, x: 2.25, z: 50, hx: 0, hz: 1 });
        m.vars.thief.maxHealth = 140;
      }),
      say([['RAVI', 'One of them grabbed the cash box! STOP THAT CAR!']]),
      destroy('thief', 'Wreck the car with the cash box', { label: 'CASH BOX CAR' }),
      act((g, m) => { g.rewards.event('CASH BOX SAVED', 800, 40); }),
    ],
  },
  {
    id: 14, title: 'Drift King', brief: 'Sunny says real drivers drift. Score 5,000 drift points in 90 seconds.',
    reward: 2000, par: [0, 0], next: 'The heist crew needs a getaway driver.',
    steps: () => [
      act((g, m) => {
        const car = parkedCar(g, m, 'sports', 0xff5d8f, -40, -77.25, PI / 2, 'mine');
        g.placePlayer(-40, -73, PI / 2); g.driving.enter(car); g.camera3p.snapBehind();
      }),
      say([['SUNNY', 'Hold DRIFT in the corners and slide! The longer the slide, the bigger the points. GO!']]),
      driftChallenge(5000, 90),
      say([['SUNNY', 'Smoke everywhere! DRIFT KING!']]),
    ],
    rate: (g, m) => ((m.vars.driftLeft || 0) > 35 ? 3 : (m.vars.driftLeft || 0) > 15 ? 2 : 1),
  },
  {
    id: 15, title: 'Getaway Driver', brief: 'Ravi and Sonu rob the Gold Exchange counter. You wait outside, then lose a 4-star chase.',
    reward: 3500, par: [130, 190], next: 'Sunny wants a courier who can fly...',
    steps: () => [
      act((g, m) => {
        const car = parkedCar(g, m, 'sports', 0x101010, -30, -2.25, PI / 2, 'car');
        g.placePlayer(-30, -6, PI / 2); g.driving.enter(car); g.camera3p.snapBehind();
      }),
      say([['RAVI', 'Park right outside the Gold Exchange. Keep the engine running. Two minutes, bhai.']]),
      goTo(GOLD_CAR.x, GOLD_CAR.z, 5, 'Stop outside the Gold Exchange', { withCar: 'car', carText: 'Get back in the car!' }),
      act((g, m) => {
        const c = m.vars.car;
        for (const [id, dx] of [['ravi', -0.6], ['m_tee', 0.6]]) {
          const p = new AmbientPerson(g, c.x + dx, c.z - 2.4, PI, { rig: new CharacterRig(id, { castShadow: g.shadows }), invincible: true });
          p.calm = true; p.walkTo = { x: GOLD_DOOR.x + dx, z: GOLD_DOOR.z }; g.ambient.push(p); m.track(p);
          (m.vars.crew = m.vars.crew || []).push(p);
        }
      }),
      hold(GOLD_CAR.x, GOLD_CAR.z, 7, 20, 'Wait for the crew. Do NOT drive away!', {
        car: true, label: 'CREW INSIDE', failOnLeave: 'You left the crew behind!', outText: 'GO BACK!',
        tick: (g, m, t) => {
          if (t > 3 && !m.vars.hidden) { m.vars.hidden = true; for (const p of m.vars.crew) p.mesh.visible = false; }
          if (t > 9 && !m.vars.alarm) { m.vars.alarm = true; g.hud.toast('ALARM! The police are coming!'); g.dispatch.setStars(2); }
          if (t > 16 && !m.vars.out) { m.vars.out = true; for (const p of m.vars.crew) { p.mesh.visible = true; p.walkTo = { x: m.vars.car.x, z: m.vars.car.z - 1 }; } }
        },
      }),
      act((g, m) => { for (const p of m.vars.crew) p.remove(); g.dispatch.setStars(4); g.hud.showBig('GO GO GO!', '#ffc531', 1.6); }),
      say([['RAVI', 'We got it! DRIVE! Lose them - and that helicopter!']]),
      loseCops('Lose the police (4 stars, helicopter!)'),
    ],
  },
  {
    id: 16, title: 'Stunt Courier', brief: 'Deliver Sunny\'s package across town. Jump the ramps in the parks to save time!',
    reward: 2200, timer: 120, par: [75, 95], next: 'Kaali\'s old warehouse is guarded. Time to be a ghost.',
    steps: () => [
      act((g, m) => {
        g.raceGo = false; g.raceHold = true;
        const car = parkedCar(g, m, 'sports', 0x2ec4b6, -140, 2.25, -PI / 2, 'car');
        g.placePlayer(-140, 6, -PI / 2); g.driving.enter(car); g.camera3p.snapBehind();
      }),
      say([['SUNNY', 'Through the parks! Hit the yellow ramps at full speed. Each jump = time bonus!']]),
      countdown(),
      race(STUNT_CPS, 'Follow the checkpoints - jump over the fountains!'),
      act((g) => g.slowmo(0.8, 0.4)),
    ],
  },
  {
    id: 17, title: 'Ghost', brief: 'Rana\'s men guard the vault plans in the old warehouse. Sneak in. Silent takedowns only for a 3-star ghost.',
    reward: 3000, par: [150, 240], next: 'Rana is setting bombs to frame you...',
    onAlert: (g, m) => { if (!m.vars.detected) { m.vars.detected = true; g.hud.showBig('YOU WERE SEEN!', '#ff4438', 2); m.music = 3; } },
    steps: () => [
      place(-47.67, 6.2, 0),
      act((g, m) => {
        const routes = [[[-49, 27], [-27, 27]], [[-49.5, 31], [-49.5, 50]], [[-25, 50], [-25, 31]], [[-47, 49], [-29, 49]], [[-38, 35.2]]];
        for (const r of routes) m.track(g.spawnOfficer(r[0][0], r[0][1], 0, null, { gang: true, model: pick(GANG), weapon: 'smg', patrol: r, group: 'guards' }));
        m.vars.intel = m.track(g.pickups.spawn('intel', -40.5, 37.2, { auto: true, car: false, onTake: () => g.music.checkpoint() }));
        g.player.crouching = true;
      }),
      say([['RAVI (phone)', 'Stay low (CROUCH). Guards see in front of them - the cone on your map. Sneak behind one and press TAKEDOWN.']]),
      waitFor('Steal the vault plans from the shed door (don\'t be seen)', (g, m) => { const p = m.vars.intel; m.marker(p.x, p.z, 1.5, true); return p.taken; }),
      act((g, m) => { m.marker(null); g.rewards.event('VAULT PLANS', 500, 30); }),
      goTo(-47.67, 4, 4, 'Get out the way you came in'),
    ],
    rate: (g, m) => (m.vars.detected ? 1 : m.elapsed < 150 ? 3 : 2),
  },
  {
    id: 18, title: 'Bomb Squad', brief: 'Rana planted 4 bombs to blame you. Find and defuse them all before they go off!',
    reward: 3000, timer: 240, par: [150, 200], next: 'Tonight: the Marine Palace vault.',
    steps: () => [
      place(...START),
      act((g, m) => {
        parkedCar(g, m, 'sports', 0xef476f, ...NEAR_CAR, 'car');
        gang(g, m, [[-33, -33], [-42, -28]], { group: 'b2', post: true });
        gang(g, m, [[183, 26], [192, 27]], { group: 'b4', post: true, weapon: 'smg' });
      }),
      say([['RAVI (phone)', 'Four bombs! Marine Drive, downtown plaza, the bazaar, the gardens. Stand next to each one to defuse it. HURRY!']]),
      defuse([[0, -233], [-37.5, -31], [37.5, 112], [187.5, 30]], 4, 'Defuse the bombs'),
      say([['RAVI', 'All four! The news calls you a mystery hero. Rana will be furious!']]),
    ],
  },
  {
    id: 19, title: 'The Big Heist', brief: 'The Marine Palace vault. Crack it, grab the gold, survive SWAT and reach the boat on the beach.',
    reward: 8000, timer: 300, par: [180, 250], next: 'Rana wants his gold back. Final showdown.',
    watch: (g, m, dt) => {
      if (m.vars.waves && !m.vars.wavesDone) {
        m.vars.waveT = (m.vars.waveT ?? 4) - dt;
        if (m.vars.waveT <= 0) { m.vars.waveT = 9; police(g, m, [[27.33, -206], [47.67, -206], [37.5, -175]], { swat: true, group: 'swat' }); }
      }
    },
    steps: () => [
      act((g, m) => {
        const c = g.spawnPoliceCarParked(60, -147.75, -PI / 2); c.missionCar = true; m.track(c); m.vars.car = c;
        g.placePlayer(60, -144, -PI / 2); g.driving.enter(c); g.camera3p.snapBehind();
        g.player.giveWeapon('smg', 150);
        m.vars.boat = m.track(g.world.makeBoat(75, -256, 0xffffff));
      }),
      say([['RAVI (phone)', 'Park the police SUV behind the Marine Palace. Nobody stops a police car. Then go for the vault!']]),
      goTo(47.67, -222.75, 7, 'Drive to the Marine Palace (seafront)', { withCar: 'car', carText: 'Get back in the police SUV' }),
      goTo(37.5, -198, 3, 'Go through the lane to the hotel courtyard: the vault door', { foot: true }),
      act((g, m) => { g.dispatch.setStars(4); m.holdStars = true; m.vars.waves = true; g.hud.showBig('CRACK THE VAULT!', '#ffc531', 1.6); }),
      hold(37.5, -198, 3.5, 30, 'Crack the vault: stay at the door and fight off SWAT', { label: 'CRACKING VAULT' }),
      act((g, m) => { m.vars.wavesDone = true; m.vars.gold = m.track(g.pickups.spawn('gold', 37.5, -199.5, { auto: true, car: false })); }),
      waitFor('Grab the gold!', (g, m) => { m.marker(37.5, -199.5, 1.5, true); return m.vars.gold.taken; }),
      act((g, m) => { m.marker(null); g.player.carrying = true; m.holdStars = false; g.dispatch.setStars(5); g.rewards.event('50 KG GOLD!', 2000, 80); }),
      say([['RAVI (phone)', 'The boat is on the beach, east of the hotel! Run down the steps! GO!']]),
      goTo(75, -247.5, 5, 'Get to the boat on the beach (use the steps in the sea wall)', {}),
      act((g) => { g.player.carrying = false; }),
      cutscene((g, m) => {
        const b = m.vars.boat;
        g.player.mesh.visible = false;
        b.userData.sail = true;
        return { from: [60, 4, -238], at: [b.position.x, 1, b.position.z], faces: [],
          lines: [['RAVI', 'Jump in! Hold the gold tight!'], ['VIKRAM', 'Fifty kilos of gold... and the whole police force watching us leave!'], ['RAVI', 'Bye bye Navapur police!']] };
      }),
      act((g) => { g.player.mesh.visible = true; g.dispatch.clear(false); }),
    ],
  },
  {
    id: 20, title: 'Kingpin', brief: 'Inspector Rana is waiting at the downtown plaza with his army. End it.',
    reward: 12000, par: [200, 300], chapterEnd: 2, next: 'Navapur never sleeps. CHAPTER 3: NAVAPUR NIGHTS is open!',
    watch: (g, m, dt) => allyFight(g, m, g.ravi, dt),
    onBossHit: (g, m, b) => {
      if (b === m.vars.rana && !m.vars.fled && b.health > 0 && b.health < b.maxHealth * 0.4) {
        m.vars.fled = true;
        g.hud.toast('RANA IS ESCAPING IN A POLICE SUV!');
        b.remove();
        const c = missionCar(g, m, 'police', 0xffffff, { mode: 'flee', health: 260, hostile: true, fastBurn: true, name: 'ranaCar', speed: 23 }, { node: true, x: -37.5, z: -75, hx: 1, hz: 0 });
        c.isPolice = false; c.maxHealth = 260;
        c.onExploded = () => {
          const r = g.spawnOfficer(c.x + 3, c.z + 2, 0, null, { gang: true, hostile: true, boss: true, name: 'RANA (LAST STAND)', model: 'police', weapon: 'rifle', health: 260 });
          m.track(r); m.vars.rana2 = r;
        };
      }
    },
    steps: () => [
      place(-37.5, -2.5, PI),
      act((g, m) => {
        g.player.giveWeapon('smg', 200); g.player.weapon = 'smg';
        g.ravi = m.track(spawnRavi(g)); g.ravi.x = -33; g.ravi.z = -4; g.ravi.calm = true;
        police(g, m, [[-30, -20], [-45, -20], [-37.5, -26], [-26, -30], [-49, -30], [-37.5, -45]], { swat: true, group: 'p1' });
        m.holdStars = true; g.dispatch.setStars(4);
      }),
      say([['RAVI', 'Rana\'s SWAT are all over the plaza. Together, bhai. For Navapur!']]),
      killGroup('p1', 'Break Rana\'s SWAT line'),
      act((g, m) => {
        const r = g.spawnOfficer(-37.5, -50, PI, null, { gang: true, hostile: true, boss: true, name: 'INSPECTOR RANA', model: 'police', weapon: 'rifle', health: 900, damage: 1.2 });
        m.track(r); m.vars.rana = r;
        police(g, m, [[-30, -52], [-45, -52]], { swat: true, group: 'p2' });
      }),
      say([['RANA', 'You stole MY gold, thief! Navapur belongs to me!']]),
      bossFight('rana', 'Take down INSPECTOR RANA'),
      destroy('ranaCar', 'Rana is escaping! Wreck his police SUV', { label: "RANA'S SUV", lost: 'Rana got away' }),
      waitFor('Rana crawled out of the wreck!', (g, m) => !!m.vars.rana2 || !m.vars.ranaCar),
      bossFight('rana2', 'Finish Rana'),
      act((g, m) => { g.slowmo(1.6, 0.25); g.hud.showBig('NAVAPUR IS FREE', '#ffc531', 3); m.holdStars = false; g.dispatch.clear(false); g.rewards.event('RANA DEFEATED', 3000, 200); }),
      say([['RAVI', 'It is over, Vikram. Rana is finished.'], ['VIKRAM', 'Navapur is free... but the gold buyers are in Sagarpet.'], ['RAVI', 'Then Sagarpet is next, bhai.']], true),
    ],
  },

  // ===================== CHAPTER 3: NAVAPUR NIGHTS (never-done-before missions) =====================
  {
    id: 21, title: 'Go Live', atmo: 'night',
    brief: 'Sunny streams your crime spree LIVE. Stunts, drifts, near misses, explosions and chases bring viewers. The chat votes on challenges. Reach 1 MILLION!',
    reward: 5000, timer: 540, next: 'Holi is coming... and Rana is showing off his golden treasure.',
    steps: () => [
      act((g, m) => { parkedCar(g, m, 'sports', 0xff3ea5, -10, -222.75, -PI / 2, 'car'); g.placePlayer(-6, -219, -PI / 2); }),
      say([['SUNNY', 'Bhai, we go LIVE tonight! 1 MILLION viewers and nobody can touch us. Do crazy things - the chat will tell you what!']]),
      act((g, m) => { g.live = new LiveStream(g, 1e6); m.music = 2; }),
      waitFor('Get 1,000,000 viewers! Stunts, drifts, near misses, explosions, chases - and do the CHAT challenges', (g) => g.live && g.live.viewers >= 1e6),
      act((g) => { g.slowmo(1.6, 0.3); g.hud.showBig('1 MILLION VIEWERS!', '#ff3ea5', 3); g.rewards.event('YOU WENT VIRAL', 3000, 150); g.live.stop(); g.dispatch.clear(false); }),   // fans flood the streets: police lose you
      say([['SUNNY', 'WE ARE VIRAL! Every channel in India is showing your face, bhai!']], true),
    ],
    rate: (g, m) => (m.elapsed < 240 ? 3 : m.elapsed < 360 ? 2 : 1),
  },
  {
    id: 22, title: 'Holi Hai!', atmo: 'day',
    brief: 'Holi in the bazaar! Steal Rana\'s Golden Pichkari from the stage, then vanish into the colours: police cannot see through gulal clouds. Tap COLOR to throw them.',
    reward: 5500, timer: 300, par: [150, 220], next: 'Time itself starts acting strange...',
    watch: (g, m, dt) => {
      if (!g.holi) return;
      m.vars.puffT = (m.vars.puffT ?? 0) - dt;
      if (m.vars.puffT <= 0) { m.vars.puffT = 1.2; g.holi.burst(26 + Math.random() * 23, 106 + Math.random() * 13, 3, 6); }
    },
    steps: () => [
      place(...START),
      act((g, m) => {
        g.holi = new ColorClouds(g);
        g.world.colorBlock = (a, b, c, d) => g.holi.blocks(a, b, c, d);
        g.world.colorInside = (x, z) => g.holi.clouds.some((c) => dist(x, z, c.x, c.z) < c.r * 0.85);
        g.colorBombs = 8;
        parkedCar(g, m, 'hatchback', 0xff3ea5, ...NEAR_CAR, 'car');
        for (let i = 0; i < 18; i++) {
          const p = new AmbientPerson(g, 26 + Math.random() * 23, 106 + Math.random() * 13, Math.random() * 6, { gesture: pick(['dance', 'cheer', 'dance', 'talk']) });
          g.ambient.push(p); m.track(p);
        }
        const stage = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0xff3ea5, roughness: 0.6 }));
        stage.scale.set(6, 0.14, 4); stage.position.set(37.5, FOOT_TOP + 0.07, 112.5);
        g.scene.add(stage); m.track(stage);
        const prize = m.vars.prize = m.track(g.pickups.spawn('gold', 37.5, 112.5, { auto: true, car: false }));
        prize.g.position.y += 0.15;
        gang(g, m, [[32, 110], [43, 110], [32, 115.5], [43, 115.5]], { group: 'stage', post: true });
      }),
      say([['RAVI (phone)', 'Holi hai! Rana is showing off a GOLDEN PICHKARI on the bazaar stage. Grab it! Tap COLOR to throw gulal - the police cannot see through it!']]),
      waitFor('Steal the Golden Pichkari from the stage in the bazaar', (g, m) => { const p = m.vars.prize; m.marker(p.x, p.z, 1.5, true); return p.taken; }),
      act((g, m) => { m.marker(null); g.dispatch.setStars(4); g.hud.toast('RANA: GET THAT THIEF!'); g.rewards.event('GOLDEN PICHKARI', 1000, 40); g.colorBombs = Math.max(g.colorBombs, 6); }),
      loseCops('Lose the police in the Holi colours! Throw COLOR between you and them'),
      goTo(CHAI.x - 1.2, CHAI.z, 3, 'Bring the Golden Pichkari to Ravi at the chai stall'),
      say([['RAVI', 'Bura na mano, Holi hai! Rana will be SO angry!']]),
    ],
  },
  {
    id: 23, title: '60 Seconds', atmo: 'night',
    brief: 'A time loop: every 60 seconds the night starts again. Each loop you remember more. Learn the guards, find the vault code, crack the vault and get out before time resets.',
    reward: 6000, par: [180, 300], next: 'Rana cuts the power of the whole city...',
    onAlert: (g, m) => { if (!m.vars.resetT) { m.vars.resetT = 1.2; g.hud.showBig('SPOTTED!', '#ff4438', 1.2); } },
    steps: () => [
      place(37.5, -72, 0),
      act((g, m) => {
        Object.assign(m.vars, { loop: 1, lt: 0, mem: {}, open: false, openT: 0 });
        loopGuards(g, m);
        m.vars.note = m.track(g.pickups.spawn('intel', 44.5, -36.8, { auto: true, car: false }));
        g.player.crouching = true;
        showMemory(g, m);
      }),
      say([['RAVI (phone)', 'Bhai, something is wrong with time! Every minute the night starts again. USE IT: learn the guards, find the vault code, open the vault.']]),
      { update: (g, m, dt) => loopStep(g, m, dt) },
      act((g) => { g.hud.hideProgress(); g.slowmo(1.2, 0.3); g.hud.showBig('THE LOOP IS BROKEN', '#8fe3ff', 2.5); g.rewards.event('TIME BREAKER', 2000, 120); }),
    ],
    rate: (g, m) => (m.vars.loop <= 3 ? 3 : m.vars.loop <= 5 ? 2 : 1),
  },
  {
    id: 24, title: 'Blackout', atmo: 'blackout',
    brief: 'Rana cut the city\'s power to hunt you in the dark. Stay out of the torch beams, switch the 3 fuse boxes back on - then take his hunters down.',
    reward: 6000, par: [200, 300], next: 'The monsoon is coming. And it is BIG.',
    steps: () => [
      place(...START),
      act((g, m) => {
        g.player.crouching = true;
        const routes = [[[2, 46], [2, 72]], [[22, 75.5], [-18, 75.5]], [[-28, 100.5], [-47, 100.5]], [[-27, 119], [-48, 119]], [[100, 45], [121, 45]], [[104, 27], [104, 50]]];
        for (const r of routes) m.track(g.spawnOfficer(r[0][0], r[0][1], 0, null, { gang: true, model: pick(GANG), weapon: 'smg', patrol: r, group: 'hunt', flashlight: true }));
        m.vars.huntN = routes.length;
        for (const [x, z] of [[7.9, 60], [-37.5, 104], [108, 41]]) m.track(fuseBox(g, x, z));
      }),
      say([['RAVI (phone)', 'Rana cut ALL the power to find you in the dark! His men have torches - stay out of the light, stay low. Turn the 3 fuse boxes back on!']]),
      defuse([[7.9, 60], [-37.5, 104], [108, 41]], 3, 'Restore the power: fuse boxes', {
        label: 'POWER RESTORED', doing: 'SWITCHING ON',
        onEach: (g, m, i, n) => { g.atmo.target.lights = n / 3; g.hud.toast(`POWER: ${n} / 3`); for (const f of m.ents) if (f.userData && f.userData.fuse && Math.abs(f.position.x - [7.9, -37.5, 108][i]) < 0.1) f.userData.lamp.material = FUSE_ON; },
      }),
      act((g, m) => { g.atmo.set('night'); g.slowmo(1.4, 0.3); g.hud.showBig('NAVAPUR SHINES AGAIN', '#ffc531', 2.5); for (const o of g.officers) if (o.group === 'hunt') o.alert(); }),
      say([['RAVI', 'Lights are back! Now they can see you - but you can see them too. Finish them!']]),
      killGroup('hunt', 'Take down Rana\'s hunters'),
    ],
  },
  {
    id: 25, title: 'Monsoon', atmo: 'storm',
    brief: 'A monsoon storm floods Navapur. Ravi is stuck on his car roof at the bazaar as the water rises. Drive the rescue speedboat through the flooded streets!',
    reward: 6500, timer: 200, par: [100, 150], next: 'Police checkpoints on every road... time to join a wedding.',
    watch: (g, m, dt) => { m.vars.flood = Math.min(0.95, (m.vars.flood ?? 0.4) + dt * 0.02); g.atmo.setFlood(m.vars.flood); },
    steps: () => [
      act((g, m) => {
        g.flooded = true;
        for (const c of g.cars) if (!c.missionCar) c.hold = true;
        const boat = parkedCar(g, m, 'boat', 0xf4f4f4, 0, -222.5, -PI / 2, 'boat');
        g.placePlayer(2, -219, -PI / 2); g.driving.enter(boat); g.camera3p.snapBehind();
        parkedCar(g, m, 'sedan', 0x22468f, -187.5, -77.25, PI / 2, 'rcar');
        const r = m.track(spawnRavi(g)); r.x = -187.5; r.z = -77.25; r.groundY = 1.45; r.calm = true; r.rig.setGesture('wait');
        g.ravi = r; m.vars.ravi = r;
      }),
      say([['RAVI (phone)', 'Vikram! The water is rising - I am on my car roof at the bazaar! Bring the boat, FAST!']]),
      goTo(-187.5, -70.5, 7, 'Drive the boat through the flooded streets to Ravi (follow the line)', { withCar: 'boat', carText: 'Get back in the boat!' }),
      hold(-187.5, -72, 9, 3, 'Stop the boat next to Ravi to pull him in', { car: true, label: 'PULLING RAVI IN' }),
      act((g, m) => { m.vars.ravi.mesh.visible = false; g.rewards.event('RAVI RESCUED', 1500, 60); }),
      say([['RAVI', 'Thank you bhai! To the relief camp at the downtown plaza!']]),
      goTo(-37.5, -18, 9, 'Take Ravi to the relief camp (downtown plaza)', { withCar: 'boat', carText: 'Get back in the boat!' }),
    ],
  },
  {
    id: 26, title: 'Baraat', atmo: 'night', chapterEnd: 3,
    brief: 'Police checkpoints everywhere. Hide inside a wedding procession and DANCE on the dhol beat to blend in. Dance badly during a police scan and they spot you!',
    reward: 7000, next: 'Sagarpet awaits... (Chapter 4 coming soon)',
    steps: () => [
      act((g, m) => {
        // One long straight road (z = 2.25, going west): two police checkpoints on the way.
        const truck = missionCar(g, m, 'suv', 0xf4f4f4, { mode: 'tail', name: 'truck', speed: 1.6, dest: { x: -70, z: 2.25 }, destDir: { x: -1, z: 0 }, health: 99999 }, { node: true, x: 68, z: 2.25, hx: -1, hz: 0 });
        truck.obeySignals = false; truck.cruise = 1.6;
        decorateTruck(truck);
        g.placePlayer(truck.x + 7, truck.z - 1, -PI / 2);
        m.vars.dancers = [];
        for (let i = 0; i < 12; i++) {
          const p = new AmbientPerson(g, truck.x + 4, truck.z, -PI / 2, { gesture: i % 5 === 4 ? 'cheer' : 'dance' });
          p.calm = true; g.ambient.push(p); m.track(p);
          m.vars.dancers.push({ p, ox: 4.2 + (i % 4) * 1.5, oz: -2.4 + Math.floor(i / 4) * 2.4 });
        }
        for (const x of [35, -35]) {
          m.track(g.spawnPoliceCarParked(x, -6.2, PI / 2));
          m.track(g.spawnOfficer(x + 1.5, -5, 0, null, {}));
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 3.2, 16, 16, 1, true).translate(0, -8, 0),
            new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          beam.position.set(x, 9, -6); beam.visible = false; g.scene.add(beam); m.track(beam);
          (m.vars.beams = m.vars.beams || []).push({ beam, x });
        }
        m.vars.cps = [{ x: 35, done: false }, { x: -35, done: false }];
        m.vars.held = [];
        g.rhythm = new Rhythm(g, 96);
        g.music.quiet = true; m.music = 0;
      }),
      say([['RAVI (phone)', 'Police checkpoints on every road! Hide in that baraat. Tap DANCE when the notes hit the line - on the dhol beat!']]),
      { update: (g, m, dt) => baraatStep(g, m, dt) },
      act((g, m) => {
        if (g.rhythm) { g.rhythm.stop(); g.rhythm = null; }
        for (const c of m.vars.held) c.hold = false;
        g.music.quiet = false;
        if (!m.vars.spotted) { g.hud.showBig('SHAADI MUBARAK!', '#ffc531', 2.5); g.rewards.event('PERFECT DISGUISE', 1500, 80); }
      }),
      waitFor('They spotted you! Lose the police', (g, m) => !m.vars.spotted || g.dispatch.stars === 0),
    ],
    rate: (g, m) => (m.vars.spotted ? 1 : (m.vars.minBlend ?? 100) > 50 ? 3 : 2),
  },
];


// ---------- Chapter 3 helpers ----------
// 60 SECONDS: the plaza guards (respawned at every loop).
function loopGuards(g, m) {
  for (const o of [...g.officers]) if (o.group === 'loop') o.remove();
  const routes = [[[30, -24], [30, -51]], [[45, -51], [45, -24]], [[24, -44.5], [51, -44.5]], [[51, -30.5], [24, -30.5]]];
  for (const r of routes) m.track(g.spawnOfficer(r[0][0], r[0][1], 0, null, { gang: true, model: 'police', weapon: 'pistol', patrol: r, group: 'loop' }));
  m.vars.vg = m.track(g.spawnOfficer(19, -32.5, PI, null, { gang: true, model: 'swat', weapon: 'smg', patrol: [[19, -32.5]], group: 'loop' }));
}
function showMemory(g, m) {
  const el = document.getElementById('memory'), M = m.vars.mem;
  el.classList.remove('hidden');
  el.innerHTML = `<b>MEMORY · LOOP ${m.vars.loop}</b>` +
    `<span class="${M.code ? 'ok' : ''}">${M.code ? '✓ Code 7-3-9-1' : '? Vault code'}</span>` +
    `<span class="${M.guard ? 'ok' : ''}">${M.guard ? '✓ Guard leaves 0:38' : '? Guard\'s chai break'}</span>`;
}
function loopReset(g, m) {
  const V = m.vars;
  V.loop++;
  if (V.loop > 8) { m.fail('Stuck in the time loop forever'); return; }
  document.body.classList.add('rewind'); setTimeout(() => document.body.classList.remove('rewind'), 1100);
  g.hud.showBig(`⏪ LOOP ${V.loop}`, '#8fe3ff', 1.4); g.music.whoosh();
  g.dispatch.clear(false);
  loopGuards(g, m);
  if (V.gold && !V.gold.taken) g.pickups.take(V.gold);
  Object.assign(V, { gold: null, open: false, openT: 0, away: false, back: false, lt: 0, resetT: 0 });
  g.player.carrying = false;
  g.placePlayer(37.5, -72, 0);
  g.player.crouching = true;
  showMemory(g, m);
}
function loopStep(g, m, dt) {
  const V = m.vars, P = g.player, vg = V.vg;
  V.lt += dt;
  if (V.resetT) { V.resetT -= dt; if (V.resetT <= 0) loopReset(g, m); return false; }
  if (V.lt >= 60) { loopReset(g, m); return false; }
  if (vg && !vg.dead && vg.guard) {
    if (V.lt > 38 && !V.away) {
      V.away = true; vg.guard.path = [[35, -40.5]]; vg.guard.i = 0; vg.guard.wait = 0;
      if (!V.mem.guard) { V.mem.guard = true; g.hud.toast('MEMORY: the vault guard leaves at 0:38'); showMemory(g, m); }
    }
    if (V.lt > 54 && V.away && !V.back) { V.back = true; vg.guard.path = [[19, -32.5]]; vg.guard.i = 0; vg.guard.wait = 0; }
  }
  g.hud.setProgress(`LOOP ${V.loop} · ${Math.ceil(60 - V.lt)}s LEFT`, 1 - V.lt / 60, 60 - V.lt < 10 ? '#ff3b30' : '#8fe3ff');
  if (!V.mem.code) {
    if (V.note && V.note.taken) { V.mem.code = true; g.hud.toast('MEMORY: vault code 7-3-9-1'); showMemory(g, m); }
    else { m.objective('Find the vault code: a note on a plaza bench'); m.marker(44.5, -36.8, 1.5, true); return false; }
  }
  if (!V.open) {
    const guardAway = !vg || vg.dead || dist(vg.x, vg.z, 19, -32.5) > 6;
    const atDoor = !P.inCar && dist(P.x, P.z, 19, -31.2) < 2.3;
    m.marker(19, -31.2, 2);
    if (atDoor && guardAway) {
      V.openT += dt;
      m.objective(`CRACKING THE VAULT... ${Math.ceil(5 - V.openT)}s`);
      if (V.openT >= 5) { V.open = true; V.gold = m.track(g.pickups.spawn('gold', 19, -30.2, { auto: true, car: false })); g.hud.toast('VAULT OPEN!'); }
    } else m.objective(V.mem.guard ? 'Open the vault door when the guard leaves (0:38)' : 'Open the vault door - watch the guard. When does he leave?');
    return false;
  }
  if (!V.gold.taken) { m.objective('Grab the gold!'); m.marker(19, -30.2, 1.5, true); return false; }
  m.objective('ESCAPE to the road before the loop resets!'); m.marker(37.5, -2.5, 5);
  return dist(P.x, P.z, 37.5, -2.5) < 5;
}

// BLACKOUT: a fuse box on a wall with a red light (green when switched on).
const FUSE_ON = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3, 0.5), toneMapped: false });
const FUSE_OFF = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2), toneMapped: false });
function fuseBox(g, x, z) {
  const grp = new THREE.Group();
  const box = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.4 }));
  box.scale.set(0.7, 1.1, 0.35); box.position.y = 1.2;
  const lamp = new THREE.Mesh(BOX, FUSE_OFF); lamp.scale.setScalar(0.12); lamp.position.set(0, 1.95, 0);
  grp.add(box, lamp); grp.position.set(x, g.world.groundAt(x, z), z);
  grp.userData = { fuse: true, lamp };
  g.scene.add(grp);
  return grp;
}

// BARAAT: fairy lights on the wedding truck.
function decorateTruck(truck) {
  const cols = [0xff3ea5, 0xffd21f, 0x3fe0ff, 0x7dff6b, 0xff7a2a];
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Color(cols[i % cols.length]).multiplyScalar(3);
    const t = i / 13;
    parts.push(part(BOX, c, -0.95, 1.95, -2.2 + t * 4.4, 0.12, 0.12, 0.12));
    parts.push(part(BOX, c, 0.95, 1.95, -2.2 + t * 4.4, 0.12, 0.12, 0.12));
  }
  const lights = new THREE.Mesh(mergeParts(parts), vertexColorGlow);
  truck.mesh.add(lights);
}
function baraatStep(g, m, dt) {
  const V = m.vars, T = V.truck, P = g.player, R = g.rhythm;
  const fx = Math.sin(T.yaw), fz = Math.cos(T.yaw), rx = -fz, rz = fx;
  for (const d of V.dancers) { d.p.x = T.x - fx * d.ox + rx * d.oz; d.p.z = T.z - fz * d.ox + rz * d.oz; d.p.yaw = T.yaw + Math.sin(g.time * 2 + d.ox) * 0.6; }
  const cx = T.x - fx * 6.5, cz = T.z - fz * 6.5;
  m.marker(cx, cz, 4, true);
  // Traffic waits for the wedding to pass (nobody drives through a baraat!).
  V.holdT = (V.holdT ?? 0) - dt;
  if (V.holdT <= 0) {
    V.holdT = 0.5;
    // (cars in front going the same way are NOT stopped: they drive away and clear the road)
    // (cars inside a junction also keep going, so they never block the truck)
    const clearing = (c) => (c.x - T.x) * fx + (c.z - T.z) * fz > -2 && Math.sin(c.yaw) * fx + Math.cos(c.yaw) * fz > 0.7;
    const inJunction = (c) => Math.abs(c.x - 75 * Math.round(c.x / 75)) < 10 && Math.abs(c.z - 75 * Math.round(c.z / 75)) < 10;
    for (const c of g.cars) {
      if (c === T || c.missionCar || c.playerControlled || c.parked || c.hold || clearing(c) || inJunction(c)) continue;
      if (dist(c.x, c.z, cx, cz) < 26) { c.hold = true; V.held.push(c); }
    }
    V.held = V.held.filter((c) => { if (dist(c.x, c.z, cx, cz) > 34 || clearing(c)) { c.hold = false; return false; } return true; });
  }
  const inCrowd = !P.inCar && dist(P.x, P.z, cx, cz) < 7;
  let scanning = false;
  for (const c of V.cps) {
    if (Math.abs(cx - c.x) < 13) scanning = true;
    if (!c.done && cx < c.x - 13) { c.done = true; g.rewards.event('CHECKPOINT PASSED', 500, 30); }
  }
  for (const b of V.beams) {
    b.beam.visible = Math.abs(cx - b.x) < 16;
    if (b.beam.visible) { const sw = Math.sin(g.time * 1.7) * 0.45; b.beam.rotation.set(0.55 + sw * 0.3, 0, sw); }
  }
  R.update(dt, scanning);
  if (!inCrowd) { R.blend = Math.max(0, R.blend - dt * 18); m.objective('Get back INSIDE the procession!'); }
  else m.objective(scanning ? 'POLICE SCAN! Keep dancing on the beat (tap DANCE)!' : 'Dance with the baraat: tap DANCE on the beat');
  if (scanning) V.minBlend = Math.min(V.minBlend ?? 100, R.blend);
  if (scanning && R.blend < 22 && !V.spotted) {
    V.spotted = true; g.dispatch.setStars(3); g.hud.showBig('SPOTTED!', '#ff4438', 2);
    return true;
  }
  return T.arrived;
}

// ---------- Runs one mission ----------
export class MissionRunner {
  constructor(game, def, opts = {}) {
    this.game = game; this.def = def;
    // v8: missions run in three acts (plan, job, getaway). fromAct = restart at a checkpoint.
    this.fromAct = opts.fromAct || 1; this.act = 0; this.totalElapsed = 0; this.clockT = 0;
    this.challenge = def.acts ? 1.25 : 1;   // the job is harder than before
    this.elapsed = 0; this.timeLeft = null; this.done = false;
    this.vars = {}; this.ents = []; this.objectiveText = '';
    this.stats = { kills: 0, heads: 0, hurt: 0, stunts: 0, drift: 0 };
    this.cashEarned = 0; this.music = 1; this.holdStars = false;
    this.taskNo = 0; this.taskOpen = false;   // v9.5: one task after another, numbered on the HUD
    this.steps = def.steps(this); this.si = -1;
    // "EARLIER..." flashback: what Vikram did before the theft (skippable).
    if (def.intro && !game.noIntros && this.fromAct <= 1) {
      let done = false;
      this.steps.unshift({
        start: (g) => { done = false; g.playIntro(def.intro, () => { done = true; g.hud.card(`MISSION ${def.id}`, def.title.toUpperCase(), def.brief); }); },
        update: () => done,
      });
      this.hasIntro = true;
    }
  }

  objective(text) {
    if (text === this.objectiveText) return;
    this.objectiveText = text; this.game.hud.setObjective(localTask(text));   // v10.1: in the player's language
    // The first objective of a step: STEP n/N on the HUD (the very first one also shows the whole plan).
    if (!this.taskOpen && text && !this.done) {
      this.taskOpen = true; this.taskNo++; this.game.hud.setTask(this.stepChip());
      if (this.taskNo === 1) this.planShowT = 3.8;   // the whole plan, once the mission title card has gone
    }
    this.showSteps();
    // Vikram says what to do next - "Step 3. I have to ..." when a new step starts.
    if (this.game.voice && text && !this.done) {
      const n = this.stepInfo().n;
      this.game.voice.objective(text, n !== this.spokenStep ? n : 0);
      this.spokenStep = n;
    }
  }
  // Close the current task (tick + bonus); the next objective starts a new one.
  newTask() {
    if (!this.taskOpen || this.done) return;
    this.taskOpen = false; this.game.hud.taskDone(`${this.stepChip()} ✓`);
    if (this.game.rewards) this.game.rewards.event('TASK DONE', 100, 5);
  }

  // ---------- v10.1: the mission, one step after another ----------
  // Every step that asks something of the player has a label ("Meet Raju at Raju's chai stall"). The plan
  // is those labels in order, with the act headers. The HUD shows STEP n/N, what to do now, what comes
  // NEXT, and the whole list (done / now / to do) behind STEPS.
  get plan() {
    if (this.planLen !== this.steps.length) {   // a choice can add steps
      this.planLen = this.steps.length;
      const ACT = ['', 'THE PLAN', 'THE JOB', 'THE GETAWAY'];
      this.planList = [];
      this.steps.forEach((st, i) => {
        if (st.actN) this.planList.push({ i, act: st.actN, head: `ACT ${st.actN} · ${ACT[st.actN]}` });
        else if (st.label) this.planList.push({ i, label: String(st.label).replace(/\s+/g, ' ').trim() });
      });
    }
    return this.planList;
  }
  // The step being worked on: the first labelled step from the current one on.
  stepInfo() {
    const items = this.plan.filter((p) => p.label);
    let k = items.findIndex((p) => p.i >= this.si);
    if (k < 0) k = items.length - 1;
    return { n: k + 1, N: items.length, cur: items[k] || null, next: items[k + 1] || null, plan: this.plan };
  }
  stepChip() { const s = this.stepInfo(); return s.N ? localStep(s.n, s.N) : `TASK ${this.taskNo}`; }
  showSteps() { this.game.hud.setSteps(this.done ? null : this.stepInfo()); }
  marker(x, z, r, moving = false) {
    this.game.setMarker(x === null ? null : { x, z, r, moving });
    if (x !== null) this.markerBy = this.si;   // which step put it there (v10.2: cleared when that step is over)
  }
  timer(sec) { this.timeLeft = sec; }
  track(e) {
    if (e) {
      this.ents.push(e);
      if (e.rig && !e.isOfficer && e.noInteract === undefined && !e.missionTalk) e.noInteract = true;
      // Harder jobs: enemies take more hits and hit harder (bosses even more).
      if (e.isOfficer && this.def.acts && this.act === 2 && !e.boosted && (e.gang || e.forceHostile || e.boss)) {
        e.boosted = true;
        const k = e.boss ? 1.5 : 1.35;
        e.health = e.maxHealth = Math.round(e.maxHealth * k); e.dmgMul = (e.dmgMul || 1) * 1.2;
      }
    }
    return e;
  }
  // The mission's own rules (counters, special systems) only run during the job (act 2).
  get inJob() { return !this.def.acts || this.act === 2; }
  onKill(o) { if (this.def.onKill && this.inJob) this.def.onKill(this.game, this, o); if (this.game.voice) this.game.voice.progress(); }
  onBossHit(o) { if (this.def.onBossHit && this.inJob) this.def.onBossHit(this.game, this, o); }
  onAlert(o) { if (this.def.onAlert && this.inJob) this.def.onAlert(this.game, this, o); }
  onEvent(type, data) {
    if (this.actEvent) this.actEvent(this.game, this, type, data);
    if (this.def.onEvent && this.inJob) this.def.onEvent(this.game, this, type, data);
  }
  onEnterCar() {}

  start() {
    const g = this.game, d = this.def;
    if (!this.hasIntro) g.hud.card(`MISSION ${d.id}`, d.title.toUpperCase(), d.brief);
    if (!d.acts) {   // three-act missions start their timer and set-up when the job (act 2) starts
      if (d.timer) this.timer(d.timer);
      if (d.setup) d.setup(g, this);
    }
    this.next();
  }

  // Finish the current step and start the next ones (steps that are done at once run straight through).
  next() {
    const g = this.game;
    for (;;) {
      const cur = this.steps[this.si];
      if (cur && cur.end) cur.end(g, this);
      if (this.done) return;
      if (cur) this.newTask();   // a task finished: tick + a small bonus
      this.si++;
      if (this.si >= this.steps.length) { this.pass(); return; }
      const st = this.steps[this.si];
      if (st.start) st.start(g, this);
      if (this.done) return;
      this.showSteps();
      if (!st.update(g, this, 0)) return;
    }
  }

  update(dt) {
    if (this.done) return;
    const g = this.game;
    if (g.mode === 'play') { this.elapsed += dt; this.totalElapsed += dt; }
    // Mission clock + act on the HUD.
    this.clockT -= dt;
    if (this.clockT <= 0 && this.def.acts) {
      this.clockT = 0.5;
      const t = Math.floor(this.totalElapsed), mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
      g.hud.setClock(`ACT ${Math.max(1, this.act)}/3 · ${['', 'THE PLAN', 'THE JOB', 'THE GETAWAY'][Math.max(1, this.act)]} · ${mm}:${ss}`);
    }
    if (this.timeLeft !== null && g.mode === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.fail('Time is up'); return; }
    }
    if (this.def.watch && this.inJob) this.def.watch(g, this, dt);
    if (this.planShowT > 0 && g.mode === 'play' && (this.planShowT -= dt) <= 0) { this.showSteps(); g.hud.toggleSteps(true, 9); }
    const st = this.steps[this.si];
    if (st && st.update(g, this, dt)) {
      // v10.2: a finished step takes its yellow marker with it (no marker left where nothing happens).
      const old = this.si, owned = this.markerBy === old;
      this.next();
      if (owned && this.markerBy === old && !this.done) this.marker(null);
      this.atMarkT = 0;
    }
    // v10.2 safety net: at the yellow marker and nothing happens for a few seconds? Say what to do
    // (in a car parked next to it: get out and walk in - cars cannot reach every circle).
    const mk = g.marker, T = g.dispatch.target, P = g.player, inCar = P.inCar && g.driving.speed < 2;
    if (!this.done && g.mode === 'play' && mk && !mk.moving && Math.hypot(T.x - mk.x, T.z - mk.z) < mk.r + (inCar ? 7 : 1.5) && (inCar || !P.inCar) && !g.hud.progressOn && !g.hud.subQueue.length && g.hud.subT <= 0) {
      this.atMarkT = (this.atMarkT || 0) + dt;
      if (this.atMarkT > 6) {
        this.atMarkT = -14;
        // The marker is on a car and the task is about a car: he has to get in (ENTER), not just stand there.
        const car = !P.inCar && /steal|get in|getaway|(car|suv|van|truck|jeep|auto|taxi|bus|boat|vehicle)\b/i.test(this.objectiveText)
          && g.cars.some((c) => !c.inactive && !c.wrecked && !c.exploded && Math.hypot(c.x - mk.x, c.z - mk.z) < 3.5);
        g.hud.toast(localTask(car ? 'Get in: walk up to the car and tap ENTER' : this.objectiveText));
      }
    } else if (this.atMarkT > 0) this.atMarkT = 0;
  }

  // Stars + bonuses + XP.
  pass() {
    if (this.done) return;
    this.done = true; this.passed = true;
    const g = this.game, d = this.def;
    g.hud.setSteps(null);
    if (d.acts && this.jobTime != null) this.elapsed = this.jobTime;   // stars are for how fast the JOB was done
    let stars = d.rate ? d.rate(g, this) : (d.par && d.par[0] ? (this.elapsed <= d.par[0] ? 3 : this.elapsed <= d.par[1] ? 2 : 1) : 3);
    stars = Math.max(1, Math.min(3, stars));
    const bonuses = [['MISSION REWARD', d.reward], ['STARS BONUS', stars * 150]];
    if (this.timeLeft !== null) bonuses.push(['TIME BONUS', Math.round(this.timeLeft) * 4]);
    if (this.stats.heads) bonuses.push([`HEADSHOTS x${this.stats.heads}`, this.stats.heads * 50]);
    if ((this.stats.hurt || 0) < 5 && this.elapsed > 20) bonuses.push(['NO DAMAGE', 300]);
    const xp = 100 + stars * 30 + d.id * 6;
    g.missionPassed(d, { stars, bonuses, xp, earned: this.cashEarned, chapterEnd: d.chapterEnd });
  }

  fail(reason) {
    if (this.done) return;
    this.done = true;
    this.game.hud.setSteps(null);
    this.game.missionFailed(this.def, reason);
  }

  // Remove everything the mission spawned.
  cleanup() {
    const g = this.game;
    const cur = this.steps[this.si];
    if (cur && cur.end && !this.done) cur.end(g, this);
    for (const e of this.ents) {
      if (e.isCar) { if (!e.playerControlled) g.removeCar(e); }
      else if (e.isOfficer) { if (!e.inactive) e.remove(); }
      else if (e.g && e.type) { if (!e.taken) g.pickups.take(e); }
      else if (e.isObject3D) { g.scene.remove(e); g.world.animated = g.world.animated.filter((a) => a.obj !== e); }
      else if (e.remove) e.remove();
    }
    this.ents = [];
    g.pins = []; g.raceGo = true; g.raceHold = false; g.ravi = null;
    // Chapter 3 systems.
    if (g.live) { g.live.stop(); g.live = null; }
    if (g.holi) { g.holi.dispose(); g.holi = null; }
    g.world.colorBlock = null; g.world.colorInside = null; g.colorBombs = 0;
    if (g.rhythm) { g.rhythm.stop(); g.rhythm = null; }
    g.music.quiet = false;
    g.atmo.setFlood(null);
    if (g.flooded) { g.flooded = false; for (const c of g.cars) if (!c.isPolice && !c.wrecked) c.hold = false; }
    document.getElementById('memory').classList.add('hidden');
    document.body.classList.remove('rewind');
    // Chapter 4-8 systems.
    if (g.player.outfit) g.player.setOutfit(null);
    g.disguise = null; g.photoMode = false; g.photoPressed = false; g.hittables = []; g.onTarget = null; g.choiceHook = null;
    for (const id of ['disguise-badge', 'btn-photo', 'choice']) document.getElementById(id).classList.add('hidden');
    g.hud.hideProgress(); g.hud.setBoss(null); g.hud.setRace(null);
  }
}

// Chapters 4-8 (missions 27-76) and the flashbacks for every mission.
MISSIONS.push(...moreMissions({
  place, act, say, wait, waitFor, goTo, getIn, loseCops, killGroup, collect, destroy, tail, hold, defuse, countdown, race, bossFight,
  parkedCar, missionCar, gang, spawnRavi, allyFight, AmbientPerson, CharacterRig, THREE, RACE_CPS, GARAGE, ColorClouds,
}));
for (const m of MISSIONS) if (!m.intro && INTROS[m.id]) m.intro = INTROS[m.id];
// v8: every mission becomes THE PLAN + THE JOB + THE GETAWAY (5+ minutes, harder, with checkpoints).
installActs(MISSIONS, { place, act, say, wait, goTo, hold, collect, missionCar, THREE });
