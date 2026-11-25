// Street life: chai stall, street dancer with a crowd, bus stop, fruit cart, people chatting,
// plus people all over the city (bench sitters, beach groups, market sellers, hotel doormen,
// people at fountains) who appear when you come near. Ravi's old warehouse.
// People run and hide when there is shooting.
import * as THREE from 'three';
import { CharacterRig, randomPersonRig } from './characters.js';
import { part, mergeParts, BOX, vertexColorMaterial, signGeometry } from './mesh.js';
import { FOOT_TOP } from './world.js';
import { makeGun } from './weapons.js';
import { dist, rotateTowards, yawOf, moveTowards, pick, pushOutOfBox } from './util.js';

// A person who stands somewhere (talking, watching, selling), and runs away when scared.
export class AmbientPerson {
  constructor(game, x, z, yaw, opts = {}) {
    this.game = game;
    this.x = x; this.z = z; this.yaw = yaw; this.homeYaw = yaw;
    this.groundY = game.world.groundAt(x, z);
    this.radius = 0.3; this.rLong = 0.3; this.rLat = 0.3;
    this.health = opts.health ?? 40; this.dead = false;
    this.invincible = !!opts.invincible;
    this.rig = opts.rig || randomPersonRig(game.shadows);
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.gesture = opts.gesture || null;
    this.state = opts.flee ? 'flee' : 'idle';
    this.fleeT = opts.flee ? 6 : 0; this.cowerT = 0;
    this.dangerX = opts.fromX ?? x; this.dangerZ = opts.fromZ ?? z;
    this.speed = 0;
    this.rig.setGesture(this.gesture);
  }

  panicFrom(x, z) {
    if (this.dead || this.calm) return;
    this.state = 'flee'; this.fleeT = 5 + Math.random() * 2;
    this.dangerX = x; this.dangerZ = z;
    this.rig.setGesture(null);
  }

