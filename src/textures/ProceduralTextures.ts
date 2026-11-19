import * as THREE from 'three';

export interface PBRTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export interface TextureLibrary {
  wetAsphalt: PBRTextureSet;
  grimyConcrete: PBRTextureSet;
  industrialSteel: PBRTextureSet;
  corrugatedMetal: PBRTextureSet;
  hazardTrim: THREE.CanvasTexture;
  metalGrate: PBRTextureSet;
  techCrate: PBRTextureSet;
  signSector: THREE.CanvasTexture;
  signWarning: THREE.CanvasTexture;
  emberSprite: THREE.CanvasTexture;
  flashSprite: THREE.CanvasTexture;
  smokeSprite: THREE.CanvasTexture;
  rifleStencil: THREE.CanvasTexture;
  goldSleeve: PBRTextureSet;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function toTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  isColor = true,
  wrap = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (wrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWetAsphaltPBR(): PBRTextureSet {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(4101);

  col.fillStyle = '#1b1f26';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#c8c8c8';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 8 + rand() * 44;
    const ry = 8 + rand() * 38;
    const ang = rand() * Math.PI;
    const v = Math.floor(20 + rand() * 26);

    col.fillStyle = `rgba(${v}, ${v + 4}, ${v + 10}, ${0.14 + rand() * 0.22})`;
    col.beginPath();
    col.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
    col.fill();

    const rv = Math.floor(155 + rand() * 75);
    rough.fillStyle = `rgba(${rv},${rv},${rv}, 0.16)`;
    rough.beginPath();
    rough.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
    rough.fill();

    const bv = Math.floor(105 + rand() * 46);
    bump.fillStyle = `rgba(${bv},${bv},${bv}, 0.22)`;
    bump.beginPath();
    bump.ellipse(x, y, rx * 0.65, ry * 0.65, ang, 0, Math.PI * 2);
    bump.fill();
  }

  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const s = 1 + rand() * 2.4;
    const light = rand() > 0.5;
    col.fillStyle = light ? 'rgba(84, 92, 106, 0.14)' : 'rgba(6, 8, 12, 0.24)';
    col.fillRect(x, y, s, s);
    bump.fillStyle = light ? 'rgba(185,185,185,0.22)' : 'rgba(72,72,72,0.26)';
    bump.fillRect(x, y, s, s);
  }

  for (const pos of [0, 256]) {
    col.fillStyle = 'rgba(7, 9, 13, 0.68)';
    col.fillRect(pos, 0, 3, size);
    col.fillRect(0, pos, size, 3);
    col.fillStyle = 'rgba(75, 86, 98, 0.2)';
    col.fillRect(pos + 3, 0, 2, size);
    col.fillRect(0, pos + 3, size, 2);

    bump.fillStyle = '#262626';
    bump.fillRect(pos, 0, 4, size);
    bump.fillRect(0, pos, size, 4);
  }

  for (let c = 0; c < 9; c++) {
    let cx = rand() * size;
    let cy = rand() * size;
    let ang = rand() * Math.PI * 2;
    col.strokeStyle = 'rgba(6, 8, 12, 0.72)';
    col.lineWidth = 1.2 + rand() * 1.4;
    bump.strokeStyle = '#181818';
    bump.lineWidth = 2.2;
    col.beginPath();
    bump.beginPath();
    col.moveTo(cx, cy);
    bump.moveTo(cx, cy);
    const segs = 6 + Math.floor(rand() * 10);
    for (let s = 0; s < segs; s++) {
      ang += (rand() - 0.5) * 1.1;
      cx += Math.cos(ang) * (10 + rand() * 20);
      cy += Math.sin(ang) * (10 + rand() * 20);
      col.lineTo(cx, cy);
      bump.lineTo(cx, cy);
    }
    col.stroke();
    bump.stroke();
  }

  const puddleCenters = [
    { x: 122, y: 118, rx: 88, ry: 54, rot: 0.35 },
    { x: 378, y: 152, rx: 72, ry: 58, rot: -0.42 },
    { x: 248, y: 344, rx: 108, ry: 66, rot: 0.18 },
    { x: 76, y: 405, rx: 64, ry: 48, rot: -0.25 },
    { x: 432, y: 422, rx: 76, ry: 52, rot: 0.52 },
  ];

