import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AABB, MinimapRect, RampCollider, ZoneDef } from '../types';
import { BuiltLevel } from './LevelBuilder';
import { DowntownTexturePack, FacadeStyle, getDowntownTextures } from './DowntownTextures';
import { DowntownNpcSystem, PedestrianNode } from './DowntownNpcs';
import {
  DOWNTOWN_TREE_GLBS,
  DowntownCarGlbId,
  fitGlbInstance,
  loadDowntownGlb,
  preloadDowntownGlbs,
  styleGlbCarForMidnightNyc,
  styleGlbTreeForMidnightNyc,
} from './DowntownGlbAssets';

const HALF_W = 50; // 100m x 100m = 10,000 m² playable Midtown Manhattan (3.08x Vikendi TDM!)
const HALF_L = 50;
const DECK_Y = 4.2;
const SLAB_THICK = 0.34;
const PODIUM_H = 4.6;

type CrownSilhouette =
  | 'artDecoTerrace'
  | 'vanderbiltSpire'
  | 'citigroupSlant'
  | 'rockefellerSlab'
  | 'beauxArtsLoft'
  | 'twinSpireTower';

/**
 * Photorealistic Midnight Neon-Cyberpunk Midtown Manhattan TDM Arena ("DOWNTOWN"):
 * - Every playable building & all 22 skyline skyscrapers match the Chrysler & Empire State Building's
 *   photorealistic glowing-window detail, stepped Art Deco setbacks, glowing crowns & vibrant Broadway storefronts!
 * - 14 unique sculpted CC0 3D `.glb` NYC street vehicles (taxi, police, sedan, sports, SUV, van, delivery, ambulance, firetruck, garbage truck, truck, cyber hypercar!)
 * - 10 unique sculpted CC0 3D `.glb` organic tree species across Central Park & Manhattan avenues
 * - 11 unique rigged animated CC0 3D `.glb` civilian pedestrians (26 in High Tier, 12 in LOW END DEVICE)
 * - Real 3D `.glb` NYC traffic lights, double streetlights, stacked ACs & rooftop comm antennas
 * - Vibrant Times Square with One Times Square (Crystal Ball), Curved Cylindrical Corner LED Drum,
 *   14 photorealistic Times Square LED billboards, vertical neon blade signs & climbable TKTS red glass stairs
 * - Iconic 162m Empire State Building & 150m Chrysler Building towering over the luminous midnight skyline!
 */
export class DowntownLevelBuilder {
  private group = new THREE.Group();
  private glbRoot = new THREE.Group(); // Dedicated non-batched root for core async 3D GLBs!
  private highTierGlbRoot = new THREE.Group(); // High-Graphics-Only async GLB root (auto-hidden in LOW END DEVICE!)
  private colliders: AABB[] = [];
  private ramps: RampCollider[] = [];
  private raycastMeshes: THREE.Object3D[] = [];
  private minimapRects: MinimapRect[] = [];
  private dTex: DowntownTexturePack;

