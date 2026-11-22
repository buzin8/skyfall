import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Team } from '../types';
import { PBRTextureSet, TextureLibrary } from '../textures/ProceduralTextures';
import {
  buildBrushedGunmetalTexture,
  buildRefinedFaceTexture,
  buildSmoothAkWoodTexture,
  smoothGeometryNormals,
} from '../utils/MeshSmoothing';

export type AgentVisualStyle = 'ember' | 'duelist' | 'striker' | 'sentinel';

export interface SkinnedRigBones {
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  spine1?: THREE.Object3D;
  spine2?: THREE.Object3D;
  head?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  rightForeArm?: THREE.Object3D;
  rightHand?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  leftForeArm?: THREE.Object3D;
  leftHand?: THREE.Object3D;
  leftUpLeg?: THREE.Object3D;
  rightUpLeg?: THREE.Object3D;
  leftLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
}

export interface AgentRig {
  isSkinned: boolean;
  root: THREE.Group;
  modelPivot: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Group;
  rightGripTarget?: THREE.Object3D;
  leftGripTarget?: THREE.Object3D;
  blindHalo: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  flashMaterials: THREE.MeshStandardMaterial[];
  mixer?: THREE.AnimationMixer;
  actions?: {
    idle: THREE.AnimationAction;
    walk: THREE.AnimationAction;
    run: THREE.AnimationAction;
  };
  headBone?: THREE.Object3D;
  skBones?: SkinnedRigBones;
}

interface SoldierTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

let cachedSoldierTemplate: SoldierTemplate | null = null;
let soldierLoadPromise: Promise<void> | null = null;

/**
 * Preloads the real rigged Mixamo soldier GLB (/models/soldier.glb) once and smooths its
 * geometry normals so every cloned ally & enemy renders silky-smooth with 2-bone arm IK!
 */
export function preloadSoldierTemplate(): Promise<void> {
  if (cachedSoldierTemplate) return Promise.resolve();
  if (soldierLoadPromise) return soldierLoadPromise;

  soldierLoadPromise = new Promise<void>((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      '/models/soldier.glb',
      (gltf) => {
        // Apply skinning-safe crease-angle normal smoothing once on the shared template!
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry) {
            const lower = (mesh.name || '').toLowerCase();
            smoothGeometryNormals(mesh.geometry, lower.includes('visor') ? 72 : 62);
          }
        });
        cachedSoldierTemplate = {
          scene: gltf.scene,
          animations: gltf.animations || [],
        };
        resolve();
      },
      undefined,
      (err) => {
        console.warn('[AgentModel] Could not load /models/soldier.glb; falling back to procedural rig.', err);
        resolve();
      }
    );
  });
  return soldierLoadPromise;
}

// Zero-allocation scratch math objects for per-frame 2-bone analytical arm IK
const _pUpper = new THREE.Vector3();
const _pLower = new THREE.Vector3();
const _pEnd = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _poleVec = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _pElbow = new THREE.Vector3();
const _curDir = new THREE.Vector3();
const _desDir = new THREE.Vector3();
const _qDelta = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();

/**
 * Coordinate-frame-agnostic 2-bone analytical Inverse Kinematics solver for Mixamo arms.
 * Locks each soldier's right hand onto the AKM pistol grip and left hand under the wood handguard
 * with natural downward-bent elbows while legs run/walk smoothly underneath!
 */
export function solveTwoBoneArmIK(
  upperBone: THREE.Object3D,
  lowerBone: THREE.Object3D,
  endBone: THREE.Object3D,
  targetWorld: THREE.Vector3,
  poleWorld: THREE.Vector3,
  weight = 1.0
): void {
  if (weight <= 0.001 || !upperBone.parent) return;

  upperBone.getWorldPosition(_pUpper);
  lowerBone.getWorldPosition(_pLower);
  endBone.getWorldPosition(_pEnd);

  const l1 = _pUpper.distanceTo(_pLower);
  const l2 = _pLower.distanceTo(_pEnd);
  if (l1 < 1e-4 || l2 < 1e-4) return;

  _toTarget.subVectors(targetWorld, _pUpper);
  const rawDist = _toTarget.length();
  if (rawDist < 1e-4) return;

  const minReach = Math.abs(l1 - l2) + 0.015;
  const maxReach = (l1 + l2) * 0.992;
  const d = THREE.MathUtils.clamp(rawDist, minReach, maxReach);
  _dir.copy(_toTarget).divideScalar(rawDist);

  // Law of cosines for exact elbow bend angle
  const cosAlpha = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

  // Project elbow pole perpendicular to shoulder->hand axis
  _poleVec.subVectors(poleWorld, _pUpper);
  const proj = _poleVec.dot(_dir);
  _perp.copy(_poleVec).addScaledVector(_dir, -proj);
  if (_perp.lengthSq() < 1e-6) {
    _perp.set(0, -1, 0);
  } else {
    _perp.normalize();
  }

  // Desired world elbow position
  _pElbow
    .copy(_pUpper)
    .addScaledVector(_dir, l1 * cosAlpha)
    .addScaledVector(_perp, l1 * sinAlpha);

  // 1. Align upper arm bone toward desired elbow
  _curDir.subVectors(_pLower, _pUpper).normalize();
  _desDir.subVectors(_pElbow, _pUpper).normalize();
  _qDelta.setFromUnitVectors(_curDir, _desDir);

  upperBone.getWorldQuaternion(_qWorld);
  upperBone.parent.getWorldQuaternion(_qParentInv).invert();
  _qWorld.premultiply(_qDelta);
  _qParentInv.multiply(_qWorld);
  if (weight >= 0.999) {
    upperBone.quaternion.copy(_qParentInv);
  } else {
    upperBone.quaternion.slerp(_qParentInv, weight);
  }
  upperBone.updateMatrixWorld(true);

  // 2. Align forearm bone toward exact AKM grip target
  lowerBone.getWorldPosition(_pLower);
  endBone.getWorldPosition(_pEnd);
  _curDir.subVectors(_pEnd, _pLower).normalize();
  _desDir.subVectors(targetWorld, _pLower);
  if (_desDir.lengthSq() < 1e-6) return;
  _desDir.normalize();

  _qDelta.setFromUnitVectors(_curDir, _desDir);
  lowerBone.getWorldQuaternion(_qWorld);
  upperBone.getWorldQuaternion(_qParentInv).invert();
  _qWorld.premultiply(_qDelta);
  _qParentInv.multiply(_qWorld);
  if (weight >= 0.999) {
    lowerBone.quaternion.copy(_qParentInv);
  } else {
    lowerBone.quaternion.slerp(_qParentInv, weight);
  }
  lowerBone.updateMatrixWorld(true);
}

