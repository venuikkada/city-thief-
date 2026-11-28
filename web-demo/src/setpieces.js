// SET PIECES (v9.7) - one special moment in EVERY mission, and they are all different.
// Research note: open-world missions get boring when every one is the same checklist ("checklist
// design" -> pacing fatigue). The fix that works in big heist games: every prep job feels distinct,
// the player chooses quiet or loud, and things get harder step by step instead of failing at once.
// So each of the 76 missions gets one of these, with its own story line:
//   SNIPER NEST   a scoped rifle waits on a far road - pick off the lookouts at the job from there
//                 (they spot you? 35 s, then their backup comes: finish it loud)
//   ARMS DROP     the gang unloads gun crates - grab them before their truck leaves (real guns
//                 and scopes inside, PUBG-style loot)
//   HOLD THE LINE a friend needs 40 s for a lock / a phone / a bomb - hold off the waves
//   TAIL          follow a car: not too close (he sees you and runs), not too far (you lose him)
//   INTERCEPT     a courier speeds off with what you need - wreck his car, grab it (too slow?
//                 he reaches his gang: take it from them)
//   CUT THE POWER three junction boxes near the job (hold 3 s each) while guards patrol
//   TRACKERS      put GPS trackers on three gang cars (hold 2 s each) without being seen
//   RESCUE        a friend is held in a lane: take out the captors (quietly from behind, or loud)
import * as THREE from 'three';
import * as K from './mkit.js';
import { dist, yawOf, pick, clamp } from './util.js';
import { part, mergeParts, BOX, vertexColorMaterial } from './mesh.js';

const PI = Math.PI;

// ---------- Props ----------
const CRATE_GEO = mergeParts([
  part(BOX, 0x7a5230, 0, 0.32, 0, 0.95, 0.62, 0.62), part(BOX, 0x3d2a17, 0, 0.32, 0, 0.97, 0.08, 0.64),
  part(BOX, 0x3d2a17, -0.32, 0.32, 0, 0.07, 0.64, 0.64), part(BOX, 0x3d2a17, 0.32, 0.32, 0, 0.07, 0.64, 0.64),
  part(BOX, 0xd4b24a, 0, 0.64, 0, 0.34, 0.01, 0.22),
]);
const JBOX_GEO = mergeParts([
  part(BOX, 0x5a6066, 0, 0.35, 0, 0.12, 0.7, 0.12), part(BOX, 0x8a9096, 0, 1.05, 0, 0.6, 0.85, 0.32),
  part(BOX, 0x6d7379, 0, 1.5, 0, 0.66, 0.06, 0.36), part(BOX, 0xf2c230, 0, 1.18, 0.165, 0.24, 0.22, 0.01),
]);
const LED_GEO = new THREE.SphereGeometry(0.05, 6, 4);
const ledOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3, 0.4), toneMapped: false });
const ledOff = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.15), toneMapped: false });

function prop(g, m, geo, x, z, yaw = Math.random() * PI * 2) {
  const o = new THREE.Mesh(geo, vertexColorMaterial);
  o.position.set(x, g.world.groundAt(x, z), z); o.rotation.y = yaw;
  o.castShadow = g.shadows;
  g.scene.add(o); m.track(o);
  return o;
}
// n free spots (not on a road, not in a building) r0..r1 m round (cx, cz), at least 'gap' m apart.
function spots(g, U, cx, cz, r0, r1, n, gap = 3, test = null) {
  const out = [];
  for (let k = 0; k < 160 && out.length < n; k++) {
    const a = Math.random() * PI * 2, r = r0 + Math.random() * (r1 - r0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!g.nav.spawnOk(g.nav.idx(x, z)) || g.world.insideBlock(x, z) || (k < 120 && U.onRoad(x, z))) continue;
    if (test && !test(x, z)) continue;
    if (out.some((q) => dist(q.x, q.z, x, z) < gap)) continue;
    out.push({ x, z });
  }
  return out;
}
const bonus = (g, name, cash, xp = 20) => { g.hud.showBig(name, '#4dff66', 1.5); g.slowmo(0.6, 0.4); if (g.rewards) g.rewards.event(name, cash, xp); };
const left = (g, group) => g.officers.filter((e) => e.group === group && !e.dead);

// A free place off the road, r0..r1 metres from (x, z), leaning towards (tx, tz) (where he is going).
function placeToward(g, U, x, z, tx, tz, r0, r1) {
  const base = Math.atan2(tz - z, tx - x);
  for (let k = 0; k < 60; k++) {
    const a = base + (Math.random() - 0.5) * (k < 30 ? 1.6 : 6.2), r = r0 + Math.random() * (r1 - r0);
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!g.nav.spawnOk(g.nav.idx(px, pz)) || g.world.insideBlock(px, pz) || U.onRoad(px, pz)) continue;
    return { x: px, z: pz };
  }
  return U.freeOffRoad(g, x + Math.cos(base) * r0, z + Math.sin(base) * r0);
}
// The way the lane at road point n runs (so a parked car lines up with the road).
function nodeYaw(g, n) { const q = n.next && n.next.length ? g.network.nodes[n.next[0]] : null; return q ? Math.atan2(q.x - n.x, q.z - n.z) : 0; }
// A road spot near (x, z) to park a car for Vikram.
function carFor(g, m, x, z, color = 0x2a4d7a) {
  const n = g.network.nodes[g.network.nearest(x, z)];
  if (!n) return null;
  const c = g.spawnParkedCar(pick(['sedan', 'hatchback', 'sedan']), color, n.x, n.z, nodeYaw(g, n));
  c.missionCar = true; m.track(c);
  return c;
}

