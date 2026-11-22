import * as THREE from 'three';

/**
 * Skinning-safe crease-angle smooth normal generator for GLB meshes (fps_arms.glb, soldier.glb).
 * Preserves vertex count, indices, UVs, and skinIndex/skinWeight attributes untouched while
 * averaging face normals across coincident vertices within `creaseAngleDeg` — turning faceted
 * low-poly surfaces (hands, sleeves, wood handguards, barrels, character armor) silky smooth
 * while preserving crisp machined hard edges beyond the crease threshold!
 */
export function smoothGeometryNormals(
  geo: THREE.BufferGeometry,
  creaseAngleDeg = 55
): void {
  const posAttr = geo.attributes.position;
  if (!posAttr || posAttr.count < 3) return;

  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const diag = bb.min.distanceTo(bb.max);
  const invStep = 1 / Math.max(1e-6, diag * 2e-4);

  const index = geo.index;
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
  if (triCount <= 0) return;

  const faceNx = new Float32Array(triCount);
  const faceNy = new Float32Array(triCount);
  const faceNz = new Float32Array(triCount);
  const unitNx = new Float32Array(triCount);
  const unitNy = new Float32Array(triCount);
  const unitNz = new Float32Array(triCount);

  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const fn = new THREE.Vector3();

  // Map spatial position key -> list of triangle indices touching that world-space position
  const buckets = new Map<string, number[]>();
  const vertKeys = new Array<string>(posAttr.count);

  const getKey = (vi: number): string => {
    let k = vertKeys[vi];
    if (k !== undefined) return k;
    const qx = Math.round(posAttr.getX(vi) * invStep);
    const qy = Math.round(posAttr.getY(vi) * invStep);
    const qz = Math.round(posAttr.getZ(vi) * invStep);
    k = `${qx},${qy},${qz}`;
    vertKeys[vi] = k;
    return k;
  };

  // Track which triangle owns each vertex (for non-indexed / split-normal GLB meshes)
  const vertTri = new Int32Array(posAttr.count);
  vertTri.fill(-1);

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    ax.fromBufferAttribute(posAttr, i0);
    bx.fromBufferAttribute(posAttr, i1);
    cx.fromBufferAttribute(posAttr, i2);

    ab.subVectors(bx, ax);
    ac.subVectors(cx, ax);
    fn.crossVectors(ab, ac); // Magnitude = 2 * triangle area (area-weighted!)

    const len = fn.length();
    faceNx[t] = fn.x;
    faceNy[t] = fn.y;
    faceNz[t] = fn.z;
    if (len > 1e-12) {
      unitNx[t] = fn.x / len;
      unitNy[t] = fn.y / len;
      unitNz[t] = fn.z / len;
    }

    vertTri[i0] = t;
    vertTri[i1] = t;
    vertTri[i2] = t;

    const k0 = getKey(i0);
    const k1 = getKey(i1);
    const k2 = getKey(i2);
    let b0 = buckets.get(k0);
    if (!b0) { b0 = []; buckets.set(k0, b0); }
    b0.push(t);
    let b1 = buckets.get(k1);
    if (!b1) { b1 = []; buckets.set(k1, b1); }
    b1.push(t);
    let b2 = buckets.get(k2);
    if (!b2) { b2 = []; buckets.set(k2, b2); }
    b2.push(t);
  }

  let normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!normAttr || normAttr.count !== posAttr.count) {
    normAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3);
    geo.setAttribute('normal', normAttr);
  }

  const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180);

  for (let v = 0; v < posAttr.count; v++) {
    const ownTri = vertTri[v];
    if (ownTri < 0) continue;
    const key = vertKeys[v];
    const tris = buckets.get(key);
    if (!tris || tris.length === 0) continue;

    const rnx = unitNx[ownTri];
    const rny = unitNy[ownTri];
    const rnz = unitNz[ownTri];

    let sx = 0;
    let sy = 0;
    let sz = 0;

    for (let j = 0; j < tris.length; j++) {
      const ot = tris[j];
      const dot = rnx * unitNx[ot] + rny * unitNy[ot] + rnz * unitNz[ot];
      if (dot >= cosCrease) {
        sx += faceNx[ot];
        sy += faceNy[ot];
        sz += faceNz[ot];
      }
    }

    const slen = Math.hypot(sx, sy, sz);
    if (slen > 1e-12) {
      normAttr.setXYZ(v, sx / slen, sy / slen, sz / slen);
    } else if (Math.hypot(rnx, rny, rnz) > 1e-6) {
      normAttr.setXYZ(v, rnx, rny, rnz);
    }
  }

  normAttr.needsUpdate = true;
}

