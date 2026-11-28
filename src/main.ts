import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BOT_EMBER_ID,
  CharacterId,
  Difficulty,
  GameMode,
  GameSettings,
  LobbyState,
  LobbyTeam,
  MAX_PLAYERS_PER_TEAM,
  MapId,
} from './types';
import { SoundEngine } from './audio/SoundEngine';
import { createTextureLibrary, TextureLibrary } from './textures/ProceduralTextures';
import { BuiltLevel, LevelBuilder } from './world/LevelBuilder';
import { depenetrateFromColliders } from './world/CollisionUtils';
import { preloadDowntownGlbs } from './world/DowntownGlbAssets';
import { PlayerController } from './player/PlayerController';
import { WeaponSystem } from './weapons/WeaponSystem';
import { CHARACTER_OPTIONS, ensureCharacterLoaded, preloadSoldierTemplate } from './entities/AgentModel';
import { AgentFireEvent, TacticalAgent, hasClearSight } from './entities/AgentAI';
import { RemotePlayer } from './entities/RemotePlayer';
import { LootDrop } from './entities/LootDrop';
import {
  MatchEndPayload,
  MultiplayerManager,
  NetDamagePayload,
  NetHealPayload,
  NetKillPayload,
  NetLootPickupPayload,
  NetLootSpawnPayload,
  NetOrdnancePayload,
  NetShotPayload,
  PlayerPoseInput,
  RoundEndPayload,
  RoundSpawnAssignment,
  RoundStartPayload,
  SnapshotPlayerState,
  UtilityBundle,
  WorldSnapshot,
  sanitizePlayerName,
} from './net/MultiplayerManager';
import { AbilitySystem } from './abilities/AbilitySystem';
import { Minimap } from './ui/Minimap';
import { DamageHistoryEntry, HUD, NameplateTarget } from './ui/HUD';

const ROUNDS_TO_WIN = 5;
const ROUND_DURATION = 90;
const TDM_ROUND_DURATION = 600; // 10-minute rounds for the 3x-expanded 2-floor 5v5 TDM arenas!

// Team Death Match exclusive medical & utility-looting constants
const TDM_BANDAGE_START = 4;
const TDM_BANDAGE_HEAL = 25;
const TDM_BANDAGE_TIME = 5.0;
const TDM_MEDKIT_START = 1;
const TDM_MEDKIT_HEAL = 75;
const TDM_MEDKIT_TIME = 10.0;
const TDM_LOOT_PICKUP_RANGE = 3.4;
const TDM_SPAWN_SHIELD_DURATION = 3.0;

/**
 * Generates a dark moody industrial PMREM reflection map with cyan overhead strips,
 * warm amber furnace glow, and crimson side accents so wet puddles & armor gleam realistically.
 */
function buildIndustrialEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x070a10);

  // Dark enclosed industrial chamber
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(24, 14, 24),
    new THREE.MeshBasicMaterial({ color: 0x0b1018, side: THREE.BackSide })
  );
  envScene.add(shell);

  // Overhead vivid electric-cyan fluorescent strips
  const cyanStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 3.4, 4.1) });
  for (const x of [-4.5, 0, 4.5]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 15), cyanStripMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.set(x, 6.6, 0);
    envScene.add(strip);
  }

  // Warm molten orange/amber fire bounce patches near lower walls
  const amberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.9, 1.6, 0.35) });
  const fireWall1 = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.6), amberMat);
  fireWall1.position.set(-7.5, 1.8, -11.5);
  envScene.add(fireWall1);

  const fireWall2 = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 4.0), amberMat);
  fireWall2.rotation.y = -Math.PI / 2;
  fireWall2.position.set(11.5, 1.8, 4.5);
  envScene.add(fireWall2);

  // Vibrant crimson / neon magenta side rim glow
  const crimsonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.35, 1.0) });
  const sideGlow = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 4.4), crimsonMat);
  sideGlow.rotation.y = Math.PI / 2;
  sideGlow.position.set(-11.5, 3.5, 2.5);
  envScene.add(sideGlow);

  const rt = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  return rt.texture;
}

/**
 * Generates a vibrant golden-hour azure + electric-cyan + warm amber sun PMREM reflection map
 * for Cryzen Factory so wet meltwater puddles, shipping containers, and guns gleam like Foundry 07!
 */
function buildDaylightEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x2866b8);

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x3b8ce0, side: THREE.BackSide })
  );
  envScene.add(skyDome);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 36),
    new THREE.MeshBasicMaterial({ color: 0x4b5c72 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -4;
  envScene.add(groundPlane);

  // Radiant golden-amber sunset reflection panels (makes gunmetal & wet puddles shimmer!)
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.7, 1.15) })
  );
  sunDisc.position.set(10, 11, 9);
  envScene.add(sunDisc);

  // Crisp electric-cyan sky bounce strip opposite the golden sun
  const cyanBounce = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 2.8, 3.8) })
  );
  cyanBounce.position.set(-10, 5, -11);
  cyanBounce.lookAt(0, 0, 0);
  envScene.add(cyanBounce);

  // Subtle crimson-amber industrial side accent bounce
  const warmAccent = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 4.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.2, 0.55) })
  );
  warmAccent.position.set(-12, 2, 4);
  warmAccent.lookAt(0, 0, 0);
  envScene.add(warmAccent);

  const rt = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  return rt.texture;
}

class SkyfallGame {
  private container = document.getElementById('game-container')!;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envFactory: THREE.Texture | null = null;
  private envFoundry: THREE.Texture | null = null;

  private sound = new SoundEngine();
  private textures: TextureLibrary;
  private level: BuiltLevel;
  private player: PlayerController;
  private weapons: WeaponSystem;
  private abilities: AbilitySystem;
  private minimap: Minimap;
  private hud = new HUD();

  private agents: TacticalAgent[] = [];
  private remotePlayers = new Map<string, RemotePlayer>();
  private mp!: MultiplayerManager;
  private isTdmMatch = false;
  private levelIsTdmExpanded = false;
  private tdmHostSelectedMap: MapId = 'factory';
  private tdmLocalTeam: LobbyTeam = 'blue';
  private hostLivePlayers = new Map<string, SnapshotPlayerState>();
  private hostPlayerUtils = new Map<string, UtilityBundle>();
  private botEmberFireCd = 0.8;
  private botEmberStrafeDir = 1;
  private botEmberStrafeTimer = 1.6;
  private botEmberWaypoint = new THREE.Vector3(0, 0, -10);
  private hostLootDrops = new Map<string, NetLootSpawnPayload>();
  private lootDrops = new Map<string, LootDrop>();
  private lootDropSeq = 0;
  private nearestLootId: string | null = null;
  private tdmBandages = 0;
  private tdmMedkits = 0;
  private activeHeal: { kind: 'bandage' | 'medkit'; elapsed: number; duration: number } | null = null;
  private localHealGraceTimer = 0;
  private localSpawnShield = 0;
  private netSyncAccum = 0;
  private tdmSlowFrameAccum = 0;
  private graphicsPreset: 'bloom' | 'perf' | 'laptop' = 'bloom';
  private userPickedGraphics = false;

  private raycaster = new THREE.Raycaster();
  private roundDamageHistory = new Map<string, DamageHistoryEntry>();
  private tmpHeadPos = new THREE.Vector3();
  private tmpCamFwd = new THREE.Vector3();
  private tmpEyePos = new THREE.Vector3();
  private tmpWallRayDir = new THREE.Vector3();
  private tmpOtherBodies: Array<{ x: number; y: number; z: number }> = [];

  private settings: GameSettings = {
    map: 'factory',
    mode: 'tactical',
    difficulty: 'tactical',
    character: (localStorage.getItem('skyfall_character') as CharacterId) || 'shadow',
    sensitivity: 1.0,
    volume: 0.75,
    crosshairColor: '#ffffff',
  };

  private matchStarted = false;
  private paused = true;
  private roundActive = false;
  private roundNumber = 1;
  private roundTimer = ROUND_DURATION;
  private roundEndDelay = 0;
  private allyScore = 0;
  private enemyScore = 0;
  private waveNumber = 1;
  private skirmishRespawnQueue: number[] = [];

  private playerKills = 0;
  private playerHeadshots = 0;
  private playerDeaths = 0;
  private playerScore = 0;
  private roundKillStreak = 0;

  private fireHeld = false;
  private fireJustPressed = false;
  private adsHeld = false;

  private lastFrameTime = performance.now();
  private lastRenderTime = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;
  private spottingTimer = 0;
  private bloomEnabled = true; // Half-res selective HDR bloom on by default for vibrant glowing atmosphere at 60 FPS!
  private readonly targetFrameMs = 1000 / 60 - 1.5; // Smooth 60 FPS cap without skipping 60Hz vblanks!

  private menuOverlay = document.getElementById('menu-overlay')!;
  private tdmOverlay = document.getElementById('tdm-lobby-overlay')!;
  private tdmEntryView = document.getElementById('tdm-entry-view')!;
  private tdmRoomView = document.getElementById('tdm-room-view')!;
  private tdmErrorEl = document.getElementById('tdm-error')!;
  private matchEndOverlay = document.getElementById('match-end-overlay')!;
  private btnDeploy = document.getElementById('btn-deploy')!;
  private btnDeployLabel = document.getElementById('btn-deploy-label')!;
  private btnRestart = document.getElementById('btn-restart')!;

