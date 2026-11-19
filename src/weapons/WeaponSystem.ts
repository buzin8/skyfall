import * as THREE from 'three';
import { WeaponDef } from '../types';
import { SoundEngine } from '../audio/SoundEngine';
import { TextureLibrary } from '../textures/ProceduralTextures';

export const WEAPONS: Record<'vandal' | 'ghost' | 'knife', WeaponDef> = {
  vandal: {
    id: 'vandal',
    name: 'M41-TAC RIFLE',
    fireMode: 'AUTO',
    damageBody: 40,
    damageHead: 160,
    damageLeg: 34,
    fireRate: 9.75,
    magSize: 25,
    reserveMax: 75,
    reloadTime: 2.1,
    baseSpread: 0.0022,
    moveSpread: 0.048,
    crouchMult: 0.65,
    adsMult: 0.55,
    adsFov: 56,
    recoilPitch: 0.022,
    recoilYaw: 0.009,
    equipTime: 0.35,
    moveSpeedMult: 1.0,
    automatic: true,
    range: 110,
  },
  ghost: {
    id: 'ghost',
    name: 'GHOST SILENCED',
    fireMode: 'SEMI',
    damageBody: 32,
    damageHead: 105,
    damageLeg: 26,
    fireRate: 6.5,
    magSize: 15,
    reserveMax: 45,
    reloadTime: 1.45,
    baseSpread: 0.0026,
    moveSpread: 0.028,
    crouchMult: 0.65,
    adsMult: 0.65,
    adsFov: 62,
    recoilPitch: 0.016,
    recoilYaw: 0.005,
    equipTime: 0.25,
    moveSpeedMult: 1.08,
    automatic: false,
    range: 85,
  },
  knife: {
    id: 'knife',
    name: 'TACTICAL KNIFE',
    fireMode: 'MELEE',
    damageBody: 75,
    damageHead: 150,
    damageLeg: 65,
    fireRate: 2.1,
    magSize: 0,
    reserveMax: 0,
    reloadTime: 0,
    baseSpread: 0,
    moveSpread: 0,
    crouchMult: 1,
    adsMult: 1,
    adsFov: 74,
    recoilPitch: 0,
    recoilYaw: 0,
    equipTime: 0.2,
    moveSpeedMult: 1.24,
    automatic: false,
    range: 2.7,
  },
};

interface ActiveTracer {
  group: THREE.Group;
  outerMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ActiveShell {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
}

interface ActiveSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ActiveExplosion {
  group: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  puffs: Array<{ mesh: THREE.Mesh; dir: THREE.Vector3; speed: number }>;
  light: THREE.PointLight | null;
  life: number;
  maxLife: number;
  baseLight: number;
}

interface DynamicPulseLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  baseIntensity: number;
}

interface BulletHole {
  mesh: THREE.Mesh;
  life: number;
}

export interface ShotResult {
  fired: boolean;
  weapon: WeaponDef;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  muzzleWorld: THREE.Vector3;
}

export class WeaponSystem {
  public slotOrder: Array<'vandal' | 'ghost' | 'knife'> = ['vandal', 'ghost', 'knife'];
  public currentSlot = 0;

  public ammo: Record<'vandal' | 'ghost' | 'knife', { mag: number; reserve: number }> = {
    vandal: { mag: 25, reserve: 75 },
    ghost: { mag: 15, reserve: 45 },
    knife: { mag: 0, reserve: 0 },
  };

  public isReloading = false;
  public reloadProgress = 0;
  private reloadElapsed = 0;
  private reloadMidPlayed = false;

  public isAds = false;
  public recoilPitch = 0;
  public recoilYaw = 0;
  public currentSpread = 0.002;

  private fireCooldown = 0;
  private equipTimer = 0;
  private consecutiveShots = 0;
  private sprayResetTimer = 0;
  private kickZ = 0;
  private kickRotX = 0;
  private knifeSlashAnim = 0;
  private swayX = 0;
  private swayY = 0;

  public viewmodelRoot = new THREE.Group();
  private models: Record<'vandal' | 'ghost' | 'knife', THREE.Group>;
  private muzzlePoint = new THREE.Object3D();
  private muzzleFlashGroup = new THREE.Group();
  private muzzleLight = new THREE.PointLight(0xffaa44, 0, 12, 1.5);
  private muzzleFlashTimer = 0;

  private fxGroup = new THREE.Group();
  private tracers: ActiveTracer[] = [];
  private shells: ActiveShell[] = [];
  private sparks: ActiveSpark[] = [];
  private explosions: ActiveExplosion[] = [];
  private pulseLights: DynamicPulseLight[] = [];
  private decals: BulletHole[] = [];

