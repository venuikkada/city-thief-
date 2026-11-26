// Realistic people: Microsoft Rocketbox avatars (MIT licence) with their own
// motion-captured animations (walk, run, sprint, crouch, talk, phone, chai, dance, cheer, sit...).
// The arms are posed in code when holding a gun so it points where you aim.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp, angleDiff } from './util.js';

const A = { models: {}, clips: { m: {}, f: {} } };

// Crowd people (id -> female?). Loaded in the background after the game starts.
export const CROWD_MEN = ['m_kurta', 'm_jacket', 'm_delivery', 'm_denim', 'm_red', 'm_tee', 'm_sweater', 'm_hoodie', 'm_office', 'm_worker'];
export const CROWD_WOMEN = ['f_salwar', 'f_purple', 'f_green', 'f_grey', 'f_sporty', 'f_pink', 'f_coat'];
const FIRST_CROWD = ['m_kurta', 'f_salwar', 'm_jacket', 'f_purple', 'm_delivery', 'f_green'];
const CORE = ['vikram', 'ravi', 'police', 'swat'];

// Phone-friendly limits: hide people beyond this distance; only close people cast shadows.
export const LOD = { cull: 95, shadow: 30 };
export function setCharacterQuality(q) {
  LOD.cull = { low: 50, medium: 70, high: 110 }[q] || 95;
  LOD.shadow = { low: 0, medium: 22, high: 35 }[q] ?? 30;
}

let loader = null;
function getLoader(manager) {
  if (!loader) { loader = new GLTFLoader(manager); loader.setMeshoptDecoder(MeshoptDecoder); }
  return loader;
}

function prepareModel(gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    if (o.material && o.material.alphaTest > 0) o.material.alphaToCoverage = false;
  });
  return gltf.scene;
}

async function loadModel(id) {
  const g = await getLoader().loadAsync(`assets/people/${id}.glb`);
  A.models[id] = prepareModel(g);
}

// The merged animation files renamed some bones (e.g. "Bip01_L_Calf_3"): undo that.
function fixClipNames(gltf) {
  const out = {};
  for (const a of gltf.animations) {
    for (const t of a.tracks) t.name = t.name.replace(/^(.+?)_\d+(\.(quaternion|position))$/, '$1$2');
    out[a.name] = a;
  }
  return out;
}

export async function loadCharacters(manager) {
  const L = getLoader(manager);
  const [am, af] = await Promise.all([L.loadAsync('assets/people/anim_m.glb'), L.loadAsync('assets/people/anim_f.glb')]);
  A.clips.m = fixClipNames(am);
  A.clips.f = fixClipNames(af);
  await Promise.all([...CORE, ...FIRST_CROWD].map(loadModel));
}

// Rest of the crowd, after the game has started (keeps the first load short).
export async function loadMoreCrowd() {
  for (const id of [...CROWD_MEN, ...CROWD_WOMEN]) {
    if (A.models[id]) continue;
    try { await loadModel(id); } catch (e) { /* skip one that fails */ }
  }
}

export function loadedCrowd(female) {
  return (female ? CROWD_WOMEN : CROWD_MEN).filter((id) => A.models[id]);
}

// Which clip plays for each action, per body type.
const CLIP_NAMES = {
  m: { idle: 'idle', walk: 'walk', run: 'run', sprint: 'run_fast', crouch: 'crouch_idle', talk: 'gestic_talk', listen: 'gestic_listen',
    phone: 'cell_phone_talk', dance: 'dancing_cool', cheer: 'cheer', drink: 'drink_idle', sit: 'sit_chair_idle', look: 'idle_look_around', wait: 'idle_waiting' },
  f: { idle: 'idle', walk: 'walk', run: 'run', sprint: 'run_fast', crouch: 'crouch_idle', talk: 'gestic_talk', listen: 'gestic_talk',
    phone: 'cell_phone_textmessage', dance: 'dancing_cool', cheer: 'cheer', drink: 'drink_idle', sit: 'sit_chair_idle', look: 'idle', wait: 'idle' },
};
const GESTURES = ['talk', 'listen', 'phone', 'dance', 'cheer', 'drink', 'sit', 'look', 'wait'];

// Natural speeds (m/s) of the walk / run / sprint clips, to match the step rate.
const GAIT = { walk: 1.35, run: 3.9, sprint: 6.2 };

