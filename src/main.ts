import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Difficulty, GameMode, GameSettings, MapId } from './types';
import { SoundEngine } from './audio/SoundEngine';
import { createTextureLibrary, TextureLibrary } from './textures/ProceduralTextures';
import { BuiltLevel, LevelBuilder } from './world/LevelBuilder';
import { PlayerController } from './player/PlayerController';
import { WeaponSystem } from './weapons/WeaponSystem';
import { preloadSoldierTemplate } from './entities/AgentModel';
import { AgentFireEvent, TacticalAgent, hasClearSight } from './entities/AgentAI';
import { AbilitySystem } from './abilities/AbilitySystem';
import { Minimap } from './ui/Minimap';
import { DamageHistoryEntry, HUD, NameplateTarget } from './ui/HUD';

const ROUNDS_TO_WIN = 5;
const ROUND_DURATION = 90;

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

class SunfireGame {
  private container = document.getElementById('game-container')!;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envFactory: THREE.Texture;
  private envFoundry: THREE.Texture;

  private sound = new SoundEngine();
  private textures: TextureLibrary;
  private level: BuiltLevel;
  private player: PlayerController;
  private weapons: WeaponSystem;
  private abilities: AbilitySystem;
  private minimap: Minimap;
  private hud = new HUD();

  private agents: TacticalAgent[] = [];
  private raycaster = new THREE.Raycaster();
  private roundDamageHistory = new Map<string, DamageHistoryEntry>();
  private tmpHeadPos = new THREE.Vector3();

