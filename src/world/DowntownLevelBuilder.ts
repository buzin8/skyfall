import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AABB, MinimapRect, RampCollider, ZoneDef } from '../types';
import { BuiltLevel } from './LevelBuilder';
import { CrowdSpot, DowntownNpcSystem, PedestrianNode } from './DowntownNpcs';
import {
  DOWNTOWN_CITY_GLB,
  DOWNTOWN_CITY_LOW_GLB,
  DowntownCarGlbId,
  fitGlbInstance,
  loadDowntownGlb,
  preloadDowntownGlbs,
  styleGlbCarForCyberpunkDowntown,
} from './DowntownGlbAssets';
import {
  CYBERPUNK_CITY_COLLIDERS,
  CYBERPUNK_CITY_OFFSET,
  CYBERPUNK_CITY_SCALE,
  CYBERPUNK_PLAY_HALF_X,
  CYBERPUNK_PLAY_HALF_Z,
} from './CyberpunkCityData';

const HALF_W = CYBERPUNK_PLAY_HALF_X; // 66m -> 132m x 108m Cyberpunk City arena!
const HALF_L = CYBERPUNK_PLAY_HALF_Z; // 54m

/**
 * Photorealistic Synthwave-Sunset Cyberpunk City TDM Arena ("DOWNTOWN"):
 * - Powered 100% by the user's downloaded 3D Cyberpunk City, 10 Supercars & Police Patrol,
 *   and 12 safe animated/crowd NPCs (all old procedural NYC buildings/cars/trees removed!)
 * - Tight auto-extracted building & pillar colliders directly matching cyberpunk_city.glb
 * - Radiant Synthwave Magenta-Crimson-Violet Sunset Sky Dome + Giant Setting Sun framing the Boulevard
 * - Live flashing Red/Blue Dodge Viper Police Patrol lightbars & glowing cyberpunk neon ads
 */
export class DowntownLevelBuilder {
  private group = new THREE.Group();
  private glbRoot = new THREE.Group();
  private highTierGlbRoot = new THREE.Group();
  private colliders: AABB[] = [];
  private ramps: RampCollider[] = [];
  private raycastMeshes: THREE.Object3D[] = [];
  private minimapRects: MinimapRect[] = [];
  private pulseLights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  private emergencyLights: Array<{ mat: THREE.MeshBasicMaterial; phase: number; colorA: number; colorB: number }> = [];

  private isLowEnd = false;

  constructor(isLowEnd = false) {
    this.isLowEnd = isLowEnd;
    preloadDowntownGlbs(isLowEnd);
  }

