import * as THREE from 'three';
import { MinimapRect, SmokeCloud } from '../types';
import { TacticalAgent } from '../entities/AgentAI';

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private staticLayer: HTMLCanvasElement;
  private w: number;
  private h: number;
  private lastDrawMs = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private rects: MinimapRect[],
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.w = canvas.width;
    this.h = canvas.height;
    this.staticLayer = this.bakeStaticLayer();
  }

  private toMap(x: number, z: number): [number, number] {
    const pad = 12;
    const spanX = this.bounds.maxX - this.bounds.minX;
    const spanZ = this.bounds.maxZ - this.bounds.minZ;
    const nx = (x - this.bounds.minX) / spanX;
    const nz = (z - this.bounds.minZ) / spanZ;
    return [pad + nx * (this.w - pad * 2), pad + nz * (this.h - pad * 2)];
  }

  private bakeStaticLayer(): HTMLCanvasElement {
    const off = document.createElement('canvas');
    off.width = this.w;
    off.height = this.h;
    const ctx = off.getContext('2d')!;

    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    ctx.fillRect(0, 0, this.w, this.h);

    const [fx0, fz0] = this.toMap(this.bounds.minX, this.bounds.minZ);
    const [fx1, fz1] = this.toMap(this.bounds.maxX, this.bounds.maxZ);
    ctx.fillStyle = '#141c26';
    ctx.fillRect(fx0, fz0, fx1 - fx0, fz1 - fz0);

    const [cx0, cz0] = this.toMap(-9.5, -6.0);
    const [cx1, cz1] = this.toMap(9.5, 8.4);
    ctx.fillStyle = 'rgba(40, 216, 255, 0.06)';
    ctx.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const gx = (this.w / 4) * i;
      const gy = (this.h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, this.h);
      ctx.moveTo(0, gy);
      ctx.lineTo(this.w, gy);
      ctx.stroke();
    }

    const scaleX = (this.w - 24) / (this.bounds.maxX - this.bounds.minX);
    const scaleZ = (this.h - 24) / (this.bounds.maxZ - this.bounds.minZ);

    for (const r of this.rects) {
      if (r.kind === 'arch') continue;
      const [mx, mz] = this.toMap(r.x, r.z);
      const rw = Math.max(2, r.w * scaleX);
      const rd = Math.max(2, r.d * scaleZ);
      if (r.kind === 'wall') ctx.fillStyle = '#404c5c';
      else if (r.kind === 'pillar') ctx.fillStyle = '#738296';
      else ctx.fillStyle = '#2d6370';
      ctx.fillRect(mx - rw / 2, mz - rd / 2, rw, rd);
    }

    return off;
  }

  public render(
    playerPos: THREE.Vector3,
    playerYaw: number,
    agents: TacticalAgent[],
    smokes: SmokeCloud[]
  ): void {
    // Throttle radar redraw to ~25 Hz (super smooth while slashing 2D canvas CPU work)
    const now = performance.now();
    if (now - this.lastDrawMs < 38) return;
    this.lastDrawMs = now;

    const ctx = this.ctx;
    ctx.drawImage(this.staticLayer, 0, 0);

    const scaleX = (this.w - 24) / (this.bounds.maxX - this.bounds.minX);

    for (const s of smokes) {
      const [sx, sz] = this.toMap(s.pos.x, s.pos.z);
      const sr = s.radius * scaleX;
      ctx.fillStyle = 'rgba(40, 224, 255, 0.22)';
      ctx.strokeStyle = 'rgba(64, 232, 255, 0.72)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(sx, sz, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const a of agents) {
      if (!a.alive) continue;
      if (a.team === 'enemy' && a.spottedTimer <= 0) continue;
      const [ax, az] = this.toMap(a.pos.x, a.pos.z);
      ctx.fillStyle = a.team === 'ally' ? '#36f0df' : '#ff3d54';
      ctx.beginPath();
      ctx.arc(ax, az, 4.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#090e15';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    const [px, pz] = this.toMap(playerPos.x, playerPos.z);
    const lookAngle = -Math.PI / 2 - playerYaw;

    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(lookAngle);

    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 38);
    grad.addColorStop(0, 'rgba(64, 236, 255, 0.28)');
    grad.addColorStop(1, 'rgba(64, 236, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 38, -0.56, 0.56);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6.8, 0);
    ctx.lineTo(-4.2, -4.2);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-4.2, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