  for (const p of puddleCenters) {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = p.x + ox;
        const py = p.y + oy;
        if (px < -150 || px > size + 150 || py < -150 || py > size + 150) continue;

        const cg = col.createRadialGradient(px, py, p.rx * 0.2, px, py, p.rx * 1.15);
        cg.addColorStop(0, 'rgba(9, 13, 18, 0.52)');
        cg.addColorStop(0.7, 'rgba(11, 15, 22, 0.35)');
        cg.addColorStop(1, 'rgba(11, 15, 22, 0)');
        col.save();
        col.translate(px, py);
        col.rotate(p.rot);
        col.scale(1, p.ry / p.rx);
        col.fillStyle = cg;
        col.beginPath();
        col.arc(0, 0, p.rx * 1.15, 0, Math.PI * 2);
        col.fill();
        col.restore();

        const rg = rough.createRadialGradient(px, py, p.rx * 0.18, px, py, p.rx * 1.05);
        rg.addColorStop(0, 'rgba(14, 14, 14, 0.98)');
        rg.addColorStop(0.62, 'rgba(26, 26, 26, 0.94)');
        rg.addColorStop(0.84, 'rgba(90, 90, 90, 0.65)');
        rg.addColorStop(1, 'rgba(180, 180, 180, 0)');
        rough.save();
        rough.translate(px, py);
        rough.rotate(p.rot);
        rough.scale(1, p.ry / p.rx);
        rough.fillStyle = rg;
        rough.beginPath();
        rough.arc(0, 0, p.rx * 1.05, 0, Math.PI * 2);
        rough.fill();
        rough.restore();

        const bg = bump.createRadialGradient(px, py, p.rx * 0.15, px, py, p.rx * 0.95);
        bg.addColorStop(0, 'rgba(128, 128, 128, 0.96)');
        bg.addColorStop(0.75, 'rgba(128, 128, 128, 0.85)');
        bg.addColorStop(1, 'rgba(128, 128, 128, 0)');
        bump.save();
        bump.translate(px, py);
        bump.rotate(p.rot);
        bump.scale(1, p.ry / p.rx);
        bump.fillStyle = bg;
        bump.beginPath();
        bump.arc(0, 0, p.rx * 0.95, 0, Math.PI * 2);
        bump.fill();
        bump.restore();
      }
    }
  }

  return {
    map: toTexture(cCol, 6, 6, true),
    roughnessMap: toTexture(cRough, 6, 6, false),
    bumpMap: toTexture(cBump, 6, 6, false),
  };
}

function buildGrimyConcretePBR(): PBRTextureSet {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(4202);

  const g = col.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#30363f');
  g.addColorStop(0.55, '#272d35');
  g.addColorStop(1, '#181c22');
  col.fillStyle = g;
  col.fillRect(0, 0, size, size);

  rough.fillStyle = '#cfcfcf';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  for (let i = 0; i < 220; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 18 + rand() * 74;
    const ry = 14 + rand() * 56;
    const shade = rand() > 0.45;
    col.fillStyle = shade
      ? `rgba(76, 84, 96, ${0.05 + rand() * 0.08})`
      : `rgba(12, 14, 18, ${0.08 + rand() * 0.14})`;
    col.beginPath();
    col.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    col.fill();

    const bv = shade ? 148 : 108;
    bump.fillStyle = `rgba(${bv},${bv},${bv}, 0.2)`;
    bump.beginPath();
    bump.ellipse(x, y, rx * 0.7, ry * 0.7, rand() * Math.PI, 0, Math.PI * 2);
    bump.fill();
  }

  for (let y = 128; y < size; y += 128) {
    col.fillStyle = 'rgba(8, 10, 14, 0.58)';
    col.fillRect(0, y, size, 3);
    col.fillStyle = 'rgba(110, 120, 134, 0.18)';
    col.fillRect(0, y + 3, size, 2);
    bump.fillStyle = '#323232';
    bump.fillRect(0, y, size, 4);

    for (let x = 64; x < size; x += 128) {
      col.fillStyle = 'rgba(10, 12, 16, 0.72)';
      col.beginPath();
      col.arc(x, y - 64, 5, 0, Math.PI * 2);
      col.fill();
      bump.fillStyle = '#1c1c1c';
      bump.beginPath();
      bump.arc(x, y - 64, 5.5, 0, Math.PI * 2);
      bump.fill();
    }
  }

  for (let s = 0; s < 38; s++) {
    const sx = rand() * size;
    const sw = 4 + rand() * 14;
    const sh = 120 + rand() * 340;
    const sy = rand() * 140;
    const isRust = rand() > 0.7;

    const sg = col.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, isRust ? 'rgba(92, 42, 22, 0.32)' : 'rgba(8, 10, 14, 0.34)');
    sg.addColorStop(1, 'rgba(8, 10, 14, 0)');
    col.fillStyle = sg;
    col.fillRect(sx, sy, sw, sh);

    const rsg = rough.createLinearGradient(0, sy, 0, sy + sh);
    rsg.addColorStop(0, 'rgba(55, 55, 55, 0.7)');
    rsg.addColorStop(1, 'rgba(195, 195, 195, 0)');
    rough.fillStyle = rsg;
    rough.fillRect(sx, sy, sw, sh);
  }

  const baseRough = rough.createLinearGradient(0, size * 0.72, 0, size);
  baseRough.addColorStop(0, 'rgba(60, 60, 60, 0)');
  baseRough.addColorStop(1, 'rgba(42, 42, 42, 0.78)');
  rough.fillStyle = baseRough;
  rough.fillRect(0, size * 0.72, size, size * 0.28);

  return {
    map: toTexture(cCol, 2, 1, true),
    roughnessMap: toTexture(cRough, 2, 1, false),
    bumpMap: toTexture(cBump, 2, 1, false),
  };
}

