import { randomUUID } from "node:crypto";

import {
  PROTOCOL_VERSION,
  safeParseHubMessage,
  type GameStateMessage,
  type HelloAckMessage,
  type HostHelloMessage,
  type HubMessage,
  type InputMessage,
  type InputValue,
  type PluginLoadedMessage,
  type SessionTerminatedMessage,
  type StartGameMessage,
  type StopGameMessage,
} from "@game-hub/protocol";
import type { GameManifest } from "@game-hub/sdk";
import WebSocket from "ws";

import { PluginRegistry } from "./plugin-registry.js";
import { HostPluginRuntime } from "./plugin-runtime.js";
import { HostSessionStore } from "./store.js";
import type {
  HostDiagnosticEvent,
  HostPlayerSnapshot,
  HostSnapshot,
} from "./types.js";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const DEFAULT_RELAY_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_DIAGNOSTICS = 200;

export interface HostServiceOptions {
  fetchImpl?: typeof fetch;
  heartbeatIntervalMs?: number;
  now?: () => number;
  relayBaseUrl?: string;
  sessionTtlMs?: number;
  webSocketCtor?: typeof WebSocket;
}

type SnapshotListener = (snapshot: HostSnapshot) => void;
type DiagnosticListener = (event: HostDiagnosticEvent) => void;

interface CreateSessionResponse {
  expiresAt: number;
  hostSecret: string;
  joinUrl: string;
  sessionId: string;
  ttlMs: number;
}

interface RelayErrorPayload {
  error?: string;
  message?: string;
}

export class HostService {
  private readonly diagnostics: HostDiagnosticEvent[] = [];
  private readonly diagnosticListeners = new Set<DiagnosticListener>();
  private readonly fetchImpl: typeof fetch;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hostSecret: string | null = null;
  private readonly heartbeatIntervalMs: number;
  private initialized = false;
  private readonly now: () => number;
  private readonly pluginRegistry: PluginRegistry;
  private readonly pluginRuntime: HostPluginRuntime;
  private readonly relayBaseUrl: string;
  private readonly sessionStore: HostSessionStore;
  private readonly sessionTtlMs: number;
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private socket: WebSocket | null = null;
  private stateVersion = 0;
  private readonly webSocketCtor: typeof WebSocket;

