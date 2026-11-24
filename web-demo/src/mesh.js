// Mesh helpers for phone speed: many simple parts are merged into ONE mesh
// (one draw call) and coloured with vertex colours instead of many materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BOX = new THREE.BoxGeometry(1, 1, 1);

// Physically based materials so the HDR sky lights and reflects on everything.
export const vertexColorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
export const vertexColorShiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
export const vertexColorGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

// A copy of "geo", moved/rotated/scaled and painted one colour.
// hex may also be a THREE.Color with values above 1 (for glowing parts).
export function part(geo, hex, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.clone() : geo.clone();
  tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz)), tmpScale.set(sx, sy, sz));
  g.applyMatrix4(tmpMatrix);
  if (hex instanceof THREE.Color) tmpColor.copy(hex); else tmpColor.setHex(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r; colors[i * 3 + 1] = tmpColor.g; colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// Make every geometry in the list compatible (same attributes, all indexed) and merge.
export function mergeParts(parts) {
  const needColor = parts.some((p) => p.attributes.color);
  const ready = parts.map((g) => {
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    }
    if (needColor && !g.attributes.color) {
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.index) {
      const idx = new Uint32Array(g.attributes.position.count);
      for (let i = 0; i < idx.length; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    return g;
  });
  const merged = mergeGeometries(ready, false);
  for (const p of ready) p.dispose();
  return merged;
}

// The 4 side walls of a box, with UVs in "tiles" (uTile metres wide, vTile metres high),
// so building windows and shop fronts repeat at real-world size.
// vOffset shifts the pattern (tiles start at height y0 + vOffset).
export function wallsGeometry(x0, z0, x1, z1, y0, y1, uTile, vTile, vOffset = 0) {
  const pos = [], nor = [], uv = [], idx = [];
  const sides = [
    // [ax, az, bx, bz, nx, nz] : wall from a to b, facing out (n)
    [x0, z0, x1, z0, 0, -1],
    [x1, z0, x1, z1, 1, 0],
    [x1, z1, x0, z1, 0, 1],
    [x0, z1, x0, z0, -1, 0],
  ];
  for (const [ax, az, bx, bz, nx, nz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const base = pos.length / 3;
    // Wall is seen from outside: go b -> a so the face points outwards.
    pos.push(bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz);
    for (let i = 0; i < 4; i++) nor.push(nx, 0, nz);
    const u = len / uTile, v0 = vOffset / vTile, v1 = (y1 - y0 + vOffset) / vTile;
    uv.push(0, v0, u, v0, u, v1, 0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A flat rectangle facing up (y), UV in metres / tile.
export function floorGeometry(x0, z0, x1, z1, y, tile) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / tile, z1 / tile, x1 / tile, z1 / tile, x1 / tile, z0 / tile, x0 / tile, z0 / tile], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// A rectangle standing up, facing direction (nx, nz), with given UV rectangle [u, v, w, h].
export function signGeometry(cx, cy, cz, width, height, nx, nz, uvRect) {
  // A viewer in front looks along -n; their right-hand side is (nz, -nx).
  const rx = nz, rz = -nx;
  const hw = width / 2, hh = height / 2;
  // Corners as seen from the front: bottom-left, bottom-right, top-right, top-left.
  const bl = [cx - rx * hw, cy - hh, cz - rz * hw];
  const br = [cx + rx * hw, cy - hh, cz + rz * hw];
  const tr = [br[0], cy + hh, br[2]];
  const tl = [bl[0], cy + hh, bl[2]];
  const [u, v, w, h] = uvRect;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...bl, ...br, ...tr, ...tl], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u, v, u + w, v, u + w, v + h, u, v + h], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