  takeDamage(amount, byPlayer, fromX = this.x, fromZ = this.z) {
    if (this.dead || this.invincible) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.rig.die(this.x - fromX, this.z - fromZ);
      if (byPlayer) this.game.dispatch.crime('kill_ped', this.x, this.z);
      this.game.alarm(this.x, this.z, 30);
    } else this.panicFrom(fromX, fromZ);
  }

  update(dt) {
    const g = this.game;
    const camD = dist(this.x, this.z, g.camera.position.x, g.camera.position.z);
    if (this.dead) { this.rig.update(dt, camD); return; }
    let speed = 0, crouch = 0;
    if (this.state === 'flee') {
      const away = yawOf(this.x - this.dangerX, this.z - this.dangerZ) + Math.sin(g.time * 1.3 + this.x) * 0.5;
      this.yaw = rotateTowards(this.yaw, away, 7 * dt);
      speed = 3.9;
      this.fleeT -= dt;
      if (this.fleeT <= 0) { this.state = 'cower'; this.cowerT = 5 + Math.random() * 4; }
    } else if (this.state === 'cower') {
      crouch = 1;
      this.cowerT -= dt;
      if (this.cowerT <= 0) { this.state = 'idle'; this.rig.setGesture(this.gesture); }
    } else if (this.walkTo) {
      // Scripted walk (cutscenes).
      const d = dist(this.x, this.z, this.walkTo.x, this.walkTo.z);
      if (d > 0.4) { this.yaw = rotateTowards(this.yaw, yawOf(this.walkTo.x - this.x, this.walkTo.z - this.z), 6 * dt); speed = 1.4; }
      else this.walkTo = null;
    } else if (this.faceTarget) {
      this.yaw = rotateTowards(this.yaw, yawOf(this.faceTarget.x - this.x, this.faceTarget.z - this.z), 4 * dt);
    }
    this.speed = moveTowards(this.speed, speed, 8 * dt);
    if (this.speed > 0.01) {
      this.x += Math.sin(this.yaw) * this.speed * dt;
      this.z += Math.cos(this.yaw) * this.speed * dt;
      g.world.resolveCircle(this, this.radius);
      for (const c of g.cars) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
      this.groundY = g.world.groundAt(this.x, this.z);
    }
    this.mesh.position.set(this.x, this.groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    this.rig.setMotion(this.speed, crouch);
    this.rig.update(dt, camD);
  }

  remove() {
    this.removed = true;
    this.game.scene.remove(this.mesh);
    const i = this.game.ambient.indexOf(this);
    if (i >= 0) this.game.ambient.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Props: one merged mesh per scene (cheap).
// ---------------------------------------------------------------------------
function addProps(game, parts) {
  const m = new THREE.Mesh(mergeParts(parts), vertexColorMaterial);
  m.castShadow = game.shadows; m.receiveShadow = game.shadows;
  m.matrixAutoUpdate = false;
  game.scene.add(m);
  return m;
}

const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);

export function buildStreetLife(game) {
  const W = game.world, people = [];
  const y = FOOT_TOP;
  const person = (x, z, yaw, opts) => { const p = new AmbientPerson(game, x, z, yaw, opts); people.push(p); return p; };
  const solid = (x0, z0, x1, z1, h) => W.addSolid(x0, z0, x1, z1, h, { nomap: true, nosight: true });
  const sh = game.shadows;

  // ---- Chai stall (west footpath of the start block) ----
  {
    const sx = 7.8, sz = 31, p = [];
    p.push(part(BOX, 0x7a4a2a, sx - 0.4, y + 0.5, sz, 0.7, 1.0, 2.6));         // counter
    p.push(part(BOX, 0x5a3520, sx - 0.4, y + 1.02, sz, 0.8, 0.06, 2.7));       // counter top
    p.push(part(BOX, 0x1f5fb0, sx - 0.2, y + 2.55, sz, 1.9, 0.06, 3.0, 0, 0, 0.18));   // blue tarpaulin roof
    for (const dz of [-1.35, 1.35]) p.push(part(BOX, 0x333333, sx - 0.9, y + 1.25, sz + dz, 0.06, 2.5, 0.06));
    p.push(part(CYL, 0xb8b8b8, sx - 0.3, y + 1.17, sz - 0.6, 0.14, 0.24, 0.14));   // kettle
    p.push(part(CYL, 0x2a2a2a, sx - 0.3, y + 1.08, sz - 0.6, 0.18, 0.06, 0.18));   // stove
    for (let i = 0; i < 5; i++) p.push(part(CYL, 0xe8d9b0, sx - 0.55, y + 1.1, sz + 0.1 + i * 0.16, 0.035, 0.09, 0.035));   // glasses of chai
    p.push(part(BOX, 0x8b5a2b, sx - 1.6, y + 0.22, sz + 1.6, 1.2, 0.44, 0.35));   // bench
    addProps(game, p);
    const signRect = W.atlas.rects.shops[2];   // "RAJU TEA STALL"
    const sign = new THREE.Mesh(signGeometry(sx - 0.62, y + 2.15, sz, 2.4, 0.3, -1, 0, signRect),
      new THREE.MeshStandardMaterial({ map: W.atlas.texture, emissive: 0xffffff, emissiveMap: W.atlas.texture, emissiveIntensity: 0.4 }));
    game.scene.add(sign);
    solid(sx - 0.75, sz - 1.3, sx - 0.05, sz + 1.3, 1.1);
    person(sx + 0.3, sz - 0.3, -Math.PI / 2, { rig: new CharacterRig('m_kurta', { castShadow: sh }), gesture: 'talk' });
    person(sx - 1.3, sz - 0.6, Math.PI / 2, { gesture: 'drink' });
    person(sx - 1.45, sz + 0.5, Math.PI / 2 - 0.3, { gesture: 'talk' });
    person(sx - 1.2, sz + 1.6, Math.PI / 2 + 0.4, { gesture: 'listen' });
  }

  // ---- Street dancer with a crowd (courtyard of the start block, a hidden "galli" party) ----
  {
    const cx = 29.5, cz = 29.5;
    const dancer = person(cx, cz, Math.PI * 0.25, { rig: new CharacterRig('f_purple', { castShadow: sh }), gesture: 'dance' });
    dancer.calm = false;
    const crowd = ['cheer', 'phone', 'cheer', 'talk', 'cheer', 'look'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 1.6 - 0.2;
      const x = cx + Math.sin(a) * 2.6, z = cz + Math.cos(a) * 2.6;
      person(x, z, yawOf(cx - x, cz - z), { gesture: crowd[i] });
    }
    // Speaker box + small mat.
    addProps(game, [part(BOX, 0x151515, cx + 1.4, y + 0.45, cz - 1.4, 0.5, 0.9, 0.45), part(BOX, 0x9c2b2b, cx, y + 0.01, cz, 2.0, 0.02, 2.0)]);
  }

  // ---- Bus stop (south footpath) ----
  {
    const bx = 44, bz = 7.6, p = [];
    p.push(part(BOX, 0xc8c8c8, bx, y + 2.6, bz, 3.6, 0.1, 1.6));                 // roof
    for (const dx of [-1.6, 1.6]) p.push(part(BOX, 0x666b72, bx + dx, y + 1.3, bz + 0.6, 0.08, 2.6, 0.08));
    p.push(part(BOX, 0x8a5a2b, bx, y + 0.45, bz + 0.5, 3.0, 0.08, 0.45));           // bench
    p.push(part(BOX, 0x1f6fb2, bx, y + 2.85, bz - 0.7, 1.2, 0.35, 0.06));           // BUS sign plate
    addProps(game, p);
    person(bx - 1.0, bz - 0.3, Math.PI, { gesture: 'phone' });
    person(bx + 0.2, bz - 0.4, Math.PI - 0.3, { gesture: 'wait' });
    person(bx + 1.2, bz - 0.1, Math.PI + 0.4, { gesture: 'look' });
  }

  // ---- Fruit cart (west footpath) ----
  {
    const fx = 6.9, fz = 50, p = [];
    p.push(part(BOX, 0x6b4a2b, fx, y + 0.8, fz, 1.1, 0.12, 2.0));
    for (const dz of [-0.75, 0.75]) p.push(part(CYL, 0x222222, fx, y + 0.35, fz + dz, 0.35, 0.08, 0.35, 0, 0, Math.PI / 2));
    const fruit = [0xe6a817, 0xc0392b, 0x4f8f2f, 0xf2d024, 0xe67e22];
    for (let i = 0; i < 10; i++) p.push(part(BOX, fruit[i % fruit.length], fx - 0.3 + (i % 2) * 0.55, y + 0.95, fz - 0.8 + Math.floor(i / 2) * 0.4, 0.45, 0.16, 0.34));
    addProps(game, p);
    solid(fx - 0.55, fz - 1.0, fx + 0.55, fz + 1.0, 1.0);
    person(fx + 0.9, fz, -Math.PI / 2, { gesture: 'talk' });
    person(fx - 1.2, fz + 0.4, Math.PI / 2, { gesture: 'listen' });
  }

  // ---- People chatting in pairs on the footpaths ----
  for (const [x, z, a] of [[6.9, 13, 0], [15, 6.9, Math.PI / 2], [6.9, 60, 0], [56, 6.9, Math.PI / 2], [-6.9, 20, 0]]) {
    const dx = Math.sin(a) * 0.55, dz = Math.cos(a) * 0.55;
    person(x - dx, z - dz, a, { gesture: 'talk' });
    person(x + dx, z + dz, a + Math.PI, { gesture: Math.random() < 0.5 ? 'listen' : 'phone' });
  }

  return people;
}

// Ravi's old warehouse in the courtyard of the north-west block: shed + crates for cover.
export const WAREHOUSE = { x: -33, z: 32, door: { x: -38, z: 36.5 } };

export function buildWarehouse(game) {
  const W = game.world, y = FOOT_TOP, p = [];
  const solid = (x0, z0, x1, z1, h) => W.addSolid(x0, z0, x1, z1, h);
  // Rusty shed.
  const x0 = -45, x1 = -31, z0 = 38, z1 = 45.5, h = 5.5;
  p.push(part(BOX, 0x7d6a58, (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0));
  p.push(part(BOX, 0x8a3b2a, (x0 + x1) / 2, y + h + 0.15, (z0 + z1) / 2, x1 - x0 + 0.6, 0.3, z1 - z0 + 0.6));
  p.push(part(BOX, 0x2a2622, -38, y + 1.8, z0 - 0.02, 4, 3.6, 0.05));   // big dark door
  solid(x0, z0, x1, z1, h);
  // Crates and barrels to hide behind.
  const crates = [[-42, 30, 1.6, 1.2], [-40.4, 30.2, 1.2, 1.2], [-28, 34, 2.4, 1.3], [-36, 27, 1.4, 1.1], [-30, 27.5, 1.2, 1.2], [-44, 34.5, 1.2, 2.2]];
  for (const [x, z, s, hh] of crates) {
    p.push(part(BOX, 0x8a6a3a, x, y + hh / 2, z, s, hh, s));
    solid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, hh);
  }
  for (const [x, z] of [[-34, 36], [-33.2, 36.6], [-26, 29]]) {
    p.push(part(CYL, 0x2f5d8a, x, y + 0.5, z, 0.32, 1.0, 0.32));
    W.addCircle(x, z, 0.35);
  }
  const sign = new THREE.Mesh(signGeometry(-38, y + 4.3, z0 - 0.05, 4.6, 0.55, 0, -1, W.atlas.rects.shops[9]),
    new THREE.MeshStandardMaterial({ map: W.atlas.texture, roughness: 0.7 }));
  game.scene.add(sign);
  addProps(game, p);
}

export function spawnRavi(game) {
  const r = new AmbientPerson(game, WAREHOUSE.door.x + 1.5, WAREHOUSE.door.z - 1.2, Math.PI, {
    rig: new CharacterRig('ravi', { castShadow: game.shadows }),
    invincible: true, gesture: 'talk',
  });
  r.calm = true; r.isRavi = true;
  game.ambient.push(r);
  return r;
}

// ---------------------------------------------------------------------------
// People all over the big city. They only exist near the player (cheap on phones):
// bench sitters, beach groups, market sellers, hotel doormen, people at fountains and in parks.
// ---------------------------------------------------------------------------
const GROUP_GESTURES = ['talk', 'listen', 'phone', 'cheer', 'drink', 'look', 'wait'];

export class SpotLife {
  constructor(game, cap) {
    this.game = game; this.cap = cap; this.t = 0;
    const S = game.world.spots, spots = this.spots = [];
    const rnd = Math.random;
    const add = (x, z, yaw, gesture, opts = {}) => spots.push({ x, z, yaw, gesture, ...opts, person: null });
    for (const b of S.benches) if (rnd() < 0.55) add(b.x + Math.sin(b.yaw) * 0.12, b.z + Math.cos(b.yaw) * 0.12, b.yaw, 'sit', { calm: false });
    for (const b of S.beach) {
      const n = 1 + Math.floor(rnd() * 3), cx = b.x - 2.5, cz = b.z - 2;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, x = cx + Math.cos(a) * 0.9, z = cz + Math.sin(a) * 0.9;
        add(x, z, yawOf(cx - x, cz - z), n === 1 ? (rnd() < 0.5 ? 'phone' : 'look') : GROUP_GESTURES[Math.floor(rnd() * GROUP_GESTURES.length)]);
      }
    }
    for (const p of S.plazas) {
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, r = p.r + 0.5 + rnd() * 3, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        add(x, z, rnd() * Math.PI * 2, ['phone', 'talk', 'look', 'wait', 'drink'][i]);
      }
    }
    for (const p of S.parks) {
      for (let i = 0; i < 4; i++) {
        const x = p.x0 + 4 + rnd() * (p.x1 - p.x0 - 8), z = p.z0 + 4 + rnd() * (p.z1 - p.z0 - 8);
        if (Math.abs(x - p.cx) < 6 && Math.abs(z - p.cz) < 6) continue;
        const a = rnd() * Math.PI * 2;
        add(x, z, a, 'talk');
        add(x + Math.sin(a) * 1.1, z + Math.cos(a) * 1.1, a + Math.PI, rnd() < 0.5 ? 'listen' : 'phone');
      }
    }
    for (const m of S.market) {
      add(m.x, m.z + (m.yaw === 0 ? 3.1 : -3.1), m.yaw + Math.PI, rnd() < 0.5 ? 'talk' : 'wait');   // seller behind the stall
      if (rnd() < 0.5) add(m.x, m.z, m.yaw, 'listen');                                               // customer in front
    }
    for (const h of S.hotels) if (rnd() < 0.6) add(h.x + 2, h.z, rnd() * 6, rnd() < 0.5 ? 'wait' : 'phone');
    this.active = 0;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const g = this.game, P = g.player;
    const px = P.x, pz = P.z;
    for (const s of this.spots) {
      if (s.person && s.person.removed) { s.person = null; this.active--; }
      const d = Math.abs(s.x - px) + Math.abs(s.z - pz);
      if (s.person) {
        if (d > 150 && !s.person.dead) { s.person.remove(); s.person = null; this.active--; }
        else if (s.person.dead && d > 120) { s.person.remove(); s.person = null; this.active--; }
      } else if (d < 95 && this.active < this.cap && !(g.dispatch.active && d < 40)) {
        const camD = Math.hypot(s.x - g.camera.position.x, s.z - g.camera.position.z);
        if (camD < 30) continue;   // do not pop in right in front of the camera
        const p = new AmbientPerson(g, s.x, s.z, s.yaw, { gesture: s.gesture });
        if (s.gesture === 'sit') p.rig.setGesture('sit');
        g.ambient.push(p);
        s.person = p; this.active++;
      }
    }
  }

  clear() {
    for (const s of this.spots) if (s.person) { s.person.remove(); s.person = null; }
    this.active = 0;
  }
}