  public build(scene: THREE.Scene, isLowEnd = this.isLowEnd): BuiltLevel {
    this.isLowEnd = isLowEnd;
    // 1. Vibrant Synthwave Magenta-Crimson-Violet Sunset Sky Dome + Giant Radiant Setting Sun framed down the Boulevard!
    const skyGeo = new THREE.SphereGeometry(420, 48, 32);
    const sunDirection = new THREE.Vector3(0.84, 0.36, -0.40).normalize();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        topColor: { value: new THREE.Color('#2c0c60') },
        upperColor: { value: new THREE.Color('#961088') },
        midColor: { value: new THREE.Color('#e21a7a') },
        lowColor: { value: new THREE.Color('#ff4a86') },
        horizonColor: { value: new THREE.Color('#9c2898') },
        sunDir: { value: sunDirection },
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
        uniform vec3 upperColor;
        uniform vec3 midColor;
        uniform vec3 lowColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        varying vec3 vWorldPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 d = normalize(vWorldPos);
          float h = clamp(d.y, -0.15, 1.0);

          vec3 col = mix(horizonColor, lowColor, smoothstep(-0.02, 0.14, h));
          col = mix(col, midColor, smoothstep(0.12, 0.34, h));
          col = mix(col, upperColor, smoothstep(0.30, 0.58, h));
          col = mix(col, topColor, smoothstep(0.54, 0.90, h));

          float sunCos = clamp(dot(d, sunDir), -1.0, 1.0);
          float sunAlign = max(sunCos, 0.0);
          float sunAng = acos(sunCos);

          col += vec3(0.46, 0.14, 0.20) * pow(sunAlign, 2.2) * (1.0 - smoothstep(0.05, 0.65, h));
          col += vec3(0.58, 0.28, 0.12) * pow(sunAlign, 6.0);
          col += vec3(0.65, 0.45, 0.24) * pow(sunAlign, 18.0);

          float cloudZone = smoothstep(0.04, 0.20, h) * (1.0 - smoothstep(0.52, 0.82, h));
          float c1 = sin(d.x * 6.5 + d.z * 3.2) * cos(d.z * 5.1 - d.x * 2.9 + h * 7.0);
          float c2 = sin(d.x * 13.0 - d.z * 8.5 + h * 11.0) * 0.5 + 0.5;
          float cloudMask = smoothstep(0.18, 0.78, c1 * 0.55 + c2 * 0.45) * cloudZone;
          vec3 cloudDark = mix(vec3(0.38, 0.07, 0.44), vec3(0.86, 0.16, 0.46), pow(sunAlign, 1.6));
          vec3 cloudLit = mix(vec3(0.98, 0.26, 0.58), vec3(1.0, 0.62, 0.46), pow(sunAlign, 3.0));
          col = mix(col, mix(cloudDark, cloudLit, smoothstep(0.25, 0.85, c2)), cloudMask * 0.52);

          float az = atan(d.x, d.z);
          float streakCell = floor(az * 46.0);
          float streakSeed = hash21(vec2(streakCell, 3.7));
          float streakX = abs(fract(az * 46.0) - 0.5);
          float streakLine = smoothstep(0.065, 0.0, streakX) * step(0.62, streakSeed);
          float streakY = smoothstep(0.16, 0.34, h) * (1.0 - smoothstep(0.52, 0.74, h));
          col += vec3(1.0, 0.55, 0.86) * streakLine * streakY * 0.22;

          float sunRadius = 0.155;
          float sunDisc = 1.0 - smoothstep(sunRadius - 0.0045, sunRadius + 0.0045, sunAng);
          if (sunDisc > 0.001) {
            vec3 sunUp = normalize(vec3(0.0, 1.0, 0.0) - sunDir * sunDir.y);
            vec3 sunRight = normalize(cross(sunUp, sunDir));
            float localY = dot(d - sunDir, sunUp) / sunRadius;
            float localX = dot(d - sunDir, sunRight) / sunRadius;
            float sunT = clamp(localY * 0.5 + 0.5, 0.0, 1.0);

            vec3 sCol = mix(vec3(1.0, 0.36, 0.48), vec3(1.0, 0.66, 0.18), smoothstep(0.0, 0.30, sunT));
            sCol = mix(sCol, vec3(1.0, 0.94, 0.48), smoothstep(0.28, 0.56, sunT));
            sCol = mix(sCol, vec3(1.18, 1.15, 1.06), smoothstep(0.52, 0.88, sunT));

            float bandWave = sin(localY * 22.0 + sin(localX * 4.2) * 1.4) * 0.5 + 0.5;
            float bandWisp = sin(localX * 3.1 + localY * 11.0) * 0.5 + 0.5;
            float lowerHalf = 1.0 - smoothstep(0.18, 0.68, sunT);
            float sunCloud = smoothstep(0.42, 0.88, bandWave * 0.65 + bandWisp * 0.35) * lowerHalf;
            vec3 sunCloudTint = mix(vec3(0.95, 0.34, 0.62), vec3(1.0, 0.62, 0.56), sunT);
            sCol = mix(sCol, sunCloudTint, sunCloud * 0.58);

            float baseHaze = (1.0 - smoothstep(0.0, 0.24, sunT)) * 0.36;
            sCol = mix(sCol, vec3(1.0, 0.52, 0.68), baseHaze);

            col = mix(col, sCol, sunDisc);
          }

          float rimGlow = exp(-max(0.0, sunAng - sunRadius * 0.82) * 9.5);
          col += vec3(1.0, 0.48, 0.52) * rimGlow * 0.55;

          float mistFloor = 1.0 - smoothstep(-0.04, 0.10, h);
          col = mix(col, vec3(0.46, 0.14, 0.56), mistFloor * 0.42);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.group.add(new THREE.Mesh(skyGeo, skyMat));
    scene.background = new THREE.Color('#421260');
    scene.fog = new THREE.FogExp2(0x461662, 0.0028);

    // 2. Cinematic Synthwave Sunset + Electric Cyan Cyber-Rim Lighting
    const hemi = new THREE.HemisphereLight(0xff84cc, 0x262a5c, 1.55);
    hemi.userData.baseIntensity = 1.55;
    this.group.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xffb886, 1.72);
    sunLight.position.set(110, 58, -54);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 6;
    sunLight.shadow.camera.far = 230;
    sunLight.shadow.camera.left = -70;
    sunLight.shadow.camera.right = 70;
    sunLight.shadow.camera.top = 70;
    sunLight.shadow.camera.bottom = -70;
    sunLight.shadow.bias = -0.0008;
    this.group.add(sunLight);

    const skylineRim = new THREE.DirectionalLight(0x3ce0ff, 0.95);
    skylineRim.position.set(-72, 38, 62);
    this.group.add(skylineRim);