const invisibleHitMat = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
});

let sharedAkmMatsReady = false;
let sharedAkmSteelMat: THREE.MeshStandardMaterial;
let sharedAkmWoodMat: THREE.MeshStandardMaterial;
let sharedAkmMagMat: THREE.MeshStandardMaterial;
let sharedAkmDarkMat: THREE.MeshStandardMaterial;

function ensureBotAkmMaterials(): void {
  if (sharedAkmMatsReady) return;
  sharedAkmMatsReady = true;
  const woodTex = buildSmoothAkWoodTexture();
  const steelTex = buildBrushedGunmetalTexture();
  sharedAkmSteelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa8c2,
    map: steelTex,
    roughness: 0.34,
    metalness: 0.72,
    envMapIntensity: 1.2,
  });
  sharedAkmWoodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodTex,
    roughness: 0.48,
    metalness: 0.04,
  });
  sharedAkmMagMat = new THREE.MeshStandardMaterial({
    color: 0x5c3224,
    roughness: 0.42,
    metalness: 0.18,
  });
  sharedAkmDarkMat = new THREE.MeshStandardMaterial({
    color: 0x222730,
    roughness: 0.54,
    metalness: 0.28,
  });
}

function buildBotMuzzleFlash(muzzlePoint: THREE.Object3D): THREE.Group {
  const muzzleFlash = new THREE.Group();
  muzzleFlash.position.copy(muzzlePoint.position);
  const mfOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff7824,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mfCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffe8b0,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mfJet = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 6), mfOuterMat);
  mfJet.rotation.x = Math.PI / 2;
  mfJet.position.z = 0.12;
  muzzleFlash.add(mfJet);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 5), mfOuterMat);
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    fin.rotation.z = a;
    fin.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.02);
    muzzleFlash.add(fin);
  }
  muzzleFlash.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), mfCoreMat));
  muzzleFlash.visible = false;
  return muzzleFlash;
}

/**
 * Smooth sculpted third-person Cryzen AKM rifle with exact right-hand pistol grip
 * and left-hand wooden handguard IK targets so soldiers shoulder & aim cleanly!
 */
function buildCompactBotAkm(): {
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Group;
  rightGripTarget: THREE.Object3D;
  leftGripTarget: THREE.Object3D;
} {
  ensureBotAkmMaterials();
  const weaponPivot = new THREE.Group();
  // Snugly tucked into right shoulder pocket so wooden stock rests against shoulder & both hands wrap cleanly!
  weaponPivot.position.set(-0.145, 1.3, 0.17);
  weaponPivot.rotation.set(0.02, 0.06, 0);

  // Tapered smooth wooden AKM buttstock tucked right into right shoulder
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0.0, 0.03);
  stockShape.lineTo(-0.24, 0.01);
  stockShape.lineTo(-0.24, -0.075);
  stockShape.lineTo(0.0, -0.032);
  stockShape.closePath();
  const stockGeo = new THREE.ExtrudeGeometry(stockShape, {
    depth: 0.038,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  stockGeo.translate(0, 0, -0.019);
  stockGeo.rotateY(-Math.PI / 2); // -X becomes -Z rear!
  const stock = new THREE.Mesh(stockGeo, sharedAkmWoodMat);
  stock.position.set(0, 0.0, -0.02);
  stock.castShadow = true;
  weaponPivot.add(stock);

  // Smooth chamfered steel receiver + rounded ribbed dust cover
  const recGeo = new THREE.CylinderGeometry(0.034, 0.038, 0.31, 8);
  recGeo.rotateX(Math.PI / 2);
  recGeo.scale(0.85, 1.15, 1.0);
  const receiver = new THREE.Mesh(recGeo, sharedAkmSteelMat);
  receiver.position.set(0, 0.006, 0.13);
  receiver.castShadow = true;
  weaponPivot.add(receiver);

  const dustCover = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.28, 8), sharedAkmDarkMat);
  dustCover.rotation.x = Math.PI / 2;
  dustCover.position.set(0, 0.044, 0.13);
  weaponPivot.add(dustCover);

  // Rounded varnished wooden AKM handguard + upper gas tube cylinder
  const lowerHg = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.2, 5, 10), sharedAkmWoodMat);
  lowerHg.rotation.x = Math.PI / 2;
  lowerHg.scale.set(0.92, 1, 1.08);
  lowerHg.position.set(0, 0.004, 0.39);
  lowerHg.castShadow = true;
  weaponPivot.add(lowerHg);

  const upperGasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.22, 10), sharedAkmWoodMat);
  upperGasTube.rotation.x = Math.PI / 2;
  upperGasTube.position.set(0, 0.032, 0.38);
  weaponPivot.add(upperGasTube);

  // Contoured pistol grip
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.085, 4, 8), sharedAkmDarkMat);
  grip.position.set(0, -0.068, 0.03);
  grip.rotation.x = -0.28;
  weaponPivot.add(grip);

  // Iconic curved 2-segment Bakelite 7.62 magazine
  const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.115, 0.062), sharedAkmMagMat);
  magTop.position.set(0, -0.078, 0.21);
  magTop.rotation.x = 0.2;
  magTop.castShadow = true;
  weaponPivot.add(magTop);
  const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.115, 0.06), sharedAkmMagMat);
  magBot.position.set(0, -0.172, 0.246);
  magBot.rotation.x = 0.42;
  magBot.castShadow = true;
  weaponPivot.add(magBot);

  // Smooth cylindrical barrel, gas block, slant brake & hooded AKM front sight post
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.34, 10), sharedAkmSteelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.016, 0.65);
  weaponPivot.add(barrel);

  const gasBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8), sharedAkmDarkMat);
  gasBlock.rotation.x = Math.PI / 2;
  gasBlock.position.set(0, 0.032, 0.54);
  weaponPivot.add(gasBlock);

  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.048, 0.018), sharedAkmDarkMat);
  frontSight.position.set(0, 0.048, 0.74);
  weaponPivot.add(frontSight);

  // Exact IK grip anchors where the soldier's rigged hands lock cleanly onto the AKM!
  const rightGripTarget = new THREE.Object3D();
  rightGripTarget.position.set(-0.008, -0.056, 0.035);
  weaponPivot.add(rightGripTarget);

  const leftGripTarget = new THREE.Object3D();
  leftGripTarget.position.set(0.016, -0.016, 0.345);
  weaponPivot.add(leftGripTarget);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.016, 0.84);
  weaponPivot.add(muzzlePoint);

  const muzzleFlash = buildBotMuzzleFlash(muzzlePoint);
  weaponPivot.add(muzzleFlash);

  return { weaponPivot, muzzlePoint, muzzleFlash, rightGripTarget, leftGripTarget };
}

