import * as THREE from 'three';
import { Team, WeaponDef } from '../types';

export interface NameplateTarget {
  id: string;
  name: string;
  hpRatio: number;
  headWorld: THREE.Vector3;
  team?: 'blue' | 'red' | 'loot';
}

export interface DamageHistoryEntry {
  attacker: string;
  totalDamage: number;
  hits: number;
  weapon: string;
  isKiller?: boolean;
}

interface DamageArc {
  angle: number; // radians relative to player forward
  life: number;
  maxLife: number;
}

export class HUD {
  private hudRoot = document.getElementById('hud')!;
  private elCrosshair = document.getElementById('crosshair')!;
  private elHp = document.getElementById('hud-hp')!;
  private elShield = document.getElementById('hud-shield')!;
  private elHpBar = document.getElementById('hud-hp-bar')!;
  private elMag = document.getElementById('hud-ammo-mag')!;
  private elRes = document.getElementById('hud-ammo-res')!;
  private elWepName = document.getElementById('hud-weapon-name')!;
  private elFireMode = document.getElementById('hud-fire-mode')!;
  private elZone = document.getElementById('zone-label')!;
  private elTimer = document.getElementById('round-timer')!;
  private elRoundLabel = document.getElementById('round-label')!;
  private elScoreAlly = document.getElementById('score-ally')!;
  private elScoreEnemy = document.getElementById('score-enemy')!;
  private elAllyPips = document.getElementById('ally-pips')!;
  private elEnemyPips = document.getElementById('enemy-pips')!;
  private elKillfeed = document.getElementById('killfeed')!;
  private elPerf = document.getElementById('perf-readout')!;

  private elHitmarker = document.getElementById('hitmarker')!;
  private elReloadWrap = document.getElementById('reload-ring-wrap')!;
  private elReloadFg = document.getElementById('reload-ring-fg')!;
  private elRoundBanner = document.getElementById('round-banner')!;
  private elBannerSub = document.getElementById('round-banner-sub')!;
  private elBannerTitle = document.getElementById('round-banner-title')!;
  private elKillEmblem = document.getElementById('kill-emblem')!;
  private elKillIcon = document.getElementById('kill-emblem-icon')!;
  private elKillText = document.getElementById('kill-emblem-text')!;

  private elFxFlash = document.getElementById('fx-flash')!;
  private elFxDmg = document.getElementById('fx-damage-vignette')!;
  private elFxStim = document.getElementById('fx-stim-vignette')!;
  private dmgArcCanvas = document.getElementById('fx-damage-arcs') as HTMLCanvasElement;
  private dmgArcCtx = this.dmgArcCanvas.getContext('2d')!;

  private elAbC = document.getElementById('ab-c')!;
  private elAbQ = document.getElementById('ab-q')!;
  private elAbE = document.getElementById('ab-e')!;
  private elAbB = document.getElementById('ab-b')!;
  private elAbM = document.getElementById('ab-m')!;
  private elAbCCharges = document.getElementById('ab-c-charges')!;
  private elAbQCharges = document.getElementById('ab-q-charges')!;
  private elAbECharges = document.getElementById('ab-e-charges')!;
  private elAbBCharges = document.getElementById('ab-b-charges')!;
  private elAbMCharges = document.getElementById('ab-m-charges')!;
  private elHealWrap = document.getElementById('heal-progress-wrap')!;
  private elHealLabel = document.getElementById('heal-label')!;
  private elHealTimer = document.getElementById('heal-timer')!;
  private elHealFill = document.getElementById('heal-fill')!;
  private elLootPrompt = document.getElementById('loot-prompt')!;
  private elLootTitle = document.getElementById('loot-prompt-title')!;
  private elLootItems = document.getElementById('loot-prompt-items')!;
  private elPickupToast = document.getElementById('pickup-toast')!;
  private elNameplates = document.getElementById('nameplates-layer')!;
  private elDamageHistory = document.getElementById('damage-history')!;
  private elDamageHistoryList = document.getElementById('dh-list')!;
  private nameplateEls = new Map<string, { root: HTMLDivElement; tag: HTMLDivElement; hpFill: HTMLDivElement }>();
  private projVec = new THREE.Vector3();

