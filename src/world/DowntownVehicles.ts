import * as THREE from 'three';

export type DowntownVehicleType =
  | 'taxi'
  | 'police'
  | 'race-future'
  | 'delivery'
  | 'sedan-sports'
  | 'van'
  | 'sedan'
  | 'firetruck'
  | 'garbage-truck'
  | 'suv-luxury'
  | 'suv'
  | 'truck'
  | 'ambulance'
  | 'hatchback-sports';

export interface BuiltDowntownVehicle {
  group: THREE.Group;
  raycastMeshes: THREE.Mesh[];
  emergencyLights: Array<{ mat: THREE.MeshBasicMaterial; phase: number; colorA: number; colorB: number }>;
}

// ============================================================================
// Shared Cached PBR Automotive Materials & Crisp Procedural Car Textures
// ============================================================================
let sharedInitialized = false;
let matRubberTire!: THREE.MeshStandardMaterial;
let matAlloyRim!: THREE.MeshStandardMaterial;
let matDarkAlloy!: THREE.MeshStandardMaterial;
let matBrakeRotor!: THREE.MeshStandardMaterial;
let matBrakeCaliperRed!: THREE.MeshStandardMaterial;
let matChrome!: THREE.MeshStandardMaterial;
let matDarkTrim!: THREE.MeshStandardMaterial;
let matCabinInterior!: THREE.MeshStandardMaterial;
let matDoorSeam!: THREE.MeshBasicMaterial;
let matGrilleMesh!: THREE.MeshStandardMaterial;
let matBlueGlass!: THREE.MeshStandardMaterial;
let matBlueGlassRear!: THREE.MeshStandardMaterial;
let matHeadlightLed!: THREE.MeshBasicMaterial;
let matDrlCyan!: THREE.MeshBasicMaterial;
let matDrlWarm!: THREE.MeshBasicMaterial;
let matTaillightRed!: THREE.MeshBasicMaterial;
let matAmberMarker!: THREE.MeshBasicMaterial;
let matShadowDecal!: THREE.MeshBasicMaterial;
let wheelGeoTire!: THREE.LatheGeometry;
let wheelGeoRimRing!: THREE.CylinderGeometry;
let wheelGeoSpoke!: THREE.BoxGeometry;
let wheelGeoHub!: THREE.CylinderGeometry;
let wheelGeoRotor!: THREE.CylinderGeometry;
const paintMatCache = new Map<string, THREE.MeshStandardMaterial>();
const decalMatCache = new Map<string, THREE.MeshStandardMaterial>();
const plateMatCache = new Map<string, THREE.MeshBasicMaterial>();

function makeSoftShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 128, 18, 64, 128, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.68, 'rgba(0,0,0,0.68)');
  g.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates realistic reflective sapphire/sky-blue automotive windshield & door window glass
 * with subtle diagonal sunset/sky reflection sheen and crisp dark rubber frit border.
 */
function makeBlueGlassTexture(withDefroster = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#184b8a');
  grad.addColorStop(0.35, '#2b7bd4');
  grad.addColorStop(0.68, '#1e60b0');
  grad.addColorStop(1.0, '#0f3060');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Diagonal glossy glass highlight reflection
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(-0.42);
  const sheen = ctx.createLinearGradient(-150, -34, 150, 34);
  sheen.addColorStop(0.0, 'rgba(190,235,255,0)');
  sheen.addColorStop(0.42, 'rgba(190,238,255,0.28)');
  sheen.addColorStop(0.54, 'rgba(255,220,248,0.18)');
  sheen.addColorStop(1.0, 'rgba(190,235,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-200, -34, 400, 68);
  ctx.restore();

  // Crisp dark ceramic frit perimeter gasket border (exact real-world car window framing!)
  ctx.strokeStyle = 'rgba(10, 16, 26, 0.85)';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);

  if (withDefroster) {
    ctx.strokeStyle = 'rgba(215, 165, 118, 0.26)';
    ctx.lineWidth = 1.6;
    for (let y = 38; y <= 218; y += 18) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(236, y);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function getNyLicensePlateMat(plateText: string): THREE.MeshBasicMaterial {
  let m = plateMatCache.get(plateText);
  if (m) return m;

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, '#ffd448');
  bg.addColorStop(0.5, '#f4b41e');
  bg.addColorStop(1, '#e69c14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#0e2452';
  ctx.fillRect(0, 0, 256, 30);
  ctx.fillStyle = '#ffdf78';
  ctx.font = '900 20px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEW YORK', 128, 16);

  ctx.fillStyle = '#0d1c3d';
  ctx.font = '900 48px "Consolas", "Arial Black", monospace';
  ctx.fillText(plateText, 128, 72);

  ctx.fillStyle = '#0e2452';
  ctx.fillRect(0, 102, 256, 26);
  ctx.fillStyle = '#ffdf78';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('EMPIRE STATE', 128, 115);

  ctx.strokeStyle = '#12161e';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 122);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshBasicMaterial({ map: tex });
  plateMatCache.set(plateText, m);
  return m;
}

