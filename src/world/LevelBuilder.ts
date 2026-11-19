import * as THREE from 'three';
import { AABB, MinimapRect, Waypoint, ZoneDef } from '../types';
import { TextureLibrary } from '../textures/ProceduralTextures';

export interface FlickerLight {
  light: THREE.PointLight;
  baseIntensity: number;
  speed: number;
  phase: number;
  mode: 'fire' | 'fluorescent';
}

export interface BuiltLevel {
  group: THREE.Group;
  colliders: AABB[];
  raycastMeshes: THREE.Object3D[];
  minimapRects: MinimapRect[];
  waypoints: Waypoint[];
  zones: ZoneDef[];
  playerSpawn: { pos: THREE.Vector3; yaw: number };
  allySpawn: { pos: THREE.Vector3; yaw: number };
  allySpawns: Array<{ pos: THREE.Vector3; yaw: number; role: 'ember' | 'duelist' | 'striker' | 'sentinel'; name: string }>;
  enemySpawns: Array<{ pos: THREE.Vector3; yaw: number; role: 'duelist' | 'striker' | 'sentinel'; name: string }>;
  dustParticles: THREE.Points;
  mapBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  updateAtmosphere: (dt: number, elapsed: number) => void;
}

export class LevelBuilder {
  private group = new THREE.Group();
  private colliders: AABB[] = [];
  private raycastMeshes: THREE.Object3D[] = [];
  private minimapRects: MinimapRect[] = [];
  private flickerLights: FlickerLight[] = [];
  private flameMeshes: Array<{ mesh: THREE.Mesh; baseY: number; phase: number; baseScale: number }> = [];
  private fanBlades: THREE.Object3D[] = [];
  private tex: TextureLibrary;

  private matConcrete: THREE.MeshStandardMaterial;
  private matSteel: THREE.MeshStandardMaterial;
  private matCorrugated: THREE.MeshStandardMaterial;
  private matHazard: THREE.MeshStandardMaterial;
  private matGrate: THREE.MeshStandardMaterial;
  private matCrate: THREE.MeshStandardMaterial;
  private matPipeDark: THREE.MeshStandardMaterial;
  private matPipeCopper: THREE.MeshStandardMaterial;
  private matCable: THREE.MeshStandardMaterial;
  private matEmissiveCyan: THREE.MeshStandardMaterial;
  private matEmissiveCrimson: THREE.MeshStandardMaterial;
  private matEmissiveAmber: THREE.MeshStandardMaterial;

