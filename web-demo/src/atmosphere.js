// Time of day and weather: DAY (golden hour), NIGHT (lit windows, street-light pools, headlights,
// neon), STORM (night + heavy rain, lightning, thunder, wet roads) and BLACKOUT (power cut:
// only the moon, car lights and flashlights). Also the monsoon FLOOD water for a mission.
import * as THREE from 'three';
import { CITY } from './world.js';

const MODES = {
  day: { night: 0, storm: 0, rain: 0, lights: 1 },
  night: { night: 1, storm: 0, rain: 0, lights: 1 },
  storm: { night: 1, storm: 1, rain: 1, lights: 1 },
  blackout: { night: 1, storm: 0, rain: 0, lights: 0 },
};
const C = (h) => new THREE.Color(h);
const DAY = { fog: C(0xe3b48c), sun: C(0xffd2a1), hemiSky: C(0xffe4c4), hemiGround: C(0x4a4036) };
const NIGHT = { fog: C(0x0b1222), sun: C(0x9fb4ff), hemiSky: C(0x5a6f9e), hemiGround: C(0x2a241c) };
const STORM = { fog: C(0x1b2129) };

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(0.45, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// A dark-blue sky with a warm city glow, used for reflections at night.
function nightEnvironment(renderer) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; void main() {
      float h = vD.y;
      vec3 c = mix(vec3(0.05, 0.06, 0.11), vec3(0.008, 0.015, 0.04), clamp(h, 0.0, 1.0));
      c *= 2.2; c += vec3(0.6, 0.3, 0.12) * exp(-abs(h) * 8.0) * 0.8;
      c = mix(c, vec3(0.02), smoothstep(0.0, -0.3, h));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0).texture;
  pm.dispose();
  return tex;
}

export class Atmosphere {
  constructor(game, sky) {
    const g = this.game = game;
    this.sky = sky;
    this.mode = 'day';
    this.cur = { ...MODES.day }; this.target = { ...MODES.day };
    this.dayEnv = g.scene.environment;
    this.nightEnv = nightEnvironment(g.renderer);
    this.flash = 0; this.thunderT = 6; this.carsT = 0; this.time = 0;
    this.buildLampLight();
    this.buildRain();
    // Real headlights for the player's car (not on the lowest graphics setting).
    if (g.quality !== 'low') {
      this.spot = new THREE.SpotLight(0xfff0d0, 0, 70, 0.5, 0.55, 1.2);
      g.scene.add(this.spot, this.spot.target);
    }
  }

  get isNight() { return this.cur.night > 0.5; }

  set(mode, instant = false) {
    if (!MODES[mode]) mode = 'day';
    this.mode = mode;
    this.target = { ...MODES[mode] };
    if (instant) this.cur = { ...this.target };
    this.carsT = 0;
  }

