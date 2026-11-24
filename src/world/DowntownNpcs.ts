import * as THREE from 'three';
import { AABB } from '../types';
import { depenetrateFromColliders } from './CollisionUtils';
import {
  DOWNTOWN_NPC_GLBS,
  DowntownNpcGlbId,
  LoadedGlbTemplate,
  fitGlbInstance,
  loadDowntownGlb,
} from './DowntownGlbAssets';

export interface PedestrianNode {
  x: number;
  z: number;
  neighbors: number[];
  isPlazaOrCrosswalk?: boolean;
}

interface AxisBoundBone {
  bone: THREE.Object3D;
  baseQ: THREE.Quaternion;
  localRightAxis: THREE.Vector3; // Character +X (Left/pitch axis) in bone's parent frame
  localUpAxis: THREE.Vector3; // Character +Y (Up/yaw axis) in bone's parent frame
  localFwdAxis: THREE.Vector3; // Character +Z (Forward/roll axis) in bone's parent frame
}

interface SkinnedCivilianRig {
  modelGroup: THREE.Group;
  hips?: AxisBoundBone;
  hipsRestY: number;
  spine?: AxisBoundBone;
  head?: AxisBoundBone;
  upperArmL?: AxisBoundBone;
  lowerArmL?: AxisBoundBone;
  upperArmR?: AxisBoundBone;
  lowerArmR?: AxisBoundBone;
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
  heightMeters: number;
  glbId: DowntownNpcGlbId;
  outfitTintHex: number | null;
}

// Reusable zero-allocation scratch math objects for 60 FPS skeletal updates
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

/**
 * Computes exact character-space X/Y/Z axes inside a bone's parent-local frame so pitch, yaw, and roll
 * rotations work identically across ALL Quaternius/Mixamo GLBs regardless of exported bone roll!
 */
