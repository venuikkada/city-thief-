// CUSTOMIZE CONTROLS (like PUBG): drag any button where your thumbs like it, make it bigger or
// smaller, more or less see-through. Separate layouts for ON FOOT and IN CAR buttons. Saved on the phone.
const KEY = 'cityThief.layout.v1';
const $ = (id) => document.getElementById(id);

// Buttons you can move (on foot / in car / both).
const FOOT = ['btn-fire', 'btn-fire-l', 'btn-aim', 'btn-reload', 'btn-jump', 'btn-crouch', 'btn-enter', 'btn-pickup', 'btn-takedown', 'btn-weapon', 'btn-color', 'btn-dance', 'interact'];
const CAR = ['btn-gas', 'btn-brake', 'btn-left', 'btn-right', 'btn-handbrake', 'btn-boost', 'btn-carfire', 'btn-horn', 'btn-exit', 'btn-cam', 'btn-drivemode', 'btn-weapon'];
const BOTH = ['btn-pause', 'btn-callcops'];

export function loadLayout() {
  try {
    const L = JSON.parse(localStorage.getItem(KEY) || '{}');
    // v8: new default car buttons (same places as the reference layout). Old saved car positions are dropped once.
    if ((L._v || 1) < 2) { for (const id of CAR) if (id !== 'btn-weapon') delete L[id]; L._v = 2; localStorage.setItem(KEY, JSON.stringify(L)); }
    return L;
  } catch (e) { return {}; }
}

// Put every saved button in its place (positions are % of the screen, so they fit any phone).
export function applyLayout(layout = loadLayout()) {
  for (const id of new Set([...FOOT, ...CAR, ...BOTH])) {
    const el = $(id);
    if (!el) continue;
    const L = layout[id];
    if (!L) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = el.style.opacity = el.style.translate = ''; continue; }
    el.style.left = L.x + '%'; el.style.top = L.y + '%'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.translate = 'none';
    el.style.transform = `translate(-50%, -50%) scale(${L.s})`;
    el.style.opacity = L.o;
  }
}

export class LayoutEditor {
  constructor(game) {
    this.game = game; this.layout = loadLayout(); this.sel = null; this.tab = 'foot';
    this.box = $('layout-editor');
    $('lay-foot').addEventListener('click', () => this.show('foot'));
    $('lay-car').addEventListener('click', () => this.show('car'));
    $('lay-size').addEventListener('input', (e) => this.setSel('s', Number(e.target.value)));
    $('lay-alpha').addEventListener('input', (e) => this.setSel('o', Number(e.target.value)));
    $('lay-reset').addEventListener('click', () => { this.layout = {}; applyLayout(this.layout); this.select(null); });
    $('lay-save').addEventListener('click', () => this.close(true));
    $('lay-cancel').addEventListener('click', () => this.close(false));
    this.dragging = null;
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => { this.dragging = null; });
  }

  open(returnTo) {
    const g = this.game;
    this.returnTo = returnTo; this.before = JSON.stringify(this.layout);
    this.prevMode = g.mode; g.mode = 'layout';
    g.controls.enabled = false; g.controls.releaseAll();
    document.body.classList.add('editing');
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.box.classList.remove('hidden');
    this.show(this.tab);
    // Each button can be grabbed.
    for (const id of new Set([...FOOT, ...CAR, ...BOTH])) {
      const el = $(id);
      if (!el || el.dataset.layoutHooked) continue;
      el.dataset.layoutHooked = '1';
      el.addEventListener('pointerdown', (e) => {
        if (!document.body.classList.contains('editing')) return;
        e.preventDefault(); e.stopPropagation();
        this.select(id);
        const r = el.getBoundingClientRect();
        this.dragging = { id, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
      }, true);
    }
  }

  show(tab) {
    this.tab = tab;
    const hud = $('hud');
    hud.classList.toggle('car', tab === 'car'); hud.classList.toggle('foot', tab === 'foot');
    $('lay-foot').classList.toggle('on', tab === 'foot'); $('lay-car').classList.toggle('on', tab === 'car');
    this.select(null);
  }

  select(id) {
    for (const x of document.querySelectorAll('.lay-sel')) x.classList.remove('lay-sel');
    this.sel = id;
    const ctl = $('lay-controls');
    if (!id) { ctl.classList.add('dim'); $('lay-name').textContent = 'Tap a button to move or resize it'; return; }
    $(id).classList.add('lay-sel');
    ctl.classList.remove('dim');
    const L = this.layout[id] || {};
    $('lay-size').value = L.s ?? 1; $('lay-alpha').value = L.o ?? 1;
    $('lay-name').textContent = ($(id).getAttribute('aria-label') || id.replace('btn-', '')).toUpperCase();
  }

  current(id) {
    if (this.layout[id]) return this.layout[id];
    const r = $(id).getBoundingClientRect();
    return { x: ((r.left + r.width / 2) / innerWidth) * 100, y: ((r.top + r.height / 2) / innerHeight) * 100, s: 1, o: 1 };
  }

  setSel(key, v) {
    if (!this.sel) return;
    const L = this.layout[this.sel] = this.current(this.sel);
    L[key] = v;
    applyLayout(this.layout);
  }

  move(e) {
    const d = this.dragging;
    if (!d) return;
    const L = this.layout[d.id] = this.current(d.id);
    L.x = Math.max(2, Math.min(98, ((e.clientX - d.dx) / innerWidth) * 100));
    L.y = Math.max(3, Math.min(97, ((e.clientY - d.dy) / innerHeight) * 100));
    applyLayout(this.layout);
  }

  close(save) {
    const g = this.game;
    if (save) { try { localStorage.setItem(KEY, JSON.stringify(this.layout)); } catch (e) { /* fine */ } }
    else { this.layout = JSON.parse(this.before); }
    applyLayout(this.layout);
    this.select(null);
    document.body.classList.remove('editing');
    this.box.classList.add('hidden');
    g.mode = this.prevMode === 'layout' ? 'menu' : this.prevMode;
    if (this.returnTo === 'pause') { g.showScreen('pause-screen'); }
    else { $('hud').classList.add('hidden'); g.showScreen('settings-screen'); }
  }
}
