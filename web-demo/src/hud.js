// HUD: mini-map (turns with the camera), compass, wanted stars, mission panel, timer,
// weapon + ammo, health, car speed, context buttons (ENTER / PICK UP), subtitles, hit effects.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.root = $('hud');
    this.map = $('minimap'); this.mapSize = 150;
    this.map.width = this.mapSize * this.dpr; this.map.height = this.mapSize * this.dpr;
    this.ctx = this.map.getContext('2d');
    this.compass = $('compass');
    this.compass.width = 300 * this.dpr; this.compass.height = 27 * this.dpr;
    this.cctx = this.compass.getContext('2d');
    this.el = {
      status: $('status'), big: $('big-msg'), fps: $('fps'), stars: $('stars'), cross: $('crosshair'),
      hit: $('hitmarker'), aim: $('btn-aim'), crouch: $('btn-crouch'), weaponName: $('weapon-name'), ammo: $('ammo'),
      reloading: $('reloading'), health: $('health-fill'), carHealth: $('car-health-fill'), speedo: $('speedo'),
      enter: $('btn-enter'), pickup: $('btn-pickup'), objective: $('objective-text'), mTitle: $('mission-title'),
      timer: $('timer'), money: $('money'), subtitle: $('subtitle'), hurt: $('hurt'), panel: $('mission-panel'),
    };
    this.bigT = 0; this.frames = 0; this.fpsT = 0; this.flashT = 0; this.flash = false;
    this.ppm = 0.8;
    this.cache = {};
    this.subQueue = []; this.subT = 0;
    this.hurtT = 0; this.hitT = 0;
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  showBig(text, color, seconds) {
    const b = this.el.big;
    b.textContent = text; b.style.color = color;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    this.bigT = seconds;
  }

  setMission(title, objective) {
    this.el.mTitle.textContent = title;
    this.setObjective(objective);
  }

  setObjective(text) {
    this.el.objective.textContent = text;
    requestAnimationFrame(() => document.documentElement.style.setProperty('--mp-h', this.el.panel.offsetHeight + 6 + 'px'));
  }

  // Subtitles: [[speaker, text], ...] shown one after another.
  say(lines) {
    for (const l of lines) this.subQueue.push(l);
    if (this.subT <= 0) this.nextSub();
  }
  nextSub() {
    const l = this.subQueue.shift();
    if (!l) { this.el.subtitle.classList.add('hidden'); this.subT = 0; return; }
    const [who, text] = l;
    this.el.subtitle.innerHTML = (who ? `<b>${who}:</b>` : '') + text;
    this.el.subtitle.classList.remove('hidden');
    this.subT = Math.max(2.6, text.length * 0.065);
  }
  clearSubs() { this.subQueue = []; this.subT = 0; this.el.subtitle.classList.add('hidden'); }

  hurt() { this.hurtT = 0.35; this.el.hurt.classList.remove('hidden'); }
  hitMarker(kill) { this.hitT = 0.2; this.el.hit.classList.toggle('kill', !!kill); this.el.hit.classList.remove('hidden'); }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player, E = this.el;

    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      const fps = this.frames / this.fpsT;
      E.fps.textContent = `${fps.toFixed(0)} FPS`;
      this.frames = 0; this.fpsT = 0;
    }

    // Mode: on foot / in car.
    const mode = P.inCar ? 'car' : 'foot';
    if (this.cache.mode !== mode) { this.cache.mode = mode; this.root.classList.toggle('car', P.inCar); this.root.classList.toggle('foot', !P.inCar); }
    this.root.classList.toggle('free', !g.mission);

    // Chase status.
    let s = '', color = '#fff';
    if (D.active) {
      if (D.sinceSeen < 1) { s = D.stars >= 2 ? 'POLICE ARE SHOOTING - find cover!' : 'SPOTTED - break their line of sight!'; color = '#ff6a5c'; }
      else { s = `HIDDEN - stay out of sight ${Math.ceil(D.loseTime - D.sinceSeen)}s`; color = '#ffd633'; }
    }
    if (this.cache.status !== s) { this.cache.status = s; E.status.textContent = s; E.status.style.color = color; }

    // Wanted stars.
    const key = D.stars * 10 + (D.active && D.sinceSeen >= 1 ? 1 : 0);
    if (this.cache.stars !== key) {
      this.cache.stars = key;
      [...E.stars.children].forEach((el, i) => el.classList.toggle('on', i < D.stars));
      E.stars.classList.toggle('blink', D.active && D.sinceSeen >= 1);
    }

    // Weapon + ammo + health.
    const a = P.ammo[P.weapon];
    this.set('wn', E.weaponName, P.weaponDef.name);
    this.set('ammo', E.ammo, `${a.mag} / ${a.reserve}`);
    E.reloading.classList.toggle('hidden', P.reloadT <= 0);
    this.set('hp', E.health.style, Math.max(0, P.health).toFixed(0) + '%', 'width');
    E.health.classList.toggle('low', P.health < 35);
    this.set('money', E.money, '₹ ' + g.save.coins.toLocaleString('en-IN'));

    // Car.
    if (P.inCar && g.driving.car) {
      this.set('kmh', E.speedo, `${g.driving.kmh}<span>km/h</span>`, 'innerHTML');
      this.set('ch', E.carHealth.style, Math.max(0, g.driving.car.health).toFixed(0) + '%', 'width');
    }

    // Context buttons.
    const canEnter = !P.inCar && !P.dead && g.mode === 'play' && !!g.driving.nearestCar(P.x, P.z);
    E.enter.classList.toggle('hidden', !canEnter);
    const canPick = !P.inCar && !P.dead && !!g.pickups.near(P.x, P.z);
    E.pickup.classList.toggle('hidden', !canPick);

    E.aim.classList.toggle('active', P.aiming);
    E.crouch.classList.toggle('active', P.crouching);
    // Crosshair opens up while moving / shooting.
    const spread = 6 + Math.min(14, Math.hypot(P.vx, P.vz) * 1.5 + g.camera3p.recoil * 4) * (P.aiming ? 0.5 : 1);
    E.cross.style.setProperty('--gap', spread.toFixed(1) + 'px');

    // Timer.
    const m = g.mission;
    if (m && m.timeLeft !== null && !m.done) {
      const t = Math.max(0, Math.ceil(m.timeLeft));
      this.set('timer', E.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      E.timer.classList.remove('hidden');
      E.timer.classList.toggle('low', t <= 20);
    } else E.timer.classList.add('hidden');

    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) E.big.classList.add('hidden'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.nextSub(); }
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) E.hurt.classList.add('hidden'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) E.hit.classList.add('hidden'); }

    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashT = 0.3; this.flash = !this.flash; }
    this.drawMap();
    this.drawCompass();
  }

  drawMap() {
    const g = this.game, P = g.player, c = this.ctx, S = this.mapSize, k = this.ppm;
    const yaw = g.camera3p.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
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
    for (const p of g.pickups.list) { c.fillStyle = p.type === 'health' ? '#ff6b6b' : p.type === 'ammo' ? '#8fff6b' : '#ffc531'; c.fillRect(p.x - 2 / k, p.z - 2 / k, 4 / k, 4 / k); }
    for (const p of g.policeCars) {
      c.fillStyle = p.pursuing ? (this.flash ? '#ff2a2a' : '#2a5cff') : '#4d7dff';
      c.beginPath(); c.arc(p.x, p.z, 5 / k, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#ff5a4d';
    for (const o of g.officers) { if (o.dead) continue; c.beginPath(); c.arc(o.x, o.z, 3.2 / k, 0, Math.PI * 2); c.fill(); }
    if (g.dispatch.active && g.dispatch.sinceSeen >= 1) {
      c.strokeStyle = 'rgba(255,60,60,0.8)'; c.lineWidth = 1.5 / k;
      c.beginPath(); c.arc(g.dispatch.lastX, g.dispatch.lastZ, 9 / k, 0, Math.PI * 2); c.stroke();
    }
    // Mission marker (clamped to the edge if far away).
    const mk = g.marker;
    c.setTransform(R, 0, 0, R, 0, 0);
    if (mk) {
      let mx = a * mk.x + cc * mk.z + e, my = b * mk.x + d * mk.z + f;
      const ddx = mx - cx, ddy = my - cy, dl = Math.hypot(ddx, ddy), lim = S / 2 - 8;
      if (dl > lim) { mx = cx + ddx / dl * lim; my = cy + ddy / dl * lim; }
      c.fillStyle = '#ffc531'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(mx, my, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    const pfx = Math.sin(P.yaw), pfz = Math.cos(P.yaw);
    const ax = a * pfx + cc * pfz, ay = b * pfx + d * pfz, al = Math.hypot(ax, ay) || 1;
    const ux = ax / al, uy = ay / al;
    c.fillStyle = '#ffffff'; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + ux * 9, cy + uy * 9);
    c.lineTo(cx - ux * 6 - uy * 6, cy - uy * 6 + ux * 6);
    c.lineTo(cx - ux * 3, cy - uy * 3);
    c.lineTo(cx - ux * 6 + uy * 6, cy - uy * 6 - ux * 6);
    c.closePath(); c.fill(); c.stroke();
  }

  drawCompass() {
    const g = this.game, c = this.cctx, R = this.dpr, W = 300, H = 27;
    c.setTransform(R, 0, 0, R, 0, 0);
    c.clearRect(0, 0, W, H);
    const grad = c.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.2, 'rgba(0,0,0,0.35)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad; c.fillRect(0, 0, W, H);
    let heading = (-g.camera3p.yaw * 180 / Math.PI) % 360;
    if (heading < 0) heading += 360;
    const pxPerDeg = 2.2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let deg = Math.floor(heading - 70); deg <= heading + 70; deg++) {
      if (deg % 15 !== 0) continue;
      const x = W / 2 + (deg - heading) * pxPerDeg;
      const dd = ((deg % 360) + 360) % 360;
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd];
      c.globalAlpha = Math.max(0, 1 - Math.abs(x - W / 2) / (W / 2));
      if (label) { c.fillStyle = label === 'N' ? '#ffc531' : '#fff'; c.font = 'bold 13px sans-serif'; c.fillText(label, x, 13); }
      else { c.fillStyle = '#fff'; c.fillRect(x - 0.5, 9, 1, dd % 45 === 0 ? 9 : 5); }
    }
    c.globalAlpha = 1;
    // Mission marker on the compass with distance.
    const mk = g.marker, P = g.player;
    if (mk) {
      const ang = Math.atan2(mk.x - P.x, mk.z - P.z);
      let md = (-ang * 180 / Math.PI) - heading;
      md = ((md + 540) % 360) - 180;
      const x = Math.max(8, Math.min(W - 8, W / 2 + md * pxPerDeg));
      c.fillStyle = '#ffc531';
      c.beginPath(); c.moveTo(x, 20); c.lineTo(x - 5, 26); c.lineTo(x + 5, 26); c.fill();
      c.font = 'bold 9px sans-serif';
      c.fillText(Math.round(Math.hypot(mk.x - P.x, mk.z - P.z)) + 'm', x, 4);
    }
    c.fillStyle = '#ffc531';
    c.beginPath(); c.moveTo(W / 2 - 4, 0); c.lineTo(W / 2 + 4, 0); c.lineTo(W / 2, 5); c.fill();
  }
}
