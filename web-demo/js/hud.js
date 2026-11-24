// HUD: round mini-map (turns with the camera), chase status, big messages, FPS.
export class Hud {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = 130;
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.dpr = dpr;
    this.ctx = this.canvas.getContext('2d');
    this.status = document.getElementById('status');
    this.big = document.getElementById('big-msg');
    this.fpsEl = document.getElementById('fps');
    this.bigT = 0; this.frames = 0; this.fpsT = 0; this.flashT = 0; this.flash = false;
    this.ppm = 0.75;   // map pixels per metre
    this.lastStatus = '';
  }

  showBig(text, color, seconds) {
    this.big.textContent = text;
    this.big.style.color = color;
    this.big.classList.remove('hidden');
    this.bigT = seconds;
  }

  update(dt) {
    const g = this.game, D = g.dispatch;

    // FPS (green = good, yellow = a bit slow, red = too slow).
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      const fps = this.frames / this.fpsT;
      this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
      this.fpsEl.style.color = fps >= 50 ? '#3f3' : fps >= 28 ? '#fd3' : '#f44';
      this.frames = 0; this.fpsT = 0;
    }

    // Chase status line.
    let s = '', color = '#fff';
    if (D.active) {
      if (D.sinceSeen < 1) { s = 'POLICE CHASE - sprint and break their line of sight!'; color = '#ff6a5c'; }
      else { s = `OUT OF SIGHT - stay hidden ${Math.ceil(D.loseTime - D.sinceSeen)}s`; color = '#ffd633'; }
    }
    if (s !== this.lastStatus) { this.status.textContent = s; this.status.style.color = color; this.lastStatus = s; }

    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) this.big.classList.add('hidden'); }

    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashT = 0.3; this.flash = !this.flash; }
    this.drawMap();
  }

  drawMap() {
    const g = this.game, P = g.player, c = this.ctx, S = this.size, k = this.ppm;
    const yaw = g.camera3p.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // World (X, Z) -> map: camera forward is "up", camera right is "right".
    const a = -fz * k, b = -fx * k, cc = fx * k, d = -fz * k;
    const cx = S / 2, cy = S / 2;
    const e = cx - (a * P.x + cc * P.z), f = cy - (b * P.x + d * P.z);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(cx, cy, S / 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, S, S);

    c.setTransform(a * this.dpr, b * this.dpr, cc * this.dpr, d * this.dpr, e * this.dpr, f * this.dpr);
    const colors = { block: '#39403a', building: '#1b1d22', road: '#8d8f99' };
    for (const kind of ['block', 'building', 'road']) {
      c.fillStyle = colors[kind];
      for (const r of g.world.mapRects) if (r.kind === kind) c.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
    // Police dots.
    for (const p of g.policeCars) {
      c.fillStyle = p.pursuing && this.flash ? '#ff2a2a' : '#3f6fff';
      c.beginPath(); c.arc(p.x, p.z, 6 / k * 0.75, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#ff5a4d';
    for (const o of g.officers) { c.beginPath(); c.arc(o.x, o.z, 4 / k * 0.75, 0, Math.PI * 2); c.fill(); }

    // Player arrow in the middle.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const pfx = Math.sin(P.yaw), pfz = Math.cos(P.yaw);
    const ax = a * pfx + cc * pfz, ay = b * pfx + d * pfz, al = Math.hypot(ax, ay) || 1;
    const ux = ax / al, uy = ay / al;
    c.fillStyle = '#ffd633';
    c.beginPath();
    c.moveTo(cx + ux * 9, cy + uy * 9);
    c.lineTo(cx - ux * 6 - uy * 6, cy - uy * 6 + ux * 6);
    c.lineTo(cx - ux * 6 + uy * 6, cy - uy * 6 - ux * 6);
    c.closePath(); c.fill();
    c.restore();
  }
}
