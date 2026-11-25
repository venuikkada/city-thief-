// Painted sky: golden-hour by day; at night a deep blue sky with stars, a moon and the orange
// glow of the city on the horizon; in a storm, heavy grey clouds lit by lightning.
// (An HDR photo is still used for lighting and reflections, just not shown.)
import * as THREE from 'three';

export function makeSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
      moonDir: { value: new THREE.Vector3(0.35, 0.55, 0.76).normalize() },
      zenith: { value: new THREE.Color(0x3d6fb0) },
      horizon: { value: new THREE.Color(0xf6b878) },
      ground: { value: new THREE.Color(0xc9a586) },
      sunColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
      night: { value: 0 }, storm: { value: 0 }, flash: { value: 0 }, time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
        gl_Position = p.xyww;   // always at the far end
      }`,
    fragmentShader: `
      uniform vec3 sunDir, moonDir, zenith, horizon, ground, sunColor;
      uniform float night, storm, flash, time;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1.0, 0.0), 1.0)), c = hash(vec3(i + vec2(0.0, 1.0), 1.0)), d = hash(vec3(i + 1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Day: golden hour.
        vec3 day = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
        day = mix(day, ground, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        day += sunColor * (pow(s, 900.0) * 25.0 + pow(s, 24.0) * 0.55 + pow(s, 4.0) * 0.18);
        // Night: deep blue, orange city glow low on the horizon, stars and the moon.
        vec3 nz = vec3(0.008, 0.016, 0.045), nh = vec3(0.05, 0.065, 0.12);
        vec3 nightCol = mix(nh, nz, pow(clamp(h, 0.0, 1.0), 0.5));
        nightCol += vec3(0.35, 0.16, 0.06) * exp(-max(h, 0.0) * 14.0) * 0.55;
        vec3 sp = floor(d * 380.0);
        float st = step(0.9965, hash(sp)) * smoothstep(0.02, 0.25, h);
        nightCol += vec3(0.9, 0.95, 1.0) * st * (0.6 + 0.4 * sin(time * 2.0 + hash(sp) * 40.0));
        float m = max(dot(d, normalize(moonDir)), 0.0);
        nightCol += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 3.0 + pow(m, 60.0) * 0.12);
        // Clouds drifting across (thick and grey in a storm).
        vec2 cp = d.xz / max(h, 0.05) * 0.6 + vec2(time * 0.01, 0.0);
        float cl = smoothstep(0.45 - storm * 0.35, 0.85, fbm(cp)) * smoothstep(0.0, 0.25, h);
        vec3 col = mix(day, nightCol, night);
        vec3 cloudCol = mix(mix(vec3(1.0, 0.86, 0.72), vec3(0.06, 0.07, 0.1), night), vec3(0.11, 0.12, 0.14), storm);
        col = mix(col, cloudCol, cl * (0.55 + storm * 0.4));
        col = mix(col, vec3(0.1, 0.11, 0.13), storm * 0.65 * smoothstep(-0.05, 0.3, h));
        col += vec3(0.6, 0.65, 0.8) * flash * (0.6 + cl);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