// ---------- SNIPER NEST ----------
// Distance from point p to the line segment a-b (x/z).
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
// v10.1: "SALIM" -> "Salim", "CAMP LADY" -> "the camp lady" (for the step list).
const nameOf = (w) => (!w ? 'your friend' : /^(SHOPKEEPER|DOCTOR|CAMP LADY|BOMB MAKER)$/.test(w) ? 'the ' + w.toLowerCase() : w.split(' ').map((x) => x[0] + x.slice(1).toLowerCase()).join(' '));

function sniperStep(o, site, U) {
  let nest = null, phase = 0, alarmT = -1, backup = false, quiet = true, laneT = 0;
  return {
    kind: 'kill', group: 'snipe', label: o.label || 'Get the sniper rifle and pick off the lookouts at the job',
    start: (g, m) => {
      phase = 0; alarmT = -1; backup = false; quiet = true;
      // The nest: on a footpath 55-85 m from the job with a clear view of it - and not across the
      // traffic (a passing bus would take the bullet).
      const road = (ax, az, bx, bz) => { let n = 0; for (let i = 1; i < 20; i++) if (U.onRoad(ax + (bx - ax) * i / 20, az + (bz - az) * i / 20)) n++; return n / 19; };
      let bs = -1e9;
      nest = null;
      for (const q of spots(g, U, site.x, site.z, 55, 85, 40, 4, (x, z) => !g.world.segmentBlocked(x, z, site.x, site.z))) {
        const sc = -road(q.x, q.z, site.x, site.z) * 120 - Math.abs(dist(q.x, q.z, site.x, site.z) - 68) + Math.random() * 4;
        if (sc > bs) { bs = sc; nest = q; }
      }
      if (!nest) nest = U.freeOffRoad(g, site.x + 70, site.z);
      m.vars.nest = nest;
      // Lookouts near the job - only where the nest can see them over open ground (so the rifle is the answer).
      const seen = (x, z) => !g.world.segmentBlocked(nest.x, nest.z, x, z) && dist(x, z, nest.x, nest.z) > 45 && road(nest.x, nest.z, x, z) < 0.25;
      let pts = spots(g, U, site.x, site.z, 3, 22, 3, 5, seen);
      if (pts.length < 2) pts = pts.concat(spots(g, U, site.x, site.z, 4, 26, 3 - pts.length, 5));
      const list = pts.map((p) => { const q = spots(g, U, p.x, p.z, 3, 6, 1, 1, seen)[0] || p; return [p.x, p.z, Math.random() * PI * 2, [[p.x, p.z], [q.x, q.z]]]; });
      K.guards(g, m, list, null, { group: 'snipe', weapon: 'rifle' });
      m.track(g.loot.drop('sniper', nest.x, nest.z, { mag: 5, reserve: 20 }));
      prop(g, m, CRATE_GEO, nest.x + 1.2, nest.z + 0.6);
      m.objective(o.text || 'Get to the sniper nest - the GARUDA SNIPER waits on the far road');
      m.marker(nest.x, nest.z, 2.5);
      if (o.line) g.say([[o.who || 'RAVI', o.line]]);
    },
    update: (g, m, dt) => {
      const P = g.player, men = left(g, 'snipe');
      g.pins = men.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }));
      if (!men.length) { bonus(g, quiet ? 'SILENT SNIPER' : 'LOOKOUTS DOWN', quiet ? 900 : 500, 30); return true; }
      if (phase === 0 && dist(P.x, P.z, nest.x, nest.z) < 4) { phase = 1; m.newTask(); m.marker(null); g.hud.toast('Pick up the rifle, then AIM: the 8X scope. Crouch = steadier'); }
      // Keep the firing lane clear of people walking by (they would take the bullet).
      if (phase === 1 && (laneT -= dt) <= 0) {
        laneT = 1.2;
        for (const p of g.peds) if (!p.dead && !p.inactive && dist(p.x, p.z, P.x, P.z) > 6 && segDist(p.x, p.z, P.x, P.z, site.x, site.z) < 3) p.respawnElsewhere();
      }
      const alerted = men.some((e) => e.guard && e.guard.alerted);
      if (alerted && alarmT < 0) { alarmT = 35; quiet = false; g.hud.showBig('THEY SAW YOU!', '#ff4438', 1.4); m.music = 3; }
      if (alarmT > 0) {
        alarmT -= dt;
        if (alarmT <= 0 && !backup) {
          backup = true;
          const pts = spots(g, U, site.x, site.z, 10, 26, 2, 4);
          K.thugs(g, m, pts.map((q) => [q.x, q.z]), { group: 'snipe' });
          g.hud.showBig('BACKUP ARRIVED!', '#ff4438', 1.4);
        }
      }
      const n = men.length, tot = n + (m.vars.snipeDown || 0);
      if (phase === 0) m.objective(`${o.text || 'Get to the sniper nest (the rifle on the far road)'} · ${Math.round(dist(P.x, P.z, nest.x, nest.z))} m`);
      else m.objective(alarmT > 0 && !backup ? `They saw you! Finish them before backup comes (${Math.ceil(alarmT)}s): ${n} left` : `Pick off the lookouts at the job with the scope: ${n} left`);
      void tot;
      return false;
    },
    end: (g, m) => { g.pins = []; m.marker(null); m.music = 1; },
  };
}

