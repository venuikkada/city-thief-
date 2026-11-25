// Vehicle models built in code: real car silhouettes (extruded side profiles with
// rounded edges), glass cabins, tyres with rims, glowing lights.
// Types: hatchback, sedan, SUV, auto-rickshaw, Navapur Police SUV. No real brands.
import * as THREE from 'three';
import { part, mergeParts, vertexColorShiny, vertexColorGlow, BOX, signGeometry } from './mesh.js';
import { policeDecal } from './textures.js';

// Size + shape of each car (metres). x = along the car, y = up.
const CAR_SHAPES = {
  hatchback: { l: 3.8, w: 1.68, gc: 0.3, belt: 0.95, roof: 1.48, hood: 0.85, trunk: 0.3, rakeF: 0.55, rakeR: 0.22, wheel: 0.31, inset: 0.68 },
  sedan:     { l: 4.5, w: 1.76, gc: 0.3, belt: 0.92, roof: 1.43, hood: 1.15, trunk: 0.8, rakeF: 0.62, rakeR: 0.5, wheel: 0.32, inset: 0.82 },
  suv:       { l: 4.6, w: 1.88, gc: 0.4, belt: 1.15, roof: 1.82, hood: 1.0, trunk: 0.22, rakeF: 0.45, rakeR: 0.1, wheel: 0.38, inset: 0.8 },
};
CAR_SHAPES.police = CAR_SHAPES.suv;
// Low two-door sports coupe (street races).
CAR_SHAPES.sports = { l: 4.4, w: 1.88, gc: 0.2, belt: 0.74, roof: 1.18, hood: 1.45, trunk: 0.75, rakeF: 0.75, rakeR: 0.55, wheel: 0.33, inset: 0.78 };

export const VEHICLE_SIZE = {
  hatchback: { l: 3.8, w: 1.68 },
  sedan: { l: 4.5, w: 1.76 },
  suv: { l: 4.6, w: 1.88 },
  police: { l: 4.6, w: 1.88 },
  sports: { l: 4.4, w: 1.88 },
  boat: { l: 5.8, w: 2.2 },
  auto: { l: 2.7, w: 1.35 },
};

export const TRAFFIC_TYPES = ['hatchback', 'hatchback', 'sedan', 'sedan', 'suv', 'auto', 'auto'];
export const CAR_COLORS = [0xf2f2f2, 0xbfc3c9, 0x1d1e22, 0x9e1b1b, 0x22468f, 0x6b6e73, 0x2e5e45, 0xd9d2c2, 0xb36b1e];
const AUTO_COLORS = [[0x2f8f3a, 0xf2c21b], [0x1a1a1a, 0xf2c21b], [0x2f8f3a, 0xf2c21b]];

const paintCache = new Map();
function paint(hex) {
  if (!paintCache.has(hex)) {
    paintCache.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }));
  }
  return paintCache.get(hex);
}

function extrude(points, width, bevel = 0.06) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.05, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);   // shape "x" (length) becomes world +z (forward)
  return g;
}

const TYRE = new THREE.CylinderGeometry(1, 1, 0.24, 14);
const RIM = new THREE.CylinderGeometry(0.6, 0.6, 0.25, 10);
const LIGHT_WHITE = new THREE.Color(4, 3.8, 3.2);
const LIGHT_RED = new THREE.Color(3.5, 0.2, 0.15);
const geoCache = new Map();

