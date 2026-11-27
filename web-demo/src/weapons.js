// Guns: models, bullet hits (instant "hitscan" shots), muzzle flash, tracers, sparks, hit puffs.
// Fictional weapons only (no real gun brands).
import * as THREE from 'three';
import { part, mergeParts, BOX } from './mesh.js';

// Two gun slots (like PUBG): slot 1 = MAIN gun (SMG / rifle / shotgun), slot 2 = SIDEARM (pistols).
// spread / bloom are in radians (bloom grows with every shot, then settles), recoil = [up, side] in degrees
// per shot, zoom = field of view while aiming (scope 'iron' / 'dot' red dot / 'scope' 3x telescope).
export const WEAPONS = {
  pistol: { id: 'pistol', name: 'PISTOL', slot: 2, mag: 12, damage: 34, rate: 0.2, spread: 0.008, bloom: 0.006, bloomMax: 0.03, auto: false, reload: 1.3, range: 140, muzzle: 0.16, zoom: 48, scope: 'iron', recoil: [1.5, 0.45], sound: 'pistol' },
  smg: { id: 'smg', name: 'SMG', slot: 1, mag: 30, damage: 20, rate: 0.085, spread: 0.02, bloom: 0.0022, bloomMax: 0.034, auto: true, reload: 1.8, range: 120, muzzle: 0.38, zoom: 44, scope: 'dot', recoil: [0.5, 0.4], sound: 'smg' },
  shotgun: { id: 'shotgun', name: 'SHOTGUN', slot: 1, mag: 6, damage: 24, pellets: 7, rate: 0.75, spread: 0.055, bloom: 0, bloomMax: 0, auto: false, reload: 2.2, range: 40, muzzle: 0.55, zoom: 52, scope: 'iron', recoil: [4.2, 1.0], sound: 'shotgun' },
  rifle: { id: 'rifle', name: 'RIFLE', slot: 1, mag: 25, damage: 46, rate: 0.13, spread: 0.009, bloom: 0.0018, bloomMax: 0.026, auto: true, reload: 2.0, range: 190, muzzle: 0.6, zoom: 24, scope: 'scope', recoil: [0.7, 0.32], sound: 'rifle' },
  gold: { id: 'gold', name: 'GOLDEN PISTOL', slot: 2, mag: 12, damage: 75, rate: 0.2, spread: 0.006, bloom: 0.005, bloomMax: 0.025, auto: false, reload: 1.1, range: 160, muzzle: 0.16, zoom: 46, scope: 'iron', recoil: [1.3, 0.35], sound: 'gold' },
};
export const WEAPON_ORDER = ['pistol', 'gold', 'smg', 'shotgun', 'rifle'];
// Small side-view pictures of the guns for the slot buttons (24 x 12 view box).
export const GUN_ICONS = {
  pistol: 'M3 3h12v2h1v1H9l-1 1v1H6l-1 4H2l1-5H2V4h1z',
  gold: 'M3 3h12v2h1v1H9l-1 1v1H6l-1 4H2l1-5H2V4h1z',
  smg: 'M2 4h3V3h12v1h3v2h-3l-1 1h-2v4h-2V7H9l-1 3H6l1-3H5V6H2z',
  rifle: 'M1 5h4V4h2V3h6v1h8v1h2v1h-2l-1 1h-3v4h-2V7h-2l-1 3H9l1-3H7L5 7H1z',
  shotgun: 'M1 5h5l2-1h14v2H11l-1 1H8l-2 1H1z',
};

const gunGeo = {};
const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.38 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.22 });
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
// A cylinder along Z (barrels, scopes).
const tube = (c, x, y, z, r, len) => part(CYL8, c, x, y, z, r, len, r, Math.PI / 2, 0, 0);