// ---------------------------------------------------------------------------
// Pick-ups: ammo, health, SMG. Glowing, spinning; use the PICK UP button.
// ---------------------------------------------------------------------------
export class Pickups {
  constructor(game) { this.game = game; this.list = []; }

  spawn(type, x, z) {
    const g = new THREE.Group();
    const y = this.game.world.groundAt(x, z);
    let body;
    if (type === 'health') {
      body = new THREE.Mesh(mergeParts([part(BOX, 0xf4f4f4, 0, 0, 0, 0.42, 0.3, 0.3), part(BOX, 0xd62828, 0, 0, 0.16, 0.24, 0.07, 0.02), part(BOX, 0xd62828, 0, 0, 0.16, 0.07, 0.24, 0.02)]), vertexColorMaterial);
    } else if (type === 'ammo') {
      body = new THREE.Mesh(mergeParts([part(BOX, 0x4b5d2a, 0, 0, 0, 0.45, 0.26, 0.3), part(BOX, 0xd9b44a, 0, 0.14, 0, 0.3, 0.03, 0.2)]), vertexColorMaterial);
    } else {
      body = makeGun('smg');
      body.scale.setScalar(2.2);
    }
    body.position.y = 0.55;
    g.add(body);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: type === 'health' ? 0xff5050 : type === 'ammo' ? 0x80ff60 : 0xffc531, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.1;
    g.add(beam);
    g.position.set(x, y, z);
    this.game.scene.add(g);
    this.list.push({ type, x, z, g, body, t: Math.random() * 6 });
  }

  // Nearest pick-up within reach of the player.
  near(px, pz) {
    let best = null, bd = 1.8;
    for (const p of this.list) { const d = dist(p.x, p.z, px, pz); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  take(p) {
    this.game.scene.remove(p.g);
    this.list = this.list.filter((q) => q !== p);
  }

  clear() { for (const p of this.list) this.game.scene.remove(p.g); this.list = []; }

  update(dt) {
    for (const p of this.list) {
      p.t += dt;
      p.body.rotation.y = p.t * 2;
      p.body.position.y = 0.55 + Math.sin(p.t * 3) * 0.08;
    }
  }
}
