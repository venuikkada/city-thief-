// Vikram: movement on foot, health, guns (like PUBG: fists, 2 main guns + a pistol, sights and scopes),
// aiming down the sight, reload, cars, pick-ups.
// Plus the third-person camera (on foot, aiming, and a chase camera behind cars).
//
// Aiming help for touch screens (can be turned off in Settings):
// - the camera slows down and gently follows a police officer under the crosshair,
// - pressing AIM snaps onto the nearest officer close to the crosshair,
// - bullets bend a tiny bit onto an officer you are almost on.
import * as THREE from 'three';
import { clamp, lerp, moveTowards, rotateTowards, yawOf, DEG, pushOutOfBox, angleDiff } from './util.js';
import { CharacterRig, strafeYaw, twistTo } from './characters.js';
import { WEAPONS, WEAPON_ORDER, SIGHTS, SIGHT_ORDER, makeGunRig, setGunSight, castShot } from './weapons.js';
import { placeGun } from './police.js';

const _dir = new THREE.Vector3(), _aim = new THREE.Vector3(), _muz = new THREE.Vector3(), _hp = new THREE.Vector3(), _hd = new THREE.Vector3(), _to = new THREE.Vector3();
const _bp = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();
const _vmOff = new THREE.Vector3(), _tip = new THREE.Vector3(), _qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _qKick = new THREE.Quaternion(), _xAxis = new THREE.Vector3(1, 0, 0);

const TOUGH = 0.65;        // all damage to Vikram x0.65 (v9.3: he lasts longer in a fight)
const PUNCH_DAMAGE = 50;
const GRACE_FLOOR = 12;    // health he keeps against the police in the 2-minute grace

export class Player {
  constructor(game, x, z, yaw) {
    this.game = game;
    this.spawn = { x, z, yaw };
    this.x = x; this.z = z; this.y = game.world.groundAt(x, z); this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.35; this.rLong = 0.35; this.rLat = 0.35;
    this.grounded = true; this.crouching = false; this.sprinting = false; this.aiming = false;
    this.controlsEnabled = true;
    this.inCar = false; this.dead = false;
    this.health = 100; this.armor = 0; this.lastHurt = -99;
    this.punchCd = 0; this.punchT = 0; this.punchAt = null;   // hand fight (FIGHT button)
    this.dive = null; this.rollT = 0; this.rollDir = 1; this.bombs = 3; this.throwT = 0; this.throwCd = 0;   // crazy moves (v9.5)
    this.lastGrounded = 0; this.lastJumpPress = -99;
    // Real-life speeds (m/s), like GTA: walk, jog (full push), sprint (push past the ring / sprint lock / Shift).
    this.walkSpeed = 1.55; this.jogSpeed = 3.4; this.sprintSpeed = 5.9; this.crouchSpeed = 1.3; this.aimSpeed = 1.9; this.hipSpeed = 2.6;
    this.speed = 0;   // forward speed along the way he faces

    this.rig = new CharacterRig('vikram', { castShadow: game.shadows });
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.crouchBlend = 0;

    // Guns like PUBG: slots 1 + 2 = main guns, slot 3 = pistol. He starts with bare FISTS (his pistol in
    // the holster) and runs faster with empty hands; guns are picked up from the ground or from fallen
    // enemies. Tap a slot to take that gun out, tap the gun in your hands to put it away.
    this.slots = { 1: null, 2: null, 3: 'pistol' };
    this._weapon = 'fists'; this.lastGun = 'pistol';
    this.sights = new Set(['iron']);   // red dots / scopes he picked up (any gun they fit can use them)
    this.sightOf = {};                 // the sight on each gun
    this.bloom = 0; this.spreadNow = 0.01; this.scopeHide = false; this.fp = false; this.vmKick = 0;
    this.ammo = {};
    for (const id of [...WEAPON_ORDER, 'fists']) this.ammo[id] = { mag: 0, reserve: 0 };
    this.ammo.pistol = { mag: 12, reserve: 48 };
    this.maxHealth = 100; this.armor = 0;
    this.cooldown = 0; this.reloadT = 0; this.lastShot = -99;
    this.guns = {};
    for (const id of WEAPON_ORDER) { const m = makeGunRig(id); m.visible = false; game.scene.add(m); this.guns[id] = m; }
    this.gunMesh = this.guns.pistol;
    this.sync();
  }

  get weaponDef() { return WEAPONS[this._weapon] || WEAPONS.fists; }
  // The gun in the hands ('fists' = nothing). Setting a gun he does not have yet puts it in a slot first.
  get weapon() { return this._weapon; }
  set weapon(id) {
    if (!WEAPONS[id]) id = 'fists';
    if (id !== 'fists' && !this.slotOf(id)) { const old = this.putInSlot(id); if (old) this.dropGun(old); }
    this._weapon = id;
    if (id !== 'fists') this.lastGun = id;
  }
  get armed() { return this._weapon !== 'fists'; }
  // The guns he carries (slot 1, slot 2, slot 3).
  get owned() { return [this.slots[1], this.slots[2], this.slots[3]].filter(Boolean); }
  slotOf(id) { for (const n of [1, 2, 3]) if (this.slots[n] === id) return n; return 0; }
  // Magazine size (the BIG MAGAZINES upgrade from the shop adds 50%).
  magSize(id = this.weapon) { const r = this.game.rewards; return Math.round(WEAPONS[id].mag * (r && r.has('mags') ? 1.5 : 1)); }

  // A gun goes into a free slot (main guns: 1 or 2, pistols: 3). Both full: it takes the place of the
  // main gun in his hands (or slot 1). Gives back the gun it pushed out (or null).
  putInSlot(id) {
    const w = WEAPONS[id];
    const n = w.kind === 'side' ? 3 : !this.slots[1] ? 1 : !this.slots[2] ? 2 : (this.slotOf(this._weapon) === 2 ? 2 : 1);
    const old = this.slots[n];
    this.slots[n] = id;
    if (w.sight !== 'iron') this.sights.add(w.sight);   // a scoped gun brings its scope
    if (!this.sightOf[id] || !this.sightChoices(id).includes(this.sightOf[id])) this.sightOf[id] = w.sight;
    return old && old !== id ? old : null;
  }

  // Missions and the shop hand over a gun (with bullets). It goes in a slot; it is not drawn.
  giveWeapon(id, ammo) {
    if (!this.slotOf(id)) { const old = this.putInSlot(id); if (old) this.dropGun(old); }
    const a = this.ammo[id];
    a.reserve += ammo;
    // A new gun comes loaded.
    const take = Math.min(this.magSize(id) - a.mag, a.reserve);
    a.mag += take; a.reserve -= take;
  }