  constructor() {
    // 1. Honor saved graphics preset (or auto-detect integrated laptop GPU) BEFORE allocating heavy VRAM!
    const savedGfx = localStorage.getItem('skyfall_gfx') as 'bloom' | 'perf' | 'laptop' | null;
    if (savedGfx === 'bloom' || savedGfx === 'perf' || savedGfx === 'laptop') {
      this.graphicsPreset = savedGfx;
      this.userPickedGraphics = true;
    }

    const initLowEnd = this.graphicsPreset === 'laptop';
    const dprCap = this.graphicsPreset === 'bloom' ? 1.65 : this.graphicsPreset === 'perf' ? 1.0 : 0.72;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !initLowEnd,
      powerPreference: initLowEnd ? 'low-power' : 'high-performance',
    });

    // If user hasn't manually picked a preset yet, detect integrated/software laptop GPUs right now BEFORE bloom/PMREM!
    if (!this.userPickedGraphics && this.detectIntegratedGpu()) {
      const cores = navigator.hardwareConcurrency || 4;
      this.graphicsPreset = cores <= 4 ? 'laptop' : 'perf';
    }
    const finalLowEnd = this.graphicsPreset === 'laptop';
    this.bloomEnabled = this.graphicsPreset === 'bloom';
    const finalDprCap = this.graphicsPreset === 'bloom' ? 1.65 : this.graphicsPreset === 'perf' ? 1.0 : 0.72;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, finalDprCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !finalLowEnd;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // 2. Scene, Camera & Lazy PMREM Environments (skipped completely in LOW END DEVICE mode to save laptop VRAM!)
    this.scene = new THREE.Scene();
    if (!finalLowEnd) {
      this.ensureEnvTextures();
    }
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 750);
    this.scene.add(this.camera);

    // 3. Only allocate Half-Float MSAA Bloom EffectComposer when BLOOM ULTRA is actually active!
    if (this.bloomEnabled) {
      this.setupPostProcessing();
    }

    // 4. Build Active Arena Map (FACTORY CRYZEN default)
    this.textures = createTextureLibrary();
    this.applyMapAtmosphereConfig(this.settings.map);
    const builder = new LevelBuilder(this.textures);
    this.level = builder.build(this.scene, this.settings.map, false, finalLowEnd);
    this.applyPresetToActiveScene();

    // 5. Core gameplay subsystems
    this.player = new PlayerController(this.sound);
    this.weapons = new WeaponSystem(this.scene, this.camera, this.sound, this.textures);
    this.abilities = new AbilitySystem(this.scene, this.sound);

    const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimap = new Minimap(mmCanvas, this.level.minimapRects, this.level.mapBounds);

    // 6. Initialize Hosted Multiplayer Manager & live menu showcase staging
    this.initMultiplayer();
    this.setupShowcaseFrame();

    // 7. Bind UI & controls
    this.bindMenuUI();
    this.bindTdmLobbyUI();
    this.bindInputs();

    // Sync active graphics pill highlight in UI
    document.querySelectorAll<HTMLButtonElement>('[data-gfx]').forEach((b) => {
      b.classList.toggle('active', b.dataset.gfx === this.graphicsPreset);
    });

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer?.setSize(w, h);
      this.bloomPass?.resolution.set(Math.floor(w * 0.5), Math.floor(h * 0.5));
    });

    requestAnimationFrame(this.loop);
  }

  private ensureEnvTextures(): void {
    if (!this.envFactory) this.envFactory = buildDaylightEnvironment(this.renderer);
    if (!this.envFoundry) this.envFoundry = buildIndustrialEnvironment(this.renderer);
  }

  private detectIntegratedGpu(): boolean {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const raw = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      const r = raw.toLowerCase();
      if (!r) return false;
      // Dedicated desktop/gaming GPUs & Apple Silicon stay in full Bloom mode
      if (/(rtx|gtx|radeon rx|geforce|quadro|arc a|apple m[1-9])/i.test(r)) {
        return false;
      }
      // Laptops with integrated graphics or software renderers get instant 60 FPS pipeline
      return /(intel|uhd|iris|hd graphics|swiftshader|microsoft basic|llvmpipe|mesa|radeon\(tm\) graphics|vega)/i.test(
        r
      );
    } catch {
      return false;
    }
  }

  private applyGraphicsPreset(preset: 'bloom' | 'perf' | 'laptop', saveChoice = false): void {
    const prevLowEnd = this.graphicsPreset === 'laptop';
    this.graphicsPreset = preset;
    if (saveChoice) {
      localStorage.setItem('skyfall_gfx', preset);
    }
    this.bloomEnabled = preset === 'bloom';
    const isLowEnd = preset === 'laptop';
    const dprCap = preset === 'bloom' ? 1.65 : preset === 'perf' ? 1.0 : 0.72;
    const dpr = Math.min(window.devicePixelRatio, dprCap);
    this.renderer.setPixelRatio(dpr);

    if (this.bloomEnabled && !this.composer) {
      this.setupPostProcessing();
    } else if (isLowEnd && this.composer) {
      // Immediately release heavy Half-Float MSAA bloom framebuffer when switching to LOW END DEVICE!
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    } else if (this.composer) {
      this.composer.setPixelRatio(dpr);
    }

    if (!isLowEnd) {
      this.ensureEnvTextures();
    }

    const wantShadows = preset !== 'laptop';
    if (this.renderer.shadowMap.enabled !== wantShadows) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.renderer.shadowMap.needsUpdate = true;
    }

    // If currently on Downtown and toggling LOW END DEVICE on/off, swap cleanly between low/full city GLB!
    if (prevLowEnd !== isLowEnd && this.settings.map === 'downtown' && this.levelIsTdmExpanded) {
      this.applyMapAtmosphereConfig('downtown');
      if (this.level?.group) this.scene.remove(this.level.group);
      const builder = new LevelBuilder(this.textures);
      this.level = builder.build(this.scene, 'downtown', true, isLowEnd);
    }

    this.applyPresetToActiveScene();

    document.querySelectorAll<HTMLButtonElement>('[data-gfx]').forEach((b) => {
      b.classList.toggle('active', b.dataset.gfx === preset);
    });
  }

  /**
   * Keeps the exact same vibrant look while eliminating heavy per-pixel PointLight loops,
   * PMREM IBL cube-map fetches & far particle overdraw in LOW END DEVICE mode!
   */
  private applyPresetToActiveScene(): void {
    const isLowEnd = this.graphicsPreset === 'laptop';
    const isFactory = this.settings.map === 'factory';
    const isDowntown = this.settings.map === 'downtown';

    // Disable heavy PMREM cube-map reflections on LOW END DEVICE; compensate brightness cleanly
    this.scene.environment = isLowEnd ? null : isFactory ? this.envFactory : this.envFoundry;
    this.renderer.toneMappingExposure = isLowEnd
      ? isFactory
        ? 1.24
        : isDowntown
        ? 1.28
        : 1.38
      : isFactory
      ? 1.15
      : isDowntown
      ? 1.18
      : 1.24;

    if (!this.level?.group) return;
    this.level.group.traverse((obj) => {
      if (obj instanceof THREE.HemisphereLight) {
        if (obj.userData.baseIntensity === undefined) {
          obj.userData.baseIntensity = obj.intensity;
        }
        obj.intensity = isLowEnd
          ? obj.userData.baseIntensity * (isFactory ? 1.32 : isDowntown ? 1.38 : 1.48)
          : obj.userData.baseIntensity;
      } else if (obj.userData?.lowEndOptional || obj instanceof THREE.PointLight) {
        obj.visible = !isLowEnd;
      }
    });
  }

  private setupPostProcessing(): void {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio, 1.65);
      const maxSamples = this.renderer.capabilities.isWebGL2
        ? Math.min(4, this.renderer.capabilities.maxSamples || 2)
        : 0;
      // Multi-sampled MSAA render target capped at 4x so laptop WebGL2 drivers never OOM!
      const rt = new THREE.WebGLRenderTarget(Math.floor(w * dpr), Math.floor(h * dpr), {
        type: THREE.HalfFloatType,
        samples: maxSamples,
      });
      const composer = new EffectComposer(this.renderer, rt);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);

      const renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.floor(w * 0.5), Math.floor(h * 0.5)),
        0.42, // vibrant glowing neon, turbine, fires & embers without washing out targets
        0.48,
        0.8
      );
      composer.addPass(bloomPass);

      const outputPass = new OutputPass();
      composer.addPass(outputPass);

      this.composer = composer;
      this.bloomPass = bloomPass;
    } catch {
      this.composer = null;
      this.bloomPass = null;
    }
  }

  private applyMapAtmosphereConfig(mapId: MapId): void {
    const isFactory = mapId === 'factory';
    const isDowntown = mapId === 'downtown';
    this.scene.environment =
      this.graphicsPreset === 'laptop' ? null : isFactory ? this.envFactory : this.envFoundry;
    this.renderer.toneMappingExposure = isFactory ? 1.15 : isDowntown ? 1.2 : 1.24;
    if (this.bloomPass) {
      // Selective HDR Bloom tuned per map: crisp sunlit Vikendi, neon-cyberpunk Midtown Manhattan, glowing Warehouse!
      this.bloomPass.threshold = isFactory ? 1.18 : isDowntown ? 0.86 : 0.8;
      this.bloomPass.strength = isFactory ? 0.35 : isDowntown ? 0.44 : 0.42;
      this.bloomPass.radius = isFactory ? 0.44 : isDowntown ? 0.56 : 0.48;
    }
    const brandTag = document.getElementById('brand-tag');
    if (brandTag) {
      brandTag.textContent = isFactory
        ? 'VIKENDI // SNOW COMPOUND'
        : isDowntown
        ? 'DOWNTOWN // MIDTOWN MANHATTAN'
        : 'WAREHOUSE // NIGHT SHIFT';
    }
    if (!this.matchStarted) {
      this.btnDeployLabel.textContent = isFactory ? 'DEPLOY TO VIKENDI' : 'DEPLOY TO WAREHOUSE';
    }
  }

  private switchMap(mapId: MapId, forceRebuild = false): void {
    if (this.isTdmMatch) return;
    if (!forceRebuild && this.settings.map === mapId && !this.levelIsTdmExpanded) return;
    this.settings.map = mapId;
    this.levelIsTdmExpanded = false;
    this.scene.remove(this.level.group);
    this.weapons.clearRoundFx();
    this.abilities.resetCharges();

    this.applyMapAtmosphereConfig(mapId);
    const builder = new LevelBuilder(this.textures);
    this.level = builder.build(this.scene, mapId, false, this.graphicsPreset === 'laptop');
    this.applyPresetToActiveScene();

    const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimap = new Minimap(mmCanvas, this.level.minimapRects, this.level.mapBounds);

    if (this.matchStarted) {
      this.matchStarted = false;
      this.roundActive = false;
      this.btnDeployLabel.textContent = mapId === 'factory' ? 'DEPLOY TO VIKENDI' : 'DEPLOY TO WAREHOUSE';
      this.btnRestart.classList.add('hidden');
    }
    this.setupShowcaseFrame();
  }

  private setupShowcaseFrame(): void {
    this.player.reset(this.level.playerSpawn.pos, this.level.playerSpawn.yaw);
    this.weapons.setCharacterTheme(this.settings.character, 'ally');
    this.weapons.resetAll();
    this.spawnAgentsForRound(true);
    this.camera.position.set(
      this.level.playerSpawn.pos.x,
      this.level.playerSpawn.pos.y + 1.66,
      this.level.playerSpawn.pos.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(-0.02, this.level.playerSpawn.yaw, 0);
  }

  private bindMenuUI(): void {
    document.querySelectorAll<HTMLButtonElement>('#map-pills .pill[data-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#map-pills .pill[data-map]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchMap(btn.dataset.map as MapId);
      });
    });

    document.getElementById('btn-open-tdm')?.addEventListener('click', () => {
      this.sound.unlock();
      this.sound.setVolume(this.settings.volume);
      this.openTdmLobbyOverlay();
    });

    document.querySelectorAll<HTMLButtonElement>('#mode-list .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-list .mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.mode = btn.dataset.mode as GameMode;
        if (this.matchStarted) {
          this.matchStarted = false;
          this.btnDeployLabel.textContent =
            this.settings.map === 'factory' ? 'DEPLOY TO VIKENDI' : 'DEPLOY TO WAREHOUSE';
          this.btnRestart.classList.add('hidden');
        }
        this.spawnAgentsForRound(true);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('#difficulty-pills .pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#difficulty-pills .pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.difficulty = btn.dataset.diff as Difficulty;
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-gfx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.userPickedGraphics = true;
        const preset = (btn.dataset.gfx as 'bloom' | 'perf' | 'laptop') || 'perf';
        this.applyGraphicsPreset(preset, true);
      });
    });

    const syncCharUi = (charId: CharacterId) => {
      document.querySelectorAll<HTMLButtonElement>('[data-char]').forEach((b) => {
        b.classList.toggle('active', b.dataset.char === charId);
      });
    };
    syncCharUi(this.settings.character);
    this.weapons.setCharacterTheme(this.settings.character);
    void ensureCharacterLoaded(this.settings.character);

    document.querySelectorAll<HTMLButtonElement>('[data-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const charId = (btn.dataset.char as CharacterId) || 'shadow';
        this.settings.character = charId;
        localStorage.setItem('skyfall_character', charId);
        syncCharUi(charId);
        this.weapons.setCharacterTheme(charId);
        void ensureCharacterLoaded(charId);
        if (this.mp.connected && this.mp.lobbyState && !this.mp.lobbyState.inMatch) {
          this.mp.setCharacter(charId);
        }
      });
    });

    document.querySelectorAll<HTMLButtonElement>('#crosshair-colors .swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#crosshair-colors .swatch').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const col = btn.dataset.color || '#00ffbf';
        this.settings.crosshairColor = col;
        this.hud.setCrosshairColor(col);
      });
    });

    const sensInput = document.getElementById('opt-sens') as HTMLInputElement;
    const sensVal = document.getElementById('val-sens')!;
    sensInput.addEventListener('input', () => {
      const v = parseFloat(sensInput.value);
      this.settings.sensitivity = v;
      this.player.sensitivity = v;
      sensVal.textContent = v.toFixed(2);
    });

    const volInput = document.getElementById('opt-vol') as HTMLInputElement;
    const volVal = document.getElementById('val-vol')!;
    volInput.addEventListener('input', () => {
      const v = parseFloat(volInput.value);
      this.settings.volume = v;
      this.sound.setVolume(v);
      volVal.textContent = `${Math.round(v * 100)}%`;
    });

    this.btnDeploy.addEventListener('click', () => {
      this.sound.unlock();
      this.sound.setVolume(this.settings.volume);
      if (this.isTdmMatch) {
        this.resumeGame();
      } else if (!this.matchStarted) {
        this.startNewMatch();
      } else {
        this.resumeGame();
      }
    });

    this.btnRestart.addEventListener('click', () => {
      this.sound.unlock();
      if (this.isTdmMatch) {
        this.exitTdmMatchToMenu();
      } else {
        this.startNewMatch();
      }
    });

    document.getElementById('btn-play-again')!.addEventListener('click', () => {
      this.matchEndOverlay.classList.add('hidden');
      if (this.isTdmMatch && this.mp.connected) {
        if (this.mp.isHost) {
          this.mp.broadcastReturnToLobby();
        } else {
          this.showTdmLobbyRoom();
        }
      } else {
        this.startNewMatch();
      }
    });

    document.getElementById('btn-back-menu')!.addEventListener('click', () => {
      this.matchEndOverlay.classList.add('hidden');
      if (this.isTdmMatch) {
        this.exitTdmMatchToMenu();
        return;
      }
      this.matchStarted = false;
      this.paused = true;
      this.roundActive = false;
      this.hud.setVisible(false);
      this.menuOverlay.classList.remove('hidden');
      this.btnDeployLabel.textContent =
        this.settings.map === 'factory' ? 'DEPLOY TO VIKENDI' : 'DEPLOY TO WAREHOUSE';
      this.btnRestart.classList.add('hidden');
    });
  }

  private bindInputs(): void {
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.matchStarted && !this.paused && this.matchEndOverlay.classList.contains('hidden')) {
        this.pauseGame();
      }
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      this.sound.unlock();
      if (document.pointerLockElement !== this.renderer.domElement) {
        Promise.resolve(this.renderer.domElement.requestPointerLock?.()).catch(() => {});
      }
      if (e.button === 0) {
        // BGMI-style: pressing Fire immediately stops applying Bandage/Medkit (restarts fresh when B/M pressed again!)
        if (this.activeHeal) {
          this.cancelActiveHeal(true);
        }
        this.fireHeld = true;
        this.fireJustPressed = true;
      } else if (e.button === 2) {
        if (this.activeHeal) {
          this.cancelActiveHeal(false);
        }
        this.adsHeld = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.adsHeld = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (!this.paused) e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.paused) return;
      if (document.pointerLockElement !== this.renderer.domElement) return;
      const adsScale = this.weapons.isAds ? 0.65 : 1.0;
      this.player.onMouseMove(e.movementX, e.movementY, adsScale);
      this.weapons.addSway(e.movementX, e.movementY);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.matchStarted) {
        if (!this.paused) this.pauseGame();
        return;
      }
      if (this.paused) return;

      this.player.onKeyDown(e.code);

      if (!this.player.alive) return;

      if (e.code === 'Digit1') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        this.weapons.selectSlot(0);
      } else if (e.code === 'Digit2') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        this.weapons.selectSlot(1);
      } else if (e.code === 'Digit3') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        this.weapons.selectSlot(2);
      } else if (e.code === 'Digit4') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        this.weapons.selectSlot(3);
      } else if (e.code === 'KeyR') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        this.weapons.startReload();
      } else if (e.code === 'KeyB' && this.isTdmMatch && this.roundActive) {
        this.startTdmHeal('bandage');
      } else if (e.code === 'KeyM' && this.isTdmMatch && this.roundActive) {
        this.startTdmHeal('medkit');
      } else if (e.code === 'KeyF' && this.isTdmMatch && this.nearestLootId) {
        this.mp.requestLootPickup(this.nearestLootId);
      } else if (e.code === 'KeyQ') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        const origin = this.player.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const thrown = this.abilities.throwFlash(origin, dir, this.mp.localPlayerId);
        if (thrown && this.isTdmMatch) {
          if (this.mp.isHost) this.decrementHostUtil(this.mp.localPlayerId, 'flash');
          this.mp.sendOrdnanceThrow({
            ownerId: this.mp.localPlayerId,
            kind: 'flash',
            origin: { x: origin.x, y: origin.y, z: origin.z },
            dir: { x: dir.x, y: dir.y, z: dir.z },
          });
        }
      } else if (e.code === 'KeyE') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        const origin = this.player.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const thrown = this.abilities.throwSmoke(origin, dir, this.mp.localPlayerId);
        if (thrown && this.isTdmMatch) {
          if (this.mp.isHost) this.decrementHostUtil(this.mp.localPlayerId, 'smoke');
          this.mp.sendOrdnanceThrow({
            ownerId: this.mp.localPlayerId,
            kind: 'smoke',
            origin: { x: origin.x, y: origin.y, z: origin.z },
            dir: { x: dir.x, y: dir.y, z: dir.z },
          });
        }
      } else if (e.code === 'KeyC') {
        if (this.activeHeal) this.cancelActiveHeal(false);
        const origin = this.player.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const thrown = this.abilities.throwFrag(origin, dir, this.mp.localPlayerId);
        if (thrown && this.isTdmMatch) {
          if (this.mp.isHost) this.decrementHostUtil(this.mp.localPlayerId, 'frag');
          this.mp.sendOrdnanceThrow({
            ownerId: this.mp.localPlayerId,
            kind: 'frag',
            origin: { x: origin.x, y: origin.y, z: origin.z },
            dir: { x: dir.x, y: dir.y, z: dir.z },
          });
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.player.onKeyUp(e.code);
    });

    window.addEventListener('wheel', (e) => {
      if (this.paused || !this.player.alive) return;
      if (Math.abs(e.deltaY) > 2) {
        if (this.activeHeal) this.cancelActiveHeal(false);
        this.weapons.cycleSlot(e.deltaY);
      }
    });
  }

  private startNewMatch(): void {
    this.isTdmMatch = false;
    if (this.levelIsTdmExpanded) {
      this.switchMap(this.settings.map, true);
    }
    this.activeHeal = null;
    this.localSpawnShield = 0;
    this.tdmBandages = 0;
    this.tdmMedkits = 0;
    this.clearLootDrops();
    this.hud.setTdmMedSlotsVisible(false);
    this.hud.updateHealProgress(null, 0, 1);
    this.hud.updateSpawnShield(0, TDM_SPAWN_SHIELD_DURATION);

    this.matchStarted = true;
    this.roundNumber = 1;
    this.allyScore = 0;
    this.enemyScore = 0;
    this.waveNumber = 1;
    this.playerKills = 0;
    this.playerHeadshots = 0;
    this.playerDeaths = 0;
    this.playerScore = 0;
    this.skirmishRespawnQueue = [];
    this.hud.clearKillfeed();

    this.startRound();
    this.resumeGame();
  }

  private recordPlayerDamage(attacker: string, amount: number, weapon: string, killed: boolean): void {
    const prev = this.roundDamageHistory.get(attacker);
    if (prev) {
      prev.totalDamage += amount;
      prev.hits += 1;
      if (killed) prev.isKiller = true;
    } else {
      this.roundDamageHistory.set(attacker, {
        attacker,
        totalDamage: amount,
        hits: 1,
        weapon,
        isKiller: killed,
      });
    }
    if (killed) {
      const entries = [...this.roundDamageHistory.values()].sort((a, b) =>
        a.isKiller ? -1 : b.isKiller ? 1 : b.totalDamage - a.totalDamage
      );
      this.hud.showDamageHistory(entries);
    }
  }

  private startRound(): void {
    this.roundActive = true;
    this.roundEndDelay = 0;
    this.roundTimer = this.settings.mode === 'skirmish' ? 180 : ROUND_DURATION;
    this.roundKillStreak = 0;
    this.roundDamageHistory.clear();
    this.hud.hideDamageHistory();

    this.player.reset(this.level.playerSpawn.pos, this.level.playerSpawn.yaw);
    this.weapons.setCharacterTheme(this.settings.character, 'ally');
    this.weapons.resetAll();
    this.weapons.clearRoundFx();
    this.abilities.resetCharges();
    this.spawnAgentsForRound(false);

    const mapTitle =
      this.settings.map === 'factory'
        ? 'VIKENDI'
        : this.settings.map === 'downtown'
        ? 'DOWNTOWN MANHATTAN'
        : 'WAREHOUSE';
    if (this.settings.mode === 'skirmish') {
      this.hud.showBanner('ENDLESS SKIRMISH', `HOLD ${mapTitle}`, 2.2);
    } else {
      const sub = this.settings.mode === 'tactical' ? `${mapTitle} // 3v5` : `${mapTitle} // 1v5`;
      this.hud.showBanner(sub, `ROUND ${this.roundNumber}`, 2.1);
    }
  }

  private spawnAgentsForRound(showcaseOnly: boolean): void {
    for (const a of this.agents) {
      a.dispose(this.scene);
    }
    this.agents = [];

    if (this.settings.mode === 'tactical') {
      this.level.allySpawns.forEach((sp, idx) => {
        const ally = new TacticalAgent(
          `ally-${idx}-${sp.name.toLowerCase()}`,
          sp.name,
          'ally',
          sp.role,
          sp.pos,
          sp.yaw,
          this.scene,
          this.textures
        );
        ally.respawn(sp.pos, sp.yaw, showcaseOnly ? 99 : 1.15);
        this.agents.push(ally);
      });
    }

    // Enemies in Vikendi & Warehouse ALWAYS use the default CoD Modern Warfare Shadow Company character!
    this.level.enemySpawns.forEach((sp, idx) => {
      const enemyChar: CharacterId | undefined =
        this.settings.map === 'factory' || this.settings.map === 'foundry' ? 'shadow' : undefined;
      const enemy = new TacticalAgent(
        `enemy-${idx}`,
        sp.name,
        'enemy',
        sp.role,
        sp.pos,
        sp.yaw,
        this.scene,
        this.textures,
        enemyChar
      );
      const hold = idx === 0 ? (showcaseOnly ? 99 : 2.6) : 0.4 + idx * 0.3;
      enemy.respawn(sp.pos, sp.yaw, hold);
      this.agents.push(enemy);
    });
  }

  private resumeGame(): void {
    this.paused = false;
    this.menuOverlay.classList.add('hidden');
    this.tdmOverlay.classList.add('hidden');
    this.hud.setVisible(true);
    this.btnDeployLabel.textContent = this.isTdmMatch ? 'RESUME TDM MATCH' : 'RESUME OPERATION';
    this.btnRestart.textContent = this.isTdmMatch ? 'LEAVE TDM MATCH' : 'RESTART MATCH';
    this.btnRestart.classList.remove('hidden');
    Promise.resolve(this.renderer.domElement.requestPointerLock?.()).catch(() => {});
  }

  private pauseGame(): void {
    this.paused = true;
    this.fireHeld = false;
    this.adsHeld = false;
    this.player.clearKeys();
    this.menuOverlay.classList.remove('hidden');
    this.hud.setVisible(false);
    this.btnDeployLabel.textContent = this.isTdmMatch ? 'RESUME TDM MATCH' : 'RESUME OPERATION';
    this.btnRestart.textContent = this.isTdmMatch ? 'LEAVE TDM MATCH' : 'RESTART MATCH';
    this.btnRestart.classList.remove('hidden');
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
  }

  // =========================================================================
  // TEAM DEATH MATCH — HOSTED LOBBY & ONLINE MULTIPLAYER (1v1 TO 3v3)
  // =========================================================================
  private initMultiplayer(): void {
    this.mp = new MultiplayerManager({
      onLobbyState: (state) => {
        this.setTdmJoinButtonBusy(false);
        this.hideTdmError();
        this.showTdmLobbyRoom();
        this.renderTdmLobby(state);
        if (!this.isTdmMatch && (state.map !== this.settings.map || !this.levelIsTdmExpanded)) {
          this.switchMapForTdm(state.map);
        }
      },
      onStatus: (text, ready) => {
        const dot = document.getElementById('tdm-status-dot');
        const txt = document.getElementById('tdm-status-text');
        if (txt) txt.textContent = text;
        if (dot) dot.classList.toggle('ready', ready);
        // Also mirror live connection progress directly below the JOIN LOBBY button while still on the entry view!
        if (!this.mp.connected && !this.tdmEntryView.classList.contains('hidden')) {
          this.showTdmJoinFeedback(text, false);
        }
      },
      onError: (msg) => {
        this.setTdmJoinButtonBusy(false);
        this.showTdmError(msg);
      },
      onMatchStart: (state, round) => {
        this.startTdmMatchClient(state, round);
      },
      onRoundStart: (round) => {
        this.applyTdmRoundStart(round);
      },
      onRoundEnd: (data) => {
        this.applyTdmRoundEnd(data);
      },
      onMatchEnd: (data) => {
        this.applyTdmMatchEnd(data);
      },
      onReturnToLobby: (state) => {
        this.isTdmMatch = false;
        this.matchStarted = false;
        this.roundActive = false;
        this.paused = true;
        this.fireHeld = false;
        this.adsHeld = false;
        this.activeHeal = null;
        this.player.clearKeys();
        this.clearRemotePlayers();
        this.clearLootDrops();
        this.hud.setTdmMedSlotsVisible(false);
        this.hud.setVisible(false);
        this.matchEndOverlay.classList.add('hidden');
        this.menuOverlay.classList.add('hidden');
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock?.();
        }
        this.showTdmLobbyRoom();
        this.renderTdmLobby(state);
      },
      onSnapshot: (snapshot) => {
        this.applyTdmWorldSnapshot(snapshot);
      },
      onClientPose: (playerId, pose) => {
        this.applyHostClientPose(playerId, pose);
      },
      onHostShotReceived: (shot) => {
        this.handleHostShotReceived(shot);
      },
      onShotFx: (shot) => {
        this.playRemoteShotFx(shot);
      },
      onOrdnance: (data) => {
        if (!this.isTdmMatch) return;
        if (this.mp.isHost) {
          this.decrementHostUtil(data.ownerId, data.kind);
        }
        if (data.ownerId === this.mp.localPlayerId) return;
        this.abilities.spawnRemoteThrow(
          data.kind,
          new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z),
          new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z),
          data.ownerId
        );
      },
      onDamage: (data) => {
        this.applyTdmDamageEvent(data);
      },
      onKill: (data) => {
        this.applyTdmKillEvent(data);
      },
      onHostHealReceived: (data) => {
        this.handleHostHealReceived(data);
      },
      onLootSpawn: (data) => {
        this.spawnLootDropVisual(data);
      },
      onHostLootPickupReq: (dropId, pickerId) => {
        this.handleHostLootPickupReq(dropId, pickerId);
      },
      onLootPicked: (data) => {
        this.applyLootPickedEvent(data);
      },
      onPlayerDisconnected: (playerId, name) => {
        const rp = this.remotePlayers.get(playerId);
        if (rp) {
          rp.dispose(this.scene);
          this.remotePlayers.delete(playerId);
        }
        this.hostLivePlayers.delete(playerId);
        this.hostPlayerUtils.delete(playerId);
        if (this.isTdmMatch) {
          this.hud.showBanner(`${name} DISCONNECTED`, 'PLAYER LEFT', 2.0);
          if (this.mp.isHost && this.mp.lobbyState) {
            const blueLeft = this.mp.lobbyState.players.filter((p) => p.team === 'blue').length;
            const redLeft = this.mp.lobbyState.players.filter((p) => p.team === 'red').length;
            if (blueLeft === 0 || redLeft === 0) {
              this.mp.broadcastReturnToLobby();
              this.showTdmError(`${name} left — match returned to lobby.`);
            }
          }
        }
      },
      onHostDisconnected: () => {
        const wasInMatch = this.isTdmMatch;
        this.isTdmMatch = false;
        this.matchStarted = false;
        this.roundActive = false;
        this.paused = true;
        this.fireHeld = false;
        this.adsHeld = false;
        this.activeHeal = null;
        this.player.clearKeys();
        this.clearRemotePlayers();
        this.clearLootDrops();
        this.hud.setTdmMedSlotsVisible(false);
        this.hud.setVisible(false);
        this.matchEndOverlay.classList.add('hidden');
        this.menuOverlay.classList.add('hidden');
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock?.();
        }
        this.tdmOverlay.classList.remove('hidden');
        this.tdmEntryView.classList.remove('hidden');
        this.tdmRoomView.classList.add('hidden');
        this.showTdmError(wasInMatch ? 'Host disconnected. Match ended.' : 'Host closed the lobby.');
      },
    });
  }

  private bindTdmLobbyUI(): void {
    const nameInput = document.getElementById('tdm-player-name') as HTMLInputElement;
    const codeInput = document.getElementById('tdm-join-code') as HTMLInputElement;

    const savedName = localStorage.getItem('skyfall_tdm_name') || localStorage.getItem('sunfire_tdm_name');
    if (savedName) {
      nameInput.value = savedName;
    }

    nameInput.addEventListener('input', () => {
      this.hideTdmError();
      const cleaned = sanitizePlayerName(nameInput.value);
      if (cleaned) localStorage.setItem('skyfall_tdm_name', cleaned);
    });

    codeInput.addEventListener('input', () => {
      this.hideTdmError();
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    });

    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btn-tdm-join')?.click();
      }
    });

    document.querySelectorAll<HTMLButtonElement>('#tdm-host-map-pills .pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#tdm-host-map-pills .pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.tdmHostSelectedMap = btn.dataset.tdmHostMap as MapId;
      });
    });

    document.getElementById('btn-tdm-host')!.addEventListener('click', () => {
      this.sound.unlock();
      this.hideTdmError();
      const clean = sanitizePlayerName(nameInput.value);
      if (clean) localStorage.setItem('skyfall_tdm_name', clean);
      const ok = this.mp.hostLobby(nameInput.value, this.tdmHostSelectedMap, this.settings.character);
      if (!ok) {
        const shell = this.tdmOverlay.querySelector('.tdm-shell');
        if (shell) shell.scrollTop = 0;
        nameInput.focus();
      }
    });

    document.getElementById('btn-tdm-join')!.addEventListener('click', () => {
      this.sound.unlock();
      this.hideTdmError();
      const clean = sanitizePlayerName(nameInput.value);
      if (clean) localStorage.setItem('skyfall_tdm_name', clean);
      const started = this.mp.joinLobby(nameInput.value, codeInput.value, this.settings.character);
      if (started && !this.mp.connected) {
        this.setTdmJoinButtonBusy(true);
      } else if (!started && !clean) {
        nameInput.focus();
      } else if (!started) {
        codeInput.focus();
      }
    });

    document.getElementById('btn-tdm-copy')!.addEventListener('click', () => {
      const code = this.mp.lobbyState?.code;
      if (!code) return;
      navigator.clipboard?.writeText(code).catch(() => {});
      const copyBtn = document.getElementById('btn-tdm-copy')!;
      copyBtn.textContent = 'COPIED!';
      setTimeout(() => {
        copyBtn.textContent = 'COPY';
      }, 1500);
    });

    document.querySelectorAll<HTMLButtonElement>('#tdm-room-map-pills .pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.mp.isHost) return;
        const mapId = btn.dataset.tdmRoomMap as MapId;
        this.mp.setMap(mapId);
      });
    });

    document.getElementById('btn-tdm-join-blue')!.addEventListener('click', () => {
      this.mp.switchTeam('blue');
    });

    document.getElementById('btn-tdm-join-red')!.addEventListener('click', () => {
      this.mp.switchTeam('red');
    });

    document.getElementById('btn-tdm-start')!.addEventListener('click', () => {
      if (!this.mp.isHost || !this.mp.lobbyState) return;
      const check = this.mp.canStartMatch();
      if (!check.ok) {
        this.showTdmError(check.reason);
        return;
      }
      this.sound.unlock();
      this.sound.setVolume(this.settings.volume);
      this.switchMapForTdm(this.mp.lobbyState.map);
      this.allyScore = 0;
      this.enemyScore = 0;
      this.roundNumber = 1;
      const roundPayload = this.buildTdmRoundStartPayload(1, 0, 0);
      this.mp.broadcastMatchStart(roundPayload);
    });

    const closeLobby = () => {
      this.setTdmJoinButtonBusy(false);
      this.mp.leaveLobby(true);
      this.isTdmMatch = false;
      this.clearRemotePlayers();
      this.clearLootDrops();
      this.tdmOverlay.classList.add('hidden');
      this.menuOverlay.classList.remove('hidden');
      this.hideTdmError();
      if (this.levelIsTdmExpanded) {
        const soloMap: MapId = this.settings.map === 'downtown' ? 'factory' : this.settings.map;
        this.switchMap(soloMap, true);
      } else {
        this.setupShowcaseFrame();
      }
    };

    document.getElementById('btn-tdm-leave')!.addEventListener('click', closeLobby);
    document.getElementById('btn-tdm-close')!.addEventListener('click', closeLobby);
  }

  private openTdmLobbyOverlay(): void {
    if (this.tdmHostSelectedMap === 'downtown') {
      preloadDowntownGlbs(this.graphicsPreset === 'laptop');
    }
    this.setTdmJoinButtonBusy(false);
    this.hideTdmError();
    this.menuOverlay.classList.add('hidden');
    this.matchEndOverlay.classList.add('hidden');
    this.tdmOverlay.classList.remove('hidden');

    if (this.mp.connected && this.mp.lobbyState) {
      this.tdmEntryView.classList.add('hidden');
      this.tdmRoomView.classList.remove('hidden');
      this.renderTdmLobby(this.mp.lobbyState);
    } else {
      this.tdmEntryView.classList.remove('hidden');
      this.tdmRoomView.classList.add('hidden');
      this.tdmHostSelectedMap = this.settings.map;
      document.querySelectorAll<HTMLButtonElement>('#tdm-host-map-pills .pill').forEach((b) => {
        b.classList.toggle('active', b.dataset.tdmHostMap === this.tdmHostSelectedMap);
      });
      const nameInput = document.getElementById('tdm-player-name') as HTMLInputElement | null;
      if (nameInput && !nameInput.value.trim()) {
        nameInput.focus();
      }
    }
  }

  private showTdmLobbyRoom(): void {
    this.tdmOverlay.classList.remove('hidden');
    this.tdmEntryView.classList.add('hidden');
    this.tdmRoomView.classList.remove('hidden');
  }

  private setTdmJoinButtonBusy(busy: boolean): void {
    const btn = document.getElementById('btn-tdm-join') as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('connecting', busy);
    btn.textContent = busy ? 'CONNECTING...' : 'JOIN LOBBY';
    if (!busy) {
      const fb = document.getElementById('tdm-join-feedback');
      if (fb && !fb.classList.contains('error')) {
        fb.classList.add('hidden');
        fb.textContent = '';
      }
    }
  }

  private showTdmJoinFeedback(msg: string, isError: boolean): void {
    const fb = document.getElementById('tdm-join-feedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.classList.toggle('error', isError);
    fb.classList.remove('hidden');
  }

  private showTdmError(msg: string): void {
    this.tdmErrorEl.textContent = msg;
    this.tdmErrorEl.classList.remove('hidden');
    if (!this.tdmEntryView.classList.contains('hidden')) {
      this.showTdmJoinFeedback(msg, true);
    }
  }

  private hideTdmError(): void {
    this.tdmErrorEl.textContent = '';
    this.tdmErrorEl.classList.add('hidden');
    const fb = document.getElementById('tdm-join-feedback');
    if (fb) {
      fb.textContent = '';
      fb.classList.remove('error');
      fb.classList.add('hidden');
    }
  }

  private renderTdmLobby(state: LobbyState): void {
    const codeEl = document.getElementById('tdm-room-code');
    if (codeEl) codeEl.textContent = state.code;

    document.querySelectorAll<HTMLButtonElement>('#tdm-room-map-pills .pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tdmRoomMap === state.map);
      btn.disabled = !this.mp.isHost;
    });

    const bluePlayers = state.players.filter((p) => p.team === 'blue');
    const redPlayers = state.players.filter((p) => p.team === 'red');

    const blueCountEl = document.getElementById('tdm-blue-count');
    const redCountEl = document.getElementById('tdm-red-count');
    if (blueCountEl) blueCountEl.textContent = `${bluePlayers.length} / ${MAX_PLAYERS_PER_TEAM}`;
    if (redCountEl) redCountEl.textContent = `${redPlayers.length} / ${MAX_PLAYERS_PER_TEAM}`;

    const hasBotEmber = state.players.some((pl) => pl.id === BOT_EMBER_ID);
    const renderTeamList = (containerId: string, list: LobbyState['players'], isRedTeam: boolean) => {
      const wrap = document.getElementById(containerId);
      if (!wrap) return;
      wrap.innerHTML = '';
      let addEmberShown = false;
      for (let i = 0; i < MAX_PLAYERS_PER_TEAM; i++) {
        const p = list[i];
        const row = document.createElement('div');
        if (p) {
          const isMe = p.id === this.mp.localPlayerId;
          row.className = `tdm-slot filled${isMe ? ' is-you' : ''}`;
          const nameSpan = document.createElement('span');
          nameSpan.className = 'tdm-slot-name';
          nameSpan.textContent = p.name;
          const badgeWrap = document.createElement('span');
          badgeWrap.className = 'tdm-slot-badges';
          const charId = p.isBot ? 'shadow' : (p.characterId ?? 'shadow');
          const charLabel = CHARACTER_OPTIONS.find((c) => c.id === charId)?.label ?? 'SHADOW';
          const ch = document.createElement('span');
          ch.className = 'tdm-badge char';
          ch.textContent = charLabel;
          badgeWrap.appendChild(ch);
          if (p.isHost) {
            const h = document.createElement('span');
            h.className = 'tdm-badge host';
            h.textContent = 'HOST';
            badgeWrap.appendChild(h);
          }
          if (isMe) {
            const m = document.createElement('span');
            m.className = 'tdm-badge you';
            m.textContent = 'YOU';
            badgeWrap.appendChild(m);
          }
          if (p.isBot) {
            const b = document.createElement('span');
            b.className = 'tdm-badge bot';
            b.textContent = 'BOT';
            badgeWrap.appendChild(b);
            if (this.mp.isHost) {
              const rm = document.createElement('button');
              rm.type = 'button';
              rm.className = 'tdm-remove-bot-btn';
              rm.textContent = 'REMOVE';
              rm.title = 'Remove EMBER from Red Team';
              rm.addEventListener('click', () => this.mp.removeBotEmber());
              badgeWrap.appendChild(rm);
            }
          }
          row.appendChild(nameSpan);
          row.appendChild(badgeWrap);
        } else {
          row.className = 'tdm-slot empty';
          const lbl = document.createElement('span');
          lbl.textContent = `OPEN SLOT ${i + 1}`;
          row.appendChild(lbl);
          if (isRedTeam && this.mp.isHost && !hasBotEmber && !addEmberShown) {
            addEmberShown = true;
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'tdm-add-bot-btn';
            addBtn.textContent = '+ ADD EMBER';
            addBtn.addEventListener('click', () => this.mp.addBotEmber());
            row.appendChild(addBtn);
          }
        }
        wrap.appendChild(row);
      }
    };

    renderTeamList('tdm-blue-slots', bluePlayers, false);
    renderTeamList('tdm-red-slots', redPlayers, true);

    const localP = this.mp.getLocalPlayer();
    const joinBlueBtn = document.getElementById('btn-tdm-join-blue') as HTMLButtonElement | null;
    const joinRedBtn = document.getElementById('btn-tdm-join-red') as HTMLButtonElement | null;
    if (joinBlueBtn) {
      joinBlueBtn.disabled = localP?.team === 'blue' || bluePlayers.length >= MAX_PLAYERS_PER_TEAM;
      joinBlueBtn.textContent = localP?.team === 'blue' ? 'ON BLUE TEAM' : 'JOIN BLUE TEAM';
    }
    if (joinRedBtn) {
      joinRedBtn.disabled = localP?.team === 'red' || redPlayers.length >= MAX_PLAYERS_PER_TEAM;
      joinRedBtn.textContent = localP?.team === 'red' ? 'ON RED TEAM' : 'JOIN RED TEAM';
    }

    const startBtn = document.getElementById('btn-tdm-start') as HTMLButtonElement | null;
    const hintEl = document.getElementById('tdm-ready-hint');
    const check = this.mp.canStartMatch();
    if (hintEl) {
      hintEl.textContent = check.ok
        ? this.mp.isHost
          ? `${check.reason} — PRESS START MATCH`
          : `${check.reason} — WAITING FOR HOST TO START`
        : check.reason;
      hintEl.classList.toggle('ready', check.ok);
    }
    if (startBtn) {
      startBtn.disabled = !this.mp.isHost || !check.ok;
      startBtn.textContent = this.mp.isHost ? 'START MATCH' : 'WAITING FOR HOST';
    }
  }

  private switchMapForTdm(mapId: MapId): void {
    if (this.settings.map === mapId && this.levelIsTdmExpanded) return;
    this.settings.map = mapId;
    this.levelIsTdmExpanded = true;
    this.scene.remove(this.level.group);
    this.weapons.clearRoundFx();
    this.abilities.resetCharges();

    this.applyMapAtmosphereConfig(mapId);
    const builder = new LevelBuilder(this.textures);
    // Build the 3x-expanded 2-floor Team Death Match arena (Vikendi TDM / Warehouse TDM / Downtown)!
    this.level = builder.build(this.scene, mapId, true, this.graphicsPreset === 'laptop');
    this.applyPresetToActiveScene();

    const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimap = new Minimap(mmCanvas, this.level.minimapRects, this.level.mapBounds);

    document.querySelectorAll<HTMLButtonElement>('#map-pills .pill[data-map]').forEach((b) => {
      b.classList.toggle('active', b.dataset.map === mapId);
    });
  }

  private getTeamSpawn(team: LobbyTeam, slotIndex: number): { pos: THREE.Vector3; yaw: number } {
    if (team === 'blue') {
      const slots = [
        this.level.playerSpawn.pos,
        ...this.level.allySpawns.map((s) => s.pos),
      ];
      return {
        pos: slots[slotIndex % slots.length].clone(),
        yaw: this.level.playerSpawn.yaw,
      };
    }
    const redSlots =
      this.level.enemySpawns.length > 0
        ? this.level.enemySpawns.map((s) => s.pos)
        : [new THREE.Vector3(0, 0, -25.5)];
    return {
      pos: redSlots[slotIndex % redSlots.length].clone(),
      yaw: this.level.enemySpawns[0]?.yaw ?? Math.PI,
    };
  }

  private buildTdmRoundStartPayload(
    roundNumber: number,
    blueScore: number,
    redScore: number
  ): RoundStartPayload {
    const spawns: RoundSpawnAssignment[] = [];
    const players = this.mp.lobbyState?.players ?? [];
    for (const p of players) {
      const sp = this.getTeamSpawn(p.team, p.slotIndex);
      spawns.push({
        id: p.id,
        pos: { x: sp.pos.x, y: sp.pos.y, z: sp.pos.z },
        yaw: sp.yaw,
      });
    }
    return {
      roundNumber,
      roundTimer: TDM_ROUND_DURATION,
      blueScore,
      redScore,
      spawns,
    };
  }

  private clearRemotePlayers(): void {
    for (const rp of this.remotePlayers.values()) {
      rp.dispose(this.scene);
    }
    this.remotePlayers.clear();
    this.hostLivePlayers.clear();
  }

  private startTdmMatchClient(state: LobbyState, round: RoundStartPayload): void {
    this.switchMapForTdm(state.map);

    // Clear all solo AI agents so TDM is pure human-vs-human PvP!
    for (const a of this.agents) {
      a.dispose(this.scene);
    }
    this.agents = [];
    this.clearRemotePlayers();

    this.isTdmMatch = true;
    this.matchStarted = true;
    this.playerKills = 0;
    this.playerHeadshots = 0;
    this.playerDeaths = 0;
    this.playerScore = 0;
    this.hud.clearKillfeed();

    const localP = state.players.find((p) => p.id === this.mp.localPlayerId);
    this.tdmLocalTeam = localP?.team ?? 'blue';
    this.weapons.setCharacterTheme(
      localP?.characterId ?? this.settings.character,
      this.tdmLocalTeam === 'red' ? 'enemy' : 'ally'
    );

    // Spawn 3rd-person rigged avatars for EVERY other player (EMBER bot is ALWAYS default CoD MW Shadow;
    // human players render as their chosen character, and multiple players may use the same character!)
    const spawnOtherPlayers = () => {
      if (!this.isTdmMatch) return;
      for (const p of state.players) {
        if (p.id === this.mp.localPlayerId || this.remotePlayers.has(p.id)) continue;
        const spData = round.spawns.find((s) => s.id === p.id);
        const spPos = spData
          ? new THREE.Vector3(spData.pos.x, spData.pos.y, spData.pos.z)
          : this.getTeamSpawn(p.team, p.slotIndex).pos;
        const spYaw = spData ? spData.yaw : this.getTeamSpawn(p.team, p.slotIndex).yaw;
        const charId: CharacterId = p.isBot || p.id === BOT_EMBER_ID ? 'shadow' : (p.characterId ?? 'shadow');
        const rp = new RemotePlayer(p.id, p.name, p.team, spPos, spYaw, this.scene, this.textures, charId);
        this.remotePlayers.set(p.id, rp);
      }
    };
    const neededChars = Array.from(
      new Set(
        state.players
          .filter((p) => p.id !== this.mp.localPlayerId && !p.isBot && p.id !== BOT_EMBER_ID)
          .map((p) => p.characterId ?? 'shadow')
      )
    );
    if (neededChars.length > 0) {
      void Promise.all(neededChars.map((cid) => ensureCharacterLoaded(cid))).then(spawnOtherPlayers);
    } else {
      spawnOtherPlayers();
    }

    this.applyTdmRoundStart(round);
    this.tdmOverlay.classList.add('hidden');
    this.matchEndOverlay.classList.add('hidden');
    this.menuOverlay.classList.add('hidden');
    this.resumeGame();
  }

  private applyTdmRoundStart(round: RoundStartPayload): void {
    this.roundNumber = round.roundNumber;
    this.roundTimer = round.roundTimer;
    this.allyScore = round.blueScore;
    this.enemyScore = round.redScore;
    this.roundActive = true;
    this.roundEndDelay = 0;
    this.roundKillStreak = 0;
    this.roundDamageHistory.clear();
    this.hud.hideDamageHistory();

    // Exact equal loadout for EVERY player: 1 AKM, 1 SCAR-L, 2 Frags, 2 Smokes, 2 Flashes, 100 HP + 50 Shield!
    const mySpawn = round.spawns.find((s) => s.id === this.mp.localPlayerId);
    const fallback = this.getTeamSpawn(this.tdmLocalTeam, 0);
    const spawnPos = mySpawn
      ? new THREE.Vector3(mySpawn.pos.x, mySpawn.pos.y, mySpawn.pos.z)
      : fallback.pos;
    const spawnYaw = mySpawn ? mySpawn.yaw : fallback.yaw;

    this.player.reset(spawnPos, spawnYaw);
    this.weapons.resetAll();
    this.weapons.clearRoundFx();
    this.abilities.resetCharges();

    // TDM-only medical loadout: 4 Bandages (B, 5s, +25 HP) & 1 Medkit (M, 10s, +75 HP) + 3s Spawn Invulnerability Shield!
    this.clearLootDrops();
    this.activeHeal = null;
    this.localHealGraceTimer = 0;
    this.localSpawnShield = TDM_SPAWN_SHIELD_DURATION;
    this.tdmBandages = TDM_BANDAGE_START;
    this.tdmMedkits = TDM_MEDKIT_START;
    this.hud.setTdmMedSlotsVisible(true);
    this.hud.updateHealProgress(null, 0, 1);
    this.hud.updateMedkits(this.tdmBandages, this.tdmMedkits, null);
    this.hud.updateSpawnShield(this.localSpawnShield, TDM_SPAWN_SHIELD_DURATION);

    for (const [id, rp] of this.remotePlayers) {
      const sp = round.spawns.find((s) => s.id === id);
      if (sp) {
        rp.respawn(new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z), sp.yaw, TDM_SPAWN_SHIELD_DURATION);
      }
    }

    if (this.mp.isHost) {
      this.hostLivePlayers.clear();
      this.hostPlayerUtils.clear();
      for (const sp of round.spawns) {
        this.hostLivePlayers.set(sp.id, {
          id: sp.id,
          x: sp.pos.x,
          y: sp.pos.y,
          z: sp.pos.z,
          yaw: sp.yaw,
          pitch: 0,
          crouching: false,
          weaponSlot: 0,
          hp: 100,
          shield: 50,
          alive: true,
          spawnShield: TDM_SPAWN_SHIELD_DURATION,
        });
        this.hostPlayerUtils.set(sp.id, {
          frag: 2,
          flash: 2,
          smoke: 2,
          bandage: TDM_BANDAGE_START,
          medkit: TDM_MEDKIT_START,
        });
      }
    }

    const mapTitle =
      this.settings.map === 'factory'
        ? 'VIKENDI'
        : this.settings.map === 'downtown'
        ? 'DOWNTOWN MANHATTAN'
        : 'WAREHOUSE';
    const teamTag = this.tdmLocalTeam === 'blue' ? 'BLUE TEAM' : 'RED TEAM';
    this.hud.showBanner(`${mapTitle} // ${teamTag}`, `ROUND ${this.roundNumber}`, 2.2);
  }

  private applyHostClientPose(playerId: string, pose: PlayerPoseInput): void {
    if (!this.mp.isHost || !this.isTdmMatch) return;
    const st = this.hostLivePlayers.get(playerId);
    if (!st || !st.alive) return;
    st.x = pose.x;
    st.y = pose.y;
    st.z = pose.z;
    st.yaw = pose.yaw;
    st.pitch = pose.pitch;
    st.crouching = pose.crouching;
    st.weaponSlot = pose.weaponSlot;

    const rp = this.remotePlayers.get(playerId);
    if (rp) {
      rp.applyNetworkState(
        st.x,
        st.y,
        st.z,
        st.yaw,
        st.pitch,
        st.crouching,
        st.weaponSlot,
        st.hp,
        st.shield,
        st.alive,
        st.spawnShield
      );
    }
  }

  /**
   * Lightweight, smooth Host-authoritative TDM AI for default Red Team bot EMBER:
   * patrols cleanly across Vikendi / Warehouse / Downtown, avoids obstacles, strafes & fires fair tactical bursts!
   */
  private updateHostBotEmber(dt: number): void {
    if (!this.mp.isHost || !this.isTdmMatch || !this.roundActive || !this.mp.lobbyState) return;
    const bot = this.hostLivePlayers.get(BOT_EMBER_ID);
    if (!bot || !bot.alive) return;

    const bounds = this.level.mapBounds;
    const botPos = new THREE.Vector3(bot.x, bot.y, bot.z);
    const botEye = new THREE.Vector3(bot.x, bot.y + 1.56, bot.z);

    // Find nearest alive Blue Team enemy (including local Host if on Blue Team!)
    let targetState: SnapshotPlayerState | null = null;
    let targetDist = Infinity;
    for (const lp of this.mp.lobbyState.players) {
      if (lp.team !== 'blue') continue;
      const st = this.hostLivePlayers.get(lp.id);
      if (!st || !st.alive) continue;
      const sx = lp.id === this.mp.localPlayerId ? this.player.pos.x : st.x;
      const sy = lp.id === this.mp.localPlayerId ? this.player.pos.y : st.y;
      const sz = lp.id === this.mp.localPlayerId ? this.player.pos.z : st.z;
      const d = Math.hypot(sx - bot.x, sz - bot.z);
      if (d < targetDist) {
        targetDist = d;
        targetState = { ...st, x: sx, y: sy, z: sz };
      }
    }

    let hasLos = false;
    const toEnemy = new THREE.Vector3();
    if (targetState) {
      const targetEye = new THREE.Vector3(targetState.x, targetState.y + (targetState.crouching ? 1.05 : 1.52), targetState.z);
      toEnemy.subVectors(targetEye, botEye);
      const dist3d = toEnemy.length();
      if (dist3d > 0.2 && dist3d < 92) {
        const dir = toEnemy.clone().divideScalar(dist3d);
        const colliderBlocked = this.raycastSolidColliders(botEye, dir, Math.max(0.1, dist3d - 0.25));
        // Check BOTH analytical colliders AND actual level meshes (staircases, railings, cars, buildings) + smokes!
        hasLos = !colliderBlocked && hasClearSight(botEye, targetEye, this.level.raycastMeshes, this.abilities.smokes);
      }
    }

    // Choose smooth movement direction: strafe in combat or patrol cleanly across map lanes
    this.botEmberStrafeTimer -= dt;
    if (this.botEmberStrafeTimer <= 0) {
      this.botEmberStrafeTimer = 1.4 + Math.random() * 1.8;
      this.botEmberStrafeDir = Math.random() < 0.5 ? -1 : 1;
      const wx = THREE.MathUtils.lerp(bounds.minX + 8, bounds.maxX - 8, Math.random());
      const wz = THREE.MathUtils.lerp(bounds.minZ + 8, bounds.maxZ - 8, Math.random());
      this.botEmberWaypoint.set(wx, 0, wz);
    }

    let moveX = 0;
    let moveZ = 0;
    let moveSpeed = 3.8;
    let desiredYaw = bot.yaw;

    if (targetState && hasLos) {
      const dx = targetState.x - bot.x;
      const dz = targetState.z - bot.z;
      desiredYaw = Math.atan2(-dx, -dz);
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const strafeX = -nz * this.botEmberStrafeDir;
      const strafeZ = nx * this.botEmberStrafeDir;
      const radial = targetDist > 26 ? 0.45 : targetDist < 10 ? -0.4 : 0;
      moveX = strafeX * 0.72 + nx * radial;
      moveZ = strafeZ * 0.72 + nz * radial;
      moveSpeed = 3.1;
    } else {
      const gx = targetState && targetDist < 42 ? targetState.x : this.botEmberWaypoint.x;
      const gz = targetState && targetDist < 42 ? targetState.z : this.botEmberWaypoint.z;
      const dx = gx - bot.x;
      const dz = gz - bot.z;
      const len = Math.hypot(dx, dz);
      if (len > 1.2) {
        moveX = dx / len;
        moveZ = dz / len;
        desiredYaw = Math.atan2(-moveX, -moveZ);
      }
    }

    const evalRampY = (px: number, pz: number): number | null => {
      const ramps = this.level.ramps;
      if (!ramps) return null;
      for (const rp of ramps) {
        if (px >= rp.minX && px <= rp.maxX && pz >= rp.minZ && pz <= rp.maxZ) {
          const span = Math.max(0.001, rp.maxZ - rp.minZ);
          const t = THREE.MathUtils.clamp((pz - rp.minZ) / span, 0, 1);
          return THREE.MathUtils.lerp(rp.yAtMinZ, rp.yAtMaxZ, t);
        }
      }
      return null;
    };

    const mLen = Math.hypot(moveX, moveZ);
    if (mLen > 0.01) {
      moveX /= mLen;
      moveZ /= mLen;
      const nextX = THREE.MathUtils.clamp(bot.x + moveX * moveSpeed * dt, bounds.minX + 1.4, bounds.maxX - 1.4);
      const nextZ = THREE.MathUtils.clamp(bot.z + moveZ * moveSpeed * dt, bounds.minZ + 1.4, bounds.maxZ - 1.4);
      const r = 0.6;
      let blockedX = false;
      let blockedZ = false;
      for (const c of this.level.colliders) {
        if (c.maxY < bot.y + 0.35 || c.minY > bot.y + 1.75) continue;
        if (nextX + r > c.minX && nextX - r < c.maxX && bot.z + r > c.minZ && bot.z - r < c.maxZ) {
          blockedX = true;
        }
        if (bot.x + r > c.minX && bot.x - r < c.maxX && nextZ + r > c.minZ && nextZ - r < c.maxZ) {
          blockedZ = true;
        }
      }
      // Prevent EMBER from walking sideways underneath elevated staircases/ramps!
      const rampX = evalRampY(nextX, bot.z);
      if (rampX !== null && rampX > bot.y + 0.85) blockedX = true;
      const rampZ = evalRampY(bot.x, nextZ);
      if (rampZ !== null && rampZ > bot.y + 0.85) blockedZ = true;

      if (!blockedX) bot.x = nextX;
      if (!blockedZ) bot.z = nextZ;
      if (blockedX && blockedZ) {
        this.botEmberStrafeTimer = 0;
      }

      // Smoothly follow staircase / floor elevation so EMBER never clips inside stairs!
      const curRampY = evalRampY(bot.x, bot.z);
      if (curRampY !== null && Math.abs(curRampY - bot.y) <= 1.2) {
        bot.y = curRampY;
      } else {
        // Settle onto highest supporting floor collider below bot's feet (or y = 0)
        let supportY = 0;
        for (const c of this.level.colliders) {
          if (bot.x >= c.minX && bot.x <= c.maxX && bot.z >= c.minZ && bot.z <= c.maxZ) {
            if (c.maxY <= bot.y + 0.45 && c.maxY > supportY) {
              supportY = c.maxY;
            }
          }
        }
        bot.y = THREE.MathUtils.lerp(bot.y, supportY, Math.min(1, dt * 12));
      }
    }

    // Separate EMBER cleanly from every alive human player so characters NEVER overlap!
    const emberMinDist = 1.06;
    const emberMinDistSq = emberMinDist * emberMinDist;
    for (const lp of this.mp.lobbyState.players) {
      if (lp.id === BOT_EMBER_ID) continue;
      const st = this.hostLivePlayers.get(lp.id);
      if (!st || !st.alive) continue;
      const px = lp.id === this.mp.localPlayerId ? this.player.pos.x : st.x;
      const py = lp.id === this.mp.localPlayerId ? this.player.pos.y : st.y;
      const pz = lp.id === this.mp.localPlayerId ? this.player.pos.z : st.z;
      if (Math.abs(py - bot.y) > 1.55) continue;
      let ox = bot.x - px;
      let oz = bot.z - pz;
      const dSq = ox * ox + oz * oz;
      if (dSq < emberMinDistSq) {
        let d = Math.sqrt(dSq);
        if (d < 1e-4) {
          ox = 1;
          oz = 0;
          d = 1;
        }
        const push = (emberMinDist - d) * 0.65;
        bot.x += (ox / d) * push;
        bot.z += (oz / d) * push;
      }
    }

    // Hard 3-pass solid wall & perimeter depenetration so EMBER NEVER enters walls/cars/crates/bounds!
    depenetrateFromColliders(bot, 0.6, 1.78, this.level.colliders, bounds, 3, 0.08);

    // Smooth yaw turn
    let yawDiff = desiredYaw - bot.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    bot.yaw += yawDiff * Math.min(1, dt * 7.5);
    bot.pitch = 0;

    // Controlled fair burst fire with STRICT wall-first raycast from muzzle (ZERO wall or staircase penetration!)
    this.botEmberFireCd = Math.max(0, this.botEmberFireCd - dt);
    if (targetState && hasLos && bot.spawnShield <= 0 && this.botEmberFireCd <= 0) {
      this.botEmberFireCd = 0.42 + Math.random() * 0.32;
      const muzzle = new THREE.Vector3(bot.x, bot.y + 1.46, bot.z);
      const targetCenter = new THREE.Vector3(
        targetState.x + (Math.random() - 0.5) * 0.65,
        targetState.y + 1.12 + (Math.random() - 0.5) * 0.45,
        targetState.z + (Math.random() - 0.5) * 0.65
      );
      const shotVec = new THREE.Vector3().subVectors(targetCenter, muzzle);
      const dist = shotVec.length();
      const shotDir = shotVec.clone().divideScalar(Math.max(0.001, dist));

      // Strict dual wall/staircase raycast (level.raycastMeshes + level.colliders) before ANY hit can register!
      this.raycaster.set(muzzle, shotDir);
      this.raycaster.near = 0.05;
      this.raycaster.far = dist + 0.25;
      const meshHits = this.raycaster.intersectObjects(this.level.raycastMeshes, false);
      const colHit = this.raycastSolidColliders(muzzle, shotDir, dist + 0.25);

      let wallDist = Infinity;
      let wallPoint: THREE.Vector3 | null = null;
      let wallNormal: THREE.Vector3 | null = null;
      if (meshHits.length > 0) {
        wallDist = meshHits[0].distance;
        wallPoint = meshHits[0].point.clone();
        wallNormal = meshHits[0].face
          ? meshHits[0].face.normal.clone().transformDirection(meshHits[0].object.matrixWorld).normalize()
          : shotDir.clone().negate();
      }
      if (colHit && colHit.dist < wallDist) {
        wallDist = colHit.dist;
        wallPoint = colHit.point;
        wallNormal = colHit.normal;
      }

      const blockedByWall = wallDist < dist - 0.12;
      const hitRoll = !blockedByWall && Math.random() < Math.max(0.16, 0.46 - dist * 0.005);
      const isHead = hitRoll && Math.random() < 0.14;
      const finalEnd = blockedByWall && wallPoint ? wallPoint : targetCenter;

      this.handleHostShotReceived({
        shooterId: BOT_EMBER_ID,
        weaponId: 'scarl',
        weaponName: 'SCAR-H',
        muzzle: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
        endPoint: { x: finalEnd.x, y: finalEnd.y, z: finalEnd.z },
        hitWall: blockedByWall || !hitRoll,
        wallNormal: wallNormal ? { x: wallNormal.x, y: wallNormal.y, z: wallNormal.z } : undefined,
        hitTargetId: hitRoll ? targetState.id : undefined,
        hitZone: hitRoll ? (isHead ? 'head' : 'body') : undefined,
        hitPoint: hitRoll ? { x: targetCenter.x, y: targetCenter.y, z: targetCenter.z } : undefined,
        shotDir: { x: shotDir.x, y: shotDir.y, z: shotDir.z },
        damage: hitRoll ? (isHead ? 40 : 20) : 0,
      });
    }

    const rp = this.remotePlayers.get(BOT_EMBER_ID);
    if (rp) {
      rp.applyNetworkState(
        bot.x,
        bot.y,
        bot.z,
        bot.yaw,
        bot.pitch,
        bot.crouching,
        bot.weaponSlot,
        bot.hp,
        bot.shield,
        bot.alive,
        bot.spawnShield
      );
    }
    void botPos;
  }

  private applyTdmWorldSnapshot(snapshot: WorldSnapshot): void {
    if (!this.isTdmMatch || this.mp.isHost) return;
    this.roundNumber = snapshot.roundNumber;
    this.roundTimer = snapshot.roundTimer;
    this.roundActive = snapshot.roundActive;
    this.allyScore = snapshot.blueScore;
    this.enemyScore = snapshot.redScore;

    for (const ps of snapshot.players) {
      if (ps.id === this.mp.localPlayerId) {
        // Respect brief grace window right after completing a local Bandage/Medkit so stale snapshots don't flicker HP
        if (this.localHealGraceTimer <= 0 || ps.hp >= this.player.hp || !ps.alive) {
          this.player.hp = ps.hp;
        }
        this.player.shield = ps.shield;
        this.localSpawnShield = ps.spawnShield ?? 0;
        if (this.player.alive && !ps.alive) {
          this.player.alive = false;
          this.localSpawnShield = 0;
          if (this.activeHeal) this.cancelActiveHeal(false);
        }
        continue;
      }
      const rp = this.remotePlayers.get(ps.id);
      if (rp) {
        rp.applyNetworkState(
          ps.x,
          ps.y,
          ps.z,
          ps.yaw,
          ps.pitch,
          ps.crouching,
          ps.weaponSlot,
          ps.hp,
          ps.shield,
          ps.alive,
          ps.spawnShield ?? 0
        );
      }
    }
  }

  private handleHostShotReceived(shot: NetShotPayload): void {
    if (!this.mp.isHost || !this.isTdmMatch || !this.mp.lobbyState) return;
    const shooterState = this.hostLivePlayers.get(shot.shooterId);
    if (!shooterState || !shooterState.alive) return;

    // Broadcast visual/audio shot FX to every other player
    this.mp.broadcastShotFx(shot, shot.shooterId);
    if (shot.shooterId !== this.mp.localPlayerId) {
      this.playRemoteShotFx(shot);
    }

    if (!this.roundActive || !shot.hitTargetId || !shot.damage) return;
    const shooterLobby = this.mp.lobbyState.players.find((p) => p.id === shot.shooterId);
    const victimLobby = this.mp.lobbyState.players.find((p) => p.id === shot.hitTargetId);
    if (!shooterLobby || !victimLobby || shooterLobby.team === victimLobby.team) return;

    // Authoritative damage clamp (matches AKM/SCAR-L max headshot damage)
    const clampedDmg = Math.max(1, Math.min(165, Math.round(shot.damage)));
    const impulse = new THREE.Vector3(shot.shotDir.x, shot.shotDir.y, shot.shotDir.z);
    if (impulse.lengthSq() < 1e-4) impulse.set(0, 0, 1);
    else impulse.normalize();

    this.applyHostAuthoritativeDamage(
      shot.hitTargetId,
      shot.shooterId,
      clampedDmg,
      shot.weaponName,
      shot.hitZone === 'head',
      impulse,
      shot.hitPoint
        ? new THREE.Vector3(shot.hitPoint.x, shot.hitPoint.y, shot.hitPoint.z)
        : undefined
    );
  }

  private applyHostAuthoritativeDamage(
    victimId: string,
    attackerId: string,
    amount: number,
    weaponName: string,
    headshot: boolean,
    impulseDir: THREE.Vector3,
    hitPoint?: THREE.Vector3
  ): void {
    if (!this.mp.isHost || !this.mp.lobbyState || !this.roundActive) return;
    const victimState = this.hostLivePlayers.get(victimId);
    // 3-second Respawn Invulnerability Shield: ZERO gun OR utility damage while active!
    if (!victimState || !victimState.alive || victimState.spawnShield > 0) return;

    const attackerLobby = this.mp.lobbyState.players.find((p) => p.id === attackerId);
    const victimLobby = this.mp.lobbyState.players.find((p) => p.id === victimId);
    if (!victimLobby) return;

    // Exact same armor absorption math as PlayerController (66% to shield until depleted)
    let remaining = amount;
    if (victimState.shield > 0) {
      const absorbed = Math.min(victimState.shield, Math.round(amount * 0.66));
      victimState.shield -= absorbed;
      remaining -= absorbed;
    }
    victimState.hp = Math.max(0, victimState.hp - remaining);
    const died = victimState.hp <= 0;
    if (died) {
      victimState.alive = false;
    }

    const attackerState = this.hostLivePlayers.get(attackerId);
    const attackerPos = attackerState
      ? { x: attackerState.x, y: attackerState.y, z: attackerState.z }
      : { x: victimState.x, y: victimState.y, z: victimState.z };

    this.mp.broadcastDamage({
      victimId,
      attackerId,
      attackerName: attackerLobby?.name ?? 'UNKNOWN',
      attackerPos,
      weaponName,
      damage: amount,
      hpAfter: victimState.hp,
      shieldAfter: victimState.shield,
      headshot,
    });

    if (hitPoint && victimId !== this.mp.localPlayerId) {
      const rp = this.remotePlayers.get(victimId);
      rp?.triggerHitFlash();
    }

    if (died) {
      this.mp.broadcastKill({
        victimId,
        victimName: victimLobby.name,
        victimTeam: victimLobby.team,
        attackerId,
        attackerName: attackerLobby?.name ?? victimLobby.name,
        attackerTeam: attackerLobby?.team ?? victimLobby.team,
        weaponName,
        headshot,
        impulseDir: { x: impulseDir.x, y: impulseDir.y, z: impulseDir.z },
        victimPos: { x: victimState.x, y: victimState.y, z: victimState.z },
      });

      // Drop ALL remaining utilities (Frags, Smokes, Flashes, Bandages, Medkits) for ANY player to pick up (F)!
      const deadUtils = this.hostPlayerUtils.get(victimId);
      if (deadUtils) {
        const totalItems =
          deadUtils.frag + deadUtils.flash + deadUtils.smoke + deadUtils.bandage + deadUtils.medkit;
        if (totalItems > 0) {
          const drop: NetLootSpawnPayload = {
            dropId: `loot_${++this.lootDropSeq}`,
            victimName: victimLobby.name,
            pos: { x: victimState.x, y: victimState.y, z: victimState.z },
            contents: { ...deadUtils },
          };
          deadUtils.frag = 0;
          deadUtils.flash = 0;
          deadUtils.smoke = 0;
          deadUtils.bandage = 0;
          deadUtils.medkit = 0;
          this.hostLootDrops.set(drop.dropId, drop);
          this.mp.broadcastLootSpawn(drop);
        }
      }
    }
  }

  private decrementHostUtil(playerId: string, kind: keyof UtilityBundle): void {
    const u = this.hostPlayerUtils.get(playerId);
    if (!u) return;
    u[kind] = Math.max(0, u[kind] - 1);
  }

  private startTdmHeal(kind: 'bandage' | 'medkit'): void {
    if (!this.isTdmMatch || !this.roundActive || !this.player.alive) return;
    if (this.activeHeal && this.activeHeal.kind === kind) return;
    if (this.player.hp >= this.player.maxHp) {
      this.hud.showToast('ALREADY AT FULL HP', 'warn', 1.4);
      return;
    }
    const available = kind === 'medkit' ? this.tdmMedkits : this.tdmBandages;
    if (available <= 0) {
      this.hud.showToast(kind === 'medkit' ? 'NO MEDKITS LEFT' : 'NO BANDAGES LEFT', 'warn', 1.4);
      return;
    }
    this.fireHeld = false;
    this.adsHeld = false;
    const duration = kind === 'medkit' ? TDM_MEDKIT_TIME : TDM_BANDAGE_TIME;
    this.activeHeal = { kind, elapsed: 0, duration };
    this.sound.playHealStart(kind === 'medkit');
    this.hud.updateHealProgress(kind, 0, duration);
  }

  private cancelActiveHeal(byFire: boolean): void {
    if (!this.activeHeal) return;
    const wasMed = this.activeHeal.kind === 'medkit';
    this.activeHeal = null;
    this.hud.updateHealProgress(null, 0, 1);
    if (byFire) {
      this.hud.showToast(
        wasMed ? 'MEDKIT STOPPED — PRESS M TO RESTART' : 'BANDAGE STOPPED — PRESS B TO RESTART',
        'warn',
        1.5
      );
    }
  }

  private updateTdmHealing(dt: number): void {
    if (this.localHealGraceTimer > 0) {
      this.localHealGraceTimer = Math.max(0, this.localHealGraceTimer - dt);
    }
    if (!this.activeHeal) {
      this.hud.updateHealProgress(null, 0, 1);
      return;
    }
    if (!this.player.alive || !this.roundActive) {
      this.cancelActiveHeal(false);
      return;
    }

    this.activeHeal.elapsed += dt;
    this.hud.updateHealProgress(this.activeHeal.kind, this.activeHeal.elapsed, this.activeHeal.duration);

    if (this.activeHeal.elapsed >= this.activeHeal.duration) {
      const kind = this.activeHeal.kind;
      this.activeHeal = null;
      this.hud.updateHealProgress(null, 0, 1);

      if (kind === 'medkit') {
        if (this.tdmMedkits <= 0) return;
        this.tdmMedkits -= 1;
        this.player.heal(TDM_MEDKIT_HEAL);
        this.sound.playHealComplete(true);
        this.hud.showToast('+75 HP // MEDKIT APPLIED', 'heal', 2.0);
      } else {
        if (this.tdmBandages <= 0) return;
        this.tdmBandages -= 1;
        this.player.heal(TDM_BANDAGE_HEAL);
        this.sound.playHealComplete(false);
        this.hud.showToast('+25 HP // BANDAGE APPLIED', 'heal', 1.8);
      }
      this.localHealGraceTimer = 0.4;
      this.mp.sendHealComplete(kind);
    }
  }

  private handleHostHealReceived(data: NetHealPayload): void {
    if (!this.mp.isHost || !this.isTdmMatch || !this.roundActive) return;
    const st = this.hostLivePlayers.get(data.playerId);
    const utils = this.hostPlayerUtils.get(data.playerId);
    if (!st || !st.alive || !utils) return;

    if (data.kind === 'medkit' && utils.medkit > 0) {
      utils.medkit -= 1;
      st.hp = Math.min(100, st.hp + TDM_MEDKIT_HEAL);
    } else if (data.kind === 'bandage' && utils.bandage > 0) {
      utils.bandage -= 1;
      st.hp = Math.min(100, st.hp + TDM_BANDAGE_HEAL);
    } else {
      return;
    }

    if (data.playerId === this.mp.localPlayerId) {
      this.player.hp = st.hp;
    } else {
      const rp = this.remotePlayers.get(data.playerId);
      if (rp) rp.hp = st.hp;
    }
  }

  private spawnLootDropVisual(data: NetLootSpawnPayload): void {
    if (!this.isTdmMatch) return;
    const prev = this.lootDrops.get(data.dropId);
    if (prev) prev.dispose(this.scene);
    const drop = new LootDrop(
      data.dropId,
      data.victimName,
      new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z),
      data.contents,
      this.scene
    );
    this.lootDrops.set(data.dropId, drop);
  }

  private handleHostLootPickupReq(dropId: string, pickerId: string): void {
    if (!this.mp.isHost || !this.isTdmMatch || !this.mp.lobbyState) return;
    const drop = this.hostLootDrops.get(dropId);
    if (!drop) return;
    const pickerState = this.hostLivePlayers.get(pickerId);
    if (!pickerState || !pickerState.alive) return;

    const dx = pickerState.x - drop.pos.x;
    const dy = Math.abs(pickerState.y - drop.pos.y);
    const dz = pickerState.z - drop.pos.z;
    if (dy > 2.2 || dx * dx + dz * dz > 4.4 * 4.4) return;

    this.hostLootDrops.delete(dropId);
    const pickerUtils = this.hostPlayerUtils.get(pickerId);
    if (pickerUtils) {
      pickerUtils.frag += drop.contents.frag;
      pickerUtils.flash += drop.contents.flash;
      pickerUtils.smoke += drop.contents.smoke;
      pickerUtils.bandage += drop.contents.bandage;
      pickerUtils.medkit += drop.contents.medkit;
    }
    const pickerLobby = this.mp.lobbyState.players.find((p) => p.id === pickerId);
    this.mp.broadcastLootPicked({
      dropId,
      pickerId,
      pickerName: pickerLobby?.name ?? 'PLAYER',
      contents: { ...drop.contents },
    });
  }

  private applyLootPickedEvent(data: NetLootPickupPayload): void {
    const drop = this.lootDrops.get(data.dropId);
    if (drop) {
      drop.dispose(this.scene);
      this.lootDrops.delete(data.dropId);
    }
    if (this.nearestLootId === data.dropId) {
      this.nearestLootId = null;
      this.hud.updateLootPrompt(null, []);
    }

    if (data.pickerId === this.mp.localPlayerId) {
      this.abilities.charges.frag += data.contents.frag;
      this.abilities.charges.flash += data.contents.flash;
      this.abilities.charges.smoke += data.contents.smoke;
      this.tdmBandages += data.contents.bandage;
      this.tdmMedkits += data.contents.medkit;
      this.sound.playPickup();
      const summary = this.formatUtilitySummary(data.contents);
      if (summary.length > 0) {
        this.hud.showToast(`LOOTED ${summary.join(' • ')}`, 'loot', 2.4);
      }
    }
  }

  private clearLootDrops(): void {
    for (const drop of this.lootDrops.values()) {
      drop.dispose(this.scene);
    }
    this.lootDrops.clear();
    this.hostLootDrops.clear();
    this.nearestLootId = null;
    this.hud.updateLootPrompt(null, []);
  }

  private formatUtilitySummary(c: UtilityBundle): string[] {
    const items: string[] = [];
    if (c.frag > 0) items.push(`${c.frag} FRAG`);
    if (c.smoke > 0) items.push(`${c.smoke} SMOKE`);
    if (c.flash > 0) items.push(`${c.flash} FLASH`);
    if (c.bandage > 0) items.push(`${c.bandage} BANDAGE`);
    if (c.medkit > 0) items.push(`${c.medkit} MEDKIT`);
    return items;
  }

  private playRemoteShotFx(shot: NetShotPayload): void {
    const shooter = this.remotePlayers.get(shot.shooterId);
    const muzzle = new THREE.Vector3(shot.muzzle.x, shot.muzzle.y, shot.muzzle.z);
    const endPoint = new THREE.Vector3(shot.endPoint.x, shot.endPoint.y, shot.endPoint.z);

    if (shooter) {
      shooter.triggerMuzzleFlash();
      shooter.spottedTimer = 3.2;
    }

    const dist = muzzle.distanceTo(this.player.pos);
    const atten = Math.max(0.12, 1 - dist / 42);
    if (shot.weaponId === 'scarl') {
      this.sound.playScarShot(atten * 0.78);
    } else if (shot.weaponId === 'aug') {
      this.sound.playAugShot(atten * 0.78);
    } else if (shot.weaponId === 'pistol9mm') {
      this.sound.playGhostShot(atten * 0.78);
    } else {
      this.sound.playVandalShot(atten * 0.78);
    }

    const isEnemyShot = shooter ? shooter.team !== this.tdmLocalTeam : true;
    this.weapons.spawnPulseLight(muzzle, isEnemyShot ? 0xff5a22 : 0x38d8ff, 9, 0.05, 11);
    this.weapons.spawnTracer(muzzle, endPoint, isEnemyShot ? 0xff5222 : 0xffaa38, 0.024);

    if (shot.hitTargetId && shot.hitPoint) {
      const hp = new THREE.Vector3(shot.hitPoint.x, shot.hitPoint.y, shot.hitPoint.z);
      const dir = new THREE.Vector3(shot.shotDir.x, shot.shotDir.y, shot.shotDir.z).normalize();
      if (shot.hitTargetId !== this.mp.localPlayerId) {
        this.weapons.spawnImpact(hp, dir.clone().negate(), true, shot.hitZone === 'head', false);
        this.projectWallBloodSplatter(hp, dir, shot.hitZone === 'head' ? 0.92 : 0.65);
      }
    } else if (shot.hitWall && shot.wallNormal) {
      const wn = new THREE.Vector3(shot.wallNormal.x, shot.wallNormal.y, shot.wallNormal.z);
      this.weapons.spawnImpact(endPoint, wn, false, false);
    }
  }

  private applyTdmDamageEvent(data: NetDamagePayload): void {
    if (!this.isTdmMatch) return;
    if (data.victimId === this.mp.localPlayerId) {
      this.player.hp = data.hpAfter;
      this.player.shield = data.shieldAfter;
      const died = data.hpAfter <= 0;
      if (died) this.player.alive = false;
      this.player.addShake(0.065);
      this.sound.playDamageTaken();

      const toAttacker = new THREE.Vector3(
        data.attackerPos.x - this.player.pos.x,
        0,
        data.attackerPos.z - this.player.pos.z
      );
      if (toAttacker.lengthSq() > 0.01) {
        const relAngle = Math.atan2(toAttacker.x, -toAttacker.z) + this.player.yaw;
        this.hud.triggerDamage(relAngle);
      } else {
        this.hud.triggerDamage(0);
      }
      this.recordPlayerDamage(data.attackerName, data.damage, data.weaponName, died);
    } else {
      const rp = this.remotePlayers.get(data.victimId);
      if (rp) {
        rp.hp = data.hpAfter;
        rp.shield = data.shieldAfter;
        rp.triggerHitFlash();
      }
      if (data.attackerId === this.mp.localPlayerId && data.weaponName === 'FRAG GRENADE') {
        this.sound.playHit(data.hpAfter <= 0);
        this.hud.showHitmarker(data.hpAfter <= 0);
      }
    }
  }

  private applyTdmKillEvent(data: NetKillPayload): void {
    if (!this.isTdmMatch) return;
    const impulse = new THREE.Vector3(data.impulseDir.x, data.impulseDir.y, data.impulseDir.z);
    const vPos = new THREE.Vector3(data.victimPos.x, data.victimPos.y, data.victimPos.z);

    if (data.victimId === this.mp.localPlayerId) {
      this.player.hp = 0;
      this.player.alive = false;
      this.playerDeaths += 1;
      if (this.activeHeal) this.cancelActiveHeal(false);
    } else {
      const rp = this.remotePlayers.get(data.victimId);
      if (rp) {
        rp.triggerDeath(impulse, data.headshot);
        this.weapons.spawnBloodPool(rp.pos, data.headshot, impulse);
        this.weapons.spawnDroppedWeapon(rp.pos, rp.yaw, impulse);
      } else {
        this.weapons.spawnBloodPool(vPos, data.headshot, impulse);
      }
    }

    if (data.attackerId === this.mp.localPlayerId && data.victimId !== this.mp.localPlayerId) {
      this.playerKills += 1;
      if (data.headshot) this.playerHeadshots += 1;
      this.roundKillStreak += 1;
      this.playerScore += data.headshot ? 250 : 150;
      this.sound.playKillChime(this.roundKillStreak);
      this.hud.showKillEmblem(this.roundKillStreak, data.headshot);
    }

    this.hud.pushKillfeed(
      data.attackerName,
      data.attackerTeam === 'blue' ? 'ally' : 'enemy',
      data.victimName,
      data.victimTeam === 'blue' ? 'ally' : 'enemy',
      data.weaponName,
      data.headshot
    );
  }

  private handleHostTdmFragDetonation(blastPos: THREE.Vector3, ownerId: string): void {
    if (!this.mp.isHost || !this.mp.lobbyState || !this.roundActive) return;
    const ownerLobby = this.mp.lobbyState.players.find((p) => p.id === ownerId);
    const blastRadius = 6.2;

    for (const p of this.mp.lobbyState.players) {
      const st = this.hostLivePlayers.get(p.id);
      if (!st || !st.alive || st.spawnShield > 0) continue;
      // No friendly fire on teammates (owner can still take reduced self-blast damage if too close)
      if (ownerLobby && p.team === ownerLobby.team && p.id !== ownerId) continue;

      const targetCenter = new THREE.Vector3(st.x, st.y + (st.crouching ? 0.65 : 1.0), st.z);
      const toTarget = new THREE.Vector3().subVectors(targetCenter, blastPos);
      const dist = toTarget.length();
      if (dist > blastRadius) continue;

      const dir = dist > 0.01 ? toTarget.clone().divideScalar(dist) : new THREE.Vector3(0, 1, 0);
      const wallBlock = this.raycastSolidColliders(blastPos, dir, Math.max(0.05, dist - 0.15));
      if (wallBlock) continue;

      const falloff = 1 - dist / blastRadius;
      const baseDmg = p.id === ownerId ? 76 : 138;
      const dmg = Math.round(baseDmg * (0.28 + 0.72 * falloff * falloff));
      if (dmg <= 0) continue;

      this.applyHostAuthoritativeDamage(p.id, ownerId, dmg, 'FRAG GRENADE', false, dir);
    }
  }

  private updateTdmHostRoundRules(dt: number): void {
    if (!this.mp.isHost || !this.mp.lobbyState) return;

    if (!this.roundActive) {
      this.roundEndDelay -= dt;
      if (this.roundEndDelay <= 0) {
        if (this.allyScore >= ROUNDS_TO_WIN || this.enemyScore >= ROUNDS_TO_WIN) {
          const winner: LobbyTeam = this.allyScore >= this.enemyScore ? 'blue' : 'red';
          this.mp.broadcastMatchEnd({
            winner,
            blueScore: this.allyScore,
            redScore: this.enemyScore,
            players: this.mp.lobbyState.players.map((p) => ({ ...p })),
          });
        } else {
          this.roundNumber += 1;
          const nextRound = this.buildTdmRoundStartPayload(this.roundNumber, this.allyScore, this.enemyScore);
          this.mp.broadcastRoundStart(nextRound);
        }
      }
      return;
    }

    this.roundTimer = Math.max(0, this.roundTimer - dt);

    let blueAlive = 0;
    let redAlive = 0;
    let blueHpTotal = 0;
    let redHpTotal = 0;

    for (const p of this.mp.lobbyState.players) {
      const st = this.hostLivePlayers.get(p.id);
      if (!st || !st.alive) continue;
      if (p.team === 'blue') {
        blueAlive += 1;
        blueHpTotal += st.hp + st.shield;
      } else {
        redAlive += 1;
        redHpTotal += st.hp + st.shield;
      }
    }

    if (redAlive === 0 && blueAlive > 0) {
      this.roundActive = false;
      this.roundEndDelay = 4.0;
      this.allyScore += 1;
      this.mp.broadcastRoundEnd({
        winner: 'blue',
        reason: 'RED TEAM ELIMINATED',
        blueScore: this.allyScore,
        redScore: this.enemyScore,
      });
    } else if (blueAlive === 0 && redAlive > 0) {
      this.roundActive = false;
      this.roundEndDelay = 4.0;
      this.enemyScore += 1;
      this.mp.broadcastRoundEnd({
        winner: 'red',
        reason: 'BLUE TEAM ELIMINATED',
        blueScore: this.allyScore,
        redScore: this.enemyScore,
      });
    } else if (blueAlive === 0 && redAlive === 0) {
      this.roundActive = false;
      this.roundEndDelay = 4.0;
      this.mp.broadcastRoundEnd({
        winner: 'draw',
        reason: 'MUTUAL ELIMINATION',
        blueScore: this.allyScore,
        redScore: this.enemyScore,
      });
    } else if (this.roundTimer <= 0) {
      this.roundActive = false;
      this.roundEndDelay = 4.0;
      let winner: LobbyTeam | 'draw' = 'draw';
      if (blueAlive > redAlive || (blueAlive === redAlive && blueHpTotal > redHpTotal)) {
        winner = 'blue';
        this.allyScore += 1;
      } else if (redAlive > blueAlive || (blueAlive === redAlive && redHpTotal > blueHpTotal)) {
        winner = 'red';
        this.enemyScore += 1;
      }
      this.mp.broadcastRoundEnd({
        winner,
        reason: 'TIME EXPIRED',
        blueScore: this.allyScore,
        redScore: this.enemyScore,
      });
    }
  }

  private applyTdmRoundEnd(data: RoundEndPayload): void {
    this.roundActive = false;
    if (this.activeHeal) this.cancelActiveHeal(false);
    this.allyScore = data.blueScore;
    this.enemyScore = data.redScore;
    if (data.winner === 'draw') {
      this.sound.playRoundHorn(false);
      this.hud.showBanner(data.reason, 'ROUND DRAW', 2.6);
    } else {
      const won = data.winner === this.tdmLocalTeam;
      if (won) this.playerScore += 300;
      this.sound.playRoundHorn(won);
      const label = data.winner === 'blue' ? 'BLUE TEAM WINS ROUND' : 'RED TEAM WINS ROUND';
      this.hud.showBanner(data.reason, label, 2.6);
    }
  }

  private applyTdmMatchEnd(data: MatchEndPayload): void {
    this.roundActive = false;
    this.paused = true;
    this.fireHeld = false;
    this.adsHeld = false;
    if (this.activeHeal) this.cancelActiveHeal(false);
    this.player.clearKeys();
    this.hud.setVisible(false);
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    const victory = data.winner === this.tdmLocalTeam;
    const title = document.getElementById('me-title')!;
    const sub = document.getElementById('me-subtitle')!;
    title.textContent = victory ? 'VICTORY' : 'DEFEAT';
    title.classList.toggle('defeat', !victory);
    sub.textContent = `${data.winner === 'blue' ? 'BLUE' : 'RED'} TEAM WINS // BLUE ${data.blueScore} — ${data.redScore} RED`;

    const hsPct = this.playerKills > 0 ? Math.round((this.playerHeadshots / this.playerKills) * 100) : 0;
    document.getElementById('me-kills')!.textContent = String(this.playerKills);
    document.getElementById('me-hs')!.textContent = `${hsPct}%`;
    document.getElementById('me-deaths')!.textContent = String(this.playerDeaths);
    document.getElementById('me-score')!.textContent = String(this.playerScore);

    const playAgainBtn = document.getElementById('btn-play-again');
    const backMenuBtn = document.getElementById('btn-back-menu');
    if (playAgainBtn) playAgainBtn.textContent = 'BACK TO LOBBY';
    if (backMenuBtn) backMenuBtn.textContent = 'LEAVE LOBBY';

    this.matchEndOverlay.classList.remove('hidden');
  }

  private exitTdmMatchToMenu(): void {
    this.mp.leaveLobby(true);
    this.isTdmMatch = false;
    this.matchStarted = false;
    this.roundActive = false;
    this.paused = true;
    this.fireHeld = false;
    this.adsHeld = false;
    this.activeHeal = null;
    this.tdmBandages = 0;
    this.tdmMedkits = 0;
    this.player.clearKeys();
    this.clearRemotePlayers();
    this.clearLootDrops();
    this.hud.setTdmMedSlotsVisible(false);
    this.hud.setVisible(false);
    this.tdmOverlay.classList.add('hidden');
    this.matchEndOverlay.classList.add('hidden');
    this.menuOverlay.classList.remove('hidden');
    const soloMap: MapId = this.settings.map === 'downtown' ? 'factory' : this.settings.map;
    this.btnDeployLabel.textContent =
      soloMap === 'factory' ? 'DEPLOY TO VIKENDI' : 'DEPLOY TO WAREHOUSE';
    this.btnRestart.textContent = 'RESTART MATCH';
    this.btnRestart.classList.add('hidden');
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    if (this.levelIsTdmExpanded) {
      this.switchMap(soloMap, true);
    } else {
      this.setupShowcaseFrame();
    }
  }

  /**
   * Exact analytic 3D ray-AABB slab test against every solid level collider (guarantees ZERO bullet wall penetration!).
   */
  private raycastSolidColliders(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): { dist: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    let bestT = maxDist;
    let bestNormal: THREE.Vector3 | null = null;

    for (const b of this.level.colliders) {
      let tmin = 0.005;
      let tmax = bestT;
      let hitAxis = -1;
      let hitSign = 0;

      // X slab
      if (Math.abs(dir.x) < 1e-7) {
        if (origin.x < b.minX || origin.x > b.maxX) continue;
      } else {
        const inv = 1 / dir.x;
        let t1 = (b.minX - origin.x) * inv;
        let t2 = (b.maxX - origin.x) * inv;
        let s = -1;
        if (t1 > t2) {
          [t1, t2] = [t2, t1];
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitAxis = 0;
          hitSign = s;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      // Y slab
      if (Math.abs(dir.y) < 1e-7) {
        if (origin.y < b.minY || origin.y > b.maxY) continue;
      } else {
        const inv = 1 / dir.y;
        let t1 = (b.minY - origin.y) * inv;
        let t2 = (b.maxY - origin.y) * inv;
        let s = -1;
        if (t1 > t2) {
          [t1, t2] = [t2, t1];
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitAxis = 1;
          hitSign = s;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      // Z slab
      if (Math.abs(dir.z) < 1e-7) {
        if (origin.z < b.minZ || origin.z > b.maxZ) continue;
      } else {
        const inv = 1 / dir.z;
        let t1 = (b.minZ - origin.z) * inv;
        let t2 = (b.maxZ - origin.z) * inv;
        let s = -1;
        if (t1 > t2) {
          [t1, t2] = [t2, t1];
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitAxis = 2;
          hitSign = s;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (tmin >= 0.005 && tmin < bestT) {
        bestT = tmin;
        bestNormal =
          hitAxis === 0
            ? new THREE.Vector3(hitSign, 0, 0)
            : hitAxis === 1
            ? new THREE.Vector3(0, hitSign, 0)
            : hitAxis === 2
            ? new THREE.Vector3(0, 0, hitSign)
            : dir.clone().negate();
      }
    }

    if (!bestNormal) return null;
    return {
      dist: bestT,
      point: origin.clone().addScaledVector(dir, bestT),
      normal: bestNormal,
    };
  }

  /**
   * Fast 3-ray camera-to-wall clearance probe (center + +/-22 deg horizontal fan, max 1.18m)
   * checking BOTH analytical AABB colliders AND level raycastMeshes (staircases, cars, railings, pillars)
   * so first-person AKM & SCAR-L barrels NEVER poke inside any wall or obstacle on ANY map!
   */
  private computeCameraWallClearance(eye: THREE.Vector3, fwd: THREE.Vector3): number {
    const maxDist = 1.18;
    let best = maxDist;
    const offsets = [0, 0.38, -0.38];

    for (let i = 0; i < offsets.length; i++) {
      const ang = offsets[i];
      if (ang === 0) {
        this.tmpWallRayDir.copy(fwd);
      } else {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        this.tmpWallRayDir.set(
          fwd.x * c - fwd.z * s,
          fwd.y,
          fwd.x * s + fwd.z * c
        ).normalize();
      }

      const colHit = this.raycastSolidColliders(eye, this.tmpWallRayDir, best);
      if (colHit && colHit.dist < best) {
        best = colHit.dist;
      }

      this.raycaster.set(eye, this.tmpWallRayDir);
      this.raycaster.near = 0.02;
      this.raycaster.far = best;
      const meshHits = this.raycaster.intersectObjects(this.level.raycastMeshes, false);
      if (meshHits.length > 0 && meshHits[0].distance < best) {
        best = meshHits[0].distance;
      }
    }

    return best;
  }

  private projectWallBloodSplatter(hitPoint: THREE.Vector3, shotDir: THREE.Vector3, scale: number): void {
    this.raycaster.set(hitPoint, shotDir);
    this.raycaster.near = 0.08;
    this.raycaster.far = 3.6;
    const hits = this.raycaster.intersectObjects(this.level.raycastMeshes, false);
    if (hits.length > 0 && hits[0].face) {
      const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize();
      // Stamp onto walls/pillars/crates (skip floor here since floor pools & droplet splatters handle y=0)
      if (Math.abs(n.y) < 0.72) {
        this.weapons.spawnWallBloodSplatter(hits[0].point, n, scale);
      }
    }
  }

  private handlePlayerShot(): void {
    const shot = this.weapons.tryFire(
      this.fireHeld,
      this.fireJustPressed,
      this.player.horizontalSpeed,
      this.player.crouching,
      this.player.grounded,
      this.player.stimTimer > 0
    );
    this.fireJustPressed = false;
    if (!shot) return;

    // 1. Strict wall-first raycast (BOTH level meshes AND analytic AABB colliders) -> ZERO bullet wall penetration!
    this.raycaster.set(shot.origin, shot.direction);
    this.raycaster.near = 0.01;
    this.raycaster.far = shot.weapon.range;

    const wallMeshHits = this.raycaster.intersectObjects(this.level.raycastMeshes, false);
    const colliderHit = this.raycastSolidColliders(shot.origin, shot.direction, shot.weapon.range);

    let hardWallDist = shot.weapon.range;
    let wallPoint: THREE.Vector3 | null = null;
    let wallNormal: THREE.Vector3 | null = null;

    if (wallMeshHits.length > 0) {
      hardWallDist = wallMeshHits[0].distance;
      wallPoint = wallMeshHits[0].point.clone();
      wallNormal = wallMeshHits[0].face
        ? wallMeshHits[0].face.normal.clone().transformDirection(wallMeshHits[0].object.matrixWorld).normalize()
        : shot.direction.clone().negate();
    }
    if (colliderHit && colliderHit.dist < hardWallDist) {
      hardWallDist = colliderHit.dist;
      wallPoint = colliderHit.point;
      wallNormal = colliderHit.normal;
    }

    // 2. Test enemy hitboxes STRICTLY closer than hardWallDist (never hits enemies behind any wall/cover!)
    const endPoint = shot.origin.clone().addScaledVector(shot.direction, shot.weapon.range);

    if (this.isTdmMatch) {
      const remoteMeshes: THREE.Object3D[] = [];
      for (const rp of this.remotePlayers.values()) {
        if (rp.alive && rp.team !== this.tdmLocalTeam) {
          remoteMeshes.push(...rp.rig.hitMeshes);
        }
      }
      this.raycaster.far = Math.max(0.02, hardWallDist - 0.015);
      const remoteHits = remoteMeshes.length > 0 ? this.raycaster.intersectObjects(remoteMeshes, false) : [];

      let hitTargetId: string | undefined;
      let hitZone: 'head' | 'body' | 'leg' | undefined;
      let hitPoint: THREE.Vector3 | undefined;
      let hitDamage: number | undefined;
      let hitWall = false;

      if (remoteHits.length > 0 && remoteHits[0].distance < hardWallDist - 0.015) {
        const hit = remoteHits[0];
        endPoint.copy(hit.point);
        const rpId = hit.object.userData.remotePlayerId as string | undefined;
        const rp = rpId ? this.remotePlayers.get(rpId) : undefined;
        if (rp && rp.alive) {
          if (rp.spawnShield > 0) {
            // Target is protected by 3s Respawn Invulnerability Shield -> bounce sparks off shield, ZERO damage!
            this.weapons.spawnImpact(hit.point, shot.direction.clone().negate(), false, false);
            this.weapons.spawnPulseLight(hit.point, 0x38eeff, 12, 0.08, 6);
            this.hud.showToast(`🛡 ${rp.name} SPAWN SHIELDED`, 'warn', 0.9);
          } else {
            const zone = (hit.object.userData.hitZone as 'head' | 'body' | 'leg') || 'body';
            const isHead = zone === 'head';
            const dmg =
              zone === 'head'
                ? shot.weapon.damageHead
                : zone === 'leg'
                ? shot.weapon.damageLeg
                : shot.weapon.damageBody;

            rp.spottedTimer = 4.0;
            rp.triggerHitFlash();
            this.weapons.spawnImpact(hit.point, shot.direction.clone().negate(), true, isHead, false);
            this.projectWallBloodSplatter(hit.point, shot.direction, isHead ? 0.96 : 0.68);
            this.sound.playHit(isHead);
            this.hud.showHitmarker(isHead);

            hitTargetId = rp.id;
            hitZone = zone;
            hitPoint = hit.point.clone();
            hitDamage = dmg;
          }
        }
      } else if (wallPoint && wallNormal) {
        endPoint.copy(wallPoint);
        hitWall = true;
        this.weapons.spawnImpact(wallPoint, wallNormal, false, false);
      }

      this.weapons.spawnTracer(shot.muzzleWorld, endPoint, 0xff6b24, 0.017);

      const netShot: NetShotPayload = {
        shooterId: this.mp.localPlayerId,
        weaponId: shot.weapon.id,
        weaponName: shot.weapon.name,
        muzzle: { x: shot.muzzleWorld.x, y: shot.muzzleWorld.y, z: shot.muzzleWorld.z },
        endPoint: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
        hitWall,
        wallNormal:
          hitWall && wallNormal ? { x: wallNormal.x, y: wallNormal.y, z: wallNormal.z } : undefined,
        hitTargetId,
        hitZone,
        hitPoint: hitPoint ? { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } : undefined,
        shotDir: { x: shot.direction.x, y: shot.direction.y, z: shot.direction.z },
        damage: hitDamage,
      };
      this.mp.sendShot(netShot);
      return;
    }

    const enemyMeshes: THREE.Object3D[] = [];
    for (const agent of this.agents) {
      if (agent.alive && agent.team === 'enemy') {
        enemyMeshes.push(...agent.rig.hitMeshes);
      }
    }
    this.raycaster.far = Math.max(0.02, hardWallDist - 0.015);
    const agentHits = enemyMeshes.length > 0 ? this.raycaster.intersectObjects(enemyMeshes, false) : [];

    if (agentHits.length > 0 && agentHits[0].distance < hardWallDist - 0.015) {
      const hit = agentHits[0];
      endPoint.copy(hit.point);
      const normal = shot.direction.clone().negate();
      const agentId = hit.object.userData.agentId as string | undefined;
      const agent = agentId ? this.agents.find((a) => a.id === agentId) : undefined;
      if (agent && agent.alive) {
        const zone = hit.object.userData.hitZone as 'head' | 'body' | 'leg';
        const isHead = zone === 'head';
        const dmg =
          zone === 'head'
            ? shot.weapon.damageHead
            : zone === 'leg'
            ? shot.weapon.damageLeg
            : shot.weapon.damageBody;

        agent.spottedTimer = 4.0;
        const res = agent.takeDamage(dmg, shot.direction, isHead);
        this.weapons.spawnImpact(hit.point, normal, true, isHead, false);
        this.projectWallBloodSplatter(hit.point, shot.direction, isHead ? 0.96 : 0.68);
        this.sound.playHit(isHead);
        this.hud.showHitmarker(isHead);

        if (res.killed) {
          this.weapons.spawnBloodPool(agent.pos, isHead, shot.direction);
          this.projectWallBloodSplatter(hit.point, shot.direction, isHead ? 1.32 : 1.02);
          this.weapons.spawnDroppedWeapon(agent.pos, agent.yaw, shot.direction);
          this.onEnemyKilledByPlayer(agent, shot.weapon.name, isHead);
        }
      }
    } else if (wallPoint && wallNormal) {
      endPoint.copy(wallPoint);
      this.weapons.spawnImpact(wallPoint, wallNormal, false, false);
    }

    this.weapons.spawnTracer(shot.muzzleWorld, endPoint, 0xff6b24, 0.017);
  }

  private onEnemyKilledByPlayer(enemy: TacticalAgent, weaponName: string, headshot: boolean): void {
    this.playerKills += 1;
    if (headshot) this.playerHeadshots += 1;
    this.roundKillStreak += 1;
    this.playerScore += headshot ? 250 : 150;

    this.sound.playKillChime(this.roundKillStreak);
    this.hud.showKillEmblem(this.roundKillStreak, headshot);
    this.hud.pushKillfeed('YOU', 'ally', enemy.name, 'enemy', weaponName, headshot);

    if (this.settings.mode === 'skirmish') {
      this.player.shield = Math.min(this.player.maxShield, this.player.shield + 20);
      this.player.heal(15);
      const curAmmo = this.weapons.currentAmmo;
      curAmmo.reserve = Math.min(this.weapons.currentWeapon.reserveMax, curAmmo.reserve + 20);
      this.skirmishRespawnQueue.push(3.2);
      if (this.playerKills % 5 === 0) {
        this.waveNumber += 1;
        this.abilities.charges.flash = Math.min(2, this.abilities.charges.flash + 1);
        this.abilities.charges.smoke = Math.min(2, this.abilities.charges.smoke + 1);
        this.hud.showBanner(`WAVE ${this.waveNumber}`, 'REINFORCEMENTS INBOUND', 1.8);
      }
    }
  }

  private handleAgentFire(ev: AgentFireEvent): void {
    const distToPlayer = ev.muzzleWorld.distanceTo(this.player.pos);
    const atten = Math.max(0.12, 1 - distToPlayer / 38);
    this.sound.playVandalShot(atten * 0.72);

    // Subtle dynamic world muzzle light illuminates wet puddles without blinding target silhouette
    this.weapons.spawnPulseLight(
      ev.muzzleWorld,
      ev.attackerTeam === 'enemy' ? 0xff6222 : 0xff9a38,
      10,
      0.05,
      12
    );

    const shooter = this.agents.find((a) => a.id === ev.attackerId);
    if (shooter) shooter.spottedTimer = 3.2;

    // Anti-wallbang check: if a bot's rifle barrel protrudes into a wall/crate, stop the shot at the wall!
    let fireOrigin = ev.muzzleWorld;
    if (shooter) {
      const shooterEye = shooter.getEyePosition();
      const eyeToMuzzle = new THREE.Vector3().subVectors(ev.muzzleWorld, shooterEye);
      const barrelLen = eyeToMuzzle.length();
      if (barrelLen > 0.05) {
        const barrelDir = eyeToMuzzle.clone().divideScalar(barrelLen);
        const barrelBlock = this.raycastSolidColliders(shooterEye, barrelDir, barrelLen);
        if (barrelBlock) {
          this.weapons.spawnImpact(barrelBlock.point, barrelBlock.normal, false, false);
          return;
        }
        fireOrigin = shooterEye;
      }
    }

    this.raycaster.set(fireOrigin, ev.direction);
    this.raycaster.near = 0.01;
    this.raycaster.far = 55;

    const wallHits = this.raycaster.intersectObjects(this.level.raycastMeshes, false);
    const colliderHit = this.raycastSolidColliders(fireOrigin, ev.direction, 55);
    let maxDist = 55;
    let impactPoint = fireOrigin.clone().addScaledVector(ev.direction, maxDist);
    let impactNormal: THREE.Vector3 | null = null;
    let hitWall = false;

    if (wallHits.length > 0) {
      maxDist = wallHits[0].distance;
      impactPoint = wallHits[0].point.clone();
      impactNormal = wallHits[0].face
        ? wallHits[0].face.normal.clone().transformDirection(wallHits[0].object.matrixWorld).normalize()
        : ev.direction.clone().negate();
      hitWall = true;
    }
    if (colliderHit && colliderHit.dist < maxDist) {
      maxDist = colliderHit.dist;
      impactPoint = colliderHit.point;
      impactNormal = colliderHit.normal;
      hitWall = true;
    }

    let hitAgent: TacticalAgent | null = null;
    for (const candidate of this.agents) {
      if (!candidate.alive || candidate.team === ev.attackerTeam) continue;
      const hits = this.raycaster.intersectObjects(candidate.rig.hitMeshes, false);
      if (hits.length > 0 && hits[0].distance < maxDist - 0.015) {
        maxDist = hits[0].distance;
        impactPoint = hits[0].point.clone();
        hitAgent = candidate;
        impactNormal = ev.direction.clone().negate();
      }
    }

    let hitPlayer = false;
    if (ev.attackerTeam === 'enemy' && this.player.alive) {
      const playerCenter = new THREE.Vector3(
        this.player.pos.x,
        this.player.pos.y + (this.player.crouching ? 0.68 : 1.05),
        this.player.pos.z
      );
      const t = new THREE.Vector3().subVectors(playerCenter, fireOrigin).dot(ev.direction);
      if (t > 0.2 && t < maxDist - 0.02) {
        const closest = fireOrigin.clone().addScaledVector(ev.direction, t);
        const horizErr = Math.hypot(closest.x - playerCenter.x, closest.z - playerCenter.z);
        const vertErr = Math.abs(closest.y - playerCenter.y);
        if (horizErr < 0.44 && vertErr < (this.player.crouching ? 0.65 : 0.92)) {
          hitPlayer = true;
          hitAgent = null;
          impactPoint = closest;
        }
      }
    }

    const tracerCol = ev.attackerTeam === 'enemy' ? 0xff4522 : 0xff9838;
    this.weapons.spawnTracer(ev.muzzleWorld, impactPoint, tracerCol, 0.028);

    if (hitPlayer) {
      const toAttacker = new THREE.Vector3().subVectors(fireOrigin, this.player.pos);
      const worldAngle = Math.atan2(toAttacker.x, -toAttacker.z);
      const relAngle = worldAngle + this.player.yaw;
      this.hud.triggerDamage(relAngle);

      const res = this.player.takeDamage(ev.damage);
      this.recordPlayerDamage(ev.attackerName, ev.damage, 'AKM 7.62', res.died);
      if (res.died) {
        this.playerDeaths += 1;
        this.hud.pushKillfeed(ev.attackerName, 'enemy', 'YOU', 'ally', 'AKM 7.62', false);
        if (this.settings.mode === 'skirmish') {
          this.finishMatch(false);
        }
      }
    } else if (hitAgent) {
      const res = hitAgent.takeDamage(ev.damage, ev.direction, false);
      if (impactNormal) this.weapons.spawnImpact(impactPoint, impactNormal, true, false, false);
      this.projectWallBloodSplatter(impactPoint, ev.direction, 0.65);
      if (res.killed) {
        this.weapons.spawnBloodPool(hitAgent.pos, false, ev.direction);
        this.projectWallBloodSplatter(impactPoint, ev.direction, 1.0);
        this.weapons.spawnDroppedWeapon(hitAgent.pos, hitAgent.yaw, ev.direction);
        this.hud.pushKillfeed(ev.attackerName, ev.attackerTeam, hitAgent.name, hitAgent.team, 'AKM 7.62', false);
      }
    } else if (impactNormal && hitWall) {
      this.weapons.spawnImpact(impactPoint, impactNormal, false, false);
    }
  }

  private updateRoundRules(dt: number): void {
    if (this.settings.mode === 'skirmish') {
      for (let i = this.skirmishRespawnQueue.length - 1; i >= 0; i--) {
        this.skirmishRespawnQueue[i] -= dt;
        if (this.skirmishRespawnQueue[i] <= 0) {
          this.skirmishRespawnQueue.splice(i, 1);
          const dead = this.agents.find((a) => a.team === 'enemy' && !a.alive);
          if (dead) {
            const farSpawns = [...this.level.enemySpawns].sort(
              (a, b) => b.pos.distanceToSquared(this.player.pos) - a.pos.distanceToSquared(this.player.pos)
            );
            const sp = farSpawns[Math.floor(Math.random() * Math.min(3, farSpawns.length))];
            dead.respawn(sp.pos, sp.yaw, 0.2);
          }
        }
      }

      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.finishMatch(true);
      }
      return;
    }

    if (!this.roundActive) {
      this.roundEndDelay -= dt;
      if (this.roundEndDelay <= 0) {
        if (this.allyScore >= ROUNDS_TO_WIN) {
          this.finishMatch(true);
        } else if (this.enemyScore >= ROUNDS_TO_WIN) {
          this.finishMatch(false);
        } else {
          this.roundNumber += 1;
          this.startRound();
        }
      }
      return;
    }

    this.roundTimer = Math.max(0, this.roundTimer - dt);
    const enemiesAlive = this.agents.filter((a) => a.team === 'enemy' && a.alive).length;
    const alliesAlive =
      (this.player.alive ? 1 : 0) + this.agents.filter((a) => a.team === 'ally' && a.alive).length;

    if (enemiesAlive === 0) {
      this.roundActive = false;
      this.roundEndDelay = 2.8;
      this.allyScore += 1;
      this.playerScore += 300;
      this.sound.playRoundHorn(true);
      const sub = this.roundKillStreak >= 5 ? 'ACE // SECTOR SECURED' : 'ALL HOSTILES ELIMINATED';
      this.hud.showBanner(sub, 'ROUND WON', 2.6);
    } else if (alliesAlive === 0 || this.roundTimer <= 0) {
      this.roundActive = false;
      this.roundEndDelay = 2.8;
      this.enemyScore += 1;
      this.sound.playRoundHorn(false);
      this.hud.showBanner(this.roundTimer <= 0 ? 'TIME EXPIRED' : 'SQUAD ELIMINATED', 'ROUND LOST', 2.6);
    }
  }

  private finishMatch(victory: boolean): void {
    this.roundActive = false;
    this.paused = true;
    this.fireHeld = false;
    this.adsHeld = false;
    this.player.clearKeys();
    this.hud.setVisible(false);
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    const title = document.getElementById('me-title')!;
    const sub = document.getElementById('me-subtitle')!;
    title.textContent = victory ? 'VICTORY' : 'DEFEAT';
    title.classList.toggle('defeat', !victory);
    sub.textContent =
      this.settings.mode === 'skirmish'
        ? `SKIRMISH COMPLETE // WAVE ${this.waveNumber}`
        : `FINAL SCORE ${this.allyScore} — ${this.enemyScore}`;

    const hsPct = this.playerKills > 0 ? Math.round((this.playerHeadshots / this.playerKills) * 100) : 0;
    document.getElementById('me-kills')!.textContent = String(this.playerKills);
    document.getElementById('me-hs')!.textContent = `${hsPct}%`;
    document.getElementById('me-deaths')!.textContent = String(this.playerDeaths);
    document.getElementById('me-score')!.textContent = String(this.playerScore);

    const playAgainBtn = document.getElementById('btn-play-again');
    const backMenuBtn = document.getElementById('btn-back-menu');
    if (playAgainBtn) playAgainBtn.textContent = 'DEPLOY AGAIN';
    if (backMenuBtn) backMenuBtn.textContent = 'MAIN MENU';

    this.matchEndOverlay.classList.remove('hidden');
  }

  private updateSpotting(): void {
    if (!this.player.alive) return;
    const eye = this.player.getEyePosition(this.tmpEyePos);
    const fwd = this.tmpCamFwd;
    this.camera.getWorldDirection(fwd);

    if (this.isTdmMatch) {
      const dir = new THREE.Vector3();
      const maxLosDist = this.settings.map === 'downtown' ? 118 : 74;
      const maxSpotDist = this.settings.map === 'downtown' ? 98 : 64;
      for (const rp of this.remotePlayers.values()) {
        if (!rp.alive || rp.team === this.tdmLocalTeam) {
          rp.losVisible = false;
          continue;
        }
        const rpEye = rp.getEyePosition();
        const dx = rpEye.x - eye.x;
        const dy = rpEye.y - eye.y;
        const dz = rpEye.z - eye.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > maxLosDist) {
          rp.losVisible = false;
          continue;
        }
        const inv = 1 / Math.max(0.001, dist);
        const dot = fwd.x * dx * inv + fwd.y * dy * inv + fwd.z * dz * inv;
        if (dot > 0.32) {
          // Fast pure-JS analytical AABB + smoke sphere LOS (50x faster than Three.js triangle raycasting!)
          dir.set(dx * inv, dy * inv, dz * inv);
          let clear = !this.raycastSolidColliders(eye, dir, Math.max(0.05, dist - 0.15));
          if (clear && this.abilities.smokes.length > 0) {
            for (const sm of this.abilities.smokes) {
              const ocx = sm.pos.x - eye.x;
              const ocy = sm.pos.y - eye.y;
              const ocz = sm.pos.z - eye.z;
              const t = ocx * dir.x + ocy * dir.y + ocz * dir.z;
              if (t > 0 && t < dist) {
                const px = eye.x + dir.x * t - sm.pos.x;
                const py = eye.y + dir.y * t - sm.pos.y;
                const pz = eye.z + dir.z * t - sm.pos.z;
                if (px * px + py * py + pz * pz < sm.radius * sm.radius) {
                  clear = false;
                  break;
                }
              }
            }
          }
          rp.losVisible = clear || dist < 3.0;
          if (clear && dot > 0.56 && dist <= maxSpotDist) {
            rp.spottedTimer = 2.6;
          }
        } else {
          rp.losVisible = dist < 3.0;
        }
      }
      return;
    }

    for (const a of this.agents) {
      if (!a.alive || a.team !== 'enemy') continue;
      const toEnemy = new THREE.Vector3().subVectors(a.getEyePosition(), eye);
      const dist = toEnemy.length();
      if (dist > 36) continue;
      toEnemy.divideScalar(dist);
      if (fwd.dot(toEnemy) > 0.58 && hasClearSight(eye, a.getEyePosition(), this.level.raycastMeshes, this.abilities.smokes)) {
        a.spottedTimer = 2.6;
      }
    }
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);

    // 60 FPS frame pacer: locks 120Hz/144Hz monitors smoothly to 60 FPS while never skipping 60Hz vblanks
    if (now - this.lastRenderTime < this.targetFrameMs) {
      return;
    }
    this.lastRenderTime = now;

    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const elapsed = now * 0.001;

    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.4) {
      this.hud.updateFps(Math.min(60, Math.round(this.fpsFrames / this.fpsAccum)));
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    // Animated burning braziers, snowflakes, neon pulse & Downtown GTA-style civilian NPCs!
    this.level.updateAtmosphere(dt, elapsed, this.player.pos);

    // Universal Auto-60-FPS Booster: after initial 5s GLB/shader warm-up, steps down only if FPS stays persistently below ~38!
    if (!this.userPickedGraphics && !this.paused && this.graphicsPreset !== 'laptop' && elapsed > 5.0) {
      if (dt > 0.0265) {
        this.tdmSlowFrameAccum += dt;
        if (this.tdmSlowFrameAccum > 1.35) {
          this.tdmSlowFrameAccum = 0;
          if (this.graphicsPreset === 'bloom') {
            this.applyGraphicsPreset('perf');
            this.hud.showToast('AUTO-BOOST: MAX 60 FPS MODE ENABLED', 'heal', 2.0);
          } else {
            this.applyGraphicsPreset('laptop');
            this.hud.showToast('AUTO-BOOST: LOW END DEVICE MODE ENABLED', 'heal', 2.0);
          }
        }
      } else {
        this.tdmSlowFrameAccum = Math.max(0, this.tdmSlowFrameAccum - dt * 0.5);
      }
    }

    if (this.isTdmMatch) {
      // Live Online TDM: simulation, remote 3rd-person players, grenades & timer ALWAYS keep ticking even if ESC menu is open!
      if (!this.paused) {
        const healSpeedMult = this.activeHeal ? 0.45 : 1.0;
        this.player.update(
          dt,
          this.level.colliders,
          this.camera,
          this.weapons.currentWeapon.moveSpeedMult * healSpeedMult,
          this.weapons.recoilPitch,
          this.weapons.recoilYaw,
          this.level.mapBounds,
          this.level.ramps
        );

        // Prevent player from overlapping any alive TDM teammate, enemy, or EMBER bot (while strictly preserving wall bounds!)
        this.tmpOtherBodies.length = 0;
        for (const rp of this.remotePlayers.values()) {
          if (rp.alive) this.tmpOtherBodies.push(rp.pos);
        }
        this.player.resolveCharacterOverlap(
          this.tmpOtherBodies,
          this.level.colliders,
          this.level.mapBounds,
          this.level.ramps,
          this.camera
        );

        if (this.player.alive && this.roundActive) {
          this.handlePlayerShot();
        } else {
          this.fireJustPressed = false;
        }
      } else {
        this.fireJustPressed = false;
      }

      this.updateTdmHealing(dt);

      // Tick 3-second Respawn Invulnerability Shield on local player & authoritatively on Host for all players!
      if (this.localSpawnShield > 0) {
        this.localSpawnShield = this.player.alive ? Math.max(0, this.localSpawnShield - dt) : 0;
      }
      if (this.mp.isHost) {
        for (const st of this.hostLivePlayers.values()) {
          if (st.spawnShield > 0) {
            st.spawnShield = st.alive ? Math.max(0, st.spawnShield - dt) : 0;
          }
        }
        this.updateHostBotEmber(dt);
      }

      const playerEye = this.player.getEyePosition(this.tmpEyePos);
      const camFwd = this.tmpCamFwd;
      this.camera.getWorldDirection(camFwd);
      const wallClearance = this.player.alive ? this.computeCameraWallClearance(playerEye, camFwd) : 1.35;

      this.weapons.setVisible(this.player.alive);
      this.weapons.update(
        dt,
        this.paused ? 0 : this.player.horizontalSpeed,
        this.player.crouching,
        this.player.grounded,
        !this.paused && this.adsHeld && this.player.alive && !this.activeHeal,
        wallClearance
      );

      this.abilities.update(
        dt,
        this.level.colliders,
        this.level.raycastMeshes,
        [],
        playerEye,
        camFwd,
        (strength) => {
          // 3-second Spawn Shield blocks Flashbang blinding too!
          if (this.localSpawnShield <= 0) {
            this.hud.triggerFlash(strength);
          }
        },
        (pos) => this.weapons.spawnExplosion(pos, 1.15, 0xffb838),
        (ev) => {
          this.weapons.spawnExplosion(ev.pos, 2.35, 0xff5a18);
          if (ev.playerShake > 0 && this.localSpawnShield <= 0) this.player.addShake(ev.playerShake);
          if (this.mp.isHost) {
            this.handleHostTdmFragDetonation(ev.pos, ev.ownerId ?? this.mp.localPlayerId);
          }
        }
      );

      // Update all 3rd-person rigged remote human players & bots (wall clamping + 3rd-person CQB rifle tuck!)
      for (const rp of this.remotePlayers.values()) {
        rp.update(dt, this.level.colliders, this.level.mapBounds, this.level.ramps);
      }

      // Animate dropped utility loot crates & detect nearest crate within pickup range (F) — works mid-round & post-round!
      let closestDrop: LootDrop | null = null;
      let closestDistSq = TDM_LOOT_PICKUP_RANGE * TDM_LOOT_PICKUP_RANGE;
      for (const drop of this.lootDrops.values()) {
        drop.update(dt, elapsed);
        if (this.player.alive && Math.abs(drop.pos.y - this.player.pos.y) < 1.9) {
          const dx = drop.pos.x - this.player.pos.x;
          const dz = drop.pos.z - this.player.pos.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < closestDistSq) {
            closestDistSq = dSq;
            closestDrop = drop;
          }
        }
      }
      this.nearestLootId = closestDrop ? closestDrop.id : null;

      // 20 Hz compact rounded Host Snapshot / Client Pose sync (50% less WebRTC bandwidth & JSON CPU -> smoother on Wi-Fi!)
      this.netSyncAccum += dt;
      if (this.netSyncAccum >= 0.05) {
        this.netSyncAccum = 0;
        const r3 = (v: number) => Math.round(v * 1000) * 0.001;
        if (this.mp.isHost) {
          const selfState = this.hostLivePlayers.get(this.mp.localPlayerId);
          if (selfState) {
            selfState.x = r3(this.player.pos.x);
            selfState.y = r3(this.player.pos.y);
            selfState.z = r3(this.player.pos.z);
            selfState.yaw = r3(this.player.yaw);
            selfState.pitch = r3(this.player.pitch);
            selfState.crouching = this.player.crouching;
            selfState.weaponSlot = this.weapons.currentSlot;
          }
          this.mp.broadcastSnapshot({
            roundNumber: this.roundNumber,
            roundTimer: Math.round(this.roundTimer * 10) * 0.1,
            roundActive: this.roundActive,
            blueScore: this.allyScore,
            redScore: this.enemyScore,
            players: [...this.hostLivePlayers.values()],
          });
        } else {
          this.mp.sendLocalPose({
            x: r3(this.player.pos.x),
            y: r3(this.player.pos.y),
            z: r3(this.player.pos.z),
            yaw: r3(this.player.yaw),
            pitch: r3(this.player.pitch),
            crouching: this.player.crouching,
            weaponSlot: this.weapons.currentSlot,
          });
        }
      }

      this.spottingTimer -= dt;
      if (this.spottingTimer <= 0) {
        this.spottingTimer = 0.1;
        this.updateSpotting();
      }

      if (this.mp.isHost) {
        this.updateTdmHostRoundRules(dt);
      } else if (this.roundActive) {
        this.roundTimer = Math.max(0, this.roundTimer - dt);
      }

      if (!this.paused) {
        const ammo = this.weapons.currentAmmo;
        this.hud.updateVitals(this.player.hp, this.player.shield, false);
        this.hud.updateWeapon(
          this.weapons.currentWeapon,
          this.weapons.currentSlot,
          ammo.mag,
          ammo.reserve,
          this.weapons.isReloading,
          this.weapons.reloadProgress
        );
        this.hud.updateAbilities(this.abilities.charges);
        this.hud.updateMedkits(this.tdmBandages, this.tdmMedkits, this.activeHeal?.kind ?? null);
        this.hud.updateSpawnShield(this.localSpawnShield, TDM_SPAWN_SHIELD_DURATION);
        this.hud.updateLootPrompt(
          closestDrop ? closestDrop.victimName : null,
          closestDrop ? this.formatUtilitySummary(closestDrop.contents) : []
        );
        this.hud.updateCrosshair(this.weapons.currentSpread, this.weapons.isAds);
        const zoneBase = this.player.getZoneName(this.level.zones);
        this.hud.updateZone(this.player.pos.y >= 3.5 ? `${zoneBase} (2F)` : zoneBase);

        const bluePips: boolean[] = [];
        const redPips: boolean[] = [];
        if (this.tdmLocalTeam === 'blue') bluePips.push(this.player.alive);
        else redPips.push(this.player.alive);
        for (const rp of this.remotePlayers.values()) {
          if (rp.team === 'blue') bluePips.push(rp.alive);
          else redPips.push(rp.alive);
        }

        this.hud.updateScoreboard(
          this.allyScore,
          this.enemyScore,
          `ROUND ${this.roundNumber}`,
          this.roundTimer,
          bluePips,
          redPips
        );
        this.hud.tick(dt, this.player.hp <= 30 && this.player.alive);

        // Floating overhead player names using 10 Hz cached LOS (ZERO per-frame raycasts -> zero lag!)
        const nameplates: NameplateTarget[] = [];
        const extraDots: Array<{ pos: THREE.Vector3; color: string }> = [];
        for (const rp of this.remotePlayers.values()) {
          if (!rp.alive) continue;
          const isTeammate = rp.team === this.tdmLocalTeam;
          const label = rp.spawnShield > 0 ? `🛡 ${rp.name}` : rp.name;
          if (isTeammate) {
            extraDots.push({ pos: rp.pos, color: '#36f0df' });
            nameplates.push({
              id: rp.id,
              name: label,
              team: rp.team,
              hpRatio: rp.hp / Math.max(1, rp.maxHp),
              headWorld: rp.getHeadWorldPosition(this.tmpHeadPos.clone()),
            });
          } else {
            if (rp.spottedTimer > 0) {
              extraDots.push({ pos: rp.pos, color: '#ff3d54' });
            }
            if (rp.losVisible) {
              nameplates.push({
                id: rp.id,
                name: label,
                team: rp.team,
                hpRatio: rp.hp / Math.max(1, rp.maxHp),
                headWorld: rp.getHeadWorldPosition(this.tmpHeadPos.clone()),
              });
            }
          }
        }
        // Floating 3D "[F] - LOOT" marker directly over every dropped utility crate!
        for (const drop of this.lootDrops.values()) {
          nameplates.push({
            id: `loot_${drop.id}`,
            name: `F -> LOOT • ${drop.victimName}`,
            team: 'loot',
            hpRatio: 1,
            headWorld: new THREE.Vector3(drop.pos.x, drop.pos.y + 0.92, drop.pos.z),
          });
        }
        this.hud.updateNameplates(nameplates, this.camera);
        this.minimap.render(this.player.pos, this.player.yaw, [], this.abilities.smokes, extraDots);
      }
    } else if (!this.paused) {
      this.player.update(
        dt,
        this.level.colliders,
        this.camera,
        this.weapons.currentWeapon.moveSpeedMult,
        this.weapons.recoilPitch,
        this.weapons.recoilYaw,
        this.level.mapBounds,
        this.level.ramps
      );

      // Prevent player from overlapping any alive Solo AI ally or enemy bot (while strictly preserving wall bounds!)
      this.tmpOtherBodies.length = 0;
      for (const agent of this.agents) {
        if (agent.alive) this.tmpOtherBodies.push(agent.pos);
      }
      this.player.resolveCharacterOverlap(
        this.tmpOtherBodies,
        this.level.colliders,
        this.level.mapBounds,
        this.level.ramps,
        this.camera
      );

      if (this.player.alive && this.roundActive) {
        this.handlePlayerShot();
      } else {
        this.fireJustPressed = false;
      }

      const playerEye = this.player.getEyePosition(this.tmpEyePos);
      const camFwd = this.tmpCamFwd;
      this.camera.getWorldDirection(camFwd);
      const wallClearance = this.player.alive ? this.computeCameraWallClearance(playerEye, camFwd) : 1.35;

      this.weapons.setVisible(this.player.alive);
      this.weapons.update(
        dt,
        this.player.horizontalSpeed,
        this.player.crouching,
        this.player.grounded,
        this.adsHeld && this.player.alive,
        wallClearance
      );

      this.abilities.update(
        dt,
        this.level.colliders,
        this.level.raycastMeshes,
        this.agents,
        playerEye,
        camFwd,
        (strength) => this.hud.triggerFlash(strength),
        (pos) => this.weapons.spawnExplosion(pos, 1.15, 0xffb838),
        (ev) => {
          // Massive fiery frag grenade blast + concussion camera shake + shrapnel hits/kills!
          this.weapons.spawnExplosion(ev.pos, 2.35, 0xff5a18);
          if (ev.playerShake > 0) this.player.addShake(ev.playerShake);

          let hitAny = false;
          let killedAny = false;
          for (const h of ev.hits) {
            hitAny = true;
            const blastDir = new THREE.Vector3().subVectors(h.agent.pos, ev.pos).setY(0.35).normalize();
            const chestHit = h.agent.pos.clone().add(new THREE.Vector3(0, 1.05, 0));
            this.weapons.spawnImpact(chestHit, blastDir, true, false, h.killed);
            this.projectWallBloodSplatter(chestHit, blastDir, h.killed ? 1.18 : 0.72);
            if (h.killed) {
              killedAny = true;
              this.weapons.spawnBloodPool(h.agent.pos, true, blastDir);
              this.weapons.spawnDroppedWeapon(h.agent.pos, h.agent.yaw, blastDir);
              this.onEnemyKilledByPlayer(h.agent, 'FRAG GRENADE', false);
            }
          }
          if (hitAny) {
            this.sound.playHit(killedAny);
            this.hud.showHitmarker(killedAny);
          }

          if (ev.playerDamage > 0 && this.player.alive) {
            const toBlast = new THREE.Vector3().subVectors(ev.pos, this.player.pos);
            const relAngle = Math.atan2(toBlast.x, -toBlast.z) + this.player.yaw;
            this.hud.triggerDamage(relAngle);
            const res = this.player.takeDamage(ev.playerDamage);
            this.recordPlayerDamage('FRAG GRENADE', ev.playerDamage, 'FRAG GRENADE', res.died);
            if (res.died) {
              this.playerDeaths += 1;
              this.hud.pushKillfeed('YOU', 'ally', 'YOU', 'ally', 'FRAG GRENADE', false);
              if (this.settings.mode === 'skirmish') {
                this.finishMatch(false);
              }
            }
          }
        }
      );

      for (const agent of this.agents) {
        agent.update(
          dt,
          this.agents,
          this.player.pos,
          playerEye,
          this.player.alive,
          this.level.waypoints,
          this.level.colliders,
          this.level.raycastMeshes,
          this.abilities.smokes,
          this.settings.difficulty,
          this.roundActive,
          (ev) => this.handleAgentFire(ev),
          this.level.mapBounds,
          this.level.ramps
        );
      }

      // Throttle player vision spotting raycasts to 10 Hz
      this.spottingTimer -= dt;
      if (this.spottingTimer <= 0) {
        this.spottingTimer = 0.1;
        this.updateSpotting();
      }
      this.updateRoundRules(dt);

      const ammo = this.weapons.currentAmmo;
      this.hud.updateVitals(this.player.hp, this.player.shield, false);
      this.hud.updateWeapon(
        this.weapons.currentWeapon,
        this.weapons.currentSlot,
        ammo.mag,
        ammo.reserve,
        this.weapons.isReloading,
        this.weapons.reloadProgress
      );
      this.hud.updateAbilities(this.abilities.charges);
      this.hud.updateCrosshair(this.weapons.currentSpread, this.weapons.isAds);
      this.hud.updateZone(this.player.getZoneName(this.level.zones));

      const allyPips = [
        this.player.alive,
        ...this.agents.filter((a) => a.team === 'ally').map((a) => a.alive),
      ];
      const enemyPips = this.agents.filter((a) => a.team === 'enemy').map((a) => a.alive);
      const roundLbl =
        this.settings.mode === 'skirmish' ? `WAVE ${this.waveNumber}` : `ROUND ${this.roundNumber}`;

      this.hud.updateScoreboard(
        this.settings.mode === 'skirmish' ? this.playerKills : this.allyScore,
        this.settings.mode === 'skirmish' ? this.playerDeaths : this.enemyScore,
        roundLbl,
        this.roundTimer,
        allyPips,
        enemyPips
      );
      this.hud.tick(dt, this.player.hp <= 30 && this.player.alive);
      const nameplates: NameplateTarget[] = [];
      for (const a of this.agents) {
        if (a.alive && a.team === 'ally') {
          nameplates.push({
            id: a.id,
            name: a.name,
            team: 'blue',
            hpRatio: a.hp / Math.max(1, a.maxHp),
            headWorld: a.getHeadWorldPosition(this.tmpHeadPos.clone()),
          });
        }
      }
      this.hud.updateNameplates(nameplates, this.camera);
      this.minimap.render(this.player.pos, this.player.yaw, this.agents, this.abilities.smokes);
    } else {
      const t = now * 0.00045;
      this.camera.position.x = this.level.playerSpawn.pos.x + Math.sin(t) * 0.16;
      this.camera.position.y = this.level.playerSpawn.pos.y + 1.66 + Math.cos(t * 1.4) * 0.03;
      this.weapons.setVisible(true);
      this.weapons.update(dt, 0, false, true, false);
      for (const agent of this.agents) {
        agent.update(
          dt,
          this.agents,
          this.player.pos,
          this.player.getEyePosition(),
          false,
          this.level.waypoints,
          this.level.colliders,
          this.level.raycastMeshes,
          this.abilities.smokes,
          this.settings.difficulty,
          false,
          () => {}
        );
      }
    }

    // Render through full-DPR 8x MSAA EffectComposer + selective HDR Bloom on BOTH Factory & Foundry!
    if (this.bloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };
}

preloadSoldierTemplate().then(() => {
  new SkyfallGame();
});
