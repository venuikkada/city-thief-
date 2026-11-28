// HUD: mini-map (turns with the camera, GPS route, police search circle), full-screen map
// (tap to set a waypoint), compass, wanted stars, mission panel, timer, weapon + ammo, health,
// car speed + nitro, context buttons (ENTER / PICK UP), subtitles, messages, hit effects.
import * as THREE from 'three';
import { WEAPONS, GUN_ICONS, SIGHTS } from './weapons.js';
import { t as tr, localTask, localNext, localLast, localAct, getLang } from './i18n.js';
const $ = (id) => document.getElementById(id);
const _v3 = new THREE.Vector3();

// Scope reticles (drawn in a lens 200 wide, middle at 0,0). 2X: red dot in a ring. 4X: a red chevron
// with bullet-drop marks. 8X: fine cross-hairs with thick posts and range dots (a sniper scope).
const RETICLES = {
  x2: '<circle r="15" fill="none" stroke="#ff3030" stroke-width="0.9" opacity="0.9"/><circle r="1.7" fill="#ff2a2a"/>'
    + '<path d="M0 -15v-5M0 15v5M-15 0h-5M15 0h5" stroke="#ff3030" stroke-width="1.2"/>',
  x4: '<path d="M-100 0h86M14 0h86M0 9v91" stroke="#111" stroke-width="0.9"/>'
    + '<path d="M-5 22h10M-4 32h8M-3 42h6M-2 52h4" stroke="#111" stroke-width="1.1"/>'
    + '<path d="M0 0l-5.5 9h2.6L0 3.6 2.9 9h2.6z" fill="#ff2a2a" stroke="#600" stroke-width="0.3"/>',
  x8: '<path d="M-100 0h100h100M0 -100v200" stroke="#111" stroke-width="0.45"/>'
    + '<path d="M-100 0h48M52 0h48M0 52v48M0 -100v48" stroke="#111" stroke-width="3.2"/>'
    + [10, 20, 30, 40].map((d) => `<circle cx="${d}" r="1.1"/><circle cx="${-d}" r="1.1"/><circle cy="${d}" r="1.1"/><circle cy="${-d}" r="1.1"/>`).join('')
    + '<circle r="0.9" fill="#ff2a2a"/>',
};