/**
 * Generates a razor-sharp 1024x1024 satin varnished AKM wood-grain texture with crisp
 * anisotropic filtering so the first-person AKM never looks blurry or pixelated up close.
 */
export function buildSmoothAkWoodTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#c96c2d');
  grad.addColorStop(0.35, '#da7e3c');
  grad.addColorStop(0.7, '#c6682a');
  grad.addColorStop(1, '#aa521e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Fine crisp silky longitudinal wood fibers (high-DPI crisp, zero blocky pixels!)
  for (let y = 0; y < size; y += 2) {
    const wave = Math.sin(y * 0.055) * 0.5 + 0.5;
    const fine = Math.sin(y * 0.27) * 0.5 + 0.5;
    ctx.fillStyle =
      wave > 0.5
        ? `rgba(86, 30, 8, ${(0.05 + fine * 0.08).toFixed(3)})`
        : `rgba(255, 206, 140, ${(0.04 + fine * 0.05).toFixed(3)})`;
    ctx.fillRect(0, y, size, 1.5);
  }
  for (let i = 0; i < 42; i++) {
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(78, 24, 6, 0.14)' : 'rgba(255, 214, 158, 0.09)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const baseY = (i / 42) * size;
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= size; x += 64) {
      ctx.lineTo(x, baseY + Math.sin(x * 0.008 + i * 0.8) * 14);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a razor-sharp 1024x1024 CNC brushed gunmetal steel texture for AKM & SCAR-L metal parts.
 */
export function buildBrushedGunmetalTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#8897b3');
  grad.addColorStop(0.5, '#6d7b95');
  grad.addColorStop(1, '#58657c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Ultra-fine machined brushed aluminum/steel streaks
  for (let y = 0; y < size; y += 2) {
    const shade = (Math.sin(y * 0.65) * 0.5 + 0.5) * 0.045;
    ctx.fillStyle =
      y % 4 === 0
        ? `rgba(255,255,255,${shade.toFixed(3)})`
        : `rgba(12,18,28,${(shade * 1.35).toFixed(3)})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Subtle crisp CNC bevel highlight lines
  ctx.strokeStyle = 'rgba(230, 240, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, size - 36, size - 36);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a razor-sharp 1024x1024 Flat Dark Earth (FDE) satin anodized Cerakote texture
 * with crisp machined micro-grain for the FN SCAR-L 5.56 assault rifle!
 */
export function buildSharpScarCerakoteTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#dfbe82');
  grad.addColorStop(0.45, '#e8ca8e');
  grad.addColorStop(1, '#c9a668');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Silky satin anodized horizontal grain
  for (let y = 0; y < size; y += 2) {
    const a = (Math.sin(y * 0.43) * 0.5 + 0.5) * 0.032;
    ctx.fillStyle = y % 4 === 0 ? `rgba(255,248,230,${a.toFixed(3)})` : `rgba(85,62,28,${(a * 1.1).toFixed(3)})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Crisp precision panel seam accents
  ctx.strokeStyle = 'rgba(64, 46, 20, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.lineTo(size, 256);
  ctx.moveTo(0, 768);
  ctx.lineTo(size, 768);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Studio-painted 512x512 smooth stylized tactical operator face texture (Cryzen / Valorant style):
 * refined skin shading, almond eyes with iris gradient & catchlight, natural tapered eyebrows,
 * soft sculpted nose contour, stern mouth & subtle jaw/cheek shading — mapped cleanly onto a
 * single smooth face mesh (zero clunky floating spheres!).
 */
export function buildRefinedFaceTexture(team: 'ally' | 'enemy', variant: number): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const isAlly = team === 'ally';

  const palettes = [
    { base: '#eab898', hi: '#f7cfb4', mid: '#d89f7c', shade: '#b57b59', lip: '#bd7566', brow: '#2b1e16' },
    { base: '#daa07a', hi: '#eab692', mid: '#c48660', shade: '#9e6544', lip: '#ab6356', brow: '#201611' },
    { base: '#c2855e', hi: '#d69c76', mid: '#aa6d49', shade: '#834e31', lip: '#935246', brow: '#18110e' },
    { base: '#f0c4a6', hi: '#fce0cb', mid: '#dba888', shade: '#ba8466', lip: '#c47c6e', brow: '#3d2a1c' },
  ];
  const pal = palettes[Math.abs(variant) % palettes.length];
  const irisCols = isAlly
    ? ['#2d82e8', '#2ba478', '#4a90f0', '#5878a8']
    : ['#b84c18', '#8a3418', '#523426', '#9e2c22'];
  const irisHex = irisCols[Math.abs(variant) % irisCols.length];

  // 1. Smooth full-canvas skin base with warm center-face studio lighting gradient
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);

  const skinGrad = ctx.createRadialGradient(256, 232, 24, 256, 256, 240);
  skinGrad.addColorStop(0, pal.hi);
  skinGrad.addColorStop(0.55, pal.base);
  skinGrad.addColorStop(0.86, pal.mid);
  skinGrad.addColorStop(1, pal.shade);
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle forehead brow shadow (from helmet rim overhead)
  const helmetShadow = ctx.createLinearGradient(0, 60, 0, 185);
  helmetShadow.addColorStop(0, 'rgba(35, 18, 12, 0.36)');
  helmetShadow.addColorStop(1, 'rgba(35, 18, 12, 0)');
  ctx.fillStyle = helmetShadow;
  ctx.fillRect(0, 60, size, 125);

  // Subtle jawline & cheekbone soft contouring
  for (const sx of [-1, 1]) {
    const cx = 256 + sx * 92;
    const cg = ctx.createRadialGradient(cx, 286, 6, cx, 286, 56);
    cg.addColorStop(0, 'rgba(255, 224, 200, 0.24)');
    cg.addColorStop(1, 'rgba(255, 224, 200, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, 286, 56, 0, Math.PI * 2);
    ctx.fill();

    // Soft cheek hollow / jaw shade
    const jg = ctx.createRadialGradient(256 + sx * 108, 352, 8, 256 + sx * 108, 352, 68);
    jg.addColorStop(0, 'rgba(85, 42, 24, 0.22)');
    jg.addColorStop(1, 'rgba(85, 42, 24, 0)');
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.arc(256 + sx * 108, 352, 68, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Refined Almond Stylized Eyes (clean, sharp, smooth — zero blocky circles!)
  for (const sx of [-1, 1]) {
    const ex = 256 + sx * 64;
    const ey = 232;

    // Soft orbital ambient shadow around eye
    const orb = ctx.createRadialGradient(ex, ey - 4, 8, ex, ey - 4, 40);
    orb.addColorStop(0, 'rgba(72, 36, 22, 0.28)');
    orb.addColorStop(1, 'rgba(72, 36, 22, 0)');
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.ellipse(ex, ey - 4, 42, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Clip to crisp almond eye opening
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - 30, ey + 2);
    ctx.quadraticCurveTo(ex, ey - 20, ex + 30, ey + 2);
    ctx.quadraticCurveTo(ex, ey + 18, ex - 30, ey + 2);
    ctx.closePath();
    ctx.clip();

    // Smooth shaded white sclera (top subtly shadowed by eyelid!)
    const scGrad = ctx.createLinearGradient(0, ey - 16, 0, ey + 14);
    scGrad.addColorStop(0, '#cfd8e4');
    scGrad.addColorStop(0.35, '#f6f9fc');
    scGrad.addColorStop(1, '#e8eef5');
    ctx.fillStyle = scGrad;
    ctx.fillRect(ex - 34, ey - 22, 68, 44);

    // Rich radial-shaded colored iris
    const irGrad = ctx.createRadialGradient(ex, ey + 1, 3, ex, ey + 1, 15);
    irGrad.addColorStop(0, '#111620');
    irGrad.addColorStop(0.42, irisHex);
    irGrad.addColorStop(0.85, irisHex);
    irGrad.addColorStop(1, '#121822');
    ctx.fillStyle = irGrad;
    ctx.beginPath();
    ctx.arc(ex, ey + 1, 15, 0, Math.PI * 2);
    ctx.fill();

    // Sharp dark pupil
    ctx.fillStyle = '#090c12';
    ctx.beginPath();
    ctx.arc(ex, ey + 1, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Crisp glossy eye specular catchlight + tiny secondary reflection
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 5.5, ey - 4.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.arc(ex - 4.5, ey + 5.0, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Crisp smooth upper lash contour + delicate lower lid line
    ctx.strokeStyle = '#1d1410';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - 31, ey + 2);
    ctx.quadraticCurveTo(ex, ey - 20, ex + 31, ey + 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(80, 42, 28, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex - 25, ey + 5);
    ctx.quadraticCurveTo(ex, ey + 17, ex + 25, ey + 5);
    ctx.stroke();

    // 3. Refined Tapered Eyebrows (focused alert for Allies, fierce angled determination for Enemies!)
    ctx.fillStyle = pal.brow;
    ctx.beginPath();
    const innerDrop = isAlly ? 4 : 11;
    const outerLift = isAlly ? -3 : -7;
    if (sx < 0) {
      // Left eyebrow (inner is right side, outer is left side)
      ctx.moveTo(ex - 34, ey - 25 + outerLift);
      ctx.quadraticCurveTo(ex - 2, ey - 37, ex + 28, ey - 26 + innerDrop);
      ctx.lineTo(ex + 25, ey - 17 + innerDrop);
      ctx.quadraticCurveTo(ex - 2, ey - 27, ex - 34, ey - 21 + outerLift);
    } else {
      // Right eyebrow (inner is left side, outer is right side)
      ctx.moveTo(ex + 34, ey - 25 + outerLift);
      ctx.quadraticCurveTo(ex + 2, ey - 37, ex - 28, ey - 26 + innerDrop);
      ctx.lineTo(ex - 25, ey - 17 + innerDrop);
      ctx.quadraticCurveTo(ex + 2, ey - 27, ex + 34, ey - 21 + outerLift);
    }
    ctx.closePath();
    ctx.fill();
  }

  // 4. Refined Soft-Shaded Nose Bridge, Tip Highlight & Clean Nostrils
  const noseHi = ctx.createLinearGradient(256, 224, 256, 304);
  noseHi.addColorStop(0, 'rgba(255, 232, 212, 0.35)');
  noseHi.addColorStop(0.75, 'rgba(255, 238, 220, 0.5)');
  noseHi.addColorStop(1, 'rgba(255, 232, 212, 0)');
  ctx.fillStyle = noseHi;
  ctx.beginPath();
  ctx.ellipse(256, 266, 11, 40, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft side bridge shadows & nose underside contour
  for (const sx of [-1, 1]) {
    ctx.strokeStyle = 'rgba(105, 55, 32, 0.25)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(256 + sx * 12, 232);
    ctx.quadraticCurveTo(256 + sx * 15, 272, 256 + sx * 20, 294);
    ctx.stroke();

    // Clean subtle nostrils
    ctx.fillStyle = 'rgba(72, 32, 18, 0.55)';
    ctx.beginPath();
    ctx.ellipse(256 + sx * 11, 301, 6.5, 3.6, sx * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  const noseUnder = ctx.createRadialGradient(256, 306, 2, 256, 306, 24);
  noseUnder.addColorStop(0, 'rgba(92, 46, 26, 0.34)');
  noseUnder.addColorStop(1, 'rgba(92, 46, 26, 0)');
  ctx.fillStyle = noseUnder;
  ctx.beginPath();
  ctx.ellipse(256, 306, 24, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5. Refined Stern Tactical Mouth, Soft Lips & Chin Contour
  ctx.fillStyle = pal.lip;
  ctx.beginPath();
  ctx.moveTo(222, 344);
  ctx.quadraticCurveTo(242, 336, 256, 339);
  ctx.quadraticCurveTo(270, 336, 290, 344);
  ctx.quadraticCurveTo(256, 359, 222, 344);
  ctx.closePath();
  ctx.fill();

  // Crisp subtle mouth parting line
  ctx.strokeStyle = 'rgba(74, 30, 24, 0.65)';
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(220, 344);
  ctx.quadraticCurveTo(256, isAlly ? 346 : 342, 292, 344);
  ctx.stroke();

  // Soft lower-lip highlight & chin dimple shadow
  ctx.fillStyle = 'rgba(255, 225, 208, 0.28)';
  ctx.beginPath();
  ctx.ellipse(256, 350, 18, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const chinShade = ctx.createRadialGradient(256, 366, 3, 256, 366, 24);
  chinShade.addColorStop(0, 'rgba(92, 48, 28, 0.25)');
  chinShade.addColorStop(1, 'rgba(92, 48, 28, 0)');
  ctx.fillStyle = chinShade;
  ctx.beginPath();
  ctx.ellipse(256, 366, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}
