import * as THREE from 'three';
import { AABB, SmokeCloud } from '../types';
import { TacticalAgent, hasClearSight } from '../entities/AgentAI';
import { SoundEngine } from '../audio/SoundEngine';

interface Projectile {
  kind: 'flash' | 'smoke';
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
}

interface FlashBurst {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  life: number;
  maxLife: number;
}

export class AbilitySystem {
  public charges = { stim: 1, flash: 2, smoke: 2 };
  public smokes: SmokeCloud[] = [];

  private projectiles: Projectile[] = [];
  private bursts: FlashBurst[] = [];
  private group = new THREE.Group();
  private nextSmokeId = 1;

  constructor(private scene: THREE.Scene, private sound: SoundEngine) {
    this.scene.add(this.group);
  }

  public resetCharges(): void {
    this.charges = { stim: 1, flash: 2, smoke: 2 };
    this.clearEffects();
  }

  public clearEffects(): void {
    for (const p of this.projectiles) {
      this.group.remove(p.mesh);
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

  public useStim(onActivate: () => void): boolean {
    if (this.charges.stim <= 0) return false;
    this.charges.stim -= 1;
    onActivate();
    return true;
  }

  public throwFlash(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.charges.flash <= 0) return false;
    this.charges.flash -= 1;

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
      mesh,
      light,
      pos: mesh.position.clone(),
      vel,
      fuse: 0.72,
    });
    return true;
  }

  public throwSmoke(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.charges.smoke <= 0) return false;
    this.charges.smoke -= 1;

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
      mesh,
      light,
      pos: mesh.position.clone(),
      vel,
      fuse: 1.4,
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
    onFlashDetonate?: (pos: THREE.Vector3) => void
  ): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.fuse -= dt;
      p.vel.y -= 14.5 * dt;

      const step = p.vel.clone().multiplyScalar(dt);
      p.pos.add(step);

      let hitSurface = false;
      if (p.pos.y <= 0.14) {
        p.pos.y = 0.14;
        p.vel.y *= -0.45;
        p.vel.x *= 0.72;
        p.vel.z *= 0.72;
        hitSurface = true;
      }

      for (const b of colliders) {
        if (
          p.pos.x + 0.12 > b.minX &&
          p.pos.x - 0.12 < b.maxX &&
          p.pos.y + 0.12 > b.minY &&
          p.pos.y - 0.12 < b.maxY &&
          p.pos.z + 0.12 > b.minZ &&
          p.pos.z - 0.12 < b.maxZ
        ) {
          p.pos.sub(step);
          p.vel.multiplyScalar(-0.48);
          hitSurface = true;
          break;
        }
      }

      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 11;
      p.mesh.rotation.y += dt * 13;
      p.light.position.copy(p.pos);

      const shouldPop = p.kind === 'flash' ? p.fuse <= 0 : hitSurface || p.fuse <= 0;
      if (shouldPop) {
        if (p.kind === 'flash') {
          this.detonateFlash(p.pos, levelMeshes, agents, playerEye, cameraForward, onPlayerFlashed);
          onFlashDetonate?.(p.pos);
        } else {
          this.deploySmoke(p.pos);
        }
        this.group.remove(p.mesh);
        this.group.remove(p.light);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
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
        b.mesh.scale.setScalar(1 + (1 - t) * 5.8);
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.92;
        b.light.intensity = t * 48;
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
    this.bursts.push({ mesh, light, life: 0.38, maxLife: 0.38 });

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
