import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { smoothGeometryNormals } from '../utils/MeshSmoothing';
import { getDowntownTextures } from './DowntownTextures';

export const DOWNTOWN_CAR_GLBS = [
  'taxi',
  'police',
  'race-future',
  'delivery',
  'sedan-sports',
  'van',
  'sedan',
  'truck',
  'garbage-truck',
  'suv-luxury',
  'suv',
  'firetruck',
  'ambulance',
  'hatchback-sports',
] as const;
export type DowntownCarGlbId = (typeof DOWNTOWN_CAR_GLBS)[number];

export const DOWNTOWN_NPC_GLBS = [
  'man_casual',
  'woman_casual',
  'man_suit',
  'woman_formal',
  'man_casual2',
  'woman_suit',
  'man_punk',
  'woman_punk',
  'man_worker',
  'woman_scifi',
  'cyber_char',
] as const;
export type DowntownNpcGlbId = (typeof DOWNTOWN_NPC_GLBS)[number];

export const DOWNTOWN_TREE_GLBS = [
  'CommonTree_1',
  'CommonTree_2',
  'CommonTree_Autumn_1',
  'CommonTree_Autumn_3',
  'BirchTree_1',
  'BirchTree_Autumn_2',
  'Willow_1',
  'Willow_Autumn_1',
  'PineTree_1',
  'PineTree_3',
] as const;
export type DowntownTreeGlbId = (typeof DOWNTOWN_TREE_GLBS)[number];

export const DOWNTOWN_PROP_GLBS = [
  'TrafficLight',
  'Streetlight_Double',
  'AC_Stacked',
  'Antenna_2',
] as const;
export type DowntownPropGlbId = (typeof DOWNTOWN_PROP_GLBS)[number];

export interface LoadedGlbTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  rawBox: THREE.Box3;
  rawSize: THREE.Vector3;
}

const gltfLoader = new GLTFLoader();
const templateCache = new Map<string, LoadedGlbTemplate>();
const inflightCache = new Map<string, Promise<LoadedGlbTemplate | null>>();

export function loadDowntownGlb(relPath: string, creaseAngle = 52): Promise<LoadedGlbTemplate | null> {
  const existing = templateCache.get(relPath);
  if (existing) return Promise.resolve(existing);

  const pending = inflightCache.get(relPath);
  if (pending) return pending;

  const baseUrl = `/models/downtown/${relPath}`;
  const promise = new Promise<LoadedGlbTemplate | null>((resolve) => {
    const attempt = (retriesLeft: number) => {
      const url = retriesLeft === 2 ? baseUrl : `${baseUrl}?r=${2 - retriesLeft}`;
      gltfLoader.load(
        url,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              smoothGeometryNormals(mesh.geometry, creaseAngle);
              mesh.frustumCulled = true;
            }
          });
          const rawBox = new THREE.Box3().setFromObject(gltf.scene);
          const rawSize = new THREE.Vector3();
          rawBox.getSize(rawSize);
          const tpl: LoadedGlbTemplate = {
            scene: gltf.scene,
            animations: gltf.animations || [],
            rawBox,
            rawSize,
          };
          templateCache.set(relPath, tpl);
          inflightCache.delete(relPath);
          resolve(tpl);
        },
        undefined,
        (err) => {
          if (retriesLeft > 0) {
            window.setTimeout(() => attempt(retriesLeft - 1), (3 - retriesLeft) * 700);
            return;
          }
          console.warn(`[DowntownGlbAssets] Failed loading ${baseUrl}:`, err);
          inflightCache.delete(relPath);
          resolve(null);
        }
      );
    };
    attempt(2);
  });

  inflightCache.set(relPath, promise);
  return promise;
}

/**
 * Fits a cloned GLB cleanly into target (width, height, depth) or uniform height, grounded flush at y = 0
 * and centered on X/Z so every building, car, tree, and NPC sits perfectly on the Manhattan street!
 */
