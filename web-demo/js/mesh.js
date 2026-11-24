// Mesh helpers for phone speed: many simple parts are merged into ONE mesh
// (one draw call) and coloured with vertex colours instead of many materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

// A copy of "geo", moved/rotated/scaled and painted one colour.
export function part(geo, hex, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz)), tmpScale.set(sx, sy, sz));
  g.applyMatrix4(tmpMatrix);
  tmpColor.setHex(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r; colors[i * 3 + 1] = tmpColor.g; colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
