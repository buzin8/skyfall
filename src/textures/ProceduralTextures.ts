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
  snowSprite: THREE.CanvasTexture;
  flashSprite: THREE.CanvasTexture;
  smokeSprite: THREE.CanvasTexture;
  rifleStencil: THREE.CanvasTexture;
  goldSleeve: PBRTextureSet;
  desertTan: PBRTextureSet;
  tacticalFabricAlly: PBRTextureSet;
  tacticalFabricEnemy: PBRTextureSet;
  tacticalDenim: PBRTextureSet;
  tacticalVest: PBRTextureSet;
  helmetShell: PBRTextureSet;
  operatorSkin: PBRTextureSet;
  tacticalGlove: PBRTextureSet;
  cryzenBrick: THREE.CanvasTexture;
  cryzenBrickPBR: PBRTextureSet;
  cryzenSnowGround: THREE.CanvasTexture;
  vikendiSnowPBR: PBRTextureSet;
  cryzenConcrete: THREE.CanvasTexture;
  cryzenContainerBlue: THREE.CanvasTexture;
  cryzenContainerRed: THREE.CanvasTexture;
  cryzenContainerGreen: THREE.CanvasTexture;
  cryzenContainerBump: THREE.CanvasTexture;
  cryzenWoodCrate: THREE.CanvasTexture;
  cryzenWoodCrateBump: THREE.CanvasTexture;
  signFactory: THREE.CanvasTexture;
  bloodSplatter: THREE.CanvasTexture;
  bloodWallSplatter: THREE.CanvasTexture;
  bloodMistSprite: THREE.CanvasTexture;
  mountainPineSlope: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
  mountainGraniteRock: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
  mountainGlacialSnow: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
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
  tex.anisotropy = 16;
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

/**
 * Sleek Desert-Tan / Sand-Gold tactical weapon cerakote PBR texture
 * (smooth matte FDE alloy & polymer finish with fine brushed micro-grain and subtle edge patina)
 */
function buildDesertTanPBR(): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(7731);

  const grad = col.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#dfc07c');
  grad.addColorStop(0.5, '#e8ca89');
  grad.addColorStop(1, '#c9a45f');
  col.fillStyle = grad;
  col.fillRect(0, 0, size, size);

  rough.fillStyle = '#848484';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  // Soft tonal anodizing variations (no harsh dark borders!)
  for (let i = 0; i < 60; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 16 + rand() * 44;
    const dark = rand() > 0.5;
    col.fillStyle = dark
      ? `rgba(118, 92, 52, ${0.04 + rand() * 0.05})`
      : `rgba(255, 240, 198, ${0.04 + rand() * 0.06})`;
    col.beginPath();
    col.arc(x, y, r, 0, Math.PI * 2);
    col.fill();
  }

  // Fine horizontal brushed alloy micro-grain
  for (let i = 0; i < 80; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 18 + rand() * 52;
    const bright = rand() > 0.45;
    col.strokeStyle = bright ? 'rgba(255, 242, 208, 0.14)' : 'rgba(92, 72, 42, 0.14)';
    col.lineWidth = 0.8;
    col.beginPath();
    col.moveTo(x, y);
    col.lineTo(x + len, y);
    col.stroke();

    bump.strokeStyle = bright ? 'rgba(148,148,148,0.22)' : 'rgba(110,110,110,0.22)';
    bump.lineWidth = 0.8;
    bump.beginPath();
    bump.moveTo(x, y);
    bump.lineTo(x + len, y);
    bump.stroke();
  }

  return {
    map: toTexture(cCol, 2, 2, true),
    roughnessMap: toTexture(cRough, 2, 2, false),
    bumpMap: toTexture(cBump, 2, 2, false),
  };
}

/**
 * Tactical Ripstop BDU Cloth PBR texture (navy spec-ops or dark urban insurgent cloth)
 * with realistic crosshatch weave, diagonal fabric creases, grime, and stitched seam lines.
 */
function buildRipstopFabricPBR(
  baseHex: string,
  darkHex: string,
  accentHex: string,
  seed: number,
  addCamo = false
): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(seed);

  col.fillStyle = baseHex;
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#d4d4d4';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  // Subtle dark tactical camo / tonal fabric mottling
  for (let i = 0; i < (addCamo ? 46 : 30); i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 14 + rand() * 38;
    const ry = 10 + rand() * 26;
    const rot = rand() * Math.PI;
    col.fillStyle = i % 3 === 0 ? accentHex : darkHex;
    col.globalAlpha = addCamo ? 0.22 + rand() * 0.16 : 0.12 + rand() * 0.1;
    col.beginPath();
    col.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    col.fill();
  }
  col.globalAlpha = 1;

  // Cloth folds & tension wrinkles (adds huge sculptural depth to arms/legs/torso!)
  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * size;
    const h = 10 + rand() * 18;
    const ang = (rand() - 0.5) * 0.35;

    const fg = col.createLinearGradient(0, 0, 0, h);
    fg.addColorStop(0, 'rgba(6, 10, 16, 0.34)');
    fg.addColorStop(0.45, 'rgba(220, 232, 248, 0.14)');
    fg.addColorStop(1, 'rgba(6, 10, 16, 0.26)');
    col.save();
    col.translate(0, y);
    col.rotate(ang);
    col.fillStyle = fg;
    col.fillRect(-40, 0, size + 80, h);
    col.restore();

    const bg = bump.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#464646');
    bg.addColorStop(0.45, '#c2c2c2');
    bg.addColorStop(1, '#525252');
    bump.save();
    bump.translate(0, y);
    bump.rotate(ang);
    bump.fillStyle = bg;
    bump.fillRect(-40, 0, size + 80, h);
    bump.restore();
  }

  // Fine military ripstop crosshatch grid weave
  col.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  col.lineWidth = 1;
  bump.strokeStyle = 'rgba(176, 176, 176, 0.22)';
  bump.lineWidth = 1;
  for (let p = 0; p < size; p += 8) {
    col.beginPath();
    col.moveTo(p, 0);
    col.lineTo(p, size);
    col.moveTo(0, p);
    col.lineTo(size, p);
    col.stroke();

    bump.beginPath();
    bump.moveTo(p, 0);
    bump.lineTo(p, size);
    bump.moveTo(0, p);
    bump.lineTo(size, p);
    bump.stroke();
  }

  // Double-stitched tactical seam accent
  col.strokeStyle = 'rgba(12, 16, 22, 0.45)';
  col.setLineDash([4, 3]);
  col.lineWidth = 1.5;
  col.beginPath();
  col.moveTo(size * 0.5, 0);
  col.lineTo(size * 0.5, size);
  col.stroke();
  col.setLineDash([]);

  return {
    map: toTexture(cCol, 2, 2, true),
    roughnessMap: toTexture(cRough, 2, 2, false),
    bumpMap: toTexture(cBump, 2, 2, false),
  };
}

