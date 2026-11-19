import * as THREE from 'three';

export type GameMode = 'tactical' | 'clutch' | 'skirmish';
export type Difficulty = 'casual' | 'tactical' | 'radiant';
export type Team = 'ally' | 'enemy';

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  blocksSight?: boolean;
  label?: string;
}

export interface MinimapRect {
  x: number;
  z: number;
  w: number;
  d: number;
  kind: 'wall' | 'pillar' | 'crate' | 'arch';
}

export interface Waypoint {
  id: number;
  pos: THREE.Vector3;
  neighbors: number[];
  cover?: boolean;
  zone: string;
}

export interface WeaponDef {
  id: 'vandal';
  name: string;
  fireMode: 'AUTO';
  damageBody: number;
  damageHead: number;
  damageLeg: number;
  fireRate: number; // rounds per second
  magSize: number;
  reserveMax: number;
  reloadTime: number; // seconds
  baseSpread: number; // radians while standing still
  moveSpread: number; // added spread while running
  crouchMult: number; // spread multiplier while crouched
  adsMult: number; // spread multiplier while ADS
  adsFov: number;
  recoilPitch: number;
  recoilYaw: number;
  equipTime: number;
  moveSpeedMult: number;
  automatic: boolean;
  range: number;
}

export interface GameSettings {
  mode: GameMode;
  difficulty: Difficulty;
  sensitivity: number;
  volume: number;
  crosshairColor: string;
}

export interface SmokeCloud {
  id: number;
  pos: THREE.Vector3;
  radius: number;
  remaining: number;
  maxDuration: number;
  mesh: THREE.Group;
}

export interface ZoneDef {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
