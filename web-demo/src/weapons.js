// Guns: models, bullet hits (instant "hitscan" shots), muzzle flash, tracers, sparks, hit puffs.
// Fictional weapons only (no real gun brands).
//
// v9.7 - guns like PUBG:
//  - Vikram starts with bare FISTS (he runs faster with nothing in his hands). Guns lie around the city,
//    and fallen enemies drop theirs: walk up and PICK UP. Slots 1 + 2 = main guns, slot 3 = pistol.
//    Tap the gun in your hands again = put it away (fists, faster running).
//  - Every gun has a real sight: iron sights (line up the notch and the post), a red dot, or a scope
//    (2X / 4X / 8X). AIM looks through it in first person. Scopes lie around too - walk over one to take it.
import * as THREE from 'three';
import { part, mergeParts, BOX } from './mesh.js';

// kind: 'main' (slots 1-2) / 'side' (slot 3) / 'melee' (fists). spread / bloom in radians (bloom grows
// with every shot, then settles), adsMul = spread x this when aiming down the sight, recoil = [up, side]
// degrees per shot, move = running speed x this, sight = the sight it comes with, takes = sights it can use.
// Model numbers (metres, gun points along +Z, grip at 0,0,0): sightY = height of the iron-sight line,
// rearZ = where the rear sight is, eye = how far the eye is behind it, rail = [top, z] where a scope sits,
// tip = [y, z] the muzzle.
export const WEAPONS = {
  fists: { id: 'fists', name: 'FISTS', kind: 'melee', mag: 0, damage: 50, rate: 0.45, spread: 0, bloom: 0, bloomMax: 0, auto: false, reload: 0, range: 2.2, muzzle: 0, sight: 'iron', takes: [], recoil: [0, 0], sound: 'none', move: 1.18, sightY: 0, rearZ: 0, eye: 0.2, rail: [0, 0], tip: [0, 0] },
  pistol: { id: 'pistol', name: 'PISTOL', kind: 'side', mag: 12, damage: 34, rate: 0.2, spread: 0.008, bloom: 0.006, bloomMax: 0.03, auto: false, reload: 1.3, range: 140, muzzle: 0.16, sight: 'iron', takes: ['iron', 'dot'], recoil: [1.5, 0.45], sound: 'pistol', move: 1.05, adsMul: 0.4,
    sightY: 0.0765, rearZ: -0.028, eye: 0.29, rail: [0.065, 0.02], tip: [0.047, 0.19] },
  gold: { id: 'gold', name: 'GOLDEN PISTOL', kind: 'side', mag: 12, damage: 75, rate: 0.2, spread: 0.006, bloom: 0.005, bloomMax: 0.025, auto: false, reload: 1.1, range: 160, muzzle: 0.16, sight: 'iron', takes: ['iron', 'dot'], recoil: [1.3, 0.35], sound: 'gold', move: 1.05, adsMul: 0.4,
    sightY: 0.0765, rearZ: -0.028, eye: 0.29, rail: [0.065, 0.02], tip: [0.047, 0.19] },
  smg: { id: 'smg', name: 'CHEETAH SMG', kind: 'main', mag: 30, damage: 20, rate: 0.085, spread: 0.02, bloom: 0.0022, bloomMax: 0.034, auto: true, reload: 1.8, range: 120, muzzle: 0.38, sight: 'dot', takes: ['iron', 'dot', 'x2'], recoil: [0.5, 0.4], sound: 'smg', move: 1.0, adsMul: 0.38,
    sightY: 0.111, rearZ: -0.035, eye: 0.15, rail: [0.0855, 0.1], tip: [0.05, 0.41] },
  shotgun: { id: 'shotgun', name: 'DHAMAAL 12', kind: 'main', mag: 6, damage: 24, pellets: 7, rate: 0.75, spread: 0.055, bloom: 0, bloomMax: 0, auto: false, reload: 2.2, range: 40, muzzle: 0.55, sight: 'iron', takes: ['iron', 'dot'], recoil: [4.2, 1.0], sound: 'shotgun', move: 0.98, adsMul: 0.7,
    sightY: 0.103, rearZ: 0.0, eye: 0.15, rail: [0.0875, 0.06], tip: [0.075, 0.74] },
  rifle: { id: 'rifle', name: 'TOOFAN AR', kind: 'main', mag: 30, damage: 40, rate: 0.1, spread: 0.012, bloom: 0.0018, bloomMax: 0.026, auto: true, reload: 2.0, range: 220, muzzle: 0.6, sight: 'iron', takes: ['iron', 'dot', 'x2', 'x4'], recoil: [0.7, 0.32], sound: 'rifle', move: 0.97, adsMul: 0.3,
    sightY: 0.122, rearZ: -0.04, eye: 0.14, rail: [0.095, 0.12], tip: [0.055, 0.8] },
  dmr: { id: 'dmr', name: 'SHIKARI DMR', kind: 'main', mag: 10, damage: 64, rate: 0.3, spread: 0.032, bloom: 0.004, bloomMax: 0.03, auto: false, reload: 2.4, range: 320, muzzle: 0.75, sight: 'x4', takes: ['iron', 'dot', 'x2', 'x4', 'x8'], recoil: [1.9, 0.5], sound: 'dmr', move: 0.95, adsMul: 0.05,
    sightY: 0.118, rearZ: -0.04, eye: 0.14, rail: [0.092, 0.12], tip: [0.055, 0.9] },
  sniper: { id: 'sniper', name: 'GARUDA SNIPER', kind: 'main', mag: 5, damage: 130, rate: 1.35, spread: 0.06, bloom: 0, bloomMax: 0, auto: false, reload: 3.0, range: 450, muzzle: 0.95, sight: 'x8', takes: ['iron', 'x2', 'x4', 'x8'], recoil: [3.4, 0.7], sound: 'sniper', move: 0.93, adsMul: 0.008, bolt: true,
    sightY: 0.094, rearZ: 0.28, eye: 0.3, rail: [0.089, 0.12], tip: [0.06, 1.08] },
};
export const WEAPON_ORDER = ['pistol', 'gold', 'smg', 'shotgun', 'rifle', 'dmr', 'sniper'];
// Sights: fov = how far it zooms in (camera view angle while aiming), up = how high its middle sits
// above the rail, back = how far behind its middle the eye is.
export const SIGHTS = {
  iron: { id: 'iron', name: 'IRON SIGHT', label: '1X', fov: 46 },
  dot: { id: 'dot', name: 'RED DOT', label: 'DOT', fov: 42, up: 0.026, back: 0.23 },
  x2: { id: 'x2', name: '2X SCOPE', label: '2X', fov: 28, up: 0.03 },
  x4: { id: 'x4', name: '4X SCOPE', label: '4X', fov: 14, up: 0.034 },
  x8: { id: 'x8', name: '8X SCOPE', label: '8X', fov: 7, up: 0.042 },
};
export const SIGHT_ORDER = ['iron', 'dot', 'x2', 'x4', 'x8'];
// Small side-view pictures of the guns for the slot buttons (24 x 12 view box).
export const GUN_ICONS = {
  fists: 'M5 4h10l2 2v3l-2 2H7L5 9z',
  pistol: 'M3 3h12v2h1v1H9l-1 1v1H6l-1 4H2l1-5H2V4h1z',
  gold: 'M3 3h12v2h1v1H9l-1 1v1H6l-1 4H2l1-5H2V4h1z',
  smg: 'M2 4h3V3h12v1h3v2h-3l-1 1h-2v4h-2V7H9l-1 3H6l1-3H5V6H2z',
  rifle: 'M1 5h4V4h2V3h6v1h8v1h2v1h-2l-1 1h-3v4h-2V7h-2l-1 3H9l1-3H7L5 7H1z',
  shotgun: 'M1 5h5l2-1h14v2H11l-1 1H8l-2 1H1z',
  dmr: 'M0 6h5V4h3V2h5v2h7v1h4v1h-4l-1 1h-4v3h-2V7h-2l-1 3H9l1-3H6L5 8H0z',
  sniper: 'M0 6l4-1h4V4h2V2h4v2h10v1H14l-1 1h-2l-1 3H8l1-3H5L1 8H0z',
};

