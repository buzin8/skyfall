import * as THREE from 'three';
import { AABB } from '../types';
import { depenetrateFromColliders } from './CollisionUtils';
import {
  DOWNTOWN_CROWD_NPCS,
  DOWNTOWN_WALKER_NPCS,
  DowntownNpcGlbId,
  LoadedGlbTemplate,
  fitGlbInstance,
  loadDowntownGlb,
} from './DowntownGlbAssets';
import { CYBERPUNK_PLAY_HALF_X, CYBERPUNK_PLAY_HALF_Z } from './CyberpunkCityData';

export interface PedestrianNode {
  x: number;
  z: number;
  neighbors: number[];
  isPlazaOrCrosswalk?: boolean;
}

export interface CrowdSpot {
  x: number;
  z: number;
  yaw: number;
}

interface AxisBoundBone {
  bone: THREE.Object3D;
  baseQ: THREE.Quaternion;
  localRightAxis: THREE.Vector3;
  localUpAxis: THREE.Vector3;
  localFwdAxis: THREE.Vector3;
}

interface SkinnedCivilianRig {
  modelGroup: THREE.Group;
  isRiggedWalker: boolean;
  hips?: AxisBoundBone;
  hipsRestY: number;
  spine?: AxisBoundBone;
  head?: AxisBoundBone;
  shoulderL?: AxisBoundBone;
  shoulderR?: AxisBoundBone;
  upperArmL?: AxisBoundBone;
  lowerArmL?: AxisBoundBone;
  handL?: AxisBoundBone;
  upperArmR?: AxisBoundBone;
  lowerArmR?: AxisBoundBone;
  handR?: AxisBoundBone;
  upperLegL?: AxisBoundBone;
  lowerLegL?: AxisBoundBone;
  upperLegR?: AxisBoundBone;
  lowerLegR?: AxisBoundBone;
}

interface PedestrianActor {
  root: THREE.Group;
  rig: SkinnedCivilianRig | null;
  pos: THREE.Vector3;
  yaw: number;
  baseYaw: number;
  isStaticCrowd: boolean;
  fromNode: number;
  toNode: number;
  laneOffsetX: number;
  laneOffsetZ: number;
  walkSpeed: number;
  currentSpeed: number;
  walkPhase: number;
  idleTimer: number;
  lookPhase: number;
  blendWalk: number;
  stuckTimer: number;
  heightMeters: number;
  glbId: DowntownNpcGlbId;
}

const _qTmp = new THREE.Quaternion();
const _qTmp2 = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vDesired = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

function findBoneByNames(root: THREE.Object3D, patterns: RegExp[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (found || !obj.name) return;
    for (const p of patterns) {
      if (p.test(obj.name)) {
        found = obj;
        return;
      }
    }
  });
  return found;
}

function bindBoneAxes(bone: THREE.Object3D | null, charRootInvQ: THREE.Quaternion): AxisBoundBone | undefined {
  if (!bone || !bone.parent) return undefined;
  bone.parent.getWorldQuaternion(_qParentInv);
  _qParentInv.premultiply(charRootInvQ).invert();
  const localRightAxis = _axisX.clone().applyQuaternion(_qParentInv).normalize();
  const localUpAxis = _axisY.clone().applyQuaternion(_qParentInv).normalize();
  const localFwdAxis = _axisZ.clone().applyQuaternion(_qParentInv).normalize();
  return {
    bone,
    baseQ: bone.quaternion.clone(),
    localRightAxis,
    localUpAxis,
    localFwdAxis,
  };
}

function applyBonePitch(ab: AxisBoundBone | undefined, pitchRad: number): void {
  if (!ab) return;
  _qTmp.setFromAxisAngle(ab.localRightAxis, pitchRad);
  ab.bone.quaternion.copy(_qTmp).multiply(ab.baseQ);
}

