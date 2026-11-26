// Systems for the Chapter 3 missions ("Navapur Nights"):
//   LiveStream  - your crime spree is live: viewers, hype, chat, polls that give you challenges
//   ColorClouds - Holi: clouds of colour powder that the police cannot see through
//   Rhythm      - dance on the dhol beat to blend into a wedding procession
import * as THREE from 'three';
import { dist } from './util.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------------
// LIVE STREAM: hype goes up with every crazy thing you do; viewers grow with hype.
// Every so often the chat votes on a challenge. Do it in time = viewer explosion.
// ---------------------------------------------------------------------------
const CHAT_IDLE = ['bhai kuch karo 😴', 'boring...', 'police kahan hai?', 'drift dikhao!', 'jump maaro ramp se', 'more action pls', 'aur speed!!', 'yeh kaun hai bhai', 'first time here 👋', 'from Pune ❤️', 'hello from Dubai'];
const CHAT_HYPE = ['🔥🔥🔥', 'BHAI OP!!', 'kya baat hai 😱', 'GOAT 🐐', 'legend', 'HAHAHA', 'yeh banda pagal hai 😂', 'clip it!!', 'subscribe kiya ✅', 'next level', 'POLICE ROAD PE ROTI 😂', 'sheer madness', 'insane bro'];
const NAMES = ['rahul_99', 'priya.k', 'SunnyFan', 'desi_gamer', 'navapur_boy', 'chai_lover', 'ankit07', 'meera_s', 'xXbaadshahXx', 'babu_rao', 'tech_guru', 'pinky', 'golu', 'vicky_dada', 'nisha.r'];
const EVENT_HYPE = { kill: 5, headshot: 10, explosion: 16, policecar: 22, stunt: 22, near: 5, drift: 0, stars: 12, cash: 1 };
const CHALLENGES = [
  { id: 'explode', text: 'Blow up a car!', ev: 'explosion' },
  { id: 'stunt', text: 'Do a stunt jump!', ev: 'stunt' },
  { id: 'drift', text: 'Drift 1,000 points!', ev: 'drift', need: (d) => d >= 1000 },
  { id: 'near', text: '3 near misses!', ev: 'near', count: 3 },
  { id: 'stars', text: 'Get 3 wanted stars!', check: (g) => g.dispatch.stars >= 3 },
  { id: 'police', text: 'Steal a police car!', check: (g) => g.driving.car && g.driving.car.isPolice },
  { id: 'speed', text: 'Hit 140 km/h!', check: (g) => g.driving.kmh >= 140 },
  { id: 'head', text: 'Get a headshot!', ev: 'headshot' },
  { id: 'lose', text: 'Lose the police!', check: (g, c) => c.hadStars && g.dispatch.stars === 0, needStars: true },
];

export class LiveStream {
  constructor(game, goal = 1e6) {
    this.g = game; this.goal = goal;
    this.viewers = 1200; this.hype = 25; this.likes = 0;
    this.chatT = 1; this.pollT = 18; this.poll = null; this.challenge = null; this.recent = [];
    this.el = $('live'); this.el.classList.remove('hidden');
    $('live-chat').innerHTML = '';
    this.say('SYSTEM', 'You are LIVE! 🔴 Go crazy!', true);
  }

  event(type, data) {
    let h = EVENT_HYPE[type] ?? 0;
    if (type === 'drift') h = Math.min(25, (data || 0) / 120);
    if (!h) return;
    this.hype = Math.min(100, this.hype + h);
    this.likes += Math.round(h * 3);
    this.recent.push(type);
    this.heart();
    const c = this.challenge;
    if (c && c.ev === type && (!c.need || c.need(data))) { c.got = (c.got || 0) + 1; if (c.got >= (c.count || 1)) this.win(); }
  }

  say(name, text, sys = false) {
    const box = $('live-chat');
    const d = document.createElement('div');
    d.className = 'msg' + (sys ? ' sys' : '');
    d.innerHTML = `<b>${name}</b> ${text}`;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
  }

  heart() {
    const h = document.createElement('div');
    h.className = 'heart'; h.textContent = pick(['❤️', '🔥', '😂', '👏', '💯']);
    h.style.left = (Math.random() * 30) + 'px';
    h.addEventListener('animationend', () => h.remove());
    $('live-hearts').appendChild(h);
  }

  startPoll() {
    const g = this.g;
    const pool = CHALLENGES.filter((c) => !c.needStars || g.dispatch.stars > 0);
    const a = pick(pool); let b = pick(pool); while (b === a) b = pick(pool);
    this.poll = { a, b, t: 6, va: 50, vb: 50 };
    $('live-poll').classList.remove('hidden');
    this.say('SYSTEM', 'CHAT IS VOTING! 🗳️', true);
  }

  win() {
    const g = this.g, c = this.challenge;
    this.challenge = null; $('live-task').classList.add('hidden');
    this.viewers *= 1.4; this.hype = Math.min(100, this.hype + 35);
    g.hud.showBig('CHAT GOES CRAZY!', '#ff3ea5', 1.6);
    if (g.rewards) g.rewards.event(`CHALLENGE: ${c.text.toUpperCase()}`, 400, 25);
    for (let i = 0; i < 4; i++) this.say(pick(NAMES), pick(CHAT_HYPE));
    this.pollT = 22;
  }