const gunGeo = {};
const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.38 });
const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.55 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.22 });
// Vikram's own guns are a bit brighter (seen up close when aiming down the sight).
const ownMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.45, color: new THREE.Color(4, 4, 4.2) });
const ownWood = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.55, color: new THREE.Color(1.5, 1.5, 1.5) });
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12);
const RING = new THREE.TorusGeometry(1, 0.3, 6, 18);   // round rear sight (you look through the hole)
// A cylinder along Z (barrels, scopes).
const tube = (c, x, y, z, r, len, geo = CYL8) => part(geo, c, x, y, z, r, len, r, Math.PI / 2, 0, 0);
const DARK = 0x1a1b1e, MID = 0x34363b, METAL = 0x55585e, POLY = 0x2a2b2e, WOOD = 0x6b4423, WOOD2 = 0x5a3a22;

// AR-style iron sights: a ring at the back (look through it) and a post in "ears" at the front.
function apertureSight(p, base, z, cy) {
  const r = 0.0105, bot = cy - r * 1.3;
  p.push(part(BOX, DARK, 0, (base + bot) / 2, z, 0.016, bot - base + 0.002, 0.018));   // block on the rail
  p.push(part(RING, DARK, 0, cy, z, r, r, r * 0.9));                                     // the ring
}
function postSight(p, base, z, cy) {
  p.push(part(BOX, DARK, 0, base + 0.006, z, 0.03, 0.012, 0.016));
  p.push(part(BOX, DARK, -0.012, cy - 0.004, z, 0.004, cy - base - 0.004, 0.01)); p.push(part(BOX, DARK, 0.012, cy - 0.004, z, 0.004, cy - base - 0.004, 0.01));
  p.push(part(BOX, DARK, 0, (base + 0.012 + cy) / 2, z, 0.0042, cy - base - 0.012, 0.006));        // the post: its tip is the aim point
}
// Notch sights (pistol, shotgun, sniper): two little posts at the back, one post at the front.
function notchSight(p, base, z, top, gap) {
  const h = top - base;
  p.push(part(BOX, DARK, -(gap / 2 + 0.0045), base + h / 2, z, 0.009, h, 0.012)); p.push(part(BOX, DARK, gap / 2 + 0.0045, base + h / 2, z, 0.009, h, 0.012));
}
function frontPost(p, base, z, top, w = 0.0045) { p.push(part(BOX, DARK, 0, (base + top) / 2, z, w, top - base, 0.008)); }

