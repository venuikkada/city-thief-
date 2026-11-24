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
    this.master.connect(ctx.destination);

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

    this.enabled = true;
    this.lastHorn = 0;
  }

  // Short burst of filtered noise (used for shots, impacts, crashes).
  burst(volume, freqFrom, freqTo, length, type = 'lowpass') {
    if (!this.enabled || volume <= 0.01) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
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

  gunshot(type, volume = 1) {
    if (type === 'smg') { this.burst(0.5 * volume, 4200, 500, 0.11); this.thump(0.35 * volume, 140, 0.08); }
    else { this.burst(0.65 * volume, 3500, 300, 0.22); this.thump(0.5 * volume, 110, 0.14); }
  }
  reload() { this.burst(0.25, 2500, 1800, 0.05, 'bandpass'); setTimeout(() => this.burst(0.3, 1800, 1200, 0.06, 'bandpass'), 450); }
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

  setMuted(muted) {
    if (this.master) this.master.gain.value = muted ? 0 : 0.7;
  }
}