  // PICK UP a gun from the ground (like PUBG): into a free slot, or it swaps with the gun in his hands
  // (that one drops where he stands). A gun he already has: he just takes its bullets.
  pickGun(id, ammo) {
    const g = this.game, w = WEAPONS[id], a = this.ammo[id];
    const bullets = ammo ? ammo.mag + ammo.reserve : this.magSize(id) + w.mag * 2;
    if (this.slotOf(id)) { a.reserve += bullets; g.hud.popup(`+${bullets} ${w.name} BULLETS`, 'bonus'); return; }
    const inHand = this._weapon, hadMain = !!(this.slots[1] || this.slots[2]);
    const old = this.putInSlot(id);
    if (old) this.dropGun(old);
    a.mag = ammo ? ammo.mag : this.magSize(id); a.reserve = ammo ? ammo.reserve : w.mag * 2;
    // His first main gun (or the gun that just left his hands) comes straight into his hands.
    if (old === inHand || (w.kind === 'main' && !hadMain && inHand === 'fists')) this.draw(id, true);
    const n = this.slotOf(id), sid = this.sightOf[id];
    g.hud.showBig(w.name, '#ffc531', 1.4);
    g.hud.toast(this._weapon === id ? `${w.name} in your hands${sid !== 'iron' ? ' (' + SIGHTS[sid].name + ')' : ''} - tap its slot to put it away` : `${w.name} is in SLOT ${n} - tap it to use`);
  }

  // The gun leaves his slots and falls on the ground next to him (with its bullets).
  dropGun(id) {
    const g = this.game, a = this.ammo[id], n = this.slotOf(id);
    if (n) this.slots[n] = null;
    const r = this.yaw + 2.3;
    if (g.loot) g.loot.drop(id, this.x + Math.sin(r) * 0.9, this.z + Math.cos(r) * 0.9, { mag: a.mag, reserve: a.reserve });
    this.ammo[id] = { mag: 0, reserve: 0 };
    if (this._weapon === id) this._weapon = 'fists';
  }

  // Take a gun out (or 'fists' = put the gun away). 0.35 s to bring a gun up.
  draw(id, quiet = false) {
    if (id === this._weapon) return;
    this.weapon = id;
    this.reloadT = 0; this.cooldown = id === 'fists' ? 0.1 : 0.35; this.bloom = 0;
    if (id === 'fists') this.aiming = false;
    if (!quiet) this.game.audio.equip();
  }
  holster() {
    if (!this.armed) return;
    this.draw('fists');
    if (!this.game.holsterTipDone) { this.game.holsterTipDone = true; this.game.hud.toast('Gun away - empty hands, he runs faster. FIRE = punch.'); }
  }

  // Tap a slot: take that gun out. Tap the gun already in his hands: put it away (empty hands = faster).
  selectSlot(n) {
    const id = this.slots[n];
    if (!id) { this.game.hud.toast(n === 3 ? 'No pistol - pick one up' : 'Empty slot - pick up a gun (look for the yellow light on the ground)'); return; }
    if (id === this._weapon) { if (!this.inCar) this.holster(); return; }
    this.draw(id);
  }
  // Q / mouse wheel: the next gun (slot 1 -> 2 -> 3 -> empty hands). In a car: guns only.
  switchWeapon() {
    const order = [this.slots[1], this.slots[2], this.slots[3]].filter(Boolean);
    if (!this.inCar) order.push('fists');
    if (!order.length) return;
    const i = order.indexOf(this._weapon);
    this.draw(order[(i + 1) % order.length]);
  }
  // The best gun to grab in a hurry (AIM with empty hands, shooting from a car).
  bestGun(forCar = false) {
    const list = forCar ? [this.slots[3], this.lastGun, this.slots[1], this.slots[2]] : [this.lastGun, this.slots[1], this.slots[2], this.slots[3]];
    return list.find((id) => id && id !== 'fists' && this.slotOf(id)) || null;
  }

  // ---- Sights (iron sight / red dot / 2X / 4X / 8X scope) ----
  get sightId() { return this.armed ? this.sightOf[this._weapon] || WEAPONS[this._weapon].sight : 'iron'; }
  get sight() { return SIGHTS[this.sightId]; }
  // The sights this gun can use now (the ones he has and that fit it).
  sightChoices(id = this._weapon) { return (WEAPONS[id].takes || []).filter((s) => s === 'iron' || this.sights.has(s)); }
  // SIGHT button (PC: V): the next sight that fits the gun in his hands.
  cycleSight() {
    if (!this.armed) return;
    const list = this.sightChoices();
    if (list.length < 2) { this.game.hud.toast('No other sight for this gun - pick up a red dot or a scope'); return; }
    this.sightOf[this._weapon] = list[(list.indexOf(this.sightId) + 1) % list.length];
    this.game.audio.equip();
    this.game.hud.popup(this.sight.name, 'bonus');
  }
  // A red dot / scope picked up: it goes on the gun in his hands if it fits and zooms more (or another gun).
  addSight(sid) {
    this.sights.add(sid);
    const z = (s) => SIGHT_ORDER.indexOf(s || 'iron');
    const better = (id) => id && WEAPONS[id].takes.includes(sid) && z(sid) > z(this.sightOf[id]);
    const on = this.armed && better(this._weapon) ? this._weapon : [this.slots[1], this.slots[2], this.slots[3]].find(better);
    if (on) this.sightOf[on] = sid;
    return on || null;
  }

  reload(instant = false) {
    if (!this.armed) return;
    const a = this.ammo[this.weapon], w = this.weaponDef;
    if (a.mag >= this.magSize() || a.reserve <= 0 || this.reloadT > 0) return;
    if (instant) { this.finishReload(); return; }
    this.reloadT = this.reloadTotal = w.reload * (this.game.rewards && this.game.rewards.rank >= 3 ? 0.75 : 1);
    this.game.audio.reload(this.reloadT, this._weapon);
  }

  finishReload() {
    const a = this.ammo[this.weapon];
    const take = Math.min(this.magSize() - a.mag, a.reserve);
    a.mag += take; a.reserve -= take;
  }

