import * as THREE from 'three';
import { AABB, MapId, MinimapRect, Waypoint, ZoneDef } from '../types';
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

  public build(scene: THREE.Scene, mapId: MapId = 'factory'): BuiltLevel {
    if (mapId === 'factory') {
      return this.buildCryzenFactory(scene);
    }
    return this.buildFoundry(scene);
  }

  private buildFoundry(scene: THREE.Scene): BuiltLevel {
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
        { pos: new THREE.Vector3(3.15, 0, 4.95), yaw: 0.28, role: 'ember', name: 'PULSE' },
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
    this.group.add(new THREE.Mesh(skyGeo, skyMat));

    scene.fog = new THREE.FogExp2(0x0c1320, 0.0185);

    const hemi = new THREE.HemisphereLight(0x3f72a8, 0x361826, 0.72);
    this.group.add(hemi);

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
    this.group.add(keyLight);
    this.group.add(keyLight.target);

    // Warm furnace directional rim light (virtually zero GPU cost, adds vibrant orange edge highlights!)
    const rimWarm = new THREE.DirectionalLight(0xff7830, 0.62);
    rimWarm.position.set(16, 7, 12);
    this.group.add(rimWarm);
    this.group.add(rimWarm.target);

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
    // Slightly expanded outer steel armor collision envelope so player/bullets never clip into corner steel ribs!
    this.colliders.push({
      minX: x - (width * 0.5 + 0.14),
      maxX: x + (width * 0.5 + 0.14),
      minY: 0,
      maxY: height,
      minZ: z - (width * 0.5 + 0.14),
      maxZ: z + (width * 0.5 + 0.14),
      blocksSight: true,
      label: 'pillar-armor',
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
      this.addBox(-6.08, 3.5, wz, 0.24, 6.6, 0.36, this.matSteel, { collide: true, raycast: true, castShadow: false });
      this.addBox(6.08, 3.5, wz, 0.24, 6.6, 0.36, this.matSteel, { collide: true, raycast: true, castShadow: false });
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
      this.addBox(bx, 3.5, -5.48, 0.42, 7.0, 0.34, this.matSteel, { collide: true, raycast: true, castShadow: false });
    }
    // Seal the 1m West/East corner junction between courtyard wall (x=±9.5) and market hall wall (x=±10.5) at z=-6.0!
    this.addBox(-10.0, 3.5, -6.0, 1.45, 7.0, 0.85, this.matConcrete, { minimap: 'wall' });
    this.addBox(10.0, 3.5, -6.0, 1.45, 7.0, 0.85, this.matConcrete, { minimap: 'wall' });
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
    this.addBox(-9.5, 1.9, 4.15, 0.96, 3.8, 0.34, this.matSteel, { collide: true, raycast: true, castShadow: false });
    this.addBox(-9.5, 1.9, 7.65, 0.96, 3.8, 0.34, this.matSteel, { collide: true, raycast: true, castShadow: false });
    this.addBox(-9.5, 3.88, 5.9, 0.98, 0.34, 3.84, this.matSteel, { collide: true, raycast: true, castShadow: false });

    this.addBox(9.5, 3.5, -3.8, 0.75, 7.0, 4.4, this.matConcrete, { minimap: 'wall' });
    this.addBox(9.5, 3.5, 6.4, 0.75, 7.0, 4.0, this.matConcrete, { minimap: 'wall' });
    this.addBox(9.5, 5.45, 1.4, 0.75, 3.1, 6.0, this.matSteel, { minimap: 'arch' });
    this.addBox(9.5, 1.95, 1.4, 0.94, 3.9, 0.94, this.matSteel, { minimap: 'pillar' });
    this.addBox(9.5, 0.35, 1.4, 1.06, 0.32, 1.06, this.matHazard, { collide: false, raycast: false });

    this.addBox(9.5, 1.95, -1.6, 0.96, 3.9, 0.34, this.matSteel, { collide: true, raycast: true, castShadow: false });
    this.addBox(9.5, 1.95, 4.4, 0.96, 3.9, 0.34, this.matSteel, { collide: true, raycast: true, castShadow: false });
    this.addBox(9.5, 3.98, 1.4, 0.98, 0.36, 6.36, this.matSteel, { collide: true, raycast: true, castShadow: false });
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

    // Solid colliders matching the extruded steel bulkhead jambs & header so players/bullets never clip into the archway!
    this.colliders.push(
      { minX: -2.55, maxX: -1.7, minY: 0, maxY: 4.95, minZ: -6.66, maxZ: -5.34, blocksSight: true, label: 'bulkhead-l' },
      { minX: 1.7, maxX: 2.55, minY: 0, maxY: 4.95, minZ: -6.66, maxZ: -5.34, blocksSight: true, label: 'bulkhead-r' }
    );

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
    // 100% obstacle-clear 23-node Warehouse tactical navgraph (clears East arch pillar, mid/north crates & steel barrier!)
    const raw: Array<{ id: number; x: number; z: number; neighbors: number[]; cover?: boolean; zone: string }> = [
      { id: 0, x: 0.0, z: 10.6, neighbors: [1, 2, 3], zone: 'SOUTH ACCESS' },
      { id: 1, x: -2.8, z: 5.2, neighbors: [0, 2, 4, 12], cover: true, zone: 'YARD WEST' },
      { id: 2, x: 0.0, z: 1.5, neighbors: [0, 1, 3, 4, 5, 6], zone: 'CENTRAL YARD' },
      { id: 3, x: 3.1, z: 5.0, neighbors: [0, 2, 5, 16], cover: true, zone: 'YARD EAST' },
      { id: 4, x: -3.4, z: -2.6, neighbors: [1, 2, 6], cover: true, zone: 'FURNACE CORNER' },
      { id: 5, x: 3.3, z: -2.6, neighbors: [2, 3, 6, 17], cover: true, zone: 'CARGO STACK' },
      { id: 6, x: 0.0, z: -6.0, neighbors: [2, 4, 5, 7], zone: 'LOADING GATE' },
      { id: 7, x: 0.0, z: -9.4, neighbors: [6, 8, 9, 10], zone: 'WAREHOUSE BAY' },
      { id: 8, x: -6.8, z: -9.8, neighbors: [7, 21], cover: true, zone: 'WAREHOUSE WEST' },
      { id: 9, x: 6.8, z: -9.8, neighbors: [7, 22], cover: true, zone: 'WAREHOUSE EAST' },
      { id: 10, x: 0.0, z: -13.8, neighbors: [7, 21, 22], cover: true, zone: 'TURBINE CORE' },
      { id: 11, x: 0.0, z: -17.3, neighbors: [21, 22], zone: 'REACTOR DECK' },
      { id: 12, x: -8.2, z: 5.9, neighbors: [1, 13], zone: 'CONDUIT ENTRY' },
      { id: 13, x: -12.4, z: 5.4, neighbors: [12, 14], zone: 'CONDUIT ALLEY' },
      { id: 14, x: -11.6, z: -1.8, neighbors: [13, 15], cover: true, zone: 'CONDUIT ALLEY' },
      { id: 15, x: -12.5, z: -13.2, neighbors: [14, 21], zone: 'ALLEY NORTH' },
      { id: 16, x: 8.0, z: 3.0, neighbors: [3, 20], zone: 'EAST BULKHEAD' },
      { id: 17, x: 8.0, z: -0.6, neighbors: [5, 18], zone: 'EAST BULKHEAD' },
      { id: 18, x: 11.8, z: -0.6, neighbors: [17, 19, 20], cover: true, zone: 'EAST BAY' },
      { id: 19, x: 12.6, z: -13.2, neighbors: [18, 22], zone: 'EAST BAY NORTH' },
      { id: 20, x: 11.4, z: 3.0, neighbors: [16, 18], zone: 'EAST BAY SOUTH' },
      { id: 21, x: -6.8, z: -14.2, neighbors: [8, 10, 11, 15], cover: true, zone: 'WAREHOUSE NW' },
      { id: 22, x: 6.8, z: -14.2, neighbors: [9, 10, 11, 19], cover: true, zone: 'WAREHOUSE NE' },
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
      { name: 'SOUTH ENTRY', minX: -7, maxX: 7, minZ: 8.2, maxZ: 16 },
      { name: 'MAIN YARD', minX: -9.5, maxX: 9.5, minZ: -5.6, maxZ: 8.2 },
      { name: 'LOADING GATE', minX: -2.6, maxX: 2.6, minZ: -7.6, maxZ: -5.2 },
      { name: 'WAREHOUSE BAY', minX: -10.5, maxX: 10.5, minZ: -18.5, maxZ: -6.0 },
      { name: 'WEST ALLEY', minX: -16, maxX: -9.5, minZ: -18.5, maxZ: 8.6 },
      { name: 'EAST BAY', minX: 9.5, maxX: 16, minZ: -18.5, maxZ: 8.6 },
    ];
  }

  // =========================================================================
  // VIBRANT GOLDEN-HOUR CRYZEN "FACTORY" MAP (FOUNDRY-GRADE PBR + BLOOM!)
  // =========================================================================
  private buildCryzenFactory(scene: THREE.Scene): BuiltLevel {
    // 1. Vibrant golden-hour azure sky dome with radiant sunlit horizon & clouds
    const skyGeo = new THREE.SphereGeometry(160, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#1348a8') },
        midColor: { value: new THREE.Color('#3496f2') },
        horizonColor: { value: new THREE.Color('#ffbe78') },
        sunDir: { value: new THREE.Vector3(0.45, 0.52, 0.48).normalize() },
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
        uniform vec3 sunDir;
        varying vec3 vWorldPos;
        void main() {
          vec3 d = normalize(vWorldPos);
          float h = d.y;
          vec3 col = mix(horizonColor, midColor, smoothstep(-0.02, 0.24, h));
          col = mix(col, topColor, smoothstep(0.22, 0.78, h));
          float sunDot = max(dot(d, sunDir), 0.0);
          col += vec3(1.4, 0.96, 0.52) * pow(sunDot, 36.0) * 0.9;
          col += vec3(1.0, 0.72, 0.42) * pow(sunDot, 5.0) * 0.24;
          // Warm backlit golden clouds across mid-sky
          float cloudBand = smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.32, 0.56, h));
          float w = sin(d.x * 7.5 + d.z * 4.2) * cos(d.z * 6.0 - d.x * 3.1);
          col = mix(col, vec3(1.0, 0.91, 0.8), cloudBand * smoothstep(0.26, 0.72, w * 0.5 + 0.5) * 0.55);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.group.add(new THREE.Mesh(skyGeo, skyMat));

    scene.fog = new THREE.FogExp2(0x8bb9e6, 0.0046);

    // Crisp alpine winter sunlight + cool glacial-blue snow bounce (unmistakable BGMI Vikendi look!)
    const hemi = new THREE.HemisphereLight(0xa4daff, 0x7da7cf, 0.96);
    this.group.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xfff0d4, 2.28);
    sunLight.position.set(17, 26, 15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 72;
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 22;
    sunLight.shadow.camera.bottom = -22;
    sunLight.shadow.bias = -0.0007;
    sunLight.shadow.normalBias = 0.032;
    this.group.add(sunLight);
    this.group.add(sunLight.target);

    // Vivid electric-cyan alpine sky rim fill for crisp icy shadows on snow & rich building contrast!
    const skyFill = new THREE.DirectionalLight(0x4ecbff, 0.82);
    skyFill.position.set(-16, 11, -15);
    this.group.add(skyFill);
    this.group.add(skyFill.target);

    // Dynamic vibrant industrial accent point lights (cyan bay glow, crimson west breach, warm east bounce)
    const northCyanGlow = new THREE.PointLight(0x1ceeff, 36, 24, 1.3);
    northCyanGlow.position.set(0, 4.2, -15.4);
    this.group.add(northCyanGlow);

    const westCrimsonGlow = new THREE.PointLight(0xff2862, 26, 20, 1.35);
    westCrimsonGlow.position.set(-9.4, 3.8, 1.4);
    this.group.add(westCrimsonGlow);

    const eastAmberGlow = new THREE.PointLight(0xff8c28, 28, 22, 1.35);
    eastAmberGlow.position.set(9.8, 4.0, -1.2);
    this.group.add(eastAmberGlow);

    // 2. Vibrant BGMI Vikendi Snow & Factory PBR Materials (sparkling alpine snow, crisp brick, glossy ribbed containers!)
    const matSnow = new THREE.MeshStandardMaterial({
      color: 0xf7fbff,
      map: this.tex.vikendiSnowPBR.map,
      roughnessMap: this.tex.vikendiSnowPBR.roughnessMap,
      bumpMap: this.tex.vikendiSnowPBR.bumpMap,
      bumpScale: 0.056,
      roughness: 0.84,
      metalness: 0.04,
      envMapIntensity: 0.86,
    });
    const matOuterSnow = new THREE.MeshStandardMaterial({
      color: 0xecf5fd,
      roughness: 0.88,
      metalness: 0.02,
      envMapIntensity: 0.78,
    });
    const matSnowDrift = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.vikendiSnowPBR.map,
      roughnessMap: this.tex.vikendiSnowPBR.roughnessMap,
      bumpMap: this.tex.vikendiSnowPBR.bumpMap,
      bumpScale: 0.036,
      roughness: 0.84,
      metalness: 0.02,
      envMapIntensity: 0.88,
    });
    const matBrick = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.cryzenBrickPBR.map,
      roughnessMap: this.tex.cryzenBrickPBR.roughnessMap,
      bumpMap: this.tex.cryzenBrickPBR.bumpMap,
      bumpScale: 0.058,
      roughness: 0.78,
      metalness: 0.06,
      envMapIntensity: 0.95,
    });
    const matFactoryConcrete = new THREE.MeshStandardMaterial({
      color: 0xd6e2ef,
      map: this.tex.cryzenConcrete,
      roughnessMap: this.tex.wetAsphalt.roughnessMap,
      bumpMap: this.tex.wetAsphalt.bumpMap,
      bumpScale: 0.032,
      roughness: 0.62,
      metalness: 0.18,
      envMapIntensity: 1.45,
    });
    const matSnowCap = new THREE.MeshStandardMaterial({
      color: 0xf8fcff,
      bumpMap: this.tex.vikendiSnowPBR.bumpMap,
      bumpScale: 0.026,
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.88,
    });
    const matPineNeedle = new THREE.MeshStandardMaterial({
      color: 0x163d2d,
      roughness: 0.88,
      metalness: 0.02,
      envMapIntensity: 0.65,
    });
    const matPineDark = new THREE.MeshStandardMaterial({
      color: 0x102c22,
      roughness: 0.9,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    const matFirLush = new THREE.MeshStandardMaterial({
      color: 0x1f5437,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.68,
    });
    const matFrostCedar = new THREE.MeshStandardMaterial({
      color: 0x2b555c,
      roughness: 0.86,
      metalness: 0.03,
      envMapIntensity: 0.72,
    });
    const matWinterLarch = new THREE.MeshStandardMaterial({
      color: 0x56643a,
      roughness: 0.88,
      metalness: 0.02,
      envMapIntensity: 0.62,
    });
    const matBark = new THREE.MeshStandardMaterial({
      color: 0x3b2a1e,
      roughness: 0.92,
      metalness: 0.02,
    });
    const matRedCedarBark = new THREE.MeshStandardMaterial({
      color: 0x5f3a27,
      roughness: 0.9,
      metalness: 0.02,
    });
    const matBirchBark = new THREE.MeshStandardMaterial({
      color: 0xe4ebf2,
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.72,
    });
    const matBirchKnot = new THREE.MeshStandardMaterial({
      color: 0x252c36,
      roughness: 0.9,
      metalness: 0.04,
    });
    const matBoulder = new THREE.MeshStandardMaterial({
      color: 0x4b5c70,
      roughness: 0.88,
      metalness: 0.05,
      flatShading: true,
    });
    // 3 distinct textured alpine mountain materials (lush pine foothills, striated granite crags, glacial snow summits!)
    const matMtnPine = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.tex.mountainPineSlope.map,
      bumpMap: this.tex.mountainPineSlope.bump,
      bumpScale: 0.42,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
      envMapIntensity: 0.65,
    });
    const matMtnGranite = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.tex.mountainGraniteRock.map,
      bumpMap: this.tex.mountainGraniteRock.bump,
      bumpScale: 0.58,
      roughness: 0.86,
      metalness: 0.05,
      flatShading: true,
      envMapIntensity: 0.72,
    });
    const matMtnGlacial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.tex.mountainGlacialSnow.map,
      bumpMap: this.tex.mountainGlacialSnow.bump,
      bumpScale: 0.36,
      roughness: 0.8,
      metalness: 0.03,
      flatShading: true,
      envMapIntensity: 0.85,
    });
    // Radiant sunlit white-with-glacial-blue hero summit material for the centerpiece peak behind the North Silo!
    const matMtnBlueGlacier = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.tex.mountainGlacialSnow.map,
      bumpMap: this.tex.mountainGlacialSnow.bump,
      bumpScale: 0.42,
      emissive: new THREE.Color(0x1a5696),
      emissiveIntensity: 0.16,
      roughness: 0.68,
      metalness: 0.04,
      flatShading: true,
      envMapIntensity: 1.15,
    });
    const matTrimSlate = new THREE.MeshStandardMaterial({
      color: 0x5c7082,
      bumpMap: this.tex.industrialSteel.bumpMap,
      bumpScale: 0.024,
      roughness: 0.42,
      metalness: 0.58,
      envMapIntensity: 1.45,
    });
    const matCladdingTeal = new THREE.MeshStandardMaterial({
      color: 0x2094c8,
      roughnessMap: this.tex.corrugatedMetal.roughnessMap,
      bumpMap: this.tex.corrugatedMetal.bumpMap,
      bumpScale: 0.052,
      roughness: 0.4,
      metalness: 0.52,
      envMapIntensity: 1.65,
    });
    const matCladdingOchre = new THREE.MeshStandardMaterial({
      color: 0xe6882c,
      roughnessMap: this.tex.corrugatedMetal.roughnessMap,
      bumpMap: this.tex.corrugatedMetal.bumpMap,
      bumpScale: 0.052,
      roughness: 0.42,
      metalness: 0.46,
      envMapIntensity: 1.55,
    });
    const matSilo = new THREE.MeshStandardMaterial({
      color: 0x3f7082,
      map: this.tex.industrialSteel.map,
      roughnessMap: this.tex.industrialSteel.roughnessMap,
      bumpMap: this.tex.industrialSteel.bumpMap,
      bumpScale: 0.032,
      roughness: 0.38,
      metalness: 0.65,
      envMapIntensity: 1.65,
    });
    const matSiloYellow = new THREE.MeshStandardMaterial({
      color: 0xffd22e,
      emissive: new THREE.Color(0x5a3800),
      emissiveIntensity: 0.38,
      roughness: 0.42,
      metalness: 0.24,
    });
    const matSiloOrange = new THREE.MeshStandardMaterial({
      color: 0xff6224,
      emissive: new THREE.Color(0x4a1600),
      emissiveIntensity: 0.32,
      roughness: 0.44,
      metalness: 0.22,
    });
    const matDoorSteel = new THREE.MeshStandardMaterial({
      color: 0x4b6a7c,
      map: this.tex.industrialSteel.map,
      bumpMap: this.tex.industrialSteel.bumpMap,
      bumpScale: 0.025,
      roughness: 0.36,
      metalness: 0.68,
      envMapIntensity: 1.55,
    });
    const matDoorFrame = new THREE.MeshStandardMaterial({
      color: 0x242e38,
      roughness: 0.42,
      metalness: 0.68,
      envMapIntensity: 1.4,
    });
    const matContBlue = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.cryzenContainerBlue,
      bumpMap: this.tex.cryzenContainerBump,
      bumpScale: 0.062,
      roughness: 0.38,
      metalness: 0.54,
      envMapIntensity: 1.75,
    });
    const matContRed = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.cryzenContainerRed,
      bumpMap: this.tex.cryzenContainerBump,
      bumpScale: 0.062,
      roughness: 0.38,
      metalness: 0.54,
      envMapIntensity: 1.75,
    });
    const matContGreen = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.cryzenContainerGreen,
      bumpMap: this.tex.cryzenContainerBump,
      bumpScale: 0.062,
      roughness: 0.38,
      metalness: 0.54,
      envMapIntensity: 1.75,
    });
    const matWoodCrate = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.cryzenWoodCrate,
      bumpMap: this.tex.cryzenWoodCrateBump,
      bumpScale: 0.048,
      roughness: 0.62,
      metalness: 0.12,
      envMapIntensity: 1.15,
    });
    // Warm backlit glowing factory annex windows (casts vibrant golden HDR bloom!)
    const matWindowGlass = new THREE.MeshStandardMaterial({
      color: 0xffe4a8,
      emissive: new THREE.Color(0xff9628),
      emissiveIntensity: 1.85,
      roughness: 0.16,
      metalness: 0.25,
    });

    // Helper: Real architectural Vikendi brick wall with concrete plinth, steel I-beam ribs & snow coping!
    const addBrickWall = (x: number, z: number, w: number, h: number, d: number, minimap: MinimapRect['kind'] = 'wall') => {
      this.addBox(x, h / 2, z, w, h, d, matBrick, { minimap });
      // Dark concrete foundation plinth along base
      this.addBox(x, 0.22, z, w + 0.14, 0.44, d + 0.14, matDoorFrame, { collide: false, raycast: false, castShadow: false });
      // Chamfered steel coping & crisp snow ledge on top
      this.addBox(x, h + 0.14, z, w + 0.28, 0.28, d + 0.28, matTrimSlate, { collide: false, raycast: false });
      this.addBox(x, h + 0.32, z, w + 0.18, 0.14, d + 0.18, matSnowCap, {
        collide: false,
        raycast: false,
        castShadow: false,
      });
    };

    // Helper: Detailed industrial steel door with concrete rain-hood awning & glowing cage lamp!
    const addMetalDoor = (x: number, z: number, rotY: number) => {
      const door = new THREE.Group();
      door.position.set(x, 0, z);
      door.rotation.y = rotY;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.72, 2.62, 0.22), matDoorFrame);
      frame.position.y = 1.31;
      frame.userData.isLevel = true;
      door.add(frame);
      this.raycastMeshes.push(frame);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.42, 0.26), matDoorSteel);
      panel.position.y = 1.22;
      panel.userData.isLevel = true;
      door.add(panel);
      this.raycastMeshes.push(panel);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.09, 0.3), matDoorFrame);
      bar.position.y = 1.18;
      door.add(bar);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.32), matSiloYellow);
      handle.position.set(0.52, 1.08, 0);
      door.add(handle);
      // Overhead steel rain-hood canopy + glowing cyan industrial bulkhead lamp
      const hood = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.14, 0.72), matDoorFrame);
      hood.position.set(0, 2.74, 0.28);
      hood.rotation.x = 0.12;
      door.add(hood);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.18), this.matEmissiveCyan);
      lamp.position.set(0, 2.64, 0.32);
      door.add(lamp);
      this.group.add(door);
    };

    // Warm Alpine chalet materials (natural cedar timber, crisp cream window trim, slate & terracotta alpine roofs!)
    const matTimberWarm = new THREE.MeshStandardMaterial({
      color: 0x5c361e,
      roughness: 0.74,
      metalness: 0.04,
      envMapIntensity: 0.7,
    });
    const matTrimCream = new THREE.MeshStandardMaterial({
      color: 0xf4f0e8,
      roughness: 0.62,
      metalness: 0.04,
      envMapIntensity: 0.85,
    });
    const matRoofSlate = new THREE.MeshStandardMaterial({
      color: 0x2c3e52,
      roughness: 0.7,
      metalness: 0.14,
      envMapIntensity: 0.9,
    });
    const matRoofTerracotta = new THREE.MeshStandardMaterial({
      color: 0x8c3a2b,
      roughness: 0.72,
      metalness: 0.08,
      envMapIntensity: 0.85,
    });
    const matPlasterBlue = new THREE.MeshStandardMaterial({
      color: 0x3b84be,
      roughness: 0.78,
      metalness: 0.04,
      envMapIntensity: 0.75,
    });
    const matPlasterOchre = new THREE.MeshStandardMaterial({
      color: 0xe39638,
      roughness: 0.78,
      metalness: 0.04,
      envMapIntensity: 0.75,
    });

    // Helper: Cozy European Alpine chalet window (cream wood frame, warm glowing glass, wooden shutters & snow-dusted sill!)
    const addFramedWindow = (x: number, y: number, z: number, w = 1.55, h = 1.95, withShutters = true) => {
      // Crisp cream-white wooden window casing
      this.addBox(x, y, z + 0.02, w + 0.24, h + 0.24, 0.14, matTrimCream, { collide: false, raycast: false, castShadow: false });
      // Warm backlit amber interior glass
      this.addBox(x, y, z + 0.07, w, h, 0.08, matWindowGlass, { collide: false, raycast: false, castShadow: false });
      // Slender cream-white wooden sash dividers (not dark prison bars!)
      this.addBox(x, y + h * 0.05, z + 0.12, w + 0.02, 0.07, 0.05, matTrimCream, { collide: false, raycast: false, castShadow: false });
      this.addBox(x, y, z + 0.12, 0.07, h + 0.02, 0.05, matTrimCream, { collide: false, raycast: false, castShadow: false });
      // Warm wooden alpine shutters flanking left & right
      if (withShutters) {
        const shW = 0.42;
        for (const sx of [-1, 1]) {
          this.addBox(x + sx * (w * 0.5 + shW * 0.5 + 0.14), y, z + 0.07, shW, h + 0.14, 0.08, matTimberWarm, {
            collide: false,
            raycast: false,
            castShadow: false,
          });
        }
      }
      // Rustic timber windowsill topped with fresh white snow cushion
      this.addBox(x, y - h / 2 - 0.14, z + 0.15, w + 0.44, 0.14, 0.34, matTimberWarm, { collide: false, raycast: false, castShadow: false });
      this.addBox(x, y - h / 2 - 0.04, z + 0.19, w + 0.36, 0.08, 0.24, matSnowCap, { collide: false, raycast: false, castShadow: false });
    };

    // 3. Full BGMI Vikendi Snow Courtyard Floor + Endless Alpine Snowfields + Sculpted 3D Snowbanks!
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 38), matSnow);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -1);
    floor.receiveShadow = true;
    floor.userData.isLevel = true;
    this.group.add(floor);
    this.raycastMeshes.push(floor);

    // Expansive surrounding Vikendi snow terrain outside perimeter walls reaching out to the alpine peaks!
    const outerSnow = new THREE.Mesh(new THREE.PlaneGeometry(270, 270), matOuterSnow);
    outerSnow.rotation.x = -Math.PI / 2;
    outerSnow.position.set(0, -0.06, -1);
    outerSnow.receiveShadow = true;
    this.group.add(outerSnow);

    // Only a compact snow-dusted doorstep pad at North Depot Door & 2 recessed snow-edged iron grates
    // so ~96% of the Vikendi compound is pure sparkling snow like BGMI Vikendi!
    this.addBox(0, 0.012, -16.65, 3.2, 0.024, 1.65, matFactoryConcrete, { collide: false, castShadow: false });
    for (const gz of [-6.5, 5.2]) {
      this.addBox(0, 0.016, gz, 1.35, 0.018, 0.65, this.matGrate, { collide: false, castShadow: false });
    }

    // Sculpted 3D BGMI Vikendi snowbanks & drifts banked organically along walls, dividers & containers!
    const snowDriftGeo = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const addSnowDrift = (x: number, z: number, rx: number, ry: number, rz: number, rotY = 0) => {
      const m = new THREE.Mesh(snowDriftGeo, matSnowDrift);
      m.position.set(x, -0.02, z);
      m.scale.set(rx, ry, rz);
      m.rotation.y = rotY;
      m.receiveShadow = true;
      this.group.add(m);
    };

    // Drifts piled naturally against outer courtyard brick walls
    addSnowDrift(-13.1, 15.15, 2.8, 0.44, 1.05, 0.06);
    addSnowDrift(-5.8, 15.25, 2.4, 0.34, 0.9, -0.05);
    addSnowDrift(5.9, 15.25, 2.5, 0.36, 0.92, 0.04);
    addSnowDrift(13.1, 15.15, 2.9, 0.46, 1.08, -0.06);
    addSnowDrift(-12.8, -17.15, 3.1, 0.48, 1.05, -0.05);
    addSnowDrift(-6.8, -17.25, 2.3, 0.36, 0.88, 0.07);
    addSnowDrift(6.9, -17.25, 2.4, 0.38, 0.9, -0.05);
    addSnowDrift(12.9, -17.15, 3.0, 0.46, 1.05, 0.04);
    addSnowDrift(-15.2, -12.4, 0.98, 0.42, 3.2, 0.04);
    addSnowDrift(-15.2, -1.2, 0.94, 0.36, 2.8, -0.05);
    addSnowDrift(-15.2, 8.2, 0.98, 0.4, 2.6, 0.03);
    addSnowDrift(15.2, -12.8, 0.98, 0.42, 3.1, -0.04);
    addSnowDrift(15.2, 1.8, 0.95, 0.38, 2.9, 0.05);
    addSnowDrift(15.2, 9.6, 0.98, 0.42, 2.7, -0.04);

    // Drifts tucked snugly against interior brick dividers & shipping container flanks
    addSnowDrift(-11.8, 8.25, 2.4, 0.34, 0.85, 0.05);
    addSnowDrift(11.8, 8.25, 2.4, 0.34, 0.85, -0.05);
    addSnowDrift(-7.88, 3.4, 0.78, 0.32, 1.85, 0.04);
    addSnowDrift(7.88, 3.4, 0.78, 0.32, 1.85, -0.04);
    addSnowDrift(-7.88, -9.6, 0.82, 0.35, 2.1, -0.03);
    addSnowDrift(7.88, -9.6, 0.82, 0.35, 2.1, 0.03);
    addSnowDrift(-5.32, -1.4, 0.88, 0.32, 2.1, 0.08);
    addSnowDrift(-2.62, 1.35, 0.82, 0.28, 1.25, -0.2);
    addSnowDrift(5.6, -3.6, 0.88, 0.32, 2.1, -0.08);
    addSnowDrift(2.92, -6.1, 0.82, 0.28, 1.25, 0.18);
    addSnowDrift(-10.85, -3.9, 0.82, 0.3, 1.9, 0.05);
    addSnowDrift(10.95, -3.5, 0.82, 0.3, 1.9, -0.05);
    addSnowDrift(-4.9, -12.3, 1.95, 0.32, 0.82, 0.04);
    addSnowDrift(4.9, -12.3, 1.95, 0.32, 0.82, -0.04);

    // 4. Outer Perimeter Brick Walls with Heavy Steel I-Beam Columns & External Pipes
    addBrickWall(0, 16.0, 32.8, 4.8, 0.85);
    addBrickWall(0, -18.0, 32.8, 5.1, 0.85);
    addBrickWall(-16.0, -1.0, 0.85, 4.8, 34.8);
    addBrickWall(16.0, -1.0, 0.85, 4.8, 34.8);

    // Structural dark-steel I-beam columns + brick pilasters framing every courtyard wall bay (solid colliders & bullet-proof!)
    for (const px of [-10, -4, 4, 10]) {
      this.addBox(px, 2.55, -17.36, 0.72, 5.1, 0.48, matDoorFrame, { collide: true, raycast: true, castShadow: false });
      this.addBox(px, 0.55, -17.1, 0.78, 0.24, 0.16, this.matHazard, { collide: false, raycast: false, castShadow: false });
      this.addBox(px, 2.45, 15.36, 0.72, 4.9, 0.48, matDoorFrame, { collide: true, raycast: true, castShadow: false });
    }
    for (const pz of [-11, -3, 5, 11]) {
      this.addBox(-15.36, 2.45, pz, 0.48, 4.9, 0.72, matDoorFrame, { collide: true, raycast: true, castShadow: false });
      this.addBox(15.36, 2.45, pz, 0.48, 4.9, 0.72, matDoorFrame, { collide: true, raycast: true, castShadow: false });
    }

    // Horizontal external copper & dark-steel factory pipes along courtyard brick walls!
    for (const py of [3.7, 4.05]) {
      const pipeN = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 30.5, 10), py > 3.9 ? this.matPipeCopper : this.matPipeDark);
      pipeN.rotation.z = Math.PI / 2;
      pipeN.position.set(0, py, -17.45);
      this.group.add(pipeN);
    }

    // Illuminated VIKENDI DEPOT hero sign centered above the North Factory Door!
    const factorySignMat = new THREE.MeshStandardMaterial({
      map: this.tex.signFactory,
      emissiveMap: this.tex.signFactory,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.92,
      roughness: 0.38,
    });
    const factorySign = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.15, 0.18), factorySignMat);
    factorySign.position.set(0, 4.05, -17.46);
    this.group.add(factorySign);

    // Recessed industrial steel doors embedded in courtyard walls
    addMetalDoor(0, -17.52, 0);
    addMetalDoor(-15.52, 11.2, Math.PI / 2);
    addMetalDoor(15.52, -7.2, -Math.PI / 2);

    // 5. Crisp Symmetrical Hero North Skyline (Centered Silo Tower + Flush Teal & Ochre Halls + Proper Flanged Pipe Bridges!)
    const siloGroup = new THREE.Group();
    siloGroup.position.set(0.0, 0, -22.2);
    // Uniform precision cylinder (radius 4.1 -> spans x in [-4.1, +4.1], zero taper mismatch!)
    const siloCyl = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 14.4, 32), matSilo);
    siloCyl.position.y = 7.2;
    siloGroup.add(siloCyl);
    // Flush golden-yellow + bright orange industrial safety rings wrapping cleanly around cylinder
    const siloStripeY = new THREE.Mesh(new THREE.CylinderGeometry(4.125, 4.125, 0.9, 32), matSiloYellow);
    siloStripeY.position.y = 10.6;
    siloGroup.add(siloStripeY);
    const siloStripeO = new THREE.Mesh(new THREE.CylinderGeometry(4.125, 4.125, 0.55, 32), matSiloOrange);
    siloStripeO.position.y = 9.65;
    siloGroup.add(siloStripeO);
    for (const by of [6.2, 8.2, 12.4, 14.25]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(4.19, 4.19, 0.24, 32), matDoorFrame);
      band.position.y = by;
      siloGroup.add(band);
    }
    // Crisp welded roof cornice, conical steel dome roof, snow blanket & centered red aviation beacon
    const siloCornice = new THREE.Mesh(new THREE.CylinderGeometry(4.32, 4.22, 0.24, 32), matDoorFrame);
    siloCornice.position.y = 14.42;
    siloGroup.add(siloCornice);
    const siloCap = new THREE.Mesh(new THREE.ConeGeometry(4.35, 2.0, 32), matTrimSlate);
    siloCap.position.y = 15.52;
    siloGroup.add(siloCap);
    const siloSnowCap = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.88, 32), matSnowCap);
    siloSnowCap.position.y = 15.66;
    siloGroup.add(siloSnowCap);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), this.matEmissiveCrimson);
    beacon.position.y = 16.72;
    siloGroup.add(beacon);
    this.group.add(siloGroup);

    // Helper: Authentic BGMI Vikendi European Alpine Lodge / Chalet (pitched snow-laden roof, cozy timber trim,
    // cream-framed glowing windows with shutters, front dormer & brick chimney — ZERO boxy jail bars!)
    const buildVikendiAlpineChalet = (opts: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      brickH: number;
      upperH: number;
      upperMat: THREE.Material;
      roofMat: THREE.Material;
      withBalcony: boolean;
      chimneySide: -1 | 1;
    }) => {
      const { cx, cz, w, d, brickH, upperH, upperMat, roofMat, withBalcony, chimneySide } = opts;
      const eaveY = brickH + upperH;
      const frontZ = cz + d * 0.5;

      // 1. Exact flush lower brick story + upper colourful Alpine stucco story (100% same width & depth -> zero bleed!)
      this.addBox(cx, brickH * 0.5, cz, w, brickH, d, matBrick, { collide: false, raycast: false, castShadow: false });
      this.addBox(cx, brickH + upperH * 0.5, cz, w, upperH, d, upperMat, { collide: false, raycast: false, castShadow: false });

      // Warm cedar timber story belt & clean corner wood quoins (cozy alpine framing instead of prison bars!)
      this.addBox(cx, brickH, cz, w + 0.18, 0.24, d + 0.18, matTimberWarm, { collide: false, raycast: false, castShadow: false });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          this.addBox(cx + sx * (w * 0.5 - 0.06), eaveY * 0.5, cz + sz * (d * 0.5 - 0.06), 0.24, eaveY, 0.24, matTimberWarm, {
            collide: false,
            raycast: false,
            castShadow: false,
          });
        }
      }

      // 2. Three evenly spaced warm glowing Alpine windows with cream frames, shutters & snow sills
      const winY = brickH + upperH * 0.5;
      const winSpread = w * 0.31;
      for (const wx of [cx - winSpread, cx, cx + winSpread]) {
        addFramedWindow(wx, winY, frontZ, 1.48, 1.85, true);
      }

      // Optional warm cedar chalet balcony deck with cozy timber railing (NO iron prison cage!)
      if (withBalcony) {
        const balY = brickH - 0.1;
        const balD = 1.15;
        const balZ = frontZ + balD * 0.5;
        const balW = w - 0.6;
        this.addBox(cx, balY, balZ, balW, 0.18, balD, matTimberWarm, { collide: false, raycast: false, castShadow: false });
        // Cozy timber balcony handrail & lower slat
        this.addBox(cx, balY + 0.96, frontZ + balD - 0.08, balW, 0.12, 0.12, matTimberWarm, { collide: false, raycast: false, castShadow: false });
        this.addBox(cx, balY + 0.52, frontZ + balD - 0.08, balW, 0.22, 0.06, matTimberWarm, { collide: false, raycast: false, castShadow: false });
        this.addBox(cx, balY + 1.05, frontZ + balD - 0.08, balW - 0.1, 0.07, 0.14, matSnowCap, { collide: false, raycast: false, castShadow: false });
        for (let px = -balW * 0.48; px <= balW * 0.49; px += balW / 5) {
          this.addBox(cx + px, balY + 0.5, frontZ + balD - 0.08, 0.1, 0.96, 0.1, matTimberWarm, { collide: false, raycast: false, castShadow: false });
        }
      }

      // 3. Steep Pitched Snow-Laden Alpine Gable Roof (37° pitch + thick snow slopes + matching side gable triangles!)
      const overhangZ = 0.6;
      const overhangX = 0.55;
      const halfD = d * 0.5 + overhangZ;
      const ridgeH = 2.75;
      const pitch = Math.atan2(ridgeH, halfD);
      const slopeLen = Math.hypot(halfD, ridgeH) + 0.16;
      const roofW = w + overhangX * 2;
      const roofThick = 0.24;
      const snowThick = 0.18;

      // Exact triangular side-gable infill walls tucked flush under roof slopes
      const gableH = ridgeH * ((d * 0.5) / halfD);
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-d * 0.5, 0);
      gableShape.lineTo(d * 0.5, 0);
      gableShape.lineTo(0, gableH);
      gableShape.closePath();
      const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: w, bevelEnabled: false });
      gableGeo.rotateY(Math.PI / 2); // Shape XY (Z-span, Y-height) extrudes along +X
      gableGeo.translate(cx - w * 0.5, eaveY, cz);
      this.group.add(new THREE.Mesh(gableGeo, upperMat));

      // Front (+Z) & Back (-Z) pitched roof planes + thick fresh white snow blankets sitting flush on top!
      for (const sz of [-1, 1]) {
        const slope = new THREE.Mesh(new THREE.BoxGeometry(roofW, roofThick, slopeLen), roofMat);
        const cy = eaveY + ridgeH * 0.5;
        const czOff = cz + sz * (halfD * 0.5);
        slope.position.set(cx, cy, czOff);
        slope.rotation.x = sz * pitch;
        this.group.add(slope);

        // Snow blanket offset cleanly along the roof surface normal (0, cos(pitch), sz * sin(pitch))
        const off = roofThick * 0.5 + snowThick * 0.45;
        const snow = new THREE.Mesh(new THREE.BoxGeometry(roofW - 0.12, snowThick, slopeLen - 0.08), matSnowCap);
        snow.position.set(cx, cy + Math.cos(pitch) * off, czOff + sz * Math.sin(pitch) * off);
        snow.rotation.x = sz * pitch;
        this.group.add(snow);
      }
      // Crisp horizontal ridge beam & snow crest sealing the apex cleanly
      this.addBox(cx, eaveY + ridgeH + 0.14, cz, roofW + 0.06, 0.24, 0.34, matTimberWarm, { collide: false, raycast: false, castShadow: false });
      this.addBox(cx, eaveY + ridgeH + 0.3, cz, roofW - 0.08, 0.14, 0.28, matSnowCap, { collide: false, raycast: false, castShadow: false });

      // 4. Charming Front Alpine Gable Dormer Window rising smoothly out of the pitched roof!
      const dormW = 3.0;
      const dormH = 1.65;
      const dormZ = cz + d * 0.22;
      const dormY = eaveY + 1.05;
      this.addBox(cx, dormY, dormZ, dormW, dormH, 2.2, upperMat, { collide: false, raycast: false, castShadow: false });
      addFramedWindow(cx, dormY + 0.05, dormZ + 1.1, 1.05, 1.12, false);
      // Dormer triangular front gable infill so zero gap shows under dormer eaves!
      const dGableShape = new THREE.Shape();
      dGableShape.moveTo(-dormW * 0.5, 0);
      dGableShape.lineTo(dormW * 0.5, 0);
      dGableShape.lineTo(0, 1.08);
      dGableShape.closePath();
      const dGableGeo = new THREE.ExtrudeGeometry(dGableShape, { depth: 2.2, bevelEnabled: false });
      dGableGeo.translate(cx, dormY + dormH * 0.5, dormZ - 1.1);
      this.group.add(new THREE.Mesh(dGableGeo, upperMat));

      // Dormer pitched roof + snow cap
      const dPitch = 0.62;
      for (const sx of [-1, 1]) {
        const dRoof = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.16, 2.6), roofMat);
        dRoof.position.set(cx + sx * 0.85, dormY + dormH * 0.5 + 0.55, dormZ + 0.1);
        dRoof.rotation.z = -sx * dPitch;
        this.group.add(dRoof);

        const dSnow = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.12, 2.52), matSnowCap);
        dSnow.position.set(
          cx + sx * (0.85 + Math.sin(dPitch) * 0.12),
          dormY + dormH * 0.5 + 0.55 + Math.cos(dPitch) * 0.12,
          dormZ + 0.1
        );
        dSnow.rotation.z = -sx * dPitch;
        this.group.add(dSnow);
      }

      // 5. Cozy brick chimney rising cleanly through the snow roof with stone cap & snow pillow!
      const chX = cx + chimneySide * (w * 0.32);
      const chZ = cz - 0.8;
      this.addBox(chX, eaveY + ridgeH + 0.45, chZ, 1.05, 2.8, 1.05, matBrick, { collide: false, raycast: false, castShadow: false });
      this.addBox(chX, eaveY + ridgeH + 1.9, chZ, 1.24, 0.2, 1.24, matTrimCream, { collide: false, raycast: false, castShadow: false });
      this.addBox(chX, eaveY + ridgeH + 2.04, chZ, 1.12, 0.12, 1.12, matSnowCap, { collide: false, raycast: false, castShadow: false });
    };

    // RIGHT ALPINE LODGE (Warm Golden-Ochre Plaster + Terracotta Pitched Snow Roof + Warm Cedar Balcony!)
    buildVikendiAlpineChalet({
      cx: 11.0,
      cz: -22.2,
      w: 10.6,
      d: 5.8,
      brickH: 8.2,
      upperH: 4.0,
      upperMat: matPlasterOchre,
      roofMat: matRoofTerracotta,
      withBalcony: true,
      chimneySide: 1,
    });

    // LEFT ALPINE LODGE (Nordic Sky-Blue Plaster + Blue-Slate Pitched Snow Roof + Front Gable Dormer!)
    buildVikendiAlpineChalet({
      cx: -11.0,
      cz: -22.2,
      w: 10.6,
      d: 5.8,
      brickH: 7.4,
      upperH: 3.9,
      upperMat: matPlasterBlue,
      roofMat: matRoofSlate,
      withBalcony: false,
      chimneySide: -1,
    });

    // Overhead Courtyard Steel Portal Truss anchored solidly on twin ground-to-truss steel I-beam support towers!
    for (const sx of [-7.45, 7.45]) {
      // Full-height steel support tower bolted from floor (y=0) through the wing wall all the way up to the truss (solid!)
      this.addBox(sx, 3.6, 7.6, 0.56, 7.2, 0.62, matDoorFrame, { collide: true, raycast: true });
      this.addBox(sx, 0.45, 7.6, 0.72, 0.55, 0.78, matTrimSlate, { collide: true, raycast: true, castShadow: false });
      this.addBox(sx, 7.22, 7.6, 0.72, 0.24, 0.76, matTrimSlate, { collide: false, raycast: false, castShadow: false });
      // Angled structural gusset knee-brace connecting each tower into the overhead truss
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.65, 0.22), matTrimSlate);
      brace.position.set(sx < 0 ? sx + 0.68 : sx - 0.68, 5.58, 7.6);
      brace.rotation.z = sx < 0 ? -0.78 : 0.78;
      this.group.add(brace);
    }
    this.addBox(0, 6.15, 7.6, 15.5, 0.34, 0.42, matDoorFrame, { collide: false, raycast: false, castShadow: false });
    this.addBox(0, 6.95, 7.6, 15.5, 0.26, 0.34, matDoorFrame, { collide: false, raycast: false, castShadow: false });
    for (let tx = -6.5; tx <= 6.5; tx += 2.6) {
      const diag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.14), matTrimSlate);
      diag.position.set(tx, 6.55, 7.6);
      diag.rotation.z = tx % 5.2 === 0 ? 0.65 : -0.65;
      this.group.add(diag);
    }
    const vCables: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [new THREE.Vector3(-8.5, 4.4, 5.0), new THREE.Vector3(-15.5, 4.4, -3.0), 0.7],
      [new THREE.Vector3(8.5, 4.4, 5.0), new THREE.Vector3(15.5, 4.4, -3.0), 0.7],
      [new THREE.Vector3(-8.5, 4.4, -7.2), new THREE.Vector3(-4.0, 4.9, -17.36), 0.85],
      [new THREE.Vector3(8.5, 4.4, -7.2), new THREE.Vector3(4.0, 4.9, -17.36), 0.85],
    ];
    for (const [s, e, sag] of vCables) {
      const m1 = new THREE.Vector3().lerpVectors(s, e, 0.35);
      m1.y -= sag;
      const m2 = new THREE.Vector3().lerpVectors(s, e, 0.65);
      m2.y -= sag;
      const curve = new THREE.CatmullRomCurve3([s, m1, m2, e]);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.032, 6, false), this.matCable));
    }

    // 6. Clean 3-Lane Brick Interior Dividers (Wide Sightlines & Flanks!)
    // South spawn wing walls (leaves huge 14.2m wide center entrance!)
    addBrickWall(-11.5, 7.6, 8.8, 4.4, 0.8);
    addBrickWall(11.5, 7.6, 8.8, 4.4, 0.8);

    // West Alley / Mid Divider (open mid-west breach & north-west breach)
    addBrickWall(-8.5, 3.0, 0.8, 4.3, 4.4);
    addBrickWall(-8.5, -9.6, 0.8, 4.3, 5.2);

    // East Dock / Mid Divider (open mid-east breach & north-east breach)
    addBrickWall(8.5, 3.0, 0.8, 4.3, 4.4);
    addBrickWall(8.5, -9.6, 0.8, 4.3, 5.2);

    // 7. Signature Cryzen Colorful Shipping Containers & Wooden Crates!
    // Center Courtyard Staggered Containers (Blue left, Red right -> crisp center sniper/AKM lane!)
    this.addBox(-3.9, 1.35, -1.2, 2.45, 2.7, 5.4, matContBlue, { minimap: 'crate' });
    this.addBox(-3.9, 2.76, -1.2, 2.48, 0.12, 5.42, matSnowCap, { collide: false, raycast: false, castShadow: false });

    this.addBox(4.2, 1.35, -3.5, 2.45, 2.7, 5.4, matContRed, { minimap: 'crate' });
    this.addBox(4.2, 2.76, -3.5, 2.48, 0.12, 5.42, matSnowCap, { collide: false, raycast: false, castShadow: false });

    // West Snow Alley Green Shipping Container
    this.addBox(-12.2, 1.35, -3.8, 2.4, 2.7, 5.2, matContGreen, { minimap: 'crate' });
    this.addBox(-12.2, 2.76, -3.8, 2.42, 0.12, 5.22, matSnowCap, { collide: false, raycast: false, castShadow: false });

    // East Loading Dock Blue Shipping Container
    this.addBox(12.3, 1.35, -3.4, 2.4, 2.7, 5.2, matContBlue, { minimap: 'crate' });
    this.addBox(12.3, 2.76, -3.4, 2.42, 0.12, 5.22, matSnowCap, { collide: false, raycast: false, castShadow: false });

    // North Silo Court Defensive Containers (Red left, Green right)
    this.addBox(-4.8, 1.35, -13.6, 4.6, 2.7, 2.3, matContRed, { minimap: 'crate' });
    this.addBox(-4.8, 2.76, -13.6, 4.62, 0.12, 2.32, matSnowCap, { collide: false, raycast: false, castShadow: false });

    this.addBox(4.8, 1.35, -13.6, 4.6, 2.7, 2.3, matContGreen, { minimap: 'crate' });
    this.addBox(4.8, 2.76, -13.6, 4.62, 0.12, 2.32, matSnowCap, { collide: false, raycast: false, castShadow: false });

    // Tactical Wooden Crate Cover Stacks with crisp snow dusting on top!
    this.addBox(1.85, 0.56, 2.6, 1.25, 1.12, 1.25, matWoodCrate, { minimap: 'crate' });
    this.addBox(1.85, 1.155, 2.6, 1.22, 0.07, 1.22, matSnowCap, { collide: false, raycast: false, castShadow: false });
    this.addBox(-2.0, 0.56, -6.9, 1.25, 1.12, 1.25, matWoodCrate, { minimap: 'crate' });
    this.addBox(-2.0, 1.155, -6.9, 1.22, 0.07, 1.22, matSnowCap, { collide: false, raycast: false, castShadow: false });
    this.addBox(-5.8, 0.65, 5.3, 1.35, 1.3, 1.35, matWoodCrate, { minimap: 'crate' });
    this.addBox(-5.8, 1.72, 5.3, 0.92, 0.85, 0.92, matWoodCrate, { minimap: 'crate' });
    this.addBox(-5.8, 2.18, 5.3, 0.89, 0.07, 0.89, matSnowCap, { collide: false, raycast: false, castShadow: false });
    this.addBox(5.9, 0.65, 5.3, 1.35, 1.3, 1.35, matWoodCrate, { minimap: 'crate' });
    this.addBox(5.9, 1.335, 5.3, 1.31, 0.07, 1.31, matSnowCap, { collide: false, raycast: false, castShadow: false });
    this.addBox(0.0, 0.58, -14.5, 2.4, 1.16, 1.15, matFactoryConcrete, { minimap: 'crate' });
    this.addBox(0.0, 1.195, -14.5, 2.36, 0.07, 1.12, matSnowCap, { collide: false, raycast: false, castShadow: false });
    this.addBox(-13.8, 0.62, 4.4, 1.25, 1.24, 1.25, matWoodCrate, { minimap: 'crate' });
    this.addBox(-13.8, 1.275, 4.4, 1.22, 0.07, 1.22, matSnowCap, { collide: false, raycast: false, castShadow: false });
    this.addBox(13.8, 0.62, 4.4, 1.25, 1.24, 1.25, matWoodCrate, { minimap: 'crate' });
    this.addBox(13.8, 1.275, 4.4, 1.22, 0.07, 1.22, matSnowCap, { collide: false, raycast: false, castShadow: false });

    // 7b. Organic Randomized Vikendi Winter Forest (5 Distinct Species + Alpine Boulders) & Sculpted Mountain Range!
    const rand = () => Math.random();
    const randRange = (min: number, max: number) => min + rand() * (max - min);

    const sharedCanopyPuff = new THREE.DodecahedronGeometry(1, 1);
    const sharedBoulderGeo = new THREE.DodecahedronGeometry(1, 1);

    // Exact vector-aligned branch cylinder helper (guarantees flush trunk->limb->twig connections, zero gaps!)
    const upAxis = new THREE.Vector3(0, 1, 0);
    const addBranchSegment = (
      parent: THREE.Group,
      start: THREE.Vector3,
      end: THREE.Vector3,
      rBottom: number,
      rTop: number,
      mat: THREE.Material,
      segs = 6
    ) => {
      const delta = new THREE.Vector3().subVectors(end, start);
      const len = delta.length();
      if (len < 0.01) return;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, segs), mat);
      mesh.position.copy(start).addScaledVector(delta, 0.5);
      mesh.quaternion.setFromUnitVectors(upAxis, delta.normalize());
      parent.add(mesh);
    };

    // Species 1: Tall Slender Alpine Spruce (strictly upright 5-6 tier snowy spire)
    const addAlpineSpruce = (x: number, z: number, scale: number) => {
      const g = new THREE.Group();
      g.position.set(x, -0.06, z);
      g.rotation.y = rand() * Math.PI * 2;
      const xzScale = scale * randRange(0.86, 1.04);
      const yScale = scale * randRange(1.06, 1.38);
      g.scale.set(xzScale, yScale, xzScale);

      const tiers = rand() > 0.45 ? 6 : 5;
      const trunkH = 2.4 + (tiers - 1) * 1.3;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.28, trunkH, 7), matBark);
      trunk.position.y = trunkH * 0.5;
      g.add(trunk);

      for (let t = 0; t < tiers; t++) {
        const frac = t / (tiers - 1);
        const r = THREE.MathUtils.lerp(1.72, 0.48, frac) * randRange(0.94, 1.06);
        const h = THREE.MathUtils.lerp(2.65, 1.85, frac);
        const y = 2.55 + t * 1.36;
        const rot = t * 0.62;
        const matN = t % 2 === 0 ? matPineNeedle : matPineDark;

        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), matN);
        cone.position.set(0, y, 0);
        cone.rotation.y = rot;
        g.add(cone);

        if (t >= 1 || rand() > 0.25) {
          const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.94, h * 0.62, 8), matSnowCap);
          snow.position.set(0, y + h * 0.21, 0);
          snow.rotation.y = rot;
          g.add(snow);
        }
      }
      this.group.add(g);
    };

    // Species 2: Broad Shaggy Siberian Fir (strictly upright wide evergreen skirts with crisp snow blankets)
    const addSiberianFir = (x: number, z: number, scale: number) => {
      const g = new THREE.Group();
      g.position.set(x, -0.06, z);
      g.rotation.y = rand() * Math.PI * 2;
      const xzScale = scale * randRange(1.06, 1.28);
      const yScale = scale * randRange(0.94, 1.16);
      g.scale.set(xzScale, yScale, xzScale);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.4, 6.2, 8), matBark);
      trunk.position.y = 3.1;
      g.add(trunk);

      const tierRadii = [2.7, 2.15, 1.54, 0.92];
      const tierY = [2.4, 4.05, 5.6, 6.9];
      for (let t = 0; t < tierRadii.length; t++) {
        const r = tierRadii[t] * randRange(0.95, 1.06);
        const h = 2.65 - t * 0.28;
        const rot = t * 0.48;
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), t % 2 === 0 ? matFirLush : matPineNeedle);
        foliage.position.set(0, tierY[t], 0);
        foliage.rotation.y = rot;
        g.add(foliage);

        const snowPatch = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, h * 0.54, 9), matSnowCap);
        snowPatch.position.set(0, tierY[t] + h * 0.24, 0);
        snowPatch.rotation.y = rot;
        g.add(snowPatch);
      }
      this.group.add(g);
    };

    // Species 3: Upright Scots Pine (straight tall reddish-cedar trunk + flush forked upper boughs + snow cushions!)
    const addScotsPine = (x: number, z: number, scale: number) => {
      const g = new THREE.Group();
      g.position.set(x, -0.06, z);
      g.rotation.y = rand() * Math.PI * 2;
      g.scale.setScalar(scale * randRange(0.96, 1.24));

      const trunkH = randRange(4.4, 5.6);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, trunkH, 8), matRedCedarBark);
      trunk.position.y = trunkH * 0.5;
      g.add(trunk);

      // Crown top canopy centered directly over the upright trunk
      const crownR = randRange(1.85, 2.35);
      const crownY = trunkH + 0.65;
      addBranchSegment(
        g,
        new THREE.Vector3(0, trunkH - 0.15, 0),
        new THREE.Vector3(0, crownY, 0),
        0.16,
        0.11,
        matRedCedarBark
      );
      const crownTuft = new THREE.Mesh(sharedCanopyPuff, matFirLush);
      crownTuft.position.set(0, crownY + 0.15, 0);
      crownTuft.scale.set(crownR, crownR * 0.48, crownR);
      g.add(crownTuft);
      const crownSnow = new THREE.Mesh(sharedCanopyPuff, matSnowCap);
      crownSnow.position.set(0, crownY + crownR * 0.34, 0);
      crownSnow.scale.set(crownR * 0.92, crownR * 0.26, crownR * 0.92);
      g.add(crownSnow);

      // 3 balanced radiating upper boughs flush-joined into the upright trunk
      const limbCount = 3;
      for (let b = 0; b < limbCount; b++) {
        const ang = (b / limbCount) * Math.PI * 2 + randRange(-0.22, 0.22);
        const spread = randRange(1.25, 1.75);
        const startY = trunkH * randRange(0.7, 0.88);
        const start = new THREE.Vector3(0, startY, 0);
        const end = new THREE.Vector3(Math.cos(ang) * spread, startY + randRange(1.0, 1.45), Math.sin(ang) * spread);

        addBranchSegment(g, start, end, 0.13, 0.08, matRedCedarBark);

        const puffR = randRange(1.25, 1.68);
        const tuft = new THREE.Mesh(sharedCanopyPuff, b % 2 === 0 ? matPineNeedle : matFirLush);
        tuft.position.set(end.x, end.y + 0.12, end.z);
        tuft.scale.set(puffR, puffR * 0.48, puffR);
        g.add(tuft);

        const snowCap = new THREE.Mesh(sharedCanopyPuff, matSnowCap);
        snowCap.position.set(end.x, end.y + puffR * 0.32, end.z);
        snowCap.scale.set(puffR * 0.9, puffR * 0.25, puffR * 0.9);
        g.add(snowCap);
      }
      this.group.add(g);
    };

    // Species 4: Frost-Tipped Blue Cedar / Golden Winter Larch (strictly upright blue-sage & winter-olive evergreen!)
    const addFrostCedar = (x: number, z: number, scale: number) => {
      const g = new THREE.Group();
      g.position.set(x, -0.06, z);
      g.rotation.y = rand() * Math.PI * 2;
      const xzScale = scale * randRange(0.92, 1.12);
      const yScale = scale * randRange(0.96, 1.26);
      g.scale.set(xzScale, yScale, xzScale);

      const isLarch = rand() > 0.58;
      const foliageMat = isLarch ? matWinterLarch : matFrostCedar;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 6.2, 7), matBark);
      trunk.position.y = 3.1;
      g.add(trunk);

      const layers = 4;
      for (let t = 0; t < layers; t++) {
        const r = THREE.MathUtils.lerp(2.05, 0.72, t / (layers - 1));
        const y = 2.6 + t * 1.45;
        const rot = t * 0.52;
        const bough = new THREE.Mesh(new THREE.ConeGeometry(r, 2.15, 7), foliageMat);
        bough.position.set(0, y, 0);
        bough.rotation.y = rot;
        g.add(bough);

        const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.93, 1.18, 7), matSnowCap);
        snow.position.set(0, y + 0.54, 0);
        snow.rotation.y = rot;
        g.add(snow);
      }
      this.group.add(g);
    };

    // Species 5: Iconic BGMI Vikendi Winter Silver Birch (straight white trunk, flush dark knots & exact forked boughs!)
    const addSilverBirch = (x: number, z: number, scale: number) => {
      const g = new THREE.Group();
      g.position.set(x, -0.06, z);
      g.rotation.y = rand() * Math.PI * 2;
      g.scale.setScalar(scale * randRange(0.95, 1.22));

      const trunkH = randRange(5.4, 6.8);
      const rBot = 0.24;
      const rTop = 0.1;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, trunkH, 8), matBirchBark);
      trunk.position.y = trunkH * 0.5;
      g.add(trunk);

      // Flush dark horizontal birch bark bands matched exactly to the upright trunk taper
      for (let k = 0; k < 5; k++) {
        const ky = 1.0 + k * (trunkH * 0.16);
        const kr = THREE.MathUtils.lerp(rBot, rTop, ky / trunkH) + 0.008;
        const knot = new THREE.Mesh(new THREE.CylinderGeometry(kr, kr + 0.004, 0.13, 8), matBirchKnot);
        knot.position.y = ky;
        g.add(knot);
      }

      // Flush-connected sculptural bare winter branches + exact secondary forks + frost puffs
      const branchCount = 5;
      for (let b = 0; b < branchCount; b++) {
        const ang = (b / branchCount) * Math.PI * 2 + randRange(-0.24, 0.24);
        const startY = trunkH * (0.58 + (b % 3) * 0.13);
        const spread = randRange(1.2, 1.95);
        const rise = randRange(1.5, 2.3);
        const start = new THREE.Vector3(0, startY, 0);
        const end = new THREE.Vector3(Math.cos(ang) * spread, startY + rise, Math.sin(ang) * spread);

        addBranchSegment(g, start, end, 0.085, 0.04, matBirchBark, 6);

        // Secondary fork emerging directly from 60% along the branch
        const mid = new THREE.Vector3().lerpVectors(start, end, 0.6);
        const twigEnd = new THREE.Vector3(
          mid.x + Math.cos(ang + 0.65) * 0.85,
          mid.y + 0.95,
          mid.z + Math.sin(ang + 0.65) * 0.85
        );
        addBranchSegment(g, mid, twigEnd, 0.045, 0.022, matBirchBark, 5);

        if (rand() > 0.25) {
          const frost = new THREE.Mesh(sharedCanopyPuff, matSnowCap);
          frost.position.set(end.x, end.y + 0.08, end.z);
          frost.scale.set(randRange(0.42, 0.68), randRange(0.22, 0.34), randRange(0.42, 0.68));
          g.add(frost);
        }
      }
      this.group.add(g);
    };

    // Snow-capped alpine granite boulders scattered organically around groves
    const addAlpineBoulder = (x: number, z: number, scale: number) => {
      const b = new THREE.Group();
      b.position.set(x, -0.05, z);
      b.rotation.y = rand() * Math.PI * 2;
      const rock = new THREE.Mesh(sharedBoulderGeo, matBoulder);
      rock.scale.set(scale * randRange(1.0, 1.5), scale * randRange(0.65, 1.05), scale * randRange(0.9, 1.4));
      rock.position.y = scale * 0.42;
      b.add(rock);

      const cap = new THREE.Mesh(sharedBoulderGeo, matSnowCap);
      cap.scale.set(rock.scale.x * 0.92, rock.scale.y * 0.42, rock.scale.z * 0.92);
      cap.position.y = rock.position.y + rock.scale.y * 0.55;
      b.add(cap);
      this.group.add(b);
    };

    const spawnRandomVikendiTree = (x: number, z: number, scale: number) => {
      const roll = rand();
      if (roll < 0.27) addAlpineSpruce(x, z, scale);
      else if (roll < 0.49) addSiberianFir(x, z, scale);
      else if (roll < 0.67) addScotsPine(x, z, scale);
      else if (roll < 0.82) addFrostCedar(x, z, scale);
      else addSilverBirch(x, z, scale);
    };

    // Organic random clustered forest groves leaving wide scenic mountain vista windows!
    const placedTrees: Array<[number, number]> = [];
    const isValidTreePos = (x: number, z: number, minDist = 4.3): boolean => {
      // Generous 6.4m+ canopy clearance outside all 4 brick walls & north skyline so NO branch ever pokes inside!
      if (x > -22.4 && x < 22.4 && z > -29.2 && z < 22.4) return false;
      // Keep clear of scenic vista corridors so towering mountains shine unobstructed!
      if (x < -21 && z > -6.0 && z < 6.0) return false; // West mountain window
      if (x > 21 && z > -7.5 && z < 4.0) return false; // East mountain window
      for (const [px, pz] of placedTrees) {
        if (Math.hypot(x - px, z - pz) < minDist) return false;
      }
      return true;
    };

    // 6 organic groves around varied angles & depths (well outside brick walls!) + lone scattered trees
    const groveCenters: Array<{ cx: number; cz: number; rad: number; count: number }> = [
      { cx: -29.5, cz: -16.0, rad: 8.5, count: 7 }, // NW mixed spruce/pine grove
      { cx: -28.5, cz: 15.5, rad: 8.2, count: 6 }, // SW birch & fir grove
      { cx: 29.5, cz: -15.5, rad: 8.5, count: 7 }, // NE alpine cedar/spruce grove
      { cx: 29.0, cz: 14.5, rad: 8.2, count: 6 }, // SE mixed pine/birch grove
      { cx: -9.0, cz: 29.0, rad: 8.0, count: 5 }, // South-West ridge cluster
      { cx: 11.0, cz: 29.5, rad: 8.0, count: 5 }, // South-East ridge cluster
    ];

    for (const grove of groveCenters) {
      let spawned = 0;
      for (let tries = 0; tries < 60 && spawned < grove.count; tries++) {
        const ang = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * grove.rad;
        const tx = grove.cx + Math.cos(ang) * r;
        const tz = grove.cz + Math.sin(ang) * r;
        if (isValidTreePos(tx, tz, 4.1)) {
          placedTrees.push([tx, tz]);
          spawnRandomVikendiTree(tx, tz, randRange(0.95, 1.58));
          spawned++;
        }
      }
    }

    // Add 10 randomly scattered outlier trees deeper across the alpine valley (28m–46m)
    let outliers = 0;
    for (let tries = 0; tries < 90 && outliers < 10; tries++) {
      const ang = rand() * Math.PI * 2;
      const dist = randRange(27, 45);
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist - 2;
      if (isValidTreePos(tx, tz, 5.4)) {
        placedTrees.push([tx, tz]);
        spawnRandomVikendiTree(tx, tz, randRange(1.1, 1.75));
        outliers++;
      }
    }

    // Scatter 16 snow-capped granite boulders around the outer snowfields & vista corridors
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + randRange(-0.18, 0.18);
      const dist = randRange(20, 38);
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist - 1;
      if (!(bx > -17.8 && bx < 17.8 && bz > -26.5 && bz < 17.8)) {
        addAlpineBoulder(bx, bz, randRange(1.1, 2.4));
      }
    }

    // 7c. Randomized Multi-Tier BGMI Vikendi Mountains (Small Green Pine Hills, Medium Forested/Granite Ridges & Large Glacial Summits!)
    type MountainBiome = 'greenHill' | 'timberRidge' | 'graniteCrag' | 'glacialSummit' | 'blueGlacier';

    const createAlpineMountainMesh = (
      radiusX: number,
      radiusZ: number,
      height: number,
      biome: MountainBiome,
      seed: number
    ): THREE.Mesh => {
      // Vary top silhouette: rounded dome hills vs broad flat-ish ridges vs sharp jagged spires!
      const topR = biome === 'greenHill' ? radiusX * 0.22 : biome === 'timberRidge' ? radiusX * 0.14 : 0.35;
      const baseGeo = new THREE.CylinderGeometry(topR, radiusX, height, 22, 9, false);
      baseGeo.translate(0, height * 0.5, 0);

      const zStretch = radiusZ / Math.max(1, radiusX);
      const pos = baseGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let vx = pos.getX(i);
        let vy = pos.getY(i);
        let vz = pos.getZ(i) * zStretch;
        const hNorm = THREE.MathUtils.clamp(vy / height, 0, 1);
        const ang = Math.atan2(vz, vx);

        // Shape profile curve: smooth domed pine hills vs jagged steep alpine peaks
        if (biome === 'greenHill') {
          const domeFactor = Math.pow(Math.max(0.001, 1 - hNorm * 0.82), 0.58) / Math.max(0.18, 1 - hNorm * 0.78);
          vx *= THREE.MathUtils.lerp(1.0, domeFactor, 0.55);
          vz *= THREE.MathUtils.lerp(1.0, domeFactor, 0.55);
          vy *= 1 - Math.pow(hNorm, 2.2) * 0.14;
        }

        const rAmp = biome === 'greenHill' ? 0.14 : biome === 'timberRidge' ? 0.22 : 0.3;
        const r1 = Math.sin(ang * 2 + seed) * rAmp;
        const r2 = Math.cos(ang * 4 - seed * 1.6) * (rAmp * 0.58);
        const r3 = Math.sin(ang * 7 + hNorm * 4.0 + seed * 2.1) * (rAmp * 0.3);
        const flank = 1 + (r1 + r2 + r3) * (1 - hNorm * 0.32);

        const leanAmp = biome === 'greenHill' ? 0.06 : 0.18;
        const leanX = Math.sin(hNorm * Math.PI * 0.85) * Math.cos(seed * 1.3) * radiusX * leanAmp;
        const leanZ = Math.sin(hNorm * Math.PI * 0.85) * Math.sin(seed * 1.3) * radiusZ * leanAmp;
        const ridgeLift = (r1 * 0.16 + r2 * 0.09) * hNorm;

        pos.setXYZ(i, vx * flank + leanX, Math.max(0, vy * (1 + ridgeLift)), vz * flank + leanZ);
      }

      const geo = baseGeo.toNonIndexed();
      baseGeo.dispose();
      geo.computeVertexNormals();

      const gPos = geo.attributes.position as THREE.BufferAttribute;
      const gNorm = geo.attributes.normal as THREE.BufferAttribute;
      const colors = new Float32Array(gPos.count * 3);

      const cPineDeep = new THREE.Color(0x1f4d32);
      const cPineMoss = new THREE.Color(0x3a6b42);
      const cGraniteDark = new THREE.Color(0x3a4756);
      const cGraniteWarm = new THREE.Color(0x6e6054);
      const cSlateCool = new THREE.Color(0x4a627c);
      const cSnowShade = new THREE.Color(0xdcebfa);
      const cSnowBright = new THREE.Color(0xf8fcff);
      const cTmp = new THREE.Color();

      for (let i = 0; i < gPos.count; i++) {
        const py = gPos.getY(i);
        const ny = gNorm.getY(i);
        const hNorm = THREE.MathUtils.clamp(py / height, 0, 1);

        if (biome === 'greenHill') {
          // Lush Vikendi pine-forested foothill with green spruce slopes & patchy snow on upper crown
          cTmp.copy(cPineDeep).lerp(cPineMoss, THREE.MathUtils.clamp(ny * 1.15, 0, 1));
          const snowTop = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.62, 0.94) * 0.78 + THREE.MathUtils.smoothstep(ny, 0.76, 0.95) * 0.35,
            0,
            0.88
          );
          cTmp.lerp(cSnowShade, snowTop);
        } else if (biome === 'timberRidge') {
          // Lower 46% evergreen pine forest timberline -> rugged granite crags -> crisp snowy crest!
          const treeLine = THREE.MathUtils.smoothstep(hNorm, 0.34, 0.56);
          const forestCol = cPineDeep.clone().lerp(cPineMoss, THREE.MathUtils.clamp(ny, 0, 1));
          const rockCol = cGraniteDark.clone().lerp(cGraniteWarm, THREE.MathUtils.clamp(ny * 1.2, 0, 1));
          cTmp.copy(forestCol).lerp(rockCol, treeLine);
          const snowAmt = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.55, 0.84) * 0.9 + THREE.MathUtils.smoothstep(ny, 0.58, 0.86) * 0.42 - (1 - treeLine) * 0.4,
            0,
            1
          );
          cTmp.lerp(hNorm > 0.72 ? cSnowBright : cSnowShade, snowAmt);
        } else if (biome === 'graniteCrag') {
          // Rugged weathered slate & brown alpine granite cliff faces with snow veins in gullies/peaks
          cTmp.copy(cGraniteDark).lerp(cGraniteWarm, THREE.MathUtils.clamp(ny * 1.35, 0, 1));
          const snowAmt = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.52, 0.86) * 0.75 + THREE.MathUtils.smoothstep(ny, 0.54, 0.82) * 0.65 - 0.18,
            0,
            0.92
          );
          cTmp.lerp(cSnowShade, snowAmt);
        } else if (biome === 'blueGlacier') {
          // Vibrant radiant white alpine glacier peak with luminous azure-sapphire icy-blue facets!
          const cGlacierDeep = new THREE.Color(0x2878cc);
          const cGlacierSky = new THREE.Color(0x7ac6fa);
          const cIceWhite = new THREE.Color(0xf6fbff);
          const cPureSnow = new THREE.Color(0xffffff);
          // Vibrant glacial blue on steep crystalline flanks transitioning smoothly into radiant pure-white snow crest!
          cTmp.copy(cGlacierDeep).lerp(cGlacierSky, THREE.MathUtils.clamp(ny * 1.15 + hNorm * 0.25, 0, 1));
          const snowAmt = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.22, 0.72) * 0.85 + THREE.MathUtils.smoothstep(ny, 0.36, 0.78) * 0.72,
            0,
            1
          );
          cTmp.lerp(hNorm > 0.56 ? cPureSnow : cIceWhite, snowAmt);
        } else {
          // High-altitude glacial snow summit with dramatic icy-blue rock ridges!
          cTmp.copy(cGraniteDark).lerp(cSlateCool, THREE.MathUtils.clamp(ny * 1.1, 0, 1));
          const snowAmt = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.28, 0.66) * 0.88 + THREE.MathUtils.smoothstep(ny, 0.42, 0.76) * 0.76,
            0,
            1
          );
          cTmp.lerp(hNorm > 0.58 ? cSnowBright : cSnowShade, snowAmt);
        }

        colors[i * 3] = cTmp.r;
        colors[i * 3 + 1] = cTmp.g;
        colors[i * 3 + 2] = cTmp.b;
      }

      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat =
        biome === 'greenHill' || biome === 'timberRidge'
          ? matMtnPine
          : biome === 'graniteCrag'
          ? matMtnGranite
          : biome === 'blueGlacier'
          ? matMtnBlueGlacier
          : matMtnGlacial;
      return new THREE.Mesh(geo, mat);
    };

    // HERO CENTERPIECE: Majestic radiant white alpine mountain with vibrant glacial-blue tint directly behind the big North Silo!
    const heroGlacier = new THREE.Group();
    heroGlacier.position.set(-0.8, -0.8, -92);
    heroGlacier.add(createAlpineMountainMesh(42, 30, 68, 'blueGlacier', 7.4));
    const heroWestShoulder = createAlpineMountainMesh(28, 22, 46, 'blueGlacier', 12.1);
    heroWestShoulder.position.set(-24, 0, 6);
    heroGlacier.add(heroWestShoulder);
    const heroEastShoulder = createAlpineMountainMesh(26, 20, 42, 'blueGlacier', 18.6);
    heroEastShoulder.position.set(25, 0, 8);
    heroGlacier.add(heroEastShoulder);
    this.group.add(heroGlacier);

    // Spacious, truly randomized alpine horizon (10 varied mountains leaving wide open golden-hour sky valleys!)
    const mountainSpecs: Array<{
      baseAng: number;
      angJitter: number;
      minDist: number;
      maxDist: number;
      minR: number;
      maxR: number;
      minH: number;
      maxH: number;
      biomePool: MountainBiome[];
      hasShoulder: boolean;
    }> = [
      // 3 LARGE HERO SUMMITS far back across wide sky sectors
      { baseAng: -2.18, angJitter: 0.2, minDist: 88, maxDist: 106, minR: 28, maxR: 36, minH: 46, maxH: 60, biomePool: ['glacialSummit', 'graniteCrag'], hasShoulder: true },
      { baseAng: -0.78, angJitter: 0.22, minDist: 86, maxDist: 104, minR: 27, maxR: 36, minH: 44, maxH: 58, biomePool: ['glacialSummit', 'timberRidge'], hasShoulder: true },
      { baseAng: 2.35, angJitter: 0.3, minDist: 84, maxDist: 102, minR: 26, maxR: 35, minH: 44, maxH: 58, biomePool: ['glacialSummit', 'graniteCrag'], hasShoulder: true },
      // 3 MEDIUM ELONGATED RIDGES (mix of green-forested timberline ridges & weathered granite crags!)
      { baseAng: -2.92, angJitter: 0.22, minDist: 64, maxDist: 78, minR: 19, maxR: 26, minH: 25, maxH: 36, biomePool: ['timberRidge', 'graniteCrag'], hasShoulder: true },
      { baseAng: 0.12, angJitter: 0.24, minDist: 62, maxDist: 76, minR: 18, maxR: 25, minH: 24, maxH: 35, biomePool: ['timberRidge', 'graniteCrag'], hasShoulder: true },
      { baseAng: 1.48, angJitter: 0.26, minDist: 64, maxDist: 78, minR: 19, maxR: 26, minH: 23, maxH: 34, biomePool: ['timberRidge', 'glacialSummit'], hasShoulder: false },
      // 4 SMALL LUSH GREEN PINE FOOTHILLS closer in the foreground (adds lush greenery & depth layering!)
      { baseAng: -2.48, angJitter: 0.22, minDist: 49, maxDist: 60, minR: 15, maxR: 22, minH: 13, maxH: 20, biomePool: ['greenHill'], hasShoulder: false },
      { baseAng: -0.32, angJitter: 0.22, minDist: 48, maxDist: 60, minR: 15, maxR: 22, minH: 12, maxH: 19, biomePool: ['greenHill'], hasShoulder: false },
      { baseAng: 0.88, angJitter: 0.24, minDist: 50, maxDist: 62, minR: 16, maxR: 23, minH: 14, maxH: 21, biomePool: ['greenHill', 'timberRidge'], hasShoulder: false },
      { baseAng: 2.95, angJitter: 0.22, minDist: 48, maxDist: 60, minR: 15, maxR: 22, minH: 13, maxH: 20, biomePool: ['greenHill'], hasShoulder: false },
    ];

    for (const spec of mountainSpecs) {
      const ang = spec.baseAng + randRange(-spec.angJitter, spec.angJitter);
      const dist = randRange(spec.minDist, spec.maxDist);
      const rx = randRange(spec.minR, spec.maxR);
      const rz = rx * randRange(0.62, 1.32); // Asymmetric elongated mountain ridge footprints!
      const h = randRange(spec.minH, spec.maxH);
      const biome = spec.biomePool[Math.floor(rand() * spec.biomePool.length)];
      const seed = randRange(0.5, 95.0);

      const mx = Math.cos(ang) * dist;
      const mz = Math.sin(ang) * dist - 2;
      const massif = new THREE.Group();
      massif.position.set(mx, -0.8, mz);
      massif.rotation.y = rand() * Math.PI * 2;

      massif.add(createAlpineMountainMesh(rx, rz, h, biome, seed));

      if (spec.hasShoulder && rand() > 0.25) {
        const subBiome: MountainBiome = biome === 'glacialSummit' && rand() > 0.4 ? 'timberRidge' : biome;
        const sh = createAlpineMountainMesh(rx * randRange(0.58, 0.76), rz * randRange(0.6, 0.8), h * randRange(0.52, 0.7), subBiome, seed + 4.3);
        const sideAng = rand() * Math.PI * 2;
        sh.position.set(Math.cos(sideAng) * rx * 0.55, 0, Math.sin(sideAng) * rz * 0.55);
        massif.add(sh);
      }

      this.group.add(massif);
    }

    // 8. Foundry-Grade Glowing Beacons, Warm Fire Barrels, Volumetric Golden Sunbeams & Radiant Particles!
    // Emissive cyan & amber industrial light strips framing key tactical lanes
    this.addBox(0, 3.05, -17.42, 2.3, 0.14, 0.18, this.matEmissiveCyan, { collide: false, raycast: false, castShadow: false });
    this.addBox(-7.4, 3.85, 7.12, 0.14, 1.9, 0.14, this.matEmissiveCrimson, { collide: false, raycast: false, castShadow: false });
    this.addBox(7.4, 3.85, 7.12, 0.14, 1.9, 0.14, this.matEmissiveAmber, { collide: false, raycast: false, castShadow: false });
    this.addBox(-2.62, 2.15, -1.2, 0.08, 0.14, 4.2, this.matEmissiveCyan, { collide: false, raycast: false, castShadow: false });
    this.addBox(2.92, 2.15, -3.5, 0.08, 0.14, 4.2, this.matEmissiveAmber, { collide: false, raycast: false, castShadow: false });

    // Flickering burning industrial fire barrels warming the courtyard corners (mirrors across wet snow!)
    this.addBurningFireBarrel(-6.8, -5.8, 30, 0.6, true);
    this.addBurningFireBarrel(7.1, 6.2, 28, 2.4, true);

    // Volumetric golden sun shafts & cyan factory bay beam
    const sunBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffd078,
      transparent: true,
      opacity: 0.072,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cyanShaftMat = new THREE.MeshBasicMaterial({
      color: 0x36eeff,
      transparent: true,
      opacity: 0.068,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const factoryBeams = [
      { x: 1.5, y: 4.8, z: -2.2, w: 5.2, h: 11.5, mat: sunBeamMat, rotZ: -0.34 },
      { x: -4.2, y: 4.5, z: 3.4, w: 4.4, h: 10.2, mat: sunBeamMat, rotZ: -0.32 },
      { x: 0.0, y: 3.6, z: -15.6, w: 4.2, h: 7.4, mat: cyanShaftMat, rotZ: 0.12 },
    ];
    for (const b of factoryBeams) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), b.mat);
      shaft.position.set(b.x, b.y, b.z);
      shaft.rotation.set(0.12, 0.28, b.rotZ);
      this.group.add(shaft);
    }

    // Clearly Visible Dual-Layer Falling BGMI Vikendi Snowflakes (close courtyard flakes + wide sky snow flurries!)
    const nearCount = 720;
    const nearPositions = new Float32Array(nearCount * 3);
    const nearSpeeds = new Float32Array(nearCount);
    for (let i = 0; i < nearCount; i++) {
      nearPositions[i * 3] = (Math.random() - 0.5) * 35;
      nearPositions[i * 3 + 1] = 0.15 + Math.random() * 13.5;
      nearPositions[i * 3 + 2] = -18.5 + Math.random() * 35;
      nearSpeeds[i] = 1.15 + Math.random() * 1.15;
    }
    const nearSnowGeo = new THREE.BufferGeometry();
    nearSnowGeo.setAttribute('position', new THREE.BufferAttribute(nearPositions, 3));
    const nearSnowMat = new THREE.PointsMaterial({
      map: this.tex.snowSprite,
      color: 0xffffff,
      size: 0.24,
      transparent: true,
      opacity: 0.96,
      alphaTest: 0.04,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const nearSnowPoints = new THREE.Points(nearSnowGeo, nearSnowMat);
    this.group.add(nearSnowPoints);

    const farCount = 820;
    const farPositions = new Float32Array(farCount * 3);
    const farSpeeds = new Float32Array(farCount);
    for (let i = 0; i < farCount; i++) {
      farPositions[i * 3] = (Math.random() - 0.5) * 56;
      farPositions[i * 3 + 1] = 0.5 + Math.random() * 20.0;
      farPositions[i * 3 + 2] = -28 + Math.random() * 54;
      farSpeeds[i] = 0.85 + Math.random() * 0.95;
    }
    const farSnowGeo = new THREE.BufferGeometry();
    farSnowGeo.setAttribute('position', new THREE.BufferAttribute(farPositions, 3));
    const farSnowMat = new THREE.PointsMaterial({
      map: this.tex.snowSprite,
      color: 0xf4faff,
      size: 0.19,
      transparent: true,
      opacity: 0.84,
      alphaTest: 0.04,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const farSnowPoints = new THREE.Points(farSnowGeo, farSnowMat);
    this.group.add(farSnowPoints);

    scene.add(this.group);

    const updateAtmosphere = (dt: number, elapsed: number) => {
      for (const fl of this.flickerLights) {
        const wave =
          Math.sin(elapsed * fl.speed + fl.phase) * 0.16 +
          Math.sin(elapsed * (fl.speed * 2.3) + fl.phase * 1.7) * 0.11;
        fl.light.intensity = fl.baseIntensity * (1 + wave);
      }
      for (const f of this.flameMeshes) {
        const s = 0.82 + Math.sin(elapsed * 14 + f.phase) * 0.22 + Math.cos(elapsed * 23 + f.phase) * 0.12;
        f.mesh.scale.set(
          f.baseScale * (0.9 + s * 0.15),
          f.baseScale * (0.75 + s * 0.45),
          f.baseScale * (0.9 + s * 0.15)
        );
        f.mesh.position.y = f.baseY + Math.sin(elapsed * 11 + f.phase) * 0.05;
        f.mesh.rotation.y += dt * 2.2;
      }

      // Dynamic Vikendi winter breeze gusting softly across both snowflake layers
      const windX = 0.55 + Math.sin(elapsed * 0.42) * 0.45;
      const windZ = 0.24 + Math.cos(elapsed * 0.35) * 0.25;

      const nPos = nearSnowPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < nPos.count; i++) {
        let y = nPos.getY(i) - dt * nearSpeeds[i];
        let x = nPos.getX(i) + (windX + Math.sin(elapsed * 1.55 + i * 0.63) * 0.55) * dt;
        let z = nPos.getZ(i) + (windZ + Math.cos(elapsed * 1.25 + i * 0.47) * 0.42) * dt;
        if (y < 0.05) {
          y = 13.6;
          x = (Math.random() - 0.5) * 35;
          z = -18.5 + Math.random() * 35;
        } else {
          if (x > 17.5) x -= 35;
          else if (x < -17.5) x += 35;
          if (z > 16.5) z -= 35;
          else if (z < -18.5) z += 35;
        }
        nPos.setXYZ(i, x, y, z);
      }
      nPos.needsUpdate = true;

      const fPos = farSnowPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fPos.count; i++) {
        let y = fPos.getY(i) - dt * farSpeeds[i];
        let x = fPos.getX(i) + (windX * 1.25 + Math.sin(elapsed * 1.1 + i * 0.51) * 0.45) * dt;
        let z = fPos.getZ(i) + (windZ * 1.15 + Math.cos(elapsed * 0.95 + i * 0.39) * 0.35) * dt;
        if (y < 0.2) {
          y = 20.2;
          x = (Math.random() - 0.5) * 56;
          z = -28 + Math.random() * 54;
        } else {
          if (x > 28) x -= 56;
          else if (x < -28) x += 56;
          if (z > 26) z -= 54;
          else if (z < -28) z += 54;
        }
        fPos.setXYZ(i, x, y, z);
      }
      fPos.needsUpdate = true;
    };

    // 100% collider-clear 23-node Vikendi tactical navgraph (zero edges clipping containers, crates, walls, or barrels!)
    const rawWps: Array<{ id: number; x: number; z: number; neighbors: number[]; cover?: boolean; zone: string }> = [
      { id: 0, x: 0.0, z: 11.4, neighbors: [1, 2, 3], zone: 'SOUTH COURTYARD' },
      { id: 1, x: -3.2, z: 6.8, neighbors: [0, 2, 12], cover: true, zone: 'SOUTH COURTYARD' },
      { id: 2, x: -0.4, z: 4.0, neighbors: [0, 1, 3, 6, 12], zone: 'MID LANE' },
      { id: 3, x: 3.4, z: 6.8, neighbors: [0, 2, 5], cover: true, zone: 'SOUTH COURTYARD' },
      { id: 4, x: -6.7, z: 2.0, neighbors: [12, 13], cover: true, zone: 'WEST BREACH' },
      { id: 5, x: 3.9, z: 1.4, neighbors: [3, 6, 16], cover: true, zone: 'RED CONTAINER' },
      { id: 6, x: 0.1, z: -1.5, neighbors: [2, 5, 7], zone: 'MID CONTAINERS' },
      { id: 7, x: 0.4, z: -8.2, neighbors: [6, 8, 9, 10], zone: 'NORTH COURT' },
      { id: 8, x: -4.4, z: -9.2, neighbors: [7, 10, 20], cover: true, zone: 'NORTH WEST' },
      { id: 9, x: 6.6, z: -9.2, neighbors: [7, 10, 17], cover: true, zone: 'NORTH EAST' },
      { id: 10, x: 0.0, z: -11.4, neighbors: [7, 8, 9], cover: true, zone: 'NORTH SILO' },
      { id: 11, x: 0.0, z: -16.4, neighbors: [15, 19], zone: 'DEPOT DOOR' },
      { id: 12, x: -3.4, z: 3.6, neighbors: [1, 2, 4], cover: true, zone: 'SOUTH WEST MID' },
      { id: 13, x: -6.7, z: -2.5, neighbors: [4, 14, 20], cover: true, zone: 'BLUE CONTAINER' },
      { id: 14, x: -9.8, z: -3.5, neighbors: [13, 21], cover: true, zone: 'WEST ALLEY' },
      { id: 15, x: -7.8, z: -16.2, neighbors: [11, 21], zone: 'NORTH SILO' },
      { id: 16, x: 6.8, z: -0.2, neighbors: [5, 17, 18], zone: 'EAST BREACH' },
      { id: 17, x: 6.8, z: -5.4, neighbors: [9, 16], cover: true, zone: 'EAST MID' },
      { id: 18, x: 9.8, z: -3.2, neighbors: [16, 22], cover: true, zone: 'EAST DOCK' },
      { id: 19, x: 7.8, z: -16.2, neighbors: [11, 22], zone: 'NORTH SILO' },
      { id: 20, x: -5.0, z: -5.8, neighbors: [8, 13], cover: true, zone: 'WEST MID' },
      { id: 21, x: -9.6, z: -13.6, neighbors: [14, 15], zone: 'WEST ALLEY' },
      { id: 22, x: 9.6, z: -13.6, neighbors: [18, 19], zone: 'EAST DOCK' },
    ];

    return {
      group: this.group,
      colliders: this.colliders,
      raycastMeshes: this.raycastMeshes,
      minimapRects: this.minimapRects,
      waypoints: rawWps.map((w) => ({
        id: w.id,
        pos: new THREE.Vector3(w.x, 0, w.z),
        neighbors: w.neighbors,
        cover: w.cover,
        zone: w.zone,
      })),
      zones: [
        { name: 'SOUTH COURTYARD', minX: -16, maxX: 16, minZ: 7.2, maxZ: 16 },
        { name: 'MID CONTAINERS', minX: -8.5, maxX: 8.5, minZ: -7.2, maxZ: 7.2 },
        { name: 'NORTH SILO', minX: -8.5, maxX: 8.5, minZ: -18, maxZ: -7.2 },
        { name: 'WEST SNOW ALLEY', minX: -16, maxX: -8.5, minZ: -18, maxZ: 7.2 },
        { name: 'EAST LOADING DOCK', minX: 8.5, maxX: 16, minZ: -18, maxZ: 7.2 },
      ],
      playerSpawn: {
        pos: new THREE.Vector3(0.0, 0, 12.2),
        yaw: 0.0,
      },
      allySpawn: {
        pos: new THREE.Vector3(-2.6, 0, 7.6),
        yaw: -0.1,
      },
      allySpawns: [
        { pos: new THREE.Vector3(-2.6, 0, 7.6), yaw: -0.1, role: 'ember', name: 'EMBER' },
        { pos: new THREE.Vector3(2.8, 0, 7.4), yaw: 0.12, role: 'ember', name: 'PULSE' },
      ],
      enemySpawns: [
        { pos: new THREE.Vector3(0.35, 0, -9.2), yaw: Math.PI, role: 'duelist', name: 'ZEPHYR' },
        { pos: new THREE.Vector3(-5.4, 0, -9.8), yaw: Math.PI - 0.2, role: 'striker', name: 'PYRO' },
        { pos: new THREE.Vector3(5.6, 0, -10.2), yaw: Math.PI + 0.22, role: 'sentinel', name: 'BASTION' },
        { pos: new THREE.Vector3(-10.2, 0, -13.2), yaw: Math.PI - 0.12, role: 'duelist', name: 'VEX' },
        { pos: new THREE.Vector3(10.2, 0, -13.0), yaw: Math.PI + 0.12, role: 'striker', name: 'SCORCH' },
      ],
      dustParticles: nearSnowPoints,
      mapBounds: { minX: -16, maxX: 16, minZ: -18, maxZ: 16 },
      updateAtmosphere,
    };
  }
}
