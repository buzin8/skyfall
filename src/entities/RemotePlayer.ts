import * as THREE from 'three';
import { LobbyTeam } from '../types';
import { TextureLibrary } from '../textures/ProceduralTextures';
import { AgentRig, buildAgentRig, solveTwoBoneArmIK } from './AgentModel';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Third-person rigged 3D soldier avatar representing a joined human player (teammate or enemy)
 * in Team Death Match — wearing Blue dress (Blue Team) or Red dress (Red Team), with smooth
 * networked interpolation, 2-bone Arm IK, light-blue ballistic glasses + mesh mask, and
 * full articulated ragdoll death collapse with floor clamping!
 */
export class RemotePlayer {
  public readonly id: string;
  public readonly name: string;
  public readonly team: LobbyTeam;
  public readonly rig: AgentRig;

  public pos = new THREE.Vector3();
  public targetPos = new THREE.Vector3();
  public yaw = 0; // World soldier facing yaw (= remote player cameraYaw + Math.PI)
  public targetYaw = 0;
  public pitch = 0;
  public hp = 100;
  public maxHp = 100;
  public shield = 50;
  public alive = true;
  public crouching = false;
  public crouchAmount = 0;
  public weaponSlot = 0;
  public spottedTimer = 0;
  public losVisible = false;

  private netVel = new THREE.Vector3();
  private lastNetTime = performance.now();
  private timeSinceNet = 0;
  private idlePhase = Math.random() * Math.PI * 2;
  private smoothSpeed = 0;
  private smoothStrafe = 0;
  private muzzleFlashTimer = 0;
  private hitFlashTimer = 0;
  private recoilKick = 0;

  // Articulated 2-stage ragdoll collapse state (zero floor-clipping!)
  private deathAnim = 0;
  private killImpulse = new THREE.Vector3();
  private killPitchSign = -1;
  private killRollTarget = 0.25;
  private killYawTwist = 0.2;
  private killSlideDist = 0.36;
  private killHeadshot = false;
  private deathVariant = 0;
  private deathStartHipsPos = new THREE.Vector3();
  private deathStartQuats = new Map<string, THREE.Quaternion>();
  private deathMidQuats = new Map<string, THREE.Quaternion>();
  private deathTargetQuats = new Map<string, THREE.Quaternion>();

  private ikRightTarget = new THREE.Vector3();
  private ikLeftTarget = new THREE.Vector3();
  private ikRightPole = new THREE.Vector3();
  private ikLeftPole = new THREE.Vector3();

  constructor(
    id: string,
    name: string,
    team: LobbyTeam,
    spawnPos: THREE.Vector3,
    cameraYaw: number,
    scene: THREE.Scene,
    textures?: TextureLibrary
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    // Blue Team -> 'ally' (blue uniform); Red Team -> 'enemy' (red uniform)!
    this.rig = buildAgentRig(id, team === 'blue' ? 'ally' : 'enemy', 'ember', textures);
    for (const hm of this.rig.hitMeshes) {
      hm.userData.remotePlayerId = id;
      hm.userData.agentId = undefined;
    }
    scene.add(this.rig.root);
    this.respawn(spawnPos, cameraYaw);
  }

  public respawn(spawnPos: THREE.Vector3, cameraYaw: number): void {
    this.pos.copy(spawnPos);
    this.targetPos.copy(spawnPos);
    this.yaw = cameraYaw + Math.PI;
    this.targetYaw = this.yaw;
    this.pitch = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.shield = 50;
    this.alive = true;
    this.crouching = false;
    this.crouchAmount = 0;
    this.muzzleFlashTimer = 0;
    this.hitFlashTimer = 0;
    this.recoilKick = 0;
    this.deathAnim = 0;
    this.spottedTimer = 0;

    this.rig.root.visible = true;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.yaw, 0);
    this.rig.modelPivot.position.set(0, 0, 0);
    this.rig.modelPivot.rotation.set(0, 0, 0);
    this.rig.modelPivot.scale.set(1, 1, 1);
    this.rig.weaponPivot.visible = true;
    this.rig.blindHalo.visible = false;
    this.rig.muzzleFlash.visible = false;