// The whole city drawn once into a picture (fast: one drawImage per frame).
const MAP = { x0: -282, z0: -300, x1: 282, z1: 282, s: 1.6 };
const MAP_COLORS = { water: '#2f6f8f', sand: '#cdb88f', block: '#5a5f57', park: '#4f7a3c', road: '#a3a6ae', building: '#2b2f36' };
const LABELS = [
  ['MARINE DRIVE', 0, -244], ['NAVAPUR BAY', 0, -286], ['DOWNTOWN', 0, -37.5], ['BAZAAR', -187.5, -112.5], ['BAZAAR', 112.5, -112.5],
  ['BAZAAR', 37.5, 112.5], ['PARK', -112.5, 37.5], ['GARDENS', 187.5, 37.5], ['TOWERS', 112.5, 112.5], ['NORTH PARK', -37.5, 187.5],
  ['WAREHOUSE', -37.5, 37.5], ['OLD TOWN', -150, 150], ['OLD TOWN', 150, 187.5],
];

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
      hit: $('hitmarker'), aim: $('btn-aim'), crouch: $('btn-crouch'), slots: [$('btn-slot1'), $('btn-slot2'), $('btn-slot3')], scope: $('scope'), scopeSvg: document.querySelector('#scope svg'), scopeZoom: document.querySelector('#scope .zoom'), reddot: $('reddot'), sightBtn: $('btn-sight'), ring: $('reload-ring'),
      dmg: $('dmg-nums'), kf: $('killfeed'),
      reloading: $('reloading'), health: $('health-fill'), carHealth: $('car-health-fill'), speedo: $('speedo'),
      enter: $('btn-enter'), pickup: $('btn-pickup'), objective: $('objective-text'), mTitle: $('mission-title'),
      timer: $('timer'), money: $('money'), subtitle: $('subtitle'), hurt: $('hurt'), panel: $('mission-panel'),
      boost: $('boost-fill'), toast: $('toast'), bigmap: $('bigmap'), bigCanvas: $('bigmap-canvas'),
      popups: $('popups'), drift: $('drift-hud'), progress: $('progress'), progLabel: $('progress-label'), progFill: $('progress-fill'),
      boss: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'), race: $('race-hud'), raceBig: $('race-pos'), raceSub: $('race-sub'),
      count: $('countdown'), card: $('mission-card'), rank: $('rankup'), armor: $('armor-fill'), takedown: $('btn-takedown'),
    };
    if (!/fps/.test(location.search)) this.el.fps.style.display = 'none';   // add ?fps to the address to see it
    this.bigT = 0; this.frames = 0; this.fpsT = 0; this.flashT = 0; this.flash = false; this.toastT = 0;
    this.ppm = 0.8;
    this.cache = {};
    this.subQueue = []; this.subT = 0;
    this.hurtT = 0; this.hitT = 0;
    this.route = null; this.routeT = 0; this.routeFor = null;
    this.buildMapImage();
    $('map-wrap').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.openMap(); });
    this.el.bigCanvas.addEventListener('pointerdown', (e) => this.bigMapTap(e));
    $('bigmap-close').addEventListener('pointerdown', (e) => { e.stopPropagation(); game.closeMap(); });
    // v10.1: STEPS opens the whole mission, step by step (and Vikram says the current step again).
    $('btn-steps').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleSteps(undefined, 0, true); });
    $('step-list').addEventListener('pointerdown', (e) => e.stopPropagation());   // (the game's touch controls ignore it; it can scroll)
    $('step-list').addEventListener('click', (e) => { e.stopPropagation(); this.toggleSteps(false); });   // tap the list: close it
  }

  buildMapImage() {
    const W = Math.round((MAP.x1 - MAP.x0) * MAP.s), H = Math.round((MAP.z1 - MAP.z0) * MAP.s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#3b4136'; g.fillRect(0, 0, W, H);
    g.setTransform(MAP.s, 0, 0, MAP.s, -MAP.x0 * MAP.s, -MAP.z0 * MAP.s);
    const rects = this.game.world.mapRects;
    for (const kind of ['water', 'sand', 'block', 'park', 'road', 'building']) {
      g.fillStyle = MAP_COLORS[kind];
      for (const r of rects) if (r.kind === kind) g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
    this.mapImage = c;
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  showBig(text, color, seconds) {
    const b = this.el.big;
    b.textContent = tr(text); b.style.color = color; b.style.setProperty('--c', color);   // in the player's language when we have it
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    this.bigT = seconds;
  }

  // Small message under the stars (roadblock ahead, new car, ...).
  toast(text) {
    const t = this.el.toast;
    t.textContent = tr(text); t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    this.toastT = 2.6;
  }

  // Sutli bombs left (the BOMB button hides at 0).
  setBombs(n) {
    const b = $('btn-bomb'), c = $('bomb-count');
    if (c) c.textContent = n;
    if (b) b.classList.toggle('hidden', !(n > 0));
  }
  // "STEP 3/9": every mission is one step after another (v9.5 tasks, v10.1 numbered steps). A tick when done.
  setTask(text) {
    const e = this.el.task || (this.el.task = $('task-no'));
    if (!e) return;
    e.textContent = typeof text === 'number' ? `TASK ${text}` : text; e.className = '';
    void e.offsetWidth; e.className = 'pop';
    if (this.game.audio && this.game.audio.chime) this.game.audio.chime(0.35);
  }
  taskDone(text) {
    const e = this.el.task || (this.el.task = $('task-no'));
    if (!e) return;
    e.textContent = typeof text === 'number' ? `TASK ${text} ✓` : text; e.className = '';
    void e.offsetWidth; e.className = 'done pop';
  }

  // v10.1: the mission step by step. info = { n, N, next, plan } from the mission (null = no mission):
  // NEXT ▸ the step after this one, and the list of all steps (done ✓ / NOW / to do) behind STEPS.
  setSteps(info) {
    const E = this.stepEl || (this.stepEl = { next: $('next-step'), list: $('step-list'), btn: $('btn-steps') });
    if (!info || !info.N) {
      E.next.classList.add('hidden'); E.btn.classList.add('hidden'); E.list.classList.add('hidden'); E.btn.classList.remove('open');
      this.el.panel.classList.remove('has-steps', 'steps-open'); this.stepsOpen = false; this.stepsKey = ''; clearTimeout(this.stepsT);
      this.hideHow();
      return;
    }
    E.btn.classList.remove('hidden'); this.el.panel.classList.add('has-steps');
    const nx = info.next ? localNext(info.next.label) : localLast();
    if (E.next.textContent !== nx) E.next.textContent = nx;
    E.next.classList.remove('hidden');
    const key = `${info.n}/${info.N}/${info.plan.length}/${getLang()}`;
    if (key === this.stepsKey) return;
    this.stepsKey = key;
    E.list.textContent = '';
    let n = 0;
    for (const p of info.plan) {
      const li = document.createElement('li');
      if (p.head) { li.className = 'head'; li.textContent = p.act ? localAct(p.act) : p.head; E.list.appendChild(li); continue; }
      n++;
      li.className = n < info.n ? 'done' : n === info.n ? 'now' : '';
      const b = document.createElement('b'); b.textContent = n < info.n ? '✓' : String(n);
      li.appendChild(b); li.appendChild(document.createTextNode(localTask(p.label)));
      E.list.appendChild(li);
      // v10.3: under the step being done - HOW to do it.
      if (n === info.n && info.how && info.how.lines.length) {
        const h = document.createElement('li'); h.className = 'howli';
        for (const l of info.how.lines) { const d = document.createElement('div'); d.textContent = l; h.appendChild(d); }
        E.list.appendChild(h);
      }
    }
    if (this.stepsOpen) this.scrollToNow();
  }
  // v10.3: the help box (left, under the map): HOW to do the current task. sec = how long it stays.
  showHow(h, sec = 10) {
    const box = this.howEl || (this.howEl = $('howbox'));
    if (!box || !h || !h.lines || !h.lines.length) return;
    box.textContent = '';
    const t = document.createElement('div'); t.className = 'ht'; t.textContent = `❓ ${h.title}`; box.appendChild(t);
    const ol = document.createElement('ol');
    for (const l of h.lines) { const li = document.createElement('li'); li.textContent = l; ol.appendChild(li); }
    box.appendChild(ol);
    box.classList.remove('hidden', 'pop'); void box.offsetWidth; box.classList.add('pop');
    clearTimeout(this.howT); this.howT = setTimeout(() => box.classList.add('hidden'), sec * 1000);
  }
  hideHow() { clearTimeout(this.howT); const box = this.howEl || $('howbox'); if (box) box.classList.add('hidden'); }
  scrollToNow() {
    const E = this.stepEl, now = E && E.list.querySelector('.now');
    if (now) E.list.scrollTop = Math.max(0, now.offsetTop - E.list.clientHeight / 2 + now.offsetHeight / 2);
  }
  // Open / close the list. sec > 0: close again by itself (the plan at the start of a mission).
  // ask: Vikram says the current step again (the player tapped STEPS).
  toggleSteps(open = !this.stepsOpen, sec = 0, ask = false) {
    const E = this.stepEl || (this.stepEl = { next: $('next-step'), list: $('step-list'), btn: $('btn-steps') });
    if (E.btn.classList.contains('hidden')) open = false;
    this.stepsOpen = open;
    E.list.classList.toggle('hidden', !open); E.btn.classList.toggle('open', open); this.el.panel.classList.toggle('steps-open', open);
    clearTimeout(this.stepsT);
    if (open) { this.scrollToNow(); if (sec > 0) this.stepsT = setTimeout(() => this.toggleSteps(false), sec * 1000); }
    if (open && ask && this.game.mission && this.game.voice) this.game.voice.repeatObjective();
  }

  setMission(title, objective) {
    const tn = this.el.task || (this.el.task = $('task-no'));
    if (tn) tn.className = 'hidden';
    this.setSteps(null);
    this.el.mTitle.textContent = title;
    this.setObjective(objective);
  }

  // "ACT 2/3 · THE JOB · 03:12" under the mission title ('' hides it).
  setClock(text) {
    const e = this.clockEl || (this.clockEl = document.getElementById('mission-clock'));
    if (!e) return;
    if (e.textContent !== text) e.textContent = text;
    e.classList.toggle('hidden', !text);
  }

  setObjective(text) {
    const o = this.el.objective;
    if (o.textContent !== text) {
      // A new objective is shown in full (highlighted) for a few seconds, then shrinks to 2 lines.
      o.textContent = text;
      this.el.panel.classList.add('fresh');
      clearTimeout(this.freshT);
      this.freshT = setTimeout(() => { this.el.panel.classList.remove('fresh'); document.documentElement.style.setProperty('--mp-h', this.el.panel.offsetHeight + 6 + 'px'); }, 7000);
    }
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
    // Spoken out loud in the character's voice (the line stays up until the voice finishes).
    const V = this.game.voice;
    if (V && V.enabled && V.say(who, text, { prio: 3 })) this.subT = Math.max(1.2, Math.min(this.subT, text.length * 0.045));
  }
  clearSubs() { this.subQueue = []; this.subT = 0; this.el.subtitle.classList.add('hidden'); }

  hurt() { this.hurtT = 0.35; this.el.hurt.classList.remove('hidden'); }
  // White X = hit, yellow = headshot, red = kill.
  hitMarker(kill, head) {
    const e = this.el.hit;
    this.hitT = 0.22; e.classList.toggle('kill', !!kill); e.classList.toggle('head', !!head && !kill);
    e.classList.remove('hidden'); e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
  }
  // A number floats up where the bullet hit.
  damageNumber(point, n, head, kill) {
    const box = this.el.dmg;
    if (!box || box.children.length > 8) return;
    _v3.copy(point).project(this.game.camera);
    if (_v3.z > 1) return;
    const d = document.createElement('div');
    d.className = 'dmg' + (kill ? ' kill' : head ? ' head' : '');
    d.textContent = n;
    d.style.left = ((_v3.x + 1) / 2 * 100 + (Math.random() - 0.5) * 3) + '%';
    d.style.top = ((1 - _v3.y) / 2 * 100) + '%';
    d.addEventListener('animationend', () => d.remove());
    box.appendChild(d);
  }
  // Kill feed: "VIKRAM [gun] SWAT OFFICER  HEADSHOT".
  killFeed(target, gunName, head) {
    const box = this.el.kf;
    if (!box) return;
    while (box.children.length > 2) box.firstChild.remove();
    const who = target.bossName ? target.bossName.toUpperCase() : target.swat ? 'SWAT OFFICER' : target.gang ? 'GANG MEMBER' : target.isOfficer ? 'POLICE OFFICER' : 'ENEMY';
    const id = Object.keys(WEAPONS).find((k) => WEAPONS[k].name === gunName) || 'pistol';
    const d = document.createElement('div');
    d.className = 'kf';
    d.innerHTML = `VIKRAM<svg viewBox="0 0 24 12"><path d="${GUN_ICONS[id]}"/></svg>${who}${head ? '<span class="hs">HEADSHOT</span>' : ''}`;
    d.addEventListener('animationend', (e) => { if (e.animationName === 'kfout') d.remove(); });
    box.appendChild(d);
  }

  // ---------- Juice: pop-ups, meters, cards ----------
  // Floating reward text (+₹500, HEADSHOT, DOUBLE KILL...).
  popup(text, kind = 'cash') {
    const box = this.el.popups;
    while (box.children.length > 5) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'pop ' + kind; d.textContent = text;
    d.addEventListener('animationend', () => d.remove());
    box.appendChild(d);
  }
  setDrift(points, mult = 1) {
    const e = this.el.drift;
    if (!points) { e.classList.add('hidden'); return; }
    e.classList.remove('hidden');
    e.innerHTML = `DRIFT <b>${Math.round(points).toLocaleString('en-IN')}</b>${mult > 1 ? ` <i>x${mult}</i>` : ''}`;
  }
  setProgress(label, frac, color = '#ffc531') {
    const E = this.el;
    E.progress.classList.remove('hidden');
    this.set('pl', E.progLabel, label);
    E.progFill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    E.progFill.style.background = color;
    this.progressOn = true;
  }
  hideProgress() { this.el.progress.classList.add('hidden'); this.progressOn = false; }
  setBoss(name, frac) {
    const E = this.el;
    if (!name) { E.boss.classList.add('hidden'); return; }
    E.boss.classList.remove('hidden');
    this.set('bn', E.bossName, name);
    E.bossFill.style.width = Math.round(Math.max(0, frac) * 100) + '%';
  }
  setRace(big, sub) {
    const E = this.el;
    if (!big) { E.race.classList.add('hidden'); return; }
    E.race.classList.remove('hidden');
    this.set('rb', E.raceBig, big); this.set('rs', E.raceSub, sub || '');
  }
  countdown(text) {
    const c = this.el.count;
    c.textContent = text; c.classList.remove('hidden');
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    clearTimeout(this.countT); this.countT = setTimeout(() => c.classList.add('hidden'), 900);
  }
  // Big cinematic title when a mission starts.
  card(small, title, brief) {
    const c = this.el.card;
    c.innerHTML = `<div class="small">${small}</div><div class="title">${title}</div><div class="brief">${brief}</div>`;
    c.classList.remove('hidden');
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    clearTimeout(this.cardT); this.cardT = setTimeout(() => c.classList.add('hidden'), 3600);
  }
  rankUp(rank) {
    const r = this.el.rank;
    r.innerHTML = `<div class="small">RANK UP!</div><div class="title">${rank.name}</div>${rank.perk ? `<div class="perk">Unlocked: ${rank.perk}</div>` : ''}`;
    r.classList.remove('hidden');
    r.style.animation = 'none'; void r.offsetWidth; r.style.animation = '';
    clearTimeout(this.rankT); this.rankT = setTimeout(() => r.classList.add('hidden'), 3800);
  }

  // Where the GPS leads: the waypoint you set on the map, else the mission marker.
  get goal() { const g = this.game; return g.waypoint || g.marker || (!g.mission && g.freeOffer) || null; }

  update(dt) {
    const g = this.game, D = g.dispatch, P = g.player, E = this.el;

    // Real frames per second (wall clock, not game time).
    const now = performance.now();
    this.frames++;
    if (!this.fpsStart) this.fpsStart = now;
    if (now - this.fpsStart >= 500) {
      E.fps.textContent = `${Math.round(this.frames * 1000 / (now - this.fpsStart))} FPS`;
      this.frames = 0; this.fpsStart = now;
    }

    // Mode: on foot / in car.
    const mode = P.inCar ? 'car' : 'foot';
    if (this.cache.mode !== mode) { this.cache.mode = mode; this.root.classList.toggle('car', P.inCar); this.root.classList.toggle('foot', !P.inCar); document.body.classList.toggle('in-car', P.inCar); }
    this.root.classList.toggle('free', !g.mission);

    // Chase status: how to escape.
    let s = '', color = '#fff';
    if (D.active && D.arrestT > 0) {
      // A cop has him: the one-minute fight.
      s = `${tr('FIGHT BACK!')} ${Math.ceil(D.arrestT)}s · ${tr('beat the cops or get away')}`; color = '#ff3b30';
    } else if (D.responding) {
      // v10: the police are on the way - this is the time to finish the job or get ready.
      const left = Math.max(0, Math.ceil(D.respondT));
      s = `🚓 ${tr('COPS IN')} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${D.losingTask() ? tr('leave the red circle to lose them') : tr('finish the job - a new SIM or shirt can lose them')}`; color = '#ffb020';   // short first part: phones show only ~20 letters
    } else if (D.active && D.graceLeft > 0 && D.sinceSeen < 1 && !D.lullOn) {
      // The first 2 minutes after the police arrive: they cannot kill or arrest him yet.
      const left = Math.ceil(D.graceLeft);
      s = `🛡 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${tr('police can\'t stop you yet - take them down!')}`; color = '#7dd3ff';
    } else if (D.active && D.lullOn) {
      // The breather: the police backup comes when this reaches 0:00.
      const left = Math.max(0, Math.ceil(D.lullT));
      s = `${tr('BACKUP IN')} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${tr('finish the job fast!')}`; color = '#ffb020';
    } else if (D.active) {
      const T = D.target;
      const outside = Math.hypot(T.x - D.circle.x, T.z - D.circle.z) > D.circle.r;
      if (D.sinceSeen < 1) { s = tr(D.stars >= 2 ? 'UNDER FIRE · get out of sight' : 'SPOTTED · run, don\'t get caught'); color = '#ff6a5c'; }
      else if (outside) { s = `${tr('OUT OF AREA · hide')} ${Math.max(0, D.escapeTime - D.outsideT).toFixed(1)}s`; color = '#7dff8a'; }
      else { s = `${tr('HIDDEN · leave red circle')} ${Math.ceil(D.loseTime - D.sinceSeen)}s`; color = '#ffd633'; }
    }
    if (this.cache.status !== s) { this.cache.status = s; E.status.textContent = s; E.status.style.color = color; E.status.style.setProperty('--c', color); E.status.classList.toggle('on', !!s); }

    // Wanted stars.
    const lost = D.active && !D.responding && D.sinceSeen >= 1;   // blinking stars = they lost sight of him
    const key = D.stars * 10 + (lost ? 1 : 0);
    if (this.cache.stars !== key) {
      this.cache.stars = key;
      [...E.stars.children].forEach((el, i) => el.classList.toggle('on', i < D.stars));
      E.stars.classList.toggle('blink', lost);
    }

    // Gun slots (1 + 2 main guns, 3 pistol): picture, name, bullets, its sight; the one in his hands is lit.
    for (let n = 1; n <= 3; n++) {
      const el = E.slots[n - 1], id = P.slots[n];
      if (!el) continue;
      const sd = id ? P.sightOf[id] || WEAPONS[id].sight : '';
      const key = id ? `${id}|${P.ammo[id].mag}|${P.ammo[id].reserve}|${P.weapon === id ? 1 : 0}|${sd}` : 'empty';
      if (this.cache['slot' + n] === key) continue;
      this.cache['slot' + n] = key;
      el.classList.toggle('empty', !id); el.classList.toggle('on', !!id && P.weapon === id);
      el.querySelector('path').setAttribute('d', id ? GUN_ICONS[id] : '');
      el.querySelector('.nm').textContent = id ? WEAPONS[id].name : n === 3 ? 'PISTOL' : 'EMPTY';
      el.querySelector('.am').textContent = id ? `${P.ammo[id].mag} | ${P.ammo[id].reserve}` : n === 3 ? '-' : 'PICK UP';
      const tag = el.querySelector('.sg'); if (tag) tag.textContent = id && sd !== 'iron' ? SIGHTS[sd].label : '';
      el.classList.toggle('low', !!id && P.ammo[id].mag <= Math.ceil(WEAPONS[id].mag * 0.2));
    }
    // Empty hands: FIRE = PUNCH (a fist on the button), no crosshair lines.
    if (this.cache.armed !== P.armed) { this.cache.armed = P.armed; this.root.classList.toggle('unarmed', !P.armed); }
    // SIGHT button: shown when the gun in his hands has more than one sight to choose from.
    const sid = P.sightId, sKey = P.armed && P.sightChoices().length > 1 ? SIGHTS[sid].label : '';
    if (this.cache.sightBtn !== sKey) { this.cache.sightBtn = sKey; E.sightBtn.classList.toggle('hidden', !sKey); E.sightBtn.querySelector('b').textContent = sKey; }
    E.reloading.classList.toggle('hidden', P.reloadT <= 0);
    // Reload circle + crosshair (opens with spread, red over an enemy, red dot / scope while aiming).
    if (P.reloadT > 0 && !P.inCar) { E.ring.classList.remove('hidden'); E.ring.style.setProperty('--p', (1 - P.reloadT / (P.reloadTotal || 1)).toFixed(3)); }
    else E.ring.classList.add('hidden');
    const cam3 = g.camera3p, w = P.weaponDef, ads = cam3.aimBlend;
    const fovR = (g.camera.fov * Math.PI) / 360;
    const gap = Math.max(3, Math.min(70, (P.spreadNow / Math.tan(fovR)) * (innerHeight / 2)));
    const gapPx = Math.round(gap) + 'px';
    if (this.cache.gap !== gapPx) { this.cache.gap = gapPx; E.cross.style.setProperty('--gap', gapPx); }
    this.crossT = (this.crossT || 0) - dt;
    if (this.crossT <= 0) {
      this.crossT = 0.1;
      g.camera.getWorldDirection(_v3);
      const t = !P.inCar && !P.dead ? cam3.findTarget(g.camera.position, _v3, ads > 0.5 ? 1.0 : 1.6, w.range) : null;
      E.cross.classList.toggle('enemy', !!t);
    }
    // Looking down the sight there is no crosshair: the iron sight, the red dot or the scope is the aim.
    const fp = P.fp && !P.inCar, scopeOn = fp && ads > 0.85 && !!RETICLES[sid];
    if (this.cache.reticle !== sid && RETICLES[sid]) { this.cache.reticle = sid; E.scopeSvg.innerHTML = RETICLES[sid]; E.scopeZoom.textContent = SIGHTS[sid].label; }
    E.scope.classList.toggle('hidden', !scopeOn);
    E.reddot.classList.toggle('hidden', !(fp && sid === 'dot' && ads > 0.8));
    E.cross.classList.toggle('gone', fp);
    this.set('hp', E.health.style, Math.max(0, P.health / P.maxHealth * 100).toFixed(0) + '%', 'width');
    this.set('ar', E.armor.style, Math.max(0, Math.min(100, P.armor / 60 * 100)).toFixed(0) + '%', 'width');
    E.health.classList.toggle('low', P.health < 35);
    this.set('money', E.money, '₹ ' + g.save.coins.toLocaleString('en-IN'));

    // Car.
    if (P.inCar && g.driving.car) {
      this.set('kmh', E.speedo, `${g.driving.kmh}<span>km/h</span>`, 'innerHTML');
      this.set('ch', E.carHealth.style, Math.max(0, g.driving.car.health).toFixed(0) + '%', 'width');
      this.set('boost', E.boost.style, Math.round(g.driving.nitro * 100) + '%', 'width');
      E.boost.classList.toggle('on', g.driving.boosting);
    }

    // Context buttons.
    const canEnter = !P.inCar && !P.dead && g.mode === 'play' && !!g.driving.nearestCar(P.x, P.z);
    E.enter.classList.toggle('hidden', !canEnter);
    // PICK UP shows what it is (the gun's name).
    const pk = !P.inCar && !P.dead ? g.pickups.near(P.x, P.z) : null;
    E.pickup.classList.toggle('hidden', !pk);
    const pl = pk ? (WEAPONS[pk.type] ? WEAPONS[pk.type].name : 'PICK UP') : '';
    if (this.cache.pickLbl !== pl) { this.cache.pickLbl = pl; const sp = E.pickup.querySelector('span'); if (sp) sp.textContent = pl; E.pickup.classList.toggle('gun', !!(pk && WEAPONS[pk.type])); }
    // TAKEDOWN (behind an unaware guard) or FIGHT (a cop or gangster right next to him).
    const fight = !g.takedownTarget && !!g.punchTarget, tdKey = (g.takedownTarget ? 't' : fight ? 'f' : '-') + tr('FIGHT');
    if (this.cache.takedown !== tdKey) {
      this.cache.takedown = tdKey;
      E.takedown.classList.toggle('hidden', !g.takedownTarget && !fight);
      E.takedown.classList.toggle('fight', fight);
      const sp = E.takedown.querySelector('span'); if (sp) sp.textContent = tr(fight ? 'FIGHT' : 'TAKEDOWN');
    }

    E.aim.classList.toggle('active', P.aiming);
    E.crouch.classList.toggle('active', P.crouching);

    // Timer.
    const m = g.mission;
    if (m && m.timeLeft !== null && !m.done) {
      const t = Math.max(0, Math.ceil(m.timeLeft));
      this.set('timer', E.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      E.timer.classList.remove('hidden');
      E.timer.classList.toggle('low', t <= 20);
    } else E.timer.classList.add('hidden');

    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) E.big.classList.add('hidden'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) E.toast.classList.add('hidden'); }
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) { if (this.game.voice && this.game.voice.cur && this.game.voice.cur.prio === 3 && this.game.voice.speaking) this.subT = 0.05; else this.nextSub(); }
    }
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) E.hurt.classList.add('hidden'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) E.hit.classList.add('hidden'); }

    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashT = 0.3; this.flash = !this.flash; }
    this.updateRoute(dt);
    this.drawMap(dt);
    this.drawCompass();
  }

  // GPS: road route to the goal, worked out once a second.
  updateRoute(dt) {
    const g = this.game, goal = this.goal, P = g.player;
    this.routeT -= dt;
    if (!goal || Math.hypot(goal.x - P.x, goal.z - P.z) < 30) { this.route = null; return; }
    if (this.routeT > 0 && this.routeFor && Math.hypot(goal.x - this.routeFor.x, goal.z - this.routeFor.z) < 8) return;
    this.routeT = 1; this.routeFor = { x: goal.x, z: goal.z };
    const net = g.network, car = g.driving.car;
    const from = car ? net.nearest(car.x, car.z, Math.sin(car.yaw), Math.cos(car.yaw)) : net.nearest(P.x, P.z);
    const to = net.nearest(goal.x, goal.z);
    const path = from >= 0 && to >= 0 ? net.findPath(from, to) : null;
    this.route = path ? path.map((i) => net.nodes[i]) : null;
  }

  drawMap(dt) {
    const g = this.game, P = g.player, c = this.ctx, S = this.mapSize, D = g.dispatch;
    const wantPpm = P.inCar ? Math.max(0.45, 0.8 - g.driving.speed * 0.012) : 0.8;
    this.ppm += (wantPpm - this.ppm) * Math.min(1, dt * 2);
    const k = this.ppm;
    const yaw = g.camera3p.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const a = -fz * k, b = -fx * k, cc = fx * k, d = -fz * k;
    const cx = S / 2, cy = S / 2;
    const e = cx - (a * P.x + cc * P.z), f = cy - (b * P.x + d * P.z);
    const R = this.dpr;
    c.setTransform(R, 0, 0, R, 0, 0);
    c.fillStyle = '#2f6f8f'; c.fillRect(0, 0, S, S);
    const ms = MAP.s;
    c.setTransform(R * a / ms, R * b / ms, R * cc / ms, R * d / ms, R * (a * MAP.x0 + cc * MAP.z0 + e), R * (b * MAP.x0 + d * MAP.z0 + f));
    c.drawImage(this.mapImage, 0, 0);
    c.setTransform(a * R, b * R, cc * R, d * R, e * R, f * R);
    // Police search circle (not while they are still on the way - unless the task is to get away from them).
    if (D.active && (!D.responding || D.losingTask())) {
      c.fillStyle = D.sinceSeen < 1 ? 'rgba(255,40,40,0.22)' : 'rgba(255,60,60,0.14)';
      c.strokeStyle = this.flash ? 'rgba(255,70,70,0.95)' : 'rgba(80,120,255,0.95)'; c.lineWidth = 2 / k;
      c.beginPath(); c.arc(D.circle.x, D.circle.z, D.circle.r, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // GPS route.
    if (this.route && this.route.length > 1) {
      c.strokeStyle = g.waypoint ? '#c86bff' : g.marker ? '#ffc531' : '#ff8a1f'; c.lineWidth = 3.5 / k; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(P.x, P.z);
      for (const n of this.route) c.lineTo(n.x, n.z);
      c.stroke();
    }
    for (const p of g.pickups.list) { c.fillStyle = p.type === 'health' ? '#ff6b6b' : p.type === 'ammo' ? '#8fff6b' : p.type.startsWith('sight_') ? '#6fd3ff' : '#ffc531'; c.fillRect(p.x - 2 / k, p.z - 2 / k, 4 / k, 4 / k); }
    for (const p of g.policeCars) {
      if (p.inactive) continue;
      c.fillStyle = p.pursuing || p.roadblock ? (this.flash ? '#ff2a2a' : '#2a5cff') : '#4d7dff';
      c.beginPath(); c.arc(p.x, p.z, 5 / k, 0, Math.PI * 2); c.fill();
    }
    // Guards' eyes (stealth): what they can see.
    for (const o of g.officers) {
      if (o.dead || !o.guard || o.guard.alerted) continue;
      c.fillStyle = o.guard.seen > 0.12 ? 'rgba(255,210,30,0.35)' : 'rgba(255,255,255,0.18)';
      const range = P.crouching ? 10 : 18;
      c.beginPath(); c.moveTo(o.x, o.z);
      c.arc(o.x, o.z, range, Math.PI / 2 - o.yaw - 0.96, Math.PI / 2 - o.yaw + 0.96);
      c.closePath(); c.fill();
    }
    for (const o of g.officers) { if (o.dead) continue; c.fillStyle = o.boss ? '#ffc531' : o.gang ? '#ff3b30' : '#ff5a4d'; c.beginPath(); c.arc(o.x, o.z, (o.boss ? 4.5 : 3.2) / k, 0, Math.PI * 2); c.fill(); }
    for (const cr of g.cars) { if (!cr.hostile || cr.exploded) continue; c.fillStyle = '#ff3b30'; c.fillRect(cr.x - 3.5 / k, cr.z - 3.5 / k, 7 / k, 7 / k); }
    for (const pn of g.pins || []) { c.fillStyle = pn.color; c.strokeStyle = '#000'; c.lineWidth = 1 / k; c.beginPath(); c.arc(pn.x, pn.z, 4 / k, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (D.heli) { c.fillStyle = '#fff'; c.beginPath(); c.arc(D.heli.x, D.heli.z, 5 / k, 0, Math.PI * 2); c.fill(); }
    // Mission marker + waypoint (clamped to the edge if far away).
    c.setTransform(R, 0, 0, R, 0, 0);
    const pin = (mk, color, letter) => {
      let mx = a * mk.x + cc * mk.z + e, my = b * mk.x + d * mk.z + f;
      const ddx = mx - cx, ddy = my - cy, dl = Math.hypot(ddx, ddy), lim = S / 2 - 8;
      if (dl > lim) { mx = cx + ddx / dl * lim; my = cy + ddy / dl * lim; }
      c.fillStyle = color; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(mx, my, letter ? 7.5 : 6, 0, Math.PI * 2); c.fill(); c.stroke();
      if (letter) { c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, mx, my + 0.5); c.textBaseline = 'alphabetic'; }
    };
    if (g.freeOffer && !g.mission) pin(g.freeOffer, '#ff8a1f', 'M');   // v10.3: the next mission
    if (g.marker) pin(g.marker, '#ffc531');
    if (g.waypoint) pin(g.waypoint, '#c86bff');
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

  // ---------- Full-screen map (north up) ----------
  bigMapLayout() {
    const cv = this.el.bigCanvas, R = this.dpr;
    const w = window.innerWidth, h = window.innerHeight;
    if (cv.width !== Math.round(w * R) || cv.height !== Math.round(h * R)) { cv.width = Math.round(w * R); cv.height = Math.round(h * R); }
    const mw = MAP.x1 - MAP.x0, mh = MAP.z1 - MAP.z0;
    const sc = Math.min((w - 20) / mw, (h - 20) / mh);
    // North (+z) is up on screen; in this world east is -x, so x grows to the LEFT.
    return { sc, ox: w / 2 + ((MAP.x0 + MAP.x1) / 2) * sc, oy: h / 2 + ((MAP.z0 + MAP.z1) / 2) * sc, w, h };
  }

  drawBigMap() {
    const g = this.game, c = this.el.bigCanvas.getContext('2d'), R = this.dpr, D = g.dispatch, P = g.player;
    const L = this.bigMapLayout();
    c.setTransform(R, 0, 0, R, 0, 0);
    c.fillStyle = 'rgba(10,14,20,0.92)'; c.fillRect(0, 0, L.w, L.h);
    // World -> screen: X = ox - x * sc, Y = oy - z * sc (the map picture is flipped both ways).
    const ms = MAP.s;
    c.setTransform(-R * L.sc / ms, 0, 0, -R * L.sc / ms, R * (L.ox - MAP.x0 * L.sc), R * (L.oy - MAP.z0 * L.sc));
    c.drawImage(this.mapImage, 0, 0);
    c.setTransform(-R * L.sc, 0, 0, -R * L.sc, R * L.ox, R * L.oy);
    if (D.active && (!D.responding || D.losingTask())) {
      c.fillStyle = 'rgba(255,50,50,0.2)'; c.strokeStyle = 'rgba(255,70,70,0.9)'; c.lineWidth = 2 / L.sc;
      c.beginPath(); c.arc(D.circle.x, D.circle.z, D.circle.r, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    if (this.route && this.route.length > 1) {
      c.strokeStyle = g.waypoint ? '#c86bff' : g.marker ? '#ffc531' : '#ff8a1f'; c.lineWidth = 3 / L.sc;
      c.beginPath(); c.moveTo(P.x, P.z); for (const n of this.route) c.lineTo(n.x, n.z); c.stroke();
    }
    for (const p of g.policeCars) { if (p.inactive) continue; c.fillStyle = p.pursuing ? '#ff3b3b' : '#4d7dff'; c.beginPath(); c.arc(p.x, p.z, 4 / L.sc, 0, Math.PI * 2); c.fill(); }
    c.setTransform(R, 0, 0, R, 0, 0);
    c.font = `bold ${Math.round(Math.max(8, Math.min(13, 8.5 * L.sc)))}px sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [t, x, z] of LABELS) c.fillText(t, L.ox - x * L.sc, L.oy - z * L.sc);
    const dot = (x, z, col, r) => { c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(L.ox - x * L.sc, L.oy - z * L.sc, r, 0, Math.PI * 2); c.fill(); c.stroke(); };
    if (g.marker) dot(g.marker.x, g.marker.z, '#ffc531', 8);
    if (g.waypoint) dot(g.waypoint.x, g.waypoint.z, '#c86bff', 8);
    if (g.freeOffer && !g.mission) {   // v10.3: the next mission (orange M) with its name
      const o = g.freeOffer, X = L.ox - o.x * L.sc, Y = L.oy - o.z * L.sc;
      dot(o.x, o.z, '#ff8a1f', 11);
      c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', X, Y + 1);
      c.font = 'bold 12px sans-serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.85)';
      const t = `MISSION ${o.def.id} · ${o.def.title.toUpperCase()}`;
      c.strokeText(t, X, Y + 22); c.fillStyle = '#ffb36b'; c.fillText(t, X, Y + 22);
      c.textBaseline = 'alphabetic';
    }
    // Player arrow (world forward (sin yaw, cos yaw) -> screen (-sin, -cos)).
    const px = L.ox - P.x * L.sc, py = L.oy - P.z * L.sc, ux = -Math.sin(P.yaw), uy = -Math.cos(P.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px + ux * 12, py + uy * 12); c.lineTo(px - ux * 8 - uy * 8, py - uy * 8 + ux * 8);
    c.lineTo(px - ux * 4, py - uy * 4); c.lineTo(px - ux * 8 + uy * 8, py - uy * 8 - ux * 8); c.closePath(); c.fill(); c.stroke();
  }

  bigMapTap(e) {
    e.preventDefault(); e.stopPropagation();
    const g = this.game, L = this.bigMapLayout();
    const r = this.el.bigCanvas.getBoundingClientRect();
    const x = -(e.clientX - r.left - L.ox) / L.sc, z = -(e.clientY - r.top - L.oy) / L.sc;
    if (x < MAP.x0 || x > MAP.x1 || z < MAP.z0 || z > MAP.z1) return;
    if (g.waypoint && Math.hypot(g.waypoint.x - x, g.waypoint.z - z) < 14) g.waypoint = null;
    else g.waypoint = { x, z };
    this.routeT = 0;
    this.drawBigMap();
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
    // Mission marker / waypoint on the compass with distance.
    const P = g.player;
    const mark = (mk, color) => {
      const ang = Math.atan2(mk.x - P.x, mk.z - P.z);
      let md = (-ang * 180 / Math.PI) - heading;
      md = ((md + 540) % 360) - 180;
      const x = Math.max(8, Math.min(W - 8, W / 2 + md * pxPerDeg));
      c.fillStyle = color;
      c.beginPath(); c.moveTo(x, 20); c.lineTo(x - 5, 26); c.lineTo(x + 5, 26); c.fill();
      c.font = 'bold 9px sans-serif';
      c.fillText(Math.round(Math.hypot(mk.x - P.x, mk.z - P.z)) + 'm', x, 4);
    };
    if (g.marker) mark(g.marker, '#ffc531');
    if (g.waypoint) mark(g.waypoint, '#c86bff');
    if (g.freeOffer && !g.mission && !g.marker) mark(g.freeOffer, '#ff8a1f');   // v10.3: the next mission
    c.fillStyle = '#ffc531';
    c.beginPath(); c.moveTo(W / 2 - 4, 0); c.lineTo(W / 2 + 4, 0); c.lineTo(W / 2, 5); c.fill();
  }
}
