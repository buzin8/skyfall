import * as THREE from 'three';

export interface FacadeTexPair {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
}

export type FacadeStyle =
  | 'midnightGlass'
  | 'artDecoLimestone'
  | 'chryslerChrome'
  | 'midtownMasonry'
  | 'cobaltGlass'
  | 'bronzeArtDeco'
  | 'obsidianSteel'
  | 'brownstoneNight';

export interface DowntownTexturePack {
  wideBillboards: THREE.CanvasTexture[]; // 12 unique photorealistic Times Square LED billboards
  verticalBillboards: THREE.CanvasTexture[]; // 2 monumental vertical Times Square tower spectaculars
  bladeSigns: THREE.CanvasTexture[]; // 4 glowing NYC vertical neon blade signs (TIMES SQUARE, BROADWAY, OPRY, METRO)
  facades: Record<FacadeStyle, FacadeTexPair>;
  storefrontModern: FacadeTexPair;
  storefrontMasonry: FacadeTexPair;
  roadAvenue: THREE.CanvasTexture;
  roadCross: THREE.CanvasTexture;
  roadOnlyDecal: THREE.CanvasTexture;
  crosswalk: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  alleyFloor: THREE.CanvasTexture;
  parkGrass: THREE.CanvasTexture;
  parkPath: THREE.CanvasTexture;
  pondWater: THREE.CanvasTexture;
}

let cachedPack: DowntownTexturePack | null = null;

function createCanvasTex(
  w: number,
  h: number,
  repeat = false,
  aniso = 8
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = aniso;
  return { canvas, ctx, tex };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Extracts a pixel-exact emissive window/storefront glow map from a photorealistic NYC facade photo:
 * dark glass & stone remain sleek and shaded while ONLY lit offices & storefront interiors glow cleanly!
 */
function buildAutoEmissive(
  srcCanvas: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  dstW: number,
  dstH: number,
  lumaThreshold: number,
  boost: number
): void {
  dstCtx.drawImage(srcCanvas, 0, 0, dstW, dstH);
  const imgData = dstCtx.getImageData(0, 0, dstW, dstH);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma > lumaThreshold) {
      const f = Math.min(1, ((luma - lumaThreshold) / (255 - lumaThreshold)) * boost);
      d[i] = Math.min(255, Math.round(r * f * 1.15));
      d[i + 1] = Math.min(255, Math.round(g * f * 1.12));
      d[i + 2] = Math.min(255, Math.round(b * f * 1.1));
    } else {
      // Very subtle cool midnight-blue ambient floor so dark architecture stays legible even in LOW END mode
      d[i] = Math.round(r * 0.08);
      d[i + 1] = Math.round(g * 0.11);
      d[i + 2] = Math.round(b * 0.17);
    }
  }
  dstCtx.putImageData(imgData, 0, 0);
}

/**
 * Builds a photorealistic facade texture pair (diffuse + auto-extracted emissive) with an immediate sleek
 * dark architectural placeholder that seamlessly upgrades the millisecond the high-res JPG decodes.
 */
function createPhotoFacadePair(
  imgPromise: Promise<HTMLImageElement>,
  opts: {
    flipX?: boolean;
    tintR?: number;
    tintG?: number;
    tintB?: number;
    lumaThreshold?: number;
    emissiveBoost?: number;
    w?: number;
    h?: number;
  } = {}
): FacadeTexPair {
  const w = opts.w ?? 512;
  const h = opts.h ?? 512;
  const diff = createCanvasTex(w, h, true, 8);
  const emis = createCanvasTex(w, h, true, 4);

  // Clean dark midnight-slate placeholder while image loads (~30ms)
  diff.ctx.fillStyle = '#141d2e';
  diff.ctx.fillRect(0, 0, w, h);
  emis.ctx.fillStyle = '#050812';
  emis.ctx.fillRect(0, 0, w, h);
  diff.tex.needsUpdate = true;
  emis.tex.needsUpdate = true;

  imgPromise
    .then((img) => {
      diff.ctx.save();
      if (opts.flipX) {
        diff.ctx.translate(w, 0);
        diff.ctx.scale(-1, 1);
      }
      diff.ctx.drawImage(img, 0, 0, w, h);
      diff.ctx.restore();

      if (opts.tintR !== undefined || opts.tintG !== undefined || opts.tintB !== undefined) {
        const tr = opts.tintR ?? 1;
        const tg = opts.tintG ?? 1;
        const tb = opts.tintB ?? 1;
        const data = diff.ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          px[i] = Math.min(255, Math.round(px[i] * tr));
          px[i + 1] = Math.min(255, Math.round(px[i + 1] * tg));
          px[i + 2] = Math.min(255, Math.round(px[i + 2] * tb));
        }
        diff.ctx.putImageData(data, 0, 0);
      }
      diff.tex.needsUpdate = true;

      buildAutoEmissive(
        diff.canvas,
        emis.ctx,
        w,
        h,
        opts.lumaThreshold ?? 98,
        opts.emissiveBoost ?? 1.85
      );
      emis.tex.needsUpdate = true;
    })
    .catch(() => {});

  return { map: diff.tex, emissiveMap: emis.tex };
}

