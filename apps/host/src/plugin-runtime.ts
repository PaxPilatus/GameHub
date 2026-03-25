import { randomUUID } from "node:crypto";

import type { InputMessage, InputValue } from "@game-hub/protocol";
import type {
  GameHostApi,
  GameInputEnvelope,
  GameManifest,
  GamePlayerSnapshot,
  GamePluginDefinition,
  GameResultEvent,
  GameStateRecord,
  GameUiBadge,
  GameUiOverlay,
  HubSessionState,
} from "@game-hub/sdk";

import type { HostDiagnosticEvent, HostSnapshot } from "./types.js";
import type { PluginRegistry } from "./plugin-registry.js";

const DEFAULT_SLOW_PLUGIN_HOOK_THRESHOLD_MS = 50;

export interface HostPluginRuntimeOptions {
  applyResultEvent: (event: GameResultEvent, now: number) => void;
  getSnapshot: () => HostSnapshot;
  now: () => number;
  onDiagnostic: (
    level: HostDiagnosticEvent["level"],
    type: string,
    message: string,
    data: Record<string, unknown>,
  ) => void;
  onTickStateChange: () => void;
  publishStatusBadges: (badges: GameUiBadge[], now: number) => void;
  registry: PluginRegistry;
  setOverlay: (overlay: GameUiOverlay | null, now: number) => void;
}