// The parts of one gun: body, iron sights (taken off when a scope is on).
function gunParts(id) {
  const body = [], iron = [];
  if (id === 'pistol' || id === 'gold') {
    body.push(part(BOX, MID, 0, 0.047, 0.065, 0.032, 0.036, 0.21));     // slide
    for (let i = 0; i < 5; i++) body.push(part(BOX, DARK, 0, 0.048, -0.02 + i * 0.012, 0.034, 0.03, 0.005));   // slide grip lines
    body.push(part(BOX, DARK, 0, 0.02, 0.06, 0.03, 0.022, 0.17));        // frame
    body.push(tube(METAL, 0, 0.047, 0.175, 0.008, 0.02));                // muzzle
    body.push(part(BOX, POLY, 0, -0.035, -0.006, 0.031, 0.105, 0.048, 0.26, 0, 0));   // grip
    body.push(part(BOX, DARK, 0, -0.005, 0.045, 0.008, 0.028, 0.05));    // trigger guard
    notchSight(iron, 0.065, -0.028, 0.078, 0.008); frontPost(iron, 0.065, 0.15, 0.076);
  } else if (id === 'shotgun') {
    body.push(part(BOX, WOOD2, 0, 0.025, -0.22, 0.045, 0.085, 0.3, -0.08, 0, 0));   // wooden stock
    body.push(part(BOX, DARK, 0, 0.05, 0.08, 0.052, 0.075, 0.28));       // receiver
    body.push(tube(METAL, 0, 0.075, 0.46, 0.017, 0.56));                 // barrel
    body.push(part(BOX, DARK, 0, 0.094, 0.46, 0.008, 0.004, 0.5));       // rib on top of the barrel
    body.push(tube(DARK, 0, 0.045, 0.4, 0.014, 0.42));                   // magazine tube
    body.push(part(BOX, WOOD2, 0, 0.04, 0.36, 0.05, 0.045, 0.2));     // pump
    for (let i = 0; i < 4; i++) body.push(part(BOX, 0x3f2918, 0, 0.04, 0.29 + i * 0.045, 0.052, 0.047, 0.012));
    body.push(part(BOX, DARK, 0, -0.035, 0.01, 0.032, 0.09, 0.042, 0.3, 0, 0));   // grip
    notchSight(iron, 0.0875, 0.0, 0.104, 0.009);
    iron.push(part(BOX, 0xd8d2b0, 0, 0.1, 0.72, 0.007, 0.008, 0.007));  // bead at the front
  } else if (id === 'rifle') {
    body.push(part(BOX, MID, 0, 0.045, 0.1, 0.05, 0.085, 0.36));         // receiver
    body.push(part(BOX, DARK, 0, 0.05, 0.38, 0.056, 0.07, 0.26));        // handguard
    for (let i = 0; i < 9; i++) body.push(part(BOX, METAL, 0, 0.091, -0.05 + i * 0.04, 0.03, 0.008, 0.02));   // top rail
    body.push(tube(METAL, 0, 0.055, 0.62, 0.012, 0.24));                 // barrel
    body.push(tube(DARK, 0, 0.055, 0.76, 0.02, 0.06));                   // muzzle brake
    body.push(part(BOX, DARK, 0, -0.075, 0.16, 0.034, 0.17, 0.065, 0.3, 0, 0));   // curved magazine
    body.push(part(BOX, POLY, 0, 0.035, -0.25, 0.04, 0.1, 0.26));        // stock
    body.push(part(BOX, DARK, 0, 0.01, -0.36, 0.044, 0.13, 0.04));       // butt pad
    body.push(part(BOX, POLY, 0, -0.03, 0.0, 0.032, 0.095, 0.045, 0.3, 0, 0));    // grip
    apertureSight(iron, 0.095, -0.04, 0.122); postSight(iron, 0.085, 0.48, 0.122);
  } else if (id === 'dmr') {
    body.push(part(BOX, 0x3b3f36, 0, 0.045, 0.1, 0.05, 0.08, 0.34));     // receiver (olive)
    body.push(part(BOX, DARK, 0, 0.05, 0.38, 0.054, 0.066, 0.22));       // handguard
    for (let i = 0; i < 8; i++) body.push(part(BOX, METAL, 0, 0.088, -0.04 + i * 0.04, 0.03, 0.008, 0.02));   // top rail
    body.push(tube(METAL, 0, 0.055, 0.66, 0.011, 0.44));                 // long barrel
    body.push(tube(DARK, 0, 0.055, 0.87, 0.018, 0.05));                  // muzzle brake
    body.push(part(BOX, DARK, 0, -0.07, 0.15, 0.03, 0.12, 0.06));        // straight 10-round magazine
    body.push(part(BOX, 0x3b3f36, 0, 0.03, -0.26, 0.044, 0.11, 0.3));    // stock
    body.push(part(BOX, DARK, 0, 0.075, -0.2, 0.04, 0.03, 0.14));        // cheek rest
    body.push(part(BOX, DARK, 0, 0.0, -0.405, 0.046, 0.14, 0.03));       // butt pad
    body.push(part(BOX, POLY, 0, -0.03, 0.0, 0.032, 0.095, 0.045, 0.3, 0, 0));    // grip
    for (const s of [-1, 1]) body.push(part(BOX, DARK, s * 0.03, -0.02, 0.48, 0.006, 0.07, 0.008, 0, 0, s * 0.5));   // bipod legs (folded)
    apertureSight(iron, 0.092, -0.04, 0.118); postSight(iron, 0.083, 0.46, 0.118);
  } else if (id === 'sniper') {
    body.push(part(BOX, WOOD, 0, 0.03, -0.22, 0.048, 0.12, 0.36));       // wooden stock
    body.push(part(BOX, 0x4a2f19, 0, 0.0, -0.405, 0.05, 0.15, 0.03));    // butt plate
    body.push(part(BOX, WOOD, 0, 0.035, 0.42, 0.046, 0.055, 0.4));       // fore-end
    body.push(part(BOX, WOOD, 0, 0.0, 0.03, 0.046, 0.07, 0.2));          // middle
    body.push(tube(MID, 0, 0.062, 0.1, 0.022, 0.28, CYL12));             // round receiver
    body.push(tube(METAL, 0, 0.062, 0.7, 0.012, 0.66));                  // long barrel
    body.push(tube(DARK, 0, 0.062, 1.05, 0.019, 0.07));                  // muzzle brake
    body.push(part(BOX, METAL, 0.04, 0.06, 0.0, 0.04, 0.01, 0.01));      // bolt handle
    body.push(part(CYL8, METAL, 0.062, 0.06, 0.0, 0.009, 0.012, 0.009, 0, 0, Math.PI / 2));   // bolt knob
    body.push(part(BOX, DARK, 0, -0.02, 0.08, 0.03, 0.04, 0.07));        // magazine
    body.push(part(BOX, DARK, 0, -0.012, 0.03, 0.008, 0.026, 0.05));     // trigger guard
    body.push(part(BOX, METAL, 0, 0.086, 0.1, 0.02, 0.006, 0.2));        // scope rail
    notchSight(iron, 0.074, 0.28, 0.1, 0.008); frontPost(iron, 0.074, 0.98, 0.0945);
  } else {   // SMG
    body.push(part(BOX, MID, 0, 0.042, 0.1, 0.05, 0.075, 0.32));         // body
    for (let i = 0; i < 6; i++) body.push(part(BOX, METAL, 0, 0.083, 0.0 + i * 0.04, 0.028, 0.007, 0.02));   // top rail
    body.push(tube(METAL, 0, 0.05, 0.31, 0.012, 0.12));                  // barrel
    body.push(tube(DARK, 0, 0.05, 0.38, 0.02, 0.05));                    // muzzle
    body.push(part(BOX, DARK, 0, -0.07, 0.14, 0.03, 0.17, 0.042, 0.08, 0, 0));    // straight magazine
    body.push(part(BOX, POLY, 0, -0.03, -0.01, 0.03, 0.09, 0.04, 0.3, 0, 0));     // grip
    body.push(part(BOX, DARK, 0, 0.035, -0.17, 0.022, 0.035, 0.2));      // folding stock
    body.push(part(BOX, DARK, 0, 0.012, -0.26, 0.03, 0.09, 0.02));       // stock pad
    apertureSight(iron, 0.0795, -0.035, 0.111); postSight(iron, 0.0795, 0.245, 0.111);
  }
  return { body, iron };
}

