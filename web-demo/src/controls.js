// Touch + mouse + keyboard input (PUBG-style).
// Phone: left side = floating joystick (push to the edge to sprint; drag far UP past the ring to
// LOCK sprint - you keep running with your thumb off), drag anywhere else = look.
// Buttons for on foot and in car. Fire buttons also turn the camera when you drag them.
// Computer: click the game to capture the mouse. Mouse = look, left click = fire, right click = aim.
const NONE = null;

export class Controls {
  constructor() {
    this.enabled = false;
    this.keys = new Set();
    this.held = {};
    this.pending = {};
    this.lookX = 0; this.lookY = 0;
    this.stickId = NONE; this.lookId = NONE;
    this.stickCx = 0; this.stickCy = 0; this.stickVec = { x: 0, y: 0 }; this.stickEdge = false;
    this.sprintLock = false; this.lockArmed = false;
    this.lockEl = document.getElementById('sprint-lock');
    this.lastLook = { x: 0, y: 0 };
    this.mouseFire = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');
    const layer = this.layer = document.getElementById('touch-layer');
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.moveEv(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));

    // name, held-type?, drag-to-look?
    const buttons = [
      ['btn-fire', 'fire', true, true], ['btn-fire-l', 'fire', true, true], ['btn-aim', 'aim', false, true],
      ['btn-reload', 'reload'], ['btn-jump', 'jump'], ['btn-crouch', 'crouch'], ['btn-slot1', 'slot1'], ['btn-slot2', 'slot2'],
      ['btn-enter', 'enter'], ['btn-pickup', 'pickup'], ['btn-callcops', 'callCops'],
      ['btn-gas', 'gas', true], ['btn-brake', 'brake', true], ['btn-handbrake', 'handbrake', true],
      ['btn-horn', 'horn', true], ['btn-cam', 'cam'], ['btn-exit', 'enter'],
      ['btn-boost', 'boost', true], ['btn-left', 'left', true], ['btn-right', 'right', true],
      ['btn-carfire', 'fire', true, true], ['btn-takedown', 'takedown'], ['btn-drivemode', 'drivemode'],
      ['btn-color', 'color'], ['btn-dance', 'dance'],
      ['btn-talk', 'talk'], ['btn-rob', 'rob'], ['btn-buy', 'buy'], ['btn-push', 'push'], ['btn-hire', 'hire'], ['btn-photo', 'photo'],
    ];
    for (const [id, name, held, look] of buttons) this.button(id, name, !!held, !!look);

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) {
        const map = { ' ': 'jump', c: 'crouch', r: 'reload', q: 'switch', e: 'enter', f: 'enter', g: 'pickup', p: 'callCops', v: 'cam', z: 'aim', m: 'map', t: 'takedown', x: 'color', b: 'dance', y: 'talk', u: 'rob', i: 'buy', o: 'push', h: 'hire', k: 'photo' };
        if (map[k]) this.pending[map[k]] = true;
        // 1 / 2 = gun slots (unless a "choose quiet or loud" question is on screen).
        if ((k === '1' || k === '2') && document.getElementById('choice').classList.contains('hidden')) this.pending[k === '1' ? 'slot1' : 'slot2'] = true;
      }
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse capture (computers).
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === layer && this.enabled) this.addLook(e.movementX * 0.9, e.movementY * 0.9);
    });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== layer || !this.enabled) return;
      if (e.button === 0) { this.mouseFire = true; this.pending.fire = true; }
      if (e.button === 2) { this.mouseAim = true; this.mouseAimChanged = true; }   // hold right button = aim
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2 && this.mouseAim) { this.mouseAim = false; this.mouseAimChanged = true; }
    });
    // Mouse wheel = swap guns.
    document.addEventListener('wheel', (e) => { if (document.pointerLockElement === layer && this.enabled && Math.abs(e.deltaY) > 4) this.pending.switch = true; }, { passive: true });
  }

  lockMouse() {
    if (this.isTouch || !this.layer.requestPointerLock) return;
    try {
      const r = this.layer.requestPointerLock();
      if (r && r.catch) r.catch(() => { /* needs a real click: fine */ });
    } catch (e) { /* fine */ }
  }

  button(id, name, isHeld, dragLooks) {
    const el = document.getElementById(id);
    if (!el) return;
    let pid = NONE, last = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (pid !== NONE || !this.enabled) return;
      pid = e.pointerId; last = { x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      el.classList.add('pressed');
      this.pending[name] = true;
      if (isHeld) this.held[name] = (this.held[name] || 0) + 1;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !dragLooks) return;
      this.addLook(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    });
    const release = (e) => {
      if (e.pointerId !== pid) return;
      pid = NONE; el.classList.remove('pressed');
      if (isHeld) this.held[name] = Math.max(0, (this.held[name] || 1) - 1);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  }

  down(e) {
    if (!this.enabled) return;
    if (!this.isTouch && document.pointerLockElement !== this.layer && e.pointerType === 'mouse') { this.lockMouse(); }
    e.preventDefault();
    const w = window.innerWidth, h = window.innerHeight;
    const inStickZone = e.clientX < w * 0.42 && e.clientY > h * 0.3;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    if (inStickZone && this.stickId === NONE) {
      if (this.sprintLock) this.cancelSprintLock();
      this.stickId = e.pointerId;
      this.stickCx = e.clientX; this.stickCy = e.clientY;
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.base.classList.remove('hidden');
      this.updateStick(e.clientX, e.clientY);
    } else if (this.lookId === NONE) {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  moveEv(e) {
    if (e.pointerId === this.stickId) this.updateStick(e.clientX, e.clientY);
    else if (e.pointerId === this.lookId) {
      this.addLook(e.clientX - this.lastLook.x, e.clientY - this.lastLook.y);
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  up(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = NONE; this.stickVec = { x: 0, y: 0 }; this.stickEdge = false;
      if (this.lockArmed) { this.sprintLock = true; this.lockArmed = false; this.lockEl?.classList.add('on'); }
      this.base.classList.add('hidden');
      this.knob.classList.remove('sprint');
      this.knob.style.transform = '';
    } else if (e.pointerId === this.lookId) this.lookId = NONE;
  }

  updateStick(x, y) {
    const radius = 75;
    let dx = (x - this.stickCx) / radius, dy = (y - this.stickCy) / radius;
    const raw = Math.hypot(dx, dy);
    if (raw > 1) { dx /= raw; dy /= raw; }
    this.knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
    const len = Math.min(raw, 1), dead = 0.08;
    if (len < dead) this.stickVec = { x: 0, y: 0 };
    else {
      const s = (len - dead) / (1 - dead);
      this.stickVec = { x: (dx / len) * s, y: (-dy / len) * s };
    }
    this.stickEdge = raw >= 1.22 && dy < -0.35;   // push past the ring (forwards) = sprint; a full push is a jog
    this.knob.classList.toggle('sprint', this.stickEdge);
    // Dragged far up past the ring: release to lock sprint.
    this.lockArmed = raw > 1.55 && dy < -0.85 && !document.body.classList.contains('in-car');
    this.base.classList.toggle('lock-armed', this.lockArmed);
  }

  cancelSprintLock() {
    this.sprintLock = false; this.lockArmed = false;
    this.lockEl?.classList.remove('on');
  }

  addLook(dx, dy) {
    const s = 1080 / Math.max(1, window.innerHeight);
    this.lookX += dx * s; this.lookY += dy * s;
  }

  releaseAll() {
    this.held = {}; this.pending = {}; this.mouseFire = false;
    if (this.mouseAim) { this.mouseAim = false; this.mouseAimChanged = true; }
    this.cancelSprintLock();
    this.stickVec = { x: 0, y: 0 }; this.stickEdge = false; this.stickId = NONE; this.lookId = NONE;
    this.base.classList.add('hidden');
  }

  // Called once per frame.
  poll() {
    let mx = this.stickVec.x, my = this.stickVec.y, sprint = this.stickEdge;
    if (this.sprintLock && this.stickId === NONE) { mx = 0; my = 1; sprint = true; }
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky) || 1; mx = kx / l; my = ky / l; }
    if (k.has('shift')) sprint = true;
    const h = (n) => (this.held[n] || 0) > 0;
    const p = this.pending;
    const out = {
      move: { x: mx, y: my }, sprint,
      look: { x: this.lookX, y: this.lookY },
      fire: h('fire') || this.mouseFire, firePressed: !!p.fire,
      aimPressed: !!p.aim, crouchPressed: !!p.crouch, jumpPressed: !!p.jump,
      reloadPressed: !!p.reload, switchPressed: !!p.switch, enterPressed: !!p.enter,
      pickupPressed: !!p.pickup, callCopsPressed: !!p.callCops, camPressed: !!p.cam,
      gas: h('gas') || k.has('w') || k.has('arrowup'), brake: h('brake') || k.has('s') || k.has('arrowdown'),
      handbrake: h('handbrake') || k.has(' '), horn: h('horn') || k.has('h'),
      boost: h('boost') || k.has('shift'), left: h('left'), right: h('right'), mapPressed: !!p.map,
      takedownPressed: !!p.takedown || !!p.pickup, drivemodePressed: !!p.drivemode,
      colorPressed: !!p.color, dancePressed: !!p.dance,
      talkPressed: !!p.talk, robPressed: !!p.rob, buyPressed: !!p.buy, pushPressed: !!p.push, hirePressed: !!p.hire, photoPressed: !!p.photo,
      slot1Pressed: !!p.slot1, slot2Pressed: !!p.slot2, mouseAim: !!this.mouseAim, mouseAimChanged: !!this.mouseAimChanged,
    };
    this.mouseAimChanged = false;
    this.lookX = 0; this.lookY = 0;
    this.pending = {};
    return out;
  }
}
