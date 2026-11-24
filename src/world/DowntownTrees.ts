import * as THREE from 'three';

export type DowntownTreeSpecies = 'greenOak' | 'goldenAutumn' | 'crimsonMaple' | 'silverWillow';

// ============================================================================
// Shared Cached Botanical Alpha-Cutout Foliage & Fissured Bark PBR Materials
// ============================================================================
let treeAssetsReady = false;
let matOakBark!: THREE.MeshStandardMaterial;
let matBirchBark!: THREE.MeshStandardMaterial;
const leafMats = new Map<DowntownTreeSpecies, THREE.MeshStandardMaterial>();

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Generates high-detail fissured oak or silver-birch bark diffuse + bump CanvasTextures.
 */
function createBarkMaterial(isBirch: boolean): THREE.MeshStandardMaterial {
  const w = 256;
  const h = 512;
  const diffC = document.createElement('canvas');
  diffC.width = w;
  diffC.height = h;
  const ctx = diffC.getContext('2d')!;

  const bumpC = document.createElement('canvas');
  bumpC.width = w;
  bumpC.height = h;
  const bCtx = bumpC.getContext('2d')!;

  const rand = seededRand(isBirch ? 44123 : 88217);

  if (isBirch) {
    ctx.fillStyle = '#c8c4bc';
    ctx.fillRect(0, 0, w, h);
    bCtx.fillStyle = '#909090';
    bCtx.fillRect(0, 0, w, h);

    // Subtle papery vertical tone strips
    for (let i = 0; i < 65; i++) {
      const x = rand() * w;
      const sw = 4 + rand() * 14;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(235,232,226,0.28)' : 'rgba(135,126,118,0.22)';
      ctx.fillRect(x, 0, sw, h);
    }
    // Iconic horizontal dark birch bark lenticels & knots
    for (let i = 0; i < 160; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const lw = 12 + rand() * 44;
      const lh = 2 + rand() * 5;
      ctx.fillStyle = rand() > 0.25 ? 'rgba(34,29,26,0.72)' : 'rgba(68,54,44,0.58)';
      ctx.fillRect(x, y, lw, lh);
      bCtx.fillStyle = '#262626';
      bCtx.fillRect(x, y, lw, lh);
    }
  } else {
    ctx.fillStyle = '#3b3029';
    ctx.fillRect(0, 0, w, h);
    bCtx.fillStyle = '#686868';
    bCtx.fillRect(0, 0, w, h);

    // Deep vertical organic oak/plane bark ridges & shaded fissures
    for (let i = 0; i < 220; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const rw = 3 + rand() * 10;
      const rh = 42 + rand() * 130;
      const light = rand();
      ctx.fillStyle =
        light > 0.65
          ? 'rgba(98, 84, 72, 0.58)'
          : light > 0.3
          ? 'rgba(68, 56, 48, 0.55)'
          : 'rgba(22, 17, 14, 0.78)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 14, y + rh * 0.5, x + (rand() - 0.5) * 8, y + rh);
      ctx.lineWidth = rw;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.quadraticCurveTo(x + (rand() - 0.5) * 10, y + rh * 0.5, x + (rand() - 0.5) * 6, y + rh);
      bCtx.lineWidth = rw;
      bCtx.strokeStyle = light > 0.5 ? '#c8c8c8' : '#1c1c1c';
      bCtx.stroke();
    }
  }

  const diffTex = new THREE.CanvasTexture(diffC);
  diffTex.colorSpace = THREE.SRGBColorSpace;
  diffTex.wrapS = THREE.RepeatWrapping;
  diffTex.wrapT = THREE.RepeatWrapping;
  diffTex.repeat.set(1, 2.5);

  const bumpTex = new THREE.CanvasTexture(bumpC);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(1, 2.5);

  return new THREE.MeshStandardMaterial({
    color: isBirch ? 0xd2d0d8 : 0xb8b0bc,
    map: diffTex,
    bumpMap: bumpTex,
    bumpScale: 0.08,
    roughness: 0.92,
    metalness: 0.04,
    emissive: new THREE.Color(isBirch ? 0x161224 : 0x120c18),
    emissiveIntensity: 0.32,
  });
}

