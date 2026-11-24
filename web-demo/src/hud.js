// HUD: mini-map (turns with the camera), compass bar, wanted stars,
// chase status, big messages, crosshair and FPS.
export class Hud {
  constructor(game) {
    this.game = game;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    this.map = document.getElementById('minimap');
    this.mapSize = 150;
    this.map.width = this.mapSize * this.dpr; this.map.height = this.mapSize * this.dpr;
    this.ctx = this.map.getContext('2d');

    this.compass = document.getElementById('compass');
    this.compass.width = 300 * this.dpr; this.compass.height = 27 * this.dpr;
    this.cctx = this.compass.getContext('2d');

    this.status = document.getElementById('status');
    this.big = document.getElementById('big-msg');
    this.fpsEl = document.getElementById('fps');
    this.stars = document.getElementById('stars');
    this.cross = document.getElementById('crosshair');
    this.aimBtn = document.getElementById('btn-aim');
    this.crouchBtn = document.getElementById('btn-crouch');

    this.bigT = 0; this.frames = 0; this.fpsT = 0; this.flashT = 0; this.flash = false;
    this.ppm = 0.8;   // map pixels per metre
    this.lastStatus = ''; this.lastStars = -1;
  }

  showBig(text, color, seconds) {
    this.big.textContent = text;
    this.big.style.color = color;
    this.big.classList.remove('hidden');
    // Restart the pop animation.
    this.big.style.animation = 'none'; void this.big.offsetWidth; this.big.style.animation = '';
    this.bigT = seconds;
  }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player;

    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      const fps = this.frames / this.fpsT;
      this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
      this.fpsEl.style.color = fps >= 50 ? '#7f7' : fps >= 28 ? '#fd5' : '#f66';
      this.frames = 0; this.fpsT = 0;
    }

    let s = '', color = '#fff';
    if (D.active) {
      if (D.sinceSeen < 1) { s = 'SPOTTED - sprint and break their line of sight!'; color = '#ff6a5c'; }
      else { s = `HIDDEN - stay out of sight ${Math.ceil(D.loseTime - D.sinceSeen)}s`; color = '#ffd633'; }
    }
    if (s !== this.lastStatus) { this.status.textContent = s; this.status.style.color = color; this.lastStatus = s; }

    // Wanted stars (the full 5-star system comes in Unity Step 4).
    const starCount = D.active ? 2 : 0;
    const key = starCount * 10 + (D.active && D.sinceSeen >= 1 ? 1 : 0);
    if (key !== this.lastStars) {
      this.lastStars = key;
      [...this.stars.children].forEach((el, i) => el.classList.toggle('on', i < starCount));
      this.stars.classList.toggle('blink', D.active && D.sinceSeen >= 1);
    }

    this.cross.classList.toggle('hidden', !P.aiming);
    this.aimBtn.classList.toggle('active', P.aiming);
    this.crouchBtn.classList.toggle('active', P.crouching);

    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) this.big.classList.add('hidden'); }

    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashT = 0.3; this.flash = !this.flash; }
    this.drawMap();
    this.drawCompass();
  }

  drawMap() {
    const g = this.game, P = g.player, c = this.ctx, S = this.mapSize, k = this.ppm;
    const yaw = g.camera3p.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // World (X, Z) -> map: camera forward is "up", camera right is "right".
    const a = -fz * k, b = -fx * k, cc = fx * k, d = -fz * k;
    const cx = S / 2, cy = S / 2;
    const e = cx - (a * P.x + cc * P.z), f = cy - (b * P.x + d * P.z);
    const R = this.dpr;

    c.setTransform(R, 0, 0, R, 0, 0);
    c.fillStyle = 'rgba(28,30,26,0.92)'; c.fillRect(0, 0, S, S);

    c.setTransform(a * R, b * R, cc * R, d * R, e * R, f * R);
    const colors = { block: '#4a5148', building: '#262a30', road: '#9a9ca6' };
    for (const kind of ['block', 'building', 'road']) {
      c.fillStyle = colors[kind];
      for (const r of g.world.mapRects) if (r.kind === kind) c.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
    for (const p of g.policeCars) {
      c.fillStyle = p.pursuing ? (this.flash ? '#ff2a2a' : '#2a5cff') : '#4d7dff';
      c.beginPath(); c.arc(p.x, p.z, 5 / k, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#ff5a4d';
    for (const o of g.officers) { c.beginPath(); c.arc(o.x, o.z, 3.2 / k, 0, Math.PI * 2); c.fill(); }
    // Last place the police saw you (red ring).
    if (g.dispatch.active && g.dispatch.sinceSeen >= 1) {
      c.strokeStyle = 'rgba(255,60,60,0.8)'; c.lineWidth = 1.5 / k;
      c.beginPath(); c.arc(g.dispatch.lastX, g.dispatch.lastZ, 9 / k, 0, Math.PI * 2); c.stroke();
    }

    // Player arrow in the middle.
    c.setTransform(R, 0, 0, R, 0, 0);
    const pfx = Math.sin(P.yaw), pfz = Math.cos(P.yaw);
    const ax = a * pfx + cc * pfz, ay = b * pfx + d * pfz, al = Math.hypot(ax, ay) || 1;
    const ux = ax / al, uy = ay / al;
    c.fillStyle = '#ffc531'; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + ux * 9, cy + uy * 9);
    c.lineTo(cx - ux * 6 - uy * 6, cy - uy * 6 + ux * 6);
    c.lineTo(cx - ux * 3, cy - uy * 3);
    c.lineTo(cx - ux * 6 + uy * 6, cy - uy * 6 - ux * 6);
    c.closePath(); c.fill(); c.stroke();
  }

  // Compass bar: heading in degrees with N / E / S / W (like shooter games).
  drawCompass() {
    const c = this.cctx, R = this.dpr, W = 300, H = 27;
    c.setTransform(R, 0, 0, R, 0, 0);
    c.clearRect(0, 0, W, H);
    const grad = c.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.2, 'rgba(0,0,0,0.35)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad; c.fillRect(0, 0, W, H);

    // Heading: 0 = north (+Z ... we call the -X/+Z grid "north" = camera yaw 0).
    let heading = (-this.game.camera3p.yaw * 180 / Math.PI) % 360;
    if (heading < 0) heading += 360;
    const pxPerDeg = 2.2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let deg = Math.floor(heading - 70); deg <= heading + 70; deg++) {
      if (deg % 15 !== 0) continue;
      const x = W / 2 + (deg - heading) * pxPerDeg;
      const d = ((deg % 360) + 360) % 360;
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d];
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      c.globalAlpha = Math.max(0, fade);
      if (label) {
        c.fillStyle = label === 'N' ? '#ffc531' : '#fff';
        c.font = 'bold 13px sans-serif'; c.fillText(label, x, 13);
      } else {
        c.fillStyle = '#fff'; c.fillRect(x - 0.5, 9, 1, d % 45 === 0 ? 9 : 5);
        if (d % 45 === 0) { c.font = '9px sans-serif'; c.fillText(String(d), x, 23); }
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#ffc531';
    c.beginPath(); c.moveTo(W / 2 - 4, 0); c.lineTo(W / 2 + 4, 0); c.lineTo(W / 2, 5); c.fill();
  }
}
