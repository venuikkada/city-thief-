// NAVAPUR DIRECTOR (v9.6) - the city itself makes something crazy happen every minute or so in
// free roam, like a film director: calm -> trouble -> relief -> calm again. It watches Vikram
// (wanted stars, health, a fight going on) and waits when he is already busy. Each event pays.
//   CHAIN SNATCHER  a thief grabs a woman's chain and runs - sprint after him and tackle him
//   SHOP ROBBERY    Kaali's boys are robbing a shop (gas cylinders next to them...) - stop them
//   GOLD VAN        an armoured van full of gold drives past - wreck it, grab the cash (police come)
//   RUNAWAY TANKER  a burning tanker races towards the market - blow it up before it gets there
import * as K from './mkit.js';
import { dist, pick, yawOf } from './util.js';

const CALM = [45, 75];        // seconds of quiet between events
const NAMES = { snatch: 'CHAIN SNATCHER!', gang: 'ROBBERY IN PROGRESS!', van: 'GOLD VAN!', tanker: 'RUNAWAY TANKER!' };

export class Director {
  constructor(g, missionCar) {
    this.g = g; this.missionCar = missionCar;
    this.wait = 25; this.ev = null; this.last = '';
    // A pretend mission that owns the event's people and cars (so they are cleaned up).
    this.owner = { vars: {}, ents: [], track: (e) => { if (e) this.owner.ents.push(e); return e; }, act: 0, def: {}, objective() {}, marker() {} };
  }

  // Free roam only, and only when nothing else is going on.
  get quiet() {
    const g = this.g, P = g.player;
    return g.mode === 'play' && !g.mission && !P.dead && g.dispatch.stars < 2 && !g.indoors && !(g.dispatch.arrestT > 0);
  }

  update(dt) {
    const g = this.g;
    if (g.mission || g.mode !== 'play') { if (this.ev) this.end(false, true); return; }
    if (this.ev) { this.tick(dt); return; }
    if (!this.quiet) { this.wait = Math.max(this.wait, 12); return; }
    if ((this.wait -= dt) > 0) return;
    this.start();
  }

  start() {
    const g = this.g, P = g.player;
    const pool = P.inCar ? ['van', 'tanker', 'gang', 'snatch'] : ['snatch', 'gang', 'van', 'snatch', 'gang'];
    let kind = pick(pool);
    if (kind === this.last) kind = pick(pool.filter((k) => k !== this.last));
    const ok = this['start_' + kind]();
    if (!ok) { this.wait = 8; return; }
    this.last = kind;
    g.hud.showBig(NAMES[kind], '#ff7a2a', 1.8);
    g.music.setLevel(3);
  }

