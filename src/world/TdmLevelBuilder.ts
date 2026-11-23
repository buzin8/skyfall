import * as THREE from 'three';
import { AABB, MapId, MinimapRect, RampCollider, ZoneDef } from '../types';
import { TextureLibrary } from '../textures/ProceduralTextures';
import { BuiltLevel } from './LevelBuilder';

const FLOOR2_Y = 4.2;
const SLAB_THICK = 0.34;
const HALF_W = 28; // 56m wide (3x area vs 32x34 solo!)
const HALF_L = 29; // 58m long

type ContainerTheme =
  | 'blue'
  | 'red'
  | 'green'
  | 'orange'
  | 'gold'
  | 'teal'
  | 'purple'
  | 'coral'
  | 'sky'
  | 'lime'
  | 'amber'
  | 'crimson';

interface BurningFlame {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  baseScale: number;
}

interface FlickerFireLight {
  light: THREE.PointLight;
  baseIntensity: number;
  phase: number;
}

interface ContainerThemeConfig {
  top: string;
  mid: string;
  bot: string;
  word: string;
  fill1: string;
  fill2: string;
  outline: string;
  drip: string;
  stencil: string;
  emblem:
    | 'star'
    | 'crown'
    | 'bolt'
    | 'peak'
    | 'arrow'
    | 'crosshair'
    | 'diamond'
    | 'stripes'
    | 'snowflake'
    | 'chevron'
    | 'flame'
    | 'visor';
}

const CONTAINER_THEME_CFG: Record<ContainerTheme, ContainerThemeConfig> = {
  teal: {
    top: '#2ee0f5',
    mid: '#14a6c2',
    bot: '#0b6d88',
    word: 'VIKENDI',
    fill1: '#ff3d9a',
    fill2: '#ffe142',
    outline: '#161124',
    drip: '#ff3d9a',
    stencil: 'SEC-04 // ARCTIC CARGO',
    emblem: 'star',
  },
  gold: {
    top: '#ffd852',
    mid: '#e8a822',
    bot: '#a86e0c',
    word: 'KING',
    fill1: '#ff2846',
    fill2: '#ffffff',
    outline: '#14192a',
    drip: '#ff2846',
    stencil: 'CARGO-88 // HEAVY',
    emblem: 'crown',
  },
  orange: {
    top: '#ff963a',
    mid: '#e65a18',
    bot: '#9c320a',
    word: 'SKYFALL',
    fill1: '#32f6ff',
    fill2: '#fff6c2',
    outline: '#161420',
    drip: '#32f6ff',
    stencil: 'FUEL-09 // HIGH OCTANE',
    emblem: 'bolt',
  },
  blue: {
    top: '#3894ff',
    mid: '#1c5cd4',
    bot: '#0f3688',
    word: 'FROST',
    fill1: '#a2ff38',
    fill2: '#ffffff',
    outline: '#0d1424',
    drip: '#a2ff38',
    stencil: 'VK-07 // CARGO NORTH',
    emblem: 'peak',
  },
  red: {
    top: '#ff5264',
    mid: '#d42238',
    bot: '#861022',
    word: 'APEX',
    fill1: '#ffd238',
    fill2: '#4cf4ff',
    outline: '#1a0c14',
    drip: '#ffd238',
    stencil: 'DOCK-4 // FUEL DEPOT',
    emblem: 'arrow',
  },
  green: {
    top: '#34d47e',
    mid: '#1c9652',
    bot: '#0f5c32',
    word: 'RUSH',
    fill1: '#ff8a28',
    fill2: '#fff3c4',
    outline: '#101c14',
    drip: '#ff8a28',
    stencil: 'BAY-12 // MIL-SPEC',
    emblem: 'crosshair',
  },
  purple: {
    top: '#ba66ff',
    mid: '#7a30d8',
    bot: '#481690',
    word: 'NEON',
    fill1: '#36f6ff',
    fill2: '#ff52be',
    outline: '#120c22',
    drip: '#36f6ff',
    stencil: 'ZONE-X // OVERDRIVE',
    emblem: 'diamond',
  },
  coral: {
    top: '#ff8478',
    mid: '#e04f58',
    bot: '#992c38',
    word: 'CLUTCH',
    fill1: '#ffe642',
    fill2: '#ffffff',
    outline: '#1c1220',
    drip: '#ffe642',
    stencil: 'UNIT-5 // SPEC-OPS',
    emblem: 'stripes',
  },
  sky: {
    top: '#60c8ff',
    mid: '#2892e8',
    bot: '#1458a4',
    word: 'BLIZZARD',
    fill1: '#ff5c38',
    fill2: '#fff8d4',
    outline: '#0e1b30',
    drip: '#ff5c38',
    stencil: 'ALP-19 // GLACIER',
    emblem: 'snowflake',
  },
  lime: {
    top: '#8ce63c',
    mid: '#52b420',
    bot: '#287210',
    word: 'VENOM',
    fill1: '#ff2ec4',
    fill2: '#ffffff',
    outline: '#121c10',
    drip: '#ff2ec4',
    stencil: 'HAZ-22 // BIO CARGO',
    emblem: 'chevron',
  },
  amber: {
    top: '#ffb838',
    mid: '#e08214',
    bot: '#964c08',
    word: 'IGNITE',
    fill1: '#2656ff',
    fill2: '#a8f8ff',
    outline: '#18100a',
    drip: '#2656ff',
    stencil: 'PYRO-11 // FOUNDRY',
    emblem: 'flame',
  },
  crimson: {
    top: '#f03e88',
    mid: '#b81a62',
    bot: '#720d3c',
    word: 'GHOST',
    fill1: '#3cffb8',
    fill2: '#ffffff',
    outline: '#180c18',
    drip: '#3cffb8',
    stencil: 'OPS-99 // PHANTOM',
    emblem: 'visor',
  },
};

// Module-level caches for rich shaded corrugated steel + unique street-art graffiti side, door & roof textures
const cachedGraffitiTextures = new Map<ContainerTheme, THREE.CanvasTexture>();
const cachedDoorTextures = new Map<ContainerTheme, THREE.CanvasTexture>();
const cachedRoofTextures = new Map<ContainerTheme, THREE.CanvasTexture>();