function buildIndustrialSteelPBR(): PBRTextureSet {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(4303);

  col.fillStyle = '#252b34';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#707070';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const delta = Math.floor((rand() - 0.5) * 16);
    col.fillStyle = `rgba(${42 + delta}, ${48 + delta}, ${58 + delta}, 0.25)`;
    col.fillRect(0, y, size, 1.5);
    const rv = 95 + delta * 2;
    rough.fillStyle = `rgba(${rv},${rv},${rv}, 0.25)`;
    rough.fillRect(0, y, size, 1.5);
  }

  const panels = [
    [0, 0, 256, 256],
    [256, 0, 256, 256],
    [0, 256, 256, 256],
    [256, 256, 256, 256],
  ];
  for (const [px, py, pw, ph] of panels) {
    col.strokeStyle = 'rgba(10, 13, 18, 0.75)';
    col.lineWidth = 4;
    col.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

    col.strokeStyle = 'rgba(128, 144, 165, 0.24)';
    col.lineWidth = 2;
    col.strokeRect(px + 6, py + 6, pw - 12, ph - 12);

    rough.strokeStyle = '#303030';
    rough.lineWidth = 3;
    rough.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    bump.strokeStyle = '#2a2a2a';
    bump.lineWidth = 4;
    bump.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

    const inset = 18;
    const rivets = [
      [px + inset, py + inset],
      [px + pw - inset, py + inset],
      [px + inset, py + ph - inset],
      [px + pw - inset, py + ph - inset],
      [px + pw * 0.5, py + inset],
      [px + pw * 0.5, py + ph - inset],
    ];
    for (const [rx, ry] of rivets) {
      col.fillStyle = '#3b4452';
      col.beginPath();
      col.arc(rx, ry, 4.2, 0, Math.PI * 2);
      col.fill();
      col.strokeStyle = '#11151b';
      col.lineWidth = 1.4;
      col.stroke();

      bump.fillStyle = '#d4d4d4';
      bump.beginPath();
      bump.arc(rx, ry, 4.5, 0, Math.PI * 2);
      bump.fill();
    }
  }

  for (let i = 0; i < 42; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 14 + rand() * 38;
    const isRust = rand() > 0.45;
    col.fillStyle = isRust
      ? `rgba(116, 52, 26, ${0.12 + rand() * 0.22})`
      : `rgba(12, 15, 20, ${0.18 + rand() * 0.24})`;
    col.beginPath();
    col.ellipse(x, y, r, r * (0.5 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
    col.fill();

    if (isRust) {
      rough.fillStyle = 'rgba(220, 220, 220, 0.65)';
      rough.beginPath();
      rough.arc(x, y, r * 0.85, 0, Math.PI * 2);
      rough.fill();
    }
  }

  return {
    map: toTexture(cCol, 2, 2, true),
    roughnessMap: toTexture(cRough, 2, 2, false),
    bumpMap: toTexture(cBump, 2, 2, false),
  };
}

function buildCorrugatedMetalPBR(): PBRTextureSet {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(4404);

  const ribW = 24;
  for (let x = 0; x < size; x += ribW) {
    const cg = col.createLinearGradient(x, 0, x + ribW, 0);
    cg.addColorStop(0, '#181d24');
    cg.addColorStop(0.28, '#2d3540');
    cg.addColorStop(0.55, '#38414e');
    cg.addColorStop(0.85, '#1e242c');
    cg.addColorStop(1, '#151920');
    col.fillStyle = cg;
    col.fillRect(x, 0, ribW, size);

    const bg = bump.createLinearGradient(x, 0, x + ribW, 0);
    bg.addColorStop(0, '#383838');
    bg.addColorStop(0.45, '#dadada');
    bg.addColorStop(1, '#383838');
    bump.fillStyle = bg;
    bump.fillRect(x, 0, ribW, size);
  }

  rough.fillStyle = '#888888';
  rough.fillRect(0, 0, size, size);

  for (let i = 0; i < 60; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 6 + rand() * 18;
    const h = 40 + rand() * 180;
    col.fillStyle = rand() > 0.55 ? 'rgba(98, 44, 22, 0.26)' : 'rgba(10, 12, 16, 0.32)';
    col.fillRect(x, y, w, h);
    rough.fillStyle = 'rgba(215, 215, 215, 0.45)';
    rough.fillRect(x, y, w, h);
  }

  return {
    map: toTexture(cCol, 2, 1, true),
    roughnessMap: toTexture(cRough, 2, 1, false),
    bumpMap: toTexture(cBump, 2, 1, false),
  };
}

function buildHazardTrim(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 128);
  const rand = mulberry32(4505);

  ctx.fillStyle = '#1b1f24';
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = '#cf8d26';
  for (let x = -128; x < 640; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.lineTo(x + 32, 128);
    ctx.lineTo(x + 96, 0);
    ctx.lineTo(x + 64, 0);
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = rand() > 0.35 ? 'rgba(18, 21, 26, 0.55)' : 'rgba(240, 210, 165, 0.16)';
    ctx.fillRect(rand() * 512, rand() * 128, 3 + rand() * 18, 2 + rand() * 9);
  }

  ctx.fillStyle = '#14181e';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 114, 512, 14);

  return toTexture(c, 3, 1, true);
}