// Geometry for one car type: { body, detail, glow } (body is painted, the rest has vertex colours).
function carGeometry(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const s = CAR_SHAPES[type];
  const L = s.l, hl = L / 2;
  const body = [], detail = [], glow = [];

  // Lower body: bumper to bumper, up to the window line, hood slightly lower at the front.
  body.push(extrude([
    [-hl, s.gc], [hl, s.gc], [hl, s.belt - 0.2], [hl - 0.12, s.belt - 0.05],
    [hl - s.hood, s.belt], [-hl + 0.1, s.belt], [-hl, s.belt - 0.15],
  ], s.w, 0.07));

  // Glass cabin (dark, shiny) and the roof on top.
  const xr = -hl + s.trunk, xf = hl - s.hood;
  detail.push(colorize(extrude([[xr, s.belt - 0.02], [xf, s.belt - 0.02], [xf - s.rakeF, s.roof], [xr + s.rakeR, s.roof]], s.w * 0.9, 0.03), 0x141b23));
  body.push(extrude([[xr + s.rakeR - 0.02, s.roof - 0.02], [xf - s.rakeF + 0.02, s.roof - 0.02], [xf - s.rakeF - 0.05, s.roof + 0.05], [xr + s.rakeR + 0.05, s.roof + 0.05]], s.w * 0.88, 0.02));
  // Door pillar in the middle of the windows.
  const mid = (xr + xf) / 2;
  body.push(part(BOX, 0xffffff, 0, (s.belt + s.roof) / 2, mid, s.w * 0.91, s.roof - s.belt, 0.12));

  // Bumpers + grille (dark plastic).
  detail.push(part(BOX, 0x222326, 0, s.gc + 0.12, hl + 0.02, s.w * 0.96, 0.18, 0.12));
  detail.push(part(BOX, 0x222326, 0, s.gc + 0.12, -hl - 0.02, s.w * 0.96, 0.18, 0.12));
  detail.push(part(BOX, 0x111214, 0, s.belt - 0.25, hl + 0.01, s.w * 0.4, 0.14, 0.06));

  // Wheels: tyre + silver rim.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (s.w / 2 - 0.12), z = sz * (hl - s.inset);
    detail.push(part(TYRE, 0x101010, x, s.wheel, z, s.wheel, 1, s.wheel, 0, 0, Math.PI / 2));
    detail.push(part(RIM, 0xb8bcc2, x + sx * 0.01, s.wheel, z, s.wheel, 1, s.wheel, 0, 0, Math.PI / 2));
  }

  if (type === 'sports') {
    detail.push(part(BOX, 0x151515, 0, s.belt + 0.16, -hl + 0.18, s.w * 0.86, 0.04, 0.3));                 // rear wing
    for (const sx of [-1, 1]) detail.push(part(BOX, 0x151515, sx * s.w * 0.3, s.belt + 0.07, -hl + 0.2, 0.05, 0.16, 0.08));
    detail.push(part(BOX, 0x151515, 0, s.gc + 0.04, hl + 0.05, s.w * 0.9, 0.04, 0.18));                    // front splitter
  }

  // Lights.
  for (const sx of [-1, 1]) {
    glow.push(part(BOX, LIGHT_WHITE, sx * s.w * 0.34, s.belt - 0.16, hl + 0.03, 0.34, 0.12, 0.05));
    glow.push(part(BOX, LIGHT_RED, sx * s.w * 0.36, s.belt - 0.14, -hl - 0.03, 0.3, 0.12, 0.05));
  }

  const result = { body: mergeParts(body), detail: mergeParts(detail), glow: mergeParts(glow) };
  geoCache.set(type, result);
  return result;
}

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Auto-rickshaw: the three-wheeler of Indian streets.
function autoGeometry(lowerHex, topHex) {
  const key = 'auto' + lowerHex + topHex;
  if (geoCache.has(key)) return geoCache.get(key);
  const parts = [], glow = [];
  const W = 1.3;
  // Lower body: passenger floor + front cowl rising to the dashboard (coloured).
  parts.push(colorize(extrude([[-1.3, 0.28], [0.85, 0.28], [1.3, 0.5], [1.32, 0.95], [1.12, 1.08], [0.95, 0.72], [-1.3, 0.72]], W, 0.07), lowerHex));
  // Seat (brown) and back panel (black).
  parts.push(part(BOX, 0x5a3a24, 0, 0.85, -0.75, W - 0.1, 0.22, 0.8));
  parts.push(part(BOX, 0x141414, 0, 1.25, -1.24, W, 1.05, 0.1));
  // Roof: black canvas with the yellow top, held by 4 thin pillars. Sides are open.
  parts.push(part(BOX, 0x141414, 0, 1.86, -0.12, W + 0.04, 0.1, 2.45));
  parts.push(part(BOX, topHex, 0, 1.93, -0.12, W - 0.08, 0.05, 2.3));
  for (const sx of [-1, 1]) {
    parts.push(part(BOX, 0x141414, sx * (W / 2 - 0.04), 1.45, 1.02, 0.06, 0.8, 0.06, -0.35, 0, 0));
    parts.push(part(BOX, 0x141414, sx * (W / 2 - 0.04), 1.3, -1.2, 0.06, 1.1, 0.06));
    parts.push(part(BOX, lowerHex, sx * (W / 2 - 0.02), 1.0, -0.95, 0.05, 0.5, 0.55));   // side panel behind seat
  }
  // Windshield + handlebar.
  parts.push(part(BOX, 0x1b2530, 0, 1.4, 1.08, W - 0.2, 0.62, 0.03, -0.35, 0, 0));
  parts.push(part(BOX, 0x222222, 0, 1.1, 0.85, 0.8, 0.05, 0.05));
  // Wheels: one in front, two at the back.
  parts.push(part(TYRE, 0x101010, 0, 0.24, 1.0, 0.24, 1, 0.24, 0, 0, Math.PI / 2));
  for (const sx of [-1, 1]) parts.push(part(TYRE, 0x101010, sx * 0.6, 0.24, -0.95, 0.24, 1, 0.24, 0, 0, Math.PI / 2));
  glow.push(part(BOX, LIGHT_WHITE, 0, 0.98, 1.33, 0.22, 0.16, 0.05));
  for (const sx of [-1, 1]) glow.push(part(BOX, LIGHT_RED, sx * 0.5, 0.55, -1.33, 0.16, 0.1, 0.04));
  const res = { body: null, detail: mergeParts(parts), glow: mergeParts(glow) };
  geoCache.set(key, res);
  return res;
}

