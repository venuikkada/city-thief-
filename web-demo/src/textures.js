// Textures drawn in code (no image downloads): asphalt, paving, kerbs,
// building fronts, shop fronts, shop signs and billboards. All names are fictional.
import * as THREE from 'three';
import { seededRandom } from './util.js';

const rand = seededRandom(77);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Speckle noise helper.
function noise(g, w, h, count, colors, size = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    g.fillRect(rand() * w, rand() * h, size * rand() + 0.5, size * rand() + 0.5);
  }
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3a3a3e';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 9000, ['#2e2e31', '#46464b', '#343438', '#505055', '#2a2a2c'], 2);
  // A few patches and cracks: Indian roads are well used.
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(20,20,22,${0.15 + rand() * 0.15})`;
    g.beginPath();
    g.ellipse(rand() * 256, rand() * 256, 10 + rand() * 30, 6 + rand() * 20, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = rand() * 256, y = rand() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 30; y += (rand() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  return toTexture(c);
}

export function pavingTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9c968a';
  g.fillRect(0, 0, 256, 256);
  const tile = 32;
  for (let y = 0; y < 256; y += tile) {
    for (let x = 0; x < 256; x += tile) {
      const v = 140 + Math.floor(rand() * 30);
      g.fillStyle = `rgb(${v + 12},${v + 6},${v - 6})`;
      g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  }
  noise(g, 256, 256, 3000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)'], 2);
  return toTexture(c);
}

// Black and yellow kerb stones (a very Indian street detail).
export function kerbTexture() {
  const [c, g] = canvas(64, 16);
  g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, 32, 16);
  g.fillStyle = '#e7c21c'; g.fillRect(32, 0, 32, 16);
  return toTexture(c, true, 2);
}

export function groundTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7d6f58';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 8000, ['#75684f', '#8a7c63', '#6b5f48', '#918366', '#5f7046'], 3);
  return toTexture(c);
}

// ---------------------------------------------------------------------------
// Building fronts: one tile = one window bay (3 m wide) x one floor (3.2 m high).
// ---------------------------------------------------------------------------
const FACADE_STYLES = [
  { wall: '#e8dcc2', trim: '#c9b48e', glass: ['#3c5a73', '#4a6a85'], ac: true, shutters: false },   // cream plaster
  { wall: '#d99a86', trim: '#b5705c', glass: ['#40566b', '#56708a'], ac: true, shutters: true },    // salmon pink
  { wall: '#a9c7b1', trim: '#7fa38a', glass: ['#3b5866', '#4f6f7e'], ac: false, shutters: true },   // mint green
  { wall: '#b9bcc2', trim: '#8d9199', glass: ['#2f4d66', '#5c87a8'], ac: false, shutters: false, office: true }, // grey office
  { wall: '#b5654a', trim: '#8c4735', glass: ['#384b5c', '#4b6276'], ac: true, shutters: false, brick: true },  // brick
  { wall: '#f0e6a8', trim: '#cbbf72', glass: ['#3f5c70', '#557a91'], ac: true, shutters: true },    // pale yellow
];
export const FACADE_COUNT = FACADE_STYLES.length;

export function facadeTexture(styleIndex) {
  const s = FACADE_STYLES[styleIndex];
  const [c, g] = canvas(128, 136);
  g.fillStyle = s.wall;
  g.fillRect(0, 0, 128, 136);
  if (s.brick) {
    g.fillStyle = 'rgba(80,30,20,0.25)';
    for (let y = 0; y < 136; y += 8) {
      g.fillRect(0, y, 128, 1);
      for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) g.fillRect(x, y, 1, 8);
    }
  }
  noise(g, 128, 136, 900, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)', 'rgba(90,70,50,0.07)'], 3);
  // Floor band.
  g.fillStyle = s.trim; g.fillRect(0, 128, 128, 8);

  if (s.office) {
    // Big glass panel.
    const grad = g.createLinearGradient(0, 8, 0, 120);
    grad.addColorStop(0, s.glass[1]); grad.addColorStop(1, s.glass[0]);
    g.fillStyle = grad; g.fillRect(6, 10, 116, 108);
    g.fillStyle = s.trim; g.fillRect(62, 10, 4, 108);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(10, 118); g.lineTo(50, 10); g.lineTo(64, 10); g.lineTo(24, 118); g.fill();
  } else {
    // Window with frame, sill and reflection.
    g.fillStyle = s.trim; g.fillRect(30, 22, 68, 78);
    const grad = g.createLinearGradient(0, 26, 0, 96);
    grad.addColorStop(0, s.glass[1]); grad.addColorStop(1, s.glass[0]);
    g.fillStyle = grad; g.fillRect(35, 27, 58, 68);
    g.fillStyle = s.trim; g.fillRect(62, 27, 4, 68); g.fillRect(35, 58, 58, 3);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.beginPath(); g.moveTo(38, 92); g.lineTo(56, 30); g.lineTo(64, 30); g.lineTo(46, 92); g.fill();
    // Some windows have a lit warm room.
    if (rand() < 0.3) { g.fillStyle = 'rgba(255,200,120,0.35)'; g.fillRect(67, 62, 26, 33); }
    g.fillStyle = '#e9e3d6'; g.fillRect(26, 100, 76, 5);   // sill
    if (s.shutters) {   // green wooden shutters
      g.fillStyle = '#4e7d5a'; g.fillRect(16, 24, 13, 76); g.fillRect(99, 24, 13, 76);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 28; y < 98; y += 6) { g.fillRect(17, y, 11, 1); g.fillRect(100, y, 11, 1); }
    }
    if (s.ac && rand() < 0.5) {   // AC unit under the window
      g.fillStyle = '#ddd'; g.fillRect(70, 106, 28, 16);
      g.fillStyle = '#999'; g.fillRect(73, 109, 22, 1); g.fillRect(73, 113, 22, 1); g.fillRect(73, 117, 22, 1);
    }
    // Rain stains.
    g.fillStyle = 'rgba(60,50,40,0.12)'; g.fillRect(36, 105, 56, 20);
  }
  return toTexture(c);
}

// Ground floor shop bay (4 m wide x 4 m high): sign band, half-open rolling shutter, lit inside.
export function shopTexture() {
  const [c, g] = canvas(256, 256);
  const bands = ['#c0392b', '#1f6fb2', '#e3a21a', '#2f8f4e', '#8e44ad', '#d35400', '#16a085', '#2c3e50'];
  for (let k = 0; k < 2; k++) {
    const x0 = k * 128;
    g.fillStyle = '#6b6258'; g.fillRect(x0, 0, 128, 256);
    g.fillStyle = bands[Math.floor(rand() * bands.length)];
    g.fillRect(x0 + 4, 8, 120, 40);
    // Shop inside (warm light) + shelves.
    g.fillStyle = '#f2c98a'; g.fillRect(x0 + 10, 56, 108, 196);
    g.fillStyle = 'rgba(120,80,40,0.55)';
    for (let y = 120; y < 250; y += 26) g.fillRect(x0 + 14, y, 100, 5);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = bands[Math.floor(rand() * bands.length)];
      g.fillRect(x0 + 16 + rand() * 90, 100 + Math.floor(rand() * 5) * 26, 8, 14);
    }
    // Rolling shutter, partly open.
    const open = 60 + rand() * 60;
    g.fillStyle = '#9da3a8'; g.fillRect(x0 + 10, 56, 108, open);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 60; y < 56 + open; y += 5) g.fillRect(x0 + 10, y, 108, 1);
    g.fillStyle = '#4a4540'; g.fillRect(x0, 252, 128, 4);
  }
  return toTexture(c);
}

// Shop signs + billboards in one texture (atlas). Returns { texture, rects[] }.
const SHOP_NAMES = [
  ['NAVAPUR MOBILES', '#1f6fb2', '#fff'], ['SRI LAKSHMI SWEETS', '#e3a21a', '#5a1a00'],
  ['RAJU TEA STALL', '#2f8f4e', '#fff'], ['GANESH HARDWARE', '#c0392b', '#fff'],
  ['ANNAPURNA HOTEL', '#8e44ad', '#ffe066'], ['KUMAR MEDICALS', '#16a085', '#fff'],
  ['SHANTI TEXTILES', '#d35400', '#fff'], ['GALLI ELECTRICALS', '#2c3e50', '#ffd400'],
  ['BALAJI GENERAL STORE', '#b03a2e', '#fff'], ['VIJAY AUTO PARTS', '#34495e', '#f1c40f'],
  ['NEW STAR TAILORS', '#7d3c98', '#fff'], ['DURGA FRUIT MART', '#239b56', '#fff'],
];
const BILLBOARDS = [
  ['GadgetGalli', 'Phones & laptops from shops near you - same-day delivery', '#0b5cff', '#ffffff'],
  ['TaazaGalli', 'Fresh chicken, mutton & fish at your door', '#c62828', '#fff3e0'],
  ['BoutiqueGalli', 'Sarees & tailoring from local boutiques', '#8e24aa', '#fff'],
  ['CITY THIEF', 'Coming soon on Play Store', '#111', '#ffcc2e'],
];

export function signAtlas() {
  const [c, g] = canvas(1024, 1024);
  const rects = { shops: [], boards: [] };
  // 12 shop signs: 2 columns x 6 rows, each 512 x 64.
  SHOP_NAMES.forEach(([name, bg, fg], i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 64;
    g.fillStyle = bg; g.fillRect(x, y, 512, 64);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y, 512, 6);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + 58, 512, 6);
    g.fillStyle = fg; g.font = 'bold 38px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, x + 256, y + 33, 490);
    rects.shops.push([x / 1024, 1 - (y + 64) / 1024, 512 / 1024, 64 / 1024]);
  });
  // 4 billboards: 2 x 2, each 512 x 256, from y = 448.
  BILLBOARDS.forEach(([title, line, bg, fg], i) => {
    const x = (i % 2) * 512, y = 448 + Math.floor(i / 2) * 256;
    const grad = g.createLinearGradient(x, y, x + 512, y + 256);
    grad.addColorStop(0, bg); grad.addColorStop(1, '#000');
    g.fillStyle = grad; g.fillRect(x, y, 512, 256);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 70px "Arial Black", Arial, sans-serif';
    g.fillText(title, x + 256, y + 100, 480);
    g.font = 'bold 24px Arial, sans-serif';
    g.fillText(line, x + 256, y + 175, 480);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, 496, 240);
    rects.boards.push([x / 1024, 1 - (y + 256) / 1024, 512 / 1024, 256 / 1024]);
  });
  const t = toTexture(c, false, 8);
  t.flipY = true;
  return { texture: t, rects };
}

// Side text for the police SUV ("NAVAPUR POLICE" - fictional force).
export function policeDecal() {
  const [c, g] = canvas(512, 96);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#0d2a8c'; g.fillRect(0, 54, 512, 42);
  g.fillStyle = '#c41e1e'; g.fillRect(0, 48, 512, 6);
  g.fillStyle = '#0d2a8c'; g.font = 'bold 40px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('NAVAPUR POLICE', 256, 26, 490);
  g.fillStyle = '#fff'; g.font = 'bold 26px Arial, sans-serif';
  g.fillText('DIAL 112', 256, 76);
  return toTexture(c, false, 4);
}
