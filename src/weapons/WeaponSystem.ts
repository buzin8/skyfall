import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WeaponDef, WeaponId } from '../types';
import { SoundEngine } from '../audio/SoundEngine';
import { TextureLibrary } from '../textures/ProceduralTextures';
import {
  buildBrushedGunmetalTexture,
  buildSharpScarCerakoteTexture,
  buildSmoothAkWoodTexture,
  smoothGeometryNormals,
} from '../utils/MeshSmoothing';

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  vandal: {
    id: 'vandal',
    name: 'AKM 7.62',
    fireMode: 'AUTO',
    damageBody: 40,
    damageHead: 160,
    damageLeg: 32,
    fireRate: 9.8,
    magSize: 30,
    reserveMax: 120,
    reloadTime: 2.2,
    baseSpread: 0.002,
    moveSpread: 0.045,
    crouchMult: 0.62,
    adsMult: 0.5,
    adsFov: 56,
    recoilPitch: 0.021,
    recoilYaw: 0.0085,
    equipTime: 0.32,
    moveSpeedMult: 1.0,
    automatic: true,
    range: 115,
  },
  scarl: {
    id: 'scarl',
    name: 'SCAR-L',
    fireMode: 'AUTO',
    damageBody: 34,
    damageHead: 136,
    damageLeg: 28,
    fireRate: 10.8,
    magSize: 30,
    reserveMax: 120,
    reloadTime: 1.95,
    baseSpread: 0.0014,
    moveSpread: 0.036,
    crouchMult: 0.58,
    adsMult: 0.42,
    adsFov: 53,
    recoilPitch: 0.0155,
    recoilYaw: 0.0062,
    equipTime: 0.3,
    moveSpeedMult: 1.02,
    automatic: true,
    range: 120,
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
  isBlood?: boolean;
  splattered?: boolean;
}

interface ActiveBloodPuff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
}

interface ActiveBloodPool {
  mesh: THREE.Mesh;
  life: number;
  age: number;
  targetScale: number;
}

interface DroppedWeapon {
  group: THREE.Group;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  settled: boolean;
  life: number;
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
  isBlood?: boolean;
}

export interface ShotResult {
  fired: boolean;
  weapon: WeaponDef;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  muzzleWorld: THREE.Vector3;
}

export class WeaponSystem {
  public slotOrder: WeaponId[] = ['vandal', 'scarl'];
  public currentSlot = 0;