// Cached smooth vertex-contoured face geometry with crisp planar-spherical front UVs
let sharedRefinedFaceGeo: THREE.BufferGeometry | null = null;
const cachedFaceTextures = new Map<string, THREE.CanvasTexture>();

function getRefinedFaceGeometry(): THREE.BufferGeometry {
  if (sharedRefinedFaceGeo) return sharedRefinedFaceGeo;
  const geo = new THREE.SphereGeometry(7.35, 32, 24);
  geo.scale(0.84, 1.03, 0.78);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    if (z > 0.5) {
      // Subtle continuous organic 3D facial sculpting: gentle nose ridge, brow contour & chin fullness
      const noseRidge = Math.exp(-Math.pow(x / 1.35, 2) - Math.pow((y + 0.65) / 2.2, 2)) * 1.18;
      const browArch = Math.exp(-Math.pow(x / 4.2, 2) - Math.pow((y - 2.3) / 1.15, 2)) * 0.35;
      const chinLift = Math.exp(-Math.pow(x / 2.6, 2) - Math.pow((y + 4.8) / 1.6, 2)) * 0.38;
      z += noseRidge + browArch + chinLift;
      pos.setXYZ(i, x, y, z);
    }

    // Precision front-face UV mapping aligning painted almond eyes, brows, nose & mouth seamlessly!
    const u = THREE.MathUtils.clamp(0.5 + x / 11.4, 0.02, 0.98);
    const v = THREE.MathUtils.clamp(0.52 + y / 14.2, 0.02, 0.98);
    uv.setXY(i, u, v);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  sharedRefinedFaceGeo = geo;
  return geo;
}

function buildExpressiveOperatorFace(team: Team, variant: number): THREE.Group {
  const face = new THREE.Group();
  const isAlly = team === 'ally';
  const vKey = `${team}:${Math.abs(variant) % 4}`;
  let faceTex = cachedFaceTextures.get(vKey);
  if (!faceTex) {
    faceTex = buildRefinedFaceTexture(team, variant);
    cachedFaceTextures.set(vKey, faceTex);
  }

  const matFace = new THREE.MeshStandardMaterial({
    map: faceTex,
    emissiveMap: faceTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.16,
    roughness: 0.62,
    metalness: 0.02,
    envMapIntensity: 0.45,
  });

  // Single silky-smooth continuous sculpted human face (zero bumpy primitive spheres!)
  const faceMesh = new THREE.Mesh(getRefinedFaceGeometry(), matFace);
  faceMesh.position.set(0, -0.35, 0.35);
  face.add(faceMesh);

  // Subtle low-profile dark helmet chinstrap framing the lower jaw
  const matGearDark = new THREE.MeshStandardMaterial({
    color: 0x222832,
    roughness: 0.56,
    metalness: 0.32,
  });
  const chinStrap = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.32, 6, 18, Math.PI * 0.72), matGearDark);
  chinStrap.rotation.x = Math.PI * 0.34;
  chinStrap.rotation.z = -Math.PI * 0.86;
  chinStrap.position.set(0, -4.65, 1.5);
  face.add(chinStrap);

  // Sleek slim tactical helmet brow accent strip (keeps forehead & eyebrows 100% unobstructed!)
  const matIffGlow = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x62f7ff : 0xff4b34,
    emissive: new THREE.Color(isAlly ? 0x20e2ff : 0xff2816),
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.2,
  });
  const browTrim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.15, 2.0), matGearDark);
  browTrim.position.set(0, 5.8, 4.4);
  browTrim.rotation.x = -0.2;
  face.add(browTrim);
  const iffPip = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.52, 0.6), matIffGlow);
  iffPip.position.set(0, 5.85, 5.42);
  iffPip.rotation.x = -0.2;
  face.add(iffPip);

  return face;
}