  private settings: GameSettings = {
    map: 'factory',
    mode: 'tactical',
    difficulty: 'tactical',
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
  private matchEndOverlay = document.getElementById('match-end-overlay')!;
  private btnDeploy = document.getElementById('btn-deploy')!;
  private btnDeployLabel = document.getElementById('btn-deploy-label')!;
  private btnRestart = document.getElementById('btn-restart')!;

  constructor() {
    // 1. Razor-sharp full HiDPI hardware MSAA WebGL renderer (up to 2x native DPR!)
    const sharpDpr = Math.min(window.devicePixelRatio, 2.0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(sharpDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // 2. Scene, Camera & Dual PMREM Environments (Sunlit Cryzen Factory + Industrial Foundry 07)
    this.scene = new THREE.Scene();
    this.envFactory = buildDaylightEnvironment(this.renderer);
    this.envFoundry = buildIndustrialEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
    this.scene.add(this.camera);

    // 3. Half-res Selective HDR Bloom Post-Processing
    this.setupPostProcessing();

    // 4. Build Active Arena Map (FACTORY CRYZEN default)
    this.textures = createTextureLibrary();
    this.applyMapAtmosphereConfig(this.settings.map);
    const builder = new LevelBuilder(this.textures);
    this.level = builder.build(this.scene, this.settings.map);

    // 5. Core gameplay subsystems
    this.player = new PlayerController(this.sound);
    this.weapons = new WeaponSystem(this.scene, this.camera, this.sound, this.textures);
    this.abilities = new AbilitySystem(this.scene, this.sound);

    const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimap = new Minimap(mmCanvas, this.level.minimapRects, this.level.mapBounds);

    // 6. Initial live menu showcase staging
    this.setupShowcaseFrame();

    // 7. Bind UI & controls
    this.bindMenuUI();
    this.bindInputs();

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

  private setupPostProcessing(): void {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio, 2.0);
      const maxSamples = this.renderer.capabilities.isWebGL2
        ? Math.min(8, this.renderer.capabilities.maxSamples || 4)
        : 0;
      // Full-DPR multi-sampled MSAA render target so guns & characters stay razor-sharp even with Bloom!
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
    this.scene.environment = isFactory ? this.envFactory : this.envFoundry;
    this.renderer.toneMappingExposure = isFactory ? 1.15 : 1.24;
    if (this.bloomPass) {
      // Selective HDR Bloom on BOTH maps: higher threshold on Vikendi keeps crisp sunlit snow sharp while beacons, windows & fire glow!
      this.bloomPass.threshold = isFactory ? 1.18 : 0.8;
      this.bloomPass.strength = isFactory ? 0.35 : 0.42;
      this.bloomPass.radius = isFactory ? 0.44 : 0.48;
    }
    const brandTag = document.getElementById('brand-tag');
    if (brandTag) {
      brandTag.textContent = isFactory
        ? 'VIKENDI // SNOW COMPOUND'
        : 'WAREHOUSE // NIGHT SHIFT';
    }
    if (!this.matchStarted) {
      this.btnDeployLabel.textContent = isFactory ? 'DEPLOY TO VIKENDI' : 'DEPLOY TO WAREHOUSE';
    }
  }

  private switchMap(mapId: MapId): void {
    if (this.settings.map === mapId) return;
    this.settings.map = mapId;
    this.scene.remove(this.level.group);
    this.weapons.clearRoundFx();
    this.abilities.resetCharges();

    this.applyMapAtmosphereConfig(mapId);
    const builder = new LevelBuilder(this.textures);
    this.level = builder.build(this.scene, mapId);

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
    document.querySelectorAll<HTMLButtonElement>('#map-pills .pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#map-pills .pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchMap(btn.dataset.map as MapId);
      });
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

    document.querySelectorAll<HTMLButtonElement>('#graphics-pills .pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#graphics-pills .pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.bloomEnabled = btn.dataset.gfx === 'bloom';
        const dprCap = this.bloomEnabled ? 2.0 : 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
        this.composer?.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
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
      if (!this.matchStarted) {
        this.startNewMatch();
      } else {
        this.resumeGame();
      }
    });

    this.btnRestart.addEventListener('click', () => {
      this.sound.unlock();
      this.startNewMatch();
    });

    document.getElementById('btn-play-again')!.addEventListener('click', () => {
      this.matchEndOverlay.classList.add('hidden');
      this.startNewMatch();
    });

    document.getElementById('btn-back-menu')!.addEventListener('click', () => {
      this.matchEndOverlay.classList.add('hidden');
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
        this.fireHeld = true;
        this.fireJustPressed = true;
      } else if (e.button === 2) {
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

      if (e.code === 'Digit1') this.weapons.selectSlot(0);
      else if (e.code === 'Digit2') this.weapons.selectSlot(1);
      else if (e.code === 'KeyR') this.weapons.startReload();
      else if (e.code === 'KeyQ') {
        const origin = this.player.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        this.abilities.throwFlash(origin, dir);
      } else if (e.code === 'KeyE') {
        const origin = this.player.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        this.abilities.throwSmoke(origin, dir);
      } else if (e.code === 'KeyC') {
        const origin = this.player.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        this.abilities.throwFrag(origin, dir);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.player.onKeyUp(e.code);
    });

    window.addEventListener('wheel', (e) => {
      if (this.paused || !this.player.alive) return;
      if (Math.abs(e.deltaY) > 2) {
        this.weapons.cycleSlot(e.deltaY);
      }
    });
  }

  private startNewMatch(): void {
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
    this.weapons.resetAll();
    this.weapons.clearRoundFx();
    this.abilities.resetCharges();
    this.spawnAgentsForRound(false);

    const mapTitle = this.settings.map === 'factory' ? 'VIKENDI' : 'WAREHOUSE';
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

    this.level.enemySpawns.forEach((sp, idx) => {
      const enemy = new TacticalAgent(
        `enemy-${idx}`,
        sp.name,
        'enemy',
        sp.role,
        sp.pos,
        sp.yaw,
        this.scene,
        this.textures
      );
      const hold = idx === 0 ? (showcaseOnly ? 99 : 2.6) : 0.4 + idx * 0.3;
      enemy.respawn(sp.pos, sp.yaw, hold);
      this.agents.push(enemy);
    });
  }

  private resumeGame(): void {
    this.paused = false;
    this.menuOverlay.classList.add('hidden');
    this.hud.setVisible(true);
    this.btnDeployLabel.textContent = 'RESUME OPERATION';
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
    this.btnDeployLabel.textContent = 'RESUME OPERATION';
    this.btnRestart.classList.remove('hidden');
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
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
    const enemyMeshes: THREE.Object3D[] = [];
    for (const agent of this.agents) {
      if (agent.alive && agent.team === 'enemy') {
        enemyMeshes.push(...agent.rig.hitMeshes);
      }
    }
    this.raycaster.far = Math.max(0.02, hardWallDist - 0.015);
    const agentHits = enemyMeshes.length > 0 ? this.raycaster.intersectObjects(enemyMeshes, false) : [];

    const endPoint = shot.origin.clone().addScaledVector(shot.direction, shot.weapon.range);

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

    this.matchEndOverlay.classList.remove('hidden');
  }

  private updateSpotting(): void {
    if (!this.player.alive) return;
    const eye = this.player.getEyePosition();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);

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

    // Animated burning braziers, flickering fluorescent tubes, exhaust fan & rising embers
    this.level.updateAtmosphere(dt, elapsed);

    if (!this.paused) {
      this.player.update(
        dt,
        this.level.colliders,
        this.camera,
        this.weapons.currentWeapon.moveSpeedMult,
        this.weapons.recoilPitch,
        this.weapons.recoilYaw,
        this.level.mapBounds
      );

      if (this.player.alive && this.roundActive) {
        this.handlePlayerShot();
      } else {
        this.fireJustPressed = false;
      }
      this.weapons.setVisible(this.player.alive);
      this.weapons.update(
        dt,
        this.player.horizontalSpeed,
        this.player.crouching,
        this.player.grounded,
        this.adsHeld && this.player.alive
      );

      const playerEye = this.player.getEyePosition();
      const camFwd = new THREE.Vector3();
      this.camera.getWorldDirection(camFwd);
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
          (ev) => this.handleAgentFire(ev)
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
  new SunfireGame();
});