  private shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.036, 6);
  private shellMat = new THREE.MeshStandardMaterial({
    color: 0xe6be5c,
    roughness: 0.25,
    metalness: 0.9,
  });
  private sparkGeo = new THREE.BoxGeometry(0.024, 0.024, 0.08);
  private emberGeo = new THREE.OctahedronGeometry(0.04, 0);
  private tracerOuterGeo = (() => {
    const g = new THREE.CylinderGeometry(0.35, 0.85, 1, 5, 1, true);
    g.rotateX(Math.PI / 2);
    return g;
  })();
  private tracerCoreGeo = (() => {
    const g = new THREE.CylinderGeometry(0.16, 0.28, 0.88, 5, 1, true);
    g.rotateX(Math.PI / 2);
    return g;
  })();
  private expCoreGeo = new THREE.IcosahedronGeometry(0.45, 1);
  private expPuffGeo = new THREE.DodecahedronGeometry(0.38, 1);
  private expRingGeo = new THREE.RingGeometry(0.2, 0.36, 20);
  private decalGeo = new THREE.CircleGeometry(0.055, 8);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x1e1a17,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  private lightPool: THREE.PointLight[] = [];

  // Shared gold/amber wrinkled sleeve & padded tactical glove materials across all viewmodels
  private matGoldSleeve: THREE.MeshStandardMaterial;
  private matGlove: THREE.MeshStandardMaterial;
  private matGlovePad: THREE.MeshStandardMaterial;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sound: SoundEngine,
    private textures?: TextureLibrary
  ) {
    this.camera.add(this.viewmodelRoot);
    this.scene.add(this.fxGroup);

    this.matGoldSleeve = new THREE.MeshStandardMaterial({
      color: 0xf0be48,
      map: textures?.goldSleeve.map ?? null,
      roughnessMap: textures?.goldSleeve.roughnessMap ?? null,
      bumpMap: textures?.goldSleeve.bumpMap ?? null,
      bumpScale: 0.032,
      roughness: 0.28,
      metalness: 0.64,
      envMapIntensity: 1.55,
    });

    // Golden-yellow leather tactical gloves with dark padded wrist cuffs (matching reference!)
    this.matGlove = new THREE.MeshStandardMaterial({
      color: 0xd99b24,
      roughness: 0.62,
      metalness: 0.18,
    });

    this.matGlovePad = new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      roughness: 0.58,
      metalness: 0.25,
    });

    // Single shared dynamic combat light (avoids multi-light PBR shader bloat for rock-solid 60 FPS)
    const combatLight = new THREE.PointLight(0xff9c38, 0, 14, 1.5);
    combatLight.visible = false;
    this.fxGroup.add(combatLight);
    this.lightPool.push(combatLight);

    this.models = {
      vandal: this.buildVandalModel(),
      ghost: this.buildGhostModel(),
      knife: this.buildKnifeModel(),
    };

    Object.values(this.models).forEach((m) => this.viewmodelRoot.add(m));
    this.buildMuzzleFlash();
    this.selectSlot(0, true);
  }

  public get currentWeapon(): WeaponDef {
    return WEAPONS[this.slotOrder[this.currentSlot]];
  }

  public get currentAmmo(): { mag: number; reserve: number } {
    return this.ammo[this.slotOrder[this.currentSlot]];
  }

  public resetAll(): void {
    this.ammo.vandal = { mag: WEAPONS.vandal.magSize, reserve: WEAPONS.vandal.reserveMax };
    this.ammo.ghost = { mag: WEAPONS.ghost.magSize, reserve: WEAPONS.ghost.reserveMax };
    this.isReloading = false;
    this.reloadProgress = 0;
    this.isAds = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.consecutiveShots = 0;
    this.kickZ = 0;
    this.kickRotX = 0;
    this.selectSlot(0, true);
  }

  public selectSlot(index: number, instant = false): void {
    if (index < 0 || index >= this.slotOrder.length) return;
    if (index === this.currentSlot && !instant) return;
    this.currentSlot = index;
    this.isReloading = false;
    this.reloadProgress = 0;
    this.isAds = false;
    this.consecutiveShots = 0;
    this.equipTimer = instant ? 0 : this.currentWeapon.equipTime;

    const id = this.slotOrder[this.currentSlot];
    this.models.vandal.visible = id === 'vandal';
    this.models.ghost.visible = id === 'ghost';
    this.models.knife.visible = id === 'knife';

    if (id === 'vandal') {
      this.muzzlePoint.position.set(0.24, -0.195, -1.06);
    } else if (id === 'ghost') {
      this.muzzlePoint.position.set(0.22, -0.2, -0.84);
    }
    this.muzzleFlashGroup.position.copy(this.muzzlePoint.position);
    this.muzzleLight.position.copy(this.muzzlePoint.position);
  }

  public startReload(): void {
    const w = this.currentWeapon;
    const a = this.currentAmmo;
    if (w.id === 'knife' || this.isReloading) return;
    if (a.mag >= w.magSize || a.reserve <= 0) return;

    this.isReloading = true;
    this.reloadElapsed = 0;
    this.reloadProgress = 0;
    this.reloadMidPlayed = false;
    this.isAds = false;
    this.sound.playReload('start');
  }

  public addSway(dx: number, dy: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.00018, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.00018, -0.03, 0.03);
  }

  public tryFire(
    isHolding: boolean,
    justPressed: boolean,
    playerSpeed: number,
    crouching: boolean,
    grounded: boolean,
    stimActive: boolean
  ): ShotResult | null {
    const w = this.currentWeapon;
    if (this.equipTimer > 0 || this.fireCooldown > 0 || this.isReloading) return null;
    if (w.automatic ? !isHolding : !justPressed) return null;

    if (w.id !== 'knife') {
      const a = this.currentAmmo;
      if (a.mag <= 0) {
        this.startReload();
        return null;
      }
      a.mag -= 1;
    }

    const rateMult = stimActive ? 1.2 : 1.0;
    this.fireCooldown = 1 / (w.fireRate * rateMult);

    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    const muzzleWorld = new THREE.Vector3();
    this.muzzlePoint.getWorldPosition(muzzleWorld);

    if (w.id === 'knife') {
      this.knifeSlashAnim = 1.0;
      this.sound.playKnifeSwing();
      return { fired: true, weapon: w, origin, direction: forward, muzzleWorld };
    }

    let spread = w.baseSpread;
    if (!grounded) {
      spread += w.moveSpread * 2.2;
    } else if (playerSpeed > 0.75) {
      const speedFactor = Math.min(1.2, playerSpeed / 5.5);
      spread += w.moveSpread * speedFactor;
    }
    if (crouching) spread *= w.crouchMult;
    if (this.isAds) spread *= w.adsMult;
    if (this.consecutiveShots >= 2) {
      spread += Math.min(0.045, (this.consecutiveShots - 1) * 0.0046);
    }

    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const randAng = Math.random() * Math.PI * 2;
    const randRad = Math.random() * spread;

    const dir = forward
      .clone()
      .addScaledVector(right, Math.cos(randAng) * randRad)
      .addScaledVector(up, Math.sin(randAng) * randRad)
      .normalize();

    const crouchRecoil = crouching ? 0.75 : 1.0;
    const adsRecoil = this.isAds ? 0.82 : 1.0;
    const pitchKick = w.recoilPitch * crouchRecoil * adsRecoil * (0.9 + Math.random() * 0.25);
    const yawDir = this.consecutiveShots > 4 ? Math.sin(this.consecutiveShots * 0.75) : (Math.random() - 0.5) * 0.5;
    const yawKick = w.recoilYaw * crouchRecoil * yawDir;

    this.recoilPitch = Math.min(0.24, this.recoilPitch + pitchKick);
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw + yawKick, -0.1, 0.1);

    this.consecutiveShots += 1;
    this.sprayResetTimer = 0.34;
    this.kickZ = w.id === 'vandal' ? 0.074 : 0.052;
    this.kickRotX = w.id === 'vandal' ? 0.105 : 0.12;

    this.triggerMuzzleFlash();
    this.spawnBrassShell(muzzleWorld, right, up, forward);

    if (w.id === 'vandal') this.sound.playVandalShot(1.0);
    else this.sound.playGhostShot();

    if (this.currentAmmo.mag === 0 && this.currentAmmo.reserve > 0) {
      setTimeout(() => {
        if (this.currentAmmo.mag === 0 && !this.isReloading) this.startReload();
      }, 220);
    }

    return { fired: true, weapon: w, origin, direction: dir, muzzleWorld };
  }

  private acquirePoolLight(pos: THREE.Vector3, color: number, intensity: number, distance: number): THREE.PointLight | null {
    const free = this.lightPool.find((l) => !l.visible);
    if (!free) return null;
    free.color.setHex(color);
    free.intensity = intensity;
    free.distance = distance;
    free.position.copy(pos);
    free.visible = true;
    return free;
  }

  public spawnPulseLight(pos: THREE.Vector3, color = 0xff9a38, intensity = 10, duration = 0.06, distance = 12): void {
    const light = this.acquirePoolLight(pos, color, intensity, distance);
    if (!light) return;
    this.pulseLights.push({ light, life: duration, maxLife: duration, baseIntensity: intensity });
  }

  public spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex = 0xffaa38, thickness = 0.016): void {
    const dist = start.distanceTo(end);
    if (dist < 0.4) return;

    const len = Math.min(dist, 9.5);
    const group = new THREE.Group();

    const outerMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerMesh = new THREE.Mesh(this.tracerOuterGeo, outerMat);
    outerMesh.scale.set(thickness, thickness, len);
    group.add(outerMesh);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(this.tracerCoreGeo, coreMat);
    coreMesh.scale.set(thickness, thickness, len);
    group.add(coreMesh);

    const t = Math.min(0.84, Math.max(0.34, len / Math.max(dist, 1)));
    const mid = new THREE.Vector3().lerpVectors(start, end, t);
    group.position.copy(mid);
    group.lookAt(end);
    this.fxGroup.add(group);

    this.tracers.push({ group, outerMat, coreMat, life: 0.075, maxLife: 0.075 });
  }

  public spawnImpact(point: THREE.Vector3, normal: THREE.Vector3, isAgent: boolean, headshot = false): void {
    const sparkColor = isAgent ? (headshot ? 0xffe066 : 0xd6342c) : 0xe0d2bc;
    const count = isAgent ? (headshot ? 12 : 7) : 7;

    if (headshot) {
      this.spawnPulseLight(point, 0xffd066, 9, 0.06, 6);
    }

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 && !isAgent ? 0xffb84d : sparkColor,
        transparent: true,
        opacity: 0.92,
      });
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.copy(point).addScaledVector(normal, 0.03);
      const scale = headshot ? 1.25 : 0.85;
      m.scale.setScalar(scale * (0.55 + Math.random() * 0.8));

      const vel = normal
        .clone()
        .multiplyScalar(2.4 + Math.random() * 4.2)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.8,
            0.7 + Math.random() * 2.8,
            (Math.random() - 0.5) * 3.8
          )
        );
      m.lookAt(m.position.clone().add(vel));

      this.fxGroup.add(m);
      this.sparks.push({ mesh: m, vel, life: 0.24 + Math.random() * 0.2, maxLife: 0.42 });
      if (this.sparks.length > 36) {
        const old = this.sparks.shift();
        if (old) {
          this.fxGroup.remove(old.mesh);
          (old.mesh.material as THREE.Material).dispose();
        }
      }
    }

    if (!isAgent) {
      const hole = new THREE.Mesh(this.decalGeo, this.decalMat);
      hole.position.copy(point).addScaledVector(normal, 0.015);
      hole.lookAt(point.clone().add(normal));
      this.fxGroup.add(hole);
      this.decals.push({ mesh: hole, life: 16 });
      if (this.decals.length > 30) {
        const old = this.decals.shift();
        if (old) this.fxGroup.remove(old.mesh);
      }
    }
  }

  public spawnExplosion(pos: THREE.Vector3, scale = 1.0, accentHex = 0xff8a2b): void {
    const group = new THREE.Group();
    group.position.copy(pos);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff5d4,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(this.expCoreGeo, coreMat);
    core.scale.setScalar(0.32 * scale);
    group.add(core);

    const ringMat = new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this.expRingGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.scale.setScalar(0.35 * scale);
    group.add(ring);

    const puffs: Array<{ mesh: THREE.Mesh; dir: THREE.Vector3; speed: number }> = [];
    for (let i = 0; i < 6; i++) {
      const isFire = i < 3;
      const pMat = new THREE.MeshBasicMaterial({
        color: isFire ? accentHex : 0x7c7872,
        transparent: true,
        opacity: isFire ? 0.76 : 0.55,
        blending: isFire ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
      });
      const puff = new THREE.Mesh(this.expPuffGeo, pMat);
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const dir = new THREE.Vector3(Math.cos(ang), 0.45 + Math.random() * 0.8, Math.sin(ang)).normalize();
      puff.scale.setScalar((0.35 + Math.random() * 0.3) * scale);
      group.add(puff);
      puffs.push({ mesh: puff, dir, speed: (1.9 + Math.random() * 2.0) * scale });
    }

    const baseLight = 24 * scale;
    const light = this.acquirePoolLight(pos.clone().add(new THREE.Vector3(0, 0.35, 0)), accentHex, baseLight, 16);

    this.fxGroup.add(group);
    this.explosions.push({ group, core, ring, puffs, light, life: 0.55, maxLife: 0.55, baseLight });

    for (let i = 0; i < 12; i++) {
      const eMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffdf88 : 0xff7a24,
        transparent: true,
        opacity: 0.95,
      });
      const ember = new THREE.Mesh(this.emberGeo, eMat);
      ember.position.copy(pos).add(new THREE.Vector3(0, 0.25, 0));
      ember.scale.setScalar((0.45 + Math.random() * 0.7) * scale);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        2.0 + Math.random() * 5.2,
        (Math.random() - 0.5) * 8.0
      );
      this.fxGroup.add(ember);
      this.sparks.push({ mesh: ember, vel, life: 0.45 + Math.random() * 0.4, maxLife: 0.85 });
    }
  }

  private triggerMuzzleFlash(): void {
    this.muzzleFlashTimer = 0.04;
    this.muzzleFlashGroup.visible = true;
    this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI;
    const baseScale = this.currentWeapon.id === 'ghost' ? 0.58 : this.isAds ? 0.62 : 0.96;
    const s = baseScale * (0.9 + Math.random() * 0.26);
    this.muzzleFlashGroup.scale.setScalar(s);
    this.muzzleLight.intensity = (this.currentWeapon.id === 'ghost' ? 4 : 11) + Math.random() * 3;
  }

  private spawnBrassShell(
    muzzleWorld: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
    forward: THREE.Vector3
  ): void {
    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position
      .copy(muzzleWorld)
      .addScaledVector(forward, -0.34)
      .addScaledVector(right, 0.08);
    this.fxGroup.add(mesh);

    const vel = right
      .clone()
      .multiplyScalar(1.8 + Math.random() * 1.1)
      .addScaledVector(up, 1.4 + Math.random() * 0.8)
      .addScaledVector(forward, -0.4);

    this.shells.push({
      mesh,
      vel,
      rotVel: new THREE.Vector3(12 + Math.random() * 10, 14, 9),
      life: 2.2,
    });
  }

  public update(
    dt: number,
    playerSpeed: number,
    crouching: boolean,
    grounded: boolean,
    adsHeld: boolean
  ): void {
    const w = this.currentWeapon;
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.equipTimer > 0) this.equipTimer = Math.max(0, this.equipTimer - dt);

    this.isAds = adsHeld && w.id !== 'knife' && !this.isReloading && this.equipTimer <= 0;

    const targetFov = this.isAds ? w.adsFov : 74;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 14));
      this.camera.updateProjectionMatrix();
    }

    if (this.isReloading) {
      this.reloadElapsed += dt;
      this.reloadProgress = Math.min(1, this.reloadElapsed / w.reloadTime);
      if (!this.reloadMidPlayed && this.reloadProgress >= 0.48) {
        this.reloadMidPlayed = true;
        this.sound.playReload('mid');
      }
      if (this.reloadElapsed >= w.reloadTime) {
        const a = this.currentAmmo;
        const needed = w.magSize - a.mag;
        const load = Math.min(needed, a.reserve);
        a.mag += load;
        a.reserve -= load;
        this.isReloading = false;
        this.reloadProgress = 0;
        this.sound.playReload('done');
      }
    }

    if (this.sprayResetTimer > 0) {
      this.sprayResetTimer -= dt;
    } else {
      this.consecutiveShots = 0;
    }
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, Math.min(1, dt * 10.5));
    this.recoilYaw = THREE.MathUtils.lerp(this.recoilYaw, 0, Math.min(1, dt * 9.5));

    let liveSpread = w.baseSpread;
    if (!grounded) liveSpread += w.moveSpread * 1.8;
    else if (playerSpeed > 0.65) liveSpread += w.moveSpread * Math.min(1.1, playerSpeed / 5.5);
    if (crouching) liveSpread *= w.crouchMult;
    if (this.isAds) liveSpread *= w.adsMult;
    liveSpread += this.recoilPitch * 0.25;
    this.currentSpread = THREE.MathUtils.lerp(this.currentSpread, liveSpread, Math.min(1, dt * 18));

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashGroup.visible = false;
        this.muzzleLight.intensity = 0;
      } else {
        this.muzzleLight.intensity *= 0.82;
      }
    }

    this.kickZ = THREE.MathUtils.lerp(this.kickZ, 0, Math.min(1, dt * 18));
    this.kickRotX = THREE.MathUtils.lerp(this.kickRotX, 0, Math.min(1, dt * 16));
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, Math.min(1, dt * 10));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, Math.min(1, dt * 10));
    if (this.knifeSlashAnim > 0) this.knifeSlashAnim = Math.max(0, this.knifeSlashAnim - dt * 4.8);

    const t = performance.now() * 0.001;
    const bobAmp = grounded && playerSpeed > 0.6 ? Math.min(1, playerSpeed / 5.5) * 0.011 : 0.0022;
    const bobX = Math.cos(t * 9.5) * bobAmp;
    const bobY = Math.abs(Math.sin(t * 9.5)) * bobAmp * 0.8;

    const adsBlend = this.isAds ? 1 : 0;
    const baseX = THREE.MathUtils.lerp(0.0, -0.15, adsBlend);
    const baseY = THREE.MathUtils.lerp(0.0, 0.068, adsBlend);
    const baseZ = THREE.MathUtils.lerp(0.0, 0.065, adsBlend);

    const reloadDip = this.isReloading ? Math.sin(this.reloadProgress * Math.PI) * -0.18 : 0;
    const equipDip = this.equipTimer > 0 ? -(this.equipTimer / Math.max(0.1, w.equipTime)) * 0.25 : 0;
    const slashRot = Math.sin(this.knifeSlashAnim * Math.PI) * -0.9;
    const slashFwd = Math.sin(this.knifeSlashAnim * Math.PI) * -0.18;

    this.viewmodelRoot.position.set(
      baseX + this.swayX + bobX,
      baseY + this.swayY - bobY + reloadDip + equipDip,
      baseZ + this.kickZ + slashFwd
    );
    this.viewmodelRoot.rotation.set(
      this.kickRotX + reloadDip * 1.4 + slashRot * 0.45,
      this.swayX * 1.6 + slashRot * 0.65,
      -this.swayX * 1.2 + (this.isReloading ? -0.35 * Math.sin(this.reloadProgress * Math.PI) : 0)
    );

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.fxGroup.remove(tr.group);
        tr.outerMat.dispose();
        tr.coreMat.dispose();
        this.tracers.splice(i, 1);
      } else {
        const k = tr.life / tr.maxLife;
        tr.outerMat.opacity = k * 0.62;
        tr.coreMat.opacity = k * 0.72;
      }
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= dt;
      sh.vel.y -= 13.5 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      if (sh.mesh.position.y < 0.015) {
        sh.mesh.position.y = 0.015;
        sh.vel.y *= -0.35;
        sh.vel.x *= 0.6;
        sh.vel.z *= 0.6;
        sh.rotVel.multiplyScalar(0.5);
      }
      sh.mesh.rotation.x += sh.rotVel.x * dt;
      sh.mesh.rotation.y += sh.rotVel.y * dt;
      if (sh.life <= 0) {
        this.fxGroup.remove(sh.mesh);
        this.shells.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.vel.y -= 11.2 * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      if (sp.mesh.position.y < 0.025) {
        sp.mesh.position.y = 0.025;
        sp.vel.y *= -0.45;
        sp.vel.x *= 0.72;
        sp.vel.z *= 0.72;
      }
      if (sp.life <= 0) {
        this.fxGroup.remove(sp.mesh);
        (sp.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      } else {
        (sp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, sp.life / sp.maxLife);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.life -= dt;
      const progress = 1 - Math.max(0, ex.life / ex.maxLife);
      const fade = Math.max(0, ex.life / ex.maxLife);

      ex.core.scale.setScalar(0.32 + progress * 2.0);
      (ex.core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - progress * 1.45) * 0.9);

      ex.ring.scale.setScalar(0.35 + progress * 4.2);
      (ex.ring.material as THREE.MeshBasicMaterial).opacity = fade * 0.65;

      for (const p of ex.puffs) {
        p.mesh.position.addScaledVector(p.dir, p.speed * dt * (1.2 - progress * 0.7));
        p.mesh.position.y += dt * 1.2;
        p.mesh.scale.multiplyScalar(1 + dt * 1.2);
        p.mesh.rotation.x += dt * 2.2;
        p.mesh.rotation.y += dt * 1.6;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = fade * 0.65;
      }

      if (ex.light) {
        ex.light.intensity = ex.baseLight * fade * fade;
      }

      if (ex.life <= 0) {
        if (ex.light) {
          ex.light.intensity = 0;
          ex.light.visible = false;
        }
        this.fxGroup.remove(ex.group);
        (ex.core.material as THREE.Material).dispose();
        (ex.ring.material as THREE.Material).dispose();
        for (const p of ex.puffs) (p.mesh.material as THREE.Material).dispose();
        this.explosions.splice(i, 1);
      }
    }

    for (let i = this.pulseLights.length - 1; i >= 0; i--) {
      const pl = this.pulseLights[i];
      pl.life -= dt;
      if (pl.life <= 0) {
        pl.light.intensity = 0;
        pl.light.visible = false;
        this.pulseLights.splice(i, 1);
      } else {
        pl.light.intensity = pl.baseIntensity * (pl.life / pl.maxLife);
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.fxGroup.remove(d.mesh);
        this.decals.splice(i, 1);
      }
    }
  }

  private buildMuzzleFlash(): void {
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff7824,
      transparent: true,
      opacity: 0.76,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c2,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const angles = [0.28, Math.PI - 0.28, Math.PI + 0.28, -0.28];
    for (const ang of angles) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.21, 4), outerMat);
      spike.rotation.z = ang - Math.PI / 2;
      spike.position.set(Math.cos(ang) * 0.08, Math.sin(ang) * 0.08, -0.02);
      this.muzzleFlashGroup.add(spike);
    }

    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.25, 6), outerMat);
    jet.rotation.x = -Math.PI / 2;
    jet.position.z = -0.11;
    this.muzzleFlashGroup.add(jet);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.044, 0), coreMat);
    this.muzzleFlashGroup.add(core);

    if (this.textures?.flashSprite) {
      const spriteMat = new THREE.SpriteMaterial({
        map: this.textures.flashSprite,
        color: 0xff9e3d,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      });
      const flare = new THREE.Sprite(spriteMat);
      flare.scale.set(0.3, 0.3, 1);
      this.muzzleFlashGroup.add(flare);
    }

    this.muzzleFlashGroup.visible = false;
    this.viewmodelRoot.add(this.muzzlePoint);
    this.viewmodelRoot.add(this.muzzleFlashGroup);
    this.viewmodelRoot.add(this.muzzleLight);
  }

  /**
   * Detailed foreground tactical rifle with Picatinny rail, rear aperture sight,
   * anodized green rotary knob, "GAME OVER, MAN." receiver stencil decal,
   * and articulated arms wearing metallic gold/amber wrinkled combat sleeves + padded gloves!
   */
  private buildVandalModel(): THREE.Group {
    const root = new THREE.Group();
    root.position.set(0.21, -0.225, -0.42);
    root.rotation.set(0.05, -0.14, 0.035); // Angled hero framing showcasing Picatinny rail, GAME OVER MAN stencil, green rotary knob & gold sleeves!

    const gunmetal = new THREE.MeshStandardMaterial({
      color: 0x242830,
      roughness: 0.36,
      metalness: 0.72,
      envMapIntensity: 1.35,
    });
    const forestGreenLower = new THREE.MeshStandardMaterial({
      color: 0x2d6830,
      roughness: 0.38,
      metalness: 0.55,
      envMapIntensity: 1.3,
    });
    const darkPolymer = new THREE.MeshStandardMaterial({
      color: 0x171a20,
      roughness: 0.65,
      metalness: 0.22,
    });
    const barrelSteel = new THREE.MeshStandardMaterial({
      color: 0x454d58,
      roughness: 0.3,
      metalness: 0.86,
      envMapIntensity: 1.45,
    });
    // Signature vibrant green anodized ribbed rotary knob & yellow inner accent!
    const greenAnodized = new THREE.MeshStandardMaterial({
      color: 0x2fc94a,
      roughness: 0.24,
      metalness: 0.76,
      envMapIntensity: 1.55,
    });
    const yellowTrim = new THREE.MeshStandardMaterial({
      color: 0xf2bc29,
      roughness: 0.32,
      metalness: 0.55,
    });

    // Main sculpted upper black receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.088, 0.52), gunmetal);
    receiver.position.set(0, 0.032, 0.02);
    root.add(receiver);

    // Metallic forest-green lower anodized chassis matching reference!
    const lowerRec = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.064, 0.42), forestGreenLower);
    lowerRec.position.set(0, -0.042, 0.06);
    root.add(lowerRec);

    // Hand-painted white "GAME OVER, MAN." stencil spanning black upper & green lower receiver side!
    if (this.textures?.rifleStencil) {
      const stencilMat = new THREE.MeshStandardMaterial({
        map: this.textures.rifleStencil,
        roughness: 0.4,
        metalness: 0.55,
        envMapIntensity: 1.25,
      });
      const sidePanel = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.148), stencilMat);
      sidePanel.rotation.y = -Math.PI / 2;
      sidePanel.position.set(-0.048, 0.0, 0.02);
      root.add(sidePanel);
    }

    // Chunky Full-Length Top Picatinny Rail with crisp machined teeth!
    const railBase = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.018, 0.68), barrelSteel);
    railBase.position.set(0, 0.084, -0.1);
    root.add(railBase);
    for (let z = 0.21; z >= -0.41; z -= 0.03) {
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.012, 0.016), darkPolymer);
      lug.position.set(0, 0.096, z);
      root.add(lug);
    }

    // Rear Aperture Iron Sight with protective wings & yellow sight accent
    const sightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.026, 0.068), darkPolymer);
    sightBlock.position.set(0, 0.106, 0.09);
    root.add(sightBlock);

    for (const sx of [-0.025, 0.025]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.046, 0.045), gunmetal);
      ear.position.set(sx, 0.132, 0.09);
      root.add(ear);
    }
    const peepRing = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0045, 6, 12), barrelSteel);
    peepRing.position.set(0, 0.132, 0.09);
    root.add(peepRing);
    const sightYellow = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.035), yellowTrim);
    sightYellow.position.set(0, 0.104, 0.13);
    root.add(sightYellow);

    // Prominent Ribbed Green Anodized Rotary Drum Knob on top-left rear receiver (hero detail from reference!)
    const knobDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.034, 16), greenAnodized);
    knobDrum.position.set(-0.042, 0.102, 0.145);
    knobDrum.rotation.z = 0.28;
    root.add(knobDrum);
    const knobTopRing = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 16), yellowTrim);
    knobTopRing.rotation.x = Math.PI / 2;
    knobTopRing.position.set(-0.046, 0.118, 0.145);
    root.add(knobTopRing);

    // Secondary small green anodized selector switch accent on lower receiver
    const selector = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.034), greenAnodized);
    selector.position.set(-0.048, -0.022, 0.11);
    selector.rotation.x = -0.35;
    root.add(selector);

    // Ventilated tactical handguard shroud + side heat vents & greebles
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.095, 0.36), gunmetal);
    handguard.position.set(0, 0.024, -0.34);
    root.add(handguard);

    for (let i = 0; i < 5; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.015, 0.032), darkPolymer);
      vent.position.set(0, 0.044, -0.2 - i * 0.058);
      root.add(vent);
      const lowerVent = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.012, 0.026), barrelSteel);
      lowerVent.position.set(0, 0.005, -0.2 - i * 0.058);
      root.add(lowerVent);
    }

    // Hooded front iron sight post
    const frontBase = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, 0.036), gunmetal);
    frontBase.position.set(0, 0.096, -0.47);
    root.add(frontBase);
    const frontHood = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, 6, 12), gunmetal);
    frontHood.position.set(0, 0.126, -0.47);
    root.add(frontHood);
    const frontPin = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.024, 0.005), greenAnodized);
    frontPin.position.set(0, 0.12, -0.47);
    root.add(frontPin);

    // Machined barrel + slotted flash hider
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.3, 10), barrelSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.034, -0.57);
    root.add(barrel);

    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.08, 8), darkPolymer);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.034, -0.71);
    root.add(flashHider);

    // Curved ribbed magazine & rear ergonomic pistol grip + stock
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.22, 0.084), darkPolymer);
    mag.position.set(0, -0.13, -0.15);
    mag.rotation.x = 0.24;
    root.add(mag);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.15, 0.068), darkPolymer);
    grip.position.set(0, -0.12, 0.11);
    grip.rotation.x = -0.26;
    root.add(grip);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.115, 0.24), darkPolymer);
    stock.position.set(0, -0.005, 0.34);
    root.add(stock);

    // ===== ARTICULATED FIRST-PERSON ARMS WITH METALLIC GOLD/AMBER WRINKLED SLEEVES & PADDED GLOVES =====
    // Left support arm gripping the forward handguard
    const leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.38, 12), this.matGoldSleeve);
    leftSleeve.position.set(-0.155, -0.165, -0.07);
    leftSleeve.rotation.set(0.92, 0.26, -0.44);
    root.add(leftSleeve);

    // Wrist cuff seam
    const leftCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.045, 10), this.matGlovePad);
    leftCuff.position.set(-0.075, -0.075, -0.2);
    leftCuff.rotation.set(0.92, 0.26, -0.44);
    root.add(leftCuff);

    // Padded tactical left glove cradling the forend
    const leftGlovePalm = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.082, 0.115), this.matGlove);
    leftGlovePalm.position.set(-0.025, -0.032, -0.27);
    leftGlovePalm.rotation.z = 0.22;
    root.add(leftGlovePalm);

    const leftKnucklePad = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.024, 0.045), this.matGlovePad);
    leftKnucklePad.position.set(-0.048, -0.008, -0.28);
    leftKnucklePad.rotation.z = 0.55;
    root.add(leftKnucklePad);

    const leftThumb = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, 0.078), this.matGlove);
    leftThumb.position.set(-0.054, 0.024, -0.255);
    root.add(leftThumb);

    // Right trigger arm (metallic gold sleeve + padded glove gripping rear pistol grip)
    const rightSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.066, 0.32, 12), this.matGoldSleeve);
    rightSleeve.position.set(0.085, -0.21, 0.25);
    rightSleeve.rotation.set(1.08, -0.18, 0.34);
    root.add(rightSleeve);

    const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.092, 0.1), this.matGlove);
    rightGlove.position.set(0.008, -0.115, 0.125);
    root.add(rightGlove);

    const rightPad = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.03, 0.048), this.matGlovePad);
    rightPad.position.set(0.024, -0.09, 0.145);
    root.add(rightPad);

    return root;
  }

  private buildGhostModel(): THREE.Group {
    const root = new THREE.Group();
    root.position.set(0.22, -0.24, -0.42);

    const slideMat = new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.32, metalness: 0.82 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.68, metalness: 0.25 });
    const sightDot = new THREE.MeshBasicMaterial({ color: 0x32df68 });

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.064, 0.27), slideMat);
    slide.position.set(0, 0.03, -0.04);
    root.add(slide);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 12), gripMat);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.038, -0.28);
    root.add(suppressor);

    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.011, 0.011), sightDot);
    dot.position.set(0, 0.068, -0.15);
    root.add(dot);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.14, 0.065), gripMat);
    grip.position.set(0, -0.06, 0.04);
    grip.rotation.x = 0.22;
    root.add(grip);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.098), this.matGlove);
    hand.position.set(0, -0.055, 0.05);
    root.add(hand);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.32, 12), this.matGoldSleeve);
    sleeve.position.set(0.06, -0.17, 0.21);
    sleeve.rotation.set(1.05, -0.15, 0.25);
    root.add(sleeve);

    return root;
  }

  private buildKnifeModel(): THREE.Group {
    const root = new THREE.Group();
    root.position.set(0.24, -0.23, -0.38);
    root.rotation.set(0.15, -0.35, 0.22);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xbac4d0,
      roughness: 0.22,
      metalness: 0.92,
      envMapIntensity: 1.5,
    });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 0.72 });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.14, 8), handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -0.02, 0.06);
    root.add(handle);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.018), handleMat);
    guard.position.set(0, -0.02, -0.01);
    root.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.044, 0.27), bladeMat);
    blade.position.set(0, -0.01, -0.145);
    root.add(blade);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.08, 0.095), this.matGlove);
    hand.position.set(0, -0.03, 0.065);
    root.add(hand);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 12), this.matGoldSleeve);
    sleeve.position.set(0.05, -0.14, 0.22);
    sleeve.rotation.set(1.05, -0.15, 0.25);
    root.add(sleeve);

    return root;
  }
}
