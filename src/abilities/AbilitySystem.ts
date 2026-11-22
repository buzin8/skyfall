import * as THREE from 'three';
import { AABB, SmokeCloud } from '../types';
import { TacticalAgent, hasClearSight } from '../entities/AgentAI';
import { SoundEngine } from '../audio/SoundEngine';

export interface FragHitInfo {
  agent: TacticalAgent;
  damage: number;
  killed: boolean;
}

export interface FragDetonationEvent {
  pos: THREE.Vector3;
  hits: FragHitInfo[];
  playerDamage: number;
  playerShake: number;
}

interface Projectile {
  kind: 'frag' | 'flash' | 'smoke';
  object: THREE.Object3D;
  light: THREE.PointLight;
  blinkMat?: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  maxFuse: number;
  bounceCooldown: number;
}

interface BlastBurst {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  maxScale: number;
  baseLight: number;
}

export class AbilitySystem {
  public charges = { frag: 2, flash: 2, smoke: 2 };
  public smokes: SmokeCloud[] = [];

  private projectiles: Projectile[] = [];
  private bursts: BlastBurst[] = [];
  private group = new THREE.Group();
  private nextSmokeId = 1;

  constructor(private scene: THREE.Scene, private sound: SoundEngine) {
    this.scene.add(this.group);
  }

  public resetCharges(): void {
    this.charges = { frag: 2, flash: 2, smoke: 2 };
    this.clearEffects();
  }