  update(dt) {
    const g = this.g;
    this.hype = Math.max(0, this.hype - dt * 2.2);
    const rate = this.hype > 8 ? (this.hype / 100) * 0.085 : -0.012;
    this.viewers = Math.max(150, this.viewers * Math.exp(rate * dt));
    // Chat: faster and wilder with hype.
    this.chatT -= dt;
    if (this.chatT <= 0) {
      this.chatT = 1.8 - this.hype / 70 + Math.random() * 0.6;
      const r = this.recent.shift();
      this.say(pick(NAMES), r ? pick(CHAT_HYPE) : this.hype > 40 ? pick(CHAT_HYPE) : pick(CHAT_IDLE));
    }
    // Polls and challenges.
    if (this.poll) {
      const p = this.poll;
      p.t -= dt;
      p.va += (Math.random() - 0.45) * 30 * dt; p.vb = 100 - p.va;
      $('live-poll').innerHTML = `<div class="q">CHAT VOTE · ${Math.ceil(p.t)}s</div>
        <div class="opt"><span style="width:${p.va.toFixed(0)}%"></span><b>${p.a.text}</b><i>${p.va.toFixed(0)}%</i></div>
        <div class="opt"><span style="width:${p.vb.toFixed(0)}%"></span><b>${p.b.text}</b><i>${p.vb.toFixed(0)}%</i></div>`;
      if (p.t <= 0) {
        const c = { ...(p.va >= p.vb ? p.a : p.b), t: 35, got: 0, hadStars: g.dispatch.stars > 0 };
        this.poll = null; this.challenge = c;
        $('live-poll').classList.add('hidden');
        g.hud.showBig(`CHAT SAYS: ${c.text.toUpperCase()}`, '#ff3ea5', 2);
      }
    } else if (this.challenge) {
      const c = this.challenge;
      c.t -= dt;
      if (c.check && c.check(g, c)) this.win();
      else if (c.t <= 0) {
        this.challenge = null; $('live-task').classList.add('hidden');
        this.viewers *= 0.82; this.hype = Math.max(0, this.hype - 20);
        this.say('SYSTEM', 'Challenge failed... viewers leaving 📉', true);
        this.pollT = 15;
      } else {
        const t = $('live-task'); t.classList.remove('hidden');
        t.innerHTML = `CHALLENGE: <b>${c.text}</b> ${c.count ? `${c.got || 0}/${c.count} ` : ''}· ${Math.ceil(c.t)}s`;
      }
    } else { this.pollT -= dt; if (this.pollT <= 0) this.startPoll(); }
    $('live-viewers').textContent = fmt(this.viewers);
    $('live-hype').style.width = this.hype.toFixed(0) + '%';
    $('live-likes').textContent = fmt(this.likes);
    $('live-goal').style.width = Math.min(100, Math.log(this.viewers) / Math.log(this.goal) * 100).toFixed(1) + '%';
  }

  stop() { this.el.classList.add('hidden'); $('live-poll').classList.add('hidden'); $('live-task').classList.add('hidden'); }
}

// ---------------------------------------------------------------------------
// HOLI COLOUR CLOUDS: big soft clouds of gulal. Police cannot see through them.
// ---------------------------------------------------------------------------
const HOLI = [[1, 0.24, 0.65], [0.18, 0.9, 0.42], [1, 0.82, 0.12], [0.25, 0.63, 1], [1, 0.45, 0.1], [0.7, 0.3, 1]];
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ColorClouds {
  constructor(game) {
    this.g = game; this.clouds = [];
    this.n = 600; this.i = 0;
    this.pos = new Float32Array(this.n * 3).fill(-9999); this.col = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3); this.life = new Float32Array(this.n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4.2, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.85 }));
    this.points.frustumCulled = false;
    game.scene.add(this.points);
  }

  burst(x, z, r = 5.5, life = 9, colorIndex) {
    const c = HOLI[colorIndex ?? Math.floor(Math.random() * HOLI.length)];
    const y = this.g.world.groundAt(x, z);
    for (let k = 0; k < 44; k++) {
      const i = this.i; this.i = (this.i + 1) % this.n;
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.6;
      this.pos[i * 3] = x + Math.cos(a) * d * 0.3; this.pos[i * 3 + 1] = y + 0.6 + Math.random() * 1.5; this.pos[i * 3 + 2] = z + Math.sin(a) * d * 0.3;
      this.vel[i * 3] = Math.cos(a) * d * 0.55; this.vel[i * 3 + 1] = 0.3 + Math.random() * 0.7; this.vel[i * 3 + 2] = Math.sin(a) * d * 0.55;
      this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
      this.life[i] = life * (0.7 + Math.random() * 0.3);
    }
    this.clouds.push({ x, z, r, t: life });
  }

  // Does a cloud block the line from A to B?
  blocks(ax, az, bx, bz) {
    for (const c of this.clouds) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / l2));
      if (dist(ax + dx * t, az + dz * t, c.x, c.z) < c.r * 0.85) return true;
    }
    return false;
  }

  update(dt) {
    for (const c of this.clouds) c.t -= dt;
    this.clouds = this.clouds.filter((c) => c.t > 0);
    const damp = Math.exp(-1.4 * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3] *= damp; this.vel[i * 3 + 2] *= damp; this.vel[i * 3 + 1] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() { this.g.scene.remove(this.points); this.clouds = []; }
}

