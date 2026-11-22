export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.75;
  private ambientStarted = false;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 1.5);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.ambientStarted) {
      this.startCourtyardAmbience();
      this.ambientStarted = true;
    }
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private startCourtyardAmbience(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    // Subtle warm desert-courtyard breeze
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.018;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  public playVandalShot(distanceAttenuation = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, distanceAttenuation));

    // 1. Punchy low-end body thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.65 * vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);

    // 2. Crisp mechanical crack (high-mid transient)
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(1850, now);
    crackFilter.frequency.exponentialRampToValueAtTime(620, now + 0.08);
    crackFilter.Q.value = 1.1;

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.72 * vol, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.masterGain);
    crack.start(now);
    crack.stop(now + 0.15);

    // 3. Courtyard stone slapback tail
    const tail = this.ctx.createBufferSource();
    tail.buffer = this.noiseBuffer;
    const tailFilter = this.ctx.createBiquadFilter();
    tailFilter.type = 'lowpass';
    tailFilter.frequency.value = 1100;

    const tailGain = this.ctx.createGain();
    tailGain.gain.setValueAtTime(0.001, now);
    tailGain.gain.linearRampToValueAtTime(0.18 * vol, now + 0.045);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    tail.connect(tailFilter);
    tailFilter.connect(tailGain);
    tailGain.connect(this.masterGain);
    tail.start(now + 0.025);
    tail.stop(now + 0.36);
  }

  /**
   * Crisp high-velocity 5.56mm SCAR-L gunshot with tighter supersonic snap & sharp mechanical bolt clack.
   */
  public playScarShot(distanceAttenuation = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, distanceAttenuation));

    // 1. Tight 5.56 chamber punch (higher & faster decay than 7.62 AKM)
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.068);

    const oscFilter = this.ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = 620;

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.48 * vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);

    // 2. Razor-crisp supersonic 5.56 muzzle crack
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(2650, now);
    crackFilter.frequency.exponentialRampToValueAtTime(980, now + 0.065);
    crackFilter.Q.value = 1.35;

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.76 * vol, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.masterGain);
    crack.start(now);
    crack.stop(now + 0.12);

    // 3. Subtle metallic SCAR reciprocating bolt clack
    const bolt = this.ctx.createOscillator();
    bolt.type = 'triangle';
    bolt.frequency.setValueAtTime(1420, now + 0.014);
    bolt.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    const boltGain = this.ctx.createGain();
    boltGain.gain.setValueAtTime(0.001, now);
    boltGain.gain.linearRampToValueAtTime(0.14 * vol, now + 0.016);
    boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    bolt.connect(boltGain);
    boltGain.connect(this.masterGain);
    bolt.start(now);
    bolt.stop(now + 0.055);
  }

  public playGhostShot(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Silenced snappy sidearm pop
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.055);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.38, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);

    const puff = this.ctx.createBufferSource();
    puff.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 2200;

    const puffGain = this.ctx.createGain();
    puffGain.gain.setValueAtTime(0.32, now);
    puffGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    puff.connect(bp);
    bp.connect(puffGain);
    puffGain.connect(this.masterGain);
    puff.start(now);
    puff.stop(now + 0.07);
  }

  public playKnifeSwing(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(520, now + 0.14);
    filter.Q.value = 2.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.17);
  }

  public playReload(stage: 'start' | 'mid' | 'done'): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';

    if (stage === 'start') {
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.06);
      filter.frequency.value = 900;
    } else if (stage === 'mid') {
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.06);
      filter.frequency.value = 1400;
    } else {
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(1240, now + 0.07);
      filter.frequency.value = 2100;
    }

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playHit(headshot: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    if (headshot) {
      // Iconic Valorant crisp metallic headshot "dink"
      const freqs = [1560, 2340, 3120];
      freqs.forEach((f, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.94, now + 0.14);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(idx === 0 ? 0.28 : 0.16, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.17);
      });
    } else {
      // Crisp body tick
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.24, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.065);
    }
  }

  public playKillChime(streak: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Escalating pentatonic Valorant-like kill chime
    const scale = [523.25, 659.25, 783.99, 987.77, 1318.51];
    const base = scale[Math.min(Math.max(streak - 1, 0), scale.length - 1)];

    [1, 1.5].forEach((mult, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(base * mult, now + idx * 0.035);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now + idx * 0.035);
      g.gain.linearRampToValueAtTime(idx === 0 ? 0.24 : 0.18, now + idx * 0.035 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + idx * 0.035);
      osc.stop(now + 0.58);
    });
  }

  public playFootstep(crouched: boolean): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340 + Math.random() * 140;
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    const peak = crouched ? 0.04 : 0.13;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.07);
  }

  public playDamageTaken(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 450;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playFlashPop(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2900, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.35);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.42);

    const burst = this.ctx.createBufferSource();
    burst.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.42, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    burst.connect(hp);
    hp.connect(bg);
    bg.connect(this.masterGain);
    burst.start(now);
    burst.stop(now + 0.25);
  }

  public playSmokeDeploy(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(920, now);
    lp.frequency.exponentialRampToValueAtTime(280, now + 0.55);
    lp.Q.value = 0.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    src.connect(lp);
    lp.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.68);
  }

  public playGrenadeThrow(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Metallic pin pull click
    const pin = this.ctx.createOscillator();
    pin.type = 'triangle';
    pin.frequency.setValueAtTime(1950, now);
    pin.frequency.exponentialRampToValueAtTime(980, now + 0.035);
    const pinGain = this.ctx.createGain();
    pinGain.gain.setValueAtTime(0.16, now);
    pinGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    pin.connect(pinGain);
    pinGain.connect(this.masterGain);
    pin.start(now);
    pin.stop(now + 0.05);

    // Snappy underhand/overhand throw whoosh
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now + 0.03);
    bp.frequency.exponentialRampToValueAtTime(380, now + 0.19);
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now + 0.03);
    g.gain.linearRampToValueAtTime(0.24, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    src.start(now + 0.03);
    src.stop(now + 0.24);
  }

  public playGrenadeBounce(strength = 1): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.04, Math.min(1, strength));
    const freqs = [1180 + Math.random() * 180, 2140 + Math.random() * 240];
    freqs.forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, now + 0.055);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime((i === 0 ? 0.16 : 0.09) * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.07);
    });
  }

  public playFragExplosion(distanceAttenuation = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.15, Math.min(1, distanceAttenuation));

    // 1. Massive sub-bass concussion drop
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.95 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.75);

    // 2. Initial sharp shrapnel crack
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2200, now);
    hp.frequency.exponentialRampToValueAtTime(420, now + 0.22);
    hp.Q.value = 0.7;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.75 * vol, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    crack.connect(hp);
    hp.connect(crackGain);
    crackGain.connect(this.masterGain);
    crack.start(now);
    crack.stop(now + 0.28);

    // 3. Roaring low-passed explosion body & industrial foundry echo tail
    const roar = this.ctx.createBufferSource();
    roar.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(980, now);
    lp.frequency.exponentialRampToValueAtTime(140, now + 1.1);
    const roarGain = this.ctx.createGain();
    roarGain.gain.setValueAtTime(0.88 * vol, now);
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    roar.connect(lp);
    lp.connect(roarGain);
    roarGain.connect(this.masterGain);
    roar.start(now);
    roar.stop(now + 1.3);
  }

  public playRoundHorn(victory: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = victory ? [392, 493.88, 587.33] : [311.13, 277.18, 220];
    notes.forEach((n, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, now + i * 0.11);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now + i * 0.11);
      g.gain.linearRampToValueAtTime(0.22, now + i * 0.11 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.52);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.55);
    });
  }

  public playHealStart(isMedkit: boolean): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Tactile bandage wrap / medkit zipper sound
    const rustle = this.ctx.createBufferSource();
    rustle.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isMedkit ? 1400 : 2100, now);
    bp.frequency.linearRampToValueAtTime(isMedkit ? 900 : 1450, now + 0.24);
    bp.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    rustle.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    rustle.start(now);
    rustle.stop(now + 0.3);

    const tone = this.ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(isMedkit ? 440 : 520, now);
    tone.frequency.exponentialRampToValueAtTime(isMedkit ? 540 : 620, now + 0.14);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.08, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    tone.connect(tg);
    tg.connect(this.masterGain);
    tone.start(now);
    tone.stop(now + 0.18);
  }

  public playHealComplete(isMedkit: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = isMedkit ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.07;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.17, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playPickup(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const freqs = [460, 690, 920];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.045;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }
}