// Scopes and the red dot (bottom on the rail, middle at z = 0, looking along +Z).
const opticGeo = {};
export function opticGeometry(sid) {
  if (opticGeo[sid]) return opticGeo[sid];
  const p = [];
  if (sid === 'dot') {
    p.push(part(BOX, DARK, 0, 0.005, 0, 0.026, 0.01, 0.05));                    // mount
    p.push(part(BOX, DARK, -0.0145, 0.026, 0.004, 0.005, 0.032, 0.03));         // frame left
    p.push(part(BOX, DARK, 0.0145, 0.026, 0.004, 0.005, 0.032, 0.03));          // frame right
    p.push(part(BOX, DARK, 0, 0.0445, 0.004, 0.034, 0.005, 0.03));              // frame top
    p.push(part(BOX, 0x8a1a1a, 0, 0.012, -0.012, 0.01, 0.004, 0.006));          // the little red emitter
  } else {
    const L = { x2: 0.1, x4: 0.15, x8: 0.24 }[sid], R = { x2: 0.017, x4: 0.019, x8: 0.019 }[sid], up = SIGHTS[sid].up;
    p.push(tube(DARK, 0, up, 0, R, L, CYL12));                                  // tube
    p.push(tube(DARK, 0, up, L / 2 + 0.012, R * (sid === 'x8' ? 1.55 : 1.3), sid === 'x8' ? 0.06 : 0.03, CYL12));   // front lens bell
    p.push(tube(MID, 0, up, -L / 2 - 0.012, R * 1.2, 0.035, CYL12));            // eyepiece
    for (const z of [-L * 0.28, L * 0.28]) p.push(part(BOX, DARK, 0, up / 2, z, 0.02, up, 0.014));   // rings to the rail
    if (sid !== 'x2') { p.push(part(CYL8, MID, 0, up + R + 0.007, 0.0, 0.009, 0.014, 0.009)); p.push(part(CYL8, MID, R + 0.007, up, 0.0, 0.009, 0.014, 0.009, 0, 0, Math.PI / 2)); }   // knobs
    p.push(tube(0x2a5a7a, 0, up, L / 2 + 0.026 + (sid === 'x8' ? 0.016 : 0), R * 1.1, 0.002, CYL12));   // blue glass at the front
  }
  return (opticGeo[sid] = mergeParts(p));
}