  public clearEffects(): void {
    for (const p of this.projectiles) {
      this.disposeObject(p.object);
      this.group.remove(p.object);
      this.group.remove(p.light);
    }
    this.projectiles = [];

    for (const s of this.smokes) {
      this.group.remove(s.mesh);
    }
    this.smokes = [];

    for (const b of this.bursts) {
      this.group.remove(b.mesh);
      this.group.remove(b.light);
    }
    this.bursts = [];
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else m.material.dispose();
      }
    });
  }

  /**
   * Throws a physical M67-style tactical frag grenade (Key C).
   * Bounces around corners off walls & floor and detonates after 1.55s with lethal blast radius!
   */
  public throwFrag(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.charges.frag <= 0) return false;
    this.charges.frag -= 1;
    this.sound.playGrenadeThrow();

    const fragGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b4432,
      roughness: 0.52,
      metalness: 0.45,
      emissive: new THREE.Color(0x161a12),
      emissiveIntensity: 0.25,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x262c34,
      roughness: 0.35,
      metalness: 0.82,
    });
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xff3b24,
      emissive: new THREE.Color(0xff2c16),
      emissiveIntensity: 0.75,
      roughness: 0.4,
      metalness: 0.2,
    });
    const blinkMat = new THREE.MeshBasicMaterial({ color: 0xff4422 });

    // Segmented fragmentation sphere body
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.082, 1), bodyMat);
    body.scale.set(0.95, 1.12, 0.95);
    fragGroup.add(body);

    // High-explosive crimson tactical stripe around grenade waist
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.011, 6, 14), bandMat);
    band.rotation.x = Math.PI / 2;
    fragGroup.add(band);

    // Top fuse neck & striker cap + side spoon lever
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.045, 8), steelMat);
    neck.position.y = 0.095;
    fragGroup.add(neck);

    const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.012), steelMat);
    spoon.position.set(0.055, 0.045, 0);
    spoon.rotation.z = -0.35;
    fragGroup.add(spoon);

    // Armed blinking fuse beacon LED on top of striker
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), blinkMat);
    led.position.y = 0.122;
    fragGroup.add(led);

    fragGroup.position.copy(origin).addScaledVector(dir, 0.55);

    const light = new THREE.PointLight(0xff421c, 7, 7);
    light.position.copy(fragGroup.position);

    this.group.add(fragGroup);
    this.group.add(light);

    const vel = dir.clone().multiplyScalar(19.2);
    vel.y += 3.2;

    this.projectiles.push({
      kind: 'frag',
      object: fragGroup,
      light,
      blinkMat,
      pos: fragGroup.position.clone(),
      vel,
      fuse: 1.55,
      maxFuse: 1.55,
      bounceCooldown: 0,
    });
    return true;
  }

  public throwFlash(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.charges.flash <= 0) return false;
    this.charges.flash -= 1;
    this.sound.playGrenadeThrow();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8),
      new THREE.MeshStandardMaterial({
        color: 0x262c34,
        emissive: new THREE.Color(0xffb838),
        emissiveIntensity: 2.2,
        roughness: 0.35,
        metalness: 0.75,
      })
    );
    mesh.position.copy(origin).addScaledVector(dir, 0.55);

    const light = new THREE.PointLight(0xffae38, 9, 10);
    light.position.copy(mesh.position);

    this.group.add(mesh);
    this.group.add(light);

    const vel = dir.clone().multiplyScalar(17.5);
    vel.y += 2.2;

    this.projectiles.push({
      kind: 'flash',
      object: mesh,
      light,
      pos: mesh.position.clone(),
      vel,
      fuse: 0.72,
      maxFuse: 0.72,
      bounceCooldown: 0,
    });
    return true;
  }

  public throwSmoke(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.charges.smoke <= 0) return false;
    this.charges.smoke -= 1;
    this.sound.playGrenadeThrow();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.22, 8),
      new THREE.MeshStandardMaterial({
        color: 0x1e2830,
        emissive: new THREE.Color(0x28e5ff),
        emissiveIntensity: 1.9,
        roughness: 0.4,
        metalness: 0.7,
      })
    );
    mesh.position.copy(origin).addScaledVector(dir, 0.55);

    const light = new THREE.PointLight(0x28d6ff, 8, 9);
    light.position.copy(mesh.position);

    this.group.add(mesh);
    this.group.add(light);

    const vel = dir.clone().multiplyScalar(18.5);
    vel.y += 2.6;

    this.projectiles.push({
      kind: 'smoke',
      object: mesh,
      light,
      pos: mesh.position.clone(),
      vel,
      fuse: 1.4,
      maxFuse: 1.4,
      bounceCooldown: 0,
    });
    return true;
  }

  public update(
    dt: number,
    colliders: AABB[],
    levelMeshes: THREE.Object3D[],
    agents: TacticalAgent[],
    playerEye: THREE.Vector3,
    cameraForward: THREE.Vector3,
    onPlayerFlashed: (strength: number) => void,
    onFlashDetonate?: (pos: THREE.Vector3) => void,
    onFragDetonate?: (ev: FragDetonationEvent) => void
  ): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.fuse -= dt;
      if (p.bounceCooldown > 0) p.bounceCooldown -= dt;
      p.vel.y -= 15.2 * dt;

      let hitSurface = false;
      const r = 0.11;

      // Axis-separated collision for crisp wall banking & natural floor rolling!
      const prevX = p.pos.x;
      p.pos.x += p.vel.x * dt;
      for (const b of colliders) {
        if (
          p.pos.x + r > b.minX &&
          p.pos.x - r < b.maxX &&
          p.pos.y + r > b.minY &&
          p.pos.y - r < b.maxY &&
          p.pos.z + r > b.minZ &&
          p.pos.z - r < b.maxZ
        ) {
          p.pos.x = prevX;
          p.vel.x *= -0.52;
          p.vel.z *= 0.82;
          hitSurface = true;
          break;
        }
      }

      const prevZ = p.pos.z;
      p.pos.z += p.vel.z * dt;
      for (const b of colliders) {
        if (
          p.pos.x + r > b.minX &&
          p.pos.x - r < b.maxX &&
          p.pos.y + r > b.minY &&
          p.pos.y - r < b.maxY &&
          p.pos.z + r > b.minZ &&
          p.pos.z - r < b.maxZ
        ) {
          p.pos.z = prevZ;
          p.vel.z *= -0.52;
          p.vel.x *= 0.82;
          hitSurface = true;
          break;
        }
      }

      const prevY = p.pos.y;
      p.pos.y += p.vel.y * dt;
      if (p.pos.y <= 0.12) {
        p.pos.y = 0.12;
        if (Math.abs(p.vel.y) > 1.3) {
          hitSurface = true;
          p.vel.y *= -0.42;
        } else {
          p.vel.y = 0;
        }
        p.vel.x *= 0.78;
        p.vel.z *= 0.78;
      } else {
        for (const b of colliders) {
          if (
            p.pos.x + r > b.minX &&
            p.pos.x - r < b.maxX &&
            p.pos.y + r > b.minY &&
            p.pos.y - r < b.maxY &&
            p.pos.z + r > b.minZ &&
            p.pos.z - r < b.maxZ
          ) {
            p.pos.y = prevY;
            p.vel.y *= -0.42;
            p.vel.x *= 0.78;
            p.vel.z *= 0.78;
            hitSurface = true;
            break;
          }
        }
      }

      if (hitSurface && p.kind === 'frag' && p.bounceCooldown <= 0) {
        const spd = p.vel.length();
        if (spd > 1.2) {
          this.sound.playGrenadeBounce(Math.min(1, spd / 11));
          p.bounceCooldown = 0.09;
        }
      }

      p.object.position.copy(p.pos);
      const spinMult = Math.min(1.5, p.vel.length() * 0.16);
      p.object.rotation.x += dt * (4 + spinMult * 9);
      p.object.rotation.y += dt * (5 + spinMult * 10);
      p.light.position.copy(p.pos);

      // Escalating red-orange armed blink pulse on frag grenade as detonation approaches!
      if (p.kind === 'frag' && p.blinkMat) {
        const progress = 1 - Math.max(0, p.fuse / p.maxFuse);
        const freq = 6 + progress * 24;
        const pulse = Math.sin(performance.now() * 0.001 * freq * Math.PI) > 0;
        p.blinkMat.color.setHex(pulse ? 0xff4518 : 0x551208);
        p.light.intensity = pulse ? 10 + progress * 12 : 1.5;
      }

      const shouldPop = p.kind === 'smoke' ? hitSurface || p.fuse <= 0 : p.fuse <= 0;
      if (shouldPop) {
        if (p.kind === 'frag') {
          const ev = this.detonateFrag(p.pos, levelMeshes, agents, playerEye);
          onFragDetonate?.(ev);
        } else if (p.kind === 'flash') {
          this.detonateFlash(p.pos, levelMeshes, agents, playerEye, cameraForward, onPlayerFlashed);
          onFlashDetonate?.(p.pos);
        } else {
          this.deploySmoke(p.pos);
        }
        this.disposeObject(p.object);
        this.group.remove(p.object);
        this.group.remove(p.light);
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.group.remove(b.mesh);
        this.group.remove(b.light);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      } else {
        const t = b.life / b.maxLife;
        b.mesh.scale.setScalar(1 + (1 - t) * b.maxScale);
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
        b.light.intensity = t * b.baseLight;
      }
    }

    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.remaining -= dt;
      const age = s.maxDuration - s.remaining;

      let scale = 1;
      if (age < 0.35) scale = THREE.MathUtils.smoothstep(age / 0.35, 0, 1);
      else if (s.remaining < 1.2) scale = Math.max(0.01, s.remaining / 1.2);

      s.mesh.scale.setScalar(scale);
      s.mesh.rotation.y += dt * 0.28;

      if (s.remaining <= 0) {
        this.group.remove(s.mesh);
        this.smokes.splice(i, 1);
      }
    }
  }

  private detonateFrag(
    pos: THREE.Vector3,
    levelMeshes: THREE.Object3D[],
    agents: TacticalAgent[],
    playerEye: THREE.Vector3
  ): FragDetonationEvent {
    const blastOrigin = pos.clone().add(new THREE.Vector3(0, 0.24, 0));
    const playerDist = blastOrigin.distanceTo(playerEye);
    const distAtten = THREE.MathUtils.clamp(1.25 - playerDist / 34, 0.25, 1.0);
    this.sound.playFragExplosion(distAtten);

    // Expanding fiery shockwave flash sphere + intense detonation light
    const shockSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 14),
      new THREE.MeshBasicMaterial({
        color: 0xff7c24,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shockSphere.position.copy(blastOrigin);
    const blastLight = new THREE.PointLight(0xff641c, 68, 30, 1.3);
    blastLight.position.copy(blastOrigin);
    this.group.add(shockSphere);
    this.group.add(blastLight);
    this.bursts.push({
      mesh: shockSphere,
      light: blastLight,
      life: 0.42,
      maxLife: 0.42,
      maxScale: 9.5,
      baseLight: 68,
    });

    const blastRadius = 7.6;
    const maxEnemyDamage = 148;
    const hits: FragHitInfo[] = [];

    for (const agent of agents) {
      if (!agent.alive || agent.team === 'ally') continue;
      const targetCenter = agent.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
      const dist = blastOrigin.distanceTo(targetCenter);
      if (dist > blastRadius) continue;

      // Solid walls block shrapnel; small low cover or open line deals full explosive damage!
      const clearChest = hasClearSight(blastOrigin, targetCenter, levelMeshes, []);
      const clearHead = clearChest || hasClearSight(blastOrigin, agent.getEyePosition(), levelMeshes, []);
      if (!clearHead) continue;

      const falloff = 1 - Math.pow(dist / blastRadius, 1.25);
      const dmg = Math.round(Math.max(24, maxEnemyDamage * falloff * (clearChest ? 1.0 : 0.72)));
      const blastDir = new THREE.Vector3().subVectors(targetCenter, blastOrigin).normalize();
      const res = agent.takeDamage(dmg, blastDir, false);
      hits.push({ agent, damage: dmg, killed: res.killed });
    }

    // Distance-scaled concussion camera shake + reduced self-splash damage if standing right on grenade
    const playerShake = playerDist < 15 ? THREE.MathUtils.lerp(0.16, 0.025, playerDist / 15) : 0;
    let playerDamage = 0;
    if (playerDist < 5.5 && hasClearSight(blastOrigin, playerEye, levelMeshes, [])) {
      const selfFalloff = 1 - playerDist / 5.5;
      playerDamage = Math.round(45 * selfFalloff);
    }

    return { pos: blastOrigin, hits, playerDamage, playerShake };
  }

  private detonateFlash(
    pos: THREE.Vector3,
    levelMeshes: THREE.Object3D[],
    agents: TacticalAgent[],
    playerEye: THREE.Vector3,
    cameraForward: THREE.Vector3,
    onPlayerFlashed: (strength: number) => void
  ): void {
    this.sound.playFlashPop();

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 14, 14),
      new THREE.MeshBasicMaterial({
        color: 0xfff6d2,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.copy(pos);
    const light = new THREE.PointLight(0xffcf6b, 48, 26, 1.35);
    light.position.copy(pos);
    this.group.add(mesh);
    this.group.add(light);
    this.bursts.push({
      mesh,
      light,
      life: 0.38,
      maxLife: 0.38,
      maxScale: 5.8,
      baseLight: 48,
    });

    for (const agent of agents) {
      if (!agent.alive || agent.team === 'ally') continue;
      const eye = agent.getEyePosition();
      const dist = eye.distanceTo(pos);
      if (dist < 19 && hasClearSight(pos, eye, levelMeshes, [])) {
        const dur = THREE.MathUtils.lerp(3.2, 1.8, dist / 19);
        agent.applyBlind(dur);
      }
    }

    const toFlash = new THREE.Vector3().subVectors(pos, playerEye);
    const pDist = toFlash.length();
    if (pDist < 16 && hasClearSight(pos, playerEye, levelMeshes, [])) {
      toFlash.divideScalar(pDist);
      const facing = cameraForward.dot(toFlash);
      if (facing > 0.35) {
        onPlayerFlashed(Math.min(0.82, facing * 0.75));
      }
    }
  }

  private deploySmoke(pos: THREE.Vector3): void {
    this.sound.playSmokeDeploy();

    const radius = 3.05;
    const smokePos = new THREE.Vector3(pos.x, Math.max(1.5, pos.y + 1.15), pos.z);
    const root = new THREE.Group();
    root.position.copy(smokePos);

    // Gritty dark volumetric industrial smoke screen with subtle cyan interior scatter
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x162029,
      emissive: new THREE.Color(0x0d2c36),
      emissiveIntensity: 0.42,
      roughness: 0.96,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    });
    const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), outerMat);
    root.add(coreShell);

    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x32dfff,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
    });
    const rim = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.01, 2), rimMat);
    root.add(rim);

    const puffMat = new THREE.MeshStandardMaterial({
      color: 0x1d2934,
      roughness: 0.96,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * 0.5, 1), puffMat);
      puff.position.set(
        Math.cos(ang) * radius * 0.6,
        ((i % 2) - 0.5) * radius * 0.48,
        Math.sin(ang) * radius * 0.6
      );
      root.add(puff);
    }

    root.scale.setScalar(0.05);
    this.group.add(root);

    this.smokes.push({
      id: this.nextSmokeId++,
      pos: smokePos,
      radius,
      remaining: 11.5,
      maxDuration: 11.5,
      mesh: root,
    });
  }
}
