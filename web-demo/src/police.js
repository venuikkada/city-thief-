// Navapur Metro Police (fictional): wanted stars, the search area, patrol cars, SWAT,
// roadblocks, spike strips and a police helicopter.
//
// WANTED STARS
//   1 star : cops chase you and try to ARREST you. When one grabs you, you get ONE MINUTE to fight
//            back (punch with FIGHT or shoot): beat the cops around you or get away, else BUSTED.
//   2 stars: cops SHOOT. 3 stars: SWAT team, more cars, ROADBLOCKS ahead of you.
//   4-5 stars: a HELICOPTER with a searchlight, and SPIKE STRIPS in front of roadblocks.
// BREATHER (v9.4)
//   Beat the cops who came for him (kill one, none left near him) and the police regroup: no new units
//   for 2-3 minutes (BACKUP IN m:ss on screen), then a bigger BACKUP comes (+1 star). In a story mission
//   the stars stay meanwhile (unless the job is to lose the police): finish the job before the backup.
// ESCAPING
//   The red circle on the map is where the police are searching (it follows you while they see you).
//   Get OUT of the circle while nobody sees you -> the stars go in a few seconds.
//   Staying hidden inside it also works, but takes much longer.
//   Switching to a car they did not see you take also helps.
// POLICE RAIDS
//   Hiding in a courtyard, an alley or a yard behind the buildings does not save you: a police van
//   parks at the block and officers walk in through the gaps to search every corner. If one of them
//   gets hold of you while you walk (not run) - BUSTED. Run out unseen, or fight your way out.
import * as THREE from 'three';
import { Car } from './traffic.js';
import { CharacterRig, strafeYaw, twistTo } from './characters.js';
import { makeGun, shotHitsPlayer } from './weapons.js';
import { part, mergeParts, BOX, vertexColorMaterial } from './mesh.js';
import { LINES, HALF_ROAD } from './world.js';
import { dist, rotateTowards, yawOf, pushOutOfBox, moveTowards, clamp, pick } from './util.js';

const UNITS_FOR_STARS = [2, 2, 3, 4, 5, 6];
export const ARREST_TIME = 60;    // seconds to fight your way out when a cop grabs you
export const GRACE_TIME = 120;    // v9.7: the first 2 minutes of a chase the police cannot kill or arrest him
const HEAL_PER_COP = 20;          // health back for every cop Vikram takes down (gangsters: half)

// Can a police unit at (ex, ez) facing (fx, fz) see the player?
export function canSee(world, ex, ez, fx, fz, target, range, fovDeg, closeRange = 8) {
  if (world.colorBlock && world.colorBlock(ex, ez, target.x, target.z)) return false;   // Holi colour cloud in the way
  const dx = target.x - ex, dz = target.z - ez;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d > closeRange) {
    const cos = (dx * fx + dz * fz) / (d || 1);
    if (cos < Math.cos((fovDeg / 2) * Math.PI / 180)) return false;
  }
  return !world.segmentBlocked(ex, ez, target.x, target.z);
}