function applyBonePitchYaw(ab: AxisBoundBone | undefined, pitchRad: number, yawRad: number): void {
  if (!ab) return;
  _qTmp.setFromAxisAngle(ab.localUpAxis, yawRad);
  _qTmp2.setFromAxisAngle(ab.localRightAxis, pitchRad);
  _qTmp.multiply(_qTmp2);
  ab.bone.quaternion.copy(_qTmp).multiply(ab.baseQ);
}

function applyBoneYawRoll(ab: AxisBoundBone | undefined, yawRad: number, rollRad: number): void {
  if (!ab) return;
  _qTmp.setFromAxisAngle(ab.localUpAxis, yawRad);
  _qTmp2.setFromAxisAngle(ab.localFwdAxis, rollRad);
  _qTmp.multiply(_qTmp2);
  ab.bone.quaternion.copy(_qTmp).multiply(ab.baseQ);
}

/**
 * Gently slopes T-pose / A-pose clavicles (Shoulders) downward so shoulder blades relax
 * naturally like a real human (gentler slope on A-pose models whose arms already hang down -> ZERO pinching!).
 */
function bakeRelaxedShoulderSlope(
  shoulder: THREE.Object3D | null,
  upperArm: THREE.Object3D | null,
  lowerArm: THREE.Object3D | null,
  charRootInvQ: THREE.Quaternion,
  side: 1 | -1
): void {
  if (!shoulder || !shoulder.parent) return;
  shoulder.updateMatrixWorld(true);
  let slopeRad = 0.165;
  if (upperArm && lowerArm) {
    upperArm.getWorldPosition(_vA);
    lowerArm.getWorldPosition(_vB);
    _vDir.subVectors(_vB, _vA);
    if (_vDir.lengthSq() > 1e-8) {
      _vDir.normalize().applyQuaternion(charRootInvQ);
      // A-pose walkers (Sakura, Jeny, Jack) already slope downward (-0.4..-0.65); slope gentler so scapula stays smooth!
      if (_vDir.y < -0.35) slopeRad = 0.085;
    }
  }
  // Rotate around character's +Z forward axis: -angle drops Left (+X) down; +angle drops Right (-X) down!
  _qDelta.setFromAxisAngle(_axisZ, -side * slopeRad);
  shoulder.parent.getWorldQuaternion(_qParentInv);
  _qParentInv.premultiply(charRootInvQ);
  _qTmp.copy(_qParentInv).invert().multiply(_qDelta).multiply(_qParentInv);
  shoulder.quaternion.premultiply(_qTmp);
  shoulder.updateMatrixWorld(true);
}

/**
 * Drops T-pose / A-pose arms cleanly down beside the hips to a natural relaxed human standing posture
 * and bakes that relaxed orientation directly into `upperArm.baseQ`!
 */
function bakeRelaxedArmDrop(
  upperArm: THREE.Object3D | null,
  lowerArm: THREE.Object3D | null,
  charRootInvQ: THREE.Quaternion,
  side: 1 | -1
): void {
  if (!upperArm || !lowerArm || !upperArm.parent) return;
  upperArm.updateMatrixWorld(true);
  upperArm.getWorldPosition(_vA);
  lowerArm.getWorldPosition(_vB);
  _vDir.subVectors(_vB, _vA);
  if (_vDir.lengthSq() < 1e-8) return;
  _vDir.normalize().applyQuaternion(charRootInvQ);
  if (_vDir.y < -0.96) return;

  // Natural relaxed human arm hang with clean torso/hip clearance (~10 deg out, slight 2 deg forward — zero scarecrow, zero waist clipping!)
  _vDesired.set(side * 0.175, -0.984, 0.035).normalize();
  _qDelta.setFromUnitVectors(_vDir, _vDesired);

  upperArm.parent.getWorldQuaternion(_qParentInv);
  _qParentInv.premultiply(charRootInvQ);
  _qTmp.copy(_qParentInv).invert().multiply(_qDelta).multiply(_qParentInv);
  upperArm.quaternion.premultiply(_qTmp);
  upperArm.updateMatrixWorld(true);
}