/**
 * Cordura Nylon MOLLE Plate Carrier PBR texture (PALS webbing straps, bartack stitches, cordura weave)
 */
function buildTacticalVestPBR(): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(8842);

  col.fillStyle = '#30343a';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#c4c4c4';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#707070';
  bump.fillRect(0, 0, size, size);

  // Coarse Cordura nylon grain
  for (let i = 0; i < 650; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = rand() > 0.5 ? 255 : 0;
    col.fillStyle = `rgba(${v},${v},${v},0.05)`;
    col.fillRect(x, y, 2, 2);
  }

  // Horizontal MOLLE / PALS webbing rows + vertical bartack stitches
  for (let y = 14; y < size; y += 36) {
    col.fillStyle = 'rgba(10, 12, 16, 0.65)';
    col.fillRect(0, y - 2, size, 22);
    col.fillStyle = 'rgba(84, 90, 98, 0.42)';
    col.fillRect(0, y, size, 17);
    col.fillStyle = 'rgba(210, 218, 228, 0.14)';
    col.fillRect(0, y, size, 2);

    bump.fillStyle = '#282828';
    bump.fillRect(0, y - 3, size, 24);
    bump.fillStyle = '#d8d8d8';
    bump.fillRect(0, y, size, 17);

    rough.fillStyle = '#9e9e9e';
    rough.fillRect(0, y, size, 17);

    for (let x = 22; x < size; x += 44) {
      col.fillStyle = 'rgba(12, 14, 18, 0.72)';
      col.fillRect(x, y, 4, 17);
      bump.fillStyle = '#3c3c3c';
      bump.fillRect(x, y, 4, 17);
    }
  }

  return {
    map: toTexture(cCol, 2, 2, true),
    roughnessMap: toTexture(cRough, 2, 2, false),
    bumpMap: toTexture(cBump, 2, 2, false),
  };
}

/**
 * Matte Stippled Kevlar Ballistic Helmet PBR texture with tactical scuffing
 */
function buildHelmetShellPBR(): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(9104);

  col.fillStyle = '#9aa0a6';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#a2a2a2';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  // Matte kevlar stipple grain
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = rand() > 0.5;
    col.fillStyle = shade ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    col.fillRect(x, y, 2, 2);
    bump.fillStyle = shade ? 'rgba(170,170,170,0.35)' : 'rgba(90,90,90,0.35)';
    bump.fillRect(x, y, 2, 2);
  }

  // Subtle combat edge scratches
  for (let i = 0; i < 28; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 8 + rand() * 26;
    const ang = rand() * Math.PI;
    col.strokeStyle = rand() > 0.5 ? 'rgba(225,232,240,0.18)' : 'rgba(20,24,28,0.24)';
    col.lineWidth = 1;
    col.beginPath();
    col.moveTo(x, y);
    col.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    col.stroke();
  }

  return {
    map: toTexture(cCol, 2, 2, true),
    roughnessMap: toTexture(cRough, 2, 2, false),
    bumpMap: toTexture(cBump, 2, 2, false),
  };
}

/**
 * Realistic natural human skin PBR texture (soft matte warm-rose/tan undertones,
 * subtle longitudinal forearm shading & fine micro-pore bump — zero plastic sheen!)
 */
function buildOperatorSkinPBR(): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(6619);

  // Subtle anatomical cylindrical shading across circumference (warm sunlit top, cooler shadow underside)
  const grad = col.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0.0, '#c68f78');
  grad.addColorStop(0.28, '#dda990');
  grad.addColorStop(0.55, '#e5b79f');
  grad.addColorStop(0.82, '#cb937c');
  grad.addColorStop(1.0, '#c68f78');
  col.fillStyle = grad;
  col.fillRect(0, 0, size, size);

  rough.fillStyle = '#d8d8d8';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  // Natural warm/cool subcutaneous capillary micro-variations
  for (let i = 0; i < 65; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 32;
    col.fillStyle =
      i % 3 === 0
        ? 'rgba(176, 98, 86, 0.065)'
        : i % 3 === 1
        ? 'rgba(255, 228, 212, 0.055)'
        : 'rgba(120, 96, 88, 0.045)';
    col.beginPath();
    col.arc(x, y, r, 0, Math.PI * 2);
    col.fill();
  }

  // Very subtle skin pore micro-grain
  for (let i = 0; i < 650; i++) {
    const x = rand() * size;
    const y = rand() * size;
    bump.fillStyle = rand() > 0.5 ? 'rgba(146,146,146,0.16)' : 'rgba(112,112,112,0.16)';
    bump.fillRect(x, y, 2, 2);
  }

  return {
    map: toTexture(cCol, 1, 1, true),
    roughnessMap: toTexture(cRough, 1, 1, false),
    bumpMap: toTexture(cBump, 1, 1, false),
  };
}

/**
 * Matte Grained Black Leather / Neoprene Tactical Glove PBR texture
 * (fine leather grain, diagonal grip creases, stitched cuff seams — zero plastic sheen!)
 */
