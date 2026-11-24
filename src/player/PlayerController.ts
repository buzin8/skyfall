import * as THREE from 'three';
import { AABB, RampCollider, ZoneDef } from '../types';
import { SoundEngine } from '../audio/SoundEngine';
import { depenetrateFromColliders } from '../world/CollisionUtils';

const STAND_EYE_HEIGHT = 1.66;
const CROUCH_EYE_HEIGHT = 1.08;
const PLAYER_RADIUS = 0.54;
const STAND_HEIGHT = 1.82;
const CROUCH_HEIGHT = 1.24;
const GRAVITY = 23.0;
const JUMP_VELOCITY = 7.4;

export class PlayerController {
  public pos = new THREE.Vector3();
  public vel = new THREE.Vector3();
  public yaw = 0;
  public pitch = 0;

  public hp = 100;
  public maxHp = 100;
  public shield = 50;
  public maxShield = 50;
  public alive = true;

  public grounded = true;
  public crouching = false;
  public walking = false;
  public horizontalSpeed = 0;
  public eyeHeight = STAND_EYE_HEIGHT;

  // Stim boost state
  public stimTimer = 0;

  // Camera punch / screen shake & silky stair vertical smoothing
  private shakeIntensity = 0;
  private stepAccum = 0;
  private smoothPosY = 0;

  // Input flags
  private keys = new Set<string>();
  public sensitivity = 1.0;

  constructor(private sound: SoundEngine) {}

  public reset(spawnPos: THREE.Vector3, spawnYaw: number): void {
    this.pos.copy(spawnPos);
    this.smoothPosY = spawnPos.y;
    this.vel.set(0, 0, 0);
    this.yaw = spawnYaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.shield = this.maxShield;
    this.alive = true;
    this.grounded = true;
    this.crouching = false;
    this.walking = false;
    this.eyeHeight = STAND_EYE_HEIGHT;
    this.stimTimer = 0;
    this.shakeIntensity = 0;
    this.keys.clear();
  }

  public onKeyDown(code: string): void {
    this.keys.add(code);
  }

  public onKeyUp(code: string): void {
    this.keys.delete(code);
  }

  public clearKeys(): void {
    this.keys.clear();
  }

  public onMouseMove(dx: number, dy: number, adsScale = 1): void {
    if (!this.alive) return;
    const scale = 0.0021 * this.sensitivity * adsScale;
    this.yaw -= dx * scale;
    this.pitch = Math.max(-1.44, Math.min(1.44, this.pitch - dy * scale));
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(0.18, this.shakeIntensity + amount);
  }

  public takeDamage(amount: number): { died: boolean } {
    if (!this.alive) return { died: false };
    // Valorant-style light/heavy shield absorbs 66% of incoming damage until depleted
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, Math.round(amount * 0.66));
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    this.hp = Math.max(0, this.hp - remaining);
    this.addShake(0.06);
    this.sound.playDamageTaken();