  private facadeMats = new Map<FacadeStyle, THREE.MeshStandardMaterial>();
  private matStorefrontModern: THREE.MeshStandardMaterial;
  private matStorefrontMasonry: THREE.MeshStandardMaterial;
  private wideBillboardMats: THREE.MeshBasicMaterial[] = [];
  private verticalBillboardMats: THREE.MeshBasicMaterial[] = [];
  private bladeSignMats: THREE.MeshBasicMaterial[] = [];
  private colorMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private basicMatCache = new Map<number, THREE.MeshBasicMaterial>();
  private pulseLights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];

  constructor() {
    this.dTex = getDowntownTextures();
    preloadDowntownGlbs();

    const styles: FacadeStyle[] = [
      'midnightGlass',
      'artDecoLimestone',
      'chryslerChrome',
      'midtownMasonry',
      'cobaltGlass',
      'bronzeArtDeco',
      'obsidianSteel',
      'brownstoneNight',
    ];
    for (const st of styles) {
      const pair = this.dTex.facades[st];
      const isGlassy =
        st === 'midnightGlass' || st === 'cobaltGlass' || st === 'chryslerChrome' || st === 'obsidianSteel';
      this.facadeMats.set(
        st,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: pair.map,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: pair.emissiveMap,
          emissiveIntensity: 1.28,
          roughness: isGlassy ? 0.26 : 0.68,
          metalness: isGlassy ? 0.54 : 0.16,
          envMapIntensity: isGlassy ? 1.3 : 0.62,
        })
      );
    }

    this.matStorefrontModern = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.storefrontModern.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.dTex.storefrontModern.emissiveMap,
      emissiveIntensity: 1.32,
      roughness: 0.34,
      metalness: 0.36,
    });
    this.matStorefrontMasonry = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.storefrontMasonry.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.dTex.storefrontMasonry.emissiveMap,
      emissiveIntensity: 1.24,
      roughness: 0.64,
      metalness: 0.18,
    });

    for (const bTex of this.dTex.wideBillboards) {
      this.wideBillboardMats.push(new THREE.MeshBasicMaterial({ map: bTex, toneMapped: false }));
    }
    for (const vTex of this.dTex.verticalBillboards) {
      this.verticalBillboardMats.push(new THREE.MeshBasicMaterial({ map: vTex, toneMapped: false }));
    }
    for (const sTex of this.dTex.bladeSigns) {
      this.bladeSignMats.push(new THREE.MeshBasicMaterial({ map: sTex, toneMapped: false }));
    }
  }

  private getColorMat(hex: number, rough = 0.62, metal = 0.2, emissiveHex = 0, emInt = 0): THREE.MeshStandardMaterial {
    const k = `${hex}_${rough}_${metal}_${emissiveHex}_${emInt}`;
    let m = this.colorMatCache.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: metal,
        emissive: emissiveHex ? new THREE.Color(emissiveHex) : undefined,
        emissiveIntensity: emInt,
      });
      this.colorMatCache.set(k, m);
    }
    return m;
  }

  private getBasicMat(hex: number): THREE.MeshBasicMaterial {
    let m = this.basicMatCache.get(hex);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
      this.basicMatCache.set(hex, m);
    }
    return m;
  }

  private markHighTier(obj: THREE.Object3D): void {
    obj.userData.lowEndOptional = true;
  }

  private makeScaledBoxGeo(w: number, h: number, d: number, tileW = 16, tileH = 26): THREE.BoxGeometry {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.getAttribute('uv');
    const uX = Math.max(0.5, Math.round((d / tileW) * 2) / 2);
    const uZ = Math.max(0.5, Math.round((w / tileW) * 2) / 2);
    const vH = Math.max(0.5, h / tileH);
    const faceScales: Array<[number, number]> = [
      [uX, vH],
      [uX, vH],
      [Math.max(1, w / tileW), Math.max(1, d / tileW)],
      [Math.max(1, w / tileW), Math.max(1, d / tileW)],
      [uZ, vH],
      [uZ, vH],
    ];
    for (let f = 0; f < 6; f++) {
      const [su, sv] = faceScales[f];
      for (let v = 0; v < 4; v++) {
        const idx = f * 4 + v;
        uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  private addSolidBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    opts?: {
      minimapKind?: 'wall' | 'pillar' | 'crate' | 'arch';
      castShadow?: boolean;
      receiveShadow?: boolean;
      rotY?: number;
      noCollider?: boolean;
      noRaycast?: boolean;
      tileW?: number;
      tileH?: number;
      highTierOnly?: boolean;
    }
  ): THREE.Mesh {
    const geo =
      opts?.tileW && opts?.tileH
        ? this.makeScaledBoxGeo(w, h, d, opts.tileW, opts.tileH)
        : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (opts?.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow = opts?.castShadow ?? false;
    mesh.receiveShadow = opts?.receiveShadow ?? true;
    if (opts?.highTierOnly) mesh.userData.lowEndOptional = true;
    this.group.add(mesh);
    if (!opts?.noRaycast) {
      this.raycastMeshes.push(mesh);
    }

    if (!opts?.noCollider) {
      let halfW = w * 0.5;
      let halfD = d * 0.5;
      if (opts?.rotY) {
        const c = Math.abs(Math.cos(opts.rotY));
        const s = Math.abs(Math.sin(opts.rotY));
        halfW = (w * c + d * s) * 0.5;
        halfD = (w * s + d * c) * 0.5;
      }
      this.colliders.push({
        minX: x - halfW,
        maxX: x + halfW,
        minY: y - h * 0.5,
        maxY: y + h * 0.5,
        minZ: z - halfD,
        maxZ: z + halfD,
      });
    }

    if (opts?.minimapKind) {
      this.minimapRects.push({ x, z, w, d, kind: opts.minimapKind });
    }
    return mesh;
  }

  private addSmoothStaircase(
    centerX: number,
    startZ: number,
    endZ: number,
    width: number,
    topY: number,
    matStep: THREE.Material,
    matRail: THREE.Material,
    matGlow: THREE.Material,
    solidUnderneath = false
  ): void {
    const dir = Math.sign(endZ - startZ);
    const landingLen = 0.62;
    const slopeEndZ = endZ - dir * landingLen;
    const steps = 16;
    const stepRise = topY / steps;
    const slopeRun = slopeEndZ - startZ;
    const stepRun = slopeRun / steps;
    const absRun = Math.abs(stepRun);

    const rampMinZ = Math.min(startZ, slopeEndZ);
    const rampMaxZ = Math.max(startZ, slopeEndZ);
    this.ramps.push({
      minX: centerX - width * 0.5,
      maxX: centerX + width * 0.5,
      minZ: rampMinZ,
      maxZ: rampMaxZ,
      yAtMinZ: startZ < slopeEndZ ? 0 : topY,
      yAtMaxZ: startZ < slopeEndZ ? topY : 0,
    });

    for (let i = 0; i < steps; i++) {
      const sy = (i + 1) * stepRise;
      const cz = startZ + (i + 0.5) * stepRun;
      // Solid full-height risers for TKTS (zero underside gaps!) or overlapping thick treads for open skybridge stairs (zero diagonal bullet leaks!)
      const stepH = solidUnderneath ? sy : Math.min(sy, stepRise * 1.75);
      const stepY = solidUnderneath ? sy * 0.5 : sy - stepH * 0.5;
      this.addSolidBox(centerX, stepY, cz, width, stepH, absRun + 0.06, matStep, {
        noCollider: true,
      });
      if (i % 2 === 0 || i === steps - 1) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(width - 0.14, 0.032, 0.055), matGlow);
        strip.position.set(centerX, sy + 0.012, cz - dir * (absRun * 0.44));
        this.group.add(strip);
      }
    }

    const landingCenterZ = (slopeEndZ + endZ) * 0.5;
    this.addSolidBox(centerX, topY - SLAB_THICK * 0.5, landingCenterZ, width, SLAB_THICK, landingLen + 0.08, matStep, {
      noCollider: true,
    });

    const midZ = (startZ + slopeEndZ) * 0.5;
    const slopeLen = Math.hypot(Math.abs(slopeRun), topY);
    const slopeAngle = Math.atan2(topY, Math.abs(slopeRun)) * (slopeRun < 0 ? 1 : -1);
    const fullMinZ = Math.min(startZ, endZ);
    const fullMaxZ = Math.max(startZ, endZ);
    for (const side of [-1, 1]) {
      const rx = centerX + side * (width * 0.5 + 0.08);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, slopeLen), matRail);
      rail.position.set(rx, topY * 0.5 + 0.94, midZ);
      rail.rotation.x = slopeAngle;
      this.group.add(rail);

      const railGlow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, slopeLen), matGlow);
      railGlow.position.set(rx, topY * 0.5 + 1.01, midZ);
      railGlow.rotation.x = slopeAngle;
      this.group.add(railGlow);

      this.colliders.push({
        minX: rx - 0.09,
        maxX: rx + 0.09,
        minY: 0.45,
        maxY: topY + 1.05,
        minZ: fullMinZ + 0.16,
        maxZ: fullMaxZ - 0.16,
      });
    }
  }

  public build(scene: THREE.Scene): BuiltLevel {
    // 1. Cinematic Midnight Cobalt-Indigo Manhattan Sky Dome
    const skyGeo = new THREE.SphereGeometry(390, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#071532') },
        midColor: { value: new THREE.Color('#122c5c') },
        lowColor: { value: new THREE.Color('#1f4582') },
        horizonColor: { value: new THREE.Color('#2d5da0') },
        glowDir: { value: new THREE.Vector3(-0.1, 0.12, -0.95).normalize() },
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
        uniform vec3 lowColor;
        uniform vec3 horizonColor;
        uniform vec3 glowDir;
        varying vec3 vWorldPos;
        void main() {
          vec3 d = normalize(vWorldPos);
          float h = d.y;
          vec3 col = mix(horizonColor, lowColor, smoothstep(-0.02, 0.14, h));
          col = mix(col, midColor, smoothstep(0.12, 0.36, h));
          col = mix(col, topColor, smoothstep(0.32, 0.78, h));
          float tsGlow = max(dot(d, glowDir), 0.0);
          col += vec3(0.08, 0.24, 0.42) * pow(tsGlow, 3.0) * (1.0 - smoothstep(0.0, 0.42, h));
          col += vec3(0.22, 0.06, 0.24) * pow(max(dot(d, vec3(0.5, 0.1, 0.8)), 0.0), 4.0) * (1.0 - smoothstep(0.0, 0.35, h));
          float cloudBand = smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.34, 0.62, h));
          float w = sin(d.x * 7.5 + d.z * 4.2) * cos(d.z * 6.0 - d.x * 3.8);
          col = mix(col, vec3(0.14, 0.26, 0.46), cloudBand * smoothstep(0.25, 0.78, w * 0.5 + 0.5) * 0.48);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.group.add(new THREE.Mesh(skyGeo, skyMat));
    scene.background = new THREE.Color('#091834');
    scene.fog = new THREE.FogExp2(0x0b1b38, 0.0029);

    // 2. Crisp Cinematic Manhattan Night Lighting
    const hemi = new THREE.HemisphereLight(0x88bdf8, 0x223354, 1.24);
    hemi.userData.baseIntensity = 1.24;
    this.group.add(hemi);

    const moonDir = new THREE.DirectionalLight(0xaad2ff, 1.55);
    moonDir.position.set(-46, 68, 38);
    moonDir.castShadow = true;
    moonDir.shadow.mapSize.set(1024, 1024);
    moonDir.shadow.camera.near = 6;
    moonDir.shadow.camera.far = 175;
    moonDir.shadow.camera.left = -56;
    moonDir.shadow.camera.right = 56;
    moonDir.shadow.camera.top = 56;
    moonDir.shadow.camera.bottom = -56;
    moonDir.shadow.bias = -0.0008;
    this.group.add(moonDir);

    const skylineRim = new THREE.DirectionalLight(0x46b8ff, 0.72);
    skylineRim.position.set(44, 34, -48);
    this.group.add(skylineRim);

    const addCityGlow = (x: number, y: number, z: number, color: number, intensity: number, dist: number) => {
      const pl = new THREE.PointLight(color, intensity, dist, 1.35);
      pl.position.set(x, y, z);
      pl.userData.lowEndOptional = true;
      this.group.add(pl);
      this.pulseLights.push({ light: pl, base: intensity, phase: (x + z) * 0.12 });
    };
    addCityGlow(-2, 12, 3, 0x2ce8ff, 95, 52);
    addCityGlow(-16, 11, 2, 0xff3cb8, 86, 48);
    addCityGlow(-22, 10, -4, 0x30c8ff, 78, 44);
    addCityGlow(8, 10, 14, 0xff4678, 70, 42);
    addCityGlow(19, 10, 12, 0x46a8ff, 68, 44);
    addCityGlow(24, 9, -32, 0x38d8a8, 52, 40);
    addCityGlow(-18, 9, 26, 0xff9e44, 58, 38);
    addCityGlow(20, 9, -12, 0xa858ff, 54, 38);

    // 3. Clean Midtown Manhattan Streets, Wet Asphalt, "ONLY" Decals, Crosswalks & Curbs
    this.buildStreetsAndCrosswalks();

    // 4. Vibrant Times Square Showpiece (One Times Square, Curved LED Drum, TKTS Red Steps & Billboards!)
    this.buildTimesSquare();

    // 5. Night-Lit Central Park Oasis (Pond, Arched Stone Bow Bridge, Carved Granite Walls & 22 Real GLB Trees!)
    this.buildCentralPark();

    // 6. 9 Real Sculpted 3D GLB Midtown City Blocks, Photorealistic Billboards, Blade Signs, Alleys & Skybridges!
    this.buildMidtownBlocksAndAlleys();

    // 7. 14 Real Sculpted 3D GLB NYC Street Vehicles!
    this.buildUniqueGlbVehicles();

    // 8. Real GLB Streetlights, GLB Traffic Lights, NYC Street Kitbash Details & 12 Real GLB Avenue Trees!
    this.buildStreetFurnitureAndAvenueTrees();
    this.buildNycKitbashStreetDetails();

    // 9. Iconic 162m Empire State Building, 150m Chrysler Building + 22 Real GLB Midtown Skyline Skyscrapers!
    this.buildManhattanSkyline();

    // 10. Silky Non-Boxy Falling Midnight Sky Mists & Glowing Mist Droplets (vibrant like Vikendi snow — High Tier only!)
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

    // Layer A: Soft feathery falling atmospheric mist wisps drifting down through the Manhattan canyon
    const wispCount = 210;
    const wispPos = new Float32Array(wispCount * 3);
    const wispCol = new Float32Array(wispCount * 3);
    const wispPhase = new Float32Array(wispCount);
    const mistPalette = [
      new THREE.Color(0x74dcff), // Electric Times Square Cyan Mist
      new THREE.Color(0xa6c8ff), // Midnight Silver-Blue Mist
      new THREE.Color(0xd87eff), // Subtle Neon Violet-Magenta Mist
      new THREE.Color(0x5ef0e8), // Cool Aqua City Haze
    ];
    for (let i = 0; i < wispCount; i++) {
      wispPos[i * 3] = (Math.random() - 0.5) * 96;
      wispPos[i * 3 + 1] = 0.6 + Math.random() * 34;
      wispPos[i * 3 + 2] = (Math.random() - 0.5) * 96;
      const c = mistPalette[i % mistPalette.length];
      wispCol[i * 3] = c.r;
      wispCol[i * 3 + 1] = c.g;
      wispCol[i * 3 + 2] = c.b;
      wispPhase[i] = Math.random() * Math.PI * 2;
    }
    const wispGeo = new THREE.BufferGeometry();
    const wispAttr = new THREE.BufferAttribute(wispPos, 3);
    wispGeo.setAttribute('position', wispAttr);
    wispGeo.setAttribute('color', new THREE.BufferAttribute(wispCol, 3));
    const wispPoints = new THREE.Points(
      wispGeo,
      new THREE.PointsMaterial({
        map: softMistTex,
        size: 2.35,
        vertexColors: true,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    wispPoints.userData.lowEndOptional = true;
    this.group.add(wispPoints);

    // Layer B: Luminous fine circular falling sky mist droplets (smooth soft circles — ZERO boxy squares!)
    const dewCount = 540;
    const dewPos = new Float32Array(dewCount * 3);
    const dewCol = new Float32Array(dewCount * 3);
    const dewSpeed = new Float32Array(dewCount);
    const dewPhase = new Float32Array(dewCount);
    for (let i = 0; i < dewCount; i++) {
      dewPos[i * 3] = (Math.random() - 0.5) * 96;
      dewPos[i * 3 + 1] = 0.4 + Math.random() * 34;
      dewPos[i * 3 + 2] = (Math.random() - 0.5) * 96;
      const c = mistPalette[(i * 3) % mistPalette.length];
      dewCol[i * 3] = c.r;
      dewCol[i * 3 + 1] = c.g;
      dewCol[i * 3 + 2] = c.b;
      dewSpeed[i] = 1.65 + Math.random() * 1.45;
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
        size: 0.38,
        vertexColors: true,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    motePoints.userData.lowEndOptional = true;
    this.group.add(motePoints);

    // 11. Batch static geometric meshes (streets, crosswalks, billboards, Empire State, Chrysler, TKTS, skybridges)
    this.batchStaticMeshes();

    // 12. Attach dedicated async 3D GLB roots AFTER batching (highTierGlbRoot auto-hides in LOW END DEVICE!)
    this.group.add(this.glbRoot);
    this.highTierGlbRoot.userData.lowEndOptional = true;
    this.group.add(this.highTierGlbRoot);

    // 13. Spawn 26 Rigged Animated 3D GLB GTA-Style Unkillable Civilians!
    const npcNodes = this.buildPedestrianGraph();
    const npcSystem = new DowntownNpcSystem(npcNodes, 26, this.colliders);
    this.group.add(npcSystem.group);

    scene.add(this.group);

    const updateAtmosphere = (dt: number, elapsed: number, playerPos?: THREE.Vector3) => {
      npcSystem.update(dt, elapsed, playerPos);

      for (const pl of this.pulseLights) {
        if (!pl.light.visible) continue;
        pl.light.intensity = pl.base + Math.sin(elapsed * 1.9 + pl.phase) * 7;
      }

      if (wispPoints.visible) {
        const wDy = dt * 0.85;
        for (let i = 0; i < wispCount; i++) {
          const xi = i * 3;
          let y = wispPos[xi + 1] - wDy;
          if (y < 0.4) {
            y = 33.5;
            wispPos[xi] = (Math.random() - 0.5) * 96;
            wispPos[xi + 2] = (Math.random() - 0.5) * 96;
          } else {
            wispPos[xi] += Math.sin(elapsed * 0.6 + wispPhase[i]) * dt * 0.48;
            wispPos[xi + 2] += Math.cos(elapsed * 0.5 + wispPhase[i]) * dt * 0.35;
          }
          wispPos[xi + 1] = y;
        }
        wispAttr.needsUpdate = true;
      }

      if (motePoints.visible) {
        for (let i = 0; i < dewCount; i++) {
          const xi = i * 3;
          let y = dewPos[xi + 1] - dewSpeed[i] * dt;
          if (y < 0.2) {
            y = 34.0;
            dewPos[xi] = (Math.random() - 0.5) * 96;
            dewPos[xi + 2] = (Math.random() - 0.5) * 96;
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
      { name: 'EMPIRE PLAZA (BLUE SPAWN)', minX: -50, maxX: 50, minZ: 36, maxZ: 50 },
      { name: 'CENTRAL PARK GATE (RED SPAWN)', minX: -50, maxX: 50, minZ: -50, maxZ: -39 },
      { name: 'CENTRAL PARK OASIS', minX: 2, maxX: 50, minZ: -44, maxZ: -22 },
      { name: 'TIMES SQUARE PLAZA', minX: -14, maxX: 15, minZ: -16, maxZ: 22 },
      { name: 'BROADWAY AVENUE', minX: -27, maxX: -11, minZ: -40, maxZ: 38 },
      { name: '5TH AVENUE', minX: 13, maxX: 27, minZ: -24, maxZ: 38 },
      { name: 'WEST THEATER DISTRICT', minX: -50, maxX: -24, minZ: -40, maxZ: 36 },
      { name: 'CHRYSLER EAST DISTRICT', minX: 25, maxX: 50, minZ: -22, maxZ: 36 },
    ];

    return {
      group: this.group,
      colliders: this.colliders,
      ramps: this.ramps,
      raycastMeshes: this.raycastMeshes,
      minimapRects: this.minimapRects,
      waypoints: [],
      zones,
      playerSpawn: { pos: new THREE.Vector3(0, 0, 45.5), yaw: 0 },
      allySpawn: { pos: new THREE.Vector3(-5.5, 0, 45.5), yaw: 0 },
      allySpawns: [
        { pos: new THREE.Vector3(-5.5, 0, 45.5), yaw: 0, role: 'ember', name: 'BLUE-2' },
        { pos: new THREE.Vector3(5.5, 0, 45.5), yaw: 0, role: 'ember', name: 'BLUE-3' },
        { pos: new THREE.Vector3(-11.0, 0, 44.5), yaw: 0, role: 'ember', name: 'BLUE-4' },
        { pos: new THREE.Vector3(11.0, 0, 44.5), yaw: 0, role: 'ember', name: 'BLUE-5' },
      ],
      enemySpawns: [
        { pos: new THREE.Vector3(0, 0, -46.0), yaw: Math.PI, role: 'duelist', name: 'RED-1' },
        { pos: new THREE.Vector3(-5.5, 0, -46.0), yaw: Math.PI, role: 'striker', name: 'RED-2' },
        { pos: new THREE.Vector3(5.5, 0, -46.0), yaw: Math.PI, role: 'sentinel', name: 'RED-3' },
        { pos: new THREE.Vector3(-11.0, 0, -46.0), yaw: Math.PI, role: 'duelist', name: 'RED-4' },
        { pos: new THREE.Vector3(11.0, 0, -46.0), yaw: Math.PI, role: 'striker', name: 'RED-5' },
      ],
      dustParticles: motePoints,
      mapBounds: { minX: -HALF_W, maxX: HALF_W, minZ: -HALF_L, maxZ: HALF_L },
      updateAtmosphere,
    };
  }

  // =========================================================================
  // 3. MANHATTAN STREETS, WET ASPHALT, "ONLY" DECALS, CROSSWALKS & CURBS
  // =========================================================================
  private buildStreetsAndCrosswalks(): void {
    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(390, 390),
      this.getColorMat(0x0b1324, 0.86, 0.12)
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.09;
    this.group.add(outerGround);

    const matSidewalk = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.sidewalk,
      emissive: new THREE.Color(0x0f1a30),
      emissiveIntensity: 0.36,
      roughness: 0.54,
      metalness: 0.22,
    });
    const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 2, HALF_L * 2 + 2), matSidewalk);
    baseFloor.rotation.x = -Math.PI / 2;
    baseFloor.receiveShadow = true;
    this.group.add(baseFloor);
    this.raycastMeshes.push(baseFloor);

    const makeRoadMat = (tex: THREE.CanvasTexture, rx: number, ry: number) => {
      const t = tex.clone();
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: t,
        emissive: new THREE.Color(0x0b1628),
        emissiveIntensity: 0.35,
        roughness: 0.34,
        metalness: 0.32,
      });
    };

    const addRoad = (x: number, z: number, w: number, d: number, vertical: boolean) => {
      const mat = makeRoadMat(
        vertical ? this.dTex.roadAvenue : this.dTex.roadCross,
        vertical ? 1 : Math.max(1, Math.round(w / 10)),
        vertical ? Math.max(1, Math.round(d / 10)) : 1
      );
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.014, z);
      road.receiveShadow = true;
      this.group.add(road);
    };

    addRoad(-18, 0, 11.8, 96, true);
    addRoad(19.5, 13, 9.8, 68, true);
    addRoad(0, 4.5, 96, 10.2, false);
    addRoad(0, 35.5, 84, 7.2, false);
    addRoad(-10, -19, 64, 6.8, false);

    const matCurb = this.getColorMat(0x3a465c, 0.65, 0.18);
    const addCurb = (x: number, z: number, w: number, d: number) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), matCurb);
      curb.position.set(x, 0.045, z);
      this.group.add(curb);
    };
    addCurb(-24.0, 21.0, 0.24, 21.0);
    addCurb(-24.0, -9.0, 0.24, 15.0);
    addCurb(-12.0, 21.0, 0.24, 21.0);
    addCurb(14.5, 21.0, 0.24, 21.0);
    addCurb(24.5, 21.0, 0.24, 21.0);

    const matOnly = new THREE.MeshBasicMaterial({
      map: this.dTex.roadOnlyDecal,
      transparent: true,
      depthWrite: false,
      opacity: 0.78,
    });
    for (const [ox, oz, rot] of [
      [-15.2, 26.5, 0],
      [-20.8, 26.5, Math.PI],
      [-15.2, -5.5, 0],
      [17.2, 26.5, 0],
      [21.8, 10.5, Math.PI],
    ]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), matOnly);
      d.rotation.x = -Math.PI / 2;
      d.rotation.z = rot;
      d.position.set(ox, 0.022, oz);
      this.group.add(d);
    }

    const matCross = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.crosswalk,
      emissive: new THREE.Color(0x162238),
      emissiveIntensity: 0.24,
      roughness: 0.56,
    });
    const matStopBar = this.getColorMat(0xd6dfed, 0.75, 0.05);
    const addCrosswalk = (x: number, z: number, w: number, d: number, rot90: boolean) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rot90 ? d : w, rot90 ? w : d), matCross);
      m.rotation.x = -Math.PI / 2;
      if (rot90) m.rotation.z = Math.PI / 2;
      m.position.set(x, 0.026, z);
      this.group.add(m);
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(rot90 ? 0.36 : w * 0.94, rot90 ? w * 0.94 : 0.36),
        matStopBar
      );
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x + (rot90 ? 2.1 : 0), 0.027, z + (rot90 ? 0 : 2.1));
      this.group.add(bar);
    };

    addCrosswalk(-18, 11.0, 11.4, 3.2, false);
    addCrosswalk(-18, -2.0, 11.4, 3.2, false);
    addCrosswalk(-11.2, 4.5, 9.6, 3.2, true);
    addCrosswalk(-24.8, 4.5, 9.6, 3.2, true);
    addCrosswalk(19.5, 11.0, 9.6, 3.2, false);
    addCrosswalk(19.5, -2.0, 9.6, 3.2, false);
    addCrosswalk(13.6, 4.5, 9.6, 3.2, true);
    addCrosswalk(25.4, 4.5, 9.6, 3.2, true);
    addCrosswalk(-18, 30.8, 11.4, 3.0, false);
    addCrosswalk(19.5, 30.8, 9.6, 3.0, false);
    addCrosswalk(-18, -23.4, 11.4, 3.0, false);

    // High-Tier Wet-Street Times Square Neon Reflection Sheen Pools
    const addWetGlow = (x: number, z: number, rx: number, rz: number, color: number, opacity: number) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.scale.set(rx, rz, 1);
      m.position.set(x, 0.032, z);
      this.markHighTier(m);
      this.group.add(m);
    };
    addWetGlow(-17.5, 4.5, 9.5, 13.0, 0x22c8ff, 0.16);
    addWetGlow(-2.0, 14.5, 9.5, 9.0, 0xff2c88, 0.14);
    addWetGlow(-17.5, -6.0, 8.0, 10.5, 0x26d8ff, 0.14);
    addWetGlow(19.5, 4.5, 8.0, 10.0, 0x3098ff, 0.12);

    const matBarricade = this.getColorMat(0x1b2438, 0.52, 0.55);
    const matCyanStrip = this.getBasicMat(0x2ce4ff);
    const matMagentaStrip = this.getBasicMat(0xff3ca8);
    const addPerimeter = (x: number, z: number, w: number, d: number, magenta: boolean) => {
      this.addSolidBox(x, 1.35, z, w, 2.7, d, matBarricade, { minimapKind: 'wall' });
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.06, 0.1, d + 0.06),
        magenta ? matMagentaStrip : matCyanStrip
      );
      strip.position.set(x, 2.55, z);
      this.group.add(strip);
    };
    addPerimeter(0, HALF_L + 0.45, HALF_W * 2 + 2, 0.9, false);
    addPerimeter(0, -HALF_L - 0.45, HALF_W * 2 + 2, 0.9, true);
    addPerimeter(-HALF_W - 0.45, 0, 0.9, HALF_L * 2 + 2, false);
    addPerimeter(HALF_W + 0.45, 0, 0.9, HALF_L * 2 + 2, true);
  }

  // =========================================================================
  // 4. VIBRANT TIMES SQUARE SHOWPIECE (ONE TIMES SQUARE, CURVED LED DRUM & TKTS!)
  // =========================================================================
  private addWideBillboard(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotY: number,
    adIdx: number
  ): void {
    const matAd = this.wideBillboardMats[adIdx % this.wideBillboardMats.length];
    const frameMat = this.getColorMat(0x111726, 0.45, 0.68);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, h + 0.34, 0.28), frameMat);
    back.position.z = -0.15;
    g.add(back);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matAd);
    screen.position.z = 0.02;
    g.add(screen);
    this.group.add(g);
  }

  private addVerticalBillboard(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotY: number,
    vIdx: number
  ): void {
    const matAd = this.verticalBillboardMats[vIdx % this.verticalBillboardMats.length];
    const frameMat = this.getColorMat(0x0f1522, 0.42, 0.72);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.36), frameMat);
    back.position.z = -0.2;
    g.add(back);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matAd);
    screen.position.z = 0.02;
    g.add(screen);
    this.group.add(g);
  }

  private addVerticalBladeSign(x: number, y: number, z: number, rotY: number, signIdx: number, h = 9.5): void {
    const matSign = this.bladeSignMats[signIdx % this.bladeSignMats.length];
    const matDarkSteel = this.getColorMat(0x141b2a, 0.45, 0.75);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.markHighTier(g);

    const w = h * 0.22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, w), matDarkSteel);
    g.add(body);
    for (const sx of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.14), matSign);
      face.rotation.y = sx * Math.PI * 0.5;
      face.position.x = sx * 0.15;
      g.add(face);
    }
    this.group.add(g);
  }

  private buildTimesSquare(): void {
    const matDarkSteel = this.getColorMat(0x161e2e, 0.42, 0.68);
    const matRedGlass = this.getColorMat(0xc41634, 0.2, 0.18, 0xff1e44, 0.85);
    const matRedGlow = this.getBasicMat(0xff345e);
    const matCyanGlow = this.getBasicMat(0x38eeff);

    // A. ONE TIMES SQUARE TOWER at (-2, -8.5) — storefront lobby + dark steel skyscraper stacked with glowing LED billboards + Crystal Ball!
    const tx = -2;
    const tz = -8.5;
    this.addSolidBox(tx, PODIUM_H * 0.5, tz, 7.6, PODIUM_H, 7.6, this.matStorefrontModern, {
      minimapKind: 'wall',
      tileW: 15.2,
      tileH: PODIUM_H,
    });
    this.addSolidBox(tx, PODIUM_H + 17.5, tz, 7.4, 35, 7.4, this.facadeMats.get('obsidianSteel')!, {
      noCollider: true,
      tileW: 14,
      tileH: 26,
    });
    this.addSolidBox(tx, 43.2, tz, 5.2, 7.4, 5.2, matDarkSteel, { noCollider: true, noRaycast: true });

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 15, 8), matDarkSteel);
    mast.position.set(tx, 54.0, tz);
    this.group.add(mast);
    const nyBall = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), this.getBasicMat(0xb8f8ff));
    nyBall.position.set(tx, 59.5, tz);
    this.group.add(nyBall);
    const ballHalo = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x38e4ff, transparent: true, opacity: 0.24, depthWrite: false })
    );
    ballHalo.position.set(tx, 59.5, tz);
    this.markHighTier(ballHalo);
    this.group.add(ballHalo);

    // Stacked blazing photographic LED billboards wrapping ALL 4 FACES of One Times Square!
    this.addWideBillboard(tx, 8.2, tz + 3.85, 7.2, 5.2, 0, 1); // METROPOLIS GLOBAL
    this.addWideBillboard(tx, 14.0, tz + 3.85, 7.2, 5.4, 0, 0); // ATELIER NOIR
    this.addWideBillboard(tx, 20.0, tz + 3.85, 7.2, 5.4, 0, 4); // ASTRALIS // IMAX
    this.addWideBillboard(tx, 26.2, tz + 3.85, 7.2, 5.6, 0, 10); // TDX AUDIO
    this.addWideBillboard(tx, 32.4, tz + 3.85, 7.2, 5.4, 0, 11); // SOHO STUDIO
    this.addWideBillboard(tx - 3.85, 10.5, tz, 7.2, 5.6, -Math.PI * 0.5, 2); // NOVA GT
    this.addWideBillboard(tx - 3.85, 17.2, tz, 7.2, 5.6, -Math.PI * 0.5, 5); // KURO RAMEN
    this.addWideBillboard(tx - 3.85, 24.0, tz, 7.2, 5.6, -Math.PI * 0.5, 7); // NEON PULSE
    this.addWideBillboard(tx + 3.85, 10.5, tz, 7.2, 5.6, Math.PI * 0.5, 8); // APEX STRIDE
    this.addWideBillboard(tx + 3.85, 17.2, tz, 7.2, 5.6, Math.PI * 0.5, 6); // CHRONO TITAN
    this.addWideBillboard(tx, 11.2, tz - 3.85, 7.2, 5.6, Math.PI, 3); // HYPER VOLT
    this.addWideBillboard(tx, 18.0, tz - 3.85, 7.2, 5.6, Math.PI, 9); // VELVET LOUNGE

    const ticker = new THREE.Mesh(new THREE.BoxGeometry(7.95, 0.42, 7.95), matCyanGlow);
    ticker.position.set(tx, PODIUM_H + 0.22, tz);
    this.group.add(ticker);

    // B. ICONIC CURVED CYLINDRICAL TIMES SQUARE CORNER LED DRUM TOWER (NW Broadway × 42nd!)
    const drumX = -29.2;
    const drumZ = -2.2;
    const drumR = 3.9;
    const drumCore = new THREE.Mesh(new THREE.CylinderGeometry(drumR - 0.14, drumR - 0.14, 24, 24), matDarkSteel);
    drumCore.position.set(drumX, 12, drumZ);
    this.group.add(drumCore);
    const drumScreen1 = new THREE.Mesh(
      new THREE.CylinderGeometry(drumR + 0.04, drumR + 0.04, 7.6, 24, 1, true, -Math.PI * 0.15, Math.PI * 1.15),
      this.wideBillboardMats[11]
    );
    drumScreen1.position.set(drumX, 9.4, drumZ);
    this.group.add(drumScreen1);
    const drumScreen2 = new THREE.Mesh(
      new THREE.CylinderGeometry(drumR + 0.04, drumR + 0.04, 6.8, 24, 1, true, -Math.PI * 0.15, Math.PI * 1.15),
      this.wideBillboardMats[1]
    );
    drumScreen2.position.set(drumX, 17.2, drumZ);
    this.group.add(drumScreen2);
    const drumCap = new THREE.Mesh(new THREE.CylinderGeometry(drumR + 0.18, drumR + 0.18, 0.55, 24), matDarkSteel);
    drumCap.position.set(drumX, 21.1, drumZ);
    this.group.add(drumCap);
    const drumRim = new THREE.Mesh(new THREE.CylinderGeometry(drumR + 0.22, drumR + 0.22, 0.18, 24), matCyanGlow);
    drumRim.position.set(drumX, 20.8, drumZ);
    this.group.add(drumRim);

    // C. CLIMBABLE TKTS GLOWING RED GLASS STEPS WITH CRISP MATTE-BLACK ARCHITECTURAL EDGE MARKINGS!
    const matBlackSteel = this.getColorMat(0x0c0f16, 0.44, 0.72);
    this.addSmoothStaircase(-2, 18.2, 11.6, 5.2, 3.6, matRedGlass, matBlackSteel, matBlackSteel, true);
    // Solid enclosed rear architectural panel under TKTS deck (matches real Times Square TKTS booth & blocks walking under steps!)
    this.addSolidBox(-2, 1.7, 10.2, 5.2, 3.4, 2.6, matBlackSteel, { minimapKind: 'wall' });

    // Matte-black architectural edge nosing strip on EVERY SINGLE red step lip + panel joint seams!
    const tktsSteps = 16;
    const tktsSlopeRun = 11.6 + 0.62 - 18.2; // negative (going north)
    const tktsStepRun = tktsSlopeRun / tktsSteps;
    const tktsStepRise = 3.6 / tktsSteps;
    for (let i = 0; i < tktsSteps; i++) {
      const sy = (i + 1) * tktsStepRise;
      const cz = 18.2 + (i + 0.5) * tktsStepRun;
      const frontLipZ = cz - Math.sign(tktsStepRun) * (Math.abs(tktsStepRun) * 0.48);
      // Crisp matte-black anti-slip front stair edge nosing
      const nosing = new THREE.Mesh(new THREE.BoxGeometry(5.28, 0.055, 0.09), matBlackSteel);
      nosing.position.set(-2, sy + 0.008, frontLipZ);
      this.group.add(nosing);
      // Crisp matte-black left & right step side edge caps
      for (const sx of [-2.62, 2.62]) {
        const sideCap = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, tktsStepRise + 0.04, Math.abs(tktsStepRun) + 0.06),
          matBlackSteel
        );
        sideCap.position.set(-2 + sx, sy - tktsStepRise * 0.5, cz);
        this.group.add(sideCap);
      }
      // Subtle matte-black vertical glass-panel joint dividers across the red treads
      for (const mx of [-1.3, 0, 1.3]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, Math.abs(tktsStepRun) + 0.02), matBlackSteel);
        seam.position.set(-2 + mx, sy + 0.012, cz);
        this.group.add(seam);
      }
    }

    // Sleek matte-black sloped outer stringer fascia beams flanking both edges of the red TKTS staircase
    const tktsSlopeLen = Math.hypot(Math.abs(tktsSlopeRun), 3.6);
    const tktsSlopeAngle = Math.atan2(3.6, Math.abs(tktsSlopeRun));
    const tktsMidZ = (18.2 + (11.6 + 0.62)) * 0.5;
    for (const sx of [-2.66, 2.66]) {
      const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, tktsSlopeLen), matBlackSteel);
      stringer.position.set(-2 + sx, 1.8 - 0.14, tktsMidZ);
      stringer.rotation.x = tktsSlopeAngle;
      this.group.add(stringer);
    }

    // Upper TKTS Observation Deck framed cleanly in matte-black architectural edge trim!
    this.addSolidBox(-2, 3.6 - SLAB_THICK * 0.5, 10.2, 5.4, SLAB_THICK, 2.8, matRedGlass, { minimapKind: 'arch' });
    // Black deck perimeter fascia edges (North, East, West, plus South landing seam)
    const deckFrontEdge = new THREE.Mesh(new THREE.BoxGeometry(5.52, SLAB_THICK + 0.06, 0.14), matBlackSteel);
    deckFrontEdge.position.set(-2, 3.6 - SLAB_THICK * 0.5, 8.8);
    this.group.add(deckFrontEdge);
    const deckSouthEdge = new THREE.Mesh(new THREE.BoxGeometry(5.52, 0.06, 0.12), matBlackSteel);
    deckSouthEdge.position.set(-2, 3.6 + 0.01, 11.6);
    this.group.add(deckSouthEdge);
    for (const sx of [-2.72, 2.72]) {
      const sideEdge = new THREE.Mesh(new THREE.BoxGeometry(0.14, SLAB_THICK + 0.06, 2.92), matBlackSteel);
      sideEdge.position.set(-2 + sx, 3.6 - SLAB_THICK * 0.5, 10.2);
      this.group.add(sideEdge);
    }
    this.addSolidBox(-2, 3.6 + 0.56, 8.95, 5.4, 1.12, 0.24, matBlackSteel);
    const tktsGlow = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.28), matRedGlow);
    tktsGlow.position.set(-2, 3.6 + 1.14, 8.95);
    this.group.add(tktsGlow);
    this.addSolidBox(-4.3, 1.7, 9.2, 0.45, 3.4, 0.45, matBlackSteel);
    this.addSolidBox(0.3, 1.7, 9.2, 0.45, 3.4, 0.45, matBlackSteel);

    // D. Authentic NYC Subway Entrances
    this.addSubwayEntrance(8.2, 17.8, 0);
    this.addSubwayEntrance(-6.5, 24.5, Math.PI * 0.5);

    const plazaTile = new THREE.Mesh(
      new THREE.PlaneGeometry(17.5, 15.5),
      this.getColorMat(0x1f283c, 0.46, 0.28, 0x0d162a, 0.35)
    );
    plazaTile.rotation.x = -Math.PI / 2;
    plazaTile.position.set(-1.5, 0.02, 18.5);
    this.group.add(plazaTile);

    this.addSolidBox(6.8, 1.35, 1.2, 3.2, 2.7, 2.2, this.getColorMat(0x1a263a, 0.38, 0.52), { minimapKind: 'crate' });
    const kBand = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.26, 2.3), matCyanGlow);
    kBand.position.set(6.8, 2.76, 1.2);
    this.group.add(kBand);
  }

  private addSubwayEntrance(x: number, z: number, rotY: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const matGreenSteel = this.getColorMat(0x164a38, 0.42, 0.55);
    const matGlobe = this.getBasicMat(0x46ffaa);

    this.addSolidBox(x, 0.65, z, 2.4, 1.3, 3.8, matGreenSteel, { rotY, minimapKind: 'crate' });
    for (const sx of [-1.05, 1.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.8, 8), matGreenSteel);
      post.position.set(sx, 1.4, 1.75);
      g.add(post);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), matGlobe);
      globe.position.set(sx, 2.92, 1.75);
      g.add(globe);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.18), this.getColorMat(0x0d1422, 0.45, 0.4));
    header.position.set(0, 2.52, 1.75);
    g.add(header);
    const line = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 0.22), this.getBasicMat(0x38e8ff));
    line.position.set(0, 2.7, 1.75);
    g.add(line);
    this.group.add(g);
  }

  // =========================================================================
  // 5. CENTRAL PARK NIGHT-OASIS (REAL SCULPTED 3D GLB TREES!)
  // =========================================================================
  private buildCentralPark(): void {
    const matGrass = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.parkGrass,
      emissive: new THREE.Color(0x09241c),
      emissiveIntensity: 0.36,
      roughness: 0.88,
      metalness: 0.04,
    });
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(44, 21), matGrass);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(24, 0.022, -33.5);
    lawn.receiveShadow = true;
    this.group.add(lawn);

    const matPath = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.parkPath,
      emissive: new THREE.Color(0x101c30),
      emissiveIntensity: 0.32,
      roughness: 0.65,
    });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(40, 3.6), matPath);
    p1.rotation.x = -Math.PI / 2;
    p1.position.set(24, 0.032, -26.5);
    this.group.add(p1);

    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 19), matPath);
    p2.rotation.x = -Math.PI / 2;
    p2.position.set(11, 0.032, -33.5);
    this.group.add(p2);

    const p3 = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 19), matPath);
    p3.rotation.x = -Math.PI / 2;
    p3.position.set(28, 0.032, -33.5);
    this.group.add(p3);

    const matGranite = this.getColorMat(0x525d72, 0.84, 0.08);
    const matCapstone = this.getColorMat(0x748299, 0.72, 0.12);
    const addParkWall = (x: number, z: number, w: number, d: number) => {
      this.addSolidBox(x, 0.6, z, w, 1.2, d, matGranite, { minimapKind: 'wall' });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.12, d + 0.14), matCapstone);
      cap.position.set(x, 1.26, z);
      this.group.add(cap);
    };
    addParkWall(6, -23.2, 6.2, 0.65);
    addParkWall(19.5, -23.2, 9.0, 0.65);
    addParkWall(38, -23.2, 11.0, 0.65);
    addParkWall(2.2, -27.5, 0.65, 7.2);
    addParkWall(2.2, -39.5, 0.65, 8.2);
    addParkWall(17.5, -43.6, 10.0, 0.65);
    addParkWall(38.5, -43.6, 11.0, 0.65);

    const matWater = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.pondWater,
      emissive: new THREE.Color(0x144878),
      emissiveIntensity: 0.48,
      roughness: 0.12,
      metalness: 0.45,
    });
    const pond = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 7.5), matWater);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(28, 0.04, -34.5);
    this.group.add(pond);

    const matBridge = this.getColorMat(0x6c7a90, 0.72, 0.18);
    const matWarmLantern = this.getBasicMat(0xffd68a);
    this.ramps.push({ minX: 26.2, maxX: 29.8, minZ: -34.5, maxZ: -30.2, yAtMinZ: 1.1, yAtMaxZ: 0 });
    this.ramps.push({ minX: 26.2, maxX: 29.8, minZ: -38.8, maxZ: -34.5, yAtMinZ: 0, yAtMaxZ: 1.1 });

    const deckMid = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.24, 3.4), matBridge);
    deckMid.position.set(28, 1.0, -34.5);
    this.group.add(deckMid);
    for (const sz of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 3.2), matBridge);
      slope.position.set(28, 0.5, -34.5 + sz * 2.9);
      slope.rotation.x = sz * 0.32;
      this.group.add(slope);
    }
    for (const sx of [-1.75, 1.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 8.2), matBridge);
      rail.position.set(28 + sx, 1.18, -34.5);
      this.group.add(rail);
      for (const lz of [-3.6, 0, 3.6]) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), matWarmLantern);
        orb.position.set(28 + sx, 1.66, -34.5 + lz);
        this.group.add(orb);
      }
    }

    const matWood = this.getColorMat(0x6e472d, 0.8, 0.05);
    const matIron = this.getColorMat(0x1b2330, 0.48, 0.62);
    for (const [bx, bz, rot] of [
      [15.5, -25.2, 0],
      [23.5, -25.2, 0],
      [34.5, -25.2, 0],
      [8.2, -31.5, Math.PI * 0.5],
      [8.2, -37.0, Math.PI * 0.5],
      [39.5, -33.5, -Math.PI * 0.5],
    ]) {
      const bg = new THREE.Group();
      bg.position.set(bx, 0, bz);
      bg.rotation.y = rot;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.54), matWood);
      seat.position.set(0, 0.48, 0);
      bg.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.08), matWood);
      back.position.set(0, 0.75, -0.24);
      back.rotation.x = -0.18;
      bg.add(back);
      for (const lx of [-0.88, 0.88]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.48, 0.5), matIron);
        leg.position.set(lx, 0.24, 0);
        bg.add(leg);
      }
      this.group.add(bg);
    }

    // 18 Properly Aligned Central Park Trees: Symmetrical West Promenade Mall + Pond Backdrop & East Grove!
    // (Strictly clear of stone paths x=11/x=28/z=-26.5, pond x=20.75..35.25/z=-38.25..-30.75, benches & walls!)
    const treeSpots: Array<[number, number]> = [
      // West Promenade Mall — Left Row (x = 6.2, evenly spaced!)
      [6.2, -30.0],
      [6.2, -35.0],
      [6.2, -40.0],
      // West Promenade Mall — Right Row (x = 15.8, perfectly symmetrical across the x=11 stone path!)
      [15.8, -30.0],
      [15.8, -35.0],
      [15.8, -40.0],
      // North Pond Backdrop Row (z = -41.0, evenly framing the reflection pond!)
      [20.5, -41.0],
      [24.5, -41.0],
      [31.5, -41.0],
      [35.5, -41.0],
      [41.2, -41.0],
      // East Scenic Grove — Inner & Outer balanced columns (strictly clear of east benches & pond!)
      [37.8, -30.0],
      [37.8, -35.8],
      [42.8, -30.0],
      [42.8, -35.8],
      [42.8, -41.0],
      // South-Central Framing Accent Trees (clear of z=-26.5 promenade & pond!)
      [19.2, -29.8],
      [36.6, -29.8],
    ];
    treeSpots.forEach(([tx, tz], idx) => this.addGlbTree(tx, tz, idx, true));
  }

  private addGlbTree(x: number, z: number, idx: number, parkTree: boolean): void {
    let s = 31337 + idx * 7919;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };

    const treeId = DOWNTOWN_TREE_GLBS[idx % DOWNTOWN_TREE_GLBS.length];
    // Crisp urban street-tree proportions on sidewalks (never clipping building walls); lush tall trees in Central Park!
    const targetH = parkTree ? 6.0 + rand() * 2.2 : 4.4 + rand() * 0.85;
    const rotY = rand() * Math.PI * 2;
    const foliageTints = [0x82bca8, 0xd8a868, 0x76b898, 0xd888b2, 0xc87a68, 0x6ca898];
    const fTint = foliageTints[idx % foliageTints.length];

    // Authentic NYC square granite tree-pit curb & soil bed beneath every sidewalk street tree!
    if (!parkTree) {
      const matCurb = this.getColorMat(0x3a465c, 0.72, 0.16);
      const matSoil = this.getColorMat(0x231d19, 0.95, 0.02);
      const pit = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 1.56), matCurb);
      pit.position.set(x, 0.07, z);
      this.group.add(pit);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 1.3), matSoil);
      soil.position.set(x, 0.08, z);
      this.group.add(soil);
    }

    const anchor = new THREE.Group();
    anchor.position.set(x, 0, z);
    // Keep essential park & avenue trees on LOW END DEVICE; hide secondary dense park trees on LOW END!
    if (parkTree && idx >= 11) {
      this.highTierGlbRoot.add(anchor);
    } else {
      this.glbRoot.add(anchor);
    }

    this.colliders.push({
      minX: x - 0.34,
      maxX: x + 0.34,
      minY: 0,
      maxY: 3.4,
      minZ: z - 0.34,
      maxZ: z + 0.34,
    });

    void loadDowntownGlb(`trees/${treeId}.glb`, 45).then((tpl) => {
      if (!tpl) return;
      const inst = fitGlbInstance(tpl, { uniformHeight: targetH, rotY });
      // Seat trunk cleanly 0.12m into the soil/grass so zero roots ever float!
      inst.position.y = -0.12;
      styleGlbTreeForMidnightNyc(inst, fTint);
      anchor.add(inst);
    });
  }

  // =========================================================================
  // 6. CHRYSLER-GRADE PHOTOREALISTIC MIDTOWN SKYSCRAPERS, STOREFRONTS & ALLEYS
  // =========================================================================
  /**
   * Adds one of 6 authentic sculpted Manhattan skyscraper crowns (100% flush with the tower — zero floating rims!)
   */
  private addSculptedCrown(
    x: number,
    z: number,
    w: number,
    d: number,
    baseH: number,
    crown: CrownSilhouette,
    shaftMat: THREE.Material,
    glowHex: number,
    highTierOnly = false
  ): void {
    const matDarkSteel = this.getColorMat(0x182234, 0.42, 0.66);
    const matSilver = this.getColorMat(0xb0c6de, 0.25, 0.84);
    const matGlow = this.getBasicMat(glowHex);
    const matGold = this.getBasicMat(0xffe09a);
    const matBeacon = this.getBasicMat(0xff2c4c);

    const addPart = (mesh: THREE.Mesh) => {
      if (highTierOnly) this.markHighTier(mesh);
      this.group.add(mesh);
    };

    // Flush roofline parapet coping + flush subtle glow collar right around the main roof edge
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, 0.62, d + 0.34), matDarkSteel);
    parapet.position.set(x, baseH + 0.22, z);
    addPart(parapet);
    const baseRing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.42, 0.22, d + 0.42), matGlow);
    baseRing.position.set(x, baseH + 0.56, z);
    addPart(baseRing);

    if (crown === 'artDecoTerrace') {
      // 2-tier Chrysler/Empire-inspired stepped Art Deco setback crown with flush glowing collars & spire!
      const h1 = Math.max(6, baseH * 0.19);
      const w1 = w * 0.72;
      const d1 = d * 0.72;
      const t1 = new THREE.Mesh(this.makeScaledBoxGeo(w1, h1, d1, 16, 26), shaftMat);
      t1.position.set(x, baseH + h1 * 0.5, z);
      addPart(t1);
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(w1 + 0.32, 0.3, d1 + 0.32), matGold);
      r1.position.set(x, baseH + h1 + 0.12, z);
      addPart(r1);

      const h2 = Math.max(4.5, baseH * 0.13);
      const w2 = w * 0.46;
      const d2 = d * 0.46;
      const t2 = new THREE.Mesh(this.makeScaledBoxGeo(w2, h2, d2, 16, 26), shaftMat);
      t2.position.set(x, baseH + h1 + h2 * 0.5, z);
      addPart(t2);
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(w2 + 0.28, 0.28, d2 + 0.28), matGlow);
      r2.position.set(x, baseH + h1 + h2 + 0.12, z);
      addPart(r2);

      const spireH = Math.max(10, baseH * 0.22);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.55, spireH, 8), matSilver);
      spire.position.set(x, baseH + h1 + h2 + spireH * 0.5, z);
      addPart(spire);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.38, 7, 6), matBeacon);
      tip.position.set(x, baseH + h1 + h2 + spireH + 0.25, z);
      addPart(tip);
    } else if (crown === 'vanderbiltSpire') {
      // Modern Midtown supertall crystal lantern crown (One Vanderbilt style!) with vertical glowing fins
      const h1 = Math.max(7, baseH * 0.2);
      const w1 = w * 0.74;
      const d1 = d * 0.74;
      const t1 = new THREE.Mesh(this.makeScaledBoxGeo(w1, h1, d1, 16, 26), shaftMat);
      t1.position.set(x, baseH + h1 * 0.5, z);
      addPart(t1);
      // 4 glowing vertical architectural corner light fins climbing the lantern crown!
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, h1 + 2.5, 0.24), matGlow);
          fin.position.set(x + sx * (w1 * 0.5 + 0.06), baseH + h1 * 0.5 + 1.0, z + sz * (d1 * 0.5 + 0.06));
          addPart(fin);
        }
      }
      const lantern = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w1, d1) * 0.52, 8.5, 4), matSilver);
      lantern.rotation.y = Math.PI * 0.25;
      lantern.position.set(x, baseH + h1 + 4.2, z);
      addPart(lantern);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 13, 8), matSilver);
      mast.position.set(x, baseH + h1 + 14.0, z);
      addPart(mast);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 6), matGlow);
      tip.position.set(x, baseH + h1 + 20.6, z);
      addPart(tip);
    } else if (crown === 'citigroupSlant') {
      // Iconic Midtown East sloped wedge skyscraper crown (Citigroup Center / 601 Lexington!)
      const wedgeH = Math.max(8, Math.min(w, d) * 0.72);
      const wedge = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.64, wedgeH, 4), shaftMat);
      wedge.rotation.y = Math.PI * 0.25;
      wedge.position.set(x, baseH + wedgeH * 0.5, z);
      addPart(wedge);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.36, 0.36), matGlow);
      ridge.position.set(x, baseH + wedgeH + 0.15, z);
      addPart(ridge);
    } else if (crown === 'rockefellerSlab') {
      // Classic 30 Rock / Rockefeller Plaza stepped vertical Art Deco slab with golden vertical crown ribs!
      const h1 = Math.max(6, baseH * 0.18);
      const t1 = new THREE.Mesh(this.makeScaledBoxGeo(w * 0.84, h1, d * 0.66, 16, 26), shaftMat);
      t1.position.set(x, baseH + h1 * 0.5, z);
      addPart(t1);
      const h2 = Math.max(4.5, baseH * 0.12);
      const t2 = new THREE.Mesh(this.makeScaledBoxGeo(w * 0.58, h2, d * 0.48, 16, 26), shaftMat);
      t2.position.set(x, baseH + h1 + h2 * 0.5, z);
      addPart(t2);
      // Warm backlit Art Deco crown floodlight bars
      const topGlow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.4, d * 0.5), matGold);
      topGlow.position.set(x, baseH + h1 + h2 + 0.18, z);
      addPart(topGlow);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.26, d * 0.68), matGlow);
      rib.position.set(x, baseH + h1 + 0.12, z);
      addPart(rib);
    } else if (crown === 'beauxArtsLoft') {
      // Historic Midtown brick & cast-iron roof with mechanical penthouse & classic wooden NYC rooftop water tower!
      const pent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 3.2, d * 0.42), matDarkSteel);
      pent.position.set(x - w * 0.14, baseH + 1.6, z + d * 0.1);
      addPart(pent);

      const wx = x + w * 0.22;
      const wz = z - d * 0.18;
      const woodMat = this.getColorMat(0x5c4230, 0.84, 0.05);
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, 2.2, 6), matDarkSteel);
      legs.position.set(wx, baseH + 1.1, wz);
      addPart(legs);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.6, 12), woodMat);
      tank.position.set(wx, baseH + 3.4, wz);
      addPart(tank);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.42, 1.25, 12), matDarkSteel);
      roof.position.set(wx, baseH + 5.3, wz);
      addPart(roof);
    } else {
      // 'twinSpireTower': Sleek glass observatory band + twin illuminated antenna spires!
      const h1 = Math.max(5.5, baseH * 0.15);
      const w1 = w * 0.72;
      const d1 = d * 0.72;
      const obs = new THREE.Mesh(this.makeScaledBoxGeo(w1, h1, d1, 16, 26), shaftMat);
      obs.position.set(x, baseH + h1 * 0.5, z);
      addPart(obs);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w1 + 0.3, 0.42, d1 + 0.3), matGlow);
      band.position.set(x, baseH + h1 - 0.5, z);
      addPart(band);
      for (const sx of [-w1 * 0.25, w1 * 0.25]) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 14, 7), matSilver);
        ant.position.set(x + sx, baseH + h1 + 7.0, z);
        addPart(ant);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 6), matBeacon);
        b.position.set(x + sx, baseH + h1 + 14.2, z);
        addPart(b);
      }
    }
  }

  private addManhattanSkyscraper(cfg: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    style: FacadeStyle;
    crown: CrownSilhouette;
    crownGlow: number;
    masonryGround?: boolean;
    verticalUplights?: boolean;
    wideBillboards?: Array<{ side: 'N' | 'S' | 'E' | 'W'; y: number; w: number; h: number; adIdx: number }>;
    verticalBanner?: { side: 'N' | 'S' | 'E' | 'W'; y: number; w: number; h: number; vIdx: number };
    bladeSign?: { side: 'N' | 'S' | 'E' | 'W'; y: number; signIdx: number };
  }): void {
    const shaftMat = this.facadeMats.get(cfg.style)!;
    const podiumMat = cfg.masonryGround ? this.matStorefrontMasonry : this.matStorefrontModern;
    const matDarkGranite = this.getColorMat(0x161f30, 0.56, 0.32);
    const matSteelTrim = this.getColorMat(0x283650, 0.4, 0.62);

    // 1. Photorealistic Street-Level Storefront Podium (glowing RETAIL / CAFE / BROADWAY THEATER / GALLERY!)
    this.addSolidBox(cfg.x, PODIUM_H * 0.5, cfg.z, cfg.w, PODIUM_H, cfg.d, podiumMat, {
      minimapKind: 'wall',
      tileW: cfg.masonryGround ? 14 : 18,
      tileH: PODIUM_H,
    });

    // 2. Photorealistic Multi-Story Midtown Shaft (same Chrysler-grade lit-window density!)
    const shaftH = Math.max(10, cfg.h - PODIUM_H);
    this.addSolidBox(cfg.x, PODIUM_H + shaftH * 0.5, cfg.z, cfg.w - 0.1, shaftH, cfg.d - 0.1, shaftMat, {
      noCollider: true,
      tileW: 16,
      tileH: 26,
    });
    this.colliders.push({
      minX: cfg.x - cfg.w * 0.5,
      maxX: cfg.x + cfg.w * 0.5,
      minY: PODIUM_H,
      maxY: cfg.h,
      minZ: cfg.z - cfg.d * 0.5,
      maxZ: cfg.z + cfg.d * 0.5,
    });

    // 3. Projecting Architectural Cornice Belt, 3D Corner Pilasters & Spandrel Ledges
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.56, 0.44, cfg.d + 0.56), matSteelTrim);
    cornice.position.set(cfg.x, PODIUM_H + 0.12, cfg.z);
    this.group.add(cornice);

    const glowMat = this.getBasicMat(cfg.crownGlow);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.68, cfg.h, 0.68), matDarkGranite);
        pier.position.set(cfg.x + sx * (cfg.w * 0.5 - 0.2), cfg.h * 0.5, cfg.z + sz * (cfg.d * 0.5 - 0.2));
        this.markHighTier(pier);
        this.group.add(pier);

        // Sleek glowing vertical architectural edge uplight fins (lively Manhattan night character!)
        if (cfg.verticalUplights) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, shaftH * 0.72, 0.14), glowMat);
          fin.position.set(
            cfg.x + sx * (cfg.w * 0.5 + 0.08),
            PODIUM_H + shaftH * 0.62,
            cfg.z + sz * (cfg.d * 0.5 + 0.08)
          );
          this.markHighTier(fin);
          this.group.add(fin);
        }
      }
    }

    for (let ly = PODIUM_H + 14; ly < cfg.h - 3; ly += 14) {
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.28, 0.34, cfg.d + 0.28), matSteelTrim);
      ledge.position.set(cfg.x, ly, cfg.z);
      this.markHighTier(ledge);
      this.group.add(ledge);
    }

    // 4. Sculpted Iconic Manhattan Rooftop Crown (100% flush!)
    this.addSculptedCrown(cfg.x, cfg.z, cfg.w, cfg.d, cfg.h, cfg.crown, shaftMat, cfg.crownGlow, false);

    // 5. Photorealistic Times Square Billboards & Projecting Vertical Neon Blade Signs
    const facePos = (side: 'N' | 'S' | 'E' | 'W', off = 0.26) => {
      if (side === 'S') return { x: cfg.x, z: cfg.z + cfg.d * 0.5 + off, rotY: 0 };
      if (side === 'N') return { x: cfg.x, z: cfg.z - cfg.d * 0.5 - off, rotY: Math.PI };
      if (side === 'E') return { x: cfg.x + cfg.w * 0.5 + off, z: cfg.z, rotY: Math.PI * 0.5 };
      return { x: cfg.x - cfg.w * 0.5 - off, z: cfg.z, rotY: -Math.PI * 0.5 };
    };

    if (cfg.wideBillboards) {
      for (const b of cfg.wideBillboards) {
        const fp = facePos(b.side, 0.26);
        this.addWideBillboard(fp.x, b.y, fp.z, b.w, b.h, fp.rotY, b.adIdx);
      }
    }
    if (cfg.verticalBanner) {
      const vb = cfg.verticalBanner;
      const fp = facePos(vb.side, 0.28);
      this.addVerticalBillboard(fp.x, vb.y, fp.z, vb.w, vb.h, fp.rotY, vb.vIdx);
    }
    if (cfg.bladeSign) {
      const bs = cfg.bladeSign;
      const fp = facePos(bs.side, 1.2);
      this.addVerticalBladeSign(fp.x, bs.y, fp.z, fp.rotY, bs.signIdx);
    }
  }

  private buildMidtownBlocksAndAlleys(): void {
    // 9 CHRYSLER-GRADE PHOTOREALISTIC MIDTOWN MANHATTAN SKYSCRAPERS — ALL DISTINCT SILHOUETTES & CROWNS!
    // W1: Broadway Art Deco Theater Skyscraper (SW of Times Square — "MIDNIGHT BROADWAY" vertical banner!)
    this.addManhattanSkyscraper({
      x: -36.5,
      z: 21.5,
      w: 17.5,
      d: 14.5,
      h: 40,
      style: 'artDecoLimestone',
      crown: 'artDecoTerrace',
      crownGlow: 0x38e4ff,
      verticalUplights: true,
      verticalBanner: { side: 'E', y: 17.2, w: 6.4, h: 15.2, vIdx: 1 },
      wideBillboards: [{ side: 'N', y: 10.2, w: 10.6, h: 5.4, adIdx: 5 }],
      bladeSign: { side: 'E', y: 10.8, signIdx: 1 },
    });

    // W2: Midnight Curtain-Wall Media Tower (NW of 42nd St — connects right into the Curved LED Drum!)
    this.addManhattanSkyscraper({
      x: -37.2,
      z: -7.5,
      w: 16.2,
      d: 11.2,
      h: 50,
      style: 'midnightGlass',
      crown: 'vanderbiltSpire',
      crownGlow: 0x2ce8ff,
      verticalUplights: true,
      wideBillboards: [
        { side: 'E', y: 12.2, w: 9.0, h: 5.4, adIdx: 3 },
        { side: 'S', y: 11.4, w: 10.5, h: 5.4, adIdx: 4 },
      ],
    });

    // W3: Historic Midtown Brick & Cast-Iron Lofts (NW near Central Park West!)
    this.addManhattanSkyscraper({
      x: -36.5,
      z: -33.5,
      w: 17.5,
      d: 16.5,
      h: 30,
      style: 'midtownMasonry',
      crown: 'beauxArtsLoft',
      crownGlow: 0xffd27a,
      masonryGround: true,
      wideBillboards: [{ side: 'E', y: 10.4, w: 9.8, h: 5.2, adIdx: 9 }],
    });

    // W4: Cobalt Curtain-Wall Tech Tower (SW facing Empire Plaza!)
    this.addManhattanSkyscraper({
      x: -37.0,
      z: 44.0,
      w: 16.5,
      d: 9.5,
      h: 42,
      style: 'cobaltGlass',
      crown: 'twinSpireTower',
      crownGlow: 0x42b4ff,
      wideBillboards: [{ side: 'E', y: 9.8, w: 7.8, h: 4.4, adIdx: 10 }],
    });

    // NW Center Block: Classic Dark Brownstone Corner Tower (between Broadway & Central Park!)
    this.addManhattanSkyscraper({
      x: -5.5,
      z: -31.5,
      w: 9.5,
      d: 11.5,
      h: 28,
      style: 'brownstoneNight',
      crown: 'beauxArtsLoft',
      crownGlow: 0x58e8ff,
      masonryGround: true,
      wideBillboards: [{ side: 'S', y: 9.4, w: 8.2, h: 4.6, adIdx: 6 }],
    });

    // E1: Bronze Art Deco Rockefeller-Style Tower (SE of 42nd St — unobstructed "HORIZON RISING" vertical banner!)
    this.addManhattanSkyscraper({
      x: 37.5,
      z: 21.5,
      w: 17.0,
      d: 14.5,
      h: 44,
      style: 'bronzeArtDeco',
      crown: 'rockefellerSlab',
      crownGlow: 0xff46b8,
      verticalUplights: true,
      verticalBanner: { side: 'W', y: 17.6, w: 6.6, h: 15.8, vIdx: 0 },
      wideBillboards: [{ side: 'N', y: 10.2, w: 10.4, h: 5.2, adIdx: 2 }],
      bladeSign: { side: 'W', y: 10.6, signIdx: 0 },
    });

    // E2: Sleek Chrysler-Chrome Corporate Tower (NE of 42nd St — iconic Citigroup slanted glass crown!)
    this.addManhattanSkyscraper({
      x: 37.5,
      z: -7.5,
      w: 17.0,
      d: 11.2,
      h: 52,
      style: 'chryslerChrome',
      crown: 'citigroupSlant',
      crownGlow: 0x38e8ff,
      verticalUplights: true,
      wideBillboards: [
        { side: 'W', y: 11.6, w: 9.2, h: 5.2, adIdx: 8 },
        { side: 'S', y: 11.0, w: 10.8, h: 5.4, adIdx: 7 },
      ],
      bladeSign: { side: 'W', y: 10.6, signIdx: 3 },
    });

    // E3: Sleek Obsidian Steel High-Rise (SE facing Empire Plaza!)
    this.addManhattanSkyscraper({
      x: 37.5,
      z: 44.0,
      w: 16.5,
      d: 9.5,
      h: 36,
      style: 'obsidianSteel',
      crown: 'artDecoTerrace',
      crownGlow: 0xff52c8,
      wideBillboards: [{ side: 'W', y: 9.8, w: 7.8, h: 4.4, adIdx: 0 }],
    });

    // Mid-South Boutique Theater Building (flanking cover between Empire Plaza & Times Square!)
    this.addManhattanSkyscraper({
      x: 6.2,
      z: 25.5,
      w: 7.0,
      d: 6.2,
      h: 22,
      style: 'midtownMasonry',
      crown: 'rockefellerSlab',
      crownGlow: 0xffd27a,
      masonryGround: true,
      wideBillboards: [{ side: 'W', y: 8.8, w: 5.6, h: 3.6, adIdx: 9 }],
      bladeSign: { side: 'S', y: 8.8, signIdx: 2 },
    });

    // --- ALLEYS & SLEEK ARCHITECTURAL SKYBRIDGES ---
    const matAlley = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.dTex.alleyFloor,
      roughness: 0.62,
    });
    const af1 = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.2), matAlley);
    af1.rotation.x = -Math.PI / 2;
    af1.position.set(-36, 0.024, 12.2);
    this.group.add(af1);
    for (let lx = -43; lx <= -29; lx += 3.5) {
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 6),
        this.getBasicMat(lx % 2 === 0 ? 0xff4690 : 0xffc662)
      );
      lantern.position.set(lx, 4.6, 12.2);
      this.markHighTier(lantern);
      this.group.add(lantern);
    }

    this.addSolidBox(-32.5, 0.72, -14.2, 2.2, 1.44, 1.35, this.getColorMat(0x1f4536, 0.65, 0.42), { minimapKind: 'crate' });
    this.addSolidBox(-41.5, 0.72, -14.2, 2.4, 1.44, 1.35, this.getColorMat(0x233852, 0.65, 0.42), { minimapKind: 'crate' });

    const af3 = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.2), matAlley);
    af3.rotation.x = -Math.PI / 2;
    af3.position.set(37, 0.024, 12.2);
    this.group.add(af3);
    this.addSolidBox(33.5, 0.72, 12.8, 2.6, 1.44, 1.25, this.getColorMat(0x3a322e, 0.76, 0.22), { minimapKind: 'crate' });
    this.addSolidBox(42.0, 0.72, 11.8, 2.2, 1.44, 1.35, this.getColorMat(0x2a364a, 0.6, 0.4), { minimapKind: 'crate' });

    for (let lx = 30; lx <= 44; lx += 2.8) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), this.getBasicMat(0xffe092));
      bulb.position.set(lx, 4.4, -14.2);
      this.markHighTier(bulb);
      this.group.add(bulb);
    }

    const matBridgeDeck = this.getColorMat(0x2c384e, 0.45, 0.56);
    const matBridgeSteel = this.getColorMat(0x182030, 0.4, 0.72);
    const matCyanAccent = this.getBasicMat(0x38e4ff);
    const matMagentaAccent = this.getBasicMat(0xff42b8);

    this.addSolidBox(19.4, DECK_Y - SLAB_THICK * 0.5, 18.5, 18.8, SLAB_THICK, 4.0, matBridgeDeck, { minimapKind: 'arch' });
    this.addSolidBox(19.4, DECK_Y + 0.55, 18.5 - 1.88, 18.8, 1.1, 0.2, matBridgeSteel);
    const rgEN = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.08, 0.24), matCyanAccent);
    rgEN.position.set(19.4, DECK_Y + 1.12, 18.5 - 1.88);
    this.group.add(rgEN);
    this.addSolidBox(19.4, DECK_Y + 0.55, 18.5 + 1.88, 13.2, 1.1, 0.2, matBridgeSteel);
    const rgES = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.08, 0.24), matCyanAccent);
    rgES.position.set(19.4, DECK_Y + 1.12, 18.5 + 1.88);
    this.group.add(rgES);
    this.addSmoothStaircase(11.2, 28.5, 20.5, 2.4, DECK_Y, matBridgeDeck, matBridgeSteel, matCyanAccent);
    this.addSmoothStaircase(27.6, 28.5, 20.5, 2.4, DECK_Y, matBridgeDeck, matBridgeSteel, matCyanAccent);

    this.addSolidBox(-18.0, DECK_Y - SLAB_THICK * 0.5, -8.5, 20.0, SLAB_THICK, 3.8, matBridgeDeck, { minimapKind: 'arch' });
    this.addSolidBox(-18.0, DECK_Y + 0.55, -8.5 + 1.78, 20.0, 1.1, 0.2, matBridgeSteel);
    const rgWS = new THREE.Mesh(new THREE.BoxGeometry(20.0, 0.08, 0.24), matMagentaAccent);
    rgWS.position.set(-18.0, DECK_Y + 1.12, -8.5 + 1.78);
    this.group.add(rgWS);
    this.addSolidBox(-18.0, DECK_Y + 0.55, -8.5 - 1.78, 14.4, 1.1, 0.2, matBridgeSteel);
    const rgWN = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.08, 0.24), matCyanAccent);
    rgWN.position.set(-18.0, DECK_Y + 1.12, -8.5 - 1.78);
    this.group.add(rgWN);
    this.addSmoothStaircase(-26.8, -18.2, -10.4, 2.4, DECK_Y, matBridgeDeck, matBridgeSteel, matCyanAccent);
    this.addSmoothStaircase(-9.2, -18.2, -10.4, 2.4, DECK_Y, matBridgeDeck, matBridgeSteel, matMagentaAccent);
  }

  // =========================================================================
  // 7. 14 REAL SCULPTED 3D GLB NYC STREET VEHICLES (SOLID TACTICAL COVER!)
  // =========================================================================
  private addGlbVehicle(
    x: number,
    z: number,
    rotY: number,
    glbId: DowntownCarGlbId,
    targetLen: number,
    targetH: number,
    tintHex?: number
  ): void {
    const approxW = targetLen > 5.6 ? 2.3 : 1.95;
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const bw = approxW * c + targetLen * s;
    const bd = approxW * s + targetLen * c;

    // Immediate tactical cover collider & minimap marker
    this.colliders.push({
      minX: x - bw * 0.5,
      maxX: x + bw * 0.5,
      minY: 0,
      maxY: targetH,
      minZ: z - bd * 0.5,
      maxZ: z + bd * 0.5,
    });
    this.minimapRects.push({ x, z, w: bw, d: bd, kind: 'crate' });

    const anchor = new THREE.Group();
    anchor.position.set(x, 0, z);
    anchor.rotation.y = rotY;
    this.glbRoot.add(anchor);

    // Subtle High-Tier evening asphalt headlight & taillight glow pools!
    const headPool = new THREE.Mesh(
      new THREE.PlaneGeometry(approxW * 1.1, 2.6),
      new THREE.MeshBasicMaterial({
        color: 0xffdf9a,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    headPool.rotation.x = -Math.PI / 2;
    headPool.position.set(0, 0.036, targetLen * 0.5 + 1.25);
    this.markHighTier(headPool);
    anchor.add(headPool);

    const tailPool = new THREE.Mesh(
      new THREE.PlaneGeometry(approxW * 1.0, 1.7),
      new THREE.MeshBasicMaterial({
        color: 0xff2240,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    tailPool.rotation.x = -Math.PI / 2;
    tailPool.position.set(0, 0.036, -targetLen * 0.5 - 0.8);
    this.markHighTier(tailPool);
    anchor.add(tailPool);

    // Load real sculpted 3D GLB car model & register its meshes for exact bullet spark raycasts!
    void loadDowntownGlb(`cars/${glbId}.glb`, 48).then((tpl) => {
      if (!tpl) return;
      const inst = fitGlbInstance(tpl, { uniformHeight: targetH });
      // Ensure car length feels authentic NYC scale
      const measured = new THREE.Box3().setFromObject(inst);
      const mSize = new THREE.Vector3();
      measured.getSize(mSize);
      if (mSize.z > 0.1) {
        const lenCorr = THREE.MathUtils.clamp(targetLen / mSize.z, 0.78, 1.35);
        inst.scale.multiplyScalar(lenCorr);
      }
      styleGlbCarForMidnightNyc(inst, tintHex);
      anchor.add(inst);
      inst.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          this.raycastMeshes.push(o);
        }
      });
    });
  }

  private buildUniqueGlbVehicles(): void {
    // 14 COMPLETELY DIFFERENT REAL 3D GLB VEHICLES positioned cleanly along Manhattan avenues!
    const placements: Array<[number, number, number, DowntownCarGlbId, number, number, number?]> = [
      [-15.2, 21.0, 0.04, 'taxi', 4.5, 1.65], // Classic NYC Yellow Taxi on Broadway
      [-20.8, 15.2, Math.PI - 0.03, 'police', 4.7, 1.7], // NYPD Police Cruiser near Times Square
      [-15.4, -14.0, -0.04, 'race-future', 4.6, 1.32, 0x72e6ff], // Neon Cyber Hypercar North Broadway
      [-6.5, 4.5, Math.PI * 0.5 + 0.02, 'delivery', 5.8, 2.55], // Midtown Delivery Truck on 42nd St
      [16.8, 22.0, 0.03, 'sedan-sports', 4.6, 1.5, 0xff6276], // Sports Coupe on 5th Ave
      [22.4, 15.0, Math.PI, 'van', 5.1, 2.15, 0xa8c8ff], // Commercial Van on 5th Ave
      [5.8, 35.5, -Math.PI * 0.5 + 0.03, 'sedan', 4.6, 1.6, 0x98b4dc], // Executive Sedan on 36th St
      [-8.5, 35.5, Math.PI * 0.5 - 0.04, 'firetruck', 6.8, 2.75], // FDNY Firetruck on 36th St
      [22.2, -4.8, Math.PI, 'garbage-truck', 6.4, 2.65], // NYC Sanitation Truck East 5th Ave
      [8.2, 4.5, -Math.PI * 0.5, 'suv-luxury', 4.9, 1.85, 0x82d4f0], // Luxury Cyber SUV on 42nd St
      [-33.0, 4.5, Math.PI * 0.5 - 0.03, 'suv', 4.7, 1.82], // Midtown SUV West 42nd St
      [34.0, 4.5, -Math.PI * 0.5 + 0.03, 'truck', 5.6, 2.35], // Freight Truck East 42nd St
      [-21.0, -31.0, 0.06, 'ambulance', 5.6, 2.45], // FDNY Ambulance near Central Park West
      [-4.2, -19.0, Math.PI * 0.5, 'hatchback-sports', 4.1, 1.55, 0x78f0c8], // Compact Sport Hatch 52nd St
    ];
    for (const [vx, vz, rot, id, len, h, tint] of placements) {
      this.addGlbVehicle(vx, vz, rot, id, len, h, tint);
    }
  }

  // =========================================================================
  // 8. REAL GLB STREETLIGHTS, GLB TRAFFIC LIGHTS, STREET KITBASH & GLB TREES
  // =========================================================================
  private buildStreetFurnitureAndAvenueTrees(): void {
    const lamps: Array<[number, number, number]> = [
      [-24.2, 26, Math.PI * 0.5],
      [-24.2, 14, Math.PI * 0.5],
      [-24.2, -4, Math.PI * 0.5],
      [-24.2, -26, Math.PI * 0.5],
      [-11.6, 26, -Math.PI * 0.5],
      [-11.6, -4, -Math.PI * 0.5],
      [14.0, 26, Math.PI * 0.5],
      [14.0, -4, Math.PI * 0.5],
      [25.0, 26, -Math.PI * 0.5],
      [25.0, 12, -Math.PI * 0.5],
      [25.0, -4, -Math.PI * 0.5],
      [10, -24.5, 0],
      [26, -24.5, 0],
      [40, -24.5, 0],
    ];
    void loadDowntownGlb('props/Streetlight_Double.glb', 45).then((tpl) => {
      if (!tpl) return;
      lamps.forEach(([lx, lz, rot], idx) => {
        const inst = fitGlbInstance(tpl, { uniformHeight: 6.1, rotY: rot });
        inst.position.set(lx, 0, lz);
        inst.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (m instanceof THREE.MeshStandardMaterial && /light|glass/i.test(m.name)) {
                m.emissive.setHex(idx % 2 === 0 ? 0xffe29c : 0x86e8ff);
                m.emissiveIntensity = 1.6;
              }
            });
          }
        });
        if (idx % 2 === 1) {
          this.highTierGlbRoot.add(inst);
        } else {
          this.glbRoot.add(inst);
        }
      });
    });

    const intersections: Array<[number, number, number]> = [
      [-24.2, 10.6, 0],
      [-11.6, -1.6, Math.PI],
      [14.0, 10.6, 0],
      [25.0, -1.6, Math.PI],
    ];
    void loadDowntownGlb('props/TrafficLight.glb', 45).then((tpl) => {
      if (!tpl) return;
      for (const [tx, tz, rot] of intersections) {
        const inst = fitGlbInstance(tpl, { uniformHeight: 6.4, rotY: rot });
        inst.position.set(tx, 0, tz);
        inst.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (m instanceof THREE.MeshStandardMaterial) {
                if (/red/i.test(m.name)) {
                  m.emissive.setHex(0xff2a44);
                  m.emissiveIntensity = 1.8;
                } else if (/green/i.test(m.name)) {
                  m.emissive.setHex(0x28f48a);
                  m.emissiveIntensity = 1.8;
                }
              }
            });
          }
        });
        this.glbRoot.add(inst);
      }
    });

    // 12 Properly Aligned Manhattan Avenue Street Trees (straight symmetrical curb-side rows in granite tree-pits!)
    const streetTrees: Array<[number, number]> = [
      // West Broadway Sidewalk Row (x = -25.4, straight N-S line clear of buildings -27.75 & road -24.0!)
      [-25.4, 28.0],
      [-25.4, 16.5],
      [-25.4, -26.0],
      [-25.4, -36.5],
      // East Broadway Sidewalk Row (x = -10.5, symmetrical opposite Broadway!)
      [-10.5, 28.0],
      [-10.5, -26.0],
      // 5th Avenue West Sidewalk Row (x = 13.0, straight N-S line clear of Boutique building & skybridge!)
      [13.0, 29.0],
      [13.0, -10.5],
      [13.0, -17.5],
      // 5th Avenue East Sidewalk Row (x = 25.8, symmetrical opposite 5th Ave, clear of stairs & buildings!)
      [25.8, 29.0],
      [25.8, 14.2],
      [25.8, -10.5],
    ];
    streetTrees.forEach(([sx, sz], i) => this.addGlbTree(sx, sz, 22 + i, false));
  }

  private buildNycKitbashStreetDetails(): void {
    const matIron = this.getColorMat(0x161c28, 0.55, 0.72);
    const matSteel = this.getColorMat(0x3a465c, 0.45, 0.65);
    const matHydrant = this.getColorMat(0xb8222a, 0.42, 0.35);
    const matSignGreen = this.getColorMat(0x146c44, 0.5, 0.2);
    const matGlass = this.getColorMat(0x22466a, 0.14, 0.72, 0x1e4c78, 0.28);
    const matCraneYellow = this.getColorMat(0xd49622, 0.52, 0.42);
    const matRedBeacon = this.getBasicMat(0xff2c48);
    const matWarmGlow = this.getBasicMat(0xffe4a8);

    // 1. Cast-Iron NYC Zig-Zag Fire Escapes
    const addFireEscape = (x: number, z: number, rotY: number, floors: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.markHighTier(g);
      for (let f = 0; f < floors; f++) {
        const fy = 6.2 + f * 3.4;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.05), matIron);
        deck.position.set(0, fy, 0.52);
        g.add(deck);
        const railF = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.08), matIron);
        railF.position.set(0, fy + 0.92, 1.0);
        g.add(railF);
        for (const rx of [-1.65, -0.55, 0.55, 1.65]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.92, 0.06), matIron);
          post.position.set(rx, fy + 0.46, 1.0);
          g.add(post);
        }
        if (f < floors - 1) {
          const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 3.8), matIron);
          ladder.position.set(f % 2 === 0 ? 0.45 : -0.45, fy + 1.7, 0.65);
          ladder.rotation.z = f % 2 === 0 ? 0.65 : -0.65;
          ladder.rotation.y = Math.PI * 0.5;
          g.add(ladder);
        }
      }
      this.group.add(g);
    };
    addFireEscape(-27.7, -33.5, Math.PI * 0.5, 5);
    addFireEscape(-0.7, -31.5, Math.PI * 0.5, 5);
    addFireEscape(6.2, 22.3, Math.PI, 4);

    // 2. Illuminated Glass NYC Bus Stop Shelters
    const addBusStop = (x: number, z: number, rotY: number, adIdx: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.markHighTier(g);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 4.2), matIron);
      roof.position.set(0, 2.75, 0);
      g.add(roof);
      const roofGlow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 3.8), matWarmGlow);
      roofGlow.position.set(0, 2.66, 0);
      g.add(roofGlow);
      const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 3.8), matGlass);
      backGlass.position.set(-0.62, 1.35, 0);
      g.add(backGlass);
      for (const sz of [-1.95, 1.95]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.75, 8), matIron);
        col.position.set(-0.62, 1.38, sz);
        g.add(col);
      }
      const adBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.22), matIron);
      adBox.position.set(0, 1.4, 2.02);
      g.add(adBox);
      const adFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 1.95),
        this.wideBillboardMats[adIdx % this.wideBillboardMats.length]
      );
      adFace.position.set(0, 1.4, 2.15);
      g.add(adFace);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 2.4), matSteel);
      bench.position.set(-0.34, 0.52, -0.2);
      g.add(bench);
      this.group.add(g);
    };
    addBusStop(-26.3, 24.0, 0, 8);
    addBusStop(26.5, 24.0, Math.PI, 4);

    // 3. Classic Red NYC Fire Hydrants & Street Trash Cans
    for (const [hx, hz] of [
      [-23.6, 12.2],
      [-12.4, 12.2],
      [14.8, 12.2],
      [24.2, -3.2],
      [-23.6, 29.2],
      [14.8, -14.8],
    ]) {
      const hg = new THREE.Group();
      hg.position.set(hx, 0, hz);
      this.markHighTier(hg);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.72, 10), matHydrant);
      body.position.y = 0.36;
      hg.add(body);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), matSteel);
      cap.position.y = 0.72;
      hg.add(cap);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 8), matSteel);
      nozzle.rotation.z = Math.PI * 0.5;
      nozzle.position.y = 0.52;
      hg.add(nozzle);
      this.group.add(hg);
    }

    for (const [bx, bz] of [
      [-23.6, 10.2],
      [-12.4, 28.8],
      [14.8, 10.2],
      [24.2, 10.2],
      [-23.6, -3.2],
      [12.2, -25.0],
      [25.5, -25.0],
    ]) {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.84, 10), matIron);
      bin.position.set(bx, 0.42, bz);
      this.markHighTier(bin);
      this.group.add(bin);
    }

    // 4. Green Manhattan Street Signs + ONE WAY Signs
    for (const [sx, sz] of [
      [-23.8, 11.4],
      [-12.0, 11.4],
      [14.4, 11.4],
      [24.6, -2.4],
    ]) {
      const sg = new THREE.Group();
      sg.position.set(sx, 0, sz);
      this.markHighTier(sg);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 3.6, 6), matSteel);
      pole.position.y = 1.8;
      sg.add(pole);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 0.05), matSignGreen);
      b1.position.y = 3.45;
      sg.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 1.15), matSignGreen);
      b2.position.y = 3.18;
      sg.add(b2);
      const oneWay = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.05), this.getColorMat(0xe8eef6, 0.5, 0.1));
      oneWay.position.y = 2.68;
      sg.add(oneWay);
      this.group.add(sg);
    }

    // 5. Real Sculpted GLB Stacked AC Units (grounded flush in alleys & on verified flat roofs — zero floating props!)
    void loadDowntownGlb('props/AC_Stacked.glb', 45).then((tpl) => {
      if (!tpl) return;
      for (const [ax, ay, az, rot] of [
        [-29.0, 0, 12.2, Math.PI * 0.5],
        [29.5, 0, 12.2, -Math.PI * 0.5],
        [-39.5, 30.0, -35.5, 0], // Flush on W3 flat roof (h=30)
        [-6.5, 28.0, -32.5, 0], // Flush on NW Center flat roof (h=28)
      ]) {
        const inst = fitGlbInstance(tpl, { uniformHeight: 2.0, rotY: rot });
        inst.position.set(ax, ay, az);
        this.highTierGlbRoot.add(inst);
      }
    });

    void loadDowntownGlb('props/Antenna_2.glb', 45).then((tpl) => {
      if (!tpl) return;
      for (const [ax, ay, az] of [
        [-34.0, 30.0, -31.5], // Flush on W3 flat roof (h=30)
        [-4.2, 28.0, -29.5], // Flush on NW Center flat roof (h=28)
      ]) {
        const inst = fitGlbInstance(tpl, { uniformHeight: 6.5 });
        inst.position.set(ax, ay, az);
        this.highTierGlbRoot.add(inst);
      }
    });

    // 6. Iconic Lit Manhattan Skyscraper Construction Tower Crane rising behind the NW skyline!
    const crane = new THREE.Group();
    crane.position.set(-54, 0, -56);
    this.markHighTier(crane);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.8, 108, 1.8), matCraneYellow);
    mast.position.y = 54;
    crane.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(44, 1.6, 1.4), matCraneYellow);
    jib.position.set(12, 106, 0);
    jib.rotation.y = 0.42;
    crane.add(jib);
    for (const bx of [-6, 12, 30]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 6), matRedBeacon);
      light.position.set(bx, 107.6, -bx * 0.4);
      crane.add(light);
    }
    this.group.add(crane);
  }

  // =========================================================================
  // 9. ICONIC EMPIRE STATE BUILDING, CHRYSLER BUILDING & 22 REAL GLB SKYLINE TOWERS
  // =========================================================================
  private buildManhattanSkyline(): void {
    const matCyan = this.getBasicMat(0x46e8ff);
    const matMagenta = this.getBasicMat(0xff46b8);
    const matWarmWhite = this.getBasicMat(0xffe6b8);
    const matBeacon = this.getBasicMat(0xff2a48);

    // 1. EMPIRE STATE BUILDING (SW Midtown Landmark: x = -72, z = 52, 162m tall!)
    {
      const g = new THREE.Group();
      g.position.set(-72, 0, 52);
      const matLimestone = this.facadeMats.get('artDecoLimestone')!;
      const matSilver = this.getColorMat(0xa8bdd4, 0.28, 0.78);
      const matStonePier = this.getColorMat(0x4a5b74, 0.72, 0.15);

      const tiers: Array<[number, number, number, number]> = [
        [30, 18, 22, 9],
        [23, 30, 17, 33],
        [17, 48, 13, 72],
        [11.5, 18, 9.5, 105],
        [7.4, 11, 7.4, 119.5],
      ];
      for (const [w, h, d, cy] of tiers) {
        const m = new THREE.Mesh(this.makeScaledBoxGeo(w, h, d, 16, 26), matLimestone);
        m.position.y = cy;
        g.add(m);
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const buttress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 88, 1.4), matStonePier);
          buttress.position.set(sx * 8.2, 48, sz * 6.2);
          g.add(buttress);
        }
      }
      for (const [w, d, y, mGlow] of [
        [23.5, 17.5, 48.2, matCyan],
        [17.5, 13.5, 96.2, matMagenta],
        [11.9, 9.9, 114.2, matWarmWhite],
        [7.8, 7.8, 125.2, matCyan],
      ] as Array<[number, number, number, THREE.Material]>) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(w, 0.72, d), mGlow);
        ring.position.y = y;
        g.add(ring);
      }
      const mastBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 13, 14), matSilver);
      mastBase.position.y = 131.5;
      g.add(mastBase);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.0, 24, 10), matSilver);
      spire.position.y = 149.5;
      g.add(spire);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6), matBeacon);
      beacon.position.y = 161.8;
      g.add(beacon);
      this.group.add(g);
    }

    // 2. CHRYSLER BUILDING (East Midtown Masterpiece: x = +74, z = +8, 150m tall!)
    {
      const g = new THREE.Group();
      g.position.set(74, 0, 8);
      const matChrome = this.facadeMats.get('chryslerChrome')!;
      const matSteel = this.getColorMat(0xbcd0e6, 0.22, 0.86);

      const b1 = new THREE.Mesh(this.makeScaledBoxGeo(24, 24, 24, 16, 26), matChrome);
      b1.position.y = 12;
      g.add(b1);
      const b2 = new THREE.Mesh(this.makeScaledBoxGeo(17.5, 60, 17.5, 16, 26), matChrome);
      b2.position.y = 54;
      g.add(b2);
      const b3 = new THREE.Mesh(this.makeScaledBoxGeo(13.8, 16, 13.8, 16, 26), matChrome);
      b3.position.y = 92;
      g.add(b3);

      for (let t = 0; t < 7; t++) {
        const frac = t / 7;
        const size = 12.8 * (1 - frac * 0.72);
        const y = 101.5 + t * 3.5;
        const crownTier = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.56, size * 0.7, 3.5, 8), matSteel);
        crownTier.rotation.y = Math.PI / 8;
        crownTier.position.y = y;
        g.add(crownTier);

        const winCount = Math.max(3, 7 - t);
        const rOut = size * 0.65;
        for (let face = 0; face < 4; face++) {
          const baseAng = face * Math.PI * 0.5;
          for (let w = 0; w < winCount; w++) {
            const spread = ((w + 0.5) / winCount - 0.5) * 0.95;
            const ang = baseAng + spread;
            const tri = new THREE.Mesh(
              new THREE.ConeGeometry(0.45 * (1 - frac * 0.35), 1.35 * (1 - frac * 0.25), 3),
              t % 2 === 0 ? matWarmWhite : matCyan
            );
            tri.position.set(Math.sin(ang) * rOut, y + 0.1, Math.cos(ang) * rOut);
            tri.rotation.y = ang;
            g.add(tri);
          }
        }
      }

      const needle = new THREE.Mesh(new THREE.ConeGeometry(1.1, 24, 8), matSteel);
      needle.position.y = 136;
      g.add(needle);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), matCyan);
      tip.position.y = 148.5;
      g.add(tip);
      this.group.add(g);
    }

    // 3. 22 CHRYSLER-GRADE PHOTOREALISTIC SCULPTED MIDTOWN SKYLINE SKYSCRAPERS encircling all 4 horizons!
    const styles: FacadeStyle[] = [
      'midnightGlass',
      'artDecoLimestone',
      'chryslerChrome',
      'cobaltGlass',
      'obsidianSteel',
      'bronzeArtDeco',
      'midtownMasonry',
      'brownstoneNight',
    ];
    const crownCycle: CrownSilhouette[] = [
      'artDecoTerrace',
      'vanderbiltSpire',
      'rockefellerSlab',
      'citigroupSlant',
      'twinSpireTower',
      'artDecoTerrace',
    ];
    const glowCycle = [0x42e8ff, 0xff46b8, 0xffe298, 0x4aa8ff, 0x56ffc8, 0xff62a8];

    const outerTowers: Array<[number, number, number, number, number, boolean]> = [
      [-54, -74, 22, 20, 88, false],
      [-28, -76, 20, 18, 108, false],
      [-4, -80, 16, 16, 124, false],
      [20, -78, 22, 20, 84, false],
      [46, -75, 20, 18, 98, false],
      [70, -64, 22, 20, 78, false],
      [76, -34, 22, 20, 92, false],
      [78, -14, 20, 18, 74, false],
      [76, 38, 22, 20, 86, false],
      [68, 64, 20, 20, 96, false],
      [40, 74, 22, 20, 82, false],
      [14, 76, 20, 20, 104, false],
      [-12, 78, 22, 18, 90, false],
      [-40, 74, 20, 20, 76, false],
      [-76, 26, 22, 20, 94, false],
      [-78, 0, 24, 20, 112, false],
      [-76, -26, 20, 20, 80, false],
      [-70, -52, 22, 18, 88, false],
      [-48, -106, 26, 24, 118, true],
      [34, -104, 24, 22, 114, true],
      [98, -6, 26, 24, 108, true],
      [-98, -10, 26, 24, 104, true],
    ];

    outerTowers.forEach(([ox, oz, ow, od, oh, highOnly], idx) => {
      const style = styles[idx % styles.length];
      const mat = this.facadeMats.get(style)!;
      const crown = crownCycle[idx % crownCycle.length];
      const glowHex = glowCycle[idx % glowCycle.length];

      // Lower podium + tall photorealistic lit-window skyscraper shaft
      const shaft = new THREE.Mesh(this.makeScaledBoxGeo(ow, oh, od, 16, 26), mat);
      shaft.position.set(ox, oh * 0.5, oz);
      if (highOnly) this.markHighTier(shaft);
      this.group.add(shaft);

      // Sculpted iconic NYC crown + glowing floodlit collars & spires (matches Chrysler & Empire State!)
      this.addSculptedCrown(ox, oz, ow, od, oh, crown, mat, glowHex, highOnly);
    });
  }

  // =========================================================================
  // 10. OBSTACLE-FREE CONNECTED MIDTOWN PEDESTRIAN GRAPH
  // =========================================================================
  private buildPedestrianGraph(): PedestrianNode[] {
    return [
      { x: -24.6, z: 32.0, neighbors: [1, 7] },
      { x: -24.6, z: 11.2, neighbors: [0, 2, 8], isPlazaOrCrosswalk: true },
      { x: -24.6, z: -2.0, neighbors: [1, 3, 9], isPlazaOrCrosswalk: true },
      { x: -24.6, z: -22.5, neighbors: [2, 4, 10], isPlazaOrCrosswalk: true },
      { x: -24.6, z: -42.0, neighbors: [3, 5] },
      { x: -11.4, z: -45.5, neighbors: [4, 6, 10] },
      { x: 11.0, z: -45.5, neighbors: [5, 18] },
      { x: -11.4, z: 32.0, neighbors: [0, 12, 26] },
      { x: -11.4, z: 11.2, neighbors: [1, 9, 26], isPlazaOrCrosswalk: true },
      { x: -11.4, z: -2.0, neighbors: [2, 8, 10, 14], isPlazaOrCrosswalk: true },
      { x: -11.4, z: -22.5, neighbors: [3, 5, 9, 11], isPlazaOrCrosswalk: true },
      { x: 1.5, z: -22.5, neighbors: [10, 19] },
      { x: 1.5, z: 32.0, neighbors: [7, 16, 27] },
      { x: 3.5, z: 11.2, neighbors: [14, 17, 28], isPlazaOrCrosswalk: true },
      { x: 3.5, z: -2.0, neighbors: [9, 13, 15, 19], isPlazaOrCrosswalk: true },
      { x: 13.6, z: -2.0, neighbors: [14, 17, 19, 20], isPlazaOrCrosswalk: true },
      { x: 13.6, z: 32.0, neighbors: [12, 17, 21] },
      { x: 13.6, z: 11.2, neighbors: [13, 15, 16, 22], isPlazaOrCrosswalk: true },
      { x: 11.0, z: -26.5, neighbors: [6, 19, 23], isPlazaOrCrosswalk: true },
      { x: 11.0, z: -14.5, neighbors: [11, 14, 15, 18, 25] },
      { x: 25.4, z: -2.0, neighbors: [15, 22, 25], isPlazaOrCrosswalk: true },
      { x: 25.4, z: 32.0, neighbors: [16, 22] },
      { x: 25.4, z: 11.2, neighbors: [17, 20, 21], isPlazaOrCrosswalk: true },
      { x: 27.5, z: -26.5, neighbors: [18, 24, 25], isPlazaOrCrosswalk: true },
      { x: 38.5, z: -26.5, neighbors: [23] },
      { x: 27.5, z: -14.5, neighbors: [19, 20, 23] },
      { x: -11.4, z: 20.5, neighbors: [7, 8, 27], isPlazaOrCrosswalk: true },
      { x: -2.0, z: 20.5, neighbors: [12, 26, 28], isPlazaOrCrosswalk: true },
      { x: 3.5, z: 20.2, neighbors: [13, 27], isPlazaOrCrosswalk: true },
    ];
  }

  // =========================================================================
  // 11. GRAPHICS-TIER-AWARE STATIC GEOMETRY BATCHER
  // =========================================================================
  private batchStaticMeshes(): void {
    this.group.updateMatrixWorld(true);
    const raycastSet = new Set<THREE.Object3D>(this.raycastMeshes);

    type Bucket = {
      mat: THREE.Material;
      geos: THREE.BufferGeometry[];
      isRaycast: boolean;
      castShadow: boolean;
      receiveShadow: boolean;
      lowEndOptional: boolean;
    };
    const buckets = new Map<string, Bucket>();
    const meshesToRemove: THREE.Mesh[] = [];

    const hasLowEndFlag = (obj: THREE.Object3D): boolean => {
      let cur: THREE.Object3D | null = obj;
      while (cur && cur !== this.group) {
        if (cur.userData?.lowEndOptional) return true;
        cur = cur.parent;
      }
      return false;
    };

    const sliceAttr = (
      attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
      start: number,
      count: number
    ): THREE.BufferAttribute => {
      const sz = attr.itemSize;
      const out = new Float32Array(count * sz);
      if (attr instanceof THREE.BufferAttribute && attr.array instanceof Float32Array) {
        out.set(attr.array.subarray(start * sz, (start + count) * sz));
      } else {
        for (let i = 0; i < count; i++) {
          const idx = start + i;
          out[i * sz] = attr.getX(idx);
          if (sz > 1) out[i * sz + 1] = attr.getY(idx);
          if (sz > 2) out[i * sz + 2] = attr.getZ(idx);
          if (sz > 3) out[i * sz + 3] = attr.getW(idx);
        }
      }
      return new THREE.BufferAttribute(out, sz);
    };

    const pushPart = (
      nonIdx: THREE.BufferGeometry,
      start: number,
      count: number,
      mat: THREE.Material,
      worldMat: THREE.Matrix4,
      isRaycast: boolean,
      castShadow: boolean,
      receiveShadow: boolean,
      lowEndOptional: boolean
    ) => {
      if (count <= 0) return;
      const posAttr = nonIdx.getAttribute('position');
      if (!posAttr || start + count > posAttr.count) return;
      const normAttr = nonIdx.getAttribute('normal');
      const uvAttr = nonIdx.getAttribute('uv');
      const colAttr = nonIdx.getAttribute('color');

      const sub = new THREE.BufferGeometry();
      sub.setAttribute('position', sliceAttr(posAttr, start, count));
      if (normAttr) {
        sub.setAttribute('normal', sliceAttr(normAttr, start, count));
      } else {
        sub.computeVertexNormals();
      }
      const hasUv = Boolean(uvAttr);
      const hasCol = Boolean(colAttr);
      if (uvAttr) sub.setAttribute('uv', sliceAttr(uvAttr, start, count));
      if (colAttr) sub.setAttribute('color', sliceAttr(colAttr, start, count));
      sub.applyMatrix4(worldMat);

      const key = `${mat.uuid}|${hasUv ? 'U' : ''}${hasCol ? 'C' : ''}|${isRaycast ? 'R' : 'D'}|${castShadow ? 'S' : ''}|${receiveShadow ? 'V' : ''}|${lowEndOptional ? 'H' : 'C'}`;
      let b = buckets.get(key);
      if (!b) {
        b = { mat, geos: [], isRaycast, castShadow, receiveShadow, lowEndOptional };
        buckets.set(key, b);
      }
      b.geos.push(sub);
    };

    const candidates: THREE.Mesh[] = [];
    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.material instanceof THREE.ShaderMaterial) return;
      candidates.push(obj);
    });

    for (const mesh of candidates) {
      const src = mesh.geometry;
      if (!src || !src.getAttribute('position')) continue;
      const isRay = raycastSet.has(mesh);
      const lowOpt = hasLowEndFlag(mesh);
      const nonIdx = src.index ? src.toNonIndexed() : src;
      const totalVerts = nonIdx.getAttribute('position').count;

      if (Array.isArray(mesh.material)) {
        const groups = nonIdx.groups.length > 0 ? nonIdx.groups : src.groups;
        if (groups.length === 0) {
          if (nonIdx !== src) nonIdx.dispose();
          continue;
        }
        for (const grp of groups) {
          const mat = mesh.material[grp.materialIndex ?? 0];
          if (!mat) continue;
          const cnt = grp.count === Infinity ? totalVerts - grp.start : grp.count;
          pushPart(nonIdx, grp.start, cnt, mat, mesh.matrixWorld, isRay, mesh.castShadow, mesh.receiveShadow, lowOpt);
        }
      } else {
        pushPart(nonIdx, 0, totalVerts, mesh.material, mesh.matrixWorld, isRay, mesh.castShadow, mesh.receiveShadow, lowOpt);
      }

      if (nonIdx !== src) nonIdx.dispose();
      meshesToRemove.push(mesh);
    }

    for (const m of meshesToRemove) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const ch = this.group.children[i];
      if (ch instanceof THREE.Group && ch.children.length === 0) {
        this.group.remove(ch);
      }
    }

    const newRaycastMeshes: THREE.Object3D[] = [];
    for (const oldRay of this.raycastMeshes) {
      if (oldRay.parent) newRaycastMeshes.push(oldRay);
    }

    for (const b of buckets.values()) {
      const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (b.geos.length > 1) {
        for (const g of b.geos) g.dispose();
      }
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mergedMesh = new THREE.Mesh(merged, b.mat);
      mergedMesh.castShadow = b.castShadow;
      mergedMesh.receiveShadow = b.receiveShadow;
      if (b.lowEndOptional) {
        mergedMesh.userData.lowEndOptional = true;
      }
      mergedMesh.matrixAutoUpdate = false;
      mergedMesh.updateMatrix();
      this.group.add(mergedMesh);
      if (b.isRaycast) {
        newRaycastMeshes.push(mergedMesh);
      }
    }

    this.raycastMeshes = newRaycastMeshes;
  }
}
