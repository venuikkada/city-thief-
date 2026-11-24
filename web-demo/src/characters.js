// Realistic animated people.
// - "man": realistic male avatar (separate skin / shirt / trousers / shoes, so clothes can be recoloured)
// - "woman": realistic female character
// Walk / run / idle / gestures / crouch come from separate animation files (Mixamo skeleton)
// and are "retargeted" (copied) onto these bodies at load time.
// When holding a gun, the arms are posed in code so the gun points where you aim.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp } from './util.js';

const A = { clips: {} };

// Phone-friendly limits: hide people beyond this distance; only close people cast shadows.
export const LOD = { cull: 95, shadow: 30 };
export function setCharacterQuality(q) {
  LOD.cull = { low: 45, medium: 60, high: 95 }[q] || 95;
  LOD.shadow = { low: 0, medium: 22, high: 35 }[q] ?? 30;
}

// Strip "mixamorig" so names from different exports match ("mixamorig:Hips" -> "Hips").
const boneKey = (name) => name.replace(/^mixamorig[:_]?/i, '');

function findHips(root) {
  let hips = null;
  root.traverse((o) => { if (!hips && boneKey(o.name) === 'Hips') hips = o; });
  return hips;
}

// World rotation of the Hips' parent (skeleton "frame"), plus how the source faces.
function frameOf(sceneRoot, facingOffset) {
  sceneRoot.updateMatrixWorld(true);
  const hips = findHips(sceneRoot);
  const q = new THREE.Quaternion();
  if (hips && hips.parent) hips.parent.getWorldQuaternion(q);
  const face = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingOffset);
  return face.multiply(q);
}

export async function loadCharacters(manager) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [man, woman, sol] = await Promise.all([
    loader.loadAsync('assets/models/man.glb'),
    loader.loadAsync('assets/models/woman.glb'),
    loader.loadAsync('assets/models/anim_soldier.glb'),
  ]);
  A.man = man; A.woman = woman;
  // Source animations: the soldier file faces -Z, so turn it by 180 degrees.
  A.sources = {
    sol: { gltf: sol, frame: frameOf(sol.scene, Math.PI) },
  };
  A.targets = {
    man: { frame: frameOf(man.scene, 0), bones: boneNames(man.scene) },
    woman: { frame: frameOf(woman.scene, 0), bones: boneNames(woman.scene) },
  };
  const pick = (src, name) => ({ src, clip: A.sources[src].gltf.animations.find((a) => a.name === name) });
  A.raw = {
    idle: pick('sol', 'Idle'), walk: pick('sol', 'Walk'), run: pick('sol', 'Run'),
  };
  A.dance = woman.animations.find((a) => /samba/i.test(a.name));
}

function boneNames(root) {
  const map = new Map();
  root.traverse((o) => { if (o.isBone || o.type === 'Bone' || /Hips|Spine|Arm|Leg|Head|Hand|Foot/.test(o.name)) map.set(boneKey(o.name), o.name); });
  return map;
}

// Copy an animation onto a body: rename tracks to the body's bone names, keep rotations only,
// and turn the Hips track from the source skeleton frame into the target frame.
const clipCache = new Map();
function retarget(kind, key) {
  const id = kind + ':' + key;
  if (clipCache.has(id)) return clipCache.get(id);
  const raw = A.raw[key];
  if (!raw || !raw.clip) return null;
  const tgt = A.targets[kind];
  const K = tgt.frame.clone().invert().multiply(A.sources[raw.src].frame);
  const tracks = [];
  for (const t of raw.clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop !== 'quaternion') continue;
    const k = boneKey(node);
    const targetName = tgt.bones.get(k);
    if (!targetName) continue;
    const values = t.values.slice();
    if (k === 'Hips') {
      const q = new THREE.Quaternion();
      for (let i = 0; i < values.length; i += 4) {
        q.fromArray(values, i).premultiply(K).toArray(values, i);
      }
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(targetName + '.quaternion', t.times, values));
  }
  const clip = new THREE.AnimationClip(key, raw.clip.duration, tracks);
  clipCache.set(id, clip);
  return clip;
}

const SKIN_TONES = [0xc8957a, 0xb07e62, 0xd4a587, 0x9c6b52, 0xbf8b6e];