function makeLiveryStripeTexture(
  kind: 'taxi' | 'police' | 'fdny' | 'ems' | 'delivery' | 'dsny'
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);

  if (kind === 'taxi') {
    ctx.fillStyle = '#f4b414';
    ctx.fillRect(0, 0, 512, 128);
    const sq = 16;
    for (let x = 0; x < 512; x += sq) {
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = ((x / sq) + r) % 2 === 0 ? '#111418' : '#f8f9fa';
        ctx.fillRect(x, 76 + r * sq, sq, sq);
      }
    }
    ctx.fillStyle = '#111418';
    ctx.font = '900 34px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NYC TAXI', 256, 48);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('5B82  •  MEDALLION', 256, 70);
  } else if (kind === 'police') {
    ctx.fillStyle = '#eef4fa';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#0e4db8';
    ctx.fillRect(0, 52, 512, 34);
    ctx.fillStyle = '#2898ff';
    ctx.fillRect(0, 88, 512, 10);
    ctx.fillStyle = '#0c3b8e';
    ctx.font = '900 36px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NYPD  POLICE', 256, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('COURTESY • PROFESSIONALISM • RESPECT', 256, 76);
  } else if (kind === 'fdny') {
    ctx.fillStyle = '#b61422';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 66, 512, 22);
    ctx.fillStyle = '#f4c032';
    ctx.fillRect(0, 60, 512, 6);
    ctx.fillRect(0, 88, 512, 6);
    ctx.fillStyle = '#ffd966';
    ctx.font = '900 40px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F.D.N.Y.  ENGINE 54', 256, 46);
  } else if (kind === 'ems') {
    ctx.fillStyle = '#f2f5fa';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#d61c2c';
    ctx.fillRect(0, 56, 512, 28);
    ctx.fillStyle = '#f4b41c';
    ctx.fillRect(0, 86, 512, 10);
    ctx.fillStyle = '#c81626';
    ctx.font = '900 34px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FDNY  AMBULANCE', 256, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('EMERGENCY  MEDICAL  SERVICES  •  911', 256, 77);
  } else if (kind === 'delivery') {
    ctx.fillStyle = '#dce4ee';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(20, 32, 48, 0.14)';
    for (let x = 32; x < 512; x += 48) {
      ctx.fillRect(x, 0, 2, 128);
    }
    ctx.fillStyle = '#12386e';
    ctx.fillRect(0, 74, 512, 24);
    ctx.fillStyle = '#ff6a28';
    ctx.fillRect(0, 98, 512, 8);
    ctx.fillStyle = '#122848';
    ctx.font = '900 32px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MANHATTAN LOGISTICS', 256, 54);
    ctx.fillStyle = '#eef4ff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('MIDTOWN EXPRESS FREIGHT  •  NYC', 256, 91);
  } else {
    ctx.fillStyle = '#dde5ee';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#1a5a38';
    ctx.fillRect(0, 62, 512, 28);
    ctx.fillStyle = '#16462c';
    ctx.font = '900 32px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NYC  SANITATION', 256, 48);
    ctx.fillStyle = '#e8fff2';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('DSNY  •  MIDTOWN DISTRICT', 256, 82);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeGrilleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#090c12';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#38465c';
  ctx.lineWidth = 2;
  for (let y = 8; y < 64; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  for (let x = 8; x < 128; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ensureSharedAutomotiveAssets(): void {
  if (sharedInitialized) return;
  sharedInitialized = true;

  matRubberTire = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.88,
    metalness: 0.06,
  });
  matAlloyRim = new THREE.MeshStandardMaterial({
    color: 0xd4dde8,
    roughness: 0.22,
    metalness: 0.92,
    envMapIntensity: 1.85,
  });
  matDarkAlloy = new THREE.MeshStandardMaterial({
    color: 0x3c4554,
    roughness: 0.28,
    metalness: 0.86,
    envMapIntensity: 1.5,
  });
  matBrakeRotor = new THREE.MeshStandardMaterial({
    color: 0x7a8596,
    roughness: 0.35,
    metalness: 0.88,
  });
  matBrakeCaliperRed = new THREE.MeshStandardMaterial({
    color: 0xdc2230,
    roughness: 0.3,
    metalness: 0.45,
  });
  matChrome = new THREE.MeshStandardMaterial({
    color: 0xedf4fc,
    roughness: 0.14,
    metalness: 0.96,
    envMapIntensity: 2.1,
  });
  matDarkTrim = new THREE.MeshStandardMaterial({
    color: 0x141922,
    roughness: 0.58,
    metalness: 0.28,
  });
  matCabinInterior = new THREE.MeshStandardMaterial({
    color: 0x0b0f18,
    roughness: 0.85,
    metalness: 0.1,
  });
  matDoorSeam = new THREE.MeshBasicMaterial({ color: 0x090d14 });
  matGrilleMesh = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGrilleTexture(),
    roughness: 0.42,
    metalness: 0.68,
  });
  // Reflective sapphire/sky-blue glass for ALL 4 sides of every vehicle!
  matBlueGlass = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeBlueGlassTexture(false),
    roughness: 0.08,
    metalness: 0.78,
    envMapIntensity: 2.1,
    emissive: new THREE.Color(0x1f62b4),
    emissiveIntensity: 0.42,
    side: THREE.DoubleSide,
  });
  matBlueGlassRear = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeBlueGlassTexture(true),
    roughness: 0.09,
    metalness: 0.76,
    envMapIntensity: 2.0,
    emissive: new THREE.Color(0x1a549c),
    emissiveIntensity: 0.38,
    side: THREE.DoubleSide,
  });
  matHeadlightLed = new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false });
  matDrlCyan = new THREE.MeshBasicMaterial({ color: 0x52e8ff, toneMapped: false });
  matDrlWarm = new THREE.MeshBasicMaterial({ color: 0xffd278, toneMapped: false });
  matTaillightRed = new THREE.MeshBasicMaterial({ color: 0xff1e38, toneMapped: false });
  matAmberMarker = new THREE.MeshBasicMaterial({ color: 0xffa624, toneMapped: false });
  matShadowDecal = new THREE.MeshBasicMaterial({
    map: makeSoftShadowTexture(),
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });

  // Rounded-shoulder rubber tire (unit radius R=1, width W=1)
  const tirePts = [
    new THREE.Vector2(0.60, -0.48),
    new THREE.Vector2(0.88, -0.50),
    new THREE.Vector2(0.98, -0.42),
    new THREE.Vector2(1.00, -0.26),
    new THREE.Vector2(1.00, 0.26),
    new THREE.Vector2(0.98, 0.42),
    new THREE.Vector2(0.88, 0.50),
    new THREE.Vector2(0.60, 0.48),
    new THREE.Vector2(0.60, -0.48),
  ];
  wheelGeoTire = new THREE.LatheGeometry(tirePts, 20);
  wheelGeoTire.rotateZ(Math.PI / 2);

  wheelGeoRimRing = new THREE.CylinderGeometry(0.62, 0.62, 0.82, 18);
  wheelGeoRimRing.rotateZ(Math.PI / 2);

  // Spokes kept strictly inside rim diameter (1.14 < 2 * 0.60 = 1.20!) so zero spoke poke-through!
  wheelGeoSpoke = new THREE.BoxGeometry(0.14, 1.12, 0.11);
  wheelGeoHub = new THREE.CylinderGeometry(0.18, 0.2, 0.88, 12);
  wheelGeoHub.rotateZ(Math.PI / 2);

  wheelGeoRotor = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 14);
  wheelGeoRotor.rotateZ(Math.PI / 2);
}

function getCarPaintMat(hex: number, metalness = 0.62, roughness = 0.18): THREE.MeshStandardMaterial {
  const k = `${hex}_${metalness}_${roughness}`;
  let m = paintMatCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: hex,
      roughness,
      metalness,
      envMapIntensity: 1.85,
      emissive: new THREE.Color(hex).multiplyScalar(0.06),
      emissiveIntensity: 0.45,
    });
    paintMatCache.set(k, m);
  }
  return m;
}

function getLiveryMat(kind: 'taxi' | 'police' | 'fdny' | 'ems' | 'delivery' | 'dsny'): THREE.MeshStandardMaterial {
  let m = decalMatCache.get(kind);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeLiveryStripeTexture(kind),
      roughness: 0.24,
      metalness: 0.36,
      envMapIntensity: 1.45,
      emissive: new THREE.Color(0x161824),
      emissiveIntensity: 0.22,
    });
    decalMatCache.set(kind, m);
  }
  return m;
}

/**
 * Builds an exact 3D quad mesh from 4 corner points (pBL, pBR, pTR, pTL) with clean outward normals and [0..1] UVs.
 * Guarantees 0.000m gaps and ZERO floating or z-fighting on angled windshields, side windows, and rear windows!
 */