/**
 * Draws an individual crisp botanical leaf (5-lobed maple, lobed oak, or weeping willow lance)
 * with realistic midrib vein & lateral shading for alpha-cutout foliage cards!
 */
function drawBotanicalLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  fillHex: string,
  veinHex: string,
  shapeKind: 'oak' | 'maple' | 'willow'
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = fillHex;
  ctx.beginPath();

  if (shapeKind === 'willow') {
    // Slender graceful weeping willow lance leaf
    const w = size * 0.24;
    const l = size * 1.35;
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w, -l * 0.4, 0, -l);
    ctx.quadraticCurveTo(-w, -l * 0.4, 0, 0);
  } else if (shapeKind === 'maple') {
    // Iconic 5-pointed serrated NYC maple leaf silhouette
    const s = size;
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.34, -s * 0.14);
    ctx.lineTo(s * 0.62, -s * 0.04);
    ctx.lineTo(s * 0.44, -s * 0.32);
    ctx.lineTo(s * 0.72, -s * 0.56);
    ctx.lineTo(s * 0.34, -s * 0.58);
    ctx.lineTo(s * 0.26, -s * 0.88);
    ctx.lineTo(0, -s * 1.08);
    ctx.lineTo(-s * 0.26, -s * 0.88);
    ctx.lineTo(-s * 0.34, -s * 0.58);
    ctx.lineTo(-s * 0.72, -s * 0.56);
    ctx.lineTo(-s * 0.44, -s * 0.32);
    ctx.lineTo(-s * 0.62, -s * 0.04);
    ctx.lineTo(-s * 0.34, -s * 0.14);
  } else {
    // Classic Central Park London Plane / Urban Oak lobed broad leaf
    const s = size;
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.46, -s * 0.16, s * 0.54, -s * 0.38);
    ctx.quadraticCurveTo(s * 0.36, -s * 0.44, s * 0.48, -s * 0.68);
    ctx.quadraticCurveTo(s * 0.26, -s * 0.76, 0, -s * 1.04);
    ctx.quadraticCurveTo(-s * 0.26, -s * 0.76, -s * 0.48, -s * 0.68);
    ctx.quadraticCurveTo(-s * 0.36, -s * 0.44, -s * 0.54, -s * 0.38);
    ctx.quadraticCurveTo(-s * 0.46, -s * 0.16, 0, 0);
  }

  ctx.closePath();
  ctx.fill();

  // Subtle botanical midrib & side veins so close-up leaves look real!
  ctx.strokeStyle = veinHex;
  ctx.lineWidth = Math.max(1, size * 0.042);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.04);
  ctx.lineTo(0, -size * (shapeKind === 'willow' ? 1.15 : 0.86));
  if (shapeKind !== 'willow') {
    ctx.moveTo(0, -size * 0.32);
    ctx.lineTo(size * 0.32, -size * 0.52);
    ctx.moveTo(0, -size * 0.32);
    ctx.lineTo(-size * 0.32, -size * 0.52);
    ctx.moveTo(0, -size * 0.58);
    ctx.lineTo(size * 0.22, -size * 0.74);
    ctx.moveTo(0, -size * 0.58);
    ctx.lineTo(-size * 0.22, -size * 0.74);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Creates a crisp 512x512 transparent alpha-cutout leafy tree bough texture with woody twigs
 * and 120+ layered individual botanical leaves (ZERO blocky blobs, ZERO white edge halos!).
 */
function createFoliageBoughMaterial(species: DowntownTreeSpecies): THREE.MeshStandardMaterial {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const rand = seededRand(
    species === 'greenOak'
      ? 10911
      : species === 'goldenAutumn'
      ? 20922
      : species === 'crimsonMaple'
      ? 30933
      : 40944
  );

  const palettes: Record<
    DowntownTreeSpecies,
    {
      shape: 'oak' | 'maple' | 'willow';
      darks: string[];
      mids: string[];
      lights: string[];
      vein: string;
      emissive: number;
    }
  > = {
    greenOak: {
      shape: 'oak',
      darks: ['#12291c', '#183623', '#1d4029'],
      mids: ['#255233', '#2e663d', '#387646'],
      lights: ['#4a8f54', '#5fa662', '#70b872'],
      vein: 'rgba(18, 42, 24, 0.45)',
      emissive: 0x0e241c,
    },
    goldenAutumn: {
      shape: 'maple',
      darks: ['#5a2410', '#783312', '#8e4014'],
      mids: ['#ba5a18', '#d6761c', '#e69022'],
      lights: ['#f2ad30', '#fcc84e', '#ffdc74'],
      vein: 'rgba(84, 32, 10, 0.48)',
      emissive: 0x301608,
    },
    crimsonMaple: {
      shape: 'maple',
      darks: ['#3e0b18', '#5c1222', '#74182c'],
      mids: ['#9e1c34', '#be243e', '#d6304c'],
      lights: ['#e8465e', '#f46278', '#ff828e'],
      vein: 'rgba(58, 10, 20, 0.5)',
      emissive: 0x2c0a16,
    },
    silverWillow: {
      shape: 'willow',
      darks: ['#18342a', '#204436', '#285242'],
      mids: ['#326852', '#3e7c62', '#4c8e70'],
      lights: ['#62a888', '#78bc9a', '#90cca8'],
      vein: 'rgba(20, 48, 36, 0.4)',
      emissive: 0x102822,
    },
  };

  const pal = palettes[species];
  const cx = size * 0.5;
  const cy = species === 'silverWillow' ? size * 0.14 : size * 0.52;

  // 1. Delicate woody twig skeleton inside the bough
  ctx.strokeStyle = species === 'silverWillow' ? '#4a4038' : '#32251d';
  ctx.lineCap = 'round';
  const twigTips: Array<[number, number, number]> = [];
  const twigCount = species === 'silverWillow' ? 9 : 8;
  for (let i = 0; i < twigCount; i++) {
    const ang =
      species === 'silverWillow'
        ? Math.PI * 0.18 + (i / (twigCount - 1)) * Math.PI * 0.64
        : (i / twigCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const len = species === 'silverWillow' ? 240 + rand() * 145 : 115 + rand() * 72;
    const ex = cx + Math.cos(ang) * len;
    const ey = cy + Math.sin(ang) * len;
    const mx = (cx + ex) * 0.5 + (rand() - 0.5) * 28;
    const my = (cy + ey) * 0.5 + (rand() - 0.5) * 28;

    ctx.lineWidth = species === 'silverWillow' ? 3.2 : 5.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();

    twigTips.push([mx, my, ang], [ex, ey, ang]);
  }

  // 2. Layered individual leaves (deep shadow core -> mid foliage -> sunlit rim tips!)
  const totalLeaves = species === 'silverWillow' ? 175 : 138;
  for (let i = 0; i < totalLeaves; i++) {
    const layer = i / totalLeaves; // 0 = shaded inner depth, 1 = crisp outer sunlit leaves
    let lx: number;
    let ly: number;
    let ang: number;

    if (species === 'silverWillow') {
      const tip = twigTips[i % twigTips.length];
      const frac = 0.15 + rand() * 0.92;
      lx = THREE.MathUtils.lerp(cx, tip[0], frac) + (rand() - 0.5) * 44;
      ly = THREE.MathUtils.lerp(cy, tip[1], frac) + (rand() - 0.5) * 32;
      // Drooping downward cascading willow angles!
      ang = Math.PI + (rand() - 0.5) * 0.85;
    } else {
      const rad = Math.pow(rand(), 0.62) * 188;
      const theta = rand() * Math.PI * 2;
      lx = cx + Math.cos(theta) * rad;
      ly = cy + Math.sin(theta) * rad;
      // Outward natural radial leaf growth angle
      ang = theta + Math.PI * 0.5 + (rand() - 0.5) * 0.9;
    }

    const leafSize =
      species === 'silverWillow'
        ? 38 + rand() * 34
        : (36 + rand() * 36) * (layer > 0.72 ? 0.88 : 1.08);
    const pool = layer < 0.34 ? pal.darks : layer < 0.74 ? pal.mids : pal.lights;
    const fillHex = pool[Math.floor(rand() * pool.length)];

    drawBotanicalLeaf(ctx, lx, ly, leafSize, ang, fillHex, pal.vein, pal.shape);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    roughness: 0.76,
    metalness: 0.04,
    emissive: new THREE.Color(pal.emissive),
    emissiveIntensity: 0.52,
  });
}

function ensureTreeMaterials(): void {
  if (treeAssetsReady) return;
  treeAssetsReady = true;

  matOakBark = createBarkMaterial(false);
  matBirchBark = createBarkMaterial(true);

  const allSpecies: DowntownTreeSpecies[] = ['greenOak', 'goldenAutumn', 'crimsonMaple', 'silverWillow'];
  for (const sp of allSpecies) {
    leafMats.set(sp, createFoliageBoughMaterial(sp));
  }
}

/**
 * Builds a gently domed/arched 3D foliage bough plane (NOT a flat cross!) whose vertex normals
 * wrap smoothly outward from the tree canopy center (AAA SpeedTree/GTA V smooth canopy shading!).
 */
function buildArchedLeafCardGeo(
  width: number,
  height: number,
  domeDepth: number,
  localPos: THREE.Vector3,
  localEuler: THREE.Euler,
  canopyCenter: THREE.Vector3
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 2, 2);
  const pos = geo.getAttribute('position');

  // Gently arch/cup the leaf card along local +Z so it looks lush & dimensional from every angle
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const nx = px / Math.max(0.01, width * 0.5);
    const ny = py / Math.max(0.01, height * 0.5);
    const arch = (1 - Math.min(1, (nx * nx + ny * ny) * 0.55)) * domeDepth;
    pos.setZ(i, arch);
  }

  // Transform card into tree space so we can bake smooth spherical canopy vertex normals!
  const mat4 = new THREE.Matrix4().compose(
    localPos,
    new THREE.Quaternion().setFromEuler(localEuler),
    new THREE.Vector3(1, 1, 1)
  );
  geo.applyMatrix4(mat4);

  const norm = geo.getAttribute('normal');
  const tmpV = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i++) {
    tmpV.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(canopyCenter);
    if (tmpV.lengthSq() < 1e-4) tmpV.set(0, 1, 0);
    else tmpV.normalize();
    // Blend 68% radial spherical canopy normal + 32% upward sky normal for lush backlit foliage!
    tmpV.lerp(upVec, 0.32).normalize();
    norm.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
  }
  norm.needsUpdate = true;
  return geo;
}