// ---------- ARMS DROP ----------
function armsStep(o, site, U) {
  let crates = [], t = 0, opened = 0, alertSaid = false;
  const LOOT = [['rifle', 'sight_x4'], ['dmr', 'ammo'], ['smg', 'sight_x2'], ['shotgun', 'sight_dot'], ['rifle', 'ammo']];
  return {
    kind: 'collect', label: o.label || 'Grab the gun crates before the truck leaves',
    start: (g, m) => {
      const P = g.player;
      const c = placeToward(g, U, P.x, P.z, site.x, site.z, 45, 80);
      crates = spots(g, U, c.x, c.z, 1.5, 7, 3, 2.4).map((q) => ({ x: q.x, z: q.z, mesh: prop(g, m, CRATE_GEO, q.x, q.z), open: false }));
      if (crates.length < 3) crates.push(...[0, 1, 2].slice(crates.length).map((i) => { const q = U.free(g, c.x + i * 2.2, c.z); return { x: q.x, z: q.z, mesh: prop(g, m, CRATE_GEO, q.x, q.z), open: false }; }));
      const men = spots(g, U, c.x, c.z, 5, 14, 4, 3);
      K.thugs(g, m, men.map((q) => [q.x, q.z]), { group: 'yard', weapon: pick(['pistol', 'smg']) });
      for (const e of left(g, 'yard')) { e.forceHostile = false; e.engaged = false; e.post = { x: e.x, z: e.z, yaw: 0 }; }
      m.vars.yardAt = c;
      t = o.sec || 90; opened = 0; alertSaid = false;
      m.objective(o.text || 'Kaali\'s men are unloading gun crates. Grab them before their truck leaves');
      m.marker(c.x, c.z, 6);
      if (o.line) g.say([[o.who || 'RAVI', o.line]]);
      m.music = 2;
    },
    update: (g, m, dt) => {
      const P = g.player, c = m.vars.yardAt, men = left(g, 'yard');
      t -= dt;
      if (!alertSaid && dist(P.x, P.z, c.x, c.z) < 26) { alertSaid = true; for (const e of men) e.alert ? e.alert() : (e.forceHostile = true, e.engaged = true); m.music = 3; }
      for (const k of crates) {
        if (k.open || P.inCar || dist(P.x, P.z, k.x, k.z) > 1.9) continue;
        k.open = true; opened++; g.scene.remove(k.mesh);
        const [gun, extra] = LOOT[(opened + (o.seed || 0)) % LOOT.length];
        m.track(g.pickups.spawn(gun, k.x + 0.5, k.z, { yaw: Math.random() * 6.28, dropped: true }));
        m.track(g.pickups.spawn(extra, k.x - 0.5, k.z + 0.3, { yaw: Math.random() * 6.28, dropped: true }));
        g.hud.popup('CRATE OPEN: ' + gun.toUpperCase(), 'bonus'); g.audio.thump(0.3, 140, 0.1); g.audio.pickup();
        m.newTask();
      }
      const shut = crates.filter((k) => !k.open);
      g.pins = [...shut.map((k) => ({ x: k.x, z: k.z, color: '#ffc531' })), ...men.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }))];
      if (!shut.length) { bonus(g, 'ARMS DROP STOLEN', 700, 25); return true; }
      if (t <= 0) {   // too slow: the truck takes the rest (no failure - just less loot)
        for (const k of shut) { k.open = true; g.scene.remove(k.mesh); }
        g.hud.showBig('THE TRUCK TOOK THE REST', '#ffb020', 1.4);
        return true;
      }
      const near = shut.sort((a, b) => dist(a.x, a.z, P.x, P.z) - dist(b.x, b.z, P.x, P.z))[0];
      m.marker(near.x, near.z, 1.5, true);
      // v10.2: in a car next to the crates? Say so (crates open on foot).
      if (P.inCar && dist(near.x, near.z, P.x, P.z) < 9) m.objective(`Get out of the car and walk to the gun crates · ${Math.ceil(t)}s`);
      else m.objective(`Grab the gun crates before the truck leaves: ${opened} / ${crates.length} · ${Math.ceil(t)}s`);
      g.hud.setProgress(`TRUCK LEAVES IN ${Math.ceil(t)}s`, clamp(t / (o.sec || 90), 0, 1), '#ffb020');
      return false;
    },
    end: (g, m) => { g.pins = []; m.marker(null); g.hud.hideProgress(); m.music = 1; },
  };
}

// ---------- HOLD THE LINE ----------
function holdStep(o, site, U) {
  let prog = 0, wave = 0, spot = null, started = false;
  const NEED = o.sec || 40;
  return {
    kind: 'hold', label: `Hold the line while ${nameOf(o.who)} ${o.doing || 'works'}`,
    start: (g, m) => {
      const P = g.player;
      spot = placeToward(g, U, P.x, P.z, site.x, site.z, 35, 70);
      const f = K.person(g, m, spot.x, spot.z, Math.random() * PI * 2, o.rig || 'm_denim', { gesture: 'look' });
      f.calm = true; f.takeDamage = () => {};   // the friend is never the one who fails the mission
      m.vars.friend = f; m.vars.tuneAt = spot;   // (tuneAt: the test robot stands here)
      // A box of guns next to him.
      prop(g, m, CRATE_GEO, spot.x + 1.4, spot.z + 0.8);
      m.track(g.pickups.spawn(pick(['smg', 'rifle', 'shotgun']), spot.x + 1.6, spot.z - 0.6, { yaw: 1, dropped: true }));
      m.track(g.pickups.spawn('ammo', spot.x - 1.2, spot.z + 1, {}));
      prog = 0; wave = 0; started = false;
      m.objective(`Get to ${o.who || 'your friend'} - ${o.doing || 'he needs time'}`);
      m.marker(spot.x, spot.z, 3);
      if (o.line) g.say([[o.who || 'RAVI', o.line]]);
    },
    update: (g, m, dt) => {
      const P = g.player, d = dist(P.x, P.z, spot.x, spot.z);
      if (!started) {
        if (P.inCar && d <= 14) { m.objective(`Get out of the car and stand next to ${o.who || 'your friend'}`); return false; }   // v10.2
        if (d > 14 || P.inCar) { m.objective(`Get to ${o.who || 'your friend'} (${Math.round(d)} m) - ${o.doing || 'he needs time'}`); return false; }
        started = true; m.newTask(); m.marker(null); m.music = 3;
        g.hud.showBig('HOLD THE LINE!', '#ff4438', 1.5);
      }
      // Waves from different sides at 0 %, 33 % and 66 %.
      if (wave < 3 && prog >= wave * NEED / 3) {
        const a0 = Math.random() * PI * 2, n = 2 + (wave === 2 ? 1 : 0) + (o.hard ? 1 : 0);
        const pts = [];
        for (let k = 0; k < n * 4 && pts.length < n; k++) {
          const a = a0 + (Math.random() - 0.5) * 1.2, r = 26 + Math.random() * 10, x = spot.x + Math.cos(a) * r, z = spot.z + Math.sin(a) * r;
          if (g.nav.spawnOk(g.nav.idx(x, z)) && !g.world.insideBlock(x, z)) pts.push([x, z]);
        }
        if (pts.length) K.thugs(g, m, pts, { group: 'hold', weapon: wave === 2 ? 'smg' : 'pistol', noCylinders: wave > 0 });
        wave++;
        if (wave > 1) g.hud.showBig(`WAVE ${wave} / 3`, '#ff4438', 1.1);
      }
      const away = d > 18 || P.inCar;
      if (!away) prog += dt;
      const men = left(g, 'hold');
      g.pins = men.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }));
      g.hud.setProgress(`${(o.doing || 'WORKING').toUpperCase()} ${Math.min(100, Math.round(prog / NEED * 100))}%`, Math.min(1, prog / NEED), '#4dff66');
      m.objective(away ? (P.inCar ? `Get out of the car - nothing happens while you are in it!` : `Get back to ${o.who || 'him'} - nothing happens while you are away!`) : `Hold the line while ${o.who || 'he'} ${o.doing || 'works'} (${men.length} attackers)`);
      if (prog >= NEED) {
        bonus(g, 'HELD THE LINE', 800, 30);
        if (o.done) g.say([[o.who || 'RAVI', o.done]]);
        return true;
      }
      return false;
    },
    end: (g, m) => { g.pins = []; m.marker(null); g.hud.hideProgress(); m.music = 1; },
  };
}

