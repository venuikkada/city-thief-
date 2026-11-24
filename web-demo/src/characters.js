// Animated 3D people (glTF skinned models from the three.js examples, Mixamo rigs).
// - Vikram: textured, realistic character with Idle / Walk / Run animations.
// - Citizens and police: animated character tinted with clothes / khaki uniform colours.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp } from './util.js';

const assets = {};

export async function loadCharacters(manager) {
  const loader = new GLTFLoader(manager);
  const [hero, citizen] = await Promise.all([
    loader.loadAsync('assets/models/vikram.glb'),
    loader.loadAsync('assets/models/citizen.glb'),
  ]);
  assets.hero = hero;
  assets.citizen = citizen;

  // Crouch pose borrowed from the citizen rig (same bone names). Rotations only.
  const sneak = citizen.animations.find((a) => a.name === 'sneak_pose');
  if (sneak) {
    assets.crouch = new THREE.AnimationClip('crouch', sneak.duration,
      sneak.tracks.filter((t) => t.name.endsWith('.quaternion')));
  }
}

const tintCache = new Map();

function clipByName(gltf, ...names) {
  for (const n of names) {
    const c = gltf.animations.find((a) => a.name.toLowerCase() === n.toLowerCase());
    if (c) return c;
  }
  return null;
}

export class CharacterRig {
  // kind: 'hero' | 'citizen' | 'police'
  constructor(kind, tintHex, castShadow) {
    const src = kind === 'hero' ? assets.hero : assets.citizen;
    this.root = new THREE.Group();
    const model = SkeletonUtils.clone(src.scene);
    this.model = model;
    this.root.add(model);
    // The hero model faces -Z in its file; turn it to face +Z like everything else.
    if (kind === 'hero') model.rotation.y = Math.PI;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = castShadow;
      o.receiveShadow = false;
      if (kind !== 'hero' && tintHex !== undefined) {
        const isJoints = /joint/i.test(o.material.name);
        const key = o.material.name + '_' + (isJoints ? 'j' : tintHex);
        if (!tintCache.has(key)) {
          const m = o.material.clone();
          if (isJoints) m.color.setHex(kind === 'police' ? 0x3b2f22 : 0x2a2a2e);
          else m.color.setHex(tintHex);
          m.metalness = 0.0;
          m.roughness = 0.75;
          tintCache.set(key, m);
        }
        o.material = tintCache.get(key);
      }
      if (kind === 'hero') {
        // Vikram's black "heist suit": darken the textured suit, keep its detail.
        o.material = o.material.clone();
        o.material.color.setHex(/visor/i.test(o.name) ? 0x222a33 : 0x5a5f69);
      }
    });

    // Police cap on the head bone.
    if (kind === 'police') {
      const head = model.getObjectByName('mixamorig:Head');
      if (head) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0x5c4a2e, roughness: 0.7 }));
        const scaleFix = 1 / Math.max(0.0001, worldScale(head));
        cap.scale.setScalar(scaleFix);
        cap.position.set(0, 0.17 * scaleFix, 0.01 * scaleFix);
        head.add(cap);
      }
    }

    this.mixer = new THREE.AnimationMixer(model);
    const idle = clipByName(src, 'idle');
    const walk = clipByName(src, 'walk');
    const run = clipByName(src, 'run');
    this.actions = {
      idle: idle && this.mixer.clipAction(idle),
      walk: walk && this.mixer.clipAction(walk),
      run: run && this.mixer.clipAction(run),
      crouch: kind === 'hero' && assets.crouch ? this.mixer.clipAction(assets.crouch) : null,
    };
    for (const a of Object.values(this.actions)) {
      if (!a) continue;
      a.play();
      a.setEffectiveWeight(0);
    }
    if (this.actions.idle) this.actions.idle.setEffectiveWeight(1);
    // Random start so a crowd does not walk in step.
    if (this.actions.walk) this.actions.walk.time = Math.random() * walk.duration;
    this.pending = 0;
  }

  // Blend idle / walk / run from the real speed (m/s), and match the step speed.
  setMotion(speed, crouch = 0) {
    const a = this.actions;
    const idleW = clamp(1 - speed / 0.6, 0, 1);
    const runW = clamp((speed - 2.6) / 1.6, 0, 1);
    const walkW = clamp(1 - idleW - runW, 0, 1);
    const crouchW = a.crouch ? crouch : 0;
    const keep = 1 - crouchW * 0.75;
    if (a.idle) a.idle.setEffectiveWeight(idleW * keep);
    if (a.walk) { a.walk.setEffectiveWeight(walkW * keep); a.walk.timeScale = clamp(speed / 1.5, 0.5, 1.7); }
    if (a.run) { a.run.setEffectiveWeight(runW * keep); a.run.timeScale = clamp(speed / 5.5, 0.75, 1.35); }
    if (a.crouch) a.crouch.setEffectiveWeight(crouchW * 0.75);
  }

  // Far away characters animate less often (saves phone CPU).
  update(dt, distanceToCamera) {
    this.pending += dt;
    const every = distanceToCamera > 70 ? 0.12 : distanceToCamera > 35 ? 0.05 : 0;
    if (this.pending >= every) {
      this.mixer.update(this.pending);
      this.pending = 0;
    }
  }
}

function worldScale(obj) {
  obj.updateWorldMatrix(true, false);
  const s = new THREE.Vector3();
  obj.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  return s.x;
}