function buildMetalGratePBR(): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);

  col.fillStyle = '#0a0d11';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#e5e5e5';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#141414';
  bump.fillRect(0, 0, size, size);

  col.strokeStyle = '#3b434f';
  col.lineWidth = 18;
  col.strokeRect(9, 9, size - 18, size - 18);

  rough.strokeStyle = '#5a5a5a';
  rough.lineWidth = 18;
  rough.strokeRect(9, 9, size - 18, size - 18);

  bump.strokeStyle = '#e0e0e0';
  bump.lineWidth = 18;
  bump.strokeRect(9, 9, size - 18, size - 18);

  for (let i = 28; i < size - 18; i += 24) {
    col.fillStyle = '#38414d';
    col.fillRect(i, 16, 8, size - 32);
    col.fillRect(16, i, size - 32, 6);

    col.fillStyle = '#606d7e';
    col.fillRect(i + 1, 16, 2, size - 32);

    rough.fillStyle = '#505050';
    rough.fillRect(i, 16, 8, size - 32);
    rough.fillRect(16, i, size - 32, 6);

    bump.fillStyle = '#d0d0d0';
    bump.fillRect(i, 16, 8, size - 32);
    bump.fillRect(16, i, size - 32, 6);
  }

  return {
    map: toTexture(cCol, 1, 1, true),
    roughnessMap: toTexture(cRough, 1, 1, false),
    bumpMap: toTexture(cBump, 1, 1, false),
  };
}