function buildDownloadedGlbCivilian(
  tpl: LoadedGlbTemplate,
  heightMeters: number,
  isStaticCrowd: boolean,
  isLowEnd = false
): SkinnedCivilianRig {
  const modelGroup = fitGlbInstance(tpl, { skinned: true, uniformHeight: heightMeters });

  modelGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = !isLowEnd;
    mesh.receiveShadow = !isLowEnd;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((orig) => {
      const m = orig.clone() as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial) return m;
      m.flatShading = false;
      // Keep original vibrant downloaded character textures crisp & well-lit under sunset/neon!
      m.roughness = Math.max(0.45, Math.min(0.82, m.roughness ?? 0.68));
      m.metalness = Math.min(0.35, m.metalness ?? 0.08);
      m.envMapIntensity = 1.1;
      if (m.emissive.r + m.emissive.g + m.emissive.b < 0.02) {
        m.emissive.setHex(0x181326);
        m.emissiveIntensity = 0.22;
      }
      m.needsUpdate = true;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });

  if (isStaticCrowd) {
    return {
      modelGroup,
      isRiggedWalker: false,
      hipsRestY: 0,
    };
  }

  modelGroup.updateMatrixWorld(true);
  // Support 13-bone Auto-Rig (Shoulder.L / UpperArm.L), VRM/Zira Isaac (J_Bip_L_Shoulder / J_Bip_L_UpperArm), and Mixamo!
  const shL = findBoneByNames(modelGroup, [/^Shoulder\.?L$/i, /J_Bip_L_Shoulder/i, /LeftShoulder$/i]);
  const shR = findBoneByNames(modelGroup, [/^Shoulder\.?R$/i, /J_Bip_R_Shoulder/i, /RightShoulder$/i]);
  const uArmL = findBoneByNames(modelGroup, [/^UpperArm\.?L$/i, /J_Bip_L_UpperArm/i, /LeftArm$/i]);
  const lArmL = findBoneByNames(modelGroup, [/^LowerArm\.?L$/i, /J_Bip_L_LowerArm/i, /LeftForeArm$/i]);
  const handL = findBoneByNames(modelGroup, [/^Hand\.?L$/i, /J_Bip_L_Hand/i, /LeftHand$/i]);
  const uArmR = findBoneByNames(modelGroup, [/^UpperArm\.?R$/i, /J_Bip_R_UpperArm/i, /RightArm$/i]);
  const lArmR = findBoneByNames(modelGroup, [/^LowerArm\.?R$/i, /J_Bip_R_LowerArm/i, /RightForeArm$/i]);
  const handR = findBoneByNames(modelGroup, [/^Hand\.?R$/i, /J_Bip_R_Hand/i, /RightHand$/i]);
  const uLegL = findBoneByNames(modelGroup, [/^UpperLeg\.?L$/i, /J_Bip_L_UpperLeg/i, /LeftUpLeg$/i]);
  const lLegL = findBoneByNames(modelGroup, [/^LowerLeg\.?L$/i, /J_Bip_L_LowerLeg/i, /LeftLeg$/i]);
  const uLegR = findBoneByNames(modelGroup, [/^UpperLeg\.?R$/i, /J_Bip_R_UpperLeg/i, /RightUpLeg$/i]);
  const lLegR = findBoneByNames(modelGroup, [/^LowerLeg\.?R$/i, /J_Bip_R_LowerLeg/i, /RightLeg$/i]);
  const hipsBone = findBoneByNames(modelGroup, [/^Hips$/i, /J_Bip_C_Hips/i, /mixamorigHips$/i]);
  const spineBone = findBoneByNames(modelGroup, [/^Torso$/i, /J_Bip_C_Chest/i, /J_Bip_C_Spine/i, /Spine1?$/i]);
  const headBone = findBoneByNames(modelGroup, [/^Head$/i, /J_Bip_C_Head/i, /mixamorigHead$/i]);

  if (uArmL && uArmR) {
    uArmL.getWorldPosition(_vA);
    uArmR.getWorldPosition(_vB);
    if (_vA.x < _vB.x) {
      modelGroup.rotation.y = Math.PI;
      modelGroup.updateMatrixWorld(true);
    }
  } else if (uLegL && uLegR) {
    uLegL.getWorldPosition(_vA);
    uLegR.getWorldPosition(_vB);
    if (_vA.x < _vB.x) {
      modelGroup.rotation.y = Math.PI;
      modelGroup.updateMatrixWorld(true);
    }
  }

  const charRootInvQ = new THREE.Quaternion();
  modelGroup.getWorldQuaternion(charRootInvQ).invert();

  // First slope clavicles gracefully downward (kills scarecrow shoulders!), then drop upper arms naturally!
  bakeRelaxedShoulderSlope(shL, uArmL, lArmL, charRootInvQ, 1);
  bakeRelaxedShoulderSlope(shR, uArmR, lArmR, charRootInvQ, -1);
  bakeRelaxedArmDrop(uArmL, lArmL, charRootInvQ, 1);
  bakeRelaxedArmDrop(uArmR, lArmR, charRootInvQ, -1);

  return {
    modelGroup,
    isRiggedWalker: Boolean(uLegL && uLegR),
    hips: bindBoneAxes(hipsBone, charRootInvQ),
    hipsRestY: hipsBone ? hipsBone.position.y : 0,
    spine: bindBoneAxes(spineBone, charRootInvQ),
    head: bindBoneAxes(headBone, charRootInvQ),
    shoulderL: bindBoneAxes(shL, charRootInvQ),
    shoulderR: bindBoneAxes(shR, charRootInvQ),
    upperArmL: bindBoneAxes(uArmL, charRootInvQ),
    lowerArmL: bindBoneAxes(lArmL, charRootInvQ),
    handL: bindBoneAxes(handL, charRootInvQ),
    upperArmR: bindBoneAxes(uArmR, charRootInvQ),
    lowerArmR: bindBoneAxes(lArmR, charRootInvQ),
    handR: bindBoneAxes(handR, charRootInvQ),
    upperLegL: bindBoneAxes(uLegL, charRootInvQ),
    lowerLegL: bindBoneAxes(lLegL, charRootInvQ),
    upperLegR: bindBoneAxes(uLegR, charRootInvQ),
    lowerLegR: bindBoneAxes(lLegR, charRootInvQ),
  };
}