// Gun model: points along +Z, grip at the origin. Built from simple parts (no model files).
export function makeGun(id) {
  if (!gunGeo[id]) {
    const dark = 0x1a1b1e, mid = 0x34363b, metal = 0x55585e, poly = 0x2a2b2e;
    const p = [];
    if (id === 'pistol' || id === 'gold') {
      p.push(part(BOX, mid, 0, 0.047, 0.065, 0.032, 0.036, 0.21));     // slide
      for (let i = 0; i < 5; i++) p.push(part(BOX, dark, 0, 0.048, -0.02 + i * 0.012, 0.034, 0.03, 0.005));   // slide grip lines
      p.push(part(BOX, dark, 0, 0.02, 0.06, 0.03, 0.022, 0.17));        // frame
      p.push(tube(metal, 0, 0.047, 0.175, 0.008, 0.02));                // muzzle
      p.push(part(BOX, poly, 0, -0.035, -0.006, 0.031, 0.105, 0.048, 0.26, 0, 0));   // grip
      p.push(part(BOX, dark, 0, -0.005, 0.045, 0.008, 0.028, 0.05));    // trigger guard
      p.push(part(BOX, dark, 0, 0.068, 0.15, 0.006, 0.01, 0.01));       // front sight
      p.push(part(BOX, dark, 0, 0.068, -0.025, 0.02, 0.01, 0.01));      // rear sight
    } else if (id === 'shotgun') {
      p.push(part(BOX, 0x5a3a22, 0, 0.025, -0.22, 0.045, 0.085, 0.3, -0.08, 0, 0));   // wooden stock
      p.push(part(BOX, dark, 0, 0.05, 0.08, 0.052, 0.075, 0.28));       // receiver
      p.push(tube(metal, 0, 0.075, 0.46, 0.017, 0.56));                 // barrel
      p.push(tube(dark, 0, 0.045, 0.4, 0.014, 0.42));                   // magazine tube
      p.push(part(BOX, 0x5a3a22, 0, 0.04, 0.36, 0.05, 0.045, 0.2));     // pump
      for (let i = 0; i < 4; i++) p.push(part(BOX, 0x3f2918, 0, 0.04, 0.29 + i * 0.045, 0.052, 0.047, 0.012));
      p.push(part(BOX, dark, 0, -0.035, 0.01, 0.032, 0.09, 0.042, 0.3, 0, 0));   // grip
      p.push(part(BOX, metal, 0, 0.098, 0.72, 0.008, 0.012, 0.01));     // bead sight
    } else if (id === 'rifle') {
      p.push(part(BOX, mid, 0, 0.045, 0.1, 0.05, 0.085, 0.36));         // receiver
      p.push(part(BOX, dark, 0, 0.05, 0.38, 0.056, 0.07, 0.26));        // handguard
      for (let i = 0; i < 6; i++) p.push(part(BOX, metal, 0, 0.087, 0.27 + i * 0.04, 0.034, 0.008, 0.02));   // top rail
      p.push(tube(metal, 0, 0.055, 0.62, 0.012, 0.24));                 // barrel
      p.push(tube(dark, 0, 0.055, 0.76, 0.02, 0.06));                   // muzzle brake
      p.push(part(BOX, dark, 0, -0.075, 0.16, 0.034, 0.17, 0.065, 0.3, 0, 0));   // curved magazine
      p.push(part(BOX, poly, 0, 0.035, -0.25, 0.04, 0.1, 0.26));        // stock
      p.push(part(BOX, dark, 0, 0.01, -0.36, 0.044, 0.13, 0.04));       // butt pad
      p.push(part(BOX, poly, 0, -0.03, 0.0, 0.032, 0.095, 0.045, 0.3, 0, 0));    // grip
      p.push(tube(dark, 0, 0.135, 0.12, 0.024, 0.26));                  // 3x scope
      p.push(tube(dark, 0, 0.135, 0.255, 0.03, 0.03));                  // scope front ring
      p.push(part(BOX, dark, 0, 0.105, 0.06, 0.02, 0.04, 0.02)); p.push(part(BOX, dark, 0, 0.105, 0.18, 0.02, 0.04, 0.02));   // mounts
    } else {   // SMG
      p.push(part(BOX, mid, 0, 0.042, 0.1, 0.05, 0.075, 0.32));         // body
      p.push(tube(metal, 0, 0.05, 0.31, 0.012, 0.12));                  // barrel
      p.push(tube(dark, 0, 0.05, 0.38, 0.02, 0.05));                    // suppressor-ish muzzle
      p.push(part(BOX, dark, 0, -0.07, 0.14, 0.03, 0.17, 0.042, 0.08, 0, 0));    // straight magazine
      p.push(part(BOX, poly, 0, -0.03, -0.01, 0.03, 0.09, 0.04, 0.3, 0, 0));     // grip
      p.push(part(BOX, dark, 0, 0.035, -0.17, 0.022, 0.035, 0.2));      // folding stock
      p.push(part(BOX, dark, 0, 0.012, -0.26, 0.03, 0.09, 0.02));       // stock pad
      p.push(part(BOX, dark, 0, 0.095, 0.1, 0.03, 0.035, 0.06));        // red-dot sight
      p.push(part(BOX, 0x1a2b2a, 0, 0.1, 0.13, 0.026, 0.03, 0.004));    // sight glass
    }
    gunGeo[id] = mergeParts(p);
  }
  const m = new THREE.Mesh(gunGeo[id], id === 'gold' ? goldMat : gunMat);
  m.castShadow = false;
  return m;
}

