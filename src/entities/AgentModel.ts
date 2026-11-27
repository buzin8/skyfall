import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createDracoGltfLoader } from '../utils/GlbLoader';
import { CharacterId, Team, WeaponId } from '../types';
import { PBRTextureSet, TextureLibrary } from '../textures/ProceduralTextures';
import {
  buildBrushedGunmetalTexture,
  buildLightBlueLensTexture,
  buildRefinedFaceTexture,
  buildSmoothAkWoodTexture,
  buildTacticalMaskTextures,
  smoothGeometryNormals,
} from '../utils/MeshSmoothing';

export type AgentVisualStyle = 'ember' | 'duelist' | 'striker' | 'sentinel';

export interface SkinnedRigBones {
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  spine1?: THREE.Object3D;
  spine2?: THREE.Object3D;
  head?: THREE.Object3D;
  rightClavicle?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  rightForeArm?: THREE.Object3D;
  rightHand?: THREE.Object3D;
  leftClavicle?: THREE.Object3D;
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
  isMeterRig?: boolean;
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
  akmGroup?: THREE.Group;
  scarGroup?: THREE.Group;
  augGroup?: THREE.Group;
  pistolGroup?: THREE.Group;
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
  armReachR?: number;
  armReachL?: number;
  handBindOffsetR?: THREE.Quaternion;
  handBindOffsetL?: THREE.Quaternion;
  clavBindQL?: THREE.Quaternion;
  clavBindQR?: THREE.Quaternion;
  armBindQR?: THREE.Quaternion;
  foreArmBindQR?: THREE.Quaternion;
  armBindQL?: THREE.Quaternion;
  foreArmBindQL?: THREE.Quaternion;
  defaultWeaponSlot?: number;
  characterId?: CharacterId;
}

interface SoldierTemplate {
  id: string;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  isMeterRig: boolean;
}

export const CHARACTER_OPTIONS: Array<{ id: CharacterId; label: string }> = [
  { id: 'shadow', label: 'SHADOW' },
  { id: 'spiderman', label: 'SPIDER-MAN' },
  { id: 'deadpool', label: 'DEADPOOL' },
  { id: 'gambit', label: 'GAMBIT' },
  { id: 'rogue', label: 'ROGUE' },
  { id: 'luffy', label: 'LUFFY' },
  { id: 'naruto', label: 'NARUTO' },
  { id: 'bailarina', label: 'BAILARINA' },
];

const CHARACTER_ROSTER: Array<{ id: CharacterId; url: string }> = [
  { id: 'shadow', url: '/models/soldier.glb' },
  { id: 'spiderman', url: '/models/characters/spiderman.glb' },
  { id: 'deadpool', url: '/models/characters/deadpool.glb' },
  { id: 'gambit', url: '/models/characters/gambit.glb' },
  { id: 'rogue', url: '/models/characters/rogue.glb' },
  { id: 'luffy', url: '/models/characters/luffy.glb' },
  { id: 'naruto', url: '/models/characters/naruto.glb' },
  { id: 'bailarina', url: '/models/characters/bailarina.glb' },
];

const WEAPON_GLB_URLS: Record<WeaponId, string> = {
  vandal: '/models/guns/akm.glb',
  scarl: '/models/guns/scarh.glb',
  aug: '/models/guns/aug.glb',
  pistol9mm: '/models/guns/pistol9mm.glb',
};

const cachedCharacterTemplates = new Map<string, SoldierTemplate>();
const inflightCharacters = new Map<string, Promise<void>>();
const cachedBotWeapons = new Map<WeaponId, THREE.Group>();
let cachedSoldierTemplate: SoldierTemplate | null = null;
let soldierLoadPromise: Promise<void> | null = null;
const sharedAgentLoader = createDracoGltfLoader();

function loadOneCharacter(entry: { id: string; url: string }): Promise<void> {
  if (cachedCharacterTemplates.has(entry.id)) return Promise.resolve();
  const pending = inflightCharacters.get(entry.id);
  if (pending) return pending;

  const p = new Promise<void>((resolve) => {
    sharedAgentLoader.load(
      entry.url,
      (gltf) => {
        let isMeterRig = false;
        gltf.scene.traverse((obj) => {
          if (/valvebiped|pelvis|upperarm_l|thigh_l/i.test(obj.name || '')) {
            isMeterRig = true;
          }
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry && !isMeterRig) {
            const lower = (mesh.name || '').toLowerCase();
            smoothGeometryNormals(mesh.geometry, lower.includes('visor') ? 72 : 62);
          }
        });
        const tpl: SoldierTemplate = {
          id: entry.id,
          scene: gltf.scene,
          animations: gltf.animations || [],
          isMeterRig,
        };
        cachedCharacterTemplates.set(entry.id, tpl);
        if (entry.id === 'shadow' || !cachedSoldierTemplate) {
          cachedSoldierTemplate = tpl;
        }
        inflightCharacters.delete(entry.id);
        resolve();
      },
      undefined,
      (err) => {
        console.warn(`[AgentModel] Could not load ${entry.url}:`, err);
        inflightCharacters.delete(entry.id);
        resolve();
      }
    );
  });
  inflightCharacters.set(entry.id, p);
  return p;
}

function loadOneBotWeapon(wid: WeaponId, url: string): Promise<void> {
  if (cachedBotWeapons.has(wid)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    sharedAgentLoader.load(
      url,
      (gltf) => {
        gltf.scene.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        cachedBotWeapons.set(wid, gltf.scene);
        resolve();
      },
      undefined,
      (err) => {
        console.warn(`[AgentModel] Could not load 3rd-person weapon ${url}:`, err);
        resolve();
      }
    );
  });
}

/** On-demand priority loader when the player selects a character before background streaming reaches it. */
export function ensureCharacterLoaded(characterId: CharacterId): Promise<void> {
  const entry = CHARACTER_ROSTER.find((c) => c.id === characterId);
  return entry ? loadOneCharacter(entry) : Promise.resolve();
}

/**
 * Instant low-end-friendly startup: awaits ONLY the default CoD MW operator + AKM (~1.3 MB, < 0.4s!)
 * so even low-end laptops open the game immediately, then streams the other 7 characters & 3 guns
 * gently in the background (2 at a time) without spiking CPU/RAM!
 */