const BONES = {
  RightArm: 'Bip01_R_UpperArm', RightForeArm: 'Bip01_R_Forearm', RightHand: 'Bip01_R_Hand',
  LeftArm: 'Bip01_L_UpperArm', LeftForeArm: 'Bip01_L_Forearm', LeftHand: 'Bip01_L_Hand',
  Head: 'Bip01_Head', Neck: 'Bip01_Neck', Spine: 'Bip01_Spine', Spine1: 'Bip01_Spine1', Spine2: 'Bip01_Spine2', Pelvis: 'Bip01_Pelvis',
  LeftUpLeg: 'Bip01_L_Thigh', LeftLeg: 'Bip01_L_Calf', RightUpLeg: 'Bip01_R_Thigh', RightLeg: 'Bip01_R_Calf',
};

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class CharacterRig {
  // id: 'vikram' | 'ravi' | 'police' | 'swat' | one of the crowd ids
  constructor(id, opts = {}) {
    if (!A.models[id]) id = A.models.m_kurta ? 'm_kurta' : Object.keys(A.models)[0];
    this.id = id;
    this.sex = id.startsWith('f_') ? 'f' : 'm';
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(A.models[id]);
    this.root.add(this.model);
    this.meshes = [];
    this.castsShadow = !!opts.castShadow; this.shadowOn = !this.castsShadow;
    this.model.traverse((o) => { if (o.isMesh) { this.meshes.push(o); o.castShadow = this.castsShadow; } });
    this.shadowOn = this.castsShadow;

    this.bones = {};
    for (const [key, name] of Object.entries(BONES)) {
      const b = this.model.getObjectByName(name);
      if (b) this.bones[key] = b;
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    const clips = A.clips[this.sex], names = CLIP_NAMES[this.sex];
    for (const [key, clipName] of Object.entries(names)) {
      const clip = clips[clipName];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      a.time = Math.random() * clip.duration;   // crowds do not move in step
      this.actions[key] = a;
    }
    // Some names share one clip (women: look / wait = idle, listen = talk): weights are added up per clip,
    // otherwise one name would switch off the other and leave a stiff T-pose.
    this.uniq = [...new Set(Object.values(this.actions))];
    this.uniq.forEach((act, i) => { act.wi = i; });
    this.wts = new Float32Array(this.uniq.length);
    this.pending = 0;
    this.gesture = null; this.gestureW = 0;
    this.aimW = 0; this.aimDir = new THREE.Vector3(0, 0, 1);
    this.dead = false; this.fall = 0;
    this.crouchW = 0; this.lean = 0; this.twist = 0;
    this.t = Math.random() * 10;
    this.reverse = false;
  }

  // Blend idle / walk / run / sprint from the real speed (m/s). crouch 0..1.
  // Each gait plays alone (speeded up or slowed down to match the feet to the ground);
  // two gaits only mix in a short window while changing speed, so legs never look "double".
  setMotion(speed, crouch = 0) {
    if (this.dead) return;
    const a = this.actions;
    const s = Math.abs(speed);
    const k1 = clamp((s - 0.1) / 0.5, 0, 1), k2 = clamp((s - 2.2) / 0.6, 0, 1), k3 = clamp((s - 5.3) / 0.6, 0, 1);
    const idle = 1 - k1, walk = k1 * (1 - k2), run = k1 * k2 * (1 - k3), sprint = k1 * k2 * k3;
    const ges = this.gesture && a[this.gesture] ? this.gestureW * idle : 0;
    const crouchIdle = a.crouch ? crouch * idle : 0;
    const k = (1 - ges) * (1 - crouchIdle);
    const dir = this.reverse ? -1 : 1;
    const W = this.wts;
    W.fill(0);
    if (a.idle) W[a.idle.wi] += idle * k;
    if (a.walk) { W[a.walk.wi] += walk * k; a.walk.timeScale = dir * clamp(s / GAIT.walk, 0.5, 1.75); }
    if (a.run) { W[a.run.wi] += run * k; a.run.timeScale = dir * clamp(s / GAIT.run, 0.7, 1.45); }
    if (a.sprint) { W[a.sprint.wi] += sprint * k; a.sprint.timeScale = clamp(s / GAIT.sprint, 0.85, 1.3); }
    if (a.crouch) W[a.crouch.wi] += crouchIdle;
    if (this.gesture && a[this.gesture]) W[a[this.gesture].wi] += ges * (1 - crouchIdle);
    for (let i = 0; i < this.uniq.length; i++) this.uniq[i].setEffectiveWeight(W[i]);
    this.crouchW = crouch;
    this.moveCrouch = crouch * (1 - idle);   // bend the legs in code only while moving crouched
  }

  setGesture(name, weight = 1) {
    if (name && !this.actions[name]) name = name === 'agree' || name === 'headShake' ? 'listen' : 'talk';
    this.gesture = name;
    this.gestureW = name ? weight : 0;
  }

  setAim(weight, dir) {
    this.aimW = weight;
    if (dir) this.aimDir.copy(dir).normalize();
  }

  die(pushX = 0, pushZ = 1) {
    if (this.dead) return;
    this.dead = true;
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    if (this.actions.idle) this.actions.idle.setEffectiveWeight(1);
    this.fallDir = Math.atan2(pushX, pushZ) - this.root.rotation.y;
  }

  update(dt, distanceToCamera = 0) {
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
    this.t += dt;

    if (this.dead) {
      // Fall over (simple, no ragdoll): tip over away from the hit.
      this.fall = Math.min(1, this.fall + dt * 2.6);
      const e = 1 - Math.pow(1 - this.fall, 3);
      const ax = Math.cos(this.fallDir || 0), az = -Math.sin(this.fallDir || 0);
      this.model.quaternion.setFromAxisAngle(_v.set(ax, 0, az), e * Math.PI / 2 * 0.97);
      this.model.position.y = e * 0.15;
      return;
    }
    this.model.position.y = -this.moveCrouch * 0.32;
    if (this.moveCrouch > 0.01 || Math.abs(this.twist) > 0.01 || Math.abs(this.lean) > 0.01) this.poseExtras();
    if (this.aimW > 0.01) this.poseArms();
  }

  // Crouched walking (bent knees, leaning forward) and upper-body twist (aiming while strafing).
  poseExtras() {
    const b = this.bones;
    this.root.updateMatrixWorld(true);
    const left = _v.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q)).clone();
    const c = this.moveCrouch;
    if (c > 0.01) {
      for (const side of ['Left', 'Right']) {
        if (b[side + 'UpLeg']) rotateWorld(b[side + 'UpLeg'], left, -0.95 * c);
        if (b[side + 'Leg']) rotateWorld(b[side + 'Leg'], left, 1.45 * c);
      }
      if (b.Spine) rotateWorld(b.Spine, left, 0.35 * c);
    }
    if (Math.abs(this.twist) > 0.01 && b.Spine1) {
      rotateWorld(b.Spine1, UP, this.twist * 0.55);
      if (b.Spine2) rotateWorld(b.Spine2, UP, this.twist * 0.45);
    }
    if (Math.abs(this.lean) > 0.01 && b.Spine) rotateWorld(b.Spine, left, this.lean);
  }

  // Aim "IK": point the upper arm + forearm along the aim; left hand supports the gun.
  poseArms() {
    const b = this.bones, w = this.aimW, dir = this.aimDir;
    if (!b.RightArm || !b.RightForeArm || !b.RightHand) return;
    this.root.updateMatrixWorld(true);
    // Shoulder slightly towards the centre so the gun lines up with the eyes.
    pointBone(b.RightArm, b.RightForeArm, dir, w);
    pointBone(b.RightForeArm, b.RightHand, dir, w);
    if (b.LeftArm && b.LeftForeArm && b.LeftHand) {
      b.RightHand.getWorldPosition(_v2);
      _v2.addScaledVector(dir, 0.14);
      _v2.y -= 0.03;
      b.LeftArm.getWorldPosition(_v);
      pointBone(b.LeftArm, b.LeftForeArm, _v.subVectors(_v2, _v).normalize(), w * 0.92);
      b.LeftForeArm.getWorldPosition(_v);
      pointBone(b.LeftForeArm, b.LeftHand, _v.subVectors(_v2, _v).normalize(), w * 0.92);
    }
  }

  handPose(outPos, outDir) {
    const b = this.bones;
    if (!b.RightHand || !b.RightForeArm) { this.root.getWorldPosition(outPos).y += 1.3; outDir.set(0, 0, 1); return; }
    b.RightHand.getWorldPosition(outPos);
    b.RightForeArm.getWorldPosition(_v);
    outDir.subVectors(outPos, _v).normalize();
    // Grip sits a little past the wrist.
    outPos.addScaledVector(outDir, 0.07);
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

// Turn "bone" so the direction from it to "child" points along "dir" (world), weight w.
const _axis = new THREE.Vector3();
function pointBone(bone, child, dir, w) {
  bone.getWorldQuaternion(_q);
  _axis.copy(child.position).normalize().applyQuaternion(_q);     // current bone direction (world)
  _q2.setFromUnitVectors(_axis, dir).multiply(_q);
  _q.slerp(_q2, w);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q));
  bone.updateMatrixWorld(true);
}