function buildTacticalGlovePBR(): PBRTextureSet {
  const size = 256;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(4491);

  col.fillStyle = '#252930';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#bcbcbc';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  // Fine pebbled tactical leather grain
  for (let i = 0; i < 1100; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const bright = rand() > 0.5;
    col.fillStyle = bright ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
    col.fillRect(x, y, 2, 2);
    bump.fillStyle = bright ? 'rgba(168,168,168,0.34)' : 'rgba(92,92,92,0.34)';
    bump.fillRect(x, y, 2, 2);
  }

  // Natural leather hand-flex crease folds
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * size;
    const w = 8 + rand() * 14;
    const ang = (rand() - 0.5) * 0.45;
    const cg = col.createLinearGradient(0, 0, 0, w);
    cg.addColorStop(0, 'rgba(5, 6, 8, 0.42)');
    cg.addColorStop(0.5, 'rgba(96, 104, 116, 0.16)');
    cg.addColorStop(1, 'rgba(5, 6, 8, 0.28)');
    col.save();
    col.translate(0, y);
    col.rotate(ang);
    col.fillStyle = cg;
    col.fillRect(-30, 0, size + 60, w);
    col.restore();

    const bg = bump.createLinearGradient(0, 0, 0, w);
    bg.addColorStop(0, '#3e3e3e');
    bg.addColorStop(0.5, '#c6c6c6');
    bg.addColorStop(1, '#4c4c4c');
    bump.save();
    bump.translate(0, y);
    bump.rotate(ang);
    bump.fillStyle = bg;
    bump.fillRect(-30, 0, size + 60, w);
    bump.restore();
  }

  // Reinforced tactical seam stitching
  col.strokeStyle = 'rgba(130, 140, 155, 0.24)';
  col.setLineDash([4, 3]);
  col.lineWidth = 1.2;
  col.beginPath();
  col.moveTo(0, size * 0.35);
  col.lineTo(size, size * 0.35);
  col.moveTo(0, size * 0.72);
  col.lineTo(size, size * 0.72);
  col.stroke();
  col.setLineDash([]);

  return {
    map: toTexture(cCol, 2, 2, true),
    roughnessMap: toTexture(cRough, 2, 2, false),
    bumpMap: toTexture(cBump, 2, 2, false),
  };
}

/**
 * Razor-sharp 1024x1024 realistic vibrant Factory terracotta brick PBR set (albedo + bump + roughness):
 * individually shaded clay bricks with kiln variation, beveled edges, deep mortar grooves,
 * subtle architectural weathering, and crisp sun-yellow industrial stripe accents!
 */
function buildCryzenBrickPBR(): PBRTextureSet {
  const size = 1024;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(3141);

  // Deep recessed mortar bed
  col.fillStyle = '#4c3834';
  col.fillRect(0, 0, size, size);
  rough.fillStyle = '#e8e8e8';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#242424';
  bump.fillRect(0, 0, size, size);

  const rows = 16;
  const cols = 8;
  const bh = size / rows;
  const bw = size / cols;
  const mortar = 5;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let cx = -1; cx <= cols; cx++) {
      const bx = cx * bw + offset + mortar * 0.5;
      const by = r * bh + mortar * 0.5;
      const w = bw - mortar;
      const h = bh - mortar;

      // Rich vibrant warm terracotta / burnt sienna / sun-baked brick variation!
      const v = (rand() - 0.5) * 44;
      const warmBoost = rand() > 0.72 ? 16 : 0;
      const rr = Math.min(242, Math.max(95, Math.round(182 + v + warmBoost)));
      const gg = Math.min(165, Math.max(58, Math.round(96 + v * 0.65 + warmBoost * 0.45)));
      const bb = Math.min(138, Math.max(46, Math.round(78 + v * 0.5)));

      const bg = col.createLinearGradient(bx, by, bx, by + h);
      bg.addColorStop(0, `rgb(${Math.min(255, rr + 16)},${Math.min(255, gg + 12)},${Math.min(255, bb + 10)})`);
      bg.addColorStop(0.55, `rgb(${rr},${gg},${bb})`);
      bg.addColorStop(1, `rgb(${Math.max(0, rr - 22)},${Math.max(0, gg - 16)},${Math.max(0, bb - 14)})`);
      col.fillStyle = bg;
      col.fillRect(bx, by, w, h);

      // Crisp top sunlit bevel highlight & bottom shadow edge on every brick
      col.fillStyle = 'rgba(255, 224, 198, 0.24)';
      col.fillRect(bx, by, w, 3);
      col.fillStyle = 'rgba(32, 14, 10, 0.34)';
      col.fillRect(bx, by + h - 3, w, 3);

      // Subtle mineral kiln speckles inside brick
      for (let s = 0; s < 5; s++) {
        col.fillStyle = rand() > 0.5 ? 'rgba(255, 210, 175, 0.14)' : 'rgba(38, 16, 12, 0.18)';
        col.fillRect(bx + rand() * (w - 8), by + rand() * (h - 6), 3 + rand() * 8, 2 + rand() * 4);
      }

      // Pixel-matched bump & roughness per brick!
      const bVal = Math.round(182 + (rand() - 0.5) * 32);
      bump.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bump.fillRect(bx + 2, by + 2, w - 4, h - 4);
      bump.strokeStyle = '#929292';
      bump.lineWidth = 2;
      bump.strokeRect(bx + 1, by + 1, w - 2, h - 2);

      const rVal = Math.round(168 + (rand() - 0.5) * 38);
      rough.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
      rough.fillRect(bx, by, w, h);
    }
  }

  // Crisp subtle vertical architectural rain-wash weathering streaks
  for (let i = 0; i < 28; i++) {
    const sx = rand() * size;
    const sw = 10 + rand() * 24;
    const sh = 180 + rand() * 420;
    const sg = col.createLinearGradient(0, 0, 0, sh);
    sg.addColorStop(0, 'rgba(24, 16, 18, 0.22)');
    sg.addColorStop(1, 'rgba(24, 16, 18, 0)');
    col.fillStyle = sg;
    col.fillRect(sx, 0, sw, sh);
  }

  // Crisp painted vibrant golden-yellow & dark-slate Cryzen Factory industrial caution stripe band!
  const bandY = 290;
  const bandH = 68;
  col.fillStyle = 'rgba(26, 32, 40, 0.88)';
  col.fillRect(0, bandY - 6, size, bandH + 12);
  col.fillStyle = '#f2cc26';
  for (let x = -96; x < size + 96; x += 128) {
    col.beginPath();
    col.moveTo(x, bandY);
    col.lineTo(x + 70, bandY);
    col.lineTo(x + 42, bandY + bandH);
    col.lineTo(x - 28, bandY + bandH);
    col.closePath();
    col.fill();
  }
  // Crisp metallic paint micro-sheen on stripe
  rough.fillStyle = '#8e8e8e';
  rough.fillRect(0, bandY - 6, size, bandH + 12);

  return {
    map: toTexture(cCol, 2, 1, true),
    roughnessMap: toTexture(cRough, 2, 1, false),
    bumpMap: toTexture(cBump, 2, 1, false),
  };
}

/**
 * Razor-sharp 1024x1024 BGMI Vikendi-style alpine snow ground PBR set (albedo + sparkle roughness + bump):
 * fresh sunlit crisp white snowdrifts, cool icy-blue wind-sculpted ripples, subtle packed foot/tire
 * tracks, crystalline micro-ice specular glints, and sparse frozen gravel flecks peeking through!
 */