function bindBoneAxes(bone: THREE.Object3D | null, charRootInvQ: THREE.Quaternion): AxisBoundBone | undefined {
  if (!bone || !bone.parent) return undefined;
  bone.parent.getWorldQuaternion(_qParentInv);
  // Transform parent world quat into character-root space, then invert -> maps character-space axis to parent-local!
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
 * Drops T-pose / wide A-pose arms cleanly down to a natural relaxed human standing posture
 * and bakes that relaxed orientation directly into `upperArm.baseQ`!
 */
function bakeRelaxedArmDrop(
  upperArm: THREE.Object3D | null,
  lowerArm: THREE.Object3D | null,
  charRootInvQ: THREE.Quaternion,
  side: 1 | -1 // +1 = Left (+X), -1 = Right (-X)
): void {
  if (!upperArm || !lowerArm || !upperArm.parent) return;
  upperArm.updateMatrixWorld(true);
  upperArm.getWorldPosition(_vA);
  lowerArm.getWorldPosition(_vB);
  _vDir.subVectors(_vB, _vA);
  if (_vDir.lengthSq() < 1e-8) return;
  // Convert rest arm vector into character-root space
  _vDir.normalize().applyQuaternion(charRootInvQ);
  // If arm is already hanging naturally downward, no T-pose drop needed
  if (_vDir.y < -0.82) return;

  // Natural relaxed NYC civilian standing arm angle (~13° slightly out from hips)
  _vDesired.set(side * 0.21, -0.975, 0.04).normalize();
  _qDelta.setFromUnitVectors(_vDir, _vDesired);

  // Convert character-space delta quaternion into upperArm's parent-local frame: qLocal = P^-1 * qDelta * P
  upperArm.parent.getWorldQuaternion(_qParentInv);
  _qParentInv.premultiply(charRootInvQ); // P
  _qTmp.copy(_qParentInv).invert().multiply(_qDelta).multiply(_qParentInv);
  upperArm.quaternion.premultiply(_qTmp);
  upperArm.updateMatrixWorld(true);
}

/**
 * Builds a rigged, skinned real 3D GLB civilian instance with unique NYC nightwear shading
 * and coordinate-frame-invariant skeletal bindings for butter-smooth GTA 5 walking & idle motion!
 */
function buildRiggedGlbCivilian(
  tpl: LoadedGlbTemplate,
  heightMeters: number,
  outfitTintHex: number | null
): SkinnedCivilianRig {
  const modelGroup = fitGlbInstance(tpl, { skinned: true, uniformHeight: heightMeters });
  const outfitTint = outfitTintHex ? new THREE.Color(outfitTintHex) : null;

  modelGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((orig) => {
      const m = orig.clone() as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial) return m;
      m.flatShading = false;
      const name = (m.name || '').toLowerCase();
      const isProtected =
        name.includes('skin') ||
        name.includes('eye') ||
        name.includes('brow') ||
        name.includes('lip') ||
        name.includes('teeth');
      if (outfitTint && !isProtected && !name.includes('hair')) {
        // Recolor garments subtly for duplicate model instances so NO two NPCs look the same!
        m.color.lerp(outfitTint, 0.58);
      } else if (!isProtected) {
        // Subtle midnight Manhattan lighting grade so clothes match the moody neon NYC night!
        m.color.multiply(new THREE.Color(0xccd8ec));
      }
      m.roughness = name.includes('skin') ? 0.66 : 0.72;
      m.metalness = name.includes('metal') || name.includes('scifi') ? 0.45 : 0.08;
      m.needsUpdate = true;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });

  // Ensure character faces +Z (verify Left shoulder sits on +X side; flip 180° if mirrored)
  modelGroup.updateMatrixWorld(true);
  const uArmL = findBoneByNames(modelGroup, [/^UpperArm\.?L$/i, /LeftArm$/i]);
  const lArmL = findBoneByNames(modelGroup, [/^LowerArm\.?L$/i, /LeftForeArm$/i]);
  const uArmR = findBoneByNames(modelGroup, [/^UpperArm\.?R$/i, /RightArm$/i]);
  const lArmR = findBoneByNames(modelGroup, [/^LowerArm\.?R$/i, /RightForeArm$/i]);
  const uLegL = findBoneByNames(modelGroup, [/^UpperLeg\.?L$/i, /LeftUpLeg$/i]);
  const lLegL = findBoneByNames(modelGroup, [/^LowerLeg\.?L$/i, /LeftLeg$/i]);
  const uLegR = findBoneByNames(modelGroup, [/^UpperLeg\.?R$/i, /RightUpLeg$/i]);
  const lLegR = findBoneByNames(modelGroup, [/^LowerLeg\.?R$/i, /RightLeg$/i]);
  const hipsBone = findBoneByNames(modelGroup, [/^Hips$/i]);
  const spineBone = findBoneByNames(modelGroup, [/^Torso$/i, /^Chest$/i, /^Spine1?$/i]);
  const headBone = findBoneByNames(modelGroup, [/^Head$/i]);

  if (uArmL && uArmR) {
    uArmL.getWorldPosition(_vA);
    uArmR.getWorldPosition(_vB);
    if (_vA.x < _vB.x) {
      modelGroup.rotation.y = Math.PI;
      modelGroup.updateMatrixWorld(true);
    }
  }

  const charRootInvQ = new THREE.Quaternion();
  modelGroup.getWorldQuaternion(charRootInvQ).invert();

  // Drop T-pose arms down naturally BEFORE binding base quaternions!
  bakeRelaxedArmDrop(uArmL, lArmL, charRootInvQ, 1);
  bakeRelaxedArmDrop(uArmR, lArmR, charRootInvQ, -1);

  return {
    modelGroup,
    hips: bindBoneAxes(hipsBone, charRootInvQ),
    hipsRestY: hipsBone ? hipsBone.position.y : 0,
    spine: bindBoneAxes(spineBone, charRootInvQ),
    head: bindBoneAxes(headBone, charRootInvQ),
    upperArmL: bindBoneAxes(uArmL, charRootInvQ),
    lowerArmL: bindBoneAxes(lArmL, charRootInvQ),
    upperArmR: bindBoneAxes(uArmR, charRootInvQ),
    lowerArmR: bindBoneAxes(lArmR, charRootInvQ),
    upperLegL: bindBoneAxes(uLegL, charRootInvQ),
    lowerLegL: bindBoneAxes(lLegL, charRootInvQ),
    upperLegR: bindBoneAxes(uLegR, charRootInvQ),
    lowerLegR: bindBoneAxes(lLegR, charRootInvQ),
  };
}

