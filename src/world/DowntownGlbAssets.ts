import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createDracoGltfLoader } from '../utils/GlbLoader';
import { smoothGeometryNormals } from '../utils/MeshSmoothing';

export const DOWNTOWN_CITY_GLB = 'city/cyberpunk_city.glb';
export const DOWNTOWN_CITY_LOW_GLB = 'city/cyberpunk_city_low.glb';

export const DOWNTOWN_CAR_GLBS = [
  'lambo_aventador',
  'lambo_revuelto',
  'viper_patrol',
  'mercedes_amg_gt',
  'corvette_c8',
  'challenger_hellcat',
  'ford_mustang',
  'camaro_zl1',
  'vw_golf_gti',
  'honda_integra',
] as const;
export type DowntownCarGlbId = (typeof DOWNTOWN_CAR_GLBS)[number];

/** Neutral T-pose / A-pose rigged NPCs that actively walk & roam freely across Cyberpunk City! */
export const DOWNTOWN_WALKER_NPCS = [
  'zira_isaac',
  'android18',
  'hinata',
  'outis',
  'cammy',
  'sakura',
] as const;

/** Stylish standing-pose NPCs that hang out naturally beside supercars & storefronts! */
export const DOWNTOWN_CROWD_NPCS = [
  'mai',
  'kayden',
  'office_elegance',
  'unboxing_allure',
  'gangsta_girl',
] as const;

export const DOWNTOWN_NPC_GLBS = [...DOWNTOWN_WALKER_NPCS, ...DOWNTOWN_CROWD_NPCS] as const;
export type DowntownNpcGlbId = (typeof DOWNTOWN_NPC_GLBS)[number];

export interface LoadedGlbTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  rawBox: THREE.Box3;
  rawSize: THREE.Vector3;
}

const gltfLoader = createDracoGltfLoader();
const templateCache = new Map<string, LoadedGlbTemplate>();
const inflightCache = new Map<string, Promise<LoadedGlbTemplate | null>>();

// Concurrency-limited Draco GLB load queue (max 2 concurrent decodes so low-end laptops NEVER freeze or OOM!)
const MAX_CONCURRENT_GLBS = 2;
let activeGlbLoads = 0;
const glbLoadQueue: Array<() => void> = [];

function runQueuedGlbLoad<T>(priority: boolean, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const start = () => {
      activeGlbLoads++;
      fn().then((res) => {
        activeGlbLoads--;
        const next = glbLoadQueue.shift();
        if (next) next();
        resolve(res);
      });
    };
    if (activeGlbLoads < MAX_CONCURRENT_GLBS) {
      start();
    } else if (priority) {
      glbLoadQueue.unshift(start);
    } else {
      glbLoadQueue.push(start);
    }
  });
}

export function loadDowntownGlb(relPath: string, creaseAngle = 0): Promise<LoadedGlbTemplate | null> {
  const existing = templateCache.get(relPath);
  if (existing) return Promise.resolve(existing);

  const pending = inflightCache.get(relPath);
  if (pending) return pending;

  const baseUrl = `/models/downtown/${relPath}`;
  const isCityPriority = relPath.startsWith('city/');
  const promise = runQueuedGlbLoad(
    isCityPriority,
    () =>
      new Promise<LoadedGlbTemplate | null>((resolve) => {
        const attempt = (retriesLeft: number) => {
          const url = retriesLeft === 2 ? baseUrl : `${baseUrl}?r=${2 - retriesLeft}`;
          gltfLoader.load(
            url,
            (gltf) => {
              gltf.scene.updateMatrixWorld(true);
              gltf.scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (mesh.isMesh && mesh.geometry) {
                  if (creaseAngle > 0) {
                    smoothGeometryNormals(mesh.geometry, creaseAngle);
                  }
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
      })
  );

  inflightCache.set(relPath, promise);
  return promise;
}

/**
 * Fits a cloned GLB cleanly into target length / uniform height, grounded flush at y = 0
 * and centered on X/Z so every supercar & NPC sits perfectly on the Cyberpunk City boulevard!
 */
export function fitGlbInstance(
  tpl: LoadedGlbTemplate,
  opts: {
    skinned?: boolean;
    targetH?: number;
    targetW?: number;
    targetD?: number;
    uniformHeight?: number;
    uniformLength?: number;
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
  let autoRotY = 0;

  if (opts.uniformHeight !== undefined) {
    const s = opts.uniformHeight / sy;
    scaleX = s;
    scaleY = s;
    scaleZ = s;
  } else if (opts.uniformLength !== undefined) {
    // Auto-align long horizontal axis of car onto Z if exported sideways along X!
    if (sx > sz * 1.15) {
      autoRotY = Math.PI / 2;
    }
    const maxHoriz = Math.max(sx, sz);
    const s = opts.uniformLength / maxHoriz;
    scaleX = s;
    scaleY = s;
    scaleZ = s;
  } else {
    scaleX = opts.targetW !== undefined ? opts.targetW / sx : 1;
    scaleY = opts.targetH !== undefined ? opts.targetH / sy : scaleX;
    scaleZ = opts.targetD !== undefined ? opts.targetD / sz : scaleX;
  }

  clone.scale.set(scaleX, scaleY, scaleZ);
  if (autoRotY) clone.rotation.y += autoRotY;
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
 * Enhances real 3D downloaded supercars for vibrant synthwave-sunset & neon Cyberpunk Downtown reflections!
 */
export function styleGlbCarForCyberpunkDowntown(root: THREE.Object3D): void {
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
      const nm = (m.name || '').toLowerCase();
      if (nm.includes('glass') || nm.includes('window') || nm.includes('winsow')) {
        m.roughness = 0.08;
        m.metalness = 0.52;
        m.envMapIntensity = 2.0;
        m.emissive.setHex(0x162b46);
        m.emissiveIntensity = 0.35;
      } else if (nm.includes('tire') || nm.includes('tyre') || nm.includes('rubber')) {
        m.roughness = 0.84;
        m.metalness = 0.05;
      } else if (nm.includes('light') || nm.includes('lamp')) {
        m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.4);
      } else {
        m.roughness = Math.min(m.roughness, 0.32);
        m.metalness = Math.max(m.metalness, 0.38);
        m.envMapIntensity = 1.65;
        if (m.emissive.r + m.emissive.g + m.emissive.b < 0.04) {
          m.emissive.setHex(0x14192a);
          m.emissiveIntensity = 0.22;
        }
      }
      m.needsUpdate = true;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

let preloadStarted = false;

/**
 * Lightweight preloader: ONLY warms the active Cyberpunk City GLB (never blasts all 21 cars/NPCs upfront!),
 * letting supercars and NPCs stream cleanly 2-at-a-time via the Draco load queue when Downtown builds!
 */
export function preloadDowntownGlbs(isLowEnd = false): void {
  if (preloadStarted) return;
  preloadStarted = true;
  void loadDowntownGlb(isLowEnd ? DOWNTOWN_CITY_LOW_GLB : DOWNTOWN_CITY_GLB, 0);
}