function buildVikendiSnowPBR(): PBRTextureSet {
  const size = 1024;
  const [cCol, col] = makeCanvas(size, size);
  const [cRough, rough] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(2718);

  // Fresh bright sunlit alpine snow base (clean white with soft cool sky tint!)
  const baseGrad = col.createLinearGradient(0, 0, size, size);
  baseGrad.addColorStop(0, '#eef6fd');
  baseGrad.addColorStop(0.5, '#f7fbff');
  baseGrad.addColorStop(1, '#e4f0fa');
  col.fillStyle = baseGrad;
  col.fillRect(0, 0, size, size);

  // Mid-matte powdery snow base with crystal glints layered on top
  rough.fillStyle = '#c4c4c4';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  // 1. Soft organic wind-blown snowdrift mounds & icy-blue shaded hollows (seamlessly wrapped!)
  for (let i = 0; i < 85; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 64 + rand() * 175;
    const ry = 24 + rand() * 72;
    const ang = -0.28 + (rand() - 0.5) * 0.45;
    const isCrest = i % 2 === 0;

    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -rx || px > size + rx || py < -rx || py > size + rx) continue;

        col.save();
        col.translate(px, py);
        col.rotate(ang);
        col.scale(1, ry / rx);
        const sg = col.createRadialGradient(0, 0, 4, 0, 0, rx);
        if (isCrest) {
          sg.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
          sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
          sg.addColorStop(0, 'rgba(142, 186, 226, 0.44)');
          sg.addColorStop(1, 'rgba(142, 186, 226, 0)');
        }
        col.fillStyle = sg;
        col.beginPath();
        col.arc(0, 0, rx, 0, Math.PI * 2);
        col.fill();
        col.restore();

        bump.save();
        bump.translate(px, py);
        bump.rotate(ang);
        bump.scale(1, ry / rx);
        const bg = bump.createRadialGradient(0, 0, 4, 0, 0, rx);
        bg.addColorStop(0, isCrest ? 'rgba(225, 225, 225, 0.55)' : 'rgba(56, 56, 56, 0.48)');
        bg.addColorStop(1, 'rgba(128, 128, 128, 0)');
        bump.fillStyle = bg;
        bump.beginPath();
        bump.arc(0, 0, rx, 0, Math.PI * 2);
        bump.fill();
        bump.restore();
      }
    }
  }

  // 2. Subtle wind-carved sastrugi snow ripples (gives unmistakable BGMI Vikendi depth!)
  for (let i = 0; i < 42; i++) {
    const sx = rand() * size;
    const sy = rand() * size;
    const len = 90 + rand() * 190;
    const wave = (rand() - 0.5) * 24;
    col.strokeStyle = 'rgba(134, 178, 222, 0.30)';
    col.lineWidth = 6 + rand() * 8;
    col.lineCap = 'round';
    col.beginPath();
    col.moveTo(sx, sy);
    col.quadraticCurveTo(sx + len * 0.5, sy + wave, sx + len, sy - wave * 0.4);
    col.stroke();

    bump.strokeStyle = 'rgba(65, 65, 65, 0.38)';
    bump.lineWidth = 8;
    bump.beginPath();
    bump.moveTo(sx, sy);
    bump.quadraticCurveTo(sx + len * 0.5, sy + wave, sx + len, sy - wave * 0.4);
    bump.stroke();
  }

  // 3. Subtle packed boot / vehicle tracks stamped lightly into fresh snow
  for (let t = 0; t < 2; t++) {
    const tx = 240 + t * 520;
    col.strokeStyle = 'rgba(146, 182, 214, 0.32)';
    col.lineWidth = 22;
    col.setLineDash([14, 10]);
    col.beginPath();
    col.moveTo(tx, 0);
    col.bezierCurveTo(tx + 30, 340, tx - 26, 680, tx, size);
    col.stroke();

    bump.strokeStyle = 'rgba(42, 42, 42, 0.45)';
    bump.lineWidth = 20;
    bump.setLineDash([14, 10]);
    bump.beginPath();
    bump.moveTo(tx, 0);
    bump.bezierCurveTo(tx + 30, 340, tx - 26, 680, tx, size);
    bump.stroke();

    // Slightly smoother packed ice sheen inside tracks
    rough.strokeStyle = 'rgba(62, 62, 62, 0.45)';
    rough.lineWidth = 20;
    rough.setLineDash([14, 10]);
    rough.beginPath();
    rough.moveTo(tx, 0);
    rough.bezierCurveTo(tx + 30, 340, tx - 26, 680, tx, size);
    rough.stroke();
  }
  col.setLineDash([]);
  bump.setLineDash([]);
  rough.setLineDash([]);

  // 4. Crisp sparkling snow crystal micro-glints & sparse tiny frozen earth/pebble flecks
  for (let i = 0; i < 4200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const s = 1.5 + rand() * 2.2;
    if (rand() > 0.08) {
      // Sparkling crystalline snow grain (low roughness glint + crisp white highlight!)
      col.fillStyle = rand() > 0.4 ? 'rgba(255, 255, 255, 0.65)' : 'rgba(170, 206, 236, 0.26)';
      col.fillRect(x, y, s, s);
      if (rand() > 0.65) {
        rough.fillStyle = 'rgba(28, 28, 28, 0.85)';
        rough.fillRect(x, y, s, s);
      }
      bump.fillStyle = rand() > 0.5 ? 'rgba(180,180,180,0.32)' : 'rgba(90,90,90,0.28)';
      bump.fillRect(x, y, s, s);
    } else {
      // Tiny dark alpine rock/soil speck peeking through thin snow (adds realistic Vikendi ground crunch!)
      col.fillStyle = 'rgba(84, 96, 108, 0.34)';
      col.fillRect(x, y, s * 1.4, s * 1.4);
    }
  }

  return {
    map: toTexture(cCol, 6, 6, true),
    roughnessMap: toTexture(cRough, 6, 6, false),
    bumpMap: toTexture(cBump, 6, 6, false),
  };
}

/**
 * Razor-sharp 1024x1024 architectural concrete loading slab texture with expansion joints & guide lines
 */