export class Dispatch {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.lastX = 0; this.lastZ = 0;
    this.sinceSeen = 0;
    this.circle = { x: 0, z: 0, r: 0 };
    this.outsideT = 0;
    this.busting = false;
    this.arrestT = 0; this.freeT = 0;   // the one-minute fight when a cop grabs him
    this.lullOn = false; this.lullT = 0; this.lastCopKill = -999; this.lullEnd = -999;   // the breather after he beats them
    this.chaseStart = -999;   // when this chase began (the 2-minute grace)
    this.reportTimer = -1;
    this.reinforceT = 0;
    this.roadblocks = []; this.roadblockT = 4;
    this.heli = null;
    this.raid = null; this.raidT = 0; this.raidAt = 0; this.raidsOn = true;
    this.onStars = () => {}; this.onEscaped = () => {}; this.onBusted = () => {}; this.onMessage = () => {}; this.onArrest = () => {}; this.onLull = () => {};
  }
  // Story missions bring extra police (more cars, more officers out of each car).
  get extra() { const m = this.game.mission; return m && !m.done ? 1 : 0; }

  get active() { return this.stars > 0; }
  // Seconds of the grace left: the police can hurt him but not kill or arrest him (0 = over).
  get graceLeft() { return this.stars > 0 ? Math.max(0, GRACE_TIME - (this.game.time - this.chaseStart)) : 0; }
  get radius() { return 45 + this.stars * 20; }          // search circle size
  get escapeTime() { return 2 + this.stars * 0.6; }      // unseen + outside the circle
  get loseTime() { return 14 + this.stars * 4; }         // unseen anywhere (hiding)
  get target() { const g = this.game; return g.player.inCar && g.driving.car ? g.driving.car : g.player; }

  // Raise (never lower) the wanted level.
  setStars(n, x, z) {
    n = Math.max(0, Math.min(5, n));
    const P = this.game.player;
    if (n <= this.stars) return;
    const was = this.stars;
    this.stars = n;
    this.lastX = x ?? P.x; this.lastZ = z ?? P.z;
    this.circle.x = this.lastX; this.circle.z = this.lastZ; this.circle.r = this.radius;
    this.sinceSeen = 0; this.outsideT = 0;
    if (was === 0) { this.chaseStart = this.game.time; for (const c of this.game.policeCars) c.beginPursuit(); }
    if (n >= 3 && was < 3) this.onMessage('SWAT TEAM ON THE WAY');
    if (n >= 4 && was < 4) this.onMessage('POLICE HELICOPTER!');
    this.onStars(n, was);
    this.game.emit('stars', n);
  }

  clear(escaped) {
    if (!this.stars) return;
    this.stars = 0;
    if (this.arrestT > 0) { this.arrestT = 0; this.onArrest(false, true); }
    if (this.lullOn) { this.lullOn = false; this.lullT = 0; this.onLull(false, true); }
    for (const c of this.game.policeCars) c.endPursuit();
    for (const o of this.game.officers) if (!o.dead) o.standDown();
    if (this.raid) { this.raid.end(); this.raid = null; }
    if (this.heli) this.heli.leave();
    this.onStars(0, 1);
    if (escaped) this.onEscaped();
  }

  // Is any police unit looking at the player right now?
  witnessed() {
    const g = this.game, T = this.target;
    for (const c of g.policeCars) if (!c.wrecked && canSee(g.world, c.x, c.z, Math.sin(c.yaw), Math.cos(c.yaw), T, 55, 200)) return true;
    for (const o of g.officers) if (!o.dead && !o.gang && canSee(g.world, o.x, o.z, Math.sin(o.yaw), Math.cos(o.yaw), T, 45, 220)) return true;
    if (this.heli && this.heli.sees()) return true;
    return false;
  }

  // A crime happened at (x, z).
  crime(kind, x, z) {
    const seen = this.witnessed();
    switch (kind) {
      case 'gunfire':
        if (seen) this.setStars(Math.max(this.stars, 2), x, z);
        else if (!this.stars && this.reportTimer < 0) { this.reportTimer = 5; this.reportX = x; this.reportZ = z; }   // people call the police
        break;
      case 'kill_ped': this.setStars(seen ? Math.min(5, Math.max(1, this.stars + 1)) : Math.max(1, this.stars), x, z); break;
      case 'hit_cop': this.setStars(Math.max(this.stars, 2), x, z); break;
      case 'kill_cop': this.lastCopKill = this.game.time; this.setStars(Math.min(5, Math.max(2, this.stars + 1)), x, z); this.report(x, z); break;
      case 'carjack': if (seen) this.setStars(Math.max(this.stars, 1), x, z); break;
      case 'steal_police': this.setStars(Math.max(this.stars, 2), x, z); break;
      case 'run_over': this.setStars(Math.max(this.stars, seen ? 2 : 1), x, z); break;
      default: break;
    }
  }

  // The police saw the player at (x, z): the search circle moves there.
  report(x, z) {
    if (!this.stars) return;
    this.lastX = x; this.lastZ = z;
    this.circle.x = x; this.circle.z = z;
    this.sinceSeen = 0;
  }

  // The player got into a different car while nobody was looking: the police lose track for a bit.
  newCar() {
    if (this.active && this.sinceSeen > 1.5) { this.sinceSeen += 6; this.onMessage('NEW CAR - THE POLICE DID NOT SEE IT'); }
  }

  // An officer has hold of the player (1 star, or a raid team inside a building). Not BUSTED at once:
  // Vikram gets one minute to fight his way out - punch (FIGHT) or shoot the cops around him.
  caught() {
    const g = this.game, P = g.player;
    if (this.busting || this.arrestT > 0 || this.stars < 1 || this.stars > 3 || P.dead || g.godMode) return;
    if (P.inCar) g.driving.exit();   // they pull him out of the car
    this.arrestT = Math.max(ARREST_TIME, this.graceLeft); this.freeT = 0;   // never BUSTED inside the 2-minute grace
    if (g.voice) g.voice.sayLine('POLICE', 'raidSee', RAID_SEE, { prio: 2 });
    this.onArrest(true);
  }

  // The minute is running. The cops around him try to hold and cuff him (they do not shoot, even when
  // he hits back). Free when no cop is near him for 3 seconds (all beaten, or he got away);
  // still held by a cop when the minute is over: BUSTED.
  updateArrest(dt) {
    const g = this.game, P = g.player;
    if (P.dead) { this.arrestT = 0; return; }
    this.arrestT -= dt;
    let near = false, grab = false;
    for (const o of g.officers) {
      if (o.dead || o.gang) continue;
      const d = dist(o.x, o.z, P.x, P.z);
      if (d < 9) near = true;
      if (d < 2.3 && !(o.stunT > 0)) grab = true;
    }
    this.freeT = near ? 0 : this.freeT + dt;
    if (this.freeT > 3) { this.arrestT = 0; this.onArrest(false); return; }
    if (this.arrestT <= 0) { this.arrestT = 0; if (grab) this.bust(); else this.onArrest(false); }
  }

  // He beat the cops who came for him (killed one in the last minute, no cop left near him): the police
  // regroup. No new units for 2-3 minutes, then a bigger BACKUP. Scripted shoot-outs keep their pressure.
  checkCopsDown() {
    const g = this.game, P = g.player;
    if (this.lullOn || this.arrestT > 0 || g.time - this.lastCopKill > 60 || g.time - this.lullEnd < 45) return;
    if (g.mission && g.mission.holdStars && !g.mission.done) return;
    for (const o of g.officers) if (!o.dead && !o.gang && !o.returning && dist(o.x, o.z, P.x, P.z) < 50) return;
    this.startLull();
  }
  startLull() {
    const g = this.game;
    this.lullOn = true; this.lullT = 120 + Math.random() * 60;
    for (const c of g.policeCars) if (!c.wrecked && !c.parked && !c.roadblock && !c.playerControlled) c.endPursuit();
    for (const o of g.officers) if (!o.dead && !o.gang && !o.group && !o.forceHostile) o.standDown();
    if (this.raid) { this.raid.end(); this.raid = null; }
    if (this.heli && !this.heli.leaving) this.heli.leave();
    this.onLull(true);
  }
  // The breather is over: more police than before, and they know where he is.
  backup() {
    const g = this.game, P = g.player;
    this.lullOn = false; this.lullT = 0; this.lullEnd = g.time;
    this.setStars(Math.min(5, this.stars + 1), P.x, P.z);
    this.report(P.x, P.z);
    for (const c of g.policeCars) if (!c.wrecked && !c.parked && !c.roadblock && !c.playerControlled) c.beginPursuit();
    this.reinforceT = 0;
    this.onLull(false);
  }

  // Time is up and a cop still has him: BUSTED.
  bust() {
    const g = this.game, P = g.player;
    if (this.busting || P.dead || g.godMode) return;
    this.busting = true;
    if (P.inCar) g.driving.exit();
    P.controlsEnabled = false;
    this.onBusted();
    setTimeout(() => { this.busting = false; }, 2600);
  }

  // Start a raid when the police think he is hiding off the street (courtyard, alley, yard).
  updateRaid(dt) {
    const g = this.game, P = g.player;
    if (this.raid) {
      this.raid.update(dt);
      if (this.raid.done) this.raid = null;
      return;
    }
    this.raidT -= dt;
    if (this.raidT > 0) return;
    this.raidT = 1;
    const m = g.mission;
    if (!this.raidsOn || P.inCar || P.dead || g.mode !== 'play' || (m && m.def.noRaids) || g.time - this.raidAt < 20) return;
    const B = g.world.insideBlock(this.lastX, this.lastZ);
    if (!B || !g.world.insideBlock(P.x, P.z)) { this.raidWait = 0; return; }
    // A couple of seconds off the street (seen or not) and the raid team is on its way.
    this.raidWait = (this.raidWait || 0) + 1;
    if (this.raidWait < 3) return;
    this.raidWait = 0;
    const r = new Raid(g, B, this.lastX, this.lastZ, this.stars);
    if (!r.officers.length) return;
    this.raid = r; this.raidAt = g.time;
    this.onMessage('POLICE RAID! They are coming inside to arrest you - get out or fight!');
    if (g.voice) g.voice.sayLine('POLICE', 'raidStart', RAID_START, { prio: 2 });
  }

  // A random point (on a road) inside the search circle, for police to check.
  searchPoint() {
    const C = this.circle, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * C.r * 0.8;
    return { x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r };
  }

  update(dt) {
    const g = this.game;
    if (this.reportTimer >= 0) {
      this.reportTimer -= dt;
      if (this.reportTimer < 0 && !this.stars) this.setStars(1, this.reportX, this.reportZ);
    }
    for (const rb of [...this.roadblocks]) rb.update(dt);
    if (this.heli) this.heli.update(dt);
    if (!this.stars || this.busting) return;
    if (this.arrestT > 0) this.updateArrest(dt);

    this.sinceSeen += dt;
    if (g.mission && g.mission.holdStars && !g.mission.done) this.sinceSeen = 0;   // no escape during the shoot-out
    if (this.lullOn) {
      this.lullT -= dt;
      // Story mission: they know who he is, the stars stay - unless the job right now is to lose them.
      const m = g.mission, losing = m && /lose the (police|cops)|shake off/i.test(m.objectiveText || '');
      if (m && !m.done && !losing) this.sinceSeen = 0;
    } else this.updateRaid(dt);
    this.circle.r = moveTowards(this.circle.r, this.radius, 30 * dt);
    const T = this.target;
    const outside = dist(T.x, T.z, this.circle.x, this.circle.z) > this.circle.r;
    this.outsideT = this.sinceSeen > 1 && outside ? this.outsideT + dt : 0;
    // Hiding in the block they are searching does not work: get out of it.
    if (this.raid && !this.raid.ending && this.raid.contains(T.x, T.z)) this.sinceSeen = Math.min(this.sinceSeen, this.loseTime * 0.5);
    if (this.outsideT >= this.escapeTime || this.sinceSeen >= this.loseTime) { this.clear(true); return; }

    // The breather: no new cars, roadblocks or helicopter until the backup comes.
    if (this.lullOn) { if (this.lullT <= 0) this.backup(); return; }
    this.checkCopsDown();
    // Reinforcements: keep enough chasing police cars for the star level.
    this.reinforceT -= dt;
    if (this.reinforceT <= 0) {
      this.reinforceT = 3;
      const chasing = g.policeCars.filter((c) => !c.wrecked && !c.roadblock && !c.playerControlled && !c.parked).length;
      if (chasing < UNITS_FOR_STARS[this.stars] + this.extra) g.spawnPoliceCar(true);
    }
    // Roadblocks (3+ stars) when the player is driving fast.
    this.roadblockT -= dt;
    if (this.stars >= 3 && this.roadblockT <= 0 && this.roadblocks.length < 1 && g.player.inCar && g.driving.speed > 9) {
      this.roadblockT = 8;
      const rb = Roadblock.ahead(g, this.stars >= 4);
      if (rb) { this.roadblocks.push(rb); this.onMessage(this.stars >= 4 ? 'ROADBLOCK AHEAD - WATCH FOR SPIKES!' : 'ROADBLOCK AHEAD!'); }
    }
    // Helicopter (4+ stars).
    if (this.stars >= 4 && (!this.heli || this.heli.leaving)) {
      if (this.heli) this.heli.remove();
      this.heli = new Helicopter(g);
    }
  }
}