/**
 * Slices a crisp individual photographic LED billboard from a 2x2 or 2x1 high-res Times Square atlas sheet.
 */
function createBillboardSlice(
  sheetPromise: Promise<HTMLImageElement>,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  outW: number,
  outH: number,
  fallbackColor: string
): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(outW, outH, false, 8);
  ctx.fillStyle = fallbackColor;
  ctx.fillRect(0, 0, outW, outH);
  tex.needsUpdate = true;

  sheetPromise
    .then((img) => {
      const sx = Math.round(img.width * rx);
      const sy = Math.round(img.height * ry);
      const sw = Math.round(img.width * rw);
      const sh = Math.round(img.height * rh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      // Subtle real Times Square micro-LED screen scanlines so close-up looks genuinely digital!
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < outH; y += 4) {
        ctx.fillRect(0, y, outW, 1);
      }
      tex.needsUpdate = true;
    })
    .catch(() => {});

  return tex;
}

/**
 * Authentic NYC vertical neon theater & Times Square blade sign (e.g. "TIMES SQUARE", "BROADWAY", "OPRY", "JUNIOR'S").
 */
function createVerticalBladeSign(text: string, bgHex: string, glowHex: string, borderHex: string): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(160, 768, false, 8);
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 160, 768);

  // Outer glowing neon marquee frame
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 8;
  ctx.shadowColor = borderHex;
  ctx.shadowBlur = 16;
  ctx.strokeRect(10, 10, 140, 748);

  // Subtle theater marquee chase bulbs along vertical borders
  ctx.fillStyle = '#fff4d4';
  ctx.shadowColor = '#ffd88a';
  ctx.shadowBlur = 8;
  for (let y = 26; y <= 742; y += 30) {
    ctx.beginPath();
    ctx.arc(20, y, 3.2, 0, Math.PI * 2);
    ctx.arc(140, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stacked vertical lettering just like classic Times Square blade signs!
  const chars = text.split('');
  const stepY = 690 / Math.max(1, chars.length);
  const fontSize = Math.min(56, Math.floor(stepY * 0.84));
  ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = glowHex;
  ctx.shadowColor = glowHex;
  ctx.shadowBlur = 18;
  chars.forEach((ch, idx) => {
    const cy = 44 + (idx + 0.5) * stepY;
    ctx.fillText(ch, 80, cy);
  });
  ctx.shadowBlur = 0;

  tex.needsUpdate = true;
  return tex;
}

function createPhotoRoadTexture(imgPromise: Promise<HTMLImageElement>, rotated90: boolean): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(512, 512, true, 8);
  ctx.fillStyle = '#141c28';
  ctx.fillRect(0, 0, 512, 512);
  tex.needsUpdate = true;

  imgPromise
    .then((img) => {
      ctx.save();
      if (rotated90) {
        ctx.translate(256, 256);
        ctx.rotate(Math.PI * 0.5);
        ctx.drawImage(img, -256, -256, 512, 512);
      } else {
        ctx.drawImage(img, 0, 0, 512, 512);
      }
      ctx.restore();
      tex.needsUpdate = true;
    })
    .catch(() => {});

  return tex;
}

function createRoadOnlyDecal(): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(256, 512, false, 4);
  ctx.clearRect(0, 0, 256, 512);
  ctx.fillStyle = 'rgba(225, 234, 246, 0.72)';
  // Crisp NYC painted street arrow + "ONLY" stencil (seen in Manhattan avenues!)
  ctx.beginPath();
  ctx.moveTo(128, 36);
  ctx.lineTo(192, 136);
  ctx.lineTo(154, 136);
  ctx.lineTo(154, 290);
  ctx.lineTo(102, 290);
  ctx.lineTo(102, 136);
  ctx.lineTo(64, 136);
  ctx.closePath();
  ctx.fill();

  ctx.font = '900 72px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ONLY', 128, 396);
  tex.needsUpdate = true;
  return tex;
}