// ---------------------------------------------------------------------------
// Visual effects: tracers, muzzle flashes, sparks and puffs (pooled, cheap).
// ---------------------------------------------------------------------------
function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class ParticlePool {
  constructor(scene, count, size, additive, texture) {
    this.n = count; this.i = 0;
    this.pos = new Float32Array(count * 3).fill(-9999);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.grav = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.mat = new THREE.PointsMaterial({
      size, map: texture, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life, gravity = -9) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.grav[i] = gravity;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any || this.dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.dirty = any;
    }
  }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    const spark = glowTexture('rgba(255,255,230,1)', 'rgba(255,170,60,0.8)');
    const puff = glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)');
    this.sparks = new ParticlePool(scene, 240, 0.12, true, spark);
    this.puffs = new ParticlePool(scene, 200, 0.45, false, puff);
    this.glows = new ParticlePool(scene, 90, 0.38, true, spark);   // nitro flames
    const fireTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,120,30,0.85)');
    this.fire = new ParticlePool(scene, 220, 1.7, true, fireTex);     // fireballs, burning cars
    this.smokeBig = new ParticlePool(scene, 140, 3.2, false, puff);    // explosion smoke
    // Empty brass shells flying out of the gun (tiny bright specks with gravity).
    const brass = glowTexture('rgba(255,236,170,1)', 'rgba(200,150,60,0.9)');
    this.shells = new ParticlePool(scene, 60, 0.07, false, brass);
    // Bullet holes on walls (one draw call for all of them, the oldest is reused).
    const holeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
      gr.addColorStop(0, 'rgba(10,10,10,0.95)'); gr.addColorStop(0.35, 'rgba(25,22,20,0.8)'); gr.addColorStop(0.7, 'rgba(60,55,50,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.holeMax = quality === 'low' ? 40 : 90;
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.holeMax);
    this.holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holes.frustumCulled = false; this.holes.count = 0; this.holeI = 0;
    scene.add(this.holes);
    // Explosion flash ball + ground shock ring (reused).
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.ball.visible = this.ring.visible = false;
    scene.add(this.ball, this.ring);
    this.boomT = 9;

    // Tracers: short bright lines that fade fast.
    this.maxTracers = 24;
    this.tracerPos = new Float32Array(this.maxTracers * 6).fill(-9999);
    this.tracerCol = new Float32Array(this.maxTracers * 6);
    this.tracerLife = new Float32Array(this.maxTracers);
    this.tracerI = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerGeo = tg;
    const lines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    lines.frustumCulled = false;
    scene.add(lines);

    // Muzzle flashes (sprites) + one shared flash light (never added/removed: no shader rebuilds).
    const flashTex = glowTexture('rgba(255,255,220,1)', 'rgba(255,160,40,0.9)');
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false; s.scale.setScalar(0.45);
      scene.add(s);
      this.flashes.push({ s, life: 0 });
    }
    this.flashI = 0;
    if (quality !== 'low') {
      this.light = new THREE.PointLight(0xffb060, 0, 9, 2);
      scene.add(this.light);
      this.lightLife = 0;
    }
  }

  muzzle(pos, size = 1) {
    const f = this.flashes[this.flashI]; this.flashI = (this.flashI + 1) % this.flashes.length;
    f.s.position.copy(pos); f.s.visible = true; f.life = 0.05;
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.scale.setScalar((0.38 + Math.random() * 0.22) * size);
    if (this.light) { this.light.position.copy(pos); this.light.intensity = 6; this.lightLife = 0.05; }
  }

  tracer(from, to, bright = 1) {
    const i = this.tracerI; this.tracerI = (this.tracerI + 1) % this.maxTracers;
    // Start a little in front of the gun, end at the hit.
    const p = this.tracerPos;
    p[i * 6] = from.x; p[i * 6 + 1] = from.y; p[i * 6 + 2] = from.z;
    p[i * 6 + 3] = to.x; p[i * 6 + 4] = to.y; p[i * 6 + 5] = to.z;
    this.tracerLife[i] = 0.07;
    this.tracerBright = bright;
    this.setTracerColor(i, bright);
  }

  setTracerColor(i, k) {
    const c = this.tracerCol;
    c[i * 6] = 1.8 * k; c[i * 6 + 1] = 1.4 * k; c[i * 6 + 2] = 0.6 * k;
    c[i * 6 + 3] = 0.6 * k; c[i * 6 + 4] = 0.45 * k; c[i * 6 + 5] = 0.2 * k;
  }

  // Bullet hits a wall / car: sparks + dust.
  impact(point, normal, metal = false) {
    for (let k = 0; k < (metal ? 9 : 6); k++) {
      this.sparks.emit(point.x, point.y, point.z,
        normal.x * 3 + (Math.random() - 0.5) * 5, normal.y * 3 + Math.random() * 3, normal.z * 3 + (Math.random() - 0.5) * 5,
        2.2, 1.6, 0.8, 0.25 + Math.random() * 0.2);
    }
    for (let k = 0; k < 3; k++) {
      this.puffs.emit(point.x, point.y, point.z, normal.x * 0.8 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, normal.z * 0.8 + (Math.random() - 0.5) * 0.6,
        0.55, 0.52, 0.48, 0.6 + Math.random() * 0.3, 0.3);
    }
  }

  // An empty shell jumps out of the gun to the right (dir = where the gun points).
  shell(x, y, z, dirX, dirZ) {
    const rx = -dirZ, rz = dirX;   // right of the gun
    this.shells.emit(x, y, z, rx * (1.6 + Math.random()) + dirX * 0.3, 1.8 + Math.random(), rz * (1.6 + Math.random()) + dirZ * 0.3, 1.6, 1.25, 0.55, 0.7, -9.8);
  }

  // A bullet hole on a wall: point + the wall's normal.
  hole(point, normal) {
    const i = this.holeI; this.holeI = (this.holeI + 1) % this.holeMax;
    _hm.position.copy(point).addScaledVector(normal, 0.012);
    _hm.lookAt(_hl.copy(_hm.position).add(normal));
    _hm.rotation.z = Math.random() * Math.PI * 2;
    _hm.scale.setScalar(0.7 + Math.random() * 0.6);
    _hm.updateMatrix();
    this.holes.setMatrixAt(i, _hm.matrix);
    this.holes.count = Math.max(this.holes.count, i + 1);
    this.holes.instanceMatrix.needsUpdate = true;
  }
  clearHoles() { this.holes.count = 0; this.holeI = 0; }

  // Bullet hits a person: small red puff (no gore).
  hitPerson(point) {
    for (let k = 0; k < 6; k++) {
      this.puffs.emit(point.x, point.y, point.z, (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5,
        0.55, 0.05, 0.04, 0.35 + Math.random() * 0.2, -4);
    }
  }

  // BOOM: fireball, flash, shock ring, smoke column, sparks.
  explosion(x, y, z, size = 1) {
    for (let k = 0; k < 34 * size; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = 3 + Math.random() * 6;
      this.fire.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp,
        2.2, 1.1 + Math.random() * 0.4, 0.3, 0.5 + Math.random() * 0.5, 3);
    }
    for (let k = 0; k < 18 * size; k++) {
      this.smokeBig.emit(x + (Math.random() - 0.5) * 2, y + Math.random(), z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5, 0.16, 0.15, 0.14, 2.2 + Math.random() * 1.5, 0.4);
    }
    for (let k = 0; k < 30; k++) {
      this.sparks.emit(x, y, z, (Math.random() - 0.5) * 18, Math.random() * 12, (Math.random() - 0.5) * 18, 2.5, 1.6, 0.6, 0.5 + Math.random() * 0.6);
    }
    this.ball.position.set(x, y, z); this.ring.position.set(x, 0.12, z);
    this.ball.visible = this.ring.visible = true; this.boomT = 0; this.boomSize = size;
    if (this.light) { this.light.position.set(x, y + 1, z); this.light.intensity = 500; this.light.distance = 45; this.lightLife = 0.35; }
  }

  // Flames on a burning car.
  carFire(x, y, z) {
    for (let k = 0; k < 2; k++) this.fire.emit(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 1.8, 0.8, 0.25, 0.45 + Math.random() * 0.3, 1);
  }

  // White water behind a speedboat.
  wake(x, y, z) {
    for (let k = 0; k < 3; k++) this.puffs.emit(x + (Math.random() - 0.5) * 1.2, y + 0.1, z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.9, 0.95, 1, 0.6 + Math.random() * 0.3, -6);
  }

  // Car into the sea.
  splash(x, y, z) {
    for (let k = 0; k < 40; k++) this.puffs.emit(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4, 0.85, 0.92, 1, 0.9 + Math.random() * 0.5, -9);
  }

  // Nitro flame out of the exhaust; (dx, dz) = backwards.
  flame(x, y, z, dx, dz) {
    for (let k = 0; k < 2; k++) {
      this.glows.emit(x + (Math.random() - 0.5) * 0.25, y + Math.random() * 0.08, z + (Math.random() - 0.5) * 0.25,
        dx * 5 + (Math.random() - 0.5), 0.2, dz * 5 + (Math.random() - 0.5), 0.5 + Math.random() * 0.6, 1.1, 3.2, 0.1 + Math.random() * 0.08, 0);
    }
  }

  // Sparks from a wheel rim (burst tyres).
  tyreSparks(x, y, z) {
    for (let k = 0; k < 3; k++) {
      this.sparks.emit(x, y, z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 2.4, 1.6, 0.6, 0.18 + Math.random() * 0.15);
    }
  }

  // Engine smoke from a damaged car.
  smoke(x, y, z, dark) {
    const c = dark ? 0.12 : 0.5;
    this.puffs.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, c, c, c, 1.6, 0.6);
  }

  update(dt) {
    this.sparks.update(dt);
    this.puffs.update(dt);
    this.shells.update(dt);
    this.glows.update(dt);
    this.fire.update(dt);
    this.smokeBig.update(dt);
    if (this.boomT < 0.7) {
      this.boomT += dt;
      const k = this.boomT / 0.7, s = this.boomSize;
      this.ball.scale.setScalar((1.5 + k * 5) * s); this.ball.material.opacity = Math.max(0, 1 - k * 1.6);
      this.ring.scale.setScalar((1 + k * 14) * s); this.ring.material.opacity = Math.max(0, 0.9 - k);
      if (this.boomT >= 0.7) this.ball.visible = this.ring.visible = false;
    }
    let tracerChanged = false;
    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      tracerChanged = true;
      if (this.tracerLife[i] <= 0) {
        for (let k = 0; k < 6; k++) this.tracerPos[i * 6 + k] = -9999;
      } else this.setTracerColor(i, this.tracerLife[i] / 0.07);
    }
    if (tracerChanged || this.tracersDirty) {
      this.tracerGeo.attributes.position.needsUpdate = true;
      this.tracerGeo.attributes.color.needsUpdate = true;
      this.tracersDirty = tracerChanged;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.s.visible = false;
    }
    if (this.light && this.lightLife > 0) {
      this.lightLife -= dt;
      if (this.lightLife <= 0) { this.light.intensity = 0; this.light.distance = 9; }
    }
  }
}