  private hitmarkerTimer = 0;
  private bannerTimer = 0;
  private killEmblemTimer = 0;
  private toastTimer = 0;
  private flashOpacity = 0;
  private damageVignette = 0;
  private damageArcs: DamageArc[] = [];
  private dmgCanvasDirty = false;

  // Dirty-check caches to prevent per-frame DOM layout thrashing (locked 60 FPS!)
  private lastGapPx = -1;
  private lastHp = -1;
  private lastShield = -1;
  private lastStim = false;
  private lastWeaponKey = '';
  private lastMag = -99;
  private lastRes = -99;
  private lastReloading = false;
  private lastAbKey = '';
  private lastMedKey = '';
  private lastHealKey = '';
  private lastLootKey = '';
  private lastZone = '';
  private lastScoreKey = '';
  private lastFlashStr = '';
  private lastDmgStr = '';

  public setVisible(visible: boolean): void {
    this.hudRoot.classList.toggle('hidden', !visible);
  }

  public setCrosshairColor(hex: string): void {
    this.elCrosshair.style.setProperty('--ch-color', hex);
  }

  public updateCrosshair(spreadRad: number, isAds: boolean): void {
    const gapPx = Math.round(Math.max(2, Math.min(34, (spreadRad * 460 + 3) * (isAds ? 0.65 : 1))));
    if (gapPx !== this.lastGapPx) {
      this.lastGapPx = gapPx;
      // Scoped to #crosshair only (avoids full-document :root style invalidation!)
      this.elCrosshair.style.setProperty('--ch-gap', `${gapPx}px`);
    }
  }

  public showHitmarker(headshot: boolean): void {
    this.hitmarkerTimer = headshot ? 0.24 : 0.14;
    this.elHitmarker.classList.add('active');
    this.elHitmarker.classList.toggle('headshot', headshot);
  }

  public showKillEmblem(streak: number, headshot: boolean): void {
    const labels = ['ELIMINATION', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'ACE!'];
    const label = labels[Math.min(Math.max(streak - 1, 0), labels.length - 1)];
    this.elKillText.textContent = headshot ? `${label} // HEADSHOT` : label;
    this.elKillIcon.textContent = headshot ? '⌖' : streak >= 5 ? '★' : '✦';
    this.elKillEmblem.classList.remove('hidden');
    this.elKillEmblem.style.animation = 'none';
    void this.elKillEmblem.offsetWidth;
    this.elKillEmblem.style.animation = '';
    this.killEmblemTimer = 2.0;
  }

  public pushKillfeed(
    killer: string,
    killerTeam: Team,
    victim: string,
    victimTeam: Team,
    weapon: string,
    headshot: boolean
  ): void {
    const item = document.createElement('div');
    item.className = `kf-item ${killerTeam === 'enemy' ? 'enemy-kill' : ''}`;
    item.innerHTML = `
      <span class="kf-killer ${killerTeam}">${killer}</span>
      <span class="kf-weapon">${weapon}</span>
      ${headshot ? '<span class="kf-hs">⌖</span>' : ''}
      <span class="kf-victim ${victimTeam}">${victim}</span>
    `;
    this.elKillfeed.prepend(item);
    while (this.elKillfeed.children.length > 5) {
      this.elKillfeed.lastElementChild?.remove();
    }
    setTimeout(() => item.remove(), 5500);
  }

  public clearKillfeed(): void {
    this.elKillfeed.innerHTML = '';
  }

  public showBanner(sub: string, title: string, duration = 2.4): void {
    this.elBannerSub.textContent = sub;
    this.elBannerTitle.textContent = title;
    this.elRoundBanner.classList.remove('hidden');
    this.elRoundBanner.style.animation = 'none';
    void this.elRoundBanner.offsetWidth;
    this.elRoundBanner.style.animation = '';
    this.bannerTimer = duration;
  }

  public triggerFlash(strength: number): void {
    this.flashOpacity = Math.max(this.flashOpacity, strength);
  }

  public triggerDamage(relativeAngleRad: number): void {
    this.damageVignette = Math.min(0.9, this.damageVignette + 0.55);
    this.damageArcs.push({ angle: relativeAngleRad, life: 0.75, maxLife: 0.75 });
  }