function createRealisticCrosswalk(): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(512, 256, false, 8);
  ctx.fillStyle = '#141c28';
  ctx.fillRect(0, 0, 512, 256);

  // Subtle wet midnight-blue asphalt grain
  for (let i = 0; i < 1800; i++) {
    const x = (i * 197) % 512;
    const y = (i * 313) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(130,165,210,0.06)' : 'rgba(5,8,14,0.12)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Crisp realistic weathered white NYC Manhattan crosswalk bars
  const stripes = 8;
  const sw = 512 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = 'rgba(226, 234, 245, 0.88)';
    ctx.fillRect(i * sw + 10, 26, sw - 20, 204);
    // Subtle authentic tire scuff wear
    ctx.fillStyle = 'rgba(20, 28, 42, 0.22)';
    ctx.fillRect(i * sw + 14, 78, sw - 28, 18);
    ctx.fillRect(i * sw + 14, 156, sw - 28, 14);
  }

  tex.needsUpdate = true;
  return tex;
}

function createManhattanSidewalk(): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(512, 512, true, 8);
  // Sleek dark damp NYC granite concrete slabs matching midnight Manhattan streetscape
  ctx.fillStyle = '#252e3f';
  ctx.fillRect(0, 0, 512, 512);

  const tiles = 4;
  const ts = 512 / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const shade = ((tx * 7 + ty * 13) % 5) * 4 - 8;
      ctx.fillStyle = `rgb(${37 + shade}, ${46 + shade}, ${63 + shade})`;
      ctx.fillRect(tx * ts + 2, ty * ts + 2, ts - 4, ts - 4);
      // Subtle damp sheen reflection patch
      const rg = ctx.createLinearGradient(tx * ts, ty * ts, (tx + 1) * ts, (ty + 1) * ts);
      rg.addColorStop(0, 'rgba(120, 175, 240, 0.05)');
      rg.addColorStop(1, 'rgba(12, 16, 28, 0.08)');
      ctx.fillStyle = rg;
      ctx.fillRect(tx * ts + 2, ty * ts + 2, ts - 4, ts - 4);
    }
  }

  // Fine mineral concrete grain & crisp slab expansion seams
  for (let i = 0; i < 2400; i++) {
    const x = (i * 257) % 512;
    const y = (i * 419) % 512;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(180,205,240,0.05)' : 'rgba(8,10,18,0.1)';
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = 'rgba(10, 14, 22, 0.65)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * ts, 0);
    ctx.lineTo(i * ts, 512);
    ctx.moveTo(0, i * ts);
    ctx.lineTo(512, i * ts);
    ctx.stroke();
  }

  tex.repeat.set(16, 16);
  tex.needsUpdate = true;
  return tex;
}

function createAlleyFloor(): THREE.CanvasTexture {
  const { ctx, tex } = createCanvasTex(512, 512, true, 4);
  ctx.fillStyle = '#181e2c';
  ctx.fillRect(0, 0, 512, 512);
  // Subtle NYC Belgian-block cobblestone grid
  for (let r = 0; r < 16; r++) {
    const off = (r % 2) * 16;
    for (let c = -1; c < 17; c++) {
      const shade = ((r * 11 + c * 17) % 7) * 3;
      ctx.fillStyle = `rgb(${24 + shade}, ${31 + shade}, ${46 + shade})`;
      ctx.fillRect(c * 32 + off + 2, r * 32 + 2, 28, 28);
    }
  }
  tex.repeat.set(5, 2);
  tex.needsUpdate = true;
  return tex;
}