// ---------- TAIL ----------
function tailStep(o, site, U) {
  let closeT = 0, farT = 0, lost = 0, spotted = false, runT = 0, dest = null;
  return {
    kind: 'tail', label: o.text || `Follow ${o.target || 'his car'} without being seen`,
    start: (g, m) => {
      const P = g.player;
      closeT = 0; farT = 0; lost = 0; spotted = false; runT = 0;
      carFor(g, m, P.x + 3, P.z + 3);
      // He drives to the job area (at least 180 m away, so it is a real tail).
      const away = dist(P.x, P.z, site.x, site.z) > 180 ? site : { x: site.x + (site.x > 0 ? -150 : 150), z: site.z + (site.z > 0 ? -120 : 120) };
      dest = away;
      const a = Math.random() * PI * 2;
      const c = U.H.missionCar(g, m, o.car || 'sedan', o.color ?? 0xf2f2f2, { mode: 'tail', name: 'tailCar', speed: 10, dest: { x: dest.x, z: dest.z }, health: 420 },
        { node: true, x: P.x + Math.cos(a) * 35, z: P.z + Math.sin(a) * 35, hx: Math.sign(dest.x - P.x) || 1, hz: 0 });
      c.obeySignals = true;
      m.objective(o.text || `Follow ${o.target || 'his car'}: not too close, not too far`);
      if (o.line) g.say([[o.who || 'RAVI', o.line]]);
      g.hud.toast('A car for you is parked right here. Keep 15-60 m behind him!');
      m.music = 2;
    },
    update: (g, m, dt) => {
      const c = m.vars.tailCar, T = g.dispatch.target, d = dist(T.x, T.z, c.x, c.z);
      g.pins = [{ x: c.x, z: c.z, color: spotted ? '#ff5a4d' : '#6fd3ff' }];
      m.marker(c.x, c.z, 3, true);
      if (spotted) {   // he saw you and runs: now it is a chase
        runT -= dt;
        if (c.wrecked || c.exploded) { bonus(g, 'CAUGHT HIM', 500, 20); return true; }
        if (runT <= 0) { g.hud.showBig('HE GOT AWAY...', '#ffb020', 1.4); g.say([['VIKRAM', 'Gone. But I saw which way he went - that is enough.']]); return true; }
        m.objective(`He saw you! Wreck his car (${Math.ceil(runT)}s)`);
        return false;
      }
      if (c.arrived || dist(c.x, c.z, dest.x, dest.z) < 14) { bonus(g, 'TAIL COMPLETE', 600, 25); if (o.done) g.say([['VIKRAM', o.done]]); return true; }
      if (d < 11) {
        closeT += dt;
        if (closeT > 2.5) {   // too close for too long: he notices
          spotted = true; runT = 45;
          Object.assign(c, { mode: 'flee', cruise: 20, obeySignals: false, pursuing: true, accel: 6, brake: 10, thinkT: 0, hostile: true });
          g.hud.showBig('HE SPOTTED YOU!', '#ff4438', 1.4); m.music = 3;
          return false;
        }
      } else closeT = Math.max(0, closeT - dt);
      if (d > 85) {
        farT += dt;
        if (farT > 6) {
          lost++; farT = 0;
          if (lost >= 2) { m.fail('You lost him'); return false; }
          // One more chance: he is seen again a bit ahead.
          const ang = Math.atan2(c.z - T.z, c.x - T.x);
          const n = g.network.nodes[g.network.nearest(T.x + Math.cos(ang) * 45, T.z + Math.sin(ang) * 45)];
          if (n) { c.placeAt(n.x, n.z, Math.cos(ang), Math.sin(ang)); c.routeTo(c.destNode()); }
          g.hud.showBig('THERE HE IS AGAIN!', '#ffb020', 1.3); g.say([['VIKRAM', 'There! Do not lose him this time, Vikram.']]);
        }
      } else farT = 0;
      m.objective(d < 15 ? `TOO CLOSE! Drop back (${Math.round(d)} m)` : d > 65 ? `Too far! Catch up (${Math.round(d)} m)` : `${o.text || 'Follow him'} · ${Math.round(dist(c.x, c.z, dest.x, dest.z))} m to go`);
      g.hud.setProgress(`DISTANCE ${Math.round(d)} m`, clamp(1 - Math.abs(d - 38) / 50, 0, 1), d < 15 ? '#ff4438' : d > 65 ? '#ffb020' : '#4dff66');
      return false;
    },
    end: (g, m) => { g.pins = []; m.marker(null); g.hud.hideProgress(); m.music = 1; },
  };
}