/**
 * Unkillable Cyberpunk Downtown Civilian System powered by all 11 clean downloaded NPC models:
 * - 6 rigged / auto-rigged walking civilians (Zira Isaac, Android 18, Hinata, Outis, Cammy, Sakura)
 *   patrolling Cyberpunk City sidewalks & plazas with relaxed sloped shoulders, natural free-flowing arms,
 *   zero-moonwalk anatomical stride & full collider avoidance
 * - 5 relaxed standing street/plaza crowd models (Mai, Kayden, Office Elegance, Unboxing Allure, Gangsta Girl)
 *   hanging out naturally beside the parked supercars & neon storefronts with breathing & head-sway idle motion
 */
export class DowntownNpcSystem {
  public readonly group = new THREE.Group();
  private actors: PedestrianActor[] = [];
  private nodes: PedestrianNode[];
  private colliders: AABB[];
  private bounds = {
    minX: -(CYBERPUNK_PLAY_HALF_X - 1.5),
    maxX: CYBERPUNK_PLAY_HALF_X - 1.5,
    minZ: -(CYBERPUNK_PLAY_HALF_Z - 1.5),
    maxZ: CYBERPUNK_PLAY_HALF_Z - 1.5,
  };

  private isLowEnd: boolean;
  private npcShadowMat: THREE.MeshBasicMaterial | null = null;