  // Guns tick (cool-down, reload) - also while driving.
  tickGuns(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); } }
  }

  respawn() {
    this.x = this.spawn.x; this.z = this.spawn.z; this.yaw = this.spawn.yaw;
    this.y = this.game.world.groundAt(this.x, this.z);
    this.vx = this.vz = this.vy = 0; this.speed = 0;
    this.crouching = false; this.aiming = false; this.dead = false;
    this.health = this.maxHealth; this.controlsEnabled = true;
    if (this.rig.dead) {   // fresh body after dying
      this.game.scene.remove(this.mesh);
      this.rig.dispose();
      this.rig = new CharacterRig(this.outfit || 'vikram', { castShadow: this.game.shadows });
      this.mesh = this.rig.root;
      this.game.scene.add(this.mesh);
    }
    this.mesh.visible = true;
    this.game.camera3p.snapBehind();
  }

  // Change clothes (disguise missions): another body model, same Vikram. null = his own clothes.
  setOutfit(id) {
    const g = this.game;
    this.outfit = id || null;
    const vis = this.mesh.visible;
    g.scene.remove(this.mesh);
    this.rig.dispose();
    this.rig = new CharacterRig(id || 'vikram', { castShadow: g.shadows });
    this.mesh = this.rig.root;
    this.mesh.visible = vis;
    g.scene.add(this.mesh);
    this.sync();
  }

  takeDamage(amount, fromX, fromZ, src) {
    if (this.dead || this.game.godMode) return;
    amount *= TOUGH;                   // Vikram is tough: he does not go down after a few hits
    if (this.dive && !this.dive.land) amount *= 0.25;   // hard to hit in the middle of a dive
    if (this.inCar) amount *= 0.45;   // the car body protects you a bit
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.7); this.armor -= a; amount -= a; }
    // v9.7: the first 2 minutes of a police chase, police bullets cannot finish him - time to fight back.
    const D = this.game.dispatch;
    if (src === 'police' && D && D.graceLeft > 0 && this.health - amount < GRACE_FLOOR) {
      amount = Math.max(0, this.health - GRACE_FLOOR);
      if (!this.graceTipT || this.game.time - this.graceTipT > 20) { this.graceTipT = this.game.time; this.game.hud.toast(`The police can't finish you for ${Math.ceil(D.graceLeft)}s - fight back, take them all down!`); }
    }
    this.health -= amount;
    this.lastHurt = this.game.time;
    this.game.hud.hurt(fromX, fromZ);
    this.game.audio.hurt();
    if (this.health <= 0) this.die(fromX, fromZ);
  }

  die(fromX = this.x, fromZ = this.z - 1) {
    if (this.dead) return;
    this.health = 0; this.dead = true; this.controlsEnabled = false;
    if (this.inCar) this.game.driving.exit();
    this.rig.die(this.x - fromX, this.z - fromZ);
    this.gunMesh.visible = false;
    this.game.onPlayerDied();
  }

  update(dt, input, camYaw) {
    const g = this.game, t = g.time;
    if (this.inCar) {
      const c = g.driving.car;
      this.x = c.x; this.z = c.z; this.y = c.y || 0; this.yaw = c.yaw;
      this.tickGuns(dt);
      this.spreadNow = this.weaponDef.spread * 1.6 + this.bloom;
      this.bloom = Math.max(0, this.bloom - dt * (0.03 + this.bloom * 4));
      if (this.controlsEnabled && (this.weaponDef.auto ? input.fire : input.firePressed)) this.driveBy();
      if (this.controlsEnabled && input.switchPressed) this.switchWeapon();
      if (this.controlsEnabled && input.slot1Pressed) this.selectSlot(1);
      if (this.controlsEnabled && input.slot2Pressed) this.selectSlot(2);
      if (this.controlsEnabled && input.slot3Pressed) this.selectSlot(3);
      this.regen(dt);
      return;
    }
    if (this.dead) { this.rig.update(dt, 0); return; }
    if (this.punchCd > 0) this.punchCd -= dt;
    if (this.punchT > 0) this.punchT -= dt;
    if (this.throwT > 0) this.throwT -= dt;
    if (this.throwCd > 0) this.throwCd -= dt;

    const on = this.controlsEnabled;
    const move = on ? input.move : { x: 0, y: 0 };
    const strength = Math.min(1, Math.hypot(move.x, move.y));

    // AIM = look down the sight. With empty hands it takes his last gun out first.
    const wantAim = on && input.aimPressed ? !this.aiming : on && input.mouseAimChanged ? input.mouseAim : null;
    if (wantAim !== null) {
      if (wantAim && !this.armed) {
        const id = this.bestGun();
        if (id) this.draw(id); else g.hud.toast('No gun! Pick one up (yellow light on the ground) or take one from a fallen enemy');
      }
      this.aiming = wantAim && this.armed;
      if (this.aiming) g.camera3p.snapToTarget();
      if (this.aiming && !g.diveTipDone && g.mode === 'play') { g.diveTipDone = true; g.hud.toast('TIP: while aiming, press JUMP = slow-motion dive!'); }
    }
    if (on && input.slot1Pressed) this.selectSlot(1);
    if (on && input.slot2Pressed) this.selectSlot(2);
    if (on && input.slot3Pressed) this.selectSlot(3);
    if (on && input.holsterPressed) this.holster();
    if (on && input.sightPressed) this.cycleSight();
    if (on && input.crouchPressed) this.crouching = !this.crouching;
    if (on && input.reloadPressed) this.reload();
    if (on && input.switchPressed) this.switchWeapon();
    if ((this.aiming || input.fire) && g.controls.sprintLock) g.controls.cancelSprintLock();

    const wantSprint = on && input.sprint && strength > 0.5 && !this.aiming && !input.fire;
    if (wantSprint && this.crouching) this.crouching = false;
    this.sprinting = wantSprint;

    // Camera-relative direction. Forward = (sin, cos), right = (-cos, sin).
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let wx = fx * move.y + rx * move.x, wz = fz * move.y + rz * move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) { wx /= wl; wz /= wl; }

    const firingStance = this.aiming || t - this.lastShot < 0.8;
    const strafe = firingStance || input.fire;
    const air = this.grounded ? 1 : 0.3;
    if (this.dive || this.rollT > 0) {
      // In the air (dive) he flies on; on the ground (landing, bail-out roll) he slides to a stop.
      const k = this.dive && !this.dive.land ? 1 - 0.15 * dt : Math.max(0, 1 - 5 * dt);
      this.vx *= k; this.vz *= k; this.speed = Math.hypot(this.vx, this.vz);
    } else if (strafe) {
      // Combat walk: step any way (camera-relative); the chest stays on the crosshair.
      const max = (this.crouching ? this.crouchSpeed : this.aiming ? this.aimSpeed : this.hipSpeed) * Math.min(1.05, this.weaponDef.move || 1);
      const k = Math.min(1, strength * 1.25);
      const tvx = wx * max * k, tvz = wz * max * k;
      const up = tvx * tvx + tvz * tvz > this.vx * this.vx + this.vz * this.vz;
      const rate = (up ? 9 : 12) * air;
      const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
      if (dl <= rate * dt) { this.vx = tvx; this.vz = tvz; }
      else { this.vx += (dvx / dl) * rate * dt; this.vz += (dvz / dl) * rate * dt; }
      this.speed = Math.hypot(this.vx, this.vz);
    } else {
      // GTA-style: he turns towards the stick and moves the way he faces, with weight:
      // he speeds up and slows down over a moment, slows in sharp turns, and skids round for a U-turn.
      let want = 0;
      if (strength > 0.12) {
        // Empty hands = faster (x1.18); a heavy sniper slows him a little (PUBG).
        const mv = this.weaponDef.move || 1;
        want = this.crouching ? this.crouchSpeed : this.sprinting ? this.sprintSpeed * mv
          : strength < 0.62 ? this.walkSpeed * Math.max(0.55, strength / 0.62) * Math.min(mv, 1.1) : this.jogSpeed * mv;
        if (this.carrying) want = Math.min(want, 2.6);   // heavy gold bag
        const diff = angleDiff(this.yaw, yawOf(wx, wz)), ad = Math.abs(diff);
        const turn = (this.speed < 2 ? 520 : this.speed < 4.5 ? 340 : 210) * DEG * dt * air;
        const dyaw = clamp(diff, -turn, turn);
        this.yaw += dyaw;
        this.turnRate = dyaw / Math.max(dt, 1e-4);
        if (ad > 2.2 && this.speed > 2.4) want = Math.min(want, 0.8);
        else want *= 1 - 0.45 * clamp((ad - 0.35) / 2.2, 0, 1);
      }
      const up = want > this.speed;
      const rate = (up ? (this.speed < this.walkSpeed ? 6 : this.speed < this.jogSpeed ? 4.2 : 3.2) : 9) * air;
      this.speed = moveTowards(this.speed, want, rate * dt);
      this.vx = Math.sin(this.yaw) * this.speed; this.vz = Math.cos(this.yaw) * this.speed;
      // Lean into speeding up (sprint start), straighten when slowing.
      this.rig.lean += (clamp((want - this.speed) * 0.05, -0.05, 0.12) - this.rig.lean) * Math.min(1, dt * 6);
    }

    if (this.grounded) this.lastGrounded = t;
    if (on && input.jumpPressed && !this.dive && !(this.rollT > 0)) {
      if (this.aiming && this.grounded && !this.carrying) this.startDive(wx, wz, camYaw, wl > 0.001);
      else this.lastJumpPress = t;
    }
    if (t - this.lastJumpPress <= 0.12 && t - this.lastGrounded <= 0.12) {
      this.lastJumpPress = -99;
      if (this.crouching) this.crouching = false;
      else { this.vy = Math.sqrt(2 * 1.1 * 22); this.lastGrounded = -99; this.grounded = false; }
    }

    const sx = this.x, sz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.vy = Math.max(this.vy - 22 * dt, -40);
    this.y += this.vy * dt;

    g.world.resolveCircle(this, this.radius);
    for (const c of g.cars) if (Math.abs(c.x - this.x) < 4 && Math.abs(c.z - this.z) < 4) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
    for (const o of g.walkers) {
      if (o === this || o.inactive || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) continue;
      const d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 0.0001) { this.x += (dx / d) * (min - d); this.z += (dz / d) * (min - d); }
    }
    const rvx = (this.x - sx) / dt, rvz = (this.z - sz) / dt;
    if (rvx * rvx + rvz * rvz < this.vx * this.vx + this.vz * this.vz) {
      this.vx = rvx; this.vz = rvz;
      if (!strafe) this.speed = Math.min(this.speed, Math.max(0, rvx * Math.sin(this.yaw) + rvz * Math.cos(this.yaw)) + 0.3);   // ran into a wall
    }

    const ground = g.world.groundAt(this.x, this.z);
    if (this.y <= ground && !this.grounded && this.vy < -6 && !this.dive) g.audio.land(Math.min(1, -this.vy / 13));   // feet hit the ground after a jump / fall
    if (this.y <= ground) { this.y = ground; if (this.vy < 0) this.vy = 0; this.grounded = true; }
    else this.grounded = this.y - ground < 0.02 && this.vy <= 0;
    if (this.dive) {
      this.dive.t += dt;
      if (!this.dive.land && this.grounded && this.dive.t > 0.15) { this.dive.land = 0.5; g.camera3p.shake(0.25); g.audio.thump(0.3, 80, 0.15); g.audio.land(1); g.audio.bodyfall(0.6); }
      else if (this.dive.land && (this.dive.land -= dt) <= 0) this.dive = null;
    }
    if (this.rollT > 0 && (this.rollT -= dt) <= 0) { this.rollT = 0; this.bank = 0; }   // two full turns = upright again

    // Aiming / shooting: chest faces the crosshair, legs walk where you move (strafe, walk backwards).
    if (strafe) {
      this.yaw = rotateTowards(this.yaw, strafeYaw(this.rig, camYaw, this.vx, this.vz), 720 * DEG * dt);
      twistTo(this.rig, this.yaw, camYaw);
      this.rig.lean += (0 - this.rig.lean) * Math.min(1, dt * 6);
    } else {
      this.rig.reverse = false;
      this.rig.twist = moveTowards(this.rig.twist, 0, 6 * dt);
    }
    // Lean into turns when running (like a real runner), straight when slow or aiming.
    const wantBank = strafe || strength < 0.12 ? 0 : clamp(-(this.turnRate || 0) * this.speed * 0.028, -0.2, 0.2);
    this.bank = (this.bank || 0) + (wantBank - (this.bank || 0)) * Math.min(1, dt * 7);
    this.turnRate = 0;
    // Crazy moves: lying flat in the air (dive), or rolling over and over on the road (bail out).
    if (this.dive) this.bank = this.dive.roll * (this.dive.land && this.dive.land < 0.2 ? 1.3 * this.dive.land / 0.2 : Math.min(1.3, this.dive.t * 7));
    else if (this.rollT > 0) this.bank = this.rollDir * (1 - this.rollT / 0.9) * Math.PI * 4;
    // Footsteps (sand is softer, the sea splashes).
    if (this.grounded) {
      const sp = Math.hypot(this.vx, this.vz);
      this.stride = sp < 2 ? 0.72 : sp < 4.5 ? 1.05 : 1.45;
      this.stepDist = (this.stepDist || 0) + sp * dt;
      if (this.stepDist > this.stride) {
        this.stepDist -= this.stride;
        const surface = this.z < -238 ? (this.y < -0.5 ? 'water' : 'sand') : 'hard';
        g.audio.footstep(0.18 + sp * 0.05, surface === 'hard' && g.indoors ? 'tile' : surface, sp > 4.5);   // real steps: stone, shop tiles, sand, water; running steps
      }
    }

    // ---- Guns ----
    this.tickGuns(dt);
    const w = this.weaponDef;
    // Accuracy (the crosshair shows it): tight when still / crouched / aiming, wide when running,
    // jumping or spraying (every shot adds "bloom", which settles again when you stop).
    this.bloom = Math.max(0, this.bloom - dt * (0.03 + this.bloom * 4));
    const ads = g.camera3p.aimBlend, sp2 = Math.hypot(this.vx, this.vz);
    // Looking down the sight is far more accurate (a sniper is near perfect, but only when scoped).
    const stance = lerp(1.25, w.adsMul ?? 0.42, ads) * (this.crouching ? 0.72 : 1) * (!this.grounded ? 2.4 : this.sprinting ? 2.0 : sp2 > 1 ? (ads > 0.5 ? 2.2 : 1.45) : 1);
    this.spreadNow = w.spread * stance + this.bloom;
    if (on && (w.auto ? input.fire : input.firePressed)) this.fire();

    this.regen(dt);
    this.sync(dt, this.armed && (firingStance || input.fire));
  }

  // BULLET-TIME DIVE: AIM + JUMP. He throws himself through the air (the way you push, or sideways),
  // time slows right down, and he keeps shooting. Bullets rarely hit him while he flies.
  startDive(wx, wz, camYaw, pushing) {
    const g = this.game;
    let dx = wx, dz = wz;
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);   // the camera's right
    if (!pushing) { const s = Math.random() < 0.5 ? 1 : -1; dx = rx * s; dz = rz * s; }
    const side = dx * rx + dz * rz;
    this.dive = { t: 0, land: 0, roll: side >= 0 ? 1 : -1 };
    this.vx = dx * 7.4; this.vz = dz * 7.4; this.vy = 5.4; this.grounded = false; this.lastGrounded = -99; this.lastJumpPress = -99;
    this.crouching = false;
    g.slowmo(1.25, 0.3);
    if (g.rewards && g.mode === 'play') g.hud.popup('BULLET TIME', 'bonus');
  }

  // Health slowly comes back when you are not hit for a while.
  regen(dt) {
    if (!this.dead && this.health < this.maxHealth && this.game.time - this.lastHurt > 4) this.health = Math.min(this.maxHealth, this.health + 8 * dt);
  }

  // Hand fight: a punch (or a hit with the gun) at a cop or gangster right next to him.
  // Two punches knock out a constable, three a SWAT officer. Each hit knocks him back for a moment.
  punch(o) {
    const g = this.game;
    if (this.punchCd > 0 || this.dead || this.inCar || !o || o.dead) return false;
    this.punchCd = 0.45; this.punchT = 0.24; this.punchAt = o;
    this.yaw = yawOf(o.x - this.x, o.z - this.z);
    this.vx += Math.sin(this.yaw) * 1.6; this.vz += Math.cos(this.yaw) * 1.6;   // a step into the punch
    o.takeDamage(PUNCH_DAMAGE, true, this.x, this.z);
    if (!o.dead && o.stun) o.stun(0.9, this.x, this.z);
    g.audio.punch();
    g.camera3p.kick(0.5);
    g.hud.hitMarker(o.dead, false);
    if (o.dead) { g.slowmo(0.4, 0.4); if (g.rewards) g.rewards.event('KNOCKOUT!', 150, 15); }
    return true;
  }

  // FIRE with empty hands: punch the cop or gangster in front of him (or a punch in the air).
  punchSwing() {
    const g = this.game;
    if (this.punchCd > 0 || this.dead || this.inCar) return;
    const fx = Math.sin(g.camera3p.yaw), fz = Math.cos(g.camera3p.yaw);
    let best = null, bd = 2.3;
    for (const o of g.officers) {
      if (o.dead || o.inactive) continue;
      const dx = o.x - this.x, dz = o.z - this.z, d = Math.hypot(dx, dz);
      if (d < bd && dx * fx + dz * fz > -0.3 * d) { bd = d; best = o; }
    }
    if (best) { this.punch(best); return; }
    this.punchCd = 0.38; this.punchT = 0.22; this.punchAt = null; this.swingDir = { x: fx, z: fz };
    this.yaw = Math.atan2(fx, fz);
    g.audio.swing();   // whoosh
  }

  // Can we shoot now? Uses a bullet (or reloads / clicks when empty).
  useBullet() {
    const g = this.game, w = this.weaponDef, a = this.ammo[this.weapon];
    if (this.cooldown > 0 || this.reloadT > 0) return false;
    if (a.mag <= 0) { if (a.reserve > 0) this.reload(); else g.audio.click(); this.cooldown = 0.3; return false; }
    a.mag--;
    this.cooldown = w.rate;
    this.lastShot = g.time;
    return true;
  }

  // On foot: shoot from the camera through the crosshair (or through the sight when aiming).
  fire() {
    const g = this.game, w = this.weaponDef;
    if (!this.armed) { this.punchSwing(); return; }
    if (!this.useBullet()) return;
    const cam = g.camera;
    cam.getWorldDirection(_aim);
    const spread = this.spreadNow;
    // Bullet magnetism (aim help): almost on an enemy = hit him.
    let target = null;
    if (g.aimAssist) target = g.camera3p.findTarget(cam.position, _aim, this.aiming ? 2.6 : 3.6, w.range);
    // Start the ray just past Vikram so he never shoots himself.
    const startAt = Math.max(0, (this.x - cam.position.x) * _aim.x + (this.y + 1.4 - cam.position.y) * _aim.y + (this.z - cam.position.z) * _aim.z) + 0.6;
    if (this.fp && this.gunMesh.visible) this.gunMesh.localToWorld(_muz.set(0, w.tip[0], w.tip[1] + 0.02));   // the muzzle in front of the eye
    else if (this.fp) _muz.copy(cam.position).addScaledVector(_aim, 0.5).y -= 0.06;
    else { this.rig.handPose(_hp, _hd); _muz.copy(_hp).addScaledVector(_aim, w.muzzle + 0.05); _muz.y += 0.04; }
    this.shoot(cam.position, _aim, spread, target, startAt, _muz, null);
    g.camera3p.recoilKick(w.recoil[0], w.recoil[1]);
    this.vmKick = Math.min(1.4, this.vmKick + (w.bolt ? 1.3 : w.pellets ? 1.1 : 0.55));
    if (w.bolt) setTimeout(() => this.game.audio.bolt && this.game.audio.bolt(), 420);   // work the bolt
    if (w.pellets) setTimeout(() => this.game.audio.pump && this.game.audio.pump(), 380);   // rack the pump
    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloom);
    g.noise(this.x, this.z, 38);
  }

  // From the car window: aim where the camera looks, help onto police / enemies / their cars.
  driveBy() {
    const g = this.game, car = g.driving.car;
    if (!this.armed) {   // empty hands: grab a gun first (pistol first: one hand on the wheel)
      const id = this.bestGun(true);
      if (id) this.draw(id); else if (!g.noGunTip || g.time - g.noGunTip > 4) { g.noGunTip = g.time; g.hud.toast('No gun to shoot with - pick one up first'); }
      return;
    }
    const w = this.weaponDef;
    if (!car || !this.useBullet()) return;
    const cam = g.camera;
    cam.getWorldDirection(_aim);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    // Driver sits on the right (right-hand drive): the window is on the right side.
    _muz.set(car.x - fz * (car.halfW + 0.15) + fx * 0.3, (car.y || 0) + 1.25, car.z + fx * (car.halfW + 0.15) + fz * 0.3);
    const target = g.camera3p.findTarget(_muz, _aim, 16, w.range, true);
    this.shoot(_muz, _aim, this.spreadNow, target, 0.2, _muz, car);
    g.camera3p.recoilKick(w.recoil[0] * 0.5, w.recoil[1] * 0.5);
    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloom);
    g.noise(this.x, this.z, 38);
  }

  // One trigger pull (a shotgun fires several pellets).
  shoot(origin, aimDir, spread, target, startAt, muzzle, ignore) {
    const g = this.game, w = this.weaponDef;
    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      if (target) {
        const ty = target.isCar ? (target.y || 0) + 0.9 : (target.groundY || 0) + 1.25 + (Math.random() - 0.5) * 0.4;
        _dir.set(target.x - origin.x, ty - origin.y, target.z - origin.z).normalize();
        if (pellets > 1) _dir.x += (Math.random() - 0.5) * spread, _dir.y += (Math.random() - 0.5) * spread, _dir.z += (Math.random() - 0.5) * spread;
      } else {
        _dir.copy(aimDir);
        _dir.x += (Math.random() - 0.5) * spread * 2; _dir.y += (Math.random() - 0.5) * spread * 2; _dir.z += (Math.random() - 0.5) * spread * 2;
      }
      _dir.normalize();
      const hit = castShot(g, origin, _dir, w.range, ignore || this, startAt);
      if (p < 3) g.fx.tracer(muzzle, hit.point, pellets > 1 ? 0.6 : 1);
      if (hit.kind === 'human') {
        const dmg = w.damage * (hit.head ? 2.5 : 1);
        const wasAlive = !hit.target.dead;
        hit.target.takeDamage(dmg, true, this.x, this.z);
        g.fx.hitPerson(hit.point);
        const killed = wasAlive && hit.target.dead;
        g.hud.hitMarker(hit.target.dead, hit.head);
        g.hud.damageNumber(hit.point, Math.round(dmg), hit.head, killed);
        g.audio.hit(hit.head, killed);
        if (killed) g.hud.killFeed(hit.target, w.name, hit.head);
        if (wasAlive && hit.target.dead && g.rewards) g.rewards.kill(hit.target, hit.head);
      } else if (hit.kind === 'car') {
        hit.target.takeDamage(w.damage * 0.35, true);
        g.fx.impact(hit.point, _dir.clone().negate(), true);
        if (p === 0) g.audio.ping();
      } else if (hit.kind === 'object') {
        hit.target.takeDamage(w.damage, true);
        g.fx.impact(hit.point, _dir.clone().negate(), true);
        g.hud.hitMarker(hit.target.dead);
      } else if (hit.t < w.range) {
        g.fx.impact(hit.point, hit.normal || _dir.clone().negate(), false);
        if (hit.normal && p < 2) g.fx.hole(hit.point, hit.normal);
        if (p === 0) g.audio.impact(Math.max(0, 1 - hit.t / 60));
      }
    }
    g.fx.muzzle(muzzle, w.sound === 'shotgun' ? 1.6 : w.sound === 'sniper' ? 1.7 : w.sound === 'rifle' || w.sound === 'dmr' ? 1.3 : w.sound === 'smg' ? 1.05 : 0.85);
    if (!ignore || ignore === this) g.fx.shell(muzzle.x - aimDir.x * (w.muzzle * 0.8), muzzle.y, muzzle.z - aimDir.z * (w.muzzle * 0.8), aimDir.x, aimDir.z);
    g.audio.gunshot(w.sound, 1);
    if (!this.inCar && (!w.auto || Math.random() < 0.45)) g.audio.casings(w.pellets ? 1 : Math.random() < 0.3 ? 2 : 1);   // shells on the ground
    g.dispatch.crime('gunfire', this.x, this.z);
    g.alarm(this.x, this.z, 35);
    g.stats.shots++;
  }

  sync(dt = 0, holdingGun = false) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.z = this.bank || 0;
    if (!this.inCar && (this.dive || this.rollT > 0)) {
      // Turn around the hips, not the feet (lying flat in the air / rolling on the road).
      // (bail out: two cartwheels; dive landing: down flat on the ground)
      const a = this.bank || 0, h = 0.9, sx = h * Math.sin(a), flat = this.dive && this.dive.land ? 0.7 * Math.abs(Math.sin(a)) : 0;
      this.mesh.position.x += sx * Math.cos(this.yaw); this.mesh.position.z -= sx * Math.sin(this.yaw);
      this.mesh.position.y += h * (1 - Math.cos(a)) - flat;
    }
    // Guns: the one in his hands, the others on his back (main guns) and at his hip (pistol).
    // Looking down the sight (first person): no body - only the gun in front of the eye (placeViewmodel).
    const show = !this.inCar && !this.dead && !this.fp;
    for (const [id, m] of Object.entries(this.guns)) { m.visible = show && !!this.slotOf(id); setGunSight(m, id, this.sightOf[id] || WEAPONS[id].sight); }
    if (!this.inCar) this.mesh.visible = !this.fp;
    this.gunMesh = this.guns[this.armed ? this._weapon : this.guns[this.lastGun] ? this.lastGun : 'pistol'];
    if (dt > 0) {
      this.crouchBlend = moveTowards(this.crouchBlend, this.crouching ? 1 : 0, 5 * dt);
      this.rig.setMotion(Math.hypot(this.vx, this.vz), this.crouchBlend);
      // Arms point where the camera aims while aiming/shooting.
      const cam = this.game.camera;
      cam.getWorldDirection(_dir);
      // Punching: the arms shoot out at the man in front (fast), then come back. Throwing a bomb: the same, forwards.
      const o = this.punchT > 0 ? this.punchAt || this.swingDir : null;
      if (o && this.punchAt) _dir.set(o.x - this.x, 0.1, o.z - this.z).normalize();
      else if (o) _dir.set(o.x, 0.1, o.z).normalize();   // a punch in the air
      else if (this.throwT > 0 && this.throwDir) _dir.set(this.throwDir.x, 0.5, this.throwDir.z).normalize();
      const swing = !!o || this.throwT > 0;
      this.aimW = swing ? moveTowards(this.aimW || 0, 1, 30 * dt) : moveTowards(this.aimW || 0, holdingGun && this.reloadT <= 0 ? 1 : 0, 8 * dt);
      this.rig.setAim(this.aimW, _dir);
      this.rig.update(dt, 0);
      // rig.update() turns the body back on, so hide it again while looking down the sight.
      if (!this.inCar) this.mesh.visible = !this.fp;
      if (show) for (const n of [1, 2, 3]) {
        const id = this.slots[n];
        if (!id) continue;
        if (id === this._weapon) placeGun(this.rig, this.guns[id], this.aimW > 0.5 ? _dir : null);
        else this.placeHolster(this.guns[id], n);
      }
    }
  }

  // Guns he is not holding ride along: slot 1 across the back (barrel over the right shoulder),
  // slot 2 crossed the other way, the pistol (slot 3) in the hip holster.
  placeHolster(gun, n) {
    const b = this.rig.bones, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    if (n !== 3) {
      const s = n === 1 ? 1 : -1, back = n === 1 ? 0.2 : 0.25;
      if (b.Spine2) b.Spine2.getWorldPosition(_bp); else _bp.set(this.x, this.y + 1.35, this.z);
      _bp.x -= fx * back; _bp.z -= fz * back; _bp.y -= 0.05;
      _bz.set(rx * 0.62 * s, 0.78, rz * 0.62 * s).normalize();    // barrel: up over a shoulder
      _by.set(-fx, 0, -fz);                                         // sights point away from the back
    } else {
      if (b.Pelvis) b.Pelvis.getWorldPosition(_bp); else _bp.set(this.x, this.y + 0.95, this.z);
      _bp.x += rx * 0.2 + fx * 0.03; _bp.z += rz * 0.2 + fz * 0.03; _bp.y -= 0.12;
      _bz.set(fx * 0.25, -1, fz * 0.25).normalize();                // barrel down
      _by.set(rx, 0, rz);
    }
    _by.addScaledVector(_bz, -_by.dot(_bz)).normalize();
    _bx.crossVectors(_by, _bz);
    _bm.makeBasis(_bx, _by, _bz);
    gun.position.copy(_bp); gun.quaternion.setFromRotationMatrix(_bm);
  }
}