function buildSkinnedSoldierRig(agentId: string, team: Team, style: AgentVisualStyle): AgentRig {
  const tpl = cachedSoldierTemplate!;
  const root = new THREE.Group();
  const modelPivot = new THREE.Group();
  root.add(modelPivot);

  const cloned = SkeletonUtils.clone(tpl.scene) as THREE.Group;
  // Mixamo Soldier.glb faces -Z by default; rotate 180° around Y so he faces +Z matching our AI convention!
  cloned.rotation.y = Math.PI;
  cloned.scale.setScalar(0.96);
  modelPivot.add(cloned);

  const hitMeshes: THREE.Mesh[] = [];
  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const isAlly = team === 'ally';

  // Clean bright Cryzen.io-inspired Team Blue (Ally) vs Team Red (Enemy) smooth shading!
  const bodyTint = isAlly
    ? 0x5ca8ff
    : style === 'sentinel'
    ? 0xe83244
    : style === 'striker'
    ? 0xff4e42
    : 0xff3b4c;
  const bodyEmissive = isAlly ? 0x10306b : 0x540b14;

  cloned.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const lowerName = (mesh.name || '').toLowerCase();
    // Hide the blank opaque vanguard visor so our sculpted 3D Cryzen human face shows clearly!
    if (lowerName.includes('visor')) {
      mesh.visible = false;
      return;
    }
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clonedMats = mats.map((m) => {
      const clonedMat = m.clone() as THREE.MeshStandardMaterial;
      if (clonedMat.isMeshStandardMaterial) {
        clonedMat.flatShading = false;
        clonedMat.color.setHex(bodyTint);
        clonedMat.emissive.setHex(bodyEmissive);
        clonedMat.emissiveIntensity = 0.22;
        clonedMat.roughness = 0.52;
        clonedMat.metalness = 0.16;
        clonedMat.envMapIntensity = 1.0;
        if (clonedMat.normalScale) {
          clonedMat.normalScale.set(0.36, 0.36);
        }
        flashMaterials.push(clonedMat);
        clonedMat.needsUpdate = true;
      }
      return clonedMat;
    });
    mesh.material = Array.isArray(mesh.material) ? clonedMats : clonedMats[0];
  });

  // Bone discovery immune to GLTFLoader colon/dot stripping (e.g. "mixamorig:Head" -> "mixamorigHead")
  const findBone = (pattern: RegExp): THREE.Object3D | null => {
    let found: THREE.Object3D | null = null;
    cloned.traverse((o) => {
      if (!found && o.name && pattern.test(o.name.replace(/[:._]/g, ''))) {
        found = o;
      }
    });
    return found;
  };

  const skBones: SkinnedRigBones = {
    hips: findBone(/^mixamorigHips$/i) ?? undefined,
    spine: findBone(/^mixamorigSpine$/i) ?? undefined,
    spine1: findBone(/^mixamorigSpine1$/i) ?? undefined,
    spine2: findBone(/^mixamorigSpine2$/i) ?? undefined,
    head: findBone(/^mixamorigHead$/i) ?? undefined,
    rightArm: findBone(/^mixamorigRightArm$/i) ?? undefined,
    rightForeArm: findBone(/^mixamorigRightForeArm$/i) ?? undefined,
    rightHand: findBone(/^mixamorigRightHand$/i) ?? undefined,
    leftArm: findBone(/^mixamorigLeftArm$/i) ?? undefined,
    leftForeArm: findBone(/^mixamorigLeftForeArm$/i) ?? undefined,
    leftHand: findBone(/^mixamorigLeftHand$/i) ?? undefined,
    leftUpLeg: findBone(/^mixamorigLeftUpLeg$/i) ?? undefined,
    rightUpLeg: findBone(/^mixamorigRightUpLeg$/i) ?? undefined,
    leftLeg: findBone(/^mixamorigLeftLeg$/i) ?? undefined,
    rightLeg: findBone(/^mixamorigRightLeg$/i) ?? undefined,
  };

  const headBone = skBones.head;
  const spineBone = skBones.spine1 ?? skBones.spine;
  const leftLegBone = skBones.leftUpLeg;
  const rightLegBone = skBones.rightUpLeg;

  const registerHit = (mesh: THREE.Mesh, zone: 'head' | 'body' | 'leg') => {
    mesh.userData.agentId = agentId;
    mesh.userData.hitZone = zone;
    mesh.userData.team = team;
    hitMeshes.push(mesh);
    return mesh;
  };

  // Attach invisible bone-tracked hitboxes & sculpted 3D expressive human face in Mixamo cm space!
  if (headBone) {
    const headHit = registerHit(new THREE.Mesh(new THREE.SphereGeometry(18, 8, 6), invisibleHitMat), 'head');
    headHit.position.set(0, 11, 2);
    headBone.add(headHit);

    // Compute exact face-opening anchor in bind pose BEFORE AnimationMixer moves the skeleton!
    root.updateMatrixWorld(true);
    let faceVariant = 0;
    for (let i = 0; i < agentId.length; i++) faceVariant += agentId.charCodeAt(i) * (i + 1);
    const faceGroup = buildExpressiveOperatorFace(team, faceVariant);
    const charNode = cloned.children[0] ?? cloned;
    const bindFaceCenter = new THREE.Vector3(0, 4.6, 167.2);
    charNode.localToWorld(bindFaceCenter);
    headBone.worldToLocal(bindFaceCenter);
    faceGroup.position.copy(bindFaceCenter);
    headBone.add(faceGroup);
  } else {
    const headHit = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), invisibleHitMat), 'head');
    headHit.position.set(0, 1.63, 0);
    modelPivot.add(headHit);
  }

  if (spineBone) {
    const bodyHit = registerHit(new THREE.Mesh(new THREE.BoxGeometry(44, 62, 32), invisibleHitMat), 'body');
    bodyHit.position.set(0, 18, 0);
    spineBone.add(bodyHit);
  } else {
    const bodyHit = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.32), invisibleHitMat), 'body');
    bodyHit.position.set(0, 1.15, 0);
    modelPivot.add(bodyHit);
  }

  if (leftLegBone && rightLegBone) {
    const lHit = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(14, 11, 56, 6), invisibleHitMat), 'leg');
    lHit.position.set(0, 26, 0);
    leftLegBone.add(lHit);
    const rHit = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(14, 11, 56, 6), invisibleHitMat), 'leg');
    rHit.position.set(0, 26, 0);
    rightLegBone.add(rHit);
  } else {
    const legHit = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.8, 0.28), invisibleHitMat), 'leg');
    legHit.position.set(0, 0.42, 0);
    modelPivot.add(legHit);
  }

  const blindHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.92 })
  );
  blindHalo.rotation.x = Math.PI / 2;
  blindHalo.position.set(0, 1.94, 0);
  blindHalo.visible = false;
  modelPivot.add(blindHalo);

  // Smooth sculpted Cryzen AKM shouldered cleanly with exact hand IK anchors!
  const { weaponPivot, muzzlePoint, muzzleFlash, rightGripTarget, leftGripTarget } = buildCompactBotAkm();
  modelPivot.add(weaponPivot);

  // Setup continuous 3-way blended skeletal AnimationMixer (Idle <-> Walk <-> Run with zero snaps!)
  const mixer = new THREE.AnimationMixer(cloned);
  const findClip = (name: string) =>
    tpl.animations.find((c) => c.name.toLowerCase() === name) ?? tpl.animations[0];

  const idleAction = mixer.clipAction(findClip('idle'));
  const walkAction = mixer.clipAction(findClip('walk'));
  const runAction = mixer.clipAction(findClip('run'));
  idleAction.enabled = true;
  walkAction.enabled = true;
  runAction.enabled = true;
  idleAction.setEffectiveWeight(1).play();
  walkAction.setEffectiveWeight(0).play();
  runAction.setEffectiveWeight(0).play();
  mixer.update(Math.random() * 1.2); // Slight phase stagger so squadmates don't breathe in unison!

  const dummy = () => new THREE.Group();
  return {
    isSkinned: true,
    root,
    modelPivot,
    hips: dummy(),
    torso: dummy(),
    headGroup: dummy(),
    leftLeg: dummy(),
    rightLeg: dummy(),
    leftKnee: dummy(),
    rightKnee: dummy(),
    leftFoot: dummy(),
    rightFoot: dummy(),
    weaponPivot,
    muzzlePoint,
    muzzleFlash,
    rightGripTarget,
    leftGripTarget,
    blindHalo,
    hitMeshes,
    flashMaterials,
    mixer,
    actions: { idle: idleAction, walk: walkAction, run: runAction },
    headBone,
    skBones,
  };
}