function buildCryzenConcrete(): THREE.CanvasTexture {
  const size = 1024;
  const [c, ctx] = makeCanvas(size, size);
  const rand = mulberry32(9012);

  ctx.fillStyle = '#8b99a8';
  ctx.fillRect(0, 0, size, size);

  // Fine mineral concrete grain & tonal panels
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(28,38,50,0.08)';
    ctx.fillRect(rand() * size, rand() * size, 24 + rand() * 110, 18 + rand() * 84);
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(235,244,255,0.08)' : 'rgba(20,28,38,0.12)';
    ctx.fillRect(rand() * size, rand() * size, 2.5, 2.5);
  }

  // Sharp beveled slab seams & form-tie anchor bolts
  ctx.strokeStyle = 'rgba(28, 36, 46, 0.65)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size, size * 0.5);
  ctx.moveTo(size * 0.5, 0);
  ctx.lineTo(size * 0.5, size);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(220, 234, 248, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, size - 16, size - 16);

  // Painted bright safety-yellow concrete lane border trim
  ctx.fillStyle = 'rgba(245, 198, 42, 0.72)';
  ctx.fillRect(18, 0, 14, size);
  ctx.fillRect(size - 32, 0, 14, size);

  return toTexture(c, 2, 2, true);
}

/**
 * Razor-sharp 1024x1024 vivid colourful corrugated ISO shipping container texture
 * with 3D-shaded trapezoidal steel ribs, corner castings, weathered scuffs & crisp industrial stencils!
 */
function buildCryzenContainer(baseHex: string, darkHex: string, hiHex: string, label: string, sub: string): THREE.CanvasTexture {
  const size = 1024;
  const [c, ctx] = makeCanvas(size, size);
  const rand = mulberry32(label.charCodeAt(0) * 97 + label.charCodeAt(4));

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Crisp trapezoidal 3D-shaded steel corrugation ribs (aligned to cryzenContainerBump!)
  const ribStep = 64;
  for (let x = 0; x < size; x += ribStep) {
    const rg = ctx.createLinearGradient(x, 0, x + ribStep, 0);
    rg.addColorStop(0.0, darkHex);
    rg.addColorStop(0.24, baseHex);
    rg.addColorStop(0.45, hiHex);
    rg.addColorStop(0.68, baseHex);
    rg.addColorStop(0.92, darkHex);
    rg.addColorStop(1.0, darkHex);
    ctx.fillStyle = rg;
    ctx.fillRect(x, 64, ribStep, size - 128);
  }

  // Heavy welded perimeter steel beams + bolted ISO corner castings
  ctx.fillStyle = darkHex;
  ctx.fillRect(0, 0, size, 64);
  ctx.fillRect(0, size - 64, size, 64);
  ctx.fillRect(0, 0, 52, size);
  ctx.fillRect(size - 52, 0, 52, size);

  ctx.fillStyle = hiHex;
  ctx.fillRect(52, 62, size - 104, 5);
  ctx.fillRect(52, size - 67, size - 104, 5);

  // Corner steel reinforcement plates & rivet bolts
  ctx.fillStyle = '#252d36';
  for (const [cx, cy] of [[0, 0], [size - 72, 0], [0, size - 72], [size - 72, size - 72]]) {
    ctx.fillRect(cx, cy, 72, 72);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx + 6, cy + 6, 60, 60);
  }

  // Subtle realistic metallic edge scuffs & vertical patina streaks
  for (let i = 0; i < 85; i++) {
    ctx.fillStyle = rand() > 0.55 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(12, 16, 22, 0.2)';
    ctx.fillRect(60 + rand() * (size - 120), 70 + rand() * (size - 140), 4 + rand() * 34, 2 + rand() * 8);
  }

  // Crisp bright accent stripe + high-contrast industrial cargo stencil
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '800 88px "Segoe UI", sans-serif';
  ctx.fillText(label, 96, 220);
  ctx.fillStyle = '#ffd63b';
  ctx.fillRect(96, 242, 260, 12);
  ctx.fillStyle = 'rgba(240, 248, 255, 0.82)';
  ctx.font = '700 34px monospace';
  ctx.fillText(sub, 96, 298);

  return toTexture(c, 1, 1, true);
}

/**
 * Pixel-aligned 1024x1024 bump map matching buildCryzenContainer steel corrugation ribs & beams!
 */
function buildCryzenContainerBump(): THREE.CanvasTexture {
  const size = 1024;
  const [c, ctx] = makeCanvas(size, size);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const ribStep = 64;
  for (let x = 0; x < size; x += ribStep) {
    const bg = ctx.createLinearGradient(x, 0, x + ribStep, 0);
    bg.addColorStop(0.0, '#2a2a2a');
    bg.addColorStop(0.32, '#e8e8e8');
    bg.addColorStop(0.58, '#f0f0f0');
    bg.addColorStop(0.92, '#2a2a2a');
    bg.addColorStop(1.0, '#2a2a2a');
    ctx.fillStyle = bg;
    ctx.fillRect(x, 64, ribStep, size - 128);
  }

  // Raised welded steel perimeter frame
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(0, 0, size, 64);
  ctx.fillRect(0, size - 64, size, 64);
  ctx.fillRect(0, 0, 52, size);
  ctx.fillRect(size - 52, 0, 52, size);

  return toTexture(c, 1, 1, false);
}

/**
 * Razor-sharp 1024x1024 warm cedar tactical wooden supply crate (albedo + matched bump map!)
 */