const ironGeo = {};
function bodyGeometry(id) {
  if (!gunGeo[id]) { const { body, iron } = gunParts(id); gunGeo[id] = mergeParts(body); ironGeo[id] = iron.length ? mergeParts(iron) : null; }
  return gunGeo[id];
}
const matFor = (id) => (id === 'gold' ? goldMat : id === 'sniper' ? woodMat : gunMat);

// One simple gun mesh (police, gangs, guns lying on the ground): body + its iron sights or its scope.
const fullGeo = {};
export function makeGun(id, withScope = false) {
  const key = id + (withScope ? '+s' : '');
  if (!fullGeo[key]) {
    bodyGeometry(id);
    const w = WEAPONS[id], list = [gunGeo[id].clone()];
    if (withScope && w.sight !== 'iron') { const o = opticGeometry(w.sight).clone(); o.translate(0, w.rail[0], w.rail[1]); list.push(o); }
    else if (ironGeo[id]) list.push(ironGeo[id].clone());
    fullGeo[key] = mergeParts(list);   // copies: mergeParts uses up what it is given
  }
  const m = new THREE.Mesh(fullGeo[key], matFor(id));
  m.castShadow = false;
  return m;
}

// A red dot / scope on its own (lying on the ground as loot).
export function makeSight(sid) { const m = new THREE.Mesh(opticGeometry(sid), gunMat); m.castShadow = false; return m; }

// Vikram's own gun: body, iron sights and any scope as separate pieces (the scope can change).
export function makeGunRig(id) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(bodyGeometry(id), id === 'gold' ? goldMat : id === 'sniper' ? ownWood : ownMat));
  grp.userData.iron = ironGeo[id] ? new THREE.Mesh(ironGeo[id], ownMat) : null;
  if (grp.userData.iron) grp.add(grp.userData.iron);
  grp.userData.optics = {};
  grp.userData.sight = 'iron';
  return grp;
}
// Put a sight on a gun: 'iron' (no scope) or dot / x2 / x4 / x8.
export function setGunSight(grp, id, sid) {
  const U = grp.userData;
  if (U.sight === sid) return;
  U.sight = sid;
  if (U.iron) U.iron.visible = sid === 'iron';
  for (const o of Object.values(U.optics)) o.visible = false;
  if (sid === 'iron') return;
  if (!U.optics[sid]) {
    const o = new THREE.Mesh(opticGeometry(sid), ownMat);
    o.position.set(0, WEAPONS[id].rail[0], WEAPONS[id].rail[1]);
    grp.add(o); U.optics[sid] = o;
  }
  U.optics[sid].visible = true;
}