// ---------- INTERCEPT ----------
function interceptStep(o, site, U) {
  let t = 0, phase = 0, item = null;
  return {
    kind: 'wreck', label: `Wreck the courier's car and grab ${o.item || 'what he carries'}`,
    start: (g, m) => {
      const P = g.player;
      t = o.sec || 80; phase = 0; item = null;
      carFor(g, m, P.x + 3, P.z - 3, 0x7a1d1d);
      const a = Math.random() * PI * 2;
      U.H.missionCar(g, m, o.car || 'van', o.color ?? 0xdedad0, { mode: 'flee', name: 'wreckCar', speed: 17, health: 220, hostile: true, fastBurn: true },
        { node: true, x: P.x + Math.cos(a) * 50, z: P.z + Math.sin(a) * 50, hx: Math.cos(a), hz: Math.sin(a) });
      m.objective(o.text || `Stop the courier: wreck his car (${t}s)`);
      if (o.line) g.say([[o.who || 'RAVI', o.line]]);
      g.hud.toast('Take the car parked here - ram him or shoot his car!');
      m.music = 3;
    },
    update: (g, m, dt) => {
      const c = m.vars.wreckCar, P = g.player;
      if (phase === 0) {
        t -= dt;
        g.pins = [{ x: c.x, z: c.z, color: '#ff5a4d' }]; m.marker(c.x, c.z, 3, true);
        if (c.wrecked || c.exploded || c.health <= 0) {
          phase = 2; m.newTask();
          item = m.track(g.pickups.spawn('intel', c.x + 2.5, c.z + 1.5, { auto: true, car: true }));
          g.hud.showBig('WRECKED!', '#ffc531', 1.2);
        } else if (t <= 0) {
          // Too slow: he reached his gang. They stand round the car - take it from them.
          phase = 1; m.newTask();
          Object.assign(c, { cruise: 0, pursuing: false, hostile: true });
          c.mode = 'parked'; c.parked = true; c.speed = 0;
          const pts = spots(g, U, c.x, c.z, 3, 9, 3, 2.5);
          K.thugs(g, m, pts.map((q) => [q.x, q.z]), { group: 'wreck' });
          g.hud.showBig('HE REACHED HIS GANG!', '#ff4438', 1.4);
        }
        if (phase === 0) m.objective(`${o.text || 'Wreck the courier\'s car'} · ${Math.ceil(t)}s`);
        return false;
      }
      if (phase === 1) {
        const men = left(g, 'wreck');
        g.pins = men.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }));
        m.objective(`Take ${o.item || 'it'} from his gang: ${men.length} left`);
        if (!men.length) { phase = 2; item = m.track(g.pickups.spawn('intel', c.x + 2.5, c.z + 1.5, { auto: true, car: true })); }
        return false;
      }
      g.pins = [{ x: item.x, z: item.z, color: '#6fb7ff' }]; m.marker(item.x, item.z, 2);
      m.objective(`Grab ${o.item || 'what he carried'}`);
      if (item.taken) { bonus(g, 'INTERCEPTED', 600, 25); return true; }
      void P;
      return false;
    },
    end: (g, m) => { g.pins = []; m.marker(null); m.music = 1; },
  };
}