  constructor(textures: TextureLibrary) {
    this.tex = textures;

    this.matConcrete = new THREE.MeshStandardMaterial({
      map: textures.grimyConcrete.map,
      roughnessMap: textures.grimyConcrete.roughnessMap,
      bumpMap: textures.grimyConcrete.bumpMap,
      bumpScale: 0.045,
      roughness: 0.92,
      metalness: 0.06,
      envMapIntensity: 0.9,
    });

    this.matSteel = new THREE.MeshStandardMaterial({
      map: textures.industrialSteel.map,
      roughnessMap: textures.industrialSteel.roughnessMap,
      bumpMap: textures.industrialSteel.bumpMap,
      bumpScale: 0.032,
      roughness: 0.62,
      metalness: 0.72,
      envMapIntensity: 1.35,
    });

    this.matCorrugated = new THREE.MeshStandardMaterial({
      map: textures.corrugatedMetal.map,
      roughnessMap: textures.corrugatedMetal.roughnessMap,
      bumpMap: textures.corrugatedMetal.bumpMap,
      bumpScale: 0.06,
      roughness: 0.68,
      metalness: 0.65,
      envMapIntensity: 1.15,
    });

    this.matHazard = new THREE.MeshStandardMaterial({
      map: textures.hazardTrim,
      roughness: 0.72,
      metalness: 0.25,
    });

    this.matGrate = new THREE.MeshStandardMaterial({
      map: textures.metalGrate.map,
      roughnessMap: textures.metalGrate.roughnessMap,
      bumpMap: textures.metalGrate.bumpMap,
      bumpScale: 0.05,
      roughness: 0.55,
      metalness: 0.78,
      envMapIntensity: 1.3,
    });

    this.matCrate = new THREE.MeshStandardMaterial({
      map: textures.techCrate.map,
      roughnessMap: textures.techCrate.roughnessMap,
      bumpMap: textures.techCrate.bumpMap,
      bumpScale: 0.04,
      roughness: 0.64,
      metalness: 0.48,
      envMapIntensity: 1.1,
    });

    this.matPipeDark = new THREE.MeshStandardMaterial({
      color: 0x262d36,
      roughness: 0.42,
      metalness: 0.82,
      envMapIntensity: 1.3,
    });

    this.matPipeCopper = new THREE.MeshStandardMaterial({
      color: 0x5c3626,
      roughness: 0.46,
      metalness: 0.78,
      envMapIntensity: 1.2,
    });

    this.matCable = new THREE.MeshStandardMaterial({
      color: 0x11151b,
      roughness: 0.55,
      metalness: 0.3,
    });

    this.matEmissiveCyan = new THREE.MeshStandardMaterial({
      color: 0x8ff6ff,
      emissive: new THREE.Color(0x28d8ff),
      emissiveIntensity: 2.8,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.matEmissiveCrimson = new THREE.MeshStandardMaterial({
      color: 0xff8ea6,
      emissive: new THREE.Color(0xff1e52),
      emissiveIntensity: 2.6,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.matEmissiveAmber = new THREE.MeshStandardMaterial({
      color: 0xffd78a,
      emissive: new THREE.Color(0xff7d1a),
      emissiveIntensity: 2.9,
      roughness: 0.2,
      metalness: 0.1,
    });
  }

  public build(scene: THREE.Scene): BuiltLevel {
    this.setupAtmosphereAndLighting(scene);
    this.buildWetFloorsAndDebris();
    this.buildSouthEntry();
    this.buildCourtyardWalls();
    this.buildIndustrialBulkheadArchway();
    this.buildOverheadTrussesPipesAndCables();
    this.buildIndustrialPropsAndFireBarrels();
    this.buildFoundryMarketHall();
    this.buildWestConduitAlley();
    this.buildEastTurbineBay();
    this.buildTacticalCover();
    const dustParticles = this.buildEmbersAndVolumetricBeams();

    scene.add(this.group);

    const updateAtmosphere = (dt: number, elapsed: number) => {
      for (const fl of this.flickerLights) {
        if (fl.mode === 'fire') {
          const wave =
            Math.sin(elapsed * fl.speed + fl.phase) * 0.16 +
            Math.sin(elapsed * (fl.speed * 2.3) + fl.phase * 1.7) * 0.11 +
            Math.cos(elapsed * (fl.speed * 4.1)) * 0.06;
          fl.light.intensity = fl.baseIntensity * (1 + wave);
        } else {
          const pulse = Math.sin(elapsed * 19 + fl.phase) * Math.sin(elapsed * 3.7 + fl.phase);
          fl.light.intensity = pulse > 0.88 ? fl.baseIntensity * 0.38 : fl.baseIntensity;
        }
      }

      for (const f of this.flameMeshes) {
        const s = 0.82 + Math.sin(elapsed * 14 + f.phase) * 0.22 + Math.cos(elapsed * 23 + f.phase) * 0.12;
        f.mesh.scale.set(f.baseScale * (0.9 + s * 0.15), f.baseScale * (0.75 + s * 0.45), f.baseScale * (0.9 + s * 0.15));
        f.mesh.position.y = f.baseY + Math.sin(elapsed * 11 + f.phase) * 0.05;
        f.mesh.rotation.y += dt * 2.2;
      }

      for (const fan of this.fanBlades) {
        fan.rotation.z -= dt * 1.45;
      }

      const pos = dustParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * (0.45 + (i % 5) * 0.14);
        let x = pos.getX(i) + Math.sin(elapsed * 1.3 + i * 0.7) * dt * 0.32;
        let z = pos.getZ(i) + Math.cos(elapsed * 1.1 + i * 0.5) * dt * 0.24;
        if (y > 6.8) {
          y = 0.15;
          x = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 24 - 12;
          z = ((Math.cos(i * 78.233) * 43758.5453) % 1) * 26 - 14;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    };

    return {
      group: this.group,
      colliders: this.colliders,
      raycastMeshes: this.raycastMeshes,
      minimapRects: this.minimapRects,
      waypoints: this.buildWaypoints(),
      zones: this.buildZones(),
      playerSpawn: {
        pos: new THREE.Vector3(1.1, 0, 11.6),
        yaw: 0.09,
      },
      allySpawn: {
        pos: new THREE.Vector3(-2.65, 0, 5.15),
        yaw: -0.25,
      },
      allySpawns: [
        { pos: new THREE.Vector3(-2.65, 0, 5.15), yaw: -0.25, role: 'ember', name: 'EMBER' },
        { pos: new THREE.Vector3(3.15, 0, 4.95), yaw: 0.28, role: 'duelist', name: 'PULSE' },
      ],
      enemySpawns: [
        { pos: new THREE.Vector3(0.0, 0, -7.1), yaw: Math.PI, role: 'duelist', name: 'ZEPHYR' },
        { pos: new THREE.Vector3(-6.2, 0, -13.5), yaw: Math.PI - 0.3, role: 'striker', name: 'PYRO' },
        { pos: new THREE.Vector3(6.4, 0, -13.2), yaw: Math.PI + 0.35, role: 'sentinel', name: 'BASTION' },
        { pos: new THREE.Vector3(-12.6, 0, -7.8), yaw: Math.PI - 0.15, role: 'duelist', name: 'VEX' },
        { pos: new THREE.Vector3(12.6, 0, -6.5), yaw: Math.PI + 0.15, role: 'striker', name: 'SCORCH' },
      ],
      dustParticles,
      mapBounds: { minX: -15.5, maxX: 15.5, minZ: -18.5, maxZ: 15.5 },
      updateAtmosphere,
    };
  }

  private setupAtmosphereAndLighting(scene: THREE.Scene): void {
    const skyGeo = new THREE.SphereGeometry(150, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#070d18') },
        midColor: { value: new THREE.Color('#14243b') },
        horizonColor: { value: new THREE.Color('#381b2d') },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = mix(horizonColor, midColor, smoothstep(-0.05, 0.25, h));
          col = mix(col, topColor, smoothstep(0.22, 0.78, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    scene.fog = new THREE.FogExp2(0x0c1320, 0.0185);

    const hemi = new THREE.HemisphereLight(0x3f72a8, 0x361826, 0.72);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0x9cd8ff, 1.55);
    keyLight.position.set(-14, 24, -12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 62;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.normalBias = 0.03;
    scene.add(keyLight);

    // Warm furnace directional rim light (virtually zero GPU cost, adds vibrant orange edge highlights!)
    const rimWarm = new THREE.DirectionalLight(0xff7830, 0.62);
    rimWarm.position.set(16, 7, 12);
    scene.add(rimWarm);

    // Rich high-contrast cyan, crimson & warm industrial accent lights
    const crimsonWest = new THREE.PointLight(0xff1e5c, 34, 24, 1.32);
    crimsonWest.position.set(-6.8, 4.4, 5.0);
    this.group.add(crimsonWest);

    const crimsonEntry = new THREE.PointLight(0xe61c68, 22, 18, 1.4);
    crimsonEntry.position.set(5.4, 3.8, 9.8);
    this.group.add(crimsonEntry);

    const cyanArchBack = new THREE.PointLight(0x1ceeff, 46, 28, 1.25);
    cyanArchBack.position.set(0, 4.8, -11.8);
    this.group.add(cyanArchBack);

    const cyanYard = new THREE.PointLight(0x38dcff, 24, 22, 1.35);
    cyanYard.position.set(3.8, 5.6, 0.2);
    this.group.add(cyanYard);
    this.flickerLights.push({
      light: cyanYard,
      baseIntensity: 24,
      speed: 1,
      phase: 2.2,
      mode: 'fluorescent',
    });
  }

  private addBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material | THREE.Material[],
    opts: {
      collide?: boolean;
      raycast?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      minimap?: MinimapRect['kind'];
      label?: string;
    } = {}
  ): THREE.Mesh {
    const {
      collide = true,
      raycast = true,
      castShadow = true,
      receiveShadow = true,
      minimap,
      label,
    } = opts;

    const geo = new THREE.BoxGeometry(w, h, d);
    // Non-hero decorative boxes skip shadow casting by default to keep shadow pass super fast (60 FPS)
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = collide ? castShadow : false;
    mesh.receiveShadow = receiveShadow;
    this.group.add(mesh);

    if (raycast) {
      mesh.userData.isLevel = true;
      this.raycastMeshes.push(mesh);
    }

    if (collide) {
      this.colliders.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y - h / 2,
        maxY: y + h / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        blocksSight: true,
        label,
      });
    }

    if (minimap) {
      this.minimapRects.push({ x, z, w, d, kind: minimap });
    }

    return mesh;
  }

  private buildWetFloorsAndDebris(): void {
    // Vivid wet reflective puddle asphalt floor (bright cyan/amber/crimson mirror reflections in puddles!)
    const wetFloorMat = new THREE.MeshStandardMaterial({
      map: this.tex.wetAsphalt.map,
      roughnessMap: this.tex.wetAsphalt.roughnessMap,
      bumpMap: this.tex.wetAsphalt.bumpMap,
      bumpScale: 0.038,
      roughness: 0.72,
      metalness: 0.38,
      envMapIntensity: 2.95,
    });

    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 36), wetFloorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, -1.5);
    floorMesh.receiveShadow = true;
    floorMesh.userData.isLevel = true;
    this.group.add(floorMesh);
    this.raycastMeshes.push(floorMesh);

    this.addBox(0, 0.014, 8.35, 10.6, 0.028, 0.62, this.matSteel, { collide: false, castShadow: false });
    this.addBox(0, 0.018, 8.35, 6.2, 0.024, 0.44, this.matGrate, { collide: false, castShadow: false });

    for (const z of [-2.4, 1.2, 4.8]) {
      this.addBox(0, 0.015, z, 1.45, 0.026, 1.45, this.matGrate, { collide: false, castShadow: false });
    }
    this.addBox(0, 0.012, 1.2, 15.8, 0.02, 0.56, this.matGrate, { collide: false, castShadow: false });
    this.addBox(0, 0.012, 1.2, 0.64, 0.02, 12.2, this.matSteel, { collide: false, castShadow: false });

    const ventGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.55 })
    );
    ventGlow.rotation.x = -Math.PI / 2;
    ventGlow.position.set(0, 0.008, 1.2);
    this.group.add(ventGlow);

    const rubbleGeo = new THREE.DodecahedronGeometry(0.18, 0);
    const rubbleSpots = [
      [-3.2, 7.2, 1.1],
      [-5.1, 6.4, 0.8],
      [3.4, 6.8, 0.9],
      [6.4, 4.1, 1.2],
      [-7.9, 1.2, 1.0],
      [-7.1, -3.1, 1.3],
      [7.4, -4.4, 0.9],
      [-2.8, -5.2, 0.85],
      [2.6, -5.1, 0.95],
      [-4.1, -9.8, 1.1],
      [5.2, -8.5, 0.9],
    ];
    for (let i = 0; i < rubbleSpots.length; i++) {
      const [rx, rz, sc] = rubbleSpots[i];
      for (let k = 0; k < 2; k++) {
        const chunk = new THREE.Mesh(rubbleGeo, k === 0 ? this.matConcrete : this.matSteel);
        chunk.position.set(
          rx + Math.sin(i * 3 + k * 2.1) * 0.42,
          0.07 * sc,
          rz + Math.cos(i * 2 + k * 1.9) * 0.42
        );
        chunk.scale.set(sc * (0.75 + k * 0.25), sc * 0.45, sc * (0.65 + (1 - k) * 0.25));
        chunk.rotation.set(k * 0.7, i * 1.2, k * 0.4);
        chunk.castShadow = false;
        chunk.receiveShadow = true;
        this.group.add(chunk);
      }
    }
  }