// ---------------------------------------------------------------------------
// Visual effects: tracers, muzzle flashes, sparks and puffs (pooled, cheap).
// ---------------------------------------------------------------------------
function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class ParticlePool {
  constructor(scene, count, size, additive, texture) {
    this.n = count; this.i = 0;
    this.pos = new Float32Array(count * 3).fill(-9999);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.grav = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.mat = new THREE.PointsMaterial({
      size, map: texture, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life, gravity = -9) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.grav[i] = gravity;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any || this.dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.dirty = any;
    }
  }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    const spark = glowTexture('rgba(255,255,230,1)', 'rgba(255,170,60,0.8)');
    const puff = glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)');
    this.sparks = new ParticlePool(scene, 240, 0.12, true, spark);
    this.puffs = new ParticlePool(scene, 200, 0.45, false, puff);
    this.glows = new ParticlePool(scene, 90, 0.38, true, spark);   // nitro flames
    const fireTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,120,30,0.85)');
    this.fire = new ParticlePool(scene, 220, 1.7, true, fireTex);     // fireballs, burning cars
    this.smokeBig = new ParticlePool(scene, 140, 3.2, false, puff);    // explosion smoke
    // Empty brass shells flying out of the gun (tiny bright specks with gravity).
    const brass = glowTexture('rgba(255,236,170,1)', 'rgba(200,150,60,0.9)');
    this.shells = new ParticlePool(scene, 60, 0.07, false, brass);
    // Bullet holes on walls (one draw call for all of them, the oldest is reused).
    const holeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
      gr.addColorStop(0, 'rgba(10,10,10,0.95)'); gr.addColorStop(0.35, 'rgba(25,22,20,0.8)'); gr.addColorStop(0.7, 'rgba(60,55,50,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.holeMax = quality === 'low' ? 40 : 90;
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.holeMax);
    this.holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holes.frustumCulled = false; this.holes.count = 0; this.holeI = 0;
    scene.add(this.holes);
    // Explosion flash ball + ground shock ring (reused).
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.ball.visible = this.ring.visible = false;
    scene.add(this.ball, this.ring);
    this.boomT = 9;

    // Tracers: short bright lines that fade fast.
    this.maxTracers = 24;
    this.tracerPos = new Float32Array(this.maxTracers * 6).fill(-9999);
    this.tracerCol = new Float32Array(this.maxTracers * 6);
    this.tracerLife = new Float32Array(this.maxTracers);
    this.tracerI = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerGeo = tg;
    const lines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    lines.frustumCulled = false;
    scene.add(lines);

    // Muzzle flashes (sprites) + one shared flash light (never added/removed: no shader rebuilds).
    const flashTex = glowTexture('rgba(255,255,220,1)', 'rgba(255,160,40,0.9)');
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false; s.scale.setScalar(0.45);
      scene.add(s);
      this.flashes.push({ s, life: 0 });
    }
    this.flashI = 0;
    if (quality !== 'low') {
      this.light = new THREE.PointLight(0xffb060, 0, 9, 2);
      scene.add(this.light);
      this.lightLife = 0;
    }
  }

  muzzle(pos, size = 1) {
    const f = this.flashes[this.flashI]; this.flashI = (this.flashI + 1) % this.flashes.length;
    f.s.position.copy(pos); f.s.visible = true; f.life = 0.05;
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.scale.setScalar((0.38 + Math.random() * 0.22) * size);
    if (this.light) { this.light.position.copy(pos); this.light.intensity = 6; this.lightLife = 0.05; }
  }

  tracer(from, to, bright = 1) {
    const i = this.tracerI; this.tracerI = (this.tracerI + 1) % this.maxTracers;
    // Start a little in front of the gun, end at the hit.
    const p = this.tracerPos;
    p[i * 6] = from.x; p[i * 6 + 1] = from.y; p[i * 6 + 2] = from.z;
    p[i * 6 + 3] = to.x; p[i * 6 + 4] = to.y; p[i * 6 + 5] = to.z;
    this.tracerLife[i] = 0.07;
    this.tracerBright = bright;
    this.setTracerColor(i, bright);
  }

  setTracerColor(i, k) {
    const c = this.tracerCol;
    c[i * 6] = 1.8 * k; c[i * 6 + 1] = 1.4 * k; c[i * 6 + 2] = 0.6 * k;
    c[i * 6 + 3] = 0.6 * k; c[i * 6 + 4] = 0.45 * k; c[i * 6 + 5] = 0.2 * k;
  }

  // Bullet hits a wall / car: sparks + dust.
  impact(point, normal, metal = false) {
    for (let k = 0; k < (metal ? 9 : 6); k++) {
      this.sparks.emit(point.x, point.y, point.z,
        normal.x * 3 + (Math.random() - 0.5) * 5, normal.y * 3 + Math.random() * 3, normal.z * 3 + (Math.random() - 0.5) * 5,
        2.2, 1.6, 0.8, 0.25 + Math.random() * 0.2);
    }
    for (let k = 0; k < 3; k++) {
      this.puffs.emit(point.x, point.y, point.z, normal.x * 0.8 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, normal.z * 0.8 + (Math.random() - 0.5) * 0.6,
        0.55, 0.52, 0.48, 0.6 + Math.random() * 0.3, 0.3);
    }
  }

  // An empty shell jumps out of the gun to the right (dir = where the gun points).
  shell(x, y, z, dirX, dirZ) {
    const rx = -dirZ, rz = dirX;   // right of the gun
    this.shells.emit(x, y, z, rx * (1.6 + Math.random()) + dirX * 0.3, 1.8 + Math.random(), rz * (1.6 + Math.random()) + dirZ * 0.3, 1.6, 1.25, 0.55, 0.7, -9.8);
  }

  // A bullet hole on a wall: point + the wall's normal.
  hole(point, normal) {
    const i = this.holeI; this.holeI = (this.holeI + 1) % this.holeMax;
    _hm.position.copy(point).addScaledVector(normal, 0.012);
    _hm.lookAt(_hl.copy(_hm.position).add(normal));
    _hm.rotation.z = Math.random() * Math.PI * 2;
    _hm.scale.setScalar(0.7 + Math.random() * 0.6);
    _hm.updateMatrix();
    this.holes.setMatrixAt(i, _hm.matrix);
    this.holes.count = Math.max(this.holes.count, i + 1);
    this.holes.instanceMatrix.needsUpdate = true;
  }
  clearHoles() { this.holes.count = 0; this.holeI = 0; }

  // Bullet hits a person: small red puff (no gore).
  hitPerson(point) {
    for (let k = 0; k < 6; k++) {
      this.puffs.emit(point.x, point.y, point.z, (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5,
        0.55, 0.05, 0.04, 0.35 + Math.random() * 0.2, -4);
    }
  }

  // BOOM: fireball, flash, shock ring, smoke column, sparks.
  explosion(x, y, z, size = 1) {
    for (let k = 0; k < 34 * size; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = 3 + Math.random() * 6;
      this.fire.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp,
        2.2, 1.1 + Math.random() * 0.4, 0.3, 0.5 + Math.random() * 0.5, 3);
    }
    for (let k = 0; k < 18 * size; k++) {
      this.smokeBig.emit(x + (Math.random() - 0.5) * 2, y + Math.random(), z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5, 0.16, 0.15, 0.14, 2.2 + Math.random() * 1.5, 0.4);
    }
    for (let k = 0; k < 30; k++) {
      this.sparks.emit(x, y, z, (Math.random() - 0.5) * 18, Math.random() * 12, (Math.random() - 0.5) * 18, 2.5, 1.6, 0.6, 0.5 + Math.random() * 0.6);
    }
    this.ball.position.set(x, y, z); this.ring.position.set(x, 0.12, z);
    this.ball.visible = this.ring.visible = true; this.boomT = 0; this.boomSize = size;
    if (this.light) { this.light.position.set(x, y + 1, z); this.light.intensity = 500; this.light.distance = 45; this.lightLife = 0.35; }
  }

  // Flames on a burning car.
  carFire(x, y, z) {
    for (let k = 0; k < 2; k++) this.fire.emit(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 1.8, 0.8, 0.25, 0.45 + Math.random() * 0.3, 1);
  }

  // White water behind a speedboat.
  wake(x, y, z) {
    for (let k = 0; k < 3; k++) this.puffs.emit(x + (Math.random() - 0.5) * 1.2, y + 0.1, z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.9, 0.95, 1, 0.6 + Math.random() * 0.3, -6);
  }

  // Car into the sea.
  splash(x, y, z) {
    for (let k = 0; k < 40; k++) this.puffs.emit(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4, 0.85, 0.92, 1, 0.9 + Math.random() * 0.5, -9);
  }

  // Nitro flame out of the exhaust; (dx, dz) = backwards.
  flame(x, y, z, dx, dz) {
    for (let k = 0; k < 2; k++) {
      this.glows.emit(x + (Math.random() - 0.5) * 0.25, y + Math.random() * 0.08, z + (Math.random() - 0.5) * 0.25,
        dx * 5 + (Math.random() - 0.5), 0.2, dz * 5 + (Math.random() - 0.5), 0.5 + Math.random() * 0.6, 1.1, 3.2, 0.1 + Math.random() * 0.08, 0);
    }
  }

  // Sparks from a wheel rim (burst tyres).
  tyreSparks(x, y, z) {
    for (let k = 0; k < 3; k++) {
      this.sparks.emit(x, y, z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 2.4, 1.6, 0.6, 0.18 + Math.random() * 0.15);
    }
  }

  // Engine smoke from a damaged car.
  smoke(x, y, z, dark) {
    const c = dark ? 0.12 : 0.5;
    this.puffs.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, c, c, c, 1.6, 0.6);
  }

  update(dt) {
    this.sparks.update(dt);
    this.puffs.update(dt);
    this.shells.update(dt);
    this.glows.update(dt);
    this.fire.update(dt);
    this.smokeBig.update(dt);
    if (this.boomT < 0.7) {
      this.boomT += dt;
      const k = this.boomT / 0.7, s = this.boomSize;
      this.ball.scale.setScalar((1.5 + k * 5) * s); this.ball.material.opacity = Math.max(0, 1 - k * 1.6);
      this.ring.scale.setScalar((1 + k * 14) * s); this.ring.material.opacity = Math.max(0, 0.9 - k);
      if (this.boomT >= 0.7) this.ball.visible = this.ring.visible = false;
    }
    let tracerChanged = false;
    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      tracerChanged = true;
      if (this.tracerLife[i] <= 0) {
        for (let k = 0; k < 6; k++) this.tracerPos[i * 6 + k] = -9999;
      } else this.setTracerColor(i, this.tracerLife[i] / 0.07);
    }
    if (tracerChanged || this.tracersDirty) {
      this.tracerGeo.attributes.position.needsUpdate = true;
      this.tracerGeo.attributes.color.needsUpdate = true;
      this.tracersDirty = tracerChanged;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.s.visible = false;
    }
    if (this.light && this.lightLife > 0) {
      this.lightLife -= dt;
      if (this.lightLife <= 0) { this.light.intensity = 0; this.light.distance = 9; }
    }
  }
}

