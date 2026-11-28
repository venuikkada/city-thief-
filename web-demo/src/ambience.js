// City life you can hear - v9.9: a CLEAN mix, like GTA / PUBG (v9.8 was too noisy: honking and
// crowd chatter all the time).
//   Under everything : soft open air, plus a far-away city wash (no horns in it) that grows near busy
//                      roads. Birds by day, crickets at night, the sea on Marine Drive.
//   Things you see   : the two nearest moving cars hum as they go past (left / right, near / far, autos
//                      buzz high, trucks rumble low); a car you stand in front of honks now and then
//                      (traffic.js).
//   Now and then     : one far-away horn, a crow, a dog at night, a temple bell, police radio near cops.
//   Inside a shop    : the street goes muffled, a ceiling fan hums.
// Gunshots, explosions and people talking push this background down for a moment, so the action is
// always clear. Real recordings (CC0, see assets/sfx/CREDITS.txt); until they have loaded (or if a file
// is missing) the old made-in-code sounds play. Everything follows Vikram (or the camera, on the menu).
import { dist } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);
// Engine pitch of passing traffic per vehicle type.
const CAR_PITCH = { auto: 1.3, truck: 0.72, bus: 0.75, van: 0.95, ambulance: 1, suv: 0.9, police: 1, sports: 1.1, taxi: 1.05 };
const CAR_HEAR = 30;   // metres: passing cars are heard this far

export class Ambience {
  constructor(game) { this.game = game; this.ready = false; this.timers = { horn: 10, bird: 2, crow: 12, dog: 15, radio: 6, bell: 45 }; this.duckK = 1; }

