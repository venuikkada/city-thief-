// City Thief - browser demo: story missions, free roam, guns, cars, police, street life.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { buildNetwork, buildLoops, Car, randomTrafficType, randomCarColor, Pedestrian } from './traffic.js';
import { NavGrid } from './nav.js';
import { Dispatch, PoliceCar, Officer } from './police.js';
import { Player, ThirdPersonCamera } from './player.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { loadCharacters, loadMoreCrowd, setCharacterQuality } from './characters.js';
import { Effects } from './weapons.js';
import { Driving } from './driving.js';
import { buildStreetLife, buildWarehouse, Pickups, SpotLife } from './ambient.js';
import { MISSIONS, CHAPTERS, MissionRunner, loadSave, writeSave } from './missions.js';
import { Music } from './music.js';
import { Rewards, RANKS, SHOP, DAILY, rankOf, rankProgress } from './rewards.js';
import { WEAPONS } from './weapons.js';
import { makeSky } from './sky.js';
import { dist, yawOf } from './util.js';

// ---------- Settings + quality ----------
const SETTINGS_KEY = 'cityThief.settings.v1';
const isTouch = matchMedia('(pointer: coarse)').matches;
const DEFAULTS = { look: 1, aim: 0.6, btn: 1, invert: false, sound: true, music: true, diff: 1, gfx: null, assist: isTouch, drive: 'buttons', v: 5 };
function loadSettings() {
  try { return Object.assign({ ...DEFAULTS }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch (e) { return { ...DEFAULTS }; }
}
const settings = loadSettings();
if (settings.v !== 5) { settings.drive = 'buttons'; settings.music = true; settings.v = 5; }   // v5: arrow buttons for cars by default
const params = new URLSearchParams(location.search);
const mem = navigator.deviceMemory || 8;
let quality = settings.gfx || (isTouch ? (mem <= 4 ? 'low' : 'medium') : 'high');
for (const q of ['low', 'medium', 'high']) if (params.has(q)) quality = q;

// How many cars / people live around the player (the city is big; they follow you around).
const COUNTS = {
  low: { cars: 10, police: 2, people: 8, life: 10, spots: 10 },
  medium: { cars: 14, police: 3, people: 12, life: 17, spots: 16 },
  high: { cars: 22, police: 3, people: 22, life: 99, spots: 30 },
};
// Evening sun over the sea (south-west).
const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
const START = { x: 6.6, z: 19.5, yaw: -Math.PI / 2 };
const EMPTY_INPUT = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
const _fwd = new THREE.Vector3();

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
    this.marker = null; this.pins = [];
    this.timeScale = 1; this.slowT = 0; this.raceGo = true; this.raceHold = false; this.takedownTarget = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, { low: 1, medium: 1.5, high: 2 }[quality]));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe3b48c, 150, 560);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1600);

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
    const [sky, seaTex] = await Promise.all([
      new RGBELoader(manager).loadAsync('assets/sky/sunset_1k.hdr'),
      new THREE.TextureLoader(manager).loadAsync('assets/tex/waternormals.jpg'),
      loadCharacters(manager),
    ]);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = sky;
    this.skyDome = makeSky(SUN_DIR);
    this.scene.add(this.skyDome);

    this.world = new World(this.scene, quality);
    buildWarehouse(this);
    this.network = buildNetwork(this.world, this.scene);
    this.world.finishStatic();
    this.world.buildSea(seaTex);
    this.nav = new NavGrid(this.world, -282, -300, 282, 282);
    this.pedLoops = buildLoops();
    this.waypoint = null;

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
    this.music = new Music(this.audio);
    this.rewards = new Rewards(this);

    const n = COUNTS[quality];
    this.spawnTraffic(n.cars, n.police);
    this.spawnPeople(n.people);
    this.spotLife = new SpotLife(this, n.spots);
    this.streetLife = buildStreetLife(this);
    for (const p of this.streetLife) { p.home = { x: p.x, z: p.z, yaw: p.yaw, gesture: p.gesture }; this.ambient.push(p); }
    // Fewer bystanders on phones (the chai stall, dancer and bus stop come first in the list).
    for (const p of this.streetLife.slice(n.life)) { p.remove(); p.home = null; }
    this.streetLife = this.streetLife.slice(0, n.life);
    this.refreshLists();

    this.dispatch.onStars = (n, was) => { if (n > 0 && was === 0) this.hud.showBig('COPS ARE COMING!', '#ff4438', 2); };
    this.dispatch.onEscaped = () => this.hud.showBig('YOU LOST THE POLICE', '#4dff66', 2.5);
    this.dispatch.onMessage = (t) => this.hud.toast(t);
    this.dispatch.onBusted = () => {
      const m = this.mission;
      this.endScreen('PAKDE GAYE!', 'Busted by the Navapur police');
      setTimeout(() => {
        if (this.mission !== m) return;   // a new mission already started
        this.endScreen(null);
        if (m) m.fail('You were arrested by the Navapur police'); else if (this.mode === 'play') this.respawnFree();
      }, 2800);
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
    loadMoreCrowd();   // more kinds of people, in the background
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
  // Lane points between min and max metres from the player, away from other cars
  // (and out of the camera's view when hidden = true). Random order.
  freeSpots(minFromPlayer, maxFromPlayer = 9999, hidden = false) {
    const N = this.network.nodes, P = this.player, cam = this.camera.position;
    this.camera.getWorldDirection(_fwd);
    return N.map((nd, i) => (nd.spawnable ? i : -1)).filter((i) => {
      if (i < 0) return false;
      const d = dist(N[i].x, N[i].z, P.x, P.z);
      if (d < minFromPlayer || d > maxFromPlayer) return false;
      if (this.cars.some((c) => Math.abs(c.x - N[i].x) < 12 && Math.abs(c.z - N[i].z) < 12)) return false;
      if (hidden) {
        const dx = N[i].x - cam.x, dz = N[i].z - cam.z, dc = Math.hypot(dx, dz);
        if (dc < 130 && (dx * _fwd.x + dz * _fwd.z) / dc > 0.25 && !this.world.segmentBlocked(cam.x, cam.z, N[i].x, N[i].z)) return false;
      }
      return true;
    }).sort(() => Math.random() - 0.5);
  }

  // Keep the streets around the player busy: far cars come back near him, out of sight.
  recycle() {
    const P = this.player, n = COUNTS[quality];
    for (const c of [...this.cars]) {
      if (c.playerControlled || c.missionCar || c.roadblock) continue;
      const d = dist(c.x, c.z, P.x, P.z);
      if (c.parked || c.wrecked) { if (d > 230) this.removeCar(c); continue; }
      if (c.isPolice && c.pursuing) continue;
      if (d < 175) continue;
      const spot = this.freeSpots(80, 160, true)[0];
      if (spot === undefined) continue;
      c.upcoming = []; c.direct = null; c.lateral = 0; c.obstacle = null;
      c.init(spot);
    }
    const traffic = this.cars.filter((c) => !c.isPolice && !c.parked && !c.wrecked && !c.playerControlled && !c.missionCar).length;
    if (traffic < n.cars) {
      const spot = this.freeSpots(70, 160, true)[0];
      if (spot !== undefined) { const c = new Car(this, randomTrafficType(), randomCarColor()); c.init(spot); this.cars.push(c); }
    }
    const police = this.policeCars.filter((c) => !c.wrecked && !c.roadblock && !c.parked && !c.playerControlled).length;
    if (police < n.police) this.spawnPoliceCar(false);
  }

  spawnTraffic(carCount, policeCount) {
    for (let i = 0; i < policeCount; i++) this.spawnPoliceCar(false);
    for (let i = 0; i < carCount; i++) {
      const node = this.freeSpots(15, 150)[0];
      if (node === undefined) break;
      const c = new Car(this, randomTrafficType(), randomCarColor());
      c.init(node);
      this.cars.push(c);
    }
  }

  spawnPoliceCar(toChase) {
    const spots = this.freeSpots(toChase ? 70 : 45, toChase ? 160 : 170, true);
    if (!spots.length) return null;
    const p = new PoliceCar(this);
    p.init(spots[0]);
    this.cars.push(p); this.policeCars.push(p);
    if (this.dispatch && this.dispatch.active) p.beginPursuit();
    return p;
  }

  spawnOfficer(x, z, yaw, car, opts) {
    const o = new Officer(this, x, z, yaw, car, opts);
    this.officers.push(o);
    return o;
  }

  spawnParkedCar(type, color, x, z, yaw) {
    const c = new Car(this, type, color);
    c.x = x; c.z = z; c.yaw = yaw; c.parked = true; c.speed = 0; c.y = this.world.groundAt(x, z);
    c.syncMesh();
    this.cars.push(c);
    return c;
  }

  // A parked police SUV (police parking, missions).
  spawnPoliceCarParked(x, z, yaw) {
    const c = new PoliceCar(this);
    c.x = x; c.z = z; c.yaw = yaw; c.parked = true; c.speed = 0; c.y = this.world.groundAt(x, z);
    c.syncMesh();
    this.cars.push(c); this.policeCars.push(c);
    return c;
  }

  // ---------- Big moments ----------
  // Slow motion for a moment (explosions, last kills, stunt jumps).
  slowmo(sec, scale = 0.35) {
    if (this.slowT > 0 && this.timeScale <= scale) return;
    this.slowT = sec; this.slowScale = scale;
    this.music.whoosh();
  }

  // An explosion at (x, z): hurts people and cars around it (cars can blow up in a chain).
  blast(x, z, r, source, byPlayer) {
    const P = this.player, cam = this.camera.position;
    const dc = dist(cam.x, cam.z, x, z);
    this.camera3p.shake(Math.max(0, 1.2 - dc / 40));
    this.audio.explosion(Math.max(0.15, 1 - dc / 120));
    if (dc < 35 && this.mode === 'play') this.slowmo(0.7, 0.4);
    if (P.inCar && this.driving.car === source) { P.health = 0; P.die(x, z - 1); }
    else if (!P.dead) {
      const d = P.inCar ? dist(this.driving.car.x, this.driving.car.z, x, z) : dist(P.x, P.z, x, z);
      if (d < r) P.takeDamage(110 * (1 - d / r) * (P.inCar ? 1.5 : 1), x, z);
    }
    for (const h of this.humans()) {
      if (h.dead) continue;
      const d = dist(h.x, h.z, x, z);
      if (d < r) {
        const wasAlive = !h.dead;
        h.takeDamage(240 * (1 - d / r), byPlayer, x, z);
        if (byPlayer && wasAlive && h.dead && this.rewards && h.isOfficer) this.rewards.kill(h, false);
      }
    }
    for (const c of this.cars) {
      if (c === source || c.exploded) continue;
      const d = dist(c.x, c.z, x, z);
      if (d < r * 0.9) { c.takeDamage(140 * (1 - d / (r * 0.9)), byPlayer); if (c.wrecked && c.burnT > 0.8) c.burnT = 0.5 + Math.random() * 0.5; }
    }
    this.alarm(x, z, 60);
    if (byPlayer) this.dispatch.crime('gunfire', x, z);
  }

  // A loud noise (gunshot): guards nearby come running.
  noise(x, z, r) {
    for (const o of this.officers) if (o.guard && !o.guard.alerted && !o.dead && dist(o.x, o.z, x, z) < r) o.alert();
  }

  onRankUp(i, rank) { this.hud.rankUp(rank); this.music.rankUp(); }

  // Rank perks and shop items: max health, armour, guns you own.
  applyPerks() {
    const P = this.player, r = this.rewards.rank;
    P.maxHealth = 100 + (r >= 1 ? 20 : 0) + (r >= 5 ? 20 : 0);
    if (P.health > P.maxHealth || !this.mission) P.health = Math.min(P.maxHealth, Math.max(P.health, 0));
    for (const id of this.save.weapons) if (!P.owned.includes(id)) P.giveWeapon(id, WEAPONS[id].mag * 3);
  }

  // Big end text (death / busted) with grey slow motion.
  endScreen(title, sub) {
    const e = document.getElementById('death');
    if (!title) { e.classList.add('hidden'); document.body.classList.remove('dead'); this.slowT = 0; return; }
    e.innerHTML = `<div class="t">${title}</div><div class="s">${sub}</div>`;
    e.classList.remove('hidden'); document.body.classList.add('dead');
    this.slowT = 2.6; this.slowScale = 0.3;
  }

  removeCar(c) {
    c.inactive = true; c.pursuing = false;
    this.scene.remove(c.mesh);
    this.cars = this.cars.filter((x) => x !== c);
    this.policeCars = this.policeCars.filter((x) => x !== c);
  }

  spawnPeople(count) {
    const loops = this.pedLoops;
    let placed = 0;
    for (let a = 0; a < count * 60 && placed < count; a++) {
      const loop = loops[Math.floor(Math.random() * loops.length)];
      const i = Math.floor(Math.random() * loop.length);
      const A = loop[i], B = loop[(i + 1) % loop.length], t = Math.random();
      const pos = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const d = dist(pos[0], pos[1], START.x, START.z);
      if (d < 5 || d > 90) continue;
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
    if (m && this.marker && this.marker.x === m.x && this.marker.z === m.z && this.marker.r === m.r) return;
    this.marker = m;
    this.markerMesh.visible = !!m;
    if (m) {
      this.markerMesh.position.set(m.x, this.world.groundAt(m.x, m.z), m.z);
      const r = m.moving ? Math.max(1.5, m.r) : m.r;
      this.markerMesh.scale.set(r, m.moving ? 0.25 : 1, r);
    }
  }

  say(lines) { this.hud.say(lines); }

  // ---------- Resetting the city between missions ----------
  resetCity() {
    const P = this.player;
    if (this.mission) { this.mission.cleanup(); this.mission = null; }
    this.endScreen(null);
    if (P.inCar) this.driving.exit(true);
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
    for (const rb of [...this.dispatch.roadblocks]) rb.remove();
    if (this.dispatch.heli) this.dispatch.heli.remove();
    this.waypoint = null;
    this.ravi = null;
    P.owned = ['pistol']; P.weapon = 'pistol';
    for (const id of Object.keys(P.ammo)) P.ammo[id] = { mag: 0, reserve: 0 };
    P.ammo.pistol = { mag: P.magSize('pistol'), reserve: 48 };
    P.reloadT = 0; P.aiming = false; P.carrying = false;
    this.applyPerks();
    if (this.save.weapons.includes('gold')) P.weapon = 'gold';
    P.armor = this.rewards.has('armour') ? 60 : 0;
    P.health = P.maxHealth;
    this.pins = []; this.raceGo = true; this.raceHold = false; this.takedownTarget = null; this.driving.nitro = 1;
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
    this.music.start();
    this.music.setEnabled(!!settings.music);
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
    this.hud.setMission('FREE ROAM', 'Explore Navapur: steal cars, find the SMG in the courtyard, drive to the beach. Tap the map to set a waypoint. CALL COPS for a chase.');
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
  }

  respawnFree() {
    this.dispatch.clear(false);
    for (const o of [...this.officers]) o.remove();
    this.placePlayer(START.x, START.z, START.yaw);
  }

  onPlayerDied() {
    const m = this.mission;
    this.endScreen('KHATAM!', 'Vikram was killed');
    setTimeout(() => {
      if (this.mission !== m) return;   // a new mission already started
      this.endScreen(null);
      if (m) m.fail('Vikram was killed'); else if (this.mode === 'play' || this.mode === 'cutscene') this.respawnFree();
    }, 3000);
  }

  missionPassed(def, res) {
    this.hud.showBig('MISSION PASSED', '#ffc531', 2.5);
    this.music.passed();
    this.slowmo(1.2, 0.35);
    const total = res.bonuses.reduce((a, b) => a + b[1], 0);
    const xpBefore = this.save.xp;
    this.save.coins += total;
    this.save.stars[def.id] = Math.max(this.save.stars[def.id] || 0, res.stars);
    this.save.unlocked = Math.max(this.save.unlocked, def.id + 1);
    const best = this.save.best[def.id];
    if (!best || this.mission.elapsed < best) this.save.best[def.id] = Math.round(this.mission.elapsed);
    this.rewards.addXP(res.xp);
    writeSave(this.save);
    const text = res.chapterEnd ? `CHAPTER ${res.chapterEnd} COMPLETE! ${def.next}` : def.next;
    const m = this.mission;
    setTimeout(() => {
      if (this.mission !== m) return;
      this.dispatch.clear(false);
      this.showResult(true, res.stars, text, def, { ...res, total, xpBefore, xpAfter: this.save.xp });
    }, 2200);
  }

  missionFailed(def, reason) {
    this.hud.showBig('MISSION FAILED', '#ff4a3d', 2.5);
    this.music.failed();
    const m = this.mission;
    setTimeout(() => { if (this.mission === m) this.showResult(false, 0, reason + '. Try again!', def); }, 2200);
  }

  showResult(passed, stars, text, def, res) {
    this.mode = 'result';
    this.controls.enabled = false; this.controls.releaseAll();
    document.exitPointerLock?.();
    document.getElementById('hud').classList.add('hidden');
    const t = document.getElementById('result-title');
    t.textContent = passed ? 'MISSION PASSED' : 'MISSION FAILED';
    t.classList.toggle('fail', !passed);
    [...document.getElementById('result-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
    document.getElementById('result-text').textContent = text;
    animateResult(this, passed, stars, res);
    const next = document.getElementById('btn-next');
    next.classList.toggle('hidden', !passed || !MISSIONS.find((m) => m.id === def.id + 1));
    this.lastDef = def;
    this.showScreen('result-screen');
  }

  goMenu() {
    if (this.mission) { this.mission.cleanup(); this.mission = null; }
    this.mode = 'menu';
    this.controls.enabled = false; this.controls.releaseAll();
    document.exitPointerLock?.();
    document.getElementById('hud').classList.add('hidden');
    this.resetCity();
    updateMenu();
    this.showScreen('menu');
    this.audio.engine(false);
    this.music.setLevel(0);
    if (!this.dailyChecked) { this.dailyChecked = true; setTimeout(showDaily, 600); }
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

  // Full-screen map (game waits while it is open).
  openMap() {
    if (this.mode !== 'play') return;
    this.mode = 'map';
    this.controls.enabled = false; this.controls.releaseAll();
    document.exitPointerLock?.();
    document.getElementById('bigmap').classList.remove('hidden');
    this.hud.drawBigMap();
  }

  closeMap() {
    if (this.mode !== 'map') return;
    document.getElementById('bigmap').classList.add('hidden');
    this.mode = 'play';
    this.controls.enabled = true;
    this.clock.getDelta();
    this.controls.lockMouse();
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
    this.aimAssist = !!settings.assist;
    this.driving.mode = settings.drive === 'buttons' ? 'buttons' : 'joystick';
    document.body.classList.toggle('drive-buttons', this.driving.mode === 'buttons');
    document.documentElement.style.setProperty('--bs', settings.btn);
    if (this.audio.enabled) this.audio.setMuted(!settings.sound);
    if (this.music) this.music.setEnabled(!!settings.music);
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
    this.network.updateSignals(this.time);
    this.world.update(dt, this.time);
    for (const c of this.cars) c.update(dt);
    for (const p of this.peds) p.update(dt);
    for (const a of [...this.ambient]) a.update(dt);
    for (const o of [...this.officers]) o.update(dt);
    this.pickups.update(dt);
    this.rewards.update(dt);
    this.spotLife.update(dt);
    this.recycleT = (this.recycleT || 0) - dt;
    if (this.recycleT <= 0) { this.recycleT = 0.5; this.recycle(); }
    this.fx.update(dt);
    if (this.markerMesh.visible) this.markerMesh.children[1].scale.setScalar(1 + Math.sin(this.time * 4) * 0.08);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const raw = Math.min(this.clock.getDelta(), 0.05);
    if (this.slowT > 0) { this.slowT -= raw; this.timeScale += ((this.slowT > 0 ? this.slowScale : 1) - this.timeScale) * Math.min(1, raw * 12); }
    else this.timeScale += (1 - this.timeScale) * Math.min(1, raw * 6);
    const dt = raw * this.timeScale;
    this.refreshLists();

    if (this.mode === 'menu' || this.mode === 'result') {
      this.time += dt;
      // Slow flight along the seafront at sunset.
      const a = this.time * 0.035, x = Math.sin(a) * 160;
      this.camera.position.set(x, 15, -268);
      this.camera.lookAt(x + 40, 9, -218);
      this.simulate(dt);
      this.render();
      return;
    }
    if (this.mode === 'paused' || this.mode === 'map') { this.render(); return; }

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
    // Silent takedown: behind an unaware guard.
    this.takedownTarget = null;
    if (!P.inCar && !P.dead) {
      for (const o of this.officers) {
        if (!o.guard || o.guard.alerted || o.dead) continue;
        const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz);
        if (d < 1.8 && (dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw)) / (d || 1) < -0.15) { this.takedownTarget = o; break; }
      }
    }
    if (input.takedownPressed && this.takedownTarget) { this.takedownTarget.takedown(); this.takedownTarget = null; }
    if (input.drivemodePressed) {
      settings.drive = this.driving.mode === 'buttons' ? 'joystick' : 'buttons';
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* fine */ }
      this.applySettings();
      this.hud.toast(settings.drive === 'buttons' ? 'CAR CONTROLS: ARROW BUTTONS' : 'CAR CONTROLS: JOYSTICK');
    }
    if (input.pickupPressed && !P.inCar) {
      const pk = this.pickups.near(P.x, P.z);
      if (pk) {
        if (pk.type === 'health') P.health = P.maxHealth;
        else if (pk.type === 'ammo') { for (const id of P.owned) P.ammo[id].reserve += Math.round(WEAPONS[id].mag * 2); }
        else if (WEAPONS[pk.type]) { P.giveWeapon(pk.type, WEAPONS[pk.type].mag * 3); P.weapon = pk.type; this.hud.showBig(WEAPONS[pk.type].name, '#ffc531', 1.5); }
        this.pickups.take(pk);
        this.audio.reload();
      }
    }
    if (input.callCopsPressed && !this.mission) this.dispatch.setStars(Math.max(1, this.dispatch.stars));
    if (input.mapPressed) { this.openMap(); return; }
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
    const mLevel = this.mission ? Math.max(this.mission.music ?? 1, this.dispatch.stars ? 2 : 0) : (this.dispatch.stars ? 2 : 0);
    this.music.setLevel(Math.min(3, mLevel + (this.dispatch.stars >= 4 ? 1 : 0)));
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
  for (const ch of CHAPTERS) {
    const h = document.createElement('div');
    h.className = 'chapter' + (ch.soon ? ' soon' : '');
    const total = ch.soon ? 0 : MISSIONS.filter((m) => m.id >= ch.from && m.id <= ch.to).reduce((a, m) => a + (game.save.stars[m.id] || 0), 0);
    h.innerHTML = `<b>CHAPTER ${ch.id}</b> ${ch.title}${ch.soon ? ' <span class="tag">COMING SOON</span>' : ` <span class="tag">&#9733; ${total} / 30</span>`}${ch.teaser ? `<div class="teaser">${ch.teaser}</div>` : ''}`;
    list.appendChild(h);
    if (ch.soon) continue;
    for (const m of MISSIONS.filter((x) => x.id >= ch.from && x.id <= ch.to)) {
      const locked = m.id > game.save.unlocked;
      const st = game.save.stars[m.id] || 0;
      const card = document.createElement('div');
      card.className = 'mcard' + (locked ? ' locked' : '');
      card.innerHTML = `<div class="num">${m.id}</div><div><div class="t">${m.title}${locked ? ' &#128274;' : ''}</div><div class="d">${locked ? 'Finish the mission before to unlock.' : m.brief}</div></div>
        <div class="s">${[0, 1, 2].map((i) => `<span class="${i < st ? '' : 'off'}">&#9733;</span>`).join('')}<div class="cash">&#8377;${m.reward.toLocaleString('en-IN')}</div></div>`;
      if (!locked) card.addEventListener('click', () => game.startMission(m.id));
      list.appendChild(card);
    }
  }
}

// Menu: wallet, rank and XP bar.
function updateMenu() {
  const s = game.save, r = rankOf(s.xp);
  $('menu-coins').textContent = s.coins.toLocaleString('en-IN');
  $('menu-rank').textContent = RANKS[r].name;
  $('menu-xp-fill').style.width = Math.round(rankProgress(s.xp) * 100) + '%';
  $('menu-xp-text').textContent = r < RANKS.length - 1 ? `${s.xp} / ${RANKS[r + 1].xp} XP` : `${s.xp} XP · MAX RANK`;
}

// Shop: spend your cash on guns and upgrades (no real money).
function renderShop() {
  const list = $('shop-list'), R = game.rewards;
  $('shop-coins').textContent = game.save.coins.toLocaleString('en-IN');
  list.innerHTML = '';
  for (const it of SHOP) {
    const owned = R.has(it.id), rankOk = R.rank >= it.rank;
    const d = document.createElement('div');
    d.className = 'scard' + (owned ? ' owned' : '');
    let btn;
    if (owned) btn = '<span class="own">OWNED &#10003;</span>';
    else if (!rankOk) btn = `<span class="need">RANK: ${RANKS[it.rank].name}</span>`;
    else btn = `<button class="buy${game.save.coins >= it.price ? '' : ' poor'}">&#8377;${it.price.toLocaleString('en-IN')}</button>`;
    d.innerHTML = `<div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div>${btn}`;
    const b = d.querySelector('button');
    if (b) b.addEventListener('click', () => {
      if (R.buy(it.id)) { game.music.start(); game.music.cash(); renderShop(); updateMenu(); }
      else b.textContent = 'NOT ENOUGH CASH';
    });
    list.appendChild(d);
  }
}

// Daily reward: a bigger present every day in a row.
function showDaily() {
  const r = game.rewards.dailyAvailable();
  if (!r || game.mode !== 'menu') return;
  const box = $('daily-days');
  box.innerHTML = DAILY.map((a, i) => `<div class="day${i + 1 === Math.min(r.day, 7) ? ' today' : i + 1 < r.day ? ' got' : ''}"><small>DAY ${i + 1}</small>&#8377;${a.toLocaleString('en-IN')}</div>`).join('');
  $('daily-title').textContent = `DAILY REWARD · DAY ${r.day}`;
  $('daily').classList.remove('hidden');
}
$('btn-daily').addEventListener('click', () => {
  const r = game.rewards.claimDaily();
  $('daily').classList.add('hidden');
  if (r) { updateMenu(); flashCoins(`+₹${r.amount.toLocaleString('en-IN')}`); }
});
function flashCoins(text) {
  const f = $('coin-burst');
  f.textContent = text; f.classList.remove('hidden');
  f.style.animation = 'none'; void f.offsetWidth; f.style.animation = '';
  setTimeout(() => f.classList.add('hidden'), 1800);
}

// Results: stars pop in, cash counts up line by line, XP bar fills.
function animateResult(g, passed, stars, res) {
  const cashEl = $('result-cash'), list = $('result-bonus'), xpBox = $('result-xp');
  [...$('result-stars').children].forEach((el, i) => { el.classList.remove('on'); if (i < stars) setTimeout(() => { el.classList.add('on'); g.music.checkpoint(); }, 400 + i * 350); });
  list.innerHTML = ''; cashEl.textContent = ''; xpBox.classList.add('hidden');
  if (!passed || !res) return;
  let shown = 0;
  res.bonuses.forEach(([label, amount], i) => setTimeout(() => {
    const row = document.createElement('div'); row.className = 'brow';
    row.innerHTML = `<span>${label}</span><b>+&#8377;${amount.toLocaleString('en-IN')}</b>`;
    list.appendChild(row);
    const from = shown; shown += amount;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 350);
      cashEl.textContent = '₹' + Math.round(from + (shown - from) * k).toLocaleString('en-IN');
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick); g.music.cash();
  }, 1500 + i * 380));
  setTimeout(() => {
    xpBox.classList.remove('hidden');
    const r0 = rankOf(res.xpBefore), r1 = rankOf(res.xpAfter);
    $('result-xp-text').textContent = `+${res.xp} XP` + (r1 > r0 ? ` · RANK UP: ${RANKS[r1].name}!` : ` · ${RANKS[r1].name}`);
    const fill = $('result-xp-fill');
    fill.style.transition = 'none'; fill.style.width = (r1 > r0 ? 0 : Math.round(rankProgress(res.xpBefore) * 100)) + '%';
    void fill.offsetWidth; fill.style.transition = 'width 1s ease-out';
    fill.style.width = Math.round(rankProgress(res.xpAfter) * 100) + '%';
    if (res.earned) { const row = document.createElement('div'); row.className = 'brow dim'; row.innerHTML = `<span>Picked up during the mission</span><b>&#8377;${res.earned.toLocaleString('en-IN')}</b>`; list.appendChild(row); }
  }, 1600 + res.bonuses.length * 380);
}