export function fitGlbInstance(
  tpl: LoadedGlbTemplate,
  opts: {
    skinned?: boolean;
    targetH?: number;
    targetW?: number;
    targetD?: number;
    uniformHeight?: number;
    rotY?: number;
  }
): THREE.Group {
  const clone = (opts.skinned ? SkeletonUtils.clone(tpl.scene) : tpl.scene.clone(true)) as THREE.Group;
  const wrapper = new THREE.Group();

  const sx = Math.max(1e-4, tpl.rawSize.x);
  const sy = Math.max(1e-4, tpl.rawSize.y);
  const sz = Math.max(1e-4, tpl.rawSize.z);

  let scaleX = 1;
  let scaleY = 1;
  let scaleZ = 1;
  if (opts.uniformHeight !== undefined) {
    const s = opts.uniformHeight / sy;
    scaleX = s;
    scaleY = s;
    scaleZ = s;
  } else {
    scaleX = opts.targetW !== undefined ? opts.targetW / sx : 1;
    scaleY = opts.targetH !== undefined ? opts.targetH / sy : scaleX;
    scaleZ = opts.targetD !== undefined ? opts.targetD / sz : scaleX;
  }

  clone.scale.set(scaleX, scaleY, scaleZ);
  clone.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(clone);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Center X/Z at 0 and ground bottom flush on y = 0!
  clone.position.set(-center.x, -box.min.y, -center.z);
  wrapper.add(clone);
  if (opts.rotY) wrapper.rotation.y = opts.rotY;
  return wrapper;
}

/**
 * Styles real 3D GLB cars with glossy automotive paint & subtle midnight-NYC metallic reflections!
 */
export function styleGlbCarForMidnightNyc(root: THREE.Object3D, tintHex?: number): void {
  const tint = tintHex ? new THREE.Color(tintHex) : null;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((orig) => {
      const m = orig.clone() as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial) return m;
      m.flatShading = false;
      if (tint) m.color.multiply(tint);
      m.roughness = 0.28;
      m.metalness = 0.46;
      m.envMapIntensity = 1.3;
      m.emissive.setHex(0x0d172c);
      m.emissiveIntensity = 0.25;
      m.needsUpdate = true;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

/**
 * Styles real 3D GLB trees for luminous midnight Central Park & Manhattan avenues!
 */
export function styleGlbTreeForMidnightNyc(root: THREE.Object3D, foliageTintHex?: number): void {
  const fTint = foliageTintHex ? new THREE.Color(foliageTintHex) : new THREE.Color(0x88b4cc);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((orig) => {
      const m = orig.clone() as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial) return m;
      m.flatShading = false;
      const name = (m.name || '').toLowerCase();
      if (name.includes('wood') || name.includes('bark')) {
        m.color.multiply(new THREE.Color(0x746b68));
        m.roughness = 0.9;
      } else {
        m.color.multiply(fTint);
        m.emissive.copy(m.color);
        m.emissiveIntensity = 0.22;
        m.roughness = 0.78;
      }
      m.needsUpdate = true;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

let preloadStarted = false;

/**
 * Background-preloads all Downtown CC0 GLB assets (cars, rigged NPCs, trees, buildings & props)
 * so entering a DOWNTOWN TDM match renders real 3D models immediately on Frame 1!
 */
export function preloadDowntownGlbs(): void {
  if (preloadStarted) return;
  preloadStarted = true;

  // Preload all 11 photorealistic Manhattan building/billboard/road JPG textures + rigged NPCs & street props!
  // (Realistic curved PBR NYC vehicles & botanical alpha-leaf trees build synchronously with zero GLB wait!)
  getDowntownTextures();
  for (const n of DOWNTOWN_NPC_GLBS) void loadDowntownGlb(`npcs/${n}.glb`, 62);
  for (const p of DOWNTOWN_PROP_GLBS) void loadDowntownGlb(`props/${p}.glb`, 45);
}
