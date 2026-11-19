import { Team, WeaponDef } from '../types';

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
  private elAbCCharges = document.getElementById('ab-c-charges')!;
  private elAbQCharges = document.getElementById('ab-q-charges')!;
  private elAbECharges = document.getElementById('ab-e-charges')!;

  private hitmarkerTimer = 0;
  private bannerTimer = 0;
  private killEmblemTimer = 0;
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
      for (let i = 0; i < 3; i++) {
        document.getElementById(`wslot-${i}`)?.classList.toggle('active', i === slotIndex);
      }
      this.lastMag = -99;
      this.lastRes = -99;
    }

    if (mag !== this.lastMag || reserve !== this.lastRes) {
      this.lastMag = mag;
      this.lastRes = reserve;
      if (weapon.id === 'knife') {
        this.elMag.textContent = '∞';
        this.elRes.textContent = '';
        this.elMag.classList.remove('low');
      } else {
        this.elMag.textContent = String(mag);
        this.elRes.textContent = String(reserve);
        this.elMag.classList.toggle('low', mag <= Math.ceil(weapon.magSize * 0.25));
      }
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

  public updateAbilities(charges: { stim: number; flash: number; smoke: number }, stimActive: boolean): void {
    const key = `${charges.stim}:${charges.flash}:${charges.smoke}:${stimActive}`;
    if (key === this.lastAbKey) return;
    this.lastAbKey = key;

    this.elAbC.classList.toggle('depleted', charges.stim <= 0 && !stimActive);
    this.elAbC.classList.toggle('active-fx', stimActive);
    this.elAbQ.classList.toggle('depleted', charges.flash <= 0);
    this.elAbE.classList.toggle('depleted', charges.smoke <= 0);

    this.elAbCCharges.textContent = '●'.repeat(charges.stim) || '○';
    this.elAbQCharges.textContent = '●'.repeat(charges.flash) || '○';
    this.elAbECharges.textContent = '●'.repeat(charges.smoke) || '○';
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