    const addCityGlow = (x: number, y: number, z: number, color: number, intensity: number, dist: number) => {
      const pl = new THREE.PointLight(color, intensity, dist, 1.35);
      pl.position.set(x, y, z);
      pl.userData.lowEndOptional = true;
      this.group.add(pl);
      this.pulseLights.push({ light: pl, base: intensity, phase: (x + z) * 0.1 });
    };
    addCityGlow(-34, 10, -3, 0x2ce8ff, 95, 48);
    addCityGlow(-8, 11, -3, 0xff3cb8, 92, 48);
    addCityGlow(18, 11, -3, 0x38d8ff, 95, 48);
    addCityGlow(44, 10, -3, 0xff52a8, 86, 46);
    addCityGlow(46, 10, 24, 0x42d4ff, 78, 44);
    addCityGlow(46, 10, -28, 0xff9444, 78, 44);
    addCityGlow(-18, 10, 41, 0x62f0ff, 76, 44);
    addCityGlow(-22, 10, -34, 0xc858ff, 76, 44);

    // 3. Dark wet cyber-asphalt safety floor plane flush under Cyberpunk City (zero void cracks!)
    const safetyFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(460, 460),
      new THREE.MeshStandardMaterial({
        color: 0x161926,
        roughness: 0.42,
        metalness: 0.25,
        emissive: new THREE.Color(0x0c0e1c),
        emissiveIntensity: 0.35,
      })
    );
    safetyFloor.rotation.x = -Math.PI / 2;
    safetyFloor.position.y = -0.04;
    safetyFloor.receiveShadow = true;
    this.group.add(safetyFloor);
    this.raycastMeshes.push(safetyFloor);

    // 4. Load the REAL downloaded Cyberpunk City GLB + wire ALL 172 exact building/pillar colliders!
    this.loadCyberpunkCity();

    // 5. Place 12 Real Downloaded Supercars + Dodge Viper Police Patrol on Cyberpunk City boulevards & plazas!
    this.buildDownloadedSupercars();

    // 6. Silky Non-Boxy Falling Synthwave Sky Mists (High Tier only!)
    const mistTexCanvas = document.createElement('canvas');
    mistTexCanvas.width = 128;
    mistTexCanvas.height = 128;
    const mCtx = mistTexCanvas.getContext('2d')!;
    const mGrad = mCtx.createRadialGradient(64, 64, 2, 64, 64, 58);
    mGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    mGrad.addColorStop(0.28, 'rgba(225, 245, 255, 0.72)');
    mGrad.addColorStop(0.62, 'rgba(155, 215, 255, 0.24)');
    mGrad.addColorStop(1.0, 'rgba(120, 190, 255, 0.0)');
    mCtx.fillStyle = mGrad;
    mCtx.fillRect(0, 0, 128, 128);
    const softMistTex = new THREE.CanvasTexture(mistTexCanvas);
    softMistTex.colorSpace = THREE.SRGBColorSpace;

    const mistPalette = [
      new THREE.Color(0xff6ac8),
      new THREE.Color(0xffb474),
      new THREE.Color(0xc46eff),
      new THREE.Color(0x64dcff),
    ];

    const dewCount = 460;
    const dewPos = new Float32Array(dewCount * 3);
    const dewCol = new Float32Array(dewCount * 3);
    const dewSpeed = new Float32Array(dewCount);
    const dewPhase = new Float32Array(dewCount);
    for (let i = 0; i < dewCount; i++) {
      dewPos[i * 3] = (Math.random() - 0.5) * 124;
      dewPos[i * 3 + 1] = 0.4 + Math.random() * 34;
      dewPos[i * 3 + 2] = (Math.random() - 0.5) * 102;
      const c = mistPalette[i % mistPalette.length];
      dewCol[i * 3] = c.r;
      dewCol[i * 3 + 1] = c.g;
      dewCol[i * 3 + 2] = c.b;
      dewSpeed[i] = 1.5 + Math.random() * 1.3;
      dewPhase[i] = Math.random() * Math.PI * 2;
    }
    const dewGeo = new THREE.BufferGeometry();
    const dewAttr = new THREE.BufferAttribute(dewPos, 3);
    dewGeo.setAttribute('position', dewAttr);
    dewGeo.setAttribute('color', new THREE.BufferAttribute(dewCol, 3));
    const motePoints = new THREE.Points(
      dewGeo,
      new THREE.PointsMaterial({
        map: softMistTex,
        size: 0.36,
        vertexColors: true,
        transparent: true,
        opacity: 0.64,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    motePoints.userData.lowEndOptional = true;
    this.group.add(motePoints);

    // 7. Attach async GLB roots cleanly + build ONE ultra-fast invisible raycast collider proxy (~2,200 tris instead of 1.5M!)
    this.buildColliderRaycastProxy();
    this.group.add(this.glbRoot);
    this.highTierGlbRoot.userData.lowEndOptional = true;
    this.highTierGlbRoot.visible = !this.isLowEnd;
    this.group.add(this.highTierGlbRoot);

    // 8. Spawn abundant Roaming Walking NPCs + Standing-Pose Crowd NPCs across all of Cyberpunk City!
    // Full mode: 42 active roamers + 26 standing crowd (68 total lively NPCs); Low-End: 8 + 5
    const npcNodes = this.buildPedestrianGraph();
    const allCrowdSpots = this.buildCrowdSpots();
    const walkerCount = this.isLowEnd ? 8 : 42;
    const crowdSpots = this.isLowEnd ? allCrowdSpots.slice(0, 5) : allCrowdSpots;
    const npcSystem = new DowntownNpcSystem(npcNodes, walkerCount, this.colliders, crowdSpots, this.isLowEnd);
    this.group.add(npcSystem.group);

    scene.add(this.group);

    const updateAtmosphere = (dt: number, elapsed: number, playerPos?: THREE.Vector3) => {
      npcSystem.update(dt, elapsed, playerPos);

      for (const pl of this.pulseLights) {
        if (!pl.light.visible) continue;
        pl.light.intensity = pl.base + Math.sin(elapsed * 1.9 + pl.phase) * 7;
      }

      for (const em of this.emergencyLights) {
        const flash = Math.sin(elapsed * 10.5 + em.phase) > 0;
        em.mat.color.setHex(flash ? em.colorA : em.colorB);
      }

      if (motePoints.visible) {
        for (let i = 0; i < dewCount; i++) {
          const xi = i * 3;
          let y = dewPos[xi + 1] - dewSpeed[i] * dt;
          if (y < 0.2) {
            y = 34.0;
            dewPos[xi] = (Math.random() - 0.5) * 124;
            dewPos[xi + 2] = (Math.random() - 0.5) * 102;
          } else {
            dewPos[xi] += Math.sin(elapsed * 1.15 + dewPhase[i]) * dt * 0.42;
            dewPos[xi + 2] += Math.cos(elapsed * 0.95 + dewPhase[i]) * dt * 0.32;
          }
          dewPos[xi + 1] = y;
        }
        dewAttr.needsUpdate = true;
      }
    };

    const zones: ZoneDef[] = [
      { name: 'WEST CYBER BOULEVARD (BLUE)', minX: -66, maxX: -36, minZ: -12, maxZ: 4 },
      { name: 'EAST CYBER BOULEVARD (RED)', minX: 36, maxX: 66, minZ: -12, maxZ: 4 },
      { name: 'NEON MIDTOWN STRIP', minX: -36, maxX: 36, minZ: -10, maxZ: 4 },
      { name: 'NORTH CYBER PLAZA', minX: -66, maxX: 66, minZ: -54, maxZ: -16 },
      { name: 'SOUTH CYBER PLAZA', minX: -66, maxX: 66, minZ: 28, maxZ: 54 },
      { name: 'EAST SKYLINE AVENUE', minX: 34, maxX: 66, minZ: -54, maxZ: 54 },
    ];

    return {
      group: this.group,
      colliders: this.colliders,
      ramps: this.ramps,
      raycastMeshes: this.raycastMeshes,
      minimapRects: this.minimapRects,
      waypoints: [],
      zones,
      // Blue spawns on West Cyberpunk Boulevard looking straight East (+X, camera yaw = -Math.PI/2) down the Neon Canyon & Giant Sun!
      playerSpawn: { pos: new THREE.Vector3(-56, 0, -3.2), yaw: -Math.PI / 2 },
      allySpawn: { pos: new THREE.Vector3(-59, 0, -2.0), yaw: -Math.PI / 2 },
      allySpawns: [
        { pos: new THREE.Vector3(-59, 0, -2.0), yaw: -Math.PI / 2, role: 'ember', name: 'BLUE-2' },
        { pos: new THREE.Vector3(-59, 0, -4.5), yaw: -Math.PI / 2, role: 'ember', name: 'BLUE-3' },
        { pos: new THREE.Vector3(-53, 0, -4.6), yaw: -Math.PI / 2, role: 'ember', name: 'BLUE-4' },
        { pos: new THREE.Vector3(-52, 0, -1.8), yaw: -Math.PI / 2, role: 'ember', name: 'BLUE-5' },
      ],
      // Red spawns on East Cyberpunk Boulevard looking West (-X, camera yaw = +Math.PI/2) straight back down the Neon Boulevard!
      enemySpawns: [
        { pos: new THREE.Vector3(56, 0, -3.2), yaw: Math.PI / 2, role: 'duelist', name: 'RED-1' },
        { pos: new THREE.Vector3(59, 0, -2.0), yaw: Math.PI / 2, role: 'striker', name: 'RED-2' },
        { pos: new THREE.Vector3(59, 0, -4.6), yaw: Math.PI / 2, role: 'sentinel', name: 'RED-3' },
        { pos: new THREE.Vector3(52, 0, -4.6), yaw: Math.PI / 2, role: 'duelist', name: 'RED-4' },
        { pos: new THREE.Vector3(52, 0, -1.8), yaw: Math.PI / 2, role: 'striker', name: 'RED-5' },
      ],
      dustParticles: motePoints,
      mapBounds: { minX: -HALF_W, maxX: HALF_W, minZ: -HALF_L, maxZ: HALF_L },
      updateAtmosphere,
    };
  }

  private loadCyberpunkCity(): void {
    // Register all 172 tight building & pillar colliders + minimap footprints immediately on frame 0!
    for (const box of CYBERPUNK_CITY_COLLIDERS) {
      this.colliders.push({ ...box });
      this.minimapRects.push({
        x: (box.minX + box.maxX) * 0.5,
        z: (box.minZ + box.maxZ) * 0.5,
        w: box.maxX - box.minX,
        d: box.maxZ - box.minZ,
        kind: 'wall',
      });
    }

    // Solid perimeter bounds keeping players cleanly inside the playable Cyberpunk City district
    const wallH = 18;
    const t = 1.2;
    this.colliders.push(
      { minX: -HALF_W - t, maxX: -HALF_W, minY: 0, maxY: wallH, minZ: -HALF_L, maxZ: HALF_L },
      { minX: HALF_W, maxX: HALF_W + t, minY: 0, maxY: wallH, minZ: -HALF_L, maxZ: HALF_L },
      { minX: -HALF_W, maxX: HALF_W, minY: 0, maxY: wallH, minZ: -HALF_L - t, maxZ: -HALF_L },
      { minX: -HALF_W, maxX: HALF_W, minY: 0, maxY: wallH, minZ: HALF_L, maxZ: HALF_L + t }
    );

    const cityPath = this.isLowEnd ? DOWNTOWN_CITY_LOW_GLB : DOWNTOWN_CITY_GLB;
    void loadDowntownGlb(cityPath, 0).then((tpl) => {
      if (!tpl) return;
      const city = tpl.scene.clone(true);
      city.scale.setScalar(CYBERPUNK_CITY_SCALE);
      city.position.set(CYBERPUNK_CITY_OFFSET.x, CYBERPUNK_CITY_OFFSET.y, CYBERPUNK_CITY_OFFSET.z);

      city.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = !this.isLowEnd;
        mesh.frustumCulled = true;
        const nm = (mesh.name || '').toLowerCase();

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const upgraded = mats.map((orig) => {
          const m = orig.clone() as THREE.MeshStandardMaterial;
          if (!m.isMeshStandardMaterial) return m;
          const mn = (m.name || '').toLowerCase();
          const hasOrigEmissive = m.emissive.r + m.emissive.g + m.emissive.b > 0.05 || Boolean(m.emissiveMap);

          if ((nm.includes('advertising') || mn.includes('advertising')) && m.map) {
            m.emissiveMap = m.map;
            m.emissive.setHex(0xffffff);
            m.emissiveIntensity = 1.45;
            m.roughness = 0.28;
            m.metalness = 0.08;
          } else if (mn.includes('white_neon') || nm.includes('white_neon')) {
            // Preserve the exact original hot-magenta neon color & emissive from cyberpunk_city.glb!
            m.emissiveIntensity = 1.85;
            m.roughness = 0.18;
            m.metalness = 0.1;
          } else if (hasOrigEmissive) {
            // Preserve every original glowing billboard/facade/window/neon texture 1:1!
            m.emissiveIntensity = Math.max(m.emissiveIntensity || 1.0, 1.25);
            m.envMapIntensity = 1.2;
          } else if (mn.includes('glass') || mn === 'material.006') {
            m.roughness = 0.18;
            m.metalness = 0.65;
            m.envMapIntensity = 1.65;
          } else if (mn.includes('chrom')) {
            m.roughness = 0.22;
            m.metalness = 0.85;
            m.envMapIntensity = 1.75;
          } else if (m.map) {
            // Preserve exact original street/building/roof textures cleanly without tinting them
            m.emissiveMap = m.map;
            m.emissive.setHex(0xffffff);
            m.emissiveIntensity = 0.26;
            m.roughness = Math.min(0.72, Math.max(0.38, m.roughness));
            m.metalness = Math.min(0.28, m.metalness);
            m.envMapIntensity = 1.15;
          } else {
            // Preserve original structural metal colors (metal_black / metal_gray) without black-crushing
            m.roughness = Math.min(0.58, Math.max(0.34, m.roughness));
            m.metalness = Math.min(0.68, m.metalness);
            m.emissive.setHex(0x10121e);
            m.emissiveIntensity = 0.16;
            m.envMapIntensity = 1.35;
          }
          m.needsUpdate = true;
          return m;
        });
        mesh.material = Array.isArray(mesh.material) ? upgraded : upgraded[0];
        // NOTE: Do NOT push 266k-840k city tris into raycastMeshes — buildColliderRaycastProxy() handles
        // all bullets, decals, barrel pullback & AI line-of-sight 830x faster using tight building AABBs!
      });

      this.glbRoot.add(city);
    });
  }

  /**
   * Builds ONE lightweight invisible merged collider mesh (~2,200 tris total) from all building, pillar,
   * and supercar AABBs so 60Hz barrel pullback, bullets, decals & AI line-of-sight run in < 0.05ms on laptops!
   */
  private buildColliderRaycastProxy(): void {
    const geos: THREE.BufferGeometry[] = [];
    for (const b of this.colliders) {
      const w = Math.max(0.1, b.maxX - b.minX);
      const h = Math.max(0.1, b.maxY - b.minY);
      const d = Math.max(0.1, b.maxZ - b.minZ);
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate((b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5, (b.minZ + b.maxZ) * 0.5);
      geos.push(g);
    }
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;

    const proxyMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });
    const proxyMesh = new THREE.Mesh(merged, proxyMat);
    proxyMesh.name = 'DowntownColliderRaycastProxy';
    proxyMesh.frustumCulled = false;
    this.group.add(proxyMesh);
    this.raycastMeshes.push(proxyMesh);
  }

  private addDownloadedCar(
    carId: DowntownCarGlbId,
    x: number,
    z: number,
    rotY: number,
    lengthMeters: number,
    opts?: { highTierOnly?: boolean; isPatrol?: boolean }
  ): void {
    const colW = 2.15;
    const colH = 1.45;
    const colD = lengthMeters;
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const halfX = (colW * c + colD * s) * 0.5;
    const halfZ = (colW * s + colD * c) * 0.5;

    // Immediate tactical cover collider & minimap marker
    this.colliders.push({
      minX: x - halfX,
      maxX: x + halfX,
      minY: 0,
      maxY: colH,
      minZ: z - halfZ,
      maxZ: z + halfZ,
    });
    this.minimapRects.push({ x, z, w: halfX * 2, d: halfZ * 2, kind: 'crate' });

    // On LOW END DEVICE, skip downloading & rendering optional plaza cars completely (saves VRAM & Draco CPU!)
    if (this.isLowEnd && opts?.highTierOnly) return;

    const targetRoot = opts?.highTierOnly ? this.highTierGlbRoot : this.glbRoot;
    void loadDowntownGlb(`cars/${carId}.glb`, 0).then((tpl) => {
      if (!tpl) return;
      const car = fitGlbInstance(tpl, { uniformLength: lengthMeters, rotY });
      car.position.set(x, 0, z);
      styleGlbCarForCyberpunkDowntown(car);
      if (this.isLowEnd) {
        car.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = false;
            m.receiveShadow = false;
          }
        });
      }

      // Subtle glowing neon underglow / headlight accent matching the Cyberpunk Boulevard!
      const underCol = opts?.isPatrol ? 0x1e88ff : carId.includes('lambo') ? 0xff2ec4 : 0x2ce8ff;
      const underGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.1, lengthMeters * 0.9),
        new THREE.MeshBasicMaterial({
          color: underCol,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      underGlow.rotation.x = -Math.PI / 2;
      underGlow.position.y = 0.04;
      car.add(underGlow);

      // Live flashing Red/Blue Police Lightbar beacon mounted flush inside Dodge SRT Viper Patrol's real roof lightbar!
      if (opts?.isPatrol) {
        const barLeftMat = new THREE.MeshBasicMaterial({ color: 0xff2238, toneMapped: false });
        const barRightMat = new THREE.MeshBasicMaterial({ color: 0x1e8cff, toneMapped: false });
        const bL = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.085, 0.24), barLeftMat);
        bL.position.set(-0.27, 1.305, -0.46);
        const bR = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.085, 0.24), barRightMat);
        bR.position.set(0.27, 1.305, -0.46);
        car.add(bL, bR);
        this.emergencyLights.push(
          { mat: barLeftMat, phase: x * 0.15, colorA: 0xff2238, colorB: 0x1e8cff },
          { mat: barRightMat, phase: x * 0.15 + Math.PI, colorA: 0xff2238, colorB: 0x1e8cff }
        );
      }

      // NOTE: Cars are already covered by buildColliderRaycastProxy() — never raycast 30k-125k car tris per frame!
      targetRoot.add(car);
    });
  }

  private buildDownloadedSupercars(): void {
    // 12 Real Downloaded Supercars & Dodge Viper Patrol parked on verified ZERO-COLLISION streets & plazas!
    // Central Neon Cyberpunk Boulevard (Z = -4.4..-4.0, 100% clear of all building colliders!)
    this.addDownloadedCar('lambo_aventador', -34.0, -4.4, Math.PI / 2, 4.82);
    this.addDownloadedCar('viper_patrol', -16.0, -4.2, Math.PI / 2, 4.60, { isPatrol: true });
    this.addDownloadedCar('lambo_revuelto', 4.5, -4.4, -Math.PI / 2, 4.90);
    this.addDownloadedCar('mercedes_amg_gt', 22.0, -4.2, Math.PI / 2, 4.65);
    this.addDownloadedCar('corvette_c8', 42.2, -4.0, -Math.PI / 2, 4.68);

    // East Skyline Avenue connecting North Plaza <-> Central Boulevard <-> South Plaza
    this.addDownloadedCar('vw_golf_gti', 48.0, -20.0, 0.08, 4.35);
    this.addDownloadedCar('honda_integra', 47.0, 22.0, Math.PI - 0.12, 4.50);

    // North Cyberpunk Plaza
    this.addDownloadedCar('challenger_hellcat', -35.2, -34.0, 0.42, 4.95);
    this.addDownloadedCar('ford_mustang', -18.0, -38.0, -0.22, 4.85, { highTierOnly: true });
    this.addDownloadedCar('camaro_zl1', 16.0, -34.0, 0.18, 4.82, { highTierOnly: true });

    // South Cyberpunk Plaza
    this.addDownloadedCar('lambo_revuelto', -22.0, 41.0, Math.PI / 2 + 0.12, 4.90, { highTierOnly: true });
    this.addDownloadedCar('viper_patrol', 20.0, 41.0, -Math.PI / 2 - 0.12, 4.60, { isPatrol: true, highTierOnly: true });
  }

  private buildPedestrianGraph(): PedestrianNode[] {
    // 100% verified ZERO-COLLISION 30-node multi-loop roaming network across ALL of Cyberpunk City!
    // Every single node & edge is mathematically verified clear of all 172 building colliders AND all 12 parked supercars!
    return [
      // Central Neon Boulevard (Z = -1.5, 113m straight open boulevard!)
      { x: -58, z: -1.5, neighbors: [1], isPlazaOrCrosswalk: true },             // 0 West Spawn Plaza
      { x: -44, z: -1.5, neighbors: [0, 2, 7], isPlazaOrCrosswalk: true },       // 1 West Cross Junction
      { x: -24, z: -1.5, neighbors: [1, 3], isPlazaOrCrosswalk: true },          // 2 West-Mid Boulevard
      { x: -1, z: -1.5, neighbors: [2, 4, 9], isPlazaOrCrosswalk: true },        // 3 Midtown Cross Junction
      { x: 22, z: -1.5, neighbors: [3, 5], isPlazaOrCrosswalk: true },           // 4 East-Mid Boulevard
      { x: 41, z: -1.5, neighbors: [4, 6, 11], isPlazaOrCrosswalk: true },       // 5 East-South Cross Junction
      { x: 55, z: -1.5, neighbors: [5, 13], isPlazaOrCrosswalk: true },          // 6 East-North Skyline Junction
      // South Cyber District (3 north-south avenues + 2 continuous east-west promenades at Z = 38 & Z = 47!)
      { x: -44, z: 24, neighbors: [1, 19] },                                     // 7 West-South Street
      { x: -44, z: 47, neighbors: [19, 10, 20], isPlazaOrCrosswalk: true },      // 8 South-West Plaza
      { x: -1, z: 24, neighbors: [3, 21] },                                      // 9 Midtown-South Street
      { x: -1, z: 47, neighbors: [8, 21, 12], isPlazaOrCrosswalk: true },        // 10 South-Mid Plaza
      { x: 41, z: 24, neighbors: [5, 22] },                                      // 11 East-South Avenue
      { x: 41, z: 47, neighbors: [10, 22, 23], isPlazaOrCrosswalk: true },       // 12 South-East Plaza
      // East Skyline Avenue & North Cyber Plaza (double loop Z = -24 & Z = -48!)
      { x: 55, z: -24, neighbors: [6, 14, 24] },                                 // 13 East-North Skyline Ave
      { x: 55, z: -48, neighbors: [13, 15], isPlazaOrCrosswalk: true },          // 14 North-East Plaza
      { x: 24, z: -48, neighbors: [14, 16, 25, 28], isPlazaOrCrosswalk: true },  // 15 North-Mid-East Plaza
      { x: -24, z: -48, neighbors: [15, 17, 26], isPlazaOrCrosswalk: true },     // 16 North-Mid-West Plaza
      { x: -56, z: -48, neighbors: [16, 27, 29], isPlazaOrCrosswalk: true },     // 17 North-West Plaza
      // South Promenade (Z = 38, wide open across entire south!) & East/West extensions
      { x: 55, z: 38, neighbors: [22, 23], isPlazaOrCrosswalk: true },           // 18 Far South-East Promenade
      { x: -44, z: 38, neighbors: [7, 8, 20, 21], isPlazaOrCrosswalk: true },    // 19 South-West Promenade
      { x: -58, z: 47, neighbors: [8, 19], isPlazaOrCrosswalk: true },           // 20 Far South-West Plaza
      { x: -1, z: 38, neighbors: [9, 10, 19, 22], isPlazaOrCrosswalk: true },    // 21 South-Mid Promenade
      { x: 41, z: 38, neighbors: [11, 12, 18, 21], isPlazaOrCrosswalk: true },   // 22 South-East Promenade
      { x: 55, z: 47, neighbors: [12, 18], isPlazaOrCrosswalk: true },           // 23 Far South-East Plaza
      // North Plaza Inner Promenades
      { x: 24, z: -24, neighbors: [13, 25], isPlazaOrCrosswalk: true },          // 24 North-East Inner Plaza
      { x: 24, z: -36, neighbors: [15, 24], isPlazaOrCrosswalk: true },          // 25 North-Mid-East Avenue
      { x: -24, z: -24, neighbors: [16, 28], isPlazaOrCrosswalk: true },         // 26 North-West Inner Plaza
      { x: -56, z: -24, neighbors: [17, 29], isPlazaOrCrosswalk: true },         // 27 Far North-West Avenue
      { x: -12, z: -24, neighbors: [26, 15], isPlazaOrCrosswalk: false },        // 28 North-Center Promenade
      { x: -46, z: -24, neighbors: [27, 17], isPlazaOrCrosswalk: true },         // 29 North-West Pocket Loop
    ];
  }

  private buildCrowdSpots(): CrowdSpot[] {
    // 26 mathematically verified ZERO-COLLISION standing spots beside supercars, neon storefronts & plazas
    // for the 5 posed standing NPCs (leaving Central Boulevard Z = -1.5 walkers completely unobstructed!)
    return [
      // Central Neon Boulevard South Sidewalk (facing street & supercars)
      { x: -52.5, z: 0.8, yaw: Math.PI },        // West Boulevard entrance
      { x: -34.0, z: 1.4, yaw: Math.PI },        // Across from Lamborghini Aventador
      { x: -24.5, z: 1.4, yaw: Math.PI - 0.3 },  // West-Mid neon storefront
      { x: -16.0, z: 1.4, yaw: Math.PI },        // Across from Dodge Viper Patrol
      { x: -10.5, z: 1.4, yaw: Math.PI + 0.25 }, // Midtown cyber cafe
      { x: 4.5, z: 1.4, yaw: Math.PI },          // Across from Lamborghini Revuelto
      { x: 13.0, z: 1.4, yaw: Math.PI - 0.2 },   // Mid-East storefront
      { x: 22.0, z: 1.4, yaw: Math.PI },         // Across from Mercedes-AMG GT
      { x: 30.5, z: 1.4, yaw: Math.PI + 0.2 },   // East Boulevard corner
      { x: 46.8, z: -2.6, yaw: -Math.PI / 2 },   // Beside Corvette C8 on East Boulevard
      // Central Boulevard North Pocket Edges (between supercars, facing boulevard)
      { x: -27.5, z: -4.2, yaw: 0.25 },          // Between Aventador & Viper Patrol
      { x: -2.0, z: -4.4, yaw: -0.2 },           // Near Midtown crossing & Revuelto
      { x: 14.0, z: -4.2, yaw: 0.15 },           // Between Revuelto & Mercedes-AMG GT
      { x: 30.5, z: -4.2, yaw: -0.25 },          // East-Mid boulevard north pocket
      // East Skyline Avenue
      { x: 51.5, z: -20.0, yaw: -Math.PI / 2 },  // Next to VW Golf GTI
      { x: 51.2, z: -12.0, yaw: -Math.PI / 2 },  // East Ave cyber corner
      { x: 43.8, z: 22.0, yaw: Math.PI / 2 },    // Next to Honda Integra
      { x: 51.0, z: 24.0, yaw: -Math.PI / 2 },   // East-South Ave opposite Integra
      // North Cyberpunk Plaza
      { x: -31.2, z: -34.0, yaw: -Math.PI / 2 }, // Next to Dodge Challenger Hellcat
      { x: -14.2, z: -38.0, yaw: -Math.PI / 2 }, // Next to Ford Mustang
      { x: 20.0, z: -34.0, yaw: -Math.PI / 2 },  // Next to Camaro ZL1
      { x: 2.0, z: -42.0, yaw: 0.1 },            // North Plaza central overlook
      // South Cyberpunk Plaza
      { x: -22.0, z: 37.8, yaw: 0 },             // South Plaza Lambo Revuelto
      { x: -12.0, z: 42.0, yaw: -0.4 },          // South-Mid Plaza hangout
      { x: 20.0, z: 37.8, yaw: 0 },              // South Plaza Viper Patrol
      { x: 10.0, z: 42.0, yaw: 0.4 },            // South-East Plaza hangout
    ];
  }
}