// A random city person.
export function randomPersonRig(castShadow) {
  const female = Math.random() < 0.42;
  let pool = loadedCrowd(female);
  if (!pool.length) pool = loadedCrowd(!female);
  const id = pool[Math.floor(Math.random() * pool.length)];
  return new CharacterRig(id, { castShadow });
}

// Strafing while aiming: the legs follow the walking direction (up to 70 degrees off the aim),
// walking backwards plays the walk in reverse. Returns the yaw the legs should face.
// After turning the body, call rig.twist = angleDiff(bodyYaw, aimYaw) so the chest faces the aim.
const MAX_OFF = 70 * Math.PI / 180;
export function strafeYaw(rig, aimYaw, vx, vz) {
  if (Math.hypot(vx, vz) < 0.3) { rig.reverse = false; return aimYaw; }
  const moveYaw = Math.atan2(vx, vz);
  let rel = angleDiff(aimYaw, moveYaw);
  rig.reverse = Math.abs(rel) > 1.95;   // more than about 110 degrees: walking backwards
  if (rig.reverse) rel = angleDiff(aimYaw, moveYaw + Math.PI);
  return aimYaw + clamp(rel, -MAX_OFF, MAX_OFF);
}
export function twistTo(rig, bodyYaw, aimYaw) { rig.twist = clamp(angleDiff(bodyYaw, aimYaw), -1.4, 1.4); }
