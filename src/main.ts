import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Difficulty, GameMode, GameSettings } from './types';
import { SoundEngine } from './audio/SoundEngine';
import { createTextureLibrary } from './textures/ProceduralTextures';
import { BuiltLevel, LevelBuilder } from './world/LevelBuilder';
import { PlayerController } from './player/PlayerController';
import { WeaponSystem } from './weapons/WeaponSystem';
import { AgentFireEvent, TacticalAgent, hasClearSight } from './entities/AgentAI';
import { AbilitySystem } from './abilities/AbilitySystem';
import { Minimap } from './ui/Minimap';
import { HUD } from './ui/HUD';

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

  // Overhead cool cyan fluorescent strips
  const cyanStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.8, 3.4) });
  for (const x of [-4.5, 0, 4.5]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 14), cyanStripMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.set(x, 6.6, 0);
    envScene.add(strip);
  }

  // Warm orange/amber fire bounce patches near lower walls
  const amberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.35, 0.35) });
  const fireWall1 = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 4.2), amberMat);
  fireWall1.position.set(-7.5, 1.8, -11.5);
  envScene.add(fireWall1);

  const fireWall2 = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.6), amberMat);
  fireWall2.rotation.y = -Math.PI / 2;
  fireWall2.position.set(11.5, 1.8, 4.5);
  envScene.add(fireWall2);

  // Crimson / magenta side rim glow
  const crimsonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.9, 0.32, 0.82) });
  const sideGlow = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 4.0), crimsonMat);
  sideGlow.rotation.y = Math.PI / 2;
  sideGlow.position.set(-11.5, 3.5, 2.5);
  envScene.add(sideGlow);

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

  private sound = new SoundEngine();
  private level: BuiltLevel;
  private player: PlayerController;
  private weapons: WeaponSystem;
  private abilities: AbilitySystem;
  private minimap: Minimap;
  private hud = new HUD();

  private agents: TacticalAgent[] = [];
  private raycaster = new THREE.Raycaster();

  private settings: GameSettings = {
    mode: 'tactical',
    difficulty: 'tactical',
    sensitivity: 1.0,
    volume: 0.75,
    crosshairColor: '#00ffbf',
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
  private bloomEnabled = false; // Default direct fast renderer for rock-solid 60 FPS!
  private readonly targetFrameMs = 1000 / 60 - 1.5; // Smooth 60 FPS cap without skipping 60Hz vblanks!

  private menuOverlay = document.getElementById('menu-overlay')!;
  private matchEndOverlay = document.getElementById('match-end-overlay')!;
  private btnDeploy = document.getElementById('btn-deploy')!;
  private btnDeployLabel = document.getElementById('btn-deploy-label')!;
  private btnRestart = document.getElementById('btn-restart')!;

  constructor() {
    // 1. High-efficiency 60 FPS WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // 2. Scene, Camera & PMREM Industrial Environment Reflections
    this.scene = new THREE.Scene();
    this.scene.environment = buildIndustrialEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 180);
    this.scene.add(this.camera);

    // 3. Optional half-res Bloom Post-Processing (off by default for locked 60 FPS; toggleable in menu)
    this.setupPostProcessing();

    // 4. Build Dark Gritty Industrial Foundry Arena
    const textures = createTextureLibrary();
    const builder = new LevelBuilder(textures);
    this.level = builder.build(this.scene);

    // 5. Core gameplay subsystems
    this.player = new PlayerController(this.sound);
    this.weapons = new WeaponSystem(this.scene, this.camera, this.sound, textures);
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
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      composer.setSize(w, h);

      const renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.floor(w * 0.5), Math.floor(h * 0.5)),
        0.34,
        0.4,
        0.88
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
    document.querySelectorAll<HTMLButtonElement>('#mode-list .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-list .mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.mode = btn.dataset.mode as GameMode;
        if (this.matchStarted) {
          this.matchStarted = false;
          this.btnDeployLabel.textContent = 'DEPLOY TO SECTOR 07';
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
        const dprCap = this.bloomEnabled ? 1.5 : 1.25;
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
      this.btnDeployLabel.textContent = 'DEPLOY TO SECTOR 07';
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

    window.addEventListener('wheel', (e) => {
      if (this.paused || !this.player.alive) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = (this.weapons.currentSlot + dir + 3) % 3;
      this.weapons.selectSlot(next);
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
      else if (e.code === 'Digit3') this.weapons.selectSlot(2);
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
        this.abilities.useStim(() => this.player.activateStim());
      }
    });

    window.addEventListener('keyup', (e) => {
      this.player.onKeyUp(e.code);
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

  private startRound(): void {
    this.roundActive = true;
    this.roundEndDelay = 0;
    this.roundTimer = this.settings.mode === 'skirmish' ? 180 : ROUND_DURATION;
    this.roundKillStreak = 0;

    this.player.reset(this.level.playerSpawn.pos, this.level.playerSpawn.yaw);
    this.weapons.resetAll();
    this.abilities.resetCharges();
    this.spawnAgentsForRound(false);

    if (this.settings.mode === 'skirmish') {
      this.hud.showBanner('ENDLESS SKIRMISH', 'HOLD FOUNDRY BAY 07', 2.2);
    } else {
      const sub = this.settings.mode === 'tactical' ? 'FOUNDRY BREACH // 3v5' : 'SOLO CLUTCH // 1v5';
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
          this.scene
        );
        ally.respawn(sp.pos, sp.yaw, showcaseOnly ? 99 : idx === 0 ? 3.2 : 1.6);
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
        this.scene
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

    const targets: THREE.Object3D[] = [...this.level.raycastMeshes];
    for (const agent of this.agents) {
      if (agent.alive && agent.team === 'enemy') {
        targets.push(...agent.rig.hitMeshes);
      }
    }

    this.raycaster.set(shot.origin, shot.direction);
    this.raycaster.near = 0.05;
    this.raycaster.far = shot.weapon.range;

    const hits = this.raycaster.intersectObjects(targets, false);
    const endPoint = shot.origin.clone().addScaledVector(shot.direction, shot.weapon.range);

    if (hits.length > 0) {
      const hit = hits[0];
      endPoint.copy(hit.point);
      const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : shot.direction.clone().negate();

      const agentId = hit.object.userData.agentId as string | undefined;
      if (agentId) {
        const agent = this.agents.find((a) => a.id === agentId);
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
          const res = agent.takeDamage(dmg);
          this.weapons.spawnImpact(hit.point, normal, true, isHead);
          this.sound.playHit(isHead);
          this.hud.showHitmarker(isHead);

          if (res.killed) {
            // Explosive fiery combat burst + ember shower on takedown!
            this.weapons.spawnExplosion(
              agent.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
              isHead ? 1.1 : 0.85,
              isHead ? 0xff7b24 : 0xff4624
            );
            this.onEnemyKilledByPlayer(agent, shot.weapon.name, isHead);
          }
        }
      } else {
        this.weapons.spawnImpact(hit.point, normal, false, false);
      }
    }

    if (shot.weapon.id !== 'knife') {
      const tracerColor = shot.weapon.id === 'vandal' ? 0xff6b24 : 0x42f0ff;
      this.weapons.spawnTracer(shot.muzzleWorld, endPoint, tracerColor, shot.weapon.id === 'vandal' ? 0.017 : 0.011);
    }
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
      this.weapons.ammo.vandal.reserve = Math.min(75, this.weapons.ammo.vandal.reserve + 15);
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

    this.raycaster.set(ev.muzzleWorld, ev.direction);
    this.raycaster.near = 0.05;
    this.raycaster.far = 55;

    const wallHits = this.raycaster.intersectObjects(this.level.raycastMeshes, false);
    let maxDist = wallHits.length > 0 ? wallHits[0].distance : 55;
    let impactPoint = ev.muzzleWorld.clone().addScaledVector(ev.direction, maxDist);
    let impactNormal: THREE.Vector3 | null =
      wallHits.length > 0 && wallHits[0].face
        ? wallHits[0].face.normal.clone().transformDirection(wallHits[0].object.matrixWorld).normalize()
        : null;

    let hitAgent: TacticalAgent | null = null;
    for (const candidate of this.agents) {
      if (!candidate.alive || candidate.team === ev.attackerTeam) continue;
      const hits = this.raycaster.intersectObjects(candidate.rig.hitMeshes, false);
      if (hits.length > 0 && hits[0].distance < maxDist) {
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
      const t = new THREE.Vector3().subVectors(playerCenter, ev.muzzleWorld).dot(ev.direction);
      if (t > 0.2 && t < maxDist) {
        const closest = ev.muzzleWorld.clone().addScaledVector(ev.direction, t);
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
      const toAttacker = new THREE.Vector3().subVectors(ev.muzzleWorld, this.player.pos);
      const worldAngle = Math.atan2(toAttacker.x, -toAttacker.z);
      const relAngle = worldAngle + this.player.yaw;
      this.hud.triggerDamage(relAngle);

      const res = this.player.takeDamage(ev.damage);
      if (res.died) {
        this.playerDeaths += 1;
        this.hud.pushKillfeed(ev.attackerName, 'enemy', 'YOU', 'ally', 'VANDAL 7.62', false);
        if (this.settings.mode === 'skirmish') {
          this.finishMatch(false);
        }
      }
    } else if (hitAgent) {
      const res = hitAgent.takeDamage(ev.damage);
      if (impactNormal) this.weapons.spawnImpact(impactPoint, impactNormal, true, false);
      if (res.killed) {
        this.weapons.spawnExplosion(hitAgent.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 0.85, 0xff5a22);
        this.hud.pushKillfeed(ev.attackerName, ev.attackerTeam, hitAgent.name, hitAgent.team, 'VANDAL 7.62', false);
      }
    } else if (impactNormal && wallHits.length > 0) {
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
        this.weapons.recoilYaw
      );

      if (this.player.alive && this.roundActive) {
        this.handlePlayerShot();
      } else {
        this.fireJustPressed = false;
      }
      this.weapons.update(
        dt,
        this.player.horizontalSpeed,
        this.player.crouching,
        this.player.grounded,
        this.adsHeld
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
        (pos) => this.weapons.spawnExplosion(pos, 1.15, 0xffb838)
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
      this.hud.updateVitals(this.player.hp, this.player.shield, this.player.stimTimer > 0);
      this.hud.updateWeapon(
        this.weapons.currentWeapon,
        this.weapons.currentSlot,
        ammo.mag,
        ammo.reserve,
        this.weapons.isReloading,
        this.weapons.reloadProgress
      );
      this.hud.updateAbilities(this.abilities.charges, this.player.stimTimer > 0);
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
      this.minimap.render(this.player.pos, this.player.yaw, this.agents, this.abilities.smokes);
    } else {
      const t = now * 0.00045;
      this.camera.position.x = this.level.playerSpawn.pos.x + Math.sin(t) * 0.16;
      this.camera.position.y = this.level.playerSpawn.pos.y + 1.66 + Math.cos(t * 1.4) * 0.03;
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

    if (this.bloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };
}

new SunfireGame();