  // Street lights at night: a warm pool of light on the ground and a soft cone of light in the air.
  buildLampLight() {
    const g = this.game, W = g.world, heads = W.lampHeads || [];
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,214,150,1)', 'rgba(255,170,80,0.35)'), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }), heads.length);
    const m = new THREE.Matrix4();
    heads.forEach(([x, z], i) => {
      pool.setMatrixAt(i, m.makeTranslation(x, W.groundAt(x, z) + 0.04, z));
    });
    pool.frustumCulled = false;
    pool.visible = false;
    pool.renderOrder = 2;
    g.scene.add(pool);
    this.pool = pool;
  }

  buildRain() {
    const g = this.game, n = g.quality === 'low' ? 500 : g.quality === 'medium' ? 900 : 1500;
    this.rainN = n;
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.respawnDrop(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaebdd4, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    g.scene.add(this.rain);
  }

  respawnDrop(i, anyHeight) {
    const cam = this.game.camera.position, p = this.rainPos, k = i * 6;
    const x = cam.x + (Math.random() - 0.5) * 50, z = cam.z + (Math.random() - 0.5) * 50;
    const y = cam.y + (anyHeight ? (Math.random() - 0.4) * 30 : 14 + Math.random() * 6);
    p[k] = x; p[k + 1] = y; p[k + 2] = z; p[k + 3] = x - 0.08; p[k + 4] = y - 0.75; p[k + 5] = z;
  }

  // Monsoon flood: brown water over the streets at "level" metres (null = no flood).
  setFlood(level) {
    const g = this.game;
    if (level === null) { if (this.flood) this.flood.visible = false; this.floodLevel = null; return; }
    if (!this.flood) {
      const nt = g.world.seaTex ? g.world.seaTex.clone() : null;
      if (nt) { nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(40, 40); }
      this.floodTex = nt;
      this.flood = new THREE.Mesh(new THREE.PlaneGeometry(470, 470).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x4a5048, roughness: 0.08, metalness: 0.35, normalMap: nt, normalScale: new THREE.Vector2(0.4, 0.4) }));
      g.scene.add(this.flood);
    }
    this.flood.visible = true;
    this.floodLevel = level;
    this.flood.position.set(0, level, 0);
  }

  update(dt) {
    const g = this.game, c = this.cur, t = this.target;
    this.time += dt;
    const k = Math.min(1, dt * 0.8);
    for (const key of Object.keys(c)) c[key] += (t[key] - c[key]) * k;
    const n = c.night, st = c.storm, L = c.lights, r = c.rain;
    CITY.night.value = n; CITY.lights.value = L;

    // Sky, fog, sun / moon, ambient light, exposure.
    const u = this.sky.material.uniforms;
    u.night.value = n; u.storm.value = st; u.time.value = this.time; u.flash.value = this.flash;
    const fog = g.scene.fog;
    fog.color.copy(DAY.fog).lerp(NIGHT.fog, n).lerp(STORM.fog, st);
    fog.near = 150 - n * 70 - st * 40; fog.far = 560 - n * 180 - st * 170;
    const dark = n * (1 - L);   // blackout: only the moon -> a bit more blue moonlight so the streets can still be seen
    g.renderer.toneMappingExposure = 0.9 + n * 0.32 - st * 0.08 + dark * 0.3 + this.flash * 0.5;
    g.sun.intensity = (2.6 - n * 1.95) * (1 - st * 0.45) + dark * 0.45;
    g.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    g.hemi.intensity = 0.6 + n * 0.25 + dark * 0.4 + this.flash * 2.5;
    g.hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n);
    g.hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, n);
    const env = n > 0.5 ? this.nightEnv : this.dayEnv;
    if (g.scene.environment !== env) g.scene.environment = env;

    // City lights: shops, signs, neon, lamps (all off in a blackout).
    const M = g.world.mats;
    if (M) {
      const lit = n * L;
      M.shop.emissiveIntensity = 0.25 + lit * 1.3 - (1 - L) * n * 0.25;
      M.signs.emissiveIntensity = 0.45 + lit * 1.2 - (1 - L) * n * 0.4;
      M.neon.color.setScalar(2.2 * (1 + lit * 0.6) * (L * 0.97 + 0.03));
      g.world.glowMat.color.setScalar(L > 0.5 || n < 0.5 ? 1 : 0.08);
      M.ground.roughness = 0.92 - Math.max(st, r) * 0.62;
      M.ground.envMapIntensity = 0.45 + Math.max(st, r) * 0.7;   // dry roads reflect less sky
      this.pool.visible = lit > 0.03;
      this.pool.material.opacity = lit * 0.75;
    }

    // Car headlights.
    this.carsT -= dt;
    if (this.carsT <= 0) {
      this.carsT = 0.5;
      const on = this.isNight;
      for (const car of g.cars) if (car.beam) car.beam.visible = on && !car.exploded && !car.parked;
      if (g.driving.car && g.driving.car.beam) g.driving.car.beam.visible = on && !g.driving.car.exploded;
    }
    if (this.spot) {
      const car = g.driving.car;
      if (car && this.isNight && !car.exploded) {
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
        this.spot.position.set(car.x + fx * (car.halfL + 0.2), (car.y || 0) + 0.85, car.z + fz * (car.halfL + 0.2));
        this.spot.target.position.set(car.x + fx * 22, 0, car.z + fz * 22);
        this.spot.intensity = 240;
      } else this.spot.intensity = 0;
    }

    // Rain around the camera.
    this.rain.visible = r > 0.02;
    if (this.rain.visible) {
      this.rain.material.opacity = 0.42 * r;
      const p = this.rainPos, cam = g.camera.position, fall = 26 * dt;
      for (let i = 0; i < this.rainN; i++) {
        const kk = i * 6;
        p[kk + 1] -= fall; p[kk + 4] -= fall; p[kk] -= 0.6 * dt; p[kk + 3] -= 0.6 * dt;
        if (p[kk + 4] < cam.y - 12 || Math.abs(p[kk] - cam.x) > 28 || Math.abs(p[kk + 2] - cam.z) > 28) this.respawnDrop(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    g.audio.rain(r * (g.mode === 'play' || g.mode === 'menu' ? 1 : 0.3));

    // Lightning and thunder in a storm.
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (st > 0.5) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = 7 + Math.random() * 11;
        this.flash = 1;
        setTimeout(() => { this.flash = Math.max(this.flash, 0.6); }, 160);
        setTimeout(() => g.audio.thunder(0.6 + Math.random() * 0.4), 400 + Math.random() * 1400);
      }
    }
    if (this.flood && this.flood.visible && this.floodTex) { this.floodTex.offset.x = this.time * 0.01; this.floodTex.offset.y = this.time * 0.013; }
  }
}
