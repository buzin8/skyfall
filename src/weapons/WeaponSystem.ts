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
  private adsProgress = 0;

  private readonly vandalHipPos = new THREE.Vector3(0.295, -0.195, -0.53);
  private readonly vandalHipRot = new THREE.Euler(0.038, 0.42, -0.02);
  private readonly vandalAdsPos = new THREE.Vector3(0.0, -0.168, -0.34);
  private readonly vandalAdsRot = new THREE.Euler(0.0, 0.0, 0.0);

  private readonly ghostHipPos = new THREE.Vector3(0.24, -0.21, -0.45);
  private readonly ghostHipRot = new THREE.Euler(0.035, 0.24, -0.025);
  private readonly ghostAdsPos = new THREE.Vector3(0.0, -0.102, -0.34);
  private readonly ghostAdsRot = new THREE.Euler(0.0, 0.0, 0.0);

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

  // Shared bare operator forearm & black fingerless tactical combat glove materials across all viewmodels
  private matSkin: THREE.MeshStandardMaterial;
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

    // Natural matte human skin (warm-neutral complexion, zero plastic specular glare!)
    this.matSkin = new THREE.MeshStandardMaterial({
      color: 0xe4b8a2,
      map: textures?.operatorSkin.map ?? null,
      roughnessMap: textures?.operatorSkin.roughnessMap ?? null,
      bumpMap: textures?.operatorSkin.bumpMap ?? null,
      bumpScale: 0.007,
      emissive: new THREE.Color(0x362019),
      emissiveIntensity: 0.16,
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.28,
    });

    // Matte pebbled black leather/neoprene tactical fingerless combat gloves
    this.matGlove = new THREE.MeshStandardMaterial({
      color: 0x2d323b,
      map: textures?.tacticalGlove.map ?? null,
      roughnessMap: textures?.tacticalGlove.roughnessMap ?? null,
      bumpMap: textures?.tacticalGlove.bumpMap ?? null,
      bumpScale: 0.02,
      emissive: new THREE.Color(0x0d0f14),
      emissiveIntensity: 0.14,
      roughness: 0.76,
      metalness: 0.08,
      envMapIntensity: 0.65,
    });

    this.matGlovePad = new THREE.MeshStandardMaterial({
      color: 0x191d24,
      map: textures?.tacticalGlove.map ?? null,
      bumpMap: textures?.tacticalGlove.bumpMap ?? null,
      bumpScale: 0.016,
      roughness: 0.62,
      metalness: 0.18,
      envMapIntensity: 0.8,
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
    this.adsProgress = 0;

    // Parent muzzle FX directly onto active weapon barrel so tracers & flash stay locked in hipfire AND ADS!
    if (id === 'vandal') {
      this.models.vandal.add(this.muzzlePoint, this.muzzleFlashGroup, this.muzzleLight);
      this.muzzlePoint.position.set(0, 0.036, -0.58);
    } else if (id === 'ghost') {
      this.models.ghost.add(this.muzzlePoint, this.muzzleFlashGroup, this.muzzleLight);
      this.muzzlePoint.position.set(0, 0.044, -0.51);
    } else {
      this.viewmodelRoot.add(this.muzzlePoint, this.muzzleFlashGroup, this.muzzleLight);
      this.muzzlePoint.position.set(0.2, -0.2, -0.5);
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
    const adsTarget = this.isAds ? 1 : 0;
    this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, adsTarget, Math.min(1, dt * 14));

    // Smooth hipfire <-> true red-dot ADS interpolation on active firearm
    if (w.id === 'vandal') {
      this.models.vandal.position.lerpVectors(this.vandalHipPos, this.vandalAdsPos, this.adsProgress);
      this.models.vandal.rotation.set(
        THREE.MathUtils.lerp(this.vandalHipRot.x, this.vandalAdsRot.x, this.adsProgress),
        THREE.MathUtils.lerp(this.vandalHipRot.y, this.vandalAdsRot.y, this.adsProgress),
        THREE.MathUtils.lerp(this.vandalHipRot.z, this.vandalAdsRot.z, this.adsProgress)
      );
    } else if (w.id === 'ghost') {
      this.models.ghost.position.lerpVectors(this.ghostHipPos, this.ghostAdsPos, this.adsProgress);
      this.models.ghost.rotation.set(
        THREE.MathUtils.lerp(this.ghostHipRot.x, this.ghostAdsRot.x, this.adsProgress),
        THREE.MathUtils.lerp(this.ghostHipRot.y, this.ghostAdsRot.y, this.adsProgress),
        THREE.MathUtils.lerp(this.ghostHipRot.z, this.ghostAdsRot.z, this.adsProgress)
      );
    }

    const adsDamp = 1 - this.adsProgress * 0.72;
    const bobAmp = (grounded && playerSpeed > 0.6 ? Math.min(1, playerSpeed / 5.5) * 0.01 : 0.0018) * adsDamp;
    const bobX = Math.cos(t * 9.5) * bobAmp;
    const bobY = Math.abs(Math.sin(t * 9.5)) * bobAmp * 0.8;

    const reloadDip = this.isReloading ? Math.sin(this.reloadProgress * Math.PI) * -0.18 : 0;
    const equipDip = this.equipTimer > 0 ? -(this.equipTimer / Math.max(0.1, w.equipTime)) * 0.25 : 0;
    const slashRot = Math.sin(this.knifeSlashAnim * Math.PI) * -0.9;
    const slashFwd = Math.sin(this.knifeSlashAnim * Math.PI) * -0.18;

    this.viewmodelRoot.position.set(
      this.swayX * adsDamp + bobX,
      this.swayY * adsDamp - bobY + reloadDip + equipDip,
      this.kickZ * (1 - this.adsProgress * 0.35) + slashFwd
    );
    this.viewmodelRoot.rotation.set(
      this.kickRotX * (1 - this.adsProgress * 0.45) + reloadDip * 1.4 + slashRot * 0.45,
      this.swayX * 1.3 * adsDamp + slashRot * 0.65,
      -this.swayX * 0.9 * adsDamp + (this.isReloading ? -0.35 * Math.sin(this.reloadProgress * Math.PI) : 0)
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
   * Tactical Desert-Tan / Matte-Black Assault Rifle POV with open-window reflex red-dot optic,
   * winged front iron sight, folded rear BUIS, recessed cyan status LED, sculpted side lever,
   * curved tan-spined magazine, bare muscular forearm, black fingerless tactical gloves, and C-clamp bare thumb!
   */
  private buildVandalModel(): THREE.Group {
    const root = new THREE.Group();
    root.position.copy(this.vandalHipPos);
    root.rotation.copy(this.vandalHipRot);

    const tanBody = new THREE.MeshStandardMaterial({
      color: 0xe3c380,
      map: this.textures?.desertTan.map ?? null,
      roughnessMap: this.textures?.desertTan.roughnessMap ?? null,
      bumpMap: this.textures?.desertTan.bumpMap ?? null,
      bumpScale: 0.008,
      emissive: new THREE.Color(0x4a391b),
      emissiveIntensity: 0.28,
      roughness: 0.4,
      metalness: 0.24,
      envMapIntensity: 1.35,
    });
    const tanTrim = new THREE.MeshStandardMaterial({
      color: 0xc5a05e,
      map: this.textures?.desertTan.map ?? null,
      emissive: new THREE.Color(0x362812),
      emissiveIntensity: 0.22,
      roughness: 0.46,
      metalness: 0.3,
      envMapIntensity: 1.25,
    });
    const matteBlack = new THREE.MeshStandardMaterial({
      color: 0x1a1e25,
      emissive: new THREE.Color(0x0b0e12),
      emissiveIntensity: 0.18,
      roughness: 0.52,
      metalness: 0.34,
      envMapIntensity: 1.25,
    });
    const gunmetal = new THREE.MeshStandardMaterial({
      color: 0x3b4350,
      roughness: 0.3,
      metalness: 0.82,
      envMapIntensity: 1.5,
    });
    const cyanLed = new THREE.MeshBasicMaterial({ color: 0x56f6ff });

    const UP = new THREE.Vector3(0, 1, 0);
    const addTaperedSegment = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      rFrom: number,
      rTo: number,
      mat: THREE.Material,
      radialSegs = 12
    ) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTo, rFrom, len, radialSegs), mat);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
      root.add(mesh);
      return mesh;
    };

    const makeRoundedRectShape = (w: number, h: number, r: number): THREE.Shape => {
      const hw = w / 2;
      const hh = h / 2;
      const s = new THREE.Shape();
      s.moveTo(-hw + r, -hh);
      s.lineTo(hw - r, -hh);
      s.quadraticCurveTo(hw, -hh, hw, -hh + r);
      s.lineTo(hw, hh - r);
      s.quadraticCurveTo(hw, hh, hw - r, hh);
      s.lineTo(-hw + r, hh);
      s.quadraticCurveTo(-hw, hh, -hw, hh - r);
      s.lineTo(-hw, -hh + r);
      s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
      return s;
    };

    // ===== SCULPTED STOCK WITH BEVELED TAN CHEEK RISER =====
    const stockFrame = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.088, 0.42), matteBlack);
    stockFrame.position.set(0, -0.015, 0.37);
    root.add(stockFrame);

    const stockCheek = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.042, 0.38), tanBody);
    stockCheek.position.set(0, 0.04, 0.375);
    stockCheek.rotation.x = -0.045;
    root.add(stockCheek);

    const stockSidePlate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.036, 0.34), tanTrim);
    stockSidePlate.position.set(0, -0.008, 0.385);
    root.add(stockSidePlate);

    const stockHinge = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.105, 0.034), matteBlack);
    stockHinge.position.set(0, 0.005, 0.175);
    root.add(stockHinge);

    // ===== SCULPTED BEVELED DESERT-TAN RECEIVER & MATTE BLACK LOWER CHASSIS =====
    const innerCore = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.112, 0.36), matteBlack);
    innerCore.position.set(0, -0.008, -0.01);
    root.add(innerCore);

    // Beveled desert-tan upper receiver shroud
    const recProfile = makeRoundedRectShape(0.082, 0.062, 0.012);
    const upperRecGeo = new THREE.ExtrudeGeometry(recProfile, {
      depth: 0.35,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.005,
      bevelSegments: 2,
    });
    upperRecGeo.translate(0, 0, -0.175);
    const upperRec = new THREE.Mesh(upperRecGeo, tanBody);
    upperRec.position.set(0, 0.044, -0.005);
    root.add(upperRec);

    // Rear lower tan trigger housing wrapping back cleanly
    const lowerRearTan = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.072, 0.16), tanBody);
    lowerRearTan.position.set(0, -0.028, 0.085);
    root.add(lowerRearTan);

    // Recessed dark angular side cutout + signature cyan micro-LED + diagonal charging/bolt lever
    const sideRecess = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.195), matteBlack);
    sideRecess.position.set(-0.042, 0.012, -0.035);
    root.add(sideRecess);

    const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.012, 0.036), cyanLed);
    ledStrip.position.set(-0.046, -0.012, -0.045);
    root.add(ledStrip);

    // Diagonal sculpted tan side lever + round pivot boss (iconic detail from reference!)
    const leverHub = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.016, 12), tanTrim);
    leverHub.rotation.z = Math.PI / 2;
    leverHub.position.set(-0.047, -0.028, 0.075);
    root.add(leverHub);
    const leverHubBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.02, 8), gunmetal);
    leverHubBolt.rotation.z = Math.PI / 2;
    leverHubBolt.position.set(-0.048, -0.028, 0.075);
    root.add(leverHubBolt);

    const leverArm = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.015, 0.13), tanBody);
    leverArm.position.set(-0.049, 0.002, 0.022);
    leverArm.rotation.x = 0.42;
    root.add(leverArm);

    const frontCheek = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.028, 0.165), tanBody);
    frontCheek.position.set(0, 0.014, -0.145);
    root.add(frontCheek);

    // ===== TOP PICATINNY RAIL =====
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.013, 0.61), matteBlack);
    topRail.position.set(0, 0.084, -0.14);
    root.add(topRail);
    for (let z = 0.15; z >= -0.43; z -= 0.026) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.008, 0.012), gunmetal);
      tooth.position.set(0, 0.092, z);
      root.add(tooth);
    }

    // ===== COMPACT FOLDED BLACK BACKUP REAR SIGHT (sits cleanly behind the tan reflex optic!) =====
    const rearBuis = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.02, 0.062), matteBlack);
    rearBuis.position.set(0, 0.104, 0.105);
    root.add(rearBuis);
    const rearBuisKnurl = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.058, 10), gunmetal);
    rearBuisKnurl.rotation.z = Math.PI / 2;
    rearBuisKnurl.position.set(0, 0.108, 0.115);
    root.add(rearBuisKnurl);

    // ===== HERO SMOOTH ROUNDED OPEN-WINDOW DESERT-TAN REFLEX RED-DOT OPTIC =====
    const opticZ = -0.022;
    const opticClamp = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.014, 0.095), matteBlack);
    opticClamp.position.set(0, 0.102, opticZ);
    root.add(opticClamp);

    // Sleek beveled desert-tan riser mount block
    const riserShape = makeRoundedRectShape(0.052, 0.036, 0.006);
    const riserGeo = new THREE.ExtrudeGeometry(riserShape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelSegments: 2,
    });
    riserGeo.translate(0, 0, -0.045);
    const opticBase = new THREE.Mesh(riserGeo, tanBody);
    opticBase.position.set(0, 0.126, opticZ);
    root.add(opticBase);

    for (const bz of [-0.046, 0.004]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.062, 8), gunmetal);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(0, 0.123, bz);
      root.add(bolt);
    }

    // Smooth curved rounded-arch open reflex optic hood (ExtrudeGeometry with window hole -> zero blocky corners!)
    const opticCenterY = 0.172;
    const hoodOuter = makeRoundedRectShape(0.064, 0.058, 0.015);
    const hoodHole = makeRoundedRectShape(0.05, 0.044, 0.011);
    hoodOuter.holes.push(hoodHole);
    const hoodGeo = new THREE.ExtrudeGeometry(hoodOuter, {
      depth: 0.034,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    hoodGeo.translate(0, 0, -0.017);
    const opticHood = new THREE.Mesh(hoodGeo, tanBody);
    opticHood.position.set(0, opticCenterY, opticZ - 0.018);
    root.add(opticHood);

    // Subtle dark inner anti-glare bezel ring inside the optic hood
    const innerOuter = makeRoundedRectShape(0.051, 0.045, 0.011);
    const innerHole = makeRoundedRectShape(0.046, 0.04, 0.009);
    innerOuter.holes.push(innerHole);
    const innerBezelGeo = new THREE.ExtrudeGeometry(innerOuter, { depth: 0.03, bevelEnabled: false });
    innerBezelGeo.translate(0, 0, -0.015);
    const innerBezel = new THREE.Mesh(innerBezelGeo, matteBlack);
    innerBezel.position.set(0, opticCenterY, opticZ - 0.018);
    root.add(innerBezel);

    // Crisp anti-reflective subtly green-tinted clear glass pane + glowing crimson red-dot reticle!
    const reflexGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.046, 0.04),
      new THREE.MeshBasicMaterial({
        color: 0x6dffaa,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    reflexGlass.position.set(0, opticCenterY, opticZ - 0.018);
    root.add(reflexGlass);

    const reflexDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0026, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff3b1f,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
      })
    );
    reflexDot.position.set(0, 0.168, opticZ - 0.016);
    root.add(reflexDot);

    // ===== FORWARD VENTED HANDGUARD, RIBBED RAIL & WINGED FRONT IRON SIGHT =====
    const handguardCore = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.068, 0.31), matteBlack);
    handguardCore.position.set(0, 0.008, -0.32);
    root.add(handguardCore);

    for (let z = -0.2; z >= -0.43; z -= 0.024) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.012), matteBlack);
      rib.position.set(0, 0.01, z);
      root.add(rib);
    }

    // Beveled desert-tan upper handguard shroud with dark cooling vents
    const hgProfile = makeRoundedRectShape(0.076, 0.04, 0.009);
    const hgGeo = new THREE.ExtrudeGeometry(hgProfile, {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 2,
    });
    hgGeo.translate(0, 0, -0.13);
    const hgTanTop = new THREE.Mesh(hgGeo, tanBody);
    hgTanTop.position.set(0, 0.052, -0.315);
    root.add(hgTanTop);

    for (let i = 0; i < 4; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.011, 0.025), matteBlack);
      slot.position.set(0, 0.052, -0.22 - i * 0.054);
      root.add(slot);
    }

    // Iconic Tall Winged Matte-Black Front Iron Sight Post (protective U-ears + thin front blade!)
    const fsBase = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.02, 0.032), matteBlack);
    fsBase.position.set(0, 0.096, -0.455);
    root.add(fsBase);

    for (const sx of [-1, 1]) {
      const wingLow = new THREE.Mesh(new THREE.BoxGeometry(0.0055, 0.034, 0.014), matteBlack);
      wingLow.position.set(sx * 0.015, 0.12, -0.455);
      wingLow.rotation.z = sx * -0.24;
      root.add(wingLow);

      const wingTip = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, 0.012), matteBlack);
      wingTip.position.set(sx * 0.017, 0.142, -0.455);
      wingTip.rotation.z = sx * 0.34;
      root.add(wingTip);
    }
    const fsPin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.032, 0.005), gunmetal);
    fsPin.position.set(0, 0.122, -0.455);
    root.add(fsPin);

    // Compact gunmetal barrel & tactical compensator muzzle
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.15, 10), gunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.036, -0.5);
    root.add(barrel);

    const comp = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.018, 0.062, 8), matteBlack);
    comp.rotation.x = Math.PI / 2;
    comp.position.set(0, 0.036, -0.555);
    root.add(comp);

    // ===== CURVED MAG (matte black sides + desert-tan front edge spine) & PISTOL GRIP =====
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.24, 0.078), matteBlack);
    magBody.position.set(0, -0.142, -0.12);
    magBody.rotation.x = 0.2;
    root.add(magBody);

    const magTanSpine = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.23, 0.022), tanBody);
    magTanSpine.position.set(0, -0.145, -0.157);
    magTanSpine.rotation.x = 0.2;
    root.add(magTanSpine);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.15, 0.066), matteBlack);
    grip.position.set(0, -0.122, 0.105);
    grip.rotation.x = -0.26;
    root.add(grip);

    // ===== CONTINUOUS SCULPTED LOFTED HANDS (Zero cylinder seams, zero puffy spheres, true cupped palm!) =====
    // 1. Bare muscular left forearm sweeping cleanly up at a natural diagonal from bottom-left into the wrist cuff
    const leftForearm = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(-0.42, -0.37, -0.05), rx: 0.062, ry: 0.052, twist: 0.18 },
        { pos: new THREE.Vector3(-0.30, -0.27, -0.145), rx: 0.058, ry: 0.047, twist: 0.14 },
        { pos: new THREE.Vector3(-0.195, -0.175, -0.225), rx: 0.048, ry: 0.038, twist: 0.1 },
        { pos: new THREE.Vector3(-0.125, -0.112, -0.278), rx: 0.039, ry: 0.031, twist: 0.06 },
        { pos: new THREE.Vector3(-0.105, -0.095, -0.296), rx: 0.037, ry: 0.03, twist: 0.06 },
      ],
      this.matSkin,
      { steps: 18, radialSegs: 20 }
    );
    root.add(leftForearm);

    // 2. Tailored matte-black tactical fingerless glove (cuff -> contoured heel -> cupped palm UNDER handguard!)
    const leftGlove = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(-0.126, -0.113, -0.277), rx: 0.0435, ry: 0.035, twist: 0.06, squircle: 0.05 },
        { pos: new THREE.Vector3(-0.114, -0.102, -0.288), rx: 0.0415, ry: 0.033, twist: 0.1, squircle: 0.08 },
        { pos: new THREE.Vector3(-0.084, -0.076, -0.312), rx: 0.047, ry: 0.034, twist: 0.28, squircle: 0.22 },
        { pos: new THREE.Vector3(-0.044, -0.052, -0.34), rx: 0.052, ry: 0.03, twist: 0.52, squircle: 0.35 },
        { pos: new THREE.Vector3(-0.002, -0.044, -0.356), rx: 0.046, ry: 0.024, twist: 0.85, squircle: 0.3 },
        { pos: new THREE.Vector3(0.032, -0.038, -0.362), rx: 0.034, ry: 0.018, twist: 1.05, squircle: 0.2 },
      ],
      this.matGlove,
      { steps: 20, radialSegs: 22, capEnd: true }
    );
    root.add(leftGlove);

    // Subtle dark leather cuff hem & wrist closure seam hugging the forearm edge cleanly
    const cuffHem = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(-0.131, -0.118, -0.272), rx: 0.045, ry: 0.0365, twist: 0.06 },
        { pos: new THREE.Vector3(-0.12, -0.108, -0.282), rx: 0.0445, ry: 0.036, twist: 0.08 },
      ],
      this.matGlovePad,
      { steps: 4, radialSegs: 20 }
    );
    root.add(cuffHem);

    // 4 smoothly lofted gloved fingers curling tightly up around the far underside of the black handguard
    for (let f = 0; f < 4; f++) {
      const fz = -0.315 - f * 0.022;
      const rScale = f === 3 ? 0.84 : f === 0 ? 0.96 : 1.0;
      const finger = this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(0.002, -0.052, fz), rx: 0.0115 * rScale, ry: 0.0105 * rScale },
          { pos: new THREE.Vector3(0.034, -0.045, fz - 0.004), rx: 0.0108 * rScale, ry: 0.0098 * rScale },
          { pos: new THREE.Vector3(0.046, -0.016, fz - 0.008), rx: 0.0096 * rScale, ry: 0.0088 * rScale },
          { pos: new THREE.Vector3(0.04, 0.014, fz - 0.01), rx: 0.0082 * rScale, ry: 0.0074 * rScale },
        ],
        this.matGlove,
        { steps: 10, radialSegs: 12, capEnd: true }
      );
      root.add(finger);
    }

    // 3. Continuous sculpted BARE LEFT THUMB rising seamlessly out of the fingerless glove cutout along the left rail!
    const thumbCutoutHem = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(-0.072, -0.054, -0.324), rx: 0.026, ry: 0.022, twist: 0.1 },
        { pos: new THREE.Vector3(-0.064, -0.028, -0.344), rx: 0.0215, ry: 0.018, twist: 0.12 },
      ],
      this.matGlovePad,
      { steps: 5, radialSegs: 16 }
    );
    root.add(thumbCutoutHem);

    const leftBareThumb = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(-0.07, -0.044, -0.33), rx: 0.0235, ry: 0.0195, twist: 0.1 },
        { pos: new THREE.Vector3(-0.06, -0.014, -0.354), rx: 0.0175, ry: 0.0145, twist: 0.14 },
        { pos: new THREE.Vector3(-0.051, 0.016, -0.384), rx: 0.0148, ry: 0.012, twist: 0.18 },
        { pos: new THREE.Vector3(-0.044, 0.042, -0.41), rx: 0.0128, ry: 0.01, twist: 0.2 },
        { pos: new THREE.Vector3(-0.041, 0.058, -0.425), rx: 0.0102, ry: 0.008, twist: 0.2 },
      ],
      this.matSkin,
      { steps: 14, radialSegs: 16, capEnd: true }
    );
    root.add(leftBareThumb);

    // 4. Right trigger hand: continuous sculpted bare right thumb & palm web tucked cleanly beneath rear receiver!
    const rightThumb = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(0.012, -0.135, 0.145), rx: 0.028, ry: 0.022 },
        { pos: new THREE.Vector3(-0.016, -0.105, 0.118), rx: 0.019, ry: 0.0155 },
        { pos: new THREE.Vector3(-0.038, -0.076, 0.088), rx: 0.0148, ry: 0.0122 },
        { pos: new THREE.Vector3(-0.046, -0.06, 0.064), rx: 0.0115, ry: 0.0095 },
      ],
      this.matSkin,
      { steps: 12, radialSegs: 14, capEnd: true }
    );
    root.add(rightThumb);

    const rightHandGrip = this.buildLoftedSurface(
      [
        { pos: new THREE.Vector3(0.01, -0.125, 0.125), rx: 0.038, ry: 0.032, squircle: 0.2 },
        { pos: new THREE.Vector3(0.028, -0.148, 0.168), rx: 0.042, ry: 0.034, squircle: 0.15 },
        { pos: new THREE.Vector3(0.068, -0.195, 0.265), rx: 0.046, ry: 0.036 },
        { pos: new THREE.Vector3(0.115, -0.255, 0.375), rx: 0.054, ry: 0.044 },
      ],
      this.matSkin,
      { steps: 12, radialSegs: 16 }
    );
    root.add(rightHandGrip);

    return root;
  }

  private makeRoundedRect(w: number, h: number, r: number): THREE.Shape {
    const hw = w / 2;
    const hh = h / 2;
    const s = new THREE.Shape();
    s.moveTo(-hw + r, -hh);
    s.lineTo(hw - r, -hh);
    s.quadraticCurveTo(hw, -hh, hw, -hh + r);
    s.lineTo(hw, hh - r);
    s.quadraticCurveTo(hw, hh, hw - r, hh);
    s.lineTo(-hw + r, hh);
    s.quadraticCurveTo(-hw, hh, -hw, hh - r);
    s.lineTo(-hw, -hh + r);
    s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    return s;
  }

  /**
   * Continuous rotation-minimizing (parallel transport) lofted organic surface generator.
   * Produces silky-smooth sculpted forearms, fitted leather gloves, palms, curved fingers, and thumbs
   * with zero cylinder seams, zero ball joints, and natural dome-capped tips.
   */
  private buildLoftedSurface(
    stations: Array<{ pos: THREE.Vector3; rx: number; ry: number; twist?: number; squircle?: number }>,
    mat: THREE.Material,
    opts: { steps?: number; radialSegs?: number; capEnd?: boolean } = {}
  ): THREE.Mesh {
    const steps = opts.steps ?? 16;
    const radialSegs = opts.radialSegs ?? 18;
    const capEnd = opts.capEnd ?? false;

    const curve = new THREE.CatmullRomCurve3(stations.map((s) => s.pos));
    const nSt = stations.length - 1;

    const sampleScalar = (
      t: number,
      getter: (s: { rx: number; ry: number; twist?: number; squircle?: number }) => number
    ) => {
      const scaled = t * nSt;
      const idx = Math.min(nSt - 1, Math.floor(scaled));
      const f = scaled - idx;
      const u = f * f * (3 - 2 * f);
      return getter(stations[idx]) * (1 - u) + getter(stations[idx + 1]) * u;
    };

    const rings: Array<{
      center: THREE.Vector3;
      rAxis: THREE.Vector3;
      uAxis: THREE.Vector3;
      rx: number;
      ry: number;
      squircle: number;
      v: number;
    }> = [];

    const prevT = curve.getTangent(0).normalize();
    const refUp = Math.abs(prevT.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const frameR = new THREE.Vector3().crossVectors(prevT, refUp).normalize();
    const frameU = new THREE.Vector3().crossVectors(frameR, prevT).normalize();
    const qRot = new THREE.Quaternion();

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const center = curve.getPoint(t);
      const curT = curve.getTangent(t).normalize();
      if (i > 0) {
        qRot.setFromUnitVectors(prevT, curT);
        frameR.applyQuaternion(qRot).normalize();
        frameU.crossVectors(frameR, curT).normalize();
        prevT.copy(curT);
      }

      const twist = sampleScalar(t, (s) => s.twist ?? 0);
      const ca = Math.cos(twist);
      const sa = Math.sin(twist);
      const rAxis = frameR.clone().multiplyScalar(ca).addScaledVector(frameU, sa);
      const uAxis = frameU.clone().multiplyScalar(ca).addScaledVector(frameR, -sa);

      rings.push({
        center,
        rAxis,
        uAxis,
        rx: sampleScalar(t, (s) => s.rx),
        ry: sampleScalar(t, (s) => s.ry),
        squircle: sampleScalar(t, (s) => s.squircle ?? 0),
        v: t,
      });
    }

    if (capEnd) {
      const last = rings[rings.length - 1];
      const endT = curve.getTangent(1).normalize();
      const domeLen = (last.rx + last.ry) * 0.48;
      for (const phi of [0.52, 1.02, 1.46]) {
        const scale = Math.cos(phi);
        const offset = Math.sin(phi) * domeLen;
        rings.push({
          center: last.center.clone().addScaledVector(endT, offset),
          rAxis: last.rAxis.clone(),
          uAxis: last.uAxis.clone(),
          rx: Math.max(0.0006, last.rx * scale),
          ry: Math.max(0.0006, last.ry * scale),
          squircle: last.squircle * scale,
          v: 1 + (phi / 1.57) * 0.08,
        });
      }
    }

    const cols = radialSegs + 1;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const pow = 1 - ring.squircle * 0.36;
      for (let c = 0; c <= radialSegs; c++) {
        const theta = (c / radialSegs) * Math.PI * 2;
        const cx = Math.cos(theta);
        const cy = Math.sin(theta);
        const sx = Math.sign(cx) * Math.pow(Math.abs(cx), pow);
        const sy = Math.sign(cy) * Math.pow(Math.abs(cy), pow);

        const vx = ring.center.x + ring.rAxis.x * (sx * ring.rx) + ring.uAxis.x * (sy * ring.ry);
        const vy = ring.center.y + ring.rAxis.y * (sx * ring.rx) + ring.uAxis.y * (sy * ring.ry);
        const vz = ring.center.z + ring.rAxis.z * (sx * ring.rx) + ring.uAxis.z * (sy * ring.ry);
        positions.push(vx, vy, vz);
        uvs.push(c / radialSegs, ring.v);
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      for (let c = 0; c < radialSegs; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const d = (r + 1) * cols + c;
        const e = d + 1;
        indices.push(a, d, b);
        indices.push(b, d, e);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }

  /**
   * Sculpted Suppressed Tactical Sidearm ("GHOST SILENCED"):
   * Beveled titanium-gunmetal slide with cocking serrations, bronze barrel chamber,
   * fluted octagonal suppressor, micro open-window RMR green-dot reflex optic,
   * two-tone desert-tan/black polymer frame with underbarrel laser module,
   * hollow trigger guard, and realistic two-handed bare-forearm / leather fingerless glove hold!
   */
private buildGhostModel(): THREE.Group {
    const root = new THREE.Group();
    root.position.copy(this.ghostHipPos);
    root.rotation.copy(this.ghostHipRot);

    const slideSteel = new THREE.MeshStandardMaterial({
      color: 0x262c36,
      emissive: new THREE.Color(0x090c12),
      emissiveIntensity: 0.14,
      roughness: 0.28,
      metalness: 0.86,
      envMapIntensity: 1.55,
    });
    const tanFrame = new THREE.MeshStandardMaterial({
      color: 0xd4b274,
      map: this.textures?.desertTan.map ?? null,
      roughnessMap: this.textures?.desertTan.roughnessMap ?? null,
      bumpMap: this.textures?.desertTan.bumpMap ?? null,
      bumpScale: 0.008,
      emissive: new THREE.Color(0x332512),
      emissiveIntensity: 0.18,
      roughness: 0.46,
      metalness: 0.2,
      envMapIntensity: 1.2,
    });
    const matteBlack = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      emissive: new THREE.Color(0x07090d),
      emissiveIntensity: 0.12,
      roughness: 0.54,
      metalness: 0.36,
      envMapIntensity: 1.15,
    });
    const bronzeBarrel = new THREE.MeshStandardMaterial({
      color: 0xb98d4a,
      roughness: 0.22,
      metalness: 0.92,
      envMapIntensity: 1.65,
    });
    const boreBlack = new THREE.MeshBasicMaterial({ color: 0x050608 });
    const greenDotMat = new THREE.MeshBasicMaterial({ color: 0x39ff88 });
    const laserLensMat = new THREE.MeshBasicMaterial({ color: 0x44f4ff });

    // ===== SLEEK BEVELED SLIDE (narrower & longer profile) =====
    const slideShape = this.makeRoundedRect(0.036, 0.038, 0.007);
    const slideGeo = new THREE.ExtrudeGeometry(slideShape, {
      depth: 0.275,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelSegments: 2,
    });
    slideGeo.translate(0, 0, -0.1375);
    const slide = new THREE.Mesh(slideGeo, slideSteel);
    slide.position.set(0, 0.046, -0.048);
    root.add(slide);

    // Rear & front slide cocking serrations
    for (let i = 0; i < 6; i++) {
      const sRear = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.022, 0.0045), matteBlack);
      sRear.position.set(0, 0.046, 0.072 - i * 0.01);
      sRear.rotation.x = 0.24;
      root.add(sRear);
    }
    for (let i = 0; i < 4; i++) {
      const sFront = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.02, 0.0045), matteBlack);
      sFront.position.set(0, 0.046, -0.122 - i * 0.01);
      sFront.rotation.x = 0.24;
      root.add(sFront);
    }

    // Bronze match barrel chamber in ejection port
    const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.022, 0.062), bronzeBarrel);
    chamber.position.set(0.006, 0.056, -0.048);
    root.add(chamber);

    // ===== MICRO OPEN-WINDOW RMR OPTIC (aligned with ghostAdsPos y = -0.112) =====
    const rmrBase = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.013, 0.06), matteBlack);
    rmrBase.position.set(0, 0.076, 0.022);
    root.add(rmrBase);

    const rmrOuter = this.makeRoundedRect(0.039, 0.032, 0.009);
    const rmrHole = this.makeRoundedRect(0.03, 0.023, 0.006);
    rmrOuter.holes.push(rmrHole);
    const rmrHoodGeo = new THREE.ExtrudeGeometry(rmrOuter, {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.0018,
      bevelSegments: 2,
    });
    rmrHoodGeo.translate(0, 0, -0.011);
    const rmrHood = new THREE.Mesh(rmrHoodGeo, matteBlack);
    rmrHood.position.set(0, 0.1, 0.016);
    root.add(rmrHood);

    const rmrGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.029, 0.022),
      new THREE.MeshBasicMaterial({
        color: 0x56ffc8,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    rmrGlass.position.set(0, 0.1, 0.016);
    root.add(rmrGlass);

    const rmrDot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 10), greenDotMat);
    rmrDot.position.set(0, 0.102, 0.018);
    root.add(rmrDot);

    // Suppressor-height front tritium sight
    const frontBlade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.011), matteBlack);
    frontBlade.position.set(0, 0.076, -0.172);
    root.add(frontBlade);
    const frontTritium = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0055, 0.004), greenDotMat);
    frontTritium.position.set(0, 0.081, -0.166);
    root.add(frontTritium);

    // ===== SMOOTH CYLINDRICAL TACTICAL SUPPRESSOR =====
    const threadCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.032, 16), bronzeBarrel);
    threadCollar.rotation.x = Math.PI / 2;
    threadCollar.position.set(0, 0.045, -0.202);
    root.add(threadCollar);

    const suppressorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.285, 20), matteBlack);
    suppressorBody.rotation.x = Math.PI / 2;
    suppressorBody.position.set(0, 0.045, -0.356);
    root.add(suppressorBody);

    for (const sz of [-0.255, -0.34, -0.43]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0212, 0.0212, 0.012, 20), slideSteel);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.045, sz);
      root.add(band);
    }

    const supCap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.016, 20), slideSteel);
    supCap.rotation.x = Math.PI / 2;
    supCap.position.set(0, 0.045, -0.504);
    root.add(supCap);

    const supBore = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 14), boreBlack);
    supBore.rotation.y = Math.PI;
    supBore.position.set(0, 0.045, -0.513);
    root.add(supBore);

    // ===== LOWER FRAME, BEAVERTAIL, UNDERBARREL MODULE & TRIGGER GUARD =====
    const lowerFrameShape = this.makeRoundedRect(0.035, 0.024, 0.005);
    const lowerFrameGeo = new THREE.ExtrudeGeometry(lowerFrameShape, {
      depth: 0.255,
      bevelEnabled: true,
      bevelThickness: 0.0025,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    lowerFrameGeo.translate(0, 0, -0.1275);
    const lowerFrame = new THREE.Mesh(lowerFrameGeo, tanFrame);
    lowerFrame.position.set(0, 0.016, -0.042);
    root.add(lowerFrame);

    // Rear beavertail tang
    const beavertail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.036), tanFrame);
    beavertail.position.set(0, 0.02, 0.095);
    root.add(beavertail);

    // Slide release lever
    const slideStop = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.009, 0.04), matteBlack);
    slideStop.position.set(-0.021, 0.026, 0.016);
    root.add(slideStop);

    // Compact underbarrel laser/light module
    const lamBody = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, 0.088), matteBlack);
    lamBody.position.set(0, -0.012, -0.12);
    root.add(lamBody);
    const lamLightBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14), slideSteel);
    lamLightBezel.rotation.x = Math.PI / 2;
    lamLightBezel.position.set(0, -0.012, -0.168);
    root.add(lamLightBezel);
    const lamCyanDot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.014), laserLensMat);
    lamCyanDot.position.set(-0.017, -0.011, -0.11);
    root.add(lamCyanDot);

    // Hollow trigger guard + curved trigger
    const tgOuter = this.makeRoundedRect(0.062, 0.044, 0.009);
    const tgHole = this.makeRoundedRect(0.048, 0.03, 0.006);
    tgOuter.holes.push(tgHole);
    const tgGeo = new THREE.ExtrudeGeometry(tgOuter, { depth: 0.014, bevelEnabled: false });
    tgGeo.rotateY(Math.PI / 2);
    tgGeo.translate(-0.007, 0, 0);
    const triggerGuard = new THREE.Mesh(tgGeo, tanFrame);
    triggerGuard.position.set(0, -0.016, -0.028);
    root.add(triggerGuard);

    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.009), slideSteel);
    trigger.position.set(0, -0.013, -0.02);
    trigger.rotation.x = 0.25;
    root.add(trigger);

    // ===== PROPERLY ANGLED ERGONOMIC GRIP (negative X rotation tilts bottom backward toward +Z!) =====
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.14, 0.056), tanFrame);
    grip.position.set(0, -0.06, 0.058);
    grip.rotation.x = -0.24;
    root.add(grip);

    const gripPanel = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.1, 0.04), matteBlack);
    gripPanel.position.set(0, -0.058, 0.058);
    gripPanel.rotation.x = -0.24;
    root.add(gripPanel);

    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.02, 0.06), slideSteel);
    magBase.position.set(0, -0.132, 0.075);
    magBase.rotation.x = -0.24;
    root.add(magBase);

    // ===== CLEAN TWO-HANDED TACTICAL PISTOL GRIP =====
    // Right forearm + gloved firing hand
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(0.27, -0.35, 0.36), rx: 0.058, ry: 0.047 },
          { pos: new THREE.Vector3(0.16, -0.225, 0.245), rx: 0.05, ry: 0.04 },
          { pos: new THREE.Vector3(0.068, -0.125, 0.15), rx: 0.038, ry: 0.03 },
          { pos: new THREE.Vector3(0.052, -0.106, 0.132), rx: 0.035, ry: 0.028 },
        ],
        this.matSkin,
        { steps: 14, radialSegs: 18 }
      )
    );
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(0.068, -0.125, 0.15), rx: 0.041, ry: 0.033, squircle: 0.1 },
          { pos: new THREE.Vector3(0.038, -0.082, 0.108), rx: 0.042, ry: 0.031, squircle: 0.22 },
          { pos: new THREE.Vector3(0.012, -0.058, 0.068), rx: 0.04, ry: 0.026, squircle: 0.28 },
          { pos: new THREE.Vector3(-0.008, -0.055, 0.042), rx: 0.032, ry: 0.02, squircle: 0.2 },
        ],
        this.matGlove,
        { steps: 14, radialSegs: 18, capEnd: true }
      )
    );
    // Bare right thumb resting high along the left side of the tang
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(-0.006, -0.032, 0.088), rx: 0.016, ry: 0.013 },
          { pos: new THREE.Vector3(-0.021, -0.008, 0.056), rx: 0.013, ry: 0.0105 },
          { pos: new THREE.Vector3(-0.026, 0.006, 0.022), rx: 0.0105, ry: 0.0085 },
        ],
        this.matSkin,
        { steps: 10, radialSegs: 12, capEnd: true }
      )
    );

    // Left forearm + support glove cupping the firing hand + forward support thumb
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(-0.35, -0.36, 0.28), rx: 0.058, ry: 0.047 },
          { pos: new THREE.Vector3(-0.21, -0.225, 0.185), rx: 0.05, ry: 0.04 },
          { pos: new THREE.Vector3(-0.095, -0.12, 0.115), rx: 0.038, ry: 0.03 },
          { pos: new THREE.Vector3(-0.076, -0.102, 0.1), rx: 0.035, ry: 0.028 },
        ],
        this.matSkin,
        { steps: 14, radialSegs: 18 }
      )
    );
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(-0.095, -0.12, 0.115), rx: 0.041, ry: 0.033, squircle: 0.08 },
          { pos: new THREE.Vector3(-0.055, -0.08, 0.078), rx: 0.043, ry: 0.031, twist: 0.22, squircle: 0.24 },
          { pos: new THREE.Vector3(-0.022, -0.06, 0.045), rx: 0.042, ry: 0.025, twist: 0.45, squircle: 0.3 },
          { pos: new THREE.Vector3(0.008, -0.056, 0.028), rx: 0.031, ry: 0.018, twist: 0.72, squircle: 0.2 },
        ],
        this.matGlove,
        { steps: 14, radialSegs: 18, capEnd: true }
      )
    );
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(-0.04, -0.038, 0.052), rx: 0.017, ry: 0.014 },
          { pos: new THREE.Vector3(-0.031, -0.012, 0.012), rx: 0.0135, ry: 0.011 },
          { pos: new THREE.Vector3(-0.026, 0.006, -0.038), rx: 0.011, ry: 0.0088 },
          { pos: new THREE.Vector3(-0.024, 0.01, -0.06), rx: 0.009, ry: 0.0072 },
        ],
        this.matSkin,
        { steps: 12, radialSegs: 14, capEnd: true }
      )
    );

    return root;
  }

  /**
   * Sculpted Special-Forces Tactical Combat Tanto Knife ("TACTICAL KNIFE"):
   * Curved beveled drop-point/tanto blade with polished razor cutting edge, dark titanium core,
   * recessed fuller blood-groove, sawback spine serrations, bolted G10 + desert-tan grip scales,
   * tactical pommel ring, and realistic bare forearm + matte fingerless leather glove combat hold!
   */
  private buildKnifeModel(): THREE.Group {
    const root = new THREE.Group();
    root.position.set(0.28, -0.205, -0.43);
    root.rotation.set(0.14, 0.32, 0.24);

    const darkBladeCore = new THREE.MeshStandardMaterial({
      color: 0x222730,
      emissive: new THREE.Color(0x090c10),
      emissiveIntensity: 0.16,
      roughness: 0.32,
      metalness: 0.86,
      envMapIntensity: 1.55,
    });
    const razorEdgeSteel = new THREE.MeshStandardMaterial({
      color: 0xd8e2ee,
      roughness: 0.14,
      metalness: 0.96,
      envMapIntensity: 2.1,
    });
    const tanScaleMat = new THREE.MeshStandardMaterial({
      color: 0xd9b879,
      map: this.textures?.desertTan.map ?? null,
      roughnessMap: this.textures?.desertTan.roughnessMap ?? null,
      emissive: new THREE.Color(0x3a2b14),
      emissiveIntensity: 0.22,
      roughness: 0.48,
      metalness: 0.22,
      envMapIntensity: 1.25,
    });
    const g10Black = new THREE.MeshStandardMaterial({
      color: 0x181c22,
      roughness: 0.62,
      metalness: 0.24,
    });

    // ===== SCULPTED CURVED TACTICAL TANTO BLADE (ExtrudeGeometry — ZERO flat rectangle!) =====
    // Blade silhouette drawn in Y-Z profile (X=length forward along -Z after rotateY, Y=blade height)
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0.0, -0.022); // Ricasso bottom heel
    bladeShape.lineTo(0.2, -0.024); // Main belly cutting edge
    bladeShape.lineTo(0.275, -0.008); // Aggressive angled tanto secondary point
    bladeShape.lineTo(0.325, 0.022); // Razor spear/tanto tip!
    bladeShape.lineTo(0.24, 0.026); // False top clip swedge
    bladeShape.lineTo(0.055, 0.024); // Spine
    bladeShape.quadraticCurveTo(0.025, 0.032, 0.0, 0.024); // Ergonomic thumb ramp
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.0055,
      bevelEnabled: true,
      bevelThickness: 0.0022,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    bladeGeo.translate(0, 0, -0.00275);
    bladeGeo.rotateY(Math.PI / 2); // +X -> -Z forward!
    const bladeCore = new THREE.Mesh(bladeGeo, darkBladeCore);
    bladeCore.position.set(0, 0.014, -0.025);
    root.add(bladeCore);

    // Gleaming polished metallic razor bevel edge running along the lower cutting edge & tanto tip!
    const edgeShape = new THREE.Shape();
    edgeShape.moveTo(0.005, -0.024);
    edgeShape.lineTo(0.204, -0.027);
    edgeShape.lineTo(0.28, -0.01);
    edgeShape.lineTo(0.331, 0.022);
    edgeShape.lineTo(0.312, 0.018);
    edgeShape.lineTo(0.268, -0.002);
    edgeShape.lineTo(0.196, -0.014);
    edgeShape.lineTo(0.005, -0.014);
    edgeShape.closePath();
    const edgeGeo = new THREE.ExtrudeGeometry(edgeShape, {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.0012,
      bevelSize: 0.0012,
      bevelSegments: 1,
    });
    edgeGeo.translate(0, 0, -0.002);
    edgeGeo.rotateY(Math.PI / 2);
    const bladeEdge = new THREE.Mesh(edgeGeo, razorEdgeSteel);
    bladeEdge.position.set(0, 0.014, -0.025);
    root.add(bladeEdge);

    // Recessed titanium fuller (blood groove) + tactical sawback spine teeth
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.008, 0.165), g10Black);
    fuller.position.set(0, 0.022, -0.14);
    root.add(fuller);

    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.008), razorEdgeSteel);
      tooth.position.set(0, 0.04, -0.095 - i * 0.015);
      tooth.rotation.x = 0.65;
      root.add(tooth);
    }

    // ===== SCULPTED CROSSGUARD BOLSTER, DESERT-TAN G10 HANDLE & TACTICAL POMMEL RING =====
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.072, 0.018), darkBladeCore);
    guard.position.set(0, 0.004, -0.022);
    root.add(guard);

    const handleShape = this.makeRoundedRect(0.026, 0.044, 0.009);
    const handleGeo = new THREE.ExtrudeGeometry(handleShape, {
      depth: 0.145,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelSegments: 2,
    });
    handleGeo.translate(0, 0, -0.0725);
    const handleCore = new THREE.Mesh(handleGeo, g10Black);
    handleCore.position.set(0, 0.004, 0.056);
    root.add(handleCore);

    // Desert-tan G10 contoured side grip inlays + steel torx bolts (matches rifle palette!)
    const tanInlay = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, 0.112), tanScaleMat);
    tanInlay.position.set(0, 0.004, 0.056);
    root.add(tanInlay);

    for (const bz of [0.015, 0.095]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.036, 8), razorEdgeSteel);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(0, 0.004, bz);
      root.add(bolt);
    }

    // Tactical finger-ring / glass-breaker pommel at rear of grip
    const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16), darkBladeCore);
    pommelRing.rotation.y = Math.PI / 2;
    pommelRing.position.set(0, -0.002, 0.152);
    root.add(pommelRing);

    // ===== CONTINUOUS LOFTED BARE FOREARM + FITTED MATTE LEATHER FINGERLESS GLOVE GRIPPING KNIFE =====
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(0.28, -0.35, 0.36), rx: 0.06, ry: 0.049 },
          { pos: new THREE.Vector3(0.165, -0.205, 0.245), rx: 0.052, ry: 0.042 },
          { pos: new THREE.Vector3(0.072, -0.092, 0.155), rx: 0.039, ry: 0.031 },
          { pos: new THREE.Vector3(0.054, -0.07, 0.135), rx: 0.037, ry: 0.029 },
        ],
        this.matSkin,
        { steps: 14, radialSegs: 18 }
      )
    );
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(0.072, -0.092, 0.155), rx: 0.043, ry: 0.034, squircle: 0.08 },
          { pos: new THREE.Vector3(0.04, -0.046, 0.106), rx: 0.045, ry: 0.033, squircle: 0.22 },
          { pos: new THREE.Vector3(0.014, -0.008, 0.058), rx: 0.045, ry: 0.029, squircle: 0.3 },
          { pos: new THREE.Vector3(-0.006, -0.004, 0.018), rx: 0.036, ry: 0.022, squircle: 0.2 },
        ],
        this.matGlove,
        { steps: 14, radialSegs: 18, capEnd: true }
      )
    );

    // 4 smoothly lofted gloved fingers wrapped tightly around the left side of the handle
    for (let f = 0; f < 4; f++) {
      const fz = 0.01 + f * 0.024;
      const rScale = f === 3 ? 0.85 : 1.0;
      root.add(
        this.buildLoftedSurface(
          [
            { pos: new THREE.Vector3(0.018, -0.024, fz), rx: 0.0115 * rScale, ry: 0.0102 * rScale },
            { pos: new THREE.Vector3(-0.016, -0.026, fz), rx: 0.0108 * rScale, ry: 0.0095 * rScale },
            { pos: new THREE.Vector3(-0.026, -0.002, fz), rx: 0.0098 * rScale, ry: 0.0086 * rScale },
            { pos: new THREE.Vector3(-0.014, 0.016, fz), rx: 0.0082 * rScale, ry: 0.0074 * rScale },
          ],
          this.matGlove,
          { steps: 8, radialSegs: 12, capEnd: true }
        )
      );
    }

    // Continuous sculpted bare right thumb braced cleanly on the blade's top thumb-ramp jimping!
    root.add(
      this.buildLoftedSurface(
        [
          { pos: new THREE.Vector3(-0.016, -0.002, 0.072), rx: 0.019, ry: 0.015 },
          { pos: new THREE.Vector3(-0.022, 0.024, 0.035), rx: 0.0145, ry: 0.0118 },
          { pos: new THREE.Vector3(-0.015, 0.042, -0.01), rx: 0.0118, ry: 0.0094 },
          { pos: new THREE.Vector3(-0.01, 0.046, -0.032), rx: 0.0096, ry: 0.0078 },
        ],
        this.matSkin,
        { steps: 12, radialSegs: 14, capEnd: true }
      )
    );

    return root;
  }
}
