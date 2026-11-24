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
    this.enabled = true;
    this.lastHorn = 0;
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
