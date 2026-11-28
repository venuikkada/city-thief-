// Game sound.
// v9.8: REAL RECORDINGS - gunshots of real guns (9mm pistol, AR-15, AK-47, 20-gauge shotgun, a big
// hunting rifle), footsteps on stone, tiles, sand and water, punches, reloads, explosions, car crashes,
// tyres, horns, a police siren, a helicopter, a calm far-away city hum, temple bells,
// crows... (all CC0 from freesound.org - see assets/sfx/CREDITS.txt). They play through a small mixer:
// an echo off the street walls for shots and explosions, a little random pitch so no two sounds are
// exactly the same, left / right from where things happen. Until the files have loaded (or if one is
// missing) the old sounds made in code still play.
// v9.9: a CLEAN mix like GTA / PUBG - gunshots and blasts push the background down for a moment
// (duck), car horns are rare, footsteps and guns are up front.
import { SFX_LIST } from './sfxlist.js';

const GUN_SAMPLE = { pistol: 'gun_pistol', gold: 'gun_gold', smg: 'gun_smg', rifle: 'gun_rifle', dmr: 'gun_dmr', sniper: 'gun_sniper', shotgun: 'gun_shotgun' };
const GUN_VOL = { pistol: 0.8, gold: 0.85, smg: 0.62, rifle: 0.78, dmr: 0.85, sniper: 1, shotgun: 0.95 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.buf = {}; this.lastVar = {}; this.lastShot = {}; this.loops = {};
  }

  // ---------- Recorded sounds ----------
  // Load every sound file (in the background; the game does not wait for it).
  loadSamples() {
    const ctx = this.ctx;
    const decode = (ab) => new Promise((res, rej) => { const r = ctx.decodeAudioData(ab, res, rej); if (r && r.catch) r.catch(rej); });
    const jobs = [];
    for (const [name, [files]] of Object.entries(SFX_LIST)) {
      files.forEach((f, k) => jobs.push(fetch('assets/sfx/' + f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(f)))).then(decode)
        .then((b) => { (this.buf[name] || (this.buf[name] = []))[k] = b; }).catch(() => {})));
    }
    return Promise.all(jobs).then(() => {
      for (const n of Object.keys(this.buf)) this.buf[n] = this.buf[n].filter(Boolean);
      this.samplesReady = true;
      this.startLoops();
    });
  }
  has(name) { const l = this.buf[name]; return !!(l && l.length); }

  // The street echo: a short burst of reflections off the buildings, then a soft tail.
  makeReverb() {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 1.5), ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (const [ms, a] of [[17, 0.55], [29, 0.42], [43, 0.33], [61, 0.25], [83, 0.18], [112, 0.13], [151, 0.09]]) {
        const i = Math.floor((ms + (ch ? 4 : 0) + Math.random() * 5) * sr / 1000);
        if (i < len) d[i] += a * (Math.random() < 0.5 ? -1 : 1);
      }
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, n = (Math.random() * 2 - 1) * Math.exp(-t * 3.4) * 0.3 * Math.min(1, t / 0.012);
        lp += (n - lp) * Math.max(0.06, 0.55 * Math.exp(-t * 1.8));   // darker as it fades
        d[i] += lp;
      }
    }
    const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = ir;
    this.reverbIn = ctx.createGain(); this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.5;
    this.reverbIn.connect(conv).connect(this.reverbOut).connect(this.master);
  }

  // Play a recording. o: { vol, rate, vary (random pitch), pan (-1..1), lp (Hz), wet (echo 0..1), dest, when }
  play(name, o = {}) {
    if (!this.enabled) return null;
    const list = this.buf[name];
    if (!list || !list.length) return null;
    const ctx = this.ctx, t = ctx.currentTime + (o.when || 0);
    let k = Math.floor(Math.random() * list.length);
    if (list.length > 1 && k === this.lastVar[name]) k = (k + 1) % list.length;   // never the same one twice in a row
    this.lastVar[name] = k;
    const src = ctx.createBufferSource(); src.buffer = list[k];
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary ?? 0.06));
    let node = src;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    const g = ctx.createGain(); g.gain.value = o.vol ?? 1; node.connect(g); node = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); node.connect(p); node = p; }
    node.connect(o.dest || this.master);
    if (o.wet && this.reverbIn) { const sg = ctx.createGain(); sg.gain.value = o.wet; g.connect(sg).connect(this.reverbIn); }
    src.start(t);
    return { src, g };
  }

  // A recording that loops (engine, siren, rain...): returns { src, g } with the volume at 0.
  // key: a second copy of the same recording (e.g. the engine for passing traffic).
  loop(name, dest, key = name) {
    const list = this.buf[name];
    if (!list || !list.length || this.loops[key]) return this.loops[key] || null;
    const ctx = this.ctx, lp = SFX_LIST[name][1], src = ctx.createBufferSource();
    src.buffer = list[0]; src.loop = true;
    if (lp) { src.loopStart = lp[0]; src.loopEnd = lp[1]; }
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g).connect(dest || this.master);
    src.start(0, lp ? lp[0] + Math.random() * (lp[1] - lp[0]) : 0);
    return (this.loops[key] = { src, g });
  }
  // Push the background (street, birds, sea...) down for a moment, so gunshots and blasts stay clear.
  // amount 0..1, hold in seconds (ambience.js does the fading).
  duck(amount, hold) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!(t < this.duckEnd)) this.duckAmt = 0;
    this.duckAmt = Math.max(this.duckAmt, amount);
    this.duckEnd = Math.max(this.duckEnd || 0, t + hold);
  }
  duckLevel(t) { return t < (this.duckEnd || 0) ? this.duckAmt : 0; }
  startLoops() {
    // Car engine (rev = speed of the recording), siren, helicopter, tyres: ready, volume 0.
    const e = this.loop('engine');
    if (e) {
      this.engFilter2 = this.ctx.createBiquadFilter(); this.engFilter2.type = 'lowpass'; this.engFilter2.frequency.value = 1800;
      e.g.disconnect(); e.g.connect(this.engFilter2).connect(this.master);
      if (this.engGain) this.engGain.gain.value = 0;   // the made-in-code engine is not needed now
    }
    if (this.loop('siren') && this.siren) this.siren.disconnect();
    if (this.loop('heli') && this.heliGain) this.heliGain.disconnect();
    this.loop('screech');
  }

  // Browsers only allow sound after a tap, so this runs from the PLAY button.
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    // A soft limiter at the end: many sounds at once never crackle.
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
    this.master.connect(lim).connect(ctx.destination);

    // City rumble: filtered noise.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.ambience = ctx.createGain(); this.ambience.gain.value = 0.22;
    noise.connect(lp).connect(this.ambience).connect(this.master);
    noise.start();

    // Siren: sawtooth wave whose pitch sweeps up and down (wail).
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(osc.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
    this.siren = ctx.createGain(); this.siren.gain.value = 0;
    osc.connect(bp).connect(this.siren).connect(this.master);
    osc.start(); lfo.start();

    // Shared noise buffer for gunshots / crashes.
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // Car engine (player car): two detuned saws through a low-pass filter.
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth'; this.engOsc1.frequency.value = 45;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 45.7;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc1.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();

    // Helicopter: low noise chopped by a fast "wop-wop" rhythm.
    const hn = ctx.createBufferSource(); hn.buffer = buf; hn.loop = true;
    const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 260;
    this.heliChop = ctx.createGain(); this.heliChop.gain.value = 0.5;
    const chop = ctx.createOscillator(); chop.type = 'square'; chop.frequency.value = 13;
    const chopDepth = ctx.createGain(); chopDepth.gain.value = 0.5;
    chop.connect(chopDepth).connect(this.heliChop.gain);
    this.heliGain = ctx.createGain(); this.heliGain.gain.value = 0;
    hn.connect(hlp).connect(this.heliChop).connect(this.heliGain).connect(this.master);
    hn.start(); chop.start();

    this.enabled = true;
    this.lastHorn = 0;
    this.makeReverb();
    this.loadSamples();
  }

  // Short burst of filtered noise (used for shots, impacts, crashes).
  burst(volume, freqFrom, freqTo, length, type = 'lowpass') {
    if (!this.enabled || volume <= 0.01) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = length > 0.5;   // long rumbles loop the noise
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(freqFrom, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), now + length);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(volume, now);
    gn.gain.exponentialRampToValueAtTime(0.001, now + length);
    src.connect(f).connect(gn).connect(this.master);
    src.start(now); src.stop(now + length + 0.05);
  }

  thump(volume, freq, length) {
    if (!this.enabled || volume <= 0.01) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, now); o.frequency.exponentialRampToValueAtTime(freq * 0.4, now + length);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(volume, now); gn.gain.exponentialRampToValueAtTime(0.001, now + length);
    o.connect(gn).connect(this.master); o.start(now); o.stop(now + length + 0.05);
  }

  // Each gun has its own real recording. volume < 1 = further away: duller, more echo, plus the
  // sound of a far-off shot. Fast guns cut off the tail of their previous shot (so bursts stay clean).
  gunshot(type, volume = 1) {
    const name = GUN_SAMPLE[type] || 'gun_pistol';
    if (this.has(name) && volume > 0.02) {
      const now = this.ctx.currentTime, far = volume < 0.5, prev = this.lastShot[name];
      if (prev && now - prev.t < 0.3) prev.v.g.gain.setTargetAtTime(0, now, 0.025);
      const v = this.play(name, { vol: (GUN_VOL[type] || 0.8) * (far ? 0.45 + volume * 0.5 : volume), lp: far ? 1600 + volume * 6000 : null, wet: far ? 0.45 : 0.22, vary: 0.05 });
      if (v) this.lastShot[name] = { v, t: now };
      if (far) this.play('gun_far', { vol: 0.55 * volume + 0.1, wet: 0.35, vary: 0.08 });
      else this.thump(0.14 * volume * (type === 'smg' ? 0.6 : 1), type === 'shotgun' || type === 'sniper' ? 52 : 64, 0.12);   // a little more punch (felt in headphones)
      this.duck(far ? 0.2 * volume + 0.05 : 0.45, far ? 0.5 : 0.9);
      return;
    }
    const v = volume;
    if (type === 'smg') { this.burst(0.5 * v, 4600, 520, 0.1); this.thump(0.32 * v, 150, 0.07); }
    else if (type === 'rifle') { this.burst(0.62 * v, 5200, 380, 0.16); this.thump(0.55 * v, 95, 0.16); this.echo(0.16 * v, 0.09); }
    else if (type === 'shotgun') { this.burst(0.8 * v, 2600, 160, 0.34); this.thump(0.75 * v, 70, 0.24); this.echo(0.22 * v, 0.12); }
    else if (type === 'sniper') { this.burst(0.95 * v, 4200, 140, 0.32); this.thump(0.9 * v, 60, 0.3); this.echo(0.3 * v, 0.14); this.echo(0.16 * v, 0.42); }
    else if (type === 'dmr') { this.burst(0.72 * v, 4800, 260, 0.2); this.thump(0.65 * v, 80, 0.2); this.echo(0.2 * v, 0.11); }
    else if (type === 'gold') { this.burst(0.62 * v, 3800, 320, 0.2); this.thump(0.5 * v, 120, 0.13); this.burst(0.08 * v, 6000, 5200, 0.25, 'bandpass'); }
    else { this.burst(0.62 * v, 3600, 300, 0.2); this.thump(0.48 * v, 115, 0.13); this.echo(0.1 * v, 0.07); }
  }
  // A quieter copy a moment later (the sound bouncing off the walls of the street).
  echo(volume, delay) { if (this.enabled) setTimeout(() => this.burst(volume, 1800, 250, 0.28), delay * 1000); }
  // Magazine out, magazine in, slide / bolt pulled - played to fit the reload time.
  // kind: the gun (pistols / shotgun / sniper / the rest have their own recording).
  reload(len = 1.5, kind = 'rifle') {
    const name = kind === 'pistol' || kind === 'gold' ? 'reload_pistol' : kind === 'shotgun' ? 'pump' : kind === 'sniper' ? 'bolt' : 'reload_rifle';
    if (this.has(name)) {
      const d = this.buf[name][0].duration;
      this.play(name, { vol: 0.55, rate: clamp(d / Math.max(0.35, len * 0.8), 0.85, 1.25), vary: 0.03 });
      return;
    }
    this.burst(0.22, 2600, 1700, 0.05, 'bandpass');
    setTimeout(() => this.burst(0.3, 1600, 900, 0.07, 'bandpass'), len * 450);
    setTimeout(() => { this.burst(0.34, 3200, 1400, 0.06, 'bandpass'); this.thump(0.12, 300, 0.05); }, len * 850);
  }
  // Sniper bolt: pulled back, pushed forward. Shotgun: the pump after each shot.
  pump() { if (!this.play('pump', { vol: 0.45, vary: 0.04 })) this.bolt(); }
  // Picking something up / putting a gun away.
  pickup() { if (!this.play('holster', { vol: 0.35, vary: 0.08 })) this.equip(); }
  bolt() { if (this.play('bolt', { vol: 0.5, rate: 1.15, vary: 0.03 })) return; this.burst(0.26, 2400, 1300, 0.05, 'bandpass'); setTimeout(() => this.burst(0.3, 3400, 1900, 0.05, 'bandpass'), 210); }
  equip() { if (this.play('holster', { vol: 0.4, rate: 1.25, vary: 0.06 })) return; this.burst(0.18, 2200, 1500, 0.05, 'bandpass'); setTimeout(() => this.burst(0.2, 3000, 1800, 0.04, 'bandpass'), 120); }
  // Hit feedback: a dull thud on the body, a bright "tink" for a headshot.
  hit(head, kill) {
    this.play('body_hit', { vol: head ? 0.22 : 0.3, vary: 0.1 });
    if (head) { this.burst(0.22, 7000, 5600, 0.09, 'bandpass'); this.thump(0.15, 900, 0.05); }
    else this.thump(0.2, 220, 0.06);
    if (kill) setTimeout(() => this.thump(0.22, 160, 0.12), 60);
  }
  click() { if (!this.play('dry', { vol: 0.5, vary: 0.05 })) this.burst(0.2, 3000, 2500, 0.03, 'bandpass'); }
  ping() { if (!this.play('impact_metal', { vol: 0.35, vary: 0.2, wet: 0.1 })) this.burst(0.18, 5000, 3000, 0.08, 'bandpass'); }
  hurt() { this.thump(0.3, 90, 0.18); this.play('body_hit', { vol: 0.35, rate: 0.85, vary: 0.1 }); }
  crash(k) {
    if (this.has('crash')) { this.play(k > 0.55 ? 'crash' : 'bump', { vol: Math.min(1, 0.35 + k * 0.6), vary: 0.08, wet: 0.12 }); return; }
    this.burst(0.7 * k, 1800, 120, 0.45); this.thump(0.6 * k, 70, 0.3);
  }
  // Fists: a real punch, a swing through the air, a body hitting the ground.
  punch() { if (!this.play('punch', { vol: 0.85, vary: 0.08 })) { this.thump(0.9, 80, 0.12); this.impact(0.7); } }
  swing() { if (!this.play('swing', { vol: 0.4, vary: 0.1 })) this.burst(0.14, 900, 400, 0.12, 'bandpass'); }
  bodyfall(volume = 1) { if (volume > 0.04) this.play('bodyfall', { vol: 0.5 * volume, vary: 0.08 }); }
  land(volume = 1) { this.play('land', { vol: 0.5 * volume, vary: 0.08 }); }
  // Money: a till drawer, a coin.
  till() { this.play('till', { vol: 0.5 }); }
  coin() { this.play('coin', { vol: 0.3, vary: 0.12 }); }

  engine(on) {
    if (!this.enabled) return;
    const e = this.loops.engine;
    if (e) e.g.gain.setTargetAtTime(on ? 0.18 : 0, this.ctx.currentTime, 0.15);
    else this.engGain.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.15);
    this.engineOn = on;
  }

  // The recorded engine is played faster as the car goes faster (like a real engine revving).
  engineLevel(speed01, throttle) {
    if (!this.enabled || !this.engineOn) return;
    const t = this.ctx.currentTime, e = this.loops.engine;
    if (e) {
      e.src.playbackRate.setTargetAtTime(0.62 + speed01 * 1.05 + throttle * 0.22, t, 0.12);
      e.g.gain.setTargetAtTime(0.13 + throttle * 0.13 + speed01 * 0.08, t, 0.1);
      if (this.engFilter2) this.engFilter2.frequency.setTargetAtTime(900 + speed01 * 2600 + throttle * 1500, t, 0.1);
      return;
    }
    const f = 42 + speed01 * 120 + throttle * 18;
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(f * 1.015, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(400 + speed01 * 900 + throttle * 300, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.045 + throttle * 0.04 + speed01 * 0.03, t, 0.1);
  }

  // distance = metres to the nearest chasing police car (Infinity = none).
  update(sirenDistance) {
    if (!this.enabled) return;
    const target = sirenDistance === Infinity ? 0 : Math.max(0, 0.16 * (1 - sirenDistance / 120));
    const s = this.loops.siren;
    if (s) s.g.gain.setTargetAtTime(target * 1.6, this.ctx.currentTime, 0.2);
    else this.siren.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  // One footstep (a real step on stone, tiles, sand or water; running steps are their own recording).
  footstep(volume, surface = 'hard', run = false) {
    if (!this.enabled) return;
    const name = surface === 'sand' ? 'step_sand' : surface === 'water' ? 'step_water' : surface === 'tile' ? 'step_tile' : run ? 'step_run' : 'step_hard';
    if (this.play(name, { vol: Math.min(1, volume * (surface === 'sand' ? 1.7 : 1.45)), vary: 0.1 })) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = surface === 'water' ? 'bandpass' : 'lowpass';
    f.frequency.value = (surface === 'sand' ? 450 : surface === 'water' ? 1400 : 1100) * (0.85 + Math.random() * 0.3);
    const g = ctx.createGain();
    const len = surface === 'water' ? 0.16 : 0.07;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(volume * (surface === 'sand' ? 0.5 : 0.8), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4); src.stop(t + len + 0.02);
    if (surface === 'hard') this.thump(volume * 0.35, 95 + Math.random() * 20, 0.06);
  }

  // Big BOOM: deep thump + rumbling noise.
  explosion(volume = 1) {
    if (!this.enabled) return;
    this.duck(Math.min(0.7, 0.3 + 0.4 * volume), 2.2);
    if (this.has('expl_big')) {
      this.play(Math.random() < 0.6 ? 'expl_big' : 'expl_bomb', { vol: Math.min(1, 0.95 * volume), vary: 0.1, wet: 0.35 });
      this.play('expl_small', { vol: 0.6 * volume, vary: 0.1 });   // the close, sharp crack on top
      return;
    }
    this.burst(0.9 * volume, 2400, 60, 1.4);
    this.thump(1.0 * volume, 55, 0.7);
    this.thump(0.6 * volume, 38, 1.1);
  }

  // Steady rain hiss (level 0..1).
  rain(level) {
    if (!this.enabled) return;
    const r = this.has('amb_rain') ? this.loop('amb_rain') : null;
    if (r) { if (Math.abs((this.rainLevel ?? -1) - level) > 0.02) { this.rainLevel = level; r.g.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.4); } return; }
    if (!this.rainGain) {
      const ctx = this.ctx, n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.4;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      n.connect(f).connect(this.rainGain).connect(this.master); n.start();
    }
    if (Math.abs((this.rainLevel ?? -1) - level) > 0.02) { this.rainLevel = level; this.rainGain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.4); }
  }

  // Rolling thunder.
  thunder(volume = 1) {
    if (!this.enabled) return;
    if (this.play('thunder', { vol: Math.min(1, 0.8 * volume), vary: 0.15 })) return;
    this.burst(0.5 * volume, 600, 40, 2.8);
    this.thump(0.7 * volume, 42, 1.6);
  }

  // Helicopter loudness 0..1.
  heli(level) {
    if (!this.enabled) return;
    const h = this.loops.heli;
    if (h) { h.g.gain.setTargetAtTime(level * 0.7, this.ctx.currentTime, 0.3); return; }
    this.heliGain.gain.setTargetAtTime(level * 0.9, this.ctx.currentTime, 0.3);
  }

  // A car horn (Indian traffic!). volume 0..1. own = the player's car: it always answers the button.
  // Other cars honk at most once every 2.5 s all together - the street never turns into a horn concert.
  horn(volume, own = false) {
    if (!this.enabled || volume <= 0.02) return;
    const now = this.ctx.currentTime, key = own ? 'lastOwnHorn' : 'lastHorn';
    if (now - (this[key] ?? -99) < (own ? 0.6 : 2.5)) return;
    this[key] = now;
    if (this.play('horn', { vol: (own ? 0.5 : 0.38) * volume, vary: 0.04 })) return;
    for (let k = 0; k < 2; k++) {
      const o = this.ctx.createOscillator(); o.type = 'square';
      o.frequency.value = 420 + Math.random() * 60;
      const g = this.ctx.createGain();
      const t = now + k * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08 * volume, t + 0.01);
      g.gain.setValueAtTime(0.08 * volume, t + 0.15);
      g.gain.linearRampToValueAtTime(0, t + 0.17);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.2);
    }
  }

  // ---------- v9.2: sounds that make the world feel real ----------
  // Empty shells tinkling on the ground after a shot.
  casings(n = 1) {
    if (!this.enabled) return;
    if (this.play('casing', { vol: 0.14 + 0.05 * n, vary: 0.15, when: 0.25 + Math.random() * 0.12 })) return;
    const t = this.ctx.currentTime + 0.28 + Math.random() * 0.15;
    for (let k = 0; k < n; k++) {
      const s = t + k * (0.07 + Math.random() * 0.06), f = 3600 + Math.random() * 2200;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.035 / (k + 1), s + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(this.master); o.start(s); o.stop(s + 0.12);
    }
  }
  // A bullet hitting a wall / the road.
  impact(volume = 1) {
    if (!this.enabled || volume < 0.03) return;
    if (Math.random() < 0.22 && this.play('ricochet', { vol: 0.28 * volume, vary: 0.2, wet: 0.15 })) return;   // sometimes it whines off
    this.burst(0.14 * volume, 3400, 1200, 0.045, 'bandpass'); this.thump(0.05 * volume, 260, 0.04);
  }
  // A police bullet flying past your head (pan: -1 left .. 1 right).
  whiz(pan = 0) {
    if (!this.enabled) return;
    if (this.play('whiz', { vol: 0.5, pan, vary: 0.15 })) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 7; f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    let last = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); last = p; }
    src.connect(f).connect(g); last.connect(this.master); src.start(t, Math.random() * 0.3); src.stop(t + 0.3);
  }
  // Tyres squealing while drifting (0..1), nitro roar while boosting.
  loopNoise(type, freq, q) {
    const ctx = this.ctx, n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; n.connect(f).connect(g).connect(this.master); n.start();
    return g;
  }
  screech(level) {
    if (!this.enabled) return;
    const sc = this.loops.screech;
    if (sc) { const v = clamp(level, 0, 1); if (Math.abs((this.screechL ?? -1) - v) > 0.03) { this.screechL = v; const t = this.ctx.currentTime; sc.g.gain.setTargetAtTime(v * 0.42, t, 0.06); sc.src.playbackRate.setTargetAtTime(0.9 + v * 0.2, t, 0.1); } return; }
    if (!this.screechG) { this.screechG = this.loopNoise('bandpass', 2300, 9); this.screech2 = this.loopNoise('bandpass', 3400, 12); }
    const v = Math.max(0, Math.min(1, level));
    if (Math.abs((this.screechL ?? -1) - v) > 0.03) { this.screechL = v; const t = this.ctx.currentTime; this.screechG.gain.setTargetAtTime(v * 0.16, t, 0.06); this.screech2.gain.setTargetAtTime(v * 0.09, t, 0.06); }
  }
  nitro(on) {
    if (!this.enabled) return;
    if (!this.nitroG) this.nitroG = this.loopNoise('highpass', 1500, 0.7);
    if (this.nitroOn !== on) { this.nitroOn = on; this.nitroG.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, on ? 0.05 : 0.2); if (on) this.burst(0.25, 900, 3200, 0.35, 'bandpass'); }
  }
  // Car door slam (getting in / out).
  carDoor() { if (!this.enabled) return; if (this.play('car_door', { vol: 0.5, vary: 0.06 })) return; this.thump(0.35, 120, 0.12); this.burst(0.18, 900, 200, 0.12); }
  // Shop door: glass doors slide (whoosh) and the bell rings "ding-dong".
  chime(volume = 1) {
    if (!this.enabled || volume < 0.05) return;
    const t = this.ctx.currentTime;
    this.burst(0.08 * volume, 600, 1800, 0.45, 'bandpass');
    for (const [f, d] of [[1318.5, 0], [1046.5, 0.32]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(0.06 * volume, t + d + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.1);
      o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 1.2);
    }
  }

  setMuted(muted) {
    if (this.master) this.master.gain.value = muted ? 0 : 0.7;
  }
}