function buildTechCratePBR(): PBRTextureSet {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(4606);

  col.fillStyle = '#20262f';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#929292';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#707070';
  bump.fillRect(0, 0, size, size);

  col.fillStyle = '#181d25';
  col.fillRect(46, 46, 420, 420);
  bump.fillStyle = '#484848';
  bump.fillRect(46, 46, 420, 420);

  col.strokeStyle = '#313946';
  col.lineWidth = 42;
  col.strokeRect(21, 21, 470, 470);
  bump.strokeStyle = '#dcdcdc';
  bump.lineWidth = 42;
  bump.strokeRect(21, 21, 470, 470);

  for (const y of [150, 256, 362]) {
    col.fillStyle = '#29303b';
    col.fillRect(58, y - 16, 396, 32);
    bump.fillStyle = '#bcbcbc';
    bump.fillRect(58, y - 16, 396, 32);
  }

  col.fillStyle = '#c97222';
  col.fillRect(62, 64, 154, 16);
  col.fillStyle = '#8fa4b8';
  col.font = 'bold 28px monospace';
  col.fillText('SEC-07 // ORD', 68, 126);

  for (let i = 0; i < 140; i++) {
    const x = rand() * size;
    const y = rand() * size;
    col.fillStyle = rand() > 0.5 ? 'rgba(130, 148, 168, 0.16)' : 'rgba(8, 10, 14, 0.35)';
    col.fillRect(x, y, 4 + rand() * 24, 2 + rand() * 5);
    rough.fillStyle = 'rgba(42, 42, 42, 0.4)';
    rough.fillRect(x, y, 6 + rand() * 18, 2);
  }

  return {
    map: toTexture(cCol, 1, 1, true),
    roughnessMap: toTexture(cRough, 1, 1, false),
    bumpMap: toTexture(cBump, 1, 1, false),
  };
}

function buildIndustrialSign(title: string, subtitle: string, accentHex: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 160);
  const rand = mulberry32(title.length * 733);

  ctx.fillStyle = '#11161e';
  ctx.fillRect(0, 0, 512, 160);

  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 16, 160);
  ctx.fillRect(16, 148, 496, 12);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let y = 0; y < 160; y += 6) {
    ctx.fillRect(16, y, 496, 2);
  }

  ctx.fillStyle = accentHex;
  ctx.font = '700 22px monospace';
  ctx.fillText(subtitle, 36, 46);

  ctx.fillStyle = '#edf6ff';
  ctx.font = '700 54px sans-serif';
  ctx.fillText(title, 34, 114);

  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = 'rgba(12, 15, 20, 0.36)';
    ctx.fillRect(rand() * 512, rand() * 160, 8 + rand() * 34, 2 + rand() * 6);
  }

  return toTexture(c, 1, 1, true, false);
}

/**
 * Two-tone matte-black upper / forest-green anodized lower rifle side decal with hand-painted white "GAME OVER, MAN." stencil!
 */
function buildRifleStencilTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 320);
  const rand = mulberry32(1909);

  const gTop = ctx.createLinearGradient(0, 0, 0, 165);
  gTop.addColorStop(0, '#2d323a');
  gTop.addColorStop(1, '#1c2026');
  ctx.fillStyle = gTop;
  ctx.fillRect(0, 0, 1024, 168);

  const gBot = ctx.createLinearGradient(0, 168, 0, 320);
  gBot.addColorStop(0, '#367438');
  gBot.addColorStop(0.55, '#2b5e2d');
  gBot.addColorStop(1, '#1e4220');
  ctx.fillStyle = gBot;
  ctx.fillRect(0, 168, 1024, 152);

  for (let y = 0; y < 320; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, y, 1024, 1.5);
  }

  ctx.fillStyle = '#111418';
  ctx.fillRect(0, 164, 1024, 6);
  ctx.fillStyle = 'rgba(130, 215, 130, 0.32)';
  ctx.fillRect(0, 170, 1024, 2);

  // Forward ribbed vent block & small serial plate
  ctx.fillStyle = '#15181d';
  ctx.fillRect(36, 128, 180, 118);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = '#383f48';
    ctx.fillRect(48, 138 + i * 17, 156, 7);
  }
  ctx.fillStyle = '#c8c4bc';
  ctx.fillRect(230, 150, 74, 88);
  ctx.fillStyle = '#b42c24';
  ctx.fillRect(240, 164, 54, 28);

  // Hand-painted white "GAME" + tactical skull icon on black upper receiver
  ctx.save();
  ctx.fillStyle = 'rgba(248, 250, 245, 0.94)';
  ctx.font = '700 84px "Trebuchet MS", sans-serif';
  ctx.fillText('GAME', 330, 122);

  ctx.beginPath();
  ctx.arc(645, 92, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f2329';
  ctx.beginPath();
  ctx.arc(633, 86, 8, 0, Math.PI * 2);
  ctx.arc(657, 86, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(634, 108, 22, 10);
  ctx.restore();

  // Hand-painted white "OVER, MAN." continuing across green lower receiver
  ctx.save();
  ctx.fillStyle = 'rgba(244, 248, 242, 0.92)';
  ctx.font = '700 72px "Trebuchet MS", sans-serif';
  ctx.fillText('OVER,', 410, 242);
  ctx.fillText('MAN.', 670, 288);

  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(28, 32, 38, 0.55)' : 'rgba(43, 94, 45, 0.55)';
    ctx.fillRect(320 + rand() * 560, 45 + rand() * 250, 2 + rand() * 9, 2 + rand() * 4);
  }
  ctx.restore();

  return toTexture(c, 1, 1, true, false);
}