function createParkTextures(): {
  grass: THREE.CanvasTexture;
  path: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
} {
  // Deep lush night-lit Central Park emerald lawn
  const g = createCanvasTex(512, 512, true, 4);
  g.ctx.fillStyle = '#15362c';
  g.ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4800; i++) {
    const x = (i * 197) % 512;
    const y = (i * 389) % 512;
    g.ctx.fillStyle = i % 3 === 0 ? '#1e4e3e' : i % 3 === 1 ? '#112c24' : '#255e4c';
    g.ctx.fillRect(x, y, 2, 5);
  }
  g.tex.repeat.set(6, 6);
  g.tex.needsUpdate = true;

  // Classic Central Park wet bluestone hexagon/flagstone pavers
  const p = createCanvasTex(512, 512, true, 4);
  p.ctx.fillStyle = '#242e3e';
  p.ctx.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 8; r++) {
    const off = (r % 2) * 32;
    for (let c = -1; c < 9; c++) {
      const v = ((r * 5 + c * 11) % 4) * 5;
      p.ctx.fillStyle = `rgb(${38 + v}, ${48 + v}, ${64 + v})`;
      p.ctx.fillRect(c * 64 + off + 2, r * 64 + 2, 60, 60);
    }
  }
  p.tex.repeat.set(5, 3);
  p.tex.needsUpdate = true;

  // Shimmering midnight Central Park pond reflecting skyline blues & cyan/magenta neon!
  const w = createCanvasTex(512, 512, true, 4);
  const wg = w.ctx.createLinearGradient(0, 0, 512, 512);
  wg.addColorStop(0, '#0a1f3d');
  wg.addColorStop(0.45, '#123862');
  wg.addColorStop(0.75, '#192a5e');
  wg.addColorStop(1, '#0b1c36');
  w.ctx.fillStyle = wg;
  w.ctx.fillRect(0, 0, 512, 512);
  for (let y = 10; y < 512; y += 16) {
    w.ctx.fillStyle = y % 48 === 10 ? 'rgba(64, 210, 255, 0.2)' : y % 32 === 10 ? 'rgba(255, 84, 184, 0.12)' : 'rgba(190, 224, 255, 0.14)';
    w.ctx.fillRect((y * 23) % 240, y, 160 + ((y * 7) % 140), 2.5);
  }
  w.tex.repeat.set(2, 2);
  w.tex.needsUpdate = true;

  return { grass: g.tex, path: p.tex, water: w.tex };
}