  private buildReinforcedColumn(x: number, z: number, width = 1.85, height = 7.1, accentMat = this.matEmissiveCrimson): void {
    this.addBox(x, height / 2, z, width, height, width, this.matConcrete, {
      minimap: 'pillar',
      label: 'pillar',
    });

    this.addBox(x, 0.26, z, width + 0.28, 0.52, width + 0.28, this.matSteel, { collide: false, raycast: false });
    this.addBox(x, 0.58, z, width + 0.14, 0.22, width + 0.14, this.matHazard, { collide: false, raycast: false });

    const off = width * 0.5 + 0.03;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.addBox(x + sx * off, height * 0.52, z + sz * off, 0.22, height - 0.5, 0.22, this.matSteel, {
          collide: false,
          raycast: false,
        });
      }
    }

    for (const cy of [2.4, 4.7, height - 0.35]) {
      this.addBox(x, cy, z, width + 0.22, 0.2, width + 0.22, this.matSteel, { collide: false, raycast: false });
    }

    const stripZ = z > 0 ? z + width * 0.5 + 0.06 : z - width * 0.5 - 0.06;
    this.addBox(x, 3.55, stripZ, 0.1, 2.0, 0.06, accentMat, { collide: false, raycast: false, castShadow: false });
    const stripZ2 = z > 0 ? z - width * 0.5 - 0.06 : z + width * 0.5 + 0.06;
    this.addBox(x, 3.55, stripZ2, 0.1, 2.0, 0.06, accentMat, { collide: false, raycast: false, castShadow: false });

    const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, height - 0.8, 8), this.matPipeCopper);
    conduit.position.set(x + (x < 0 ? off + 0.08 : -(off + 0.08)), height * 0.5, z);
    conduit.castShadow = true;
    this.group.add(conduit);
  }

  private buildSouthEntry(): void {
    this.buildReinforcedColumn(-4.35, 8.25, 1.85, 7.1, this.matEmissiveCrimson);
    this.buildReinforcedColumn(4.35, 8.25, 1.85, 7.1, this.matEmissiveAmber);

    this.addBox(0, 6.65, 8.25, 11.4, 0.78, 1.6, this.matSteel, { collide: false });
    this.addBox(0, 6.22, 7.52, 8.8, 0.16, 0.18, this.matHazard, { collide: false, raycast: false });

    this.addBox(-6.5, 3.5, 12.0, 0.7, 7.0, 7.4, this.matConcrete, { minimap: 'wall' });
    this.addBox(6.5, 3.5, 12.0, 0.7, 7.0, 7.4, this.matConcrete, { minimap: 'wall' });
    this.addBox(0, 3.5, 15.5, 13.7, 7.0, 0.7, this.matConcrete, { minimap: 'wall' });

    for (const wz of [9.8, 12.2, 14.2]) {
      this.addBox(-6.08, 3.5, wz, 0.24, 6.6, 0.36, this.matSteel, { collide: false, raycast: false });
      this.addBox(6.08, 3.5, wz, 0.24, 6.6, 0.36, this.matSteel, { collide: false, raycast: false });
    }

    this.addBox(0, 7.1, 12.0, 13.4, 0.4, 7.4, this.matSteel, { collide: false });
    this.addBox(0, 6.82, 11.2, 3.2, 0.12, 0.28, this.matEmissiveCyan, { collide: false, raycast: false, castShadow: false });

    this.addBox(-8.0, 3.5, 8.4, 3.4, 7.0, 0.7, this.matConcrete, { minimap: 'wall' });
    this.addBox(8.0, 3.5, 8.4, 3.4, 7.0, 0.7, this.matConcrete, { minimap: 'wall' });
  }

  private buildCourtyardWalls(): void {
    this.addBox(-5.625, 3.5, -6.0, 7.75, 7.0, 0.75, this.matConcrete, { minimap: 'wall' });
    this.addBox(5.625, 3.5, -6.0, 7.75, 7.0, 0.75, this.matConcrete, { minimap: 'wall' });
    this.addBox(0, 5.55, -6.0, 3.5, 2.9, 0.75, this.matSteel, { collide: true, minimap: 'arch' });

    this.addBox(-5.8, 5.2, -5.58, 7.1, 3.1, 0.14, this.matCorrugated, { collide: false, raycast: false });
    this.addBox(5.8, 5.2, -5.58, 7.1, 3.1, 0.14, this.matCorrugated, { collide: false, raycast: false });
    for (const bx of [-8.8, -4.6, 4.6, 8.8]) {
      this.addBox(bx, 3.5, -5.48, 0.42, 7.0, 0.34, this.matSteel, { collide: false, raycast: false });
    }
    this.addBox(-5.8, 0.38, -5.58, 7.2, 0.32, 0.08, this.matHazard, { collide: false, raycast: false });
    this.addBox(5.8, 0.38, -5.58, 7.2, 0.32, 0.08, this.matHazard, { collide: false, raycast: false });

    this.addBox(-9.5, 3.5, -0.9, 0.75, 7.0, 10.2, this.matConcrete, { minimap: 'wall' });
    this.addBox(-9.5, 5.4, 5.9, 0.75, 3.2, 3.4, this.matSteel, { minimap: 'arch' });
    this.addBox(-9.5, 3.5, 8.0, 0.75, 7.0, 0.8, this.matConcrete, { minimap: 'wall' });

    this.addBox(-9.08, 5.2, -0.9, 0.14, 3.1, 9.6, this.matCorrugated, { collide: false, raycast: false });
    for (const bz of [-4.2, -1.0, 2.2]) {
      this.addBox(-9.02, 3.5, bz, 0.32, 7.0, 0.42, this.matSteel, { collide: false, raycast: false });
    }
    this.addBox(-9.04, 3.9, 5.9, 0.24, 0.14, 3.4, this.matEmissiveCrimson, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
    this.addBox(-9.5, 1.9, 4.15, 0.96, 3.8, 0.34, this.matSteel, { collide: false });
    this.addBox(-9.5, 1.9, 7.65, 0.96, 3.8, 0.34, this.matSteel, { collide: false });
    this.addBox(-9.5, 3.88, 5.9, 0.98, 0.34, 3.84, this.matSteel, { collide: false });

    this.addBox(9.5, 3.5, -3.8, 0.75, 7.0, 4.4, this.matConcrete, { minimap: 'wall' });
    this.addBox(9.5, 3.5, 6.4, 0.75, 7.0, 4.0, this.matConcrete, { minimap: 'wall' });
    this.addBox(9.5, 5.45, 1.4, 0.75, 3.1, 6.0, this.matSteel, { minimap: 'arch' });
    this.addBox(9.5, 1.95, 1.4, 0.94, 3.9, 0.94, this.matSteel, { minimap: 'pillar' });
    this.addBox(9.5, 0.35, 1.4, 1.06, 0.32, 1.06, this.matHazard, { collide: false, raycast: false });

    this.addBox(9.5, 1.95, -1.6, 0.96, 3.9, 0.34, this.matSteel, { collide: false });
    this.addBox(9.5, 1.95, 4.4, 0.96, 3.9, 0.34, this.matSteel, { collide: false });
    this.addBox(9.5, 3.98, 1.4, 0.98, 0.36, 6.36, this.matSteel, { collide: false });
    this.addBox(9.02, 4.05, 1.4, 0.14, 0.12, 5.4, this.matEmissiveCyan, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
  }

  private buildIndustrialBulkheadArchway(): void {
    const shape = new THREE.Shape();
    const ow = 2.48;
    const iw = 1.72;
    const ih = 4.18;
    const oh = 4.92;

    shape.moveTo(-ow, 0);
    shape.lineTo(-ow, oh - 0.65);
    shape.lineTo(-ow + 0.75, oh);
    shape.lineTo(ow - 0.75, oh);
    shape.lineTo(ow, oh - 0.65);
    shape.lineTo(ow, 0);
    shape.lineTo(iw, 0);
    shape.lineTo(iw, ih - 0.55);
    shape.lineTo(iw - 0.52, ih);
    shape.lineTo(-iw + 0.52, ih);
    shape.lineTo(-iw, ih - 0.55);
    shape.lineTo(-iw, 0);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.16,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -0.58);

    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) * 0.25, pos.getY(i) * 0.25);
    }
    uv.needsUpdate = true;

    const bulkhead = new THREE.Mesh(geo, this.matSteel);
    bulkhead.position.set(0, 0, -6.0);
    bulkhead.castShadow = true;
    bulkhead.receiveShadow = true;
    bulkhead.userData.isLevel = true;
    this.group.add(bulkhead);
    this.raycastMeshes.push(bulkhead);

    this.addBox(-2.12, 0.34, -6.0, 0.84, 0.68, 1.32, this.matHazard, { collide: false });
    this.addBox(2.12, 0.34, -6.0, 0.84, 0.68, 1.32, this.matHazard, { collide: false });
    this.addBox(-2.15, 3.65, -5.36, 0.22, 0.45, 0.12, this.matEmissiveAmber, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
    this.addBox(2.15, 3.65, -5.36, 0.22, 0.45, 0.12, this.matEmissiveAmber, {
      collide: false,
      raycast: false,
      castShadow: false,
    });

    const signMat = new THREE.MeshStandardMaterial({
      map: this.tex.signSector,
      emissiveMap: this.tex.signSector,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.85,
      roughness: 0.4,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.08, 0.14), signMat);
    sign.position.set(0, 5.55, -5.38);
    this.group.add(sign);

    this.buildElevatedCatwalk(-6.2, 4.65, -4.85, 6.2, 1.35);
    this.buildElevatedCatwalk(6.2, 4.65, -4.85, 6.2, 1.35);
    this.buildElevatedCatwalk(-8.45, 4.65, 0.4, 1.45, 9.2);
  }

  private buildElevatedCatwalk(x: number, y: number, z: number, w: number, d: number): void {
    this.addBox(x, y, z, w, 0.12, d, this.matGrate, { collide: false, raycast: false });
    const isLongX = w >= d;
    if (isLongX) {
      this.addBox(x, y + 0.95, z + d * 0.46, w, 0.06, 0.06, this.matPipeDark, { collide: false, raycast: false });
      this.addBox(x, y + 0.5, z + d * 0.46, w, 0.04, 0.04, this.matPipeDark, { collide: false, raycast: false });
      for (let px = -w * 0.45; px <= w * 0.46; px += 1.5) {
        this.addBox(x + px, y + 0.48, z + d * 0.46, 0.055, 0.96, 0.055, this.matPipeDark, {
          collide: false,
          raycast: false,
        });
      }
    } else {
      this.addBox(x + w * 0.46, y + 0.95, z, 0.06, 0.06, d, this.matPipeDark, { collide: false, raycast: false });
      this.addBox(x + w * 0.46, y + 0.5, z, 0.04, 0.04, d, this.matPipeDark, { collide: false, raycast: false });
      for (let pz = -d * 0.45; pz <= d * 0.46; pz += 1.8) {
        this.addBox(x + w * 0.46, y + 0.48, z + pz, 0.055, 0.96, 0.055, this.matPipeDark, {
          collide: false,
          raycast: false,
        });
      }
    }
  }

  private buildOverheadTrussesPipesAndCables(): void {
    for (const z of [-4.4, -1.2, 2.0, 5.2]) {
      this.addBox(0, 6.55, z, 19.2, 0.22, 0.24, this.matSteel, { collide: false, raycast: false });
      this.addBox(0, 7.35, z, 19.2, 0.18, 0.2, this.matSteel, { collide: false, raycast: false });

      for (let x = -8.0; x <= 7.5; x += 2.6) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), this.matPipeDark);
        strut.position.set(x + 1.3, 6.95, z);
        strut.rotation.z = x % 5.2 === 0 ? 0.65 : -0.65;
        strut.castShadow = true;
        this.group.add(strut);
      }
    }

    const pipeLen = 14.8;
    const pipeDefs = [
      { x: -5.2, y: 6.18, r: 0.12, mat: this.matPipeDark },
      { x: -4.85, y: 6.12, r: 0.085, mat: this.matPipeCopper },
      { x: 4.9, y: 6.18, r: 0.13, mat: this.matPipeDark },
      { x: 5.3, y: 6.12, r: 0.08, mat: this.matPipeCopper },
    ];
    for (const p of pipeDefs) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, pipeLen, 10), p.mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(p.x, p.y, 1.2);
      mesh.castShadow = true;
      this.group.add(mesh);
    }

    const lightFixtures = [
      { x: -3.2, z: 2.0, mat: this.matEmissiveCrimson },
      { x: 2.8, z: -1.2, mat: this.matEmissiveCyan },
      { x: -2.4, z: -4.4, mat: this.matEmissiveAmber },
      { x: 3.4, z: 5.2, mat: this.matEmissiveCyan },
    ];
    for (const lf of lightFixtures) {
      this.addBox(lf.x, 6.18, lf.z, 2.4, 0.14, 0.28, this.matPipeDark, { collide: false, raycast: false });
      this.addBox(lf.x, 6.08, lf.z, 2.2, 0.07, 0.14, lf.mat, {
        collide: false,
        raycast: false,
        castShadow: false,
      });
    }

    const cableRuns: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [new THREE.Vector3(-4.3, 6.4, 7.6), new THREE.Vector3(-9.0, 5.5, 1.8), 1.05],
      [new THREE.Vector3(-4.2, 6.2, 7.6), new THREE.Vector3(3.8, 6.1, 2.1), 1.35],
      [new THREE.Vector3(4.3, 6.3, 7.6), new THREE.Vector3(9.0, 5.4, -1.2), 1.15],
      [new THREE.Vector3(-8.9, 5.8, -2.0), new THREE.Vector3(-2.1, 5.9, -5.5), 0.92],
      [new THREE.Vector3(2.1, 5.9, -5.5), new THREE.Vector3(8.9, 5.6, -3.2), 0.88],
      [new THREE.Vector3(-6.0, 6.3, -1.2), new THREE.Vector3(6.0, 6.2, -4.4), 1.25],
    ];

    for (const [start, end, sag] of cableRuns) {
      const mid1 = new THREE.Vector3().lerpVectors(start, end, 0.33);
      mid1.y -= sag * 0.82;
      const mid2 = new THREE.Vector3().lerpVectors(start, end, 0.67);
      mid2.y -= sag * 0.88;
      const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, end]);
      const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.032, 6, false);
      const cable = new THREE.Mesh(tubeGeo, this.matCable);
      cable.castShadow = true;
      this.group.add(cable);
    }
  }

  private buildIndustrialPropsAndFireBarrels(): void {
    const acGroup = new THREE.Group();
    acGroup.position.set(-6.9, 5.45, -5.28);
    acGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.88, 0.56), this.matSteel));
    const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14), this.matPipeDark);
    grille.rotation.x = Math.PI / 2;
    grille.position.set(-0.22, 0, 0.28);
    acGroup.add(grille);
    this.group.add(acGroup);

    const pipeN = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 18.6, 8), this.matPipeCopper);
    pipeN.rotation.z = Math.PI / 2;
    pipeN.position.set(0, 5.85, -5.44);
    this.group.add(pipeN);

    const warnMat = new THREE.MeshStandardMaterial({
      map: this.tex.signWarning,
      emissiveMap: this.tex.signWarning,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.72,
      roughness: 0.45,
    });
    const warnSign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.86, 2.65), warnMat);
    warnSign.position.set(-9.02, 2.55, -1.65);
    this.group.add(warnSign);

    this.addBox(-7.4, 0.55, -4.65, 1.3, 1.1, 1.2, this.matCrate, { minimap: 'crate' });
    this.addBox(-6.2, 0.42, -4.85, 0.95, 0.84, 0.95, this.matCrate, { minimap: 'crate' });

    this.addBurningFireBarrel(-5.25, -4.75, 34, 0.4, true);
    this.addBurningFireBarrel(6.9, 5.5, 28, 2.7, true);
    this.addBurningFireBarrel(-11.2, -13.6, 0, 4.1, false);
  }

  private addBurningFireBarrel(x: number, z: number, lightIntensity: number, phase: number, withPointLight = true): void {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.39, 1.06, 12), this.matPipeDark);
    barrel.position.set(x, 0.53, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    barrel.userData.isLevel = true;
    this.group.add(barrel);
    this.raycastMeshes.push(barrel);

    for (const ry of [0.28, 0.78]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.415, 0.025, 5, 14), this.matSteel);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(x, ry, z);
      this.group.add(rib);
    }

    const coals = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.34, 0.08, 10),
      new THREE.MeshBasicMaterial({ color: 0xff922e })
    );
    coals.position.set(x, 1.02, z);
    this.group.add(coals);

    const flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff5518,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffe488,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.92, 6), flameOuterMat);
    outer.position.set(x, 1.38, z);
    this.group.add(outer);
    this.flameMeshes.push({ mesh: outer, baseY: 1.38, phase, baseScale: 1.0 });

    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.64, 5), flameCoreMat);
    inner.position.set(x, 1.28, z);
    this.group.add(inner);
    this.flameMeshes.push({ mesh: inner, baseY: 1.28, phase: phase + 1.5, baseScale: 0.85 });

    if (withPointLight && lightIntensity > 0) {
      const fireLight = new THREE.PointLight(0xff6b1c, lightIntensity, 20, 1.35);
      fireLight.position.set(x, 1.72, z);
      this.group.add(fireLight);
      this.flickerLights.push({
        light: fireLight,
        baseIntensity: lightIntensity,
        speed: 7.5,
        phase,
        mode: 'fire',
      });
    }

    this.colliders.push({
      minX: x - 0.45,
      maxX: x + 0.45,
      minY: 0,
      maxY: 1.08,
      minZ: z - 0.45,
      maxZ: z + 0.45,
      blocksSight: false,
    });
  }

  private buildFoundryMarketHall(): void {
    this.addBox(0, 3.4, -18.5, 31.4, 6.8, 0.75, this.matConcrete, { minimap: 'wall' });
    this.addBox(0, 3.6, -18.08, 18.0, 5.4, 0.14, this.matCorrugated, { collide: false, raycast: false });

    const ventBackdrop = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 2.35, 2.85) })
    );
    ventBackdrop.position.set(0, 3.3, -17.98);
    this.group.add(ventBackdrop);

    // Luminous additive cyan glow halo radiating around the turbine exhaust
    const ventHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex.flashSprite,
        color: 0x32eeff,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ventHalo.position.set(0, 3.3, -17.55);
    ventHalo.scale.set(7.4, 7.4, 1);
    this.group.add(ventHalo);

    const ventRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 10, 32), this.matSteel);
    ventRing.position.set(0, 3.3, -17.84);
    this.group.add(ventRing);

    const fanHub = new THREE.Group();
    fanHub.position.set(0, 3.3, -17.64);
    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 14), this.matPipeDark);
    hubCap.rotation.x = Math.PI / 2;
    fanHub.add(hubCap);
    // Each blade sits in its own radial pivot so aerodynamic pitch twists along its radial axis — ZERO backdrop clipping!
    for (let i = 0; i < 6; i++) {
      const bladePivot = new THREE.Group();
      const ang = (i / 6) * Math.PI * 2;
      bladePivot.rotation.z = ang;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.05, 0.08), this.matPipeDark);
      blade.position.set(0, 1.15, 0);
      blade.rotation.y = 0.24;
      bladePivot.add(blade);
      fanHub.add(bladePivot);
    }
    this.group.add(fanHub);
    this.fanBlades.push(fanHub);

    this.addBox(-10.5, 3.4, -8.2, 0.75, 6.8, 4.4, this.matConcrete, { minimap: 'wall' });
    this.addBox(-10.5, 3.4, -16.85, 0.75, 6.8, 3.3, this.matConcrete, { minimap: 'wall' });
    this.addBox(-10.5, 5.35, -12.8, 0.75, 2.9, 4.8, this.matSteel, { minimap: 'arch' });

    this.addBox(10.5, 3.4, -8.2, 0.75, 6.8, 4.4, this.matConcrete, { minimap: 'wall' });
    this.addBox(10.5, 3.4, -16.85, 0.75, 6.8, 3.3, this.matConcrete, { minimap: 'wall' });
    this.addBox(10.5, 5.35, -12.8, 0.75, 2.9, 4.8, this.matSteel, { minimap: 'arch' });

    this.addBox(-6.6, 6.7, -12.2, 8.2, 0.38, 12.6, this.matSteel, { collide: false });
    this.addBox(6.6, 6.7, -12.2, 8.2, 0.38, 12.6, this.matSteel, { collide: false });
    for (let z = -17.0; z <= -7.2; z += 2.45) {
      this.addBox(0, 6.62, z, 5.4, 0.24, 0.24, this.matPipeDark, { collide: false, raycast: false });
    }
    this.addBox(-3.6, 6.45, -12.0, 0.16, 0.12, 8.5, this.matEmissiveCyan, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
    this.addBox(3.6, 6.45, -12.0, 0.16, 0.12, 8.5, this.matEmissiveCyan, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
  }

  private buildWestConduitAlley(): void {
    this.addBox(-15.5, 3.5, -5.0, 0.75, 7.0, 27.6, this.matConcrete, { minimap: 'wall' });
    this.addBox(-12.5, 3.5, 8.4, 6.4, 7.0, 0.75, this.matConcrete, { minimap: 'wall' });

    for (let z = -14.0; z <= 6.0; z += 3.3) {
      this.addBox(-12.5, 5.85, z, 6.0, 0.22, 0.22, this.matSteel, { collide: false, raycast: false });
    }
    this.addBox(-15.05, 4.5, -2.0, 0.12, 0.12, 12.0, this.matEmissiveCrimson, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
    const alleyPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 24, 10), this.matPipeCopper);
    alleyPipe.rotation.x = Math.PI / 2;
    alleyPipe.position.set(-14.8, 3.8, -4.5);
    this.group.add(alleyPipe);
  }

  private buildEastTurbineBay(): void {
    this.addBox(15.5, 3.5, -5.0, 0.75, 7.0, 27.6, this.matConcrete, { minimap: 'wall' });
    this.addBox(12.5, 3.5, 8.4, 6.4, 7.0, 0.75, this.matConcrete, { minimap: 'wall' });

    for (let z = -14.0; z <= 6.5; z += 3.4) {
      this.addBox(12.5, 5.9, z, 6.0, 0.22, 0.24, this.matSteel, { collide: false, raycast: false });
    }
    this.addBox(15.05, 4.6, -2.5, 0.12, 0.12, 13.0, this.matEmissiveCyan, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
  }

  private buildTacticalCover(): void {
    this.addBox(5.85, 0.72, -0.2, 1.45, 1.44, 1.45, this.matCrate, { minimap: 'crate' });
    this.addBox(5.85, 1.84, -0.2, 1.05, 0.8, 1.05, this.matSteel, { minimap: 'crate' });
    this.addBox(5.12, 1.1, -0.2, 0.05, 0.08, 0.9, this.matEmissiveCyan, {
      collide: false,
      raycast: false,
      castShadow: false,
    });
    this.addBox(4.7, 0.38, -0.1, 0.85, 0.76, 0.9, this.matCrate, { minimap: 'crate' });

    this.addBox(-5.6, 0.58, 1.9, 1.55, 1.16, 1.05, this.matConcrete, { minimap: 'crate' });
    this.addBox(-5.6, 1.08, 1.9, 1.6, 0.18, 1.1, this.matHazard, { collide: false, raycast: false });

    this.addBox(-4.65, 0.85, -11.9, 1.7, 1.7, 1.7, this.matCrate, { minimap: 'crate' });
    this.addBox(-3.4, 0.45, -11.4, 0.95, 0.9, 0.95, this.matSteel, { minimap: 'crate' });

    this.addBox(4.65, 0.85, -11.9, 1.7, 1.7, 1.7, this.matCrate, { minimap: 'crate' });
    this.addBox(4.65, 2.15, -11.9, 1.15, 0.9, 1.15, this.matSteel, { minimap: 'crate' });
    this.addBox(3.78, 1.15, -11.9, 0.06, 0.1, 1.1, this.matEmissiveAmber, {
      collide: false,
      raycast: false,
      castShadow: false,
    });

    this.addBox(0, 0.56, -15.9, 3.8, 1.12, 0.9, this.matSteel, { minimap: 'crate' });
    this.addBox(0, 1.04, -15.44, 3.4, 0.12, 0.06, this.matEmissiveCyan, {
      collide: false,
      raycast: false,
      castShadow: false,
    });

    this.addBox(-13.4, 0.65, -2.2, 1.4, 1.3, 1.4, this.matCrate, { minimap: 'crate' });
    this.addBox(-11.4, 0.55, -8.5, 1.3, 1.1, 1.1, this.matSteel, { minimap: 'crate' });

    this.addBox(13.2, 0.7, 3.6, 1.5, 1.4, 1.4, this.matCrate, { minimap: 'crate' });
    this.addBox(11.6, 0.65, -6.2, 1.4, 1.3, 1.3, this.matSteel, { minimap: 'crate' });
  }

  private buildEmbersAndVolumetricBeams(): THREE.Points {
    const cyanBeamMat = new THREE.MeshBasicMaterial({
      color: 0x36eeff,
      transparent: true,
      opacity: 0.082,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const crimsonBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff2666,
      transparent: true,
      opacity: 0.068,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const amberBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff8c2b,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const beamSpecs = [
      { x: 0.0, y: 3.3, z: -10.4, w: 4.2, h: 7.4, mat: cyanBeamMat, rotZ: -0.22 },
      { x: 2.2, y: 3.4, z: -1.4, w: 3.0, h: 7.2, mat: cyanBeamMat, rotZ: -0.28 },
      { x: -5.4, y: 3.2, z: 3.2, w: 3.2, h: 7.0, mat: crimsonBeamMat, rotZ: 0.32 },
      { x: -5.1, y: 2.8, z: -4.4, w: 2.8, h: 6.2, mat: amberBeamMat, rotZ: 0.18 },
    ];
    for (const b of beamSpecs) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), b.mat);
      plane.position.set(b.x, b.y, b.z);
      plane.rotation.set(0.14, 0.25, b.rotZ);
      this.group.add(plane);
    }

    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = 0.2 + Math.random() * 6.5;
      positions[i * 3 + 2] = -16 + Math.random() * 28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.tex.emberSprite,
      color: 0xff9a3a,
      size: 0.18,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    return points;
  }

  private buildWaypoints(): Waypoint[] {
    const raw: Array<{ id: number; x: number; z: number; neighbors: number[]; cover?: boolean; zone: string }> = [
      { id: 0, x: 0.0, z: 10.6, neighbors: [1, 2, 3], zone: 'SOUTH ACCESS' },
      { id: 1, x: -2.8, z: 5.2, neighbors: [0, 2, 4, 12], cover: true, zone: 'YARD WEST' },
      { id: 2, x: 0.0, z: 1.5, neighbors: [0, 1, 3, 4, 5, 6], zone: 'CENTRAL YARD' },
      { id: 3, x: 3.1, z: 5.0, neighbors: [0, 2, 5, 16], cover: true, zone: 'YARD EAST' },
      { id: 4, x: -3.5, z: -2.5, neighbors: [1, 2, 6], cover: true, zone: 'FURNACE CORNER' },
      { id: 5, x: 3.6, z: -2.5, neighbors: [2, 3, 6, 17], cover: true, zone: 'CARGO STACK' },
      { id: 6, x: 0.0, z: -6.0, neighbors: [2, 4, 5, 7], zone: 'BLAST BULKHEAD' },
      { id: 7, x: 0.0, z: -9.0, neighbors: [6, 8, 9, 10], zone: 'FOUNDRY BAY' },
      { id: 8, x: -6.8, z: -12.5, neighbors: [7, 10, 15], cover: true, zone: 'FOUNDRY WEST' },
      { id: 9, x: 6.8, z: -12.5, neighbors: [7, 10, 19], cover: true, zone: 'FOUNDRY EAST' },
      { id: 10, x: 0.0, z: -14.2, neighbors: [7, 8, 9, 11], cover: true, zone: 'TURBINE CORE' },
      { id: 11, x: 0.0, z: -17.1, neighbors: [8, 9, 10], zone: 'REACTOR DECK' },
      { id: 12, x: -8.2, z: 5.9, neighbors: [1, 13], zone: 'CONDUIT ENTRY' },
      { id: 13, x: -12.4, z: 5.4, neighbors: [12, 14], zone: 'CONDUIT ALLEY' },
      { id: 14, x: -11.6, z: -1.8, neighbors: [13, 15], cover: true, zone: 'CONDUIT ALLEY' },
      { id: 15, x: -12.5, z: -12.6, neighbors: [14, 8], zone: 'ALLEY NORTH' },
      { id: 16, x: 8.0, z: 2.8, neighbors: [3, 18], zone: 'EAST BULKHEAD' },
      { id: 17, x: 8.0, z: -0.2, neighbors: [5, 18], zone: 'EAST BULKHEAD' },
      { id: 18, x: 12.6, z: 0.6, neighbors: [16, 17, 19], cover: true, zone: 'TURBINE BAY' },
      { id: 19, x: 12.8, z: -12.5, neighbors: [18, 9], zone: 'TURBINE NORTH' },
    ];

    return raw.map((w) => ({
      id: w.id,
      pos: new THREE.Vector3(w.x, 0, w.z),
      neighbors: w.neighbors,
      cover: w.cover,
      zone: w.zone,
    }));
  }

  private buildZones(): ZoneDef[] {
    return [
      { name: 'SOUTH ACCESS', minX: -7, maxX: 7, minZ: 8.2, maxZ: 16 },
      { name: 'CENTRAL YARD', minX: -9.5, maxX: 9.5, minZ: -5.6, maxZ: 8.2 },
      { name: 'BLAST BULKHEAD', minX: -2.6, maxX: 2.6, minZ: -7.6, maxZ: -5.2 },
      { name: 'FOUNDRY BAY 07', minX: -10.5, maxX: 10.5, minZ: -18.5, maxZ: -6.0 },
      { name: 'CONDUIT ALLEY', minX: -16, maxX: -9.5, minZ: -18.5, maxZ: 8.6 },
      { name: 'TURBINE BAY', minX: 9.5, maxX: 16, minZ: -18.5, maxZ: 8.6 },
    ];
  }
}