function buildCryzenWoodCratePBR(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 1024;
  const [cCol, col] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(8421);

  col.fillStyle = '#c88b48';
  col.fillRect(0, 0, size, size);
  bump.fillStyle = '#909090';
  bump.fillRect(0, 0, size, size);

  // Horizontal individual plank slats with crisp realistic wood-grain striations
  const planks = 7;
  const ph = (size - 160) / planks;
  for (let p = 0; p < planks; p++) {
    const py = 80 + p * ph;
    const tone = (rand() - 0.5) * 26;
    col.fillStyle = `rgb(${Math.round(202 + tone)}, ${Math.round(138 + tone * 0.7)}, ${Math.round(74 + tone * 0.45)})`;
    col.fillRect(80, py + 4, size - 160, ph - 8);

    // Fine wood grain lines per plank
    for (let gy = py + 8; gy < py + ph - 6; gy += 6) {
      col.fillStyle = rand() > 0.5 ? 'rgba(84, 42, 14, 0.14)' : 'rgba(255, 224, 174, 0.1)';
      col.fillRect(80, gy, size - 160, 2.5);
    }

    // Recessed dark plank seam
    col.fillStyle = '#4a2b12';
    col.fillRect(80, py, size - 160, 5);
    bump.fillStyle = '#202020';
    bump.fillRect(80, py, size - 160, 6);
  }

  // Heavy beveled diagonal cross-brace
  col.strokeStyle = '#965d28';
  col.lineWidth = 74;
  col.beginPath();
  col.moveTo(86, 86);
  col.lineTo(size - 86, size - 86);
  col.stroke();

  col.strokeStyle = 'rgba(255, 218, 165, 0.28)';
  col.lineWidth = 5;
  col.beginPath();
  col.moveTo(116, 62);
  col.lineTo(size - 62, size - 116);
  col.stroke();

  bump.strokeStyle = '#dedede';
  bump.lineWidth = 76;
  bump.beginPath();
  bump.moveTo(86, 86);
  bump.lineTo(size - 86, size - 86);
  bump.stroke();

  // Heavy outer timber frame
  col.strokeStyle = '#7c4c20';
  col.lineWidth = 84;
  col.strokeRect(42, 42, size - 84, size - 84);
  col.strokeStyle = '#4a2b12';
  col.lineWidth = 6;
  col.strokeRect(82, 82, size - 164, size - 164);

  bump.strokeStyle = '#f0f0f0';
  bump.lineWidth = 84;
  bump.strokeRect(42, 42, size - 84, size - 84);

  // Heavy riveted gunmetal corner armor brackets
  col.fillStyle = '#38424d';
  bump.fillStyle = '#ffffff';
  for (const [cx, cy] of [[12, 12], [size - 104, 12], [12, size - 104], [size - 104, size - 104]]) {
    col.fillRect(cx, cy, 92, 92);
    col.strokeStyle = '#181e24';
    col.lineWidth = 4;
    col.strokeRect(cx + 4, cy + 4, 84, 84);
    bump.fillRect(cx, cy, 92, 92);
    // Corner bolts
    col.fillStyle = '#8d9cb0';
    for (const [bx, by] of [[24, 24], [68, 24], [24, 68], [68, 68]]) {
      col.beginPath();
      col.arc(cx + bx, cy + by, 6, 0, Math.PI * 2);
      col.fill();
    }
    col.fillStyle = '#38424d';
  }

  // Crisp bright orange/white supply stencil
  col.fillStyle = 'rgba(255, 146, 46, 0.85)';
  col.fillRect(130, 126, 220, 16);
  col.fillStyle = 'rgba(255, 248, 232, 0.85)';
  col.font = '800 44px monospace';
  col.fillText('ORD-07 // AMMO', 130, 192);

  return {
    map: toTexture(cCol, 1, 1, true, false),
    bump: toTexture(cBump, 1, 1, false, false),
  };
}

/**
 * Forensic-grade 512x512 dark viscous oxblood arterial pool & cast-off floor splatter texture
 * (thick deep coagulated crimson core, dark surface-tension meniscus rim, jagged velocity spines — ZERO cartoon neon red!)
 */
