import * as THREE from 'three';
import { AABB, Difficulty, SmokeCloud, Team, Waypoint } from '../types';
import { TextureLibrary } from '../textures/ProceduralTextures';
import { AgentRig, AgentVisualStyle, buildAgentRig, solveTwoBoneArmIK } from './AgentModel';

export interface AgentFireEvent {
  attackerId: string;
  attackerName: string;
  attackerTeam: Team;
  muzzleWorld: THREE.Vector3;
  targetPoint: THREE.Vector3;
  direction: THREE.Vector3;
  damage: number;
}

export class TacticalAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly team: Team;
  public readonly style: AgentVisualStyle;
  public readonly rig: AgentRig;

  public pos = new THREE.Vector3();
  public yaw = 0;
  public hp = 100;
  public maxHp = 100;
  public alive = true;

  public spottedTimer = 0;
  public blindTimer = 0;
  public crouchAmount = 0;

  // Navigation & combat state
  private path: Waypoint[] = [];
  private pathIdx = 0;
  private repathTimer = 0;
  private stuckTimer = 0;
  private slideDir = 1;
  private strafeDir = 1;
  private strafeTimer = 0;
  private reactionTimer = 0;
  private fireCooldown = 0;
  private burstLeft = 0;
  private burstPause = 0;
  private muzzleFlashTimer = 0;
  private hitFlashTimer = 0;
  private deathAnim = 0;
  private smoothSpeed = 0;
  private smoothStrafe = 0;
  private ikRightTarget = new THREE.Vector3();
  private ikLeftTarget = new THREE.Vector3();
  private ikRightPole = new THREE.Vector3();
  private ikLeftPole = new THREE.Vector3();
  private killImpulse = new THREE.Vector3();
  private killPitchSign = -1;
  private killRollTarget = 0.25;
  private killYawTwist = 0.2;
  private killSlideDist = 0.45;
  private killHeadshot = false;
  private deathVariant = 0;
  private deathStartHipsPos = new THREE.Vector3();
  private deathStartQuats = new Map<string, THREE.Quaternion>();
  private deathTargetQuats = new Map<string, THREE.Quaternion>();
  private deathMidQuats = new Map<string, THREE.Quaternion>();
  private walkPhase = Math.random() * Math.PI * 2;
  private idlePhase = Math.random() * Math.PI * 2;
  private recoilKick = 0;
  private openingHoldTimer = 0;
  private visionTimer = Math.random() * 0.1;
  private cachedTargetPos: THREE.Vector3 | null = null;
  private cachedTargetAim: THREE.Vector3 | null = null;
  private cachedTargetDist = Infinity;

  constructor(
    id: string,
    name: string,
    team: Team,
    style: AgentVisualStyle,
    spawnPos: THREE.Vector3,
    spawnYaw: number,
    scene: THREE.Scene,
    textures?: TextureLibrary
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.style = style;
    this.rig = buildAgentRig(id, team, style, textures);
    scene.add(this.rig.root);

    this.respawn(spawnPos, spawnYaw);
  }

  public respawn(spawnPos: THREE.Vector3, spawnYaw: number, holdOpening = 0): void {
    this.pos.copy(spawnPos);
    this.yaw = spawnYaw;
    this.hp = this.style === 'sentinel' ? 120 : 100;
    this.maxHp = this.hp;
    this.alive = true;
    this.spottedTimer = 0;
    this.blindTimer = 0;
    this.crouchAmount = 0;
    this.path = [];
    this.pathIdx = 0;
    this.repathTimer = 0.2 + Math.random() * 0.4;
    this.stuckTimer = 0;
    this.slideDir = Math.random() > 0.5 ? 1 : -1;
    this.reactionTimer = 0.25;
    this.fireCooldown = 0.2;
    this.burstLeft = 3;
    this.burstPause = 0;
    this.muzzleFlashTimer = 0;
    this.hitFlashTimer = 0;
    this.deathAnim = 0;
    this.killImpulse.set(0, 0, 0);
    this.openingHoldTimer = holdOpening;
    this.visionTimer = Math.random() * 0.08;
    this.cachedTargetPos = null;
    this.cachedTargetAim = null;
    this.cachedTargetDist = Infinity;

    this.rig.root.visible = true;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.yaw, 0);
    this.rig.modelPivot.position.set(0, 0, 0);
    this.rig.modelPivot.rotation.set(0, 0, 0);
    this.rig.modelPivot.scale.set(1, 1, 1);
    this.rig.weaponPivot.visible = true;

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
      this.rig.weaponPivot.position.set(-0.145, 1.3, 0.17);
      this.rig.weaponPivot.rotation.set(0.02, 0.06, 0);
      this.applySkinnedArmIK();
    } else {
      this.rig.hips.position.set(0, 0.94, 0);
      this.rig.hips.rotation.set(0, 0, 0);
      this.rig.torso.rotation.set(0, 0, 0);
      this.rig.headGroup.rotation.set(0, 0, 0);
      this.rig.leftLeg.rotation.set(0, 0, 0);
      this.rig.rightLeg.rotation.set(0, 0, 0);
      this.rig.leftKnee.rotation.set(0, 0, 0);
      this.rig.rightKnee.rotation.set(0, 0, 0);
      this.rig.leftFoot.rotation.set(0, 0, 0);
      this.rig.rightFoot.rotation.set(0, 0, 0);
      this.rig.weaponPivot.position.set(-0.14, 0.35, 0.08);
      this.rig.weaponPivot.rotation.set(0, 0, 0);
    }
    this.rig.blindHalo.visible = false;
    this.rig.muzzleFlash.visible = false;
    this.recoilKick = 0;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
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

  public applyBlind(duration: number): void {
    if (!this.alive) return;
    this.blindTimer = Math.max(this.blindTimer, duration);
  }

  public takeDamage(amount: number, impulseDir?: THREE.Vector3, headshot = false): { killed: boolean } {
    if (!this.alive) return { killed: false };
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.14;
    // React immediately when shot
    this.reactionTimer = Math.min(this.reactionTimer, 0.08);
    this.openingHoldTimer = 0;

    if (this.hp <= 0) {
      this.alive = false;
      this.rig.blindHalo.visible = false;
      this.rig.muzzleFlash.visible = false;
      this.rig.weaponPivot.visible = false; // Physical dropped AKM replaces held rifle!

      // Compute natural directional impulse & capture live skeletal bone poses for seamless ragdoll collapse!
      this.killHeadshot = headshot;
      this.deathVariant = Math.floor(Math.random() * 3);
      if (impulseDir) {
        this.killImpulse.set(impulseDir.x, 0, impulseDir.z);
        if (this.killImpulse.lengthSq() > 0.001) this.killImpulse.normalize();
        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        const dot = this.killImpulse.x * fwdX + this.killImpulse.z * fwdZ;
        // Shot from front -> crumple onto back (-1); shot from behind -> crumple forward (+1)
        this.killPitchSign = dot > 0.3 ? 1 : -1;
        this.killRollTarget = (Math.random() > 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.28);
        this.killYawTwist = (Math.random() - 0.5) * 0.55;
        this.killSlideDist = headshot ? 0.58 : 0.34;
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
      return { killed: true };
    }
    return { killed: false };
  }

  /**
   * Captures current Mixamo bone transforms and computes organic 2-stage human death poses
   * (Stage 1: hit stagger + knee buckle; Stage 2: weighted hip-centered floor sprawl with splayed limbs)
   * so soldiers NEVER fall stiffly like a plank or robot!
   */
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
    if (b.hips) {
      this.deathStartHipsPos.copy(b.hips.position);
    }

    const qEuler = (x: number, y: number, z: number) =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));

    const fallBack = this.killPitchSign < 0;
    const mirror = this.killRollTarget >= 0 ? 1 : -1;
    const v = this.deathVariant;

    // --- HIPS (Center of mass pivot in Character Z-up space!) ---
    const startHipsQ = this.deathStartQuats.get('hips') ?? new THREE.Quaternion(0, 0.707, 0.707, 0);
    // Stage 1: slight hit lean while knees buckle under
    const midTip = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      fallBack ? 0.34 : -0.42
    );
    const midRoll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.killRollTarget * 0.45
    );
    this.deathMidQuats.set('hips', midRoll.multiply(midTip).multiply(startHipsQ.clone()));

    // Stage 2: relaxed floor contact (back or front/side) with natural yaw & shoulder roll
    const endTip = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      fallBack ? 1.52 : -1.48
    );
    const endRoll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.killRollTarget
    );
    const endTwist = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      this.killYawTwist
    );
    this.deathTargetQuats.set('hips', endTwist.multiply(endRoll).multiply(endTip).multiply(startHipsQ.clone()));

    // --- SPINE & HEAD (Whip-back on headshot / curl & relax on floor) ---
    const hsExtra = this.killHeadshot ? -0.35 : 0;
    this.deathMidQuats.set('spine', qEuler(fallBack ? -0.18 : 0.32, 0.08 * mirror, 0.06 * mirror));
    this.deathMidQuats.set('spine1', qEuler(fallBack ? -0.24 : 0.36, 0.1 * mirror, 0.08 * mirror));
    this.deathMidQuats.set('spine2', qEuler(fallBack ? -0.16 : 0.24, 0, 0.05 * mirror));
    this.deathMidQuats.set('head', qEuler((fallBack ? -0.46 : 0.32) + hsExtra, 0.24 * mirror, 0.12 * mirror));

    this.deathTargetQuats.set('spine', qEuler(fallBack ? 0.06 : 0.14, 0.14 * mirror, 0.08 * mirror));
    this.deathTargetQuats.set('spine1', qEuler(fallBack ? 0.08 : 0.16, 0.18 * mirror, 0.1 * mirror));
    this.deathTargetQuats.set('spine2', qEuler(fallBack ? 0.04 : 0.1, 0.08 * mirror, 0.06 * mirror));
    this.deathTargetQuats.set('head', qEuler(fallBack ? -0.18 : 0.22, 0.52 * mirror, 0.26 * mirror));

    // --- LEGS & KNEES (Buckle deeply FIRST in Stage 1, then relax asymmetrically on ground in Stage 2!) ---
    // Mixamo UpLeg rest is ~180° around X (Math.PI). Smaller X swings thigh forward; +X on Leg bends knee backward!
    this.deathMidQuats.set('leftUpLeg', qEuler(Math.PI - (fallBack ? 0.52 : 0.72), 0.08, -0.14));
    this.deathMidQuats.set('rightUpLeg', qEuler(Math.PI - (fallBack ? 0.42 : 0.62), -0.08, 0.14));
    this.deathMidQuats.set('leftLeg', qEuler(fallBack ? 1.38 : 1.58, 0, 0));
    this.deathMidQuats.set('rightLeg', qEuler(fallBack ? 1.18 : 1.35, 0, 0));

    if (fallBack) {
      // Relaxed asymmetrical supine sprawl: one knee slightly bent, other mostly extended & splayed out
      const bentLeft = v !== 1;
      this.deathTargetQuats.set(
        'leftUpLeg',
        qEuler(Math.PI - (bentLeft ? 0.42 : 0.08), 0.18, bentLeft ? -0.22 : -0.16)
      );
      this.deathTargetQuats.set(
        'rightUpLeg',
        qEuler(Math.PI - (bentLeft ? 0.1 : 0.38), -0.18, bentLeft ? 0.16 : 0.24)
      );
      this.deathTargetQuats.set('leftLeg', qEuler(bentLeft ? 0.76 : 0.22, 0, 0));
      this.deathTargetQuats.set('rightLeg', qEuler(bentLeft ? 0.2 : 0.68, 0, 0));
    } else {
      // Prone/side crumple: legs relaxed behind body, slightly splayed with soft knee curl
      this.deathTargetQuats.set('leftUpLeg', qEuler(Math.PI - 0.14, 0.1, -0.2));
      this.deathTargetQuats.set('rightUpLeg', qEuler(Math.PI - 0.28, -0.12, 0.18));
      this.deathTargetQuats.set('leftLeg', qEuler(0.32, 0, 0));
      this.deathTargetQuats.set('rightLeg', qEuler(0.58, 0, 0));
    }

    // --- ARMS & ELBOWS (Release AKM & fling open during Stage 1, then drape naturally on ground in Stage 2!) ---
    // Near-zero Z spreads arms wide; +Z brings arms toward hips; LeftForeArm bends on -X, RightForeArm on +X!
    this.deathMidQuats.set('leftArm', qEuler(-0.32, 0.18, 0.12));
    this.deathMidQuats.set('rightArm', qEuler(0.32, -0.18, 0.14));
    this.deathMidQuats.set('leftForeArm', qEuler(-0.78, 0, 0));
    this.deathMidQuats.set('rightForeArm', qEuler(0.72, 0, 0));

    if (v === 0) {
      // Wide dramatic sprawl (one arm flung out, other bent loosely near torso)
      this.deathTargetQuats.set('leftArm', qEuler(fallBack ? 0.18 : -0.25, 0.25, 0.22));
      this.deathTargetQuats.set('rightArm', qEuler(fallBack ? -0.15 : 0.28, -0.14, 0.42));
      this.deathTargetQuats.set('leftForeArm', qEuler(-0.42, 0, 0));
      this.deathTargetQuats.set('rightForeArm', qEuler(0.85, 0, 0));
    } else if (v === 1) {
      // Opposite asymmetry (right arm flung wide above shoulder, left arm relaxed by side)
      this.deathTargetQuats.set('leftArm', qEuler(fallBack ? 0.12 : -0.2, 0.12, 0.46));
      this.deathTargetQuats.set('rightArm', qEuler(fallBack ? -0.24 : 0.22, -0.28, 0.14));
      this.deathTargetQuats.set('leftForeArm', qEuler(-0.88, 0, 0));
      this.deathTargetQuats.set('rightForeArm', qEuler(0.36, 0, 0));
    } else {
      // Heavy Ragdoll collapse (both arms loose & splayed outward)
      this.deathTargetQuats.set('leftArm', qEuler(fallBack ? 0.22 : -0.32, 0.2, 0.28));
      this.deathTargetQuats.set('rightArm', qEuler(fallBack ? -0.2 : 0.3, -0.22, 0.28));
      this.deathTargetQuats.set('leftForeArm', qEuler(-0.55, 0, 0));
      this.deathTargetQuats.set('rightForeArm', qEuler(0.52, 0, 0));
    }
  }

  public update(
    dt: number,
    allAgents: TacticalAgent[],
    playerPos: THREE.Vector3,
    playerEye: THREE.Vector3,
    playerAlive: boolean,
    waypoints: Waypoint[],
    colliders: AABB[],
    levelMeshes: THREE.Object3D[],
    smokes: SmokeCloud[],
    difficulty: Difficulty,
    roundActive: boolean,
    onFire: (ev: AgentFireEvent) => void
  ): void {
    // Hit damage flash tint decay
    const baseEmissive = this.rig.isSkinned ? 0.25 : 0.09;
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const boost = this.hitFlashTimer > 0 ? 0.92 : baseEmissive;
      for (const m of this.rig.flashMaterials) {
        m.emissiveIntensity = boost;
      }
    }

    // Muzzle flash timer
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) this.rig.muzzleFlash.visible = false;
    }

    if (!this.alive) {
      // Multi-stage articulated Mixamo ragdoll collapse (Stage 1: knee-buckle stagger -> Stage 2: heavy hip-drop sprawl -> Stage 3: floor settle!)
      this.deathAnim = Math.min(1, this.deathAnim + dt * 1.65);
      const t = this.deathAnim;

      if (this.rig.isSkinned && this.rig.skBones) {
        const b = this.rig.skBones;
        // Reset crouch scale gently so limbs don't squash unnaturally on the floor
        this.rig.modelPivot.scale.y = THREE.MathUtils.lerp(this.rig.modelPivot.scale.y, 1.0, Math.min(1, dt * 8));
        this.rig.modelPivot.rotation.set(0, 0, 0);
        this.rig.modelPivot.position.set(0, 0, 0);

        // Two-phase C1-continuous bone blending: 0..0.36 hits Stage 1 (stagger + knee buckle), 0.36..0.88 drops to Stage 2 (floor sprawl), 0.88..1.0 settles!
        const p1 = Math.min(1, t / 0.36);
        const e1 = p1 * p1 * (3 - 2 * p1); // smooth ease-in-out hit buckle
        const p2 = THREE.MathUtils.clamp((t - 0.36) / 0.52, 0, 1);
        const e2 = p2 * p2 * (3 - 2 * p2); // smooth gravity fall & floor sprawl

        const blendBone = (key: string, obj?: THREE.Object3D) => {
          if (!obj) return;
          const qStart = this.deathStartQuats.get(key);
          const qMid = this.deathMidQuats.get(key);
          const qEnd = this.deathTargetQuats.get(key);
          if (!qStart || !qMid || !qEnd) return;
          if (t < 0.36) {
            obj.quaternion.copy(qStart).slerp(qMid, e1);
          } else {
            obj.quaternion.copy(qMid).slerp(qEnd, e2);
          }
        };

        blendBone('hips', b.hips);
        blendBone('spine', b.spine);
        blendBone('spine1', b.spine1);
        blendBone('spine2', b.spine2);
        blendBone('head', b.head);
        blendBone('leftArm', b.leftArm);
        blendBone('leftForeArm', b.leftForeArm);
        blendBone('rightArm', b.rightArm);
        blendBone('rightForeArm', b.rightForeArm);
        blendBone('leftUpLeg', b.leftUpLeg);
        blendBone('leftLeg', b.leftLeg);
        blendBone('rightUpLeg', b.rightUpLeg);
        blendBone('rightLeg', b.rightLeg);

        // Drop Hips smoothly from standing (~96 cm) -> knee-buckle (~52 cm) -> floor contact (~17 cm) + soft thud settle!
        if (b.hips) {
          const dropPhase = t < 0.85 ? Math.pow(t / 0.85, 1.45) : 1.0;
          const bounceCm = t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * 3.4 : 0;
          const targetFloorZ = 17.5;
          b.hips.position.set(
            this.deathStartHipsPos.x,
            this.deathStartHipsPos.y,
            THREE.MathUtils.lerp(this.deathStartHipsPos.z, targetFloorZ, dropPhase) + bounceCm
          );
        }

        // Subtle momentum slide along bullet impact vector during the drop
        const slideEase = 1 - Math.pow(1 - Math.min(1, t / 0.88), 2.2);
        this.rig.root.position.set(
          this.pos.x + this.killImpulse.x * slideEase * this.killSlideDist,
          this.pos.y,
          this.pos.z + this.killImpulse.z * slideEase * this.killSlideDist
        );

        // Hard world-space floor contact clamp so hands, forearms & head NEVER sink inside the ground!
        this.enforceRagdollFloorContact();
      } else {
        const ease = 1 - (1 - t) * (1 - t);
        this.rig.hips.position.y = THREE.MathUtils.lerp(0.94, 0.22, ease);
        this.rig.leftKnee.rotation.x = ease * 1.15;
        this.rig.rightKnee.rotation.x = ease * 1.35;
        this.rig.leftLeg.rotation.x = -ease * 0.45;
        this.rig.rightLeg.rotation.x = ease * 0.25;
        this.rig.torso.rotation.x = -ease * 1.25;
        this.rig.torso.rotation.z = ease * 0.35;
        this.rig.root.rotation.x = -ease * 0.28;
        this.rig.weaponPivot.rotation.x = ease * 0.7;
      }
      return;
    }

    if (this.spottedTimer > 0) this.spottedTimer = Math.max(0, this.spottedTimer - dt);
    if (this.openingHoldTimer > 0) this.openingHoldTimer = Math.max(0, this.openingHoldTimer - dt);

    // Blind state animation
    if (this.blindTimer > 0) {
      this.blindTimer = Math.max(0, this.blindTimer - dt);
      this.rig.blindHalo.visible = true;
      this.rig.blindHalo.rotation.z += dt * 7;
      this.rig.headGroup.rotation.y = Math.sin(performance.now() * 0.015) * 0.45;
      this.updatePose(dt, 0, 0, true);
      return;
    } else {
      this.rig.blindHalo.visible = false;
      this.rig.headGroup.rotation.y = 0;
    }

    if (!roundActive) {
      // Crisp upright two-handed aiming stance during pre-round / showcase
      this.rig.root.position.copy(this.pos);
      this.rig.root.rotation.set(0, this.yaw, 0);
      this.updatePose(dt, 0, 0, false);
      return;
    }

    // Difficulty parameters
    const diffCfg =
      difficulty === 'casual'
        ? { react: 0.48, spread: 0.085, dmg: 13, speed: 3.1 }
        : difficulty === 'radiant'
        ? { react: 0.18, spread: 0.032, dmg: 22, speed: 4.15 }
        : { react: 0.31, spread: 0.055, dmg: 17, speed: 3.65 };

    // 1. Throttled 10 Hz staggered LOS vision check (cuts CPU raycasts by ~85% for steady 60 FPS!)
    this.visionTimer -= dt;
    if (this.visionTimer <= 0) {
      this.visionTimer = 0.095 + Math.random() * 0.03;
      const myEye = this.getEyePosition();
      let foundPos: THREE.Vector3 | null = null;
      let foundAim: THREE.Vector3 | null = null;
      let foundDist = Infinity;

      if (this.team === 'enemy' && playerAlive) {
        const dist = myEye.distanceTo(playerEye);
        if (dist < 42 && hasClearSight(myEye, playerEye, levelMeshes, smokes)) {
          foundDist = dist;
          foundPos = playerPos.clone();
          foundAim = playerEye.clone().add(new THREE.Vector3(0, -0.22, 0));
        }
      }

      for (const other of allAgents) {
        if (!other.alive || other.team === this.team) continue;
        const otherEye = other.getEyePosition();
        const dist = myEye.distanceTo(otherEye);
        if (dist < foundDist && dist < 40 && hasClearSight(myEye, otherEye, levelMeshes, smokes)) {
          foundDist = dist;
          foundPos = other.pos.clone();
          foundAim = otherEye.clone().add(new THREE.Vector3(0, -0.22, 0));
        }
      }

      this.cachedTargetPos = foundPos;
      this.cachedTargetAim = foundAim;
      this.cachedTargetDist = foundDist;
    }

    const targetPos = this.cachedTargetPos;
    const targetAim = this.cachedTargetAim;
    const bestDist = this.cachedTargetDist;

    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    let wantCrouch = false;

    if (targetPos && targetAim) {
      // ===== COMBAT ENGAGEMENT =====
      const toTarget = new THREE.Vector3().subVectors(targetPos, this.pos);
      const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
      this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 10));

      // Tactical combat behavior: Ember/Striker crouch-shoots; Duelists push forward diagonally at range & jiggle-strafe up close!
      if (this.style === 'ember' || this.style === 'striker' || this.openingHoldTimer > 0) {
        wantCrouch = true;
      } else if (this.style === 'duelist') {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 0.65 + Math.random() * 0.75;
          this.strafeDir = -this.strafeDir;
        }
        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        const rightX = Math.cos(this.yaw) * this.strafeDir;
        const rightZ = -Math.sin(this.yaw) * this.strafeDir;
        // Actively close distance when engaging from afar (> 8.5m) instead of shuffling endlessly at spawn!
        const pushWeight = bestDist > 8.5 ? 0.72 : bestDist < 4.5 ? -0.35 : 0.0;
        const strafeWeight = bestDist > 8.5 ? 0.56 : 0.72;
        const mx = fwdX * pushWeight + rightX * strafeWeight;
        const mz = fwdZ * pushWeight + rightZ * strafeWeight;
        const mLen = Math.hypot(mx, mz) || 1;
        const stepSpeed = diffCfg.speed * (bestDist > 8.5 ? 0.88 : 0.64);
        const beforeX = this.pos.x;
        const beforeZ = this.pos.z;
        this.moveWithCollision((mx / mLen) * stepSpeed * dt, (mz / mLen) * stepSpeed * dt, colliders);
        // If strafe hits a wall or crate, flip strafe side immediately so we slide cleanly past cover!
        if (Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ) < stepSpeed * dt * 0.25) {
          this.strafeDir = -this.strafeDir;
          this.strafeTimer = 0.55;
          this.moveWithCollision(
            (-rightX * 0.85 + fwdX * 0.45) * stepSpeed * dt,
            (-rightZ * 0.85 + fwdZ * 0.45) * stepSpeed * dt,
            colliders
          );
        }
      } else {
        // Sentinel holds ground firmly & crouches slightly
        wantCrouch = bestDist > 10;
      }

      // Reaction & rhythmic burst fire (authentic Valorant bursts, not unfair laser beam!)
      if (this.reactionTimer > 0) {
        this.reactionTimer -= dt;
      } else {
        if (this.burstPause > 0) {
          this.burstPause -= dt;
        } else {
          this.fireCooldown -= dt;
          if (this.fireCooldown <= 0) {
            this.fireCooldown = 0.145;
            this.burstLeft -= 1;
            if (this.burstLeft <= 0) {
              this.burstLeft = 2 + Math.floor(Math.random() * 3);
              this.burstPause = 0.55 + Math.random() * 0.45;
            }

            // Fire bullet with realistic spread
            const muzzleWorld = new THREE.Vector3();
            this.rig.muzzlePoint.getWorldPosition(muzzleWorld);
            const aimDir = new THREE.Vector3().subVectors(targetAim, muzzleWorld).normalize();
            const spread = diffCfg.spread * (wantCrouch ? 0.78 : 1.0);
            aimDir.x += (Math.random() - 0.5) * spread;
            aimDir.y += (Math.random() - 0.5) * spread * 0.75;
            aimDir.z += (Math.random() - 0.5) * spread;
            aimDir.normalize();

            this.rig.muzzleFlash.visible = true;
            this.rig.muzzleFlash.rotation.z = Math.random() * Math.PI;
            this.muzzleFlashTimer = 0.036;
            this.recoilKick = 1.0;

            onFire({
              attackerId: this.id,
              attackerName: this.name,
              attackerTeam: this.team,
              muzzleWorld,
              targetPoint: targetAim.clone(),
              direction: aimDir,
              damage: this.team === 'ally' ? 24 : diffCfg.dmg,
            });
          }
        }
      }
    } else {
      // ===== TACTICAL PATROL / PUSH VIA WAYPOINT NAVGRAPH =====
      this.reactionTimer = diffCfg.react;

      // Opening hold keeps Ember crouching left & Zephyr framing doorway briefly at round start
      if (this.openingHoldTimer > 0) {
        wantCrouch = this.style === 'ember';
      } else {
        this.repathTimer -= dt;
        if (this.repathTimer <= 0 || this.pathIdx >= this.path.length) {
          this.repathTimer = 2.6 + Math.random() * 2.0;
          const goalPos = this.pickTacticalGoal(allAgents, playerPos, playerAlive, waypoints);
          this.path = computeWaypointPath(this.pos, goalPos, waypoints, colliders);
          this.pathIdx = 0;
        }

        if (this.pathIdx < this.path.length) {
          const wp = this.path[this.pathIdx];
          const dx = wp.pos.x - this.pos.x;
          const dz = wp.pos.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.85) {
            this.pathIdx += 1;
            this.stuckTimer = 0;
          } else {
            const nx = dx / dist;
            const nz = dz / dist;
            const spd = diffCfg.speed * (this.style === 'duelist' ? 1.12 : 0.94);
            const beforeX = this.pos.x;
            const beforeZ = this.pos.z;
            this.moveWithCollision(nx * spd * dt, nz * spd * dt, colliders);

            // Real obstacle-sliding & unstuck recovery so bots NEVER snag on crates, barrels, or container corners!
            const moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
            if (moved < spd * dt * 0.28) {
              this.stuckTimer += dt;
              // Slide tangentially around the obstacle edge
              const sideX = -nz * this.slideDir;
              const sideZ = nx * this.slideDir;
              this.moveWithCollision(
                (sideX * 0.85 + nx * 0.3) * spd * dt,
                (sideZ * 0.85 + nz * 0.3) * spd * dt,
                colliders
              );
              if (this.stuckTimer > 0.42) {
                this.slideDir = -this.slideDir;
                this.stuckTimer = 0;
                this.pathIdx += 1;
                if (this.pathIdx >= this.path.length) {
                  this.repathTimer = 0;
                }
              }
            } else {
              this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
            }

            const desiredYaw = Math.atan2(nx, nz);
            this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 8));
          }
        }
      }
    }

    // Measure actual post-collision velocity in agent-local space (prevents running in place & enables real strafe blending!)
    const invDt = dt > 1e-4 ? 1 / dt : 0;
    const vx = (this.pos.x - prevX) * invDt;
    const vz = (this.pos.z - prevZ) * invDt;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const localFwd = vx * sinY + vz * cosY; // Forward (+Z in local space)
    const localLeft = vx * cosY - vz * sinY; // Left (+X in local space)

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.yaw, 0);
    this.updatePose(dt, localFwd, localLeft, wantCrouch);
  }

  private pickTacticalGoal(
    allAgents: TacticalAgent[],
    playerPos: THREE.Vector3,
    playerAlive: boolean,
    waypoints: Waypoint[]
  ): THREE.Vector3 {
    if (this.team === 'ally') {
      // Ally pushes aggressively toward nearest living enemy or courtyard flank!
      let nearest: TacticalAgent | null = null;
      let dMin = Infinity;
      for (const a of allAgents) {
        if (a.alive && a.team === 'enemy') {
          const d = this.pos.distanceTo(a.pos);
          if (d < dMin) {
            dMin = d;
            nearest = a;
          }
        }
      }
      if (nearest) return nearest.pos.clone();
      return waypoints[6].pos.clone(); // Mid archway
    }

    // Enemy tactical routing: some push flanks, others hunt player
    if (playerAlive && Math.random() < 0.65) {
      return playerPos.clone();
    }
    const tacticalNodes = [2, 4, 5, 6, 7, 8, 9, 14, 18].filter((idx) => idx < waypoints.length);
    const pick = tacticalNodes[Math.floor(Math.random() * tacticalNodes.length)] ?? 0;
    return waypoints[pick].pos.clone();
  }

  private moveWithCollision(dx: number, dz: number, colliders: AABB[]): void {
    const r = 0.44;
    const h = 1.75;

    this.pos.x += dx;
    for (const b of colliders) {
      if (
        this.pos.x + r > b.minX &&
        this.pos.x - r < b.maxX &&
        this.pos.z + r > b.minZ &&
        this.pos.z - r < b.maxZ &&
        this.pos.y + h > b.minY &&
        this.pos.y < b.maxY
      ) {
        if (dx > 0) this.pos.x = b.minX - r - 0.002;
        else if (dx < 0) this.pos.x = b.maxX + r + 0.002;
      }
    }

    this.pos.z += dz;
    for (const b of colliders) {
      if (
        this.pos.x + r > b.minX &&
        this.pos.x - r < b.maxX &&
        this.pos.z + r > b.minZ &&
        this.pos.z - r < b.maxZ &&
        this.pos.y + h > b.minY &&
        this.pos.y < b.maxY
      ) {
        if (dz > 0) this.pos.z = b.minZ - r - 0.002;
        else if (dz < 0) this.pos.z = b.maxZ + r + 0.002;
      }
    }

    // Multi-pass minimum-penetration horizontal depenetration so bots never clip into walls/corners!
    for (let pass = 0; pass < 2; pass++) {
      let pushed = false;
      for (const b of colliders) {
        if (
          this.pos.x + r > b.minX &&
          this.pos.x - r < b.maxX &&
          this.pos.z + r > b.minZ &&
          this.pos.z - r < b.maxZ &&
          this.pos.y + h > b.minY &&
          this.pos.y < b.maxY
        ) {
          const penL = this.pos.x + r - b.minX;
          const penR = b.maxX - (this.pos.x - r);
          const penB = this.pos.z + r - b.minZ;
          const penF = b.maxZ - (this.pos.z - r);
          const minP = Math.min(penL, penR, penB, penF);
          if (minP === penL) this.pos.x = b.minX - r - 0.002;
          else if (minP === penR) this.pos.x = b.maxX + r + 0.002;
          else if (minP === penB) this.pos.z = b.minZ - r - 0.002;
          else this.pos.z = b.maxZ + r + 0.002;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  private updatePose(dt: number, localFwd: number, localLeft: number, wantCrouch: boolean): void {
    const targetCrouch = wantCrouch ? 1 : 0;
    this.crouchAmount = THREE.MathUtils.lerp(this.crouchAmount, targetCrouch, Math.min(1, dt * 11));
    this.idlePhase += dt * 2.4;
    this.recoilKick = Math.max(0, this.recoilKick - dt * 9.5);

    const smooth = Math.min(1, dt * 14);
    const breath = Math.sin(this.idlePhase) * 0.011;
    const moveSpeed = Math.hypot(localFwd, localLeft);

    if (this.rig.isSkinned && this.rig.mixer && this.rig.actions) {
      // Continuous 3-way Idle <-> Walk <-> Run skeletal weight blending (silky smooth, zero snaps!)
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

      // Subtle crouch compression & smooth athletic banking into strafes
      const crouchScaleY = THREE.MathUtils.lerp(1.0, 0.84, this.crouchAmount);
      this.rig.modelPivot.scale.set(1, crouchScaleY, 1);
      this.rig.modelPivot.rotation.z = THREE.MathUtils.clamp(-this.smoothStrafe * 0.028, -0.1, 0.1);
      this.rig.modelPivot.rotation.x = THREE.MathUtils.clamp(spd * 0.018, 0, 0.08);

      // Smoothly position shouldered AKM tucked snugly into right shoulder pocket with natural combat stride bob
      const strideBobY = Math.sin(this.idlePhase * (spd > 0.4 ? 4.0 : 1.0)) * (spd > 0.4 ? 0.015 : 0.007);
      const strideBobX = Math.cos(this.idlePhase * 2.0) * (spd > 0.4 ? 0.01 : 0.0025);
      const runCant = wRun * 0.09;
      this.rig.weaponPivot.position.set(
        -0.145 + strideBobX,
        1.3 + strideBobY - this.crouchAmount * 0.05,
        0.17 - this.recoilKick * 0.044
      );
      this.rig.weaponPivot.rotation.set(
        0.02 + runCant - this.recoilKick * 0.11,
        0.06 + wRun * 0.05,
        0
      );

      // Lock BOTH rigged Mixamo arms onto the AKM pistol grip & wooden handguard via 2-bone analytical IK!
      this.applySkinnedArmIK();
      return;
    }

    if (moveSpeed > 0.25) {
      // Biomechanical 2-bone human running/strafing stride with proper swing-recovery knee fold & upper/lower aim-blending!
      const speedNorm = Math.min(1.25, moveSpeed / 3.6);
      this.walkPhase += dt * moveSpeed * 2.55;

      // Turn lower body smoothly toward velocity vector when strafing; torso counter-rotates to keep rifle aimed at target
      const rawMoveAngle = Math.atan2(localLeft, Math.max(0.25, Math.abs(localFwd)));
      const lowerYawOffset = THREE.MathUtils.clamp(rawMoveAngle * 0.65, -0.68, 0.68);
      const strideSign = localFwd < -0.25 ? -1 : 1;

      const phaseL = this.walkPhase * strideSign;
      const phaseR = phaseL + Math.PI;

      // Three.js +X axis: negative hip = thigh forward (+Z); positive knee = shin bent backward (-Z)
      const hipL = -Math.sin(phaseL) * 0.6 * speedNorm - this.crouchAmount * 0.35;
      const hipR = -Math.sin(phaseR) * 0.6 * speedNorm - this.crouchAmount * 0.35;

      // Peak knee fold during swing recovery (phase ≈ 7π/4 -> sin(phase + 2.35) = +1) + soft mid-stance absorption
      const kneeL =
        (0.14 + Math.max(0, Math.sin(phaseL + 2.35)) * 0.96 + Math.max(0, -Math.cos(phaseL)) * 0.16) * speedNorm +
        this.crouchAmount * 0.52;
      const kneeR =
        (0.14 + Math.max(0, Math.sin(phaseR + 2.35)) * 0.96 + Math.max(0, -Math.cos(phaseR)) * 0.16) * speedNorm +
        this.crouchAmount * 0.52;

      // Ankle dorsiflexion at heel strike (negative) & plantarflexion at toe-off (positive)
      const footL = -Math.sin(phaseL - 0.35) * 0.28 * speedNorm;
      const footR = -Math.sin(phaseR - 0.35) * 0.28 * speedNorm;

      this.rig.leftLeg.rotation.x = THREE.MathUtils.lerp(this.rig.leftLeg.rotation.x, hipL, smooth);
      this.rig.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rig.rightLeg.rotation.x, hipR, smooth);
      this.rig.leftKnee.rotation.x = THREE.MathUtils.lerp(this.rig.leftKnee.rotation.x, kneeL, smooth);
      this.rig.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rig.rightKnee.rotation.x, kneeR, smooth);
      this.rig.leftFoot.rotation.x = THREE.MathUtils.lerp(this.rig.leftFoot.rotation.x, footL, smooth);
      this.rig.rightFoot.rotation.x = THREE.MathUtils.lerp(this.rig.rightFoot.rotation.x, footR, smooth);

      // Vaulting stride bob: highest over vertical planted leg (cos = ±1), lowest at wide stride split (cos = 0)
      const strideBob = Math.abs(Math.cos(this.walkPhase)) * 0.048 * speedNorm;
      const baseHipY = THREE.MathUtils.lerp(0.905, 0.68, this.crouchAmount);
      this.rig.hips.position.y = THREE.MathUtils.lerp(this.rig.hips.position.y, baseHipY + strideBob, smooth);

      // Pelvis twists with striding leg (+X left hip moves forward on negative yaw) + strafe heading blend
      const strideYaw = -Math.sin(phaseL) * 0.11 * speedNorm;
      this.rig.hips.rotation.y = THREE.MathUtils.lerp(this.rig.hips.rotation.y, lowerYawOffset + strideYaw, smooth);
      this.rig.hips.rotation.z = THREE.MathUtils.lerp(
        this.rig.hips.rotation.z,
        Math.cos(phaseL) * 0.036 * speedNorm,
        smooth
      );

      // Athletic forward combat lean + counter-rotating torso keeping rifle locked forward
      const leanFwd = 0.13 * speedNorm + this.crouchAmount * 0.15;
      this.rig.torso.rotation.x = THREE.MathUtils.lerp(this.rig.torso.rotation.x, leanFwd, smooth);
      this.rig.torso.rotation.y = THREE.MathUtils.lerp(
        this.rig.torso.rotation.y,
        -lowerYawOffset - strideYaw * 1.15,
        smooth
      );
      this.rig.torso.rotation.z = THREE.MathUtils.lerp(
        this.rig.torso.rotation.z,
        -Math.cos(phaseL) * 0.03 * speedNorm,
        smooth
      );

      this.rig.headGroup.rotation.x = -leanFwd * 0.65;
      this.rig.weaponPivot.rotation.x = -leanFwd * 0.85 - this.recoilKick * 0.12;
      this.rig.weaponPivot.position.z = 0.08 - this.recoilKick * 0.045;
      this.rig.weaponPivot.position.y = 0.35 + Math.cos(this.walkPhase * 2) * 0.01 * speedNorm;
    } else if (this.crouchAmount > 0.25) {
      // Grounded right-handed tactical kneeling stance (left knee forward +X, right knee tucked low -X)
      const c = this.crouchAmount;
      this.rig.hips.position.y = THREE.MathUtils.lerp(this.rig.hips.position.y, THREE.MathUtils.lerp(0.94, 0.64, c) + breath, smooth);
      this.rig.hips.rotation.y = THREE.MathUtils.lerp(this.rig.hips.rotation.y, -0.2 * c, smooth);
      this.rig.hips.rotation.z = THREE.MathUtils.lerp(this.rig.hips.rotation.z, 0, smooth);

      this.rig.leftLeg.rotation.x = THREE.MathUtils.lerp(this.rig.leftLeg.rotation.x, -0.92 * c, smooth);
      this.rig.leftKnee.rotation.x = THREE.MathUtils.lerp(this.rig.leftKnee.rotation.x, 1.12 * c, smooth);
      this.rig.leftFoot.rotation.x = THREE.MathUtils.lerp(this.rig.leftFoot.rotation.x, -0.2 * c, smooth);

      this.rig.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rig.rightLeg.rotation.x, 0.22 * c, smooth);
      this.rig.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rig.rightKnee.rotation.x, 1.24 * c, smooth);
      this.rig.rightFoot.rotation.x = THREE.MathUtils.lerp(this.rig.rightFoot.rotation.x, -0.65 * c, smooth);

      this.rig.torso.rotation.x = THREE.MathUtils.lerp(this.rig.torso.rotation.x, 0.22 * c, smooth);
      this.rig.torso.rotation.y = THREE.MathUtils.lerp(this.rig.torso.rotation.y, 0.18 * c, smooth);
      this.rig.torso.rotation.z = THREE.MathUtils.lerp(this.rig.torso.rotation.z, 0, smooth);

      this.rig.headGroup.rotation.x = -0.18 * c;
      this.rig.weaponPivot.rotation.x = -0.22 * c - this.recoilKick * 0.11;
      this.rig.weaponPivot.position.z = 0.08 - this.recoilKick * 0.045;
      this.rig.weaponPivot.position.y = 0.35 + breath;
    } else {
      // Natural right-handed combat-ready standing stance (left foot slightly forward, unlocked knees, breathing sway!)
      this.rig.hips.position.y = THREE.MathUtils.lerp(this.rig.hips.position.y, 0.93 + breath, smooth);
      this.rig.hips.rotation.y = THREE.MathUtils.lerp(this.rig.hips.rotation.y, -0.16, smooth);
      this.rig.hips.rotation.z = THREE.MathUtils.lerp(this.rig.hips.rotation.z, 0, smooth);

      this.rig.leftLeg.rotation.x = THREE.MathUtils.lerp(this.rig.leftLeg.rotation.x, -0.14, smooth);
      this.rig.leftKnee.rotation.x = THREE.MathUtils.lerp(this.rig.leftKnee.rotation.x, 0.22, smooth);
      this.rig.leftFoot.rotation.x = THREE.MathUtils.lerp(this.rig.leftFoot.rotation.x, -0.08, smooth);

      this.rig.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rig.rightLeg.rotation.x, 0.12, smooth);
      this.rig.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rig.rightKnee.rotation.x, 0.16, smooth);
      this.rig.rightFoot.rotation.x = THREE.MathUtils.lerp(this.rig.rightFoot.rotation.x, -0.22, smooth);

      this.rig.torso.rotation.x = THREE.MathUtils.lerp(this.rig.torso.rotation.x, 0.06 + breath * 0.6, smooth);
      this.rig.torso.rotation.y = THREE.MathUtils.lerp(this.rig.torso.rotation.y, 0.14, smooth);
      this.rig.torso.rotation.z = THREE.MathUtils.lerp(this.rig.torso.rotation.z, 0, smooth);

    this.rig.headGroup.rotation.x = -0.05;
      this.rig.weaponPivot.rotation.x = -0.05 - this.recoilKick * 0.12;
      this.rig.weaponPivot.position.z = 0.08 - this.recoilKick * 0.045;
      this.rig.weaponPivot.position.y = 0.35 + breath * 1.1;
    }
  }

  /**
   * Solves analytical 2-bone IK for both arms so the rigged Mixamo soldier firmly shoulders
   * and aims his AKM rifle in a natural CQB stance (tucked elbows, wrists aligned with grip & forend!).
   */
  private applySkinnedArmIK(): void {
    const bones = this.rig.skBones;
    if (!bones || !this.rig.rightGripTarget || !this.rig.leftGripTarget) return;

    // Slight natural right-handed bladed torso angle so left shoulder advances smoothly toward forend
    if (bones.spine2) {
      bones.spine2.rotation.y += 0.15;
    }

    this.rig.root.updateMatrixWorld(true);

    if (bones.rightArm && bones.rightForeArm && bones.rightHand) {
      this.rig.rightGripTarget.getWorldPosition(this.ikRightTarget);
      // Tucked CQB right elbow (down & close beside ribcage — no awkward outward chicken-wing!)
      this.ikRightPole.set(-0.36, 0.62, -0.22).applyMatrix4(this.rig.modelPivot.matrixWorld);
      solveTwoBoneArmIK(
        bones.rightArm,
        bones.rightForeArm,
        bones.rightHand,
        this.ikRightTarget,
        this.ikRightPole,
        1.0
      );
      // Keep wrist clean & neutral on pistol grip instead of unarmed Mixamo swinging twist
      bones.rightHand.quaternion.set(0, 0, 0, 1);
    }

    if (bones.leftArm && bones.leftForeArm && bones.leftHand) {
      this.rig.leftGripTarget.getWorldPosition(this.ikLeftTarget);
      // Tucked left elbow directly beneath the wooden AKM handguard!
      this.ikLeftPole.set(0.2, 0.56, 0.26).applyMatrix4(this.rig.modelPivot.matrixWorld);
      solveTwoBoneArmIK(
        bones.leftArm,
        bones.leftForeArm,
        bones.leftHand,
        this.ikLeftTarget,
        this.ikLeftPole,
        1.0
      );
      bones.leftHand.quaternion.set(0, 0, 0, 1);
    }
  }

  /**
   * Hard world-space ground-plane constraint during ragdoll death so neither hands,
   * forearms, nor head EVER clip beneath the snow/concrete floor (y = 0)!
   */
  private enforceRagdollFloorContact(): void {
    const b = this.rig.skBones;
    if (!b) return;

    this.rig.root.updateMatrixWorld(true);
    const floorY = this.pos.y;

    // 1. Ensure head & shoulders stay cleanly above floor plane
    if (b.hips) {
      let minDrop = 0;
      if (b.head) {
        b.head.getWorldPosition(this.ikRightTarget);
        if (this.ikRightTarget.y < floorY + 0.15) {
          minDrop = Math.max(minDrop, floorY + 0.15 - this.ikRightTarget.y);
        }
      }
      if (b.spine2) {
        b.spine2.getWorldPosition(this.ikRightTarget);
        if (this.ikRightTarget.y < floorY + 0.13) {
          minDrop = Math.max(minDrop, floorY + 0.13 - this.ikRightTarget.y);
        }
      }
      if (minDrop > 0.001) {
        // Character scale = 0.01 -> +100 cm per meter!
        b.hips.position.z += minDrop * 100;
        this.rig.root.updateMatrixWorld(true);
      }
    }

    // 2. Clamp right hand & elbow cleanly ON TOP of floor via analytical arm IK!
    if (b.rightArm && b.rightForeArm && b.rightHand) {
      b.rightHand.getWorldPosition(this.ikRightTarget);
      b.rightForeArm.getWorldPosition(this.ikRightPole);
      const minHandY = floorY + 0.095;
      const minElbowY = floorY + 0.095;
      if (this.ikRightTarget.y < minHandY || this.ikRightPole.y < minElbowY) {
        this.ikRightTarget.y = Math.max(this.ikRightTarget.y, minHandY);
        this.ikRightPole.y = Math.max(this.ikRightPole.y, minElbowY) + 0.25;
        solveTwoBoneArmIK(b.rightArm, b.rightForeArm, b.rightHand, this.ikRightTarget, this.ikRightPole, 1.0);
        b.rightHand.quaternion.set(0, 0, 0, 1);
      }
    }

    // 3. Clamp left hand & elbow cleanly ON TOP of floor via analytical arm IK!
    if (b.leftArm && b.leftForeArm && b.leftHand) {
      b.leftHand.getWorldPosition(this.ikLeftTarget);
      b.leftForeArm.getWorldPosition(this.ikLeftPole);
      const minHandY = floorY + 0.095;
      const minElbowY = floorY + 0.095;
      if (this.ikLeftTarget.y < minHandY || this.ikLeftPole.y < minElbowY) {
        this.ikLeftTarget.y = Math.max(this.ikLeftTarget.y, minHandY);
        this.ikLeftPole.y = Math.max(this.ikLeftPole.y, minElbowY) + 0.25;
        solveTwoBoneArmIK(b.leftArm, b.leftForeArm, b.leftHand, this.ikLeftTarget, this.ikLeftPole, 1.0);
        b.leftHand.quaternion.set(0, 0, 0, 1);
      }
    }
  }
}