function createExactQuadMesh(
  pBL: THREE.Vector3,
  pBR: THREE.Vector3,
  pTR: THREE.Vector3,
  pTL: THREE.Vector3,
  mat: THREE.Material
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    pBL.x, pBL.y, pBL.z,
    pBR.x, pBR.y, pBR.z,
    pTR.x, pTR.y, pTR.z,
    pBL.x, pBL.y, pBL.z,
    pTR.x, pTR.y, pTR.z,
    pTL.x, pTL.y, pTL.z,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 0,
    1, 1,
    0, 1,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/**
 * Builds a clean solid 6-face tapered frustum block between exact bottom/top/front/rear coordinates
 * (used for flush lower hoods, curved cabins, and solid collision hulls!).
 */
function createFrustumMesh(
  botHalfW: number,
  topHalfW: number,
  botY: number,
  topY: number,
  botFrontZ: number,
  botRearZ: number,
  topFrontZ: number,
  topRearZ: number,
  mat: THREE.Material
): THREE.Mesh {
  const fbl = new THREE.Vector3(-botHalfW, botY, botFrontZ);
  const fbr = new THREE.Vector3(botHalfW, botY, botFrontZ);
  const rbr = new THREE.Vector3(botHalfW, botY, botRearZ);
  const rbl = new THREE.Vector3(-botHalfW, botY, botRearZ);

  const ftl = new THREE.Vector3(-topHalfW, topY, topFrontZ);
  const ftr = new THREE.Vector3(topHalfW, topY, topFrontZ);
  const rtr = new THREE.Vector3(topHalfW, topY, topRearZ);
  const rtl = new THREE.Vector3(-topHalfW, topY, topRearZ);

  const verts: number[] = [];
  const uvs: number[] = [];
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    verts.push(
      a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
      a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z
    );
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };

  // Top face
  pushQuad(ftl, ftr, rtr, rtl);
  // Bottom face
  pushQuad(rbl, rbr, fbr, fbl);
  // Front face (+Z)
  pushQuad(fbl, fbr, ftr, ftl);
  // Rear face (-Z)
  pushQuad(rbr, rbl, rtl, rtr);
  // Right face (+X)
  pushQuad(fbr, rbr, rtr, ftr);
  // Left face (-X)
  pushQuad(rbl, fbl, ftl, rtl);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/**
 * Builds a clean strut/pillar connecting exact 3D points A -> B with zero alignment errors!
 */
function createStrutBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  thicknessX: number,
  thicknessZ: number,
  mat: THREE.Material
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thicknessX, len + 0.02, thicknessZ), mat);
  mesh.position.copy(a).lerp(b, 0.5);
  if (len > 1e-4) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(len));
  }
  return mesh;
}

/**
 * Extrudes a clean flat-sided 2D automotive lower-body profile (exact width = `width`, minimal crisp edge bevel)
 * so doors, trims, and liveries sit 100% FLUSH on `x = ±width * 0.5`!
 */