// ---------- CUT THE POWER / TRACKERS (hold at points, guards patrol) ----------
function holdPointsStep(o, site, U, trackers) {
  let pl = null, pts = [], leds = [], quiet = true;
  const group = trackers ? 'trk' : 'pwr';
  return {
    kind: 'plant', label: o.text || (trackers ? 'Plant GPS trackers on their cars' : 'Cut the power at the junction boxes'),
    start: (g, m) => {
      quiet = true; leds = [];
      const base = U.ring(g, site.x, site.z, 12, 38, 3);
      if (trackers) {
        pts = base.map((q) => {
          const n = g.network.nodes[g.network.nearest(q.x, q.z)], yaw = nodeYaw(g, n);
          const c = g.spawnParkedCar('suv', pick([0x1d1e22, 0x2b2b2b, 0x4a1010]), n.x, n.z, yaw); c.missionCar = true; m.track(c);
          return [c.x - Math.cos(yaw) * 1.75, c.z + Math.sin(yaw) * 1.75];   // beside the driver's door
        });
      } else {
        pts = base.map((q) => [q.x, q.z]);
        for (const [x, z] of pts) {
          prop(g, m, JBOX_GEO, x, z, yawOf(site.x - x, site.z - z));
          const led = new THREE.Mesh(LED_GEO, ledOn); led.position.set(x, g.world.groundAt(x, z) + 1.42, z); g.scene.add(led); m.track(led); leds.push(led);
        }
      }
      m.vars.plantPts = pts;
      // Two guards walk between them (they see you = they fight; or take them down from behind).
      const gl = pts.slice(0, 2).map(([x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; const p = U.freeOffRoad(g, x + 2, z + 2), q = U.freeOffRoad(g, x2 - 2, z2 - 2); return [p.x, p.z, 0, [[p.x, p.z], [q.x, q.z]]]; });
      K.guards(g, m, gl, null, { group });
      pl = K.plant(pts, trackers ? 2 : 3, o.text || (trackers ? 'Plant GPS trackers on their cars' : 'Cut the power at the junction boxes'), {
        doing: trackers ? 'PLANTING TRACKER' : 'CUTTING WIRES',
        onEach: (G, M, i) => {
          if (leds[i]) leds[i].material = ledOff;
          G.fx.impact(new THREE.Vector3(pts[i][0], 1.2, pts[i][1]), new THREE.Vector3(0, 1, 0), true);   // sparks
          G.hud.popup(trackers ? 'TRACKER ON' : 'POWER CUT', 'bonus'); M.newTask();
        },
      });
      pl.start(g, m);
      if (o.line) g.say([[o.who || 'RAVI', o.line]]);
    },
    update: (g, m, dt) => {
      if (left(g, group).some((e) => e.guard && e.guard.alerted)) quiet = false;
      const done = pl.update(g, m, dt);
      if (done) {
        bonus(g, trackers ? (quiet ? 'GHOST: TRACKERS ON' : 'TRACKERS ON') : (quiet ? 'GHOST: LIGHTS OUT' : 'LIGHTS OUT'), quiet ? 800 : 450, 25);
        if (!trackers) g.say([['VIKRAM', pick(['Lights out. Cameras blind.', 'Andhera. Now nobody sees me.', 'Power gone. Perfect.'])]]);
      }
      return done;
    },
    end: (g, m) => pl && pl.end(g, m),
  };
}

// ---------- RESCUE ----------
function rescueStep(o, site, U) {
  let freed = false, spot = null;
  return {
    kind: 'kill', group: 'rescue', label: o.text || `Free ${nameOf(o.who)} from the kidnappers`,
    start: (g, m) => {
      const P = g.player;
      freed = false;
      spot = placeToward(g, U, P.x, P.z, site.x, site.z, 40, 75);
      const h = K.person(g, m, spot.x, spot.z, Math.random() * PI * 2, o.rig || 'm_tee', { gesture: 'wait' });
      h.calm = true; h.takeDamage = () => {}; m.vars.hostage = h;
      const pts = spots(g, U, spot.x, spot.z, 2.5, 7, 4, 2.2);
      K.guards(g, m, pts.map((q) => [q.x, q.z, yawOf(spot.x - q.x, spot.z - q.z)]), null, { group: 'rescue', weapon: pick(['pistol', 'smg']) });
      m.objective(o.text || `Free ${o.who || 'him'}: take out the men holding him`);
      m.marker(spot.x, spot.z, 3);
      if (o.line) g.say([[o.from || 'RAVI', o.line]]);
    },
    update: (g, m) => {
      const men = left(g, 'rescue'), h = m.vars.hostage, P = g.player;
      g.pins = men.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }));
      if (men.length) {
        const loud = men.some((e) => e.guard && e.guard.alerted);
        m.objective(`${o.text || `Free ${o.who || 'him'}`}: ${men.length} men - ${loud ? 'they know you are here!' : 'quietly from behind (TAKEDOWN) or loud'}`);
        return false;
      }
      if (!freed) {
        freed = true; m.marker(null);
        bonus(g, 'RESCUED', 700, 25);
        h.faceTarget = P; if (h.rig) h.rig.setGesture('cheer');
        g.say([[o.who || 'FRIEND', o.thanks || 'Vikram! I knew you would come. I am going home - be careful!']]);
        setTimeout(() => { if (!h.removed) { h.walkSpeed = 3.5; h.walkTo = { x: h.x + 30, z: h.z + 10 }; } }, 2500);
      }
      return true;
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}