  private getNpcShadowMat(): THREE.MeshBasicMaterial {
    if (this.npcShadowMat) return this.npcShadowMat;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    g.addColorStop(0.0, 'rgba(4, 6, 12, 0.68)');
    g.addColorStop(0.65, 'rgba(4, 6, 12, 0.34)');
    g.addColorStop(1.0, 'rgba(4, 6, 12, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this.npcShadowMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    return this.npcShadowMat;
  }

  private addFootShadow(root: THREE.Group): void {
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), this.getNpcShadowMat());
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.014;
    root.add(disc);
  }

  constructor(
    nodes: PedestrianNode[],
    walkerCount = 14,
    colliders: AABB[] = [],
    crowdSpots: CrowdSpot[] = [],
    isLowEnd = false
  ) {
    this.nodes = nodes;
    this.colliders = colliders;
    this.isLowEnd = isLowEnd;
    this.spawnWalkers(walkerCount);
    this.spawnCrowd(crowdSpots);
  }

  private spawnWalkers(count: number): void {
    let s = 90521;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };

    for (let i = 0; i < count; i++) {
      // Populate Central Neon Boulevard prominently with the first 16 roamers so the main street feels vibrant,
      // and distribute the remaining roamers across every South, East & North Cyberpunk Plaza loop!
      const startIdx = i < 16 ? i % 7 : (7 + ((i - 16) % Math.max(1, this.nodes.length - 7))) % this.nodes.length;
      const startNode = this.nodes[startIdx];
      const nextIdx = startNode.neighbors[Math.floor(rand() * startNode.neighbors.length)] ?? 0;

      const t = 0.12 + rand() * 0.76;
      const targetNode = this.nodes[nextIdx];
      const laneOff = (rand() - 0.5) * 0.72;
      const sx = THREE.MathUtils.lerp(startNode.x, targetNode.x, t);
      const sz = THREE.MathUtils.lerp(startNode.z, targetNode.z, t);
      const dx = targetNode.x - startNode.x;
      const dz = targetNode.z - startNode.z;
      const len = Math.hypot(dx, dz) || 1;
      const perpX = (-dz / len) * laneOff;
      const perpZ = (dx / len) * laneOff;
      const startYaw = Math.atan2(dx, dz);

      const pos = new THREE.Vector3(sx + perpX, 0, sz + perpZ);
      if (this.colliders.length > 0) {
        depenetrateFromColliders(pos, 0.46, 1.78, this.colliders, this.bounds, 3, 0.25);
      }

      const root = new THREE.Group();
      root.position.copy(pos);
      root.rotation.y = startYaw;
      this.addFootShadow(root);
      if (i >= 16) {
        root.userData.lowEndOptional = true;
      }
      this.group.add(root);

      const glbId = DOWNTOWN_WALKER_NPCS[i % DOWNTOWN_WALKER_NPCS.length];
      const heightMeters = 1.66 + rand() * 0.12;

      const actor: PedestrianActor = {
        root,
        rig: null,
        pos,
        yaw: startYaw,
        baseYaw: startYaw,
        isStaticCrowd: false,
        fromNode: startIdx,
        toNode: nextIdx,
        laneOffsetX: perpX,
        laneOffsetZ: perpZ,
        walkSpeed: 1.38 + rand() * 0.46,
        currentSpeed: 1.4,
        walkPhase: rand() * Math.PI * 2,
        idleTimer: 0,
        lookPhase: rand() * Math.PI * 2,
        blendWalk: 1,
        stuckTimer: 0,
        heightMeters,
        glbId,
      };
      this.actors.push(actor);

      void loadDowntownGlb(`npcs/${glbId}.glb`, 0).then((tpl) => {
        if (!tpl) return;
        const rig = buildDownloadedGlbCivilian(tpl, actor.heightMeters, false, this.isLowEnd);
        actor.root.add(rig.modelGroup);
        actor.rig = rig;
      });
    }
  }

  private spawnCrowd(spots: CrowdSpot[]): void {
    const crowdList: readonly DowntownNpcGlbId[] = DOWNTOWN_CROWD_NPCS;
    if (crowdList.length === 0 || spots.length === 0) return;
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const pos = new THREE.Vector3(sp.x, 0, sp.z);
      if (this.colliders.length > 0) {
        depenetrateFromColliders(pos, 0.46, 1.78, this.colliders, this.bounds, 3, 0.25);
      }

      const root = new THREE.Group();
      root.position.copy(pos);
      root.rotation.y = sp.yaw;
      this.addFootShadow(root);
      if (i >= 12) {
        root.userData.lowEndOptional = true;
      }
      this.group.add(root);

      const glbId = crowdList[i % crowdList.length];
      const heightMeters = 1.68 + (i % 3) * 0.04;

      const actor: PedestrianActor = {
        root,
        rig: null,
        pos,
        yaw: sp.yaw,
        baseYaw: sp.yaw,
        isStaticCrowd: true,
        fromNode: 0,
        toNode: 0,
        laneOffsetX: 0,
        laneOffsetZ: 0,
        walkSpeed: 0,
        currentSpeed: 0,
        walkPhase: i * 1.1,
        idleTimer: 9999,
        lookPhase: i * 1.7,
        blendWalk: 0,
        stuckTimer: 0,
        heightMeters,
        glbId,
      };
      this.actors.push(actor);

      void loadDowntownGlb(`npcs/${glbId}.glb`, 0).then((tpl) => {
        if (!tpl) return;
        const rig = buildDownloadedGlbCivilian(tpl, actor.heightMeters, true, this.isLowEnd);
        actor.root.add(rig.modelGroup);
        actor.rig = rig;
      });
    }
  }

  public update(dt: number, elapsed: number, playerPos?: THREE.Vector3): void {
    const stepDt = Math.min(dt, 0.05);
    if (stepDt <= 0) return;

    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.root.visible) continue;

      if (a.isStaticCrowd) {
        // Natural relaxed street-crowd presence beside supercars & storefronts (gentle breathing & looking around!)
        const breath = Math.sin(elapsed * 1.85 + a.lookPhase);
        const lookSway = Math.sin(elapsed * 0.55 + a.lookPhase) * 0.22;
        let targetYaw = a.baseYaw + lookSway;
        if (playerPos) {
          const dx = playerPos.x - a.pos.x;
          const dz = playerPos.z - a.pos.z;
          if (dx * dx + dz * dz < 36) {
            targetYaw = Math.atan2(dx, dz);
          }
        }
        let diff = targetYaw - a.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.yaw += diff * Math.min(1, stepDt * 2.4);
        a.root.rotation.y = a.yaw;
        if (a.rig) {
          a.rig.modelGroup.scale.y = 1.0 + breath * 0.008;
        }
        continue;
      }

      const prevX = a.pos.x;
      const prevZ = a.pos.z;

      if (a.idleTimer > 0) {
        a.idleTimer -= stepDt;
        a.currentSpeed = THREE.MathUtils.lerp(a.currentSpeed, 0, Math.min(1, stepDt * 6.5));
        a.blendWalk = THREE.MathUtils.lerp(a.blendWalk, 0, Math.min(1, stepDt * 6.5));
      } else {
        const target = this.nodes[a.toNode];
        const tx = target.x + a.laneOffsetX;
        const tz = target.z + a.laneOffsetZ;
        let dx = tx - a.pos.x;
        let dz = tz - a.pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.85) {
          const prev = a.fromNode;
          const curr = a.toNode;
          const nbs = target.neighbors;
          let next = nbs[0] ?? prev;
          if (nbs.length > 1) {
            const forwardChoices = nbs.filter((n) => n !== prev);
            const pool = forwardChoices.length > 0 ? forwardChoices : nbs;
            next = pool[Math.floor(Math.random() * pool.length)];
          }
          a.fromNode = curr;
          a.toNode = next;

          const nextN = this.nodes[next];
          const segDx = nextN.x - target.x;
          const segDz = nextN.z - target.z;
          const segLen = Math.hypot(segDx, segDz) || 1;
          const laneOff = (Math.random() - 0.5) * 0.64;
          a.laneOffsetX = (-segDz / segLen) * laneOff;
          a.laneOffsetZ = (segDx / segLen) * laneOff;

          if (target.isPlazaOrCrosswalk && Math.random() < 0.08) {
            a.idleTimer = 0.8 + Math.random() * 1.1;
          }
        } else {
          dx /= dist;
          dz /= dist;

          let desiredSpeed = a.walkSpeed;
          if (playerPos) {
            const px = a.pos.x - playerPos.x;
            const pz = a.pos.z - playerPos.z;
            const pDistSq = px * px + pz * pz;
            if (pDistSq < 4.4 && pDistSq > 0.001) {
              const pDist = Math.sqrt(pDistSq);
              const push = (2.1 - pDist) / 2.1;
              dx += (px / pDist) * push * 0.9;
              dz += (pz / pDist) * push * 0.9;
              const nLen = Math.hypot(dx, dz) || 1;
              dx /= nLen;
              dz /= nLen;
              desiredSpeed *= 0.88;
            }
          }

          a.currentSpeed = THREE.MathUtils.lerp(a.currentSpeed, desiredSpeed, Math.min(1, stepDt * 5.2));
          a.pos.x += dx * a.currentSpeed * stepDt;
          a.pos.z += dz * a.currentSpeed * stepDt;

          const targetYaw = Math.atan2(dx, dz);
          let diff = targetYaw - a.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.yaw += diff * Math.min(1, stepDt * 8.5);
        }
      }

      // Pairwise civilian separation
      for (let j = i + 1; j < this.actors.length; j++) {
        const b = this.actors[j];
        if (!b.root.visible) continue;
        const ox = a.pos.x - b.pos.x;
        const oz = a.pos.z - b.pos.z;
        const dSq = ox * ox + oz * oz;
        if (dSq < 0.88 * 0.88 && dSq > 1e-5) {
          const d = Math.sqrt(dSq);
          const push = (0.88 - d) * (b.isStaticCrowd ? 1.0 : 0.5);
          const nx = ox / d;
          const nz = oz / d;
          a.pos.x += nx * push;
          a.pos.z += nz * push;
          if (!b.isStaticCrowd) {
            b.pos.x -= nx * push;
            b.pos.z -= nz * push;
          }
        }
      }

      // Player clearance
      if (playerPos && Math.abs(playerPos.y) < 1.5) {
        const px = a.pos.x - playerPos.x;
        const pz = a.pos.z - playerPos.z;
        const pSq = px * px + pz * pz;
        if (pSq < 0.96 * 0.96 && pSq > 1e-5) {
          const pd = Math.sqrt(pSq);
          const push = 0.96 - pd;
          a.pos.x += (px / pd) * push;
          a.pos.z += (pz / pd) * push;
        }
      }

      // Solid Cyberpunk City building & supercar collider depenetration
      if (this.colliders.length > 0) {
        depenetrateFromColliders(a.pos, 0.46, 1.78, this.colliders, this.bounds, 2, 0.25);
      }

      a.root.position.set(a.pos.x, 0, a.pos.z);
      a.root.rotation.y = a.yaw;

      const stepDx = a.pos.x - prevX;
      const stepDz = a.pos.z - prevZ;
      const fwdStep = stepDx * Math.sin(a.yaw) + stepDz * Math.cos(a.yaw);
      const actualFwdSpeed = Math.max(0, fwdStep / Math.max(1e-4, stepDt));

      // Smart anti-stuck roaming recovery: if blocked by traffic/player for > 1.2s, reroute smoothly!
      if (a.idleTimer <= 0 && actualFwdSpeed < 0.18) {
        a.stuckTimer += stepDt;
        if (a.stuckTimer > 1.2) {
          a.stuckTimer = 0;
          const oldTo = a.toNode;
          a.toNode = a.fromNode;
          a.fromNode = oldTo;
          a.laneOffsetX = 0;
          a.laneOffsetZ = 0;
        }
      } else {
        a.stuckTimer = Math.max(0, a.stuckTimer - stepDt * 2);
      }

      const rig = a.rig;
      if (!rig || !rig.isRiggedWalker) continue;

      const targetBlend = actualFwdSpeed > 0.12 ? Math.min(1, actualFwdSpeed / Math.max(0.5, a.walkSpeed * 0.72)) : 0;
      a.blendWalk = THREE.MathUtils.lerp(a.blendWalk, targetBlend, Math.min(1, stepDt * 8.5));

      const hasArms = Boolean(rig.upperArmL && rig.upperArmR);
      const legLen = a.heightMeters * 0.49;
      const strideAmp = hasArms ? 0.44 : 0.34;
      const kneeAmp = hasArms ? 0.74 : 0.54;
      if (fwdStep > 0.0001) {
        a.walkPhase += fwdStep / Math.max(0.25, legLen * strideAmp);
      }
      const p = a.walkPhase;
      const w = a.blendWalk;
      const sL = Math.sin(p);
      const sR = Math.sin(p + Math.PI);

      const legSwingL = -sL * strideAmp * w;
      const legSwingR = -sR * strideAmp * w;
      const kneeBendL = (Math.max(0, Math.cos(p + 0.32)) * kneeAmp + 0.04) * w;
      const kneeBendR = (Math.max(0, Math.cos(p + Math.PI + 0.32)) * kneeAmp + 0.04) * w;

      applyBonePitch(rig.upperLegL, legSwingL);
      applyBonePitch(rig.lowerLegL, kneeBendL);
      applyBonePitch(rig.upperLegR, legSwingR);
      applyBonePitch(rig.lowerLegR, kneeBendR);

      // Natural free-flowing human arm swing (counter-phase pendulum + phase-lagged elbow & wrist follow-through!)
      const armPitchL = (-sR * 0.40 - 0.03) * w;
      const armPitchR = (-sL * 0.40 - 0.03) * w;
      // Gentle natural inward arc keeping arms 100% clear of hips/torso
      const armYawL = -Math.max(0, sR) * 0.04 * w;
      const armYawR = Math.max(0, sL) * 0.04 * w;
      applyBonePitchYaw(rig.upperArmL, armPitchL, armYawL);
      applyBonePitchYaw(rig.upperArmR, armPitchR, armYawR);

      // Phase-lagged forearm flex (~33 deg lag behind shoulder): long, loose, free-flowing swing!
      const lagL = Math.sin(p + Math.PI - 0.58);
      const lagR = Math.sin(p - 0.58);
      const elbowL = -(0.08 + (lagL * 0.5 + 0.5) * 0.26) * w - 0.09 * (1 - w);
      const elbowR = -(0.08 + (lagR * 0.5 + 0.5) * 0.26) * w - 0.09 * (1 - w);
      applyBonePitch(rig.lowerArmL, elbowL);
      applyBonePitch(rig.lowerArmR, elbowR);

      // Soft trailing wrist follow-through & natural shoulder-blade (scapula) horizontal glide + subtle stride roll!
      const wristLagL = Math.sin(p + Math.PI - 0.95);
      const wristLagR = Math.sin(p - 0.95);
      applyBonePitch(rig.handL, -wristLagL * 0.15 * w);
      applyBonePitch(rig.handR, -wristLagR * 0.15 * w);
      applyBoneYawRoll(rig.shoulderL, -sR * 0.065 * w, -sR * 0.025 * w);
      applyBoneYawRoll(rig.shoulderR, sL * 0.065 * w, sL * 0.025 * w);

      rig.modelGroup.position.y = Math.abs(Math.cos(p)) * 0.022 * w;
      // Natural human counter-rotation: right shoulder swings slightly forward as left leg strides forward (+sL)!
      applyBoneYawRoll(rig.spine, sL * 0.095 * w, sL * 0.028 * w);

      const headPitch = THREE.MathUtils.lerp(-0.12, -0.03, w);
      const headYaw = Math.sin(elapsed * (w > 0.5 ? 0.55 : 0.9) + a.lookPhase) * (w > 0.5 ? 0.16 : 0.38);
      applyBonePitchYaw(rig.head, headPitch, headYaw);
    }
  }
}