  public updateVitals(hp: number, shield: number, stimActive: boolean): void {
    const clampedHp = Math.max(0, Math.ceil(hp));
    const clampedShield = Math.max(0, Math.ceil(shield));
    if (clampedHp !== this.lastHp) {
      this.lastHp = clampedHp;
      this.elHp.textContent = String(clampedHp);
      this.elHpBar.style.width = `${clampedHp}%`;
      this.elHpBar.style.background =
        clampedHp <= 30
          ? 'linear-gradient(90deg, #ff3b54, #ff7086)'
          : 'linear-gradient(90deg, #25e5c1, #32e5ff)';
    }
    if (clampedShield !== this.lastShield) {
      this.lastShield = clampedShield;
      this.elShield.textContent = String(clampedShield);
    }
    if (stimActive !== this.lastStim) {
      this.lastStim = stimActive;
      this.elFxStim.style.opacity = stimActive ? '1' : '0';
    }
  }

  public updateWeapon(
    weapon: WeaponDef,
    slotIndex: number,
    mag: number,
    reserve: number,
    isReloading: boolean,
    reloadProgress: number
  ): void {
    const wepKey = `${weapon.id}:${slotIndex}`;
    if (wepKey !== this.lastWeaponKey) {
      this.lastWeaponKey = wepKey;
      this.elWepName.textContent = weapon.name;
      this.elFireMode.textContent = weapon.fireMode;
      document.getElementById('wslot-0')?.classList.toggle('active', slotIndex === 0);
      document.getElementById('wslot-1')?.classList.toggle('active', slotIndex === 1);
      this.lastMag = -99;
      this.lastRes = -99;
    }

    if (mag !== this.lastMag || reserve !== this.lastRes) {
      this.lastMag = mag;
      this.lastRes = reserve;
      this.elMag.textContent = String(mag);
      this.elRes.textContent = String(reserve);
      this.elMag.classList.toggle('low', mag <= Math.ceil(weapon.magSize * 0.25));
    }

    if (isReloading !== this.lastReloading) {
      this.lastReloading = isReloading;
      this.elReloadWrap.classList.toggle('hidden', !isReloading);
    }
    if (isReloading) {
      const circ = 113.1;
      this.elReloadFg.style.strokeDashoffset = String(circ * (1 - reloadProgress));
    }
  }

  public updateAbilities(charges: { frag: number; flash: number; smoke: number }): void {
    const key = `${charges.frag}:${charges.flash}:${charges.smoke}`;
    if (key === this.lastAbKey) return;
    this.lastAbKey = key;

    this.elAbC.classList.toggle('depleted', charges.frag <= 0);
    this.elAbC.classList.remove('active-fx');
    this.elAbQ.classList.toggle('depleted', charges.flash <= 0);
    this.elAbE.classList.toggle('depleted', charges.smoke <= 0);

    const fmt = (n: number) => (n <= 0 ? '○' : n <= 4 ? '●'.repeat(n) : `×${n}`);
    this.elAbCCharges.textContent = fmt(charges.frag);
    this.elAbQCharges.textContent = fmt(charges.flash);
    this.elAbECharges.textContent = fmt(charges.smoke);
  }

  public setTdmMedSlotsVisible(visible: boolean): void {
    this.elAbB.classList.toggle('hidden', !visible);
    this.elAbM.classList.toggle('hidden', !visible);
    document.querySelectorAll<HTMLElement>('.tdm-ctrl-hint').forEach((el) => {
      el.classList.toggle('hidden', !visible);
    });
    if (!visible) {
      this.elHealWrap.classList.add('hidden');
      this.elLootPrompt.classList.add('hidden');
    }
  }

  public updateMedkits(bandages: number, medkits: number, activeKind: 'bandage' | 'medkit' | null): void {
    const key = `${bandages}:${medkits}:${activeKind ?? 'none'}`;
    if (key === this.lastMedKey) return;
    this.lastMedKey = key;

    this.elAbB.classList.toggle('depleted', bandages <= 0);
    this.elAbM.classList.toggle('depleted', medkits <= 0);
    this.elAbB.classList.toggle('healing-active', activeKind === 'bandage');
    this.elAbM.classList.toggle('healing-active', activeKind === 'medkit');

    this.elAbBCharges.textContent = bandages > 0 ? `×${bandages}` : '○';
    this.elAbMCharges.textContent = medkits > 0 ? `×${medkits}` : '○';
  }