/**
 * Builds a realistic multi-forked, bark-textured, alpha-cutout botanical NYC tree
 * (ZERO Minecraft/low-poly icosahedron blobs!).
 * Returns a THREE.Group positioned at (0, 0, 0) ready to be placed and automatically
 * merged by DowntownLevelBuilder.batchStaticMeshes() into ultra-fast GPU draw calls!
 */
export function buildRealisticDowntownTree(
  species: DowntownTreeSpecies,
  heightMeters: number,
  seedIdx: number
): THREE.Group {
  ensureTreeMaterials();

  const rand = seededRand(71531 + seedIdx * 7919);
  const group = new THREE.Group();
  const barkMat = species === 'silverWillow' ? matBirchBark : matOakBark;
  const leafMat = leafMats.get(species)!;

  const h = heightMeters;
  const trunkH = h * (species === 'silverWillow' ? 0.34 : 0.42);
  const baseR = h * (species === 'silverWillow' ? 0.036 : 0.042);

  // 1. Flared organic root buttresses anchoring cleanly into the soil / tree pit!
  for (let r = 0; r < 4; r++) {
    const ang = (r / 4) * Math.PI * 2 + rand() * 0.5;
    const rootMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(baseR * 0.35, baseR * 0.72, h * 0.13, 6),
      barkMat
    );
    rootMesh.position.set(Math.cos(ang) * baseR * 0.58, h * 0.035, Math.sin(ang) * baseR * 0.58);
    rootMesh.rotation.set(Math.sin(ang) * 0.48, 0, -Math.cos(ang) * 0.48);
    rootMesh.castShadow = true;
    rootMesh.receiveShadow = true;
    group.add(rootMesh);
  }

  // 2. Gently curved 2-stage tapered organic main trunk (sunk -0.14m below y=0 for zero floating!)
  const leanX = (rand() - 0.5) * 0.14;
  const leanZ = (rand() - 0.5) * 0.14;
  const lowerTrunkH = trunkH * 0.62 + 0.14;
  const lowerTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.76, baseR * 1.12, lowerTrunkH, 9),
    barkMat
  );
  lowerTrunk.position.set(leanX * 0.3, lowerTrunkH * 0.5 - 0.14, leanZ * 0.3);
  lowerTrunk.rotation.set(leanZ * 0.25, 0, -leanX * 0.25);
  lowerTrunk.castShadow = true;
  lowerTrunk.receiveShadow = true;
  group.add(lowerTrunk);

  const upperTrunkH = trunkH * 0.48;
  const forkY = trunkH * 0.96;
  const upperTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.52, baseR * 0.78, upperTrunkH, 8),
    barkMat
  );
  upperTrunk.position.set(leanX * 0.65, trunkH * 0.58 + upperTrunkH * 0.42, leanZ * 0.65);
  upperTrunk.rotation.set(leanZ * 0.15, 0, -leanX * 0.15);
  upperTrunk.castShadow = true;
  upperTrunk.receiveShadow = true;
  group.add(upperTrunk);

  // 3. Organic diverging primary & secondary limbs reaching outward into the leafy crown
  const boughCenters: THREE.Vector3[] = [];
  const primaryBranches = 5;
  const crownRadius = h * (species === 'silverWillow' ? 0.36 : 0.34);
  const canopyCenter = new THREE.Vector3(leanX * 0.65, h * 0.64, leanZ * 0.65);

  for (let b = 0; b < primaryBranches; b++) {
    const az = (b / primaryBranches) * Math.PI * 2 + (rand() - 0.5) * 0.45;
    const pitch = 0.52 + rand() * 0.32;
    const limbLen = h * (0.28 + rand() * 0.11);
    const startY = forkY - 0.15 + rand() * 0.35;

    const dir = new THREE.Vector3(
      Math.cos(az) * Math.sin(pitch),
      Math.cos(pitch),
      Math.sin(az) * Math.sin(pitch)
    ).normalize();

    const startP = new THREE.Vector3(leanX * 0.65, startY, leanZ * 0.65);
    const endP = startP.clone().addScaledVector(dir, limbLen);
    const midP = startP.clone().lerp(endP, 0.5);

    const limb = new THREE.Mesh(
      new THREE.CylinderGeometry(baseR * 0.22, baseR * 0.46, limbLen, 7),
      barkMat
    );
    limb.position.copy(midP);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    limb.castShadow = true;
    group.add(limb);

    boughCenters.push(endP);

    // Secondary sub-branch fork off each primary limb
    const subAz = az + (rand() > 0.5 ? 0.55 : -0.55);
    const subPitch = pitch + 0.22;
    const subLen = limbLen * 0.62;
    const subDir = new THREE.Vector3(
      Math.cos(subAz) * Math.sin(subPitch),
      Math.cos(subPitch),
      Math.sin(subAz) * Math.sin(subPitch)
    ).normalize();
    const subStart = startP.clone().lerp(endP, 0.56);
    const subEnd = subStart.clone().addScaledVector(subDir, subLen);
    const subMid = subStart.clone().lerp(subEnd, 0.5);

    const subLimb = new THREE.Mesh(
      new THREE.CylinderGeometry(baseR * 0.12, baseR * 0.24, subLen, 6),
      barkMat
    );
    subLimb.position.copy(subMid);
    subLimb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), subDir);
    group.add(subLimb);

    boughCenters.push(subEnd);
  }

  // Crown apex bough cluster
  boughCenters.push(new THREE.Vector3(leanX * 0.6, h * 0.84, leanZ * 0.6));
  boughCenters.push(new THREE.Vector3(leanX * 0.6, h * 0.72, leanZ * 0.6));

  // 4. Lush Layered Arched 3D Alpha-Cutout Foliage Boughs (28 cards per tree, smooth outward canopy normals!)
  const cardSizeBase = crownRadius * (species === 'silverWillow' ? 1.15 : 1.05);
  for (let i = 0; i < boughCenters.length; i++) {
    const center = boughCenters[i];
    const cardsAtNode = i >= boughCenters.length - 2 ? 3 : 2;
    for (let k = 0; k < cardsAtNode; k++) {
      const jitter = new THREE.Vector3(
        (rand() - 0.5) * crownRadius * 0.42,
        (rand() - 0.5) * h * 0.1,
        (rand() - 0.5) * crownRadius * 0.42
      );
      const pos = center.clone().add(jitter);
      const cw = cardSizeBase * (0.82 + rand() * 0.42);
      const ch = cw * (species === 'silverWillow' ? 1.24 : 0.94 + rand() * 0.18);

      const euler =
        species === 'silverWillow'
          ? new THREE.Euler((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.28)
          : new THREE.Euler((rand() - 0.5) * 1.15, rand() * Math.PI * 2, (rand() - 0.5) * 0.85);

      const cardGeo = buildArchedLeafCardGeo(cw, ch, cw * 0.18, pos, euler, canopyCenter);
      const cardMesh = new THREE.Mesh(cardGeo, leafMat);
      cardMesh.castShadow = false; // Alpha foliage skips shadow map cost -> huge FPS boost on laptops!
      cardMesh.receiveShadow = true;
      group.add(cardMesh);
    }
  }

  // Extra outer rim foliage cards filling silhouette cleanly from street-level upward view!
  for (let r = 0; r < 6; r++) {
    const ang = (r / 6) * Math.PI * 2 + rand() * 0.4;
    const rad = crownRadius * (0.55 + rand() * 0.36);
    const pos = new THREE.Vector3(
      canopyCenter.x + Math.cos(ang) * rad,
      h * (0.52 + rand() * 0.28),
      canopyCenter.z + Math.sin(ang) * rad
    );
    const cw = cardSizeBase * (0.78 + rand() * 0.34);
    const ch = cw * (species === 'silverWillow' ? 1.2 : 0.96);
    const euler = new THREE.Euler(
      species === 'silverWillow' ? 0.15 : 0.42 + (rand() - 0.5) * 0.65,
      ang + Math.PI * 0.5,
      (rand() - 0.5) * 0.5
    );
    const cardGeo = buildArchedLeafCardGeo(cw, ch, cw * 0.16, pos, euler, canopyCenter);
    const cardMesh = new THREE.Mesh(cardGeo, leafMat);
    cardMesh.receiveShadow = true;
    group.add(cardMesh);
  }

  return group;
}