// ---------------------------------------------------------------------------
// Shooting: find what a bullet hits first (buildings, people, cars).
// ---------------------------------------------------------------------------
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _hm = new THREE.Object3D(), _hl = new THREE.Vector3();

// Ray against an upright cylinder (a person). Returns distance or -1.
function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, h) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0) continue;
    const y = oy + dy * t;
    if (y >= cy && y <= cy + h) return t;
  }
  return -1;
}

// Ray against a car's rotated box. Returns distance or -1.
function rayCar(ox, oy, oz, dx, dy, dz, car) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
  const lx = ox - car.x, lz = oz - car.z;
  const o1 = lx * rx + lz * rz, o2 = lx * fx + lz * fz;
  const d1 = dx * rx + dz * rz, d2 = dx * fx + dz * fz;
  let tmin = 0, tmax = Infinity;
  const slab = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
    return tmin <= tmax;
  };
  if (!slab(o1, d1, -car.halfW, car.halfW) || !slab(o2, d2, -car.halfL, car.halfL) || !slab(oy, dy, 0.2, 1.75)) return -1;
  return tmin;
}

// What does a shot from (origin, dir) hit? ignore = the shooter.
export function castShot(game, origin, dir, maxDist, ignore, startAt = 0) {
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  let best = { t: game.world.rayCast(ox, oy, oz, dx, dy, dz, maxDist), kind: 'world', target: null };
  const wn = game.world.lastNormal;
  best.normal = wn ? new THREE.Vector3(wn[0], wn[1], wn[2]) : null;
  for (const h of game.humans()) {
    if (h === ignore || h.dead) continue;
    const t = rayCylinder(ox, oy, oz, dx, dy, dz, h.x, h.groundY || 0, h.z, h.radius || 0.32, 1.82);
    if (t > startAt && t < best.t) best = { t, kind: 'human', target: h };
  }
  for (const c of game.cars) {
    if (c === ignore) continue;
    const t = rayCar(ox, oy, oz, dx, dy, dz, c);
    if (t > startAt && t < best.t) best = { t, kind: 'car', target: c };
  }
  // Drones, shooting-gallery boards, gas cylinders...: spheres.
  for (const h of game.cylinders ? [...(game.hittables || []), ...game.cylinders.list] : game.hittables || []) {
    if (h.dead) continue;
    const px = h.x - ox, py = h.y - oy, pz = h.z - oz;
    const tc = px * dx + py * dy + pz * dz;
    if (tc <= startAt) continue;
    const d2 = px * px + py * py + pz * pz - tc * tc, r = h.radius || 0.6;
    if (d2 > r * r) continue;
    const t = tc - Math.sqrt(r * r - d2);
    if (t > startAt && t < best.t) best = { t, kind: 'object', target: h };
  }
  best.point = new THREE.Vector3(ox + dx * best.t, oy + dy * best.t, oz + dz * best.t);
  if (best.kind === 'human') best.head = best.point.y - (best.target.groundY || 0) > 1.52;
  return best;
}

// Does a shot hit the player (cylinder) before anything else?
export function shotHitsPlayer(game, origin, dir, maxDist) {
  const P = game.player;
  const wall = game.world.rayCast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
  const target = P.inCar ? null : P;
  let t = -1;
  if (target) t = rayCylinder(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, P.x, P.y, P.z, 0.36, P.crouching ? 1.25 : 1.8);
  else if (game.driving.car) t = rayCar(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, game.driving.car);
  if (t > 0 && t < wall) return { hit: true, t };
  return { hit: false, t: wall };
}