    if (this.hp <= 0) {
      this.alive = false;
      return { died: true };
    }
    return { died: false };
  }

  public heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  public getEyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  public getZoneName(zones: ZoneDef[]): string {
    for (const z of zones) {
      if (
        this.pos.x >= z.minX &&
        this.pos.x <= z.maxX &&
        this.pos.z >= z.minZ &&
        this.pos.z <= z.maxZ
      ) {
        return z.name;
      }
    }
    return 'BAZAAR COURTYARD';
  }

  public update(
    dt: number,
    colliders: AABB[],
    camera: THREE.PerspectiveCamera,
    weaponSpeedMult: number,
    recoilPitchOffset: number,
    recoilYawOffset: number,
    mapBounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
    ramps?: RampCollider[]
  ): void {
    if (this.stimTimer > 0) {
      this.stimTimer = Math.max(0, this.stimTimer - dt);
      // Gentle stim regen
      if (this.alive && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + 3.2 * dt);
      }
    }

    if (!this.alive) {
      // Collapse camera smoothly on death
      this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, 0.34, Math.min(1, dt * 8));
      camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(0.32, this.yaw, 0.25);
      return;
    }

    // Input direction
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const wantsCrouch = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    this.crouching = wantsCrouch;
    this.walking = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.crouching;

    // Smooth crouch height interpolation
    const targetEye = this.crouching ? CROUCH_EYE_HEIGHT : STAND_EYE_HEIGHT;
    this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, targetEye, Math.min(1, dt * 15));

    // Speed tuning (tight Valorant movement speeds!)
    let maxSpeed = 6.1 * weaponSpeedMult;
    if (this.stimTimer > 0) maxSpeed *= 1.16;
    if (this.crouching) maxSpeed *= 0.48;
    else if (this.walking) maxSpeed *= 0.56;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    let wishX = -sinY * forward + cosY * strafe;
    let wishZ = -cosY * forward - sinY * strafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.0001) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    // Crisp tactical acceleration & counter-strafe stopping friction
    const accel = this.grounded ? 52.0 : 12.0;
    const friction = this.grounded ? 15.5 : 1.4;

    if (wishLen > 0) {
      this.vel.x += wishX * accel * dt;
      this.vel.z += wishZ * accel * dt;
      const curSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (curSpeed > maxSpeed) {
        const s = maxSpeed / curSpeed;
        this.vel.x *= s;
        this.vel.z *= s;
      }
    } else {
      const drop = Math.max(0, 1 - friction * dt);
      this.vel.x *= drop;
      this.vel.z *= drop;
      if (Math.hypot(this.vel.x, this.vel.z) < 0.08) {
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }

    // Jump
    if (this.keys.has('Space') && this.grounded) {
      this.vel.y = JUMP_VELOCITY;
      this.grounded = false;
    }

    // Gravity
    this.vel.y -= GRAVITY * dt;

    // Integrate + resolve AABB & smooth stair ramp collisions cleanly per axis (zero wall clipping or stair snag!)
    const bodyHeight = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.moveAndCollide(dt, colliders, bodyHeight, mapBounds, ramps);

    this.horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);

    // Footstep sound cadence (silent while Shift-walking!)
    if (this.grounded && this.horizontalSpeed > 1.2 && !this.walking) {
      this.stepAccum += this.horizontalSpeed * dt;
      const stride = this.crouching ? 1.85 : 2.35;
      if (this.stepAccum >= stride) {
        this.stepAccum = 0;
        this.sound.playFootstep(this.crouching);
      }
    } else {
      this.stepAccum = 0.8;
    }

    // Decay screen shake
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 0.42);
    const sx = (Math.random() - 0.5) * this.shakeIntensity;
    const sy = (Math.random() - 0.5) * this.shakeIntensity;

    // Smooth camera Y tracking (eliminates any stair/curb micro-jolt while keeping jumps instant!)
    const dyCam = Math.abs(this.pos.y - this.smoothPosY);
    if (dyCam > 0.8) {
      this.smoothPosY = this.pos.y;
    } else {
      const rate = this.grounded ? 34 : 52;
      this.smoothPosY = THREE.MathUtils.lerp(this.smoothPosY, this.pos.y, Math.min(1, dt * rate));
    }

    // Subtle walk headbob (calmer on stairs so climbing feels silky-smooth & easy to aim!)
    const onRamp = this.sampleRampHeight(this.pos.x, this.pos.z, this.pos.y, ramps) !== null;
    const bobScale = onRamp ? 0.35 : 1.0;
    const bob =
      this.grounded && this.horizontalSpeed > 0.6
        ? Math.sin(performance.now() * 0.0115) * (this.walking ? 0.012 : 0.028) * bobScale
        : 0;

    camera.position.set(this.pos.x, this.smoothPosY + this.eyeHeight + bob, this.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(
      Math.max(-1.48, Math.min(1.48, this.pitch + recoilPitchOffset + sy)),
      this.yaw + recoilYawOffset + sx,
      0
    );
  }

  /**
   * Prevents the local player from ever overlapping any alive teammate, enemy, or AI bot
   * across all Solo & TDM maps while re-clamping strictly outside solid walls and staircases!
   */
  public resolveCharacterOverlap(
    others: Array<{ x: number; y: number; z: number }>,
    colliders: AABB[],
    mapBounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
    ramps?: RampCollider[],
    camera?: THREE.PerspectiveCamera
  ): void {
    if (!this.alive || others.length === 0) return;
    const minDist = 1.04;
    const minDistSq = minDist * minDist;
    let moved = false;

    for (let pass = 0; pass < 2; pass++) {
      let pushed = false;
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (Math.abs(o.y - this.pos.y) > 1.55) continue;
        let dx = this.pos.x - o.x;
        let dz = this.pos.z - o.z;
        const dSq = dx * dx + dz * dz;
        if (dSq >= minDistSq) continue;

        let dist = Math.sqrt(dSq);
        if (dist < 1e-4) {
          dx = 1;
          dz = 0;
          dist = 1;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;
        this.pos.x += nx * overlap;
        this.pos.z += nz * overlap;

        // Remove velocity component pushing further into the other character
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= nx * vn;
          this.vel.z -= nz * vn;
        }
        pushed = true;
        moved = true;
      }
      if (!pushed) break;

      // Re-clamp immediately against solid walls so character separation can NEVER shove player inside a wall!
      const bodyHeight = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
      depenetrateFromColliders(this.pos, PLAYER_RADIUS, bodyHeight, colliders, mapBounds, 3, 0.08);
    }

    if (moved) {
      // Also guard ramp undersides if pushed sideways near stairs
      const bodyHeight = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
      if (ramps) {
        for (const r of ramps) {
          if (this.pos.x + PLAYER_RADIUS < r.minX || this.pos.x - PLAYER_RADIUS > r.maxX) continue;
          if (this.pos.z + PLAYER_RADIUS < r.minZ || this.pos.z - PLAYER_RADIUS > r.maxZ) continue;
          const t = THREE.MathUtils.clamp((this.pos.z - r.minZ) / Math.max(0.001, r.maxZ - r.minZ), 0, 1);
          const ry = THREE.MathUtils.lerp(r.yAtMinZ, r.yAtMaxZ, t);
          if (this.pos.y < ry - 0.85 && this.pos.y + bodyHeight > ry - 0.24) {
            const penL = this.pos.x + PLAYER_RADIUS - r.minX;
            const penR = r.maxX - (this.pos.x - PLAYER_RADIUS);
            const penB = this.pos.z + PLAYER_RADIUS - r.minZ;
            const penF = r.maxZ - (this.pos.z - PLAYER_RADIUS);
            const minP = Math.min(penL, penR, penB, penF);
            if (minP === penL) this.pos.x = r.minX - PLAYER_RADIUS - 0.002;
            else if (minP === penR) this.pos.x = r.maxX + PLAYER_RADIUS + 0.002;
            else if (minP === penB) this.pos.z = r.minZ - PLAYER_RADIUS - 0.002;
            else this.pos.z = r.maxZ + PLAYER_RADIUS + 0.002;
          }
        }
      }
      depenetrateFromColliders(this.pos, PLAYER_RADIUS, bodyHeight, colliders, mapBounds, 3, 0.08);
      if (camera) {
        camera.position.x = this.pos.x;
        camera.position.z = this.pos.z;
      }
    }
  }

  private sampleRampHeight(x: number, z: number, curY: number, ramps?: RampCollider[]): number | null {
    if (!ramps || ramps.length === 0) return null;
    let bestY: number | null = null;
    for (const r of ramps) {
      if (x + PLAYER_RADIUS * 0.6 < r.minX || x - PLAYER_RADIUS * 0.6 > r.maxX) continue;
      // Extend the high-end plateau smoothly across the flat top landing so there is zero slab-edge seam!
      const minPad = r.yAtMinZ > r.yAtMaxZ ? 0.74 : 0.24;
      const maxPad = r.yAtMaxZ > r.yAtMinZ ? 0.74 : 0.24;
      if (z < r.minZ - minPad || z > r.maxZ + maxPad) continue;
      const t = THREE.MathUtils.clamp((z - r.minZ) / Math.max(0.001, r.maxZ - r.minZ), 0, 1);
      const ry = THREE.MathUtils.lerp(r.yAtMinZ, r.yAtMaxZ, t);
      // Only engage top of ramp if player is on or near the ramp surface (never teleport up from underneath!)
      if (curY >= ry - 0.85 && (bestY === null || ry > bestY)) {
        bestY = ry;
      }
    }
    return bestY;
  }

  private moveAndCollide(
    dt: number,
    colliders: AABB[],
    bodyHeight: number,
    mapBounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
    ramps?: RampCollider[]
  ): void {
    const wasGrounded = this.grounded;
    const prevZ = this.pos.z;
    const prevX = this.pos.x;

    // 1. Move X
    const stepX = this.vel.x * dt;
    this.pos.x += stepX;
    // Pre-lift smoothly along any staircase ramp BEFORE checking solid colliders!
    if (this.vel.y <= 0) {
      const preRampX = this.sampleRampHeight(this.pos.x, this.pos.z, this.pos.y, ramps);
      if (preRampX !== null && this.pos.y < preRampX) {
        this.pos.y = preRampX;
      }
    }
    for (const box of colliders) {
      if (!this.overlaps(box, bodyHeight)) continue;
      const stepDelta = box.maxY - this.pos.y;
      const boxHeight = box.maxY - box.minY;
      if (
        wasGrounded &&
        stepDelta > 0 &&
        stepDelta <= 0.48 &&
        boxHeight <= 0.65 &&
        !this.collidesAtY(box.maxY + 0.01, colliders, bodyHeight)
      ) {
        this.pos.y = box.maxY;
      } else if (stepX > 0) {
        this.pos.x = box.minX - PLAYER_RADIUS - 0.002;
        this.vel.x = 0;
      } else if (stepX < 0) {
        this.pos.x = box.maxX + PLAYER_RADIUS + 0.002;
        this.vel.x = 0;
      } else {
        const cx = (box.minX + box.maxX) * 0.5;
        this.pos.x = this.pos.x < cx ? box.minX - PLAYER_RADIUS - 0.002 : box.maxX + PLAYER_RADIUS + 0.002;
        this.vel.x = 0;
      }
    }

    // 2. Move Z
    const stepZ = this.vel.z * dt;
    this.pos.z += stepZ;
    if (this.vel.y <= 0) {
      const preRampZ = this.sampleRampHeight(this.pos.x, this.pos.z, this.pos.y, ramps);
      if (preRampZ !== null && this.pos.y < preRampZ) {
        this.pos.y = preRampZ;
      }
    }
    for (const box of colliders) {
      if (!this.overlaps(box, bodyHeight)) continue;
      const stepDelta = box.maxY - this.pos.y;
      const boxHeight = box.maxY - box.minY;
      if (
        wasGrounded &&
        stepDelta > 0 &&
        stepDelta <= 0.48 &&
        boxHeight <= 0.65 &&
        !this.collidesAtY(box.maxY + 0.01, colliders, bodyHeight)
      ) {
        this.pos.y = box.maxY;
      } else if (stepZ > 0) {
        this.pos.z = box.minZ - PLAYER_RADIUS - 0.002;
        this.vel.z = 0;
      } else if (stepZ < 0) {
        this.pos.z = box.maxZ + PLAYER_RADIUS + 0.002;
        this.vel.z = 0;
      } else {
        const cz = (box.minZ + box.maxZ) * 0.5;
        this.pos.z = this.pos.z < cz ? box.minZ - PLAYER_RADIUS - 0.002 : box.maxZ + PLAYER_RADIUS + 0.002;
        this.vel.z = 0;
      }
    }

    // Prevent clipping head into the low underside of staircases when walking underneath from ground level
    if (ramps) {
      for (const r of ramps) {
        if (this.pos.x + PLAYER_RADIUS < r.minX || this.pos.x - PLAYER_RADIUS > r.maxX) continue;
        if (this.pos.z + PLAYER_RADIUS < r.minZ || this.pos.z - PLAYER_RADIUS > r.maxZ) continue;
        const t = THREE.MathUtils.clamp((this.pos.z - r.minZ) / Math.max(0.001, r.maxZ - r.minZ), 0, 1);
        const ry = THREE.MathUtils.lerp(r.yAtMinZ, r.yAtMaxZ, t);
        if (this.pos.y < ry - 0.85 && this.pos.y + bodyHeight > ry - 0.24) {
          // Slide cleanly rather than locking both axes
          if (Math.abs(this.pos.z - prevZ) >= Math.abs(this.pos.x - prevX)) {
            this.pos.z = prevZ;
            this.vel.z = 0;
          } else {
            this.pos.x = prevX;
            this.vel.x = 0;
          }
        }
      }
    }

    // 3. Move Y (resolve solid floors FIRST, then silky-smooth continuous stair ramp riding!)
    const stepY = this.vel.y * dt;
    this.pos.y += stepY;
    this.grounded = false;

    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    let solidFloorY: number | null = null;
    for (const box of colliders) {
      if (!this.overlaps(box, bodyHeight)) continue;
      const penX = Math.min(this.pos.x + PLAYER_RADIUS - box.minX, box.maxX - (this.pos.x - PLAYER_RADIUS));
      const penZ = Math.min(this.pos.z + PLAYER_RADIUS - box.minZ, box.maxZ - (this.pos.z - PLAYER_RADIUS));
      if (penX < 0.025 || penZ < 0.025) continue;

      if (stepY <= 0 && this.pos.y - stepY >= box.maxY - 0.16) {
        this.pos.y = box.maxY;
        this.vel.y = 0;
        this.grounded = true;
        if (solidFloorY === null || box.maxY > solidFloorY) solidFloorY = box.maxY;
      } else if (stepY > 0 && this.pos.y + bodyHeight - stepY <= box.minY + 0.14) {
        this.pos.y = box.minY - bodyHeight - 0.002;
        this.vel.y = 0;
      }
    }

    // Smooth continuous staircase ramp glide (UP and DOWN with zero jolts, zero slab tug-of-war!)
    const rampY = this.sampleRampHeight(this.pos.x, this.pos.z, this.pos.y, ramps);
    if (rampY !== null && this.vel.y <= 0) {
      const canSnapToRamp = solidFloorY === null || rampY >= solidFloorY - 0.01;
      if (canSnapToRamp) {
        if (this.pos.y <= rampY + 0.05) {
          this.pos.y = rampY;
          this.vel.y = 0;
          this.grounded = true;
        } else if (wasGrounded && !this.keys.has('Space') && this.pos.y - rampY <= 0.65) {
          this.pos.y = rampY;
          this.vel.y = 0;
          this.grounded = true;
        }
      }
    }

    // Silky-smooth stair step-down snap (prevents bouncing when sprinting DOWN stairs!)
    if (wasGrounded && !this.grounded && this.vel.y <= 0 && !this.keys.has('Space')) {
      let bestFloor = -1;
      for (const box of colliders) {
        const penX = Math.min(this.pos.x + PLAYER_RADIUS - box.minX, box.maxX - (this.pos.x - PLAYER_RADIUS));
        const penZ = Math.min(this.pos.z + PLAYER_RADIUS - box.minZ, box.maxZ - (this.pos.z - PLAYER_RADIUS));
        if (penX < 0.03 || penZ < 0.03) continue;
        const drop = this.pos.y - box.maxY;
        if (drop > 0 && drop <= 0.36 && box.maxY > bestFloor) {
          bestFloor = box.maxY;
        }
      }
      if (bestFloor >= 0 && !this.collidesAtY(bestFloor + 0.01, colliders, bodyHeight)) {
        this.pos.y = bestFloor;
        this.vel.y = 0;
        this.grounded = true;
      } else if (this.pos.y > 0 && this.pos.y <= 0.36 && !this.collidesAtY(0.01, colliders, bodyHeight)) {
        this.pos.y = 0;
        this.vel.y = 0;
        this.grounded = true;
      }
    }

    // 4. Multi-pass minimum-penetration horizontal depenetration guarantee (impossible to wedge inside any wall/corner!)
    for (let pass = 0; pass < 3; pass++) {
      let pushed = false;
      for (const box of colliders) {
        if (!this.overlaps(box, bodyHeight)) continue;
        const penLeft = this.pos.x + PLAYER_RADIUS - box.minX;
        const penRight = box.maxX - (this.pos.x - PLAYER_RADIUS);
        const penBack = this.pos.z + PLAYER_RADIUS - box.minZ;
        const penFront = box.maxZ - (this.pos.z - PLAYER_RADIUS);
        const minPen = Math.min(penLeft, penRight, penBack, penFront);
        if (minPen <= 0) continue;

        if (minPen === penLeft) {
          this.pos.x = box.minX - PLAYER_RADIUS - 0.002;
          if (this.vel.x > 0) this.vel.x = 0;
        } else if (minPen === penRight) {
          this.pos.x = box.maxX + PLAYER_RADIUS + 0.002;
          if (this.vel.x < 0) this.vel.x = 0;
        } else if (minPen === penBack) {
          this.pos.z = box.minZ - PLAYER_RADIUS - 0.002;
          if (this.vel.z > 0) this.vel.z = 0;
        } else {
          this.pos.z = box.maxZ + PLAYER_RADIUS + 0.002;
          if (this.vel.z < 0) this.vel.z = 0;
        }
        pushed = true;
      }
      if (!pushed) break;
    }

    // 5. Hard outer arena perimeter clamp
    if (mapBounds) {
      const pad = PLAYER_RADIUS + 0.45;
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, mapBounds.minX + pad, mapBounds.maxX - pad);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, mapBounds.minZ + pad, mapBounds.maxZ - pad);
    }
  }

  private overlaps(box: AABB, bodyHeight: number): boolean {
    return (
      this.pos.x + PLAYER_RADIUS > box.minX &&
      this.pos.x - PLAYER_RADIUS < box.maxX &&
      this.pos.z + PLAYER_RADIUS > box.minZ &&
      this.pos.z - PLAYER_RADIUS < box.maxZ &&
      this.pos.y + bodyHeight > box.minY &&
      this.pos.y < box.maxY
    );
  }

  private collidesAtY(testY: number, colliders: AABB[], bodyHeight: number): boolean {
    const saved = this.pos.y;
    this.pos.y = testY;
    let hit = false;
    for (const box of colliders) {
      if (this.overlaps(box, bodyHeight)) {
        hit = true;
        break;
      }
    }
    this.pos.y = saved;
    return hit;
  }
}
