// Small maths helpers.
// Direction convention: an object with heading "yaw" faces (sin(yaw), cos(yaw)) on the X/Z ground.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;

export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

// Smallest signed angle from a to b (radians).
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function rotateTowards(current, target, maxDelta) {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export const yawOf = (dx, dz) => Math.atan2(dx, dz);
export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

// Same random numbers every run, so the city always looks the same.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Pick a random item.
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Push a circle (x, z, r) out of a car's rotated box. Returns true if it moved.
export function pushOutOfBox(obj, r, cx, cz, yaw, halfL, halfW) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -fz, rz = fx;
  const dx = obj.x - cx, dz = obj.z - cz;
  const lf = dx * fx + dz * fz;
  const lr = dx * rx + dz * rz;
  const qf = clamp(lf, -halfL, halfL);
  const qr = clamp(lr, -halfW, halfW);
  let nf = lf - qf, nr = lr - qr;
  let d = Math.hypot(nf, nr);

  if (d > 0.0001) {
    if (d >= r) return false;
    const push = r - d;
    nf /= d; nr /= d;
    obj.x += (fx * nf + rx * nr) * push;
    obj.z += (fz * nf + rz * nr) * push;
    return true;
  }

  // Centre is inside the box: push out the shortest way.
  const penF = halfL - Math.abs(lf) + r;
  const penR = halfW - Math.abs(lr) + r;
  if (penF < penR) {
    const s = Math.sign(lf) || 1;
    obj.x += fx * s * penF; obj.z += fz * s * penF;
  } else {
    const s = Math.sign(lr) || 1;
    obj.x += rx * s * penR; obj.z += rz * s * penR;
  }
  return true;
}