const matCache = new Map();
function tinted(material, hex) {
  const key = material.uuid + '_' + hex;
  if (!matCache.has(key)) {
    const m = material.clone();
    m.color.setHex(hex);
    matCache.set(key, m);
  }
  return matCache.get(key);
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class CharacterRig {
  // kind: 'man' | 'woman'
  // opts: { top, bottom, shoes, hideBeard, detail (keep eyes/teeth), castShadow }
  constructor(kind, opts = {}) {
    this.kind = kind;
    const src = kind === 'man' ? A.man : A.woman;
    this.root = new THREE.Group();
    this.castsShadow = !!opts.castShadow; this.shadowOn = !!opts.castShadow;
    this.model = SkeletonUtils.clone(src.scene);
    this.root.add(this.model);
    this.meshes = [];

    // Default look for men: South Asian skin tones, darker trousers.
    if (kind === 'man') {
      if (opts.skinTone === undefined) opts.skinTone = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
      if (opts.bottom === undefined) opts.bottom = 0x3a3f4a;
    }
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !!opts.castShadow;
      o.frustumCulled = false;   // skinned bodies move away from their bind box
      const n = o.name;
      if (!opts.detail && /Eye|Teeth/.test(n)) { o.visible = false; return; }
      if (opts.hideBeard && /Beard/.test(n)) { o.visible = false; return; }
      if (opts.skinTone !== undefined && /Wolf3D_(Body|Head)/.test(n)) o.material = tinted(o.material, opts.skinTone);
      if (opts.hideHat && (/Headwear/i.test(o.material.name) || n === 'Mesh')) { o.visible = false; return; }
      if (opts.top !== undefined && /Outfit_Top/.test(n)) o.material = tinted(o.material, opts.top);
      if (opts.bottom !== undefined && /Outfit_Bottom/.test(n)) o.material = tinted(o.material, opts.bottom);
      if (opts.shoes !== undefined && /Footwear/.test(n)) o.material = tinted(o.material, opts.shoes);
      if (opts.tint !== undefined && kind === 'woman') o.material = tinted(o.material, opts.tint);
      this.meshes.push(o);
    });

    // Bones used for aiming and the police cap.
    this.bones = {};
    this.model.traverse((o) => {
      const k = boneKey(o.name);
      if (['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'Head', 'Spine', 'Spine2', 'Hips',
        'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'].includes(k)) this.bones[k] = o;
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const key of ['idle', 'walk', 'run']) {
      const clip = retarget(kind, key);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      this.actions[key] = a;
    }
    if (kind === 'woman' && A.dance) {
      this.actions.dance = this.mixer.clipAction(A.dance);
      this.actions.dance.play();
      this.actions.dance.setEffectiveWeight(0);
    }
    if (this.actions.walk) this.actions.walk.time = Math.random() * this.actions.walk.getClip().duration;
    if (this.actions.idle) this.actions.idle.time = Math.random() * this.actions.idle.getClip().duration;

    this.pending = 0;
    this.gesture = null; this.gestureW = 0;
    this.aimW = 0; this.aimDir = new THREE.Vector3(0, 0, 1);
    this.dead = false; this.fall = 0;
    this.crouchDrop = 0;
    this.crouchW = 0;
    this.t = Math.random() * 10;
  }

  // Blend idle / walk / run from the real speed (m/s). crouch 0..1 bends the legs in code.
  setMotion(speed, crouch = 0) {
    if (this.dead) return;
    const a = this.actions;
    const idleW = clamp(1 - speed / 0.6, 0, 1);
    const runW = clamp((speed - 2.6) / 1.6, 0, 1);
    const walkW = clamp(1 - idleW - runW, 0, 1);
    const dance = this.gesture === 'dance' && a.dance ? this.gestureW * idleW : 0;
    const k = 1 - dance;
    if (a.idle) a.idle.setEffectiveWeight(idleW * k);
    if (a.walk) { a.walk.setEffectiveWeight(walkW * k); a.walk.timeScale = clamp(speed / 1.4, 0.5, 1.7) * (1 - crouch * 0.3); }
    if (a.run) { a.run.setEffectiveWeight(runW * k); a.run.timeScale = clamp(speed / 5.2, 0.8, 1.35); }
    if (a.dance) a.dance.setEffectiveWeight(dance);
    this.crouchW = crouch;
    this.crouchDrop = crouch * 0.38;
  }

  // Talking gestures / dancing: name or null.
  setGesture(name, weight = 1) {
    if (name !== this.gesture && name === 'dance' && this.actions.dance) this.actions.dance.reset().play();
    this.gesture = name;
    this.gestureW = name ? weight : 0;
  }

  // Point the arms along "dir" (world). weight 0..1. twoHands for rifles.
  setAim(weight, dir) {
    this.aimW = weight;
    if (dir) this.aimDir.copy(dir).normalize();
  }

  die(pushX = 0, pushZ = 1) {
    if (this.dead) return;
    this.dead = true;
    this.mixer.stopAllAction();
    if (this.actions.idle) { this.actions.idle.reset().play(); this.actions.idle.setEffectiveWeight(1); }
    this.fallYaw = Math.atan2(pushX, pushZ);
  }

  update(dt, distanceToCamera = 0) {
    // Hide far people and skip their animation; only close people cast shadows.
    const far = distanceToCamera > LOD.cull;
    this.root.visible = !far;
    if (far) return;
    const shadow = this.castsShadow && distanceToCamera < LOD.shadow;
    if (shadow !== this.shadowOn) { this.shadowOn = shadow; for (const m of this.meshes) m.castShadow = shadow; }

    this.pending += dt;
    const every = distanceToCamera > 60 ? 0.1 : distanceToCamera > 30 ? 0.045 : 0;
    if (this.pending >= every) {
      this.mixer.update(this.pending);
      this.pending = 0;
    }
    this.model.position.y = -this.crouchDrop;
    this.t += dt;

    if (this.dead) {
      // Fall over backwards (simple, no ragdoll).
      this.fall = Math.min(1, this.fall + dt * 2.4);
      const e = 1 - Math.pow(1 - this.fall, 3);
      this.model.rotation.set(-e * Math.PI / 2 * 0.98, 0, 0);
      this.model.position.y = e * 0.12;
      return;
    }
    if (this.crouchW > 0.01 || (this.gesture && this.gesture !== 'dance')) this.poseExtras();
    if (this.aimW > 0.01) this.poseArms();
  }

  // Crouch (bent knees, lean forward) and talking gestures (nod / shake head), done in code.
  poseExtras() {
    const b = this.bones;
    this.root.updateMatrixWorld(true);
    // Character's left side in world space (the axis for bending forward/back).
    const left = _v.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q)).clone();
    const c = this.crouchW;
    if (c > 0.01) {
      for (const side of ['Left', 'Right']) {
        if (b[side + 'UpLeg']) rotateWorld(b[side + 'UpLeg'], left, -1.25 * c);
        if (b[side + 'Leg']) rotateWorld(b[side + 'Leg'], left, 1.9 * c);
      }
      if (b.Spine) rotateWorld(b.Spine, left, 0.38 * c);
    }
    const g = this.gestureW;
    if (g > 0.01 && b.Head) {
      if (this.gesture === 'agree') rotateWorld(b.Head, left, Math.max(0, Math.sin(this.t * 5)) * 0.22 * g);
      if (this.gesture === 'headShake') rotateWorld(b.Head, UP, Math.sin(this.t * 7) * 0.3 * g);
      if (this.gesture === 'talk' && b.RightForeArm) {
        rotateWorld(b.Head, UP, Math.sin(this.t * 1.3) * 0.25 * g);
        rotateWorld(b.RightForeArm, left, (-0.6 - Math.sin(this.t * 2.2) * 0.25) * g);
      }
    }
  }

  // Simple aiming "IK": turn the arm bones so they point along the aim direction.
  poseArms() {
    const b = this.bones, w = this.aimW, dir = this.aimDir;
    if (!b.RightArm || !b.RightForeArm || !b.RightHand) return;
    this.root.updateMatrixWorld(true);
    pointBone(b.RightArm, dir, w);
    pointBone(b.RightForeArm, dir, w);
    // Left hand supports the gun a little in front of the right hand.
    if (b.LeftArm && b.LeftForeArm) {
      b.RightHand.getWorldPosition(_v2);
      _v2.addScaledVector(dir, 0.16);
      b.LeftArm.getWorldPosition(_v);
      pointBone(b.LeftArm, _v.subVectors(_v2, _v).normalize(), w * 0.9);
      b.LeftForeArm.getWorldPosition(_v);
      pointBone(b.LeftForeArm, _v.subVectors(_v2, _v).normalize(), w * 0.9);
    }
  }

  // World position + direction of the gun hand (for the gun model and bullets).
  handPose(outPos, outDir) {
    const b = this.bones;
    if (!b.RightHand || !b.RightForeArm) { this.root.getWorldPosition(outPos).y += 1.3; outDir.set(0, 0, 1); return; }
    b.RightHand.getWorldPosition(outPos);
    b.RightForeArm.getWorldPosition(_v);
    outDir.subVectors(outPos, _v).normalize();
  }
}

// Rotate a bone around an axis given in world space.
function rotateWorld(bone, axis, angle) {
  bone.getWorldQuaternion(_q);
  _q2.setFromAxisAngle(axis, angle).multiply(_q);
  bone.parent.getWorldQuaternion(_q).invert();
  bone.quaternion.copy(_q.multiply(_q2));
  bone.updateMatrixWorld(true);
}

function pointBone(bone, dir, w) {
  bone.getWorldQuaternion(_q);
  _v.copy(UP).applyQuaternion(_q);               // bones point along their local +Y
  _q2.setFromUnitVectors(_v, dir).multiply(_q);   // wanted world rotation
  _q.slerp(_q2, w);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q));
  bone.updateMatrixWorld(true);
}
