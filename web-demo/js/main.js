// City Thief - browser demo (matches Unity Steps 1 + 2).
import * as THREE from 'three';
import { World } from './world.js';
import { buildNetwork, buildLoops, Car, CAR_SPECS, randomCarColor, Pedestrian } from './traffic.js';
import { Dispatch, PoliceCar } from './police.js';
import { Player, ThirdPersonCamera } from './player.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { dist, pick } from './util.js';

// Low-end phone? (4 GB RAM or less, or a small/slow device) -> no shadows, lower resolution.
const mem = navigator.deviceMemory || 8;
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowQuality = mem <= 4 || new URLSearchParams(location.search).has('low');

class Game {
  constructor() {
    this.lowQuality = lowQuality;
    this.time = 0;
    this.running = false;

    // ---- Renderer ----
    this.renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    // ---- Scene, light, haze ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcc6d0);
    this.scene.fog = new THREE.Fog(0xbcc6d0, 90, 280);
    this.scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x5a5448, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun.castShadow = !lowQuality;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -35; sc.right = 35; sc.top = 35; sc.bottom = -35; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

    // ---- World ----
    this.world = new World(this.scene, lowQuality);
    this.network = buildNetwork(this.world, this.scene);
    this.world.finishStatic();

    this.cars = []; this.policeCars = []; this.peds = []; this.officers = [];
    this.player = new Player(this, 5.8, 14, -Math.PI / 2);   // footpath near the centre crossing, facing the road
    this.camera3p = new ThirdPersonCamera(this, this.camera);
    this.camera3p.snapBehind();
    this.dispatch = new Dispatch(this);

    this.spawnTraffic(14, 2);
    this.spawnPeople(28);

    this.controls = new Controls();
    this.hud = new Hud(this);
    this.dispatch.onStart = () => this.hud.showBig('COPS ARE COMING!', '#ff4438', 2);
    this.dispatch.onEnd = (escaped) => { if (escaped) this.hud.showBig('YOU LOST THE POLICE', '#4dff66', 2.5); };
    this.dispatch.onBusted = () => this.hud.showBig('BUSTED!', '#ff2626', 2.5);

    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // Everything other things can bump into or brake for.
  get agents() { return this._agents; }
  get walkers() { return this._walkers; }
  refreshLists() {
    this._agents = [...this.cars, ...this.peds, ...this.officers, this.player];
    this._walkers = [...this.peds, ...this.officers, this.player];
  }

  spawnTraffic(carCount, policeCount) {
    const N = this.network.nodes;
    const spots = N.map((n, i) => (n.spawnable ? i : -1)).filter((i) => i >= 0).sort(() => Math.random() - 0.5);
    const used = [];
    const take = (awayFromPlayer) => {
      for (let s = 0; s < spots.length; s++) {
        const n = N[spots[s]];
        if (dist(n.x, n.z, this.player.x, this.player.z) < awayFromPlayer) continue;
        if (used.some((u) => dist(u.x, u.z, n.x, n.z) < 12)) continue;
        used.push(n);
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
      const c = new Car(this, pick(CAR_SPECS), randomCarColor());
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
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.running) { this.renderer.render(this.scene, this.camera); return; }

    this.time += dt;
    this.refreshLists();
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

    // Shadows follow the player (small shadow area = sharp and cheap).
    const P = this.player;
    this.sun.position.set(P.x + 30, 60, P.z + 22);
    this.sun.target.position.set(P.x, 0, P.z);

    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- Start screen ----------
const game = new Game();
window.__cityThief = game;   // handy for testing in the browser console
document.getElementById('loading').classList.add('hidden');

const start = document.getElementById('start-screen');
const hud = document.getElementById('hud');

document.getElementById('btn-play').addEventListener('click', async () => {
  start.classList.add('hidden');
  hud.classList.remove('hidden');
  game.controls.enabled = true;
  game.running = true;
  game.clock.getDelta();
  // On phones: full screen + landscape when the browser allows it.
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
});