let decalMaterial = null;

// Build a vehicle: returns { group, lights? } ready to add to the scene.
// Rescue speedboat (monsoon flood): pointed hull, white deck, windscreen, red stripe, nav lights.
function boatGeometry() {
  if (geoCache.has('boat')) return geoCache.get('boat');
  const hull = extrude([[-2.9, 0.05], [1.9, 0.05], [2.9, 0.75], [2.9, 0.95], [-2.9, 0.95], [-3.0, 0.5]], 2.2, 0.08);
  const detail = [];
  detail.push(part(BOX, 0xf2f2f2, 0, 0.98, -0.4, 1.9, 0.06, 4.2));                 // deck
  detail.push(part(BOX, 0xc0392b, 0, 0.75, 0, 2.24, 0.12, 5.6));                   // stripe
  detail.push(part(BOX, 0x1b2530, 0, 1.35, 0.9, 1.6, 0.6, 0.05, -0.5, 0, 0));      // windscreen
  detail.push(part(BOX, 0x2b2f36, 0, 1.2, -0.3, 1.2, 0.4, 0.9));                  // seats
  detail.push(part(BOX, 0x151515, 0, 0.9, -2.95, 0.6, 0.7, 0.5));                 // outboard motor
  const glow = [part(BOX, new THREE.Color(0.2, 3, 0.4), 1.05, 1.0, 2.2, 0.1, 0.1, 0.1), part(BOX, new THREE.Color(3, 0.2, 0.2), -1.05, 1.0, 2.2, 0.1, 0.1, 0.1),
    part(BOX, new THREE.Color(3.5, 3.4, 3), 0, 1.65, 0.85, 0.3, 0.12, 0.08)];
  const res = { body: hull, detail: mergeParts(detail), glow: mergeParts(glow) };
  geoCache.set('boat', res);
  return res;
}