  constructor(options: HostServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
    this.relayBaseUrl = options.relayBaseUrl ?? DEFAULT_RELAY_BASE_URL;
    this.sessionStore = new HostSessionStore(this.now());
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.webSocketCtor = options.webSocketCtor ?? WebSocket;
    this.pluginRegistry = new PluginRegistry();
    this.pluginRuntime = new HostPluginRuntime({
      getSnapshot: () => this.sessionStore.getSnapshot(),
      now: this.now,
      onDiagnostic: (level, type, message, data) => {
        this.pushDiagnostic(level, type, message, data);
      },
      onTickStateChange: () => {
        const snapshot = this.syncPluginState(this.now());
        this.publishSnapshot(snapshot, true);
      },
      registry: this.pluginRegistry,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.pluginRuntime.initialize();
    this.initialized = true;
  }

  getAvailableGames(): GameManifest[] {
    return this.pluginRuntime.getAvailableManifests();
  }

  getDiagnostics(): HostDiagnosticEvent[] {
    return this.diagnostics.map((event) => ({
      ...event,
      data: { ...event.data },
    }));
  }

  getSnapshot(): HostSnapshot {
    return this.sessionStore.getSnapshot();
  }

  subscribeDiagnostics(listener: DiagnosticListener): () => void {
    this.diagnosticListeners.add(listener);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  subscribeSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  async restartSession(): Promise<void> {
    await this.stop("session_restart");
    await this.start();
  }

  async selectGame(gameId: string): Promise<void> {
    const manifest = this.getAvailableGames().find(
      (candidate) => candidate.id === gameId,
    );

    if (manifest === undefined) {
      this.pushDiagnostic("warn", "select_game_invalid", `Unknown game: ${gameId}`, {
        gameId,
      });
      return;
    }

    const now = this.now();
    this.sessionStore.setSelectedGame(gameId, now);
    const selectedManifest = await this.pluginRuntime.selectPlugin(gameId);
    const snapshot = this.syncPluginState(now);

    this.pushDiagnostic("info", "game_selected", `Selected game ${gameId}.`, {
      gameId,
    });
    this.sendMessage<PluginLoadedMessage>({
      id: randomUUID(),
      pluginId: gameId,
      sentAt: now,
      type: "plugin_loaded",
      version: selectedManifest.version,
    });
    this.publishSnapshot(snapshot, true);
  }

  async sendPluginAction(action: string, payload?: InputValue): Promise<void> {
    this.pluginRuntime.handleHostAction(action, payload);
    this.pushDiagnostic("info", "plugin_host_action", `Host invoked ${action}.`, {
      action,
      payload,
    });
    const snapshot = this.syncPluginState(this.now());
    this.publishSnapshot(snapshot, true);
  }

  async setModerator(playerId: string): Promise<void> {
    const player = this.getSnapshot().players.find(
      (candidate) => candidate.playerId === playerId,
    );

    if (player === undefined) {
      this.pushDiagnostic(
        "warn",
        "set_moderator_missing_player",
        `Cannot set moderator for missing player ${playerId}.`,
        { playerId },
      );
      return;
    }

    const snapshot = this.sessionStore.setModerator(playerId, this.now());
    this.pushDiagnostic("info", "moderator_set", `Moderator set to ${player.name}.`, {
      playerId,
      playerName: player.name,
    });
    this.publishSnapshot(snapshot, true);
  }

  async start(): Promise<void> {
    await this.initialize();

    this.pushDiagnostic("info", "host_starting", "Creating relay session.", {
      relayBaseUrl: this.relayBaseUrl,
    });
    this.publishSnapshot(
      this.sessionStore.markRelayStatus("creating_session", this.now()),
      false,
    );

    const createResponse = await this.createRelaySession();
    this.hostSecret = createResponse.hostSecret;
    this.publishSnapshot(
      this.sessionStore.resetSession({
        joinUrl: createResponse.joinUrl,
        now: this.now(),
        sessionId: createResponse.sessionId,
      }),
      false,
    );

    await this.pluginRuntime.handleSessionCreated();
    this.publishSnapshot(this.syncPluginState(this.now()), false);

    this.pushDiagnostic("info", "session_created", "Relay session created.", {
      joinUrl: createResponse.joinUrl,
      sessionId: createResponse.sessionId,
    });

    await this.connectRelay(createResponse.sessionId, createResponse.hostSecret);
  }

  async startGame(): Promise<void> {
    const snapshot = this.getSnapshot();

    if (snapshot.selectedGame === null) {
      this.pushDiagnostic("warn", "start_game_missing_selection", "Select a game first.", {});
      return;
    }

    if (!canStartGame(snapshot.lifecycle)) {
      this.pushDiagnostic("warn", "start_game_invalid_state", "Game cannot start in the current state.", {
        lifecycle: snapshot.lifecycle,
      });
      return;
    }

    const now = this.now();
    this.sessionStore.setLifecycle("game_running", now);
    this.pluginRuntime.handleGameStart();
    const nextSnapshot = this.syncPluginState(now);

    this.pushDiagnostic("info", "game_started", `Started ${snapshot.selectedGame}.`, {
      gameId: snapshot.selectedGame,
    });
    this.sendMessage<StartGameMessage>({
      id: randomUUID(),
      pluginId: snapshot.selectedGame,
      seed: now,
      sentAt: now,
      type: "start_game",
    });
    this.publishSnapshot(nextSnapshot, true);
  }

  async stop(reason = "stopped_by_host"): Promise<void> {
    this.clearHeartbeat();

    const snapshot = this.getSnapshot();
    if (snapshot.sessionId === null) {
      this.pluginRuntime.reset();
      this.publishSnapshot(this.sessionStore.terminate(this.now()), false);
      return;
    }

    this.publishSnapshot(this.sessionStore.markClosing(this.now()), false);

    if (snapshot.lifecycle === "game_running") {
      this.pluginRuntime.handleGameStop();
      this.sendMessage<StopGameMessage>({
        id: randomUUID(),
        reason,
        sentAt: this.now(),
        type: "stop_game",
      });
    }

    this.sendMessage<SessionTerminatedMessage>({
      id: randomUUID(),
      reason,
      sentAt: this.now(),
      sessionId: snapshot.sessionId,
      type: "session_terminated",
    });

    if (this.socket !== null) {
      const currentSocket = this.socket;
      this.socket = null;
      currentSocket.removeAllListeners();
      currentSocket.close();
    }

    this.pluginRuntime.reset();
    this.pushDiagnostic("info", "host_stopped", "Host session closed.", {
      reason,
      sessionId: snapshot.sessionId,
    });
    this.publishSnapshot(this.sessionStore.terminate(this.now()), false);
    this.hostSecret = null;
  }

  async stopGame(): Promise<void> {
    const snapshot = this.getSnapshot();

    if (snapshot.lifecycle !== "game_running") {
      this.pushDiagnostic("warn", "stop_game_invalid_state", "No running game to stop.", {
        lifecycle: snapshot.lifecycle,
      });
      return;
    }

    const now = this.now();
    this.sessionStore.setLifecycle("game_finished", now);
    this.pluginRuntime.handleGameStop();
    const nextSnapshot = this.syncPluginState(now);

    this.pushDiagnostic("info", "game_stopped", "Game stopped.", {
      gameId: snapshot.selectedGame,
    });
    this.sendMessage<StopGameMessage>({
      id: randomUUID(),
      reason: "stopped_by_host",
      sentAt: now,
      type: "stop_game",
    });
    this.publishSnapshot(nextSnapshot, true);
  }

  private async connectRelay(
    sessionId: string,
    hostSecret: string,
  ): Promise<void> {
    const relayWebSocketUrl = `${toWebSocketBaseUrl(this.relayBaseUrl)}/ws/host`;
    const socket = new this.webSocketCtor(relayWebSocketUrl);
    this.socket = socket;
    this.publishSnapshot(
      this.sessionStore.markRelayStatus("connecting", this.now()),
      false,
    );

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("message", onMessage);
        socket.off("close", onClose);
        socket.off("error", onError);
      };

      const onOpen = () => {
        const helloMessage: HostHelloMessage = {
          clientKind: "host",
          id: randomUUID(),
          protocolVersion: PROTOCOL_VERSION,
          sentAt: this.now(),
          sessionId,
          token: hostSecret,
          type: "hello",
        };

        socket.send(JSON.stringify(helloMessage));
      };

      const onMessage = (raw: WebSocket.RawData) => {
        const parsed = parseRelayMessage(raw);

        if (parsed === null) {
          this.pushDiagnostic(
            "warn",
            "relay_message_invalid",
            "Received malformed relay payload during host handshake.",
            {},
          );
          return;
        }

        this.handleRelayMessage(parsed);

        if (!settled && parsed.type === "hello_ack") {
          settled = true;
          cleanup();
          resolve();
        }
      };

      const onClose = (code: number) => {
        cleanup();
        this.handleSocketClose(code);

        if (!settled) {
          reject(
            new Error(
              `Relay socket closed before hello_ack (${code}: ${describeSocketClose(code)}).`,
            ),
          );
        }
      };

      const onError = (error: Error) => {
        cleanup();
        this.pushDiagnostic("error", "relay_socket_error", error.message, {
          relayWebSocketUrl,
        });
        this.publishSnapshot(
          this.sessionStore.markRelayStatus("error", this.now()),
          false,
        );

        if (!settled) {
          reject(error);
        }
      };

      socket.on("open", onOpen);
      socket.on("message", onMessage);
      socket.on("close", onClose);
      socket.on("error", onError);
    });

    socket.on("message", (raw: WebSocket.RawData) => {
      const parsed = parseRelayMessage(raw);

      if (parsed === null) {
        this.pushDiagnostic(
          "warn",
          "relay_message_invalid",
          "Received malformed relay payload from relay.",
          {},
        );
        return;
      }

      this.handleRelayMessage(parsed);
    });

    socket.on("close", (code: number) => {
      this.handleSocketClose(code);
    });

    socket.on("error", (error: Error) => {
      this.pushDiagnostic("error", "relay_socket_error", error.message, {});
      this.publishSnapshot(
        this.sessionStore.markRelayStatus("error", this.now()),
        false,
      );
    });

    this.startHeartbeat();
  }