const losRaycaster = new THREE.Raycaster();

export function hasClearSight(
  from: THREE.Vector3,
  to: THREE.Vector3,
  levelMeshes: THREE.Object3D[],
  smokes: SmokeCloud[]
): boolean {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.divideScalar(dist);

  // Check if a tactical smoke sphere intersects the line of sight!
  for (const s of smokes) {
    if (segmentIntersectsSphere(from, to, s.pos, s.radius * 0.88)) {
      return false;
    }
  }

  losRaycaster.set(from, dir);
  losRaycaster.near = 0.05;
  losRaycaster.far = dist - 0.15;
  const hits = losRaycaster.intersectObjects(levelMeshes, false);
  return hits.length === 0;
}

function segmentIntersectsSphere(
  a: THREE.Vector3,
  b: THREE.Vector3,
  center: THREE.Vector3,
  radius: number
): boolean {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(center, a);
  const abLenSq = ab.lengthSq();
  if (abLenSq < 1e-6) return ac.lengthSq() <= radius * radius;
  const t = THREE.MathUtils.clamp(ac.dot(ab) / abLenSq, 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  return closest.distanceToSquared(center) <= radius * radius;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Fast 2D slab check verifying whether a straight path segment clears all solid colliders (expanded by agent radius).
 */
function isSegmentClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: AABB[],
  radius = 0.34
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const b of colliders) {
    if (b.maxY < 0.25 || b.minY > 1.7) continue;
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;

    let tmin = 0;
    let tmax = 1;
    if (Math.abs(dx) < 1e-6) {
      if (ax < minX || ax > maxX) continue;
    } else {
      let tx1 = (minX - ax) / dx;
      let tx2 = (maxX - ax) / dx;
      if (tx1 > tx2) [tx1, tx2] = [tx2, tx1];
      tmin = Math.max(tmin, tx1);
      tmax = Math.min(tmax, tx2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (az < minZ || az > maxZ) continue;
    } else {
      let tz1 = (minZ - az) / dz;
      let tz2 = (maxZ - az) / dz;
      if (tz1 > tz2) [tz1, tz2] = [tz2, tz1];
      tmin = Math.max(tmin, tz1);
      tmax = Math.min(tmax, tz2);
      if (tmin > tmax) continue;
    }
    return false;
  }
  return true;
}

function computeWaypointPath(
  startPos: THREE.Vector3,
  goalPos: THREE.Vector3,
  waypoints: Waypoint[],
  colliders: AABB[]
): Waypoint[] {
  const startWp = nearestWaypoint(startPos, waypoints, colliders);
  const goalWp = nearestWaypoint(goalPos, waypoints, colliders);
  if (startWp.id === goalWp.id) return [goalWp];

  // Lightweight A* on arena navgraph
  const open = new Set<number>([startWp.id]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startWp.id, 0]]);
  const fScore = new Map<number, number>([[startWp.id, startWp.pos.distanceTo(goalWp.pos)]]);

  while (open.size > 0) {
    let current = -1;
    let lowestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = id;
      }
    }
    if (current === goalWp.id) {
      const result: Waypoint[] = [];
      let cur: number | undefined = current;
      while (cur !== undefined) {
        result.unshift(waypoints[cur]);
        cur = cameFrom.get(cur);
      }
      // Skip backtracking to startWp if the next waypoint is already directly reachable in a clear straight line!
      if (
        result.length >= 2 &&
        isSegmentClear(startPos.x, startPos.z, result[1].pos.x, result[1].pos.z, colliders, 0.34)
      ) {
        result.shift();
      }
      return result;
    }

    open.delete(current);
    const curNode = waypoints[current];
    for (const nb of curNode.neighbors) {
      const tentative = (gScore.get(current) ?? Infinity) + curNode.pos.distanceTo(waypoints[nb].pos);
      if (tentative < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, current);
        gScore.set(nb, tentative);
        fScore.set(nb, tentative + waypoints[nb].pos.distanceTo(goalWp.pos));
        open.add(nb);
      }
    }
  }

  return [goalWp];
}

function nearestWaypoint(pos: THREE.Vector3, waypoints: Waypoint[], colliders: AABB[]): Waypoint {
  let bestClear: Waypoint | null = null;
  let bestClearD = Infinity;
  let bestAny = waypoints[0];
  let bestAnyD = Infinity;
  for (const w of waypoints) {
    const d = pos.distanceToSquared(w.pos);
    if (d < bestAnyD) {
      bestAnyD = d;
      bestAny = w;
    }
    if (d < bestClearD && isSegmentClear(pos.x, pos.z, w.pos.x, w.pos.z, colliders, 0.32)) {
      bestClearD = d;
      bestClear = w;
    }
  }
  return bestClear ?? bestAny;
}