// Placed by the camera (after it moved) - see placeViewmodel below.
Player.prototype.placeViewmodel = function placeViewmodel(dt) {
  // Looking down the sight: the gun sits in front of the eye with its sights on the middle of the
  // screen (iron sights: the notch/ring and the post line up; red dot: the frame around the dot).
  // A 2X/4X/8X scope fills the screen instead (the HUD draws the lens).
  const g = this.game, cam = g.camera, id = this._weapon, w = WEAPONS[id], m = this.guns[id];
  this.vmKick = Math.max(0, this.vmKick - dt * 8);
  if (!m || !this.fp) return;
  const sid = this.sightId, S = SIGHTS[sid], ab = g.camera3p.aimBlend;
  m.visible = sid === 'iron' || sid === 'dot' || ab < 0.85;
  if (!m.visible) return;
  let ey, ez;   // where the eye is, in the gun's own numbers
  if (sid === 'iron') { ey = w.sightY; ez = w.rearZ - w.eye; } else { ey = w.rail[0] + S.up; ez = w.rail[1] - (S.back || 0.17); }
  const k = clamp((ab - 0.55) / 0.4, 0, 1), e = 1 - (1 - k) * (1 - k);   // slides up into place
  const t = g.time, mv = Math.min(1, Math.hypot(this.vx, this.vz) / 2);
  const bob = Math.sin(((this.stepDist || 0) / (this.stride || 1)) * Math.PI * 2) * 0.0025 * mv;
  // Camera space: x right, y up, -z forward. The gun is turned round so it points forward.
  _vmOff.set(Math.sin(t * 1.1) * 0.0008 + (1 - e) * 0.045, -ey - (1 - e) * 0.08 + Math.sin(t * 1.7) * 0.0005 + bob, ez + this.vmKick * 0.03);
  m.position.copy(_vmOff).applyQuaternion(cam.quaternion).add(cam.position);
  _qKick.setFromAxisAngle(_xAxis, -this.vmKick * 0.045);   // the muzzle jumps up with each shot
  m.quaternion.copy(cam.quaternion).multiply(_qFlip).multiply(_qKick);
};

