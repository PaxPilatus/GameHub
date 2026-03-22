import { randomUUID } from "node:crypto";

import type { InputMessage, InputValue } from "@game-hub/protocol";
import type {
  GameHostApi,
  GameInputEnvelope,
  GameManifest,
  GamePlayerSnapshot,
  GamePluginDefinition,
  GameSessionSnapshot,
  GameStateRecord,
} from "@game-hub/sdk";

import type { HostDiagnosticEvent, HostSnapshot } from "./types.js";
import type { PluginRegistry } from "./plugin-registry.js";

export interface HostPluginRuntimeOptions {
  getSnapshot: () => HostSnapshot;
  now: () => number;
  onDiagnostic: (
    level: HostDiagnosticEvent["level"],
    type: string,
    message: string,
    data: Record<string, unknown>,
  ) => void;
  onTickStateChange: () => void;
  registry: PluginRegistry;
}

export class HostPluginRuntime {
  private activePlugin: GamePluginDefinition | null = null;
  private manifests: GameManifest[] = [];
  private pluginState: GameStateRecord | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: HostPluginRuntimeOptions;

  constructor(options: HostPluginRuntimeOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    this.manifests = await this.options.registry.listManifests();
  }

  getAvailableManifests(): GameManifest[] {
    return this.manifests.map((manifest) => ({ ...manifest }));
  }

  getPluginState(): GameStateRecord | null {
    return cloneState(this.pluginState);
  }

  async handleSessionCreated(): Promise<void> {
    if (this.activePlugin === null) {
      return;
    }

    this.activePlugin.server.onSessionCreated?.(this.createApi());
  }

  handlePlayerJoined(player: GamePlayerSnapshot, reconnect: boolean): void {
    if (this.activePlugin === null) {
      return;
    }

    const api = this.createApi();

    if (reconnect) {
      this.activePlugin.server.onPlayerReconnect?.(api, player);
      return;
    }

    this.activePlugin.server.onPlayerJoin?.(api, player);
  }

  handlePlayerLeft(player: GamePlayerSnapshot): void {
    if (this.activePlugin === null) {
      return;
    }

    this.activePlugin.server.onPlayerLeave?.(this.createApi(), player);
  }

  handleInput(message: InputMessage): void {
    if (this.activePlugin === null) {
      return;
    }

    const payload = this.parseInput(message);
    const envelope: GameInputEnvelope = {
      action: message.action,
      payload,
      playerId: message.playerId,
      raw: message,
    };

    this.activePlugin.server.onInput?.(this.createApi(), envelope);
  }

  handleHostAction(action: string, payload?: InputValue): void {
    const message: InputMessage = {
      action,
      id: randomUUID(),
      playerId: "host_local",
      sequence: 0,
      sentAt: this.options.now(),
      type: "input",
      ...(payload === undefined ? {} : { value: payload }),
    };

    this.handleInput(message);
  }

  handleGameStart(): void {
    if (this.activePlugin === null) {
      return;
    }

    this.activePlugin.server.onGameStart?.(this.createApi());
    this.startTickLoop();
  }

  handleGameStop(): void {
    this.stopTickLoop();

    if (this.activePlugin === null) {
      return;
    }

    this.activePlugin.server.onGameStop?.(this.createApi());
  }

  async selectPlugin(pluginId: string): Promise<GameManifest> {
    this.stopTickLoop();

    const plugin = await this.options.registry.loadPlugin(pluginId);
    this.activePlugin = plugin;
    this.pluginState = cloneState(plugin.createInitialState());

    const api = this.createApi();
    if (this.options.getSnapshot().sessionId !== null) {
      plugin.server.onSessionCreated?.(api);
    }

    for (const player of api.getPlayers().filter((candidate) => candidate.connected)) {
      plugin.server.onPlayerJoin?.(api, player);
    }

    return { ...plugin.manifest };
  }

  reset(): void {
    this.stopTickLoop();
    this.activePlugin = null;
    this.pluginState = null;
  }

  private createApi(): GameHostApi {
    return {
      getPlayers: () =>
        this.options.getSnapshot().players.map((player) => ({
          connected: player.connected,
          lastSeen: player.lastSeen,
          name: player.name,
          playerId: player.playerId,
          role: player.role,
          team: player.team,
        })),
      getSnapshot: (): GameSessionSnapshot => {
        const snapshot = this.options.getSnapshot();

        return {
          joinUrl: snapshot.joinUrl,
          lastRelayMessageAt: snapshot.lastRelayMessageAt,
          lifecycle: snapshot.lifecycle,
          moderatorId: snapshot.moderatorId,
          players: snapshot.players.map((player) => ({
            connected: player.connected,
            lastSeen: player.lastSeen,
            name: player.name,
            playerId: player.playerId,
            role: player.role,
            team: player.team,
          })),
          pluginState: cloneState(this.pluginState),
          relayStatus: snapshot.relayStatus,
          selectedGame: snapshot.selectedGame,
          sessionId: snapshot.sessionId,
          updatedAt: snapshot.updatedAt,
        };
      },
      getState: () => cloneState(this.pluginState) ?? {},
      log: (level, type, message, data = {}) => {
        this.options.onDiagnostic(level, type, message, data);
      },
      setState: (nextState) => {
        this.pluginState = cloneState(nextState);
      },
      updateState: (updater) => {
        const currentState = cloneState(this.pluginState) ?? {};
        this.pluginState = cloneState(updater(currentState));
      },
    };
  }

  private parseInput(message: InputMessage): InputValue | undefined {
    if (this.activePlugin?.parseInput !== undefined) {
      const parsedValue = this.activePlugin.parseInput(message);
      return isInputValue(parsedValue) ? parsedValue : undefined;
    }

    return message.value;
  }

  private startTickLoop(): void {
    this.stopTickLoop();

    if (
      this.activePlugin === null ||
      this.activePlugin.server.onTick === undefined ||
      this.activePlugin.manifest.tickHz === undefined ||
      this.activePlugin.manifest.tickHz <= 0
    ) {
      return;
    }

    const intervalMs = Math.max(
      16,
      Math.floor(1000 / this.activePlugin.manifest.tickHz),
    );
    this.tickTimer = setInterval(() => {
      if (this.activePlugin === null) {
        return;
      }

      this.activePlugin.server.onTick?.(this.createApi());
      this.options.onTickStateChange();
    }, intervalMs);
    this.tickTimer.unref?.();
  }

  private stopTickLoop(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}

function cloneState(
  state: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return state === null ? null : structuredClone(state);
}

function isInputValue(value: unknown): value is InputValue | undefined {
  return value === undefined || isJsonLike(value);
}

function isJsonLike(value: unknown): value is InputValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonLike(entry));
  }

  if (typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => isJsonLike(entry));
}