/**
 * Shimmering metallic gold/amber wrinkled combat sleeve fabric PBR texture
 */
function buildGoldSleevePBR(): PBRTextureSet {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(2020);

  const grad = col.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#c88d22');
  grad.addColorStop(0.5, '#e2ac38');
  grad.addColorStop(1, '#a97018');
  col.fillStyle = grad;
  col.fillRect(0, 0, size, size);

  rough.fillStyle = '#585858';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * size;
    const w = 18 + rand() * 28;
    const fg = col.createLinearGradient(0, y, 0, y + w);
    fg.addColorStop(0, 'rgba(66, 38, 6, 0.42)');
    fg.addColorStop(0.45, 'rgba(255, 228, 138, 0.4)');
    fg.addColorStop(1, 'rgba(66, 38, 6, 0.32)');
    col.save();
    col.translate(0, y);
    col.rotate((rand() - 0.5) * 0.24);
    col.fillStyle = fg;
    col.fillRect(-60, 0, size + 120, w);
    col.restore();

    const bg = bump.createLinearGradient(0, y, 0, y + w);
    bg.addColorStop(0, '#303030');
    bg.addColorStop(0.45, '#efefef');
    bg.addColorStop(1, '#3a3a3a');
    bump.save();
    bump.translate(0, y);
    bump.rotate((rand() - 0.5) * 0.24);
    bump.fillStyle = bg;
    bump.fillRect(-60, 0, size + 120, w);
    bump.restore();
  }

  col.strokeStyle = 'rgba(255, 232, 168, 0.08)';
  col.lineWidth = 1;
  for (let p = 0; p < size; p += 10) {
    col.beginPath();
    col.moveTo(p, 0);
    col.lineTo(p, size);
    col.moveTo(0, p);
    col.lineTo(size, p);
    col.stroke();
  }

  return {
    map: toTexture(cCol, 1, 1, true),
    roughnessMap: toTexture(cRough, 1, 1, false),
    bumpMap: toTexture(cBump, 1, 1, false),
  };
}

function buildRadialSprite(inner: string, mid: string, outer: string, size = 128): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size, size);
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, inner);
  g.addColorStop(0.32, mid);
  g.addColorStop(0.7, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, 1, 1, true, false);
}

export function createTextureLibrary(): TextureLibrary {
  return {
    wetAsphalt: buildWetAsphaltPBR(),
    grimyConcrete: buildGrimyConcretePBR(),
    industrialSteel: buildIndustrialSteelPBR(),
    corrugatedMetal: buildCorrugatedMetalPBR(),
    hazardTrim: buildHazardTrim(),
    metalGrate: buildMetalGratePBR(),
    techCrate: buildTechCratePBR(),
    signSector: buildIndustrialSign('FOUNDRY BAY 07', 'RESTRICTED // HIGH THERMAL', '#32e5ff'),
    signWarning: buildIndustrialSign('DANGER // BLAST', 'SECTOR B // LIVE FIRE', '#ff5733'),
    emberSprite: buildRadialSprite(
      'rgba(255,252,230,1)',
      'rgba(255,152,48,0.9)',
      'rgba(255,58,18,0.28)',
      64
    ),
    flashSprite: buildRadialSprite(
      'rgba(255,255,245,1)',
      'rgba(255,168,62,0.85)',
      'rgba(255,66,22,0.22)',
      128
    ),
    smokeSprite: buildRadialSprite(
      'rgba(38,44,54,0.82)',
      'rgba(24,28,36,0.52)',
      'rgba(14,17,22,0.12)',
      128
    ),
    rifleStencil: buildRifleStencilTexture(),
    goldSleeve: buildGoldSleevePBR(),
  };
}
