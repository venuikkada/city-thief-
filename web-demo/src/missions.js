// Chapter 1 - Street Escape. Each mission: objective, timer, win + fail rules, reward (coins + 1-3 stars).
// Progress is saved on the phone (localStorage). Works offline.
import * as THREE from 'three';
import { WAREHOUSE, spawnRavi } from './ambient.js';
import { dist } from './util.js';

const SAVE_KEY = 'cityThief.save.v1';

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return { unlocked: s.unlocked || 1, stars: s.stars || {}, coins: s.coins || 0 };
  } catch (e) { return { unlocked: 1, stars: {}, coins: 0 }; }
}
export function writeSave(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* private mode: fine */ }
}

const GARAGE = { x: -75, z: -37 };
const GETAWAY_CAR = { x: -35, z: 2.25, yaw: -Math.PI / 2 };

export const MISSIONS = [
  {
    id: 1, title: 'Run, Vikram!',
    brief: 'The jewellery heist went wrong. The police saw your face. Get away from them!',
    goal: 'Lose the police within 2:30', reward: 500,
    start(g, m) {
      g.placePlayer(6.6, 19.5, -Math.PI / 2);
      m.objective('Lose the police: get out of the red circle on the map and stay out of sight');
      m.timer(150);
      g.say([['RAVI (phone)', 'Vikram! The cops have your photo. RUN! Lose them, then call me.']]);
      setTimeout(() => g.dispatch.setStars(1), 1200);
    },
    update(g, m) {
      if (m.elapsed > 3 && g.dispatch.stars === 0) m.pass(m.elapsed < 60 ? 3 : m.elapsed < 100 ? 2 : 1);
    },
  },
  {
    id: 2, title: 'Wheels',
    brief: 'You need a car. Take one from the street and bring it to Ravi\'s garage near downtown (follow the yellow GPS line).',
    goal: 'Steal a car, drive to the garage within 2:30', reward: 700,
    start(g, m) {
      g.placePlayer(6.6, 19.5, -Math.PI / 2);
      m.objective('Steal a car: walk up to any car and tap ENTER');
      m.timer(150);
      g.say([['RAVI (phone)', 'Get a car, any car. Bring it to my garage on the west road. Quietly!']]);
      m.step = 0;
    },
    onEnterCar(g, m) {
      if (m.step === 0) { m.step = 1; m.objective('Drive to Ravi\'s garage (yellow marker)'); m.marker(GARAGE.x, GARAGE.z, 6); }
    },
    update(g, m) {
      if (m.step === 1 && !g.player.inCar) m.objective('Get back in a car');
      if (m.step === 1 && g.player.inCar) {
        m.objective('Drive to Ravi\'s garage (yellow marker)');
        if (dist(g.player.x, g.player.z, GARAGE.x, GARAGE.z) < 6) {
          const car = g.driving.car;
          const stars = (car && car.health > 70 ? 1 : 0) + (m.elapsed < 70 ? 1 : 0) + 1;
          m.pass(Math.min(3, stars));
        }
      }
    },
  },
  {
    id: 3, title: 'Meet Ravi',
    brief: 'Ravi is waiting at the old warehouse, hidden behind the buildings north of downtown.',
    goal: 'Reach the warehouse within 2:30', reward: 400,
    start(g, m) {
      g.placePlayer(-68.5, -30, 0);
      g.ravi = spawnRavi(g);
      m.objective('Go to the old warehouse (yellow marker). Find the narrow lane between the buildings.');
      m.marker(WAREHOUSE.door.x, WAREHOUSE.door.z - 2.5, 3);
      m.timer(150);
    },
    update(g, m) {
      if (m.step !== 'talk' && !g.player.inCar && dist(g.player.x, g.player.z, WAREHOUSE.door.x, WAREHOUSE.door.z - 2.5) < 3) {
        m.step = 'talk';
        m.marker(null);
        const r = g.ravi;
        g.cutscene({
          from: [r.x + 3.5, 1.9, r.z - 4.2], at: [(r.x + g.player.x) / 2, 1.35, (r.z + g.player.z) / 2],
          faces: [[r, g.player], [g.player, r]],
          lines: [
            ['RAVI', 'Bhai! You made it. I thought the cops had you.'],
            ['VIKRAM', 'They almost did. Somebody tipped them off, Ravi.'],
            ['RAVI', 'We will find out who. Take this - you will need it tonight.'],
            ['', 'You got an SMG (90 rounds).'],
            ['RAVI', 'Stay sharp. I will get the van ready.'],
          ],
          onDone: () => { g.player.giveWeapon('smg', 90); g.player.weapon = 'smg'; m.pass(m.elapsed < 70 ? 3 : m.elapsed < 110 ? 2 : 1); },
        });
      }
    },
  },
  {
    id: 4, title: 'Warehouse Shootout',
    brief: 'The police followed you to the warehouse. Fight them off with Ravi. Use the crates as cover!',
    goal: 'Defeat the police raid (8 officers)', reward: 900,
    start(g, m) {
      g.placePlayer(-35, 31, Math.PI);
      g.player.giveWeapon('smg', 120);
      g.player.weapon = 'smg';
      g.ravi = spawnRavi(g);
      g.ravi.x = -40; g.ravi.z = 33; g.ravi.gun = true;
      m.holdStars = true;
      m.wave = 0; m.killed = 0; m.total = 8;
      g.say([['RAVI', 'Police! They followed you! Take cover behind the crates!']]);
      m.objective('Defeat the police raid: 0 / 8');
      setTimeout(() => { if (g.mission === m) { g.dispatch.setStars(3); this.wave(g, m, 1); } }, 1800);
    },
    wave(g, m, n) {
      m.wave = n;
      // They come in through the narrow lanes between the buildings.
      const gates = n === 1 ? [[-47.67, 15], [-27.33, 15], [-47.67, 18], [-27.33, 18]] : [[-59, 25], [-16, 25], [-59, 50], [-16, 50]];
      for (const [x, z] of gates) {
        const o = g.spawnOfficer(x, z, Math.atan2(-35 - x, 32 - z), null);
        o.forceHostile = true; o.missionTarget = true;
      }
    },
    onKill(g, m, o) {
      if (!o.missionTarget) return;
      m.killed++;
      m.objective(`Defeat the police raid: ${m.killed} / ${m.total}`);
      if (m.killed === 4 && m.wave === 1) { g.say([['RAVI', 'More are coming from the back lanes!']]); this.wave(g, m, 2); }
      if (m.killed >= m.total) {
        g.say([['RAVI', 'That is all of them. Now we MUST leave this city!']]);
        setTimeout(() => { if (g.mission === m) m.pass(g.player.health > 70 ? 3 : g.player.health > 35 ? 2 : 1); }, 1500);
      }
    },
    update(g, m, dt) {
      // Ravi shoots at the closest officer he can see.
      const r = g.ravi;
      if (!r) return;
      m.raviT = (m.raviT ?? 1.5) - dt;
      if (m.raviT <= 0) {
        m.raviT = 1.2 + Math.random() * 0.6;
        let best = null, bd = 28;
        for (const o of g.officers) {
          if (o.dead) continue;
          const d = dist(r.x, r.z, o.x, o.z);
          if (d < bd && !g.world.segmentBlocked(r.x, r.z, o.x, o.z)) { bd = d; best = o; }
        }
        if (best) {
          r.faceTarget = best;
          const from = new THREE.Vector3(r.x, 1.45, r.z), to = new THREE.Vector3(best.x, 1.2, best.z);
          g.fx.muzzle(from.clone().lerp(to, 0.03));
          g.fx.tracer(from, to, 0.7);
          g.audio.gunshot('pistol', 0.7);
          if (Math.random() < 0.3) { best.takeDamage(34, false, r.x, r.z); if (best.dead) this.onKill(g, m, best); }
        }
      }
    },
  },
  {
    id: 5, title: 'Getaway',
    brief: 'Three stars and the whole police force is coming. Get to the getaway car and lose them!',
    goal: 'Reach the car and lose 3 stars within 3:00', reward: 1500,
    start(g, m) {
      g.placePlayer(-35, 30, Math.PI);
      g.player.giveWeapon('smg', 90);
      g.ravi = spawnRavi(g);
      const car = g.spawnParkedCar('suv', 0x1d1e22, GETAWAY_CAR.x, GETAWAY_CAR.z, GETAWAY_CAR.yaw);
      car.missionCar = true;
      m.car = car;
      m.step = 0;
      g.say([['RAVI', 'The black SUV is outside on the main road. GO! I will meet you in the next city.']]);
      m.objective('Get to the black getaway car (yellow marker)');
      m.marker(GETAWAY_CAR.x, GETAWAY_CAR.z, 4);
      m.timer(180);
      setTimeout(() => { if (g.mission === m) g.dispatch.setStars(3); }, 1500);
    },
    update(g, m) {
      if (m.step === 0 && g.player.inCar && g.driving.car === m.car) {
        m.step = 1; m.marker(null);
        m.objective('Lose the police! Get out of the red search circle and stay out of sight');
      }
      if (m.step === 1 && g.dispatch.stars === 0 && g.player.inCar) {
        m.pass(m.elapsed < 90 ? 3 : m.elapsed < 140 ? 2 : 1, true);
      }
    },
  },
];