// ---------------------------------------------------------------------------
// Raid team: a van parks at the block, officers come in through the gaps between the buildings
// and check every corner (and the place he was last seen). Over when he is gone or the stars are.
// ---------------------------------------------------------------------------
const RAID_START = ['Police! He is hiding inside. Search every corner!', 'All units, he went into the building. Go in, go in!',
  'Block the gaps! Nobody leaves this compound!'];
const RAID_SEE = ['Ruk jao! Police! Hands up!', 'There he is! Don\'t move!', 'Haath upar! You are under arrest!', 'Stop right there, Vikram!'];
class Raid {
  constructor(game, block, lx, lz, stars) {
    this.game = game; this.block = block; this.officers = []; this.ending = false; this.done = false; this.t = 0; this.seenT = 0;
    const g = game, nav = g.nav, P = g.player;
    // Places to search: free spots inside the block (courtyard, alleys), spread out, last-seen place first.
    const cand = [];
    for (let x = block.x0 + 1.5; x < block.x1 - 1; x += 3) for (let z = block.z0 + 1.5; z < block.z1 - 1; z += 3) if (nav.free(nav.idx(x, z))) cand.push({ x, z });
    const pts = [{ x: lx, z: lz }];
    while (pts.length < 8 && cand.length) {
      let best = null, bd = -1;
      for (const c of cand) { let d = Infinity; for (const p of pts) d = Math.min(d, dist(c.x, c.z, p.x, p.z)); if (d > bd) { bd = d; best = c; } }
      if (bd < 4) break;
      pts.push(best);
    }
    this.points = pts;
    // Ways in: footpath spots right in front of a gap between the buildings (prefer ones he cannot see).
    const mouths = [];
    const f = 2.2;   // just outside the inner area: on the footpath
    for (let t = 2; t < block.x1 - block.x0 - 2; t += 2.5) {
      for (const [x, z, ix, iz, side] of [[block.x0 + t, block.z0 - f, block.x0 + t, block.z0 + 2.5, 'S'], [block.x0 + t, block.z1 + f, block.x0 + t, block.z1 - 2.5, 'N']]) mouths.push({ x, z, ix, iz, side });
    }
    for (let t = 2; t < block.z1 - block.z0 - 2; t += 2.5) {
      for (const [x, z, ix, iz, side] of [[block.x0 - f, block.z0 + t, block.x0 + 2.5, block.z0 + t, 'W'], [block.x1 + f, block.z0 + t, block.x1 - 2.5, block.z0 + t, 'E']]) mouths.push({ x, z, ix, iz, side });
    }
    const open = mouths.filter((q) => nav.free(nav.idx(q.ix, q.iz)) && nav.free(nav.idx(q.x, q.z)));
    for (const q of open) {
      const d = dist(q.x, q.z, P.x, P.z);
      q.score = (d < 10 ? -50 : 0) + (g.world.segmentBlocked(q.x, q.z, P.x, P.z) ? 20 : 0) - Math.abs(d - 30) * 0.3 + Math.random() * 6;
    }
    open.sort((a, b) => b.score - a.score);
    const n = Math.min(5, stars + 1);
    const picked = [];
    for (const q of open) { if (picked.every((p) => dist(p.x, p.z, q.x, q.z) > 6)) picked.push(q); if (picked.length >= n) break; }
    if (!picked.length) return;
    // The van parks on the road next to the first way in, lights flashing.
    const q0 = picked[0];
    const lane = { S: [q0.x, LINES[block.j] + 2.25, Math.PI / 2], N: [q0.x, LINES[block.j + 1] - 2.25, Math.PI / 2], W: [LINES[block.i] + 2.25, q0.z, 0], E: [LINES[block.i + 1] - 2.25, q0.z, 0] }[q0.side];
    this.van = g.spawnPoliceCarParked(lane[0], lane[1], lane[2]);
    this.van.roadblock = true; this.van.raidVan = true;
    const night = g.atmo && g.atmo.isNight;
    picked.forEach((q, k) => {
      const o = g.spawnOfficer(q.x, q.z, yawOf(q.ix - q.x, q.iz - q.z), this.van, { swat: stars >= 3, flashlight: night });
      o.raid = this; o.engaged = true; o.raidI = (k * 3) % this.points.length; o.raidWait = 0;
      this.officers.push(o);
    });
  }
  contains(x, z) { const B = this.block; return x > B.x0 - 1 && x < B.x1 + 1 && z > B.z0 - 1 && z < B.z1 + 1; }
  // Where an officer goes next when nobody can see Vikram.
  searchTarget(o, dt) {
    let p = this.points[o.raidI % this.points.length];
    if (dist(o.x, o.z, p.x, p.z) < 1.6) {
      o.raidWait += dt;
      if (o.raidWait > 1.4) { o.raidWait = 0; o.raidI = (o.raidI + 1) % this.points.length; p = this.points[o.raidI]; }
      else return null;   // look around for a moment
    }
    return p;
  }
  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player;
    this.t += dt;
    const alive = this.officers.filter((o) => !o.dead && !o.inactive);
    // Shout when they spot him.
    this.seenT -= dt;
    if (!this.ending && this.seenT <= 0 && alive.some((o) => o.seesPlayer && dist(o.x, o.z, P.x, P.z) < 25)) {
      this.seenT = 7;
      if (g.voice) g.voice.sayLine('POLICE', 'raidSee', RAID_SEE, { prio: 2 });
    }
    // Over: he got far away from the block, all officers are down, or no stars any more.
    const far = dist(P.x, P.z, this.block.cx, this.block.cz) > 75 || P.inCar;
    if (!this.ending && (!D.active || far || !alive.length || this.t > 150)) this.end();
    if (this.ending) {
      this.endT += dt;
      if (this.endT > 30 || !this.officers.some((o) => !o.inactive && !o.dead)) {
        if (this.van && !this.van.inactive && !this.van.playerControlled && dist(this.van.x, this.van.z, g.camera.position.x, g.camera.position.z) > 40) g.removeCar(this.van);
        this.done = true;
      }
    }
  }
  end() {
    if (this.ending) return;
    this.ending = true; this.endT = 0;
    for (const o of this.officers) if (!o.dead && !o.inactive) { o.raid = null; o.standDown(); }
  }
}

// ---------------------------------------------------------------------------
// Police patrol car: patrols the lanes; in a chase it cuts corners, predicts where you
// are going, rams your car, and drops officers off when you are on foot.
// ---------------------------------------------------------------------------
export class PoliceCar extends Car {
  constructor(game) {
    super(game, 'police', 0xffffff);
    this.isPolice = true;
    this.state = 'patrol';
    this.patrolSpeed = 9;
    this.cruise = this.patrolSpeed;
    this.crew = [];
    this.repathT = 0; this.sightT = Math.random() * 0.2; this.flashT = 0; this.flash = false; this.waitT = 0; this.deployT = 0;
    this.search = null; this.searchT = 0;
    this.redMat = this.vehicle.red;
    this.blueMat = this.vehicle.blue;
  }

  get pursuitSpeed() { return 22 + this.game.dispatch.stars * 2; }

  beginPursuit() {
    if (this.playerControlled || this.parked || this.wrecked) return;
    this.state = 'pursuit';
    this.cruise = this.pursuitSpeed; this.accel = 7; this.brake = 11;
    this.obeySignals = false; this.pursuing = true; this.hold = false;
    this.repathT = 0;
  }

  endPursuit() {
    if (this.roadblock || this.parked) { this.pursuing = false; return; }
    this.pursuing = false; this.obeySignals = true;
    this.cruise = this.patrolSpeed; this.accel = 3.5; this.brake = 8;
    this.clearDirect(); this.upcoming = [];
    this.setLights(false, false);
    const alive = this.crew.filter((o) => !o.dead);
    if (alive.length) { this.state = 'waiting'; this.hold = true; this.waitT = 25; }
    else this.state = 'patrol';
  }

  officerBack(o) {
    this.crew = this.crew.filter((c) => c !== o);
    if (this.state === 'waiting' && !this.crew.some((c) => !c.dead)) { this.state = 'patrol'; this.hold = false; }
  }