// ---------------------------------------------------------------------------
// Shooting: find what a bullet hits first (buildings, people, cars).
// ---------------------------------------------------------------------------
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _hm = new THREE.Object3D(), _hl = new THREE.Vector3();

// Ray against an upright cylinder (a person). Returns distance or -1.
function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, h) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0) continue;
    const y = oy + dy * t;
    if (y >= cy && y <= cy + h) return t;
  }
  return -1;
}

// Ray against a car's rotated box. Returns distance or -1.
function rayCar(ox, oy, oz, dx, dy, dz, car) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
  const lx = ox - car.x, lz = oz - car.z;
  const o1 = lx * rx + lz * rz, o2 = lx * fx + lz * fz;
  const d1 = dx * rx + dz * rz, d2 = dx * fx + dz * fz;
  let tmin = 0, tmax = Infinity;
  const slab = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
    return tmin <= tmax;
  };
  if (!slab(o1, d1, -car.halfW, car.halfW) || !slab(o2, d2, -car.halfL, car.halfL) || !slab(oy, dy, 0.2, 1.75)) return -1;
  return tmin;
}

// What does a shot from (origin, dir) hit? ignore = the shooter.
export function castShot(game, origin, dir, maxDist, ignore, startAt = 0) {
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  let best = { t: game.world.rayCast(ox, oy, oz, dx, dy, dz, maxDist), kind: 'world', target: null };
  const wn = game.world.lastNormal;
  best.normal = wn ? new THREE.Vector3(wn[0], wn[1], wn[2]) : null;
  for (const h of game.humans()) {
    if (h === ignore || h.dead) continue;
    const t = rayCylinder(ox, oy, oz, dx, dy, dz, h.x, h.groundY || 0, h.z, h.radius || 0.32, 1.82);
    if (t > startAt && t < best.t) best = { t, kind: 'human', target: h };
  }
  for (const c of game.cars) {
    if (c === ignore) continue;
    const t = rayCar(ox, oy, oz, dx, dy, dz, c);
    if (t > startAt && t < best.t) best = { t, kind: 'car', target: c };
  }
  // Drones, shooting-gallery boards, gas cylinders...: spheres.
  for (const h of game.cylinders ? [...(game.hittables || []), ...game.cylinders.list] : game.hittables || []) {
    if (h.dead) continue;
    const px = h.x - ox, py = h.y - oy, pz = h.z - oz;
    const tc = px * dx + py * dy + pz * dz;
    if (tc <= startAt) continue;
    const d2 = px * px + py * py + pz * pz - tc * tc, r = h.radius || 0.6;
    if (d2 > r * r) continue;
    const t = tc - Math.sqrt(r * r - d2);
    if (t > startAt && t < best.t) best = { t, kind: 'object', target: h };
  }
  best.point = new THREE.Vector3(ox + dx * best.t, oy + dy * best.t, oz + dz * best.t);
  if (best.kind === 'human') best.head = best.point.y - (best.target.groundY || 0) > 1.52;
  return best;
}

// Does a shot hit the player (cylinder) before anything else?
export function shotHitsPlayer(game, origin, dir, maxDist) {
  const P = game.player;
  const wall = game.world.rayCast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
  const target = P.inCar ? null : P;
  let t = -1;
  if (target) t = rayCylinder(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, P.x, P.y, P.z, 0.36, P.crouching ? 1.25 : 1.8);
  else if (game.driving.car) t = rayCar(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, game.driving.car);
  if (t > 0 && t < wall) return { hit: true, t };
  return { hit: false, t: wall };
}
