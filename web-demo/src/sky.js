// Painted sunset sky: blue above, warm orange haze at the horizon, glowing sun.
// (The HDR photo is still used for lighting and reflections, just not shown.)
import * as THREE from 'three';

export function makeSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
      zenith: { value: new THREE.Color(0x3d6fb0) },
      horizon: { value: new THREE.Color(0xf6b878) },
      ground: { value: new THREE.Color(0xc9a586) },
      sunColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
        gl_Position = p.xyww;   // always at the far end
      }`,
    fragmentShader: `
      uniform vec3 sunDir, zenith, horizon, ground, sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
        col = mix(col, ground, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 900.0) * 25.0 + pow(s, 24.0) * 0.55 + pow(s, 4.0) * 0.18);
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
