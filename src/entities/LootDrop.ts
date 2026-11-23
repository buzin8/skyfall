import * as THREE from 'three';
import { UtilityBundle } from '../net/MultiplayerManager';

interface SharedLootAssets {
  matCrate: THREE.MeshStandardMaterial;
  matTrim: THREE.MeshStandardMaterial;
  matWhite: THREE.MeshStandardMaterial;
  matMedRed: THREE.MeshStandardMaterial;
  matOlive: THREE.MeshStandardMaterial;
  matAccent: THREE.MeshStandardMaterial;
  matDiamond: THREE.MeshBasicMaterial;
  geoBody: THREE.BoxGeometry;
  geoLid: THREE.BoxGeometry;
  geoLatch: THREE.BoxGeometry;
  geoStrip: THREE.BoxGeometry;
  geoBadge: THREE.BoxGeometry;
  geoCrossA: THREE.BoxGeometry;
  geoCrossB: THREE.BoxGeometry;
  geoFrag: THREE.SphereGeometry;
  geoSmoke: THREE.CylinderGeometry;
  geoRing: THREE.RingGeometry;
  geoDiamond: THREE.OctahedronGeometry;
}

let sharedAssets: SharedLootAssets | null = null;

function getSharedAssets(): SharedLootAssets {
  if (sharedAssets) return sharedAssets;
  sharedAssets = {
    matCrate: new THREE.MeshStandardMaterial({ color: 0x26323a, roughness: 0.52, metalness: 0.36 }),
    matTrim: new THREE.MeshStandardMaterial({ color: 0x161d24, roughness: 0.45, metalness: 0.62 }),
    matWhite: new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.4, metalness: 0.08 }),
    matMedRed: new THREE.MeshStandardMaterial({
      color: 0xff3b52,
      emissive: 0xd91f38,
      emissiveIntensity: 0.65,
      roughness: 0.36,
      metalness: 0.12,
    }),
    matOlive: new THREE.MeshStandardMaterial({ color: 0x455834, roughness: 0.56, metalness: 0.25 }),
    matAccent: new THREE.MeshStandardMaterial({
      color: 0x2df5b4,
      emissive: 0x1ee5a3,
      emissiveIntensity: 1.25,
      roughness: 0.25,
      metalness: 0.2,
    }),
    matDiamond: new THREE.MeshBasicMaterial({ color: 0x4bffcb, transparent: true, opacity: 0.88 }),
    geoBody: new THREE.BoxGeometry(0.56, 0.22, 0.38),
    geoLid: new THREE.BoxGeometry(0.59, 0.05, 0.41),
    geoLatch: new THREE.BoxGeometry(0.06, 0.09, 0.425),
    geoStrip: new THREE.BoxGeometry(0.46, 0.02, 0.012),
    geoBadge: new THREE.BoxGeometry(0.18, 0.014, 0.18),
    geoCrossA: new THREE.BoxGeometry(0.115, 0.018, 0.036),
    geoCrossB: new THREE.BoxGeometry(0.036, 0.018, 0.115),
    geoFrag: new THREE.SphereGeometry(0.048, 8, 6),
    geoSmoke: new THREE.CylinderGeometry(0.034, 0.034, 0.11, 8),
    geoRing: new THREE.RingGeometry(0.42, 0.52, 24),
    geoDiamond: new THREE.OctahedronGeometry(0.08, 0),
  };
  return sharedAssets;
}

/**
 * Zero-stall pooled 3D tactical utility loot crate dropped when a player dies in Team Death Match.
 * Contains all remaining Frags, Smokes, Flashes, Bandages & Medkits for ANY player to pick up (F).
 */
export class LootDrop {
  public readonly id: string;
  public readonly victimName: string;
  public readonly pos: THREE.Vector3;
  public readonly contents: UtilityBundle;

  private readonly group = new THREE.Group();
  private readonly beaconRing: THREE.Mesh;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly diamond: THREE.Mesh;
  private readonly spawnPhase = Math.random() * Math.PI * 2;

  constructor(
    id: string,
    victimName: string,
    pos: THREE.Vector3,
    contents: UtilityBundle,
    scene: THREE.Scene
  ) {
    this.id = id;
    this.victimName = victimName;
    this.pos = pos.clone();
    this.contents = { ...contents };

    const a = getSharedAssets();
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.random() * Math.PI * 2;

    const body = new THREE.Mesh(a.geoBody, a.matCrate);
    body.position.y = 0.11;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    const lid = new THREE.Mesh(a.geoLid, a.matTrim);
    lid.position.y = 0.235;
    this.group.add(lid);

    for (const sx of [-0.18, 0.18]) {
      const latch = new THREE.Mesh(a.geoLatch, a.matTrim);
      latch.position.set(sx, 0.19, 0);
      this.group.add(latch);
    }

    for (const sz of [-0.194, 0.194]) {
      const strip = new THREE.Mesh(a.geoStrip, a.matAccent);
      strip.position.set(0, 0.14, sz);
      this.group.add(strip);
    }

    const badgeBase = new THREE.Mesh(a.geoBadge, a.matWhite);
    badgeBase.position.set(-0.08, 0.264, 0);
    this.group.add(badgeBase);

    const crossA = new THREE.Mesh(a.geoCrossA, a.matMedRed);
    crossA.position.set(-0.08, 0.268, 0);
    this.group.add(crossA);

    const crossB = new THREE.Mesh(a.geoCrossB, a.matMedRed);
    crossB.position.set(-0.08, 0.268, 0);
    this.group.add(crossB);

    const miniFrag = new THREE.Mesh(a.geoFrag, a.matOlive);
    miniFrag.scale.set(0.92, 1.15, 0.92);
    miniFrag.position.set(0.15, 0.295, -0.06);
    this.group.add(miniFrag);

    const miniSmoke = new THREE.Mesh(a.geoSmoke, a.matTrim);
    miniSmoke.rotation.z = Math.PI * 0.5;
    miniSmoke.position.set(0.14, 0.29, 0.08);
    this.group.add(miniSmoke);

    this.beaconMat = new THREE.MeshBasicMaterial({
      color: 0x32f5be,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beaconRing = new THREE.Mesh(a.geoRing, this.beaconMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.y = 0.025;
    this.group.add(this.beaconRing);

    this.diamond = new THREE.Mesh(a.geoDiamond, a.matDiamond);
    this.diamond.position.y = 0.6;
    this.group.add(this.diamond);

    scene.add(this.group);
  }

  public update(dt: number, elapsed: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.8 + this.spawnPhase);
    this.beaconRing.scale.setScalar(0.95 + pulse * 0.16);
    this.beaconMat.opacity = 0.24 + pulse * 0.34;
    this.diamond.position.y = 0.58 + Math.sin(elapsed * 3.2 + this.spawnPhase) * 0.07;
    this.diamond.rotation.y += dt * 2.1;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.beaconMat.dispose();
  }
}