  setLights(r, b) {
    if (r) this.redMat.color.setRGB(6, 0.3, 0.25); else this.redMat.color.setHex(0x551111);
    if (b) this.blueMat.color.setRGB(0.3, 0.8, 7); else this.blueMat.color.setHex(0x111a55);
  }

  flashLights(dt) {
    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashT = 0.25; this.flash = !this.flash; this.setLights(this.flash, !this.flash); }
  }

  update(dt) {
    if (this.playerControlled || this.parked) {
      if (this.roadblock && !this.playerControlled) this.flashLights(dt);
      super.update(dt); return;
    }
    const g = this.game, D = g.dispatch, P = g.player;
    const T = D.target;

    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = 0.2;
      if (D.active && !this.wrecked && canSee(g.world, this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw), T, 60, 200)) D.report(T.x, T.z);
    }

    if (this.state === 'pursuit' && !this.wrecked) {
      this.cruise = this.pursuitSpeed;
      const dT = dist(this.x, this.z, T.x, T.z);
      const fresh = D.sinceSeen < 2.5;
      if (fresh) {
        // Chase: drive at where the player WILL be.
        const vx = P.inCar ? g.driving.vx : P.vx, vz = P.inCar ? g.driving.vz : P.vz;
        const lead = clamp(dT / 22, 0, 1.3);
        const ax = T.x + vx * lead, az = T.z + vz * lead;
        if (dT < 75 && !g.world.pathBlocked(this.x, this.z, ax, az, 1.1)) this.setDirect(ax, az, P.inCar ? 0 : 6.5);
        else this.routeAt(D.lastX, D.lastZ, dt);
      } else {
        // Lost sight: search random spots inside the search circle.
        this.searchT -= dt;
        if (!this.search || this.searchT <= 0 || dist(this.x, this.z, this.search.x, this.search.z) < 14) {
          this.search = D.searchPoint(); this.searchT = 12; this.repathT = 0;
        }
        this.routeAt(this.search.x, this.search.z, dt);
      }
      // Officers get out when close and you are on foot or stopped (one at 1-2 stars, two at 3+).
      const crewSize = (D.stars >= 3 ? 2 : 1) + D.extra;
      const stopped = !P.inCar || g.driving.speed < 2.5;
      if (stopped && this.crew.filter((o) => !o.dead).length < crewSize && this.deployT <= 0 && D.sinceSeen < 1.5 && dT < 16 && this.speed < 1.5) {
        const side = this.crew.length % 2 === 0 ? 1 : -1;
        const rx = -Math.cos(this.yaw) * side, rz = Math.sin(this.yaw) * side;
        const o = g.spawnOfficer(this.x + rx * (this.halfW + 0.9), this.z + rz * (this.halfW + 0.9), this.yaw, this);
        this.crew.push(o);
        this.deployT = 1.2;
      }
      this.flashLights(dt);
    } else if (this.state === 'waiting') {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        for (const o of this.crew) if (!o.dead) o.remove();
        this.crew = []; this.hold = false; this.state = 'patrol';
      }
    }
    if (this.deployT > 0) this.deployT -= dt; else this.deployT = 0;

    super.update(dt);
    if (this.direct) {
      // Two circles (front + back) so the car slides along walls instead of driving into them.
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      for (const k of [0.55, -0.55]) {
        const c = { x: this.x + fx * this.halfL * k, z: this.z + fz * this.halfL * k };
        const bx = c.x, bz = c.z;
        g.world.resolveCircle(c, this.halfW, 0, true);
        this.x += c.x - bx; this.z += c.z - bz;
      }
      this.syncMesh();
    }
  }

  // Follow the roads to (x, z).
  routeAt(x, z, dt) {
    if (this.direct && dist(this.x, this.z, x, z) < 30 && !this.game.world.pathBlocked(this.x, this.z, x, z, 1.1)) { this.setDirect(x, z, 4); return; }
    this.clearDirect();
    this.repathT -= dt;
    if (this.repathT <= 0) { this.repathT = 1.2; this.routeTo(this.net.nearest(x, z)); }
  }
}

// ---------------------------------------------------------------------------
// Officer on foot: khaki police (pistol) or SWAT (SMG, armour). Arrests at 1 star,
// shoots at 2+ (moving sideways while shooting), finds a way round buildings.
// ---------------------------------------------------------------------------
const _dir = new THREE.Vector3(), _from = new THREE.Vector3(), _hd = new THREE.Vector3();

export class Officer {
  constructor(game, x, z, yaw, car, opts = {}) {
    this.game = game; this.car = car;
    this.x = x; this.z = z; this.yaw = yaw; this.groundY = game.world.groundAt(x, z);
    this.rLong = 0.35; this.rLat = 0.35; this.radius = 0.35;
    // Gang members, guards and bosses use this class too (gang: true): they never call the police.
    this.gang = !!opts.gang; this.boss = !!opts.boss; this.bossName = opts.name || '';
    this.group = opts.group || null; this.dmgMul = opts.damage ?? 1;
    this.swat = !this.gang && (opts.swat ?? game.dispatch.stars >= 3);
    this.health = this.maxHealth = opts.health ?? (this.swat ? 150 : this.gang ? 80 : 100);
    this.dead = false; this.deadT = 0;
    if (opts.hostile) this.forceHostile = true;
    this.post = opts.post ? { x, z, yaw } : null; this.engaged = !opts.post;
    this.guard = opts.patrol ? { path: opts.patrol, i: 0, wait: 0, seen: 0, alerted: false } : null;
    this.flashlight = !!opts.flashlight;
    this.returning = false; this.catchT = 0; this.sightT = Math.random() * 0.2;
    this.fireT = 1 + Math.random(); this.burst = 0; this.seesPlayer = false; this.speed = 0; this.aimW = 0;
    this.vx = 0; this.vz = 0;
    this.path = null; this.pathI = 0; this.repathT = 0; this.pathGoal = null; this.directT = 0; this.direct = true;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1 + Math.random() * 2;
    this.search = null;
    this.stunT = 0;   // knocked back by a punch
    this.isOfficer = true;
    this.rig = new CharacterRig(opts.model || (this.swat ? 'swat' : 'police'), { castShadow: game.shadows });
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.weapon = opts.weapon || (this.swat ? 'smg' : 'pistol');
    this.gun = makeGun(this.weapon);
    this.gun.visible = false;
    game.scene.add(this.gun);
    // Marker over the head: red = enemy; guards show ? when suspicious and ! when they spot you.
    if (this.gang || opts.marker) {
      this.marker = new THREE.Sprite(markerMat(this.guard ? 'sus' : this.boss ? 'boss' : 'enemy'));
      this.marker.center.set(0.5, 0);
      this.marker.position.y = 2.05;
      this.marker.scale.setScalar(0.034);
      this.marker.renderOrder = 999;
      this.marker.visible = !this.guard;
      this.mesh.add(this.marker);
    }
    if (this.flashlight) { this.torch = makeTorch(); this.mesh.add(this.torch); }
  }

  standDown() { if (!this.gang) this.returning = true; }

  setMarker(kind) { if (this.marker) { this.marker.material = markerMat(kind); this.marker.visible = kind !== 'none'; } }

  // A guard (stealth missions) notices you: he and his whole group attack.
  alert() {
    if (this.dead) return;
    if (this.guard && !this.guard.alerted) {
      this.guard.alerted = true;
      this.setMarker('alert');
      const g = this.game;
      if (g.mission && g.mission.onAlert) g.mission.onAlert(this);
      for (const o of g.officers) if (o !== this && o.group && o.group === this.group && o.guard && !o.guard.alerted) o.alert();
    }
    this.forceHostile = true; this.engaged = true;
  }