let settingsReturn = 'menu';
function openSettings(from) {
  settingsReturn = from;
  $('set-look').value = settings.look; $('set-aim').value = settings.aim; $('set-btn').value = settings.btn;
  $('set-invert').checked = !!settings.invert; $('set-sound').checked = !!settings.sound;
  $('set-diff').value = String(settings.diff); $('set-gfx').value = quality;
  $('set-assist').checked = !!settings.assist; $('set-drive').value = settings.drive; $('set-music').checked = !!settings.music;
  game.showScreen('settings-screen');
}
function saveSettings() {
  settings.look = $('set-look').value; settings.aim = $('set-aim').value; settings.btn = $('set-btn').value;
  settings.invert = $('set-invert').checked; settings.sound = $('set-sound').checked; settings.diff = $('set-diff').value;
  settings.assist = $('set-assist').checked; settings.drive = $('set-drive').value; settings.music = $('set-music').checked;
  const gfx = $('set-gfx').value;
  const gfxChanged = gfx !== quality;
  settings.gfx = gfx;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* fine */ }
  game.applySettings();
  if (gfxChanged) location.href = location.pathname;   // new graphics level needs a reload
}
for (const id of ['set-look', 'set-aim', 'set-btn', 'set-invert', 'set-sound', 'set-diff', 'set-assist', 'set-drive', 'set-music']) $(id).addEventListener('change', saveSettings);
$('btn-shop').addEventListener('click', () => { renderShop(); game.showScreen('shop-screen'); });
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game.mode === 'play' && !document.pointerLockElement) game.pause();
  if (game.mode === 'map' && (e.key === 'Escape' || e.key.toLowerCase() === 'm')) game.closeMap();
});
$('btn-resume').addEventListener('click', () => { game.showScreen(null); game.mode = 'play'; game.controls.enabled = true; game.clock.getDelta(); game.audio.setMuted(!settings.sound); game.controls.lockMouse(); });
$('btn-restart').addEventListener('click', () => { if (game.mission) game.startMission(game.mission.def.id); });
$('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
$('btn-quit').addEventListener('click', () => game.goMenu());
$('btn-next').addEventListener('click', () => game.startMission(game.lastDef.id + 1));
$('btn-retry').addEventListener('click', () => game.startMission(game.lastDef.id));
$('btn-result-menu').addEventListener('click', () => game.goMenu());
$('btn-skip').addEventListener('click', () => { game.hud.clearSubs(); game.endCutscene(); });