export class HostPluginRuntime {
  private activePlugin: GamePluginDefinition | null = null;
  private gameState: GameStateRecord | null = null;
  private manifests: GameManifest[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: HostPluginRuntimeOptions;

  constructor(options: HostPluginRuntimeOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    this.manifests = await this.options.registry.listManifests();
  }

  getActivePlugin(): GamePluginDefinition | null {
    return this.activePlugin;
  }

  getAvailableManifests(): GameManifest[] {
    return this.manifests.map((manifest) => ({ ...manifest }));
  }

  getGameState(): GameStateRecord | null {
    return cloneState(this.gameState);
  }

  async handleSessionCreated(): Promise<void> {
    if (this.activePlugin === null) {
      return;
    }

    this.runPluginHook("onSessionCreated", () => {
      this.activePlugin?.server.onSessionCreated?.(this.createApi());
    });
  }

  handlePlayerJoined(player: GamePlayerSnapshot, reconnect: boolean): void {
    if (this.activePlugin === null) {
      return;
    }

    const api = this.createApi();

    if (reconnect) {
      this.runPluginHook("onPlayerReconnect", () => {
        this.activePlugin?.server.onPlayerReconnect?.(api, player);
      });
      return;
    }

    this.runPluginHook("onPlayerJoin", () => {
      this.activePlugin?.server.onPlayerJoin?.(api, player);
    });
  }

  handlePlayerLeft(player: GamePlayerSnapshot): void {
    if (this.activePlugin === null) {
      return;
    }

    this.runPluginHook("onPlayerLeave", () => {
      this.activePlugin?.server.onPlayerLeave?.(this.createApi(), player);
    });
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

    this.runPluginHook("onInput", () => {
      this.activePlugin?.server.onInput?.(this.createApi(), envelope);
    });
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

    this.runPluginHook("onGameStart", () => {
      this.activePlugin?.server.onGameStart?.(this.createApi());
    });
    this.startTickLoop();
  }

  handleGameStop(): void {
    this.stopTickLoop();

    if (this.activePlugin === null) {
      return;
    }

    this.runPluginHook("onGameStop", () => {
      this.activePlugin?.server.onGameStop?.(this.createApi());
    });
  }

  async selectPlugin(pluginId: string): Promise<GameManifest> {
    this.stopTickLoop();

    const plugin = await this.options.registry.loadPlugin(pluginId);
    return this.activatePlugin(plugin);
  }

  async reinitializeActivePlugin(): Promise<GameManifest | null> {
    if (this.activePlugin === null) {
      return null;
    }

    this.stopTickLoop();
    return this.activatePlugin(this.activePlugin);
  }

  reset(): void {
    this.stopTickLoop();
    this.activePlugin = null;
    this.gameState = null;
  }

  private activatePlugin(plugin: GamePluginDefinition): GameManifest {
    this.activePlugin = plugin;
    this.gameState = cloneState(plugin.createInitialState());

    const api = this.createApi();
    if (this.options.getSnapshot().sessionId !== null) {
      this.runPluginHook("onSessionCreated", () => {
        plugin.server.onSessionCreated?.(api);
      });
    }

    for (const player of api.getPlayers().filter((candidate) => candidate.connected)) {
      this.runPluginHook("onPlayerJoin", () => {
        plugin.server.onPlayerJoin?.(api, player);
      });
    }

    return { ...plugin.manifest };
  }

  private createApi(): GameHostApi {
    return {
      getPlayers: () => this.getPlayers(),
      getSnapshot: (): HubSessionState => buildHubSessionSnapshot(this.options.getSnapshot()),
      getState: () => cloneState(this.gameState) ?? {},
      log: (level, type, message, data = {}) => {
        this.options.onDiagnostic(level, type, message, data);
      },
      results: {
        awardPlayerPoints: (playerId, points) => {
          this.dispatchResultEvent({ playerId, points, type: "award_player_points" });
        },
        awardTeamPoints: (team, points) => {
          this.dispatchResultEvent({ points, team, type: "award_team_points" });
        },
        clearLeaderboard: () => {
          this.dispatchResultEvent({ type: "clear_leaderboard" });
        },
        endMatch: (summary) => {
          this.dispatchResultEvent({ ...summary, type: "end_match" });
        },
        endRound: (summary) => {
          this.dispatchResultEvent({ ...summary, type: "end_round" });
        },
        recordPlayerWin: (playerId) => {
          this.dispatchResultEvent({ playerId, type: "record_player_win" });
        },
        recordPlacement: (playerId, placement) => {
          this.dispatchResultEvent({ placement, playerId, type: "record_placement" });
        },
        setPlayerScore: (playerId, score) => {
          this.dispatchResultEvent({ playerId, points: score, type: "set_player_score" });
        },
        setPlayerStatus: (playerId, status) => {
          this.dispatchResultEvent({ playerId, status, type: "set_player_status" });
        },
        setTeamScore: (team, score) => {
          this.dispatchResultEvent({ points: score, team, type: "set_team_score" });
        },
      },
      session: {
        getLeaderboard: () =>
          this.options.getSnapshot().leaderboard.map((entry) => ({ ...entry })),
        getModeratorId: () => this.options.getSnapshot().moderatorId,
        getPlayers: () => this.getPlayers(),
        getSnapshot: () => buildHubSessionSnapshot(this.options.getSnapshot()),
        setPlayerStatus: (playerId, status) => {
          this.dispatchResultEvent({ playerId, status, type: "set_player_status" });
        },
      },
      setState: (nextState) => {
        this.gameState = cloneState(nextState);
      },
      state: {
        get: () => cloneState(this.gameState) ?? {},
        set: (nextState) => {
          this.gameState = cloneState(nextState);
        },
        update: (updater) => {
          const currentState = cloneState(this.gameState) ?? {};
          this.gameState = cloneState(updater(currentState));
        },
      },
      ui: {
        clearOverlay: () => {
          this.options.setOverlay(null, this.options.now());
        },
        publishStatusBadges: (badges) => {
          this.options.publishStatusBadges(badges, this.options.now());
        },
        setOverlay: (overlay) => {
          this.options.setOverlay(overlay, this.options.now());
        },
      },
      updateState: (updater) => {
        const currentState = cloneState(this.gameState) ?? {};
        this.gameState = cloneState(updater(currentState));
      },
    };
  }

  private dispatchResultEvent(event: GameResultEvent): void {
    this.options.applyResultEvent(event, this.options.now());
  }

  private getPlayers(): GamePlayerSnapshot[] {
    return this.options.getSnapshot().players.map((player) => ({
      connected: player.connected,
      lastSeen: player.lastSeen,
      name: player.name,
      playerId: player.playerId,
      role: player.role,
      team: player.team,
    }));
  }

  private parseInput(message: InputMessage): InputValue | undefined {
    if (this.activePlugin?.parseInput !== undefined) {
      const parsedValue = this.activePlugin.parseInput(message);
      return isInputValue(parsedValue) ? parsedValue : undefined;
    }

    return message.value;
  }

  private runPluginHook(
    hookName: string,
    callback: () => void,
    thresholdMs = DEFAULT_SLOW_PLUGIN_HOOK_THRESHOLD_MS,
  ): void {
    const activePlugin = this.activePlugin;

    if (activePlugin === null) {
      return;
    }

    const startedAt = this.options.now();
    callback();
    const durationMs = this.options.now() - startedAt;

    if (durationMs < thresholdMs) {
      return;
    }

    this.options.onDiagnostic(
      "warn",
      "plugin_hook_slow",
      `${activePlugin.manifest.id} ${hookName} took ${durationMs}ms.`,
      {
        durationMs,
        hook: hookName,
        pluginId: activePlugin.manifest.id,
        thresholdMs,
      },
    );
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

      this.runPluginHook(
        "onTick",
        () => {
          this.activePlugin?.server.onTick?.(this.createApi());
        },
        Math.max(DEFAULT_SLOW_PLUGIN_HOOK_THRESHOLD_MS, intervalMs),
      );
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

function buildHubSessionSnapshot(snapshot: HostSnapshot): HubSessionState {
  return {
    joinUrl: snapshot.joinUrl,
    lastRelayMessageAt: snapshot.lastRelayMessageAt,
    leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry })),
    lifecycle: snapshot.lifecycle,
    matchStatus: { ...snapshot.matchStatus },
    moderatorId: snapshot.moderatorId,
    overlay: snapshot.overlay === null ? null : { ...snapshot.overlay },
    players: snapshot.players.map((player) => ({
      connected: player.connected,
      lastSeen: player.lastSeen,
      name: player.name,
      playerId: player.playerId,
      role: player.role,
      team: player.team,
    })),
    relayStatus: snapshot.relayStatus,
    selectedGame: snapshot.selectedGame,
    sessionId: snapshot.sessionId,
    statusBadges: snapshot.statusBadges.map((badge) => ({ ...badge })),
    updatedAt: snapshot.updatedAt,
  };
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