  // A free spot 25-45 m away (not inside a building), towards where he is going if possible.
  spotNear(r0, r1) {
    const g = this.g, P = g.player, nav = g.nav;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (nav.spawnOk(nav.idx(x, z)) && !g.world.insideBlock(x, z)) return { x, z };
    }
    return null;
  }

  // ---------- CHAIN SNATCHER ----------
  start_snatch() {
    const g = this.g, P = g.player;
    const s = this.spotNear(22, 38); if (!s) return false;
    const lady = K.person(g, this.owner, s.x + 1.2, s.z, 0, 'f_salwar', { gesture: 'cheer' });
    lady.calm = true;
    const thief = K.person(g, this.owner, s.x, s.z, 0, 'm_hoodie');
    thief.health = 60; thief.state = 'flee'; thief.fleeT = 999; thief.calm = false;
    this.ev = { kind: 'snatch', t: 40, thief, lady };
    g.interact.sayL(lady, 'caught', ['CHOR! CHOR! Meri chain!'], 'alarm');
    g.hud.toast('Catch the chain snatcher before he gets away! Sprint!');
    if (g.voice) g.voice.sayLine('VIKRAM', 'caught', ['Oye! Ruk ja!'], { prio: 2 });
    return true;
  }
  tick_snatch(dt) {
    const g = this.g, P = g.player, e = this.ev, th = e.thief;
    th.dangerX = P.x; th.dangerZ = P.z; th.fleeT = 999;   // keeps running away from Vikram
    g.pins = [{ x: th.x, z: th.z, color: '#ff5a4d' }];
    if (th.dead) return this.end(true, false, 'SNATCHER STOPPED', 400);
    if (dist(P.x, P.z, th.x, th.z) < 1.7 && !P.inCar) {
      th.state = 'cower'; th.cowerT = 99; th.rig.die(th.x - P.x, th.z - P.z);
      g.slowmo(0.8, 0.35); g.audio.thump(0.5, 90, 0.2); g.audio.bodyfall(1);
      g.hud.showBig('TACKLED!', '#ffc531', 1.4);
      return this.end(true, false, 'CHAIN RETURNED - HERO OF NAVAPUR', 600);
    }
    if (dist(P.x, P.z, th.x, th.z) > 90) return this.end(false, false, 'He got away...');
    return null;
  }

  // ---------- SHOP ROBBERY (Kaali's boys) ----------
  start_gang() {
    const g = this.g;
    const s = this.spotNear(30, 55); if (!s) return false;
    const n = 3 + Math.floor(Math.random() * 2);
    const pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, x = s.x + Math.cos(a) * 3.5, z = s.z + Math.sin(a) * 3.5; if (g.nav.spawnOk(g.nav.idx(x, z))) pts.push([x, z]); }
    if (pts.length < 2) return false;
    const men = K.thugs(g, this.owner, pts, { group: 'dirGang' });
    for (const o of men) { o.forceHostile = false; o.engaged = false; o.post = { x: o.x, z: o.z, yaw: 0 }; o.health = o.maxHealth = 90; }
    this.ev = { kind: 'gang', t: 75, men, s, alert: false };
    g.hud.toast("Kaali's boys are robbing a shop! Stop them (a gas cylinder helps...)");
    return true;
  }
  tick_gang() {
    const g = this.g, P = g.player, e = this.ev;
    const left = e.men.filter((o) => !o.dead);
    g.pins = left.map((o) => ({ x: o.x, z: o.z, color: '#ff5a4d' }));
    if (!e.alert && dist(P.x, P.z, e.s.x, e.s.z) < 26) { e.alert = true; for (const o of left) o.alert ? o.alert() : (o.forceHostile = true, o.engaged = true); }
    if (!left.length) return this.end(true, false, 'ROBBERY STOPPED', 900);
    if (dist(P.x, P.z, e.s.x, e.s.z) > 160) return this.end(false, false, 'The robbers got away...');
    return null;
  }

  // ---------- GOLD VAN ----------
  start_van() {
    const g = this.g, P = g.player;
    if (!this.missionCar) return false;
    const a = Math.random() * Math.PI * 2;
    const van = this.missionCar(g, this.owner, 'van', 0xe8e2d0, { mode: 'flee', health: 260, hostile: true, fastBurn: true, speed: 17 },
      { node: true, x: P.x + Math.cos(a) * 60, z: P.z + Math.sin(a) * 60, hx: -Math.cos(a), hz: -Math.sin(a) });
    if (!van) return false;
    this.ev = { kind: 'van', t: 70, van, hit: false };
    g.hud.toast('A gold van! Wreck it and grab the gold before it escapes (the police will come)');
    if (g.voice) g.voice.sayLine('VIKRAM', 'lull', ['Gold van! Today is my lucky day.'], { prio: 2 });
    return true;
  }
  tick_van() {
    const g = this.g, P = g.player, e = this.ev, v = e.van;
    g.pins = [{ x: v.x, z: v.z, color: '#ffc531' }];
    if (!e.hit && v.health < 260) { e.hit = true; if (g.dispatch.stars < 1) g.dispatch.setStars(1, v.x, v.z); }
    if (v.wrecked || v.exploded) {
      for (let k = 0; k < 4; k++) g.pickups.spawn('cash', v.x + (Math.random() - 0.5) * 5, v.z + (Math.random() - 0.5) * 5, { value: 400 });
      g.hud.showBig('GOLD!', '#ffc531', 1.6);
      return this.end(true, false, 'GOLD VAN WRECKED - GRAB THE CASH', 300);
    }
    if (dist(P.x, P.z, v.x, v.z) > 170) return this.end(false, false, 'The gold van got away...');
    return null;
  }

  // ---------- RUNAWAY TANKER (on fire, heading for the market) ----------
  start_tanker() {
    const g = this.g, P = g.player;
    if (!this.missionCar) return false;
    const a = Math.random() * Math.PI * 2;
    const tk = this.missionCar(g, this.owner, 'truck', 0xd9d9d9, { mode: 'flee', health: 200, hostile: true, fastBurn: true, speed: 15 },
      { node: true, x: P.x + Math.cos(a) * 70, z: P.z + Math.sin(a) * 70, hx: -Math.cos(a), hz: -Math.sin(a) });
    if (!tk) return false;
    this.ev = { kind: 'tanker', t: 45, tk };
    g.hud.toast('A burning tanker is racing to the market! Blow it up before it gets there! 45s');
    return true;
  }
  tick_tanker() {
    const g = this.g, e = this.ev, tk = e.tk;
    g.pins = [{ x: tk.x, z: tk.z, color: '#ff7a2a' }];
    if (Math.random() < 0.3) g.fx.smoke ? g.fx.smoke(tk.x, (tk.y || 0) + 2.2, tk.z) : null;
    if (tk.wrecked || tk.exploded) { g.slowmo(1, 0.3); return this.end(true, false, 'MARKET SAVED!', 1000); }
    if (e.t <= 0) {   // it reached the market
      tk.takeDamage(9999, false);
      return this.end(false, false, 'BOOM... the tanker reached the market');
    }
    return null;
  }

  tick(dt) {
    const e = this.ev;
    e.t -= dt;
    const r = this['tick_' + e.kind](dt);
    if (r === null && this.ev && this.ev.t <= 0 && e.kind !== 'tanker') this.end(false, false, 'Too slow...');
    if (this.ev) this.g.hud.setClock(`${NAMES[e.kind]} ${Math.max(0, Math.ceil(e.t))}s`);
  }

  end(won, quiet, text, cash = 0) {
    const g = this.g;
    g.pins = [];
    g.hud.setClock('');
    if (!quiet) {
      if (won) { g.hud.toast(text); if (g.rewards) g.rewards.event(text.split(' - ')[0], cash, 20); }
      else g.hud.toast(text);
    }
    g.music.setLevel(g.dispatch.stars ? 2 : 0);
    // People and cars from the event fade out later (the city's recycler takes them when far away).
    const old = this.owner.ents; this.owner.ents = [];
    setTimeout(() => { for (const x of old) { if (x.isCar) { if (!x.playerControlled && this.g.removeCar) this.g.removeCar(x); } else if (x.remove && !x.removed) x.remove(); } }, 25000);
    this.ev = null;
    this.wait = CALM[0] + Math.random() * (CALM[1] - CALM[0]);
    return true;
  }

  // A mission or the menu starts: no event left over.
  reset() {
    if (this.ev) this.end(false, true);
    for (const x of this.owner.ents) { if (x.isCar) { if (!x.playerControlled) this.g.removeCar(x); } else if (x.remove && !x.removed) x.remove(); }
    this.owner.ents = []; this.wait = 25;
  }
}