/**
 * Real Rigged Skinned GLB GTA-5-Style Unkillable Midtown Manhattan Civilian System:
 * - Loads 11 real CC0 Quaternius rigged 3D human `.glb` models (men & women in suits, casual, formal, punk, worker, sci-fi)
 * - Recolors garment slots per duplicate instance so all 26 civilians look completely unique
 * - Coordinate-frame-invariant skeletal animation: natural relaxed arms, smooth stride, anatomical knee flexion,
 *   torso counter-twist, billboard-admiring idle moments, curved cornering & polite player avoidance
 * - Graphics-tier aware: all 26 civilians in VIBRANT BLOOM / MAX 60 FPS; streamlined to 12 in LOW END DEVICE!
 * - 100% UNKILLABLE: never added to raycastMeshes, colliders, agents, or remotePlayers!
 */
export class DowntownNpcSystem {
  public readonly group = new THREE.Group();
  private actors: PedestrianActor[] = [];
  private nodes: PedestrianNode[];
  private colliders: AABB[];

  constructor(nodes: PedestrianNode[], count = 26, colliders: AABB[] = []) {
    this.nodes = nodes;
    this.colliders = colliders;
    this.spawnGlbCivilians(count);
  }

  private spawnGlbCivilians(count: number): void {
    let s = 90521;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };

    // Unique NYC evening garment recolors for civilians beyond the first 11 distinct GLB meshes
    const altGarmentTints = [
      0x1d2b44, // Midnight Navy
      0x8c6b48, // Camel Trench
      0x6c2434, // Deep Burgundy
      0x2c483c, // Forest Pine
      0x282b36, // Charcoal Slate
      0x1c4e64, // Petrol Teal
      0x4e3658, // Deep Plum
      0x88422c, // Rust Suede
      0x344a68, // Steel Blue
      0x5a4c3e, // Espresso Wool
      0x9a3048, // Crimson Coat
      0x263844, // Obsidian Tech
      0x746c60, // Stone Taupe
      0x2e4e44, // Olive Field
      0x423046, // Aubergine
    ];

    for (let i = 0; i < count; i++) {
      const startIdx = i % this.nodes.length;
      const startNode = this.nodes[startIdx];
      const nextIdx = startNode.neighbors[Math.floor(rand() * startNode.neighbors.length)] ?? 0;

      const t = rand();
      const targetNode = this.nodes[nextIdx];
      const laneOff = (rand() - 0.5) * 1.1;
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
        depenetrateFromColliders(
          pos,
          0.46,
          1.78,
          this.colliders,
          { minX: -48.5, maxX: 48.5, minZ: -48.5, maxZ: 48.5 },
          3,
          0.25
        );
      }
      const root = new THREE.Group();
      root.position.copy(pos);
      root.rotation.y = startYaw;
      // Full bustling 26-civilian Manhattan crowd in High Graphics; streamlined to 12 in LOW END DEVICE!
      if (i >= 12) {
        root.userData.lowEndOptional = true;
      }
      this.group.add(root);

      const glbId = DOWNTOWN_NPC_GLBS[i % DOWNTOWN_NPC_GLBS.length];
      const heightMeters = 1.68 + rand() * 0.16;
      const outfitTintHex = i >= DOWNTOWN_NPC_GLBS.length ? altGarmentTints[(i - DOWNTOWN_NPC_GLBS.length) % altGarmentTints.length] : null;

      const actor: PedestrianActor = {
        root,
        rig: null,
        pos,
        yaw: startYaw,
        fromNode: startIdx,
        toNode: nextIdx,
        laneOffsetX: perpX,
        laneOffsetZ: perpZ,
        walkSpeed: 1.25 + rand() * 0.42,
        currentSpeed: 1.25,
        walkPhase: rand() * Math.PI * 2,
        idleTimer: 0,
        lookPhase: rand() * Math.PI * 2,
        blendWalk: 1,
        heightMeters,
        glbId,
        outfitTintHex,
      };
      this.actors.push(actor);

