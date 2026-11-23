import Peer, { DataConnection } from 'peerjs';
import {
  LobbyPlayer,
  LobbyState,
  LobbyTeam,
  MAX_PLAYERS_PER_TEAM,
  MIN_PLAYERS_PER_TEAM,
  MapId,
  WeaponId,
} from '../types';

export interface NetVec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerPoseInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  weaponSlot: number;
}

export interface SnapshotPlayerState extends PlayerPoseInput {
  id: string;
  hp: number;
  shield: number;
  alive: boolean;
  spawnShield: number;
}

export interface WorldSnapshot {
  roundNumber: number;
  roundTimer: number;
  roundActive: boolean;
  blueScore: number;
  redScore: number;
  players: SnapshotPlayerState[];
}

export interface NetShotPayload {
  shooterId: string;
  weaponId: WeaponId;
  weaponName: string;
  muzzle: NetVec3;
  endPoint: NetVec3;
  hitWall: boolean;
  wallNormal?: NetVec3;
  hitTargetId?: string;
  hitZone?: 'head' | 'body' | 'leg';
  hitPoint?: NetVec3;
  shotDir: NetVec3;
  damage?: number;
}

export interface NetOrdnancePayload {
  ownerId: string;
  kind: 'frag' | 'flash' | 'smoke';
  origin: NetVec3;
  dir: NetVec3;
}

export interface UtilityBundle {
  frag: number;
  flash: number;
  smoke: number;
  bandage: number;
  medkit: number;
}

export interface NetHealPayload {
  playerId: string;
  kind: 'bandage' | 'medkit';
}

export interface NetLootSpawnPayload {
  dropId: string;
  victimName: string;
  pos: NetVec3;
  contents: UtilityBundle;
}

export interface NetLootPickupPayload {
  dropId: string;
  pickerId: string;
  pickerName: string;
  contents: UtilityBundle;
}

export interface NetDamagePayload {
  victimId: string;
  attackerId: string;
  attackerName: string;
  attackerPos: NetVec3;
  weaponName: string;
  damage: number;
  hpAfter: number;
  shieldAfter: number;
  headshot: boolean;
}

export interface NetKillPayload {
  victimId: string;
  victimName: string;
  victimTeam: LobbyTeam;
  attackerId: string;
  attackerName: string;
  attackerTeam: LobbyTeam;
  weaponName: string;
  headshot: boolean;
  impulseDir: NetVec3;
  victimPos: NetVec3;
}

export interface RoundSpawnAssignment {
  id: string;
  pos: NetVec3;
  yaw: number;
}

export interface RoundStartPayload {
  roundNumber: number;
  roundTimer: number;
  blueScore: number;
  redScore: number;
  spawns: RoundSpawnAssignment[];
}

export interface RoundEndPayload {
  winner: LobbyTeam | 'draw';
  reason: string;
  blueScore: number;
  redScore: number;
}

export interface MatchEndPayload {
  winner: LobbyTeam;
  blueScore: number;
  redScore: number;
  players: LobbyPlayer[];
}

type WirePacket =
  | { type: 'JOIN_REQ'; playerId: string; name: string }
  | { type: 'WELCOME'; state: LobbyState; assignedId: string }
  | { type: 'JOIN_REJECT'; reason: string }
  | { type: 'SWITCH_TEAM'; playerId: string; team: LobbyTeam }
  | { type: 'LOBBY_STATE'; state: LobbyState }
  | { type: 'LEAVE'; playerId: string }
  | { type: 'HOST_CLOSED' }
  | { type: 'MATCH_START'; state: LobbyState; round: RoundStartPayload }
  | { type: 'ROUND_START'; round: RoundStartPayload }
  | { type: 'ROUND_END'; data: RoundEndPayload }
  | { type: 'MATCH_END'; data: MatchEndPayload }
  | { type: 'RETURN_TO_LOBBY'; state: LobbyState }
  | { type: 'CLIENT_STATE'; playerId: string; pose: PlayerPoseInput }
  | { type: 'WORLD_SNAPSHOT'; snapshot: WorldSnapshot }
  | { type: 'SHOT_EVENT'; shot: NetShotPayload }
  | { type: 'SHOT_FX'; shot: NetShotPayload }
  | { type: 'ORDNANCE_THROW'; data: NetOrdnancePayload }
  | { type: 'DAMAGE_EVENT'; data: NetDamagePayload }
  | { type: 'KILL_EVENT'; data: NetKillPayload }
  | { type: 'HEAL_COMPLETE'; data: NetHealPayload }
  | { type: 'LOOT_SPAWN'; data: NetLootSpawnPayload }
  | { type: 'LOOT_PICKUP_REQ'; dropId: string; pickerId: string }
  | { type: 'LOOT_PICKED'; data: NetLootPickupPayload }
  | { type: 'KEEPALIVE' };