// Runs one mission: timer, objective text, marker, pass / fail.
export class MissionRunner {
  constructor(game, def) {
    this.game = game; this.def = def;
    this.elapsed = 0; this.timeLeft = null; this.done = false;
    this.objectiveText = ''; this.markerPos = null;
  }
  objective(text) { this.objectiveText = text; this.game.hud.setObjective(text); }
  marker(x, z, r) { this.markerPos = x === null ? null : { x, z, r }; this.game.setMarker(this.markerPos); }
  timer(sec) { this.timeLeft = sec; }
  onKill(o) { if (this.def.onKill) this.def.onKill(this.game, this, o); }
  onEnterCar(c) { if (this.def.onEnterCar) this.def.onEnterCar(this.game, this, c); }

  start() { this.def.start(this.game, this); }

  update(dt) {
    if (this.done) return;
    if (this.game.mode === 'play') this.elapsed += dt;
    if (this.timeLeft !== null && this.game.mode === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.fail('Time is up'); return; }
    }
    this.def.update(this.game, this, dt);
  }

  pass(stars, chapterDone = false) {
    if (this.done) return;
    this.done = true;
    this.game.missionPassed(this.def, stars, chapterDone);
  }

  fail(reason) {
    if (this.done) return;
    this.done = true;
    this.game.missionFailed(this.def, reason);
  }
}