// ---------- Which set piece each mission gets (and what the people say) ----------
// [kind, { who / line / text / target / item / doing / rig ... }]
export const SET = {
  1: ['power', { who: 'RAVI', line: 'The yard lights run on three boxes. Cut them, and the watchmen see nothing.' }],
  2: ['tail', { who: 'RAVI', target: 'the owner', line: 'The car owner drives home now. Follow him - see where he parks it every night.', done: 'So this is where he parks. Got it.' }],
  3: ['arms', { who: 'SUNNY', line: 'Kaali\'s boys are unloading guns in a yard. Take the crates before they use them on Ravi!' }],
  4: ['hold', { who: 'SALIM', rig: 'm_jacket', doing: 'cuts the back gate lock', line: 'Give me forty seconds on this lock. Keep them off me!' }],
  5: ['trackers', { who: 'SUNNY', line: 'Rana\'s men parked three jeeps near the job. Put trackers on them - then we always know where they are.' }],
  6: ['intercept', { who: 'SUNNY', item: 'the racing tyres', line: 'A rival racer stole my new tyres! He is driving off - stop him!' }],
  7: ['rescue', { who: 'CHOTU', from: 'RAJU', rig: 'm_tee', line: 'Pappu\'s men grabbed my nephew Chotu to scare you off. Bring him back!' }],
  8: ['sniper', { who: 'RAVI', line: 'Kaali\'s men watch the bags from three corners. A rifle waits on the far road - pick them off from there.' }],
  9: ['intercept', { who: 'RAVI', item: 'the disarm code', line: 'Kaali\'s bomb maker has the disarm code - and he is driving away! Wreck his car!' }],
  10: ['arms', { who: 'SALIM', line: 'Kaali keeps his guns in a yard near the bazaar. We take them first. Every gun counts.' }],
  11: ['tail', { who: 'RAVI', target: 'Mehta\'s white sedan', car: 'sedan', line: 'Mehta just left. Follow his white sedan to the secret meeting.', done: 'Mehta and Rana, together. I knew it.' }],
  12: ['power', { who: 'RAVI', line: 'Cut the three power boxes at the police parking. Their cameras go dark.' }],
  13: ['hold', { who: 'RAJU', rig: 'm_kurta', doing: 'packs the stall money', line: 'Forty seconds, beta! Let me pack the cash box. Hold the street!' }],
  14: ['trackers', { who: 'SUNNY', line: 'The rival crew practises somewhere secret. Plant trackers on their three cars.' }],
  15: ['sniper', { who: 'RAVI', line: 'Three guards watch the Gold Exchange street. Take them out from the long road with the rifle.' }],
  16: ['intercept', { who: 'SUNNY', item: 'the package', line: 'Kaali\'s biker grabbed my package first! Wreck his car before he disappears!' }],
  17: ['power', { who: 'SALIM', line: 'In the dark, a ghost walks in. Cut the warehouse lane power - three boxes.' }],
  18: ['rescue', { who: 'BOMB EXPERT\'S SON', from: 'RAVI', rig: 'm_tee', line: 'Rana\'s men grabbed the bomb expert\'s son. Free him, or there is no toolkit!' }],
  19: ['arms', { who: 'RAVI', line: 'The palace guards have rifles. So will we: Kaali\'s old weapons drop is in a yard. Take it.' }],
  20: ['hold', { who: 'IMRAN', rig: 'm_denim', doing: 'sets up his rifle', hard: true, line: 'Forty seconds and I am ready to cover you. Keep Rana\'s men off me!' }],
  21: ['trackers', { who: 'SUNNY', line: 'Rana\'s men parked their cars round the stream spot. Trackers on all three - we stay one step ahead.' }],
  22: ['rescue', { who: 'MEENA', from: 'RAJU', rig: 'f_salwar', line: 'Babu\'s men caught a dancer, Meena. She knows the way into the pichkari tent. Free her!' }],
  23: ['power', { who: 'RAVI', line: 'The vault street cameras run on three junction boxes. Time stops when the lights stop.' }],
  24: ['sniper', { who: 'RAJU', line: 'Rana\'s hunters carry torches on the far lanes. With the scope you see them first.' }],
  25: ['hold', { who: 'SUNNY', rig: 'm_red', doing: 'loads the families into the boat', line: 'Hold the looters back for forty seconds while I load the families!' }],
  26: ['tail', { who: 'RAJU', target: 'the baraat car', car: 'sedan', color: 0xffd700, line: 'Follow the baraat car to the checkpoint. Keep your distance, beta.', done: 'The baraat is past the checkpoint. Now me.' }],
  27: ['intercept', { who: 'RAJU', item: 'Ravi\'s phone', line: 'A van just left the garage - Ravi\'s phone is inside! Stop it!' }],
  28: ['trackers', { who: 'SALIM', line: 'Babu wants proof of quick fingers: trackers on his three cars, and nobody sees you.' }],
  29: ['rescue', { who: 'SHANTA AUNTY', from: 'DADI', rig: 'f_purple', line: 'Beta, those market thieves trapped my friend Shanta in a lane! Help her!' }],
  30: ['arms', { who: 'RAJU', line: 'Babu\'s goons keep their guns in a yard. Steal them before tonight!' }],
  31: ['trackers', { who: 'RAJU', line: 'Babu\'s men parked three cars at the park. Trackers on them, quietly - you are just a chai boy.' }],
  32: ['intercept', { who: 'UNION BOSS', item: 'the fare money', line: 'A passenger ran off without paying - with Babu\'s cash! Run him down!' }],
  33: ['arms', { who: 'SUNNY', line: 'Babu\'s racers hid guns in a yard to "help" the race. Grab the crates first!' }],
  34: ['tail', { who: 'RAJU', target: 'the tiffin man', car: 'hatchback', color: 0xe8e0c8, line: 'There goes the tiffin man. Follow him to Babu\'s office - do not let him see you.', done: 'Babu\'s office. Lunch and cash, every day.' }],
  35: ['hold', { who: 'SHOPKEEPER', rig: 'm_kurta', doing: 'carries out the gas cylinders', line: 'Hold the gate forty seconds while we carry the cylinders out!' }],
  36: ['sniper', { who: 'SALIM', line: 'Babu\'s last men line the seafront. Imran says: snipe first, talk later.' }],
  37: ['power', { who: 'RAVI', line: 'The godown cameras run on three power boxes. Cut them and walk in.' }],
  38: ['trackers', { who: 'RAJU', line: 'Three of Neta\'s cars wait near the station. Trackers on them while the fireworks go off.' }],
  39: ['tail', { who: 'SUNNY', target: 'the buyer\'s car', car: 'sports', color: 0x1d1e22, line: 'The foreign buyer is driving to the cafe. Follow him - stay far.', done: 'The buyer is at the cafe. Now the photos.' }],
  40: ['intercept', { who: 'RAVI', item: 'the assistant\'s phone', line: 'The assistant\'s driver is leaving with the phone! Stop the car!' }],
  41: ['sniper', { who: 'SALIM', line: 'Neta\'s shooters wait near the bank. Take the rifle and shoot first.' }],
  42: ['rescue', { who: 'JOURNALIST', from: 'RAJU', rig: 'm_office', line: 'Neta\'s men grabbed a journalist at the park. He has the recorder code - free him!' }],
  43: ['trackers', { who: 'RAVI', line: 'Neta\'s three cars park behind the hotel. A tracker on each one.' }],
  44: ['hold', { who: 'SALIM', rig: 'm_jacket', doing: 'opens the laptop case', line: 'Forty seconds to crack the case. Hold off the assistant\'s guards!' }],
  45: ['power', { who: 'RAVI', line: 'Cut the party office power - three boxes. In the dark nobody looks at a cleaner.' }],
  46: ['arms', { who: 'SALIM', line: 'Neta\'s convoy guards carry rifles. Grab the guns from his weapons drop first.' }],
  47: ['tail', { who: 'RAVI', target: 'Kapoor\'s buyer', car: 'suv', color: 0x2b2b2b, line: 'Kapoor\'s buyer is leaving. Follow him to the chop shop.', done: 'The chop shop. Kapoor\'s whole business, right there.' }],
  48: ['trackers', { who: 'CONDUCTOR', line: 'Kapoor\'s men parked three cars by the depot. Trackers on them before you take the bus.' }],
  49: ['hold', { who: 'DOCTOR', rig: 'm_office', doing: 'stops the bleeding', line: 'I need forty seconds to save this man! Keep the looters away!' }],
  50: ['intercept', { who: 'SUNNY', item: 'the nitro bottles', line: 'Kapoor\'s man stole our nitro bottles! Wreck his car!' }],
  51: ['sniper', { who: 'RAVI', line: 'Kapoor\'s men guard the truck route from three posts. Snipe them before we move.' }],
  52: ['rescue', { who: 'MAP BOY', from: 'RAJU', rig: 'm_tee', line: 'Kapoor\'s goons caught my map boy! Free him and the maps are yours.' }],
  53: ['arms', { who: 'RAVI', line: 'Kapoor\'s hunters keep their guns in a yard. Take them before they hunt you.' }],
  54: ['power', { who: 'SUNNY', line: 'Darkness is our friend tonight: cut the street lights at three boxes.' }],
  55: ['hold', { who: 'CAMP LADY', rig: 'f_coat', doing: 'loads the food trucks', line: 'Forty seconds to load the trucks! Do not let Kapoor\'s men near them!' }],
  56: ['tail', { who: 'SALIM', target: 'Kapoor\'s armoured SUV', car: 'suv', color: 0x1d1e22, line: 'Follow Kapoor\'s armoured SUV. Find his hideout.', done: 'There it is. Kapoor\'s hideout.' }],
  57: ['trackers', { who: 'RAJU', line: 'Rana\'s bombers use three vans. Trackers on them, quick!' }],
  58: ['sniper', { who: 'KITE BOY', line: 'Rana\'s spotters sit on the far lanes. Your scope first, bhaiya - then the drones.' }],
  59: ['tail', { who: 'MEENA', target: 'the money man', car: 'sedan', color: 0x8e44ad, line: 'The money man is driving to the garba. Follow him - he must not see you.', done: 'He is at the garba circle. Dandiya time.' }],
  60: ['intercept', { who: 'CAPTAIN', item: 'the match money', line: 'A bookie is running off with the match money! Stop his car!' }],
  61: ['hold', { who: 'RAJU', rig: 'm_kurta', doing: 'moves the idol cart', hard: true, line: 'Hold the street for forty seconds while the idol passes. Ganpati Bappa Morya!' }],
  62: ['arms', { who: 'SUNNY', line: 'Warm up for real: Rana\'s weapons drop is in a yard. Take the crates!' }],
  63: ['rescue', { who: 'MEENA', from: 'RAJU', rig: 'f_salwar', line: 'Rana\'s men grabbed Meena in the colour crowd! Free her!' }],
  64: ['power', { who: 'SALIM', line: 'Cut the hotel\'s three power boxes. Wedding lights out, cameras too.' }],
  65: ['sniper', { who: 'RAJU', line: 'Rana\'s watchers on the far lanes will see the lanterns. Snipe them first.' }],
  66: ['arms', { who: 'SALIM', line: 'Rana\'s army has a weapons drop near the show. Take it before the fireworks.' }],
  67: ['tail', { who: 'RAVI', target: 'the bank manager\'s car', car: 'sedan', color: 0x2a4d7a, line: 'The manager is driving out. Follow him - learn the guard change.', done: 'Guard change at six. Now we know.' }],
  68: ['intercept', { who: 'SALIM', item: 'the van keys', line: 'Kapoor\'s last man stole our van keys! Run him down!' }],
  69: ['trackers', { who: 'SUNNY', line: 'Three bank security cars park outside. A tracker on each - we see every move.' }],
  70: ['power', { who: 'RAVI', line: 'Cut the construction yard lights at three boxes. Blind lookouts are easy lookouts.' }],
  71: ['rescue', { who: 'ARJUN', from: 'SALIM', rig: 'm_denim', line: 'Imran\'s brother Arjun is held by Rana\'s men. Free him - he will be our driver.' }],
  72: ['hold', { who: 'BOMB MAKER', rig: 'm_hoodie', doing: 'wires the car bombs', line: 'Forty seconds to wire them. Guard me, bhai!' }],
  73: ['sniper', { who: 'SALIM', line: 'Three guards watch the bank. Snipe them from the far road, then we walk in.' }],
  74: ['arms', { who: 'RAVI', line: 'Before the police come: Salim\'s friend left heavy guns in crates. Grab them!' }],
  75: ['intercept', { who: 'RAVI', item: 'the boat keys', line: 'Sunny\'s partner is speeding to the docks with the boat keys! Stop him!' }],
  76: ['hold', { who: 'IMRAN', rig: 'm_denim', doing: 'hacks the police radio', hard: true, line: 'Forty seconds and every police radio is ours. Hold the line, Vikram!' }],
};

// The step for mission id (null = none). U: helpers from acts.js (free, freeOffRoad, ring, onRoad, H).
export function setPieceStep(id, site, U) {
  const s = SET[id];
  if (!s) return null;
  const [kind, o] = s;
  const st = kind === 'sniper' ? sniperStep(o, site, U) : kind === 'arms' ? armsStep({ ...o, seed: id }, site, U) : kind === 'hold' ? holdStep(o, site, U)
    : kind === 'tail' ? tailStep(o, site, U) : kind === 'intercept' ? interceptStep(o, site, U) : kind === 'power' ? holdPointsStep(o, site, U, false)
      : kind === 'trackers' ? holdPointsStep(o, site, U, true) : kind === 'rescue' ? rescueStep(o, site, U) : null;
  if (st) st.sp = kind;   // (the test robot finds the set piece by this)
  return st;
}
export const setPieceKind = (id) => (SET[id] ? SET[id][0] : null);