interface LocalEnvelope {
  fromId: string;
  toId: string; // '*' or target playerId
  packet: WirePacket;
}

export interface MultiplayerCallbacks {
  onLobbyState: (state: LobbyState) => void;
  onStatus: (text: string, ready: boolean) => void;
  onError: (msg: string) => void;
  onMatchStart: (state: LobbyState, round: RoundStartPayload) => void;
  onRoundStart: (round: RoundStartPayload) => void;
  onRoundEnd: (data: RoundEndPayload) => void;
  onMatchEnd: (data: MatchEndPayload) => void;
  onReturnToLobby: (state: LobbyState) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onClientPose: (playerId: string, pose: PlayerPoseInput) => void;
  onHostShotReceived: (shot: NetShotPayload) => void;
  onShotFx: (shot: NetShotPayload) => void;
  onOrdnance: (data: NetOrdnancePayload) => void;
  onDamage: (data: NetDamagePayload) => void;
  onKill: (data: NetKillPayload) => void;
  onHostHealReceived: (data: NetHealPayload) => void;
  onLootSpawn: (data: NetLootSpawnPayload) => void;
  onHostLootPickupReq: (dropId: string, pickerId: string) => void;
  onLootPicked: (data: NetLootPickupPayload) => void;
  onPlayerDisconnected: (playerId: string, name: string) => void;
  onHostDisconnected: () => void;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'skyfall-tdm-';
const LEGACY_PEER_PREFIX = 'sunfire-tdm-';

const ICE_CONFIG: RTCConfiguration = {
  iceCandidatePoolSize: 6,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Public OpenRelay TURN/TURNS fallback for friends behind strict home CGNAT / symmetric NAT / mobile 4G/5G
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function generatePlayerId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `p_${Date.now().toString(36)}_${rand}`;
}

export function sanitizePlayerName(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .slice(0, 16)
    .toUpperCase();
}

export function sanitizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export class MultiplayerManager {
  public readonly localPlayerId = generatePlayerId();
  public isHost = false;
  public connected = false;
  public lobbyState: LobbyState | null = null;

  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null; // client -> host
  private clientConns = new Map<string, DataConnection>(); // host -> peerId
  private clientTransport = new Map<string, 'webrtc' | 'local'>();
  private activeClientLink: 'webrtc' | 'local' | null = null;
  private bcChannels: BroadcastChannel[] = [];
  private joinTimeout: number | null = null;
  private joinRetryInterval: number | null = null;
  private hostReconnectTimeout: number | null = null;
  private keepaliveInterval: number | null = null;

  constructor(private cb: MultiplayerCallbacks) {
    window.addEventListener('beforeunload', () => {
      this.sendDisconnectNotice();
    });
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveInterval = window.setInterval(() => {
      if (!this.connected) return;
      if (this.isHost) {
        this.broadcastFromHost({ type: 'KEEPALIVE' });
      } else {
        this.sendToHost({ type: 'KEEPALIVE' });
      }
    }, 5000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval !== null) {
      window.clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  public getLocalPlayer(): LobbyPlayer | null {
    if (!this.lobbyState) return null;
    return this.lobbyState.players.find((p) => p.id === this.localPlayerId) ?? null;
  }

  public canStartMatch(): { ok: boolean; reason: string } {
    if (!this.lobbyState) return { ok: false, reason: 'NO ACTIVE LOBBY' };
    const blue = this.lobbyState.players.filter((p) => p.team === 'blue').length;
    const red = this.lobbyState.players.filter((p) => p.team === 'red').length;
    if (blue < MIN_PLAYERS_PER_TEAM || red < MIN_PLAYERS_PER_TEAM) {
      return {
        ok: false,
        reason: `NEED AT LEAST ${MIN_PLAYERS_PER_TEAM} PLAYER ON BLUE & ${MIN_PLAYERS_PER_TEAM} ON RED`,
      };
    }
    if (blue > MAX_PLAYERS_PER_TEAM || red > MAX_PLAYERS_PER_TEAM) {
      return { ok: false, reason: `MAX ${MAX_PLAYERS_PER_TEAM} PLAYERS PER TEAM` };
    }
    return { ok: true, reason: `READY // BLUE ${blue}v${red} RED` };
  }

  public hostLobby(rawName: string, map: MapId): boolean {
    const name = sanitizePlayerName(rawName);
    if (!name) {
      this.cb.onError('Enter your player name before hosting.');
      return false;
    }

    this.leaveLobby(false);
    const code = generateRoomCode();
    this.isHost = true;
    this.connected = true;
    this.lobbyState = {
      code,
      map,
      inMatch: false,
      players: [
        {
          id: this.localPlayerId,
          name,
          team: 'blue',
          isHost: true,
          slotIndex: 0,
          kills: 0,
          deaths: 0,
        },
      ],
    };

    this.cb.onStatus('INITIALIZING ONLINE LOBBY...', false);
    this.cb.onLobbyState(this.cloneLobbyState());
    this.startKeepalive();

    // 1. Instant same-browser BroadcastChannel link (supports both skyfall-tdm & legacy sunfire-tdm tabs!)
    this.openBroadcastChannel(code);

    // 2. Public WebRTC PeerJS host node with automatic signaling recovery
    this.registerHostPeer(code, name, map);
    return true;
  }

  private registerHostPeer(code: string, name: string, map: MapId): void {
    if (!this.isHost || !this.lobbyState || this.lobbyState.code !== code) return;
    if (this.hostReconnectTimeout !== null) {
      window.clearTimeout(this.hostReconnectTimeout);
      this.hostReconnectTimeout = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    try {
      const peer = new Peer(`${PEER_PREFIX}${code}`, { config: ICE_CONFIG, debug: 0 });
      this.peer = peer;

      peer.on('open', () => {
        if (this.peer !== peer) return;
        this.cb.onStatus('ONLINE // SHARE TEAM CODE WITH FRIENDS', true);
      });

      peer.on('connection', (conn) => {
        this.attachHostWebRtcConn(conn);
      });

      peer.on('disconnected', () => {
        if (this.peer !== peer || peer.destroyed || !this.isHost) return;
        this.cb.onStatus('RECONNECTING SIGNALING...', false);
        try {
          peer.reconnect();
        } catch {
          this.scheduleHostReconnect(code, name, map);
        }
      });

      peer.on('error', (err) => {
        if (this.peer !== peer || !this.isHost) return;
        if (err?.type === 'unavailable-id' && this.lobbyState && !this.lobbyState.inMatch) {
          // Rare code collision — automatically regenerate a clean code and re-host!
          this.hostLobby(name, map);
          return;
        }
        this.cb.onStatus('RECONNECTING ONLINE LOBBY...', false);
        this.scheduleHostReconnect(code, name, map);
      });
    } catch {
      this.cb.onStatus('LOCAL MULTI-TAB READY', true);
    }
  }

  private scheduleHostReconnect(code: string, name: string, map: MapId): void {
    if (this.hostReconnectTimeout !== null || !this.isHost) return;
    this.hostReconnectTimeout = window.setTimeout(() => {
      this.hostReconnectTimeout = null;
      if (!this.isHost || !this.lobbyState || this.lobbyState.code !== code) return;
      this.registerHostPeer(code, name, map);
    }, 2500);
  }

  public joinLobby(rawName: string, rawCode: string): boolean {
    const name = sanitizePlayerName(rawName);
    const code = sanitizeRoomCode(rawCode);
    if (!name) {
      this.cb.onError('Enter your player name before joining.');
      return false;
    }
    if (code.length < 4) {
      this.cb.onError('Enter a valid 6-character Team Code.');
      return false;
    }

    this.leaveLobby(false);
    this.isHost = false;
    this.connected = false;
    this.activeClientLink = null;
    this.cb.onStatus(`CONNECTING TO ${code}...`, false);

    // 1. Try instant BroadcastChannel first (same-origin tabs connect in < 15ms)
    this.openBroadcastChannel(code);
    this.postLocal('*', { type: 'JOIN_REQ', playerId: this.localPlayerId, name });

    // 2. Simultaneously connect over PeerJS WebRTC (with automatic legacy sunfire-tdm- fallback!)
    let triedLegacyPrefix = false;
    let activePrefix = PEER_PREFIX;

    try {
      const peer = new Peer({ config: ICE_CONFIG, debug: 0 });
      this.peer = peer;

      const connectToHost = (prefix: string) => {
        if (this.peer !== peer || this.connected || this.activeClientLink === 'local') return;
        activePrefix = prefix;
        this.cb.onStatus(`LOCATING LOBBY ${code}...`, false);

        if (this.hostConn) {
          try {
            this.hostConn.close();
          } catch {}
          this.hostConn = null;
        }

        const conn = peer.connect(`${prefix}${code}`, {
          reliable: true,
          serialization: 'json',
        });
        this.hostConn = conn;

        const sendJoinReq = () => {
          if (this.connected || this.activeClientLink === 'local' || this.hostConn !== conn) return;
          if (conn.open || conn.dataChannel?.readyState === 'open') {
            try {
              conn.send({ type: 'JOIN_REQ', playerId: this.localPlayerId, name } satisfies WirePacket);
            } catch {}
          }
        };

        const onConnOpen = () => {
          if (this.hostConn !== conn) return;
          if (this.activeClientLink === 'local') {
            try {
              conn.close();
            } catch {}
            return;
          }
          this.cb.onStatus(`JOINING ${code}...`, false);
          sendJoinReq();
          this.clearJoinRetry();
          this.joinRetryInterval = window.setInterval(() => {
            if (this.connected || this.hostConn !== conn) {
              this.clearJoinRetry();
              return;
            }
            sendJoinReq();
          }, 1200);
        };

        conn.on('open', onConnOpen);
        if (conn.open) {
          onConnOpen();
        }
        conn.on('data', (raw) => {
          if (this.activeClientLink === 'local') return;
          this.handleClientPacket(raw as WirePacket, 'webrtc');
        });
        conn.on('close', () => {
          if (this.activeClientLink === 'webrtc' && this.connected) {
            this.handleHostDrop();
          }
        });
        conn.on('error', () => {
          // Handled by peer error / timeout fallback
        });
      };

      peer.on('open', () => {
        if (this.peer !== peer || this.activeClientLink === 'local') return;
        connectToHost(PEER_PREFIX);
      });

      peer.on('error', (err) => {
        if (this.peer !== peer || this.connected || this.activeClientLink === 'local') return;
        if (err?.type === 'peer-unavailable') {
          // If host is still running an older cached tab with sunfire-tdm-, automatically try it!
          if (!triedLegacyPrefix && activePrefix === PEER_PREFIX) {
            triedLegacyPrefix = true;
            connectToHost(LEGACY_PEER_PREFIX);
            return;
          }
          this.clearJoinTimers();
          this.leaveLobby(false);
          this.cb.onError(`Lobby "${code}" not found. Make sure the host is online and check the Team Code.`);
          return;
        }
        if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
          this.cb.onStatus('SIGNALING RETRY...', false);
          try {
            if (!peer.destroyed && peer.disconnected) peer.reconnect();
          } catch {}
        }
      });
    } catch {
      // Fallback relies on BroadcastChannel
    }

    // Also retry BroadcastChannel JOIN_REQ once after 500ms in case local host tab was waking up
    window.setTimeout(() => {
      if (!this.connected && !this.isHost && this.bcChannels.length > 0) {
        this.postLocal('*', { type: 'JOIN_REQ', playerId: this.localPlayerId, name });
      }
    }, 500);

    this.joinTimeout = window.setTimeout(() => {
      if (!this.connected) {
        this.leaveLobby(false);
        this.cb.onError(`Could not reach lobby "${code}". Check the Team Code and make sure the host is online.`);
      }
    }, 18000);

    return true;
  }

  public setMap(map: MapId): void {
    if (!this.isHost || !this.lobbyState) return;
    this.lobbyState.map = map;
    this.broadcastFromHost({ type: 'LOBBY_STATE', state: this.cloneLobbyState() });
    this.cb.onLobbyState(this.cloneLobbyState());
  }

  public switchTeam(team: LobbyTeam): void {
    if (!this.lobbyState || this.lobbyState.inMatch) return;
    if (this.isHost) {
      this.applySwitchTeamOnHost(this.localPlayerId, team);
    } else {
      this.sendToHost({ type: 'SWITCH_TEAM', playerId: this.localPlayerId, team });
    }
  }

  public broadcastMatchStart(round: RoundStartPayload): void {
    if (!this.isHost || !this.lobbyState) return;
    this.lobbyState.inMatch = true;
    for (const p of this.lobbyState.players) {
      p.kills = 0;
      p.deaths = 0;
    }
    const state = this.cloneLobbyState();
    this.broadcastFromHost({ type: 'MATCH_START', state, round });
    this.cb.onMatchStart(state, round);
  }

  public broadcastRoundStart(round: RoundStartPayload): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'ROUND_START', round });
    this.cb.onRoundStart(round);
  }