      // Attach real rigged skinned GLB model immediately from cache (or as soon as preload completes!)
      void loadDowntownGlb(`npcs/${glbId}.glb`, 62).then((tpl) => {
        if (!tpl) return;
        const rig = buildRiggedGlbCivilian(tpl, actor.heightMeters, actor.outfitTintHex);
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

        if (dist < 0.72) {
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
          const laneOff = (Math.random() - 0.5) * 1.1;
          a.laneOffsetX = (-segDz / segLen) * laneOff;
          a.laneOffsetZ = (segDx / segLen) * laneOff;

          if (target.isPlazaOrCrosswalk && Math.random() < 0.22) {
            a.idleTimer = 2.0 + Math.random() * 2.8;
          }
        } else {
          dx /= dist;
          dz /= dist;

          // Smooth GTA-style polite steering around the player
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
          a.blendWalk = THREE.MathUtils.lerp(a.blendWalk, 1, Math.min(1, stepDt * 6.0));
          a.pos.x += dx * a.currentSpeed * stepDt;
          a.pos.z += dz * a.currentSpeed * stepDt;

          const targetYaw = Math.atan2(dx, dz);
          let diff = targetYaw - a.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.yaw += diff * Math.min(1, stepDt * 5.4);
        }
      }

      // Soft pairwise civilian-vs-civilian separation so pedestrians never walk through each other!
      for (let j = i + 1; j < this.actors.length; j++) {
        const b = this.actors[j];
        if (!b.root.visible) continue;
        const ox = a.pos.x - b.pos.x;
        const oz = a.pos.z - b.pos.z;
        const dSq = ox * ox + oz * oz;
        if (dSq < 0.88 * 0.88 && dSq > 1e-5) {
          const d = Math.sqrt(dSq);
          const push = (0.88 - d) * 0.5;
          const nx = ox / d;
          const nz = oz / d;
          a.pos.x += nx * push;
          a.pos.z += nz * push;
          b.pos.x -= nx * push;
          b.pos.z -= nz * push;
        }
      }

      // Hard close-range clearance around the player so civilians never clip inside the player camera!
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

      // Solid building, car, wall & TKTS stair collider depenetration so civilians NEVER enter walls or cars!
      if (this.colliders.length > 0) {
        depenetrateFromColliders(
          a.pos,
          0.46,
          1.78,
          this.colliders,
          { minX: -48.5, maxX: 48.5, minZ: -48.5, maxZ: 48.5 },
          2,
          0.25
        );
      }

      a.root.position.set(a.pos.x, 0, a.pos.z);
      a.root.rotation.y = a.yaw;

      const rig = a.rig;
      if (!rig) continue;

      a.walkPhase += stepDt * a.currentSpeed * 3.85;
      const p = a.walkPhase;
      const w = a.blendWalk;
      const sL = Math.sin(p);
      const sR = Math.sin(p + Math.PI);

      // Right-hand rule around character +X (Left axis):
      // Negative pitch = swing limb FORWARD (+Z); Positive pitch = swing limb BACKWARD (-Z) / bend knee BACK!
      const legSwingL = -sL * 0.44 * w;
      const legSwingR = -sR * 0.44 * w;
      const kneeBendL = (Math.max(0, Math.sin(p - 1.15)) * 0.68 + 0.05) * w;
      const kneeBendR = (Math.max(0, Math.sin(p + Math.PI - 1.15)) * 0.68 + 0.05) * w;

      applyBonePitch(rig.upperLegL, legSwingL);
      applyBonePitch(rig.lowerLegL, kneeBendL);
      applyBonePitch(rig.upperLegR, legSwingR);
      applyBonePitch(rig.lowerLegR, kneeBendR);

      // Natural counter-swinging arms & relaxed human elbow flexion (negative pitch bends forearm forward!)
      applyBonePitch(rig.upperArmL, -sR * 0.34 * w);
      applyBonePitch(rig.lowerArmL, -(0.14 + Math.max(0, sR) * 0.24) * w - 0.12 * (1 - w));
      applyBonePitch(rig.upperArmR, -sL * 0.34 * w);
      applyBonePitch(rig.lowerArmR, -(0.14 + Math.max(0, sL) * 0.24) * w - 0.12 * (1 - w));

      // Subtle hip vertical stride bounce & upper-body counter-twist
      rig.modelGroup.position.y = Math.abs(Math.cos(p)) * 0.032 * w;
      applyBoneYawRoll(rig.spine, -sL * 0.08 * w, sL * 0.025 * w);

      // Relaxed ambient gaze when walking; admiring towering Times Square billboards when paused!
      const headPitch = THREE.MathUtils.lerp(-0.22, -0.04, w);
      const headYaw = Math.sin(elapsed * (w > 0.5 ? 0.55 : 0.9) + a.lookPhase) * (w > 0.5 ? 0.16 : 0.42);
      applyBonePitchYaw(rig.head, headPitch, headYaw);
    }
  }
}
