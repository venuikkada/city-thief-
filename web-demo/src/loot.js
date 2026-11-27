// LOOT (v9.7, like PUBG): guns, red dots, scopes, ammo and first-aid lie around Navapur - beside the
// shop doors, on the footpaths, in the lanes. Walk up to a gun and tap PICK UP; scopes, ammo and
// first-aid are picked up just by walking over them. Fallen cops and gangsters drop their guns too.
// Only the loot near Vikram is built (cheap on phones). Taken loot comes back after 3 minutes, as
// something new, and never right in front of him.
import { dist } from './util.js';

const NEAR = 75, FAR = 110, RESPAWN = 180, MAX_DROPS = 10;
// What a loot spot holds (how often).
const TABLE = [['rifle', 16], ['smg', 16], ['shotgun', 11], ['dmr', 7], ['sniper', 5], ['pistol', 4],
  ['sight_dot', 9], ['sight_x2', 8], ['sight_x4', 7], ['sight_x8', 4], ['ammo', 9], ['health', 4]];
const TOTAL = TABLE.reduce((a, [, w]) => a + w, 0);
export function rollLoot(r = Math.random()) { let x = r * TOTAL; for (const [t, w] of TABLE) if ((x -= w) < 0) return t; return 'ammo'; }

export class Loot {
  constructor(g) { this.g = g; this.spots = []; this.drops = []; this.t = 0; }

  // One shop door in four gets a loot spot on the footpath (the other side of the door from the gas cylinder).
  placeCity() {
    const g = this.g;
    let k = 0;
    for (const D of g.world.doors) {
      if (k++ % 4 !== 2) continue;
      const tx = -D.nz, tz = D.nx, off = -(D.w / 2 + 0.85);
      const x = D.x + D.nx * 0.95 + tx * off, z = D.z + D.nz * 0.95 + tz * off;
      if (g.world.insideBlock(x, z)) continue;
      this.spots.push({ x, z, type: rollLoot(), item: null, takenAt: -999, yaw: Math.random() * 6.283 });
      if (this.spots.length >= 72) break;
    }
  }

  update(dt) {
    if ((this.t -= dt) > 0) return;
    this.t = 0.5;
    const g = this.g, P = g.player, now = g.time;
    for (const s of this.spots) {
      const d = Math.abs(s.x - P.x) + Math.abs(s.z - P.z);
      if (s.item) {
        if (s.item.taken) { s.item = null; s.takenAt = now; s.type = rollLoot(); }   // picked up: something new later
        else if (d > FAR * 1.4) { g.pickups.take(s.item); s.item = null; }        // far away: not built
      } else if (d < NEAR * 1.4 && now - s.takenAt > RESPAWN && (s.takenAt < 0 || d > 45)) {
        s.item = g.pickups.spawn(s.type, s.x, s.z, { yaw: s.yaw, loot: true });
      }
    }
    // Dropped guns far behind him are tidied away.
    for (const p of [...this.drops]) if (p.taken || dist(p.x, p.z, P.x, P.z) > 160) { if (!p.taken) g.pickups.take(p); this.drops = this.drops.filter((q) => q !== p); }
  }

  // A gun falls on the ground (swapped out, or from a fallen enemy). ammo = { mag, reserve } or null (fresh).
  drop(id, x, z, ammo) {
    const g = this.g;
    if (!g.nav.free(g.nav.idx(x, z)) && g.world.insideBlock(x, z)) { x = g.player.x; z = g.player.z; }
    const p = g.pickups.spawn(id, x, z, { ammo: ammo || null, yaw: Math.random() * 6.283, dropped: true });
    this.drops.push(p);
    while (this.drops.length > MAX_DROPS) { const o = this.drops.shift(); if (!o.taken) g.pickups.take(o); }
    return p;
  }

  // A fallen cop / gangster drops his gun (not always).
  enemyDrop(o) {
    if (!o.weapon || o.weapon === 'fists') return;
    const chance = o.swat ? 0.8 : o.gang ? 0.6 : 0.5;
    if (Math.random() < chance) this.drop(o.weapon, o.x - 0.6, o.z + 0.35, null);
  }

  // A small kit near where a mission (or free roam) starts: a main gun and a sight or ammo, close by.
  starter(x, z, main = null, extra = null) {
    const g = this.g, nav = g.nav;
    const put = (type, r0) => {
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * 6.283, r = r0 + Math.random() * 3, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!nav.spawnOk(nav.idx(px, pz)) || g.world.insideBlock(px, pz) || g.world.segmentBlocked(x, z, px, pz)) continue;
        const p = g.pickups.spawn(type, px, pz, { yaw: Math.random() * 6.283, dropped: true });
        this.drops.push(p);
        return p;
      }
      return null;
    };
    put(main || ['rifle', 'smg', 'shotgun', 'rifle', 'dmr'][Math.floor(Math.random() * 5)], 3.5);
    put(extra || ['sight_dot', 'sight_x2', 'sight_x4', 'ammo'][Math.floor(Math.random() * 4)], 4.5);
  }

  // A new mission / free roam: fresh loot everywhere.
  reset() {
    for (const s of this.spots) { s.item = null; s.takenAt = -999; s.type = rollLoot(); }
    this.drops = []; this.t = 0;
  }
}