// Shared beveled SAPI armor plate geometry (created once, zero per-bot cost)
const sharedSapiPlateGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.125, -0.145);
  s.lineTo(0.125, -0.145);
  s.lineTo(0.135, 0.045);
  s.lineTo(0.088, 0.15);
  s.lineTo(-0.088, 0.15);
  s.lineTo(-0.135, 0.045);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  g.translate(0, 0, -0.018);
  return g;
})();

/**
 * High-detail PBR-textured tactical operator rig with ripstop BDU fabric, Cordura MOLLE plate carrier,
 * beveled SAPI armor plates, FAST ballistic helmet + NVG shroud + Peltor comms headset,
 * multi-joint hip/knee/ankle articulation, bare/gloved forearms, and tactical carbine rifles.
 * - Ally (`team === 'ally'`): Navy/slate-blue Spec-Ops ripstop BDU, charcoal MOLLE plate carrier,
 *   matte steel-blue FAST helmet with cyan IFF strobe/patch, smoked ballistic goggles, black balaclava.
 * - Enemy (`team === 'enemy'`): Dark olive/charcoal short-sleeve combat shirt, bare PBR forearms,
 *   textured indigo/slate tactical trousers, coyote-tan/earth MOLLE vest, olive/charcoal FAST helmet
 *   with crimson IFF band, brow goggles, tactical neck gaiter, and desert-tan/black carbine.
 */
