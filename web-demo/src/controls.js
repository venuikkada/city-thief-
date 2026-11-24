// Touch + mouse + keyboard input (PUBG-style).
// Left part of the screen: floating joystick (push to the edge = sprint).
// Anywhere else: drag to look. Buttons on the right.
const NONE = null;

export class Controls {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.sprint = false;
    this.lookX = 0; this.lookY = 0;
    this.jumpPressed = false; this.crouchPressed = false; this.aimPressed = false; this.callCopsPressed = false;
    this.pending = { jump: false, crouch: false, aim: false, callCops: false };
    this.keys = new Set();
    this.enabled = false;

    this.stickId = NONE; this.lookId = NONE;
    this.stickCx = 0; this.stickCy = 0; this.stickVec = { x: 0, y: 0 }; this.stickEdge = false;
    this.lastLook = { x: 0, y: 0 };

    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');
    const layer = document.getElementById('touch-layer');
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.moveEv(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));

    this.button('btn-jump', 'jump');
    this.button('btn-crouch', 'crouch');
    this.button('btn-aim', 'aim', true);
    this.button('btn-callcops', 'callCops');

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) {
        if (k === ' ') this.pending.jump = true;
        if (k === 'c') this.pending.crouch = true;
        if (k === 'q') this.pending.aim = true;
        if (k === 'p') this.pending.callCops = true;
      }
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Buttons: tap = action. "dragLooks": dragging on it also turns the camera.
  button(id, name, dragLooks = false) {
    const el = document.getElementById(id);
    let pid = NONE, last = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (pid !== NONE) return;
      pid = e.pointerId; last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      this.pending[name] = true;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !dragLooks) return;
      this.addLook(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    });
    const release = (e) => { if (e.pointerId !== pid) return; pid = NONE; el.classList.remove('pressed'); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const w = window.innerWidth, h = window.innerHeight;
    const inStickZone = e.clientX < w * 0.42 && e.clientY > h * 0.3;
    e.target.setPointerCapture(e.pointerId);
    if (inStickZone && this.stickId === NONE) {
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
    const len = Math.min(raw, 1);
    const dead = 0.08;
    if (len < dead) this.stickVec = { x: 0, y: 0 };
    else {
      const s = (len - dead) / (1 - dead);
      this.stickVec = { x: (dx / len) * s, y: (-dy / len) * s };   // screen up = forward
    }
    this.stickEdge = raw >= 0.97;
    this.knob.classList.toggle('sprint', this.stickEdge);
  }

  // Finger movement scaled to a 1080p-high screen, so it feels the same on every phone.
  addLook(dx, dy) {
    const s = 1080 / Math.max(1, window.innerHeight);
    this.lookX += dx * s; this.lookY += dy * s;
  }

  // Called once per frame: collects everything for this frame.
  poll() {
    let mx = this.stickVec.x, my = this.stickVec.y, sprint = this.stickEdge;
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    if (k.has('shift')) sprint = true;

    this.move = { x: mx, y: my };
    this.sprint = sprint;
    this.look = { x: this.lookX, y: this.lookY };
    this.lookX = 0; this.lookY = 0;
    this.jumpPressed = this.pending.jump;
    this.crouchPressed = this.pending.crouch;
    this.aimPressed = this.pending.aim;
    this.callCopsPressed = this.pending.callCops;
    this.pending = { jump: false, crouch: false, aim: false, callCops: false };
    return this;
  }
}