// Over-the-shoulder camera, aim zoom, recoil kick, crash shake, aim help, and a chase camera for cars.
export class ThirdPersonCamera {
  constructor(game, camera) {
    this.game = game; this.cam = camera;
    this.yaw = 0; this.pitch = 10 * DEG;
    this.dist = 3.4; this.aimBlend = 0; this.pivotH = 1.55;
    this.sensitivity = 1; this.aimSensitivity = 0.6; this.invert = false;
    this.recoil = 0; this.shakeT = 0; this.carLookT = 0; this.snapT = 0; this.fovKick = 0;
    this.pivot = null; this.lookIdle = 0;
  }

  snapBehind() { this.yaw = this.game.player.yaw; this.pitch = 10 * DEG; this.pivot = null; }
  kick(k) { this.recoil = Math.min(3, this.recoil + k); this.pitch -= 0.9 * DEG * k; this.yaw += (Math.random() - 0.5) * 0.5 * DEG * k; }
  // Gun recoil (degrees): the view climbs with every shot and a bit to the side; when you stop
  // firing it comes most of the way back down. Aiming and crouching tame it.
  recoilKick(up, side) {
    const P = this.game.player, k = (P.aiming ? 0.72 : 1) * (P.crouching ? 0.8 : 1);
    const u = up * DEG * k;
    this.pitch -= u; this.recoilAcc = (this.recoilAcc || 0) + u;
    this.yaw += (Math.random() - 0.45) * 2 * side * DEG * k;
    this.recoil = Math.min(3, this.recoil + up * 0.35);
    this.fovKick = Math.min(4, this.fovKick + up * 0.35);
  }
  shake(k) { this.shakeT = Math.max(this.shakeT, 0.35 * k); }
  snapToTarget() { if (this.game.aimAssist) this.snapT = 0.2; }