export function buildAgentRig(
  agentId: string,
  team: Team,
  style: AgentVisualStyle,
  textures?: TextureLibrary
): AgentRig {
  if (cachedSoldierTemplate) {
    return buildSkinnedSoldierRig(agentId, team, style);
  }
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.94;
  root.add(hips);

  const hitMeshes: THREE.Mesh[] = [];
  const flashMaterials: THREE.MeshStandardMaterial[] = [];

  const isAlly = team === 'ally';

  const mkPbrMat = (
    color: number,
    pbr?: PBRTextureSet,
    roughness = 0.85,
    metalness = 0.06,
    bumpScale = 0.018,
    emissiveIntensity = 0.09
  ) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      map: pbr?.map ?? null,
      roughnessMap: pbr?.roughnessMap ?? null,
      bumpMap: pbr?.bumpMap ?? null,
      bumpScale,
      roughness,
      metalness,
      emissive: new THREE.Color(color),
      emissiveIntensity,
      envMapIntensity: 1.2,
    });
    flashMaterials.push(m);
    return m;
  };

  // Grounded military PBR palette (no flat plastic solid colors!)
  const shirtTint = isAlly
    ? 0xb8d4f5
    : style === 'sentinel'
    ? 0x9fa6a0
    : style === 'striker'
    ? 0xb0a193
    : 0x9aa09a;

  const pantsTint = isAlly
    ? 0xa4c2e8
    : style === 'sentinel'
    ? 0x9cb4cf
    : 0xb6cce4;

  const vestTint = isAlly
    ? 0x525864
    : style === 'striker'
    ? 0xb89368
    : style === 'sentinel'
    ? 0x7e6d5a
    : 0x9f835e;

  const helmetTint = isAlly
    ? 0x4b77ad
    : style === 'sentinel'
    ? 0x6f756b
    : 0x788066;

  const matShirt = mkPbrMat(
    shirtTint,
    isAlly ? textures?.tacticalFabricAlly : textures?.tacticalFabricEnemy,
    0.88,
    0.04,
    0.022,
    0.09
  );
  const matPants = mkPbrMat(
    pantsTint,
    isAlly ? textures?.tacticalFabricAlly : textures?.tacticalDenim,
    0.9,
    0.03,
    0.024,
    0.09
  );
  const matVest = mkPbrMat(vestTint, textures?.tacticalVest, 0.82, 0.08, 0.028, 0.09);
  const matHelmet = mkPbrMat(helmetTint, textures?.helmetShell, 0.62, 0.16, 0.015, 0.09);
  const matSkin = mkPbrMat(isAlly ? 0xe4b598 : 0xdba584, textures?.operatorSkin, 0.7, 0.02, 0.008, 0.12);
  const matMask = mkPbrMat(
    isAlly ? 0x262b33 : 0x636b50,
    textures?.tacticalFabricEnemy,
    0.9,
    0.02,
    0.016,
    0.08
  );
  const matDarkGear = mkPbrMat(0x23272e, textures?.tacticalVest, 0.64, 0.22, 0.014, 0.07);
  const matBoot = mkPbrMat(0x24211f, textures?.helmetShell, 0.72, 0.14, 0.015, 0.07);
  const matGlove = mkPbrMat(0x1f2329, textures?.helmetShell, 0.62, 0.18, 0.01, 0.08);

  const matHardware = new THREE.MeshStandardMaterial({
    color: 0x20242b,
    roughness: 0.42,
    metalness: 0.56,
    envMapIntensity: 1.4,
  });
  const matGoggleLens = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x102436 : 0x1a1e24,
    roughness: 0.1,
    metalness: 0.84,
    envMapIntensity: 1.85,
  });
  const matIffPatch = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x3ad8ff : 0xff5438,
    emissive: new THREE.Color(isAlly ? 0x22b8e8 : 0xd93824),
    emissiveIntensity: 0.85,
    roughness: 0.4,
    metalness: 0.1,
  });
  const matGunSteel = new THREE.MeshStandardMaterial({
    color: 0x262b33,
    roughness: 0.36,
    metalness: 0.78,
    envMapIntensity: 1.45,
  });
  const matGunAccent = isAlly
    ? new THREE.MeshStandardMaterial({
        color: 0x3b4452,
        roughness: 0.42,
        metalness: 0.62,
        envMapIntensity: 1.35,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xd9b87a,
        map: textures?.desertTan.map ?? null,
        roughnessMap: textures?.desertTan.roughnessMap ?? null,
        roughness: 0.44,
        metalness: 0.28,
        envMapIntensity: 1.3,
      });

  const registerHit = (mesh: THREE.Mesh, zone: 'head' | 'body' | 'leg') => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.agentId = agentId;
    mesh.userData.hitZone = zone;
    mesh.userData.team = team;
    hitMeshes.push(mesh);
    return mesh;
  };

  // ===== MULTI-JOINT ARTICULATED LEGS (Hip -> Thigh -> Knee -> Shin -> Ankle -> Tactical Combat Boot) =====
  const buildLeg = (
    side: number
  ): { hipPivot: THREE.Group; kneePivot: THREE.Group; footPivot: THREE.Group } => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.118, 0, 0);

    // Textured tactical BDU/denim upper thigh
    const thigh = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.27, 6, 12), matPants), 'leg');
    thigh.position.y = -0.215;
    hipPivot.add(thigh);

    // Tactical cargo pocket (left thigh) or drop-leg holster rig (right thigh)
    const thighPouch = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.036, 0.095, 4, 8),
      side < 0 ? matDarkGear : matPants
    );
    thighPouch.scale.set(0.62, 1.0, 1.32);
    thighPouch.position.set(side * 0.08, -0.21, 0.005);
    hipPivot.add(thighPouch);

    if (side < 0 || isAlly) {
      for (const sy of [-0.175, -0.245]) {
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.089, 0.0085, 5, 14), matDarkGear);
        strap.rotation.x = Math.PI / 2;
        strap.position.y = sy;
        hipPivot.add(strap);
      }
    }

    // Articulated Knee Joint
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.43, 0);
    hipPivot.add(kneePivot);

    // Hard-shell ballistic tactical knee pad + twin retention straps
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), matDarkGear);
    kneeCap.scale.set(0.92, 1.08, 0.96);
    kneeCap.position.set(0, 0, 0.022);
    kneePivot.add(kneeCap);

    const kneeArmorPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.045, 5, 8), matHardware);
    kneeArmorPlate.scale.set(1.15, 1.0, 0.48);
    kneeArmorPlate.position.set(0, 0.004, 0.072);
    kneePivot.add(kneeArmorPlate);

    const kneeStrap = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.008, 5, 12), matDarkGear);
    kneeStrap.rotation.x = Math.PI / 2;
    kneeStrap.position.y = -0.015;
    kneePivot.add(kneeStrap);

    // Textured lower shin/calf
    const shin = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.071, 0.27, 6, 12), matPants), 'leg');
    shin.position.y = -0.21;
    kneePivot.add(shin);

    // Articulated Ankle / Lace-Up Combat Boot Joint
    const footPivot = new THREE.Group();
    footPivot.position.set(0, -0.42, 0);
    kneePivot.add(footPivot);

    const bootCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.064, 0.12, 10), matBoot);
    bootCollar.position.y = 0.025;
    footPivot.add(bootCollar);

    const bootUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.145, 5, 10), matBoot);
    bootUpper.rotation.x = Math.PI / 2;
    bootUpper.scale.set(1.12, 1.0, 0.84);
    bootUpper.position.set(0, -0.042, 0.058);
    bootUpper.castShadow = true;
    footPivot.add(bootUpper);

    // Thick lugged dark rubber sole under combat boot
    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.024, 0.245), matHardware);
    bootSole.position.set(0, -0.078, 0.058);
    footPivot.add(bootSole);

    return { hipPivot, kneePivot, footPivot };
  };

  // Anatomical left is +X and anatomical right is -X when facing +Z
  const leftLegBuilt = buildLeg(1);
  const rightLegBuilt = buildLeg(-1);
  hips.add(leftLegBuilt.hipPivot);
  hips.add(rightLegBuilt.hipPivot);

  // Rounded athletic pelvis & heavy tactical battle belt with dump pouch & buckle
  const pelvis = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.138, 0.14, 6, 12), matPants), 'body');
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(0.76, 1, 0.84);
  pelvis.position.y = 0.02;
  hips.add(pelvis);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.194, 0.068, 14), matDarkGear);
  belt.scale.set(1.06, 1, 0.74);
  belt.position.y = 0.076;
  hips.add(belt);

  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.052, 0.024), matHardware);
  beltBuckle.position.set(0, 0.076, 0.144);
  hips.add(beltBuckle);

  const dumpPouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.125, 0.062), matVest);
  dumpPouch.position.set(0.12, 0.02, -0.135);
  hips.add(dumpPouch);

  // ===== SCULPTED ORGANIC TORSO, BEVELED SAPI PLATE CARRIER & MOLLE TACTICAL RIG =====
  const torso = new THREE.Group();
  torso.position.y = 0.08; // World y = 1.02
  hips.add(torso);

  // Tapered athletic ripstop combat shirt chest/waist
  const chestCore = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.208, 0.165, 0.48, 14), matShirt), 'body');
  chestCore.scale.set(1.08, 1, 0.66);
  chestCore.position.y = 0.25;
  torso.add(chestCore);

  // Contoured Cordura cummerbund wrapping torso sides
  const cummerbund = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.218, 0.186, 0.34, 14), matVest), 'body');
  cummerbund.scale.set(1.07, 1, 0.75);
  cummerbund.position.set(0, 0.24, 0.004);
  torso.add(cummerbund);

  // Beveled front & back SAPI ballistic armor plate carriers (ExtrudeGeometry!)
  const frontPlate = registerHit(new THREE.Mesh(sharedSapiPlateGeo, matVest), 'body');
  frontPlate.position.set(0, 0.285, 0.142);
  torso.add(frontPlate);

  const backPlate = registerHit(new THREE.Mesh(sharedSapiPlateGeo, matVest), 'body');
  backPlate.position.set(0, 0.295, -0.142);
  torso.add(backPlate);

  // Chest admin pouch + subtle team IFF Velcro callsign strip on upper chest
  const adminPouch = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.072, 0.028), matDarkGear);
  adminPouch.position.set(0, 0.355, 0.168);
  torso.add(adminPouch);

  const chestIff = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.02, 0.01), matIffPatch);
  chestIff.position.set(0, 0.36, 0.183);
  torso.add(chestIff);

  // 3 sculpted rifle magazine pouches with dark retention tabs across lower front vest
  for (const px of [-0.088, 0, 0.088]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.125, 0.048), matVest);
    pouch.position.set(px, 0.185, 0.172);
    torso.add(pouch);

    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.036), matHardware);
    magTop.position.set(px, 0.252, 0.172);
    torso.add(magTop);
  }

  // Heavy padded shoulder harness straps & tactical comms whip antenna
  for (const sx of [-0.125, 0.125]) {
    const strap = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.11, 4, 8), matVest);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(1.1, 1.35, 0.55);
    strap.position.set(sx, 0.468, 0);
    torso.add(strap);
  }

  // Compact tactical hydration pack & flexible comms antenna on back
  const backPack = registerHit(new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.15, 5, 10), matVest), 'body');
  backPack.scale.set(1.15, 1.0, 0.58);
  backPack.position.set(0, 0.285, -0.188);
  torso.add(backPack);

  const radioBody = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.115, 0.038), matHardware);
  radioBody.position.set(0.135, 0.34, -0.155);
  torso.add(radioBody);

  const whipAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.34, 6), matHardware);
  whipAntenna.position.set(0.145, 0.54, -0.16);
  whipAntenna.rotation.z = -0.09;
  whipAntenna.rotation.x = -0.12;
  torso.add(whipAntenna);

  // Shirt collar, deltoid shoulders & subtle team IFF shoulder patches
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.125, 0.085, 12), matShirt);
  collar.position.set(0, 0.488, 0);
  torso.add(collar);

  for (const sx of [-1, 1]) {
    const deltoid = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.102, 12, 10), matShirt), 'body');
    deltoid.scale.set(1.0, 1.1, 0.96);
    deltoid.position.set(sx * 0.232, 0.41, 0);
    torso.add(deltoid);

    // Tactical Velcro shoulder identification patch (instant Ally vs Enemy clarity!)
    const shoulderPatch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.034, 0.052), matIffPatch);
    shoulderPatch.position.set(sx * 0.332, 0.405, 0.005);
    torso.add(shoulderPatch);
  }

  // ===== SCULPTED HEAD, HIGH-CUT FAST HELMET, NVG SHROUD, PELTOR COMMS & GOGGLES (center y ≈ 1.67) =====
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.5, 0);
  torso.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.098, 10), matMask);
  neck.position.y = 0.03;
  headGroup.add(neck);

  // Head hitbox centered at y = 0.15 -> exact world y = 1.67
  const headBase = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.122, 14, 12), matSkin), 'head');
  headBase.scale.set(0.88, 1.08, 0.98);
  headBase.position.y = 0.15;
  headGroup.add(headBase);

  // Textured ballistic balaclava / tactical neck gaiter covering lower face
  const faceMask = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.098, 0.132, 14), matMask);
  faceMask.scale.set(0.95, 1, 1.05);
  faceMask.position.set(0, 0.098, 0.014);
  headGroup.add(faceMask);

  // High-Cut Kevlar FAST Ballistic Helmet shell
  const helmetDome = registerHit(
    new THREE.Mesh(new THREE.SphereGeometry(0.146, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), matHelmet),
    'head'
  );
  helmetDome.scale.set(0.98, 1.0, 1.06);
  helmetDome.position.set(0, 0.178, -0.008);
  helmetDome.rotation.x = -0.1;
  headGroup.add(helmetDome);

  const helmetRim = new THREE.Mesh(new THREE.CylinderGeometry(0.144, 0.15, 0.048, 16, 1, true), matHelmet);
  helmetRim.scale.set(0.98, 1, 1.06);
  helmetRim.position.set(0, 0.172, -0.01);
  headGroup.add(helmetRim);

  // Front NVG mount shroud + side ARC accessory rails + Peltor tactical comms headset cups!
  const nvgShroud = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.058, 0.022), matHardware);
  nvgShroud.position.set(0, 0.225, 0.142);
  nvgShroud.rotation.x = -0.24;
  headGroup.add(nvgShroud);

  for (const sx of [-1, 1]) {
    // Helmet ARC accessory rail
    const arcRail = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.125), matHardware);
    arcRail.position.set(sx * 0.142, 0.182, -0.01);
    headGroup.add(arcRail);

    // Tactical Peltor ear-protection comms cup
    const earCup = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.036, 4, 8), matDarkGear);
    earCup.scale.set(0.75, 1.0, 1.12);
    earCup.position.set(sx * 0.126, 0.135, -0.01);
    headGroup.add(earCup);
  }

  // Boom comms mic wrapping forward from left earcup
  const boomMic = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.095, 6), matHardware);
  boomMic.rotation.x = Math.PI / 2 - 0.15;
  boomMic.rotation.z = 0.45;
  boomMic.position.set(0.088, 0.105, 0.055);
  headGroup.add(boomMic);

  // Rear helmet counterweight pouch + IFF strobe/marker (instant Ally vs Enemy read from behind too!)
  const counterweight = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.052, 0.036), matDarkGear);
  counterweight.position.set(0, 0.185, -0.152);
  headGroup.add(counterweight);

  const helmetIff = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.022, 0.012), matIffPatch);
  helmetIff.position.set(0, 0.215, -0.165);
  headGroup.add(helmetIff);

  if (isAlly) {
    // Smoked wrap-around ballistic spec-ops goggles over eyes
    const gogglesFrame = new THREE.Mesh(new THREE.BoxGeometry(0.195, 0.064, 0.065), matHardware);
    gogglesFrame.position.set(0, 0.168, 0.098);
    headGroup.add(gogglesFrame);

    const visorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.178, 0.048, 0.03), matGoggleLens);
    visorGlass.position.set(0, 0.168, 0.124);
    headGroup.add(visorGlass);
  } else {
    // Rugged tactical dust goggles mounted above brow + subtle crimson helmet band
    const goggleBand = new THREE.Mesh(new THREE.CylinderGeometry(0.146, 0.146, 0.026, 16), matHardware);
    goggleBand.scale.set(0.98, 1, 1.06);
    goggleBand.position.set(0, 0.205, -0.008);
    headGroup.add(goggleBand);

    for (const gx of [-0.044, 0.044]) {
      const gRim = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.05, 0.048), matHardware);
      gRim.position.set(gx, 0.208, 0.124);
      headGroup.add(gRim);
      const gLens = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.036, 0.022), matGoggleLens);
      gLens.position.set(gx, 0.208, 0.145);
      headGroup.add(gLens);
    }
  }

  const blindHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.92 })
  );
  blindHalo.rotation.x = Math.PI / 2;
  blindHalo.position.set(0, 0.36, 0);
  blindHalo.visible = false;
  headGroup.add(blindHalo);

  // ===== SEAMLESS ARTICULATED ARMS & TACTICAL CARBINE RIFLE (matching POV visual style!) =====
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(-0.14, 0.35, 0.08);
  torso.add(weaponPivot);

  const forearmMat = isAlly ? matShirt : matSkin;
  const UP_AXIS = new THREE.Vector3(0, 1, 0);

  const addArmSegment = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    mat: THREE.Material,
    register = true
  ) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    const cylLen = Math.max(0.02, dist - radius * 1.35);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, cylLen, 5, 10), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP_AXIS, dir.normalize());
    if (register) registerHit(mesh, 'body');
    weaponPivot.add(mesh);
  };

  // Shoulder sockets expressed in weaponPivot local space (torso deltoids at (±0.232, 0.41, 0))
  const rShoulder = new THREE.Vector3(-0.092, 0.055, -0.075);
  const rElbow = new THREE.Vector3(-0.14, -0.06, 0.14);
  const rWrist = new THREE.Vector3(0.01, -0.055, 0.27);

  const lShoulder = new THREE.Vector3(0.372, 0.055, -0.075);
  const lElbow = new THREE.Vector3(0.28, -0.075, 0.2);
  const lWrist = new THREE.Vector3(0.032, -0.03, 0.51);

  addArmSegment(rShoulder, rElbow, 0.052, matShirt);
  addArmSegment(rElbow, rWrist, 0.044, forearmMat);
  const rElbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), isAlly ? matDarkGear : matSkin);
  rElbowCap.position.copy(rElbow);
  weaponPivot.add(rElbowCap);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), matGlove);
  rHand.position.copy(rWrist);
  weaponPivot.add(rHand);

  addArmSegment(lShoulder, lElbow, 0.052, matShirt);
  addArmSegment(lElbow, lWrist, 0.043, forearmMat);
  const lElbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), isAlly ? matDarkGear : matSkin);
  lElbowCap.position.copy(lElbow);
  weaponPivot.add(lElbowCap);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), matGlove);
  lHand.position.copy(lWrist);
  weaponPivot.add(lHand);

  // Modern Tactical Carbine Rifle (matte gunmetal + desert-tan/slate furniture + top reflex optic!)
  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.098, 0.26), matGunSteel);
  gunStock.position.set(0.02, -0.018, 0.05);
  gunStock.castShadow = true;
  weaponPivot.add(gunStock);

  const gunCheek = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.2), matGunAccent);
  gunCheek.position.set(0.02, 0.022, 0.04);
  weaponPivot.add(gunCheek);

  const gunReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.092, 0.34), matGunAccent);
  gunReceiver.position.set(0.02, 0.0, 0.32);
  gunReceiver.castShadow = true;
  weaponPivot.add(gunReceiver);

  const gunTopRail = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.018, 0.54), matGunSteel);
  gunTopRail.position.set(0.02, 0.052, 0.44);
  weaponPivot.add(gunTopRail);

  // Compact top reflex sight on bot carbine
  const botOpticBase = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.032, 0.088), matGunAccent);
  botOpticBase.position.set(0.02, 0.072, 0.34);
  weaponPivot.add(botOpticBase);
  const botOpticHood = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.036, 0.042), matGunSteel);
  botOpticHood.position.set(0.02, 0.1, 0.35);
  weaponPivot.add(botOpticHood);

  const gunHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.072, 0.26), matGunSteel);
  gunHandguard.position.set(0.02, 0.004, 0.58);
  gunHandguard.castShadow = true;
  weaponPivot.add(gunHandguard);

  const gunHandguardCap = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.032, 0.22), matGunAccent);
  gunHandguardCap.position.set(0.02, 0.028, 0.57);
  weaponPivot.add(gunHandguardCap);

  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.054), matGunSteel);
  gunGrip.position.set(0.02, -0.08, 0.26);
  gunGrip.rotation.x = -0.25;
  weaponPivot.add(gunGrip);

  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.21, 0.068), matGunSteel);
  gunMag.position.set(0.02, -0.115, 0.42);
  gunMag.rotation.x = 0.26;
  gunMag.castShadow = true;
  weaponPivot.add(gunMag);

  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.26, 8), matGunSteel);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0.02, 0.016, 0.8);
  weaponPivot.add(gunBarrel);

  const gunComp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.06, 8), matHardware);
  gunComp.rotation.x = Math.PI / 2;
  gunComp.position.set(0.02, 0.016, 0.94);
  weaponPivot.add(gunComp);

  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.018), matHardware);
  frontPost.position.set(0.02, 0.052, 0.72);
  weaponPivot.add(frontPost);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0.02, 0.016, 0.98);
  weaponPivot.add(muzzlePoint);

  const muzzleFlash = new THREE.Group();
  muzzleFlash.position.copy(muzzlePoint.position);
  const mfOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff7824,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mfCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffe8b0,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mfJet = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 5), mfOuterMat);
  mfJet.rotation.x = Math.PI / 2;
  mfJet.position.z = 0.12;
  muzzleFlash.add(mfJet);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 4), mfOuterMat);
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    fin.rotation.z = a;
    fin.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.02);
    muzzleFlash.add(fin);
  }
  muzzleFlash.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), mfCoreMat));
  muzzleFlash.visible = false;
  weaponPivot.add(muzzleFlash);

  return {
    isSkinned: false,
    root,
    modelPivot: root,
    hips,
    torso,
    headGroup,
    leftLeg: leftLegBuilt.hipPivot,
    rightLeg: rightLegBuilt.hipPivot,
    leftKnee: leftLegBuilt.kneePivot,
    rightKnee: rightLegBuilt.kneePivot,
    leftFoot: leftLegBuilt.footPivot,
    rightFoot: rightLegBuilt.footPivot,
    weaponPivot,
    muzzlePoint,
    muzzleFlash,
    blindHalo,
    hitMeshes,
    flashMaterials,
  };
}
