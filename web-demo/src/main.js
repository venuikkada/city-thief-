// City Thief - browser demo (Unity Steps 1 + 2, upgraded visuals).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { buildNetwork, buildLoops, Car, randomTrafficType, randomCarColor, Pedestrian } from './traffic.js';
import { Dispatch, PoliceCar } from './police.js';
import { Player, ThirdPersonCamera } from './player.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { loadCharacters } from './characters.js';
import { dist } from './util.js';
import { makeSky } from './sky.js';

// ---------- Quality: low (old 4 GB phones), medium (phones), high (computers) ----------
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches;
const mem = navigator.deviceMemory || 8;
let quality = isTouch ? (mem <= 4 ? 'low' : 'medium') : 'high';
if (params.has('low')) quality = 'low';
if (params.has('medium')) quality = 'medium';
if (params.has('high')) quality = 'high';

const COUNTS = { low: { cars: 10, police: 2, people: 10 }, medium: { cars: 14, police: 2, people: 16 }, high: { cars: 18, police: 2, people: 26 } };

// Sun direction: same side as the sun in the sky picture, but higher, for nice long shadows.
const SUN_DIR = new THREE.Vector3(0.81, 0.53, 0.59).normalize();

class Game {
  constructor() {
    this.quality = quality;
    this.shadows = quality !== 'low';
    this.time = 0;
    this.running = false;

    // ---- Renderer: filmic colour (ACES) like console games ----
    this.renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
    const maxRatio = { low: 1, medium: 1.5, high: 2 }[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe0b08a, 120, 360);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

    // Warm sun + soft sky fill.
    this.sun = new THREE.DirectionalLight(0xffd2a1, 2.6);
    this.sun.castShadow = this.shadows;
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xffe4c4, 0x4a4036, 0.6));

    // Glow (bloom) on computers; phones skip it to stay smooth.
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

    const [sky] = await Promise.all([
      new RGBELoader(manager).loadAsync('assets/sky/sunset_1k.hdr'),
      loadCharacters(manager),
    ]);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = sky;   // real sky light + reflections on cars and glass
    this.skyDome = makeSky(SUN_DIR);
    this.scene.add(this.skyDome);

    // ---- World ----
    this.world = new World(this.scene, quality);
    this.network = buildNetwork(this.world, this.scene);
    this.world.finishStatic();

    this.cars = []; this.policeCars = []; this.peds = []; this.officers = [];
    this.player = new Player(this, 6.6, 19.5, -Math.PI / 2);   // footpath near the centre crossing, facing the road
    this.camera3p = new ThirdPersonCamera(this, this.camera);
    this.camera3p.snapBehind();
    this.dispatch = new Dispatch(this);

    const n = COUNTS[quality];
    this.spawnTraffic(n.cars, n.police);
    this.spawnPeople(n.people);

    this.controls = new Controls();
    this.hud = new Hud(this);
    this.dispatch.onStart = () => this.hud.showBig('COPS ARE COMING!', '#ff4438', 2);
    this.dispatch.onEnd = (escaped) => { if (escaped) this.hud.showBig('YOU LOST THE POLICE', '#4dff66', 2.5); };
    this.dispatch.onBusted = () => this.hud.showBig('BUSTED!', '#ff2626', 2.5);

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    this.updateCamera(0);
    requestAnimationFrame(this.loop);
  }

  get agents() { return this._agents; }
  get walkers() { return this._walkers; }
  refreshLists() {
    this._agents = [...this.cars, ...this.peds, ...this.officers, this.player];
    this._walkers = [...this.peds, ...this.officers, this.player];
  }

  spawnTraffic(carCount, policeCount) {
    const N = this.network.nodes;
    const spots = N.map((nd, i) => (nd.spawnable ? i : -1)).filter((i) => i >= 0).sort(() => Math.random() - 0.5);
    const used = [];
    const take = (away) => {
      for (let s = 0; s < spots.length; s++) {
        const nd = N[spots[s]];
        if (dist(nd.x, nd.z, this.player.x, this.player.z) < away) continue;
        if (used.some((u) => dist(u.x, u.z, nd.x, nd.z) < 12)) continue;
        used.push(nd);
        return spots.splice(s, 1)[0];
      }
      return -1;
    };
    for (let i = 0; i < policeCount; i++) {
      const node = take(45);
      if (node < 0) break;
      const p = new PoliceCar(this);
      p.init(node);
      this.cars.push(p); this.policeCars.push(p);
    }
    for (let i = 0; i < carCount; i++) {
      const node = take(15);
      if (node < 0) break;
      const c = new Car(this, randomTrafficType(), randomCarColor());
      c.init(node);
      this.cars.push(c);
    }
  }

  spawnPeople(count) {
    const loops = buildLoops();
    let placed = 0;
    for (let a = 0; a < count * 5 && placed < count; a++) {
      const loop = loops[a % loops.length];
      const i = Math.floor(Math.random() * loop.length);
      const A = loop[i], B = loop[(i + 1) % loop.length], t = Math.random();
      const pos = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      if (dist(pos[0], pos[1], this.player.x, this.player.z) < 5) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.peds.push(new Pedestrian(this, loop, pos, dir === 1 ? i + 1 : i, dir));
      placed++;
    }
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  updateCamera(dt) {
    // Shadows follow the player (small area = sharp and cheap).
    const P = this.player;
    this.sun.position.set(P.x + SUN_DIR.x * 100, SUN_DIR.y * 100, P.z + SUN_DIR.z * 100);
    this.sun.target.position.set(P.x, 0, P.z);
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.refreshLists();
    if (!this.running) {
      // Behind the start screen: slow orbit of the city.
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(Math.cos(a) * 60, 32, Math.sin(a) * 60);
      this.camera.lookAt(0, 6, 0);
      if (this.skyDome) this.skyDome.position.copy(this.camera.position);
      for (const c of this.cars) c.update(dt);
      for (const p of this.peds) p.update(dt);
      this.render();
      return;
    }

    this.time += dt;
    const input = this.controls.poll();
    if (input.callCopsPressed) this.dispatch.start();

    for (const s of this.network.signals) s.update(this.time);
    for (const c of this.cars) c.update(dt);
    for (const p of this.peds) p.update(dt);
    for (const o of [...this.officers]) o.update(dt);
    this.player.update(dt, input, this.camera3p.yaw);
    this.camera3p.update(dt, input.look);
    this.dispatch.update(dt);
    this.hud.update(dt);
    this.updateCamera(dt);

    let siren = Infinity;
    for (const p of this.policeCars) if (p.pursuing) siren = Math.min(siren, dist(p.x, p.z, this.player.x, this.player.z));
    this.audio.update(siren);

    this.render();
  }
}