export function preloadSoldierTemplate(): Promise<void> {
  if (cachedSoldierTemplate) return Promise.resolve();
  if (soldierLoadPromise) return soldierLoadPromise;

  const essentialChar = CHARACTER_ROSTER[0]; // shadow (soldier.glb)
  const restTasks: Array<() => Promise<void>> = [
    ...CHARACTER_ROSTER.slice(1).map((c) => () => loadOneCharacter(c)),
  ];

  // Gentle 2-worker background streamer after initial boot
  const streamRemainingInBackground = () => {
    let idx = 0;
    const worker = async () => {
      while (idx < restTasks.length) {
        const task = restTasks[idx++];
        await task();
      }
    };
    void worker();
    void worker();
  };

  // Preload default Shadow operator + ALL 4 3rd-person weapons (~2.0 MB total) so NO bot or remote player ever holds an empty/box gun!
  soldierLoadPromise = Promise.all([
    loadOneCharacter(essentialChar),
    loadOneBotWeapon('vandal', WEAPON_GLB_URLS.vandal),
    loadOneBotWeapon('scarl', WEAPON_GLB_URLS.scarl),
    loadOneBotWeapon('aug', WEAPON_GLB_URLS.aug),
    loadOneBotWeapon('pistol9mm', WEAPON_GLB_URLS.pistol9mm),
  ]).then(() => {
    // Wait a beat so initial WebGL scene renders first before streaming remaining characters
    window.setTimeout(streamRemainingInBackground, 450);
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

// Per-weapon 3rd-person WRIST IK targets & muzzle specs (in weaponPivot local space, where pistol grip center is [0, -0.055, 0]!)
// Paired with coordinate-frame-agnostic hand-basis orientation so right palm hugs the pistol grip flush
// and left palm cradles directly underneath rifle handguards (or cups over the right hand on 9MM Pistol)!
const THIRD_PERSON_WEAPON_SPECS: Array<{
  rightGrip: [number, number, number];
  leftGrip: [number, number, number];
  muzzle: [number, number, number];
}> = [
  // Slot 0: AKM 7.62 (right palm outside grip/trigger; left palm wrapping ACROSS & UP around underside of wood handguard!)
  { rightGrip: [-0.036, -0.052, -0.055], leftGrip: [0.058, -0.018, 0.265], muzzle: [0.0, 0.052, 0.61] },
  // Slot 1: SCAR-H (right palm on grip/trigger; left palm wrapping tightly underneath tan quad-rail, forward of mag!)
  { rightGrip: [-0.036, -0.048, -0.055], leftGrip: [0.060, -0.004, 0.265], muzzle: [0.0, 0.047, 0.64] },
  // Slot 2: AUG A4 (right palm on bullpup grip/trigger; left palm wrapping cleanly around front handguard!)
  { rightGrip: [-0.036, -0.050, -0.055], leftGrip: [0.060, -0.032, 0.215], muzzle: [0.0, 0.043, 0.46] },
  // Slot 3: 9MM Pistol (right hand high under beavertail on outside-right grip; left support hand outside-left wrapping over right fingers!)
  { rightGrip: [-0.030, -0.042, -0.054], leftGrip: [0.036, -0.058, -0.036], muzzle: [0.0, 0.032, 0.23] },
];

const _shR = new THREE.Vector3();
const _shL = new THREE.Vector3();
const _invPivotMat = new THREE.Matrix4();
const _ikRTarget = new THREE.Vector3();
const _ikLTarget = new THREE.Vector3();
const _ikRPole = new THREE.Vector3();
const _ikLPole = new THREE.Vector3();
const _handBasisMat = new THREE.Matrix4();
const _handF = new THREE.Vector3();
const _handP = new THREE.Vector3();
const _handZ = new THREE.Vector3();
const _qWeapW = new THREE.Quaternion();
const _qHandTarget = new THREE.Quaternion();
const _qHandParentInv = new THREE.Quaternion();
const _qClavSpin = new THREE.Quaternion();
const _vUpWorld = new THREE.Vector3();

// Canonical weapon-local hand orientations matching real-life shooting grips:
// - Right hand: palm flush on right side of pistol grip (+X), fingers curled around front of grip/trigger, thumb along top tang!
// - Left hand (rifles): palm cupping bottom-left of handguard (-X/+Y), fingers wrapping ACROSS & UP around right side of rail (NOT flat tray!)
// - Left hand (9MM): palm flush against left grip panel (-X), fingers wrapping over right fingers, thumb straight forward under slide!
const _rHandGripF = new THREE.Vector3(0.14, -0.26, 0.95).normalize();
const _rHandGripP = new THREE.Vector3(0.96, -0.16, -0.18).normalize();
const _lHandRifleF = new THREE.Vector3(-0.78, 0.12, 0.62).normalize();
const _lHandRifleP = new THREE.Vector3(-0.42, 0.90, -0.10).normalize();
const _lHandPistolF = new THREE.Vector3(-0.24, -0.32, 0.92).normalize();
const _lHandPistolP = new THREE.Vector3(-0.96, 0.14, -0.22).normalize();

/**
 * Measures a bone's exact canonical bind-pose hand basis [F = finger dir, P = palm inward normal, Z = F x P]
 * once in bind pose (facing +Z) so ANY skeleton (ValveBiped, UE5, custom T-pose/A-pose) can be aligned cleanly to gun grips!
 */
function computeHandBindOffset(
  foreArm: THREE.Object3D | undefined,
  hand: THREE.Object3D | undefined,
  side: 'L' | 'R'
): THREE.Quaternion | undefined {
  if (!foreArm || !hand) return undefined;
  const pFore = new THREE.Vector3();
  const pHand = new THREE.Vector3();
  foreArm.getWorldPosition(pFore);
  hand.getWorldPosition(pHand);
  const f = pHand.sub(pFore);
  if (f.lengthSq() < 1e-6) return undefined;
  f.normalize();

  // In bind pose facing +Z, the thumb edge of BOTH hands points along +Z (projected perpendicular to finger axis F)
  const fwd = new THREE.Vector3(0, 0, 1);
  const t = fwd.addScaledVector(f, -fwd.dot(f));
  if (t.lengthSq() < 1e-6) t.set(0, 0, 1);
  else t.normalize();

  // Left hand palm normal = F x T (down/inward); Right hand palm normal = T x F (down/inward)
  const p = side === 'L' ? new THREE.Vector3().crossVectors(f, t) : new THREE.Vector3().crossVectors(t, f);
  p.normalize();
  const z = new THREE.Vector3().crossVectors(f, p).normalize();

  const mBind = new THREE.Matrix4().makeBasis(f, p, z);
  const qBindBasis = new THREE.Quaternion().setFromRotationMatrix(mBind);
  const qHandWorld = new THREE.Quaternion();
  hand.getWorldQuaternion(qHandWorld);
  return qBindBasis.invert().multiply(qHandWorld);
}

function orientHandToWeaponBasis(
  handBone: THREE.Object3D,
  bindOffset: THREE.Quaternion,
  weaponWorldQ: THREE.Quaternion,
  desiredF: THREE.Vector3,
  desiredP: THREE.Vector3
): void {
  if (!handBone.parent) return;
  _handF.copy(desiredF).normalize();
  _handP.copy(desiredP).addScaledVector(_handF, -desiredP.dot(_handF)).normalize();
  _handZ.crossVectors(_handF, _handP).normalize();
  _handBasisMat.makeBasis(_handF, _handP, _handZ);
  _qHandTarget.setFromRotationMatrix(_handBasisMat);
  _qHandTarget.premultiply(weaponWorldQ).multiply(bindOffset);
  handBone.parent.getWorldQuaternion(_qHandParentInv).invert();
  handBone.quaternion.copy(_qHandParentInv).multiply(_qHandTarget);
  handBone.updateMatrixWorld(true);
}

/**
 * Dynamically anchors the 3rd-person weapon cleanly into EVERY character's live right shoulder pocket (rifles)
 * or extended forward two-handed tactical Weaver stance (9MM Pistol), solves analytical 2-bone arm IK,
 * and orients BOTH wrists/palms directly onto the pistol grip & handguard — ZERO floating guns or splayed hands!
 */
export function positionRigWeaponAndSolveIK(
  rig: AgentRig,
  opts: {
    weaponSlot?: number;
    strideBobX?: number;
    strideBobY?: number;
    runCant?: number;
    aimPitch?: number;
    recoilKick?: number;
    crouchAmount?: number;
    wallTuck?: number;
  } = {}
): void {
  const b = rig.skBones;
  if (!b || !rig.rightGripTarget || !rig.leftGripTarget) return;

  const slot = Math.max(0, Math.min(3, opts.weaponSlot ?? rig.defaultWeaponSlot ?? 0));
  const isPistol = slot === 3;
  const spec = THIRD_PERSON_WEAPON_SPECS[slot] ?? THIRD_PERSON_WEAPON_SPECS[0];

  if (rig.akmGroup) rig.akmGroup.visible = slot === 0;
  if (rig.scarGroup) rig.scarGroup.visible = slot === 1;
  if (rig.augGroup) rig.augGroup.visible = slot === 2;
  if (rig.pistolGroup) rig.pistolGroup.visible = slot === 3;

  rig.rightGripTarget.position.set(spec.rightGrip[0], spec.rightGrip[1], spec.rightGrip[2]);
  rig.leftGripTarget.position.set(spec.leftGrip[0], spec.leftGrip[1], spec.leftGrip[2]);
  rig.muzzlePoint.position.set(spec.muzzle[0], spec.muzzle[1], spec.muzzle[2]);
  rig.muzzleFlash.position.copy(rig.muzzlePoint.position);

  const bobX = opts.strideBobX ?? 0;
  const bobY = opts.strideBobY ?? 0;
  const runCant = opts.runCant ?? 0;
  const aimPitch = opts.aimPitch ?? 0;
  const recoil = opts.recoilKick ?? 0;
  const crouch = opts.crouchAmount ?? 0;
  const wt = opts.wallTuck ?? 0;
  const stockYComp = -0.18 * Math.sin(aimPitch);

  let hasLiveShoulders = false;
  let shY = 1.38;
  let shMidZ = 0;

  if (!rig.isMeterRig) {
    if (b.spine2) b.spine2.rotation.y -= 0.16;
    if (b.head) {
      b.head.rotation.y += 0.14;
      b.head.rotation.x += aimPitch * 0.38;
    }
    rig.weaponPivot.position.set(
      (isPistol ? -0.04 : -0.165) + bobX + wt * 0.05,
      1.335 + bobY + stockYComp - crouch * 0.055 + wt * 0.06,
      (isPistol ? 0.40 : 0.275) - recoil * 0.042 - wt * 0.24
    );
  } else if (b.rightArm && b.leftArm) {
    // Reset upper/lower arm bones to clean bind pose BEFORE IK so twist NEVER accumulates across frames
    // (guarantees silky minimum-twist shoulder & bicep geometry on Bailarina, Deadpool, Luffy, Naruto & all heroes!)
    if (rig.armBindQR) b.rightArm.quaternion.copy(rig.armBindQR);
    if (rig.foreArmBindQR && b.rightForeArm) b.rightForeArm.quaternion.copy(rig.foreArmBindQR);
    if (rig.armBindQL) b.leftArm.quaternion.copy(rig.armBindQL);
    if (rig.foreArmBindQL && b.leftForeArm) b.leftForeArm.quaternion.copy(rig.foreArmBindQL);

    // Naturally protract clavicles slightly forward (like a real shooter reaching across chest!)
    // so Bailarina and all other characters have silky-smooth natural shoulders with ZERO pinching!
    if (b.leftClavicle && b.leftClavicle.parent && rig.clavBindQL) {
      b.leftClavicle.quaternion.copy(rig.clavBindQL);
      rig.root.updateMatrixWorld(true);
      _vUpWorld.set(0, 1, 0).applyQuaternion(rig.modelPivot.getWorldQuaternion(_qWeapW)).normalize();
      b.leftClavicle.parent.getWorldQuaternion(_qHandParentInv).invert();
      _vUpWorld.applyQuaternion(_qHandParentInv).normalize();
      _qClavSpin.setFromAxisAngle(_vUpWorld, isPistol ? -0.10 : -0.14);
      b.leftClavicle.quaternion.premultiply(_qClavSpin);
    }
    if (b.rightClavicle && b.rightClavicle.parent && rig.clavBindQR) {
      b.rightClavicle.quaternion.copy(rig.clavBindQR);
      rig.root.updateMatrixWorld(true);
      _vUpWorld.set(0, 1, 0).applyQuaternion(rig.modelPivot.getWorldQuaternion(_qWeapW)).normalize();
      b.rightClavicle.parent.getWorldQuaternion(_qHandParentInv).invert();
      _vUpWorld.applyQuaternion(_qHandParentInv).normalize();
      _qClavSpin.setFromAxisAngle(_vUpWorld, isPistol ? 0.08 : 0.04);
      b.rightClavicle.quaternion.premultiply(_qClavSpin);
    }

    // Measure LIVE animated shoulder positions in modelPivot local space so ALL 8 characters hold ALL 4 guns identically!
    rig.root.updateMatrixWorld(true);
    _invPivotMat.copy(rig.modelPivot.matrixWorld).invert();
    b.rightArm.getWorldPosition(_shR).applyMatrix4(_invPivotMat);
    b.leftArm.getWorldPosition(_shL).applyMatrix4(_invPivotMat);
    hasLiveShoulders = true;

    const minReach = Math.min(rig.armReachR ?? 0.48, rig.armReachL ?? 0.48);
    shY = (_shR.y + _shL.y) * 0.5;
    shMidZ = (_shR.z + _shL.z) * 0.5;

    if (isPistol) {
      // Extended two-handed tactical Weaver/Isosceles pistol stance (85% arm extension — crisp & authoritative!)
      rig.weaponPivot.position.set(
        _shR.x * 0.12 + bobX + wt * 0.03,
        shY - 0.032 + bobY + stockYComp + wt * 0.04,
        shMidZ + Math.min(0.45, minReach * 0.85) - recoil * 0.03 - wt * 0.18
      );
    } else {
      // Authentic right-shoulder rifle pocket (AKM / SCAR-H / AUG A4): buttstock seated squarely against right shoulder!
      rig.weaponPivot.position.set(
        _shR.x * 0.72 + bobX + wt * 0.05,
        shY - 0.042 + bobY + stockYComp + wt * 0.05,
        _shR.z + Math.min(0.27, minReach * 0.54) - recoil * 0.042 - wt * 0.22
      );
    }
  } else {
    rig.weaponPivot.position.set(
      -0.13 + bobX + wt * 0.05,
      1.32 + bobY + stockYComp - crouch * 0.055 + wt * 0.06,
      0.26 - recoil * 0.042 - wt * 0.24
    );
  }

  rig.weaponPivot.rotation.set(
    runCant + aimPitch * (1 - wt * 0.7) - recoil * 0.1 - wt * (isPistol ? 0.65 : 0.94),
    wt * 0.22,
    0
  );

  rig.root.updateMatrixWorld(true);
  rig.weaponPivot.getWorldQuaternion(_qWeapW);

  if (b.rightArm && b.rightForeArm && b.rightHand) {
    rig.rightGripTarget.getWorldPosition(_ikRTarget);
    if (hasLiveShoulders) {
      _ikRPole.set(
        _shR.x - (isPistol ? 0.08 : 0.14),
        shY - 0.68,
        isPistol ? shMidZ + 0.16 : _shR.z + 0.02
      );
    } else {
      _ikRPole.set(isPistol ? -0.34 : -0.40, 0.95, isPistol ? 0.10 : -0.10);
    }
    _ikRPole.applyMatrix4(rig.modelPivot.matrixWorld);
    solveTwoBoneArmIK(b.rightArm, b.rightForeArm, b.rightHand, _ikRTarget, _ikRPole, 1.0);
    if (!rig.isMeterRig) {
      b.rightHand.quaternion.set(0, 0, 0, 1);
    } else if (rig.handBindOffsetR) {
      orientHandToWeaponBasis(b.rightHand, rig.handBindOffsetR, _qWeapW, _rHandGripF, _rHandGripP);
    }
  }

  if (b.leftArm && b.leftForeArm && b.leftHand) {
    rig.leftGripTarget.getWorldPosition(_ikLTarget);
    if (hasLiveShoulders) {
      _ikLPole.set(
        _shL.x + (isPistol ? 0.05 : 0.02),
        shY - 0.72,
        isPistol ? shMidZ + 0.16 : _shL.z + 0.20
      );
    } else {
      _ikLPole.set(isPistol ? 0.34 : 0.22, 0.92, isPistol ? 0.10 : 0.22);
    }
    _ikLPole.applyMatrix4(rig.modelPivot.matrixWorld);
    solveTwoBoneArmIK(b.leftArm, b.leftForeArm, b.leftHand, _ikLTarget, _ikLPole, 1.0);
    if (!rig.isMeterRig) {
      b.leftHand.quaternion.set(0, 0, 0, 1);
    } else if (rig.handBindOffsetL) {
      orientHandToWeaponBasis(
        b.leftHand,
        rig.handBindOffsetL,
        _qWeapW,
        isPistol ? _lHandPistolF : _lHandRifleF,
        isPistol ? _lHandPistolP : _lHandRifleP
      );
    }
  }
}

/**
 * Coordinate-frame-agnostic bind-pose finger curl so every rigged character with finger bones
 * (Shadow Company, Spider-Man, Gambit, Rogue) wraps their fingers naturally around the pistol grip & handguard!
 */
function bakeThirdPersonFingerGrip(handBone: THREE.Object3D | undefined, side: 'L' | 'R'): void {
  if (!handBone) return;
  handBone.updateMatrixWorld(true);
  const sideSign = side === 'R' ? -1 : 1;
  // In T-pose/A-pose bind pose, palm faces inward toward body center (X=0) & slightly forward/down
  const palmInwardW = new THREE.Vector3(-sideSign * 0.85, -0.45, 0.25).normalize();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const fDir = new THREE.Vector3();
  const curlAxisW = new THREE.Vector3();
  const qParentW = new THREE.Quaternion();
  const qCurl = new THREE.Quaternion();

  const candidates: Array<{ bone: THREE.Object3D; child: THREE.Object3D; angle: number }> = [];
  handBone.traverse((obj) => {
    if (obj === handBone || !obj.name) return;
    const nm = obj.name.toLowerCase();
    // Skip metacarpals/wrist deform helpers/attachments
    if (/metacarpal|wrist|attach|twist|weapon|ik/i.test(nm)) return;
    if (!/(finger|index|middle|ring|pinky|thumb)/i.test(nm)) return;
    const child = obj.children[0];
    if (!child) return;

    const isThumb = nm.includes('thumb') || nm.includes('finger0');
    const isRightIndex = side === 'R' && (nm.includes('index') || nm.includes('finger1'));
    const isDistal = /(02|03|11|12|21|22|31|32|41|42)$/i.test(nm);
    let angle = isDistal ? 0.72 : 0.56;
    if (isThumb) angle = 0.34;
    else if (isRightIndex) angle = isDistal ? 0.42 : 0.28; // Crisp trigger-finger curl!

    candidates.push({ bone: obj, child, angle });
  });

  for (const c of candidates) {
    if (!c.bone.parent) continue;
    c.bone.getWorldPosition(vA);
    c.child.getWorldPosition(vB);
    fDir.subVectors(vB, vA);
    if (fDir.lengthSq() < 1e-8) continue;
    fDir.normalize();
    curlAxisW.crossVectors(fDir, palmInwardW);
    if (curlAxisW.lengthSq() < 1e-6) continue;
    curlAxisW.normalize();

    c.bone.parent.getWorldQuaternion(qParentW);
    const localAxis = curlAxisW.clone().applyQuaternion(qParentW.clone().invert()).normalize();
    qCurl.setFromAxisAngle(localAxis, c.angle);
    c.bone.quaternion.premultiply(qCurl);
    c.bone.updateMatrixWorld(true);
  }
}

// Cached 512x512 procedural military army-camo CanvasTextures for CoD MW Shadow Company (Blue Snow Camo vs Light Red Camo!)
const cachedCodArmyCamo = new Map<'ally' | 'enemy', THREE.CanvasTexture>();

export function getCodArmyCamoTexture(team: 'ally' | 'enemy'): THREE.CanvasTexture {
  const existing = cachedCodArmyCamo.get(team);
  if (existing) return existing;

  const sz = 512;
  const c = document.createElement('canvas');
  c.width = sz;
  c.height = sz;
  const ctx = c.getContext('2d')!;

  const isBlue = team === 'ally';
  // Base fabric tone: crisp arctic frost-blue snow (Blue Team) vs light tactical coral-red (Red Team)
  ctx.fillStyle = isBlue ? '#d4e8fb' : '#e66c74';
  ctx.fillRect(0, 0, sz, sz);

  // Deterministic tactical military woodland/arctic organic camo blotches (seamless tiled!)
  let seed = isBlue ? 48271 : 91823;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const layers = isBlue
    ? [
        { color: '#eef7ff', count: 24, rMin: 34, rMax: 78 }, // Bright snow patches
        { color: '#6cb2ea', count: 28, rMin: 28, rMax: 68 }, // Glacier ice-blue camo
        { color: '#2b66a6', count: 24, rMin: 22, rMax: 56 }, // Alpine steel-blue army print
        { color: '#173760', count: 16, rMin: 14, rMax: 34 }, // Deep tactical navy shadow blotches
      ]
    : [
        { color: '#f4a2a8', count: 22, rMin: 32, rMax: 74 }, // Light dusty-rose highlights
        { color: '#d84552', count: 28, rMin: 28, rMax: 66 }, // Tactical light crimson camo
        { color: '#9c2634', count: 24, rMin: 22, rMax: 54 }, // Army maroon print
        { color: '#561922', count: 16, rMin: 14, rMax: 34 }, // Dark charcoal-burgundy camo shadows
      ];

  const drawOrganicBlotch = (cx: number, cy: number, rx: number, ry: number, rot: number, pts: number) => {
    const offsets: number[] = [];
    for (let i = 0; i < pts; i++) offsets.push(0.68 + rand() * 0.52);
    // Draw wrapped across 3x3 tile edges so camo is 100% seamless!
    for (let ox = -sz; ox <= sz; ox += sz) {
      for (let oy = -sz; oy <= sz; oy += sz) {
        ctx.save();
        ctx.translate(cx + ox, cy + oy);
        ctx.rotate(rot);
        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const r = offsets[i % pts];
          const px = Math.cos(a) * rx * r;
          const py = Math.sin(a) * ry * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  };

  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    for (let i = 0; i < layer.count; i++) {
      const cx = rand() * sz;
      const cy = rand() * sz;
      const rx = layer.rMin + rand() * (layer.rMax - layer.rMin);
      const ry = rx * (0.48 + rand() * 0.55);
      drawOrganicBlotch(cx, cy, rx, ry, rand() * Math.PI, 8 + Math.floor(rand() * 5));
    }
  }

  // Fine military ripstop combat fabric grid texture
  ctx.strokeStyle = isBlue ? 'rgba(20, 45, 78, 0.08)' : 'rgba(55, 12, 18, 0.09)';
  ctx.lineWidth = 1;
  for (let i = 0; i < sz; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, sz);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(sz, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 2.4);
  tex.needsUpdate = true;
  cachedCodArmyCamo.set(team, tex);
  return tex;
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
let sharedScarTanMat: THREE.MeshStandardMaterial;
let sharedScarTanDarkMat: THREE.MeshStandardMaterial;

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
  sharedScarTanMat = new THREE.MeshStandardMaterial({
    color: 0xd8c39a,
    roughness: 0.44,
    metalness: 0.16,
  });
  sharedScarTanDarkMat = new THREE.MeshStandardMaterial({
    color: 0x9b8662,
    roughness: 0.52,
    metalness: 0.22,
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
function buildCompactBotAkm(agentId = ''): {
  weaponPivot: THREE.Group;
  akmGroup: THREE.Group;
  scarGroup: THREE.Group;
  augGroup: THREE.Group;
  pistolGroup: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Group;
  rightGripTarget: THREE.Object3D;
  leftGripTarget: THREE.Object3D;
  defaultWeaponSlot: number;
} {
  ensureBotAkmMaterials();
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(-0.11, 1.28, 0.22);
  weaponPivot.rotation.set(0, 0, 0);

  const attachGlbGun = (
    wid: WeaponId,
    xOff: number,
    yOff: number,
    zOff: number,
    scale: number
  ): THREE.Group => {
    const grp = new THREE.Group();
    const mount = (src: THREE.Group) => {
      grp.clear();
      const cl = src.clone(true);
      // Downloaded gun GLBs point barrel along -Z; rotate 180° around Y so barrel points +Z forward!
      cl.rotation.y = Math.PI;
      cl.scale.setScalar(scale);
      cl.position.set(xOff, yOff, zOff);
      grp.add(cl);
    };
    const cached = cachedBotWeapons.get(wid);
    if (cached) {
      mount(cached);
    } else {
      void loadOneBotWeapon(wid, WEAPON_GLB_URLS[wid]).then(() => {
        const loaded = cachedBotWeapons.get(wid);
        if (loaded) mount(loaded);
      });
    }
    return grp;
  };

  // Exact sub-mesh calibrated mounts so EVERY gun's real pistol grip sits squarely at [0, -0.055, 0]!
  const akmGroup = attachGlbGun('vandal', -0.007, 0.003, 0.155, 1.05);
  const scarGroup = attachGlbGun('scarl', 0.007, 0.043, 0.18, 1.04);
  const augGroup = attachGlbGun('aug', 0.02, 0.025, 0.068, 1.06);
  const pistolGroup = attachGlbGun('pistol9mm', 0.0, 0.008, 0.09, 1.32);

  let hash = 0;
  for (let i = 0; i < agentId.length; i++) hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  const defaultWeaponSlot = agentId ? Math.abs(hash) % 3 : 0;
  akmGroup.visible = defaultWeaponSlot === 0;
  scarGroup.visible = defaultWeaponSlot === 1;
  augGroup.visible = defaultWeaponSlot === 2;
  pistolGroup.visible = false;

  weaponPivot.add(akmGroup, scarGroup, augGroup, pistolGroup);

  const spec = THIRD_PERSON_WEAPON_SPECS[defaultWeaponSlot] ?? THIRD_PERSON_WEAPON_SPECS[0];
  const rightGripTarget = new THREE.Object3D();
  rightGripTarget.position.set(...spec.rightGrip);
  weaponPivot.add(rightGripTarget);

  const leftGripTarget = new THREE.Object3D();
  leftGripTarget.position.set(...spec.leftGrip);
  weaponPivot.add(leftGripTarget);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(...spec.muzzle);
  weaponPivot.add(muzzlePoint);

  const muzzleFlash = buildBotMuzzleFlash(muzzlePoint);
  weaponPivot.add(muzzleFlash);

  return {
    weaponPivot,
    akmGroup,
    scarGroup,
    augGroup,
    pistolGroup,
    muzzlePoint,
    muzzleFlash,
    rightGripTarget,
    leftGripTarget,
    defaultWeaponSlot,
  };
}

// Cached smooth vertex-contoured face, tactical mesh half-mask & wraparound light-blue ballistic glasses geometries!
let sharedRefinedFaceGeo: THREE.BufferGeometry | null = null;
let sharedTacticalMaskGeo: THREE.BufferGeometry | null = null;
let sharedBallisticLensGeo: THREE.BufferGeometry | null = null;
let sharedGlassesTopRimGeo: THREE.BufferGeometry | null = null;
let sharedGlassesBotRimGeo: THREE.BufferGeometry | null = null;
let sharedTacticalMaskMat: THREE.MeshStandardMaterial | null = null;
let sharedLightBlueLensMat: THREE.MeshStandardMaterial | null = null;
const cachedFaceTextures = new Map<string, THREE.CanvasTexture>();

function sampleOperatorFaceSurface(theta: number, yFaceGroup: number, outOffset = 0): THREE.Vector3 {
  const yF = yFaceGroup + 0.35;
  const ny = THREE.MathUtils.clamp(yF / 7.57, -0.94, 0.94);
  const horizR = Math.sqrt(Math.max(0.05, 1 - ny * ny));
  const x0 = Math.sin(theta) * 6.174 * horizR;
  const z0 = Math.cos(theta) * 5.733 * horizR;
  const nose = Math.exp(-Math.pow(x0 / 1.35, 2) - Math.pow((yF + 0.65) / 2.2, 2)) * 1.18;
  const brow = Math.exp(-Math.pow(x0 / 4.2, 2) - Math.pow((yF - 2.3) / 1.15, 2)) * 0.35;
  const chin = Math.exp(-Math.pow(x0 / 2.6, 2) - Math.pow((yF + 4.8) / 1.6, 2)) * 0.38;
  const zSurf = z0 + nose + brow + chin + 0.35;
  return new THREE.Vector3(
    x0 + Math.sin(theta) * outOffset,
    yFaceGroup,
    zSurf + Math.cos(theta) * outOffset
  );
}

/**
 * Contoured 3D SpecOps half-face perforated mesh mask wrapping tightly over nose bridge,
 * cheeks, mouth & jaw — with an inverted-V nose peak tucking seamlessly into the ballistic glasses!
 */
function getTacticalMaskGeometry(): THREE.BufferGeometry {
  if (sharedTacticalMaskGeo) return sharedTacticalMaskGeo;
  const cols = 28;
  const rows = 18;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 = bottom jaw/chin, 1 = top V-seam meeting glasses
    for (let c = 0; c <= cols; c++) {
      const u = (c / cols) * 2 - 1; // -1..+1 left cheek to right cheek
      const theta = u * 1.32;
      const nosePeak = Math.exp(-Math.pow(u / 0.24, 2)) * 1.58;
      const cheekRise = Math.pow(Math.abs(u), 2.2) * 0.85;
      const yTop = -1.16 + nosePeak + cheekRise;
      const yBot = -6.75 + Math.pow(Math.abs(u), 1.8) * 2.55;
      const y = THREE.MathUtils.lerp(yBot, yTop, v);

      // Molded rigid ballistic mesh contour standing slightly proud over nose & mouth breather zone
      const mouthMolding = Math.exp(-Math.pow(u / 0.48, 2) - Math.pow((v - 0.52) / 0.38, 2)) * 0.42;
      const sideTaper = 0.52 - Math.abs(u) * 0.14;
      const p = sampleOperatorFaceSurface(theta, y, sideTaper + mouthMolding);

      positions.push(p.x, p.y, p.z);
      uvs.push(c / cols, v);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  sharedTacticalMaskGeo = geo;
  return geo;
}

function sampleGlassesPoint(u: number, v: number): THREE.Vector3 {
  const theta = u * 1.15; // ±66° aggressive ballistic wraparound arc
  const yTop = 2.68 - Math.exp(-Math.pow(u / 0.28, 2)) * 0.26 - Math.pow(Math.abs(u), 2.4) * 0.42;
  const noseCutout = Math.exp(-Math.pow(u / 0.22, 2)) * 1.98;
  const outerSweep = Math.pow(Math.abs(u), 2.1) * 1.48;
  const yBot = -1.26 + noseCutout + outerSweep;
  const y = THREE.MathUtils.lerp(yBot, yTop, v);

  // Sleek forward-canting ballistic visor shield sitting cleanly over eye sockets & mask nose bridge
  const browCant = (v - 0.35) * 0.42;
  const rx = 6.46 + browCant * 0.25;
  const rz = 6.82 + browCant;
  return new THREE.Vector3(Math.sin(theta) * rx, y, Math.cos(theta) * rz + 0.62);
}

/**
 * Sleek wraparound ballistic visor-glasses lens + matching top & bottom matte-black frame rims!
 */
function ensureBallisticGlassesGeometries(): {
  lens: THREE.BufferGeometry;
  topRim: THREE.BufferGeometry;
  botRim: THREE.BufferGeometry;
} {
  if (!sharedBallisticLensGeo) {
    const cols = 32;
    const rows = 10;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      for (let c = 0; c <= cols; c++) {
        const u = (c / cols) * 2 - 1;
        const p = sampleGlassesPoint(u, v);
        positions.push(p.x, p.y, p.z);
        uvs.push(c / cols, v);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = (r + 1) * (cols + 1) + c;
        const e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    sharedBallisticLensGeo = geo;

    // Matte-black upper brow goggle frame rail + side temple sweeps
    const topPts: THREE.Vector3[] = [];
    const botPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = (i / 24) * 2 - 1;
      topPts.push(sampleGlassesPoint(u, 1.0));
      botPts.push(sampleGlassesPoint(u, 0.0));
    }
    sharedGlassesTopRimGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPts), 28, 0.34, 7, false);
    sharedGlassesBotRimGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(botPts), 28, 0.19, 6, false);
  }

  return {
    lens: sharedBallisticLensGeo!,
    topRim: sharedGlassesTopRimGeo!,
    botRim: sharedGlassesBotRimGeo!,
  };
}

function ensureTacticalHeadgearMaterials(): {
  maskMat: THREE.MeshStandardMaterial;
  lensMat: THREE.MeshStandardMaterial;
} {
  if (!sharedTacticalMaskMat) {
    const maskTex = buildTacticalMaskTextures();
    sharedTacticalMaskMat = new THREE.MeshStandardMaterial({
      map: maskTex.map,
      bumpMap: maskTex.bump,
      bumpScale: 0.24,
      roughness: 0.84,
      metalness: 0.1,
      envMapIntensity: 0.65,
      side: THREE.DoubleSide,
    });
  }
  if (!sharedLightBlueLensMat) {
    const lensTex = buildLightBlueLensTexture();
    sharedLightBlueLensMat = new THREE.MeshStandardMaterial({
      map: lensTex,
      color: 0xa2ecff,
      emissive: new THREE.Color(0x289ce6),
      emissiveIntensity: 0.32,
      roughness: 0.06,
      metalness: 0.28,
      envMapIntensity: 2.8,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
  }
  return { maskMat: sharedTacticalMaskMat, lensMat: sharedLightBlueLensMat };
}

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

  // SpecOps half-face perforated mesh mask + wraparound LIGHT-BLUE ballistic glasses (for BOTH teammates & enemies!)
  const { maskMat, lensMat } = ensureTacticalHeadgearMaterials();
  const { lens: lensGeo, topRim: topRimGeo, botRim: botRimGeo } = ensureBallisticGlassesGeometries();

  const maskMesh = new THREE.Mesh(getTacticalMaskGeometry(), maskMat);
  face.add(maskMesh);

  const matGearDark = new THREE.MeshStandardMaterial({
    color: 0x1b2028,
    roughness: 0.48,
    metalness: 0.4,
  });

  // Curved wraparound light-blue ballistic shield lens + matte-black frame rims & temple arms
  const lensMesh = new THREE.Mesh(lensGeo, lensMat);
  face.add(lensMesh);
  face.add(new THREE.Mesh(topRimGeo, matGearDark));
  face.add(new THREE.Mesh(botRimGeo, matGearDark));

  // Side temple arms & helmet strap mounts tucking neatly back into helmet sides
  for (const sx of [-1, 1]) {
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.35, 4.4), matGearDark);
    temple.position.set(sx * 5.95, 1.25, 1.85);
    temple.rotation.y = sx * -0.18;
    face.add(temple);
  }

  // Sleek tactical comms boom microphone curving from left ear-pad to the lower mesh mask!
  const boomCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.8, -2.0, 1.8),
    new THREE.Vector3(-5.1, -3.5, 4.6),
    new THREE.Vector3(-2.6, -4.1, 6.6),
  ]);
  const boomArm = new THREE.Mesh(new THREE.TubeGeometry(boomCurve, 12, 0.2, 6, false), matGearDark);
  face.add(boomArm);
  const micFoam = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 4, 8), matGearDark);
  micFoam.position.set(-2.35, -4.15, 6.72);
  micFoam.rotation.z = Math.PI / 2;
  face.add(micFoam);

  // Subtle low-profile dark helmet chinstrap framing the lower jaw beneath the mask
  const chinStrap = new THREE.Mesh(new THREE.TorusGeometry(5.65, 0.3, 6, 18, Math.PI * 0.72), matGearDark);
  chinStrap.rotation.x = Math.PI * 0.34;
  chinStrap.rotation.z = -Math.PI * 0.86;
  chinStrap.position.set(0, -4.75, 1.45);
  face.add(chinStrap);

  // Matte-black tactical NVG mount shroud centered right above the ballistic glasses + subtle team IFF pip
  const matIffGlow = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x62f7ff : 0xff4b34,
    emissive: new THREE.Color(isAlly ? 0x20e2ff : 0xff2816),
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.2,
  });
  const nvgShroud = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 1.45), matGearDark);
  nvgShroud.position.set(0, 4.35, 6.15);
  nvgShroud.rotation.x = -0.26;
  face.add(nvgShroud);

  const browTrim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.05, 1.9), matGearDark);
  browTrim.position.set(0, 5.75, 4.4);
  browTrim.rotation.x = -0.2;
  face.add(browTrim);
  const iffPip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.48, 0.55), matIffGlow);
  iffPip.position.set(0, 5.8, 5.38);
  iffPip.rotation.x = -0.2;
  face.add(iffPip);

  return face;
}