function buildBloodSplatter(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const rand = mulberry32(6661);
  const half = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Irregular organic multi-lobed dark oxblood pool silhouette
  ctx.save();
  ctx.beginPath();
  const lobes = 28;
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const wobble =
      1 +
      Math.sin(a * 3 + 0.6) * 0.14 +
      Math.cos(a * 5 - 1.1) * 0.09 +
      Math.sin(a * 9 + 2.2) * 0.05;
    const rad = 112 * wobble;
    const px = half + Math.cos(a) * rad;
    const py = half + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Deep venous/arterial oxblood gradient with darker thickened meniscus edge
  const g = ctx.createRadialGradient(half - 14, half - 10, 8, half, half, 134);
  g.addColorStop(0.0, 'rgba(54, 2, 5, 0.99)');
  g.addColorStop(0.42, 'rgba(92, 5, 9, 0.97)');
  g.addColorStop(0.74, 'rgba(116, 8, 13, 0.93)');
  g.addColorStop(0.92, 'rgba(42, 2, 4, 0.96)');
  g.addColorStop(1.0, 'rgba(28, 1, 3, 0.0)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // Subtle wet surface tension inner clot depth variation
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 76;
    const rx = 18 + rand() * 34;
    const ry = 12 + rand() * 24;
    ctx.fillStyle = rand() > 0.4 ? 'rgba(36, 1, 3, 0.36)' : 'rgba(128, 10, 15, 0.28)';
    ctx.beginPath();
    ctx.ellipse(half + Math.cos(a) * d, half + Math.sin(a) * d, rx, ry, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sharp radial arterial cast-off spines & violent impact streaks
  for (let i = 0; i < 34; i++) {
    const ang = rand() * Math.PI * 2;
    const startR = 76 + rand() * 32;
    const len = 24 + rand() * 92;
    const w = 2.5 + rand() * 6.5;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(ang);
    ctx.fillStyle = `rgba(${58 + Math.floor(rand() * 54)}, 3, 6, ${0.84 + rand() * 0.14})`;
    ctx.beginPath();
    ctx.moveTo(startR, -w);
    ctx.quadraticCurveTo(startR + len * 0.55, -w * 0.35, startR + len, 0);
    ctx.quadraticCurveTo(startR + len * 0.55, w * 0.35, startR, w);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Sharp teardrop satellite spatter droplets around the outer impact halo
  for (let i = 0; i < 58; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 110 + rand() * 124;
    const x = half + Math.cos(ang) * dist;
    const y = half + Math.sin(ang) * dist;
    const r = 1.8 + rand() * 6.2;
    ctx.fillStyle = `rgba(${52 + Math.floor(rand() * 64)}, 3, 7, ${0.8 + rand() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.9, r * 0.72, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  return toTexture(c, 1, 1, true, false);
}

/**
 * Forensic-grade 512x512 wall blood splatter with realistic gravity-driven dark arterial drips running straight down!
 */
function buildBloodWallSplatter(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const rand = mulberry32(8419);
  const cx = size * 0.5;
  const cy = size * 0.34;

  ctx.clearRect(0, 0, size, size);

  // Violent asymmetric high-velocity exit-wound wall impact core
  for (let i = 0; i < 24; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = rand() * 66;
    const rx = 12 + rand() * 34;
    const ry = 8 + rand() * 24;
    const rVal = 46 + Math.floor(rand() * 66);
    ctx.fillStyle = `rgba(${rVal}, 3, 6, ${0.82 + rand() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, rx, ry, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sharp radial spray streaks around impact center
  for (let i = 0; i < 42; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 42 + rand() * 115;
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist;
    const r = 1.8 + rand() * 5.2;
    ctx.fillStyle = `rgba(${54 + Math.floor(rand() * 62)}, 3, 6, ${0.78 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2.1, r * 0.65, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chilling gravity-pulled thick crimson rivulets dripping straight downward (+Y in canvas)
  const dripCount = 9;
  for (let d = 0; d < dripCount; d++) {
    const startX = cx + (rand() - 0.5) * 145;
    const startY = cy + (rand() - 0.2) * 58;
    const dripLen = 95 + rand() * 215;
    const baseW = 3.2 + rand() * 5.4;

    const dg = ctx.createLinearGradient(startX, startY, startX, startY + dripLen);
    dg.addColorStop(0, 'rgba(62, 3, 6, 0.96)');
    dg.addColorStop(0.7, 'rgba(88, 5, 10, 0.92)');
    dg.addColorStop(1, 'rgba(42, 2, 4, 0.98)');
    ctx.fillStyle = dg;

    ctx.beginPath();
    ctx.moveTo(startX - baseW * 0.6, startY);
    const sway = (rand() - 0.5) * 10;
    ctx.quadraticCurveTo(startX + sway - baseW * 0.35, startY + dripLen * 0.55, startX + sway * 0.4 - baseW * 0.25, startY + dripLen);
    ctx.arc(startX + sway * 0.4, startY + dripLen, baseW * 0.72, Math.PI, 0, true);
    ctx.quadraticCurveTo(startX + sway + baseW * 0.35, startY + dripLen * 0.55, startX + baseW * 0.6, startY);
    ctx.closePath();
    ctx.fill();
  }

  return toTexture(c, 1, 1, true, false);
}

/**
 * Subtle dark pressurized arterial fine-vapor flash sprite (brief high-caliber mist — NOT bright Holi smoke!)
 */
function buildBloodMistSprite(size = 128): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size, size);
  const rand = mulberry32(9917);
  const half = size / 2;

  ctx.clearRect(0, 0, size, size);
  const core = ctx.createRadialGradient(half, half, 2, half, half, half * 0.85);
  core.addColorStop(0, 'rgba(98, 6, 11, 0.78)');
  core.addColorStop(0.38, 'rgba(66, 4, 7, 0.52)');
  core.addColorStop(0.75, 'rgba(38, 2, 4, 0.18)');
  core.addColorStop(1, 'rgba(24, 1, 2, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 10; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 10 + rand() * 24;
    const r = 6 + rand() * 14;
    const px = half + Math.cos(ang) * dist;
    const py = half + Math.sin(ang) * dist;
    const lg = ctx.createRadialGradient(px, py, 1, px, py, r);
    lg.addColorStop(0, 'rgba(78, 4, 8, 0.48)');
    lg.addColorStop(1, 'rgba(32, 2, 3, 0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 1, 1, true, false);
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

function buildSnowflakeSprite(size = 128): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size, size);
  const half = size / 2;

  // Soft icy-blue outer halo so white flakes pop clearly against both bright sky and dark brick!
  const glow = ctx.createRadialGradient(half, half, 2, half, half, half * 0.92);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  glow.addColorStop(0.28, 'rgba(242, 250, 255, 0.92)');
  glow.addColorStop(0.62, 'rgba(190, 224, 252, 0.36)');
  glow.addColorStop(1, 'rgba(180, 218, 250, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Crisp 6-pointed crystalline snowflake arms + side dendrites
  ctx.save();
  ctx.translate(half, half);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    ctx.lineWidth = size * 0.055;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -half * 0.78);
    ctx.stroke();

    // Twin crystalline side branches
    ctx.lineWidth = size * 0.036;
    for (const frac of [0.42, 0.64]) {
      const by = -half * frac;
      const blen = half * (0.24 - (frac - 0.4) * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, by);
      ctx.lineTo(-blen * 0.78, by - blen * 0.65);
      ctx.moveTo(0, by);
      ctx.lineTo(blen * 0.78, by - blen * 0.65);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  return toTexture(c, 1, 1, true, false);
}

/**
 * Seamless 512x512 textured alpine mountain surface generators (pine forest slopes, striated granite rock, glacial snow)
 * Designed to multiply cleanly with biome vertex colors so every mountain tier has rich organic detail!
 */
function buildMountainSurfaceTexture(
  kind: 'pine' | 'granite' | 'glacial',
  seed: number
): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 512;
  const [cCol, col] = makeCanvas(size, size);
  const [cBump, bump] = makeCanvas(size, size);
  const rand = mulberry32(seed);

  // Neutral-light base so vertex colors tint accurately while preserving high-contrast texture detail
  col.fillStyle = kind === 'pine' ? '#dce3dc' : kind === 'granite' ? '#d4d8de' : '#eef4fa';
  col.fillRect(0, 0, size, size);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, size, size);

  if (kind === 'pine') {
    // Organic evergreen canopy mottling + rocky ledges + winter moss texture
    for (let i = 0; i < 480; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 6 + rand() * 22;
      const roll = rand();
      col.fillStyle =
        roll < 0.42
          ? 'rgba(42, 76, 52, 0.34)'
          : roll < 0.72
          ? 'rgba(72, 108, 68, 0.28)'
          : roll < 0.88
          ? 'rgba(235, 245, 255, 0.38)'
          : 'rgba(66, 62, 56, 0.32)';
      col.beginPath();
      col.arc(x, y, r, 0, Math.PI * 2);
      col.fill();

      bump.fillStyle = roll < 0.55 ? 'rgba(220, 220, 220, 0.42)' : 'rgba(40, 40, 40, 0.38)';
      bump.beginPath();
      bump.arc(x, y, r * 0.85, 0, Math.PI * 2);
      bump.fill();
    }
    // Fine vertical pine-tree silhouette flecks across hillside
    for (let i = 0; i < 650; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const h = 5 + rand() * 11;
      const w = 2.5 + rand() * 4.5;
      col.fillStyle = rand() > 0.35 ? 'rgba(24, 52, 34, 0.42)' : 'rgba(242, 250, 255, 0.36)';
      col.beginPath();
      col.moveTo(x, y - h);
      col.lineTo(x - w, y);
      col.lineTo(x + w, y);
      col.closePath();
      col.fill();
    }
  } else if (kind === 'granite') {
    // Stratified diagonal rock bands, craggy crevices & warm mineral/rust streaks
    for (let i = 0; i < 64; i++) {
      const y = rand() * size;
      const h = 8 + rand() * 26;
      const slant = (rand() - 0.5) * 80;
      const roll = rand();
      col.fillStyle =
        roll < 0.4
          ? 'rgba(68, 76, 88, 0.36)'
          : roll < 0.72
          ? 'rgba(138, 122, 108, 0.28)'
          : 'rgba(235, 244, 255, 0.34)';
      col.beginPath();
      col.moveTo(0, y);
      col.lineTo(size, y + slant);
      col.lineTo(size, y + slant + h);
      col.lineTo(0, y + h);
      col.closePath();
      col.fill();

      bump.fillStyle = roll < 0.5 ? 'rgba(225, 225, 225, 0.35)' : 'rgba(38, 38, 38, 0.4)';
      bump.fillRect(0, y, size, h * 0.7);
    }
    // Sharp jagged vertical rock fissures & alpine scree fractures
    for (let i = 0; i < 160; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 24 + rand() * 88;
      col.strokeStyle = rand() > 0.3 ? 'rgba(34, 42, 54, 0.45)' : 'rgba(245, 250, 255, 0.42)';
      col.lineWidth = 1.5 + rand() * 3.5;
      col.beginPath();
      col.moveTo(x, y);
      col.lineTo(x + (rand() - 0.5) * 32, y + len);
      col.stroke();

      bump.strokeStyle = 'rgba(20, 20, 20, 0.55)';
      bump.lineWidth = 2.5;
      bump.beginPath();
      bump.moveTo(x, y);
      bump.lineTo(x + (rand() - 0.5) * 32, y + len);
      bump.stroke();
    }
  } else {
    // Wind-carved glacial snow ridges, pale icy-blue crevasse grooves & rocky snow veins
    for (let i = 0; i < 90; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rx = 28 + rand() * 90;
      const ry = 10 + rand() * 34;
      const ang = (rand() - 0.5) * 0.65;
      const isIce = rand() > 0.52;
      col.fillStyle = isIce ? 'rgba(155, 195, 232, 0.34)' : 'rgba(255, 255, 255, 0.52)';
      col.beginPath();
      col.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
      col.fill();

      bump.fillStyle = isIce ? 'rgba(65, 65, 65, 0.42)' : 'rgba(215, 215, 215, 0.44)';
      bump.beginPath();
      bump.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
      bump.fill();
    }
    for (let i = 0; i < 70; i++) {
      const x = rand() * size;
      const y = rand() * size;
      col.strokeStyle = 'rgba(72, 92, 118, 0.34)';
      col.lineWidth = 2 + rand() * 4;
      col.beginPath();
      col.moveTo(x, y);
      col.lineTo(x + (rand() - 0.5) * 44, y + 32 + rand() * 64);
      col.stroke();
    }
  }

  return {
    map: toTexture(cCol, 3, 2, true),
    bump: toTexture(cBump, 3, 2, false),
  };
}

export function createTextureLibrary(): TextureLibrary {
  const cryzenBrickPBR = buildCryzenBrickPBR();
  const vikendiSnowPBR = buildVikendiSnowPBR();
  const cryzenCratePBR = buildCryzenWoodCratePBR();
  return {
    wetAsphalt: buildWetAsphaltPBR(),
    grimyConcrete: buildGrimyConcretePBR(),
    industrialSteel: buildIndustrialSteelPBR(),
    corrugatedMetal: buildCorrugatedMetalPBR(),
    hazardTrim: buildHazardTrim(),
    metalGrate: buildMetalGratePBR(),
    techCrate: buildTechCratePBR(),
    signSector: buildIndustrialSign('WAREHOUSE 07', 'LOADING BAY // RESTRICTED', '#32e5ff'),
    signWarning: buildIndustrialSign('DANGER // BLAST', 'BAY B // LIVE FIRE', '#ff5733'),
    emberSprite: buildRadialSprite(
      'rgba(255,252,230,1)',
      'rgba(255,152,48,0.9)',
      'rgba(255,58,18,0.28)',
      64
    ),
    snowSprite: buildSnowflakeSprite(128),
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
    desertTan: buildDesertTanPBR(),
    tacticalFabricAlly: buildRipstopFabricPBR('#2f5b8f', '#1a3454', '#4674ab', 5101, true),
    tacticalFabricEnemy: buildRipstopFabricPBR('#383b36', '#1e211e', '#525144', 5202, true),
    tacticalDenim: buildRipstopFabricPBR('#3c526d', '#243447', '#546f8e', 5303, false),
    tacticalVest: buildTacticalVestPBR(),
    helmetShell: buildHelmetShellPBR(),
    operatorSkin: buildOperatorSkinPBR(),
    tacticalGlove: buildTacticalGlovePBR(),
    cryzenBrick: cryzenBrickPBR.map,
    cryzenBrickPBR,
    cryzenSnowGround: vikendiSnowPBR.map,
    vikendiSnowPBR,
    cryzenConcrete: buildCryzenConcrete(),
    cryzenContainerBlue: buildCryzenContainer('#1568de', '#0b3c8a', '#4ea8ff', 'VK-07', 'CARGO // NORTH'),
    cryzenContainerRed: buildCryzenContainer('#e02c34', '#8e141a', '#ff6b6e', 'DOCK-4', 'FUEL // DEPOT'),
    cryzenContainerGreen: buildCryzenContainer('#1d9658', '#0d5a32', '#4fd98c', 'BAY-12', 'SUPPLY // WEST'),
    cryzenContainerBump: buildCryzenContainerBump(),
    cryzenWoodCrate: cryzenCratePBR.map,
    cryzenWoodCrateBump: cryzenCratePBR.bump,
    signFactory: buildIndustrialSign('VIKENDI DEPOT', 'BAY 01 // LOADING YARD', '#38eeff'),
    bloodSplatter: buildBloodSplatter(),
    bloodWallSplatter: buildBloodWallSplatter(),
    bloodMistSprite: buildBloodMistSprite(128),
    mountainPineSlope: buildMountainSurfaceTexture('pine', 4101),
    mountainGraniteRock: buildMountainSurfaceTexture('granite', 4202),
    mountainGlacialSnow: buildMountainSurfaceTexture('glacial', 4303),
  };
}
