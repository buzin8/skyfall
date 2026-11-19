import * as THREE from 'three';
import { AABB, ZoneDef } from '../types';
import { SoundEngine } from '../audio/SoundEngine';

const STAND_EYE_HEIGHT = 1.66;
const CROUCH_EYE_HEIGHT = 1.08;
const PLAYER_RADIUS = 0.36;
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

  // Camera punch / screen shake
  private shakeIntensity = 0;
  private stepAccum = 0;

  // Input flags
  private keys = new Set<string>();
  public sensitivity = 1.0;

  constructor(private sound: SoundEngine) {}

  public reset(spawnPos: THREE.Vector3, spawnYaw: number): void {
    this.pos.copy(spawnPos);
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

  public activateStim(): void {
    this.stimTimer = 7.5;
    this.heal(25);
    this.sound.playStimActivate();
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
    recoilYawOffset: number
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

    // Integrate + resolve AABB collisions cleanly per axis with step-up support
    const bodyHeight = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.moveAndCollide(dt, colliders, bodyHeight);

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

    // Subtle walk headbob
    const bob =
      this.grounded && this.horizontalSpeed > 0.6
        ? Math.sin(performance.now() * 0.0115) * (this.walking ? 0.012 : 0.028)
        : 0;

    camera.position.set(this.pos.x, this.pos.y + this.eyeHeight + bob, this.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(
      Math.max(-1.48, Math.min(1.48, this.pitch + recoilPitchOffset + sy)),
      this.yaw + recoilYawOffset + sx,
      0
    );
  }

  private moveAndCollide(dt: number, colliders: AABB[], bodyHeight: number): void {
    // 1. Move X
    this.pos.x += this.vel.x * dt;
    for (const box of colliders) {
      if (this.overlaps(box, bodyHeight)) {
        // Check if we can step smoothly onto low crate/curb (<= 0.48m)
        const stepDelta = box.maxY - this.pos.y;
        if (this.grounded && stepDelta > 0 && stepDelta <= 0.48 && !this.collidesAtY(box.maxY + 0.01, colliders, bodyHeight)) {
          this.pos.y = box.maxY;
        } else if (this.vel.x > 0) {
          this.pos.x = box.minX - PLAYER_RADIUS - 0.001;
          this.vel.x = 0;
        } else if (this.vel.x < 0) {
          this.pos.x = box.maxX + PLAYER_RADIUS + 0.001;
          this.vel.x = 0;
        }
      }
    }

    // 2. Move Z
    this.pos.z += this.vel.z * dt;
    for (const box of colliders) {
      if (this.overlaps(box, bodyHeight)) {
        const stepDelta = box.maxY - this.pos.y;
        if (this.grounded && stepDelta > 0 && stepDelta <= 0.48 && !this.collidesAtY(box.maxY + 0.01, colliders, bodyHeight)) {
          this.pos.y = box.maxY;
        } else if (this.vel.z > 0) {
          this.pos.z = box.minZ - PLAYER_RADIUS - 0.001;
          this.vel.z = 0;
        } else if (this.vel.z < 0) {
          this.pos.z = box.maxZ + PLAYER_RADIUS + 0.001;
          this.vel.z = 0;
        }
      }
    }

    // 3. Move Y
    this.pos.y += this.vel.y * dt;
    this.grounded = false;

    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    for (const box of colliders) {
      if (this.overlaps(box, bodyHeight)) {
        if (this.vel.y <= 0) {
          this.pos.y = box.maxY;
          this.vel.y = 0;
          this.grounded = true;
        } else {
          this.pos.y = box.minY - bodyHeight - 0.001;
          this.vel.y = 0;
        }
      }
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