function getGraffitiContainerTexture(theme: ContainerTheme): THREE.CanvasTexture {
  const existing = cachedGraffitiTextures.get(theme);
  if (existing) return existing;

  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const c = CONTAINER_THEME_CFG[theme];

  // 1. Rich sunlit-to-shaded metallic base paint gradient + warm diagonal sunlight sheen
  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0, c.top);
  baseGrad.addColorStop(0.52, c.mid);
  baseGrad.addColorStop(1, c.bot);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  const sunSheen = ctx.createLinearGradient(0, 0, w, h);
  sunSheen.addColorStop(0, 'rgba(255,250,235,0.22)');
  sunSheen.addColorStop(0.45, 'rgba(255,255,255,0.03)');
  sunSheen.addColorStop(1, 'rgba(8,16,32,0.24)');
  ctx.fillStyle = sunSheen;
  ctx.fillRect(0, 0, w, h);

  // 2. Crisp 3D beveled vertical corrugated steel ribs (sunlit ridge + deep shadow valley!)
  const ribW = 24;
  for (let x = 0; x < w; x += ribW) {
    const rGrad = ctx.createLinearGradient(x, 0, x + ribW, 0);
    rGrad.addColorStop(0.0, 'rgba(0,0,0,0.42)');
    rGrad.addColorStop(0.14, 'rgba(255,255,255,0.32)');
    rGrad.addColorStop(0.32, 'rgba(255,255,255,0.10)');
    rGrad.addColorStop(0.68, 'rgba(0,0,0,0.08)');
    rGrad.addColorStop(0.86, 'rgba(0,0,0,0.34)');
    rGrad.addColorStop(1.0, 'rgba(0,0,0,0.44)');
    ctx.fillStyle = rGrad;
    ctx.fillRect(x, 18, ribW, h - 38);
  }

  // 3. Realistic industrial weathering scratches, edge paint wear & micro-grime
  let seed = theme.charCodeAt(0) * 197 + theme.charCodeAt(1) * 53 + theme.length * 31;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 56; i++) {
    ctx.fillStyle = rnd() > 0.45 ? 'rgba(255,255,255,0.09)' : 'rgba(12,18,28,0.12)';
    ctx.fillRect(rnd() * w, 20 + rnd() * (h - 44), 12 + rnd() * 48, 1.4 + rnd() * 2.4);
  }
  // Subtle welded mid-panel horizontal seam
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(16, h * 0.5 - 1, w - 32, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(16, h * 0.5 + 1, w - 32, 1.5);

  // 4. Heavy structural steel top/bottom frame rails + rivets + cast ambient occlusion shadow!
  ctx.fillStyle = 'rgba(10,16,28,0.52)';
  ctx.fillRect(0, 0, w, 20);
  ctx.fillRect(0, h - 22, w, 22);
  // Crisp sunlit top lip highlight + underside cast shadow below top rail
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.fillRect(0, 20, w, 3);
  const topCastAo = ctx.createLinearGradient(0, 23, 0, 44);
  topCastAo.addColorStop(0, 'rgba(0,0,0,0.34)');
  topCastAo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topCastAo;
  ctx.fillRect(0, 23, w, 21);

  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, h - 26, w, 4);

  // Corner weld plates & bolts
  ctx.fillStyle = 'rgba(14,22,34,0.62)';
  ctx.fillRect(0, 0, 16, h);
  ctx.fillRect(w - 16, 0, 16, h);
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  for (let y = 30; y < h - 20; y += 34) {
    ctx.beginPath();
    ctx.arc(8, y, 2.6, 0, Math.PI * 2);
    ctx.arc(w - 8, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Unique Vibrant Spray-Paint Backdrop Splash & Emblem per Container!
  ctx.save();
  const halo = ctx.createRadialGradient(w * 0.5, h * 0.54, 18, w * 0.5, h * 0.54, 195);
  halo.addColorStop(0, 'rgba(0,0,0,0.38)');
  halo.addColorStop(0.62, 'rgba(0,0,0,0.16)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(34, 24, w - 68, h - 48);

  // Distinct geometric street-art graphic emblem for each of the 12 themes!
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = 5;
  if (c.emblem === 'crown') {
    ctx.fillStyle = '#ffe248';
    ctx.beginPath();
    ctx.moveTo(196, 86);
    ctx.lineTo(208, 42);
    ctx.lineTo(234, 68);
    ctx.lineTo(256, 34);
    ctx.lineTo(278, 68);
    ctx.lineTo(304, 42);
    ctx.lineTo(316, 86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'bolt') {
    ctx.fillStyle = '#ffe844';
    ctx.beginPath();
    ctx.moveTo(418, 42);
    ctx.lineTo(382, 118);
    ctx.lineTo(408, 118);
    ctx.lineTo(376, 198);
    ctx.lineTo(446, 102);
    ctx.lineTo(414, 102);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'peak') {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(58, 196);
    ctx.lineTo(108, 72);
    ctx.lineTo(138, 134);
    ctx.lineTo(164, 92);
    ctx.lineTo(206, 196);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'arrow') {
    ctx.fillStyle = c.fill2;
    ctx.beginPath();
    ctx.moveTo(72, 186);
    ctx.lineTo(402, 168);
    ctx.lineTo(392, 148);
    ctx.lineTo(454, 174);
    ctx.lineTo(398, 206);
    ctx.lineTo(404, 188);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'crosshair') {
    ctx.strokeStyle = c.fill1;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(412, 128, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(356, 128);
    ctx.lineTo(468, 128);
    ctx.moveTo(412, 72);
    ctx.lineTo(412, 184);
    ctx.stroke();
  } else if (c.emblem === 'diamond') {
    ctx.fillStyle = c.fill2;
    ctx.beginPath();
    ctx.moveTo(106, 62);
    ctx.lineTo(148, 128);
    ctx.lineTo(106, 194);
    ctx.lineTo(64, 128);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'star') {
    ctx.fillStyle = c.fill2;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const r = p % 2 === 0 ? 38 : 16;
      const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
      const sx = 426 + Math.cos(a) * r;
      const sy = 84 + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'snowflake') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(92 - Math.cos(a) * 38, 102 - Math.sin(a) * 38);
      ctx.lineTo(92 + Math.cos(a) * 38, 102 + Math.sin(a) * 38);
      ctx.stroke();
    }
  } else if (c.emblem === 'chevron') {
    ctx.strokeStyle = c.fill1;
    ctx.lineWidth = 10;
    for (let k = 0; k < 2; k++) {
      const ox = 392 + k * 28;
      ctx.beginPath();
      ctx.moveTo(ox, 74);
      ctx.lineTo(ox + 34, 128);
      ctx.lineTo(ox, 182);
      ctx.stroke();
    }
  } else if (c.emblem === 'flame') {
    ctx.fillStyle = '#ff3b28';
    ctx.beginPath();
    ctx.moveTo(92, 192);
    ctx.quadraticCurveTo(56, 146, 86, 102);
    ctx.quadraticCurveTo(88, 68, 110, 52);
    ctx.quadraticCurveTo(132, 92, 124, 124);
    ctx.quadraticCurveTo(148, 148, 118, 192);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.emblem === 'visor') {
    ctx.fillStyle = c.fill1;
    ctx.beginPath();
    ctx.moveTo(356, 92);
    ctx.lineTo(458, 76);
    ctx.lineTo(446, 134);
    ctx.lineTo(368, 142);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Diagonal high-energy racing stripes
    ctx.fillStyle = 'rgba(255, 230, 66, 0.88)';
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      ctx.beginPath();
      const ox = 368 + sIdx * 34;
      ctx.moveTo(ox, 212);
      ctx.lineTo(ox + 20, 212);
      ctx.lineTo(ox + 54, 44);
      ctx.lineTo(ox + 34, 44);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 6. Bold Wildstyle Graffiti Wordmark with 3D drop shadow, two-tone neon fill & spray drips!
  ctx.translate(w * 0.49, h * 0.56);
  ctx.rotate((rnd() - 0.5) * 0.14);
  const fontSize = c.word.length >= 8 ? 64 : 76;
  ctx.font = `italic 900 ${fontSize}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Chunky 3D street-art shadow block
  ctx.fillStyle = c.outline;
  for (let off = 10; off >= 2; off -= 2) {
    ctx.fillText(c.word, off, off);
  }

  // Thick outline
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c.outline;
  ctx.strokeText(c.word, 0, 0);

  // Two-tone neon street-art fill gradient
  const txtGrad = ctx.createLinearGradient(0, -36, 0, 36);
  txtGrad.addColorStop(0, c.fill2);
  txtGrad.addColorStop(0.45, c.fill1);
  txtGrad.addColorStop(1, c.fill2);
  ctx.fillStyle = txtGrad;
  ctx.fillText(c.word, 0, 0);

  // Glossy white highlight gleam along upper lettering
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.fillRect(-130, -24, 260, 5);

  // Authentic spray-paint drips & splatter dots
  ctx.fillStyle = c.drip;
  for (let d = 0; d < 9; d++) {
    const dx = -135 + d * 34 + (rnd() - 0.5) * 14;
    const len = 14 + rnd() * 28;
    ctx.fillRect(dx, 28, 4.5, len);
    ctx.beginPath();
    ctx.arc(dx + 2.25, 28 + len, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let sp = 0; sp < 28; sp++) {
    ctx.fillStyle = sp % 2 === 0 ? c.fill1 : c.fill2;
    ctx.beginPath();
    ctx.arc((rnd() - 0.5) * 340, (rnd() - 0.5) * 130, 1.8 + rnd() * 3.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 7. Crisp industrial cargo stencil in top-left corner + bottom AO contact shadow
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(c.stencil, 26, 40);

  const bottomAo = ctx.createLinearGradient(0, h - 58, 0, h);
  bottomAo.addColorStop(0, 'rgba(0,0,0,0)');
  bottomAo.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = bottomAo;
  ctx.fillRect(0, h - 58, w, 58);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedGraffitiTextures.set(theme, tex);
  return tex;
}

/**
 * Generates realistic shaded shipping-container double cargo doors with vertical steel locking bars,
 * cam latches, corner hinges & hazard serial placard for the narrow container ends!
 */
function getContainerEndDoorTexture(theme: ContainerTheme): THREE.CanvasTexture {
  const existing = cachedDoorTextures.get(theme);
  if (existing) return existing;

  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const c = CONTAINER_THEME_CFG[theme];

  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, c.top);
  bg.addColorStop(0.55, c.mid);
  bg.addColorStop(1, c.bot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);

  // Horizontal pressed steel door panels with beveled lighting & shadow
  for (let y = 26; y < s - 28; y += 34) {
    const pGrad = ctx.createLinearGradient(0, y, 0, y + 26);
    pGrad.addColorStop(0, 'rgba(255,255,255,0.24)');
    pGrad.addColorStop(0.25, 'rgba(255,255,255,0.04)');
    pGrad.addColorStop(0.8, 'rgba(0,0,0,0.22)');
    pGrad.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(20, y, s * 0.5 - 26, 26);
    ctx.fillRect(s * 0.5 + 6, y, s * 0.5 - 26, 26);
  }

  // Deep center vertical door rubber gasket seam
  ctx.fillStyle = 'rgba(10,14,22,0.82)';
  ctx.fillRect(s * 0.5 - 4, 16, 8, s - 32);

  // Heavy outer steel door frame
  ctx.strokeStyle = 'rgba(12,18,28,0.68)';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, s - 18, s - 18);

  // 4 galvanized metallic locking rods + latch handles + cam keepers
  for (const rx of [62, 102, 154, 194]) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(rx + 2, 18, 6, s - 36);
    const rodGrad = ctx.createLinearGradient(rx - 3, 0, rx + 3, 0);
    rodGrad.addColorStop(0, '#5a6a7d');
    rodGrad.addColorStop(0.45, '#d8e4f0');
    rodGrad.addColorStop(1, '#3b4859');
    ctx.fillStyle = rodGrad;
    ctx.fillRect(rx - 3, 18, 6, s - 36);

    // Cam brackets & handle
    ctx.fillStyle = '#222c38';
    ctx.fillRect(rx - 6, 36, 12, 8);
    ctx.fillRect(rx - 6, s - 46, 12, 8);
    ctx.fillStyle = '#cfdbe8';
    ctx.fillRect(rx - 5, 148, 16, 7);
  }

  // Crisp serial placard & subtle graffiti tag splash on top-right door
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(156, 32, 68, 22);
  ctx.fillStyle = '#141c28';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(c.word.slice(0, 6), 162, 47);

  // Bottom shadow AO
  const botAo = ctx.createLinearGradient(0, s - 48, 0, s);
  botAo.addColorStop(0, 'rgba(0,0,0,0)');
  botAo.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = botAo;
  ctx.fillRect(0, s - 48, s, 48);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedDoorTextures.set(theme, tex);
  return tex;
}

/**
 * Generates shaded corrugated container roof texture matching each container's vibrant color.
 */
function getContainerRoofTexture(theme: ContainerTheme): THREE.CanvasTexture {
  const existing = cachedRoofTextures.get(theme);
  if (existing) return existing;

  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const c = CONTAINER_THEME_CFG[theme];

  ctx.fillStyle = c.mid;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < s; i += 20) {
    const g = ctx.createLinearGradient(0, i, 0, i + 20);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.85, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(10, i, s - 20, 20);
  }
  ctx.strokeStyle = 'rgba(10,16,28,0.45)';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, s - 14, s - 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedRoofTextures.set(theme, tex);
  return tex;
}

/**
 * Dedicated builder for the 3x-expanded, 2-floor Team Death Match arenas (Vikendi TDM & Warehouse TDM).
 * - Silky-smooth analytical RampCollider staircases (zero bumps/snags walking UP or DOWN at full speed!)
 * - Ground / Basement floor (y = 0) + Upper 2nd floor (y = 4.2m) with stairs on BOTH sides of BOTH spawns
 * - Vikendi TDM: 20+ vibrant shaded corrugated containers with unique street-art graffitis,
 *   colorful architectural pillars, sunlit golden-hour sky, delicate 6-pointed snowflakes,
 *   12 distinct alpine lodges, 22 randomized multi-biome mountains & 60+ multi-species winter trees
 * - Warehouse TDM: bright, high-visibility neon-blue & neon-purple industrial mega-warehouse with
 *   burning fire barrels/braziers, 5 vertical lanes, breached bulkhead corridors, & 4 upper catwalk paths
 * Leaves original Solo/AI maps in LevelBuilder.ts 100% untouched!
 */
export class TdmLevelBuilder {
  private group = new THREE.Group();
  private colliders: AABB[] = [];
  private ramps: RampCollider[] = [];
  private raycastMeshes: THREE.Object3D[] = [];
  private minimapRects: MinimapRect[] = [];
  private flameMeshes: BurningFlame[] = [];
  private fireLights: FlickerFireLight[] = [];
  private tex: TextureLibrary;

  private containerSideMats = new Map<ContainerTheme, THREE.MeshStandardMaterial>();
  private containerDoorMats = new Map<ContainerTheme, THREE.MeshStandardMaterial>();
  private containerRoofMats = new Map<ContainerTheme, THREE.MeshStandardMaterial>();
  private trimMat = new THREE.MeshStandardMaterial({ color: 0x4b627d, roughness: 0.42, metalness: 0.52 });

  constructor(textures: TextureLibrary) {
    this.tex = textures;
  }

  public build(scene: THREE.Scene, mapId: MapId): BuiltLevel {
    if (mapId === 'factory') {
      return this.buildVikendiTdm(scene);
    }
    return this.buildWarehouseTdm(scene);
  }

  private getContainerMaterials(theme: ContainerTheme, wideAlongX: boolean): THREE.MeshStandardMaterial[] {
    let sideMat = this.containerSideMats.get(theme);
    if (!sideMat) {
      sideMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getGraffitiContainerTexture(theme),
        bumpMap: this.tex.cryzenContainerBump,
        bumpScale: 0.065,
        roughness: 0.42,
        metalness: 0.24,
        envMapIntensity: 1.22,
      });
      this.containerSideMats.set(theme, sideMat);
    }

    let doorMat = this.containerDoorMats.get(theme);
    if (!doorMat) {
      doorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getContainerEndDoorTexture(theme),
        roughness: 0.44,
        metalness: 0.28,
        envMapIntensity: 1.18,
      });
      this.containerDoorMats.set(theme, doorMat);
    }

    let roofMat = this.containerRoofMats.get(theme);
    if (!roofMat) {
      roofMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getContainerRoofTexture(theme),
        roughness: 0.48,
        metalness: 0.24,
        envMapIntensity: 1.1,
      });
      this.containerRoofMats.set(theme, roofMat);
    }

    // BoxGeometry material slots: [+X, -X, +Y, -Y, +Z, -Z]
    return wideAlongX
      ? [doorMat, doorMat, roofMat, roofMat, sideMat, sideMat]
      : [sideMat, sideMat, roofMat, roofMat, doorMat, doorMat];
  }

  /**
   * Builds a rich, colorful, architectural 2nd-floor support pillar (ZERO dull black blocks!):
   * painted cream/slate concrete shaft + vibrant color accent band + hazard base plinth + glowing collar!
   */
  private addArchitecturalPillar(
    x: number,
    z: number,
    h: number,
    accentHex: number,
    matShaft: THREE.Material,
    matHazard: THREE.Material
  ): void {
    // Main solid structural collider & bright concrete shaft
    this.addSolidBox(x, h * 0.5, z, 0.92, h, 0.92, matShaft, { minimapKind: 'pillar' });

    // Yellow-black hazard bumper plinth at floor base
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.44, 1.08), matHazard);
    plinth.position.set(x, 0.22, z);
    this.group.add(plinth);

    // Vibrant painted architectural mid-band & metallic vertical corner accent ribs
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      roughness: 0.36,
      metalness: 0.26,
      emissive: new THREE.Color(accentHex),
      emissiveIntensity: 0.22,
    });
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.76, 1.02), accentMat);
    band.position.set(x, h * 0.54, z);
    this.group.add(band);

    for (const sx of [-0.46, 0.46]) {
      for (const sz of [-0.46, 0.46]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.11, h - 0.6, 0.11), accentMat);
        rib.position.set(x + sx, h * 0.5 + 0.1, z + sz);
        this.group.add(rib);
      }
    }

    // Capital collar + crisp glowing LED trim ring right under the 2nd-floor deck
    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.24, 1.12), this.trimMat);
    capital.position.set(x, h - 0.12, z);
    this.group.add(capital);

    const glowRing = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.09, 1.06),
      new THREE.MeshBasicMaterial({ color: accentHex })
    );
    glowRing.position.set(x, h - 0.28, z);
    this.group.add(glowRing);
  }

  private addSolidBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material | THREE.Material[],
    opts?: {
      minimapKind?: 'wall' | 'pillar' | 'crate' | 'arch';
      castShadow?: boolean;
      receiveShadow?: boolean;
      rotY?: number;
      noCollider?: boolean;
    }
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts?.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow = opts?.castShadow ?? true;
    mesh.receiveShadow = opts?.receiveShadow ?? true;
    this.group.add(mesh);
    this.raycastMeshes.push(mesh);

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
      this.minimapRects.push({
        x: x - w * 0.5,
        z: z - d * 0.5,
        w,
        d,
        kind: opts.minimapKind,
      });
    }
    return mesh;
  }

  private addFloorSlab(
    x: number,
    z: number,
    w: number,
    d: number,
    topY: number,
    mat: THREE.Material,
    minimapKind?: 'wall' | 'pillar' | 'crate' | 'arch'
  ): void {
    this.addSolidBox(x, topY - SLAB_THICK * 0.5, z, w, SLAB_THICK, d, mat, {
      minimapKind,
      castShadow: true,
      receiveShadow: true,
    });
  }

  /**
   * Builds a crisp 16-step visual staircase + 0.62m flush flat top landing backed by ONE silky-smooth
   * analytical RampCollider! The flat top landing ensures the player reaches full FLOOR2_Y BEFORE
   * touching the 2nd-floor slab collider, eliminating ANY top-of-stairs pop, bounce, or snag!
   */
  private addStaircase(
    centerX: number,
    startZ: number,
    endZ: number,
    width: number,
    matStep: THREE.Material,
    matRail: THREE.Material,
    matGlow: THREE.Material
  ): void {
    const dir = Math.sign(endZ - startZ); // -1 for South->North, +1 for North->South
    const landingLen = 0.62;
    const slopeEndZ = endZ - dir * landingLen;
    const steps = 16;
    const stepRise = FLOOR2_Y / steps;
    const slopeRun = slopeEndZ - startZ;
    const stepRun = slopeRun / steps;
    const absRun = Math.abs(stepRun);

    // 1. Register ONE continuous analytical RampCollider ending at slopeEndZ (flat top landing bridges to endZ!)
    const rampMinZ = Math.min(startZ, slopeEndZ);
    const rampMaxZ = Math.max(startZ, slopeEndZ);
    this.ramps.push({
      minX: centerX - width * 0.5,
      maxX: centerX + width * 0.5,
      minZ: rampMinZ,
      maxZ: rampMaxZ,
      yAtMinZ: startZ < slopeEndZ ? 0 : FLOOR2_Y,
      yAtMaxZ: startZ < slopeEndZ ? FLOOR2_Y : 0,
    });

    // 2. Render crisp 3D stepped treads (in raycastMeshes for bullet blocking, noCollider so zero step-snag!)
    for (let i = 0; i < steps; i++) {
      const topY = (i + 1) * stepRise;
      const cz = startZ + (i + 0.5) * stepRun;
      this.addSolidBox(centerX, topY - stepRise * 0.5, cz, width, stepRise, absRun + 0.04, matStep, {
        castShadow: true,
        receiveShadow: true,
        noCollider: true,
      });
      if (i % 3 === 0 || i === steps - 1) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(width - 0.16, 0.036, 0.065), matGlow);
        strip.position.set(centerX, topY + 0.012, cz - dir * (absRun * 0.44));
        this.group.add(strip);
      }
    }

    // Flush flat top landing joining slopeEndZ cleanly into the 2nd floor slab at endZ!
    const landingCenterZ = (slopeEndZ + endZ) * 0.5;
    this.addSolidBox(centerX, FLOOR2_Y - SLAB_THICK * 0.5, landingCenterZ, width, SLAB_THICK, landingLen + 0.08, matStep, {
      castShadow: true,
      receiveShadow: true,
      noCollider: true,
    });

    // Sloped visual stringers, glowing neon handrails & protective side rail colliders
    const midZ = (startZ + slopeEndZ) * 0.5;
    const slopeLen = Math.hypot(Math.abs(slopeRun), FLOOR2_Y);
    const slopeAngle = Math.atan2(FLOOR2_Y, Math.abs(slopeRun)) * (slopeRun < 0 ? 1 : -1);
    const fullMinZ = Math.min(startZ, endZ);
    const fullMaxZ = Math.max(startZ, endZ);
    for (const side of [-1, 1]) {
      const rx = centerX + side * (width * 0.5 + 0.08);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, slopeLen), matRail);
      rail.position.set(rx, FLOOR2_Y * 0.5 + 0.96, midZ);
      rail.rotation.x = slopeAngle;
      rail.castShadow = true;
      this.group.add(rail);

      const railGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, slopeLen), matGlow);
      railGlow.position.set(rx, FLOOR2_Y * 0.5 + 1.05, midZ);
      railGlow.rotation.x = slopeAngle;
      this.group.add(railGlow);

      const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, slopeLen), matRail);
      stringer.position.set(rx, FLOOR2_Y * 0.5 - 0.12, midZ);
      stringer.rotation.x = slopeAngle;
      this.group.add(stringer);

      // Top landing short horizontal rail connecting into the 2nd floor edge
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, landingLen), matRail);
      topRail.position.set(rx, FLOOR2_Y + 0.96, landingCenterZ);
      this.group.add(topRail);

      for (let p = 0; p <= 3; p++) {
        const f = p / 3;
        const pz = startZ + f * slopeRun;
        const py = f * FLOOR2_Y;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), matRail);
        post.position.set(rx, py + 0.52, pz);
        this.group.add(post);
      }

      // Thin side rail guard collider (inset slightly at entry/exit so angled entry never snags!)
      this.colliders.push({
        minX: rx - 0.09,
        maxX: rx + 0.09,
        minY: 0.45,
        maxY: FLOOR2_Y + 1.05,
        minZ: fullMinZ + 0.16,
        maxZ: fullMaxZ - 0.16,
      });
    }

    this.minimapRects.push({
      x: centerX - width * 0.5,
      z: fullMinZ,
      w: width,
      d: fullMaxZ - fullMinZ,
      kind: 'arch',
    });
  }

  private addShippingContainer(
    x: number,
    baseY: number,
    z: number,
    w: number,
    h: number,
    d: number,
    theme: ContainerTheme,
    snowCapped: boolean,
    matSnowCap?: THREE.Material
  ): void {
    const mats = this.getContainerMaterials(theme, w >= d);

    this.addSolidBox(x, baseY + h * 0.5, z, w, h, d, mats, {
      minimapKind: baseY > 1 ? undefined : 'crate',
    });

    // Architectural top & base steel structural bands + vertical corner castings for real-world finesse!
    const topBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.13, d + 0.08), this.trimMat);
    topBand.position.set(x, baseY + h - 0.06, z);
    this.group.add(topBand);

    const botBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), this.trimMat);
    botBand.position.set(x, baseY + 0.06, z);
    this.group.add(botBand);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cornerPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, h + 0.02, 0.14), this.trimMat);
        cornerPost.position.set(x + sx * (w * 0.5 - 0.02), baseY + h * 0.5, z + sz * (d * 0.5 - 0.02));
        this.group.add(cornerPost);
      }
    }

    if (snowCapped && matSnowCap) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.14, d + 0.04), matSnowCap);
      cap.position.set(x, baseY + h + 0.07, z);
      cap.receiveShadow = true;
      this.group.add(cap);
    }
  }

  private addCrateCluster(
    x: number,
    baseY: number,
    z: number,
    matCrate: THREE.Material,
    snowMat?: THREE.Material
  ): void {
    this.addSolidBox(x, baseY + 0.65, z, 1.4, 1.3, 1.4, matCrate, {
      minimapKind: baseY > 1 ? undefined : 'crate',
    });
    this.addSolidBox(x + 1.35, baseY + 0.48, z + 0.3, 1.15, 0.96, 1.15, matCrate);
    if (snowMat) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.09, 1.42), snowMat);
      cap.position.set(x, baseY + 1.34, z);
      this.group.add(cap);
    }
  }

  /**
   * Adds an animated blazing industrial fire barrel / brazier lamp with warm dancing firelight!
   */
  private addFireBarrel(x: number, baseY: number, z: number, addLight = true): void {
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x262e3a,
      roughness: 0.62,
      metalness: 0.65,
    });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 1.05, 10), barrelMat);
    barrel.position.set(x, baseY + 0.525, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    this.group.add(barrel);
    this.raycastMeshes.push(barrel);
    this.colliders.push({
      minX: x - 0.44,
      maxX: x + 0.44,
      minY: baseY,
      maxY: baseY + 1.08,
      minZ: z - 0.44,
      maxZ: z + 0.44,
    });

    // Glowing coal bed
    const coalMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), coalMat);
    coals.position.set(x, baseY + 1.04, z);
    this.group.add(coals);

    // 3 layered dancing flame cones
    const flameColors = [0xff4c12, 0xff9d24, 0xfff096];
    const flameScales = [1.0, 0.72, 0.46];
    for (let i = 0; i < 3; i++) {
      const fMat = new THREE.MeshBasicMaterial({
        color: flameColors[i],
        transparent: true,
        opacity: i === 0 ? 0.85 : 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const fMesh = new THREE.Mesh(new THREE.ConeGeometry(0.28 * flameScales[i], 0.88 * flameScales[i], 6), fMat);
      const fy = baseY + 1.08 + 0.36 * flameScales[i];
      fMesh.position.set(x + (i - 1) * 0.05, fy, z + (i === 1 ? 0.04 : -0.03));
      this.group.add(fMesh);
      this.flameMeshes.push({
        mesh: fMesh,
        baseY: fy,
        phase: Math.random() * Math.PI * 2,
        baseScale: flameScales[i],
      });
    }

    if (addLight) {
      const fireLight = new THREE.PointLight(0xff7e26, 26, 20, 1.35);
      fireLight.position.set(x, baseY + 1.85, z);
      this.group.add(fireLight);
      this.fireLights.push({
        light: fireLight,
        baseIntensity: 26,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // =========================================================================
  // MAP 1: VIKENDI TDM (3x EXPANDED, 2 FLOORS, VIBRANT GOLDEN-HOUR VIKENDI!)
  // =========================================================================
  private buildVikendiTdm(scene: THREE.Scene): BuiltLevel {
    // 1. Vibrant Original Vikendi Golden-Hour Azure Sky Dome with Radiant Sun Halo & Golden Clouds!
    const skyGeo = new THREE.SphereGeometry(220, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#1348a8') },
        midColor: { value: new THREE.Color('#3496f2') },
        horizonColor: { value: new THREE.Color('#ffbe78') },
        sunDir: { value: new THREE.Vector3(0.45, 0.52, 0.48).normalize() },
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
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        varying vec3 vWorldPos;
        void main() {
          vec3 d = normalize(vWorldPos);
          float h = d.y;
          vec3 col = mix(horizonColor, midColor, smoothstep(-0.02, 0.24, h));
          col = mix(col, topColor, smoothstep(0.22, 0.78, h));
          float sunDot = max(dot(d, sunDir), 0.0);
          col += vec3(1.4, 0.96, 0.52) * pow(sunDot, 36.0) * 0.9;
          col += vec3(1.0, 0.72, 0.42) * pow(sunDot, 5.0) * 0.24;
          // Warm backlit golden clouds across mid-sky (signature Vikendi horizon!)
          float cloudBand = smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.32, 0.56, h));
          float w = sin(d.x * 7.5 + d.z * 4.2) * cos(d.z * 6.0 - d.x * 3.1);
          col = mix(col, vec3(1.0, 0.91, 0.8), cloudBand * smoothstep(0.26, 0.72, w * 0.5 + 0.5) * 0.58);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.group.add(new THREE.Mesh(skyGeo, skyMat));
    scene.fog = new THREE.FogExp2(0x8bb9e6, 0.0032);

    // Crisp alpine winter sunlight + glacial-blue bounce + vivid cyan/crimson/amber rim accents!
    this.group.add(new THREE.HemisphereLight(0xb2e2ff, 0x86b4dc, 1.16));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.38);
    sun.position.set(24, 34, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 110;
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 36;
    sun.shadow.camera.bottom = -36;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    this.group.add(sun);

    const skyFill = new THREE.DirectionalLight(0x4ecbff, 0.92);
    skyFill.position.set(-22, 14, -20);
    this.group.add(skyFill);

    // Original Vikendi's signature vibrant industrial color-accent point lights (plus bright under-deck bounce!)
    const northCyanGlow = new THREE.PointLight(0x1ceeff, 44, 34, 1.25);
    northCyanGlow.position.set(0, 3.6, -15.5);
    this.group.add(northCyanGlow);

    const southCyanGlow = new THREE.PointLight(0x36dcff, 42, 34, 1.25);
    southCyanGlow.position.set(0, 3.6, 15.5);
    this.group.add(southCyanGlow);

    const westCrimsonGlow = new THREE.PointLight(0xff3468, 36, 30, 1.3);
    westCrimsonGlow.position.set(-16.5, 3.4, 0);
    this.group.add(westCrimsonGlow);

    const eastAmberGlow = new THREE.PointLight(0xff962e, 38, 30, 1.3);
    eastAmberGlow.position.set(16.5, 3.4, 0);
    this.group.add(eastAmberGlow);

    const centerWarmFill = new THREE.PointLight(0xffe6b8, 34, 28, 1.25);
    centerWarmFill.position.set(0, 3.3, 0);
    this.group.add(centerWarmFill);

    // 2. Crisp Vibrant Vikendi PBR Materials (NO dark black pillars or dull steel!)
    const matSnow = new THREE.MeshStandardMaterial({
      color: 0xf7fbff,
      map: this.tex.vikendiSnowPBR.map,
      roughnessMap: this.tex.vikendiSnowPBR.roughnessMap,
      bumpMap: this.tex.vikendiSnowPBR.bumpMap,
      bumpScale: 0.056,
      roughness: 0.84,
      metalness: 0.04,
      envMapIntensity: 0.9,
    });
    const matOuterSnow = new THREE.MeshStandardMaterial({ color: 0xecf5fd, roughness: 0.88, metalness: 0.02 });
    const matSnowCap = new THREE.MeshStandardMaterial({
      color: 0xf9fdff,
      bumpMap: this.tex.vikendiSnowPBR.bumpMap,
      bumpScale: 0.024,
      roughness: 0.82,
      metalness: 0.02,
    });
    const matBrick = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.tex.cryzenBrickPBR.map,
      roughnessMap: this.tex.cryzenBrickPBR.roughnessMap,
      bumpMap: this.tex.cryzenBrickPBR.bumpMap,
      bumpScale: 0.058,
      roughness: 0.76,
      metalness: 0.06,
      envMapIntensity: 0.96,
    });
    const matDeck = new THREE.MeshStandardMaterial({
      color: 0xdbe8f5,
      map: this.tex.cryzenConcrete,
      roughness: 0.62,
      metalness: 0.14,
      envMapIntensity: 1.25,
    });
    const matPillarShaft = new THREE.MeshStandardMaterial({
      color: 0xe8f1fa,
      map: this.tex.cryzenConcrete,
      roughness: 0.56,
      metalness: 0.1,
      envMapIntensity: 1.15,
    });
    const matStair = new THREE.MeshStandardMaterial({
      color: 0x8ea8c4,
      map: this.tex.metalGrate.map,
      roughness: 0.48,
      metalness: 0.38,
    });
    const matSteel = new THREE.MeshStandardMaterial({
      color: 0x6f8ba8,
      roughness: 0.42,
      metalness: 0.36,
    });
    const matCrate = new THREE.MeshStandardMaterial({
      color: 0xf6ead6,
      map: this.tex.cryzenWoodCrate,
      bumpMap: this.tex.cryzenWoodCrateBump,
      bumpScale: 0.04,
      roughness: 0.76,
      metalness: 0.08,
    });
    const matHazard = new THREE.MeshStandardMaterial({ map: this.tex.hazardTrim, roughness: 0.66, metalness: 0.22 });
    const matCyanGlow = new THREE.MeshBasicMaterial({ color: 0x3cf4ff });
    const matAmberGlow = new THREE.MeshBasicMaterial({ color: 0xffb038 });
    const matRedGlow = new THREE.MeshBasicMaterial({ color: 0xff4668 });

    // 3. Expansive Snow Ground + Playable Courtyard Floor (56m x 58m)
    const outerGround = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), matOuterSnow);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.06;
    outerGround.receiveShadow = true;
    this.group.add(outerGround);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 2, HALF_L * 2 + 2), matSnow);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.raycastMeshes.push(floor);

    // 4. Perimeter Fortress Brick Compound Walls (7.2m tall, yellow-black hazard trim & snow caps!)
    const wallH = 7.2;
    this.addSolidBox(0, wallH * 0.5, -HALF_L - 0.5, HALF_W * 2 + 2, wallH, 1.0, matBrick, { minimapKind: 'wall' });
    this.addSolidBox(0, wallH * 0.5, HALF_L + 0.5, HALF_W * 2 + 2, wallH, 1.0, matBrick, { minimapKind: 'wall' });
    this.addSolidBox(-HALF_W - 0.5, wallH * 0.5, 0, 1.0, wallH, HALF_L * 2 + 2, matBrick, { minimapKind: 'wall' });
    this.addSolidBox(HALF_W + 0.5, wallH * 0.5, 0, 1.0, wallH, HALF_L * 2 + 2, matBrick, { minimapKind: 'wall' });

    for (const [wx, wz, ww, wd] of [
      [0, -HALF_L - 0.5, HALF_W * 2 + 2.2, 1.15],
      [0, HALF_L + 0.5, HALF_W * 2 + 2.2, 1.15],
      [-HALF_W - 0.5, 0, 1.15, HALF_L * 2 + 2.2],
      [HALF_W + 0.5, 0, 1.15, HALF_L * 2 + 2.2],
    ]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.22, wd), matSnowCap);
      cap.position.set(wx, wallH + 0.1, wz);
      this.group.add(cap);

      // Original Vikendi signature yellow-black industrial hazard fascia stripe near wall top!
      const hazBand = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.04, 0.36, wd + 0.04), matHazard);
      hazBand.position.set(wx, wallH - 0.55, wz);
      this.group.add(hazBand);
    }

    // Crisp glowing tactical beacon strips on spawn walls & courtyard arches (like original Vikendi!)
    for (const [bx, by, bz, bw, bh, bd, bMat] of [
      [0, 5.2, -HALF_L + 0.06, 9.6, 0.16, 0.14, matRedGlow],
      [0, 5.2, HALF_L - 0.06, 9.6, 0.16, 0.14, matCyanGlow],
      [-HALF_W + 0.06, 5.2, 0, 0.14, 0.16, 12.0, matRedGlow],
      [HALF_W - 0.06, 5.2, 0, 0.14, 0.16, 12.0, matAmberGlow],
    ] as Array<[number, number, number, number, number, number, THREE.Material]>) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMat);
      strip.position.set(bx, by, bz);
      this.group.add(strip);
    }

    // 5. FOUR BUTTER-SMOOTH RAMP STAIRCASES WITH FLUSH TOP LANDINGS — BOTH SIDES FROM BOTH SPAWNS!
    this.addStaircase(-19.5, 24.0, 15.0, 3.6, matStair, matSteel, matCyanGlow);
    this.addStaircase(19.5, 24.0, 15.0, 3.6, matStair, matSteel, matCyanGlow);
    this.addStaircase(-19.5, -24.0, -15.0, 3.6, matStair, matSteel, matRedGlow);
    this.addStaircase(19.5, -24.0, -15.0, 3.6, matStair, matSteel, matRedGlow);

    // 6. UPPER 2ND FLOOR ABOVE BASEMENT (y = 4.2m) — GALLERIES + SKY-BRIDGE!
    this.addFloorSlab(-20.0, 0, 9.0, 30.0, FLOOR2_Y, matDeck, 'arch');
    this.addFloorSlab(20.0, 0, 9.0, 30.0, FLOOR2_Y, matDeck, 'arch');
    this.addFloorSlab(0, 13.5, 31.0, 4.0, FLOOR2_Y, matDeck, 'arch');
    this.addFloorSlab(0, -13.5, 31.0, 4.0, FLOOR2_Y, matDeck, 'arch');
    this.addFloorSlab(0, 0, 31.0, 11.0, FLOOR2_Y, matDeck, 'arch');

    // Crisp glowing under-bridge accent strips so ground floor under 2nd deck is bright & vivid!
    for (const ux of [-20.0, 20.0]) {
      const uBar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 26.0), ux < 0 ? matCyanGlow : matAmberGlow);
      uBar.position.set(ux, FLOOR2_Y - SLAB_THICK - 0.05, 0);
      this.group.add(uBar);
    }
    for (const [uz, uMat] of [
      [13.5, matCyanGlow],
      [0, matAmberGlow],
      [-13.5, matRedGlow],
    ] as Array<[number, THREE.Material]>) {
      const uBar = new THREE.Mesh(new THREE.BoxGeometry(28.0, 0.09, 0.26), uMat);
      uBar.position.set(0, FLOOR2_Y - SLAB_THICK - 0.05, uz);
      this.group.add(uBar);
    }

    // 16 COLORFUL ARCHITECTURAL SUPPORT PILLARS (painted alpine concrete + vibrant color sleeves + hazard bases + LED collars!)
    const pillarAccents = [0x18e0ff, 0xff445e, 0xffbe28, 0x3288ff, 0x28d682, 0xb054ff];
    let pIdx = 0;
    for (const px of [-15.2, -7.8, 7.8, 15.2]) {
      for (const pz of [-13.5, -5.0, 5.0, 13.5]) {
        this.addArchitecturalPillar(
          px,
          pz,
          FLOOR2_Y - SLAB_THICK,
          pillarAccents[pIdx % pillarAccents.length],
          matPillarShaft,
          matHazard
        );
        pIdx++;
      }
    }

    const addUpperParapet = (x: number, z: number, w: number, d: number) => {
      this.addSolidBox(x, FLOOR2_Y + 0.56, z, w, 1.12, d, matBrick);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.1, d + 0.06), matSnowCap);
      cap.position.set(x, FLOOR2_Y + 1.16, z);
      this.group.add(cap);
    };

    for (const sx of [-1, 1]) {
      addUpperParapet(sx * 15.7, 8.8, 0.36, 4.6);
      addUpperParapet(sx * 15.7, -8.8, 0.36, 4.6);
      addUpperParapet(sx * 24.3, 0, 0.36, 26.0);
    }
    for (const sz of [-1, 1]) {
      addUpperParapet(-8.8, sz * 11.7, 7.6, 0.36);
      addUpperParapet(8.8, sz * 11.7, 7.6, 0.36);
      addUpperParapet(0, sz * 15.3, 18.0, 0.36);
      addUpperParapet(-4.2, sz * 5.3, 6.2, 0.36);
      addUpperParapet(4.2, sz * 5.3, 6.2, 0.36);
    }

    // Upper Floor Vibrant Multi-Colored Graffiti Shipping Containers (4 completely distinct graffitis!) + Crates!
    this.addShippingContainer(-20.4, FLOOR2_Y, 0, 2.5, 2.6, 6.2, 'sky', true, matSnowCap);
    this.addShippingContainer(20.4, FLOOR2_Y, 0, 2.5, 2.6, 6.2, 'crimson', true, matSnowCap);
    this.addShippingContainer(-6.2, FLOOR2_Y, 0.8, 2.5, 2.5, 5.4, 'orange', true, matSnowCap);
    this.addShippingContainer(6.2, FLOOR2_Y, -0.8, 2.5, 2.5, 5.4, 'lime', true, matSnowCap);
    this.addCrateCluster(-19.5, FLOOR2_Y, 9.2, matCrate, matSnowCap);
    this.addCrateCluster(18.5, FLOOR2_Y, -9.2, matCrate, matSnowCap);
    this.addCrateCluster(-0.8, FLOOR2_Y, 13.2, matCrate, matSnowCap);
    this.addCrateCluster(-0.8, FLOOR2_Y, -13.2, matCrate, matSnowCap);

    // 7. BASEMENT / GROUND FLOOR — 16 VIBRANT CORRUGATED CONTAINERS WITH UNIQUE GRAFFITIS ON EVERY BOX!
    this.addShippingContainer(0, 0, 19.6, 6.4, 2.8, 2.5, 'blue', true, matSnowCap);
    this.addShippingContainer(0, 0, -19.6, 6.4, 2.8, 2.5, 'red', true, matSnowCap);
    for (const sz of [-1, 1]) {
      this.addSolidBox(-8.5, 1.3, sz * 21.4, 5.2, 2.6, 0.7, matBrick, { minimapKind: 'wall' });
      this.addSolidBox(8.5, 1.3, sz * 21.4, 5.2, 2.6, 0.7, matBrick, { minimapKind: 'wall' });
    }

    // Center Courtyard Staggered Containers (Coral, Purple, Green, Amber — zero repeated graffitis nearby!)
    this.addShippingContainer(-3.8, 0, 2.8, 2.5, 2.8, 6.0, 'coral', false);
    this.addShippingContainer(3.8, 0, -2.8, 2.5, 2.8, 6.0, 'purple', false);
    this.addShippingContainer(0, 0, 9.6, 5.8, 2.7, 2.5, 'green', true, matSnowCap);
    this.addShippingContainer(0, 0, -9.6, 5.8, 2.7, 2.5, 'amber', true, matSnowCap);

    // West-Mid & East-Mid Lanes (Teal, Gold, Orange, Crimson, Lime, Sky — all distinct!)
    this.addShippingContainer(-11.2, 0, 8.4, 2.5, 2.8, 6.2, 'teal', true, matSnowCap);
    this.addShippingContainer(11.2, 0, 8.4, 2.5, 2.8, 6.2, 'gold', true, matSnowCap);
    this.addShippingContainer(-11.2, 0, -8.4, 2.5, 2.8, 6.2, 'orange', true, matSnowCap);
    this.addShippingContainer(11.2, 0, -8.4, 2.5, 2.8, 6.2, 'crimson', true, matSnowCap);
    this.addShippingContainer(-10.8, 0, 0, 4.8, 2.7, 2.5, 'lime', false);
    this.addShippingContainer(10.8, 0, 0, 4.8, 2.7, 2.5, 'sky', false);

    // Far-West & Far-East Flank Yards (Red, Blue, Gold, Purple, Coral, Teal!)
    this.addShippingContainer(-23.2, 0, 7.6, 2.5, 2.8, 6.2, 'red', false);
    this.addShippingContainer(-23.2, 0, -7.6, 2.5, 2.8, 6.2, 'blue', false);
    this.addShippingContainer(-19.8, 0, 0, 2.5, 2.8, 5.8, 'gold', false);

    this.addShippingContainer(23.2, 0, 7.6, 2.5, 2.8, 6.2, 'purple', false);
    this.addShippingContainer(23.2, 0, -7.6, 2.5, 2.8, 6.2, 'coral', false);
    this.addShippingContainer(19.8, 0, 0, 2.5, 2.8, 5.8, 'teal', false);

    for (const [cx, cz] of [
      [-6.2, 14.5],
      [5.2, 14.5],
      [-6.2, -14.5],
      [5.2, -14.5],
      [-24.2, 17.8],
      [23.2, 17.8],
      [-24.2, -17.8],
      [23.2, -17.8],
      [-0.5, 0.2],
    ]) {
      this.addCrateCluster(cx, 0, cz, matCrate, matSnowCap);
    }

    for (const sz of [-1, 1]) {
      this.addSolidBox(-5.8, 0.72, sz * 15.8, 3.6, 1.44, 0.55, matHazard);
      this.addSolidBox(5.8, 0.72, sz * 15.8, 3.6, 1.44, 0.55, matHazard);
    }

    // Warm blazing industrial fire barrels warming the Vikendi snow courtyard corners (signature original Vikendi!)
    this.addFireBarrel(-13.8, 0, 17.8, true);
    this.addFireBarrel(13.8, 0, -17.8, true);
    this.addFireBarrel(13.8, 0, 17.8, false);
    this.addFireBarrel(-13.8, 0, -17.8, false);

    // Volumetric golden sun shafts & cyan alpine beams slanting through the open courtyard
    const sunBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffd078,
      transparent: true,
      opacity: 0.068,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cyanShaftMat = new THREE.MeshBasicMaterial({
      color: 0x36eeff,
      transparent: true,
      opacity: 0.062,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const b of [
      { x: -1.5, y: 6.2, z: 18.2, w: 6.2, h: 13.5, mat: sunBeamMat, rotZ: -0.34 },
      { x: 2.5, y: 6.2, z: -18.2, w: 6.0, h: 13.5, mat: cyanShaftMat, rotZ: 0.26 },
      { x: -10.5, y: 6.0, z: 8.5, w: 5.0, h: 12.0, mat: sunBeamMat, rotZ: -0.32 },
      { x: 10.5, y: 6.0, z: -8.5, w: 5.0, h: 12.0, mat: sunBeamMat, rotZ: -0.32 },
    ]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), b.mat);
      shaft.position.set(b.x, b.y, b.z);
      shaft.rotation.set(0.12, 0.28, b.rotZ);
      this.group.add(shaft);
    }

    this.addVikendiAlpineBackdrop(matSnowCap, matBrick);

    // 8. EXACT Original Vikendi Dual-Layer 6-Pointed Crystal Snowflakes (ZERO squares!)
    const nearCount = 920;
    const nearPositions = new Float32Array(nearCount * 3);
    const nearSpeeds = new Float32Array(nearCount);
    for (let i = 0; i < nearCount; i++) {
      nearPositions[i * 3] = (Math.random() - 0.5) * 62;
      nearPositions[i * 3 + 1] = 0.15 + Math.random() * 16.5;
      nearPositions[i * 3 + 2] = (Math.random() - 0.5) * 64;
      nearSpeeds[i] = 1.15 + Math.random() * 1.15;
    }
    const nearSnowGeo = new THREE.BufferGeometry();
    nearSnowGeo.setAttribute('position', new THREE.BufferAttribute(nearPositions, 3));
    const nearSnowMat = new THREE.PointsMaterial({
      map: this.tex.snowSprite,
      color: 0xffffff,
      size: 0.24,
      transparent: true,
      opacity: 0.96,
      alphaTest: 0.04,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const nearSnowPoints = new THREE.Points(nearSnowGeo, nearSnowMat);
    this.group.add(nearSnowPoints);

    const farCount = 980;
    const farPositions = new Float32Array(farCount * 3);
    const farSpeeds = new Float32Array(farCount);
    for (let i = 0; i < farCount; i++) {
      farPositions[i * 3] = (Math.random() - 0.5) * 84;
      farPositions[i * 3 + 1] = 0.5 + Math.random() * 22.0;
      farPositions[i * 3 + 2] = (Math.random() - 0.5) * 86;
      farSpeeds[i] = 0.85 + Math.random() * 0.95;
    }
    const farSnowGeo = new THREE.BufferGeometry();
    farSnowGeo.setAttribute('position', new THREE.BufferAttribute(farPositions, 3));
    const farSnowMat = new THREE.PointsMaterial({
      map: this.tex.snowSprite,
      color: 0xf4faff,
      size: 0.19,
      transparent: true,
      opacity: 0.84,
      alphaTest: 0.04,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const farSnowPoints = new THREE.Points(farSnowGeo, farSnowMat);
    this.group.add(farSnowPoints);

    scene.add(this.group);

    const updateAtmosphere = (dt: number, elapsed: number) => {
      // Animate courtyard fire barrel flames & flickering warm firelights
      for (const f of this.flameMeshes) {
        const flicker = Math.sin(elapsed * 14 + f.phase) * 0.14 + Math.cos(elapsed * 21 + f.phase * 1.7) * 0.08;
        f.mesh.scale.set(1 + flicker * 0.4, 1 + flicker * 1.1, 1 + flicker * 0.4);
        f.mesh.position.y = f.baseY + flicker * 0.1;
        f.mesh.rotation.y += dt * 2.2;
      }
      for (const fl of this.fireLights) {
        fl.light.intensity =
          fl.baseIntensity +
          Math.sin(elapsed * 13 + fl.phase) * 4.5 +
          Math.cos(elapsed * 23 + fl.phase) * 2.2;
      }

      // Dynamic Vikendi winter breeze gusting softly across both 6-pointed snowflake layers
      const windX = 0.55 + Math.sin(elapsed * 0.42) * 0.45;
      const windZ = 0.24 + Math.cos(elapsed * 0.35) * 0.25;

      const nPos = nearSnowPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < nPos.count; i++) {
        let y = nPos.getY(i) - dt * nearSpeeds[i];
        let x = nPos.getX(i) + (windX + Math.sin(elapsed * 1.55 + i * 0.63) * 0.55) * dt;
        let z = nPos.getZ(i) + (windZ + Math.cos(elapsed * 1.25 + i * 0.47) * 0.42) * dt;
        if (y < 0.05) {
          y = 16.5;
          x = (Math.random() - 0.5) * 62;
          z = (Math.random() - 0.5) * 64;
        } else {
          if (x > 31) x -= 62;
          else if (x < -31) x += 62;
          if (z > 32) z -= 64;
          else if (z < -32) z += 64;
        }
        nPos.setXYZ(i, x, y, z);
      }
      nPos.needsUpdate = true;

      const fPos = farSnowPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fPos.count; i++) {
        let y = fPos.getY(i) - dt * farSpeeds[i];
        let x = fPos.getX(i) + (windX * 1.25 + Math.sin(elapsed * 1.1 + i * 0.51) * 0.45) * dt;
        let z = fPos.getZ(i) + (windZ * 1.15 + Math.cos(elapsed * 0.95 + i * 0.39) * 0.35) * dt;
        if (y < 0.2) {
          y = 22.0;
          x = (Math.random() - 0.5) * 84;
          z = (Math.random() - 0.5) * 86;
        } else {
          if (x > 42) x -= 84;
          else if (x < -42) x += 84;
          if (z > 43) z -= 86;
          else if (z < -43) z += 86;
        }
        fPos.setXYZ(i, x, y, z);
      }
      fPos.needsUpdate = true;
    };

    const zones: ZoneDef[] = [
      { name: 'BLUE SPAWN (SOUTH)', minX: -28, maxX: 28, minZ: 19, maxZ: 29 },
      { name: 'RED SPAWN (NORTH)', minX: -28, maxX: 28, minZ: -29, maxZ: -19 },
      { name: 'WEST CONTAINER YARD', minX: -28, maxX: -15, minZ: -19, maxZ: 19 },
      { name: 'EAST DEPOT YARD', minX: 15, maxX: 28, minZ: -19, maxZ: 19 },
      { name: 'MID CONTAINERS / SKY-BRIDGE', minX: -15, maxX: 15, minZ: -19, maxZ: 19 },
    ];

    return {
      group: this.group,
      colliders: this.colliders,
      ramps: this.ramps,
      raycastMeshes: this.raycastMeshes,
      minimapRects: this.minimapRects,
      waypoints: [],
      zones,
      playerSpawn: { pos: new THREE.Vector3(0, 0, 25.5), yaw: 0 },
      allySpawn: { pos: new THREE.Vector3(-4.6, 0, 25.2), yaw: 0 },
      allySpawns: [
        { pos: new THREE.Vector3(-4.6, 0, 25.2), yaw: 0, role: 'ember', name: 'BLUE-2' },
        { pos: new THREE.Vector3(4.6, 0, 25.2), yaw: 0, role: 'ember', name: 'BLUE-3' },
        { pos: new THREE.Vector3(-9.6, 0, 25.4), yaw: 0, role: 'ember', name: 'BLUE-4' },
        { pos: new THREE.Vector3(9.6, 0, 25.4), yaw: 0, role: 'ember', name: 'BLUE-5' },
      ],
      enemySpawns: [
        { pos: new THREE.Vector3(0, 0, -25.5), yaw: Math.PI, role: 'duelist', name: 'RED-1' },
        { pos: new THREE.Vector3(-4.6, 0, -25.2), yaw: Math.PI, role: 'striker', name: 'RED-2' },
        { pos: new THREE.Vector3(4.6, 0, -25.2), yaw: Math.PI, role: 'sentinel', name: 'RED-3' },
        { pos: new THREE.Vector3(-9.6, 0, -25.4), yaw: Math.PI, role: 'duelist', name: 'RED-4' },
        { pos: new THREE.Vector3(9.6, 0, -25.4), yaw: Math.PI, role: 'striker', name: 'RED-5' },
      ],
      dustParticles: nearSnowPoints,
      mapBounds: { minX: -HALF_W, maxX: HALF_W, minZ: -HALF_L, maxZ: HALF_L },
      updateAtmosphere,
    };
  }

  /**
   * Rich, colorful, randomized BGMI Vikendi alpine horizon backdrop around the entire 3x TDM perimeter:
   * - 12 distinct European alpine lodges/houses (varied stucco/wood/stone colors, roof tiles, dormers, balconies, glowing windows & chimneys!)
   * - Iconic North Silo Depot landmark with crimson aviation beacon
   * - 22 randomized multi-biome textured alpine mountains (pine foothills, timber ridges, granite crags, glacial & blue-ice summits!)
   * - 62+ randomized multi-species winter trees (Spruce, Fir, Pine, Frost Cedar, Golden Larch & White-Bark Silver Birch) + boulders
   */
  private addVikendiAlpineBackdrop(matSnowCap: THREE.Material, matBrick: THREE.Material): void {
    // Seeded deterministic PRNG with lively variation so every house, tree, and mountain is unique!
    let s = 42819;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const randRange = (a: number, b: number) => a + rand() * (b - a);

    // 1. Vibrant Alpine Village House Materials (every chalet gets its own distinct color & roof texture!)
    const wallMats = [
      new THREE.MeshStandardMaterial({ color: 0xe68462, map: this.tex.cryzenConcrete, roughness: 0.78 }), // Warm Terracotta Coral
      new THREE.MeshStandardMaterial({ color: 0x7cb89c, map: this.tex.cryzenConcrete, roughness: 0.78 }), // Alpine Mint Sage
      new THREE.MeshStandardMaterial({ color: 0xf0ddb4, map: this.tex.cryzenConcrete, roughness: 0.76 }), // Butter-Cream Bavarian
      new THREE.MeshStandardMaterial({ color: 0x86a8cc, map: this.tex.cryzenConcrete, roughness: 0.78 }), // Nordic Powder Blue
      new THREE.MeshStandardMaterial({ color: 0xe2a866, map: this.tex.cryzenWoodCrate, roughness: 0.82 }), // Warm Honey Cedar Log
      new THREE.MeshStandardMaterial({ color: 0xd89aa8, map: this.tex.cryzenConcrete, roughness: 0.78 }), // Dusty Alpine Rose
      new THREE.MeshStandardMaterial({ color: 0xe4c25e, map: this.tex.cryzenConcrete, roughness: 0.78 }), // Ochre Mustard Inn
      new THREE.MeshStandardMaterial({ color: 0x9fa0c8, map: this.tex.grimyConcrete.map, roughness: 0.82 }), // Lavender-Stone Chalet
    ];
    const baseMats = [
      matBrick,
      new THREE.MeshStandardMaterial({ color: 0x707b8a, map: this.tex.grimyConcrete.map, roughness: 0.88 }), // Alpine Stone Base
      new THREE.MeshStandardMaterial({ color: 0x8c5a3c, map: this.tex.cryzenWoodCrate, roughness: 0.84 }), // Rustic Timber Base
    ];
    const roofMats = [
      new THREE.MeshStandardMaterial({ color: 0x2f3b4d, roughness: 0.68, metalness: 0.2 }), // Dark Slate
      new THREE.MeshStandardMaterial({ color: 0x8c2e32, roughness: 0.72, metalness: 0.1 }), // Burgundy Clay Tile
      new THREE.MeshStandardMaterial({ color: 0x244c7a, roughness: 0.66, metalness: 0.2 }), // Deep Cobalt Tile
      new THREE.MeshStandardMaterial({ color: 0x265c42, roughness: 0.68, metalness: 0.16 }), // Forest Emerald Metal
      new THREE.MeshStandardMaterial({ color: 0xa64e2c, roughness: 0.72, metalness: 0.1 }), // Rust Terracotta
      new THREE.MeshStandardMaterial({ color: 0x2c6e78, roughness: 0.64, metalness: 0.25 }), // Patina Copper Teal
    ];
    const shutterMats = [
      new THREE.MeshStandardMaterial({ color: 0x215844, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: 0x7c2a2e, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: 0x284d78, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: 0x6e4726, roughness: 0.76 }),
    ];
    const matTimber = new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.82 });
    const matCream = new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.72 });
    const matWarmWin = new THREE.MeshStandardMaterial({
      color: 0xffdf9e,
      emissive: 0xffa638,
      emissiveIntensity: 1.5,
      roughness: 0.22,
    });
    const matCoolWin = new THREE.MeshStandardMaterial({
      color: 0xc2ecff,
      emissive: 0x4cc4ff,
      emissiveIntensity: 1.05,
      roughness: 0.2,
    });

    const buildAlpineChalet = (
      cx: number,
      cz: number,
      rotY: number,
      w: number,
      d: number,
      baseH: number,
      upperH: number,
      idx: number
    ) => {
      const chalet = new THREE.Group();
      chalet.position.set(cx, 0, cz);
      chalet.rotation.y = rotY;

      const baseMat = baseMats[idx % baseMats.length];
      const upperMat = wallMats[idx % wallMats.length];
      const roofMat = roofMats[(idx * 5 + 1) % roofMats.length];
      const shutMat = shutterMats[(idx * 3) % shutterMats.length];
      const winMat = idx % 4 === 0 ? matCoolWin : matWarmWin;
      const eaveY = baseH + upperH;

      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), baseMat);
      lower.position.y = baseH * 0.5;
      chalet.add(lower);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(w, upperH, d), upperMat);
      upper.position.y = baseH + upperH * 0.5;
      chalet.add(upper);

      // Timber story belt & corner quoins
      const belt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, 0.26, d + 0.22), matTimber);
      belt.position.y = baseH;
      chalet.add(belt);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, eaveY, 0.26), matTimber);
          post.position.set(sx * (w * 0.5 - 0.05), eaveY * 0.5, sz * (d * 0.5 - 0.05));
          chalet.add(post);
        }
      }

      // Glowing alpine windows with cream frames & colorful shutters on the front face (+Z)
      const frontZ = d * 0.5;
      const winCount = w > 12 ? 3 : 2;
      for (let wi = 0; wi < winCount; wi++) {
        const wx = winCount === 3 ? (wi - 1) * (w * 0.3) : (wi === 0 ? -w * 0.24 : w * 0.24);
        const wy = baseH + upperH * 0.52;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.9, 0.14), matCream);
        frame.position.set(wx, wy, frontZ + 0.04);
        chalet.add(frame);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.62, 0.16), winMat);
        glass.position.set(wx, wy, frontZ + 0.06);
        chalet.add(glass);
        for (const ss of [-1, 1]) {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.82, 0.09), shutMat);
          sh.position.set(wx + ss * 0.96, wy, frontZ + 0.06);
          chalet.add(sh);
        }
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, 0.34), matSnowCap);
        sill.position.set(wx, wy - 0.98, frontZ + 0.14);
        chalet.add(sill);
      }

      // Optional warm cedar balcony deck
      if (idx % 2 === 0) {
        const balW = w * 0.72;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(balW, 0.2, 1.25), matTimber);
        deck.position.set(0, baseH - 0.08, frontZ + 0.62);
        chalet.add(deck);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(balW, 0.14, 0.12), matTimber);
        rail.position.set(0, baseH + 0.85, frontZ + 1.18);
        chalet.add(rail);
        const railSnow = new THREE.Mesh(new THREE.BoxGeometry(balW - 0.1, 0.08, 0.16), matSnowCap);
        railSnow.position.set(0, baseH + 0.95, frontZ + 1.18);
        chalet.add(railSnow);
      }

      // Steep pitched snow-laden alpine roof + matching gable ends
      const ridgeH = randRange(2.4, 3.6);
      const halfD = d * 0.5 + 0.65;
      const pitch = Math.atan2(ridgeH, halfD);
      const slopeLen = Math.hypot(halfD, ridgeH) + 0.16;
      const roofW = w + 1.2;

      const gableShape = new THREE.Shape();
      gableShape.moveTo(-d * 0.5, 0);
      gableShape.lineTo(d * 0.5, 0);
      gableShape.lineTo(0, ridgeH * ((d * 0.5) / halfD));
      gableShape.closePath();
      const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: w, bevelEnabled: false });
      gableGeo.rotateY(Math.PI / 2);
      gableGeo.translate(-w * 0.5, eaveY, 0);
      chalet.add(new THREE.Mesh(gableGeo, upperMat));

      for (const sz of [-1, 1]) {
        const cy = eaveY + ridgeH * 0.5;
        const czOff = sz * (halfD * 0.5);
        const slope = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.26, slopeLen), roofMat);
        slope.position.set(0, cy, czOff);
        slope.rotation.x = sz * pitch;
        chalet.add(slope);

        const snow = new THREE.Mesh(new THREE.BoxGeometry(roofW - 0.12, 0.2, slopeLen - 0.08), matSnowCap);
        snow.position.set(0, cy + Math.cos(pitch) * 0.22, czOff + sz * Math.sin(pitch) * 0.22);
        snow.rotation.x = sz * pitch;
        chalet.add(snow);
      }

      const ridgeSnow = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.22, 0.34), matSnowCap);
      ridgeSnow.position.set(0, eaveY + ridgeH + 0.24, 0);
      chalet.add(ridgeSnow);

      // Stone/Brick chimney poking cleanly through the snowy roof
      const chimX = (idx % 2 === 0 ? 1 : -1) * (w * 0.28);
      const chim = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.8, 1.15), matBrick);
      chim.position.set(chimX, eaveY + ridgeH * 0.72, -d * 0.18);
      chalet.add(chim);
      const chimCap = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.18, 1.32), matSnowCap);
      chimCap.position.set(chimX, eaveY + ridgeH * 0.72 + 1.46, -d * 0.18);
      chalet.add(chimCap);

      this.group.add(chalet);
    };

    // Place 12 distinct colorful Vikendi alpine lodges/houses surrounding ALL 4 sides outside the 3x walls!
    const houses: Array<[number, number, number, number, number, number, number]> = [
      // North alpine village skyline (facing South toward arena)
      [-23, -39.5, 0.05, 13.5, 8.8, 4.4, 4.8],
      [-7.5, -42.5, -0.06, 11.2, 8.0, 4.0, 4.2],
      [14.5, -39.5, -0.08, 14.0, 9.0, 4.6, 5.2],
      [30.5, -37.0, -0.32, 11.5, 8.2, 4.2, 4.5],
      // West alpine village (facing East toward arena)
      [-39.5, -16.5, Math.PI * 0.5 + 0.06, 13.0, 8.5, 4.5, 4.8],
      [-41.0, 4.5, Math.PI * 0.5 - 0.05, 11.5, 7.8, 4.0, 5.0],
      [-38.5, 22.0, Math.PI * 0.5 - 0.14, 12.6, 8.4, 4.2, 4.4],
      // East alpine village (facing West toward arena)
      [39.5, -15.5, -Math.PI * 0.5 - 0.05, 13.2, 8.6, 4.4, 5.0],
      [41.0, 6.0, -Math.PI * 0.5 + 0.08, 11.8, 8.0, 4.1, 4.3],
      [38.5, 23.0, -Math.PI * 0.5 + 0.16, 12.4, 8.2, 4.5, 4.7],
      // South alpine village (facing North toward arena)
      [-18.0, 40.5, Math.PI - 0.06, 13.4, 8.6, 4.4, 4.8],
      [17.5, 40.0, Math.PI + 0.08, 12.8, 8.4, 4.2, 5.0],
    ];
    houses.forEach(([hx, hz, rot, w, d, bh, uh], idx) => {
      buildAlpineChalet(hx, hz, rot, w, d, bh, uh, idx);
    });

    // Iconic North Industrial Silo Landmark behind Red Spawn with glowing crimson aviation beacon!
    const siloGroup = new THREE.Group();
    siloGroup.position.set(2.5, 0, -40.5);
    const matSilo = new THREE.MeshStandardMaterial({
      color: 0xd0dcea,
      map: this.tex.industrialSteel.map,
      roughness: 0.48,
      metalness: 0.56,
    });
    const siloBody = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 16.5, 24), matSilo);
    siloBody.position.y = 8.25;
    siloGroup.add(siloBody);
    const siloBand = new THREE.Mesh(
      new THREE.CylinderGeometry(4.52, 4.52, 0.75, 24),
      new THREE.MeshStandardMaterial({ color: 0xe03e4e, roughness: 0.5 })
    );
    siloBand.position.y = 12.6;
    siloGroup.add(siloBand);
    const siloDome = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 24), matSnowCap);
    siloDome.position.y = 17.55;
    siloGroup.add(siloDome);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b52 })
    );
    beacon.position.y = 18.8;
    siloGroup.add(beacon);
    this.group.add(siloGroup);

    // 2. 22 Completely Randomized Multi-Biome Alpine Mountains (5 Distinct Biomes — ZERO similar mountains!)
    type MountainBiome = 'greenHill' | 'timberRidge' | 'graniteCrag' | 'glacialSummit' | 'blueGlacier';
    const matMtnRock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04, flatShading: true });
    const matMtnGlacier = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.54, metalness: 0.14, flatShading: true });

    const createAlpineMountain = (
      rx: number,
      rz: number,
      h: number,
      biome: MountainBiome,
      seed: number
    ): THREE.Mesh => {
      const topR = biome === 'greenHill' ? rx * 0.24 : biome === 'timberRidge' ? rx * 0.14 : 0.4;
      const baseGeo = new THREE.CylinderGeometry(topR, rx, h, 20, 8, false);
      baseGeo.translate(0, h * 0.5, 0);
      const zStretch = rz / Math.max(1, rx);
      const pos = baseGeo.attributes.position as THREE.BufferAttribute;

      for (let i = 0; i < pos.count; i++) {
        let vx = pos.getX(i);
        let vy = pos.getY(i);
        let vz = pos.getZ(i) * zStretch;
        const hNorm = THREE.MathUtils.clamp(vy / h, 0, 1);
        const ang = Math.atan2(vz, vx);

        if (biome === 'greenHill') {
          const dome = Math.pow(Math.max(0.001, 1 - hNorm * 0.8), 0.58) / Math.max(0.18, 1 - hNorm * 0.78);
          vx *= THREE.MathUtils.lerp(1.0, dome, 0.55);
          vz *= THREE.MathUtils.lerp(1.0, dome, 0.55);
        }
        const rAmp = biome === 'greenHill' ? 0.15 : biome === 'timberRidge' ? 0.24 : 0.32;
        const r1 = Math.sin(ang * 2 + seed) * rAmp;
        const r2 = Math.cos(ang * 4 - seed * 1.7) * (rAmp * 0.6);
        const r3 = Math.sin(ang * 7 + hNorm * 4.2 + seed * 2.3) * (rAmp * 0.28);
        const flank = 1 + (r1 + r2 + r3) * (1 - hNorm * 0.32);

        const leanAmp = biome === 'greenHill' ? 0.06 : 0.2;
        const leanX = Math.sin(hNorm * Math.PI * 0.85) * Math.cos(seed * 1.4) * rx * leanAmp;
        const leanZ = Math.sin(hNorm * Math.PI * 0.85) * Math.sin(seed * 1.4) * rz * leanAmp;
        const lift = (r1 * 0.16 + r2 * 0.1) * hNorm;
        pos.setXYZ(i, vx * flank + leanX, Math.max(0, vy * (1 + lift)), vz * flank + leanZ);
      }

      const geo = baseGeo.toNonIndexed();
      baseGeo.dispose();
      geo.computeVertexNormals();

      const gPos = geo.attributes.position as THREE.BufferAttribute;
      const gNorm = geo.attributes.normal as THREE.BufferAttribute;
      const colors = new Float32Array(gPos.count * 3);

      const cPineDeep = new THREE.Color(0x1b5234);
      const cPineLush = new THREE.Color(0x3f7b46);
      const cGraniteDark = new THREE.Color(0x3e4b5c);
      const cGraniteWarm = new THREE.Color(0x7c6958);
      const cSlateBlue = new THREE.Color(0x4b688a);
      const cGlacierBlue = new THREE.Color(0x2e82d8);
      const cGlacierSky = new THREE.Color(0x84cefc);
      const cSnowShade = new THREE.Color(0xdcebfa);
      const cSnowPure = new THREE.Color(0xffffff);
      const cTmp = new THREE.Color();

      for (let i = 0; i < gPos.count; i++) {
        const hNorm = THREE.MathUtils.clamp(gPos.getY(i) / h, 0, 1);
        const ny = gNorm.getY(i);

        if (biome === 'greenHill') {
          cTmp.copy(cPineDeep).lerp(cPineLush, THREE.MathUtils.clamp(ny * 1.2, 0, 1));
          const snow = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.58, 0.94) * 0.82 + THREE.MathUtils.smoothstep(ny, 0.74, 0.95) * 0.35,
            0,
            0.9
          );
          cTmp.lerp(cSnowShade, snow);
        } else if (biome === 'timberRidge') {
          const tl = THREE.MathUtils.smoothstep(hNorm, 0.34, 0.56);
          const fCol = cPineDeep.clone().lerp(cPineLush, THREE.MathUtils.clamp(ny, 0, 1));
          const rCol = cGraniteDark.clone().lerp(cGraniteWarm, THREE.MathUtils.clamp(ny * 1.25, 0, 1));
          cTmp.copy(fCol).lerp(rCol, tl);
          const snow = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.54, 0.84) * 0.92 + THREE.MathUtils.smoothstep(ny, 0.58, 0.86) * 0.42 - (1 - tl) * 0.38,
            0,
            1
          );
          cTmp.lerp(hNorm > 0.7 ? cSnowPure : cSnowShade, snow);
        } else if (biome === 'graniteCrag') {
          cTmp.copy(cGraniteDark).lerp(cGraniteWarm, THREE.MathUtils.clamp(ny * 1.35, 0, 1));
          const snow = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.5, 0.86) * 0.78 + THREE.MathUtils.smoothstep(ny, 0.54, 0.82) * 0.65 - 0.16,
            0,
            0.94
          );
          cTmp.lerp(cSnowShade, snow);
        } else if (biome === 'blueGlacier') {
          cTmp.copy(cGlacierBlue).lerp(cGlacierSky, THREE.MathUtils.clamp(ny * 1.15 + hNorm * 0.25, 0, 1));
          const snow = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.24, 0.72) * 0.86 + THREE.MathUtils.smoothstep(ny, 0.36, 0.78) * 0.72,
            0,
            1
          );
          cTmp.lerp(hNorm > 0.54 ? cSnowPure : cSnowShade, snow);
        } else {
          cTmp.copy(cGraniteDark).lerp(cSlateBlue, THREE.MathUtils.clamp(ny * 1.1, 0, 1));
          const snow = THREE.MathUtils.clamp(
            THREE.MathUtils.smoothstep(hNorm, 0.28, 0.66) * 0.9 + THREE.MathUtils.smoothstep(ny, 0.42, 0.76) * 0.74,
            0,
            1
          );
          cTmp.lerp(hNorm > 0.56 ? cSnowPure : cSnowShade, snow);
        }

        colors[i * 3] = cTmp.r;
        colors[i * 3 + 1] = cTmp.g;
        colors[i * 3 + 2] = cTmp.b;
      }

      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return new THREE.Mesh(geo, biome === 'blueGlacier' ? matMtnGlacier : matMtnRock);
    };

    const biomes: MountainBiome[] = ['greenHill', 'timberRidge', 'graniteCrag', 'glacialSummit', 'blueGlacier'];
    // Hero radiant blue-white glacier massif centered behind the North Silo!
    const heroGlacier = createAlpineMountain(36, 30, 62, 'blueGlacier', 7.3);
    heroGlacier.position.set(4, -1.2, -96);
    this.group.add(heroGlacier);

    // 22 completely randomized surrounding multi-tier mountains (foothills + tall alpine peaks all 360°!)
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + randRange(-0.1, 0.1);
      const isFoothill = i % 3 === 0;
      const dist = isFoothill ? randRange(66, 86) : randRange(92, 126);
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const rx = isFoothill ? randRange(18, 28) : randRange(24, 42);
      const rz = rx * randRange(0.72, 1.32);
      const mh = isFoothill ? randRange(17, 30) : randRange(34, 62);
      const biome = isFoothill
        ? rand() < 0.6
          ? 'greenHill'
          : 'timberRidge'
        : biomes[(i * 2 + Math.floor(rand() * 3)) % biomes.length];
      const mtn = createAlpineMountain(rx, rz, mh, biome, randRange(1, 99));
      mtn.position.set(mx, -1.2, mz);
      mtn.rotation.y = rand() * Math.PI * 2;
      this.group.add(mtn);
    }

    // 3. 62+ Completely Randomized Multi-Species Winter Trees (6 Distinct Species — ZERO clones!)
    const matSpruce = new THREE.MeshStandardMaterial({ color: 0x164430, roughness: 0.86 });
    const matFir = new THREE.MeshStandardMaterial({ color: 0x22603d, roughness: 0.84 });
    const matCedar = new THREE.MeshStandardMaterial({ color: 0x2c606c, roughness: 0.84 });
    const matLarch = new THREE.MeshStandardMaterial({ color: 0x6f7a38, roughness: 0.86 });
    const matPineDark = new THREE.MeshStandardMaterial({ color: 0x123226, roughness: 0.88 });
    const matBarkDark = new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 0.92 });
    const matBarkRed = new THREE.MeshStandardMaterial({ color: 0x683e28, roughness: 0.9 });
    const matBirchBark = new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.78 });
    const matBoulder = new THREE.MeshStandardMaterial({ color: 0x687686, roughness: 0.9, flatShading: true });

    const spawnRandomTree = (x: number, z: number, sc: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rand() * Math.PI * 2;
      const roll = rand();

      if (roll < 0.2) {
        // Silver Birch with crisp white bark + forked winter crown + frost snow tufts
        const th = randRange(4.8, 6.8) * sc;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * sc, 0.21 * sc, th, 7), matBirchBark);
        trunk.position.y = th * 0.5;
        g.add(trunk);
        for (let b = 0; b < 4; b++) {
          const ba = (b / 4) * Math.PI * 2 + randRange(-0.3, 0.3);
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * sc, 0.08 * sc, 2.2 * sc, 5), matBirchBark);
          br.position.set(Math.cos(ba) * 0.65 * sc, th * 0.76, Math.sin(ba) * 0.65 * sc);
          br.rotation.z = -Math.cos(ba) * 0.62;
          br.rotation.x = Math.sin(ba) * 0.62;
          g.add(br);
          const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 * sc, 0), matSnowCap);
          puff.scale.set(1.2, 0.55, 1.2);
          puff.position.set(Math.cos(ba) * 1.25 * sc, th * 0.92, Math.sin(ba) * 1.25 * sc);
          g.add(puff);
        }
      } else if (roll < 0.42) {
        // Tall slender Alpine Spruce (4 stacked snowy tiers)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * sc, 0.32 * sc, 2.6 * sc, 6), matBarkDark);
        trunk.position.y = 1.3 * sc;
        g.add(trunk);
        const tiers = 4;
        for (let t = 0; t < tiers; t++) {
          const r = (2.1 - t * 0.42) * sc * randRange(0.9, 1.12);
          const h = (2.5 - t * 0.25) * sc;
          const y = (2.4 + t * 1.55) * sc;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), t % 2 === 0 ? matSpruce : matPineDark);
          cone.position.y = y;
          cone.rotation.y = rand() * Math.PI;
          g.add(cone);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.68, h * 0.44, 7), matSnowCap);
          cap.position.y = y + h * 0.3;
          g.add(cap);
        }
      } else if (roll < 0.64) {
        // Wide lush Siberian Fir (bright vibrant evergreen!)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sc, 0.36 * sc, 2.2 * sc, 6), matBarkRed);
        trunk.position.y = 1.1 * sc;
        g.add(trunk);
        for (let t = 0; t < 3; t++) {
          const r = (2.5 - t * 0.55) * sc * randRange(0.92, 1.14);
          const h = (3.4 - t * 0.55) * sc;
          const y = (2.8 + t * 1.85) * sc;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), matFir);
          cone.position.y = y;
          g.add(cone);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, h * 0.38, 8), matSnowCap);
          cap.position.y = y + h * 0.34;
          g.add(cap);
        }
      } else if (roll < 0.84) {
        // Frost-Blue Mountain Cedar (icy blue-green needles + rounded snowy boughs)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * sc, 0.3 * sc, 2.5 * sc, 6), matBarkRed);
        trunk.position.y = 1.25 * sc;
        g.add(trunk);
        for (let t = 0; t < 3; t++) {
          const r = (2.2 - t * 0.48) * sc;
          const h = (2.9 - t * 0.4) * sc;
          const y = (2.9 + t * 1.7) * sc;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), matCedar);
          cone.position.y = y;
          g.add(cone);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.66, h * 0.42, 7), matSnowCap);
          cap.position.y = y + h * 0.32;
          g.add(cap);
        }
      } else {
        // Golden-Olive Winter Larch (adds rich autumn-gold warmth against the white snow!)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * sc, 0.28 * sc, 2.6 * sc, 6), matBarkDark);
        trunk.position.y = 1.3 * sc;
        g.add(trunk);
        for (let t = 0; t < 3; t++) {
          const r = (1.9 - t * 0.42) * sc;
          const h = (2.8 - t * 0.35) * sc;
          const y = (3.0 + t * 1.65) * sc;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), matLarch);
          cone.position.y = y;
          g.add(cone);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.56, h * 0.36, 7), matSnowCap);
          cap.position.y = y + h * 0.35;
          g.add(cap);
        }
      }
      this.group.add(g);
    };

    const placedTrees: Array<[number, number]> = [];
    const isClearOutside = (x: number, z: number, minDist = 4.6): boolean => {
      // Strictly clear of the 56x58 arena + chalet footprint buffer
      if (Math.abs(x) < HALF_W + 7 && Math.abs(z) < HALF_L + 7) return false;
      for (const [hx, hz] of houses) {
        if (Math.hypot(x - hx, z - hz) < 9.5) return false;
      }
      if (Math.hypot(x - 2.5, z + 40.5) < 8.5) return false; // Silo clearance
      for (const [px, pz] of placedTrees) {
        if (Math.hypot(x - px, z - pz) < minDist) return false;
      }
      return true;
    };

    for (let tries = 0; tries < 420 && placedTrees.length < 64; tries++) {
      const a = rand() * Math.PI * 2;
      const dist = randRange(36, 68);
      const tx = Math.cos(a) * dist;
      const tz = Math.sin(a) * dist;
      if (isClearOutside(tx, tz, randRange(4.4, 6.2))) {
        placedTrees.push([tx, tz]);
        spawnRandomTree(tx, tz, randRange(0.88, 1.72));
      }
    }

    // 22 snow-capped alpine boulders scattered organically around the snowfields
    const boulderGeo = new THREE.DodecahedronGeometry(1.0, 1);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + randRange(-0.18, 0.18);
      const dist = randRange(36, 60);
      const bx = Math.cos(a) * dist;
      const bz = Math.sin(a) * dist;
      if (Math.abs(bx) < HALF_W + 4 && Math.abs(bz) < HALF_L + 4) continue;
      const sc = randRange(1.2, 2.7);
      const b = new THREE.Group();
      b.position.set(bx, -0.1, bz);
      b.rotation.y = rand() * Math.PI * 2;
      const rock = new THREE.Mesh(boulderGeo, matBoulder);
      rock.scale.set(sc * randRange(1.0, 1.45), sc * randRange(0.6, 1.0), sc * randRange(0.9, 1.35));
      rock.position.y = sc * 0.4;
      b.add(rock);
      const cap = new THREE.Mesh(boulderGeo, matSnowCap);
      cap.scale.set(rock.scale.x * 0.92, rock.scale.y * 0.42, rock.scale.z * 0.92);
      cap.position.y = rock.position.y + rock.scale.y * 0.54;
      b.add(cap);
      this.group.add(b);
    }
  }

  // =========================================================================
  // MAP 2: WAREHOUSE TDM (3x EXPANDED, BRIGHT NEON BLUE & PURPLE + BURNING LAMPS!)
  // =========================================================================
  private buildWarehouseTdm(scene: THREE.Scene): BuiltLevel {
    scene.background = new THREE.Color(0x10172b);
    scene.fog = new THREE.FogExp2(0x121932, 0.0052);

    // Bright, crisp neon-lit industrial atmosphere — ZERO dark corners on Basement or 2nd Floor!
    this.group.add(new THREE.HemisphereLight(0xb2e2ff, 0x5c3e88, 1.48));
    const dirLight = new THREE.DirectionalLight(0xe4f2ff, 1.72);
    dirLight.position.set(16, 28, 18);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 96;
    dirLight.shadow.camera.left = -34;
    dirLight.shadow.camera.right = 34;
    dirLight.shadow.camera.top = 34;
    dirLight.shadow.camera.bottom = -34;
    dirLight.shadow.bias = -0.0008;
    this.group.add(dirLight);

    // Vibrant Neon Blue & Neon Purple Bay Lights illuminating both floors cleanly!
    const coreCyanLight = new THREE.PointLight(0x28ecff, 58, 36, 1.2);
    coreCyanLight.position.set(0, 7.2, 0);
    this.group.add(coreCyanLight);

    const westPurpleLight = new THREE.PointLight(0xc842ff, 48, 34, 1.25);
    westPurpleLight.position.set(-20, 6.2, 0);
    this.group.add(westPurpleLight);

    const eastPurpleLight = new THREE.PointLight(0xc842ff, 48, 34, 1.25);
    eastPurpleLight.position.set(20, 6.2, 0);
    this.group.add(eastPurpleLight);

    const southBlueLight = new THREE.PointLight(0x36d8ff, 44, 34, 1.25);
    southBlueLight.position.set(0, 5.8, 20);
    this.group.add(southBlueLight);

    const northBlueLight = new THREE.PointLight(0x36d8ff, 44, 34, 1.25);
    northBlueLight.position.set(0, 5.8, -20);
    this.group.add(northBlueLight);

    // Brighter high-clarity industrial materials
    const matFloor = new THREE.MeshStandardMaterial({
      color: 0x54647a,
      map: this.tex.wetAsphalt.map,
      roughnessMap: this.tex.wetAsphalt.roughnessMap,
      bumpMap: this.tex.wetAsphalt.bumpMap,
      bumpScale: 0.03,
      roughness: 0.56,
      metalness: 0.24,
    });
    const matConcrete = new THREE.MeshStandardMaterial({
      color: 0x74859c,
      map: this.tex.grimyConcrete.map,
      roughnessMap: this.tex.grimyConcrete.roughnessMap,
      bumpMap: this.tex.grimyConcrete.bumpMap,
      bumpScale: 0.045,
      roughness: 0.82,
      metalness: 0.1,
    });
    const matSteel = new THREE.MeshStandardMaterial({
      color: 0x6c829e,
      roughness: 0.46,
      metalness: 0.48,
    });
    const matCorrugated = new THREE.MeshStandardMaterial({
      color: 0x62758f,
      map: this.tex.corrugatedMetal.map,
      roughnessMap: this.tex.corrugatedMetal.roughnessMap,
      roughness: 0.6,
      metalness: 0.58,
    });
    const matGrate = new THREE.MeshStandardMaterial({
      color: 0x748aa6,
      map: this.tex.metalGrate.map,
      roughnessMap: this.tex.metalGrate.roughnessMap,
      roughness: 0.48,
      metalness: 0.56,
    });
    const matCrate = new THREE.MeshStandardMaterial({
      color: 0xe6d2b0,
      map: this.tex.techCrate.map,
      roughnessMap: this.tex.techCrate.roughnessMap,
      bumpMap: this.tex.techCrate.bumpMap,
      bumpScale: 0.04,
      roughness: 0.68,
      metalness: 0.18,
    });
    const matHazard = new THREE.MeshStandardMaterial({ map: this.tex.hazardTrim, roughness: 0.68, metalness: 0.24 });
    const matNeonBlue = new THREE.MeshBasicMaterial({ color: 0x2ef4ff });
    const matNeonPurple = new THREE.MeshBasicMaterial({ color: 0xd052ff });
    const matNeonMagenta = new THREE.MeshBasicMaterial({ color: 0xff46b8 });

    // 1. Ground Basement Floor & High-Bay Warehouse Roof (11.5m tall!)
    const roofH = 11.5;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 2, HALF_L * 2 + 2), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.raycastMeshes.push(floor);

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 2, HALF_L * 2 + 2), matSteel);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = roofH;
    this.group.add(roof);

    // Overhead glowing NEON BLUE & NEON PURPLE ceiling light tubes & trusses across the entire warehouse!
    for (const tz of [-22, -11, 0, 11, 22]) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.62, 0.55), matSteel);
      truss.position.set(0, roofH - 0.4, tz);
      this.group.add(truss);
      const crossNeon = new THREE.Mesh(
        new THREE.BoxGeometry(HALF_W * 1.85, 0.16, 0.24),
        tz === 0 ? matNeonBlue : matNeonPurple
      );
      crossNeon.position.set(0, roofH - 0.76, tz);
      this.group.add(crossNeon);
    }
    const ceilingCols: Array<[number, THREE.Material]> = [
      [-23, matNeonPurple],
      [-13, matNeonBlue],
      [-4.5, matNeonBlue],
      [4.5, matNeonBlue],
      [13, matNeonBlue],
      [23, matNeonPurple],
    ];
    for (const [lx, lMat] of ceilingCols) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, HALF_L * 1.82), lMat);
      tube.position.set(lx, roofH - 0.82, 0);
      this.group.add(tube);
    }

    // 2. Enclosed Warehouse Outer Bulkhead Walls + Glowing Neon Blue/Purple Wall Bands!
    this.addSolidBox(0, roofH * 0.5, -HALF_L - 0.5, HALF_W * 2 + 2, roofH, 1.0, matConcrete, { minimapKind: 'wall' });
    this.addSolidBox(0, roofH * 0.5, HALF_L + 0.5, HALF_W * 2 + 2, roofH, 1.0, matConcrete, { minimapKind: 'wall' });
    this.addSolidBox(-HALF_W - 0.5, roofH * 0.5, 0, 1.0, roofH, HALF_L * 2 + 2, matConcrete, { minimapKind: 'wall' });
    this.addSolidBox(HALF_W + 0.5, roofH * 0.5, 0, 1.0, roofH, HALF_L * 2 + 2, matConcrete, { minimapKind: 'wall' });

    // Horizontal & vertical neon blue/purple perimeter light strips on both basement & 2nd floor!
    for (const sy of [2.8, 6.8]) {
      const nBar = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 1.9, 0.18, 0.14), matNeonBlue);
      nBar.position.set(0, sy, -HALF_L + 0.08);
      this.group.add(nBar);
      const sBar = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 1.9, 0.18, 0.14), matNeonBlue);
      sBar.position.set(0, sy, HALF_L - 0.08);
      this.group.add(sBar);
      const wBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, HALF_L * 1.9), matNeonPurple);
      wBar.position.set(-HALF_W + 0.08, sy, 0);
      this.group.add(wBar);
      const eBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, HALF_L * 1.9), matNeonPurple);
      eBar.position.set(HALF_W - 0.08, sy, 0);
      this.group.add(eBar);
    }

    // 3. FOUR BUTTER-SMOOTH INDUSTRIAL RAMP STAIRCASES WITH FLUSH TOP LANDINGS — BOTH SIDES FROM BOTH SPAWNS!
    this.addStaircase(-19.5, 24.0, 15.0, 3.6, matGrate, matSteel, matNeonBlue);
    this.addStaircase(19.5, 24.0, 15.0, 3.6, matGrate, matSteel, matNeonBlue);
    this.addStaircase(-19.5, -24.0, -15.0, 3.6, matGrate, matSteel, matNeonMagenta);
    this.addStaircase(19.5, -24.0, -15.0, 3.6, matGrate, matSteel, matNeonMagenta);

    // 4. UPPER 2ND FLOOR CATWALK & CONTROL DECK NETWORK (y = 4.2m) — 4 UPPER PATHS!
    this.addFloorSlab(-20.0, 0, 9.0, 30.0, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(20.0, 0, 9.0, 30.0, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(0, 13.5, 31.0, 4.0, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(0, -13.5, 31.0, 4.0, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(0, 5.5, 31.0, 4.2, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(0, -5.5, 31.0, 4.2, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(-5.5, 0, 4.0, 24.0, FLOOR2_Y, matGrate, 'arch');
    this.addFloorSlab(5.5, 0, 4.0, 24.0, FLOOR2_Y, matGrate, 'arch');

    // Glowing neon under-deck strips illuminating the entire basement ceiling cleanly!
    for (const ux of [-20, 20]) {
      const underStrip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 27), matNeonPurple);
      underStrip.position.set(ux, FLOOR2_Y - SLAB_THICK - 0.06, 0);
      this.group.add(underStrip);
    }
    for (const uz of [-13.5, -5.5, 5.5, 13.5]) {
      const underStrip = new THREE.Mesh(new THREE.BoxGeometry(28, 0.1, 0.32), matNeonBlue);
      underStrip.position.set(0, FLOOR2_Y - SLAB_THICK - 0.06, uz);
      this.group.add(underStrip);
    }

    const addUpperRail = (x: number, z: number, w: number, d: number, purple = false) => {
      this.addSolidBox(x, FLOOR2_Y + 0.56, z, w, 1.12, d, matSteel);
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.04, 0.09, d + 0.04),
        purple ? matNeonPurple : matNeonBlue
      );
      trim.position.set(x, FLOOR2_Y + 1.15, z);
      this.group.add(trim);
    };

    for (const sx of [-1, 1]) {
      addUpperRail(sx * 15.7, 9.6, 0.34, 4.0, true);
      addUpperRail(sx * 15.7, -9.6, 0.34, 4.0, true);
      addUpperRail(sx * 15.7, 0, 0.34, 6.2, false);
      addUpperRail(sx * 24.3, 0, 0.34, 26.0, true);
      addUpperRail(sx * 3.7, 0, 0.3, 4.4, false);
    }
    for (const sz of [-1, 1]) {
      addUpperRail(0, sz * 15.3, 18.0, 0.34, false);
      addUpperRail(-10.5, sz * 11.7, 5.2, 0.34, true);
      addUpperRail(10.5, sz * 11.7, 5.2, 0.34, true);
      addUpperRail(0, sz * 3.6, 4.4, 0.3, false);
    }

    // Upper-floor vibrant colored graffiti containers & industrial cover crates
    this.addShippingContainer(-20.4, FLOOR2_Y, 0, 2.4, 2.4, 5.6, 'purple', false);
    this.addShippingContainer(20.4, FLOOR2_Y, 0, 2.4, 2.4, 5.6, 'coral', false);
    this.addCrateCluster(-11.2, FLOOR2_Y, 5.4, matCrate);
    this.addCrateCluster(9.8, FLOOR2_Y, -5.4, matCrate);
    this.addCrateCluster(-5.5, FLOOR2_Y, 0, matCrate);
    this.addCrateCluster(4.2, FLOOR2_Y, 0, matCrate);

    // 5. BASEMENT / GROUND FLOOR — 5 VERTICAL LANES + BREACHED BULKHEADS + MULTI-COLOR GRAFFITI CONTAINERS!
    const hWall = FLOOR2_Y - SLAB_THICK;
    const matWhPillar = new THREE.MeshStandardMaterial({
      color: 0xa6bbd4,
      map: this.tex.cryzenConcrete,
      roughness: 0.56,
      metalness: 0.16,
    });
    this.addArchitecturalPillar(-15.2, 13.5, hWall, 0x2ef4ff, matWhPillar, matHazard);
    this.addArchitecturalPillar(15.2, 13.5, hWall, 0xd052ff, matWhPillar, matHazard);
    this.addArchitecturalPillar(-15.2, -13.5, hWall, 0xff46b8, matWhPillar, matHazard);
    this.addArchitecturalPillar(15.2, -13.5, hWall, 0x2ef4ff, matWhPillar, matHazard);

    for (const sz of [-1, 1]) {
      this.addSolidBox(0, 1.6, sz * 19.6, 6.6, 3.2, 0.9, matConcrete, { minimapKind: 'wall' });
      this.addSolidBox(-11.4, 1.6, sz * 19.6, 5.4, 3.2, 0.9, matConcrete, { minimapKind: 'wall' });
      this.addSolidBox(11.4, 1.6, sz * 19.6, 5.4, 3.2, 0.9, matConcrete, { minimapKind: 'wall' });
      const bGlow = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 0.14, 0.98),
        sz > 0 ? matNeonBlue : matNeonMagenta
      );
      bGlow.position.set(0, 3.12, sz * 19.6);
      this.group.add(bGlow);
    }

    for (const sx of [-1, 1]) {
      const wx = sx * 18.4;
      this.addSolidBox(wx, hWall * 0.5, -8.8, 0.75, hWall, 4.4, matCorrugated, { minimapKind: 'wall' });
      this.addSolidBox(wx, hWall * 0.5, 0, 0.75, hWall, 4.6, matCorrugated, { minimapKind: 'wall' });
      this.addSolidBox(wx, hWall * 0.5, 8.8, 0.75, hWall, 4.4, matCorrugated, { minimapKind: 'wall' });
      // Vertical neon purple doorway edge strips so every flank breach stands out clearly!
      for (const dz of [-11.0, -6.6, -2.3, 2.3, 6.6, 11.0]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.84, hWall - 0.4, 0.1), matNeonPurple);
        edge.position.set(wx, hWall * 0.5, dz);
        this.group.add(edge);
      }
    }

    for (const sx of [-1, 1]) {
      const ix = sx * 7.4;
      this.addSolidBox(ix, hWall * 0.5, -6.2, 0.75, hWall, 6.2, matConcrete, { minimapKind: 'wall' });
      this.addSolidBox(ix, hWall * 0.5, 6.2, 0.75, hWall, 6.2, matConcrete, { minimapKind: 'wall' });
      for (const dz of [-9.3, -3.1, 3.1, 9.3]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.84, hWall - 0.4, 0.1), matNeonBlue);
        edge.position.set(ix, hWall * 0.5, dz);
        this.group.add(edge);
      }
    }

    // Towering Neon Blue & Purple Central Reactor Core
    this.addSolidBox(0, 5.2, 0, 2.8, 10.4, 2.8, matSteel, { minimapKind: 'pillar' });
    for (const [yRing, rMat] of [
      [1.4, matNeonBlue],
      [3.0, matNeonPurple],
      [4.8, matNeonBlue],
      [6.8, matNeonPurple],
      [8.6, matNeonBlue],
    ] as Array<[number, THREE.Material]>) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(3.04, 0.24, 3.04), rMat);
      ring.position.set(0, yRing, 0);
      this.group.add(ring);
    }

    // Vibrant Distinct-Color Graffiti Warehouse Containers (every container has its own unique street-art graffiti!)
    this.addShippingContainer(-12.8, 0, 0, 2.5, 2.7, 5.8, 'sky', false);
    this.addShippingContainer(12.8, 0, 0, 2.5, 2.7, 5.8, 'crimson', false);
    this.addShippingContainer(-23.4, 0, -6.2, 2.5, 2.7, 5.6, 'lime', false);
    this.addShippingContainer(-23.4, 0, 6.2, 2.5, 2.7, 5.6, 'amber', false);
    this.addShippingContainer(23.4, 0, -6.2, 2.5, 2.7, 5.6, 'gold', false);
    this.addShippingContainer(23.4, 0, 6.2, 2.5, 2.7, 5.6, 'teal', false);

    for (const [bx, bz, bw, bd] of [
      [-3.8, 11.4, 3.0, 0.6],
      [3.8, 11.4, 3.0, 0.6],
      [-3.8, -11.4, 3.0, 0.6],
      [3.8, -11.4, 3.0, 0.6],
      [-12.8, 11.6, 3.2, 0.65],
      [12.8, 11.6, 3.2, 0.65],
      [-12.8, -11.6, 3.2, 0.65],
      [12.8, -11.6, 3.2, 0.65],
    ]) {
      this.addSolidBox(bx, 0.68, bz, bw, 1.36, bd, matHazard, { minimapKind: 'crate' });
    }

    for (const [cx, cz] of [
      [-13.5, 6.4],
      [12.2, 6.4],
      [-13.5, -6.4],
      [12.2, -6.4],
      [-23.6, 15.8],
      [22.4, 15.8],
      [-23.6, -15.8],
      [22.4, -15.8],
      [-3.8, -3.8],
      [2.8, 3.8],
    ]) {
      this.addCrateCluster(cx, 0, cz, matCrate);
    }

    // 6. EIGHT ANIMATED BURNING FIRE BARREL LAMPS / BRAZIERS (Basement + 2nd Floor!)
    this.addFireBarrel(-15.5, 0, 21.5, true);
    this.addFireBarrel(15.5, 0, 21.5, true);
    this.addFireBarrel(-15.5, 0, -21.5, true);
    this.addFireBarrel(15.5, 0, -21.5, true);
    // Mid & 2nd-floor burning braziers (visual flames + warm core lights)
    this.addFireBarrel(-4.2, 0, 0, false);
    this.addFireBarrel(4.2, 0, 0, false);
    this.addFireBarrel(-16.5, FLOOR2_Y, 13.5, false);
    this.addFireBarrel(16.5, FLOOR2_Y, -13.5, false);

    // 7. Floating Warm Embers & Cyan Dust Motes
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 480;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 52;
      dustPos[i * 3 + 1] = 0.4 + Math.random() * 9.5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 54;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0xffc688, size: 0.11, transparent: true, opacity: 0.5 })
    );
    this.group.add(dustPoints);

    scene.add(this.group);

    const updateAtmosphere = (dt: number, elapsed: number) => {
      const p = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.34;
        if (y > 10.2) y = 0.4;
        p.setY(i, y);
      }
      p.needsUpdate = true;

      // Animate dancing fire barrel flames & flickering firelights!
      for (const f of this.flameMeshes) {
        const flicker = Math.sin(elapsed * 14 + f.phase) * 0.14 + Math.cos(elapsed * 21 + f.phase * 1.7) * 0.08;
        f.mesh.scale.set(1 + flicker * 0.4, 1 + flicker * 1.1, 1 + flicker * 0.4);
        f.mesh.position.y = f.baseY + flicker * 0.12;
        f.mesh.rotation.y += dt * 2.2;
      }
      for (const fl of this.fireLights) {
        fl.light.intensity =
          fl.baseIntensity +
          Math.sin(elapsed * 13 + fl.phase) * 4.5 +
          Math.cos(elapsed * 23 + fl.phase) * 2.2;
      }
      coreCyanLight.intensity = 54 + Math.sin(elapsed * 2.8) * 6;
    };

    const zones: ZoneDef[] = [
      { name: 'BLUE BAY (SOUTH)', minX: -28, maxX: 28, minZ: 19, maxZ: 29 },
      { name: 'RED BAY (NORTH)', minX: -28, maxX: 28, minZ: -29, maxZ: -19 },
      { name: 'WEST CONDUIT HALL', minX: -28, maxX: -18, minZ: -19, maxZ: 19 },
      { name: 'WEST CARGO BAY', minX: -18, maxX: -7, minZ: -19, maxZ: 19 },
      { name: 'REACTOR CORE / CATWALKS', minX: -7, maxX: 7, minZ: -19, maxZ: 19 },
      { name: 'EAST LOADING BAY', minX: 7, maxX: 18, minZ: -19, maxZ: 19 },
      { name: 'EAST GENERATOR HALL', minX: 18, maxX: 28, minZ: -19, maxZ: 19 },
    ];

    return {
      group: this.group,
      colliders: this.colliders,
      ramps: this.ramps,
      raycastMeshes: this.raycastMeshes,
      minimapRects: this.minimapRects,
      waypoints: [],
      zones,
      playerSpawn: { pos: new THREE.Vector3(0, 0, 25.5), yaw: 0 },
      allySpawn: { pos: new THREE.Vector3(-4.6, 0, 25.2), yaw: 0 },
      allySpawns: [
        { pos: new THREE.Vector3(-4.6, 0, 25.2), yaw: 0, role: 'ember', name: 'BLUE-2' },
        { pos: new THREE.Vector3(4.6, 0, 25.2), yaw: 0, role: 'ember', name: 'BLUE-3' },
        { pos: new THREE.Vector3(-9.6, 0, 25.4), yaw: 0, role: 'ember', name: 'BLUE-4' },
        { pos: new THREE.Vector3(9.6, 0, 25.4), yaw: 0, role: 'ember', name: 'BLUE-5' },
      ],
      enemySpawns: [
        { pos: new THREE.Vector3(0, 0, -25.5), yaw: Math.PI, role: 'duelist', name: 'RED-1' },
        { pos: new THREE.Vector3(-4.6, 0, -25.2), yaw: Math.PI, role: 'striker', name: 'RED-2' },
        { pos: new THREE.Vector3(4.6, 0, -25.2), yaw: Math.PI, role: 'sentinel', name: 'RED-3' },
        { pos: new THREE.Vector3(-9.6, 0, -25.4), yaw: Math.PI, role: 'duelist', name: 'RED-4' },
        { pos: new THREE.Vector3(9.6, 0, -25.4), yaw: Math.PI, role: 'striker', name: 'RED-5' },
      ],
      dustParticles: dustPoints,
      mapBounds: { minX: -HALF_W, maxX: HALF_W, minZ: -HALF_L, maxZ: HALF_L },
      updateAtmosphere,
    };
  }
}
