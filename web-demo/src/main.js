// City Thief - browser demo: story missions, free roam, guns, cars, police, street life.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { buildNetwork, buildLoops, Car, randomTrafficType, randomCarColor, Pedestrian } from './traffic.js';
import { Dispatch, PoliceCar, Officer } from './police.js';
import { Player, ThirdPersonCamera } from './player.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { loadCharacters, setCharacterQuality } from './characters.js';
import { Effects } from './weapons.js';
import { Driving } from './driving.js';
import { buildStreetLife, buildWarehouse, Pickups } from './ambient.js';
import { MISSIONS, MissionRunner, loadSave, writeSave } from './missions.js';
import { makeSky } from './sky.js';
import { dist, yawOf } from './util.js';

// ---------- Settings + quality ----------
const SETTINGS_KEY = 'cityThief.settings.v1';
function loadSettings() {
  try { return Object.assign({ look: 1, aim: 0.6, btn: 1, invert: false, sound: true, diff: 1, gfx: null }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch (e) { return { look: 1, aim: 0.6, btn: 1, invert: false, sound: true, diff: 1, gfx: null }; }
}
const settings = loadSettings();
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches;
const mem = navigator.deviceMemory || 8;
let quality = settings.gfx || (isTouch ? (mem <= 4 ? 'low' : 'medium') : 'high');
for (const q of ['low', 'medium', 'high']) if (params.has(q)) quality = q;

const COUNTS = { low: { cars: 9, police: 2, people: 6, life: 10 }, medium: { cars: 12, police: 2, people: 9, life: 17 }, high: { cars: 16, police: 2, people: 20, life: 99 } };
const SUN_DIR = new THREE.Vector3(0.81, 0.53, 0.59).normalize();
const START = { x: 6.6, z: 19.5, yaw: -Math.PI / 2 };
const EMPTY_INPUT = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };

class Game {
  constructor() {
    this.quality = quality;
    this.shadows = quality !== 'low';
    setCharacterQuality(quality);
    this.time = 0;
    this.mode = 'loading';
    this.mission = null;
    this.difficulty = Number(settings.diff) || 1;
    this.save = loadSave();
    this.stats = { kills: 0, shots: 0 };
    this.marker = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, { low: 1, medium: 1.5, high: 2 }[quality]));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe0b08a, 120, 360);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

    this.sun = new THREE.DirectionalLight(0xffd2a1, 2.6);
    this.sun.castShadow = this.shadows;
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xffe4c4, 0x4a4036, 0.6));

    if (quality === 'high') {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.5, 1.0));
      this.composer.addPass(new OutputPass());
    }
    this.audio = new GameAudio();
    window.addEventListener('resize', () => this.resize());
  }

  async load(onProgress) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (url, loaded, total) => onProgress(loaded / total);
    const [sky] = await Promise.all([new RGBELoader(manager).loadAsync('assets/sky/sunset_1k.hdr'), loadCharacters(manager)]);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = sky;
    this.skyDome = makeSky(SUN_DIR);
    this.scene.add(this.skyDome);

    this.world = new World(this.scene, quality);
    buildWarehouse(this);
    this.network = buildNetwork(this.world, this.scene);
    this.world.finishStatic();

    this.fx = new Effects(this.scene, quality);
    this.cars = []; this.policeCars = []; this.peds = []; this.officers = []; this.ambient = [];
    this.pickups = new Pickups(this);
    this.driving = new Driving(this);
    this.player = new Player(this, START.x, START.z, START.yaw);
    this.camera3p = new ThirdPersonCamera(this, this.camera);
    this.camera3p.snapBehind();
    this.dispatch = new Dispatch(this);
    this.controls = new Controls();
    this.hud = new Hud(this);

    const n = COUNTS[quality];
    this.spawnTraffic(n.cars, n.police);
    this.spawnPeople(n.people);
    this.streetLife = buildStreetLife(this);
    for (const p of this.streetLife) { p.home = { x: p.x, z: p.z, yaw: p.yaw, gesture: p.gesture }; this.ambient.push(p); }
    // Fewer bystanders on phones (the chai stall, dancer and bus stop come first in the list).
    for (const p of this.streetLife.slice(n.life)) { p.remove(); p.home = null; }
    this.streetLife = this.streetLife.slice(0, n.life);
    this.refreshLists();

    this.dispatch.onStars = (n, was) => { if (n > 0 && was === 0) this.hud.showBig('COPS ARE COMING!', '#ff4438', 2); };
    this.dispatch.onEscaped = () => this.hud.showBig('YOU LOST THE POLICE', '#4dff66', 2.5);
    this.dispatch.onBusted = () => {
      this.hud.showBig('BUSTED!', '#ff2626', 2.5);
      setTimeout(() => { if (this.mission) this.mission.fail('You were arrested by the Navapur police'); else this.respawnFree(); }, 2500);
    };

    // Mission marker: tall glowing beam + ring on the ground.
    this.markerMesh = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc531, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.y = 20;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
    this.markerMesh.add(beam, ring);
    this.markerMesh.visible = false;
    this.scene.add(this.markerMesh);

    this.applySettings();
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    this.mode = 'menu';
    requestAnimationFrame(this.loop);
  }

  // ---------- Lists ----------
  humans() { return this._humans; }
  get agents() { return this._agents; }
  get walkers() { return this._walkers; }
  refreshLists() {
    this._humans = [...this.peds, ...this.ambient, ...this.officers];
    const onFoot = this.player && !this.player.inCar && !this.player.dead ? [this.player] : [];
    this._agents = [...this.cars, ...this.peds, ...this.officers, ...this.ambient.filter((a) => !a.dead), ...onFoot];
    this._walkers = [...this.peds, ...this.officers, ...this.ambient, ...onFoot];
  }

  // Scare everyone near (x, z): they run.
  alarm(x, z, r) {
    for (const h of this.humans()) {
      if (!h.dead && h.panicFrom && !h.isOfficer && dist(h.x, h.z, x, z) < r) h.panicFrom(x, z);
    }
  }

  // ---------- Spawning ----------
  freeSpots(minFromPlayer, maxFromPlayer = 9999) {
    const N = this.network.nodes, P = this.player;
    return N.map((nd, i) => (nd.spawnable ? i : -1)).filter((i) => {
      if (i < 0) return false;
      const d = dist(N[i].x, N[i].z, P.x, P.z);
      if (d < minFromPlayer || d > maxFromPlayer) return false;
      return !this.cars.some((c) => dist(c.x, c.z, N[i].x, N[i].z) < 12);
    }).sort(() => Math.random() - 0.5);
  }

  spawnTraffic(carCount, policeCount) {
    for (let i = 0; i < policeCount; i++) this.spawnPoliceCar(false);
    for (let i = 0; i < carCount; i++) {
      const node = this.freeSpots(15)[0];
      if (node === undefined) break;
      const c = new Car(this, randomTrafficType(), randomCarColor());
      c.init(node);
      this.cars.push(c);
    }
  }

  spawnPoliceCar(toChase) {
    const spots = this.freeSpots(toChase ? 70 : 45, toChase ? 160 : 9999);
    if (!spots.length) return null;
    const p = new PoliceCar(this);
    p.init(spots[0]);
    this.cars.push(p); this.policeCars.push(p);
    if (this.dispatch && this.dispatch.active) p.beginPursuit();
    return p;
  }

  spawnOfficer(x, z, yaw, car) {
    const o = new Officer(this, x, z, yaw, car);
    this.officers.push(o);
    return o;
  }

  spawnParkedCar(type, color, x, z, yaw) {
    const c = new Car(this, type, color);
    c.x = x; c.z = z; c.yaw = yaw; c.parked = true; c.speed = 0;
    c.syncMesh();
    this.cars.push(c);
    return c;
  }

  removeCar(c) {
    c.inactive = true; c.pursuing = false;
    this.scene.remove(c.mesh);
    this.cars = this.cars.filter((x) => x !== c);
    this.policeCars = this.policeCars.filter((x) => x !== c);
  }

  spawnPeople(count) {
    const loops = buildLoops();
    let placed = 0;
    for (let a = 0; a < count * 5 && placed < count; a++) {
      const loop = loops[a % loops.length];
      const i = Math.floor(Math.random() * loop.length);
      const A = loop[i], B = loop[(i + 1) % loop.length], t = Math.random();
      const pos = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      if (dist(pos[0], pos[1], START.x, START.z) < 5) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.peds.push(new Pedestrian(this, loop, pos, dir === 1 ? i + 1 : i, dir));
      placed++;
    }
  }

  placePlayer(x, z, yaw) {
    const P = this.player;
    P.spawn = { x, z, yaw };
    P.respawn();
  }

  setMarker(m) {
    this.marker = m;
    this.markerMesh.visible = !!m;
    if (m) {
      this.markerMesh.position.set(m.x, this.world.groundAt(m.x, m.z), m.z);
      this.markerMesh.scale.set(m.r, 1, m.r);
    }
  }

  say(lines) { this.hud.say(lines); }

  // ---------- Resetting the city between missions ----------
  resetCity() {
    const P = this.player;
    if (P.inCar) this.driving.exit();
    this.dispatch.clear(false);
    this.dispatch.reportTimer = -1; this.dispatch.busting = false;
    for (const o of [...this.officers]) o.remove();
    // Remove stolen / parked / wrecked cars and extra police; keep the traffic count.
    for (const c of [...this.cars]) if (c.parked || c.wrecked || c.missionCar) this.removeCar(c);
    while (this.policeCars.length > 2) this.removeCar(this.policeCars[this.policeCars.length - 1]);
    for (const c of this.policeCars) { c.crew = []; c.hold = false; c.state = 'patrol'; c.endPursuit(); }
    const n = COUNTS[quality];
    const trafficNow = this.cars.length - this.policeCars.length;
    if (trafficNow < n.cars) this.spawnTraffic(n.cars - trafficNow, 2 - this.policeCars.length);
    // Street life back to normal.
    for (const a of [...this.ambient]) {
      if (!a.home) { a.remove(); continue; }
      if (a.dead) { this.scene.remove(a.mesh); const fresh = new a.constructor(this, a.home.x, a.home.z, a.home.yaw, { gesture: a.home.gesture }); fresh.home = a.home; this.ambient[this.ambient.indexOf(a)] = fresh; continue; }
      a.x = a.home.x; a.z = a.home.z; a.yaw = a.home.yaw; a.state = 'idle'; a.speed = 0; a.rig.setGesture(a.home.gesture);
    }
    for (const p of this.peds) if (p.dead) { p.deadT = 99; p.respawnElsewhere(); }
    this.pickups.clear();
    this.ravi = null;
    P.owned = ['pistol']; P.weapon = 'pistol';
    P.ammo = { pistol: { mag: 12, reserve: 48 }, smg: { mag: 0, reserve: 0 } };
    P.reloadT = 0; P.aiming = false;
    this.setMarker(null);
    this.hud.clearSubs();
    this.stats = { kills: 0, shots: 0 };
    this.refreshLists();
  }

  // ---------- Modes ----------
  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) document.getElementById(id).classList.remove('hidden');
  }

  enterPlay() {
    this.showScreen(null);
    document.getElementById('hud').classList.remove('hidden');
    this.controls.enabled = true;
    this.mode = 'play';
    this.clock.getDelta();
    this.audio.start();
    this.audio.setMuted(!settings.sound);
    this.controls.lockMouse();
    if (isTouch) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
      screen.orientation?.lock?.('landscape').catch(() => {});
    }
  }

  startFreeRoam() {
    this.mission = null;
    this.resetCity();
    this.placePlayer(START.x, START.z, START.yaw);
    this.hud.setMission('FREE ROAM', 'Explore Navapur: steal cars, find the SMG in the courtyard, tap CALL COPS for a chase.');
    this.pickups.spawn('smg', 41, 41);
    this.pickups.spawn('health', 6.4, 35);
    this.pickups.spawn('ammo', 6.4, 45);
    this.enterPlay();
  }

  startMission(id) {
    const def = MISSIONS.find((m) => m.id === id);
    if (!def) { this.goMenu(); return; }
    this.resetCity();
    this.mission = new MissionRunner(this, def);
    this.hud.setMission(`MISSION ${def.id} · ${def.title.toUpperCase()}`, '');
    this.mission.start();
    this.enterPlay();
    this.hud.showBig(def.title.toUpperCase(), '#ffc531', 2.5);
  }

  respawnFree() {
    this.dispatch.clear(false);
    for (const o of [...this.officers]) o.remove();
    this.placePlayer(START.x, START.z, START.yaw);
  }

  onPlayerDied() {
    this.hud.showBig('YOU WERE KILLED', '#ff2626', 3);
    setTimeout(() => { if (this.mission) this.mission.fail('Vikram was killed'); else this.respawnFree(); }, 3000);
  }

  missionPassed(def, stars, chapterDone) {
    this.hud.showBig('MISSION PASSED', '#ffc531', 2.5);
    const coins = def.reward + stars * 100;
    this.save.coins += coins;
    this.save.stars[def.id] = Math.max(this.save.stars[def.id] || 0, stars);
    this.save.unlocked = Math.max(this.save.unlocked, def.id + 1);
    writeSave(this.save);
    setTimeout(() => {
      this.dispatch.clear(false);
      this.showResult(true, stars, chapterDone
        ? `CHAPTER 1 COMPLETE! ₹${coins.toLocaleString('en-IN')} earned. Chapter 2 (bikes and traffic chases) is coming soon.`
        : `₹${coins.toLocaleString('en-IN')} earned. ${def.goal}.`, def);
    }, 2200);
  }

  missionFailed(def, reason) {
    this.hud.showBig('MISSION FAILED', '#ff4a3d', 2.5);
    setTimeout(() => this.showResult(false, 0, reason + '. Try again!', def), 2200);
  }

  showResult(passed, stars, text, def) {
    this.mode = 'result';
    this.controls.enabled = false; this.controls.releaseAll();
    document.exitPointerLock?.();
    document.getElementById('hud').classList.add('hidden');
    const t = document.getElementById('result-title');
    t.textContent = passed ? 'MISSION PASSED' : 'MISSION FAILED';
    t.classList.toggle('fail', !passed);
    [...document.getElementById('result-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
    document.getElementById('result-text').textContent = text;
    const next = document.getElementById('btn-next');
    next.classList.toggle('hidden', !passed || !MISSIONS.find((m) => m.id === def.id + 1));
    this.lastDef = def;
    this.showScreen('result-screen');
  }

  goMenu() {
    this.mission = null;
    this.mode = 'menu';
    this.controls.enabled = false; this.controls.releaseAll();
    document.exitPointerLock?.();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('menu-coins').textContent = this.save.coins.toLocaleString('en-IN');
    this.showScreen('menu');
    this.audio.engine(false);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.controls.enabled = false; this.controls.releaseAll();
    document.exitPointerLock?.();
    document.getElementById('btn-restart').classList.toggle('hidden', !this.mission);
    this.showScreen('pause-screen');
    this.audio.setMuted(true);
  }

  // Short in-engine cutscene: fixed camera, letterbox, subtitles.
  cutscene(opts) {
    this.mode = 'cutscene';
    this.controls.enabled = false; this.controls.releaseAll();
    document.body.classList.add('cutscene');
    document.getElementById('letterbox').classList.remove('hidden');
    this.cut = { from: new THREE.Vector3(...opts.from), at: new THREE.Vector3(...opts.at), t: 0, onDone: opts.onDone };
    for (const [a, b] of opts.faces || []) {
      if (a === this.player) a.yaw = yawOf(b.x - a.x, b.z - a.z);
      else a.faceTarget = b;
    }
    this.hud.clearSubs();
    this.hud.say(opts.lines);
  }

  endCutscene() {
    if (this.mode !== 'cutscene') return;
    document.body.classList.remove('cutscene');
    document.getElementById('letterbox').classList.add('hidden');
    this.hud.clearSubs();
    this.mode = 'play';
    this.controls.enabled = true;
    this.camera3p.snapBehind();
    const done = this.cut.onDone; this.cut = null;
    if (done) done();
  }

  // ---------- Settings ----------
  applySettings() {
    this.camera3p.sensitivity = Number(settings.look);
    this.camera3p.aimSensitivity = Number(settings.aim);
    this.camera3p.invert = !!settings.invert;
    this.difficulty = Number(settings.diff) || 1;
    document.documentElement.style.setProperty('--bs', settings.btn);
    if (this.audio.enabled) this.audio.setMuted(!settings.sound);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    const P = this.player;
    const fx = P.inCar && this.driving.car ? this.driving.car.x : P.x, fz = P.inCar && this.driving.car ? this.driving.car.z : P.z;
    this.sun.position.set(fx + SUN_DIR.x * 100, SUN_DIR.y * 100, fz + SUN_DIR.z * 100);
    this.sun.target.position.set(fx, 0, fz);
    this.skyDome.position.copy(this.camera.position);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  // World that keeps living in every mode (traffic, people, police, effects).
  simulate(dt) {
    for (const s of this.network.signals) s.update(this.time);
    for (const c of this.cars) c.update(dt);
    for (const p of this.peds) p.update(dt);
    for (const a of [...this.ambient]) a.update(dt);
    for (const o of [...this.officers]) o.update(dt);
    this.pickups.update(dt);
    this.fx.update(dt);
    if (this.markerMesh.visible) this.markerMesh.children[1].scale.setScalar(1 + Math.sin(this.time * 4) * 0.08);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.refreshLists();

    if (this.mode === 'menu' || this.mode === 'result') {
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(Math.cos(a) * 60, 32, Math.sin(a) * 60);
      this.camera.lookAt(0, 6, 0);
      this.simulate(dt);
      this.render();
      return;
    }
    if (this.mode === 'paused') { this.render(); return; }

    this.time += dt;
    const P = this.player;

    if (this.mode === 'cutscene') {
      this.cut.t += dt;
      this.camera.position.copy(this.cut.from).lerp(this.cut.at, Math.min(0.12, this.cut.t * 0.01));
      this.camera.lookAt(this.cut.at);
      this.simulate(dt);
      P.update(dt, EMPTY_INPUT, P.yaw);
      if (this.hud.subT <= 0 && !this.hud.subQueue.length) this.endCutscene();
      this.hud.update(dt);
      this.render();
      return;
    }

    const input = this.controls.poll();
    if (input.enterPressed && !P.dead) {
      if (P.inCar) this.driving.exit();
      else { const car = this.driving.nearestCar(P.x, P.z); if (car) this.driving.enter(car); }
    }
    if (input.pickupPressed && !P.inCar) {
      const pk = this.pickups.near(P.x, P.z);
      if (pk) {
        if (pk.type === 'health') P.health = 100;
        else if (pk.type === 'ammo') { P.ammo.pistol.reserve += 24; if (P.owned.includes('smg')) P.ammo.smg.reserve += 30; }
        else if (pk.type === 'smg') { P.giveWeapon('smg', 90); P.weapon = 'smg'; this.hud.showBig('SMG', '#ffc531', 1.5); }
        this.pickups.take(pk);
        this.audio.reload();
      }
    }
    if (input.callCopsPressed && !this.mission) this.dispatch.setStars(Math.max(1, this.dispatch.stars));
    if (input.camPressed && P.inCar) this.carCamFar = !this.carCamFar;

    this.simulate(dt);
    if (P.inCar) this.driving.update(dt, input);
    P.update(dt, input, this.camera3p.yaw);
    this.camera3p.update(dt, input.look);
    this.dispatch.update(dt);
    if (this.mission) this.mission.update(dt);
    this.hud.update(dt);

    let siren = Infinity;
    for (const p of this.policeCars) if (p.pursuing) siren = Math.min(siren, dist(p.x, p.z, P.x, P.z));
    this.audio.update(siren);
    this.render();
  }
}

// ---------- Boot + menus ----------
const game = new Game();
window.__cityThief = game;
const $ = (id) => document.getElementById(id);

game.load((p) => { $('load-bar').style.width = Math.round(p * 100) + '%'; })
  .then(() => { $('loading').classList.add('hidden'); game.goMenu(); })
  .catch((e) => { console.error(e); $('load-text').textContent = 'Could not load the game. Please check your internet and refresh.'; });

function renderMissionList() {
  const list = $('mission-list');
  list.innerHTML = '';
  for (const m of MISSIONS) {
    const locked = m.id > game.save.unlocked;
    const st = game.save.stars[m.id] || 0;
    const card = document.createElement('div');
    card.className = 'mcard' + (locked ? ' locked' : '');
    card.innerHTML = `<div class="num">${m.id}</div><div><div class="t">${m.title}${locked ? ' &#128274;' : ''}</div><div class="d">${m.brief}</div></div>
      <div class="s">${[0, 1, 2].map((i) => `<span class="${i < st ? '' : 'off'}">&#9733;</span>`).join('')}</div>`;
    if (!locked) card.addEventListener('click', () => game.startMission(m.id));
    list.appendChild(card);
  }
}

let settingsReturn = 'menu';
function openSettings(from) {
  settingsReturn = from;
  $('set-look').value = settings.look; $('set-aim').value = settings.aim; $('set-btn').value = settings.btn;
  $('set-invert').checked = !!settings.invert; $('set-sound').checked = !!settings.sound;
  $('set-diff').value = String(settings.diff); $('set-gfx').value = quality;
  game.showScreen('settings-screen');
}
function saveSettings() {
  settings.look = $('set-look').value; settings.aim = $('set-aim').value; settings.btn = $('set-btn').value;
  settings.invert = $('set-invert').checked; settings.sound = $('set-sound').checked; settings.diff = $('set-diff').value;
  const gfx = $('set-gfx').value;
  const gfxChanged = gfx !== quality;
  settings.gfx = gfx;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* fine */ }
  game.applySettings();
  if (gfxChanged) location.href = location.pathname;   // new graphics level needs a reload
}
for (const id of ['set-look', 'set-aim', 'set-btn', 'set-invert', 'set-sound', 'set-diff']) $(id).addEventListener('change', saveSettings);
$('set-gfx').addEventListener('change', saveSettings);

$('btn-story').addEventListener('click', () => { renderMissionList(); game.showScreen('missions-screen'); });
$('btn-free').addEventListener('click', () => game.startFreeRoam());
$('btn-settings').addEventListener('click', () => openSettings('menu'));
for (const b of document.querySelectorAll('[data-back]')) {
  b.addEventListener('click', () => {
    if (b.closest('#settings-screen') && settingsReturn === 'pause') game.showScreen('pause-screen');
    else game.showScreen('menu');
  });
}
$('btn-pause').addEventListener('pointerdown', (e) => { e.stopPropagation(); game.pause(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && game.mode === 'play' && !document.pointerLockElement) game.pause(); });
$('btn-resume').addEventListener('click', () => { game.showScreen(null); game.mode = 'play'; game.controls.enabled = true; game.clock.getDelta(); game.audio.setMuted(!settings.sound); game.controls.lockMouse(); });
$('btn-restart').addEventListener('click', () => { if (game.mission) game.startMission(game.mission.def.id); });
$('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
$('btn-quit').addEventListener('click', () => game.goMenu());
$('btn-next').addEventListener('click', () => game.startMission(game.lastDef.id + 1));
$('btn-retry').addEventListener('click', () => game.startMission(game.lastDef.id));
$('btn-result-menu').addEventListener('click', () => game.goMenu());
$('btn-skip').addEventListener('click', () => { game.hud.clearSubs(); game.endCutscene(); });