// ---------------------------------------------------------------------------
// RHYTHM: notes slide to the line on every dhol beat; tap DANCE on the beat.
// The beat comes from the audio clock, so it is always in time with the drums.
// ---------------------------------------------------------------------------
export class Rhythm {
  constructor(game, bpm = 96) {
    this.g = game; this.beat = 60 / bpm; this.blend = 70; this.combo = 0;
    this.ctx = undefined; this.origin = 0; this.nextSound = 0;
    this.el = $('rhythm'); this.el.classList.remove('hidden');
    this.lane = $('rhythm-lane'); this.lane.innerHTML = '';
    this.notes = [];
    for (let i = 0; i < 6; i++) { const n = document.createElement('i'); this.lane.appendChild(n); this.notes.push(n); }
    this.lastHit = -1; this.judge = $('rhythm-judge');
    // Taps are judged the moment the finger touches (not at the next frame) for fair timing.
    this.onTap = (e) => {
      if (e.type === 'keydown' && ((e.key !== 'b' && e.key !== 'B') || e.repeat)) return;
      if (this.g.mode === 'play' && !document.body.classList.contains('editing')) this.tap();
    };
    $('btn-dance').addEventListener('pointerdown', this.onTap);
    window.addEventListener('keydown', this.onTap);
  }

  // Phones play sound a little late (and touches arrive a little late): judge and draw with that delay.
  lat() { const c = this.ctx; return (c ? (c.outputLatency || c.baseLatency || 0) : 0) + 0.03; }

  // The beat follows the sound clock while sound is playing (so taps match the drums),
  // otherwise the normal clock. If that changes (sound switched on or paused), the beat restarts.
  now() {
    const c = this.g.audio.ctx && this.g.audio.ctx.state === 'running' ? this.g.audio.ctx : null;
    if (c !== this.ctx) { this.ctx = c; this.origin = (c ? c.currentTime : performance.now() / 1000) + 0.3; this.nextSound = 0; this.lastHit = -1; }
    return c ? c.currentTime : performance.now() / 1000;
  }

  // Tap DANCE: how close to a beat?
  tap() {
    const t = this.now() - this.origin - this.lat(), k = Math.round(t / this.beat), off = Math.abs(t - k * this.beat);
    if (k === this.lastHit) return;
    let txt, add;
    if (off < 0.09) { txt = 'PERFECT!'; add = 12; this.combo++; }
    else if (off < 0.18) { txt = 'GOOD'; add = 7; this.combo++; }
    else { txt = 'MISS'; add = -12; this.combo = 0; }
    if (add > 0) this.lastHit = k;
    this.blend = Math.max(0, Math.min(100, this.blend + add + Math.min(this.combo, 8)));
    if (this.onJudge) this.onJudge(add > 0);
    this.judge.textContent = txt + (this.combo > 2 ? ` x${this.combo}` : '');
    this.judge.className = add > 0 ? 'ok' : 'bad';
    this.judge.style.animation = 'none'; void this.judge.offsetWidth; this.judge.style.animation = '';
    if (this.g.player.rig) this.g.player.rig.setGesture('dance');
  }

  update(dt, scanning) {
    const t = this.now() - this.origin;
    // Drums on the beat (dhol: low on 1 and 3, high on 2 and 4).
    const M = this.g.music;
    while (M.ok() && this.origin + this.nextSound * this.beat < this.now() + 0.15) {
      const when = this.origin + this.nextSound * this.beat;
      if (when > this.now() - 0.02) { if (this.nextSound % 2 === 0) M.bayan(when, 0.6); else M.dayan(when, 0.45); M.dayan(when + this.beat / 2, 0.18); }
      this.nextSound++;
    }
    // Notes moving to the hit line (reaching it when the drum is HEARD).
    const tv = t - this.lat(), base = Math.floor(tv / this.beat);
    this.notes.forEach((n, i) => {
      const k = base + i, x = ((k * this.beat - tv) / (this.beat * 5)) * 100;
      n.style.left = (12 + Math.max(-12, x) * 0.88) + '%';
      n.style.opacity = x < -8 ? 0 : 1;
    });
    this.blend = Math.max(0, this.blend - dt * (scanning ? 9 : 3));
    $('rhythm-fill').style.width = this.blend.toFixed(0) + '%';
    $('rhythm-fill').style.background = this.blend > 50 ? '#7dff8a' : this.blend > 25 ? '#ffc531' : '#ff3b30';
  }

  stop() {
    this.el.classList.add('hidden');
    $('btn-dance').removeEventListener('pointerdown', this.onTap);
    window.removeEventListener('keydown', this.onTap);
  }
}