  // Punched: he stumbles back and cannot grab or shoot for a moment.
  stun(sec, fromX, fromZ) {
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.vx = (dx / d) * 3.4; this.vz = (dz / d) * 3.4;
    this.stunT = Math.max(this.stunT, sec); this.catchT = 0; this.fireT = Math.max(this.fireT, sec + 0.3);
    if (this.guard) this.alert();
    this.engaged = true;
  }
  staggered(dt, camD) {
    const g = this.game;
    this.stunT -= dt;
    const k = Math.max(0, 1 - 5 * dt);
    this.vx *= k; this.vz *= k;
    this.x += this.vx * dt; this.z += this.vz * dt;
    g.world.resolveCircle(this, this.radius);
    this.groundY = g.world.groundAt(this.x, this.z);
    this.mesh.position.set(this.x, this.groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.x = Math.min(0.35, this.stunT * 0.4);   // leaning back from the hit
    if (this.stunT <= 0) this.mesh.rotation.x = 0;
    this.rig.setMotion(0); this.rig.setAim(0, null);
    this.rig.update(dt, camD);
    this.aimW = 0; this.gun.visible = false;
  }
  // Every cop (or gangster) Vikram takes down gives him health back.
  rewardPlayer() {
    const g = this.game, P = g.player;
    if (P.dead) return;
    const heal = this.gang ? HEAL_PER_COP / 2 : HEAL_PER_COP;
    const before = P.health;
    P.health = Math.min(P.maxHealth || 100, P.health + heal);
    if (P.health > before + 0.5) g.hud.popup(`+${Math.round(P.health - before)} HEALTH`, 'bonus');
  }

  // Silent takedown from behind (stealth).
  takedown() {
    const g = this.game, P = g.player;
    this.health = 0; this.dead = true;
    this.rig.die(this.x - P.x, this.z - P.z);
    this.gun.visible = false; this.setMarker('none');
    g.stats.kills++;
    this.mesh.rotation.x = 0;
    this.rewardPlayer();
    if (g.rewards) { g.rewards.event('SILENT TAKEDOWN', 200, 20); g.slowmo(0.5, 0.35); }
    if (g.mission && g.mission.onKill) g.mission.onKill(this);
  }

  remove() {
    this.inactive = true;
    this.game.scene.remove(this.mesh);
    this.game.scene.remove(this.gun);
    this.rig.dispose();
    const list = this.game.officers, i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }

  takeDamage(amount, byPlayer, fromX = this.x, fromZ = this.z - 1) {
    if (this.dead) return;
    this.health -= amount;
    const g = this.game;
    if (this.boss && g.mission && g.mission.onBossHit) g.mission.onBossHit(this);
    if (this.health <= 0) {
      this.dead = true;
      this.rig.die(this.x - fromX, this.z - fromZ);
      if (g.audio && g.camera) setTimeout(() => g.audio.bodyfall(Math.max(0, 1 - Math.hypot(this.x - g.camera.position.x, this.z - g.camera.position.z) / 30)), 450);   // he hits the ground
      this.gun.visible = false; this.setMarker('none');
      this.stunT = 0; this.mesh.rotation.x = 0;
      if (byPlayer) {
        if (!this.gang) g.dispatch.crime('kill_cop', this.x, this.z);
        g.stats.kills++;
        this.rewardPlayer();
        if (g.mission && g.mission.onKill) g.mission.onKill(this);
      }
      // Gangs drop cash (sometimes a JACKPOT); police drop ammo or health.
      if (this.gang) g.pickups.spawn('cash', this.x, this.z, { value: Math.random() < 0.06 ? 1000 : 60 + Math.floor(Math.random() * 5) * 30 });
      if (!this.gang || Math.random() < 0.35) g.pickups.spawn(Math.random() < 0.7 ? 'ammo' : 'health', this.x + 0.6, this.z + 0.4);
      if (g.loot) g.loot.enemyDrop(this);   // his gun falls (PUBG style): walk up and PICK UP
      g.alarm(this.x, this.z, 25);
    } else if (byPlayer) {
      if (!this.gang) { g.dispatch.crime('hit_cop', this.x, this.z); if (this.raid) for (const o of this.raid.officers) o.forceHostile = true; }
      else this.alert();
      this.fireT = Math.min(this.fireT, 0.5);   // shoot back quickly
      this.strafe = -this.strafe;
    }
  }

  // Direction to walk to reach (gx, gz): straight if nothing is in the way, else along an A* path.
  steerTo(gx, gz, dt) {
    const g = this.game;
    this.directT -= dt;
    if (this.directT <= 0) { this.directT = 0.25; this.direct = g.nav.lineFree(this.x, this.z, gx, gz); }
    if (this.direct) { this.path = null; return yawOf(gx - this.x, gz - this.z); }
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || dist(gx, gz, this.pathGoal.x, this.pathGoal.z) > 4) {
      this.path = g.nav.findPath(this.x, this.z, gx, gz);
      this.pathI = 0; this.repathT = 1 + Math.random() * 0.4; this.pathGoal = { x: gx, z: gz };
    }
    if (!this.path || !this.path.length) return yawOf(gx - this.x, gz - this.z);
    let p = this.path[this.pathI];
    while (this.pathI < this.path.length - 1 && dist(this.x, this.z, p.x, p.z) < 1.0) p = this.path[++this.pathI];
    return yawOf(p.x - this.x, p.z - this.z);
  }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player;
    const camD = dist(this.x, this.z, g.camera.position.x, g.camera.position.z);
    if (this.dead) {
      this.deadT += dt;
      this.rig.update(dt, camD);
      if (this.deadT > 20 && camD > 25) this.remove();
      return;
    }

    if (this.marker) this.marker.visible = camD < 75 && (!this.guard || this.guard.alerted || this.guard.seen > 0.12);
    if (this.stunT > 0) { this.staggered(dt, camD); return; }
    if (this.guard && !this.guard.alerted) { this.patrol(dt, camD); return; }

