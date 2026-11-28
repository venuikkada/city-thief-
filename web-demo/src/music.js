// Music made in code (nothing to download): an Indian-flavoured action score that follows the game.
//   level 0  exploring : soft drone + tabla
//   level 1  mission   : + bass + shaker
//   level 2  chase     : + big drums + bass riff + "shehnai" lead, faster
//   level 3  fight     : + heavier drums (boss fights, shoot-outs)
// Plus short sounds for rewards: mission passed, failed, rank up, cash, checkpoint, countdown, slow-motion.
const ROOT = 73.42;                         // D2
const SCALE = [0, 1, 4, 5, 7, 8, 10, 12];   // D "phrygian dominant" (Bollywood thriller feel)
const hz = (deg, oct = 0) => ROOT * Math.pow(2, (SCALE[((deg % 7) + 7) % 7] + 12 * (oct + Math.floor(deg / 7))) / 12);

// 16 steps per bar.
const TABLA = ['B', '', 'd', 'd', 'B', '', 'B', 'd', '', 'd', 'B', '', 'd', '', 'd', 'd'];   // B = bayan (low), d = dayan (high)
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
const KICK3 = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const BASS = [0, -1, 0, 0, -1, 0, 1, -1, 0, -1, 0, 0, 3, -1, 2, -1];   // scale degrees, -1 = rest
const LEAD = [4, 4, 5, 4, 3, 2, 3, 1, 4, 5, 7, 5, 4, 3, 2, 0];        // one note per 8th, over 2 bars
// Plucked "santoor / sitar" tune while exploring (2 bars of 16 steps each, -1 = rest), and an answer phrase.
const MELODY = [4, -1, -1, 3, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1, -1, -1, 1, -1, 2, -1, 3, -1, 2, 1, 0, -1, -1, -1, -1, -1, -1, -1];
const MELODY2 = [7, -1, 5, -1, 4, -1, 5, 4, 3, -1, -1, 2, 3, -1, -1, -1, 4, -1, 3, 2, 1, -1, 2, -1, 0, -1, -1, -1, 4, -1, -1, -1];
// Dhol (bhangra "chaal") in chases: D = deep "dhum", t = stick "tak".
const DHOL = ['D', '', 't', 'D', '', 't', 'D', '', 't', '', 'D', 't', '', 't', '', ''];

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.level = 0; this.want = 0;
    this.enabled = true; this.started = false;
  }

  start() {
    const A = this.audio;
    if (this.started || !A.enabled) return;
    const ctx = this.ctx = A.ctx;
    this.out = ctx.createGain(); this.out.gain.value = this.vol();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5;
    this.bus = ctx.createGain();
    this.bus.connect(comp).connect(this.out).connect(A.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(A.master);
    // Drone: two soft saws (D + A) through a slow-moving filter.
    this.drone = ctx.createGain(); this.drone.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg).connect(f.frequency); lfo.start();
    for (const fr of [ROOT, ROOT * 1.5, ROOT * 2.003]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start();
    }
    f.connect(this.drone).connect(this.bus);
    this.step = 0; this.bar = 0; this.nextT = ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.schedule(), 25);
    this.started = true;
    this.applyLevel();
  }

  // v9.9: just walking around the music stays soft in the background (like GTA / PUBG on foot);
  // missions, chases and fights play it full.
  vol() { return this.enabled ? 0.55 * (this.level === 0 ? 0.5 : 1) : 0; }
  setEnabled(on) {
    this.enabled = on;
    if (this.out) this.out.gain.setTargetAtTime(this.vol(), this.ctx.currentTime, 0.2);
  }

  // 0..3, changes at the next bar so the beat never stumbles.
  setLevel(n) { this.want = n; }

  get bpm() { return this.level >= 2 ? 126 : 92; }

  applyLevel() {
    if (!this.started) return;
    this.drone.gain.setTargetAtTime([0.05, 0.045, 0.03, 0.025][this.level], this.ctx.currentTime, 0.8);
    this.out.gain.setTargetAtTime(this.vol(), this.ctx.currentTime, 1.2);
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    while (this.nextT < ctx.currentTime + 0.12) {
      if (this.step % 16 === 0 && this.want !== this.level) { this.level = this.want; this.applyLevel(); }
      this.play(this.step % 16, this.nextT);
      this.nextT += 60 / this.bpm / 4;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  play(s, t) {
    if (this.quiet) return;   // another drum (the baraat) is playing
    const L = this.level;
    // Tabla always (quieter in big fights where the drums take over).
    const tb = TABLA[s];
    const tv = L >= 3 ? 0.35 : 0.7;
    if (tb === 'B') this.bayan(t, 0.5 * tv); else if (tb === 'd') this.dayan(t, (s % 4 === 3 ? 0.25 : 0.38) * tv);
    if (L >= 1) {
      if (s % 2 === 1) this.hat(t, L >= 2 ? 0.12 : 0.07, 0.03);
      const b = BASS[s];
      if (b >= 0 && (L >= 2 || s % 4 === 0)) this.bass(t, hz(b), 60 / this.bpm / 4 * 1.8, L >= 3 ? 0.32 : 0.24, L >= 3);
    }
    // Exploring / mission: a plucked melody (rests every 4th bar so it breathes).
    if (L <= 1 && this.bar % 4 !== 3) {
      const m = (this.bar % 8 < 4 ? MELODY : MELODY2)[(this.bar % 2) * 16 + s];
      if (m >= 0) this.pluck(t, hz(m, 2), L === 0 ? 0.2 : 0.15);
    }
    if (L >= 2) {
      const dh = DHOL[s];
      if (dh === 'D') this.dhol(t, L >= 3 ? 0.42 : 0.36, false); else if (dh === 't') this.dhol(t, 0.22, true);
      if ((L >= 3 ? KICK3 : KICK)[s]) this.kick(t, 0.9);
      if (SNARE[s]) this.snare(t, 0.5);
      if (s % 2 === 0) {
        const n = LEAD[(this.bar % 2) * 8 + s / 2];
        if (this.bar % 4 < 3 || s < 8) this.lead(t, hz(n, 2), 60 / this.bpm / 2 * 0.9, 0.06);
      }
    }
  }

  // ---------- Instruments ----------
  env(t, peak, dur, attack = 0.005) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  osc(type, freq, t, dur, dest) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noise(t, dur, dest) {
    const n = this.ctx.createBufferSource(); n.buffer = this.audio.noiseBuf;
    n.connect(dest); n.start(t, Math.random() * 0.3); n.stop(t + dur + 0.05);
  }
  kick(t, v) {
    const g = this.env(t, v, 0.32); g.connect(this.bus);
    const o = this.osc('sine', 140, t, 0.32, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  }
  snare(t, v) {
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = this.env(t, v, 0.18); f.connect(g).connect(this.bus); this.noise(t, 0.18, f);
    const g2 = this.env(t, v * 0.5, 0.09); g2.connect(this.bus); this.osc('triangle', 190, t, 0.09, g2);
  }
  hat(t, v, dur) {
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.env(t, v, dur); f.connect(g).connect(this.bus); this.noise(t, dur, f);
  }
  bayan(t, v) {
    const g = this.env(t, v, 0.35); g.connect(this.bus);
    const o = this.osc('sine', 98, t, 0.35, g); o.frequency.exponentialRampToValueAtTime(66, t + 0.25);
  }
  dayan(t, v) {
    const g = this.env(t, v, 0.14); g.connect(this.bus); this.osc('sine', 540, t, 0.14, g);
    const g2 = this.env(t, v * 0.35, 0.05); g2.connect(this.bus); this.osc('triangle', 1080, t, 0.05, g2);
  }
  bass(t, freq, dur, v, dirty) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(dirty ? 900 : 520, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = this.env(t, v, dur, 0.01); f.connect(g).connect(this.bus);
    this.osc('sawtooth', freq, t, dur, f);
    if (dirty) this.osc('square', freq * 0.5, t, dur, f);
  }
  lead(t, freq, dur, v) {
    // Reedy "shehnai" lead: saw through a band filter, with vibrato.
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 2.2; f.Q.value = 1.4;
    const g = this.env(t, v, dur, 0.03); f.connect(g).connect(this.bus);
    const o = this.osc('sawtooth', freq, t, dur, f);
    const vib = this.ctx.createOscillator(); vib.frequency.value = 5.5;
    const vg = this.ctx.createGain(); vg.gain.value = freq * 0.012;
    vib.connect(vg).connect(o.frequency); vib.start(t); vib.stop(t + dur + 0.05);
  }

  // Plucked string (Karplus-Strong): sounds like a santoor / sitar. Each note is made once and kept.
  pluckBuf(freq) {
    const key = Math.round(freq);
    this.plucks = this.plucks || {};
    if (this.plucks[key]) return this.plucks[key];
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 1.5), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let k = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[k], b = ring[(k + 1) % N];
      let v = 0.4982 * (a + b);
      v += 0.08 * (v * Math.abs(v) - v * 0.5);   // a little "jawari" buzz, like a sitar bridge
      ring[k] = v; d[i] = a * (i > len - 2000 ? (len - i) / 2000 : 1); k = (k + 1) % N;
    }
    this.plucks[key] = buf;
    return buf;
  }
  pluck(t, freq, v) {
    const src = this.ctx.createBufferSource(); src.buffer = this.pluckBuf(freq);
    src.playbackRate.setValueAtTime(Math.random() < 0.3 ? 0.97 : 1, t); src.playbackRate.linearRampToValueAtTime(1, t + 0.09);   // a small "meend" slide now and then
    const g = this.ctx.createGain(); g.gain.value = v;
    src.connect(g).connect(this.bus); src.start(t); src.stop(t + 1.5);
  }
  dhol(t, v, high) {
    if (!high) {   // "dhum": the big skin
      const g = this.env(t, v, 0.38); g.connect(this.bus);
      const o = this.osc('sine', 98, t, 0.38, g); o.frequency.exponentialRampToValueAtTime(56, t + 0.26);
      const n = this.env(t, v * 0.25, 0.05); n.connect(this.bus); this.noise(t, 0.05, n);
    } else {   // "tak": the stick on the small skin
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.3;
      const g = this.env(t, v, 0.09); f.connect(g).connect(this.bus); this.noise(t, 0.09, f);
      const g2 = this.env(t, v * 0.5, 0.06); g2.connect(this.bus); this.osc('triangle', 390, t, 0.06, g2);
    }
  }

  // ---------- Reward sounds ----------
  tone(type, freq, t, dur, v) { const g = this.env(t, v, dur, 0.008); g.connect(this.sfx); this.osc(type, freq, t, dur, g); }
  ok() { return this.started && this.ctx.state === 'running'; }

  cash() { if (!this.ok()) return; const t = this.ctx.currentTime; this.tone('sine', 1318, t, 0.12, 0.18); this.tone('sine', 1976, t + 0.07, 0.22, 0.16); }
  checkpoint() { if (!this.ok()) return; const t = this.ctx.currentTime; this.tone('triangle', 880, t, 0.12, 0.25); this.tone('triangle', 1320, t + 0.08, 0.2, 0.25); }
  beep(go) { if (!this.ok()) return; const t = this.ctx.currentTime; this.tone('square', go ? 1320 : 660, t, go ? 0.5 : 0.18, 0.18); }
  passed() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [0, 2, 4, 7, 9, 11].forEach((d, i) => this.tone('triangle', hz(d, 2), t + i * 0.09, 0.5, 0.22));
    this.tone('sawtooth', hz(0, 1), t + 0.55, 1.2, 0.08); this.tone('triangle', hz(0, 3), t + 0.55, 1.2, 0.18);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000;
    const g = this.env(t + 0.55, 0.25, 1.4); f.connect(g).connect(this.sfx); this.noise(t + 0.55, 1.4, f);
  }
  failed() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [7, 5, 4, 1, 0].forEach((d, i) => this.tone('sawtooth', hz(d, 1), t + i * 0.16, 0.45, 0.1));
  }
  rankUp() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [[0, 0], [4, 0.12], [7, 0.24], [9, 0.36], [11, 0.48]].forEach(([d, dt]) => { this.tone('square', hz(d, 2), t + dt, 0.3, 0.1); this.tone('triangle', hz(d, 3), t + dt, 0.3, 0.12); });
    this.tone('triangle', hz(14, 1), t + 0.62, 1.0, 0.2);
  }
  whoosh() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(250, t + 0.6);
    const g = this.env(t, 0.35, 0.7, 0.05); f.connect(g).connect(this.sfx); this.noise(t, 0.7, f);
  }
}