  public ammo: Record<WeaponId, { mag: number; reserve: number }> = {
    vandal: { mag: WEAPONS.vandal.magSize, reserve: WEAPONS.vandal.reserveMax },
    scarl: { mag: WEAPONS.scarl.magSize, reserve: WEAPONS.scarl.reserveMax },
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
  private kickZVel = 0;
  private kickRotX = 0;
  private kickRotVel = 0;
  private swayX = 0;
  private swayY = 0;
  private adsProgress = 0;
  private smoothSpeed = 0;
  private bobPhase = 0;
  private breathPhase = 0;

  // Cryzen.io-inspired bottom-right hipfire & dead-center ADS framing for both AKM 7.62 and SCAR-L
  private readonly vandalHipPos = new THREE.Vector3(0.215, -0.178, -0.4);
  private readonly vandalHipRot = new THREE.Euler(0.012, 0.055, -0.012);
  private readonly vandalAdsPos = new THREE.Vector3(0.0, -0.116, -0.35);
  private readonly vandalAdsRot = new THREE.Euler(0.0, 0.0, 0.0);

  private readonly scarHipPos = new THREE.Vector3(0.22, -0.172, -0.41);
  private readonly scarHipRot = new THREE.Euler(0.012, 0.06, -0.012);
  private readonly scarAdsPos = new THREE.Vector3(0.0, -0.118, -0.27);
  private readonly scarAdsRot = new THREE.Euler(0.0, 0.0, 0.0);

  public viewmodelRoot = new THREE.Group();
  private models: Record<'vandal', THREE.Group>;
  private akmMeshes: THREE.Object3D[] = [];
  private scarLGroup: THREE.Group;
  private scarBoltCarrier: THREE.Object3D | null = null;
  private scarMagGroup: THREE.Object3D | null = null;
  private scarMagRestPos = new THREE.Vector3();
  private akmMuzzlePos = new THREE.Vector3(0, 0.015, -0.58);
  private scarMuzzlePos = new THREE.Vector3(0, 0.024, -0.6);
  private muzzlePoint = new THREE.Object3D();
  private muzzleFlashGroup = new THREE.Group();
  private muzzleLight = new THREE.PointLight(0xffaa44, 0, 12, 1.5);
  private muzzleFlashTimer = 0;

  private fxGroup = new THREE.Group();
  private tracers: ActiveTracer[] = [];
  private shells: ActiveShell[] = [];
  private sparks: ActiveSpark[] = [];
  private bloodPuffs: ActiveBloodPuff[] = [];
  private bloodPools: ActiveBloodPool[] = [];
  private droppedWeapons: DroppedWeapon[] = [];
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
  private bloodDropGeo = new THREE.SphereGeometry(0.024, 5, 5);
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
  private bloodDecalGeo = new THREE.PlaneGeometry(1, 1);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x1e1a17,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  private bloodDecalMat: THREE.MeshStandardMaterial;
  private bloodWallDecalMat: THREE.MeshStandardMaterial;
  private bloodDropMats: THREE.MeshStandardMaterial[] = [];

  // Shared materials for dropped Cryzen AKM props on enemy death
  private dropSteelMat = new THREE.MeshStandardMaterial({ color: 0x454e5e, roughness: 0.38, metalness: 0.76 });
  private dropWoodMat = new THREE.MeshStandardMaterial({ color: 0xb8622a, roughness: 0.56, metalness: 0.06 });
  private dropMagMat = new THREE.MeshStandardMaterial({ color: 0x562c20, roughness: 0.5, metalness: 0.16 });
  private dropDarkMat = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.65, metalness: 0.25 });

  private lightPool: THREE.PointLight[] = [];

  // External Blender-rigged FPS AKM + Arms loaded via GLTFLoader (/models/fps_arms.glb)
  private fpsArmsPivot = new THREE.Group();
  private armsMixer: THREE.AnimationMixer | null = null;
  private armsActions: Record<'idle' | 'shoot' | 'reload', THREE.AnimationAction | null> = {
    idle: null,
    shoot: null,
    reload: null,
  };
  private armsLoaded = false;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sound: SoundEngine,
    private textures?: TextureLibrary
  ) {
    this.camera.add(this.viewmodelRoot);
    this.scene.add(this.fxGroup);

    // Photorealistic mirror-wet dark oxblood liquid (roughness 0.04 catches realistic specular glints on Warehouse asphalt
    // & deep dark crimson contrast on Vikendi snow — ZERO cartoon neon glow or Holi powder look!)
    this.bloodDecalMat = new THREE.MeshStandardMaterial({
      map: this.textures?.bloodSplatter ?? null,
      emissiveMap: this.textures?.bloodSplatter ?? null,
      emissive: new THREE.Color(0x3a0205),
      emissiveIntensity: 0.14,
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0.1,
      envMapIntensity: 2.9,
      transparent: true,
      opacity: 0.97,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    // Vertical wall blood splatter with glistening downward gravity drips!
    this.bloodWallDecalMat = new THREE.MeshStandardMaterial({
      map: this.textures?.bloodWallSplatter ?? this.textures?.bloodSplatter ?? null,
      emissiveMap: this.textures?.bloodWallSplatter ?? this.textures?.bloodSplatter ?? null,
      emissive: new THREE.Color(0x3a0205),
      emissiveIntensity: 0.16,
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.08,
      envMapIntensity: 2.75,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    // Shared glossy dark viscous arterial droplet materials (deep clot -> fresh dark arterial crimson!)
    this.bloodDropMats = [0x380205, 0x5c0409, 0x7a070d].map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          roughness: 0.06,
          metalness: 0.08,
          envMapIntensity: 2.4,
        })
    );

    // Single shared dynamic combat light (avoids multi-light PBR shader bloat for rock-solid 60 FPS)
    const combatLight = new THREE.PointLight(0xff9c38, 0, 14, 1.5);
    combatLight.visible = false;
    this.fxGroup.add(combatLight);
    this.lightPool.push(combatLight);

    const rifleContainer = new THREE.Group();
    rifleContainer.position.copy(this.vandalHipPos);
    rifleContainer.rotation.copy(this.vandalHipRot);
    this.models = { vandal: rifleContainer };

    this.scarLGroup = this.buildScarLModel();
    this.scarLGroup.visible = false;
    rifleContainer.add(this.scarLGroup);

    this.viewmodelRoot.add(this.models.vandal);
    this.buildMuzzleFlash();
    this.selectSlot(0, true);
    this.loadFpsArmsModel();
  }

  public get currentWeapon(): WeaponDef {
    return WEAPONS[this.slotOrder[this.currentSlot]];
  }

  public get currentAmmo(): { mag: number; reserve: number } {
    return this.ammo[this.slotOrder[this.currentSlot]];
  }

  public setVisible(visible: boolean): void {
    this.viewmodelRoot.visible = visible;
  }

  public resetAll(): void {
    this.ammo.vandal = { mag: WEAPONS.vandal.magSize, reserve: WEAPONS.vandal.reserveMax };
    this.ammo.scarl = { mag: WEAPONS.scarl.magSize, reserve: WEAPONS.scarl.reserveMax };
    this.isReloading = false;
    this.reloadProgress = 0;
    this.isAds = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.consecutiveShots = 0;
    this.kickZ = 0;
    this.kickZVel = 0;
    this.kickRotX = 0;
    this.kickRotVel = 0;
    this.selectSlot(this.currentSlot, true);
  }

  public cycleSlot(delta: number): void {
    const next = (this.currentSlot + (delta > 0 ? 1 : -1) + this.slotOrder.length) % this.slotOrder.length;
    this.selectSlot(next, false);
  }

  public clearRoundFx(): void {
    for (const d of this.decals) {
      this.fxGroup.remove(d.mesh);
    }
    this.decals = [];

    for (const bp of this.bloodPools) {
      this.fxGroup.remove(bp.mesh);
      (bp.mesh.material as THREE.Material).dispose();
    }
    this.bloodPools = [];

    for (const puff of this.bloodPuffs) {
      this.fxGroup.remove(puff.sprite);
      puff.sprite.material.dispose();
    }
    this.bloodPuffs = [];

    for (const dw of this.droppedWeapons) {
      this.fxGroup.remove(dw.group);
    }
    this.droppedWeapons = [];
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

    this.models.vandal.visible = true;
    this.adsProgress = 0;

    const isScar = this.currentWeapon.id === 'scarl';
    for (const m of this.akmMeshes) {
      m.visible = !isScar;
    }
    this.scarLGroup.visible = isScar;

    // Parent muzzle FX directly onto active rifle barrel so tracers & flash stay locked in hipfire AND ADS!
    this.models.vandal.add(this.muzzlePoint, this.muzzleFlashGroup, this.muzzleLight);
    this.muzzlePoint.position.copy(isScar ? this.scarMuzzlePos : this.akmMuzzlePos);
    this.muzzleFlashGroup.position.copy(this.muzzlePoint.position);
    this.muzzleLight.position.copy(this.muzzlePoint.position);

    if (this.armsLoaded) {
      this.models.vandal.add(this.fpsArmsPivot);
      this.fpsArmsPivot.visible = true;
      this.playArmsAnim('idle');
    }
  }

  /**
   * Loads the real Blender-rigged AKM rifle + FPS arms from /models/fps_arms.glb
   * keeping BOTH ArmModel AND AKM_model visible with Cryzen.io styling and skeletal Idle/Shoot/Reload clips!
   */
  private loadFpsArmsModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/fps_arms.glb',
      (gltf) => {
        const armsScene = gltf.scene;
        armsScene.rotation.set(0, Math.PI / 2, 0);

        const akWoodTex = buildSmoothAkWoodTexture();
        const akSteelTex = buildBrushedGunmetalTexture();

        this.akmMeshes = [];
        // Keep BOTH ArmModel and AKM_model visible, apply skinning-safe crease-angle normal smoothing
        // and satin wood/gunmetal textures for silky Cryzen.io visuals (zero harsh flat facets!)
        armsScene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.visible = true;
          mesh.frustumCulled = false;
          mesh.castShadow = false;
          mesh.receiveShadow = false;

          const lowerMesh = (mesh.name || '').toLowerCase();
          if (lowerMesh.includes('akm') || lowerMesh.includes('gun') || lowerMesh.includes('rifle') || lowerMesh.includes('weapon')) {
            this.akmMeshes.push(mesh);
          }
          if (mesh.geometry) {
            // Organic sleeve/hand/glove uses 74° smooth crease; mechanical AKM uses 46° to keep crisp edges
            smoothGeometryNormals(mesh.geometry, lowerMesh.includes('arm') ? 74 : 46);
          }

          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => {
            const std = mat as THREE.MeshStandardMaterial;
            if (!std || !std.isMeshStandardMaterial) return;
            std.flatShading = false;
            const mName = (std.name || '').toLowerCase();
            std.envMapIntensity = 1.05;
            if (mName.includes('shirt') || mName.includes('sleeve')) {
              std.color.setHex(0x286ce0);
              std.roughness = 0.72;
              std.metalness = 0.04;
              std.emissive.setHex(0x0a1f4a);
              std.emissiveIntensity = 0.2;
            } else if (mName.includes('glove')) {
              std.color.setHex(0x2d343b);
              std.roughness = 0.68;
              std.metalness = 0.14;
              std.emissive.setHex(0x0c0f14);
              std.emissiveIntensity = 0.15;
            } else if (mName.includes('skin')) {
              std.color.setHex(0xe2ad90);
              std.roughness = 0.76;
              std.metalness = 0.0;
              std.emissive.setHex(0x361e14);
              std.emissiveIntensity = 0.13;
            } else if (mName.includes('wood')) {
              std.color.setHex(0xffffff);
              std.map = akWoodTex;
              std.roughness = 0.48;
              std.metalness = 0.04;
              std.emissive.setHex(0x2c1406);
              std.emissiveIntensity = 0.14;
            } else if (mName.includes('bakelite')) {
              std.color.setHex(0x5e3428);
              std.roughness = 0.42;
              std.metalness = 0.18;
              std.emissive.setHex(0x160a08);
              std.emissiveIntensity = 0.14;
            } else if (mName.includes('metal1')) {
              std.color.setHex(0xaebbd4);
              std.map = akSteelTex;
              std.roughness = 0.3;
              std.metalness = 0.7;
              std.emissive.setHex(0x141b28);
              std.emissiveIntensity = 0.16;
            } else if (mName.includes('metal2')) {
              std.color.setHex(0x8896b0);
              std.map = akSteelTex;
              std.roughness = 0.34;
              std.metalness = 0.74;
              std.emissive.setHex(0x10151e);
              std.emissiveIntensity = 0.15;
            } else if (mName.includes('metal3')) {
              std.color.setHex(0x9aa8c0);
              std.roughness = 0.24;
              std.metalness = 0.84;
              std.emissive.setHex(0x161c26);
              std.emissiveIntensity = 0.15;
            } else if (mName.includes('bullet')) {
              std.color.setHex(0xe2b44f);
              std.roughness = 0.25;
              std.metalness = 0.88;
            } else if (mName.includes('black') || mName.includes('darkplastic')) {
              std.color.setHex(0x252b35);
              std.roughness = 0.54;
              std.metalness = 0.24;
              std.emissive.setHex(0x0a0d12);
              std.emissiveIntensity = 0.14;
            }
            std.needsUpdate = true;
          });
        });

        this.fpsArmsPivot.clear();
        this.fpsArmsPivot.add(armsScene);

        // Initialize skeletal AnimationMixer (Armature|Idle, Armature|Shoot, Armature|Reload)
        if (gltf.animations && gltf.animations.length > 0) {
          this.armsMixer = new THREE.AnimationMixer(armsScene);
          for (const clip of gltf.animations) {
            const name = clip.name.toLowerCase();
            const action = this.armsMixer.clipAction(clip);
            if (name.includes('idle')) {
              this.armsActions.idle = action;
            } else if (name.includes('shoot') || name.includes('fire')) {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = false;
              this.armsActions.shoot = action;
            } else if (name.includes('reload')) {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
              this.armsActions.reload = action;
            }
          }
          if (!this.armsActions.idle) {
            this.armsActions.idle = this.armsMixer.clipAction(gltf.animations[0]);
          }
          this.armsActions.idle.play();
          this.armsMixer.update(0);
        }

        // Auto-calibrate yaw, real-world AKM scale & exact receiver/muzzle anchor directly from GLB bones!
        this.fpsArmsPivot.position.set(0, 0, 0);
        this.fpsArmsPivot.rotation.set(0, 0, 0);
        this.fpsArmsPivot.scale.setScalar(1);
        this.fpsArmsPivot.updateMatrixWorld(true);

        const findNode = (pattern: RegExp): THREE.Object3D | null => {
          let found: THREE.Object3D | null = null;
          armsScene.traverse((obj) => {
            if (!found && obj.name && pattern.test(obj.name.replace(/[:._]/g, ''))) {
              found = obj;
            }
          });
          return found;
        };

        const triggerBone = findNode(/^trigger$/i);
        const magBone = findNode(/^magazine$/i);
        const boltBone = findNode(/^bolt$/i);
        const handLBone = findNode(/^handl$/i);

        if (triggerBone && magBone) {
          const trigW = new THREE.Vector3();
          const magW = new THREE.Vector3();
          triggerBone.getWorldPosition(trigW);
          magBone.getWorldPosition(magW);

          // Point Trigger -> Magazine strictly forward along -Z
          const dx = magW.x - trigW.x;
          const dz = magW.z - trigW.z;
          const curYaw = Math.atan2(dx, dz);
          armsScene.rotation.y += Math.PI - curYaw;
          this.fpsArmsPivot.updateMatrixWorld(true);

          triggerBone.getWorldPosition(trigW);
          magBone.getWorldPosition(magW);

          // Scale so AKM Trigger -> Hand.L matches ~0.30m (authentic AKM proportions)
          let akmScale = 0.082;
          if (handLBone) {
            const handW = new THREE.Vector3();
            handLBone.getWorldPosition(handW);
            const rawGripSpan = handW.distanceTo(trigW);
            if (rawGripSpan > 0.001) {
              akmScale = 0.305 / rawGripSpan;
            }
          }

          // Anchor Bolt/Receiver dead-center on X=0, top sight line near Y=0.045, trigger near Z=0.06
          const anchorRaw = boltBone ? new THREE.Vector3() : trigW.clone();
          if (boltBone) boltBone.getWorldPosition(anchorRaw);

          const scaledAnchor = anchorRaw.clone().multiplyScalar(akmScale);
          // Desired position of Bolt in models.vandal local space: (0, -0.015, -0.03)
          const offset = new THREE.Vector3(0.0, -0.015, -0.03).sub(scaledAnchor);

          this.fpsArmsPivot.scale.setScalar(akmScale);
          this.fpsArmsPivot.position.copy(offset);

          // Calibrate exact muzzle tip from scaled Trigger -> Magazine vector (~0.56m ahead of Bolt!)
          const scaledTrig = trigW.clone().multiplyScalar(akmScale).add(offset);
          const muzzleZ = scaledTrig.z - 0.64;
          const muzzleY = scaledTrig.y + 0.068;
          this.akmMuzzlePos.set(0, muzzleY, muzzleZ);
          const isScar = this.currentWeapon.id === 'scarl';
          this.muzzlePoint.position.copy(isScar ? this.scarMuzzlePos : this.akmMuzzlePos);
          this.muzzleFlashGroup.position.copy(this.muzzlePoint.position);
          this.muzzleLight.position.copy(this.muzzlePoint.position);
        } else {
          this.fpsArmsPivot.scale.setScalar(0.082);
          this.fpsArmsPivot.position.set(0, -0.14, -0.06);
        }

        const isScarNow = this.currentWeapon.id === 'scarl';
        for (const m of this.akmMeshes) {
          m.visible = !isScarNow;
        }
        this.scarLGroup.visible = isScarNow;

        this.armsLoaded = true;
        this.models.vandal.add(this.fpsArmsPivot);
        this.fpsArmsPivot.visible = true;
        this.playArmsAnim('idle');
      },
      undefined,
      (err) => {
        console.warn('[WeaponSystem] Could not load /models/fps_arms.glb.', err);
      }
    );
  }

  private playArmsAnim(kind: 'idle' | 'shoot' | 'reload'): void {
    if (!this.armsMixer) return;
    const idle = this.armsActions.idle;
    const shoot = this.armsActions.shoot;
    const reload = this.armsActions.reload;

    if (kind === 'idle') {
      reload?.fadeOut(0.18);
      shoot?.fadeOut(0.1);
      if (idle) {
        idle.enabled = true;
        idle.setEffectiveWeight(1);
        idle.reset().fadeIn(0.16).play();
      }
    } else if (kind === 'shoot') {
      if (shoot) {
        shoot.enabled = true;
        shoot.timeScale = 1.65;
        shoot.setEffectiveWeight(0.85);
        shoot.reset().fadeIn(0.025).play();
      }
    } else if (kind === 'reload') {
      shoot?.fadeOut(0.08);
      if (reload) {
        const clipDur = reload.getClip().duration || 2.2;
        reload.enabled = true;
        reload.timeScale = clipDur / Math.max(0.5, this.currentWeapon.reloadTime);
        reload.setEffectiveWeight(1);
        reload.reset().fadeIn(0.14).play();
      }
    }
  }

  public startReload(): void {
    const w = this.currentWeapon;
    const a = this.currentAmmo;
    if (this.isReloading) return;
    if (a.mag >= w.magSize || a.reserve <= 0) return;

    this.isReloading = true;
    this.reloadElapsed = 0;
    this.reloadProgress = 0;
    this.reloadMidPlayed = false;
    this.isAds = false;
    this.sound.playReload('start');
    this.playArmsAnim('reload');
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

    const a = this.currentAmmo;
    if (a.mag <= 0) {
      this.startReload();
      return null;
    }
    a.mag -= 1;

    const rateMult = stimActive ? 1.2 : 1.0;
    this.fireCooldown = 1 / (w.fireRate * rateMult);

    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    const muzzleWorld = new THREE.Vector3();
    this.muzzlePoint.getWorldPosition(muzzleWorld);

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
      spread += Math.min(0.045, (this.consecutiveShots - 1) * 0.0044);
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

    const crouchRecoil = crouching ? 0.74 : 1.0;
    const adsRecoil = this.isAds ? 0.8 : 1.0;
    const pitchKick = w.recoilPitch * crouchRecoil * adsRecoil * (0.9 + Math.random() * 0.25);
    const yawDir = this.consecutiveShots > 4 ? Math.sin(this.consecutiveShots * 0.75) : (Math.random() - 0.5) * 0.5;
    const yawKick = w.recoilYaw * crouchRecoil * yawDir;

    this.recoilPitch = Math.min(0.24, this.recoilPitch + pitchKick);
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw + yawKick, -0.1, 0.1);

    this.consecutiveShots += 1;
    this.sprayResetTimer = 0.34;
    this.kickZVel += w.id === 'scarl' ? 0.56 : 0.72;
    this.kickRotVel += w.id === 'scarl' ? 0.78 : 1.05;

    this.triggerMuzzleFlash();
    this.spawnBrassShell(muzzleWorld, right, up, forward);
    this.playArmsAnim('shoot');
    if (w.id === 'scarl') {
      this.sound.playScarShot(1.0);
    } else {
      this.sound.playVandalShot(1.0);
    }

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

  /**
   * Realistic dark viscous arterial blood impact spray (sharp velocity-stretched liquid streaks,
   * heavy liquid gravity, brief tight pressurized dark mist — ZERO cartoon Holi powder clouds!)
   * + crisp sparks & bullet holes on solid surfaces!
   */
  public spawnImpact(
    point: THREE.Vector3,
    normal: THREE.Vector3,
    isAgent: boolean,
    headshot = false,
    deathBurst = false
  ): void {
    if (isAgent) {
      // 1. Tight, ultra-brief pressurized dark-crimson mist snap (NOT a giant lingering bright powder cloud!)
      const puffCount = deathBurst ? 3 : headshot ? 2 : 1;
      for (let i = 0; i < puffCount; i++) {
        const sMat = new THREE.SpriteMaterial({
          map: this.textures?.bloodMistSprite ?? null,
          color: i === 0 ? 0x6e060b : 0x420205,
          transparent: true,
          opacity: deathBurst ? 0.62 : headshot ? 0.55 : 0.44,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2,
        });
        const sprite = new THREE.Sprite(sMat);
        sprite.position.copy(point).addScaledVector(normal, 0.03);
        const startScale = headshot || deathBurst ? 0.16 : 0.12;
        sprite.scale.set(startScale, startScale, 1);

        const vel = normal
          .clone()
          .multiplyScalar(1.2 + Math.random() * 1.6)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.15 + Math.random() * 0.55, (Math.random() - 0.5) * 0.9));
        this.fxGroup.add(sprite);
        this.bloodPuffs.push({
          sprite,
          vel,
          life: deathBurst ? 0.24 : 0.18,
          maxLife: deathBurst ? 0.24 : 0.18,
          startScale,
          endScale: deathBurst ? 0.62 : headshot ? 0.52 : 0.36,
          baseOpacity: sMat.opacity,
        });
      }

      // 2. Heavy dark viscous arterial liquid jets & sharp droplets arcing violently under gravity!
      const dropCount = deathBurst ? 32 : headshot ? 24 : 14;
      for (let i = 0; i < dropCount; i++) {
        const mat = this.bloodDropMats[i % this.bloodDropMats.length];
        const m = new THREE.Mesh(this.bloodDropGeo, mat);
        m.position.copy(point).addScaledVector(normal, 0.03);
        const sc = (deathBurst ? 1.15 : headshot ? 1.05 : 0.82) * (0.45 + Math.random() * 0.95);
        m.scale.set(sc * 0.62, sc * 0.62, sc * 2.8);

        // Strong focused pressurized exit jet (70% blasting out exit side, 30% tight spatter back)
        const isExitJet = i % 3 !== 0;
        const speed = (isExitJet ? 3.2 : 1.6) + Math.random() * (deathBurst ? 5.2 : 3.8);
        const coneSpread = isExitJet ? 1.9 : 2.6;
        const vel = normal
          .clone()
          .multiplyScalar(isExitJet ? -speed : speed)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * coneSpread,
              0.45 + Math.random() * (deathBurst ? 2.8 : headshot ? 2.4 : 1.5),
              (Math.random() - 0.5) * coneSpread
            )
          );
        m.lookAt(m.position.clone().add(vel));

        this.fxGroup.add(m);
        this.sparks.push({
          mesh: m,
          vel,
          life: 0.65 + Math.random() * 0.45,
          maxLife: 1.1,
          isBlood: true,
        });
        this.trimSparksPool();
      }
      return;
    }

    // Standard concrete / metal impact sparks + dark bullet hole decal
    const count = 7;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffb84d : 0xdad0c2,
        transparent: true,
        opacity: 0.92,
      });
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.copy(point).addScaledVector(normal, 0.03);
      m.scale.setScalar(0.82 * (0.55 + Math.random() * 0.8));

      const vel = normal
        .clone()
        .multiplyScalar(2.4 + Math.random() * 4.2)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.6,
            0.7 + Math.random() * 2.6,
            (Math.random() - 0.5) * 3.6
          )
        );
      m.lookAt(m.position.clone().add(vel));

      this.fxGroup.add(m);
      this.sparks.push({ mesh: m, vel, life: 0.24 + Math.random() * 0.2, maxLife: 0.42 });
      this.trimSparksPool();
    }

    const hole = new THREE.Mesh(this.decalGeo, this.decalMat);
    hole.position.copy(point).addScaledVector(normal, 0.015);
    hole.lookAt(point.clone().add(normal));
    this.fxGroup.add(hole);
    this.decals.push({ mesh: hole, life: 18 });
    this.trimDecalsPool();
  }

  /**
   * Chilling dark arterial death spurt + slow creeping glossy oxblood floor pool oozing beneath the body
   * over 3.6 seconds + directional cast-off splatters!
   */
  public spawnBloodPool(pos: THREE.Vector3, headshot = false, impulseDir?: THREE.Vector3): void {
    const sprayNormal = impulseDir
      ? impulseDir.clone().negate().setY(0.18).normalize()
      : new THREE.Vector3(0, 0.4, 1);

    // Violent heavy liquid arterial spurt from chest/head
    const chestPos = pos.clone().add(new THREE.Vector3(0, headshot ? 1.46 : 1.04, 0));
    this.spawnImpact(chestPos, sprayNormal, true, headshot, true);

    // Slowly creeping, mirror-wet dark oxblood pool bleeding out beneath the fallen soldier!
    const poolMat = this.bloodDecalMat.clone();
    poolMat.opacity = 0.97;
    const pool = new THREE.Mesh(this.bloodDecalGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.rotation.z = Math.random() * Math.PI * 2;
    const shiftX = impulseDir ? impulseDir.x * 0.38 : (Math.random() - 0.5) * 0.25;
    const shiftZ = impulseDir ? impulseDir.z * 0.38 : (Math.random() - 0.5) * 0.25;
    const floorY = Math.max(0, pos.y);
    pool.position.set(pos.x + shiftX, floorY + 0.028, pos.z + shiftZ);
    pool.scale.setScalar(0.14);
    this.fxGroup.add(pool);

    this.bloodPools.push({
      mesh: pool,
      life: 36,
      age: 0,
      targetScale: headshot ? 1.85 : 1.52,
    });
    if (this.bloodPools.length > 24) {
      const old = this.bloodPools.shift();
      if (old) {
        this.fxGroup.remove(old.mesh);
        (old.mesh.material as THREE.Material).dispose();
      }
    }

    // Directional cast-off blood spatter arc in the direction the body collapsed
    const splatCount = headshot ? 5 : 3;
    for (let i = 0; i < splatCount; i++) {
      const baseAng = impulseDir ? Math.atan2(impulseDir.z, impulseDir.x) : Math.random() * Math.PI * 2;
      const ang = baseAng + (Math.random() - 0.5) * 1.45;
      const dist = 0.48 + Math.random() * 0.85;
      const sx = pos.x + shiftX + Math.cos(ang) * dist;
      const sz = pos.z + shiftZ + Math.sin(ang) * dist;
      this.spawnFloorBloodSplatter(sx, sz, 0.34 + Math.random() * 0.42, floorY);
    }
  }

  /**
   * Stamps a realistic glossy dark arterial splatter WITH downward gravity blood drips onto walls behind a shot victim!
   */
  public spawnWallBloodSplatter(point: THREE.Vector3, normal: THREE.Vector3, scale = 0.82): void {
    const splat = new THREE.Mesh(this.bloodDecalGeo, this.bloodWallDecalMat);
    // Shift slightly downward so drips cascade cleanly down from the impact entry height
    splat.position.copy(point).addScaledVector(normal, 0.024);
    splat.position.y = Math.max(0.42, splat.position.y - scale * 0.16);
    splat.up.set(0, 1, 0);
    splat.lookAt(splat.position.clone().add(normal));
    const s = scale * (0.88 + Math.random() * 0.38);
    splat.scale.set(s * 0.92, s * 1.18, 1);
    this.fxGroup.add(splat);
    this.decals.push({ mesh: splat, life: 32, isBlood: true });
    this.trimDecalsPool();
  }

  /**
   * Cryzen.io-style dropped AKM rifle clattering onto the ground when an enemy or ally falls!
   */
  public spawnDroppedWeapon(pos: THREE.Vector3, yaw: number, impulseDir?: THREE.Vector3): void {
    const gun = new THREE.Group();
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.34), this.dropSteelMat);
    gun.add(rec);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.088, 0.24), this.dropWoodMat);
    stock.position.set(0, -0.02, -0.27);
    gun.add(stock);
    const hg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.058, 0.24), this.dropWoodMat);
    hg.position.set(0, 0.005, 0.28);
    gun.add(hg);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.3, 6), this.dropSteelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.012, 0.52);
    gun.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.19, 0.068), this.dropMagMat);
    mag.position.set(0, -0.11, 0.09);
    mag.rotation.x = -0.28;
    gun.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.044), this.dropDarkMat);
    grip.position.set(0, -0.075, -0.09);
    grip.rotation.x = 0.25;
    gun.add(grip);

    gun.position.set(pos.x, pos.y + 1.05, pos.z);
    gun.rotation.set((Math.random() - 0.5) * 0.4, yaw + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5);
    this.fxGroup.add(gun);

    const vel = new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 1.1, (Math.random() - 0.5) * 2.4);
    if (impulseDir) {
      vel.addScaledVector(impulseDir, 2.0);
    }

    this.droppedWeapons.push({
      group: gun,
      vel,
      rotVel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 7, 5 + Math.random() * 4),
      settled: false,
      life: 25,
    });
    if (this.droppedWeapons.length > 10) {
      const old = this.droppedWeapons.shift();
      if (old) this.fxGroup.remove(old.group);
    }
  }

  private spawnFloorBloodSplatter(x: number, z: number, scale: number, floorY = 0): void {
    const splat = new THREE.Mesh(this.bloodDecalGeo, this.bloodDecalMat);
    splat.rotation.x = -Math.PI / 2;
    splat.rotation.z = Math.random() * Math.PI * 2;
    splat.position.set(x, floorY + 0.027 + Math.random() * 0.005, z);
    splat.scale.setScalar(scale);
    this.fxGroup.add(splat);
    this.decals.push({ mesh: splat, life: 28, isBlood: true });
    this.trimDecalsPool();
  }

  private trimSparksPool(): void {
    while (this.sparks.length > 220) {
      const old = this.sparks.shift();
      if (old) {
        this.fxGroup.remove(old.mesh);
        if (!old.isBlood) (old.mesh.material as THREE.Material).dispose();
      }
    }
  }

  private trimDecalsPool(): void {
    while (this.decals.length > 110) {
      const old = this.decals.shift();
      if (old) this.fxGroup.remove(old.mesh);
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
    const baseScale = this.isAds ? 0.55 : 0.88;
    const s = baseScale * (0.9 + Math.random() * 0.26);
    this.muzzleFlashGroup.scale.setScalar(s);
    this.muzzleLight.intensity = 10 + Math.random() * 3;
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

    this.isAds = adsHeld && !this.isReloading && this.equipTimer <= 0;

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
        this.playArmsAnim('idle');
      }
    }

    if (this.armsMixer) {
      this.armsMixer.update(dt);
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

    // Critically-damped spring recoil recovery (buttery smooth punch + zero jitter!)
    const stiffness = 195;
    const damping = 26;
    const az = -stiffness * this.kickZ - damping * this.kickZVel;
    this.kickZVel += az * dt;
    this.kickZ = THREE.MathUtils.clamp(this.kickZ + this.kickZVel * dt, -0.02, 0.08);

    const ar = -stiffness * this.kickRotX - damping * this.kickRotVel;
    this.kickRotVel += ar * dt;
    this.kickRotX = THREE.MathUtils.clamp(this.kickRotX + this.kickRotVel * dt, -0.04, 0.14);

    const swayLerp = 1 - Math.exp(-12 * dt);
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, swayLerp);
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, swayLerp);

    const adsTarget = this.isAds ? 1 : 0;
    this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, adsTarget, 1 - Math.exp(-15 * dt));
    // Cubic smoothstep easing for ultra-silky ADS zoom-in/out!
    const adsEase = this.adsProgress * this.adsProgress * (3 - 2 * this.adsProgress);

    const isScar = w.id === 'scarl';
    const hipPos = isScar ? this.scarHipPos : this.vandalHipPos;
    const hipRot = isScar ? this.scarHipRot : this.vandalHipRot;
    const adsPos = isScar ? this.scarAdsPos : this.vandalAdsPos;
    const adsRot = isScar ? this.scarAdsRot : this.vandalAdsRot;

    this.models.vandal.position.lerpVectors(hipPos, adsPos, adsEase);
    this.models.vandal.rotation.set(
      THREE.MathUtils.lerp(hipRot.x, adsRot.x, adsEase),
      THREE.MathUtils.lerp(hipRot.y, adsRot.y, adsEase),
      THREE.MathUtils.lerp(hipRot.z, adsRot.z, adsEase)
    );

    // Live SCAR-L reciprocating side charging handle & synced STANAG magazine drop/insert during reload!
    if (isScar) {
      if (this.scarBoltCarrier) {
        const rackPull =
          this.isReloading && this.reloadProgress > 0.72 && this.reloadProgress < 0.9
            ? Math.sin(((this.reloadProgress - 0.72) / 0.18) * Math.PI) * 0.055
            : 0;
        this.scarBoltCarrier.position.z = -0.055 + Math.max(0, this.kickZ) * 1.1 + rackPull;
      }
      if (this.scarMagGroup) {
        let drop = 0;
        if (this.isReloading && this.reloadProgress > 0.14 && this.reloadProgress < 0.68) {
          drop = Math.sin(((this.reloadProgress - 0.14) / 0.54) * Math.PI) * 0.19;
        }
        this.scarMagGroup.position.set(
          this.scarMagRestPos.x,
          this.scarMagRestPos.y - drop,
          this.scarMagRestPos.z
        );
      }
    }

    // Silky figure-8 stride & breathing bob driven by smoothed speed (zero jumps when stopping/starting!)
    this.smoothSpeed = THREE.MathUtils.lerp(this.smoothSpeed, grounded ? playerSpeed : 0, 1 - Math.exp(-10 * dt));
    const speedNorm = Math.min(1, this.smoothSpeed / 5.5);
    this.bobPhase += dt * (4.2 + speedNorm * 6.4);
    this.breathPhase += dt * 1.9;

    const adsDamp = 1 - adsEase * 0.78;
    const walkBobX = Math.cos(this.bobPhase) * 0.0085 * speedNorm * adsDamp;
    const walkBobY = Math.sin(this.bobPhase * 2) * 0.0055 * speedNorm * adsDamp;
    const breathY = Math.sin(this.breathPhase) * 0.0018 * adsDamp;

    // Gentle dip on reload since Armature|Reload already animates the real mag swap + bolt rack!
    const reloadDip = this.isReloading ? Math.sin(this.reloadProgress * Math.PI) * -0.022 : 0;
    const equipDip = this.equipTimer > 0 ? -(this.equipTimer / Math.max(0.1, w.equipTime)) * 0.24 : 0;

    this.viewmodelRoot.position.set(
      this.swayX * adsDamp + walkBobX,
      this.swayY * adsDamp + walkBobY + breathY + reloadDip + equipDip,
      this.kickZ * (1 - adsEase * 0.35)
    );
    this.viewmodelRoot.rotation.set(
      this.kickRotX * (1 - adsEase * 0.45),
      this.swayX * 1.15 * adsDamp,
      -this.swayX * 0.9 * adsDamp + walkBobX * 1.8
    );

    // Update tracers
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

    // Update brass shells
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

    // Update sparks & heavy gravity-arcing dark arterial liquid streaks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.vel.y -= (sp.isBlood ? 18.5 : 11.2) * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      if (sp.isBlood && !sp.splattered) {
        // Align & dynamically stretch flying liquid drops along their real velocity trajectory!
        const speed = sp.vel.length();
        if (speed > 0.25) {
          sp.mesh.lookAt(sp.mesh.position.x + sp.vel.x, sp.mesh.position.y + sp.vel.y, sp.mesh.position.z + sp.vel.z);
          sp.mesh.scale.z = Math.min(4.2, Math.max(1.2, speed * 0.48));
        }
      }
      if (sp.mesh.position.y < 0.032) {
        sp.mesh.position.y = 0.032;
        if (sp.isBlood && !sp.splattered) {
          sp.splattered = true;
          if (Math.random() < 0.56) {
            this.spawnFloorBloodSplatter(sp.mesh.position.x, sp.mesh.position.z, 0.26 + Math.random() * 0.36);
          }
          sp.vel.set(0, 0, 0);
          sp.life = 0;
        } else {
          sp.vel.y *= -0.45;
          sp.vel.x *= 0.72;
          sp.vel.z *= 0.72;
        }
      }
      if (sp.life <= 0) {
        this.fxGroup.remove(sp.mesh);
        if (!sp.isBlood) (sp.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      } else if (!sp.isBlood) {
        (sp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, sp.life / sp.maxLife);
      }
    }

    // Update tight brief pressurized arterial mist flash
    for (let i = this.bloodPuffs.length - 1; i >= 0; i--) {
      const bp = this.bloodPuffs[i];
      bp.life -= dt;
      if (bp.life <= 0) {
        this.fxGroup.remove(bp.sprite);
        bp.sprite.material.dispose();
        this.bloodPuffs.splice(i, 1);
      } else {
        const progress = 1 - bp.life / bp.maxLife;
        bp.sprite.position.addScaledVector(bp.vel, dt * (1 - progress * 0.75));
        bp.vel.y -= 5.5 * dt;
        const sc = THREE.MathUtils.lerp(bp.startScale, bp.endScale, progress);
        bp.sprite.scale.set(sc, sc, 1);
        bp.sprite.material.opacity = (1 - progress) * (1 - progress) * bp.baseOpacity;
      }
    }

    // Update slow, creeping glossy oxblood death floor pools (oozes outward over 3.6s like real blood!)
    for (let i = this.bloodPools.length - 1; i >= 0; i--) {
      const pool = this.bloodPools[i];
      pool.age += dt;
      pool.life -= dt;
      const grow = Math.min(1, pool.age / 3.6);
      const eased = 1 - Math.pow(1 - grow, 2.4);
      pool.mesh.scale.setScalar(THREE.MathUtils.lerp(0.14, pool.targetScale, eased));
      if (pool.life <= 0) {
        this.fxGroup.remove(pool.mesh);
        (pool.mesh.material as THREE.Material).dispose();
        this.bloodPools.splice(i, 1);
      } else if (pool.life < 4) {
        (pool.mesh.material as THREE.MeshStandardMaterial).opacity = (pool.life / 4) * 0.97;
      }
    }

    // Update dropped AKM rifle clatter physics
    for (let i = this.droppedWeapons.length - 1; i >= 0; i--) {
      const dw = this.droppedWeapons[i];
      dw.life -= dt;
      if (!dw.settled) {
        dw.vel.y -= 14.5 * dt;
        dw.group.position.addScaledVector(dw.vel, dt);
        dw.group.rotation.x += dw.rotVel.x * dt;
        dw.group.rotation.y += dw.rotVel.y * dt;
        dw.group.rotation.z += dw.rotVel.z * dt;
        if (dw.group.position.y <= 0.045) {
          dw.group.position.y = 0.045;
          if (Math.abs(dw.vel.y) > 0.9) {
            dw.vel.y *= -0.32;
            dw.vel.x *= 0.55;
            dw.vel.z *= 0.55;
            dw.rotVel.multiplyScalar(0.45);
          } else {
            dw.settled = true;
            dw.group.rotation.x = 0;
            dw.group.rotation.z = Math.PI / 2; // Lies flat on its side on the ground!
          }
        }
      }
      if (dw.life <= 0) {
        this.fxGroup.remove(dw.group);
        this.droppedWeapons.splice(i, 1);
      }
    }

    // Update frag/flash explosions
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

    // Update dynamic pulse lights
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

    // Update decals
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
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.2, 4), outerMat);
      spike.rotation.z = ang - Math.PI / 2;
      spike.position.set(Math.cos(ang) * 0.075, Math.sin(ang) * 0.075, -0.02);
      this.muzzleFlashGroup.add(spike);
    }

    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.24, 6), outerMat);
    jet.rotation.x = -Math.PI / 2;
    jet.position.z = -0.11;
    this.muzzleFlashGroup.add(jet);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), coreMat);
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
      flare.scale.set(0.28, 0.28, 1);
      this.muzzleFlashGroup.add(flare);
    }

    this.muzzleFlashGroup.visible = false;
    this.viewmodelRoot.add(this.muzzlePoint);
    this.viewmodelRoot.add(this.muzzleFlashGroup);
    this.viewmodelRoot.add(this.muzzleLight);
  }

  /**
   * Sleek smooth-shaded FN SCAR-L 5.56mm Assault Rifle Viewmodel:
   * - Iconic Flat Dark Earth (Desert Tan) chamfered monolithic upper receiver + matte gunmetal lower
   * - Full-length top Picatinny rail + open-window glowing Red-Dot Reflex Sight (centered at y=0.118 for ADS!)
   * - Perforated monolithic SCAR handguard, side rails, reciprocating side charging handle & flip-up front sight
   * - Iconic heavy SCAR "UGG-boot" folding stock with adjustable cheek riser
   * - Fluted matte-black 5.56 barrel, birdcage flash hider, and FDE STANAG curved magazine
   * Aligned directly to ArmModel's rigged Trigger & Left-Hand grips for seamless two-handed animation!
   */
  private buildScarLModel(): THREE.Group {
    const root = new THREE.Group();
    const steelTex = buildBrushedGunmetalTexture();
    const scarFdeTex = buildSharpScarCerakoteTexture();

    const fdeTan = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: scarFdeTex,
      roughness: 0.38,
      metalness: 0.24,
      emissive: new THREE.Color(0x281e0e),
      emissiveIntensity: 0.12,
      envMapIntensity: 1.25,
    });
    const fdeDark = new THREE.MeshStandardMaterial({
      color: 0xc2a268,
      map: scarFdeTex,
      roughness: 0.46,
      metalness: 0.28,
      emissive: new THREE.Color(0x1c140a),
      emissiveIntensity: 0.1,
      envMapIntensity: 1.15,
    });
    const gunSteel = new THREE.MeshStandardMaterial({
      color: 0x5c6678,
      map: steelTex,
      roughness: 0.3,
      metalness: 0.8,
      envMapIntensity: 1.4,
    });
    const matteBlack = new THREE.MeshStandardMaterial({
      color: 0x20252e,
      roughness: 0.56,
      metalness: 0.26,
      emissive: new THREE.Color(0x080a0f),
      emissiveIntensity: 0.14,
    });
    const reticleRed = new THREE.MeshBasicMaterial({
      color: 0xff2e24,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
    });

    const makeChamferRect = (w: number, h: number, c: number): THREE.Shape => {
      const hw = w / 2;
      const hh = h / 2;
      const s = new THREE.Shape();
      s.moveTo(-hw + c, -hh);
      s.lineTo(hw - c, -hh);
      s.lineTo(hw, -hh + c);
      s.lineTo(hw, hh - c);
      s.lineTo(hw - c, hh);
      s.lineTo(-hw + c, hh);
      s.lineTo(-hw, hh - c);
      s.lineTo(-hw, -hh + c);
      s.closePath();
      return s;
    };

    const makeRoundedRect = (w: number, h: number, r: number): THREE.Shape => {
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

    // 1. Monolithic FN SCAR-L Chamfered Desert-Tan Upper Receiver & Handguard
    const upperGeo = new THREE.ExtrudeGeometry(makeChamferRect(0.066, 0.064, 0.012), {
      depth: 0.52,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.0035,
      bevelSegments: 2,
    });
    upperGeo.translate(0, 0, -0.26);
    const upper = new THREE.Mesh(upperGeo, fdeTan);
    upper.position.set(0, 0.024, -0.12);
    root.add(upper);

    // Side dark cooling vent recesses along forward SCAR handguard
    for (let i = 0; i < 4; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.011, 0.032), matteBlack);
      slot.position.set(0, 0.026, -0.21 - i * 0.045);
      root.add(slot);
    }

    // Side Picatinny tactical rails on forward handguard
    for (const sx of [-0.036, 0.036]) {
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.19), matteBlack);
      sideRail.position.set(sx, 0.012, -0.285);
      root.add(sideRail);
    }

    // 2. Two-Tone Lower Receiver, Flared Magwell, Trigger Guard & Ergonomic Grip
    const lowerGeo = new THREE.ExtrudeGeometry(makeChamferRect(0.06, 0.048, 0.009), {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 2,
    });
    lowerGeo.translate(0, 0, -0.14);
    const lower = new THREE.Mesh(lowerGeo, fdeDark);
    lower.position.set(0, -0.022, -0.02);
    root.add(lower);

    // Ergonomic matte-black pistol grip aligned to ArmModel right-hand trigger grip
    const pistolGrip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.078, 5, 10), matteBlack);
    pistolGrip.scale.set(0.9, 1, 1.3);
    pistolGrip.position.set(0, -0.08, 0.065);
    pistolGrip.rotation.x = 0.28;
    root.add(pistolGrip);

    // Left-hand underside rail & compact angled foregrip matching ArmModel left-hand grip
    const underRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.17), matteBlack);
    underRail.position.set(0, -0.014, -0.27);
    root.add(underRail);
    const afg = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, 0.095), matteBlack);
    afg.position.set(0, -0.028, -0.275);
    afg.rotation.x = 0.24;
    root.add(afg);

    // 3. Curved 5.56 STANAG Desert-Tan Magazine (animated cleanly during reload!)
    const magGroup = new THREE.Group();
    this.scarMagRestPos.set(0, -0.105, -0.105);
    magGroup.position.copy(this.scarMagRestPos);
    magGroup.rotation.x = 0.16;
    const magUpper = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.066), fdeTan);
    magGroup.add(magUpper);
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.072), matteBlack);
    magBase.position.set(0, -0.074, 0.002);
    magGroup.add(magBase);
    for (const ry of [-0.03, 0.0, 0.03]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.039, 0.008, 0.058), fdeDark);
      rib.position.set(0, ry, 0);
      magGroup.add(rib);
    }
    root.add(magGroup);
    this.scarMagGroup = magGroup;

    // 4. Reciprocating SCAR Side Charging Handle (left-side iconic SCAR silhouette!)
    const boltTrack = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.14), matteBlack);
    boltTrack.position.set(-0.033, 0.026, -0.075);
    root.add(boltTrack);

    const boltGroup = new THREE.Group();
    boltGroup.position.set(0, 0.026, -0.055);
    const boltBlock = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.015, 0.042), gunSteel);
    boltGroup.add(boltBlock);
    const handleStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.036, 10), gunSteel);
    handleStem.rotation.z = Math.PI / 2;
    handleStem.position.set(-0.048, 0, 0);
    boltGroup.add(handleStem);
    const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.018, 12), matteBlack);
    handleKnob.rotation.z = Math.PI / 2;
    handleKnob.position.set(-0.064, 0, 0);
    boltGroup.add(handleKnob);
    root.add(boltGroup);
    this.scarBoltCarrier = boltGroup;

    // 5. Full-Length Machined Top Picatinny Rail
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.01, 0.52), matteBlack);
    topRail.position.set(0, 0.062, -0.12);
    root.add(topRail);
    for (let z = 0.12; z >= -0.36; z -= 0.024) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.006, 0.01), gunSteel);
      tooth.position.set(0, 0.069, z);
      root.add(tooth);
    }

    // 6. Open-Window Holographic Red-Dot Reflex Sight (lens dead-center at y = 0.118 for pinpoint ADS!)
    const opticZ = -0.02;
    const opticMount = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.018, 0.088), matteBlack);
    opticMount.position.set(0, 0.08, opticZ);
    root.add(opticMount);

    const hoodOuter = makeRoundedRect(0.056, 0.048, 0.012);
    const hoodHole = makeRoundedRect(0.044, 0.036, 0.009);
    hoodOuter.holes.push(hoodHole);
    const hoodGeo = new THREE.ExtrudeGeometry(hoodOuter, {
      depth: 0.034,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    hoodGeo.translate(0, 0, -0.017);
    const opticHood = new THREE.Mesh(hoodGeo, fdeTan);
    opticHood.position.set(0, 0.118, opticZ - 0.008);
    root.add(opticHood);

    const opticGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.043, 0.035),
      new THREE.MeshBasicMaterial({
        color: 0x62ffd8,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    opticGlass.position.set(0, 0.118, opticZ - 0.008);
    root.add(opticGlass);

    // Crisp glowing crimson dot + subtle outer bracket ticks
    const redDot = new THREE.Mesh(new THREE.CircleGeometry(0.0019, 12), reticleRed);
    redDot.position.set(0, 0.118, opticZ - 0.006);
    root.add(redDot);
    for (const [tx, ty, tw, th] of [
      [0, 0.0075, 0.0009, 0.0038],
      [0, -0.0075, 0.0009, 0.0038],
      [-0.0075, 0, 0.0038, 0.0009],
      [0.0075, 0, 0.0038, 0.0009],
    ]) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), reticleRed);
      tick.position.set(tx, 0.118 + ty, opticZ - 0.006);
      root.add(tick);
    }

    // 7. Signature Heavy FN SCAR-L Folding "UGG-Boot" Buttstock & Cheek Riser
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.072, 0.032), gunSteel);
    hinge.position.set(0, 0.012, 0.145);
    root.add(hinge);

    const stockShape = new THREE.Shape();
    stockShape.moveTo(0.0, 0.044);
    stockShape.lineTo(0.28, 0.032);
    stockShape.lineTo(0.28, -0.068);
    stockShape.lineTo(0.18, -0.066);
    stockShape.lineTo(0.14, -0.034);
    stockShape.lineTo(0.0, -0.03);
    stockShape.closePath();
    const stockGeo = new THREE.ExtrudeGeometry(stockShape, {
      depth: 0.044,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 2,
    });
    stockGeo.translate(0, 0, -0.022);
    stockGeo.rotateY(-Math.PI / 2); // +X becomes +Z rear!
    const stockMesh = new THREE.Mesh(stockGeo, fdeTan);
    stockMesh.position.set(0, 0.005, 0.155);
    root.add(stockMesh);

    const cheekPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.16, 4, 8), fdeDark);
    cheekPad.rotation.x = Math.PI / 2;
    cheekPad.position.set(0, 0.048, 0.27);
    root.add(cheekPad);

    // 8. Fluted Matte-Black 5.56 Barrel, Gas Block Flip-Up Front Sight & Birdcage Flash Hider
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0125, 0.22, 12), gunSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.47);
    root.add(barrel);

    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.038, 0.038), gunSteel);
    gasBlock.position.set(0, 0.034, -0.42);
    root.add(gasBlock);

    // Signature SCAR front iron sight tower
    const fsPost = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.034, 0.014), matteBlack);
    fsPost.position.set(0, 0.068, -0.42);
    root.add(fsPost);

    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.015, 0.056, 10), matteBlack);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.024, -0.578);
    root.add(flashHider);

    return root;
  }
}
