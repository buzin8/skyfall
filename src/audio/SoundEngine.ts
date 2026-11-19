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

  public playStimActivate(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [330, 440, 660].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.3);
    });
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
}