  init() {
    const A = this.game.audio, ctx = A.ctx;
    this.A = A; this.ctx = ctx;
    // The outside world: one gain that action pushes down (ducking), then one low-pass (muffled inside a shop).
    this.out = ctx.createGain(); this.out.gain.value = 1;
    this.duckG = ctx.createGain(); this.duckG.gain.value = 1;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 16000;
    this.out.connect(this.duckG).connect(this.muffle).connect(A.master);
    // 4 s of soft (pink-ish) noise for the made-in-code layers.
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.03; b1 = 0.96 * b1 + w * 0.07; b2 = 0.6 * b2 + w * 0.2; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
    this.pink = buf;
    const loop = (filterType, freq, q, dest) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 3);
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      s.connect(f).connect(dest); return f;
    };
    // Sea waves: deep noise that swells and falls.
    this.sea = ctx.createGain(); this.sea.gain.value = 0; this.sea.connect(this.out);
    const swell = ctx.createGain(); swell.gain.value = 0.5; loop('lowpass', 520, 0.7, swell); swell.connect(this.sea);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.085; const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg).connect(swell.gain); lfo.start();
    // Crickets: a high chirp, pulsing fast inside a slower rhythm.
    this.crick = ctx.createGain(); this.crick.gain.value = 0; this.crick.connect(this.out);
    const co = ctx.createOscillator(); co.frequency.value = 4450; const cg = ctx.createGain(); cg.gain.value = 0;
    const cp = ctx.createOscillator(); cp.type = 'square'; cp.frequency.value = 17; const cpg = ctx.createGain(); cpg.gain.value = 0.5;
    const cs = ctx.createOscillator(); cs.type = 'square'; cs.frequency.value = 0.9; const csg = ctx.createGain(); csg.gain.value = 0.5;
    cp.connect(cpg).connect(cg.gain); cs.connect(csg).connect(cg.gain);
    co.connect(cg).connect(this.crick); co.start(); cp.start(); cs.start();
    // Ceiling fan inside shops: a low hum with a soft whoosh each turn (not muffled: it is in the room).
    this.fan = ctx.createGain(); this.fan.gain.value = 0; this.fan.connect(A.master);
    const fo = ctx.createOscillator(); fo.frequency.value = 96; const fog = ctx.createGain(); fog.gain.value = 0.35; fo.connect(fog).connect(this.fan); fo.start();
    const whoosh = ctx.createGain(); whoosh.gain.value = 0.5; loop('lowpass', 700, 0.8, whoosh); whoosh.connect(this.fan);
    const wl = ctx.createOscillator(); wl.frequency.value = 3.6; const wlg = ctx.createGain(); wlg.gain.value = 0.45; wl.connect(wlg).connect(whoosh.gain); wl.start();
    this.ready = true;
  }

  // ---------- One-shot sounds (with left / right from where they are) ----------
  panner(pan, vol) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = vol;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(this.out); }
    else g.connect(this.out);
    return g;
  }
  tone(type, f0, f1, t, dur, vol, dest, attack = 0.01) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noise(t, dur, vol, type, f, q, dest) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.pink;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
  }
  // Pan of a point in the world as heard from the camera (-1 left .. 1 right) and its distance.
  where(x, z) {
    const c = this.game.camera, cp = c.position;
    c.getWorldDirection(this._d || (this._d = c.position.clone()));
    const fl = Math.hypot(this._d.x, this._d.z) || 1, fx = this._d.x / fl, fz = this._d.z / fl;
    const dx = x - cp.x, dz = z - cp.z, d = Math.hypot(dx, dz) || 1;
    return { pan: (dx * -fz + dz * fx) / d, d };
  }

  // Real recordings (when loaded): the steady layers, and two "passing car" voices (the engine
  // recording, softened and placed where the car is).
  samples() {
    const A = this.A, ctx = this.ctx;
    if (this.smp || !A.samplesReady) return this.smp;
    const L = (n) => A.loop(n, this.out);
    this.smp = { city: L('amb_city'), calm: L('amb_calm'), birds: L('amb_birds'), crickets: L('amb_crickets'), sea: L('amb_sea') };
    this.carV = [];
    for (let k = 0; k < 2 && A.has('engine'); k++) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      let pan = null;
      if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); lp.connect(pan).connect(this.out); } else lp.connect(this.out);
      const l = A.loop('engine', lp, 'traffic' + k);
      if (l) this.carV.push({ l, lp, pan, car: null, freeAt: 0 });
    }
    return this.smp;
  }
  // The nearest moving cars hum as they pass. A voice stays with its car; a new car only takes a
  // voice that has already faded out (so nothing jumps).
  traffic(px, pz, on, now) {
    const V = this.carV;
    if (!V || !V.length) return;
    let a = null, b = null, da = CAR_HEAR, db = CAR_HEAR;
    if (on) {
      for (const c of this.game.cars) {
        if (c.inactive || c.parked || c.playerControlled || c.wrecked || c.exploded || !(c.speed > 1.5)) continue;
        const d = Math.abs(c.x - px) + Math.abs(c.z - pz) < CAR_HEAR * 1.5 ? Math.hypot(c.x - px, c.z - pz) : CAR_HEAR;
        if (d < da) { b = a; db = da; a = c; da = d; } else if (d < db) { b = c; db = d; }
      }
    }
    const near = [a, b].filter(Boolean);
    for (const v of V) if (v.car && !near.includes(v.car)) { v.car = null; v.freeAt = now + 0.6; v.l.g.gain.setTargetAtTime(0, now, 0.12); }
    for (const c of near) {
      if (V.some((v) => v.car === c)) continue;
      const f = V.find((v) => !v.car && now >= v.freeAt);
      if (f) { f.car = c; f.snap = true; }
    }
    for (const v of V) {
      const c = v.car;
      if (!c) continue;
      const w = this.where(c.x, c.z), k = Math.max(0, 1 - w.d / CAR_HEAR), sp = Math.min(1, c.speed / 14);
      const rate = (0.55 + 0.5 * sp) * (CAR_PITCH[c.type] || 1), tc = v.snap ? 0.005 : 0.15;
      v.l.src.playbackRate.setTargetAtTime(rate, now, tc);
      v.lp.frequency.setTargetAtTime(450 + 1400 * k, now, tc);
      if (v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, w.pan * 0.85)), now, v.snap ? 0.005 : 0.1);
      v.l.g.gain.setTargetAtTime(0.2 * k * k * (0.45 + 0.55 * sp), now, 0.15);
      v.snap = false;
    }
  }
  horn(x, z) {   // one horn far away (a car you block honks from traffic.js)
    const { pan, d } = this.where(x, z), v = 0.05 * Math.max(0, 1 - d / 90);
    if (v < 0.006) return;
    // A real horn, muffled by the distance, pitched up for small cars and autos, down for trucks.
    if (this.A.play('horn', { vol: v * 4, pan, dest: this.out, rate: Math.random() < 0.15 ? rnd(0.7, 0.8) : rnd(0.92, 1.25), vary: 0.02, lp: 900 + 4000 * Math.max(0, 1 - d / 90) })) return;
    const t = this.ctx.currentTime, out = this.panner(pan, 1), kind = Math.random();
    if (kind < 0.25) {   // auto-rickshaw: "pom pom" rubber horn
      for (let k = 0; k < 2; k++) this.tone('square', 330, 250, t + k * 0.2, 0.16, v * 0.8, out, 0.005);
    } else if (kind < 0.37) {   // truck: long low blast
      this.tone('sawtooth', 210, 205, t, 0.75, v * 0.75, out, 0.03); this.tone('sawtooth', 262, 258, t, 0.75, v * 0.5, out, 0.03);
    } else {   // car: two quick beeps
      const f = rnd(390, 520);
      for (let k = 0; k < 2; k++) { this.tone('square', f, f, t + k * 0.17, 0.12, v * 0.6, out, 0.004); this.tone('square', f * 1.26, f * 1.26, t + k * 0.17, 0.12, v * 0.35, out, 0.004); }
    }
  }
  bird() {
    const t = this.ctx.currentTime, out = this.panner(rnd(-0.9, 0.9), 1), n = 2 + Math.floor(Math.random() * 4), f = rnd(2800, 5200);
    for (let k = 0; k < n; k++) this.tone('sine', f * rnd(0.9, 1.15), f * rnd(1.15, 1.5), t + k * rnd(0.07, 0.13), rnd(0.04, 0.09), 0.012, out, 0.004);
  }
  crow() {   // the Indian city crow: a harsh "kaa kaa"
    if (this.A.play('crow', { vol: rnd(0.06, 0.11), pan: rnd(-0.9, 0.9), dest: this.out, vary: 0.08, lp: 7000 })) return;
    const t = this.ctx.currentTime, out = this.panner(rnd(-0.9, 0.9), 1), n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const s = t + k * 0.42;
      this.tone('sawtooth', 560, 410, s, 0.3, 0.018, out, 0.02);
      this.noise(s, 0.28, 0.008, 'bandpass', 1300, 3, out);
    }
  }
  dog() {
    if (this.A.play('dog', { vol: rnd(0.05, 0.09), pan: rnd(-1, 1), dest: this.out, vary: 0.1, lp: 3500 })) return;
    const t = this.ctx.currentTime, out = this.panner(rnd(-1, 1), 1), n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) { const s = t + k * rnd(0.32, 0.5); this.tone('sawtooth', 340, 180, s, 0.16, 0.012, out, 0.006); this.noise(s, 0.12, 0.012, 'lowpass', 900, 1, out); }
  }
  bell() {   // temple bells far away
    if (this.A.play('bell', { vol: 0.07, pan: rnd(-0.8, 0.8), dest: this.out, vary: 0.04, lp: 5000 })) return;
    const t = this.ctx.currentTime, out = this.panner(rnd(-0.8, 0.8), 1);
    for (const [f, v] of [[640, 0.014], [1690, 0.008], [3080, 0.004]]) this.tone('sine', f, f, t, 2.6, v, out, 0.003);
  }
  radio(x, z) {   // police radio: click, crackly voice, beep
    const { pan, d } = this.where(x, z), v = 0.035 * Math.max(0, 1 - d / 25);
    if (v < 0.004) return;
    if (this.A.has('radio')) {   // a real police radio: chirp, voices
      this.A.play('radio_chirp', { vol: v * 4, pan, dest: this.out });
      this.A.play('radio', { vol: v * 5, pan, dest: this.out, when: 0.12, vary: 0.04 });
      return;
    }
    const t = this.ctx.currentTime, out = this.panner(pan, 1), len = rnd(0.8, 1.7);
    this.tone('square', 1350, 1350, t, 0.07, v * 0.5, out, 0.002);
    for (let s = 0.09; s < len; s += rnd(0.09, 0.16)) this.noise(t + s, rnd(0.06, 0.12), v * rnd(0.5, 1), 'bandpass', rnd(1400, 2600), 4, out);
    this.tone('square', 980, 980, t + len + 0.05, 0.09, v * 0.5, out, 0.002);
  }

  // ---------- Every frame ----------
  update(dt) {
    const g = this.game, A = g.audio;
    if (!A.enabled) return;
    if (!this.ready) this.init();
    const P = g.player, menu = g.mode === 'menu' || g.mode === 'result';
    const px = menu ? g.camera.position.x : P.x, pz = menu ? g.camera.position.z : P.z;
    const night = g.atmo ? g.atmo.cur.night : 0, rain = g.atmo ? g.atmo.cur.rain : 0, inside = !!g.indoors && !menu;
    const now = this.ctx.currentTime, T = (x, v) => x.gain.setTargetAtTime(v, now, 0.4);
    // Muffle the street inside shops; the fan hums.
    this.muffle.frequency.setTargetAtTime(inside ? 650 : 16000, now, 0.25);
    T(this.fan, inside ? 0.045 : 0);
    // Ducking: a gunshot / blast (audio.duck) or someone talking pushes the background down for a
    // moment - fast down, slowly back up.
    const talk = g.voice && g.voice.enabled !== false && g.voice.speaking ? 0.4 : 0;
    const duck = 1 - Math.max(talk, A.duckLevel ? A.duckLevel(now) : 0);
    if (Math.abs(duck - this.duckK) > 0.002) { this.duckG.gain.setTargetAtTime(duck, now, duck < this.duckK ? 0.03 : 0.6); this.duckK = duck; }
    const seaK = Math.max(0, Math.min(1, (-205 - pz) / 25));
    const S = this.samples();
    if (S) {
      // Soft open air everywhere, the far-away city wash (louder near busy roads, quieter at night,
      // by the sea and in the rain), birds by day (fewer on busy roads), crickets at night, the sea.
      let cars = 0;
      if (!menu) for (const c of g.cars) if (!c.inactive && !c.parked && Math.abs(c.x - px) < 60 && Math.abs(c.z - pz) < 60) cars++;
      const busy = Math.min(1, cars / 14);
      if (S.city) T(S.city.g, (0.045 + 0.085 * busy) * (1 - night * 0.3) * (1 - seaK * 0.6) * (1 - rain * 0.5));
      if (S.calm) T(S.calm.g, 0.065 * (1 - rain * 0.6));
      if (S.birds) T(S.birds.g, night < 0.5 && rain < 0.3 ? 0.05 * (1 - busy * 0.5) : 0);
      if (S.crickets) T(S.crickets.g, night > 0.5 && rain < 0.3 ? 0.09 : 0);
      if (S.sea) T(S.sea.g, 0.3 * seaK);
      T(this.sea, 0); T(this.crick, 0);
      if (A.ambience) A.ambience.gain.setTargetAtTime(inside ? 0.015 : 0.03, now, 0.4);   // the old rumble only fills in under it
      this.traffic(px, pz, !menu && !inside, now);
    } else {
      if (A.ambience) A.ambience.gain.setTargetAtTime(inside ? 0.07 : 0.16, now, 0.4);
      T(this.sea, 0.1 * seaK);   // sea waves near Marine Drive and the beach
      T(this.crick, night > 0.5 && rain < 0.3 ? 0.01 : 0);   // crickets at night (not in the rain)
    }
    // Now and then (rare: a clean mix, not a noisy one).
    const tm = this.timers;
    for (const k of Object.keys(tm)) tm[k] -= dt;
    if (tm.horn <= 0) {   // one horn far away
      tm.horn = rnd(14, 30);
      let pick = null;
      if (!inside) for (const c of g.cars) { if (c.inactive || c.parked || c.playerControlled) continue; const d = dist(c.x, c.z, px, pz); if (d > 25 && d < 90 && (!pick || Math.random() < 0.3)) pick = c; }
      if (pick) this.horn(pick.x, pick.z);
    }
    if (tm.bird <= 0) { tm.bird = rnd(3, 8); if (night < 0.5 && rain < 0.3 && !inside && !S) this.bird(); }
    if (tm.crow <= 0) { tm.crow = rnd(16, 38); if (night < 0.5 && rain < 0.3 && !inside) this.crow(); }
    if (tm.dog <= 0) { tm.dog = rnd(22, 50); if (night > 0.5 && !inside) this.dog(); }
    if (tm.bell <= 0) { tm.bell = rnd(70, 150); if (!inside && rain < 0.3) this.bell(); }
    if (tm.radio <= 0) {   // police radio, only close to a cop
      tm.radio = rnd(9, 18);
      let o = null, bd = 25;
      if (!menu) for (const q of g.officers) { if (q.dead || q.inactive || q.gang) continue; const d = dist(q.x, q.z, px, pz); if (d < bd) { bd = d; o = q; } }
      if (o) this.radio(o.x, o.z);
    }
  }
}