export function makeVehicle(type, colorHex, castShadow) {
  const g = new THREE.Group();
  let geo;
  if (type === 'boat') {
    geo = boatGeometry();
    const body = new THREE.Mesh(geo.body, paint(colorHex));
    body.castShadow = castShadow;
    g.add(body);
  } else if (type === 'auto') {
    const [lower, top] = AUTO_COLORS[Math.floor(Math.random() * AUTO_COLORS.length)];
    geo = autoGeometry(lower, top);
  } else {
    geo = carGeometry(type);
    const body = new THREE.Mesh(geo.body, paint(type === 'police' ? 0xf4f5f7 : colorHex));
    body.castShadow = castShadow;
    g.add(body);
  }
  const detail = new THREE.Mesh(geo.detail, vertexColorShiny);
  detail.castShadow = castShadow;
  g.add(detail);
  g.add(new THREE.Mesh(geo.glow, vertexColorGlow));

  const out = { group: g };
  if (type === 'police') {
    const s = CAR_SHAPES.police;
    // "NAVAPUR POLICE" on both sides.
    if (!decalMaterial) decalMaterial = new THREE.MeshStandardMaterial({ map: policeDecal(), roughness: 0.4, metalness: 0.2 });
    const side = s.w / 2 + 0.075;
    const decal = mergeParts([
      signGeometry(side, s.belt - 0.28, 0.1, 3.4, 0.62, 1, 0, [0, 0, 1, 1]),
      signGeometry(-side, s.belt - 0.28, 0.1, 3.4, 0.62, -1, 0, [0, 0, 1, 1]),
    ]);
    g.add(new THREE.Mesh(decal, decalMaterial));
    // Lightbar: dark base + red and blue lamps that flash in a chase.
    const roofY = s.roof + 0.05;
    const base = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
    base.position.set(0, roofY + 0.06, -0.2); base.scale.set(1.2, 0.08, 0.32);
    const red = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x551111, toneMapped: false }));
    red.position.set(-0.32, roofY + 0.16, -0.2); red.scale.set(0.5, 0.13, 0.28);
    const blue = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x111a55, toneMapped: false }));
    blue.position.set(0.32, roofY + 0.16, -0.2); blue.scale.set(0.5, 0.13, 0.28);
    g.add(base, red, blue);
    out.red = red.material;
    out.blue = blue.material;
  }
  return out;
}

// Headlight beams for night driving: two soft cones + a bright patch on the road (one draw call).
let beamGeo = null;
const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
export function makeBeams(halfL, halfW, lightY) {
  if (!beamGeo) {
    const parts = [];
    for (const sx of [-1, 1]) {
      const cone = new THREE.CylinderGeometry(0.12, 1.9, 13, 12, 4, true).rotateX(-Math.PI / 2).translate(sx * 0.55, 0, 6.5);
      const n = cone.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const z = cone.attributes.position.getZ(i); const k = Math.max(0, 1 - z / 13) * 0.09; col[i * 3] = k; col[i * 3 + 1] = k * 0.95; col[i * 3 + 2] = k * 0.8; }
      cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(cone);
    }
    const disc = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2).scale(2.6, 1, 6).translate(0, 0, 8.5);
    const n = disc.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = i === 0 ? 0.28 : 0.0; col[i * 3] = k; col[i * 3 + 1] = k * 0.93; col[i * 3 + 2] = k * 0.78; }
    disc.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const p of parts) p.deleteAttribute('uv'), p.deleteAttribute('normal');
    disc.deleteAttribute('uv'); disc.deleteAttribute('normal');
    beamGeo = mergeParts([...parts, disc]);
  }
  const m = new THREE.Mesh(beamGeo, beamMat);
  m.position.set(0, lightY, halfL);
  m.renderOrder = 3;
  m.frustumCulled = false;
  return m;
}