function buildCleanLowerBodyGeo(shape: THREE.Shape, width: number): THREE.ExtrudeGeometry {
  const bevelThick = 0.04;
  const coreWidth = Math.max(0.1, width - bevelThick * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreWidth,
    bevelEnabled: true,
    bevelThickness: bevelThick,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.translate(0, 0, -coreWidth * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function buildRealisticWheel(radius: number, width: number, darkSpokes = false, redCaliper = false): THREE.Group {
  const g = new THREE.Group();

  const tire = new THREE.Mesh(wheelGeoTire, matRubberTire);
  tire.scale.set(width, radius, radius);
  tire.castShadow = true;
  g.add(tire);

  const barrel = new THREE.Mesh(wheelGeoRimRing, matDarkTrim);
  barrel.scale.set(width * 0.92, radius, radius);
  g.add(barrel);

  const rotor = new THREE.Mesh(wheelGeoRotor, matBrakeRotor);
  rotor.scale.set(width, radius, radius);
  g.add(rotor);

  if (redCaliper) {
    const cal = new THREE.Mesh(new THREE.BoxGeometry(width * 0.45, radius * 0.34, radius * 0.22), matBrakeCaliperRed);
    cal.position.set(0, radius * 0.22, -radius * 0.26);
    g.add(cal);
  }

  const spokeMat = darkSpokes ? matDarkAlloy : matAlloyRim;
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(wheelGeoSpoke, spokeMat);
    spoke.scale.set(width, radius, radius);
    spoke.rotation.x = (i / 5) * Math.PI;
    g.add(spoke);
  }

  const hub = new THREE.Mesh(wheelGeoHub, matChrome);
  hub.scale.set(width, radius, radius);
  g.add(hub);

  return g;
}

const VEHICLE_PLATES: Record<DowntownVehicleType, string> = {
  taxi: 'NYC 5B8',
  police: 'NYPD 91',
  'race-future': 'NY 9900',
  delivery: 'MHT 402',
  'sedan-sports': 'NY 7482',
  van: 'BK 6140',
  sedan: 'NY 3188',
  firetruck: 'FDNY 54',
  'garbage-truck': 'DSNY 18',
  'suv-luxury': 'NYC 001',
  suv: 'QNS 529',
  truck: 'NY 8841',
  ambulance: 'EMS 911',
  'hatchback-sports': 'NY 2407',
};

/**
 * Builds a precision-engineered curved PBR NYC vehicle with:
 * - ZERO ugly front logos
 * - Exact vertex-matched 4-sided reflective sky-blue automotive glass (front windshield w/ wipers,
 *   left & right multi-pane side windows, rear defroster glass) & flush painted A/B/C pillars + roof
 * - Flush sculpted doors with crisp shut-lines & 3D chrome pull handles on both sides
 * - Crisp readable NEW YORK license plates front & rear, LED optics & 5-spoke alloy wheels!
 */
export function buildRealisticDowntownVehicle(
  type: DowntownVehicleType,
  tintHex?: number
): BuiltDowntownVehicle {
  ensureSharedAutomotiveAssets();

  const root = new THREE.Group();
  const raycastMeshes: THREE.Mesh[] = [];
  const emergencyLights: BuiltDowntownVehicle['emergencyLights'] = [];
  const plateMat = getNyLicensePlateMat(VEHICLE_PLATES[type] ?? 'NY 7482');

  const registerMesh = (m: THREE.Mesh, collidable = true) => {
    m.castShadow = true;
    m.receiveShadow = true;
    if (collidable) raycastMeshes.push(m);
    return m;
  };

  /**
   * Precision vertex-matched 4-sided blue-glass greenhouse cabin!
   * Every single window pane (Front, Rear, Left, Right), every pillar (A, B, C, Quarter),
   * and the painted roof share the EXACT 8 corner coordinates -> ZERO gaps, ZERO floating, ZERO z-fighting!
   */
  const addPrecisionBlueGlassCabin = (opts: {
    baseHalfW: number;
    topHalfW: number;
    beltY: number;
    roofY: number;
    frontBaseZ: number;
    frontTopZ: number;
    rearTopZ: number;
    rearBaseZ: number;
    paintMat: THREE.MeshStandardMaterial;
    bPillarFrac?: number;      // 0..1 fraction from rear -> front for B-pillar separating front/rear side glass
    quarterPillarFrac?: number; // Optional C-pillar fraction for SUV/station quarter window
    includeRearGlass?: boolean;
  }) => {
    const {
      baseHalfW,
      topHalfW,
      beltY,
      roofY,
      frontBaseZ,
      frontTopZ,
      rearTopZ,
      rearBaseZ,
      paintMat,
      bPillarFrac,
      quarterPillarFrac,
      includeRearGlass = true,
    } = opts;

    // 1. Dark recessed interior core (-0.045m inset on all sides) for rich cabin depth
    const core = createFrustumMesh(
      baseHalfW - 0.045,
      topHalfW - 0.045,
      beltY - 0.02,
      roofY - 0.04,
      frontBaseZ - 0.045,
      rearBaseZ + 0.045,
      frontTopZ - 0.045,
      rearTopZ + 0.045,
      matCabinInterior
    );
    root.add(core);

    // Exact 8 outer cabin corners
    const fbl = new THREE.Vector3(-baseHalfW, beltY, frontBaseZ);
    const fbr = new THREE.Vector3(baseHalfW, beltY, frontBaseZ);
    const ftl = new THREE.Vector3(-topHalfW, roofY, frontTopZ);
    const ftr = new THREE.Vector3(topHalfW, roofY, frontTopZ);

    const rbl = new THREE.Vector3(-baseHalfW, beltY, rearBaseZ);
    const rbr = new THREE.Vector3(baseHalfW, beltY, rearBaseZ);
    const rtl = new THREE.Vector3(-topHalfW, roofY, rearTopZ);
    const rtr = new THREE.Vector3(topHalfW, roofY, rearTopZ);

    // Helper to slightly inset a quad inside its 4 corners (for clean glass seating inside pillars!)
    const insetQuad = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      c: THREE.Vector3,
      d: THREE.Vector3,
      inH = 0.04,
      inV = 0.035
    ): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
      const ab = new THREE.Vector3().lerpVectors(a, b, inH);
      const ba = new THREE.Vector3().lerpVectors(b, a, inH);
      const dc = new THREE.Vector3().lerpVectors(d, c, inH);
      const cd = new THREE.Vector3().lerpVectors(c, d, inH);
      return [
        new THREE.Vector3().lerpVectors(ab, dc, inV),
        new THREE.Vector3().lerpVectors(ba, cd, inV),
        new THREE.Vector3().lerpVectors(cd, ba, inV),
        new THREE.Vector3().lerpVectors(dc, ab, inV),
      ];
    };

    // 2. FRONT BLUE GLASS WINDSHIELD (exact flush quad + dual black windshield wipers!)
    const [wf1, wf2, wf3, wf4] = insetQuad(fbl, fbr, ftr, ftl, 0.035, 0.03);
    root.add(createExactQuadMesh(wf1, wf2, wf3, wf4, matBlueGlass));

    for (const wx of [-baseHalfW * 0.42, baseHalfW * 0.32]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(baseHalfW * 0.68, 0.018, 0.018), matDarkTrim);
      wiper.position.set(wx, beltY + 0.045, frontBaseZ - 0.025);
      wiper.rotation.z = 0.07;
      root.add(wiper);
    }

    // 3. REAR BLUE GLASS WINDOW (exact flush quad with defroster lines + high-mount 3rd brake LED!)
    if (includeRearGlass) {
      const [wr1, wr2, wr3, wr4] = insetQuad(rbr, rbl, rtl, rtr, 0.04, 0.04);
      root.add(createExactQuadMesh(wr1, wr2, wr3, wr4, matBlueGlassRear));

      const thirdBrake = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.032, 0.028), matTaillightRed);
      thirdBrake.position.set(0, roofY - 0.045, rearTopZ - 0.018);
      root.add(thirdBrake);
    } else {
      // Solid painted rear cab wall (for commercial truck cabs)
      root.add(createExactQuadMesh(rbr, rbl, rtl, rtr, paintMat));
    }

    // 4. LEFT & RIGHT SIDE BLUE GLASS WINDOWS (exact flush tumblehome quads!)
    const [wsR1, wsR2, wsR3, wsR4] = insetQuad(fbr, rbr, rtr, ftr, 0.025, 0.035);
    root.add(createExactQuadMesh(wsR1, wsR2, wsR3, wsR4, matBlueGlass));

    const [wsL1, wsL2, wsL3, wsL4] = insetQuad(rbl, fbl, ftl, rtl, 0.025, 0.035);
    root.add(createExactQuadMesh(wsL1, wsL2, wsL3, wsL4, matBlueGlass));

    // 5. FLUSH PAINTED ROOF PANEL (matching exact top 4 corners!)
    const roofPlate = createFrustumMesh(
      topHalfW + 0.012,
      topHalfW - 0.02,
      roofY - 0.025,
      roofY + 0.035,
      frontTopZ + 0.02,
      rearTopZ - 0.02,
      frontTopZ - 0.02,
      rearTopZ + 0.02,
      paintMat
    );
    registerMesh(roofPlate, true);
    root.add(roofPlate);

    // 6. EXACT VERTEX-LOCKED A-PILLARS, B-PILLARS, C-PILLARS & ROOF SIDE RAILS!
    for (const sx of [-1, 1]) {
      const pFB = sx > 0 ? fbr : fbl;
      const pFT = sx > 0 ? ftr : ftl;
      const pRB = sx > 0 ? rbr : rbl;
      const pRT = sx > 0 ? rtr : rtl;

      // Painted A-Pillar (front corner)
      root.add(createStrutBetween(pFB, pFT, 0.075, 0.085, paintMat));
      // Painted C-Pillar (rear corner)
      root.add(createStrutBetween(pRB, pRT, 0.08, 0.12, paintMat));
      // Top side window arch rail
      root.add(createStrutBetween(pFT, pRT, 0.065, 0.06, paintMat));

      // Gloss-black B-Pillar separating Front Door Blue Glass from Rear Door Blue Glass!
      if (bPillarFrac !== undefined) {
        const bBot = new THREE.Vector3().lerpVectors(pRB, pFB, bPillarFrac);
        const bTop = new THREE.Vector3().lerpVectors(pRT, pFT, bPillarFrac);
        root.add(createStrutBetween(bBot, bTop, 0.055, 0.095, matDarkTrim));
      }

      // Optional rear quarter pillar for SUVs
      if (quarterPillarFrac !== undefined) {
        const qBot = new THREE.Vector3().lerpVectors(pRB, pFB, quarterPillarFrac);
        const qTop = new THREE.Vector3().lerpVectors(pRT, pFT, quarterPillarFrac);
        root.add(createStrutBetween(qBot, qTop, 0.055, 0.085, matDarkTrim));
      }
    }

    // Front & rear upper roof headers framing windshield & rear glass top edge cleanly
    root.add(createStrutBetween(ftl, ftr, 0.06, 0.065, paintMat));
    root.add(createStrutBetween(rtl, rtr, 0.06, 0.065, paintMat));
  };

  /**
   * Adds flush proper door outlines (front + rear door shut-line seams), chrome window beltline trim,
   * and 3D chrome pull door handles on BOTH left and right sides!
   */
  const addProperDoorsAndHandles = (
    halfW: number,
    beltY: number,
    sillY: number,
    doors: Array<{ frontZ: number; rearZ: number }>
  ) => {
    const doorH = Math.max(0.32, beltY - sillY);
    const doorMidY = sillY + doorH * 0.5;
    const handleY = beltY - 0.12;

    for (const sx of [-1, 1]) {
      const sideX = sx * (halfW + 0.006);
      const allFrontZ = Math.max(...doors.map((d) => d.frontZ));
      const allRearZ = Math.min(...doors.map((d) => d.rearZ));
      const spanLen = allFrontZ - allRearZ;
      const spanCenterZ = (allFrontZ + allRearZ) * 0.5;

      // Sleek chrome window sill beltline molding
      const beltTrim = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, spanLen + 0.08), matChrome);
      beltTrim.position.set(sx * (halfW + 0.004), beltY - 0.012, spanCenterZ);
      root.add(beltTrim);

      // Horizontal bottom door shut-line
      const bottomSeam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, spanLen), matDoorSeam);
      bottomSeam.position.set(sideX, sillY + 0.02, spanCenterZ);
      root.add(bottomSeam);

      const verticalZs = new Set<number>();
      for (const d of doors) {
        verticalZs.add(d.frontZ);
        verticalZs.add(d.rearZ);

        // Recessed dark finger-cup + raised 3D chrome pull handle bar near trailing edge of each door!
        const handleZ = d.rearZ + Math.min(0.28, (d.frontZ - d.rearZ) * 0.24);
        const cup = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.054, 0.155), matDarkTrim);
        cup.position.set(sx * (halfW + 0.005), handleY, handleZ);
        root.add(cup);

        const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.024, 0.14), matChrome);
        handleBar.position.set(sx * (halfW + 0.022), handleY + 0.004, handleZ);
        root.add(handleBar);

        for (const postOff of [-0.056, 0.056]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.02, 0.02), matDarkTrim);
          post.position.set(sx * (halfW + 0.011), handleY + 0.004, handleZ + postOff);
          root.add(post);
        }
      }

      for (const vz of verticalZs) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.014, doorH, 0.015), matDoorSeam);
        seam.position.set(sideX, doorMidY, vz);
        root.add(seam);
      }
    }
  };

  const addUnderbodyShadowAndGlows = (w: number, len: number, drlMat: THREE.MeshBasicMaterial = matDrlWarm) => {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.24, len * 1.12), matShadowDecal);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.024;
    root.add(sh);

    const headPool = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.08, 2.7),
      new THREE.MeshBasicMaterial({
        color: drlMat === matDrlCyan ? 0x62e8ff : 0xffdf9a,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    headPool.rotation.x = -Math.PI / 2;
    headPool.position.set(0, 0.036, len * 0.5 + 1.2);
    headPool.userData.lowEndOptional = true;
    root.add(headPool);

    const tailPool = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.0, 1.75),
      new THREE.MeshBasicMaterial({
        color: 0xff2240,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    tailPool.rotation.x = -Math.PI / 2;
    tailPool.position.set(0, 0.036, -len * 0.5 - 0.8);
    tailPool.userData.lowEndOptional = true;
    root.add(tailPool);
  };

  const addFourWheels = (
    halfTrack: number,
    frontZ: number,
    rearZ: number,
    radius: number,
    width: number,
    darkSpokes = false,
    redCaliper = false
  ) => {
    for (const sx of [-1, 1]) {
      for (const wz of [frontZ, rearZ]) {
        // Dark inner wheel-well backing cylinder so there's never hollow daylight behind the wheel
        const well = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, width * 1.15, 14),
          matCabinInterior
        );
        well.rotation.z = Math.PI / 2;
        well.position.set(sx * (halfTrack - width * 0.25), radius + 0.04, wz);
        root.add(well);

        const w = buildRealisticWheel(radius, width, darkSpokes, redCaliper);
        w.position.set(sx * halfTrack, radius, wz);
        if (sx < 0) w.rotation.y = Math.PI;
        root.add(w);
      }
    }
  };

  const addSideMirrors = (halfW: number, y: number, z: number, bodyMat: THREE.MeshStandardMaterial) => {
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.042, 0.055), matDarkTrim);
      arm.position.set(sx * (halfW + 0.04), y, z);
      root.add(arm);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.12), bodyMat);
      cap.position.set(sx * (halfW + 0.125), y + 0.018, z - 0.02);
      root.add(cap);
    }
  };

  const addFrontRearOptics = (
    w: number,
    frontZ: number,
    rearZ: number,
    headY: number,
    tailY: number,
    opts?: { fullTailBar?: boolean; cyanDrl?: boolean; chromeBumper?: boolean }
  ) => {
    const hw = w * 0.5;
    // Clean honeycomb radiator grille with sleek chrome frame (NO bulky logo!)
    const grille = new THREE.Mesh(new THREE.BoxGeometry(w * 0.46, 0.24, 0.05), matGrilleMesh);
    grille.position.set(0, headY - 0.02, frontZ + 0.008);
    root.add(grille);

    const grilleTrimTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.49, 0.028, 0.06), matChrome);
    grilleTrimTop.position.set(0, headY + 0.1, frontZ + 0.012);
    root.add(grilleTrimTop);

    const grilleTrimBot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.47, 0.022, 0.06), matChrome);
    grilleTrimBot.position.set(0, headY - 0.145, frontZ + 0.012);
    root.add(grilleTrimBot);

    const drlMat = opts?.cyanDrl ? matDrlCyan : matDrlWarm;
    for (const sx of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, 0.15, 0.1), matDarkTrim);
      housing.position.set(sx * (hw - w * 0.16), headY, frontZ - 0.015);
      root.add(housing);

      const led = new THREE.Mesh(new THREE.BoxGeometry(w * 0.19, 0.088, 0.045), matHeadlightLed);
      led.position.set(sx * (hw - w * 0.16), headY + 0.012, frontZ + 0.025);
      root.add(led);

      const drl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.21, 0.024, 0.05), drlMat);
      drl.position.set(sx * (hw - w * 0.16), headY - 0.052, frontZ + 0.028);
      root.add(drl);

      const fog = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.036), drlMat);
      fog.position.set(sx * (hw - 0.24), Math.max(0.32, headY - 0.23), frontZ + 0.018);
      root.add(fog);
    }

    // Rear LED taillights
    if (opts?.fullTailBar) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.082, 0.05), matTaillightRed);
      bar.position.set(0, tailY, rearZ - 0.018);
      root.add(bar);
    } else {
      for (const sx of [-1, 1]) {
        const tl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, 0.12, 0.055), matTaillightRed);
        tl.position.set(sx * (hw - w * 0.17), tailY, rearZ - 0.018);
        root.add(tl);
        const turn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.09, 0.048, 0.058), matAmberMarker);
        turn.position.set(sx * (hw - w * 0.09), tailY - 0.068, rearZ - 0.02);
        root.add(turn);
      }
    }

    // Clean, readable NEW YORK License Plates with slim black bezel on BOTH front & rear bumpers!
    const fPlateY = Math.max(0.34, headY - 0.25);
    const fFrame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.02), matDarkTrim);
    fFrame.position.set(0, fPlateY, frontZ + 0.034);
    root.add(fFrame);
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.18), plateMat);
    fp.position.set(0, fPlateY, frontZ + 0.048);
    root.add(fp);

    const rPlateY = Math.max(0.36, tailY - 0.25);
    const rFrame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.02), matDarkTrim);
    rFrame.position.set(0, rPlateY, rearZ - 0.032);
    root.add(rFrame);
    const rp = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.18), plateMat);
    rp.rotation.y = Math.PI;
    rp.position.set(0, rPlateY, rearZ - 0.046);
    root.add(rp);

    for (const sx of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.16, 10), matChrome);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * (hw - 0.34), 0.28, rearZ - 0.018);
      root.add(pipe);
    }

    if (opts?.chromeBumper) {
      const cb = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.22, 0.14), matChrome);
      cb.position.set(0, 0.42, frontZ + 0.03);
      root.add(cb);
    }
  };

  const addEmergencyLightbar = (y: number, z: number, width: number, mode: 'police' | 'fdny' | 'amber') => {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.22), matDarkTrim);
    barBase.position.set(0, y, z);
    root.add(barBase);

    const leftMat = new THREE.MeshBasicMaterial({
      color: mode === 'amber' ? 0xffaa20 : 0xff1c32,
      toneMapped: false,
    });
    const rightMat = new THREE.MeshBasicMaterial({
      color: mode === 'police' ? 0x2692ff : mode === 'fdny' ? 0xffffff : 0xffd244,
      toneMapped: false,
    });
    const leftPod = new THREE.Mesh(new THREE.BoxGeometry(width * 0.44, 0.1, 0.2), leftMat);
    leftPod.position.set(-width * 0.25, y + 0.055, z);
    root.add(leftPod);

    const rightPod = new THREE.Mesh(new THREE.BoxGeometry(width * 0.44, 0.1, 0.2), rightMat);
    rightPod.position.set(width * 0.25, y + 0.055, z);
    root.add(rightPod);

    emergencyLights.push(
      {
        mat: leftMat,
        phase: 0,
        colorA: mode === 'amber' ? 0xffb824 : 0xff1830,
        colorB: 0x301018,
      },
      {
        mat: rightMat,
        phase: Math.PI,
        colorA: mode === 'police' ? 0x2498ff : mode === 'fdny' ? 0xfff8e8 : 0xffc830,
        colorB: 0x101c34,
      }
    );
  };

  // =========================================================================
  // ARCHETYPE 1: SLEEK CYBER SUPERCAR ('race-future')
  // =========================================================================
  if (type === 'race-future') {
    const len = 4.65;
    const w = 1.98;
    const paint = getCarPaintMat(tintHex ?? 0x28c8f0, 0.84, 0.12);

    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-2.24, 0.28);
    bodyShape.lineTo(2.26, 0.26);
    bodyShape.quadraticCurveTo(2.34, 0.44, 2.22, 0.56);
    bodyShape.quadraticCurveTo(1.58, 0.74, 0.96, 0.78);
    bodyShape.lineTo(-1.86, 0.82);
    bodyShape.quadraticCurveTo(-2.26, 0.76, -2.26, 0.46);
    bodyShape.closePath();

    root.add(registerMesh(new THREE.Mesh(buildCleanLowerBodyGeo(bodyShape, w), paint)));

    addPrecisionBlueGlassCabin({
      baseHalfW: w * 0.47,
      topHalfW: w * 0.36,
      beltY: 0.77,
      roofY: 1.19,
      frontBaseZ: 0.96,
      frontTopZ: 0.24,
      rearTopZ: -0.6,
      rearBaseZ: -1.48,
      paintMat: paint,
    });

    addProperDoorsAndHandles(w * 0.5, 0.78, 0.3, [{ frontZ: 0.84, rearZ: -0.62 }]);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.06, len + 0.04), matDarkTrim);
    splitter.position.set(0, 0.21, 0);
    root.add(splitter);

    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.045, 0.3), matDarkTrim);
    wingBlade.position.set(0, 1.1, -2.04);
    wingBlade.rotation.x = 0.14;
    root.add(wingBlade);
    for (const sx of [-0.62, 0.62]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.16), matDarkTrim);
      pylon.position.set(sx, 0.95, -2.02);
      root.add(pylon);
    }

    const frontBlade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.036, 0.055), matDrlCyan);
    frontBlade.position.set(0, 0.55, 2.28);
    root.add(frontBlade);

    addSideMirrors(w * 0.48, 0.81, 0.54, paint);
    addFrontRearOptics(w, 2.28, -2.27, 0.56, 0.72, { fullTailBar: true, cyanDrl: true });
    addFourWheels(w * 0.47, 1.38, -1.38, 0.36, 0.3, true, true);
    addUnderbodyShadowAndGlows(w, len, matDrlCyan);
    return { group: root, raycastMeshes, emergencyLights };
  }

  // =========================================================================
  // ARCHETYPE 2: SLEEK NYC SEDAN / YELLOW TAXI / NYPD POLICE / SPORT COUPE
  // =========================================================================
  if (type === 'taxi' || type === 'police' || type === 'sedan' || type === 'sedan-sports') {
    const isSport = type === 'sedan-sports';
    const isTaxi = type === 'taxi';
    const isPolice = type === 'police';
    const len = isSport ? 4.65 : 4.78;
    const w = 1.9;
    const baseHex = isTaxi
      ? 0xf4b414
      : isPolice
      ? 0xe8eff8
      : isSport
      ? tintHex ?? 0xdc2638
      : tintHex ?? 0x486284;
    const paint = getCarPaintMat(baseHex, isSport ? 0.78 : 0.62, isSport ? 0.14 : 0.2);

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(-2.30, 0.30);
    lowerShape.lineTo(2.30, 0.30);
    lowerShape.quadraticCurveTo(2.38, 0.54, 2.28, 0.78);
    lowerShape.quadraticCurveTo(1.70, 0.90, 1.04, 0.93);
    lowerShape.lineTo(-1.46, 0.94);
    lowerShape.quadraticCurveTo(-2.12, 0.93, -2.30, 0.82);
    lowerShape.quadraticCurveTo(-2.36, 0.62, -2.30, 0.30);
    lowerShape.closePath();

    root.add(registerMesh(new THREE.Mesh(buildCleanLowerBodyGeo(lowerShape, w), paint)));

    const roofH = isSport ? 1.4 : 1.48;
    addPrecisionBlueGlassCabin({
      baseHalfW: w * 0.48,
      topHalfW: w * 0.4,
      beltY: 0.92,
      roofY: roofH,
      frontBaseZ: 1.02,
      frontTopZ: 0.44,
      rearTopZ: -0.78,
      rearBaseZ: -1.48,
      paintMat: paint,
      bPillarFrac: isSport ? undefined : 0.54,
    });

    addProperDoorsAndHandles(
      w * 0.5,
      0.93,
      0.34,
      isSport
        ? [{ frontZ: 0.88, rearZ: -0.78 }]
        : [
            { frontZ: 0.94, rearZ: -0.14 },
            { frontZ: -0.14, rearZ: -1.18 },
          ]
    );

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.11, len - 0.22), matDarkTrim);
    skirt.position.set(0, 0.27, 0);
    root.add(skirt);

    if (isTaxi || isPolice) {
      const livMat = getLiveryMat(isTaxi ? 'taxi' : 'police');
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.4), livMat);
        panel.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        panel.position.set(sx * (w * 0.5 + 0.004), 0.58, -0.12);
        root.add(panel);
      }
    }

    if (isTaxi) {
      const signBase = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.2), matDarkTrim);
      signBase.position.set(0, roofH + 0.055, -0.12);
      root.add(signBase);
      const signGlow = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.17), matDrlWarm);
      signGlow.position.set(0, roofH + 0.135, -0.12);
      root.add(signGlow);
    } else if (isPolice) {
      const pushBar = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.34, 0.1), matDarkTrim);
      pushBar.position.set(0, 0.56, 2.42);
      root.add(pushBar);
      addEmergencyLightbar(roofH + 0.065, -0.14, 1.18, 'police');
    } else if (isSport) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.045, 0.2), matDarkTrim);
      spoiler.position.set(0, 1.0, -2.14);
      spoiler.rotation.x = 0.2;
      root.add(spoiler);
    }

    addSideMirrors(w * 0.48, 0.96, 0.68, paint);
    addFrontRearOptics(w, 2.34, -2.33, 0.66, 0.77, { fullTailBar: isSport, cyanDrl: isSport });
    addFourWheels(w * 0.47, 1.44, -1.42, 0.35, 0.26, isSport || isPolice, isSport);
    addUnderbodyShadowAndGlows(w, len, isSport ? matDrlCyan : matDrlWarm);
    return { group: root, raycastMeshes, emergencyLights };
  }

  // =========================================================================
  // ARCHETYPE 3: MODERN LUXURY SUV & COMPACT SPORT HATCHBACK
  // =========================================================================
  if (type === 'suv' || type === 'suv-luxury' || type === 'hatchback-sports') {
    const isHatch = type === 'hatchback-sports';
    const isLux = type === 'suv-luxury';
    const len = isHatch ? 4.22 : isLux ? 5.02 : 4.76;
    const w = isHatch ? 1.84 : 2.0;
    const roofH = isHatch ? 1.48 : 1.82;
    const beltY = isHatch ? 0.92 : 1.12;
    const hl = len * 0.5;
    const paint = getCarPaintMat(
      tintHex ?? (isLux ? 0x1c2536 : isHatch ? 0x2ec89c : 0x3b4d68),
      isLux ? 0.82 : 0.66,
      isLux ? 0.14 : 0.2
    );

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(-hl + 0.04, 0.34);
    lowerShape.lineTo(hl - 0.04, 0.34);
    lowerShape.quadraticCurveTo(hl + 0.04, 0.66, hl - 0.04, beltY - 0.05);
    lowerShape.quadraticCurveTo(hl * 0.55, beltY + 0.02, hl * 0.4, beltY);
    lowerShape.lineTo(-hl + 0.04, beltY);
    lowerShape.quadraticCurveTo(-hl - 0.03, beltY * 0.65, -hl + 0.04, 0.34);
    lowerShape.closePath();

    root.add(registerMesh(new THREE.Mesh(buildCleanLowerBodyGeo(lowerShape, w), paint)));

    addPrecisionBlueGlassCabin({
      baseHalfW: w * 0.48,
      topHalfW: w * 0.41,
      beltY: beltY - 0.01,
      roofY: roofH,
      frontBaseZ: hl * 0.42,
      frontTopZ: hl * 0.12,
      rearTopZ: -hl + 0.34,
      rearBaseZ: -hl + 0.06,
      paintMat: paint,
      bPillarFrac: 0.62,
      quarterPillarFrac: isHatch ? undefined : 0.28,
    });

    addProperDoorsAndHandles(w * 0.5, beltY, 0.38, [
      { frontZ: hl * 0.36, rearZ: -0.06 },
      { frontZ: -0.06, rearZ: isHatch ? -hl + 0.7 : -hl + 1.02 },
    ]);

    if (!isHatch) {
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len * 0.5), matChrome);
        rail.position.set(sx * (w * 0.36), roofH + 0.06, -0.34);
        root.add(rail);
      }
    }

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.14, len - 0.14), matDarkTrim);
    skirt.position.set(0, 0.3, 0);
    root.add(skirt);

    addSideMirrors(w * 0.48, beltY + 0.04, hl * 0.34, paint);
    addFrontRearOptics(w, hl + 0.01, -hl - 0.01, beltY - 0.24, beltY - 0.16, {
      fullTailBar: isLux || isHatch,
      cyanDrl: isLux || isHatch,
    });
    addFourWheels(w * 0.47, hl * 0.62, -hl * 0.62, isHatch ? 0.34 : 0.41, isHatch ? 0.25 : 0.3, isLux || isHatch, isHatch);
    addUnderbodyShadowAndGlows(w, len, isLux ? matDrlCyan : matDrlWarm);
    return { group: root, raycastMeshes, emergencyLights };
  }

  // =========================================================================
  // ARCHETYPE 4: SLEEK NYC SPRINTER VAN & FDNY EMS AMBULANCE
  // =========================================================================
  if (type === 'van' || type === 'ambulance') {
    const isAmb = type === 'ambulance';
    const len = isAmb ? 5.6 : 5.2;
    const w = 2.06;
    const beltY = 1.34;
    const roofH = isAmb ? 2.42 : 2.18;
    const hl = len * 0.5;
    const paint = getCarPaintMat(isAmb ? 0xf2f5fa : tintHex ?? 0x7088a8, 0.46, 0.24);

    // Clean lower van body + sculpted short hood nose
    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(-hl + 0.04, 0.36);
    lowerShape.lineTo(hl - 0.04, 0.36);
    lowerShape.quadraticCurveTo(hl + 0.04, 0.76, hl - 0.02, 1.12);
    lowerShape.quadraticCurveTo(hl - 0.26, 1.32, hl - 0.56, beltY);
    lowerShape.lineTo(-hl + 0.04, beltY);
    lowerShape.lineTo(-hl + 0.04, 0.36);
    lowerShape.closePath();
    root.add(registerMesh(new THREE.Mesh(buildCleanLowerBodyGeo(lowerShape, w), paint)));

    // Precision 4-Sided Blue Glass Upper Van Cabin (exact flush front windshield, full side windows, rear windows!)
    addPrecisionBlueGlassCabin({
      baseHalfW: w * 0.49,
      topHalfW: w * 0.44,
      beltY: beltY - 0.01,
      roofY: roofH,
      frontBaseZ: hl - 0.56,
      frontTopZ: hl - 1.18,
      rearTopZ: -hl + 0.1,
      rearBaseZ: -hl + 0.04,
      paintMat: paint,
      bPillarFrac: 0.72,
      quarterPillarFrac: 0.38,
    });

    // For Ambulance: crisp white upper side flanks with dedicated glowing blue medical side windows
    if (isAmb) {
      const emsMat = getLiveryMat('ems');
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), emsMat);
        panel.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        panel.position.set(sx * (w * 0.5 + 0.004), 0.9, -0.58);
        root.add(panel);
      }
      addEmergencyLightbar(roofH + 0.055, hl - 1.42, 1.56, 'fdny');
      for (const sx of [-0.7, 0.7]) {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.07), matTaillightRed);
        pod.position.set(sx, roofH - 0.1, -hl - 0.02);
        root.add(pod);
      }
    }

    // Proper Cab Doors + Side Sliding Door Seams & 3D Chrome Handles!
    addProperDoorsAndHandles(w * 0.5, beltY, 0.42, [
      { frontZ: hl - 0.68, rearZ: hl - 1.88 },
      { frontZ: hl - 1.88, rearZ: -0.42 },
    ]);

    // Rear double-door vertical seam + chrome handle
    const rearSplit = new THREE.Mesh(new THREE.BoxGeometry(0.018, beltY - 0.42, 0.02), matDoorSeam);
    rearSplit.position.set(0, 0.42 + (beltY - 0.42) * 0.5, -hl - 0.006);
    root.add(rearSplit);
    const rearHandle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.045), matChrome);
    rearHandle.position.set(0.14, 1.12, -hl - 0.025);
    root.add(rearHandle);

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.16, len - 0.14), matDarkTrim);
    skirt.position.set(0, 0.34, 0);
    root.add(skirt);

    addSideMirrors(w * 0.5, beltY + 0.1, hl - 0.88, matDarkTrim);
    addFrontRearOptics(w, hl + 0.01, -hl - 0.01, 0.82, 0.92, { chromeBumper: !isAmb });
    addFourWheels(w * 0.47, hl - 1.05, -hl + 1.15, 0.41, 0.3);
    addUnderbodyShadowAndGlows(w, len, matDrlWarm);
    return { group: root, raycastMeshes, emergencyLights };
  }

  // =========================================================================
  // ARCHETYPE 5: HEAVY NYC FDNY FIRE ENGINE, DELIVERY BOX TRUCK & SANITATION TRUCK
  // =========================================================================
  const isFire = type === 'firetruck';
  const isSan = type === 'garbage-truck';
  const len = isFire ? 6.8 : isSan ? 6.2 : 5.8;
  const w = 2.24;
  const hl = len * 0.5;
  const cabHex = isFire ? 0xb81422 : isSan ? 0xe8eff8 : type === 'truck' ? 0x26446e : 0xe4ecf4;
  const cabMat = getCarPaintMat(cabHex, 0.54, 0.22);

  const cabLen = 2.15;
  const cabBeltY = 1.44;
  const cabH = isFire ? 2.52 : 2.38;

  // Clean lower commercial truck cab box (flush sides at ±w/2)
  const cabLower = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, cabBeltY - 0.42, cabLen), cabMat));
  cabLower.position.set(0, 0.42 + (cabBeltY - 0.42) * 0.5, hl - cabLen * 0.5);
  root.add(cabLower);

  // Precision vertex-matched 4-sided Blue Glass Truck Cab Greenhouse!
  addPrecisionBlueGlassCabin({
    baseHalfW: (w - 0.04) * 0.5,
    topHalfW: (w - 0.18) * 0.5,
    beltY: cabBeltY - 0.01,
    roofY: cabH,
    frontBaseZ: hl,
    frontTopZ: hl - 0.26,
    rearTopZ: hl - cabLen,
    rearBaseZ: hl - cabLen,
    paintMat: cabMat,
    includeRearGlass: false,
  });

  // Proper Truck Cab Doors + 3D Chrome Door Handles!
  addProperDoorsAndHandles((w - 0.04) * 0.5, cabBeltY, 0.52, [{ frontZ: hl - 0.32, rearZ: hl - 1.68 }]);

  // Rear Cargo / Fire Engine / Sanitation Body
  const rearLen = len - cabLen - 0.14;
  const rearH = isFire ? 2.18 : 2.28;
  const rearBodyMat = isFire
    ? cabMat
    : isSan
    ? getCarPaintMat(0xdce6f0, 0.36, 0.34)
    : getCarPaintMat(0xdbe4ef, 0.32, 0.38);

  const rearBox = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(w, rearH, rearLen), rearBodyMat));
  rearBox.position.set(0, 0.44 + rearH * 0.5, -hl + rearLen * 0.5);
  root.add(rearBox);

  // Flush rear blue glass inspection window + rear chrome latch
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.48), matBlueGlassRear);
  rearGlass.rotation.y = Math.PI;
  rearGlass.position.set(0, 2.02, -hl - 0.012);
  root.add(rearGlass);
  const rearLatch = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.045), matChrome);
  rearLatch.position.set(0, 0.92, -hl - 0.022);
  root.add(rearLatch);

  const livKind = isFire ? 'fdny' : isSan ? 'dsny' : 'delivery';
  const livMat = getLiveryMat(livKind);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(rearLen * 0.88, 0.96), livMat);
    p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    p.position.set(sx * (w * 0.5 + 0.01), 1.62, -hl + rearLen * 0.5);
    root.add(p);
  }

  if (isFire) {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.95), matAlloyRim);
        shutter.position.set(sx * (w * 0.5 + 0.01), 0.92, -hl + 0.85 + i * 1.18);
        root.add(shutter);
      }
    }
    for (const sx of [-0.34, 0.34]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, rearLen + 1.1), matChrome);
      rail.position.set(sx, 0.44 + rearH + 0.16, -hl + rearLen * 0.5 + 0.35);
      root.add(rail);
    }
    for (let rz = -hl + 0.4; rz <= hl - 0.9; rz += 0.45) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.05, 0.05), matChrome);
      rung.position.set(0, 0.44 + rearH + 0.16, rz);
      root.add(rung);
    }
    addEmergencyLightbar(cabH + 0.055, hl - 0.82, 1.78, 'fdny');
  } else {
    for (const mx of [-0.72, 0, 0.72]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06), matAmberMarker);
      led.position.set(mx, 0.44 + rearH - 0.08, hl - cabLen - 0.12);
      root.add(led);
    }
    if (isSan) {
      addEmergencyLightbar(cabH + 0.055, hl - 0.82, 1.2, 'amber');
    }
  }

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(w - 0.24, 0.34, len - 0.3), matDarkTrim);
  chassis.position.set(0, 0.42, 0);
  root.add(chassis);

  addSideMirrors(w * 0.5, 1.72, hl - 0.42, matChrome);
  addFrontRearOptics(w, hl + 0.01, -hl - 0.01, 0.92, 0.86, { chromeBumper: true });
  addFourWheels(w * 0.47, hl - 1.18, -hl + 1.32, 0.48, 0.36);
  addUnderbodyShadowAndGlows(w, len, matDrlWarm);

  return { group: root, raycastMeshes, emergencyLights };
}