    let gx = this.x, gz = this.z, speed = 0, shooting = false;
    const T = D.target;
    const dP = dist(this.x, this.z, T.x, T.z);
    // Raid officers try to ARREST him (up to 2 stars) unless he shoots at them.
    const arresting = this.raid && !this.forceHostile && D.stars <= 2 && !P.inCar;
    // The one-minute fight: the cops close to him try to hold him, they do not shoot.
    const holding = D.arrestT > 0 && !this.gang && !this.forceHostile && dP < 15;
    const hostile = (D.stars >= 2 || this.forceHostile) && !P.dead && !arresting && !holding;

    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = 0.2;
      this.seesPlayer = !P.dead && canSee(g.world, this.x, this.z, Math.sin(this.yaw), Math.cos(this.yaw), T, 48, 230);
      if (this.seesPlayer && !this.gang) D.report(T.x, T.z);
      if (this.seesPlayer && dP < 32) this.engaged = true;
    }
    if (!this.engaged) { this.idle(dt, camD); return; }

    if (this.returning || (!D.active && !this.forceHostile)) {
      if (this.car && !this.car.inactive) {
        gx = this.car.x; gz = this.car.z; speed = 2.6;
        if (dist(this.x, this.z, gx, gz) < 3) { this.car.officerBack(this); this.remove(); return; }
      } else if (camD > 60) { this.remove(); return; }
      if (D.active && !D.lullOn) this.returning = false;   // the breather: they go back to their cars
    } else if (hostile && this.seesPlayer && dP < (this.weapon === 'pistol' ? 34 : 42)) {
      // Engage: aim at the player, side-step, shoot. Walk closer if far.
      shooting = true;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 2; this.strafe = -this.strafe; }
      const ax = (T.x - this.x) / (dP || 1), az = (T.z - this.z) / (dP || 1);
      const sx = -az * this.strafe, sz = ax * this.strafe;
      const close = dP > 20 ? 0.8 : dP < 7 ? -0.6 : 0;
      gx = this.x + (sx + ax * close) * 3; gz = this.z + (sz + az * close) * 3;
      speed = 1.9;
      if (g.world.pathBlocked(this.x, this.z, this.x + sx * 1.5, this.z + sz * 1.5, 0.2)) this.strafe = -this.strafe;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        if (this.weapon === 'smg') {
          this.shoot(T, dP);
          this.burst++;
          if (this.burst >= 3) { this.burst = 0; this.fireT = 1.1 + Math.random() * 0.7; } else this.fireT = 0.11;
        } else { this.shoot(T, dP); this.fireT = (this.weapon === 'rifle' ? 0.7 : this.weapon === 'shotgun' ? 1.4 : 0.95) + Math.random() * 0.7; }
      }
    } else {
      // Chase the last place they saw you, or search nearby.
      if (this.gang) { gx = T.x; gz = T.z; this.search = null; }
      else if (this.raid && this.seesPlayer) { gx = T.x; gz = T.z; this.search = null; }
      else if (D.sinceSeen < 4 || this.forceHostile) { gx = D.lastX; gz = D.lastZ; this.search = null; }
      else if (this.raid) { const q = this.raid.searchTarget(this, dt); if (q) { gx = q.x; gz = q.z; } }
      else {
        if (!this.search || dist(this.x, this.z, this.search.x, this.search.z) < 2) {
          const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 16;
          this.search = { x: D.lastX + Math.cos(a) * r, z: D.lastZ + Math.sin(a) * r };
        }
        gx = this.search.x; gz = this.search.z;
      }
      if (this.forceHostile && !D.active) { gx = P.x; gz = P.z; }
      const dd = dist(this.x, this.z, gx, gz);
      speed = dd < 1 ? 0 : (D.sinceSeen < 4 || this.gang || (this.raid && this.seesPlayer)) ? (dP < 25 ? 5.5 : 4.4) : this.raid ? 3.0 : 2.2;
    }
    // ARREST: grab the player when he is slow (walking, aiming, stopped car). Any officer at 1 star;
    // a raid team (inside the buildings) up to 3 stars.
    if (!this.gang && !this.returning && (D.stars === 1 || (this.raid && D.stars <= 3))) {
      const pSpeed = P.inCar ? g.driving.speed : Math.hypot(P.vx, P.vz);
      const reach = P.inCar ? g.driving.car.halfL + 1.5 : (this.raid ? 1.9 : 1.7);
      if (dP < reach && pSpeed < (P.inCar ? 1.2 : 3.4) && P.controlsEnabled) {
        this.catchT += dt;
        if (this.catchT >= (P.inCar ? 1.0 : 0.55)) { this.catchT = 0; D.caught(); }
      } else this.catchT = 0;
    }

    // Move.
    let wantYaw = this.yaw;
    if (speed > 0) wantYaw = this.steerTo(gx, gz, dt);
    const tvx = Math.sin(wantYaw) * speed, tvz = Math.cos(wantYaw) * speed;
    const k = Math.min(1, 9 * dt);
    this.vx += (tvx - this.vx) * k; this.vz += (tvz - this.vz) * k;
    const bx = this.x, bz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    g.world.resolveCircle(this, this.radius);
    for (const c of g.cars) if (Math.abs(c.x - this.x) < 4 && Math.abs(c.z - this.z) < 4) pushOutOfBox(this, this.radius, c.x, c.z, c.yaw, c.halfL, c.halfW);
    this.groundY = g.world.groundAt(this.x, this.z);
    const rvx = (this.x - bx) / Math.max(dt, 1e-4), rvz = (this.z - bz) / Math.max(dt, 1e-4);

    // Body: legs follow the walk; while shooting the chest stays on the player.
    if (shooting) {
      const aimYaw = yawOf(T.x - this.x, T.z - this.z);
      this.yaw = rotateTowards(this.yaw, strafeYaw(this.rig, aimYaw, rvx, rvz), 8 * dt);
      twistTo(this.rig, this.yaw, aimYaw);
    } else {
      this.rig.reverse = false; this.rig.twist = 0;
      if (Math.hypot(rvx, rvz) > 0.3) this.yaw = rotateTowards(this.yaw, yawOf(rvx, rvz), 9.4 * dt);
    }
    this.mesh.position.set(this.x, this.groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    this.rig.setMotion(Math.hypot(rvx, rvz));

    // Gun out and arms up while shooting.
    this.aimW = moveTowards(this.aimW, shooting ? 1 : 0, 5 * dt);
    if (shooting || this.aimW > 0) {
      _dir.set(T.x - this.x, (T.y || 0) + 1.2 - (this.groundY + 1.4), T.z - this.z).normalize();
      this.rig.setAim(this.aimW, _dir);
    }
    this.rig.update(dt, camD);
    this.gun.visible = this.aimW > 0.3 && this.rig.root.visible;
    if (this.gun.visible) placeGun(this.rig, this.gun, shooting ? _dir : null);
  }

  // Stand guard at a post (gang lookouts): look around until they see you or get shot.
  idle(dt, camD) {
    const p = this.post;
    if (p) this.yaw = p.yaw + Math.sin(this.game.time * 0.5 + this.x) * 0.9;
    this.mesh.position.set(this.x, this.groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    this.rig.setMotion(0); this.rig.setAim(0, null);
    this.rig.update(dt, camD);
    this.gun.visible = false;
  }

  // Stealth guard: walk the patrol route, stop and look around; slowly notice the player
  // (faster when close, slower when he crouches) - at 100% he raises the alarm.
  patrol(dt, camD) {
    const g = this.game, G = this.guard, P = g.player;
    let speed = 0;
    const pt = G.path[G.i];
    if (G.wait > 0) {
      G.wait -= dt;
      this.yaw += Math.sin(g.time * 1.3 + this.x) * dt * 0.9;
    } else if (dist(this.x, this.z, pt[0], pt[1]) < 0.7) {
      G.i = (G.i + 1) % G.path.length; G.wait = G.path.length > 1 ? 1.5 + Math.random() * 2 : 3;
    } else {
      speed = 1.25;
      this.yaw = rotateTowards(this.yaw, yawOf(pt[0] - this.x, pt[1] - this.z), 4 * dt);
    }
    this.x += Math.sin(this.yaw) * speed * dt; this.z += Math.cos(this.yaw) * speed * dt;
    g.world.resolveCircle(this, this.radius);
    // Eyes: 110 degree cone, 18 m (10 m if Vikram crouches); very close = noticed even from the side.
    const T = g.dispatch.target, d = dist(this.x, this.z, T.x, T.z);
    let rate = -0.3;
    if (!P.dead && d < 18) {
      const range = this.flashlight ? (P.crouching && !P.inCar ? 13 : 17) : (P.crouching && !P.inCar ? 10 : 18);
      const cos = ((T.x - this.x) * Math.sin(this.yaw) + (T.z - this.z) * Math.cos(this.yaw)) / (d || 1);
      const inView = (cos > (this.flashlight ? 0.88 : 0.57) && d < range) || d < 2.2;
      if (inView && !g.world.segmentBlocked(this.x, this.z, T.x, T.z)) rate = (d < 5 ? 2.4 : d < 10 ? 1.2 : 0.7) * (P.crouching ? 0.6 : 1) * (P.inCar ? 1.8 : 1);
    }
    // Disguised as someone these guards expect (delivery boy, waiter, cleaner...): they let you pass
    // if you walk calmly. Running, aiming or crouching - or standing in their face - looks suspicious.
    const D = g.disguise;
    if (D && this.allowDisguise && (this.allowDisguise === D.kind || this.allowDisguise === '*') && !P.inCar && rate > 0) {
      const sus = P.aiming || Math.hypot(P.vx || 0, P.vz || 0) > 3.8 || P.crouching;
      rate = sus ? rate * 1.2 : d < 1.6 ? 0.3 : -0.3;
    }
    if (rate > 0 && g.mission && g.mission.act === 2) rate *= g.mission.challenge || 1;   // sharper guards on the job
    G.seen = clamp(G.seen + rate * dt, 0, 1);
    if (G.seen >= 1) { this.alert(); return; }
    this.setMarker(G.seen > 0.12 ? 'sus' : 'none');
    this.mesh.position.set(this.x, this.groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    this.rig.setMotion(speed); this.rig.setAim(0, null);
    this.rig.update(dt, camD);
    this.gun.visible = false;
  }

  // Fire at the player. Accuracy drops with distance and if the player moves or crouches.
  shoot(target, d) {
    const g = this.game, P = g.player;
    this.rig.handPose(_from, _hd);
    const muzzle = _from.clone().addScaledVector(_dir, this.weapon === 'pistol' ? 0.2 : 0.45);
    const moving = Math.hypot(P.vx || 0, P.vz || 0) > 2 || P.inCar;
    let chance = (this.weapon === 'smg' ? 0.42 : this.weapon === 'shotgun' ? 0.7 - d * 0.03 : 0.5) - d * 0.012 - (moving ? 0.18 : 0) - (P.crouching ? 0.12 : 0);
    chance = Math.max(0.06, Math.min(0.5, chance)) * g.difficulty;
    const aimY = (target.y || 0) + (P.crouching ? 0.9 : 1.25);
    const dir = new THREE.Vector3(target.x - muzzle.x, aimY - muzzle.y, target.z - muzzle.z).normalize();
    const hit = Math.random() < chance;
    if (!hit) { dir.x += (Math.random() - 0.5) * 0.12; dir.y += (Math.random() - 0.3) * 0.08; dir.z += (Math.random() - 0.5) * 0.12; dir.normalize(); }
    const res = shotHitsPlayer(g, muzzle, dir, 60);
    const end = muzzle.clone().addScaledVector(dir, Math.min(res.t, 60));
    g.fx.muzzle(muzzle);
    g.fx.tracer(muzzle, end, 0.8);
    g.audio.gunshot(this.weapon, Math.max(0, 1 - dist(this.x, this.z, g.camera.position.x, g.camera.position.z) / 70));
    const dmg = { smg: 5 + Math.random() * 2, rifle: 10 + Math.random() * 4, shotgun: 16 + Math.random() * 6 }[this.weapon] || 6 + Math.random() * 3;
    if (res.hit && hit) { P.takeDamage(dmg * this.dmgMul, this.x, this.z, this.gang ? 'gang' : 'police'); if (g.mission) g.mission.stats.hurt = (g.mission.stats.hurt || 0) + dmg; }
    else if (res.t < 60) g.fx.impact(end, dir.clone().negate(), false);
    // A miss that flies close past Vikram's head: you hear it whiz by.
    if (!(res.hit && hit) && g.ambience && g.ambience.ready) {
      const hx = target.x - muzzle.x, hz = target.z - muzzle.z, along = Math.max(0, Math.min(Math.min(res.t, 60), hx * dir.x + hz * dir.z));
      const cx = muzzle.x + dir.x * along, cz = muzzle.z + dir.z * along;
      if (Math.hypot(cx - target.x, cz - target.z) < 2.4 && along < Math.min(res.t, 60)) g.audio.whiz(g.ambience.where(cx, cz).pan);
    }
  }
}

// Put a gun model in the character's right hand, pointing along aimDir (or along the forearm).
const _gp = new THREE.Vector3(), _gd = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _zero = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _neg = new THREE.Vector3();
export function placeGun(rig, gun, aimDir) {
  rig.handPose(_gp, _gd);
  const d = aimDir || _gd;
  gun.position.copy(_gp).addScaledVector(d, 0.03);
  _m4.lookAt(_zero, _neg.copy(d).negate(), _up);
  gun.quaternion.setFromRotationMatrix(_m4);
}

// ---------------------------------------------------------------------------
// Roadblock: two police SUVs across the road ahead of the player, officers behind them,
// and (4+ stars) a spike strip in front that bursts your tyres.
// ---------------------------------------------------------------------------
const SPIKE_GEO = (() => {
  const p = [part(BOX, 0x1b1b1b, 0, 0.03, 0, 8.4, 0.06, 0.55)];
  for (let i = 0; i < 28; i++) p.push(part(BOX, 0xb8b8b8, -4.05 + i * 0.3, 0.1, (i % 2 ? 0.12 : -0.12), 0.05, 0.12, 0.05));
  return mergeParts(p);
})();

class Roadblock {
  // Find the next crossing ahead of the player's car and block the road just after it.
  static ahead(game, spikes) {
    const car = game.driving.car;
    if (!car) return null;
    const vx = game.driving.vx, vz = game.driving.vz;
    const alongX = Math.abs(vx) > Math.abs(vz);
    const s = Math.sign(alongX ? vx : vz) || 1;
    // The road the player is on.
    const lineCoord = alongX ? car.z : car.x;
    let line = null;
    for (const L of LINES) if (Math.abs(lineCoord - L) < HALF_ROAD + 1.5) line = L;
    if (line === null) return null;
    const pos = alongX ? car.x : car.z;
    let cross = null;
    for (const L of LINES) {
      const ahead = (L - pos) * s;
      if (ahead > 55 && ahead < 150 && (cross === null || ahead < (cross - pos) * s)) cross = L;
    }
    if (cross === null) return null;
    const at = cross + s * 16;   // just past the crossing, so you cannot simply turn
    if (Math.abs(at) > LINES[LINES.length - 1]) return null;
    const x = alongX ? at : line, z = alongX ? line : at;
    if (game.cars.some((c) => dist(c.x, c.z, x, z) < 6)) return null;
    return new Roadblock(game, x, z, alongX, s, spikes);
  }

  constructor(game, x, z, alongX, s, spikes) {
    this.game = game; this.x = x; this.z = z; this.t = 0;
    this.ax = alongX ? s : 0; this.az = alongX ? 0 : s;   // the player's driving direction
    this.cars = []; this.officers = [];
    const ux = alongX ? 0 : 1, uz = alongX ? 1 : 0;      // across the road
    for (const side of [-1, 1]) {
      const c = new PoliceCar(game);
      c.parked = true; c.roadblock = true; c.speed = 0;
      c.x = x + ux * side * 2.25; c.z = z + uz * side * 2.25;
      c.yaw = yawOf(ux, uz) + side * 0.35;
      c.syncMesh();
      game.cars.push(c); game.policeCars.push(c);
      this.cars.push(c);
      const o = game.spawnOfficer(x + ux * side * 2.6 + this.ax * 4, z + uz * side * 2.6 + this.az * 4, yawOf(-this.ax, -this.az), null);
      this.officers.push(o);
    }
    if (spikes) {
      this.spike = { x: x - this.ax * 14, z: z - this.az * 14 };
      this.spikeMesh = new THREE.Mesh(SPIKE_GEO, vertexColorMaterial);
      this.spikeMesh.position.set(this.spike.x, 0.02, this.spike.z);
      this.spikeMesh.rotation.y = alongX ? Math.PI / 2 : 0;
      game.scene.add(this.spikeMesh);
    }
  }

  update(dt) {
    const g = this.game, P = g.player;
    this.t += dt;
    // Spike strip: tyres burst when you drive over it.
    if (this.spike && P.inCar && g.driving.car && !g.driving.car.spiked) {
      const c = g.driving.car;
      const along = (c.x - this.spike.x) * this.ax + (c.z - this.spike.z) * this.az;
      const across = Math.abs((c.x - this.spike.x) * this.az - (c.z - this.spike.z) * this.ax);
      if (Math.abs(along) < c.halfL * 0.7 && across < 4.4) g.driving.burstTyres();
    }
    const far = dist(P.x, P.z, this.x, this.z) > 230;
    if (far || (this.t > 80 && dist(P.x, P.z, this.x, this.z) > 90)) this.remove();
  }

  remove() {
    const g = this.game;
    for (const c of this.cars) if (c.parked && !c.playerControlled) g.removeCar(c);
    for (const o of this.officers) if (!o.inactive && dist(o.x, o.z, g.camera.position.x, g.camera.position.z) > 40) o.remove();
    if (this.spikeMesh) g.scene.remove(this.spikeMesh);
    const list = g.dispatch.roadblocks, i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Police helicopter (4+ stars): circles over you; its searchlight finds you from the sky.
// Outrun it in a fast car or get out of the search circle.
// ---------------------------------------------------------------------------
let heliGeo = null;
function heliModel() {
  if (!heliGeo) {
    const navy = 0x1d2b4a, white = 0xf2f2f2, dark = 0x151515, glass = 0x26343f;
    heliGeo = mergeParts([
      part(BOX, navy, 0, 1.5, 0.2, 2.1, 1.9, 4.2),
      part(BOX, white, 0, 1.15, 0.2, 2.14, 0.35, 4.24),
      part(BOX, glass, 0, 1.7, 2.1, 1.9, 1.3, 0.9, -0.35, 0, 0),
      part(BOX, navy, 0, 1.9, -3.6, 0.45, 0.45, 4.6),
      part(BOX, white, 0, 2.6, -5.7, 0.12, 1.4, 0.9),
      part(BOX, navy, 0, 2.6, -0.2, 0.5, 0.5, 0.6),
      part(BOX, dark, -0.85, 0.25, 0.2, 0.12, 0.08, 4.0), part(BOX, dark, 0.85, 0.25, 0.2, 0.12, 0.08, 4.0),
      part(BOX, dark, -0.7, 0.55, 1.1, 0.08, 0.6, 0.08), part(BOX, dark, 0.7, 0.55, 1.1, 0.08, 0.6, 0.08),
      part(BOX, dark, -0.7, 0.55, -0.7, 0.08, 0.6, 0.08), part(BOX, dark, 0.7, 0.55, -0.7, 0.08, 0.6, 0.08),
    ]);
  }
  return heliGeo;
}
const ROTOR = new THREE.BoxGeometry(11, 0.06, 0.32);
const TAIL_ROTOR = new THREE.BoxGeometry(0.06, 1.6, 0.18);
const DARK = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
function lightTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,220,1)'); grad.addColorStop(0.55, 'rgba(255,240,200,0.55)'); grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let LIGHT_TEX = null;

class Helicopter {
  constructor(game) {
    this.game = game;
    const P = game.player, a = Math.random() * Math.PI * 2;
    this.x = P.x + Math.cos(a) * 160; this.z = P.z + Math.sin(a) * 160; this.y = 46;
    this.vx = 0; this.vz = 0; this.yaw = 0; this.orbit = Math.random() * 6;
    this.spot = { x: P.x, z: P.z }; this.sweep = 0; this.leaving = false; this.leaveT = 0; this.seeing = false;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(heliModel(), vertexColorMaterial);
    body.castShadow = game.shadows;
    this.rotor = new THREE.Group(); this.rotor.position.y = 2.95;
    const b1 = new THREE.Mesh(ROTOR, DARK), b2 = new THREE.Mesh(ROTOR, DARK); b2.rotation.y = Math.PI / 2;
    this.rotor.add(b1, b2);
    this.tail = new THREE.Mesh(TAIL_ROTOR, DARK); this.tail.position.set(0.2, 2.6, -5.9);
    this.group.add(body, this.rotor, this.tail);
    game.scene.add(this.group);
    // Searchlight: a soft cone + a bright patch on the ground.
    if (!LIGHT_TEX) LIGHT_TEX = lightTexture();
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 7, 1, 20, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.patch = new THREE.Mesh(new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: LIGHT_TEX, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    game.scene.add(this.cone, this.patch);
  }

  sees() { return this.seeing && !this.leaving; }
  leave() { this.leaving = true; }

  remove() {
    this.game.scene.remove(this.group, this.cone, this.patch);
    if (this.game.dispatch.heli === this) this.game.dispatch.heli = null;
    this.game.audio.heli(0);
  }

  update(dt) {
    const g = this.game, D = g.dispatch, T = D.target;
    let gx, gz, max = 24;
    if (this.leaving) {
      this.leaveT += dt;
      this.y += 6 * dt; gx = this.x + Math.sin(this.yaw) * 100; gz = this.z + Math.cos(this.yaw) * 100;
      if (this.leaveT > 14) { this.remove(); return; }
    } else {
      // Circle above the last place you were seen.
      this.orbit += dt * 0.3;
      gx = D.lastX + Math.cos(this.orbit) * 22; gz = D.lastZ + Math.sin(this.orbit) * 22;
      this.y = moveTowards(this.y, 40, 5 * dt);
    }
    const dx = gx - this.x, dz = gz - this.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.min(max, d * 0.6);
    this.vx = moveTowards(this.vx, (dx / d) * want, 8 * dt);
    this.vz = moveTowards(this.vz, (dz / d) * want, 8 * dt);
    this.x += this.vx * dt; this.z += this.vz * dt;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 1) this.yaw = rotateTowards(this.yaw, yawOf(this.vx, this.vz), 1.2 * dt);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(Math.min(0.25, sp * 0.012), this.yaw, 0, 'YXZ');
    this.rotor.rotation.y += dt * 38;
    this.tail.rotation.x += dt * 50;

    // Searchlight: locks on while it can see you; sweeps the search area when it lost you.
    if (!this.leaving) {
      let sx, sz, rate;
      if (D.sinceSeen < 1.5) { sx = T.x; sz = T.z; rate = 15; }
      else {
        this.sweep += dt * 0.7;
        const r = Math.min(D.circle.r * 0.5, 40);
        sx = D.circle.x + Math.sin(this.sweep) * r; sz = D.circle.z + Math.sin(this.sweep * 1.7) * r * 0.6; rate = 10;
      }
      const ex = sx - this.spot.x, ez = sz - this.spot.z, el = Math.hypot(ex, ez);
      if (el > 0.01) { const step = Math.min(el, rate * dt); this.spot.x += (ex / el) * step; this.spot.z += (ez / el) * step; }
      this.seeing = D.active && dist(this.spot.x, this.spot.z, T.x, T.z) < 9 && !(g.world.colorInside && g.world.colorInside(T.x, T.z));
      if (this.seeing) D.report(T.x, T.z);
    }
    const gy = g.world.groundAt(this.spot.x, this.spot.z);
    this.patch.position.set(this.spot.x, gy + 0.08, this.spot.z);
    this.patch.visible = this.cone.visible = !this.leaving;
    const lx = this.spot.x - this.x, ly = gy - (this.y + 0.5), lz = this.spot.z - this.z;
    const L = Math.hypot(lx, ly, lz);
    this.cone.position.set(this.x, this.y + 0.5, this.z);
    this.cone.scale.set(1, L, 1);
    this.cone.quaternion.setFromUnitVectors(_down, _dir.set(lx / L, ly / L, lz / L));
    g.audio.heli(this.leaving ? 0 : Math.max(0, 1 - dist(this.x, this.z, g.camera.position.x, g.camera.position.z) / 220));
  }
}
const _down = new THREE.Vector3(0, -1, 0);

// Head markers drawn once: red arrow (enemy), gold crown arrow (boss), yellow ? (suspicious), red ! (alert).
const MARKERS = {};
function markerMat(kind) {
  if (MARKERS[kind]) return MARKERS[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,0.75)';
  if (kind === 'enemy' || kind === 'boss') {
    x.fillStyle = kind === 'boss' ? '#ffc531' : '#ff3b30';
    x.beginPath(); x.moveTo(10, 14); x.lineTo(54, 14); x.lineTo(32, 52); x.closePath(); x.stroke(); x.fill();
  } else {
    x.fillStyle = kind === 'alert' ? '#ff3b30' : '#ffd21f';
    x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.stroke(); x.fill();
    x.fillStyle = '#111'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(kind === 'alert' ? '!' : '?', 32, 35);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  MARKERS[kind] = new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true });
  return MARKERS[kind];
}

// A guard's torch: a soft beam ahead and a bright spot on the ground (blackout mission).
let torchGeo = null;
const torchMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function makeTorch() {
  if (!torchGeo) {
    const cone = new THREE.CylinderGeometry(0.05, 2.6, 15, 14, 4, true).rotateX(-Math.PI / 2).translate(0, 0, 7.5);
    cone.rotateX(0.12);
    const n = cone.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const z = cone.attributes.position.getZ(i); const k = Math.max(0, 1 - z / 15) ** 1.5 * 0.08; col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.85; }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cone.deleteAttribute('uv'); cone.deleteAttribute('normal');
    const disc = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(2.2, 1, 3.2).translate(0, -1.25, 9);
    const m = disc.attributes.position.count, c2 = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) { const k = i === 0 ? 0.42 : 0; c2[i * 3] = k; c2[i * 3 + 1] = k; c2[i * 3 + 2] = k * 0.85; }
    disc.setAttribute('color', new THREE.BufferAttribute(c2, 3));
    disc.deleteAttribute('uv'); disc.deleteAttribute('normal');
    torchGeo = mergeParts([cone, disc]);
  }
  const t = new THREE.Mesh(torchGeo, torchMat);
  t.position.set(0.25, 1.3, 0.3);
  t.renderOrder = 3; t.frustumCulled = false;
  return t;
}
