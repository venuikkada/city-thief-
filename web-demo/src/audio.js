// Sound made in code with Web Audio (no files to download):
// police siren (louder when close), city traffic rumble, car horns.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
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

  // Each gun has its own voice: a sharp crack, a body thump and a short echo off the buildings.
  gunshot(type, volume = 1) {
    const v = volume;
    if (type === 'smg') { this.burst(0.5 * v, 4600, 520, 0.1); this.thump(0.32 * v, 150, 0.07); }
    else if (type === 'rifle') { this.burst(0.62 * v, 5200, 380, 0.16); this.thump(0.55 * v, 95, 0.16); this.echo(0.16 * v, 0.09); }
    else if (type === 'shotgun') { this.burst(0.8 * v, 2600, 160, 0.34); this.thump(0.75 * v, 70, 0.24); this.echo(0.22 * v, 0.12); }
    else if (type === 'gold') { this.burst(0.62 * v, 3800, 320, 0.2); this.thump(0.5 * v, 120, 0.13); this.burst(0.08 * v, 6000, 5200, 0.25, 'bandpass'); }
    else { this.burst(0.62 * v, 3600, 300, 0.2); this.thump(0.48 * v, 115, 0.13); this.echo(0.1 * v, 0.07); }
  }
  // A quieter copy a moment later (the sound bouncing off the walls of the street).
  echo(volume, delay) { if (this.enabled) setTimeout(() => this.burst(volume, 1800, 250, 0.28), delay * 1000); }
  // Magazine out, magazine in, slide / bolt pulled - spread over the reload time.
  reload(len = 1.5) {
    this.burst(0.22, 2600, 1700, 0.05, 'bandpass');
    setTimeout(() => this.burst(0.3, 1600, 900, 0.07, 'bandpass'), len * 450);
    setTimeout(() => { this.burst(0.34, 3200, 1400, 0.06, 'bandpass'); this.thump(0.12, 300, 0.05); }, len * 850);
  }
  equip() { this.burst(0.18, 2200, 1500, 0.05, 'bandpass'); setTimeout(() => this.burst(0.2, 3000, 1800, 0.04, 'bandpass'), 120); }
  // Hit feedback: a dull thud on the body, a bright "tink" for a headshot.
  hit(head, kill) {
    if (head) { this.burst(0.22, 7000, 5600, 0.09, 'bandpass'); this.thump(0.15, 900, 0.05); }
    else this.thump(0.2, 220, 0.06);
    if (kill) setTimeout(() => this.thump(0.22, 160, 0.12), 60);
  }
  click() { this.burst(0.2, 3000, 2500, 0.03, 'bandpass'); }
  ping() { this.burst(0.18, 5000, 3000, 0.08, 'bandpass'); }
  hurt() { this.thump(0.4, 90, 0.18); }
  crash(k) { this.burst(0.7 * k, 1800, 120, 0.45); this.thump(0.6 * k, 70, 0.3); }

  engine(on) {
    if (!this.enabled) return;
    this.engGain.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.15);
    this.engineOn = on;
  }

  engineLevel(speed01, throttle) {
    if (!this.enabled || !this.engineOn) return;
    const t = this.ctx.currentTime;
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
    this.siren.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  // One footstep: a soft scuff + a tiny thump (sand is muffled, water splashes).
  footstep(volume, surface = 'hard') {
    if (!this.enabled) return;
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
    this.burst(0.9 * volume, 2400, 60, 1.4);
    this.thump(1.0 * volume, 55, 0.7);
    this.thump(0.6 * volume, 38, 1.1);
  }

  // Steady rain hiss (level 0..1).
  rain(level) {
    if (!this.enabled) return;
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
    this.burst(0.5 * volume, 600, 40, 2.8);
    this.thump(0.7 * volume, 42, 1.6);
  }

  // Helicopter loudness 0..1.
  heli(level) {
    if (!this.enabled) return;
    this.heliGain.gain.setTargetAtTime(level * 0.9, this.ctx.currentTime, 0.3);
  }

  // Short "beep beep" (Indian traffic!). volume 0..1
  horn(volume) {
    if (!this.enabled || volume <= 0.02) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHorn < 0.8) return;
    this.lastHorn = now;
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
    this.burst(0.14 * volume, 3400, 1200, 0.045, 'bandpass'); this.thump(0.05 * volume, 260, 0.04);
  }
  // A police bullet flying past your head (pan: -1 left .. 1 right).
  whiz(pan = 0) {
    if (!this.enabled) return;
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
  carDoor() { if (!this.enabled) return; this.thump(0.35, 120, 0.12); this.burst(0.18, 900, 200, 0.12); }
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
