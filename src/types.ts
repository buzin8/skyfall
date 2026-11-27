import * as THREE from 'three';

export type GameMode = 'tactical' | 'clutch' | 'skirmish';
export type Difficulty = 'casual' | 'tactical' | 'radiant';
export type Team = 'ally' | 'enemy';
export type LobbyTeam = 'blue' | 'red';
export type MapId = 'factory' | 'foundry' | 'downtown';
export type WeaponId = 'vandal' | 'scarl' | 'aug' | 'pistol9mm';
export type CharacterId =
  | 'shadow'
  | 'spiderman'
  | 'deadpool'
  | 'gambit'
  | 'rogue'
  | 'luffy'
  | 'naruto'
  | 'bailarina';

export const MAX_PLAYERS_PER_TEAM = 5;
export const MIN_PLAYERS_PER_TEAM = 1;
export const BOT_EMBER_ID = 'bot_ember_red';

export interface LobbyPlayer {
  id: string;
  name: string;
  team: LobbyTeam;
  characterId?: CharacterId;
  isHost: boolean;
  isBot?: boolean;
  slotIndex: number; // 0..4 within team
  kills: number;
  deaths: number;
}

export interface LobbyState {
  code: string;
  map: MapId;
  inMatch: boolean;
  players: LobbyPlayer[];
}

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

export interface RampCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  yAtMinZ: number;
  yAtMaxZ: number;
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
  id: WeaponId;
  name: string;
  fireMode: 'AUTO' | 'SEMI';
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
  map: MapId;
  mode: GameMode;
  difficulty: Difficulty;
  character: CharacterId;
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