function pickCharacterTemplate(agentId: string, preferred?: CharacterId): SoldierTemplate {
  if (preferred && cachedCharacterTemplates.has(preferred)) {
    return cachedCharacterTemplates.get(preferred)!;
  }
  const available = Array.from(cachedCharacterTemplates.values());
  if (available.length === 0) return cachedSoldierTemplate!;
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) hash = (hash * 37 + agentId.charCodeAt(i)) | 0;
  return available[Math.abs(hash) % available.length];
}

function buildSkinnedSoldierRig(
  agentId: string,
  team: Team,
  style: AgentVisualStyle,
  characterId?: CharacterId
): AgentRig {
  const tpl = pickCharacterTemplate(agentId, characterId);
  const isMeterRig = tpl.isMeterRig;
  const root = new THREE.Group();
  const modelPivot = new THREE.Group();
  root.add(modelPivot);

  const cloned = SkeletonUtils.clone(tpl.scene) as THREE.Group;
  if (isMeterRig) {
    // Downloaded characters (Shadow Company, Gambit, Rogue, Luffy, Deadpool, Naruto, Bailarina)
    // are pre-normalized to exact human meter height (1.72–1.82m), grounded at y = 0, facing +Z!
    cloned.rotation.y = 0;
    cloned.scale.setScalar(1.0);
  } else {
    // Legacy Mixamo Soldier.glb faced -Z in cm space
    cloned.rotation.y = Math.PI;
    cloned.scale.setScalar(0.96);
  }
  modelPivot.add(cloned);

  const hitMeshes: THREE.Mesh[] = [];
  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const isAlly = team === 'ally';

  const bodyTint = isAlly
    ? 0x5ca8ff
    : style === 'sentinel'
    ? 0xe83244
    : style === 'striker'
    ? 0xff4e42
    : 0xff3b4c;
  const bodyEmissive = isAlly ? 0x10306b : 0x540b14;

  const isCodShadow = tpl.id === 'shadow';
  const codCamoTex = isCodShadow ? getCodArmyCamoTexture(isAlly ? 'ally' : 'enemy') : null;

  cloned.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const lowerName = (mesh.name || '').toLowerCase();
    if (!isMeterRig && lowerName.includes('visor')) {
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
        if (isMeterRig && isCodShadow) {
          // Authentic CoD Modern Warfare Team Styling:
          // - Blue Team: Blue Snow Army Camo outfit + vibrant arctic-cobalt helmet & glowing sky-cyan goggles
          // - Red Team: Light Red Army Camo outfit + vibrant crimson helmet & glowing ruby-amber goggles
          // - Vests, ammo pouches, mags, belts, kneepads, radios & combat boots use authentic CoD tactical tones
          //   while preserving ALL original CoD MW stitching/MOLLE/lace micro-relief via bumpMap!
          const mn = (clonedMat.name || '').toLowerCase();
          const origMap = clonedMat.map;
          if (origMap) {
            clonedMat.bumpMap = origMap;
            clonedMat.bumpScale = 0.016;
          }
          if (mn.includes('pcu_usmc') || mn.includes('gorka_pants')) {
            // Main combat jacket/hood & tactical trousers -> Blue Snow Army Print (Blue) / Light Red Army Print (Red)!
            clonedMat.map = codCamoTex;
            clonedMat.color.setHex(0xffffff);
            clonedMat.roughness = 0.78;
            clonedMat.metalness = 0.04;
            clonedMat.emissive.setHex(isAlly ? 0x16385e : 0x4e141c);
            clonedMat.emissiveIntensity = 0.2;
            clonedMat.envMapIntensity = 1.05;
          } else if (mn.includes('goggles_lens') || mn.includes('pvs31_lens')) {
            // Vibrant mirrored ballistic goggles & NVG lenses matching team palette!
            clonedMat.map = null;
            clonedMat.bumpMap = null;
            clonedMat.color.setHex(isAlly ? 0x5af2ff : 0xff623a);
            clonedMat.emissive.setHex(isAlly ? 0x1ac8ff : 0xff3218);
            clonedMat.emissiveIntensity = 0.95;
            clonedMat.roughness = 0.08;
            clonedMat.metalness = 0.45;
            clonedMat.envMapIntensity = 2.2;
          } else if (mn.includes('ct_goggles')) {
            // Crisp vibrant matching goggle frame
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x1f3d62 : 0x4a2028);
            clonedMat.roughness = 0.46;
            clonedMat.metalness = 0.25;
            clonedMat.emissive.setHex(isAlly ? 0x0c203a : 0x260c12);
            clonedMat.emissiveIntensity = 0.22;
          } else if (mn.includes('ops_core') || mn.includes('helmet_cover')) {
            // Vibrant matching tactical Ops-Core FAST ballistic helmet!
            clonedMat.map = codCamoTex;
            clonedMat.color.setHex(isAlly ? 0x74c6ff : 0xf66b74);
            clonedMat.roughness = 0.42;
            clonedMat.metalness = 0.16;
            clonedMat.emissive.setHex(isAlly ? 0x124478 : 0x5c141c);
            clonedMat.emissiveIntensity = 0.26;
            clonedMat.envMapIntensity = 1.3;
          } else if (mn.includes('helmet_sas') || mn.includes('helmet_gear') || mn.includes('pvs31') || mn.includes('l4g24')) {
            // ComTac headset, NVG mount & rails: authentic CoD matte tactical slate / dark FDE hardware
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x465d78 : 0x5c4c42);
            clonedMat.roughness = 0.42;
            clonedMat.metalness = 0.44;
            clonedMat.emissive.setHex(isAlly ? 0x0c1a2a : 0x1c1212);
            clonedMat.emissiveIntensity = 0.18;
            clonedMat.envMapIntensity = 1.35;
          } else if (mn.includes('balaclava')) {
            // Vibrant cohesive tactical face mask / balaclava matching team character!
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x225894 : 0x862432);
            clonedMat.roughness = 0.78;
            clonedMat.metalness = 0.04;
            clonedMat.emissive.setHex(isAlly ? 0x0e2e54 : 0x3a0b12);
            clonedMat.emissiveIntensity = 0.3;
          } else if (mn.includes('thorcarrier')) {
            // Plate Carrier Vest: authentic CoD tactical wolf-grey/graphite (Blue) & coyote-tan/khaki (Red)!
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x506072 : 0xa38c6a);
            clonedMat.roughness = 0.76;
            clonedMat.metalness = 0.08;
            clonedMat.emissive.setHex(isAlly ? 0x121c28 : 0x241c12);
            clonedMat.emissiveIntensity = 0.14;
          } else if (mn.includes('magpouch') || mn.includes('rv_gear') || mn.includes('grenifidrad') || mn.includes('gearasset')) {
            // Ammo pouches, IFAK & tactical rigs: authentic CoD ranger-khaki / coyote Cordura!
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x627284 : 0x8d7656);
            clonedMat.roughness = 0.78;
            clonedMat.metalness = 0.08;
            clonedMat.emissive.setHex(0x141310);
            clonedMat.emissiveIntensity = 0.12;
          } else if (mn.includes('magpack_ar') || mn.includes('mag_pistol')) {
            // Rifle & pistol ammo magazines: authentic CoD dark gunmetal / anodized steel & brass glint!
            clonedMat.map = null;
            clonedMat.color.setHex(0x5a6068);
            clonedMat.roughness = 0.34;
            clonedMat.metalness = 0.68;
            clonedMat.emissive.setHex(0x1a1712);
            clonedMat.emissiveIntensity = 0.14;
            clonedMat.envMapIntensity = 1.5;
          } else if (mn.includes('velcrostraps') || mn.includes('kneepads')) {
            // Tactical belts, retention straps & kneepads: authentic CoD desert-coyote / wolf-grey!
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x768596 : 0xbca47c);
            clonedMat.roughness = 0.68;
            clonedMat.metalness = 0.1;
            clonedMat.emissive.setHex(0x161410);
            clonedMat.emissiveIntensity = 0.12;
          } else if (mn.includes('buckles') || mn.includes('prc_148') || mn.includes('pradio') || mn.includes('pttset')) {
            // Belt buckles & PRC-148 military comms radio: authentic CoD OD-green / gunmetal hardware!
            clonedMat.map = null;
            clonedMat.color.setHex(0x3f4740);
            clonedMat.roughness = 0.44;
            clonedMat.metalness = 0.48;
            clonedMat.emissive.setHex(0x0c0e0e);
            clonedMat.emissiveIntensity = 0.12;
          } else if (mn.includes('gorka_boots')) {
            // Combat boots / shoes: authentic CoD rugged coyote-suede (Red) & weathered slate-leather (Blue)!
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x384350 : 0x755d46);
            clonedMat.roughness = 0.74;
            clonedMat.metalness = 0.08;
            clonedMat.emissive.setHex(0x12100e);
            clonedMat.emissiveIntensity = 0.12;
          } else if (mn.includes('kreugergloves')) {
            // Tactical combat gloves: authentic CoD charcoal-slate (Blue) & coyote-brown Mechanix (Red)!
            clonedMat.map = null;
            clonedMat.color.setHex(isAlly ? 0x34404e : 0x5a4c3e);
            clonedMat.roughness = 0.64;
            clonedMat.metalness = 0.12;
            clonedMat.emissive.setHex(0x0e0e10);
            clonedMat.emissiveIntensity = 0.14;
          } else {
            // Patches & insignia: preserve crisp original Shadow Company emblems!
            clonedMat.emissive.setHex(isAlly ? 0x0e2440 : 0x341016);
            clonedMat.emissiveIntensity = 0.18;
            clonedMat.envMapIntensity = 1.15;
          }
        } else if (isMeterRig) {
          // Preserve EVERY other downloaded character's crisp original PBR textures (Spider-Man, Deadpool, Gambit, Rogue, Luffy, Naruto, Bailarina)!
          clonedMat.emissive.setHex(isAlly ? 0x0b2548 : 0x3b0b12);
          clonedMat.emissiveIntensity = 0.16;
          clonedMat.envMapIntensity = 1.15;
        } else {
          clonedMat.color.setHex(bodyTint);
          clonedMat.emissive.setHex(bodyEmissive);
          clonedMat.emissiveIntensity = 0.22;
          clonedMat.roughness = 0.52;
          clonedMat.metalness = 0.16;
          clonedMat.envMapIntensity = 1.0;
          if (clonedMat.normalScale) {
            clonedMat.normalScale.set(0.36, 0.36);
          }
        }
        flashMaterials.push(clonedMat);
        clonedMat.needsUpdate = true;
      }
      return clonedMat;
    });
    mesh.material = Array.isArray(mesh.material) ? clonedMats : clonedMats[0];
  });

  // Bone discovery supporting ValveBiped (Shadow Company), UE5 (Gambit/Rogue/Luffy/Deadpool/Naruto/Bailarina), & Mixamo!
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
    hips: findBone(/^(mixamorigHips|ValveBipedBip01Pelvis|pelvis)$/i) ?? undefined,
    spine: findBone(/^(mixamorigSpine|ValveBipedBip01Spine|spine01)$/i) ?? undefined,
    spine1: findBone(/^(mixamorigSpine1|ValveBipedBip01Spine1|spine02)$/i) ?? undefined,
    spine2: findBone(/^(mixamorigSpine2|ValveBipedBip01Spine2|spine03)$/i) ?? undefined,
    head: findBone(/^(mixamorigHead|ValveBipedBip01Head1|head)$/i) ?? undefined,
    rightClavicle: findBone(/^(mixamorigRightShoulder|ValveBipedBip01RClavicle|clavicler)$/i) ?? undefined,
    rightArm: findBone(/^(mixamorigRightArm|ValveBipedBip01RUpperArm|upperarmr)$/i) ?? undefined,
    rightForeArm: findBone(/^(mixamorigRightForeArm|ValveBipedBip01RForearm|lowerarmr)$/i) ?? undefined,
    rightHand: findBone(/^(mixamorigRightHand|ValveBipedBip01RHand|handr)$/i) ?? undefined,
    leftClavicle: findBone(/^(mixamorigLeftShoulder|ValveBipedBip01LClavicle|claviclel)$/i) ?? undefined,
    leftArm: findBone(/^(mixamorigLeftArm|ValveBipedBip01LUpperArm|upperarml)$/i) ?? undefined,
    leftForeArm: findBone(/^(mixamorigLeftForeArm|ValveBipedBip01LForearm|lowerarml)$/i) ?? undefined,
    leftHand: findBone(/^(mixamorigLeftHand|ValveBipedBip01LHand|handl)$/i) ?? undefined,
    leftUpLeg: findBone(/^(mixamorigLeftUpLeg|ValveBipedBip01LThigh|thighl)$/i) ?? undefined,
    rightUpLeg: findBone(/^(mixamorigRightUpLeg|ValveBipedBip01RThigh|thighr)$/i) ?? undefined,
    leftLeg: findBone(/^(mixamorigLeftLeg|ValveBipedBip01LCalf|calfl)$/i) ?? undefined,
    rightLeg: findBone(/^(mixamorigRightLeg|ValveBipedBip01RCalf|calfr)$/i) ?? undefined,
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

  root.updateMatrixWorld(true);

  if (isMeterRig) {
    // Exact meter-space bone-tracked hitboxes computed directly in bind pose via worldToLocal!
    if (headBone) {
      const headHit = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), invisibleHitMat), 'head');
      const headCenter = new THREE.Vector3(0, 1.62, 0);
      headBone.worldToLocal(headCenter);
      headHit.position.copy(headCenter);
      headBone.add(headHit);
    } else {
      const headHit = registerHit(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), invisibleHitMat), 'head');
      headHit.position.set(0, 1.62, 0);
      modelPivot.add(headHit);
    }

    if (spineBone) {
      const bodyHit = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.34), invisibleHitMat), 'body');
      const bodyCenter = new THREE.Vector3(0, 1.15, 0);
      spineBone.worldToLocal(bodyCenter);
      bodyHit.position.copy(bodyCenter);
      spineBone.add(bodyHit);

      // Subtle glowing tactical Team Blue / Team Red shoulder IFF strobe pips ONLY on CoD Shadow armor
      // (never floating above bare-shouldered or slim heroes like Bailarina, Rogue, Luffy or Naruto!)
      if (isCodShadow) {
        const iffMat = new THREE.MeshBasicMaterial({
          color: isAlly ? 0x32ecff : 0xff364c,
          toneMapped: false,
        });
        for (const sx of [-0.20, 0.20]) {
          const pip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.022, 0.075), iffMat);
          const pipPos = new THREE.Vector3(sx, 1.44, 0.02);
          spineBone.worldToLocal(pipPos);
          pip.position.copy(pipPos);
          spineBone.add(pip);
        }
      }
    } else {
      const bodyHit = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.34), invisibleHitMat), 'body');
      bodyHit.position.set(0, 1.15, 0);
      modelPivot.add(bodyHit);
    }

    if (leftLegBone && rightLegBone) {
      const lHit = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.60, 6), invisibleHitMat), 'leg');
      const lp = new THREE.Vector3(0.11, 0.45, 0);
      leftLegBone.worldToLocal(lp);
      lHit.position.copy(lp);
      leftLegBone.add(lHit);

      const rHit = registerHit(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.60, 6), invisibleHitMat), 'leg');
      const rp = new THREE.Vector3(-0.11, 0.45, 0);
      rightLegBone.worldToLocal(rp);
      rHit.position.copy(rp);
      rightLegBone.add(rHit);
    } else {
      const legHit = registerHit(new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.80, 0.28), invisibleHitMat), 'leg');
      legHit.position.set(0, 0.42, 0);
      modelPivot.add(legHit);
    }
  } else {
    // Legacy Mixamo cm-space bone hitboxes & expressive face
    if (headBone) {
      const headHit = registerHit(new THREE.Mesh(new THREE.SphereGeometry(18, 8, 6), invisibleHitMat), 'head');
      headHit.position.set(0, 11, 2);
      headBone.add(headHit);

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
  }

  const blindHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.92 })
  );
  blindHalo.rotation.x = Math.PI / 2;
  blindHalo.position.set(0, 1.94, 0);
  blindHalo.visible = false;
  modelPivot.add(blindHalo);

  // Measure exact per-character arm reach in bind pose BEFORE animation starts, and bake natural gripped finger curl!
  root.updateMatrixWorld(true);
  let armReachR = 0.48;
  let armReachL = 0.48;
  if (skBones.rightArm && skBones.rightForeArm && skBones.rightHand) {
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    skBones.rightArm.getWorldPosition(p0);
    skBones.rightForeArm.getWorldPosition(p1);
    skBones.rightHand.getWorldPosition(p2);
    armReachR = Math.max(0.35, p0.distanceTo(p1) + p1.distanceTo(p2));
  }
  if (skBones.leftArm && skBones.leftForeArm && skBones.leftHand) {
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    skBones.leftArm.getWorldPosition(p0);
    skBones.leftForeArm.getWorldPosition(p1);
    skBones.leftHand.getWorldPosition(p2);
    armReachL = Math.max(0.35, p0.distanceTo(p1) + p1.distanceTo(p2));
  }
  let handBindOffsetR: THREE.Quaternion | undefined;
  let handBindOffsetL: THREE.Quaternion | undefined;
  let clavBindQL: THREE.Quaternion | undefined;
  let clavBindQR: THREE.Quaternion | undefined;
  let armBindQR: THREE.Quaternion | undefined;
  let foreArmBindQR: THREE.Quaternion | undefined;
  let armBindQL: THREE.Quaternion | undefined;
  let foreArmBindQL: THREE.Quaternion | undefined;
  if (isMeterRig) {
    handBindOffsetR = computeHandBindOffset(skBones.rightForeArm, skBones.rightHand, 'R');
    handBindOffsetL = computeHandBindOffset(skBones.leftForeArm, skBones.leftHand, 'L');
    clavBindQL = skBones.leftClavicle?.quaternion.clone();
    clavBindQR = skBones.rightClavicle?.quaternion.clone();
    armBindQR = skBones.rightArm?.quaternion.clone();
    foreArmBindQR = skBones.rightForeArm?.quaternion.clone();
    armBindQL = skBones.leftArm?.quaternion.clone();
    foreArmBindQL = skBones.leftForeArm?.quaternion.clone();
    bakeThirdPersonFingerGrip(skBones.rightHand, 'R');
    bakeThirdPersonFingerGrip(skBones.leftHand, 'L');
  }

  // Real downloaded 3D AKM / SCAR-H / AUG A4 / 9MM shouldered cleanly with exact hand IK anchors!
  const {
    weaponPivot,
    akmGroup,
    scarGroup,
    augGroup,
    pistolGroup,
    muzzlePoint,
    muzzleFlash,
    rightGripTarget,
    leftGripTarget,
    defaultWeaponSlot,
  } = buildCompactBotAkm(agentId);
  modelPivot.add(weaponPivot);

  // Continuous 3-way blended skeletal AnimationMixer (Idle <-> Walk <-> Run — exact existing animations!)
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
  mixer.update(Math.random() * 1.2);

  const dummy = () => new THREE.Group();
  const rig: AgentRig = {
    isSkinned: true,
    isMeterRig,
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
    akmGroup,
    scarGroup,
    augGroup,
    pistolGroup,
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
    armReachR,
    armReachL,
    handBindOffsetR,
    handBindOffsetL,
    clavBindQL,
    clavBindQR,
    armBindQR,
    foreArmBindQR,
    armBindQL,
    foreArmBindQL,
    defaultWeaponSlot,
    characterId: tpl.id as CharacterId,
  };
  positionRigWeaponAndSolveIK(rig, { weaponSlot: defaultWeaponSlot });
  return rig;
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
  textures?: TextureLibrary,
  characterId?: CharacterId
): AgentRig {
  if (cachedSoldierTemplate) {
    return buildSkinnedSoldierRig(agentId, team, style, characterId);
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
