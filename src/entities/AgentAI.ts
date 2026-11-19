import * as THREE from 'three';
import { AABB, Difficulty, SmokeCloud, Team, Waypoint } from '../types';
import { TextureLibrary } from '../textures/ProceduralTextures';
import { AgentRig, AgentVisualStyle, buildAgentRig } from './AgentModel';

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
  private strafeDir = 1;
  private strafeTimer = 0;
  private reactionTimer = 0;
  private fireCooldown = 0;
  private burstLeft = 0;
  private burstPause = 0;
  private muzzleFlashTimer = 0;
  private hitFlashTimer = 0;
  private deathAnim = 0;
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
    this.reactionTimer = 0.25;
    this.fireCooldown = 0.2;
    this.burstLeft = 3;
    this.burstPause = 0;
    this.muzzleFlashTimer = 0;
    this.hitFlashTimer = 0;
    this.deathAnim = 0;
    this.openingHoldTimer = holdOpening;
    this.visionTimer = Math.random() * 0.08;
    this.cachedTargetPos = null;
    this.cachedTargetAim = null;
    this.cachedTargetDist = Infinity;

    this.rig.root.visible = true;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.yaw, 0);
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
    this.rig.blindHalo.visible = false;
    this.rig.muzzleFlash.visible = false;
    this.recoilKick = 0;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
  }

  public getEyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    const h = THREE.MathUtils.lerp(1.67, 1.14, this.crouchAmount);
    return out.set(this.pos.x, this.pos.y + h, this.pos.z);
  }

  public applyBlind(duration: number): void {
    if (!this.alive) return;
    this.blindTimer = Math.max(this.blindTimer, duration);
  }

  public takeDamage(amount: number): { killed: boolean } {
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
      return { killed: true };
    }
    return { killed: false };
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
    // Hit damage flash tint decay (returns cleanly to subtle 0.09 low-light PBR visibility lift)
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const boost = this.hitFlashTimer > 0 ? 0.68 : 0.09;
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
      // Articulated knee-buckle collapse instead of rigid plank fall
      this.deathAnim = Math.min(1, this.deathAnim + dt * 3.8);
      const t = this.deathAnim;
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
      this.updatePose(dt, 0, 0, false);
      this.rig.root.position.copy(this.pos);
      this.rig.root.rotation.set(0, this.yaw, 0);
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

      // Tactical combat behavior: Ember/Striker crouch-shoots; Duelist jiggle-strafes!
      if (this.style === 'ember' || this.style === 'striker' || this.openingHoldTimer > 0) {
        wantCrouch = true;
      } else if (this.style === 'duelist') {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 0.65 + Math.random() * 0.75;
          this.strafeDir = -this.strafeDir;
        }
        const rightX = Math.cos(this.yaw) * this.strafeDir;
        const rightZ = -Math.sin(this.yaw) * this.strafeDir;
        const stepSpeed = diffCfg.speed * 0.62;
        this.moveWithCollision(rightX * stepSpeed * dt, rightZ * stepSpeed * dt, colliders);
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
          this.path = computeWaypointPath(this.pos, goalPos, waypoints);
          this.pathIdx = 0;
        }

        if (this.pathIdx < this.path.length) {
          const wp = this.path[this.pathIdx];
          const dx = wp.pos.x - this.pos.x;
          const dz = wp.pos.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.85) {
            this.pathIdx += 1;
          } else {
            const nx = dx / dist;
            const nz = dz / dist;
            const spd = diffCfg.speed * (this.style === 'duelist' ? 1.12 : 0.94);
            this.moveWithCollision(nx * spd * dt, nz * spd * dt, colliders);
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

    this.updatePose(dt, localFwd, localLeft, wantCrouch);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.yaw, 0);
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

    // Enemy tactical routing: some push flanks (West Alley / East Colonnade), others hunt player
    if (playerAlive && Math.random() < 0.65) {
      return playerPos.clone();
    }
    const tacticalNodes = [2, 4, 5, 6, 7, 8, 9, 14, 18];
    const pick = tacticalNodes[Math.floor(Math.random() * tacticalNodes.length)];
    return waypoints[pick].pos.clone();
  }

  private moveWithCollision(dx: number, dz: number, colliders: AABB[]): void {
    const r = 0.36;
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
  }

  private updatePose(dt: number, localFwd: number, localLeft: number, wantCrouch: boolean): void {
    const targetCrouch = wantCrouch ? 1 : 0;
    this.crouchAmount = THREE.MathUtils.lerp(this.crouchAmount, targetCrouch, Math.min(1, dt * 11));
    this.idlePhase += dt * 2.4;
    this.recoilKick = Math.max(0, this.recoilKick - dt * 9.5);

    const smooth = Math.min(1, dt * 14);
    const breath = Math.sin(this.idlePhase) * 0.011;
    const moveSpeed = Math.hypot(localFwd, localLeft);

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

function computeWaypointPath(
  startPos: THREE.Vector3,
  goalPos: THREE.Vector3,
  waypoints: Waypoint[]
): Waypoint[] {
  const startWp = nearestWaypoint(startPos, waypoints);
  const goalWp = nearestWaypoint(goalPos, waypoints);
  if (startWp.id === goalWp.id) return [goalWp];

  // Lightweight A* on 20-node arena navgraph
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

function nearestWaypoint(pos: THREE.Vector3, waypoints: Waypoint[]): Waypoint {
  let best = waypoints[0];
  let bestD = Infinity;
  for (const w of waypoints) {
    const d = pos.distanceToSquared(w.pos);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}