export function getDowntownTextures(): DowntownTexturePack {
  if (cachedPack) return cachedPack;

  // Kick off parallel asynchronous loads of all 11 photorealistic Manhattan assets
  const pGlass = loadImage('/textures/downtown/facade_glass_midnight.jpg');
  const pArtDeco = loadImage('/textures/downtown/facade_artdeco_stone.jpg');
  const pChrome = loadImage('/textures/downtown/facade_chrome_tower.jpg');
  const pMasonry = loadImage('/textures/downtown/facade_midtown_masonry.jpg');
  const pStoreModern = loadImage('/textures/downtown/facade_storefront_nyc.jpg');
  const pStoreMasonry = loadImage('/textures/downtown/facade_masonry_ground.jpg');
  const pRoad = loadImage('/textures/downtown/road_manhattan_night.jpg');
  const pAdVert = loadImage('/textures/downtown/ad_sheet_vertical_1.jpg');
  const pAdW1 = loadImage('/textures/downtown/ad_sheet_wide_1.jpg');
  const pAdW2 = loadImage('/textures/downtown/ad_sheet_wide_2.jpg');
  const pAdW3 = loadImage('/textures/downtown/ad_sheet_wide_3.jpg');

  // 8 Distinct Photorealistic Manhattan Architectural Facade Pairs (diffuse + pixel-exact lit-window emissive!)
  const facades: Record<FacadeStyle, FacadeTexPair> = {
    midnightGlass: createPhotoFacadePair(pGlass, { lumaThreshold: 96, emissiveBoost: 1.9 }),
    artDecoLimestone: createPhotoFacadePair(pArtDeco, { lumaThreshold: 118, emissiveBoost: 2.0 }),
    chryslerChrome: createPhotoFacadePair(pChrome, { lumaThreshold: 88, emissiveBoost: 2.1 }),
    midtownMasonry: createPhotoFacadePair(pMasonry, { lumaThreshold: 76, emissiveBoost: 2.0 }),
    cobaltGlass: createPhotoFacadePair(pGlass, {
      flipX: true,
      tintR: 0.78,
      tintG: 0.94,
      tintB: 1.18,
      lumaThreshold: 94,
      emissiveBoost: 1.95,
    }),
    bronzeArtDeco: createPhotoFacadePair(pArtDeco, {
      flipX: true,
      tintR: 1.05,
      tintG: 0.94,
      tintB: 0.84,
      lumaThreshold: 116,
      emissiveBoost: 2.0,
    }),
    obsidianSteel: createPhotoFacadePair(pChrome, {
      flipX: true,
      tintR: 0.74,
      tintG: 0.86,
      tintB: 1.12,
      lumaThreshold: 84,
      emissiveBoost: 2.15,
    }),
    brownstoneNight: createPhotoFacadePair(pMasonry, {
      flipX: true,
      tintR: 1.14,
      tintG: 0.92,
      tintB: 0.84,
      lumaThreshold: 74,
      emissiveBoost: 2.0,
    }),
  };

  // 2 Authentic Photorealistic Street-Level Storefront Pairs (so ZERO skyscraper walls hit the sidewalk raw!)
  const storefrontModern = createPhotoFacadePair(pStoreModern, {
    w: 1024,
    h: 512,
    lumaThreshold: 64,
    emissiveBoost: 2.1,
  });
  const storefrontMasonry = createPhotoFacadePair(pStoreMasonry, {
    w: 1024,
    h: 384,
    lumaThreshold: 62,
    emissiveBoost: 2.0,
  });

  // 2 Monumental Vertical Times Square Spectaculars (with 1% inset away from center divider!)
  const verticalBillboards = [
    createBillboardSlice(pAdVert, 0.0, 0.0, 0.492, 1.0, 512, 1024, '#0c1630'), // HORIZON RISING / MARCH 23
    createBillboardSlice(pAdVert, 0.508, 0.0, 0.492, 1.0, 512, 1024, '#1b0a34'), // MIDNIGHT BROADWAY / LIVE ON 42ND
  ];

  // 12 Completely Unique Photographic Wide Times Square Digital LED Billboards!
  const wideBillboards = [
    createBillboardSlice(pAdW1, 0.0, 0.0, 0.496, 0.496, 512, 512, '#14849a'), // 0: ATELIER NOIR
    createBillboardSlice(pAdW1, 0.504, 0.0, 0.496, 0.496, 512, 512, '#062c44'), // 1: METROPOLIS GLOBAL (Cyan Ticker!)
    createBillboardSlice(pAdW1, 0.0, 0.504, 0.496, 0.496, 512, 512, '#09182c'), // 2: NOVA GT // ELECTRIC
    createBillboardSlice(pAdW1, 0.504, 0.504, 0.496, 0.496, 512, 512, '#061a14'), // 3: HYPER VOLT
    createBillboardSlice(pAdW2, 0.0, 0.0, 0.496, 0.496, 512, 512, '#140b2e'), // 4: ASTRALIS // IMAX
    createBillboardSlice(pAdW2, 0.504, 0.0, 0.496, 0.496, 512, 512, '#280a10'), // 5: KURO RAMEN // 42ND ST
    createBillboardSlice(pAdW2, 0.0, 0.504, 0.496, 0.496, 512, 512, '#121824'), // 6: CHRONO TITAN
    createBillboardSlice(pAdW2, 0.504, 0.504, 0.496, 0.496, 512, 512, '#24083a'), // 7: NEON PULSE // LIVE NYC
    createBillboardSlice(pAdW3, 0.0, 0.0, 0.496, 0.496, 512, 512, '#0a1c2a'), // 8: APEX STRIDE
    createBillboardSlice(pAdW3, 0.504, 0.0, 0.496, 0.496, 512, 512, '#1a140c'), // 9: VELVET LOUNGE
    createBillboardSlice(pAdW3, 0.0, 0.504, 0.496, 0.496, 512, 512, '#072268'), // 10: TDX AUDIO
    createBillboardSlice(pAdW3, 0.504, 0.504, 0.496, 0.496, 512, 512, '#5c0824'), // 11: SOHO STUDIO
  ];

  // 4 Classic Times Square Vertical Projecting Neon Blade Signs
  const bladeSigns = [
    createVerticalBladeSign('TIMES SQ', '#0a1632', '#64f4ff', '#28c6ff'),
    createVerticalBladeSign('BROADWAY', '#26081a', '#ff5cc8', '#ff32a2'),
    createVerticalBladeSign('OPRY NYC', '#1c0c2e', '#ffe082', '#ff4872'),
    createVerticalBladeSign('METRO 42', '#091f2c', '#48ffd4', '#30d4ff'),
  ];

  const park = createParkTextures();

  cachedPack = {
    wideBillboards,
    verticalBillboards,
    bladeSigns,
    facades,
    storefrontModern,
    storefrontMasonry,
    roadAvenue: createPhotoRoadTexture(pRoad, false),
    roadCross: createPhotoRoadTexture(pRoad, true),
    roadOnlyDecal: createRoadOnlyDecal(),
    crosswalk: createRealisticCrosswalk(),
    sidewalk: createManhattanSidewalk(),
    alleyFloor: createAlleyFloor(),
    parkGrass: park.grass,
    parkPath: park.path,
    pondWater: park.water,
  };

  return cachedPack;
}