    if (this.rig.isSkinned && this.rig.actions) {
      this.rig.actions.idle.enabled = true;
      this.rig.actions.walk.enabled = true;
      this.rig.actions.run.enabled = true;
      this.rig.actions.idle.setEffectiveWeight(1).play();
      this.rig.actions.walk.setEffectiveWeight(0).play();
      this.rig.actions.run.setEffectiveWeight(0).play();
      this.smoothSpeed = 0;
      this.smoothStrafe = 0;
      this.deathStartQuats.clear();
      this.deathMidQuats.clear();
      this.deathTargetQuats.clear();
      this.rig.mixer?.update(0);
      this.rig.weaponPivot.position.set(-0.15, 1.345, 0.225);
      this.rig.weaponPivot.rotation.set(0, 0, 0);
      if (this.rig.akmGroup && this.rig.scarGroup) {
        this.rig.akmGroup.visible = this.weaponSlot !== 1;
        this.rig.scarGroup.visible = this.weaponSlot === 1;
      }
      this.applySkinnedArmIK(0);
    }
  }

  public applyNetworkState(
    x: number,
    y: number,
    z: number,
    cameraYaw: number,
    pitch: number,
    crouching: boolean,
    weaponSlot: number,
    hp: number,
    shield: number,
    alive: boolean
  ): void {
    // Zero-allocation smooth position & velocity-assisted prediction (silky 60 FPS even over Wi-Fi!)
    const dx = x - this.targetPos.x;
    const dy = y - this.targetPos.y;
    const dz = z - this.targetPos.z;
    const stepSq = dx * dx + dy * dy + dz * dz;

    const now = performance.now();
    const dtNet = Math.max(0.016, Math.min(0.25, (now - this.lastNetTime) * 0.001));
    this.lastNetTime = now;
    this.timeSinceNet = 0;

    if (stepSq > 20) {
      this.pos.set(x, y, z);
      this.netVel.set(0, 0, 0);
    } else {
      const vx = dx / dtNet;
      const vy = dy / dtNet;
      const vz = dz / dtNet;
      // Smooth velocity estimate and clamp to realistic player max speed
      const speedSq = vx * vx + vz * vz;
      if (speedSq < 144) {
        this.netVel.x = THREE.MathUtils.lerp(this.netVel.x, vx, 0.55);
        this.netVel.y = THREE.MathUtils.lerp(this.netVel.y, vy, 0.55);
        this.netVel.z = THREE.MathUtils.lerp(this.netVel.z, vz, 0.55);
      } else {
        this.netVel.set(0, 0, 0);
      }
    }
    this.targetPos.set(x, y, z);
    this.targetYaw = cameraYaw + Math.PI;
    this.pitch = pitch;
    this.crouching = crouching;
    this.weaponSlot = weaponSlot;
    this.hp = hp;
    this.shield = shield;

    if (this.alive && !alive) {
      this.triggerDeath(undefined, false);
    } else if (!this.alive && alive) {
      this.respawn(this.targetPos, cameraYaw);
    }
  }

  public triggerMuzzleFlash(): void {
    if (!this.alive) return;
    this.rig.muzzleFlash.visible = true;
    this.rig.muzzleFlash.rotation.z = Math.random() * Math.PI;
    this.muzzleFlashTimer = 0.045;
    this.recoilKick = 1.0;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.14;
  }

  public triggerDeath(impulseDir?: THREE.Vector3, headshot = false): void {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.rig.muzzleFlash.visible = false;
    this.rig.weaponPivot.visible = false;
    this.killHeadshot = headshot;
    this.deathVariant = Math.floor(Math.random() * 3);

    if (impulseDir) {
      this.killImpulse.set(impulseDir.x, 0, impulseDir.z);
      if (this.killImpulse.lengthSq() > 0.001) this.killImpulse.normalize();
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const dot = this.killImpulse.x * fwdX + this.killImpulse.z * fwdZ;
      this.killPitchSign = dot > 0.3 ? 1 : -1;
      this.killRollTarget = (Math.random() > 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.28);
      this.killYawTwist = (Math.random() - 0.5) * 0.55;
      this.killSlideDist = headshot ? 0.55 : 0.34;
    } else {
      this.killImpulse.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.killPitchSign = -1;
      this.killRollTarget = (Math.random() > 0.5 ? 1 : -1) * 0.26;
      this.killYawTwist = (Math.random() - 0.5) * 0.45;
      this.killSlideDist = 0.32;
    }

    if (this.rig.isSkinned && this.rig.skBones) {
      this.prepareSkinnedRagdollCollapse();
    }
  }

  public getEyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    const h = THREE.MathUtils.lerp(1.62, 1.16, this.crouchAmount);
    return out.set(this.pos.x, this.pos.y + h, this.pos.z);
  }

  public getHeadWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.rig.isSkinned && this.rig.headBone) {
      this.rig.headBone.getWorldPosition(out);
      out.y += 0.28;
      return out;
    }
    return out.set(this.pos.x, this.pos.y + (this.crouchAmount > 0.4 ? 1.45 : 1.94), this.pos.z);
  }

  public update(dt: number): void {
    if (this.spottedTimer > 0) this.spottedTimer = Math.max(0, this.spottedTimer - dt);

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) this.rig.muzzleFlash.visible = false;
    }

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      const intensity = this.hitFlashTimer > 0 ? 1.45 : 0.35;
      for (const m of this.rig.flashMaterials) {
        m.emissiveIntensity = intensity;
      }
    }

    if (!this.alive) {
      this.updateDeathRagdoll(dt);
      return;
    }

    const prevX = this.pos.x;
    const prevZ = this.pos.z;

    // Smoothly interpolate position & facing angle with bounded dead-reckoning (zero micro-stutter!)
    this.timeSinceNet = Math.min(0.07, this.timeSinceNet + dt);
    const predX = this.targetPos.x + this.netVel.x * this.timeSinceNet;
    const predY = this.targetPos.y + this.netVel.y * this.timeSinceNet;
    const predZ = this.targetPos.z + this.netVel.z * this.timeSinceNet;
    const posAlpha = 1 - Math.exp(-19 * dt);
    this.pos.x += (predX - this.pos.x) * posAlpha;
    this.pos.y += (predY - this.pos.y) * posAlpha;
    this.pos.z += (predZ - this.pos.z) * posAlpha;
    this.yaw = lerpAngle(this.yaw, this.targetYaw, 1 - Math.exp(-20 * dt));

    const invDt = dt > 1e-4 ? 1 / dt : 0;
    const vx = (this.pos.x - prevX) * invDt;
    const vz = (this.pos.z - prevZ) * invDt;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const localFwd = vx * sinY + vz * cosY;
    const localLeft = vx * cosY - vz * sinY;

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.yaw, 0);

    const targetCrouch = this.crouching ? 1 : 0;
    this.crouchAmount = THREE.MathUtils.lerp(this.crouchAmount, targetCrouch, Math.min(1, dt * 12));
    this.idlePhase += dt * 2.4;
    this.recoilKick = Math.max(0, this.recoilKick - dt * 9.5);
    const moveSpeed = Math.hypot(localFwd, localLeft);

    if (this.rig.isSkinned && this.rig.mixer && this.rig.actions) {
      const expSmooth = 1 - Math.exp(-10 * dt);
      this.smoothSpeed = THREE.MathUtils.lerp(this.smoothSpeed, moveSpeed, expSmooth);
      this.smoothStrafe = THREE.MathUtils.lerp(this.smoothStrafe, localLeft, expSmooth);

      const spd = this.smoothSpeed;
      const wRun = THREE.MathUtils.smoothstep(spd, 1.85, 3.25);
      const wWalk = THREE.MathUtils.smoothstep(spd, 0.16, 1.15) * (1 - wRun);
      const wIdle = Math.max(0, 1 - wWalk - wRun);

      this.rig.actions.idle.setEffectiveWeight(wIdle);
      this.rig.actions.walk.setEffectiveWeight(wWalk);
      this.rig.actions.run.setEffectiveWeight(wRun);
      this.rig.actions.idle.timeScale = 1.0;
      this.rig.actions.walk.timeScale = THREE.MathUtils.clamp(spd / 1.65, 0.65, 1.45);
      this.rig.actions.run.timeScale = THREE.MathUtils.clamp(spd / 3.6, 0.72, 1.35);

      this.rig.mixer.update(dt);

      const crouchScaleY = THREE.MathUtils.lerp(1.0, 0.84, this.crouchAmount);
      this.rig.modelPivot.scale.set(1, crouchScaleY, 1);
      this.rig.modelPivot.rotation.z = THREE.MathUtils.clamp(-this.smoothStrafe * 0.028, -0.1, 0.1);
      this.rig.modelPivot.rotation.x = THREE.MathUtils.clamp(spd * 0.018, 0, 0.08);

      const strideBobY = Math.sin(this.idlePhase * (spd > 0.4 ? 4.0 : 1.0)) * (spd > 0.4 ? 0.014 : 0.006);
      const strideBobX = Math.cos(this.idlePhase * 2.0) * (spd > 0.4 ? 0.008 : 0.002);
      const runCant = wRun * 0.06;
      const aimPitch = THREE.MathUtils.clamp(-this.pitch * 0.34, -0.25, 0.25);
      // Pivot cleanly around the right shoulder buttstock anchor so the rifle NEVER swings off-shoulder!
      const stockYComp = -0.2 * Math.sin(aimPitch);

      if (this.rig.akmGroup && this.rig.scarGroup) {
        this.rig.akmGroup.visible = this.weaponSlot !== 1;
        this.rig.scarGroup.visible = this.weaponSlot === 1;
      }

      this.rig.weaponPivot.position.set(
        -0.15 + strideBobX,
        1.345 + strideBobY + stockYComp - this.crouchAmount * 0.055,
        0.225 - this.recoilKick * 0.042
      );
      this.rig.weaponPivot.rotation.set(
        runCant + aimPitch - this.recoilKick * 0.1,
        0,
        0
      );

      this.applySkinnedArmIK(aimPitch);
    }
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
  }

  private applySkinnedArmIK(aimPitch: number): void {
    const b = this.rig.skBones;
    if (!b || !this.rig.rightGripTarget || !this.rig.leftGripTarget) return;

    // Natural right-handed bladed CQB stance: right shoulder slightly back, left shoulder forward toward handguard!
    if (b.spine2) {
      b.spine2.rotation.y -= 0.16;
    }
    if (b.head) {
      b.head.rotation.y += 0.14;
      b.head.rotation.x += aimPitch * 0.38;
    }

    this.rig.root.updateMatrixWorld(true);

    if (b.rightArm && b.rightForeArm && b.rightHand) {
      this.rig.rightGripTarget.getWorldPosition(this.ikRightTarget);
      // Tucked downward right elbow close beside right ribcage (zero chicken-wing flare!)
      this.ikRightPole.set(-0.34, 0.62, -0.18).applyMatrix4(this.rig.modelPivot.matrixWorld);
      solveTwoBoneArmIK(b.rightArm, b.rightForeArm, b.rightHand, this.ikRightTarget, this.ikRightPole, 1.0);
      b.rightHand.quaternion.set(0, 0, 0, 1);
    }

    if (b.leftArm && b.leftForeArm && b.leftHand) {
      this.rig.leftGripTarget.getWorldPosition(this.ikLeftTarget);
      // Tucked downward left elbow directly beneath the rifle handguard!
      this.ikLeftPole.set(0.16, 0.56, 0.28).applyMatrix4(this.rig.modelPivot.matrixWorld);
      solveTwoBoneArmIK(b.leftArm, b.leftForeArm, b.leftHand, this.ikLeftTarget, this.ikLeftPole, 1.0);
      b.leftHand.quaternion.set(0, 0, 0, 1);
    }
  }

  private prepareSkinnedRagdollCollapse(): void {
    const b = this.rig.skBones;
    if (!b) return;
    this.deathStartQuats.clear();
    this.deathMidQuats.clear();
    this.deathTargetQuats.clear();

    const boneEntries: Array<[string, THREE.Object3D | undefined]> = [
      ['hips', b.hips],
      ['spine', b.spine],
      ['spine1', b.spine1],
      ['spine2', b.spine2],
      ['head', b.head],
      ['leftArm', b.leftArm],
      ['leftForeArm', b.leftForeArm],
      ['rightArm', b.rightArm],
      ['rightForeArm', b.rightForeArm],
      ['leftUpLeg', b.leftUpLeg],
      ['leftLeg', b.leftLeg],
      ['rightUpLeg', b.rightUpLeg],
      ['rightLeg', b.rightLeg],
    ];
    for (const [k, obj] of boneEntries) {
      if (obj) this.deathStartQuats.set(k, obj.quaternion.clone());
    }
    if (b.hips) this.deathStartHipsPos.copy(b.hips.position);

    const qEuler = (x: number, y: number, z: number) =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));

    const fallBack = this.killPitchSign < 0;
    const mirror = this.killRollTarget >= 0 ? 1 : -1;
    const v = this.deathVariant;

    const startHipsQ = this.deathStartQuats.get('hips') ?? new THREE.Quaternion(0, 0.707, 0.707, 0);
    const midTip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fallBack ? 0.34 : -0.42);
    const midRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.killRollTarget * 0.45);
    this.deathMidQuats.set('hips', midRoll.multiply(midTip).multiply(startHipsQ.clone()));

    const endTip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fallBack ? 1.52 : -1.48);
    const endRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.killRollTarget);
    const endTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.killYawTwist);
    this.deathTargetQuats.set('hips', endTwist.multiply(endRoll).multiply(endTip).multiply(startHipsQ.clone()));

    const hsExtra = this.killHeadshot ? -0.35 : 0;
    this.deathMidQuats.set('spine', qEuler(fallBack ? -0.18 : 0.32, 0.08 * mirror, 0.06 * mirror));
    this.deathMidQuats.set('spine1', qEuler(fallBack ? -0.24 : 0.36, 0.1 * mirror, 0.08 * mirror));
    this.deathMidQuats.set('spine2', qEuler(fallBack ? -0.16 : 0.24, 0, 0.05 * mirror));
    this.deathMidQuats.set('head', qEuler((fallBack ? -0.46 : 0.32) + hsExtra, 0.24 * mirror, 0.12 * mirror));

    this.deathTargetQuats.set('spine', qEuler(fallBack ? 0.06 : 0.14, 0.14 * mirror, 0.08 * mirror));
    this.deathTargetQuats.set('spine1', qEuler(fallBack ? 0.08 : 0.16, 0.18 * mirror, 0.1 * mirror));
    this.deathTargetQuats.set('spine2', qEuler(fallBack ? 0.04 : 0.1, 0.08 * mirror, 0.06 * mirror));
    this.deathTargetQuats.set('head', qEuler(fallBack ? -0.18 : 0.22, 0.52 * mirror, 0.26 * mirror));

    this.deathMidQuats.set('leftUpLeg', qEuler(Math.PI - 0.62, 0.08, -0.06));
    this.deathMidQuats.set('rightUpLeg', qEuler(Math.PI - 0.52, -0.08, 0.06));
    this.deathMidQuats.set('leftLeg', qEuler(1.18, 0, 0));
    this.deathMidQuats.set('rightLeg', qEuler(1.06, 0, 0));

    if (v === 0) {
      this.deathTargetQuats.set('leftUpLeg', qEuler(Math.PI - 0.38, 0.16, -0.24));
      this.deathTargetQuats.set('leftLeg', qEuler(0.76, 0, 0));
      this.deathTargetQuats.set('rightUpLeg', qEuler(Math.PI - 0.1, -0.08, 0.14));
      this.deathTargetQuats.set('rightLeg', qEuler(0.18, 0, 0));
    } else if (v === 1) {
      this.deathTargetQuats.set('leftUpLeg', qEuler(Math.PI - 0.12, 0.08, -0.12));
      this.deathTargetQuats.set('leftLeg', qEuler(0.22, 0, 0));
      this.deathTargetQuats.set('rightUpLeg', qEuler(Math.PI - 0.52, -0.18, 0.28));
      this.deathTargetQuats.set('rightLeg', qEuler(0.92, 0, 0));
    } else {
      this.deathTargetQuats.set('leftUpLeg', qEuler(Math.PI - 0.22, 0.2, -0.28));
      this.deathTargetQuats.set('leftLeg', qEuler(0.32, 0, 0));
      this.deathTargetQuats.set('rightUpLeg', qEuler(Math.PI - 0.26, -0.16, 0.24));
      this.deathTargetQuats.set('rightLeg', qEuler(0.42, 0, 0));
    }

    this.deathMidQuats.set('leftArm', qEuler(0.4, 0.3, -0.6));
    this.deathMidQuats.set('leftForeArm', qEuler(0.1, -0.4, -0.65));
    this.deathMidQuats.set('rightArm', qEuler(0.35, -0.3, 0.6));
    this.deathMidQuats.set('rightForeArm', qEuler(0.1, 0.4, 0.65));

    if (fallBack) {
      this.deathTargetQuats.set('leftArm', qEuler(0.18, 0.12, -0.82));
      this.deathTargetQuats.set('leftForeArm', qEuler(0.14, 0.08, -0.58));
      this.deathTargetQuats.set('rightArm', qEuler(0.26, -0.14, 0.68));
      this.deathTargetQuats.set('rightForeArm', qEuler(0.18, -0.12, 0.72));
    } else {
      this.deathTargetQuats.set('leftArm', qEuler(0.42, 0.16, -0.78));
      this.deathTargetQuats.set('leftForeArm', qEuler(0.24, 0.1, -0.65));
      this.deathTargetQuats.set('rightArm', qEuler(0.36, -0.14, 0.72));
      this.deathTargetQuats.set('rightForeArm', qEuler(0.2, -0.1, 0.68));
    }
  }

  private updateDeathRagdoll(dt: number): void {
    const prevAnim = this.deathAnim;
    this.deathAnim = Math.min(1, this.deathAnim + dt * 1.48);
    const deltaSlide =
      (1 - (1 - this.deathAnim) * (1 - this.deathAnim) - (1 - (1 - prevAnim) * (1 - prevAnim))) *
      this.killSlideDist;

    if (deltaSlide > 0.0001) {
      this.pos.x += this.killImpulse.x * deltaSlide;
      this.pos.z += this.killImpulse.z * deltaSlide;
      this.rig.root.position.copy(this.pos);
    }

    if (this.rig.isSkinned && this.rig.skBones) {
      const b = this.rig.skBones;
      const p = this.deathAnim;
      this.rig.modelPivot.scale.set(1, 1, 1);
      this.rig.modelPivot.rotation.set(0, 0, 0);
      this.rig.modelPivot.position.set(0, 0, 0);

      const boneMap: Array<[string, THREE.Object3D | undefined]> = [
        ['hips', b.hips],
        ['spine', b.spine],
        ['spine1', b.spine1],
        ['spine2', b.spine2],
        ['head', b.head],
        ['leftArm', b.leftArm],
        ['leftForeArm', b.leftForeArm],
        ['rightArm', b.rightArm],
        ['rightForeArm', b.rightForeArm],
        ['leftUpLeg', b.leftUpLeg],
        ['leftLeg', b.leftLeg],
        ['rightUpLeg', b.rightUpLeg],
        ['rightLeg', b.rightLeg],
      ];

      if (p < 0.36) {
        const t1 = p / 0.36;
        const ease1 = t1 * t1 * (3 - 2 * t1);
        for (const [k, obj] of boneMap) {
          const s = this.deathStartQuats.get(k);
          const m = this.deathMidQuats.get(k);
          if (obj && s && m) obj.quaternion.copy(s).slerp(m, ease1);
        }
        if (b.hips) {
          b.hips.position.copy(this.deathStartHipsPos);
          b.hips.position.z = THREE.MathUtils.lerp(this.deathStartHipsPos.z, 62, ease1);
        }
      } else {
        const t2 = Math.min(1, (p - 0.36) / 0.52);
        const ease2 = 1 - Math.pow(1 - t2, 2.5);
        for (const [k, obj] of boneMap) {
          const m = this.deathMidQuats.get(k);
          const e = this.deathTargetQuats.get(k);
          if (obj && m && e) obj.quaternion.copy(m).slerp(e, ease2);
        }
        if (b.hips) {
          const settleBounce = p > 0.88 ? Math.sin(((p - 0.88) / 0.12) * Math.PI) * 3.8 : 0;
          b.hips.position.copy(this.deathStartHipsPos);
          b.hips.position.z = THREE.MathUtils.lerp(62, 18.5, ease2) + settleBounce;
        }
      }

      this.enforceRagdollFloorContact();
    }
  }

  private enforceRagdollFloorContact(): void {
    const b = this.rig.skBones;
    if (!b) return;
    const floorY = this.pos.y;
    this.rig.root.updateMatrixWorld(true);

    if (b.hips) {
      let minDrop = 0;
      const bodyNodes: Array<[THREE.Object3D | undefined, number]> = [
        [b.head, floorY + 0.135],
        [b.spine2, floorY + 0.13],
      ];
      for (const [node, minY] of bodyNodes) {
        if (!node) continue;
        node.getWorldPosition(this.ikRightTarget);
        if (this.ikRightTarget.y < minY) minDrop = Math.max(minDrop, minY - this.ikRightTarget.y);
      }
      if (minDrop > 0.001) {
        b.hips.position.z += minDrop * 100;
        this.rig.root.updateMatrixWorld(true);
      }
    }

    if (b.rightArm && b.rightForeArm && b.rightHand) {
      b.rightHand.getWorldPosition(this.ikRightTarget);
      b.rightForeArm.getWorldPosition(this.ikRightPole);
      const minY = floorY + 0.095;
      if (this.ikRightTarget.y < minY || this.ikRightPole.y < minY) {
        this.ikRightTarget.y = Math.max(this.ikRightTarget.y, minY);
        this.ikRightPole.y = Math.max(this.ikRightPole.y, minY) + 0.25;
        solveTwoBoneArmIK(b.rightArm, b.rightForeArm, b.rightHand, this.ikRightTarget, this.ikRightPole, 1.0);
        b.rightHand.quaternion.set(0, 0, 0, 1);
      }
    }

    if (b.leftArm && b.leftForeArm && b.leftHand) {
      b.leftHand.getWorldPosition(this.ikLeftTarget);
      b.leftForeArm.getWorldPosition(this.ikLeftPole);
      const minY = floorY + 0.095;
      if (this.ikLeftTarget.y < minY || this.ikLeftPole.y < minY) {
        this.ikLeftTarget.y = Math.max(this.ikLeftTarget.y, minY);
        this.ikLeftPole.y = Math.max(this.ikLeftPole.y, minY) + 0.25;
        solveTwoBoneArmIK(b.leftArm, b.leftForeArm, b.leftHand, this.ikLeftTarget, this.ikLeftPole, 1.0);
        b.leftHand.quaternion.set(0, 0, 0, 1);
      }
    }
  }
}