  // Closest enemy (police / gang) within maxDeg of the ray from "from" along "dir", in clear view.
  // withCars: also police cars and enemy mission cars (shooting from a car).
  findTarget(from, dir, maxDeg, range = 80, withCars = false) {
    const g = this.game, P = g.player;
    let best = null, bestCos = Math.cos(maxDeg * DEG);
    const test = (o, y) => {
      _to.set(o.x - from.x, y - from.y, o.z - from.z);
      const d = _to.length();
      if (d > range || d < 1) return;
      const c = _to.dot(dir) / d;
      if (c > bestCos && !g.world.segmentBlocked(P.x, P.z, o.x, o.z)) { bestCos = c; best = o; }
    };
    for (const o of g.officers) if (!o.dead && !o.inactive) test(o, (o.groundY || 0) + 1.25);
    if (withCars) for (const c of g.cars) if ((c.isPolice || c.hostile) && !c.exploded && !c.playerControlled) test(c, (c.y || 0) + 0.9);
    return best;
  }

  update(dt, look) {
    const g = this.game, P = g.player, W = g.world;
    const firing = g.time - P.lastShot < 0.8;
    this.aimBlend = moveTowards(this.aimBlend, P.aiming && !P.inCar ? 1 : 0, 6 * dt);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    // Recoil recovery: after 0.12 s without a shot, 70% of the climb comes back.
    if ((this.recoilAcc || 0) > 0 && g.time - P.lastShot > 0.12) {
      const r = Math.min(this.recoilAcc, this.recoilAcc * dt * 7 + dt * 0.002);
      this.pitch += r * 0.7; this.recoilAcc -= r;
    }
    const S0 = P.sight, zf = lerp(1, S0.fov / 46, this.aimBlend);   // zf: smaller with a bigger zoom
    // Looking down the sight (first person, like PUBG) - not in the middle of a dive or a roll.
    P.fp = this.aimBlend > 0.55 && !P.inCar && P.armed && !P.dive && !(P.rollT > 0);
    P.scopeHide = P.fp;

    // Aim help: slow the camera over a target and follow it a little.
    let slow = 1;
    if (g.aimAssist && !P.inCar && !P.dead && (P.aiming || firing || this.snapT > 0)) {
      this.cam.getWorldDirection(_dir);
      const t = this.findTarget(this.cam.position, _dir, (this.snapT > 0 ? 12 : P.aiming ? 7 : 4.5) * zf);
      if (t) {
        slow = 0.55;
        _to.set(t.x - this.cam.position.x, (t.groundY || 0) + 1.25 - this.cam.position.y, t.z - this.cam.position.z);
        const wantYaw = Math.atan2(_to.x, _to.z), wantPitch = -Math.atan2(_to.y, Math.hypot(_to.x, _to.z));
        const rate = (this.snapT > 0 ? 70 : P.aiming ? 9 : 6) * DEG * dt * zf;
        this.yaw += clamp(angleDiff(this.yaw, wantYaw), -rate, rate);
        this.pitch += clamp(wantPitch - this.pitch, -rate, rate);
      }
    }
    if (this.snapT > 0) this.snapT -= dt;

    const k = 0.12 * DEG * this.sensitivity * lerp(1, this.aimSensitivity * Math.min(1, S0.fov / 44), this.aimBlend) * slow;
    this.yaw -= look.x * k;
    this.pitch += (this.invert ? -look.y : look.y) * k;
    this.lookIdle = Math.abs(look.x) + Math.abs(look.y) > 0.5 ? 0 : this.lookIdle + dt;
    // On foot, running with no camera input: the camera slowly swings in behind him (GTA style).
    if (!P.inCar && !P.aiming && !firing && this.lookIdle > 1.1 && P.speed > 2.2) {
      const d = angleDiff(this.yaw, P.yaw);
      if (Math.abs(d) < 2.0) this.yaw += d * Math.min(1, dt * 1.1);
    }

    let px, py, pz, wantDist, wantShoulder, fovBase;
    if (P.inCar && g.driving.car) {
      // Chase camera: swings behind the car (looking a little into the slide/turn) unless you look around.
      const car = g.driving.car, D = g.driving, sp = D.speed;
      if (Math.abs(look.x) + Math.abs(look.y) > 0.5) this.carLookT = 1.6;
      this.carLookT -= dt;
      if (this.carLookT <= 0 && sp > 1) {
        const back = D.vx * Math.sin(car.yaw) + D.vz * Math.cos(car.yaw) < -0.5;
        let behind = back ? car.yaw + Math.PI : car.yaw;
        if (!back && sp > 4) behind += angleDiff(car.yaw, Math.atan2(D.vx, D.vz)) * 0.6 - D.steer * 0.35;   // look into the turn
        this.yaw += angleDiff(this.yaw, behind) * Math.min(1, dt * 3.2);
        this.pitch = lerp(this.pitch, 11 * DEG, dt * 2);
      }
      // Big vehicles (bus, truck) get the camera further back and higher.
      const big = Math.max(0, car.halfL - 2.3);
      px = car.x; py = 1.7 + big * 0.45; pz = car.z;
      wantDist = (g.carCamFar ? 9.5 : 6.4) + big * 1.6 + Math.min(3, sp * 0.08);
      wantShoulder = 0;
      this.fovKick = moveTowards(this.fovKick, D.boosting ? 12 : 0, 30 * dt);
      fovBase = 62 + Math.min(14, sp * 0.45) + this.fovKick;
    } else {
      const wantH = P.crouching ? 1.05 : 1.55;
      this.pivotH = lerp(this.pivotH, wantH, 1 - Math.exp(-10 * dt));
      // The camera follows a point that trails him a little: smooth, with a feeling of weight.
      if (!this.pivot || Math.hypot(this.pivot.x - P.x, this.pivot.z - P.z) > 4) this.pivot = { x: P.x, y: P.y, z: P.z };
      const f = 1 - Math.exp(-13 * dt);
      this.pivot.x += (P.x - this.pivot.x) * f; this.pivot.z += (P.z - this.pivot.z) * f;
      this.pivot.y += (P.y - this.pivot.y) * (1 - Math.exp(-9 * dt));
      px = this.pivot.x; py = this.pivot.y + this.pivotH; pz = this.pivot.z;
      // A small bob of the camera with each running step.
      if (P.grounded && P.speed > 3) py += Math.sin(((P.stepDist || 0) / (P.stride || 1)) * Math.PI * 2) * 0.022 * Math.min(1, P.speed / 5.9);
      const ab = Math.min(1, this.aimBlend * 1.8);   // aiming: the camera gets to his eye early
      wantDist = lerp(firing ? 2.6 : 3.4, 0.1, ab);
      wantShoulder = lerp(firing ? 0.6 : 0.5, 0.06, ab);
      fovBase = lerp(P.sprinting && P.speed > 4.5 ? (P.armed ? 65 : 68) : 60, S0.fov, this.aimBlend) + this.fovKick * 0.5 * zf;
      this.fovKick = Math.max(0, this.fovKick - dt * 14);
    }
    this.pitch = clamp(this.pitch, -40 * DEG, 65 * DEG);

    // A scope sways a little with his breathing (much less when crouching).
    let swY = 0, swP = 0;
    if (P.fp && S0.fov < 20) { const a = (P.crouching ? 0.35 : 1) * (S0.fov < 10 ? 0.4 : 0.22) * DEG; swY = Math.sin(g.time * 0.8) * a; swP = Math.sin(g.time * 1.27 + 1) * a * 0.7; }
    const cp = Math.cos(this.pitch + swP), spch = Math.sin(this.pitch + swP);
    const fx = Math.sin(this.yaw + swY), fz = Math.cos(this.yaw + swY);
    const dx = fx * cp, dy = -spch, dz = fz * cp;
    const rx = -fz, rz = fx;

    const side = Math.max(0, W.rayCast(px, py, pz, rx, 0, rz, wantShoulder + 0.22) - 0.22);
    const shoulder = Math.min(wantShoulder, side);
    const sx = px + rx * shoulder, sz = pz + rz * shoulder;
    const hit = W.rayCast(sx, py, sz, -dx, -dy, -dz, wantDist + 0.22);
    const allowed = Math.max(0.4, Math.min(wantDist, hit - 0.22));
    this.dist = allowed < this.dist ? allowed : lerp(this.dist, allowed, 1 - Math.exp(-6 * dt));

    let shx = 0, shy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; shx = (Math.random() - 0.5) * this.shakeT * 0.6; shy = (Math.random() - 0.5) * this.shakeT * 0.6; }
    this.cam.position.set(sx - dx * this.dist + shx, py - dy * this.dist + shy, sz - dz * this.dist);
    this.cam.lookAt(this.cam.position.x + dx, this.cam.position.y + dy, this.cam.position.z + dz);

    if (Math.abs(this.cam.fov - fovBase) > 0.02) {
      this.cam.fov = lerp(this.cam.fov, fovBase, 1 - Math.exp(-(P.fp ? 16 : 8) * dt));
      this.cam.updateProjectionMatrix();
    }
    P.placeViewmodel(dt);
  }
}
