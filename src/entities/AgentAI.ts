import * as THREE from 'three';
import { AABB, Difficulty, SmokeCloud, Team, Waypoint } from '../types';
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
  private walkPhase = 0;
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
    scene: THREE.Scene
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.style = style;
    this.rig = buildAgentRig(id, team, style);
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
    this.rig.blindHalo.visible = false;
    this.rig.muzzleFlash.visible = false;
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
    // Hit damage flash tint decay (returns cleanly to subtle 0.16 low-light visibility lift)
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const boost = this.hitFlashTimer > 0 ? 0.72 : 0.16;
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
      // Dramatic collapse to ground
      this.deathAnim = Math.min(1, this.deathAnim + dt * 4.2);
      this.rig.root.rotation.x = -this.deathAnim * (Math.PI / 2 - 0.08);
      this.rig.root.position.y = Math.max(0.08, (1 - this.deathAnim) * 0.15);
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
      this.updatePose(dt, 0, true);
      return;
    } else {
      this.rig.blindHalo.visible = false;
      this.rig.headGroup.rotation.y = 0;
    }

    if (!roundActive) {
      // Crisp upright two-handed aiming stance during pre-round / showcase
      this.updatePose(dt, 0, false);
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

    let moveSpeed = 0;
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
        moveSpeed = stepSpeed;
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
            moveSpeed = spd;
            const desiredYaw = Math.atan2(nx, nz);
            this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 8));
          }
        }
      }
    }

    this.updatePose(dt, moveSpeed, wantCrouch);
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

  private updatePose(dt: number, moveSpeed: number, wantCrouch: boolean): void {
    const targetCrouch = wantCrouch ? 1 : 0;
    this.crouchAmount = THREE.MathUtils.lerp(this.crouchAmount, targetCrouch, Math.min(1, dt * 11));

    // Smooth tactical combat crouch matching the left agent in the reference screenshot!
    this.rig.hips.position.y = THREE.MathUtils.lerp(0.94, 0.62, this.crouchAmount);
    this.rig.torso.rotation.x = THREE.MathUtils.lerp(0.04, 0.24, this.crouchAmount);
    this.rig.weaponPivot.rotation.x = THREE.MathUtils.lerp(0, -0.22, this.crouchAmount);

    if (moveSpeed > 0.25) {
      this.walkPhase += dt * moveSpeed * 2.8;
      const swing = Math.sin(this.walkPhase) * 0.52;
      this.rig.leftLeg.rotation.x = swing;
      this.rig.rightLeg.rotation.x = -swing;
    } else if (this.crouchAmount > 0.35) {
      // Iconic staggered combat crouch stance (front knee bent, rear heel back)
      this.rig.leftLeg.rotation.x = -0.68 * this.crouchAmount;
      this.rig.rightLeg.rotation.x = 0.58 * this.crouchAmount;
    } else {
      this.rig.leftLeg.rotation.x = THREE.MathUtils.lerp(this.rig.leftLeg.rotation.x, 0, dt * 10);
      this.rig.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rig.rightLeg.rotation.x, 0, dt * 10);
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