// ---------- Start ----------
const game = new Game();
window.__cityThief = game;   // handy for testing in the browser console
const bar = document.getElementById('load-bar');
const loadText = document.getElementById('load-text');

game.load((p) => {
  bar.style.width = Math.round(p * 100) + '%';
}).then(() => {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
}).catch((e) => {
  console.error(e);
  loadText.textContent = 'Could not load the game. Please check your internet and refresh.';
});

const start = document.getElementById('start-screen');
const hud = document.getElementById('hud');

document.getElementById('btn-play').addEventListener('click', async () => {
  start.classList.add('hidden');
  hud.classList.remove('hidden');
  game.controls.enabled = true;
  if (!game.running) {
    game.running = true;
    game.camera3p.snapBehind();
  }
  game.clock.getDelta();
  game.audio.start();
  if (isTouch) {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* not allowed: fine */ }
    try { await screen.orientation.lock('landscape'); } catch (e) { /* not supported: fine */ }
  }
});

document.getElementById('btn-pause').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  game.running = false;
  game.controls.enabled = false;
  hud.classList.add('hidden');
  start.classList.remove('hidden');
  document.getElementById('btn-play').textContent = 'RESUME';
  game.audio.setMuted(true);
});
document.getElementById('btn-play').addEventListener('click', () => game.audio.setMuted(false));