  private async createRelaySession(): Promise<CreateSessionResponse> {
    const response = await this.fetchImpl(`${this.relayBaseUrl}/api/session/create`, {
      body: JSON.stringify({
        ttlMs: this.sessionTtlMs,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const detail = await readRelayErrorDetail(response);
      this.publishSnapshot(
        this.sessionStore.markRelayStatus("error", this.now()),
        false,
      );
      throw new Error(
        detail === null
          ? `Failed to create relay session (${response.status}).`
          : `Failed to create relay session (${response.status}): ${detail}`,
      );
    }

    return (await response.json()) as CreateSessionResponse;
  }

  private buildStateMessage(snapshot: HostSnapshot): GameStateMessage | null {
    if (snapshot.sessionId === null) {
      return null;
    }

    this.stateVersion += 1;

    return {
      id: randomUUID(),
      players: snapshot.players.map((player) => ({
        playerId: player.playerId,
        playerName: player.name,
      })),
      pluginId: snapshot.selectedGame ?? "lobby",
      sentAt: this.now(),
      state: {
        lifecycle: snapshot.lifecycle,
        moderatorId: snapshot.moderatorId,
        players: snapshot.players.map((player) => sanitizePlayer(player)),
        pluginState: snapshot.pluginState,
        relayStatus: snapshot.relayStatus,
        selectedGame: snapshot.selectedGame,
        sessionId: snapshot.sessionId,
      },
      tick: this.stateVersion,
      type: "game_state",
    };
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleRelayMessage(message: HubMessage): void {
    const now = this.now();
    this.sessionStore.noteRelayMessage(now);

    switch (message.type) {
      case "hello_ack": {
        this.pushDiagnostic("info", "relay_connected", "Host connected to relay.", {
          sessionId: message.sessionId,
        });
        this.publishSnapshot(
          this.sessionStore.setLifecycle("lobby", now),
          false,
        );
        this.publishSnapshot(
          this.sessionStore.markRelayStatus("connected", now),
          true,
        );
        return;
      }
      case "heartbeat": {
        return;
      }
      case "player_joined": {
        const playerSnapshot = this.sessionStore.upsertPlayer({
          connected: true,
          lastSeen: now,
          name: message.playerName,
          playerId: message.playerId,
          reconnect: message.reconnect ?? false,
          token: message.playerToken ?? null,
        });
        const player = playerSnapshot.players.find(
          (candidate) => candidate.playerId === message.playerId,
        );

        this.pushDiagnostic(
          "info",
          message.reconnect === true ? "player_reconnected" : "player_joined",
          `${message.playerName} joined the lobby.`,
          {
            playerId: message.playerId,
            reconnect: message.reconnect ?? false,
          },
        );

        if (player !== undefined) {
          this.pluginRuntime.handlePlayerJoined(
            sanitizeGamePlayer(player),
            message.reconnect ?? false,
          );
        }

        this.publishSnapshot(this.syncPluginState(now), true);
        return;
      }
      case "player_left": {
        const playerSnapshot = this.sessionStore.updatePlayerConnection({
          connected: false,
          lastSeen: now,
          playerId: message.playerId,
        });
        const player = playerSnapshot.players.find(
          (candidate) => candidate.playerId === message.playerId,
        );

        this.pushDiagnostic("info", "player_left", `${message.playerId} left the lobby.`, {
          playerId: message.playerId,
          reason: message.reason,
        });

        if (player !== undefined) {
          this.pluginRuntime.handlePlayerLeft(sanitizeGamePlayer(player));
        }

        this.publishSnapshot(this.syncPluginState(now), true);
        return;
      }
      case "input": {
        this.sessionStore.updatePlayerConnection({
          connected: true,
          lastSeen: now,
          playerId: message.playerId,
        });
        const latencyEstimateMs = estimateLatencyMs(now, message.sentAt);
        this.sessionStore.recordPlayerLatency(message.playerId, latencyEstimateMs, now);
        this.pluginRuntime.handleInput(message);

        this.pushDiagnostic("info", "player_input", `${message.playerId} sent ${message.action}.`, {
          action: message.action,
          clientSentAt: message.sentAt,
          hostReceivedAt: now,
          latencyEstimateMs,
          playerId: message.playerId,
        });
        this.publishSnapshot(this.syncPluginState(now), true);
        return;
      }
      case "session_terminated": {
        this.pushDiagnostic("warn", "session_terminated", `Relay terminated the session: ${message.reason}.`, {
          reason: message.reason,
          sessionId: message.sessionId,
        });
        this.clearHeartbeat();
        this.pluginRuntime.reset();
        this.publishSnapshot(this.sessionStore.terminate(now), false);
        return;
      }
      case "error": {
        this.pushDiagnostic("error", "relay_error", message.message, {
          code: message.code,
        });
        this.publishSnapshot(
          this.sessionStore.markRelayStatus("error", now),
          false,
        );
        return;
      }
      default: {
        return;
      }
    }
  }

  private handleSocketClose(code: number): void {
    this.clearHeartbeat();

    const snapshot = this.getSnapshot();
    if (snapshot.lifecycle === "closing" || snapshot.lifecycle === "terminated") {
      return;
    }

    this.pluginRuntime.reset();
    this.pushDiagnostic("warn", "relay_disconnected", `Relay socket closed (${code}: ${describeSocketClose(code)}).`, {
      code,
    });
    this.publishSnapshot(this.sessionStore.terminate(this.now()), false);
  }

  private publishSnapshot(snapshot: HostSnapshot, broadcastToRelay: boolean): void {
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }

    if (broadcastToRelay) {
      const stateMessage = this.buildStateMessage(snapshot);
      if (stateMessage !== null) {
        this.sendMessage(stateMessage);
      }
    }
  }

  private pushDiagnostic(
    level: HostDiagnosticEvent["level"],
    type: string,
    message: string,
    data: Record<string, unknown>,
  ): void {
    const event: HostDiagnosticEvent = {
      data,
      id: randomUUID(),
      level,
      message,
      timestamp: this.now(),
      type,
    };

    this.diagnostics.unshift(event);
    this.diagnostics.splice(MAX_DIAGNOSTICS);

    for (const listener of this.diagnosticListeners) {
      listener(event);
    }
  }

  private sendMessage<
    TMessage extends
      | HelloAckMessage
      | InputMessage
      | PluginLoadedMessage
      | SessionTerminatedMessage
      | StartGameMessage
      | StopGameMessage
      | GameStateMessage,
  >(message: TMessage): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      this.socket.send(
        JSON.stringify({
          id: randomUUID(),
          sentAt: this.now(),
          type: "heartbeat",
        }),
      );
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  private syncPluginState(now: number): HostSnapshot {
    return this.sessionStore.setPluginState(this.pluginRuntime.getPluginState(), now);
  }
}

function canStartGame(lifecycle: HostSnapshot["lifecycle"]): boolean {
  return lifecycle === "lobby" || lifecycle === "game_finished";
}

function describeSocketClose(code: number): string {
  switch (code) {
    case 1000:
      return "normal closure";
    case 4001:
      return "session closed";
    case 4008:
      return "rate limited";
    case 4400:
      return "protocol error";
    case 4401:
      return "authentication failed";
    case 4404:
      return "session not found";
    case 4409:
      return "connection conflict";
    default:
      return "unexpected close";
  }
}

function estimateLatencyMs(hostReceivedAt: number, clientSentAt: number): number {
  return Math.max(0, hostReceivedAt - clientSentAt);
}

function parseRelayMessage(raw: WebSocket.RawData): HubMessage | null {
  try {
    const payload = JSON.parse(rawDataToString(raw)) as unknown;
    const result = safeParseHubMessage(payload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function rawDataToString(raw: WebSocket.RawData): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (raw instanceof Buffer) {
    return raw.toString("utf8");
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(raw)).toString("utf8");
  }

  return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8");
}

async function readRelayErrorDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as RelayErrorPayload;

    if (typeof payload.message === "string" && payload.message.trim() !== "") {
      return payload.message;
    }

    if (typeof payload.error === "string" && payload.error.trim() !== "") {
      return payload.error;
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeGamePlayer(player: HostPlayerSnapshot) {
  return {
    connected: player.connected,
    lastSeen: player.lastSeen,
    name: player.name,
    playerId: player.playerId,
    role: player.role,
    team: player.team,
  };
}

function sanitizePlayer(player: HostPlayerSnapshot): Record<string, unknown> {
  return {
    connected: player.connected,
    lastSeen: player.lastSeen,
    name: player.name,
    playerId: player.playerId,
    role: player.role,
    team: player.team,
  };
}

function toWebSocketBaseUrl(relayBaseUrl: string): string {
  const url = new URL(relayBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}