  public updateHealProgress(kind: 'bandage' | 'medkit' | null, elapsed: number, duration: number): void {
    if (!kind) {
      if (this.lastHealKey !== '') {
        this.lastHealKey = '';
        this.elHealWrap.classList.add('hidden');
      }
      return;
    }
    const rem = Math.max(0, duration - elapsed).toFixed(1);
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / Math.max(0.01, duration)) * 200) / 2));
    const key = `${kind}:${rem}:${pct}`;
    if (key === this.lastHealKey) return;
    this.lastHealKey = key;

    this.elHealWrap.classList.remove('hidden');
    this.elHealWrap.classList.toggle('medkit', kind === 'medkit');
    this.elHealLabel.textContent =
      kind === 'medkit' ? 'APPLYING MEDKIT (+75 HP)' : 'APPLYING BANDAGE (+25 HP)';
    this.elHealTimer.textContent = `${rem}s`;
    this.elHealFill.style.width = `${pct}%`;
  }

  public updateLootPrompt(victimName: string | null, items: string[]): void {
    const key = victimName ? `${victimName}|${items.join(',')}` : '';
    if (key === this.lastLootKey) return;
    this.lastLootKey = key;

    if (!victimName || items.length === 0) {
      this.elLootPrompt.classList.add('hidden');
      return;
    }
    this.elLootTitle.textContent = `LOOT — ${victimName}'S UTILITIES`;
    this.elLootItems.innerHTML = items.map((t) => `<span class="loot-tag">${t}</span>`).join('');
    this.elLootPrompt.classList.remove('hidden');
  }

  public showToast(text: string, variant: 'heal' | 'loot' | 'warn' = 'heal', duration = 2.2): void {
    this.elPickupToast.textContent = text;
    this.elPickupToast.classList.toggle('warn', variant === 'warn');
    this.elPickupToast.classList.remove('hidden');
    this.toastTimer = duration;
  }

  public updateScoreboard(
    allyScore: number,
    enemyScore: number,
    roundLabel: string,
    timeSec: number,
    allyAlive: boolean[],
    enemyAlive: boolean[]
  ): void {
    const secInt = Math.floor(Math.max(0, timeSec));
    const key = `${allyScore}:${enemyScore}:${roundLabel}:${secInt}:${allyAlive.join('')}:${enemyAlive.join('')}`;
    if (key === this.lastScoreKey) return;
    this.lastScoreKey = key;

    this.elScoreAlly.textContent = String(allyScore);
    this.elScoreEnemy.textContent = String(enemyScore);
    this.elRoundLabel.textContent = roundLabel;

    const mins = Math.floor(secInt / 60);
    const secs = secInt % 60;
    this.elTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    this.renderPips(this.elAllyPips, allyAlive, 'ally');
    this.renderPips(this.elEnemyPips, enemyAlive, 'enemy');
  }

  private renderPips(container: HTMLElement, statuses: boolean[], team: Team): void {
    if (container.children.length !== statuses.length) {
      container.innerHTML = statuses
        .map((a) => `<span class="pip ${team} ${a ? 'alive' : 'dead'}"></span>`)
        .join('');
    } else {
      for (let i = 0; i < statuses.length; i++) {
        const el = container.children[i];
        el.className = `pip ${team} ${statuses[i] ? 'alive' : 'dead'}`;
      }
    }
  }

  public updateZone(name: string): void {
    if (name === this.lastZone) return;
    this.lastZone = name;
    this.elZone.textContent = name;
  }

  public updateFps(fps: number): void {
    this.elPerf.textContent = `${Math.round(fps)} FPS`;
  }

  /**
   * Cryzen.io-style floating cyan teammate nameplates projected cleanly into 2D screen space (visible through walls!)
   */
  public updateNameplates(targets: NameplateTarget[], camera: THREE.PerspectiveCamera): void {
    const activeIds = new Set<string>();
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const t of targets) {
      activeIds.add(t.id);
      let entry = this.nameplateEls.get(t.id);
      if (!entry) {
        const root = document.createElement('div');
        root.className = 'ally-nameplate';
        const tag = document.createElement('div');
        tag.className = 'ally-nameplate-tag';
        tag.textContent = t.name;
        const hpWrap = document.createElement('div');
        hpWrap.className = 'ally-nameplate-hp';
        const hpFill = document.createElement('div');
        hpFill.className = 'ally-nameplate-hp-fill';
        hpWrap.appendChild(hpFill);
        root.appendChild(tag);
        root.appendChild(hpWrap);
        this.elNameplates.appendChild(root);
        entry = { root, tag, hpFill };
        this.nameplateEls.set(t.id, entry);
      }
      entry.tag.textContent = t.name;
      entry.root.classList.toggle('red-team', t.team === 'red');
      entry.root.classList.toggle('loot-tag-3d', t.team === 'loot');

      this.projVec.copy(t.headWorld).project(camera);
      // Hide if behind camera or far offscreen
      if (this.projVec.z > 1 || this.projVec.x < -1.15 || this.projVec.x > 1.15 || this.projVec.y < -1.15 || this.projVec.y > 1.15) {
        entry.root.style.display = 'none';
      } else {
        const sx = (this.projVec.x * 0.5 + 0.5) * w;
        const sy = (-this.projVec.y * 0.5 + 0.5) * h;
        entry.root.style.display = 'flex';
        entry.root.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
        entry.hpFill.style.width = `${Math.round(THREE.MathUtils.clamp(t.hpRatio, 0, 1) * 100)}%`;
      }
    }

    for (const [id, entry] of this.nameplateEls) {
      if (!activeIds.has(id)) {
        entry.root.remove();
        this.nameplateEls.delete(id);
      }
    }
  }

  public showDamageHistory(entries: DamageHistoryEntry[]): void {
    if (entries.length === 0) {
      this.hideDamageHistory();
      return;
    }
    this.elDamageHistoryList.innerHTML = entries
      .map(
        (e) => `
        <div class="dh-row">
          <span class="dh-attacker">${e.isKiller ? '☠ ' : ''}${e.attacker}</span>
          <span class="dh-meta">${Math.round(e.totalDamage)} DMG <span class="dh-hits">(${e.hits} ${e.hits === 1 ? 'hit' : 'hits'})</span></span>
        </div>
      `
      )
      .join('');
    this.elDamageHistory.classList.remove('hidden');
  }

  public hideDamageHistory(): void {
    this.elDamageHistory.classList.add('hidden');
  }

  public tick(dt: number, lowHp: boolean): void {
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) {
        this.elHitmarker.classList.remove('active', 'headshot');
      }
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.elRoundBanner.classList.add('hidden');
      }
    }

    if (this.killEmblemTimer > 0) {
      this.killEmblemTimer -= dt;
      if (this.killEmblemTimer <= 0) {
        this.elKillEmblem.classList.add('hidden');
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.elPickupToast.classList.add('hidden');
      }
    }

    if (this.flashOpacity > 0) {
      this.flashOpacity = Math.max(0, this.flashOpacity - dt * 0.85);
    }
    const fStr = this.flashOpacity.toFixed(2);
    if (fStr !== this.lastFlashStr) {
      this.lastFlashStr = fStr;
      this.elFxFlash.style.opacity = fStr;
    }

    const baseVignette = lowHp ? 0.32 : 0;
    this.damageVignette = Math.max(baseVignette, this.damageVignette - dt * 1.45);
    const dStr = this.damageVignette.toFixed(2);
    if (dStr !== this.lastDmgStr) {
      this.lastDmgStr = dStr;
      this.elFxDmg.style.opacity = dStr;
    }

    // Only draw/clear damage arc canvas when active
    if (this.damageArcs.length > 0 || this.dmgCanvasDirty) {
      const ctx = this.dmgArcCtx;
      ctx.clearRect(0, 0, this.dmgArcCanvas.width, this.dmgArcCanvas.height);
      if (this.damageArcs.length > 0) {
        this.dmgCanvasDirty = true;
        const cx = this.dmgArcCanvas.width / 2;
        const cy = this.dmgArcCanvas.height / 2;
        for (let i = this.damageArcs.length - 1; i >= 0; i--) {
          const arc = this.damageArcs[i];
          arc.life -= dt;
          if (arc.life <= 0) {
            this.damageArcs.splice(i, 1);
            continue;
          }
          const alpha = (arc.life / arc.maxLife) * 0.9;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(arc.angle - Math.PI / 2);
          ctx.strokeStyle = `rgba(255, 59, 84, ${alpha.toFixed(2)})`;
          ctx.lineWidth = 4.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(0, 0, 138, -0.3, 0.3);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        this.dmgCanvasDirty = false;
      }
    }
  }
}
