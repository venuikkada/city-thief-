// v10.3 free world: explore Navapur and do what you want; the next story mission waits in the city as an
// orange M (GTA style). Walk or drive into the orange circle, then START MISSION (PC: Enter). The mission
// begins right there, with the guns Vikram picked up. After a mission: KEEP EXPLORING (main.js).
import * as THREE from 'three';
import { missionSpot } from './acts.js';
import { CHAPTERS } from './missions.js';

const $ = (id) => document.getElementById(id);
const R = 3;   // the orange circle, metres

export class FreeWorld {
  constructor(game) {
    this.game = game; this.offer = null; this.near = false; this.t = 0; this.cardKey = '';
    const G = this.mesh = new THREE.Group();
    // A tall orange beam (seen from far away), a ring on the ground and a floating M.
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.beam.position.y = 30;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.28, R, 48),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.2;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#ff8a1f'; c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.fill();
    c.lineWidth = 8; c.strokeStyle = '#ffffff'; c.stroke();
    c.fillStyle = '#ffffff'; c.font = 'bold 74px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 64, 69);
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, toneMapped: false }));
    this.icon.scale.set(2.4, 2.4, 1); this.icon.position.y = 4.2;
    G.add(this.beam, this.ring, this.icon);
    G.visible = false;
    game.scene.add(G);
    this.card = $('mstart');
  }

  // The mission waiting in the city (null = none).
  setOffer(def) {
    const g = this.game;
    this.hideCard();
    if (!def) { this.offer = null; g.freeOffer = null; this.mesh.visible = false; return; }
    const s = missionSpot(g, def.id);
    this.offer = { def, x: s.x, z: s.z, label: s.label, who: s.who };
    g.freeOffer = this.offer;   // the mini-map, the big map and the compass show it
    this.mesh.position.set(s.x, g.world.groundAt(s.x, s.z), s.z);
  }

  update(dt, input) {
    const g = this.game, o = this.offer, P = g.player;
    const on = !!o && !g.mission && g.mode === 'play';
    this.mesh.visible = on;
    if (!on) { if (this.near) this.hideCard(); return; }
    this.t += dt;
    this.ring.scale.setScalar(1 + Math.sin(this.t * 4) * 0.05);
    this.icon.position.y = 4.2 + Math.sin(this.t * 2.2) * 0.25;
    // No orange wall in your face when the camera is inside the beam.
    const cam = g.camera.position, cd = Math.hypot(cam.x - o.x, cam.z - o.z);
    this.beam.material.opacity = 0.24 * Math.min(1, Math.max(0, (cd - R) / 8));
    // In the circle: on foot, or in a car that has (almost) stopped.
    const T = P.inCar && g.driving.car ? g.driving.car : P;
    const d = Math.hypot(T.x - o.x, T.z - o.z);
    const inside = !P.dead && P.controlsEnabled && d < (P.inCar ? R + 3 : R + 0.6) && (!P.inCar || g.driving.speed < 4);
    if (inside !== this.near) { if (inside) this.showCard(); else this.hideCard(); }
    if (inside) {
      const wanted = g.dispatch.active;   // like GTA: no new mission while the police are after you
      const key = wanted ? 'w' : 'ok';
      if (key !== this.cardKey) this.fillCard(wanted);
      if (input.mstartPressed && !wanted) this.start();
    }
  }

  fillCard(wanted) {
    const o = this.offer, d = o.def, ch = CHAPTERS.find((c) => !c.soon && d.id >= c.from && d.id <= c.to);
    this.cardKey = wanted ? 'w' : 'ok';
    $('mstart-no').textContent = `MISSION ${d.id}${ch ? ` · CHAPTER ${ch.id}` : ''}`;
    $('mstart-title').textContent = d.title.toUpperCase();
    $('mstart-brief').textContent = wanted ? 'The police are after you! Lose them first (get out of the red circle on the map), then come back.' : d.brief;
    const b = $('btn-mstart');
    b.classList.toggle('off', wanted);
    $('mstart-go').textContent = wanted ? 'LOSE THE POLICE FIRST' : '▶ START MISSION';
  }

  showCard() {
    if (!this.card) return;
    this.near = true; this.cardKey = '';
    this.card.classList.remove('hidden');
    if (this.game.audio && this.game.audio.chime) this.game.audio.chime(0.3);
  }
  hideCard() { this.near = false; if (this.card) this.card.classList.add('hidden'); }

  start() {
    const g = this.game, o = this.offer, P = g.player;
    this.hideCard();
    // The mission starts right here (the orange circle), with the guns he has now.
    g.startMission(o.def.id, { here: { x: o.x, z: o.z, yaw: P.yaw } });
  }
}