  public broadcastRoundEnd(data: RoundEndPayload): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'ROUND_END', data });
    this.cb.onRoundEnd(data);
  }

  public broadcastMatchEnd(data: MatchEndPayload): void {
    if (!this.isHost || !this.lobbyState) return;
    this.lobbyState.inMatch = false;
    this.broadcastFromHost({ type: 'MATCH_END', data });
    this.cb.onMatchEnd(data);
  }

  public broadcastReturnToLobby(): void {
    if (!this.isHost || !this.lobbyState) return;
    this.lobbyState.inMatch = false;
    const state = this.cloneLobbyState();
    this.broadcastFromHost({ type: 'RETURN_TO_LOBBY', state });
    this.cb.onReturnToLobby(state);
  }

  public sendLocalPose(pose: PlayerPoseInput): void {
    if (!this.connected || this.isHost) return;
    this.sendToHost({ type: 'CLIENT_STATE', playerId: this.localPlayerId, pose });
  }

  public broadcastSnapshot(snapshot: WorldSnapshot): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'WORLD_SNAPSHOT', snapshot });
  }

  public sendShot(shot: NetShotPayload): void {
    if (!this.connected) return;
    if (this.isHost) {
      this.cb.onHostShotReceived(shot);
    } else {
      this.sendToHost({ type: 'SHOT_EVENT', shot });
    }
  }

  public broadcastShotFx(shot: NetShotPayload, excludeId?: string): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'SHOT_FX', shot }, excludeId);
  }

  public sendOrdnanceThrow(data: NetOrdnancePayload): void {
    if (!this.connected) return;
    if (this.isHost) {
      this.broadcastFromHost({ type: 'ORDNANCE_THROW', data }, data.ownerId);
    } else {
      this.sendToHost({ type: 'ORDNANCE_THROW', data });
    }
  }

  public broadcastDamage(data: NetDamagePayload): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'DAMAGE_EVENT', data });
    this.cb.onDamage(data);
  }

  public broadcastKill(data: NetKillPayload): void {
    if (!this.isHost || !this.lobbyState) return;
    const attacker = this.lobbyState.players.find((p) => p.id === data.attackerId);
    if (attacker && data.attackerId !== data.victimId) attacker.kills += 1;
    const victim = this.lobbyState.players.find((p) => p.id === data.victimId);
    if (victim) victim.deaths += 1;
    this.broadcastFromHost({ type: 'KILL_EVENT', data });
    this.cb.onKill(data);
  }

  public sendHealComplete(kind: 'bandage' | 'medkit'): void {
    if (!this.connected) return;
    const data: NetHealPayload = { playerId: this.localPlayerId, kind };
    if (this.isHost) {
      this.cb.onHostHealReceived(data);
    } else {
      this.sendToHost({ type: 'HEAL_COMPLETE', data });
    }
  }

  public broadcastLootSpawn(data: NetLootSpawnPayload): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'LOOT_SPAWN', data });
    this.cb.onLootSpawn(data);
  }

  public requestLootPickup(dropId: string): void {
    if (!this.connected) return;
    if (this.isHost) {
      this.cb.onHostLootPickupReq(dropId, this.localPlayerId);
    } else {
      this.sendToHost({ type: 'LOOT_PICKUP_REQ', dropId, pickerId: this.localPlayerId });
    }
  }

  public broadcastLootPicked(data: NetLootPickupPayload): void {
    if (!this.isHost) return;
    this.broadcastFromHost({ type: 'LOOT_PICKED', data });
    this.cb.onLootPicked(data);
  }

  public leaveLobby(notify = true): void {
    this.clearJoinTimers();
    if (this.hostReconnectTimeout !== null) {
      window.clearTimeout(this.hostReconnectTimeout);
      this.hostReconnectTimeout = null;
    }
    this.stopKeepalive();
    if (notify) {
      this.sendDisconnectNotice();
    }
    this.connected = false;
    this.isHost = false;
    this.lobbyState = null;
    this.activeClientLink = null;

    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {}
      this.hostConn = null;
    }
    for (const c of this.clientConns.values()) {
      try {
        c.close();
      } catch {}
    }
    this.clientConns.clear();
    this.clientTransport.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    for (const bc of this.bcChannels) {
      try {
        bc.close();
      } catch {}
    }
    this.bcChannels = [];
  }

  private sendDisconnectNotice(): void {
    if (!this.connected) return;
    if (this.isHost) {
      this.broadcastFromHost({ type: 'HOST_CLOSED' });
    } else {
      this.sendToHost({ type: 'LEAVE', playerId: this.localPlayerId });
    }
  }

  private clearJoinRetry(): void {
    if (this.joinRetryInterval !== null) {
      window.clearInterval(this.joinRetryInterval);
      this.joinRetryInterval = null;
    }
  }

  private clearJoinTimers(): void {
    if (this.joinTimeout !== null) {
      window.clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
    this.clearJoinRetry();
  }

  private openBroadcastChannel(code: string): void {
    if (typeof BroadcastChannel === 'undefined') return;
    for (const prefix of [PEER_PREFIX, LEGACY_PEER_PREFIX]) {
      const bc = new BroadcastChannel(`${prefix}${code}`);
      this.bcChannels.push(bc);
      bc.onmessage = (ev) => {
        const env = ev.data as LocalEnvelope | undefined;
        if (!env || env.fromId === this.localPlayerId) return;
        if (env.toId !== '*' && env.toId !== this.localPlayerId) return;
        if (this.isHost) {
          this.handleHostPacket(env.packet, env.fromId, 'local');
        } else {
          this.handleClientPacket(env.packet, 'local');
        }
      };
    }
  }

  private postLocal(toId: string, packet: WirePacket): void {
    for (const bc of this.bcChannels) {
      try {
        bc.postMessage({ fromId: this.localPlayerId, toId, packet } satisfies LocalEnvelope);
      } catch {}
    }
  }

  private attachHostWebRtcConn(conn: DataConnection): void {
    let boundPlayerId: string | null = null;
    conn.on('data', (raw) => {
      const pkt = raw as WirePacket;
      if (pkt.type === 'JOIN_REQ') {
        boundPlayerId = pkt.playerId;
      }
      this.handleHostPacket(pkt, boundPlayerId ?? conn.peer, 'webrtc', conn);
    });
    conn.on('close', () => {
      if (
        boundPlayerId &&
        this.clientTransport.get(boundPlayerId) === 'webrtc' &&
        this.clientConns.get(boundPlayerId) === conn
      ) {
        this.removePlayerFromHost(boundPlayerId);
      }
    });
  }

  private handleHostPacket(
    pkt: WirePacket,
    fromId: string,
    transport: 'webrtc' | 'local',
    conn?: DataConnection
  ): void {
    if (!this.isHost || !this.lobbyState) return;

    if (pkt.type === 'JOIN_REQ') {
      // If the same player retries JOIN_REQ (e.g. missed WELCOME or double-click), refresh their connection & re-send WELCOME!
      if (this.lobbyState.players.some((p) => p.id === pkt.playerId)) {
        this.clientTransport.set(pkt.playerId, transport);
        if (transport === 'webrtc' && conn) {
          this.clientConns.set(pkt.playerId, conn);
        }
        const snapshot = this.cloneLobbyState();
        this.sendDirectFromHost(pkt.playerId, { type: 'WELCOME', state: snapshot, assignedId: pkt.playerId }, transport, conn);
        return;
      }
      if (this.lobbyState.inMatch) {
        this.sendDirectFromHost(pkt.playerId, { type: 'JOIN_REJECT', reason: 'Match is already in progress.' }, transport, conn);
        return;
      }
      const blueCount = this.lobbyState.players.filter((p) => p.team === 'blue').length;
      const redCount = this.lobbyState.players.filter((p) => p.team === 'red').length;
      if (blueCount >= MAX_PLAYERS_PER_TEAM && redCount >= MAX_PLAYERS_PER_TEAM) {
        this.sendDirectFromHost(
          pkt.playerId,
          { type: 'JOIN_REJECT', reason: `Lobby full (max ${MAX_PLAYERS_PER_TEAM} per team).` },
          transport,
          conn
        );
        return;
      }

      // Auto-balance: prefer the team with fewer players (so 2nd joiner immediately goes Red -> 1v1 ready!)
      const assignedTeam: LobbyTeam = redCount <= blueCount && redCount < MAX_PLAYERS_PER_TEAM ? 'red' : 'blue';
      const slotIndex = assignedTeam === 'blue' ? blueCount : redCount;
      const cleanName = sanitizePlayerName(pkt.name) || `OP-${this.lobbyState.players.length + 1}`;

      this.clientTransport.set(pkt.playerId, transport);
      if (transport === 'webrtc' && conn) {
        this.clientConns.set(pkt.playerId, conn);
      }

      this.lobbyState.players.push({
        id: pkt.playerId,
        name: cleanName,
        team: assignedTeam,
        isHost: false,
        slotIndex,
        kills: 0,
        deaths: 0,
      });
      this.reindexTeamSlots();

      const snapshot = this.cloneLobbyState();
      this.sendDirectFromHost(pkt.playerId, { type: 'WELCOME', state: snapshot, assignedId: pkt.playerId }, transport, conn);
      this.broadcastFromHost({ type: 'LOBBY_STATE', state: snapshot }, pkt.playerId);
      this.cb.onLobbyState(snapshot);
      return;
    }

    if (pkt.type === 'SWITCH_TEAM') {
      this.applySwitchTeamOnHost(pkt.playerId, pkt.team);
      return;
    }

    if (pkt.type === 'LEAVE') {
      this.removePlayerFromHost(pkt.playerId);
      return;
    }

    if (pkt.type === 'CLIENT_STATE') {
      this.cb.onClientPose(pkt.playerId, pkt.pose);
      return;
    }

    if (pkt.type === 'SHOT_EVENT') {
      this.cb.onHostShotReceived(pkt.shot);
      return;
    }

    if (pkt.type === 'ORDNANCE_THROW') {
      // Relay to everyone else + spawn locally on Host!
      this.broadcastFromHost({ type: 'ORDNANCE_THROW', data: pkt.data }, pkt.data.ownerId);
      this.cb.onOrdnance(pkt.data);
      return;
    }

    if (pkt.type === 'HEAL_COMPLETE') {
      this.cb.onHostHealReceived(pkt.data);
      return;
    }

    if (pkt.type === 'LOOT_PICKUP_REQ') {
      this.cb.onHostLootPickupReq(pkt.dropId, pkt.pickerId);
      return;
    }

    void fromId;
  }

  private applySwitchTeamOnHost(playerId: string, targetTeam: LobbyTeam): void {
    if (!this.lobbyState || this.lobbyState.inMatch) return;
    const player = this.lobbyState.players.find((p) => p.id === playerId);
    if (!player || player.team === targetTeam) return;
    const targetCount = this.lobbyState.players.filter((p) => p.team === targetTeam).length;
    if (targetCount >= MAX_PLAYERS_PER_TEAM) return;
    player.team = targetTeam;
    this.reindexTeamSlots();
    const state = this.cloneLobbyState();
    this.broadcastFromHost({ type: 'LOBBY_STATE', state });
    this.cb.onLobbyState(state);
  }

  private removePlayerFromHost(playerId: string): void {
    if (!this.lobbyState) return;
    const idx = this.lobbyState.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    const removed = this.lobbyState.players[idx];
    this.lobbyState.players.splice(idx, 1);
    this.clientConns.delete(playerId);
    this.clientTransport.delete(playerId);
    this.reindexTeamSlots();

    const state = this.cloneLobbyState();
    this.broadcastFromHost({ type: 'LOBBY_STATE', state });
    this.cb.onLobbyState(state);
    this.cb.onPlayerDisconnected(removed.id, removed.name);
  }

  private reindexTeamSlots(): void {
    if (!this.lobbyState) return;
    let b = 0;
    let r = 0;
    for (const p of this.lobbyState.players) {
      if (p.team === 'blue') p.slotIndex = b++;
      else p.slotIndex = r++;
    }
  }

  private handleClientPacket(pkt: WirePacket, transport: 'webrtc' | 'local'): void {
    if (this.isHost) return;

    if (pkt.type === 'WELCOME') {
      if (this.connected) return;
      this.clearJoinTimers();
      this.activeClientLink = transport;
      this.connected = true;
      this.lobbyState = pkt.state;
      // Close redundant WebRTC connection if local tab transport already connected
      if (transport === 'local' && this.hostConn) {
        try {
          this.hostConn.close();
        } catch {}
        this.hostConn = null;
      }
      this.cb.onStatus(transport === 'webrtc' ? 'CONNECTED ONLINE' : 'CONNECTED', true);
      this.cb.onLobbyState(this.cloneLobbyState());
      this.startKeepalive();
      return;
    }

    if (pkt.type === 'JOIN_REJECT') {
      this.clearJoinTimers();
      this.leaveLobby(false);
      this.cb.onError(pkt.reason);
      return;
    }

    // Ignore packets arriving on the inactive duplicate transport
    if (this.activeClientLink && transport !== this.activeClientLink) return;

    if (pkt.type === 'HOST_CLOSED') {
      this.handleHostDrop();
      return;
    }

    if (pkt.type === 'LOBBY_STATE') {
      this.lobbyState = pkt.state;
      this.cb.onLobbyState(this.cloneLobbyState());
    } else if (pkt.type === 'MATCH_START') {
      this.lobbyState = pkt.state;
      this.cb.onMatchStart(this.cloneLobbyState(), pkt.round);
    } else if (pkt.type === 'ROUND_START') {
      this.cb.onRoundStart(pkt.round);
    } else if (pkt.type === 'ROUND_END') {
      this.cb.onRoundEnd(pkt.data);
    } else if (pkt.type === 'MATCH_END') {
      if (this.lobbyState) {
        this.lobbyState.inMatch = false;
        this.lobbyState.players = pkt.data.players;
      }
      this.cb.onMatchEnd(pkt.data);
    } else if (pkt.type === 'RETURN_TO_LOBBY') {
      this.lobbyState = pkt.state;
      this.cb.onReturnToLobby(this.cloneLobbyState());
    } else if (pkt.type === 'WORLD_SNAPSHOT') {
      this.cb.onSnapshot(pkt.snapshot);
    } else if (pkt.type === 'SHOT_FX') {
      this.cb.onShotFx(pkt.shot);
    } else if (pkt.type === 'ORDNANCE_THROW') {
      this.cb.onOrdnance(pkt.data);
    } else if (pkt.type === 'DAMAGE_EVENT') {
      this.cb.onDamage(pkt.data);
    } else if (pkt.type === 'KILL_EVENT') {
      this.cb.onKill(pkt.data);
    } else if (pkt.type === 'LOOT_SPAWN') {
      this.cb.onLootSpawn(pkt.data);
    } else if (pkt.type === 'LOOT_PICKED') {
      this.cb.onLootPicked(pkt.data);
    }
  }

  private handleHostDrop(): void {
    this.leaveLobby(false);
    this.cb.onHostDisconnected();
  }

  private sendDirectFromHost(
    targetId: string,
    pkt: WirePacket,
    transport: 'webrtc' | 'local',
    conn?: DataConnection
  ): void {
    if (transport === 'webrtc') {
      const c = conn ?? this.clientConns.get(targetId);
      if (!c) return;
      const ready = c.open || c.dataChannel?.readyState === 'open';
      if (ready) {
        // Drop non-critical pose snapshots if this peer's WebRTC send buffer is backed up (prevents lag buildup!)
        if (pkt.type === 'WORLD_SNAPSHOT' && (c.dataChannel?.bufferedAmount ?? 0) > 32768) {
          return;
        }
        try {
          c.send(pkt);
        } catch {}
      } else if (pkt.type !== 'WORLD_SNAPSHOT') {
        // Never silently drop WELCOME / JOIN_REJECT / LOBBY_STATE / MATCH_START if conn.open lags by a tick!
        c.once('open', () => {
          try {
            c.send(pkt);
          } catch {}
        });
      }
    } else {
      this.postLocal(targetId, pkt);
    }
  }

  private broadcastFromHost(pkt: WirePacket, excludeId?: string): void {
    if (!this.lobbyState) return;
    for (const p of this.lobbyState.players) {
      if (p.id === this.localPlayerId || p.id === excludeId) continue;
      const transport = this.clientTransport.get(p.id);
      if (!transport) continue;
      this.sendDirectFromHost(p.id, pkt, transport);
    }
  }

  private sendToHost(pkt: WirePacket): void {
    if (this.activeClientLink === 'webrtc' && this.hostConn?.open) {
      if (pkt.type === 'CLIENT_STATE' && (this.hostConn.dataChannel?.bufferedAmount ?? 0) > 24576) {
        return;
      }
      try {
        this.hostConn.send(pkt);
      } catch {}
    } else if (this.activeClientLink === 'local') {
      this.postLocal('*', pkt);
    }
  }

  private cloneLobbyState(): LobbyState {
    const s = this.lobbyState!;
    return {
      code: s.code,
      map: s.map,
      inMatch: s.inMatch,
      players: s.players.map((p) => ({ ...p })),
    };
  }
}
